/**
 * @fileoverview Tests for Appointment Aggregate Root
 *
 * Comprehensive tests for the Appointment domain entity including:
 * - Lifecycle state machine
 * - Domain event generation
 * - Business rule enforcement
 * - Error handling
 *
 * @module domain/scheduling/__tests__/Appointment.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  AppointmentAggregateRoot,
  AppointmentError,
  AppointmentClosedError,
  AppointmentAlreadyConfirmedError,
  AppointmentAlreadyCancelledError,
  InvalidAppointmentStatusTransitionError,
  MaxReschedulesExceededError,
  type CreateAppointmentParams,
  type AppointmentStatus,
} from '../entities/Appointment.js';
import { AppointmentFactory, appointmentFactory } from '../factories/AppointmentFactory.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestParams(
  overrides: Partial<CreateAppointmentParams> = {}
): CreateAppointmentParams {
  const baseDate = new Date();
  baseDate.setHours(baseDate.getHours() + 24); // Tomorrow

  return {
    id: `apt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    patientId: 'patient-001',
    clinicId: 'clinic-001',
    procedureType: 'consultation',
    scheduledFor: baseDate,
    duration: 30,
    patientName: 'John Doe',
    patientPhone: '+40700000001',
    providerId: 'provider-001',
    providerName: 'Dr. Smith',
    ...overrides,
  };
}

function createAppointment(
  overrides: Partial<CreateAppointmentParams> = {}
): AppointmentAggregateRoot {
  return AppointmentAggregateRoot.create(createTestParams(overrides));
}

// =============================================================================
// CREATION TESTS
// =============================================================================

describe('AppointmentAggregateRoot', () => {
  describe('create', () => {
    it('should create a new appointment in REQUESTED status', () => {
      const appointment = createAppointment();

      expect(appointment.status).toBe('REQUESTED');
      expect(appointment.patientId).toBe('patient-001');
      expect(appointment.clinicId).toBe('clinic-001');
      expect(appointment.procedureType).toBe('consultation');
      expect(appointment.duration).toBe(30);
    });

    it('should emit appointment.created event', () => {
      const appointment = createAppointment();
      const events = appointment.getUncommittedEvents();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('appointment.created');
      expect(events[0].aggregateType).toBe('Appointment');
    });

    it('should calculate end time correctly', () => {
      const scheduledFor = new Date('2024-01-15T10:00:00Z');
      const appointment = createAppointment({ scheduledFor, duration: 45 });

      const expectedEndTime = new Date('2024-01-15T10:45:00Z');
      expect(appointment.endTime.getTime()).toBe(expectedEndTime.getTime());
    });

    it('should handle rescheduled appointments', () => {
      const appointment = createAppointment({
        rescheduledFrom: 'apt-original-123',
      });

      expect(appointment.rescheduleCount).toBe(1);
    });

    it('should start with zero reschedule count for new appointments', () => {
      const appointment = createAppointment();

      expect(appointment.rescheduleCount).toBe(0);
    });
  });

  // ===========================================================================
  // CONFIRMATION TESTS
  // ===========================================================================

  describe('confirm', () => {
    it('should transition from REQUESTED to CONFIRMED', () => {
      const appointment = createAppointment();

      appointment.confirm({ confirmedBy: 'staff-001' });

      expect(appointment.status).toBe('CONFIRMED');
    });

    it('should emit appointment.confirmed event', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });

      const events = appointment.getUncommittedEvents();
      const confirmEvent = events.find((e) => e.type === 'appointment.confirmed');

      expect(confirmEvent).toBeDefined();
      expect((confirmEvent?.payload as Record<string, unknown>).confirmedBy).toBe('staff-001');
    });

    it('should throw if already confirmed', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });

      expect(() => appointment.confirm({ confirmedBy: 'staff-002' })).toThrow(
        AppointmentAlreadyConfirmedError
      );
    });

    it('should throw for invalid status transition', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();

      expect(() => appointment.confirm({ confirmedBy: 'staff-002' })).toThrow(
        InvalidAppointmentStatusTransitionError
      );
    });
  });

  // ===========================================================================
  // CHECK-IN TESTS
  // ===========================================================================

  describe('checkIn', () => {
    it('should transition from CONFIRMED to CHECKED_IN', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });

      appointment.checkIn();

      expect(appointment.status).toBe('CHECKED_IN');
    });

    it('should emit appointment.checked_in event', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();

      const events = appointment.getUncommittedEvents();
      const checkInEvent = events.find((e) => e.type === 'appointment.checked_in');

      expect(checkInEvent).toBeDefined();
    });

    it('should throw if not confirmed', () => {
      const appointment = createAppointment();

      expect(() => appointment.checkIn()).toThrow(InvalidAppointmentStatusTransitionError);
    });
  });

  // ===========================================================================
  // START TESTS
  // ===========================================================================

  describe('start', () => {
    it('should transition from CHECKED_IN to IN_PROGRESS', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();

      appointment.start();

      expect(appointment.status).toBe('IN_PROGRESS');
    });

    it('should emit appointment.started event', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();
      appointment.start();

      const events = appointment.getUncommittedEvents();
      const startEvent = events.find((e) => e.type === 'appointment.started');

      expect(startEvent).toBeDefined();
    });

    it('should throw if not checked in', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });

      expect(() => appointment.start()).toThrow(InvalidAppointmentStatusTransitionError);
    });
  });

  // ===========================================================================
  // COMPLETE TESTS
  // ===========================================================================

  describe('complete', () => {
    it('should transition from IN_PROGRESS to COMPLETED', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();
      appointment.start();

      appointment.complete({ completedBy: 'provider-001' });

      expect(appointment.status).toBe('COMPLETED');
    });

    it('should emit appointment.completed event with treatment notes', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();
      appointment.start();
      appointment.complete({
        completedBy: 'provider-001',
        treatmentNotes: 'Patient responded well',
        actualDuration: 35,
      });

      const events = appointment.getUncommittedEvents();
      const completeEvent = events.find((e) => e.type === 'appointment.completed');

      expect(completeEvent).toBeDefined();
      const payload = completeEvent?.payload as Record<string, unknown>;
      expect(payload.treatmentNotes).toBe('Patient responded well');
      expect(payload.actualDuration).toBe(35);
    });

    it('should throw if not in progress', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();

      expect(() => appointment.complete({ completedBy: 'provider-001' })).toThrow(
        InvalidAppointmentStatusTransitionError
      );
    });

    it('should be in terminal state after completion', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();
      appointment.start();
      appointment.complete({ completedBy: 'provider-001' });

      expect(appointment.isTerminal()).toBe(true);
      expect(appointment.canModify()).toBe(false);
    });
  });

  // ===========================================================================
  // CANCELLATION TESTS
  // ===========================================================================

  describe('cancel', () => {
    it('should cancel from REQUESTED status', () => {
      const appointment = createAppointment();

      appointment.cancel({
        reason: 'PATIENT_REQUEST',
        cancelledBy: 'PATIENT',
      });

      expect(appointment.status).toBe('CANCELLED');
    });

    it('should cancel from CONFIRMED status', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });

      appointment.cancel({
        reason: 'CLINIC_REQUEST',
        cancelledBy: 'CLINIC',
        details: 'Provider unavailable',
      });

      expect(appointment.status).toBe('CANCELLED');
    });

    it('should emit appointment.cancelled event', () => {
      const appointment = createAppointment();
      appointment.cancel({
        reason: 'PATIENT_REQUEST',
        cancelledBy: 'PATIENT',
      });

      const events = appointment.getUncommittedEvents();
      const cancelEvent = events.find((e) => e.type === 'appointment.cancelled');

      expect(cancelEvent).toBeDefined();
      const payload = cancelEvent?.payload as Record<string, unknown>;
      expect(payload.reason).toBe('PATIENT_REQUEST');
      expect(payload.cancelledBy).toBe('PATIENT');
    });

    it('should throw if already cancelled', () => {
      const appointment = createAppointment();
      appointment.cancel({
        reason: 'PATIENT_REQUEST',
        cancelledBy: 'PATIENT',
      });

      expect(() =>
        appointment.cancel({
          reason: 'CLINIC_REQUEST',
          cancelledBy: 'CLINIC',
        })
      ).toThrow(AppointmentAlreadyCancelledError);
    });

    it('should throw if appointment is completed', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.checkIn();
      appointment.start();
      appointment.complete({ completedBy: 'provider-001' });

      expect(() =>
        appointment.cancel({
          reason: 'PATIENT_REQUEST',
          cancelledBy: 'PATIENT',
        })
      ).toThrow(InvalidAppointmentStatusTransitionError);
    });
  });

  // ===========================================================================
  // NO-SHOW TESTS
  // ===========================================================================

  describe('markNoShow', () => {
    it('should mark confirmed appointment as NO_SHOW', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });

      appointment.markNoShow();

      expect(appointment.status).toBe('NO_SHOW');
    });

    it('should emit appointment.no_show event', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });
      appointment.markNoShow();

      const events = appointment.getUncommittedEvents();
      const noShowEvent = events.find((e) => e.type === 'appointment.no_show');

      expect(noShowEvent).toBeDefined();
    });

    it('should throw for invalid status transition', () => {
      const appointment = createAppointment();

      expect(() => appointment.markNoShow()).toThrow(InvalidAppointmentStatusTransitionError);
    });
  });

  // ===========================================================================
  // RESCHEDULE TESTS
  // ===========================================================================

  describe('reschedule', () => {
    it('should mark appointment as RESCHEDULED', () => {
      const appointment = createAppointment();
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 2);

      appointment.reschedule(
        {
          newScheduledFor: newDate,
          initiatedBy: 'PATIENT',
        },
        'apt-new-123'
      );

      expect(appointment.status).toBe('RESCHEDULED');
    });

    it('should emit appointment.rescheduled event', () => {
      const appointment = createAppointment();
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 2);

      appointment.reschedule(
        {
          newScheduledFor: newDate,
          initiatedBy: 'CLINIC',
          reason: 'Provider schedule change',
        },
        'apt-new-123'
      );

      const events = appointment.getUncommittedEvents();
      const rescheduleEvent = events.find((e) => e.type === 'appointment.rescheduled');

      expect(rescheduleEvent).toBeDefined();
      const payload = rescheduleEvent?.payload as Record<string, unknown>;
      expect(payload.newAppointmentId).toBe('apt-new-123');
      expect(payload.initiatedBy).toBe('CLINIC');
    });

    it('should throw if max reschedules exceeded', () => {
      // Create appointment that has been rescheduled twice already
      let appointment = createAppointment({ rescheduledFrom: 'apt-1' });
      const newDate1 = new Date();
      newDate1.setDate(newDate1.getDate() + 1);

      appointment.reschedule({ newScheduledFor: newDate1, initiatedBy: 'PATIENT' }, 'apt-2');

      // Start fresh with 2 reschedules
      appointment = AppointmentAggregateRoot.create({
        ...createTestParams(),
        rescheduledFrom: 'apt-2',
      });
      const newDate2 = new Date();
      newDate2.setDate(newDate2.getDate() + 2);

      appointment.reschedule({ newScheduledFor: newDate2, initiatedBy: 'PATIENT' }, 'apt-3');

      // Try to reschedule again (this would be the 3rd reschedule)
      appointment = AppointmentAggregateRoot.create({
        ...createTestParams(),
        rescheduledFrom: 'apt-3',
      });
      // Manually set reschedule count to 3 via state
      const state = appointment.getState();
      const highRescheduleAppointment = AppointmentAggregateRoot.reconstitute({
        ...state,
        rescheduleCount: 3,
      });

      const newDate3 = new Date();
      newDate3.setDate(newDate3.getDate() + 3);

      expect(() =>
        highRescheduleAppointment.reschedule(
          { newScheduledFor: newDate3, initiatedBy: 'PATIENT' },
          'apt-4'
        )
      ).toThrow(MaxReschedulesExceededError);
    });

    it('should throw if appointment is cancelled', () => {
      const appointment = createAppointment();
      appointment.cancel({
        reason: 'PATIENT_REQUEST',
        cancelledBy: 'PATIENT',
      });

      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 2);

      expect(() =>
        appointment.reschedule({ newScheduledFor: newDate, initiatedBy: 'PATIENT' }, 'apt-new-123')
      ).toThrow(InvalidAppointmentStatusTransitionError);
    });
  });

  // ===========================================================================
  // REMINDER TESTS
  // ===========================================================================

  describe('recordReminderSent', () => {
    it('should add reminder to list', () => {
      const appointment = createAppointment();
      const sentAt = new Date();

      appointment.recordReminderSent({
        type: 'SMS',
        sentAt,
        status: 'SENT',
      });

      expect(appointment.remindersSent).toHaveLength(1);
      expect(appointment.remindersSent[0].type).toBe('SMS');
    });

    it('should emit appointment.reminder_sent event', () => {
      const appointment = createAppointment();

      appointment.recordReminderSent({
        type: 'WHATSAPP',
        sentAt: new Date(),
        status: 'DELIVERED',
      });

      const events = appointment.getUncommittedEvents();
      const reminderEvent = events.find((e) => e.type === 'appointment.reminder_sent');

      expect(reminderEvent).toBeDefined();
      const payload = reminderEvent?.payload as Record<string, unknown>;
      expect(payload.reminderType).toBe('WHATSAPP');
    });
  });

  // ===========================================================================
  // PROVIDER ASSIGNMENT TESTS
  // ===========================================================================

  describe('assignProvider', () => {
    it('should assign a new provider', () => {
      const appointment = createAppointment({ providerId: undefined });

      appointment.assignProvider('provider-002', 'Dr. Jones');

      expect(appointment.providerId).toBe('provider-002');
      expect(appointment.providerName).toBe('Dr. Jones');
    });

    it('should emit appointment.provider_assigned event', () => {
      const appointment = createAppointment({ providerId: 'provider-001' });

      appointment.assignProvider('provider-002');

      const events = appointment.getUncommittedEvents();
      const assignEvent = events.find((e) => e.type === 'appointment.provider_assigned');

      expect(assignEvent).toBeDefined();
      const payload = assignEvent?.payload as Record<string, unknown>;
      expect(payload.previousProviderId).toBe('provider-001');
      expect(payload.newProviderId).toBe('provider-002');
    });
  });

  // ===========================================================================
  // CONSENT VERIFICATION TESTS
  // ===========================================================================

  describe('recordConsentVerification', () => {
    it('should record consent verification', () => {
      const appointment = createAppointment();

      appointment.recordConsentVerification('appointment_reminders');

      const state = appointment.getState();
      expect(state.consentType).toBe('appointment_reminders');
      expect(state.consentVerifiedAt).toBeDefined();
    });

    it('should emit appointment.consent_verified event', () => {
      const appointment = createAppointment();

      appointment.recordConsentVerification('data_processing');

      const events = appointment.getUncommittedEvents();
      const consentEvent = events.find((e) => e.type === 'appointment.consent_verified');

      expect(consentEvent).toBeDefined();
      const payload = consentEvent?.payload as Record<string, unknown>;
      expect(payload.consentType).toBe('data_processing');
    });
  });

  // ===========================================================================
  // QUERY METHOD TESTS
  // ===========================================================================

  describe('query methods', () => {
    it('isTerminal should return true for terminal states', () => {
      const statuses: AppointmentStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'];

      for (const status of statuses) {
        const appointment = createAppointment();
        const state = appointment.getState();
        const terminalAppointment = AppointmentAggregateRoot.reconstitute({
          ...state,
          status,
        });

        expect(terminalAppointment.isTerminal()).toBe(true);
      }
    });

    it('canConfirm should only return true for REQUESTED status', () => {
      const appointment = createAppointment();
      expect(appointment.canConfirm()).toBe(true);

      appointment.confirm({ confirmedBy: 'staff-001' });
      expect(appointment.canConfirm()).toBe(false);
    });

    it('canCancel should return true for cancellable states', () => {
      const appointment = createAppointment();
      expect(appointment.canCancel()).toBe(true);

      appointment.confirm({ confirmedBy: 'staff-001' });
      expect(appointment.canCancel()).toBe(true);

      appointment.checkIn();
      expect(appointment.canCancel()).toBe(true);

      // Once in progress, canCancel returns false (emergency cancel still possible via status machine)
      appointment.start();
      expect(appointment.canCancel()).toBe(false);

      appointment.complete({ completedBy: 'provider-001' });
      expect(appointment.canCancel()).toBe(false);
    });

    it('isToday should correctly identify today appointments', () => {
      const today = new Date();
      today.setHours(14, 0, 0, 0);
      const appointment = createAppointment({ scheduledFor: today });

      expect(appointment.isToday()).toBe(true);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowAppointment = createAppointment({ scheduledFor: tomorrow });

      expect(tomorrowAppointment.isToday()).toBe(false);
    });
  });

  // ===========================================================================
  // EVENT SOURCING TESTS
  // ===========================================================================

  describe('event sourcing', () => {
    it('should clear uncommitted events', () => {
      const appointment = createAppointment();

      expect(appointment.getUncommittedEvents()).toHaveLength(1);

      appointment.clearUncommittedEvents();

      expect(appointment.getUncommittedEvents()).toHaveLength(0);
    });

    it('should reconstitute from events', () => {
      const original = createAppointment();
      original.confirm({ confirmedBy: 'staff-001' });
      original.checkIn();

      const events = original.getUncommittedEvents();
      const reconstituted = AppointmentAggregateRoot.fromEvents(original.id, events);

      expect(reconstituted.status).toBe('CHECKED_IN');
      expect(reconstituted.version).toBe(original.version);
    });

    it('should track version numbers', () => {
      const appointment = createAppointment();
      expect(appointment.version).toBe(1);

      appointment.confirm({ confirmedBy: 'staff-001' });
      expect(appointment.version).toBe(2);

      appointment.checkIn();
      expect(appointment.version).toBe(3);
    });
  });

  // ===========================================================================
  // FACTORY TESTS
  // ===========================================================================

  describe('AppointmentFactory', () => {
    it('should create appointment with generated ID', () => {
      const factory = new AppointmentFactory();
      const appointment = factory.createWithGeneratedId({
        patientId: 'patient-001',
        clinicId: 'clinic-001',
        procedureType: 'consultation',
        scheduledFor: new Date(),
        duration: 30,
      });

      expect(appointment.id).toMatch(/^apt-/);
    });

    it('should create snapshot', () => {
      const appointment = createAppointment();
      appointment.confirm({ confirmedBy: 'staff-001' });

      const snapshot = appointmentFactory.createSnapshot(appointment);

      expect(snapshot.aggregateId).toBe(appointment.id);
      expect(snapshot.aggregateType).toBe('Appointment');
      expect(snapshot.state.status).toBe('CONFIRMED');
    });

    it('should restore from snapshot', () => {
      const original = createAppointment();
      original.confirm({ confirmedBy: 'staff-001' });
      original.clearUncommittedEvents();

      const snapshot = appointmentFactory.createSnapshot(original);
      const restored = appointmentFactory.fromSnapshot(snapshot);

      expect(restored.status).toBe(original.status);
      expect(restored.patientId).toBe(original.patientId);
      expect(restored.clinicId).toBe(original.clinicId);
    });

    it('should restore from snapshot with additional events', () => {
      const original = createAppointment();
      original.confirm({ confirmedBy: 'staff-001' });
      const snapshot = appointmentFactory.createSnapshot(original);
      original.clearUncommittedEvents();

      original.checkIn();
      const additionalEvents = original.getUncommittedEvents();

      const restored = appointmentFactory.fromSnapshot(snapshot, additionalEvents);

      expect(restored.status).toBe('CHECKED_IN');
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('property-based tests', () => {
    it('should always generate valid appointment IDs', () => {
      fc.assert(
        fc.property(fc.string(), () => {
          const appointment = appointmentFactory.createWithGeneratedId({
            patientId: 'patient-001',
            clinicId: 'clinic-001',
            procedureType: 'consultation',
            scheduledFor: new Date(),
            duration: 30,
          });

          return appointment.id.startsWith('apt-') && appointment.id.length > 10;
        })
      );
    });

    it('should correctly calculate end time for any duration', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 480 }), // 1 min to 8 hours
          (duration) => {
            const scheduledFor = new Date('2024-01-15T10:00:00Z');
            const appointment = createAppointment({ scheduledFor, duration });

            const expectedEndTime = new Date(scheduledFor.getTime() + duration * 60 * 1000);

            return appointment.endTime.getTime() === expectedEndTime.getTime();
          }
        )
      );
    });

    it('should enforce status machine invariants', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (doConfirm, doCheckIn, doStart) => {
          const appointment = createAppointment();
          let expectedStatus: AppointmentStatus = 'REQUESTED';

          if (doConfirm) {
            appointment.confirm({ confirmedBy: 'staff' });
            expectedStatus = 'CONFIRMED';
          }

          if (doCheckIn && doConfirm) {
            appointment.checkIn();
            expectedStatus = 'CHECKED_IN';
          }

          if (doStart && doCheckIn && doConfirm) {
            appointment.start();
            expectedStatus = 'IN_PROGRESS';
          }

          return appointment.status === expectedStatus;
        })
      );
    });
  });
});
