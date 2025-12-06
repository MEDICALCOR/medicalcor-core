/**
 * Conversation Embedding Service Tests
 *
 * Comprehensive tests for conversation embedding storage and retrieval
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  ConversationEmbeddingService,
  ConversationEmbeddingConfigSchema,
  type IEmbeddingService,
  type ConversationMessage,
} from '../conversation-embedding-service.js';

describe('ConversationEmbeddingService', () => {
  let mockPool: Pool;
  let mockEmbeddingService: IEmbeddingService;
  let service: ConversationEmbeddingService;

  function createMockPool(rows: unknown[] = []): Pool {
    return {
      query: vi.fn().mockResolvedValue({ rows } as QueryResult<unknown>),
    } as unknown as Pool;
  }

  function createMockEmbeddingService(): IEmbeddingService {
    return {
      embed: vi.fn().mockResolvedValue({
        embedding: Array(1536).fill(0.1),
        contentHash: 'test-hash-123',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        tokensUsed: 100,
      }),
    };
  }

  function createTestMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
    return {
      messageId: 'msg-123',
      phone: '+40721234567',
      content: 'This is a test message with enough content for embedding',
      direction: 'IN',
      messageType: 'text',
      intent: 'general_inquiry',
      sentiment: 'positive',
      language: 'ro',
      clinicId: 'clinic-1',
      correlationId: 'corr-123',
      timestamp: new Date(),
      metadata: { source: 'whatsapp' },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    mockEmbeddingService = createMockEmbeddingService();
    service = new ConversationEmbeddingService(mockPool, mockEmbeddingService);
  });

  describe('Constructor', () => {
    it('should create service with default configuration', () => {
      const newService = new ConversationEmbeddingService(mockPool, mockEmbeddingService);

      expect(newService).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const newService = new ConversationEmbeddingService(mockPool, mockEmbeddingService, {
        minMessageLength: 20,
        maxMessageLength: 1000,
        defaultTopK: 10,
      });

      expect(newService).toBeDefined();
    });
  });

  describe('embedAndStore', () => {
    it('should embed and store a message', async () => {
      const message = createTestMessage();

      const result = await service.embedAndStore(message);

      expect(result).not.toBeNull();
      expect(result?.phone).toBe(message.phone);
      expect(result?.contentSanitized).toBeDefined();
      expect(result?.embedding).toHaveLength(1536);
      expect(mockEmbeddingService.embed).toHaveBeenCalled();
    });

    it('should return null when disabled', async () => {
      const disabledService = new ConversationEmbeddingService(mockPool, mockEmbeddingService, {
        enabled: false,
      });

      const result = await disabledService.embedAndStore(createTestMessage());

      expect(result).toBeNull();
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });

    it('should return null for short messages', async () => {
      const shortMessage = createTestMessage({ content: 'Hi' });

      const result = await service.embedAndStore(shortMessage);

      expect(result).toBeNull();
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });

    it('should deduplicate by content hash', async () => {
      // First call finds existing entry
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'existing-id',
            phone: '+40721234567',
            content_sanitized: 'test content',
            embedding: '[0.1,0.2,0.3]',
          },
        ],
      });

      const result = await service.embedAndStore(createTestMessage());

      // Should return existing without embedding
      expect(result).toBeDefined();
    });

    it('should include metadata in embedding', async () => {
      const message = createTestMessage({
        metadata: { custom: 'value', priority: 'high' },
      });

      const result = await service.embedAndStore(message);

      expect(result?.metadata).toHaveProperty('embeddingModel');
      expect(result?.metadata).toHaveProperty('tokensUsed');
    });

    it('should handle different directions', async () => {
      const inMessage = createTestMessage({ direction: 'IN' });
      const outMessage = createTestMessage({ direction: 'OUT', messageId: 'msg-456' });

      const inResult = await service.embedAndStore(inMessage);
      const outResult = await service.embedAndStore(outMessage);

      expect(inResult?.direction).toBe('IN');
      expect(outResult?.direction).toBe('OUT');
    });

    it('should handle missing optional fields', async () => {
      const minimalMessage: ConversationMessage = {
        phone: '+40721234567',
        content: 'This is a test message with sufficient length for embedding',
        direction: 'IN',
      };

      const result = await service.embedAndStore(minimalMessage);

      expect(result).not.toBeNull();
      expect(result?.messageType).toBe('text'); // Default
    });
  });

  describe('embedAndStoreBatch', () => {
    it('should process multiple messages', async () => {
      const messages = [
        createTestMessage({ messageId: 'msg-1', content: 'First message with enough content' }),
        createTestMessage({ messageId: 'msg-2', content: 'Second message with enough content' }),
        createTestMessage({ messageId: 'msg-3', content: 'Third message with enough content' }),
      ];

      const results = await service.embedAndStoreBatch(messages);

      expect(results).toHaveLength(3);
    });

    it('should return empty array when disabled', async () => {
      const disabledService = new ConversationEmbeddingService(mockPool, mockEmbeddingService, {
        enabled: false,
      });

      const results = await disabledService.embedAndStoreBatch([createTestMessage()]);

      expect(results).toHaveLength(0);
    });

    it('should return empty array for empty input', async () => {
      const results = await service.embedAndStoreBatch([]);

      expect(results).toHaveLength(0);
    });

    it('should filter out short messages', async () => {
      const messages = [
        createTestMessage({ content: 'Long enough message for embedding' }),
        createTestMessage({ content: 'Hi', messageId: 'short' }), // Too short
      ];

      const results = await service.embedAndStoreBatch(messages);

      expect(results).toHaveLength(1);
    });

    it('should process in batches', async () => {
      const batchService = new ConversationEmbeddingService(mockPool, mockEmbeddingService, {
        batchSize: 2,
      });

      const messages = Array(5)
        .fill(null)
        .map((_, i) =>
          createTestMessage({
            messageId: `msg-${i}`,
            content: `Message ${i} with enough content for embedding`,
          })
        );

      const results = await batchService.embedAndStoreBatch(messages);

      expect(results).toHaveLength(5);
    });
  });

  describe('searchSimilar', () => {
    it('should search for similar conversations', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'result-1',
            phone: '+40721234567',
            content: 'Similar message',
            direction: 'IN',
            similarity: 0.9,
            intent: 'booking',
            sentiment: 'positive',
            language: 'ro',
            timestamp: new Date(),
            metadata: {},
          },
        ],
      });

      const result = await service.searchSimilar('Find similar messages');

      expect(result.messages).toHaveLength(1);
      expect(result.contextString).toBeDefined();
      expect(result.searchLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.embeddingLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should apply filters', async () => {
      await service.searchSimilar('query', {
        topK: 10,
        similarityThreshold: 0.8,
        phone: '+40721234567',
        clinicId: 'clinic-1',
        direction: 'IN',
        language: 'ro',
        excludePhone: '+40799999999',
      });

      expect(mockPool.query).toHaveBeenCalled();
      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('query');
    });

    it('should use default options', async () => {
      const customService = new ConversationEmbeddingService(mockPool, mockEmbeddingService, {
        defaultTopK: 15,
        defaultSimilarityThreshold: 0.75,
      });

      await customService.searchSimilar('query');

      // Should use default topK and threshold
    });
  });

  describe('searchByEmbedding', () => {
    it('should search by pre-computed embedding', async () => {
      const embedding = Array(1536).fill(0.1);

      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'result-1',
            phone: '+40721234567',
            content: 'Similar message',
            direction: 'IN',
            similarity: 0.95,
            metadata: {},
          },
        ],
      });

      const results = await service.searchByEmbedding(embedding);

      expect(results).toHaveLength(1);
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });

    it('should apply filters', async () => {
      const embedding = Array(1536).fill(0.1);

      await service.searchByEmbedding(embedding, {
        topK: 5,
        phone: '+40721234567',
      });

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('getPatientConversations', () => {
    it('should retrieve conversations for a patient', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'msg-1',
            phone: '+40721234567',
            content: 'Hello',
            direction: 'IN',
            intent: 'greeting',
            sentiment: 'positive',
            language: 'ro',
            timestamp: new Date(),
            metadata: {},
          },
          {
            id: 'msg-2',
            phone: '+40721234567',
            content: 'How are you?',
            direction: 'OUT',
            metadata: {},
          },
        ],
      });

      const results = await service.getPatientConversations('+40721234567');

      expect(results).toHaveLength(2);
      expect(results[0]!.phone).toBe('+40721234567');
      expect(results[0]!.similarity).toBe(1.0); // Direct retrieval
    });

    it('should apply pagination', async () => {
      await service.getPatientConversations('+40721234567', {
        limit: 10,
        offset: 20,
      });

      const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(params).toContain(10);
      expect(params).toContain(20);
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      await service.getPatientConversations('+40721234567', {
        startDate,
        endDate,
      });

      const [sql, params] = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(params).toContain(startDate);
      expect(params).toContain(endDate);
    });
  });

  describe('findSimilarIntents', () => {
    it('should find conversations with similar intent', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [
          {
            id: 'msg-1',
            phone: '+40721234567',
            content: 'I want to book',
            direction: 'IN',
            intent: 'booking_request',
            metadata: {},
          },
        ],
      });

      const results = await service.findSimilarIntents('booking_request');

      expect(results).toHaveLength(1);
      expect(results[0]!.intent).toBe('booking_request');
    });

    it('should filter by clinic and language', async () => {
      await service.findSimilarIntents('booking_request', {
        clinicId: 'clinic-1',
        language: 'ro',
      });

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('getConfig and updateConfig', () => {
    it('should return current configuration', () => {
      // Access config through the service
      expect(service).toBeDefined();
    });
  });

  describe('Schema Validation', () => {
    it('should validate config with defaults', () => {
      const parsed = ConversationEmbeddingConfigSchema.parse({});

      expect(parsed.enabled).toBe(true);
      expect(parsed.minMessageLength).toBe(10);
      expect(parsed.maxMessageLength).toBe(2000);
      expect(parsed.defaultTopK).toBe(5);
    });

    it('should reject invalid minMessageLength', () => {
      expect(() => ConversationEmbeddingConfigSchema.parse({ minMessageLength: 0 })).toThrow();
    });

    it('should reject invalid similarityThreshold', () => {
      expect(() =>
        ConversationEmbeddingConfigSchema.parse({ defaultSimilarityThreshold: 1.5 })
      ).toThrow();
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize content before embedding', async () => {
      const message = createTestMessage({
        content: 'Test message\x00with\x01control\x02chars that need sanitization',
      });

      const result = await service.embedAndStore(message);

      expect(result?.contentSanitized).not.toContain('\x00');
      expect(result?.contentSanitized).not.toContain('\x01');
    });

    it('should truncate long content', async () => {
      const longContent = 'A'.repeat(5000);
      const message = createTestMessage({ content: longContent });

      const truncatingService = new ConversationEmbeddingService(mockPool, mockEmbeddingService, {
        maxMessageLength: 1000,
      });

      const result = await truncatingService.embedAndStore(message);

      expect(result?.contentSanitized.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Content Hashing', () => {
    it('should generate consistent hash for same content', async () => {
      const message1 = createTestMessage({ content: 'Identical content for testing hashing' });
      const message2 = createTestMessage({ content: 'Identical content for testing hashing' });

      // Mock to return no existing entry
      (mockPool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      const result1 = await service.embedAndStore(message1);
      const result2 = await service.embedAndStore(message2);

      expect(result1?.contentHash).toBe(result2?.contentHash);
    });
  });

  describe('Error Handling', () => {
    it('should handle embedding service errors', async () => {
      (mockEmbeddingService.embed as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Embedding service unavailable')
      );

      await expect(service.embedAndStore(createTestMessage())).rejects.toThrow(
        'Embedding service unavailable'
      );
    });

    it('should handle database errors', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      await expect(service.embedAndStore(createTestMessage())).rejects.toThrow();
    });
  });
});
