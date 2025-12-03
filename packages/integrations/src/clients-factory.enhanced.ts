/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ENHANCED INTEGRATION CLIENTS FACTORY                       ║
 * ║                                                                               ║
 * ║  State-of-the-art client orchestration with Result types, telemetry,         ║
 * ║  resilience patterns, and type-safe configuration.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { CircuitBreakerRegistry, createEventStore } from '@medicalcor/core';
import type { EventStore } from '@medicalcor/core';
import { InMemoryConsentRepository } from '@medicalcor/core/repositories';
import type { ScoringService, TriageService, ConsentService } from '@medicalcor/domain';
import {
  createScoringService,
  createTriageService,
  createConsentService,
} from '@medicalcor/domain';

import { createHubSpotClient } from './hubspot.js';
import type { HubSpotClient } from './hubspot.js';
import { createWhatsAppClient, TemplateCatalogService } from './whatsapp.js';
import type { WhatsAppClient } from './whatsapp.js';
import { createOpenAIClient } from './openai.js';
import type { OpenAIClient } from './openai.js';
import { createSchedulingService, MockSchedulingService } from './scheduling.js';
import type { SchedulingService } from './scheduling.js';
import { createVapiClient } from './vapi.js';
import type { VapiClient } from './vapi.js';
import { createStripeClient, MockStripeClient } from './stripe.js';
import type { StripeClient } from './stripe.js';

import {
  type CorrelationId,
  type Result,
  ok,
  err,
  type IntegrationError,
  integrationError,
  correlationId,
  RetryConfigBuilder,
  CircuitBreakerBuilder,
  TimeoutBuilder,
  type RetryConfig,
  type CircuitBreakerConfig,
  type TimeoutConfig,
  CompositeResilience,
  type CompositeResilienceConfig,
  instrument,
  IntegrationLabels,
  incrementCounter,
  setGauge,
} from './lib/index.js';

// =============================================================================
// Enhanced Configuration Types
// =============================================================================

/**
 * Client name union type
 */
export type ClientName =
  | 'hubspot'
  | 'whatsapp'
  | 'openai'
  | 'scheduling'
  | 'vapi'
  | 'stripe'
  | 'scoring'
  | 'triage'
  | 'consent'
  | 'templateCatalog'
  | 'eventStore';

/**
 * Enhanced configuration with builders
 */
export interface EnhancedClientsConfig {
  readonly source: string;
  readonly correlationId?: CorrelationId;

  // Feature flags
  readonly includeOpenAI?: boolean;
  readonly includeScheduling?: boolean;
  readonly includeVapi?: boolean;
  readonly includeStripe?: boolean;
  readonly includeScoring?: boolean;
  readonly includeTriage?: boolean;
  readonly includeConsent?: boolean;
  readonly includeTemplateCatalog?: boolean;

  // Global configurations
  readonly retry?: RetryConfig | ((builder: RetryConfigBuilder) => RetryConfigBuilder);
  readonly circuitBreaker?:
    | CircuitBreakerConfig
    | ((builder: CircuitBreakerBuilder) => CircuitBreakerBuilder);
  readonly timeout?: TimeoutConfig | ((builder: TimeoutBuilder) => TimeoutBuilder);

  // Per-client resilience overrides
  readonly clientResilience?: Partial<Record<ClientName, CompositeResilienceConfig>>;

  // Environment
  readonly useMocks?: boolean;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  readonly name: string;
  readonly state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  readonly failures: number;
  readonly successes: number;
  readonly lastFailure?: Date;
}

/**
 * Enhanced integration clients container
 */
export interface EnhancedIntegrationClients {
  // Core clients
  readonly hubspot: HubSpotClient | null;
  readonly whatsapp: WhatsAppClient | null;
  readonly openai: OpenAIClient | null;
  readonly scheduling: SchedulingService | MockSchedulingService | null;
  readonly vapi: VapiClient | null;
  readonly stripe: StripeClient | MockStripeClient | null;

