import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone, createEventStore, createInMemoryEventStore } from '@medicalcor/core';
import { createHubSpotClient, createWhatsAppClient, createOpenAIClient } from '@medicalcor/integrations';
import { createScoringService } from '@medicalcor/domain';
import type { LeadContext } from '@medicalcor/types';

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

const WhatsAppMessagePayloadSchema = z.object({
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
  contact: z.object({
    profile: z.object({ name: z.string() }),
    wa_id: z.string(),
  }).optional(),
  correlationId: z.string(),
});

export type WhatsAppMessagePayload = z.infer<typeof WhatsAppMessagePayloadSchema>;

// Initialize clients (lazy - only when task runs)
function getClients() {
  const hubspotToken = process.env['HUBSPOT_ACCESS_TOKEN'];
  const whatsappApiKey = process.env['WHATSAPP_API_KEY'];
  const whatsappPhoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const openaiApiKey = process.env['OPENAI_API_KEY'];
  const databaseUrl = process.env['DATABASE_URL'];

  const hubspot = hubspotToken
    ? createHubSpotClient({ accessToken: hubspotToken })
    : null;

  const webhookSecret = process.env['WHATSAPP_WEBHOOK_SECRET'];
  const whatsapp = whatsappApiKey && whatsappPhoneNumberId
    ? createWhatsAppClient({
        apiKey: whatsappApiKey,
        phoneNumberId: whatsappPhoneNumberId,
        ...(webhookSecret && { webhookSecret }),
      })
    : null;

  const openai = openaiApiKey
    ? createOpenAIClient({ apiKey: openaiApiKey })
    : null;

  const scoring = createScoringService({
    openaiApiKey: openaiApiKey ?? '',
    fallbackEnabled: true,
  });

  const eventStore = databaseUrl
    ? createEventStore({ source: 'whatsapp-handler', connectionString: databaseUrl })
    : createInMemoryEventStore('whatsapp-handler');

  return { hubspot, whatsapp, openai, scoring, eventStore };
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
    const { hubspot, whatsapp, openai, scoring, eventStore } = getClients();

    logger.info('Processing WhatsApp message', {
      messageId: message.id,
      type: message.type,
      correlationId,
    });

    // Step 1: Normalize phone number
    const phoneResult = normalizeRomanianPhone(message.from);
    const normalizedPhone = phoneResult.normalized;
    logger.info('Phone normalized', {
      isValid: phoneResult.isValid,
      correlationId,
    });

    // Step 2: Sync contact to HubSpot
    let hubspotContactId: string | undefined;
    if (hubspot) {
      try {
        const contactName = contact?.profile.name;
        const hubspotContact = await hubspot.syncContact({
          phone: normalizedPhone,
          ...(contactName && { name: contactName }),
        });
        hubspotContactId = hubspotContact.id;
        logger.info('HubSpot contact synced', { contactId: hubspotContactId, correlationId });
      } catch (err) {
        logger.error('Failed to sync HubSpot contact', { err, correlationId });
      }
    } else {
      logger.warn('HubSpot client not configured, skipping CRM sync', { correlationId });
    }

    // Step 3: Log message to HubSpot timeline
    if (hubspot && hubspotContactId) {
      try {
        await hubspot.logMessageToTimeline({
          contactId: hubspotContactId,
          message: message.text?.body ?? '[Media message]',
          direction: 'IN',
          channel: 'whatsapp',
          messageId: message.id,
        });
        logger.info('Message logged to timeline', { contactId: hubspotContactId, correlationId });
      } catch (err) {
        logger.error('Failed to log message to timeline', { err, correlationId });
      }
    }

    // Step 4: AI Scoring
    const leadContext: LeadContext = {
      phone: normalizedPhone,
      name: contact?.profile.name,
      channel: 'whatsapp',
      firstTouchTimestamp: message.timestamp,
      language: 'ro', // Default to Romanian, could be detected
      messageHistory: message.text?.body
        ? [{ role: 'user', content: message.text.body, timestamp: message.timestamp }]
        : [],
      hubspotContactId,
    };

    let scoreResult;
    try {
      scoreResult = await scoring.scoreMessage(leadContext);
      logger.info('Lead scored', {
        score: scoreResult.score,
        classification: scoreResult.classification,
        confidence: scoreResult.confidence,
        correlationId,
      });
    } catch (err) {
      logger.error('Failed to score lead', { err, correlationId });
      // Fallback to rule-based scoring
      scoreResult = scoring.ruleBasedScore(leadContext);
    }

    // Step 5: Route based on score
    if (scoreResult.classification === 'HOT') {
      // Create high-priority task in HubSpot
      if (hubspot && hubspotContactId) {
        try {
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `HOT LEAD: ${contact?.profile.name ?? normalizedPhone}`,
            body: scoreResult.suggestedAction,
            priority: 'HIGH',
            dueDate: new Date(Date.now() + 30 * 60 * 1000), // Due in 30 minutes
          });
          logger.info('Created HOT lead task', { contactId: hubspotContactId, correlationId });
        } catch (err) {
          logger.error('Failed to create HubSpot task', { err, correlationId });
        }
      }

      // Send acknowledgment template
      if (whatsapp) {
        try {
          const templateOptions = {
            to: normalizedPhone,
            templateName: 'hot_lead_acknowledgment',
            language: 'ro',
            ...(contact?.profile.name && {
              components: [{
                type: 'body' as const,
                parameters: [{ type: 'text' as const, text: contact.profile.name }],
              }],
            }),
          };
          await whatsapp.sendTemplate(templateOptions);
          logger.info('Sent HOT lead acknowledgment template', { correlationId });
        } catch (err) {
          logger.error('Failed to send WhatsApp template', { err, correlationId });
        }
      }
    } else if (whatsapp && openai && message.text?.body) {
      // Generate AI reply for WARM/COLD leads
      try {
        const reply = await openai.generateReply({
          context: leadContext,
          tone: scoreResult.classification === 'WARM' ? 'friendly' : 'professional',
          language: 'ro',
        });

        await whatsapp.sendText({
          to: normalizedPhone,
          text: reply,
        });
        logger.info('Sent AI-generated reply', {
          classification: scoreResult.classification,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to send AI reply', { err, correlationId });
      }
    }

    // Step 6: Update HubSpot contact with score
    if (hubspot && hubspotContactId) {
      try {
        await hubspot.updateContact(hubspotContactId, {
          lead_score: String(scoreResult.score),
          lead_status: scoreResult.classification,
          last_message_timestamp: new Date().toISOString(),
        });
        logger.info('Updated contact with score', { contactId: hubspotContactId, correlationId });
      } catch (err) {
        logger.error('Failed to update contact score', { err, correlationId });
      }
    }

    // Step 7: Emit domain event
    try {
      await eventStore.emit({
        type: 'whatsapp.message.received',
        correlationId,
        aggregateId: normalizedPhone,
        aggregateType: 'lead',
        payload: {
          messageId: message.id,
          from: normalizedPhone,
          phoneNumberId: metadata.phone_number_id,
          messageType: message.type,
          contactName: contact?.profile.name,
          score: scoreResult.score,
          classification: scoreResult.classification,
          hubspotContactId,
        },
      });
      logger.info('Domain event emitted', { type: 'whatsapp.message.received', correlationId });
    } catch (err) {
      logger.error('Failed to emit domain event', { err, correlationId });
    }

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
const WhatsAppStatusPayloadSchema = z.object({
  messageId: z.string(),
  status: z.string(),
  recipientId: z.string(),
  timestamp: z.string(),
  errors: z.array(z.object({
    code: z.number(),
    title: z.string(),
  })).optional(),
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
    try {
      await eventStore.emit({
        type: 'whatsapp.status.updated',
        correlationId,
        aggregateId: recipientId,
        aggregateType: 'message',
        payload: {
          messageId,
          status,
          recipientId,
          timestamp,
          errors,
        },
      });
    } catch (err) {
      logger.error('Failed to emit status event', { err, correlationId });
    }

    return {
      success: true,
      messageId,
      status,
    };
  },
});
