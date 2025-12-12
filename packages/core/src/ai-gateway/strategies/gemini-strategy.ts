/**
 * @fileoverview Google Gemini Provider Strategy
 *
 * Implements the IAIProviderStrategy interface for Google Gemini API.
 * Handles Gemini Pro, Gemini Pro Vision, and Gemini Ultra models.
 *
 * @module core/ai-gateway/strategies/gemini-strategy
 */

import type { ProviderConfig } from '../multi-provider-gateway.js';
import type {
  IAIProviderStrategy,
  AIProviderCallOptions,
  AIProviderCallResult,
} from './ai-provider-strategy.js';

// ============================================================================
// GEMINI RESPONSE TYPES
// ============================================================================

interface GeminiContent {
  parts?: { text?: string }[];
  role?: string;
}

interface GeminiCandidate {
  content?: GeminiContent;
  finishReason?: string;
  safetyRatings?: { category: string; probability: string }[];
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  error?: { code: number; message: string; status: string };
}

// ============================================================================
// GEMINI MESSAGE CONVERSION
// ============================================================================

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/**
 * Convert OpenAI-style messages to Gemini format
 *
 * Gemini uses 'model' instead of 'assistant' and requires system
 * instructions to be passed separately.
 */
function convertToGeminiMessages(messages: AIProviderCallOptions['messages']): {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiMessage[];
} {
  const systemMessage = messages.find((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  const contents: GeminiMessage[] = nonSystemMessages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  return {
    systemInstruction: systemMessage
      ? { parts: [{ text: systemMessage.content }] }
      : undefined,
    contents,
  };
}

// ============================================================================
// STRATEGY IMPLEMENTATION
// ============================================================================

/**
 * Google Gemini Provider Strategy
 *
 * Handles API calls to Google's Gemini API endpoint.
 * Supports Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0, and compatible models.
 *
 * @example
 * ```typescript
 * const strategy = new GeminiStrategy();
 *
 * const result = await strategy.execute(config, {
 *   messages: [{ role: 'user', content: 'Hello' }],
 *   model: 'gemini-1.5-pro',
 *   maxTokens: 1024,
 *   temperature: 0.7,
 *   timeoutMs: 30000,
 * });
 * ```
 */
export class GeminiStrategy implements IAIProviderStrategy {
  readonly providerName = 'gemini';

  canHandle(config: ProviderConfig): boolean {
    return config.provider === 'gemini' && config.enabled === true;
  }

  async execute(config: ProviderConfig, options: AIProviderCallOptions): Promise<AIProviderCallResult> {
    if (!config.apiKey) {
      throw new Error('Google Gemini API key not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      // Convert messages to Gemini format
      const { systemInstruction, contents } = convertToGeminiMessages(options.messages);

      // Build API URL with model
      const model = options.model;
      const apiUrl = `${config.baseUrl}/models/${model}:generateContent?key=${config.apiKey}`;

      // Build request body
      const requestBody: Record<string, unknown> = {
        contents,
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? config.maxTokens,
          temperature: options.temperature ?? 0.7,
          ...(options.jsonMode && {
            responseMimeType: 'application/json',
          }),
        },
      };

      // Add system instruction if present
      if (systemInstruction) {
        requestBody.systemInstruction = systemInstruction;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as GeminiResponse;

      // Check for API-level error
      if (data.error) {
        throw new Error(`Gemini API error: ${data.error.code} - ${data.error.message}`);
      }

      // Extract content from response
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      return {
        content,
        tokensUsed: {
          prompt: data.usageMetadata?.promptTokenCount ?? 0,
          completion: data.usageMetadata?.candidatesTokenCount ?? 0,
          total: data.usageMetadata?.totalTokenCount ?? 0,
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a Gemini strategy instance
 */
export function createGeminiStrategy(): GeminiStrategy {
  return new GeminiStrategy();
}
