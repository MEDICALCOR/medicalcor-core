/**
 * Real-Time Pattern Stream - Stream Processing for Behavioral Pattern Detection
 *
 * L5: Enables real-time pattern updates when episodic events are processed,
 * replacing batch-only pattern detection with incremental stream processing.
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';
import {
  DEFAULT_REALTIME_STREAM_CONFIG,
  DEFAULT_COGNITIVE_CONFIG,
  type RealtimePatternStreamConfig,
  type CognitiveSystemConfig,
  type EpisodicEvent,
  type BehavioralPattern,
  type PatternDelta,
  type PatternUpdateEvent,
  type PatternUpdateCallback,
  type PatternChangeType,
  type RealtimePatternStats,
  type SubjectEventBuffer,
  type SubjectType,
} from './types.js';
import { PatternDetector } from './pattern-detector.js';
import type { IOpenAIClient } from './episode-builder.js';

const logger = createLogger({ name: 'cognitive-realtime-pattern-stream' });

// =============================================================================
// Realtime Pattern Stream Service
// =============================================================================

export class RealtimePatternStream {
  private config: RealtimePatternStreamConfig;
  private cognitiveConfig: CognitiveSystemConfig;
  private patternDetector: PatternDetector;
  private callbacks = new Set<PatternUpdateCallback>();
  private subjectBuffers = new Map<string, SubjectEventBuffer>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private stats: RealtimePatternStats;
  private processingTimes: number[] = [];

  constructor(
    private pool: Pool,
    openai?: IOpenAIClient,
    config: Partial<RealtimePatternStreamConfig> = {},
    cognitiveConfig: Partial<CognitiveSystemConfig> = {}
  ) {
    this.config = { ...DEFAULT_REALTIME_STREAM_CONFIG, ...config };
    this.cognitiveConfig = { ...DEFAULT_COGNITIVE_CONFIG, ...cognitiveConfig };
    this.patternDetector = new PatternDetector(pool, openai, {
      ...this.cognitiveConfig,
      // Override LLM patterns based on realtime config
      enableLLMPatterns: this.config.enableRealtimeLLMPatterns,
    });
    this.stats = this.initializeStats();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Process a new episodic event and trigger pattern detection
   * This is the main entry point for real-time pattern updates
   */
  async processEvent(event: EpisodicEvent): Promise<PatternUpdateEvent | null> {
    if (!this.config.enabled) {
      return null;
    }

    const startTime = Date.now();
    const bufferKey = this.getBufferKey(event.subjectType, event.subjectId);

    try {
      // Add event to buffer
      this.addToBuffer(event);
      this.stats.totalEventsProcessed++;

      // Check if we should process now or debounce
      const buffer = this.subjectBuffers.get(bufferKey);
      if (!buffer) return null;

      // Force flush if buffer is full
      if (buffer.events.length >= this.config.maxEventBufferSize) {
        return await this.flushBuffer(bufferKey);
      }

      // Debounce rapid events
      if (this.config.debounceWindowMs > 0) {
        return await this.scheduleDebounceFlush(bufferKey);
      }

      // Process immediately if no debounce
      return await this.flushBuffer(bufferKey);
    } catch (error) {
      logger.error(
        { error, subjectId: event.subjectId, eventId: event.id },
        'Failed to process event for real-time patterns'
      );
      return null;
    } finally {
      this.recordProcessingTime(Date.now() - startTime);
    }
  }

  /**
   * Subscribe to pattern update events
   */
  subscribe(callback: PatternUpdateCallback): () => void {
    this.callbacks.add(callback);
    logger.debug({ callbackCount: this.callbacks.size }, 'Pattern update callback subscribed');

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
      logger.debug({ callbackCount: this.callbacks.size }, 'Pattern update callback unsubscribed');
    };
  }

  /**
   * Force immediate pattern detection for a subject
   */
  async forcePatternUpdate(
    subjectType: SubjectType,
    subjectId: string
  ): Promise<PatternUpdateEvent | null> {
    const bufferKey = this.getBufferKey(subjectType, subjectId);

    // Cancel any pending debounce
    this.cancelDebounce(bufferKey);

    // Flush existing buffer if any
    if (this.subjectBuffers.has(bufferKey)) {
      return await this.flushBuffer(bufferKey);
    }

    // Run full pattern detection even without buffered events
    return await this.runPatternDetection(subjectType, subjectId, []);
  }

  /**
   * Get current statistics
   */
  getStats(): RealtimePatternStats {
    // Update dynamic stats
    this.stats.bufferedEventCount = Array.from(this.subjectBuffers.values()).reduce(
      (sum, buffer) => sum + buffer.events.length,
      0
    );
    this.stats.activeSubjects = this.subjectBuffers.size;
    this.stats.avgProcessingTimeMs =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
        : 0;

    return { ...this.stats };
  }

  /**
   * Clear all buffers and pending operations
   */
  clear(): void {
    // Cancel all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.subjectBuffers.clear();
    this.stats = this.initializeStats();
    this.processingTimes = [];
    logger.info('Realtime pattern stream cleared');
  }

  /**
   * Shutdown the stream processor
   */
  shutdown(): void {
    this.clear();
    this.callbacks.clear();
    logger.info('Realtime pattern stream shutdown');
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getBufferKey(subjectType: SubjectType, subjectId: string): string {
    return `${subjectType}:${subjectId}`;
  }

  private addToBuffer(event: EpisodicEvent): void {
    const key = this.getBufferKey(event.subjectType, event.subjectId);

    let buffer = this.subjectBuffers.get(key);
    if (!buffer) {
      buffer = {
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        events: [],
        lastFlushAt: null,
        pendingFlush: false,
      };
      this.subjectBuffers.set(key, buffer);
    }

    buffer.events.push(event);
  }

  private async scheduleDebounceFlush(bufferKey: string): Promise<PatternUpdateEvent | null> {
    // Cancel existing timer
    this.cancelDebounce(bufferKey);

    // Create a promise that resolves when the debounced flush completes
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        this.debounceTimers.delete(bufferKey);
        const result = await this.flushBuffer(bufferKey);
        resolve(result);
      }, this.config.debounceWindowMs);

      this.debounceTimers.set(bufferKey, timer);
    });
  }

  private cancelDebounce(bufferKey: string): void {
    const existingTimer = this.debounceTimers.get(bufferKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(bufferKey);
    }
  }

  private async flushBuffer(bufferKey: string): Promise<PatternUpdateEvent | null> {
    const buffer = this.subjectBuffers.get(bufferKey);
    if (!buffer || buffer.events.length === 0) {
      return null;
    }

    // Mark as flushing
    buffer.pendingFlush = true;

    try {
      const events = [...buffer.events];
      const result = await this.runPatternDetection(buffer.subjectType, buffer.subjectId, events);

      // Clear buffer after successful processing
      buffer.events = [];
      buffer.lastFlushAt = new Date();
      buffer.pendingFlush = false;

      return result;
    } catch (error) {
      buffer.pendingFlush = false;
      throw error;
    }
  }

  private async runPatternDetection(
    subjectType: SubjectType,
    subjectId: string,
    triggeringEvents: EpisodicEvent[]
  ): Promise<PatternUpdateEvent | null> {
    const startTime = Date.now();

    try {
      // Get previous patterns for comparison
      const previousPatterns = await this.patternDetector.getStoredPatterns(subjectType, subjectId);
      const previousPatternMap = new Map(previousPatterns.map((p) => [p.patternType, p]));

      // Run pattern detection
      const newPatterns = await this.patternDetector.detectPatterns(subjectType, subjectId);
      const newPatternMap = new Map(newPatterns.map((p) => [p.patternType, p]));

      // Calculate deltas
      const deltas = this.calculateDeltas(
        previousPatternMap,
        newPatternMap,
        triggeringEvents.map((e) => e.id)
      );

      // Skip if no significant changes
      if (deltas.length === 0) {
        logger.debug(
          { subjectId, patternCount: newPatterns.length },
          'No significant pattern changes detected'
        );
        return null;
      }

      // Create update event
      const updateEvent: PatternUpdateEvent = {
        eventId: crypto.randomUUID(),
        subjectType,
        subjectId,
        timestamp: new Date(),
        triggeringEventId: triggeringEvents[triggeringEvents.length - 1]?.id ?? '',
        deltas,
        currentPatterns: newPatterns,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          isIncremental: triggeringEvents.length > 0,
          eventsAnalyzed: triggeringEvents.length,
        },
      };

      // Update stats
      this.stats.totalPatternUpdates++;
      this.stats.lastUpdateAt = new Date();
      for (const delta of deltas) {
        const currentCount = this.stats.changesByType[delta.changeType];
        this.stats.changesByType[delta.changeType] = currentCount + 1;
      }

      // Emit to callbacks
      await this.emitUpdateEvent(updateEvent);

      logger.info(
        {
          subjectId,
          deltaCount: deltas.length,
          processingTimeMs: updateEvent.metadata.processingTimeMs,
        },
        'Real-time pattern update completed'
      );

      return updateEvent;
    } catch (error) {
      logger.error({ error, subjectId }, 'Failed to run pattern detection');
      throw error;
    }
  }

  private calculateDeltas(
    previousPatterns: Map<string, BehavioralPattern>,
    newPatterns: Map<string, BehavioralPattern>,
    triggeringEventIds: string[]
  ): PatternDelta[] {
    const deltas: PatternDelta[] = [];

    // Check for new and updated patterns
    for (const [patternType, newPattern] of newPatterns) {
      const previousPattern = previousPatterns.get(patternType);

      if (!previousPattern) {
        // New pattern created
        deltas.push({
          changeType: 'created',
          patternType,
          previousConfidence: null,
          newConfidence: newPattern.confidence,
          triggeringEventIds,
          changeDescription: `New pattern "${patternType}" detected with ${Math.round(newPattern.confidence * 100)}% confidence`,
        });
      } else {
        const confidenceChange = newPattern.confidence - previousPattern.confidence;

        // Check if change is significant
        if (Math.abs(confidenceChange) >= this.config.minConfidenceChangeThreshold) {
          const changeType: PatternChangeType = confidenceChange > 0 ? 'strengthened' : 'weakened';

          deltas.push({
            changeType,
            patternType,
            previousConfidence: previousPattern.confidence,
            newConfidence: newPattern.confidence,
            triggeringEventIds,
            changeDescription: `Pattern "${patternType}" ${changeType}: ${Math.round(previousPattern.confidence * 100)}% → ${Math.round(newPattern.confidence * 100)}%`,
          });
        } else if (
          newPattern.supportingEventIds.length !== previousPattern.supportingEventIds.length
        ) {
          // Evidence changed even if confidence didn't significantly
          deltas.push({
            changeType: 'updated',
            patternType,
            previousConfidence: previousPattern.confidence,
            newConfidence: newPattern.confidence,
            triggeringEventIds,
            changeDescription: `Pattern "${patternType}" evidence updated (${previousPattern.supportingEventIds.length} → ${newPattern.supportingEventIds.length} events)`,
          });
        }
      }
    }

    // Check for removed patterns
    for (const [patternType, previousPattern] of previousPatterns) {
      if (!newPatterns.has(patternType)) {
        deltas.push({
          changeType: 'removed',
          patternType,
          previousConfidence: previousPattern.confidence,
          newConfidence: null,
          triggeringEventIds,
          changeDescription: `Pattern "${patternType}" no longer detected (was ${Math.round(previousPattern.confidence * 100)}% confidence)`,
        });
      }
    }

    return deltas;
  }

  private async emitUpdateEvent(event: PatternUpdateEvent): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const callback of this.callbacks) {
      try {
        const result = callback(event);
        if (result instanceof Promise) {
          promises.push(
            result.catch((error: unknown) => {
              logger.warn({ error }, 'Pattern update callback failed');
            })
          );
        }
      } catch (error) {
        logger.warn({ error }, 'Pattern update callback threw synchronously');
      }
    }

    // Wait for all async callbacks
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  private initializeStats(): RealtimePatternStats {
    return {
      totalEventsProcessed: 0,
      totalPatternUpdates: 0,
      bufferedEventCount: 0,
      activeSubjects: 0,
      avgProcessingTimeMs: 0,
      changesByType: {
        created: 0,
        updated: 0,
        strengthened: 0,
        weakened: 0,
        removed: 0,
      },
      lastUpdateAt: null,
    };
  }

  private recordProcessingTime(timeMs: number): void {
    this.processingTimes.push(timeMs);
    // Keep only last 100 samples
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createRealtimePatternStream(
  pool: Pool,
  openai?: IOpenAIClient,
  config?: Partial<RealtimePatternStreamConfig>,
  cognitiveConfig?: Partial<CognitiveSystemConfig>
): RealtimePatternStream {
  return new RealtimePatternStream(pool, openai, config, cognitiveConfig);
}
