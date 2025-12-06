/**
 * @fileoverview OSAX Scoring Engine Tests
 *
 * Comprehensive tests for the OSAX clinical scoring engine covering:
 * - Single case scoring
 * - Batch scoring
 * - Rescoring with updated indicators
 * - Study data extraction
 * - Event publishing
 * - Metrics collection
 * - Audit logging
 * - Error handling
 * - Different severity levels
 * - Cardiovascular risk assessment
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OsaxScoringEngine } from '../osax-scoring-engine.js';
import type {
  OsaxScoringEngineDeps,
  EventPublisher,
  MetricsCollector,
  AuditLogger,
  ScoreCaseInput,
  BatchScoreInput,
  RawStudyData,
} from '../osax-scoring-engine.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock @medicalcor/domain module
vi.mock('@medicalcor/domain', () => {
  const createMockScore = (
    severity: string,
    compositeScore: number,
    ahi: number,
    cardiovascularRisk: string
  ) => ({
    severity,
    compositeScore,
    ahi,
    confidence: 0.95,
    treatmentRecommendation: severity === 'SEVERE' ? 'CPAP_THERAPY' : 'ORAL_APPLIANCE',
    cardiovascularRisk,
    indicators: {
      ahi,
      odi: ahi * 0.8,
      spo2Nadir: 85,
      spo2Average: 94,
      sleepEfficiency: 80,
      essScore: 12,
    },
  });

  return {
    OsaxClinicalScore: vi.fn(),
    calculateScore: vi.fn((indicators, _config, patientAge) => {
      // Calculate severity based on AHI
      let severity = 'NONE';
      let cardiovascularRisk = 'LOW';

      if (indicators.ahi >= 30) {
        severity = 'SEVERE';
        cardiovascularRisk = 'HIGH';
      } else if (indicators.ahi >= 15) {
        severity = 'MODERATE';
        cardiovascularRisk = 'MODERATE';
      } else if (indicators.ahi >= 5) {
        severity = 'MILD';
        cardiovascularRisk = 'LOW';
      }

      // Very severe OSA (AHI > 50)
      if (indicators.ahi > 50) {
        cardiovascularRisk = 'CRITICAL';
      }

      // Age-based risk adjustment
      if (patientAge && patientAge > 65) {
        if (cardiovascularRisk === 'MODERATE') cardiovascularRisk = 'HIGH';
        if (cardiovascularRisk === 'LOW') cardiovascularRisk = 'MODERATE';
      }

      const compositeScore = Math.min(100, indicators.ahi * 2 + (100 - indicators.spo2Nadir));
      const clinicalScore = createMockScore(
        severity,
        compositeScore,
        indicators.ahi,
        cardiovascularRisk
      );

      return {
        clinicalScore,
        componentScores: {
          ahiComponent: indicators.ahi * 0.4,
          odiComponent: indicators.odi * 0.2,
          spo2Component: (100 - indicators.spo2Nadir) * 0.25,
          essComponent: indicators.essScore * 0.1,
          bmiComponent: (indicators.bmi || 25) * 0.05,
        },
        riskFlags: indicators.ahi > 30 ? ['HIGH_AHI', 'CARDIOVASCULAR_RISK'] : [],
        clinicalNotes: [`AHI: ${indicators.ahi}`, `Severity: ${severity}`],
        confidence: 0.95,
        scoringMethod: 'STANDARD',
      };
    }),
    determineTreatmentEligibility: vi.fn((score, indicators, hasSymptoms) => ({
      isEligible: score.severity !== 'NONE',
      eligibleTreatments: score.severity === 'SEVERE' ? ['CPAP_THERAPY'] : ['ORAL_APPLIANCE'],
      primaryRecommendation: score.treatmentRecommendation,
      insuranceCriteriaMet: {
        medicareEligible: indicators.ahi >= 15 || (indicators.ahi >= 5 && hasSymptoms),
        ahiCriteriaMet: indicators.ahi >= 5,
        symptomCriteriaMet: hasSymptoms,
      },
      reasons: ['AHI criteria met', 'Symptoms present'],
    })),
    createOsaxEventMetadata: vi.fn((correlationId, source, causationId, actor) => ({
      eventId: `event-${Date.now()}`,
      timestamp: new Date().toISOString(),
      correlationId,
      causationId,
      idempotencyKey: `idempotency-${correlationId}`,
      version: 1,
      source,
      actor,
    })),
    createOsaxCaseScoredEvent: vi.fn((caseId, payload, metadata) => ({
      type: 'osax.case.scored',
      aggregateId: caseId,
      aggregateType: 'OsaxCase',
      metadata,
      payload,
    })),
  };
});

// ============================================================================
// MOCK REPOSITORIES AND DEPENDENCIES
// ============================================================================

const createMockCaseRepository = () => {
  const mockCases = new Map();

  return {
    findById: vi.fn(async (caseId: string) => {
      const existingCase = mockCases.get(caseId);
      if (existingCase) {
        return { success: true, value: existingCase };
      }
      return { success: false, error: { message: 'Case not found' } };
    }),
    recordClinicalScore: vi.fn(
      async (caseId: string, score: any, method: string, notes: string) => {
        const existingCase = mockCases.get(caseId);
        if (!existingCase) {
          return { success: false, error: { message: 'Case not found' } };
        }

        const updatedCase = {
          ...existingCase,
          clinicalScore: score,
          scoreHistory: [
            ...existingCase.scoreHistory,
            {
              score,
              scoredAt: new Date(),
              scoredBy: method,
              notes,
            },
          ],
        };

        mockCases.set(caseId, updatedCase);
        return { success: true, value: updatedCase };
      }
    ),
    // Helper to add test cases
    _addCase: (caseId: string, caseData: any) => {
      mockCases.set(caseId, caseData);
    },
  };
};

const createMockEventPublisher = (): EventPublisher => ({
  publish: vi.fn(async () => {}),
});

const createMockMetricsCollector = (): MetricsCollector => ({
  recordScoring: vi.fn(),
  recordSeverityDistribution: vi.fn(),
});

const createMockAuditLogger = (): AuditLogger => ({
  logScoringEvent: vi.fn(async () => {}),
});

// ============================================================================
// TEST HELPERS
// ============================================================================

const createMockCase = (caseId: string, caseNumber: string, existingScore?: any) => ({
  id: caseId,
  caseNumber,
  subjectId: 'subject-123',
  patientId: 'patient-123',
  status: 'STUDY_COMPLETED',
  priority: 'NORMAL',
  clinicalScore: existingScore || null,
  scoreHistory: existingScore
    ? [
        {
          score: existingScore,
          scoredAt: new Date('2025-01-01'),
          scoredBy: 'SYSTEM',
          notes: 'Initial scoring',
        },
      ]
    : [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createValidIndicators = () => ({
  ahi: 25,
  odi: 20,
  spo2Nadir: 85,
  spo2Average: 94,
  sleepEfficiency: 80,
  essScore: 12,
  bmi: 28,
  neckCircumference: 42,
});

// ============================================================================
// TESTS
// ============================================================================

describe('OsaxScoringEngine', () => {
  let caseRepository: ReturnType<typeof createMockCaseRepository>;
  let eventPublisher: EventPublisher;
  let metricsCollector: MetricsCollector;
  let auditLogger: AuditLogger;
  let scoringEngine: OsaxScoringEngine;
  let deps: OsaxScoringEngineDeps;

  beforeEach(() => {
    vi.clearAllMocks();

    caseRepository = createMockCaseRepository();
    eventPublisher = createMockEventPublisher();
    metricsCollector = createMockMetricsCollector();
    auditLogger = createMockAuditLogger();

    deps = {
      caseRepository,
      eventPublisher,
      metricsCollector,
      auditLogger,
    };

    scoringEngine = new OsaxScoringEngine(deps);
  });

  describe('scoreCase', () => {
    it('should score a single case with valid indicators', async () => {
      // Arrange
      const caseId = 'case-001';
      const mockCase = createMockCase(caseId, 'OSA-2025-001');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: createValidIndicators(),
        correlationId: 'corr-001',
        actor: 'system',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score).toBeDefined();
      expect(result.score?.severity).toBe('MODERATE');
      expect(result.score?.compositeScore).toBeGreaterThan(0);
      expect(result.scoringResult).toBeDefined();
      expect(result.treatmentEligibility).toBeDefined();
      expect(result.updatedCase).toBeDefined();
      expect(result.event).toBeDefined();
    });

    it('should handle case not found error', async () => {
      // Arrange
      const input: ScoreCaseInput = {
        caseId: 'non-existent-case',
        indicators: createValidIndicators(),
        correlationId: 'corr-002',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Case not found');
      expect(result.score).toBeUndefined();
    });

    it('should determine treatment eligibility correctly for severe OSA', async () => {
      // Arrange
      const caseId = 'case-002';
      const mockCase = createMockCase(caseId, 'OSA-2025-002');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 35, // Severe OSA
        },
        hasSymptoms: true,
        correlationId: 'corr-003',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.severity).toBe('SEVERE');
      expect(result.treatmentEligibility?.isEligible).toBe(true);
      expect(result.treatmentEligibility?.insuranceCriteriaMet.medicareEligible).toBe(true);
    });

    it('should publish domain event when eventPublisher is provided', async () => {
      // Arrange
      const caseId = 'case-003';
      const mockCase = createMockCase(caseId, 'OSA-2025-003');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: createValidIndicators(),
        correlationId: 'corr-004',
      };

      // Act
      await scoringEngine.scoreCase(input);

      // Assert
      expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'osax.case.scored',
          aggregateId: caseId,
          aggregateType: 'OsaxCase',
        })
      );
    });

    it('should record metrics when metricsCollector is provided', async () => {
      // Arrange
      const caseId = 'case-004';
      const mockCase = createMockCase(caseId, 'OSA-2025-004');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: createValidIndicators(),
        correlationId: 'corr-005',
      };

      // Act
      await scoringEngine.scoreCase(input);

      // Assert
      expect(metricsCollector.recordScoring).toHaveBeenCalledTimes(1);
      expect(metricsCollector.recordSeverityDistribution).toHaveBeenCalledTimes(1);
      expect(metricsCollector.recordSeverityDistribution).toHaveBeenCalledWith('MODERATE');
    });

    it('should log audit entry when auditLogger is provided', async () => {
      // Arrange
      const caseId = 'case-005';
      const mockCase = createMockCase(caseId, 'OSA-2025-005');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: createValidIndicators(),
        correlationId: 'corr-006',
      };

      // Act
      await scoringEngine.scoreCase(input);

      // Assert
      expect(auditLogger.logScoringEvent).toHaveBeenCalledTimes(1);
      expect(auditLogger.logScoringEvent).toHaveBeenCalledWith(
        caseId,
        expect.objectContaining({ severity: 'MODERATE' }),
        'SYSTEM'
      );
    });

    it('should work without optional dependencies', async () => {
      // Arrange
      const minimalDeps: OsaxScoringEngineDeps = {
        caseRepository,
      };
      const minimalEngine = new OsaxScoringEngine(minimalDeps);

      const caseId = 'case-006';
      const mockCase = createMockCase(caseId, 'OSA-2025-006');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: createValidIndicators(),
        correlationId: 'corr-007',
      };

      // Act
      const result = await minimalEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score).toBeDefined();
    });

    it('should handle mild OSA (AHI 5-14)', async () => {
      // Arrange
      const caseId = 'case-007';
      const mockCase = createMockCase(caseId, 'OSA-2025-007');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 8, // Mild OSA
        },
        correlationId: 'corr-008',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.severity).toBe('MILD');
    });

    it('should handle moderate OSA (AHI 15-29)', async () => {
      // Arrange
      const caseId = 'case-008';
      const mockCase = createMockCase(caseId, 'OSA-2025-008');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 22, // Moderate OSA
        },
        correlationId: 'corr-009',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.severity).toBe('MODERATE');
    });

    it('should handle severe OSA (AHI 30-50)', async () => {
      // Arrange
      const caseId = 'case-009';
      const mockCase = createMockCase(caseId, 'OSA-2025-009');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 40, // Severe OSA
        },
        correlationId: 'corr-010',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.severity).toBe('SEVERE');
      expect(result.score?.cardiovascularRisk).toBe('HIGH');
    });

    it('should handle very severe OSA (AHI > 50) with critical cardiovascular risk', async () => {
      // Arrange
      const caseId = 'case-010';
      const mockCase = createMockCase(caseId, 'OSA-2025-010');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 65, // Very severe OSA
          spo2Nadir: 75, // Critical desaturation
        },
        correlationId: 'corr-011',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.severity).toBe('SEVERE');
      expect(result.score?.cardiovascularRisk).toBe('CRITICAL');
    });

    it('should assess cardiovascular risk correctly for elderly patients', async () => {
      // Arrange
      const caseId = 'case-011';
      const mockCase = createMockCase(caseId, 'OSA-2025-011');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 20, // Moderate OSA
        },
        patientAge: 72, // Elderly patient
        correlationId: 'corr-012',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.cardiovascularRisk).toBe('HIGH'); // Elevated due to age
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      const errorRepository = {
        findById: vi.fn(async () => ({
          success: false,
          error: { message: 'Database connection failed' },
        })),
        recordClinicalScore: vi.fn(),
      };

      const errorEngine = new OsaxScoringEngine({
        caseRepository: errorRepository as any,
      });

      const input: ScoreCaseInput = {
        caseId: 'case-012',
        indicators: createValidIndicators(),
        correlationId: 'corr-013',
      };

      // Act
      const result = await errorEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    it('should handle exceptions during scoring', async () => {
      // Arrange
      const throwingRepository = {
        findById: vi.fn(async () => {
          throw new Error('Unexpected error');
        }),
        recordClinicalScore: vi.fn(),
      };

      const throwingEngine = new OsaxScoringEngine({
        caseRepository: throwingRepository as any,
      });

      const input: ScoreCaseInput = {
        caseId: 'case-013',
        indicators: createValidIndicators(),
        correlationId: 'corr-014',
      };

      // Act
      const result = await throwingEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected error');
    });
  });

  describe('batchScore', () => {
    it('should score multiple cases successfully', async () => {
      // Arrange
      const case1 = createMockCase('case-batch-001', 'OSA-BATCH-001');
      const case2 = createMockCase('case-batch-002', 'OSA-BATCH-002');
      const case3 = createMockCase('case-batch-003', 'OSA-BATCH-003');

      caseRepository._addCase('case-batch-001', case1);
      caseRepository._addCase('case-batch-002', case2);
      caseRepository._addCase('case-batch-003', case3);

      const input: BatchScoreInput = {
        cases: [
          { caseId: 'case-batch-001', indicators: createValidIndicators() },
          { caseId: 'case-batch-002', indicators: { ...createValidIndicators(), ahi: 35 } },
          { caseId: 'case-batch-003', indicators: { ...createValidIndicators(), ahi: 10 } },
        ],
        correlationId: 'batch-corr-001',
      };

      // Act
      const result = await scoringEngine.batchScore(input);

      // Assert
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
      expect(result.results[2].success).toBe(true);
    });

    it('should handle partial failures in batch scoring', async () => {
      // Arrange
      const case1 = createMockCase('case-batch-004', 'OSA-BATCH-004');
      const case3 = createMockCase('case-batch-006', 'OSA-BATCH-006');

      caseRepository._addCase('case-batch-004', case1);
      caseRepository._addCase('case-batch-006', case3);

      const input: BatchScoreInput = {
        cases: [
          { caseId: 'case-batch-004', indicators: createValidIndicators() },
          { caseId: 'non-existent', indicators: createValidIndicators() }, // This will fail
          { caseId: 'case-batch-006', indicators: createValidIndicators() },
        ],
        correlationId: 'batch-corr-002',
      };

      // Act
      const result = await scoringEngine.batchScore(input);

      // Assert
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Case not found');
      expect(result.results[2].success).toBe(true);
    });

    it('should handle empty batch', async () => {
      // Arrange
      const input: BatchScoreInput = {
        cases: [],
        correlationId: 'batch-corr-003',
      };

      // Act
      const result = await scoringEngine.batchScore(input);

      // Assert
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should process each case with unique correlation ID', async () => {
      // Arrange
      const case1 = createMockCase('case-batch-007', 'OSA-BATCH-007');
      const case2 = createMockCase('case-batch-008', 'OSA-BATCH-008');

      caseRepository._addCase('case-batch-007', case1);
      caseRepository._addCase('case-batch-008', case2);

      const input: BatchScoreInput = {
        cases: [
          { caseId: 'case-batch-007', indicators: createValidIndicators() },
          { caseId: 'case-batch-008', indicators: createValidIndicators() },
        ],
        correlationId: 'batch-corr-004',
      };

      // Act
      await scoringEngine.batchScore(input);

      // Assert
      // Each case should get its own correlation ID
      expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
    });
  });

  describe('rescoreCase', () => {
    it('should rescore case with updated AHI indicator', async () => {
      // Arrange
      const existingScore = {
        severity: 'MILD',
        compositeScore: 40,
        ahi: 8,
        cardiovascularRisk: 'LOW',
        confidence: 0.9,
        treatmentRecommendation: 'ORAL_APPLIANCE',
        indicators: createValidIndicators(),
      };

      const caseId = 'case-rescore-001';
      const mockCase = createMockCase(caseId, 'OSA-RESCORE-001', existingScore);
      caseRepository._addCase(caseId, mockCase);

      const updatedIndicators = {
        ahi: 32, // Updated to severe
      };

      // Act
      const result = await scoringEngine.rescoreCase(
        caseId,
        updatedIndicators,
        'corr-rescore-001',
        'Patient deterioration'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.severity).toBe('SEVERE');
      expect(result.score?.ahi).toBe(32);
    });

    it('should merge partial indicator updates with existing indicators', async () => {
      // Arrange
      const existingScore = {
        severity: 'MODERATE',
        compositeScore: 60,
        ahi: 20,
        cardiovascularRisk: 'MODERATE',
        confidence: 0.9,
        treatmentRecommendation: 'ORAL_APPLIANCE',
        indicators: createValidIndicators(),
      };

      const caseId = 'case-rescore-002';
      const mockCase = createMockCase(caseId, 'OSA-RESCORE-002', existingScore);
      caseRepository._addCase(caseId, mockCase);

      const updatedIndicators = {
        spo2Nadir: 80, // Only update SpO2 nadir
        essScore: 18, // And ESS score
      };

      // Act
      const result = await scoringEngine.rescoreCase(
        caseId,
        updatedIndicators,
        'corr-rescore-002',
        'Updated oximetry data'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.score).toBeDefined();
      // Should preserve other indicators
      expect(caseRepository.recordClinicalScore).toHaveBeenCalled();
    });

    it('should return error when case not found for rescoring', async () => {
      // Arrange
      const updatedIndicators = { ahi: 30 };

      // Act
      const result = await scoringEngine.rescoreCase(
        'non-existent-case',
        updatedIndicators,
        'corr-rescore-003',
        'Test rescore'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Case not found');
    });

    it('should return error when case has no existing score', async () => {
      // Arrange
      const caseId = 'case-rescore-003';
      const mockCase = createMockCase(caseId, 'OSA-RESCORE-003'); // No existing score
      caseRepository._addCase(caseId, mockCase);

      const updatedIndicators = { ahi: 30 };

      // Act
      const result = await scoringEngine.rescoreCase(
        caseId,
        updatedIndicators,
        'corr-rescore-004',
        'Test rescore'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('No existing score to update');
    });
  });

  describe('scoreFromStudyData', () => {
    it('should extract indicators from raw study data and score', async () => {
      // Arrange
      const caseId = 'case-study-001';
      const mockCase = createMockCase(caseId, 'OSA-STUDY-001');
      caseRepository._addCase(caseId, mockCase);

      const studyData: RawStudyData = {
        ahi: 28,
        odi: 22,
        spo2Nadir: 82,
        spo2Average: 93,
        sleepEfficiency: 75,
        essScore: 14,
        bmi: 32,
        neckCircumference: 44,
        totalSleepTimeMinutes: 380,
        remAhi: 35,
        supineAhi: 42,
        patientAge: 55,
        reportedSymptoms: true,
      };

      // Act
      const result = await scoringEngine.scoreFromStudyData(caseId, studyData, 'corr-study-001');

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.severity).toBe('MODERATE');
      expect(result.score).toBeDefined();
    });

    it('should handle study data without optional fields', async () => {
      // Arrange
      const caseId = 'case-study-002';
      const mockCase = createMockCase(caseId, 'OSA-STUDY-002');
      caseRepository._addCase(caseId, mockCase);

      const studyData: RawStudyData = {
        ahi: 18,
        odi: 15,
        spo2Nadir: 86,
        spo2Average: 94,
        sleepEfficiency: 82,
        essScore: 11,
        // No optional fields
      };

      // Act
      const result = await scoringEngine.scoreFromStudyData(caseId, studyData, 'corr-study-002');

      // Assert
      expect(result.success).toBe(true);
      expect(result.score).toBeDefined();
    });

    it('should include patient age in scoring calculation', async () => {
      // Arrange
      const caseId = 'case-study-003';
      const mockCase = createMockCase(caseId, 'OSA-STUDY-003');
      caseRepository._addCase(caseId, mockCase);

      const studyData: RawStudyData = {
        ahi: 18,
        odi: 15,
        spo2Nadir: 86,
        spo2Average: 94,
        sleepEfficiency: 82,
        essScore: 11,
        patientAge: 70, // Elderly patient
      };

      // Act
      const result = await scoringEngine.scoreFromStudyData(caseId, studyData, 'corr-study-003');

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.cardiovascularRisk).toBe('HIGH'); // Elevated due to age (moderate -> high)
    });

    it('should handle reported symptoms flag', async () => {
      // Arrange
      const caseId = 'case-study-004';
      const mockCase = createMockCase(caseId, 'OSA-STUDY-004');
      caseRepository._addCase(caseId, mockCase);

      const studyData: RawStudyData = {
        ahi: 18,
        odi: 15,
        spo2Nadir: 86,
        spo2Average: 94,
        sleepEfficiency: 82,
        essScore: 11,
        reportedSymptoms: false, // No symptoms
      };

      // Act
      const result = await scoringEngine.scoreFromStudyData(caseId, studyData, 'corr-study-004');

      // Assert
      expect(result.success).toBe(true);
      expect(result.treatmentEligibility).toBeDefined();
    });
  });

  describe('getScoringSummary', () => {
    it('should return scoring summary for case with score', async () => {
      // Arrange
      const indicators = createValidIndicators(); // AHI is 25
      const existingScore = {
        severity: 'MODERATE',
        compositeScore: 60,
        ahi: indicators.ahi, // Use AHI from indicators
        cardiovascularRisk: 'MODERATE',
        confidence: 0.9,
        treatmentRecommendation: 'CPAP_THERAPY',
        indicators,
      };

      const caseId = 'case-summary-001';
      const mockCase = createMockCase(caseId, 'OSA-SUMMARY-001', existingScore);
      caseRepository._addCase(caseId, mockCase);

      // Act
      const summary = await scoringEngine.getScoringSummary(caseId);

      // Assert
      expect(summary).not.toBeNull();
      expect(summary?.hasScore).toBe(true);
      expect(summary?.currentScore).toBeDefined();
      expect(summary?.currentScore?.severity).toBe('MODERATE');
      expect(summary?.currentScore?.compositeScore).toBe(60);
      expect(summary?.currentScore?.ahi).toBe(25); // AHI from createValidIndicators()
      expect(summary?.currentScore?.cardiovascularRisk).toBe('MODERATE');
      expect(summary?.currentScore?.treatmentRecommendation).toBe('CPAP_THERAPY');
      expect(summary?.treatmentEligibility).toBeDefined();
      expect(summary?.treatmentEligibility?.isEligible).toBe(true);
      expect(summary?.scoreHistory).toBeDefined();
    });

    it('should return summary without score for unscored case', async () => {
      // Arrange
      const caseId = 'case-summary-002';
      const mockCase = createMockCase(caseId, 'OSA-SUMMARY-002'); // No score
      caseRepository._addCase(caseId, mockCase);

      // Act
      const summary = await scoringEngine.getScoringSummary(caseId);

      // Assert
      expect(summary).not.toBeNull();
      expect(summary?.hasScore).toBe(false);
      expect(summary?.currentScore).toBeUndefined();
      expect(summary?.treatmentEligibility).toBeUndefined();
      expect(summary?.scoreHistory).toEqual([]);
    });

    it('should return null for non-existent case', async () => {
      // Act
      const summary = await scoringEngine.getScoringSummary('non-existent-case');

      // Assert
      expect(summary).toBeNull();
    });

    it('should include score history in summary', async () => {
      // Arrange
      const score1 = {
        severity: 'MILD',
        compositeScore: 40,
        ahi: 8,
        cardiovascularRisk: 'LOW',
        confidence: 0.9,
        treatmentRecommendation: 'ORAL_APPLIANCE',
        indicators: createValidIndicators(),
      };

      const caseId = 'case-summary-003';
      const mockCase = {
        ...createMockCase(caseId, 'OSA-SUMMARY-003', score1),
        scoreHistory: [
          {
            score: { ...score1, ahi: 8 },
            scoredAt: new Date('2025-01-01'),
            scoredBy: 'SYSTEM',
            notes: 'Initial scoring',
          },
          {
            score: { ...score1, severity: 'MODERATE', compositeScore: 60, ahi: 20 },
            scoredAt: new Date('2025-01-15'),
            scoredBy: 'PHYSICIAN',
            notes: 'Follow-up scoring',
          },
        ],
      };
      caseRepository._addCase(caseId, mockCase);

      // Act
      const summary = await scoringEngine.getScoringSummary(caseId);

      // Assert
      expect(summary).not.toBeNull();
      expect(summary?.scoreHistory).toHaveLength(2);
      expect(summary?.scoreHistory[0].scoredBy).toBe('SYSTEM');
      expect(summary?.scoreHistory[1].scoredBy).toBe('PHYSICIAN');
    });

    it('should determine Medicare eligibility in treatment eligibility', async () => {
      // Arrange
      const existingScore = {
        severity: 'MODERATE',
        compositeScore: 60,
        ahi: 18,
        cardiovascularRisk: 'MODERATE',
        confidence: 0.9,
        treatmentRecommendation: 'CPAP_THERAPY',
        indicators: { ...createValidIndicators(), ahi: 18 },
      };

      const caseId = 'case-summary-004';
      const mockCase = createMockCase(caseId, 'OSA-SUMMARY-004', existingScore);
      caseRepository._addCase(caseId, mockCase);

      // Act
      const summary = await scoringEngine.getScoringSummary(caseId);

      // Assert
      expect(summary).not.toBeNull();
      expect(summary?.treatmentEligibility?.medicareEligible).toBe(true);
    });
  });

  describe('cardiovascular risk assessment', () => {
    it('should assess LOW risk for mild OSA without risk factors', async () => {
      // Arrange
      const caseId = 'case-cv-001';
      const mockCase = createMockCase(caseId, 'OSA-CV-001');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 7,
          spo2Nadir: 90,
        },
        patientAge: 35,
        correlationId: 'corr-cv-001',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.cardiovascularRisk).toBe('LOW');
    });

    it('should assess MODERATE risk for moderate OSA', async () => {
      // Arrange
      const caseId = 'case-cv-002';
      const mockCase = createMockCase(caseId, 'OSA-CV-002');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 22,
          spo2Nadir: 85,
        },
        correlationId: 'corr-cv-002',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.cardiovascularRisk).toBe('MODERATE');
    });

    it('should assess HIGH risk for severe OSA', async () => {
      // Arrange
      const caseId = 'case-cv-003';
      const mockCase = createMockCase(caseId, 'OSA-CV-003');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 38,
          spo2Nadir: 82,
        },
        correlationId: 'corr-cv-003',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.cardiovascularRisk).toBe('HIGH');
    });

    it('should assess CRITICAL risk for very severe OSA (AHI > 50)', async () => {
      // Arrange
      const caseId = 'case-cv-004';
      const mockCase = createMockCase(caseId, 'OSA-CV-004');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 72,
          spo2Nadir: 72,
        },
        correlationId: 'corr-cv-004',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      expect(result.score?.cardiovascularRisk).toBe('CRITICAL');
    });

    it('should elevate cardiovascular risk for elderly patients', async () => {
      // Arrange
      const caseId = 'case-cv-005';
      const mockCase = createMockCase(caseId, 'OSA-CV-005');
      caseRepository._addCase(caseId, mockCase);

      const input: ScoreCaseInput = {
        caseId,
        indicators: {
          ...createValidIndicators(),
          ahi: 8, // Mild OSA
        },
        patientAge: 75, // Elderly
        correlationId: 'corr-cv-005',
      };

      // Act
      const result = await scoringEngine.scoreCase(input);

      // Assert
      expect(result.success).toBe(true);
      // Risk should be elevated from LOW to MODERATE due to age
      expect(result.score?.cardiovascularRisk).toBe('MODERATE');
    });
  });
});
