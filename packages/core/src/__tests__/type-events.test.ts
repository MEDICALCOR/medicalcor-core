import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleEvent,
  handleEventPartial,
  handleEventAsync,
  createEvent,
  filterEventsByType,
  filterEventsByAggregate,
  filterEventsByAggregateType,
  filterEventsByTimeRange,
  isEventType,
  isLeadEvent,
  isAppointmentEvent,
  isConsentEvent,
  isPatientEvent,
  type DomainEvent,
  type LeadScoredEvent,
  type LeadCreatedEvent,
  type AppointmentScheduledEvent,
  type ConsentRecordedEvent,
  type PatientCreatedEvent,
  type EventHandlerMap,
  type PartialEventHandlerMap,
  type AsyncEventHandlerMap,
} from '../types/events.js';
import type {
  CorrelationId,
  E164PhoneNumber,
  LeadId,
  PatientId,
  LeadScore,
  ConfidenceScore,
  AppointmentId,
  ISOTimestamp,
  ConsentId,
} from '../types/branded.js';

describe('Type-Safe Event System', () => {
  const mockCorrelationId = 'corr-123' as CorrelationId;
  const mockPhone = '+40721123456' as E164PhoneNumber;
  const mockLeadId = 'lead-123' as LeadId;
  const mockPatientId = 'patient-123' as PatientId;

  const createMockLeadScoredEvent = (): LeadScoredEvent => ({
    id: 'evt-1',
    type: 'LeadScored',
    timestamp: '2024-06-15T10:00:00.000Z' as ISOTimestamp,
    correlationId: mockCorrelationId,
    version: 1,
    aggregateId: mockLeadId,
    aggregateType: 'Lead',
    payload: {
      leadId: mockLeadId,
      phone: mockPhone,
      channel: 'whatsapp',
      score: 4 as LeadScore,
      classification: 'HOT',
      confidence: 0.85 as ConfidenceScore,
      reasoning: 'High engagement',
      reasoningValidated: true,
      suggestedAction: 'Call immediately',
      source: 'ai-scorer',
    },
  });

  const createMockLeadCreatedEvent = (): LeadCreatedEvent => ({
    id: 'evt-2',
    type: 'LeadCreated',
    timestamp: '2024-06-15T09:00:00.000Z' as ISOTimestamp,
    correlationId: mockCorrelationId,
    version: 1,
    aggregateId: mockLeadId,
    aggregateType: 'Lead',
    payload: {
      leadId: mockLeadId,
      phone: mockPhone,
      channel: 'whatsapp',
      source: 'website',
    },
  });

  const createMockAppointmentEvent = (): AppointmentScheduledEvent => ({
    id: 'evt-3',
    type: 'AppointmentScheduled',
    timestamp: '2024-06-15T11:00:00.000Z' as ISOTimestamp,
    correlationId: mockCorrelationId,
    version: 1,
    aggregateId: 'apt-123' as AppointmentId,
    aggregateType: 'Appointment',
    payload: {
      appointmentId: 'apt-123' as AppointmentId,
      patientId: mockPatientId,
      serviceType: 'consultation',
      dateTime: '2024-06-20T10:00:00.000Z' as ISOTimestamp,
      doctor: { id: 'doc-1', name: 'Dr. Smith' },
      location: 'Main Clinic',
      source: 'booking-system',
      consentVerified: true,
    },
  });

  const createMockConsentEvent = (): ConsentRecordedEvent => ({
    id: 'evt-4',
    type: 'ConsentRecorded',
    timestamp: '2024-06-15T08:00:00.000Z' as ISOTimestamp,
    correlationId: mockCorrelationId,
    version: 1,
    aggregateId: mockPatientId,
    aggregateType: 'Consent',
    payload: {
      consentId: 'consent-123' as ConsentId,
      patientId: mockPatientId,
      phone: mockPhone,
      consentType: 'data_processing',
      status: 'granted',
      source: 'web-form',
      recordedAt: '2024-06-15T08:00:00.000Z' as ISOTimestamp,
    },
  });

  const createMockPatientEvent = (): PatientCreatedEvent => ({
    id: 'evt-5',
    type: 'PatientCreated',
    timestamp: '2024-06-15T07:00:00.000Z' as ISOTimestamp,
    correlationId: mockCorrelationId,
    version: 1,
    aggregateId: mockPatientId,
    aggregateType: 'Patient',
    payload: {
      patientId: mockPatientId,
      firstName: 'John',
      lastName: 'Doe',
      phone: mockPhone,
      source: 'lead-conversion',
    },
  });

  describe('handleEvent', () => {
    it('should dispatch event to correct handler', () => {
      const event = createMockLeadScoredEvent();
      const handlers: EventHandlerMap<string> = {
        LeadScored: (e) => `scored: ${e.payload.score}`,
        LeadCreated: () => 'created',
        LeadQualified: () => 'qualified',
        LeadDisqualified: () => 'disqualified',
        AppointmentScheduled: () => 'scheduled',
        AppointmentCancelled: () => 'cancelled',
        AppointmentRescheduled: () => 'rescheduled',
        AppointmentCompleted: () => 'completed',
        AppointmentConsentViolation: () => 'violation',
        ConsentRecorded: () => 'recorded',
        ConsentWithdrawn: () => 'withdrawn',
        WhatsAppMessageSent: () => 'sent',
        WhatsAppMessageReceived: () => 'received',
        WorkflowTriggered: () => 'triggered',
        WorkflowCompleted: () => 'wf-completed',
        AIOutputValidationIssue: () => 'ai-issue',
        AIReasoningValidationFailed: () => 'ai-failed',
        PatientCreated: () => 'patient-created',
        PatientUpdated: () => 'patient-updated',
      };

      const result = handleEvent(event, handlers);
      expect(result).toBe('scored: 4');
    });
  });

  describe('handleEventPartial', () => {
    it('should handle event when handler exists', () => {
      const event = createMockLeadScoredEvent();
      const handlers: PartialEventHandlerMap<string> = {
        LeadScored: (e) => `Lead scored: ${e.payload.classification}`,
      };

      const result = handleEventPartial(event, handlers);
      expect(result).toBe('Lead scored: HOT');
    });

    it('should return undefined when handler does not exist', () => {
      const event = createMockLeadScoredEvent();
      const handlers: PartialEventHandlerMap<string> = {
        LeadCreated: () => 'created',
      };

      const result = handleEventPartial(event, handlers);
      expect(result).toBeUndefined();
    });
  });

  describe('handleEventAsync', () => {
    it('should handle async event handlers', async () => {
      const event = createMockLeadScoredEvent();
      const handlers: AsyncEventHandlerMap<string> = {
        LeadScored: async (e) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `async scored: ${e.payload.score}`;
        },
        LeadCreated: async () => 'created',
        LeadQualified: async () => 'qualified',
        LeadDisqualified: async () => 'disqualified',
        AppointmentScheduled: async () => 'scheduled',
        AppointmentCancelled: async () => 'cancelled',
        AppointmentRescheduled: async () => 'rescheduled',
        AppointmentCompleted: async () => 'completed',
        AppointmentConsentViolation: async () => 'violation',
        ConsentRecorded: async () => 'recorded',
        ConsentWithdrawn: async () => 'withdrawn',
        WhatsAppMessageSent: async () => 'sent',
        WhatsAppMessageReceived: async () => 'received',
        WorkflowTriggered: async () => 'triggered',
        WorkflowCompleted: async () => 'completed',
        AIOutputValidationIssue: async () => 'ai-issue',
        AIReasoningValidationFailed: async () => 'ai-failed',
        PatientCreated: async () => 'patient-created',
        PatientUpdated: async () => 'patient-updated',
      };

      const result = await handleEventAsync(event, handlers);
      expect(result).toBe('async scored: 4');
    });
  });

  describe('createEvent', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));
    });

    it('should create event with auto-generated ID and timestamp', () => {
      const event = createEvent('LeadScored', mockCorrelationId, {
        leadId: mockLeadId,
        phone: mockPhone,
        channel: 'whatsapp',
        score: 4 as LeadScore,
        classification: 'HOT',
        confidence: 0.85 as ConfidenceScore,
        reasoning: 'test',
        reasoningValidated: true,
        suggestedAction: 'call',
        source: 'test',
      });

      expect(event.type).toBe('LeadScored');
      expect(event.correlationId).toBe(mockCorrelationId);
      expect(event.version).toBe(1);
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it('should use provided options', () => {
      const event = createEvent(
        'LeadCreated',
        mockCorrelationId,
        {
          leadId: mockLeadId,
          phone: mockPhone,
          channel: 'web',
          source: 'test',
        },
        {
          aggregateId: 'agg-123',
          aggregateType: 'Lead',
          version: 2,
        }
      );

      expect(event.aggregateId).toBe('agg-123');
      expect(event.aggregateType).toBe('Lead');
      expect(event.version).toBe(2);
    });

    vi.useRealTimers();
  });

  describe('filterEventsByType', () => {
    it('should filter events by type', () => {
      const events: DomainEvent[] = [
        createMockLeadScoredEvent(),
        createMockLeadCreatedEvent(),
        createMockAppointmentEvent(),
      ];

      const filtered = filterEventsByType(events, 'LeadScored');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe('LeadScored');
    });

    it('should return empty array when no matches', () => {
      const events: DomainEvent[] = [createMockLeadScoredEvent()];

      const filtered = filterEventsByType(events, 'PatientCreated');

      expect(filtered).toHaveLength(0);
    });
  });

  describe('filterEventsByAggregate', () => {
    it('should filter events by aggregate ID', () => {
      const events: DomainEvent[] = [
        createMockLeadScoredEvent(),
        createMockLeadCreatedEvent(),
        createMockAppointmentEvent(),
      ];

      const filtered = filterEventsByAggregate(events, mockLeadId);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((e) => e.aggregateId === mockLeadId)).toBe(true);
    });
  });

  describe('filterEventsByAggregateType', () => {
    it('should filter events by aggregate type', () => {
      const events: DomainEvent[] = [
        createMockLeadScoredEvent(),
        createMockLeadCreatedEvent(),
        createMockAppointmentEvent(),
        createMockConsentEvent(),
      ];

      const filtered = filterEventsByAggregateType(events, 'Lead');

      expect(filtered).toHaveLength(2);
      expect(filtered.every((e) => e.aggregateType === 'Lead')).toBe(true);
    });
  });

  describe('filterEventsByTimeRange', () => {
    it('should filter events within time range', () => {
      const events: DomainEvent[] = [
        createMockPatientEvent(), // 07:00
        createMockConsentEvent(), // 08:00
        createMockLeadCreatedEvent(), // 09:00
        createMockLeadScoredEvent(), // 10:00
        createMockAppointmentEvent(), // 11:00
      ];

      const start = new Date('2024-06-15T08:30:00.000Z');
      const end = new Date('2024-06-15T10:30:00.000Z');

      const filtered = filterEventsByTimeRange(events, start, end);

      expect(filtered).toHaveLength(2);
    });

    it('should include events at exact boundaries', () => {
      const events: DomainEvent[] = [createMockLeadScoredEvent()];

      const start = new Date('2024-06-15T10:00:00.000Z');
      const end = new Date('2024-06-15T10:00:00.000Z');

      const filtered = filterEventsByTimeRange(events, start, end);

      expect(filtered).toHaveLength(1);
    });
  });

  describe('isEventType', () => {
    it('should return true for matching type', () => {
      const event = createMockLeadScoredEvent();
      expect(isEventType(event, 'LeadScored')).toBe(true);
    });

    it('should return false for non-matching type', () => {
      const event = createMockLeadScoredEvent();
      expect(isEventType(event, 'LeadCreated')).toBe(false);
    });
  });

  describe('isLeadEvent', () => {
    it('should return true for lead events', () => {
      const scoredEvent = createMockLeadScoredEvent();
      const createdEvent = createMockLeadCreatedEvent();

      expect(isLeadEvent(scoredEvent)).toBe(true);
      expect(isLeadEvent(createdEvent)).toBe(true);
    });

    it('should return false for non-lead events', () => {
      const appointmentEvent = createMockAppointmentEvent();
      expect(isLeadEvent(appointmentEvent)).toBe(false);
    });
  });

  describe('isAppointmentEvent', () => {
    it('should return true for appointment events', () => {
      const event = createMockAppointmentEvent();
      expect(isAppointmentEvent(event)).toBe(true);
    });

    it('should return false for non-appointment events', () => {
      const event = createMockLeadScoredEvent();
      expect(isAppointmentEvent(event)).toBe(false);
    });
  });

  describe('isConsentEvent', () => {
    it('should return true for consent events', () => {
      const event = createMockConsentEvent();
      expect(isConsentEvent(event)).toBe(true);
    });

    it('should return false for non-consent events', () => {
      const event = createMockLeadScoredEvent();
      expect(isConsentEvent(event)).toBe(false);
    });
  });

  describe('isPatientEvent', () => {
    it('should return true for patient events', () => {
      const event = createMockPatientEvent();
      expect(isPatientEvent(event)).toBe(true);
    });

    it('should return false for non-patient events', () => {
      const event = createMockLeadScoredEvent();
      expect(isPatientEvent(event)).toBe(false);
    });
  });
});
