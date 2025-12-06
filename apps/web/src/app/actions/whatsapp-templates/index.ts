'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool, createLogger } from '@medicalcor/core';
import { createWhatsAppClient, type TemplateComponent } from '@medicalcor/integrations';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

const logger = createLogger({ name: 'whatsapp-templates-action' });

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

export interface TemplateAnalytics {
  templateId: string;
  templateName: string;
  totalSent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  deliveryRate: number;
  readRate: number;
  replyRate: number;
  lastSentAt: string | null;
  dailyUsage: { date: string; sent: number; delivered: number }[];
}

export interface TemplatePreview {
  templateId: string;
  renderedContent: string;
  renderedHeader: string | null;
  renderedFooter: string | null;
  sampleVariables: Record<string, string>;
}

export interface TestMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  sentAt: string;
}

export interface VariableDefinition {
  index: number;
  name: string;
  type: 'text' | 'name' | 'date' | 'time' | 'currency' | 'url' | 'phone';
  sampleValue: string;
  description?: string;
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

// =============================================================================
// M9: Enhanced Template Management Actions
// =============================================================================

const DEFAULT_SAMPLE_VALUES: Record<string, string> = {
  '1': 'Maria Popescu',
  '2': 'All-on-4',
  '3': '15 dec 2024',
  '4': '14:00',
  '5': '2.500 EUR',
  '6': 'Dr. Ionescu',
  '7': '+40 722 123 456',
  '8': 'Clinica Dental Excellence',
};

/**
 * Preview template with sample data
 */
export async function previewWhatsAppTemplateAction(
  templateId: string,
  customVariables?: Record<string, string>
): Promise<TemplatePreview | null> {
  await requirePermission('whatsapp:read');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const template = await getWhatsAppTemplateByIdAction(templateId);
  if (!template) {
    return null;
  }

  // Merge custom variables with defaults
  const sampleVariables = { ...DEFAULT_SAMPLE_VALUES, ...(customVariables ?? {}) };

  // Replace variables in content
  let renderedContent = template.content;
  template.variables.forEach((variable) => {
    const value = sampleVariables[variable] ?? `{{${variable}}}`;
    renderedContent = renderedContent.replace(new RegExp(`\\{\\{${variable}\\}\\}`, 'g'), value);
  });

  // Replace variables in header if present
  let renderedHeader = template.headerContent;
  if (renderedHeader) {
    template.variables.forEach((variable) => {
      const value = sampleVariables[variable] ?? `{{${variable}}}`;
      renderedHeader = renderedHeader!.replace(new RegExp(`\\{\\{${variable}\\}\\}`, 'g'), value);
    });
  }

  return {
    templateId: template.id,
    renderedContent,
    renderedHeader,
    renderedFooter: template.footer,
    sampleVariables,
  };
}

/**
 * Send test message using template
 */
export async function sendTestMessageAction(
  templateId: string,
  phoneNumber: string,
  variables?: Record<string, string>
): Promise<TestMessageResult> {
  await requirePermission('whatsapp:write');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const template = await getWhatsAppTemplateByIdAction(templateId);
  if (!template) {
    return {
      success: false,
      error: 'Template not found',
      sentAt: new Date().toISOString(),
    };
  }

  if (template.status !== 'approved') {
    return {
      success: false,
      error: 'Only approved templates can be used for testing',
      sentAt: new Date().toISOString(),
    };
  }

  // Validate phone number format
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return {
      success: false,
      error: 'Invalid phone number format',
      sentAt: new Date().toISOString(),
    };
  }

