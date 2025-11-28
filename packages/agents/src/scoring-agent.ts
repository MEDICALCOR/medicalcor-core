/**
 * Lead Scoring Agent - Claude Agent SDK powered intelligent lead qualification
 *
 * This agent uses multi-step reasoning to:
 * 1. Analyze conversation context
 * 2. Fetch additional patient data when needed
 * 3. Apply medical CRM-specific scoring rules
 * 4. Provide actionable recommendations
 *
 * State-of-the-art features:
 * - Multi-step reasoning with tool use
 * - Context enrichment from HubSpot
 * - GDPR-compliant data handling
 * - Audit trail for all decisions
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  createGDPRHook,
  createAuditHook,
  type GDPRHookConfig,
  type AuditHookConfig,
} from './hooks/index.js';

// ============================================================================
// Local Type Definitions (avoid workspace resolution issues during lint)
// ============================================================================

/**
 * Lead score classification
 */
export type LeadScore = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

/**
 * Lead source/channel
 */
export type LeadSource =
  | 'whatsapp'
  | 'voice'
  | 'web_form'
  | 'web'
  | 'hubspot'
  | 'facebook'
  | 'google'
  | 'referral'
  | 'manual';

/**
 * Message in conversation history
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * UTM tracking parameters
 */
export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
}

/**
 * AI Scoring context input
 */
export interface AIScoringContext {
  phone: string;
  name?: string;
  channel: LeadSource;
  firstTouchTimestamp: string;
  language?: 'ro' | 'en' | 'de';
  messageHistory?: ConversationMessage[];
  utm?: UTMParams;
  hubspotContactId?: string;
}

/**
 * Scoring output result
 */
export interface ScoringOutput {
  score: number;
  classification: LeadScore;
  confidence: number;
  reasoning: string;
  suggestedAction: string;
  detectedIntent?: string;
  urgencyIndicators?: string[];
  budgetMentioned?: boolean;
  procedureInterest?: string[];
}

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Scoring agent configuration
 */
export interface ScoringAgentConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** GDPR hook configuration */
  gdprConfig?: Omit<GDPRHookConfig, 'checkConsent'> & {
    checkConsent?: GDPRHookConfig['checkConsent'];
  };
  /** Audit hook configuration */
  auditConfig?: Partial<AuditHookConfig>;
  /** Enable context enrichment from external sources */
  enableContextEnrichment?: boolean;
  /** HubSpot client for context enrichment */
  hubspotClient?: HubSpotClient;
}

/**
 * HubSpot client interface for context enrichment
 */
interface HubSpotClient {
  getContact(contactId: string): Promise<HubSpotContact | null>;
  getContactDeals(contactId: string): Promise<HubSpotDeal[]>;
  getContactNotes(contactId: string): Promise<HubSpotNote[]>;
}

interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
  };
}

interface HubSpotNote {
  id: string;
  properties: {
    hs_note_body?: string;
    hs_timestamp?: string;
  };
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Tool definitions for the scoring agent
 */
const SCORING_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'get_patient_history',
    description:
      'Retrieve patient history from HubSpot CRM including past interactions, deals, and notes. Use this to enrich scoring context with historical data.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'HubSpot contact ID',
        },
        includeDeals: {
          type: 'boolean',
          description: 'Whether to include deal history',
        },
        includeNotes: {
          type: 'boolean',
          description: 'Whether to include notes/interactions',
        },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'check_consent_status',
    description:
      'Check GDPR consent status for a patient before processing their data. Required before accessing personal information.',
    input_schema: {
      type: 'object',
      properties: {
        patientId: {
          type: 'string',
          description: 'Patient identifier (phone or HubSpot ID)',
        },
      },
      required: ['patientId'],
    },
  },
  {
    name: 'calculate_score',
    description:
      'Calculate the final lead score based on analyzed factors. Call this after gathering all context.',
    input_schema: {
      type: 'object',
      properties: {
        procedureInterest: {
          type: 'array',
          items: { type: 'string' },
          description: 'Procedures the patient is interested in',
        },
        budgetMentioned: {
          type: 'boolean',
          description: 'Whether budget/pricing was discussed',
        },
        urgencyLevel: {
          type: 'string',
          enum: ['none', 'low', 'medium', 'high', 'critical'],
          description: 'Urgency level detected from conversation',
        },
        decisionMakerSignals: {
          type: 'boolean',
          description: 'Whether decision-maker language was detected',
        },
        previousPatient: {
          type: 'boolean',
          description: 'Whether this is a returning patient',
        },
        engagementQuality: {
          type: 'string',
          enum: ['poor', 'fair', 'good', 'excellent'],
          description: 'Quality of engagement in conversation',
        },
        reasoning: {
          type: 'string',
          description: 'Detailed reasoning for the score',
        },
      },
      required: ['procedureInterest', 'budgetMentioned', 'urgencyLevel', 'reasoning'],
    },
  },
];

