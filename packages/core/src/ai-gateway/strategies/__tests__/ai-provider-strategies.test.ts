/**
 * @fileoverview AI Provider Strategies Unit Tests
 *
 * Tests the Strategy Pattern implementation for AI providers.
 * Verifies:
 * - canHandle correctly identifies providers
 * - execute makes proper API calls
 * - Error handling works correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDefaultAIStrategies,
  getStrategyByProviderName,
  OpenAIStrategy,
  AnthropicStrategy,
  GeminiStrategy,
  LlamaStrategy,
  OllamaStrategy,
  type IAIProviderStrategy,
  type AIProviderCallOptions,
} from '../index.js';
import type { ProviderConfig } from '../../multi-provider-gateway.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('AI Provider Strategies', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createDefaultAIStrategies', () => {
    it('should create all default strategies', () => {
      const strategies = createDefaultAIStrategies();
      expect(strategies).toHaveLength(5);

      const providerNames = strategies.map((s) => s.providerName);
      expect(providerNames).toContain('openai');
      expect(providerNames).toContain('anthropic');
      expect(providerNames).toContain('gemini');
      expect(providerNames).toContain('llama');
      expect(providerNames).toContain('ollama');
    });
  });

  describe('getStrategyByProviderName', () => {
    it('should find strategy by provider name', () => {
      const strategies = createDefaultAIStrategies();

      const openaiStrategy = getStrategyByProviderName(strategies, 'openai');
      expect(openaiStrategy).toBeDefined();
      expect(openaiStrategy?.providerName).toBe('openai');

      const anthropicStrategy = getStrategyByProviderName(strategies, 'anthropic');
      expect(anthropicStrategy).toBeDefined();
      expect(anthropicStrategy?.providerName).toBe('anthropic');
    });

    it('should return undefined for unknown provider', () => {
      const strategies = createDefaultAIStrategies();
      const unknown = getStrategyByProviderName(strategies, 'unknown');
      expect(unknown).toBeUndefined();
    });
  });

  describe('OpenAIStrategy', () => {
    let strategy: OpenAIStrategy;
    let config: ProviderConfig;
    let options: AIProviderCallOptions;

    beforeEach(() => {
      strategy = new OpenAIStrategy();
      config = {
        provider: 'openai',
        enabled: true,
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o',
        maxTokens: 4096,
        costPer1kTokens: { input: 0.03, output: 0.06 },
      };
      options = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4o',
        maxTokens: 1000,
        temperature: 0.7,
        timeoutMs: 30000,
      };
    });

    it('should have correct provider name', () => {
      expect(strategy.providerName).toBe('openai');
    });

    it('should handle OpenAI config', () => {
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should not handle disabled OpenAI config', () => {
      config.enabled = false;
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should not handle other provider configs', () => {
      config.provider = 'anthropic';
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should execute OpenAI API call successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hello, world!' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello, world!');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(5);
      expect(result.tokensUsed.total).toBe(15);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-key',
          }),
        })
      );
    });

    it('should throw error when API key is missing', async () => {
      config.apiKey = undefined;
      await expect(strategy.execute(config, options)).rejects.toThrow(
        'OpenAI API key not configured'
      );
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'OpenAI API error: 429 - Rate limit exceeded'
      );
    });
  });

  describe('AnthropicStrategy', () => {
    let strategy: AnthropicStrategy;
    let config: ProviderConfig;
    let options: AIProviderCallOptions;

    beforeEach(() => {
      strategy = new AnthropicStrategy();
      config = {
        provider: 'anthropic',
        enabled: true,
        apiKey: 'sk-ant-test-key',
        baseUrl: 'https://api.anthropic.com/v1',
        defaultModel: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
        costPer1kTokens: { input: 0.003, output: 0.015 },
      };
      options = {
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 1000,
        timeoutMs: 30000,
      };
    });

    it('should have correct provider name', () => {
      expect(strategy.providerName).toBe('anthropic');
    });

    it('should handle Anthropic config', () => {
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should not handle other provider configs', () => {
      config.provider = 'openai';
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should execute Anthropic API call successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Hello from Claude!' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello from Claude!');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(5);
      expect(result.tokensUsed.total).toBe(15);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    it('should convert system message format correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Response' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await strategy.execute(config, options);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.system).toBe('You are helpful.');
      expect(callBody.messages).toHaveLength(1); // System message extracted
    });
  });

  describe('GeminiStrategy', () => {
    let strategy: GeminiStrategy;
    let config: ProviderConfig;
    let options: AIProviderCallOptions;

    beforeEach(() => {
      strategy = new GeminiStrategy();
      config = {
        provider: 'gemini',
        enabled: true,
        apiKey: 'test-gemini-key',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        defaultModel: 'gemini-1.5-pro',
        maxTokens: 8192,
        costPer1kTokens: { input: 0.00125, output: 0.005 },
      };
      options = {
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        model: 'gemini-1.5-pro',
        maxTokens: 1000,
        timeoutMs: 30000,
      };
    });

    it('should have correct provider name', () => {
      expect(strategy.providerName).toBe('gemini');
    });

    it('should handle Gemini config', () => {
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should not handle disabled Gemini config', () => {
      config.enabled = false;
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should not handle other provider configs', () => {
      config.provider = 'openai';
      expect(strategy.canHandle(config)).toBe(false);
    });

    it('should execute Gemini API call successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Hello from Gemini!' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello from Gemini!');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(5);
      expect(result.tokensUsed.total).toBe(15);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('generativelanguage.googleapis.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should convert system message to systemInstruction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }),
      });

      await strategy.execute(config, options);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.systemInstruction).toBeDefined();
      expect(callBody.systemInstruction.parts[0].text).toBe('You are helpful.');
      expect(callBody.contents).toHaveLength(1); // System message extracted
    });

    it('should throw error when API key is missing', async () => {
      config.apiKey = undefined;
      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Google Gemini API key not configured'
      );
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid request',
      });

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Gemini API error: 400 - Invalid request'
      );
    });

    it('should handle JSON mode', async () => {
      options.jsonMode = true;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"key": "value"}' }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
        }),
      });

      await strategy.execute(config, options);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.generationConfig.responseMimeType).toBe('application/json');
    });
  });

  describe('LlamaStrategy', () => {
    let strategy: LlamaStrategy;
    let config: ProviderConfig;
    let options: AIProviderCallOptions;

    beforeEach(() => {
      strategy = new LlamaStrategy();
      config = {
        provider: 'llama',
        enabled: true,
        baseUrl: 'http://localhost:8080',
        defaultModel: 'llama-3.1-70b',
        maxTokens: 4096,
        costPer1kTokens: { input: 0, output: 0 },
      };
      options = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'llama-3.1-70b',
        maxTokens: 1000,
        timeoutMs: 60000,
      };
    });

    it('should have correct provider name', () => {
      expect(strategy.providerName).toBe('llama');
    });

    it('should handle Llama config', () => {
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should execute Llama API call successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Local LLM response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Local LLM response');
      expect(result.tokensUsed.total).toBe(30);
    });
  });

  describe('OllamaStrategy', () => {
    let strategy: OllamaStrategy;
    let config: ProviderConfig;
    let options: AIProviderCallOptions;

    beforeEach(() => {
      strategy = new OllamaStrategy();
      config = {
        provider: 'ollama',
        enabled: true,
        baseUrl: 'http://localhost:11434/api',
        defaultModel: 'llama2',
        maxTokens: 4096,
        costPer1kTokens: { input: 0, output: 0 },
      };
      options = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'llama2',
        maxTokens: 1000,
        timeoutMs: 60000,
      };
    });

    it('should have correct provider name', () => {
      expect(strategy.providerName).toBe('ollama');
    });

    it('should handle Ollama config', () => {
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should execute Ollama API call successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'Ollama response' },
          prompt_eval_count: 10,
          eval_count: 15,
        }),
      });

      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Ollama response');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(15);
      expect(result.tokensUsed.total).toBe(25);
    });
  });

  describe('Strategy Pattern Integration', () => {
    it('should find correct strategy for each provider type', () => {
      const strategies = createDefaultAIStrategies();

      const providers: Array<{ provider: string; expected: string }> = [
        { provider: 'openai', expected: 'openai' },
        { provider: 'anthropic', expected: 'anthropic' },
        { provider: 'gemini', expected: 'gemini' },
        { provider: 'llama', expected: 'llama' },
        { provider: 'ollama', expected: 'ollama' },
      ];

      for (const { provider, expected } of providers) {
        const config: ProviderConfig = {
          provider: provider as 'openai' | 'anthropic' | 'gemini' | 'llama' | 'ollama',
          enabled: true,
          baseUrl: 'http://test',
          defaultModel: 'test',
          maxTokens: 1000,
          costPer1kTokens: { input: 0, output: 0 },
        };

        const strategy = strategies.find((s) => s.canHandle(config));
        expect(strategy?.providerName).toBe(expected);
      }
    });

    it('should return undefined for disabled providers', () => {
      const strategies = createDefaultAIStrategies();

      const config: ProviderConfig = {
        provider: 'openai',
        enabled: false, // Disabled
        apiKey: 'test',
        baseUrl: 'http://test',
        defaultModel: 'test',
        maxTokens: 1000,
        costPer1kTokens: { input: 0, output: 0 },
      };

      const strategy = strategies.find((s) => s.canHandle(config));
      expect(strategy).toBeUndefined();
    });
  });
});
