/**
 * @fileoverview AllOnX Case Repository Tests
 *
 * Tests for the AllOnX case repository specification factory functions
 * and result types.
 */

import { describe, it, expect } from 'vitest';
import {
  pendingReviewSpec,
  urgentCasesSpec,
  byStatusSpec,
  byEligibilitySpec,
  byRiskLevelSpec,
  byClinicianSpec,
  overdueFollowUpSpec,
  byDateRangeSpec,
  readyForSurgerySpec,
  byProcedureSpec,
  byPatientSpec,
  type AllOnXCaseSpec,
  type AllOnXCaseByStatusSpec,
  type AllOnXCaseByEligibilitySpec,
  type AllOnXCaseByRiskLevelSpec,
  type AllOnXCaseByPrioritySpec,
  type AllOnXCaseNeedingReviewSpec,
  type AllOnXCaseByClinicianSpec,
  type AllOnXCaseByPatientSpec,
  type AllOnXCaseWithOverdueFollowUpSpec,
  type AllOnXCaseByProcedureSpec,
  type AllOnXCaseByDateRangeSpec,
  type AllOnXCaseReadyForSurgerySpec,
  type AllOnXCaseRepositoryError,
  type AllOnXCaseRepositoryErrorCode,
  type AllOnXCaseRepositoryResult,
  type QueryOptions,
  type TransactionContext,
  type AllOnXCaseStatistics,
} from '../AllOnXCaseRepository.js';

// ============================================================================
// SPECIFICATION FACTORY TESTS
// ============================================================================

