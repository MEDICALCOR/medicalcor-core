/**
 * @fileoverview Tests for Scheduling Domain Types and Interfaces
 *
 * Tests for the scheduling service port definitions, type interfaces,
 * and ConsentRequiredError class.
 *
 * @module domain/scheduling/__tests__/scheduling-service
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  ConsentRequiredError,
  type TimeSlot,
  type BookingRequest,
  type BookingResult,
  type AppointmentDetails,
  type GetAvailableSlotsOptions,
  type SchedulingConfig,
  type ISchedulingRepository,
  SchedulingService,
} from '../scheduling-service.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockTimeSlot = (overrides: Partial<TimeSlot> = {}): TimeSlot => ({
  id: 'slot-001',
  date: '2024-12-15',
  startTime: '09:00',
  endTime: '10:00',
  duration: 60,
  available: true,
  practitioner: 'Dr. Smith',
  procedureTypes: ['consultation', 'all-on-x'],
  ...overrides,
});

const createMockBookingRequest = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  hubspotContactId: 'contact-001',
  phone: '+40700000001',
  patientName: 'Test Patient',
  slotId: 'slot-001',
  procedureType: 'consultation',
  notes: 'First visit',
  ...overrides,
});

const createMockAppointmentDetails = (
  overrides: Partial<AppointmentDetails> = {}
): AppointmentDetails => ({
  id: 'appt-001',
  slot: {
    date: '2024-12-15',
    startTime: '09:00',
    duration: 60,
  },
  patientName: 'Test Patient',
  procedureType: 'consultation',
  hubspotContactId: 'contact-001',
  phone: '+40700000001',
  createdAt: '2024-12-10T10:00:00Z',
  ...overrides,
});

// =============================================================================
// TEST SUITE: ConsentRequiredError
// =============================================================================

describe('ConsentRequiredError', () => {
  describe('constructor', () => {
    it('should create error with single missing consent', () => {
      const error = new ConsentRequiredError('contact-001', ['scheduling']);

      expect(error.message).toContain('Patient consent required');
      expect(error.message).toContain('scheduling');
      expect(error.contactId).toBe('contact-001');
      expect(error.missingConsents).toEqual(['scheduling']);
      expect(error.code).toBe('CONSENT_REQUIRED');
      expect(error.name).toBe('ConsentRequiredError');
    });

    it('should create error with multiple missing consents', () => {
      const missingConsents = ['scheduling', 'marketing', 'data_processing'];
      const error = new ConsentRequiredError('contact-002', missingConsents);

      expect(error.message).toContain('scheduling');
      expect(error.message).toContain('marketing');
      expect(error.message).toContain('data_processing');
      expect(error.missingConsents).toEqual(missingConsents);
    });

    it('should be instanceof Error', () => {
      const error = new ConsentRequiredError('contact-001', ['scheduling']);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConsentRequiredError);
    });

    it('should have stack trace', () => {
      const error = new ConsentRequiredError('contact-001', ['scheduling']);

      expect(error.stack).toBeDefined();
    });
  });

  describe('Property-Based Tests', () => {
    it('should always include contactId in error', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (contactId) => {
          const error = new ConsentRequiredError(contactId, ['scheduling']);
          return error.contactId === contactId;
        }),
        { numRuns: 50 }
      );
    });

    it('should always include all missing consents in message', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
          (consents) => {
            const error = new ConsentRequiredError('contact-001', consents);
            return consents.every((c) => error.message.includes(c));
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});

// =============================================================================
// TEST SUITE: Type Validation
// =============================================================================

describe('Type Interfaces', () => {
  describe('TimeSlot', () => {
    it('should validate complete time slot', () => {
      const slot = createMockTimeSlot();

      expect(slot.id).toBeDefined();
      expect(slot.date).toBeDefined();
      expect(slot.startTime).toBeDefined();
      expect(slot.endTime).toBeDefined();
      expect(slot.duration).toBeGreaterThan(0);
      expect(slot.available).toBeDefined();
      expect(Array.isArray(slot.procedureTypes)).toBe(true);
    });

    it('should allow optional practitioner', () => {
      const slot = createMockTimeSlot({ practitioner: undefined });

      expect(slot.practitioner).toBeUndefined();
    });
  });

  describe('BookingRequest', () => {
    it('should validate complete booking request', () => {
      const request = createMockBookingRequest();

      expect(request.hubspotContactId).toBeDefined();
      expect(request.phone).toBeDefined();
      expect(request.slotId).toBeDefined();
      expect(request.procedureType).toBeDefined();
    });

    it('should allow optional fields', () => {
      const request = createMockBookingRequest({
        patientName: undefined,
        notes: undefined,
      });

      expect(request.patientName).toBeUndefined();
      expect(request.notes).toBeUndefined();
    });
  });

  describe('BookingResult', () => {
    it('should represent successful booking', () => {
      const result: BookingResult = {
        success: true,
        appointmentId: 'appt-001',
        confirmationNumber: 'CONF-12345',
      };

      expect(result.success).toBe(true);
      expect(result.appointmentId).toBeDefined();
      expect(result.confirmationNumber).toBeDefined();
    });

    it('should represent failed booking', () => {
      const result: BookingResult = {
        success: false,
        error: 'Slot no longer available',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('AppointmentDetails', () => {
    it('should validate complete appointment', () => {
      const appointment = createMockAppointmentDetails();

      expect(appointment.id).toBeDefined();
      expect(appointment.slot.date).toBeDefined();
      expect(appointment.slot.startTime).toBeDefined();
      expect(appointment.slot.duration).toBeGreaterThan(0);
      expect(appointment.procedureType).toBeDefined();
      expect(appointment.hubspotContactId).toBeDefined();
      expect(appointment.phone).toBeDefined();
      expect(appointment.createdAt).toBeDefined();
    });
  });

  describe('GetAvailableSlotsOptions', () => {
    it('should validate slot options with all fields', () => {
      const options: GetAvailableSlotsOptions = {
        clinicId: 'clinic-001',
        procedureType: 'all-on-x',
        preferredDates: ['2024-12-15', '2024-12-16'],
        providerId: 'provider-001',
        serviceType: 'consultation',
        startDate: new Date('2024-12-15'),
        endDate: new Date('2024-12-31'),
        limit: 10,
      };

      expect(options.clinicId).toBe('clinic-001');
      expect(options.procedureType).toBe('all-on-x');
      expect(options.preferredDates).toHaveLength(2);
      expect(options.limit).toBe(10);
    });

    it('should allow minimal options', () => {
      const options: GetAvailableSlotsOptions = {
        clinicId: 'clinic-001',
      };

      expect(options.clinicId).toBe('clinic-001');
      expect(options.procedureType).toBeUndefined();
      expect(options.limit).toBeUndefined();
    });
  });
});

// =============================================================================
// TEST SUITE: SchedulingService Abstract Class
// =============================================================================

describe('SchedulingService', () => {
  it('should be implementable as interface', () => {
    // Create a mock implementation
    class MockSchedulingService extends SchedulingService {
      async getAvailableSlots(_options: string | GetAvailableSlotsOptions): Promise<TimeSlot[]> {
        return [createMockTimeSlot()];
      }

      async bookAppointment(_request: BookingRequest): Promise<BookingResult> {
        return {
          success: true,
          appointmentId: 'appt-001',
          confirmationNumber: 'CONF-001',
        };
      }

      async getUpcomingAppointments(
        _startDate: Date,
        _endDate: Date
      ): Promise<AppointmentDetails[]> {
        return [createMockAppointmentDetails()];
      }
    }

    const service = new MockSchedulingService();

    expect(service).toBeInstanceOf(SchedulingService);
    expect(typeof service.getAvailableSlots).toBe('function');
    expect(typeof service.bookAppointment).toBe('function');
    expect(typeof service.getUpcomingAppointments).toBe('function');
  });

  it('should enforce ISchedulingRepository interface', async () => {
    const mockRepo: ISchedulingRepository = {
      getAvailableSlots: vi.fn().mockResolvedValue([createMockTimeSlot()]),
      bookAppointment: vi.fn().mockResolvedValue({
        success: true,
        appointmentId: 'appt-001',
        confirmationNumber: 'CONF-001',
      }),
      getUpcomingAppointments: vi.fn().mockResolvedValue([createMockAppointmentDetails()]),
    };

    const slots = await mockRepo.getAvailableSlots({ clinicId: 'clinic-001' });
    expect(slots).toHaveLength(1);

    const result = await mockRepo.bookAppointment(createMockBookingRequest());
    expect(result.success).toBe(true);

    const appointments = await mockRepo.getUpcomingAppointments(
      new Date('2024-12-01'),
      new Date('2024-12-31')
    );
    expect(appointments).toHaveLength(1);
  });
});

// =============================================================================
// TEST SUITE: SchedulingConfig
// =============================================================================

describe('SchedulingConfig', () => {
  it('should require consentService', () => {
    const mockConsentService = {
      hasValidConsent: vi.fn().mockResolvedValue(true),
      recordConsent: vi.fn().mockResolvedValue({}),
      revokeConsent: vi.fn().mockResolvedValue({}),
    };

    const config: SchedulingConfig = {
      timezone: 'America/New_York',
      consentService: mockConsentService as any,
    };

    expect(config.consentService).toBeDefined();
    expect(config.timezone).toBe('America/New_York');
  });

  it('should allow optional timezone', () => {
    const mockConsentService = {
      hasValidConsent: vi.fn().mockResolvedValue(true),
    };

    const config: SchedulingConfig = {
      consentService: mockConsentService as any,
    };

    expect(config.timezone).toBeUndefined();
  });
});

// =============================================================================
// INTEGRATION SCENARIOS
// =============================================================================

describe('Integration Scenarios', () => {
  describe('Booking Flow', () => {
    it('should handle complete booking flow', async () => {
      const mockRepo: ISchedulingRepository = {
        getAvailableSlots: vi
          .fn()
          .mockResolvedValue([
            createMockTimeSlot({ id: 'slot-001', available: true }),
            createMockTimeSlot({ id: 'slot-002', available: true }),
          ]),
        bookAppointment: vi.fn().mockResolvedValue({
          success: true,
          appointmentId: 'appt-001',
          confirmationNumber: 'CONF-12345',
        }),
        getUpcomingAppointments: vi.fn().mockResolvedValue([createMockAppointmentDetails()]),
      };

      // 1. Get available slots
      const slots = await mockRepo.getAvailableSlots({ clinicId: 'clinic-001', limit: 10 });
      expect(slots).toHaveLength(2);

      // 2. Book appointment
      const bookingRequest = createMockBookingRequest({ slotId: slots[0].id });
      const result = await mockRepo.bookAppointment(bookingRequest);
      expect(result.success).toBe(true);

      // 3. Verify upcoming appointment
      const appointments = await mockRepo.getUpcomingAppointments(
        new Date('2024-12-01'),
        new Date('2024-12-31')
      );
      expect(appointments).toHaveLength(1);
    });

    it('should handle consent rejection', async () => {
      // Simulate a repository that checks consent
      const mockRepo: ISchedulingRepository = {
        getAvailableSlots: vi.fn().mockResolvedValue([createMockTimeSlot()]),
        bookAppointment: vi.fn().mockImplementation(async (request: BookingRequest) => {
          // Simulate consent check failure
          throw new ConsentRequiredError(request.hubspotContactId, ['scheduling', 'marketing']);
        }),
        getUpcomingAppointments: vi.fn().mockResolvedValue([]),
      };

      const bookingRequest = createMockBookingRequest();

      await expect(mockRepo.bookAppointment(bookingRequest)).rejects.toThrow(ConsentRequiredError);
    });

    it('should handle slot no longer available', async () => {
      const mockRepo: ISchedulingRepository = {
        getAvailableSlots: vi.fn().mockResolvedValue([]),
        bookAppointment: vi.fn().mockResolvedValue({
          success: false,
          error: 'Slot no longer available',
        }),
        getUpcomingAppointments: vi.fn().mockResolvedValue([]),
      };

      const bookingRequest = createMockBookingRequest();
      const result = await mockRepo.bookAppointment(bookingRequest);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Slot no longer available');
      }
    });
  });

  describe('Slot Filtering', () => {
    it('should filter by procedure type', async () => {
      const allSlots = [
        createMockTimeSlot({ id: 'slot-1', procedureTypes: ['consultation'] }),
        createMockTimeSlot({ id: 'slot-2', procedureTypes: ['all-on-x'] }),
        createMockTimeSlot({ id: 'slot-3', procedureTypes: ['consultation', 'all-on-x'] }),
      ];

      const mockRepo: ISchedulingRepository = {
        getAvailableSlots: vi.fn().mockImplementation(async (options: GetAvailableSlotsOptions) => {
          if (options.procedureType) {
            return allSlots.filter((s) => s.procedureTypes.includes(options.procedureType!));
          }
          return allSlots;
        }),
        bookAppointment: vi.fn(),
        getUpcomingAppointments: vi.fn(),
      };

      const consultationSlots = await mockRepo.getAvailableSlots({
        clinicId: 'clinic-001',
        procedureType: 'consultation',
      });
      expect(consultationSlots).toHaveLength(2);

      const allOnXSlots = await mockRepo.getAvailableSlots({
        clinicId: 'clinic-001',
        procedureType: 'all-on-x',
      });
      expect(allOnXSlots).toHaveLength(2);
    });

    it('should filter by date range', async () => {
      const mockRepo: ISchedulingRepository = {
        getAvailableSlots: vi.fn().mockImplementation(async (options: GetAvailableSlotsOptions) => {
          const slots: TimeSlot[] = [];
          if (options.startDate && options.endDate) {
            // Simulate slots within date range
            const start = options.startDate;
            const end = options.endDate;
            const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            for (let i = 0; i < Math.min(days, options.limit || 10); i++) {
              slots.push(createMockTimeSlot({ id: `slot-${i}` }));
            }
          }
          return slots;
        }),
        bookAppointment: vi.fn(),
        getUpcomingAppointments: vi.fn(),
      };

      const slots = await mockRepo.getAvailableSlots({
        clinicId: 'clinic-001',
        startDate: new Date('2024-12-15'),
        endDate: new Date('2024-12-20'),
        limit: 10,
      });

      expect(slots.length).toBeLessThanOrEqual(10);
    });
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty consent list', () => {
    const error = new ConsentRequiredError('contact-001', []);

    expect(error.missingConsents).toEqual([]);
    expect(error.message).toContain('Missing consents:');
  });

  it('should handle string options for getAvailableSlots', async () => {
    const mockRepo: ISchedulingRepository = {
      getAvailableSlots: vi
        .fn()
        .mockImplementation(async (options: string | GetAvailableSlotsOptions) => {
          if (typeof options === 'string') {
            return [createMockTimeSlot({ id: `slot-for-${options}` })];
          }
          return [];
        }),
      bookAppointment: vi.fn(),
      getUpcomingAppointments: vi.fn(),
    };

    // Can be called with string (legacy support)
    const slots = await mockRepo.getAvailableSlots('clinic-001');
    expect(slots).toHaveLength(1);
  });

  it('should handle zero duration slot', () => {
    const slot = createMockTimeSlot({ duration: 0 });
    expect(slot.duration).toBe(0);
  });

  it('should handle appointment with no patient name', () => {
    const appointment = createMockAppointmentDetails({ patientName: undefined });
    expect(appointment.patientName).toBeUndefined();
  });
});
