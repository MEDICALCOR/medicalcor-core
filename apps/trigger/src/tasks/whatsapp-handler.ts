import { task, logger, tasks } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone, LeadContextBuilder } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import type { VisionAnalysisIntent } from './vision-analysis.js';

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

// Media schema for image/document/video/audio messages
const MediaSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
});

export const WhatsAppMessagePayloadSchema = z.object({
  message: z.object({
    id: z.string(),
    from: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    // Media message types for Vision AI
    image: MediaSchema.optional(),
    document: MediaSchema.optional(),
    video: MediaSchema.optional(),
    audio: MediaSchema.optional(),
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
      // Check if we have valid consent for data processing
      const hasValidConsent = await consent.hasValidConsent(hubspotContactId, 'data_processing');

      if (!hasValidConsent) {
        // Check if this is first contact - we need to request consent
        const existingConsent = await consent.getConsent(hubspotContactId, 'data_processing');

        if (!existingConsent || existingConsent.status === 'pending') {
          // First contact or pending - send consent request
          logger.info('No valid consent found, requesting consent', { correlationId });

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

          // Continue processing for initial messages but log the consent status
          logger.warn('Processing message without explicit consent - consent requested', {
            correlationId,
          });
        }
      }
    }

    // Step 3.6: Handle Image Messages - Vision AI Analysis
    if (message.type === 'image' && message.image) {
      logger.info('Image message detected, triggering Vision AI analysis', {
        mediaId: message.image.id,
        mimeType: message.image.mime_type,
        correlationId,
      });

      try {
        // Get media URL from WhatsApp
        // Note: In production, you need to call WhatsApp API to get the actual download URL
        // For now, we'll construct a proxy URL that the vision task can use
        const mediaUrl = `https://graph.facebook.com/v18.0/${message.image.id}`;

        // Determine intent based on mime type or caption
        const caption = message.image.caption?.toLowerCase() ?? '';
        let intent: VisionAnalysisIntent = 'document';

        if (
          caption.includes('reteta') ||
          caption.includes('prescri') ||
          caption.includes('medica')
        ) {
          intent = 'prescription';
        } else if (
          caption.includes('analize') ||
          caption.includes('rezultat') ||
          caption.includes('laborator')
        ) {
          intent = 'lab_result';
        } else if (
          caption.includes('piele') ||
          caption.includes('dermat') ||
          caption.includes('alunita')
        ) {
          intent = 'dermatology';
        } else if (
          caption.includes('radiografie') ||
          caption.includes('xray') ||
          caption.includes('rx')
        ) {
          intent = 'xray';
        } else if (
          caption.includes('dent') ||
          caption.includes('panoram') ||
          caption.includes('ct')
        ) {
          intent = 'dental_scan';
        } else if (message.image.mime_type?.includes('pdf')) {
          intent = 'document';
        } else {
          // Default to document for images without specific context
          intent = 'other';
        }

        // Trigger Vision AI analysis task
        const visionResult = await tasks.triggerAndWait('analyze-medical-image', {
          imageUrl: mediaUrl,
          patientId: normalizedPhone,
          intent,
          correlationId,
          hubspotContactId,
          language: 'ro',
        });

        logger.info('Vision AI analysis completed', {
          success: visionResult.ok,
          intent,
          correlationId,
        });

        // Send analysis result to patient
        if (whatsapp && visionResult.ok && visionResult.output) {
          const analysisOutput = visionResult.output as {
            summary?: string;
            medications?: { name: string; dosage?: string }[];
            abnormalValues?: { metric: string; value: string; status: string }[];
          };

          let responseMessage = 'Am analizat documentul. ';

          if (analysisOutput.summary) {
            responseMessage += `Iată ce am găsit:\n\n${analysisOutput.summary}\n\n`;
          }

          if (analysisOutput.medications && analysisOutput.medications.length > 0) {
            responseMessage += 'Medicamente identificate:\n';
            for (const med of analysisOutput.medications) {
              responseMessage += `• ${med.name}${med.dosage ? ` - ${med.dosage}` : ''}\n`;
            }
            responseMessage += '\n';
          }

          if (analysisOutput.abnormalValues && analysisOutput.abnormalValues.length > 0) {
            responseMessage += '⚠️ Valori în afara intervalului normal:\n';
            for (const val of analysisOutput.abnormalValues) {
              responseMessage += `• ${val.metric}: ${val.value} (${val.status})\n`;
            }
            responseMessage += '\n';
          }

          responseMessage += 'Confirmați că aceste informații sunt corecte?';

          await whatsapp.sendText({
            to: normalizedPhone,
            text: responseMessage,
          });

          logger.info('Sent vision analysis result to patient', { correlationId });
        }

        // Return early for image messages - skip regular scoring flow
        return {
          success: true,
          messageId: message.id,
          normalizedPhone,
          hubspotContactId,
          messageType: 'image',
          visionAnalysisTriggered: true,
        };
      } catch (err) {
        logger.error('Vision AI analysis failed', { err, correlationId });
        // Continue with regular flow if vision fails
        if (whatsapp) {
          await whatsapp.sendText({
            to: normalizedPhone,
            text: 'Am primit imaginea, dar nu am putut-o analiza automat. Un specialist va reveni cu un răspuns.',
          });
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
