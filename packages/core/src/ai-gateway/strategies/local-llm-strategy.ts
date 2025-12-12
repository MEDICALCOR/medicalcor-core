/**
 * @fileoverview Local LLM Provider Strategy
 *
 * Implements the IAIProviderStrategy interface for local LLMs.
 * Handles Llama and Ollama servers running locally.
 *
 * @module core/ai-gateway/strategies/local-llm-strategy
 */

import type { ProviderConfig } from '../multi-provider-gateway.js';
import type {
  IAIProviderStrategy,
  AIProviderCallOptions,
  AIProviderCallResult,
} from './ai-provider-strategy.js';

// ============================================================================
// LOCAL LLM RESPONSE TYPES
// ============================================================================

interface LocalLLMResponse {
  message?: { content?: string };
  choices?: { message?: { content?: string } }[];
  prompt_eval_count?: number;
  eval_count?: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

// ============================================================================
// STRATEGY IMPLEMENTATION
// ============================================================================

/**
 * Llama Provider Strategy
 *
 * Handles API calls to local Llama servers (llama.cpp, vLLM, etc.)
 * using OpenAI-compatible endpoints.
 */
export class LlamaStrategy implements IAIProviderStrategy {
  readonly providerName = 'llama';

  canHandle(config: ProviderConfig): boolean {
    return config.provider === 'llama' && config.enabled === true;
  }

  async execute(config: ProviderConfig, options: AIProviderCallOptions): Promise<AIProviderCallResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      // Use OpenAI-compatible endpoint
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? config.maxTokens,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Llama API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as LocalLLMResponse;

      // Handle both Llama and OpenAI-compatible response formats
      const content = data.message?.content ?? data.choices?.[0]?.message?.content ?? '';

      return {
        content,
        tokensUsed: {
          prompt: data.prompt_eval_count ?? data.usage?.prompt_tokens ?? 0,
          completion: data.eval_count ?? data.usage?.completion_tokens ?? 0,
          total:
            (data.prompt_eval_count ?? 0) +
            (data.eval_count ?? 0) +
            (data.usage?.total_tokens ?? 0),
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Ollama Provider Strategy
 *
 * Handles API calls to Ollama servers using their native API format.
 */
export class OllamaStrategy implements IAIProviderStrategy {
  readonly providerName = 'ollama';

  canHandle(config: ProviderConfig): boolean {
    return config.provider === 'ollama' && config.enabled === true;
  }

  async execute(config: ProviderConfig, options: AIProviderCallOptions): Promise<AIProviderCallResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      // Use Ollama's native chat endpoint
      const response = await fetch(`${config.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? config.maxTokens,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as LocalLLMResponse;

      return {
        content: data.message?.content ?? '',
        tokensUsed: {
          prompt: data.prompt_eval_count ?? 0,
          completion: data.eval_count ?? 0,
          total: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a Llama strategy instance
 */
export function createLlamaStrategy(): LlamaStrategy {
  return new LlamaStrategy();
}

/**
 * Create an Ollama strategy instance
 */
export function createOllamaStrategy(): OllamaStrategy {
  return new OllamaStrategy();
}
