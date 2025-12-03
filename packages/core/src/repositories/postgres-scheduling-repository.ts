/**
 * @fileoverview PostgreSQL Scheduling Repository (Infrastructure Layer)
 *
 * This is the concrete PostgreSQL adapter implementing the ISchedulingRepository port
 * from the domain layer. It handles all database operations for scheduling.
 *
 * @module @medicalcor/core/repositories
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** - it implements the port (ISchedulingRepository) defined in the domain.
 * The domain layer depends only on the interface, not this implementation.
 *
 * @example
 * ```typescript
 * import { PostgresSchedulingRepository } from '@medicalcor/core';
 * import type { ISchedulingRepository } from '@medicalcor/domain';
 *
 * const repository: ISchedulingRepository = new PostgresSchedulingRepository({
 *   connectionString: process.env.DATABASE_URL,
 *   timezone: 'Europe/Bucharest',
 * });
 *
 * const slots = await repository.getAvailableSlots({ limit: 10 });
 * ```
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { createLogger } from '../logger.js';
import type {
  ISchedulingRepository,
  TimeSlot,
  BookingRequest,
  BookingResult,
  AppointmentDetails,
  GetAvailableSlotsOptions,
} from '@medicalcor/domain';
import { ConsentRequiredError } from '@medicalcor/domain';
import type { ConsentService } from '@medicalcor/domain';

const logger = createLogger({ name: 'postgres-scheduling-repository' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for PostgreSQL Scheduling Repository
 */
export interface PostgresSchedulingConfig {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Maximum connections in the pool (default: 10) */
  maxConnections?: number;
  /** Timezone for date operations */
  timezone?: string;
  /** Consent service for GDPR/HIPAA compliance */
  consentService?: ConsentService;
  /** Skip consent verification (NOT RECOMMENDED - only for testing) */
  skipConsentCheck?: boolean;
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface TimeSlotRow {
  id: string;
  start_time: Date;
  end_time: Date;
  practitioner_name: string;
  procedure_types: string[] | null;
  is_booked: boolean;
}

interface SlotCheckRow {
  is_booked: boolean;
}

interface AppointmentRow {
  id: string;
  start_time: Date;
  end_time: Date;
  patient_name?: string;
  patient_phone: string;
  procedure_type: string;
  hubspot_contact_id: string;
  created_at: Date;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * PostgreSQL implementation of the Scheduling Repository
 *
 * This adapter implements the ISchedulingRepository port from the domain layer,
 * providing concrete PostgreSQL database operations.
 *
 * Features:
 * - Connection pooling
 * - Transaction safety for bookings
 * - GDPR/HIPAA consent verification
 * - Race condition prevention with row locking
 * - Cryptographically secure confirmation codes
 */
export class PostgresSchedulingRepository implements ISchedulingRepository {
  private pool: Pool | null;
  private consentService: ConsentService | null;
  private skipConsentCheck: boolean;

