/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    UNIFIED ADS CONVERSION SERVICE                            ║
 * ║                                                                               ║
 * ║  Orchestrates offline conversion tracking across multiple ad platforms:      ║
 * ║  - Facebook Conversions API (CAPI)                                           ║
 * ║  - Google Ads Offline Conversions                                            ║
 * ║                                                                               ║
 * ║  Features:                                                                    ║
 * ║  - Multi-platform dispatch with parallel execution                           ║
 * ║  - Automatic click ID detection (gclid, fbclid)                              ║
 * ║  - Deduplication via event IDs                                               ║
 * ║  - Error handling with partial success support                               ║
 * ║  - Comprehensive audit logging                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { createLogger } from '@medicalcor/core';
import type {
  AdsPlatform,
  AdsConversionWorkflowPayload,
  AdsConversionWorkflowResult,
  ConversionEvent,
  UserData,
} from '@medicalcor/types';
import {
  generateConversionEventId,
  mapDealStatusToConversionEvent,
} from '@medicalcor/types';
import {
  FacebookConversionsClient,
  createFacebookConversionsClient,
  getFacebookConversionsCredentials,
} from './facebook-conversions.js';
import {
  GoogleAdsConversionsClient,
  createGoogleAdsConversionsClient,
  getGoogleAdsConversionsCredentials,
} from './google-ads-conversions.js';

const logger = createLogger({ name: 'ads-conversion-service' });

// =============================================================================
// TYPES
// =============================================================================

export interface AdsConversionServiceOptions {
  /** Facebook configuration (optional - can be loaded from env) */
  facebook?: {
    pixelId: string;
    accessToken: string;
    testEventCode?: string;
  };
  /** Google Ads configuration (optional - can be loaded from env) */
  google?: {
    customerId: string;
    conversionActionId: string;
    developerToken: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    loginCustomerId?: string;
  };
  /** Default currency for conversions */
  defaultCurrency?: string;
  /** Default timezone for Google Ads datetime formatting */
  defaultTimezone?: string;
}

export interface ConversionInput {
  /** Source CRM and entity information */
  source: {
    crm: 'pipedrive' | 'hubspot' | 'salesforce';
    entityType: 'deal' | 'contact' | 'lead' | 'opportunity';
    entityId: string;
    eventType: 'deal_won' | 'deal_stage_changed' | 'contact_created' | 'lead_qualified';
  };
  /** User data for matching */
  userData: UserData;
  /** Conversion value */
  value?: number;
  /** Currency code */
  currency?: string;
  /** Event timestamp */
  eventTime: Date;
  /** Platforms to send conversion to (auto-detected if not specified) */
  platforms?: AdsPlatform[];
  /** Custom event name */
  customEventName?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
}

export interface PlatformResult {
  platform: AdsPlatform;
  success: boolean;
  eventId: string;
  eventsMatched?: number;
  error?: string;
  retryable?: boolean;
}

export interface ConversionResult {
  success: boolean;
  platformResults: PlatformResult[];
  eventIds: string[];
  errors: string[];
}

// =============================================================================
// ADS CONVERSION SERVICE
// =============================================================================

/**
 * Unified Ads Conversion Service
 *
 * Sends offline conversion events to multiple ad platforms (Facebook, Google Ads).
 * Automatically detects which platforms to send to based on click IDs (gclid, fbclid).
 *
 * @example
 * ```typescript
 * const service = createAdsConversionService();
 *
 * const result = await service.trackConversion({
 *   source: {
 *     crm: 'pipedrive',
 *     entityType: 'deal',
 *     entityId: '12345',
 *     eventType: 'deal_won',
 *   },
 *   userData: {
 *     email: 'patient@example.com',
 *     phone: '+40700000001',
 *     gclid: 'EAIaIQobChMI...',
 *     fbclid: 'fb.1.123456789...',
 *   },
 *   value: 15000,
 *   currency: 'EUR',
 *   eventTime: new Date(),
 * });
 *
 * if (result.success) {
 *   console.log('Conversions sent:', result.eventIds);
 * }
 * ```
 */
export class AdsConversionService {
  private readonly facebookClient: FacebookConversionsClient | null;
  private readonly googleClient: GoogleAdsConversionsClient | null;
  private readonly defaultCurrency: string;
  private readonly defaultTimezone: string;

