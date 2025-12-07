/**
 * @fileoverview Tests for Calendar Scheduling Adapter
 *
 * Tests external calendar integration, consent verification,
 * and type mapping between domain and integration layers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CalendarSchedulingAdapter,
  createCalendarSchedulingAdapter,
  type ConsentService,
} from '../CalendarSchedulingAdapter.js';

// ============================================================================
// TYPE DEFINITIONS (inline to avoid importing from broken domain module)
// ============================================================================

interface IntegrationTimeSlot {
  id: string;
  date: string;
  time: string;
  dateTime: string;
  duration: number;
  available: boolean;
  practitioner?: {
    id: string;
    name: string;
    specialty?: string;
  };
  location?: {
    id: string;
    name: string;
    address?: string;
  };
}

interface Appointment {
  id: string;
  slotId: string;
  patientPhone: string;
  patientName?: string;
  patientEmail?: string;
  procedureType: string;
  scheduledAt: string;
  duration: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed' | 'no_show';
  practitioner?: {
    id: string;
    name: string;
  };
  location?: {
    id: string;
    name: string;
    address?: string;
  };
  confirmationCode?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface MockSchedulingService {
  getAvailableSlots: ReturnType<typeof vi.fn>;
  bookAppointment: ReturnType<typeof vi.fn>;
  cancelAppointment: ReturnType<typeof vi.fn>;
  rescheduleAppointment: ReturnType<typeof vi.fn>;
  isSlotAvailable: ReturnType<typeof vi.fn>;
  getSlot: ReturnType<typeof vi.fn>;
  getAppointment: ReturnType<typeof vi.fn>;
  getPatientAppointments: ReturnType<typeof vi.fn>;
  formatSlotForDisplay: ReturnType<typeof vi.fn>;
  formatSlotShort: ReturnType<typeof vi.fn>;
}

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockConsentService(hasConsent = true): ConsentService {
  return {
    hasRequiredConsents: vi.fn().mockResolvedValue({
      valid: hasConsent,
      missing: hasConsent ? [] : ['data_processing', 'marketing'],
    }),
  };
}

function createMockCalendarService(): MockSchedulingService {
  return {
    getAvailableSlots: vi.fn(),
    bookAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    isSlotAvailable: vi.fn(),
    getSlot: vi.fn(),
    getAppointment: vi.fn(),
    getPatientAppointments: vi.fn(),
    formatSlotForDisplay: vi.fn(),
    formatSlotShort: vi.fn(),
  };
}

function createMockIntegrationSlot(
  overrides: Partial<IntegrationTimeSlot> = {}
): IntegrationTimeSlot {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  return {
    id: 'slot-123',
    date: tomorrow.toISOString().split('T')[0] ?? '',
    time: '10:00',
    dateTime: tomorrow.toISOString(),
    duration: 30,
    available: true,
    practitioner: {
      id: 'dr-1',
      name: 'Dr. Test',
      specialty: 'General',
    },
    location: {
      id: 'loc-1',
      name: 'Main Clinic',
      address: '123 Test St',
    },
    ...overrides,
  };
}

function createMockAppointment(overrides: Partial<Appointment> = {}): Appointment {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  return {
    id: 'apt-123',
    slotId: 'slot-123',
    patientPhone: '+40721234567',
    patientName: 'Test Patient',
    procedureType: 'consultation',
    scheduledAt: tomorrow.toISOString(),
    duration: 30,
    status: 'confirmed',
    practitioner: {
      id: 'dr-1',
      name: 'Dr. Test',
    },
    location: {
      id: 'loc-1',
      name: 'Main Clinic',
      address: '123 Test St',
    },
    confirmationCode: 'ABC123',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('CalendarSchedulingAdapter', () => {
  let mockCalendarService: ReturnType<typeof createMockCalendarService>;
  let mockConsentService: ConsentService;
  let adapter: CalendarSchedulingAdapter;

  beforeEach(() => {
    mockCalendarService = createMockCalendarService();
    mockConsentService = createMockConsentService(true);
    adapter = new CalendarSchedulingAdapter({
      calendarService: mockCalendarService,
      consentService: mockConsentService,
    });
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with required config', () => {
      const newAdapter = new CalendarSchedulingAdapter({
        calendarService: mockCalendarService,
        consentService: mockConsentService,
      });

      expect(newAdapter).toBeDefined();
    });

    it('should accept optional timezone and clinicId', () => {
      const newAdapter = new CalendarSchedulingAdapter({
        calendarService: mockCalendarService,
        consentService: mockConsentService,
        defaultTimezone: 'America/New_York',
        clinicId: 'clinic-123',
      });

      expect(newAdapter).toBeDefined();
    });
  });

  describe('getAvailableSlots', () => {
    it('should fetch and map slots from external calendar', async () => {
      const mockSlots = [
        createMockIntegrationSlot({ id: 'slot-1' }),
        createMockIntegrationSlot({ id: 'slot-2' }),
      ];
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce(mockSlots);

      const slots = await adapter.getAvailableSlots({ procedureType: 'consultation' });

      expect(mockCalendarService.getAvailableSlots).toHaveBeenCalledWith({
        procedureType: 'consultation',
        preferredDates: undefined,
        limit: 20,
      });
      expect(slots).toHaveLength(2);
      expect(slots[0]?.id).toBe('slot-1');
    });

    it('should accept string procedure type', async () => {
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([createMockIntegrationSlot()]);

      const slots = await adapter.getAvailableSlots('cleaning');

      expect(mockCalendarService.getAvailableSlots).toHaveBeenCalledWith({
        procedureType: 'cleaning',
        preferredDates: undefined,
        limit: 20,
      });
      expect(slots).toHaveLength(1);
    });

    it('should map integration slot to domain format', async () => {
      const integrationSlot = createMockIntegrationSlot({
        id: 'slot-mapped',
        date: '2024-12-15',
        time: '14:30',
        duration: 45,
        available: true,
        practitioner: {
          id: 'dr-1',
          name: 'Dr. Smith',
          specialty: 'Implantology',
        },
      });
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([integrationSlot]);

      const slots = await adapter.getAvailableSlots({ procedureType: 'implant' });

      expect(slots[0]).toMatchObject({
        id: 'slot-mapped',
        date: '2024-12-15',
        startTime: '14:30',
        endTime: '15:15', // 14:30 + 45 minutes
        duration: 45,
        available: true,
        practitioner: 'Dr. Smith',
        procedureTypes: [],
      });
    });

    it('should handle slots without practitioner', async () => {
      const slotWithoutPractitioner = createMockIntegrationSlot({
        practitioner: undefined,
      });
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([slotWithoutPractitioner]);

      const slots = await adapter.getAvailableSlots({ limit: 5 });

      expect(slots[0]?.practitioner).toBeUndefined();
    });

    it('should use custom limit when specified', async () => {
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([]);

      await adapter.getAvailableSlots({ limit: 50 });

      expect(mockCalendarService.getAvailableSlots).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should pass preferredDates to calendar service', async () => {
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([]);

      await adapter.getAvailableSlots({
        procedureType: 'cleaning',
        preferredDates: ['2024-12-20', '2024-12-21'],
      });

      expect(mockCalendarService.getAvailableSlots).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredDates: ['2024-12-20', '2024-12-21'],
        })
      );
    });

    it('should propagate errors from calendar service', async () => {
      mockCalendarService.getAvailableSlots.mockRejectedValueOnce(new Error('Calendar API error'));

      await expect(adapter.getAvailableSlots({ procedureType: 'consultation' })).rejects.toThrow(
        'Calendar API error'
      );
    });
  });

  describe('bookAppointment', () => {
    const validBookingRequest = {
      hubspotContactId: 'hs-123',
      phone: '+40721234567',
      patientName: 'John Doe',
      slotId: 'slot-456',
      procedureType: 'consultation',
      notes: 'First visit',
    };

    it('should book appointment with valid consent', async () => {
      const mockAppointment = createMockAppointment();
      mockCalendarService.bookAppointment.mockResolvedValueOnce(mockAppointment);

      const result = await adapter.bookAppointment(validBookingRequest);

      expect(mockConsentService.hasRequiredConsents).toHaveBeenCalledWith('hs-123');
      expect(mockCalendarService.bookAppointment).toHaveBeenCalledWith({
        slotId: 'slot-456',
        patientPhone: '+40721234567',
        patientName: 'John Doe',
        procedureType: 'consultation',
        notes: 'First visit',
        hubspotContactId: 'hs-123',
      });
      expect(result).toEqual({
        id: 'apt-123',
        status: 'confirmed',
      });
    });

    it('should throw ConsentRequiredError when consent is missing', async () => {
      const noConsentService = createMockConsentService(false);
      const adapterNoConsent = new CalendarSchedulingAdapter({
        calendarService: mockCalendarService,
        consentService: noConsentService,
      });

      await expect(adapterNoConsent.bookAppointment(validBookingRequest)).rejects.toThrow(
        'Patient consent required'
      );
    });

    it('should include missing consents in ConsentRequiredError', async () => {
      const noConsentService = createMockConsentService(false);
      const adapterNoConsent = new CalendarSchedulingAdapter({
        calendarService: mockCalendarService,
        consentService: noConsentService,
      });

      try {
        await adapterNoConsent.bookAppointment(validBookingRequest);
        expect.fail('Should have thrown ConsentRequiredError');
      } catch (error) {
        expect((error as Error).name).toBe('ConsentRequiredError');
        // Check the error has the expected properties
        const consentError = error as {
          code: string;
          contactId: string;
          missingConsents: string[];
        };
        expect(consentError.code).toBe('CONSENT_REQUIRED');
        expect(consentError.missingConsents).toContain('data_processing');
        expect(consentError.contactId).toBe('hs-123');
      }
    });

    it('should verify consent before calling calendar service', async () => {
      const noConsentService = createMockConsentService(false);
      const adapterNoConsent = new CalendarSchedulingAdapter({
        calendarService: mockCalendarService,
        consentService: noConsentService,
      });

      await expect(adapterNoConsent.bookAppointment(validBookingRequest)).rejects.toThrow();

      // Calendar service should NOT have been called
      expect(mockCalendarService.bookAppointment).not.toHaveBeenCalled();
    });

    it('should handle booking without optional fields', async () => {
      const minimalRequest = {
        hubspotContactId: 'hs-456',
        phone: '+40721234567',
        slotId: 'slot-789',
        procedureType: 'cleaning',
      };

      const mockAppointment = createMockAppointment({ id: 'apt-minimal' });
      mockCalendarService.bookAppointment.mockResolvedValueOnce(mockAppointment);

      const result = await adapter.bookAppointment(minimalRequest);

      expect(result.id).toBe('apt-minimal');
      expect(mockCalendarService.bookAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          patientName: undefined,
          notes: undefined,
        })
      );
    });

    it('should propagate errors from calendar service', async () => {
      mockCalendarService.bookAppointment.mockRejectedValueOnce(new Error('Slot not available'));

      await expect(adapter.bookAppointment(validBookingRequest)).rejects.toThrow(
        'Slot not available'
      );
    });

    it('should validate input with Zod schema', async () => {
      const invalidRequest = {
        hubspotContactId: '', // Empty - should fail
        phone: '+40721234567',
        slotId: 'slot-456',
        procedureType: 'consultation',
      };

      await expect(adapter.bookAppointment(invalidRequest)).rejects.toThrow();
    });

    it('should reject invalid phone numbers', async () => {
      const invalidPhoneRequest = {
        ...validBookingRequest,
        phone: '123', // Too short
      };

      await expect(adapter.bookAppointment(invalidPhoneRequest)).rejects.toThrow();
    });
  });

  describe('getUpcomingAppointments', () => {
    const startDate = new Date('2024-12-01');
    const endDate = new Date('2024-12-31');

    it('should return empty array (not fully implemented for external calendar)', async () => {
      const appointments = await adapter.getUpcomingAppointments(startDate, endDate);

      expect(appointments).toEqual([]);
    });
  });

  describe('cancelAppointment', () => {
    it('should cancel appointment via calendar service', async () => {
      const cancelledAppointment = createMockAppointment({
        id: 'apt-cancel',
        status: 'cancelled',
      });
      mockCalendarService.cancelAppointment.mockResolvedValueOnce(cancelledAppointment);

      const result = await adapter.cancelAppointment('apt-cancel', 'Patient request');

      expect(mockCalendarService.cancelAppointment).toHaveBeenCalledWith({
        appointmentId: 'apt-cancel',
        reason: 'Patient request',
        notifyPatient: true,
      });
      expect(result?.id).toBe('apt-cancel');
    });

    it('should cancel without reason', async () => {
      const cancelledAppointment = createMockAppointment({ status: 'cancelled' });
      mockCalendarService.cancelAppointment.mockResolvedValueOnce(cancelledAppointment);

      await adapter.cancelAppointment('apt-123');

      expect(mockCalendarService.cancelAppointment).toHaveBeenCalledWith({
        appointmentId: 'apt-123',
        reason: undefined,
        notifyPatient: true,
      });
    });

    it('should propagate errors from calendar service', async () => {
      mockCalendarService.cancelAppointment.mockRejectedValueOnce(
        new Error('Appointment not found')
      );

      await expect(adapter.cancelAppointment('invalid-id')).rejects.toThrow(
        'Appointment not found'
      );
    });
  });

  describe('rescheduleAppointment', () => {
    it('should reschedule appointment via calendar service', async () => {
      const rescheduledAppointment = createMockAppointment({
        id: 'apt-reschedule',
        slotId: 'new-slot',
      });
      mockCalendarService.rescheduleAppointment.mockResolvedValueOnce(rescheduledAppointment);

      const result = await adapter.rescheduleAppointment(
        'apt-reschedule',
        'new-slot',
        'Schedule conflict'
      );

      expect(mockCalendarService.rescheduleAppointment).toHaveBeenCalledWith({
        appointmentId: 'apt-reschedule',
        newSlotId: 'new-slot',
        reason: 'Schedule conflict',
        notifyPatient: true,
      });
      expect(result?.id).toBe('apt-reschedule');
    });

    it('should reschedule without reason', async () => {
      const rescheduledAppointment = createMockAppointment();
      mockCalendarService.rescheduleAppointment.mockResolvedValueOnce(rescheduledAppointment);

      await adapter.rescheduleAppointment('apt-123', 'new-slot-id');

      expect(mockCalendarService.rescheduleAppointment).toHaveBeenCalledWith({
        appointmentId: 'apt-123',
        newSlotId: 'new-slot-id',
        reason: undefined,
        notifyPatient: true,
      });
    });

    it('should propagate errors from calendar service', async () => {
      mockCalendarService.rescheduleAppointment.mockRejectedValueOnce(
        new Error('New slot not available')
      );

      await expect(adapter.rescheduleAppointment('apt-123', 'invalid-slot')).rejects.toThrow(
        'New slot not available'
      );
    });
  });

  describe('isSlotAvailable', () => {
    it('should return true when slot is available', async () => {
      mockCalendarService.isSlotAvailable.mockResolvedValueOnce(true);

      const available = await adapter.isSlotAvailable('slot-123');

      expect(available).toBe(true);
      expect(mockCalendarService.isSlotAvailable).toHaveBeenCalledWith('slot-123');
    });

    it('should return false when slot is not available', async () => {
      mockCalendarService.isSlotAvailable.mockResolvedValueOnce(false);

      const available = await adapter.isSlotAvailable('booked-slot');

      expect(available).toBe(false);
    });

    it('should return false on error', async () => {
      mockCalendarService.isSlotAvailable.mockRejectedValueOnce(new Error('Calendar API error'));

      const available = await adapter.isSlotAvailable('error-slot');

      expect(available).toBe(false);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createCalendarSchedulingAdapter', () => {
  it('should create adapter instance', () => {
    const mockCalendarService = createMockCalendarService();
    const mockConsentService = createMockConsentService(true);

    const adapter = createCalendarSchedulingAdapter({
      calendarService: mockCalendarService,
      consentService: mockConsentService,
    });

    expect(adapter).toBeInstanceOf(CalendarSchedulingAdapter);
  });

  it('should pass config to adapter', () => {
    const mockCalendarService = createMockCalendarService();
    const mockConsentService = createMockConsentService(true);

    const adapter = createCalendarSchedulingAdapter({
      calendarService: mockCalendarService,
      consentService: mockConsentService,
      defaultTimezone: 'UTC',
      clinicId: 'test-clinic',
    });

    expect(adapter).toBeDefined();
  });
});

// ============================================================================
// TYPE MAPPING TESTS
// ============================================================================

describe('Type Mapping', () => {
  let mockCalendarService: ReturnType<typeof createMockCalendarService>;
  let mockConsentService: ConsentService;
  let adapter: CalendarSchedulingAdapter;

  beforeEach(() => {
    mockCalendarService = createMockCalendarService();
    mockConsentService = createMockConsentService(true);
    adapter = new CalendarSchedulingAdapter({
      calendarService: mockCalendarService,
      consentService: mockConsentService,
    });
  });

  describe('calculateEndTime', () => {
    it('should calculate end time correctly for various durations', async () => {
      // Test with 30 minute duration
      const slot30 = createMockIntegrationSlot({
        time: '10:00',
        duration: 30,
      });
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([slot30]);

      let slots = await adapter.getAvailableSlots({ procedureType: 'test' });
      expect(slots[0]?.endTime).toBe('10:30');

      // Test with 45 minute duration
      const slot45 = createMockIntegrationSlot({
        time: '14:30',
        duration: 45,
      });
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([slot45]);

      slots = await adapter.getAvailableSlots({ procedureType: 'test' });
      expect(slots[0]?.endTime).toBe('15:15');

      // Test with 90 minute duration crossing hour boundary
      const slot90 = createMockIntegrationSlot({
        time: '11:30',
        duration: 90,
      });
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([slot90]);

      slots = await adapter.getAvailableSlots({ procedureType: 'test' });
      expect(slots[0]?.endTime).toBe('13:00');
    });

    it('should handle end time wrapping past midnight', async () => {
      const lateSlot = createMockIntegrationSlot({
        time: '23:30',
        duration: 60,
      });
      mockCalendarService.getAvailableSlots.mockResolvedValueOnce([lateSlot]);

      const slots = await adapter.getAvailableSlots({ procedureType: 'test' });
      expect(slots[0]?.endTime).toBe('00:30');
    });
  });

  describe('mapToAppointmentDetails', () => {
    it('should map appointment without optional fields', async () => {
      const appointmentWithoutName = createMockAppointment({
        patientName: undefined,
      });
      mockCalendarService.cancelAppointment.mockResolvedValueOnce(appointmentWithoutName);

      const result = await adapter.cancelAppointment('apt-123');

      expect(result?.patientName).toBeUndefined();
    });
  });
});
