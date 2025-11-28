/**
 * Appointment Scheduling Service - State-of-the-Art Implementation
 *
 * Manages appointment scheduling with:
 * - Transaction-safe booking operations
 * - GDPR/HIPAA compliant consent verification
 * - Result types for explicit error handling
 * - Immutable data structures
 * - Type-safe database operations
 *
 * @module domain/scheduling
 */

import { Pool, type PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import {
  type AsyncDomainResult,
  Ok,
  Err,
  createDomainError,
  DOMAIN_ERROR_CODES,
} from '../types.js';

// Simple logger
const logger = {
  warn: (msg: string) => console.warn(msg),
};
import type { ConsentService } from '../consent/consent-service.js';

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error thrown when patient has not provided required consent
 */
export class ConsentRequiredError extends Error {
  public readonly code = 'CONSENT_REQUIRED' as const;
  public readonly contactId: string;
  public readonly missingConsents: readonly string[];

  constructor(contactId: string, missingConsents: readonly string[]) {
    super(
      `Patient consent required before scheduling. Missing consents: ${missingConsents.join(', ')}`
    );
    this.name = 'ConsentRequiredError';
    this.contactId = contactId;
    this.missingConsents = Object.freeze([...missingConsents]);
    Object.freeze(this);
  }
}

// ============================================================================
// INTERFACES - Immutable by default
// ============================================================================

/**
 * Service configuration
 */
export interface SchedulingConfig {
  readonly connectionString?: string;
  readonly timezone?: string;
  readonly consentService?: ConsentService;
  /** If true, skip consent verification (NOT RECOMMENDED - only for testing) */
  readonly skipConsentCheck?: boolean;
}

/**
 * Time slot for scheduling
 */
export interface TimeSlot {
  readonly id: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly duration: number;
  readonly available: boolean;
  readonly practitioner?: string;
  readonly procedureTypes: readonly string[];
}

/**
 * Booking request
 */
export interface BookingRequest {
  readonly hubspotContactId: string;
  readonly phone: string;
  readonly patientName?: string;
  readonly slotId: string;
  readonly procedureType: string;
  readonly notes?: string;
}

/**
 * Booking result
 */
export interface BookingResult {
  readonly id: string;
  readonly status: 'confirmed';
  readonly confirmationCode: string;
}

/**
 * Appointment details
 */
export interface Appointment {
  readonly id: string;
  readonly slot: {
    readonly date: string;
    readonly startTime: string;
    readonly duration: number;
  };
  readonly patientName?: string;
  readonly procedureType: string;
  readonly hubspotContactId: string;
  readonly phone: string;
  readonly createdAt: string;
}

/**
 * Available slots query options
 */
export interface AvailableSlotsOptions {
  readonly procedureType?: string;
  readonly preferredDates?: readonly string[];
  readonly limit?: number;
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface TimeSlotRow {
  readonly id: string;
  readonly start_time: Date;
  readonly end_time: Date;
  readonly practitioner_name: string;
  readonly procedure_types: string[] | null;
  readonly is_booked: boolean;
}

interface SlotCheckRow {
  readonly is_booked: boolean;
}

interface AppointmentRow {
  readonly id: string;
  readonly start_time: Date;
  readonly end_time: Date;
  readonly patient_name?: string;
  readonly patient_phone: string;
  readonly procedure_type: string;
  readonly hubspot_contact_id: string;
  readonly created_at: Date;
}

// ============================================================================
// SQL QUERIES - Parameterized for safety
// ============================================================================

const SQL = {
  GET_AVAILABLE_SLOTS: `
    SELECT s.*, p.name as practitioner_name
    FROM time_slots s
    JOIN practitioners p ON s.practitioner_id = p.id
    WHERE s.is_booked = false
    AND s.start_time > NOW()
    ORDER BY s.start_time ASC
    LIMIT $1
  `,

  CHECK_SLOT: `
    SELECT is_booked FROM time_slots WHERE id = $1 FOR UPDATE
  `,

  CREATE_APPOINTMENT: `
    INSERT INTO appointments
    (id, slot_id, hubspot_contact_id, patient_phone, patient_name, procedure_type, status, notes, confirmation_code)
    VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8)
  `,

  MARK_SLOT_BOOKED: `
    UPDATE time_slots SET is_booked = true WHERE id = $1
  `,

  GET_UPCOMING_APPOINTMENTS: `
    SELECT a.id, s.start_time, s.end_time, a.patient_name, a.patient_phone,
           a.procedure_type, a.hubspot_contact_id, a.created_at
    FROM appointments a
    JOIN time_slots s ON a.slot_id = s.id
    WHERE s.start_time >= $1 AND s.start_time <= $2
    AND a.status = 'confirmed'
    ORDER BY s.start_time ASC
  `,
} as const;

// ============================================================================
// SCHEDULING SERVICE
// ============================================================================

/**
 * SchedulingService - Transaction-safe appointment management
 *
 * @example
 * ```typescript
 * const service = new SchedulingService({
 *   connectionString: process.env.DATABASE_URL,
 *   consentService,
 * });
 *
 * // Get available slots
 * const slots = await service.getAvailableSlots({ limit: 10 });
 *
 * // Book appointment with Result type
 * const result = await service.bookAppointmentSafe(request);
 * result.match({
 *   ok: (booking) => console.log('Booked:', booking.confirmationCode),
 *   err: (error) => console.error('Failed:', error.code)
 * });
 * ```
 */
export class SchedulingService {
  private readonly pool: Pool | null;
  private readonly consentService: ConsentService | null;
  private readonly skipConsentCheck: boolean;

  constructor(config: SchedulingConfig) {
    this.pool = config.connectionString
      ? new Pool({
          connectionString: config.connectionString,
          max: 10,
        })
      : null;
    this.consentService = config.consentService ?? null;
    this.skipConsentCheck = config.skipConsentCheck ?? false;

    // Warn if consent service is not configured in production
    if (!this.consentService && process.env.NODE_ENV === 'production' && !this.skipConsentCheck) {
      logger.warn(
        'ConsentService not configured - patient consent verification will be skipped. ' +
          'This may violate GDPR/HIPAA compliance.'
      );
    }
  }

  // ==========================================================================
  // QUERY OPERATIONS
  // ==========================================================================

  /**
   * Get available slots from database
   */
  async getAvailableSlots(
    options: string | AvailableSlotsOptions = {}
  ): Promise<readonly TimeSlot[]> {
    if (!this.pool) {
      return Object.freeze([]);
    }

    const opts: AvailableSlotsOptions =
      typeof options === 'string'
        ? { procedureType: options, limit: 20 }
        : { ...options, limit: options.limit ?? 20 };

    const client = await this.pool.connect();
    try {
      const result = await client.query<TimeSlotRow>(SQL.GET_AVAILABLE_SLOTS, [opts.limit]);

      return Object.freeze(result.rows.map((row) => this.rowToTimeSlot(row)));
    } finally {
      client.release();
    }
  }

  /**
   * Get upcoming appointments within a date range
   */
  async getUpcomingAppointments(startDate: Date, endDate: Date): Promise<readonly Appointment[]> {
    if (!this.pool) {
      return Object.freeze([]);
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query<AppointmentRow>(SQL.GET_UPCOMING_APPOINTMENTS, [
        startDate,
        endDate,
      ]);

      return Object.freeze(result.rows.map((row) => this.rowToAppointment(row)));
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // BOOKING OPERATIONS - Result-based error handling
  // ==========================================================================

  /**
   * Book an appointment with Result-based error handling
   *
   * This is the preferred method - returns Result instead of throwing.
   */
  async bookAppointmentSafe(request: BookingRequest): AsyncDomainResult<BookingResult> {
    if (!this.pool) {
      return Err(
        createDomainError(
          DOMAIN_ERROR_CODES.REPOSITORY_NOT_CONFIGURED,
          'Database connection not configured - connectionString is required'
        )
      );
    }

    // Verify consent
    const consentResult = await this.verifyConsent(request.hubspotContactId);
    if (consentResult.isErr) {
      return consentResult;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the slot to prevent race conditions
      const slotResult = await this.checkAndLockSlot(client, request.slotId);
      if (slotResult.isErr) {
        await client.query('ROLLBACK');
        return slotResult;
      }

      // Create the appointment
      const appointmentId = uuidv4();
      const confirmationCode = this.generateConfirmationCode();

      await client.query(SQL.CREATE_APPOINTMENT, [
        appointmentId,
        request.slotId,
        request.hubspotContactId,
        request.phone,
        request.patientName,
        request.procedureType,
        request.notes,
        confirmationCode,
      ]);

      // Mark slot as booked
      await client.query(SQL.MARK_SLOT_BOOKED, [request.slotId]);

      await client.query('COMMIT');

      return Ok(
        Object.freeze({
          id: appointmentId,
          status: 'confirmed' as const,
          confirmationCode,
        })
      );
    } catch (error) {
      await client.query('ROLLBACK');
      return Err(
        createDomainError(DOMAIN_ERROR_CODES.BOOKING_FAILED, 'Failed to book appointment', {
          cause: error,
        })
      );
    } finally {
      client.release();
    }
  }

  /**
   * Book an appointment (legacy method - throws on error)
   *
   * @deprecated Use bookAppointmentSafe instead for explicit error handling
   */
  async bookAppointment(request: BookingRequest): Promise<{ id: string; status: string }> {
    const result = await this.bookAppointmentSafe(request);

    if (result.isErr) {
      if (result.error.code === DOMAIN_ERROR_CODES.CONSENT_REQUIRED) {
        const metadata = result.error.metadata as { missing?: string[] } | undefined;
        throw new ConsentRequiredError(request.hubspotContactId, metadata?.missing ?? []);
      }
      throw new Error(result.error.message);
    }

    return { id: result.value.id, status: result.value.status };
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Verify patient consent
   */
  private async verifyConsent(contactId: string): AsyncDomainResult<void> {
    if (this.skipConsentCheck || !this.consentService) {
      return Ok(undefined);
    }

    const consentCheck = await this.consentService.hasRequiredConsents(contactId);
    if (!consentCheck.valid) {
      return Err(
        createDomainError(
          DOMAIN_ERROR_CODES.CONSENT_REQUIRED,
          `Patient consent required before scheduling. Missing consents: ${consentCheck.missing.join(', ')}`,
          { metadata: { missing: [...consentCheck.missing] } }
        )
      );
    }

    return Ok(undefined);
  }

  /**
   * Check and lock a slot for booking
   */
  private async checkAndLockSlot(client: PoolClient, slotId: string): AsyncDomainResult<void> {
    const slotCheck = await client.query<SlotCheckRow>(SQL.CHECK_SLOT, [slotId]);

    if (slotCheck.rows.length === 0) {
      return Err(createDomainError(DOMAIN_ERROR_CODES.SLOT_NOT_FOUND, 'Slot not found'));
    }

    if (slotCheck.rows[0]?.is_booked) {
      return Err(createDomainError(DOMAIN_ERROR_CODES.SLOT_ALREADY_BOOKED, 'Slot already booked'));
    }

    return Ok(undefined);
  }

  /**
   * Convert database row to TimeSlot
   */
  private rowToTimeSlot(row: TimeSlotRow): TimeSlot {
    const startTime = new Date(row.start_time);
    const endTime = new Date(row.end_time);
    const startIso = startTime.toISOString();
    const endIso = endTime.toISOString();

    return Object.freeze({
      id: row.id,
      date: startIso.split('T')[0] ?? '',
      startTime: (startIso.split('T')[1] ?? '00:00:00').substring(0, 5),
      endTime: (endIso.split('T')[1] ?? '00:00:00').substring(0, 5),
      duration: 30,
      available: true,
      practitioner: row.practitioner_name,
      procedureTypes: Object.freeze(row.procedure_types ?? []),
    });
  }

  /**
   * Convert database row to Appointment
   */
  private rowToAppointment(row: AppointmentRow): Appointment {
    const startTime = new Date(row.start_time);
    const endTime = new Date(row.end_time);
    const startIso = startTime.toISOString();

    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.round(durationMs / (1000 * 60));

    return Object.freeze({
      id: row.id,
      slot: Object.freeze({
        date: startIso.split('T')[0] ?? '',
        startTime: (startIso.split('T')[1] ?? '00:00:00').substring(0, 5),
        duration: durationMinutes,
      }),
      ...(row.patient_name && { patientName: row.patient_name }),
      procedureType: row.procedure_type,
      hubspotContactId: row.hubspot_contact_id,
      phone: row.patient_phone,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }

  /**
   * Generate secure confirmation code
   * SECURITY: Uses cryptographically secure random bytes
   */
  private generateConfirmationCode(): string {
    return randomBytes(4).toString('hex').toUpperCase().substring(0, 6);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a scheduling service instance
 */
export function createSchedulingService(config: SchedulingConfig): SchedulingService {
  return new SchedulingService(config);
}
