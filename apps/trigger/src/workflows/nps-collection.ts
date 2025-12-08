import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import { createIntegrationClients } from '@medicalcor/integrations';
import {
  NPSCollectionPayloadSchema,
  classifyNPSScore,
  requiresImmediateFollowUp,
  getFollowUpPriority,
} from '@medicalcor/types';

/**
 * NPS Collection Workflow (M11 Milestone)
 *
 * Handles the complete NPS survey lifecycle:
 * 1. Check consent and survey eligibility
 * 2. Schedule survey delivery with configurable delay
 * 3. Send survey via WhatsApp/SMS
 * 4. Process responses
 * 5. Sync scores to CRM
 * 6. Trigger follow-ups for detractors
 */

// ============================================
// Client Initialization
// ============================================

function getClients() {
  return createIntegrationClients({
    source: 'nps-collection',
    includeOpenAI: true,
    includeConsent: true,
  });
}

// ============================================
// Constants
// ============================================

const NPS_SURVEY_TEMPLATES = {
  ro: {
    post_appointment: 'nps_post_appointment_ro',
    post_treatment: 'nps_post_treatment_ro',
    periodic: 'nps_periodic_ro',
    post_onboarding: 'nps_onboarding_ro',
    manual: 'nps_general_ro',
  },
  en: {
    post_appointment: 'nps_post_appointment_en',
    post_treatment: 'nps_post_treatment_en',
    periodic: 'nps_periodic_en',
    post_onboarding: 'nps_onboarding_en',
    manual: 'nps_general_en',
  },
  de: {
    post_appointment: 'nps_post_appointment_de',
    post_treatment: 'nps_post_treatment_de',
    periodic: 'nps_periodic_de',
    post_onboarding: 'nps_onboarding_de',
    manual: 'nps_general_de',
  },
} as const;

const MIN_DAYS_BETWEEN_SURVEYS = 30;
const SURVEY_EXPIRY_HOURS = 72; // 3 days

// ============================================
// Main NPS Collection Workflow
// ============================================

