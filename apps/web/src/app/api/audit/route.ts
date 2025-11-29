/**
 * Audit Trail API Endpoint
 *
 * Provides access to audit logs for compliance reviews.
 * Implements HIPAA, GDPR, and banking-grade audit requirements.
 *
 * Features:
 * - Query auth events, data access, and system events
 * - Filter by date range, user, event type
 * - Pagination support for large datasets
 * - Admin-only access
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createDatabaseClient, maskEmail } from '@medicalcor/core';

/**
 * Query parameters schema
 */
const AuditQuerySchema = z.object({
  // Filter by event type
  eventType: z
    .enum(['auth', 'data_access', 'consent', 'admin', 'system'])
    .optional(),
  // Filter by specific event
  event: z.string().max(100).optional(),
  // Filter by user ID
  userId: z.string().uuid().optional(),
  // Date range
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  // Pagination
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
  // Sort
  sortBy: z.enum(['created_at', 'event_type', 'user_id']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

type AuditQuery = z.infer<typeof AuditQuerySchema>;

/**
 * GET /api/audit
 *
 * Query audit logs with filtering and pagination
 * Requires admin role
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Require authentication
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin role for audit access
    const userRole = session.user.role;
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const parseResult = AuditQuerySchema.safeParse(searchParams);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const query: AuditQuery = parseResult.data;
    const db = createDatabaseClient();

    // Build dynamic query based on event type
    let results: { rows: unknown[]; totalCount: number };

    switch (query.eventType) {
      case 'auth':
        results = await queryAuthEvents(db, query);
        break;
      case 'data_access':
        results = await queryDataAccessEvents(db, query);
        break;
      case 'consent':
        results = await queryConsentEvents(db, query);
        break;
      case 'admin':
        results = await queryAdminEvents(db, query);
        break;
      case 'system':
        results = await querySystemEvents(db, query);
        break;
      default:
        // Query all event types
        results = await queryAllEvents(db, query);
    }

    // Log the audit query itself for meta-audit
    await db.query(
      `INSERT INTO sensitive_data_access_log
       (user_id, entity_type, entity_id, field_names, access_type, access_reason)
       VALUES ($1, 'audit_log', $1, ARRAY['all'], 'read', 'Audit trail query')`,
      [session.user.id]
    );

    return NextResponse.json({
      success: true,
      data: results.rows,
      pagination: {
        total: results.totalCount,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + query.limit < results.totalCount,
      },
      query: {
        eventType: query.eventType ?? 'all',
        startDate: query.startDate,
        endDate: query.endDate,
      },
    });
  } catch (error) {
    console.error('[Audit API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to query audit logs' },
      { status: 500 }
    );
  }
}

/**
 * Query authentication events
 */
async function queryAuthEvents(
  db: ReturnType<typeof createDatabaseClient>,
  query: AuditQuery
): Promise<{ rows: unknown[]; totalCount: number }> {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (query.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(query.userId);
  }

  if (query.event) {
    conditions.push(`event_type = $${paramIndex++}`);
    params.push(query.event);
  }

  if (query.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(query.startDate);
  }

  if (query.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(query.endDate);
  }

  const whereClause = conditions.join(' AND ');

  // Get count
  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM auth_events WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get data with pagination
  const dataResult = await db.query(
    `SELECT
      id,
      user_id,
      email,
      event_type,
      result,
      ip_address,
      user_agent,
      details,
      created_at
     FROM auth_events
     WHERE ${whereClause}
     ORDER BY ${query.sortBy} ${query.sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, query.limit, query.offset]
  );

  // Redact email addresses for security
  const rows = dataResult.rows.map((row: Record<string, unknown>) => ({
    ...row,
    email: row.email ? maskEmail(row.email as string) : null,
  }));

  return { rows, totalCount };
}

/**
 * Query data access events
 */
async function queryDataAccessEvents(
  db: ReturnType<typeof createDatabaseClient>,
  query: AuditQuery
): Promise<{ rows: unknown[]; totalCount: number }> {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (query.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(query.userId);
  }

  if (query.event) {
    conditions.push(`access_type = $${paramIndex++}`);
    params.push(query.event);
  }

  if (query.startDate) {
    conditions.push(`accessed_at >= $${paramIndex++}`);
    params.push(query.startDate);
  }

  if (query.endDate) {
    conditions.push(`accessed_at <= $${paramIndex++}`);
    params.push(query.endDate);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM sensitive_data_access_log WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0]?.total ?? '0', 10);

  const dataResult = await db.query(
    `SELECT
      id,
      user_id,
      entity_type,
      entity_id,
      field_names,
      access_type,
      access_reason,
      ip_address,
      accessed_at
     FROM sensitive_data_access_log
     WHERE ${whereClause}
     ORDER BY accessed_at ${query.sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, query.limit, query.offset]
  );

  return { rows: dataResult.rows, totalCount };
}

/**
 * Query consent events
 */
async function queryConsentEvents(
  db: ReturnType<typeof createDatabaseClient>,
  query: AuditQuery
): Promise<{ rows: unknown[]; totalCount: number }> {
  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (query.event) {
    conditions.push(`consent_type = $${paramIndex++}`);
    params.push(query.event);
  }

  if (query.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(query.startDate);
  }

  if (query.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(query.endDate);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM consent_records WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0]?.total ?? '0', 10);

  const dataResult = await db.query(
    `SELECT
      id,
      phone,
      consent_type,
      granted,
      consent_version,
      source,
      ip_address,
      granted_at,
      withdrawn_at,
      created_at
     FROM consent_records
     WHERE ${whereClause}
     ORDER BY created_at ${query.sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, query.limit, query.offset]
  );

  return { rows: dataResult.rows, totalCount };
}

/**
 * Query admin events (placeholder - would need admin_events table)
 */
async function queryAdminEvents(
  db: ReturnType<typeof createDatabaseClient>,
  query: AuditQuery
): Promise<{ rows: unknown[]; totalCount: number }> {
  // Admin events are typically stored in auth_events with specific event types
  const conditions: string[] = [
    "event_type IN ('user_created', 'user_deleted', 'role_changed', 'settings_changed')",
  ];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (query.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(query.userId);
  }

  if (query.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(query.startDate);
  }

  if (query.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(query.endDate);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM auth_events WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0]?.total ?? '0', 10);

  const dataResult = await db.query(
    `SELECT
      id,
      user_id,
      event_type,
      result,
      details,
      ip_address,
      created_at
     FROM auth_events
     WHERE ${whereClause}
     ORDER BY created_at ${query.sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, query.limit, query.offset]
  );

  return { rows: dataResult.rows, totalCount };
}

/**
 * Query system events from domain_events
 */
async function querySystemEvents(
  db: ReturnType<typeof createDatabaseClient>,
  query: AuditQuery
): Promise<{ rows: unknown[]; totalCount: number }> {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (query.event) {
    conditions.push(`type = $${paramIndex++}`);
    params.push(query.event);
  }

  if (query.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(query.startDate);
  }

  if (query.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(query.endDate);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM domain_events WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0]?.total ?? '0', 10);

  const dataResult = await db.query(
    `SELECT
      id,
      type,
      aggregate_type,
      aggregate_id,
      correlation_id,
      processed_at,
      created_at
     FROM domain_events
     WHERE ${whereClause}
     ORDER BY created_at ${query.sortOrder}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, query.limit, query.offset]
  );

  return { rows: dataResult.rows, totalCount };
}

/**
 * Query all event types combined
 */
async function queryAllEvents(
  db: ReturnType<typeof createDatabaseClient>,
  query: AuditQuery
): Promise<{ rows: unknown[]; totalCount: number }> {
  // For combined view, we use a UNION approach
  // This is simplified - in production you'd want a materialized view

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (query.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(query.startDate);
  }

  if (query.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(query.endDate);
  }

  const whereClause = conditions.join(' AND ');

  // Combined query using UNION ALL
  const dataResult = await db.query(
    `
    (
      SELECT
        id,
        'auth' as category,
        event_type as event,
        user_id,
        result as status,
        ip_address,
        created_at
      FROM auth_events
      WHERE ${whereClause}
    )
    UNION ALL
    (
      SELECT
        id,
        'data_access' as category,
        access_type as event,
        user_id,
        'success' as status,
        ip_address,
        accessed_at as created_at
      FROM sensitive_data_access_log
      WHERE ${whereClause.replace('created_at', 'accessed_at')}
    )
    UNION ALL
    (
      SELECT
        id,
        'system' as category,
        type as event,
        NULL as user_id,
        CASE WHEN processed_at IS NOT NULL THEN 'processed' ELSE 'pending' END as status,
        NULL as ip_address,
        created_at
      FROM domain_events
      WHERE ${whereClause}
    )
    ORDER BY created_at ${query.sortOrder}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `,
    [...params, ...params, ...params, query.limit, query.offset]
  );

  // Get approximate total count
  const countResult = await db.query(
    `
    SELECT (
      (SELECT COUNT(*) FROM auth_events WHERE ${whereClause}) +
      (SELECT COUNT(*) FROM sensitive_data_access_log WHERE ${whereClause.replace('created_at', 'accessed_at')}) +
      (SELECT COUNT(*) FROM domain_events WHERE ${whereClause})
    ) as total
    `,
    [...params, ...params, ...params]
  );

  const totalCount = parseInt(countResult.rows[0]?.total ?? '0', 10);

  return { rows: dataResult.rows, totalCount };
}
