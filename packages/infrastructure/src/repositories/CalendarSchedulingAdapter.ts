/**
 * @fileoverview Calendar Scheduling Repository Adapter (Infrastructure Layer)
 *
 * This adapter implements the ISchedulingRepository port from the domain layer,
 * connecting to external calendar systems (Calendly, Cal.com, custom APIs) via
 * the SchedulingService from the integrations layer.
 *
 * @module @medicalcor/infrastructure/repositories
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** - it implements the port (ISchedulingRepository) defined in the domain.
 * The domain layer depends only on the interface, not this implementation.
 *
 * Architecture flow:
 * ```
 * Domain Port (ISchedulingRepository)
 *        ↓ implements
 * Infrastructure Adapter (CalendarSchedulingAdapter)
 *        ↓ uses
 * Integration Layer (SchedulingService → External Calendar API)
 * ```
 *
 * @example
 * ```typescript
 * import { CalendarSchedulingAdapter } from '@medicalcor/infrastructure';
 * import { SchedulingService } from '@medicalcor/integrations';
 *
 * const calendarService = new SchedulingService({
 *   apiUrl: process.env.CALENDAR_API_URL,
 *   apiKey: process.env.CALENDAR_API_KEY,
 * });
 *
 * const adapter = new CalendarSchedulingAdapter({
 *   calendarService,
 *   consentService: myConsentService,
 *   defaultTimezone: 'Europe/Bucharest',
 * });
 *
 * const slots = await adapter.getAvailableSlots({ limit: 10 });
 * ```
 */

import { z } from 'zod';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'calendar-scheduling-adapter' });

// ============================================================================
// DOMAIN TYPES (inline to avoid importing from domain module with broken routing)
// These mirror the types from @medicalcor/domain/scheduling
// ============================================================================

/**
 * Error thrown when patient has not provided required consent
 */
export class ConsentRequiredError extends Error {
  public readonly code = 'CONSENT_REQUIRED';
  public readonly contactId: string;
  public readonly missingConsents: string[];

  constructor(contactId: string, missingConsents: string[]) {
    super(
      `Patient consent required before scheduling. Missing consents: ${missingConsents.join(', ')}`
    );
    this.name = 'ConsentRequiredError';
    this.contactId = contactId;
    this.missingConsents = missingConsents;
  }
}

/**
 * Represents an available time slot for appointments (Domain format)
 */
export interface DomainTimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  available: boolean;
  practitioner?: string;
  procedureTypes: string[];
}

/**
 * Request to book an appointment
 */
export interface BookingRequest {
  hubspotContactId: string;
  phone: string;
  patientName?: string;
  slotId: string;
  procedureType: string;
  notes?: string;
}

/**
 * Result of a successful booking
 */
export interface BookingResult {
  id: string;
  status: string;
}

/**
 * Appointment details returned from queries
 */
export interface AppointmentDetails {
  id: string;
  slot: {
    date: string;
    startTime: string;
    duration: number;
  };
  patientName?: string;
  procedureType: string;
  hubspotContactId: string;
  phone: string;
  createdAt: string;
}

/**
 * Options for fetching available slots
 */
export interface DomainGetAvailableSlotsOptions {
  procedureType?: string;
  preferredDates?: string[];
  limit?: number;
}

/**
 * Scheduling Repository Port Interface
 */
export interface ISchedulingRepository {
  getAvailableSlots(options: string | DomainGetAvailableSlotsOptions): Promise<DomainTimeSlot[]>;
  bookAppointment(request: BookingRequest): Promise<BookingResult>;
  getUpcomingAppointments(startDate: Date, endDate: Date): Promise<AppointmentDetails[]>;
}

// ============================================================================
// INTEGRATION TYPES (inline to avoid importing from integrations module)
// These mirror the types from @medicalcor/integrations
// ============================================================================

/**
 * Integration layer TimeSlot format
 */
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

/**
 * Integration layer Appointment format
 */
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

/**
 * Integration layer scheduling service interface
 */
