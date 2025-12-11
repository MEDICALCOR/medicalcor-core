/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    ADS CONVERSION TRACKING SCHEMAS                           ║
 * ║                                                                               ║
 * ║  Schemas for offline conversion tracking with Facebook Conversions API       ║
 * ║  and Google Ads Offline Conversion Import. Enables closed-loop attribution   ║
 * ║  from CRM events (Pipedrive deal won) back to ad platforms.                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { z } from 'zod';

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * Supported ads platforms for conversion tracking
 */
export const AdsPlatformSchema = z.enum(['facebook', 'google', 'tiktok', 'linkedin']);
export type AdsPlatform = z.infer<typeof AdsPlatformSchema>;

/**
 * Conversion event types
 */
export const ConversionEventTypeSchema = z.enum([
  'Lead',
  'Purchase',
  'CompleteRegistration',
  'Schedule',
  'Contact',
  'ViewContent',
  'InitiateCheckout',
  'AddToCart',
  'Subscribe',
  'CustomEvent',
]);
export type ConversionEventType = z.infer<typeof ConversionEventTypeSchema>;

/**
 * Conversion status
 */
export const ConversionStatusSchema = z.enum([
  'pending',
  'sent',
  'failed',
  'retrying',
  'duplicate',
]);
export type ConversionStatus = z.infer<typeof ConversionStatusSchema>;

/**
 * User data for matching (hashed for privacy)
 */
export const UserDataSchema = z.object({
  /** Email address (will be hashed before sending) */
  email: z.string().email().optional(),
  /** Phone number in E.164 format (will be hashed before sending) */
  phone: z.string().optional(),
  /** First name (will be hashed before sending) */
  firstName: z.string().optional(),
  /** Last name (will be hashed before sending) */
  lastName: z.string().optional(),
  /** City (will be hashed before sending) */
  city: z.string().optional(),
  /** State/Province (will be hashed before sending) */
  state: z.string().optional(),
  /** Country code (2-letter ISO) */
  country: z.string().length(2).optional(),
  /** Zip/Postal code (will be hashed before sending) */
  zipCode: z.string().optional(),
  /** External ID from CRM (will be hashed before sending) */
  externalId: z.string().optional(),
  /** Facebook Click ID (fbclid) - not hashed */
  fbclid: z.string().optional(),
  /** Facebook Browser ID (fbp) - not hashed */
  fbp: z.string().optional(),
  /** Facebook Login ID (fbc) - not hashed */
  fbc: z.string().optional(),
  /** Google Click ID (gclid) - not hashed */
  gclid: z.string().optional(),
  /** Google Analytics Client ID */
  gaClientId: z.string().optional(),
  /** User Agent */
  userAgent: z.string().optional(),
  /** IP Address (for geo matching) */
  ipAddress: z.string().optional(),
});
export type UserData = z.infer<typeof UserDataSchema>;

// =============================================================================
// CONVERSION EVENT
// =============================================================================

/**
 * Base conversion event schema
 */
export const ConversionEventSchema = z.object({
  /** Unique event ID for deduplication */
  eventId: z.string().min(1),
  /** Event name/type */
  eventName: ConversionEventTypeSchema,
  /** Custom event name (when eventName is 'CustomEvent') */
  customEventName: z.string().optional(),
  /** Event timestamp (Unix timestamp in seconds) */
  eventTime: z.number().int().positive(),
  /** Event source URL */
  eventSourceUrl: z.string().url().optional(),
  /** Action source (where the event occurred) */
  actionSource: z.enum(['website', 'app', 'phone_call', 'chat', 'email', 'other', 'system_generated']),
  /** User data for matching */
  userData: UserDataSchema,
  /** Custom data (conversion value, currency, content info) */
  customData: z.object({
    /** Conversion value in major currency units */
    value: z.number().nonnegative().optional(),
    /** Currency code (ISO 4217) */
    currency: z.string().length(3).optional(),
    /** Content IDs (product/service IDs) */
    contentIds: z.array(z.string()).optional(),
    /** Content type */
    contentType: z.string().optional(),
    /** Content name */
    contentName: z.string().optional(),
    /** Content category */
    contentCategory: z.string().optional(),
    /** Number of items */
    numItems: z.number().int().nonnegative().optional(),
    /** Order ID */
    orderId: z.string().optional(),
    /** Search query string */
    searchString: z.string().optional(),
    /** Status (e.g., 'qualified', 'converted') */
    status: z.string().optional(),
    /** Lead ID from CRM */
    leadId: z.string().optional(),
    /** Deal ID from CRM */
    dealId: z.string().optional(),
    /** Predicted LTV */
    predictedLtv: z.number().nonnegative().optional(),
  }).optional(),
  /** Opt-out flag (for users who opted out of tracking) */
  optOut: z.boolean().optional(),
  /** Data processing options for privacy compliance */
  dataProcessingOptions: z.array(z.string()).optional(),
  /** Data processing country */
  dataProcessingOptionsCountry: z.number().int().optional(),
  /** Data processing state */
  dataProcessingOptionsState: z.number().int().optional(),
});
export type ConversionEvent = z.infer<typeof ConversionEventSchema>;

