import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import { IdempotencyKeys } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { handleUrgentCase, detectUrgentKeywords } from '../tasks/urgent-case-handler.js';

/**
 * Urgent Case Escalation Workflow
 * Orchestrates the full lifecycle of urgent patient cases
 *
 * Flow:
 * 1. Initial urgent case handling (task assignment, patient notification)
 * 2. SLA monitoring with automatic escalation
 * 3. Multi-tier escalation (supervisor → manager → on-call doctor)
 * 4. Resolution tracking and analytics
 */

// Initialize clients
function getClients() {
  return createIntegrationClients({
    source: 'urgent-case-workflow',
    includeNotifications: true,
    includeScheduling: true,
  });
}

// ============================================
// Urgent Case Escalation Workflow
// ============================================

export const UrgentCaseEscalationPayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  patientName: z.string().optional(),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  urgencyLevel: z.enum(['critical', 'high', 'medium']),
  triggerReason: z.string(),
  keywords: z.array(z.string()).optional(),
  sentimentScore: z.number().optional(),
  messageContent: z.string().optional(),
  callSid: z.string().optional(),
  correlationId: z.string(),
});

export type UrgentCaseEscalationPayload = z.infer<typeof UrgentCaseEscalationPayloadSchema>;

export const urgentCaseEscalationWorkflow = task({
  id: 'urgent-case-escalation-workflow',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: UrgentCaseEscalationPayload) => {
    const {
      phone,
      hubspotContactId,
      patientName,
      channel,
      urgencyLevel,
      triggerReason,
      keywords,
      sentimentScore,
      messageContent,
      callSid,
      correlationId,
    } = payload;

    const { hubspot, eventStore, notifications } = getClients();

    logger.info('Starting urgent case escalation workflow', {
      urgencyLevel,
      channel,
      correlationId,
    });

    // ============================================
    // Stage 1: Initial Urgent Case Handling
    // ============================================
    logger.info('Stage 1: Processing initial urgent case', { correlationId });

    // Trigger the urgent case handler
    const urgentCaseResult = await handleUrgentCase.triggerAndWait({
      phone,
      hubspotContactId,
      patientName,
      channel,
      urgencyLevel,
      triggerReason,
      keywords,
      sentimentScore,
      messageContent,
      callSid,
      correlationId: `${correlationId}_initial`,
    });

    if (!urgentCaseResult.ok) {
      logger.error('Initial urgent case handling failed', {
        error: urgentCaseResult.error,
        correlationId,
      });
      throw new Error('Failed to process initial urgent case');
    }

    const { taskId, slaMinutes, slaDeadline } = urgentCaseResult.output;

    logger.info('Initial urgent case processed', {
      taskId,
      slaMinutes,
      slaDeadline,
      correlationId,
    });

    // ============================================
    // Stage 2: SLA Monitoring
    // ============================================
    logger.info('Stage 2: Starting SLA monitoring', {
      slaMinutes,
      correlationId,
    });

    // Define escalation tiers based on urgency
    const escalationTiers = getEscalationTiers(urgencyLevel);
    let currentTier = 0;
    let resolved = false;
    let resolvedBy: string | undefined;
    let resolutionTime: Date | undefined;

    // Wait for first SLA window (50% of SLA time for first check)
    const firstCheckMinutes = Math.floor(slaMinutes * 0.5);
    await wait.for({ minutes: firstCheckMinutes });

    // Check if case was acknowledged
    if (hubspot && taskId) {
      try {
        const task = await hubspot.getTask(taskId);
        if (task?.status === 'COMPLETED' || task?.status === 'IN_PROGRESS') {
          resolved = task.status === 'COMPLETED';
          resolvedBy = task.assignedTo;
          resolutionTime = new Date();
          logger.info('Case acknowledged within first SLA window', {
            taskStatus: task.status,
            correlationId,
          });
        }
      } catch (err) {
        logger.warn('Failed to check task status', { err, correlationId });
      }
    }

    // ============================================
    // Stage 3: Escalation Loop
    // ============================================
    while (!resolved && currentTier < escalationTiers.length) {
      const tier = escalationTiers[currentTier];
      if (!tier) break;

      logger.info(`Stage 3: Escalation tier ${currentTier + 1}`, {
        tierName: tier.name,
        waitMinutes: tier.waitMinutes,
        correlationId,
      });

      // Broadcast escalation alert
      if (notifications) {
        try {
          await notifications.broadcastToSupervisors({
            type: 'urgency.escalated' as const,
            priority: urgencyLevel,
            escalationTier: currentTier + 1,
            tierName: tier.name,
            phone: phone.slice(0, -4) + '****',
            patientName: patientName ?? 'Unknown',
            channel,
            reason: triggerReason,
            originalTaskId: taskId,
            slaBreached: true,
            timestamp: new Date().toISOString(),
            correlationId,
          });
        } catch (err) {
          logger.error('Failed to broadcast escalation', { err, correlationId });
        }
      }

      // Create escalation task for this tier (only if we have a contact ID)
      if (hubspot && tier.assignTo && hubspotContactId) {
        try {
          const escTaskSubject = `⬆️ ESCALATED (Tier ${currentTier + 1}): ${patientName ?? phone}`;
          const escTaskBody = [
            `Original Case: ${triggerReason}`,
            `Urgency: ${urgencyLevel}`,
            `Escalation Tier: ${tier.name}`,
            `SLA Breached: Yes`,
            `\nOriginal Task ID: ${taskId ?? 'N/A'}`,
            `\nPlease respond immediately.`,
          ].join('\n');

          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: escTaskSubject,
            body: escTaskBody,
            priority: 'HIGH',
            dueDate: new Date(Date.now() + tier.waitMinutes * 60 * 1000),
            ownerId: tier.assignTo,
          });

          logger.info('Created escalation task', {
            tier: currentTier + 1,
            assignTo: tier.assignTo,
            correlationId,
          });
        } catch (err) {
          logger.error('Failed to create escalation task', { err, correlationId });
        }
      }

      // Emit escalation event
      await emitEvent(eventStore, 'urgent.case.escalated', hubspotContactId ?? phone, {
        phone,
        patientName,
        urgencyLevel,
        escalationTier: currentTier + 1,
        tierName: tier.name,
        correlationId,
      });

      // Wait for this tier's response window
      await wait.for({ minutes: tier.waitMinutes });

      // Check resolution
      if (hubspot && taskId && 'getTask' in hubspot) {
        try {
          const task = await (
            hubspot as unknown as {
              getTask: (id: string) => Promise<{ status: string; assignedTo?: string } | null>;
            }
          ).getTask(taskId);
          if (task?.status === 'COMPLETED') {
            resolved = true;
            resolvedBy = task.assignedTo;
            resolutionTime = new Date();
            logger.info('Case resolved during escalation', {
              tier: currentTier + 1,
              correlationId,
            });
            break;
          }
        } catch (err) {
          logger.warn('Failed to check task status during escalation', { err, correlationId });
        }
      }

      currentTier++;
    }

    // ============================================
    // Stage 4: Final Resolution or Critical Alert
    // ============================================
    if (!resolved) {
      logger.warn('Case not resolved after all escalation tiers', {
        tiersExhausted: escalationTiers.length,
        correlationId,
      });

      // Final critical broadcast
      if (notifications) {
        try {
          await notifications.broadcastToSupervisors({
            type: 'urgency.critical_unresolved' as const,
            priority: 'critical',
            phone: phone.slice(0, -4) + '****',
            patientName: patientName ?? 'Unknown',
            channel,
            reason: `UNRESOLVED AFTER ALL ESCALATION TIERS: ${triggerReason}`,
            escalationTiersExhausted: escalationTiers.length,
            timestamp: new Date().toISOString(),
            correlationId,
          });
        } catch (err) {
          logger.error('Failed to broadcast critical unresolved alert', { err, correlationId });
        }
      }

      // Emit unresolved event for analytics
      await emitEvent(eventStore, 'urgent.case.unresolved', hubspotContactId ?? phone, {
        phone,
        patientName,
        urgencyLevel,
        escalationTiersExhausted: escalationTiers.length,
        totalTimeMinutes: calculateElapsedMinutes(payload),
        correlationId,
      });
    } else {
      // Emit resolved event
      await emitEvent(eventStore, 'urgent.case.resolved', hubspotContactId ?? phone, {
        phone,
        patientName,
        urgencyLevel,
        resolvedBy,
        resolutionTime: resolutionTime?.toISOString(),
        escalationTierReached: currentTier,
        correlationId,
      });

      // Broadcast resolution
      if (notifications) {
        try {
          await notifications.broadcastToSupervisors({
            type: 'urgency.resolved' as const,
            priority: urgencyLevel,
            phone: phone.slice(0, -4) + '****',
            patientName: patientName ?? 'Unknown',
            resolvedBy,
            resolutionTime: resolutionTime?.toISOString(),
            timestamp: new Date().toISOString(),
            correlationId,
          });
        } catch (err) {
          logger.error('Failed to broadcast resolution', { err, correlationId });
        }
      }
    }

    logger.info('Urgent case escalation workflow completed', {
      resolved,
      escalationTierReached: currentTier,
      correlationId,
    });

    return {
      success: true,
      resolved,
      resolvedBy,
      resolutionTime: resolutionTime?.toISOString(),
      escalationTierReached: currentTier,
      correlationId,
    };
  },
});

