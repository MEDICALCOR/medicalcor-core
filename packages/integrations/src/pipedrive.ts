/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                         PIPEDRIVE CRM CLIENT                                  ║
 * ║                                                                               ║
 * ║  Platinum-standard Pipedrive API v1 client with enterprise-grade resilience, ║
 * ║  SSRF prevention, rate limiting, and comprehensive observability.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { withRetry, ExternalServiceError, RateLimitError, createLogger } from '@medicalcor/core';
import { z } from 'zod';
import type {
  PipedrivePerson,
  PipedriveCreatePersonInput,
  PipedriveUpdatePersonInput,
  PipedriveDeal,
  PipedriveCreateDealInput,
  PipedriveUpdateDealInput,
  PipedriveActivity,
  PipedriveCreateActivityInput,
  PipedriveUpdateActivityInput,
  PipedriveNote,
  PipedriveCreateNoteInput,
  PipedrivePipeline,
  PipedriveStage,
  PipedriveUser,
  PipedriveHealthStatus,
  PipedriveClientConfig,
} from '@medicalcor/types';
import {
  PipedriveClientConfigSchema,
  PipedrivePersonSchema,
  PipedriveDealSchema,
  PipedriveActivitySchema,
  PipedriveNoteSchema,
  PipedrivePipelineSchema,
  PipedriveStageSchema,
  PipedriveUserSchema,
} from '@medicalcor/types';

const logger = createLogger({ name: 'pipedrive' });

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * SECURITY: Only allow official Pipedrive API URL to prevent SSRF attacks
 */
const ALLOWED_PIPEDRIVE_BASE_URL = 'https://api.pipedrive.com';

/**
 * Pipedrive API timeouts
 */
const PIPEDRIVE_TIMEOUTS = {
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 30000,
} as const;

/**
 * Pipedrive pagination limits
 */
const PIPEDRIVE_LIMITS = {
  /** Maximum results per page (Pipedrive API limit) */
  MAX_PAGE_SIZE: 500,
  /** Default page size */
  DEFAULT_PAGE_SIZE: 100,
  /** Default maximum results to fetch in paginated calls */
  DEFAULT_MAX_RESULTS: 10000,
} as const;

// =============================================================================
// INPUT VALIDATION SCHEMAS
// =============================================================================

const PhoneSchema = z.string().min(5).max(30);

const SearchPersonSchema = z.object({
  term: z.string().min(1).max(512),
  fields: z.enum(['phone', 'email', 'name', 'custom_fields']).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  start: z.number().int().min(0).optional(),
});

const CreateNoteInputSchema = z.object({
  content: z.string().min(1).max(65535),
  personId: z.number().int().positive().optional(),
  dealId: z.number().int().positive().optional(),
  orgId: z.number().int().positive().optional(),
});

const CreateActivityInputSchema = z.object({
  subject: z.string().min(1).max(512),
  type: z.string().optional(),
  personId: z.number().int().positive().optional(),
  dealId: z.number().int().positive().optional(),
  dueDate: z.date().optional(),
  dueTime: z.string().optional(),
  duration: z.string().optional(),
  note: z.string().max(65535).optional(),
  done: z.boolean().optional(),
});

// =============================================================================
// PIPEDRIVE API RESPONSE TYPES
// =============================================================================

interface PipedriveApiResponse<T> {
  success: boolean;
  data: T | null;
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
      next_start?: number;
    };
  };
  error?: string;
  error_info?: string;
}

interface PipedriveSearchResponse {
  success: boolean;
  data: {
    items: {
      result_score: number;
      item: {
        id: number;
        type: string;
        name?: string;
        phone?: { value: string }[];
        email?: { value: string }[];
      };
    }[];
  };
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
    };
  };
}

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