// =============================================================================
// FACEBOOK CONVERSIONS API
// =============================================================================

/**
 * Facebook Conversions API event schema
 * @see https://developers.facebook.com/docs/marketing-api/conversions-api/parameters
 */
export const FacebookConversionEventSchema = ConversionEventSchema.extend({
  /** Facebook Pixel ID */
  pixelId: z.string().min(1),
  /** Test event code (for testing without affecting production data) */
  testEventCode: z.string().optional(),
});
export type FacebookConversionEvent = z.infer<typeof FacebookConversionEventSchema>;

/**
 * Facebook Conversions API batch request
 */
export const FacebookConversionBatchSchema = z.object({
  /** Access token for API authentication */
  accessToken: z.string().min(1),
  /** Array of events to send */
  data: z.array(FacebookConversionEventSchema).min(1).max(1000),
  /** Test event code (applies to all events in batch) */
  testEventCode: z.string().optional(),
  /** Partner agent (for agencies) */
  partnerAgent: z.string().optional(),
});
export type FacebookConversionBatch = z.infer<typeof FacebookConversionBatchSchema>;

/**
 * Facebook Conversions API response
 */
export const FacebookConversionResponseSchema = z.object({
  /** Number of events received */
  eventsReceived: z.number().int().nonnegative(),
  /** Number of events matched to Facebook users */
  eventsMatched: z.number().int().nonnegative().optional(),
  /** Response messages */
  messages: z.array(z.string()).optional(),
  /** Facebook trace ID */
  fbTraceId: z.string().optional(),
  /** Error details if any */
  error: z.object({
    message: z.string(),
    type: z.string(),
    code: z.number(),
    errorSubcode: z.number().optional(),
    fbTraceId: z.string().optional(),
  }).optional(),
});
export type FacebookConversionResponse = z.infer<typeof FacebookConversionResponseSchema>;

// =============================================================================
// GOOGLE ADS OFFLINE CONVERSIONS
// =============================================================================

/**
 * Google Ads conversion action type
 */
export const GoogleConversionActionTypeSchema = z.enum([
  'UPLOAD_CLICKS',
  'UPLOAD_CALLS',
  'STORE_SALES_DIRECT_UPLOAD',
  'STORE_SALES_UPLOAD_WITH_ENHANCED_MATCH',
]);
export type GoogleConversionActionType = z.infer<typeof GoogleConversionActionTypeSchema>;

/**
 * Google Ads click conversion schema
 * @see https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
 */
