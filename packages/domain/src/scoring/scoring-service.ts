import type { AIScoringContext, ScoringOutput, LeadScore } from '@medicalcor/types';

/**
 * AI Scoring Service
 * Provides lead scoring functionality with GPT-4o integration
 */

export interface ScoringServiceConfig {
  openaiApiKey: string;
  model?: string;
  fallbackEnabled?: boolean;
}

export interface ScoringServiceDeps {
  openai?: OpenAIClient;
}

interface OpenAIClient {
  chat: {
    completions: {
      create: (params: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }>;
    };
  };
}

/**
 * Scoring rules based on medical CRM requirements
 */
const SCORING_RULES = {
  // Explicit All-on-X interest + budget = HOT (5)
  allOnXWithBudget: {
    keywords: ['all-on-4', 'all-on-x', 'all on 4', 'all on x', 'all-on-6'],
    budgetKeywords: ['pret', 'cost', 'buget', 'euro', 'lei', 'cat costa'],
    score: 5,
  },
  // Urgent need indicators = boost +1
  urgencyIndicators: ['urgent', 'durere', 'imediat', 'cat mai repede', 'maine', 'azi', 'acum', 'nu mai pot'],
  // Procedure interest keywords
  procedureKeywords: {
    implant: ['implant', 'implante', 'implantologie'],
    allOnX: ['all-on-4', 'all-on-x', 'all on 4', 'arcada completa'],
    veneer: ['fatete', 'veneer', 'fateta'],
    whitening: ['albire', 'whitening'],
    extraction: ['extractie', 'scoatere dinte'],
  },
  // Budget mentions
  budgetKeywords: ['pret', 'cost', 'buget', 'cat costa', 'finantare', 'rate', 'euro', 'lei'],
};

export class ScoringService {
  private config: ScoringServiceConfig;
  private openai: OpenAIClient | undefined;

  constructor(config: ScoringServiceConfig, deps?: ScoringServiceDeps) {
    this.config = config;
    this.openai = deps?.openai;
  }

  /**
   * Score a lead based on message content and context
   */
  async scoreMessage(context: AIScoringContext): Promise<ScoringOutput> {
    // Try AI scoring first
    if (this.openai && this.config.openaiApiKey) {
      try {
        return await this.aiScore(context);
      } catch (error) {
        if (!this.config.fallbackEnabled) {
          throw error;
        }
        // Fall back to rule-based scoring
      }
    }

    // Rule-based scoring fallback
    return this.ruleBasedScore(context);
  }

