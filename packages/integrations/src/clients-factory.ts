/**
 * Shared client factory for Trigger.dev tasks and workflows
 * Eliminates code duplication across handlers
 *
 * Includes circuit breaker support for resilience
 */

import {
  CircuitBreakerRegistry,
  CircuitState,
  type CircuitBreakerStats,
  createEventStore,
  createInMemoryEventStore,
  createDatabaseClient,
} from '@medicalcor/core';
import { createHubSpotClient, type HubSpotClient } from './hubspot.js';
import { createWhatsAppClient, type WhatsAppClient } from './whatsapp.js';
import { createOpenAIClient, type OpenAIClient } from './openai.js';
import {
  createSchedulingService,
  createMockSchedulingService,
  type SchedulingService,
  type MockSchedulingService,
} from './scheduling.js';
import { createVapiClient, type VapiClient } from './vapi.js';
import { createTemplateCatalogService, type TemplateCatalogService } from './whatsapp.js';
import {
  createStripeClient,
  createMockStripeClient,
  type StripeClient,
  type MockStripeClient,
} from './stripe.js';
import {
  createScoringService,
  createTriageService,
  createConsentService,
  createPersistentConsentService,
  type ScoringService,
  type TriageService,
  type ConsentService,
} from '@medicalcor/domain';

/**
 * Event store interface that matches our domain events
 */
export interface EventStore {
  emit: (input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateId?: string;
    aggregateType?: string;
  }) => Promise<unknown>;
  getByCorrelationId: (correlationId: string) => Promise<Array<{ type: string }>>;
}

/**
 * Circuit breaker configuration for integrations
 */
export interface CircuitBreakerOptions {
  /** Enable circuit breaker wrapping (default: true) */
  enabled?: boolean;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms before attempting recovery (default: 30000) */
  resetTimeoutMs?: number;
  /** Number of successful calls in HALF_OPEN before closing (default: 2) */
  successThreshold?: number;
  /** Callback when circuit opens */
  onOpen?: (name: string, error: Error) => void;
  /** Callback when circuit closes */
  onClose?: (name: string) => void;
}

/**
 * Configuration for which clients to initialize
 */
export interface ClientsConfig {
  /** Source name for event store (e.g., 'whatsapp-handler', 'cron-jobs') */
  source: string;
  /** Include OpenAI client */
  includeOpenAI?: boolean;
  /** Include scheduling service */
  includeScheduling?: boolean;
  /** Include Vapi voice client */
  includeVapi?: boolean;
  /** Include Stripe payment client */
  includeStripe?: boolean;
  /** Include scoring service (requires OpenAI for AI scoring) */
  includeScoring?: boolean;
  /** Include triage service */
  includeTriage?: boolean;
  /** Include consent service (GDPR) */
  includeConsent?: boolean;
  /** Include template catalog service */
  includeTemplateCatalog?: boolean;
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerOptions;
}

/** Supported client names for configuration checks */
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
 * Result of client initialization
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
  /** Returns true if all required clients are available */
  isConfigured: (required: ClientName[]) => boolean;
  /** Get circuit breaker statistics for all services */
  getCircuitBreakerStats: () => CircuitBreakerStats[];
  /** Check if a specific service circuit is open */
  isCircuitOpen: (service: ClientName) => boolean;
  /** Reset circuit breaker for a specific service */
  resetCircuit: (service: ClientName) => void;
}

// Global circuit breaker registry for integrations
// =============================================================================
// Circuit Breaker Configuration Constants
// =============================================================================

/**
 * Number of consecutive failures before circuit opens (trips).
 * After 5 failures, the circuit opens to prevent cascading failures.
 */
const CB_FAILURE_THRESHOLD = 5;

/**
 * Time in milliseconds before attempting recovery after circuit opens.
 * After 30 seconds, circuit moves to HALF_OPEN to test if service recovered.
 */
const CB_RESET_TIMEOUT_MS = 30_000;

/**
 * Number of successful calls in HALF_OPEN state before circuit closes.
 * Two consecutive successes confirm the service has recovered.
 */
const CB_SUCCESS_THRESHOLD = 2;

/**
 * Time window in milliseconds for counting failures.
 * Failures older than 60 seconds are not counted toward the threshold.
 */
const CB_FAILURE_WINDOW_MS = 60_000;

const integrationCircuitBreakerRegistry = new CircuitBreakerRegistry({
  failureThreshold: CB_FAILURE_THRESHOLD,
  resetTimeoutMs: CB_RESET_TIMEOUT_MS,
  successThreshold: CB_SUCCESS_THRESHOLD,
  failureWindowMs: CB_FAILURE_WINDOW_MS,
});