export interface PipedriveClientOptions {
  apiToken: string;
  companyDomain?: string;
  baseUrl?: string;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

// =============================================================================
// PIPEDRIVE CLIENT
// =============================================================================

/**
 * Pipedrive CRM Integration Client
 *
 * Enterprise-grade client for Pipedrive API v1 with:
 * - SSRF prevention via URL validation
 * - Automatic retry with exponential backoff
 * - Rate limit handling with Retry-After header support
 * - Request timeout management
 * - Comprehensive error handling
 * - PII-safe logging
 *
 * @example
 * ```typescript
 * const client = createPipedriveClient({
 *   apiToken: process.env.PIPEDRIVE_API_TOKEN!,
 *   companyDomain: 'medicalcor',
 * });
 *
 * // Search for a contact by phone
 * const person = await client.findPersonByPhone('+40700000001');
 *
 * // Create a deal
 * const deal = await client.createDeal({
 *   title: 'All-on-X Treatment',
 *   value: 15000,
 *   currency: 'EUR',
 *   person_id: person.id,
 * });
 * ```
 */
export class PipedriveClient {
  private readonly config: PipedriveClientConfig;
  private readonly baseUrl: string;

  constructor(options: PipedriveClientOptions) {
    // SECURITY: Validate config at construction time including SSRF prevention
    const validatedConfig = PipedriveClientConfigSchema.parse(options);
    this.config = validatedConfig;

    // Always use the official Pipedrive API URL (validated by schema)
    this.baseUrl = validatedConfig.baseUrl ?? ALLOWED_PIPEDRIVE_BASE_URL;

    logger.info(
      { companyDomain: validatedConfig.companyDomain },
      'Pipedrive client initialized with validated configuration'
    );
  }

  // ===========================================================================
  // PERSON (CONTACT) OPERATIONS
  // ===========================================================================

  /**
   * Get person by ID
   */
  async getPerson(personId: number): Promise<PipedrivePerson | null> {
    const response = await this.request<PipedriveApiResponse<PipedrivePerson>>(
      `/v1/persons/${personId}`
    );

    if (!response.success || !response.data) {
      return null;
    }

    return PipedrivePersonSchema.parse(response.data);
  }

  /**
   * Find person by phone number
   */
  async findPersonByPhone(phone: string): Promise<PipedrivePerson | null> {
    // Validate phone
    PhoneSchema.parse(phone);

    const response = await this.request<PipedriveSearchResponse>(
      `/v1/persons/search?term=${encodeURIComponent(phone)}&fields=phone&limit=1`
    );

    if (!response.success || !response.data?.items?.length) {
      return null;
    }

    const personId = response.data.items[0]?.item?.id;
    if (!personId) return null;

    return this.getPerson(personId);
  }

  /**
   * Find person by email
   */
  async findPersonByEmail(email: string): Promise<PipedrivePerson | null> {
    const response = await this.request<PipedriveSearchResponse>(
      `/v1/persons/search?term=${encodeURIComponent(email)}&fields=email&limit=1`
    );

    if (!response.success || !response.data?.items?.length) {
      return null;
    }

    const personId = response.data.items[0]?.item?.id;
    if (!personId) return null;

    return this.getPerson(personId);
  }

  /**
   * Search persons with custom query
   */
  async searchPersons(params: {
    term: string;
    fields?: 'phone' | 'email' | 'name' | 'custom_fields';
    limit?: number;
    start?: number;
  }): Promise<PipedrivePerson[]> {
    const validated = SearchPersonSchema.parse(params);
    const queryParams = new URLSearchParams({
      term: validated.term,
      ...(validated.fields && { fields: validated.fields }),
      limit: String(validated.limit ?? PIPEDRIVE_LIMITS.DEFAULT_PAGE_SIZE),
      ...(validated.start !== undefined && { start: String(validated.start) }),
    });

    const response = await this.request<PipedriveSearchResponse>(
      `/v1/persons/search?${queryParams.toString()}`
    );

    if (!response.success || !response.data?.items?.length) {
      return [];
    }

    // Fetch full person details for each result
    const persons = await Promise.all(
      response.data.items.map((item) => this.getPerson(item.item.id))
    );

    return persons.filter((p): p is PipedrivePerson => p !== null);
  }

