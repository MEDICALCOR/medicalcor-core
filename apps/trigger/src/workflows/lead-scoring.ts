import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import { createIntegrationClients } from '@medicalcor/integrations';
import type { AIScoringContext, ScoringOutput } from '@medicalcor/types';

/**
 * Lead Scoring Workflow
 * AI-powered lead scoring with context enrichment
 */

/**
 * Initialize clients lazily using shared factory
 */
function getClients() {
  return createIntegrationClients({
    source: 'lead-scoring',
    includeOpenAI: true,
  });
}

export const LeadScoringPayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  message: z.string(),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  messageHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        timestamp: z.string(),
      })
    )
    .optional(),
  correlationId: z.string(),
});

export const scoreLeadWorkflow = task({
  id: 'lead-scoring-workflow',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof LeadScoringPayloadSchema>) => {
    const { phone, hubspotContactId, message, channel, messageHistory, correlationId } = payload;
    const { hubspot, openai, eventStore } = getClients();

    logger.info('Starting lead scoring workflow', {
      phone,
      channel,
      hasHistory: !!messageHistory?.length,
      hasOpenAI: !!openai,
      hasHubSpot: !!hubspot,
      correlationId,
    });

    // Step 1: Build lead context (with HubSpot enrichment)
    const context = await buildLeadContext(
      {
        phone,
        message,
        channel,
        ...(hubspotContactId && { hubspotContactId }),
        ...(messageHistory && { messageHistory }),
      },
      hubspot
    );

    logger.info('Lead context built', {
      correlationId,
      hasUTM: !!context.utm,
      messageCount: context.messageHistory?.length ?? 0,
    });

    // Step 2: AI Scoring (with fallback to rule-based)
    let scoringResult: ScoringOutput;
    if (openai) {
      try {
        scoringResult = await openai.scoreMessage(context);
        logger.info('AI scoring completed', {
          correlationId,
          score: scoringResult.score,
          classification: scoringResult.classification,
          confidence: scoringResult.confidence,
          method: 'ai',
        });
      } catch (error) {
        logger.warn('AI scoring failed, falling back to rule-based', { error, correlationId });
        scoringResult = analyzeMessageForScore(context.messageHistory?.[0]?.content ?? '');
      }
    } else {
      logger.info('No OpenAI client, using rule-based scoring', { correlationId });
      scoringResult = analyzeMessageForScore(context.messageHistory?.[0]?.content ?? '');
    }

    logger.info('Lead scoring completed', {
      correlationId,
      score: scoringResult.score,
      classification: scoringResult.classification,
      confidence: scoringResult.confidence,
    });

    // Step 3: Update HubSpot with score
    if (hubspotContactId && hubspot) {
      try {
        const updateProps: Record<string, string | undefined> = {
          lead_score: scoringResult.score.toString(),
          lead_status: scoringResult.classification.toLowerCase(),
        };
        if (scoringResult.procedureInterest && scoringResult.procedureInterest.length > 0) {
          updateProps.procedure_interest = scoringResult.procedureInterest.join(';');
        }
        if (scoringResult.budgetMentioned) {
          updateProps.budget_range = 'mentioned';
        }
        if (scoringResult.urgencyIndicators && scoringResult.urgencyIndicators.length > 0) {
          updateProps.urgency_level = 'high';
        }
        await hubspot.updateContact(hubspotContactId, updateProps);
        logger.info('HubSpot contact updated with score', { correlationId, hubspotContactId });
      } catch (error) {
        logger.error('Failed to update HubSpot contact', { error, correlationId });
      }
    }

    // Step 4: Emit scoring event
    await emitEvent(eventStore, 'lead.scored', hubspotContactId ?? phone, {
      phone,
      hubspotContactId,
      channel,
      score: scoringResult.score,
      classification: scoringResult.classification,
      confidence: scoringResult.confidence,
      reasoning: scoringResult.reasoning,
      suggestedAction: scoringResult.suggestedAction,
      correlationId,
    });

    logger.info('Lead scoring workflow completed', { correlationId });

    return {
      success: true,
      score: scoringResult.score,
      classification: scoringResult.classification,
      confidence: scoringResult.confidence,
      suggestedAction: scoringResult.suggestedAction,
      reasoning: scoringResult.reasoning,
      procedureInterest: scoringResult.procedureInterest,
      budgetMentioned: scoringResult.budgetMentioned,
      urgencyIndicators: scoringResult.urgencyIndicators,
    };
  },
});

/**
 * Build lead context from various sources
 */
