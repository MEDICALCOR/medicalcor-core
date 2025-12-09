import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone, IdempotencyKeys } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import {
  verifyGdprConsent,
  logMinimalCallData,
  fetchAndAnalyzeTranscript,
  generateAISummary,
  scoreLeadFromTranscript,
  syncContactAndLogCall,
  updateContactWithScoring,
  createPriorityTaskIfNeeded,
  emitTranscriptProcessedEvent,
} from './voice-transcription/index.js';

/**
 * Voice Transcription Processing Workflow
 *
 * This workflow handles post-call processing for voice interactions:
 * 1. Fetch complete transcript from Vapi
 * 2. Analyze transcript for keywords and procedures
 * 3. Generate AI-powered summary
 * 4. Score the lead based on conversation
 * 5. Update CRM with full call data
 * 6. Create follow-up tasks if needed
 */

// =============================================================================
// Configuration
// =============================================================================

function getClients() {
  return createIntegrationClients({
    source: 'voice-transcription',
    includeOpenAI: true,
    includeVapi: true,
    includeScoring: true,
    includeTriage: true,
    includeConsent: true,
  });
}

// =============================================================================
// Schema Definitions
// =============================================================================

export const PostCallPayloadSchema = z.object({
  callId: z.string(),
  customerPhone: z.string(),
  customerName: z.string().optional(),
  callType: z.enum(['inbound', 'outbound']),
  endedReason: z.string().optional(),
  duration: z.number().optional(),
  correlationId: z.string(),
});

export type PostCallPayload = z.infer<typeof PostCallPayloadSchema>;

export const TranscriptWebhookPayloadSchema = z.object({
  type: z.literal('call.ended'),
  call: z.object({
    id: z.string(),
    status: z.string(),
    type: z.enum(['inbound', 'outbound']),
    customer: z
      .object({
        number: z.string(),
        name: z.string().optional(),
      })
      .optional(),
    endedReason: z.string().optional(),
    cost: z.number().optional(),
    startedAt: z.string().optional(),
    endedAt: z.string().optional(),
  }),
  correlationId: z.string().optional(),
});

export type TranscriptWebhookPayload = z.infer<typeof TranscriptWebhookPayloadSchema>;

// =============================================================================
// Post-Call Processing Task
// =============================================================================

export const processPostCall = task({
  id: 'voice-post-call-processing',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: PostCallPayload) => {
    const { callId, customerPhone, customerName, callType, endedReason, duration, correlationId } =
      payload;
    const { hubspot, openai, vapi, scoring, triage, eventStore, consent } = getClients();

    logger.info('Starting post-call processing', {
      callId,
      callType,
      duration,
      correlationId,
    });

    // Step 1: Normalize phone number
    const phoneResult = normalizeRomanianPhone(customerPhone);
    const normalizedPhone = phoneResult.normalized;

    // Step 2: GDPR consent verification - must happen before processing personal data
    const consentResult = await verifyGdprConsent(
      hubspot,
      consent,
      normalizedPhone,
      callId,
      correlationId
    );

    // Handle consent-blocked scenarios
    if (hubspot && consentResult.hubspotContactId && !consentResult.hasConsent) {
      await logMinimalCallData(hubspot, consentResult.hubspotContactId, callId, duration ?? 0);
      return {
        status: 'consent_required',
        callId,
        hubspotContactId: consentResult.hubspotContactId,
        missingConsents: consentResult.consentCheckResult?.missing,
        message: 'Voice transcript processing skipped due to missing GDPR consent',
      };
    }

    if (hubspot && !consent) {
      return {
        status: 'error',
        callId,
        message: 'Consent verification unavailable - transcript processing blocked',
      };
    }

    // Step 3: Fetch and analyze transcript
    const transcriptResult = await fetchAndAnalyzeTranscript(vapi, callId, correlationId);
    const { transcript, analysis, summary } = transcriptResult;

    // Step 4: Generate AI summary and sentiment
    const aiResult = await generateAISummary(
      openai,
      analysis?.fullTranscript ?? null,
      callId,
      correlationId
    );
    const { aiSummary, sentiment } = aiResult;

    // Step 5: Score the lead
    const scoringResult = await scoreLeadFromTranscript(
      scoring,
      triage,
      transcriptResult,
      normalizedPhone,
      callId,
      correlationId
    );
    const { scoreResult, triageResult } = scoringResult;

    // Step 6: Sync to HubSpot
    const hubspotContactId = await syncContactAndLogCall(hubspot, {
      normalizedPhone,
      customerName,
      callId,
      duration,
      transcript,
      sentiment,
      correlationId,
    });

    // Step 7: Update contact with scoring data
    await updateContactWithScoring(
      hubspot,
      hubspotContactId,
      scoreResult,
      sentiment,
      aiSummary,
      summary
    );

    // Step 8: Create priority task if needed
    await createPriorityTaskIfNeeded(hubspot, triage, {
      hubspotContactId,
      normalizedPhone,
      customerName,
      scoreResult,
      triageResult,
      summary,
      aiSummary,
      correlationId,
    });

    // Step 9: Emit domain event
    await emitTranscriptProcessedEvent(eventStore, correlationId, {
      callId,
      normalizedPhone,
      callType,
      duration: duration ?? transcript?.duration,
      endedReason,
      hubspotContactId,
      scoreResult,
      sentiment,
      summary,
      triageResult,
      hasTranscript: !!transcript,
    });

    return {
      success: true,
      callId,
      normalizedPhone,
      hubspotContactId,
      score: scoreResult?.score,
      classification: scoreResult?.classification,
      sentiment: sentiment?.sentiment,
      procedureInterest: summary?.procedureInterest,
      urgencyLevel: summary?.urgencyLevel,
      aiSummary,
    };
  },
});

