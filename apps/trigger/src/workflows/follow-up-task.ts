/**
 * @fileoverview Follow-up Task Automation Workflows (M13)
 *
 * Trigger.dev workflows for automated follow-up task management.
 * Handles task creation, execution, escalation, and monitoring.
 *
 * @module trigger/workflows/follow-up-task
 */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import { IdempotencyKeys } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Initialize clients lazily using shared factory
 */
function getClients() {
  return createIntegrationClients({
    source: 'follow-up-task',
    includeScheduling: true,
    includeTemplateCatalog: true,
  });
}

// ============================================================================
// PAYLOAD SCHEMAS
// ============================================================================

/**
 * Payload for creating follow-up tasks
 */
export const CreateFollowUpTaskPayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  leadId: z.string().optional(),
  triggerType: z.enum([
    'lead_created',
    'lead_scored',
    'no_response',
    'message_received',
    'appointment_missed',
    'appointment_cancelled',
    'nurture_stage',
    'manual',
    'escalation',
    'schedule',
  ]),
  triggerEvent: z.string().optional(),
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
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
  scheduledFor: z.string(), // ISO date
  dueBy: z.string(), // ISO date
  slaMinutes: z.number().int().positive().default(60),
  maxAttempts: z.number().int().positive().default(3),
  leadScore: z.number().int().min(1).max(5).optional(),
  leadClassification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
  procedureInterest: z.array(z.string()).optional(),
  channel: z.enum(['whatsapp', 'voice', 'sms', 'email']).default('whatsapp'),
  preferredLanguage: z.enum(['ro', 'en', 'de']).default('ro'),
  assignTo: z.string().optional(),
  templateName: z.string().optional(),
  messageTemplate: z.string().optional(),
  correlationId: z.string(),
});

export type CreateFollowUpTaskPayload = z.infer<typeof CreateFollowUpTaskPayloadSchema>;

/**
 * Payload for executing follow-up tasks
 */
export const ExecuteFollowUpTaskPayloadSchema = z.object({
  taskId: z.string(),
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  taskType: z.string(),
  attemptNumber: z.number().int().positive().default(1),
  maxAttempts: z.number().int().positive().default(3),
  channel: z.enum(['whatsapp', 'voice', 'sms', 'email']).default('whatsapp'),
  messageTemplate: z.string().optional(),
  messageContent: z.string().optional(),
  preferredLanguage: z.enum(['ro', 'en', 'de']).default('ro'),
  leadClassification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
  correlationId: z.string(),
});

export type ExecuteFollowUpTaskPayload = z.infer<typeof ExecuteFollowUpTaskPayloadSchema>;

/**
 * Payload for escalating follow-up tasks
 */
export const EscalateFollowUpTaskPayloadSchema = z.object({
  taskId: z.string(),
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  originalTaskType: z.string(),
  originalTitle: z.string(),
  escalationReason: z.string(),
  attemptCount: z.number().int().default(0),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('urgent'),
  escalateTo: z.string().optional(),
  correlationId: z.string(),
});

export type EscalateFollowUpTaskPayload = z.infer<typeof EscalateFollowUpTaskPayloadSchema>;

/**
 * Payload for automation trigger processing
 */
export const ProcessAutomationTriggerPayloadSchema = z.object({
  triggerEvent: z.string(), // e.g., 'lead.scored', 'lead.created'
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  leadId: z.string().optional(),
  score: z.number().int().min(1).max(5).optional(),
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
  status: z.string().optional(),
  procedureInterest: z.array(z.string()).optional(),
  channel: z.enum(['whatsapp', 'voice', 'web']).optional(),
  preferredLanguage: z.enum(['ro', 'en', 'de']).default('ro'),
  eventPayload: z.record(z.unknown()).optional(),
  correlationId: z.string(),
});

export type ProcessAutomationTriggerPayload = z.infer<typeof ProcessAutomationTriggerPayloadSchema>;

// ============================================================================
// FOLLOW-UP TASK CREATION WORKFLOW
// ============================================================================

