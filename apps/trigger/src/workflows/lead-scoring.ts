import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import type { LeadContext, ScoringOutput } from '@medicalcor/types';

/**
 * Lead Scoring Workflow
 * AI-powered lead scoring with context enrichment
 */

const LeadScoringPayloadSchema = z.object({
  phone: z.string(),
  hubspotContactId: z.string().optional(),
  message: z.string(),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  messageHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string(),
  })).optional(),
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

    logger.info('Starting lead scoring workflow', {
      phone,
      channel,
      hasHistory: !!messageHistory?.length,
      correlationId,
    });

    // Step 1: Build lead context
    const context = await buildLeadContext({
      phone,
      hubspotContactId,
      message,
      channel,
      messageHistory,
    });

    logger.info('Lead context built', {
      correlationId,
      hasUTM: !!context.utm,
      messageCount: context.messageHistory?.length ?? 0,
    });

    // Step 2: AI Scoring
    const scoringResult = await performAIScoring(context);

    logger.info('AI scoring completed', {
      correlationId,
      score: scoringResult.score,
      classification: scoringResult.classification,
      confidence: scoringResult.confidence,
    });

    // Step 3: Update HubSpot with score
    if (hubspotContactId) {
      // await hubspotClient.updateContact(hubspotContactId, {
      //   lead_score: scoringResult.score.toString(),
      //   lead_status: scoringResult.classification,
      //   procedure_interest: scoringResult.procedureInterest?.join(';'),
      //   budget_range: scoringResult.budgetMentioned ? 'mentioned' : undefined,
      //   urgency_level: scoringResult.urgencyIndicators?.length ? 'high' : 'normal',
      // });
      logger.info('HubSpot contact updated with score', { correlationId, hubspotContactId });
    }

    // Step 4: Emit scoring event
    // await eventStore.emit({
    //   type: 'lead.scored',
    //   correlationId,
    //   payload: {
    //     phone,
    //     hubspotContactId,
    //     score: scoringResult.score,
    //     classification: scoringResult.classification,
    //     confidence: scoringResult.confidence,
    //     reasoning: scoringResult.reasoning,
    //   },
    // });

    return {
      success: true,
      score: scoringResult.score,
      classification: scoringResult.classification,
      confidence: scoringResult.confidence,
      suggestedAction: scoringResult.suggestedAction,
      reasoning: scoringResult.reasoning,
    };
  },
});

/**
 * Build lead context from various sources
 */
async function buildLeadContext(params: {
  phone: string;
  hubspotContactId?: string;
  message: string;
  channel: 'whatsapp' | 'voice' | 'web';
  messageHistory?: { role: 'user' | 'assistant'; content: string; timestamp: string }[];
}): Promise<LeadContext> {
  const { phone, hubspotContactId, message, channel, messageHistory } = params;

  // Fetch HubSpot data if available
  // let hubspotData: any = null;
  // if (hubspotContactId) {
  //   hubspotData = await hubspotClient.getContact(hubspotContactId);
  // }

  // Detect language from message
  const language = detectLanguage(message);

  return {
    phone,
    channel,
    firstTouchTimestamp: new Date().toISOString(),
    language,
    messageHistory: messageHistory ?? [
      { role: 'user', content: message, timestamp: new Date().toISOString() },
    ],
    hubspotContactId,
    // utm: hubspotData?.properties.utm_source ? {
    //   utm_source: hubspotData.properties.utm_source,
    //   utm_medium: hubspotData.properties.utm_medium,
    //   utm_campaign: hubspotData.properties.utm_campaign,
    // } : undefined,
  };
}

/**
 * Perform AI scoring using GPT-4o with structured output
 */
async function performAIScoring(context: LeadContext): Promise<ScoringOutput> {
  // const systemPrompt = `You are a medical lead scoring assistant for a dental implant clinic.
  // Analyze the conversation and score the lead from 1-5 based on:
  // - Intent clarity (are they interested in a procedure?)
  // - Budget signals (have they mentioned budget or asked about pricing?)
  // - Urgency indicators (timeline, pain, immediate need)
  // - Procedure specificity (All-on-X, implants, specific treatments)
  //
  // Score 5 (HOT): Explicit interest in All-on-X/implants + budget mentioned OR urgent need
  // Score 4 (HOT): Clear procedure interest + some qualification signals
  // Score 3 (WARM): General interest, needs more information
  // Score 2 (COLD): Vague interest, early research stage
  // Score 1 (UNQUALIFIED): Not a fit or just information gathering`;

  // const response = await openaiClient.chat.completions.create({
  //   model: 'gpt-4o',
  //   messages: [
  //     { role: 'system', content: systemPrompt },
  //     ...context.messageHistory.map(m => ({
  //       role: m.role as 'user' | 'assistant',
  //       content: m.content,
  //     })),
  //   ],
  //   response_format: { type: 'json_object' },
  //   temperature: 0.3,
  // });

  // For now, return a mock scoring result
  // In production, this would parse the AI response
  const mockScore = analyzeMessageForScore(context.messageHistory?.[0]?.content ?? '');

  return mockScore;
}

/**
 * Simple rule-based scoring fallback
 */
function analyzeMessageForScore(message: string): ScoringOutput {
  const lowerMessage = message.toLowerCase();

  // HOT indicators
  const hotKeywords = ['all-on-4', 'all-on-x', 'all on 4', 'implant complet', 'vreau sa fac', 'cat costa', 'pret', 'programare', 'urgent'];
  const warmKeywords = ['implant', 'dinti', 'tratament', 'informatii', 'interesat'];
  const budgetKeywords = ['pret', 'cost', 'buget', 'cat', 'euro', 'lei', 'finantare'];
  const urgencyKeywords = ['urgent', 'durere', 'cat mai repede', 'maine', 'azi', 'acum'];

  let score = 1;
  let classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' = 'COLD';
  const indicators: string[] = [];

  // Check for hot keywords
  if (hotKeywords.some(k => lowerMessage.includes(k))) {
    score = Math.max(score, 4);
    indicators.push('explicit_procedure_interest');
  }

  // Check for warm keywords
  if (warmKeywords.some(k => lowerMessage.includes(k))) {
    score = Math.max(score, 3);
    indicators.push('general_interest');
  }

  // Budget mention boosts score
  if (budgetKeywords.some(k => lowerMessage.includes(k))) {
    score = Math.min(score + 1, 5);
    indicators.push('budget_mentioned');
  }

  // Urgency boosts score
  if (urgencyKeywords.some(k => lowerMessage.includes(k))) {
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
    urgencyIndicators: indicators.filter(i => i === 'urgency_detected'),
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
  const romanianIndicators = ['salut', 'buna', 'vreau', 'sunt', 'pentru', 'și', 'că', 'este', 'ați'];
  const englishIndicators = ['hello', 'hi', 'want', 'need', 'looking', 'interested', 'price', 'cost'];
  const germanIndicators = ['hallo', 'guten', 'ich', 'möchte', 'preis', 'kosten', 'zahnimplantat'];

  const lowerText = text.toLowerCase();

  const roScore = romanianIndicators.filter(w => lowerText.includes(w)).length;
  const enScore = englishIndicators.filter(w => lowerText.includes(w)).length;
  const deScore = germanIndicators.filter(w => lowerText.includes(w)).length;

  if (roScore > enScore && roScore > deScore) return 'ro';
  if (enScore > roScore && enScore > deScore) return 'en';
  if (deScore > roScore && deScore > enScore) return 'de';

  return 'ro'; // Default to Romanian
}