  // Domain services
  readonly scoring: ScoringService | null;
  readonly triage: TriageService | null;
  readonly consent: ConsentService | null;
  readonly templateCatalog: TemplateCatalogService | null;

  // Infrastructure
  readonly eventStore: EventStore;
  readonly resilience: Map<ClientName, CompositeResilience>;

  // Metadata
  readonly correlationId: CorrelationId;
  readonly source: string;
  readonly createdAt: Date;

  // Methods
  isConfigured(required: ClientName[]): boolean;
  getCircuitBreakerStats(): CircuitBreakerStats[];
  isCircuitOpen(service: ClientName): boolean;
  resetCircuit(service: ClientName): void;
  getResilienceStats(): Record<ClientName, ReturnType<CompositeResilience['getStats']>>;

  // Enhanced methods with Result types
  withResilience<T>(
    client: ClientName,
    key: string,
    operation: () => Promise<T>
  ): Promise<Result<T, IntegrationError>>;

  // Cleanup
  destroy(): void;
}

// =============================================================================
// Configuration Resolution
// =============================================================================

function resolveRetryConfig(
  config: RetryConfig | ((builder: RetryConfigBuilder) => RetryConfigBuilder) | undefined
): RetryConfig {
  if (!config) return RetryConfigBuilder.standard();
  if (typeof config === 'function') return config(RetryConfigBuilder.create()).build();
  return config;
}

function resolveCircuitBreakerConfig(
  config:
    | CircuitBreakerConfig
    | ((builder: CircuitBreakerBuilder) => CircuitBreakerBuilder)
    | undefined
): CircuitBreakerConfig {
  if (!config) return CircuitBreakerBuilder.standard();
  if (typeof config === 'function') return config(CircuitBreakerBuilder.create()).build();
  return config;
}

function resolveTimeoutConfig(
  config: TimeoutConfig | ((builder: TimeoutBuilder) => TimeoutBuilder) | undefined
): TimeoutConfig {
  if (!config) return TimeoutBuilder.standard();
  if (typeof config === 'function') return config(TimeoutBuilder.create()).build();
  return config;
}

// =============================================================================
// Environment Configuration Helpers
// =============================================================================

/**
 * Get OpenAI API key from environment
 */
export function getOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY;
}

/**
 * Get HubSpot access token from environment
 */
export function getHubSpotAccessToken(): string | undefined {
  return process.env.HUBSPOT_ACCESS_TOKEN;
}

/**
 * Get WhatsApp API credentials from environment
 */
export function getWhatsAppCredentials(): {
  apiKey: string;
  phoneNumberId: string;
} | null {
  const apiKey = process.env.WHATSAPP_API_KEY;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!apiKey || !phoneNumberId) return null;
  return { apiKey, phoneNumberId };
}

/**
 * Get Vapi credentials from environment
 */
export function getVapiCredentials(): {
  apiKey: string;
  assistantId?: string;
} | null {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return null;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  return assistantId ? { apiKey, assistantId } : { apiKey };
}

/**
 * Get Stripe credentials from environment
 */
export function getStripeCredentials(): {
  secretKey: string;
  webhookSecret?: string;
} | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  return webhookSecret ? { secretKey, webhookSecret } : { secretKey };
}

/**
 * Get Scheduling API credentials from environment
 */
export function getSchedulingCredentials(): {
  apiUrl: string;
  apiKey: string;
} | null {
  const apiUrl = process.env.SCHEDULING_API_URL;
  const apiKey = process.env.SCHEDULING_API_KEY;
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey };
}

// =============================================================================
// Enhanced Factory Function
// =============================================================================

