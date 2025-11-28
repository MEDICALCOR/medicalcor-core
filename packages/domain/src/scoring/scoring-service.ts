/**
 * AI Scoring Service - State-of-the-Art Implementation
 *
 * Provides lead scoring functionality with:
 * - GPT-4o integration for intelligent scoring
 * - Rule-based fallback for reliability
 * - Zod schema validation for type safety
 * - Const assertions for exhaustive checking
 * - Immutable data structures
 *
 * @module domain/scoring
 */

import { z } from 'zod';
import type { SupportedLanguage } from '../types.js';

// ============================================================================
// LOCAL TYPE DEFINITIONS (aligned with @medicalcor/types)
// ============================================================================

/**
 * Lead score classification
 */
export type LeadScore = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

/**
 * AI scoring context input
 */
export interface AIScoringContext {
  readonly channel: string;
  readonly language?: SupportedLanguage;
  readonly messageHistory?: readonly { role: string; content: string }[];
  readonly utm?: {
    readonly utm_source?: string;
    readonly utm_campaign?: string;
  };
}

/**
 * Scoring output
 */
export interface ScoringOutput {
  readonly score: number;
  readonly classification: LeadScore;
  readonly confidence: number;
  readonly reasoning: string;
  readonly suggestedAction: string;
  readonly detectedIntent?: string;
  readonly urgencyIndicators?: readonly string[];
  readonly budgetMentioned?: boolean;
  readonly procedureInterest?: readonly string[];
}

/**
 * Zod schema for scoring output validation
 */
const ScoringOutputSchema = z.object({
  score: z.number().min(1).max(5),
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedAction: z.string(),
  detectedIntent: z.string().optional(),
  urgencyIndicators: z.array(z.string()).optional(),
  budgetMentioned: z.boolean().optional(),
  procedureInterest: z.array(z.string()).optional(),
});

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Service configuration
 */
export interface ScoringServiceConfig {
  readonly openaiApiKey: string;
  readonly model?: string;
  readonly fallbackEnabled?: boolean;
}

/**
 * Service dependencies for testing
 */
export interface ScoringServiceDeps {
  readonly openai?: OpenAIClient;
}

/**
 * OpenAI client interface
 */
interface OpenAIClient {
  readonly chat: {
    readonly completions: {
      create(params: unknown): Promise<{
        choices: readonly { message: { content: string } }[];
      }>;
    };
  };
}

// ============================================================================
// SCORING RULES - Const assertions for type safety
// ============================================================================

/**
 * All-on-X procedure keywords
 */
const ALL_ON_X_KEYWORDS = Object.freeze([
  'all-on-4',
  'all-on-x',
  'all on 4',
  'all on x',
  'all-on-6',
] as const);

/**
 * Budget indication keywords
 */
const BUDGET_KEYWORDS = Object.freeze([
  'pret',
  'cost',
  'buget',
  'cat costa',
  'finantare',
  'rate',
  'euro',
  'lei',
] as const);

/**
 * Urgency indication keywords
 */
const URGENCY_INDICATORS = Object.freeze([
  'urgent',
  'durere',
  'imediat',
  'cat mai repede',
  'maine',
  'azi',
  'acum',
  'nu mai pot',
] as const);

/**
 * Procedure interest keywords by category
 */
const PROCEDURE_KEYWORDS = Object.freeze({
  implant: Object.freeze(['implant', 'implante', 'implantologie'] as const),
  allOnX: Object.freeze(['all-on-4', 'all-on-x', 'all on 4', 'arcada completa'] as const),
  veneer: Object.freeze(['fatete', 'veneer', 'fateta'] as const),
  whitening: Object.freeze(['albire', 'whitening'] as const),
  extraction: Object.freeze(['extractie', 'scoatere dinte'] as const),
} as const);

/**
 * Scoring rules configuration
 */
const SCORING_RULES = Object.freeze({
  allOnXWithBudget: Object.freeze({
    keywords: ALL_ON_X_KEYWORDS,
    budgetKeywords: BUDGET_KEYWORDS,
    score: 5,
  }),
  urgencyIndicators: URGENCY_INDICATORS,
  procedureKeywords: PROCEDURE_KEYWORDS,
  budgetKeywords: BUDGET_KEYWORDS,
} as const);

// ============================================================================
// SUGGESTED ACTIONS - Localized by language
// ============================================================================

type ActionMap = Readonly<Record<LeadScore, Readonly<Record<SupportedLanguage, string>>>>;

