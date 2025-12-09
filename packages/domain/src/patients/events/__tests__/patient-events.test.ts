/**
 * @fileoverview Tests for Patient Domain Events
 *
 * Tests factory functions and type guards for patient events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPatientRegisteredEvent,
  createPatientActivatedEvent,
  createPatientStatusChangedEvent,
  createPatientTreatmentStartedEvent,
  createPatientTreatmentCompletedEvent,
  createPatientAppointmentScheduledEvent,
  createPatientAppointmentCompletedEvent,
  isPatientRegisteredEvent,
  isPatientActivatedEvent,
  isPatientStatusChangedEvent,
  isPatientTreatmentStartedEvent,
  isPatientTreatmentCompletedEvent,
  isPatientAppointmentScheduledEvent,
  isPatientLifecycleEvent,
  isPatientTreatmentEvent,
  isPatientAppointmentEvent,
  type PatientDomainEvent,
  type PatientRegisteredPayload,
  type PatientActivatedPayload,
  type PatientStatusChangedPayload,
  type PatientTreatmentStartedPayload,
  type PatientTreatmentCompletedPayload,
  type PatientAppointmentScheduledPayload,
  type PatientAppointmentCompletedPayload,
} from '../patient-events.js';
import type { EventMetadata } from '../../../shared-kernel/domain-events/lead-events.js';

describe('patient-events', () => {
  const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
  const mockTimestamp = '2024-01-15T10:30:00.000Z';
  const mockRandomUUID = vi.fn().mockReturnValue(mockUUID);

  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockTimestamp));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  const metadata: EventMetadata = {
    eventId: mockUUID,
    timestamp: mockTimestamp,
    correlationId: 'corr-123',
    idempotencyKey: 'idem-123',
    version: 1,
    source: 'patient-service',
  };

  describe('createPatientRegisteredEvent', () => {
    const payload: PatientRegisteredPayload = {
      leadId: 'lead-001',
      phone: '+40721000000',
      email: 'patient@example.com',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1985-03-15',
      conversionProcedure: 'All-on-X',
      assignedProviderId: 'provider-001',
      source: 'lead_conversion',
      hubspotContactId: 'hubspot-123',
      initialAppointmentId: 'appt-001',
    };

    it('should create patient registered event', () => {
      const event = createPatientRegisteredEvent('patient-001', payload, metadata);

      expect(event.type).toBe('patient.registered');
      expect(event.aggregateId).toBe('patient-001');
      expect(event.aggregateType).toBe('Patient');
      expect(event.payload.firstName).toBe('John');
      expect(event.payload.source).toBe('lead_conversion');
    });

    it('should support all source types', () => {
      const sources = ['lead_conversion', 'direct_registration', 'referral', 'transfer'] as const;

      sources.forEach((source) => {
        const event = createPatientRegisteredEvent('patient-001', { ...payload, source }, metadata);
        expect(event.payload.source).toBe(source);
      });
    });
  });

  describe('createPatientActivatedEvent', () => {
    const payload: PatientActivatedPayload = {
      phone: '+40721000000',
      activationReason: 'First appointment completed',
      firstAppointmentId: 'appt-001',
      primaryProviderId: 'provider-001',
    };

    it('should create patient activated event', () => {
      const event = createPatientActivatedEvent('patient-001', payload, metadata);

      expect(event.type).toBe('patient.activated');
      expect(event.aggregateType).toBe('Patient');
      expect(event.payload.activationReason).toBe('First appointment completed');
    });
  });

  describe('createPatientStatusChangedEvent', () => {
    const payload: PatientStatusChangedPayload = {
      phone: '+40721000000',
      previousStatus: 'active',
      newStatus: 'under_treatment',
      reason: 'Started All-on-X treatment',
      changedBy: 'provider-001',
    };

    it('should create patient status changed event', () => {
      const event = createPatientStatusChangedEvent('patient-001', payload, metadata);

      expect(event.type).toBe('patient.status_changed');
      expect(event.payload.previousStatus).toBe('active');
      expect(event.payload.newStatus).toBe('under_treatment');
    });

    it('should support all status transitions', () => {
      const statuses = [
        'registered',
        'active',
        'under_treatment',
        'post_treatment',
        'inactive',
        'archived',
      ] as const;

      statuses.forEach((status) => {
        const event = createPatientStatusChangedEvent(
          'patient-001',
          { ...payload, newStatus: status },
          metadata
        );
        expect(event.payload.newStatus).toBe(status);
      });
    });
  });

  describe('createPatientTreatmentStartedEvent', () => {
    const payload: PatientTreatmentStartedPayload = {
      phone: '+40721000000',
      treatmentPlanId: 'plan-001',
      procedureType: 'All-on-X',
      providerId: 'provider-001',
      estimatedCompletionDate: '2024-06-15',
      estimatedCost: 15000,
      phases: ['Evaluation', 'Surgery', 'Prosthetics', 'Follow-up'],
    };

    it('should create patient treatment started event', () => {
      const event = createPatientTreatmentStartedEvent('patient-001', payload, metadata);

      expect(event.type).toBe('patient.treatment_started');
      expect(event.payload.procedureType).toBe('All-on-X');
      expect(event.payload.phases).toHaveLength(4);
    });
  });

  describe('createPatientTreatmentCompletedEvent', () => {
    const payload: PatientTreatmentCompletedPayload = {
      phone: '+40721000000',
      treatmentPlanId: 'plan-001',
      procedureType: 'All-on-X',
      providerId: 'provider-001',
      completedAt: '2024-06-10',
      outcome: 'successful',
      followUpRequired: true,
      followUpScheduledFor: '2024-07-10',
    };

    it('should create patient treatment completed event', () => {
      const event = createPatientTreatmentCompletedEvent('patient-001', payload, metadata);

      expect(event.type).toBe('patient.treatment_completed');
      expect(event.payload.outcome).toBe('successful');
      expect(event.payload.followUpRequired).toBe(true);
    });

    it('should support all outcome types', () => {
      const outcomes = ['successful', 'partial', 'complications'] as const;

      outcomes.forEach((outcome) => {
        const event = createPatientTreatmentCompletedEvent(
          'patient-001',
          { ...payload, outcome },
          metadata
        );
        expect(event.payload.outcome).toBe(outcome);
      });
    });
  });

  describe('createPatientAppointmentScheduledEvent', () => {
    const payload: PatientAppointmentScheduledPayload = {
      phone: '+40721000000',
      appointmentId: 'appt-001',
      scheduledAt: '2024-02-15T10:00:00Z',
      appointmentType: 'consultation',
      providerId: 'provider-001',
      clinicId: 'clinic-001',
      duration: 60,
      scheduledBy: 'receptionist-001',
      scheduledVia: 'phone',
    };

    it('should create patient appointment scheduled event', () => {
      const event = createPatientAppointmentScheduledEvent('patient-001', payload, metadata);

      expect(event.type).toBe('patient.appointment_scheduled');
      expect(event.payload.appointmentType).toBe('consultation');
      expect(event.payload.duration).toBe(60);
    });
  });

  describe('createPatientAppointmentCompletedEvent', () => {
    const payload: PatientAppointmentCompletedPayload = {
      phone: '+40721000000',
      appointmentId: 'appt-001',
      providerId: 'provider-001',
      completedAt: '2024-02-15T11:00:00Z',
      outcome: 'completed',
      notes: 'Routine checkup completed',
      nextAppointmentRecommended: true,
      proceduresPerformed: ['cleaning', 'examination'],
    };

    it('should create patient appointment completed event', () => {
      const event = createPatientAppointmentCompletedEvent('patient-001', payload, metadata);

      expect(event.type).toBe('patient.appointment_completed');
      expect(event.payload.outcome).toBe('completed');
      expect(event.payload.proceduresPerformed).toHaveLength(2);
    });
  });

  describe('Type Guards', () => {
    const createAllEvents = (): PatientDomainEvent[] => {
      return [
        createPatientRegisteredEvent(
          'p-1',
          {
            leadId: 'lead-001',
            phone: '+40721000000',
            firstName: 'John',
            lastName: 'Doe',
            conversionProcedure: 'All-on-X',
            source: 'lead_conversion',
          },
          metadata
        ),
        createPatientActivatedEvent(
          'p-2',
          {
            phone: '+40721000000',
            activationReason: 'First appointment',
          },
          metadata
        ),
        createPatientStatusChangedEvent(
          'p-3',
          {
            phone: '+40721000000',
            previousStatus: 'active',
            newStatus: 'under_treatment',
          },
          metadata
        ),
        createPatientTreatmentStartedEvent(
          'p-4',
          {
            phone: '+40721000000',
            treatmentPlanId: 'plan-001',
            procedureType: 'All-on-X',
            providerId: 'provider-001',
          },
          metadata
        ),
        createPatientTreatmentCompletedEvent(
          'p-5',
          {
            phone: '+40721000000',
            treatmentPlanId: 'plan-001',
            procedureType: 'All-on-X',
            providerId: 'provider-001',
            completedAt: '2024-06-10',
            outcome: 'successful',
            followUpRequired: false,
          },
          metadata
        ),
        createPatientAppointmentScheduledEvent(
          'p-6',
          {
            phone: '+40721000000',
            appointmentId: 'appt-001',
            scheduledAt: '2024-02-15T10:00:00Z',
            appointmentType: 'consultation',
            providerId: 'provider-001',
            clinicId: 'clinic-001',
            duration: 60,
          },
          metadata
        ),
        createPatientAppointmentCompletedEvent(
          'p-7',
          {
            phone: '+40721000000',
            appointmentId: 'appt-001',
            providerId: 'provider-001',
            completedAt: '2024-02-15T11:00:00Z',
            outcome: 'completed',
          },
          metadata
        ),
      ];
    };

    describe('isPatientRegisteredEvent', () => {
      it('should return true for PatientRegistered event', () => {
        const events = createAllEvents();
        expect(isPatientRegisteredEvent(events[0])).toBe(true);
      });

      it('should return false for other events', () => {
        const events = createAllEvents();
        events.slice(1).forEach((event) => {
          expect(isPatientRegisteredEvent(event)).toBe(false);
        });
      });
    });

    describe('isPatientActivatedEvent', () => {
      it('should return true for PatientActivated event', () => {
        const events = createAllEvents();
        expect(isPatientActivatedEvent(events[1])).toBe(true);
      });

      it('should return false for other events', () => {
        const events = createAllEvents();
        expect(isPatientActivatedEvent(events[0])).toBe(false);
      });
    });

    describe('isPatientStatusChangedEvent', () => {
      it('should return true for PatientStatusChanged event', () => {
        const events = createAllEvents();
        expect(isPatientStatusChangedEvent(events[2])).toBe(true);
      });
    });

    describe('isPatientTreatmentStartedEvent', () => {
      it('should return true for PatientTreatmentStarted event', () => {
        const events = createAllEvents();
        expect(isPatientTreatmentStartedEvent(events[3])).toBe(true);
      });
    });

    describe('isPatientTreatmentCompletedEvent', () => {
      it('should return true for PatientTreatmentCompleted event', () => {
        const events = createAllEvents();
        expect(isPatientTreatmentCompletedEvent(events[4])).toBe(true);
      });
    });

    describe('isPatientAppointmentScheduledEvent', () => {
      it('should return true for PatientAppointmentScheduled event', () => {
        const events = createAllEvents();
        expect(isPatientAppointmentScheduledEvent(events[5])).toBe(true);
      });
    });

    describe('isPatientLifecycleEvent', () => {
      it('should return true for lifecycle events', () => {
        const events = createAllEvents();
        expect(isPatientLifecycleEvent(events[0])).toBe(true); // registered
        expect(isPatientLifecycleEvent(events[1])).toBe(true); // activated
        expect(isPatientLifecycleEvent(events[2])).toBe(true); // status_changed
      });

      it('should return false for non-lifecycle events', () => {
        const events = createAllEvents();
        expect(isPatientLifecycleEvent(events[3])).toBe(false); // treatment_started
        expect(isPatientLifecycleEvent(events[5])).toBe(false); // appointment_scheduled
      });
    });

    describe('isPatientTreatmentEvent', () => {
      it('should return true for treatment events', () => {
        const events = createAllEvents();
        expect(isPatientTreatmentEvent(events[3])).toBe(true); // treatment_started
        expect(isPatientTreatmentEvent(events[4])).toBe(true); // treatment_completed
      });

      it('should return false for non-treatment events', () => {
        const events = createAllEvents();
        expect(isPatientTreatmentEvent(events[0])).toBe(false); // registered
        expect(isPatientTreatmentEvent(events[5])).toBe(false); // appointment_scheduled
      });
    });

    describe('isPatientAppointmentEvent', () => {
      it('should return true for appointment events', () => {
        const events = createAllEvents();
        expect(isPatientAppointmentEvent(events[5])).toBe(true); // appointment_scheduled
        expect(isPatientAppointmentEvent(events[6])).toBe(true); // appointment_completed
      });

      it('should return false for non-appointment events', () => {
        const events = createAllEvents();
        expect(isPatientAppointmentEvent(events[0])).toBe(false); // registered
        expect(isPatientAppointmentEvent(events[3])).toBe(false); // treatment_started
      });
    });
  });
});