  /**
   * AI-powered scoring using GPT-4o
   */
  private async aiScore(context: AIScoringContext): Promise<ScoringOutput> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    const response = await this.openai!.chat.completions.create({
      model: this.config.model ?? 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    return this.parseAIResponse(content);
  }

  /**
   * Rule-based scoring fallback
   */
  ruleBasedScore(context: AIScoringContext): ScoringOutput {
    const lastMessage = context.messageHistory?.[context.messageHistory.length - 1]?.content ?? '';
    const allMessages = context.messageHistory?.map((m: { content: string }) => m.content).join(' ') ?? lastMessage;
    const lowerContent = allMessages.toLowerCase();

    let score = 1;
    const indicators: string[] = [];
    const procedures: string[] = [];

    // Check for All-on-X + budget combination (HOT)
    const hasAllOnX = SCORING_RULES.allOnXWithBudget.keywords.some(k => lowerContent.includes(k));
    const hasBudgetMention = SCORING_RULES.budgetKeywords.some(k => lowerContent.includes(k));

    if (hasAllOnX && hasBudgetMention) {
      score = 5;
      indicators.push('all_on_x_with_budget');
      procedures.push('All-on-X');
    } else if (hasAllOnX) {
      score = 4;
      indicators.push('all_on_x_interest');
      procedures.push('All-on-X');
    }

    // Check procedure interests
    for (const [procedure, keywords] of Object.entries(SCORING_RULES.procedureKeywords)) {
      if (keywords.some(k => lowerContent.includes(k))) {
        if (!procedures.includes(procedure)) {
          procedures.push(procedure);
        }
        if (score < 3) score = 3;
        indicators.push(`${procedure}_interest`);
      }
    }

    // Check urgency (boost score - pain/urgency indicates high purchase intent)
    const hasUrgency = SCORING_RULES.urgencyIndicators.some(k => lowerContent.includes(k));
    if (hasUrgency) {
      score = Math.min(score + 1, 5);
      indicators.push('priority_scheduling_requested');
    }

    // Check budget mention (boost score)
    if (hasBudgetMention && !indicators.includes('all_on_x_with_budget')) {
      score = Math.min(score + 1, 5);
      indicators.push('budget_mentioned');
    }

    // Determine classification
    const classification = this.scoreToClassification(score);

    return {
      score,
      classification,
      confidence: 0.7, // Rule-based has lower confidence
      reasoning: `Rule-based scoring: ${indicators.join(', ') || 'no specific indicators'}`,
      suggestedAction: this.getSuggestedAction(classification, context.language),
      detectedIntent: indicators[0],
      urgencyIndicators: hasUrgency ? ['priority_scheduling_requested'] : [],
      budgetMentioned: hasBudgetMention,
      procedureInterest: procedures,
    };
  }

  /**
   * Convert numeric score to classification
   */
  private scoreToClassification(score: number): LeadScore {
    if (score >= 4) return 'HOT';
    if (score === 3) return 'WARM';
    if (score === 2) return 'COLD';
    return 'UNQUALIFIED';
  }

  /**
   * Get suggested action based on classification
   */
  private getSuggestedAction(classification: LeadScore, language?: 'ro' | 'en' | 'de'): string {
    const actions: Record<LeadScore, Record<string, string>> = {
      HOT: {
        ro: 'Contactați imediat! Lead calificat cu interes explicit. Oferiți detalii despre prețuri și programare.',
        en: 'Contact immediately! Qualified lead with explicit interest. Offer pricing details and scheduling.',
        de: 'Sofort kontaktieren! Qualifizierter Lead mit explizitem Interesse. Preisdetails und Terminierung anbieten.',
      },
      WARM: {
        ro: 'Trimiteți informații suplimentare despre proceduri. Programați follow-up în 24h.',
        en: 'Send additional procedure information. Schedule follow-up in 24h.',
        de: 'Zusätzliche Verfahrensinformationen senden. Follow-up in 24h planen.',
      },
      COLD: {
        ro: 'Adăugați în secvența de nurture. Monitorizați activitatea.',
        en: 'Add to nurture sequence. Monitor activity.',
        de: 'Zur Nurture-Sequenz hinzufügen. Aktivität überwachen.',
      },
      UNQUALIFIED: {
        ro: 'Răspundeți politicos cu informații generale. Nu prioritizați.',
        en: 'Respond politely with general information. Do not prioritize.',
        de: 'Höflich mit allgemeinen Informationen antworten. Nicht priorisieren.',
      },
    };

    return actions[classification][language ?? 'ro'] ?? actions[classification]['ro']!;
  }

  /**
   * Build system prompt for AI scoring
   */
  private buildSystemPrompt(): string {
    return `You are a lead scoring assistant for a dental implant clinic specializing in All-on-X procedures.
NOTE: This is NOT an emergency clinic. Pain/urgency signals indicate high purchase intent and need for priority scheduling, not medical emergencies.

Your task is to analyze conversations and score leads from 1-5 based on:

SCORING CRITERIA:
- Score 5 (HOT): Explicit All-on-X/implant interest + budget mentioned OR priority scheduling requested (pain/discomfort)
- Score 4 (HOT): Clear procedure interest + qualification signals (timeline, decision-maker)
- Score 3 (WARM): General interest in dental procedures, needs more information
- Score 2 (COLD): Vague interest, early research stage, price shopping
- Score 1 (UNQUALIFIED): Not a fit, just information gathering, or competitor

KEY SIGNALS TO DETECT:
1. Procedure Interest: All-on-4, All-on-X, dental implants, full arch restoration
2. Budget Signals: Asking about price, mentioning budget range, financing questions
3. Priority Scheduling: Pain, discomfort, urgency - indicates high purchase intent and need for quick appointment
4. Decision-Making: "I want to", "When can I", "Let's schedule"

RESPONSE FORMAT (JSON):
{
  "score": <1-5>,
  "classification": "<HOT|WARM|COLD|UNQUALIFIED>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>",
  "suggestedAction": "<recommended next step>",
  "detectedIntent": "<primary intent>",
  "urgencyIndicators": ["<list of priority scheduling signals>"],
  "budgetMentioned": <true|false>,
  "procedureInterest": ["<list of procedures>"]
}`;
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(context: AIScoringContext): string {
    const messages = context.messageHistory?.map((m: { role: string; content: string }) =>
      `${m.role.toUpperCase()}: ${m.content}`
    ).join('\n') ?? '';

    return `Analyze this conversation and score the lead:

CHANNEL: ${context.channel}
LANGUAGE: ${context.language ?? 'unknown'}
${context.utm ? `SOURCE: ${context.utm.utm_source ?? 'direct'} / ${context.utm.utm_campaign ?? 'none'}` : ''}

CONVERSATION:
${messages}

Provide your scoring analysis in JSON format.`;
  }

  /**
   * Parse AI response to ScoringOutput
   */
  private parseAIResponse(content: string): ScoringOutput {
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as ScoringOutput;

      // Validate required fields
      if (typeof parsed.score !== 'number' || parsed.score < 1 || parsed.score > 5) {
        throw new Error('Invalid score');
      }

      return {
        score: parsed.score,
        classification: parsed.classification ?? this.scoreToClassification(parsed.score),
        confidence: parsed.confidence ?? 0.8,
        reasoning: parsed.reasoning ?? 'AI analysis',
        suggestedAction: parsed.suggestedAction ?? this.getSuggestedAction(parsed.classification ?? this.scoreToClassification(parsed.score)),
        detectedIntent: parsed.detectedIntent,
        urgencyIndicators: parsed.urgencyIndicators ?? [],
        budgetMentioned: parsed.budgetMentioned ?? false,
        procedureInterest: parsed.procedureInterest ?? [],
      };
    } catch {
      // Return safe fallback
      return {
        score: 2,
        classification: 'COLD',
        confidence: 0.5,
        reasoning: 'Failed to parse AI response, defaulting to COLD',
        suggestedAction: this.getSuggestedAction('COLD'),
      };
    }
  }
}

/**
 * Create a configured scoring service
 */
export function createScoringService(config: ScoringServiceConfig, deps?: ScoringServiceDeps): ScoringService {
  return new ScoringService(config, deps);
}