export const npsCollectionWorkflow = task({
  id: 'nps-collection-workflow',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof NPSCollectionPayloadSchema>) => {
    const {
      phone,
      hubspotContactId,
      patientId,
      triggerType,
      appointmentId,
      procedureType,
      channel,
      language,
      delayMinutes,
      correlationId,
    } = payload;

    const { hubspot, whatsapp, eventStore, consent } = getClients();
    const surveyId = crypto.randomUUID();

    logger.info('Starting NPS collection workflow', {
      surveyId,
      phone,
      triggerType,
      channel,
      language,
      delayMinutes,
      correlationId,
    });

    // Step 1: Check consent for survey delivery
    const hasConsent = await checkSurveyConsent(phone, hubspotContactId, consent, hubspot);
    if (!hasConsent) {
      logger.info('NPS survey skipped - no consent', { surveyId, phone, correlationId });

      await emitEvent(eventStore, 'nps.survey_skipped', surveyId, {
        surveyId,
        phone,
        hubspotContactId,
        reason: 'no_consent',
        correlationId,
      });

      return {
        success: false,
        surveyId,
        status: 'skipped',
        reason: 'no_consent',
      };
    }

    // Step 2: Check survey frequency limit
    const canSendSurvey = await checkSurveyFrequency(phone, hubspot);
    if (!canSendSurvey) {
      logger.info('NPS survey skipped - recent survey exists', { surveyId, phone, correlationId });

      await emitEvent(eventStore, 'nps.survey_skipped', surveyId, {
        surveyId,
        phone,
        hubspotContactId,
        reason: 'recent_survey',
        details: `Survey sent within last ${MIN_DAYS_BETWEEN_SURVEYS} days`,
        correlationId,
      });

      return {
        success: false,
        surveyId,
        status: 'skipped',
        reason: 'recent_survey',
      };
    }

    // Step 3: Schedule survey (emit scheduled event)
    const scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000);
    const expiresAt = new Date(scheduledFor.getTime() + SURVEY_EXPIRY_HOURS * 60 * 60 * 1000);

    await emitEvent(eventStore, 'nps.survey_scheduled', surveyId, {
      surveyId,
      phone,
      hubspotContactId,
      patientId,
      triggerType,
      appointmentId,
      procedureType,
      channel,
      language,
      scheduledFor: scheduledFor.toISOString(),
      expiresAt: expiresAt.toISOString(),
      correlationId,
    });

    logger.info('NPS survey scheduled', {
      surveyId,
      scheduledFor: scheduledFor.toISOString(),
      delayMinutes,
      correlationId,
    });

    // Step 4: Wait for the configured delay
    if (delayMinutes > 0) {
      await wait.for({ minutes: delayMinutes });
    }

    // Step 5: Send the survey
    const templateName =
      NPS_SURVEY_TEMPLATES[language]?.[triggerType] ??
      NPS_SURVEY_TEMPLATES[language]?.manual ??
      'nps_general_ro';

    let messageId: string | undefined;

    if (channel === 'whatsapp' && whatsapp) {
      try {
        // Get patient name from HubSpot
        let patientName = 'Pacient';
        if (hubspotContactId && hubspot) {
          try {
            const contact = await hubspot.getContact(hubspotContactId);
            patientName = contact.properties.firstname ?? 'Pacient';
          } catch {
            // Use default name
          }
        }

        const response = await whatsapp.sendTemplate({
          to: phone,
          templateName,
          language: language === 'ro' ? 'ro' : language === 'de' ? 'de' : 'en',
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: patientName }],
            },
          ],
        });

        messageId = response.messages?.[0]?.id;

        logger.info('NPS survey sent via WhatsApp', {
          surveyId,
          phone,
          templateName,
          messageId,
          correlationId,
        });
      } catch (error) {
        logger.error('Failed to send NPS survey via WhatsApp', {
          surveyId,
          phone,
          error,
          correlationId,
        });

        await emitEvent(eventStore, 'nps.survey_expired', surveyId, {
          surveyId,
          phone,
          hubspotContactId,
          triggerType,
          channel,
          sentAt: new Date().toISOString(),
          expiredAt: new Date().toISOString(),
          reason: 'undelivered',
          correlationId,
        });

        return {
          success: false,
          surveyId,
          status: 'failed',
          reason: 'delivery_failed',
          error: String(error),
        };
      }
    }

    // Step 6: Emit survey sent event
    await emitEvent(eventStore, 'nps.survey_sent', surveyId, {
      surveyId,
      phone,
      hubspotContactId,
      channel,
      templateName,
      messageId,
      sentAt: new Date().toISOString(),
      correlationId,
    });

    // Step 7: Update CRM with survey sent status
    if (hubspotContactId && hubspot) {
      try {
        await hubspot.updateContact(hubspotContactId, {
          nps_last_survey_sent: new Date().toISOString(),
          nps_survey_status: 'sent',
          nps_survey_id: surveyId,
        });
        logger.info('Updated HubSpot with NPS survey status', {
          surveyId,
          hubspotContactId,
          correlationId,
        });
      } catch (error) {
        logger.warn('Failed to update HubSpot with survey status', {
          surveyId,
          hubspotContactId,
          error,
          correlationId,
        });
      }
    }

    return {
      success: true,
      surveyId,
      status: 'sent',
      messageId,
      scheduledFor: scheduledFor.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  },
});

// ============================================
// NPS Response Processing Workflow
// ============================================

export const NPSResponsePayloadSchema = z.object({
  surveyId: z.string().uuid(),
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  messageContent: z.string(),
  channel: z.enum(['whatsapp', 'sms', 'email', 'web']),
  receivedAt: z.coerce.date(),
  correlationId: z.string(),
});

