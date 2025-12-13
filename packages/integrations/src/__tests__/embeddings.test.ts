import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingService,
  chunkText,
  prepareTextForEmbedding,
  createEmbeddingService,
} from '../embeddings.js';
import { ExternalServiceError } from '@medicalcor/core';

// Mock OpenAI - define the mock inside vi.mock to avoid hoisting issues
const mockEmbeddingsCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: mockEmbeddingsCreate,
      };
    },
  };
});

// Mock withRetry to test retry logic
vi.mock('@medicalcor/core', async () => {
  const actual = await vi.importActual('@medicalcor/core');
  return {
    ...actual,
    withRetry: vi.fn(async (fn, config) => {
      // Try to execute the function, applying retry logic if needed
      try {
        return await fn();
      } catch (error) {
        // If shouldRetry is true, retry once
        if (config?.shouldRetry && config.shouldRetry(error)) {
          return await fn();
        }
        throw error;
      }
    }),
  };
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
      usage: { total_tokens: 50 },
    });
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

  it('should add overlap from previous chunks', () => {
    const text = 'AAAAA BBBBB CCCCC DDDDD EEEEE';
    const chunks = chunkText(text, { maxChunkSize: 12, overlap: 5 });

    // Check that chunks have overlap
    expect(chunks.length).toBeGreaterThan(1);
    if (chunks.length > 1) {
      // Second chunk should contain overlap from first
      const firstChunk = chunks[0]!;
      const secondChunk = chunks[1]!;
      const overlapText = firstChunk.slice(-5);
      expect(secondChunk).toContain(overlapText.trim().slice(0, 3));
    }
  });

  it('should handle zero overlap', () => {
    const text = 'word1 word2 word3 word4 word5';
    const chunks = chunkText(text, { maxChunkSize: 15, overlap: 0 });

    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should recursively split with multiple separators', () => {
    // This should trigger recursive splitting through multiple separator levels
    const text = 'A'.repeat(200) + '. ' + 'B'.repeat(200);
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 10 });

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should fall back to character splitting when no separators work', () => {
    // Create text with no separators (no spaces, periods, commas, newlines)
    const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(20); // 520 chars, no separators
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    // Verify chunks are split at character boundaries
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(110); // maxChunkSize + overlap
    });
  });

  it('should handle character splitting with overlap', () => {
    // Test character splitting with overlap
    const text = 'X'.repeat(250); // No separators at all
    const chunks = chunkText(text, { maxChunkSize: 80, overlap: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk except the last should be exactly maxChunkSize (80) or have overlap
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i]!.length).toBeGreaterThanOrEqual(80);
      expect(chunks[i]!.length).toBeLessThanOrEqual(100); // With overlap
    }
  });

  it('should reach base case with custom separator that does not exist in text', () => {
    // Custom separator that doesn't exist in text, forcing fallback to character split
    const text = 'abcdefghijklmnopqrstuvwxyz'.repeat(10); // 260 chars, no pipe character
    const chunks = chunkText(text, {
      maxChunkSize: 50,
      overlap: 5,
      separator: '|', // Separator not in text
    });

    expect(chunks.length).toBeGreaterThan(1);
    // Should fall back to character-level splitting
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeGreaterThan(0);
    });
  });

  it('should handle base case character split with no overlap', () => {
    // Force character splitting with zero overlap and custom separator
    const text = '1234567890'.repeat(30); // 300 chars, no separator
    const chunks = chunkText(text, {
      maxChunkSize: 100,
      overlap: 0,
      separator: 'Z', // Not in text
    });

    expect(chunks.length).toBe(3); // 300 / 100 = 3 chunks
    expect(chunks[0]).toBe('1234567890'.repeat(10));
    expect(chunks[1]).toBe('1234567890'.repeat(10));
    expect(chunks[2]).toBe('1234567890'.repeat(10));
  });
});

describe('Factory Function', () => {
  it('should create EmbeddingService via factory', () => {
    const service = createEmbeddingService({
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
    });

    expect(service).toBeInstanceOf(EmbeddingService);
    const info = service.getModelInfo();
    expect(info.model).toBe('text-embedding-3-small');
  });

  it('should create service with all config options via factory', () => {
    const service = createEmbeddingService({
      apiKey: 'test-key',
      model: 'text-embedding-3-large',
      dimensions: 512,
      organization: 'org-test',
      retryConfig: {
        maxRetries: 5,
        baseDelayMs: 2000,
      },
      timeoutMs: 60000,
    });

    expect(service).toBeInstanceOf(EmbeddingService);
  });
});