  constructor(options: AdsConversionServiceOptions = {}) {
    // Initialize Facebook client
    if (options.facebook) {
      this.facebookClient = createFacebookConversionsClient(options.facebook);
    } else {
      const fbCredentials = getFacebookConversionsCredentials();
      this.facebookClient = fbCredentials ? createFacebookConversionsClient(fbCredentials) : null;
    }

    // Initialize Google Ads client
    if (options.google) {
      this.googleClient = createGoogleAdsConversionsClient(options.google);
    } else {
      const googleCredentials = getGoogleAdsConversionsCredentials();
      this.googleClient = googleCredentials ? createGoogleAdsConversionsClient(googleCredentials) : null;
    }

    this.defaultCurrency = options.defaultCurrency ?? 'EUR';
    this.defaultTimezone = options.defaultTimezone ?? '+00:00';

    logger.info(
      {
        facebookEnabled: !!this.facebookClient,
        googleEnabled: !!this.googleClient,
      },
      'Ads Conversion Service initialized'
    );
  }

  /**
   * Track a conversion across configured ad platforms
   */
  async trackConversion(input: ConversionInput): Promise<ConversionResult> {
    const correlationId = input.correlationId ?? crypto.randomUUID();

    logger.info(
      {
        correlationId,
        source: input.source,
        hasGclid: !!input.userData.gclid,
        hasFbclid: !!input.userData.fbclid,
        value: input.value,
      },
      'Processing conversion'
    );

    // Determine which platforms to send to
    const platforms = this.determinePlatforms(input);

    if (platforms.length === 0) {
      logger.warn(
        { correlationId, source: input.source },
        'No platforms configured or no click IDs available'
      );

      return {
        success: false,
        platformResults: [],
        eventIds: [],
        errors: ['No platforms available for conversion tracking'],
      };
    }

    // Send to each platform in parallel
    const results = await Promise.all(
      platforms.map((platform) => this.sendToPlatform(platform, input, correlationId))
    );

    const successfulResults = results.filter((r) => r.success);
    const errors = results.filter((r) => !r.success).map((r) => r.error ?? 'Unknown error');

    const result: ConversionResult = {
      success: successfulResults.length > 0,
      platformResults: results,
      eventIds: results.map((r) => r.eventId),
      errors,
    };

    logger.info(
      {
        correlationId,
        success: result.success,
        successfulPlatforms: successfulResults.map((r) => r.platform),
        failedPlatforms: results.filter((r) => !r.success).map((r) => r.platform),
      },
      'Conversion processing completed'
    );

    return result;
  }

  /**
   * Process a conversion workflow payload (from Trigger.dev)
   */
  async processWorkflowPayload(payload: AdsConversionWorkflowPayload): Promise<AdsConversionWorkflowResult> {
    const input: ConversionInput = {
      source: payload.source,
      userData: payload.userData,
      value: payload.value,
      currency: payload.currency,
      eventTime: new Date(payload.eventTime),
      platforms: payload.platforms,
      customEventName: payload.customEventName,
      correlationId: payload.correlationId,
    };

    const result = await this.trackConversion(input);

    return {
      success: result.success,
      platformResults: result.platformResults,
      eventIds: result.eventIds,
      errors: result.errors,
    };
  }

  /**
   * Check which platforms are configured and available
   */
  getAvailablePlatforms(): AdsPlatform[] {
    const platforms: AdsPlatform[] = [];
    if (this.facebookClient) platforms.push('facebook');
    if (this.googleClient) platforms.push('google');
    return platforms;
  }

  /**
   * Health check for all configured platforms
   */
  async healthCheck(): Promise<Record<AdsPlatform, { connected: boolean; latencyMs: number } | null>> {
    const results: Record<AdsPlatform, { connected: boolean; latencyMs: number } | null> = {
      facebook: null,
      google: null,
      tiktok: null,
      linkedin: null,
    };

    if (this.facebookClient) {
      results.facebook = await this.facebookClient.healthCheck();
    }

    if (this.googleClient) {
      results.google = await this.googleClient.healthCheck();
    }

    return results;
  }

  /**
   * Determine which platforms to send conversion to
   */
  private determinePlatforms(input: ConversionInput): AdsPlatform[] {
    // If platforms explicitly specified, use those (filtered by availability)
    if (input.platforms && input.platforms.length > 0) {
      return input.platforms.filter((p) => {
        if (p === 'facebook') return !!this.facebookClient;
        if (p === 'google') return !!this.googleClient;
        return false;
      });
    }

    // Auto-detect based on click IDs
    const platforms: AdsPlatform[] = [];

    // Send to Facebook if fbclid is present or email/phone available for matching
    if (this.facebookClient) {
      if (
        input.userData.fbclid ||
        input.userData.fbc ||
        input.userData.fbp ||
        input.userData.email ||
        input.userData.phone
      ) {
        platforms.push('facebook');
      }
    }

    // Send to Google if gclid is present
    if (this.googleClient && input.userData.gclid) {
      platforms.push('google');
    }

    return platforms;
  }

