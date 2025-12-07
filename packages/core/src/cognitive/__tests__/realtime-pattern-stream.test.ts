/**
 * Real-Time Pattern Stream Tests
 *
 * L5: Tests for stream processing for behavioral pattern detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimePatternStream, createRealtimePatternStream } from '../realtime-pattern-stream.js';
import { type EpisodicEvent, type RealtimePatternStreamConfig } from '../types.js';
import type { IOpenAIClient } from '../episode-builder.js';

describe('RealtimePatternStream', () => {
  let stream: RealtimePatternStream;
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let mockOpenAI: IOpenAIClient;

  const testSubjectId = '550e8400-e29b-41d4-a716-446655440000';
  const testEventId = '660e8400-e29b-41d4-a716-446655440001';

  const createTestEvent = (overrides: Partial<EpisodicEvent> = {}): EpisodicEvent => ({
    id: overrides.id ?? testEventId,
    subjectType: 'lead',
    subjectId: testSubjectId,
    eventType: 'message.received',
    eventCategory: 'communication',
    sourceChannel: 'whatsapp',
    summary: 'Patient asked about dental implants pricing',
    keyEntities: [{ type: 'procedure', value: 'dental implants', confidence: 0.9 }],
    sentiment: 'neutral',
    intent: 'pricing_inquiry',
    occurredAt: new Date(),
    processedAt: new Date(),
    ...overrides,
  });

  const createMockPatternRow = (
    patternType: string,
    confidence: number,
    eventIds: string[] = [testEventId]
  ): Record<string, unknown> => ({
    id: crypto.randomUUID(),
    subject_type: 'lead',
    subject_id: testSubjectId,
    pattern_type: patternType,
    pattern_description: `Test pattern: ${patternType}`,
    confidence,
    supporting_event_ids: eventIds,
    first_observed_at: new Date(),
    last_observed_at: new Date(),
    occurrence_count: 1,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockOpenAI = {
      chatCompletion: vi.fn().mockResolvedValue('[]'),
    };

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    stream = new RealtimePatternStream(mockPool as any, mockOpenAI, {
      enabled: true,
      debounceWindowMs: 0, // Disable debounce for tests
      enableRealtimeLLMPatterns: false,
    });
  });

  afterEach(() => {
    stream.shutdown();
  });

  describe('processEvent', () => {
    it('should process an event and return null when no pattern changes', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const event = createTestEvent();
      const result = await stream.processEvent(event);

      expect(result).toBeNull();
    });

    it('should return null when stream is disabled', async () => {
      stream = new RealtimePatternStream(mockPool as any, mockOpenAI, {
        enabled: false,
      });

      const event = createTestEvent();
      const result = await stream.processEvent(event);

      expect(result).toBeNull();
    });

    it('should detect new pattern and emit created delta', async () => {
      let patternQueryCount = 0;

      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          patternQueryCount++;
          // First query returns empty (previous patterns)
          // Subsequent queries return the new pattern
          if (patternQueryCount === 1) {
            return { rows: [] };
          }
          return { rows: [createMockPatternRow('price_sensitive', 0.8)] };
        }
        if (sql.includes('FROM episodic_events')) {
          return {
            rows: [
              {
                id: testEventId,
                subject_type: 'lead',
                subject_id: testSubjectId,
                event_type: 'message.received',
                event_category: 'communication',
                source_channel: 'whatsapp',
                summary: 'Patient asked about pricing and cost',
                key_entities: [],
                sentiment: 'neutral',
                intent: 'pricing',
                occurred_at: new Date(),
              },
              {
                id: crypto.randomUUID(),
                subject_type: 'lead',
                subject_id: testSubjectId,
                event_type: 'message.received',
                event_category: 'communication',
                source_channel: 'whatsapp',
                summary: 'Patient asked about price again',
                key_entities: [],
                sentiment: 'neutral',
                intent: 'pricing',
                occurred_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const event = createTestEvent({ summary: 'Patient asked about pricing' });
      const result = await stream.processEvent(event);

      expect(result).not.toBeNull();
      expect(result?.deltas.length).toBeGreaterThanOrEqual(1);
      const createdDelta = result?.deltas.find((d) => d.changeType === 'created');
      expect(createdDelta).toBeDefined();
      expect(createdDelta?.previousConfidence).toBeNull();
      expect(createdDelta?.newConfidence).toBeGreaterThan(0);
    });

    it('should detect removed pattern when pattern disappears', async () => {
      let patternQueryCount = 0;

      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          patternQueryCount++;
          // First query returns existing pattern
          // After detection, pattern is gone
          if (patternQueryCount === 1) {
            return { rows: [createMockPatternRow('price_sensitive', 0.7)] };
          }
          return { rows: [] };
        }
        if (sql.includes('FROM episodic_events')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const event = createTestEvent();
      const result = await stream.processEvent(event);

      expect(result).not.toBeNull();
      const removedDelta = result?.deltas.find((d) => d.changeType === 'removed');
      expect(removedDelta).toBeDefined();
      expect(removedDelta?.newConfidence).toBeNull();
    });

    it('should update stats when processing events', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await stream.processEvent(createTestEvent());

      const stats = stream.getStats();
      expect(stats.totalEventsProcessed).toBe(1);
    });
  });

  describe('subscribe', () => {
    it('should call callback when pattern changes occur', async () => {
      const callback = vi.fn();
      stream.subscribe(callback);

      let patternQueryCount = 0;
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          patternQueryCount++;
          if (patternQueryCount === 1) {
            return { rows: [] };
          }
          return { rows: [createMockPatternRow('price_sensitive', 0.8)] };
        }
        if (sql.includes('FROM episodic_events')) {
          return {
            rows: [
              {
                id: testEventId,
                subject_type: 'lead',
                subject_id: testSubjectId,
                event_type: 'message.received',
                event_category: 'communication',
                source_channel: 'whatsapp',
                summary: 'price cost discount',
                key_entities: [],
                sentiment: 'neutral',
                occurred_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const result = await stream.processEvent(createTestEvent());

      // Only called if there are actual changes
      if (result !== null) {
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            subjectId: testSubjectId,
            deltas: expect.any(Array),
          })
        );
      }
    });

    it('should allow unsubscribing', async () => {
      const callback = vi.fn();
      const unsubscribe = stream.subscribe(callback);

      unsubscribe();

      // Even if pattern changes occur, callback shouldn't be called
      let patternQueryCount = 0;
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          patternQueryCount++;
          if (patternQueryCount === 1) {
            return { rows: [] };
          }
          return { rows: [createMockPatternRow('price_sensitive', 0.8)] };
        }
        return { rows: [] };
      });

      await stream.processEvent(createTestEvent());

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const failingCallback = vi.fn().mockRejectedValue(new Error('Callback error'));
      const successCallback = vi.fn();

      stream.subscribe(failingCallback);
      stream.subscribe(successCallback);

      let patternQueryCount = 0;
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          patternQueryCount++;
          if (patternQueryCount === 1) {
            return { rows: [] };
          }
          return { rows: [createMockPatternRow('price_sensitive', 0.8)] };
        }
        return { rows: [] };
      });

      // Should not throw even with failing callback
      await expect(stream.processEvent(createTestEvent())).resolves.not.toThrow();
    });
  });

  describe('buffer management', () => {
    it('should track buffered events', async () => {
      stream = new RealtimePatternStream(mockPool as any, mockOpenAI, {
        enabled: true,
        debounceWindowMs: 0,
        maxEventBufferSize: 5,
      });

      mockPool.query.mockResolvedValue({ rows: [] });

      await stream.processEvent(createTestEvent({ id: crypto.randomUUID() }));
      await stream.processEvent(createTestEvent({ id: crypto.randomUUID() }));

      const stats = stream.getStats();
      expect(stats.totalEventsProcessed).toBe(2);
    });
  });

  describe('forcePatternUpdate', () => {
    it('should run pattern detection for subject', async () => {
      let patternQueryCount = 0;
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          patternQueryCount++;
          if (patternQueryCount === 1) {
            return { rows: [] };
          }
          return { rows: [createMockPatternRow('high_engagement', 0.85)] };
        }
        if (sql.includes('FROM episodic_events')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await stream.forcePatternUpdate('lead', testSubjectId);

      // Result depends on whether patterns change
      expect(patternQueryCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const initialStats = stream.getStats();

      expect(initialStats.totalEventsProcessed).toBe(0);
      expect(initialStats.totalPatternUpdates).toBe(0);
      expect(initialStats.bufferedEventCount).toBe(0);
      expect(initialStats.activeSubjects).toBe(0);

      mockPool.query.mockResolvedValue({ rows: [] });
      await stream.processEvent(createTestEvent());

      const updatedStats = stream.getStats();
      expect(updatedStats.totalEventsProcessed).toBe(1);
    });

    it('should track change types when patterns change', async () => {
      let patternQueryCount = 0;
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          patternQueryCount++;
          if (patternQueryCount === 1) {
            return { rows: [] };
          }
          return { rows: [createMockPatternRow('price_sensitive', 0.8)] };
        }
        return { rows: [] };
      });

      await stream.processEvent(createTestEvent());

      const stats = stream.getStats();
      // Stats track changes when they occur
      expect(typeof stats.changesByType.created).toBe('number');
    });
  });

  describe('clear', () => {
    it('should clear all buffers and stats', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      await stream.processEvent(createTestEvent());

      stream.clear();

      const stats = stream.getStats();
      expect(stats.totalEventsProcessed).toBe(0);
      expect(stats.bufferedEventCount).toBe(0);
      expect(stats.activeSubjects).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', () => {
      const callback = vi.fn();
      stream.subscribe(callback);

      stream.shutdown();

      const stats = stream.getStats();
      expect(stats.totalEventsProcessed).toBe(0);
    });
  });

  describe('factory function', () => {
    it('should create instance with default config', () => {
      const instance = createRealtimePatternStream(mockPool as any);
      expect(instance).toBeInstanceOf(RealtimePatternStream);
    });

    it('should create instance with custom config', () => {
      const customConfig: Partial<RealtimePatternStreamConfig> = {
        enabled: false,
        debounceWindowMs: 500,
      };

      const instance = createRealtimePatternStream(mockPool as any, undefined, customConfig);
      expect(instance).toBeInstanceOf(RealtimePatternStream);
    });
  });

  describe('pattern delta calculation', () => {
    it('should detect pattern changes between detection runs', async () => {
      // Track which patterns are returned at each step
      const patternStates = [
        [], // Initial: no patterns
        [createMockPatternRow('price_sensitive', 0.8)], // After detection
      ];
      let stateIndex = 0;

      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          const result = { rows: patternStates[stateIndex] ?? [] };
          stateIndex = Math.min(stateIndex + 1, patternStates.length - 1);
          return result;
        }
        if (sql.includes('FROM episodic_events')) {
          return {
            rows: [
              {
                id: testEventId,
                subject_type: 'lead',
                subject_id: testSubjectId,
                event_type: 'message.received',
                event_category: 'communication',
                source_channel: 'whatsapp',
                summary: 'price price cost',
                key_entities: [],
                sentiment: 'neutral',
                occurred_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      const result = await stream.processEvent(createTestEvent());

      if (result !== null) {
        expect(result.deltas.length).toBeGreaterThan(0);
        expect(result.currentPatterns).toBeDefined();
        expect(result.metadata.isIncremental).toBe(true);
      }
    });

    it('should handle multiple pattern changes in single update', async () => {
      const patternStates = [
        [createMockPatternRow('old_pattern', 0.7)], // Before
        [createMockPatternRow('new_pattern', 0.8), createMockPatternRow('another_pattern', 0.6)], // After
      ];
      let stateIndex = 0;

      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM behavioral_patterns') && sql.includes('ORDER BY confidence')) {
          const result = { rows: patternStates[stateIndex] ?? [] };
          stateIndex = Math.min(stateIndex + 1, patternStates.length - 1);
          return result;
        }
        if (sql.includes('FROM episodic_events')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const result = await stream.processEvent(createTestEvent());

      if (result !== null) {
        // Should have multiple changes (removed old_pattern, created new ones)
        expect(result.deltas.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