// ============================================================================
// System Prompt
// ============================================================================

/**
 * System prompt for the scoring agent
 */
const SCORING_SYSTEM_PROMPT = `You are an expert lead scoring agent for a dental implant clinic specializing in All-on-X procedures.

Your task is to analyze patient conversations and determine their qualification level using a systematic approach.

## SCORING METHODOLOGY

You must follow these steps in order:

### Step 1: Context Gathering
- If a HubSpot contact ID is provided, use get_patient_history to fetch historical data
- Check for returning patients, previous deals, and interaction history

### Step 2: Conversation Analysis
Analyze the conversation for:
- **Procedure Interest**: All-on-4, All-on-X, implants, veneers, etc.
- **Budget Signals**: Price questions, financing mentions, budget ranges
- **Urgency Indicators**: Pain, discomfort, time pressure (indicates high purchase intent)
- **Decision-Maker Language**: "I want to", "When can I", "Let's schedule"
- **Engagement Quality**: Response depth, question relevance, follow-through

### Step 3: Score Calculation
Use calculate_score with your analysis to determine the final score.

## SCORING SCALE (1-5)

- **Score 5 (HOT)**: Explicit All-on-X/implant interest + budget mentioned OR urgent need
- **Score 4 (HOT)**: Clear procedure interest + qualification signals (timeline, decision-maker)
- **Score 3 (WARM)**: General interest in dental procedures, needs more information
- **Score 2 (COLD)**: Vague interest, early research stage, price shopping only
- **Score 1 (UNQUALIFIED)**: Not a fit, information gathering only, or competitor

## IMPORTANT NOTES

- Pain/urgency indicates HIGH PURCHASE INTENT, not medical emergency
- Budget discussions are strong qualification signals
- Returning patients should generally score higher
- Always provide detailed reasoning for transparency

## GDPR COMPLIANCE

- Check consent status before accessing patient data
- Do not process data for patients who have withdrawn consent
- All decisions are logged for audit purposes

## OUTPUT FORMAT

After analysis, call calculate_score with your findings. Your reasoning should be clear and actionable.`;

// ============================================================================
// Scoring Agent Class
// ============================================================================

/**
 * Lead Scoring Agent using Claude Agent SDK
 *
 * @example
 * ```typescript
 * const agent = new ScoringAgent({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   hubspotClient: hubspot,
 *   gdprConfig: {
 *     checkConsent: consentService.check,
 *   },
 * });
 *
 * const result = await agent.scoreContext({
 *   phone: '+40712345678',
 *   channel: 'whatsapp',
 *   firstTouchTimestamp: new Date().toISOString(),
 *   messageHistory: [
 *     { role: 'user', content: 'Bună, mă interesează implanturile All-on-4', timestamp: new Date().toISOString() },
 *   ],
 * });
 *
 * console.log(result);
 * // {
 * //   score: 4,
 * //   classification: 'HOT',
 * //   confidence: 0.85,
 * //   reasoning: 'Explicit All-on-4 interest detected...',
 * //   suggestedAction: 'Contactați imediat!...',
 * //   procedureInterest: ['All-on-4'],
 * // }
 * ```
 */
export class ScoringAgent {
  private client: Anthropic;
  private config: Required<Pick<ScoringAgentConfig, 'model' | 'maxTokens'>> & ScoringAgentConfig;
  private gdprHook?: ReturnType<typeof createGDPRHook>;
  private auditHook?: ReturnType<typeof createAuditHook>;