export const GoogleClickConversionSchema = z.object({
  /** Google Click ID (gclid) */
  gclid: z.string().min(1),
  /** Conversion action resource name */
  conversionAction: z.string().min(1),
  /** Conversion date time (in format: yyyy-mm-dd hh:mm:ss+|-hh:mm) */
  conversionDateTime: z.string(),
  /** Conversion value */
  conversionValue: z.number().nonnegative().optional(),
  /** Currency code (ISO 4217) */
  currencyCode: z.string().length(3).optional(),
  /** Order ID for deduplication */
  orderId: z.string().optional(),
  /** External attribution data */
  externalAttributionData: z.object({
    externalAttributionCredit: z.number().min(0).max(1).optional(),
    externalAttributionModel: z.string().optional(),
  }).optional(),
  /** Custom variables */
  customVariables: z.array(z.object({
    conversionCustomVariable: z.string(),
    value: z.string(),
  })).optional(),
  /** Consent for ads personalization */
  consent: z.object({
    adUserData: z.enum(['GRANTED', 'DENIED', 'UNSPECIFIED']).optional(),
    adPersonalization: z.enum(['GRANTED', 'DENIED', 'UNSPECIFIED']).optional(),
  }).optional(),
  /** User identifiers for enhanced conversions */
  userIdentifiers: z.array(z.object({
    hashedEmail: z.string().optional(),
    hashedPhoneNumber: z.string().optional(),
    addressInfo: z.object({
      hashedFirstName: z.string().optional(),
      hashedLastName: z.string().optional(),
      hashedStreetAddress: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      countryCode: z.string().optional(),
    }).optional(),
  })).optional(),
});
export type GoogleClickConversion = z.infer<typeof GoogleClickConversionSchema>;

/**
 * Google Ads call conversion schema
 * @see https://developers.google.com/google-ads/api/docs/conversions/upload-calls
 */
export const GoogleCallConversionSchema = z.object({
  /** Caller ID (phone number that made the call) */
  callerId: z.string().min(1),
  /** Call start date time */
  callStartDateTime: z.string(),
  /** Conversion action resource name */
  conversionAction: z.string().min(1),
  /** Conversion date time */
  conversionDateTime: z.string(),
  /** Conversion value */
  conversionValue: z.number().nonnegative().optional(),
  /** Currency code (ISO 4217) */
  currencyCode: z.string().length(3).optional(),
  /** Consent */
  consent: z.object({
    adUserData: z.enum(['GRANTED', 'DENIED', 'UNSPECIFIED']).optional(),
    adPersonalization: z.enum(['GRANTED', 'DENIED', 'UNSPECIFIED']).optional(),
  }).optional(),
});
export type GoogleCallConversion = z.infer<typeof GoogleCallConversionSchema>;

/**
 * Google Ads offline conversion upload request
 */
export const GoogleConversionUploadRequestSchema = z.object({
  /** Google Ads customer ID (without hyphens) */
  customerId: z.string().min(1),
  /** Click conversions to upload */
  clickConversions: z.array(GoogleClickConversionSchema).optional(),
  /** Call conversions to upload */
  callConversions: z.array(GoogleCallConversionSchema).optional(),
  /** Partial failure enabled (continue on partial errors) */
  partialFailure: z.boolean().default(true),
  /** Validate only (don't actually upload) */
  validateOnly: z.boolean().default(false),
});
export type GoogleConversionUploadRequest = z.infer<typeof GoogleConversionUploadRequestSchema>;

/**
 * Google Ads conversion upload response
 */
