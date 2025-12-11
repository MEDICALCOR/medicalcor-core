/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                 GOOGLE ADS OFFLINE CONVERSIONS CLIENT                        ║
 * ║                                                                               ║
 * ║  Enterprise-grade client for Google Ads Offline Conversion Import with:      ║
 * ║  - OAuth2 token refresh                                                      ║
 * ║  - SSRF prevention via URL validation                                        ║
 * ║  - SHA-256 hashing for enhanced conversions                                  ║
 * ║  - Retry with exponential backoff                                            ║
 * ║  - PII-safe logging                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { createHash } from 'crypto';
import { withRetry, ExternalServiceError, RateLimitError, createLogger } from '@medicalcor/core';
import type {
  GoogleConversionConfig,
  GoogleClickConversion,
  GoogleCallConversion,
  GoogleConversionUploadRequest,
  GoogleConversionUploadResponse,
  UserData,
} from '@medicalcor/types';
import { GoogleConversionConfigSchema, toGoogleAdsDateTime } from '@medicalcor/types';

const logger = createLogger({ name: 'google-ads-conversions' });

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * SECURITY: Only allow official Google Ads API URL to prevent SSRF attacks
 */
const ALLOWED_GOOGLE_ADS_BASE_URL = 'https://googleads.googleapis.com';

/**
 * Google OAuth2 token endpoint
 */
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Google Ads API timeouts
 */
const GOOGLE_ADS_TIMEOUTS = {
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 60000,
  /** Token refresh timeout */
  TOKEN_TIMEOUT_MS: 10000,
} as const;

/**
 * Google Ads API version
 */
const GOOGLE_ADS_API_VERSION = 'v15';

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

export interface GoogleAdsConversionsClientOptions {
  /** Google Ads customer ID (without hyphens) */
  customerId: string;
  /** Conversion action ID or resource name */
  conversionActionId: string;
  /** Developer token */
  developerToken: string;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** OAuth2 refresh token */
  refreshToken: string;
  /** Login customer ID (for manager accounts) */
  loginCustomerId?: string;
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
 * Normalize and hash email for Google Ads
 */
function normalizeAndHashEmail(email: string): string {
  // Remove leading/trailing whitespace, convert to lowercase
  // Remove dots from gmail.com addresses before @
  let normalized = email.toLowerCase().trim();
  if (normalized.endsWith('@gmail.com')) {
    const parts = normalized.split('@');
    const localPart = parts[0] ?? '';
    const domain = parts[1] ?? 'gmail.com';
    normalized = `${localPart.replace(/\./g, '')}@${domain}`;
  }
  return hashValue(normalized);
}

/**
 * Normalize and hash phone number for Google Ads (E.164 format)
 */
function normalizeAndHashPhone(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');
  // Ensure it starts with + for E.164
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  return hashValue(normalized);
}

/**
 * Build user identifiers array for enhanced conversions
 */
function buildUserIdentifiers(userData: UserData): Array<Record<string, unknown>> {
  const identifiers: Array<Record<string, unknown>> = [];

  if (userData.email) {
    identifiers.push({
      hashedEmail: normalizeAndHashEmail(userData.email),
    });
  }

  if (userData.phone) {
    identifiers.push({
      hashedPhoneNumber: normalizeAndHashPhone(userData.phone),
    });
  }

  if (userData.firstName || userData.lastName || userData.city || userData.state || userData.zipCode || userData.country) {
    const addressInfo: Record<string, string> = {};

    if (userData.firstName) {
      addressInfo.hashedFirstName = hashValue(userData.firstName);
    }
    if (userData.lastName) {
      addressInfo.hashedLastName = hashValue(userData.lastName);
    }
    if (userData.city) {
      addressInfo.city = userData.city.toLowerCase().trim();
    }
    if (userData.state) {
      addressInfo.state = userData.state.toLowerCase().trim();
    }
    if (userData.zipCode) {
      addressInfo.postalCode = userData.zipCode.replace(/[\s-]/g, '').toLowerCase();
    }
    if (userData.country) {
      addressInfo.countryCode = userData.country.toUpperCase();
    }

    if (Object.keys(addressInfo).length > 0) {
      identifiers.push({ addressInfo });
    }
  }

  return identifiers;
}

// =============================================================================
// GOOGLE ADS CONVERSIONS CLIENT
// =============================================================================

/**
 * Google Ads Offline Conversions Client
 *
 * Uploads offline conversion data to Google Ads for attribution.
 *
 * @example
 * ```typescript
 * const client = createGoogleAdsConversionsClient({
 *   customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
 *   conversionActionId: process.env.GOOGLE_ADS_CONVERSION_ACTION_ID!,
 *   developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
 *   clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
 *   clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
 *   refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
 * });
 *
 * await client.uploadClickConversion({
 *   gclid: 'EAIaIQobChMI...',
 *   conversionDateTime: '2024-01-15 14:30:00+00:00',
 *   conversionValue: 15000,
 *   currencyCode: 'EUR',
 * });
 * ```
 */
export class GoogleAdsConversionsClient {
  private readonly config: GoogleConversionConfig;
  private readonly baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(options: GoogleAdsConversionsClientOptions) {
    // Validate config at construction time
    const validatedConfig = GoogleConversionConfigSchema.parse({
      customerId: options.customerId.replace(/-/g, ''),
      conversionActionId: options.conversionActionId,
      developerToken: options.developerToken,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      refreshToken: options.refreshToken,
      loginCustomerId: options.loginCustomerId?.replace(/-/g, ''),
      enabled: true,
    });

    this.config = validatedConfig;
    this.baseUrl = `${ALLOWED_GOOGLE_ADS_BASE_URL}/${GOOGLE_ADS_API_VERSION}`;

    logger.info(
      { customerId: validatedConfig.customerId.slice(0, 4) + '***' },
      'Google Ads Conversions client initialized'
    );
  }

