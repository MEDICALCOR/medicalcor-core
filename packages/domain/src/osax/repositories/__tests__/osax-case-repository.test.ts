/**
 * @fileoverview OSAX Case Repository Tests
 *
 * Tests for the OSAX case repository specification factory functions
 * and result types.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  pendingReviewSpec,
  urgentCasesSpec,
  byStatusSpec,
  bySeveritySpec,
  bySpecialistSpec,
  overdueFollowUpSpec,
  byDateRangeSpec,
  activeTreatmentSpec,
  type OsaxCaseSpec,
  type OsaxCaseByStatusSpec,
  type OsaxCaseBySeveritySpec,
  type OsaxCaseNeedingReviewSpec,
  type OsaxCaseBySpecialistSpec,
  type OsaxCaseByPrioritySpec,
  type OsaxCaseWithOverdueFollowUpSpec,
  type OsaxCaseByTreatmentSpec,
  type OsaxCaseByDateRangeSpec,
  type OsaxCaseRepositoryError,
  type OsaxCaseRepositoryErrorCode,
  type OsaxCaseRepositoryResult,
  type QueryOptions,
  type TransactionContext,
  type OsaxCaseStatistics,
} from '../OsaxCaseRepository.js';
import type { OsaxCase, OsaxFollowUpRecord } from '../../entities/OsaxCase.js';
import { OsaxSubjectId } from '../../value-objects/OsaxSubjectId.js';
import { OsaxClinicalScore } from '../../value-objects/OsaxClinicalScore.js';

// ============================================================================
// HELPERS
// ============================================================================

function createTestIndicators() {
  return {
    ahi: 15,
    odi: 12,
    spo2Nadir: 85,
    spo2Average: 94,
    sleepEfficiency: 85,
    essScore: 10,
  };
}

function createTestCase(overrides: Partial<OsaxCase> = {}): OsaxCase {
  const now = new Date();
  return {
    id: 'case-123',
    subjectId: OsaxSubjectId.generate(1, 2025),
    patientId: 'patient-456',
    caseNumber: 'OSA-2025-00001',
    status: 'PENDING_STUDY',
    createdAt: now,
    updatedAt: now,
    priority: 'NORMAL',
    tags: [],
    scoreHistory: [],
    physicianReviews: [],
    reviewStatus: 'PENDING',
    treatmentHistory: [],
    followUps: [],
    version: 1,
    consentStatus: 'PENDING',
    isDeleted: false,
    ...overrides,
  };
}

// ============================================================================
// SPECIFICATION FACTORY TESTS
// ============================================================================

describe('OsaxCaseRepository Specifications', () => {
  describe('pendingReviewSpec', () => {
    it('should create specification with type NEEDING_REVIEW', () => {
      const spec = pendingReviewSpec();

      expect(spec.type).toBe('NEEDING_REVIEW');
    });

    it('should default to 24 hours maxAgeHours', () => {
      const spec = pendingReviewSpec();

      expect(spec.maxAgeHours).toBe(24);
    });

    it('should accept custom maxAgeHours', () => {
      const spec = pendingReviewSpec(48);

      expect(spec.maxAgeHours).toBe(48);
    });

    it('should have isSatisfiedBy function', () => {
      const spec = pendingReviewSpec(24);

      expect(typeof spec.isSatisfiedBy).toBe('function');
    });

    it('should return false for non-SCORED cases', () => {
      const spec = pendingReviewSpec(24);
      const caseEntity = createTestCase({ status: 'PENDING_STUDY' });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for cases with APPROVED review status', () => {
      const spec = pendingReviewSpec(24);
      const caseEntity = createTestCase({
        status: 'SCORED',
        reviewStatus: 'APPROVED',
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return true for old SCORED cases with PENDING review', () => {
      const spec = pendingReviewSpec(24);
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      const caseEntity = createTestCase({
        status: 'SCORED',
        reviewStatus: 'PENDING',
        createdAt: oldDate,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(true);
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

    it('should return true for urgent non-deleted cases', () => {
      const spec = urgentCasesSpec();
      const caseEntity = createTestCase({ priority: 'URGENT', isDeleted: false });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(true);
    });

    it('should return false for deleted urgent cases', () => {
      const spec = urgentCasesSpec();
      const caseEntity = createTestCase({ priority: 'URGENT', isDeleted: true });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for non-urgent cases', () => {
      const spec = urgentCasesSpec();
      const caseEntity = createTestCase({ priority: 'NORMAL' });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });
  });

  describe('byStatusSpec', () => {
    it('should create specification with type BY_STATUS', () => {
      const spec = byStatusSpec('PENDING_STUDY');

      expect(spec.type).toBe('BY_STATUS');
    });

    it('should create specification with provided status', () => {
      const spec = byStatusSpec('SCORED');

      expect(spec.status).toBe('SCORED');
    });

    it('should return true for matching status', () => {
      const spec = byStatusSpec('PENDING_STUDY');
      const caseEntity = createTestCase({ status: 'PENDING_STUDY', isDeleted: false });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(true);
    });

    it('should return false for non-matching status', () => {
      const spec = byStatusSpec('SCORED');
      const caseEntity = createTestCase({ status: 'PENDING_STUDY' });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for deleted cases', () => {
      const spec = byStatusSpec('PENDING_STUDY');
      const caseEntity = createTestCase({ status: 'PENDING_STUDY', isDeleted: true });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should work for all status values', () => {
      const statuses = [
        'PENDING_STUDY',
        'STUDY_COMPLETED',
        'SCORED',
        'REVIEWED',
        'TREATMENT_PLANNED',
        'IN_TREATMENT',
        'FOLLOW_UP',
        'CLOSED',
        'CANCELLED',
      ] as const;

      for (const status of statuses) {
        const spec = byStatusSpec(status);
        expect(spec.status).toBe(status);
      }
    });
  });

  describe('bySeveritySpec', () => {
    it('should create specification with type BY_SEVERITY', () => {
      const spec = bySeveritySpec('SEVERE');

      expect(spec.type).toBe('BY_SEVERITY');
    });

    it('should create specification with provided severity', () => {
      const spec = bySeveritySpec('MODERATE');

      expect(spec.severity).toBe('MODERATE');
    });

    it('should work for all severity values', () => {
      const severities = ['NONE', 'MILD', 'MODERATE', 'SEVERE'] as const;

      for (const severity of severities) {
        const spec = bySeveritySpec(severity);
        expect(spec.severity).toBe(severity);
      }
    });

    it('should return false for deleted cases', () => {
      const spec = bySeveritySpec('MODERATE');
      const score = OsaxClinicalScore.fromIndicators(createTestIndicators());
      const caseEntity = createTestCase({
        clinicalScore: score,
        isDeleted: true,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for cases without clinical score', () => {
      const spec = bySeveritySpec('MODERATE');
      const caseEntity = createTestCase({ clinicalScore: undefined });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });
  });

  describe('bySpecialistSpec', () => {
    it('should create specification with type BY_SPECIALIST', () => {
      const spec = bySpecialistSpec('specialist-123');

      expect(spec.type).toBe('BY_SPECIALIST');
    });

    it('should create specification with provided specialist ID', () => {
      const spec = bySpecialistSpec('specialist-456');

      expect(spec.specialistId).toBe('specialist-456');
    });

    it('should return true for matching specialist', () => {
      const spec = bySpecialistSpec('specialist-123');
      const caseEntity = createTestCase({
        assignedSpecialistId: 'specialist-123',
        isDeleted: false,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(true);
    });

    it('should return false for non-matching specialist', () => {
      const spec = bySpecialistSpec('specialist-123');
      const caseEntity = createTestCase({
        assignedSpecialistId: 'specialist-456',
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for unassigned cases', () => {
      const spec = bySpecialistSpec('specialist-123');
      const caseEntity = createTestCase({ assignedSpecialistId: undefined });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for deleted cases', () => {
      const spec = bySpecialistSpec('specialist-123');
      const caseEntity = createTestCase({
        assignedSpecialistId: 'specialist-123',
        isDeleted: true,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });
  });

  describe('overdueFollowUpSpec', () => {
    it('should create specification with type OVERDUE_FOLLOW_UP', () => {
      const spec = overdueFollowUpSpec();

      expect(spec.type).toBe('OVERDUE_FOLLOW_UP');
    });

    it('should default to current date', () => {
      const before = new Date();
      const spec = overdueFollowUpSpec();
      const after = new Date();

      expect(spec.asOfDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(spec.asOfDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should accept custom date', () => {
      const customDate = new Date('2025-06-15');
      const spec = overdueFollowUpSpec(customDate);

      expect(spec.asOfDate).toBe(customDate);
    });

    it('should return false for deleted cases', () => {
      const spec = overdueFollowUpSpec();
      const caseEntity = createTestCase({ isDeleted: true });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for cases without follow-ups', () => {
      const spec = overdueFollowUpSpec();
      const caseEntity = createTestCase({ followUps: [] });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return true for cases with overdue scheduled follow-ups', () => {
      const asOfDate = new Date('2025-06-15');
      const spec = overdueFollowUpSpec(asOfDate);

      const followUps: OsaxFollowUpRecord[] = [
        {
          id: 'followup-1',
          scheduledDate: new Date('2025-06-01'), // Before asOfDate
          type: 'PHONE',
          status: 'SCHEDULED',
        },
      ];

      const caseEntity = createTestCase({ followUps, isDeleted: false });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(true);
    });

    it('should return false for cases with only completed follow-ups', () => {
      const asOfDate = new Date('2025-06-15');
      const spec = overdueFollowUpSpec(asOfDate);

      const followUps: OsaxFollowUpRecord[] = [
        {
          id: 'followup-1',
          scheduledDate: new Date('2025-06-01'),
          completedDate: new Date('2025-06-01'),
          type: 'PHONE',
          status: 'COMPLETED',
        },
      ];

      const caseEntity = createTestCase({ followUps, isDeleted: false });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for cases with future follow-ups only', () => {
      const asOfDate = new Date('2025-06-15');
      const spec = overdueFollowUpSpec(asOfDate);

      const followUps: OsaxFollowUpRecord[] = [
        {
          id: 'followup-1',
          scheduledDate: new Date('2025-07-01'), // After asOfDate
          type: 'IN_PERSON',
          status: 'SCHEDULED',
        },
      ];

      const caseEntity = createTestCase({ followUps, isDeleted: false });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });
  });

  describe('byDateRangeSpec', () => {
    it('should create specification with type BY_DATE_RANGE', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      const spec = byDateRangeSpec(startDate, endDate);

      expect(spec.type).toBe('BY_DATE_RANGE');
    });

    it('should create specification with provided dates', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      const spec = byDateRangeSpec(startDate, endDate);

      expect(spec.startDate).toBe(startDate);
      expect(spec.endDate).toBe(endDate);
    });

    it('should return true for cases within date range', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');
      const spec = byDateRangeSpec(startDate, endDate);

      const caseEntity = createTestCase({
        createdAt: new Date('2025-06-15'),
        isDeleted: false,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(true);
    });

    it('should return false for cases before date range', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');
      const spec = byDateRangeSpec(startDate, endDate);

      const caseEntity = createTestCase({
        createdAt: new Date('2024-06-15'),
        isDeleted: false,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for cases after date range', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');
      const spec = byDateRangeSpec(startDate, endDate);

      const caseEntity = createTestCase({
        createdAt: new Date('2026-06-15'),
        isDeleted: false,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for deleted cases', () => {
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');
      const spec = byDateRangeSpec(startDate, endDate);

      const caseEntity = createTestCase({
        createdAt: new Date('2025-06-15'),
        isDeleted: true,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should include cases on boundary dates', () => {
      const startDate = new Date('2025-01-01T00:00:00Z');
      const endDate = new Date('2025-12-31T23:59:59Z');
      const spec = byDateRangeSpec(startDate, endDate);

      const caseOnStart = createTestCase({
        createdAt: startDate,
        isDeleted: false,
      });
      const caseOnEnd = createTestCase({
        createdAt: endDate,
        isDeleted: false,
      });

      expect(spec.isSatisfiedBy(caseOnStart)).toBe(true);
      expect(spec.isSatisfiedBy(caseOnEnd)).toBe(true);
    });
  });

  describe('activeTreatmentSpec', () => {
    it('should create specification with type BY_TREATMENT', () => {
      const spec = activeTreatmentSpec('CPAP_THERAPY');

      expect(spec.type).toBe('BY_TREATMENT');
    });

    it('should create specification with provided treatment type', () => {
      const spec = activeTreatmentSpec('ORAL_APPLIANCE');

      expect(spec.treatmentType).toBe('ORAL_APPLIANCE');
    });

    it('should return false for deleted cases', () => {
      const spec = activeTreatmentSpec('CPAP_THERAPY');
      const caseEntity = createTestCase({ isDeleted: true });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for cases without active treatment', () => {
      const spec = activeTreatmentSpec('CPAP_THERAPY');
      const caseEntity = createTestCase({
        activeTreatment: undefined,
        status: 'SCORED',
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return false for cases not in IN_TREATMENT status', () => {
      const spec = activeTreatmentSpec('CPAP_THERAPY');
      const caseEntity = createTestCase({
        activeTreatment: {
          type: 'CPAP_THERAPY',
          startDate: new Date(),
          status: 'INITIATED',
        },
        status: 'TREATMENT_PLANNED',
        isDeleted: false,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });

    it('should return true for cases with matching active treatment', () => {
      const spec = activeTreatmentSpec('CPAP_THERAPY');
      const caseEntity = createTestCase({
        activeTreatment: {
          type: 'CPAP_THERAPY',
          startDate: new Date(),
          status: 'INITIATED',
        },
        status: 'IN_TREATMENT',
        isDeleted: false,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(true);
    });

    it('should return false for cases with different treatment type', () => {
      const spec = activeTreatmentSpec('CPAP_THERAPY');
      const caseEntity = createTestCase({
        activeTreatment: {
          type: 'ORAL_APPLIANCE',
          startDate: new Date(),
          status: 'INITIATED',
        },
        status: 'IN_TREATMENT',
        isDeleted: false,
      });

      expect(spec.isSatisfiedBy(caseEntity)).toBe(false);
    });
  });
});

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('OsaxCaseRepository Types', () => {
  describe('OsaxCaseRepositoryErrorCode', () => {
    it('should include all expected error codes', () => {
      const errorCodes: OsaxCaseRepositoryErrorCode[] = [
        'NOT_FOUND',
        'DUPLICATE_SUBJECT_ID',
        'DUPLICATE_CASE_NUMBER',
        'VERSION_CONFLICT',
        'INVALID_STATUS_TRANSITION',
        'VALIDATION_ERROR',
        'CONNECTION_ERROR',
        'TIMEOUT',
        'UNAUTHORIZED',
        'GDPR_VIOLATION',
        'UNKNOWN_ERROR',
      ];

      expect(errorCodes).toHaveLength(11);
    });
  });

  describe('OsaxCaseRepositoryError', () => {
    it('should have correct structure', () => {
      const error: OsaxCaseRepositoryError = {
        code: 'NOT_FOUND',
        message: 'Case not found',
      };

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Case not found');
    });

    it('should support optional details', () => {
      const error: OsaxCaseRepositoryError = {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: { field: 'patientId', reason: 'required' },
      };

      expect(error.details).toEqual({ field: 'patientId', reason: 'required' });
    });

    it('should support optional cause', () => {
      const cause = new Error('Network error');
      const error: OsaxCaseRepositoryError = {
        code: 'CONNECTION_ERROR',
        message: 'Database connection failed',
        cause,
      };

      expect(error.cause).toBe(cause);
    });
  });

  describe('OsaxCaseRepositoryResult', () => {
    it('should represent successful result', () => {
      const successResult: OsaxCaseRepositoryResult<string> = {
        success: true,
        value: 'test-value',
      };

      expect(successResult.success).toBe(true);
      if (successResult.success) {
        expect(successResult.value).toBe('test-value');
      }
    });

    it('should represent failure result', () => {
      const failureResult: OsaxCaseRepositoryResult<string> = {
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
        includeDeleted: false,
      };

      expect(options.limit).toBe(10);
      expect(options.offset).toBe(0);
      expect(options.orderBy).toBe('createdAt');
      expect(options.orderDirection).toBe('desc');
      expect(options.includeDeleted).toBe(false);
    });

    it('should support partial query options', () => {
      const options: QueryOptions = {
        limit: 20,
      };

      expect(options.limit).toBe(20);
      expect(options.offset).toBeUndefined();
    });

    it('should support includeDeleted option', () => {
      const options: QueryOptions = {
        includeDeleted: true,
      };

      expect(options.includeDeleted).toBe(true);
    });
  });

  describe('TransactionContext', () => {
    it('should have correct structure', () => {
      const ctx: TransactionContext = {
        id: 'tx-123',
        startedAt: new Date(),
        operations: ['create', 'update'],
      };

      expect(ctx.id).toBe('tx-123');
      expect(ctx.startedAt).toBeInstanceOf(Date);
      expect(ctx.operations).toHaveLength(2);
    });
  });

  describe('OsaxCaseStatistics', () => {
    it('should have correct structure', () => {
      const stats: Partial<OsaxCaseStatistics> = {
        totalCases: 100,
        averageTimeToReview: 24,
        averageTimeToTreatment: 72,
        treatmentComplianceRate: 85,
        followUpCompletionRate: 90,
      };

      expect(stats.totalCases).toBe(100);
      expect(stats.averageTimeToReview).toBe(24);
      expect(stats.treatmentComplianceRate).toBe(85);
    });
  });
});

// ============================================================================
// SPECIFICATION UNION TYPE TESTS
// ============================================================================

describe('OsaxCaseSpec Union Type', () => {
  it('should accept BY_STATUS specification', () => {
    const spec: OsaxCaseSpec = byStatusSpec('PENDING_STUDY');
    expect(spec.type).toBe('BY_STATUS');
  });

  it('should accept BY_SEVERITY specification', () => {
    const spec: OsaxCaseSpec = bySeveritySpec('SEVERE');
    expect(spec.type).toBe('BY_SEVERITY');
  });

  it('should accept NEEDING_REVIEW specification', () => {
    const spec: OsaxCaseSpec = pendingReviewSpec();
    expect(spec.type).toBe('NEEDING_REVIEW');
  });

  it('should accept BY_SPECIALIST specification', () => {
    const spec: OsaxCaseSpec = bySpecialistSpec('specialist-123');
    expect(spec.type).toBe('BY_SPECIALIST');
  });

  it('should accept BY_PRIORITY specification', () => {
    const spec: OsaxCaseSpec = urgentCasesSpec();
    expect(spec.type).toBe('BY_PRIORITY');
  });

  it('should accept OVERDUE_FOLLOW_UP specification', () => {
    const spec: OsaxCaseSpec = overdueFollowUpSpec();
    expect(spec.type).toBe('OVERDUE_FOLLOW_UP');
  });

  it('should accept BY_TREATMENT specification', () => {
    const spec: OsaxCaseSpec = activeTreatmentSpec('CPAP_THERAPY');
    expect(spec.type).toBe('BY_TREATMENT');
  });

  it('should accept BY_DATE_RANGE specification', () => {
    const spec: OsaxCaseSpec = byDateRangeSpec(new Date(), new Date());
    expect(spec.type).toBe('BY_DATE_RANGE');
  });

  it('should allow type narrowing via switch', () => {
    const specs: OsaxCaseSpec[] = [
      byStatusSpec('PENDING_STUDY'),
      bySeveritySpec('MODERATE'),
      pendingReviewSpec(48),
      bySpecialistSpec('specialist-123'),
      urgentCasesSpec(),
      overdueFollowUpSpec(),
      activeTreatmentSpec('CPAP_THERAPY'),
      byDateRangeSpec(new Date(), new Date()),
    ];

    for (const spec of specs) {
      switch (spec.type) {
        case 'BY_STATUS':
          expect(spec.status).toBeDefined();
          break;
        case 'BY_SEVERITY':
          expect(spec.severity).toBeDefined();
          break;
        case 'NEEDING_REVIEW':
          expect(spec.maxAgeHours).toBeDefined();
          break;
        case 'BY_SPECIALIST':
          expect(spec.specialistId).toBeDefined();
          break;
        case 'BY_PRIORITY':
          expect(spec.priority).toBeDefined();
          break;
        case 'OVERDUE_FOLLOW_UP':
          expect(spec.asOfDate).toBeDefined();
          break;
        case 'BY_TREATMENT':
          expect(spec.treatmentType).toBeDefined();
          break;
        case 'BY_DATE_RANGE':
          expect(spec.startDate).toBeDefined();
          expect(spec.endDate).toBeDefined();
          break;
      }
    }
  });
});