/**
 * Create Follow-up Task Workflow
 *
 * Creates and schedules a follow-up task with proper idempotency
 * and HubSpot integration.
 */
export const createFollowUpTaskWorkflow = task({
  id: 'create-follow-up-task',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: CreateFollowUpTaskPayload) => {
    const {
      phone,
      hubspotContactId,
      triggerType,
      taskType,
      title,
      description,
      priority,
      scheduledFor,
      dueBy,
      slaMinutes,
      maxAttempts,
      leadScore,
      leadClassification,
      procedureInterest,
      channel,
      preferredLanguage,
      assignTo,
      messageTemplate,
      correlationId,
    } = payload;

    const { hubspot, eventStore } = getClients();

    logger.info('Creating follow-up task', {
      phone,
      taskType,
      priority,
      classification: leadClassification,
      correlationId,
    });

    // Generate idempotency key
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`follow_up:${phone}:${taskType}:${correlationId}`)
      .digest('hex')
      .slice(0, 32);

    // Check for existing task (idempotency)
    const existingEvents = await eventStore.getByCorrelationId(
      `${correlationId}:task:${idempotencyKey}`
    );
    const taskAlreadyCreated = existingEvents.some(
      (e: { type: string }) => e.type === 'follow_up_task.created'
    );

    if (taskAlreadyCreated) {
      logger.info('Follow-up task already exists (idempotent)', {
        idempotencyKey,
        correlationId,
      });
      return {
        success: true,
        skipped: true,
        reason: 'Task already exists',
        idempotencyKey,
      };
    }

    // Create HubSpot task if priority is high/urgent
    if (hubspot && hubspotContactId && (priority === 'urgent' || priority === 'high')) {
      try {
        const taskBody = [
          `Follow-up task: ${title}`,
          description ? `\nDescription: ${description}` : '',
          leadScore ? `\nLead Score: ${leadScore}/5` : '',
          leadClassification ? `\nClassification: ${leadClassification}` : '',
          procedureInterest?.length ? `\nInterested in: ${procedureInterest.join(', ')}` : '',
        ].join('');

        await hubspot.createTask({
          contactId: hubspotContactId,
          subject: title,
          body: taskBody,
          priority: priority === 'urgent' ? 'HIGH' : 'MEDIUM',
          dueDate: new Date(dueBy),
        });

        logger.info('Created HubSpot task for follow-up', {
          hubspotContactId,
          priority,
          correlationId,
        });
      } catch (error) {
        logger.error('Failed to create HubSpot task', { error, correlationId });
        // Non-critical, continue with workflow
      }
    }

    // Emit task created event
    await eventStore.emit({
      type: 'follow_up_task.created',
      correlationId: `${correlationId}:task:${idempotencyKey}`,
      aggregateId: idempotencyKey,
      aggregateType: 'FollowUpTask',
      payload: {
        taskId: idempotencyKey,
        phone,
        hubspotContactId,
        triggerType,
        taskType,
        title,
        description,
        priority,
        scheduledFor,
        dueBy,
        slaMinutes,
        maxAttempts,
        leadScore,
        leadClassification,
        procedureInterest,
        channel,
        preferredLanguage,
        assignedTo: assignTo,
        createdBy: 'system',
      },
    });

    // Calculate delay until scheduled time
    const now = Date.now();
    const scheduledTime = new Date(scheduledFor).getTime();
    const delayMs = Math.max(0, scheduledTime - now);

    if (delayMs > 0) {
      logger.info('Scheduling task execution', {
        delayMinutes: Math.round(delayMs / 60000),
        scheduledFor,
        correlationId,
      });

      // Wait until scheduled time
      await wait.for({ seconds: Math.ceil(delayMs / 1000) });
    }

    // Trigger task execution
    await executeFollowUpTaskWorkflow.trigger(
      {
        taskId: idempotencyKey,
        phone,
        hubspotContactId,
        taskType,
        attemptNumber: 1,
        maxAttempts,
        channel,
        messageTemplate,
        preferredLanguage,
        leadClassification,
        correlationId: `${correlationId}_execute`,
      },
      {
        idempotencyKey: IdempotencyKeys.followUpTaskExecution(idempotencyKey, 1),
      }
    );

    logger.info('Follow-up task created and execution scheduled', {
      taskId: idempotencyKey,
      correlationId,
    });

    return {
      success: true,
      taskId: idempotencyKey,
      scheduledFor,
      channel,
    };
  },
});

