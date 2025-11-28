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
