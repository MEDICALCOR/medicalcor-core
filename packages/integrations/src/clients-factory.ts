/**
 * Shared client factory for Trigger.dev tasks and workflows
 * Eliminates code duplication across handlers
 */

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
 * Configuration for which clients to initialize
 */
export interface ClientsConfig {
  /** Source name for event store (e.g., 'whatsapp-handler', 'cron-jobs') */
  source: string;
  /** Include OpenAI client */
  includeOpenAI?: boolean;
  /** Include scheduling service */
  includeScheduling?: boolean;
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
}

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
  const { includeOpenAI = false, includeScheduling = false } = config;

  // HubSpot client
  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;
  const hubspot = hubspotToken
    ? createHubSpotClient({ accessToken: hubspotToken })
    : null;

  // WhatsApp client
  const whatsappApiKey = process.env.WHATSAPP_API_KEY;
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const whatsapp =
    whatsappApiKey && whatsappPhoneNumberId
      ? createWhatsAppClient({
          apiKey: whatsappApiKey,
          phoneNumberId: whatsappPhoneNumberId,
          ...(webhookSecret && { webhookSecret }),
        })
      : null;

  // OpenAI client (optional)
  let openai: OpenAIClient | null = null;
  if (includeOpenAI) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    openai = openaiApiKey ? createOpenAIClient({ apiKey: openaiApiKey }) : null;
  }

  // Scheduling service (optional)
  let scheduling: SchedulingService | MockSchedulingService | null = null;
  if (includeScheduling) {
    const schedulingApiUrl = process.env.SCHEDULING_SERVICE_URL;
    const schedulingApiKey = process.env.SCHEDULING_SERVICE_TOKEN;
    scheduling =
      schedulingApiUrl && schedulingApiKey
        ? createSchedulingService({ apiUrl: schedulingApiUrl, apiKey: schedulingApiKey })
        : createMockSchedulingService();
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

  return {
    hubspot,
    whatsapp,
    openai,
    scheduling,
    isConfigured,
  };
}

/**
 * Get OpenAI API key from environment
 * Useful for services that need just the key without the full client
 */
export function getOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY;
}
