/**
 * Masked Memory Retrieval Service Tests
 *
 * Tests for MaskedMemoryRetrievalService which wraps MemoryRetrievalService
 * with automatic PII masking based on user role.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MaskedMemoryRetrievalService,
  createMaskedMemoryRetrievalService,
} from '../masked-memory-retrieval.js';
import type { MaskingContext } from '../types.js';

// Create mock implementations
const mockQuery = vi.fn();
const mockQueryPaginated = vi.fn();
const mockGetSubjectSummary = vi.fn();
const mockFindSimilarInteractions = vi.fn();
const mockGetRecentEvents = vi.fn();
const mockGetEventsByType = vi.fn();
const mockMaskEvents = vi.fn();
const mockMaskPaginatedResult = vi.fn();
const mockMaskSubjectSummary = vi.fn();

// Mock the dependencies
vi.mock('../memory-retrieval.js', () => ({
  MemoryRetrievalService: class {
    query = mockQuery;
    queryPaginated = mockQueryPaginated;
    getSubjectSummary = mockGetSubjectSummary;
    findSimilarInteractions = mockFindSimilarInteractions;
    getRecentEvents = mockGetRecentEvents;
    getEventsByType = mockGetEventsByType;
  },
}));

vi.mock('../pii-masking.js', () => ({
  PiiMaskingService: class {
    maskEvents = mockMaskEvents;
    maskPaginatedResult = mockMaskPaginatedResult;
    maskSubjectSummary = mockMaskSubjectSummary;
  },
}));

describe('MaskedMemoryRetrievalService', () => {
  let service: MaskedMemoryRetrievalService;
  const mockPool = { query: vi.fn() };
  const mockEmbeddings = {
    embed: vi.fn().mockResolvedValue({ embedding: new Array(1536).fill(0.1), contentHash: 'test' }),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  };

  const testLeadId = '550e8400-e29b-41d4-a716-446655440000';

  const mockMaskingContext: MaskingContext = {
    userRole: 'analyst',
    userId: 'user-123',
    purpose: 'analysis',
  };

  const mockEvent = {
    id: 'event-1',
    subjectType: 'lead' as const,
    subjectId: testLeadId,
    eventType: 'message.received',
    eventCategory: 'communication',
    sourceChannel: 'whatsapp',
    summary: 'Patient John Doe called',
    keyEntities: [{ type: 'person', value: 'John Doe' }],
    sentiment: 'positive',
    occurredAt: new Date('2024-12-01'),
    processedAt: new Date('2024-12-01'),
  };

  const mockMaskedEvent = {
    ...mockEvent,
    summary: 'Patient [REDACTED] called',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MaskedMemoryRetrievalService(mockPool as unknown as never, mockEmbeddings);
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool as unknown as never, mockEmbeddings);
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create service with custom config', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool as unknown as never, mockEmbeddings, {
        cognitiveConfig: { minSimilarity: 0.9 },
        maskingConfig: { auditLogging: true },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create service with only cognitive config', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool as unknown as never, mockEmbeddings, {
        cognitiveConfig: { defaultQueryLimit: 50 },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create service with only masking config', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool as unknown as never, mockEmbeddings, {
        maskingConfig: { redactionPattern: '***' },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create instance with both configs', () => {
      const svc = new MaskedMemoryRetrievalService(mockPool as unknown as never, mockEmbeddings, {
        cognitiveConfig: { embeddingDimensions: 1536 },
        maskingConfig: { auditLogging: true },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });
  });

  describe('queryWithMasking', () => {
    it('should query and mask events', async () => {
      mockQuery.mockResolvedValue([mockEvent]);
      mockMaskEvents.mockResolvedValue({
        data: [mockMaskedEvent],
        auditInfo: { fieldsRedacted: 1, timestamp: new Date(), userRole: 'analyst' },
      });

      const result = await service.queryWithMasking({ subjectId: testLeadId }, mockMaskingContext);

      expect(mockQuery).toHaveBeenCalledWith({ subjectId: testLeadId });
      expect(mockMaskEvents).toHaveBeenCalledWith([mockEvent], { context: mockMaskingContext });
      expect(result.data).toEqual([mockMaskedEvent]);
    });

    it('should handle empty results', async () => {
      mockQuery.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({
        data: [],
        auditInfo: { fieldsRedacted: 0, timestamp: new Date(), userRole: 'analyst' },
      });

      const result = await service.queryWithMasking({ subjectId: testLeadId }, mockMaskingContext);
      expect(result.data).toEqual([]);
    });
  });

  describe('queryPaginatedWithMasking', () => {
    it('should query paginated and mask results', async () => {
      const paginatedResult = { items: [mockEvent], hasMore: true, nextCursor: 'cursor-123' };
      mockQueryPaginated.mockResolvedValue(paginatedResult);
      mockMaskPaginatedResult.mockResolvedValue({
        data: { items: [mockMaskedEvent], hasMore: true, nextCursor: 'cursor-123' },
        auditInfo: { fieldsRedacted: 1, timestamp: new Date(), userRole: 'analyst' },
      });

      const result = await service.queryPaginatedWithMasking(
        { subjectId: testLeadId, pageSize: 10 },
        mockMaskingContext
      );

      expect(mockQueryPaginated).toHaveBeenCalledWith({ subjectId: testLeadId, pageSize: 10 });
      expect(mockMaskPaginatedResult).toHaveBeenCalledWith(paginatedResult, {
        context: mockMaskingContext,
      });
      expect(result.data.items).toHaveLength(1);
    });
  });

  describe('getSubjectSummaryWithMasking', () => {
    it('should get subject summary and mask it', async () => {
      const mockSummary = {
        subjectType: 'lead' as const,
        subjectId: testLeadId,
        totalEvents: 10,
        firstInteraction: new Date('2024-01-01'),
        lastInteraction: new Date('2024-12-01'),
        channelBreakdown: { whatsapp: 6 },
        sentimentTrend: 'improving' as const,
        sentimentCounts: { positive: 5, neutral: 3, negative: 2 },
        patterns: [],
        recentSummary: 'Test summary',
      };

      mockGetSubjectSummary.mockResolvedValue(mockSummary);
      mockMaskSubjectSummary.mockResolvedValue({
        data: { ...mockSummary, recentSummary: '[REDACTED]' },
        auditInfo: { fieldsRedacted: 1, timestamp: new Date(), userRole: 'analyst' },
      });

      const result = await service.getSubjectSummaryWithMasking(
        'lead',
        testLeadId,
        mockMaskingContext
      );

      expect(mockGetSubjectSummary).toHaveBeenCalledWith('lead', testLeadId);
      expect(mockMaskSubjectSummary).toHaveBeenCalled();
      expect(result.data.recentSummary).toBe('[REDACTED]');
    });

    it('should handle patient subject type', async () => {
      mockGetSubjectSummary.mockResolvedValue({
        subjectType: 'patient',
        subjectId: 'patient-123',
        totalEvents: 5,
        firstInteraction: null,
        lastInteraction: null,
        channelBreakdown: {},
        sentimentTrend: 'stable',
        sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
        patterns: [],
        recentSummary: '',
      });
      mockMaskSubjectSummary.mockResolvedValue({
        data: { subjectType: 'patient', subjectId: 'patient-123' },
        auditInfo: { fieldsRedacted: 0, timestamp: new Date(), userRole: 'analyst' },
      });

      await service.getSubjectSummaryWithMasking('patient', 'patient-123', mockMaskingContext);
      expect(mockGetSubjectSummary).toHaveBeenCalledWith('patient', 'patient-123');
    });

    it('should handle contact subject type', async () => {
      mockGetSubjectSummary.mockResolvedValue({
        subjectType: 'contact',
        subjectId: 'contact-456',
        totalEvents: 3,
      });
      mockMaskSubjectSummary.mockResolvedValue({
        data: { subjectType: 'contact' },
        auditInfo: { fieldsRedacted: 0, timestamp: new Date(), userRole: 'analyst' },
      });

      await service.getSubjectSummaryWithMasking('contact', 'contact-456', mockMaskingContext);
      expect(mockGetSubjectSummary).toHaveBeenCalledWith('contact', 'contact-456');
    });
  });

  describe('findSimilarInteractionsWithMasking', () => {
    it('should find similar interactions and mask them', async () => {
      mockFindSimilarInteractions.mockResolvedValue([mockEvent]);
      mockMaskEvents.mockResolvedValue({
        data: [mockMaskedEvent],
        auditInfo: { fieldsRedacted: 1, timestamp: new Date(), userRole: 'analyst' },
      });

      const result = await service.findSimilarInteractionsWithMasking(
        'dental implants',
        { limit: 5 },
        mockMaskingContext
      );

      expect(mockFindSimilarInteractions).toHaveBeenCalledWith('dental implants', { limit: 5 });
      expect(result.data).toEqual([mockMaskedEvent]);
    });

    it('should filter by subjectId', async () => {
      mockFindSimilarInteractions.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      await service.findSimilarInteractionsWithMasking(
        'test',
        { subjectId: testLeadId },
        mockMaskingContext
      );
      expect(mockFindSimilarInteractions).toHaveBeenCalledWith('test', { subjectId: testLeadId });
    });

    it('should filter by subjectType', async () => {
      mockFindSimilarInteractions.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      await service.findSimilarInteractionsWithMasking(
        'test',
        { subjectType: 'patient' },
        mockMaskingContext
      );
      expect(mockFindSimilarInteractions).toHaveBeenCalledWith('test', { subjectType: 'patient' });
    });

    it('should use minSimilarity option', async () => {
      mockFindSimilarInteractions.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      await service.findSimilarInteractionsWithMasking(
        'test',
        { minSimilarity: 0.9 },
        mockMaskingContext
      );
      expect(mockFindSimilarInteractions).toHaveBeenCalledWith('test', { minSimilarity: 0.9 });
    });

    it('should handle various subject types', async () => {
      mockFindSimilarInteractions.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      for (const subjectType of ['lead', 'patient', 'contact'] as const) {
        await service.findSimilarInteractionsWithMasking(
          'query text',
          { subjectType },
          mockMaskingContext
        );
        expect(mockFindSimilarInteractions).toHaveBeenCalledWith('query text', { subjectType });
      }
    });
  });

  describe('getRecentEventsWithMasking', () => {
    it('should get recent events and mask them', async () => {
      mockGetRecentEvents.mockResolvedValue([mockEvent]);
      mockMaskEvents.mockResolvedValue({
        data: [mockMaskedEvent],
        auditInfo: { fieldsRedacted: 1, timestamp: new Date(), userRole: 'analyst' },
      });

      const result = await service.getRecentEventsWithMasking(
        'lead',
        testLeadId,
        mockMaskingContext,
        30,
        20
      );

      expect(mockGetRecentEvents).toHaveBeenCalledWith('lead', testLeadId, 30, 20);
      expect(result.data).toEqual([mockMaskedEvent]);
    });

    it('should use default days and limit', async () => {
      mockGetRecentEvents.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      await service.getRecentEventsWithMasking('lead', testLeadId, mockMaskingContext);
      expect(mockGetRecentEvents).toHaveBeenCalledWith('lead', testLeadId, 30, 20);
    });

    it('should work with patient subject type', async () => {
      mockGetRecentEvents.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      await service.getRecentEventsWithMasking('patient', 'patient-123', mockMaskingContext, 7, 10);
      expect(mockGetRecentEvents).toHaveBeenCalledWith('patient', 'patient-123', 7, 10);
    });

    it('should work with contact subject type', async () => {
      mockGetRecentEvents.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      await service.getRecentEventsWithMasking(
        'contact',
        'contact-456',
        mockMaskingContext,
        14,
        15
      );
      expect(mockGetRecentEvents).toHaveBeenCalledWith('contact', 'contact-456', 14, 15);
    });
  });

  describe('getEventsByTypeWithMasking', () => {
    it('should get events by type and mask them', async () => {
      mockGetEventsByType.mockResolvedValue([mockEvent]);
      mockMaskEvents.mockResolvedValue({
        data: [mockMaskedEvent],
        auditInfo: { fieldsRedacted: 1, timestamp: new Date(), userRole: 'analyst' },
      });

      const result = await service.getEventsByTypeWithMasking(
        'lead',
        testLeadId,
        ['message.received'],
        mockMaskingContext,
        15
      );

      expect(mockGetEventsByType).toHaveBeenCalledWith(
        'lead',
        testLeadId,
        ['message.received'],
        15
      );
      expect(result.data).toEqual([mockMaskedEvent]);
    });

    it('should use default limit', async () => {
      mockGetEventsByType.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      await service.getEventsByTypeWithMasking(
        'lead',
        testLeadId,
        ['call.completed'],
        mockMaskingContext
      );
      expect(mockGetEventsByType).toHaveBeenCalledWith('lead', testLeadId, ['call.completed'], 20);
    });

    it('should handle multiple event types', async () => {
      mockGetEventsByType.mockResolvedValue([]);
      mockMaskEvents.mockResolvedValue({ data: [], auditInfo: {} });

      const eventTypes = ['message.received', 'message.sent', 'call.completed'];
      await service.getEventsByTypeWithMasking(
        'patient',
        'patient-123',
        eventTypes,
        mockMaskingContext,
        50
      );
      expect(mockGetEventsByType).toHaveBeenCalledWith('patient', 'patient-123', eventTypes, 50);
    });
  });

  describe('getUnmaskedService', () => {
    it('should return the underlying retrieval service', () => {
      const unmaskedService = service.getUnmaskedService();
      expect(unmaskedService).toBeDefined();
      expect(typeof unmaskedService.query).toBe('function');
    });
  });

  describe('getMaskingService', () => {
    it('should return the masking service', () => {
      const maskingSvc = service.getMaskingService();
      expect(maskingSvc).toBeDefined();
      expect(typeof maskingSvc.maskEvents).toBe('function');
    });
  });

  describe('createMaskedMemoryRetrievalService factory', () => {
    it('should create service with default config', () => {
      const svc = createMaskedMemoryRetrievalService(mockPool as unknown as never, mockEmbeddings);
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create service with custom config', () => {
      const svc = createMaskedMemoryRetrievalService(mockPool as unknown as never, mockEmbeddings, {
        cognitiveConfig: { minSimilarity: 0.85 },
        maskingConfig: { auditLogging: true },
      });
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });

    it('should create service with empty config', () => {
      const svc = createMaskedMemoryRetrievalService(
        mockPool as unknown as never,
        mockEmbeddings,
        {}
      );
      expect(svc).toBeInstanceOf(MaskedMemoryRetrievalService);
    });
  });

  describe('different user roles', () => {
    it('should handle admin context', async () => {
      mockQuery.mockResolvedValue([mockEvent]);
      mockMaskEvents.mockResolvedValue({
        data: [mockEvent], // Admin sees unmasked
        auditInfo: { fieldsRedacted: 0, timestamp: new Date(), userRole: 'admin' },
      });

      const adminContext: MaskingContext = {
        userRole: 'admin',
        userId: 'admin-user',
        purpose: 'administration',
      };

      const result = await service.queryWithMasking({ subjectId: testLeadId }, adminContext);
      expect(mockMaskEvents).toHaveBeenCalledWith([mockEvent], { context: adminContext });
      expect(result.auditInfo.userRole).toBe('admin');
    });

    it('should handle support context', async () => {
      mockQuery.mockResolvedValue([mockEvent]);
      mockMaskEvents.mockResolvedValue({
        data: [mockMaskedEvent],
        auditInfo: { fieldsRedacted: 1, timestamp: new Date(), userRole: 'support' },
      });

      const supportContext: MaskingContext = {
        userRole: 'support',
        userId: 'support-user',
        purpose: 'customer-support',
      };

      const result = await service.queryWithMasking({ subjectId: testLeadId }, supportContext);
      expect(mockMaskEvents).toHaveBeenCalledWith([mockEvent], { context: supportContext });
      expect(result.auditInfo.userRole).toBe('support');
    });
  });
});
