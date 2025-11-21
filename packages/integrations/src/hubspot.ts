import { withRetry, ExternalServiceError } from '@medicalcor/core';
import type {
  HubSpotContact,
  HubSpotContactInput,
  HubSpotSearchRequest,
  HubSpotSearchResponse,
  HubSpotTask,
} from '@medicalcor/types';

/**
 * HubSpot CRM Integration Client
 * Single source of truth for all CRM operations
 */

export interface HubSpotClientConfig {
  accessToken: string;
  portalId?: string;
  baseUrl?: string;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

export interface TimelineEventInput {
  contactId: string;
  message: string;
  direction: 'IN' | 'OUT';
  channel: 'whatsapp' | 'voice' | 'email' | 'web';
  messageId?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskInput {
  contactId: string;
  subject: string;
  body?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: Date;
  ownerId?: string;
}

export class HubSpotClient {
  private config: HubSpotClientConfig;
  private baseUrl: string;

  constructor(config: HubSpotClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://api.hubapi.com';
  }

  /**
   * Sync contact by phone (upsert with deduplication)
   */
  async syncContact(data: {
    phone: string;
    name?: string;
    email?: string;
    properties?: Record<string, string>;
  }): Promise<HubSpotContact> {
    const { phone, name, email, properties } = data;

    // First, search for existing contact by phone
    const existingContacts = await this.searchContactsByPhone(phone);

    if (existingContacts.length > 0) {
      // If multiple found, pick oldest (first created) and optionally merge others
      const primary = existingContacts.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )[0];

      if (!primary) {
        throw new ExternalServiceError('HubSpot', 'No primary contact found after search');
      }

      // Update existing contact
      return this.updateContact(primary.id, {
        ...properties,
        ...(name && !primary.properties.firstname ? { firstname: name } : {}),
        ...(email && !primary.properties.email ? { email } : {}),
      });
    }

    // Create new contact
    return this.createContact({
      properties: {
        phone,
        ...(name ? { firstname: name } : {}),
        ...(email ? { email } : {}),
        ...properties,
      },
    });
  }

  /**
   * Search contacts by phone number
   */
  async searchContactsByPhone(phone: string): Promise<HubSpotContact[]> {
    const searchRequest: HubSpotSearchRequest = {
      filterGroups: [{
        filters: [{
          propertyName: 'phone',
          operator: 'EQ',
          value: phone,
        }],
      }],
      properties: [
        'email', 'phone', 'firstname', 'lastname', 'lifecyclestage',
        'lead_status', 'lead_score', 'lead_source', 'hs_language',
        'procedure_interest', 'budget_range', 'consent_marketing',
      ],
      limit: 10,
    };

    const response = await this.searchContacts(searchRequest);
    return response.results;
  }