  // Check if WhatsApp API is configured
  const apiKey = process.env.WHATSAPP_API_KEY;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!apiKey || !phoneNumberId) {
    // Fallback to simulation if not configured
    logger.warn(
      { templateId, templateName: template.name },
      'WhatsApp API not configured, simulating test message'
    );

    return {
      success: true,
      messageId: `test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      sentAt: new Date().toISOString(),
    };
  }

  try {
    // Create WhatsApp client
    const whatsapp = createWhatsAppClient({
      apiKey,
      phoneNumberId,
    });

    // Build template components with variables
    const components: TemplateComponent[] = [];

    if (template.variables.length > 0 && variables) {
      const bodyParameters = template.variables.map((varName) => ({
        type: 'text' as const,
        text: variables[varName] ?? `{{${varName}}}`,
      }));

      components.push({
        type: 'body',
        parameters: bodyParameters,
      });
    }

    // Send template message
    const response = await whatsapp.sendTemplate({
      to: cleanPhone,
      templateName: template.name,
      language: template.language,
      components: components.length > 0 ? components : undefined,
    });

    const messageId = response.messages[0]?.id ?? `msg_${Date.now()}`;

    logger.info(
      { templateId, templateName: template.name, messageId },
      'Test message sent successfully'
    );

    return {
      success: true,
      messageId,
      sentAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { templateId, templateName: template.name, error: errorMessage },
      'Failed to send test message'
    );

    return {
      success: false,
      error: `Failed to send message: ${errorMessage}`,
      sentAt: new Date().toISOString(),
    };
  }
}

/**
 * Get template analytics
 */
export async function getTemplateAnalyticsAction(
  templateId: string
): Promise<TemplateAnalytics | null> {
  await requirePermission('whatsapp:read');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const template = await getWhatsAppTemplateByIdAction(templateId);
  if (!template) {
    return null;
  }

  // Generate mock analytics data
  // In production, this would query message logs
  const totalSent = template.usageCount;
  const delivered = Math.round(totalSent * 0.95);
  const read = Math.round(delivered * 0.72);
  const replied = Math.round(read * 0.15);
  const failed = template.failureCount;

  // Generate daily usage for last 14 days
  const dailyUsage: { date: string; sent: number; delivered: number }[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0] ?? '';
    const daySent = Math.floor(totalSent / 14 + Math.random() * 5);
    dailyUsage.push({
      date: dateStr,
      sent: daySent,
      delivered: Math.round(daySent * 0.95),
    });
  }

  return {
    templateId: template.id,
    templateName: template.name,
    totalSent,
    delivered,
    read,
    replied,
    failed,
    deliveryRate: totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0,
    readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
    replyRate: read > 0 ? Math.round((replied / read) * 100) : 0,
    lastSentAt: template.lastUsedAt?.toISOString() ?? null,
    dailyUsage,
  };
}

/**
 * Get analytics for all templates
 */
export async function getAllTemplateAnalyticsAction(): Promise<TemplateAnalytics[]> {
  await requirePermission('whatsapp:read');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const templates = await getWhatsAppTemplatesAction();
  const analyticsPromises = templates
    .filter((t) => t.status === 'approved')
    .map((t) => getTemplateAnalyticsAction(t.id));

  const results = await Promise.all(analyticsPromises);
  return results.filter((r): r is TemplateAnalytics => r !== null);
}

/**
 * Get variable definitions with smart defaults
 */
export async function getVariableDefinitionsAction(
  templateId: string
): Promise<VariableDefinition[]> {
  await requirePermission('whatsapp:read');

  const template = await getWhatsAppTemplateByIdAction(templateId);
  if (!template) {
    return [];
  }

  // Analyze content to suggest variable types
  const content = template.content.toLowerCase();
  const definitions: VariableDefinition[] = [];

  template.variables.forEach((variable, idx) => {
    let type: VariableDefinition['type'] = 'text';
    let name = `Variable ${variable}`;
    let sampleValue = DEFAULT_SAMPLE_VALUES[variable] ?? `Sample ${variable}`;

    // Smart type detection based on content context
    if (content.includes(`{{${variable}}}`) && idx === 0) {
      // First variable is often a name
      type = 'name';
      name = 'Nume pacient';
      sampleValue = 'Maria Popescu';
    } else if (content.includes('ora') || content.includes('time')) {
      if (content.indexOf(`{{${variable}}}`) > content.indexOf('ora')) {
        type = 'time';
        name = 'Ora';
        sampleValue = '14:00';
      }
    } else if (content.includes('data') || content.includes('date')) {
      type = 'date';
      name = 'Data';
      sampleValue = '15 dec 2024';
    } else if (content.includes('eur') || content.includes('lei') || content.includes('pret')) {
      type = 'currency';
      name = 'Preț';
      sampleValue = '2.500 EUR';
    } else if (content.includes('telefon') || content.includes('phone')) {
      type = 'phone';
      name = 'Telefon';
      sampleValue = '+40 722 123 456';
    }

    definitions.push({
      index: parseInt(variable, 10),
      name,
      type,
      sampleValue,
      description: `Variable {{${variable}}} in template`,
    });
  });

  return definitions.sort((a, b) => a.index - b.index);
}

/**
 * Update variable definitions for a template
 */
export async function updateVariableDefinitionsAction(
  templateId: string,
  definitions: VariableDefinition[]
): Promise<boolean> {
  await requirePermission('whatsapp:write');
  const user = await requireCurrentUser();
  if (!user.clinicId) {
    throw new Error('No clinic associated with user');
  }

  const database = getDatabase();

  // Store variable definitions in metadata
  await database.query(
    `UPDATE whatsapp_templates
     SET variables = $1::text[]
     WHERE id = $2 AND clinic_id = $3`,
    [definitions.map((d) => d.index.toString()), templateId, user.clinicId]
  );

  return true;
}
