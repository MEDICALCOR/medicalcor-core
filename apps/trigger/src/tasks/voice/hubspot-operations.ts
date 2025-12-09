/**
 * HubSpot operations for voice handler
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-return */

import { logger } from '@trigger.dev/sdk/v3';
import type { HubSpotClient, ScoreResult, TriageResult } from './types.js';

/**
 * Sync contact to HubSpot
 */
export async function syncVoiceContact(
  hubspot: HubSpotClient | null,
  normalizedPhone: string,
  correlationId: string
): Promise<string | undefined> {
  if (!hubspot) {
    logger.warn('HubSpot client not configured, skipping CRM sync', { correlationId });
    return undefined;
  }

  try {
    const hubspotContact = await hubspot.syncContact({
      phone: normalizedPhone,
      properties: {
        lead_source: 'voice',
        last_call_date: new Date().toISOString(),
      },
    });
    logger.info('HubSpot contact synced', { contactId: hubspotContact.id, correlationId });
    return hubspotContact.id;
  } catch (err) {
    logger.error('Failed to sync HubSpot contact', { err, correlationId });
    return undefined;
  }
}

/**
 * Log call to HubSpot timeline
 */
export async function logCallToTimeline(
  hubspot: HubSpotClient,
  params: {
    contactId: string;
    callSid: string;
    duration: number;
    transcript?: string;
    sentiment?: string;
  },
  correlationId: string
): Promise<void> {
  const { contactId, callSid, duration, transcript, sentiment } = params;

  try {
    const callLogInput: {
      contactId: string;
      callSid: string;
      duration: number;
      transcript?: string;
      sentiment?: string;
    } = {
      contactId,
      callSid,
      duration,
      transcript,
    };
    if (sentiment) {
      callLogInput.sentiment = sentiment;
    }
    await hubspot.logCallToTimeline(callLogInput);
    logger.info('Call logged to timeline', { contactId, correlationId });
  } catch (err) {
    logger.error('Failed to log call to timeline', { err, correlationId });
    throw err;
  }
}

/**
 * Update contact with scoring data
 */
export async function updateContactWithScoring(
  hubspot: HubSpotClient,
  hubspotContactId: string,
  scoreResult: ScoreResult,
  sentiment: string | undefined,
  triageResult: TriageResult,
  correlationId: string
): Promise<void> {
  await hubspot.updateContact(hubspotContactId, {
    lead_score: String(scoreResult.score),
    lead_status: scoreResult.classification,
    last_call_sentiment: sentiment,
    urgency_level: triageResult.urgencyLevel,
  });
  logger.info('Contact updated with voice scoring', {
    contactId: hubspotContactId,
    correlationId,
  });
}

/**
 * Update contact with call completion data
 */
export async function updateContactWithCallData(
  hubspot: HubSpotClient,
  hubspotContactId: string,
  scoreResult: ScoreResult,
  sentiment: string | undefined,
  summary: string | undefined
): Promise<void> {
  await hubspot.updateContact(hubspotContactId, {
    lead_score: String(scoreResult.score),
    lead_status: scoreResult.classification,
    last_call_sentiment: sentiment,
    last_call_summary: summary,
  });
}

/**
 * Create priority task for HOT leads or high urgency
 */
export async function createPriorityTask(
  hubspot: HubSpotClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  triage: { getNotificationContacts: (level: any) => string[] },
  params: {
    hubspotContactId: string;
    normalizedPhone: string;
    scoreResult: ScoreResult;
    triageResult: TriageResult;
    additionalContext?: string;
  },
  correlationId: string
): Promise<void> {
  const { hubspotContactId, normalizedPhone, scoreResult, triageResult, additionalContext } =
    params;

  const shouldCreateTask =
    scoreResult.classification === 'HOT' ||
    triageResult.urgencyLevel === 'high_priority' ||
    triageResult.urgencyLevel === 'high';

  if (!shouldCreateTask) {
    return;
  }

  const notificationContacts = triage.getNotificationContacts(triageResult.urgencyLevel);
  const contactsInfo =
    notificationContacts.length > 0 ? `\n\nNotify: ${notificationContacts.join(', ')}` : '';

  const isHighPriority = triageResult.urgencyLevel === 'high_priority';
  const priorityPrefix = isHighPriority ? 'PRIORITY REQUEST' : 'HIGH PRIORITY';
  const discomfortNote = isHighPriority
    ? 'Patient reported discomfort. Wants quick appointment.\n\n'
    : '';

  const bodyParts = [discomfortNote];
  if (additionalContext) {
    bodyParts.push(additionalContext);
  }
  if (triageResult.notes) {
    bodyParts.push(triageResult.notes);
  }
  if (scoreResult.suggestedAction) {
    bodyParts.push(`\nSuggested Action: ${scoreResult.suggestedAction}`);
  }
  bodyParts.push(contactsInfo);

  await hubspot.createTask({
    contactId: hubspotContactId,
    subject: `${priorityPrefix} - Voice Lead: ${normalizedPhone}`,
    body: bodyParts.join(''),
    priority: isHighPriority ? 'HIGH' : 'MEDIUM',
    dueDate:
      triageResult.routingRecommendation === 'next_available_slot'
        ? new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        : new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  });

  logger.info('Priority task created for voice lead', {
    notificationContacts,
    correlationId,
  });
}
