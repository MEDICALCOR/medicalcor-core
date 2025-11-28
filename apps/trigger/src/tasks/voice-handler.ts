import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { normalizeRomanianPhone } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import type { AIScoringContext } from '@medicalcor/types';

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
      // GDPR COMPLIANCE: Verify data processing consent before analyzing personal data
      if (consent) {
        try {
          const consentCheck = await consent.hasRequiredConsents(hubspotContactId);
          if (!consentCheck.valid) {
            logger.warn('Missing GDPR consent for voice data processing', {
              contactId: hubspotContactId,
              missingConsents: consentCheck.missing,
              correlationId,
            });
            // Skip AI processing but still log basic call metadata (legitimate interest)
            await hubspot.logCallToTimeline({
              contactId: hubspotContactId,
              callSid,
              duration: duration ? parseInt(duration, 10) : 0,
              transcript: '[Transcript not processed - consent required]',
            });
            logger.info('Logged call without transcript processing due to missing consent', {
              correlationId,
            });
            // Continue to emit event but skip scoring
            return {
              status: 'consent_required',
              hubspotContactId,
              missingConsents: consentCheck.missing,
            };
          }
          logger.info('GDPR consent verified for voice processing', { correlationId });
        } catch (err) {
          logger.error('Failed to verify GDPR consent', { err, correlationId });
          // CRITICAL: Fail safe - do not process without consent verification
          // This applies in ALL environments to prevent accidental data processing
          throw new Error('Cannot process voice data: consent verification failed');
        }
      } else {
        // CRITICAL: Consent service is required for GDPR compliance
        logger.error('Consent service not configured', { correlationId });
        throw new Error('Consent service required for GDPR compliance');
      }

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
        if (!scoring || !triage) {
          logger.warn('Scoring or triage service not available', { correlationId });
        } else {
          const leadContext: AIScoringContext = {
            phone: normalizedPhone,
            channel: 'voice',
            firstTouchTimestamp: new Date().toISOString(),
            language: 'ro',
            messageHistory: [
              { role: 'user', content: transcript, timestamp: new Date().toISOString() },
            ],
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
          logger.info('Contact updated with voice scoring', {
            contactId: hubspotContactId,
            correlationId,
          });

          // Create priority task for HOT leads or high_priority scheduling requests
          if (
            scoreResult.classification === 'HOT' ||
            triageResult.urgencyLevel === 'high_priority' ||
            triageResult.urgencyLevel === 'high'
          ) {
            // Get notification contacts for priority cases
            const notificationContacts = triage.getNotificationContacts(triageResult.urgencyLevel);
          const contactsInfo =
            notificationContacts.length > 0 ? `\n\nNotify: ${notificationContacts.join(', ')}` : '';

          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `${triageResult.urgencyLevel === 'high_priority' ? 'PRIORITY REQUEST' : 'HIGH PRIORITY'} - Voice Lead: ${normalizedPhone}`,
            body: `${triageResult.urgencyLevel === 'high_priority' ? 'Patient reported discomfort. Wants quick appointment.\n\n' : ''}${triageResult.notes}\n\nSuggested Action: ${scoreResult.suggestedAction}${contactsInfo}`,
            priority: triageResult.urgencyLevel === 'high_priority' ? 'HIGH' : 'MEDIUM',
            dueDate:
              triageResult.routingRecommendation === 'next_available_slot'
                ? new Date(Date.now() + 30 * 60 * 1000) // 30 minutes during business hours
                : new Date(Date.now() + 60 * 60 * 1000), // 1 hour
          });
            logger.info('Priority task created for voice lead', {
              notificationContacts,
              correlationId,
            });
          }
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
    if (transcript && hubspot && hubspotContactId && scoring && triage) {
      try {
        const leadContext: AIScoringContext = {
          phone: normalizedPhone,
          channel: 'voice',
          firstTouchTimestamp: new Date().toISOString(),
          language: 'ro',
          messageHistory: [
            { role: 'user', content: transcript, timestamp: new Date().toISOString() },
          ],
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

        // Create task for HOT leads or priority scheduling requests
        if (
          scoreResult.classification === 'HOT' ||
          triageResult.prioritySchedulingRequested ||
          triageResult.urgencyLevel === 'high'
        ) {
          // Get notification contacts for priority cases
          const notificationContacts = triage.getNotificationContacts(triageResult.urgencyLevel);
          const contactsInfo =
            notificationContacts.length > 0 ? `\n\nNotify: ${notificationContacts.join(', ')}` : '';

          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `${triageResult.urgencyLevel === 'high_priority' ? 'PRIORITY REQUEST' : 'HIGH PRIORITY'} - Voice Lead: ${normalizedPhone}`,
            body: `${triageResult.urgencyLevel === 'high_priority' ? 'Patient reported discomfort. Wants quick appointment.\n\n' : ''}Call Duration: ${duration}s\n\n${triageResult.notes}\n\nSummary: ${summary ?? 'N/A'}${contactsInfo}`,
            priority: triageResult.urgencyLevel === 'high_priority' ? 'HIGH' : 'MEDIUM',
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
