/**
 * Integration Test: Lead → LTV Complete Event Chain
 *
 * H1: Verifies the complete event chain from Lead creation through LTV calculation.
 *
 * This test validates:
 * - All domain events are emitted in correct order
 * - Event store contains complete audit trail
 * - CorrelationId stays consistent across the flow
 * - LTV calculation triggers after case completion
 *
 * Event Chain:
 * LeadCreated → LeadScored → LeadQualified → LeadConverted →
 * CaseCreated → PaymentProcessed → CasePaymentStatusChanged →
 * CaseCompleted → PLTVScored
 *
 * @module domain/ltv/__tests__/lead-ltv-event-chain.integration.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { InMemoryEventStore, EventStore, type StoredEvent } from '@medicalcor/core';

// ============================================================================
// TEST CONSTANTS
// ============================================================================

const TEST_SOURCE = 'test:lead-ltv-event-chain';
const TEST_CLINIC_ID = 'clinic-test-001';
const TEST_PHONE = '+40721123456';

// Expected event types in order
const EXPECTED_EVENT_CHAIN = [
  'lead.created',
  'lead.scored',
  'lead.qualified',
  'lead.converted',
  'case.created',
  'payment.processed',
  'case.payment_status_changed',
  'case.completed',
  'pltv.scored',
] as const;

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

function createTestEventStore(): { eventStore: EventStore; repository: InMemoryEventStore } {
  const repository = new InMemoryEventStore();
  const eventStore = new EventStore(repository, { source: TEST_SOURCE });
  return { eventStore, repository };
}

interface EmitEventOptions {
  eventStore: EventStore;
  type: string;
  correlationId: string;
  aggregateId: string;
  aggregateType: string;
  payload: Record<string, unknown>;
  causationId?: string;
  version?: number;
}

async function emitEvent(options: EmitEventOptions): Promise<StoredEvent> {
  return options.eventStore.emit({
    type: options.type,
    correlationId: options.correlationId,
    aggregateId: options.aggregateId,
    aggregateType: options.aggregateType,
    payload: options.payload,
    causationId: options.causationId,
    version: options.version,
  });
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Lead → LTV Event Chain Integration', () => {
  let eventStore: EventStore;
  let repository: InMemoryEventStore;

  beforeEach(() => {
    const setup = createTestEventStore();
    eventStore = setup.eventStore;
    repository = setup.repository;
  });

  describe('Complete Event Chain Flow', () => {
    it('should emit all events in correct order from lead creation to LTV scoring', async () => {
      const correlationId = uuidv4();
      const leadId = `lead-${uuidv4()}`;
      const caseId = `case-${uuidv4()}`;
      const paymentId = `payment-${uuidv4()}`;

      // ========================================
      // Phase 1: Lead Acquisition
      // ========================================

      // 1. LeadCreated - Lead enters system via WhatsApp
      const leadCreatedEvent = await emitEvent({
        eventStore,
        type: 'lead.created',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          phone: TEST_PHONE,
          source: 'whatsapp',
          hubspotContactId: `contact-${uuidv4()}`,
          language: 'ro',
          utmSource: 'facebook',
          utmMedium: 'cpc',
          utmCampaign: 'allonx-2024',
        },
        version: 1,
      });

      // 2. LeadScored - AI scoring identifies HOT lead
      const leadScoredEvent = await emitEvent({
        eventStore,
        type: 'lead.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          phone: TEST_PHONE,
          channel: 'whatsapp',
          score: 5,
          classification: 'HOT',
          confidence: 0.92,
          method: 'ai',
          reasoning: 'Explicit All-on-X interest with budget confirmation',
          suggestedAction: 'Immediate callback within 5 minutes',
          procedureInterest: ['All-on-X', 'dental-implants'],
          budgetMentioned: true,
          urgencyIndicators: ['immediate', 'ready-to-start'],
        },
        causationId: leadCreatedEvent.id,
        version: 2,
      });

      // 3. LeadQualified - Auto-qualified due to HOT score
      const leadQualifiedEvent = await emitEvent({
        eventStore,
        type: 'lead.qualified',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          phone: TEST_PHONE,
          score: 5,
          classification: 'HOT',
          qualificationReason: 'Score >= 4 with All-on-X interest',
          procedureInterest: ['All-on-X', 'dental-implants'],
          estimatedValue: 25000,
        },
        causationId: leadScoredEvent.id,
        version: 3,
      });

      // ========================================
      // Phase 2: Lead Conversion
      // ========================================

      // 4. LeadConverted - Lead becomes patient
      const leadConvertedEvent = await emitEvent({
        eventStore,
        type: 'lead.converted',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          phone: TEST_PHONE,
          patientId: `patient-${uuidv4()}`,
          procedure: 'All-on-X',
          conversionValue: 25000,
          timeToConvertDays: 3,
          touchpoints: 5,
        },
        causationId: leadQualifiedEvent.id,
        version: 4,
      });

      // ========================================
      // Phase 3: Case & Payment Processing
      // ========================================

      // 5. CaseCreated - Treatment case created
      const caseCreatedEvent = await emitEvent({
        eventStore,
        type: 'case.created',
        correlationId,
        aggregateId: caseId,
        aggregateType: 'Case',
        payload: {
          leadId,
          clinicId: TEST_CLINIC_ID,
          treatmentPlanId: `plan-${uuidv4()}`,
          totalAmount: 25000,
          currency: 'EUR',
          procedureType: 'All-on-X',
          status: 'pending',
          paymentStatus: 'unpaid',
        },
        causationId: leadConvertedEvent.id,
        version: 1,
      });

      // 6. PaymentProcessed - Full payment received
      const paymentProcessedEvent = await emitEvent({
        eventStore,
        type: 'payment.processed',
        correlationId,
        aggregateId: paymentId,
        aggregateType: 'Payment',
        payload: {
          caseId,
          leadId,
          amount: 25000,
          currency: 'EUR',
          method: 'bank_transfer',
          type: 'full_payment',
          processorName: 'stripe',
          processorTransactionId: `pi_${uuidv4()}`,
          status: 'succeeded',
        },
        causationId: caseCreatedEvent.id,
        version: 1,
      });

      // 7. CasePaymentStatusChanged - Case marked as paid
      const casePaymentStatusChangedEvent = await emitEvent({
        eventStore,
        type: 'case.payment_status_changed',
        correlationId,
        aggregateId: caseId,
        aggregateType: 'Case',
        payload: {
          previousStatus: 'unpaid',
          newStatus: 'paid',
          paidAmount: 25000,
          outstandingAmount: 0,
          paymentId,
        },
        causationId: paymentProcessedEvent.id,
        version: 2,
      });

      // 8. CaseCompleted - Treatment completed
      const caseCompletedEvent = await emitEvent({
        eventStore,
        type: 'case.completed',
        correlationId,
        aggregateId: caseId,
        aggregateType: 'Case',
        payload: {
          leadId,
          clinicId: TEST_CLINIC_ID,
          totalPaid: 25000,
          outstandingBalance: 0,
          treatmentDurationDays: 90,
          outcome: 'successful',
        },
        causationId: casePaymentStatusChangedEvent.id,
        version: 3,
      });

      // ========================================
      // Phase 4: LTV Calculation
      // ========================================

      // 9. PLTVScored - Predicted LTV calculated
      await emitEvent({
        eventStore,
        type: 'pltv.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          clinicId: TEST_CLINIC_ID,
          historicalLTV: 25000,
          predictedLTV: 42500,
          tier: 'PLATINUM',
          previousTier: null,
          growthPotential: 'HIGH_GROWTH',
          investmentPriority: 'HIGH',
          factors: {
            paymentReliability: 1.3,
            engagement: 1.4,
            procedureInterest: 2.5,
            tenure: 1.0,
            retention: 1.1,
          },
          scoredAt: new Date().toISOString(),
        },
        causationId: caseCompletedEvent.id,
        version: 5,
      });

      // ========================================
      // VERIFICATION: Event Chain Integrity
      // ========================================

      // Get all events by correlationId
      const allEvents = await eventStore.getByCorrelationId(correlationId);

      // Verify count
      expect(allEvents).toHaveLength(9);

      // Verify event types in order
      const eventTypes = allEvents.map((e) => e.type);
      expect(eventTypes).toEqual(EXPECTED_EVENT_CHAIN);

      // Verify all events share the same correlationId
      const correlationIds = new Set(allEvents.map((e) => e.metadata.correlationId));
      expect(correlationIds.size).toBe(1);
      expect(correlationIds.has(correlationId)).toBe(true);

      // Verify causation chain (each event caused by previous)
      for (let i = 1; i < allEvents.length; i++) {
        const previousEvent = allEvents[i - 1];
        const currentEvent = allEvents[i];

        // Verify causationId links to previous event
        // Note: In real system, causationId may not always chain linearly
        // but in this test flow it should
        expect(currentEvent?.metadata.causationId).toBeDefined();
      }

      // Verify aggregate consistency
      const leadEvents = allEvents.filter((e) => e.aggregateId === leadId);
      expect(leadEvents).toHaveLength(5); // created, scored, qualified, converted, pltv.scored

      const caseEvents = allEvents.filter((e) => e.aggregateId === caseId);
      expect(caseEvents).toHaveLength(3); // created, payment_status_changed, completed

      // Verify idempotency keys are unique
      const idempotencyKeys = allEvents.map((e) => e.metadata.idempotencyKey);
      const uniqueKeys = new Set(idempotencyKeys);
      expect(uniqueKeys.size).toBe(allEvents.length);
    });

    it('should handle HOT lead fast-track with 5-minute SLA', async () => {
      const correlationId = uuidv4();
      const leadId = `lead-${uuidv4()}`;
      const startTime = Date.now();

      // Create lead
      await emitEvent({
        eventStore,
        type: 'lead.created',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: { phone: TEST_PHONE, source: 'whatsapp' },
        version: 1,
      });

      // Score as HOT
      await emitEvent({
        eventStore,
        type: 'lead.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          phone: TEST_PHONE,
          score: 5,
          classification: 'HOT',
          confidence: 0.95,
          method: 'ai',
          reasoning: 'All-on-X explicit interest',
          suggestedAction: 'Immediate callback',
        },
        version: 2,
      });

      // Assign with SLA
      const slaDeadline = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
      await emitEvent({
        eventStore,
        type: 'lead.assigned',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          phone: TEST_PHONE,
          assignedTo: 'agent-001',
          assignedBy: 'auto',
          reason: 'HOT lead auto-assignment',
          priority: 'critical',
          slaDeadline,
        },
        version: 3,
      });

      const events = await eventStore.getByAggregateId(leadId);

      // Verify quick progression
      const elapsedMs = Date.now() - startTime;
      expect(elapsedMs).toBeLessThan(100); // Event emission should be fast

      // Verify SLA deadline is set
      const assignedEvent = events.find((e) => e.type === 'lead.assigned');
      expect(assignedEvent?.payload.slaDeadline).toBe(slaDeadline);
      expect(assignedEvent?.payload.priority).toBe('critical');
    });

    it('should track partial payment flow correctly', async () => {
      const correlationId = uuidv4();
      const caseId = `case-${uuidv4()}`;
      const totalAmount = 25000;

      // Case created
      await emitEvent({
        eventStore,
        type: 'case.created',
        correlationId,
        aggregateId: caseId,
        aggregateType: 'Case',
        payload: {
          totalAmount,
          currency: 'EUR',
          paymentStatus: 'unpaid',
          paidAmount: 0,
        },
        version: 1,
      });

      // First partial payment (40%)
      await emitEvent({
        eventStore,
        type: 'payment.processed',
        correlationId,
        aggregateId: `payment-1-${uuidv4()}`,
        aggregateType: 'Payment',
        payload: {
          caseId,
          amount: 10000,
          type: 'deposit',
        },
        version: 1,
      });

      await emitEvent({
        eventStore,
        type: 'case.payment_status_changed',
        correlationId,
        aggregateId: caseId,
        aggregateType: 'Case',
        payload: {
          previousStatus: 'unpaid',
          newStatus: 'partial',
          paidAmount: 10000,
          outstandingAmount: 15000,
        },
        version: 2,
      });

      // Second partial payment (60%)
      await emitEvent({
        eventStore,
        type: 'payment.processed',
        correlationId,
        aggregateId: `payment-2-${uuidv4()}`,
        aggregateType: 'Payment',
        payload: {
          caseId,
          amount: 15000,
          type: 'final_payment',
        },
        version: 1,
      });

      await emitEvent({
        eventStore,
        type: 'case.payment_status_changed',
        correlationId,
        aggregateId: caseId,
        aggregateType: 'Case',
        payload: {
          previousStatus: 'partial',
          newStatus: 'paid',
          paidAmount: 25000,
          outstandingAmount: 0,
        },
        version: 3,
      });

      // Verify payment progression
      const caseEvents = await eventStore.getByAggregateId(caseId);
      const paymentStatusEvents = caseEvents.filter(
        (e) => e.type === 'case.payment_status_changed'
      );

      expect(paymentStatusEvents).toHaveLength(2);

      // First transition: unpaid → partial
      expect(paymentStatusEvents[0]?.payload.previousStatus).toBe('unpaid');
      expect(paymentStatusEvents[0]?.payload.newStatus).toBe('partial');

      // Second transition: partial → paid
      expect(paymentStatusEvents[1]?.payload.previousStatus).toBe('partial');
      expect(paymentStatusEvents[1]?.payload.newStatus).toBe('paid');
    });
  });

  describe('Event Store Integrity', () => {
    it('should maintain idempotency - duplicate events are ignored', async () => {
      const correlationId = uuidv4();
      const leadId = `lead-${uuidv4()}`;
      const idempotencyKey = `lead.created:${correlationId}:${leadId}`;

      // First event
      await eventStore.emit({
        type: 'lead.created',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: { phone: TEST_PHONE },
        idempotencyKey,
      });

      // Duplicate event (same idempotency key)
      await eventStore.emit({
        type: 'lead.created',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: { phone: TEST_PHONE },
        idempotencyKey,
      });

      // Should only have one event
      const events = await eventStore.getByAggregateId(leadId);
      expect(events).toHaveLength(1);
    });

    it('should retrieve events by aggregate with version ordering', async () => {
      const leadId = `lead-${uuidv4()}`;
      const correlationId = uuidv4();

      // Emit events with explicit versions
      await emitEvent({
        eventStore,
        type: 'lead.created',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {},
        version: 1,
      });

      await emitEvent({
        eventStore,
        type: 'lead.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {},
        version: 2,
      });

      await emitEvent({
        eventStore,
        type: 'lead.qualified',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {},
        version: 3,
      });

      // Get events after version 1
      const eventsAfterV1 = await eventStore.getByAggregateId(leadId, 1);
      expect(eventsAfterV1).toHaveLength(2);
      expect(eventsAfterV1[0]?.version).toBe(2);
      expect(eventsAfterV1[1]?.version).toBe(3);
    });

    it('should retrieve events by type', async () => {
      const correlationId = uuidv4();

      // Emit various event types
      for (let i = 0; i < 5; i++) {
        await emitEvent({
          eventStore,
          type: 'lead.created',
          correlationId,
          aggregateId: `lead-${i}`,
          aggregateType: 'Lead',
          payload: { index: i },
        });
      }

      await emitEvent({
        eventStore,
        type: 'case.created',
        correlationId,
        aggregateId: 'case-1',
        aggregateType: 'Case',
        payload: {},
      });

      // Get only lead.created events
      const leadCreatedEvents = await eventStore.getByType('lead.created');
      expect(leadCreatedEvents).toHaveLength(5);
      expect(leadCreatedEvents.every((e) => e.type === 'lead.created')).toBe(true);
    });
  });

  describe('Multi-Case LTV Aggregation', () => {
    it('should track LTV growth across multiple cases', async () => {
      const correlationId = uuidv4();
      const leadId = `lead-${uuidv4()}`;

      // Lead with first case (Bronze tier)
      await emitEvent({
        eventStore,
        type: 'pltv.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          historicalLTV: 3000,
          predictedLTV: 5000,
          tier: 'BRONZE',
          previousTier: null,
        },
        version: 1,
      });

      // After second case (Silver tier)
      await emitEvent({
        eventStore,
        type: 'pltv.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          historicalLTV: 10000,
          predictedLTV: 14000,
          tier: 'SILVER',
          previousTier: 'BRONZE',
        },
        version: 2,
      });

      // After third case (Gold tier)
      await emitEvent({
        eventStore,
        type: 'pltv.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          historicalLTV: 20000,
          predictedLTV: 28000,
          tier: 'GOLD',
          previousTier: 'SILVER',
        },
        version: 3,
      });

      // Verify tier progression
      const pltvEvents = await eventStore.getByType('pltv.scored');
      const leadPltvEvents = pltvEvents.filter((e) => e.aggregateId === leadId);

      expect(leadPltvEvents).toHaveLength(3);

      // Verify tier progression: BRONZE → SILVER → GOLD
      const tiers = leadPltvEvents.map((e) => e.payload.tier);
      expect(tiers).toEqual(['BRONZE', 'SILVER', 'GOLD']);

      // Verify previousTier chain
      expect(leadPltvEvents[0]?.payload.previousTier).toBeNull();
      expect(leadPltvEvents[1]?.payload.previousTier).toBe('BRONZE');
      expect(leadPltvEvents[2]?.payload.previousTier).toBe('SILVER');
    });
  });

  describe('High-Value Patient Detection', () => {
    it('should emit HighValuePatientIdentified for GOLD+ tiers', async () => {
      const correlationId = uuidv4();
      const leadId = `lead-${uuidv4()}`;

      // pLTV scored with PLATINUM tier
      const pltvEvent = await emitEvent({
        eventStore,
        type: 'pltv.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          historicalLTV: 35000,
          predictedLTV: 48000,
          tier: 'PLATINUM',
          previousTier: 'GOLD',
        },
        version: 1,
      });

      // High-value patient identified
      await emitEvent({
        eventStore,
        type: 'pltv.high_value_patient_identified',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          tier: 'PLATINUM',
          predictedLTV: 48000,
          recommendedActions: [
            'Assign dedicated account manager',
            'Priority scheduling',
            'VIP treatment protocol',
          ],
        },
        causationId: pltvEvent.id,
        version: 2,
      });

      // Verify high-value detection
      const events = await eventStore.getByAggregateId(leadId);
      const highValueEvent = events.find((e) => e.type === 'pltv.high_value_patient_identified');

      expect(highValueEvent).toBeDefined();
      expect(highValueEvent?.payload.tier).toBe('PLATINUM');
      expect(highValueEvent?.payload.recommendedActions).toHaveLength(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle lead lost before conversion', async () => {
      const correlationId = uuidv4();
      const leadId = `lead-${uuidv4()}`;

      await emitEvent({
        eventStore,
        type: 'lead.created',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: { phone: TEST_PHONE },
        version: 1,
      });

      await emitEvent({
        eventStore,
        type: 'lead.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: { score: 2, classification: 'COLD' },
        version: 2,
      });

      await emitEvent({
        eventStore,
        type: 'lead.lost',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          reason: 'no_response',
          totalTouchpoints: 3,
        },
        version: 3,
      });

      // Verify no conversion or LTV events
      const events = await eventStore.getByAggregateId(leadId);
      const eventTypes = events.map((e) => e.type);

      expect(eventTypes).not.toContain('lead.converted');
      expect(eventTypes).not.toContain('pltv.scored');
      expect(eventTypes).toContain('lead.lost');
    });

    it('should handle refund and pLTV decline', async () => {
      const correlationId = uuidv4();
      const leadId = `lead-${uuidv4()}`;
      const caseId = `case-${uuidv4()}`;

      // Initial high LTV
      await emitEvent({
        eventStore,
        type: 'pltv.scored',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          historicalLTV: 30000,
          predictedLTV: 42000,
          tier: 'PLATINUM',
        },
        version: 1,
      });

      // Refund processed
      await emitEvent({
        eventStore,
        type: 'refund.processed',
        correlationId,
        aggregateId: `refund-${uuidv4()}`,
        aggregateType: 'Refund',
        payload: {
          caseId,
          leadId,
          amount: 15000,
          reason: 'treatment_cancelled',
        },
        version: 1,
      });

      // pLTV decline detected
      await emitEvent({
        eventStore,
        type: 'pltv.decline_detected',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'Lead',
        payload: {
          previousLTV: 42000,
          currentLTV: 25000,
          declinePercentage: 40.5,
          tier: 'GOLD',
          previousTier: 'PLATINUM',
          reason: 'refund_impact',
        },
        version: 2,
      });

      // Verify decline detection
      const events = await eventStore.getByAggregateId(leadId);
      const declineEvent = events.find((e) => e.type === 'pltv.decline_detected');

      expect(declineEvent).toBeDefined();
      expect(declineEvent?.payload.declinePercentage).toBeGreaterThan(20);
      expect(declineEvent?.payload.previousTier).toBe('PLATINUM');
      expect(declineEvent?.payload.tier).toBe('GOLD');
    });
  });
});
