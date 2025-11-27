/**
 * OpenAI LLM Provider Adapter
 *
 * Implements the ILLMProvider interface for OpenAI (GPT-4, GPT-4o).
 */

import OpenAI from 'openai';
import { z } from 'zod';
import type {
  ILLMProvider,
  IChatCompletionOptions,
  IChatCompletionResult,
  IEmbeddingResult,
  ILeadScoringContext,
  ILeadScoringResult,
  ISentimentResult,
  ILanguageDetectionResult,
  IHealthCheckResult,
} from '@medicalcor/types';
import { withRetry, ExternalServiceError } from '@medicalcor/core';

export interface OpenAIAdapterConfig {
  apiKey: string;
  model?: string | undefined;
  organization?: string | undefined;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  timeoutMs?: number | undefined;
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}

// Input validation
const ChatCompletionOptionsSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().min(1).max(100000),
      })
    )
    .min(1),
  model: z.string().optional(),
  maxTokens: z.number().int().min(1).max(128000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  jsonMode: z.boolean().optional(),
});

/**
 * OpenAI implementation of the universal LLM Provider interface
 */
export class OpenAIAdapter implements ILLMProvider {
  readonly providerName = 'openai' as const;
  readonly defaultModel: string;
  private client: OpenAI;
  private config: OpenAIAdapterConfig;

