import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EpisodeBuilder,
  MemoryRetrievalService,
  createCognitiveSystem,
  DEFAULT_COGNITIVE_CONFIG,
  type IOpenAIClient,
  type IEmbeddingService,
} from '../index.js';
import type { RawEventContext } from '../types.js';

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
});