export const processNPSResponseWorkflow = task({
  id: 'process-nps-response',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof NPSResponsePayloadSchema>) => {
    const { surveyId, phone, hubspotContactId, messageContent, channel, receivedAt, correlationId } =
      payload;

    const { hubspot, whatsapp, openai, eventStore } = getClients();
    const responseId = crypto.randomUUID();

    logger.info('Processing NPS response', {
      surveyId,
      responseId,
      phone,
      messageLength: messageContent.length,
      correlationId,
    });

    // Step 1: Parse NPS score from message
    const scoreResult = parseNPSScore(messageContent);

    if (!scoreResult.success) {
      logger.info('Could not parse NPS score from message', {
        surveyId,
        phone,
        messageContent: messageContent.substring(0, 100),
        correlationId,
      });

      // Send clarification message
      if (whatsapp) {
        await whatsapp.sendText({
          to: phone,
          text: 'Vă rugăm să răspundeți cu un număr de la 0 la 10 pentru a evalua experiența dumneavoastră.',
        });
      }

      return {
        success: false,
        responseId,
        reason: 'invalid_score',
        message: 'Could not parse score from response',
      };
    }

    const score = scoreResult.score;
    const classification = classifyNPSScore(score);
    const feedback = scoreResult.feedback;

    logger.info('NPS score parsed', {
      surveyId,
      responseId,
      score,
      classification,
      hasFeedback: !!feedback,
      correlationId,
    });

    // Step 2: Analyze feedback if present
    let sentimentScore: number | undefined;
    let detectedThemes: string[] | undefined;

    if (feedback && feedback.length > 10 && openai) {
      try {
        const analysis = await analyzeNPSFeedback(feedback, openai);
        sentimentScore = analysis.sentimentScore;
        detectedThemes = analysis.themes;

        await emitEvent(eventStore, 'nps.feedback_analyzed', responseId, {
          responseId,
          phone,
          score,
          feedback,
          sentimentScore,
          detectedThemes,
          language: detectLanguage(feedback),
          analysisMethod: 'ai',
          correlationId,
        });

        logger.info('NPS feedback analyzed', {
          surveyId,
          responseId,
          sentimentScore,
          themesCount: detectedThemes.length,
          correlationId,
        });
      } catch (error) {
        logger.warn('Failed to analyze NPS feedback', { error, correlationId });
      }
    }

    // Step 3: Calculate response latency (would need survey sent timestamp from DB)
    const responseLatencyMinutes = 0; // Placeholder - would be calculated from DB

    // Step 4: Emit response received event
    await emitEvent(eventStore, 'nps.response_received', surveyId, {
      surveyId,
      responseId,
      phone,
      hubspotContactId,
      score,
      classification,
      feedback,
      channel,
      responseLatencyMinutes,
      respondedAt: receivedAt.toISOString(),
      triggerType: 'post_appointment', // Would be fetched from survey record
      correlationId,
    });

    // Step 5: Send thank you message
    if (whatsapp) {
      const thankYouMessages = {
        promoter:
          'Mulțumim foarte mult pentru evaluarea excelentă! Suntem bucuroși că v-am oferit o experiență plăcută. 🙏',
        passive:
          'Mulțumim pentru feedback! Apreciem sinceritatea dumneavoastră și vom lucra să ne îmbunătățim.',
        detractor:
          'Vă mulțumim pentru feedback. Ne pare rău că experiența nu a fost la nivelul așteptărilor. Un coleg vă va contacta în curând.',
      };

      await whatsapp.sendText({
        to: phone,
        text: thankYouMessages[classification],
      });
    }

    // Step 6: Sync to CRM
    if (hubspotContactId && hubspot) {
      try {
        const updateProps: Record<string, string> = {
          nps_score: score.toString(),
          nps_classification: classification,
          nps_last_response_date: new Date().toISOString(),
          nps_survey_status: 'responded',
        };

        if (feedback) {
          updateProps.nps_last_feedback = feedback.substring(0, 500);
        }

        if (sentimentScore !== undefined) {
          updateProps.nps_sentiment = sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral';
        }

        await hubspot.updateContact(hubspotContactId, updateProps);

        await emitEvent(eventStore, 'nps.score_synced', responseId, {
          responseId,
          phone,
          hubspotContactId,
          score,
          classification,
          properties: updateProps,
          syncedAt: new Date().toISOString(),
          correlationId,
        });

        logger.info('NPS score synced to HubSpot', {
          surveyId,
          responseId,
          hubspotContactId,
          score,
          classification,
          correlationId,
        });
      } catch (error) {
        logger.error('Failed to sync NPS score to HubSpot', {
          error,
          hubspotContactId,
          correlationId,
        });
      }
    }

    // Step 7: Handle detractors - trigger follow-up
    if (classification === 'detractor') {
      const needsImmediateFollowUp = requiresImmediateFollowUp(score, feedback);
      const priority = getFollowUpPriority(score, feedback);

      const dueDate = new Date();
      if (priority === 'critical') {
        dueDate.setHours(dueDate.getHours() + 2); // 2 hours for critical
      } else if (priority === 'high') {
        dueDate.setHours(dueDate.getHours() + 24); // 24 hours for high
      } else {
        dueDate.setHours(dueDate.getHours() + 48); // 48 hours for medium/low
      }

      await emitEvent(eventStore, 'nps.follow_up_required', responseId, {
        responseId,
        phone,
        hubspotContactId,
        score,
        classification,
        feedback,
        priority,
        reason: `Detractor score: ${score}/10`,
        dueDate: dueDate.toISOString(),
        correlationId,
      });

      // Create HubSpot task for follow-up
      if (hubspotContactId && hubspot) {
        try {
          await hubspot.createTask({
            contactId: hubspotContactId,
            subject: `[NPS Follow-up] Detractor - Score ${score}/10`,
            body: `Patient ${phone} gave an NPS score of ${score}/10.\n\nFeedback: ${feedback ?? 'No feedback provided'}\n\nPriority: ${priority}`,
            dueDate,
            priority: priority === 'critical' ? 'HIGH' : priority === 'high' ? 'MEDIUM' : 'LOW',
          });

          logger.info('Created HubSpot task for NPS follow-up', {
            surveyId,
            responseId,
            hubspotContactId,
            priority,
            correlationId,
          });
        } catch (error) {
          logger.error('Failed to create HubSpot follow-up task', {
            error,
            hubspotContactId,
            correlationId,
          });
        }
      }

      logger.info('NPS detractor follow-up triggered', {
        surveyId,
        responseId,
        score,
        priority,
        needsImmediateFollowUp,
        correlationId,
      });
    }

    return {
      success: true,
      responseId,
      surveyId,
      score,
      classification,
      hasFeedback: !!feedback,
      sentimentScore,
      detectedThemes,
      followUpRequired: classification === 'detractor',
    };
  },
});

