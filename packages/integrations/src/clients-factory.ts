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
} from '@medicalcor/core';
import {
  createHubSpotClient,
  type HubSpotClient,
} from './hubspot.js';
import {
  createWhatsAppClient,
  type WhatsAppClient,
} from './whatsapp.js';
import {
  createOpenAIClient,
  type OpenAIClient,
} from './openai.js';
import {
  createSchedulingService,
  createMockSchedulingService,
  type SchedulingService,
  MockSchedulingService,
} from './scheduling.js';

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
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerOptions;
}

/**
 * Result of client initialization
 */
export interface IntegrationClients {
  hubspot: HubSpotClient | null;
  whatsapp: WhatsAppClient | null;
  openai: OpenAIClient | null;
  scheduling: SchedulingService | MockSchedulingService | null;
  /** Returns true if all required clients are available */
  isConfigured: (required: Array<'hubspot' | 'whatsapp' | 'openai' | 'scheduling'>) => boolean;
  /** Get circuit breaker statistics for all services */
  getCircuitBreakerStats: () => CircuitBreakerStats[];
  /** Check if a specific service circuit is open */
  isCircuitOpen: (service: 'hubspot' | 'whatsapp' | 'openai' | 'scheduling') => boolean;
  /** Reset circuit breaker for a specific service */
  resetCircuit: (service: 'hubspot' | 'whatsapp' | 'openai' | 'scheduling') => void;
}

// Global circuit breaker registry for integrations
const integrationCircuitBreakerRegistry = new CircuitBreakerRegistry({
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
  failureWindowMs: 60000,
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
  const { includeOpenAI = false, includeScheduling = false, circuitBreaker = {} } = config;
  const cbEnabled = circuitBreaker.enabled !== false; // Default enabled

  // Initialize circuit breakers with custom config if provided
  if (cbEnabled) {
    const cbConfig = {
      failureThreshold: circuitBreaker.failureThreshold ?? 5,
      resetTimeoutMs: circuitBreaker.resetTimeoutMs ?? 30000,
      successThreshold: circuitBreaker.successThreshold ?? 2,
      onOpen: circuitBreaker.onOpen,
      onClose: circuitBreaker.onClose,
    };

    // Pre-register circuit breakers for each service
    integrationCircuitBreakerRegistry.get('hubspot', cbConfig);
    integrationCircuitBreakerRegistry.get('whatsapp', cbConfig);
    integrationCircuitBreakerRegistry.get('openai', cbConfig);
    integrationCircuitBreakerRegistry.get('scheduling', cbConfig);
  }

  // HubSpot client
  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  const hubspotRaw = hubspotToken
    ? createHubSpotClient({ accessToken: hubspotToken })
    : null;

  // Wrap HubSpot client with circuit breaker
  const hubspot = hubspotRaw && cbEnabled
    ? wrapClientWithCircuitBreaker(hubspotRaw, 'hubspot')
    : hubspotRaw;

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
  const whatsapp = whatsappRaw && cbEnabled
    ? wrapClientWithCircuitBreaker(whatsappRaw, 'whatsapp')
    : whatsappRaw;

  // OpenAI client (optional)
  let openai: OpenAIClient | null = null;
  if (includeOpenAI) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const openaiRaw = openaiApiKey ? createOpenAIClient({ apiKey: openaiApiKey }) : null;
    openai = openaiRaw && cbEnabled
      ? wrapClientWithCircuitBreaker(openaiRaw, 'openai')
      : openaiRaw;
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
    scheduling = schedulingRaw && cbEnabled
      ? wrapClientWithCircuitBreaker(schedulingRaw, 'scheduling')
      : schedulingRaw;
  }

  // Helper to check if required clients are configured
  const isConfigured = (required: Array<'hubspot' | 'whatsapp' | 'openai' | 'scheduling'>): boolean => {
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
      }
    }
    return true;
  };

  // Get circuit breaker stats
  const getCircuitBreakerStats = (): CircuitBreakerStats[] => {
    return integrationCircuitBreakerRegistry.getAllStats();
  };

  // Check if circuit is open
  const isCircuitOpen = (service: 'hubspot' | 'whatsapp' | 'openai' | 'scheduling'): boolean => {
    const breaker = integrationCircuitBreakerRegistry.get(service);
    return breaker.getState() === CircuitState.OPEN;
  };

  // Reset circuit breaker
  const resetCircuit = (service: 'hubspot' | 'whatsapp' | 'openai' | 'scheduling'): void => {
    integrationCircuitBreakerRegistry.reset(service);
  };

  return {
    hubspot,
    whatsapp,
    openai,
    scheduling,
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