// =============================================================================
// Vapi Webhook Handler Task
// =============================================================================

export const handleVapiWebhook = task({
  id: 'vapi-webhook-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: TranscriptWebhookPayload) => {
    const { call, correlationId } = payload;
    const { eventStore } = getClients();

    logger.info('Processing Vapi webhook', {
      callId: call.id,
      status: call.status,
      type: call.type,
      correlationId,
    });

    // Only process ended calls
    if (call.status !== 'ended') {
      logger.info('Ignoring non-ended call', { status: call.status, correlationId });
      return { success: true, action: 'ignored', reason: 'not_ended' };
    }

    // Check for customer phone
    if (!call.customer?.number) {
      logger.warn('No customer phone in webhook', { callId: call.id, correlationId });
      return { success: false, error: 'no_customer_phone' };
    }

    // Emit event for webhook received
    try {
      await eventStore.emit({
        type: 'vapi.webhook.received',
        correlationId: correlationId ?? call.id,
        aggregateId: call.id,
        aggregateType: 'voice_call',
        payload: {
          callId: call.id,
          status: call.status,
          type: call.type,
          customerPhone: call.customer.number,
          endedReason: call.endedReason,
          cost: call.cost,
        },
      });
    } catch (err) {
      logger.error('Failed to emit webhook event', { err, correlationId });
    }

    // Trigger post-call processing
    const postCallPayload: PostCallPayload = {
      callId: call.id,
      customerPhone: call.customer.number,
      customerName: call.customer.name,
      callType: call.type,
      endedReason: call.endedReason,
      duration:
        call.startedAt && call.endedAt
          ? Math.round(
              (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
            )
          : undefined,
      correlationId: correlationId ?? call.id,
    };

    // CRITICAL FIX: Actually trigger post-call processing
    // Previously this was a placeholder that never triggered the task
    // IDEMPOTENCY FIX: Use callId as idempotencyKey to prevent duplicate processing
    // when Vapi sends duplicate webhooks on timeout/retry
    try {
      await processPostCall.trigger(postCallPayload, {
        idempotencyKey: IdempotencyKeys.vapiWebhook(call.id),
      });
      logger.info('Post-call processing triggered', { callId: call.id, correlationId });

      return {
        success: true,
        action: 'post_call_triggered',
        postCallPayload,
      };
    } catch (triggerError) {
      logger.error('Failed to trigger post-call processing', {
        err: triggerError,
        callId: call.id,
        correlationId,
      });

      return {
        success: false,
        action: 'post_call_trigger_failed',
        error: triggerError instanceof Error ? triggerError.message : 'Unknown error',
        postCallPayload,
      };
    }
  },
});

// =============================================================================
// Transcript Summary Generator Task
// =============================================================================

export const generateTranscriptSummary = task({
  id: 'generate-transcript-summary',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 5000,
    factor: 2,
  },
  run: async (payload: { callId: string; transcript: string; correlationId: string }) => {
    const { callId, transcript, correlationId } = payload;
    const { openai } = getClients();

    logger.info('Generating transcript summary', { callId, correlationId });

    if (!openai) {
      logger.warn('OpenAI not configured, skipping summary generation', { correlationId });
      return { success: false, error: 'openai_not_configured' };
    }

    try {
      // Generate summary
      const summary = await openai.summarize(transcript, 'ro');

      // Analyze sentiment
      const sentiment = await openai.analyzeSentiment(transcript);

      // Detect language
      const language = await openai.detectLanguage(transcript);

      logger.info('Summary generated', {
        callId,
        sentiment: sentiment.sentiment,
        language,
        correlationId,
      });

      return {
        success: true,
        callId,
        summary,
        sentiment: sentiment.sentiment,
        sentimentConfidence: sentiment.confidence,
        language,
      };
    } catch (err) {
      logger.error('Failed to generate summary', { err, callId, correlationId });
      return { success: false, error: 'summary_generation_failed' };
    }
  },
});