const SUGGESTED_ACTIONS: ActionMap = Object.freeze({
  HOT: Object.freeze({
    ro: 'Contactați imediat! Lead calificat cu interes explicit. Oferiți detalii despre prețuri și programare.',
    en: 'Contact immediately! Qualified lead with explicit interest. Offer pricing details and scheduling.',
    de: 'Sofort kontaktieren! Qualifizierter Lead mit explizitem Interesse. Preisdetails und Terminierung anbieten.',
  }),
  WARM: Object.freeze({
    ro: 'Trimiteți informații suplimentare despre proceduri. Programați follow-up în 24h.',
    en: 'Send additional procedure information. Schedule follow-up in 24h.',
    de: 'Zusätzliche Verfahrensinformationen senden. Follow-up in 24h planen.',
  }),
  COLD: Object.freeze({
    ro: 'Adăugați în secvența de nurture. Monitorizați activitatea.',
    en: 'Add to nurture sequence. Monitor activity.',
    de: 'Zur Nurture-Sequenz hinzufügen. Aktivität überwachen.',
  }),
  UNQUALIFIED: Object.freeze({
    ro: 'Răspundeți politicos cu informații generale. Nu prioritizați.',
    en: 'Respond politely with general information. Do not prioritize.',
    de: 'Höflich mit allgemeinen Informationen antworten. Nicht priorisieren.',
  }),
});

// ============================================================================
// AI PROMPTS
// ============================================================================

const SYSTEM_PROMPT =
  `You are a lead scoring assistant for a dental implant clinic specializing in All-on-X procedures.
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
}` as const;

// ============================================================================
// SCORING SERVICE
// ============================================================================

/**
 * ScoringService - AI-powered and rule-based lead scoring
 *
 * @example
 * ```typescript
 * const service = new ScoringService({
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   fallbackEnabled: true,
 * });
 *
 * const result = await service.scoreMessage({
 *   channel: 'whatsapp',
 *   messageHistory: [{ role: 'user', content: 'Vreau All-on-4, cat costa?' }],
 *   language: 'ro',
 * });
 *
 * console.log(result.score); // 5
 * console.log(result.classification); // 'HOT'
 * ```
 */
export class ScoringService {
  private readonly config: ScoringServiceConfig;
  private readonly openai: OpenAIClient | undefined;

  constructor(config: ScoringServiceConfig, deps?: ScoringServiceDeps) {
    this.config = Object.freeze({ ...config });
    this.openai = deps?.openai;
  }

  // ==========================================================================
  // PUBLIC METHODS
  // ==========================================================================

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
   * Rule-based scoring (public for testing)
   */
  ruleBasedScore(context: AIScoringContext): ScoringOutput {
    const lastMessage = context.messageHistory?.[context.messageHistory.length - 1]?.content ?? '';
    const allMessages =
      context.messageHistory?.map((m: { content: string }) => m.content).join(' ') ?? lastMessage;
    const lowerContent = allMessages.toLowerCase();

    let score = 1;
    const indicators: string[] = [];
    const procedures: string[] = [];

    // Check for All-on-X + budget combination (HOT)
    const hasAllOnX = SCORING_RULES.allOnXWithBudget.keywords.some((k) => lowerContent.includes(k));
    const hasBudgetMention = SCORING_RULES.budgetKeywords.some((k) => lowerContent.includes(k));

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
      if (keywords.some((k) => lowerContent.includes(k))) {
        if (!procedures.includes(procedure)) {
          procedures.push(procedure);
        }
        if (score < 3) score = 3;
        indicators.push(`${procedure}_interest`);
      }
    }

    // Check urgency (boost score - pain/urgency indicates high purchase intent)
    const hasUrgency = SCORING_RULES.urgencyIndicators.some((k) => lowerContent.includes(k));
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

    const result: ScoringOutput = {
      score,
      classification,
      confidence: 0.7, // Rule-based has lower confidence
      reasoning: `Rule-based scoring: ${indicators.join(', ') || 'no specific indicators'}`,
      suggestedAction: this.getSuggestedAction(classification, context.language),
      urgencyIndicators: hasUrgency ? ['priority_scheduling_requested'] : [],
      budgetMentioned: hasBudgetMention,
      procedureInterest: procedures,
    };

    // Only add detectedIntent if we have indicators
    const firstIndicator = indicators[0];
    if (firstIndicator !== undefined) {
      return Object.freeze({ ...result, detectedIntent: firstIndicator });
    }

