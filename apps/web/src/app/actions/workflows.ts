'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission } from '@/lib/auth/server-action-auth';
import type {
  TriggerType,
  Workflow,
  WorkflowTemplate,
  WorkflowStep,
} from '@/lib/workflows/types';

/**
 * Server Actions for Workflow Management
 *
 * All actions require authentication and appropriate permissions.
 * Data is stored in PostgreSQL workflows table.
 */

// Lazy-initialized database connection
let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  if (!db) {
    db = createDatabaseClient();
  }
  return db;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const TriggerTypeSchema = z.enum([
  'new_lead',
  'appointment_scheduled',
  'appointment_completed',
  'no_response',
  'message_received',
  'tag_added',
  'status_changed',
]);

const WorkflowStepSchema: z.ZodType<WorkflowStep> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.enum(['action', 'condition', 'delay']),
    action: z
      .object({
        id: z.string(),
        type: z.enum([
          'send_whatsapp',
          'send_sms',
          'send_email',
          'add_tag',
          'remove_tag',
          'change_status',
          'assign_to',
          'create_task',
          'wait',
        ]),
        config: z.record(z.unknown()),
        delay: z
          .object({
            value: z.number(),
            unit: z.enum(['minutes', 'hours', 'days']),
          })
          .optional(),
      })
      .optional(),
    condition: z
      .object({
        conditions: z.array(
          z.object({
            id: z.string(),
            field: z.string(),
            operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']),
            value: z.union([z.string(), z.number(), z.boolean()]),
          })
        ),
        logic: z.enum(['and', 'or']),
        trueBranch: z.array(z.lazy(() => WorkflowStepSchema)).optional(),
        falseBranch: z.array(z.lazy(() => WorkflowStepSchema)).optional(),
      })
      .optional(),
    delay: z
      .object({
        value: z.number(),
        unit: z.enum(['minutes', 'hours', 'days']),
      })
      .optional(),
  })
);

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  triggerType: TriggerTypeSchema,
  triggerConfig: z.record(z.unknown()).optional(),
  steps: z.array(WorkflowStepSchema),
  isActive: z.boolean().default(false),
});

const UpdateWorkflowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  triggerType: TriggerTypeSchema.optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  steps: z.array(WorkflowStepSchema).optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// Database Row Types
// =============================================================================

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
  is_active: boolean;
  execution_count: number;
  last_executed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface WorkflowTemplateRow {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
}

// =============================================================================
// Transform Functions
// =============================================================================

function rowToWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    trigger: {
      id: `t-${row.id}`,
      type: row.trigger_type as TriggerType,
      config: row.trigger_config,
    },
    steps: row.steps,
    isActive: row.is_active,
    executionCount: row.execution_count,
    lastExecutedAt: row.last_executed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTemplate(row: WorkflowTemplateRow): WorkflowTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    trigger: {
      id: `t-${row.id}`,
      type: row.trigger_type as TriggerType,
      config: row.trigger_config,
    },
    steps: row.steps,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all workflows
 * @returns List of workflows sorted by creation date (newest first)
 */
export async function getWorkflowsAction(): Promise<Workflow[]> {
  await requirePermission('workflows:read');

  const database = getDatabase();

  const result = await database.query<WorkflowRow>(`
    SELECT
      id,
      name,
      description,
      trigger_type,
      trigger_config,
      steps,
      is_active,
      execution_count,
      last_executed_at,
      created_at,
      updated_at
    FROM workflows
    ORDER BY created_at DESC
  `);

  return result.rows.map(rowToWorkflow);
}

/**
 * Get workflow by ID
 * @param id - Workflow UUID
 * @returns Workflow or null if not found
 */