// ============================================
// Helper Functions
// ============================================

/**
 * Check if patient has consent for NPS surveys
 */
async function checkSurveyConsent(
  phone: string,
  hubspotContactId: string | undefined,
  consent: ReturnType<typeof getClients>['consent'],
  hubspot: ReturnType<typeof getClients>['hubspot']
): Promise<boolean> {
  // Check consent service if available
  if (consent) {
    try {
      const hasConsent = await consent.hasValidConsent(phone, 'treatment_updates');
      if (hasConsent) {
        return true;
      }
    } catch {
      // Fall back to HubSpot check
    }
  }

  // Check HubSpot consent properties
  if (hubspotContactId && hubspot) {
    try {
      const contact = await hubspot.getContact(hubspotContactId);
      const props = contact.properties;

      // Accept marketing or medical_data consent for NPS
      if (props.consent_marketing === 'true' || props.consent_medical_data === 'true') {
        return true;
      }
    } catch {
      // Consent check failed
    }
  }

  return false;
}

/**
 * Check if enough time has passed since last survey
 */
async function checkSurveyFrequency(
  phone: string,
  hubspot: ReturnType<typeof getClients>['hubspot']
): Promise<boolean> {
  if (!hubspot) return true;

  try {
    // Search for contact by phone
    const searchResult = await hubspot.searchContacts({
      filterGroups: [
        {
          filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }],
        },
      ],
      properties: ['nps_last_survey_sent'],
      limit: 1,
    });

    if (searchResult.results.length === 0) {
      return true; // No contact found, allow survey
    }

    const contact = searchResult.results[0] as { properties: Record<string, string | undefined> };
    const lastSurveySent = contact.properties.nps_last_survey_sent;

    if (!lastSurveySent) {
      return true; // No previous survey
    }

    const lastSurveyDate = new Date(lastSurveySent);
    const daysSinceLastSurvey = Math.floor(
      (Date.now() - lastSurveyDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return daysSinceLastSurvey >= MIN_DAYS_BETWEEN_SURVEYS;
  } catch {
    return true; // Allow survey if check fails
  }
}

/**
 * Parse NPS score from message content
 */