// =============================================================================
// Keyword Extraction Task
// =============================================================================

export const extractKeywordsFromTranscript = task({
  id: 'extract-transcript-keywords',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 3000,
    factor: 2,
  },

  run: async (payload: { callId: string; transcript: string; correlationId: string }) => {
    const { callId, transcript, correlationId } = payload;

    logger.info('Extracting keywords from transcript', { callId, correlationId });

    // Dental procedure keywords (Romanian)
    const PROCEDURE_KEYWORDS = [
      { keyword: 'implant', category: 'implant', priority: 'high' },
      { keyword: 'implanturi', category: 'implant', priority: 'high' },
      { keyword: 'all-on-4', category: 'full_arch', priority: 'high' },
      { keyword: 'all-on-6', category: 'full_arch', priority: 'high' },
      { keyword: 'all on 4', category: 'full_arch', priority: 'high' },
      { keyword: 'all on 6', category: 'full_arch', priority: 'high' },
      { keyword: 'fatete', category: 'cosmetic', priority: 'medium' },
      { keyword: 'coroane', category: 'restoration', priority: 'medium' },
      { keyword: 'albire', category: 'cosmetic', priority: 'low' },
      { keyword: 'detartraj', category: 'hygiene', priority: 'low' },
      { keyword: 'extractie', category: 'surgery', priority: 'medium' },
      { keyword: 'ortodontie', category: 'orthodontics', priority: 'medium' },
      { keyword: 'invisalign', category: 'orthodontics', priority: 'medium' },
      { keyword: 'proteza', category: 'prosthetics', priority: 'medium' },
      { keyword: 'canal', category: 'endodontics', priority: 'medium' },
      { keyword: 'tratament canal', category: 'endodontics', priority: 'medium' },
    ];

    // Intent keywords
    const INTENT_KEYWORDS = [
      { keyword: 'pret', intent: 'pricing_inquiry' },
      { keyword: 'cost', intent: 'pricing_inquiry' },
      { keyword: 'cat costa', intent: 'pricing_inquiry' },
      { keyword: 'programare', intent: 'booking' },
      { keyword: 'consultatie', intent: 'consultation' },
      { keyword: 'urgent', intent: 'urgent' },
      { keyword: 'durere', intent: 'urgent' },
      { keyword: 'rate', intent: 'financing' },
      { keyword: 'finantare', intent: 'financing' },
      { keyword: 'asigurare', intent: 'insurance' },
    ];

    const lowerTranscript = transcript.toLowerCase();

    // Extract procedure mentions
    const procedureMentions = PROCEDURE_KEYWORDS.filter((p) =>
      lowerTranscript.includes(p.keyword)
    ).map((p) => ({
      keyword: p.keyword,
      category: p.category,
      priority: p.priority,
      count: (lowerTranscript.match(new RegExp(p.keyword, 'g')) ?? []).length,
    }));

    // Extract intents
    const detectedIntents = INTENT_KEYWORDS.filter((i) => lowerTranscript.includes(i.keyword)).map(
      (i) => i.intent
    );

    // Unique intents
    const uniqueIntents = [...new Set(detectedIntents)];

    // Calculate priority score
    const priorityScore = procedureMentions.reduce((score, p) => {
      if (p.priority === 'high') return score + 3;
      if (p.priority === 'medium') return score + 2;
      return score + 1;
    }, 0);

    // Determine primary interest
    const highPriorityProcedures = procedureMentions.filter((p) => p.priority === 'high');
    const primaryInterest =
      highPriorityProcedures[0]?.category ?? procedureMentions[0]?.category ?? null;

    logger.info('Keywords extracted', {
      callId,
      procedureCount: procedureMentions.length,
      intentCount: uniqueIntents.length,
      primaryInterest,
      correlationId,
    });

    return {
      success: true,
      callId,
      procedureMentions,
      intents: uniqueIntents,
      primaryInterest,
      priorityScore,
      isHighValue: highPriorityProcedures.length > 0,
    };
  },
});
