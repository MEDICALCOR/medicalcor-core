/**
 * HubSpot operations for WhatsApp handler
 *
 * Uses loosely typed HubSpot client interface to avoid tight coupling.
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import type { HubSpotSyncResult, HandlerContext } from './types.js';

/**
 * HubSpot client type (loosely typed to avoid coupling)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HubSpotClient = any;

/**
 * Sync contact to HubSpot CRM
 */
export async function syncHubSpotContact(
  hubspot: HubSpotClient | null,
  normalizedPhone: string,
  contactName: string | undefined,
  correlationId: string
): Promise<HubSpotSyncResult> {
  if (!hubspot) {
    logger.warn('HubSpot client not configured, skipping CRM sync', { correlationId });
    return { contactId: undefined };
  }

  try {
    const hubspotContact = await hubspot.syncContact({
      phone: normalizedPhone,
      ...(contactName && { name: contactName }),
    });
    logger.info('HubSpot contact synced', { contactId: hubspotContact.id, correlationId });
    return { contactId: hubspotContact.id };
  } catch (err) {
    logger.error('Failed to sync HubSpot contact', { err, correlationId });
    return { contactId: undefined };
  }
}

/**
 * Log message to HubSpot timeline
 */
export async function logMessageToTimeline(
  hubspot: HubSpotClient | null,
  contactId: string | undefined,
  messageBody: string,
  messageId: string,
  correlationId: string
): Promise<void> {
  if (!hubspot || !contactId) {
    return;
  }

  try {
    await hubspot.logMessageToTimeline({
      contactId,
      message: messageBody,
      direction: 'IN',
      channel: 'whatsapp',
      messageId,
    });
    logger.info('Message logged to timeline', { contactId, correlationId });
  } catch (err) {
    logger.error('Failed to log message to timeline', { err, correlationId });
  }
}

/**
 * Create priority task for HOT leads
 */
export async function createPriorityTask(
  hubspot: HubSpotClient | null,
  context: HandlerContext,
  suggestedAction: string | undefined
): Promise<void> {
  if (!hubspot || !context.hubspotContactId) {
    return;
  }

  try {
    const taskSubject = `PRIORITY REQUEST: ${context.contactName ?? context.normalizedPhone}`;
    const taskBody = `Patient reported interest/discomfort. Wants quick appointment.\n\n${suggestedAction ?? ''}`;

    await hubspot.createTask({
      contactId: context.hubspotContactId,
      subject: taskSubject,
      body: taskBody,
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 30 * 60 * 1000), // Due in 30 minutes
    });
    logger.info('Created priority request task', {
      contactId: context.hubspotContactId,
      correlationId: context.correlationId,
    });
  } catch (err) {
    logger.error('Failed to create HubSpot task', { err, correlationId: context.correlationId });
  }
}

/**
 * Update contact with lead score
 */
export async function updateContactScore(
  hubspot: HubSpotClient | null,
  contactId: string | undefined,
  score: number,
  classification: string,
  correlationId: string
): Promise<void> {
  if (!hubspot || !contactId) {
    return;
  }

  try {
    await hubspot.updateContact(contactId, {
      lead_score: String(score),
      lead_status: classification,
      last_message_timestamp: new Date().toISOString(),
    });
    logger.info('Updated contact with score', { contactId, correlationId });
  } catch (err) {
    logger.error('Failed to update contact score', { err, correlationId });
  }
}