// ============================================
// Message Urgency Detection Workflow
// ============================================

export const MessageUrgencyDetectionPayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  patientName: z.string().optional(),
  messageContent: z.string(),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  sentimentScore: z.number().optional(),
  callSid: z.string().optional(),
  correlationId: z.string(),
});

export type MessageUrgencyDetectionPayload = z.infer<typeof MessageUrgencyDetectionPayloadSchema>;

export const messageUrgencyDetectionWorkflow = task({
  id: 'message-urgency-detection-workflow',
  run: async (payload: MessageUrgencyDetectionPayload) => {
    const {
      phone,
      hubspotContactId,
      patientName,
      messageContent,
      channel,
      sentimentScore,
      callSid,
      correlationId,
    } = payload;

    logger.info('Starting message urgency detection', {
      contentLength: messageContent.length,
      channel,
      correlationId,
    });

    // Step 1: Detect urgent keywords
    const keywordResult = await detectUrgentKeywords.triggerAndWait({
      messageContent,
      channel,
      correlationId: `${correlationId}_keywords`,
      enableSentimentAnalysis: true,
    });

    if (!keywordResult.ok) {
      logger.error('Keyword detection failed', { error: keywordResult.error, correlationId });
      return { isUrgent: false, correlationId };
    }

    const { isUrgent, urgencyLevel, keywords, score } = keywordResult.output;

    // Step 2: Combine with sentiment analysis
    let finalUrgencyLevel = urgencyLevel;
    if (sentimentScore !== undefined && sentimentScore < -0.5) {
      // Negative sentiment elevates urgency
      if (urgencyLevel === 'medium' || urgencyLevel === null) {
        finalUrgencyLevel = 'high';
      } else if (urgencyLevel === 'high') {
        finalUrgencyLevel = 'critical';
      }
      logger.info('Urgency elevated due to negative sentiment', {
        originalLevel: urgencyLevel,
        finalLevel: finalUrgencyLevel,
        sentimentScore,
        correlationId,
      });
    }

    // Step 3: Trigger escalation workflow if urgent
    if (isUrgent && finalUrgencyLevel && finalUrgencyLevel !== 'none') {
      logger.info('Triggering urgent case escalation', {
        urgencyLevel: finalUrgencyLevel,
        correlationId,
      });

      const idempotencyKey = IdempotencyKeys.urgentCase(phone, correlationId);

      await urgentCaseEscalationWorkflow.trigger(
        {
          phone,
          hubspotContactId,
          patientName,
          channel,
          urgencyLevel: finalUrgencyLevel,
          triggerReason: `Detected keywords: ${keywords.join(', ') || 'sentiment analysis'}`,
          keywords,
          sentimentScore,
          messageContent,
          callSid,
          correlationId: `${correlationId}_escalation`,
        },
        { idempotencyKey }
      );
    }

    return {
      isUrgent,
      urgencyLevel: finalUrgencyLevel,
      keywords,
      score,
      escalationTriggered: isUrgent && !!finalUrgencyLevel,
      correlationId,
    };
  },
});

