import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone, LeadContextBuilder } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';

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
    const { hubspot, whatsapp, openai, scoring, eventStore, consent } = getClients();

    logger.info('Processing WhatsApp message', {
      messageId: message.id,
      type: message.type,
      correlationId,
    });

    // Step 1: Build LeadContext with normalized phone
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

    const leadContextBuilder =
      LeadContextBuilder.fromWhatsApp(waInput).withCorrelationId(correlationId);

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

    // Step 3.5: GDPR Consent Check & Recording
    // Check if this message is a consent response (da/nu/yes/no/stop)
    const messageBody = message.text?.body ?? '';
    const consentResponse = consent ? consent.parseConsentFromMessage(messageBody) : null;

    if (consentResponse && hubspotContactId && consent) {
      // User is responding to consent request - record their response
      const consentStatus = consentResponse.granted ? 'granted' : 'denied';
      try {
        for (const consentType of consentResponse.consentTypes) {
          await consent.recordConsent({
            contactId: hubspotContactId,
            phone: normalizedPhone,
            consentType,
            status: consentStatus,
            source: {
              channel: 'whatsapp',
              method: 'explicit',
              evidenceUrl: null,
              witnessedBy: null,
            },
          });
        }
        logger.info('Consent recorded from message', {
          status: consentStatus,
          types: consentResponse.consentTypes,
          correlationId,
        });

        // Send confirmation message
        if (whatsapp) {
          const confirmationMsg = consentResponse.granted
            ? 'Mulțumim! Consimțământul dumneavoastră a fost înregistrat. Putem continua conversația.'
            : 'Am înregistrat preferința dumneavoastră. Nu vă vom mai trimite mesaje promoționale.';
          await whatsapp.sendText({ to: normalizedPhone, text: confirmationMsg });
        }

        // If consent was denied, stop processing further
        if (!consentResponse.granted) {
          return {
            success: true,
            messageId: message.id,
            normalizedPhone,
            hubspotContactId,
            consentDenied: true,
          };
        }
      } catch (err) {
        logger.error('Failed to record consent', { err, correlationId });
      }
    } else if (hubspotContactId && consent) {
      // GDPR Compliance: Check if we have valid consent for data processing
      const hasValidConsent = await consent.hasValidConsent(hubspotContactId, 'data_processing');

      if (!hasValidConsent) {
        // Check if this is first contact - we need to request consent
        const existingConsent = await consent.getConsent(hubspotContactId, 'data_processing');

        if (!existingConsent) {
          // First contact - send consent request and STOP processing
          logger.info('No consent found, requesting consent and stopping processing', { correlationId });

          if (whatsapp) {
            const consentMessage = consent.generateConsentMessage('ro');
            await whatsapp.sendText({ to: normalizedPhone, text: consentMessage });

            // Record pending consent
            await consent.recordConsent({
              contactId: hubspotContactId,
              phone: normalizedPhone,
              consentType: 'data_processing',
              status: 'pending',
              source: {
                channel: 'whatsapp',
                method: 'explicit',
                evidenceUrl: null,
                witnessedBy: null,
              },
            });
          }

          // GDPR COMPLIANCE: Stop processing until consent is granted
          return {
            success: true,
            messageId: message.id,
            normalizedPhone,
            hubspotContactId,
            consentPending: true,
            message: 'Processing stopped - awaiting consent',
          };
        } else if (existingConsent.status === 'pending') {
          // Consent already requested but not yet granted - remind and STOP
          logger.info('Consent pending, reminding user and stopping processing', { correlationId });

          if (whatsapp) {
            const reminderMessage =
              'Vă rugăm să răspundeți cu "DA" pentru a continua conversația. Fără consimțământul dumneavoastră explicit, nu putem procesa mesajele.';
            await whatsapp.sendText({ to: normalizedPhone, text: reminderMessage });
          }

          // GDPR COMPLIANCE: Stop processing until consent is granted
          return {
            success: true,
            messageId: message.id,
            normalizedPhone,
            hubspotContactId,
            consentPending: true,
            message: 'Processing stopped - consent still pending',
          };
        } else if (existingConsent.status === 'denied' || existingConsent.status === 'withdrawn') {
          // User denied or withdrew consent - absolutely no processing allowed
          logger.warn('Consent denied/withdrawn, cannot process message', { correlationId });

          // GDPR COMPLIANCE: Respect user's choice, do not process
          return {
            success: true,
            messageId: message.id,
            normalizedPhone,
            hubspotContactId,
            consentDenied: true,
            message: 'Processing blocked - consent denied or withdrawn',
          };
        }
      }
    }

    // Step 4: AI Scoring - Build final LeadContext
    if (hubspotContactId) {
      leadContextBuilder.withHubSpotContact(hubspotContactId);
    }
    const leadContext = leadContextBuilder.buildForScoring();

    let scoreResult;
    if (!scoring) {
      logger.error('Scoring service not available', { correlationId });
      throw new Error('Scoring service not configured');
    }

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
      // Create priority task in HubSpot
      if (hubspot && hubspotContactId) {
        try {
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `PRIORITY REQUEST: ${contact?.profile.name ?? normalizedPhone}`,
            body: `Patient reported interest/discomfort. Wants quick appointment.\n\n${scoreResult.suggestedAction}`,
            priority: 'HIGH',
            dueDate: new Date(Date.now() + 30 * 60 * 1000), // Due in 30 minutes during business hours
          });
          logger.info('Created priority request task', {
            contactId: hubspotContactId,
            correlationId,
          });
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
              components: [
                {
                  type: 'body' as const,
                  parameters: [{ type: 'text' as const, text: contact.profile.name }],
                },
              ],
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
