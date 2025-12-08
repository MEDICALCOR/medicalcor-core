/**
 * Token Estimation Pre-Call
 *
 * Estimates token count and cost before making AI API calls.
 * Uses GPT tokenization approximation for accurate estimates.
 *
 * Based on OpenAI's tokenization rules:
 * - ~4 characters per token for English
 * - ~1.5 tokens per word
 * - Special handling for code, numbers, punctuation
 */

import { z } from 'zod';

/**
 * Model pricing per 1k tokens (as of 2024)
 */
export const MODEL_PRICING: Record<
  string,
  { input: number; output: number; contextWindow: number }
> = {
  // OpenAI Models
  'gpt-4o': { input: 0.0025, output: 0.01, contextWindow: 128000 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006, contextWindow: 128000 },
  'gpt-4-turbo': { input: 0.01, output: 0.03, contextWindow: 128000 },
  'gpt-4': { input: 0.03, output: 0.06, contextWindow: 8192 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015, contextWindow: 16385 },

  // Anthropic Models
  'claude-3-opus': { input: 0.015, output: 0.075, contextWindow: 200000 },
  'claude-3-sonnet': { input: 0.003, output: 0.015, contextWindow: 200000 },
  'claude-sonnet-4-5': { input: 0.003, output: 0.015, contextWindow: 200000 },
  'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015, contextWindow: 200000 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125, contextWindow: 200000 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015, contextWindow: 200000 },

  // Local Models (free)
  'llama3.1:8b': { input: 0, output: 0, contextWindow: 128000 },
  'llama3.1:70b': { input: 0, output: 0, contextWindow: 128000 },
  'llama3:8b': { input: 0, output: 0, contextWindow: 8192 },
  mistral: { input: 0, output: 0, contextWindow: 32000 },
  'mixtral:8x7b': { input: 0, output: 0, contextWindow: 32000 },
};

/**
 * Token estimation result
 */
export interface TokenEstimate {
  /** Estimated input tokens */
  inputTokens: number;
  /** Estimated output tokens (based on maxTokens or default) */
  estimatedOutputTokens: number;
  /** Total estimated tokens */
  totalTokens: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Whether request exceeds context window */
  exceedsContext: boolean;
  /** Available tokens for output */
  availableOutputTokens: number;
  /** Model used for estimation */
  model: string;
  /** Confidence level of estimate */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Cost tracking result
 */
export interface CostEstimate {
  /** Input cost in USD */
  inputCost: number;
  /** Output cost in USD */
  outputCost: number;
  /** Total cost in USD */
  totalCost: number;
  /** Cost breakdown by component */
  breakdown: {
    systemPrompt: number;
    userMessages: number;
    assistantMessages: number;
    estimatedResponse: number;
  };
}

/**
 * Message for token counting
 */
export interface TokenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Configuration schema
 */
export const TokenEstimatorConfigSchema = z.object({
  /** Default model for estimation */
  defaultModel: z.string().default('gpt-4o'),
  /** Default expected output tokens */
  defaultOutputTokens: z.number().int().min(10).max(32000).default(500),
  /** Characters per token ratio (for estimation) */
  charsPerToken: z.number().min(1).max(10).default(4),
  /** Include overhead for message formatting */
  includeMessageOverhead: z.boolean().default(true),
  /** Message overhead tokens per message */
  messageOverheadTokens: z.number().int().min(0).max(50).default(4),
  /** Safety margin percentage (0-1) */
  safetyMargin: z.number().min(0).max(0.5).default(0.1),
});

export type TokenEstimatorConfig = z.infer<typeof TokenEstimatorConfigSchema>;

/**
 * Token Estimator
 *
 * Provides accurate token estimation for AI API calls using
 * GPT-style tokenization approximation.
 */
export class TokenEstimator {
  private config: TokenEstimatorConfig;

  constructor(config: Partial<TokenEstimatorConfig> = {}) {
    this.config = TokenEstimatorConfigSchema.parse(config);
  }

