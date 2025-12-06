import { describe, it, expect } from 'vitest';
import {
  RetentionScoringService,
  createRetentionScoringService,
  type RetentionMetricsInput,
} from '../retention-scoring-service.js';

/**
 * Tests for RetentionScoringService
 *
 * Covers:
 * - Score calculation with all factors
 * - Individual factor penalties/bonuses
 * - Edge cases and boundary conditions
 * - Configuration customization
 * - Breakdown accuracy
 * - Label generation
 */

describe('RetentionScoringService', () => {
  // ============================================================================
  // BASIC SCORING
  // ============================================================================

  describe('Basic Scoring', () => {
    it('should calculate score for a healthy patient', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 5,
        canceledAppointments: 0,
        npsScore: 9,
        lifetimeValue: 15000,
        totalTreatments: 4,
      });

      // Base 100 + NPS promoter (+10) + engagement mid (+5) = 115, clamped to 100
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBeGreaterThanOrEqual(95); // Promoter bonus + engagement
      expect(result.classification).toBe('LOYAL');
      expect(result.churnRisk).toBe('SCAZUT');
    });

    it('should calculate score for at-risk patient', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 45,
        canceledAppointments: 2,
        npsScore: 6,
        lifetimeValue: 5000,
        totalTreatments: 2,
      });

      // Base 100 - 20 (31-60 days) - 20 (2 cancellations) - 20 (detractor) = 40
      expect(result.score).toBeLessThan(60);
      expect(result.classification).toBe('AT_RISK');
      expect(result.churnRisk).toBe('RIDICAT');
    });

    it('should calculate score for churning patient', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 100,
        canceledAppointments: 3,
        npsScore: 4,
        lifetimeValue: 3000,
        totalTreatments: 1,
      });

      // Base 100 - 40 (90+ days) - 30 (3 cancellations) - 20 (detractor) = 10
      expect(result.score).toBeLessThan(30);
      expect(result.classification).toBe('LOST');
      expect(result.churnRisk).toBe('FOARTE_RIDICAT');
    });
  });

  // ============================================================================
  // INACTIVITY FACTOR
  // ============================================================================

  describe('Inactivity Factor', () => {
    it('should not penalize for 0-7 days inactive', () => {
      const service = createRetentionScoringService();

      for (const days of [0, 5, 7]) {
        const result = service.calculateScore({
          daysInactive: days,
          canceledAppointments: 0,
          npsScore: null,
          lifetimeValue: 0,
          totalTreatments: 0,
        });

        expect(result.breakdown.inactivityPenalty).toBe(0);
      }
    });

    it('should penalize -10 for 8-30 days inactive', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 15,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.breakdown.inactivityPenalty).toBe(10);
      expect(result.score).toBe(90);
    });

    it('should penalize -20 for 31-60 days inactive', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 45,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.breakdown.inactivityPenalty).toBe(20);
      expect(result.score).toBe(80);
    });

    it('should penalize -30 for 61-90 days inactive', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 75,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.breakdown.inactivityPenalty).toBe(30);
      expect(result.score).toBe(70);
    });

    it('should penalize -40 for 90+ days inactive', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 120,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.breakdown.inactivityPenalty).toBe(40);
      expect(result.score).toBe(60);
    });
  });

  // ============================================================================
  // CANCELLATION FACTOR
  // ============================================================================

  describe('Cancellation Factor', () => {
    it('should not penalize for 0 cancellations', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.breakdown.cancellationPenalty).toBe(0);
    });

    it('should penalize -10 per cancellation', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 2,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.breakdown.cancellationPenalty).toBe(20);
      expect(result.score).toBe(80);
    });

    it('should cap cancellation penalty at -30', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 5,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.breakdown.cancellationPenalty).toBe(30);
      expect(result.score).toBe(70);
    });
  });

  // ============================================================================
  // NPS FACTOR
  // ============================================================================

  describe('NPS Factor', () => {
    it('should not adjust for null NPS', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.breakdown.npsAdjustment).toBe(0);
    });

    it('should penalize -20 for detractors (0-6)', () => {
      const service = createRetentionScoringService();

      for (const nps of [0, 3, 6]) {
        const result = service.calculateScore({
          daysInactive: 0,
          canceledAppointments: 0,
          npsScore: nps,
          lifetimeValue: 0,
          totalTreatments: 0,
        });

        expect(result.breakdown.npsAdjustment).toBe(-20);
      }
    });

    it('should penalize -5 for passives (7-8)', () => {
      const service = createRetentionScoringService();

      for (const nps of [7, 8]) {
        const result = service.calculateScore({
          daysInactive: 0,
          canceledAppointments: 0,
          npsScore: nps,
          lifetimeValue: 0,
          totalTreatments: 0,
        });

        expect(result.breakdown.npsAdjustment).toBe(-5);
      }
    });

    it('should add +10 for promoters (9-10)', () => {
      const service = createRetentionScoringService();

      for (const nps of [9, 10]) {
        const result = service.calculateScore({
          daysInactive: 0,
          canceledAppointments: 0,
          npsScore: nps,
          lifetimeValue: 0,
          totalTreatments: 0,
        });

        expect(result.breakdown.npsAdjustment).toBe(10);
      }
    });
  });

  // ============================================================================
  // ENGAGEMENT FACTOR
  // ============================================================================

  describe('Engagement Factor', () => {
    it('should not add bonus for 1-2 treatments', () => {
      const service = createRetentionScoringService();

      for (const treatments of [1, 2]) {
        const result = service.calculateScore({
          daysInactive: 0,
          canceledAppointments: 0,
          npsScore: null,
          lifetimeValue: 0,
          totalTreatments: treatments,
        });

        expect(result.breakdown.engagementBonus).toBe(0);
      }
    });

    it('should add +5 for 3-5 treatments', () => {
      const service = createRetentionScoringService();

      for (const treatments of [3, 4, 5]) {
        const result = service.calculateScore({
          daysInactive: 0,
          canceledAppointments: 0,
          npsScore: null,
          lifetimeValue: 0,
          totalTreatments: treatments,
        });

        expect(result.breakdown.engagementBonus).toBe(5);
      }
    });

    it('should add +10 for 6+ treatments', () => {
      const service = createRetentionScoringService();

      for (const treatments of [6, 10, 20]) {
        const result = service.calculateScore({
          daysInactive: 0,
          canceledAppointments: 0,
          npsScore: null,
          lifetimeValue: 0,
          totalTreatments: treatments,
        });

        expect(result.breakdown.engagementBonus).toBe(10);
      }
    });
  });

  // ============================================================================
  // HIGH-VALUE FACTOR
  // ============================================================================

  describe('High-Value Factor', () => {
    it('should not add bonus for LTV <= 20000', () => {
      const service = createRetentionScoringService();

      for (const ltv of [0, 10000, 20000]) {
        const result = service.calculateScore({
          daysInactive: 0,
          canceledAppointments: 0,
          npsScore: null,
          lifetimeValue: ltv,
          totalTreatments: 0,
        });

        expect(result.breakdown.highValueBonus).toBe(0);
      }
    });

    it('should add +5 for LTV > 20000', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 25000,
        totalTreatments: 0,
      });

      expect(result.breakdown.highValueBonus).toBe(5);
    });
  });

  // ============================================================================
  // SCORE CLAMPING
  // ============================================================================

  describe('Score Clamping', () => {
    it('should not exceed 100', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: 10, // +10
        lifetimeValue: 50000, // +5
        totalTreatments: 10, // +10
      });

      // 100 + 10 + 5 + 10 = 125, clamped to 100
      expect(result.score).toBe(100);
    });

    it('should not go below 0', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 200, // -40
        canceledAppointments: 10, // -30
        npsScore: 1, // -20
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      // 100 - 40 - 30 - 20 = 10 (naturally above 0)
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // SIMPLE SCORE CALCULATION
  // ============================================================================

  describe('calculateSimpleScore', () => {
    it('should return score, churnRisk, and followUpPriority only', () => {
      const service = createRetentionScoringService();
      const result = service.calculateSimpleScore({
        daysInactive: 45,
        canceledAppointments: 1,
        npsScore: 7,
        lifetimeValue: 8000,
        totalTreatments: 3,
      });

      expect(result.score).toBeDefined();
      expect(result.churnRisk).toBeDefined();
      expect(result.followUpPriority).toBeDefined();
      // Should not have breakdown
      expect((result as unknown as { breakdown: unknown }).breakdown).toBeUndefined();
    });
  });

  // ============================================================================
  // VALUE OBJECT RETRIEVAL
  // ============================================================================

  describe('getValueObject', () => {
    it('should return RetentionScore value object', () => {
      const service = createRetentionScoringService();
      const valueObject = service.getValueObject({
        daysInactive: 30,
        canceledAppointments: 0,
        npsScore: 9,
        lifetimeValue: 15000,
        totalTreatments: 5,
      });

      expect(valueObject.numericValue).toBeDefined();
      expect(valueObject.classification).toBeDefined();
      expect(valueObject.isLoyal).toBeDefined();
      expect(valueObject.getSuggestedActions).toBeDefined();
    });
  });

  // ============================================================================
  // REASONING GENERATION
  // ============================================================================

  describe('Reasoning Generation', () => {
    it('should include inactivity in reasoning', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 45,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.reasoning).toContain('45 days inactive');
      expect(result.reasoning).toContain('-20');
    });

    it('should include cancellations in reasoning', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 2,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.reasoning).toContain('2 canceled');
    });

    it('should include NPS promoter in reasoning', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: 10,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.reasoning).toContain('promoter');
      expect(result.reasoning).toContain('+10');
    });

    it('should include engagement in reasoning', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 7,
      });

      expect(result.reasoning).toContain('7 treatments');
      expect(result.reasoning).toContain('engaged');
    });

    it('should include high-value in reasoning', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 30000,
        totalTreatments: 0,
      });

      expect(result.reasoning).toContain('High-value');
      expect(result.reasoning).toContain('30000 EUR');
    });
  });

  // ============================================================================
  // LABELS
  // ============================================================================

  describe('Labels', () => {
    it('should return Romanian classification labels', () => {
      const service = createRetentionScoringService();

      expect(service.getClassificationLabel('LOYAL')).toBe('Loial');
      expect(service.getClassificationLabel('STABLE')).toBe('Stabil');
      expect(service.getClassificationLabel('AT_RISK')).toBe('La Risc');
      expect(service.getClassificationLabel('CHURNING')).toBe('În Pierdere');
      expect(service.getClassificationLabel('LOST')).toBe('Pierdut');
    });

    it('should return Romanian churn risk labels', () => {
      const service = createRetentionScoringService();

      expect(service.getChurnRiskLabel('SCAZUT')).toBe('Risc Scăzut');
      expect(service.getChurnRiskLabel('MEDIU')).toBe('Risc Mediu');
      expect(service.getChurnRiskLabel('RIDICAT')).toBe('Risc Ridicat');
      expect(service.getChurnRiskLabel('FOARTE_RIDICAT')).toBe('Risc Foarte Ridicat');
    });

    it('should return Romanian follow-up priority labels', () => {
      const service = createRetentionScoringService();

      expect(service.getFollowUpPriorityLabel('URGENTA')).toBe('Urgentă');
      expect(service.getFollowUpPriorityLabel('RIDICATA')).toBe('Ridicată');
      expect(service.getFollowUpPriorityLabel('MEDIE')).toBe('Medie');
      expect(service.getFollowUpPriorityLabel('SCAZUTA')).toBe('Scăzută');
    });
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  describe('Configuration', () => {
    it('should use custom weights', () => {
      const service = createRetentionScoringService({
        weights: {
          inactivityMaxPenalty: 50, // Custom max penalty
          cancellationPenalty: 15, // 15 per cancellation
        },
      });

      const result = service.calculateScore({
        daysInactive: 100,
        canceledAppointments: 2,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      // With custom weights: 100 - 50 (inactivity) - 30 (2*15) = 20
      expect(result.breakdown.inactivityPenalty).toBe(50);
      expect(result.breakdown.cancellationPenalty).toBe(30);
    });

    it('should use custom thresholds', () => {
      const service = createRetentionScoringService({
        thresholds: {
          highValueLtvThreshold: 10000, // Lower threshold
          engagementMidThreshold: 2, // Lower threshold
          engagementHighThreshold: 4, // Lower threshold
          inactivityTiers: [7, 30, 60, 90],
          classificationThresholds: {
            loyal: 80,
            stable: 60,
            atRisk: 40,
            churning: 20,
          },
        },
      });

      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 15000, // Above custom 10000 threshold
        totalTreatments: 3, // Above custom mid threshold
      });

      expect(result.breakdown.highValueBonus).toBe(5);
      expect(result.breakdown.engagementBonus).toBe(5);
    });
  });

  // ============================================================================
  // OUTPUT STRUCTURE
  // ============================================================================

  describe('Output Structure', () => {
    it('should return complete output structure', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 30,
        canceledAppointments: 1,
        npsScore: 8,
        lifetimeValue: 10000,
        totalTreatments: 4,
      });

      expect(result).toMatchObject({
        score: expect.any(Number),
        churnRisk: expect.stringMatching(/^(SCAZUT|MEDIU|RIDICAT|FOARTE_RIDICAT)$/),
        followUpPriority: expect.stringMatching(/^(URGENTA|RIDICATA|MEDIE|SCAZUTA)$/),
        classification: expect.stringMatching(/^(LOYAL|STABLE|AT_RISK|CHURNING|LOST)$/),
        confidence: expect.any(Number),
        breakdown: expect.objectContaining({
          baseScore: 100,
          inactivityPenalty: expect.any(Number),
          cancellationPenalty: expect.any(Number),
          npsAdjustment: expect.any(Number),
          engagementBonus: expect.any(Number),
          highValueBonus: expect.any(Number),
          finalScore: expect.any(Number),
        }),
        reasoning: expect.any(String),
        suggestedActions: expect.any(Array),
        calculatedAt: expect.any(String),
      });
    });

    it('should include suggested actions from value object', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 50,
        canceledAppointments: 2,
        npsScore: 6,
        lifetimeValue: 5000,
        totalTreatments: 2,
      });

      expect(result.suggestedActions.length).toBeGreaterThan(0);
      expect(result.suggestedActions).toContain('schedule_personal_call');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle zero values', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: null,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      expect(result.score).toBe(100);
      expect(result.classification).toBe('LOYAL');
    });

    it('should handle maximum penalty scenario', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 365,
        canceledAppointments: 10,
        npsScore: 0,
        lifetimeValue: 0,
        totalTreatments: 0,
      });

      // 100 - 40 - 30 - 20 = 10
      expect(result.score).toBe(10);
      expect(result.classification).toBe('LOST');
      expect(result.churnRisk).toBe('FOARTE_RIDICAT');
    });

    it('should handle maximum bonus scenario', () => {
      const service = createRetentionScoringService();
      const result = service.calculateScore({
        daysInactive: 0,
        canceledAppointments: 0,
        npsScore: 10,
        lifetimeValue: 100000,
        totalTreatments: 20,
      });

      // 100 + 10 + 5 + 10 = 125, clamped to 100
      expect(result.score).toBe(100);
    });
  });
});
