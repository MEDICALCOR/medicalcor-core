/**
 * Scheduling Integration Branch Coverage Tests
 *
 * Tests SchedulingService for 100% branch coverage including:
 * - Slot availability
 * - Appointment booking, cancellation, rescheduling
 * - Input validation
 * - Error handling and retries
 * - Mock service for development
 *
 * Uses MSW for HTTP mocking via the global vitest.setup.ts configuration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../__mocks__/server.js';
import {
  SchedulingService,
  MockSchedulingService,
  createSchedulingService,
  createMockSchedulingService,
  type SchedulingServiceConfig,
  type TimeSlot,
  type Appointment,
} from '../scheduling.js';

// =============================================================================
// SchedulingService Tests
// =============================================================================

describe('SchedulingService', () => {
  const validConfig: SchedulingServiceConfig = {
    apiUrl: 'https://scheduling.test.api',
    apiKey: 'test-scheduling-api-key',
    clinicId: 'clinic_test_123',
    defaultTimezone: 'Europe/Bucharest',
  };

  let service: SchedulingService;

  beforeEach(() => {
    service = new SchedulingService(validConfig);
  });

  describe('constructor and config validation', () => {
    it('should create service with valid config', () => {
      expect(service).toBeInstanceOf(SchedulingService);
    });

    it('should create service with minimal config', () => {
      const minimalService = new SchedulingService({
        apiUrl: 'https://api.test.com',
        apiKey: 'test-key',
      });
      expect(minimalService).toBeInstanceOf(SchedulingService);
    });

    it('should accept custom retry config', () => {
      const retryService = new SchedulingService({
        apiUrl: 'https://api.test.com',
        apiKey: 'test-key',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });
      expect(retryService).toBeInstanceOf(SchedulingService);
    });

    it('should accept custom timeout', () => {
      const timeoutService = new SchedulingService({
        apiUrl: 'https://api.test.com',
        apiKey: 'test-key',
        timeoutMs: 30000,
      });
      expect(timeoutService).toBeInstanceOf(SchedulingService);
    });

    it('should throw on invalid apiUrl', () => {
      expect(
        () =>
          new SchedulingService({
            apiUrl: 'not-a-url',
            apiKey: 'test-key',
          })
      ).toThrow();
    });

    it('should throw on missing apiKey', () => {
      expect(
        () =>
          new SchedulingService({
            apiUrl: 'https://api.test.com',
            apiKey: '',
          })
      ).toThrow();
    });
  });

  describe('getAvailableSlots', () => {
    it('should fetch available slots successfully', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots', () => {
          return HttpResponse.json({
            slots: [
              {
                id: 'slot_1',
                date: '2024-01-15',
                time: '09:00',
                dateTime: '2024-01-15T09:00:00Z',
                duration: 60,
                available: true,
                practitioner: { id: 'dr_1', name: 'Dr. Test' },
                location: { id: 'loc_1', name: 'Main Clinic' },
              },
              {
                id: 'slot_2',
                date: '2024-01-15',
                time: '10:30',
                dateTime: '2024-01-15T10:30:00Z',
                duration: 60,
                available: true,
              },
              {
                id: 'slot_3',
                date: '2024-01-15',
                time: '14:00',
                dateTime: '2024-01-15T14:00:00Z',
                duration: 60,
                available: false, // Should be filtered out
              },
            ],
          });
        })
      );

      const slots = await service.getAvailableSlots({
        procedureType: 'implant',
      });

      expect(slots).toHaveLength(2);
      expect(slots.every((s) => s.available)).toBe(true);
    });

    it('should pass all filter parameters', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots', ({ request }) => {
          receivedParams = new URL(request.url).searchParams;
          return HttpResponse.json({ slots: [] });
        })
      );

      await service.getAvailableSlots({
        procedureType: 'implant',
        preferredDates: ['2024-01-15', '2024-01-16'],
        startDate: '2024-01-15',
        endDate: '2024-01-31',
        practitionerId: 'dr_1',
        locationId: 'loc_1',
        limit: 10,
      });

      expect(receivedParams?.get('procedure_type')).toBe('implant');
      expect(receivedParams?.get('preferred_dates')).toBe('2024-01-15,2024-01-16');
      expect(receivedParams?.get('start_date')).toBe('2024-01-15');
      expect(receivedParams?.get('end_date')).toBe('2024-01-31');
      expect(receivedParams?.get('practitioner_id')).toBe('dr_1');
      expect(receivedParams?.get('location_id')).toBe('loc_1');
      expect(receivedParams?.get('limit')).toBe('10');
      expect(receivedParams?.get('clinic_id')).toBe('clinic_test_123');
    });

    it('should use default limit when not specified', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots', ({ request }) => {
          receivedParams = new URL(request.url).searchParams;
          return HttpResponse.json({ slots: [] });
        })
      );

      await service.getAvailableSlots({
        procedureType: 'cleaning',
      });

      expect(receivedParams?.get('limit')).toBe('5');
    });

    it('should validate input and reject invalid procedure type', async () => {
      await expect(
        service.getAvailableSlots({
          procedureType: '', // Empty
        })
      ).rejects.toThrow();
    });
  });

  describe('getSlot', () => {
    it('should fetch slot by ID', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots/:slotId', ({ params }) => {
          return HttpResponse.json({
            id: params.slotId,
            date: '2024-01-15',
            time: '09:00',
            dateTime: '2024-01-15T09:00:00Z',
            duration: 60,
            available: true,
          });
        })
      );

      const slot = await service.getSlot('slot_123');

      expect(slot).not.toBeNull();
      expect(slot?.id).toBe('slot_123');
    });

    it('should return null for non-existent slot', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots/:slotId', () => {
          return new HttpResponse('Not Found', { status: 404 });
        })
      );

      const slot = await service.getSlot('non_existent');
      expect(slot).toBeNull();
    });

    it('should throw on non-404 errors', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots/:slotId', () => {
          return new HttpResponse('Server Error', { status: 500 });
        })
      );

      await expect(service.getSlot('slot_error')).rejects.toThrow();
    });
  });

  describe('bookAppointment', () => {
    it('should book appointment successfully', async () => {
      server.use(
        http.post('https://scheduling.test.api/api/v1/appointments', async ({ request }) => {
          const body = await request.json();
          return HttpResponse.json({
            id: 'apt_new_123',
            slotId: (body as Record<string, unknown>).slot_id,
            patientPhone: ((body as Record<string, unknown>).patient as Record<string, unknown>)
              .phone,
            procedureType: (body as Record<string, unknown>).procedure_type,
            scheduledAt: '2024-01-15T09:00:00Z',
            duration: 60,
            status: 'confirmed',
            confirmationCode: 'ABC123',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        })
      );

      const appointment = await service.bookAppointment({
        slotId: 'slot_123',
        patientPhone: '+40721000001',
        procedureType: 'implant',
      });

      expect(appointment).toHaveProperty('id', 'apt_new_123');
      expect(appointment).toHaveProperty('status', 'confirmed');
      expect(appointment).toHaveProperty('confirmationCode');
    });

    it('should book appointment with all optional fields', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.post('https://scheduling.test.api/api/v1/appointments', async ({ request }) => {
          receivedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            id: 'apt_full',
            slotId: 'slot_123',
            patientPhone: '+40721000001',
            patientName: 'Ion Popescu',
            patientEmail: 'ion@example.com',
            procedureType: 'implant',
            notes: 'First visit',
            scheduledAt: '2024-01-15T09:00:00Z',
            duration: 60,
            status: 'confirmed',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        })
      );

      await service.bookAppointment({
        slotId: 'slot_123',
        patientPhone: '+40721000001',
        patientName: 'Ion Popescu',
        patientEmail: 'ion@example.com',
        procedureType: 'implant',
        notes: 'First visit',
        hubspotContactId: 'hs_123',
        metadata: { source: 'whatsapp' },
      });

      expect(receivedBody?.notes).toBe('First visit');
      expect((receivedBody?.external_refs as Record<string, unknown>)?.hubspot_contact_id).toBe(
        'hs_123'
      );
      expect(receivedBody?.metadata).toEqual({ source: 'whatsapp' });
    });

    it('should validate phone number', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot_123',
          patientPhone: '123', // Too short
          procedureType: 'implant',
        })
      ).rejects.toThrow();
    });

    it('should validate procedure type', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot_123',
          patientPhone: '+40721000001',
          procedureType: '', // Empty
        })
      ).rejects.toThrow();
    });
  });

  describe('getAppointment', () => {
    it('should fetch appointment by ID', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/appointments/:appointmentId', ({ params }) => {
          return HttpResponse.json({
            id: params.appointmentId,
            slotId: 'slot_123',
            patientPhone: '+40721000001',
            procedureType: 'implant',
            scheduledAt: '2024-01-15T09:00:00Z',
            duration: 60,
            status: 'confirmed',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        })
      );

      const appointment = await service.getAppointment('apt_123');

      expect(appointment).not.toBeNull();
      expect(appointment?.id).toBe('apt_123');
    });

    it('should return null for non-existent appointment', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/appointments/:appointmentId', () => {
          return new HttpResponse('Not Found', { status: 404 });
        })
      );

      const appointment = await service.getAppointment('non_existent');
      expect(appointment).toBeNull();
    });

    it('should rethrow non-404 errors (line 286)', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/appointments/:appointmentId', () => {
          return new HttpResponse('Internal Server Error', { status: 500 });
        })
      );

      await expect(service.getAppointment('apt_error')).rejects.toThrow('500');
    });
  });

  describe('cancelAppointment', () => {
    it('should cancel appointment successfully', async () => {
      server.use(
        http.post(
          'https://scheduling.test.api/api/v1/appointments/:appointmentId/cancel',
          ({ params }) => {
            return HttpResponse.json({
              id: params.appointmentId,
              slotId: 'slot_123',
              patientPhone: '+40721000001',
              procedureType: 'implant',
              scheduledAt: '2024-01-15T09:00:00Z',
              duration: 60,
              status: 'cancelled',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const result = await service.cancelAppointment({
        appointmentId: 'apt_123',
      });

      expect(result.status).toBe('cancelled');
    });

    it('should cancel with reason and notification preference', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.post(
          'https://scheduling.test.api/api/v1/appointments/:appointmentId/cancel',
          async ({ request }) => {
            receivedBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              id: 'apt_123',
              status: 'cancelled',
              scheduledAt: '2024-01-15T09:00:00Z',
              duration: 60,
              slotId: 'slot_123',
              patientPhone: '+40721000001',
              procedureType: 'implant',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      await service.cancelAppointment({
        appointmentId: 'apt_123',
        reason: 'Patient requested cancellation',
        notifyPatient: false,
      });

      expect(receivedBody?.reason).toBe('Patient requested cancellation');
      expect(receivedBody?.notify_patient).toBe(false);
    });

    it('should default notifyPatient to true', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.post(
          'https://scheduling.test.api/api/v1/appointments/:appointmentId/cancel',
          async ({ request }) => {
            receivedBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              id: 'apt_123',
              status: 'cancelled',
              scheduledAt: '2024-01-15T09:00:00Z',
              duration: 60,
              slotId: 'slot_123',
              patientPhone: '+40721000001',
              procedureType: 'implant',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      await service.cancelAppointment({
        appointmentId: 'apt_123',
      });

      expect(receivedBody?.notify_patient).toBe(true);
    });
  });

  describe('rescheduleAppointment', () => {
    it('should reschedule appointment successfully', async () => {
      server.use(
        http.post(
          'https://scheduling.test.api/api/v1/appointments/:appointmentId/reschedule',
          () => {
            return HttpResponse.json({
              id: 'apt_123',
              slotId: 'slot_new',
              patientPhone: '+40721000001',
              procedureType: 'implant',
              scheduledAt: '2024-01-16T14:00:00Z',
              duration: 60,
              status: 'confirmed',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      const result = await service.rescheduleAppointment({
        appointmentId: 'apt_123',
        newSlotId: 'slot_new',
      });

      expect(result.slotId).toBe('slot_new');
      expect(result.status).toBe('confirmed');
    });

    it('should reschedule with reason and notification', async () => {
      let receivedBody: Record<string, unknown> | null = null;
      server.use(
        http.post(
          'https://scheduling.test.api/api/v1/appointments/:appointmentId/reschedule',
          async ({ request }) => {
            receivedBody = (await request.json()) as Record<string, unknown>;
            return HttpResponse.json({
              id: 'apt_123',
              slotId: 'slot_new',
              status: 'confirmed',
              scheduledAt: '2024-01-16T14:00:00Z',
              duration: 60,
              patientPhone: '+40721000001',
              procedureType: 'implant',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        )
      );

      await service.rescheduleAppointment({
        appointmentId: 'apt_123',
        newSlotId: 'slot_new',
        reason: 'Doctor unavailable',
        notifyPatient: true,
      });

      expect(receivedBody?.new_slot_id).toBe('slot_new');
      expect(receivedBody?.reason).toBe('Doctor unavailable');
      expect(receivedBody?.notify_patient).toBe(true);
    });
  });

  describe('getPatientAppointments', () => {
    it('should get appointments by phone string', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/appointments', () => {
          return HttpResponse.json({
            appointments: [
              {
                id: 'apt_1',
                slotId: 'slot_1',
                patientPhone: '+40721000001',
                procedureType: 'implant',
                scheduledAt: '2024-01-15T09:00:00Z',
                duration: 60,
                status: 'confirmed',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        })
      );

      const appointments = await service.getPatientAppointments('+40721000001');

      expect(appointments).toHaveLength(1);
      expect(appointments[0]?.patientPhone).toBe('+40721000001');
    });

    it('should get appointments with options object', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get('https://scheduling.test.api/api/v1/appointments', ({ request }) => {
          receivedParams = new URL(request.url).searchParams;
          return HttpResponse.json({ appointments: [] });
        })
      );

      await service.getPatientAppointments({
        patientPhone: '+40721000001',
        hubspotContactId: 'hs_123',
        status: 'confirmed',
        limit: 5,
      });

      expect(receivedParams?.get('patient_phone')).toBe('+40721000001');
      expect(receivedParams?.get('hubspot_contact_id')).toBe('hs_123');
      expect(receivedParams?.get('status')).toBe('confirmed');
      expect(receivedParams?.get('limit')).toBe('5');
    });

    it('should use default limit for string query', async () => {
      let receivedParams: URLSearchParams | null = null;
      server.use(
        http.get('https://scheduling.test.api/api/v1/appointments', ({ request }) => {
          receivedParams = new URL(request.url).searchParams;
          return HttpResponse.json({ appointments: [] });
        })
      );

      await service.getPatientAppointments('+40721000001');

      expect(receivedParams?.get('limit')).toBe('10');
    });
  });

  describe('isSlotAvailable', () => {
    it('should return true for available slot', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots/:slotId', () => {
          return HttpResponse.json({
            id: 'slot_available',
            available: true,
            date: '2024-01-15',
            time: '09:00',
            dateTime: '2024-01-15T09:00:00Z',
            duration: 60,
          });
        })
      );

      const available = await service.isSlotAvailable('slot_available');
      expect(available).toBe(true);
    });

    it('should return false for unavailable slot', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots/:slotId', () => {
          return HttpResponse.json({
            id: 'slot_unavailable',
            available: false,
            date: '2024-01-15',
            time: '09:00',
            dateTime: '2024-01-15T09:00:00Z',
            duration: 60,
          });
        })
      );

      const available = await service.isSlotAvailable('slot_unavailable');
      expect(available).toBe(false);
    });

    it('should return false for non-existent slot', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots/:slotId', () => {
          return new HttpResponse('Not Found', { status: 404 });
        })
      );

      const available = await service.isSlotAvailable('non_existent');
      expect(available).toBe(false);
    });
  });

  describe('formatSlotForDisplay', () => {
    const mockSlot: TimeSlot = {
      id: 'slot_format',
      date: '2024-01-15',
      time: '09:00',
      dateTime: '2024-01-15T09:00:00Z',
      duration: 60,
      available: true,
      practitioner: { id: 'dr_1', name: 'Dr. Popescu' },
      location: { id: 'loc_1', name: 'Clinica Centrală' },
    };

    it('should format slot for Romanian', () => {
      const formatted = service.formatSlotForDisplay(mockSlot, 'ro');

      expect(formatted).toContain('09:00');
      expect(formatted).toContain('Dr. Popescu');
      expect(formatted).toContain('Clinica Centrală');
    });

    it('should format slot for English', () => {
      const formatted = service.formatSlotForDisplay(mockSlot, 'en');

      expect(formatted).toContain('09:00');
    });

    it('should format slot for German', () => {
      const formatted = service.formatSlotForDisplay(mockSlot, 'de');

      expect(formatted).toContain('09:00');
    });

    it('should default to Romanian', () => {
      const formatted = service.formatSlotForDisplay(mockSlot);

      expect(formatted).toContain('ora');
    });

    it('should handle slot without practitioner', () => {
      const slotNoPractitioner: TimeSlot = {
        ...mockSlot,
        practitioner: undefined,
      };

      const formatted = service.formatSlotForDisplay(slotNoPractitioner, 'ro');

      expect(formatted).not.toContain('cu');
    });

    it('should handle slot without location', () => {
      const slotNoLocation: TimeSlot = {
        ...mockSlot,
        location: undefined,
      };

      const formatted = service.formatSlotForDisplay(slotNoLocation, 'ro');

      expect(formatted).not.toContain(' - ');
    });
  });

  describe('formatSlotShort', () => {
    it('should format slot in short format', () => {
      const slot: TimeSlot = {
        id: 'slot_short',
        date: '2024-01-15',
        time: '09:00',
        dateTime: '2024-01-15T09:00:00Z',
        duration: 60,
        available: true,
      };

      const formatted = service.formatSlotShort(slot);

      expect(formatted).toMatch(/^\d{2}\.\d{2} \d{2}:\d{2}$/);
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots', () => {
          return new HttpResponse(null, { status: 429 });
        })
      );

      await expect(service.getAvailableSlots({ procedureType: 'implant' })).rejects.toThrow();
    });

    it('should retry on 502 errors', async () => {
      let callCount = 0;
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots', () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 502 });
          }
          return HttpResponse.json({ slots: [] });
        })
      );

      const slots = await service.getAvailableSlots({ procedureType: 'implant' });

      expect(slots).toEqual([]);
      expect(callCount).toBeGreaterThan(1);
    });

    it('should retry on 503 errors', async () => {
      let callCount = 0;
      server.use(
        http.get('https://scheduling.test.api/api/v1/slots', () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 503 });
          }
          return HttpResponse.json({ slots: [] });
        })
      );

      const slots = await service.getAvailableSlots({ procedureType: 'implant' });

      expect(slots).toEqual([]);
      expect(callCount).toBeGreaterThan(1);
    });

    it('should convert AbortError to ExternalServiceError on timeout (line 458)', async () => {
      // Create service with minimum valid timeout
      const timeoutService = new SchedulingService({
        apiUrl: 'https://scheduling.test.api',
        apiKey: 'test-key',
        timeoutMs: 1000, // Minimum valid timeout
        retryConfig: { maxRetries: 0, baseDelayMs: 100 }, // No retries
      });

      server.use(
        http.get('https://scheduling.test.api/api/v1/slots', async () => {
          // Delay longer than the timeout
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return HttpResponse.json({ slots: [] });
        })
      );

      await expect(timeoutService.getAvailableSlots({ procedureType: 'implant' })).rejects.toThrow(
        /timed out/i
      );
    });
  });

  describe('factory function', () => {
    it('should create service via factory function', () => {
      const factoryService = createSchedulingService(validConfig);
      expect(factoryService).toBeInstanceOf(SchedulingService);
    });
  });
});

// =============================================================================
// MockSchedulingService Tests
// =============================================================================

describe('MockSchedulingService', () => {
  let mockService: MockSchedulingService;

  beforeEach(() => {
    mockService = new MockSchedulingService();
  });

  describe('getAvailableSlots', () => {
    it('should return mock available slots', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'implant',
      });

      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((s) => s.available)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'implant',
        limit: 3,
      });

      expect(slots.length).toBeLessThanOrEqual(3);
    });

    it('should use preferred dates when provided', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0]!;

      const slots = await mockService.getAvailableSlots({
        procedureType: 'implant',
        preferredDates: [tomorrowStr],
      });

      expect(slots.length).toBeGreaterThan(0);
    });

    it('should include practitioner info', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'implant',
        limit: 1,
      });

      expect(slots[0]).toHaveProperty('practitioner');
    });

    it('should include location info', async () => {
      const slots = await mockService.getAvailableSlots({
        procedureType: 'implant',
        limit: 1,
      });

      expect(slots[0]).toHaveProperty('location');
    });

    it('should set duration based on procedure type', async () => {
      const implantSlots = await mockService.getAvailableSlots({
        procedureType: 'implant',
        limit: 1,
      });

      const cleaningSlots = await mockService.getAvailableSlots({
        procedureType: 'cleaning',
        limit: 1,
      });

      expect(implantSlots[0]?.duration).toBe(90);
      expect(cleaningSlots[0]?.duration).toBe(30);
    });
  });

  describe('bookAppointment', () => {
    it('should book mock appointment', async () => {
      const appointment = await mockService.bookAppointment({
        slotId: 'slot_mock',
        patientPhone: '+40721000001',
        procedureType: 'implant',
      });

      expect(appointment).toHaveProperty('id');
      expect(appointment).toHaveProperty('status', 'confirmed');
      expect(appointment).toHaveProperty('confirmationCode');
    });

    it('should include optional fields when provided', async () => {
      const appointment = await mockService.bookAppointment({
        slotId: 'slot_mock',
        patientPhone: '+40721000001',
        patientName: 'Ion Test',
        patientEmail: 'ion@test.com',
        procedureType: 'implant',
        notes: 'Test notes',
      });

      expect(appointment.patientName).toBe('Ion Test');
      expect(appointment.patientEmail).toBe('ion@test.com');
      expect(appointment.notes).toBe('Test notes');
    });
  });

  describe('getAppointment', () => {
    it('should return booked appointment', async () => {
      const booked = await mockService.bookAppointment({
        slotId: 'slot_get',
        patientPhone: '+40721000001',
        procedureType: 'implant',
      });

      const retrieved = await mockService.getAppointment(booked.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(booked.id);
    });

    it('should return null for non-existent appointment', async () => {
      const result = await mockService.getAppointment('non_existent');
      expect(result).toBeNull();
    });
  });

  describe('cancelAppointment', () => {
    it('should cancel appointment', async () => {
      const booked = await mockService.bookAppointment({
        slotId: 'slot_cancel',
        patientPhone: '+40721000001',
        procedureType: 'implant',
      });

      const cancelled = await mockService.cancelAppointment({
        appointmentId: booked.id,
      });

      expect(cancelled.status).toBe('cancelled');
    });

    it('should reject cancellation of non-existent appointment', async () => {
      await expect(
        mockService.cancelAppointment({ appointmentId: 'non_existent' })
      ).rejects.toThrow('404');
    });
  });

  describe('rescheduleAppointment', () => {
    it('should reschedule appointment', async () => {
      const booked = await mockService.bookAppointment({
        slotId: 'slot_original',
        patientPhone: '+40721000001',
        procedureType: 'implant',
      });

      const rescheduled = await mockService.rescheduleAppointment({
        appointmentId: booked.id,
        newSlotId: 'slot_new',
      });

      expect(rescheduled.slotId).toBe('slot_new');
      expect(rescheduled.status).toBe('confirmed');
    });

    it('should reject rescheduling of non-existent appointment', async () => {
      await expect(
        mockService.rescheduleAppointment({
          appointmentId: 'non_existent',
          newSlotId: 'slot_new',
        })
      ).rejects.toThrow('404');
    });
  });

  describe('getPatientAppointments', () => {
    it('should get appointments by phone string', async () => {
      await mockService.bookAppointment({
        slotId: 'slot_patient',
        patientPhone: '+40721999999',
        procedureType: 'implant',
      });

      const appointments = await mockService.getPatientAppointments('+40721999999');

      expect(appointments.length).toBeGreaterThan(0);
      expect(appointments[0]?.patientPhone).toBe('+40721999999');
    });

    it('should get appointments with options object', async () => {
      await mockService.bookAppointment({
        slotId: 'slot_options',
        patientPhone: '+40721888888',
        procedureType: 'implant',
      });

      const appointments = await mockService.getPatientAppointments({
        patientPhone: '+40721888888',
        status: 'confirmed',
        limit: 5,
      });

      expect(appointments.length).toBeGreaterThan(0);
    });

    it('should filter by status', async () => {
      const booked = await mockService.bookAppointment({
        slotId: 'slot_status',
        patientPhone: '+40721777777',
        procedureType: 'implant',
      });

      await mockService.cancelAppointment({ appointmentId: booked.id });

      const confirmedAppts = await mockService.getPatientAppointments({
        patientPhone: '+40721777777',
        status: 'confirmed',
      });

      const cancelledAppts = await mockService.getPatientAppointments({
        patientPhone: '+40721777777',
        status: 'cancelled',
      });

      expect(confirmedAppts).toHaveLength(0);
      expect(cancelledAppts).toHaveLength(1);
    });
  });

  describe('getSlot', () => {
    it('should return mock slot', async () => {
      const slot = await mockService.getSlot('slot_mock_123');

      expect(slot).not.toBeNull();
      expect(slot?.id).toBe('slot_mock_123');
      expect(slot?.available).toBe(true);
    });
  });

  describe('isSlotAvailable', () => {
    it('should return true for normal slots', async () => {
      const available = await mockService.isSlotAvailable('slot_normal');
      expect(available).toBe(true);
    });

    it('should return false for unavailable slots', async () => {
      const available = await mockService.isSlotAvailable('unavailable_slot_123');
      expect(available).toBe(false);
    });
  });

  describe('formatSlotForDisplay', () => {
    it('should format slot for Romanian', () => {
      const slot: TimeSlot = {
        id: 'slot_format',
        date: '2024-01-15',
        time: '09:00',
        dateTime: '2024-01-15T09:00:00Z',
        duration: 60,
        available: true,
        practitioner: { id: 'dr_1', name: 'Dr. Test' },
        location: { id: 'loc_1', name: 'Test Clinic' },
      };

      const formatted = mockService.formatSlotForDisplay(slot, 'ro');

      expect(formatted).toContain('09:00');
      expect(formatted).toContain('ora');
    });

    it('should format slot for English', () => {
      const slot: TimeSlot = {
        id: 'slot_en',
        date: '2024-01-15',
        time: '09:00',
        dateTime: '2024-01-15T09:00:00Z',
        duration: 60,
        available: true,
      };

      const formatted = mockService.formatSlotForDisplay(slot, 'en');

      expect(formatted).toContain('09:00');
    });
  });

  describe('formatSlotShort', () => {
    it('should format slot in short format', () => {
      const slot: TimeSlot = {
        id: 'slot_short',
        date: '2024-01-15',
        time: '14:30',
        dateTime: '2024-01-15T14:30:00Z',
        duration: 60,
        available: true,
      };

      const formatted = mockService.formatSlotShort(slot);

      expect(formatted).toMatch(/^\d{2}\.\d{2} \d{2}:\d{2}$/);
    });
  });

  describe('factory function', () => {
    it('should create mock service via factory function', () => {
      const factoryMockService = createMockSchedulingService();
      expect(factoryMockService).toBeInstanceOf(MockSchedulingService);
    });
  });
});