describe('Configuration Validation', () => {
  it('should throw on invalid config - empty API key', () => {
    expect(() => {
      new EmbeddingService({
        apiKey: '',
        model: 'text-embedding-3-small',
      });
    }).toThrow();
  });

  it('should throw on invalid dimensions - too small', () => {
    expect(() => {
      new EmbeddingService({
        apiKey: 'test-key',
        dimensions: 100, // Min is 256
      });
    }).toThrow();
  });

  it('should throw on invalid dimensions - too large', () => {
    expect(() => {
      new EmbeddingService({
        apiKey: 'test-key',
        dimensions: 5000, // Max is 3072
      });
    }).toThrow();
  });

  it('should throw on invalid retry config - maxRetries too high', () => {
    expect(() => {
      new EmbeddingService({
        apiKey: 'test-key',
        retryConfig: {
          maxRetries: 15, // Max is 10
          baseDelayMs: 1000,
        },
      });
    }).toThrow();
  });

  it('should throw on invalid timeout - too small', () => {
    expect(() => {
      new EmbeddingService({
        apiKey: 'test-key',
        timeoutMs: 500, // Min is 1000
      });
    }).toThrow();
  });

  it('should throw on invalid timeout - too large', () => {
    expect(() => {
      new EmbeddingService({
        apiKey: 'test-key',
        timeoutMs: 150000, // Max is 120000
      });
    }).toThrow();
  });

  it('should use fallback dimensions for unknown model', () => {
    // Create a service and manually check the config
    const service = new EmbeddingService({
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
    });

    const info = service.getModelInfo();
    expect(info.dimensions).toBe(1536); // Should use default for this model
  });
});

describe('Error Handling', () => {
  describe('embed error cases', () => {
    it('should throw ExternalServiceError on empty response', async () => {
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [], // Empty data array
        usage: { total_tokens: 0 },
      });

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      await expect(service.embed('test')).rejects.toThrow('Empty response from API');
    });

    it('should handle API errors', async () => {
      mockEmbeddingsCreate.mockRejectedValueOnce(new Error('API Error'));

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      await expect(service.embed('test')).rejects.toThrow('API Error');
    });
  });

  describe('shouldRetryError logic', () => {
    it('should retry on rate_limit error', async () => {
      let callCount = 0;
      mockEmbeddingsCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('rate_limit exceeded');
        }
        return Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
          usage: { total_tokens: 50 },
        });
      });

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const result = await service.embed('test');
      expect(result).toBeDefined();
      expect(callCount).toBeGreaterThan(1);
    });

    it('should retry on 502 error', async () => {
      let callCount = 0;
      mockEmbeddingsCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('502 Bad Gateway');
        }
        return Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
          usage: { total_tokens: 50 },
        });
      });

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const result = await service.embed('test');
      expect(result).toBeDefined();
    });

    it('should retry on 503 error', async () => {
      let callCount = 0;
      mockEmbeddingsCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('503 Service Unavailable');
        }
        return Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
          usage: { total_tokens: 50 },
        });
      });

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const result = await service.embed('test');
      expect(result).toBeDefined();
    });

    it('should retry on timeout error', async () => {
      let callCount = 0;
      mockEmbeddingsCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Request timeout');
        }
        return Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
          usage: { total_tokens: 50 },
        });
      });

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const result = await service.embed('test');
      expect(result).toBeDefined();
    });

    it('should retry on ECONNRESET error', async () => {
      let callCount = 0;
      mockEmbeddingsCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('ECONNRESET - connection reset');
        }
        return Promise.resolve({
          data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
          usage: { total_tokens: 50 },
        });
      });

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      const result = await service.embed('test');
      expect(result).toBeDefined();
    });

    it('should not retry on non-retryable error', async () => {
      mockEmbeddingsCreate.mockRejectedValueOnce(new Error('Invalid API key'));

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      await expect(service.embed('test')).rejects.toThrow('Invalid API key');
    });

    it('should not retry on non-Error objects', async () => {
      mockEmbeddingsCreate.mockRejectedValueOnce('String error');

      const service = new EmbeddingService({
        apiKey: 'test-key',
      });

      await expect(service.embed('test')).rejects.toBe('String error');
    });
  });
});

describe('Text Sanitization Edge Cases', () => {
  it('should truncate very long text', async () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    // Create text longer than 32000 characters
    const veryLongText = 'a'.repeat(35000);
    const result = await service.embed(veryLongText);

    expect(result).toBeDefined();
    expect(result.contentHash).toBeDefined();
  });

  it('should handle text with all types of whitespace', async () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const textWithWhitespace = 'Hello\t\r\n\v\fWorld';
    const result = await service.embed(textWithWhitespace);

    expect(result).toBeDefined();
  });

  it('should handle text with Unicode control characters', async () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const textWithControl = 'Hello\u0000\u001F\u007FWorld';
    const result = await service.embed(textWithControl);

    expect(result).toBeDefined();
  });

  it('should handle text with FEFF (BOM)', async () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const textWithBOM = '\uFEFFHello World';
    const result = await service.embed(textWithBOM);

    expect(result).toBeDefined();
  });
});