function parseNPSScore(message: string): { success: true; score: number; feedback?: string } | { success: false } {
  const trimmed = message.trim();

  // Try to extract a number 0-10 from the beginning of the message
  const numberMatch = /^(\d{1,2})(?:\s|$|[.,!?\-\/])/.exec(trimmed);

  if (numberMatch) {
    const score = parseInt(numberMatch[1]!, 10);
    if (score >= 0 && score <= 10) {
      // Extract any remaining text as feedback
      const feedback = trimmed.substring(numberMatch[0].length).trim() || undefined;
      return { success: true, score, feedback };
    }
  }

  // Try to find a number anywhere in a short message
  if (trimmed.length <= 20) {
    const anyNumberMatch = /(\d{1,2})/.exec(trimmed);
    if (anyNumberMatch) {
      const score = parseInt(anyNumberMatch[1]!, 10);
      if (score >= 0 && score <= 10) {
        return { success: true, score };
      }
    }
  }

  // Handle word numbers (Romanian)
  const wordToNumber: Record<string, number> = {
    zero: 0,
    unu: 1,
    doi: 2,
    trei: 3,
    patru: 4,
    cinci: 5,
    sase: 6,
    șase: 6,
    sapte: 7,
    șapte: 7,
    opt: 8,
    noua: 9,
    nouă: 9,
    zece: 10,
    // English
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };

  const lowerMessage = trimmed.toLowerCase();
  for (const [word, score] of Object.entries(wordToNumber)) {
    if (lowerMessage.includes(word)) {
      return { success: true, score };
    }
  }

  return { success: false };
}

/**
 * Analyze NPS feedback using AI
 */
async function analyzeNPSFeedback(
  feedback: string,
  openai: NonNullable<ReturnType<typeof getClients>['openai']>
): Promise<{ sentimentScore: number; themes: string[] }> {
  const prompt = `Analyze this patient feedback for a dental clinic:
"${feedback}"

Respond in JSON format with:
1. sentimentScore: number between -1 (very negative) and 1 (very positive)
2. themes: array of detected themes from this list: staff_friendly, professional_care, clean_clinic, short_wait, good_communication, pain_management, long_wait, expensive, poor_communication, pain_issue, scheduling_issue, more_info_needed, online_booking

Example response: {"sentimentScore": 0.5, "themes": ["staff_friendly", "professional_care"]}`;

  try {
    const content = await openai.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 200,
      jsonMode: true,
    });

    const parsed = JSON.parse(content) as { sentimentScore?: number; themes?: string[] };

    return {
      sentimentScore: parsed.sentimentScore ?? 0,
      themes: parsed.themes ?? [],
    };
  } catch {
    return { sentimentScore: 0, themes: [] };
  }
}

/**
 * Detect language from text
 */
function detectLanguage(text: string): 'ro' | 'en' | 'de' {
  const lowerText = text.toLowerCase();

  const romanianIndicators = ['foarte', 'bine', 'mulțumesc', 'că', 'și', 'pentru', 'este'];
  const englishIndicators = ['very', 'good', 'thank', 'that', 'and', 'for', 'is', 'the'];
  const germanIndicators = ['sehr', 'gut', 'danke', 'dass', 'und', 'für', 'ist', 'der'];

  const roScore = romanianIndicators.filter((w) => lowerText.includes(w)).length;
  const enScore = englishIndicators.filter((w) => lowerText.includes(w)).length;
  const deScore = germanIndicators.filter((w) => lowerText.includes(w)).length;

  if (roScore > enScore && roScore > deScore) return 'ro';
  if (enScore > roScore && enScore > deScore) return 'en';
  if (deScore > roScore && deScore > enScore) return 'de';

  return 'ro'; // Default to Romanian
}

/**
 * Helper to emit domain events
 */
async function emitEvent(
  eventStore: {
    emit: (input: {
      type: string;
      correlationId: string;
      payload: Record<string, unknown>;
      aggregateId?: string;
      aggregateType?: string;
    }) => Promise<unknown>;
  },
  type: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || crypto.randomUUID();
  try {
    await eventStore.emit({
      type,
      correlationId,
      payload,
      aggregateId,
      aggregateType: 'Patient',
    });
  } catch (error) {
    logger.warn('Failed to emit event', { type, error });
  }
}
