/**
 * @fileoverview Tests for OsaxCase Entity and Helper Functions
 * Comprehensive tests for case creation, status transitions, and query helpers
 */

import { describe, it, expect } from 'vitest';
import {
  createOsaxCase,
  generateCaseNumber,
  isValidStatusTransition,
  getAllowedNextStatuses,
  requiresImmediateAttention,
  isActiveCase,
  requiresTreatment,
  isReadyForTreatment,
  calculateCaseProgress,
  getCaseSeveritySummary,
  type OsaxCase,
  type CreateOsaxCaseInput,
  type OsaxCaseStatus,
} from '../osax/entities/OsaxCase.js';
import { OsaxSubjectId } from '../osax/value-objects/OsaxSubjectId.js';
import { OsaxClinicalScore } from '../osax/value-objects/OsaxClinicalScore.js';

describe('OsaxCase Entity', () => {
  describe('generateCaseNumber', () => {
    it('should generate case number with proper format', () => {
      const caseNumber = generateCaseNumber(2025, 1);
      expect(caseNumber).toBe('OSA-2025-00001');
    });

    it('should pad sequence number to 5 digits', () => {
      expect(generateCaseNumber(2025, 1)).toBe('OSA-2025-00001');
      expect(generateCaseNumber(2025, 99)).toBe('OSA-2025-00099');
      expect(generateCaseNumber(2025, 999)).toBe('OSA-2025-00999');
      expect(generateCaseNumber(2025, 99999)).toBe('OSA-2025-99999');
    });

    it('should handle different years', () => {
      expect(generateCaseNumber(2024, 1)).toBe('OSA-2024-00001');
      expect(generateCaseNumber(2026, 42)).toBe('OSA-2026-00042');
    });
  });

  describe('createOsaxCase', () => {
    it('should create a new OSAX case with required fields', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
      };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.id).toBeDefined();
      expect(osaxCase.subjectId).toBe(subjectId);
      expect(osaxCase.patientId).toBe('patient-123');
      expect(osaxCase.caseNumber).toMatch(/^OSA-\d{4}-\d{5}$/);
      expect(osaxCase.status).toBe('PENDING_STUDY');
      expect(osaxCase.priority).toBe('NORMAL');
      expect(osaxCase.reviewStatus).toBe('PENDING');
      expect(osaxCase.consentStatus).toBe('PENDING');
      expect(osaxCase.isDeleted).toBe(false);
      expect(osaxCase.version).toBe(1);
    });

    it('should create case with optional fields', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
        referringPhysicianId: 'doctor-456',
        assignedSpecialistId: 'specialist-789',
        priority: 'URGENT',
        tags: ['vip', 'complex'],
      };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.referringPhysicianId).toBe('doctor-456');
      expect(osaxCase.assignedSpecialistId).toBe('specialist-789');
      expect(osaxCase.priority).toBe('URGENT');
      expect(osaxCase.tags).toEqual(['vip', 'complex']);
    });

    it('should generate unique IDs for each case', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
      };

      const case1 = createOsaxCase(input, 1);
      const case2 = createOsaxCase(input, 2);

      expect(case1.id).not.toBe(case2.id);
    });

    it('should initialize empty arrays', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
      };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.scoreHistory).toEqual([]);
      expect(osaxCase.physicianReviews).toEqual([]);
      expect(osaxCase.treatmentHistory).toEqual([]);
      expect(osaxCase.followUps).toEqual([]);
    });

    it('should set creation and update timestamps', () => {
      const before = new Date();
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const osaxCase = createOsaxCase({ subjectId, patientId: 'patient-123' }, 1);
      const after = new Date();

      expect(osaxCase.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(osaxCase.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(osaxCase.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(osaxCase.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Status Transitions', () => {
    describe('isValidStatusTransition', () => {
      it('should allow PENDING_STUDY → STUDY_COMPLETED', () => {
        expect(isValidStatusTransition('PENDING_STUDY', 'STUDY_COMPLETED')).toBe(true);
      });

      it('should allow PENDING_STUDY → CANCELLED', () => {
        expect(isValidStatusTransition('PENDING_STUDY', 'CANCELLED')).toBe(true);
      });

      it('should not allow PENDING_STUDY → SCORED', () => {
        expect(isValidStatusTransition('PENDING_STUDY', 'SCORED')).toBe(false);
      });

      it('should allow STUDY_COMPLETED → SCORED', () => {
        expect(isValidStatusTransition('STUDY_COMPLETED', 'SCORED')).toBe(true);
      });

      it('should allow SCORED → REVIEWED', () => {
        expect(isValidStatusTransition('SCORED', 'REVIEWED')).toBe(true);
      });

      it('should allow REVIEWED → TREATMENT_PLANNED', () => {
        expect(isValidStatusTransition('REVIEWED', 'TREATMENT_PLANNED')).toBe(true);
      });

      it('should allow TREATMENT_PLANNED → IN_TREATMENT', () => {
        expect(isValidStatusTransition('TREATMENT_PLANNED', 'IN_TREATMENT')).toBe(true);
      });

      it('should allow IN_TREATMENT → FOLLOW_UP', () => {
        expect(isValidStatusTransition('IN_TREATMENT', 'FOLLOW_UP')).toBe(true);
      });

      it('should allow FOLLOW_UP → CLOSED', () => {
        expect(isValidStatusTransition('FOLLOW_UP', 'CLOSED')).toBe(true);
      });

      it('should not allow transitions from CLOSED', () => {
        expect(isValidStatusTransition('CLOSED', 'PENDING_STUDY')).toBe(false);
        expect(isValidStatusTransition('CLOSED', 'IN_TREATMENT')).toBe(false);
      });

      it('should not allow transitions from CANCELLED', () => {
        expect(isValidStatusTransition('CANCELLED', 'PENDING_STUDY')).toBe(false);
        expect(isValidStatusTransition('CANCELLED', 'SCORED')).toBe(false);
      });

      it('should allow cancellation from any active status', () => {
        expect(isValidStatusTransition('PENDING_STUDY', 'CANCELLED')).toBe(true);
        expect(isValidStatusTransition('SCORED', 'CANCELLED')).toBe(true);
        expect(isValidStatusTransition('IN_TREATMENT', 'CANCELLED')).toBe(true);
      });
    });

    describe('getAllowedNextStatuses', () => {
      it('should return correct next statuses for PENDING_STUDY', () => {
        const allowed = getAllowedNextStatuses('PENDING_STUDY');
        expect(allowed).toEqual(['STUDY_COMPLETED', 'CANCELLED']);
      });

      it('should return correct next statuses for REVIEWED', () => {
        const allowed = getAllowedNextStatuses('REVIEWED');
        expect(allowed).toEqual(['TREATMENT_PLANNED', 'FOLLOW_UP', 'CLOSED', 'CANCELLED']);
      });

      it('should return empty array for CLOSED', () => {
        const allowed = getAllowedNextStatuses('CLOSED');
        expect(allowed).toEqual([]);
      });

      it('should return empty array for CANCELLED', () => {
        const allowed = getAllowedNextStatuses('CANCELLED');
        expect(allowed).toEqual([]);
      });
    });
  });

  describe('Case Query Helpers', () => {
    describe('requiresImmediateAttention', () => {
      it('should return true for URGENT priority', () => {
        const osaxCase = createMockCase({ priority: 'URGENT' });
        expect(requiresImmediateAttention(osaxCase)).toBe(true);
      });

      it('should return true for cases with urgent intervention score', () => {
        const clinicalScore = OsaxClinicalScore.fromIndicators({
          ahi: 35,
          odi: 30,
          spo2Nadir: 70,
          spo2Average: 88,
          sleepEfficiency: 75,
          essScore: 18,
        });

        const osaxCase = createMockCase({ clinicalScore, priority: 'NORMAL' });
        expect(requiresImmediateAttention(osaxCase)).toBe(true);
      });

      it('should return false for normal priority cases', () => {
        const osaxCase = createMockCase({ priority: 'NORMAL' });
        expect(requiresImmediateAttention(osaxCase)).toBe(false);
      });

      it('should return true for overdue clinical review', () => {
        const clinicalScore = OsaxClinicalScore.fromIndicators({
          ahi: 20,
          odi: 15,
          spo2Nadir: 82,
          spo2Average: 92,
          sleepEfficiency: 80,
          essScore: 12,
        });

        // Create case with score history that exceeds even the longest SLA (168 hours/1 week)
        const scoredAt = new Date(Date.now() - 200 * 60 * 60 * 1000); // 200 hours ago
        const osaxCase = createMockCase({
          status: 'SCORED',
          reviewStatus: 'PENDING',
          clinicalScore,
          priority: 'NORMAL',
          scoreHistory: [
            {
              score: clinicalScore,
              scoredAt,
              scoredBy: 'SYSTEM',
            },
          ],
        });

        expect(requiresImmediateAttention(osaxCase)).toBe(true);
      });

      it('should return false for recent score within SLA', () => {
        const clinicalScore = OsaxClinicalScore.fromIndicators({
          ahi: 20,
          odi: 15,
          spo2Nadir: 82,
          spo2Average: 92,
          sleepEfficiency: 80,
          essScore: 12,
        });

        // Create case with very recent score
        const scoredAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
        const osaxCase = createMockCase({
          status: 'SCORED',
          reviewStatus: 'PENDING',
          clinicalScore,
          priority: 'NORMAL',
          scoreHistory: [
            {
              score: clinicalScore,
              scoredAt,
              scoredBy: 'SYSTEM',
            },
          ],
        });

        expect(requiresImmediateAttention(osaxCase)).toBe(false);
      });

      it('should return false for scored case without scoreHistory entry', () => {
        const clinicalScore = OsaxClinicalScore.fromIndicators({
          ahi: 20,
          odi: 15,
          spo2Nadir: 82,
          spo2Average: 92,
          sleepEfficiency: 80,
          essScore: 12,
        });

        const osaxCase = createMockCase({
          status: 'SCORED',
          reviewStatus: 'PENDING',
          clinicalScore,
          priority: 'NORMAL',
          scoreHistory: [], // Empty score history
        });

        expect(requiresImmediateAttention(osaxCase)).toBe(false);
      });
    });

    describe('isActiveCase', () => {
      it('should return true for pending study cases', () => {
        const osaxCase = createMockCase({ status: 'PENDING_STUDY', isDeleted: false });
        expect(isActiveCase(osaxCase)).toBe(true);
      });

      it('should return true for in treatment cases', () => {
        const osaxCase = createMockCase({ status: 'IN_TREATMENT', isDeleted: false });
        expect(isActiveCase(osaxCase)).toBe(true);
      });

      it('should return false for closed cases', () => {
        const osaxCase = createMockCase({ status: 'CLOSED', isDeleted: false });
        expect(isActiveCase(osaxCase)).toBe(false);
      });

      it('should return false for cancelled cases', () => {
        const osaxCase = createMockCase({ status: 'CANCELLED', isDeleted: false });
        expect(isActiveCase(osaxCase)).toBe(false);
      });

      it('should return false for deleted cases', () => {
        const osaxCase = createMockCase({ status: 'IN_TREATMENT', isDeleted: true });
        expect(isActiveCase(osaxCase)).toBe(false);
      });
    });

    describe('requiresTreatment', () => {
      it('should return true for cases with OSA', () => {
        const clinicalScore = OsaxClinicalScore.fromIndicators({
          ahi: 15,
          odi: 12,
          spo2Nadir: 82,
          spo2Average: 94,
          sleepEfficiency: 85,
          essScore: 10,
        });

        const osaxCase = createMockCase({ clinicalScore });
        expect(requiresTreatment(osaxCase)).toBe(true);
      });

      it('should return false for cases without clinical score', () => {
        const osaxCase = createMockCase({ clinicalScore: undefined });
        expect(requiresTreatment(osaxCase)).toBe(false);
      });

      it('should return false for cases with NONE severity', () => {
        const clinicalScore = OsaxClinicalScore.fromIndicators({
          ahi: 2,
          odi: 1,
          spo2Nadir: 94,
          spo2Average: 97,
          sleepEfficiency: 92,
          essScore: 4,
        });

        const osaxCase = createMockCase({ clinicalScore });
        expect(requiresTreatment(osaxCase)).toBe(false);
      });
    });

    describe('isReadyForTreatment', () => {
      it('should return true when all conditions are met', () => {
        const osaxCase = createMockCase({
          status: 'TREATMENT_PLANNED',
          reviewStatus: 'APPROVED',
          consentStatus: 'OBTAINED',
          activeTreatment: undefined,
        });

        expect(isReadyForTreatment(osaxCase)).toBe(true);
      });

      it('should return false if status is not TREATMENT_PLANNED', () => {
        const osaxCase = createMockCase({
          status: 'REVIEWED',
          reviewStatus: 'APPROVED',
          consentStatus: 'OBTAINED',
        });

        expect(isReadyForTreatment(osaxCase)).toBe(false);
      });

      it('should return false if review not approved', () => {
        const osaxCase = createMockCase({
          status: 'TREATMENT_PLANNED',
          reviewStatus: 'PENDING',
          consentStatus: 'OBTAINED',
        });

        expect(isReadyForTreatment(osaxCase)).toBe(false);
      });

      it('should return false if consent not obtained', () => {
        const osaxCase = createMockCase({
          status: 'TREATMENT_PLANNED',
          reviewStatus: 'APPROVED',
          consentStatus: 'PENDING',
        });

        expect(isReadyForTreatment(osaxCase)).toBe(false);
      });

      it('should return false if active treatment exists', () => {
        const osaxCase = createMockCase({
          status: 'TREATMENT_PLANNED',
          reviewStatus: 'APPROVED',
          consentStatus: 'OBTAINED',
          activeTreatment: {
            type: 'CPAP_THERAPY',
            startDate: new Date(),
            status: 'INITIATED',
          },
        });

        expect(isReadyForTreatment(osaxCase)).toBe(false);
      });
    });

    describe('calculateCaseProgress', () => {
      const testCases: Array<[OsaxCaseStatus, number]> = [
        ['PENDING_STUDY', 10],
        ['STUDY_COMPLETED', 25],
        ['SCORED', 40],
        ['REVIEWED', 55],
        ['TREATMENT_PLANNED', 70],
        ['IN_TREATMENT', 85],
        ['FOLLOW_UP', 90],
        ['CLOSED', 100],
        ['CANCELLED', 0],
      ];

      testCases.forEach(([status, expectedProgress]) => {
        it(`should return ${expectedProgress}% for ${status} status`, () => {
          const osaxCase = createMockCase({ status });
          expect(calculateCaseProgress(osaxCase)).toBe(expectedProgress);
        });
      });
    });

    describe('getCaseSeveritySummary', () => {
      it('should return severity summary for case with score', () => {
        const clinicalScore = OsaxClinicalScore.fromIndicators({
          ahi: 25,
          odi: 20,
          spo2Nadir: 78,
          spo2Average: 91,
          sleepEfficiency: 80,
          essScore: 14,
        });

        const osaxCase = createMockCase({ clinicalScore });
        const summary = getCaseSeveritySummary(osaxCase);

        expect(summary.severity).toBe('MODERATE');
        expect(summary.ahi).toBe(25);
        expect(summary.requiresImmediate).toBe(false);
      });

      it('should return UNKNOWN severity for case without score', () => {
        const osaxCase = createMockCase({ clinicalScore: undefined, priority: 'NORMAL' });
        const summary = getCaseSeveritySummary(osaxCase);

        expect(summary.severity).toBe('UNKNOWN');
        expect(summary.ahi).toBeNull();
        expect(summary.requiresImmediate).toBe(false);
      });

      it('should return requiresImmediate true for URGENT priority', () => {
        const osaxCase = createMockCase({ clinicalScore: undefined, priority: 'URGENT' });
        const summary = getCaseSeveritySummary(osaxCase);

        expect(summary.requiresImmediate).toBe(true);
      });

      it('should return requiresImmediate true for critical score', () => {
        const clinicalScore = OsaxClinicalScore.fromIndicators({
          ahi: 40,
          odi: 35,
          spo2Nadir: 68,
          spo2Average: 87,
          sleepEfficiency: 70,
          essScore: 20,
        });

        const osaxCase = createMockCase({ clinicalScore });
        const summary = getCaseSeveritySummary(osaxCase);

        expect(summary.requiresImmediate).toBe(true);
      });
    });
  });
});

// Test Helper Functions
function createMockCase(overrides?: Partial<OsaxCase>): OsaxCase {
  const subjectId = OsaxSubjectId.generate(1, 2025);
  const baseCase = createOsaxCase(
    {
      subjectId,
      patientId: 'test-patient-id',
    },
    1
  );

  return {
    ...baseCase,
    ...overrides,
  };
}