  /**
   * Create a new person
   */
  async createPerson(input: PipedriveCreatePersonInput): Promise<PipedrivePerson> {
    const response = await this.request<PipedriveApiResponse<PipedrivePerson>>('/v1/persons', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!response.success || !response.data) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to create person: ${response.error ?? 'Unknown error'}`
      );
    }

    return PipedrivePersonSchema.parse(response.data);
  }

  /**
   * Update an existing person
   */
  async updatePerson(
    personId: number,
    input: PipedriveUpdatePersonInput
  ): Promise<PipedrivePerson> {
    const response = await this.request<PipedriveApiResponse<PipedrivePerson>>(
      `/v1/persons/${personId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );

    if (!response.success || !response.data) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to update person: ${response.error ?? 'Unknown error'}`
      );
    }

    return PipedrivePersonSchema.parse(response.data);
  }

  /**
   * Delete a person
   */
  async deletePerson(personId: number): Promise<void> {
    const response = await this.request<PipedriveApiResponse<{ id: number }>>(
      `/v1/persons/${personId}`,
      { method: 'DELETE' }
    );

    if (!response.success) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to delete person: ${response.error ?? 'Unknown error'}`
      );
    }
  }

  /**
   * Upsert person by phone (atomic-like operation)
   * Creates if not found, updates if exists
   */
  async upsertPersonByPhone(
    phone: string,
    data: Omit<PipedriveCreatePersonInput, 'phone'>
  ): Promise<PipedrivePerson> {
    const existing = await this.findPersonByPhone(phone);

    if (existing) {
      return this.updatePerson(existing.id, data);
    }

    // Type assertion needed due to Zod passthrough() interaction with spread
    return this.createPerson({
      ...data,
      phone: [phone],
    } as PipedriveCreatePersonInput);
  }

  // ===========================================================================
  // DEAL OPERATIONS
  // ===========================================================================

  /**
   * Get deal by ID
   */
  async getDeal(dealId: number): Promise<PipedriveDeal | null> {
    const response = await this.request<PipedriveApiResponse<PipedriveDeal>>(`/v1/deals/${dealId}`);

    if (!response.success || !response.data) {
      return null;
    }

    return PipedriveDealSchema.parse(response.data);
  }

  /**
   * Find deals for a person
   */
  async findDealsByPerson(personId: number): Promise<PipedriveDeal[]> {
    const response = await this.request<PipedriveApiResponse<PipedriveDeal[]>>(
      `/v1/persons/${personId}/deals?limit=${PIPEDRIVE_LIMITS.DEFAULT_PAGE_SIZE}`
    );

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((deal) => PipedriveDealSchema.parse(deal));
  }

  /**
   * Create a new deal
   */
  async createDeal(input: PipedriveCreateDealInput): Promise<PipedriveDeal> {
    const response = await this.request<PipedriveApiResponse<PipedriveDeal>>('/v1/deals', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (!response.success || !response.data) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to create deal: ${response.error ?? 'Unknown error'}`
      );
    }

    return PipedriveDealSchema.parse(response.data);
  }

  /**
   * Update a deal
   */
  async updateDeal(dealId: number, input: PipedriveUpdateDealInput): Promise<PipedriveDeal> {
    const response = await this.request<PipedriveApiResponse<PipedriveDeal>>(
      `/v1/deals/${dealId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );

    if (!response.success || !response.data) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to update deal: ${response.error ?? 'Unknown error'}`
      );
    }

    return PipedriveDealSchema.parse(response.data);
  }

  /**
   * Update deal stage
   */
  async updateDealStage(dealId: number, stageId: number): Promise<PipedriveDeal> {
    return this.updateDeal(dealId, { stage_id: stageId });
  }

  /**
   * Mark deal as won
   */
  async markDealWon(dealId: number): Promise<PipedriveDeal> {
    return this.updateDeal(dealId, { status: 'won' });
  }

  /**
   * Mark deal as lost
   */
  async markDealLost(dealId: number, lostReason?: string): Promise<PipedriveDeal> {
    const response = await this.request<PipedriveApiResponse<PipedriveDeal>>(
      `/v1/deals/${dealId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          status: 'lost',
          ...(lostReason && { lost_reason: lostReason }),
        }),
      }
    );

    if (!response.success || !response.data) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to mark deal as lost: ${response.error ?? 'Unknown error'}`
      );
    }

    return PipedriveDealSchema.parse(response.data);
  }

  /**
   * Delete a deal
   */
  async deleteDeal(dealId: number): Promise<void> {
    const response = await this.request<PipedriveApiResponse<{ id: number }>>(
      `/v1/deals/${dealId}`,
      { method: 'DELETE' }
    );

    if (!response.success) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to delete deal: ${response.error ?? 'Unknown error'}`
      );
    }
  }

  // ===========================================================================
  // ACTIVITY (TASK) OPERATIONS
  // ===========================================================================

  /**
   * Get activity by ID
   */
  async getActivity(activityId: number): Promise<PipedriveActivity | null> {
    const response = await this.request<PipedriveApiResponse<PipedriveActivity>>(
      `/v1/activities/${activityId}`
    );

    if (!response.success || !response.data) {
      return null;
    }

    return PipedriveActivitySchema.parse(response.data);
  }

  /**
   * Create an activity (task)
   */
  async createActivity(input: {
    subject: string;
    type?: string;
    personId?: number;
    dealId?: number;
    dueDate?: Date;
    dueTime?: string;
    duration?: string;
    note?: string;
    done?: boolean;
  }): Promise<PipedriveActivity> {
    const validated = CreateActivityInputSchema.parse(input);

    const activityInput: PipedriveCreateActivityInput = {
      subject: validated.subject,
      type: validated.type ?? 'task',
      person_id: validated.personId,
      deal_id: validated.dealId,
      due_date: validated.dueDate?.toISOString().split('T')[0],
      due_time: validated.dueTime,
      duration: validated.duration,
      note: validated.note,
      done: validated.done ?? false,
    };

    const response = await this.request<PipedriveApiResponse<PipedriveActivity>>('/v1/activities', {
      method: 'POST',
      body: JSON.stringify(activityInput),
    });

    if (!response.success || !response.data) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to create activity: ${response.error ?? 'Unknown error'}`
      );
    }

    return PipedriveActivitySchema.parse(response.data);
  }

  /**
   * Update an activity
   */
  async updateActivity(
    activityId: number,
    input: PipedriveUpdateActivityInput
  ): Promise<PipedriveActivity> {
    const response = await this.request<PipedriveApiResponse<PipedriveActivity>>(
      `/v1/activities/${activityId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      }
    );

    if (!response.success || !response.data) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to update activity: ${response.error ?? 'Unknown error'}`
      );
    }

    return PipedriveActivitySchema.parse(response.data);
  }

  /**
   * Mark activity as done
   */
  async completeActivity(activityId: number): Promise<PipedriveActivity> {
    return this.updateActivity(activityId, { done: true });
  }

  /**
   * Get pending activities for a person
   */
  async getPendingActivitiesForPerson(personId: number): Promise<PipedriveActivity[]> {
    const response = await this.request<PipedriveApiResponse<PipedriveActivity[]>>(
      `/v1/persons/${personId}/activities?done=0&limit=${PIPEDRIVE_LIMITS.DEFAULT_PAGE_SIZE}`
    );

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((activity) => PipedriveActivitySchema.parse(activity));
  }

  /**
   * Delete an activity
   */
  async deleteActivity(activityId: number): Promise<void> {
    const response = await this.request<PipedriveApiResponse<{ id: number }>>(
      `/v1/activities/${activityId}`,
      { method: 'DELETE' }
    );

    if (!response.success) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to delete activity: ${response.error ?? 'Unknown error'}`
      );
    }
  }

  // ===========================================================================
  // NOTE OPERATIONS
  // ===========================================================================

  /**
   * Create a note
   */
  async createNote(input: {
    content: string;
    personId?: number;
    dealId?: number;
    orgId?: number;
  }): Promise<PipedriveNote> {
    const validated = CreateNoteInputSchema.parse(input);

    const noteInput: PipedriveCreateNoteInput = {
      content: validated.content,
      person_id: validated.personId,
      deal_id: validated.dealId,
      org_id: validated.orgId,
    };

    const response = await this.request<PipedriveApiResponse<PipedriveNote>>('/v1/notes', {
      method: 'POST',
      body: JSON.stringify(noteInput),
    });

    if (!response.success || !response.data) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Failed to create note: ${response.error ?? 'Unknown error'}`
      );
    }

    return PipedriveNoteSchema.parse(response.data);
  }

  /**
   * Get notes for a person
   */
  async getNotesForPerson(personId: number, limit = 50): Promise<PipedriveNote[]> {
    const response = await this.request<PipedriveApiResponse<PipedriveNote[]>>(
      `/v1/notes?person_id=${personId}&limit=${Math.min(limit, PIPEDRIVE_LIMITS.MAX_PAGE_SIZE)}`
    );

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((note) => PipedriveNoteSchema.parse(note));
  }

  /**
   * Get notes for a deal
   */
  async getNotesForDeal(dealId: number, limit = 50): Promise<PipedriveNote[]> {
    const response = await this.request<PipedriveApiResponse<PipedriveNote[]>>(
      `/v1/notes?deal_id=${dealId}&limit=${Math.min(limit, PIPEDRIVE_LIMITS.MAX_PAGE_SIZE)}`
    );

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((note) => PipedriveNoteSchema.parse(note));
  }

  // ===========================================================================
  // PIPELINE & STAGE OPERATIONS
  // ===========================================================================

  /**
   * Get all pipelines
   */
  async getPipelines(): Promise<PipedrivePipeline[]> {
    const response = await this.request<PipedriveApiResponse<PipedrivePipeline[]>>('/v1/pipelines');

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((pipeline) => PipedrivePipelineSchema.parse(pipeline));
  }

  /**
   * Get pipeline by ID
   */
  async getPipeline(pipelineId: number): Promise<PipedrivePipeline | null> {
    const response = await this.request<PipedriveApiResponse<PipedrivePipeline>>(
      `/v1/pipelines/${pipelineId}`
    );

    if (!response.success || !response.data) {
      return null;
    }

    return PipedrivePipelineSchema.parse(response.data);
  }

  /**
   * Get stages for a pipeline
   */
  async getStages(pipelineId: number): Promise<PipedriveStage[]> {
    const response = await this.request<PipedriveApiResponse<PipedriveStage[]>>(
      `/v1/stages?pipeline_id=${pipelineId}`
    );

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((stage) => PipedriveStageSchema.parse(stage));
  }

  /**
   * Get stage by ID
   */
  async getStage(stageId: number): Promise<PipedriveStage | null> {
    const response = await this.request<PipedriveApiResponse<PipedriveStage>>(
      `/v1/stages/${stageId}`
    );

    if (!response.success || !response.data) {
      return null;
    }

    return PipedriveStageSchema.parse(response.data);
  }

  // ===========================================================================
  // USER (OWNER) OPERATIONS
  // ===========================================================================

  /**
   * Get all users
   */
  async getUsers(): Promise<PipedriveUser[]> {
    const response = await this.request<PipedriveApiResponse<PipedriveUser[]>>('/v1/users');

    if (!response.success || !response.data) {
      return [];
    }

    return response.data.map((user) => PipedriveUserSchema.parse(user));
  }

  /**
   * Get user by ID
   */
  async getUser(userId: number): Promise<PipedriveUser | null> {
    const response = await this.request<PipedriveApiResponse<PipedriveUser>>(`/v1/users/${userId}`);

    if (!response.success || !response.data) {
      return null;
    }

    return PipedriveUserSchema.parse(response.data);
  }

  /**
   * Get current user (authenticated user)
   */
  async getCurrentUser(): Promise<PipedriveUser | null> {
    const response = await this.request<PipedriveApiResponse<PipedriveUser>>('/v1/users/me');

    if (!response.success || !response.data) {
      return null;
    }

    return PipedriveUserSchema.parse(response.data);
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Check Pipedrive API health and connection status
   */
  async healthCheck(): Promise<PipedriveHealthStatus> {
    const startTime = Date.now();

    try {
      const user = await this.getCurrentUser();
      const latencyMs = Date.now() - startTime;

      return {
        connected: user !== null,
        latencyMs,
        apiVersion: 'v1',
        companyId: undefined, // Would need additional API call
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      logger.error({ error, latencyMs }, 'Pipedrive health check failed');

      return {
        connected: false,
        latencyMs,
        apiVersion: 'v1',
      };
    }
  }

  // ===========================================================================
  // PRIVATE: HTTP REQUEST HANDLER
  // ===========================================================================

  /**
   * Make HTTP request to Pipedrive API
   * CRITICAL: Validate that path/baseUrl do not allow SSRF or unexpected host
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // Only allow known, safe paths. Not absolute URLs, no traversal, must start with "/"
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.includes('://') ||
      path.includes('..')
    ) {
      throw new ExternalServiceError(
        'Pipedrive',
        'Refusing to make request: invalid or unsafe path used in API call.'
      );
    }

    const url = `${this.baseUrl}${path}`;

    // Ensure only requests to the official Pipedrive API host are performed
    const parsedUrl = new URL(url);
    if (
      parsedUrl.hostname !== 'api.pipedrive.com' &&
      !parsedUrl.hostname.endsWith('.pipedrive.com')
    ) {
      throw new ExternalServiceError(
        'Pipedrive',
        `Refusing to make request to untrusted host: ${parsedUrl.hostname}`
      );
    }

    // Append API token to URL
    const separator = url.includes('?') ? '&' : '?';
    const authenticatedUrl = `${url}${separator}api_token=${this.config.apiToken}`;

    const timeoutMs = PIPEDRIVE_TIMEOUTS.REQUEST_TIMEOUT_MS;

    const makeRequest = async (): Promise<T> => {
      let customHeaders: Record<string, string> = {};

      if (options.headers instanceof Headers) {
        customHeaders = Object.fromEntries(options.headers.entries());
      } else if (Array.isArray(options.headers)) {
        customHeaders = Object.fromEntries(options.headers as [string, string][]);
      } else if (options.headers) {
        customHeaders = options.headers as Record<string, string>;
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(authenticatedUrl, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
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
          logger.error(
            {
              status: response.status,
              statusText: response.statusText,
              url: path, // Log path, not full URL with token
              errorBody, // May contain PII - only for internal logs
            },
            'Pipedrive API error'
          );
          // Throw generic error without PII
          throw new ExternalServiceError(
            'Pipedrive',
            `Request failed with status ${response.status}`
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('Pipedrive', `Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error: unknown) => {
        if (error instanceof RateLimitError) return true;
        if (error instanceof ExternalServiceError && error.message.includes('502')) return true;
        if (error instanceof ExternalServiceError && error.message.includes('503')) return true;
        if (error instanceof ExternalServiceError && error.message.includes('504')) return true;
        return false;
      },
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a configured Pipedrive client
 *
 * @example
 * ```typescript
 * const client = createPipedriveClient({
 *   apiToken: process.env.PIPEDRIVE_API_TOKEN!,
 *   companyDomain: 'medicalcor',
 * });
 * ```
 */
export function createPipedriveClient(options: PipedriveClientOptions): PipedriveClient {
  return new PipedriveClient(options);
}

/**
 * Get Pipedrive credentials from environment variables
 *
 * @throws Error if required environment variables are not set
 */
export function getPipedriveCredentials(): PipedriveClientOptions {
  const apiToken = process.env.PIPEDRIVE_API_TOKEN;
  const companyDomain = process.env.PIPEDRIVE_COMPANY_DOMAIN;

  if (!apiToken) {
    throw new Error('PIPEDRIVE_API_TOKEN environment variable is required');
  }

  return {
    apiToken,
    companyDomain: companyDomain ?? 'medicalcor',
  };
}