/**
 * Create enhanced integration clients with state-of-the-art patterns
 *
 * @example
 * ```typescript
 * const clients = createEnhancedIntegrationClients({
 *   source: 'webhook-handler',
 *   includeOpenAI: true,
 *   includeVapi: true,
 *   retry: builder => builder
 *     .maxRetries(5)
 *     .exponentialBackoff(1000)
 *     .withJitter(),
 *   circuitBreaker: builder => builder
 *     .failureThreshold(5)
 *     .resetTimeout(30000)
 * });
 *
 * // Use with resilience wrapper
 * const result = await clients.withResilience(
 *   'hubspot',
 *   `syncContact:${phone}`,
 *   () => clients.hubspot!.syncContact(data)
 * );
 *
 * if (isOk(result)) {
 *   console.log('Synced:', result.value);
 * } else {
 *   console.error('Failed:', result.error);
 * }
 * ```
 */
export function createEnhancedIntegrationClients(
  config: EnhancedClientsConfig
): EnhancedIntegrationClients {
  const corrId = config.correlationId ?? correlationId();
  const createdAt = new Date();

  // Resolve global configurations
  const globalRetry = resolveRetryConfig(config.retry);
  const globalCircuitBreaker = resolveCircuitBreakerConfig(config.circuitBreaker);
  const globalTimeout = resolveTimeoutConfig(config.timeout);

  // Create circuit breaker registry with aligned API
  const circuitBreakerRegistry = new CircuitBreakerRegistry({
    failureThreshold: globalCircuitBreaker.failureThreshold,
    resetTimeoutMs: globalCircuitBreaker.resetTimeoutMs,
    successThreshold: globalCircuitBreaker.successThreshold,
    failureWindowMs: globalCircuitBreaker.failureWindowMs,
  });

  // Create resilience instances for each client
  const resilience = new Map<ClientName, CompositeResilience>();

  function createResilienceForClient(name: ClientName): CompositeResilience {
    const clientConfig = config.clientResilience?.[name];
    return new CompositeResilience({
      name,
      bulkhead: clientConfig?.bulkhead ?? {
        name,
        maxConcurrent: 20,
        maxQueue: 100,
        queueTimeoutMs: globalTimeout.requestTimeoutMs,
      },
      rateLimiter: clientConfig?.rateLimiter ?? {
        name,
        maxTokens: 100,
        refillRate: 10,
      },
      deduplication: clientConfig?.deduplication ?? {
        ttlMs: 5000,
        maxSize: 1000,
      },
      adaptiveTimeout: clientConfig?.adaptiveTimeout ?? {
        initialTimeoutMs: globalTimeout.requestTimeoutMs,
        minTimeoutMs: 1000,
        maxTimeoutMs: globalTimeout.totalTimeoutMs,
      },
    });
  }

  // Initialize resilience for all client types
  const clientNames: ClientName[] = [
    'hubspot',
    'whatsapp',
    'openai',
    'scheduling',
    'vapi',
    'stripe',
  ];

  for (const name of clientNames) {
    resilience.set(name, createResilienceForClient(name));
  }

  // Create event store - use in-memory for this factory
  const eventStore: EventStore = createEventStore({ source: config.source });

  // Initialize clients
  let hubspot: HubSpotClient | null = null;
  let whatsapp: WhatsAppClient | null = null;
  let openai: OpenAIClient | null = null;
  let scheduling: SchedulingService | MockSchedulingService | null = null;
  let vapi: VapiClient | null = null;
  let stripe: StripeClient | MockStripeClient | null = null;
  let scoring: ScoringService | null = null;
  let triage: TriageService | null = null;
  let consent: ConsentService | null = null;
  let templateCatalog: TemplateCatalogService | null = null;

  // HubSpot
  const hubspotToken = getHubSpotAccessToken();
  if (hubspotToken) {
    const rawClient = createHubSpotClient({
      accessToken: hubspotToken,
      retryConfig: {
        maxRetries: globalRetry.maxRetries,
        baseDelayMs: globalRetry.baseDelayMs,
      },
    });
    hubspot = circuitBreakerRegistry.wrapClient('hubspot', rawClient);
    incrementCounter('integration_client_initialized', {
      [IntegrationLabels.SERVICE]: 'hubspot',
    });
  }

  // WhatsApp
  const whatsappCreds = getWhatsAppCredentials();
  if (whatsappCreds) {
    const rawClient = createWhatsAppClient({
      apiKey: whatsappCreds.apiKey,
      phoneNumberId: whatsappCreds.phoneNumberId,
      retryConfig: {
        maxRetries: globalRetry.maxRetries,
        baseDelayMs: globalRetry.baseDelayMs,
      },
    });
    whatsapp = circuitBreakerRegistry.wrapClient('whatsapp', rawClient);
    incrementCounter('integration_client_initialized', {
      [IntegrationLabels.SERVICE]: 'whatsapp',
    });
  }

  // OpenAI
  if (config.includeOpenAI !== false) {
    const openaiKey = getOpenAIApiKey();
    if (openaiKey) {
      const rawClient = createOpenAIClient({
        apiKey: openaiKey,
        retryConfig: {
          maxRetries: globalRetry.maxRetries,
          baseDelayMs: globalRetry.baseDelayMs,
        },
        timeoutMs: globalTimeout.requestTimeoutMs,
      });
      openai = circuitBreakerRegistry.wrapClient('openai', rawClient);
      incrementCounter('integration_client_initialized', {
        [IntegrationLabels.SERVICE]: 'openai',
      });
    }
  }

  // Scheduling
  if (config.includeScheduling !== false) {
    const schedulingCreds = getSchedulingCredentials();
    if (schedulingCreds) {
      scheduling = createSchedulingService({
        ...schedulingCreds,
        retryConfig: {
          maxRetries: globalRetry.maxRetries,
          baseDelayMs: globalRetry.baseDelayMs,
        },
        timeoutMs: globalTimeout.requestTimeoutMs,
      });
      incrementCounter('integration_client_initialized', {
        [IntegrationLabels.SERVICE]: 'scheduling',
      });
    } else if (config.useMocks) {
      scheduling = new MockSchedulingService();
    }
  }

  // Vapi
  if (config.includeVapi !== false) {
    const vapiCreds = getVapiCredentials();
    if (vapiCreds) {
      const rawClient = createVapiClient({
        apiKey: vapiCreds.apiKey,
        assistantId: vapiCreds.assistantId,
        retryConfig: {
          maxRetries: globalRetry.maxRetries,
          baseDelayMs: globalRetry.baseDelayMs,
        },
        timeoutMs: globalTimeout.requestTimeoutMs,
      });
      vapi = circuitBreakerRegistry.wrapClient('vapi', rawClient);
      incrementCounter('integration_client_initialized', {
        [IntegrationLabels.SERVICE]: 'vapi',
      });
    }
  }

  // Stripe
  if (config.includeStripe !== false) {
    const stripeCreds = getStripeCredentials();
    if (stripeCreds) {
      const stripeConfig: Parameters<typeof createStripeClient>[0] = {
        secretKey: stripeCreds.secretKey,
        retryConfig: {
          maxRetries: globalRetry.maxRetries,
          baseDelayMs: globalRetry.baseDelayMs,
        },
        timeoutMs: globalTimeout.requestTimeoutMs,
      };
      if (stripeCreds.webhookSecret) {
        stripeConfig.webhookSecret = stripeCreds.webhookSecret;
      }
      const rawClient = createStripeClient(stripeConfig);
      stripe = circuitBreakerRegistry.wrapClient('stripe', rawClient);
      incrementCounter('integration_client_initialized', {
        [IntegrationLabels.SERVICE]: 'stripe',
      });
    } else if (config.useMocks) {
      stripe = new MockStripeClient();
    }
  }

  // Domain services
  const openaiApiKey = getOpenAIApiKey();
  if (config.includeScoring !== false && openaiApiKey) {
    scoring = createScoringService({
      openaiApiKey,
      fallbackEnabled: true,
    });
  }

  if (config.includeTriage !== false) {
    triage = createTriageService();
  }

  if (config.includeConsent !== false) {
    // Use in-memory repository for development/testing
    const inMemoryRepository = new InMemoryConsentRepository();
    consent = createConsentService({ repository: inMemoryRepository });
  }

  if (config.includeTemplateCatalog !== false && whatsapp) {
    templateCatalog = new TemplateCatalogService();
  }

  // Track configured clients
  const configuredClients = new Set<ClientName>();
  if (hubspot) configuredClients.add('hubspot');
  if (whatsapp) configuredClients.add('whatsapp');
  if (openai) configuredClients.add('openai');
  if (scheduling) configuredClients.add('scheduling');
  if (vapi) configuredClients.add('vapi');
  if (stripe) configuredClients.add('stripe');
  if (scoring) configuredClients.add('scoring');
  if (triage) configuredClients.add('triage');
  if (consent) configuredClients.add('consent');
  if (templateCatalog) configuredClients.add('templateCatalog');
  configuredClients.add('eventStore');

  setGauge('integration_clients_configured', configuredClients.size, {
    source: config.source,
  });

  // Build the enhanced clients object
  const clients: EnhancedIntegrationClients = {
    hubspot,
    whatsapp,
    openai,
    scheduling,
    vapi,
    stripe,
    scoring,
    triage,
    consent,
    templateCatalog,
    eventStore,
    resilience,
    correlationId: corrId,
    source: config.source,
    createdAt,

    isConfigured(required: ClientName[]): boolean {
      return required.every((name) => configuredClients.has(name));
    },

    getCircuitBreakerStats(): CircuitBreakerStats[] {
      return circuitBreakerRegistry.getAllStats();
    },

    isCircuitOpen(service: ClientName): boolean {
      return circuitBreakerRegistry.isOpen(service);
    },

    resetCircuit(service: ClientName): void {
      circuitBreakerRegistry.reset(service);
    },

    getResilienceStats() {
      const stats: Record<ClientName, ReturnType<CompositeResilience['getStats']>> = {} as Record<
        ClientName,
        ReturnType<CompositeResilience['getStats']>
      >;
      for (const [name, instance] of resilience) {
        stats[name] = instance.getStats();
      }
      return stats;
    },

    async withResilience<T>(
      client: ClientName,
      key: string,
      operation: () => Promise<T>
    ): Promise<Result<T, IntegrationError>> {
      const clientResilience = resilience.get(client);
      if (!clientResilience) {
        return err(
          integrationError('INTERNAL_ERROR', client, `No resilience configured for ${client}`, {
            correlationId: corrId,
          })
        );
      }

      return instrument(
        {
          service: client,
          operation: key.split(':')[0] ?? 'unknown',
          attributes: { 'dedup.key': key },
        },
        async () => {
          try {
            const result = await clientResilience.execute(key, operation);
            return ok(result);
          } catch (error) {
            if (error instanceof Error) {
              // Classify the error
              const message = error.message.toLowerCase();

              if (message.includes('bulkhead')) {
                return err(
                  integrationError('CIRCUIT_OPEN', client, error.message, {
                    cause: error,
                    correlationId: corrId,
                    retryable: true,
                  })
                );
              }

              if (message.includes('timeout')) {
                return err(
                  integrationError('TIMEOUT', client, error.message, {
                    cause: error,
                    correlationId: corrId,
                    retryable: true,
                  })
                );
              }

              if (message.includes('rate')) {
                return err(
                  integrationError('RATE_LIMITED', client, error.message, {
                    cause: error,
                    correlationId: corrId,
                    retryable: true,
                  })
                );
              }

              return err(
                integrationError('EXTERNAL_SERVICE_ERROR', client, error.message, {
                  cause: error,
                  correlationId: corrId,
                  retryable: true,
                })
              );
            }

            return err(
              integrationError('INTERNAL_ERROR', client, String(error), {
                correlationId: corrId,
                retryable: false,
              })
            );
          }
        }
      );
    },

    destroy(): void {
      for (const instance of resilience.values()) {
        instance.destroy();
      }
      resilience.clear();
      if (vapi && 'destroy' in vapi) {
        vapi.destroy();
      }
    },
  };

  return clients;
}

