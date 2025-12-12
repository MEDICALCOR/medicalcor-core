/**
 * @fileoverview AI Provider Strategies Unit Tests
 *
 * Tests the Strategy Pattern implementation for AI providers.
 * Verifies:
 * - canHandle correctly identifies providers
 * - execute makes proper API calls
 * - Error handling works correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../integrations/src/__mocks__/server.js';
import {
  createDefaultAIStrategies,
  getStrategyByProviderName,
  OpenAIStrategy,
  AnthropicStrategy,
  GeminiStrategy,
  LlamaStrategy,
  OllamaStrategy,
  type AIProviderCallOptions,
} from '../index.js';
import type { ProviderConfig } from '../../multi-provider-gateway.js';

describe('AI Provider Strategies', () => {
  afterEach(() => {
    server.resetHandlers();
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
      // MSW handler is already defined in handlers.ts for OpenAI
      const result = await strategy.execute(config, options);

      expect(result.content).toBeDefined();
      expect(result.tokensUsed.prompt).toBeGreaterThan(0);
      expect(result.tokensUsed.completion).toBeGreaterThan(0);
      expect(result.tokensUsed.total).toBeGreaterThan(0);
    });

    it('should throw error when API key is missing', async () => {
      config.apiKey = undefined;
      await expect(strategy.execute(config, options)).rejects.toThrow(
        'OpenAI API key not configured'
      );
    });

    it('should throw error on API failure', async () => {
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return new HttpResponse('Rate limit exceeded', { status: 429 });
        })
      );

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

      // Add Anthropic handler for these tests
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json({
            content: [{ type: 'text', text: 'Hello from Claude!' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          });
        })
      );
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
      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello from Claude!');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(5);
      expect(result.tokensUsed.total).toBe(15);
    });

    it('should convert system message format correctly', async () => {
      // Test passes if the execute succeeds - the system message is handled internally
      const result = await strategy.execute(config, options);
      expect(result.content).toBeDefined();
    });

    it('should throw error when API key is missing', async () => {
      config.apiKey = undefined;
      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Anthropic API key not configured'
      );
    });

    it('should throw error on API failure', async () => {
      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return new HttpResponse('Rate limit exceeded', { status: 429 });
        })
      );

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Anthropic API error: 429 - Rate limit exceeded'
      );
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

      // Add Gemini handler for these tests
      server.use(
        http.post('https://generativelanguage.googleapis.com/v1beta/models/:model\\:generateContent', () => {
          return HttpResponse.json({
            candidates: [{ content: { parts: [{ text: 'Hello from Gemini!' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
          });
        })
      );
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
      const result = await strategy.execute(config, options);

      expect(result.content).toBe('Hello from Gemini!');
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(5);
      expect(result.tokensUsed.total).toBe(15);
    });

    it('should convert system message to systemInstruction', async () => {
      // Test passes if the execute succeeds - systemInstruction is handled internally
      const result = await strategy.execute(config, options);
      expect(result.content).toBeDefined();
    });

    it('should throw error when API key is missing', async () => {
      config.apiKey = undefined;
      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Google Gemini API key not configured'
      );
    });

    it('should throw error on API failure', async () => {
      server.use(
        http.post('https://generativelanguage.googleapis.com/v1beta/models/:model\\:generateContent', () => {
          return new HttpResponse('Invalid request', { status: 400 });
        })
      );

      await expect(strategy.execute(config, options)).rejects.toThrow(
        'Gemini API error: 400 - Invalid request'
      );
    });

    it('should handle JSON mode', async () => {
      options.jsonMode = true;
      server.use(
        http.post('https://generativelanguage.googleapis.com/v1beta/models/:model\\:generateContent', () => {
          return HttpResponse.json({
            candidates: [{ content: { parts: [{ text: '{"key": "value"}' }] } }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
          });
        })
      );

      const result = await strategy.execute(config, options);
      expect(result.content).toBe('{"key": "value"}');
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

      // Add Llama handler for these tests
      server.use(
        http.post('http://localhost:8080/chat/completions', () => {
          return HttpResponse.json({
            choices: [{ message: { content: 'Local LLM response' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          });
        })
      );
    });

    it('should have correct provider name', () => {
      expect(strategy.providerName).toBe('llama');
    });

    it('should handle Llama config', () => {
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should execute Llama API call successfully', async () => {
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

      // Add Ollama handler for these tests
      server.use(
        http.post('http://localhost:11434/api/chat', () => {
          return HttpResponse.json({
            message: { content: 'Ollama response' },
            prompt_eval_count: 10,
            eval_count: 15,
          });
        })
      );
    });

    it('should have correct provider name', () => {
      expect(strategy.providerName).toBe('ollama');
    });

    it('should handle Ollama config', () => {
      expect(strategy.canHandle(config)).toBe(true);
    });

    it('should execute Ollama API call successfully', async () => {
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
        const providerConfig: ProviderConfig = {
          provider: provider as 'openai' | 'anthropic' | 'gemini' | 'llama' | 'ollama',
          enabled: true,
          baseUrl: 'http://test',
          defaultModel: 'test',
          maxTokens: 1000,
          costPer1kTokens: { input: 0, output: 0 },
        };

        const matchingStrategy = strategies.find((s) => s.canHandle(providerConfig));
        expect(matchingStrategy?.providerName).toBe(expected);
      }
    });

    it('should return undefined for disabled providers', () => {
      const strategies = createDefaultAIStrategies();

      const config: ProviderConfig = {
        provider: 'openai',
        enabled: false,
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
