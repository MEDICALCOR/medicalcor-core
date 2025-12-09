import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import {
  syncVoiceContact,
  logCallToTimeline,
  updateContactWithScoring,
  updateContactWithCallData,
  createPriorityTask,
  verifyVoiceConsent,
  scoreVoiceLead,
  analyzeVoiceSentiment,
  emitVoiceCallEvent,
  emitVoiceProcessedEvent,
} from './voice/index.js';

/**
 * Voice Call Handler Task
 * Processes incoming voice calls and call status updates
 *
 * Flow:
 * 1. Normalize phone number
 * 2. Sync contact to HubSpot (upsert)
 * 3. Perform triage assessment
 * 4. If call completed: process transcript, score, update CRM
 * 5. Emit domain events
 */

// Initialize clients lazily using shared factory
function getClients() {
  return createIntegrationClients({
    source: 'voice-handler',
    includeOpenAI: true,
    includeScoring: true,
    includeTriage: true,
    includeConsent: true,
  });
}

export const VoiceCallPayloadSchema = z.object({
  callSid: z.string(),
  from: z.string(),
  to: z.string(),
  direction: z.enum(['inbound', 'outbound-api', 'outbound-dial']),
  status: z.string(),
  duration: z.string().optional(),
  transcript: z.string().optional(),
  correlationId: z.string(),
});

export type VoiceCallPayload = z.infer<typeof VoiceCallPayloadSchema>;

export const handleVoiceCall = task({
  id: 'voice-call-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: VoiceCallPayload) => {
    const { callSid, from, to, direction, status, duration, transcript, correlationId } = payload;
    const { hubspot, openai, scoring, triage, consent, eventStore } = getClients();

    logger.info('Processing voice call', { callSid, direction, status, correlationId });

    // Step 1: Normalize phone number
    const phoneResult = normalizeRomanianPhone(from);
    const normalizedPhone = phoneResult.normalized;
    logger.info('Phone normalized', { isValid: phoneResult.isValid, correlationId });

    // Step 2: Sync contact to HubSpot
    const hubspotContactId = await syncVoiceContact(hubspot, normalizedPhone, correlationId);

    // Step 3: Process transcript if call completed
    let scoreResult;
    if (status === 'completed' && transcript && hubspot && hubspotContactId) {
      const processingResult = await processCompletedCall(
        { hubspot, openai, scoring, triage, consent },
        { hubspotContactId, normalizedPhone, callSid, transcript, duration },
        correlationId
      );

      if (processingResult.consentRequired) {
        return {
          status: 'consent_required',
          hubspotContactId,
          missingConsents: processingResult.missingConsents,
        };
      }

      scoreResult = processingResult.scoreResult;
    }

    // Step 4: Emit domain event
    await emitVoiceCallEvent(
      eventStore,
      status === 'completed' ? 'voice.call.completed' : 'voice.call.initiated',
      correlationId,
      normalizedPhone,
      {
        callSid,
        from: normalizedPhone,
        to,
        direction,
        status,
        duration: duration ? parseInt(duration, 10) : undefined,
        hubspotContactId,
        score: scoreResult?.score,
        classification: scoreResult?.classification,
      }
    );

    return {
      success: true,
      callSid,
      normalizedPhone,
      hubspotContactId,
      status,
      score: scoreResult?.score,
      classification: scoreResult?.classification,
    };
  },
});

/**
 * Process completed call with consent verification and scoring
 */
async function processCompletedCall(
  clients: {
    hubspot: ReturnType<typeof getClients>['hubspot'];
    openai: ReturnType<typeof getClients>['openai'];
    scoring: ReturnType<typeof getClients>['scoring'];
    triage: ReturnType<typeof getClients>['triage'];
    consent: ReturnType<typeof getClients>['consent'];
  },
  params: {
    hubspotContactId: string;
    normalizedPhone: string;
    callSid: string;
    transcript: string;
    duration?: string;
  },
  correlationId: string
): Promise<{
  consentRequired?: boolean;
  missingConsents?: string[];
  scoreResult?: { score: number; classification: string };
}> {
  const { hubspot, openai, scoring, triage, consent } = clients;
  const { hubspotContactId, normalizedPhone, callSid, transcript, duration } = params;
  const durationNum = duration ? parseInt(duration, 10) : 0;

  // GDPR consent verification
  const consentResult = await verifyVoiceConsent(
    consent,
    hubspot,
    hubspotContactId,
    callSid,
    durationNum,
    correlationId
  );

  if (!consentResult.hasConsent) {
    return { consentRequired: true, missingConsents: consentResult.missingConsents };
  }

  try {
    // Log call to timeline
    await logCallToTimeline(
      hubspot,
      { contactId: hubspotContactId, callSid, duration: durationNum, transcript },
      correlationId
    );

    // Score and triage
    if (!scoring || !triage) {
      logger.warn('Scoring or triage service not available', { correlationId });
      return {};
    }

    const { scoreResult, triageResult } = await scoreVoiceLead(
      scoring,
      triage,
      { normalizedPhone, hubspotContactId, transcript },
      correlationId
    );

    // Analyze sentiment
    const sentiment = await analyzeVoiceSentiment(openai, transcript, correlationId);

    // Update contact
    await updateContactWithScoring(
      hubspot,
      hubspotContactId,
      scoreResult,
      sentiment,
      triageResult,
      correlationId
    );

    // Create priority task if needed
    await createPriorityTask(
      hubspot,
      triage,
      { hubspotContactId, normalizedPhone, scoreResult, triageResult },
      correlationId
    );

    return { scoreResult };
  } catch (err) {
    logger.error('Failed to process voice call transcript', { err, correlationId });
    return {};
  }
}

