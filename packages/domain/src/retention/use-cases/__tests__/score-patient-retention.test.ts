/**
 * Tests for ScorePatientRetentionUseCase
 *
 * Covers:
 * - Use case execution with full dependencies
 * - Input validation
 * - Idempotency handling
 * - Repository integration
 * - CRM gateway integration
 * - Event publishing
 * - Preview/simulation mode
 * - Value object retrieval
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ScorePatientRetentionUseCase,
  type ScorePatientRetentionInput,
  type ScorePatientRetentionDependencies,
  type IPatientRetentionRepository,
  type IRetentionCrmGateway,
  type IRetentionEventPublisher,
  type IRetentionIdempotencyStore,
  type ScorePatientRetentionOutput,
  type PatientRetentionData,
} from '../score-patient-retention.js';
import type { RetentionMetricsInput } from '../../retention-scoring-service.js';

// ============================================================================
// MOCK FACTORIES
// ============================================================================

function createMockEventPublisher(): IRetentionEventPublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockPatientRepository(): IPatientRetentionRepository {
  return {
    getRetentionMetrics: vi.fn().mockResolvedValue({
      contactId: 'patient-123',
      daysInactive: 30,
      canceledAppointments: 1,
      npsScore: 8,
      lifetimeValue: 10000,
      totalTreatments: 4,
      previousRetentionScore: 75,
    } as PatientRetentionData),
    updateRetentionScore: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCrmGateway(): IRetentionCrmGateway {
  return {
    updateRetentionMetrics: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockIdempotencyStore(): IRetentionIdempotencyStore {
  return {
    exists: vi.fn().mockResolvedValue(false),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
  };
}

function createTestInput(
  overrides: Partial<ScorePatientRetentionInput> = {}
): ScorePatientRetentionInput {
  return {
    contactId: 'patient-123',
    correlationId: 'corr-456',
    metrics: {
      daysInactive: 30,
      canceledAppointments: 1,
      npsScore: 8,
      lifetimeValue: 10000,
      totalTreatments: 4,
    },
    ...overrides,
  };
}

// ============================================================================
// USE CASE TESTS
// ============================================================================

describe('ScorePatientRetentionUseCase', () => {
  let mockEventPublisher: IRetentionEventPublisher;
  let mockPatientRepository: IPatientRetentionRepository;
  let mockCrmGateway: IRetentionCrmGateway;
  let mockIdempotencyStore: IRetentionIdempotencyStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventPublisher = createMockEventPublisher();
    mockPatientRepository = createMockPatientRepository();
    mockCrmGateway = createMockCrmGateway();
    mockIdempotencyStore = createMockIdempotencyStore();
  });

  // ============================================================================
  // CONSTRUCTION
  // ============================================================================

  describe('Construction', () => {
    it('should create use case with minimal dependencies', () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      expect(useCase).toBeDefined();
    });

    it('should create use case with all dependencies', () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        patientRepository: mockPatientRepository,
        crmGateway: mockCrmGateway,
        idempotencyStore: mockIdempotencyStore,
      });

      expect(useCase).toBeDefined();
    });
  });

  // ============================================================================
  // INPUT VALIDATION
  // ============================================================================

  describe('Input Validation', () => {
    it('should reject missing contactId', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        contactId: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('Contact ID');
      }
    });

    it('should reject missing correlationId', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        correlationId: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('Correlation ID');
      }
    });

    it('should reject negative daysInactive', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        metrics: { ...createTestInput().metrics, daysInactive: -1 },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('METRICS_INVALID');
        expect(result.error.message).toContain('Days inactive');
      }
    });

    it('should reject negative canceledAppointments', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        metrics: { ...createTestInput().metrics, canceledAppointments: -5 },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('METRICS_INVALID');
        expect(result.error.message).toContain('Canceled appointments');
      }
    });

    it('should reject NPS score below 0', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        metrics: { ...createTestInput().metrics, npsScore: -1 },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('METRICS_INVALID');
        expect(result.error.message).toContain('NPS score');
      }
    });

    it('should reject NPS score above 10', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        metrics: { ...createTestInput().metrics, npsScore: 11 },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('METRICS_INVALID');
        expect(result.error.message).toContain('NPS score');
      }
    });

    it('should allow null NPS score', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        metrics: { ...createTestInput().metrics, npsScore: null },
      });

      expect(result.success).toBe(true);
    });

    it('should reject negative lifetimeValue', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        metrics: { ...createTestInput().metrics, lifetimeValue: -100 },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('METRICS_INVALID');
        expect(result.error.message).toContain('Lifetime value');
      }
    });

    it('should reject negative totalTreatments', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute({
        ...createTestInput(),
        metrics: { ...createTestInput().metrics, totalTreatments: -1 },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('METRICS_INVALID');
        expect(result.error.message).toContain('Total treatments');
      }
    });
  });

  // ============================================================================
  // SUCCESSFUL EXECUTION
  // ============================================================================

  describe('Successful Execution', () => {
    it('should calculate retention score for healthy patient', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(
        createTestInput({
          metrics: {
            daysInactive: 5,
            canceledAppointments: 0,
            npsScore: 9,
            lifetimeValue: 15000,
            totalTreatments: 5,
          },
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBeGreaterThan(80);
        expect(result.value.churnRisk).toBe('SCAZUT');
        expect(result.value.classification).toBe('LOYAL');
        expect(result.value.isHighRisk).toBe(false);
      }
    });

    it('should calculate retention score for at-risk patient', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(
        createTestInput({
          metrics: {
            daysInactive: 60,
            canceledAppointments: 2,
            npsScore: 6,
            lifetimeValue: 5000,
            totalTreatments: 2,
          },
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBeLessThan(60);
        expect(result.value.churnRisk).toBe('RIDICAT');
      }
    });

    it('should include events in output', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(createTestInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.events.length).toBeGreaterThan(0);
        expect(result.value.events[0].type).toBe('patient.retention_score_updated');
      }
    });

    it('should emit churn risk event for high-risk patients', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(
        createTestInput({
          metrics: {
            daysInactive: 120,
            canceledAppointments: 3,
            npsScore: 3,
            lifetimeValue: 20000, // High value makes it high priority
            totalTreatments: 1,
          },
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const hasChurnRiskEvent = result.value.events.some(
          (e) => e.type === 'patient.churn_risk_detected'
        );
        expect(hasChurnRiskEvent).toBe(true);
      }
    });

    it('should include patient name and phone in churn risk event', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(
        createTestInput({
          patientName: 'John Doe',
          phone: '+40700000001',
          metrics: {
            daysInactive: 100,
            canceledAppointments: 3,
            npsScore: 2,
            lifetimeValue: 25000,
            totalTreatments: 1,
          },
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const churnEvent = result.value.events.find(
          (e) => e.type === 'patient.churn_risk_detected'
        );
        if (churnEvent) {
          expect(churnEvent.payload.patientName).toBe('John Doe');
          expect(churnEvent.payload.phone).toBe('+40700000001');
        }
      }
    });

    it('should include suggested actions', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(
        createTestInput({
          metrics: {
            daysInactive: 50,
            canceledAppointments: 2,
            npsScore: 5,
            lifetimeValue: 8000,
            totalTreatments: 3,
          },
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.suggestedActions.length).toBeGreaterThan(0);
      }
    });

    it('should include reasoning', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(createTestInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.reasoning).toBeDefined();
        expect(result.value.reasoning.length).toBeGreaterThan(0);
      }
    });

    it('should include confidence score', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(createTestInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // ============================================================================
  // REPOSITORY INTEGRATION
  // ============================================================================

  describe('Repository Integration', () => {
    it('should fetch previous score from repository', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        patientRepository: mockPatientRepository,
      });

      await useCase.execute(createTestInput());

      expect(mockPatientRepository.getRetentionMetrics).toHaveBeenCalledWith('patient-123');
    });

    it('should update retention score in repository', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        patientRepository: mockPatientRepository,
      });

      await useCase.execute(createTestInput());

      expect(mockPatientRepository.updateRetentionScore).toHaveBeenCalledWith(
        'patient-123',
        expect.objectContaining({
          retentionScore: expect.any(Number),
          churnRisk: expect.any(String),
          followUpPriority: expect.any(String),
          classification: expect.any(String),
          daysInactive: 30,
        })
      );
    });

    it('should work without repository', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        // No repository
      });

      const result = await useCase.execute(createTestInput());

      expect(result.success).toBe(true);
    });

    it('should include previous score in event', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        patientRepository: mockPatientRepository,
      });

      const result = await useCase.execute(createTestInput());

      expect(result.success).toBe(true);
      if (result.success) {
        const updateEvent = result.value.events.find(
          (e) => e.type === 'patient.retention_score_updated'
        );
        expect(updateEvent?.payload.previousScore).toBe(75);
      }
    });
  });

  // ============================================================================
  // CRM GATEWAY INTEGRATION
  // ============================================================================

  describe('CRM Gateway Integration', () => {
    it('should update CRM with retention metrics', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        crmGateway: mockCrmGateway,
      });

      await useCase.execute(createTestInput());

      expect(mockCrmGateway.updateRetentionMetrics).toHaveBeenCalledWith(
        'patient-123',
        expect.objectContaining({
          retentionScore: expect.any(Number),
          churnRisk: expect.any(String),
          daysInactive: 30,
          followUpPriority: expect.any(String),
        })
      );
    });

    it('should work without CRM gateway', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        // No CRM gateway
      });

      const result = await useCase.execute(createTestInput());

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // EVENT PUBLISHING
  // ============================================================================

  describe('Event Publishing', () => {
    it('should publish retention score updated event', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      await useCase.execute(createTestInput());

      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'patient.retention_score_updated',
          aggregateId: 'patient-123',
          aggregateType: 'patient',
          correlationId: 'corr-456',
        })
      );
    });

    it('should publish churn risk event for high-risk patients', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      await useCase.execute(
        createTestInput({
          metrics: {
            daysInactive: 100,
            canceledAppointments: 3,
            npsScore: 2,
            lifetimeValue: 20000,
            totalTreatments: 1,
          },
        })
      );

      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'patient.churn_risk_detected',
        })
      );
    });
  });

  // ============================================================================
  // IDEMPOTENCY
  // ============================================================================

  describe('Idempotency', () => {
    it('should return cached result if idempotency key exists', async () => {
      const cachedOutput: ScorePatientRetentionOutput = {
        success: true,
        contactId: 'patient-123',
        score: 85,
        churnRisk: 'SCAZUT',
        followUpPriority: 'SCAZUTA',
        classification: 'STABLE',
        confidence: 0.9,
        reasoning: 'Cached result',
        suggestedActions: [],
        events: [],
        isHighRisk: false,
        requiresIntervention: false,
      };

      mockIdempotencyStore.get = vi.fn().mockResolvedValue(cachedOutput);

      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        idempotencyStore: mockIdempotencyStore,
      });

      const result = await useCase.execute(
        createTestInput({
          idempotencyKey: 'idemp-key-123',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.reasoning).toBe('Cached result');
      }
      // Should not publish events for cached result
      expect(mockEventPublisher.publish).not.toHaveBeenCalled();
    });

    it('should store result with idempotency key', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        idempotencyStore: mockIdempotencyStore,
      });

      await useCase.execute(
        createTestInput({
          idempotencyKey: 'idemp-key-456',
        })
      );

      expect(mockIdempotencyStore.set).toHaveBeenCalledWith(
        'idemp-key-456',
        expect.any(Object),
        3600
      );
    });

    it('should recalculate if forceRecalculate is true', async () => {
      const cachedOutput: ScorePatientRetentionOutput = {
        success: true,
        contactId: 'patient-123',
        score: 85,
        churnRisk: 'SCAZUT',
        followUpPriority: 'SCAZUTA',
        classification: 'STABLE',
        confidence: 0.9,
        reasoning: 'Cached result',
        suggestedActions: [],
        events: [],
        isHighRisk: false,
        requiresIntervention: false,
      };

      mockIdempotencyStore.get = vi.fn().mockResolvedValue(cachedOutput);

      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        idempotencyStore: mockIdempotencyStore,
      });

      const result = await useCase.execute(
        createTestInput({
          idempotencyKey: 'idemp-key-789',
          forceRecalculate: true,
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.reasoning).not.toBe('Cached result');
      }
      // Should publish events for new calculation
      expect(mockEventPublisher.publish).toHaveBeenCalled();
    });

    it('should work without idempotency store', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        // No idempotency store
      });

      const result = await useCase.execute(
        createTestInput({
          idempotencyKey: 'idemp-key-noop',
        })
      );

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // PREVIEW MODE
  // ============================================================================

  describe('Preview Mode', () => {
    it('should calculate score without side effects', () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
        patientRepository: mockPatientRepository,
        crmGateway: mockCrmGateway,
      });

      const metrics: RetentionMetricsInput = {
        daysInactive: 30,
        canceledAppointments: 1,
        npsScore: 8,
        lifetimeValue: 10000,
        totalTreatments: 4,
      };

      const result = useCase.executePreview(metrics);

      expect(result.score).toBeDefined();
      expect(result.churnRisk).toBeDefined();
      expect(result.classification).toBeDefined();

      // Should not call any side effects
      expect(mockPatientRepository.updateRetentionScore).not.toHaveBeenCalled();
      expect(mockCrmGateway.updateRetentionMetrics).not.toHaveBeenCalled();
      expect(mockEventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // VALUE OBJECT RETRIEVAL
  // ============================================================================

  describe('Value Object Retrieval', () => {
    it('should return RetentionScore value object', () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const metrics: RetentionMetricsInput = {
        daysInactive: 30,
        canceledAppointments: 1,
        npsScore: 8,
        lifetimeValue: 10000,
        totalTreatments: 4,
      };

      const valueObject = useCase.getValueObject(metrics);

      expect(valueObject).toBeDefined();
      expect(valueObject.numericValue).toBeDefined();
      expect(valueObject.classification).toBeDefined();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle zero values for all metrics', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(
        createTestInput({
          metrics: {
            daysInactive: 0,
            canceledAppointments: 0,
            npsScore: null,
            lifetimeValue: 0,
            totalTreatments: 0,
          },
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBe(100);
        expect(result.value.classification).toBe('LOYAL');
      }
    });

    it('should handle maximum penalty scenario', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(
        createTestInput({
          metrics: {
            daysInactive: 365,
            canceledAppointments: 10,
            npsScore: 0,
            lifetimeValue: 0,
            totalTreatments: 0,
          },
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBeLessThan(30);
        expect(result.value.classification).toBe('LOST');
        expect(result.value.churnRisk).toBe('FOARTE_RIDICAT');
      }
    });

    it('should handle optional clinic ID', async () => {
      const useCase = new ScorePatientRetentionUseCase({
        eventPublisher: mockEventPublisher,
      });

      const result = await useCase.execute(
        createTestInput({
          clinicId: 'clinic-abc',
        })
      );

      expect(result.success).toBe(true);
    });
  });
});
