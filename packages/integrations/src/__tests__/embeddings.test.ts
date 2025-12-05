import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EmbeddingService,
  createEmbeddingService,
  chunkText,
  prepareTextForEmbedding,
} from '../embeddings.js';
import { ExternalServiceError } from '@medicalcor/core';

// Mock OpenAI - define the mock inside vi.mock to avoid hoisting issues
const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: mockCreate,
      };
    },
  };
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock response
    mockCreate.mockResolvedValue({
      data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
      usage: { total_tokens: 50 },
    });

    service = new EmbeddingService({
      apiKey: 'test-api-key',
      model: 'text-embedding-3-small',
    });
  });

  describe('constructor', () => {
    it('should create service with minimal config', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
      });
      expect(svc).toBeInstanceOf(EmbeddingService);
      expect(svc.getModelInfo().model).toBe('text-embedding-3-small');
      expect(svc.getModelInfo().dimensions).toBe(1536);
    });

    it('should create service with text-embedding-3-large', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
      });
      expect(svc.getModelInfo().model).toBe('text-embedding-3-large');
      expect(svc.getModelInfo().dimensions).toBe(3072);
    });

    it('should create service with text-embedding-ada-002', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
        model: 'text-embedding-ada-002',
      });
      expect(svc.getModelInfo().model).toBe('text-embedding-ada-002');
      expect(svc.getModelInfo().dimensions).toBe(1536);
    });

    it('should use custom dimensions when provided', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        dimensions: 512,
      });
      expect(svc.getModelInfo().dimensions).toBe(512);
    });

    it('should use default retry config when not provided', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
      });
      expect(svc).toBeInstanceOf(EmbeddingService);
    });

    it('should accept custom retry config', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
        retryConfig: { maxRetries: 5, baseDelayMs: 2000 },
      });
      expect(svc).toBeInstanceOf(EmbeddingService);
    });

    it('should accept custom timeout', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
        timeoutMs: 60000,
      });
      expect(svc).toBeInstanceOf(EmbeddingService);
    });

    it('should accept organization parameter', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
        organization: 'org-123',
      });
      expect(svc).toBeInstanceOf(EmbeddingService);
    });

    it('should throw on invalid config', () => {
      expect(() => {
        new EmbeddingService({
          apiKey: '',
        });
      }).toThrow();
    });
  });

  describe('embed', () => {
    it('should generate embedding for text', async () => {
      const result = await service.embed('Hello, world!');

      expect(result).toBeDefined();
      expect(result.embedding).toHaveLength(1536);
      expect(result.contentHash).toBeDefined();
      expect(result.model).toBe('text-embedding-3-small');
      expect(result.dimensions).toBe(1536);
      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('should sanitize text before embedding', async () => {
      const textWithControlChars = 'Hello\x00\x1FWorld';
      const result = await service.embed(textWithControlChars);

      expect(result).toBeDefined();
      expect(result.contentHash).toBeDefined();
    });

    it('should remove zero-width characters', async () => {
      const textWithZeroWidth = 'Hello\u200B\u200C\u200D\uFEFFWorld';
      const result = await service.embed(textWithZeroWidth);

      expect(result).toBeDefined();
      expect(mockCreate).toHaveBeenCalled();
      const calledWith = mockCreate.mock.calls[0]?.[0];
      expect(calledWith.input).not.toContain('\u200B');
    });

    it('should normalize whitespace', async () => {
      const textWithExtraWhitespace = 'Hello    \n\n\n   World';
      await service.embed(textWithExtraWhitespace);

      const calledWith = mockCreate.mock.calls[0]?.[0];
      expect(calledWith.input).toBe('Hello World');
    });

    it('should truncate very long text', async () => {
      const longText = 'A'.repeat(50000);
      await service.embed(longText);

      const calledWith = mockCreate.mock.calls[0]?.[0];
      expect(calledWith.input.length).toBeLessThanOrEqual(32000);
    });

    it('should generate consistent hash for same content', async () => {
      const result1 = await service.embed('Test content');
      const result2 = await service.embed('Test content');

      expect(result1.contentHash).toBe(result2.contentHash);
    });

    it('should generate different hash for different content', async () => {
      const result1 = await service.embed('Content A');
      const result2 = await service.embed('Content B');

      expect(result1.contentHash).not.toBe(result2.contentHash);
    });

    it('should throw ExternalServiceError on empty response', async () => {
      mockCreate.mockResolvedValueOnce({
        data: [],
        usage: { total_tokens: 0 },
      });

      await expect(service.embed('test')).rejects.toThrow(ExternalServiceError);
    });
  });

  describe('embedBatch', () => {
    it('should process single batch', async () => {
      const inputs = [{ text: 'Text 1' }, { text: 'Text 2' }, { text: 'Text 3' }];

      mockCreate.mockResolvedValueOnce({
        data: [
          { embedding: new Array(1536).fill(0.1), index: 0 },
          { embedding: new Array(1536).fill(0.2), index: 1 },
          { embedding: new Array(1536).fill(0.3), index: 2 },
        ],
        usage: { total_tokens: 150 },
      });

      const result = await service.embedBatch(inputs);

      expect(result.embeddings).toHaveLength(3);
      expect(result.totalTokensUsed).toBe(150);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should process multiple batches', async () => {
      // Create 250 inputs to test multiple batches (default batch size is 100)
      const inputs = Array.from({ length: 250 }, (_, i) => ({ text: `Text ${i}` }));

      mockCreate.mockImplementation(async () => ({
        data: Array.from({ length: 100 }, (_, i) => ({
          embedding: new Array(1536).fill(0.1),
          index: i,
        })),
        usage: { total_tokens: 500 },
      }));

      const result = await service.embedBatch(inputs);

      expect(result.embeddings.length).toBeGreaterThan(0);
      expect(mockCreate).toHaveBeenCalledTimes(3); // 250 inputs / 100 batch size = 3 batches
      expect(result.totalTokensUsed).toBeGreaterThan(0);
    });

    it('should use custom batch size', async () => {
      const inputs = Array.from({ length: 150 }, (_, i) => ({ text: `Text ${i}` }));

      mockCreate.mockImplementation(async () => ({
        data: Array.from({ length: 50 }, (_, i) => ({
          embedding: new Array(1536).fill(0.1),
          index: i,
        })),
        usage: { total_tokens: 250 },
      }));

      await service.embedBatch(inputs, 50);

      expect(mockCreate).toHaveBeenCalledTimes(3); // 150 / 50 = 3 batches
    });

    it('should sanitize all texts in batch', async () => {
      const inputs = [
        { text: 'Hello\x00World' },
        { text: 'Test\u200BText' },
        { text: 'Normal   text' },
      ];

      mockCreate.mockResolvedValueOnce({
        data: Array.from({ length: 3 }, (_, i) => ({
          embedding: new Array(1536).fill(0.1),
          index: i,
        })),
        usage: { total_tokens: 150 },
      });

      await service.embedBatch(inputs);

      const calledWith = mockCreate.mock.calls[0]?.[0];
      expect(calledWith.input).toHaveLength(3);
      expect(calledWith.input[0]).not.toContain('\x00');
      expect(calledWith.input[1]).not.toContain('\u200B');
    });

    it('should include content hashes for all embeddings', async () => {
      const inputs = [{ text: 'Text 1' }, { text: 'Text 2' }];

      mockCreate.mockResolvedValueOnce({
        data: [
          { embedding: new Array(1536).fill(0.1), index: 0 },
          { embedding: new Array(1536).fill(0.2), index: 1 },
        ],
        usage: { total_tokens: 100 },
      });

      const result = await service.embedBatch(inputs);

      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0]?.contentHash).toBeDefined();
      expect(result.embeddings[1]?.contentHash).toBeDefined();
      expect(result.embeddings[0]?.contentHash).not.toBe(result.embeddings[1]?.contentHash);
    });

    it('should handle empty batch', async () => {
      const result = await service.embedBatch([]);

      expect(result.embeddings).toHaveLength(0);
      expect(result.totalTokensUsed).toBe(0);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should include proper token counts per embedding', async () => {
      const inputs = [{ text: 'Text 1' }, { text: 'Text 2' }];

      mockCreate.mockResolvedValueOnce({
        data: [
          { embedding: new Array(1536).fill(0.1), index: 0 },
          { embedding: new Array(1536).fill(0.2), index: 1 },
        ],
        usage: { total_tokens: 100 },
      });

      const result = await service.embedBatch(inputs);

      expect(result.embeddings[0]?.tokensUsed).toBe(50); // 100 / 2
      expect(result.embeddings[1]?.tokensUsed).toBe(50);
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate similarity between identical vectors', () => {
      const vec = [1, 0, 0, 0];
      const similarity = service.cosineSimilarity(vec, vec);

      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should calculate similarity between orthogonal vectors', () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [0, 1, 0, 0];
      const similarity = service.cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(0, 5);
    });

    it('should calculate similarity between opposite vectors', () => {
      const vec1 = [1, 0, 0, 0];
      const vec2 = [-1, 0, 0, 0];
      const similarity = service.cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should handle similar vectors', () => {
      const vec1 = [0.8, 0.6, 0, 0];
      const vec2 = [0.7, 0.7, 0.1, 0];
      const similarity = service.cosineSimilarity(vec1, vec2);

      expect(similarity).toBeGreaterThan(0.9);
      expect(similarity).toBeLessThan(1);
    });

    it('should throw for vectors of different dimensions', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0, 0];

      expect(() => service.cosineSimilarity(vec1, vec2)).toThrow(
        'Embeddings must have the same dimensions'
      );
    });

    it('should handle zero magnitude vectors', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 2, 3];
      const similarity = service.cosineSimilarity(vec1, vec2);

      expect(similarity).toBe(0);
    });

    it('should handle both zero magnitude vectors', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [0, 0, 0];
      const similarity = service.cosineSimilarity(vec1, vec2);

      expect(similarity).toBe(0);
    });
  });

  describe('findMostSimilar', () => {
    it('should find most similar embeddings', () => {
      const query = [1, 0, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0, 0] },
        { id: 'b', embedding: [0, 1, 0, 0] },
        { id: 'c', embedding: [0.8, 0.6, 0, 0] },
      ];

      const results = service.findMostSimilar(query, candidates, 2);

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('a');
      expect(results[0]?.similarity).toBeGreaterThan(0.9);
    });

    it('should respect topK parameter', () => {
      const query = [1, 0, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0, 0] },
        { id: 'b', embedding: [0.8, 0.2, 0, 0] },
        { id: 'c', embedding: [0.7, 0.3, 0, 0] },
        { id: 'd', embedding: [0.6, 0.4, 0, 0] },
      ];

      const results = service.findMostSimilar(query, candidates, 2);

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('a');
      expect(results[1]?.id).toBe('b');
    });

    it('should respect threshold', () => {
      const query = [1, 0, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0, 0] }, // ~0.99 similarity
        { id: 'b', embedding: [0, 1, 0, 0] }, // 0 similarity
        { id: 'c', embedding: [0.5, 0.5, 0.5, 0.5] }, // ~0.5 similarity
      ];

      const results = service.findMostSimilar(query, candidates, 10, 0.8);

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('a');
    });

    it('should return empty array when no candidates meet threshold', () => {
      const query = [1, 0, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0, 1, 0, 0] },
        { id: 'b', embedding: [0, 0, 1, 0] },
      ];

      const results = service.findMostSimilar(query, candidates, 10, 0.9);

      expect(results).toHaveLength(0);
    });

    it('should use default topK of 5', () => {
      const query = [1, 0, 0, 0];
      const candidates = Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i}`,
        embedding: [0.9 - i * 0.05, 0.1 + i * 0.05, 0, 0],
      }));

      const results = service.findMostSimilar(query, candidates);

      expect(results).toHaveLength(5);
    });

    it('should use default threshold of 0', () => {
      const query = [1, 0, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.9, 0.1, 0, 0] }, // Positive similarity
        { id: 'b', embedding: [0.5, 0.5, 0, 0] }, // Positive similarity
      ];

      const results = service.findMostSimilar(query, candidates, 10);

      expect(results).toHaveLength(2); // Both included since threshold is 0 and both >= 0
    });

    it('should sort by similarity descending', () => {
      const query = [1, 0, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.7, 0.3, 0, 0] },
        { id: 'b', embedding: [0.9, 0.1, 0, 0] },
        { id: 'c', embedding: [0.8, 0.2, 0, 0] },
      ];

      const results = service.findMostSimilar(query, candidates, 10);

      expect(results[0]?.id).toBe('b');
      expect(results[1]?.id).toBe('c');
      expect(results[2]?.id).toBe('a');
    });
  });

  describe('getModelInfo', () => {
    it('should return model info', () => {
      const info = service.getModelInfo();

      expect(info.model).toBe('text-embedding-3-small');
      expect(info.dimensions).toBe(1536);
    });

    it('should return custom dimensions when set', () => {
      const svc = new EmbeddingService({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        dimensions: 768,
      });

      const info = svc.getModelInfo();

      expect(info.dimensions).toBe(768);
    });
  });
});

describe('createEmbeddingService', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
      usage: { total_tokens: 50 },
    });
  });

  it('should create EmbeddingService instance', () => {
    const service = createEmbeddingService({
      apiKey: 'test-key',
    });

    expect(service).toBeInstanceOf(EmbeddingService);
  });

  it('should pass config to service', () => {
    const service = createEmbeddingService({
      apiKey: 'test-key',
      model: 'text-embedding-3-large',
      dimensions: 1024,
    });

    const info = service.getModelInfo();
    expect(info.model).toBe('text-embedding-3-large');
    expect(info.dimensions).toBe(1024);
  });
});

describe('chunkText', () => {
  it('should return original text if under max size', () => {
    const text = 'Short text';
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 20 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('should split text by paragraphs', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const chunks = chunkText(text, { maxChunkSize: 30, overlap: 5 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.some((c) => c.includes('Paragraph one'))).toBe(true);
  });

  it('should handle long text without natural breaks', () => {
    const text = 'a'.repeat(500);
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(120); // Allow for overlap
    });
  });

  it('should split by sentences when paragraphs are too long', () => {
    const text =
      'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
    const chunks = chunkText(text, { maxChunkSize: 40, overlap: 10 });

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should preserve content across chunks', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';
    const chunks = chunkText(text, { maxChunkSize: 50, overlap: 10 });

    // All original words should appear in at least one chunk
    const allContent = chunks.join(' ');
    expect(allContent).toContain('quick');
    expect(allContent).toContain('lazy');
    expect(allContent).toContain('dozen');
  });

  it('should handle empty text', () => {
    const chunks = chunkText('', { maxChunkSize: 100, overlap: 20 });
    expect(chunks).toHaveLength(0);
  });

  it('should use custom separator', () => {
    const text = 'item1|item2|item3|item4';
    const chunks = chunkText(text, { maxChunkSize: 15, overlap: 0, separator: '|' });

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should add overlap between chunks', () => {
    const text = 'AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC DDDDDDDDDD';
    const chunks = chunkText(text, { maxChunkSize: 20, overlap: 5 });

    expect(chunks.length).toBeGreaterThan(1);
    // Check that some content appears in multiple chunks (due to overlap)
    for (let i = 1; i < chunks.length; i++) {
      // Each chunk after the first should include some content from the previous
      const prevChunk = chunks[i - 1]!;
      const currentChunk = chunks[i]!;
      const prevEnd = prevChunk.slice(-5);
      expect(currentChunk).toContain(prevEnd.charAt(0) || '');
    }
  });

  it('should handle text with multiple separator types', () => {
    const text = 'Part1. Part2, Part3 Part4';
    const chunks = chunkText(text, { maxChunkSize: 10, overlap: 0 });

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should use default options', () => {
    const text = 'A'.repeat(2000);
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(1200); // 1000 + 200 overlap
    });
  });
});

describe('prepareTextForEmbedding', () => {
  it('should add metadata prefix to content', () => {
    const result = prepareTextForEmbedding('Main content here', {
      title: 'Test Document',
      sourceType: 'faq',
      tags: ['dental', 'implant'],
    });

    expect(result).toContain('Title: Test Document');
    expect(result).toContain('Type: faq');
    expect(result).toContain('Tags: dental, implant');
    expect(result).toContain('Main content here');
  });

  it('should handle missing metadata gracefully', () => {
    const result = prepareTextForEmbedding('Just content');

    expect(result).toContain('Just content');
    expect(result).not.toContain('Title:');
    expect(result).not.toContain('Type:');
  });

  it('should handle partial metadata', () => {
    const result = prepareTextForEmbedding('Content', {
      title: 'Only Title',
    });

    expect(result).toContain('Title: Only Title');
    expect(result).not.toContain('Type:');
    expect(result).not.toContain('Tags:');
  });

  it('should handle empty tags array', () => {
    const result = prepareTextForEmbedding('Content', {
      title: 'Title',
      tags: [],
    });

    expect(result).not.toContain('Tags:');
  });

  it('should include sourceType only', () => {
    const result = prepareTextForEmbedding('Content', {
      sourceType: 'article',
    });

    expect(result).toContain('Type: article');
    expect(result).not.toContain('Title:');
    expect(result).not.toContain('Tags:');
  });

  it('should include tags only', () => {
    const result = prepareTextForEmbedding('Content', {
      tags: ['tag1', 'tag2'],
    });

    expect(result).toContain('Tags: tag1, tag2');
    expect(result).not.toContain('Title:');
    expect(result).not.toContain('Type:');
  });

  it('should handle single tag', () => {
    const result = prepareTextForEmbedding('Content', {
      tags: ['single'],
    });

    expect(result).toContain('Tags: single');
  });

  it('should separate metadata and content with blank line', () => {
    const result = prepareTextForEmbedding('Content', {
      title: 'Title',
    });

    expect(result).toMatch(/Title: Title\n\nContent/);
  });

  it('should handle language field (even though not listed in parts)', () => {
    const result = prepareTextForEmbedding('Content', {
      language: 'en',
    });

    // Language is not used in the current implementation, but metadata is optional
    expect(result).toContain('Content');
  });
});
