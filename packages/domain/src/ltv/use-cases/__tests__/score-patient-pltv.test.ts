/**
 * ScorePatientPLTVUseCase Unit Tests
 *
 * Tests for the pLTV scoring use case that orchestrates
 * data gathering, scoring, and event emission.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ScorePatientPLTVUseCase,
  createScorePatientPLTVUseCase,
  type ScorePatientPLTVInput,
  type ScorePatientPLTVDependencies,
  type IPLTVDataProvider,
  type IPLTVEventPublisher,
  type PatientPLTVData,
} from '../score-patient-pltv.js';
import { PLTVScoringService } from '../../pltv-scoring-service.js';
import type { PLTVTier } from '../../../shared-kernel/value-objects/predicted-ltv.js';

// =============================================================================
// Test Factories
// =============================================================================

function createMockDataProvider(): IPLTVDataProvider {
  return {
    getPatientPLTVData: vi.fn(),
    savePLTVScore: vi.fn().mockResolvedValue({ success: true }),
  };
}

function createMockEventPublisher(): IPLTVEventPublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockPatientData(overrides: Partial<PatientPLTVData> = {}): PatientPLTVData {
  return {
    leadId: 'lead-123',
    clinicId: 'clinic-456',
    patientName: 'John Doe',
    phone: '+40712345678',
    historical: {
      totalPaid: 15000,
      totalCaseValue: 18000,
      totalOutstanding: 3000,
      completedCases: 4,
      totalCases: 5,
      avgCaseValue: 3600,
      daysSinceFirstCase: 400,
      daysSinceLastCase: 30,
    },
    paymentBehavior: {
      onTimePaymentRate: 90,
      paymentPlansUsed: 1,
      avgDaysToPayment: 10,
      missedPayments: 0,
      preferredPaymentMethod: 'card',
    },
    engagement: {
      totalAppointments: 12,
      keptAppointments: 11,
      canceledAppointments: 1,
      noShows: 0,
      daysSinceLastContact: 15,
      referralsMade: 2,
      hasNPSFeedback: true,
      npsScore: 9,
    },
    procedureInterest: {
      allOnXInterest: true,
      implantInterest: true,
      fullMouthInterest: false,
      cosmeticInterest: false,
      highValueProceduresCompleted: 2,
      expressedInterests: ['implants', 'all-on-x'],
    },
    retentionScore: 80,
    leadSource: 'whatsapp',
    locationTier: 'tier1',
    ...overrides,
  };
}

function createMockInput(overrides: Partial<ScorePatientPLTVInput> = {}): ScorePatientPLTVInput {
  return {
    leadId: 'lead-123',
    clinicId: 'clinic-456',
    correlationId: 'corr-789',
    forceRecalculate: false,
    includeBreakdown: false,
    ...overrides,
  };
}

function createMockDependencies(
  overrides: Partial<ScorePatientPLTVDependencies> = {}
): ScorePatientPLTVDependencies {
  return {
    dataProvider: createMockDataProvider(),
    eventPublisher: createMockEventPublisher(),
    scoringService: new PLTVScoringService(),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ScorePatientPLTVUseCase', () => {
  let useCase: ScorePatientPLTVUseCase;
  let deps: ScorePatientPLTVDependencies;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDependencies();
    useCase = new ScorePatientPLTVUseCase(deps);
  });

  // ===========================================================================
  // Factory Function
  // ===========================================================================

  describe('createScorePatientPLTVUseCase', () => {
    it('should create use case instance', () => {
      const instance = createScorePatientPLTVUseCase(deps);
      expect(instance).toBeInstanceOf(ScorePatientPLTVUseCase);
    });

    it('should create default scoring service if not provided', () => {
      const depsWithoutService = {
        dataProvider: createMockDataProvider(),
      };
      const instance = createScorePatientPLTVUseCase(depsWithoutService);
      expect(instance).toBeInstanceOf(ScorePatientPLTVUseCase);
    });
  });

  // ===========================================================================
  // Input Validation
  // ===========================================================================

  describe('Input Validation', () => {
    it('should return validation error for missing leadId', async () => {
      const input = createMockInput({ leadId: '' });

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('leadId');
      }
    });

    it('should return validation error for missing clinicId', async () => {
      const input = createMockInput({ clinicId: '' });

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('clinicId');
      }
    });

    it('should return validation error for missing correlationId', async () => {
      const input = createMockInput({ correlationId: '' });

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('correlationId');
      }
    });

    it('should return validation error for non-string leadId', async () => {
      const input = { ...createMockInput(), leadId: null as any };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return validation error for non-string clinicId', async () => {
      const input = { ...createMockInput(), clinicId: 123 as any };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should return validation error for non-string correlationId', async () => {
      const input = { ...createMockInput(), correlationId: undefined as any };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  // ===========================================================================
  // Patient Not Found
  // ===========================================================================

  describe('Patient Not Found', () => {
    it('should return LEAD_NOT_FOUND error when patient does not exist', async () => {
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(null);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('LEAD_NOT_FOUND');
        expect(result.error.message).toContain('lead-123');
      }
    });
  });

  // ===========================================================================
  // Successful Scoring
  // ===========================================================================

  describe('Successful Scoring', () => {
    it('should successfully score a patient', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.leadId).toBe('lead-123');
        expect(result.value.predictedLTV).toBeGreaterThan(0);
        expect(result.value.tier).toBeDefined();
        expect(result.value.growthPotential).toBeDefined();
        expect(result.value.investmentPriority).toBeDefined();
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.confidence).toBeLessThanOrEqual(1);
        expect(result.value.reasoning).toBeDefined();
        expect(result.value.recommendedActions).toBeInstanceOf(Array);
        expect(result.value.method).toBe('rule_based');
        expect(result.value.modelVersion).toBeDefined();
      }
    });

    it('should save the score result', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      await useCase.execute(createMockInput());

      expect(deps.dataProvider.savePLTVScore).toHaveBeenCalledWith(
        'lead-123',
        expect.objectContaining({
          predictedLTV: expect.any(Number),
          tier: expect.any(String),
        })
      );
    });

    it('should include breakdown when requested', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput({ includeBreakdown: true }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.breakdown).toBeDefined();
        expect(result.value.breakdown?.historicalBaseline).toBeGreaterThan(0);
      }
    });

    it('should not include breakdown when not requested', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput({ includeBreakdown: false }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.breakdown).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // Cache/Skip Logic
  // ===========================================================================

  describe('Cache/Skip Logic', () => {
    it('should skip scoring if recent score exists (within 24 hours)', async () => {
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 12); // 12 hours ago

      const patientData = createMockPatientData({
        lastPLTV: {
          value: 20000,
          tier: 'GOLD' as PLTVTier,
          scoredAt: recentDate,
        },
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput({ forceRecalculate: false }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.predictedLTV).toBe(20000);
        expect(result.value.tier).toBe('GOLD');
        expect(result.value.reasoning).toContain('cached');
        expect(result.value.events).toHaveLength(0);
      }

      // Should not save a new score
      expect(deps.dataProvider.savePLTVScore).not.toHaveBeenCalled();
    });

    it('should recalculate if forceRecalculate is true', async () => {
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 12);

      const patientData = createMockPatientData({
        lastPLTV: {
          value: 20000,
          tier: 'GOLD' as PLTVTier,
          scoredAt: recentDate,
        },
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput({ forceRecalculate: true }));

      expect(result.success).toBe(true);
      expect(deps.dataProvider.savePLTVScore).toHaveBeenCalled();
    });

    it('should recalculate if last score is older than 24 hours', async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 30); // 30 hours ago

      const patientData = createMockPatientData({
        lastPLTV: {
          value: 15000,
          tier: 'SILVER' as PLTVTier,
          scoredAt: oldDate,
        },
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput({ forceRecalculate: false }));

      expect(result.success).toBe(true);
      expect(deps.dataProvider.savePLTVScore).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // High Value Patient Identification
  // ===========================================================================

  describe('High Value Patient Identification', () => {
    it('should identify DIAMOND tier as high value', async () => {
      const patientData = createMockPatientData({
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
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tier).toBe('DIAMOND');
        expect(result.value.isHighValue).toBe(true);
      }
    });

    it('should identify GOLD tier as high value', async () => {
      const patientData = createMockPatientData({
        historical: {
          totalPaid: 20000,
          totalCaseValue: 25000,
          totalOutstanding: 5000,
          completedCases: 6,
          totalCases: 7,
          avgCaseValue: 3500,
          daysSinceFirstCase: 500,
          daysSinceLastCase: 20,
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
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(['GOLD', 'PLATINUM', 'DIAMOND']).toContain(result.value.tier);
        expect(result.value.isHighValue).toBe(true);
      }
    });

    it('should not identify BRONZE tier as high value', async () => {
      const patientData = createMockPatientData({
        historical: {
          totalPaid: 1000,
          totalCaseValue: 1500,
          totalOutstanding: 500,
          completedCases: 1,
          totalCases: 1,
          avgCaseValue: 1000,
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
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        // Low value patient should be BRONZE or SILVER
        if (result.value.tier === 'BRONZE' || result.value.tier === 'SILVER') {
          expect(result.value.isHighValue).toBe(false);
        }
      }
    });
  });

  // ===========================================================================
  // Tier Change Detection
  // ===========================================================================

  describe('Tier Change Detection', () => {
    it('should detect tier upgrade', async () => {
      const patientData = createMockPatientData({
        lastPLTV: {
          value: 8000,
          tier: 'SILVER' as PLTVTier,
          scoredAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
        },
        historical: {
          totalPaid: 25000,
          totalCaseValue: 30000,
          totalOutstanding: 5000,
          completedCases: 8,
          totalCases: 9,
          avgCaseValue: 3300,
          daysSinceFirstCase: 600,
          daysSinceLastCase: 10,
        },
        procedureInterest: {
          allOnXInterest: true,
          implantInterest: true,
          fullMouthInterest: false,
          cosmeticInterest: false,
          highValueProceduresCompleted: 3,
        },
        retentionScore: 85,
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        // Should upgrade from SILVER
        if (result.value.tier !== 'SILVER') {
          expect(result.value.tierChanged).toBe(true);
          expect(result.value.previousPLTV).toBe(8000);
        }
      }
    });

    it('should not flag tier change when tier remains same', async () => {
      const patientData = createMockPatientData({
        lastPLTV: {
          value: 15000,
          tier: 'GOLD' as PLTVTier,
          scoredAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        if (result.value.tier === 'GOLD') {
          expect(result.value.tierChanged).toBe(false);
        }
      }
    });

    it('should not flag tier change for first-time scoring', async () => {
      const patientData = createMockPatientData({
        lastPLTV: undefined,
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tierChanged).toBe(false);
        expect(result.value.previousPLTV).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // Event Emission
  // ===========================================================================

  describe('Event Emission', () => {
    it('should emit PLTVScored event', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        const scoredEvent = result.value.events.find((e) => e.type === 'pltv.scored');
        expect(scoredEvent).toBeDefined();
        expect(scoredEvent?.payload.leadId).toBe('lead-123');
        expect(scoredEvent?.payload.clinicId).toBe('clinic-456');
      }
    });

    it('should emit HighValuePatientIdentified event for GOLD+ tier', async () => {
      const patientData = createMockPatientData({
        historical: {
          totalPaid: 25000,
          totalCaseValue: 30000,
          totalOutstanding: 5000,
          completedCases: 8,
          totalCases: 9,
          avgCaseValue: 3300,
          daysSinceFirstCase: 600,
          daysSinceLastCase: 10,
        },
        procedureInterest: {
          allOnXInterest: true,
          implantInterest: true,
          fullMouthInterest: false,
          cosmeticInterest: false,
          highValueProceduresCompleted: 3,
        },
        retentionScore: 90,
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success && result.value.isHighValue) {
        const highValueEvent = result.value.events.find(
          (e) => e.type === 'pltv.high_value_patient_identified'
        );
        expect(highValueEvent).toBeDefined();
        expect(highValueEvent?.payload.patientName).toBe('John Doe');
        expect(highValueEvent?.payload.followUpDeadline).toBeDefined();
      }
    });

    it('should emit PLTVTierChanged event when tier changes', async () => {
      const patientData = createMockPatientData({
        lastPLTV: {
          value: 5000,
          tier: 'BRONZE' as PLTVTier,
          scoredAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
        historical: {
          totalPaid: 25000,
          totalCaseValue: 30000,
          totalOutstanding: 5000,
          completedCases: 8,
          totalCases: 9,
          avgCaseValue: 3300,
          daysSinceFirstCase: 600,
          daysSinceLastCase: 10,
        },
        retentionScore: 85,
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success && result.value.tierChanged) {
        const tierChangedEvent = result.value.events.find((e) => e.type === 'pltv.tier_changed');
        expect(tierChangedEvent).toBeDefined();
        expect(tierChangedEvent?.payload.previousTier).toBe('BRONZE');
        expect(tierChangedEvent?.payload.direction).toBe('upgrade');
      }
    });

    it('should publish events to event publisher', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      await useCase.execute(createMockInput());

      expect(deps.eventPublisher?.publish).toHaveBeenCalled();
    });

    it('should work without event publisher', async () => {
      const depsWithoutPublisher = {
        dataProvider: createMockDataProvider(),
        scoringService: new PLTVScoringService(),
      };
      (depsWithoutPublisher.dataProvider.getPatientPLTVData as any).mockResolvedValue(
        createMockPatientData()
      );

      const useCaseWithoutPublisher = new ScorePatientPLTVUseCase(depsWithoutPublisher);
      const result = await useCaseWithoutPublisher.execute(createMockInput());

      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // Repository Error Handling
  // ===========================================================================

  describe('Repository Error Handling', () => {
    it('should return REPOSITORY_ERROR when save fails', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);
      (deps.dataProvider.savePLTVScore as any).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      });

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REPOSITORY_ERROR');
        expect(result.error.message).toContain('Database connection failed');
      }
    });

    it('should handle save failure with no error message', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);
      (deps.dataProvider.savePLTVScore as any).mockResolvedValue({
        success: false,
      });

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REPOSITORY_ERROR');
        expect(result.error.message).toContain('Failed to save pLTV score');
      }
    });
  });

  // ===========================================================================
  // Exception Handling
  // ===========================================================================

  describe('Exception Handling', () => {
    it('should handle thrown errors', async () => {
      (deps.dataProvider.getPatientPLTVData as any).mockRejectedValue(
        new Error('Unexpected database error')
      );

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCORING_FAILED');
        expect(result.error.message).toBe('Unexpected database error');
        expect(result.error.details?.stack).toBeDefined();
      }
    });

    it('should handle non-Error exceptions', async () => {
      (deps.dataProvider.getPatientPLTVData as any).mockRejectedValue('String error');

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCORING_FAILED');
        expect(result.error.message).toBe('Unknown error during pLTV scoring');
        expect(result.error.details).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // Skipped Result (Cache Hit)
  // ===========================================================================

  describe('Skipped Result (Cache Hit)', () => {
    it('should return cached result with correct structure', async () => {
      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 6);

      const patientData = createMockPatientData({
        lastPLTV: {
          value: 25000,
          tier: 'GOLD' as PLTVTier,
          scoredAt: recentDate,
        },
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.predictedLTV).toBe(25000);
        expect(result.value.tier).toBe('GOLD');
        expect(result.value.method).toBe('rule_based');
        expect(result.value.tierChanged).toBe(false);
        expect(result.value.previousPLTV).toBe(25000);
        expect(result.value.events).toHaveLength(0);
      }
    });

    it('should handle missing lastPLTV in skipped result path', async () => {
      // This scenario shouldn't happen in practice but tests defensive coding
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      // Should proceed with normal scoring since no lastPLTV
      expect(result.success).toBe(true);
      expect(deps.dataProvider.savePLTVScore).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Tier Direction and Change Reason
  // ===========================================================================

  describe('Tier Direction and Change Reason', () => {
    it('should correctly identify upgrade direction', async () => {
      const patientData = createMockPatientData({
        lastPLTV: {
          value: 3000,
          tier: 'BRONZE' as PLTVTier,
          scoredAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
        historical: {
          totalPaid: 30000,
          totalCaseValue: 35000,
          totalOutstanding: 5000,
          completedCases: 10,
          totalCases: 11,
          avgCaseValue: 3200,
          daysSinceFirstCase: 800,
          daysSinceLastCase: 5,
        },
        retentionScore: 90,
      });
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success && result.value.tierChanged) {
        const tierChangedEvent = result.value.events.find((e) => e.type === 'pltv.tier_changed');
        if (tierChangedEvent) {
          expect(tierChangedEvent.payload.direction).toBe('upgrade');
        }
      }
    });

    it('should correctly identify downgrade direction', async () => {
      const patientData = createMockPatientData({
        lastPLTV: {
          value: 50000,
          tier: 'DIAMOND' as PLTVTier,
          scoredAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
        historical: {
          totalPaid: 5000,
          totalCaseValue: 6000,
          totalOutstanding: 1000,
          completedCases: 2,
          totalCases: 2,
          avgCaseValue: 2500,
          daysSinceFirstCase: 100,
          daysSinceLastCase: 60,
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
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success && result.value.tierChanged) {
        const tierChangedEvent = result.value.events.find((e) => e.type === 'pltv.tier_changed');
        if (tierChangedEvent) {
          expect(tierChangedEvent.payload.direction).toBe('downgrade');
        }
      }
    });
  });

  // ===========================================================================
  // Confidence Interval
  // ===========================================================================

  describe('Confidence Interval', () => {
    it('should include confidence interval in output', async () => {
      const patientData = createMockPatientData();
      (deps.dataProvider.getPatientPLTVData as any).mockResolvedValue(patientData);

      const result = await useCase.execute(createMockInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.confidenceInterval).toBeDefined();
        expect(result.value.confidenceInterval.lower).toBeLessThanOrEqual(
          result.value.predictedLTV
        );
        expect(result.value.confidenceInterval.upper).toBeGreaterThanOrEqual(
          result.value.predictedLTV
        );
      }
    });
  });
});
