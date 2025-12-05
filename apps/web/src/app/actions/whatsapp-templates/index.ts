'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for WhatsApp Template Management
 *
 * All actions require authentication and appropriate permissions.
 * Templates are synced with Meta/360dialog for approval.
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

export type TemplateCategory =
  | 'appointment'
  | 'reminder'
  | 'followup'
  | 'marketing'
  | 'utility'
  | 'authentication';
export type TemplateStatus = 'approved' | 'pending' | 'rejected' | 'disabled';

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  status: TemplateStatus;
  rejectionReason: string | null;
  language: string;
  content: string;
  variables: string[];
  headerType: string | null;
  headerContent: string | null;
  footer: string | null;
  buttons: unknown[] | null;
  externalTemplateId: string | null;
  lastUsedAt: Date | null;
  usageCount: number;
  successCount: number;
  failureCount: number;
  submittedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateStats {
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalUsage: number;
}

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  status: string;
  rejection_reason: string | null;
  language: string;
  content: string;
  variables: string[];
  header_type: string | null;
  header_content: string | null;
  footer: string | null;
  buttons: unknown[] | null;
  external_template_id: string | null;
  last_used_at: Date | null;
  usage_count: number;
  success_count: number;
  failure_count: number;
  submitted_at: Date | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z][a-z0-9_]*$/, {
      message:
        'Template name must be lowercase, start with a letter, and contain only letters, numbers, and underscores',
    }),
  category: z.enum([
    'appointment',
    'reminder',
    'followup',
    'marketing',
    'utility',
    'authentication',
  ]),
  language: z.string().min(2).max(5).default('ro'),
  content: z.string().min(1).max(1024),
  variables: z.array(z.string()).default([]),
  headerType: z.enum(['text', 'image', 'video', 'document']).optional(),
  headerContent: z.string().optional(),
  footer: z.string().max(60).optional(),
  buttons: z.array(z.unknown()).optional(),
});

const UpdateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  category: z
    .enum(['appointment', 'reminder', 'followup', 'marketing', 'utility', 'authentication'])
    .optional(),
  content: z.string().min(1).max(1024).optional(),
  variables: z.array(z.string()).optional(),
  footer: z.string().max(60).nullable().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToTemplate(row: TemplateRow): WhatsAppTemplate {
  return {
    id: row.id,
    name: row.name,
    category: row.category as TemplateCategory,
    status: row.status as TemplateStatus,
    rejectionReason: row.rejection_reason,
    language: row.language,
    content: row.content,
    variables: row.variables,
    headerType: row.header_type,
    headerContent: row.header_content,
    footer: row.footer,
    buttons: row.buttons,
    externalTemplateId: row.external_template_id,
    lastUsedAt: row.last_used_at,
    usageCount: row.usage_count,
    successCount: row.success_count,
    failureCount: row.failure_count,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\d+)\}\}/g) ?? [];
  return matches.map((m) => m.replace(/[{}]/g, ''));
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all WhatsApp templates for the current clinic
 */
export async function getWhatsAppTemplatesAction(): Promise<WhatsAppTemplate[]> {
  await requirePermission('whatsapp:read');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<TemplateRow>(
    `SELECT
      id, name, category, status, rejection_reason,
      language, content, variables,
      header_type, header_content, footer, buttons,
      external_template_id,
      last_used_at, usage_count, success_count, failure_count,
      submitted_at, approved_at, created_at, updated_at
    FROM whatsapp_templates
    WHERE clinic_id = $1
    ORDER BY created_at DESC`,
    [user.clinicId]
  );

  return result.rows.map(rowToTemplate);
}

/**
 * Get template statistics
 */
export async function getWhatsAppTemplateStatsAction(): Promise<TemplateStats> {
  await requirePermission('whatsapp:read');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<{
    approved_count: string;
    pending_count: string;
    rejected_count: string;
    total_usage: string;
  }>(
    `SELECT
      COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
      COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
      COALESCE(SUM(usage_count), 0) as total_usage
    FROM whatsapp_templates
    WHERE clinic_id = $1`,
    [user.clinicId]
  );

  const stats = result.rows[0];
  return {
    approvedCount: parseInt(stats.approved_count, 10),
    pendingCount: parseInt(stats.pending_count, 10),
    rejectedCount: parseInt(stats.rejected_count, 10),
    totalUsage: parseInt(stats.total_usage, 10),
  };
}

/**
 * Get template by ID
 */