export const GoogleConversionUploadResponseSchema = z.object({
  /** Results for each conversion */
  results: z.array(z.object({
    gclid: z.string().optional(),
    callerId: z.string().optional(),
    conversionAction: z.string().optional(),
    conversionDateTime: z.string().optional(),
  })).optional(),
  /** Partial failure errors */
  partialFailureError: z.object({
    code: z.number(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }).optional(),
});
export type GoogleConversionUploadResponse = z.infer<typeof GoogleConversionUploadResponseSchema>;

// =============================================================================
// CONVERSION TRACKING RECORD
// =============================================================================

/**
 * Conversion tracking record (stored in database for deduplication and audit)
 */
export const ConversionTrackingRecordSchema = z.object({
  /** Unique record ID */
  id: z.string().uuid(),
  /** Platform the conversion was sent to */
  platform: AdsPlatformSchema,
  /** Event ID for deduplication */
  eventId: z.string(),
  /** Event name/type */
  eventName: z.string(),
  /** Source CRM and entity type */
  source: z.object({
    crm: z.enum(['pipedrive', 'hubspot', 'salesforce']),
    entityType: z.enum(['deal', 'contact', 'lead', 'opportunity']),
    entityId: z.string(),
  }),
  /** Click ID (gclid, fbclid, etc.) */
  clickId: z.string().optional(),
  /** Click ID type */
  clickIdType: z.enum(['gclid', 'fbclid', 'ttclid', 'li_fat_id']).optional(),
  /** Conversion value */
  value: z.number().nonnegative().optional(),
  /** Currency */
  currency: z.string().length(3).optional(),
  /** Event timestamp */
  eventTime: z.date(),
  /** Status */
  status: ConversionStatusSchema,
  /** Number of retry attempts */
  retryCount: z.number().int().nonnegative().default(0),
  /** Last error message */
  lastError: z.string().optional(),
  /** Platform response */
  platformResponse: z.unknown().optional(),
  /** Created timestamp */
  createdAt: z.date(),
  /** Updated timestamp */
  updatedAt: z.date(),
});
export type ConversionTrackingRecord = z.infer<typeof ConversionTrackingRecordSchema>;

// =============================================================================
// CONVERSION SERVICE CONFIG
// =============================================================================

/**
 * Facebook Conversions API configuration
 */
export const FacebookConversionConfigSchema = z.object({
  /** Facebook Pixel ID */
  pixelId: z.string().min(1),
  /** Facebook Access Token */
  accessToken: z.string().min(1),
  /** Test event code (for testing) */
  testEventCode: z.string().optional(),
  /** API version */
  apiVersion: z.string().default('v18.0'),
  /** Enable or disable */
  enabled: z.boolean().default(true),
});
export type FacebookConversionConfig = z.infer<typeof FacebookConversionConfigSchema>;

/**
 * Google Ads Offline Conversion configuration
 */
export const GoogleConversionConfigSchema = z.object({
  /** Google Ads customer ID (without hyphens) */
  customerId: z.string().min(1),
  /** Conversion action ID or resource name */
  conversionActionId: z.string().min(1),
  /** Developer token */
  developerToken: z.string().min(1),
  /** OAuth2 client ID */
  clientId: z.string().min(1),
  /** OAuth2 client secret */
  clientSecret: z.string().min(1),
  /** OAuth2 refresh token */
  refreshToken: z.string().min(1),
  /** Login customer ID (for manager accounts) */
  loginCustomerId: z.string().optional(),
  /** Enable or disable */
  enabled: z.boolean().default(true),
});
export type GoogleConversionConfig = z.infer<typeof GoogleConversionConfigSchema>;

/**
 * Unified ads conversion service configuration
 */
export const AdsConversionConfigSchema = z.object({
  /** Facebook Conversions API config */
  facebook: FacebookConversionConfigSchema.optional(),
  /** Google Ads Offline Conversion config */
  google: GoogleConversionConfigSchema.optional(),
  /** Default currency code */
  defaultCurrency: z.string().length(3).default('EUR'),
  /** Enable deduplication via database */
  enableDeduplication: z.boolean().default(true),
  /** Retry configuration */
  retry: z.object({
    maxRetries: z.number().int().min(0).max(10).default(3),
    baseDelayMs: z.number().int().min(100).max(60000).default(1000),
  }).default({}),
});
export type AdsConversionConfig = z.infer<typeof AdsConversionConfigSchema>;

// =============================================================================
// WORKFLOW PAYLOADS
// =============================================================================

/**
 * Payload for ads conversion workflow (Trigger.dev)
 */
export const AdsConversionWorkflowPayloadSchema = z.object({
  /** Source of the conversion event */
  source: z.object({
    crm: z.enum(['pipedrive', 'hubspot', 'salesforce']),
    entityType: z.enum(['deal', 'contact', 'lead', 'opportunity']),
    entityId: z.string(),
    eventType: z.enum(['deal_won', 'deal_stage_changed', 'contact_created', 'lead_qualified']),
  }),
  /** User/contact data for matching */
  userData: UserDataSchema,
  /** Conversion value */
  value: z.number().nonnegative().optional(),
  /** Currency */
  currency: z.string().length(3).optional(),
  /** Event timestamp (ISO string) */
  eventTime: z.string().datetime(),
  /** Platforms to send conversion to */
  platforms: z.array(AdsPlatformSchema).min(1),
  /** Custom event name (optional) */
  customEventName: z.string().optional(),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),
  /** Correlation ID for tracing */
  correlationId: z.string().optional(),
});
export type AdsConversionWorkflowPayload = z.infer<typeof AdsConversionWorkflowPayloadSchema>;

