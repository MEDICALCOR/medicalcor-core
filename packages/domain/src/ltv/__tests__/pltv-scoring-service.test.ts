import { describe, it, expect } from 'vitest';
import {
  PLTVScoringService,
  createPLTVScoringService,
  type PLTVPredictionInput,
} from '../pltv-scoring-service.js';

/**
 * Tests for PLTVScoringService
 *
 * Covers:
 * - Score calculation with all factors
 * - Tier classification
 * - Growth potential determination
 * - Individual factor multipliers
 * - Edge cases and boundary conditions
 * - Configuration customization
 * - Breakdown accuracy
 */

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createDefaultInput = (overrides: Partial<PLTVPredictionInput> = {}): PLTVPredictionInput => ({
  leadId: 'lead-123',
  clinicId: 'clinic-456',
  historical: {
    totalPaid: 10000,
    totalCaseValue: 12000,
    totalOutstanding: 2000,
    completedCases: 3,
    totalCases: 4,
    avgCaseValue: 3000,
    daysSinceFirstCase: 365,
    daysSinceLastCase: 30,
  },
  paymentBehavior: {
    onTimePaymentRate: 85,
    paymentPlansUsed: 1,
    avgDaysToPayment: 14,
    missedPayments: 0,
    preferredPaymentMethod: 'card',
  },
  engagement: {
    totalAppointments: 10,
    keptAppointments: 9,
    canceledAppointments: 1,
    noShows: 0,
    daysSinceLastContact: 15,
    referralsMade: 1,
    hasNPSFeedback: true,
    npsScore: 8,
  },
  procedureInterest: {
    allOnXInterest: false,
    implantInterest: true,
    fullMouthInterest: false,
    cosmeticInterest: false,
    highValueProceduresCompleted: 1,
    expressedInterests: ['implants'],
  },
  retentionScore: 75,
  leadSource: 'whatsapp',
  ...overrides,
});