  /**
   * Search contacts with custom filters
   */
  async searchContacts(request: HubSpotSearchRequest): Promise<HubSpotSearchResponse> {
    return this.request<HubSpotSearchResponse>('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId: string): Promise<HubSpotContact> {
    const properties = [
      'email', 'phone', 'firstname', 'lastname', 'lifecyclestage',
      'lead_status', 'lead_score', 'lead_source', 'hs_language',
      'procedure_interest', 'budget_range', 'consent_marketing',
      'utm_source', 'utm_medium', 'utm_campaign',
    ].join(',');

    return this.request<HubSpotContact>(
      `/crm/v3/objects/contacts/${contactId}?properties=${properties}`
    );
  }

  /**
   * Create a new contact
   */
  async createContact(input: HubSpotContactInput): Promise<HubSpotContact> {
    return this.request<HubSpotContact>('/crm/v3/objects/contacts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Update contact properties
   */
  async updateContact(contactId: string, properties: Record<string, string | undefined>): Promise<HubSpotContact> {
    // Filter out undefined values
    const cleanProperties = Object.fromEntries(
      Object.entries(properties).filter(([, v]) => v !== undefined)
    ) as Record<string, string>;

    return this.request<HubSpotContact>(`/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: cleanProperties }),
    });
  }

  /**
   * Log message to contact timeline
   */
  async logMessageToTimeline(input: TimelineEventInput): Promise<void> {
    const { contactId, message, direction, channel, messageId, metadata } = input;

    // Create a note on the contact (simplified timeline entry)
    await this.request('/crm/v3/objects/notes', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: `[${channel.toUpperCase()}] ${direction}: ${message}${messageId ? ` (ID: ${messageId})` : ''}${metadata?.sentiment && typeof metadata.sentiment === 'string' ? ` [Sentiment: ${metadata.sentiment}]` : ''}`,
        },
        associations: [{
          to: { id: contactId },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 202, // Note to Contact
          }],
        }],
      }),
    });
  }

  /**
   * Log call to contact timeline
   */
  async logCallToTimeline(input: {
    contactId: string;
    callSid: string;
    duration: number;
    transcript?: string;
    sentiment?: string;
  }): Promise<void> {
    const { contactId, callSid, duration, transcript, sentiment } = input;

    // Create a call record
    await this.request('/crm/v3/objects/calls', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_call_body: transcript ?? 'Call transcript not available',
          hs_call_duration: duration.toString(),
          hs_call_direction: 'INBOUND',
          hs_call_status: 'COMPLETED',
          // Custom property for call SID
          hs_call_external_id: callSid,
        },
        associations: [{
          to: { id: contactId },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 194, // Call to Contact
          }],
        }],
      }),
    });

    // Update contact with sentiment if available
    if (sentiment) {
      await this.updateContact(contactId, {
        last_call_sentiment: sentiment,
      });
    }
  }

  /**
   * Create a task associated with a contact
   */
  async createTask(input: TaskInput): Promise<HubSpotTask> {
    const { contactId, subject, body, priority, dueDate, ownerId } = input;

    const taskData: HubSpotTask = {
      properties: {
        hs_task_subject: subject,
        hs_task_body: body,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: priority ?? 'MEDIUM',
        hs_timestamp: (dueDate ?? new Date()).toISOString(),
        hubspot_owner_id: ownerId,
      },
      associations: [{
        to: { id: contactId },
        types: [{
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 204, // Task to Contact
        }],
      }],
    };

    return this.request<HubSpotTask>('/crm/v3/objects/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
  }

  /**
   * Find contact by email
   */
  async findContactByEmail(email: string): Promise<HubSpotContact | null> {
    const response = await this.searchContacts({
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'EQ',
          value: email,
        }],
      }],
      limit: 1,
    });

    return response.results[0] ?? null;
  }

  /**
   * Log payment to timeline
   */
  async logPaymentToTimeline(input: {
    contactId: string;
    paymentId: string;
    amount: number;
    currency: string;
    status: string;
  }): Promise<void> {
    const { contactId, paymentId, amount, currency, status } = input;

    await this.request('/crm/v3/objects/notes', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: `Payment ${status}: ${(amount / 100).toFixed(2)} ${currency.toUpperCase()} (ID: ${paymentId})`,
        },
        associations: [{
          to: { id: contactId },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 202,
          }],
        }],
      }),
    });
  }

  /**
   * Make HTTP request to HubSpot API
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const makeRequest = async () => {
      let customHeaders: Record<string, string> = {};

      if (options.headers instanceof Headers) {
        customHeaders = Object.fromEntries(options.headers.entries()) as Record<string, string>;
      } else if (Array.isArray(options.headers)) {
        customHeaders = Object.fromEntries(options.headers) as Record<string, string>;
      } else if (options.headers) {
        customHeaders = options.headers as Record<string, string>;
      }

      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          ...customHeaders,
        },
      });

      if (response.status === 429) {
        // Rate limited - extract retry-after header
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
        throw new RateLimitError(retryAfter);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ExternalServiceError('HubSpot', `${response.status}: ${errorBody}`);
      }

      return response.json() as Promise<T>;
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof RateLimitError) return true;
        if (error instanceof ExternalServiceError && error.message.includes('502')) return true;
        if (error instanceof ExternalServiceError && error.message.includes('503')) return true;
        return false;
      },
    });
  }
}

class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter} seconds`);
    this.name = 'RateLimitError';
  }
}

/**
 * Create a configured HubSpot client
 */
export function createHubSpotClient(config: HubSpotClientConfig): HubSpotClient {
  return new HubSpotClient(config);
}
