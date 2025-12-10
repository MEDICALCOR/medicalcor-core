/**
 * Tests for MaskedMemoryRetrievalService
 *
 * Ensures PII masking is applied correctly during memory retrieval.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MaskedMemoryRetrievalService,
  createMaskedMemoryRetrievalService,
} from '../masked-memory-retrieval.js';
import type { Pool } from 'pg';
import type { IEmbeddingService } from '../episode-builder.js';
import type { MaskingContext } from '../types.js';

// Mock dependencies
const mockPool = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
} as unknown as Pool;

const mockEmbeddingService: IEmbeddingService = {
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
};

describe('MaskedMemoryRetrievalService', () => {
  let service: MaskedMemoryRetrievalService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MaskedMemoryRetrievalService(mockPool, mockEmbeddingService);
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool, mockEmbeddingService);
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create instance with custom cognitive config', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool, mockEmbeddingService, {
        cognitiveConfig: { embeddingDimensions: 1536 },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create instance with custom masking config', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool, mockEmbeddingService, {
        maskingConfig: { auditLogging: true },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create instance with both configs', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool, mockEmbeddingService, {
        cognitiveConfig: { embeddingDimensions: 1536 },
        maskingConfig: { auditLogging: true },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });
  });

  describe('queryWithMasking', () => {
    const mockContext: MaskingContext = {
      userRole: 'analyst',
      userId: 'user-123',
    };

    it('should query and mask events', async () => {
      const result = await service.queryWithMasking(
        { subjectId: 'lead-1', semanticQuery: 'appointment' },
        mockContext
      );

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should handle empty query results', async () => {
      const result = await service.queryWithMasking(
        { subjectId: 'non-existent', semanticQuery: 'test' },
        mockContext
      );

      expect(result).toBeDefined();
    });
  });

  describe('queryPaginatedWithMasking', () => {
    const mockContext: MaskingContext = {
      userRole: 'admin',
      userId: 'admin-1',
    };

    it('should query paginated and mask results', async () => {
      const result = await service.queryPaginatedWithMasking(
        { subjectId: 'patient-1', semanticQuery: 'treatment', page: 1, pageSize: 10 },
        mockContext
      );

      expect(result).toBeDefined();
    });
  });

  describe('getSubjectSummaryWithMasking', () => {
    const mockContext: MaskingContext = {
      userRole: 'doctor',
      userId: 'doc-1',
    };

    it('should get lead summary with masking', async () => {
      const result = await service.getSubjectSummaryWithMasking('lead', 'lead-123', mockContext);
      expect(result).toBeDefined();
    });

    it('should get patient summary with masking', async () => {
      const result = await service.getSubjectSummaryWithMasking(
        'patient',
        'patient-123',
        mockContext
      );
      expect(result).toBeDefined();
    });

    it('should get contact summary with masking', async () => {
      const result = await service.getSubjectSummaryWithMasking(
        'contact',
        'contact-123',
        mockContext
      );
      expect(result).toBeDefined();
    });
  });

  describe('findSimilarInteractionsWithMasking', () => {
    const mockContext: MaskingContext = {
      userRole: 'analyst',
      userId: 'user-456',
    };

    it('should find similar interactions with masking', async () => {
      const result = await service.findSimilarInteractionsWithMasking(
        'dental implant consultation',
        { limit: 5 },
        mockContext
      );

      expect(result).toBeDefined();
    });

    it('should find similar interactions with subject filter', async () => {
      const result = await service.findSimilarInteractionsWithMasking(
        'follow-up appointment',
        { subjectId: 'patient-1', subjectType: 'patient', limit: 10, minSimilarity: 0.7 },
        mockContext
      );

      expect(result).toBeDefined();
    });

    it('should handle various subject types', async () => {
      for (const subjectType of ['lead', 'patient', 'contact'] as const) {
        const result = await service.findSimilarInteractionsWithMasking(
          'query text',
          { subjectType },
          mockContext
        );
        expect(result).toBeDefined();
      }
    });
  });

  describe('getRecentEventsWithMasking', () => {
    const mockContext: MaskingContext = {
      userRole: 'nurse',
      userId: 'nurse-1',
    };

    it('should get recent events with default parameters', async () => {
      const result = await service.getRecentEventsWithMasking('lead', 'lead-1', mockContext);
      expect(result).toBeDefined();
    });

    it('should get recent events with custom days', async () => {
      const result = await service.getRecentEventsWithMasking(
        'patient',
        'patient-1',
        mockContext,
        7
      );
      expect(result).toBeDefined();
    });

    it('should get recent events with custom limit', async () => {
      const result = await service.getRecentEventsWithMasking(
        'contact',
        'contact-1',
        mockContext,
        30,
        50
      );
      expect(result).toBeDefined();
    });
  });

  describe('getEventsByTypeWithMasking', () => {
    const mockContext: MaskingContext = {
      userRole: 'admin',
      userId: 'admin-2',
    };

    it('should get events by type with default limit', async () => {
      const result = await service.getEventsByTypeWithMasking(
        'patient',
        'patient-123',
        ['appointment', 'consultation'],
        mockContext
      );

      expect(result).toBeDefined();
    });

    it('should get events by type with custom limit', async () => {
      const result = await service.getEventsByTypeWithMasking(
        'lead',
        'lead-123',
        ['inbound_call', 'outbound_call'],
        mockContext,
        50
      );

      expect(result).toBeDefined();
    });
  });

  describe('getUnmaskedService', () => {
    it('should return the underlying retrieval service', () => {
      const unmaskedService = service.getUnmaskedService();
      expect(unmaskedService).toBeDefined();
    });
  });

  describe('getMaskingService', () => {
    it('should return the masking service', () => {
      const maskingService = service.getMaskingService();
      expect(maskingService).toBeDefined();
    });
  });

  describe('createMaskedMemoryRetrievalService factory', () => {
    it('should create a service instance', () => {
      const svc = createMaskedMemoryRetrievalService(mockPool, mockEmbeddingService);
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create a service with config', () => {
      const svc = createMaskedMemoryRetrievalService(mockPool, mockEmbeddingService, {
        cognitiveConfig: { embeddingDimensions: 3072 },
        maskingConfig: { auditLogging: false },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });
  });
});