  constructor(config: ScoringAgentConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });

    this.config = {
      ...config,
      model: config.model ?? 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens ?? 4096,
    };

    // Initialize GDPR hook if consent check is provided
    if (config.gdprConfig?.checkConsent) {
      this.gdprHook = createGDPRHook({
        checkConsent: config.gdprConfig.checkConsent,
        logAccess: config.gdprConfig.logAccess,
        blockOnUnknown: config.gdprConfig.blockOnUnknown,
        consentRequiredTools: config.gdprConfig.consentRequiredTools,
      });
    }

    // Initialize audit hook if persistence is provided
    if (config.auditConfig?.persistEvent) {
      this.auditHook = createAuditHook({
        agentId: config.auditConfig.agentId ?? 'scoring-agent',
        agentType: config.auditConfig.agentType ?? 'lead_scoring',
        persistEvent: config.auditConfig.persistEvent,
        redactPII: config.auditConfig.redactPII ?? true,
        sessionId: config.auditConfig.sessionId,
        correlationId: config.auditConfig.correlationId,
      });
    }
  }

  /**
   * Score a lead using multi-step reasoning
   */
  async scoreContext(context: AIScoringContext): Promise<ScoringOutput> {
    // Log agent start
    await this.auditHook?.logAgentStart({
      phone: context.phone,
      channel: context.channel,
      messageCount: context.messageHistory?.length ?? 0,
    });

    try {
      // Build the user message with context
      const userMessage = this.buildUserMessage(context);

      // Create initial message
      const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userMessage }];

      let response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: SCORING_SYSTEM_PROMPT,
        tools: SCORING_TOOLS,
        messages,
      });

      // Handle tool use loop
      let iterations = 0;
      const maxIterations = 5;
      let finalScore: ScoringOutput | null = null;

      while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
        iterations++;

        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
        );

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const toolInput = toolUse.input as Record<string, unknown>;

          // Log tool call
          await this.auditHook?.beforeToolCall(toolUse.name, toolInput);

          // Check GDPR compliance
          if (this.gdprHook) {
            const gdprResult = await this.gdprHook.beforeToolCall(
              'scoring-agent',
              toolUse.name,
              toolInput
            );

            if (!gdprResult.allowed) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: `BLOCKED: ${gdprResult.reason}`,
                is_error: true,
              });
              continue;
            }
          }

          // Execute tool
          try {
            const result = await this.executeTool(toolUse.name, toolInput, context);

            // Check if this is the final score
            if (toolUse.name === 'calculate_score') {
              finalScore = result as ScoringOutput;
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });

            // Log successful execution
            await this.auditHook?.afterToolCall(
              toolUse.name,
              toolInput,
              result as Record<string, unknown>
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await this.auditHook?.onToolError(
              toolUse.name,
              toolInput,
              error instanceof Error ? error : new Error(errorMessage)
            );

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${errorMessage}`,
              is_error: true,
            });
          }
        }

        // Continue conversation with tool results
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });

        response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          system: SCORING_SYSTEM_PROMPT,
          tools: SCORING_TOOLS,
          messages,
        });
      }

      // If we have a final score from calculate_score, use it
      if (finalScore) {
        await this.auditHook?.logDecision(
          `score_${String(finalScore.score)}`,
          finalScore.reasoning,
          finalScore.confidence,
          { classification: finalScore.classification }
        );

        await this.auditHook?.logAgentEnd({
          success: true,
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        });

        return finalScore;
      }

      // Fallback: extract score from final response
      const fallbackScore = this.extractScoreFromResponse(response);

      await this.auditHook?.logAgentEnd({
        success: true,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      });

      return fallbackScore;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.auditHook?.logAgentEnd({ success: false }, { error: errorMessage });

      // Return safe fallback on error
      return {
        score: 2,
        classification: 'COLD',
        confidence: 0.3,
        reasoning: `Agent error: ${errorMessage}`,
        suggestedAction: 'Manual review required',
      };
    }
  }

  /**
   * Build the user message from context
   */
  private buildUserMessage(context: AIScoringContext): string {
    const messages =
      context.messageHistory?.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n') ?? '';

    return `Please analyze this lead and provide a score.

## LEAD CONTEXT

- **Phone**: ${context.phone}
- **Channel**: ${context.channel}
- **Language**: ${context.language ?? 'unknown'}
- **First Contact**: ${context.firstTouchTimestamp}
${context.hubspotContactId ? `- **HubSpot Contact ID**: ${context.hubspotContactId}` : ''}
${context.utm?.utm_source ? `- **Source**: ${context.utm.utm_source}` : ''}
${context.utm?.utm_campaign ? `- **Campaign**: ${context.utm.utm_campaign}` : ''}

## CONVERSATION HISTORY

${messages || 'No messages available'}

## INSTRUCTIONS

1. ${context.hubspotContactId ? 'Use get_patient_history to fetch additional context' : 'Skip history fetch (no HubSpot ID)'}
2. Analyze the conversation for scoring signals
3. Use calculate_score to determine the final score`;
  }

  /**
   * Execute a tool and return the result
   */
  private async executeTool(
    toolName: string,
    input: Record<string, unknown>,
    context: AIScoringContext
  ): Promise<unknown> {
    switch (toolName) {
      case 'get_patient_history':
        return this.executeGetPatientHistory(input, context);

      case 'check_consent_status':
        return this.executeCheckConsentStatus(input);

      case 'calculate_score':
        return this.executeCalculateScore(input, context);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Execute get_patient_history tool
   */
  private async executeGetPatientHistory(
    input: Record<string, unknown>,
    context: AIScoringContext
  ): Promise<unknown> {
    const contactId = (input.contactId as string | undefined) ?? context.hubspotContactId;

    if (!contactId) {
      return { error: 'No contact ID provided' };
    }

    if (!this.config.hubspotClient) {
      return { error: 'HubSpot client not configured', contactId };
    }

    try {
      const [contact, deals, notes] = await Promise.all([
        this.config.hubspotClient.getContact(contactId),
        input.includeDeals !== false
          ? this.config.hubspotClient.getContactDeals(contactId)
          : Promise.resolve([]),
        input.includeNotes !== false
          ? this.config.hubspotClient.getContactNotes(contactId)
          : Promise.resolve([]),
      ]);

      return {
        contact: contact
          ? {
              id: contact.id,
              name: `${contact.properties.firstname ?? ''} ${contact.properties.lastname ?? ''}`.trim(),
              email: contact.properties.email,
              lifecycleStage: contact.properties.lifecyclestage,
              lastContactDate: contact.properties.lastmodifieddate,
            }
          : null,
        deals: deals.map((d) => ({
          id: d.id,
          name: d.properties.dealname,
          amount: d.properties.amount,
          stage: d.properties.dealstage,
        })),
        recentNotes: notes.slice(0, 5).map((n) => ({
          body: n.properties.hs_note_body?.substring(0, 200),
          timestamp: n.properties.hs_timestamp,
        })),
        isReturningPatient: deals.length > 0,
        totalDeals: deals.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        error: `Failed to fetch patient history: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute check_consent_status tool
   */
  private async executeCheckConsentStatus(input: Record<string, unknown>): Promise<unknown> {
    const patientId = input.patientId as string | undefined;

    if (!patientId) {
      return { error: 'No patient ID provided' };
    }

    if (!this.config.gdprConfig?.checkConsent) {
      // If no GDPR config, assume consent is granted
      return {
        patientId,
        status: 'granted',
        message: 'GDPR check not configured, assuming consent granted',
      };
    }

    try {
      const result = await this.config.gdprConfig.checkConsent(patientId);
      return {
        patientId,
        status: result.status,
        allowed: result.allowed,
        reason: result.reason,
        expiresAt: result.expiresAt?.toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        patientId,
        status: 'error',
        allowed: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute calculate_score tool
   */
  private executeCalculateScore(
    input: Record<string, unknown>,
    context: AIScoringContext
  ): ScoringOutput {
    const procedureInterest = (input.procedureInterest as string[] | undefined) ?? [];
    const budgetMentioned = (input.budgetMentioned as boolean | undefined) ?? false;
    const urgencyLevel = (input.urgencyLevel as string | undefined) ?? 'none';
    const decisionMakerSignals = (input.decisionMakerSignals as boolean | undefined) ?? false;
    const previousPatient = (input.previousPatient as boolean | undefined) ?? false;
    const engagementQuality = (input.engagementQuality as string | undefined) ?? 'fair';
    const reasoning = (input.reasoning as string | undefined) ?? 'AI analysis';

    // Calculate base score
    let score = 1;

    // Procedure interest scoring
    const highValueProcedures = ['all-on-4', 'all-on-x', 'all on 4', 'implant', 'implante'];
    const hasHighValueInterest = procedureInterest.some((p) =>
      highValueProcedures.some((hvp) => p.toLowerCase().includes(hvp))
    );

    if (hasHighValueInterest) {
      score = 3;
    } else if (procedureInterest.length > 0) {
      score = 2;
    }

    // Budget mention boost
    if (budgetMentioned) {
      score = Math.min(score + 1, 5);
    }

    // Urgency boost
    const urgencyBoost: Record<string, number> = {
      critical: 2,
      high: 1,
      medium: 0,
      low: 0,
      none: 0,
    };
    score = Math.min(score + (urgencyBoost[urgencyLevel] ?? 0), 5);

    // Decision maker signals boost
    if (decisionMakerSignals) {
      score = Math.min(score + 1, 5);
    }

    // Returning patient boost
    if (previousPatient) {
      score = Math.min(score + 1, 5);
    }

    // Engagement quality adjustment
    if (engagementQuality === 'excellent' && score < 5) {
      score += 1;
    } else if (engagementQuality === 'poor' && score > 1) {
      score -= 1;
    }

    // Determine classification
    const classification: LeadScore =
      score >= 4 ? 'HOT' : score === 3 ? 'WARM' : score === 2 ? 'COLD' : 'UNQUALIFIED';

    // Calculate confidence based on available signals
    const signalCount = [
      procedureInterest.length > 0,
      budgetMentioned,
      urgencyLevel !== 'none',
      decisionMakerSignals,
      previousPatient,
    ].filter(Boolean).length;

    const confidence = Math.min(0.5 + signalCount * 0.1, 0.95);

    // Generate suggested action
    const suggestedAction = this.getSuggestedAction(classification, context.language);

    return {
      score,
      classification,
      confidence,
      reasoning,
      suggestedAction,
      detectedIntent: hasHighValueInterest ? 'all_on_x_interest' : undefined,
      urgencyIndicators: urgencyLevel !== 'none' ? [`${urgencyLevel}_urgency`] : [],
      budgetMentioned,
      procedureInterest,
    };
  }

  /**
   * Get suggested action based on classification
   */
  private getSuggestedAction(classification: LeadScore, language?: 'ro' | 'en' | 'de'): string {
    const actions: Record<LeadScore, Record<string, string>> = {
      HOT: {
        ro: 'Contactați imediat! Lead calificat cu interes explicit. Oferiți detalii despre prețuri și programare.',
        en: 'Contact immediately! Qualified lead with explicit interest. Offer pricing details and scheduling.',
        de: 'Sofort kontaktieren! Qualifizierter Lead mit explizitem Interesse.',
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

    const lang = language ?? 'ro';
    return actions[classification][lang] ?? actions[classification]['ro'];
  }

  /**
   * Extract score from final response (fallback)
   */
  private extractScoreFromResponse(response: Anthropic.Messages.Message): ScoringOutput {
    const textBlocks = response.content.filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === 'text'
    );

    const text = textBlocks.map((b) => b.text).join('\n');

    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*"score"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<ScoringOutput>;
        return {
          score: Math.min(5, Math.max(1, parsed.score ?? 2)),
          classification: parsed.classification ?? 'COLD',
          confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
          reasoning: parsed.reasoning ?? 'Extracted from response',
          suggestedAction: parsed.suggestedAction ?? 'Review required',
        };
      } catch {
        // Fall through to default
      }
    }

    // Default fallback
    return {
      score: 2,
      classification: 'COLD',
      confidence: 0.3,
      reasoning: 'Could not extract structured score from response',
      suggestedAction: 'Manual review required',
    };
  }
}

// ============================================================================
// Input Validation Schema
// ============================================================================

/**
 * Input schema for scoring agent
 */
export const ScoringAgentInputSchema = z.object({
  phone: z.string(),
  channel: z.enum([
    'whatsapp',
    'voice',
    'web',
    'referral',
    'web_form',
    'hubspot',
    'facebook',
    'google',
    'manual',
  ]),
  firstTouchTimestamp: z.string(),
  language: z.enum(['ro', 'en', 'de']).optional(),
  messageHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        timestamp: z.string(),
      })
    )
    .optional(),
  hubspotContactId: z.string().optional(),
  utm: z
    .object({
      utm_source: z.string().optional(),
      utm_campaign: z.string().optional(),
    })
    .optional(),
});

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a configured scoring agent
 */
export function createScoringAgent(config: ScoringAgentConfig): ScoringAgent {
  return new ScoringAgent(config);
}
