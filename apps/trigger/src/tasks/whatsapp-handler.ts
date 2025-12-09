import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone, LeadContextBuilder } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import {
  syncHubSpotContact,
  logMessageToTimeline,
  updateContactScore,
  handleConsentFlow,
  routeByScore,
  emitMessageReceivedEvent,
  emitStatusUpdatedEvent,
  type HandlerContext,
  type ScoreResult,
} from './whatsapp/index.js';

/**
 * WhatsApp Message Handler Task
 * Processes incoming WhatsApp messages through the lead pipeline
 *
 * Flow:
 * 1. Normalize phone number
 * 2. Sync contact to HubSpot (upsert)
 * 3. Log message to HubSpot timeline
 * 4. AI Score the lead
 * 5. Route based on score (HOT = task + template, else AI reply)
 * 6. Emit domain event
 */

export const WhatsAppMessagePayloadSchema = z.object({
  message: z.object({
    id: z.string(),
    from: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
  }),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(),
  }),
  contact: z
    .object({
      profile: z.object({ name: z.string() }),
      wa_id: z.string(),
    })
    .optional(),
  correlationId: z.string(),
});

export type WhatsAppMessagePayload = z.infer<typeof WhatsAppMessagePayloadSchema>;

// Initialize clients using shared factory
function getClients() {
  return createIntegrationClients({
    source: 'whatsapp-handler',
    includeOpenAI: true,
    includeScoring: true,
    includeConsent: true,
  });
}

/**
 * Build LeadContext from WhatsApp message payload
 */
function buildLeadContext(payload: WhatsAppMessagePayload, hubspotContactId: string | undefined) {
  const { message, metadata, contact, correlationId } = payload;

  const waMessage: { id: string; body?: string; type?: string; timestamp?: string } = {
    id: message.id,
    type: message.type,
    timestamp: message.timestamp,
  };
  if (message.text?.body) {
    waMessage.body = message.text.body;
  }

  const waInput: Parameters<typeof LeadContextBuilder.fromWhatsApp>[0] = {
    from: message.from,
    message: waMessage,
    metadata: {
      phone_number_id: metadata.phone_number_id,
      display_phone_number: metadata.display_phone_number,
    },
  };
  if (contact) {
    waInput.contact = { name: contact.profile.name, wa_id: contact.wa_id };
  }

  const builder = LeadContextBuilder.fromWhatsApp(waInput).withCorrelationId(correlationId);

  if (hubspotContactId) {
    builder.withHubSpotContact(hubspotContactId);
  }

  return builder.buildForScoring();
}

/**
 * Score the lead message using AI or fallback to rule-based scoring
 */
async function scoreLeadMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scoring: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leadContext: any,
  correlationId: string
) {
  if (!scoring) {
    logger.error('Scoring service not available', { correlationId });
    throw new Error('Scoring service not configured');
  }

  try {
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    const scoreResult: ScoreResult = await scoring.scoreMessage(leadContext);
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
    logger.info('Lead scored', {
      score: scoreResult.score,
      classification: scoreResult.classification,
      confidence: scoreResult.confidence,
      correlationId,
    });
    return scoreResult;
  } catch (err) {
    logger.error('Failed to score lead', { err, correlationId });
    // Fallback to rule-based scoring
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    return scoring.ruleBasedScore(leadContext) as ScoreResult;
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }
}

export const handleWhatsAppMessage = task({
  id: 'whatsapp-message-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: WhatsAppMessagePayload) => {
    const { message, metadata, contact, correlationId } = payload;
    const clients = getClients();
    const { hubspot, whatsapp, openai, scoring, eventStore, consent } = clients;

    logger.info('Processing WhatsApp message', {
      messageId: message.id,
      type: message.type,
      correlationId,
    });

    // Step 1: Normalize phone number
    const phoneResult = normalizeRomanianPhone(message.from);
    const normalizedPhone = phoneResult.normalized;
    logger.info('Phone normalized', { isValid: phoneResult.isValid, correlationId });

    // Step 2: Sync contact to HubSpot
    const { contactId: hubspotContactId } = await syncHubSpotContact(
      hubspot,
      normalizedPhone,
      contact?.profile.name,
      correlationId
    );

    // Step 3: Log message to HubSpot timeline
    const messageBody = message.text?.body ?? '[Media message]';
    await logMessageToTimeline(hubspot, hubspotContactId, messageBody, message.id, correlationId);

    // Step 4: GDPR Consent Check & Recording
    const consentResult = await handleConsentFlow(
      consent,
      whatsapp,
      message.text?.body ?? '',
      hubspotContactId,
      normalizedPhone,
      correlationId
    );

    if (consentResult.consentDenied) {
      return {
        success: true,
        messageId: message.id,
        normalizedPhone,
        hubspotContactId,
        consentDenied: true,
      };
    }

    // Step 5: AI Scoring
    const leadContext = buildLeadContext(payload, hubspotContactId);
    const scoreResult = await scoreLeadMessage(scoring, leadContext, correlationId);

    // Build handler context for downstream operations
    const handlerContext: HandlerContext = {
      correlationId,
      normalizedPhone,
      hubspotContactId,
      contactName: contact?.profile.name,
      messageId: message.id,
      messageBody: message.text?.body ?? '',
    };

    // Step 6: Route based on score
    await routeByScore(scoreResult, leadContext, handlerContext, { hubspot, whatsapp, openai });

    // Step 7: Update HubSpot contact with score
    await updateContactScore(
      hubspot,
      hubspotContactId,
      scoreResult.score,
      scoreResult.classification,
      correlationId
    );

    // Step 8: Emit domain event
    await emitMessageReceivedEvent(eventStore, correlationId, {
      messageId: message.id,
      normalizedPhone,
      phoneNumberId: metadata.phone_number_id,
      messageType: message.type,
      contactName: contact?.profile.name,
      scoreResult,
      hubspotContactId,
    });

    return {
      success: true,
      messageId: message.id,
      normalizedPhone,
      hubspotContactId,
      score: scoreResult.score,
      classification: scoreResult.classification,
    };
  },
});

/**
 * WhatsApp Status Handler Task
 * Processes message delivery status updates
 */
export const WhatsAppStatusPayloadSchema = z.object({
  messageId: z.string(),
  status: z.string(),
  recipientId: z.string(),
  timestamp: z.string(),
  errors: z
    .array(
      z.object({
        code: z.number(),
        title: z.string(),
      })
    )
    .optional(),
  correlationId: z.string(),
});

export type WhatsAppStatusPayload = z.infer<typeof WhatsAppStatusPayloadSchema>;

export const handleWhatsAppStatus = task({
  id: 'whatsapp-status-handler',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 5000,
    factor: 2,
  },
  run: async (payload: WhatsAppStatusPayload) => {
    const { messageId, status, recipientId, timestamp, errors, correlationId } = payload;
    const { eventStore } = getClients();

    logger.info('Processing WhatsApp status update', {
      messageId,
      status,
      correlationId,
    });

    // Log errors if delivery failed
    if (status === 'failed' && errors && errors.length > 0) {
      logger.error('WhatsApp message delivery failed', {
        messageId,
        errors,
        correlationId,
      });
    }

    // Emit domain event for status tracking
    await emitStatusUpdatedEvent(eventStore, correlationId, {
      messageId,
      status,
      recipientId,
      timestamp,
      errors,
    });

    return {
      success: true,
      messageId,
      status,
    };
  },
});