describe('AllOnXCaseRepository Specifications', () => {
  describe('pendingReviewSpec', () => {
    it('should create specification with type NEEDING_REVIEW', () => {
      const spec = pendingReviewSpec();

      expect(spec.type).toBe('NEEDING_REVIEW');
    });

    it('should create specification without maxAgeHours when not provided', () => {
      const spec = pendingReviewSpec();

      expect(spec.maxAgeHours).toBeUndefined();
    });

    it('should create specification with provided maxAgeHours', () => {
      const spec = pendingReviewSpec(24);

      expect(spec.type).toBe('NEEDING_REVIEW');
      expect(spec.maxAgeHours).toBe(24);
    });

    it('should create specification with zero maxAgeHours', () => {
      const spec = pendingReviewSpec(0);

      expect(spec.maxAgeHours).toBe(0);
    });

    it('should create specification with large maxAgeHours', () => {
      const spec = pendingReviewSpec(168); // 1 week

      expect(spec.maxAgeHours).toBe(168);
    });
  });

  describe('urgentCasesSpec', () => {
    it('should create specification with type BY_PRIORITY', () => {
      const spec = urgentCasesSpec();

      expect(spec.type).toBe('BY_PRIORITY');
    });

    it('should create specification with URGENT priority', () => {
      const spec = urgentCasesSpec();

      expect(spec.priority).toBe('URGENT');
    });

    it('should be typed as AllOnXCaseByPrioritySpec', () => {
      const spec: AllOnXCaseByPrioritySpec = urgentCasesSpec();

      expect(spec.type).toBe('BY_PRIORITY');
      expect(spec.priority).toBe('URGENT');
    });
  });

  describe('byStatusSpec', () => {
    it('should create specification with single status', () => {
      const spec = byStatusSpec('INTAKE');

      expect(spec.type).toBe('BY_STATUS');
      expect(spec.status).toBe('INTAKE');
    });

    it('should create specification with array of statuses', () => {
      const spec = byStatusSpec(['INTAKE', 'ASSESSMENT', 'PLANNING'] as const);

      expect(spec.type).toBe('BY_STATUS');
      expect(spec.status).toEqual(['INTAKE', 'ASSESSMENT', 'PLANNING']);
    });

    it('should create specification for each status type', () => {
      const statuses = [
        'INTAKE',
        'ASSESSMENT',
        'PLANNING',
        'PRE_TREATMENT',
        'SURGICAL_PHASE',
        'HEALING',
        'PROSTHETIC_PHASE',
        'COMPLETED',
        'FOLLOW_UP',
        'ON_HOLD',
        'CANCELLED',
      ] as const;

      for (const status of statuses) {
        const spec = byStatusSpec(status);
        expect(spec.status).toBe(status);
      }
    });

    it('should create specification with empty array', () => {
      const spec = byStatusSpec([] as const);

      expect(spec.type).toBe('BY_STATUS');
      expect(spec.status).toEqual([]);
    });
  });

  describe('byEligibilitySpec', () => {
    it('should create specification with single eligibility', () => {
      const spec = byEligibilitySpec('IDEAL');

      expect(spec.type).toBe('BY_ELIGIBILITY');
      expect(spec.eligibility).toBe('IDEAL');
    });

    it('should create specification with array of eligibilities', () => {
      const spec = byEligibilitySpec(['IDEAL', 'SUITABLE'] as const);

      expect(spec.type).toBe('BY_ELIGIBILITY');
      expect(spec.eligibility).toEqual(['IDEAL', 'SUITABLE']);
    });

    it('should create specification for each eligibility type', () => {
      const eligibilities = ['IDEAL', 'SUITABLE', 'CONDITIONAL', 'CONTRAINDICATED'] as const;

      for (const eligibility of eligibilities) {
        const spec = byEligibilitySpec(eligibility);
        expect(spec.eligibility).toBe(eligibility);
      }
    });
  });

  describe('byRiskLevelSpec', () => {
    it('should create specification with single risk level', () => {
      const spec = byRiskLevelSpec('HIGH');

      expect(spec.type).toBe('BY_RISK_LEVEL');
      expect(spec.riskLevel).toBe('HIGH');
    });

    it('should create specification with array of risk levels', () => {
      const spec = byRiskLevelSpec(['HIGH', 'CRITICAL'] as const);

      expect(spec.type).toBe('BY_RISK_LEVEL');
      expect(spec.riskLevel).toEqual(['HIGH', 'CRITICAL']);
    });

    it('should create specification for each risk level', () => {
      const riskLevels = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const;

      for (const riskLevel of riskLevels) {
        const spec = byRiskLevelSpec(riskLevel);
        expect(spec.riskLevel).toBe(riskLevel);
      }
    });
  });

  describe('byClinicianSpec', () => {
    it('should create specification with clinician ID', () => {
      const spec = byClinicianSpec('clinician-123');

      expect(spec.type).toBe('BY_CLINICIAN');
      expect(spec.clinicianId).toBe('clinician-123');
    });

    it('should default includeUnassigned to false', () => {
      const spec = byClinicianSpec('clinician-123');

      expect(spec.includeUnassigned).toBe(false);
    });

    it('should set includeUnassigned when provided', () => {
      const spec = byClinicianSpec('clinician-123', true);

      expect(spec.type).toBe('BY_CLINICIAN');
      expect(spec.clinicianId).toBe('clinician-123');
      expect(spec.includeUnassigned).toBe(true);
    });

    it('should create specification with empty clinician ID', () => {
      const spec = byClinicianSpec('');

      expect(spec.clinicianId).toBe('');
    });

    it('should create specification with UUID clinician ID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const spec = byClinicianSpec(uuid);

      expect(spec.clinicianId).toBe(uuid);
    });
  });

  describe('overdueFollowUpSpec', () => {
    it('should create specification with type OVERDUE_FOLLOW_UP', () => {
      const spec = overdueFollowUpSpec();

      expect(spec.type).toBe('OVERDUE_FOLLOW_UP');
    });

    it('should create specification without maxOverdueDays when not provided', () => {
      const spec = overdueFollowUpSpec();

      expect(spec.maxOverdueDays).toBeUndefined();
    });

    it('should create specification with provided maxOverdueDays', () => {
      const spec = overdueFollowUpSpec(7);

      expect(spec.type).toBe('OVERDUE_FOLLOW_UP');
      expect(spec.maxOverdueDays).toBe(7);
    });

    it('should create specification with zero maxOverdueDays', () => {
      const spec = overdueFollowUpSpec(0);

      expect(spec.maxOverdueDays).toBe(0);
    });
  });

  describe('byDateRangeSpec', () => {
    it('should create specification for createdAt field', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      const spec = byDateRangeSpec('createdAt', startDate, endDate);

      expect(spec.type).toBe('BY_DATE_RANGE');
      expect(spec.field).toBe('createdAt');
      expect(spec.startDate).toBe(startDate);
      expect(spec.endDate).toBe(endDate);
    });

    it('should create specification for surgeryScheduledFor field', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      const spec = byDateRangeSpec('surgeryScheduledFor', startDate, endDate);

      expect(spec.field).toBe('surgeryScheduledFor');
    });

    it('should create specification for surgeryCompletedAt field', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      const spec = byDateRangeSpec('surgeryCompletedAt', startDate, endDate);

      expect(spec.field).toBe('surgeryCompletedAt');
    });

    it('should create specification for prosthesisDeliveredAt field', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      const spec = byDateRangeSpec('prosthesisDeliveredAt', startDate, endDate);

      expect(spec.field).toBe('prosthesisDeliveredAt');
    });

    it('should handle same start and end dates', () => {
      const date = new Date('2025-06-15');

      const spec = byDateRangeSpec('createdAt', date, date);

      expect(spec.startDate).toBe(date);
      expect(spec.endDate).toBe(date);
    });
  });

  describe('readyForSurgerySpec', () => {
    it('should create specification with type READY_FOR_SURGERY', () => {
      const spec = readyForSurgerySpec();

      expect(spec.type).toBe('READY_FOR_SURGERY');
    });

    it('should be typed as AllOnXCaseReadyForSurgerySpec', () => {
      const spec: AllOnXCaseReadyForSurgerySpec = readyForSurgerySpec();

      expect(spec.type).toBe('READY_FOR_SURGERY');
    });
  });

  describe('byProcedureSpec', () => {
    it('should create specification for ALL_ON_4', () => {
      const spec = byProcedureSpec('ALL_ON_4');

      expect(spec.type).toBe('BY_PROCEDURE');
      expect(spec.procedure).toBe('ALL_ON_4');
    });

    it('should create specification for ALL_ON_6', () => {
      const spec = byProcedureSpec('ALL_ON_6');

      expect(spec.type).toBe('BY_PROCEDURE');
      expect(spec.procedure).toBe('ALL_ON_6');
    });

    it('should create specification for ALL_ON_X_HYBRID', () => {
      const spec = byProcedureSpec('ALL_ON_X_HYBRID');

      expect(spec.type).toBe('BY_PROCEDURE');
      expect(spec.procedure).toBe('ALL_ON_X_HYBRID');
    });
  });

  describe('byPatientSpec', () => {
    it('should create specification with patient ID', () => {
      const spec = byPatientSpec('patient-123');

      expect(spec.type).toBe('BY_PATIENT');
      expect(spec.patientId).toBe('patient-123');
    });

    it('should create specification with UUID patient ID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const spec = byPatientSpec(uuid);

      expect(spec.patientId).toBe(uuid);
    });

    it('should create specification with empty patient ID', () => {
      const spec = byPatientSpec('');

      expect(spec.patientId).toBe('');
    });
  });
});

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('AllOnXCaseRepository Types', () => {
  describe('AllOnXCaseRepositoryErrorCode', () => {
    it('should include all expected error codes', () => {
      const errorCodes: AllOnXCaseRepositoryErrorCode[] = [
        'NOT_FOUND',
        'DUPLICATE',
        'VALIDATION_ERROR',
        'CONCURRENCY_CONFLICT',
        'CONNECTION_ERROR',
        'TIMEOUT',
        'UNKNOWN',
      ];

      expect(errorCodes).toHaveLength(7);
    });
  });

  describe('AllOnXCaseRepositoryError', () => {
    it('should have correct structure', () => {
      const error: AllOnXCaseRepositoryError = {
        code: 'NOT_FOUND',
        message: 'Case not found',
      };

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Case not found');
    });

    it('should support optional details', () => {
      const error: AllOnXCaseRepositoryError = {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'patientId', reason: 'required' },
      };

      expect(error.details).toEqual({ field: 'patientId', reason: 'required' });
    });
  });

  describe('AllOnXCaseRepositoryResult', () => {
    it('should represent successful result', () => {
      const successResult: AllOnXCaseRepositoryResult<string> = {
        success: true,
        value: 'test-value',
      };

      expect(successResult.success).toBe(true);
      if (successResult.success) {
        expect(successResult.value).toBe('test-value');
      }
    });

    it('should represent failure result', () => {
      const failureResult: AllOnXCaseRepositoryResult<string> = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Case not found',
        },
      };

      expect(failureResult.success).toBe(false);
      if (!failureResult.success) {
        expect(failureResult.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('QueryOptions', () => {
    it('should support all query options', () => {
      const options: QueryOptions = {
        limit: 10,
        offset: 0,
        orderBy: 'createdAt',
        orderDirection: 'desc',
      };

      expect(options.limit).toBe(10);
      expect(options.offset).toBe(0);
      expect(options.orderBy).toBe('createdAt');
      expect(options.orderDirection).toBe('desc');
    });

    it('should support partial query options', () => {
      const options: QueryOptions = {
        limit: 20,
      };

      expect(options.limit).toBe(20);
      expect(options.offset).toBeUndefined();
    });

    it('should support all orderBy options', () => {
      const orderByOptions: QueryOptions['orderBy'][] = [
        'createdAt',
        'updatedAt',
        'priority',
        'surgeryScheduledFor',
      ];

      expect(orderByOptions).toHaveLength(4);
    });
  });

  describe('TransactionContext', () => {
    it('should have transactionId', () => {
      const ctx: TransactionContext = {
        transactionId: 'tx-123',
      };

      expect(ctx.transactionId).toBe('tx-123');
    });
  });

  describe('AllOnXCaseStatistics', () => {
    it('should have correct structure', () => {
      const stats: Partial<AllOnXCaseStatistics> = {
        totalCases: 100,
        casesCompletedThisMonth: 5,
        casesInProgress: 25,
        overdueFollowUps: 3,
        averageTreatmentDurationDays: 120,
      };

      expect(stats.totalCases).toBe(100);
      expect(stats.casesCompletedThisMonth).toBe(5);
      expect(stats.casesInProgress).toBe(25);
    });
  });
});

// ============================================================================
// SPECIFICATION UNION TYPE TESTS
// ============================================================================

describe('AllOnXCaseSpec Union Type', () => {
  it('should accept BY_STATUS specification', () => {
    const spec: AllOnXCaseSpec = byStatusSpec('INTAKE');
    expect(spec.type).toBe('BY_STATUS');
  });

  it('should accept BY_ELIGIBILITY specification', () => {
    const spec: AllOnXCaseSpec = byEligibilitySpec('IDEAL');
    expect(spec.type).toBe('BY_ELIGIBILITY');
  });

  it('should accept BY_RISK_LEVEL specification', () => {
    const spec: AllOnXCaseSpec = byRiskLevelSpec('HIGH');
    expect(spec.type).toBe('BY_RISK_LEVEL');
  });

  it('should accept BY_PRIORITY specification', () => {
    const spec: AllOnXCaseSpec = urgentCasesSpec();
    expect(spec.type).toBe('BY_PRIORITY');
  });

  it('should accept NEEDING_REVIEW specification', () => {
    const spec: AllOnXCaseSpec = pendingReviewSpec();
    expect(spec.type).toBe('NEEDING_REVIEW');
  });

  it('should accept BY_CLINICIAN specification', () => {
    const spec: AllOnXCaseSpec = byClinicianSpec('clinician-123');
    expect(spec.type).toBe('BY_CLINICIAN');
  });

  it('should accept BY_PATIENT specification', () => {
    const spec: AllOnXCaseSpec = byPatientSpec('patient-123');
    expect(spec.type).toBe('BY_PATIENT');
  });

  it('should accept OVERDUE_FOLLOW_UP specification', () => {
    const spec: AllOnXCaseSpec = overdueFollowUpSpec();
    expect(spec.type).toBe('OVERDUE_FOLLOW_UP');
  });

  it('should accept BY_PROCEDURE specification', () => {
    const spec: AllOnXCaseSpec = byProcedureSpec('ALL_ON_4');
    expect(spec.type).toBe('BY_PROCEDURE');
  });

  it('should accept BY_DATE_RANGE specification', () => {
    const spec: AllOnXCaseSpec = byDateRangeSpec('createdAt', new Date(), new Date());
    expect(spec.type).toBe('BY_DATE_RANGE');
  });

  it('should accept READY_FOR_SURGERY specification', () => {
    const spec: AllOnXCaseSpec = readyForSurgerySpec();
    expect(spec.type).toBe('READY_FOR_SURGERY');
  });

  it('should allow type narrowing via switch', () => {
    const specs: AllOnXCaseSpec[] = [
      byStatusSpec('INTAKE'),
      byEligibilitySpec('IDEAL'),
      byRiskLevelSpec('HIGH'),
      urgentCasesSpec(),
      pendingReviewSpec(),
      byClinicianSpec('clinician-123'),
      byPatientSpec('patient-123'),
      overdueFollowUpSpec(),
      byProcedureSpec('ALL_ON_4'),
      byDateRangeSpec('createdAt', new Date(), new Date()),
      readyForSurgerySpec(),
    ];

    for (const spec of specs) {
      switch (spec.type) {
        case 'BY_STATUS':
          expect(spec.status).toBeDefined();
          break;
        case 'BY_ELIGIBILITY':
          expect(spec.eligibility).toBeDefined();
          break;
        case 'BY_RISK_LEVEL':
          expect(spec.riskLevel).toBeDefined();
          break;
        case 'BY_PRIORITY':
          expect(spec.priority).toBeDefined();
          break;
        case 'NEEDING_REVIEW':
          // maxAgeHours is optional
          break;
        case 'BY_CLINICIAN':
          expect(spec.clinicianId).toBeDefined();
          break;
        case 'BY_PATIENT':
          expect(spec.patientId).toBeDefined();
          break;
        case 'OVERDUE_FOLLOW_UP':
          // maxOverdueDays is optional
          break;
        case 'BY_PROCEDURE':
          expect(spec.procedure).toBeDefined();
          break;
        case 'BY_DATE_RANGE':
          expect(spec.field).toBeDefined();
          expect(spec.startDate).toBeDefined();
          expect(spec.endDate).toBeDefined();
          break;
        case 'READY_FOR_SURGERY':
          // No additional properties
          break;
      }
    }
  });
});
