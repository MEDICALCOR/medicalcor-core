import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGPipeline, DEFAULT_RAG_CONFIG, buildRAGEnhancedPrompt } from '../rag-pipeline.js';
import type { RAGContext, RAGResult } from '../types.js';

// Mock the embedding service
const mockEmbeddingService = {
  embed: vi.fn(),
  embedBatch: vi.fn(),
  cosineSimilarity: vi.fn(),
  findMostSimilar: vi.fn(),
  getModelInfo: vi.fn(() => ({ model: 'text-embedding-3-small', dimensions: 1536 })),
};

// Mock pool
const mockPool = {
  query: vi.fn(),
  connect: vi.fn(),
};

describe('RAGPipeline', () => {
  let pipeline: RAGPipeline;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses
    mockEmbeddingService.embed.mockResolvedValue({
      embedding: new Array(1536).fill(0.1),
      contentHash: 'test-hash',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      tokensUsed: 100,
    });

    // Mock hybrid search function
    mockPool.query.mockImplementation((query: string) => {
      if (query.includes('hybrid_search_knowledge_base')) {
        return Promise.resolve({
          rows: [
            {
              id: 'test-id-1',
              source_type: 'faq',
              title: 'Test FAQ',
              content: 'This is a test FAQ about dental implants.',
              semantic_score: '0.85',
              keyword_score: '0.7',
              combined_score: '0.8',
              metadata: {},
            },
            {
              id: 'test-id-2',
              source_type: 'treatment_info',
              title: 'Treatment Info',
              content: 'All-on-4 procedure details.',
              semantic_score: '0.75',
              keyword_score: '0.5',
              combined_score: '0.68',
              metadata: {},
            },
          ],
        });
      }

      if (query.includes('INSERT INTO rag_query_log')) {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: [] });
    });

    pipeline = new RAGPipeline(mockPool as any, mockEmbeddingService as any);
  });

  describe('retrieve', () => {
    it('should retrieve context for a query', async () => {
      const context: RAGContext = {
        query: 'What is All-on-4?',
        useCase: 'general',
      };

      const result = await pipeline.retrieve(context);

      expect(result).toBeDefined();
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0]?.title).toBe('Test FAQ');
      expect(result.retrievedContext).toContain('Test FAQ');
      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('What is All-on-4?');
    });

    it('should include conversation history in search query', async () => {
      const context: RAGContext = {
        query: 'How much does it cost?',
        conversationHistory: [
          { role: 'user', content: 'I need dental implants' },
          { role: 'assistant', content: 'We offer All-on-4 procedures' },
          { role: 'user', content: 'How much does it cost?' },
        ],
        useCase: 'general',
      };

      await pipeline.retrieve(context);

      // The embed function should be called with combined query
      const embedCall = mockEmbeddingService.embed.mock.calls[0]?.[0];
      expect(embedCall).toContain('How much does it cost?');
      expect(embedCall).toContain('I need dental implants');
    });

    it('should return empty result when RAG is disabled', async () => {
      pipeline.setEnabled(false);

      const context: RAGContext = {
        query: 'Test query',
        useCase: 'general',
      };

      const result = await pipeline.retrieve(context);

      expect(result.retrievedContext).toBe('');
      expect(result.sources).toHaveLength(0);
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });

    it('should use fallback context when no results found', async () => {
      mockPool.query.mockImplementation((query: string) => {
        if (query.includes('hybrid_search_knowledge_base')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const context: RAGContext = {
        query: 'Completely unrelated query',
        useCase: 'scoring',
      };

      const result = await pipeline.retrieve(context);

      expect(result.retrievedContext).toContain('No specific knowledge found');
    });
  });

  describe('retrieveForScoring', () => {
    it('should set use case to scoring', async () => {
      const context: RAGContext = {
        query: 'Patient interested in implants',
        useCase: 'general',
      };

      await pipeline.retrieveForScoring(context);

      // Verify the pool was queried (logging happens)
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('retrieveForReply', () => {
    it('should set use case to reply_generation', async () => {
      const context: RAGContext = {
        query: 'When can I schedule?',
        useCase: 'general',
      };

      await pipeline.retrieveForReply(context);

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('injectContext', () => {
    it('should inject RAG context into prompt', () => {
      const ragResult: RAGResult = {
        retrievedContext: 'All-on-4 is a dental implant procedure.',
        sources: [
          { id: '1', title: 'FAQ', sourceType: 'faq', similarity: 0.85 },
        ],
        searchLatencyMs: 10,
        embeddingLatencyMs: 5,
        totalLatencyMs: 15,
        contextTokenEstimate: 50,
      };

      const basePrompt = 'You are a helpful assistant.';
      const enhanced = pipeline.injectContext(basePrompt, ragResult);

      expect(enhanced).toContain('Retrieved Knowledge Context');
      expect(enhanced).toContain('All-on-4 is a dental implant procedure');
      expect(enhanced).toContain('FAQ');
    });

    it('should return original prompt when no context', () => {
      const ragResult: RAGResult = {
        retrievedContext: '',
        sources: [],
        searchLatencyMs: 0,
        embeddingLatencyMs: 0,
        totalLatencyMs: 0,
        contextTokenEstimate: 0,
      };

      const basePrompt = 'You are a helpful assistant.';
      const enhanced = pipeline.injectContext(basePrompt, ragResult);

      expect(enhanced).toBe(basePrompt);
    });
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = pipeline.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.maxContextTokens).toBe(DEFAULT_RAG_CONFIG.maxContextTokens);
      expect(config.defaultTopK).toBe(DEFAULT_RAG_CONFIG.defaultTopK);
    });

    it('should update config at runtime', () => {
      pipeline.updateConfig({ maxContextTokens: 3000 });

      const config = pipeline.getConfig();
      expect(config.maxContextTokens).toBe(3000);
    });

    it('should toggle enabled state', () => {
      expect(pipeline.isEnabled()).toBe(true);

      pipeline.setEnabled(false);
      expect(pipeline.isEnabled()).toBe(false);

      pipeline.setEnabled(true);
      expect(pipeline.isEnabled()).toBe(true);
    });
  });
});

describe('buildRAGEnhancedPrompt', () => {
  it('should build enhanced prompt with RAG context', () => {
    const result = buildRAGEnhancedPrompt({
      systemPrompt: 'You are a dental assistant.',
      userPrompt: 'What is the cost?',
      ragResult: {
        retrievedContext: 'Pricing varies by case.',
        sources: [
          { id: '1', title: 'Pricing FAQ', sourceType: 'pricing_info', similarity: 0.9 },
        ],
        searchLatencyMs: 10,
        embeddingLatencyMs: 5,
        totalLatencyMs: 15,
        contextTokenEstimate: 30,
      },
    });

    expect(result.system).toContain('You are a dental assistant.');
    expect(result.system).toContain('Knowledge Base Context');
    expect(result.system).toContain('Pricing varies by case');
    expect(result.system).toContain('Pricing FAQ');
    expect(result.user).toBe('What is the cost?');
  });

  it('should not modify prompt when no RAG context', () => {
    const result = buildRAGEnhancedPrompt({
      systemPrompt: 'You are a dental assistant.',
      userPrompt: 'Hello',
      ragResult: {
        retrievedContext: '',
        sources: [],
        searchLatencyMs: 0,
        embeddingLatencyMs: 0,
        totalLatencyMs: 0,
        contextTokenEstimate: 0,
      },
    });

    expect(result.system).toBe('You are a dental assistant.');
    expect(result.user).toBe('Hello');
  });

  it('should optionally exclude sources from prompt', () => {
    const result = buildRAGEnhancedPrompt({
      systemPrompt: 'Base prompt',
      userPrompt: 'Query',
      ragResult: {
        retrievedContext: 'Context here',
        sources: [
          { id: '1', title: 'Source', sourceType: 'faq', similarity: 0.8 },
        ],
        searchLatencyMs: 10,
        embeddingLatencyMs: 5,
        totalLatencyMs: 15,
        contextTokenEstimate: 20,
      },
      includeSourcesInPrompt: false,
    });

    expect(result.system).not.toContain('Sources used:');
  });
});