async function buildLeadContext(
  params: {
    phone: string;
    hubspotContactId?: string;
    message: string;
    channel: 'whatsapp' | 'voice' | 'web';
    messageHistory?: { role: 'user' | 'assistant'; content: string; timestamp: string }[];
  },
  hubspot: ReturnType<typeof getClients>['hubspot']
): Promise<AIScoringContext> {
  const { phone, hubspotContactId, message, channel, messageHistory } = params;

  // Fetch HubSpot data if available
  let hubspotData: {
    properties: {
      utm_source?: string | undefined;
      utm_medium?: string | undefined;
      utm_campaign?: string | undefined;
      procedure_interest?: string | undefined;
      hs_language?: string | undefined;
    };
  } | null = null;

  if (hubspotContactId && hubspot) {
    try {
      const contact = await hubspot.getContact(hubspotContactId);
      hubspotData = {
        properties: {
          utm_source: contact.properties.utm_source,
          utm_medium: contact.properties.utm_medium,
          utm_campaign: contact.properties.utm_campaign,
          procedure_interest: contact.properties.procedure_interest,
          hs_language: contact.properties.hs_language,
        },
      };
    } catch (error) {
      logger.warn('Failed to fetch HubSpot contact for context', { error, hubspotContactId });
    }
  }

  // Detect language from message (or use HubSpot preference)
  const hsLanguage = hubspotData?.properties.hs_language;
  const language: 'ro' | 'en' | 'de' | undefined =
    hsLanguage === 'ro' || hsLanguage === 'en' || hsLanguage === 'de'
      ? hsLanguage
      : detectLanguage(message);

  // Build context with enrichment from HubSpot
  const context: AIScoringContext = {
    phone,
    channel,
    firstTouchTimestamp: new Date().toISOString(),
    language,
    messageHistory: messageHistory ?? [
      { role: 'user', content: message, timestamp: new Date().toISOString() },
    ],
    hubspotContactId,
  };

  // Add UTM data if available
  const utmSource = hubspotData?.properties.utm_source;
  if (utmSource) {
    context.utm = {
      utm_source: utmSource,
    };
    const utmMedium = hubspotData?.properties.utm_medium;
    if (utmMedium) {
      context.utm.utm_medium = utmMedium;
    }
    const utmCampaign = hubspotData?.properties.utm_campaign;
    if (utmCampaign) {
      context.utm.utm_campaign = utmCampaign;
    }
  }

  return context;
}

/**
 * Simple rule-based scoring fallback
 */
function analyzeMessageForScore(message: string): ScoringOutput {
  const lowerMessage = message.toLowerCase();

  // HOT indicators
  const hotKeywords = [
    'all-on-4',
    'all-on-x',
    'all on 4',
    'implant complet',
    'vreau sa fac',
    'cat costa',
    'pret',
    'programare',
    'urgent',
  ];
  const warmKeywords = ['implant', 'dinti', 'tratament', 'informatii', 'interesat'];
  const budgetKeywords = ['pret', 'cost', 'buget', 'cat', 'euro', 'lei', 'finantare'];
  const urgencyKeywords = ['urgent', 'durere', 'cat mai repede', 'maine', 'azi', 'acum'];

  let score = 1;
  let classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' = 'COLD';
  const indicators: string[] = [];

  // Check for hot keywords
  if (hotKeywords.some((k) => lowerMessage.includes(k))) {
    score = Math.max(score, 4);
    indicators.push('explicit_procedure_interest');
  }

  // Check for warm keywords
  if (warmKeywords.some((k) => lowerMessage.includes(k))) {
    score = Math.max(score, 3);
    indicators.push('general_interest');
  }

  // Budget mention boosts score
  if (budgetKeywords.some((k) => lowerMessage.includes(k))) {
    score = Math.min(score + 1, 5);
    indicators.push('budget_mentioned');
  }

  // Urgency boosts score
  if (urgencyKeywords.some((k) => lowerMessage.includes(k))) {
    score = Math.min(score + 1, 5);
    indicators.push('urgency_detected');
  }

  // Determine classification
  if (score >= 4) classification = 'HOT';
  else if (score === 3) classification = 'WARM';
  else if (score === 2) classification = 'COLD';
  else classification = 'UNQUALIFIED';

  return {
    score,
    classification,
    confidence: 0.7, // Rule-based has lower confidence than AI
    reasoning: `Score based on keyword analysis: ${indicators.join(', ')}`,
    suggestedAction: getSuggestedAction(classification),
    urgencyIndicators: indicators.filter((i) => i === 'urgency_detected'),
    budgetMentioned: indicators.includes('budget_mentioned'),
  };
}

function getSuggestedAction(classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED'): string {
  switch (classification) {
    case 'HOT':
      return 'Contactați imediat acest lead. Oferă informații despre prețuri și programare.';
    case 'WARM':
      return 'Trimiteți informații suplimentare despre proceduri și beneficii.';
    case 'COLD':
      return 'Adăugați în secvența de nurture și urmăriți interesul.';
    case 'UNQUALIFIED':
      return 'Răspundeți politicos și oferiți informații generale.';
  }
}

function detectLanguage(text: string): 'ro' | 'en' | 'de' | undefined {
  const romanianIndicators = [
    'salut',
    'buna',
    'vreau',
    'sunt',
    'pentru',
    'și',
    'că',
    'este',
    'ați',
  ];
  const englishIndicators = [
    'hello',
    'hi',
    'want',
    'need',
    'looking',
    'interested',
    'price',
    'cost',
  ];
  const germanIndicators = ['hallo', 'guten', 'ich', 'möchte', 'preis', 'kosten', 'zahnimplantat'];

  const lowerText = text.toLowerCase();

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
  const aggregateType = type.split('.')[0];
  const input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateId?: string;
    aggregateType?: string;
  } = {
    type,
    correlationId,
    payload,
    aggregateId,
  };
  if (aggregateType) {
    input.aggregateType = aggregateType;
  }
  await eventStore.emit(input);
}
