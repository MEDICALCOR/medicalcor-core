/**
 * @fileoverview AllOnX Case Entity Tests
 *
 * Tests for the AllOnX case entity factory functions and helper utilities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createAllOnXCase,
  generateCaseNumber,
  isValidStatusTransition,
  getAllowedNextStatuses,
  requiresImmediateAttention,
  isActiveCase,
  isReadyForSurgery,
  needsAssessment,
  requiresBoneAugmentation,
  calculateCaseProgress,
  getCaseSummary,
  getDaysSinceCreation,
  isOverdueForFollowUp,
  getNextFollowUp,
  getImplantCount,
  getExpectedImplantCount,
  areAllImplantsPlaced,
  getEligibilitySummary,
  type AllOnXCase,
  type AllOnXCaseStatus,
  type CreateAllOnXCaseInput,
  type ImagingRecord,
  type TreatmentPhaseRecord,
  type ConsultationRecord,
  type ImplantRecord,
  type FollowUpRecord,
  type PhysicianReviewRecord,
} from '../AllOnXCase.js';
import { AllOnXClinicalScore } from '../../value-objects/AllOnXClinicalScore.js';

// ============================================================================
// HELPERS
// ============================================================================

function createTestIndicators() {
  return {
    boneDensity: 2,
    maxillaBoneHeight: 12,
    mandibleBoneHeight: 15,
    boneWidth: 8,
    smokingStatus: 0,
    onBisphosphonates: false,
    onAnticoagulants: false,
    hasOsteoporosis: false,
    hasRadiationHistory: false,
    hasUncontrolledCardiovascular: false,
    isImmunocompromised: false,
    remainingTeeth: 8,
    periodontalDisease: 1,
    oralHygieneScore: 3,
    hasBruxism: false,
    targetArch: 1,
    extractionsNeeded: 8,
    needsBoneGrafting: false,
    needsSinusLift: false,
    immediateLoadingFeasibility: 4,
    patientAge: 55,
    asaClassification: 2,
    complianceScore: 4,
    estheticDemands: 3,
    functionalDemands: 4,
  };
}

function createTestCase(overrides: Partial<AllOnXCase> = {}): AllOnXCase {
  const now = new Date();
  return {
    id: 'case-123',
    caseNumber: 'AOX-12345-ABCD',
    patientId: 'patient-456',
    status: 'INTAKE',
    priority: 'MEDIUM',
    clinicalScore: null,
    indicators: null,
    recommendedProcedure: null,
    targetArch: null,
    estimatedDuration: null,
    imagingRecords: [],
    treatmentPhases: [],
    consultations: [],
    implants: [],
    followUps: [],
    physicianReviews: [],
    assignedClinicianId: null,
    assignedProsthodontistId: null,
    createdAt: now,
    updatedAt: now,
    assessmentCompletedAt: null,
    surgeryScheduledFor: null,
    surgeryCompletedAt: null,
    prosthesisDeliveredAt: null,
    consentObtained: false,
    consentObtainedAt: null,
    informedConsentDocumentId: null,
    clinicalNotes: null,
    internalNotes: null,
    ...overrides,
  };
}

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('AllOnXCase Factory Functions', () => {
  describe('generateCaseNumber', () => {
    it('should generate case number with default prefix', () => {
      const caseNumber = generateCaseNumber();

      expect(caseNumber).toMatch(/^AOX-[A-Z0-9]+-[A-Z0-9]+$/);
    });

    it('should generate case number with custom prefix', () => {
      const caseNumber = generateCaseNumber('TEST');

      expect(caseNumber).toMatch(/^TEST-[A-Z0-9]+-[A-Z0-9]+$/);
    });

    it('should generate unique case numbers', () => {
      const caseNumbers = new Set<string>();

      for (let i = 0; i < 100; i++) {
        caseNumbers.add(generateCaseNumber());
      }

      expect(caseNumbers.size).toBe(100);
    });

    it('should generate case number with empty prefix', () => {
      const caseNumber = generateCaseNumber('');

      expect(caseNumber).toMatch(/^-[A-Z0-9]+-[A-Z0-9]+$/);
    });
  });

  describe('createAllOnXCase', () => {
    it('should create case with minimal input', () => {
      const input: CreateAllOnXCaseInput = {
        patientId: 'patient-123',
      };

      const caseEntity = createAllOnXCase(input);

      expect(caseEntity.patientId).toBe('patient-123');
      expect(caseEntity.status).toBe('INTAKE');
      expect(caseEntity.priority).toBe('MEDIUM');
    });

    it('should create case with assigned clinician', () => {
      const input: CreateAllOnXCaseInput = {
        patientId: 'patient-123',
        assignedClinicianId: 'clinician-456',
      };

      const caseEntity = createAllOnXCase(input);

      expect(caseEntity.assignedClinicianId).toBe('clinician-456');
    });

    it('should create case with target arch', () => {
      const input: CreateAllOnXCaseInput = {
        patientId: 'patient-123',
        targetArch: 'BOTH',
      };

      const caseEntity = createAllOnXCase(input);

      expect(caseEntity.targetArch).toBe('BOTH');
    });

    it('should create case with custom priority', () => {
      const input: CreateAllOnXCaseInput = {
        patientId: 'patient-123',
        priority: 'URGENT',
      };

      const caseEntity = createAllOnXCase(input);

      expect(caseEntity.priority).toBe('URGENT');
    });

    it('should create case with clinical notes', () => {
      const input: CreateAllOnXCaseInput = {
        patientId: 'patient-123',
        clinicalNotes: 'Initial consultation notes',
      };

      const caseEntity = createAllOnXCase(input);

      expect(caseEntity.clinicalNotes).toBe('Initial consultation notes');
    });

    it('should generate unique ID', () => {
      const input: CreateAllOnXCaseInput = { patientId: 'patient-123' };

      const case1 = createAllOnXCase(input);
      const case2 = createAllOnXCase(input);

      expect(case1.id).not.toBe(case2.id);
    });

    it('should generate unique case number', () => {
      const input: CreateAllOnXCaseInput = { patientId: 'patient-123' };

      const case1 = createAllOnXCase(input);
      const case2 = createAllOnXCase(input);

      expect(case1.caseNumber).not.toBe(case2.caseNumber);
    });

    it('should initialize with empty arrays', () => {
      const input: CreateAllOnXCaseInput = { patientId: 'patient-123' };

      const caseEntity = createAllOnXCase(input);

      expect(caseEntity.imagingRecords).toEqual([]);
      expect(caseEntity.treatmentPhases).toEqual([]);
      expect(caseEntity.consultations).toEqual([]);
      expect(caseEntity.implants).toEqual([]);
      expect(caseEntity.followUps).toEqual([]);
      expect(caseEntity.physicianReviews).toEqual([]);
    });

    it('should initialize with null values for optional fields', () => {
      const input: CreateAllOnXCaseInput = { patientId: 'patient-123' };

      const caseEntity = createAllOnXCase(input);

      expect(caseEntity.clinicalScore).toBeNull();
      expect(caseEntity.indicators).toBeNull();
      expect(caseEntity.recommendedProcedure).toBeNull();
      expect(caseEntity.estimatedDuration).toBeNull();
    });

    it('should set consent as not obtained', () => {
      const input: CreateAllOnXCaseInput = { patientId: 'patient-123' };

      const caseEntity = createAllOnXCase(input);

      expect(caseEntity.consentObtained).toBe(false);
      expect(caseEntity.consentObtainedAt).toBeNull();
      expect(caseEntity.informedConsentDocumentId).toBeNull();
    });

    it('should be frozen (immutable)', () => {
      const input: CreateAllOnXCaseInput = { patientId: 'patient-123' };

      const caseEntity = createAllOnXCase(input);

      expect(Object.isFrozen(caseEntity)).toBe(true);
    });
  });
});

// ============================================================================
// STATUS TRANSITION TESTS
// ============================================================================

describe('Status Transitions', () => {
  describe('isValidStatusTransition', () => {
    it('should allow INTAKE to ASSESSMENT', () => {
      expect(isValidStatusTransition('INTAKE', 'ASSESSMENT')).toBe(true);
    });

    it('should allow INTAKE to CANCELLED', () => {
      expect(isValidStatusTransition('INTAKE', 'CANCELLED')).toBe(true);
    });

    it('should not allow INTAKE to SURGICAL_PHASE', () => {
      expect(isValidStatusTransition('INTAKE', 'SURGICAL_PHASE')).toBe(false);
    });

    it('should allow ASSESSMENT to multiple statuses', () => {
      expect(isValidStatusTransition('ASSESSMENT', 'PLANNING')).toBe(true);
      expect(isValidStatusTransition('ASSESSMENT', 'INTAKE')).toBe(true);
      expect(isValidStatusTransition('ASSESSMENT', 'ON_HOLD')).toBe(true);
      expect(isValidStatusTransition('ASSESSMENT', 'CANCELLED')).toBe(true);
    });

    it('should not allow transitions from CANCELLED', () => {
      const statuses: AllOnXCaseStatus[] = [
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
      ];

      for (const status of statuses) {
        expect(isValidStatusTransition('CANCELLED', status)).toBe(false);
      }
    });

    it('should allow ON_HOLD to return to many statuses', () => {
      expect(isValidStatusTransition('ON_HOLD', 'INTAKE')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'ASSESSMENT')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'PLANNING')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'PRE_TREATMENT')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'SURGICAL_PHASE')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'HEALING')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'PROSTHETIC_PHASE')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'CANCELLED')).toBe(true);
    });

    it('should allow COMPLETED to FOLLOW_UP', () => {
      expect(isValidStatusTransition('COMPLETED', 'FOLLOW_UP')).toBe(true);
    });

    it('should not allow COMPLETED to INTAKE', () => {
      expect(isValidStatusTransition('COMPLETED', 'INTAKE')).toBe(false);
    });

    it('should follow surgical workflow path', () => {
      // Normal workflow: INTAKE -> ASSESSMENT -> PLANNING -> PRE_TREATMENT -> SURGICAL_PHASE -> HEALING -> PROSTHETIC_PHASE -> COMPLETED
      expect(isValidStatusTransition('INTAKE', 'ASSESSMENT')).toBe(true);
      expect(isValidStatusTransition('ASSESSMENT', 'PLANNING')).toBe(true);
      expect(isValidStatusTransition('PLANNING', 'PRE_TREATMENT')).toBe(true);
      expect(isValidStatusTransition('PRE_TREATMENT', 'SURGICAL_PHASE')).toBe(true);
      expect(isValidStatusTransition('SURGICAL_PHASE', 'HEALING')).toBe(true);
      expect(isValidStatusTransition('HEALING', 'PROSTHETIC_PHASE')).toBe(true);
      expect(isValidStatusTransition('PROSTHETIC_PHASE', 'COMPLETED')).toBe(true);
    });
  });

  describe('getAllowedNextStatuses', () => {
    it('should return allowed statuses for INTAKE', () => {
      const allowed = getAllowedNextStatuses('INTAKE');

      expect(allowed).toContain('ASSESSMENT');
      expect(allowed).toContain('CANCELLED');
      expect(allowed).not.toContain('SURGICAL_PHASE');
    });

    it('should return empty array for CANCELLED', () => {
      const allowed = getAllowedNextStatuses('CANCELLED');

      expect(allowed).toHaveLength(0);
    });

    it('should return multiple options for ON_HOLD', () => {
      const allowed = getAllowedNextStatuses('ON_HOLD');

      expect(allowed.length).toBeGreaterThan(5);
    });

    it('should return only FOLLOW_UP for COMPLETED', () => {
      const allowed = getAllowedNextStatuses('COMPLETED');

      expect(allowed).toEqual(['FOLLOW_UP']);
    });
  });
});

// ============================================================================
// QUERY HELPER TESTS
// ============================================================================

describe('Query Helpers', () => {
  describe('requiresImmediateAttention', () => {
    it('should return true for URGENT priority', () => {
      const caseEntity = createTestCase({ priority: 'URGENT' });

      expect(requiresImmediateAttention(caseEntity)).toBe(true);
    });

    it('should return true for CRITICAL risk level', () => {
      // Need enough risk factors to reach CRITICAL (60+ risk score)
      const clinicalScore = AllOnXClinicalScore.fromIndicators({
        ...createTestIndicators(),
        smokingStatus: 4, // +20 risk score
        hba1c: 10, // +25 risk score
        onBisphosphonates: true, // +20 risk score
        oralHygieneScore: 1, // +15 risk score (total: 80 = CRITICAL)
      });

      const caseEntity = createTestCase({ clinicalScore });

      expect(caseEntity.clinicalScore?.riskLevel).toBe('CRITICAL');
      expect(requiresImmediateAttention(caseEntity)).toBe(true);
    });

    it('should return true for surgery scheduled within 7 days', () => {
      const surgeryDate = new Date();
      surgeryDate.setDate(surgeryDate.getDate() + 5);

      const caseEntity = createTestCase({ surgeryScheduledFor: surgeryDate });

      expect(requiresImmediateAttention(caseEntity)).toBe(true);
    });

    it('should return false for surgery scheduled more than 7 days', () => {
      const surgeryDate = new Date();
      surgeryDate.setDate(surgeryDate.getDate() + 10);

      const caseEntity = createTestCase({ surgeryScheduledFor: surgeryDate });

      expect(requiresImmediateAttention(caseEntity)).toBe(false);
    });

    it('should return false for non-urgent case', () => {
      const caseEntity = createTestCase({ priority: 'MEDIUM' });

      expect(requiresImmediateAttention(caseEntity)).toBe(false);
    });
  });

  describe('isActiveCase', () => {
    it('should return true for INTAKE status', () => {
      const caseEntity = createTestCase({ status: 'INTAKE' });
      expect(isActiveCase(caseEntity)).toBe(true);
    });

    it('should return true for SURGICAL_PHASE status', () => {
      const caseEntity = createTestCase({ status: 'SURGICAL_PHASE' });
      expect(isActiveCase(caseEntity)).toBe(true);
    });

    it('should return false for COMPLETED status', () => {
      const caseEntity = createTestCase({ status: 'COMPLETED' });
      expect(isActiveCase(caseEntity)).toBe(false);
    });

    it('should return false for CANCELLED status', () => {
      const caseEntity = createTestCase({ status: 'CANCELLED' });
      expect(isActiveCase(caseEntity)).toBe(false);
    });

    it('should return false for ON_HOLD status', () => {
      const caseEntity = createTestCase({ status: 'ON_HOLD' });
      expect(isActiveCase(caseEntity)).toBe(false);
    });
  });

  describe('isReadyForSurgery', () => {
    it('should return true when all conditions met', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({
        status: 'SURGICAL_PHASE',
        consentObtained: true,
        clinicalScore,
        assignedClinicianId: 'clinician-123',
      });

      expect(isReadyForSurgery(caseEntity)).toBe(true);
    });

    it('should return false if not in SURGICAL_PHASE', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({
        status: 'PLANNING',
        consentObtained: true,
        clinicalScore,
        assignedClinicianId: 'clinician-123',
      });

      expect(isReadyForSurgery(caseEntity)).toBe(false);
    });

    it('should return false if consent not obtained', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({
        status: 'SURGICAL_PHASE',
        consentObtained: false,
        clinicalScore,
        assignedClinicianId: 'clinician-123',
      });

      expect(isReadyForSurgery(caseEntity)).toBe(false);
    });

    it('should return false if no clinical score', () => {
      const caseEntity = createTestCase({
        status: 'SURGICAL_PHASE',
        consentObtained: true,
        clinicalScore: null,
        assignedClinicianId: 'clinician-123',
      });

      expect(isReadyForSurgery(caseEntity)).toBe(false);
    });

    it('should return false if no assigned clinician', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({
        status: 'SURGICAL_PHASE',
        consentObtained: true,
        clinicalScore,
        assignedClinicianId: null,
      });

      expect(isReadyForSurgery(caseEntity)).toBe(false);
    });
  });

  describe('needsAssessment', () => {
    it('should return true for INTAKE status', () => {
      const caseEntity = createTestCase({ status: 'INTAKE' });
      expect(needsAssessment(caseEntity)).toBe(true);
    });

    it('should return true if no clinical score', () => {
      const caseEntity = createTestCase({
        status: 'ASSESSMENT',
        clinicalScore: null,
      });
      expect(needsAssessment(caseEntity)).toBe(true);
    });

    it('should return false if has clinical score and not INTAKE', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({
        status: 'PLANNING',
        clinicalScore,
      });

      expect(needsAssessment(caseEntity)).toBe(false);
    });
  });

  describe('requiresBoneAugmentation', () => {
    it('should return true when clinical score requires bone augmentation', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators({
        ...createTestIndicators(),
        needsBoneGrafting: true,
      });

      const caseEntity = createTestCase({ clinicalScore });

      expect(requiresBoneAugmentation(caseEntity)).toBe(true);
    });

    it('should return false when no bone augmentation needed', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({ clinicalScore });

      expect(requiresBoneAugmentation(caseEntity)).toBe(false);
    });

    it('should return false when no clinical score', () => {
      const caseEntity = createTestCase({ clinicalScore: null });

      expect(requiresBoneAugmentation(caseEntity)).toBe(false);
    });
  });

  describe('calculateCaseProgress', () => {
    it('should return 5 for INTAKE', () => {
      const caseEntity = createTestCase({ status: 'INTAKE' });
      expect(calculateCaseProgress(caseEntity)).toBe(5);
    });

    it('should return 60 for SURGICAL_PHASE', () => {
      const caseEntity = createTestCase({ status: 'SURGICAL_PHASE' });
      expect(calculateCaseProgress(caseEntity)).toBe(60);
    });

    it('should return 100 for COMPLETED', () => {
      const caseEntity = createTestCase({ status: 'COMPLETED' });
      expect(calculateCaseProgress(caseEntity)).toBe(100);
    });

    it('should return 100 for FOLLOW_UP', () => {
      const caseEntity = createTestCase({ status: 'FOLLOW_UP' });
      expect(calculateCaseProgress(caseEntity)).toBe(100);
    });

    it('should return -1 for ON_HOLD', () => {
      const caseEntity = createTestCase({ status: 'ON_HOLD' });
      expect(calculateCaseProgress(caseEntity)).toBe(-1);
    });

    it('should return -1 for CANCELLED', () => {
      const caseEntity = createTestCase({ status: 'CANCELLED' });
      expect(calculateCaseProgress(caseEntity)).toBe(-1);
    });
  });

  describe('getCaseSummary', () => {
    it('should return basic summary without clinical score', () => {
      const caseEntity = createTestCase({
        caseNumber: 'AOX-123',
        status: 'INTAKE',
      });

      const summary = getCaseSummary(caseEntity);

      expect(summary).toContain('Case AOX-123');
      expect(summary).toContain('Status: INTAKE');
    });

    it('should include eligibility and risk when has clinical score', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({
        caseNumber: 'AOX-456',
        status: 'PLANNING',
        clinicalScore,
      });

      const summary = getCaseSummary(caseEntity);

      expect(summary).toContain('Case AOX-456');
      expect(summary).toContain('Eligibility:');
      expect(summary).toContain('Risk:');
    });

    it('should include procedure when recommended', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({
        caseNumber: 'AOX-789',
        status: 'PLANNING',
        clinicalScore,
        recommendedProcedure: 'ALL_ON_4',
      });

      const summary = getCaseSummary(caseEntity);

      expect(summary).toContain('Procedure: ALL ON 4');
    });
  });

  describe('getDaysSinceCreation', () => {
    it('should return 0 for case created today', () => {
      const caseEntity = createTestCase({ createdAt: new Date() });

      expect(getDaysSinceCreation(caseEntity)).toBe(0);
    });

    it('should return correct days for older case', () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 10);

      const caseEntity = createTestCase({ createdAt });

      expect(getDaysSinceCreation(caseEntity)).toBe(10);
    });
  });

  describe('isOverdueForFollowUp', () => {
    it('should return false for CANCELLED status', () => {
      const caseEntity = createTestCase({ status: 'CANCELLED' });

      expect(isOverdueForFollowUp(caseEntity)).toBe(false);
    });

    it('should return false with no follow-ups', () => {
      const caseEntity = createTestCase({ followUps: [] });

      expect(isOverdueForFollowUp(caseEntity)).toBe(false);
    });

    it('should return true with overdue follow-up', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const followUps: FollowUpRecord[] = [
        {
          id: 'followup-1',
          scheduledFor: pastDate,
          type: 'ROUTINE',
        },
      ];

      const caseEntity = createTestCase({ followUps });

      expect(isOverdueForFollowUp(caseEntity)).toBe(true);
    });

    it('should return false when follow-up is completed', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const followUps: FollowUpRecord[] = [
        {
          id: 'followup-1',
          scheduledFor: pastDate,
          completedAt: new Date(),
          type: 'ROUTINE',
        },
      ];

      const caseEntity = createTestCase({ followUps });

      expect(isOverdueForFollowUp(caseEntity)).toBe(false);
    });
  });

  describe('getNextFollowUp', () => {
    it('should return null with no follow-ups', () => {
      const caseEntity = createTestCase({ followUps: [] });

      expect(getNextFollowUp(caseEntity)).toBeNull();
    });

    it('should return next scheduled follow-up', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const followUps: FollowUpRecord[] = [
        {
          id: 'followup-1',
          scheduledFor: futureDate,
          type: 'HEALING_CHECK',
        },
      ];

      const caseEntity = createTestCase({ followUps });

      const next = getNextFollowUp(caseEntity);

      expect(next).not.toBeNull();
      expect(next?.id).toBe('followup-1');
    });

    it('should return earliest upcoming follow-up', () => {
      const date1 = new Date();
      date1.setDate(date1.getDate() + 7);

      const date2 = new Date();
      date2.setDate(date2.getDate() + 3);

      const followUps: FollowUpRecord[] = [
        {
          id: 'followup-1',
          scheduledFor: date1,
          type: 'ROUTINE',
        },
        {
          id: 'followup-2',
          scheduledFor: date2,
          type: 'HEALING_CHECK',
        },
      ];

      const caseEntity = createTestCase({ followUps });

      const next = getNextFollowUp(caseEntity);

      expect(next?.id).toBe('followup-2');
    });

    it('should not return completed follow-ups', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const followUps: FollowUpRecord[] = [
        {
          id: 'followup-1',
          scheduledFor: futureDate,
          completedAt: new Date(),
          type: 'ROUTINE',
        },
      ];

      const caseEntity = createTestCase({ followUps });

      expect(getNextFollowUp(caseEntity)).toBeNull();
    });
  });

  describe('getImplantCount', () => {
    it('should return 0 with no implants', () => {
      const caseEntity = createTestCase({ implants: [] });

      expect(getImplantCount(caseEntity)).toBe(0);
    });

    it('should return correct count of implants', () => {
      const implants: ImplantRecord[] = [
        {
          id: 'impl-1',
          position: '11',
          brand: 'Nobel',
          model: 'Active',
          diameter: 4.3,
          length: 13,
          placedAt: new Date(),
          insertionTorque: 35,
          primaryStability: 'HIGH',
        },
        {
          id: 'impl-2',
          position: '14',
          brand: 'Nobel',
          model: 'Active',
          diameter: 4.3,
          length: 13,
          placedAt: new Date(),
          insertionTorque: 40,
          primaryStability: 'HIGH',
        },
      ];

      const caseEntity = createTestCase({ implants });

      expect(getImplantCount(caseEntity)).toBe(2);
    });
  });

  describe('getExpectedImplantCount', () => {
    it('should return 0 when no procedure recommended', () => {
      const caseEntity = createTestCase({ recommendedProcedure: null });

      expect(getExpectedImplantCount(caseEntity)).toBe(0);
    });

    it('should return 4 for ALL_ON_4 single arch', () => {
      const caseEntity = createTestCase({
        recommendedProcedure: 'ALL_ON_4',
        targetArch: 'MAXILLA',
      });

      expect(getExpectedImplantCount(caseEntity)).toBe(4);
    });

    it('should return 8 for ALL_ON_4 both arches', () => {
      const caseEntity = createTestCase({
        recommendedProcedure: 'ALL_ON_4',
        targetArch: 'BOTH',
      });

      expect(getExpectedImplantCount(caseEntity)).toBe(8);
    });

    it('should return 6 for ALL_ON_6 single arch', () => {
      const caseEntity = createTestCase({
        recommendedProcedure: 'ALL_ON_6',
        targetArch: 'MANDIBLE',
      });

      expect(getExpectedImplantCount(caseEntity)).toBe(6);
    });

    it('should return 12 for ALL_ON_6 both arches', () => {
      const caseEntity = createTestCase({
        recommendedProcedure: 'ALL_ON_6',
        targetArch: 'BOTH',
      });

      expect(getExpectedImplantCount(caseEntity)).toBe(12);
    });

    it('should return 5 for ALL_ON_X_HYBRID single arch', () => {
      const caseEntity = createTestCase({
        recommendedProcedure: 'ALL_ON_X_HYBRID',
        targetArch: 'MAXILLA',
      });

      expect(getExpectedImplantCount(caseEntity)).toBe(5);
    });
  });

  describe('areAllImplantsPlaced', () => {
    it('should return false when no procedure recommended', () => {
      const caseEntity = createTestCase({ recommendedProcedure: null });

      expect(areAllImplantsPlaced(caseEntity)).toBe(false);
    });

    it('should return false when not enough implants', () => {
      const implants: ImplantRecord[] = [
        {
          id: 'impl-1',
          position: '11',
          brand: 'Nobel',
          model: 'Active',
          diameter: 4.3,
          length: 13,
          placedAt: new Date(),
          insertionTorque: 35,
          primaryStability: 'HIGH',
        },
      ];

      const caseEntity = createTestCase({
        recommendedProcedure: 'ALL_ON_4',
        targetArch: 'MAXILLA',
        implants,
      });

      expect(areAllImplantsPlaced(caseEntity)).toBe(false);
    });

    it('should return true when all implants placed', () => {
      const implants: ImplantRecord[] = Array(4)
        .fill(null)
        .map((_, i) => ({
          id: `impl-${i}`,
          position: `1${i + 1}`,
          brand: 'Nobel',
          model: 'Active',
          diameter: 4.3,
          length: 13,
          placedAt: new Date(),
          insertionTorque: 35,
          primaryStability: 'HIGH' as const,
        }));

      const caseEntity = createTestCase({
        recommendedProcedure: 'ALL_ON_4',
        targetArch: 'MAXILLA',
        implants,
      });

      expect(areAllImplantsPlaced(caseEntity)).toBe(true);
    });
  });

  describe('getEligibilitySummary', () => {
    it('should return null values when no clinical score', () => {
      const caseEntity = createTestCase({ clinicalScore: null });

      const summary = getEligibilitySummary(caseEntity);

      expect(summary.eligibility).toBeNull();
      expect(summary.riskLevel).toBeNull();
      expect(summary.complexity).toBeNull();
      expect(summary.recommendation).toBeNull();
      expect(summary.riskFactors).toEqual([]);
    });

    it('should return eligibility summary when has clinical score', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators(createTestIndicators());

      const caseEntity = createTestCase({ clinicalScore });

      const summary = getEligibilitySummary(caseEntity);

      expect(summary.eligibility).not.toBeNull();
      expect(summary.riskLevel).not.toBeNull();
      expect(summary.complexity).not.toBeNull();
      expect(summary.recommendation).not.toBeNull();
    });

    it('should include risk factors when present', () => {
      const clinicalScore = AllOnXClinicalScore.fromIndicators({
        ...createTestIndicators(),
        smokingStatus: 3,
        hba1c: 8.5,
      });

      const caseEntity = createTestCase({ clinicalScore });

      const summary = getEligibilitySummary(caseEntity);

      expect(summary.riskFactors.length).toBeGreaterThan(0);
    });
  });
});
