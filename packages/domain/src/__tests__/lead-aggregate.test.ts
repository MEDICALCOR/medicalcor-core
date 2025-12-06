/**
 * @fileoverview Lead Aggregate Root Tests
 *
 * Comprehensive tests for the Lead aggregate root following DDD patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LeadAggregateRoot,
  LeadFactory,
  leadFactory,
  LeadDeletedError,
  LeadClosedError,
  LeadAlreadyConvertedError,
  LeadLostError,
  InvalidStatusTransitionError,
  type LeadDomainEvent,
} from '../leads/index.js';
import { PhoneNumber } from '../shared-kernel/value-objects/phone-number.js';
import { LeadScore } from '../shared-kernel/value-objects/lead-score.js';

describe('LeadAggregateRoot', () => {
  let phone: PhoneNumber;

  beforeEach(() => {
    phone = PhoneNumber.create('+40721234567');
  });

  // ============================================================================
  // CREATION TESTS
  // ============================================================================

  describe('create', () => {
    it('should create a new lead with required fields', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      expect(lead.id).toBe('lead-123');
      expect(lead.phone.e164).toBe('+40721234567');
      expect(lead.source).toBe('whatsapp');
      expect(lead.status).toBe('new');
      expect(lead.version).toBe(1);
      expect(lead.isDeleted).toBe(false);
    });

    it('should create a new lead with optional fields', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        hubspotContactId: 'hs-123',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'summer2024',
      });

      expect(lead.email).toBe('test@example.com');
      expect(lead.firstName).toBe('John');
      expect(lead.lastName).toBe('Doe');
      expect(lead.fullName).toBe('John Doe');
      expect(lead.hubspotContactId).toBe('hs-123');
    });

    it('should emit LeadCreated event on creation', () => {
      const lead = LeadAggregateRoot.create(
        {
          id: 'lead-123',
          phone,
          source: 'whatsapp',
        },
        'corr-123'
      );

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('lead.created');
      expect(events[0]?.aggregateId).toBe('lead-123');
      expect(events[0]?.aggregateType).toBe('Lead');
      expect(events[0]?.correlationId).toBe('corr-123');
    });
  });

  // ============================================================================
  // SCORING TESTS
  // ============================================================================

  describe('score', () => {
    it('should score a lead successfully', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents(); // Clear creation event

      const score = LeadScore.hot();
      lead.score(score, {
        method: 'ai',
        reasoning: 'High intent detected',
        confidence: 0.9,
      });

      expect(lead.currentScore?.classification).toBe('HOT');
      expect(lead.currentScore?.numericValue).toBe(4);
      expect(lead.isHot()).toBe(true);
    });

    it('should emit LeadScored and LeadQualified events for HOT leads', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();

      const score = LeadScore.hot();
      lead.score(score, {
        method: 'ai',
        reasoning: 'High intent detected',
        confidence: 0.9,
      });

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0]?.type).toBe('lead.scored');
      expect(events[1]?.type).toBe('lead.qualified');
    });

    it('should not auto-qualify WARM leads', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();

      const score = LeadScore.warm();
      lead.score(score, {
        method: 'ai',
        reasoning: 'General interest',
        confidence: 0.8,
      });

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('lead.scored');
      expect(lead.status).toBe('new');
    });

    it('should throw error when scoring a closed lead', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.markLost('no_response');

      expect(() => {
        lead.score(LeadScore.hot(), {
          method: 'ai',
          reasoning: 'Test',
          confidence: 0.9,
        });
      }).toThrow(LeadClosedError);
    });
  });

  // ============================================================================
  // QUALIFICATION TESTS
  // ============================================================================

  describe('qualify', () => {
    it('should qualify a lead', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();
      lead.qualify('Manual qualification', ['implants']);

      expect(lead.status).toBe('qualified');
      expect(lead.isQualified()).toBe(true);
    });

    it('should be idempotent for already qualified leads', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.qualify('First qualification');
      lead.clearUncommittedEvents();
      lead.qualify('Second qualification');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(0); // No new event
    });
  });

  // ============================================================================
  // ASSIGNMENT TESTS
  // ============================================================================

  describe('assign', () => {
    it('should assign a lead to an agent', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();
      lead.assign('agent-456', 'auto', 'HOT lead requires immediate attention');

      expect(lead.assignedTo).toBe('agent-456');
      expect(lead.isAssigned()).toBe(true);
    });

    it('should emit LeadAssigned event', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();
      lead.assign('agent-456', 'manual', 'Manual assignment');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('lead.assigned');

      const payload = events[0]?.payload as Record<string, unknown>;
      expect(payload.assignedTo).toBe('agent-456');
      expect(payload.assignedBy).toBe('manual');
    });
  });

  // ============================================================================
  // CONTACT TESTS
  // ============================================================================

  describe('contact', () => {
    it('should record a contact', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();
      lead.contact('whatsapp', 'outbound', 'connected', 'Hello!');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('lead.contacted');
      expect(lead.lastContactAt).toBeDefined();
    });

    it('should transition new lead to contacted status', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      expect(lead.status).toBe('new');
      lead.contact('whatsapp', 'outbound');

      expect(lead.status).toBe('contacted');
    });
  });

  // ============================================================================
  // STATUS TRANSITION TESTS
  // ============================================================================

  describe('transitionStatus', () => {
    it('should allow valid transitions', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.transitionStatus('contacted', 'First contact made');
      expect(lead.status).toBe('contacted');

      lead.transitionStatus('qualified', 'Lead qualified');
      expect(lead.status).toBe('qualified');

      lead.transitionStatus('scheduled', 'Appointment booked');
      expect(lead.status).toBe('scheduled');
    });

    it('should throw error for invalid transitions', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      expect(() => {
        lead.transitionStatus('converted');
      }).toThrow(InvalidStatusTransitionError);
    });

    it('should emit LeadStatusChanged event', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();
      lead.transitionStatus('contacted', 'Test reason', 'agent-123');

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('lead.status_changed');

      const payload = events[0]?.payload as Record<string, unknown>;
      expect(payload.previousStatus).toBe('new');
      expect(payload.newStatus).toBe('contacted');
      expect(payload.reason).toBe('Test reason');
    });
  });

  // ============================================================================
  // APPOINTMENT TESTS
  // ============================================================================

  describe('scheduleAppointment', () => {
    it('should schedule an appointment', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();
      const appointmentDate = new Date('2024-03-15T10:00:00Z');
      lead.scheduleAppointment(
        'apt-456',
        'consultation',
        appointmentDate,
        60,
        'Clinic A',
        'Dr. Smith'
      );

      expect(lead.status).toBe('scheduled');

      const events = lead.getUncommittedEvents();
      expect(events.some((e) => e.type === 'lead.appointment_scheduled')).toBe(true);
    });
  });

  // ============================================================================
  // CONVERSION TESTS
  // ============================================================================

  describe('convert', () => {
    it('should convert a lead to patient', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.qualify('Qualified for conversion');
      lead.clearUncommittedEvents();
      lead.convert('patient-789', 'dental_implants', 'apt-456', 5000);

      expect(lead.status).toBe('converted');
      expect(lead.isClosed()).toBe(true);

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('lead.converted');
    });

    it('should throw error when converting already converted lead', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.convert('patient-789', 'dental_implants');

      expect(() => {
        lead.convert('patient-999', 'dental_implants');
      }).toThrow(LeadAlreadyConvertedError);
    });

    it('should throw error when converting lost lead', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.markLost('no_response');

      expect(() => {
        lead.convert('patient-789', 'dental_implants');
      }).toThrow(LeadLostError);
    });
  });

  // ============================================================================
  // MARK LOST TESTS
  // ============================================================================

  describe('markLost', () => {
    it('should mark a lead as lost', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();
      lead.markLost('competitor', 'Chose another clinic');

      expect(lead.status).toBe('lost');
      expect(lead.isClosed()).toBe(true);

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('lead.lost');
    });

    it('should be idempotent for already lost leads', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.markLost('no_response');
      lead.clearUncommittedEvents();
      lead.markLost('price'); // Should not throw

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(0);
    });
  });

  // ============================================================================
  // SOFT DELETE TESTS
  // ============================================================================

  describe('softDelete', () => {
    it('should soft delete a lead', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.softDelete('GDPR request');

      expect(lead.isDeleted).toBe(true);
      expect(lead.canModify()).toBe(false);
    });

    it('should prevent modifications after soft delete', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.softDelete('GDPR request');

      expect(() => {
        lead.score(LeadScore.hot(), {
          method: 'ai',
          reasoning: 'Test',
          confidence: 0.9,
        });
      }).toThrow(LeadDeletedError);
    });

    it('should allow restore after soft delete', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.softDelete('Mistake');
      lead.restore();

      expect(lead.isDeleted).toBe(false);
      expect(lead.canModify()).toBe(true);
    });
  });

  // ============================================================================
  // QUERY METHOD TESTS
  // ============================================================================

  describe('query methods', () => {
    it('should correctly identify HOT leads', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      expect(lead.isHot()).toBe(false);

      lead.score(LeadScore.hot(), {
        method: 'ai',
        reasoning: 'Test',
        confidence: 0.9,
      });

      expect(lead.isHot()).toBe(true);
      expect(lead.requiresImmediateAttention()).toBe(true);
    });

    it('should correctly identify leads requiring nurturing', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.score(LeadScore.warm(), {
        method: 'ai',
        reasoning: 'Test',
        confidence: 0.8,
      });

      expect(lead.requiresNurturing()).toBe(true);
    });

    it('should return correct SLA response time', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.score(LeadScore.hot(), {
        method: 'ai',
        reasoning: 'Test',
        confidence: 0.9,
      });

      expect(lead.getSLAResponseTimeMinutes()).toBe(5);
    });
  });

  // ============================================================================
  // EVENT SOURCING TESTS
  // ============================================================================

  describe('event sourcing', () => {
    it('should reconstitute from events', () => {
      const originalLead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
        firstName: 'John',
      });

      originalLead.score(LeadScore.hot(), {
        method: 'ai',
        reasoning: 'High intent',
        confidence: 0.9,
      });

      originalLead.assign('agent-456', 'auto', 'HOT lead');

      const events = originalLead.getUncommittedEvents() as LeadDomainEvent[];

      // Reconstitute from events
      const reconstituted = LeadAggregateRoot.fromEvents('lead-123', events);

      expect(reconstituted.id).toBe('lead-123');
      expect(reconstituted.phone.e164).toBe('+40721234567');
      expect(reconstituted.firstName).toBe('John');
      expect(reconstituted.currentScore?.classification).toBe('HOT');
      expect(reconstituted.assignedTo).toBe('agent-456');
      expect(reconstituted.status).toBe('qualified');
    });

    it('should clear uncommitted events after persistence', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      expect(lead.getUncommittedEvents()).toHaveLength(1);

      lead.clearUncommittedEvents();

      expect(lead.getUncommittedEvents()).toHaveLength(0);
    });
  });

  // ============================================================================
  // FACTORY TESTS
  // ============================================================================

  describe('LeadFactory', () => {
    it('should create a lead using factory', () => {
      const factory = new LeadFactory();
      const lead = factory.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      expect(lead.id).toBe('lead-123');
    });

    it('should create a lead with generated ID', () => {
      const factory = new LeadFactory();
      const lead = factory.createWithGeneratedId({
        phone,
        source: 'whatsapp',
      });

      expect(lead.id).toMatch(/^lead-\d+-[a-z0-9]+$/);
    });

    it('should reconstitute from events using factory', () => {
      const factory = new LeadFactory();
      const original = factory.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      const events = original.getUncommittedEvents() as LeadDomainEvent[];
      const reconstituted = factory.reconstitute('lead-123', events);

      expect(reconstituted.id).toBe('lead-123');
      expect(reconstituted.phone.e164).toBe('+40721234567');
    });

    it('should create and restore from snapshot', () => {
      const factory = new LeadFactory();
      const original = factory.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
        firstName: 'John',
      });

      original.score(LeadScore.warm(), {
        method: 'ai',
        reasoning: 'General interest',
        confidence: 0.8,
      });

      const snapshot = factory.createSnapshot(original);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.id).toBe('lead-123');
      expect(restored.firstName).toBe('John');
      expect(restored.currentScore?.classification).toBe('WARM');
    });

    it('should use singleton factory instance', () => {
      const lead = leadFactory.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      expect(lead.id).toBe('lead-123');
    });
  });

  // ============================================================================
  // DEMOGRAPHICS TESTS
  // ============================================================================

  describe('updateDemographics', () => {
    it('should update lead demographics', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.updateDemographics({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        city: 'Bucharest',
        county: 'Ilfov',
      });

      expect(lead.firstName).toBe('Jane');
      expect(lead.lastName).toBe('Doe');
      expect(lead.fullName).toBe('Jane Doe');
      expect(lead.email).toBe('jane@example.com');
    });
  });

  // ============================================================================
  // HUBSPOT INTEGRATION TESTS
  // ============================================================================

  describe('linkToHubSpot', () => {
    it('should link lead to HubSpot', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.linkToHubSpot('hs-contact-123', 'hs-deal-456');

      expect(lead.hubspotContactId).toBe('hs-contact-123');
      expect(lead.hubspotDealId).toBe('hs-deal-456');
    });
  });

  // ============================================================================
  // CONVERSATION HISTORY TESTS
  // ============================================================================

  describe('addConversationEntry', () => {
    it('should add conversation entries', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.addConversationEntry({
        timestamp: new Date(),
        role: 'patient',
        channel: 'whatsapp',
        content: 'Hello, I need an appointment',
      });

      lead.addConversationEntry({
        timestamp: new Date(),
        role: 'assistant',
        channel: 'whatsapp',
        content: 'Sure, let me help you with that',
      });

      expect(lead.conversationHistory).toHaveLength(2);
      expect(lead.conversationHistory[0]?.role).toBe('patient');
      expect(lead.conversationHistory[1]?.role).toBe('assistant');
    });
  });

  // ============================================================================
  // MESSAGE RECEIVED TESTS
  // ============================================================================

  describe('receiveMessage', () => {
    it('should record a received message', () => {
      const lead = LeadAggregateRoot.create({
        id: 'lead-123',
        phone,
        source: 'whatsapp',
      });

      lead.clearUncommittedEvents();
      lead.receiveMessage('whatsapp', 'msg-123', 'I need an appointment ASAP', {
        language: 'en',
        sentiment: 'neutral',
        containsUrgency: true,
        containsBudgetMention: false,
      });

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('lead.message_received');

      const payload = events[0]?.payload as Record<string, unknown>;
      expect(payload.containsUrgency).toBe(true);
    });
  });
});
