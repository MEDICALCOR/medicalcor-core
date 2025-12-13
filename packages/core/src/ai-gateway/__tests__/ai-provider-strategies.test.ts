/**
 * AI Provider Strategy Tests
 *
 * Tests for Anthropic, Gemini, Llama, and Ollama provider strategies.
 *
 * @module core/ai-gateway/__tests__/ai-provider-strategies
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnthropicStrategy, createAnthropicStrategy } from '../strategies/anthropic-strategy.js';
import { GeminiStrategy, createGeminiStrategy } from '../strategies/gemini-strategy.js';
import {
  LlamaStrategy,
  OllamaStrategy,
  createLlamaStrategy,
  createOllamaStrategy,
} from '../strategies/local-llm-strategy.js';
import type { ProviderConfig } from '../multi-provider-gateway.js';
import type { AIProviderCallOptions } from '../strategies/ai-provider-strategy.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockConfig(
  provider: string,
  overrides: Partial<ProviderConfig> = {}
): ProviderConfig {
  return {
    provider: provider as ProviderConfig['provider'],
    apiKey: 'test-api-key',
    baseUrl: 'https://api.test.com',
    enabled: true,
    maxTokens: 1024,
    models: ['test-model'],
    rateLimit: { requestsPerMinute: 60, tokensPerMinute: 100000 },
    costPer1kTokens: { input: 0.01, output: 0.03 },
    ...overrides,
  };
}

function createMockOptions(overrides: Partial<AIProviderCallOptions> = {}): AIProviderCallOptions {
  return {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ],
    model: 'test-model',
    maxTokens: 100,
    temperature: 0.7,
    timeoutMs: 5000,
    ...overrides,
  };
}

// ============================================================================
// ANTHROPIC STRATEGY TESTS
// ============================================================================

describe('AnthropicStrategy', () => {
  let strategy: AnthropicStrategy;

  beforeEach(() => {
    strategy = new AnthropicStrategy();
  });

  describe('canHandle', () => {
    it('should return true for anthropic provider when enabled', () => {
      const config = createMockConfig('anthropic');
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should return false for non-anthropic provider', () => {
      const config = createMockConfig('openai');
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should return false when provider is disabled', () => {
      const config = createMockConfig('anthropic', { enabled: false });
      expect(strategy.canHandle(config)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should throw error when API key is not configured', async () => {
      const config = createMockConfig('anthropic', { apiKey: undefined });
      const options = createMockOptions();

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Anthropic API key not configured'
      );
    });

    it('should make successful API call and return result', async () => {
      const config = createMockConfig('anthropic');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Hello back!' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello back!');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(5);
      expect(result.tokensUsed.total).toBe(15);
    });

    it('should handle API error response', async () => {
      const config = createMockConfig('anthropic');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Anthropic API error: 401 - Unauthorized'
      );
    });

    it('should handle empty content response', async () => {
      const config = createMockConfig('anthropic');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [],
          usage: { input_tokens: 10, output_tokens: 0 },
        }),
      });

      const result = await strategy.execute(config, options);
      expect(result.content).toBe('');
    });

    it('should handle missing usage data', async () => {
      const config = createMockConfig('anthropic');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Response' }],
        }),
      });

      const result = await strategy.execute(config, options);
      expect(result.tokensUsed.prompt).toBe(0);
      expect(result.tokensUsed.completion).toBe(0);
      expect(result.tokensUsed.total).toBe(0);
    });

    it('should convert messages to Anthropic format', async () => {
      const config = createMockConfig('anthropic');
      const options = createMockOptions({
        messages: [
          { role: 'system', content: 'Be helpful' },
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'How are you?' },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Fine!' }],
          usage: { input_tokens: 20, output_tokens: 5 },
        }),
      });

      await strategy.execute(config, options);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });
  });

  describe('createAnthropicStrategy', () => {
    it('should create an AnthropicStrategy instance', () => {
      const instance = createAnthropicStrategy();
      expect(instance).toBeInstanceOf(AnthropicStrategy);
      expect(instance.providerName).toBe('anthropic');
    });
  });
});

// ============================================================================
// GEMINI STRATEGY TESTS
// ============================================================================

describe('GeminiStrategy', () => {
  let strategy: GeminiStrategy;

  beforeEach(() => {
    strategy = new GeminiStrategy();
  });

  describe('canHandle', () => {
    it('should return true for gemini provider when enabled', () => {
      const config = createMockConfig('gemini');
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should return false for non-gemini provider', () => {
      const config = createMockConfig('openai');
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should return false when provider is disabled', () => {
      const config = createMockConfig('gemini', { enabled: false });
      expect(strategy.canHandle(config)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should throw error when API key is not configured', async () => {
      const config = createMockConfig('gemini', { apiKey: undefined });
      const options = createMockOptions();

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Google Gemini API key not configured'
      );
    });

    it('should make successful API call and return result', async () => {
      const config = createMockConfig('gemini');
      const options = createMockOptions({ model: 'gemini-1.5-pro' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Hello from Gemini!' }] },
            },
          ],
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 8,
            totalTokenCount: 23,
          },
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello from Gemini!');
      expect(result.tokensUsed.prompt).toBe(15);
      expect(result.tokensUsed.completion).toBe(8);
      expect(result.tokensUsed.total).toBe(23);
    });

    it('should handle API error response', async () => {
      const config = createMockConfig('gemini');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Gemini API error: 403 - Forbidden'
      );
    });

    it('should handle API-level error in response', async () => {
      const config = createMockConfig('gemini');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { code: 400, message: 'Invalid request', status: 'INVALID_ARGUMENT' },
        }),
      });

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Gemini API error: 400 - Invalid request'
      );
    });

    it('should handle empty candidates response', async () => {
      const config = createMockConfig('gemini');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0, totalTokenCount: 10 },
        }),
      });

      const result = await strategy.execute(config, options);
      expect(result.content).toBe('');
    });

    it('should include system instruction when present', async () => {
      const config = createMockConfig('gemini');
      const options = createMockOptions({
        messages: [
          { role: 'system', content: 'Be concise' },
          { role: 'user', content: 'Hello' },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Hi!' }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
        }),
      });

      await strategy.execute(config, options);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be concise' }] });
    });

    it('should handle JSON mode option', async () => {
      const config = createMockConfig('gemini');
      const options = createMockOptions({ jsonMode: true });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"key": "value"}' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      });

      await strategy.execute(config, options);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.generationConfig.responseMimeType).toBe('application/json');
    });
  });

  describe('createGeminiStrategy', () => {
    it('should create a GeminiStrategy instance', () => {
      const instance = createGeminiStrategy();
      expect(instance).toBeInstanceOf(GeminiStrategy);
      expect(instance.providerName).toBe('gemini');
    });
  });
});

// ============================================================================
// LLAMA STRATEGY TESTS
// ============================================================================

describe('LlamaStrategy', () => {
  let strategy: LlamaStrategy;

  beforeEach(() => {
    strategy = new LlamaStrategy();
  });

  describe('canHandle', () => {
    it('should return true for llama provider when enabled', () => {
      const config = createMockConfig('llama');
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should return false for non-llama provider', () => {
      const config = createMockConfig('openai');
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should return false when provider is disabled', () => {
      const config = createMockConfig('llama', { enabled: false });
      expect(strategy.canHandle(config)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should make successful API call with Llama response format', async () => {
      const config = createMockConfig('llama');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'Hello from Llama!' },
          prompt_eval_count: 12,
          eval_count: 6,
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello from Llama!');
      expect(result.tokensUsed.prompt).toBe(12);
      expect(result.tokensUsed.completion).toBe(6);
    });

    it('should handle OpenAI-compatible response format', async () => {
      const config = createMockConfig('llama');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello from vLLM!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello from vLLM!');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(5);
    });

    it('should handle API error response', async () => {
      const config = createMockConfig('llama');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Llama API error: 500 - Internal Server Error'
      );
    });

    it('should handle empty response', async () => {
      const config = createMockConfig('llama');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await strategy.execute(config, options);
      expect(result.content).toBe('');
    });
  });

  describe('createLlamaStrategy', () => {
    it('should create a LlamaStrategy instance', () => {
      const instance = createLlamaStrategy();
      expect(instance).toBeInstanceOf(LlamaStrategy);
      expect(instance.providerName).toBe('llama');
    });
  });
});

// ============================================================================
// OLLAMA STRATEGY TESTS
// ============================================================================

describe('OllamaStrategy', () => {
  let strategy: OllamaStrategy;

  beforeEach(() => {
    strategy = new OllamaStrategy();
  });

  describe('canHandle', () => {
    it('should return true for ollama provider when enabled', () => {
      const config = createMockConfig('ollama');
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should return false for non-ollama provider', () => {
      const config = createMockConfig('openai');
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should return false when provider is disabled', () => {
      const config = createMockConfig('ollama', { enabled: false });
      expect(strategy.canHandle(config)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should make successful API call and return result', async () => {
      const config = createMockConfig('ollama');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'Hello from Ollama!' },
          prompt_eval_count: 8,
          eval_count: 4,
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello from Ollama!');
      expect(result.tokensUsed.prompt).toBe(8);
      expect(result.tokensUsed.completion).toBe(4);
      expect(result.tokensUsed.total).toBe(12);
    });

    it('should handle API error response', async () => {
      const config = createMockConfig('ollama');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Ollama API error: 503 - Service Unavailable'
      );
    });

    it('should handle empty message content', async () => {
      const config = createMockConfig('ollama');
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {},
          prompt_eval_count: 5,
          eval_count: 0,
        }),
      });

      const result = await strategy.execute(config, options);
      expect(result.content).toBe('');
    });

    it('should use correct endpoint', async () => {
      const config = createMockConfig('ollama', { baseUrl: 'http://localhost:11434/api' });
      const options = createMockOptions();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'Response' },
          prompt_eval_count: 10,
          eval_count: 5,
        }),
      });

      await strategy.execute(config, options);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.any(Object));
    });
  });

  describe('createOllamaStrategy', () => {
    it('should create an OllamaStrategy instance', () => {
      const instance = createOllamaStrategy();
      expect(instance).toBeInstanceOf(OllamaStrategy);
      expect(instance.providerName).toBe('ollama');
    });
  });
});
