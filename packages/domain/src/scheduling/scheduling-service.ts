import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type { ConsentService } from '../consent/consent-service.js';

// GDPR Consent Error
export class ConsentRequiredError extends Error {
  constructor(
    message: string,
    public readonly contactId: string,
    public readonly consentType: string
  ) {
    super(message);
    this.name = 'ConsentRequiredError';
  }
}

// Configuration interface
export interface SchedulingConfig {
  connectionString?: string;
  timezone?: string;
  consentService?: ConsentService;
  requireConsent?: boolean; // Default: true for GDPR compliance
}

// Database row types
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

// Domain Types
export interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  available: boolean;
  practitioner?: string;
  procedureTypes: string[];
}

export interface BookingRequest {
  hubspotContactId: string;
  phone: string;
  patientName?: string;
  slotId: string;
  procedureType: string;
  notes?: string;
  reservationId?: string; // Optional: ID from prior reservation
}

export interface SlotReservation {
  id: string;
  slotId: string;
  hubspotContactId: string;
  expiresAt: Date;
  status: 'active' | 'confirmed' | 'expired' | 'cancelled';
}

// Slot reservation error
export class SlotUnavailableError extends Error {
  constructor(
    message: string,
    public readonly slotId: string,
    public readonly reason: 'already_booked' | 'reserved' | 'not_found' | 'expired_reservation'
  ) {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

export class SchedulingService {
  private pool: Pool | null;
  private consentService: ConsentService | null;
  private requireConsent: boolean;

  constructor(config: SchedulingConfig) {
    // Note: timezone is accepted for future use but currently not utilized
    void config.timezone;
    this.pool = config.connectionString
      ? new Pool({
          connectionString: config.connectionString,
          max: 10,
        })
      : null;
    this.consentService = config.consentService ?? null;
    this.requireConsent = config.requireConsent ?? true; // GDPR: default to requiring consent
  }

  /**
   * GDPR Compliance: Verify consent before any appointment booking
   * @throws ConsentRequiredError if consent is not valid
   */
  private async verifyAppointmentConsent(hubspotContactId: string): Promise<void> {
    if (!this.requireConsent) {
      return; // Skip consent check if explicitly disabled (e.g., for testing)
    }

    if (!this.consentService) {
      // If no consent service configured but consent is required, throw error
      throw new ConsentRequiredError(
        'Consent service not configured but consent is required for GDPR compliance',
        hubspotContactId,
        'appointment_booking'
      );
    }

    // Check for valid consent for appointment booking
    const hasConsent = await this.consentService.hasValidConsent(
      hubspotContactId,
      'appointment_reminders'
    );

    if (!hasConsent) {
      // Also check for general data processing consent
      const hasDataProcessingConsent = await this.consentService.hasValidConsent(
        hubspotContactId,
        'data_processing'
      );

      if (!hasDataProcessingConsent) {
        throw new ConsentRequiredError(
          'GDPR: Valid consent required before booking appointment. Please obtain patient consent first.',
          hubspotContactId,
          'data_processing'
        );
      }
    }
  }

  /**
   * Get available slots from Postgres
   * @param options - Either a procedure type string or an options object
   */
  async getAvailableSlots(
    options: string | { procedureType?: string; preferredDates?: string[]; limit?: number }
  ): Promise<TimeSlot[]> {
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
      // Query slots that are NOT booked, NOT reserved, and are in the future
      const sql = `
        SELECT s.*, p.name as practitioner_name
        FROM time_slots s
        JOIN practitioners p ON s.practitioner_id = p.id
        LEFT JOIN slot_reservations sr ON s.id = sr.slot_id
          AND sr.status = 'active'
          AND sr.expires_at > NOW()
        WHERE s.is_booked = false
        AND sr.id IS NULL  -- No active reservation
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
   * Reserve a slot temporarily (prevents double-booking during user selection)
   * Reservation expires after 10 minutes by default
   * @throws SlotUnavailableError if slot is already booked or reserved
   */
  async reserveSlot(
    slotId: string,
    hubspotContactId: string,
    expirationMinutes: number = 10
  ): Promise<SlotReservation> {
    if (!this.pool) {
      throw new Error('Database connection not configured');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Use advisory lock to prevent race conditions during reservation
      // The lock is released automatically at end of transaction
      const lockKey = Buffer.from(slotId).reduce((a, b) => a + b, 0);
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      // Check if slot exists and is available
      const slotCheck = await client.query<{ is_booked: boolean }>(
        'SELECT is_booked FROM time_slots WHERE id = $1',
        [slotId]
      );

      if (slotCheck.rows.length === 0) {
        throw new SlotUnavailableError('Slot not found', slotId, 'not_found');
      }

      if (slotCheck.rows[0]?.is_booked) {
        throw new SlotUnavailableError('Slot is already booked', slotId, 'already_booked');
      }

      // Check for existing active reservation
      const existingReservation = await client.query<{ id: string; hubspot_contact_id: string }>(
        `SELECT id, hubspot_contact_id FROM slot_reservations
         WHERE slot_id = $1 AND status = 'active' AND expires_at > NOW()`,
        [slotId]
      );

      if (existingReservation.rows.length > 0) {
        const existing = existingReservation.rows[0];
        // If same contact, extend the reservation
        if (existing && existing.hubspot_contact_id === hubspotContactId) {
          const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);
          await client.query(
            `UPDATE slot_reservations SET expires_at = $1 WHERE id = $2`,
            [expiresAt, existing.id]
          );
          await client.query('COMMIT');
          return {
            id: existing.id,
            slotId,
            hubspotContactId,
            expiresAt,
            status: 'active',
          };
        }
        throw new SlotUnavailableError(
          'Slot is reserved by another user',
          slotId,
          'reserved'
        );
      }

      // Create new reservation
      const reservationId = uuidv4();
      const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

      await client.query(
        `INSERT INTO slot_reservations (id, slot_id, hubspot_contact_id, expires_at, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        [reservationId, slotId, hubspotContactId, expiresAt]
      );

      await client.query('COMMIT');

      return {
        id: reservationId,
        slotId,
        hubspotContactId,
        expiresAt,
        status: 'active',
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel a slot reservation
   */
  async cancelReservation(reservationId: string): Promise<void> {
    if (!this.pool) return;

    await this.pool.query(
      `UPDATE slot_reservations SET status = 'cancelled' WHERE id = $1`,
      [reservationId]
    );
  }

  /**
   * Clean up expired reservations (call periodically via cron)
   */
  async cleanupExpiredReservations(): Promise<number> {
    if (!this.pool) return 0;

    const result = await this.pool.query(
      `UPDATE slot_reservations
       SET status = 'expired'
       WHERE status = 'active' AND expires_at < NOW()`
    );

    return result.rowCount ?? 0;
  }

  /**
   * Book an appointment with Transaction Safety
   * GDPR Compliance: Verifies consent before booking
   * @throws ConsentRequiredError if valid consent is not present
   * @throws SlotUnavailableError if slot is already booked
   */
  async bookAppointment(request: BookingRequest): Promise<{ id: string; status: string }> {
    if (!this.pool) {
      throw new Error('Database connection not configured - connectionString is required');
    }

    // GDPR COMPLIANCE: Verify consent BEFORE any database operations
    await this.verifyAppointmentConsent(request.hubspotContactId);

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

      // 2. Create the Appointment record
      const appointmentId = uuidv4();
      const confirmCode = Math.random().toString(36).substring(2, 8).toUpperCase();

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
  async getUpcomingAppointments(
    startDate: Date,
    endDate: Date
  ): Promise<
    Array<{
      id: string;
      slot: { date: string; startTime: string; duration: number };
      patientName?: string;
      procedureType: string;
      hubspotContactId: string;
      phone: string;
      createdAt: string;
    }>
  > {
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
      const result = await client.query(sql, [startDate, endDate]);
      return result.rows.map(
        (row: {
          id: string;
          start_time: Date;
          end_time: Date;
          patient_name?: string;
          patient_phone: string;
          procedure_type: string;
          hubspot_contact_id: string;
          created_at: Date;
        }) => {
          const startTime = new Date(row.start_time);
          const startIso = startTime.toISOString();

          const endTime = new Date(row.end_time);
          const durationMs = endTime.getTime() - startTime.getTime();
          const durationMinutes = Math.round(durationMs / (1000 * 60));

          const appointment: {
            id: string;
            slot: { date: string; startTime: string; duration: number };
            patientName?: string;
            procedureType: string;
            hubspotContactId: string;
            phone: string;
            createdAt: string;
          } = {
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
        }
      );
    } finally {
      client.release();
    }
  }
}
