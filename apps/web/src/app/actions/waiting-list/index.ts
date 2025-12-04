'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, getCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Waiting List Management
 */

let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface WaitingPatient {
  id: string;
  patientId: string | null;
  patientName: string;
  phone: string;
  email: string | null;
  requestedService: string;
  preferredDoctor: string | null;
  preferredDays: string[];
  preferredTimeSlots: string[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'waiting' | 'contacted' | 'scheduled' | 'cancelled' | 'expired';
  notes: string | null;
  addedAt: Date;
  contactedAt: Date | null;
}

export interface WaitingListStats {
  totalWaiting: number;
  highPriority: number;
  contactedToday: number;
  avgWaitDays: number;
}

interface WaitingPatientRow {
  id: string;
  patient_id: string | null;
  patient_name: string;
  phone: string | null;
  email: string | null;
  requested_service: string | null;
  preferred_doctor_name: string | null;
  preferred_days: string[] | null;
  preferred_time_slots: string[] | null;
  priority: string;
  status: string;
  notes: string | null;
  added_at: Date;
  contacted_at: Date | null;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateWaitingPatientSchema = z.object({
  patientName: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  requestedService: z.string().max(200).optional(),
  preferredDoctorId: z.string().uuid().optional(),
  preferredDays: z.array(z.string()).optional(),
  preferredTimeSlots: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  notes: z.string().optional(),
});

const UpdateWaitingPatientSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['waiting', 'contacted', 'scheduled', 'cancelled', 'expired']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  notes: z.string().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToWaitingPatient(row: WaitingPatientRow): WaitingPatient {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    phone: row.phone ?? '',
    email: row.email,
    requestedService: row.requested_service ?? '',
    preferredDoctor: row.preferred_doctor_name,
    preferredDays: row.preferred_days ?? [],
    preferredTimeSlots: row.preferred_time_slots ?? [],
    priority: row.priority as WaitingPatient['priority'],
    status: row.status as WaitingPatient['status'],
    notes: row.notes,
    addedAt: row.added_at,
    contactedAt: row.contacted_at,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getWaitingListAction(): Promise<{ patients: WaitingPatient[]; error?: string }> {
  try {
    await requirePermission('waiting_list:read');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query<WaitingPatientRow>(
      `SELECT id, patient_id, patient_name, phone, email, requested_service,
              preferred_doctor_name, preferred_days, preferred_time_slots,
              priority, status, notes, added_at, contacted_at
       FROM waiting_list
       WHERE clinic_id = $1 AND status NOT IN ('cancelled', 'expired')
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           ELSE 4
         END,
         added_at ASC`,
      [user.clinicId]
    );

    return { patients: result.rows.map(rowToWaitingPatient) };
  } catch (error) {
    console.error('Error fetching waiting list:', error);
    return { patients: [], error: 'Failed to fetch waiting list' };
  }
}

export async function getWaitingListStatsAction(): Promise<{ stats: WaitingListStats | null; error?: string }> {
  try {
    await requirePermission('waiting_list:read');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_waiting: string;
      high_priority: string;
      contacted_today: string;
      avg_wait_days: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'waiting') as total_waiting,
        COUNT(*) FILTER (WHERE status = 'waiting' AND priority IN ('high', 'urgent')) as high_priority,
        COUNT(*) FILTER (WHERE contacted_at::date = CURRENT_DATE) as contacted_today,
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - added_at)) / 86400) FILTER (WHERE status = 'waiting'), 0) as avg_wait_days
       FROM waiting_list
       WHERE clinic_id = $1`,
      [user.clinicId]
    );

    const row = result.rows[0];
    return {
      stats: {
        totalWaiting: parseInt(row.total_waiting),
        highPriority: parseInt(row.high_priority),
        contactedToday: parseInt(row.contacted_today),
        avgWaitDays: Math.round(parseFloat(row.avg_wait_days)),
      },
    };
  } catch (error) {
    console.error('Error fetching waiting list stats:', error);
    return { stats: null, error: 'Failed to fetch waiting list stats' };
  }
}

export async function createWaitingPatientAction(
  data: z.infer<typeof CreateWaitingPatientSchema>
): Promise<{ patient: WaitingPatient | null; error?: string }> {
  try {
    await requirePermission('waiting_list:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const validated = CreateWaitingPatientSchema.parse(data);

    // Get doctor name if ID provided
    let doctorName: string | null = null;
    if (validated.preferredDoctorId) {
      const doctorResult = await database.query<{ name: string }>(
        `SELECT name FROM practitioners WHERE id = $1`,
        [validated.preferredDoctorId]
      );
      doctorName = doctorResult.rows[0]?.name ?? null;
    }

    const result = await database.query<WaitingPatientRow>(
      `INSERT INTO waiting_list (clinic_id, patient_name, phone, email, requested_service,
              preferred_doctor_id, preferred_doctor_name, preferred_days, preferred_time_slots,
              priority, notes, added_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, patient_id, patient_name, phone, email, requested_service,
                 preferred_doctor_name, preferred_days, preferred_time_slots,
                 priority, status, notes, added_at, contacted_at`,
      [
        user.clinicId,
        validated.patientName,
        validated.phone ?? null,
        validated.email ?? null,
        validated.requestedService ?? null,
        validated.preferredDoctorId ?? null,
        doctorName,
        validated.preferredDays ?? [],
        validated.preferredTimeSlots ?? [],
        validated.priority,
        validated.notes ?? null,
        user.id,
      ]
    );

    return { patient: rowToWaitingPatient(result.rows[0]) };
  } catch (error) {
    console.error('Error creating waiting patient:', error);
    return { patient: null, error: 'Failed to add patient to waiting list' };
  }
}

export async function updateWaitingPatientAction(
  data: z.infer<typeof UpdateWaitingPatientSchema>
): Promise<{ patient: WaitingPatient | null; error?: string }> {
  try {
    await requirePermission('waiting_list:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const validated = UpdateWaitingPatientSchema.parse(data);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validated.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(validated.status);
      if (validated.status === 'contacted') {
        updates.push(`contacted_at = NOW()`);
      }
    }
    if (validated.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(validated.priority);
    }
    if (validated.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(validated.notes);
    }

    if (updates.length === 0) {
      return { patient: null, error: 'No updates provided' };
    }

    values.push(validated.id, user.clinicId);

    const result = await database.query<WaitingPatientRow>(
      `UPDATE waiting_list SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND clinic_id = $${paramIndex}
       RETURNING id, patient_id, patient_name, phone, email, requested_service,
                 preferred_doctor_name, preferred_days, preferred_time_slots,
                 priority, status, notes, added_at, contacted_at`,
      values
    );

    if (result.rows.length === 0) {
      return { patient: null, error: 'Patient not found' };
    }

    return { patient: rowToWaitingPatient(result.rows[0]) };
  } catch (error) {
    console.error('Error updating waiting patient:', error);
    return { patient: null, error: 'Failed to update patient' };
  }
}

export async function removeFromWaitingListAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('waiting_list:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query(
      `UPDATE waiting_list SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2`,
      [id, user.clinicId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Patient not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing from waiting list:', error);
    return { success: false, error: 'Failed to remove patient' };
  }
}

export async function scheduleFromWaitingListAction(
  id: string,
  appointmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('waiting_list:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query(
      `UPDATE waiting_list
       SET status = 'scheduled', scheduled_appointment_id = $3, updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2`,
      [id, user.clinicId, appointmentId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Patient not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error scheduling from waiting list:', error);
    return { success: false, error: 'Failed to schedule patient' };
  }
}