// ============================================
// Helper Functions
// ============================================

interface EscalationTier {
  name: string;
  waitMinutes: number;
  assignTo?: string;
}

/**
 * Get escalation tiers based on urgency level
 */
function getEscalationTiers(urgencyLevel: 'critical' | 'high' | 'medium'): EscalationTier[] {
  const tiers: Record<typeof urgencyLevel, EscalationTier[]> = {
    critical: [
      { name: 'Supervisor', waitMinutes: 5, assignTo: 'supervisor' },
      { name: 'Manager', waitMinutes: 10, assignTo: 'manager' },
      { name: 'On-Call Doctor', waitMinutes: 15, assignTo: 'on-call' },
    ],
    high: [
      { name: 'Supervisor', waitMinutes: 15, assignTo: 'supervisor' },
      { name: 'Manager', waitMinutes: 30, assignTo: 'manager' },
    ],
    medium: [{ name: 'Supervisor', waitMinutes: 30, assignTo: 'supervisor' }],
  };

  return tiers[urgencyLevel];
}

/**
 * Calculate elapsed minutes since workflow start
 */
function calculateElapsedMinutes(_payload: UrgentCaseEscalationPayload): number {
  // In a real implementation, this would track the actual start time
  // For now, return a placeholder
  return 0;
}

/**
 * Helper to emit domain events
 */
async function emitEvent(
  eventStore: {
    emit: (input: {
      type: string;
      correlationId: string;
      payload: Record<string, unknown>;
      aggregateId?: string;
      aggregateType?: string;
    }) => Promise<unknown>;
  },
  type: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || crypto.randomUUID();
  const aggregateType = type.split('.')[0];
  const input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateId?: string;
    aggregateType?: string;
  } = {
    type,
    correlationId,
    payload,
    aggregateId,
  };
  if (aggregateType) {
    input.aggregateType = aggregateType;
  }
  await eventStore.emit(input);
}
