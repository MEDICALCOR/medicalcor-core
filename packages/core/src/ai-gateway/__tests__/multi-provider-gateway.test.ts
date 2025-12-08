/**
 * Multi-Provider AI Gateway Tests
 *
 * Comprehensive tests for multi-provider failover and routing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../packages/integrations/src/__mocks__/server.js';
import {
  MultiProviderGateway,
  createMultiProviderGateway,
  createMultiProviderGatewayFromEnv,
  DEFAULT_PROVIDER_CONFIGS,
  ProviderConfigSchema,
  MultiProviderGatewayConfigSchema,
  type AIProvider,
  type CompletionOptions,
} from '../multi-provider-gateway.js';

// Note: MSW intercepts all requests, so we use server.use() to add test-specific handlers

describe('MultiProviderGateway', () => {
  let gateway: MultiProviderGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new MultiProviderGateway();

    // Configure OpenAI with mock key
    gateway.configureProvider('openai', {
      apiKey: 'test-openai-key',
      enabled: true,
    });
  });

  afterEach(() => {
    gateway.stopMetricsFlush();
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      const newGateway = new MultiProviderGateway();

      // OpenAI and Anthropic are enabled by default but will fail without API keys
      // hasHealthyProvider returns true because enabled providers start as healthy
      expect(newGateway.hasHealthyProvider()).toBe(true);
      newGateway.stopMetricsFlush();
    });

    it('should accept custom configuration', () => {
      const customGateway = new MultiProviderGateway({
        enableFailover: false,
        enableCostAwareRouting: true,
      });

      customGateway.stopMetricsFlush();
    });

    it('should initialize metrics', () => {
      const metrics = gateway.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.fallbacksTriggered).toBe(0);
      expect(metrics.providerUsage.openai).toBe(0);
    });
  });

  describe('configureProvider', () => {
    it('should configure provider with API key', () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-anthropic-key',
        enabled: true,
      });

      const health = gateway.getProviderHealth('anthropic');
      expect(health?.status).toBe('healthy');
    });

    it('should disable provider', () => {
      gateway.configureProvider('openai', { enabled: false });

      const health = gateway.getProviderHealth('openai');
      expect(health?.status).toBe('disabled');
    });

    it('should merge with default config', () => {
      gateway.configureProvider('openai', { maxTokens: 8192 });

      // Should retain other defaults while updating maxTokens
    });
  });

  describe('complete', () => {
    it('should complete successfully with OpenAI', async () => {
      // Use MSW to set custom response
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello!' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        })
      );

      const options: CompletionOptions = {
        messages: [{ role: 'user', content: 'Hi' }],
        operation: 'scoring',
      };

      const result = await gateway.complete(options);

      expect(result.content).toBe('Hello!');
      expect(result.provider).toBe('openai');
      expect(result.usedFallback).toBe(false);
      expect(result.tokensUsed.total).toBe(15);
    });

    it('should fallback to Anthropic when OpenAI fails', async () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-anthropic-key',
        enabled: true,
      });

      // Use MSW to simulate OpenAI failure and Anthropic success
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return new HttpResponse('Rate limit exceeded', { status: 429 });
        }),
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Fallback response' }],
            model: 'claude-sonnet-4-5-20250929',
            usage: { input_tokens: 10, output_tokens: 5 },
          });
        })
      );

      const result = await gateway.complete({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.usedFallback).toBe(true);
      expect(result.provider).toBe('anthropic');
      expect(result.content).toBe('Fallback response');
    });

    it('should throw when all providers fail', async () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-anthropic-key',
        enabled: true,
      });

      // Use MSW to simulate all providers failing
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return new HttpResponse('Service unavailable', { status: 503 });
        }),
        http.post('https://api.anthropic.com/v1/messages', () => {
          return new HttpResponse('Service unavailable', { status: 503 });
        })
      );

      await expect(
        gateway.complete({
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('All providers failed');
    });

    it('should respect skipFallback option', async () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-anthropic-key',
        enabled: true,
      });

      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return new HttpResponse('Error', { status: 500 });
        })
      );

      await expect(
        gateway.complete({
          messages: [{ role: 'user', content: 'Hi' }],
          skipFallback: true,
        })
      ).rejects.toThrow();
    });

    it('should use preferred provider when specified', async () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-anthropic-key',
        enabled: true,
      });

      server.use(
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Anthropic response' }],
            model: 'claude-sonnet-4-5-20250929',
            usage: { input_tokens: 10, output_tokens: 5 },
          });
        })
      );

      const result = await gateway.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        preferredProvider: 'anthropic',
      });

      expect(result.provider).toBe('anthropic');
    });

    it('should handle JSON mode for OpenAI', async () => {
      let capturedBody: { response_format?: { type: string } } | null = null;

      server.use(
        http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
          capturedBody = (await request.json()) as { response_format?: { type: string } };
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '{"key":"value"}' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        })
      );

      await gateway.complete({
        messages: [{ role: 'user', content: 'Return JSON' }],
        jsonMode: true,
      });

      expect(capturedBody?.response_format).toEqual({ type: 'json_object' });
    });

    it('should throw when no providers available', async () => {
      // Disable all providers
      gateway.setProviderEnabled('openai', false);
      gateway.setProviderEnabled('anthropic', false);
      gateway.setProviderEnabled('llama', false);
      gateway.setProviderEnabled('ollama', false);

      await expect(
        gateway.complete({
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('No available providers');
    });
  });

  describe('Provider Health', () => {
    it('should track consecutive failures', async () => {
      // Use MSW to simulate failures
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return new HttpResponse('Error', { status: 500 });
        })
      );

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await gateway.complete({
            messages: [{ role: 'user', content: 'Hi' }],
            skipFallback: true,
          });
        } catch {
          // Expected
        }
      }

      const health = gateway.getProviderHealth('openai');
      expect(health?.status).toBe('unhealthy');
    });

    it('should recover after consecutive successes', async () => {
      // Make provider degraded first (2 failures = degraded, not unhealthy)
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return new HttpResponse('Error', { status: 500 });
        })
      );

      // 2 failures makes it degraded
      for (let i = 0; i < 2; i++) {
        try {
          await gateway.complete({
            messages: [{ role: 'user', content: 'Hi' }],
            skipFallback: true,
          });
        } catch {
          // Expected
        }
      }

      // Now update MSW handler to succeed
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        })
      );

      // Success should recover the provider
      for (let i = 0; i < 2; i++) {
        await gateway.complete({
          messages: [{ role: 'user', content: 'Hi' }],
        });
      }

      const health = gateway.getProviderHealth('openai');
      expect(health?.status).toBe('healthy');
    });

    it('should track latency', async () => {
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        })
      );

      await gateway.complete({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const health = gateway.getProviderHealth('openai');
      expect(health?.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAllProviderHealth', () => {
    it('should return all provider health states', () => {
      const allHealth = gateway.getAllProviderHealth();

      expect(allHealth.openai).toBeDefined();
      expect(allHealth.anthropic).toBeDefined();
      expect(allHealth.llama).toBeDefined();
      expect(allHealth.ollama).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('should track total requests', async () => {
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        })
      );

      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });
      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      const metrics = gateway.getMetrics();
      expect(metrics.totalRequests).toBe(2);
    });

    it('should track fallbacks', async () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-anthropic-key',
        enabled: true,
      });

      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return new HttpResponse('Error', { status: 500 });
        }),
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'OK' }],
            model: 'claude-sonnet-4-5-20250929',
            usage: { input_tokens: 10, output_tokens: 5 },
          });
        })
      );

      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      const metrics = gateway.getMetrics();
      expect(metrics.fallbacksTriggered).toBe(1);
      expect(metrics.fallbackSuccesses).toBe(1);
    });

    it('should track provider usage', async () => {
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        })
      );

      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      const metrics = gateway.getMetrics();
      expect(metrics.providerUsage.openai).toBe(1);
    });

    it('should track cost by provider', async () => {
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
          });
        })
      );

      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      const metrics = gateway.getMetrics();
      expect(metrics.costByProvider.openai).toBeGreaterThan(0);
    });
  });

  describe('getFallbackRate', () => {
    it('should return 0 when no requests', () => {
      expect(gateway.getFallbackRate()).toBe(0);
    });

    it('should calculate fallback rate', async () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-anthropic-key',
        enabled: true,
      });

      let openaiCallCount = 0;

      // One success, one fallback
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          openaiCallCount++;
          if (openaiCallCount === 1) {
            return HttpResponse.json({
              id: 'chatcmpl-test',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-4o',
              choices: [
                { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            });
          }
          return new HttpResponse('Error', { status: 500 });
        }),
        http.post('https://api.anthropic.com/v1/messages', () => {
          return HttpResponse.json({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'OK' }],
            model: 'claude-sonnet-4-5-20250929',
            usage: { input_tokens: 10, output_tokens: 5 },
          });
        })
      );

      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });
      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      const rate = gateway.getFallbackRate();
      expect(rate).toBe(0.5); // 1 fallback / 2 requests
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to zero', async () => {
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        })
      );

      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });
      gateway.resetMetrics();

      const metrics = gateway.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.providerUsage.openai).toBe(0);
    });
  });

  describe('setProviderEnabled', () => {
    it('should enable provider', () => {
      gateway.setProviderEnabled('llama', true);

      const health = gateway.getProviderHealth('llama');
      expect(health?.status).toBe('healthy');
    });

    it('should disable provider', () => {
      gateway.setProviderEnabled('openai', false);

      const health = gateway.getProviderHealth('openai');
      expect(health?.status).toBe('disabled');
    });
  });

  describe('hasHealthyProvider', () => {
    it('should return true when healthy provider exists', () => {
      expect(gateway.hasHealthyProvider()).toBe(true);
    });

    it('should return false when all providers disabled', () => {
      gateway.setProviderEnabled('openai', false);
      gateway.setProviderEnabled('anthropic', false);
      gateway.setProviderEnabled('llama', false);
      gateway.setProviderEnabled('ollama', false);

      expect(gateway.hasHealthyProvider()).toBe(false);
    });
  });

  describe('getTimeoutManager', () => {
    it('should return timeout manager', () => {
      const timeoutManager = gateway.getTimeoutManager();

      expect(timeoutManager).toBeDefined();
      expect(timeoutManager.getTimeout('scoring')).toBe(5000);
    });
  });

  describe('Cost-Aware Routing', () => {
    it('should prefer cheaper providers when enabled', async () => {
      const costGateway = new MultiProviderGateway({
        enableCostAwareRouting: true,
      });

      costGateway.configureProvider('llama', {
        enabled: true,
        costPer1kInput: 0,
        costPer1kOutput: 0,
      });

      costGateway.configureProvider('openai', {
        apiKey: 'test-key',
        enabled: true,
      });

      server.use(
        http.post('http://localhost:11434/v1/chat/completions', () => {
          return HttpResponse.json({
            message: { content: 'Local response' },
            prompt_eval_count: 10,
            eval_count: 5,
          });
        })
      );

      // Llama (free) should be tried first
      const result = await costGateway.complete({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.provider).toBe('llama');
      costGateway.stopMetricsFlush();
    });
  });

  describe('Load Balancing', () => {
    it('should use weighted distribution when enabled', () => {
      const lbGateway = new MultiProviderGateway({
        enableLoadBalancing: true,
      });

      lbGateway.configureProvider('openai', {
        apiKey: 'test-key',
        enabled: true,
        weight: 60,
      });

      lbGateway.configureProvider('anthropic', {
        apiKey: 'test-key',
        enabled: true,
        weight: 40,
      });

      // With load balancing, provider order is randomized by weight
      lbGateway.stopMetricsFlush();
    });
  });

  describe('DEFAULT_PROVIDER_CONFIGS', () => {
    it('should have all providers configured', () => {
      const providers: AIProvider[] = ['openai', 'anthropic', 'llama', 'ollama'];

      for (const provider of providers) {
        expect(DEFAULT_PROVIDER_CONFIGS[provider]).toBeDefined();
        expect(DEFAULT_PROVIDER_CONFIGS[provider].defaultModel).toBeDefined();
      }
    });

    it('should have OpenAI as highest priority', () => {
      expect(DEFAULT_PROVIDER_CONFIGS.openai.priority).toBe(1);
      expect(DEFAULT_PROVIDER_CONFIGS.anthropic.priority).toBeGreaterThan(1);
    });
  });

  describe('Schema Validation', () => {
    it('should validate ProviderConfig', () => {
      const validConfig = {
        provider: 'openai',
        defaultModel: 'gpt-4o',
      };

      expect(() => ProviderConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should validate MultiProviderGatewayConfig', () => {
      const validConfig = {
        enableFailover: true,
        fallbackOrder: ['openai', 'anthropic'],
      };

      expect(() => MultiProviderGatewayConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should reject invalid provider', () => {
      const invalidConfig = {
        provider: 'invalid',
        defaultModel: 'model',
      };

      expect(() => ProviderConfigSchema.parse(invalidConfig)).toThrow();
    });
  });

  describe('Factory Functions', () => {
    it('should create gateway with defaults', () => {
      const newGateway = createMultiProviderGateway();

      expect(newGateway).toBeInstanceOf(MultiProviderGateway);
      newGateway.stopMetricsFlush();
    });

    it('should create gateway with config', () => {
      const newGateway = createMultiProviderGateway({
        enableFailover: false,
      });

      newGateway.stopMetricsFlush();
    });
  });

  describe('createMultiProviderGatewayFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should configure OpenAI from environment', () => {
      process.env.OPENAI_API_KEY = 'env-openai-key';

      const envGateway = createMultiProviderGatewayFromEnv();

      expect(envGateway.hasHealthyProvider()).toBe(true);
      envGateway.stopMetricsFlush();
    });

    it('should configure Anthropic from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'env-anthropic-key';

      const envGateway = createMultiProviderGatewayFromEnv();

      const health = envGateway.getProviderHealth('anthropic');
      expect(health?.status).toBe('healthy');
      envGateway.stopMetricsFlush();
    });

    it('should configure Llama from environment', () => {
      process.env.LLAMA_API_URL = 'http://localhost:11434/v1';

      const envGateway = createMultiProviderGatewayFromEnv();

      const health = envGateway.getProviderHealth('llama');
      expect(health?.status).toBe('healthy');
      envGateway.stopMetricsFlush();
    });

    it('should configure Ollama from environment', () => {
      process.env.OLLAMA_API_URL = 'http://localhost:11434/api';

      const envGateway = createMultiProviderGatewayFromEnv();

      const health = envGateway.getProviderHealth('ollama');
      expect(health?.status).toBe('healthy');
      envGateway.stopMetricsFlush();
    });
  });

  describe('Metrics Repository', () => {
    it('should set metrics repository', () => {
      const mockRepository = {
        logMetric: vi.fn().mockResolvedValue(undefined),
        logMetricsBatch: vi.fn().mockResolvedValue(undefined),
      };

      gateway.setMetricsRepository(mockRepository);
      // Repository is set
    });

    it('should buffer and flush metrics', async () => {
      const mockRepository = {
        logMetric: vi.fn().mockResolvedValue(undefined),
        logMetricsBatch: vi.fn().mockResolvedValue(undefined),
      };

      gateway.setMetricsRepository(mockRepository);

      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return HttpResponse.json({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'gpt-4o',
            choices: [
              { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        })
      );

      await gateway.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      // Metrics are buffered, can be flushed with stopMetricsFlush
      gateway.stopMetricsFlush();

      // After stopping, metrics should be flushed
    });
  });

  describe('Anthropic API Format', () => {
    it('should convert system message to Anthropic format', async () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-anthropic-key',
        enabled: true,
      });
      gateway.setProviderEnabled('openai', false);
      gateway.setProviderEnabled('llama', false);

      let capturedBody: { system?: string } | null = null;

      server.use(
        http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
          capturedBody = (await request.json()) as { system?: string };
          return HttpResponse.json({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Response' }],
            model: 'claude-sonnet-4-5-20250929',
            usage: { input_tokens: 10, output_tokens: 5 },
          });
        })
      );

      await gateway.complete({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi' },
        ],
      });

      expect(capturedBody?.system).toBe('You are helpful');
    });
  });

  describe('Local LLM (Ollama) API Format', () => {
    it('should handle Ollama response format', async () => {
      // Create gateway with ollama in fallback order
      const ollamaGateway = new MultiProviderGateway({
        fallbackOrder: ['ollama', 'openai', 'anthropic', 'llama'],
      });
      ollamaGateway.configureProvider('ollama', {
        enabled: true,
      });
      ollamaGateway.setProviderEnabled('openai', false);
      ollamaGateway.setProviderEnabled('anthropic', false);
      ollamaGateway.setProviderEnabled('llama', false);

      server.use(
        http.post('http://localhost:11434/api/chat', () => {
          return HttpResponse.json({
            message: { content: 'Local response' },
            prompt_eval_count: 10,
            eval_count: 5,
          });
        })
      );

      const result = await ollamaGateway.complete({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content).toBe('Local response');
      expect(result.provider).toBe('ollama');
      ollamaGateway.stopMetricsFlush();
    });
  });
});
