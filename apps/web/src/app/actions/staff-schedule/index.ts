'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

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
  shiftType:
    | 'morning'
    | 'afternoon'
    | 'evening'
    | 'night'
    | 'regular'
    | 'on_call'
    | 'off'
    | 'vacation'
    | 'sick';
  startTime: string | null;
  endTime: string | null;
  isConfirmed: boolean;
  notes: string | null;
}

export interface ScheduleStats {
  totalStaff: number;
  scheduledToday: number;
  workingToday: number;
  onCallToday: number;
  onVacation: number;
  onVacationToday: number;
  onSick: number;
}

// =============================================================================
// M12: Capacity Planning Types
// =============================================================================

export interface CapacityMetrics {
  date: string;
  dayOfWeek: string;
  scheduledStaff: number;
  requiredStaff: number;
  utilizationRate: number;
  status: 'understaffed' | 'optimal' | 'overstaffed';
  gap: number;
  predictedAppointments: number;
}

export interface DemandForecast {
  date: string;
  predictedAppointments: number;
  predictedCalls: number;
  recommendedStaff: number;
  confidence: number;
  historicalAvg: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface StaffingRecommendation {
  date: string;
  dayOfWeek: string;
  currentStaff: number;
  recommendedStaff: number;
  gap: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  suggestedActions: string[];
}

export interface ShiftConflict {
  staffId: string;
  staffName: string;
  date: string;
  conflictType: 'double_booking' | 'insufficient_rest' | 'overtime_exceeded' | 'consecutive_days';
  description: string;
  shifts: { id: string; type: string; start: string; end: string }[];
}

export interface CapacityDashboardData {
  weeklyCapacity: CapacityMetrics[];
  demandForecast: DemandForecast[];
  recommendations: StaffingRecommendation[];
  conflicts: ShiftConflict[];
  summary: {
    avgUtilization: number;
    understaffedDays: number;
    overstaffedDays: number;
    totalConflicts: number;
    weeklyHoursScheduled: number;
    weeklyHoursRequired: number;
  };
}

// Alias for page compatibility
export type Shift = StaffShift;

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
  shiftType: z.enum([
    'morning',
    'afternoon',
    'evening',
    'night',
    'regular',
    'on_call',
    'off',
    'vacation',
    'sick',
  ]),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateShiftSchema = z.object({
  id: z.string().uuid(),
  shiftType: z
    .enum([
      'morning',
      'afternoon',
      'evening',
      'night',
      'regular',
      'on_call',
      'off',
      'vacation',
      'sick',
    ])
    .optional(),
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

export async function getStaffScheduleAction(params: {
  startDate: string;
  endDate: string;
}): Promise<{ staff: StaffMember[]; shifts: StaffShift[]; error?: string }> {
  try {
    await requirePermission('staff:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    // Fetch staff members
    const staffResult = await database.query<StaffMemberRow>(
      `SELECT id, name, role, specialty, email, phone, is_active
       FROM practitioners
       WHERE is_active = true
       ORDER BY name ASC`
    );

    // Fetch shifts
    const shiftsResult = await database.query<StaffShiftRow>(
      `SELECT ss.id, ss.staff_id, COALESCE(ss.staff_name, p.name) as staff_name,
              ss.schedule_date, ss.shift_type, ss.start_time::text, ss.end_time::text,
              ss.is_confirmed, ss.notes
       FROM staff_schedules ss
       LEFT JOIN practitioners p ON p.id = ss.staff_id
       WHERE ss.clinic_id = $1 AND ss.schedule_date BETWEEN $2 AND $3
       ORDER BY ss.schedule_date, ss.start_time`,
      [user.clinicId, params.startDate, params.endDate]
    );

    return {
      staff: staffResult.rows.map(rowToStaffMember),
      shifts: shiftsResult.rows.map(rowToStaffShift),
    };
  } catch (error) {
    console.error('Error fetching staff schedule:', error);
    return { staff: [], shifts: [], error: 'Failed to fetch schedule' };
  }
}

export async function getScheduleStatsAction(): Promise<{
  stats: ScheduleStats | null;
  error?: string;
}> {
  try {
    await requirePermission('staff:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_staff: string;
      scheduled_today: string;
      on_call_today: string;
      on_vacation: string;
      on_sick: string;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM practitioners WHERE is_active = true) as total_staff,
        COUNT(*) FILTER (WHERE schedule_date = CURRENT_DATE AND shift_type NOT IN ('off', 'vacation', 'sick')) as scheduled_today,
        COUNT(*) FILTER (WHERE schedule_date = CURRENT_DATE AND shift_type = 'on_call') as on_call_today,
        COUNT(*) FILTER (WHERE schedule_date = CURRENT_DATE AND shift_type = 'vacation') as on_vacation,
        COUNT(*) FILTER (WHERE schedule_date = CURRENT_DATE AND shift_type = 'sick') as on_sick
       FROM staff_schedules
       WHERE clinic_id = $1 AND schedule_date = CURRENT_DATE`,
      [user.clinicId]
    );

    const row = result.rows[0];
    const scheduledToday = parseInt(row.scheduled_today);
    const onVacation = parseInt(row.on_vacation);
    return {
      stats: {
        totalStaff: parseInt(row.total_staff),
        scheduledToday,
        workingToday: scheduledToday,
        onCallToday: parseInt(row.on_call_today),
        onVacation,
        onVacationToday: onVacation,
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
    const user = await requireCurrentUser();
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
    const user = await requireCurrentUser();
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
    const user = await requireCurrentUser();
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
    const user = await requireCurrentUser();
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

// =============================================================================
// M12: Capacity Planning Actions
// =============================================================================

const DAY_NAMES = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];

// Base staffing requirements by day of week (index 0 = Sunday)
const BASE_STAFF_REQUIREMENTS = [2, 5, 6, 6, 6, 5, 3];

// Average appointments per staff member per day
const APPOINTMENTS_PER_STAFF = 8;

/**
 * Get capacity planning dashboard data
 */
export async function getCapacityDashboardAction(
  weekStartDate: string
): Promise<CapacityDashboardData> {
  try {
    await requirePermission('staff:read');

    const weekStart = new Date(weekStartDate);
    const weeklyCapacity: CapacityMetrics[] = [];
    const demandForecast: DemandForecast[] = [];
    const recommendations: StaffingRecommendation[] = [];

    // Generate data for 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0] ?? '';
      const dayOfWeek = date.getDay();
      const dayName = DAY_NAMES[dayOfWeek] ?? '';

      // Simulate scheduled staff (would come from database in production)
      const scheduledStaff = Math.floor(3 + Math.random() * 4);
      const requiredStaff = BASE_STAFF_REQUIREMENTS[dayOfWeek] ?? 5;
      const gap = scheduledStaff - requiredStaff;
      const utilizationRate =
        requiredStaff > 0 ? Math.round((scheduledStaff / requiredStaff) * 100) : 0;

      let status: CapacityMetrics['status'] = 'optimal';
      if (utilizationRate < 80) status = 'understaffed';
      else if (utilizationRate > 120) status = 'overstaffed';

      // Predicted appointments
      const predictedAppointments = Math.round(
        requiredStaff * APPOINTMENTS_PER_STAFF * (0.8 + Math.random() * 0.4)
      );

      weeklyCapacity.push({
        date: dateStr,
        dayOfWeek: dayName,
        scheduledStaff,
        requiredStaff,
        utilizationRate,
        status,
        gap,
        predictedAppointments,
      });

      // Demand forecast
      const historicalAvg = requiredStaff * APPOINTMENTS_PER_STAFF;
      const trendVariation = Math.random() - 0.5;
      let trend: DemandForecast['trend'] = 'stable';
      if (trendVariation > 0.2) trend = 'increasing';
      else if (trendVariation < -0.2) trend = 'decreasing';

      demandForecast.push({
        date: dateStr,
        predictedAppointments,
        predictedCalls: Math.round(predictedAppointments * 0.3),
        recommendedStaff: requiredStaff,
        confidence: 0.75 + Math.random() * 0.2,
        historicalAvg,
        trend,
      });

      // Generate recommendations for understaffed days
      if (status === 'understaffed') {
        let priority: StaffingRecommendation['priority'] = 'medium';
        if (gap <= -3) priority = 'critical';
        else if (gap <= -2) priority = 'high';

        const suggestedActions: string[] = [];
        if (gap <= -2) {
          suggestedActions.push('Contactează personal pe gardă');
          suggestedActions.push('Consideră reprogramarea programărilor non-urgente');
        }
        if (gap <= -1) {
          suggestedActions.push('Verifică disponibilitatea personalului part-time');
        }
        suggestedActions.push('Extinde programul personalului existent');

        recommendations.push({
          date: dateStr,
          dayOfWeek: dayName,
          currentStaff: scheduledStaff,
          recommendedStaff: requiredStaff,
          gap,
          priority,
          reason: `Lipsă de ${Math.abs(gap)} ${Math.abs(gap) === 1 ? 'angajat' : 'angajați'} pentru cererea estimată`,
          suggestedActions,
        });
      }
    }

    // Generate mock conflicts
    const conflicts: ShiftConflict[] = [];
    if (Math.random() > 0.5) {
      conflicts.push({
        staffId: 'staff-1',
        staffName: 'Dr. Maria Popescu',
        date: weeklyCapacity[2]?.date ?? '',
        conflictType: 'consecutive_days',
        description: '7 zile consecutive de muncă fără pauză',
        shifts: [
          { id: 's1', type: 'regular', start: '08:00', end: '16:00' },
          { id: 's2', type: 'regular', start: '08:00', end: '16:00' },
        ],
      });
    }
    if (Math.random() > 0.6) {
      conflicts.push({
        staffId: 'staff-2',
        staffName: 'Alexandru Ionescu',
        date: weeklyCapacity[4]?.date ?? '',
        conflictType: 'overtime_exceeded',
        description: 'Ore suplimentare depășite (52h/săptămână)',
        shifts: [{ id: 's3', type: 'regular', start: '08:00', end: '20:00' }],
      });
    }

    // Calculate summary
    const understaffedDays = weeklyCapacity.filter((c) => c.status === 'understaffed').length;
    const overstaffedDays = weeklyCapacity.filter((c) => c.status === 'overstaffed').length;
    const avgUtilization = Math.round(
      weeklyCapacity.reduce((sum, c) => sum + c.utilizationRate, 0) / weeklyCapacity.length
    );
    const weeklyHoursScheduled = weeklyCapacity.reduce((sum, c) => sum + c.scheduledStaff * 8, 0);
    const weeklyHoursRequired = weeklyCapacity.reduce((sum, c) => sum + c.requiredStaff * 8, 0);

    return {
      weeklyCapacity,
      demandForecast,
      recommendations: recommendations.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }),
      conflicts,
      summary: {
        avgUtilization,
        understaffedDays,
        overstaffedDays,
        totalConflicts: conflicts.length,
        weeklyHoursScheduled,
        weeklyHoursRequired,
      },
    };
  } catch (error) {
    console.error('Error fetching capacity dashboard:', error);
    return {
      weeklyCapacity: [],
      demandForecast: [],
      recommendations: [],
      conflicts: [],
      summary: {
        avgUtilization: 0,
        understaffedDays: 0,
        overstaffedDays: 0,
        totalConflicts: 0,
        weeklyHoursScheduled: 0,
        weeklyHoursRequired: 0,
      },
    };
  }
}

/**
 * Detect shift conflicts for a date range
 */
export async function detectShiftConflictsAction(
  startDate: string,
  endDate: string
): Promise<ShiftConflict[]> {
  try {
    await requirePermission('staff:read');

    // In production, this would query the database for:
    // 1. Double bookings (same staff, overlapping times)
    // 2. Insufficient rest (< 11 hours between shifts)
    // 3. Overtime exceeded (> 48 hours per week)
    // 4. Too many consecutive working days (> 6)

    // Mock conflicts for demo
    const conflicts: ShiftConflict[] = [];

    if (Math.random() > 0.5) {
      conflicts.push({
        staffId: 'staff-1',
        staffName: 'Dr. Elena Stanescu',
        date: startDate,
        conflictType: 'insufficient_rest',
        description: 'Doar 8 ore între turele de noapte și zi',
        shifts: [
          { id: 's1', type: 'night', start: '22:00', end: '06:00' },
          { id: 's2', type: 'morning', start: '14:00', end: '22:00' },
        ],
      });
    }

    return conflicts;
  } catch (error) {
    console.error('Error detecting conflicts:', error);
    return [];
  }
}

/**
 * Get staffing recommendations for a specific date
 */
export async function getStaffingRecommendationsAction(
  date: string
): Promise<StaffingRecommendation[]> {
  try {
    await requirePermission('staff:read');

    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();
    const dayName = DAY_NAMES[dayOfWeek] ?? '';
    const requiredStaff = BASE_STAFF_REQUIREMENTS[dayOfWeek] ?? 5;

    // Mock current scheduled staff
    const currentStaff = Math.floor(2 + Math.random() * 4);
    const gap = currentStaff - requiredStaff;

    if (gap >= 0) {
      return []; // No understaffing
    }

    let priority: StaffingRecommendation['priority'] = 'low';
    if (gap <= -3) priority = 'critical';
    else if (gap <= -2) priority = 'high';
    else if (gap <= -1) priority = 'medium';

    return [
      {
        date,
        dayOfWeek: dayName,
        currentStaff,
        recommendedStaff: requiredStaff,
        gap,
        priority,
        reason: `Cerere estimată ridicată pentru ${dayName}. Lipsesc ${Math.abs(gap)} angajați.`,
        suggestedActions: [
          'Verifică disponibilitatea personalului part-time',
          'Contactează personal în concediu pentru voluntariat',
          'Redistribuie programările mai puțin urgente',
        ],
      },
    ];
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return [];
  }
}

/**
 * Get demand forecast for upcoming weeks
 */
export async function getDemandForecastAction(weeksAhead: number = 2): Promise<DemandForecast[]> {
  try {
    await requirePermission('staff:read');

    const forecasts: DemandForecast[] = [];
    const today = new Date();

    for (let week = 0; week < weeksAhead; week++) {
      for (let day = 0; day < 7; day++) {
        const date = new Date(today);
        date.setDate(date.getDate() + week * 7 + day);
        const dateStr = date.toISOString().split('T')[0] ?? '';
        const dayOfWeek = date.getDay();

        const baseRequirement = BASE_STAFF_REQUIREMENTS[dayOfWeek] ?? 5;
        const historicalAvg = baseRequirement * APPOINTMENTS_PER_STAFF;
        const variation = 0.8 + Math.random() * 0.4;
        const predictedAppointments = Math.round(historicalAvg * variation);

        // Confidence decreases as we forecast further ahead
        const confidence = Math.max(0.5, 0.95 - week * 0.1 - day * 0.02);

        let trend: DemandForecast['trend'] = 'stable';
        if (variation > 1.1) trend = 'increasing';
        else if (variation < 0.9) trend = 'decreasing';

        forecasts.push({
          date: dateStr,
          predictedAppointments,
          predictedCalls: Math.round(predictedAppointments * 0.25),
          recommendedStaff: Math.ceil(predictedAppointments / APPOINTMENTS_PER_STAFF),
          confidence,
          historicalAvg,
          trend,
        });
      }
    }

    return forecasts;
  } catch (error) {
    console.error('Error getting demand forecast:', error);
    return [];
  }
}