interface SchedulingServiceInterface {
  getAvailableSlots(options: {
    procedureType: string;
    preferredDates?: string[];
    limit?: number;
  }): Promise<IntegrationTimeSlot[]>;
  bookAppointment(input: {
    slotId: string;
    patientPhone: string;
    patientName?: string;
    procedureType: string;
    notes?: string;
    hubspotContactId?: string;
  }): Promise<Appointment>;
  cancelAppointment(input: {
    appointmentId: string;
    reason?: string;
    notifyPatient?: boolean;
  }): Promise<Appointment>;
  rescheduleAppointment(input: {
    appointmentId: string;
    newSlotId: string;
    reason?: string;
    notifyPatient?: boolean;
  }): Promise<Appointment>;
  isSlotAvailable(slotId: string): Promise<boolean>;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for validating booking requests
 */
const BookingRequestSchema = z.object({
  hubspotContactId: z.string().min(1, 'HubSpot contact ID is required'),
  phone: z.string().min(10).max(20),
  patientName: z.string().max(256).optional(),
  slotId: z.string().min(1, 'Slot ID is required'),
  procedureType: z.string().min(1).max(128),
  notes: z.string().max(2000).optional(),
});

/**
 * Schema for validating get available slots options
 */
const GetAvailableSlotsOptionsSchema = z.object({
  procedureType: z.string().min(1).max(128).optional(),
  preferredDates: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// ============================================================================
// CONSENT SERVICE INTERFACE
// ============================================================================

/**
 * Consent verification result
 */
export interface ConsentCheckResult {
  valid: boolean;
  missing: string[];
}

/**
 * Consent service interface for GDPR/HIPAA compliance
 * This interface is compatible with the domain's ConsentService
 */
export interface ConsentService {
  hasRequiredConsents(contactId: string): Promise<ConsentCheckResult>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for Calendar Scheduling Adapter
 *
 * SECURITY: ConsentService is REQUIRED for production use.
 * All patient bookings MUST have verified consent (GDPR/HIPAA requirement).
 */
export interface CalendarSchedulingAdapterConfig {
  /**
   * Calendar service for external API communication.
   * Can be the real SchedulingService or MockSchedulingService for testing.
   * Must implement the SchedulingServiceInterface.
   */
  calendarService: SchedulingServiceInterface;

  /**
   * Consent service for GDPR/HIPAA compliance (REQUIRED)
   *
   * @remarks
   * This service is mandatory for production deployments to ensure
   * all patient data processing has valid consent verification.
   * Booking will fail with ConsentRequiredError if patient lacks proper consent.
   */
  consentService: ConsentService;

  /**
   * Default timezone for date operations
   * @default 'Europe/Bucharest'
   */
  defaultTimezone?: string;

  /**
   * Clinic ID for multi-tenant deployments
   */
  clinicId?: string;
}

// ============================================================================
// TYPE MAPPERS
// ============================================================================

/**
 * Maps integration TimeSlot to domain TimeSlot
 */
function mapToDomainTimeSlot(slot: IntegrationTimeSlot): DomainTimeSlot {
  return {
    id: slot.id,
    date: slot.date,
    startTime: slot.time,
    endTime: calculateEndTime(slot.time, slot.duration),
    duration: slot.duration,
    available: slot.available,
    practitioner: slot.practitioner?.name,
    procedureTypes: [], // External calendar may not provide this; defaults to empty
  };
}

/**
 * Calculate end time from start time and duration
 */
function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = (hours ?? 0) * 60 + (minutes ?? 0) + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
}

/**
 * Maps integration Appointment to domain AppointmentDetails
 */
function mapToAppointmentDetails(appointment: Appointment): AppointmentDetails {
  const scheduledAt = new Date(appointment.scheduledAt);
  const dateStr = scheduledAt.toISOString().split('T')[0] ?? '';
  const timeStr = scheduledAt.toISOString().split('T')[1]?.substring(0, 5) ?? '00:00';

  const result: AppointmentDetails = {
    id: appointment.id,
    slot: {
      date: dateStr,
      startTime: timeStr,
      duration: appointment.duration,
    },
    procedureType: appointment.procedureType,
    hubspotContactId: '', // Not available from external calendar
    phone: appointment.patientPhone,
    createdAt: appointment.createdAt,
  };

  if (appointment.patientName) {
    result.patientName = appointment.patientName;
  }

  return result;
}

// ============================================================================
// ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * Calendar Scheduling Repository Adapter
 *
 * This adapter implements the ISchedulingRepository port from the domain layer,
 * bridging to external calendar systems via the SchedulingService from integrations.
 *
 * Features:
 * - External calendar API integration (Calendly, Cal.com, custom APIs)
 * - GDPR/HIPAA consent verification
 * - Type-safe mapping between domain and integration types
 * - Input validation with Zod schemas
 * - Structured logging with PII redaction
 *
 * @example
 * ```typescript
 * const adapter = new CalendarSchedulingAdapter({
 *   calendarService: new SchedulingService({ apiUrl, apiKey }),
 *   consentService: myConsentService,
 * });
 *
 * // Get available slots
 * const slots = await adapter.getAvailableSlots({ procedureType: 'cleaning' });
 *
 * // Book appointment (requires patient consent)
 * const result = await adapter.bookAppointment({
 *   hubspotContactId: 'contact-123',
 *   phone: '+40712345678',
 *   slotId: 'slot-456',
 *   procedureType: 'cleaning',
 * });
 * ```
 */
export class CalendarSchedulingAdapter implements ISchedulingRepository {
  private calendarService: SchedulingServiceInterface;
  private consentService: ConsentService;
  private defaultTimezone: string;
  private clinicId?: string;

  constructor(config: CalendarSchedulingAdapterConfig) {
    this.calendarService = config.calendarService;
    this.consentService = config.consentService;
    this.defaultTimezone = config.defaultTimezone ?? 'Europe/Bucharest';
    this.clinicId = config.clinicId;

    logger.info(
      { timezone: this.defaultTimezone, clinicId: this.clinicId },
      'CalendarSchedulingAdapter initialized with mandatory consent verification'
    );
  }

  /**
   * Get available slots from external calendar system
   *
   * @param options - Either a procedure type string or an options object
   * @returns Array of available time slots mapped to domain format
   */
  async getAvailableSlots(
    options: string | DomainGetAvailableSlotsOptions
  ): Promise<DomainTimeSlot[]> {
    // Normalize options to object format
    const opts =
      typeof options === 'string'
        ? { procedureType: options, limit: 20 }
        : { ...options, limit: options.limit ?? 20 };

    // Validate options
    const validatedOpts = GetAvailableSlotsOptionsSchema.parse(opts);

    logger.debug(
      { procedureType: validatedOpts.procedureType, limit: validatedOpts.limit },
      'Fetching available slots from external calendar'
    );

    try {
      // Call external calendar service
      const integrationSlots = await this.calendarService.getAvailableSlots({
        procedureType: validatedOpts.procedureType ?? 'general',
        preferredDates: validatedOpts.preferredDates,
        limit: validatedOpts.limit,
      });

      // Map to domain format
      const domainSlots = integrationSlots.map(mapToDomainTimeSlot);

      logger.info(
        { slotCount: domainSlots.length, procedureType: validatedOpts.procedureType },
        'Successfully fetched available slots'
      );

      return domainSlots;
    } catch (error) {
      logger.error(
        { error, procedureType: validatedOpts.procedureType },
        'Failed to fetch available slots from external calendar'
      );
      throw error;
    }
  }

  /**
   * Book an appointment through external calendar system
   *
   * GDPR/HIPAA COMPLIANCE (MANDATORY):
   * - Patient consent is ALWAYS verified before any booking operation
   * - Consent verification is NON-NEGOTIABLE and cannot be skipped
   * - Throws ConsentRequiredError if patient lacks required consent
   *
   * @param request - Booking request details
   * @returns Booking result with appointment ID and status
   * @throws {ConsentRequiredError} If required consent is not present (ALWAYS enforced)
   * @throws {z.ZodError} If input validation fails
   */
  async bookAppointment(request: BookingRequest): Promise<BookingResult> {
    // Validate input first
    const validatedRequest = BookingRequestSchema.parse(request);

    // MANDATORY: Verify patient consent before processing booking (GDPR/HIPAA requirement)
    // This check happens FIRST to ensure we don't access any data without consent
    // Consent verification is NON-NEGOTIABLE for all patient data operations
    const consentCheck = await this.consentService.hasRequiredConsents(
      validatedRequest.hubspotContactId
    );

    if (!consentCheck.valid) {
      logger.warn(
        {
          hubspotContactId: validatedRequest.hubspotContactId,
          missingConsents: consentCheck.missing,
        },
        'Booking rejected: patient lacks required consent'
      );
      throw new ConsentRequiredError(validatedRequest.hubspotContactId, consentCheck.missing);
    }

    logger.debug(
      { hubspotContactId: validatedRequest.hubspotContactId },
      'Patient consent verified for booking'
    );

    try {
      // Call external calendar service to book appointment
      const appointment = await this.calendarService.bookAppointment({
        slotId: validatedRequest.slotId,
        patientPhone: validatedRequest.phone,
        patientName: validatedRequest.patientName,
        procedureType: validatedRequest.procedureType,
        notes: validatedRequest.notes,
        hubspotContactId: validatedRequest.hubspotContactId,
      });

      logger.info(
        {
          appointmentId: appointment.id,
          slotId: validatedRequest.slotId,
          hubspotContactId: validatedRequest.hubspotContactId,
          status: appointment.status,
        },
        'Appointment booked successfully via external calendar'
      );

      return {
        id: appointment.id,
        status: appointment.status,
      };
    } catch (error) {
      logger.error(
        {
          error,
          slotId: validatedRequest.slotId,
          hubspotContactId: validatedRequest.hubspotContactId,
        },
        'Failed to book appointment via external calendar'
      );
      throw error;
    }
  }

  /**
   * Get upcoming appointments within a date range
   *
   * Note: This method queries the external calendar service for appointments.
   * The external service may have different filtering capabilities than our database.
   *
   * @param startDate - Start of the date range
   * @param endDate - End of the date range
   * @returns Array of appointment details mapped to domain format
   */
  getUpcomingAppointments(startDate: Date, endDate: Date): Promise<AppointmentDetails[]> {
    logger.debug(
      {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      'Fetching upcoming appointments from external calendar'
    );

    // External calendar service uses getPatientAppointments
    // For upcoming appointments, we need to query with date filters
    // Note: MockSchedulingService doesn't filter by date, so results may vary

    // Since the integration layer doesn't have a direct "get upcoming by date range" method,
    // we would need to implement a dedicated endpoint in the calendar service
    // In a real implementation, this would call that endpoint

    // For now, we return empty as the external calendar integration
    // would need a dedicated endpoint for listing appointments by date range
    logger.warn(
      'getUpcomingAppointments not fully implemented for external calendar - returning empty'
    );

    return Promise.resolve([]);
  }

  /**
   * Cancel an appointment through external calendar system
   *
   * This is an extended method not part of the base ISchedulingRepository interface,
   * but useful for calendar integrations.
   *
   * @param appointmentId - ID of the appointment to cancel
   * @param reason - Optional cancellation reason
   * @returns The cancelled appointment details
   */
  async cancelAppointment(
    appointmentId: string,
    reason?: string
  ): Promise<AppointmentDetails | null> {
    logger.debug({ appointmentId, reason }, 'Cancelling appointment via external calendar');

    try {
      const cancelled = await this.calendarService.cancelAppointment({
        appointmentId,
        reason,
        notifyPatient: true,
      });

      logger.info(
        { appointmentId, status: cancelled.status },
        'Appointment cancelled successfully'
      );

      return mapToAppointmentDetails(cancelled);
    } catch (error) {
      logger.error({ error, appointmentId }, 'Failed to cancel appointment');
      throw error;
    }
  }

  /**
   * Reschedule an appointment through external calendar system
   *
   * This is an extended method not part of the base ISchedulingRepository interface,
   * but useful for calendar integrations.
   *
   * @param appointmentId - ID of the appointment to reschedule
   * @param newSlotId - ID of the new time slot
   * @param reason - Optional reschedule reason
   * @returns The rescheduled appointment details
   */
  async rescheduleAppointment(
    appointmentId: string,
    newSlotId: string,
    reason?: string
  ): Promise<AppointmentDetails | null> {
    logger.debug(
      { appointmentId, newSlotId, reason },
      'Rescheduling appointment via external calendar'
    );

    try {
      const rescheduled = await this.calendarService.rescheduleAppointment({
        appointmentId,
        newSlotId,
        reason,
        notifyPatient: true,
      });

      logger.info(
        { appointmentId, newSlotId, status: rescheduled.status },
        'Appointment rescheduled successfully'
      );

      return mapToAppointmentDetails(rescheduled);
    } catch (error) {
      logger.error({ error, appointmentId, newSlotId }, 'Failed to reschedule appointment');
      throw error;
    }
  }

  /**
   * Check if a specific slot is still available
   *
   * @param slotId - ID of the slot to check
   * @returns True if the slot is available, false otherwise
   */
  async isSlotAvailable(slotId: string): Promise<boolean> {
    try {
      return await this.calendarService.isSlotAvailable(slotId);
    } catch (error) {
      logger.error({ error, slotId }, 'Failed to check slot availability');
      return false;
    }
  }
}

/**
 * Factory function to create a Calendar Scheduling Adapter
 *
 * @param config - Adapter configuration
 * @returns Configured CalendarSchedulingAdapter instance
 *
 * @example
 * ```typescript
 * import { createCalendarSchedulingAdapter } from '@medicalcor/infrastructure';
 * import { SchedulingService } from '@medicalcor/integrations';
 *
 * const adapter = createCalendarSchedulingAdapter({
 *   calendarService: new SchedulingService({ apiUrl, apiKey }),
 *   consentService: myConsentService,
 * });
 * ```
 */
export function createCalendarSchedulingAdapter(
  config: CalendarSchedulingAdapterConfig
): CalendarSchedulingAdapter {
  return new CalendarSchedulingAdapter(config);
}
