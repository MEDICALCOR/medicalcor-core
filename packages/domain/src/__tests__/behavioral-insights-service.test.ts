/**
 * @fileoverview Behavioral Insights Service Tests
 *
 * Tests for the Behavioral Insights Service that provides
 * pattern detection and cognitive insights for leads/patients.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  BehavioralInsightsService,
  createBehavioralInsightsService,
  type BehavioralInsightsServiceDependencies,
  type IDatabasePool,
} from '../behavioral-insights/behavioral-insights-service.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock the @medicalcor/core module
vi.mock('@medicalcor/core', () => ({
  createPatternDetector: vi.fn(() => ({
    detectPatterns: vi.fn(),
    getStoredPatterns: vi.fn(),
    generateInsights: vi.fn(),
    getPatternStats: vi.fn(),
  })),
  createMemoryRetrievalService: vi.fn(() => ({
    getSubjectSummary: vi.fn(),
  })),
}));

// Get references to the mocks
import { createPatternDetector, createMemoryRetrievalService } from '@medicalcor/core';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockPool(): IDatabasePool {
  return {
    query: vi.fn(),
  };
}

function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
    embeddings: {
      create: vi.fn(),
    },
  };
}

function createMockEmbeddings() {
  return {
    generateEmbedding: vi.fn(),
    generateEmbeddings: vi.fn(),
  };
}

function createMockDeps(): BehavioralInsightsServiceDependencies {
  return {
    pool: createMockPool(),
    openai: createMockOpenAI() as unknown as BehavioralInsightsServiceDependencies['openai'],
    embeddings:
      createMockEmbeddings() as unknown as BehavioralInsightsServiceDependencies['embeddings'],
  };
}

function createMockMemorySummary(overrides = {}) {
  return {
    subjectType: 'lead' as const,
    subjectId: 'lead-123',
    totalEvents: 15,
    firstInteraction: new Date('2024-01-01'),
    lastInteraction: new Date('2024-12-01'),
    channelBreakdown: {
      whatsapp: 10,
      email: 3,
      phone: 2,
    },
    sentimentCounts: {
      positive: 8,
      neutral: 5,
      negative: 2,
    },
    sentimentTrend: 'stable' as const,
    averageResponseTimeMs: 3600000,
    ...overrides,
  };
}

function createMockPattern(overrides = {}) {
  return {
    id: 'pattern-123',
    subjectType: 'lead' as const,
    subjectId: 'lead-123',
    patternType: 'high_engagement' as const,
    confidence: 0.85,
    evidenceEventIds: ['event-1', 'event-2'],
    metadata: {},
    firstDetected: new Date('2024-06-01'),
    lastConfirmed: new Date('2024-12-01'),
    ...overrides,
  };
}

function createMockInsight(overrides = {}) {
  return {
    id: 'insight-123',
    subjectType: 'lead' as const,
    subjectId: 'lead-123',
    type: 'engagement_opportunity' as const,
    title: 'High Engagement Window',
    description: 'Lead shows peak engagement on weekday mornings',
    confidence: 0.8,
    basedOnPatterns: ['pattern-123'],
    recommendedAction: 'Schedule calls between 9-11 AM on weekdays',
    createdAt: new Date('2024-12-01'),
    expiresAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('BehavioralInsightsService', () => {
  let deps: BehavioralInsightsServiceDependencies;
  let service: BehavioralInsightsService;
  let mockPatternDetector: {
    detectPatterns: Mock;
    getStoredPatterns: Mock;
    generateInsights: Mock;
    getPatternStats: Mock;
  };
  let mockMemoryRetrieval: {
    getSubjectSummary: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    deps = createMockDeps();

    // Get references to the mock services
    mockPatternDetector = (createPatternDetector as Mock).mock.results[0]?.value ?? {
      detectPatterns: vi.fn(),
      getStoredPatterns: vi.fn(),
      generateInsights: vi.fn(),
      getPatternStats: vi.fn(),
    };
    mockMemoryRetrieval = (createMemoryRetrievalService as Mock).mock.results[0]?.value ?? {
      getSubjectSummary: vi.fn(),
    };

    // Reset mocks before each test
    (createPatternDetector as Mock).mockReturnValue(mockPatternDetector);
    (createMemoryRetrievalService as Mock).mockReturnValue(mockMemoryRetrieval);

    service = new BehavioralInsightsService(deps);
  });

  // ==========================================================================
  // Constructor and Factory
  // ==========================================================================

  describe('constructor', () => {
    it('should create service with dependencies', () => {
      expect(service).toBeDefined();
      expect(createPatternDetector).toHaveBeenCalled();
      expect(createMemoryRetrievalService).toHaveBeenCalled();
    });
  });

  describe('createBehavioralInsightsService', () => {
    it('should create service using factory function', () => {
      const svc = createBehavioralInsightsService(deps);
      expect(svc).toBeInstanceOf(BehavioralInsightsService);
    });
  });

  // ==========================================================================
  // Profile Generation
  // ==========================================================================

  describe('generateProfile', () => {
    it('should generate comprehensive behavioral profile', async () => {
      const mockSummary = createMockMemorySummary();
      const mockPatterns = [createMockPattern()];
      const mockInsights = [createMockInsight()];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(mockSummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(mockPatterns);
      mockPatternDetector.generateInsights.mockResolvedValue(mockInsights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.subjectType).toBe('lead');
      expect(profile.subjectId).toBe('lead-123');
      expect(profile.memorySummary).toEqual(mockSummary);
      expect(profile.patterns).toEqual(mockPatterns);
      expect(profile.insights).toEqual(mockInsights);
      expect(profile.engagementScore).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(profile.churnRisk);
      expect(profile.recommendations).toBeInstanceOf(Array);
      expect(profile.generatedAt).toBeInstanceOf(Date);
    });

    it('should calculate high engagement score for active users', async () => {
      const activeSummary = createMockMemorySummary({
        totalEvents: 20,
        lastInteraction: new Date(), // Today
        channelBreakdown: { whatsapp: 10, email: 5, phone: 3, web: 2 },
        sentimentCounts: { positive: 15, neutral: 5, negative: 0 },
      });
      const highEngagementPattern = createMockPattern({
        patternType: 'high_engagement',
        confidence: 0.9,
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(activeSummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue([highEngagementPattern]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.engagementScore).toBeGreaterThan(50);
    });

    it('should assess high churn risk for declining engagement', async () => {
      const decliningPattern = createMockPattern({
        patternType: 'declining_engagement',
        confidence: 0.7,
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(createMockMemorySummary());
      mockPatternDetector.getStoredPatterns.mockResolvedValue([decliningPattern]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.churnRisk).toBe('high');
    });

    it('should generate recommendations based on patterns', async () => {
      const quickResponder = createMockPattern({
        patternType: 'quick_responder',
        confidence: 0.8,
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(createMockMemorySummary());
      mockPatternDetector.getStoredPatterns.mockResolvedValue([quickResponder]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations.some((r) => r.includes('real-time'))).toBe(true);
    });
  });

  describe('getSummary', () => {
    it('should return behavioral summary', async () => {
      const mockSummary = createMockMemorySummary();
      const mockPatterns = [
        createMockPattern({ confidence: 0.9 }),
        createMockPattern({ patternType: 'quick_responder', confidence: 0.7 }),
      ];
      const mockInsights = [createMockInsight({ type: 'engagement_opportunity', confidence: 0.8 })];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(mockSummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(mockPatterns);
      mockPatternDetector.generateInsights.mockResolvedValue(mockInsights);

      const summary = await service.getSummary('lead', 'lead-123');

      expect(summary.subjectType).toBe('lead');
      expect(summary.subjectId).toBe('lead-123');
      expect(summary.patternCount).toBe(2);
      expect(summary.insightCount).toBe(1);
      expect(summary.topPatterns).toHaveLength(2);
      expect(summary.topInsightTypes).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Pattern Detection
  // ==========================================================================

  describe('detectPatterns', () => {
    it('should detect patterns for a subject', async () => {
      const mockPatterns = [createMockPattern()];
      mockPatternDetector.detectPatterns.mockResolvedValue(mockPatterns);

      const patterns = await service.detectPatterns('lead', 'lead-123');

      expect(patterns).toEqual(mockPatterns);
      expect(mockPatternDetector.detectPatterns).toHaveBeenCalledWith('lead', 'lead-123');
    });
  });

  describe('detectPatternsBatch', () => {
    it('should process multiple subjects', async () => {
      mockPatternDetector.detectPatterns.mockResolvedValue([createMockPattern()]);

      const subjects = [
        { subjectType: 'lead' as const, subjectId: 'lead-1' },
        { subjectType: 'lead' as const, subjectId: 'lead-2' },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.totalSubjects).toBe(2);
      expect(result.successfulSubjects).toBe(2);
      expect(result.failedSubjects).toBe(0);
      expect(result.totalPatternsDetected).toBe(2);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle failures gracefully', async () => {
      mockPatternDetector.detectPatterns
        .mockResolvedValueOnce([createMockPattern()])
        .mockRejectedValueOnce(new Error('Detection failed'));

      const subjects = [
        { subjectType: 'lead' as const, subjectId: 'lead-1' },
        { subjectType: 'lead' as const, subjectId: 'lead-2' },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.successfulSubjects).toBe(1);
      expect(result.failedSubjects).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Detection failed');
    });
  });

  describe('getPatterns', () => {
    it('should return stored patterns', async () => {
      const mockPatterns = [createMockPattern()];
      mockPatternDetector.getStoredPatterns.mockResolvedValue(mockPatterns);

      const patterns = await service.getPatterns('lead', 'lead-123');

      expect(patterns).toEqual(mockPatterns);
    });
  });

  // ==========================================================================
  // Insights
  // ==========================================================================

  describe('generateInsights', () => {
    it('should generate insights for a subject', async () => {
      const mockInsights = [createMockInsight()];
      mockPatternDetector.generateInsights.mockResolvedValue(mockInsights);

      const insights = await service.generateInsights('lead', 'lead-123');

      expect(insights).toEqual(mockInsights);
    });
  });

  describe('getChurnRiskSubjects', () => {
    it('should return subjects at risk of churn', async () => {
      const mockRows = [
        {
          subject_id: 'lead-1',
          subject_type: 'lead',
          pattern_type: 'declining_engagement',
          confidence: 0.85,
        },
        {
          subject_id: 'lead-2',
          subject_type: 'lead',
          pattern_type: 'appointment_rescheduler',
          confidence: 0.65,
        },
      ];
      (deps.pool.query as Mock).mockResolvedValue({ rows: mockRows });

      const results = await service.getChurnRiskSubjects('clinic-123', 20);

      expect(results).toHaveLength(2);
      expect(results[0].riskLevel).toBe('high'); // confidence >= 0.8
      expect(results[1].riskLevel).toBe('medium'); // confidence < 0.8
    });

    it('should provide appropriate churn reasons', async () => {
      const mockRows = [
        {
          subject_id: 'lead-1',
          subject_type: 'lead',
          pattern_type: 'declining_engagement',
          confidence: 0.9,
        },
      ];
      (deps.pool.query as Mock).mockResolvedValue({ rows: mockRows });

      const results = await service.getChurnRiskSubjects('clinic-123');

      expect(results[0].reason).toContain('Declining engagement');
    });
  });

  describe('getReactivationCandidates', () => {
    it('should return inactive subjects for reactivation', async () => {
      const lastInteraction = new Date();
      lastInteraction.setDate(lastInteraction.getDate() - 90); // 90 days ago

      const mockRows = [
        { subject_id: 'lead-1', subject_type: 'lead', last_interaction: lastInteraction },
      ];
      (deps.pool.query as Mock).mockResolvedValue({ rows: mockRows });

      const results = await service.getReactivationCandidates('clinic-123', 60, 20);

      expect(results).toHaveLength(1);
      expect(results[0].daysSinceLastInteraction).toBeGreaterThanOrEqual(90);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('getPatternStats', () => {
    it('should return pattern statistics', async () => {
      const mockStats = {
        totalPatterns: 100,
        byType: {
          high_engagement: 30,
          quick_responder: 25,
          declining_engagement: 15,
        },
        highConfidenceCount: 45,
        recentlyDetected: 20,
      };
      mockPatternDetector.getPatternStats.mockResolvedValue(mockStats);

      const stats = await service.getPatternStats();

      expect(stats).toEqual(mockStats);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty patterns', async () => {
      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(createMockMemorySummary());
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.patterns).toHaveLength(0);
      expect(profile.churnRisk).toBe('low');
    });

    it('should handle null lastInteraction in engagement calculation', async () => {
      const summaryWithNoInteraction = createMockMemorySummary({
        lastInteraction: null,
        totalEvents: 0,
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(summaryWithNoInteraction);
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.engagementScore).toBeGreaterThanOrEqual(0);
      expect(profile.engagementScore).toBeLessThanOrEqual(100);
    });

    it('should assess medium risk for declining sentiment', async () => {
      const decliningSentiment = createMockMemorySummary({
        sentimentTrend: 'declining',
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(decliningSentiment);
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.churnRisk).toBe('medium');
    });

    it('should limit recommendations to 5', async () => {
      const manyPatterns = [
        createMockPattern({ patternType: 'quick_responder' }),
        createMockPattern({ patternType: 'slow_responder' }),
        createMockPattern({ patternType: 'monday_avoider' }),
        createMockPattern({ patternType: 'quality_focused' }),
        createMockPattern({ patternType: 'declining_engagement', confidence: 0.8 }),
      ];
      const manyInsights = [
        createMockInsight({ recommendedAction: 'Action 1' }),
        createMockInsight({ recommendedAction: 'Action 2' }),
        createMockInsight({ recommendedAction: 'Action 3' }),
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(createMockMemorySummary());
      mockPatternDetector.getStoredPatterns.mockResolvedValue(manyPatterns);
      mockPatternDetector.generateInsights.mockResolvedValue(manyInsights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations.length).toBeLessThanOrEqual(5);
    });
  });
});
