import OpenAI from 'openai';
import { withRetry, ExternalServiceError } from '@medicalcor/core';
import type { LeadContext, ScoringOutput } from '@medicalcor/types';

/**
 * OpenAI Integration Client
 * Wrapper for AI-powered scoring and text generation
 */

export interface OpenAIClientConfig {
  apiKey: string;
  model?: string;
  organization?: string;
  maxTokens?: number;
  temperature?: number;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface AIReplyOptions {
  context: LeadContext;
  tone?: 'professional' | 'friendly' | 'empathetic';
  maxLength?: number;
  language?: 'ro' | 'en' | 'de';
}

export class OpenAIClient {
  private client: OpenAI;
  private config: OpenAIClientConfig;

  constructor(config: OpenAIClientConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
    });
  }

  /**
   * Create a chat completion
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<string> {
    const {
      messages,
      model = this.config.model ?? 'gpt-4o',
      maxTokens = this.config.maxTokens ?? 1000,
      temperature = this.config.temperature ?? 0.7,
      jsonMode = false,
    } = options;

    const makeRequest = async () => {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(jsonMode && { response_format: { type: 'json_object' as const } }),
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new ExternalServiceError('OpenAI', 'Empty response from API');
      }

      return content;
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof Error && error.message.includes('rate_limit')) return true;
        if (error instanceof Error && error.message.includes('502')) return true;
        if (error instanceof Error && error.message.includes('503')) return true;
        return false;
      },
    });
  }

  /**
   * Score a lead using AI
   */
  async scoreMessage(context: LeadContext): Promise<ScoringOutput> {
    const systemPrompt = this.buildScoringSystemPrompt();
    const userPrompt = this.buildScoringUserPrompt(context);

    const response = await this.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      jsonMode: true,
    });

    return this.parseScoringResponse(response);
  }

  /**
   * Generate an AI reply for a lead
   */
  async generateReply(options: AIReplyOptions): Promise<string> {
    const { context, tone = 'professional', maxLength = 200, language = 'ro' } = options;

    const systemPrompt = this.buildReplySystemPrompt(tone, language);
    const userPrompt = this.buildReplyUserPrompt(context);

    const response = await this.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: maxLength,
    });

    return response;
  }

  /**
   * Detect language from text
   */
  async detectLanguage(text: string): Promise<'ro' | 'en' | 'de' | 'unknown'> {
    const response = await this.chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are a language detector. Respond with only the ISO 639-1 code (ro, en, de) or "unknown".',
        },
        { role: 'user', content: `Detect the language: "${text}"` },
      ],
      temperature: 0,
      maxTokens: 10,
    });

    const lang = response.trim().toLowerCase();
    if (lang === 'ro' || lang === 'en' || lang === 'de') {
      return lang;
    }
    return 'unknown';
  }

  /**
   * Summarize a conversation or transcript
   */
  async summarize(text: string, language: 'ro' | 'en' | 'de' = 'ro'): Promise<string> {
    const prompts: Record<string, string> = {
      ro: 'Rezumă următorul text în maximum 3 propoziții:',
      en: 'Summarize the following text in maximum 3 sentences:',
      de: 'Fassen Sie den folgenden Text in maximal 3 Sätzen zusammen:',
    };

    return this.chatCompletion({
      messages: [
        { role: 'system', content: 'You are a helpful assistant that creates concise summaries.' },
        { role: 'user', content: `${prompts[language]}\n\n${text}` },
      ],
      temperature: 0.3,
      maxTokens: 200,
    });
  }

  /**
   * Analyze sentiment from text
   */
  async analyzeSentiment(text: string): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    confidence: number;
    reasoning: string;
  }> {
    const response = await this.chatCompletion({
      messages: [
        {
          role: 'system',
          content: `Analyze the sentiment of the text. Respond in JSON format:
{"sentiment": "positive|neutral|negative", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
      jsonMode: true,
    });

    try {
      return JSON.parse(response) as {
        sentiment: 'positive' | 'neutral' | 'negative';
        confidence: number;
        reasoning: string;
      };
    } catch {
      return { sentiment: 'neutral', confidence: 0.5, reasoning: 'Failed to parse response' };
    }
  }

  /**
   * Build system prompt for lead scoring
   */
  private buildScoringSystemPrompt(): string {
    return `You are a medical lead scoring assistant for a dental implant clinic specializing in All-on-X procedures.

Analyze conversations and score leads from 1-5:
- Score 5 (HOT): Explicit All-on-X/implant interest + budget mentioned OR urgent need
- Score 4 (HOT): Clear procedure interest + qualification signals
- Score 3 (WARM): General interest, needs more information
- Score 2 (COLD): Vague interest, early research
- Score 1 (UNQUALIFIED): Not a fit

Key signals: procedure interest, budget mentions, urgency, decision-making language.

ALWAYS respond in this exact JSON format:
{
  "score": <1-5>,
  "classification": "<HOT|WARM|COLD|UNQUALIFIED>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>",
  "suggestedAction": "<recommended next step>",
  "detectedIntent": "<primary intent>",
  "urgencyIndicators": ["<list>"],
  "budgetMentioned": <boolean>,
  "procedureInterest": ["<list>"]
}`;
  }

  /**
   * Build user prompt for scoring
   */
  private buildScoringUserPrompt(context: LeadContext): string {
    const messages =
      context.messageHistory?.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n') ?? '';

    return `Analyze this lead:
CHANNEL: ${context.channel}
LANGUAGE: ${context.language ?? 'unknown'}
${context.utm ? `SOURCE: ${context.utm.utm_source ?? 'direct'}` : ''}

CONVERSATION:
${messages}`;
  }

  /**
   * Parse AI scoring response
   */
  private parseScoringResponse(response: string): ScoringOutput {
    try {
      const parsed = JSON.parse(response) as Partial<ScoringOutput>;

      return {
        score: Math.min(5, Math.max(1, parsed.score ?? 2)),
        classification: parsed.classification ?? 'COLD',
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        reasoning: parsed.reasoning ?? 'AI analysis',
        suggestedAction: parsed.suggestedAction ?? 'Follow up with more information',
        detectedIntent: parsed.detectedIntent,
        urgencyIndicators: parsed.urgencyIndicators ?? [],
        budgetMentioned: parsed.budgetMentioned ?? false,
        procedureInterest: parsed.procedureInterest ?? [],
      };
    } catch {
      // Safe fallback
      return {
        score: 2,
        classification: 'COLD',
        confidence: 0.3,
        reasoning: 'Failed to parse AI response',
        suggestedAction: 'Manual review required',
      };
    }
  }

  /**
   * Build system prompt for reply generation
   */
  private buildReplySystemPrompt(tone: string, language: string): string {
    const toneDescriptions: Record<string, string> = {
      professional: 'formal and business-like',
      friendly: 'warm and approachable',
      empathetic: 'understanding and caring',
    };

    const languageNames: Record<string, string> = {
      ro: 'Romanian',
      en: 'English',
      de: 'German',
    };

    return `You are a dental clinic assistant. Generate ${toneDescriptions[tone]} replies in ${languageNames[language]}.
Keep responses concise and helpful. Focus on patient needs and next steps.
Do not make up specific prices or availability - direct to staff for details.`;
  }

  /**
   * Build user prompt for reply generation
   */
  private buildReplyUserPrompt(context: LeadContext): string {
    const lastMessage = context.messageHistory?.[context.messageHistory.length - 1];
    const history =
      context.messageHistory
        ?.slice(-5)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n') ?? '';

    return `Generate a helpful reply to this conversation:

${history}

Patient's last message: "${lastMessage?.content ?? ''}"

Provide a natural, helpful response.`;
  }
}

/**
 * Create a configured OpenAI client
 */
export function createOpenAIClient(config: OpenAIClientConfig): OpenAIClient {
  return new OpenAIClient(config);
}
