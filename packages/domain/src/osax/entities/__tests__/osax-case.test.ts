/**
 * @fileoverview OSAX Case Entity Tests
 *
 * Tests for the OSAX case entity factory functions and helper utilities.
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
  type OsaxCaseStatus,
  type CreateOsaxCaseInput,
  type OsaxFollowUpRecord,
  type OsaxTreatmentRecord,
  type OsaxPhysicianReview,
} from '../OsaxCase.js';
import { OsaxSubjectId } from '../../value-objects/OsaxSubjectId.js';
import { OsaxClinicalScore } from '../../value-objects/OsaxClinicalScore.js';

// ============================================================================
// HELPERS
// ============================================================================

function createTestIndicators() {
  return {
    ahi: 25,
    odi: 20,
    spo2Nadir: 80,
    spo2Average: 93,
    sleepEfficiency: 82,
    essScore: 12,
  };
}

function createMildIndicators() {
  return {
    ahi: 8,
    odi: 6,
    spo2Nadir: 88,
    spo2Average: 95,
    sleepEfficiency: 85,
    essScore: 8,
  };
}

function createSevereIndicators() {
  return {
    ahi: 45,
    odi: 40,
    spo2Nadir: 70,
    spo2Average: 88,
    sleepEfficiency: 70,
    essScore: 18,
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
// FACTORY FUNCTION TESTS
// ============================================================================

describe('OsaxCase Factory Functions', () => {
  describe('generateCaseNumber', () => {
    it('should generate case number with year and sequence', () => {
      const caseNumber = generateCaseNumber(2025, 1);

      expect(caseNumber).toBe('OSA-2025-00001');
    });

    it('should pad sequence number to 5 digits', () => {
      expect(generateCaseNumber(2025, 42)).toBe('OSA-2025-00042');
      expect(generateCaseNumber(2025, 999)).toBe('OSA-2025-00999');
      expect(generateCaseNumber(2025, 12345)).toBe('OSA-2025-12345');
    });

    it('should handle different years', () => {
      expect(generateCaseNumber(2024, 1)).toBe('OSA-2024-00001');
      expect(generateCaseNumber(2026, 100)).toBe('OSA-2026-00100');
    });

    it('should handle large sequence numbers', () => {
      expect(generateCaseNumber(2025, 99999)).toBe('OSA-2025-99999');
      expect(generateCaseNumber(2025, 100000)).toBe('OSA-2025-100000');
    });
  });

  describe('createOsaxCase', () => {
    it('should create case with minimal input', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
      };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.patientId).toBe('patient-123');
      expect(osaxCase.status).toBe('PENDING_STUDY');
      expect(osaxCase.priority).toBe('NORMAL');
      expect(osaxCase.subjectId).toBe(subjectId);
    });

    it('should create case with custom priority', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
        priority: 'URGENT',
      };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.priority).toBe('URGENT');
    });

    it('should create case with tags', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
        tags: ['pediatric', 'complex'],
      };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.tags).toEqual(['pediatric', 'complex']);
    });

    it('should create case with referring physician', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
        referringPhysicianId: 'doctor-456',
      };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.referringPhysicianId).toBe('doctor-456');
    });

    it('should create case with assigned specialist', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = {
        subjectId,
        patientId: 'patient-123',
        assignedSpecialistId: 'specialist-789',
      };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.assignedSpecialistId).toBe('specialist-789');
    });

    it('should generate unique ID', () => {
      const subjectId1 = OsaxSubjectId.generate(1, 2025);
      const subjectId2 = OsaxSubjectId.generate(2, 2025);
      const input1: CreateOsaxCaseInput = { subjectId: subjectId1, patientId: 'patient-123' };
      const input2: CreateOsaxCaseInput = { subjectId: subjectId2, patientId: 'patient-123' };

      const case1 = createOsaxCase(input1, 1);
      const case2 = createOsaxCase(input2, 2);

      expect(case1.id).not.toBe(case2.id);
    });

    it('should initialize with empty arrays', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = { subjectId, patientId: 'patient-123' };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.scoreHistory).toEqual([]);
      expect(osaxCase.physicianReviews).toEqual([]);
      expect(osaxCase.treatmentHistory).toEqual([]);
      expect(osaxCase.followUps).toEqual([]);
    });

    it('should initialize with version 1', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = { subjectId, patientId: 'patient-123' };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.version).toBe(1);
    });

    it('should initialize with pending consent status', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = { subjectId, patientId: 'patient-123' };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.consentStatus).toBe('PENDING');
    });

    it('should not be deleted', () => {
      const subjectId = OsaxSubjectId.generate(1, 2025);
      const input: CreateOsaxCaseInput = { subjectId, patientId: 'patient-123' };

      const osaxCase = createOsaxCase(input, 1);

      expect(osaxCase.isDeleted).toBe(false);
    });
  });
});

// ============================================================================
// STATUS TRANSITION TESTS
// ============================================================================

describe('Status Transitions', () => {
  describe('isValidStatusTransition', () => {
    it('should allow PENDING_STUDY to STUDY_COMPLETED', () => {
      expect(isValidStatusTransition('PENDING_STUDY', 'STUDY_COMPLETED')).toBe(true);
    });

    it('should allow PENDING_STUDY to CANCELLED', () => {
      expect(isValidStatusTransition('PENDING_STUDY', 'CANCELLED')).toBe(true);
    });

    it('should not allow PENDING_STUDY to SCORED', () => {
      expect(isValidStatusTransition('PENDING_STUDY', 'SCORED')).toBe(false);
    });

    it('should allow STUDY_COMPLETED to SCORED', () => {
      expect(isValidStatusTransition('STUDY_COMPLETED', 'SCORED')).toBe(true);
    });

    it('should allow SCORED to REVIEWED', () => {
      expect(isValidStatusTransition('SCORED', 'REVIEWED')).toBe(true);
    });

    it('should allow REVIEWED to multiple statuses', () => {
      expect(isValidStatusTransition('REVIEWED', 'TREATMENT_PLANNED')).toBe(true);
      expect(isValidStatusTransition('REVIEWED', 'FOLLOW_UP')).toBe(true);
      expect(isValidStatusTransition('REVIEWED', 'CLOSED')).toBe(true);
      expect(isValidStatusTransition('REVIEWED', 'CANCELLED')).toBe(true);
    });

    it('should not allow transitions from CLOSED', () => {
      const statuses: OsaxCaseStatus[] = [
        'PENDING_STUDY',
        'STUDY_COMPLETED',
        'SCORED',
        'REVIEWED',
        'TREATMENT_PLANNED',
        'IN_TREATMENT',
        'FOLLOW_UP',
        'CANCELLED',
      ];

      for (const status of statuses) {
        expect(isValidStatusTransition('CLOSED', status)).toBe(false);
      }
    });

    it('should not allow transitions from CANCELLED', () => {
      const statuses: OsaxCaseStatus[] = [
        'PENDING_STUDY',
        'STUDY_COMPLETED',
        'SCORED',
        'REVIEWED',
        'TREATMENT_PLANNED',
        'IN_TREATMENT',
        'FOLLOW_UP',
        'CLOSED',
      ];

      for (const status of statuses) {
        expect(isValidStatusTransition('CANCELLED', status)).toBe(false);
      }
    });

    it('should follow treatment workflow path', () => {
      // Normal workflow: PENDING_STUDY -> STUDY_COMPLETED -> SCORED -> REVIEWED -> TREATMENT_PLANNED -> IN_TREATMENT -> FOLLOW_UP -> CLOSED
      expect(isValidStatusTransition('PENDING_STUDY', 'STUDY_COMPLETED')).toBe(true);
      expect(isValidStatusTransition('STUDY_COMPLETED', 'SCORED')).toBe(true);
      expect(isValidStatusTransition('SCORED', 'REVIEWED')).toBe(true);
      expect(isValidStatusTransition('REVIEWED', 'TREATMENT_PLANNED')).toBe(true);
      expect(isValidStatusTransition('TREATMENT_PLANNED', 'IN_TREATMENT')).toBe(true);
      expect(isValidStatusTransition('IN_TREATMENT', 'FOLLOW_UP')).toBe(true);
      expect(isValidStatusTransition('FOLLOW_UP', 'CLOSED')).toBe(true);
    });

    it('should allow cycling back from FOLLOW_UP to IN_TREATMENT', () => {
      expect(isValidStatusTransition('FOLLOW_UP', 'IN_TREATMENT')).toBe(true);
    });
  });

  describe('getAllowedNextStatuses', () => {
    it('should return allowed statuses for PENDING_STUDY', () => {
      const allowed = getAllowedNextStatuses('PENDING_STUDY');

      expect(allowed).toContain('STUDY_COMPLETED');
      expect(allowed).toContain('CANCELLED');
      expect(allowed).not.toContain('SCORED');
    });

    it('should return empty array for CLOSED', () => {
      const allowed = getAllowedNextStatuses('CLOSED');

      expect(allowed).toHaveLength(0);
    });

    it('should return empty array for CANCELLED', () => {
      const allowed = getAllowedNextStatuses('CANCELLED');

      expect(allowed).toHaveLength(0);
    });

    it('should return multiple options for REVIEWED', () => {
      const allowed = getAllowedNextStatuses('REVIEWED');

      expect(allowed).toContain('TREATMENT_PLANNED');
      expect(allowed).toContain('FOLLOW_UP');
      expect(allowed).toContain('CLOSED');
      expect(allowed).toContain('CANCELLED');
    });
  });
});

// ============================================================================
// QUERY HELPER TESTS
// ============================================================================

describe('Query Helpers', () => {
  describe('requiresImmediateAttention', () => {
    it('should return true for URGENT priority', () => {
      const osaxCase = createTestCase({ priority: 'URGENT' });

      expect(requiresImmediateAttention(osaxCase)).toBe(true);
    });

    it('should return false for NORMAL priority without clinical score', () => {
      const osaxCase = createTestCase({ priority: 'NORMAL' });

      expect(requiresImmediateAttention(osaxCase)).toBe(false);
    });

    it('should return true for severe cases requiring urgent intervention', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      const osaxCase = createTestCase({
        clinicalScore,
        priority: 'NORMAL',
      });

      // Severe scores should trigger urgent intervention
      expect(clinicalScore.requiresUrgentIntervention()).toBe(true);
      expect(requiresImmediateAttention(osaxCase)).toBe(true);
    });

    it('should return false for mild cases', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createMildIndicators());

      const osaxCase = createTestCase({
        clinicalScore,
        priority: 'NORMAL',
      });

      // Mild scores should not trigger urgent intervention
      expect(clinicalScore.requiresUrgentIntervention()).toBe(false);
    });
  });

  describe('isActiveCase', () => {
    it('should return true for PENDING_STUDY status', () => {
      const osaxCase = createTestCase({ status: 'PENDING_STUDY' });
      expect(isActiveCase(osaxCase)).toBe(true);
    });

    it('should return true for IN_TREATMENT status', () => {
      const osaxCase = createTestCase({ status: 'IN_TREATMENT' });
      expect(isActiveCase(osaxCase)).toBe(true);
    });

    it('should return true for FOLLOW_UP status', () => {
      const osaxCase = createTestCase({ status: 'FOLLOW_UP' });
      expect(isActiveCase(osaxCase)).toBe(true);
    });

    it('should return false for CLOSED status', () => {
      const osaxCase = createTestCase({ status: 'CLOSED' });
      expect(isActiveCase(osaxCase)).toBe(false);
    });

    it('should return false for CANCELLED status', () => {
      const osaxCase = createTestCase({ status: 'CANCELLED' });
      expect(isActiveCase(osaxCase)).toBe(false);
    });

    it('should return false for deleted cases', () => {
      const osaxCase = createTestCase({ status: 'PENDING_STUDY', isDeleted: true });
      expect(isActiveCase(osaxCase)).toBe(false);
    });
  });

  describe('requiresTreatment', () => {
    it('should return false if no clinical score', () => {
      const osaxCase = createTestCase({ clinicalScore: undefined });

      expect(requiresTreatment(osaxCase)).toBe(false);
    });

    it('should return true for moderate severity', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createTestIndicators());

      const osaxCase = createTestCase({ clinicalScore });

      expect(requiresTreatment(osaxCase)).toBe(true);
    });

    it('should return true for severe severity', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      const osaxCase = createTestCase({ clinicalScore });

      expect(requiresTreatment(osaxCase)).toBe(true);
    });

    it('should return true for mild severity (AHI >= 5)', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createMildIndicators());

      const osaxCase = createTestCase({ clinicalScore });

      // Mild cases still have OSA and may require treatment
      expect(clinicalScore.hasOSA()).toBe(true);
      expect(requiresTreatment(osaxCase)).toBe(true);
    });
  });

  describe('isReadyForTreatment', () => {
    it('should return true when all conditions met', () => {
      const osaxCase = createTestCase({
        status: 'TREATMENT_PLANNED',
        reviewStatus: 'APPROVED',
        consentStatus: 'OBTAINED',
        activeTreatment: undefined,
      });

      expect(isReadyForTreatment(osaxCase)).toBe(true);
    });

    it('should return false if not in TREATMENT_PLANNED status', () => {
      const osaxCase = createTestCase({
        status: 'REVIEWED',
        reviewStatus: 'APPROVED',
        consentStatus: 'OBTAINED',
        activeTreatment: undefined,
      });

      expect(isReadyForTreatment(osaxCase)).toBe(false);
    });

    it('should return false if review not approved', () => {
      const osaxCase = createTestCase({
        status: 'TREATMENT_PLANNED',
        reviewStatus: 'PENDING',
        consentStatus: 'OBTAINED',
        activeTreatment: undefined,
      });

      expect(isReadyForTreatment(osaxCase)).toBe(false);
    });

    it('should return false if consent not obtained', () => {
      const osaxCase = createTestCase({
        status: 'TREATMENT_PLANNED',
        reviewStatus: 'APPROVED',
        consentStatus: 'PENDING',
        activeTreatment: undefined,
      });

      expect(isReadyForTreatment(osaxCase)).toBe(false);
    });

    it('should return false if already has active treatment', () => {
      const activeTreatment: OsaxTreatmentRecord = {
        type: 'CPAP_THERAPY',
        startDate: new Date(),
        status: 'INITIATED',
      };

      const osaxCase = createTestCase({
        status: 'TREATMENT_PLANNED',
        reviewStatus: 'APPROVED',
        consentStatus: 'OBTAINED',
        activeTreatment,
      });

      expect(isReadyForTreatment(osaxCase)).toBe(false);
    });
  });

  describe('calculateCaseProgress', () => {
    it('should return 10 for PENDING_STUDY', () => {
      const osaxCase = createTestCase({ status: 'PENDING_STUDY' });
      expect(calculateCaseProgress(osaxCase)).toBe(10);
    });

    it('should return 25 for STUDY_COMPLETED', () => {
      const osaxCase = createTestCase({ status: 'STUDY_COMPLETED' });
      expect(calculateCaseProgress(osaxCase)).toBe(25);
    });

    it('should return 40 for SCORED', () => {
      const osaxCase = createTestCase({ status: 'SCORED' });
      expect(calculateCaseProgress(osaxCase)).toBe(40);
    });

    it('should return 55 for REVIEWED', () => {
      const osaxCase = createTestCase({ status: 'REVIEWED' });
      expect(calculateCaseProgress(osaxCase)).toBe(55);
    });

    it('should return 70 for TREATMENT_PLANNED', () => {
      const osaxCase = createTestCase({ status: 'TREATMENT_PLANNED' });
      expect(calculateCaseProgress(osaxCase)).toBe(70);
    });

    it('should return 85 for IN_TREATMENT', () => {
      const osaxCase = createTestCase({ status: 'IN_TREATMENT' });
      expect(calculateCaseProgress(osaxCase)).toBe(85);
    });

    it('should return 90 for FOLLOW_UP', () => {
      const osaxCase = createTestCase({ status: 'FOLLOW_UP' });
      expect(calculateCaseProgress(osaxCase)).toBe(90);
    });

    it('should return 100 for CLOSED', () => {
      const osaxCase = createTestCase({ status: 'CLOSED' });
      expect(calculateCaseProgress(osaxCase)).toBe(100);
    });

    it('should return 0 for CANCELLED', () => {
      const osaxCase = createTestCase({ status: 'CANCELLED' });
      expect(calculateCaseProgress(osaxCase)).toBe(0);
    });
  });

  describe('getCaseSeveritySummary', () => {
    it('should return UNKNOWN severity if no clinical score', () => {
      const osaxCase = createTestCase({ clinicalScore: undefined });

      const summary = getCaseSeveritySummary(osaxCase);

      expect(summary.severity).toBe('UNKNOWN');
      expect(summary.ahi).toBeNull();
    });

    it('should return severity based on URGENT priority if no score', () => {
      const osaxCase = createTestCase({
        clinicalScore: undefined,
        priority: 'URGENT',
      });

      const summary = getCaseSeveritySummary(osaxCase);

      expect(summary.requiresImmediate).toBe(true);
    });

    it('should return severity summary when has clinical score', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createTestIndicators());

      const osaxCase = createTestCase({ clinicalScore });

      const summary = getCaseSeveritySummary(osaxCase);

      expect(summary.severity).not.toBe('UNKNOWN');
      expect(summary.ahi).toBe(25);
    });

    it('should detect MODERATE severity', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createTestIndicators());

      const osaxCase = createTestCase({ clinicalScore });

      const summary = getCaseSeveritySummary(osaxCase);

      expect(summary.severity).toBe('MODERATE');
    });

    it('should detect SEVERE severity', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createSevereIndicators());

      const osaxCase = createTestCase({ clinicalScore });

      const summary = getCaseSeveritySummary(osaxCase);

      expect(summary.severity).toBe('SEVERE');
      expect(summary.requiresImmediate).toBe(true);
    });

    it('should detect MILD severity', () => {
      const clinicalScore = OsaxClinicalScore.fromIndicators(createMildIndicators());

      const osaxCase = createTestCase({ clinicalScore });

      const summary = getCaseSeveritySummary(osaxCase);

      expect(summary.severity).toBe('MILD');
    });
  });
});
