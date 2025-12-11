/**
 * BehavioralInsightsService Unit Tests
 *
 * Tests for the behavioral insights service that provides
 * pattern detection, engagement scoring, and churn risk assessment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  BehavioralPattern,
  CognitiveInsight,
  SubjectMemorySummary,
  SubjectType,
  IOpenAIClient,
  IEmbeddingService,
} from '@medicalcor/core';
import * as coreMock from '@medicalcor/core';
import {
  BehavioralInsightsService,
  createBehavioralInsightsService,
  type BehavioralInsightsServiceDependencies,
  type IDatabasePool,
} from '../behavioral-insights-service.js';

/** Mock interface for PatternDetector returned by createPatternDetector */
interface MockPatternDetector {
  detectPatterns: ReturnType<typeof vi.fn>;
  getStoredPatterns: ReturnType<typeof vi.fn>;
  generateInsights: ReturnType<typeof vi.fn>;
  getPatternStats: ReturnType<typeof vi.fn>;
}

/** Mock interface for MemoryRetrieval returned by createMemoryRetrievalService */
interface MockMemoryRetrieval {
  getSubjectSummary: ReturnType<typeof vi.fn>;
}

// =============================================================================
// Test Mocks
// =============================================================================

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

// =============================================================================
// Test Factories
// =============================================================================

function createMockPool(): IDatabasePool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

function createMockOpenAI(): IOpenAIClient {
  return {
    chatCompletion: vi.fn().mockResolvedValue('{}'),
  };
}

function createMockEmbeddings(): IEmbeddingService {
  return {
    embed: vi.fn().mockResolvedValue({ embedding: [], contentHash: '' }),
  };
}

function createMockDependencies(): BehavioralInsightsServiceDependencies {
  return {
    pool: createMockPool(),
    openai: createMockOpenAI(),
    embeddings: createMockEmbeddings(),
    config: {},
  };
}

function createMockMemorySummary(
  overrides: Partial<SubjectMemorySummary> = {}
): SubjectMemorySummary {
  return {
    subjectType: 'lead' as SubjectType,
    subjectId: 'test-lead-123',
    totalEvents: 15,
    firstInteraction: new Date('2024-01-01'),
    lastInteraction: new Date('2024-06-15'),
    channelBreakdown: {
      whatsapp: 8,
      voice: 5,
      web: 2,
    },
    eventTypeBreakdown: {
      message: 10,
      call: 5,
    },
    sentimentCounts: {
      positive: 8,
      neutral: 5,
      negative: 2,
    },
    sentimentTrend: 'stable',
    topTopics: ['implants', 'pricing', 'consultation'],
    ...overrides,
  };
}

function createMockPattern(overrides: Partial<BehavioralPattern> = {}): BehavioralPattern {
  return {
    id: `pattern-${crypto.randomUUID()}`,
    subjectType: 'lead' as SubjectType,
    subjectId: 'test-lead-123',
    patternType: 'high_engagement',
    confidence: 0.85,
    metadata: {},
    detectedAt: new Date(),
    ...overrides,
  };
}

