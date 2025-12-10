/**
 * @fileoverview Treatment Journey Tests
 *
 * Comprehensive tests for the Treatment Journey aggregate root.
 * Covers journey creation, phase transitions, milestone management,
 * risk tracking, communications, outcomes, and financials.
 *
 * @module domain/treatment-journey/__tests__/treatment-journey
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  createTreatmentJourney,
  generateJourneyNumber,
  advanceToPhase,
  completeMilestone,
  scheduleMilestone,
  recordCommunication,
  raiseRiskFlag,
  resolveRiskFlag,
  recordOutcome,
  updateFinancials,
  recordPayment,
  linkLabCase,
  linkAppointment,
  isJourneyAtRisk,
  hasOverdueMilestones,
  needsFollowUp,
  getCompletedMilestoneCount,
  getMilestonesByPhase,
  getJourneySummary,
  type TreatmentJourney,
  type JourneyPhase,
  type MilestoneType,
  type CreateTreatmentJourneyInput,
} from '../entities/TreatmentJourney.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createDefaultInput = (
  overrides: Partial<CreateTreatmentJourneyInput> = {}
): CreateTreatmentJourneyInput => ({
  patientId: 'patient-001',
  clinicId: 'clinic-001',
  treatmentType: 'ALL_ON_4',
  primaryDentistId: 'dentist-001',
  estimatedCompletionDate: new Date('2025-06-01'),
  financialEstimate: 15000,
  ...overrides,
});

// =============================================================================
// TEST SUITE
// =============================================================================

describe('TreatmentJourney', () => {
  // ===========================================================================
  // JOURNEY CREATION
  // ===========================================================================

  describe('createTreatmentJourney', () => {
    it('should create journey with required fields', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');

      expect(journey.id).toBeDefined();
      expect(journey.journeyNumber).toMatch(/^TJ-\d{4}-\d{6}$/);
      expect(journey.patientId).toBe('patient-001');
      expect(journey.clinicId).toBe('clinic-001');
      expect(journey.treatmentType).toBe('ALL_ON_4');
      expect(journey.primaryDentistId).toBe('dentist-001');
    });

    it('should set default values', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');

      expect(journey.status).toBe('ACTIVE');
      expect(journey.currentPhase).toBe('INQUIRY');
      expect(journey.progressPercent).toBe(5);
      expect(journey.complexity).toBe('MODERATE');
      expect(journey.preferredChannel).toBe('WHATSAPP');
      expect(journey.riskLevel).toBe('LOW');
      expect(journey.activeRiskCount).toBe(0);
    });

    it('should create initial milestone', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');

      expect(journey.milestones).toHaveLength(1);
      expect(journey.milestones[0].type).toBe('FIRST_CONTACT');
      expect(journey.milestones[0].phase).toBe('INQUIRY');
      expect(journey.milestones[0].completedAt).toBeDefined();
      expect(journey.milestones[0].completedBy).toBe('user-001');
    });

    it('should set next milestone', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      expect(journey.nextMilestone).toBe('LEAD_QUALIFIED');
    });

    it('should initialize financials correctly', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');

      expect(journey.financials.totalEstimate).toBe(15000);
      expect(journey.financials.totalPaid).toBe(0);
      expect(journey.financials.outstandingBalance).toBe(15000);
      expect(journey.financials.currency).toBe('RON');
      expect(journey.financials.paymentPlanActive).toBe(false);
    });

    it('should accept optional fields', () => {
      const journey = createTreatmentJourney(
        createDefaultInput({
          complexity: 'HIGHLY_COMPLEX',
          surgeonId: 'surgeon-001',
          prosthodontistId: 'prostho-001',
          preferredChannel: 'EMAIL',
          currency: 'EUR',
          allOnXCaseId: 'aox-001',
        }),
        'user-001'
      );

      expect(journey.complexity).toBe('HIGHLY_COMPLEX');
      expect(journey.surgeonId).toBe('surgeon-001');
      expect(journey.prosthodontistId).toBe('prostho-001');
      expect(journey.preferredChannel).toBe('EMAIL');
      expect(journey.financials.currency).toBe('EUR');
      expect(journey.allOnXCaseId).toBe('aox-001');
    });

    it('should set timestamps', () => {
      const before = new Date();
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      const after = new Date();

      expect(journey.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(journey.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(journey.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(journey.version).toBe(1);
    });
  });

  describe('generateJourneyNumber', () => {
    it('should generate unique journey numbers', () => {
      const numbers = new Set<string>();
      for (let i = 0; i < 10; i++) {
        numbers.add(generateJourneyNumber());
      }
      expect(numbers.size).toBe(10);
    });

    it('should include current year', () => {
      const number = generateJourneyNumber();
      const year = new Date().getFullYear();
      expect(number).toContain(`TJ-${year}-`);
    });
  });

  // ===========================================================================
  // PHASE TRANSITIONS
  // ===========================================================================

  describe('advanceToPhase', () => {
    let journey: TreatmentJourney;

    beforeEach(() => {
      journey = createTreatmentJourney(createDefaultInput(), 'user-001');
    });

    it('should advance to next phase', () => {
      const updated = advanceToPhase(journey, 'CONSULTATION', 'user-001');

      expect(updated.currentPhase).toBe('CONSULTATION');
      expect(updated.progressPercent).toBe(15);
      expect(updated.version).toBe(2);
    });

    it('should allow skipping phases', () => {
      const updated = advanceToPhase(journey, 'PLANNING', 'user-001');
      expect(updated.currentPhase).toBe('PLANNING');
      expect(updated.progressPercent).toBe(25);
    });

    it('should throw when moving backwards', () => {
      const advanced = advanceToPhase(journey, 'CONSULTATION', 'user-001');

      expect(() => advanceToPhase(advanced, 'INQUIRY', 'user-001')).toThrow(
        'Cannot move backwards'
      );
    });

    it('should complete journey when reaching COMPLETION', () => {
      let updated = journey;
      const phases: JourneyPhase[] = [
        'CONSULTATION',
        'PLANNING',
        'PRE_TREATMENT',
        'SURGICAL',
        'HEALING',
        'PROSTHETIC',
        'ADJUSTMENT',
        'COMPLETION',
      ];

      for (const phase of phases) {
        updated = advanceToPhase(updated, phase, 'user-001');
      }

      expect(updated.status).toBe('COMPLETED');
      expect(updated.progressPercent).toBe(100);
      expect(updated.actualCompletionDate).toBeDefined();
      expect(updated.totalDurationDays).toBeDefined();
    });

    it('should allow transition to MAINTENANCE', () => {
      let updated = journey;
      for (const phase of ['CONSULTATION', 'PLANNING', 'COMPLETION'] as JourneyPhase[]) {
        updated = advanceToPhase(updated, phase, 'user-001');
      }

      const maintenance = advanceToPhase(updated, 'MAINTENANCE', 'user-001');
      expect(maintenance.currentPhase).toBe('MAINTENANCE');
      expect(maintenance.status).toBe('COMPLETED');
    });
  });

  // ===========================================================================
  // MILESTONE MANAGEMENT
  // ===========================================================================

  describe('completeMilestone', () => {
    let journey: TreatmentJourney;

    beforeEach(() => {
      journey = createTreatmentJourney(createDefaultInput(), 'user-001');
    });

    it('should complete milestone', () => {
      const updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'user-001');

      const milestone = updated.milestones.find((m) => m.type === 'LEAD_QUALIFIED');
      expect(milestone).toBeDefined();
      expect(milestone?.completedAt).toBeDefined();
      expect(milestone?.completedBy).toBe('user-001');
    });

    it('should update next milestone', () => {
      const updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'user-001');
      expect(updated.nextMilestone).toBe('CONSULTATION_SCHEDULED');
    });

    it('should auto-advance phase when appropriate', () => {
      let updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'user-001');
      updated = completeMilestone(updated, 'CONSULTATION_SCHEDULED', 'user-001');

      expect(updated.currentPhase).toBe('CONSULTATION');
    });

    it('should accept options', () => {
      const updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'user-001', {
        notes: 'High-value lead',
        linkedEntityType: 'APPOINTMENT',
        linkedEntityId: 'apt-001',
        metadata: { score: 85 },
      });

      const milestone = updated.milestones.find((m) => m.type === 'LEAD_QUALIFIED');
      expect(milestone?.notes).toBe('High-value lead');
      expect(milestone?.linkedEntityType).toBe('APPOINTMENT');
      expect(milestone?.linkedEntityId).toBe('apt-001');
      expect(milestone?.metadata).toEqual({ score: 85 });
    });

    it('should update progress percent', () => {
      const updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'user-001');
      expect(updated.progressPercent).toBeGreaterThanOrEqual(journey.progressPercent);
    });

    it('should increment version', () => {
      const updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'user-001');
      expect(updated.version).toBe(2);
    });
  });

  describe('scheduleMilestone', () => {
    let journey: TreatmentJourney;

    beforeEach(() => {
      journey = createTreatmentJourney(createDefaultInput(), 'user-001');
    });

    it('should schedule milestone', () => {
      const scheduledDate = new Date('2025-01-15');
      const updated = scheduleMilestone(journey, 'CONSULTATION_SCHEDULED', scheduledDate);

      const milestone = updated.milestones.find((m) => m.type === 'CONSULTATION_SCHEDULED');
      expect(milestone?.scheduledAt).toEqual(scheduledDate);
      expect(milestone?.completedAt).toBeUndefined();
    });

    it('should accept options', () => {
      const scheduledDate = new Date('2025-01-15');
      const updated = scheduleMilestone(journey, 'CONSULTATION_SCHEDULED', scheduledDate, {
        notes: 'First consultation',
        linkedEntityType: 'APPOINTMENT',
        linkedEntityId: 'apt-001',
      });

      const milestone = updated.milestones.find((m) => m.type === 'CONSULTATION_SCHEDULED');
      expect(milestone?.notes).toBe('First consultation');
      expect(milestone?.linkedEntityType).toBe('APPOINTMENT');
    });
  });

  // ===========================================================================
  // COMMUNICATION TRACKING
  // ===========================================================================

  describe('recordCommunication', () => {
    let journey: TreatmentJourney;

    beforeEach(() => {
      journey = createTreatmentJourney(createDefaultInput(), 'user-001');
    });

    it('should record communication', () => {
      const updated = recordCommunication(journey, {
        timestamp: new Date(),
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        summary: 'Sent appointment reminder',
      });

      expect(updated.communications).toHaveLength(1);
      expect(updated.communications[0].channel).toBe('WHATSAPP');
      expect(updated.communications[0].direction).toBe('OUTBOUND');
    });

    it('should update last contact', () => {
      const updated = recordCommunication(journey, {
        timestamp: new Date(),
        channel: 'PHONE',
        direction: 'INBOUND',
        summary: 'Patient called with questions',
      });

      expect(updated.lastContactAt).toBeDefined();
      expect(updated.daysSinceLastContact).toBe(0);
    });

    it('should record sentiment', () => {
      const updated = recordCommunication(journey, {
        timestamp: new Date(),
        channel: 'EMAIL',
        direction: 'INBOUND',
        summary: 'Patient expressed concern',
        sentiment: 'NEGATIVE',
      });

      expect(updated.communications[0].sentiment).toBe('NEGATIVE');
    });

    it('should link to milestone', () => {
      const withMilestone = completeMilestone(journey, 'LEAD_QUALIFIED', 'user-001');
      const milestoneId = withMilestone.milestones[1].id;

      const updated = recordCommunication(withMilestone, {
        timestamp: new Date(),
        channel: 'PHONE',
        direction: 'OUTBOUND',
        summary: 'Qualification call',
        linkedMilestoneId: milestoneId,
      });

      expect(updated.communications[0].linkedMilestoneId).toBe(milestoneId);
    });
  });

  // ===========================================================================
  // RISK MANAGEMENT
  // ===========================================================================

  describe('raiseRiskFlag', () => {
    let journey: TreatmentJourney;

    beforeEach(() => {
      journey = createTreatmentJourney(createDefaultInput(), 'user-001');
    });

    it('should raise risk flag', () => {
      const updated = raiseRiskFlag(journey, {
        type: 'DROPOUT_RISK',
        severity: 'MEDIUM',
        description: 'Patient missed appointment',
      });

      expect(updated.riskFlags).toHaveLength(1);
      expect(updated.riskFlags[0].type).toBe('DROPOUT_RISK');
      expect(updated.riskFlags[0].severity).toBe('MEDIUM');
      expect(updated.riskFlags[0].raisedAt).toBeDefined();
    });

    it('should update risk counts', () => {
      const updated = raiseRiskFlag(journey, {
        type: 'FINANCIAL_RISK',
        severity: 'LOW',
        description: 'Payment overdue',
      });

      expect(updated.activeRiskCount).toBe(1);
    });

    it('should calculate risk level from low severity', () => {
      const updated = raiseRiskFlag(journey, {
        type: 'COMMUNICATION_GAP',
        severity: 'LOW',
        description: 'No response to messages',
      });

      expect(updated.riskLevel).toBe('LOW');
    });

    it('should elevate risk level for medium severity', () => {
      const updated = raiseRiskFlag(journey, {
        type: 'CLINICAL_RISK',
        severity: 'MEDIUM',
        description: 'Healing concerns',
      });

      expect(updated.riskLevel).toBe('MEDIUM');
    });

    it('should elevate risk level for high severity', () => {
      const updated = raiseRiskFlag(journey, {
        type: 'CLINICAL_RISK',
        severity: 'HIGH',
        description: 'Possible infection',
      });

      expect(updated.riskLevel).toBe('HIGH');
    });

    it('should set critical risk level for critical flags', () => {
      const updated = raiseRiskFlag(journey, {
        type: 'CLINICAL_RISK',
        severity: 'CRITICAL',
        description: 'Emergency situation',
      });

      expect(updated.riskLevel).toBe('CRITICAL');
    });

    it('should escalate with multiple high risks', () => {
      let updated = raiseRiskFlag(journey, {
        type: 'CLINICAL_RISK',
        severity: 'HIGH',
        description: 'Issue 1',
      });
      updated = raiseRiskFlag(updated, {
        type: 'FINANCIAL_RISK',
        severity: 'HIGH',
        description: 'Issue 2',
      });

      expect(updated.riskLevel).toBe('CRITICAL');
    });
  });

  describe('resolveRiskFlag', () => {
    it('should resolve risk flag', () => {
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      journey = raiseRiskFlag(journey, {
        type: 'DROPOUT_RISK',
        severity: 'MEDIUM',
        description: 'Missed appointment',
      });

      const flagId = journey.riskFlags[0].id;
      const updated = resolveRiskFlag(journey, flagId, 'Rescheduled appointment');

      expect(updated.riskFlags[0].resolvedAt).toBeDefined();
      expect(updated.riskFlags[0].mitigationAction).toBe('Rescheduled appointment');
      expect(updated.activeRiskCount).toBe(0);
      expect(updated.riskLevel).toBe('LOW');
    });
  });

  // ===========================================================================
  // OUTCOME TRACKING
  // ===========================================================================

  describe('recordOutcome', () => {
    let journey: TreatmentJourney;

    beforeEach(() => {
      journey = createTreatmentJourney(createDefaultInput(), 'user-001');
    });

    it('should record outcome', () => {
      const updated = recordOutcome(journey, {
        type: 'CLINICAL_SUCCESS',
        measurementDate: new Date(),
        score: 95,
        description: 'Implants integrated successfully',
        measuredBy: 'dentist-001',
      });

      expect(updated.outcomes).toHaveLength(1);
      expect(updated.outcomes[0].type).toBe('CLINICAL_SUCCESS');
      expect(updated.outcomes[0].score).toBe(95);
    });

    it('should update satisfaction score for satisfaction outcome', () => {
      const updated = recordOutcome(journey, {
        type: 'PATIENT_SATISFACTION',
        measurementDate: new Date(),
        score: 9,
        description: 'Very satisfied with results',
        measuredBy: 'coordinator-001',
      });

      expect(updated.patientSatisfactionScore).toBe(9);
    });

    it('should not update satisfaction for other outcome types', () => {
      const updated = recordOutcome(journey, {
        type: 'CLINICAL_SUCCESS',
        measurementDate: new Date(),
        score: 100,
        description: 'Perfect outcome',
        measuredBy: 'dentist-001',
      });

      expect(updated.patientSatisfactionScore).toBeUndefined();
    });
  });

  // ===========================================================================
  // FINANCIAL TRACKING
  // ===========================================================================

  describe('updateFinancials', () => {
    let journey: TreatmentJourney;

    beforeEach(() => {
      journey = createTreatmentJourney(createDefaultInput(), 'user-001');
    });

    it('should update financials', () => {
      const updated = updateFinancials(journey, {
        totalEstimate: 18000,
      });

      expect(updated.financials.totalEstimate).toBe(18000);
      expect(updated.financials.outstandingBalance).toBe(18000);
    });

    it('should recalculate outstanding balance', () => {
      let updated = recordPayment(journey, 5000);
      updated = updateFinancials(updated, { totalEstimate: 20000 });

      expect(updated.financials.outstandingBalance).toBe(15000);
    });

    it('should update payment plan status', () => {
      const updated = updateFinancials(journey, {
        paymentPlanActive: true,
        financingProvider: 'Stripe Financing',
      });

      expect(updated.financials.paymentPlanActive).toBe(true);
      expect(updated.financials.financingProvider).toBe('Stripe Financing');
    });
  });

  describe('recordPayment', () => {
    let journey: TreatmentJourney;

    beforeEach(() => {
      journey = createTreatmentJourney(createDefaultInput(), 'user-001');
    });

    it('should record payment', () => {
      const updated = recordPayment(journey, 5000);

      expect(updated.financials.totalPaid).toBe(5000);
      expect(updated.financials.outstandingBalance).toBe(10000);
    });

    it('should link invoice', () => {
      const updated = recordPayment(journey, 5000, 'inv-001');

      expect(updated.invoiceIds).toContain('inv-001');
    });

    it('should accumulate payments', () => {
      let updated = recordPayment(journey, 5000);
      updated = recordPayment(updated, 3000);

      expect(updated.financials.totalPaid).toBe(8000);
      expect(updated.financials.outstandingBalance).toBe(7000);
    });

    it('should not allow negative balance', () => {
      const updated = recordPayment(journey, 20000);
      expect(updated.financials.outstandingBalance).toBe(0);
    });
  });

  // ===========================================================================
  // ENTITY LINKING
  // ===========================================================================

  describe('linkLabCase', () => {
    it('should link lab case', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      const updated = linkLabCase(journey, 'lab-001');

      expect(updated.labCaseIds).toContain('lab-001');
    });

    it('should not duplicate lab case', () => {
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      journey = linkLabCase(journey, 'lab-001');
      const updated = linkLabCase(journey, 'lab-001');

      expect(updated.labCaseIds.filter((id) => id === 'lab-001')).toHaveLength(1);
    });
  });

  describe('linkAppointment', () => {
    it('should link appointment', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      const updated = linkAppointment(journey, 'apt-001');

      expect(updated.appointmentIds).toContain('apt-001');
    });

    it('should not duplicate appointment', () => {
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      journey = linkAppointment(journey, 'apt-001');
      const updated = linkAppointment(journey, 'apt-001');

      expect(updated.appointmentIds.filter((id) => id === 'apt-001')).toHaveLength(1);
    });
  });

  // ===========================================================================
  // QUERY HELPERS
  // ===========================================================================

  describe('isJourneyAtRisk', () => {
    it('should return false for low risk', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      expect(isJourneyAtRisk(journey)).toBe(false);
    });

    it('should return true for high risk', () => {
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      journey = raiseRiskFlag(journey, {
        type: 'CLINICAL_RISK',
        severity: 'HIGH',
        description: 'Issue',
      });

      expect(isJourneyAtRisk(journey)).toBe(true);
    });

    it('should return true for critical risk', () => {
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      journey = raiseRiskFlag(journey, {
        type: 'CLINICAL_RISK',
        severity: 'CRITICAL',
        description: 'Emergency',
      });

      expect(isJourneyAtRisk(journey)).toBe(true);
    });
  });

  describe('hasOverdueMilestones', () => {
    it('should return false for no overdue milestones', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      expect(hasOverdueMilestones(journey)).toBe(false);
    });
  });

  describe('needsFollowUp', () => {
    it('should return false for recent contact', () => {
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      journey = recordCommunication(journey, {
        timestamp: new Date(),
        channel: 'PHONE',
        direction: 'OUTBOUND',
        summary: 'Called patient',
      });

      expect(needsFollowUp(journey)).toBe(false);
    });
  });

  describe('getCompletedMilestoneCount', () => {
    it('should count completed milestones', () => {
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      expect(getCompletedMilestoneCount(journey)).toBe(1); // Initial FIRST_CONTACT

      journey = completeMilestone(journey, 'LEAD_QUALIFIED', 'user-001');
      expect(getCompletedMilestoneCount(journey)).toBe(2);
    });
  });

  describe('getMilestonesByPhase', () => {
    it('should return milestones for phase', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      const inquiryMilestones = getMilestonesByPhase(journey, 'INQUIRY');

      expect(inquiryMilestones).toHaveLength(1);
      expect(inquiryMilestones[0].type).toBe('FIRST_CONTACT');
    });

    it('should return empty for phase with no milestones', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      const surgicalMilestones = getMilestonesByPhase(journey, 'SURGICAL');

      expect(surgicalMilestones).toHaveLength(0);
    });
  });

  describe('getJourneySummary', () => {
    it('should return formatted summary', () => {
      const journey = createTreatmentJourney(createDefaultInput(), 'user-001');
      const summary = getJourneySummary(journey);

      expect(summary).toContain(journey.journeyNumber);
      expect(summary).toContain('ALL_ON_4');
      expect(summary).toContain('INQUIRY');
      expect(summary).toContain('5% complete');
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('should always create valid journeys', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'SINGLE_IMPLANT',
            'MULTIPLE_IMPLANTS',
            'ALL_ON_4',
            'ALL_ON_6',
            'ALL_ON_X',
            'FULL_MOUTH_REHAB',
            'PROSTHETIC_ONLY',
            'GENERAL_TREATMENT'
          ) as fc.Arbitrary<TreatmentJourney['treatmentType']>,
          fc.nat({ max: 100000 }),
          (treatmentType, estimate) => {
            const journey = createTreatmentJourney(
              createDefaultInput({
                treatmentType,
                financialEstimate: estimate,
              }),
              'user-001'
            );

            return (
              journey.id.length > 0 &&
              journey.status === 'ACTIVE' &&
              journey.currentPhase === 'INQUIRY' &&
              journey.financials.totalEstimate === estimate &&
              journey.milestones.length >= 1
            );
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should always maintain financial invariants', () => {
      fc.assert(
        fc.property(fc.array(fc.nat({ max: 3000 }), { minLength: 1, maxLength: 5 }), (payments) => {
          const estimate = 50000; // High estimate to prevent overpayment
          let journey = createTreatmentJourney(
            createDefaultInput({ financialEstimate: estimate }),
            'user-001'
          );

          for (const payment of payments) {
            journey = recordPayment(journey, payment);
          }

          const totalPaidFromPayments = payments.reduce((sum, p) => sum + p, 0);

          return (
            journey.financials.totalPaid >= 0 &&
            journey.financials.totalPaid === totalPaidFromPayments &&
            journey.financials.outstandingBalance === estimate - totalPaidFromPayments
          );
        }),
        { numRuns: 30 }
      );
    });

    it('should always have valid risk level', () => {
      const validRiskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constantFrom(
                'DROPOUT_RISK',
                'CLINICAL_RISK',
                'FINANCIAL_RISK',
                'COMMUNICATION_GAP'
              ),
              severity: fc.constantFrom('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
              description: fc.string({ minLength: 1, maxLength: 50 }),
            }),
            { minLength: 0, maxLength: 5 }
          ),
          (riskFlags) => {
            let journey = createTreatmentJourney(createDefaultInput(), 'user-001');

            for (const flag of riskFlags) {
              journey = raiseRiskFlag(journey, flag as any);
            }

            return (
              validRiskLevels.includes(journey.riskLevel) &&
              journey.activeRiskCount === journey.riskFlags.filter((f) => !f.resolvedAt).length
            );
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle zero financial estimate', () => {
      const journey = createTreatmentJourney(
        createDefaultInput({ financialEstimate: 0 }),
        'user-001'
      );

      expect(journey.financials.totalEstimate).toBe(0);
      expect(journey.financials.outstandingBalance).toBe(0);
    });

    it('should handle multiple outcomes of same type', () => {
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');

      journey = recordOutcome(journey, {
        type: 'CLINICAL_SUCCESS',
        measurementDate: new Date('2025-01-01'),
        score: 80,
        description: 'Initial assessment',
        measuredBy: 'dentist-001',
      });

      journey = recordOutcome(journey, {
        type: 'CLINICAL_SUCCESS',
        measurementDate: new Date('2025-02-01'),
        score: 95,
        description: 'Follow-up assessment',
        measuredBy: 'dentist-001',
      });

      expect(journey.outcomes).toHaveLength(2);
    });

    it('should handle journey with all treatment types', () => {
      const treatmentTypes: TreatmentJourney['treatmentType'][] = [
        'SINGLE_IMPLANT',
        'MULTIPLE_IMPLANTS',
        'ALL_ON_4',
        'ALL_ON_6',
        'ALL_ON_X',
        'FULL_MOUTH_REHAB',
        'PROSTHETIC_ONLY',
        'GENERAL_TREATMENT',
      ];

      for (const type of treatmentTypes) {
        const journey = createTreatmentJourney(
          createDefaultInput({ treatmentType: type }),
          'user-001'
        );
        expect(journey.treatmentType).toBe(type);
        expect(journey.nextMilestone).toBeDefined();
      }
    });

    it('should handle all complexity levels', () => {
      const complexities: TreatmentJourney['complexity'][] = [
        'SIMPLE',
        'MODERATE',
        'COMPLEX',
        'HIGHLY_COMPLEX',
      ];

      for (const complexity of complexities) {
        const journey = createTreatmentJourney(createDefaultInput({ complexity }), 'user-001');
        expect(journey.complexity).toBe(complexity);
      }
    });

    it('should handle all communication channels', () => {
      const channels = ['WHATSAPP', 'SMS', 'EMAIL', 'PHONE', 'IN_PERSON', 'PORTAL'] as const;
      let journey = createTreatmentJourney(createDefaultInput(), 'user-001');

      for (const channel of channels) {
        journey = recordCommunication(journey, {
          timestamp: new Date(),
          channel,
          direction: 'OUTBOUND',
          summary: `Communication via ${channel}`,
        });
      }

      expect(journey.communications).toHaveLength(channels.length);
    });
  });
});
