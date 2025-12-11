/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    FACEBOOK CONVERSIONS API CLIENT                           ║
 * ║                                                                               ║
 * ║  Enterprise-grade client for Facebook Conversions API (CAPI) with:           ║
 * ║  - SSRF prevention via URL validation                                        ║
 * ║  - Automatic SHA-256 hashing of user data                                    ║
 * ║  - Retry with exponential backoff                                            ║
 * ║  - Rate limit handling                                                       ║
 * ║  - PII-safe logging                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { createHash } from 'crypto';
import { withRetry, ExternalServiceError, RateLimitError, createLogger } from '@medicalcor/core';
import type {
  FacebookConversionConfig,
  FacebookConversionResponse,
  UserData,
  ConversionEvent,
} from '@medicalcor/types';
import { FacebookConversionConfigSchema } from '@medicalcor/types';

const logger = createLogger({ name: 'facebook-conversions' });

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * SECURITY: Only allow official Facebook Graph API URL to prevent SSRF attacks
 */
const ALLOWED_FACEBOOK_BASE_URL = 'https://graph.facebook.com';

/**
 * Facebook API timeouts
 */
const FACEBOOK_TIMEOUTS = {
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 30000,
} as const;

/**
 * Facebook API limits
 */
const FACEBOOK_LIMITS = {
  /** Maximum events per batch */
  MAX_BATCH_SIZE: 1000,
} as const;

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

export interface FacebookConversionsClientOptions {
  /** Facebook Pixel ID */
  pixelId: string;
  /** Facebook Access Token */
  accessToken: string;
  /** API version (default: v18.0) */
  apiVersion?: string;
  /** Test event code (for testing without affecting production data) */
  testEventCode?: string;
  /** Retry configuration */
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

// =============================================================================
// HASHING UTILITIES
// =============================================================================

/**
 * SHA-256 hash a value (lowercase, trimmed)
 */
function hashValue(value: string): string {
  return createHash('sha256')
    .update(value.toLowerCase().trim())
    .digest('hex');
}

/**
 * Normalize and hash email
 */
function normalizeAndHashEmail(email: string): string {
  // Remove leading/trailing whitespace, convert to lowercase
  const normalized = email.toLowerCase().trim();
  return hashValue(normalized);
}

/**
 * Normalize and hash phone number (E.164 without + prefix)
 */
function normalizeAndHashPhone(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');
  // Remove leading + if present
  if (normalized.startsWith('+')) {
    normalized = normalized.slice(1);
  }
  return hashValue(normalized);
}

/**
 * Hash user data for Facebook Conversions API
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 */
function hashUserData(userData: UserData): Record<string, string | string[]> {
  const hashed: Record<string, string | string[]> = {};

  if (userData.email) {
    hashed.em = [normalizeAndHashEmail(userData.email)];
  }
  if (userData.phone) {
    hashed.ph = [normalizeAndHashPhone(userData.phone)];
  }
  if (userData.firstName) {
    hashed.fn = hashValue(userData.firstName);
  }
  if (userData.lastName) {
    hashed.ln = hashValue(userData.lastName);
  }
  if (userData.city) {
    hashed.ct = hashValue(userData.city);
  }
  if (userData.state) {
    hashed.st = hashValue(userData.state);
  }
  if (userData.country) {
    // Country code is not hashed per Facebook docs
    hashed.country = userData.country.toLowerCase();
  }
  if (userData.zipCode) {
    // Remove spaces and dashes, lowercase
    const normalized = userData.zipCode.replace(/[\s-]/g, '').toLowerCase();
    hashed.zp = hashValue(normalized);
  }
  if (userData.externalId) {
    hashed.external_id = [hashValue(userData.externalId)];
  }

  // Click IDs are not hashed
  if (userData.fbclid) {
    hashed.fbc = userData.fbclid;
  }
  if (userData.fbp) {
    hashed.fbp = userData.fbp;
  }
  if (userData.fbc) {
    hashed.fbc = userData.fbc;
  }

  // Client information (not hashed)
  if (userData.userAgent) {
    hashed.client_user_agent = userData.userAgent;
  }
  if (userData.ipAddress) {
    hashed.client_ip_address = userData.ipAddress;
  }

  return hashed;
}

// =============================================================================
// FACEBOOK CONVERSIONS CLIENT
// =============================================================================

/**
 * Facebook Conversions API Client
 *
 * Sends offline and server-side events to Facebook for attribution.
 *
 * @example
 * ```typescript
 * const client = createFacebookConversionsClient({
 *   pixelId: process.env.FACEBOOK_PIXEL_ID!,
 *   accessToken: process.env.FACEBOOK_ACCESS_TOKEN!,
 * });
 *
 * await client.sendEvent({
 *   eventId: 'deal_123_purchase',
 *   eventName: 'Purchase',
 *   eventTime: Math.floor(Date.now() / 1000),
 *   actionSource: 'system_generated',
 *   userData: {
 *     email: 'user@example.com',
 *     phone: '+40700000001',
 *   },
 *   customData: {
 *     value: 15000,
 *     currency: 'EUR',
 *   },
 * });
 * ```
 */
export class FacebookConversionsClient {
  private readonly config: FacebookConversionConfig;
  private readonly baseUrl: string;