export async function getWorkflowByIdAction(id: string): Promise<Workflow | null> {
  await requirePermission('workflows:read');

  const database = getDatabase();

  const result = await database.query<WorkflowRow>(
    `SELECT
      id,
      name,
      description,
      trigger_type,
      trigger_config,
      steps,
      is_active,
      execution_count,
      last_executed_at,
      created_at,
      updated_at
    FROM workflows
    WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToWorkflow(result.rows[0]!);
}

/**
 * Create a new workflow
 * @param data - Workflow data
 * @returns Created workflow
 */
export async function createWorkflowAction(
  data: z.infer<typeof CreateWorkflowSchema>
): Promise<Workflow> {
  await requirePermission('workflows:write');

  const parsed = CreateWorkflowSchema.parse(data);
  const database = getDatabase();

  const result = await database.query<WorkflowRow>(
    `INSERT INTO workflows (
      name,
      description,
      trigger_type,
      trigger_config,
      steps,
      is_active
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id,
      name,
      description,
      trigger_type,
      trigger_config,
      steps,
      is_active,
      execution_count,
      last_executed_at,
      created_at,
      updated_at`,
    [
      parsed.name,
      parsed.description ?? null,
      parsed.triggerType,
      JSON.stringify(parsed.triggerConfig ?? {}),
      JSON.stringify(parsed.steps),
      parsed.isActive,
    ]
  );

  return rowToWorkflow(result.rows[0]!);
}

/**
 * Update an existing workflow
 * @param data - Workflow update data with ID
 * @returns Updated workflow
 */
export async function updateWorkflowAction(
  data: z.infer<typeof UpdateWorkflowSchema>
): Promise<Workflow> {
  await requirePermission('workflows:write');

  const parsed = UpdateWorkflowSchema.parse(data);
  const database = getDatabase();

  // Build dynamic update query
  const updates: string[] = [];
  const values: unknown[] = [];

  if (parsed.name !== undefined) {
    values.push(parsed.name);
    updates.push(`name = $${values.length}`);
  }
  if (parsed.description !== undefined) {
    values.push(parsed.description);
    updates.push(`description = $${values.length}`);
  }
  if (parsed.triggerType !== undefined) {
    values.push(parsed.triggerType);
    updates.push(`trigger_type = $${values.length}`);
  }
  if (parsed.triggerConfig !== undefined) {
    values.push(JSON.stringify(parsed.triggerConfig));
    updates.push(`trigger_config = $${values.length}`);
  }
  if (parsed.steps !== undefined) {
    values.push(JSON.stringify(parsed.steps));
    updates.push(`steps = $${values.length}`);
  }
  if (parsed.isActive !== undefined) {
    values.push(parsed.isActive);
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    // No updates, just fetch and return
    const existing = await getWorkflowByIdAction(parsed.id);
    if (!existing) {
      throw new Error('Workflow not found');
    }
    return existing;
  }

  values.push(parsed.id);
  const idParamIndex = values.length;

  const result = await database.query<WorkflowRow>(
    `UPDATE workflows
     SET ${updates.join(', ')}
     WHERE id = $${idParamIndex}
     RETURNING
       id, name, description, trigger_type, trigger_config,
       steps, is_active, execution_count, last_executed_at,
       created_at, updated_at`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Workflow not found');
  }

  return rowToWorkflow(result.rows[0]!);
}

/**
 * Toggle workflow active status
 * @param id - Workflow UUID
 * @param isActive - New active status
 * @returns Updated workflow
 */
export async function toggleWorkflowAction(id: string, isActive: boolean): Promise<Workflow> {
  await requirePermission('workflows:write');

  const database = getDatabase();

  const result = await database.query<WorkflowRow>(
    `UPDATE workflows
    SET is_active = $1
    WHERE id = $2
    RETURNING
      id,
      name,
      description,
      trigger_type,
      trigger_config,
      steps,
      is_active,
      execution_count,
      last_executed_at,
      created_at,
      updated_at`,
    [isActive, id]
  );

  if (result.rows.length === 0) {
    throw new Error('Workflow not found');
  }

  return rowToWorkflow(result.rows[0]!);
}

/**
 * Delete a workflow
 * @param id - Workflow UUID
 * @returns true if deleted, false if not found
 */
export async function deleteWorkflowAction(id: string): Promise<boolean> {
  await requirePermission('workflows:delete');

  const database = getDatabase();

  const result = await database.query(
    `DELETE FROM workflows WHERE id = $1 RETURNING id`,
    [id]
  );

  return result.rows.length > 0;
}

/**
 * Duplicate a workflow
 * @param id - Source workflow UUID
 * @returns New duplicated workflow
 */
export async function duplicateWorkflowAction(id: string): Promise<Workflow> {
  await requirePermission('workflows:write');

  const database = getDatabase();

  const result = await database.query<WorkflowRow>(
    `INSERT INTO workflows (name, description, trigger_type, trigger_config, steps, is_active)
    SELECT
      name || ' (Copie)',
      description,
      trigger_type,
      trigger_config,
      steps,
      false
    FROM workflows
    WHERE id = $1
    RETURNING
      id,
      name,
      description,
      trigger_type,
      trigger_config,
      steps,
      is_active,
      execution_count,
      last_executed_at,
      created_at,
      updated_at`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error('Source workflow not found');
  }

  return rowToWorkflow(result.rows[0]!);
}

/**
 * Get all workflow templates
 * @returns List of workflow templates
 */
export async function getWorkflowTemplatesAction(): Promise<WorkflowTemplate[]> {
  await requirePermission('workflows:read');

  const database = getDatabase();

  const result = await database.query<WorkflowTemplateRow>(`
    SELECT
      id,
      name,
      description,
      category,
      trigger_type,
      trigger_config,
      steps
    FROM workflow_templates
    ORDER BY category, name
  `);

  return result.rows.map(rowToTemplate);
}

/**
 * Create workflow from template
 * @param templateId - Template UUID
 * @returns New workflow based on template
 */
export async function createWorkflowFromTemplateAction(templateId: string): Promise<Workflow> {
  await requirePermission('workflows:write');

  const database = getDatabase();

  const result = await database.query<WorkflowRow>(
    `INSERT INTO workflows (name, description, trigger_type, trigger_config, steps, is_active)
    SELECT
      name,
      description,
      trigger_type,
      trigger_config,
      steps,
      false
    FROM workflow_templates
    WHERE id = $1
    RETURNING
      id,
      name,
      description,
      trigger_type,
      trigger_config,
      steps,
      is_active,
      execution_count,
      last_executed_at,
      created_at,
      updated_at`,
    [templateId]
  );

  if (result.rows.length === 0) {
    throw new Error('Template not found');
  }

  return rowToWorkflow(result.rows[0]!);
}

// =============================================================================
// Re-export types for client usage
// =============================================================================

export type { Workflow, WorkflowTemplate, WorkflowStep, TriggerType };
