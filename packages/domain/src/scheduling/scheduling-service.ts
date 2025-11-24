import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Configuration interface
export interface SchedulingConfig {
  connectionString?: string;
  timezone?: string;
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
}

export class SchedulingService {
  private pool: Pool | null;

  constructor(config: SchedulingConfig) {
    // Note: timezone is accepted for future use but currently not utilized
    void config.timezone;
    this.pool = config.connectionString
      ? new Pool({
          connectionString: config.connectionString,
          max: 10,
        })
      : null;
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
   */
  async bookAppointment(request: BookingRequest): Promise<{ id: string; status: string }> {
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
