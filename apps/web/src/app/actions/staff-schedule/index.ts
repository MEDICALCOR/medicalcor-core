'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, getCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Staff Schedule Management
 */

let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface StaffShift {
  id: string;
  staffId: string;
  staffName: string;
  date: Date;
  shiftType: 'morning' | 'afternoon' | 'evening' | 'night' | 'regular' | 'on_call' | 'off' | 'vacation' | 'sick';
  startTime: string | null;
  endTime: string | null;
  isConfirmed: boolean;
  notes: string | null;
}

export interface ScheduleStats {
  totalStaff: number;
  scheduledToday: number;
  onVacation: number;
  onSick: number;
}

interface StaffMemberRow {
  id: string;
  name: string;
  role: string | null;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

interface StaffShiftRow {
  id: string;
  staff_id: string;
  staff_name: string | null;
  schedule_date: Date;
  shift_type: string;
  start_time: string | null;
  end_time: string | null;
  is_confirmed: boolean;
  notes: string | null;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateShiftSchema = z.object({
  staffId: z.string().uuid(),
  date: z.string(),
  shiftType: z.enum(['morning', 'afternoon', 'evening', 'night', 'regular', 'on_call', 'off', 'vacation', 'sick']),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateShiftSchema = z.object({
  id: z.string().uuid(),
  shiftType: z.enum(['morning', 'afternoon', 'evening', 'night', 'regular', 'on_call', 'off', 'vacation', 'sick']).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isConfirmed: z.boolean().optional(),
  notes: z.string().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToStaffMember(row: StaffMemberRow): StaffMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role ?? 'Staff',
    department: row.specialty ?? 'General',
    email: row.email,
    phone: row.phone,
    isActive: row.is_active,
  };
}

function rowToStaffShift(row: StaffShiftRow): StaffShift {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name ?? '',
    date: row.schedule_date,
    shiftType: row.shift_type as StaffShift['shiftType'],
    startTime: row.start_time,
    endTime: row.end_time,
    isConfirmed: row.is_confirmed,
    notes: row.notes,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getStaffMembersAction(): Promise<{ staff: StaffMember[]; error?: string }> {
  try {
    await requirePermission('staff:read');
    const database = getDatabase();

    const result = await database.query<StaffMemberRow>(
      `SELECT id, name, role, specialty, email, phone, is_active
       FROM practitioners
       WHERE is_active = true
       ORDER BY name ASC`
    );

    return { staff: result.rows.map(rowToStaffMember) };
  } catch (error) {
    console.error('Error fetching staff members:', error);
    return { staff: [], error: 'Failed to fetch staff members' };
  }
}

export async function getStaffScheduleAction(
  startDate: string,
  endDate: string
): Promise<{ shifts: StaffShift[]; error?: string }> {
  try {
    await requirePermission('staff:read');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query<StaffShiftRow>(
      `SELECT ss.id, ss.staff_id, COALESCE(ss.staff_name, p.name) as staff_name,
              ss.schedule_date, ss.shift_type, ss.start_time::text, ss.end_time::text,
              ss.is_confirmed, ss.notes
       FROM staff_schedules ss
       LEFT JOIN practitioners p ON p.id = ss.staff_id
       WHERE ss.clinic_id = $1 AND ss.schedule_date BETWEEN $2 AND $3
       ORDER BY ss.schedule_date, ss.start_time`,
      [user.clinicId, startDate, endDate]
    );

    return { shifts: result.rows.map(rowToStaffShift) };
  } catch (error) {
    console.error('Error fetching staff schedule:', error);
    return { shifts: [], error: 'Failed to fetch schedule' };
  }
}

export async function getScheduleStatsAction(): Promise<{ stats: ScheduleStats | null; error?: string }> {
  try {
    await requirePermission('staff:read');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_staff: string;
      scheduled_today: string;
      on_vacation: string;
      on_sick: string;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM practitioners WHERE is_active = true) as total_staff,
        COUNT(*) FILTER (WHERE schedule_date = CURRENT_DATE AND shift_type NOT IN ('off', 'vacation', 'sick')) as scheduled_today,
        COUNT(*) FILTER (WHERE schedule_date = CURRENT_DATE AND shift_type = 'vacation') as on_vacation,
        COUNT(*) FILTER (WHERE schedule_date = CURRENT_DATE AND shift_type = 'sick') as on_sick
       FROM staff_schedules
       WHERE clinic_id = $1 AND schedule_date = CURRENT_DATE`,
      [user.clinicId]
    );

    const row = result.rows[0];
    return {
      stats: {
        totalStaff: parseInt(row.total_staff),
        scheduledToday: parseInt(row.scheduled_today),
        onVacation: parseInt(row.on_vacation),
        onSick: parseInt(row.on_sick),
      },
    };
  } catch (error) {
    console.error('Error fetching schedule stats:', error);
    return { stats: null, error: 'Failed to fetch schedule stats' };
  }
}

export async function createShiftAction(
  data: z.infer<typeof CreateShiftSchema>
): Promise<{ shift: StaffShift | null; error?: string }> {
  try {
    await requirePermission('staff:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const validated = CreateShiftSchema.parse(data);

    // Get staff name
    const staffResult = await database.query<{ name: string; role: string; specialty: string }>(
      `SELECT name, role, specialty FROM practitioners WHERE id = $1`,
      [validated.staffId]
    );

    if (staffResult.rows.length === 0) {
      return { shift: null, error: 'Staff member not found' };
    }

    const staff = staffResult.rows[0];

    const result = await database.query<StaffShiftRow>(
      `INSERT INTO staff_schedules (clinic_id, staff_id, staff_name, staff_role, department,
              schedule_date, shift_type, start_time, end_time, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, staff_id, staff_name, schedule_date, shift_type,
                 start_time::text, end_time::text, is_confirmed, notes`,
      [
        user.clinicId,
        validated.staffId,
        staff.name,
        staff.role,
        staff.specialty,
        validated.date,
        validated.shiftType,
        validated.startTime ?? null,
        validated.endTime ?? null,
        validated.notes ?? null,
        user.id,
      ]
    );

    return { shift: rowToStaffShift(result.rows[0]) };
  } catch (error) {
    console.error('Error creating shift:', error);
    return { shift: null, error: 'Failed to create shift' };
  }
}

export async function updateShiftAction(
  data: z.infer<typeof UpdateShiftSchema>
): Promise<{ shift: StaffShift | null; error?: string }> {
  try {
    await requirePermission('staff:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const validated = UpdateShiftSchema.parse(data);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validated.shiftType !== undefined) {
      updates.push(`shift_type = $${paramIndex++}`);
      values.push(validated.shiftType);
    }
    if (validated.startTime !== undefined) {
      updates.push(`start_time = $${paramIndex++}`);
      values.push(validated.startTime);
    }
    if (validated.endTime !== undefined) {
      updates.push(`end_time = $${paramIndex++}`);
      values.push(validated.endTime);
    }
    if (validated.isConfirmed !== undefined) {
      updates.push(`is_confirmed = $${paramIndex++}`);
      values.push(validated.isConfirmed);
      if (validated.isConfirmed) {
        updates.push(`confirmed_at = NOW()`);
        updates.push(`confirmed_by = $${paramIndex++}`);
        values.push(user.id);
      }
    }
    if (validated.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(validated.notes);
    }

    if (updates.length === 0) {
      return { shift: null, error: 'No updates provided' };
    }

    values.push(validated.id, user.clinicId);

    const result = await database.query<StaffShiftRow>(
      `UPDATE staff_schedules SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND clinic_id = $${paramIndex}
       RETURNING id, staff_id, staff_name, schedule_date, shift_type,
                 start_time::text, end_time::text, is_confirmed, notes`,
      values
    );

    if (result.rows.length === 0) {
      return { shift: null, error: 'Shift not found' };
    }

    return { shift: rowToStaffShift(result.rows[0]) };
  } catch (error) {
    console.error('Error updating shift:', error);
    return { shift: null, error: 'Failed to update shift' };
  }
}

export async function deleteShiftAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('staff:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query(
      `DELETE FROM staff_schedules WHERE id = $1 AND clinic_id = $2`,
      [id, user.clinicId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Shift not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting shift:', error);
    return { success: false, error: 'Failed to delete shift' };
  }
}

export async function copyWeekScheduleAction(
  sourceWeekStart: string,
  targetWeekStart: string
): Promise<{ success: boolean; copiedCount: number; error?: string }> {
  try {
    await requirePermission('staff:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query<{ count: string }>(
      `WITH source_shifts AS (
        SELECT staff_id, staff_name, staff_role, department, shift_type,
               start_time, end_time, notes,
               schedule_date - $2::date as day_offset
        FROM staff_schedules
        WHERE clinic_id = $1
          AND schedule_date >= $2
          AND schedule_date < $2::date + INTERVAL '7 days'
      )
      INSERT INTO staff_schedules (clinic_id, staff_id, staff_name, staff_role, department,
              schedule_date, shift_type, start_time, end_time, notes, created_by)
      SELECT $1, staff_id, staff_name, staff_role, department,
             $3::date + day_offset, shift_type, start_time, end_time, notes, $4
      FROM source_shifts
      RETURNING id`,
      [user.clinicId, sourceWeekStart, targetWeekStart, user.id]
    );

    return { success: true, copiedCount: result.rowCount ?? 0 };
  } catch (error) {
    console.error('Error copying week schedule:', error);
    return { success: false, copiedCount: 0, error: 'Failed to copy schedule' };
  }
}