    return Object.freeze(result);
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * AI-powered scoring using GPT-4o
   */
  private async aiScore(context: AIScoringContext): Promise<ScoringOutput> {
    const userPrompt = this.buildUserPrompt(context);

    if (!this.openai) {
      throw new Error('OpenAI client not configured');
    }

    const response = await this.openai.chat.completions.create({
      model: this.config.model ?? 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const firstChoice = response.choices[0];
    if (!firstChoice) {
      throw new Error('Empty response from AI');
    }
    const content = firstChoice.message.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    return this.parseAIResponse(content);
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
  private getSuggestedAction(classification: LeadScore, language?: SupportedLanguage): string {
    const lang = language ?? 'ro';
    return SUGGESTED_ACTIONS[classification][lang];
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(context: AIScoringContext): string {
    const messages =
      context.messageHistory
        ?.map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n') ?? '';

    const utmInfo = context.utm
      ? `SOURCE: ${context.utm.utm_source ?? 'direct'} / ${context.utm.utm_campaign ?? 'none'}`
      : '';

    return `Analyze this conversation and score the lead:

CHANNEL: ${context.channel}
LANGUAGE: ${context.language ?? 'unknown'}
${utmInfo}

CONVERSATION:
${messages}

Provide your scoring analysis in JSON format.`;
  }

  /**
   * Parse AI response to ScoringOutput with Zod validation
   */
  private parseAIResponse(content: string): ScoringOutput {
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = /\{[\s\S]*\}/.exec(content);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const rawParsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      // Safely extract values with defaults for missing properties
      const score = typeof rawParsed.score === 'number' ? rawParsed.score : 2;
      const classification =
        rawParsed.classification !== undefined
          ? (rawParsed.classification as LeadScore)
          : this.scoreToClassification(score);

      // Use Zod schema validation for type safety
      const parseResult = ScoringOutputSchema.safeParse({
        score,
        classification,
        confidence: typeof rawParsed.confidence === 'number' ? rawParsed.confidence : 0.8,
        reasoning: typeof rawParsed.reasoning === 'string' ? rawParsed.reasoning : 'AI analysis',
        suggestedAction:
          typeof rawParsed.suggestedAction === 'string'
            ? rawParsed.suggestedAction
            : this.getSuggestedAction(classification),
        detectedIntent: rawParsed.detectedIntent,
        urgencyIndicators: Array.isArray(rawParsed.urgencyIndicators)
          ? rawParsed.urgencyIndicators
          : [],
        budgetMentioned:
          typeof rawParsed.budgetMentioned === 'boolean' ? rawParsed.budgetMentioned : false,
        procedureInterest: Array.isArray(rawParsed.procedureInterest)
          ? rawParsed.procedureInterest
          : [],
      });

      if (!parseResult.success) {
        throw new Error(`Validation failed: ${parseResult.error.message}`);
      }

      // Build result with only defined properties to satisfy exactOptionalPropertyTypes
      const data = parseResult.data;
      const result: ScoringOutput = {
        score: data.score,
        classification: data.classification,
        confidence: data.confidence,
        reasoning: data.reasoning,
        suggestedAction: data.suggestedAction,
      };

      // Conditionally add optional properties only when defined
      if (data.detectedIntent !== undefined) {
        (result as { detectedIntent: string }).detectedIntent = data.detectedIntent;
      }
      if (data.urgencyIndicators !== undefined) {
        (result as { urgencyIndicators: readonly string[] }).urgencyIndicators =
          data.urgencyIndicators;
      }
      if (data.budgetMentioned !== undefined) {
        (result as { budgetMentioned: boolean }).budgetMentioned = data.budgetMentioned;
      }
      if (data.procedureInterest !== undefined) {
        (result as { procedureInterest: readonly string[] }).procedureInterest =
          data.procedureInterest;
      }

      return Object.freeze(result);
    } catch {
      // Return safe fallback
      return Object.freeze({
        score: 2,
        classification: 'COLD' as const,
        confidence: 0.5,
        reasoning: 'Failed to parse AI response, defaulting to COLD',
        suggestedAction: this.getSuggestedAction('COLD'),
      });
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a configured scoring service
 *
 * @example
 * ```typescript
 * const service = createScoringService({
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4o',
 *   fallbackEnabled: true,
 * });
 * ```
 */
export function createScoringService(
  config: ScoringServiceConfig,
  deps?: ScoringServiceDeps
): ScoringService {
  return new ScoringService(config, deps);
}
