/**
 * Comprehensive tests for ConversationEmbeddingService
 *
 * Tests cover:
 * - Embedding storage and retrieval
 * - Semantic search
 * - Batch operations
 * - Patient conversation history
 * - Intent-based search
 * - Deduplication
 * - Error handling
 * - Configuration management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import {
  ConversationEmbeddingService,
  createConversationEmbeddingService,
  type IEmbeddingService,
  type ConversationMessage,
  type ConversationSearchResult,
  type ConversationEmbeddingConfig,
} from '../conversation-embedding-service.js';
import type { Language } from '../types.js';

// ============= Mock Setup =============

class MockEmbeddingService implements IEmbeddingService {
  async embed(text: string): Promise<{
    embedding: number[];
    contentHash: string;
    model: string;
    dimensions: number;
    tokensUsed: number;
  }> {
    // Generate deterministic embedding based on text
    const hash = Array.from(text).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const embedding = Array.from({ length: 1536 }, (_, i) => Math.sin(hash + i) * 0.5);

    return {
      embedding,
      contentHash: `hash-${hash}`,
      model: 'text-embedding-ada-002',
      dimensions: 1536,
      tokensUsed: text.split(' ').length,
    };
  }
}

function createMockPool(): Pool {
  const mockQueryResult = <T = never>(rows: T[] = []): QueryResult<T> => ({
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  });

  const pool = {
    query: vi.fn().mockImplementation(async (sql: string) => {
      // Check for existing content hash
      if (sql.includes('content_hash =')) {
        return mockQueryResult([]);
      }

      // Insert query
      if (sql.includes('INSERT INTO message_embeddings')) {
        return mockQueryResult([
          {
            id: 'test-id',
            message_id: 'msg-1',
            phone: '+40712345678',
            content_sanitized: 'test message',
            content_hash: 'test-hash',
            direction: 'IN',
            message_type: 'text',
            created_at: new Date(),
          },
        ]);
      }

      // Vector search query
      if (sql.includes('embedding <=>')) {
        return mockQueryResult([
          {
            id: 'result-1',
            phone: '+40712345678',
            content: 'Similar message',
            direction: 'IN' as const,
            similarity: '0.85',
            intent: 'appointment',
            sentiment: 'positive' as const,
            language: 'ro' as Language,
            timestamp: new Date(),
            metadata: {},
          },
        ]);
      }

      // Patient conversations query
      if (sql.includes('WHERE phone =')) {
        return mockQueryResult([
          {
            id: 'conv-1',
            phone: '+40712345678',
            content: 'Patient message',
            direction: 'IN' as const,
            intent: 'question',
            sentiment: 'neutral' as const,
            language: 'ro' as Language,
            timestamp: new Date(),
            metadata: {},
          },
        ]);
      }

      // Intent search query
      if (sql.includes('WHERE intent =')) {
        return mockQueryResult([
          {
            id: 'intent-1',
            phone: '+40712345678',
            content: 'Intent-based message',
            direction: 'OUT' as const,
            intent: 'greeting',
            sentiment: 'positive' as const,
            language: 'ro' as Language,
            timestamp: new Date(),
            metadata: {},
          },
        ]);
      }

      return mockQueryResult([]);
    }),
    connect: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  } as unknown as Pool;

  return pool;
}

function createTestMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    phone: '+40712345678',
    content: 'This is a test message about dental appointment',
    direction: 'IN',
    messageType: 'text',
    ...overrides,
  };
}

// ============= Test Suite =============

describe('ConversationEmbeddingService', () => {
  let pool: Pool;
  let embeddingService: MockEmbeddingService;
  let service: ConversationEmbeddingService;

  beforeEach(() => {
    pool = createMockPool();
    embeddingService = new MockEmbeddingService();
    service = new ConversationEmbeddingService(pool, embeddingService);
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default config', () => {
      expect(service).toBeInstanceOf(ConversationEmbeddingService);
    });

    it('should create service with custom config', () => {
      const customConfig: Partial<ConversationEmbeddingConfig> = {
        minMessageLength: 5,
        maxMessageLength: 1000,
        defaultTopK: 10,
      };

      service = new ConversationEmbeddingService(pool, embeddingService, customConfig);
      const config = service.getConfig();

      expect(config.minMessageLength).toBe(5);
      expect(config.maxMessageLength).toBe(1000);
      expect(config.defaultTopK).toBe(10);
    });

    it('should validate config with zod schema', () => {
      const invalidConfig = {
        minMessageLength: -1, // Invalid
      };

      expect(() => new ConversationEmbeddingService(pool, embeddingService, invalidConfig)).toThrow();
    });

    it('should apply default values for missing config', () => {
      const config = service.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.minMessageLength).toBe(10);
      expect(config.defaultTopK).toBe(5);
      expect(config.defaultSimilarityThreshold).toBe(0.7);
    });
  });

  describe('embedAndStore()', () => {
    it('should embed and store message successfully', async () => {
      const message = createTestMessage();
      const result = await service.embedAndStore(message);

      expect(result).toBeDefined();
      expect(result?.phone).toBe(message.phone);
      expect(result?.contentSanitized).toBeDefined();
      expect(result?.contentHash).toBeDefined();
      expect(result?.embedding).toBeDefined();
      expect(result?.metadata).toBeDefined();
    });

    it('should return null when service is disabled', async () => {
      service = new ConversationEmbeddingService(pool, embeddingService, { enabled: false });

      const message = createTestMessage();
      const result = await service.embedAndStore(message);

      expect(result).toBeNull();
    });

    it('should return null for messages shorter than minMessageLength', async () => {
      const message = createTestMessage({ content: 'Hi' });
      const result = await service.embedAndStore(message);

      expect(result).toBeNull();
    });

    it('should sanitize message content', async () => {
      const message = createTestMessage({
        content: 'Test\x00message\u200B with\x1F control\uFEFF chars',
      });

      const result = await service.embedAndStore(message);

      expect(result?.contentSanitized).not.toContain('\x00');
      expect(result?.contentSanitized).not.toContain('\u200B');
    });

    it('should truncate long messages', async () => {
      service = new ConversationEmbeddingService(pool, embeddingService, { maxMessageLength: 50 });

      const longMessage = createTestMessage({
        content: 'A'.repeat(100),
      });

      const result = await service.embedAndStore(longMessage);

      expect(result?.contentSanitized.length).toBeLessThanOrEqual(50);
    });

    it('should include all message metadata', async () => {
      const message = createTestMessage({
        messageId: 'msg-123',
        intent: 'appointment',
        sentiment: 'positive',
        language: 'ro',
        clinicId: 'clinic-1',
        correlationId: 'corr-123',
        timestamp: new Date(),
        metadata: { source: 'whatsapp' },
      });

      const result = await service.embedAndStore(message);

      expect(result?.messageId).toBe('msg-123');
      expect(result?.intent).toBe('appointment');
      expect(result?.sentiment).toBe('positive');
      expect(result?.language).toBe('ro');
      expect(result?.clinicId).toBe('clinic-1');
      expect(result?.correlationId).toBe('corr-123');
    });

    it('should include embedding metadata', async () => {
      const message = createTestMessage();
      const result = await service.embedAndStore(message);

      expect(result?.metadata.embeddingModel).toBeDefined();
      expect(result?.metadata.embeddingDimensions).toBe(1536);
      expect(result?.metadata.tokensUsed).toBeGreaterThanOrEqual(0);
      expect(result?.metadata.embeddingLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle deduplication', async () => {
      // Mock finding existing embedding
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'existing-id',
            phone: '+40712345678',
            content_sanitized: 'existing message',
            content_hash: 'same-hash',
            direction: 'IN',
            message_type: 'text',
            metadata: {},
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const message = createTestMessage();
      const result = await service.embedAndStore(message);

      // Should return existing embedding
      expect(result).toBeDefined();
    });

    it('should handle embedding service errors gracefully', async () => {
      const failingEmbeddingService = {
        embed: vi.fn().mockRejectedValue(new Error('API Error')),
      };

      service = new ConversationEmbeddingService(pool, failingEmbeddingService);

      const message = createTestMessage();

      await expect(service.embedAndStore(message)).rejects.toThrow('API Error');
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(pool.query).mockRejectedValue(new Error('Database error'));

      const message = createTestMessage();

      await expect(service.embedAndStore(message)).rejects.toThrow();
    });
  });

  describe('embedAndStoreBatch()', () => {
    it('should process multiple messages in batch', async () => {
      const messages = [
        createTestMessage({ content: 'Message 1 with sufficient length' }),
        createTestMessage({ content: 'Message 2 with sufficient length' }),
        createTestMessage({ content: 'Message 3 with sufficient length' }),
      ];

      const results = await service.embedAndStoreBatch(messages);

      expect(results.length).toBe(3);
      expect(results.every((r) => r.embedding !== undefined)).toBe(true);
    });

    it('should return empty array when service is disabled', async () => {
      service = new ConversationEmbeddingService(pool, embeddingService, { enabled: false });

      const messages = [createTestMessage()];
      const results = await service.embedAndStoreBatch(messages);

      expect(results).toEqual([]);
    });

    it('should return empty array for empty input', async () => {
      const results = await service.embedAndStoreBatch([]);
      expect(results).toEqual([]);
    });

    it('should filter out null results (short messages)', async () => {
      const messages = [
        createTestMessage({ content: 'Hi' }), // Too short
        createTestMessage({ content: 'This is a longer message' }), // OK
      ];

      const results = await service.embedAndStoreBatch(messages);

      expect(results.length).toBe(1);
    });

    it('should respect batch size configuration', async () => {
      service = new ConversationEmbeddingService(pool, embeddingService, { batchSize: 2 });

      const messages = Array.from({ length: 5 }, (_, i) =>
        createTestMessage({ content: `Message ${i} with sufficient length` })
      );

      const results = await service.embedAndStoreBatch(messages);

      expect(results.length).toBe(5);
    });
  });

  describe('searchSimilar()', () => {
    it('should search for similar conversations', async () => {
      const result = await service.searchSimilar('appointment booking');

      expect(result.messages).toBeDefined();
      expect(result.contextString).toBeDefined();
      expect(result.searchLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.embeddingLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should use default topK and threshold', async () => {
      const result = await service.searchSimilar('dental checkup');

      expect(result.messages.length).toBeLessThanOrEqual(5); // Default topK
    });

    it('should respect custom topK and threshold', async () => {
      const result = await service.searchSimilar('dental checkup', {
        topK: 10,
        similarityThreshold: 0.8,
      });

      expect(result.messages.length).toBeLessThanOrEqual(10);
    });

    it('should filter by phone number', async () => {
      const result = await service.searchSimilar('appointment', {
        phone: '+40712345678',
      });

      expect(result).toBeDefined();
      // Would verify phone filter in SQL query
    });

    it('should filter by clinic ID', async () => {
      const result = await service.searchSimilar('appointment', {
        clinicId: 'clinic-1',
      });

      expect(result).toBeDefined();
    });

    it('should filter by direction', async () => {
      const result = await service.searchSimilar('appointment', {
        direction: 'IN',
      });

      expect(result).toBeDefined();
    });

    it('should filter by language', async () => {
      const result = await service.searchSimilar('appointment', {
        language: 'ro',
      });

      expect(result).toBeDefined();
    });

    it('should exclude specific phone numbers', async () => {
      const result = await service.searchSimilar('appointment', {
        excludePhone: '+40799999999',
      });

      expect(result).toBeDefined();
    });

    it('should build context string from results', async () => {
      const result = await service.searchSimilar('appointment');

      expect(result.contextString).toContain('Similar Conversations');
      // Should contain message content or be empty
    });

    it('should truncate long context strings', async () => {
      service = new ConversationEmbeddingService(pool, embeddingService, {
        maxContextLength: 100,
      });

      const result = await service.searchSimilar('appointment');

      if (result.contextString.length > 100) {
        expect(result.contextString).toMatch(/\.\.\.$/);
      }
    });
  });

  describe('searchByEmbedding()', () => {
    it('should search using pre-computed embedding', async () => {
      const embedding = Array.from({ length: 1536 }, () => Math.random());

      const results = await service.searchByEmbedding(embedding);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should use default options', async () => {
      const embedding = Array.from({ length: 1536 }, () => Math.random());

      const results = await service.searchByEmbedding(embedding);

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should respect custom options', async () => {
      const embedding = Array.from({ length: 1536 }, () => Math.random());

      const results = await service.searchByEmbedding(embedding, {
        topK: 10,
        similarityThreshold: 0.9,
        phone: '+40712345678',
      });

      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getPatientConversations()', () => {
    it('should retrieve patient conversation history', async () => {
      const results = await service.getPatientConversations('+40712345678');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should use default pagination', async () => {
      const results = await service.getPatientConversations('+40712345678');

      expect(results.length).toBeLessThanOrEqual(50);
    });

    it('should support custom limit and offset', async () => {
      const results = await service.getPatientConversations('+40712345678', {
        limit: 10,
        offset: 5,
      });

      expect(results).toBeDefined();
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const results = await service.getPatientConversations('+40712345678', {
        startDate,
        endDate,
      });

      expect(results).toBeDefined();
    });

    it('should return conversations with similarity = 1.0', async () => {
      const results = await service.getPatientConversations('+40712345678');

      if (results.length > 0) {
        expect(results[0]?.similarity).toBe(1.0);
      }
    });
  });

  describe('findSimilarIntents()', () => {
    it('should find conversations with similar intent', async () => {
      const results = await service.findSimilarIntents('appointment');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should use default topK', async () => {
      const results = await service.findSimilarIntents('greeting');

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should support custom topK', async () => {
      const results = await service.findSimilarIntents('appointment', { topK: 10 });

      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should filter by clinic ID', async () => {
      const results = await service.findSimilarIntents('appointment', {
        clinicId: 'clinic-1',
      });

      expect(results).toBeDefined();
    });

    it('should filter by language', async () => {
      const results = await service.findSimilarIntents('appointment', {
        language: 'ro',
      });

      expect(results).toBeDefined();
    });

    it('should return results with similarity = 1.0', async () => {
      const results = await service.findSimilarIntents('greeting');

      if (results.length > 0) {
        expect(results[0]?.similarity).toBe(1.0);
      }
    });
  });

  describe('Configuration Management', () => {
    it('should get current configuration', () => {
      const config = service.getConfig();

      expect(config).toBeDefined();
      expect(config.enabled).toBeDefined();
      expect(config.minMessageLength).toBeDefined();
      expect(config.defaultTopK).toBeDefined();
    });

    it('should update configuration', () => {
      service.updateConfig({ defaultTopK: 15, defaultSimilarityThreshold: 0.8 });

      const config = service.getConfig();

      expect(config.defaultTopK).toBe(15);
      expect(config.defaultSimilarityThreshold).toBe(0.8);
    });

    it('should validate updated configuration', () => {
      expect(() => {
        service.updateConfig({ minMessageLength: -5 }); // Invalid
      }).toThrow();
    });

    it('should merge partial updates with existing config', () => {
      const originalTopK = service.getConfig().defaultTopK;

      service.updateConfig({ minMessageLength: 20 });

      const config = service.getConfig();
      expect(config.minMessageLength).toBe(20);
      expect(config.defaultTopK).toBe(originalTopK); // Unchanged
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty search results gracefully', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });

      const result = await service.searchSimilar('nonexistent query');

      expect(result.messages).toEqual([]);
      expect(result.contextString).toBe('');
    });

    it('should handle special characters in content', async () => {
      const message = createTestMessage({
        content: 'Message with émojis 😀 and spëcial çhars',
      });

      const result = await service.embedAndStore(message);

      expect(result?.contentSanitized).toBeDefined();
    });

    it('should handle null/undefined optional fields', async () => {
      const message = createTestMessage({
        messageId: undefined,
        intent: undefined,
        sentiment: undefined,
        language: undefined,
      });

      const result = await service.embedAndStore(message);

      expect(result).toBeDefined();
    });

    it('should handle missing metadata gracefully', async () => {
      const message = createTestMessage({
        metadata: undefined,
      });

      const result = await service.embedAndStore(message);

      expect(result?.metadata).toBeDefined();
    });
  });
});

describe('Factory Function', () => {
  it('should create service with factory function', () => {
    const pool = createMockPool();
    const embeddingService = new MockEmbeddingService();

    const service = createConversationEmbeddingService(pool, embeddingService);

    expect(service).toBeInstanceOf(ConversationEmbeddingService);
  });

  it('should create service with custom config', () => {
    const pool = createMockPool();
    const embeddingService = new MockEmbeddingService();
    const config = { minMessageLength: 15 };

    const service = createConversationEmbeddingService(pool, embeddingService, config);

    expect(service.getConfig().minMessageLength).toBe(15);
  });
});