  /**
   * Upload a single click conversion
   */
  async uploadClickConversion(
    conversion: Omit<GoogleClickConversion, 'conversionAction'>
  ): Promise<GoogleConversionUploadResponse> {
    return this.uploadClickConversions([conversion]);
  }

  /**
   * Upload multiple click conversions
   */
  async uploadClickConversions(
    conversions: Array<Omit<GoogleClickConversion, 'conversionAction'>>
  ): Promise<GoogleConversionUploadResponse> {
    if (conversions.length === 0) {
      return { results: [] };
    }

    // Add conversion action to each conversion
    const conversionActionResource = this.getConversionActionResource();
    const clickConversions = conversions.map((c) => ({
      ...c,
      conversionAction: conversionActionResource,
    }));

    const request: GoogleConversionUploadRequest = {
      customerId: this.config.customerId,
      clickConversions,
      partialFailure: true,
      validateOnly: false,
    };

    logger.info(
      {
        conversionCount: conversions.length,
        hasGclids: conversions.every((c) => c.gclid),
      },
      'Uploading click conversions to Google Ads'
    );

    return this.uploadConversions(request);
  }

  /**
   * Upload a single call conversion
   */
  async uploadCallConversion(
    conversion: Omit<GoogleCallConversion, 'conversionAction'>
  ): Promise<GoogleConversionUploadResponse> {
    return this.uploadCallConversions([conversion]);
  }

  /**
   * Upload multiple call conversions
   */
  async uploadCallConversions(
    conversions: Array<Omit<GoogleCallConversion, 'conversionAction'>>
  ): Promise<GoogleConversionUploadResponse> {
    if (conversions.length === 0) {
      return { results: [] };
    }

    const conversionActionResource = this.getConversionActionResource();
    const callConversions = conversions.map((c) => ({
      ...c,
      conversionAction: conversionActionResource,
    }));

    const request: GoogleConversionUploadRequest = {
      customerId: this.config.customerId,
      callConversions,
      partialFailure: true,
      validateOnly: false,
    };

    logger.info(
      {
        conversionCount: conversions.length,
      },
      'Uploading call conversions to Google Ads'
    );

    return this.uploadConversions(request);
  }

  /**
   * Upload click conversion with enhanced matching (user data)
   */
  async uploadEnhancedClickConversion(input: {
    gclid: string;
    conversionDateTime: string;
    conversionValue?: number;
    currencyCode?: string;
    orderId?: string;
    userData: UserData;
    consent?: { adUserData?: 'GRANTED' | 'DENIED'; adPersonalization?: 'GRANTED' | 'DENIED' };
  }): Promise<GoogleConversionUploadResponse> {
    const conversion: Omit<GoogleClickConversion, 'conversionAction'> = {
      gclid: input.gclid,
      conversionDateTime: input.conversionDateTime,
      conversionValue: input.conversionValue,
      currencyCode: input.currencyCode,
      orderId: input.orderId,
      userIdentifiers: buildUserIdentifiers(input.userData),
      consent: input.consent ? {
        adUserData: input.consent.adUserData ?? 'UNSPECIFIED',
        adPersonalization: input.consent.adPersonalization ?? 'UNSPECIFIED',
      } : undefined,
    };

    return this.uploadClickConversions([conversion]);
  }

  /**
   * Create a conversion from a CRM deal won event
   */
  async uploadDealWonConversion(input: {
    gclid: string;
    dealWonAt: Date;
    dealValue?: number;
    currency?: string;
    dealId?: string;
    userData?: UserData;
    timezone?: string;
  }): Promise<GoogleConversionUploadResponse> {
    const conversionDateTime = toGoogleAdsDateTime(
      Math.floor(input.dealWonAt.getTime() / 1000),
      input.timezone ?? '+00:00'
    );

    if (input.userData) {
      return this.uploadEnhancedClickConversion({
        gclid: input.gclid,
        conversionDateTime,
        conversionValue: input.dealValue,
        currencyCode: input.currency,
        orderId: input.dealId,
        userData: input.userData,
      });
    }

    return this.uploadClickConversion({
      gclid: input.gclid,
      conversionDateTime,
      conversionValue: input.dealValue,
      currencyCode: input.currency,
      orderId: input.dealId,
    });
  }

