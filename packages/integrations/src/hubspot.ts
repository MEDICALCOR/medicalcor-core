import { withRetry, ExternalServiceError, RateLimitError } from '@medicalcor/core';
import { z } from 'zod';
import type {
  HubSpotContact,
  HubSpotContactInput,
  HubSpotSearchRequest,
  HubSpotSearchResponse,
  HubSpotTask,
} from '@medicalcor/types';

/**
 * Input validation schemas for HubSpot client
 */
const HubSpotClientConfigSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  portalId: z.string().optional(),
  baseUrl: z.string().url().optional(),
  retryConfig: z
    .object({
      maxRetries: z.number().int().min(0).max(10),
      baseDelayMs: z.number().int().min(100).max(30000),
    })
    .optional(),
});

const PhoneSchema = z.string().min(10).max(20);

const SyncContactSchema = z.object({
  phone: PhoneSchema,
  name: z.string().max(256).optional(),
  email: z.string().email().optional(),
  properties: z.record(z.string()).optional(),
});

const TimelineEventInputSchema = z.object({
  contactId: z.string().min(1),
  message: z.string().min(1).max(65535),
  direction: z.enum(['IN', 'OUT']),
  channel: z.enum(['whatsapp', 'voice', 'email', 'web']),
  messageId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const TaskInputSchema = z.object({
  contactId: z.string().min(1),
  subject: z.string().min(1).max(512),
  body: z.string().max(65535).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  dueDate: z.date().optional(),
  ownerId: z.string().optional(),
});

/**
 * HubSpot CRM Integration Client
 * Single source of truth for all CRM operations
 */

export interface HubSpotClientConfig {
  accessToken: string;
  portalId?: string | undefined;
  baseUrl?: string | undefined;
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
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
    // Validate config at construction time
    const validatedConfig = HubSpotClientConfigSchema.parse(config);
    this.config = validatedConfig;
    this.baseUrl = validatedConfig.baseUrl ?? 'https://api.hubapi.com';
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
    // Validate input
    const validated = SyncContactSchema.parse(data);
    const { phone, name, email, properties } = validated;

    // First, search for existing contact by phone
    const existingContacts = await this.searchContactsByPhone(phone);

    if (existingContacts.length > 0) {
      // If multiple found, pick oldest (first created) and optionally merge others
      const primary = existingContacts.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
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
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'phone',
              operator: 'EQ',
              value: phone,
            },
          ],
        },
      ],
      properties: [
        'email',
        'phone',
        'firstname',
        'lastname',
        'lifecyclestage',
        'lead_status',
        'lead_score',
        'lead_source',
        'hs_language',
        'procedure_interest',
        'budget_range',
        'consent_marketing',
      ],
      limit: 10,
    };

    const response = await this.searchContacts(searchRequest);
    return response.results;
  }

  /**
   * Search contacts with custom filters
   * CRITICAL FIX: Supports pagination via 'after' cursor
   */
  async searchContacts(request: HubSpotSearchRequest): Promise<HubSpotSearchResponse> {
    return this.request<HubSpotSearchResponse>('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Search ALL contacts with automatic pagination
   * CRITICAL FIX: Prevents data loss when results exceed single page limit
   *
   * @param request - Search request (limit will be set to 100 per page)
   * @param maxResults - Maximum total results to fetch (default 10000, prevents infinite loops)
   * @returns All matching contacts
   */
  async searchAllContacts(
    request: Omit<HubSpotSearchRequest, 'after'>,
    maxResults = 10000
  ): Promise<HubSpotContact[]> {
    const allContacts: HubSpotContact[] = [];
    let after: string | undefined;

    do {
      const pageRequest: HubSpotSearchRequest = {
        ...request,
        limit: Math.min(request.limit ?? 100, 100), // HubSpot max is 100
        ...(after ? { after } : {}),
      };

      const response = await this.searchContacts(pageRequest);
      allContacts.push(...response.results);

      // Get pagination cursor for next page
      after = response.paging?.next?.after;

      // Safety check to prevent infinite loops
      if (allContacts.length >= maxResults) {
        console.warn(`[HubSpot] Reached maxResults limit (${maxResults}), stopping pagination`);
        break;
      }
    } while (after);

    return allContacts;
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId: string): Promise<HubSpotContact> {
    const properties = [
      'email',
      'phone',
      'firstname',
      'lastname',
      'lifecyclestage',
      'lead_status',
      'lead_score',
      'lead_source',
      'hs_language',
      'procedure_interest',
      'budget_range',
      'consent_marketing',
      'utm_source',
      'utm_medium',
      'utm_campaign',
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
  async updateContact(
    contactId: string,
    properties: Record<string, string | undefined>
  ): Promise<HubSpotContact> {
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
    // Validate input
    const validated = TimelineEventInputSchema.parse(input);
    const { contactId, message, direction, channel, messageId, metadata } = validated;

    // Create a note on the contact (simplified timeline entry)
    await this.request('/crm/v3/objects/notes', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: `[${channel.toUpperCase()}] ${direction}: ${message}${messageId ? ` (ID: ${messageId})` : ''}${metadata?.sentiment && typeof metadata.sentiment === 'string' ? ` [Sentiment: ${metadata.sentiment}]` : ''}`,
        },
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 202, // Note to Contact
              },
            ],
          },
        ],
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
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 194, // Call to Contact
              },
            ],
          },
        ],
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
    // Validate input
    const validated = TaskInputSchema.parse(input);
    const { contactId, subject, body, priority, dueDate, ownerId } = validated;

    const taskData: HubSpotTask = {
      properties: {
        hs_task_subject: subject,
        hs_task_body: body,
        hs_task_status: 'NOT_STARTED',
        hs_task_priority: priority ?? 'MEDIUM',
        hs_timestamp: (dueDate ?? new Date()).toISOString(),
        hubspot_owner_id: ownerId,
      },
      associations: [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 204, // Task to Contact
            },
          ],
        },
      ],
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
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ',
              value: email,
            },
          ],
        },
      ],
      limit: 1,
    });

    return response.results[0] ?? null;
  }

  /**
   * Upsert contact by email (atomic operation - race-condition safe)
   *
   * Uses HubSpot's native upsert API with idProperty to prevent duplicate creation
   * when multiple concurrent requests try to create the same contact.
   *
   * @param email - The email to use as the unique identifier
   * @param properties - Contact properties to set/update
   * @returns The created or updated contact
   */
  async upsertContactByEmail(
    email: string,
    properties: Record<string, string>
  ): Promise<HubSpotContact> {
    // HubSpot's upsert API: POST /crm/v3/objects/contacts with idProperty query param
    // This is atomic - it will either create or update in a single operation
    return this.request<HubSpotContact>('/crm/v3/objects/contacts?idProperty=email', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          email,
          ...properties,
        },
      }),
    });
  }

  /**
   * Upsert contact by phone (atomic operation - race-condition safe)
   *
   * Uses HubSpot's native upsert API with idProperty to prevent duplicate creation
   * when multiple concurrent requests try to create the same contact.
   *
   * @param phone - The phone number to use as the unique identifier
   * @param properties - Contact properties to set/update
   * @returns The created or updated contact
   */
  async upsertContactByPhone(
    phone: string,
    properties: Record<string, string>
  ): Promise<HubSpotContact> {
    return this.request<HubSpotContact>('/crm/v3/objects/contacts?idProperty=phone', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          phone,
          ...properties,
        },
      }),
    });
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
        associations: [
          {
            to: { id: contactId },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 202,
              },
            ],
          },
        ],
      }),
    });
  }

  /**
   * Make HTTP request to HubSpot API
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = 30000; // 30 second timeout

    const makeRequest = async () => {
      let customHeaders: Record<string, string> = {};

      if (options.headers instanceof Headers) {
        customHeaders = Object.fromEntries(options.headers.entries()) as Record<string, string>;
      } else if (Array.isArray(options.headers)) {
        customHeaders = Object.fromEntries(options.headers) as Record<string, string>;
      } else if (options.headers) {
        customHeaders = options.headers as Record<string, string>;
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
            ...customHeaders,
          },
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          // Rate limited - extract retry-after header
          const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
          throw new RateLimitError(retryAfter);
        }

        if (!response.ok) {
          const errorBody = await response.text();
          // Log full error internally (may contain PII) but don't expose in exception
          console.error('[HubSpot] API error:', {
            status: response.status,
            statusText: response.statusText,
            url: path,
            errorBody, // May contain PII - only for internal logs
          });
          // Throw generic error without PII
          throw new ExternalServiceError(
            'HubSpot',
            `Request failed with status ${response.status}`
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('HubSpot', `Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
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

/**
 * Create a configured HubSpot client
 */
export function createHubSpotClient(config: HubSpotClientConfig): HubSpotClient {
  return new HubSpotClient(config);
}
