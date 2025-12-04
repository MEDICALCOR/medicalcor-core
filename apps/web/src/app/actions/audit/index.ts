'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Audit Log Management
 */

let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface AuditLog {
  id: string;
  timestamp: Date;
  user: string;
  userRole: string;
  action: string;
  category: 'patient' | 'document' | 'settings' | 'auth' | 'billing' | 'system';
  status: 'success' | 'failure' | 'warning';
  details: string | null;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  ipAddress: string | null;
}

export interface AuditStats {
  totalLogs: number;
  todayLogs: number;
  failedActions: number;
  uniqueUsers: number;
  // Alias properties for page compatibility
  successCount: number;
  warningCount: number;
  errorCount: number;
  activeUsers: number;
}

export interface AuditFilters {
  category?: string;
  status?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

interface AuditLogRow {
  id: string;
  created_at: Date;
  user_name: string | null;
  user_role: string | null;
  action: string;
  category: string;
  status: string;
  details: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  ip_address: string | null;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateAuditLogSchema = z.object({
  action: z.string().min(1).max(200),
  category: z.enum(['patient', 'document', 'settings', 'auth', 'billing', 'system']),
  status: z.enum(['success', 'failure', 'warning']).default('success'),
  details: z.string().optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().uuid().optional(),
  entityName: z.string().max(300).optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    timestamp: row.created_at,
    user: row.user_name ?? 'System',
    userRole: row.user_role ?? 'system',
    action: row.action,
    category: row.category as AuditLog['category'],
    status: row.status as AuditLog['status'],
    details: row.details,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    ipAddress: row.ip_address,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getAuditLogsAction(
  filters?: AuditFilters,
  limit: number = 100,
  offset: number = 0
): Promise<{ logs: AuditLog[]; total: number; error?: string }> {
  try {
    await requirePermission('audit:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    let whereClause = 'WHERE clinic_id = $1';
    const params: unknown[] = [user.clinicId];
    let paramIndex = 2;

    if (filters?.category) {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(filters.category);
    }
    if (filters?.status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }
    if (filters?.userId) {
      whereClause += ` AND user_id = $${paramIndex++}`;
      params.push(filters.userId);
    }
    if (filters?.startDate) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }
    if (filters?.search) {
      whereClause += ` AND (action ILIKE $${paramIndex} OR details ILIKE $${paramIndex} OR entity_name ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await database.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs ${whereClause}`,
      params
    );

    // Get logs
    params.push(limit, offset);
    const result = await database.query<AuditLogRow>(
      `SELECT id, created_at, user_name, user_role, action, category, status,
              details, entity_type, entity_id::text, entity_name, ip_address::text
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return {
      logs: result.rows.map(rowToAuditLog),
      total: parseInt(countResult.rows[0].count),
    };
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return { logs: [], total: 0, error: 'Failed to fetch audit logs' };
  }
}

export async function getAuditStatsAction(): Promise<{ stats: AuditStats | null; error?: string }> {
  try {
    await requirePermission('audit:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_logs: string;
      today_logs: string;
      failed_actions: string;
      unique_users: string;
      success_count: string;
      warning_count: string;
    }>(
      `SELECT
        COUNT(*) as total_logs,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today_logs,
        COUNT(*) FILTER (WHERE status = 'failure') as failed_actions,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
        COUNT(*) FILTER (WHERE status = 'success') as success_count,
        COUNT(*) FILTER (WHERE status = 'warning') as warning_count
       FROM audit_logs
       WHERE clinic_id = $1`,
      [user.clinicId]
    );

    const row = result.rows[0];
    const uniqueUsers = parseInt(row.unique_users);
    const failedActions = parseInt(row.failed_actions);
    return {
      stats: {
        totalLogs: parseInt(row.total_logs),
        todayLogs: parseInt(row.today_logs),
        failedActions,
        uniqueUsers,
        successCount: parseInt(row.success_count),
        warningCount: parseInt(row.warning_count),
        errorCount: failedActions,
        activeUsers: uniqueUsers,
      },
    };
  } catch (error) {
    console.error('Error fetching audit stats:', error);
    return { stats: null, error: 'Failed to fetch audit stats' };
  }
}

export async function createAuditLogAction(
  data: z.infer<typeof CreateAuditLogSchema>
): Promise<{ log: AuditLog | null; error?: string }> {
  try {
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = CreateAuditLogSchema.parse(data);

    const result = await database.query<AuditLogRow>(
      `INSERT INTO audit_logs (clinic_id, user_id, user_name, user_role, action, category,
              status, details, entity_type, entity_id, entity_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, created_at, user_name, user_role, action, category, status,
                 details, entity_type, entity_id::text, entity_name, ip_address::text`,
      [
        user.clinicId,
        user.id,
        user.name,
        user.role,
        validated.action,
        validated.category,
        validated.status,
        validated.details ?? null,
        validated.entityType ?? null,
        validated.entityId ?? null,
        validated.entityName ?? null,
      ]
    );

    return { log: rowToAuditLog(result.rows[0]) };
  } catch (error) {
    console.error('Error creating audit log:', error);
    return { log: null, error: 'Failed to create audit log' };
  }
}

export async function getAuditLogsByEntityAction(
  entityType: string,
  entityId: string
): Promise<{ logs: AuditLog[]; error?: string }> {
  try {
    await requirePermission('audit:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<AuditLogRow>(
      `SELECT id, created_at, user_name, user_role, action, category, status,
              details, entity_type, entity_id::text, entity_name, ip_address::text
       FROM audit_logs
       WHERE clinic_id = $1 AND entity_type = $2 AND entity_id = $3
       ORDER BY created_at DESC
       LIMIT 50`,
      [user.clinicId, entityType, entityId]
    );

    return { logs: result.rows.map(rowToAuditLog) };
  } catch (error) {
    console.error('Error fetching entity audit logs:', error);
    return { logs: [], error: 'Failed to fetch entity audit logs' };
  }
}

export async function exportAuditLogsAction(
  filters?: AuditFilters
): Promise<{ success: boolean; data?: string; error?: string }> {
  try {
    await requirePermission('audit:export');
    const user = await requireCurrentUser();
    const database = getDatabase();

    let whereClause = 'WHERE clinic_id = $1';
    const params: unknown[] = [user.clinicId];
    let paramIndex = 2;

    if (filters?.startDate) {
      whereClause += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      whereClause += ` AND created_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    const result = await database.query<AuditLogRow>(
      `SELECT id, created_at, user_name, user_role, action, category, status,
              details, entity_type, entity_id::text, entity_name, ip_address::text
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT 10000`,
      params
    );

    // Convert to CSV
    const headers = [
      'ID',
      'Timestamp',
      'User',
      'Role',
      'Action',
      'Category',
      'Status',
      'Details',
      'Entity Type',
      'Entity ID',
      'Entity Name',
      'IP Address',
    ];
    const rows = result.rows.map((row) => [
      row.id,
      row.created_at.toISOString(),
      row.user_name ?? '',
      row.user_role ?? '',
      row.action,
      row.category,
      row.status,
      row.details ?? '',
      row.entity_type ?? '',
      row.entity_id ?? '',
      row.entity_name ?? '',
      row.ip_address ?? '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');

    return { success: true, data: csv };
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    return { success: false, error: 'Failed to export audit logs' };
  }
}