  /**
   * Estimate tokens for a text string
   */
  estimateTokens(text: string): number {
    if (!text) return 0;

    // GPT tokenization approximation
    // Based on research showing ~4 chars/token for English
    // with adjustments for different content types

    let tokenCount = 0;

    // Split into words and special characters
    const parts = text.split(/(\s+|[^\w\s]+)/);

    for (const part of parts) {
      if (!part) continue;

      // Whitespace
      if (/^\s+$/.test(part)) {
        tokenCount += Math.ceil(part.length / 4);
        continue;
      }

      // Numbers - typically 1-3 digits per token
      if (/^\d+$/.test(part)) {
        tokenCount += Math.ceil(part.length / 3);
        continue;
      }

      // Punctuation - usually 1 token per character
      if (/^[^\w\s]+$/.test(part)) {
        tokenCount += part.length;
        continue;
      }

      // Code-like content (camelCase, snake_case, etc.)
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part) && part.length > 10) {
        // Code identifiers are often split at boundaries
        const subParts = part.split(/(?=[A-Z])|_/);
        tokenCount += subParts.length;
        continue;
      }

      // URLs
      if (/^https?:\/\//.test(part)) {
        tokenCount += Math.ceil(part.length / 3);
        continue;
      }

      // Regular words - ~4 chars per token
      tokenCount += Math.ceil(part.length / this.config.charsPerToken);
    }