/**
 * Result of ads conversion workflow
 */
export const AdsConversionWorkflowResultSchema = z.object({
  /** Overall success */
  success: z.boolean(),
  /** Results per platform */
  platformResults: z.array(z.object({
    platform: AdsPlatformSchema,
    success: z.boolean(),
    eventId: z.string(),
    eventsMatched: z.number().optional(),
    error: z.string().optional(),
    retryable: z.boolean().optional(),
  })),
  /** Event IDs created */
  eventIds: z.array(z.string()),
  /** Errors encountered */
  errors: z.array(z.string()),
});
export type AdsConversionWorkflowResult = z.infer<typeof AdsConversionWorkflowResultSchema>;

// =============================================================================
// DOMAIN EVENTS
// =============================================================================

/**
 * Event emitted when a conversion is sent to an ads platform
 */
export const AdsConversionSentEventSchema = z.object({
  type: z.literal('AdsConversionSent'),
  timestamp: z.date(),
  correlationId: z.string(),
  payload: z.object({
    platform: AdsPlatformSchema,
    eventId: z.string(),
    eventName: z.string(),
    sourceEntityType: z.string(),
    sourceEntityId: z.string(),
    value: z.number().optional(),
    currency: z.string().optional(),
    eventsMatched: z.number().optional(),
  }),
});
export type AdsConversionSentEvent = z.infer<typeof AdsConversionSentEventSchema>;

/**
 * Event emitted when a conversion fails to send
 */
export const AdsConversionFailedEventSchema = z.object({
  type: z.literal('AdsConversionFailed'),
  timestamp: z.date(),
  correlationId: z.string(),
  payload: z.object({
    platform: AdsPlatformSchema,
    eventId: z.string(),
    eventName: z.string(),
    sourceEntityType: z.string(),
    sourceEntityId: z.string(),
    error: z.string(),
    retryable: z.boolean(),
    retryCount: z.number(),
  }),
});
export type AdsConversionFailedEvent = z.infer<typeof AdsConversionFailedEventSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a unique event ID for conversion deduplication
 */
export function generateConversionEventId(
  source: { crm: string; entityType: string; entityId: string },
  platform: AdsPlatform,
  eventName: string
): string {
  return `${source.crm}_${source.entityType}_${source.entityId}_${platform}_${eventName}_${Date.now()}`;
}

/**
 * Convert Unix timestamp to Google Ads datetime format
 * @param unixTimestamp Unix timestamp in seconds
 * @param timezone Timezone offset (e.g., '+00:00', '-05:00')
 */
export function toGoogleAdsDateTime(unixTimestamp: number, timezone: string = '+00:00'): string {
  const date = new Date(unixTimestamp * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}${timezone}`;
}

/**
 * Check if a click ID is a Google Click ID
 */
export function isGoogleClickId(clickId: string): boolean {
  // GCLIDs are typically 50-100 characters and contain alphanumeric + underscores
  return /^[a-zA-Z0-9_-]{30,150}$/.test(clickId) && !clickId.startsWith('fb.');
}

/**
 * Check if a click ID is a Facebook Click ID
 */
export function isFacebookClickId(clickId: string): boolean {
  // FBCLIDs start with 'fb.' and are followed by version and timestamp
  return clickId.startsWith('fb.') || /^[a-zA-Z0-9]{20,}$/.test(clickId);
}

/**
 * Determine click ID type from value
 */
export function detectClickIdType(clickId: string): 'gclid' | 'fbclid' | 'unknown' {
  if (isGoogleClickId(clickId)) return 'gclid';
  if (isFacebookClickId(clickId)) return 'fbclid';
  return 'unknown';
}

/**
 * Map Pipedrive deal status to conversion event name
 */
export function mapDealStatusToConversionEvent(status: string): ConversionEventType {
  switch (status.toLowerCase()) {
    case 'won':
      return 'Purchase';
    case 'open':
      return 'Lead';
    default:
      return 'Lead';
  }
}