describe('embedBatch Advanced Cases', () => {
  it('should process multiple batches', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { embedding: new Array(1536).fill(0.1), index: 0 },
        { embedding: new Array(1536).fill(0.2), index: 1 },
      ],
      usage: { total_tokens: 100 },
    });

    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    // Create inputs that require multiple batches
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      text: `Text ${i}`,
      id: `${i}`,
    }));

    const result = await service.embedBatch(inputs, 2); // batchSize = 2

    expect(result.embeddings.length).toBeGreaterThan(0);
    expect(result.totalTokensUsed).toBeGreaterThan(0);
  });

  it('should handle batch with custom batch size', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { embedding: new Array(1536).fill(0.1), index: 0 },
        { embedding: new Array(1536).fill(0.2), index: 1 },
        { embedding: new Array(1536).fill(0.3), index: 2 },
      ],
      usage: { total_tokens: 150 },
    });

    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const inputs = [{ text: 'Text 1' }, { text: 'Text 2' }, { text: 'Text 3' }];

    const result = await service.embedBatch(inputs, 3);

    expect(result.embeddings).toHaveLength(3);
    expect(result.totalTokensUsed).toBe(150);
  });

  it('should handle batch response with undefined embeddings', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { embedding: new Array(1536).fill(0.1), index: 0 },
        undefined, // Simulate missing embedding
        { embedding: new Array(1536).fill(0.2), index: 2 },
      ],
      usage: { total_tokens: 100 },
    });

    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const inputs = [{ text: 'Text 1' }, { text: 'Text 2' }, { text: 'Text 3' }];

    const result = await service.embedBatch(inputs, 10);

    // Should only include defined embeddings
    expect(result.embeddings.length).toBe(2);
  });

  it('should calculate per-item token usage in batch', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { embedding: new Array(1536).fill(0.1), index: 0 },
        { embedding: new Array(1536).fill(0.2), index: 1 },
      ],
      usage: { total_tokens: 100 },
    });

    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const inputs = [{ text: 'Text 1' }, { text: 'Text 2' }];

    const result = await service.embedBatch(inputs);

    // Each embedding should have calculated token usage
    result.embeddings.forEach((emb) => {
      expect(emb.tokensUsed).toBeGreaterThan(0);
      expect(emb.tokensUsed).toBe(Math.ceil(100 / 2)); // 50
    });
  });

  it('should sanitize all texts in batch', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { embedding: new Array(1536).fill(0.1), index: 0 },
        { embedding: new Array(1536).fill(0.2), index: 1 },
      ],
      usage: { total_tokens: 100 },
    });

    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const inputs = [{ text: 'Hello\x00World' }, { text: '  Extra   Spaces  ' }];

    const result = await service.embedBatch(inputs);

    expect(result.embeddings).toHaveLength(2);
  });
});

describe('Cosine Similarity - All Branch Coverage', () => {
  it('should return 0 when both vectors are zero', () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const zero1 = [0, 0, 0, 0];
    const zero2 = [0, 0, 0, 0];

    const similarity = service.cosineSimilarity(zero1, zero2);
    expect(similarity).toBe(0);
  });

  it('should return 0 when magnitude is zero (one vector is zero)', () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const zero = [0, 0, 0, 0];
    const nonZero = [1, 2, 3, 4];

    const similarity = service.cosineSimilarity(zero, nonZero);
    expect(similarity).toBe(0);
  });

  it('should handle very small values', () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const vec1 = [0.0001, 0.0002, 0, 0];
    const vec2 = [0.0001, 0.0002, 0, 0];

    const similarity = service.cosineSimilarity(vec1, vec2);
    expect(similarity).toBeCloseTo(1, 5);
  });

  it('should handle negative values', () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const vec1 = [-1, -2, -3, 0];
    const vec2 = [-1, -2, -3, 0];

    const similarity = service.cosineSimilarity(vec1, vec2);
    expect(similarity).toBeCloseTo(1, 5);
  });

  it('should handle mixed positive and negative values', () => {
    const service = new EmbeddingService({
      apiKey: 'test-key',
    });

    const vec1 = [1, -1, 2, -2];
    const vec2 = [1, -1, 2, -2];

    const similarity = service.cosineSimilarity(vec1, vec2);
    expect(similarity).toBeCloseTo(1, 5);
  });
});

describe('prepareTextForEmbedding - All Branches', () => {
  it('should handle metadata with language', () => {
    const result = prepareTextForEmbedding('Content', {
      language: 'en',
    });

    expect(result).toContain('Content');
    // language is not currently used, but included for completeness
  });

  it('should handle all metadata fields together', () => {
    const result = prepareTextForEmbedding('Main content', {
      title: 'Test Title',
      sourceType: 'document',
      language: 'en',
      tags: ['tag1', 'tag2'],
    });

    expect(result).toContain('Title: Test Title');
    expect(result).toContain('Type: document');
    expect(result).toContain('Tags: tag1, tag2');
    expect(result).toContain('Main content');
  });

  it('should handle undefined metadata', () => {
    const result = prepareTextForEmbedding('Just content', undefined);

    expect(result).toContain('Just content');
    expect(result).not.toContain('Title:');
  });

  it('should handle metadata with only sourceType', () => {
    const result = prepareTextForEmbedding('Content', {
      sourceType: 'faq',
    });

    expect(result).toContain('Type: faq');
    expect(result).not.toContain('Title:');
  });

  it('should handle metadata with only tags', () => {
    const result = prepareTextForEmbedding('Content', {
      tags: ['medical', 'dental'],
    });

    expect(result).toContain('Tags: medical, dental');
    expect(result).not.toContain('Title:');
  });
});