// ============================================================================
// FOLLOW-UP TASK EXECUTION WORKFLOW
// ============================================================================

/**
 * Execute Follow-up Task Workflow
 *
 * Executes a follow-up task attempt (send message, make call, etc.)
 * Handles retries and escalation on failure.
 */
export const executeFollowUpTaskWorkflow = task({
  id: 'execute-follow-up-task',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: ExecuteFollowUpTaskPayload) => {
    const {
      taskId,
      phone,
      hubspotContactId,
      taskType,
      attemptNumber,
      maxAttempts,
      channel,
      messageTemplate,
      messageContent,
      preferredLanguage,
      leadClassification,
      correlationId,
    } = payload;

    const { whatsapp, hubspot, eventStore } = getClients();

    logger.info('Executing follow-up task', {
      taskId,
      phone,
      attemptNumber,
      maxAttempts,
      channel,
      correlationId,
    });

    let outcome: string = 'unknown';
    let success = false;

    try {
      // Execute based on channel
      if (channel === 'whatsapp' && whatsapp) {
        if (messageTemplate) {
          // Use template message
          await whatsapp.sendTemplate({
            to: phone,
            templateName: messageTemplate,
            language: preferredLanguage === 'ro' ? 'ro' : preferredLanguage === 'de' ? 'de' : 'en',
          });
        } else if (messageContent) {
          // Use text message
          await whatsapp.sendText({
            to: phone,
            text: messageContent,
          });
        } else {
          // Default follow-up message based on task type
          const defaultMessage = getDefaultFollowUpMessage(taskType, preferredLanguage, leadClassification);
          await whatsapp.sendText({
            to: phone,
            text: defaultMessage,
          });
        }
        outcome = 'message_sent';
        success = true;
        logger.info('WhatsApp message sent', { taskId, phone, correlationId });
      } else if (channel === 'voice') {
        // For voice, we create a task for agent to call
        // The actual call would be initiated by the agent or a separate voice workflow
        logger.info('Voice follow-up scheduled - awaiting agent action', {
          taskId,
          phone,
          correlationId,
        });
        outcome = 'call_scheduled';
        success = true;
      } else {
        logger.warn('Channel not configured or supported', { channel, correlationId });
        outcome = 'channel_unavailable';
      }

      // Update HubSpot timeline
      if (hubspot && hubspotContactId && success) {
        try {
          await hubspot.logMessageToTimeline({
            contactId: hubspotContactId,
            message: `Follow-up ${taskType} - Attempt ${attemptNumber}: ${outcome}`,
            direction: 'OUT',
            channel: channel,
            metadata: { taskId, attemptNumber, outcome },
          });
        } catch (error) {
          logger.error('Failed to update HubSpot timeline', { error, correlationId });
        }
      }

      // Emit attempt event
      await eventStore.emit({
        type: 'follow_up_task.attempted',
        correlationId,
        aggregateId: taskId,
        aggregateType: 'FollowUpTask',
        payload: {
          taskId,
          phone,
          attemptNumber,
          channel,
          outcome,
          success,
          performedBy: 'system',
        },
      });

      if (success) {
        // Mark as completed
        await eventStore.emit({
          type: 'follow_up_task.completed',
          correlationId,
          aggregateId: taskId,
          aggregateType: 'FollowUpTask',
          payload: {
            taskId,
            phone,
            hubspotContactId,
            outcome,
            completedAt: new Date().toISOString(),
            completedBy: 'system',
            attemptCount: attemptNumber,
          },
        });

        logger.info('Follow-up task completed successfully', {
          taskId,
          attemptNumber,
          outcome,
          correlationId,
        });

        return {
          success: true,
          taskId,
          outcome,
          attemptNumber,
        };
      }
    } catch (error) {
      logger.error('Follow-up task execution failed', {
        taskId,
        attemptNumber,
        error,
        correlationId,
      });
      outcome = 'error';
    }

    // Handle failure - schedule retry or escalate
    if (attemptNumber < maxAttempts) {
      // Calculate retry delay with exponential backoff
      const retryHours = Math.pow(2, attemptNumber) * 2; // 4h, 8h, 16h...
      const nextAttemptAt = new Date(Date.now() + retryHours * 60 * 60 * 1000);

      logger.info('Scheduling retry for follow-up task', {
        taskId,
        nextAttemptNumber: attemptNumber + 1,
        retryHours,
        nextAttemptAt: nextAttemptAt.toISOString(),
        correlationId,
      });

      await wait.for({ hours: retryHours });

      // Trigger next attempt
      await executeFollowUpTaskWorkflow.trigger(
        {
          ...payload,
          attemptNumber: attemptNumber + 1,
          correlationId: `${correlationId}_retry${attemptNumber + 1}`,
        },
        {
          idempotencyKey: IdempotencyKeys.followUpTaskExecution(taskId, attemptNumber + 1),
        }
      );

      return {
        success: false,
        taskId,
        outcome,
        attemptNumber,
        retryScheduled: true,
        nextAttemptAt: nextAttemptAt.toISOString(),
      };
    } else {
      // Max attempts reached - escalate
      logger.warn('Max attempts reached, escalating task', {
        taskId,
        attemptNumber,
        maxAttempts,
        correlationId,
      });

      await escalateFollowUpTaskWorkflow.trigger(
        {
          taskId,
          phone,
          hubspotContactId,
          originalTaskType: taskType,
          originalTitle: `Follow-up ${taskType}`,
          escalationReason: `Failed after ${maxAttempts} attempts. Last outcome: ${outcome}`,
          attemptCount: attemptNumber,
          priority: 'urgent',
          correlationId: `${correlationId}_escalate`,
        },
        {
          idempotencyKey: IdempotencyKeys.followUpTaskEscalation(taskId),
        }
      );

      // Emit failed event
      await eventStore.emit({
        type: 'follow_up_task.failed',
        correlationId,
        aggregateId: taskId,
        aggregateType: 'FollowUpTask',
        payload: {
          taskId,
          phone,
          failureReason: `Max attempts (${maxAttempts}) reached`,
          attemptCount: attemptNumber,
          maxAttempts,
          lastOutcome: outcome,
          failedAt: new Date().toISOString(),
          createEscalation: true,
        },
      });

      return {
        success: false,
        taskId,
        outcome,
        attemptNumber,
        escalated: true,
      };
    }
  },
});

