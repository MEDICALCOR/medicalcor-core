/**
 * @fileoverview AI Provider Strategy Interface
 *
 * Defines the contract for AI provider strategies following the Strategy Pattern.
 * This enables adding new AI providers without modifying the gateway itself
 * (Open/Closed Principle compliance).
 *
 * @module core/ai-gateway/strategies/ai-provider-strategy
 *
 * AGI BEST PRACTICES:
 * - Model Consortium: Multiple providers for resilience
 * - Single Responsibility: Each strategy handles one provider
 * - Open/Closed: Add providers without modifying gateway
 */

import type { ChatMessage, ProviderConfig } from '../multi-provider-gateway.js';

// ============================================================================
// STRATEGY RESULT TYPES
// ============================================================================

/**
 * Result from an AI provider call
 */
export interface AIProviderCallResult {
  /** Generated content */
  content: string;
  /** Token usage */
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Options for AI provider call
 */
export interface AIProviderCallOptions {
  /** Chat messages */
  messages: ChatMessage[];
  /** Model to use */
  model: string;
  /** Maximum tokens */
  maxTokens?: number;
  /** Temperature */
  temperature?: number;
  /** Enable JSON mode */
  jsonMode?: boolean;
  /** Request timeout in milliseconds */
  timeoutMs: number;
}

// ============================================================================
// STRATEGY INTERFACE
// ============================================================================

/**
 * AI Provider Strategy Interface
 *
 * Contract for all AI provider strategies. Implementations must provide:
 * - A unique provider name identifier
 * - A method to check if the strategy can handle the request
 * - A method to execute the AI completion
 *
 * @example
 * ```typescript
 * class OpenAIStrategy implements IAIProviderStrategy {
 *   readonly providerName = 'openai';
 *
 *   canHandle(config: ProviderConfig) {
 *     return config.provider === 'openai' && config.enabled;
 *   }
 *
 *   async execute(config, options) {
 *     // OpenAI-specific implementation
 *     return { content, tokensUsed };
 *   }
 * }
 * ```
 */
export interface IAIProviderStrategy {
  /**
   * Unique identifier for this AI provider
   */
  readonly providerName: string;

  /**
   * Check if this strategy can handle the given configuration
   *
   * @param config - Provider configuration
   * @returns True if this strategy can handle the request
   */
  canHandle(config: ProviderConfig): boolean;

  /**
   * Execute AI completion using this provider's API
   *
   * @param config - Provider configuration (API key, base URL, etc.)
   * @param options - Call options (messages, model, temperature, etc.)
   * @returns Promise with content and token usage
   * @throws Error if the API call fails
   */
  execute(config: ProviderConfig, options: AIProviderCallOptions): Promise<AIProviderCallResult>;
}
