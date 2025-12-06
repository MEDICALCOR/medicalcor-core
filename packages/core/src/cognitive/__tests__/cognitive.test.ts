import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EpisodeBuilder,
  MemoryRetrievalService,
  PatternDetector,
  createCognitiveSystem,
  DEFAULT_COGNITIVE_CONFIG,
  type IOpenAIClient,
  type IEmbeddingService,
} from '../index.js';
import type { RawEventContext, EpisodicEvent } from '../types.js';

// =============================================================================
// Mocks
// =============================================================================

const mockOpenAI: IOpenAIClient = {
  chatCompletion: vi.fn(),
};

const mockEmbeddings: IEmbeddingService = {
  embed: vi.fn(),
};

const mockPool = {
  query: vi.fn(),
  connect: vi.fn(),
};

// =============================================================================
// Test Data
// =============================================================================

const testLeadId = '550e8400-e29b-41d4-a716-446655440000';
const testEventId = '660e8400-e29b-41d4-a716-446655440001';

const testRawEvent: RawEventContext = {
  eventType: 'message.received',
  payload: {
    from: '+40712345678',
    message: 'I would like to schedule an appointment for dental implants',
    timestamp: '2024-12-05T10:00:00Z',
  },
  correlationId: testEventId,
  occurredAt: new Date('2024-12-05T10:00:00Z'),
};

const testAnalysisResponse = JSON.stringify({
  summary: 'Patient inquired about scheduling a dental implant appointment',
  entities: [
    { type: 'procedure', value: 'dental implants', confidence: 0.95 },
    { type: 'date', value: '2024-12-05', confidence: 0.9 },
  ],
  sentiment: 'positive',
  intent: 'seeking appointment',
});

const testEmbedding = new Array(1536).fill(0.1);

// =============================================================================
// Tests
// =============================================================================

