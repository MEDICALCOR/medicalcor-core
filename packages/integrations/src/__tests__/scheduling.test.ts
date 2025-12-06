/**
 * Scheduling Service Tests
 * Comprehensive coverage for appointment scheduling integration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { z } from 'zod';
import {
  SchedulingService,
  MockSchedulingService,
  createSchedulingService,
  createMockSchedulingService,
  type SchedulingServiceConfig,
  type TimeSlot,
  type BookAppointmentInput,
  type GetAvailableSlotsOptions,
  type CancelAppointmentInput,
} from '../scheduling.js';

// Store original fetch
const originalFetch = global.fetch;

describe('SchedulingService', () => {
  const validConfig: SchedulingServiceConfig = {
    apiUrl: 'https://scheduling.example.com',
    apiKey: 'test-api-key',
    clinicId: 'clinic-123',
    defaultTimezone: 'Europe/Bucharest',
    retryConfig: { maxRetries: 1, baseDelayMs: 100 },
    timeoutMs: 5000,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should create service with valid config', () => {
      const service = new SchedulingService(validConfig);
      expect(service).toBeInstanceOf(SchedulingService);
    });

    it('should validate config with Zod schema', () => {
      expect(() => {
        new SchedulingService({
          apiUrl: 'not-a-url',
          apiKey: 'key',
        });
      }).toThrow();
    });

    it('should reject empty API key', () => {
      expect(() => {
        new SchedulingService({
          apiUrl: 'https://api.example.com',
          apiKey: '',
        });
      }).toThrow();
    });

    it('should accept minimal config', () => {
      const service = new SchedulingService({
        apiUrl: 'https://api.example.com',
        apiKey: 'minimal-key',
      });
      expect(service).toBeInstanceOf(SchedulingService);
    });

    it('should reject timeout below 1000ms', () => {
      expect(() => {
        new SchedulingService({
          apiUrl: 'https://api.example.com',
          apiKey: 'key',
          timeoutMs: 500,
        });
      }).toThrow();
    });

    it('should reject timeout above 60000ms', () => {
      expect(() => {
        new SchedulingService({
          apiUrl: 'https://api.example.com',
          apiKey: 'key',
          timeoutMs: 70000,
        });
      }).toThrow();
    });

    it('should accept retry config', () => {
      const service = new SchedulingService({
        apiUrl: 'https://api.example.com',
        apiKey: 'key',
        retryConfig: { maxRetries: 5, baseDelayMs: 500 },
      });
      expect(service).toBeInstanceOf(SchedulingService);
    });
  });

  describe('formatSlotForDisplay', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    const mockSlot: TimeSlot = {
      id: 'slot-123',
      date: '2024-03-15',
      time: '10:30',
      dateTime: '2024-03-15T10:30:00.000Z',
      duration: 60,
      available: true,
      practitioner: { id: 'dr-1', name: 'Dr. Test' },
      location: { id: 'loc-1', name: 'Test Clinic' },
    };

    it('should format slot in Romanian', () => {
      const result = service.formatSlotForDisplay(mockSlot, 'ro');
      expect(result).toContain('10:30');
      expect(result).toContain('Dr. Test');
      expect(result).toContain('Test Clinic');
    });

    it('should format slot in English', () => {
      const result = service.formatSlotForDisplay(mockSlot, 'en');
      expect(result).toContain('10:30');
      expect(result).toContain('Dr. Test');
    });

    it('should format slot in German', () => {
      const result = service.formatSlotForDisplay(mockSlot, 'de');
      expect(result).toContain('10:30');
    });

    it('should default to Romanian', () => {
      const result = service.formatSlotForDisplay(mockSlot);
      expect(result).toContain('ora');
      expect(result).toContain('cu');
    });

    it('should handle slot without practitioner', () => {
      const slotWithoutPractitioner = { ...mockSlot, practitioner: undefined };
      const result = service.formatSlotForDisplay(slotWithoutPractitioner, 'ro');
      expect(result).not.toContain('cu');
      expect(result).toContain('10:30');
    });

    it('should handle slot without location', () => {
      const slotWithoutLocation = { ...mockSlot, location: undefined };
      const result = service.formatSlotForDisplay(slotWithoutLocation, 'ro');
      expect(result).not.toContain(' - ');
      expect(result).toContain('10:30');
    });
  });

  describe('formatSlotShort', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should format as DD.MM HH:mm', () => {
      const slot: TimeSlot = {
        id: 'slot-1',
        date: '2024-03-15',
        time: '14:00',
        dateTime: '2024-03-15T14:00:00.000Z',
        duration: 60,
        available: true,
      };

      const result = service.formatSlotShort(slot);
      expect(result).toBe('15.03 14:00');
    });

    it('should pad single digit days and months', () => {
      const slot: TimeSlot = {
        id: 'slot-2',
        date: '2024-01-05',
        time: '09:00',
        dateTime: '2024-01-05T09:00:00.000Z',
        duration: 30,
        available: true,
      };

      const result = service.formatSlotShort(slot);
      expect(result).toBe('05.01 09:00');
    });
  });
});

describe('MockSchedulingService', () => {
  let mockService: MockSchedulingService;

  beforeEach(() => {
    mockService = new MockSchedulingService();
  });

  describe('getAvailableSlots', () => {
    it('should return available slots', async () => {
      const options: GetAvailableSlotsOptions = {
        procedureType: 'consultation',
        limit: 5,
      };

      const slots = await mockService.getAvailableSlots(options);

      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeLessThanOrEqual(5);
      slots.forEach((slot) => {
        expect(slot.available).toBe(true);
      });
    });

    it('should respect limit option', async () => {
      const slots3 = await mockService.getAvailableSlots({
        procedureType: 'checkup',
        limit: 3,
      });

      expect(slots3.length).toBeLessThanOrEqual(3);
    });

    it('should use default limit of 5', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'cleaning',
      });

      expect(slots.length).toBeLessThanOrEqual(5);
    });

    it('should skip weekends', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'exam',
        limit: 20, // Request many to test weekend skip
      });

      slots.forEach((slot) => {
        const date = new Date(slot.dateTime);
        const dayOfWeek = date.getDay();
        expect(dayOfWeek).not.toBe(0); // Sunday
        expect(dayOfWeek).not.toBe(6); // Saturday
      });
    });

    it('should return slots with valid structure', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'treatment',
      });

      slots.forEach((slot) => {
        expect(slot).toHaveProperty('id');
        expect(slot).toHaveProperty('date');
        expect(slot).toHaveProperty('time');
        expect(slot).toHaveProperty('dateTime');
        expect(slot).toHaveProperty('duration');
        expect(slot).toHaveProperty('available');
        expect(slot.id).toMatch(/^slot_/);
        expect(slot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(slot.time).toMatch(/^\d{2}:\d{2}$/);
      });
    });

    it('should adjust duration based on procedure type', async () => {
      const implantSlots = await mockService.getAvailableSlots({
        procedureType: 'implant-surgery',
        limit: 1,
      });

      const cleaningSlots = await mockService.getAvailableSlots({
        procedureType: 'teeth-cleaning',
        limit: 1,
      });

      if (implantSlots.length > 0 && cleaningSlots.length > 0) {
        expect(implantSlots[0]!.duration).toBe(90);
        expect(cleaningSlots[0]!.duration).toBe(30);
      }
    });

    it('should include practitioner info', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'exam',
        limit: 5,
      });

      const slotsWithPractitioner = slots.filter((s) => s.practitioner);
      expect(slotsWithPractitioner.length).toBeGreaterThan(0);
      slotsWithPractitioner.forEach((slot) => {
        expect(slot.practitioner).toHaveProperty('id');
        expect(slot.practitioner).toHaveProperty('name');
      });
    });

    it('should include location info', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'exam',
        limit: 5,
      });

      const slotsWithLocation = slots.filter((s) => s.location);
      expect(slotsWithLocation.length).toBeGreaterThan(0);
      slotsWithLocation.forEach((slot) => {
        expect(slot.location).toHaveProperty('id');
        expect(slot.location).toHaveProperty('name');
      });
    });

    it('should use preferred dates when provided', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const preferredDate = tomorrow.toISOString().split('T')[0]!;

      const slots = await mockService.getAvailableSlots({
        procedureType: 'exam',
        preferredDates: [preferredDate],
      });

      expect(slots.length).toBeGreaterThan(0);
    });
  });

  describe('bookAppointment', () => {
    it('should create appointment with required fields', async () => {
      const input: BookAppointmentInput = {
        slotId: 'slot-123',
        patientPhone: '+40712345678',
        procedureType: 'consultation',
      };

      const appointment = await mockService.bookAppointment(input);

      expect(appointment).toHaveProperty('id');
      expect(appointment.slotId).toBe('slot-123');
      expect(appointment.patientPhone).toBe('+40712345678');
      expect(appointment.procedureType).toBe('consultation');
      expect(appointment.status).toBe('confirmed');
    });

    it('should include optional patient name', async () => {
      const input: BookAppointmentInput = {
        slotId: 'slot-456',
        patientPhone: '+40712345678',
        patientName: 'Test Patient',
        procedureType: 'cleaning',
      };

      const appointment = await mockService.bookAppointment(input);

      expect(appointment.patientName).toBe('Test Patient');
    });

    it('should include optional patient email', async () => {
      const input: BookAppointmentInput = {
        slotId: 'slot-789',
        patientPhone: '+40712345678',
        patientEmail: 'test@example.com',
        procedureType: 'exam',
      };

      const appointment = await mockService.bookAppointment(input);

      expect(appointment.patientEmail).toBe('test@example.com');
    });

    it('should include optional notes', async () => {
      const input: BookAppointmentInput = {
        slotId: 'slot-notes',
        patientPhone: '+40712345678',
        procedureType: 'treatment',
        notes: 'Patient has allergy to penicillin',
      };

      const appointment = await mockService.bookAppointment(input);

      expect(appointment.notes).toBe('Patient has allergy to penicillin');
    });

    it('should generate unique confirmation code', async () => {
      const appt1 = await mockService.bookAppointment({
        slotId: 'slot-1',
        patientPhone: '+40700000001',
        procedureType: 'exam',
      });

      const appt2 = await mockService.bookAppointment({
        slotId: 'slot-2',
        patientPhone: '+40700000002',
        procedureType: 'exam',
      });

      expect(appt1.confirmationCode).toBeDefined();
      expect(appt2.confirmationCode).toBeDefined();
      expect(appt1.confirmationCode).not.toBe(appt2.confirmationCode);
    });

    it('should set timestamps', async () => {
      const appointment = await mockService.bookAppointment({
        slotId: 'slot-ts',
        patientPhone: '+40712345678',
        procedureType: 'exam',
      });

      expect(appointment.createdAt).toBeDefined();
      expect(appointment.updatedAt).toBeDefined();
      expect(new Date(appointment.createdAt).getTime()).toBeGreaterThan(0);
    });

    it('should store appointment for later retrieval', async () => {
      const appointment = await mockService.bookAppointment({
        slotId: 'slot-store',
        patientPhone: '+40712345678',
        procedureType: 'exam',
      });

      const retrieved = await mockService.getAppointment(appointment.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(appointment.id);
    });
  });

  describe('getAppointment', () => {
    it('should return appointment by ID', async () => {
      const created = await mockService.bookAppointment({
        slotId: 'slot-get',
        patientPhone: '+40712345678',
        procedureType: 'exam',
      });

      const found = await mockService.getAppointment(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('should return null for non-existent appointment', async () => {
      const found = await mockService.getAppointment('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('cancelAppointment', () => {
    it('should cancel existing appointment', async () => {
      const created = await mockService.bookAppointment({
        slotId: 'slot-cancel',
        patientPhone: '+40712345678',
        procedureType: 'exam',
      });

      const cancelled = await mockService.cancelAppointment({
        appointmentId: created.id,
      });

      expect(cancelled.status).toBe('cancelled');
    });

    it('should throw for non-existent appointment', async () => {
      await expect(
        mockService.cancelAppointment({
          appointmentId: 'fake-id',
        })
      ).rejects.toThrow('404: Appointment not found');
    });

    it('should update timestamp on cancel', async () => {
      const created = await mockService.bookAppointment({
        slotId: 'slot-cancel-ts',
        patientPhone: '+40712345678',
        procedureType: 'exam',
      });

      const cancelled = await mockService.cancelAppointment({
        appointmentId: created.id,
      });

      // Both should have valid ISO dates
      expect(new Date(cancelled.updatedAt).getTime()).toBeGreaterThan(0);
      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('formatSlotForDisplay', () => {
    it('should format slot in Romanian', () => {
      const slot: TimeSlot = {
        id: 'slot-format',
        date: '2024-06-15',
        time: '14:30',
        dateTime: '2024-06-15T14:30:00.000Z',
        duration: 60,
        available: true,
        practitioner: { id: 'dr-1', name: 'Dr. Format Test' },
        location: { id: 'loc-1', name: 'Format Clinic' },
      };

      const result = mockService.formatSlotForDisplay(slot, 'ro');

      expect(result).toContain('14:30');
      expect(result).toContain('Dr. Format Test');
      expect(result).toContain('Format Clinic');
    });

    it('should format slot in English', () => {
      const slot: TimeSlot = {
        id: 'slot-en',
        date: '2024-03-20',
        time: '09:00',
        dateTime: '2024-03-20T09:00:00.000Z',
        duration: 30,
        available: true,
      };

      const result = mockService.formatSlotForDisplay(slot, 'en');

      expect(result).toContain('09:00');
      expect(result).toContain('March');
    });

    it('should format slot in German', () => {
      const slot: TimeSlot = {
        id: 'slot-de',
        date: '2024-04-10',
        time: '11:00',
        dateTime: '2024-04-10T11:00:00.000Z',
        duration: 45,
        available: true,
      };

      const result = mockService.formatSlotForDisplay(slot, 'de');

      expect(result).toContain('11:00');
    });
  });

  describe('formatSlotShort', () => {
    it('should return DD.MM HH:mm format', () => {
      const slot: TimeSlot = {
        id: 'slot-short',
        date: '2024-12-25',
        time: '15:45',
        dateTime: '2024-12-25T15:45:00.000Z',
        duration: 60,
        available: true,
      };

      const result = mockService.formatSlotShort(slot);

      expect(result).toBe('25.12 15:45');
    });
  });
});

describe('Factory functions', () => {
  describe('createSchedulingService', () => {
    it('should create SchedulingService instance', () => {
      const service = createSchedulingService({
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key',
      });
      expect(service).toBeInstanceOf(SchedulingService);
    });
  });

  describe('createMockSchedulingService', () => {
    it('should create MockSchedulingService instance', () => {
      const service = createMockSchedulingService();
      expect(service).toBeInstanceOf(MockSchedulingService);
    });
  });
});

describe('Property-based tests', () => {
  describe('MockSchedulingService', () => {
    it('should always return valid slots', async () => {
      const mockService = new MockSchedulingService();

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('consultation', 'cleaning', 'implant', 'exam'),
          fc.integer({ min: 1, max: 10 }),
          async (procedureType, limit) => {
            const slots = await mockService.getAvailableSlots({
              procedureType,
              limit,
            });

            return (
              Array.isArray(slots) &&
              slots.every(
                (slot) =>
                  typeof slot.id === 'string' &&
                  typeof slot.date === 'string' &&
                  typeof slot.time === 'string' &&
                  typeof slot.duration === 'number' &&
                  slot.duration > 0 &&
                  slot.available === true
              )
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should create valid appointments', async () => {
      const mockService = new MockSchedulingService();

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }),
          fc.stringMatching(/^\+\d{10,15}$/),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (slotId, phone, procedure) => {
            const appointment = await mockService.bookAppointment({
              slotId,
              patientPhone: phone,
              procedureType: procedure,
            });

            return (
              typeof appointment.id === 'string' &&
              appointment.slotId === slotId &&
              appointment.patientPhone === phone &&
              appointment.procedureType === procedure &&
              appointment.status === 'confirmed' &&
              typeof appointment.confirmationCode === 'string'
            );
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Slot formatting', () => {
    it('should always produce non-empty format strings', () => {
      const mockService = new MockSchedulingService();

      // Use integer timestamp to avoid Invalid Date issues
      fc.assert(
        fc.property(
          fc.integer({ min: 1704067200000, max: 1735689600000 }), // 2024-01-01 to 2025-12-31
          fc.constantFrom('ro', 'en', 'de'),
          (timestamp, language) => {
            const date = new Date(timestamp);
            const slot: TimeSlot = {
              id: 'test-slot',
              date: date.toISOString().split('T')[0]!,
              time: '10:00',
              dateTime: date.toISOString(),
              duration: 60,
              available: true,
            };

            const result = mockService.formatSlotForDisplay(slot, language as 'ro' | 'en' | 'de');

            return typeof result === 'string' && result.length > 0;
          }
        )
      );
    });

    it('should always produce valid short format', () => {
      const mockService = new MockSchedulingService();

      // Use integer timestamp to avoid Invalid Date issues
      fc.assert(
        fc.property(
          fc.integer({ min: 1704067200000, max: 1735689600000 }), // 2024-01-01 to 2025-12-31
          fc.stringMatching(/^\d{2}:\d{2}$/),
          (timestamp, time) => {
            const date = new Date(timestamp);
            const slot: TimeSlot = {
              id: 'test-slot',
              date: date.toISOString().split('T')[0]!,
              time,
              dateTime: date.toISOString(),
              duration: 60,
              available: true,
            };

            const result = mockService.formatSlotShort(slot);

            // Should match DD.MM HH:mm pattern
            return /^\d{2}\.\d{2} \d{2}:\d{2}$/.test(result);
          }
        )
      );
    });
  });
});

describe('SchedulingService API methods', () => {
  const validConfig: SchedulingServiceConfig = {
    apiUrl: 'https://scheduling.example.com',
    apiKey: 'test-api-key',
    clinicId: 'clinic-123',
    retryConfig: { maxRetries: 1, baseDelayMs: 100 },
    timeoutMs: 5000,
  };

  let service: SchedulingService;

  beforeEach(() => {
    service = new SchedulingService(validConfig);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('getAvailableSlots', () => {
    it('should build correct query parameters', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ slots: [] }), { status: 200 });
      }) as typeof fetch;

      await service.getAvailableSlots({
        procedureType: 'implant',
        startDate: '2024-01-15',
        endDate: '2024-01-20',
        practitionerId: 'dr-123',
        locationId: 'loc-456',
        limit: 10,
      });

      expect(capturedUrl).toContain('procedure_type=implant');
      expect(capturedUrl).toContain('start_date=2024-01-15');
      expect(capturedUrl).toContain('end_date=2024-01-20');
      expect(capturedUrl).toContain('practitioner_id=dr-123');
      expect(capturedUrl).toContain('location_id=loc-456');
      expect(capturedUrl).toContain('limit=10');
      expect(capturedUrl).toContain('clinic_id=clinic-123');
    });

    it('should filter only available slots', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            slots: [
              { id: 'slot-1', available: true },
              { id: 'slot-2', available: false },
              { id: 'slot-3', available: true },
            ],
          }),
          { status: 200 }
        )
      ) as typeof fetch;

      const slots = await service.getAvailableSlots({ procedureType: 'exam' });

      expect(slots).toHaveLength(2);
      expect(slots.every((s) => s.available)).toBe(true);
    });

    it('should handle preferred dates', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ slots: [] }), { status: 200 });
      }) as typeof fetch;

      await service.getAvailableSlots({
        procedureType: 'exam',
        preferredDates: ['2024-01-15', '2024-01-16'],
      });

      expect(capturedUrl).toContain('preferred_dates=2024-01-15%2C2024-01-16');
    });

    it('should validate procedureType is required', async () => {
      await expect(service.getAvailableSlots({ procedureType: '' })).rejects.toThrow();
    });
  });

  describe('getSlot', () => {
    it('should return slot when found', async () => {
      const mockSlot = { id: 'slot-123', available: true };
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(mockSlot), { status: 200 })) as typeof fetch;

      const slot = await service.getSlot('slot-123');

      expect(slot).toEqual(mockSlot);
    });

    it('should return null on 404', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response('Not Found', { status: 404 })) as typeof fetch;

      const slot = await service.getSlot('non-existent');

      expect(slot).toBeNull();
    });

    it('should throw on other errors', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response('Server Error', { status: 500 })) as typeof fetch;

      await expect(service.getSlot('slot-123')).rejects.toThrow('Request failed with status 500');
    });
  });

  describe('bookAppointment', () => {
    it('should send correct payload', async () => {
      let capturedBody = {};
      global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedBody = JSON.parse(options.body as string);
        return new Response(
          JSON.stringify({
            id: 'apt-123',
            status: 'confirmed',
            slotId: 'slot-1',
            patientPhone: '+40712345678',
            procedureType: 'exam',
            scheduledAt: new Date().toISOString(),
            duration: 60,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          { status: 200 }
        );
      }) as typeof fetch;

      await service.bookAppointment({
        slotId: 'slot-1',
        patientPhone: '+40712345678',
        patientName: 'Test Patient',
        patientEmail: 'test@example.com',
        procedureType: 'exam',
        notes: 'Test notes',
        hubspotContactId: 'hs-123',
        metadata: { source: 'whatsapp' },
      });

      expect(capturedBody).toMatchObject({
        slot_id: 'slot-1',
        patient: {
          phone: '+40712345678',
          name: 'Test Patient',
          email: 'test@example.com',
        },
        procedure_type: 'exam',
        notes: 'Test notes',
        external_refs: { hubspot_contact_id: 'hs-123' },
        metadata: { source: 'whatsapp' },
        clinic_id: 'clinic-123',
      });
    });

    it('should validate phone number', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '123', // Too short
          procedureType: 'exam',
        })
      ).rejects.toThrow();
    });

    it('should validate email format when provided', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '+40712345678',
          patientEmail: 'invalid-email',
          procedureType: 'exam',
        })
      ).rejects.toThrow();
    });

    it('should validate slotId is required', async () => {
      await expect(
        service.bookAppointment({
          slotId: '',
          patientPhone: '+40712345678',
          procedureType: 'exam',
        })
      ).rejects.toThrow();
    });
  });

  describe('getAppointment', () => {
    it('should return appointment when found', async () => {
      const mockAppointment = { id: 'apt-123', status: 'confirmed' };
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(mockAppointment), { status: 200 })
        ) as typeof fetch;

      const appointment = await service.getAppointment('apt-123');

      expect(appointment).toEqual(mockAppointment);
    });

    it('should return null on 404', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response('Not Found', { status: 404 })) as typeof fetch;

      const appointment = await service.getAppointment('non-existent');

      expect(appointment).toBeNull();
    });
  });

  describe('cancelAppointment', () => {
    it('should send cancel request with reason', async () => {
      let capturedBody = {};
      global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedBody = JSON.parse(options.body as string);
        return new Response(JSON.stringify({ id: 'apt-123', status: 'cancelled' }), {
          status: 200,
        });
      }) as typeof fetch;

      await service.cancelAppointment({
        appointmentId: 'apt-123',
        reason: 'Patient requested',
        notifyPatient: false,
      });

      expect(capturedBody).toMatchObject({
        reason: 'Patient requested',
        notify_patient: false,
      });
    });

    it('should default notifyPatient to true', async () => {
      let capturedBody = {};
      global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedBody = JSON.parse(options.body as string);
        return new Response(JSON.stringify({ id: 'apt-123', status: 'cancelled' }), {
          status: 200,
        });
      }) as typeof fetch;

      await service.cancelAppointment({ appointmentId: 'apt-123' });

      expect(capturedBody).toMatchObject({
        notify_patient: true,
      });
    });

    it('should validate appointmentId is required', async () => {
      await expect(service.cancelAppointment({ appointmentId: '' })).rejects.toThrow();
    });
  });

  describe('rescheduleAppointment', () => {
    it('should send reschedule request', async () => {
      let capturedBody = {};
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(options.body as string);
        return new Response(JSON.stringify({ id: 'apt-123', status: 'confirmed' }), {
          status: 200,
        });
      }) as typeof fetch;

      await service.rescheduleAppointment({
        appointmentId: 'apt-123',
        newSlotId: 'slot-456',
        reason: 'Schedule conflict',
        notifyPatient: true,
      });

      expect(capturedUrl).toContain('/apt-123/reschedule');
      expect(capturedBody).toMatchObject({
        new_slot_id: 'slot-456',
        reason: 'Schedule conflict',
        notify_patient: true,
      });
    });

    it('should validate newSlotId is required', async () => {
      await expect(
        service.rescheduleAppointment({
          appointmentId: 'apt-123',
          newSlotId: '',
        })
      ).rejects.toThrow();
    });
  });

  describe('getPatientAppointments', () => {
    it('should build correct query parameters', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ appointments: [] }), { status: 200 });
      }) as typeof fetch;

      await service.getPatientAppointments('+40712345678', {
        status: 'confirmed',
        limit: 5,
      });

      expect(capturedUrl).toContain('patient_phone=%2B40712345678');
      expect(capturedUrl).toContain('status=confirmed');
      expect(capturedUrl).toContain('limit=5');
    });

    it('should use default limit of 10', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ appointments: [] }), { status: 200 });
      }) as typeof fetch;

      await service.getPatientAppointments('+40712345678');

      expect(capturedUrl).toContain('limit=10');
    });
  });

  describe('isSlotAvailable', () => {
    it('should return true for available slot', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 'slot-1', available: true }), { status: 200 })
        ) as typeof fetch;

      const isAvailable = await service.isSlotAvailable('slot-1');

      expect(isAvailable).toBe(true);
    });

    it('should return false for unavailable slot', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 'slot-1', available: false }), { status: 200 })
        ) as typeof fetch;

      const isAvailable = await service.isSlotAvailable('slot-1');

      expect(isAvailable).toBe(false);
    });

    it('should return false when slot not found', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response('Not Found', { status: 404 })) as typeof fetch;

      const isAvailable = await service.isSlotAvailable('non-existent');

      expect(isAvailable).toBe(false);
    });
  });
});

describe('SchedulingService error handling', () => {
  const config: SchedulingServiceConfig = {
    apiUrl: 'https://scheduling.example.com',
    apiKey: 'test-key',
    retryConfig: { maxRetries: 2, baseDelayMs: 100 },
    timeoutMs: 1000,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('should handle 429 rate limit', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return new Response(null, { status: 429 });
      }
      return new Response(JSON.stringify({ slots: [] }), { status: 200 });
    }) as typeof fetch;

    const service = new SchedulingService(config);

    // Should eventually succeed after retry
    const slots = await service.getAvailableSlots({ procedureType: 'exam' });
    expect(slots).toEqual([]);
    expect(callCount).toBe(3);
  });

  it('should retry on 502 errors', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 1) {
        return new Response('Bad Gateway', { status: 502 });
      }
      return new Response(JSON.stringify({ slots: [] }), { status: 200 });
    }) as typeof fetch;

    const service = new SchedulingService(config);
    const slots = await service.getAvailableSlots({ procedureType: 'exam' });

    expect(slots).toEqual([]);
    expect(callCount).toBe(2);
  });

  it('should retry on 503 errors', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 1) {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({ slots: [] }), { status: 200 });
    }) as typeof fetch;

    const service = new SchedulingService(config);
    const slots = await service.getAvailableSlots({ procedureType: 'exam' });

    expect(slots).toEqual([]);
    expect(callCount).toBe(2);
  });

  it('should throw on non-retryable errors', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('Forbidden', { status: 403 })) as typeof fetch;

    const service = new SchedulingService(config);

    await expect(service.getAvailableSlots({ procedureType: 'exam' })).rejects.toThrow(
      'Request failed with status 403'
    );
  });

  it('should handle request timeout', async () => {
    // Create a service with short timeout (must be >= 1000ms per schema)
    const shortTimeoutConfig: SchedulingServiceConfig = {
      ...config,
      timeoutMs: 1000,
      retryConfig: { maxRetries: 0, baseDelayMs: 100 },
    };

    // Use AbortController mock to simulate timeout
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          const error = new Error('AbortError');
          error.name = 'AbortError';
          setTimeout(() => reject(error), 50);
        })
    ) as typeof fetch;

    const service = new SchedulingService(shortTimeoutConfig);

    await expect(service.getAvailableSlots({ procedureType: 'exam' })).rejects.toThrow(
      /timed out|timeout/i
    );
  });

  it('should include Authorization header', async () => {
    let capturedHeaders: Record<string, string> = {};
    global.fetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      capturedHeaders = options.headers as Record<string, string>;
      return new Response(JSON.stringify({ slots: [] }), { status: 200 });
    }) as typeof fetch;

    const service = new SchedulingService(config);
    await service.getAvailableSlots({ procedureType: 'exam' });

    expect(capturedHeaders.Authorization).toBe('Bearer test-key');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });
});

describe('Validation schemas edge cases', () => {
  describe('Phone validation', () => {
    it('should accept valid phone numbers', () => {
      const mockService = new MockSchedulingService();

      const validPhones = ['+40712345678', '0712345678', '+1234567890123'];

      validPhones.forEach(async (phone) => {
        await expect(
          mockService.bookAppointment({
            slotId: 'slot-phone',
            patientPhone: phone,
            procedureType: 'exam',
          })
        ).resolves.toBeDefined();
      });
    });
  });

  describe('Time slot structure', () => {
    it('should have all working hours in valid format', async () => {
      const mockService = new MockSchedulingService();
      const slots = await mockService.getAvailableSlots({
        procedureType: 'exam',
        limit: 20,
      });

      const validHours = ['09:00', '10:30', '14:00', '15:30', '17:00'];

      slots.forEach((slot) => {
        expect(validHours).toContain(slot.time);
      });
    });
  });
});

// =============================================================================
// New MockSchedulingService Methods Tests
// =============================================================================

describe('MockSchedulingService - Extended Methods', () => {
  let mockService: MockSchedulingService;

  beforeEach(() => {
    mockService = new MockSchedulingService();
  });

  describe('rescheduleAppointment', () => {
    it('should reschedule existing appointment', async () => {
      const created = await mockService.bookAppointment({
        slotId: 'slot-original',
        patientPhone: '+40712345678',
        procedureType: 'consultation',
      });

      const rescheduled = await mockService.rescheduleAppointment({
        appointmentId: created.id,
        newSlotId: 'slot-new',
      });

      expect(rescheduled.slotId).toBe('slot-new');
      expect(rescheduled.status).toBe('confirmed');
      expect(rescheduled.id).toBe(created.id);
    });

    it('should update scheduledAt on reschedule', async () => {
      const created = await mockService.bookAppointment({
        slotId: 'slot-rs-1',
        patientPhone: '+40712345678',
        procedureType: 'exam',
      });

      const originalScheduledAt = created.scheduledAt;

      const rescheduled = await mockService.rescheduleAppointment({
        appointmentId: created.id,
        newSlotId: 'slot-rs-2',
      });

      expect(rescheduled.scheduledAt).not.toBe(originalScheduledAt);
    });

    it('should update timestamp on reschedule', async () => {
      const created = await mockService.bookAppointment({
        slotId: 'slot-ts-1',
        patientPhone: '+40712345678',
        procedureType: 'exam',
      });

      const originalUpdatedAt = created.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const rescheduled = await mockService.rescheduleAppointment({
        appointmentId: created.id,
        newSlotId: 'slot-ts-2',
      });

      expect(new Date(rescheduled.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(originalUpdatedAt).getTime()
      );
    });

    it('should throw for non-existent appointment', async () => {
      await expect(
        mockService.rescheduleAppointment({
          appointmentId: 'non-existent-id',
          newSlotId: 'slot-new',
        })
      ).rejects.toThrow('404: Appointment not found');
    });

    it('should preserve original appointment data', async () => {
      const created = await mockService.bookAppointment({
        slotId: 'slot-preserve',
        patientPhone: '+40712345678',
        patientName: 'Test Patient',
        patientEmail: 'test@example.com',
        procedureType: 'implant',
        notes: 'Patient notes',
      });

      const rescheduled = await mockService.rescheduleAppointment({
        appointmentId: created.id,
        newSlotId: 'slot-new-preserve',
      });

      expect(rescheduled.patientPhone).toBe('+40712345678');
      expect(rescheduled.patientName).toBe('Test Patient');
      expect(rescheduled.patientEmail).toBe('test@example.com');
      expect(rescheduled.procedureType).toBe('implant');
      expect(rescheduled.notes).toBe('Patient notes');
    });
  });

  describe('getPatientAppointments', () => {
    beforeEach(async () => {
      // Create some appointments for testing
      await mockService.bookAppointment({
        slotId: 'slot-p1-1',
        patientPhone: '+40711111111',
        procedureType: 'consultation',
      });
      await mockService.bookAppointment({
        slotId: 'slot-p1-2',
        patientPhone: '+40711111111',
        procedureType: 'cleaning',
      });
      await mockService.bookAppointment({
        slotId: 'slot-p2-1',
        patientPhone: '+40722222222',
        procedureType: 'implant',
      });
    });

    it('should return appointments for patient (string query)', async () => {
      const appointments = await mockService.getPatientAppointments('+40711111111');

      expect(appointments).toHaveLength(2);
      appointments.forEach((apt) => {
        expect(apt.patientPhone).toBe('+40711111111');
      });
    });

    it('should return appointments for patient (object query)', async () => {
      const appointments = await mockService.getPatientAppointments({
        patientPhone: '+40711111111',
      });

      expect(appointments).toHaveLength(2);
    });

    it('should return empty array for patient with no appointments', async () => {
      const appointments = await mockService.getPatientAppointments('+40799999999');

      expect(appointments).toHaveLength(0);
    });

    it('should filter by status when provided', async () => {
      // Cancel one appointment
      const patientAppts = await mockService.getPatientAppointments('+40711111111');
      await mockService.cancelAppointment({ appointmentId: patientAppts[0]!.id });

      // Get only confirmed
      const confirmedOnly = await mockService.getPatientAppointments({
        patientPhone: '+40711111111',
        status: 'confirmed',
      });

      expect(confirmedOnly).toHaveLength(1);
      confirmedOnly.forEach((apt) => {
        expect(apt.status).toBe('confirmed');
      });
    });

    it('should respect limit parameter', async () => {
      const appointments = await mockService.getPatientAppointments({
        patientPhone: '+40711111111',
        limit: 1,
      });

      expect(appointments).toHaveLength(1);
    });

    it('should use default limit of 10', async () => {
      // Create 15 appointments for one patient
      for (let i = 0; i < 13; i++) {
        await mockService.bookAppointment({
          slotId: `slot-bulk-${i}`,
          patientPhone: '+40733333333',
          procedureType: 'consultation',
        });
      }

      const appointments = await mockService.getPatientAppointments('+40733333333');

      expect(appointments.length).toBeLessThanOrEqual(10);
    });

    it('should handle hubspotContactId in query (ignored in mock)', async () => {
      const appointments = await mockService.getPatientAppointments({
        patientPhone: '+40711111111',
        hubspotContactId: 'hs_contact_123',
      });

      expect(appointments).toHaveLength(2);
    });
  });

  describe('getSlot', () => {
    it('should return a slot for any slotId', async () => {
      const slot = await mockService.getSlot('any-slot-id');

      expect(slot).not.toBeNull();
      expect(slot?.id).toBe('any-slot-id');
    });

    it('should return slot with valid structure', async () => {
      const slot = await mockService.getSlot('test-slot-123');

      expect(slot).toHaveProperty('id');
      expect(slot).toHaveProperty('date');
      expect(slot).toHaveProperty('time');
      expect(slot).toHaveProperty('dateTime');
      expect(slot).toHaveProperty('duration');
      expect(slot).toHaveProperty('available');
      expect(slot).toHaveProperty('practitioner');
      expect(slot).toHaveProperty('location');
    });

    it('should return slot with practitioner info', async () => {
      const slot = await mockService.getSlot('slot-with-practitioner');

      expect(slot?.practitioner).toBeDefined();
      expect(slot?.practitioner?.id).toBeDefined();
      expect(slot?.practitioner?.name).toBeDefined();
      expect(slot?.practitioner?.specialty).toBeDefined();
    });

    it('should return slot with location info', async () => {
      const slot = await mockService.getSlot('slot-with-location');

      expect(slot?.location).toBeDefined();
      expect(slot?.location?.id).toBeDefined();
      expect(slot?.location?.name).toBeDefined();
      expect(slot?.location?.address).toBeDefined();
    });

    it('should return slot marked as available', async () => {
      const slot = await mockService.getSlot('available-slot');

      expect(slot?.available).toBe(true);
    });

    it('should return future date for slot', async () => {
      const slot = await mockService.getSlot('future-slot');
      const slotDate = new Date(slot!.dateTime);
      const now = new Date();

      expect(slotDate.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('isSlotAvailable', () => {
    it('should return true for normal slot IDs', async () => {
      const isAvailable = await mockService.isSlotAvailable('slot-123');

      expect(isAvailable).toBe(true);
    });

    it('should return true for various slot ID formats', async () => {
      expect(await mockService.isSlotAvailable('slot_abc')).toBe(true);
      expect(await mockService.isSlotAvailable('available-slot')).toBe(true);
      expect(await mockService.isSlotAvailable('12345')).toBe(true);
    });

    it('should return false for slot IDs starting with "unavailable"', async () => {
      expect(await mockService.isSlotAvailable('unavailable-slot')).toBe(false);
      expect(await mockService.isSlotAvailable('unavailable_123')).toBe(false);
      expect(await mockService.isSlotAvailable('unavailableSlot')).toBe(false);
    });

    it('should be case-sensitive for unavailable prefix', async () => {
      // Only lowercase "unavailable" prefix is treated as unavailable
      expect(await mockService.isSlotAvailable('Unavailable-slot')).toBe(true);
      expect(await mockService.isSlotAvailable('UNAVAILABLE-slot')).toBe(true);
    });

    it('should handle empty slot ID', async () => {
      const isAvailable = await mockService.isSlotAvailable('');

      expect(isAvailable).toBe(true); // Empty string doesn't start with 'unavailable'
    });
  });
});

// =============================================================================
// Integration Tests for New Methods
// =============================================================================

describe('MockSchedulingService - Integration Flows', () => {
  let mockService: MockSchedulingService;

  beforeEach(() => {
    mockService = new MockSchedulingService();
  });

  it('should support full booking flow with slot check', async () => {
    // 1. Get available slots
    const slots = await mockService.getAvailableSlots({
      procedureType: 'implant',
      limit: 3,
    });
    expect(slots.length).toBeGreaterThan(0);

    // 2. Check if specific slot is available
    const slotId = slots[0]!.id;
    const isAvailable = await mockService.isSlotAvailable(slotId);
    expect(isAvailable).toBe(true);

    // 3. Book the appointment
    const appointment = await mockService.bookAppointment({
      slotId,
      patientPhone: '+40712345678',
      patientName: 'Test Patient',
      procedureType: 'implant',
    });
    expect(appointment.status).toBe('confirmed');

    // 4. Verify appointment appears in patient's list
    const patientAppointments = await mockService.getPatientAppointments('+40712345678');
    expect(patientAppointments.some((a) => a.id === appointment.id)).toBe(true);
  });

  it('should support full reschedule flow', async () => {
    // 1. Book initial appointment
    const original = await mockService.bookAppointment({
      slotId: 'original-slot',
      patientPhone: '+40712345678',
      procedureType: 'consultation',
    });

    // 2. Get a new slot
    const newSlot = await mockService.getSlot('new-slot-id');
    expect(newSlot).not.toBeNull();

    // 3. Check new slot availability
    const isAvailable = await mockService.isSlotAvailable('new-slot-id');
    expect(isAvailable).toBe(true);

    // 4. Reschedule
    const rescheduled = await mockService.rescheduleAppointment({
      appointmentId: original.id,
      newSlotId: 'new-slot-id',
    });

    expect(rescheduled.slotId).toBe('new-slot-id');
    expect(rescheduled.status).toBe('confirmed');

    // 5. Verify old and new are same appointment
    const fetched = await mockService.getAppointment(original.id);
    expect(fetched?.slotId).toBe('new-slot-id');
  });

  it('should support cancellation and retrieval flow', async () => {
    // 1. Book appointment
    const appointment = await mockService.bookAppointment({
      slotId: 'cancel-flow-slot',
      patientPhone: '+40712345678',
      procedureType: 'exam',
    });

    // 2. Verify it appears in patient list
    let patientAppts = await mockService.getPatientAppointments('+40712345678');
    expect(patientAppts.some((a) => a.id === appointment.id && a.status === 'confirmed')).toBe(true);

    // 3. Cancel it
    await mockService.cancelAppointment({ appointmentId: appointment.id });

    // 4. Verify status changed
    patientAppts = await mockService.getPatientAppointments('+40712345678');
    expect(patientAppts.some((a) => a.id === appointment.id && a.status === 'cancelled')).toBe(true);

    // 5. Filter by confirmed status should not include it
    const confirmedOnly = await mockService.getPatientAppointments({
      patientPhone: '+40712345678',
      status: 'confirmed',
    });
    expect(confirmedOnly.some((a) => a.id === appointment.id)).toBe(false);
  });
});
