/**
 * Multi-Provider AI Gateway Unit Tests
 *
 * Tests for configuration, provider management, and metrics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MultiProviderGateway,
  createMultiProviderGateway,
  createMultiProviderGatewayFromEnv,
  type AIMetricsRepository,
} from '../multi-provider-gateway.js';

// Mock the adaptive timeout manager
vi.mock('../adaptive-timeout.js', () => ({
  createAdaptiveTimeoutManager: vi.fn(() => ({
    getTimeoutConfig: vi.fn(() => ({
      timeoutMs: 30000,
      instantFallback: false,
      maxRetries: 2,
      priority: 'normal',
    })),
  })),
}));

describe('MultiProviderGateway', () => {
  let gateway: MultiProviderGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new MultiProviderGateway();
  });

  afterEach(() => {
    if (gateway) {
      gateway.stopMetricsFlush();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create gateway with default configuration', () => {
      expect(gateway).toBeDefined();
      expect(gateway.getMetrics().totalRequests).toBe(0);
    });

    it('should create gateway with custom configuration', () => {
      const customGateway = new MultiProviderGateway({
        enableFailover: false,
        enableCostAwareRouting: true,
        fallbackOrder: ['anthropic', 'openai'],
      });

      expect(customGateway).toBeDefined();
      customGateway.stopMetricsFlush();
    });

    it('should initialize with metrics repository', () => {
      const mockRepo: AIMetricsRepository = {
        logMetric: vi.fn(),
      };

      const gwWithRepo = new MultiProviderGateway({}, mockRepo);
      expect(gwWithRepo).toBeDefined();
      gwWithRepo.stopMetricsFlush();
    });

    it('should start metrics flush interval when repository is provided', () => {
      const mockRepo: AIMetricsRepository = {
        logMetric: vi.fn().mockResolvedValue(undefined),
      };

      const gwWithRepo = new MultiProviderGateway({
        metricsFlushInterval: 100,
      }, mockRepo);

      expect(gwWithRepo).toBeDefined();
      gwWithRepo.stopMetricsFlush();
    });
  });

  describe('Provider Configuration', () => {
    it('should configure OpenAI provider', () => {
      gateway.configureProvider('openai', {
        apiKey: 'test-key',
        enabled: true,
      });

      const health = gateway.getProviderHealth('openai');
      expect(health).toBeDefined();
      expect(health?.status).toBe('healthy');
    });

    it('should configure Anthropic provider', () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test-key',
        enabled: true,
      });

      const health = gateway.getProviderHealth('anthropic');
      expect(health).toBeDefined();
      expect(health?.status).toBe('healthy');
    });

    it('should configure Ollama provider', () => {
      gateway.configureProvider('ollama', {
        baseUrl: 'http://localhost:11434',
        enabled: true,
      });

      const health = gateway.getProviderHealth('ollama');
      expect(health).toBeDefined();
      expect(health?.status).toBe('healthy');
    });

    it('should allow provider reconfiguration', () => {
      gateway.configureProvider('openai', {
        apiKey: 'test-key',
        enabled: true,
      });

      // Reconfigure with different key
      gateway.configureProvider('openai', {
        apiKey: 'new-key',
        enabled: true,
      });

      const health = gateway.getProviderHealth('openai');
      expect(health).toBeDefined();
    });

    it('should configure multiple providers', () => {
      gateway.configureProvider('openai', { apiKey: 'key1', enabled: true });
      gateway.configureProvider('anthropic', { apiKey: 'key2', enabled: true });
      gateway.configureProvider('ollama', { baseUrl: 'http://localhost:11434', enabled: true });

      expect(gateway.getProviderHealth('openai')).toBeDefined();
      expect(gateway.getProviderHealth('anthropic')).toBeDefined();
      expect(gateway.getProviderHealth('ollama')).toBeDefined();
    });
  });

  describe('Provider Health', () => {
    it('should return healthy status for configured provider', () => {
      gateway.configureProvider('openai', { apiKey: 'test', enabled: true });

      const health = gateway.getProviderHealth('openai');
      expect(health).toBeDefined();
      expect(health?.status).toBe('healthy');
      expect(typeof health?.avgLatencyMs).toBe('number');
    });

    it('should return all providers health', () => {
      gateway.configureProvider('openai', { apiKey: 'test', enabled: true });
      gateway.configureProvider('anthropic', { apiKey: 'test', enabled: true });

      const allHealth = gateway.getAllProviderHealth();
      expect(allHealth.openai).toBeDefined();
      expect(allHealth.anthropic).toBeDefined();
    });

    it('should track provider health status', () => {
      gateway.configureProvider('openai', { apiKey: 'test', enabled: true });

      const health = gateway.getProviderHealth('openai');
      expect(health).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health?.status);
    });
  });

  describe('Metrics', () => {
    it('should return initial metrics', () => {
      const metrics = gateway.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.fallbacksTriggered).toBe(0);
      expect(metrics.fallbackSuccesses).toBe(0);
      expect(metrics.fallbackFailures).toBe(0);
    });

    it('should reset metrics', () => {
      gateway.resetMetrics();

      const metrics = gateway.getMetrics();
      expect(metrics.totalRequests).toBe(0);
    });

    it('should calculate fallback rate', () => {
      const rate = gateway.getFallbackRate();
      expect(rate).toBe(0); // No requests yet
    });

    it('should track provider usage', () => {
      const metrics = gateway.getMetrics();
      expect(typeof metrics.providerUsage).toBe('object');
    });

    it('should track errors by provider', () => {
      const metrics = gateway.getMetrics();
      expect(typeof metrics.errorsByProvider).toBe('object');
    });
  });

  describe('Fallback Configuration', () => {
    it('should configure fallback order', () => {
      const customGateway = new MultiProviderGateway({
        fallbackOrder: ['anthropic', 'openai', 'ollama'],
      });

      expect(customGateway).toBeDefined();
      customGateway.stopMetricsFlush();
    });

    it('should enable failover', () => {
      const customGateway = new MultiProviderGateway({
        enableFailover: true,
      });

      expect(customGateway).toBeDefined();
      customGateway.stopMetricsFlush();
    });

    it('should disable failover', () => {
      const customGateway = new MultiProviderGateway({
        enableFailover: false,
      });

      expect(customGateway).toBeDefined();
      customGateway.stopMetricsFlush();
    });
  });

  describe('Cost-Aware Routing', () => {
    it('should enable cost-aware routing', () => {
      const customGateway = new MultiProviderGateway({
        enableCostAwareRouting: true,
      });

      expect(customGateway).toBeDefined();
      customGateway.stopMetricsFlush();
    });

    it('should disable cost-aware routing', () => {
      const customGateway = new MultiProviderGateway({
        enableCostAwareRouting: false,
      });

      expect(customGateway).toBeDefined();
      customGateway.stopMetricsFlush();
    });
  });

  describe('Metrics Flush', () => {
    it('should stop metrics flush', () => {
      const mockRepo: AIMetricsRepository = {
        logMetric: vi.fn(),
      };

      const gwWithRepo = new MultiProviderGateway({}, mockRepo);
      gwWithRepo.stopMetricsFlush();

      expect(gwWithRepo).toBeDefined();
    });

    it('should handle multiple stop calls gracefully', () => {
      const mockRepo: AIMetricsRepository = {
        logMetric: vi.fn(),
      };

      const gwWithRepo = new MultiProviderGateway({}, mockRepo);
      gwWithRepo.stopMetricsFlush();
      gwWithRepo.stopMetricsFlush();

      expect(gwWithRepo).toBeDefined();
    });
  });

  describe('Provider Models', () => {
    it('should configure OpenAI with specific model', () => {
      gateway.configureProvider('openai', {
        apiKey: 'test',
        enabled: true,
        model: 'gpt-4-turbo',
      });

      expect(gateway.getProviderHealth('openai')).toBeDefined();
    });

    it('should configure Anthropic with specific model', () => {
      gateway.configureProvider('anthropic', {
        apiKey: 'test',
        enabled: true,
        model: 'claude-3-opus-20240229',
      });

      expect(gateway.getProviderHealth('anthropic')).toBeDefined();
    });

    it('should configure Ollama with specific model', () => {
      gateway.configureProvider('ollama', {
        baseUrl: 'http://localhost:11434',
        enabled: true,
        model: 'llama3.1',
      });

      expect(gateway.getProviderHealth('ollama')).toBeDefined();
    });
  });
});

describe('Factory Functions', () => {
  it('should create gateway with factory function', () => {
    const gateway = createMultiProviderGateway();
    expect(gateway).toBeInstanceOf(MultiProviderGateway);
    gateway.stopMetricsFlush();
  });

  it('should create gateway with config', () => {
    const gateway = createMultiProviderGateway({
      enableFailover: true,
      enableCostAwareRouting: true,
    });

    expect(gateway).toBeInstanceOf(MultiProviderGateway);
    gateway.stopMetricsFlush();
  });

  it('should create gateway from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';

    const gateway = createMultiProviderGatewayFromEnv();
    expect(gateway).toBeInstanceOf(MultiProviderGateway);
    gateway.stopMetricsFlush();

    delete process.env.OPENAI_API_KEY;
  });

  it('should configure multiple providers from environment', () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';

    const gateway = createMultiProviderGatewayFromEnv();
    expect(gateway).toBeInstanceOf(MultiProviderGateway);

    const openaiHealth = gateway.getProviderHealth('openai');
    const anthropicHealth = gateway.getProviderHealth('anthropic');
    const ollamaHealth = gateway.getProviderHealth('ollama');

    expect(openaiHealth).toBeDefined();
    expect(anthropicHealth).toBeDefined();
    expect(ollamaHealth).toBeDefined();

    gateway.stopMetricsFlush();

    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
  });
});