// ============================================================================
// FOLLOW-UP TASK ESCALATION WORKFLOW
// ============================================================================

/**
 * Escalate Follow-up Task Workflow
 *
 * Creates an escalation task and notifies supervisors
 * when a follow-up task cannot be completed.
 */
export const escalateFollowUpTaskWorkflow = task({
  id: 'escalate-follow-up-task',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: EscalateFollowUpTaskPayload) => {
    const {
      taskId,
      phone,
      hubspotContactId,
      originalTaskType,
      originalTitle,
      escalationReason,
      attemptCount,
      priority,
      escalateTo,
      correlationId,
    } = payload;

    const { hubspot, eventStore } = getClients();

    logger.info('Escalating follow-up task', {
      taskId,
      phone,
      escalationReason,
      priority,
      correlationId,
    });

    // Generate escalation task ID
    const escalationTaskId = crypto
      .createHash('sha256')
      .update(`escalation:${taskId}:${correlationId}`)
      .digest('hex')
      .slice(0, 32);

    // Create HubSpot task for escalation
    if (hubspot && hubspotContactId) {
      try {
        await hubspot.createTask({
          contactId: hubspotContactId,
          subject: `ESCALATION: ${originalTitle}`,
          body: [
            `Original task failed after ${attemptCount} attempts.`,
            `\nReason: ${escalationReason}`,
            `\nOriginal task type: ${originalTaskType}`,
            `\nTask ID: ${taskId}`,
            `\n\nThis requires immediate attention.`,
          ].join(''),
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 30 * 60 * 1000), // Due in 30 minutes
        });

        logger.info('Created HubSpot escalation task', {
          hubspotContactId,
          escalationTaskId,
          correlationId,
        });
      } catch (error) {
        logger.error('Failed to create HubSpot escalation task', { error, correlationId });
      }
    }

    // Emit escalation event
    await eventStore.emit({
      type: 'follow_up_task.escalated',
      correlationId,
      aggregateId: taskId,
      aggregateType: 'FollowUpTask',
      payload: {
        taskId,
        phone,
        escalatedTo: escalateTo,
        escalationReason,
        escalatedAt: new Date().toISOString(),
        escalatedBy: 'auto',
        attemptCount,
        newTaskId: escalationTaskId,
        priority,
      },
    });

    logger.info('Follow-up task escalated', {
      originalTaskId: taskId,
      escalationTaskId,
      correlationId,
    });

    return {
      success: true,
      originalTaskId: taskId,
      escalationTaskId,
      priority,
    };
  },
});

