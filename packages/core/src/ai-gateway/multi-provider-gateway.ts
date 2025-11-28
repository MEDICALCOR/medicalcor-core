/**
 * Multi-Provider AI Gateway
 *
 * Unified interface for multiple AI providers with automatic fallback:
 * - OpenAI (primary)
 * - Anthropic (secondary)
 * - Local Llama (backup/offline)
 *
 * Features:
 * - Provider health monitoring
 * - Automatic failover on errors
 * - Cost-aware routing
 * - Load balancing
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive checks for provider configuration */
/* eslint-disable @typescript-eslint/restrict-template-expressions -- provider names are always strings */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- provider arrays are validated before access */

import { z } from 'zod';
import crypto from 'crypto';
import {
  type AdaptiveTimeoutManager,
  createAdaptiveTimeoutManager,
  type AIOperationType,
} from './adaptive-timeout.js';

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'anthropic' | 'llama' | 'ollama';

/**
 * Provider status
 */
export type ProviderStatus = 'healthy' | 'degraded' | 'unhealthy' | 'disabled';

/**
 * Chat message format (OpenAI-compatible)
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Completion request options
 */
export interface CompletionOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  /** Operation type for timeout configuration */
  operation?: AIOperationType;
  /** Preferred provider (will fallback if unavailable) */
  preferredProvider?: AIProvider;
  /** Skip fallback and fail immediately */
  skipFallback?: boolean;
}

/**
 * Completion response
 */
export interface CompletionResponse {
  content: string;
  provider: AIProvider;
  model: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  executionTimeMs: number;
  usedFallback: boolean;
  cost: number;
}

/**
 * Provider configuration
 */