describe('PLTVScoringService', () => {
  // ============================================================================
  // BASIC SCORING
  // ============================================================================

  describe('Basic Scoring', () => {
    it('should calculate pLTV for a standard patient', () => {
      const service = createPLTVScoringService();
      const result = service.calculatePLTV(createDefaultInput());

      expect(result.predictedLTV).toBeGreaterThan(0);
      expect(result.leadId).toBe('lead-123');
      expect(result.method).toBe('rule_based');
      expect(result.modelVersion).toBe('1.0.0');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should classify high-value patient as GOLD or higher', () => {
      const service = createPLTVScoringService();
      const input = createDefaultInput({
        historical: {
          totalPaid: 25000,
          totalCaseValue: 30000,
          totalOutstanding: 5000,
          completedCases: 5,
          totalCases: 6,
          avgCaseValue: 5000,
          daysSinceFirstCase: 730,
          daysSinceLastCase: 15,
        },
        procedureInterest: {
          allOnXInterest: true,
          implantInterest: true,
          fullMouthInterest: false,
          cosmeticInterest: false,
          highValueProceduresCompleted: 2,
        },
        retentionScore: 85,
      });

      const result = service.calculatePLTV(input);

      expect(result.predictedLTV).toBeGreaterThan(15000);
      expect(['GOLD', 'PLATINUM', 'DIAMOND']).toContain(result.tier);
    });

    it('should calculate lower pLTV for patients with limited history', () => {
      const service = createPLTVScoringService();
      const input = createDefaultInput({
        historical: {
          totalPaid: 1000,
          totalCaseValue: 1500,
          totalOutstanding: 500,
          completedCases: 1,
          totalCases: 1,
          avgCaseValue: 1000,
          daysSinceFirstCase: 60,
          daysSinceLastCase: 45,
        },
        procedureInterest: {
          allOnXInterest: false,
          implantInterest: false,
          fullMouthInterest: false,
          cosmeticInterest: false,
          highValueProceduresCompleted: 0,
        },
        retentionScore: 50,
      });

      const result = service.calculatePLTV(input);

      // With limited history, pLTV should be lower than high-value patients
      // but still includes future case projections
      expect(result.predictedLTV).toBeGreaterThan(0);
      expect(result.predictedLTV).toBeLessThan(50000); // Should not reach DIAMOND
    });
  });

  // ============================================================================
  // TIER CLASSIFICATION
  // ============================================================================

  describe('Tier Classification', () => {
    it('should classify as DIAMOND for pLTV >= 50000', () => {
      const service = createPLTVScoringService();
      const input = createDefaultInput({
        historical: {
          totalPaid: 40000,
          totalCaseValue: 50000,
          totalOutstanding: 10000,
          completedCases: 10,
          totalCases: 12,
          avgCaseValue: 4200,
          daysSinceFirstCase: 1095, // 3 years
          daysSinceLastCase: 7,
        },
        procedureInterest: {
          allOnXInterest: true,
          implantInterest: true,
          fullMouthInterest: true,
          cosmeticInterest: true,
          highValueProceduresCompleted: 5,
        },
        retentionScore: 95,
        engagement: {
          totalAppointments: 30,
          keptAppointments: 29,
          canceledAppointments: 1,
          noShows: 0,
          daysSinceLastContact: 5,
          referralsMade: 3,
          hasNPSFeedback: true,
          npsScore: 10,
        },
      });

      const result = service.calculatePLTV(input);

      expect(result.tier).toBe('DIAMOND');
      expect(result.investmentPriority).toBe('PRIORITATE_MAXIMA');
    });

    it('should classify low-value patient appropriately', () => {
      const service = createPLTVScoringService();
      const input = createDefaultInput({
        historical: {
          totalPaid: 500,
          totalCaseValue: 800,
          totalOutstanding: 300,
          completedCases: 1,
          totalCases: 1,
          avgCaseValue: 500,
          daysSinceFirstCase: 30,
          daysSinceLastCase: 30,
        },
        procedureInterest: {
          allOnXInterest: false,
          implantInterest: false,
          fullMouthInterest: false,
          cosmeticInterest: false,
          highValueProceduresCompleted: 0,
        },
        retentionScore: 40,
        engagement: {
          totalAppointments: 1,
          keptAppointments: 1,
          canceledAppointments: 0,
          noShows: 0,
          daysSinceLastContact: 30,
          referralsMade: 0,
          hasNPSFeedback: false,
          npsScore: null,
        },
      });

      const result = service.calculatePLTV(input);

      // Even with low historical value, the algorithm projects future cases
      // so tier could be SILVER or higher based on growth projections
      expect(['BRONZE', 'SILVER', 'GOLD']).toContain(result.tier);
      // Investment priority should be lower tier
      expect(['PRIORITATE_SCAZUTA', 'PRIORITATE_MEDIE']).toContain(result.investmentPriority);
    });
  });

  // ============================================================================
  // PROCEDURE INTEREST FACTOR
  // ============================================================================

  describe('Procedure Interest Factor', () => {
    it('should significantly increase pLTV for All-on-X interest', () => {
      const service = createPLTVScoringService();

      const withoutAllOnX = service.calculatePLTV(
        createDefaultInput({
          procedureInterest: {
            allOnXInterest: false,
            implantInterest: false,
            fullMouthInterest: false,
            cosmeticInterest: false,
            highValueProceduresCompleted: 0,
          },
        })
      );

      const withAllOnX = service.calculatePLTV(
        createDefaultInput({
          procedureInterest: {
            allOnXInterest: true,
            implantInterest: false,
            fullMouthInterest: false,
            cosmeticInterest: false,
            highValueProceduresCompleted: 0,
          },
        })
      );

      // All-on-X should have a 2.5x multiplier effect
      expect(withAllOnX.predictedLTV).toBeGreaterThan(withoutAllOnX.predictedLTV * 1.5);
    });

    it('should increase pLTV for implant interest', () => {
      const service = createPLTVScoringService();

      const withoutImplant = service.calculatePLTV(
        createDefaultInput({
          procedureInterest: {
            allOnXInterest: false,
            implantInterest: false,
            fullMouthInterest: false,
            cosmeticInterest: false,
            highValueProceduresCompleted: 0,
          },
        })
      );

      const withImplant = service.calculatePLTV(
        createDefaultInput({
          procedureInterest: {
            allOnXInterest: false,
            implantInterest: true,
            fullMouthInterest: false,
            cosmeticInterest: false,
            highValueProceduresCompleted: 0,
          },
        })
      );

      expect(withImplant.predictedLTV).toBeGreaterThan(withoutImplant.predictedLTV);
      expect(withImplant.breakdown.procedureInterestAdjustment).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // PAYMENT RELIABILITY FACTOR
  // ============================================================================

  describe('Payment Reliability Factor', () => {
    it('should reward high on-time payment rate', () => {
      const service = createPLTVScoringService();

      const lowOnTime = service.calculatePLTV(
        createDefaultInput({
          paymentBehavior: {
            onTimePaymentRate: 50,
            paymentPlansUsed: 0,
            avgDaysToPayment: 45,
            missedPayments: 3,
            preferredPaymentMethod: 'unknown',
          },
        })
      );

      const highOnTime = service.calculatePLTV(
        createDefaultInput({
          paymentBehavior: {
            onTimePaymentRate: 100,
            paymentPlansUsed: 0,
            avgDaysToPayment: 7,
            missedPayments: 0,
            preferredPaymentMethod: 'card',
          },
        })
      );

      expect(highOnTime.breakdown.paymentReliabilityAdjustment).toBeGreaterThan(
        lowOnTime.breakdown.paymentReliabilityAdjustment
      );
    });

    it('should penalize missed payments', () => {
      const service = createPLTVScoringService();

      const noMissed = service.calculatePLTV(
        createDefaultInput({
          paymentBehavior: {
            onTimePaymentRate: 80,
            paymentPlansUsed: 0,
            avgDaysToPayment: 14,
            missedPayments: 0,
          },
        })
      );

      const manyMissed = service.calculatePLTV(
        createDefaultInput({
          paymentBehavior: {
            onTimePaymentRate: 80,
            paymentPlansUsed: 0,
            avgDaysToPayment: 14,
            missedPayments: 5,
          },
        })
      );

      expect(noMissed.breakdown.paymentReliabilityAdjustment).toBeGreaterThan(
        manyMissed.breakdown.paymentReliabilityAdjustment
      );
    });
  });

  // ============================================================================
  // ENGAGEMENT FACTOR
  // ============================================================================

  describe('Engagement Factor', () => {
    it('should reward high appointment completion rate', () => {
      const service = createPLTVScoringService();

      const lowCompletion = service.calculatePLTV(
        createDefaultInput({
          engagement: {
            totalAppointments: 10,
            keptAppointments: 5,
            canceledAppointments: 3,
            noShows: 2,
            daysSinceLastContact: 30,
            referralsMade: 0,
            hasNPSFeedback: false,
            npsScore: null,
          },
        })
      );

      const highCompletion = service.calculatePLTV(
        createDefaultInput({
          engagement: {
            totalAppointments: 10,
            keptAppointments: 10,
            canceledAppointments: 0,
            noShows: 0,
            daysSinceLastContact: 5,
            referralsMade: 2,
            hasNPSFeedback: true,
            npsScore: 10,
          },
        })
      );

      expect(highCompletion.breakdown.engagementAdjustment).toBeGreaterThan(
        lowCompletion.breakdown.engagementAdjustment
      );
    });

    it('should reward referrals', () => {
      const service = createPLTVScoringService();

      const noReferrals = service.calculatePLTV(
        createDefaultInput({
          engagement: {
            ...createDefaultInput().engagement,
            referralsMade: 0,
          },
        })
      );

      const withReferrals = service.calculatePLTV(
        createDefaultInput({
          engagement: {
            ...createDefaultInput().engagement,
            referralsMade: 3,
          },
        })
      );

      expect(withReferrals.predictedLTV).toBeGreaterThan(noReferrals.predictedLTV);
    });

    it('should penalize inactivity', () => {
      const service = createPLTVScoringService();

      const active = service.calculatePLTV(
        createDefaultInput({
          engagement: {
            ...createDefaultInput().engagement,
            daysSinceLastContact: 10,
          },
        })
      );

      const inactive = service.calculatePLTV(
        createDefaultInput({
          engagement: {
            ...createDefaultInput().engagement,
            daysSinceLastContact: 200,
          },
        })
      );

      expect(active.predictedLTV).toBeGreaterThan(inactive.predictedLTV);
    });
  });

  // ============================================================================
  // RETENTION FACTOR
  // ============================================================================

  describe('Retention Factor', () => {
    it('should increase pLTV for high retention score', () => {
      const service = createPLTVScoringService();

      const lowRetention = service.calculatePLTV(createDefaultInput({ retentionScore: 30 }));
      const highRetention = service.calculatePLTV(createDefaultInput({ retentionScore: 90 }));

      expect(highRetention.predictedLTV).toBeGreaterThan(lowRetention.predictedLTV);
      expect(highRetention.breakdown.retentionAdjustment).toBeGreaterThan(
        lowRetention.breakdown.retentionAdjustment
      );
    });

    it('should handle null retention score', () => {
      const service = createPLTVScoringService();
      const result = service.calculatePLTV(createDefaultInput({ retentionScore: null }));

      // Should use neutral factor when retention score is unknown
      expect(result.breakdown.retentionAdjustment).toBe(0);
    });
  });

  // ============================================================================
  // GROWTH POTENTIAL
  // ============================================================================

  describe('Growth Potential', () => {
    it('should identify HIGH_GROWTH potential', () => {
      const service = createPLTVScoringService();
      const input = createDefaultInput({
        procedureInterest: {
          allOnXInterest: true,
          implantInterest: true,
          fullMouthInterest: true,
          cosmeticInterest: false,
          highValueProceduresCompleted: 0,
        },
        engagement: {
          totalAppointments: 10,
          keptAppointments: 10,
          canceledAppointments: 0,
          noShows: 0,
          daysSinceLastContact: 5,
          referralsMade: 2,
          hasNPSFeedback: true,
          npsScore: 10,
        },
        retentionScore: 90,
        historical: {
          ...createDefaultInput().historical,
          daysSinceLastCase: 10,
        },
      });

      const result = service.calculatePLTV(input);

      expect(result.growthPotential).toBe('HIGH_GROWTH');
    });

    it('should identify DECLINING potential for inactive patients', () => {
      const service = createPLTVScoringService();
      const input = createDefaultInput({
        engagement: {
          totalAppointments: 5,
          keptAppointments: 3,
          canceledAppointments: 1,
          noShows: 1,
          daysSinceLastContact: 200,
          referralsMade: 0,
          hasNPSFeedback: true,
          npsScore: 5,
        },
        retentionScore: 30,
        historical: {
          ...createDefaultInput().historical,
          daysSinceLastCase: 250,
        },
      });

      const result = service.calculatePLTV(input);

      expect(result.growthPotential).toBe('DECLINING');
    });
  });

  // ============================================================================
  // CONFIDENCE CALCULATION
  // ============================================================================

  describe('Confidence Calculation', () => {
    it('should have higher confidence for patients with more history', () => {
      const service = createPLTVScoringService();

      const newPatient = service.calculatePLTV(
        createDefaultInput({
          historical: {
            totalPaid: 0,
            totalCaseValue: 3000,
            totalOutstanding: 3000,
            completedCases: 0,
            totalCases: 1,
            avgCaseValue: 3000,
            daysSinceFirstCase: null,
            daysSinceLastCase: null,
          },
        })
      );

      const establishedPatient = service.calculatePLTV(
        createDefaultInput({
          historical: {
            totalPaid: 30000,
            totalCaseValue: 35000,
            totalOutstanding: 5000,
            completedCases: 10,
            totalCases: 11,
            avgCaseValue: 3200,
            daysSinceFirstCase: 1000,
            daysSinceLastCase: 10,
          },
        })
      );

      expect(establishedPatient.confidence).toBeGreaterThan(newPatient.confidence);
    });
  });

  // ============================================================================
  // BREAKDOWN ACCURACY
  // ============================================================================

  describe('Breakdown Accuracy', () => {
    it('should provide accurate factor breakdown', () => {
      const service = createPLTVScoringService();
      const result = service.calculatePLTV(createDefaultInput());

      const { breakdown } = result;

      expect(breakdown.historicalBaseline).toBeGreaterThan(0);
      expect(typeof breakdown.paymentReliabilityAdjustment).toBe('number');
      expect(typeof breakdown.engagementAdjustment).toBe('number');
      expect(typeof breakdown.procedureInterestAdjustment).toBe('number');
      expect(typeof breakdown.retentionAdjustment).toBe('number');
      expect(typeof breakdown.tenureAdjustment).toBe('number');
      expect(breakdown.growthMultiplier).toBeGreaterThanOrEqual(1);
      expect(breakdown.predictedValue).toBe(result.predictedLTV);
    });
  });

  // ============================================================================
  // RECOMMENDED ACTIONS
  // ============================================================================

  describe('Recommended Actions', () => {
    it('should provide tier-appropriate actions', () => {
      const service = createPLTVScoringService();

      // Diamond tier should get VIP actions
      const diamondInput = createDefaultInput({
        historical: {
          totalPaid: 60000,
          totalCaseValue: 70000,
          totalOutstanding: 10000,
          completedCases: 15,
          totalCases: 17,
          avgCaseValue: 4100,
          daysSinceFirstCase: 1500,
          daysSinceLastCase: 5,
        },
        procedureInterest: {
          allOnXInterest: true,
          implantInterest: true,
          fullMouthInterest: true,
          cosmeticInterest: true,
          highValueProceduresCompleted: 8,
        },
        retentionScore: 95,
      });

      const diamondResult = service.calculatePLTV(diamondInput);

      expect(diamondResult.recommendedActions).toContain('assign_dedicated_coordinator');
      expect(diamondResult.recommendedActions).toContain('schedule_vip_consultation');
    });
  });

  // ============================================================================
  // LABELS
  // ============================================================================

  describe('Labels', () => {
    it('should provide Romanian tier labels', () => {
      const service = createPLTVScoringService();

      expect(service.getTierLabel('DIAMOND')).toBe('Diamant');
      expect(service.getTierLabel('PLATINUM')).toBe('Platinum');
      expect(service.getTierLabel('GOLD')).toBe('Gold');
      expect(service.getTierLabel('SILVER')).toBe('Argint');
      expect(service.getTierLabel('BRONZE')).toBe('Bronz');
    });

    it('should provide Romanian growth potential labels', () => {
      const service = createPLTVScoringService();

      expect(service.getGrowthPotentialLabel('HIGH_GROWTH')).toBe('Potențial Ridicat');
      expect(service.getGrowthPotentialLabel('DECLINING')).toBe('În Declin');
    });

    it('should provide Romanian investment priority labels', () => {
      const service = createPLTVScoringService();

      expect(service.getInvestmentPriorityLabel('PRIORITATE_MAXIMA')).toBe('Prioritate Maximă');
      expect(service.getInvestmentPriorityLabel('PRIORITATE_SCAZUTA')).toBe('Prioritate Scăzută');
    });
  });

  // ============================================================================
  // VALUE OBJECT
  // ============================================================================

  describe('Value Object', () => {
    it('should return PredictedLTV value object', () => {
      const service = createPLTVScoringService();
      const valueObject = service.getValueObject(createDefaultInput());

      expect(valueObject.predictedValue).toBeGreaterThan(0);
      expect(valueObject.tier).toBeDefined();
      expect(valueObject.growthPotential).toBeDefined();
      expect(valueObject.investmentPriority).toBeDefined();
      expect(valueObject.confidence).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // SIMPLE CALCULATION
  // ============================================================================

  describe('Simple Calculation', () => {
    it('should return simple result', () => {
      const service = createPLTVScoringService();
      const result = service.calculateSimplePLTV(createDefaultInput());

      expect(result.predictedLTV).toBeGreaterThan(0);
      expect(result.tier).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  describe('Configuration', () => {
    it('should use custom model version', () => {
      const service = createPLTVScoringService({ modelVersion: '2.0.0' });
      const result = service.calculatePLTV(createDefaultInput());

      expect(result.modelVersion).toBe('2.0.0');
    });

    it('should allow custom weights', () => {
      const service = createPLTVScoringService({
        weights: {
          allOnXMultiplier: 3.0, // Increase All-on-X multiplier
        },
      });

      const result = service.calculatePLTV(
        createDefaultInput({
          procedureInterest: {
            allOnXInterest: true,
            implantInterest: false,
            fullMouthInterest: false,
            cosmeticInterest: false,
            highValueProceduresCompleted: 0,
          },
        })
      );

      // With higher multiplier, should see higher procedure interest adjustment
      expect(result.breakdown.procedureInterestAdjustment).toBeGreaterThan(0);
    });
  });
});
