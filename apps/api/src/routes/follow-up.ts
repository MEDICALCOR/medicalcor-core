/**
 * @fileoverview Follow-up Task API Routes (M13)
 *
 * REST API endpoints for follow-up task management.
 * Supports task CRUD, actions, and queries.
 *
 * @module api/routes/follow-up
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
/* eslint-disable complexity */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ValidationError,
  toSafeErrorResponse,
  generateCorrelationId,
  normalizeRomanianPhone,
  createDatabaseClient,
} from '@medicalcor/core';
import { tasks } from '@trigger.dev/sdk/v3';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getCorrelationId(request: FastifyRequest): string {
  const header = request.headers['x-correlation-id'];
  return typeof header === 'string' ? header : generateCorrelationId();
}

function normalizePhoneInput(phone: string): string {
  const result = normalizeRomanianPhone(phone);
  if (!result.isValid) {
    throw new ValidationError('Invalid phone number format', {
      fieldErrors: { phone: ['Phone number must be a valid Romanian number'] },
      formErrors: [],
    });
  }
  return result.normalized;
}

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for creating a follow-up task
 */
const CreateFollowUpTaskSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string().optional(),
  leadId: z.string().optional(),
  taskType: z.enum([
    'initial_contact',
    'follow_up_call',
    'follow_up_message',
    'nurture_check',
    'appointment_booking',
    'post_consultation',
    'recall',
    'win_back',
    'escalation',
    'custom',
  ]),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
  scheduledFor: z.string().datetime(),
  dueBy: z.string().datetime(),
  slaMinutes: z.number().int().positive().default(60),
  maxAttempts: z.number().int().positive().max(10).default(3),
  channel: z.enum(['whatsapp', 'voice', 'sms', 'email']).default('whatsapp'),
  preferredLanguage: z.enum(['ro', 'en', 'de']).default('ro'),
  assignTo: z.string().uuid().optional(),
  leadScore: z.number().int().min(1).max(5).optional(),
  leadClassification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
  procedureInterest: z.array(z.string()).optional(),
  messageContent: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for updating a follow-up task
 */
const UpdateFollowUpTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  scheduledFor: z.string().datetime().optional(),
  dueBy: z.string().datetime().optional(),
  assignTo: z.string().uuid().optional(),
  channel: z.enum(['whatsapp', 'voice', 'sms', 'email']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for task action
 */
const TaskActionSchema = z.object({
  action: z.enum(['start', 'complete', 'escalate', 'skip', 'fail', 'reschedule', 'reassign']),
  outcome: z.string().optional(),
  notes: z.string().max(2000).optional(),
  escalationReason: z.string().max(1000).optional(),
  newAssigneeId: z.string().uuid().optional(),
  newScheduledFor: z.string().datetime().optional(),
  newDueBy: z.string().datetime().optional(),
});

/**
 * Schema for bulk action
 */
const BulkActionSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['complete', 'skip', 'escalate', 'reassign', 'reschedule']),
  outcome: z.string().optional(),
  notes: z.string().max(2000).optional(),
  newAssigneeId: z.string().uuid().optional(),
  newScheduledFor: z.string().datetime().optional(),
});

/**
 * Schema for task query parameters
 */
const TaskQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  taskType: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  hubspotContactId: z.string().optional(),
  isEscalated: z.enum(['true', 'false']).optional(),
  scheduledFrom: z.string().datetime().optional(),
  scheduledTo: z.string().datetime().optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  sortBy: z.enum(['scheduledFor', 'dueBy', 'priority', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

/**
 * Schema for triggering automation
 */
const TriggerAutomationSchema = z.object({
  triggerEvent: z.string().min(1),
  phone: z.string().min(1),
  hubspotContactId: z.string().optional(),
  leadId: z.string().optional(),
  score: z.number().int().min(1).max(5).optional(),
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
  status: z.string().optional(),
  procedureInterest: z.array(z.string()).optional(),
  channel: z.enum(['whatsapp', 'voice', 'web']).optional(),
  preferredLanguage: z.enum(['ro', 'en', 'de']).default('ro'),
});

// ============================================================================
// PLUGIN
// ============================================================================

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin pattern
export const followUpRoutes: FastifyPluginAsync = async (fastify) => {
  // ============================================
  // Task CRUD Endpoints
  // ============================================

  /**
   * Create a new follow-up task
   * POST /follow-up/tasks
   */
  fastify.post('/follow-up/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const parseResult = CreateFollowUpTaskSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError(
          'Invalid follow-up task data',
          {
            fieldErrors: parseResult.error.flatten().fieldErrors as Record<string, string[]>,
            formErrors: parseResult.error.flatten().formErrors,
          }
        );
        return reply.code(400).send(toSafeErrorResponse(error));
      }

      const data = parseResult.data;
      const normalizedPhone = normalizePhoneInput(data.phone);

      // Get database client
      const supabase = createDatabaseClient();

      // Create task
      const { data: task, error } = await supabase
        .from('follow_up_tasks')
        .insert({
          phone: normalizedPhone,
          hubspot_contact_id: data.hubspotContactId,
          lead_id: data.leadId,
          task_type: data.taskType,
          trigger_type: 'manual',
          title: data.title,
          description: data.description,
          priority: data.priority,
          scheduled_for: data.scheduledFor,
          due_by: data.dueBy,
          sla_minutes: data.slaMinutes,
          max_attempts: data.maxAttempts,
          channel: data.channel,
          preferred_language: data.preferredLanguage,
          assigned_to: data.assignTo,
          assigned_at: data.assignTo ? new Date().toISOString() : null,
          assigned_by: data.assignTo ? 'manual' : null,
          lead_score: data.leadScore,
          lead_classification: data.leadClassification,
          procedure_interest: data.procedureInterest,
          tags: data.tags ?? [],
          metadata: data.metadata ?? {},
          correlation_id: correlationId,
          created_by: 'api',
        })
        .select()
        .single();

      if (error) {
        request.log.error({ error, correlationId }, 'Failed to create follow-up task');
        return reply.code(500).send({
          error: 'Failed to create follow-up task',
          message: error.message,
        });
      }

      request.log.info({ taskId: task.id, correlationId }, 'Follow-up task created');

      return reply.code(201).send({
        success: true,
        task,
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error creating follow-up task');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  /**
   * List follow-up tasks
   * GET /follow-up/tasks
   */
  fastify.get('/follow-up/tasks', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const parseResult = TaskQuerySchema.safeParse(request.query);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid query parameters', {
          fieldErrors: parseResult.error.flatten().fieldErrors as Record<string, string[]>,
          formErrors: parseResult.error.flatten().formErrors,
        });
        return reply.code(400).send(toSafeErrorResponse(error));
      }

      const query = parseResult.data;

      // Get database client
      const supabase = createDatabaseClient();

      // Build query
      let dbQuery = supabase
        .from('follow_up_tasks')
        .select('*', { count: 'exact' })
        .is('deleted_at', null);

      // Apply filters
      if (query.status) {
        const statuses = query.status.split(',');
        dbQuery = dbQuery.in('status', statuses);
      }
      if (query.priority) {
        const priorities = query.priority.split(',');
        dbQuery = dbQuery.in('priority', priorities);
      }
      if (query.taskType) {
        const types = query.taskType.split(',');
        dbQuery = dbQuery.in('task_type', types);
      }
      if (query.assignedTo) {
        dbQuery = dbQuery.eq('assigned_to', query.assignedTo);
      }
      if (query.leadId) {
        dbQuery = dbQuery.eq('lead_id', query.leadId);
      }
      if (query.hubspotContactId) {
        dbQuery = dbQuery.eq('hubspot_contact_id', query.hubspotContactId);
      }
      if (query.isEscalated) {
        dbQuery = dbQuery.eq('is_escalated', query.isEscalated === 'true');
      }
      if (query.scheduledFrom) {
        dbQuery = dbQuery.gte('scheduled_for', query.scheduledFrom);
      }
      if (query.scheduledTo) {
        dbQuery = dbQuery.lte('scheduled_for', query.scheduledTo);
      }
      if (query.dueFrom) {
        dbQuery = dbQuery.gte('due_by', query.dueFrom);
      }
      if (query.dueTo) {
        dbQuery = dbQuery.lte('due_by', query.dueTo);
      }

      // Sorting
      const sortBy = query.sortBy ?? 'scheduled_for';
      const sortOrder = query.sortOrder ?? 'asc';
      dbQuery = dbQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      // Pagination
      const page = parseInt(query.page ?? '1', 10);
      const limit = Math.min(parseInt(query.limit ?? '20', 10), 100);
      const offset = (page - 1) * limit;
      dbQuery = dbQuery.range(offset, offset + limit - 1);

      const { data: tasks, count, error } = await dbQuery;

      if (error) {
        request.log.error({ error, correlationId }, 'Failed to list follow-up tasks');
        return reply.code(500).send({
          error: 'Failed to list follow-up tasks',
          message: error.message,
        });
      }

      return reply.send({
        success: true,
        tasks: tasks ?? [],
        pagination: {
          page,
          limit,
          total: count ?? 0,
          hasMore: (count ?? 0) > offset + limit,
        },
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error listing follow-up tasks');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  /**
   * Get a specific follow-up task
   * GET /follow-up/tasks/:id
   */
  fastify.get('/follow-up/tasks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    const { id } = request.params as { id: string };

    try {
      const supabase = createDatabaseClient();

      const { data: task, error } = await supabase
        .from('follow_up_tasks')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error || !task) {
        return reply.code(404).send({
          error: 'Task not found',
          taskId: id,
        });
      }

      return reply.send({
        success: true,
        task,
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error getting follow-up task');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  /**
   * Update a follow-up task
   * PATCH /follow-up/tasks/:id
   */
  fastify.patch('/follow-up/tasks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    const { id } = request.params as { id: string };

    try {
      const parseResult = UpdateFollowUpTaskSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid update data', {
          fieldErrors: parseResult.error.flatten().fieldErrors as Record<string, string[]>,
          formErrors: parseResult.error.flatten().formErrors,
        });
        return reply.code(400).send(toSafeErrorResponse(error));
      }

      const updates = parseResult.data;

      const supabase = createDatabaseClient();

      const { data: task, error } = await supabase
        .from('follow_up_tasks')
        .update({
          ...(updates.title && { title: updates.title }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.priority && { priority: updates.priority }),
          ...(updates.scheduledFor && { scheduled_for: updates.scheduledFor }),
          ...(updates.dueBy && { due_by: updates.dueBy }),
          ...(updates.assignTo && {
            assigned_to: updates.assignTo,
            assigned_at: new Date().toISOString(),
            assigned_by: 'api',
          }),
          ...(updates.channel && { channel: updates.channel }),
          ...(updates.tags && { tags: updates.tags }),
          ...(updates.metadata && { metadata: updates.metadata }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .is('deleted_at', null)
        .select()
        .single();

      if (error || !task) {
        return reply.code(404).send({
          error: 'Task not found or update failed',
          taskId: id,
        });
      }

      request.log.info({ taskId: id, correlationId }, 'Follow-up task updated');

      return reply.send({
        success: true,
        task,
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error updating follow-up task');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  /**
   * Delete a follow-up task (soft delete)
   * DELETE /follow-up/tasks/:id
   */
  fastify.delete('/follow-up/tasks/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    const { id } = request.params as { id: string };

    try {
      const supabase = createDatabaseClient();

      const { error } = await supabase
        .from('follow_up_tasks')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: 'api',
        })
        .eq('id', id)
        .is('deleted_at', null);

      if (error) {
        return reply.code(404).send({
          error: 'Task not found or already deleted',
          taskId: id,
        });
      }

      request.log.info({ taskId: id, correlationId }, 'Follow-up task deleted');

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error deleting follow-up task');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  // ============================================
  // Task Actions
  // ============================================

  /**
   * Perform an action on a follow-up task
   * POST /follow-up/tasks/:id/action
   */
  fastify.post('/follow-up/tasks/:id/action', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    const { id } = request.params as { id: string };

    try {
      const parseResult = TaskActionSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid action data', {
          fieldErrors: parseResult.error.flatten().fieldErrors as Record<string, string[]>,
          formErrors: parseResult.error.flatten().formErrors,
        });
        return reply.code(400).send(toSafeErrorResponse(error));
      }

      const actionData = parseResult.data;

      const supabase = createDatabaseClient();

      // Get current task
      const { data: currentTask, error: fetchError } = await supabase
        .from('follow_up_tasks')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (fetchError || !currentTask) {
        return reply.code(404).send({
          error: 'Task not found',
          taskId: id,
        });
      }

      interface TaskUpdate {
        status?: string;
        started_at?: string;
        completed_at?: string;
        outcome?: string;
        outcome_notes?: string;
        is_escalated?: boolean;
        escalated_at?: string;
        escalation_reason?: string;
        assigned_to?: string;
        assigned_at?: string;
        assigned_by?: string;
        scheduled_for?: string;
        due_by?: string;
        updated_at: string;
      }

      // Prepare update based on action
      const updates: TaskUpdate = {
        updated_at: new Date().toISOString(),
      };

      switch (actionData.action) {
        case 'start':
          updates.status = 'in_progress';
          updates.started_at = new Date().toISOString();
          break;

        case 'complete':
          updates.status = 'completed';
          updates.completed_at = new Date().toISOString();
          updates.outcome = actionData.outcome;
          updates.outcome_notes = actionData.notes;
          break;

        case 'escalate':
          updates.status = 'escalated';
          updates.is_escalated = true;
          updates.escalated_at = new Date().toISOString();
          updates.escalation_reason = actionData.escalationReason;
          break;

        case 'skip':
          updates.status = 'skipped';
          updates.outcome = 'skipped';
          updates.outcome_notes = actionData.notes;
          break;

        case 'fail':
          updates.status = 'failed';
          updates.outcome = 'failed';
          updates.outcome_notes = actionData.notes;
          break;

        case 'reschedule':
          if (actionData.newScheduledFor) {
            updates.scheduled_for = actionData.newScheduledFor;
          }
          if (actionData.newDueBy) {
            updates.due_by = actionData.newDueBy;
          }
          updates.status = 'pending';
          break;

        case 'reassign':
          if (actionData.newAssigneeId) {
            updates.assigned_to = actionData.newAssigneeId;
            updates.assigned_at = new Date().toISOString();
            updates.assigned_by = 'api';
          }
          break;

        default:
          break;
      }

      const { data: task, error } = await supabase
        .from('follow_up_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        request.log.error({ error, correlationId }, 'Failed to perform action');
        return reply.code(500).send({
          error: 'Failed to perform action',
          message: error.message,
        });
      }

      request.log.info(
        { taskId: id, action: actionData.action, correlationId },
        'Follow-up task action performed'
      );

      return reply.send({
        success: true,
        action: actionData.action,
        task,
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error performing task action');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  /**
   * Perform bulk action on multiple tasks
   * POST /follow-up/tasks/bulk-action
   */
  fastify.post('/follow-up/tasks/bulk-action', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const parseResult = BulkActionSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid bulk action data', {
          fieldErrors: parseResult.error.flatten().fieldErrors as Record<string, string[]>,
          formErrors: parseResult.error.flatten().formErrors,
        });
        return reply.code(400).send(toSafeErrorResponse(error));
      }

      const { taskIds, action, outcome, notes, newAssigneeId, newScheduledFor } = parseResult.data;

      const supabase = createDatabaseClient();

      interface BulkUpdate {
        status?: string;
        completed_at?: string;
        outcome?: string;
        outcome_notes?: string;
        is_escalated?: boolean;
        escalated_at?: string;
        assigned_to?: string;
        assigned_at?: string;
        assigned_by?: string;
        scheduled_for?: string;
        updated_at: string;
      }

      const updates: BulkUpdate = {
        updated_at: new Date().toISOString(),
      };

      switch (action) {
        case 'complete':
          updates.status = 'completed';
          updates.completed_at = new Date().toISOString();
          updates.outcome = outcome;
          updates.outcome_notes = notes;
          break;

        case 'skip':
          updates.status = 'skipped';
          updates.outcome = 'skipped';
          updates.outcome_notes = notes;
          break;

        case 'escalate':
          updates.status = 'escalated';
          updates.is_escalated = true;
          updates.escalated_at = new Date().toISOString();
          break;

        case 'reassign':
          if (newAssigneeId) {
            updates.assigned_to = newAssigneeId;
            updates.assigned_at = new Date().toISOString();
            updates.assigned_by = 'api';
          }
          break;

        case 'reschedule':
          if (newScheduledFor) {
            updates.scheduled_for = newScheduledFor;
            updates.status = 'pending';
          }
          break;

        default:
          break;
      }

      const { data, error } = await supabase
        .from('follow_up_tasks')
        .update(updates)
        .in('id', taskIds)
        .is('deleted_at', null)
        .select();

      if (error) {
        request.log.error({ error, correlationId }, 'Failed to perform bulk action');
        return reply.code(500).send({
          error: 'Failed to perform bulk action',
          message: error.message,
        });
      }

      request.log.info(
        { action, tasksUpdated: data?.length ?? 0, correlationId },
        'Bulk action performed'
      );

      return reply.send({
        success: true,
        action,
        tasksUpdated: data?.length ?? 0,
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error performing bulk action');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  // ============================================
  // Task History
  // ============================================

  /**
   * Get task history
   * GET /follow-up/tasks/:id/history
   */
  fastify.get('/follow-up/tasks/:id/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    const { id } = request.params as { id: string };

    try {
      const supabase = createDatabaseClient();

      const { data: history, error } = await supabase
        .from('follow_up_task_history')
        .select('*')
        .eq('task_id', id)
        .order('performed_at', { ascending: false });

      if (error) {
        request.log.error({ error, correlationId }, 'Failed to get task history');
        return reply.code(500).send({
          error: 'Failed to get task history',
          message: error.message,
        });
      }

      return reply.send({
        success: true,
        history: history ?? [],
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error getting task history');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  // ============================================
  // Automation
  // ============================================

  /**
   * Trigger automation for lead
   * POST /follow-up/automation/trigger
   */
  fastify.post('/follow-up/automation/trigger', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const parseResult = TriggerAutomationSchema.safeParse(request.body);

      if (!parseResult.success) {
        const error = new ValidationError('Invalid automation trigger data', {
          fieldErrors: parseResult.error.flatten().fieldErrors as Record<string, string[]>,
          formErrors: parseResult.error.flatten().formErrors,
        });
        return reply.code(400).send(toSafeErrorResponse(error));
      }

      const data = parseResult.data;
      const normalizedPhone = normalizePhoneInput(data.phone);

      // Trigger the automation workflow
      const handle = await tasks.trigger('process-automation-trigger', {
        triggerEvent: data.triggerEvent,
        phone: normalizedPhone,
        hubspotContactId: data.hubspotContactId,
        leadId: data.leadId,
        score: data.score,
        classification: data.classification,
        status: data.status,
        procedureInterest: data.procedureInterest,
        channel: data.channel,
        preferredLanguage: data.preferredLanguage,
        correlationId,
      });

      request.log.info(
        { triggerEvent: data.triggerEvent, phone: normalizedPhone, runId: handle.id, correlationId },
        'Automation trigger initiated'
      );

      return reply.code(202).send({
        success: true,
        message: 'Automation trigger initiated',
        runId: handle.id,
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error triggering automation');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  // ============================================
  // Templates & Rules
  // ============================================

  /**
   * List follow-up templates
   * GET /follow-up/templates
   */
  fastify.get('/follow-up/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const supabase = createDatabaseClient();

      const { data: templates, error } = await supabase
        .from('follow_up_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        request.log.error({ error, correlationId }, 'Failed to list templates');
        return reply.code(500).send({
          error: 'Failed to list templates',
          message: error.message,
        });
      }

      return reply.send({
        success: true,
        templates: templates ?? [],
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error listing templates');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  /**
   * List automation rules
   * GET /follow-up/rules
   */
  fastify.get('/follow-up/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const supabase = createDatabaseClient();

      const { data: rules, error } = await supabase
        .from('follow_up_automation_rules')
        .select('*')
        .eq('is_active', true)
        .order('priority_order');

      if (error) {
        request.log.error({ error, correlationId }, 'Failed to list rules');
        return reply.code(500).send({
          error: 'Failed to list rules',
          message: error.message,
        });
      }

      return reply.send({
        success: true,
        rules: rules ?? [],
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error listing rules');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });

  // ============================================
  // Metrics
  // ============================================

  /**
   * Get follow-up task metrics
   * GET /follow-up/metrics
   */
  fastify.get('/follow-up/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);

    try {
      const supabase = createDatabaseClient();

      // Get today's metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: tasks } = await supabase
        .from('follow_up_tasks')
        .select('status, priority, is_escalated')
        .gte('created_at', today.toISOString())
        .is('deleted_at', null);

      interface MetricsTask {
        status: string;
        priority: string;
        is_escalated: boolean;
      }

      const taskList = (tasks ?? []) as MetricsTask[];

      const metrics = {
        today: {
          total: taskList.length,
          pending: taskList.filter((t) => t.status === 'pending').length,
          inProgress: taskList.filter((t) => t.status === 'in_progress').length,
          completed: taskList.filter((t) => t.status === 'completed').length,
          escalated: taskList.filter((t) => t.is_escalated).length,
          failed: taskList.filter((t) => t.status === 'failed').length,
          byPriority: {
            urgent: taskList.filter((t) => t.priority === 'urgent').length,
            high: taskList.filter((t) => t.priority === 'high').length,
            medium: taskList.filter((t) => t.priority === 'medium').length,
            low: taskList.filter((t) => t.priority === 'low').length,
          },
        },
      };

      return reply.send({
        success: true,
        metrics,
        correlationId,
      });
    } catch (error) {
      request.log.error({ error, correlationId }, 'Error getting metrics');
      return reply.code(500).send(toSafeErrorResponse(error as Error));
    }
  });
};
