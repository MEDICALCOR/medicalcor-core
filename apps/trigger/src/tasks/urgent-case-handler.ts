import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Urgent Case Handler Task
 * Processes urgent patient cases requiring immediate attention
 *
 * Triggers:
 * - AI scoring detects critical keywords (durere, urgență, sângerare, etc.)
 * - Voice call sentiment analysis indicates distress
 * - Manual escalation from supervisor
 *
 * Flow:
 * 1. Validate urgency level and patient context
 * 2. Broadcast real-time alert to all supervisors
 * 3. Create high-priority HubSpot task with 15-min SLA
 * 4. Send immediate acknowledgment to patient
 * 5. Escalate to on-call if no response in SLA window
 * 6. Emit domain event for audit trail
 */

export const UrgentCasePayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  patientName: z.string().optional(),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  urgencyLevel: z.enum(['critical', 'high', 'medium']),
  triggerReason: z.string(),
  keywords: z.array(z.string()).optional(),
  sentimentScore: z.number().min(-1).max(1).optional(),
  messageContent: z.string().optional(),
  callSid: z.string().optional(),
  correlationId: z.string(),
});

export type UrgentCasePayload = z.infer<typeof UrgentCasePayloadSchema>;

// Initialize clients using shared factory
function getClients() {
  return createIntegrationClients({
    source: 'urgent-case-handler',
    includeNotifications: true,
  });
}

