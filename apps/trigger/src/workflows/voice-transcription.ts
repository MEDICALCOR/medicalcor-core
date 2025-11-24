import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone } from '@medicalcor/core';
import {
  createIntegrationClients,
  formatTranscriptForCRM,
  extractLeadQualification,
  type VapiTranscript,
  type VapiCallSummary,
} from '@medicalcor/integrations';
import type { TriageResult } from '@medicalcor/domain';
import type { LeadContext, ScoringOutput } from '@medicalcor/types';

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
    const { hubspot, openai, vapi, scoring, triage, eventStore } = getClients();

    logger.info('Starting post-call processing', {
      callId,
      callType,
      duration,
      correlationId,
    });

    // Step 1: Normalize phone number
    const phoneResult = normalizeRomanianPhone(customerPhone);
    const normalizedPhone = phoneResult.normalized;

    // Step 2: Fetch transcript from Vapi
    let transcript: VapiTranscript | null = null;
    let analysis = null;
    let summary: VapiCallSummary | null = null;

    if (vapi) {
      try {
        transcript = await vapi.getTranscript(callId);
        analysis = vapi.analyzeTranscript(transcript);
        summary = vapi.generateCallSummary(transcript, analysis);

        logger.info('Transcript fetched and analyzed', {
          callId,
          messageCount: transcript.messages.length,
          procedureMentions: analysis.procedureMentions,
          urgencyLevel: summary.urgencyLevel,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to fetch transcript from Vapi', { err, callId, correlationId });
      }
    } else {
      logger.warn('Vapi client not configured, skipping transcript fetch', { correlationId });
    }

    // Step 3: Generate AI summary if transcript available
    let aiSummary: string | null = null;
    let sentiment: { sentiment: 'positive' | 'neutral' | 'negative'; confidence: number } | null =
      null;

    if (openai && analysis) {
      try {
        // Generate summary
        aiSummary = await openai.summarize(analysis.fullTranscript, 'ro');
        logger.info('AI summary generated', { callId, correlationId });

        // Analyze sentiment
        sentiment = await openai.analyzeSentiment(analysis.fullTranscript);
        logger.info('Sentiment analyzed', { sentiment: sentiment.sentiment, correlationId });
      } catch (err) {
        logger.error('Failed to generate AI summary', { err, callId, correlationId });
      }
    }

    // Step 4: Score the lead
    let scoreResult = null;
    let triageResult = null;

    if (analysis) {
      try {
        // Build lead context from transcript
        const leadContext: LeadContext = {
          phone: normalizedPhone,
          channel: 'voice',
          firstTouchTimestamp: transcript?.startedAt ?? new Date().toISOString(),
          language: 'ro',
          messageHistory: analysis.customerMessages.map((content) => ({
            role: 'user' as const,
            content,
            timestamp: new Date().toISOString(),
          })),
          hubspotContactId: undefined,
        };

        // AI scoring
        scoreResult = await scoring.scoreMessage(leadContext);

        // Use rule-based extraction as fallback if score is low confidence
        if (scoreResult.confidence < 0.5 && summary) {
          const qualification = extractLeadQualification(summary);
          scoreResult = {
            score: qualification.score,
            classification: qualification.classification,
            confidence: 0.7,
            reasoning: qualification.reason,
            suggestedAction:
              qualification.classification === 'HOT' ? 'Immediate callback' : 'Add to nurture',
            procedureInterest: summary.procedureInterest,
          };
        }

        logger.info('Lead scored from transcript', {
          score: scoreResult.score,
          classification: scoreResult.classification,
          correlationId,
        });

        // Triage assessment
        triageResult = triage.assess({
          leadScore: scoreResult.classification,
          channel: 'voice',
          messageContent: analysis.fullTranscript,
          procedureInterest: scoreResult.procedureInterest ?? [],
          hasExistingRelationship: false,
        });

        logger.info('Triage completed', {
          urgencyLevel: triageResult.urgencyLevel,
          routing: triageResult.routingRecommendation,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to score lead', { err, callId, correlationId });
      }
    }

    // Step 5: Sync to HubSpot
    let hubspotContactId: string | undefined;

    if (hubspot) {
      try {
        // Find or create contact - build input conditionally
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
        hubspotContactId = contact.id;

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

        // Update contact with scoring data
        if (scoreResult) {
          await hubspot.updateContact(hubspotContactId, {
            lead_score: String(scoreResult.score),
            lead_status: scoreResult.classification,
            last_call_sentiment: sentiment?.sentiment,
            last_call_summary: aiSummary ?? summary?.summary,
            procedure_interest: scoreResult.procedureInterest?.join(', '),
          });
        }

        // Create priority task for HOT leads or high_priority/high urgency
        if (
          (scoreResult?.classification === 'HOT' ||
            summary?.urgencyLevel === 'critical' ||
            summary?.urgencyLevel === 'high' ||
            triageResult?.urgencyLevel === 'high_priority' ||
            triageResult?.urgencyLevel === 'high') &&
          triageResult
        ) {
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
        }

        logger.info('HubSpot updated', { hubspotContactId, correlationId });
      } catch (err) {
        logger.error('Failed to sync to HubSpot', { err, callId, correlationId });
      }
    }

    // Step 6: Emit domain event
    try {
      await eventStore.emit({
        type: 'voice.transcript.processed',
        correlationId,
        aggregateId: normalizedPhone,
        aggregateType: 'lead',
        payload: {
          callId,
          from: normalizedPhone,
          callType,
          duration: duration ?? transcript?.duration,
          endedReason,
          hubspotContactId,
          score: scoreResult?.score,
          classification: scoreResult?.classification,
          sentiment: sentiment?.sentiment,
          procedureInterest: scoreResult?.procedureInterest ?? summary?.procedureInterest,
          urgencyLevel: summary?.urgencyLevel ?? triageResult?.urgencyLevel,
          hasTranscript: !!transcript,
        },
      });

      logger.info('Domain event emitted', {
        type: 'voice.transcript.processed',
        correlationId,
      });
    } catch (err) {
      logger.error('Failed to emit domain event', { err, correlationId });
    }

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

    // Note: In production, this would trigger processPostCall.trigger()
    // For now, we return the payload for the API to handle
    logger.info('Post-call processing triggered', { callId: call.id, correlationId });

    return {
      success: true,
      action: 'post_call_triggered',
      postCallPayload,
    };
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
  // eslint-disable-next-line @typescript-eslint/require-await
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

// =============================================================================
// Helper Functions
// =============================================================================

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
