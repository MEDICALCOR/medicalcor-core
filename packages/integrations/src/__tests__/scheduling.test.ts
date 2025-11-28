import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { SchedulingService, createSchedulingService } from '../scheduling.js';
import { server } from '../__mocks__/setup.js';

/**
 * Scheduling Service Tests
 *
 * Tests appointment scheduling functionality:
 * - Slot availability queries
 * - Appointment booking
 * - Appointment cancellation
 * - Appointment rescheduling
 * - Patient appointment history
 * - Input validation
 * - Error handling
 */

describe('SchedulingService', () => {
  const config = {
    apiUrl: 'https://scheduling.api.example.com',
    apiKey: 'test-api-key',
    clinicId: 'clinic_001',
    defaultTimezone: 'Europe/Bucharest',
  };

  describe('constructor', () => {
    it('should create service with valid config', () => {
      const service = new SchedulingService(config);
      expect(service).toBeInstanceOf(SchedulingService);
    });

    it('should throw error for invalid API URL', () => {
      expect(() => new SchedulingService({ ...config, apiUrl: 'not-a-url' })).toThrow();
    });

    it('should throw error for missing API key', () => {
      expect(() => new SchedulingService({ ...config, apiKey: '' })).toThrow();
    });

    it('should accept custom timeout', () => {
      const service = new SchedulingService({ ...config, timeoutMs: 30000 });
      expect(service).toBeInstanceOf(SchedulingService);
    });

    it('should reject timeout over 60 seconds', () => {
      expect(() => new SchedulingService({ ...config, timeoutMs: 120000 })).toThrow();
    });

    it('should accept custom retry config', () => {
      const service = new SchedulingService({
        ...config,
        retryConfig: { maxRetries: 5, baseDelayMs: 2000 },
      });
      expect(service).toBeInstanceOf(SchedulingService);
    });
  });

  describe('getAvailableSlots', () => {
    it('should return available slots', async () => {
      const service = new SchedulingService(config);

      const slots = await service.getAvailableSlots({
        procedureType: 'implant',
      });

      // Should only return available slots (mock has 2 available, 1 unavailable)
      expect(slots).toHaveLength(2);
      expect(slots.every((slot) => slot.available)).toBe(true);
    });

    it('should include slot details', async () => {
      const service = new SchedulingService(config);

      const slots = await service.getAvailableSlots({
        procedureType: 'implant',
      });

      const firstSlot = slots[0];
      expect(firstSlot).toHaveProperty('id');
      expect(firstSlot).toHaveProperty('date');
      expect(firstSlot).toHaveProperty('time');
      expect(firstSlot).toHaveProperty('dateTime');
      expect(firstSlot).toHaveProperty('duration');
      expect(firstSlot).toHaveProperty('practitioner');
      expect(firstSlot).toHaveProperty('location');
    });

    it('should validate input - procedure type required', async () => {
      const service = new SchedulingService(config);

      await expect(
        service.getAvailableSlots({
          procedureType: '', // Invalid - empty
        })
      ).rejects.toThrow();
    });

    it('should support date range filtering', async () => {
      const service = new SchedulingService(config);

      // Should not throw
      const slots = await service.getAvailableSlots({
        procedureType: 'control',
        startDate: '2025-01-15',
        endDate: '2025-01-20',
      });

      expect(Array.isArray(slots)).toBe(true);
    });

    it('should support practitioner filtering', async () => {
      const service = new SchedulingService(config);

      const slots = await service.getAvailableSlots({
        procedureType: 'implant',
        practitionerId: 'dr_001',
      });

      expect(Array.isArray(slots)).toBe(true);
    });

    it('should support limit parameter', async () => {
      const service = new SchedulingService(config);

      const slots = await service.getAvailableSlots({
        procedureType: 'implant',
        limit: 1,
      });

      // Limit is validated but actual limiting happens server-side
      expect(Array.isArray(slots)).toBe(true);
    });
  });

  describe('getSlot', () => {
    it('should return slot by ID', async () => {
      const service = new SchedulingService(config);

      const slot = await service.getSlot('slot_001');

      expect(slot).not.toBeNull();
      expect(slot?.id).toBe('slot_001');
    });

    it('should return null for non-existent slot', async () => {
      const service = new SchedulingService(config);

      const slot = await service.getSlot('not_found');

      expect(slot).toBeNull();
    });
  });

  describe('bookAppointment', () => {
    it('should book an appointment', async () => {
      const service = new SchedulingService(config);

      const appointment = await service.bookAppointment({
        slotId: 'slot_001',
        patientPhone: '+40721000001',
        patientName: 'Ion Popescu',
        patientEmail: 'ion@example.com',
        procedureType: 'implant',
        notes: 'First visit',
      });

      expect(appointment).toHaveProperty('id');
      expect(appointment.status).toBe('confirmed');
      expect(appointment.confirmationCode).toBeDefined();
      expect(appointment.patientPhone).toBe('+40721000001');
    });

    it('should validate required fields', async () => {
      const service = new SchedulingService(config);

      // Missing slotId
      await expect(
        service.bookAppointment({
          slotId: '',
          patientPhone: '+40721000001',
          procedureType: 'implant',
        })
      ).rejects.toThrow();

      // Missing phone
      await expect(
        service.bookAppointment({
          slotId: 'slot_001',
          patientPhone: '',
          procedureType: 'implant',
        })
      ).rejects.toThrow();

      // Missing procedure type
      await expect(
        service.bookAppointment({
          slotId: 'slot_001',
          patientPhone: '+40721000001',
          procedureType: '',
        })
      ).rejects.toThrow();
    });

    it('should validate phone number format', async () => {
      const service = new SchedulingService(config);

      // Too short
      await expect(
        service.bookAppointment({
          slotId: 'slot_001',
          patientPhone: '123',
          procedureType: 'implant',
        })
      ).rejects.toThrow();
    });

    it('should validate email format if provided', async () => {
      const service = new SchedulingService(config);

      await expect(
        service.bookAppointment({
          slotId: 'slot_001',
          patientPhone: '+40721000001',
          patientEmail: 'not-an-email',
          procedureType: 'implant',
        })
      ).rejects.toThrow();
    });

    it('should support HubSpot contact linking', async () => {
      const service = new SchedulingService(config);

      const appointment = await service.bookAppointment({
        slotId: 'slot_001',
        patientPhone: '+40721000001',
        procedureType: 'implant',
        hubspotContactId: 'hs_contact_123',
      });

      expect(appointment.status).toBe('confirmed');
    });

    it('should support metadata', async () => {
      const service = new SchedulingService(config);

      const appointment = await service.bookAppointment({
        slotId: 'slot_001',
        patientPhone: '+40721000001',
        procedureType: 'implant',
        metadata: { source: 'whatsapp', campaign: 'spring_2025' },
      });

      expect(appointment).toBeDefined();
    });
  });

  describe('getAppointment', () => {
    it('should return appointment by ID', async () => {
      const service = new SchedulingService(config);

      const appointment = await service.getAppointment('apt_001');

      expect(appointment).not.toBeNull();
      expect(appointment?.id).toBe('apt_001');
      expect(appointment?.status).toBe('confirmed');
    });

    it('should return null for non-existent appointment', async () => {
      const service = new SchedulingService(config);

      const appointment = await service.getAppointment('not_found');

      expect(appointment).toBeNull();
    });
  });

  describe('cancelAppointment', () => {
    it('should cancel an appointment', async () => {
      const service = new SchedulingService(config);

      const cancelled = await service.cancelAppointment({
        appointmentId: 'apt_001',
        reason: 'Patient request',
      });

      expect(cancelled.status).toBe('cancelled');
    });

    it('should validate appointment ID', async () => {
      const service = new SchedulingService(config);

      await expect(
        service.cancelAppointment({
          appointmentId: '',
        })
      ).rejects.toThrow();
    });

    it('should support notify patient option', async () => {
      const service = new SchedulingService(config);

      const cancelled = await service.cancelAppointment({
        appointmentId: 'apt_001',
        notifyPatient: false,
      });

      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('rescheduleAppointment', () => {
    it('should reschedule an appointment', async () => {
      const service = new SchedulingService(config);

      const rescheduled = await service.rescheduleAppointment({
        appointmentId: 'apt_001',
        newSlotId: 'slot_002',
        reason: 'Schedule conflict',
      });

      expect(rescheduled.slotId).toBe('slot_002');
      expect(rescheduled.status).toBe('confirmed');
    });

    it('should validate required fields', async () => {
      const service = new SchedulingService(config);

      // Missing appointment ID
      await expect(
        service.rescheduleAppointment({
          appointmentId: '',
          newSlotId: 'slot_002',
        })
      ).rejects.toThrow();

      // Missing new slot ID
      await expect(
        service.rescheduleAppointment({
          appointmentId: 'apt_001',
          newSlotId: '',
        })
      ).rejects.toThrow();
    });
  });

  describe('getPatientAppointments', () => {
    it('should return patient appointments', async () => {
      const service = new SchedulingService(config);

      const appointments = await service.getPatientAppointments('+40721000001');

      expect(appointments.length).toBeGreaterThan(0);
      expect(appointments.every((a) => a.patientPhone === '+40721000001')).toBe(true);
    });

    it('should filter by status', async () => {
      const service = new SchedulingService(config);

      const confirmed = await service.getPatientAppointments('+40721000001', {
        status: 'confirmed',
      });

      expect(confirmed.every((a) => a.status === 'confirmed')).toBe(true);
    });

    it('should support limit option', async () => {
      const service = new SchedulingService(config);

      // Should not throw
      const appointments = await service.getPatientAppointments('+40721000001', {
        limit: 5,
      });

      expect(Array.isArray(appointments)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      server.use(
        http.get('https://scheduling.api.example.com/api/v1/slots', () => {
          return HttpResponse.error();
        })
      );

      const service = new SchedulingService(config);

      await expect(
        service.getAvailableSlots({ procedureType: 'implant' })
      ).rejects.toThrow();
    });

    it('should handle server errors', async () => {
      server.use(
        http.get('https://scheduling.api.example.com/api/v1/slots', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const service = new SchedulingService(config);

      await expect(
        service.getAvailableSlots({ procedureType: 'implant' })
      ).rejects.toThrow();
    });
  });
});

describe('createSchedulingService', () => {
  it('should create service using factory function', () => {
    const service = createSchedulingService({
      apiUrl: 'https://scheduling.api.example.com',
      apiKey: 'test-key',
    });

    expect(service).toBeInstanceOf(SchedulingService);
  });
});