  constructor(options: FacebookConversionsClientOptions) {
    // Validate config at construction time
    const validatedConfig = FacebookConversionConfigSchema.parse({
      pixelId: options.pixelId,
      accessToken: options.accessToken,
      apiVersion: options.apiVersion ?? 'v18.0',
      testEventCode: options.testEventCode,
      enabled: true,
    });

    this.config = validatedConfig;
    this.baseUrl = `${ALLOWED_FACEBOOK_BASE_URL}/${validatedConfig.apiVersion}`;

    logger.info(
      { pixelId: validatedConfig.pixelId.slice(0, 4) + '***' },
      'Facebook Conversions client initialized'
    );
  }

  /**
   * Send a single conversion event
   */
  async sendEvent(event: ConversionEvent): Promise<FacebookConversionResponse> {
    return this.sendEvents([event]);
  }

  /**
   * Send multiple conversion events in a batch
   */
  async sendEvents(events: ConversionEvent[]): Promise<FacebookConversionResponse> {
    if (events.length === 0) {
      return { eventsReceived: 0 };
    }

    if (events.length > FACEBOOK_LIMITS.MAX_BATCH_SIZE) {
      throw new ExternalServiceError(
        'Facebook',
        `Batch size ${events.length} exceeds maximum of ${FACEBOOK_LIMITS.MAX_BATCH_SIZE}`
      );
    }

    // Transform events to Facebook format
    const facebookEvents = events.map((event) => this.transformEvent(event));

    const payload = {
      data: facebookEvents,
      ...(this.config.testEventCode && { test_event_code: this.config.testEventCode }),
    };

    logger.info(
      {
        eventCount: events.length,
        eventTypes: [...new Set(events.map((e) => e.eventName))],
        testMode: !!this.config.testEventCode,
      },
      'Sending events to Facebook Conversions API'
    );

    const response = await this.request<FacebookConversionResponse>(
      `/${this.config.pixelId}/events`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    logger.info(
      {
        eventsReceived: response.eventsReceived,
        eventsMatched: response.eventsMatched,
      },
      'Facebook Conversions API response'
    );

    return response;
  }

  /**
   * Transform a generic conversion event to Facebook format
   */
  private transformEvent(event: ConversionEvent): Record<string, unknown> {
    const facebookEvent: Record<string, unknown> = {
      event_name: event.eventName === 'CustomEvent' ? event.customEventName : event.eventName,
      event_time: event.eventTime,
      event_id: event.eventId,
      action_source: event.actionSource,
      user_data: hashUserData(event.userData),
    };

    if (event.eventSourceUrl) {
      facebookEvent.event_source_url = event.eventSourceUrl;
    }

    if (event.customData) {
      const customData: Record<string, unknown> = {};

      if (event.customData.value !== undefined) {
        customData.value = event.customData.value;
      }
      if (event.customData.currency) {
        customData.currency = event.customData.currency;
      }
      if (event.customData.contentIds) {
        customData.content_ids = event.customData.contentIds;
      }
      if (event.customData.contentType) {
        customData.content_type = event.customData.contentType;
      }
      if (event.customData.contentName) {
        customData.content_name = event.customData.contentName;
      }
      if (event.customData.contentCategory) {
        customData.content_category = event.customData.contentCategory;
      }
      if (event.customData.numItems !== undefined) {
        customData.num_items = event.customData.numItems;
      }
      if (event.customData.orderId) {
        customData.order_id = event.customData.orderId;
      }
      if (event.customData.searchString) {
        customData.search_string = event.customData.searchString;
      }
      if (event.customData.status) {
        customData.status = event.customData.status;
      }
      if (event.customData.predictedLtv !== undefined) {
        customData.predicted_ltv = event.customData.predictedLtv;
      }

      if (Object.keys(customData).length > 0) {
        facebookEvent.custom_data = customData;
      }
    }

    if (event.optOut) {
      facebookEvent.opt_out = event.optOut;
    }

    if (event.dataProcessingOptions) {
      facebookEvent.data_processing_options = event.dataProcessingOptions;
      if (event.dataProcessingOptionsCountry !== undefined) {
        facebookEvent.data_processing_options_country = event.dataProcessingOptionsCountry;
      }
      if (event.dataProcessingOptionsState !== undefined) {
        facebookEvent.data_processing_options_state = event.dataProcessingOptionsState;
      }
    }

    return facebookEvent;
  }

  /**
   * Health check - verify API connectivity
   */
  async healthCheck(): Promise<{ connected: boolean; latencyMs: number }> {
    const startTime = Date.now();

    try {
      // Use a simple pixel lookup to verify connectivity
      await this.request<{ id: string }>(`/${this.config.pixelId}`, {
        method: 'GET',
      });

      return {
        connected: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error }, 'Facebook Conversions API health check failed');

      return {
        connected: false,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Make HTTP request to Facebook Graph API
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // SECURITY: Validate path
    if (
      typeof path !== 'string' ||
      !path.startsWith('/') ||
      path.includes('://') ||
      path.includes('..')
    ) {
      throw new ExternalServiceError(
        'Facebook',
        'Refusing to make request: invalid or unsafe path used in API call.'
      );
    }

    const url = `${this.baseUrl}${path}`;

    // Verify we're only calling Facebook's API
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== 'graph.facebook.com') {
      throw new ExternalServiceError(
        'Facebook',
        `Refusing to make request to untrusted host: ${parsedUrl.hostname}`
      );
    }

    const timeoutMs = FACEBOOK_TIMEOUTS.REQUEST_TIMEOUT_MS;

    const makeRequest = async (): Promise<T> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.accessToken}`,
            ...(options.headers as Record<string, string>),
          },
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60', 10);
          throw new RateLimitError(retryAfter);
        }

        const responseBody = await response.json();

        if (!response.ok) {
          const error = responseBody as { error?: { message?: string; code?: number } };
          logger.error(
            {
              status: response.status,
              errorCode: error.error?.code,
              path,
            },
            'Facebook API error'
          );

          throw new ExternalServiceError(
            'Facebook',
            `Request failed: ${error.error?.message ?? response.statusText}`
          );
        }

        return responseBody as T;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('Facebook', `Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
    };

    return withRetry(makeRequest, {
      maxRetries: 3,
      baseDelayMs: 1000,
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
 * Create a configured Facebook Conversions API client
 */
export function createFacebookConversionsClient(
  options: FacebookConversionsClientOptions
): FacebookConversionsClient {
  return new FacebookConversionsClient(options);
}

/**
 * Get Facebook credentials from environment variables
 */
export function getFacebookConversionsCredentials(): FacebookConversionsClientOptions | null {
  const pixelId = process.env.FACEBOOK_PIXEL_ID;
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const testEventCode = process.env.FACEBOOK_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    return null;
  }

  return {
    pixelId,
    accessToken,
    testEventCode,
  };
}

export type { FacebookConversionsClient as FacebookConversionsClientType };
