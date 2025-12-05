/**
 * @fileoverview Comprehensive Tests for OsaxCaseRepository Specification Functions
 *
 * Tests the specification pattern factory functions including:
 * - Specification creation and validation
 * - isSatisfiedBy predicate logic
 * - GDPR compliance (deletion handling)
 * - Date range filtering
 * - Status and severity filtering
 * - Priority and urgency filtering
 * - Specialist assignment filtering
 * - Treatment type filtering
 *
 * @module domain/osax/repositories/__tests__/osax-case-repository
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
  type OsaxCase,
  type OsaxCaseStatus,
  type OsaxFollowUpRecord,
  type OsaxTreatmentRecord,
} from '../OsaxCaseRepository.js';
import { OsaxClinicalScore } from '../../value-objects/OsaxClinicalScore.js';
import { OsaxSubjectId } from '../../value-objects/OsaxSubjectId.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockCase = (overrides?: Partial<OsaxCase>): OsaxCase => {
  const now = new Date();
  const baseCase: OsaxCase = {
    id: 'case-123',
    subjectId: OsaxSubjectId.generate(1, 2025),
    caseNumber: 'OSAX-2025-001',
    patientId: 'patient-456',
    status: 'PENDING_STUDY',
    reviewStatus: 'PENDING',
    priority: 'NORMAL',
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    version: 1,
    followUps: [],
    metadata: {},
  };

  return { ...baseCase, ...overrides };
};

const createMockFollowUp = (
  overrides?: Partial<OsaxFollowUpRecord>
): OsaxFollowUpRecord => {
  const scheduledDate = new Date();
  scheduledDate.setDate(scheduledDate.getDate() + 7); // 7 days from now

  return {
    id: 'followup-123',
    scheduledDate,
    type: 'routine',
    status: 'SCHEDULED',
    notes: 'Follow-up appointment',
    ...overrides,
  };
};

const createMockTreatment = (
  overrides?: Partial<OsaxTreatmentRecord>
): OsaxTreatmentRecord => ({
  id: 'treatment-123',
  type: 'CPAP_THERAPY',
  status: 'INITIATED',
  startDate: new Date(),
  prescribedBy: 'Dr. Smith',
  ...overrides,
});

const createMockClinicalScore = (severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE') => {
  const ahiMap = {
    NONE: 2.0,
    MILD: 7.5,
    MODERATE: 22.0,
    SEVERE: 45.0,
  };

  return OsaxClinicalScore.fromIndicators({
    ahi: ahiMap[severity],
    odi: ahiMap[severity] * 0.8,
    spo2Nadir: severity === 'SEVERE' ? 72 : severity === 'MODERATE' ? 83 : 88,
    spo2Average: severity === 'SEVERE' ? 88 : severity === 'MODERATE' ? 91 : 94,
    sleepEfficiency: 80,
    totalSleepTime: 360,
    essScore: 10,
  });
};

// ============================================================================
// PENDING REVIEW SPECIFICATION TESTS
// ============================================================================

describe('OsaxCaseRepository - Pending Review Spec', () => {
  it('should create pending review specification with default max age', () => {
    const spec = pendingReviewSpec();

    expect(spec.type).toBe('NEEDING_REVIEW');
    expect(spec.maxAgeHours).toBe(24);
  });

  it('should create pending review specification with custom max age', () => {
    const spec = pendingReviewSpec(48);

    expect(spec.maxAgeHours).toBe(48);
  });

  it('should satisfy for scored cases pending review older than cutoff', () => {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 25); // 25 hours ago

    const testCase = createMockCase({
      status: 'SCORED',
      reviewStatus: 'PENDING',
      createdAt: cutoffTime,
    });

    const spec = pendingReviewSpec(24);

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should not satisfy for cases newer than cutoff', () => {
    const recentTime = new Date();
    recentTime.setHours(recentTime.getHours() - 1); // 1 hour ago

    const testCase = createMockCase({
      status: 'SCORED',
      reviewStatus: 'PENDING',
      createdAt: recentTime,
    });

    const spec = pendingReviewSpec(24);

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for non-scored status', () => {
    const oldTime = new Date();
    oldTime.setHours(oldTime.getHours() - 48);

    const testCase = createMockCase({
      status: 'PENDING_STUDY',
      reviewStatus: 'PENDING',
      createdAt: oldTime,
    });

    const spec = pendingReviewSpec(24);

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for already reviewed cases', () => {
    const oldTime = new Date();
    oldTime.setHours(oldTime.getHours() - 48);

    const testCase = createMockCase({
      status: 'SCORED',
      reviewStatus: 'APPROVED',
      createdAt: oldTime,
    });

    const spec = pendingReviewSpec(24);

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });
});

// ============================================================================
// URGENT CASES SPECIFICATION TESTS
// ============================================================================

describe('OsaxCaseRepository - Urgent Cases Spec', () => {
  it('should create urgent cases specification', () => {
    const spec = urgentCasesSpec();

    expect(spec.type).toBe('BY_PRIORITY');
    expect(spec.priority).toBe('URGENT');
  });

  it('should satisfy for urgent priority cases', () => {
    const testCase = createMockCase({ priority: 'URGENT' });
    const spec = urgentCasesSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should not satisfy for non-urgent cases', () => {
    const testCase = createMockCase({ priority: 'NORMAL' });
    const spec = urgentCasesSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for deleted urgent cases (GDPR compliance)', () => {
    const testCase = createMockCase({
      priority: 'URGENT',
      isDeleted: true,
    });
    const spec = urgentCasesSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });
});

// ============================================================================
// BY STATUS SPECIFICATION TESTS
// ============================================================================

describe('OsaxCaseRepository - By Status Spec', () => {
  it('should create by status specification', () => {
    const spec = byStatusSpec('REVIEWED');

    expect(spec.type).toBe('BY_STATUS');
    expect(spec.status).toBe('REVIEWED');
  });

  it('should satisfy for matching status', () => {
    const testCase = createMockCase({ status: 'REVIEWED' });
    const spec = byStatusSpec('REVIEWED');

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should not satisfy for different status', () => {
    const testCase = createMockCase({ status: 'PENDING_STUDY' });
    const spec = byStatusSpec('REVIEWED');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for deleted cases (GDPR compliance)', () => {
    const testCase = createMockCase({
      status: 'REVIEWED',
      isDeleted: true,
    });
    const spec = byStatusSpec('REVIEWED');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should work with all status types', () => {
    const statuses: OsaxCaseStatus[] = [
      'PENDING_STUDY',
      'STUDY_COMPLETED',
      'SCORED',
      'REVIEWED',
      'TREATMENT_PLANNED',
      'IN_TREATMENT',
      'FOLLOW_UP',
      'CLOSED',
      'CANCELLED',
    ];

    statuses.forEach((status) => {
      const spec = byStatusSpec(status);
      const testCase = createMockCase({ status });

      expect(spec.isSatisfiedBy(testCase)).toBe(true);
    });
  });
});

// ============================================================================
// BY SEVERITY SPECIFICATION TESTS
// ============================================================================

describe('OsaxCaseRepository - By Severity Spec', () => {
  it('should create by severity specification', () => {
    const spec = bySeveritySpec('MODERATE');

    expect(spec.type).toBe('BY_SEVERITY');
    expect(spec.severity).toBe('MODERATE');
  });

  it('should satisfy for matching severity', () => {
    const testCase = createMockCase({
      clinicalScore: createMockClinicalScore('MODERATE'),
    });
    const spec = bySeveritySpec('MODERATE');

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should not satisfy for different severity', () => {
    const testCase = createMockCase({
      clinicalScore: createMockClinicalScore('MILD'),
    });
    const spec = bySeveritySpec('SEVERE');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy when clinical score is missing', () => {
    const testCase = createMockCase({ clinicalScore: undefined });
    const spec = bySeveritySpec('MODERATE');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for deleted cases (GDPR compliance)', () => {
    const testCase = createMockCase({
      clinicalScore: createMockClinicalScore('SEVERE'),
      isDeleted: true,
    });
    const spec = bySeveritySpec('SEVERE');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should work with all severity levels', () => {
    const severities = ['NONE', 'MILD', 'MODERATE', 'SEVERE'] as const;

    severities.forEach((severity) => {
      const spec = bySeveritySpec(severity);
      const testCase = createMockCase({
        clinicalScore: createMockClinicalScore(severity),
      });

      expect(spec.isSatisfiedBy(testCase)).toBe(true);
    });
  });
});

// ============================================================================
// BY SPECIALIST SPECIFICATION TESTS
// ============================================================================

describe('OsaxCaseRepository - By Specialist Spec', () => {
  it('should create by specialist specification', () => {
    const spec = bySpecialistSpec('specialist-123');

    expect(spec.type).toBe('BY_SPECIALIST');
    expect(spec.specialistId).toBe('specialist-123');
  });

  it('should satisfy for assigned specialist', () => {
    const testCase = createMockCase({
      assignedSpecialistId: 'specialist-123',
    });
    const spec = bySpecialistSpec('specialist-123');

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should not satisfy for different specialist', () => {
    const testCase = createMockCase({
      assignedSpecialistId: 'specialist-456',
    });
    const spec = bySpecialistSpec('specialist-123');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy when no specialist assigned', () => {
    const testCase = createMockCase({
      assignedSpecialistId: undefined,
    });
    const spec = bySpecialistSpec('specialist-123');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for deleted cases (GDPR compliance)', () => {
    const testCase = createMockCase({
      assignedSpecialistId: 'specialist-123',
      isDeleted: true,
    });
    const spec = bySpecialistSpec('specialist-123');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });
});

// ============================================================================
// OVERDUE FOLLOW-UP SPECIFICATION TESTS
// ============================================================================

describe('OsaxCaseRepository - Overdue Follow-Up Spec', () => {
  it('should create overdue follow-up specification with default date', () => {
    const spec = overdueFollowUpSpec();

    expect(spec.type).toBe('OVERDUE_FOLLOW_UP');
    expect(spec.asOfDate).toBeDefined();
  });

  it('should create overdue follow-up specification with custom date', () => {
    const customDate = new Date('2025-06-01');
    const spec = overdueFollowUpSpec(customDate);

    expect(spec.asOfDate).toEqual(customDate);
  });

  it('should satisfy for cases with overdue scheduled follow-ups', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7); // 7 days ago

    const testCase = createMockCase({
      followUps: [
        createMockFollowUp({
          scheduledDate: pastDate,
          status: 'SCHEDULED',
        }),
      ],
    });

    const spec = overdueFollowUpSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should not satisfy for cases with future follow-ups', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

    const testCase = createMockCase({
      followUps: [
        createMockFollowUp({
          scheduledDate: futureDate,
          status: 'SCHEDULED',
        }),
      ],
    });

    const spec = overdueFollowUpSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for completed follow-ups even if past date', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    const testCase = createMockCase({
      followUps: [
        createMockFollowUp({
          scheduledDate: pastDate,
          status: 'COMPLETED',
        }),
      ],
    });

    const spec = overdueFollowUpSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for deleted cases (GDPR compliance)', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    const testCase = createMockCase({
      followUps: [
        createMockFollowUp({
          scheduledDate: pastDate,
          status: 'SCHEDULED',
        }),
      ],
      isDeleted: true,
    });

    const spec = overdueFollowUpSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should handle cases with no follow-ups', () => {
    const testCase = createMockCase({ followUps: [] });
    const spec = overdueFollowUpSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should handle cases with multiple follow-ups', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const testCase = createMockCase({
      followUps: [
        createMockFollowUp({
          id: 'follow-1',
          scheduledDate: pastDate,
          status: 'SCHEDULED',
        }),
        createMockFollowUp({
          id: 'follow-2',
          scheduledDate: futureDate,
          status: 'SCHEDULED',
        }),
      ],
    });

    const spec = overdueFollowUpSpec();

    // Should satisfy if ANY follow-up is overdue
    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });
});

// ============================================================================
// BY DATE RANGE SPECIFICATION TESTS
// ============================================================================

describe('OsaxCaseRepository - By Date Range Spec', () => {
  it('should create by date range specification', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');
    const spec = byDateRangeSpec(start, end);

    expect(spec.type).toBe('BY_DATE_RANGE');
    expect(spec.startDate).toEqual(start);
    expect(spec.endDate).toEqual(end);
  });

  it('should satisfy for cases within date range', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');
    const testCase = createMockCase({
      createdAt: new Date('2025-06-15'),
    });

    const spec = byDateRangeSpec(start, end);

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should satisfy for case at start boundary', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');
    const testCase = createMockCase({
      createdAt: new Date('2025-01-01'),
    });

    const spec = byDateRangeSpec(start, end);

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should satisfy for case at end boundary', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');
    const testCase = createMockCase({
      createdAt: new Date('2025-12-31'),
    });

    const spec = byDateRangeSpec(start, end);

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should not satisfy for cases before date range', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');
    const testCase = createMockCase({
      createdAt: new Date('2024-12-31'),
    });

    const spec = byDateRangeSpec(start, end);

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for cases after date range', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');
    const testCase = createMockCase({
      createdAt: new Date('2026-01-01'),
    });

    const spec = byDateRangeSpec(start, end);

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for deleted cases (GDPR compliance)', () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-12-31');
    const testCase = createMockCase({
      createdAt: new Date('2025-06-15'),
      isDeleted: true,
    });

    const spec = byDateRangeSpec(start, end);

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });
});

// ============================================================================
// ACTIVE TREATMENT SPECIFICATION TESTS
// ============================================================================

describe('OsaxCaseRepository - Active Treatment Spec', () => {
  it('should create active treatment specification', () => {
    const spec = activeTreatmentSpec('CPAP_THERAPY');

    expect(spec.type).toBe('BY_TREATMENT');
    expect(spec.treatmentType).toBe('CPAP_THERAPY');
  });

  it('should satisfy for cases with matching active treatment', () => {
    const testCase = createMockCase({
      status: 'IN_TREATMENT',
      activeTreatment: createMockTreatment({ type: 'CPAP_THERAPY' }),
    });

    const spec = activeTreatmentSpec('CPAP_THERAPY');

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should not satisfy for cases with different treatment type', () => {
    const testCase = createMockCase({
      status: 'IN_TREATMENT',
      activeTreatment: createMockTreatment({ type: 'ORAL_APPLIANCE' }),
    });

    const spec = activeTreatmentSpec('CPAP_THERAPY');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for cases without active treatment', () => {
    const testCase = createMockCase({
      status: 'SCORED',
      activeTreatment: undefined,
    });

    const spec = activeTreatmentSpec('CPAP_THERAPY');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for cases not in treatment status', () => {
    const testCase = createMockCase({
      status: 'REVIEWED',
      activeTreatment: createMockTreatment({ type: 'CPAP_THERAPY' }),
    });

    const spec = activeTreatmentSpec('CPAP_THERAPY');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should not satisfy for deleted cases (GDPR compliance)', () => {
    const testCase = createMockCase({
      status: 'IN_TREATMENT',
      activeTreatment: createMockTreatment({ type: 'CPAP_THERAPY' }),
      isDeleted: true,
    });

    const spec = activeTreatmentSpec('CPAP_THERAPY');

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should work with different treatment types', () => {
    const treatments = [
      'CPAP_THERAPY',
      'BIPAP_THERAPY',
      'ORAL_APPLIANCE',
      'POSITIONAL_THERAPY',
      'LIFESTYLE_MODIFICATION',
    ];

    treatments.forEach((treatmentType) => {
      const spec = activeTreatmentSpec(treatmentType);
      const testCase = createMockCase({
        status: 'IN_TREATMENT',
        activeTreatment: createMockTreatment({ type: treatmentType as any }),
      });

      expect(spec.isSatisfiedBy(testCase)).toBe(true);
    });
  });
});

// ============================================================================
// GDPR COMPLIANCE TESTS
// ============================================================================

describe('OsaxCaseRepository - GDPR Compliance', () => {
  it('should exclude deleted cases from all specifications', () => {
    const deletedCase = createMockCase({
      status: 'REVIEWED',
      priority: 'URGENT',
      isDeleted: true,
      assignedSpecialistId: 'specialist-123',
      clinicalScore: createMockClinicalScore('SEVERE'),
    });

    // Test all specs exclude deleted cases
    expect(urgentCasesSpec().isSatisfiedBy(deletedCase)).toBe(false);
    expect(byStatusSpec('REVIEWED').isSatisfiedBy(deletedCase)).toBe(false);
    expect(bySeveritySpec('SEVERE').isSatisfiedBy(deletedCase)).toBe(false);
    expect(bySpecialistSpec('specialist-123').isSatisfiedBy(deletedCase)).toBe(false);

    const start = new Date('2020-01-01');
    const end = new Date('2030-12-31');
    expect(byDateRangeSpec(start, end).isSatisfiedBy(deletedCase)).toBe(false);
  });

  it('should handle soft-deleted cases correctly', () => {
    const softDeletedCase = createMockCase({
      isDeleted: true,
      deletedAt: new Date(),
      deletionReason: 'Patient request - GDPR right to be forgotten',
    });

    // Deleted cases should not appear in any query
    expect(urgentCasesSpec().isSatisfiedBy(softDeletedCase)).toBe(false);
  });
});

// ============================================================================
// SPECIFICATION COMPOSITION TESTS
// ============================================================================

describe('OsaxCaseRepository - Specification Composition', () => {
  it('should allow combining multiple specifications', () => {
    const testCase = createMockCase({
      status: 'REVIEWED',
      priority: 'URGENT',
      clinicalScore: createMockClinicalScore('SEVERE'),
    });

    // All three specs should be satisfied
    expect(byStatusSpec('REVIEWED').isSatisfiedBy(testCase)).toBe(true);
    expect(urgentCasesSpec().isSatisfiedBy(testCase)).toBe(true);
    expect(bySeveritySpec('SEVERE').isSatisfiedBy(testCase)).toBe(true);
  });

  it('should handle cases that satisfy some but not all specifications', () => {
    const testCase = createMockCase({
      status: 'REVIEWED',
      priority: 'NORMAL', // Not urgent
      clinicalScore: createMockClinicalScore('SEVERE'),
    });

    expect(byStatusSpec('REVIEWED').isSatisfiedBy(testCase)).toBe(true);
    expect(urgentCasesSpec().isSatisfiedBy(testCase)).toBe(false);
    expect(bySeveritySpec('SEVERE').isSatisfiedBy(testCase)).toBe(true);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('OsaxCaseRepository - Edge Cases', () => {
  it('should handle cases with minimal data', () => {
    const minimalCase = createMockCase({
      clinicalScore: undefined,
      assignedSpecialistId: undefined,
      activeTreatment: undefined,
      followUps: [],
    });

    // Should not crash, just return false
    expect(bySeveritySpec('MODERATE').isSatisfiedBy(minimalCase)).toBe(false);
    expect(bySpecialistSpec('any').isSatisfiedBy(minimalCase)).toBe(false);
    expect(activeTreatmentSpec('any').isSatisfiedBy(minimalCase)).toBe(false);
    expect(overdueFollowUpSpec().isSatisfiedBy(minimalCase)).toBe(false);
  });

  it('should handle boundary dates correctly', () => {
    const exactStartDate = new Date('2025-01-01T00:00:00.000Z');
    const testCase = createMockCase({
      createdAt: exactStartDate,
    });

    const spec = byDateRangeSpec(exactStartDate, new Date('2025-12-31'));

    expect(spec.isSatisfiedBy(testCase)).toBe(true);
  });

  it('should handle empty follow-up arrays', () => {
    const testCase = createMockCase({ followUps: [] });
    const spec = overdueFollowUpSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });

  it('should handle cases with cancelled follow-ups', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    const testCase = createMockCase({
      followUps: [
        createMockFollowUp({
          scheduledDate: pastDate,
          status: 'CANCELLED',
        }),
      ],
    });

    const spec = overdueFollowUpSpec();

    expect(spec.isSatisfiedBy(testCase)).toBe(false);
  });
});