/**
 * Create integration clients from environment variables
 *
 * @example
 * ```typescript
 * const clients = createIntegrationClients({ source: 'whatsapp-handler', includeOpenAI: true });
 * if (!clients.isConfigured(['hubspot', 'whatsapp'])) {
 *   logger.warn('Required clients not configured');
 *   return;
 * }
 * ```
 */
export function createIntegrationClients(config: ClientsConfig): IntegrationClients {
  const {
    source,
    includeOpenAI = false,
    includeScheduling = false,
    includeVapi = false,
    includeStripe = false,
    includeScoring = false,
    includeTriage = false,
    includeConsent = false,
    includeTemplateCatalog = false,
    circuitBreaker = {},
  } = config;
  const cbEnabled = circuitBreaker.enabled !== false; // Default enabled

  // Initialize circuit breakers with custom config if provided
  if (cbEnabled) {
    const cbConfig: Parameters<typeof integrationCircuitBreakerRegistry.get>[1] = {
      failureThreshold: circuitBreaker.failureThreshold ?? 5,
      resetTimeoutMs: circuitBreaker.resetTimeoutMs ?? 30000,
      successThreshold: circuitBreaker.successThreshold ?? 2,
    };
    // Only add callback properties if they are defined
    if (circuitBreaker.onOpen) {
      cbConfig.onOpen = circuitBreaker.onOpen;
    }
    if (circuitBreaker.onClose) {
      cbConfig.onClose = circuitBreaker.onClose;
    }

    // Pre-register circuit breakers for each service (including Stripe for payment protection)
    integrationCircuitBreakerRegistry.get('hubspot', cbConfig);
    integrationCircuitBreakerRegistry.get('whatsapp', cbConfig);
    integrationCircuitBreakerRegistry.get('openai', cbConfig);
    integrationCircuitBreakerRegistry.get('scheduling', cbConfig);
    integrationCircuitBreakerRegistry.get('vapi', cbConfig);
    integrationCircuitBreakerRegistry.get('stripe', {
      ...cbConfig,
      // Stripe-specific: more conservative thresholds for payment operations
      failureThreshold: 3,
      resetTimeoutMs: 60000, // 1 minute recovery for payment services
    });
  }

  const databaseUrl = process.env.DATABASE_URL;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  // HubSpot client
  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  const hubspotRaw = hubspotToken ? createHubSpotClient({ accessToken: hubspotToken }) : null;

  // Wrap HubSpot client with circuit breaker
  const hubspot =
    hubspotRaw && cbEnabled ? wrapClientWithCircuitBreaker(hubspotRaw, 'hubspot') : hubspotRaw;

  // WhatsApp client
  const whatsappApiKey = process.env.WHATSAPP_API_KEY;
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const whatsappRaw =
    whatsappApiKey && whatsappPhoneNumberId
      ? createWhatsAppClient({
          apiKey: whatsappApiKey,
          phoneNumberId: whatsappPhoneNumberId,
          ...(webhookSecret && { webhookSecret }),
        })
      : null;

  // Wrap WhatsApp client with circuit breaker
  const whatsapp =
    whatsappRaw && cbEnabled ? wrapClientWithCircuitBreaker(whatsappRaw, 'whatsapp') : whatsappRaw;

  // OpenAI client (optional)
  let openai: OpenAIClient | null = null;
  if (includeOpenAI) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiRaw = openaiApiKey ? createOpenAIClient({ apiKey: openaiApiKey }) : null;
    openai = openaiRaw && cbEnabled ? wrapClientWithCircuitBreaker(openaiRaw, 'openai') : openaiRaw;
  }

  // Scheduling service (optional)
  let scheduling: SchedulingService | MockSchedulingService | null = null;
  if (includeScheduling) {
    const schedulingApiUrl = process.env.SCHEDULING_SERVICE_URL;
    const schedulingApiKey = process.env.SCHEDULING_SERVICE_TOKEN;
    const schedulingRaw =
      schedulingApiUrl && schedulingApiKey
        ? createSchedulingService({ apiUrl: schedulingApiUrl, apiKey: schedulingApiKey })
        : createMockSchedulingService();
    scheduling = cbEnabled
      ? wrapClientWithCircuitBreaker(schedulingRaw, 'scheduling')
      : schedulingRaw;
  }

  // Vapi voice client (optional)
  let vapi: VapiClient | null = null;
  if (includeVapi) {
    const vapiApiKey = process.env.VAPI_API_KEY;
    const vapiRaw = vapiApiKey
      ? createVapiClient({
          apiKey: vapiApiKey,
          assistantId: process.env.VAPI_ASSISTANT_ID,
          phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        })
      : null;
    vapi = vapiRaw && cbEnabled ? wrapClientWithCircuitBreaker(vapiRaw, 'vapi') : vapiRaw;
  }

  // Stripe payment client (optional) - with circuit breaker protection for payment resilience
  let stripe: StripeClient | MockStripeClient | null = null;
  if (includeStripe) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // Build Stripe config without undefined values for exactOptionalPropertyTypes
    const stripeConfig: Parameters<typeof createStripeClient>[0] = {
      secretKey: stripeSecretKey ?? '',
      timeoutMs: 30000,
      retryConfig: {
        maxRetries: 3,
        baseDelayMs: 1000,
      },
    };
    if (stripeWebhookSecret) {
      stripeConfig.webhookSecret = stripeWebhookSecret;
    }

    const stripeRaw =
      stripeSecretKey
        ? createStripeClient(stripeConfig)
        : createMockStripeClient();
    // Always wrap Stripe with circuit breaker for payment protection
    stripe = cbEnabled ? wrapClientWithCircuitBreaker(stripeRaw, 'stripe') : stripeRaw;
  }

  // Scoring service (optional)
  let scoring: ScoringService | null = null;
  if (includeScoring) {
    scoring = createScoringService({
      openaiApiKey: openaiApiKey ?? '',
      fallbackEnabled: true,
    });
  }

  // Triage service (optional)
  let triage: TriageService | null = null;
  if (includeTriage) {
    triage = createTriageService();
  }

  // Consent service (optional, GDPR compliance)
  let consent: ConsentService | null = null;
  if (includeConsent) {
    if (databaseUrl) {
      const db = createDatabaseClient(databaseUrl);
      consent = createPersistentConsentService(db);
    } else {
      consent = createConsentService();
    }
  }

  // Template catalog service (optional)
  let templateCatalog: TemplateCatalogService | null = null;
  if (includeTemplateCatalog) {
    templateCatalog = createTemplateCatalogService();
  }

  // Event store (always initialized)
  const eventStore: EventStore = databaseUrl
    ? createEventStore({ source, connectionString: databaseUrl })
    : createInMemoryEventStore(source);

  // Helper to check if required clients are configured
  const isConfigured = (required: ClientName[]): boolean => {
    for (const client of required) {
      switch (client) {
        case 'hubspot':
          if (!hubspot) return false;
          break;
        case 'whatsapp':
          if (!whatsapp) return false;
          break;
        case 'openai':
          if (!openai) return false;
          break;
        case 'scheduling':
          if (!scheduling) return false;
          break;
        case 'vapi':
          if (!vapi) return false;
          break;
        case 'stripe':
          if (!stripe) return false;
          break;
        case 'scoring':
          if (!scoring) return false;
          break;
        case 'triage':
          if (!triage) return false;
          break;
        case 'consent':
          if (!consent) return false;
          break;
        case 'templateCatalog':
          if (!templateCatalog) return false;
          break;
        case 'eventStore':
          // eventStore is always initialized
          break;
      }
    }
    return true;
  };

  // Get circuit breaker stats
  const getCircuitBreakerStats = (): CircuitBreakerStats[] => {
    return integrationCircuitBreakerRegistry.getAllStats();
  };

  // Services with circuit breaker protection
  const circuitBreakerServices = ['hubspot', 'whatsapp', 'openai', 'scheduling', 'vapi', 'stripe'];

  // Check if circuit is open
  const isCircuitOpen = (service: ClientName): boolean => {
    // Only check for services that have circuit breakers
    if (circuitBreakerServices.includes(service)) {
      const breaker = integrationCircuitBreakerRegistry.get(service);
      return breaker.getState() === CircuitState.OPEN;
    }
    return false;
  };

  // Reset circuit breaker
  const resetCircuit = (service: ClientName): void => {
    // Only reset for services that have circuit breakers
    if (circuitBreakerServices.includes(service)) {
      integrationCircuitBreakerRegistry.reset(service);
    }
  };

  return {
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
    isConfigured,
    getCircuitBreakerStats,
    isCircuitOpen,
    resetCircuit,
  };
}

/**
 * Wrap a client object with circuit breaker for all async methods
 */
function wrapClientWithCircuitBreaker<T extends object>(client: T, serviceName: string): T {
  const breaker = integrationCircuitBreakerRegistry.get(serviceName);

  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Only wrap functions
      if (typeof value !== 'function') {
        return value;
      }

      // Return wrapped function that uses circuit breaker
      return async (...args: unknown[]) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return breaker.execute(() => value.apply(target, args));
      };
    },
  });
}

/**
 * Get OpenAI API key from environment
 * Useful for services that need just the key without the full client
 */
export function getOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY;
}
