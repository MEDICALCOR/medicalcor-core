/**
 * HubSpot operations for voice transcription
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-return */

import { logger } from '@trigger.dev/sdk/v3';
import {
  formatTranscriptForCRM,
  type VapiTranscript,
  type VapiCallSummary,
} from '@medicalcor/integrations';
import type { TriageResult } from '@medicalcor/domain';
import type { ScoringOutput } from '@medicalcor/types';
import type { AISummaryResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HubSpotClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TriageClient = any;

/**
 * Sync contact and log call to HubSpot
 */
export async function syncContactAndLogCall(
  hubspot: HubSpotClient | null,
  params: {
    normalizedPhone: string;
    customerName?: string;
    callId: string;
    duration?: number;
    transcript: VapiTranscript | null;
    sentiment: AISummaryResult['sentiment'];
    correlationId: string;
  }
): Promise<string | undefined> {
  if (!hubspot) {
    return undefined;
  }

  const { normalizedPhone, customerName, callId, duration, transcript, sentiment, correlationId } =
    params;

  try {
    // Find or create contact
    const syncInput: { phone: string; name?: string; properties?: Record<string, string> } = {
      phone: normalizedPhone,
      properties: {
        lead_source: 'voice',
        last_call_date: new Date().toISOString(),
      },
    };
    if (customerName) {
      syncInput.name = customerName;
    }

    const contact = await hubspot.syncContact(syncInput);
    const hubspotContactId = contact.id;

    // Log call to timeline with formatted transcript
    if (transcript) {
      const formattedTranscript = formatTranscriptForCRM(transcript);
      const callLogInput: {
        contactId: string;
        callSid: string;
        duration: number;
        transcript?: string;
        sentiment?: string;
      } = {
        contactId: hubspotContactId,
        callSid: callId,
        duration: duration ?? transcript.duration,
        transcript: formattedTranscript,
      };
      if (sentiment?.sentiment) {
        callLogInput.sentiment = sentiment.sentiment;
      }
      await hubspot.logCallToTimeline(callLogInput);
    }

    logger.info('HubSpot contact synced and call logged', { hubspotContactId, correlationId });
    return hubspotContactId;
  } catch (err) {
    logger.error('Failed to sync to HubSpot', { err, callId, correlationId });
    return undefined;
  }
}

/**
 * Update contact with scoring data
 */
export async function updateContactWithScoring(
  hubspot: HubSpotClient | null,
  hubspotContactId: string | undefined,
  scoreResult: ScoringOutput | null,
  sentiment: AISummaryResult['sentiment'],
  aiSummary: string | null,
  summary: VapiCallSummary | null
): Promise<void> {
  if (!hubspot || !hubspotContactId || !scoreResult) {
    return;
  }

  await hubspot.updateContact(hubspotContactId, {
    lead_score: String(scoreResult.score),
    lead_status: scoreResult.classification,
    last_call_sentiment: sentiment?.sentiment,
    last_call_summary: aiSummary ?? summary?.summary,
    procedure_interest: scoreResult.procedureInterest?.join(', '),
  });
}

/**
 * Create priority task for HOT leads or high urgency
 */
export async function createPriorityTaskIfNeeded(
  hubspot: HubSpotClient | null,
  triage: TriageClient | null,
  params: {
    hubspotContactId: string | undefined;
    normalizedPhone: string;
    customerName?: string;
    scoreResult: ScoringOutput | null;
    triageResult: TriageResult | null;
    summary: VapiCallSummary | null;
    aiSummary: string | null;
    correlationId: string;
  }
): Promise<void> {
  const {
    hubspotContactId,
    normalizedPhone,
    customerName,
    scoreResult,
    triageResult,
    summary,
    aiSummary,
    correlationId,
  } = params;

  if (!hubspot || !hubspotContactId || !triageResult || !triage) {
    return;
  }

  const shouldCreateTask =
    scoreResult?.classification === 'HOT' ||
    summary?.urgencyLevel === 'critical' ||
    summary?.urgencyLevel === 'high' ||
    triageResult.urgencyLevel === 'high_priority' ||
    triageResult.urgencyLevel === 'high';

  if (!shouldCreateTask) {
    return;
  }

  try {
    // Get notification contacts for priority cases
    const notificationContacts = triage.getNotificationContacts(triageResult.urgencyLevel);
    const taskBody = buildTaskBody(summary, scoreResult, triageResult, aiSummary);
    const contactsInfo =
      notificationContacts.length > 0 ? `\n\nNotify: ${notificationContacts.join(', ')}` : '';

    await hubspot.createTask({
      contactId: hubspotContactId,
      subject: `${triageResult.urgencyLevel === 'high_priority' ? 'PRIORITY REQUEST' : 'HIGH PRIORITY'} - Voice: ${customerName ?? normalizedPhone}`,
      body: `${triageResult.urgencyLevel === 'high_priority' ? 'Patient reported discomfort. Wants quick appointment.\n\n' : ''}${taskBody}${contactsInfo}`,
      priority: triageResult.urgencyLevel === 'high_priority' ? 'HIGH' : 'MEDIUM',
      dueDate:
        triageResult.routingRecommendation === 'next_available_slot'
          ? new Date(Date.now() + 30 * 60 * 1000) // 30 minutes during business hours
          : new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    logger.info('Priority task created', {
      hubspotContactId,
      notificationContacts,
      correlationId,
    });
  } catch (err) {
    logger.error('Failed to create priority task', { err, correlationId });
  }
}

/**
 * Build task body from various data sources
 */
function buildTaskBody(
  summary: VapiCallSummary | null,
  scoreResult: ScoringOutput | null,
  triageResult: TriageResult | null,
  aiSummary: string | null
): string {
  const parts: string[] = [];

  if (aiSummary) {
    parts.push(`Summary: ${aiSummary}`);
  } else if (summary?.summary) {
    parts.push(`Summary: ${summary.summary}`);
  }

  if (summary?.procedureInterest && summary.procedureInterest.length > 0) {
    parts.push(`\nProcedure Interest: ${summary.procedureInterest.join(', ')}`);
  }

  if (summary?.urgencyLevel) {
    parts.push(`Urgency: ${summary.urgencyLevel}`);
  }

  if (triageResult?.notes) {
    parts.push(`\nTriage Notes: ${triageResult.notes}`);
  }

  if (scoreResult?.suggestedAction) {
    parts.push(`\nSuggested Action: ${scoreResult.suggestedAction}`);
  }

  if (summary?.actionItems && summary.actionItems.length > 0) {
    parts.push(`\nAction Items:\n${summary.actionItems.map((a) => `- ${a}`).join('\n')}`);
  }

  return parts.join('\n') || 'Voice call requires follow-up';
}
