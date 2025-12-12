/**
 * @fileoverview OpenAI Provider Strategy
 *
 * Implements the IAIProviderStrategy interface for OpenAI API.
 * Handles GPT-4o, GPT-4, GPT-3.5-turbo and other OpenAI models.
 *
 * @module core/ai-gateway/strategies/openai-strategy
 */

import type { ProviderConfig } from '../multi-provider-gateway.js';
import type {
  IAIProviderStrategy,
  AIProviderCallOptions,
  AIProviderCallResult,
} from './ai-provider-strategy.js';

// ============================================================================
// OPENAI RESPONSE TYPES
// ============================================================================

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

// ============================================================================
// STRATEGY IMPLEMENTATION
// ============================================================================

/**
 * OpenAI Provider Strategy
 *
 * Handles API calls to OpenAI's chat completions endpoint.
 * Supports GPT-4o, GPT-4, GPT-3.5-turbo and compatible models.
 */
export class OpenAIStrategy implements IAIProviderStrategy {
  readonly providerName = 'openai';

  canHandle(config: ProviderConfig): boolean {
    return config.provider === 'openai' && config.enabled === true;
  }

  async execute(config: ProviderConfig, options: AIProviderCallOptions): Promise<AIProviderCallResult> {
    if (!config.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.organization && { 'OpenAI-Organization': config.organization }),
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          max_tokens: options.maxTokens ?? config.maxTokens,
          temperature: options.temperature ?? 0.7,
          ...(options.jsonMode && { response_format: { type: 'json_object' } }),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as OpenAIResponse;

      return {
        content: data.choices?.[0]?.message?.content ?? '',
        tokensUsed: {
          prompt: data.usage?.prompt_tokens ?? 0,
          completion: data.usage?.completion_tokens ?? 0,
          total: data.usage?.total_tokens ?? 0,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create an OpenAI strategy instance
 */
export function createOpenAIStrategy(): OpenAIStrategy {
  return new OpenAIStrategy();
}
