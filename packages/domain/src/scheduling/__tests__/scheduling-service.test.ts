/**
 * @fileoverview Tests for Scheduling Service Types
 *
 * Tests for scheduling domain types, errors, and interfaces.
 */

import { describe, it, expect } from 'vitest';
import {
  ConsentRequiredError,
  type TimeSlot,
  type BookingRequest,
  type BookingResult,
  type AppointmentDetails,
  type GetAvailableSlotsOptions,
} from '../scheduling-service.js';

// =============================================================================
// Tests
// =============================================================================

describe('ConsentRequiredError', () => {
  it('should create error with correct message', () => {
    const error = new ConsentRequiredError('contact-123', ['scheduling', 'marketing']);

    expect(error.message).toContain('Patient consent required');
    expect(error.message).toContain('scheduling');
    expect(error.message).toContain('marketing');
  });

  it('should set correct error code', () => {
    const error = new ConsentRequiredError('contact-123', ['scheduling']);

    expect(error.code).toBe('CONSENT_REQUIRED');
  });

  it('should set correct contact ID', () => {
    const contactId = 'contact-456';
    const error = new ConsentRequiredError(contactId, ['scheduling']);

    expect(error.contactId).toBe(contactId);
  });

  it('should set correct missing consents', () => {
    const missingConsents = ['scheduling', 'marketing', 'communications'];
    const error = new ConsentRequiredError('contact-123', missingConsents);

    expect(error.missingConsents).toEqual(missingConsents);
  });

  it('should have correct error name', () => {
    const error = new ConsentRequiredError('contact-123', ['scheduling']);

    expect(error.name).toBe('ConsentRequiredError');
  });

  it('should be an instance of Error', () => {
    const error = new ConsentRequiredError('contact-123', ['scheduling']);

    expect(error).toBeInstanceOf(Error);
  });

  it('should handle empty missing consents array', () => {
    const error = new ConsentRequiredError('contact-123', []);

    expect(error.missingConsents).toEqual([]);
    expect(error.message).toContain('Missing consents:');
  });

  it('should handle single missing consent', () => {
    const error = new ConsentRequiredError('contact-123', ['scheduling']);

    expect(error.message).toContain('scheduling');
    expect(error.message).not.toContain(',');
  });
});

describe('Scheduling Types', () => {
  describe('TimeSlot', () => {
    it('should satisfy TimeSlot interface', () => {
      const slot: TimeSlot = {
        id: 'slot-123',
        date: '2024-12-15',
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
        available: true,
        practitioner: 'Dr. Smith',
        procedureTypes: ['CONSULT', 'ALL_ON_X'],
      };

      expect(slot.id).toBe('slot-123');
      expect(slot.duration).toBe(60);
      expect(slot.available).toBe(true);
      expect(slot.procedureTypes).toContain('ALL_ON_X');
    });

    it('should allow optional practitioner', () => {
      const slot: TimeSlot = {
        id: 'slot-123',
        date: '2024-12-15',
        startTime: '09:00',
        endTime: '10:00',
        duration: 60,
        available: true,
        procedureTypes: ['CONSULT'],
      };

      expect(slot.practitioner).toBeUndefined();
    });
  });

  describe('BookingRequest', () => {
    it('should satisfy BookingRequest interface', () => {
      const request: BookingRequest = {
        hubspotContactId: 'hs-contact-123',
        phone: '+40123456789',
        patientName: 'John Doe',
        slotId: 'slot-123',
        procedureType: 'CONSULT',
        notes: 'First visit',
      };

      expect(request.hubspotContactId).toBe('hs-contact-123');
      expect(request.phone).toBe('+40123456789');
      expect(request.procedureType).toBe('CONSULT');
    });

    it('should allow optional fields', () => {
      const request: BookingRequest = {
        hubspotContactId: 'hs-contact-123',
        phone: '+40123456789',
        slotId: 'slot-123',
        procedureType: 'CONSULT',
      };

      expect(request.patientName).toBeUndefined();
      expect(request.notes).toBeUndefined();
    });
  });

  describe('BookingResult', () => {
    it('should handle successful booking', () => {
      const result: BookingResult = {
        success: true,
        appointmentId: 'appt-123',
        confirmationNumber: 'CONF-2024-001',
      };

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.appointmentId).toBe('appt-123');
        expect(result.confirmationNumber).toBe('CONF-2024-001');
      }
    });

    it('should handle failed booking', () => {
      const result: BookingResult = {
        success: false,
        error: 'Slot no longer available',
      };

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Slot no longer available');
      }
    });
  });

  describe('AppointmentDetails', () => {
    it('should satisfy AppointmentDetails interface', () => {
      const appointment: AppointmentDetails = {
        id: 'appt-123',
        slot: {
          date: '2024-12-15',
          startTime: '09:00',
          duration: 60,
        },
        patientName: 'John Doe',
        procedureType: 'CONSULT',
        hubspotContactId: 'hs-contact-123',
        phone: '+40123456789',
        createdAt: '2024-12-01T10:00:00Z',
      };

      expect(appointment.id).toBe('appt-123');
      expect(appointment.slot.duration).toBe(60);
      expect(appointment.procedureType).toBe('CONSULT');
    });
  });

  describe('GetAvailableSlotsOptions', () => {
    it('should satisfy GetAvailableSlotsOptions interface', () => {
      const options: GetAvailableSlotsOptions = {
        clinicId: 'clinic-001',
        procedureType: 'ALL_ON_X',
        preferredDates: ['2024-12-15', '2024-12-16'],
        providerId: 'provider-123',
        serviceType: 'consultation',
        startDate: new Date('2024-12-15'),
        endDate: new Date('2024-12-31'),
        limit: 10,
      };

      expect(options.clinicId).toBe('clinic-001');
      expect(options.preferredDates).toHaveLength(2);
      expect(options.limit).toBe(10);
    });

    it('should allow minimal options', () => {
      const options: GetAvailableSlotsOptions = {
        clinicId: 'clinic-001',
      };

      expect(options.procedureType).toBeUndefined();
      expect(options.preferredDates).toBeUndefined();
      expect(options.limit).toBeUndefined();
    });
  });
});