// =============================================================================
// Legacy Factory (Backwards Compatibility)
// =============================================================================

/**
 * Legacy configuration interface for backwards compatibility
 */
export interface ClientsConfig {
  source: string;
  includeOpenAI?: boolean;
  includeScheduling?: boolean;
  includeVapi?: boolean;
  includeStripe?: boolean;
  includeScoring?: boolean;
  includeTriage?: boolean;
  includeConsent?: boolean;
  includeTemplateCatalog?: boolean;
  circuitBreaker?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
  };
}

/**
 * Legacy clients interface
 */
export interface IntegrationClients {
  hubspot: HubSpotClient | null;
  whatsapp: WhatsAppClient | null;
  openai: OpenAIClient | null;
  scheduling: SchedulingService | MockSchedulingService | null;
  vapi: VapiClient | null;
  stripe: StripeClient | MockStripeClient | null;
  scoring: ScoringService | null;
  triage: TriageService | null;
  consent: ConsentService | null;
  templateCatalog: TemplateCatalogService | null;
  eventStore: EventStore;
  isConfigured(required: ClientName[]): boolean;
  getCircuitBreakerStats(): CircuitBreakerStats[];
  isCircuitOpen(service: ClientName): boolean;
  resetCircuit(service: ClientName): void;
}

/**
 * Create integration clients (legacy interface for backwards compatibility)
 */
