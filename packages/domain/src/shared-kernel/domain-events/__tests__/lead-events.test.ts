/**
 * @fileoverview Tests for Lead Domain Events
 *
 * Comprehensive tests for lead event factories, type guards, and metadata creation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEventMetadata,
  createLeadCreatedEvent,
  createLeadScoredEvent,
  createLeadQualifiedEvent,
  createLeadStatusChangedEvent,
  createLeadConvertedEvent,
  isLeadCreatedEvent,
  isLeadScoredEvent,
  isLeadQualifiedEvent,
  isLeadStatusChangedEvent,
  isLeadConvertedEvent,
} from '../lead-events.js';
import type {
  EventMetadata,
  LeadCreatedPayload,
  LeadScoredPayload,
  LeadQualifiedPayload,
  LeadStatusChangedPayload,
  LeadConvertedPayload,
  LeadDomainEvent,
  LeadAssignedPayload,
  LeadLostPayload,
  LeadContactedPayload,
  LeadMessageReceivedPayload,
  LeadAppointmentScheduledPayload,
  LeadAppointmentCancelledPayload,
} from '../lead-events.js';

describe('Lead Domain Events', () => {
  const mockCorrelationId = 'corr-123';
  const mockSource = 'lead-service';
  const mockCausationId = 'cause-456';
  const mockActor = 'user-789';
  const mockAggregateId = 'lead-001';

  // Mock crypto.randomUUID
  const mockUUID = 'mock-uuid-1234-5678-9012';
  const mockRandomUUID = vi.fn().mockReturnValue(mockUUID);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));

    // Use stubGlobal for crypto mocking
    vi.stubGlobal('crypto', {
      randomUUID: mockRandomUUID,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mockRandomUUID.mockClear();
  });

  // ==========================================================================
  // METADATA TESTS
  // ==========================================================================

  describe('createEventMetadata', () => {
    it('should create metadata with required fields', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);

      expect(metadata.eventId).toBe(mockUUID);
      expect(metadata.timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(metadata.correlationId).toBe(mockCorrelationId);
      expect(metadata.idempotencyKey).toContain(mockSource);
      expect(metadata.idempotencyKey).toContain(mockCorrelationId);
      expect(metadata.version).toBe(1);
      expect(metadata.source).toBe(mockSource);
    });

    it('should include causationId when provided', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource, mockCausationId);

      expect(metadata.causationId).toBe(mockCausationId);
    });

    it('should include actor when provided (without causationId)', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource, undefined, mockActor);

      expect(metadata.actor).toBe(mockActor);
      expect(metadata.causationId).toBeUndefined();
    });

    it('should prioritize causationId over actor when both provided', () => {
      const metadata = createEventMetadata(
        mockCorrelationId,
        mockSource,
        mockCausationId,
        mockActor
      );

      expect(metadata.causationId).toBe(mockCausationId);
      // Due to the implementation, actor is not added when causationId is present
    });

    it('should generate unique idempotency keys', () => {
      let callCount = 0;
      mockRandomUUID.mockImplementation(() => {
        callCount++;
        return `uuid-${callCount}`;
      });

      const metadata1 = createEventMetadata(mockCorrelationId, mockSource);
      const metadata2 = createEventMetadata(mockCorrelationId, mockSource);

      expect(metadata1.idempotencyKey).not.toBe(metadata2.idempotencyKey);
    });

    it('should handle different source services', () => {
      const sources = ['scoring-service', 'webhook-handler', 'api-gateway', 'trigger-workflow'];

      for (const source of sources) {
        const metadata = createEventMetadata(mockCorrelationId, source);
        expect(metadata.source).toBe(source);
        expect(metadata.idempotencyKey).toContain(source);
      }
    });
  });

  // ==========================================================================
  // UUID FALLBACK TEST
  // ==========================================================================

  describe('UUID generation fallback', () => {
    it('should use fallback UUID generation when crypto.randomUUID is unavailable', () => {
      // Remove randomUUID to test fallback
      vi.stubGlobal('crypto', {
        randomUUID: undefined,
      });

      const metadata = createEventMetadata(mockCorrelationId, mockSource);

      expect(metadata.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION TESTS
  // ==========================================================================

  describe('createLeadCreatedEvent', () => {
    it('should create a LeadCreated event with required fields', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const payload: LeadCreatedPayload = {
        phone: '+40721000000',
        source: 'whatsapp',
      };

      const event = createLeadCreatedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('lead.created');
      expect(event.aggregateId).toBe(mockAggregateId);
      expect(event.aggregateType).toBe('Lead');
      expect(event.metadata).toBe(metadata);
      expect(event.payload).toEqual(payload);
    });

    it('should create a LeadCreated event with all optional fields', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const payload: LeadCreatedPayload = {
        phone: '+40721000000',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        source: 'web_form',
        hubspotContactId: 'hs-12345',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'dental-implants-2024',
        language: 'ro',
      };

      const event = createLeadCreatedEvent(mockAggregateId, payload, metadata);

      expect(event.payload.email).toBe('test@example.com');
      expect(event.payload.firstName).toBe('John');
      expect(event.payload.lastName).toBe('Doe');
      expect(event.payload.utmSource).toBe('google');
    });

    it('should support all lead sources', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const sources = [
        'whatsapp',
        'voice',
        'web_form',
        'hubspot',
        'facebook',
        'google',
        'referral',
        'manual',
      ] as const;

      for (const source of sources) {
        const payload: LeadCreatedPayload = {
          phone: '+40721000000',
          source,
        };

        const event = createLeadCreatedEvent(mockAggregateId, payload, metadata);
        expect(event.payload.source).toBe(source);
      }
    });

    it('should support all languages', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const languages = ['ro', 'en', 'de'] as const;

      for (const language of languages) {
        const payload: LeadCreatedPayload = {
          phone: '+40721000000',
          source: 'web_form',
          language,
        };

        const event = createLeadCreatedEvent(mockAggregateId, payload, metadata);
        expect(event.payload.language).toBe(language);
      }
    });
  });

  describe('createLeadScoredEvent', () => {
    it('should create a LeadScored event with required fields', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const payload: LeadScoredPayload = {
        phone: '+40721000000',
        channel: 'whatsapp',
        score: 4,
        classification: 'HOT',
        confidence: 0.85,
        method: 'ai',
        reasoning: 'High urgency detected with budget confirmation',
        suggestedAction: 'Call within 15 minutes',
        containsUrgency: true,
        containsBudgetMention: true,
      };

      const event = createLeadScoredEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('lead.scored');
      expect(event.aggregateId).toBe(mockAggregateId);
      expect(event.aggregateType).toBe('Lead');
      expect(event.payload.score).toBe(4);
      expect(event.payload.classification).toBe('HOT');
    });

    it('should support all classifications', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const classifications = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'] as const;
      const scores = [5, 3, 2, 1] as const;

      for (let i = 0; i < classifications.length; i++) {
        const payload: LeadScoredPayload = {
          phone: '+40721000000',
          channel: 'web',
          score: scores[i],
          classification: classifications[i],
          confidence: 0.8,
          method: 'rule_based',
          reasoning: `Test ${classifications[i]}`,
          suggestedAction: 'Test action',
          containsUrgency: false,
          containsBudgetMention: false,
        };

        const event = createLeadScoredEvent(mockAggregateId, payload, metadata);
        expect(event.payload.classification).toBe(classifications[i]);
      }
    });

    it('should support all scoring methods', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const methods = ['ai', 'rule_based', 'manual'] as const;

      for (const method of methods) {
        const payload: LeadScoredPayload = {
          phone: '+40721000000',
          channel: 'voice',
          score: 3,
          classification: 'WARM',
          confidence: 0.7,
          method,
          reasoning: `Scored by ${method}`,
          suggestedAction: 'Follow up',
          containsUrgency: false,
          containsBudgetMention: false,
        };

        const event = createLeadScoredEvent(mockAggregateId, payload, metadata);
        expect(event.payload.method).toBe(method);
      }
    });

    it('should handle rescoring with previous values', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const payload: LeadScoredPayload = {
        phone: '+40721000000',
        channel: 'whatsapp',
        score: 5,
        classification: 'HOT',
        confidence: 0.95,
        method: 'ai',
        reasoning: 'Upgraded score after budget confirmation',
        suggestedAction: 'Priority callback',
        containsUrgency: true,
        containsBudgetMention: true,
        previousScore: 3,
        previousClassification: 'WARM',
      };

      const event = createLeadScoredEvent(mockAggregateId, payload, metadata);
      expect(event.payload.previousScore).toBe(3);
      expect(event.payload.previousClassification).toBe('WARM');
    });
  });

  describe('createLeadQualifiedEvent', () => {
    it('should create a LeadQualified event', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const payload: LeadQualifiedPayload = {
        phone: '+40721000000',
        hubspotContactId: 'hs-12345',
        score: 5,
        classification: 'HOT',
        qualificationReason: 'High intent with procedure interest and budget',
        procedureInterest: ['All-on-4', 'Dental implants'],
        estimatedValue: 25000,
        assignedTo: 'agent-001',
      };

      const event = createLeadQualifiedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('lead.qualified');
      expect(event.payload.classification).toBe('HOT');
      expect(event.payload.procedureInterest).toContain('All-on-4');
    });
  });

  describe('createLeadStatusChangedEvent', () => {
    it('should create a LeadStatusChanged event', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const payload: LeadStatusChangedPayload = {
        phone: '+40721000000',
        previousStatus: 'new',
        newStatus: 'contacted',
        reason: 'First outbound call made',
        changedBy: 'agent-001',
      };

      const event = createLeadStatusChangedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('lead.status_changed');
      expect(event.payload.previousStatus).toBe('new');
      expect(event.payload.newStatus).toBe('contacted');
    });

    it('should support all lead statuses', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const statuses = [
        'new',
        'contacted',
        'qualified',
        'nurturing',
        'scheduled',
        'converted',
        'lost',
        'invalid',
      ] as const;

      for (let i = 0; i < statuses.length - 1; i++) {
        const payload: LeadStatusChangedPayload = {
          phone: '+40721000000',
          previousStatus: statuses[i],
          newStatus: statuses[i + 1],
        };

        const event = createLeadStatusChangedEvent(mockAggregateId, payload, metadata);
        expect(event.payload.newStatus).toBe(statuses[i + 1]);
      }
    });
  });

  describe('createLeadConvertedEvent', () => {
    it('should create a LeadConverted event', () => {
      const metadata = createEventMetadata(mockCorrelationId, mockSource);
      const payload: LeadConvertedPayload = {
        phone: '+40721000000',
        hubspotContactId: 'hs-12345',
        patientId: 'patient-001',
        procedure: 'All-on-4',
        appointmentId: 'appt-001',
        conversionValue: 25000,
        timeToConvertDays: 14,
        touchpoints: 7,
      };

      const event = createLeadConvertedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('lead.converted');
      expect(event.payload.patientId).toBe('patient-001');
      expect(event.payload.timeToConvertDays).toBe(14);
      expect(event.payload.touchpoints).toBe(7);
    });
  });

  // ==========================================================================
  // TYPE GUARD TESTS
  // ==========================================================================

  describe('Type Guards', () => {
    const baseMetadata: EventMetadata = {
      eventId: 'evt-001',
      timestamp: '2024-01-15T10:30:00.000Z',
      correlationId: 'corr-123',
      idempotencyKey: 'key-123',
      version: 1,
      source: 'lead-service',
    };

    describe('isLeadCreatedEvent', () => {
      it('should return true for LeadCreated events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.created',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            source: 'whatsapp',
          },
        };

        expect(isLeadCreatedEvent(event)).toBe(true);
      });

      it('should return false for non-LeadCreated events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.scored',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            channel: 'whatsapp',
            score: 4,
            classification: 'HOT',
            confidence: 0.85,
            method: 'ai',
            reasoning: 'Test',
            suggestedAction: 'Call',
            containsUrgency: false,
            containsBudgetMention: false,
          },
        };

        expect(isLeadCreatedEvent(event)).toBe(false);
      });
    });

    describe('isLeadScoredEvent', () => {
      it('should return true for LeadScored events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.scored',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            channel: 'voice',
            score: 3,
            classification: 'WARM',
            confidence: 0.7,
            method: 'rule_based',
            reasoning: 'Test',
            suggestedAction: 'Follow up',
            containsUrgency: false,
            containsBudgetMention: false,
          },
        };

        expect(isLeadScoredEvent(event)).toBe(true);
      });

      it('should return false for non-LeadScored events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.created',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            source: 'whatsapp',
          },
        };

        expect(isLeadScoredEvent(event)).toBe(false);
      });
    });

    describe('isLeadQualifiedEvent', () => {
      it('should return true for LeadQualified events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.qualified',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            score: 5,
            classification: 'HOT',
            qualificationReason: 'Test',
            procedureInterest: ['All-on-4'],
          },
        };

        expect(isLeadQualifiedEvent(event)).toBe(true);
      });

      it('should return false for non-LeadQualified events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.status_changed',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            previousStatus: 'new',
            newStatus: 'contacted',
          },
        };

        expect(isLeadQualifiedEvent(event)).toBe(false);
      });
    });

    describe('isLeadStatusChangedEvent', () => {
      it('should return true for LeadStatusChanged events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.status_changed',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            previousStatus: 'contacted',
            newStatus: 'qualified',
          },
        };

        expect(isLeadStatusChangedEvent(event)).toBe(true);
      });

      it('should return false for non-LeadStatusChanged events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.converted',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            patientId: 'patient-001',
            procedure: 'Implants',
            timeToConvertDays: 14,
            touchpoints: 5,
          },
        };

        expect(isLeadStatusChangedEvent(event)).toBe(false);
      });
    });

    describe('isLeadConvertedEvent', () => {
      it('should return true for LeadConverted events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.converted',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            patientId: 'patient-001',
            procedure: 'All-on-X',
            timeToConvertDays: 21,
            touchpoints: 10,
          },
        };

        expect(isLeadConvertedEvent(event)).toBe(true);
      });

      it('should return false for non-LeadConverted events', () => {
        const event: LeadDomainEvent = {
          type: 'lead.qualified',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            score: 5,
            classification: 'HOT',
            qualificationReason: 'High intent',
            procedureInterest: ['Implants'],
          },
        };

        expect(isLeadConvertedEvent(event)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // INTERFACE TESTS FOR EVENTS WITHOUT FACTORIES
  // ==========================================================================

  describe('LeadAssignedPayload interface', () => {
    it('should match expected shape', () => {
      const payload: LeadAssignedPayload = {
        phone: '+40721000000',
        hubspotContactId: 'hs-12345',
        assignedTo: 'agent-001',
        assignedBy: 'auto',
        reason: 'Round-robin assignment',
        priority: 'high',
        slaDeadline: '2024-01-15T11:30:00.000Z',
      };

      expect(payload.priority).toBe('high');
    });

    it('should support all priorities', () => {
      const priorities = ['critical', 'high', 'medium', 'low'] as const;

      for (const priority of priorities) {
        const payload: LeadAssignedPayload = {
          phone: '+40721000000',
          assignedTo: 'agent-001',
          assignedBy: 'manual',
          reason: 'Manual assignment',
          priority,
          slaDeadline: '2024-01-15T12:00:00.000Z',
        };

        expect(payload.priority).toBe(priority);
      }
    });
  });

  describe('LeadLostPayload interface', () => {
    it('should match expected shape', () => {
      const payload: LeadLostPayload = {
        phone: '+40721000000',
        reason: 'no_response',
        reasonDetails: 'No response after 5 contact attempts',
        lastContactAt: '2024-01-14T15:00:00.000Z',
        totalTouchpoints: 5,
      };

      expect(payload.reason).toBe('no_response');
    });

    it('should support all loss reasons', () => {
      const reasons = [
        'no_response',
        'competitor',
        'price',
        'timing',
        'invalid',
        'duplicate',
        'other',
      ] as const;

      for (const reason of reasons) {
        const payload: LeadLostPayload = {
          phone: '+40721000000',
          reason,
          totalTouchpoints: 3,
        };

        expect(payload.reason).toBe(reason);
      }
    });
  });

  describe('LeadContactedPayload interface', () => {
    it('should match expected shape for outbound call', () => {
      const payload: LeadContactedPayload = {
        phone: '+40721000000',
        channel: 'voice',
        direction: 'outbound',
        duration: 180,
        outcome: 'connected',
      };

      expect(payload.outcome).toBe('connected');
    });

    it('should support all channels', () => {
      const channels = ['whatsapp', 'voice', 'sms', 'email'] as const;

      for (const channel of channels) {
        const payload: LeadContactedPayload = {
          phone: '+40721000000',
          channel,
          direction: 'inbound',
        };

        expect(payload.channel).toBe(channel);
      }
    });

    it('should support all call outcomes', () => {
      const outcomes = ['connected', 'voicemail', 'no_answer', 'busy'] as const;

      for (const outcome of outcomes) {
        const payload: LeadContactedPayload = {
          phone: '+40721000000',
          channel: 'voice',
          direction: 'outbound',
          outcome,
        };

        expect(payload.outcome).toBe(outcome);
      }
    });
  });

  describe('LeadMessageReceivedPayload interface', () => {
    it('should match expected shape', () => {
      const payload: LeadMessageReceivedPayload = {
        phone: '+40721000000',
        channel: 'whatsapp',
        messageId: 'msg-12345',
        content: 'I am interested in dental implants',
        language: 'en',
        sentiment: 'positive',
        containsUrgency: true,
        containsBudgetMention: true,
      };

      expect(payload.sentiment).toBe('positive');
    });

    it('should support all sentiments', () => {
      const sentiments = ['positive', 'neutral', 'negative'] as const;

      for (const sentiment of sentiments) {
        const payload: LeadMessageReceivedPayload = {
          phone: '+40721000000',
          channel: 'web',
          messageId: 'msg-001',
          content: 'Test message',
          sentiment,
          containsUrgency: false,
          containsBudgetMention: false,
        };

        expect(payload.sentiment).toBe(sentiment);
      }
    });
  });

  describe('LeadAppointmentScheduledPayload interface', () => {
    it('should match expected shape', () => {
      const payload: LeadAppointmentScheduledPayload = {
        phone: '+40721000000',
        appointmentId: 'appt-001',
        appointmentType: 'Consultation',
        scheduledFor: '2024-01-20T09:00:00.000Z',
        duration: 60,
        location: 'Clinic A',
        provider: 'Dr. Smith',
        confirmationSent: true,
      };

      expect(payload.confirmationSent).toBe(true);
    });
  });

  describe('LeadAppointmentCancelledPayload interface', () => {
    it('should match expected shape', () => {
      const payload: LeadAppointmentCancelledPayload = {
        phone: '+40721000000',
        appointmentId: 'appt-001',
        reason: 'Patient requested reschedule',
        cancelledBy: 'patient',
        rescheduled: true,
        newAppointmentId: 'appt-002',
      };

      expect(payload.rescheduled).toBe(true);
    });

    it('should support all cancellation sources', () => {
      const sources = ['patient', 'clinic', 'system'] as const;

      for (const cancelledBy of sources) {
        const payload: LeadAppointmentCancelledPayload = {
          phone: '+40721000000',
          appointmentId: 'appt-001',
          reason: 'Test cancellation',
          cancelledBy,
          rescheduled: false,
        };

        expect(payload.cancelledBy).toBe(cancelledBy);
      }
    });
  });

  // ==========================================================================
  // UNION TYPE TESTS
  // ==========================================================================

  describe('LeadDomainEvent union type', () => {
    it('should support all event types', () => {
      const baseMetadata: EventMetadata = {
        eventId: 'evt-001',
        timestamp: '2024-01-15T10:30:00.000Z',
        correlationId: 'corr-123',
        idempotencyKey: 'key-123',
        version: 1,
        source: 'lead-service',
      };

      const events: LeadDomainEvent[] = [
        {
          type: 'lead.created',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: { phone: '+40721000000', source: 'whatsapp' },
        },
        {
          type: 'lead.scored',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            channel: 'whatsapp',
            score: 4,
            classification: 'HOT',
            confidence: 0.85,
            method: 'ai',
            reasoning: 'Test',
            suggestedAction: 'Call',
            containsUrgency: false,
            containsBudgetMention: false,
          },
        },
        {
          type: 'lead.qualified',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            score: 5,
            classification: 'HOT',
            qualificationReason: 'High intent',
            procedureInterest: ['Implants'],
          },
        },
        {
          type: 'lead.assigned',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            assignedTo: 'agent-001',
            assignedBy: 'auto',
            reason: 'Round robin',
            priority: 'high',
            slaDeadline: '2024-01-15T12:00:00.000Z',
          },
        },
        {
          type: 'lead.status_changed',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: { phone: '+40721000000', previousStatus: 'new', newStatus: 'contacted' },
        },
        {
          type: 'lead.converted',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            patientId: 'patient-001',
            procedure: 'Implants',
            timeToConvertDays: 14,
            touchpoints: 5,
          },
        },
        {
          type: 'lead.lost',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: { phone: '+40721000000', reason: 'no_response', totalTouchpoints: 5 },
        },
        {
          type: 'lead.contacted',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: { phone: '+40721000000', channel: 'voice', direction: 'outbound' },
        },
        {
          type: 'lead.message_received',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            channel: 'whatsapp',
            messageId: 'msg-001',
            content: 'Test',
            containsUrgency: false,
            containsBudgetMention: false,
          },
        },
        {
          type: 'lead.appointment_scheduled',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            appointmentId: 'appt-001',
            appointmentType: 'Consultation',
            scheduledFor: '2024-01-20T09:00:00.000Z',
            duration: 60,
            confirmationSent: true,
          },
        },
        {
          type: 'lead.appointment_cancelled',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            phone: '+40721000000',
            appointmentId: 'appt-001',
            reason: 'Patient request',
            cancelledBy: 'patient',
            rescheduled: false,
          },
        },
      ];

      expect(events).toHaveLength(11);

      // Verify all event types are unique
      const eventTypes = events.map((e) => e.type);
      const uniqueTypes = new Set(eventTypes);
      expect(uniqueTypes.size).toBe(11);
    });
  });
});
