import { z } from 'zod';
import crypto from 'crypto';
import { withRetry, ExternalServiceError, RateLimitError } from '@medicalcor/core';

/**
 * Input validation schemas for Scheduling service
 */
const PhoneSchema = z.string().min(10).max(20);
const EmailSchema = z.string().email().optional();

const BookAppointmentInputSchema = z.object({
  slotId: z.string().min(1),
  patientPhone: PhoneSchema,
  patientName: z.string().min(1).max(256).optional(),
  patientEmail: EmailSchema,
  procedureType: z.string().min(1).max(128),
  notes: z.string().max(2000).optional(),
  hubspotContactId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const GetAvailableSlotsOptionsSchema = z.object({
  procedureType: z.string().min(1).max(128),
  preferredDates: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  practitionerId: z.string().optional(),
  locationId: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const CancelAppointmentInputSchema = z.object({
  appointmentId: z.string().min(1),
  reason: z.string().max(1000).optional(),
  notifyPatient: z.boolean().optional(),
});

const RescheduleAppointmentInputSchema = z.object({
  appointmentId: z.string().min(1),
  newSlotId: z.string().min(1),
  reason: z.string().max(1000).optional(),
  notifyPatient: z.boolean().optional(),
});

const SchedulingServiceConfigSchema = z.object({
  apiUrl: z.string().url(),
  apiKey: z.string().min(1),
  clinicId: z.string().optional(),
  defaultTimezone: z.string().optional(),
  retryConfig: z
    .object({
      maxRetries: z.number().int().min(0).max(10),
      baseDelayMs: z.number().int().min(100).max(30000),
    })
    .optional(),
  /** Request timeout in milliseconds (default: 15000ms, max: 60000ms) */
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
});

/**
 * Scheduling Service Integration
 * Handles appointment slot availability and booking
 *
 * This integrates with an external scheduling service (e.g., Calendly, Cal.com, custom API)
 * or can use a mock implementation for development
 */

export interface SchedulingServiceConfig {
  apiUrl: string;
  apiKey: string;
  clinicId?: string | undefined;
  defaultTimezone?: string | undefined;
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
  /** Request timeout in milliseconds (default: 15000ms, max: 60000ms) */
  timeoutMs?: number | undefined;
}

export interface TimeSlot {
  id: string;
  date: string; // ISO date string YYYY-MM-DD
  time: string; // HH:mm format
  dateTime: string; // Full ISO datetime
  duration: number; // in minutes
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

export interface GetAvailableSlotsOptions {
  procedureType: string;
  preferredDates?: string[]; // ISO date strings
  startDate?: string;
  endDate?: string;
  practitionerId?: string;
  locationId?: string;
  limit?: number;
}

export interface BookAppointmentInput {
  slotId: string;
  patientPhone: string;
  patientName?: string;
  patientEmail?: string;
  procedureType: string;
  notes?: string;
  hubspotContactId?: string;
  metadata?: Record<string, unknown>;
}

export interface Appointment {
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

export interface CancelAppointmentInput {
  appointmentId: string;
  reason?: string;
  notifyPatient?: boolean;
}

export interface RescheduleAppointmentInput {
  appointmentId: string;
  newSlotId: string;
  reason?: string;
  notifyPatient?: boolean;
}

/** Default timeout for scheduling API requests (15 seconds) */
const DEFAULT_SCHEDULING_TIMEOUT_MS = 15000;

export class SchedulingService {
  private config: SchedulingServiceConfig;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: SchedulingServiceConfig) {
    // Validate config at construction time
    const validatedConfig = SchedulingServiceConfigSchema.parse(config);
    this.config = validatedConfig;
    this.baseUrl = validatedConfig.apiUrl;
    this.timeoutMs = validatedConfig.timeoutMs ?? DEFAULT_SCHEDULING_TIMEOUT_MS;
  }

  /**
   * Get available appointment slots
   */
  async getAvailableSlots(options: GetAvailableSlotsOptions): Promise<TimeSlot[]> {
    // Validate input
    const validated = GetAvailableSlotsOptionsSchema.parse(options);
    const {
      procedureType,
      preferredDates,
      startDate,
      endDate,
      practitionerId,
      locationId,
      limit = 5,
    } = validated;

    // Build query parameters
    const params = new URLSearchParams({
      procedure_type: procedureType,
      limit: limit.toString(),
    });

    if (preferredDates?.length) {
      params.set('preferred_dates', preferredDates.join(','));
    }
    if (startDate) {
      params.set('start_date', startDate);
    }
    if (endDate) {
      params.set('end_date', endDate);
    }
    if (practitionerId) {
      params.set('practitioner_id', practitionerId);
    }
    if (locationId) {
      params.set('location_id', locationId);
    }
    if (this.config.clinicId) {
      params.set('clinic_id', this.config.clinicId);
    }

    const response = await this.request<{ slots: TimeSlot[] }>(
      `/api/v1/slots?${params.toString()}`
    );

    return response.slots.filter((slot) => slot.available);
  }

  /**
   * Get slot by ID
   */
  async getSlot(slotId: string): Promise<TimeSlot | null> {
    try {
      return await this.request<TimeSlot>(`/api/v1/slots/${slotId}`);
    } catch (error) {
      if (error instanceof ExternalServiceError && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Book an appointment
   */
  async bookAppointment(input: BookAppointmentInput): Promise<Appointment> {
    // Validate input
    const validated = BookAppointmentInputSchema.parse(input);
    const {
      slotId,
      patientPhone,
      patientName,
      patientEmail,
      procedureType,
      notes,
      hubspotContactId,
      metadata,
    } = validated;

    return this.request<Appointment>('/api/v1/appointments', {
      method: 'POST',
      body: JSON.stringify({
        slot_id: slotId,
        patient: {
          phone: patientPhone,
          name: patientName,
          email: patientEmail,
        },
        procedure_type: procedureType,
        notes,
        external_refs: {
          hubspot_contact_id: hubspotContactId,
        },
        metadata,
        clinic_id: this.config.clinicId,
      }),
    });
  }

  /**
   * Get appointment by ID
   */
  async getAppointment(appointmentId: string): Promise<Appointment | null> {
    try {
      return await this.request<Appointment>(`/api/v1/appointments/${appointmentId}`);
    } catch (error) {
      if (error instanceof ExternalServiceError && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(input: CancelAppointmentInput): Promise<Appointment> {
    // Validate input
    const validated = CancelAppointmentInputSchema.parse(input);
    const { appointmentId, reason, notifyPatient = true } = validated;

    return this.request<Appointment>(`/api/v1/appointments/${appointmentId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        reason,
        notify_patient: notifyPatient,
      }),
    });
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(input: RescheduleAppointmentInput): Promise<Appointment> {
    // Validate input
    const validated = RescheduleAppointmentInputSchema.parse(input);
    const { appointmentId, newSlotId, reason, notifyPatient = true } = validated;

    return this.request<Appointment>(`/api/v1/appointments/${appointmentId}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({
        new_slot_id: newSlotId,
        reason,
        notify_patient: notifyPatient,
      }),
    });
  }

  /**
   * Get appointments for a patient
   * Accepts either a phone string or an options object for flexibility
   */
  async getPatientAppointments(
    query:
      | string
      | {
          patientPhone: string;
          hubspotContactId?: string;
          status?: Appointment['status'];
          limit?: number;
        }
  ): Promise<Appointment[]> {
    // Handle both call signatures for flexibility
    const patientPhone = typeof query === 'string' ? query : query.patientPhone;
    const hubspotContactId = typeof query === 'string' ? undefined : query.hubspotContactId;
    const status = typeof query === 'string' ? undefined : query.status;
    const limit = typeof query === 'string' ? 10 : (query.limit ?? 10);

    const params = new URLSearchParams({
      patient_phone: patientPhone,
      limit: limit.toString(),
    });

    if (hubspotContactId) {
      params.set('hubspot_contact_id', hubspotContactId);
    }
    if (status) {
      params.set('status', status);
    }

    const response = await this.request<{ appointments: Appointment[] }>(
      `/api/v1/appointments?${params.toString()}`
    );

    return response.appointments;
  }

  /**
   * Check if a specific slot is still available
   */
  async isSlotAvailable(slotId: string): Promise<boolean> {
    const slot = await this.getSlot(slotId);
    return slot?.available ?? false;
  }

  /**
   * Format slot for display
   */
  formatSlotForDisplay(slot: TimeSlot, language: 'ro' | 'en' | 'de' = 'ro'): string {
    const date = new Date(slot.dateTime);

    const dateFormatters: Record<string, Intl.DateTimeFormat> = {
      ro: new Intl.DateTimeFormat('ro-RO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      en: new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      de: new Intl.DateTimeFormat('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    };

    const formattedDate = dateFormatters[language]?.format(date) ?? date.toLocaleDateString();
    const formattedTime = slot.time;

    const locationStr = slot.location ? ` - ${slot.location.name}` : '';
    const practitionerStr = slot.practitioner ? ` cu ${slot.practitioner.name}` : '';

    return `${formattedDate} ora ${formattedTime}${practitionerStr}${locationStr}`;
  }

  /**
   * Generate a short slot description for buttons
   */
  formatSlotShort(slot: TimeSlot): string {
    const date = new Date(slot.dateTime);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}.${month} ${slot.time}`;
  }

  /**
   * Make HTTP request to scheduling API with timeout support
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const makeRequest = async () => {
      const existingHeaders =
        options.headers instanceof Headers
          ? Object.fromEntries(options.headers.entries())
          : (options.headers as Record<string, string> | undefined);

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            ...existingHeaders,
          },
        });

        if (response.status === 429) {
          throw new RateLimitError(60);
        }

        if (!response.ok) {
          // Error logged via structured error - PII not exposed
          throw new ExternalServiceError(
            'SchedulingService',
            `Request failed with status ${response.status}`
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        // Convert AbortError to a more descriptive timeout error
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError(
            'SchedulingService',
            `Request timed out after ${this.timeoutMs}ms`
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof RateLimitError) return true;
        if (error instanceof ExternalServiceError) {
          const message = error.message.toLowerCase();
          if (message.includes('502')) return true;
          if (message.includes('503')) return true;
          // Retry on timeout errors
          if (message.includes('timeout')) return true;
          if (message.includes('timed out')) return true;
        }
        // Retry on network errors
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (message.includes('econnreset')) return true;
          if (message.includes('socket hang up')) return true;
          if (message.includes('network')) return true;
        }
        return false;
      },
    });
  }
}

/**
 * Create a configured scheduling service
 */
export function createSchedulingService(config: SchedulingServiceConfig): SchedulingService {
  return new SchedulingService(config);
}

/**
 * Mock Scheduling Service for development/testing
 * Generates realistic mock slots without external API dependency
 */
export class MockSchedulingService {
  private appointments = new Map<string, Appointment>();
  private slotCounter = 0;

  /**
   * Generate mock available slots
   */
  getAvailableSlots(options: GetAvailableSlotsOptions): Promise<TimeSlot[]> {
    const { procedureType, preferredDates, limit = 5 } = options;

    const slots: TimeSlot[] = [];
    const startDate = preferredDates?.[0]
      ? new Date(preferredDates[0])
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow

    // Generate slots for the next 7 days, 3-4 slots per day
    const workingHours = ['09:00', '10:30', '14:00', '15:30', '17:00'];
    // SECURITY: Demo/placeholder data - no real PII
    const locations = [
      { id: 'loc_1', name: 'Demo Clinic Central', address: 'Example Street 1, Demo City' },
      { id: 'loc_2', name: 'Demo Clinic North', address: 'Example Avenue 2, Demo City' },
    ];
    const practitioners = [
      { id: 'dr_1', name: 'Dr. Demo General', specialty: 'Stomatologie Generală' },
      { id: 'dr_2', name: 'Dr. Demo Ortho', specialty: 'Ortodonție' },
      { id: 'dr_3', name: 'Dr. Demo Implant', specialty: 'Implantologie' },
    ];

    for (let dayOffset = 1; dayOffset <= 7 && slots.length < limit; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);

      // Skip weekends
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) continue;

      // SECURITY: Use crypto-secure randomness for shuffling
      // Pick 2-3 random time slots for this day
      const shuffledHours = [...workingHours];
      for (let i = shuffledHours.length - 1; i > 0; i--) {
        const randomBytes = new Uint32Array(1);
        crypto.getRandomValues(randomBytes);
        const j = randomBytes[0]! % (i + 1);
        [shuffledHours[i], shuffledHours[j]] = [shuffledHours[j]!, shuffledHours[i]!];
      }
      const countBytes = new Uint32Array(1);
      crypto.getRandomValues(countBytes);
      const slotCount = (countBytes[0]! % 2) + 2; // 2-3 slots
      const availableTimesForDay = shuffledHours.slice(0, slotCount);

      for (const time of availableTimesForDay) {
        if (slots.length >= limit) break;

        const dateStr = currentDate.toISOString().split('T')[0];
        const [hours, minutes] = time.split(':');
        const dateTime = new Date(currentDate);
        dateTime.setHours(parseInt(hours ?? '9', 10), parseInt(minutes ?? '0', 10), 0, 0);

        // Random duration based on procedure type
        const duration = procedureType.includes('implant')
          ? 90
          : procedureType.includes('cleaning')
            ? 30
            : 60;

        this.slotCounter++;
        // SECURITY: Use crypto-secure randomness for selection
        const practitionerBytes = new Uint32Array(1);
        crypto.getRandomValues(practitionerBytes);
        const selectedPractitioner = practitioners[practitionerBytes[0]! % practitioners.length];
        const locationBytes = new Uint32Array(1);
        crypto.getRandomValues(locationBytes);
        const selectedLocation = locations[locationBytes[0]! % locations.length];

        const slot: TimeSlot = {
          id: `slot_${this.slotCounter}_${Date.now()}`,
          date: dateStr ?? '',
          time,
          dateTime: dateTime.toISOString(),
          duration,
          available: true,
        };

        if (selectedPractitioner) {
          slot.practitioner = selectedPractitioner;
        }
        if (selectedLocation) {
          slot.location = selectedLocation;
        }

        slots.push(slot);
      }
    }

    return Promise.resolve(slots.slice(0, limit));
  }

  /**
   * Mock book appointment
   */
  bookAppointment(input: BookAppointmentInput): Promise<Appointment> {
    // SECURITY: Use crypto-secure randomness for appointment ID and confirmation code
    const appointmentId = `apt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const confirmationCode = crypto.randomUUID().slice(0, 6).toUpperCase();

    const appointment: Appointment = {
      id: appointmentId,
      slotId: input.slotId,
      patientPhone: input.patientPhone,
      procedureType: input.procedureType,
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Mock: 2 days from now
      duration: 60,
      status: 'confirmed',
      practitioner: {
        id: 'dr_1',
        name: 'Dr. Maria Popescu',
      },
      location: {
        id: 'loc_1',
        name: 'Clinica Centrală',
        address: 'Str. Victoriei 15, București',
      },
      confirmationCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Set optional properties only if they have values
    if (input.patientName) {
      appointment.patientName = input.patientName;
    }
    if (input.patientEmail) {
      appointment.patientEmail = input.patientEmail;
    }
    if (input.notes) {
      appointment.notes = input.notes;
    }

    this.appointments.set(appointmentId, appointment);
    return Promise.resolve(appointment);
  }

  /**
   * Mock get appointment
   */
  getAppointment(appointmentId: string): Promise<Appointment | null> {
    return Promise.resolve(this.appointments.get(appointmentId) ?? null);
  }

  /**
   * Mock cancel appointment
   */
  cancelAppointment(input: CancelAppointmentInput): Promise<Appointment> {
    const appointment = this.appointments.get(input.appointmentId);
    if (!appointment) {
      return Promise.reject(
        new ExternalServiceError('MockSchedulingService', '404: Appointment not found')
      );
    }

    appointment.status = 'cancelled';
    appointment.updatedAt = new Date().toISOString();
    return Promise.resolve(appointment);
  }

  /**
   * Mock reschedule appointment
   */
  rescheduleAppointment(input: RescheduleAppointmentInput): Promise<Appointment> {
    const appointment = this.appointments.get(input.appointmentId);
    if (!appointment) {
      return Promise.reject(
        new ExternalServiceError('MockSchedulingService', '404: Appointment not found')
      );
    }

    // Update with new slot info (mock: 3 days from now)
    appointment.slotId = input.newSlotId;
    appointment.scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    appointment.status = 'confirmed';
    appointment.updatedAt = new Date().toISOString();
    return Promise.resolve(appointment);
  }

  /**
   * Mock get patient appointments
   */
  getPatientAppointments(
    query:
      | string
      | {
          patientPhone: string;
          hubspotContactId?: string;
          status?: Appointment['status'];
          limit?: number;
        }
  ): Promise<Appointment[]> {
    // Handle both call signatures for compatibility
    const patientPhone = typeof query === 'string' ? query : query.patientPhone;
    const status = typeof query === 'string' ? undefined : query.status;
    const limit = typeof query === 'string' ? 10 : (query.limit ?? 10);

    const results: Appointment[] = [];
    for (const appointment of this.appointments.values()) {
      if (appointment.patientPhone === patientPhone) {
        if (!status || appointment.status === status) {
          results.push(appointment);
        }
      }
    }
    return Promise.resolve(results.slice(0, limit));
  }

  /**
   * Mock get slot by ID
   */
  getSlot(slotId: string): Promise<TimeSlot | null> {
    // Generate a mock slot based on ID
    const mockSlot: TimeSlot = {
      id: slotId,
      date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '',
      time: '10:00',
      dateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 60,
      available: true,
      practitioner: {
        id: 'dr_1',
        name: 'Dr. Demo General',
        specialty: 'Stomatologie Generală',
      },
      location: {
        id: 'loc_1',
        name: 'Demo Clinic Central',
        address: 'Example Street 1, Demo City',
      },
    };
    return Promise.resolve(mockSlot);
  }

  /**
   * Mock check slot availability
   */
  isSlotAvailable(slotId: string): Promise<boolean> {
    // In mock, slots starting with 'unavailable' are not available
    return Promise.resolve(!slotId.startsWith('unavailable'));
  }

  /**
   * Format slot for display (same as real service)
   */
  formatSlotForDisplay(slot: TimeSlot, language: 'ro' | 'en' | 'de' = 'ro'): string {
    const date = new Date(slot.dateTime);

    const dateFormatters: Record<string, Intl.DateTimeFormat> = {
      ro: new Intl.DateTimeFormat('ro-RO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      en: new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      de: new Intl.DateTimeFormat('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    };

    const formattedDate = dateFormatters[language]?.format(date) ?? date.toLocaleDateString();
    const formattedTime = slot.time;

    const locationStr = slot.location ? ` - ${slot.location.name}` : '';
    const practitionerStr = slot.practitioner ? ` cu ${slot.practitioner.name}` : '';

    return `${formattedDate} ora ${formattedTime}${practitionerStr}${locationStr}`;
  }

  /**
   * Generate a short slot description for buttons
   */
  formatSlotShort(slot: TimeSlot): string {
    const date = new Date(slot.dateTime);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}.${month} ${slot.time}`;
  }
}

/**
 * Create mock scheduling service for development
 */
export function createMockSchedulingService(): MockSchedulingService {
  return new MockSchedulingService();
}