export function createIntegrationClients(config: ClientsConfig): IntegrationClients {
  // Build circuit breaker config inline if provided
  const circuitBreakerConfig = config.circuitBreaker
    ? (builder: CircuitBreakerBuilder) =>
        builder
          .failureThreshold(config.circuitBreaker?.failureThreshold ?? 5)
          .resetTimeout(config.circuitBreaker?.resetTimeoutMs ?? 30000)
    : undefined;

  // Build enhanced config, only including defined properties to satisfy exactOptionalPropertyTypes
  const enhancedConfig: EnhancedClientsConfig = {
    source: config.source,
    ...(config.includeOpenAI !== undefined && { includeOpenAI: config.includeOpenAI }),
    ...(config.includeScheduling !== undefined && { includeScheduling: config.includeScheduling }),
    ...(config.includeVapi !== undefined && { includeVapi: config.includeVapi }),
    ...(config.includeStripe !== undefined && { includeStripe: config.includeStripe }),
    ...(config.includeScoring !== undefined && { includeScoring: config.includeScoring }),
    ...(config.includeTriage !== undefined && { includeTriage: config.includeTriage }),
    ...(config.includeConsent !== undefined && { includeConsent: config.includeConsent }),
    ...(config.includeTemplateCatalog !== undefined && {
      includeTemplateCatalog: config.includeTemplateCatalog,
    }),
    ...(circuitBreakerConfig && { circuitBreaker: circuitBreakerConfig }),
  };

  const enhanced = createEnhancedIntegrationClients(enhancedConfig);

  return {
    hubspot: enhanced.hubspot,
    whatsapp: enhanced.whatsapp,
    openai: enhanced.openai,
    scheduling: enhanced.scheduling,
    vapi: enhanced.vapi,
    stripe: enhanced.stripe,
    scoring: enhanced.scoring,
    triage: enhanced.triage,
    consent: enhanced.consent,
    templateCatalog: enhanced.templateCatalog,
    eventStore: enhanced.eventStore,
    isConfigured: enhanced.isConfigured.bind(enhanced),
    getCircuitBreakerStats: enhanced.getCircuitBreakerStats.bind(enhanced),
    isCircuitOpen: enhanced.isCircuitOpen.bind(enhanced),
    resetCircuit: enhanced.resetCircuit.bind(enhanced),
  };
}