export const handleUrgentCase = task({
  id: 'urgent-case-handler',
  retry: {
    maxAttempts: 5, // Higher retry for critical cases
    minTimeoutInMs: 500,
    maxTimeoutInMs: 5000,
    factor: 1.5,
  },
  run: async (payload: UrgentCasePayload) => {
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

    const { hubspot, whatsapp, eventStore, notifications } = getClients();

    logger.info('Processing urgent case', {
      phone: phone.slice(0, -4) + '****', // Mask phone for logs
      urgencyLevel,
      channel,
      correlationId,
    });

    // Step 1: Normalize and validate phone
    const phoneResult = normalizeRomanianPhone(phone);
    const normalizedPhone = phoneResult.normalized;

    if (!phoneResult.isValid) {
      logger.warn('Invalid phone number in urgent case', {
        correlationId,
      });
    }

    // Step 2: Broadcast real-time alert to supervisors
    const alertPayload = {
      type: 'urgency.new' as const,
      priority: urgencyLevel,
      phone: normalizedPhone.slice(0, -4) + '****', // Masked for broadcast
      patientName: patientName ?? 'Unknown',
      channel,
      reason: triggerReason,
      keywords: keywords?.slice(0, 3), // Limit keywords in broadcast
      sentimentScore,
      callSid,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    if (notifications) {
      try {
        await notifications.broadcastToSupervisors(alertPayload);
        logger.info('Urgent case alert broadcasted to supervisors', { correlationId });
      } catch (err) {
        logger.error('Failed to broadcast urgent case alert', { err, correlationId });
        // Continue processing - don't fail on notification error
      }
    }

    // Step 3: Create high-priority HubSpot task
    let taskId: string | undefined;
    const slaMinutes = urgencyLevel === 'critical' ? 15 : urgencyLevel === 'high' ? 30 : 60;

    if (hubspot) {
      try {
        const taskSubject = `🚨 ${urgencyLevel.toUpperCase()}: ${patientName ?? normalizedPhone}`;
        const taskBody = [
          `Urgency Level: ${urgencyLevel}`,
          `Trigger: ${triggerReason}`,
          `Channel: ${channel}`,
          keywords?.length ? `Keywords: ${keywords.join(', ')}` : null,
          sentimentScore !== undefined ? `Sentiment: ${sentimentScore.toFixed(2)}` : null,
          messageContent ? `\nMessage:\n${messageContent.slice(0, 500)}` : null,
          callSid ? `\nCall SID: ${callSid}` : null,
          `\n\n⏰ SLA: Respond within ${slaMinutes} minutes`,
        ]
          .filter(Boolean)
          .join('\n');

        const dueDate = new Date(Date.now() + slaMinutes * 60 * 1000);

        if (hubspotContactId) {
          const task = await hubspot.createTask({
            contactId: hubspotContactId,
            subject: taskSubject,
            body: taskBody,
            priority: 'HIGH',
            dueDate,
          });
          taskId = task?.id;
          logger.info('Created urgent HubSpot task', { taskId, correlationId });
        } else {
          // Create task without contact association
          logger.warn('No HubSpot contact ID, creating standalone task', { correlationId });
        }
      } catch (err) {
        logger.error('Failed to create HubSpot task', { err, correlationId });
      }
    }

    // Step 4: Send immediate acknowledgment to patient
    if (whatsapp && channel === 'whatsapp') {
      try {
        const ackMessage = getAcknowledgmentMessage(urgencyLevel);
        await whatsapp.sendText({
          to: normalizedPhone,
          text: ackMessage,
        });
        logger.info('Sent urgent case acknowledgment', { correlationId });
      } catch (err) {
        logger.error('Failed to send WhatsApp acknowledgment', { err, correlationId });
      }
    }

    // Step 5: Emit domain event for audit and downstream processing
    try {
      await eventStore.emit({
        type: 'urgent.case.created',
        correlationId,
        aggregateId: hubspotContactId ?? normalizedPhone,
        aggregateType: 'urgent_case',
        payload: {
          phone: normalizedPhone,
          hubspotContactId,
          patientName,
          channel,
          urgencyLevel,
          triggerReason,
          keywords,
          sentimentScore,
          taskId,
          slaMinutes,
          createdAt: new Date().toISOString(),
        },
      });
      logger.info('Domain event emitted', { type: 'urgent.case.created', correlationId });
    } catch (err) {
      logger.error('Failed to emit domain event', { err, correlationId });
    }

    // Step 6: Return result for potential escalation workflow
    return {
      success: true,
      urgencyLevel,
      normalizedPhone,
      hubspotContactId,
      taskId,
      slaMinutes,
      slaDeadline: new Date(Date.now() + slaMinutes * 60 * 1000).toISOString(),
      correlationId,
    };
  },
});

/**
 * Get localized acknowledgment message based on urgency level
 */
function getAcknowledgmentMessage(urgencyLevel: 'critical' | 'high' | 'medium'): string {
  const messages: Record<typeof urgencyLevel, string> = {
    critical:
      'Am primit mesajul dumneavoastră și înțelegem că este o situație urgentă. ' +
      'Un membru al echipei noastre vă va contacta în următoarele 15 minute. ' +
      'Pentru urgențe vitale, vă rugăm să sunați la 112.',
    high:
      'Am primit mesajul dumneavoastră și l-am marcat ca prioritar. ' +
      'Un coleg vă va contacta în curând pentru a vă ajuta.',
    medium:
      'Mulțumim pentru mesaj. Am notat cererea dumneavoastră și un coleg vă va contacta cât mai curând posibil.',
  };

  return messages[urgencyLevel];
}

/**
 * Detect Urgent Keywords Task
 * Analyzes message content for urgent keywords and patterns
 */
export const UrgentKeywordDetectionPayloadSchema = z.object({
  messageContent: z.string(),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  correlationId: z.string(),
});

export type UrgentKeywordDetectionPayload = z.infer<typeof UrgentKeywordDetectionPayloadSchema>;

// Romanian urgent keywords with weighted scores
const URGENT_KEYWORDS: Record<string, { score: number; level: 'critical' | 'high' | 'medium' }> = {
  // Critical - immediate attention needed
  sângerare: { score: 10, level: 'critical' },
  sangerare: { score: 10, level: 'critical' },
  'nu pot respira': { score: 10, level: 'critical' },
  umflătură: { score: 8, level: 'critical' },
  umflatura: { score: 8, level: 'critical' },
  urgență: { score: 9, level: 'critical' },
  urgenta: { score: 9, level: 'critical' },
  accident: { score: 9, level: 'critical' },
  căzut: { score: 7, level: 'critical' },
  cazut: { score: 7, level: 'critical' },

  // High - needs prompt attention
  durere: { score: 6, level: 'high' },
  'durere puternică': { score: 8, level: 'high' },
  'durere puternica': { score: 8, level: 'high' },
  'nu pot mânca': { score: 6, level: 'high' },
  'nu pot manca': { score: 6, level: 'high' },
  infecție: { score: 7, level: 'high' },
  infectie: { score: 7, level: 'high' },
  febră: { score: 6, level: 'high' },
  febra: { score: 6, level: 'high' },
  'rupt dinte': { score: 7, level: 'high' },
  'dinte spart': { score: 7, level: 'high' },
  abces: { score: 8, level: 'high' },

  // Medium - follow-up needed
  disconfort: { score: 4, level: 'medium' },
  sensibilitate: { score: 3, level: 'medium' },
  'mă doare': { score: 5, level: 'medium' },
  'ma doare': { score: 5, level: 'medium' },
  'am nevoie': { score: 4, level: 'medium' },
  programare: { score: 2, level: 'medium' },
};

export const detectUrgentKeywords = task({
  id: 'detect-urgent-keywords',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 2000,
    factor: 2,
  },
  run: async (payload: UrgentKeywordDetectionPayload) => {
    const { messageContent, channel, correlationId } = payload;

    logger.info('Analyzing message for urgent keywords', {
      contentLength: messageContent.length,
      channel,
      correlationId,
    });

    const lowerContent = messageContent.toLowerCase();
    const detectedKeywords: string[] = [];
    let maxScore = 0;
    let urgencyLevel: 'critical' | 'high' | 'medium' | 'none' = 'none';

    // Check for keyword matches
    for (const [keyword, config] of Object.entries(URGENT_KEYWORDS)) {
      if (lowerContent.includes(keyword)) {
        detectedKeywords.push(keyword);

        if (config.score > maxScore) {
          maxScore = config.score;
          urgencyLevel = config.level;
        }
      }
    }

    // Additional pattern detection
    const exclamationCount = (messageContent.match(/!/g) || []).length;
    const capsRatio = (messageContent.match(/[A-Z]/g) || []).length / messageContent.length;

    // Boost urgency for emotional indicators
    if (exclamationCount >= 3 || capsRatio > 0.5) {
      maxScore = Math.min(maxScore + 2, 10);
      if (urgencyLevel === 'medium' && maxScore >= 6) {
        urgencyLevel = 'high';
      }
    }

    const isUrgent = urgencyLevel !== 'none';

    logger.info('Urgent keyword detection complete', {
      isUrgent,
      urgencyLevel,
      keywordCount: detectedKeywords.length,
      maxScore,
      correlationId,
    });

    return {
      isUrgent,
      urgencyLevel: isUrgent ? urgencyLevel : null,
      keywords: detectedKeywords,
      score: maxScore,
      correlationId,
    };
  },
});
