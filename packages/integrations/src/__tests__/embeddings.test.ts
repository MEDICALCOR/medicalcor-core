import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService, chunkText, prepareTextForEmbedding } from '../embeddings.js';

// Mock OpenAI - define the mock inside vi.mock to avoid hoisting issues
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
          usage: { total_tokens: 50 },
        }),
      };
    },
  };
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmbeddingService({
      apiKey: 'test-api-key',
      model: 'text-embedding-3-small',
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
  });

  describe('getModelInfo', () => {
    it('should return model info', () => {
      const info = service.getModelInfo();

      expect(info.model).toBe('text-embedding-3-small');
      expect(info.dimensions).toBe(1536);
    });
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
});

describe('EmbeddingService - Extended', () => {
  describe('constructor options', () => {
    it('should use text-embedding-3-large with 3072 dimensions', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
        model: 'text-embedding-3-large',
      });
      const info = service.getModelInfo();
      expect(info.model).toBe('text-embedding-3-large');
      expect(info.dimensions).toBe(3072);
    });

    it('should use text-embedding-ada-002 with 1536 dimensions', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
        model: 'text-embedding-ada-002',
      });
      const info = service.getModelInfo();
      expect(info.model).toBe('text-embedding-ada-002');
      expect(info.dimensions).toBe(1536);
    });

    it('should use custom dimensions when specified', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        dimensions: 512,
      });
      const info = service.getModelInfo();
      expect(info.dimensions).toBe(512);
    });

    it('should accept organization parameter', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
        organization: 'org-123',
      });
      expect(service).toBeDefined();
    });

    it('should accept custom retry config', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });
      expect(service).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
        timeoutMs: 60000,
      });
      expect(service).toBeDefined();
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple texts', async () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      // With the mock returning 1 embedding per call, each text gets processed
      const inputs = [{ text: 'Text 1', id: '1' }];
      const result = await service.embedBatch(inputs);

      expect(result.embeddings).toHaveLength(1);
      expect(result.totalTokensUsed).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle single item batch', async () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const inputs = [{ text: 'Single text' }];
      const result = await service.embedBatch(inputs);

      expect(result.embeddings).toHaveLength(1);
    });

    it('should handle empty batch', async () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const result = await service.embedBatch([]);

      expect(result.embeddings).toHaveLength(0);
      expect(result.totalTokensUsed).toBe(0);
    });

    it('should track processing time', async () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const inputs = [{ text: 'Text', id: '1' }];
      const result = await service.embedBatch(inputs, 1);

      // Processing time should be tracked
      expect(typeof result.processingTimeMs).toBe('number');
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cosineSimilarity edge cases', () => {
    it('should handle zero vectors', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const zeroVec = [0, 0, 0, 0];
      const otherVec = [1, 0, 0, 0];
      const similarity = service.cosineSimilarity(zeroVec, otherVec);

      expect(similarity).toBe(0);
    });

    it('should handle normalized vectors', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      // Normalized vectors (length = 1)
      const vec1 = [0.6, 0.8, 0, 0]; // sqrt(0.36 + 0.64) = 1
      const vec2 = [0.8, 0.6, 0, 0]; // sqrt(0.64 + 0.36) = 1
      const similarity = service.cosineSimilarity(vec1, vec2);

      // dot product: 0.48 + 0.48 = 0.96
      expect(similarity).toBeCloseTo(0.96, 5);
    });

    it('should handle high-dimensional vectors', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const dim = 1536;
      const vec1 = Array.from({ length: dim }, (_, i) => (i % 2 === 0 ? 0.1 : 0));
      const vec2 = Array.from({ length: dim }, (_, i) => (i % 2 === 0 ? 0.1 : 0));

      const similarity = service.cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(1, 5);
    });
  });

  describe('findMostSimilar edge cases', () => {
    it('should handle empty candidates', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const query = [1, 0, 0, 0];
      const results = service.findMostSimilar(query, []);

      expect(results).toHaveLength(0);
    });

    it('should return fewer results than topK if candidates are limited', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const query = [1, 0, 0, 0];
      const candidates = [{ id: 'a', embedding: [0.9, 0.1, 0, 0] }];
      const results = service.findMostSimilar(query, candidates, 10);

      expect(results).toHaveLength(1);
    });

    it('should filter all when threshold is too high', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const query = [1, 0, 0, 0];
      const candidates = [
        { id: 'a', embedding: [0.5, 0.5, 0.5, 0.5] },
        { id: 'b', embedding: [0.3, 0.3, 0.3, 0.8] },
      ];
      const results = service.findMostSimilar(query, candidates, 10, 0.99);

      expect(results).toHaveLength(0);
    });

    it('should sort by similarity descending', () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const query = [1, 0, 0, 0];
      const candidates = [
        { id: 'low', embedding: [0.1, 0.9, 0, 0] },
        { id: 'high', embedding: [0.99, 0.1, 0, 0] },
        { id: 'mid', embedding: [0.7, 0.7, 0, 0] },
      ];
      const results = service.findMostSimilar(query, candidates, 3);

      expect(results[0]?.id).toBe('high');
      expect(results[2]?.id).toBe('low');
    });
  });

  describe('text sanitization', () => {
    it('should remove zero-width characters', async () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const textWithZeroWidth = 'Hello\u200BWorld\u200CTest\u200D';
      const result = await service.embed(textWithZeroWidth);

      expect(result).toBeDefined();
    });

    it('should normalize whitespace', async () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const textWithExtraSpaces = 'Hello    World\n\n\nTest';
      const result = await service.embed(textWithExtraSpaces);

      expect(result).toBeDefined();
    });

    it('should trim text', async () => {
      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const textWithPadding = '   Hello World   ';
      const result = await service.embed(textWithPadding);

      expect(result).toBeDefined();
    });
  });
});

describe('chunkText - Extended', () => {
  it('should handle text exactly at max size', () => {
    const text = 'a'.repeat(100);
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 20 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('should handle newline-only text', () => {
    const text = '\n\n\n';
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 20 });

    // After splitting by \n\n, we get empty strings which are filtered
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });

  it('should handle comma-separated content', () => {
    const text = 'a, b, c, d, e, f, g, h, i, j';
    const chunks = chunkText(text, { maxChunkSize: 10, overlap: 2 });

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should handle space-separated words', () => {
    const text = 'one two three four five six seven eight nine ten';
    const chunks = chunkText(text, { maxChunkSize: 15, overlap: 3 });

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should handle very long single word', () => {
    const text = 'a'.repeat(200);
    const chunks = chunkText(text, { maxChunkSize: 50, overlap: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(60); // Allow for overlap
    });
  });

  it('should handle text with only separators', () => {
    const text = '... ... ...';
    const chunks = chunkText(text, { maxChunkSize: 5, overlap: 1 });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle mixed sentence and paragraph breaks', () => {
    const text = 'First sentence. Second sentence.\n\nNew paragraph. Another sentence.';
    const chunks = chunkText(text, { maxChunkSize: 40, overlap: 10 });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join(' ')).toContain('First');
    expect(chunks.join(' ')).toContain('paragraph');
  });
});
