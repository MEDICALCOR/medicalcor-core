/**
 * @fileoverview Anthropic Provider Strategy
 *
 * Implements the IAIProviderStrategy interface for Anthropic API.
 * Handles Claude 3.5 Sonnet, Claude 3 Opus, and other Claude models.
 *
 * @module core/ai-gateway/strategies/anthropic-strategy
 */

import type { ProviderConfig } from '../multi-provider-gateway.js';
import type {
  IAIProviderStrategy,
  AIProviderCallOptions,
  AIProviderCallResult,
} from './ai-provider-strategy.js';

// ============================================================================
// ANTHROPIC RESPONSE TYPES
// ============================================================================

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

// ============================================================================
// STRATEGY IMPLEMENTATION
// ============================================================================

/**
 * Anthropic Provider Strategy
 *
 * Handles API calls to Anthropic's messages endpoint.
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, and compatible models.
 *
 * Note: Anthropic uses a different message format than OpenAI,
 * this strategy handles the conversion automatically.
 */
export class AnthropicStrategy implements IAIProviderStrategy {
  readonly providerName = 'anthropic';

  canHandle(config: ProviderConfig): boolean {
    return config.provider === 'anthropic' && config.enabled === true;
  }

  async execute(config: ProviderConfig, options: AIProviderCallOptions): Promise<AIProviderCallResult> {
    if (!config.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      // Convert OpenAI format to Anthropic format
      const systemMessage = options.messages.find((m) => m.role === 'system');
      const nonSystemMessages = options.messages.filter((m) => m.role !== 'system');

      const response = await fetch(`${config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxTokens ?? config.maxTokens,
          ...(systemMessage && { system: systemMessage.content }),
          messages: nonSystemMessages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as AnthropicResponse;

      const content = data.content?.find((c) => c.type === 'text')?.text ?? '';

      return {
        content,
        tokensUsed: {
          prompt: data.usage?.input_tokens ?? 0,
          completion: data.usage?.output_tokens ?? 0,
          total: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create an Anthropic strategy instance
 */
export function createAnthropicStrategy(): AnthropicStrategy {
  return new AnthropicStrategy();
}
