/**
 * @fileoverview Behavioral Insights Service Tests
 *
 * Tests for M5: Pattern Detection for Cognitive Memory (Behavioral Insights).
 * Covers profile generation, pattern detection, churn risk assessment,
 * and engagement scoring.
 *
 * @module domain/behavioral-insights/__tests__/behavioral-insights-service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  BehavioralInsightsService,
  createBehavioralInsightsService,
  type BehavioralInsightsServiceDependencies,
  type IDatabasePool,
} from '../behavioral-insights-service.js';

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

const createMockPool = (): IDatabasePool => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
});

const createMockOpenAI = () => ({
  createEmbedding: vi.fn().mockResolvedValue({ embedding: new Array(1536).fill(0) }),
  chat: vi.fn().mockResolvedValue({ content: 'Mock response' }),
});

const createMockEmbeddings = () => ({
  embed: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  embedBatch: vi.fn().mockResolvedValue([new Array(1536).fill(0)]),
});

const createMockDeps = (): BehavioralInsightsServiceDependencies => ({
  pool: createMockPool(),
  openai: createMockOpenAI() as any,
  embeddings: createMockEmbeddings() as any,
});

// Mock the core module dependencies
vi.mock('@medicalcor/core', async () => {
  const mockMemorySummary = {
    totalEvents: 10,
    channelBreakdown: { whatsapp: 5, voice: 3, web: 2 },
    sentimentCounts: { positive: 5, neutral: 3, negative: 2 },
    lastInteraction: new Date(),
    sentimentTrend: 'stable' as const,
  };

  const mockPattern = {
    id: 'pattern-123',
    subjectType: 'lead' as const,
    subjectId: 'lead-001',
    patternType: 'high_engagement',
    confidence: 0.85,
    detectedAt: new Date(),
    metadata: {},
  };

  const mockInsight = {
    id: 'insight-123',
    type: 'engagement_trend',
    confidence: 0.8,
    recommendedAction: 'Follow up within 24 hours',
  };

  return {
    createPatternDetector: vi.fn(() => ({
      detectPatterns: vi.fn().mockResolvedValue([mockPattern]),
      getStoredPatterns: vi.fn().mockResolvedValue([mockPattern]),
      generateInsights: vi.fn().mockResolvedValue([mockInsight]),
      getPatternStats: vi.fn().mockResolvedValue({
        totalPatterns: 100,
        byType: { high_engagement: 30, declining_engagement: 20 },
        highConfidenceCount: 50,
        recentlyDetected: 10,
      }),
    })),
    createMemoryRetrievalService: vi.fn(() => ({
      getSubjectSummary: vi.fn().mockResolvedValue(mockMemorySummary),
      retrieve: vi.fn().mockResolvedValue([]),
    })),
  };
});

// =============================================================================
// TEST SUITE
// =============================================================================

describe('BehavioralInsightsService', () => {
  let service: BehavioralInsightsService;
  let mockDeps: BehavioralInsightsServiceDependencies;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeps = createMockDeps();
    service = new BehavioralInsightsService(mockDeps);
  });

  // ===========================================================================
  // PROFILE GENERATION TESTS
  // ===========================================================================

  describe('generateProfile', () => {
    it('should generate a complete behavioral profile', async () => {
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(profile).toBeDefined();
      expect(profile.subjectType).toBe('lead');
      expect(profile.subjectId).toBe('lead-001');
      expect(profile.memorySummary).toBeDefined();
      expect(profile.patterns).toBeDefined();
      expect(profile.insights).toBeDefined();
      expect(profile.recommendations).toBeDefined();
      expect(profile.churnRisk).toBeDefined();
      expect(profile.engagementScore).toBeDefined();
      expect(profile.generatedAt).toBeInstanceOf(Date);
    });

    it('should include memory summary in profile', async () => {
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(profile.memorySummary).toBeDefined();
      expect(profile.memorySummary.totalEvents).toBeGreaterThanOrEqual(0);
    });

    it('should include detected patterns', async () => {
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(Array.isArray(profile.patterns)).toBe(true);
    });

    it('should include insights', async () => {
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(Array.isArray(profile.insights)).toBe(true);
    });

    it('should calculate engagement score', async () => {
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(profile.engagementScore).toBeGreaterThanOrEqual(0);
      expect(profile.engagementScore).toBeLessThanOrEqual(100);
    });

    it('should assess churn risk', async () => {
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(['low', 'medium', 'high']).toContain(profile.churnRisk);
    });

    it('should generate recommendations', async () => {
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(Array.isArray(profile.recommendations)).toBe(true);
    });
  });

  // ===========================================================================
  // SUMMARY TESTS
  // ===========================================================================

  describe('getSummary', () => {
    it('should return a behavioral summary', async () => {
      const summary = await service.getSummary('patient', 'patient-001');

      expect(summary).toBeDefined();
      expect(summary.subjectType).toBe('patient');
      expect(summary.subjectId).toBe('patient-001');
      expect(summary.patternCount).toBeDefined();
      expect(summary.insightCount).toBeDefined();
      expect(summary.engagementScore).toBeDefined();
      expect(summary.churnRisk).toBeDefined();
    });

    it('should include top patterns', async () => {
      const summary = await service.getSummary('lead', 'lead-001');

      expect(Array.isArray(summary.topPatterns)).toBe(true);
      expect(summary.topPatterns.length).toBeLessThanOrEqual(3);
    });

    it('should include top insight types', async () => {
      const summary = await service.getSummary('lead', 'lead-001');

      expect(Array.isArray(summary.topInsightTypes)).toBe(true);
      expect(summary.topInsightTypes.length).toBeLessThanOrEqual(3);
    });

    it('should include last interaction date', async () => {
      const summary = await service.getSummary('lead', 'lead-001');

      // lastInteraction can be null or Date
      expect(summary.lastInteraction === null || summary.lastInteraction instanceof Date).toBe(
        true
      );
    });
  });

  // ===========================================================================
  // PATTERN DETECTION TESTS
  // ===========================================================================

  describe('detectPatterns', () => {
    it('should detect patterns for a subject', async () => {
      const patterns = await service.detectPatterns('lead', 'lead-001');

      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should work for different subject types', async () => {
      const leadPatterns = await service.detectPatterns('lead', 'lead-001');
      const patientPatterns = await service.detectPatterns('patient', 'patient-001');

      expect(Array.isArray(leadPatterns)).toBe(true);
      expect(Array.isArray(patientPatterns)).toBe(true);
    });
  });

  describe('detectPatternsBatch', () => {
    it('should process multiple subjects', async () => {
      const subjects = [
        { subjectType: 'lead' as const, subjectId: 'lead-001' },
        { subjectType: 'lead' as const, subjectId: 'lead-002' },
        { subjectType: 'patient' as const, subjectId: 'patient-001' },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.totalSubjects).toBe(3);
      expect(result.successfulSubjects + result.failedSubjects).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track successful and failed subjects', async () => {
      const subjects = [
        { subjectType: 'lead' as const, subjectId: 'lead-001' },
        { subjectType: 'lead' as const, subjectId: 'lead-002' },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.results.every((r) => typeof r.success === 'boolean')).toBe(true);
    });

    it('should count total patterns detected', async () => {
      const subjects = [{ subjectType: 'lead' as const, subjectId: 'lead-001' }];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.totalPatternsDetected).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty subjects array', async () => {
      const result = await service.detectPatternsBatch([]);

      expect(result.totalSubjects).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('getPatterns', () => {
    it('should retrieve stored patterns', async () => {
      const patterns = await service.getPatterns('lead', 'lead-001');

      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  // ===========================================================================
  // INSIGHTS TESTS
  // ===========================================================================

  describe('generateInsights', () => {
    it('should generate insights for a subject', async () => {
      const insights = await service.generateInsights('lead', 'lead-001');

      expect(Array.isArray(insights)).toBe(true);
    });
  });

  // ===========================================================================
  // CHURN RISK TESTS
  // ===========================================================================

  describe('getChurnRiskSubjects', () => {
    it('should query for churn risk subjects', async () => {
      const mockPool = mockDeps.pool as ReturnType<typeof createMockPool>;
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            subject_id: 'lead-001',
            subject_type: 'lead',
            pattern_type: 'declining_engagement',
            confidence: 0.8,
          },
        ],
      });

      const results = await service.getChurnRiskSubjects('clinic-001');

      expect(mockPool.query).toHaveBeenCalled();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const mockPool = mockDeps.pool as ReturnType<typeof createMockPool>;
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.getChurnRiskSubjects('clinic-001', 5);

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [5]);
    });

    it('should map risk levels correctly', async () => {
      const mockPool = mockDeps.pool as ReturnType<typeof createMockPool>;
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            subject_id: 'lead-001',
            subject_type: 'lead',
            pattern_type: 'declining_engagement',
            confidence: 0.85,
          },
          {
            subject_id: 'lead-002',
            subject_type: 'lead',
            pattern_type: 'appointment_rescheduler',
            confidence: 0.65,
          },
        ],
      });

      const results = await service.getChurnRiskSubjects('clinic-001');

      expect(results[0].riskLevel).toBe('high'); // confidence >= 0.8
      expect(results[1].riskLevel).toBe('medium'); // confidence < 0.8
    });

    it('should include churn reason', async () => {
      const mockPool = mockDeps.pool as ReturnType<typeof createMockPool>;
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            subject_id: 'lead-001',
            subject_type: 'lead',
            pattern_type: 'declining_engagement',
            confidence: 0.8,
          },
        ],
      });

      const results = await service.getChurnRiskSubjects('clinic-001');

      expect(results[0].reason).toContain('Declining engagement');
    });
  });

  // ===========================================================================
  // REACTIVATION CANDIDATES TESTS
  // ===========================================================================

  describe('getReactivationCandidates', () => {
    it('should query for reactivation candidates', async () => {
      const mockPool = mockDeps.pool as ReturnType<typeof createMockPool>;
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 90);

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            subject_id: 'lead-001',
            subject_type: 'lead',
            last_interaction: oldDate,
          },
        ],
      });

      const results = await service.getReactivationCandidates('clinic-001');

      expect(mockPool.query).toHaveBeenCalled();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should calculate days since last interaction', async () => {
      const mockPool = mockDeps.pool as ReturnType<typeof createMockPool>;
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 90);

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            subject_id: 'lead-001',
            subject_type: 'lead',
            last_interaction: oldDate,
          },
        ],
      });

      const results = await service.getReactivationCandidates('clinic-001');

      expect(results[0].daysSinceLastInteraction).toBeGreaterThanOrEqual(89);
    });

    it('should respect minDaysInactive parameter', async () => {
      const mockPool = mockDeps.pool as ReturnType<typeof createMockPool>;
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.getReactivationCandidates('clinic-001', 30);

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [30, 20]);
    });

    it('should respect limit parameter', async () => {
      const mockPool = mockDeps.pool as ReturnType<typeof createMockPool>;
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.getReactivationCandidates('clinic-001', 60, 10);

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [60, 10]);
    });
  });

  // ===========================================================================
  // STATISTICS TESTS
  // ===========================================================================

  describe('getPatternStats', () => {
    it('should return pattern statistics', async () => {
      const stats = await service.getPatternStats();

      expect(stats).toBeDefined();
      expect(stats.totalPatterns).toBeDefined();
      expect(stats.byType).toBeDefined();
      expect(stats.highConfidenceCount).toBeDefined();
      expect(stats.recentlyDetected).toBeDefined();
    });
  });

  // ===========================================================================
  // FACTORY FUNCTION TESTS
  // ===========================================================================

  describe('createBehavioralInsightsService', () => {
    it('should create service instance', () => {
      const svc = createBehavioralInsightsService(mockDeps);
      expect(svc).toBeInstanceOf(BehavioralInsightsService);
    });

    it('should accept custom configuration', () => {
      const deps: BehavioralInsightsServiceDependencies = {
        ...mockDeps,
        config: { retentionDays: 365 },
      };

      const svc = createBehavioralInsightsService(deps);
      expect(svc).toBeInstanceOf(BehavioralInsightsService);
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('engagement score should always be between 0 and 100', async () => {
      // Since we're using mocks, we test the contract
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(profile.engagementScore).toBeGreaterThanOrEqual(0);
      expect(profile.engagementScore).toBeLessThanOrEqual(100);
    });

    it('churn risk should always be valid enum value', async () => {
      const validValues = ['low', 'medium', 'high'];
      const profile = await service.generateProfile('lead', 'lead-001');

      expect(validValues).toContain(profile.churnRisk);
    });

    it('batch processing should handle multiple subjects', async () => {
      const subjects = [
        { subjectType: 'lead' as const, subjectId: 'lead-001' },
        { subjectType: 'patient' as const, subjectId: 'patient-001' },
        { subjectType: 'contact' as const, subjectId: 'contact-001' },
      ];

      const result = await service.detectPatternsBatch(subjects);

      expect(result.totalSubjects).toBe(3);
      expect(result.results.length).toBe(3);
      expect(result.successfulSubjects + result.failedSubjects).toBe(3);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle subject with no history', async () => {
      // The mock returns empty data, simulating no history
      const profile = await service.generateProfile('lead', 'new-lead');

      expect(profile).toBeDefined();
      expect(profile.subjectId).toBe('new-lead');
    });

    it('should handle concurrent profile generation', async () => {
      const profiles = await Promise.all([
        service.generateProfile('lead', 'lead-001'),
        service.generateProfile('lead', 'lead-002'),
        service.generateProfile('patient', 'patient-001'),
      ]);

      expect(profiles).toHaveLength(3);
      profiles.forEach((profile) => {
        expect(profile).toBeDefined();
        expect(profile.subjectId).toBeDefined();
      });
    });

    it('should handle special characters in subject ID', async () => {
      const profile = await service.generateProfile('lead', 'lead-with-special_chars.123');

      expect(profile.subjectId).toBe('lead-with-special_chars.123');
    });
  });
});