  /**
   * Get the conversion action resource name
   */
  private getConversionActionResource(): string {
    // If already a resource name, return as-is
    if (this.config.conversionActionId.startsWith('customers/')) {
      return this.config.conversionActionId;
    }
    // Otherwise, construct the resource name
    return `customers/${this.config.customerId}/conversionActions/${this.config.conversionActionId}`;
  }

  /**
   * Upload conversions to Google Ads API
   */
  private async uploadConversions(
    request: GoogleConversionUploadRequest
  ): Promise<GoogleConversionUploadResponse> {
    const endpoint = `/customers/${this.config.customerId}/googleAds:uploadClickConversions`;

    // Prepare the request body
    const body = {
      conversions: request.clickConversions ?? request.callConversions,
      partialFailure: request.partialFailure,
      validateOnly: request.validateOnly,
    };

    const response = await this.request<{
      results?: Array<Record<string, unknown>>;
      partialFailureError?: {
        code: number;
        message: string;
        details?: unknown[];
      };
    }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (response.partialFailureError) {
      logger.warn(
        {
          code: response.partialFailureError.code,
          message: response.partialFailureError.message,
        },
        'Google Ads conversion upload partial failure'
      );
    }

    logger.info(
      {
        resultsCount: response.results?.length ?? 0,
        hasErrors: !!response.partialFailureError,
      },
      'Google Ads conversion upload completed'
    );

    return {
      results: response.results?.map((r) => ({
        gclid: r.gclid as string | undefined,
        callerId: r.callerId as string | undefined,
        conversionAction: r.conversionAction as string | undefined,
        conversionDateTime: r.conversionDateTime as string | undefined,
      })),
      partialFailureError: response.partialFailureError,
    };
  }

  /**
   * Refresh OAuth2 access token
   */
  private async refreshAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpiresAt > now + 300000) {
      return this.accessToken;
    }

    logger.debug('Refreshing Google Ads OAuth2 access token');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GOOGLE_ADS_TIMEOUTS.TOKEN_TIMEOUT_MS);

    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new ExternalServiceError('Google', `Token refresh failed: ${errorText}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };

      this.accessToken = data.access_token;
      this.tokenExpiresAt = now + data.expires_in * 1000;

      logger.debug('Google Ads OAuth2 token refreshed successfully');

      return this.accessToken;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('Google', 'Token refresh timeout');
      }
      throw error;
    }
  }

  /**
   * Health check - verify API connectivity
   */
  async healthCheck(): Promise<{ connected: boolean; latencyMs: number }> {
    const startTime = Date.now();

    try {
      // Verify we can get an access token
      await this.refreshAccessToken();

      return {
        connected: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error }, 'Google Ads API health check failed');

      return {
        connected: false,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Make HTTP request to Google Ads API
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
        'Google',
        'Refusing to make request: invalid or unsafe path used in API call.'
      );
    }

    const url = `${this.baseUrl}${path}`;

    // Verify we're only calling Google's API
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== 'googleads.googleapis.com') {
      throw new ExternalServiceError(
        'Google',
        `Refusing to make request to untrusted host: ${parsedUrl.hostname}`
      );
    }

    const accessToken = await this.refreshAccessToken();
    const timeoutMs = GOOGLE_ADS_TIMEOUTS.REQUEST_TIMEOUT_MS;

    const makeRequest = async (): Promise<T> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'developer-token': this.config.developerToken,
        };

        if (this.config.loginCustomerId) {
          headers['login-customer-id'] = this.config.loginCustomerId;
        }

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...headers,
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
            'Google Ads API error'
          );

          throw new ExternalServiceError(
            'Google',
            `Request failed: ${error.error?.message ?? response.statusText}`
          );
        }

        return responseBody as T;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('Google', `Request timeout after ${timeoutMs}ms`);
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
        // Retry on token expiry (will refresh on next attempt)
        if (error instanceof ExternalServiceError && error.message.includes('401')) return true;
        return false;
      },
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a configured Google Ads Conversions client
 */
export function createGoogleAdsConversionsClient(
  options: GoogleAdsConversionsClientOptions
): GoogleAdsConversionsClient {
  return new GoogleAdsConversionsClient(options);
}

/**
 * Get Google Ads credentials from environment variables
 */
export function getGoogleAdsConversionsCredentials(): GoogleAdsConversionsClientOptions | null {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const conversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  if (!customerId || !conversionActionId || !developerToken || !clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return {
    customerId,
    conversionActionId,
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    loginCustomerId,
  };
}

export type { GoogleAdsConversionsClient as GoogleAdsConversionsClientType };
