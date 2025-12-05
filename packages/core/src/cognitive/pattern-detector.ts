/**
 * Pattern Detector - Behavioral Pattern Recognition
 *
 * ADR-004 Phase 3: Detects behavioral patterns from episodic events
 * using both rule-based analysis and LLM-powered pattern recognition.
 */

import type { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../logger.js';
import {
  DEFAULT_COGNITIVE_CONFIG,
  type BehavioralPattern,
  type EpisodicEvent,
  type SubjectType,
  type LLMPattern,
  type CognitiveSystemConfig,
} from './types.js';
import type { IOpenAIClient } from './episode-builder.js';

const logger = createLogger({ name: 'cognitive-pattern-detector' });

// =============================================================================
// Pattern Detection Thresholds
// =============================================================================

interface PatternThresholds {
  /** Minimum reschedules to detect appointment_rescheduler pattern */
  reschedulerMinCount: number;
  /** Minimum events to detect high_engagement */
  highEngagementMinEvents: number;
  /** Days window for engagement analysis */
  engagementWindowDays: number;
  /** Threshold for declining engagement (% drop) */
  decliningEngagementThreshold: number;
  /** Response time in minutes for quick_responder */
  quickResponseMinutes: number;
  /** Response time in minutes for slow_responder */
  slowResponseMinutes: number;
  /** Minimum occurrences of day avoidance */
  dayAvoidanceMinOccurrences: number;
  /** Minimum keyword mentions for sensitivity patterns */
  keywordMinMentions: number;
}

const DEFAULT_THRESHOLDS: PatternThresholds = {
  reschedulerMinCount: 3,
  highEngagementMinEvents: 10,
  engagementWindowDays: 30,
  decliningEngagementThreshold: 0.5,
  quickResponseMinutes: 15,
  slowResponseMinutes: 120,
  dayAvoidanceMinOccurrences: 3,
  keywordMinMentions: 2,
};

// =============================================================================
// Pattern Detection Result
// =============================================================================

export interface DetectedPattern {
  patternType: string;
  confidence: number;
  description: string;
  supportingEventIds: string[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Pattern Detector Service
// =============================================================================

export class PatternDetector {
  private config: CognitiveSystemConfig;
  private thresholds: PatternThresholds;

  constructor(
    private pool: Pool,
    private openai: IOpenAIClient | null,
    config: Partial<CognitiveSystemConfig> = {},
    thresholds: Partial<PatternThresholds> = {}
  ) {
    this.config = { ...DEFAULT_COGNITIVE_CONFIG, ...config };
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Detect all patterns for a subject
   */
  async detectPatterns(
    subjectType: SubjectType,
    subjectId: string,
    _options: { forceRefresh?: boolean } = {}
  ): Promise<BehavioralPattern[]> {
    logger.info({ subjectType, subjectId }, 'Detecting patterns for subject');

    // Get recent events for analysis
    const events = await this.getEventsForAnalysis(subjectType, subjectId);

    if (events.length < 3) {
      logger.info(
        { subjectId, eventCount: events.length },
        'Insufficient events for pattern detection'
      );
      return [];
    }

    // Run all pattern detectors
    const detectedPatterns: DetectedPattern[] = [];

    // Rule-based patterns
    detectedPatterns.push(...this.detectReschedulerPattern(events));
    detectedPatterns.push(...this.detectDayAvoidancePattern(events));
    detectedPatterns.push(...this.detectEngagementPatterns(events));
    detectedPatterns.push(...this.detectResponsePatterns(events));
    detectedPatterns.push(...this.detectKeywordPatterns(events));

    // LLM-based patterns (if enabled and available)
    if (this.config.enableLLMPatterns && this.openai) {
      const llmPatterns = await this.detectLLMPatterns(events);
      detectedPatterns.push(...llmPatterns);
    }

    // Filter by minimum confidence
    const validPatterns = detectedPatterns.filter(
      (p) => p.confidence >= this.config.minPatternConfidence
    );

    // Save or update patterns
    const savedPatterns: BehavioralPattern[] = [];
    for (const pattern of validPatterns) {
      const saved = await this.upsertPattern(subjectType, subjectId, pattern);
      savedPatterns.push(saved);
    }

    logger.info(
      { subjectId, detectedCount: validPatterns.length, savedCount: savedPatterns.length },
      'Pattern detection complete'
    );

    return savedPatterns;
  }

  /**
   * Get existing patterns for a subject
   */
  async getPatterns(subjectType: SubjectType, subjectId: string): Promise<BehavioralPattern[]> {
    const result = await this.pool.query(
      `SELECT * FROM behavioral_patterns
       WHERE subject_type = $1 AND subject_id = $2
       ORDER BY confidence DESC`,
      [subjectType, subjectId]
    );

    return result.rows.map((row: Record<string, unknown>) => this.rowToPattern(row));
  }

  // ===========================================================================
  // Rule-Based Pattern Detectors
  // ===========================================================================

  /**
   * Detect appointment rescheduler pattern
   */
  private detectReschedulerPattern(events: EpisodicEvent[]): DetectedPattern[] {
    const rescheduleEvents = events.filter((e) => e.eventType === 'appointment.rescheduled');

    if (rescheduleEvents.length >= this.thresholds.reschedulerMinCount) {
      const confidence = Math.min(
        1,
        rescheduleEvents.length / (this.thresholds.reschedulerMinCount * 2)
      );
      return [
        {
          patternType: 'appointment_rescheduler',
          confidence,
          description: `Frequently reschedules appointments (${rescheduleEvents.length} times)`,
          supportingEventIds: rescheduleEvents.map((e) => e.id),
          metadata: { rescheduleCount: rescheduleEvents.length },
        },
      ];
    }

    return [];
  }

  /**
   * Detect day avoidance patterns (e.g., monday_avoider)
   */
  private detectDayAvoidancePattern(events: EpisodicEvent[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const schedulingEvents = events.filter((e) => e.eventCategory === 'scheduling');

    if (schedulingEvents.length < this.thresholds.dayAvoidanceMinOccurrences) {
      return patterns;
    }

    // Count day preferences from scheduling events
    const dayCounts = new Map<number, number>([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
    ]);
    for (const event of schedulingEvents) {
      const day = event.occurredAt.getDay();
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }

    const totalScheduling = schedulingEvents.length;
    const dayNames = new Map<number, string>([
      [0, 'Sunday'],
      [1, 'Monday'],
      [2, 'Tuesday'],
      [3, 'Wednesday'],
      [4, 'Thursday'],
      [5, 'Friday'],
      [6, 'Saturday'],
    ]);

    // Check for Monday avoidance specifically
    const mondayCount = dayCounts.get(1) ?? 0;
    const mondayPercentage = mondayCount / totalScheduling;
    const expectedPercentage = 1 / 5; // Assuming 5 working days

    if (mondayPercentage < expectedPercentage * 0.3 && totalScheduling >= 5) {
      patterns.push({
        patternType: 'monday_avoider',
        confidence: Math.min(1, (expectedPercentage - mondayPercentage) / expectedPercentage),
        description: 'Tends to avoid Monday appointments',
        supportingEventIds: schedulingEvents.map((e) => e.id),
        metadata: { mondayPercentage, totalScheduling },
      });
    }

    // Check for any day with significantly low scheduling
    for (let day = 1; day <= 5; day++) {
      // Working days only
      const dayCount = dayCounts.get(day) ?? 0;
      const percentage = dayCount / totalScheduling;
      if (percentage < expectedPercentage * 0.2 && totalScheduling >= 8) {
        const dayName = dayNames.get(day) ?? 'Unknown';
        if (day !== 1) {
          // Already handled Monday
          patterns.push({
            patternType: `day_avoider_${dayName.toLowerCase()}`,
            confidence: 0.6,
            description: `Tends to avoid ${dayName} appointments`,
            supportingEventIds: schedulingEvents.map((e) => e.id),
            metadata: { dayPercentage: percentage, day: dayName },
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Detect engagement patterns (high/declining)
   */
  private detectEngagementPatterns(events: EpisodicEvent[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const now = new Date();
    const windowMs = this.thresholds.engagementWindowDays * 24 * 60 * 60 * 1000;

    // Split events into recent and older
    const recentEvents = events.filter(
      (e) => now.getTime() - e.occurredAt.getTime() < windowMs / 2
    );
    const olderEvents = events.filter(
      (e) =>
        now.getTime() - e.occurredAt.getTime() >= windowMs / 2 &&
        now.getTime() - e.occurredAt.getTime() < windowMs
    );

    // High engagement detection
    const communicationEvents = events.filter((e) => e.eventCategory === 'communication');
    if (communicationEvents.length >= this.thresholds.highEngagementMinEvents) {
      const positiveEvents = communicationEvents.filter((e) => e.sentiment === 'positive');
      const positiveRatio = positiveEvents.length / communicationEvents.length;

      if (positiveRatio > 0.6) {
        patterns.push({
          patternType: 'high_engagement',
          confidence: Math.min(1, positiveRatio),
          description: `High engagement with ${Math.round(positiveRatio * 100)}% positive interactions`,
          supportingEventIds: positiveEvents.map((e) => e.id),
          metadata: {
            totalEvents: communicationEvents.length,
            positiveRatio,
          },
        });
      }
    }

    // Declining engagement detection
    if (recentEvents.length > 0 && olderEvents.length > 0) {
      const recentRate = recentEvents.length / (windowMs / 2);
      const olderRate = olderEvents.length / (windowMs / 2);
      const dropRatio = 1 - recentRate / olderRate;

      if (dropRatio >= this.thresholds.decliningEngagementThreshold) {
        patterns.push({
          patternType: 'declining_engagement',
          confidence: Math.min(1, dropRatio),
          description: `Engagement dropped by ${Math.round(dropRatio * 100)}% in recent period`,
          supportingEventIds: [...recentEvents, ...olderEvents].map((e) => e.id),
          metadata: {
            recentCount: recentEvents.length,
            olderCount: olderEvents.length,
            dropRatio,
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Detect response time patterns
   */
  private detectResponsePatterns(events: EpisodicEvent[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Look for response time data in metadata
    const eventsWithResponseTime = events.filter(
      (e) => e.metadata && typeof e.metadata === 'object' && 'responseTimeMinutes' in e.metadata
    );

    if (eventsWithResponseTime.length < 3) {
      return patterns;
    }

    const responseTimes = eventsWithResponseTime.map(
      (e) => (e.metadata as { responseTimeMinutes: number }).responseTimeMinutes
    );
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    if (avgResponseTime <= this.thresholds.quickResponseMinutes) {
      patterns.push({
        patternType: 'quick_responder',
        confidence: Math.min(1, this.thresholds.quickResponseMinutes / avgResponseTime),
        description: `Quick responder with average ${Math.round(avgResponseTime)} minute response time`,
        supportingEventIds: eventsWithResponseTime.map((e) => e.id),
        metadata: { avgResponseTime, sampleCount: responseTimes.length },
      });
    } else if (avgResponseTime >= this.thresholds.slowResponseMinutes) {
      patterns.push({
        patternType: 'slow_responder',
        confidence: Math.min(1, avgResponseTime / (this.thresholds.slowResponseMinutes * 2)),
        description: `Slow responder with average ${Math.round(avgResponseTime)} minute response time`,
        supportingEventIds: eventsWithResponseTime.map((e) => e.id),
        metadata: { avgResponseTime, sampleCount: responseTimes.length },
      });
    }

    return patterns;
  }

  /**
   * Detect keyword-based patterns (price_sensitive, quality_focused)
   */
  private detectKeywordPatterns(events: EpisodicEvent[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    const priceKeywords = [
      'price',
      'cost',
      'expensive',
      'cheap',
      'discount',
      'offer',
      'pret',
      'scump',
      'ieftin',
    ];
    const qualityKeywords = [
      'quality',
      'best',
      'experienced',
      'expert',
      'professional',
      'calitate',
      'specialist',
    ];

    let priceCount = 0;
    let qualityCount = 0;
    const priceEventIds: string[] = [];
    const qualityEventIds: string[] = [];

    for (const event of events) {
      const summary = event.summary.toLowerCase();
      const entities = event.keyEntities.map((e) => e.value.toLowerCase());
      const content = [summary, ...entities].join(' ');

      if (priceKeywords.some((k) => content.includes(k))) {
        priceCount++;
        priceEventIds.push(event.id);
      }
      if (qualityKeywords.some((k) => content.includes(k))) {
        qualityCount++;
        qualityEventIds.push(event.id);
      }
    }

    if (priceCount >= this.thresholds.keywordMinMentions) {
      patterns.push({
        patternType: 'price_sensitive',
        confidence: Math.min(1, priceCount / (this.thresholds.keywordMinMentions * 3)),
        description: `Shows price sensitivity in ${priceCount} interactions`,
        supportingEventIds: priceEventIds,
        metadata: { mentionCount: priceCount },
      });
    }

    if (qualityCount >= this.thresholds.keywordMinMentions) {
      patterns.push({
        patternType: 'quality_focused',
        confidence: Math.min(1, qualityCount / (this.thresholds.keywordMinMentions * 3)),
        description: `Focuses on quality/expertise in ${qualityCount} interactions`,
        supportingEventIds: qualityEventIds,
        metadata: { mentionCount: qualityCount },
      });
    }

    return patterns;
  }

  // ===========================================================================
  // LLM-Based Pattern Detection
  // ===========================================================================

  /**
   * Use LLM to detect nuanced behavioral patterns
   */
  private async detectLLMPatterns(events: EpisodicEvent[]): Promise<DetectedPattern[]> {
    if (!this.openai) return [];

    const eventSummaries = events
      .slice(0, 20) // Limit to recent 20 events
      .map((e) => `- [${e.sourceChannel}] ${e.summary} (sentiment: ${e.sentiment ?? 'unknown'})`)
      .join('\n');

    const prompt = `Analyze these patient interactions and identify behavioral patterns:

${eventSummaries}

Identify patterns like:
- Communication preferences (prefers text vs calls, formal vs casual)
- Time preferences (morning person, weekend availability)
- Seasonal behaviors (more active in certain months)
- Topic interests (specific procedures, concerns)
- Decision-making style (quick vs careful, needs reassurance)

Return JSON array of detected patterns:
[{
  "type": "llm_communication_preference" | "llm_time_preference" | "llm_seasonal_behavior" | "llm_topic_interest" | "llm_other",
  "description": "Brief description of the pattern",
  "confidence": 0.0-1.0,
  "reasoning": "Why this pattern was detected"
}]

Only include patterns with confidence > 0.5. Return empty array if no clear patterns.`;

    try {
      const response = await this.openai.chatCompletion({
        messages: [
          {
            role: 'system',
            content: 'You are a behavioral analysis expert. Output only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 500,
        jsonMode: true,
      });

      const llmPatterns = JSON.parse(response) as LLMPattern[];
      const eventIds = events.slice(0, 20).map((e) => e.id);

      return llmPatterns
        .filter((p) => p.confidence > 0.5)
        .map((p) => ({
          patternType: p.type,
          confidence: p.confidence,
          description: p.description,
          supportingEventIds: eventIds,
          metadata: { reasoning: p.reasoning },
        }));
    } catch (error) {
      logger.warn({ error }, 'LLM pattern detection failed');
      return [];
    }
  }

  // ===========================================================================
  // Database Operations
  // ===========================================================================

  /**
   * Get events for pattern analysis
   */
  private async getEventsForAnalysis(
    subjectType: SubjectType,
    subjectId: string
  ): Promise<EpisodicEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM episodic_events
       WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
       ORDER BY occurred_at DESC
       LIMIT $3`,
      [subjectType, subjectId, this.config.maxEventsForPatterns]
    );

    return result.rows.map((row: Record<string, unknown>) => this.rowToEvent(row));
  }

  /**
   * Upsert a detected pattern
   */
  private async upsertPattern(
    subjectType: SubjectType,
    subjectId: string,
    pattern: DetectedPattern
  ): Promise<BehavioralPattern> {
    const now = new Date();

    // Check if pattern already exists
    const existing = await this.pool.query(
      `SELECT * FROM behavioral_patterns
       WHERE subject_type = $1 AND subject_id = $2 AND pattern_type = $3`,
      [subjectType, subjectId, pattern.patternType]
    );

    if (existing.rows.length > 0) {
      // Update existing pattern
      const existingPattern = existing.rows[0] as Record<string, unknown>;
      const newCount = (existingPattern.occurrence_count as number) + 1;

      await this.pool.query(
        `UPDATE behavioral_patterns
         SET confidence = $1,
             pattern_description = $2,
             supporting_event_ids = $3,
             last_observed_at = $4,
             occurrence_count = $5,
             metadata = $6
         WHERE id = $7`,
        [
          pattern.confidence,
          pattern.description,
          JSON.stringify(pattern.supportingEventIds),
          now,
          newCount,
          JSON.stringify(pattern.metadata ?? {}),
          existingPattern.id,
        ]
      );

      return {
        id: existingPattern.id as string,
        subjectType,
        subjectId,
        patternType: pattern.patternType,
        patternDescription: pattern.description,
        confidence: pattern.confidence,
        supportingEventIds: pattern.supportingEventIds,
        firstObservedAt: existingPattern.first_observed_at as Date,
        lastObservedAt: now,
        occurrenceCount: newCount,
        metadata: pattern.metadata,
      };
    } else {
      // Insert new pattern
      const id = uuidv4();

      await this.pool.query(
        `INSERT INTO behavioral_patterns
         (id, subject_type, subject_id, pattern_type, pattern_description,
          confidence, supporting_event_ids, first_observed_at, last_observed_at,
          occurrence_count, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          subjectType,
          subjectId,
          pattern.patternType,
          pattern.description,
          pattern.confidence,
          JSON.stringify(pattern.supportingEventIds),
          now,
          now,
          1,
          JSON.stringify(pattern.metadata ?? {}),
        ]
      );

      return {
        id,
        subjectType,
        subjectId,
        patternType: pattern.patternType,
        patternDescription: pattern.description,
        confidence: pattern.confidence,
        supportingEventIds: pattern.supportingEventIds,
        firstObservedAt: now,
        lastObservedAt: now,
        occurrenceCount: 1,
        metadata: pattern.metadata,
      };
    }
  }

  /**
   * Convert database row to EpisodicEvent
   */
  private rowToEvent(row: Record<string, unknown>): EpisodicEvent {
    return {
      id: row.id as string,
      subjectType: row.subject_type as SubjectType,
      subjectId: row.subject_id as string,
      eventType: row.event_type as string,
      eventCategory: row.event_category as EpisodicEvent['eventCategory'],
      sourceChannel: row.source_channel as EpisodicEvent['sourceChannel'],
      rawEventId: row.raw_event_id as string | undefined,
      summary: row.summary as string,
      keyEntities: (row.key_entities as EpisodicEvent['keyEntities'] | null) ?? [],
      sentiment: row.sentiment as EpisodicEvent['sentiment'],
      intent: row.intent as string | undefined,
      occurredAt: row.occurred_at as Date,
      processedAt: row.processed_at as Date | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }

  /**
   * Convert database row to BehavioralPattern
   */
  private rowToPattern(row: Record<string, unknown>): BehavioralPattern {
    return {
      id: row.id as string,
      subjectType: row.subject_type as SubjectType,
      subjectId: row.subject_id as string,
      patternType: row.pattern_type as string,
      patternDescription: row.pattern_description as string,
      confidence: Number(row.confidence),
      supportingEventIds: (row.supporting_event_ids as string[] | null) ?? [],
      firstObservedAt: row.first_observed_at as Date,
      lastObservedAt: row.last_observed_at as Date,
      occurrenceCount: (row.occurrence_count as number | null) ?? 1,
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPatternDetector(
  pool: Pool,
  openai: IOpenAIClient | null,
  config?: Partial<CognitiveSystemConfig>,
  thresholds?: Partial<PatternThresholds>
): PatternDetector {
  return new PatternDetector(pool, openai, config, thresholds);
}
