/**
 * @fileoverview Tests for Behavioral Insights Service
 *
 * Tests for pattern detection, profile generation, churn risk assessment,
 * and engagement scoring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BehavioralInsightsService,
  createBehavioralInsightsService,
  type BehavioralInsightsServiceDependencies,
  type IDatabasePool,
} from '../behavioral-insights-service.js';

// =============================================================================
// Mock Setup
// =============================================================================

// Mock the core module
vi.mock('@medicalcor/core', () => ({
  createPatternDetector: vi.fn(() => mockPatternDetector),
  createMemoryRetrievalService: vi.fn(() => mockMemoryRetrieval),
}));

// Mock pattern detector
const mockPatternDetector = {
  detectPatterns: vi.fn(),
  getStoredPatterns: vi.fn(),
  generateInsights: vi.fn(),
  getPatternStats: vi.fn(),
};

// Mock memory retrieval
const mockMemoryRetrieval = {
  getSubjectSummary: vi.fn(),
};

// =============================================================================
// Mock Data Factories
// =============================================================================

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';

function createMockPool(): IDatabasePool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

function createMockOpenAI() {
  return {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  };
}

function createMockEmbeddings() {
  return {
    embedText: vi.fn(),
  };
}

function createMockDependencies(): BehavioralInsightsServiceDependencies {
  return {
    pool: createMockPool(),
    openai: createMockOpenAI() as any,
    embeddings: createMockEmbeddings() as any,
    config: {},
  };
}

function createMockMemorySummary(overrides = {}) {
  return {
    subjectType: 'lead' as const,
    subjectId: MOCK_UUID,
    totalEvents: 15,
    firstInteraction: new Date('2024-01-01'),
    lastInteraction: new Date('2024-06-15'),
    channelBreakdown: { whatsapp: 8, voice: 5, web: 2 },
    sentimentTrend: 'stable' as const,
    sentimentCounts: { positive: 10, neutral: 4, negative: 1 },
    patterns: [],
    recentSummary: 'Recent interactions show consistent engagement.',
    ...overrides,
  };
}

function createMockPattern(overrides = {}) {
  return {
    id: MOCK_UUID,
    subjectType: 'lead' as const,
    subjectId: MOCK_UUID,
    patternType: 'high_engagement',
    patternDescription: 'Shows high engagement across channels',
    confidence: 0.85,
    supportingEventIds: [MOCK_UUID],
    firstObservedAt: new Date('2024-01-15'),
    lastObservedAt: new Date('2024-06-10'),
    occurrenceCount: 5,
    ...overrides,
  };
}

function createMockInsight(overrides = {}) {
  return {
    type: 'positive_momentum' as const,
    confidence: 0.8,
    description: 'Patient shows positive engagement momentum',
    recommendedAction: 'Consider scheduling follow-up appointment',
    supportingEventIds: [MOCK_UUID],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('BehavioralInsightsService', () => {
  let service: BehavioralInsightsService;
  let deps: BehavioralInsightsServiceDependencies;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDependencies();
    service = new BehavioralInsightsService(deps);

    // Default mock implementations
    mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(createMockMemorySummary());
    mockPatternDetector.getStoredPatterns.mockResolvedValue([createMockPattern()]);
    mockPatternDetector.generateInsights.mockResolvedValue([createMockInsight()]);
    mockPatternDetector.detectPatterns.mockResolvedValue([createMockPattern()]);
    mockPatternDetector.getPatternStats.mockResolvedValue({
      totalPatterns: 10,
      byType: { high_engagement: 5, quick_responder: 3, price_sensitive: 2 },
      highConfidenceCount: 6,
      recentlyDetected: 4,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and Factory', () => {
    it('should create service via constructor', () => {
      const svc = new BehavioralInsightsService(deps);
      expect(svc).toBeInstanceOf(BehavioralInsightsService);
    });

    it('should create service via factory function', () => {
      const svc = createBehavioralInsightsService(deps);
      expect(svc).toBeInstanceOf(BehavioralInsightsService);
    });

    it('should create service without config', () => {
      const depsWithoutConfig = {
        pool: createMockPool(),
        openai: createMockOpenAI() as any,
        embeddings: createMockEmbeddings() as any,
      };
      const svc = new BehavioralInsightsService(depsWithoutConfig);
      expect(svc).toBeInstanceOf(BehavioralInsightsService);
    });
  });

  describe('generateProfile', () => {
    it('should generate a comprehensive behavioral profile', async () => {
      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile).toBeDefined();
      expect(profile.subjectType).toBe('lead');
      expect(profile.subjectId).toBe(MOCK_UUID);
      expect(profile.memorySummary).toBeDefined();
      expect(profile.patterns).toBeInstanceOf(Array);
      expect(profile.insights).toBeInstanceOf(Array);
      expect(profile.recommendations).toBeInstanceOf(Array);
      expect(profile.generatedAt).toBeInstanceOf(Date);
    });

    it('should calculate engagement score', async () => {
      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(typeof profile.engagementScore).toBe('number');
      expect(profile.engagementScore).toBeGreaterThanOrEqual(0);
      expect(profile.engagementScore).toBeLessThanOrEqual(100);
    });

    it('should assess churn risk', async () => {
      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(['low', 'medium', 'high']).toContain(profile.churnRisk);
    });

    it('should generate recommendations based on patterns', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'quick_responder' }),
        createMockPattern({ patternType: 'monday_avoider' }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations.length).toBeGreaterThan(0);
    });

    it('should work for patient subject type', async () => {
      const profile = await service.generateProfile('patient', MOCK_UUID);

      expect(profile.subjectType).toBe('patient');
    });

    it('should work for contact subject type', async () => {
      const profile = await service.generateProfile('contact', MOCK_UUID);

      expect(profile.subjectType).toBe('contact');
    });
  });

  describe('getSummary', () => {
    it('should return a quick behavioral summary', async () => {
      const summary = await service.getSummary('lead', MOCK_UUID);

      expect(summary).toBeDefined();
      expect(summary.subjectType).toBe('lead');
      expect(summary.subjectId).toBe(MOCK_UUID);
      expect(typeof summary.patternCount).toBe('number');
      expect(summary.topPatterns).toBeInstanceOf(Array);
      expect(typeof summary.insightCount).toBe('number');
      expect(summary.topInsightTypes).toBeInstanceOf(Array);
      expect(typeof summary.engagementScore).toBe('number');
      expect(['low', 'medium', 'high']).toContain(summary.churnRisk);
    });

    it('should include top patterns sorted by confidence', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'low_confidence', confidence: 0.3 }),
        createMockPattern({ patternType: 'high_confidence', confidence: 0.95 }),
        createMockPattern({ patternType: 'medium_confidence', confidence: 0.7 }),
      ]);

      const summary = await service.getSummary('lead', MOCK_UUID);

      expect(summary.topPatterns[0]).toBe('high_confidence');
    });

    it('should include top insight types sorted by confidence', async () => {
      mockPatternDetector.generateInsights.mockResolvedValue([
        createMockInsight({ type: 'churn_risk', confidence: 0.5 }),
        createMockInsight({ type: 'upsell_opportunity', confidence: 0.9 }),
        createMockInsight({ type: 'engagement_drop', confidence: 0.7 }),
      ]);

      const summary = await service.getSummary('lead', MOCK_UUID);

      expect(summary.topInsightTypes[0]).toBe('upsell_opportunity');
    });
  });

  describe('detectPatterns', () => {
    it('should detect patterns for a subject', async () => {
      const patterns = await service.detectPatterns('lead', MOCK_UUID);

      expect(patterns).toBeInstanceOf(Array);
      expect(mockPatternDetector.detectPatterns).toHaveBeenCalledWith('lead', MOCK_UUID);
    });
  });

  describe('detectPatternsBatch', () => {
    it('should batch detect patterns for multiple subjects', async () => {
      const subjects = [
        { subjectType: 'lead' as const, subjectId: MOCK_UUID },
        { subjectType: 'patient' as const, subjectId: MOCK_UUID_2 },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.totalSubjects).toBe(2);
      expect(result.successfulSubjects).toBe(2);
      expect(result.failedSubjects).toBe(0);
      expect(result.totalPatternsDetected).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.results).toHaveLength(2);
    });

    it('should handle partial failures in batch processing', async () => {
      mockPatternDetector.detectPatterns
        .mockResolvedValueOnce([createMockPattern()])
        .mockRejectedValueOnce(new Error('Database error'));

      const subjects = [
        { subjectType: 'lead' as const, subjectId: MOCK_UUID },
        { subjectType: 'patient' as const, subjectId: MOCK_UUID_2 },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.totalSubjects).toBe(2);
      expect(result.successfulSubjects).toBe(1);
      expect(result.failedSubjects).toBe(1);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Database error');
    });

    it('should handle non-Error exceptions', async () => {
      mockPatternDetector.detectPatterns
        .mockResolvedValueOnce([createMockPattern()])
        .mockRejectedValueOnce('string error');

      const subjects = [
        { subjectType: 'lead' as const, subjectId: MOCK_UUID },
        { subjectType: 'patient' as const, subjectId: MOCK_UUID_2 },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.results[1].error).toBe('Unknown error');
    });

    it('should handle empty batch', async () => {
      const result = await service.detectPatternsBatch([]);

      expect(result.totalSubjects).toBe(0);
      expect(result.successfulSubjects).toBe(0);
      expect(result.failedSubjects).toBe(0);
    });
  });

  describe('getPatterns', () => {
    it('should get stored patterns for a subject', async () => {
      const patterns = await service.getPatterns('lead', MOCK_UUID);

      expect(patterns).toBeInstanceOf(Array);
      expect(mockPatternDetector.getStoredPatterns).toHaveBeenCalledWith('lead', MOCK_UUID);
    });
  });

  describe('generateInsights', () => {
    it('should generate insights for a subject', async () => {
      const insights = await service.generateInsights('lead', MOCK_UUID);

      expect(insights).toBeInstanceOf(Array);
      expect(mockPatternDetector.generateInsights).toHaveBeenCalledWith('lead', MOCK_UUID);
    });
  });

  describe('getChurnRiskSubjects', () => {
    it('should query for subjects at churn risk', async () => {
      (deps.pool.query as any).mockResolvedValue({
        rows: [
          {
            subject_id: MOCK_UUID,
            subject_type: 'lead',
            pattern_type: 'declining_engagement',
            confidence: 0.85,
          },
        ],
      });

      const subjects = await service.getChurnRiskSubjects('clinic-1');

      expect(subjects).toHaveLength(1);
      expect(subjects[0].subjectId).toBe(MOCK_UUID);
      expect(subjects[0].riskLevel).toBe('high');
      expect(subjects[0].reason).toBe('Declining engagement over time');
    });

    it('should return medium risk for confidence between 0.6 and 0.8', async () => {
      (deps.pool.query as any).mockResolvedValue({
        rows: [
          {
            subject_id: MOCK_UUID,
            subject_type: 'patient',
            pattern_type: 'appointment_rescheduler',
            confidence: 0.7,
          },
        ],
      });

      const subjects = await service.getChurnRiskSubjects('clinic-1');

      expect(subjects[0].riskLevel).toBe('medium');
      expect(subjects[0].reason).toBe('Frequent appointment rescheduling');
    });

    it('should use custom limit', async () => {
      (deps.pool.query as any).mockResolvedValue({ rows: [] });

      await service.getChurnRiskSubjects('clinic-1', 50);

      expect(deps.pool.query).toHaveBeenCalledWith(expect.any(String), [50]);
    });

    it('should handle unknown pattern types', async () => {
      (deps.pool.query as any).mockResolvedValue({
        rows: [
          {
            subject_id: MOCK_UUID,
            subject_type: 'lead',
            pattern_type: 'unknown_pattern',
            confidence: 0.9,
          },
        ],
      });

      const subjects = await service.getChurnRiskSubjects('clinic-1');

      expect(subjects[0].reason).toBe('Behavioral pattern indicates potential churn');
    });
  });

  describe('getReactivationCandidates', () => {
    it('should query for reactivation candidates', async () => {
      const lastInteraction = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      (deps.pool.query as any).mockResolvedValue({
        rows: [
          {
            subject_id: MOCK_UUID,
            subject_type: 'patient',
            last_interaction: lastInteraction,
          },
        ],
      });

      const candidates = await service.getReactivationCandidates('clinic-1');

      expect(candidates).toHaveLength(1);
      expect(candidates[0].subjectId).toBe(MOCK_UUID);
      expect(candidates[0].daysSinceLastInteraction).toBeGreaterThanOrEqual(90);
    });

    it('should use custom parameters', async () => {
      (deps.pool.query as any).mockResolvedValue({ rows: [] });

      await service.getReactivationCandidates('clinic-1', 30, 10);

      expect(deps.pool.query).toHaveBeenCalledWith(expect.any(String), [30, 10]);
    });
  });

  describe('getPatternStats', () => {
    it('should return pattern statistics', async () => {
      const stats = await service.getPatternStats();

      expect(stats.totalPatterns).toBe(10);
      expect(stats.byType).toEqual({
        high_engagement: 5,
        quick_responder: 3,
        price_sensitive: 2,
      });
      expect(stats.highConfidenceCount).toBe(6);
      expect(stats.recentlyDetected).toBe(4);
    });
  });

  describe('Engagement Score Calculation', () => {
    it('should give higher score for more interactions', async () => {
      mockMemoryRetrieval.getSubjectSummary
        .mockResolvedValueOnce(createMockMemorySummary({ totalEvents: 5 }))
        .mockResolvedValueOnce(createMockMemorySummary({ totalEvents: 20 }));

      const profile1 = await service.generateProfile('lead', MOCK_UUID);
      const profile2 = await service.generateProfile('lead', MOCK_UUID);

      expect(profile2.engagementScore).toBeGreaterThan(profile1.engagementScore);
    });

    it('should give higher score for recent interactions', async () => {
      const recentDate = new Date();
      const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

      mockMemoryRetrieval.getSubjectSummary
        .mockResolvedValueOnce(createMockMemorySummary({ lastInteraction: oldDate }))
        .mockResolvedValueOnce(createMockMemorySummary({ lastInteraction: recentDate }));

      const profile1 = await service.generateProfile('lead', MOCK_UUID);
      const profile2 = await service.generateProfile('lead', MOCK_UUID);

      expect(profile2.engagementScore).toBeGreaterThan(profile1.engagementScore);
    });

    it('should handle null lastInteraction', async () => {
      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(
        createMockMemorySummary({ lastInteraction: null })
      );

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(typeof profile.engagementScore).toBe('number');
    });

    it('should deduct score for declining engagement pattern', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'declining_engagement', confidence: 0.9 }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.engagementScore).toBeLessThan(100);
    });

    it('should add bonus for high engagement pattern', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'high_engagement', confidence: 1.0 }),
      ]);

      const profile1 = await service.generateProfile('lead', MOCK_UUID);

      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);

      const profile2 = await service.generateProfile('lead', MOCK_UUID);

      expect(profile1.engagementScore).toBeGreaterThan(profile2.engagementScore);
    });
  });

  describe('Churn Risk Assessment', () => {
    it('should return high risk for churn_risk insight', async () => {
      mockPatternDetector.generateInsights.mockResolvedValue([
        createMockInsight({ type: 'churn_risk', confidence: 0.8 }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.churnRisk).toBe('high');
    });

    it('should return high risk for declining_engagement pattern', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'declining_engagement', confidence: 0.7 }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.churnRisk).toBe('high');
    });

    it('should return medium risk for appointment_rescheduler pattern', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'appointment_rescheduler', confidence: 0.6 }),
      ]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.churnRisk).toBe('medium');
    });

    it('should return medium risk for declining sentiment trend', async () => {
      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(
        createMockMemorySummary({ sentimentTrend: 'declining' })
      );
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.churnRisk).toBe('medium');
    });

    it('should return medium risk for reactivation_candidate insight', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([
        createMockInsight({ type: 'reactivation_candidate', confidence: 0.7 }),
      ]);
      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(
        createMockMemorySummary({ sentimentTrend: 'stable' })
      );

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.churnRisk).toBe('medium');
    });

    it('should return low risk when no risk indicators', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);
      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(
        createMockMemorySummary({ sentimentTrend: 'improving' })
      );

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.churnRisk).toBe('low');
    });
  });

  describe('Recommendations Generation', () => {
    it('should add quick_responder recommendation', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'quick_responder' }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations).toContain(
        'Use real-time communication channels for best engagement'
      );
    });

    it('should add slow_responder recommendation', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'slow_responder' }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations).toContain('Allow adequate response time before follow-ups');
    });

    it('should add monday_avoider recommendation', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'monday_avoider' }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations).toContain('Avoid scheduling appointments on Mondays');
    });

    it('should add quality_focused recommendation', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'quality_focused' }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations).toContain(
        'Emphasize credentials and success stories in communications'
      );
    });

    it('should add high churn risk recommendations', async () => {
      mockPatternDetector.generateInsights.mockResolvedValue([
        createMockInsight({ type: 'churn_risk', confidence: 0.9 }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations).toContain(
        'Prioritize immediate follow-up with personalized outreach'
      );
      expect(profile.recommendations).toContain(
        'Consider offering special incentives or flexible options'
      );
    });

    it('should add medium churn risk recommendations', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'appointment_rescheduler', confidence: 0.55 }),
      ]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations).toContain('Schedule proactive check-in within the next week');
    });

    it('should include insight recommended actions', async () => {
      mockPatternDetector.generateInsights.mockResolvedValue([
        createMockInsight({ recommendedAction: 'Custom insight recommendation' }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations).toContain('Custom insight recommendation');
    });

    it('should deduplicate and limit recommendations', async () => {
      mockPatternDetector.getStoredPatterns.mockResolvedValue([
        createMockPattern({ patternType: 'quick_responder' }),
        createMockPattern({ patternType: 'quick_responder' }),
        createMockPattern({ patternType: 'slow_responder' }),
        createMockPattern({ patternType: 'monday_avoider' }),
        createMockPattern({ patternType: 'quality_focused' }),
      ]);
      mockPatternDetector.generateInsights.mockResolvedValue([
        createMockInsight({ type: 'churn_risk', confidence: 0.9 }),
      ]);

      const profile = await service.generateProfile('lead', MOCK_UUID);

      expect(profile.recommendations.length).toBeLessThanOrEqual(5);
      // Check for unique recommendations
      const uniqueRecs = new Set(profile.recommendations);
      expect(uniqueRecs.size).toBe(profile.recommendations.length);
    });
  });
});
