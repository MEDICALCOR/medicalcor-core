/**
 * Tests for TreatmentJourney Entity
 *
 * Covers:
 * - Journey creation
 * - Phase transitions
 * - Milestone management
 * - Communication tracking
 * - Risk management
 * - Outcome tracking
 * - Financial tracking
 * - Entity linking
 * - Query helpers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  type CreateTreatmentJourneyInput,
} from '../TreatmentJourney.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestInput(
  overrides: Partial<CreateTreatmentJourneyInput> = {}
): CreateTreatmentJourneyInput {
  return {
    patientId: 'patient-123',
    clinicId: 'clinic-456',
    treatmentType: 'ALL_ON_4',
    primaryDentistId: 'dentist-789',
    estimatedCompletionDate: new Date('2025-06-01'),
    financialEstimate: 50000,
    ...overrides,
  };
}

// ============================================================================
// JOURNEY CREATION TESTS
// ============================================================================

describe('createTreatmentJourney', () => {
  it('should create a new journey with default values', () => {
    const input = createTestInput();

    const journey = createTreatmentJourney(input, 'creator-123');

    expect(journey.id).toBeDefined();
    expect(journey.journeyNumber).toMatch(/^TJ-\d{4}-\d{6}$/);
    expect(journey.patientId).toBe('patient-123');
    expect(journey.clinicId).toBe('clinic-456');
    expect(journey.treatmentType).toBe('ALL_ON_4');
    expect(journey.status).toBe('ACTIVE');
    expect(journey.currentPhase).toBe('INQUIRY');
    expect(journey.progressPercent).toBe(5);
  });

  it('should create initial FIRST_CONTACT milestone', () => {
    const input = createTestInput();

    const journey = createTreatmentJourney(input, 'creator-123');

    expect(journey.milestones).toHaveLength(1);
    expect(journey.milestones[0]!.type).toBe('FIRST_CONTACT');
    expect(journey.milestones[0]!.completedAt).toBeDefined();
    expect(journey.milestones[0]!.completedBy).toBe('creator-123');
  });

  it('should set LEAD_QUALIFIED as next milestone', () => {
    const input = createTestInput();

    const journey = createTreatmentJourney(input, 'creator-123');

    expect(journey.nextMilestone).toBe('LEAD_QUALIFIED');
  });

  it('should initialize financials correctly', () => {
    const input = createTestInput({ financialEstimate: 75000, currency: 'EUR' });

    const journey = createTreatmentJourney(input, 'creator-123');

    expect(journey.financials.totalEstimate).toBe(75000);
    expect(journey.financials.totalPaid).toBe(0);
    expect(journey.financials.outstandingBalance).toBe(75000);
    expect(journey.financials.currency).toBe('EUR');
    expect(journey.financials.paymentPlanActive).toBe(false);
  });

  it('should use default complexity if not provided', () => {
    const input = createTestInput();

    const journey = createTreatmentJourney(input, 'creator-123');

    expect(journey.complexity).toBe('MODERATE');
  });

  it('should use custom complexity if provided', () => {
    const input = createTestInput({ complexity: 'HIGHLY_COMPLEX' });

    const journey = createTreatmentJourney(input, 'creator-123');

    expect(journey.complexity).toBe('HIGHLY_COMPLEX');
  });

  it('should link allOnXCaseId if provided', () => {
    const input = createTestInput({ allOnXCaseId: 'allon-case-123' });

    const journey = createTreatmentJourney(input, 'creator-123');

    expect(journey.allOnXCaseId).toBe('allon-case-123');
  });
});

describe('generateJourneyNumber', () => {
  it('should generate sequential journey numbers', () => {
    const num1 = generateJourneyNumber();
    const num2 = generateJourneyNumber();

    expect(num1).toMatch(/^TJ-\d{4}-\d{6}$/);
    expect(num2).toMatch(/^TJ-\d{4}-\d{6}$/);
    expect(num1).not.toBe(num2);
  });
});

// ============================================================================
// PHASE TRANSITION TESTS
// ============================================================================

describe('advanceToPhase', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
  });

  it('should advance to next phase', () => {
    const updated = advanceToPhase(journey, 'CONSULTATION', 'user-123');

    expect(updated.currentPhase).toBe('CONSULTATION');
    expect(updated.progressPercent).toBe(15);
    expect(updated.version).toBe(journey.version + 1);
  });

  it('should throw error when moving backwards', () => {
    const inConsultation = advanceToPhase(journey, 'CONSULTATION', 'user-123');

    expect(() => advanceToPhase(inConsultation, 'INQUIRY', 'user-123')).toThrow(
      'Cannot move backwards'
    );
  });

  it('should mark as COMPLETED when reaching COMPLETION phase', () => {
    let current = journey;
    const phases = [
      'CONSULTATION',
      'PLANNING',
      'PRE_TREATMENT',
      'SURGICAL',
      'HEALING',
      'PROSTHETIC',
      'ADJUSTMENT',
      'COMPLETION',
    ] as const;

    for (const phase of phases) {
      current = advanceToPhase(current, phase, 'user-123');
    }

    expect(current.status).toBe('COMPLETED');
    expect(current.actualCompletionDate).toBeDefined();
    expect(current.totalDurationDays).toBeDefined();
  });

  it('should allow transition to MAINTENANCE', () => {
    let current = advanceToPhase(journey, 'COMPLETION', 'user-123');
    current = advanceToPhase(current, 'MAINTENANCE', 'user-123');

    expect(current.currentPhase).toBe('MAINTENANCE');
    expect(current.status).toBe('COMPLETED');
  });
});

// ============================================================================
// MILESTONE MANAGEMENT TESTS
// ============================================================================

describe('completeMilestone', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
  });

  it('should complete a milestone', () => {
    const updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'agent-123');

    const completed = updated.milestones.find((m) => m.type === 'LEAD_QUALIFIED');
    expect(completed).toBeDefined();
    expect(completed!.completedAt).toBeDefined();
    expect(completed!.completedBy).toBe('agent-123');
  });

  it('should update next milestone', () => {
    const updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'agent-123');

    expect(updated.nextMilestone).toBe('CONSULTATION_SCHEDULED');
  });

  it('should auto-advance phase when appropriate', () => {
    let current = journey;
    current = completeMilestone(current, 'LEAD_QUALIFIED', 'agent-123');
    current = completeMilestone(current, 'CONSULTATION_SCHEDULED', 'agent-123');

    expect(current.currentPhase).toBe('CONSULTATION');
  });

  it('should support notes and linked entities', () => {
    const updated = completeMilestone(journey, 'LEAD_QUALIFIED', 'agent-123', {
      notes: 'Patient is very interested',
      linkedEntityType: 'APPOINTMENT',
      linkedEntityId: 'appt-456',
      metadata: { source: 'phone_call' },
    });

    const completed = updated.milestones.find((m) => m.type === 'LEAD_QUALIFIED');
    expect(completed!.notes).toBe('Patient is very interested');
    expect(completed!.linkedEntityType).toBe('APPOINTMENT');
    expect(completed!.linkedEntityId).toBe('appt-456');
    expect(completed!.metadata).toEqual({ source: 'phone_call' });
  });

  it('should complete existing scheduled milestone', () => {
    // First schedule it
    const scheduled = scheduleMilestone(journey, 'CONSULTATION_SCHEDULED', new Date());
    // Then complete it
    const completed = completeMilestone(scheduled, 'CONSULTATION_SCHEDULED', 'agent-123');

    const milestones = completed.milestones.filter((m) => m.type === 'CONSULTATION_SCHEDULED');
    expect(milestones).toHaveLength(1);
    expect(milestones[0]!.completedAt).toBeDefined();
  });
});

describe('scheduleMilestone', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
  });

  it('should schedule a milestone', () => {
    const scheduledDate = new Date('2025-01-15');
    const updated = scheduleMilestone(journey, 'CONSULTATION_SCHEDULED', scheduledDate);

    const scheduled = updated.milestones.find((m) => m.type === 'CONSULTATION_SCHEDULED');
    expect(scheduled).toBeDefined();
    expect(scheduled!.scheduledAt).toEqual(scheduledDate);
    expect(scheduled!.completedAt).toBeUndefined();
  });

  it('should support linked entities', () => {
    const updated = scheduleMilestone(journey, 'CONSULTATION_SCHEDULED', new Date(), {
      linkedEntityType: 'APPOINTMENT',
      linkedEntityId: 'appt-123',
    });

    const scheduled = updated.milestones.find((m) => m.type === 'CONSULTATION_SCHEDULED');
    expect(scheduled!.linkedEntityType).toBe('APPOINTMENT');
  });
});

// ============================================================================
// COMMUNICATION TRACKING TESTS
// ============================================================================

describe('recordCommunication', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
  });

  it('should record a communication', () => {
    const updated = recordCommunication(journey, {
      timestamp: new Date(),
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      summary: 'Followed up on consultation',
      sentiment: 'POSITIVE',
      agentId: 'agent-123',
    });

    expect(updated.communications).toHaveLength(1);
    expect(updated.communications[0]!.channel).toBe('WHATSAPP');
    expect(updated.communications[0]!.summary).toBe('Followed up on consultation');
  });

  it('should reset days since last contact', () => {
    const updated = recordCommunication(journey, {
      timestamp: new Date(),
      channel: 'PHONE',
      direction: 'INBOUND',
      summary: 'Patient called',
    });

    expect(updated.daysSinceLastContact).toBe(0);
    expect(updated.lastContactAt).toBeDefined();
  });
});

// ============================================================================
// RISK MANAGEMENT TESTS
// ============================================================================

describe('raiseRiskFlag', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
  });

  it('should raise a risk flag', () => {
    const updated = raiseRiskFlag(journey, {
      type: 'DROPOUT_RISK',
      severity: 'MEDIUM',
      description: 'Patient has not responded in 2 weeks',
    });

    expect(updated.riskFlags).toHaveLength(1);
    expect(updated.activeRiskCount).toBe(1);
    expect(updated.riskLevel).toBe('MEDIUM');
  });

  it('should escalate risk level for CRITICAL flags', () => {
    const updated = raiseRiskFlag(journey, {
      type: 'CLINICAL_RISK',
      severity: 'CRITICAL',
      description: 'Significant bone loss detected',
    });

    expect(updated.riskLevel).toBe('CRITICAL');
  });

  it('should escalate risk level for multiple HIGH flags', () => {
    let current = journey;
    current = raiseRiskFlag(current, {
      type: 'DROPOUT_RISK',
      severity: 'HIGH',
      description: 'Risk 1',
    });
    current = raiseRiskFlag(current, {
      type: 'FINANCIAL_RISK',
      severity: 'HIGH',
      description: 'Risk 2',
    });

    expect(current.riskLevel).toBe('CRITICAL');
  });
});

describe('resolveRiskFlag', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
    journey = raiseRiskFlag(journey, {
      type: 'DROPOUT_RISK',
      severity: 'HIGH',
      description: 'Not responding',
    });
  });

  it('should resolve a risk flag', () => {
    const riskId = journey.riskFlags[0]!.id;
    const updated = resolveRiskFlag(journey, riskId, 'Patient re-engaged after call');

    const resolved = updated.riskFlags.find((f) => f.id === riskId);
    expect(resolved!.resolvedAt).toBeDefined();
    expect(resolved!.mitigationAction).toBe('Patient re-engaged after call');
    expect(updated.activeRiskCount).toBe(0);
    expect(updated.riskLevel).toBe('LOW');
  });
});

// ============================================================================
// OUTCOME TRACKING TESTS
// ============================================================================

describe('recordOutcome', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
  });

  it('should record an outcome', () => {
    const updated = recordOutcome(journey, {
      type: 'CLINICAL_SUCCESS',
      measurementDate: new Date(),
      score: 95,
      description: 'Implants successfully osseointegrated',
      measuredBy: 'dr-smith',
    });

    expect(updated.outcomes).toHaveLength(1);
    expect(updated.outcomes[0]!.type).toBe('CLINICAL_SUCCESS');
    expect(updated.outcomes[0]!.score).toBe(95);
  });

  it('should update patient satisfaction score', () => {
    const updated = recordOutcome(journey, {
      type: 'PATIENT_SATISFACTION',
      measurementDate: new Date(),
      score: 9,
      description: 'Very satisfied with results',
      measuredBy: 'coordinator-123',
    });

    expect(updated.patientSatisfactionScore).toBe(9);
  });
});

// ============================================================================
// FINANCIAL TRACKING TESTS
// ============================================================================

describe('updateFinancials', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput({ financialEstimate: 50000 }), 'creator-123');
  });

  it('should update financial details', () => {
    const updated = updateFinancials(journey, {
      paymentPlanActive: true,
      financingProvider: 'FinanceBank',
      nextPaymentDue: new Date('2025-02-01'),
      nextPaymentAmount: 5000,
    });

    expect(updated.financials.paymentPlanActive).toBe(true);
    expect(updated.financials.financingProvider).toBe('FinanceBank');
    expect(updated.financials.nextPaymentAmount).toBe(5000);
  });

  it('should recalculate outstanding balance', () => {
    const updated = updateFinancials(journey, {
      totalPaid: 10000,
    });

    expect(updated.financials.outstandingBalance).toBe(40000);
  });
});

describe('recordPayment', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput({ financialEstimate: 50000 }), 'creator-123');
  });

  it('should record a payment', () => {
    const updated = recordPayment(journey, 10000, 'invoice-123');

    expect(updated.financials.totalPaid).toBe(10000);
    expect(updated.financials.outstandingBalance).toBe(40000);
    expect(updated.invoiceIds).toContain('invoice-123');
  });

  it('should handle multiple payments', () => {
    let current = journey;
    current = recordPayment(current, 10000, 'inv-1');
    current = recordPayment(current, 15000, 'inv-2');
    current = recordPayment(current, 25000, 'inv-3');

    expect(current.financials.totalPaid).toBe(50000);
    expect(current.financials.outstandingBalance).toBe(0);
    expect(current.invoiceIds).toHaveLength(3);
  });

  it('should not go negative on overpayment', () => {
    const updated = recordPayment(journey, 60000);

    expect(updated.financials.outstandingBalance).toBe(0);
  });
});

// ============================================================================
// ENTITY LINKING TESTS
// ============================================================================

describe('linkLabCase', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
  });

  it('should link a lab case', () => {
    const updated = linkLabCase(journey, 'lab-case-123');

    expect(updated.labCaseIds).toContain('lab-case-123');
  });

  it('should not duplicate lab case IDs', () => {
    let current = linkLabCase(journey, 'lab-case-123');
    current = linkLabCase(current, 'lab-case-123');

    expect(current.labCaseIds.filter((id) => id === 'lab-case-123')).toHaveLength(1);
  });
});

describe('linkAppointment', () => {
  let journey: TreatmentJourney;

  beforeEach(() => {
    journey = createTreatmentJourney(createTestInput(), 'creator-123');
  });

  it('should link an appointment', () => {
    const updated = linkAppointment(journey, 'appt-123');

    expect(updated.appointmentIds).toContain('appt-123');
  });

  it('should not duplicate appointment IDs', () => {
    let current = linkAppointment(journey, 'appt-123');
    current = linkAppointment(current, 'appt-123');

    expect(current.appointmentIds.filter((id) => id === 'appt-123')).toHaveLength(1);
  });
});

// ============================================================================
// QUERY HELPER TESTS
// ============================================================================

describe('isJourneyAtRisk', () => {
  it('should return true for HIGH risk', () => {
    let journey = createTreatmentJourney(createTestInput(), 'creator-123');
    journey = raiseRiskFlag(journey, {
      type: 'DROPOUT_RISK',
      severity: 'HIGH',
      description: 'Test',
    });

    expect(isJourneyAtRisk(journey)).toBe(true);
  });

  it('should return true for CRITICAL risk', () => {
    let journey = createTreatmentJourney(createTestInput(), 'creator-123');
    journey = raiseRiskFlag(journey, {
      type: 'CLINICAL_RISK',
      severity: 'CRITICAL',
      description: 'Test',
    });

    expect(isJourneyAtRisk(journey)).toBe(true);
  });

  it('should return false for LOW/MEDIUM risk', () => {
    const journey = createTreatmentJourney(createTestInput(), 'creator-123');

    expect(isJourneyAtRisk(journey)).toBe(false);
  });
});

describe('hasOverdueMilestones', () => {
  it('should return false when no overdue milestones', () => {
    const journey = createTreatmentJourney(createTestInput(), 'creator-123');

    expect(hasOverdueMilestones(journey)).toBe(false);
  });

  it('should return true when has overdue milestones', () => {
    let journey = createTreatmentJourney(createTestInput(), 'creator-123');
    // Manually set overdue milestones for testing
    journey = { ...journey, overdueMilestones: ['milestone-1'] };

    expect(hasOverdueMilestones(journey)).toBe(true);
  });
});

describe('needsFollowUp', () => {
  it('should return false when recently contacted', () => {
    const journey = createTreatmentJourney(createTestInput(), 'creator-123');

    expect(needsFollowUp(journey)).toBe(false);
  });

  it('should return true when days since contact exceeds threshold', () => {
    let journey = createTreatmentJourney(createTestInput(), 'creator-123');
    journey = { ...journey, daysSinceLastContact: 10 };

    expect(needsFollowUp(journey)).toBe(true);
    expect(needsFollowUp(journey, 5)).toBe(true);
  });

  it('should respect custom threshold', () => {
    let journey = createTreatmentJourney(createTestInput(), 'creator-123');
    journey = { ...journey, daysSinceLastContact: 10 };

    expect(needsFollowUp(journey, 15)).toBe(false);
  });
});

describe('getCompletedMilestoneCount', () => {
  it('should count completed milestones', () => {
    let journey = createTreatmentJourney(createTestInput(), 'creator-123');
    journey = completeMilestone(journey, 'LEAD_QUALIFIED', 'agent-123');
    journey = completeMilestone(journey, 'CONSULTATION_SCHEDULED', 'agent-123');

    // FIRST_CONTACT + LEAD_QUALIFIED + CONSULTATION_SCHEDULED
    expect(getCompletedMilestoneCount(journey)).toBe(3);
  });
});

describe('getMilestonesByPhase', () => {
  it('should return milestones for specific phase', () => {
    let journey = createTreatmentJourney(createTestInput(), 'creator-123');
    journey = completeMilestone(journey, 'LEAD_QUALIFIED', 'agent-123');

    const inquiryMilestones = getMilestonesByPhase(journey, 'INQUIRY');

    expect(inquiryMilestones).toHaveLength(2); // FIRST_CONTACT + LEAD_QUALIFIED
    expect(inquiryMilestones.every((m) => m.phase === 'INQUIRY')).toBe(true);
  });
});

describe('getJourneySummary', () => {
  it('should return formatted summary', () => {
    const journey = createTreatmentJourney(createTestInput(), 'creator-123');

    const summary = getJourneySummary(journey);

    expect(summary).toContain(journey.journeyNumber);
    expect(summary).toContain('ALL_ON_4');
    expect(summary).toContain('INQUIRY');
    expect(summary).toContain('5% complete');
  });
});