export const ProviderConfigSchema = z.object({
  /** Provider name */
  provider: z.enum(['openai', 'anthropic', 'llama', 'ollama']),
  /** API key (not needed for local providers) */
  apiKey: z.string().optional(),
  /** API base URL */
  baseUrl: z.string().url().optional(),
  /** Organization ID */
  organization: z.string().optional(),
  /** Default model */
  defaultModel: z.string(),
  /** Maximum tokens per request */
  maxTokens: z.number().int().min(1).max(128000).default(4096),
  /** Cost per 1k input tokens */
  costPer1kInput: z.number().min(0).default(0),
  /** Cost per 1k output tokens */
  costPer1kOutput: z.number().min(0).default(0),
  /** Priority (lower = higher priority) */
  priority: z.number().int().min(1).max(100).default(50),
  /** Enable this provider */
  enabled: z.boolean().default(true),
  /** Weight for load balancing (0-100) */
  weight: z.number().int().min(0).max(100).default(50),
  /** Maximum retries for this provider */
  maxRetries: z.number().int().min(0).max(5).default(2),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

/**
 * Default provider configurations
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<AIProvider, Omit<ProviderConfig, 'apiKey'>> = {
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    maxTokens: 4096,
    costPer1kInput: 0.0025, // $2.50/1M input
    costPer1kOutput: 0.01, // $10/1M output
    priority: 1,
    enabled: true,
    weight: 60,
    maxRetries: 2,
  },
  anthropic: {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    costPer1kInput: 0.003, // $3/1M input
    costPer1kOutput: 0.015, // $15/1M output
    priority: 2,
    enabled: true,
    weight: 30,
    maxRetries: 2,
  },
  llama: {
    provider: 'llama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1:8b',
    maxTokens: 4096,
    costPer1kInput: 0, // Free (local)
    costPer1kOutput: 0,
    priority: 3,
    enabled: false, // Disabled by default
    weight: 10,
    maxRetries: 1,
  },
  ollama: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/api',
    defaultModel: 'llama3.1:8b',
    maxTokens: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    priority: 4,
    enabled: false,
    weight: 10,
    maxRetries: 1,
  },
};

/**
 * Gateway configuration
 */
export const MultiProviderGatewayConfigSchema = z.object({
  /** Provider configurations */
  providers: z.record(ProviderConfigSchema).optional(),
  /** Fallback order (provider names) */
  fallbackOrder: z
    .array(z.enum(['openai', 'anthropic', 'llama', 'ollama']))
    .default(['openai', 'anthropic', 'llama']),
  /** Enable automatic failover */
  enableFailover: z.boolean().default(true),
  /** Enable cost-aware routing (prefer cheaper providers when appropriate) */
  enableCostAwareRouting: z.boolean().default(false),
  /** Enable load balancing across providers */
  enableLoadBalancing: z.boolean().default(false),
  /** Health check interval in ms */
  healthCheckIntervalMs: z.number().int().min(10000).max(300000).default(60000),
  /** Unhealthy threshold (failures before marking unhealthy) */
  unhealthyThreshold: z.number().int().min(1).max(10).default(3),
  /** Recovery threshold (successes before marking healthy) */
  recoveryThreshold: z.number().int().min(1).max(10).default(2),
});

export type MultiProviderGatewayConfig = z.infer<typeof MultiProviderGatewayConfigSchema>;

/**
 * Provider health state
 */
interface ProviderHealth {
  status: ProviderStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheck: Date;
  lastError?: string;
  avgLatencyMs: number;
  requestCount: number;
  errorRate: number;
}

/**
 * Fallback metrics for monitoring
 */
export interface FallbackMetrics {
  totalRequests: number;
  fallbacksTriggered: number;
  fallbackSuccesses: number;
  fallbackFailures: number;
  providerUsage: Record<AIProvider, number>;
  avgLatencyByProvider: Record<AIProvider, number>;
  errorsByProvider: Record<AIProvider, number>;
  costByProvider: Record<AIProvider, number>;
}

/**
 * Multi-Provider AI Gateway
 */
export class MultiProviderGateway {
  private config: MultiProviderGatewayConfig;
  private providers = new Map<AIProvider, ProviderConfig>();
  private providerHealth = new Map<AIProvider, ProviderHealth>();
  private timeoutManager: AdaptiveTimeoutManager;
  private metrics: FallbackMetrics;

  constructor(config: Partial<MultiProviderGatewayConfig> = {}) {
    this.config = MultiProviderGatewayConfigSchema.parse(config);
    this.timeoutManager = createAdaptiveTimeoutManager();

    // Initialize providers from config
    this.initializeProviders();

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      fallbacksTriggered: 0,
      fallbackSuccesses: 0,
      fallbackFailures: 0,
      providerUsage: { openai: 0, anthropic: 0, llama: 0, ollama: 0 },
      avgLatencyByProvider: { openai: 0, anthropic: 0, llama: 0, ollama: 0 },
      errorsByProvider: { openai: 0, anthropic: 0, llama: 0, ollama: 0 },
      costByProvider: { openai: 0, anthropic: 0, llama: 0, ollama: 0 },
    };
  }

  /**
   * Initialize providers from configuration
   */
  private initializeProviders(): void {
    // Start with defaults
    for (const [provider, defaultConfig] of Object.entries(DEFAULT_PROVIDER_CONFIGS)) {
      const override = this.config.providers?.[provider as AIProvider];
      const merged = { ...defaultConfig, ...override } as ProviderConfig;

      this.providers.set(provider as AIProvider, merged);

      // Initialize health state
      this.providerHealth.set(provider as AIProvider, {
        status: merged.enabled ? 'healthy' : 'disabled',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastCheck: new Date(),
        avgLatencyMs: 0,
        requestCount: 0,
        errorRate: 0,
      });
    }
  }

  /**
   * Configure a provider
   */
  configureProvider(provider: AIProvider, config: Partial<ProviderConfig>): void {
    const existing = this.providers.get(provider) ?? DEFAULT_PROVIDER_CONFIGS[provider];
    const merged = ProviderConfigSchema.parse({ ...existing, ...config, provider });
    this.providers.set(provider, merged);

    // Update health status
    const health = this.providerHealth.get(provider);
    if (health) {
      health.status = merged.enabled ? 'healthy' : 'disabled';
    }
  }

  /**
   * Complete a chat message with automatic fallback
   */
  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const operation = options.operation ?? 'function_call';
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // Get ordered list of providers to try
    const providersToTry = this.getProvidersToTry(options);

    if (providersToTry.length === 0) {
      throw new Error('No available providers configured');
    }

    let lastError: Error | undefined;
    let usedFallback = false;

    for (let i = 0; i < providersToTry.length; i++) {
      const provider = providersToTry[i]!;
      const isFirstAttempt = i === 0;

      if (!isFirstAttempt) {
        usedFallback = true;
        this.metrics.fallbacksTriggered++;
      }

      try {
        const result = await this.executeWithProvider(provider, options, operation);

        // Record success
        this.recordSuccess(provider, Date.now() - startTime);

        if (usedFallback) {
          this.metrics.fallbackSuccesses++;
        }

        return {
          ...result,
          usedFallback,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure
        this.recordFailure(provider, lastError.message);

        // Skip fallback if explicitly disabled
        if (options.skipFallback) {
          break;
        }

        // Provider failed - will try next in fallback chain
      }
    }

    if (usedFallback) {
      this.metrics.fallbackFailures++;
    }

    throw new Error(`All providers failed. Last error: ${lastError?.message ?? 'Unknown error'}`);
  }

  /**
   * Execute completion with a specific provider
   */
  private async executeWithProvider(
    provider: AIProvider,
    options: CompletionOptions,
    operation: AIOperationType
  ): Promise<Omit<CompletionResponse, 'usedFallback' | 'executionTimeMs'>> {
    const config = this.providers.get(provider);
    if (!config?.enabled) {
      throw new Error(`Provider ${provider} is not available`);
    }

    const timeoutConfig = this.timeoutManager.getTimeoutConfig(operation);
    const model = options.model ?? config.defaultModel;

    // Execute based on provider type
    let result: {
      content: string;
      tokensUsed: { prompt: number; completion: number; total: number };
    };

    switch (provider) {
      case 'openai':
        result = await this.callOpenAI(config, options, model, timeoutConfig.timeoutMs);
        break;
      case 'anthropic':
        result = await this.callAnthropic(config, options, model, timeoutConfig.timeoutMs);
        break;
      case 'llama':
      case 'ollama':
        result = await this.callLocalLLM(config, options, model, timeoutConfig.timeoutMs);
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    // Calculate cost
    const cost = this.calculateCost(config, result.tokensUsed);
    this.metrics.costByProvider[provider] += cost;
    this.metrics.providerUsage[provider]++;

    return {
      content: result.content,
      provider,
      model,
      tokensUsed: result.tokensUsed,
      cost,
    };
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    config: ProviderConfig,
    options: CompletionOptions,
    model: string,
    timeoutMs: number
  ): Promise<{
    content: string;
    tokensUsed: { prompt: number; completion: number; total: number };
  }> {
    if (!config.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.organization && { 'OpenAI-Organization': config.organization }),
        },
        body: JSON.stringify({
          model,
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

      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      return {
        content: data.choices[0]?.message?.content ?? '',
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

  /**
   * Call Anthropic API
   */
  private async callAnthropic(
    config: ProviderConfig,
    options: CompletionOptions,
    model: string,
    timeoutMs: number
  ): Promise<{
    content: string;
    tokensUsed: { prompt: number; completion: number; total: number };
  }> {
    if (!config.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Convert OpenAI format to Anthropic format
      const systemMessage = options.messages.find((m) => m.role === 'system');
      const nonSystemMessages = options.messages.filter((m) => m.role !== 'system');

      const response = await fetch(`${config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? config.maxTokens,
          ...(systemMessage && { system: systemMessage.content }),
          messages: nonSystemMessages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        content: { type: string; text: string }[];
        usage: { input_tokens: number; output_tokens: number };
      };

      const content = data.content.find((c) => c.type === 'text')?.text ?? '';

      return {
        content,
        tokensUsed: {
          prompt: data.usage?.input_tokens ?? 0,
          completion: data.usage?.output_tokens ?? 0,
          total: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Call local LLM (Llama/Ollama)
   */
  private async callLocalLLM(
    config: ProviderConfig,
    options: CompletionOptions,
    model: string,
    timeoutMs: number
  ): Promise<{
    content: string;
    tokensUsed: { prompt: number; completion: number; total: number };
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Use OpenAI-compatible endpoint for Ollama/Llama
      const endpoint =
        config.provider === 'ollama'
          ? `${config.baseUrl}/chat`
          : `${config.baseUrl}/chat/completions`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
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
        throw new Error(`Local LLM error: ${response.status} - ${error}`);
      }

      const data = (await response.json()) as {
        message?: { content: string };
        choices?: { message: { content: string } }[];
        prompt_eval_count?: number;
        eval_count?: number;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      // Handle both Ollama and OpenAI-compatible responses
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

  /**
   * Get ordered list of providers to try
   */
  private getProvidersToTry(options: CompletionOptions): AIProvider[] {
    const available = this.config.fallbackOrder.filter((provider) => {
      const config = this.providers.get(provider);
      const health = this.providerHealth.get(provider);
      return config?.enabled && health?.status !== 'disabled' && health?.status !== 'unhealthy';
    });

    // If preferred provider specified, put it first
    if (options.preferredProvider && available.includes(options.preferredProvider)) {
      return [
        options.preferredProvider,
        ...available.filter((p) => p !== options.preferredProvider),
      ];
    }

    // If cost-aware routing, sort by cost
    if (this.config.enableCostAwareRouting) {
      return available.sort((a, b) => {
        const configA = this.providers.get(a);
        const configB = this.providers.get(b);
        const costA = (configA?.costPer1kInput ?? 0) + (configA?.costPer1kOutput ?? 0);
        const costB = (configB?.costPer1kInput ?? 0) + (configB?.costPer1kOutput ?? 0);
        return costA - costB;
      });
    }

    // If load balancing, use weighted random
    if (this.config.enableLoadBalancing) {
      return this.weightedShuffle(available);
    }

    // Default: use fallback order
    return available;
  }

  /**
   * Weighted shuffle for load balancing
   */
  private weightedShuffle(providers: AIProvider[]): AIProvider[] {
    const weighted = providers.map((p) => ({
      provider: p,
      weight: this.providers.get(p)?.weight ?? 50,
    }));

    // SECURITY: Use crypto-secure randomness for weighted selection
    return weighted
      .map((item) => {
        const randomBytes = new Uint32Array(1);
        crypto.getRandomValues(randomBytes);
        const randomValue = randomBytes[0]! / 0xffffffff;
        return {
          ...item,
          sort: randomValue * item.weight,
        };
      })
      .sort((a, b) => b.sort - a.sort)
      .map((item) => item.provider);
  }

  /**
   * Record successful request
   */
  private recordSuccess(provider: AIProvider, latencyMs: number): void {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    health.consecutiveSuccesses++;
    health.consecutiveFailures = 0;
    health.lastCheck = new Date();
    health.requestCount++;

    // Update average latency (exponential moving average)
    const alpha = 0.1;
    health.avgLatencyMs = alpha * latencyMs + (1 - alpha) * health.avgLatencyMs;
    this.metrics.avgLatencyByProvider[provider] = health.avgLatencyMs;

    // Update error rate
    health.errorRate = health.errorRate * 0.95; // Decay error rate

    // Recovery from degraded/unhealthy
    if (
      health.status !== 'healthy' &&
      health.consecutiveSuccesses >= this.config.recoveryThreshold
    ) {
      health.status = 'healthy';
      // Provider recovered to healthy status
    }
  }

  /**
   * Record failed request
   */
  private recordFailure(provider: AIProvider, error: string): void {
    const health = this.providerHealth.get(provider);
    if (!health) return;

    health.consecutiveFailures++;
    health.consecutiveSuccesses = 0;
    health.lastCheck = new Date();
    health.lastError = error;
    health.requestCount++;

    // Update error rate
    health.errorRate = Math.min(1, health.errorRate + 0.1);
    this.metrics.errorsByProvider[provider]++;

    // Degradation logic
    if (health.consecutiveFailures >= this.config.unhealthyThreshold) {
      health.status = 'unhealthy';
      // Provider marked as unhealthy
    } else if (health.consecutiveFailures >= 1) {
      health.status = 'degraded';
    }
  }

  /**
   * Calculate cost for a request
   */
  private calculateCost(
    config: ProviderConfig,
    tokensUsed: { prompt: number; completion: number }
  ): number {
    const inputCost = (tokensUsed.prompt / 1000) * config.costPer1kInput;
    const outputCost = (tokensUsed.completion / 1000) * config.costPer1kOutput;
    return inputCost + outputCost;
  }

  /**
   * Get provider health status
   */
  getProviderHealth(provider: AIProvider): ProviderHealth | undefined {
    return this.providerHealth.get(provider);
  }

  /**
   * Get all provider health statuses
   */
  getAllProviderHealth(): Record<AIProvider, ProviderHealth> {
    return Object.fromEntries(this.providerHealth) as Record<AIProvider, ProviderHealth>;
  }

  /**
   * Get fallback metrics
   */
  getMetrics(): FallbackMetrics {
    return { ...this.metrics };
  }

  /**
   * Get fallback rate
   */
  getFallbackRate(): number {
    if (this.metrics.totalRequests === 0) return 0;
    return this.metrics.fallbacksTriggered / this.metrics.totalRequests;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      fallbacksTriggered: 0,
      fallbackSuccesses: 0,
      fallbackFailures: 0,
      providerUsage: { openai: 0, anthropic: 0, llama: 0, ollama: 0 },
      avgLatencyByProvider: { openai: 0, anthropic: 0, llama: 0, ollama: 0 },
      errorsByProvider: { openai: 0, anthropic: 0, llama: 0, ollama: 0 },
      costByProvider: { openai: 0, anthropic: 0, llama: 0, ollama: 0 },
    };
  }

  /**
   * Enable/disable a provider
   */
  setProviderEnabled(provider: AIProvider, enabled: boolean): void {
    const config = this.providers.get(provider);
    if (config) {
      config.enabled = enabled;
      const health = this.providerHealth.get(provider);
      if (health) {
        health.status = enabled ? 'healthy' : 'disabled';
      }
    }
  }

  /**
   * Get timeout manager
   */
  getTimeoutManager(): AdaptiveTimeoutManager {
    return this.timeoutManager;
  }

  /**
   * Check if any provider is healthy
   */
  hasHealthyProvider(): boolean {
    for (const [, health] of this.providerHealth) {
      if (health.status === 'healthy') return true;
    }
    return false;
  }
}

/**
 * Factory function
 */
export function createMultiProviderGateway(
  config?: Partial<MultiProviderGatewayConfig>
): MultiProviderGateway {
  return new MultiProviderGateway(config);
}

/**
 * Factory with environment configuration
 */
export function createMultiProviderGatewayFromEnv(): MultiProviderGateway {
  const gateway = new MultiProviderGateway();

  // Configure OpenAI from environment
  if (process.env.OPENAI_API_KEY) {
    gateway.configureProvider('openai', {
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORGANIZATION,
      enabled: true,
    });
  }

  // Configure Anthropic from environment
  if (process.env.ANTHROPIC_API_KEY) {
    gateway.configureProvider('anthropic', {
      apiKey: process.env.ANTHROPIC_API_KEY,
      enabled: true,
    });
  }

  // Configure local Llama if endpoint is available
  if (process.env.LLAMA_API_URL) {
    gateway.configureProvider('llama', {
      baseUrl: process.env.LLAMA_API_URL,
      enabled: true,
    });
  }

  // Configure Ollama if endpoint is available
  if (process.env.OLLAMA_API_URL) {
    gateway.configureProvider('ollama', {
      baseUrl: process.env.OLLAMA_API_URL,
      enabled: true,
    });
  }

  return gateway;
}