  /**
   * Send conversion to a specific platform
   */
  private async sendToPlatform(
    platform: AdsPlatform,
    input: ConversionInput,
    correlationId: string
  ): Promise<PlatformResult> {
    const eventName = input.source.eventType === 'deal_won' ? 'Purchase' : 'Lead';
    const eventId = generateConversionEventId(input.source, platform, eventName);

    try {
      switch (platform) {
        case 'facebook':
          return await this.sendToFacebook(input, eventId, correlationId);
        case 'google':
          return await this.sendToGoogle(input, eventId, correlationId);
        case 'tiktok':
          return {
            platform,
            success: false,
            eventId,
            error: 'TikTok platform not yet implemented',
            retryable: false,
          };
        case 'linkedin':
          return {
            platform,
            success: false,
            eventId,
            error: 'LinkedIn platform not yet implemented',
            retryable: false,
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        {
          correlationId,
          platform,
          eventId,
          error: errorMessage,
        },
        'Failed to send conversion to platform'
      );

      return {
        platform,
        success: false,
        eventId,
        error: errorMessage,
        retryable: this.isRetryableError(error),
      };
    }
  }

  /**
   * Send conversion to Facebook Conversions API
   */
  private async sendToFacebook(
    input: ConversionInput,
    eventId: string,
    correlationId: string
  ): Promise<PlatformResult> {
    if (!this.facebookClient) {
      return {
        platform: 'facebook',
        success: false,
        eventId,
        error: 'Facebook client not configured',
        retryable: false,
      };
    }

    const eventName = mapDealStatusToConversionEvent(
      input.source.eventType === 'deal_won' ? 'won' : 'open'
    );

    const event: ConversionEvent = {
      eventId,
      eventName,
      customEventName: input.customEventName,
      eventTime: Math.floor(input.eventTime.getTime() / 1000),
      actionSource: 'system_generated',
      userData: input.userData,
      customData: {
        value: input.value,
        currency: input.currency ?? this.defaultCurrency,
        orderId: input.source.entityId,
        leadId: input.source.entityType === 'lead' ? input.source.entityId : undefined,
        dealId: input.source.entityType === 'deal' ? input.source.entityId : undefined,
      },
    };

    const response = await this.facebookClient.sendEvent(event);

    logger.info(
      {
        correlationId,
        platform: 'facebook',
        eventId,
        eventsReceived: response.eventsReceived,
        eventsMatched: response.eventsMatched,
      },
      'Facebook conversion sent'
    );

    return {
      platform: 'facebook',
      success: response.eventsReceived > 0,
      eventId,
      eventsMatched: response.eventsMatched,
      error: response.error?.message,
      retryable: !!response.error,
    };
  }

  /**
   * Send conversion to Google Ads
   */
  private async sendToGoogle(
    input: ConversionInput,
    eventId: string,
    correlationId: string
  ): Promise<PlatformResult> {
    if (!this.googleClient) {
      return {
        platform: 'google',
        success: false,
        eventId,
        error: 'Google Ads client not configured',
        retryable: false,
      };
    }

    if (!input.userData.gclid) {
      return {
        platform: 'google',
        success: false,
        eventId,
        error: 'No gclid available for Google Ads conversion',
        retryable: false,
      };
    }

    const response = await this.googleClient.uploadDealWonConversion({
      gclid: input.userData.gclid,
      dealWonAt: input.eventTime,
      dealValue: input.value,
      currency: input.currency ?? this.defaultCurrency,
      dealId: input.source.entityId,
      userData: input.userData,
      timezone: this.defaultTimezone,
    });

    const success = !response.partialFailureError && (response.results?.length ?? 0) > 0;

    logger.info(
      {
        correlationId,
        platform: 'google',
        eventId,
        resultsCount: response.results?.length ?? 0,
        hasError: !!response.partialFailureError,
      },
      'Google Ads conversion sent'
    );

    return {
      platform: 'google',
      success,
      eventId,
      error: response.partialFailureError?.message,
      retryable: !!response.partialFailureError,
    };
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('rate limit') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
      );
    }
    return false;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an Ads Conversion Service with optional configuration
 */
export function createAdsConversionService(
  options?: AdsConversionServiceOptions
): AdsConversionService {
  return new AdsConversionService(options);
}

/**
 * Create an Ads Conversion Service from environment variables
 */
export function createAdsConversionServiceFromEnv(): AdsConversionService {
  return new AdsConversionService({
    defaultCurrency: process.env.ADS_DEFAULT_CURRENCY ?? 'EUR',
    defaultTimezone: process.env.ADS_DEFAULT_TIMEZONE ?? '+00:00',
  });
}

export type { AdsConversionService as AdsConversionServiceType };