export async function getWhatsAppTemplateByIdAction(id: string): Promise<WhatsAppTemplate | null> {
  await requirePermission('whatsapp:read');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<TemplateRow>(
    `SELECT
      id, name, category, status, rejection_reason,
      language, content, variables,
      header_type, header_content, footer, buttons,
      external_template_id,
      last_used_at, usage_count, success_count, failure_count,
      submitted_at, approved_at, created_at, updated_at
    FROM whatsapp_templates
    WHERE id = $1 AND clinic_id = $2`,
    [id, user.clinicId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToTemplate(result.rows[0]);
}

/**
 * Create a new WhatsApp template and submit for approval
 */
export async function createWhatsAppTemplateAction(
  data: z.infer<typeof CreateTemplateSchema>
): Promise<WhatsAppTemplate> {
  await requirePermission('whatsapp:write');
  const user = await requireCurrentUser();
  if (!user.clinicId || !user.id) {
    throw new Error('No clinic associated with user');
  }

  const parsed = CreateTemplateSchema.parse(data);
  const database = getDatabase();

  // Extract variables from content if not provided
  const variables =
    parsed.variables.length > 0 ? parsed.variables : extractVariables(parsed.content);

  const result = await database.query<TemplateRow>(
    `INSERT INTO whatsapp_templates (
      clinic_id, created_by, name, category, language, content,
      variables, header_type, header_content, footer, buttons,
      status, submitted_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', CURRENT_TIMESTAMP)
    RETURNING
      id, name, category, status, rejection_reason,
      language, content, variables,
      header_type, header_content, footer, buttons,
      external_template_id,
      last_used_at, usage_count, success_count, failure_count,
      submitted_at, approved_at, created_at, updated_at`,
    [
      user.clinicId,
      user.id,
      parsed.name,
      parsed.category,
      parsed.language,
      parsed.content,
      variables,
      parsed.headerType ?? null,
      parsed.headerContent ?? null,
      parsed.footer ?? null,
      parsed.buttons ? JSON.stringify(parsed.buttons) : null,
    ]
  );

  // TODO: Submit to Meta/360dialog API for approval
  // This would be done asynchronously via a job queue

  return rowToTemplate(result.rows[0]);
}

/**
 * Update a WhatsApp template (only allowed for pending/rejected templates)
 */
export async function updateWhatsAppTemplateAction(
  data: z.infer<typeof UpdateTemplateSchema>
): Promise<WhatsAppTemplate> {
  await requirePermission('whatsapp:write');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const parsed = UpdateTemplateSchema.parse(data);
  const database = getDatabase();

  // Check if template can be edited
  const existing = await database.query<{ status: string }>(
    `SELECT status FROM whatsapp_templates WHERE id = $1 AND clinic_id = $2`,
    [parsed.id, user.clinicId]
  );

  if (existing.rows.length === 0) {
    throw new Error('Template not found');
  }

  if (existing.rows[0].status === 'approved') {
    throw new Error('Cannot edit approved templates. Create a new template instead.');
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (parsed.name !== undefined) {
    values.push(parsed.name);
    updates.push(`name = $${values.length}`);
  }
  if (parsed.category !== undefined) {
    values.push(parsed.category);
    updates.push(`category = $${values.length}`);
  }
  if (parsed.content !== undefined) {
    values.push(parsed.content);
    updates.push(`content = $${values.length}`);
    // Re-extract variables
    const variables = extractVariables(parsed.content);
    values.push(variables);
    updates.push(`variables = $${values.length}`);
  }
  if (parsed.variables !== undefined) {
    values.push(parsed.variables);
    updates.push(`variables = $${values.length}`);
  }
  if (parsed.footer !== undefined) {
    values.push(parsed.footer);
    updates.push(`footer = $${values.length}`);
  }

  // Reset to pending status after edit
  updates.push(`status = 'pending'`);
  updates.push(`submitted_at = CURRENT_TIMESTAMP`);
  updates.push(`rejection_reason = NULL`);

  if (updates.length === 0) {
    throw new Error('No updates provided');
  }

  values.push(parsed.id);
  values.push(user.clinicId);

  const result = await database.query<TemplateRow>(
    `UPDATE whatsapp_templates
     SET ${updates.join(', ')}
     WHERE id = $${values.length - 1} AND clinic_id = $${values.length}
     RETURNING
       id, name, category, status, rejection_reason,
       language, content, variables,
       header_type, header_content, footer, buttons,
       external_template_id,
       last_used_at, usage_count, success_count, failure_count,
       submitted_at, approved_at, created_at, updated_at`,
    values
  );

  return rowToTemplate(result.rows[0]);
}

/**
 * Delete a WhatsApp template
 */
export async function deleteWhatsAppTemplateAction(id: string): Promise<boolean> {
  await requirePermission('whatsapp:delete');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query(
    `DELETE FROM whatsapp_templates WHERE id = $1 AND clinic_id = $2 RETURNING id`,
    [id, user.clinicId]
  );

  return result.rows.length > 0;
}

/**
 * Duplicate a template
 */
export async function duplicateWhatsAppTemplateAction(id: string): Promise<WhatsAppTemplate> {
  await requirePermission('whatsapp:write');
  const user = await requireCurrentUser();
  if (!user.clinicId || !user.id) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  const result = await database.query<TemplateRow>(
    `INSERT INTO whatsapp_templates (
      clinic_id, created_by, name, category, language, content,
      variables, header_type, header_content, footer, buttons,
      status
    )
    SELECT
      clinic_id, $1, name || '_copy', category, language, content,
      variables, header_type, header_content, footer, buttons,
      'pending'
    FROM whatsapp_templates
    WHERE id = $2 AND clinic_id = $3
    RETURNING
      id, name, category, status, rejection_reason,
      language, content, variables,
      header_type, header_content, footer, buttons,
      external_template_id,
      last_used_at, usage_count, success_count, failure_count,
      submitted_at, approved_at, created_at, updated_at`,
    [user.id, id, user.clinicId]
  );

  if (result.rows.length === 0) {
    throw new Error('Source template not found');
  }

  return rowToTemplate(result.rows[0]);
}