function createMockInsight(overrides: Partial<CognitiveInsight> = {}): CognitiveInsight {
  return {
    id: `insight-${crypto.randomUUID()}`,
    subjectType: 'lead' as SubjectType,
    subjectId: 'test-lead-123',
    type: 'engagement_trend',
    confidence: 0.8,
    description: 'Patient shows consistent engagement',
    recommendedAction: 'Schedule follow-up consultation',
    generatedAt: new Date(),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('BehavioralInsightsService', () => {
  let service: BehavioralInsightsService;
  let deps: BehavioralInsightsServiceDependencies;
  let mockPatternDetector: MockPatternDetector;
  let mockMemoryRetrieval: MockMemoryRetrieval;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock instances with proper types
    mockPatternDetector = {
      detectPatterns: vi.fn(),
      getStoredPatterns: vi.fn(),
      generateInsights: vi.fn(),
      getPatternStats: vi.fn(),
    };
    mockMemoryRetrieval = {
      getSubjectSummary: vi.fn(),
    };

    vi.mocked(coreMock.createPatternDetector).mockReturnValue(mockPatternDetector);
    vi.mocked(coreMock.createMemoryRetrievalService).mockReturnValue(mockMemoryRetrieval);

    deps = createMockDependencies();
    service = new BehavioralInsightsService(deps);
  });

  // ===========================================================================
  // Factory Function
  // ===========================================================================

  describe('createBehavioralInsightsService', () => {
    it('should create service instance', () => {
      const instance = createBehavioralInsightsService(deps);
      expect(instance).toBeInstanceOf(BehavioralInsightsService);
    });
  });

  // ===========================================================================
  // Profile Generation
  // ===========================================================================

  describe('generateProfile', () => {
    it('should generate a complete behavioral profile', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [createMockPattern({ patternType: 'high_engagement', confidence: 0.9 })];
      const insights = [createMockInsight()];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'test-lead-123');

      expect(profile.subjectType).toBe('lead');
      expect(profile.subjectId).toBe('test-lead-123');
      expect(profile.memorySummary).toEqual(memorySummary);
      expect(profile.patterns).toEqual(patterns);
      expect(profile.insights).toEqual(insights);
      expect(profile.engagementScore).toBeGreaterThanOrEqual(0);
      expect(profile.engagementScore).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high']).toContain(profile.churnRisk);
      expect(profile.recommendations).toBeInstanceOf(Array);
      expect(profile.generatedAt).toBeInstanceOf(Date);
    });

    it('should calculate high engagement score for active patient', async () => {
      const memorySummary = createMockMemorySummary({
        totalEvents: 30,
        lastInteraction: new Date(), // Recent interaction
        channelBreakdown: { whatsapp: 15, voice: 10, web: 5 },
        sentimentCounts: { positive: 20, neutral: 8, negative: 2 },
      });
      const patterns = [createMockPattern({ patternType: 'high_engagement', confidence: 0.95 })];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('patient', 'patient-123');

      expect(profile.engagementScore).toBeGreaterThan(50);
    });

    it('should calculate low engagement score for inactive patient', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 120); // 120 days ago

      const memorySummary = createMockMemorySummary({
        totalEvents: 2,
        lastInteraction: oldDate,
        channelBreakdown: { whatsapp: 2 },
        sentimentCounts: { positive: 0, neutral: 1, negative: 1 },
      });
      const patterns = [
        createMockPattern({ patternType: 'declining_engagement', confidence: 0.8 }),
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-456');

      expect(profile.engagementScore).toBeLessThan(50);
    });
  });

  // ===========================================================================
  // Summary
  // ===========================================================================

  describe('getSummary', () => {
    it('should return a behavioral summary', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [
        createMockPattern({ patternType: 'quick_responder', confidence: 0.9 }),
        createMockPattern({ patternType: 'quality_focused', confidence: 0.85 }),
        createMockPattern({ patternType: 'high_engagement', confidence: 0.7 }),
      ];
      const insights = [
        createMockInsight({ type: 'upsell_opportunity', confidence: 0.8 }),
        createMockInsight({ type: 'engagement_trend', confidence: 0.75 }),
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const summary = await service.getSummary('lead', 'lead-123');

      expect(summary.subjectType).toBe('lead');
      expect(summary.subjectId).toBe('lead-123');
      expect(summary.patternCount).toBe(3);
      expect(summary.topPatterns).toHaveLength(3);
      expect(summary.topPatterns[0]).toBe('quick_responder'); // Highest confidence
      expect(summary.insightCount).toBe(2);
      expect(summary.topInsightTypes).toHaveLength(2);
      expect(summary.engagementScore).toBeGreaterThanOrEqual(0);
      expect(['low', 'medium', 'high']).toContain(summary.churnRisk);
    });

    it('should limit top patterns to 3', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [
        createMockPattern({ patternType: 'pattern1', confidence: 0.9 }),
        createMockPattern({ patternType: 'pattern2', confidence: 0.85 }),
        createMockPattern({ patternType: 'pattern3', confidence: 0.8 }),
        createMockPattern({ patternType: 'pattern4', confidence: 0.75 }),
        createMockPattern({ patternType: 'pattern5', confidence: 0.7 }),
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const summary = await service.getSummary('lead', 'lead-123');

      expect(summary.topPatterns).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Pattern Detection
  // ===========================================================================

  describe('detectPatterns', () => {
    it('should detect patterns for a subject', async () => {
      const patterns = [
        createMockPattern({ patternType: 'high_engagement' }),
        createMockPattern({ patternType: 'quick_responder' }),
      ];

      mockPatternDetector.detectPatterns.mockResolvedValue(patterns);

      const result = await service.detectPatterns('lead', 'lead-123');

      expect(result).toEqual(patterns);
      expect(mockPatternDetector.detectPatterns).toHaveBeenCalledWith('lead', 'lead-123');
    });
  });

  describe('detectPatternsBatch', () => {
    it('should process multiple subjects successfully', async () => {
      mockPatternDetector.detectPatterns
        .mockResolvedValueOnce([createMockPattern()])
        .mockResolvedValueOnce([createMockPattern(), createMockPattern()])
        .mockResolvedValueOnce([]);

      const subjects = [
        { subjectType: 'lead' as SubjectType, subjectId: 'lead-1' },
        { subjectType: 'patient' as SubjectType, subjectId: 'patient-1' },
        { subjectType: 'lead' as SubjectType, subjectId: 'lead-2' },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.totalSubjects).toBe(3);
      expect(result.successfulSubjects).toBe(3);
      expect(result.failedSubjects).toBe(0);
      expect(result.totalPatternsDetected).toBe(3);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.results).toHaveLength(3);
    });

    it('should handle errors gracefully', async () => {
      mockPatternDetector.detectPatterns
        .mockResolvedValueOnce([createMockPattern()])
        .mockRejectedValueOnce(new Error('Detection failed'))
        .mockResolvedValueOnce([createMockPattern()]);

      const subjects = [
        { subjectType: 'lead' as SubjectType, subjectId: 'lead-1' },
        { subjectType: 'lead' as SubjectType, subjectId: 'lead-2' },
        { subjectType: 'lead' as SubjectType, subjectId: 'lead-3' },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.totalSubjects).toBe(3);
      expect(result.successfulSubjects).toBe(2);
      expect(result.failedSubjects).toBe(1);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Detection failed');
    });

    it('should handle non-Error exceptions', async () => {
      mockPatternDetector.detectPatterns.mockRejectedValueOnce('String error');

      const subjects = [{ subjectType: 'lead' as SubjectType, subjectId: 'lead-1' }];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.failedSubjects).toBe(1);
      expect(result.results[0].error).toBe('Unknown error');
    });
  });

  describe('getPatterns', () => {
    it('should get stored patterns', async () => {
      const patterns = [createMockPattern()];
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);

      const result = await service.getPatterns('lead', 'lead-123');

      expect(result).toEqual(patterns);
      expect(mockPatternDetector.getStoredPatterns).toHaveBeenCalledWith('lead', 'lead-123');
    });
  });

  // ===========================================================================
  // Insights
  // ===========================================================================

  describe('generateInsights', () => {
    it('should generate insights for a subject', async () => {
      const insights = [createMockInsight()];
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const result = await service.generateInsights('lead', 'lead-123');

      expect(result).toEqual(insights);
      expect(mockPatternDetector.generateInsights).toHaveBeenCalledWith('lead', 'lead-123');
    });
  });

  // ===========================================================================
  // Churn Risk Assessment
  // ===========================================================================

  describe('Churn Risk Assessment', () => {
    it('should assess high churn risk for high-confidence churn insight', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns: BehavioralPattern[] = [];
      const insights = [createMockInsight({ type: 'churn_risk', confidence: 0.85 })];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.churnRisk).toBe('high');
    });

    it('should assess high churn risk for declining engagement pattern', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [
        createMockPattern({ patternType: 'declining_engagement', confidence: 0.7 }),
      ];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.churnRisk).toBe('high');
    });

    it('should assess medium churn risk for appointment rescheduler pattern', async () => {
      const memorySummary = createMockMemorySummary({ sentimentTrend: 'stable' });
      const patterns = [
        createMockPattern({ patternType: 'appointment_rescheduler', confidence: 0.6 }),
      ];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.churnRisk).toBe('medium');
    });

    it('should assess medium churn risk for declining sentiment', async () => {
      const memorySummary = createMockMemorySummary({ sentimentTrend: 'declining' });
      const patterns: BehavioralPattern[] = [];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.churnRisk).toBe('medium');
    });

    it('should assess medium churn risk for reactivation candidate', async () => {
      const memorySummary = createMockMemorySummary({ sentimentTrend: 'stable' });
      const patterns: BehavioralPattern[] = [];
      const insights = [createMockInsight({ type: 'reactivation_candidate' })];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.churnRisk).toBe('medium');
    });

    it('should assess low churn risk for engaged patient', async () => {
      const memorySummary = createMockMemorySummary({ sentimentTrend: 'improving' });
      const patterns = [createMockPattern({ patternType: 'high_engagement', confidence: 0.9 })];
      const insights = [createMockInsight({ type: 'engagement_trend' })];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.churnRisk).toBe('low');
    });
  });

  // ===========================================================================
  // Recommendations
  // ===========================================================================

  describe('Recommendations', () => {
    it('should generate recommendations from insights', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns: BehavioralPattern[] = [];
      const insights = [
        createMockInsight({ recommendedAction: 'Schedule follow-up call' }),
        createMockInsight({ recommendedAction: 'Send promotional offer' }),
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations).toContain('Schedule follow-up call');
      expect(profile.recommendations).toContain('Send promotional offer');
    });

    it('should generate recommendations for quick_responder pattern', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [createMockPattern({ patternType: 'quick_responder' })];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations).toContain(
        'Use real-time communication channels for best engagement'
      );
    });

    it('should generate recommendations for slow_responder pattern', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [createMockPattern({ patternType: 'slow_responder' })];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations).toContain('Allow adequate response time before follow-ups');
    });

    it('should generate recommendations for monday_avoider pattern', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [createMockPattern({ patternType: 'monday_avoider' })];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations).toContain('Avoid scheduling appointments on Mondays');
    });

    it('should generate recommendations for quality_focused pattern', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [createMockPattern({ patternType: 'quality_focused' })];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations).toContain(
        'Emphasize credentials and success stories in communications'
      );
    });

    it('should generate high-priority recommendations for high churn risk', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [
        createMockPattern({ patternType: 'declining_engagement', confidence: 0.8 }),
      ];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations).toContain(
        'Prioritize immediate follow-up with personalized outreach'
      );
      expect(profile.recommendations).toContain(
        'Consider offering special incentives or flexible options'
      );
    });

    it('should generate proactive recommendations for medium churn risk', async () => {
      const memorySummary = createMockMemorySummary({ sentimentTrend: 'declining' });
      const patterns: BehavioralPattern[] = [];
      const insights: CognitiveInsight[] = [];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations).toContain('Schedule proactive check-in within the next week');
    });

    it('should deduplicate recommendations', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns: BehavioralPattern[] = [];
      const insights = [
        createMockInsight({ recommendedAction: 'Same action' }),
        createMockInsight({ recommendedAction: 'Same action' }),
        createMockInsight({ recommendedAction: 'Different action' }),
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      const sameActionCount = profile.recommendations.filter((r) => r === 'Same action').length;
      expect(sameActionCount).toBe(1);
    });

    it('should limit recommendations to 5', async () => {
      const memorySummary = createMockMemorySummary();
      const patterns = [
        createMockPattern({ patternType: 'quick_responder' }),
        createMockPattern({ patternType: 'slow_responder' }),
        createMockPattern({ patternType: 'monday_avoider' }),
        createMockPattern({ patternType: 'quality_focused' }),
        createMockPattern({ patternType: 'declining_engagement', confidence: 0.8 }),
      ];
      const insights = [
        createMockInsight({ recommendedAction: 'Action 1' }),
        createMockInsight({ recommendedAction: 'Action 2' }),
        createMockInsight({ recommendedAction: 'Action 3' }),
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue(insights);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.recommendations.length).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // Churn Risk Subjects Query
  // ===========================================================================

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
          subject_id: 'patient-1',
          subject_type: 'patient',
          pattern_type: 'appointment_rescheduler',
          confidence: 0.7,
        },
      ];

      vi.mocked(deps.pool.query).mockResolvedValue({ rows: mockRows });

      const result = await service.getChurnRiskSubjects('clinic-123', 10);

      expect(result).toHaveLength(2);
      expect(result[0].subjectId).toBe('lead-1');
      expect(result[0].riskLevel).toBe('high');
      expect(result[0].reason).toBe('Declining engagement over time');
      expect(result[1].subjectId).toBe('patient-1');
      expect(result[1].riskLevel).toBe('medium');
      expect(result[1].reason).toBe('Frequent appointment rescheduling');
    });

    it('should use default limit', async () => {
      vi.mocked(deps.pool.query).mockResolvedValue({ rows: [] });

      await service.getChurnRiskSubjects('clinic-123');

      expect(deps.pool.query).toHaveBeenCalledWith(expect.any(String), [20]);
    });

    it('should return default reason for unknown pattern', async () => {
      const mockRows = [
        {
          subject_id: 'lead-1',
          subject_type: 'lead',
          pattern_type: 'unknown_pattern',
          confidence: 0.7,
        },
      ];

      vi.mocked(deps.pool.query).mockResolvedValue({ rows: mockRows });

      const result = await service.getChurnRiskSubjects('clinic-123');

      expect(result[0].reason).toBe('Behavioral pattern indicates potential churn');
    });
  });

  // ===========================================================================
  // Reactivation Candidates Query
  // ===========================================================================

  describe('getReactivationCandidates', () => {
    it('should return reactivation candidates', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 90);

      const mockRows = [
        {
          subject_id: 'lead-1',
          subject_type: 'lead',
          last_interaction: oldDate,
        },
      ];

      vi.mocked(deps.pool.query).mockResolvedValue({ rows: mockRows });

      const result = await service.getReactivationCandidates('clinic-123', 60, 10);

      expect(result).toHaveLength(1);
      expect(result[0].subjectId).toBe('lead-1');
      expect(result[0].daysSinceLastInteraction).toBeGreaterThanOrEqual(89);
    });

    it('should use default parameters', async () => {
      vi.mocked(deps.pool.query).mockResolvedValue({ rows: [] });

      await service.getReactivationCandidates('clinic-123');

      expect(deps.pool.query).toHaveBeenCalledWith(expect.any(String), [60, 20]);
    });
  });

  // ===========================================================================
  // Pattern Statistics
  // ===========================================================================

  describe('getPatternStats', () => {
    it('should return pattern statistics', async () => {
      const mockStats = {
        totalPatterns: 100,
        byType: { high_engagement: 40, quick_responder: 30, declining_engagement: 30 },
        highConfidenceCount: 60,
        recentlyDetected: 25,
      };

      mockPatternDetector.getPatternStats.mockResolvedValue(mockStats);

      const result = await service.getPatternStats();

      expect(result).toEqual(mockStats);
      expect(mockPatternDetector.getPatternStats).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Engagement Score Calculation
  // ===========================================================================

  describe('Engagement Score Calculation', () => {
    it('should calculate score based on interaction count (max 30 points)', async () => {
      const memorySummary = createMockMemorySummary({
        totalEvents: 20, // Should give 30 points (capped at 15 * 2 = 30)
        lastInteraction: null,
        channelBreakdown: {},
        sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      // With 20 events * 2 = 40, capped at 30
      expect(profile.engagementScore).toBeGreaterThanOrEqual(30);
    });

    it('should add points for channel diversity (max 20 points)', async () => {
      const memorySummary = createMockMemorySummary({
        totalEvents: 0,
        lastInteraction: null,
        channelBreakdown: {
          whatsapp: 5,
          voice: 3,
          web: 2,
          email: 1,
        },
        sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      // 4 channels * 5 = 20 points
      expect(profile.engagementScore).toBeGreaterThanOrEqual(20);
    });

    it('should add points for recent interactions', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days ago

      const memorySummary = createMockMemorySummary({
        totalEvents: 0,
        lastInteraction: recentDate,
        channelBreakdown: {},
        sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      // Within 7 days = 20 points
      expect(profile.engagementScore).toBe(20);
    });

    it('should handle different recency tiers', async () => {
      const scenarios = [
        { daysAgo: 5, expectedMin: 20 }, // <= 7 days
        { daysAgo: 20, expectedMin: 15 }, // <= 30 days
        { daysAgo: 45, expectedMin: 10 }, // <= 60 days
        { daysAgo: 75, expectedMin: 5 }, // <= 90 days
        { daysAgo: 120, expectedMin: 0 }, // > 90 days
      ];

      for (const { daysAgo, expectedMin } of scenarios) {
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);

        const memorySummary = createMockMemorySummary({
          totalEvents: 0,
          lastInteraction: date,
          channelBreakdown: {},
          sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
        });

        mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
        mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
        mockPatternDetector.generateInsights.mockResolvedValue([]);

        const profile = await service.generateProfile('lead', 'lead-123');

        expect(profile.engagementScore).toBeGreaterThanOrEqual(expectedMin);
      }
    });

    it('should add points for positive sentiment', async () => {
      const memorySummary = createMockMemorySummary({
        totalEvents: 0,
        lastInteraction: null,
        channelBreakdown: {},
        sentimentCounts: { positive: 15, neutral: 3, negative: 2 }, // 75% positive
      });

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue([]);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      // 75% positive * 15 = ~11 points
      expect(profile.engagementScore).toBeGreaterThanOrEqual(10);
    });

    it('should cap engagement score at 100', async () => {
      const memorySummary = createMockMemorySummary({
        totalEvents: 100, // 30 points (capped)
        lastInteraction: new Date(), // 20 points
        channelBreakdown: { a: 1, b: 1, c: 1, d: 1, e: 1 }, // 20 points (capped at 4)
        sentimentCounts: { positive: 100, neutral: 0, negative: 0 }, // 15 points
      });
      const patterns = [
        createMockPattern({ patternType: 'high_engagement', confidence: 1.0 }), // 15 points
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.engagementScore).toBeLessThanOrEqual(100);
    });

    it('should not go below 0', async () => {
      const memorySummary = createMockMemorySummary({
        totalEvents: 0,
        lastInteraction: null,
        channelBreakdown: {},
        sentimentCounts: { positive: 0, neutral: 0, negative: 0 },
      });
      const patterns = [
        createMockPattern({ patternType: 'declining_engagement', confidence: 1.0 }),
      ];

      mockMemoryRetrieval.getSubjectSummary.mockResolvedValue(memorySummary);
      mockPatternDetector.getStoredPatterns.mockResolvedValue(patterns);
      mockPatternDetector.generateInsights.mockResolvedValue([]);

      const profile = await service.generateProfile('lead', 'lead-123');

      expect(profile.engagementScore).toBeGreaterThanOrEqual(0);
    });
  });
});
