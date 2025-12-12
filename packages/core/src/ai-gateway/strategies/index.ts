/**
 * @fileoverview AI Provider Strategies Index
 *
 * Exports all AI provider strategies for the multi-provider gateway.
 * Following the Strategy Pattern for extensible provider support.
 *
 * @module core/ai-gateway/strategies
 */

export * from './ai-provider-strategy.js';
export * from './openai-strategy.js';
export * from './anthropic-strategy.js';
export * from './local-llm-strategy.js';

import type { IAIProviderStrategy } from './ai-provider-strategy.js';
import { OpenAIStrategy } from './openai-strategy.js';
import { AnthropicStrategy } from './anthropic-strategy.js';
import { LlamaStrategy, OllamaStrategy } from './local-llm-strategy.js';

/**
 * Create default set of AI provider strategies
 *
 * Returns strategies for OpenAI, Anthropic, Llama, and Ollama.
 * Additional strategies can be added by implementing IAIProviderStrategy.
 */
export function createDefaultAIStrategies(): IAIProviderStrategy[] {
  return [
    new OpenAIStrategy(),
    new AnthropicStrategy(),
    new LlamaStrategy(),
    new OllamaStrategy(),
  ];
}

/**
 * Get strategy by provider name
 *
 * @param strategies - Array of strategies
 * @param providerName - Provider name to find
 * @returns Strategy instance or undefined
 */
export function getStrategyByProviderName(
  strategies: IAIProviderStrategy[],
  providerName: string
): IAIProviderStrategy | undefined {
  return strategies.find((s) => s.providerName === providerName);
}