/**
 * Call Completed Handler Task
 * Processes call completion with transcript and recording
 */
export const CallCompletedPayloadSchema = z.object({
  callSid: z.string(),
  from: z.string(),
  to: z.string().optional(),
  duration: z.number(),
  transcript: z.string().optional(),
  recordingUrl: z.string().optional(),
  summary: z.string().optional(),
  sentiment: z.string().optional(),
  correlationId: z.string(),
});

export type CallCompletedPayload = z.infer<typeof CallCompletedPayloadSchema>;

export const handleCallCompleted = task({
  id: 'voice-call-completed-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: CallCompletedPayload) => {
    const { callSid, from, duration, transcript, recordingUrl, summary, sentiment, correlationId } =
      payload;
    const { hubspot, scoring, triage, eventStore } = getClients();

    logger.info('Processing completed call', {
      callSid,
      duration,
      hasRecording: !!recordingUrl,
      hasTranscript: !!transcript,
      correlationId,
    });

    // Normalize phone
    const phoneResult = normalizeRomanianPhone(from);
    const normalizedPhone = phoneResult.normalized;

    // Find/create HubSpot contact and log call
    const hubspotContactId = await syncAndLogCompletedCall(
      hubspot,
      { normalizedPhone, callSid, duration, transcript, summary, sentiment },
      correlationId
    );

    // Score the lead if we have transcript content
    let scoreResult;
    if (transcript && hubspot && hubspotContactId && scoring && triage) {
      scoreResult = await scoreCompletedCall(
        { hubspot, scoring, triage },
        { hubspotContactId, normalizedPhone, transcript, summary, sentiment },
        correlationId
      );
    }

    // Emit domain event
    await emitVoiceProcessedEvent(eventStore, correlationId, normalizedPhone, {
      callSid,
      from: normalizedPhone,
      status: 'processed',
      duration,
      hasTranscript: !!transcript,
      hasRecording: !!recordingUrl,
      hubspotContactId,
      score: scoreResult?.score,
      classification: scoreResult?.classification,
      sentiment,
    });

    return {
      success: true,
      callSid,
      normalizedPhone,
      hubspotContactId,
      duration,
      score: scoreResult?.score,
      classification: scoreResult?.classification,
    };
  },
});

/**
 * Sync contact and log completed call to HubSpot
 */
async function syncAndLogCompletedCall(
  hubspot: ReturnType<typeof getClients>['hubspot'],
  params: {
    normalizedPhone: string;
    callSid: string;
    duration: number;
    transcript?: string;
    summary?: string;
    sentiment?: string;
  },
  correlationId: string
): Promise<string | undefined> {
  if (!hubspot) {
    return undefined;
  }

  const { normalizedPhone, callSid, duration, transcript, summary, sentiment } = params;

  try {
    const contact = await hubspot.syncContact({ phone: normalizedPhone });
    const hubspotContactId = contact.id;

    await logCallToTimeline(
      hubspot,
      {
        contactId: hubspotContactId,
        callSid,
        duration,
        transcript: transcript ?? summary ?? 'No transcript available',
        sentiment,
      },
      correlationId
    );

    logger.info('Call logged to HubSpot', { contactId: hubspotContactId, correlationId });
    return hubspotContactId;
  } catch (err) {
    logger.error('Failed to log call to HubSpot', { err, correlationId });
    return undefined;
  }
}

/**
 * Score completed call and create priority task if needed
 */
async function scoreCompletedCall(
  clients: {
    hubspot: ReturnType<typeof getClients>['hubspot'];
    scoring: ReturnType<typeof getClients>['scoring'];
    triage: ReturnType<typeof getClients>['triage'];
  },
  params: {
    hubspotContactId: string;
    normalizedPhone: string;
    transcript: string;
    summary?: string;
    sentiment?: string;
  },
  correlationId: string
): Promise<{ score: number; classification: string } | undefined> {
  const { hubspot, scoring, triage } = clients;
  const { hubspotContactId, normalizedPhone, transcript, summary, sentiment } = params;

  try {
    const { scoreResult, triageResult } = await scoreVoiceLead(
      scoring,
      triage,
      { normalizedPhone, hubspotContactId, transcript },
      correlationId
    );

    // Update contact
    await updateContactWithCallData(hubspot, hubspotContactId, scoreResult, sentiment, summary);

    // Create task for HOT leads or priority scheduling requests
    const shouldCreateTask =
      scoreResult.classification === 'HOT' ||
      triageResult.prioritySchedulingRequested === true ||
      triageResult.urgencyLevel === 'high';

    if (shouldCreateTask && triage) {
      await createPriorityTask(
        hubspot,
        triage,
        {
          hubspotContactId,
          normalizedPhone,
          scoreResult,
          triageResult,
          additionalContext: `Call Duration: ${params.transcript ? 'available' : 'N/A'}\n\nSummary: ${summary ?? 'N/A'}`,
        },
        correlationId
      );
    }

    logger.info('Voice lead scored and updated', {
      score: scoreResult.score,
      classification: scoreResult.classification,
      correlationId,
    });

    return scoreResult;
  } catch (err) {
    logger.error('Failed to score voice lead', { err, correlationId });
    return undefined;
  }
}
