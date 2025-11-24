import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Lead Nurture Sequence Workflow
 *
 * Automated nurture sequences for leads based on their classification.
 * Supports warm leads, cold leads, post-consultation, and recall sequences.
 */

/**
 * Initialize clients lazily using shared factory
 */
function getClients() {
  return createIntegrationClients({
    source: 'nurture-sequence',
    includeScheduling: false,
    includeTemplateCatalog: false,
  });
}

/**
 * Payload schema for nurture sequence workflow
 */
export const NurtureSequencePayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string(),
  sequenceType: z.enum(['warm_lead', 'cold_lead', 'post_consultation', 'recall']),
  correlationId: z.string(),
});

export type NurtureSequencePayload = z.infer<typeof NurtureSequencePayloadSchema>;

/**
 * Sequence configuration for each sequence type
 */
const sequences: Record<string, { delays: number[]; templates: string[] }> = {
  warm_lead: {
    delays: [24, 72, 168], // hours
    templates: ['warm_followup_1', 'warm_followup_2', 'warm_followup_3'],
  },
  cold_lead: {
    delays: [48, 168, 336], // hours
    templates: ['cold_reengagement_1', 'cold_reengagement_2', 'cold_reengagement_3'],
  },
  post_consultation: {
    delays: [24, 72, 168],
    templates: ['post_consult_1', 'post_consult_2', 'post_consult_3'],
  },
  recall: {
    delays: [24, 168, 336],
    templates: ['recall_reminder_1', 'recall_reminder_2', 'recall_final'],
  },
};

/**
 * Nurture Sequence Workflow
 *
 * Sends a series of templated messages over time based on sequence type.
 * Automatically stops if lead converts or opts out.
 */
export const nurtureSequenceWorkflow = task({
  id: 'nurture-sequence-workflow',
  run: async (payload: NurtureSequencePayload) => {
    const { phone, hubspotContactId, sequenceType, correlationId } = payload;
    const { hubspot, whatsapp } = getClients();

    logger.info('Starting nurture sequence', {
      hubspotContactId,
      sequenceType,
      correlationId,
    });

    const sequence = sequences[sequenceType];
    if (!sequence) {
      logger.error('Unknown sequence type', { sequenceType });
      return { success: false, error: 'Unknown sequence type' };
    }

    let messagesSent = 0;

    for (let i = 0; i < sequence.delays.length; i++) {
      const delay = sequence.delays[i];
      const template = sequence.templates[i];

      if (!delay || !template) continue;

      logger.info(`Waiting ${delay} hours for next message`, { correlationId, step: i + 1 });
      await wait.for({ hours: delay });

      // Check if lead has converted or opted out
      if (hubspot) {
        try {
          const contact = await hubspot.getContact(hubspotContactId);
          if (contact.properties.lifecyclestage === 'customer') {
            logger.info('Lead converted, stopping sequence', { correlationId });
            break;
          }
          if (contact.properties.consent_marketing === 'false') {
            logger.info('Lead opted out, stopping sequence', { correlationId });
            break;
          }
        } catch (error) {
          logger.warn('Failed to check contact status', { error, correlationId });
        }
      }

      // Send nurture message
      if (whatsapp) {
        try {
          await whatsapp.sendTemplate({
            to: phone,
            templateName: template,
          });
          messagesSent++;
          logger.info(`Sent nurture message: ${template}`, { correlationId, step: i + 1 });
        } catch (error) {
          logger.error(`Failed to send nurture message: ${template}`, { error, correlationId });
        }
      } else {
        logger.info(`Would send nurture message: ${template}`, { correlationId, step: i + 1 });
      }
    }

    return {
      success: true,
      hubspotContactId,
      sequenceType,
      messagesConfigured: sequence.templates.length,
      messagesSent,
    };
  },
});
