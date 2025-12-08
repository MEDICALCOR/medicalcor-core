'use server';

import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Clinic Management
 *
 * All actions require authentication and appropriate admin permissions.
 */

// =============================================================================
// Types
// =============================================================================

export type ClinicStatus = 'active' | 'inactive' | 'suspended';

export interface Clinic {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  status: ClinicStatus;
  hipaaCompliant: boolean;
  gdprCompliant: boolean;
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicStats {
  totalClinics: number;
  activeClinics: number;
  totalUsers: number;
}

interface ClinicRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  status: string;
  hipaa_compliant: boolean;
  gdpr_compliant: boolean;
  user_count: string;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateClinicSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('Romania'),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  taxId: z.string().optional(),
});

const UpdateClinicSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  taxId: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToClinic(row: ClinicRow): Clinic {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    country: row.country,
    phone: row.phone,
    email: row.email,
    taxId: row.tax_id,
    status: row.status as ClinicStatus,
    hipaaCompliant: row.hipaa_compliant,
    gdprCompliant: row.gdpr_compliant,
    userCount: parseInt(row.user_count, 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all clinics
 */
export async function getClinicsAction(): Promise<Clinic[]> {
  await requirePermission('clinics:read');

  const database = getDatabase();

  const result = await database.query<ClinicRow>(`
    SELECT
      c.id, c.name, c.address, c.city, c.country,
      c.phone, c.email, c.tax_id, c.status,
      c.hipaa_compliant, c.gdpr_compliant,
      c.created_at, c.updated_at,
      COALESCE(COUNT(u.id), 0) as user_count
    FROM clinics c
    LEFT JOIN users u ON u.clinic_id = c.id AND u.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
    GROUP BY c.id
    ORDER BY c.name ASC
  `);

  return result.rows.map(rowToClinic);
}

/**
 * Get clinic by ID
 */
export async function getClinicByIdAction(id: string): Promise<Clinic | null> {
  await requirePermission('clinics:read');

  const database = getDatabase();

  const result = await database.query<ClinicRow>(
    `SELECT
      c.id, c.name, c.address, c.city, c.country,
      c.phone, c.email, c.tax_id, c.status,
      c.hipaa_compliant, c.gdpr_compliant,
      c.created_at, c.updated_at,
      COALESCE(COUNT(u.id), 0) as user_count
    FROM clinics c
    LEFT JOIN users u ON u.clinic_id = c.id AND u.deleted_at IS NULL
    WHERE c.id = $1 AND c.deleted_at IS NULL
    GROUP BY c.id`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToClinic(result.rows[0]);
}

/**
 * Get the current user's clinic
 */
export async function getCurrentClinicAction(): Promise<Clinic | null> {
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    return null;
  }
  return getClinicByIdAction(user.clinicId);
}

/**
 * Get clinic statistics
 */
export async function getClinicStatsAction(): Promise<ClinicStats> {
  await requirePermission('clinics:read');

  const database = getDatabase();

  const result = await database.query<{
    total_clinics: string;
    active_clinics: string;
    total_users: string;
  }>(`
    SELECT
      COUNT(DISTINCT c.id) as total_clinics,
      COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active') as active_clinics,
      COUNT(DISTINCT u.id) as total_users
    FROM clinics c
    LEFT JOIN users u ON u.clinic_id = c.id AND u.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
  `);

  const stats = result.rows[0];
  return {
    totalClinics: parseInt(stats.total_clinics, 10),
    activeClinics: parseInt(stats.active_clinics, 10),
    totalUsers: parseInt(stats.total_users, 10),
  };
}

/**
 * Create a new clinic
 */
export async function createClinicAction(
  data: z.infer<typeof CreateClinicSchema>
): Promise<Clinic> {
  await requirePermission('clinics:write');

  const parsed = CreateClinicSchema.parse(data);
  const database = getDatabase();

  const result = await database.query<ClinicRow>(
    `INSERT INTO clinics (name, address, city, country, phone, email, tax_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING
       id, name, address, city, country,
       phone, email, tax_id, status,
       hipaa_compliant, gdpr_compliant,
       created_at, updated_at,
       0 as user_count`,
    [
      parsed.name,
      parsed.address ?? null,
      parsed.city ?? null,
      parsed.country,
      parsed.phone ?? null,
      parsed.email ?? null,
      parsed.taxId ?? null,
    ]
  );

  return rowToClinic(result.rows[0]);
}

/**
 * Update a clinic
 */
export async function updateClinicAction(
  data: z.infer<typeof UpdateClinicSchema>
): Promise<Clinic> {
  await requirePermission('clinics:write');

  const parsed = UpdateClinicSchema.parse(data);
  const database = getDatabase();

  const updates: string[] = [];
  const values: unknown[] = [];

  if (parsed.name !== undefined) {
    values.push(parsed.name);
    updates.push(`name = $${values.length}`);
  }
  if (parsed.address !== undefined) {
    values.push(parsed.address);
    updates.push(`address = $${values.length}`);
  }
  if (parsed.city !== undefined) {
    values.push(parsed.city);
    updates.push(`city = $${values.length}`);
  }
  if (parsed.country !== undefined) {
    values.push(parsed.country);
    updates.push(`country = $${values.length}`);
  }
  if (parsed.phone !== undefined) {
    values.push(parsed.phone);
    updates.push(`phone = $${values.length}`);
  }
  if (parsed.email !== undefined) {
    values.push(parsed.email);
    updates.push(`email = $${values.length}`);
  }
  if (parsed.taxId !== undefined) {
    values.push(parsed.taxId);
    updates.push(`tax_id = $${values.length}`);
  }
  if (parsed.status !== undefined) {
    values.push(parsed.status);
    updates.push(`status = $${values.length}`);
  }

  if (updates.length === 0) {
    throw new Error('No updates provided');
  }

  values.push(parsed.id);

  const result = await database.query<ClinicRow>(
    `UPDATE clinics
     SET ${updates.join(', ')}
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING
       id, name, address, city, country,
       phone, email, tax_id, status,
       hipaa_compliant, gdpr_compliant,
       created_at, updated_at,
       0 as user_count`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Clinic not found');
  }

  return rowToClinic(result.rows[0]);
}

/**
 * Delete a clinic (soft delete)
 */
export async function deleteClinicAction(id: string): Promise<boolean> {
  await requirePermission('clinics:delete');

  const database = getDatabase();

  const result = await database.query(
    `UPDATE clinics
     SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id]
  );

  return result.rows.length > 0;
}