  constructor(config: OpenAIAdapterConfig) {
    this.config = config;
    this.defaultModel = config.model ?? 'gpt-4o';
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      timeout: config.timeoutMs ?? 60000,
    });
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  async healthCheck(): Promise<IHealthCheckResult> {
    const startTime = Date.now();
    try {
      await this.client.models.list();
      return {
        healthy: true,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  // ===========================================================================
  // Chat Operations
  // ===========================================================================

  async chatComplete(options: IChatCompletionOptions): Promise<IChatCompletionResult> {
    const validated = ChatCompletionOptionsSchema.parse(options);

    const makeRequest = async () => {
      const response = await this.client.chat.completions.create({
        model: validated.model ?? this.defaultModel,
        messages: validated.messages,
        max_tokens: validated.maxTokens ?? this.config.maxTokens ?? 1000,
        temperature: validated.temperature ?? this.config.temperature ?? 0.7,
        ...(validated.jsonMode && { response_format: { type: 'json_object' as const } }),
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new ExternalServiceError('OpenAI', 'Empty response from API');
      }

      return {
        content,
        model: response.model,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        finishReason: this.mapFinishReason(response.choices[0]?.finish_reason ?? 'stop'),
      };
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          return (
            message.includes('rate_limit') ||
            message.includes('502') ||
            message.includes('503') ||
            message.includes('timeout')
          );
        }
        return false;
      },
    });
  }

  async chat(systemPrompt: string, userMessage: string, jsonMode = false): Promise<string> {
    const result = await this.chatComplete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      jsonMode,
    });
    return result.content;
  }

  // ===========================================================================
  // Embeddings
  // ===========================================================================

  async embedText(text: string, model = 'text-embedding-3-small'): Promise<IEmbeddingResult> {
    const response = await this.client.embeddings.create({
      model,
      input: text,
    });

    return {
      embedding: response.data[0]?.embedding ?? [],
      model: response.model,
      tokenCount: response.usage.total_tokens,
    };
  }

  async embedTexts(texts: string[], model = 'text-embedding-3-small'): Promise<IEmbeddingResult[]> {
    const response = await this.client.embeddings.create({
      model,
      input: texts,
    });

    return response.data.map((d) => ({
      embedding: d.embedding,
      model: response.model,
      tokenCount: Math.floor(response.usage.total_tokens / texts.length),
    }));
  }

  // ===========================================================================
  // Lead Scoring
  // ===========================================================================

  async scoreLead(context: ILeadScoringContext): Promise<ILeadScoringResult> {
    const systemPrompt = `You are a medical lead scoring assistant for a dental implant clinic.

Analyze conversations and score leads from 1-5:
- Score 5 (HOT): Explicit procedure interest + budget mentioned OR urgent need
- Score 4 (HOT): Clear procedure interest + qualification signals
- Score 3 (WARM): General interest, needs more information
- Score 2 (COLD): Vague interest, early research
- Score 1 (UNQUALIFIED): Not a fit

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

    const messages = context.messageHistory
      .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const userPrompt = `Analyze this lead:
CHANNEL: ${context.channel}
LANGUAGE: ${context.language ?? 'unknown'}
${context.utm ? `SOURCE: ${context.utm.source ?? 'direct'}` : ''}

CONVERSATION:
${messages}`;

    const response = await this.chat(systemPrompt, userPrompt, true);

    try {
      const parsed = JSON.parse(response) as Partial<ILeadScoringResult>;
      return {
        score: Math.min(5, Math.max(1, parsed.score ?? 2)),
        classification: parsed.classification ?? 'COLD',
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        reasoning: parsed.reasoning ?? 'AI analysis',
        suggestedAction: parsed.suggestedAction ?? 'Follow up with more information',
        detectedIntent: parsed.detectedIntent ?? undefined,
        urgencyIndicators: parsed.urgencyIndicators ?? [],
        budgetMentioned: parsed.budgetMentioned ?? false,
        procedureInterest: parsed.procedureInterest ?? [],
      };
    } catch {
      return {
        score: 2,
        classification: 'COLD',
        confidence: 0.3,
        reasoning: 'Failed to parse AI response',
        suggestedAction: 'Manual review required',
        detectedIntent: undefined,
        urgencyIndicators: [],
        budgetMentioned: false,
        procedureInterest: [],
      };
    }
  }

  // ===========================================================================
  // Text Analysis
  // ===========================================================================

  async analyzeSentiment(text: string): Promise<ISentimentResult> {
    const response = await this.chat(
      'Analyze sentiment. Respond in JSON: {"sentiment": "positive|neutral|negative", "confidence": 0.0-1.0, "reasoning": "brief explanation"}',
      text,
      true
    );

    try {
      return JSON.parse(response) as ISentimentResult;
    } catch {
      return { sentiment: 'neutral', confidence: 0.5 };
    }
  }

  async detectLanguage(text: string): Promise<ILanguageDetectionResult> {
    const response = await this.chat(
      'Detect language. Respond in JSON: {"language": "ISO 639-1 code", "confidence": 0.0-1.0}',
      text,
      true
    );

    try {
      return JSON.parse(response) as ILanguageDetectionResult;
    } catch {
      return { language: 'unknown', confidence: 0 };
    }
  }

  async summarize(text: string, language = 'ro', _maxLength = 200): Promise<string> {
    const prompts: Record<string, string> = {
      ro: 'Rezumă în maximum 3 propoziții:',
      en: 'Summarize in maximum 3 sentences:',
      de: 'Fasse in maximal 3 Sätzen zusammen:',
    };

    return this.chat(
      'You create concise summaries.',
      `${prompts[language] ?? prompts.en}\n\n${text}`
    );
  }

  async generateReply(options: {
    context: ILeadScoringContext;
    tone?: 'professional' | 'friendly' | 'empathetic';
    maxLength?: number;
    language?: string;
  }): Promise<string> {
    const { context, tone = 'professional', language = 'ro' } = options;

    const toneDescriptions: Record<string, string> = {
      professional: 'formal and business-like',
      friendly: 'warm and approachable',
      empathetic: 'understanding and caring',
    };

    const lastMessage = context.messageHistory[context.messageHistory.length - 1];
    const history = context.messageHistory
      .slice(-5)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n');

    return this.chat(
      `You are a dental clinic assistant. Generate ${toneDescriptions[tone]} replies in ${language}. Keep responses concise.`,
      `Generate a reply to:\n\n${history}\n\nPatient's last message: ${lastMessage?.content ?? ''}`
    );
  }

  countTokens(text: string, _model?: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  async listModels(): Promise<
    { id: string; name: string; contextLength: number; supportsJson?: boolean }[]
  > {
    const response = await this.client.models.list();
    return response.data
      .filter((m) => m.id.includes('gpt'))
      .map((m) => ({
        id: m.id,
        name: m.id,
        contextLength: m.id.includes('gpt-4') ? 128000 : 16000,
        supportsJson: m.id.includes('gpt-4') || m.id.includes('gpt-3.5-turbo'),
      }));
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private mapFinishReason(reason: string): IChatCompletionResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      case 'tool_calls':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}

/**
 * Create OpenAI adapter
 */
export function createOpenAIAdapter(config: OpenAIAdapterConfig): ILLMProvider {
  return new OpenAIAdapter(config);
}
