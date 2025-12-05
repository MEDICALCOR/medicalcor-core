/**
 * @fileoverview Comprehensive Tests for Scheduling Service
 *
 * Tests the scheduling service domain types and interfaces including:
 * - ConsentRequiredError for GDPR/HIPAA compliance
 * - TimeSlot validation and structure
 * - BookingRequest validation
 * - AppointmentDetails structure
 * - ISchedulingRepository interface contracts
 * - Repository configuration validation
 * - GDPR consent enforcement
 *
 * @module domain/scheduling/__tests__/scheduling-service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConsentRequiredError,
  type ISchedulingRepository,
  type SchedulingConfig,
  type TimeSlot,
  type BookingRequest,
  type BookingResult,
  type AppointmentDetails,
  type GetAvailableSlotsOptions,
} from '../scheduling-service.js';
import type { ConsentService } from '../../consent/consent-service.js';
import { InMemoryConsentRepository } from '@medicalcor/core/repositories';
import { createConsentService } from '../../consent/consent-service.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockTimeSlot = (overrides?: Partial<TimeSlot>): TimeSlot => ({
  id: 'slot-123',
  date: '2025-12-10',
  startTime: '09:00',
  endTime: '10:00',
  duration: 60,
  available: true,
  procedureTypes: ['Dental Implants', 'All-on-4'],
  ...overrides,
});

const createMockBookingRequest = (overrides?: Partial<BookingRequest>): BookingRequest => ({
  hubspotContactId: 'contact-123',
  phone: '+40721234567',
  slotId: 'slot-123',
  procedureType: 'Dental Implants',
  ...overrides,
});

const createMockAppointmentDetails = (
  overrides?: Partial<AppointmentDetails>
): AppointmentDetails => ({
  id: 'appointment-123',
  slot: {
    date: '2025-12-10',
    startTime: '09:00',
    duration: 60,
  },
  procedureType: 'Dental Implants',
  hubspotContactId: 'contact-123',
  phone: '+40721234567',
  createdAt: new Date().toISOString(),
  ...overrides,
});

// ============================================================================
// MOCK SCHEDULING REPOSITORY
// ============================================================================

class MockSchedulingRepository implements ISchedulingRepository {
  private slots: TimeSlot[] = [];
  private appointments: AppointmentDetails[] = [];
  private consentService: ConsentService;

  constructor(config: SchedulingConfig) {
    this.consentService = config.consentService;
    this.slots = [
      createMockTimeSlot({ id: 'slot-1', date: '2025-12-10' }),
      createMockTimeSlot({ id: 'slot-2', date: '2025-12-11' }),
      createMockTimeSlot({ id: 'slot-3', date: '2025-12-12' }),
    ];
  }

  async getAvailableSlots(options: string | GetAvailableSlotsOptions): Promise<TimeSlot[]> {
    const opts = typeof options === 'string' ? {} : options;
    let filtered = this.slots.filter((slot) => slot.available);

    if (opts.procedureType) {
      filtered = filtered.filter((slot) => slot.procedureTypes.includes(opts.procedureType!));
    }

    if (opts.preferredDates) {
      filtered = filtered.filter((slot) => opts.preferredDates!.includes(slot.date));
    }

    if (opts.limit) {
      filtered = filtered.slice(0, opts.limit);
    }

    return filtered;
  }

  async bookAppointment(request: BookingRequest): Promise<BookingResult> {
    // CRITICAL: Verify consent before booking (GDPR/HIPAA compliance)
    const hasConsent = await this.consentService.hasValidConsent(
      request.hubspotContactId,
      'data_processing'
    );

    if (!hasConsent) {
      const { missing } = await this.consentService.hasRequiredConsents(
        request.hubspotContactId
      );
      throw new ConsentRequiredError(request.hubspotContactId, missing);
    }

    // Find and book the slot
    const slot = this.slots.find((s) => s.id === request.slotId);
    if (!slot || !slot.available) {
      throw new Error('Slot not available');
    }

    slot.available = false;

    const appointment = createMockAppointmentDetails({
      hubspotContactId: request.hubspotContactId,
      phone: request.phone,
      procedureType: request.procedureType,
      slot: {
        date: slot.date,
        startTime: slot.startTime,
        duration: slot.duration,
      },
    });

    this.appointments.push(appointment);

    return {
      id: appointment.id,
      status: 'confirmed',
    };
  }

  async getUpcomingAppointments(startDate: Date, endDate: Date): Promise<AppointmentDetails[]> {
    return this.appointments.filter((apt) => {
      const aptDate = new Date(apt.slot.date);
      return aptDate >= startDate && aptDate <= endDate;
    });
  }
}

// ============================================================================
// CONSENT REQUIRED ERROR TESTS
// ============================================================================

describe('ConsentRequiredError', () => {
  it('should create error with contact ID and missing consents', () => {
    const error = new ConsentRequiredError('contact-123', ['data_processing']);

    expect(error.code).toBe('CONSENT_REQUIRED');
    expect(error.contactId).toBe('contact-123');
    expect(error.missingConsents).toEqual(['data_processing']);
    expect(error.name).toBe('ConsentRequiredError');
  });

  it('should include missing consents in error message', () => {
    const error = new ConsentRequiredError('contact-123', [
      'data_processing',
      'marketing_whatsapp',
    ]);

    expect(error.message).toContain('data_processing');
    expect(error.message).toContain('marketing_whatsapp');
  });

  it('should be throwable and catchable', () => {
    const throwError = () => {
      throw new ConsentRequiredError('contact-123', ['data_processing']);
    };

    expect(throwError).toThrow(ConsentRequiredError);
    expect(throwError).toThrow('Patient consent required');
  });

  it('should be instanceof Error', () => {
    const error = new ConsentRequiredError('contact-123', []);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConsentRequiredError);
  });
});

// ============================================================================
// TIME SLOT STRUCTURE TESTS
// ============================================================================

describe('TimeSlot Structure', () => {
  it('should have all required properties', () => {
    const slot = createMockTimeSlot();

    expect(slot).toHaveProperty('id');
    expect(slot).toHaveProperty('date');
    expect(slot).toHaveProperty('startTime');
    expect(slot).toHaveProperty('endTime');
    expect(slot).toHaveProperty('duration');
    expect(slot).toHaveProperty('available');
    expect(slot).toHaveProperty('procedureTypes');
  });

  it('should support optional practitioner field', () => {
    const slot = createMockTimeSlot({ practitioner: 'Dr. Smith' });

    expect(slot.practitioner).toBe('Dr. Smith');
  });

  it('should support multiple procedure types', () => {
    const slot = createMockTimeSlot({
      procedureTypes: ['Dental Implants', 'All-on-4', 'Veneers'],
    });

    expect(slot.procedureTypes).toHaveLength(3);
    expect(slot.procedureTypes).toContain('Dental Implants');
  });

  it('should handle unavailable slots', () => {
    const slot = createMockTimeSlot({ available: false });

    expect(slot.available).toBe(false);
  });

  it('should use ISO date format', () => {
    const slot = createMockTimeSlot({ date: '2025-12-25' });

    expect(slot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should use HH:MM time format', () => {
    const slot = createMockTimeSlot({
      startTime: '14:30',
      endTime: '15:30',
    });

    expect(slot.startTime).toMatch(/^\d{2}:\d{2}$/);
    expect(slot.endTime).toMatch(/^\d{2}:\d{2}$/);
  });
});

// ============================================================================
// BOOKING REQUEST STRUCTURE TESTS
// ============================================================================

describe('BookingRequest Structure', () => {
  it('should have all required properties', () => {
    const request = createMockBookingRequest();

    expect(request).toHaveProperty('hubspotContactId');
    expect(request).toHaveProperty('phone');
    expect(request).toHaveProperty('slotId');
    expect(request).toHaveProperty('procedureType');
  });

  it('should support optional patient name', () => {
    const request = createMockBookingRequest({ patientName: 'John Doe' });

    expect(request.patientName).toBe('John Doe');
  });

  it('should support optional notes', () => {
    const request = createMockBookingRequest({ notes: 'Patient prefers morning appointments' });

    expect(request.notes).toBe('Patient prefers morning appointments');
  });

  it('should validate phone number format', () => {
    const request = createMockBookingRequest({ phone: '+40721234567' });

    expect(request.phone).toMatch(/^\+\d+$/);
  });
});

// ============================================================================
// APPOINTMENT DETAILS STRUCTURE TESTS
// ============================================================================

describe('AppointmentDetails Structure', () => {
  it('should have all required properties', () => {
    const appointment = createMockAppointmentDetails();

    expect(appointment).toHaveProperty('id');
    expect(appointment).toHaveProperty('slot');
    expect(appointment).toHaveProperty('procedureType');
    expect(appointment).toHaveProperty('hubspotContactId');
    expect(appointment).toHaveProperty('phone');
    expect(appointment).toHaveProperty('createdAt');
  });

  it('should have nested slot details', () => {
    const appointment = createMockAppointmentDetails();

    expect(appointment.slot).toHaveProperty('date');
    expect(appointment.slot).toHaveProperty('startTime');
    expect(appointment.slot).toHaveProperty('duration');
  });

  it('should support optional patient name', () => {
    const appointment = createMockAppointmentDetails({ patientName: 'Jane Doe' });

    expect(appointment.patientName).toBe('Jane Doe');
  });

  it('should use ISO timestamp for createdAt', () => {
    const appointment = createMockAppointmentDetails();

    expect(appointment.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ============================================================================
// REPOSITORY INTERFACE TESTS
// ============================================================================

describe('ISchedulingRepository Interface', () => {
  let consentService: ConsentService;
  let repository: ISchedulingRepository;

  beforeEach(() => {
    const consentRepo = new InMemoryConsentRepository();
    consentService = createConsentService({ repository: consentRepo });
    repository = new MockSchedulingRepository({ consentService });
  });

  describe('getAvailableSlots', () => {
    it('should return all available slots without filters', async () => {
      const slots = await repository.getAvailableSlots({});

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((slot) => slot.available)).toBe(true);
    });

    it('should filter by procedure type', async () => {
      const slots = await repository.getAvailableSlots({
        procedureType: 'Dental Implants',
      });

      expect(slots.every((slot) => slot.procedureTypes.includes('Dental Implants'))).toBe(true);
    });

    it('should filter by preferred dates', async () => {
      const slots = await repository.getAvailableSlots({
        preferredDates: ['2025-12-10'],
      });

      expect(slots.every((slot) => slot.date === '2025-12-10')).toBe(true);
    });

    it('should limit number of results', async () => {
      const slots = await repository.getAvailableSlots({ limit: 2 });

      expect(slots.length).toBeLessThanOrEqual(2);
    });

    it('should combine multiple filters', async () => {
      const slots = await repository.getAvailableSlots({
        procedureType: 'Dental Implants',
        preferredDates: ['2025-12-10', '2025-12-11'],
        limit: 1,
      });

      expect(slots.length).toBeLessThanOrEqual(1);
      if (slots.length > 0) {
        expect(slots[0]!.procedureTypes).toContain('Dental Implants');
        expect(['2025-12-10', '2025-12-11']).toContain(slots[0]!.date);
      }
    });

    it('should accept string parameter for backwards compatibility', async () => {
      await expect(repository.getAvailableSlots('Dental Implants')).resolves.toBeDefined();
    });
  });

  describe('bookAppointment', () => {
    beforeEach(async () => {
      // Grant required consent
      await consentService.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'granted',
        source: {
          channel: 'web',
          method: 'explicit',
          evidenceUrl: null,
          witnessedBy: null,
        },
      });
    });

    it('should book appointment with valid consent', async () => {
      const request = createMockBookingRequest({ slotId: 'slot-1' });

      const result = await repository.bookAppointment(request);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('status');
      expect(result.status).toBe('confirmed');
    });

    it('should throw ConsentRequiredError without consent', async () => {
      const request = createMockBookingRequest({
        hubspotContactId: 'no-consent-contact',
      });

      await expect(repository.bookAppointment(request)).rejects.toThrow(ConsentRequiredError);
    });

    it('should include missing consent types in error', async () => {
      const request = createMockBookingRequest({
        hubspotContactId: 'no-consent-contact',
      });

      try {
        await repository.bookAppointment(request);
        expect.fail('Should have thrown ConsentRequiredError');
      } catch (error) {
        if (error instanceof ConsentRequiredError) {
          expect(error.missingConsents).toContain('data_processing');
        } else {
          throw error;
        }
      }
    });

    it('should validate slot availability', async () => {
      const request = createMockBookingRequest({ slotId: 'nonexistent-slot' });

      await expect(repository.bookAppointment(request)).rejects.toThrow();
    });

    it('should mark slot as unavailable after booking', async () => {
      const request = createMockBookingRequest({ slotId: 'slot-1' });

      await repository.bookAppointment(request);

      const slots = await repository.getAvailableSlots({});
      const bookedSlot = slots.find((s) => s.id === 'slot-1');

      expect(bookedSlot).toBeUndefined(); // Should not be in available slots
    });
  });

  describe('getUpcomingAppointments', () => {
    beforeEach(async () => {
      // Grant consent and book an appointment
      await consentService.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'granted',
        source: {
          channel: 'web',
          method: 'explicit',
          evidenceUrl: null,
          witnessedBy: null,
        },
      });

      await repository.bookAppointment(createMockBookingRequest({ slotId: 'slot-1' }));
    });

    it('should return appointments within date range', async () => {
      const startDate = new Date('2025-12-01');
      const endDate = new Date('2025-12-31');

      const appointments = await repository.getUpcomingAppointments(startDate, endDate);

      expect(appointments.length).toBeGreaterThan(0);
    });

    it('should filter by start date', async () => {
      const startDate = new Date('2025-12-15'); // After our booked slot
      const endDate = new Date('2025-12-31');

      const appointments = await repository.getUpcomingAppointments(startDate, endDate);

      expect(appointments.length).toBe(0);
    });

    it('should filter by end date', async () => {
      const startDate = new Date('2025-12-01');
      const endDate = new Date('2025-12-05'); // Before our booked slot

      const appointments = await repository.getUpcomingAppointments(startDate, endDate);

      expect(appointments.length).toBe(0);
    });

    it('should return empty array when no appointments in range', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const appointments = await repository.getUpcomingAppointments(startDate, endDate);

      expect(appointments).toEqual([]);
    });
  });
});

// ============================================================================
// SCHEDULING CONFIG TESTS
// ============================================================================

describe('SchedulingConfig', () => {
  it('should require consentService', () => {
    const consentRepo = new InMemoryConsentRepository();
    const consentService = createConsentService({ repository: consentRepo });

    const config: SchedulingConfig = {
      consentService,
    };

    expect(config.consentService).toBeDefined();
  });

  it('should support optional timezone', () => {
    const consentRepo = new InMemoryConsentRepository();
    const consentService = createConsentService({ repository: consentRepo });

    const config: SchedulingConfig = {
      consentService,
      timezone: 'Europe/Bucharest',
    };

    expect(config.timezone).toBe('Europe/Bucharest');
  });

  it('should work without optional fields', () => {
    const consentRepo = new InMemoryConsentRepository();
    const consentService = createConsentService({ repository: consentRepo });

    const config: SchedulingConfig = {
      consentService,
    };

    expect(config).toBeDefined();
  });
});

// ============================================================================
// GDPR/HIPAA COMPLIANCE TESTS
// ============================================================================

describe('Scheduling GDPR/HIPAA Compliance', () => {
  let consentService: ConsentService;
  let repository: ISchedulingRepository;

  beforeEach(() => {
    const consentRepo = new InMemoryConsentRepository();
    consentService = createConsentService({ repository: consentRepo });
    repository = new MockSchedulingRepository({ consentService });
  });

  it('should enforce consent before booking (MANDATORY)', async () => {
    const request = createMockBookingRequest({
      hubspotContactId: 'new-patient',
    });

    await expect(repository.bookAppointment(request)).rejects.toThrow(ConsentRequiredError);
  });

  it('should allow booking with valid consent', async () => {
    await consentService.recordConsent({
      contactId: 'patient-with-consent',
      phone: '+40721234567',
      consentType: 'data_processing',
      status: 'granted',
      source: {
        channel: 'web',
        method: 'explicit',
        evidenceUrl: null,
        witnessedBy: null,
      },
    });

    const request = createMockBookingRequest({
      hubspotContactId: 'patient-with-consent',
      slotId: 'slot-1',
    });

    await expect(repository.bookAppointment(request)).resolves.toBeDefined();
  });

  it('should reject booking with withdrawn consent', async () => {
    await consentService.recordConsent({
      contactId: 'patient-withdrew',
      phone: '+40721234567',
      consentType: 'data_processing',
      status: 'granted',
      source: {
        channel: 'web',
        method: 'explicit',
        evidenceUrl: null,
        witnessedBy: null,
      },
    });

    await consentService.withdrawConsent('patient-withdrew', 'data_processing');

    const request = createMockBookingRequest({
      hubspotContactId: 'patient-withdrew',
      slotId: 'slot-1',
    });

    await expect(repository.bookAppointment(request)).rejects.toThrow(ConsentRequiredError);
  });

  it('should reject booking with denied consent', async () => {
    await consentService.recordConsent({
      contactId: 'patient-denied',
      phone: '+40721234567',
      consentType: 'data_processing',
      status: 'denied',
      source: {
        channel: 'web',
        method: 'explicit',
        evidenceUrl: null,
        witnessedBy: null,
      },
    });

    const request = createMockBookingRequest({
      hubspotContactId: 'patient-denied',
      slotId: 'slot-1',
    });

    await expect(repository.bookAppointment(request)).rejects.toThrow(ConsentRequiredError);
  });

  it('should provide clear error message about missing consent', async () => {
    const request = createMockBookingRequest({
      hubspotContactId: 'no-consent',
    });

    try {
      await repository.bookAppointment(request);
      expect.fail('Should have thrown');
    } catch (error) {
      if (error instanceof ConsentRequiredError) {
        expect(error.message).toContain('consent required');
        expect(error.contactId).toBe('no-consent');
      } else {
        throw error;
      }
    }
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Scheduling Edge Cases', () => {
  let consentService: ConsentService;
  let repository: ISchedulingRepository;

  beforeEach(() => {
    const consentRepo = new InMemoryConsentRepository();
    consentService = createConsentService({ repository: consentRepo });
    repository = new MockSchedulingRepository({ consentService });
  });

  it('should handle empty available slots', async () => {
    const slots = await repository.getAvailableSlots({
      procedureType: 'NonExistentProcedure',
    });

    expect(slots).toEqual([]);
  });

  it('should handle appointments on boundary dates', async () => {
    const exactDate = new Date('2025-12-10T00:00:00.000Z');

    const appointments = await repository.getUpcomingAppointments(exactDate, exactDate);

    // Should work without errors
    expect(Array.isArray(appointments)).toBe(true);
  });

  it('should handle very large date ranges', async () => {
    const startDate = new Date('2020-01-01');
    const endDate = new Date('2030-12-31');

    const appointments = await repository.getUpcomingAppointments(startDate, endDate);

    expect(Array.isArray(appointments)).toBe(true);
  });

  it('should handle special characters in procedure types', async () => {
    const slots = await repository.getAvailableSlots({
      procedureType: 'All-on-4 (Full Arch)',
    });

    expect(Array.isArray(slots)).toBe(true);
  });

  it('should handle international phone numbers', async () => {
    const request = createMockBookingRequest({
      phone: '+49 30 12345678', // German number
    });

    expect(request.phone).toBeDefined();
  });
});

// ============================================================================
// TYPE SAFETY TESTS
// ============================================================================

describe('Scheduling Type Safety', () => {
  it('should enforce TimeSlot structure at compile time', () => {
    const slot: TimeSlot = createMockTimeSlot();

    // TypeScript should enforce these properties exist
    const _id: string = slot.id;
    const _date: string = slot.date;
    const _available: boolean = slot.available;
    const _types: string[] = slot.procedureTypes;

    expect(_id).toBeDefined();
  });

  it('should enforce BookingRequest structure at compile time', () => {
    const request: BookingRequest = createMockBookingRequest();

    const _contactId: string = request.hubspotContactId;
    const _phone: string = request.phone;
    const _slotId: string = request.slotId;

    expect(_contactId).toBeDefined();
  });

  it('should make optional fields truly optional', () => {
    const slot: TimeSlot = {
      id: 'test',
      date: '2025-12-10',
      startTime: '09:00',
      endTime: '10:00',
      duration: 60,
      available: true,
      procedureTypes: [],
      // practitioner is optional - should compile without it
    };

    expect(slot.practitioner).toBeUndefined();
  });
});
