/**
 * Memory-Enriched Guidance Service Tests
 *
 * ADR-004: Tests for cognitive memory integration with agent guidance flows.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemoryEnrichedGuidanceService,
  createMemoryEnrichedGuidanceService,
  type CallMemoryContext,
} from '../guidance/memory-enriched-guidance-service.js';
import type { IGuidanceRepository } from '../guidance/repositories/GuidanceRepository.js';
import type { MemoryRetrievalService } from '@medicalcor/core';
import type { AgentGuidance } from '@medicalcor/types';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockGuidance: AgentGuidance = {
  id: '00000000-0000-0000-0000-000000000001',
  clinicId: '00000000-0000-0000-0000-000000000002',
  type: 'call-script',
  category: 'intake',
  audience: 'new-patient',
  name: 'Intake Script',
  description: 'Standard intake script for new patients',
  initialGreeting: 'Hello, welcome to our clinic!',
  steps: [
    {
      id: 'step-1',
      order: 1,
      actionType: 'say',
      content: 'How can I help you today?',
      isRequired: true,
    },
    {
      id: 'step-2',
      order: 2,
      actionType: 'ask',
      content: 'What procedure are you interested in?',
      isRequired: true,
    },
  ],
  keyPoints: [
    {
      id: 'kp-1',
      content: 'We offer flexible payment plans',
      priority: 'high',
      triggers: ['price', 'cost', 'expensive'],
    },
  ],
  objectionHandlers: [
    {
      id: 'obj-1',
      objection: 'Too expensive',
      objectionPatterns: ['too expensive', 'prea scump'],
      response: 'We offer flexible payment plans to make treatment accessible.',
      category: 'pricing',
      usageCount: 0,
    },
  ],
  closingStatements: ['Thank you for your interest!'],
  procedures: ['dental-implant'],
  languages: ['en', 'ro'],
  defaultLanguage: 'en',
  isActive: true,
  isDraft: false,
  version: 1,
  usageCount: 0,
  tags: ['intake', 'new-patient'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSubjectSummary = {
  subjectType: 'lead' as const,
  subjectId: '00000000-0000-0000-0000-000000000003',
  totalEvents: 15,
  firstInteraction: new Date('2024-01-01'),
  lastInteraction: new Date('2024-12-01'),
  channelBreakdown: {
    whatsapp: 10,
    voice: 5,
  },
  sentimentTrend: 'declining' as const,
  sentimentCounts: {
    positive: 5,
    neutral: 7,
    negative: 3,
  },
  patterns: [
    {
      id: '00000000-0000-0000-0000-000000000010',
      subjectType: 'lead' as const,
      subjectId: '00000000-0000-0000-0000-000000000003',
      patternType: 'price_sensitive',
      patternDescription: 'Shows concern about pricing in most conversations',
      confidence: 0.85,
      supportingEventIds: [
        '00000000-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000000012',
      ],
      firstObservedAt: new Date('2024-06-01'),
      lastObservedAt: new Date('2024-11-01'),
      occurrenceCount: 5,
    },
  ],
  recentSummary: 'Patient has been inquiring about dental implants and pricing options.',
};

const mockRecentEvents = [
  {
    id: '00000000-0000-0000-0000-000000000011',
    subjectType: 'lead' as const,
    subjectId: '00000000-0000-0000-0000-000000000003',
    eventType: 'message.received',
    eventCategory: 'communication' as const,
    sourceChannel: 'whatsapp' as const,
    summary: 'Patient asked about dental implant costs and financing options.',
    keyEntities: [
      { type: 'procedure' as const, value: 'dental implant', confidence: 0.9 },
      { type: 'amount' as const, value: '$3000', confidence: 0.8 },
    ],
    sentiment: 'neutral' as const,
    intent: 'pricing_inquiry',
    occurredAt: new Date('2024-11-15'),
    processedAt: new Date('2024-11-15'),
  },
  {
    id: '00000000-0000-0000-0000-000000000012',
    subjectType: 'lead' as const,
    subjectId: '00000000-0000-0000-0000-000000000003',
    eventType: 'message.received',
    eventCategory: 'communication' as const,
    sourceChannel: 'whatsapp' as const,
    summary: 'Patient expressed concern about the high cost of treatment.',
    keyEntities: [],
    sentiment: 'negative' as const,
    intent: 'price_objection',
    occurredAt: new Date('2024-11-20'),
    processedAt: new Date('2024-11-20'),
  },
];

// =============================================================================
// Mock Repository
// =============================================================================

function createMockRepository(): IGuidanceRepository {
  return {
    create: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    update: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    delete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    hardDelete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    findById: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    findByName: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    list: vi.fn().mockResolvedValue({
      success: true,
      data: { items: [mockGuidance], total: 1, limit: 10, offset: 0, hasMore: false },
    }),
    findForCall: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    search: vi.fn().mockResolvedValue({ success: true, data: [mockGuidance] }),
    getActiveForClinic: vi.fn().mockResolvedValue({ success: true, data: [mockGuidance] }),
    createVersion: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    getVersionHistory: vi.fn().mockResolvedValue({ success: true, data: [mockGuidance] }),
    activate: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    deactivate: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    publish: vi.fn().mockResolvedValue({ success: true, data: mockGuidance }),
    incrementUsage: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    updateMetrics: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    findByProcedure: vi.fn().mockResolvedValue({ success: true, data: [mockGuidance] }),
    findByCategory: vi.fn().mockResolvedValue({ success: true, data: [mockGuidance] }),
  };
}

// =============================================================================
// Mock Memory Retrieval Service
// =============================================================================

function createMockMemoryRetrieval(): MemoryRetrievalService {
  return {
    query: vi.fn().mockResolvedValue(mockRecentEvents),
    getSubjectSummary: vi.fn().mockResolvedValue(mockSubjectSummary),
    findSimilarInteractions: vi.fn().mockResolvedValue(mockRecentEvents),
    getRecentEvents: vi.fn().mockResolvedValue(mockRecentEvents),
    getEventsByType: vi.fn().mockResolvedValue(mockRecentEvents),
  } as unknown as MemoryRetrievalService;
}

// =============================================================================
// Tests
// =============================================================================

describe('MemoryEnrichedGuidanceService', () => {
  let service: MemoryEnrichedGuidanceService;
  let mockRepository: IGuidanceRepository;
  let mockMemoryRetrieval: MemoryRetrievalService;

  beforeEach(() => {
    mockRepository = createMockRepository();
    mockMemoryRetrieval = createMockMemoryRetrieval();
    service = createMemoryEnrichedGuidanceService(mockRepository, mockMemoryRetrieval);
  });

  describe('initialization', () => {
    it('should create service with memory retrieval', () => {
      expect(service).toBeInstanceOf(MemoryEnrichedGuidanceService);
    });

    it('should create service without memory retrieval', () => {
      const serviceNoMemory = createMemoryEnrichedGuidanceService(mockRepository, null);
      expect(serviceNoMemory).toBeInstanceOf(MemoryEnrichedGuidanceService);
    });

    it('should accept custom configuration', () => {
      const customService = createMemoryEnrichedGuidanceService(
        mockRepository,
        mockMemoryRetrieval,
        {
          enableMemoryIntegration: false,
          enablePatternBasedSuggestions: false,
        }
      );
      expect(customService).toBeInstanceOf(MemoryEnrichedGuidanceService);
    });
  });

  describe('loadGuidanceForCall', () => {
    it('should load guidance and memory context for a call', async () => {
      const result = await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockMemoryRetrieval.getSubjectSummary).toHaveBeenCalledWith(
        'lead',
        '00000000-0000-0000-0000-000000000003'
      );
      expect(mockMemoryRetrieval.getRecentEvents).toHaveBeenCalled();
    });

    it('should emit guidance:memory-loaded event when memory is retrieved', async () => {
      const memoryLoadedHandler = vi.fn();
      service.on('guidance:memory-loaded', memoryLoadedHandler);

      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      expect(memoryLoadedHandler).toHaveBeenCalled();
      const [callSid, context] = memoryLoadedHandler.mock.calls[0];
      expect(callSid).toBe('call-123');
      expect(context.subjectType).toBe('lead');
      expect(context.patterns.length).toBeGreaterThan(0);
    });

    it('should skip memory retrieval when enableMemory is false', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
        enableMemory: false,
      });

      expect(mockMemoryRetrieval.getSubjectSummary).not.toHaveBeenCalled();
    });

    it('should skip memory retrieval when subjectId is missing', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
      });

      expect(mockMemoryRetrieval.getSubjectSummary).not.toHaveBeenCalled();
    });
  });

  describe('getCallMemoryContext', () => {
    it('should return memory context after loading', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      const context = service.getCallMemoryContext('call-123');

      expect(context).not.toBeNull();
      expect(context?.subjectType).toBe('lead');
      expect(context?.subjectId).toBe('00000000-0000-0000-0000-000000000003');
      expect(context?.sentimentTrend).toBe('declining');
      expect(context?.patterns.length).toBeGreaterThan(0);
    });

    it('should return null for unknown call', () => {
      const context = service.getCallMemoryContext('unknown-call');
      expect(context).toBeNull();
    });
  });

  describe('processMessageWithMemory', () => {
    beforeEach(async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });
    });

    it('should generate sentiment-aware suggestions for declining sentiment', async () => {
      const suggestions = await service.processMessageWithMemory(
        'call-123',
        'customer',
        'I have a question about the treatment'
      );

      const coachingSuggestions = suggestions.filter((s) => s.type === 'coaching-tip');
      expect(coachingSuggestions.length).toBeGreaterThan(0);

      // Should have sentiment-based suggestion due to declining trend
      const sentimentSuggestion = coachingSuggestions.find(
        (s) => s.content.includes('declining sentiment') || s.content.includes('empathetic')
      );
      expect(sentimentSuggestion).toBeDefined();
    });

    it('should generate pattern-based suggestions for price_sensitive pattern', async () => {
      const suggestions = await service.processMessageWithMemory(
        'call-123',
        'customer',
        'How much does this cost?'
      );

      const patternSuggestion = suggestions.find(
        (s) =>
          s.type === 'coaching-tip' &&
          (s.content.includes('price-sensitive') || s.content.includes('payment plans'))
      );
      expect(patternSuggestion).toBeDefined();
    });

    it('should include memory context in suggestions', async () => {
      const suggestions = await service.processMessageWithMemory(
        'call-123',
        'customer',
        'What is the price?'
      );

      const memoryEnrichedSuggestions = suggestions.filter(
        (s) => 'memoryContext' in s && s.memoryContext
      );
      expect(memoryEnrichedSuggestions.length).toBeGreaterThan(0);
    });

    it('should emit guidance:memory-suggestion event', async () => {
      const suggestionHandler = vi.fn();
      service.on('guidance:memory-suggestion', suggestionHandler);

      await service.processMessageWithMemory('call-123', 'customer', 'How much does it cost?');

      expect(suggestionHandler).toHaveBeenCalled();
    });

    it('should fallback to base suggestions when no memory context', async () => {
      // Create call without memory
      await service.loadGuidanceForCall('call-456', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        enableMemory: false,
      });

      const suggestions = await service.processMessageWithMemory(
        'call-456',
        'customer',
        'Too expensive'
      );

      // Should still get base objection response
      const objectionResponse = suggestions.find((s) => s.type === 'objection-response');
      expect(objectionResponse).toBeDefined();
    });
  });

  describe('buildMemoryContextMarkdown', () => {
    it('should build markdown context for AI prompts', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      const markdown = service.buildMemoryContextMarkdown('call-123');

      expect(markdown).not.toBeNull();
      expect(markdown?.contextMarkdown).toContain('## Patient Memory Context');
      expect(markdown?.contextMarkdown).toContain('Total interactions');
      expect(markdown?.contextMarkdown).toContain('Sentiment trend');
      expect(markdown?.contextMarkdown).toContain('Behavioral Patterns');
      expect(markdown?.knownPatterns.length).toBeGreaterThan(0);
    });

    it('should return null for call without memory', () => {
      const markdown = service.buildMemoryContextMarkdown('unknown-call');
      expect(markdown).toBeNull();
    });
  });

  describe('getAllSuggestions', () => {
    it('should combine base and memory suggestions', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      // Generate some suggestions
      await service.processMessageWithMemory(
        'call-123',
        'customer',
        'Too expensive, what is the cost?'
      );

      const allSuggestions = service.getAllSuggestions('call-123');
      const memorySuggestions = service.getMemorySuggestions('call-123');
      const baseSuggestions = service.getSuggestions('call-123');

      expect(allSuggestions.length).toBe(baseSuggestions.length + memorySuggestions.length);
    });
  });

  describe('acknowledgeSuggestion', () => {
    it('should acknowledge memory suggestions', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      await service.processMessageWithMemory('call-123', 'customer', 'How much?');

      const memorySuggestions = service.getMemorySuggestions('call-123');
      if (memorySuggestions.length > 0) {
        const result = service.acknowledgeSuggestion('call-123', memorySuggestions[0].id);
        expect(result).toBe(true);
        expect(memorySuggestions[0].acknowledged).toBe(true);
      }
    });

    it('should return false for unknown suggestion', () => {
      const result = service.acknowledgeSuggestion('call-123', 'unknown-suggestion');
      expect(result).toBe(false);
    });
  });

  describe('endCallGuidance', () => {
    it('should cleanup memory state when call ends', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      expect(service.getCallMemoryContext('call-123')).not.toBeNull();

      service.endCallGuidance('call-123');

      expect(service.getCallMemoryContext('call-123')).toBeNull();
      expect(service.hasGuidance('call-123')).toBe(false);
    });
  });

  describe('hasMemoryContext', () => {
    it('should return true when memory context is loaded', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      expect(service.hasMemoryContext('call-123')).toBe(true);
    });

    it('should return false when no memory context', async () => {
      await service.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        enableMemory: false,
      });

      expect(service.hasMemoryContext('call-123')).toBe(false);
    });
  });

  describe('CRUD operations delegation', () => {
    it('should delegate createGuidance to base service', async () => {
      const input = {
        clinicId: '00000000-0000-0000-0000-000000000002',
        type: 'call-script' as const,
        category: 'intake' as const,
        audience: 'new-patient' as const,
        name: 'New Script',
        initialGreeting: 'Hello!',
        steps: [],
        keyPoints: [],
        objectionHandlers: [],
        closingStatements: [],
        procedures: [],
        languages: ['en' as const],
        defaultLanguage: 'en' as const,
        tags: [],
      };

      await service.createGuidance(input);
      expect(mockRepository.create).toHaveBeenCalled();
    });

    it('should delegate getGuidance to base service', async () => {
      await service.getGuidance('00000000-0000-0000-0000-000000000001');
      expect(mockRepository.findById).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001');
    });
  });

  describe('error handling', () => {
    it('should handle memory retrieval errors gracefully', async () => {
      const errorMemoryRetrieval = {
        ...createMockMemoryRetrieval(),
        getSubjectSummary: vi.fn().mockRejectedValue(new Error('Database error')),
      } as unknown as MemoryRetrievalService;

      const errorService = createMemoryEnrichedGuidanceService(
        mockRepository,
        errorMemoryRetrieval
      );

      // Should not throw, just skip memory loading
      const result = await errorService.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      expect(result.success).toBe(true);
      expect(errorService.getCallMemoryContext('call-123')).toBeNull();
    });

    it('should handle semantic search errors gracefully', async () => {
      const errorMemoryRetrieval = {
        ...createMockMemoryRetrieval(),
        findSimilarInteractions: vi.fn().mockRejectedValue(new Error('Search error')),
      } as unknown as MemoryRetrievalService;

      const errorService = createMemoryEnrichedGuidanceService(
        mockRepository,
        errorMemoryRetrieval
      );

      await errorService.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      // Should not throw
      const suggestions = await errorService.processMessageWithMemory(
        'call-123',
        'customer',
        'Hello there'
      );

      expect(suggestions).toBeDefined();
    });
  });

  describe('pattern-based suggestions', () => {
    it('should generate warning for declining_engagement pattern', async () => {
      const memoryWithDecliningEngagement = {
        ...createMockMemoryRetrieval(),
        getSubjectSummary: vi.fn().mockResolvedValue({
          ...mockSubjectSummary,
          patterns: [
            {
              id: 'pattern-2',
              subjectType: 'lead' as const,
              subjectId: '00000000-0000-0000-0000-000000000003',
              patternType: 'declining_engagement',
              patternDescription: 'Engagement has been declining over time',
              confidence: 0.8,
              supportingEventIds: [],
              firstObservedAt: new Date(),
              lastObservedAt: new Date(),
              occurrenceCount: 1,
            },
          ],
        }),
      } as unknown as MemoryRetrievalService;

      const engagementService = createMemoryEnrichedGuidanceService(
        mockRepository,
        memoryWithDecliningEngagement
      );

      await engagementService.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      const suggestions = await engagementService.processMessageWithMemory(
        'call-123',
        'customer',
        'Hello'
      );

      const warningSuggestion = suggestions.find((s) => s.type === 'warning');
      expect(warningSuggestion).toBeDefined();
      expect(warningSuggestion?.content).toContain('Declining engagement');
    });

    it('should generate upsell suggestion for high_engagement pattern', async () => {
      const memoryWithHighEngagement = {
        ...createMockMemoryRetrieval(),
        getSubjectSummary: vi.fn().mockResolvedValue({
          ...mockSubjectSummary,
          sentimentTrend: 'stable' as const,
          patterns: [
            {
              id: 'pattern-3',
              subjectType: 'lead' as const,
              subjectId: '00000000-0000-0000-0000-000000000003',
              patternType: 'high_engagement',
              patternDescription: 'Highly engaged across multiple channels',
              confidence: 0.9,
              supportingEventIds: [],
              firstObservedAt: new Date(),
              lastObservedAt: new Date(),
              occurrenceCount: 1,
            },
          ],
        }),
      } as unknown as MemoryRetrievalService;

      const engagementService = createMemoryEnrichedGuidanceService(
        mockRepository,
        memoryWithHighEngagement
      );

      await engagementService.loadGuidanceForCall('call-123', {
        clinicId: '00000000-0000-0000-0000-000000000002',
        subjectType: 'lead',
        subjectId: '00000000-0000-0000-0000-000000000003',
      });

      const suggestions = await engagementService.processMessageWithMemory(
        'call-123',
        'customer',
        'Hello'
      );

      const engagementSuggestion = suggestions.find(
        (s) => s.content.includes('Highly engaged') || s.content.includes('referral')
      );
      expect(engagementSuggestion).toBeDefined();
    });
  });
});
