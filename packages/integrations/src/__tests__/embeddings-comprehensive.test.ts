/**
 * Comprehensive Embedding Tests
 * Tests for configuration schema validation and utility functions
 * Note: EmbeddingService API tests are in embeddings.test.ts with proper mocking
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { EmbeddingConfigSchema, chunkText, prepareTextForEmbedding } from '../embeddings.js';

describe('EmbeddingConfigSchema', () => {
  it('should validate valid config', () => {
    const config = {
      apiKey: 'sk-test-key',
      model: 'text-embedding-3-small' as const,
    };

    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject empty API key', () => {
    const config = { apiKey: '', model: 'text-embedding-3-small' };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should use default model', () => {
    const config = { apiKey: 'sk-test-key' };
    const result = EmbeddingConfigSchema.parse(config);
    expect(result.model).toBe('text-embedding-3-small');
  });

  it('should accept text-embedding-3-large', () => {
    const config = { apiKey: 'sk-test', model: 'text-embedding-3-large' };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should accept text-embedding-ada-002', () => {
    const config = { apiKey: 'sk-test', model: 'text-embedding-ada-002' };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject invalid model', () => {
    const config = { apiKey: 'sk-test', model: 'invalid-model' };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should validate dimensions in range', () => {
    const config = { apiKey: 'sk-test', dimensions: 512 };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject dimensions below minimum', () => {
    const config = { apiKey: 'sk-test', dimensions: 100 };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject dimensions above maximum', () => {
    const config = { apiKey: 'sk-test', dimensions: 4000 };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should accept retry config', () => {
    const config = {
      apiKey: 'sk-test',
      retryConfig: { maxRetries: 5, baseDelayMs: 2000 },
    };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate timeout within bounds', () => {
    const config = { apiKey: 'sk-test', timeoutMs: 60000 };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject timeout below minimum', () => {
    const config = { apiKey: 'sk-test', timeoutMs: 500 };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject timeout above maximum', () => {
    const config = { apiKey: 'sk-test', timeoutMs: 200000 };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should validate max retries in range', () => {
    const config = {
      apiKey: 'sk-test',
      retryConfig: { maxRetries: 10, baseDelayMs: 1000 },
    };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject negative max retries', () => {
    const config = {
      apiKey: 'sk-test',
      retryConfig: { maxRetries: -1, baseDelayMs: 1000 },
    };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject max retries above limit', () => {
    const config = {
      apiKey: 'sk-test',
      retryConfig: { maxRetries: 15, baseDelayMs: 1000 },
    };
    const result = EmbeddingConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('chunkText', () => {
  it('should return empty array for empty text', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('should return empty array for undefined text', () => {
    expect(chunkText(undefined as unknown as string)).toEqual([]);
  });

  it('should return single chunk for short text', () => {
    const text = 'Short text';
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 20 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('should split long text into chunks', () => {
    const text = 'A'.repeat(500);
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should respect maxChunkSize', () => {
    const text = 'A'.repeat(500);
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 0 });
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(100);
    });
  });

  it('should split on paragraph boundaries when possible', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const chunks = chunkText(text, { maxChunkSize: 30, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should split on sentence boundaries', () => {
    const text = 'Sentence one. Sentence two. Sentence three.';
    const chunks = chunkText(text, { maxChunkSize: 20, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should add overlap between chunks', () => {
    const text = 'AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC';
    const chunks = chunkText(text, { maxChunkSize: 15, overlap: 5 });
    // Overlap means some content should appear in multiple chunks
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should use custom separator', () => {
    const text = 'part1|part2|part3';
    const chunks = chunkText(text, { maxChunkSize: 10, overlap: 0, separator: '|' });
    expect(chunks).toContain('part1');
    expect(chunks).toContain('part2');
    expect(chunks).toContain('part3');
  });

  it('should handle text with no natural breaks', () => {
    const text = 'A'.repeat(500);
    const chunks = chunkText(text, { maxChunkSize: 100, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeGreaterThan(0);
    });
  });

  it('should use default options when not specified', () => {
    const text = 'A'.repeat(2000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should handle whitespace-only text', () => {
    const chunks = chunkText('   ');
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  it('should handle newline-only text', () => {
    const chunks = chunkText('\n\n\n');
    expect(chunks.length).toBeLessThanOrEqual(1);
  });

  // Property-based tests
  it('should never return empty chunks (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 1000 }), (text) => {
        const chunks = chunkText(text, { maxChunkSize: 100, overlap: 20 });
        return chunks.every((chunk) => chunk.length > 0);
      })
    );
  });

  it('should cover all content (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 500 }), (text) => {
        const chunks = chunkText(text.trim(), { maxChunkSize: 50, overlap: 0 });
        const combined = chunks.join('');
        // All trimmed words should appear somewhere
        const words = text
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 0);
        return words.every((word) => combined.includes(word));
      })
    );
  });
});

describe('prepareTextForEmbedding', () => {
  it('should return content only when no metadata', () => {
    const result = prepareTextForEmbedding('Test content');
    expect(result).toContain('Test content');
  });

  it('should include title when provided', () => {
    const result = prepareTextForEmbedding('Content', { title: 'My Title' });
    expect(result).toContain('Title: My Title');
  });

  it('should include sourceType when provided', () => {
    const result = prepareTextForEmbedding('Content', { sourceType: 'document' });
    expect(result).toContain('Type: document');
  });

  it('should include tags when provided', () => {
    const result = prepareTextForEmbedding('Content', { tags: ['tag1', 'tag2'] });
    expect(result).toContain('Tags: tag1, tag2');
  });

  it('should include all metadata', () => {
    const result = prepareTextForEmbedding('Content', {
      title: 'Title',
      sourceType: 'faq',
      tags: ['dental', 'implant'],
    });

    expect(result).toContain('Title: Title');
    expect(result).toContain('Type: faq');
    expect(result).toContain('Tags: dental, implant');
    expect(result).toContain('Content');
  });

  it('should handle empty tags array', () => {
    const result = prepareTextForEmbedding('Content', { tags: [] });
    expect(result).not.toContain('Tags:');
  });

  it('should separate metadata and content with newline', () => {
    const result = prepareTextForEmbedding('Content', { title: 'Title' });
    expect(result).toMatch(/Title: Title\n\n.*Content/);
  });

  it('should handle undefined metadata', () => {
    const result = prepareTextForEmbedding('Content', undefined);
    expect(result).toContain('Content');
  });

  it('should handle empty string content', () => {
    const result = prepareTextForEmbedding('', { title: 'Title' });
    expect(result).toContain('Title: Title');
  });

  it('should handle single tag', () => {
    const result = prepareTextForEmbedding('Content', { tags: ['single'] });
    expect(result).toContain('Tags: single');
  });

  it('should handle multiple metadata fields', () => {
    const result = prepareTextForEmbedding('Content', {
      title: 'Test Title',
      sourceType: 'article',
      language: 'en',
      tags: ['a', 'b', 'c'],
    });

    expect(result).toContain('Title: Test Title');
    expect(result).toContain('Type: article');
    expect(result).toContain('Tags: a, b, c');
  });
});

describe('Cosine Similarity - Mathematical Properties', () => {
  // These are pure math tests that don't need EmbeddingService

  function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new Error('same dimensions');
    let dotProduct = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
  }

  it('should return 1 for identical vectors', () => {
    const vec = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1);
  });

  it('should return 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it('should return -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });

  it('should throw for different dimensions', () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow('same dimensions');
  });

  it('should return 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  // Property-based tests
  it('should be symmetric (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ noNaN: true, noDefaultInfinity: true }), {
          minLength: 3,
          maxLength: 10,
        }),
        fc.array(fc.float({ noNaN: true, noDefaultInfinity: true }), {
          minLength: 3,
          maxLength: 10,
        }),
        (a, b) => {
          const minLen = Math.min(a.length, b.length);
          const vecA = a.slice(0, minLen);
          const vecB = b.slice(0, minLen);
          return Math.abs(cosineSimilarity(vecA, vecB) - cosineSimilarity(vecB, vecA)) < 0.0001;
        }
      )
    );
  });

  it('should always be between -1 and 1 (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 3, maxLength: 10 }),
        fc.array(fc.float({ min: -100, max: 100, noNaN: true }), { minLength: 3, maxLength: 10 }),
        (a, b) => {
          const minLen = Math.min(a.length, b.length);
          const sim = cosineSimilarity(a.slice(0, minLen), b.slice(0, minLen));
          return sim >= -1 && sim <= 1;
        }
      )
    );
  });
});