describe('Cognitive Episodic Memory System', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    (mockOpenAI.chatCompletion as ReturnType<typeof vi.fn>).mockResolvedValue(testAnalysisResponse);

    (mockEmbeddings.embed as ReturnType<typeof vi.fn>).mockResolvedValue({
      embedding: testEmbedding,
      contentHash: 'test-hash-123',
    });

    (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
  });

  describe('EpisodeBuilder', () => {
    let builder: EpisodeBuilder;

    beforeEach(() => {
      builder = new EpisodeBuilder(
        mockOpenAI,
        mockEmbeddings,
        mockPool as any,
        DEFAULT_COGNITIVE_CONFIG
      );
    });

    it('should process an event into episodic memory', async () => {
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', testRawEvent);

      expect(episode).toBeDefined();
      expect(episode.subjectType).toBe('lead');
      expect(episode.subjectId).toBe(testLeadId);
      expect(episode.sourceChannel).toBe('whatsapp');
      expect(episode.eventType).toBe('message.received');
      expect(episode.eventCategory).toBe('communication');
      expect(episode.summary).toContain('dental implant');
      expect(episode.sentiment).toBe('positive');
      expect(episode.embedding).toEqual(testEmbedding);
      expect(episode.keyEntities).toHaveLength(2);
      expect(episode.keyEntities[0]?.type).toBe('procedure');
    });

    it('should call OpenAI for event analysis', async () => {
      await builder.processEvent('lead', testLeadId, 'whatsapp', testRawEvent);

      expect(mockOpenAI.chatCompletion).toHaveBeenCalledTimes(1);
      expect(mockOpenAI.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: DEFAULT_COGNITIVE_CONFIG.llmTemperature,
          maxTokens: DEFAULT_COGNITIVE_CONFIG.llmMaxTokens,
          jsonMode: true,
        })
      );
    });

    it('should call embedding service for summary', async () => {
      await builder.processEvent('lead', testLeadId, 'whatsapp', testRawEvent);

      expect(mockEmbeddings.embed).toHaveBeenCalledTimes(1);
      expect(mockEmbeddings.embed).toHaveBeenCalledWith(expect.stringContaining('dental implant'));
    });

    it('should save episode to database', async () => {
      await builder.processEvent('lead', testLeadId, 'whatsapp', testRawEvent);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO episodic_events'),
        expect.arrayContaining([
          expect.any(String), // id
          'lead', // subject_type
          testLeadId, // subject_id
          'message.received', // event_type
          'communication', // event_category
        ])
      );
    });

    it('should categorize events correctly', async () => {
      const schedulingEvent: RawEventContext = {
        eventType: 'appointment.scheduled',
        payload: { date: '2024-12-10' },
        occurredAt: new Date(),
      };

      const episode = await builder.processEvent('lead', testLeadId, 'crm', schedulingEvent);

      expect(episode.eventCategory).toBe('scheduling');
    });

    it('should use fallback when LLM fails', async () => {
      (mockOpenAI.chatCompletion as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('API Error')
      );

      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', testRawEvent);

      expect(episode).toBeDefined();
      expect(episode.summary).toContain('message received');
      expect(episode.sentiment).toBe('neutral');
      expect(episode.keyEntities).toEqual([]);
    });
  });

  describe('MemoryRetrievalService', () => {
    let retrieval: MemoryRetrievalService;

    beforeEach(() => {
      retrieval = new MemoryRetrievalService(
        mockPool as any,
        mockEmbeddings,
        DEFAULT_COGNITIVE_CONFIG
      );

      // Setup query mock for retrieval
      (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
        if (sql.includes('SELECT') && sql.includes('episodic_events')) {
          return Promise.resolve({
            rows: [
              {
                id: testEventId,
                subject_type: 'lead',
                subject_id: testLeadId,
                event_type: 'message.received',
                event_category: 'communication',
                source_channel: 'whatsapp',
                summary: 'Patient asked about dental implants',
                key_entities: [{ type: 'procedure', value: 'dental implants' }],
                sentiment: 'positive',
                intent: 'seeking information',
                occurred_at: new Date('2024-12-05T10:00:00Z'),
                processed_at: new Date('2024-12-05T10:00:01Z'),
                metadata: {},
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should query events by subject', async () => {
      const events = await retrieval.query({
        subjectType: 'lead',
        subjectId: testLeadId,
        limit: 10,
      });

      expect(events).toHaveLength(1);
      expect(events[0]?.subjectId).toBe(testLeadId);
      expect(events[0]?.eventType).toBe('message.received');
    });

    it('should query events with semantic search', async () => {
      const events = await retrieval.query({
        subjectId: testLeadId,
        semanticQuery: 'dental implants appointment',
        limit: 5,
      });

      expect(mockEmbeddings.embed).toHaveBeenCalledWith('dental implants appointment');
      expect(events).toHaveLength(1);
    });

    it('should find similar interactions', async () => {
      const similar = await retrieval.findSimilarInteractions('implant pricing', {
        subjectId: testLeadId,
        limit: 3,
      });

      expect(mockEmbeddings.embed).toHaveBeenCalledWith('implant pricing');
      expect(similar).toBeDefined();
    });

    it('should get recent events', async () => {
      const recent = await retrieval.getRecentEvents('lead', testLeadId, 30, 10);

      expect(recent).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('occurred_at >='),
        expect.any(Array)
      );
    });
  });

  describe('createCognitiveSystem', () => {
    it('should create a complete cognitive system', () => {
      const system = createCognitiveSystem({
        pool: mockPool as any,
        openai: mockOpenAI,
        embeddings: mockEmbeddings,
      });

      expect(system.episodeBuilder).toBeInstanceOf(EpisodeBuilder);
      expect(system.memoryRetrieval).toBeInstanceOf(MemoryRetrievalService);
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        minPatternConfidence: 0.8,
        enableLLMPatterns: false,
      };

      const system = createCognitiveSystem({
        pool: mockPool as any,
        openai: mockOpenAI,
        embeddings: mockEmbeddings,
        config: customConfig,
      });

      expect(system).toBeDefined();
    });
  });

  describe('DEFAULT_COGNITIVE_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_COGNITIVE_CONFIG.enabled).toBe(true);
      expect(DEFAULT_COGNITIVE_CONFIG.embeddingModel).toBe('text-embedding-3-small');
      expect(DEFAULT_COGNITIVE_CONFIG.minPatternConfidence).toBeGreaterThan(0);
      expect(DEFAULT_COGNITIVE_CONFIG.minPatternConfidence).toBeLessThan(1);
      expect(DEFAULT_COGNITIVE_CONFIG.minSimilarity).toBeGreaterThan(0);
      expect(DEFAULT_COGNITIVE_CONFIG.minSimilarity).toBeLessThan(1);
      expect(DEFAULT_COGNITIVE_CONFIG.defaultQueryLimit).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // PatternDetector Tests (M5: Behavioral Insights)
  // ===========================================================================

  describe('PatternDetector', () => {
    let detector: PatternDetector;

    // Test episodic events for pattern detection
    const createTestEvents = (overrides: Partial<EpisodicEvent>[] = []): EpisodicEvent[] => {
      const baseEvents: EpisodicEvent[] = [
        {
          id: '11111111-0000-0000-0000-000000000001',
          subjectType: 'lead',
          subjectId: testLeadId,
          eventType: 'message.received',
          eventCategory: 'communication',
          sourceChannel: 'whatsapp',
          summary: 'Patient inquired about dental implants pricing',
          keyEntities: [{ type: 'procedure', value: 'dental implants' }],
          sentiment: 'positive',
          intent: 'seeking information',
          occurredAt: new Date('2024-12-01T10:00:00Z'),
        },
        {
          id: '11111111-0000-0000-0000-000000000002',
          subjectType: 'lead',
          subjectId: testLeadId,
          eventType: 'message.sent',
          eventCategory: 'communication',
          sourceChannel: 'whatsapp',
          summary: 'Sent pricing information for dental implants',
          keyEntities: [{ type: 'amount', value: '$3000' }],
          sentiment: 'neutral',
          occurredAt: new Date('2024-12-01T10:15:00Z'),
        },
        {
          id: '11111111-0000-0000-0000-000000000003',
          subjectType: 'lead',
          subjectId: testLeadId,
          eventType: 'appointment.scheduled',
          eventCategory: 'scheduling',
          sourceChannel: 'crm',
          summary: 'Patient scheduled appointment for consultation',
          keyEntities: [{ type: 'date', value: '2024-12-10' }],
          sentiment: 'positive',
          occurredAt: new Date('2024-12-02T09:00:00Z'),
        },
      ];

      return baseEvents.map((event, index) => ({
        ...event,
        ...(overrides[index] ?? {}),
      }));
    };

    // Create reschedule events for appointment_rescheduler pattern
    const createRescheduleEvents = (): EpisodicEvent[] => [
      {
        id: '22222222-0000-0000-0000-000000000001',
        subjectType: 'lead',
        subjectId: testLeadId,
        eventType: 'appointment.rescheduled',
        eventCategory: 'scheduling',
        sourceChannel: 'crm',
        summary: 'Patient rescheduled appointment to next week',
        keyEntities: [],
        sentiment: 'neutral',
        occurredAt: new Date('2024-12-03T10:00:00Z'),
      },
      {
        id: '22222222-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: testLeadId,
        eventType: 'appointment.cancelled',
        eventCategory: 'scheduling',
        sourceChannel: 'crm',
        summary: 'Patient cancelled appointment due to conflict',
        keyEntities: [],
        sentiment: 'negative',
        occurredAt: new Date('2024-12-05T10:00:00Z'),
      },
      {
        id: '22222222-0000-0000-0000-000000000003',
        subjectType: 'lead',
        subjectId: testLeadId,
        eventType: 'appointment.rescheduled',
        eventCategory: 'scheduling',
        sourceChannel: 'crm',
        summary: 'Patient rescheduled again',
        keyEntities: [],
        sentiment: 'neutral',
        occurredAt: new Date('2024-12-07T10:00:00Z'),
      },
    ];

    // Create price-sensitive events
    const createPriceSensitiveEvents = (): EpisodicEvent[] => [
      {
        id: '33333333-0000-0000-0000-000000000001',
        subjectType: 'lead',
        subjectId: testLeadId,
        eventType: 'message.received',
        eventCategory: 'communication',
        sourceChannel: 'whatsapp',
        summary: 'Patient asked about price for procedure',
        keyEntities: [{ type: 'amount', value: '$2500' }],
        sentiment: 'neutral',
        intent: 'price inquiry',
        occurredAt: new Date('2024-12-01T10:00:00Z'),
      },
      {
        id: '33333333-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: testLeadId,
        eventType: 'message.received',
        eventCategory: 'communication',
        sourceChannel: 'whatsapp',
        summary: 'Patient asked about discount options and cost',
        keyEntities: [],
        sentiment: 'neutral',
        intent: 'price negotiation',
        occurredAt: new Date('2024-12-02T10:00:00Z'),
      },
      {
        id: '33333333-0000-0000-0000-000000000003',
        subjectType: 'lead',
        subjectId: testLeadId,
        eventType: 'message.received',
        eventCategory: 'communication',
        sourceChannel: 'whatsapp',
        summary: 'Patient inquired if they can afford the treatment',
        keyEntities: [],
        sentiment: 'neutral',
        occurredAt: new Date('2024-12-03T10:00:00Z'),
      },
    ];

    // Create high engagement events
    const createHighEngagementEvents = (): EpisodicEvent[] => {
      const now = new Date();
      const events: EpisodicEvent[] = [];

      for (let i = 0; i < 8; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i * 3);

        events.push({
          id: `44444444-0000-0000-0000-00000000000${i + 1}`,
          subjectType: 'lead',
          subjectId: testLeadId,
          eventType: i % 2 === 0 ? 'message.received' : 'call.completed',
          eventCategory: 'communication',
          sourceChannel: i % 3 === 0 ? 'whatsapp' : i % 3 === 1 ? 'voice' : 'email',
          summary: `Patient interaction ${i + 1}`,
          keyEntities: [],
          sentiment: 'positive',
          occurredAt: date,
        });
      }

      return events;
    };

    beforeEach(() => {
      vi.clearAllMocks();

      detector = new PatternDetector(mockPool as any, mockOpenAI, {
        ...DEFAULT_COGNITIVE_CONFIG,
        enableLLMPatterns: false, // Disable LLM patterns for faster tests
      });
    });

    describe('Pattern Detection Rules', () => {
      it('should detect appointment_rescheduler pattern', async () => {
        const events = createRescheduleEvents();

        (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes('SELECT') && sql.includes('episodic_events')) {
            return Promise.resolve({
              rows: events.map((e) => ({
                id: e.id,
                subject_type: e.subjectType,
                subject_id: e.subjectId,
                event_type: e.eventType,
                event_category: e.eventCategory,
                source_channel: e.sourceChannel,
                summary: e.summary,
                key_entities: e.keyEntities,
                sentiment: e.sentiment,
                intent: e.intent,
                occurred_at: e.occurredAt,
                processed_at: new Date(),
                metadata: {},
              })),
            });
          }
          if (sql.includes('INSERT INTO behavioral_patterns')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const patterns = await detector.detectPatterns('lead', testLeadId);

        const reschedulerPattern = patterns.find((p) => p.patternType === 'appointment_rescheduler');
        expect(reschedulerPattern).toBeDefined();
        expect(reschedulerPattern?.confidence).toBeGreaterThan(0);
        expect(reschedulerPattern?.supportingEventIds.length).toBeGreaterThan(0);
      });

      it('should detect price_sensitive pattern', async () => {
        const events = createPriceSensitiveEvents();

        (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes('SELECT') && sql.includes('episodic_events')) {
            return Promise.resolve({
              rows: events.map((e) => ({
                id: e.id,
                subject_type: e.subjectType,
                subject_id: e.subjectId,
                event_type: e.eventType,
                event_category: e.eventCategory,
                source_channel: e.sourceChannel,
                summary: e.summary,
                key_entities: e.keyEntities,
                sentiment: e.sentiment,
                intent: e.intent,
                occurred_at: e.occurredAt,
                processed_at: new Date(),
                metadata: {},
              })),
            });
          }
          if (sql.includes('INSERT INTO behavioral_patterns')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const patterns = await detector.detectPatterns('lead', testLeadId);

        const priceSensitivePattern = patterns.find((p) => p.patternType === 'price_sensitive');
        expect(priceSensitivePattern).toBeDefined();
        expect(priceSensitivePattern?.patternDescription).toContain('price sensitivity');
      });

      it('should detect high_engagement pattern', async () => {
        const events = createHighEngagementEvents();

        (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes('SELECT') && sql.includes('episodic_events')) {
            return Promise.resolve({
              rows: events.map((e) => ({
                id: e.id,
                subject_type: e.subjectType,
                subject_id: e.subjectId,
                event_type: e.eventType,
                event_category: e.eventCategory,
                source_channel: e.sourceChannel,
                summary: e.summary,
                key_entities: e.keyEntities,
                sentiment: e.sentiment,
                intent: e.intent,
                occurred_at: e.occurredAt,
                processed_at: new Date(),
                metadata: {},
              })),
            });
          }
          if (sql.includes('INSERT INTO behavioral_patterns')) {
            return Promise.resolve({ rows: [] });
          }
          return Promise.resolve({ rows: [] });
        });

        const patterns = await detector.detectPatterns('lead', testLeadId);

        const engagementPattern = patterns.find((p) => p.patternType === 'high_engagement');
        expect(engagementPattern).toBeDefined();
        expect(engagementPattern?.patternDescription).toContain('engaged');
      });

      it('should return empty array when no events exist', async () => {
        (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

        const patterns = await detector.detectPatterns('lead', testLeadId);

        expect(patterns).toEqual([]);
      });
    });

    describe('Insight Generation', () => {
      it('should generate churn_risk insight from appointment_rescheduler pattern', async () => {
        const storedPattern = {
          id: '55555555-0000-0000-0000-000000000001',
          subject_type: 'lead',
          subject_id: testLeadId,
          pattern_type: 'appointment_rescheduler',
          pattern_description: 'Patient has rescheduled 3 times',
          confidence: 0.75,
          supporting_event_ids: ['event1', 'event2'],
          first_observed_at: new Date('2024-12-01'),
          last_observed_at: new Date('2024-12-07'),
          occurrence_count: 3,
          metadata: {},
        };

        (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes('SELECT') && sql.includes('behavioral_patterns')) {
            return Promise.resolve({ rows: [storedPattern] });
          }
          if (sql.includes('MAX(occurred_at)')) {
            return Promise.resolve({
              rows: [
                {
                  last_interaction: new Date(),
                  recent_count: 5,
                  older_count: 2,
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const insights = await detector.generateInsights('lead', testLeadId);

        const churnInsight = insights.find((i) => i.type === 'churn_risk');
        expect(churnInsight).toBeDefined();
        expect(churnInsight?.recommendedAction).toContain('flexible');
      });

      it('should generate upsell_opportunity from price_sensitive pattern', async () => {
        const storedPattern = {
          id: '55555555-0000-0000-0000-000000000002',
          subject_type: 'lead',
          subject_id: testLeadId,
          pattern_type: 'price_sensitive',
          pattern_description: 'Patient shows price sensitivity',
          confidence: 0.8,
          supporting_event_ids: ['event1'],
          first_observed_at: new Date('2024-12-01'),
          last_observed_at: new Date('2024-12-05'),
          occurrence_count: 2,
          metadata: {},
        };

        (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes('SELECT') && sql.includes('behavioral_patterns')) {
            return Promise.resolve({ rows: [storedPattern] });
          }
          if (sql.includes('MAX(occurred_at)')) {
            return Promise.resolve({
              rows: [{ last_interaction: new Date(), recent_count: 3, older_count: 1 }],
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const insights = await detector.generateInsights('lead', testLeadId);

        const upsellInsight = insights.find((i) => i.type === 'upsell_opportunity');
        expect(upsellInsight).toBeDefined();
        expect(upsellInsight?.recommendedAction).toContain('value');
      });

      it('should detect reactivation_candidate for dormant patients', async () => {
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 90); // 90 days ago

        (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes('SELECT') && sql.includes('behavioral_patterns')) {
            return Promise.resolve({ rows: [] });
          }
          if (sql.includes('MAX(occurred_at)')) {
            return Promise.resolve({
              rows: [
                {
                  last_interaction: oldDate,
                  recent_count: 0,
                  older_count: 5,
                },
              ],
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const insights = await detector.generateInsights('lead', testLeadId);

        const reactivationInsight = insights.find((i) => i.type === 'reactivation_candidate');
        expect(reactivationInsight).toBeDefined();
        expect(reactivationInsight?.recommendedAction).toContain('reactivation');
      });
    });

    describe('Pattern Statistics', () => {
      it('should return pattern stats for dashboard', async () => {
        (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
          if (sql.includes('COUNT(*)') && sql.includes('pattern_type')) {
            return Promise.resolve({
              rows: [
                { pattern_type: 'appointment_rescheduler', count: 10 },
                { pattern_type: 'price_sensitive', count: 15 },
                { pattern_type: 'high_engagement', count: 8 },
              ],
            });
          }
          if (sql.includes('COUNT(*)') && sql.includes('high_confidence')) {
            return Promise.resolve({
              rows: [{ total_patterns: 33, high_confidence: 20, recently_detected: 12 }],
            });
          }
          return Promise.resolve({ rows: [] });
        });

        const stats = await detector.getPatternStats();

        expect(stats.totalPatterns).toBe(33);
        expect(stats.highConfidenceCount).toBe(20);
        expect(stats.recentlyDetected).toBe(12);
        expect(stats.byType).toHaveProperty('appointment_rescheduler');
        expect(stats.byType).toHaveProperty('price_sensitive');
      });
    });

    describe('Stored Patterns Retrieval', () => {
      it('should retrieve stored patterns for a subject', async () => {
        const storedPatterns = [
          {
            id: '66666666-0000-0000-0000-000000000001',
            subject_type: 'lead',
            subject_id: testLeadId,
            pattern_type: 'high_engagement',
            pattern_description: 'Highly engaged patient',
            confidence: 0.85,
            supporting_event_ids: ['e1', 'e2', 'e3'],
            first_observed_at: new Date('2024-12-01'),
            last_observed_at: new Date('2024-12-07'),
            occurrence_count: 5,
            metadata: {},
          },
        ];

        (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
          rows: storedPatterns,
        });

        const patterns = await detector.getStoredPatterns('lead', testLeadId);

        expect(patterns).toHaveLength(1);
        expect(patterns[0]?.patternType).toBe('high_engagement');
        expect(patterns[0]?.confidence).toBe(0.85);
      });
    });
  });
});