    // Apply safety margin
    return Math.ceil(tokenCount * (1 + this.config.safetyMargin));
  }

  /**
   * Estimate tokens for chat messages
   */
  estimateMessagesTokens(messages: TokenMessage[]): number {
    let totalTokens = 0;

    for (const message of messages) {
      // Message content
      totalTokens += this.estimateTokens(message.content);

      // Message overhead (role, formatting)
      if (this.config.includeMessageOverhead) {
        totalTokens += this.config.messageOverheadTokens;
      }
    }

    // Conversation overhead
    totalTokens += 3; // <|start|>, <|end|>, etc.

    return totalTokens;
  }

  /**
   * Get full token estimate including cost
   */
  estimate(
    messages: TokenMessage[],
    options: {
      model?: string;
      maxOutputTokens?: number;
    } = {}
  ): TokenEstimate {
    const model = options.model ?? this.config.defaultModel;
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o']!;

    const inputTokens = this.estimateMessagesTokens(messages);
    const estimatedOutputTokens = options.maxOutputTokens ?? this.config.defaultOutputTokens;
    const totalTokens = inputTokens + estimatedOutputTokens;

    const availableOutputTokens = Math.max(0, pricing.contextWindow - inputTokens);
    const exceedsContext = inputTokens >= pricing.contextWindow;

    // Calculate cost
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (estimatedOutputTokens / 1000) * pricing.output;
    const estimatedCost = inputCost + outputCost;

    // Determine confidence based on message complexity
    let confidence: 'high' | 'medium' | 'low' = 'high';
    const avgMessageLength =
      messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
    if (avgMessageLength > 5000) confidence = 'medium';
    if (avgMessageLength > 20000) confidence = 'low';

    return {
      inputTokens,
      estimatedOutputTokens,
      totalTokens,
      estimatedCost,
      exceedsContext,
      availableOutputTokens,
      model,
      confidence,
    };
  }

  /**
   * Get detailed cost estimate
   */
  estimateCost(
    messages: TokenMessage[],
    options: {
      model?: string;
      maxOutputTokens?: number;
    } = {}
  ): CostEstimate {
    const model = options.model ?? this.config.defaultModel;
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o']!;

    // Calculate tokens by message type
    let systemTokens = 0;
    let userTokens = 0;
    let assistantTokens = 0;

    for (const message of messages) {
      const tokens = this.estimateTokens(message.content);
      switch (message.role) {
        case 'system':
          systemTokens += tokens;
          break;
        case 'user':
          userTokens += tokens;
          break;
        case 'assistant':
          assistantTokens += tokens;
          break;
      }
    }

    const estimatedOutputTokens = options.maxOutputTokens ?? this.config.defaultOutputTokens;

    // Calculate costs
    const systemCost = (systemTokens / 1000) * pricing.input;
    const userCost = (userTokens / 1000) * pricing.input;
    const assistantCost = (assistantTokens / 1000) * pricing.input;
    const responseCost = (estimatedOutputTokens / 1000) * pricing.output;

    const inputCost = systemCost + userCost + assistantCost;
    const outputCost = responseCost;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      breakdown: {
        systemPrompt: systemCost,
        userMessages: userCost,
        assistantMessages: assistantCost,
        estimatedResponse: responseCost,
      },
    };
  }

  /**
   * Check if request would exceed budget
   */
  wouldExceedBudget(
    messages: TokenMessage[],
    budgetUsd: number,
    options: { model?: string; maxOutputTokens?: number } = {}
  ): { exceeds: boolean; estimatedCost: number; remaining: number } {
    const cost = this.estimateCost(messages, options);
    return {
      exceeds: cost.totalCost > budgetUsd,
      estimatedCost: cost.totalCost,
      remaining: budgetUsd - cost.totalCost,
    };
  }

  /**
   * Get model pricing
   */
  getModelPricing(
    model: string
  ): { input: number; output: number; contextWindow: number } | undefined {
    return MODEL_PRICING[model];
  }

  /**
   * List available models
   */
  getAvailableModels(): string[] {
    return Object.keys(MODEL_PRICING);
  }

  /**
   * Calculate actual cost from usage
   */
  calculateActualCost(
    model: string,
    usage: { promptTokens: number; completionTokens: number }
  ): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o']!;
    const inputCost = (usage.promptTokens / 1000) * pricing.input;
    const outputCost = (usage.completionTokens / 1000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Truncate messages to fit within token limit
   */
  truncateToFit(
    messages: TokenMessage[],
    maxTokens: number,
    options: {
      preserveSystem?: boolean;
      preserveLastN?: number;
    } = {}
  ): TokenMessage[] {
    const { preserveSystem = true, preserveLastN = 2 } = options;

    // Separate system messages and others
    const systemMessages = preserveSystem ? messages.filter((m) => m.role === 'system') : [];
    const otherMessages = preserveSystem
      ? messages.filter((m) => m.role !== 'system')
      : [...messages];

    // Calculate system token usage
    const systemTokens = this.estimateMessagesTokens(systemMessages);
    const availableTokens = maxTokens - systemTokens;

    if (availableTokens <= 0) {
      // Even system messages exceed limit, truncate them
      return systemMessages.map((m) => ({
        ...m,
        content: m.content.substring(
          0,
          Math.floor((maxTokens / systemMessages.length) * this.config.charsPerToken)
        ),
      }));
    }

    // Keep last N messages if possible
    const lastMessages = otherMessages.slice(-preserveLastN);
    const olderMessages = otherMessages.slice(0, -preserveLastN);

    const lastTokens = this.estimateMessagesTokens(lastMessages);
    const remainingTokens = availableTokens - lastTokens;

    if (remainingTokens <= 0) {
      // Can't fit even the last messages, truncate them
      return [...systemMessages, ...lastMessages];
    }

    // Fit as many older messages as possible
    const fittedOlder: TokenMessage[] = [];
    let usedTokens = 0;

    // Work backwards from oldest to newest
    for (let i = olderMessages.length - 1; i >= 0; i--) {
      const message = olderMessages[i]!;
      const messageTokens = this.estimateTokens(message.content);

      if (usedTokens + messageTokens <= remainingTokens) {
        fittedOlder.unshift(message);
        usedTokens += messageTokens;
      } else {
        break;
      }
    }

    return [...systemMessages, ...fittedOlder, ...lastMessages];
  }

  /**
   * Get configuration
   */
  getConfig(): TokenEstimatorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TokenEstimatorConfig>): void {
    this.config = TokenEstimatorConfigSchema.parse({ ...this.config, ...updates });
  }
}

/**
 * Factory function
 */
export function createTokenEstimator(config?: Partial<TokenEstimatorConfig>): TokenEstimator {
  return new TokenEstimator(config);
}

/**
 * Default singleton instance
 */
export const tokenEstimator = createTokenEstimator();

/**
 * Utility function for quick token estimate
 */
export function estimateTokens(text: string): number {
  return tokenEstimator.estimateTokens(text);
}

/**
 * Utility function for quick cost estimate
 */
export function estimateCost(
  messages: TokenMessage[],
  model = 'gpt-4o',
  maxOutputTokens = 500
): CostEstimate {
  return tokenEstimator.estimateCost(messages, { model, maxOutputTokens });
}
