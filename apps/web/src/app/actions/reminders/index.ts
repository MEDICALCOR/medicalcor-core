'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Reminder Management
 */

let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface Reminder {
  id: string;
  name: string;
  type: 'appointment' | 'follow_up' | 'medication' | 'payment' | 'birthday' | 'custom';
  channels: string[];
  timing: string;
  timingValue: number;
  timingUnit: 'minutes' | 'hours' | 'days' | 'weeks';
  timingRelation: 'before' | 'after';
  template: string;
  isActive: boolean;
  sentCount: number;
  successRate: number;
}

export interface ReminderStats {
  totalSent: number;
  smsCount: number;
  emailCount: number;
  whatsappCount: number;
  deliveryRate: number;
}

interface ReminderRow {
  id: string;
  name: string;
  reminder_type: string;
  channels: string[];
  timing_value: number;
  timing_unit: string;
  timing_relation: string;
  template_content: string;
  is_active: boolean;
  sent_count: number;
  success_rate: number;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateReminderSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['appointment', 'follow_up', 'medication', 'payment', 'birthday', 'custom']),
  channels: z.array(z.string()).min(1),
  timingValue: z.number().min(1),
  timingUnit: z.enum(['minutes', 'hours', 'days', 'weeks']),
  timingRelation: z.enum(['before', 'after']).default('before'),
  template: z.string().min(1),
});

const UpdateReminderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  channels: z.array(z.string()).optional(),
  timingValue: z.number().min(1).optional(),
  timingUnit: z.enum(['minutes', 'hours', 'days', 'weeks']).optional(),
  template: z.string().optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function formatTiming(value: number, unit: string, relation: string): string {
  const unitMap: Record<string, string> = {
    minutes: 'minute',
    hours: 'oră',
    days: 'zi',
    weeks: 'săptămână',
  };
  const pluralMap: Record<string, string> = {
    minutes: 'minute',
    hours: 'ore',
    days: 'zile',
    weeks: 'săptămâni',
  };
  const unitText = value === 1 ? unitMap[unit] : pluralMap[unit];
  const relationText = relation === 'before' ? 'înainte' : 'după';
  return `${value} ${unitText} ${relationText}`;
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    name: row.name,
    type: row.reminder_type as Reminder['type'],
    channels: row.channels,
    timing: formatTiming(row.timing_value, row.timing_unit, row.timing_relation),
    timingValue: row.timing_value,
    timingUnit: row.timing_unit as Reminder['timingUnit'],
    timingRelation: row.timing_relation as Reminder['timingRelation'],
    template: row.template_content,
    isActive: row.is_active,
    sentCount: row.sent_count,
    successRate: row.success_rate,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getRemindersAction(): Promise<{ reminders: Reminder[]; error?: string }> {
  try {
    await requirePermission('reminders:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<ReminderRow>(
      `SELECT id, name, reminder_type, channels, timing_value, timing_unit, timing_relation,
              template_content, is_active, sent_count, success_rate
       FROM reminder_templates
       WHERE clinic_id = $1
       ORDER BY created_at DESC`,
      [user.clinicId]
    );

    return { reminders: result.rows.map(rowToReminder) };
  } catch (error) {
    console.error('Error fetching reminders:', error);
    return { reminders: [], error: 'Failed to fetch reminders' };
  }
}

export async function getReminderStatsAction(): Promise<{ stats: ReminderStats | null; error?: string }> {
  try {
    await requirePermission('reminders:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_sent: string;
      sms_count: string;
      email_count: string;
      whatsapp_count: string;
      delivery_rate: string;
    }>(
      `SELECT
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE channel = 'sms') as sms_count,
        COUNT(*) FILTER (WHERE channel = 'email') as email_count,
        COUNT(*) FILTER (WHERE channel = 'whatsapp') as whatsapp_count,
        COALESCE(AVG(CASE WHEN status = 'delivered' THEN 100 ELSE 0 END), 0) as delivery_rate
       FROM reminder_logs
       WHERE clinic_id = $1 AND sent_at >= NOW() - INTERVAL '30 days'`,
      [user.clinicId]
    );

    const row = result.rows[0];
    return {
      stats: {
        totalSent: parseInt(row.total_sent),
        smsCount: parseInt(row.sms_count),
        emailCount: parseInt(row.email_count),
        whatsappCount: parseInt(row.whatsapp_count),
        deliveryRate: parseFloat(row.delivery_rate),
      },
    };
  } catch (error) {
    console.error('Error fetching reminder stats:', error);
    return { stats: null, error: 'Failed to fetch reminder stats' };
  }
}

export async function createReminderAction(
  data: z.infer<typeof CreateReminderSchema>
): Promise<{ reminder: Reminder | null; error?: string }> {
  try {
    await requirePermission('reminders:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = CreateReminderSchema.parse(data);

    const result = await database.query<ReminderRow>(
      `INSERT INTO reminder_templates (clinic_id, name, reminder_type, channels, timing_value,
              timing_unit, timing_relation, template_content, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, reminder_type, channels, timing_value, timing_unit, timing_relation,
                 template_content, is_active, sent_count, success_rate`,
      [
        user.clinicId,
        validated.name,
        validated.type,
        validated.channels,
        validated.timingValue,
        validated.timingUnit,
        validated.timingRelation,
        validated.template,
        user.id,
      ]
    );

    return { reminder: rowToReminder(result.rows[0]) };
  } catch (error) {
    console.error('Error creating reminder:', error);
    return { reminder: null, error: 'Failed to create reminder' };
  }
}

export async function updateReminderAction(
  data: z.infer<typeof UpdateReminderSchema>
): Promise<{ reminder: Reminder | null; error?: string }> {
  try {
    await requirePermission('reminders:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = UpdateReminderSchema.parse(data);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(validated.name);
    }
    if (validated.channels !== undefined) {
      updates.push(`channels = $${paramIndex++}`);
      values.push(validated.channels);
    }
    if (validated.timingValue !== undefined) {
      updates.push(`timing_value = $${paramIndex++}`);
      values.push(validated.timingValue);
    }
    if (validated.timingUnit !== undefined) {
      updates.push(`timing_unit = $${paramIndex++}`);
      values.push(validated.timingUnit);
    }
    if (validated.template !== undefined) {
      updates.push(`template_content = $${paramIndex++}`);
      values.push(validated.template);
    }
    if (validated.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(validated.isActive);
    }

    if (updates.length === 0) {
      return { reminder: null, error: 'No updates provided' };
    }

    values.push(validated.id, user.clinicId);

    const result = await database.query<ReminderRow>(
      `UPDATE reminder_templates SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND clinic_id = $${paramIndex}
       RETURNING id, name, reminder_type, channels, timing_value, timing_unit, timing_relation,
                 template_content, is_active, sent_count, success_rate`,
      values
    );

    if (result.rows.length === 0) {
      return { reminder: null, error: 'Reminder not found' };
    }

    return { reminder: rowToReminder(result.rows[0]) };
  } catch (error) {
    console.error('Error updating reminder:', error);
    return { reminder: null, error: 'Failed to update reminder' };
  }
}

export async function toggleReminderAction(id: string): Promise<{ reminder: Reminder | null; error?: string }> {
  try {
    await requirePermission('reminders:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<ReminderRow>(
      `UPDATE reminder_templates SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2
       RETURNING id, name, reminder_type, channels, timing_value, timing_unit, timing_relation,
                 template_content, is_active, sent_count, success_rate`,
      [id, user.clinicId]
    );

    if (result.rows.length === 0) {
      return { reminder: null, error: 'Reminder not found' };
    }

    return { reminder: rowToReminder(result.rows[0]) };
  } catch (error) {
    console.error('Error toggling reminder:', error);
    return { reminder: null, error: 'Failed to toggle reminder' };
  }
}

export async function deleteReminderAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('reminders:delete');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query(
      `DELETE FROM reminder_templates WHERE id = $1 AND clinic_id = $2`,
      [id, user.clinicId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Reminder not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return { success: false, error: 'Failed to delete reminder' };
  }
}
