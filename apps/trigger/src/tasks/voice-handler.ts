import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone, createEventStore, createInMemoryEventStore } from '@medicalcor/core';
import { createHubSpotClient, createOpenAIClient } from '@medicalcor/integrations';
import { createScoringService, createTriageService } from '@medicalcor/domain';
import type { LeadContext } from '@medicalcor/types';

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

// Initialize clients lazily
function getClients() {
  const hubspotToken = process.env['HUBSPOT_ACCESS_TOKEN'];
  const openaiApiKey = process.env['OPENAI_API_KEY'];
  const databaseUrl = process.env['DATABASE_URL'];

  const hubspot = hubspotToken
    ? createHubSpotClient({ accessToken: hubspotToken })
    : null;

  const openai = openaiApiKey
    ? createOpenAIClient({ apiKey: openaiApiKey })
    : null;

  const scoring = createScoringService({
    openaiApiKey: openaiApiKey ?? '',
    fallbackEnabled: true,
  });

  const triage = createTriageService();

  const eventStore = databaseUrl
    ? createEventStore({ source: 'voice-handler', connectionString: databaseUrl })
    : createInMemoryEventStore('voice-handler');

  return { hubspot, openai, scoring, triage, eventStore };
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
    const { hubspot, openai, scoring, triage, eventStore } = getClients();

    logger.info('Processing voice call', {
      callSid,
      direction,
      status,
      correlationId,
    });

    // Step 1: Normalize phone number
    const phoneResult = normalizeRomanianPhone(from);
    const normalizedPhone = phoneResult.normalized;
    logger.info('Phone normalized', {
      isValid: phoneResult.isValid,
      correlationId,
    });

    // Step 2: Sync contact to HubSpot
    let hubspotContactId: string | undefined;
    if (hubspot) {
      try {
        const hubspotContact = await hubspot.syncContact({
          phone: normalizedPhone,
          properties: {
            lead_source: 'voice',
            last_call_date: new Date().toISOString(),
          },
        });
        hubspotContactId = hubspotContact.id;
        logger.info('HubSpot contact synced', { contactId: hubspotContactId, correlationId });
      } catch (err) {
        logger.error('Failed to sync HubSpot contact', { err, correlationId });
      }
    } else {
      logger.warn('HubSpot client not configured, skipping CRM sync', { correlationId });
    }

    // Step 3: If call completed and we have transcript, process it
    let scoreResult;
    if (status === 'completed' && transcript && hubspot && hubspotContactId) {
      try {
        // Log call to HubSpot timeline
        await hubspot.logCallToTimeline({
          contactId: hubspotContactId,
          callSid,
          duration: duration ? parseInt(duration, 10) : 0,
          transcript,
        });
        logger.info('Call logged to timeline', { contactId: hubspotContactId, correlationId });

        // AI scoring on transcript
        const leadContext: LeadContext = {
          phone: normalizedPhone,
          channel: 'voice',
          firstTouchTimestamp: new Date().toISOString(),
          language: 'ro',
          messageHistory: [{ role: 'user', content: transcript, timestamp: new Date().toISOString() }],
          hubspotContactId,
        };

        scoreResult = await scoring.scoreMessage(leadContext);
        logger.info('Voice lead scored', {
          score: scoreResult.score,
          classification: scoreResult.classification,
          correlationId,
        });

        // Perform triage assessment
        const triageResult = triage.assess({
          leadScore: scoreResult.classification,
          channel: 'voice',
          messageContent: transcript,
          procedureInterest: scoreResult.procedureInterest ?? [],
          hasExistingRelationship: false,
        });

        logger.info('Triage assessment completed', {
          urgencyLevel: triageResult.urgencyLevel,
          routing: triageResult.routingRecommendation,
          correlationId,
        });

        // Analyze sentiment if OpenAI available
        let sentiment: string | undefined;
        if (openai) {
          try {
            const sentimentResult = await openai.analyzeSentiment(transcript);
            sentiment = sentimentResult.sentiment;
            logger.info('Sentiment analyzed', { sentiment, correlationId });
          } catch (err) {
            logger.warn('Failed to analyze sentiment', { err, correlationId });
          }
        }

        // Update contact with score and sentiment
        await hubspot.updateContact(hubspotContactId, {
          lead_score: String(scoreResult.score),
          lead_status: scoreResult.classification,
          last_call_sentiment: sentiment,
          urgency_level: triageResult.urgencyLevel,
        });
        logger.info('Contact updated with voice scoring', { contactId: hubspotContactId, correlationId });

        // Create high-priority task for HOT leads or critical urgency
        if (scoreResult.classification === 'HOT' || triageResult.urgencyLevel === 'critical') {
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `${triageResult.urgencyLevel === 'critical' ? 'URGENT' : 'HOT'} VOICE LEAD: ${normalizedPhone}`,
            body: `${triageResult.notes}\n\nSuggested Action: ${scoreResult.suggestedAction}`,
            priority: triageResult.urgencyLevel === 'critical' ? 'HIGH' : 'MEDIUM',
            dueDate: triageResult.routingRecommendation === 'immediate_callback'
              ? new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
              : new Date(Date.now() + 60 * 60 * 1000), // 1 hour
          });
          logger.info('High-priority task created for voice lead', { correlationId });
        }
      } catch (err) {
        logger.error('Failed to process voice call transcript', { err, correlationId });
      }
    }

    // Step 4: Emit domain event
    try {
      await eventStore.emit({
        type: status === 'completed' ? 'voice.call.completed' : 'voice.call.initiated',
        correlationId,
        aggregateId: normalizedPhone,
        aggregateType: 'lead',
        payload: {
          callSid,
          from: normalizedPhone,
          to,
          direction,
          status,
          duration: duration ? parseInt(duration, 10) : undefined,
          hubspotContactId,
          score: scoreResult?.score,
          classification: scoreResult?.classification,
        },
      });
      logger.info('Domain event emitted', {
        type: status === 'completed' ? 'voice.call.completed' : 'voice.call.initiated',
        correlationId,
      });
    } catch (err) {
      logger.error('Failed to emit domain event', { err, correlationId });
    }

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
    const { callSid, from, duration, transcript, recordingUrl, summary, sentiment, correlationId } = payload;
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

    // Find/create HubSpot contact
    let hubspotContactId: string | undefined;
    if (hubspot) {
      try {
        const contact = await hubspot.syncContact({ phone: normalizedPhone });
        hubspotContactId = contact.id;

        // Log call to timeline with transcript
        await hubspot.logCallToTimeline({
          contactId: hubspotContactId,
          callSid,
          duration,
          transcript: transcript ?? summary ?? 'No transcript available',
          ...(sentiment && { sentiment }),
        });

        logger.info('Call logged to HubSpot', { contactId: hubspotContactId, correlationId });
      } catch (err) {
        logger.error('Failed to log call to HubSpot', { err, correlationId });
      }
    }

    // Score the lead if we have transcript content
    let scoreResult;
    if (transcript && hubspot && hubspotContactId) {
      try {
        const leadContext: LeadContext = {
          phone: normalizedPhone,
          channel: 'voice',
          firstTouchTimestamp: new Date().toISOString(),
          language: 'ro',
          messageHistory: [{ role: 'user', content: transcript, timestamp: new Date().toISOString() }],
          hubspotContactId,
        };

        scoreResult = await scoring.scoreMessage(leadContext);

        // Triage assessment
        const triageResult = triage.assess({
          leadScore: scoreResult.classification,
          channel: 'voice',
          messageContent: transcript,
          procedureInterest: scoreResult.procedureInterest ?? [],
          hasExistingRelationship: false,
        });

        // Update contact
        await hubspot.updateContact(hubspotContactId, {
          lead_score: String(scoreResult.score),
          lead_status: scoreResult.classification,
          last_call_sentiment: sentiment,
          last_call_summary: summary,
        });

        // Create task for HOT leads
        if (scoreResult.classification === 'HOT' || triageResult.escalationRequired) {
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `VOICE LEAD: ${normalizedPhone} - ${scoreResult.classification}`,
            body: `Call Duration: ${duration}s\n\n${triageResult.notes}\n\nSummary: ${summary ?? 'N/A'}`,
            priority: 'HIGH',
          });
        }

        logger.info('Voice lead scored and updated', {
          score: scoreResult.score,
          classification: scoreResult.classification,
          correlationId,
        });
      } catch (err) {
        logger.error('Failed to score voice lead', { err, correlationId });
      }
    }

    // Emit domain event
    try {
      await eventStore.emit({
        type: 'voice.call.processed',
        correlationId,
        aggregateId: normalizedPhone,
        aggregateType: 'lead',
        payload: {
          callSid,
          from: normalizedPhone,
          duration,
          hasTranscript: !!transcript,
          hasRecording: !!recordingUrl,
          hubspotContactId,
          score: scoreResult?.score,
          classification: scoreResult?.classification,
          sentiment,
        },
      });
    } catch (err) {
      logger.error('Failed to emit domain event', { err, correlationId });
    }

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
