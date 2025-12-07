/**
 * Memory Retrieval Service Extended Tests
 *
 * Additional tests to achieve 85%+ coverage for cognitive module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryRetrievalService,
  createMemoryRetrievalService,
  encodeCursor,
  decodeCursor,
} from '../memory-retrieval.js';
import { DEFAULT_COGNITIVE_CONFIG } from '../types.js';
import type { IEmbeddingService } from '../episode-builder.js';

describe('MemoryRetrievalService Extended Tests', () => {
  let service: MemoryRetrievalService;
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let mockEmbeddings: IEmbeddingService;

  const testLeadId = '550e8400-e29b-41d4-a716-446655440000';
  const testEmbedding = new Array(1536).fill(0.1);

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };

    mockEmbeddings = {
      embed: vi.fn().mockResolvedValue({
        embedding: testEmbedding,
        contentHash: 'test-hash',
      }),
    };

    service = new MemoryRetrievalService(mockPool as any, mockEmbeddings, DEFAULT_COGNITIVE_CONFIG);
  });

  describe('query', () => {
    it('should filter by event types', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.query({
        subjectId: testLeadId,
        eventTypes: ['message.received', 'message.sent'],
        limit: 10,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('event_type = ANY'),
        expect.arrayContaining([['message.received', 'message.sent']])
      );
    });

    it('should filter by event categories', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.query({
        subjectId: testLeadId,
        eventCategories: ['communication', 'scheduling'],
        limit: 10,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('event_category = ANY'),
        expect.arrayContaining([['communication', 'scheduling']])
      );
    });

    it('should filter by channels', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.query({
        subjectId: testLeadId,
        channels: ['whatsapp', 'voice'],
        limit: 10,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('source_channel = ANY'),
        expect.arrayContaining([['whatsapp', 'voice']])
      );
    });

    it('should filter by date range', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const fromDate = new Date('2024-01-01');
      const toDate = new Date('2024-12-31');

      await service.query({
        subjectId: testLeadId,
        fromDate,
        toDate,
        limit: 10,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('occurred_at >='),
        expect.arrayContaining([fromDate])
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('occurred_at <='),
        expect.arrayContaining([toDate])
      );
    });

    it('should apply minSimilarity from query options', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.query({
        subjectId: testLeadId,
        semanticQuery: 'dental implants',
        minSimilarity: 0.9,
        limit: 5,
      });

      expect(mockEmbeddings.embed).toHaveBeenCalledWith('dental implants');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('embedding'),
        expect.arrayContaining([0.9])
      );
    });

    it('should use default config for minSimilarity', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.query({
        subjectId: testLeadId,
        semanticQuery: 'test query',
        limit: 5,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('embedding'),
        expect.arrayContaining([DEFAULT_COGNITIVE_CONFIG.minSimilarity])
      );
    });

    it('should use default limit from config', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.query({
        subjectId: testLeadId,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining(`LIMIT ${DEFAULT_COGNITIVE_CONFIG.defaultQueryLimit}`),
        expect.any(Array)
      );
    });

    it('should transform rows correctly', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'event-1',
            subject_type: 'lead',
            subject_id: testLeadId,
            event_type: 'message.received',
            event_category: 'communication',
            source_channel: 'whatsapp',
            raw_event_id: 'raw-1',
            summary: 'Test summary',
            key_entities: [{ type: 'procedure', value: 'implant' }],
            sentiment: 'positive',
            intent: 'booking',
            occurred_at: new Date('2024-12-01'),
            processed_at: new Date('2024-12-01'),
            metadata: { test: true },
          },
        ],
      });

      const events = await service.query({ subjectId: testLeadId, limit: 1 });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        id: 'event-1',
        subjectType: 'lead',
        subjectId: testLeadId,
        eventType: 'message.received',
        eventCategory: 'communication',
        sourceChannel: 'whatsapp',
        rawEventId: 'raw-1',
        summary: 'Test summary',
        keyEntities: [{ type: 'procedure', value: 'implant' }],
        sentiment: 'positive',
        intent: 'booking',
        occurredAt: expect.any(Date),
        processedAt: expect.any(Date),
        metadata: { test: true },
      });
    });

    it('should handle null key_entities', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'event-1',
            subject_type: 'lead',
            subject_id: testLeadId,
            event_type: 'message.received',
            event_category: 'communication',
            source_channel: 'whatsapp',
            summary: 'Test',
            key_entities: null,
            sentiment: 'neutral',
            occurred_at: new Date(),
            metadata: null,
          },
        ],
      });

      const events = await service.query({ subjectId: testLeadId, limit: 1 });

      expect(events[0]?.keyEntities).toEqual([]);
      expect(events[0]?.metadata).toBeUndefined();
    });
  });

  describe('getSubjectSummary', () => {
    beforeEach(() => {
      // Setup comprehensive mock responses
      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)') && sql.includes('positive_count')) {
          return Promise.resolve({
            rows: [
              {
                total_events: '10',
                first_interaction: new Date('2024-01-01'),
                last_interaction: new Date('2024-12-01'),
                positive_count: '5',
                neutral_count: '3',
                negative_count: '2',
              },
            ],
          });
        }
        if (sql.includes('GROUP BY source_channel')) {
          return Promise.resolve({
            rows: [
              { source_channel: 'whatsapp', count: '6' },
              { source_channel: 'voice', count: '4' },
            ],
          });
        }
        if (sql.includes('sentiment_scores')) {
          return Promise.resolve({
            rows: [{ recent_avg: 0.8, older_avg: 0.3 }],
          });
        }
        if (sql.includes('behavioral_patterns')) {
          return Promise.resolve({
            rows: [
              {
                id: 'pattern-1',
                subject_type: 'lead',
                subject_id: testLeadId,
                pattern_type: 'preference',
                pattern_description: 'Prefers morning appointments',
                confidence: 0.85,
                supporting_event_ids: ['event-1', 'event-2'],
                first_observed_at: new Date('2024-01-01'),
                last_observed_at: new Date('2024-12-01'),
                occurrence_count: 5,
                metadata: { key: 'value' },
              },
            ],
          });
        }
        // Default for episodic_events query
        return Promise.resolve({
          rows: [
            {
              id: 'event-1',
              subject_type: 'lead',
              subject_id: testLeadId,
              event_type: 'message.received',
              event_category: 'communication',
              source_channel: 'whatsapp',
              summary: 'Recent interaction',
              key_entities: [],
              sentiment: 'positive',
              occurred_at: new Date(),
              metadata: {},
            },
          ],
        });
      });
    });

    it('should return comprehensive summary', async () => {
      const summary = await service.getSubjectSummary('lead', testLeadId);

      expect(summary.subjectType).toBe('lead');
      expect(summary.subjectId).toBe(testLeadId);
      expect(summary.totalEvents).toBe(10);
      expect(summary.firstInteraction).toBeInstanceOf(Date);
      expect(summary.lastInteraction).toBeInstanceOf(Date);
    });

    it('should include channel breakdown', async () => {
      const summary = await service.getSubjectSummary('lead', testLeadId);

      expect(summary.channelBreakdown).toEqual({
        whatsapp: 6,
        voice: 4,
      });
    });

    it('should calculate sentiment trend', async () => {
      const summary = await service.getSubjectSummary('lead', testLeadId);

      // 0.8 - 0.3 = 0.5 > 0.3, so should be 'improving'
      expect(summary.sentimentTrend).toBe('improving');
    });

    it('should include sentiment counts', async () => {
      const summary = await service.getSubjectSummary('lead', testLeadId);

      expect(summary.sentimentCounts).toEqual({
        positive: 5,
        neutral: 3,
        negative: 2,
      });
    });

    it('should include behavioral patterns', async () => {
      const summary = await service.getSubjectSummary('lead', testLeadId);

      expect(summary.patterns).toHaveLength(1);
      expect(summary.patterns[0]?.patternType).toBe('preference');
      expect(summary.patterns[0]?.confidence).toBe(0.85);
    });

    it('should include recent summary', async () => {
      const summary = await service.getSubjectSummary('lead', testLeadId);

      expect(summary.recentSummary).toContain('Recent interaction');
    });

    it('should handle empty stats', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return Promise.resolve({
            rows: [{}],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const summary = await service.getSubjectSummary('lead', testLeadId);

      expect(summary.totalEvents).toBe(0);
      expect(summary.firstInteraction).toBeNull();
      expect(summary.lastInteraction).toBeNull();
    });
  });

  describe('calculateSentimentTrend', () => {
    it('should return stable when no sentiment data', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ recent_avg: null, older_avg: null }],
      });

      // Access via getSubjectSummary
      const summary = await service.getSubjectSummary('lead', testLeadId);
      expect(summary.sentimentTrend).toBe('stable');
    });

    it('should return stable when only recent_avg is null', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes('sentiment_scores')) {
          return Promise.resolve({
            rows: [{ recent_avg: null, older_avg: 0.5 }],
          });
        }
        return Promise.resolve({
          rows: [
            {
              total_events: '0',
              positive_count: '0',
              neutral_count: '0',
              negative_count: '0',
            },
          ],
        });
      });

      const summary = await service.getSubjectSummary('lead', testLeadId);
      expect(summary.sentimentTrend).toBe('stable');
    });

    it('should return improving for positive trend', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes('sentiment_scores')) {
          return Promise.resolve({
            rows: [{ recent_avg: 0.9, older_avg: 0.2 }],
          });
        }
        return Promise.resolve({
          rows: [
            {
              total_events: '0',
              positive_count: '0',
              neutral_count: '0',
              negative_count: '0',
            },
          ],
        });
      });

      const summary = await service.getSubjectSummary('lead', testLeadId);
      expect(summary.sentimentTrend).toBe('improving');
    });

    it('should return declining for negative trend', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes('sentiment_scores')) {
          return Promise.resolve({
            rows: [{ recent_avg: 0.1, older_avg: 0.8 }],
          });
        }
        return Promise.resolve({
          rows: [
            {
              total_events: '0',
              positive_count: '0',
              neutral_count: '0',
              negative_count: '0',
            },
          ],
        });
      });

      const summary = await service.getSubjectSummary('lead', testLeadId);
      expect(summary.sentimentTrend).toBe('declining');
    });

    it('should return stable for small differences', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes('sentiment_scores')) {
          return Promise.resolve({
            rows: [{ recent_avg: 0.5, older_avg: 0.4 }],
          });
        }
        return Promise.resolve({
          rows: [
            {
              total_events: '0',
              positive_count: '0',
              neutral_count: '0',
              negative_count: '0',
            },
          ],
        });
      });

      const summary = await service.getSubjectSummary('lead', testLeadId);
      expect(summary.sentimentTrend).toBe('stable');
    });
  });

  describe('findSimilarInteractions', () => {
    it('should use default options', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.findSimilarInteractions('test query');

      expect(mockEmbeddings.embed).toHaveBeenCalledWith('test query');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 5'),
        expect.any(Array)
      );
    });

    it('should use custom limit', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.findSimilarInteractions('test', { limit: 10 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10'),
        expect.any(Array)
      );
    });

    it('should filter by subjectId', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.findSimilarInteractions('test', { subjectId: testLeadId });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('subject_id'),
        expect.arrayContaining([testLeadId])
      );
    });

    it('should filter by subjectType', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.findSimilarInteractions('test', { subjectType: 'patient' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('subject_type'),
        expect.arrayContaining(['patient'])
      );
    });

    it('should use custom minSimilarity', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.findSimilarInteractions('test', { minSimilarity: 0.95 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('embedding'),
        expect.arrayContaining([0.95])
      );
    });
  });

  describe('getRecentEvents', () => {
    it('should calculate date range correctly', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const now = new Date();
      await service.getRecentEvents('lead', testLeadId, 30, 20);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('occurred_at >='),
        expect.any(Array)
      );
    });

    it('should use default days and limit', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.getRecentEvents('lead', testLeadId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 20'),
        expect.any(Array)
      );
    });

    it('should filter by subject', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.getRecentEvents('patient', testLeadId, 7, 10);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('subject_type'),
        expect.arrayContaining(['patient', testLeadId])
      );
    });
  });

  describe('getEventsByType', () => {
    it('should filter by multiple event types', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.getEventsByType('lead', testLeadId, ['message.received', 'call.completed'], 15);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('event_type = ANY'),
        expect.arrayContaining([['message.received', 'call.completed']])
      );
    });

    it('should use default limit', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.getEventsByType('lead', testLeadId, ['message.received']);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 20'),
        expect.any(Array)
      );
    });
  });

  describe('rowToBehavioralPattern', () => {
    it('should handle null supporting_event_ids', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (sql.includes('behavioral_patterns')) {
          return Promise.resolve({
            rows: [
              {
                id: 'pattern-1',
                subject_type: 'lead',
                subject_id: testLeadId,
                pattern_type: 'preference',
                pattern_description: 'Test pattern',
                confidence: '0.9',
                supporting_event_ids: null,
                first_observed_at: new Date(),
                last_observed_at: new Date(),
                occurrence_count: null,
                metadata: null,
              },
            ],
          });
        }
        return Promise.resolve({
          rows: [
            {
              total_events: '0',
              positive_count: '0',
              neutral_count: '0',
              negative_count: '0',
            },
          ],
        });
      });

      const summary = await service.getSubjectSummary('lead', testLeadId);

      expect(summary.patterns[0]?.supportingEventIds).toEqual([]);
      expect(summary.patterns[0]?.occurrenceCount).toBe(1);
      expect(summary.patterns[0]?.metadata).toBeUndefined();
    });
  });

  describe('createMemoryRetrievalService factory', () => {
    it('should create service with default config', () => {
      const svc = createMemoryRetrievalService(mockPool as any, mockEmbeddings);
      expect(svc).toBeInstanceOf(MemoryRetrievalService);
    });

    it('should create service with custom config', () => {
      const svc = createMemoryRetrievalService(mockPool as any, mockEmbeddings, {
        minSimilarity: 0.9,
        defaultQueryLimit: 50,
      });
      expect(svc).toBeInstanceOf(MemoryRetrievalService);
    });
  });

  describe('Cursor encoding/decoding', () => {
    it('should encode and decode cursor correctly', () => {
      const cursorData = {
        occurredAt: '2024-12-01T10:00:00.000Z',
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const encoded = encodeCursor(cursorData);
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);

      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(cursorData);
    });

    it('should encode cursor with similarity for semantic search', () => {
      const cursorData = {
        occurredAt: '2024-12-01T10:00:00.000Z',
        id: '550e8400-e29b-41d4-a716-446655440000',
        similarity: 0.95,
      };

      const encoded = encodeCursor(cursorData);
      const decoded = decodeCursor(encoded);
      expect(decoded).toEqual(cursorData);
    });

    it('should return null for invalid cursor', () => {
      expect(decodeCursor('invalid-cursor')).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });

    it('should return null for malformed JSON', () => {
      const malformed = Buffer.from('not-json', 'utf-8').toString('base64url');
      expect(decodeCursor(malformed)).toBeNull();
    });

    it('should return null for invalid cursor data schema', () => {
      const invalid = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf-8').toString('base64url');
      expect(decodeCursor(invalid)).toBeNull();
    });
  });

  describe('queryPaginated', () => {
    it('should return paginated results with hasMore=true when more results exist', async () => {
      const rows = [
        {
          id: 'event-1',
          subject_type: 'lead',
          subject_id: testLeadId,
          event_type: 'message.received',
          event_category: 'communication',
          source_channel: 'whatsapp',
          summary: 'First event',
          key_entities: [],
          sentiment: 'neutral',
          occurred_at: new Date('2024-12-01T12:00:00Z'),
          metadata: {},
        },
        {
          id: 'event-2',
          subject_type: 'lead',
          subject_id: testLeadId,
          event_type: 'message.received',
          event_category: 'communication',
          source_channel: 'whatsapp',
          summary: 'Second event',
          key_entities: [],
          sentiment: 'neutral',
          occurred_at: new Date('2024-12-01T11:00:00Z'),
          metadata: {},
        },
        {
          id: 'event-3',
          subject_type: 'lead',
          subject_id: testLeadId,
          event_type: 'message.received',
          event_category: 'communication',
          source_channel: 'whatsapp',
          summary: 'Third event (extra)',
          key_entities: [],
          sentiment: 'neutral',
          occurred_at: new Date('2024-12-01T10:00:00Z'),
          metadata: {},
        },
      ];

      mockPool.query.mockResolvedValue({ rows });

      const result = await service.queryPaginated({
        subjectId: testLeadId,
        pageSize: 2,
      });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should return hasMore=false when no more results', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'event-1',
            subject_type: 'lead',
            subject_id: testLeadId,
            event_type: 'message.received',
            event_category: 'communication',
            source_channel: 'whatsapp',
            summary: 'Only event',
            key_entities: [],
            sentiment: 'neutral',
            occurred_at: new Date('2024-12-01'),
            metadata: {},
          },
        ],
      });

      const result = await service.queryPaginated({
        subjectId: testLeadId,
        pageSize: 10,
      });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.queryPaginated({
        subjectId: testLeadId,
        pageSize: 10,
      });

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should accept and use cursor for pagination', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const cursor = encodeCursor({
        occurredAt: '2024-12-01T10:00:00.000Z',
        id: '550e8400-e29b-41d4-a716-446655440001',
      });

      await service.queryPaginated({
        subjectId: testLeadId,
        pageSize: 10,
        cursor,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('occurred_at <'),
        expect.any(Array)
      );
    });

    it('should throw error for invalid cursor', async () => {
      await expect(
        service.queryPaginated({
          subjectId: testLeadId,
          cursor: 'invalid-cursor',
        })
      ).rejects.toThrow('Invalid pagination cursor');
    });

    it('should use default pageSize from config when not specified', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.queryPaginated({
        subjectId: testLeadId,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining(`LIMIT ${DEFAULT_COGNITIVE_CONFIG.defaultQueryLimit + 1}`),
        expect.any(Array)
      );
    });

    it('should apply all filters correctly', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const fromDate = new Date('2024-01-01');
      const toDate = new Date('2024-12-31');

      await service.queryPaginated({
        subjectType: 'lead',
        subjectId: testLeadId,
        eventTypes: ['message.received'],
        eventCategories: ['communication'],
        channels: ['whatsapp'],
        fromDate,
        toDate,
        pageSize: 5,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('subject_type'),
        expect.arrayContaining(['lead'])
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('event_type = ANY'),
        expect.any(Array)
      );
    });

    it('should include similarity in cursor for semantic search', async () => {
      const eventId1 = '550e8400-e29b-41d4-a716-446655440001';
      const eventId2 = '550e8400-e29b-41d4-a716-446655440002';
      const rows = [
        {
          id: eventId1,
          subject_type: 'lead',
          subject_id: testLeadId,
          event_type: 'message.received',
          event_category: 'communication',
          source_channel: 'whatsapp',
          summary: 'First event',
          key_entities: [],
          sentiment: 'neutral',
          occurred_at: new Date('2024-12-01T10:00:00.000Z'),
          metadata: {},
          similarity: 0.95,
        },
        {
          id: eventId2,
          subject_type: 'lead',
          subject_id: testLeadId,
          event_type: 'message.received',
          event_category: 'communication',
          source_channel: 'whatsapp',
          summary: 'Second event (extra)',
          key_entities: [],
          sentiment: 'neutral',
          occurred_at: new Date('2024-11-30T10:00:00.000Z'),
          metadata: {},
          similarity: 0.9,
        },
      ];

      mockPool.query.mockResolvedValue({ rows });

      const result = await service.queryPaginated({
        subjectId: testLeadId,
        semanticQuery: 'dental implants',
        pageSize: 1,
      });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();

      // Verify cursor contains required fields
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe(eventId1);
      expect(decoded?.occurredAt).toBeDefined();
      // Similarity should be included for semantic search results
      expect(decoded?.similarity).toBe(0.95);
    });

    it('should use cursor with similarity for semantic search pagination', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const cursor = encodeCursor({
        occurredAt: '2024-12-01T10:00:00.000Z',
        id: '550e8400-e29b-41d4-a716-446655440001',
        similarity: 0.9,
      });

      await service.queryPaginated({
        subjectId: testLeadId,
        semanticQuery: 'dental implants',
        pageSize: 10,
        cursor,
      });

      expect(mockEmbeddings.embed).toHaveBeenCalledWith('dental implants');
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should order by similarity DESC for semantic search', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.queryPaginated({
        subjectId: testLeadId,
        semanticQuery: 'dental work',
        pageSize: 10,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY similarity DESC'),
        expect.any(Array)
      );
    });

    it('should order by occurred_at DESC for non-semantic queries', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.queryPaginated({
        subjectId: testLeadId,
        pageSize: 10,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY occurred_at DESC, id DESC'),
        expect.any(Array)
      );
    });

    it('should use limit from query if pageSize not provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.queryPaginated({
        subjectId: testLeadId,
        limit: 15,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 16'),
        expect.any(Array)
      );
    });
  });
});
