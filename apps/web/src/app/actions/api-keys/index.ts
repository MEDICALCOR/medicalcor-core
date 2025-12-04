'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, getCurrentUser } from '@/lib/auth/server-action-auth';
import crypto from 'crypto';

/**
 * Server Actions for API Key Management
 *
 * All actions require authentication and admin permissions.
 * API keys are hashed before storage for security.
 */

// Lazy-initialized database connection
let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface ApiKey {
  id: string;
  name: string;
  key: string; // Only shown once on creation, otherwise masked
  keyPrefix: string;
  type: 'production' | 'test';
  permissions: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  isActive: boolean;
  requestsToday: number;
  requestsTotal: number;
  dailyLimit: number;
}

export interface ApiKeyStats {
  activeKeys: number;
  totalRequestsToday: number;
  dailyLimit: number;
}

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  type: string;
  permissions: string[];
  created_at: Date;
  last_used_at: Date | null;
  is_active: boolean;
  requests_today: number;
  requests_total: number;
  daily_limit: number;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['production', 'test']),
  permissions: z.array(z.string()).min(1),
});

const UpdateApiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function generateApiKey(type: 'production' | 'test'): string {
  const prefix = type === 'production' ? 'pk_live_' : 'pk_test_';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}${randomBytes}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function maskApiKey(keyPrefix: string): string {
  return `${keyPrefix}...${crypto.randomBytes(4).toString('hex')}`;
}

function rowToApiKey(row: ApiKeyRow, fullKey?: string): ApiKey {
  return {
    id: row.id,
    name: row.name,
    key: fullKey ?? maskApiKey(row.key_prefix),
    keyPrefix: row.key_prefix,
    type: row.type as 'production' | 'test',
    permissions: row.permissions,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    isActive: row.is_active,
    requestsToday: row.requests_today,
    requestsTotal: Number(row.requests_total),
    dailyLimit: row.daily_limit,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all API keys for the current clinic
 */
export async function getApiKeysAction(): Promise<ApiKey[]> {
  await requirePermission('api_keys:read');
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<ApiKeyRow>(
    `SELECT
      id, name, key_prefix, type, permissions,
      created_at, last_used_at, is_active,
      requests_today, requests_total, daily_limit
    FROM api_keys
    WHERE clinic_id = $1 AND revoked_at IS NULL
    ORDER BY created_at DESC`,
    [user.clinicId]
  );

  return result.rows.map((row) => rowToApiKey(row));
}

/**
 * Get API key statistics
 */
export async function getApiKeyStatsAction(): Promise<ApiKeyStats> {
  await requirePermission('api_keys:read');
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<{
    active_keys: string;
    total_requests_today: string;
    daily_limit: number;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE is_active = true) as active_keys,
      COALESCE(SUM(requests_today), 0) as total_requests_today,
      COALESCE(MAX(daily_limit), 10000) as daily_limit
    FROM api_keys
    WHERE clinic_id = $1 AND revoked_at IS NULL`,
    [user.clinicId]
  );

  const stats = result.rows[0];
  return {
    activeKeys: parseInt(stats.active_keys, 10),
    totalRequestsToday: parseInt(stats.total_requests_today, 10),
    dailyLimit: stats.daily_limit,
  };
}

/**
 * Create a new API key
 * @returns The created API key with the full key (only shown once!)
 */
export async function createApiKeyAction(
  data: z.infer<typeof CreateApiKeySchema>
): Promise<ApiKey> {
  await requirePermission('api_keys:write');
  const user = await getCurrentUser();
  if (!user?.clinicId || !user?.id) {
    throw new Error('No clinic associated with user');
  }

  const parsed = CreateApiKeySchema.parse(data);
  const database = getDatabase();

  // Generate the actual key
  const fullKey = generateApiKey(parsed.type);
  const keyHash = hashApiKey(fullKey);
  const keyPrefix = fullKey.substring(0, 16);

  const result = await database.query<ApiKeyRow>(
    `INSERT INTO api_keys (
      clinic_id, created_by, name, key_hash, key_prefix, type, permissions
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      id, name, key_prefix, type, permissions,
      created_at, last_used_at, is_active,
      requests_today, requests_total, daily_limit`,
    [user.clinicId, user.id, parsed.name, keyHash, keyPrefix, parsed.type, parsed.permissions]
  );

  // Return with full key visible (only this one time!)
  return rowToApiKey(result.rows[0], fullKey);
}

/**
 * Update an API key (name or active status)
 */
export async function updateApiKeyAction(
  data: z.infer<typeof UpdateApiKeySchema>
): Promise<ApiKey> {
  await requirePermission('api_keys:write');
  const user = await getCurrentUser();
  if (!user?.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const parsed = UpdateApiKeySchema.parse(data);
  const database = getDatabase();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (parsed.name !== undefined) {
    values.push(parsed.name);
    updates.push(`name = $${values.length}`);
  }
  if (parsed.isActive !== undefined) {
    values.push(parsed.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    throw new Error('No updates provided');
  }

  values.push(parsed.id);
  values.push(user.clinicId);

  const result = await database.query<ApiKeyRow>(
    `UPDATE api_keys
     SET ${updates.join(', ')}
     WHERE id = $${values.length - 1} AND clinic_id = $${values.length}
     RETURNING
       id, name, key_prefix, type, permissions,
       created_at, last_used_at, is_active,
       requests_today, requests_total, daily_limit`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('API key not found');
  }

  return rowToApiKey(result.rows[0]);
}

/**
 * Toggle API key active status
 */
export async function toggleApiKeyAction(id: string, isActive: boolean): Promise<ApiKey> {
  return updateApiKeyAction({ id, isActive });
}

/**
 * Revoke (soft delete) an API key
 */
export async function revokeApiKeyAction(id: string, reason?: string): Promise<boolean> {
  await requirePermission('api_keys:delete');
  const user = await getCurrentUser();
  if (!user?.clinicId || !user?.id) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query(
    `UPDATE api_keys
     SET revoked_at = CURRENT_TIMESTAMP,
         revoked_by = $1,
         revoked_reason = $2,
         is_active = false
     WHERE id = $3 AND clinic_id = $4 AND revoked_at IS NULL
     RETURNING id`,
    [user.id, reason ?? 'Revoked by user', id, user.clinicId]
  );

  return result.rows.length > 0;
}

/**
 * Regenerate an API key (creates new key, revokes old one)
 */
export async function regenerateApiKeyAction(id: string): Promise<ApiKey> {
  await requirePermission('api_keys:write');
  const user = await getCurrentUser();
  if (!user?.clinicId || !user?.id) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  // Get existing key details
  const existing = await database.query<{ name: string; type: string; permissions: string[] }>(
    `SELECT name, type, permissions
     FROM api_keys
     WHERE id = $1 AND clinic_id = $2 AND revoked_at IS NULL`,
    [id, user.clinicId]
  );

  if (existing.rows.length === 0) {
    throw new Error('API key not found');
  }

  const { name, type, permissions } = existing.rows[0];

  // Revoke old key
  await revokeApiKeyAction(id, 'Regenerated');

  // Create new key with same settings
  return createApiKeyAction({
    name: `${name} (regenerat)`,
    type: type as 'production' | 'test',
    permissions,
  });
}