  constructor(config: PostgresSchedulingConfig) {
    // Note: timezone is accepted for future use but currently not utilized
    void config.timezone;

    this.pool = config.connectionString
      ? new Pool({
          connectionString: config.connectionString,
          max: config.maxConnections ?? 10,
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

  /**
   * Get available slots from PostgreSQL
   * @param options - Either a procedure type string or an options object
   */
  async getAvailableSlots(options: string | GetAvailableSlotsOptions): Promise<TimeSlot[]> {
    if (!this.pool) {
      // Return empty array if no database connection configured
      return [];
    }

    const opts =
      typeof options === 'string'
        ? { procedureType: options, limit: 20 }
        : { procedureType: options.procedureType, limit: options.limit ?? 20 };

    const client = await this.pool.connect();
    try {
      // Query slots that are NOT booked and are in the future
      const sql = `
        SELECT s.*, p.name as practitioner_name
        FROM time_slots s
        JOIN practitioners p ON s.practitioner_id = p.id
        WHERE s.is_booked = false
        AND s.start_time > NOW()
        ORDER BY s.start_time ASC LIMIT $1
      `;

      const result = await client.query<TimeSlotRow>(sql, [opts.limit]);

      return result.rows.map((row: TimeSlotRow) => {
        const startTime = new Date(row.start_time);
        const endTime = new Date(row.end_time);
        const startIso = startTime.toISOString();
        const endIso = endTime.toISOString();

        return {
          id: row.id,
          date: startIso.split('T')[0] ?? '',
          startTime: (startIso.split('T')[1] ?? '00:00:00').substring(0, 5),
          endTime: (endIso.split('T')[1] ?? '00:00:00').substring(0, 5),
          duration: 30,
          available: true,
          practitioner: row.practitioner_name,
          procedureTypes: row.procedure_types ?? [],
        };
      });
    } finally {
      client.release();
    }
  }

  /**
   * Book an appointment with Transaction Safety
   *
   * GDPR/HIPAA COMPLIANCE: This method verifies patient consent before booking.
   * If ConsentService is configured, it will check for 'data_processing' consent.
   * Throws ConsentRequiredError if consent is missing or invalid.
   */
  async bookAppointment(request: BookingRequest): Promise<BookingResult> {
    // CRITICAL: Verify patient consent before processing booking (GDPR/HIPAA requirement)
    // This check happens FIRST to ensure we don't access any data without consent
    if (this.consentService && !this.skipConsentCheck) {
      const consentCheck = await this.consentService.hasRequiredConsents(request.hubspotContactId);
      if (!consentCheck.valid) {
        throw new ConsentRequiredError(request.hubspotContactId, consentCheck.missing);
      }
    }

    if (!this.pool) {
      throw new Error('Database connection not configured - connectionString is required');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the slot to prevent race conditions
      const slotCheck = await client.query<SlotCheckRow>(
        `SELECT is_booked FROM time_slots WHERE id = $1 FOR UPDATE`,
        [request.slotId]
      );

      if (slotCheck.rows.length === 0) throw new Error('Slot not found');
      if (slotCheck.rows[0]?.is_booked) throw new Error('Slot already booked');

      // SECURITY FIX: Double-check for existing active appointments (defense in depth)
      // This prevents double-booking even if is_booked flag gets out of sync
      const existingAppointment = await client.query(
        `SELECT id FROM appointments
         WHERE slot_id = $1 AND status NOT IN ('cancelled', 'no_show')
         FOR UPDATE`,
        [request.slotId]
      );

      if (existingAppointment.rows.length > 0) {
        throw new Error('Slot already has an active appointment');
      }

      // 2. Create the Appointment record
      const appointmentId = uuidv4();
      // SECURITY: Use cryptographically secure random bytes instead of Math.random()
      // This prevents confirmation code prediction/brute-force attacks
      const confirmCode = randomBytes(4).toString('hex').toUpperCase().substring(0, 6);

      await client.query(
        `INSERT INTO appointments
        (id, slot_id, hubspot_contact_id, patient_phone, patient_name, procedure_type, status, notes, confirmation_code)
        VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8)`,
        [
          appointmentId,
          request.slotId,
          request.hubspotContactId,
          request.phone,
          request.patientName,
          request.procedureType,
          request.notes,
          confirmCode,
        ]
      );

      // 3. Mark Slot as Booked
      await client.query(`UPDATE time_slots SET is_booked = true WHERE id = $1`, [request.slotId]);

      await client.query('COMMIT');
      return { id: appointmentId, status: 'confirmed' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Get upcoming appointments within a date range
   */
  async getUpcomingAppointments(startDate: Date, endDate: Date): Promise<AppointmentDetails[]> {
    if (!this.pool) {
      // Return empty array if no database connection configured
      return [];
    }

    const client = await this.pool.connect();
    try {
      const sql = `
        SELECT a.id, s.start_time, s.end_time, a.patient_name, a.patient_phone,
               a.procedure_type, a.hubspot_contact_id, a.created_at
        FROM appointments a
        JOIN time_slots s ON a.slot_id = s.id
        WHERE s.start_time >= $1 AND s.start_time <= $2
        AND a.status = 'confirmed'
        ORDER BY s.start_time ASC
      `;
      const result = await client.query<AppointmentRow>(sql, [startDate, endDate]);

      return result.rows.map((row: AppointmentRow) => {
        const startTime = new Date(row.start_time);
        const startIso = startTime.toISOString();

        const endTime = new Date(row.end_time);
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));

        const appointment: AppointmentDetails = {
          id: row.id,
          slot: {
            date: startIso.split('T')[0] ?? '',
            startTime: (startIso.split('T')[1] ?? '00:00:00').substring(0, 5),
            duration: durationMinutes,
          },
          procedureType: row.procedure_type,
          hubspotContactId: row.hubspot_contact_id,
          phone: row.patient_phone,
          createdAt: new Date(row.created_at).toISOString(),
        };

        if (row.patient_name) {
          appointment.patientName = row.patient_name;
        }

        return appointment;
      });
    } finally {
      client.release();
    }
  }

  /**
   * Close the database pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

/**
 * Factory function to create a PostgreSQL Scheduling Repository
 */
export function createPostgresSchedulingRepository(
  config: PostgresSchedulingConfig
): PostgresSchedulingRepository {
  return new PostgresSchedulingRepository(config);
}
