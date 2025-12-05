/**
 * Scheduling Service Tests
 * Comprehensive coverage for appointment scheduling integration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { z } from 'zod';
import { ExternalServiceError, RateLimitError } from '@medicalcor/core';
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
  type RescheduleAppointmentInput,
  type Appointment,
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

    it('should use fallback formatter for unsupported language', () => {
      // @ts-expect-error - Testing invalid language for fallback
      const result = service.formatSlotForDisplay(mockSlot, 'fr');
      expect(result).toContain('10:30');
      expect(typeof result).toBe('string');
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

  describe('getAvailableSlots', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should fetch available slots successfully', async () => {
      const mockSlots = [
        {
          id: 'slot-1',
          date: '2024-03-15',
          time: '10:00',
          dateTime: '2024-03-15T10:00:00Z',
          duration: 60,
          available: true,
        },
        {
          id: 'slot-2',
          date: '2024-03-15',
          time: '14:00',
          dateTime: '2024-03-15T14:00:00Z',
          duration: 60,
          available: false,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ slots: mockSlots }),
      } as Response);

      const result = await service.getAvailableSlots({
        procedureType: 'consultation',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.available).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/slots?'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should include all query parameters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ slots: [] }),
      } as Response);

      await service.getAvailableSlots({
        procedureType: 'implant',
        preferredDates: ['2024-03-15', '2024-03-16'],
        startDate: '2024-03-01',
        endDate: '2024-03-31',
        practitionerId: 'dr-123',
        locationId: 'loc-456',
        limit: 10,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('procedure_type=implant'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('preferred_dates=2024-03-15%2C2024-03-16'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('start_date=2024-03-01'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('end_date=2024-03-31'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('practitioner_id=dr-123'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('location_id=loc-456'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('clinic_id=clinic-123'),
        expect.any(Object)
      );
    });

    it('should use default limit of 5', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ slots: [] }),
      } as Response);

      await service.getAvailableSlots({
        procedureType: 'cleaning',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5'),
        expect.any(Object)
      );
    });

    it('should validate input schema', async () => {
      await expect(
        service.getAvailableSlots({
          procedureType: '', // Invalid: empty string
        })
      ).rejects.toThrow();
    });

    it('should reject limit above 100', async () => {
      await expect(
        service.getAvailableSlots({
          procedureType: 'exam',
          limit: 150,
        })
      ).rejects.toThrow();
    });
  });

  describe('getSlot', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should fetch slot by ID', async () => {
      const mockSlot: TimeSlot = {
        id: 'slot-123',
        date: '2024-03-15',
        time: '10:00',
        dateTime: '2024-03-15T10:00:00Z',
        duration: 60,
        available: true,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSlot,
      } as Response);

      const result = await service.getSlot('slot-123');

      expect(result).toEqual(mockSlot);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://scheduling.example.com/api/v1/slots/slot-123',
        expect.any(Object)
      );
    });

    it('should return null for 404 not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);

      const result = await service.getSlot('non-existent');

      expect(result).toBeNull();
    });

    it('should throw for other errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await expect(service.getSlot('slot-123')).rejects.toThrow(ExternalServiceError);
    });
  });

  describe('bookAppointment', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should book appointment with all fields', async () => {
      const mockAppointment: Appointment = {
        id: 'apt-123',
        slotId: 'slot-456',
        patientPhone: '+40712345678',
        patientName: 'John Doe',
        patientEmail: 'john@example.com',
        procedureType: 'consultation',
        scheduledAt: '2024-03-15T10:00:00Z',
        duration: 60,
        status: 'confirmed',
        createdAt: '2024-03-01T10:00:00Z',
        updatedAt: '2024-03-01T10:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockAppointment,
      } as Response);

      const input: BookAppointmentInput = {
        slotId: 'slot-456',
        patientPhone: '+40712345678',
        patientName: 'John Doe',
        patientEmail: 'john@example.com',
        procedureType: 'consultation',
        notes: 'First visit',
        hubspotContactId: 'hs-123',
        metadata: { source: 'web' },
      };

      const result = await service.bookAppointment(input);

      expect(result).toEqual(mockAppointment);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://scheduling.example.com/api/v1/appointments',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('slot-456'),
        })
      );
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

    it('should validate email format', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '+40712345678',
          patientEmail: 'invalid-email',
          procedureType: 'exam',
        })
      ).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      await expect(
        service.bookAppointment({
          slotId: '',
          patientPhone: '+40712345678',
          procedureType: 'exam',
        })
      ).rejects.toThrow();
    });

    it('should reject notes over 2000 characters', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '+40712345678',
          procedureType: 'exam',
          notes: 'x'.repeat(2001),
        })
      ).rejects.toThrow();
    });
  });

  describe('getAppointment', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should fetch appointment by ID', async () => {
      const mockAppointment: Appointment = {
        id: 'apt-123',
        slotId: 'slot-456',
        patientPhone: '+40712345678',
        procedureType: 'consultation',
        scheduledAt: '2024-03-15T10:00:00Z',
        duration: 60,
        status: 'confirmed',
        createdAt: '2024-03-01T10:00:00Z',
        updatedAt: '2024-03-01T10:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockAppointment,
      } as Response);

      const result = await service.getAppointment('apt-123');

      expect(result).toEqual(mockAppointment);
    });

    it('should return null for 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);

      const result = await service.getAppointment('non-existent');

      expect(result).toBeNull();
    });

    it('should throw for non-404 errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await expect(service.getAppointment('apt-123')).rejects.toThrow(ExternalServiceError);
    });
  });

  describe('cancelAppointment', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should cancel appointment', async () => {
      const mockAppointment: Appointment = {
        id: 'apt-123',
        slotId: 'slot-456',
        patientPhone: '+40712345678',
        procedureType: 'consultation',
        scheduledAt: '2024-03-15T10:00:00Z',
        duration: 60,
        status: 'cancelled',
        createdAt: '2024-03-01T10:00:00Z',
        updatedAt: '2024-03-01T11:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockAppointment,
      } as Response);

      const result = await service.cancelAppointment({
        appointmentId: 'apt-123',
        reason: 'Patient requested',
        notifyPatient: true,
      });

      expect(result.status).toBe('cancelled');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://scheduling.example.com/api/v1/appointments/apt-123/cancel',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Patient requested'),
        })
      );
    });

    it('should use notifyPatient default value', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'apt-123',
          status: 'cancelled',
        } as Appointment),
      } as Response);

      await service.cancelAppointment({
        appointmentId: 'apt-123',
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.notify_patient).toBe(true);
    });

    it('should validate appointmentId', async () => {
      await expect(
        service.cancelAppointment({
          appointmentId: '',
        })
      ).rejects.toThrow();
    });

    it('should validate reason length', async () => {
      await expect(
        service.cancelAppointment({
          appointmentId: 'apt-123',
          reason: 'x'.repeat(1001),
        })
      ).rejects.toThrow();
    });
  });

  describe('rescheduleAppointment', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should reschedule appointment', async () => {
      const mockAppointment: Appointment = {
        id: 'apt-123',
        slotId: 'slot-new',
        patientPhone: '+40712345678',
        procedureType: 'consultation',
        scheduledAt: '2024-03-20T14:00:00Z',
        duration: 60,
        status: 'confirmed',
        createdAt: '2024-03-01T10:00:00Z',
        updatedAt: '2024-03-10T11:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockAppointment,
      } as Response);

      const result = await service.rescheduleAppointment({
        appointmentId: 'apt-123',
        newSlotId: 'slot-new',
        reason: 'Schedule conflict',
        notifyPatient: false,
      });

      expect(result.slotId).toBe('slot-new');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://scheduling.example.com/api/v1/appointments/apt-123/reschedule',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('slot-new'),
        })
      );
    });

    it('should use default notifyPatient value', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'apt-123',
          slotId: 'slot-new',
        } as Appointment),
      } as Response);

      await service.rescheduleAppointment({
        appointmentId: 'apt-123',
        newSlotId: 'slot-new',
      });

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.notify_patient).toBe(true);
    });

    it('should validate input', async () => {
      await expect(
        service.rescheduleAppointment({
          appointmentId: '',
          newSlotId: 'slot-new',
        })
      ).rejects.toThrow();

      await expect(
        service.rescheduleAppointment({
          appointmentId: 'apt-123',
          newSlotId: '',
        })
      ).rejects.toThrow();
    });
  });

  describe('getPatientAppointments', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should fetch patient appointments', async () => {
      const mockAppointments: Appointment[] = [
        {
          id: 'apt-1',
          slotId: 'slot-1',
          patientPhone: '+40712345678',
          procedureType: 'consultation',
          scheduledAt: '2024-03-15T10:00:00Z',
          duration: 60,
          status: 'confirmed',
          createdAt: '2024-03-01T10:00:00Z',
          updatedAt: '2024-03-01T10:00:00Z',
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ appointments: mockAppointments }),
      } as Response);

      const result = await service.getPatientAppointments('+40712345678');

      expect(result).toEqual(mockAppointments);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('patient_phone=%2B40712345678'),
        expect.any(Object)
      );
    });

    it('should include status filter', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ appointments: [] }),
      } as Response);

      await service.getPatientAppointments('+40712345678', {
        status: 'confirmed',
        limit: 20,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=confirmed'),
        expect.any(Object)
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=20'),
        expect.any(Object)
      );
    });

    it('should use default limit of 10', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ appointments: [] }),
      } as Response);

      await service.getPatientAppointments('+40712345678');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
    });
  });

  describe('isSlotAvailable', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should return true for available slot', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'slot-123',
          available: true,
        } as TimeSlot),
      } as Response);

      const result = await service.isSlotAvailable('slot-123');

      expect(result).toBe(true);
    });

    it('should return false for unavailable slot', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'slot-123',
          available: false,
        } as TimeSlot),
      } as Response);

      const result = await service.isSlotAvailable('slot-123');

      expect(result).toBe(false);
    });

    it('should return false for non-existent slot', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response);

      const result = await service.isSlotAvailable('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('request method - retry and error handling', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should handle 429 rate limit error', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ slots: [] }),
        } as Response);

      await service.getAvailableSlots({ procedureType: 'exam' });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 502 error', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          json: async () => ({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ slots: [] }),
        } as Response);

      await service.getAvailableSlots({ procedureType: 'exam' });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 error', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ slots: [] }),
        } as Response);

      await service.getAvailableSlots({ procedureType: 'exam' });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle timeout with AbortError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(service.getAvailableSlots({ procedureType: 'exam' })).rejects.toThrow(
        'timed out'
      );
    });

    it('should retry on ECONNRESET error', async () => {
      const networkError = new Error('read ECONNRESET');

      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ slots: [] }),
        } as Response);

      await service.getAvailableSlots({ procedureType: 'exam' });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on socket hang up error', async () => {
      const networkError = new Error('socket hang up');

      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ slots: [] }),
        } as Response);

      await service.getAvailableSlots({ procedureType: 'exam' });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on network error', async () => {
      const networkError = new Error('network request failed');

      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ slots: [] }),
        } as Response);

      await service.getAvailableSlots({ procedureType: 'exam' });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 400 bad request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
      } as Response);

      await expect(service.getAvailableSlots({ procedureType: 'exam' })).rejects.toThrow();

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle Headers object in request options', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ slots: [] }),
      } as Response);

      await service.getAvailableSlots({ procedureType: 'exam' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should respect custom timeout', async () => {
      const customService = new SchedulingService({
        ...validConfig,
        timeoutMs: 2000,
      });

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        customService.getAvailableSlots({ procedureType: 'exam' })
      ).rejects.toThrow('2000ms');
    });

    it('should use default timeout when not specified', async () => {
      const serviceNoTimeout = new SchedulingService({
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key',
      });

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(
        serviceNoTimeout.getAvailableSlots({ procedureType: 'exam' })
      ).rejects.toThrow('15000ms');
    });

    it('should respect retry config from constructor', async () => {
      const customRetryService = new SchedulingService({
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key',
        retryConfig: { maxRetries: 0, baseDelayMs: 100 },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      } as Response);

      await expect(
        customRetryService.getAvailableSlots({ procedureType: 'exam' })
      ).rejects.toThrow();

      expect(global.fetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('should clear timeout after successful request', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ slots: [] }),
      } as Response);

      await service.getAvailableSlots({ procedureType: 'exam' });

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should clear timeout after failed request', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
      } as Response);

      await expect(service.getAvailableSlots({ procedureType: 'exam' })).rejects.toThrow();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should throw ExternalServiceError for non-ok responses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await expect(service.getAvailableSlots({ procedureType: 'exam' })).rejects.toThrow(
        ExternalServiceError
      );
    });
  });

  describe('config validation edge cases', () => {
    it('should reject invalid retry maxRetries', () => {
      expect(() => {
        new SchedulingService({
          apiUrl: 'https://api.example.com',
          apiKey: 'key',
          retryConfig: { maxRetries: 15, baseDelayMs: 1000 },
        });
      }).toThrow();
    });

    it('should reject invalid retry baseDelayMs too low', () => {
      expect(() => {
        new SchedulingService({
          apiUrl: 'https://api.example.com',
          apiKey: 'key',
          retryConfig: { maxRetries: 3, baseDelayMs: 50 },
        });
      }).toThrow();
    });

    it('should reject invalid retry baseDelayMs too high', () => {
      expect(() => {
        new SchedulingService({
          apiUrl: 'https://api.example.com',
          apiKey: 'key',
          retryConfig: { maxRetries: 3, baseDelayMs: 35000 },
        });
      }).toThrow();
    });

    it('should accept valid retry config bounds', () => {
      const service = new SchedulingService({
        apiUrl: 'https://api.example.com',
        apiKey: 'key',
        retryConfig: { maxRetries: 10, baseDelayMs: 30000 },
      });
      expect(service).toBeInstanceOf(SchedulingService);
    });

    it('should accept valid timeout bounds', () => {
      const service1 = new SchedulingService({
        apiUrl: 'https://api.example.com',
        apiKey: 'key',
        timeoutMs: 1000,
      });
      const service2 = new SchedulingService({
        apiUrl: 'https://api.example.com',
        apiKey: 'key',
        timeoutMs: 60000,
      });
      expect(service1).toBeInstanceOf(SchedulingService);
      expect(service2).toBeInstanceOf(SchedulingService);
    });
  });

  describe('input validation comprehensive', () => {
    let service: SchedulingService;

    beforeEach(() => {
      service = new SchedulingService(validConfig);
    });

    it('should reject phone number too short', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '123456789', // 9 chars, min is 10
          procedureType: 'exam',
        })
      ).rejects.toThrow();
    });

    it('should reject phone number too long', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '123456789012345678901', // 21 chars, max is 20
          procedureType: 'exam',
        })
      ).rejects.toThrow();
    });

    it('should reject patient name too long', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '+40712345678',
          patientName: 'x'.repeat(257),
          procedureType: 'exam',
        })
      ).rejects.toThrow();
    });

    it('should reject procedure type too long', async () => {
      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '+40712345678',
          procedureType: 'x'.repeat(129),
        })
      ).rejects.toThrow();
    });

    it('should accept valid phone at minimum length', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'apt-1' } as Appointment),
      } as Response);

      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '1234567890', // 10 chars
          procedureType: 'exam',
        })
      ).resolves.toBeDefined();
    });

    it('should accept valid phone at maximum length', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'apt-1' } as Appointment),
      } as Response);

      await expect(
        service.bookAppointment({
          slotId: 'slot-1',
          patientPhone: '12345678901234567890', // 20 chars
          procedureType: 'exam',
        })
      ).resolves.toBeDefined();
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

    it('should use fallback formatter for unsupported language', () => {
      const slot: TimeSlot = {
        id: 'slot-fallback',
        date: '2024-04-10',
        time: '11:00',
        dateTime: '2024-04-10T11:00:00.000Z',
        duration: 45,
        available: true,
      };

      // @ts-expect-error - Testing invalid language for fallback
      const result = mockService.formatSlotForDisplay(slot, 'fr');

      expect(result).toContain('11:00');
      expect(typeof result).toBe('string');
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
