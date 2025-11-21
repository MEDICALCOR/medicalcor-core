import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import type { WhatsAppMessage, WhatsAppMetadata } from '@medicalcor/types';

/**
 * WhatsApp Message Handler Task
 * Processes incoming WhatsApp messages through the lead pipeline
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

export const handleWhatsAppMessage = task({
  id: 'whatsapp-message-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof WhatsAppMessagePayloadSchema>) => {
    const { message, metadata, contact, correlationId } = payload;

    logger.info('Processing WhatsApp message', {
      messageId: message.id,
      from: message.from,
      type: message.type,
      correlationId,
    });

    // Step 1: Normalize phone number
    const normalizedPhone = normalizePhone(message.from);
    logger.info('Phone normalized', { original: message.from, normalized: normalizedPhone });

    // Step 2: Upsert contact in HubSpot
    // const hubspotContact = await hubspotClient.syncContact({
    //   phone: normalizedPhone,
    //   name: contact?.profile.name,
    // });
    // logger.info('HubSpot contact synced', { contactId: hubspotContact.id });

    // Step 3: Log message to HubSpot timeline
    // await hubspotClient.logMessageToTimeline({
    //   contactId: hubspotContact.id,
    //   message: message.text?.body ?? '[Media message]',
    //   direction: 'IN',
    //   channel: 'whatsapp',
    //   messageId: message.id,
    // });

    // Step 4: AI Scoring
    // const scoreResult = await aiScoringService.scoreMessage({
    //   phone: normalizedPhone,
    //   message: message.text?.body ?? '',
    //   contactHistory: hubspotContact,
    // });
    // logger.info('Lead scored', { score: scoreResult.score, classification: scoreResult.classification });

    // Step 5: Handle based on score
    // if (scoreResult.classification === 'HOT') {
    //   // Create high-priority task
    //   await hubspotClient.createTask({
    //     contactId: hubspotContact.id,
    //     subject: `HOT LEAD: ${contact?.profile.name ?? normalizedPhone}`,
    //     body: scoreResult.suggestedAction,
    //     priority: 'HIGH',
    //   });
    //   // Send acknowledgment template
    //   await whatsappClient.sendTemplate(normalizedPhone, 'hot_lead_ack', {});
    // } else {
    //   // Send AI-generated reply
    //   await whatsappClient.sendText(normalizedPhone, scoreResult.suggestedAction);
    // }

    // Step 6: Emit domain event
    // await eventStore.emit({
    //   type: 'whatsapp.message.received',
    //   correlationId,
    //   payload: {
    //     messageId: message.id,
    //     from: normalizedPhone,
    //     phoneNumberId: metadata.phone_number_id,
    //     messageType: message.type,
    //     content: message.text?.body,
    //     timestamp: message.timestamp,
    //   },
    // });

    return {
      success: true,
      messageId: message.id,
      normalizedPhone,
      // hubspotContactId: hubspotContact.id,
      // score: scoreResult.score,
      // classification: scoreResult.classification,
    };
  },
});

function normalizePhone(phone: string): string {
  // Remove WhatsApp suffix and normalize to E.164
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('40')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+40${cleaned.substring(1)}`;
  return `+${cleaned}`;
}
