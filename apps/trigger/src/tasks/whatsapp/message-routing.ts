/**
 * Message routing logic for WhatsApp handler
 *
 * Uses loosely typed client interfaces to avoid tight coupling.
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import type { ScoreResult, HandlerContext } from './types.js';
import { createPriorityTask } from './hubspot-operations.js';

/**
 * Client types (loosely typed to avoid coupling with integration package)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HubSpotClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WhatsAppClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenAIClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeadContext = any;

/**
 * Send HOT lead acknowledgment template
 */
async function sendHotLeadAcknowledgment(
  whatsapp: WhatsAppClient,
  normalizedPhone: string,
  contactName: string | undefined,
  correlationId: string
): Promise<void> {
  try {
    const templateOptions = {
      to: normalizedPhone,
      templateName: 'hot_lead_acknowledgment',
      language: 'ro',
      ...(contactName && {
        components: [
          {
            type: 'body' as const,
            parameters: [{ type: 'text' as const, text: contactName }],
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

/**
 * Send AI-generated reply for WARM/COLD leads
 */
async function sendAIReply(
  whatsapp: WhatsAppClient,
  openai: OpenAIClient,
  leadContext: LeadContext,
  normalizedPhone: string,
  classification: string,
  correlationId: string
): Promise<void> {
  try {
    const reply = await openai.generateReply({
      context: leadContext,
      tone: classification === 'WARM' ? 'friendly' : 'professional',
      language: 'ro',
    });

    await whatsapp.sendText({
      to: normalizedPhone,
      text: reply,
    });
    logger.info('Sent AI-generated reply', { classification, correlationId });
  } catch (err) {
    logger.error('Failed to send AI reply', { err, correlationId });
  }
}

/**
 * Route message based on lead score classification
 *
 * - HOT leads: Create priority task + send acknowledgment template
 * - WARM/COLD leads: Send AI-generated reply
 */
export async function routeByScore(
  scoreResult: ScoreResult,
  leadContext: LeadContext,
  context: HandlerContext,
  clients: {
    hubspot: HubSpotClient | null;
    whatsapp: WhatsAppClient | null;
    openai: OpenAIClient | null;
  }
): Promise<void> {
  const { hubspot, whatsapp, openai } = clients;

  if (scoreResult.classification === 'HOT') {
    // Create priority task in HubSpot
    await createPriorityTask(hubspot, context, scoreResult.suggestedAction);

    // Send acknowledgment template
    if (whatsapp) {
      await sendHotLeadAcknowledgment(
        whatsapp,
        context.normalizedPhone,
        context.contactName,
        context.correlationId
      );
    }
  } else if (whatsapp && openai && context.messageBody) {
    // Generate AI reply for WARM/COLD leads
    await sendAIReply(
      whatsapp,
      openai,
      leadContext,
      context.normalizedPhone,
      scoreResult.classification,
      context.correlationId
    );
  }
}