// ============================================================================
// AUTOMATION TRIGGER PROCESSING WORKFLOW
// ============================================================================

/**
 * Process Automation Trigger Workflow
 *
 * Processes events and creates follow-up tasks based on automation rules.
 * Triggered by domain events like 'lead.scored', 'lead.created', etc.
 */
export const processAutomationTriggerWorkflow = task({
  id: 'process-automation-trigger',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: ProcessAutomationTriggerPayload) => {
    const {
      triggerEvent,
      phone,
      hubspotContactId,
      leadId,
      score,
      classification,
      status,
      procedureInterest,
      channel: _channel,
      preferredLanguage,
      correlationId,
    } = payload;

    const { eventStore } = getClients();

    logger.info('Processing automation trigger', {
      triggerEvent,
      phone,
      classification,
      score,
      correlationId,
    });

    // Define automation rules (in production, these would come from DB)
    const automationRules = getAutomationRules();

    // Find matching rules
    const matchingRules = automationRules.filter((rule) => {
      // Check trigger event
      if (rule.triggerEvent !== triggerEvent) return false;

      // Check classification condition
      if (rule.conditions.classification && classification) {
        if (!rule.conditions.classification.includes(classification)) return false;
      }

      // Check min score condition
      if (rule.conditions.minScore && score) {
        if (score < rule.conditions.minScore) return false;
      }

      // Check status condition
      if (rule.conditions.statuses && status) {
        if (!rule.conditions.statuses.includes(status)) return false;
      }

      return true;
    });

    if (matchingRules.length === 0) {
      logger.info('No matching automation rules found', {
        triggerEvent,
        classification,
        correlationId,
      });
      return {
        triggered: false,
        tasksCreated: 0,
        reason: 'No matching rules',
      };
    }

    logger.info(`Found ${matchingRules.length} matching automation rules`, {
      rules: matchingRules.map((r) => r.name),
      correlationId,
    });

    let tasksCreated = 0;
    const results: Array<{ ruleName: string; taskId?: string; error?: string }> = [];

    for (const rule of matchingRules) {
      try {
        // Calculate timing
        const scheduledFor = new Date(Date.now() + rule.delayMinutes * 60 * 1000);
        const dueBy = new Date(scheduledFor.getTime() + rule.slaMinutes * 60 * 1000);

        // Create follow-up task
        const result = await createFollowUpTaskWorkflow.trigger(
          {
            phone,
            hubspotContactId,
            leadId,
            triggerType: mapTriggerEvent(triggerEvent),
            triggerEvent,
            taskType: rule.taskType,
            title: rule.titleTemplate
              .replace('{{phone}}', phone)
              .replace('{{classification}}', classification ?? 'Unknown')
              .replace('{{score}}', score?.toString() ?? 'N/A'),
            description: rule.descriptionTemplate,
            priority: rule.priority,
            scheduledFor: scheduledFor.toISOString(),
            dueBy: dueBy.toISOString(),
            slaMinutes: rule.slaMinutes,
            maxAttempts: rule.maxAttempts,
            leadScore: score,
            leadClassification: classification,
            procedureInterest,
            channel: rule.channel,
            preferredLanguage,
            messageTemplate: rule.messageTemplate,
            correlationId: `${correlationId}_${rule.name}`,
          },
          {
            idempotencyKey: IdempotencyKeys.automationTrigger(
              phone,
              rule.name,
              correlationId
            ),
          }
        );

        tasksCreated++;
        results.push({ ruleName: rule.name, taskId: result.id });

        // Emit automation triggered event
        await eventStore.emit({
          type: 'follow_up_automation.triggered',
          correlationId,
          aggregateId: phone,
          aggregateType: 'FollowUpTask',
          payload: {
            ruleId: rule.name,
            ruleName: rule.name,
            triggerEvent,
            phone,
            hubspotContactId,
            leadClassification: classification,
            taskId: result.id,
            templateName: rule.messageTemplate,
            delayMinutes: rule.delayMinutes,
          },
        });

        logger.info('Automation rule triggered', {
          ruleName: rule.name,
          taskId: result.id,
          correlationId,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to create task from automation rule', {
          ruleName: rule.name,
          error: errorMessage,
          correlationId,
        });
        results.push({ ruleName: rule.name, error: errorMessage });
      }
    }

    logger.info('Automation trigger processing completed', {
      triggerEvent,
      rulesMatched: matchingRules.length,
      tasksCreated,
      correlationId,
    });

    return {
      triggered: true,
      tasksCreated,
      rulesMatched: matchingRules.length,
      results,
    };
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get default follow-up message based on task type
 */
function getDefaultFollowUpMessage(
  taskType: string,
  language: 'ro' | 'en' | 'de',
  _classification?: string
): string {
  const messages: Record<string, Record<string, string>> = {
    initial_contact: {
      ro: 'Bună ziua! Vă mulțumim pentru interesul acordat serviciilor noastre. Suntem aici să vă ajutăm cu orice întrebări.',
      en: 'Hello! Thank you for your interest in our services. We are here to help you with any questions.',
      de: 'Guten Tag! Vielen Dank für Ihr Interesse an unseren Dienstleistungen. Wir sind hier, um Ihnen bei Fragen zu helfen.',
    },
    follow_up_message: {
      ro: 'Bună ziua! Am dorit să verific dacă aveți întrebări suplimentare despre serviciile noastre.',
      en: 'Hello! Just wanted to check if you have any additional questions about our services.',
      de: 'Guten Tag! Wollte nur nachfragen, ob Sie weitere Fragen zu unseren Dienstleistungen haben.',
    },
    nurture_check: {
      ro: 'Bună ziua! Ne-am gândit la dumneavoastră și am dorit să știm dacă vă putem ajuta cu ceva.',
      en: 'Hello! We were thinking of you and wanted to know if we can help you with anything.',
      de: 'Guten Tag! Wir haben an Sie gedacht und wollten wissen, ob wir Ihnen bei etwas helfen können.',
    },
    appointment_booking: {
      ro: 'Bună ziua! Suntem pregătiți să vă programăm pentru o consultație. Când vă este convenabil?',
      en: 'Hello! We are ready to schedule your consultation. When would be convenient for you?',
      de: 'Guten Tag! Wir sind bereit, Ihren Beratungstermin zu vereinbaren. Wann passt es Ihnen?',
    },
    recall: {
      ro: 'Bună ziua! Au trecut câteva luni de la ultima dumneavoastră vizită. Vă recomandăm o programare de control.',
      en: 'Hello! It has been a few months since your last visit. We recommend a follow-up appointment.',
      de: 'Guten Tag! Es sind einige Monate seit Ihrem letzten Besuch vergangen. Wir empfehlen einen Nachsorgetermin.',
    },
  };

  const taskMessages = messages[taskType] ?? messages.follow_up_message;
  return taskMessages?.[language] ?? taskMessages?.ro ?? 'Hello!';
}

/**
 * Map trigger event to trigger type
 */
function mapTriggerEvent(
  triggerEvent: string
): 'lead_created' | 'lead_scored' | 'no_response' | 'message_received' | 'appointment_missed' | 'appointment_cancelled' | 'nurture_stage' | 'manual' | 'escalation' | 'schedule' {
  const mapping: Record<string, 'lead_created' | 'lead_scored' | 'no_response' | 'message_received' | 'appointment_missed' | 'appointment_cancelled' | 'nurture_stage' | 'manual' | 'escalation' | 'schedule'> = {
    'lead.created': 'lead_created',
    'lead.scored': 'lead_scored',
    'lead.message_received': 'message_received',
    'appointment.missed': 'appointment_missed',
    'appointment.cancelled': 'appointment_cancelled',
  };
  return mapping[triggerEvent] ?? 'schedule';
}

/**
 * Get automation rules
 * In production, these would come from the database
 */
interface AutomationRule {
  name: string;
  triggerEvent: string;
  conditions: {
    classification?: string[];
    minScore?: number;
    maxScore?: number;
    statuses?: string[];
  };
  taskType: 'initial_contact' | 'follow_up_call' | 'follow_up_message' | 'nurture_check' | 'appointment_booking' | 'post_consultation' | 'recall' | 'win_back' | 'escalation' | 'custom';
  titleTemplate: string;
  descriptionTemplate?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  delayMinutes: number;
  slaMinutes: number;
  maxAttempts: number;
  channel: 'whatsapp' | 'voice' | 'sms' | 'email';
  messageTemplate?: string;
}

function getAutomationRules(): AutomationRule[] {
  return [
    {
      name: 'hot_lead_immediate',
      triggerEvent: 'lead.scored',
      conditions: { classification: ['HOT'], minScore: 4 },
      taskType: 'initial_contact',
      titleTemplate: 'URGENT: Contact hot lead - {{phone}}',
      descriptionTemplate: 'High-intent lead requires immediate contact. Score: {{score}}/5',
      priority: 'urgent',
      delayMinutes: 0,
      slaMinutes: 30,
      maxAttempts: 3,
      channel: 'whatsapp',
      messageTemplate: 'hot_lead_priority',
    },
    {
      name: 'warm_lead_24h',
      triggerEvent: 'lead.scored',
      conditions: { classification: ['WARM'], minScore: 3 },
      taskType: 'follow_up_message',
      titleTemplate: 'Follow up with warm lead - {{phone}}',
      descriptionTemplate: 'Warm lead requires follow-up. Score: {{score}}/5',
      priority: 'high',
      delayMinutes: 1440, // 24 hours
      slaMinutes: 240,
      maxAttempts: 3,
      channel: 'whatsapp',
    },
    {
      name: 'cold_lead_nurture',
      triggerEvent: 'lead.scored',
      conditions: { classification: ['COLD'] },
      taskType: 'nurture_check',
      titleTemplate: 'Nurture check for lead - {{phone}}',
      descriptionTemplate: 'Cold lead nurture sequence milestone',
      priority: 'medium',
      delayMinutes: 2880, // 48 hours
      slaMinutes: 1440,
      maxAttempts: 3,
      channel: 'whatsapp',
    },
    {
      name: 'new_lead_welcome',
      triggerEvent: 'lead.created',
      conditions: {},
      taskType: 'initial_contact',
      titleTemplate: 'Welcome new lead - {{phone}}',
      descriptionTemplate: 'Send welcome message to new lead',
      priority: 'medium',
      delayMinutes: 5, // 5 minutes after creation
      slaMinutes: 60,
      maxAttempts: 2,
      channel: 'whatsapp',
    },
  ];
}
