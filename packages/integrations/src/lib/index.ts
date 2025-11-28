/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    @medicalcor/integrations/lib                               ║
 * ║                                                                               ║
 * ║  State-of-the-art infrastructure for enterprise integration development.     ║
 * ║  Type-safe, resilient, observable, and beautifully designed.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// Branded Types & Nominal Typing
// =============================================================================

export {
  // Core branding
  type Brand,
  type Flavor,
  type Unbrand,
  type BrandOf,

  // ID types
  type HubSpotContactId,
  type HubSpotDealId,
  type HubSpotTaskId,
  type HubSpotOwnerId,
  type HubSpotPortalId,
  type WhatsAppMessageId,
  type WhatsAppPhoneNumberId,
  type WhatsAppTemplateId,
  type WhatsAppConversationId,
  type VapiCallId,
  type VapiAssistantId,
  type VapiTranscriptId,
  type VapiPhoneNumberId,
  type StripeChargeId,
  type StripeCustomerId,
  type StripePaymentIntentId,
  type StripeWebhookId,
  type AppointmentId,
  type TimeSlotId,
  type PractitionerId,
  type LocationId,
  type EmbeddingId,
  type ContentHash,
  type ExternalContactId,
  type ExternalDealId,
  type CorrelationId,

  // Phone types
  type E164PhoneNumber,
  type NormalizedPhoneNumber,
  type RawPhoneNumber,

  // Currency types
  type MinorCurrencyAmount,
  type MajorCurrencyAmount,
  type CurrencyCode,

  // Time types
  type UnixTimestampSeconds,
  type UnixTimestampMs,
  type ISODateTime,
  type ISODate,
  type TimeString,

  // Sensitive types
  type SecretApiKey,
  type WebhookSecret,
  type HMACSignature,

  // Content types
  type SanitizedInput,
  type JSONString,
  type Base64String,

  // Smart constructors
  BrandValidationError,
  type BrandResult,
  hubSpotContactId,
  vapiCallId,
  e164PhoneNumber,
  normalizedPhoneNumber,
  isoDate,
  isoDateTime,
  timeString,
  currencyCode,
  toMinorUnits,
  toMajorUnits,
  correlationId,
  contentHash,

  // Unsafe constructors
  unsafe,

  // Type guards
  isBranded,
  assertBrand,
} from './branded-types.js';

// =============================================================================
// Result Monad & Functional Error Handling
// =============================================================================

export {
  // Core types
  type Ok,
  type Err,
  type Result,
  type AsyncResult,

  // Constructors
  ok,
  err,
  fromNullable,
  fromPredicate,
  tryCatch,
  tryCatchAsync,

  // Type guards
  isOk,
  isErr,

  // Transformations
  map,
  mapErr,
  flatMap,
  flatMapAsync,
  ap,

  // Recovery
  getOrElse,
  getOrElseW,
  orElse,
  recover,

  // Matching
  match,
  unwrap,
  expect,
  unwrapErr,

  // Combining
  all,
  allSettled,
  firstOk,
  sequenceS,

  // Side effects
  tap,
  tapErr,

  // Integration errors
  type IntegrationError,
  type IntegrationErrorCode,
  type IntegrationResult,
  type AsyncIntegrationResult,
  integrationError,
  toIntegrationError,
  wrapAsync,
  retryResult,

  // Pipeline
  ResultPipeline,
  pipeline,
} from './result.js';

// =============================================================================
// Builder Patterns & Fluent APIs
// =============================================================================

export {
  // Retry configuration
  type RetryStrategy,
  type RetryConfig,
  RetryConfigBuilder,

  // Circuit breaker configuration
  type CircuitState,
  type CircuitBreakerConfig,
  CircuitBreakerBuilder,

  // Timeout configuration
  type TimeoutConfig,
  TimeoutBuilder,

  // Base client builder
  type BaseClientConfig,
  BaseClientBuilder,

  // Request builder
  type HttpMethod,
  type RequestConfig,
  RequestBuilder,

  // Builder state types
  type BuilderState,
  type EmptyState,
  type WithApiKey,
  type WithRetryConfig,
  type WithTimeout,
  type WithCircuitBreaker,
} from './builders.js';

// =============================================================================
// Observability & Telemetry
// =============================================================================

export {
  // Span types
  type SpanStatusCode,
  type SpanKind,
  type SpanAttributes,
  type SpanEvent,
  type SpanLink,
  type Span,
  type TraceContext,

  // Metric types
  type MetricType,
  type MetricLabels,
  type MetricDataPoint,
  type HistogramBucket,
  type HistogramData,

  // Standard metrics & labels
  IntegrationMetrics,
  IntegrationLabels,

  // Telemetry context
  type TelemetryContext,
  createTelemetryContext,

  // Collector interface
  type TelemetryCollector,
  InMemoryTelemetryCollector,

  // Instrumentation
  startSpan,
  endSpan,
  addSpanEvent,
  setSpanAttributes,
  recordMetric,
  incrementCounter,
  setGauge,
  observeHistogram,

  // Instrumented operations
  type InstrumentOptions,
  instrument,
  instrumentSync,

  // Registry
  getTelemetryRegistry,
  configureTelemetry,

  // Timer utility
  Timer,
} from './telemetry.js';

// =============================================================================
// Resilience Patterns
// =============================================================================

export {
  // Bulkhead
  type BulkheadConfig,
  type BulkheadStats,
  BulkheadRejectedError,
  Bulkhead,

  // Deduplication
  type DeduplicationConfig,
  RequestDeduplicator,

  // Graceful degradation
  type DegradationLevel,
  type DegradationConfig,
  GracefulDegradation,

  // Adaptive timeout
  type AdaptiveTimeoutConfig,
  AdaptiveTimeout,

  // Rate limiting
  type RateLimiterConfig,
  TokenBucketRateLimiter,

  // Composite resilience
  type CompositeResilienceConfig,
  CompositeResilience,
} from './resilience.js';

// =============================================================================
// Type Guards & Assertions
// =============================================================================

export {
  // Guard result
  type GuardResult,
  guardOk,
  guardFail,

  // Primitive guards
  isObject,
  isNonEmptyString,
  isPositiveInteger,
  isNonNegativeInteger,
  isValidDate,
  isISODateString,
  isValidUrl,
  isValidEmail,
  isValidPhone,
  isE164Phone,
  isUUID,

  // Integration guards
  isHubSpotContact,
  isWhatsAppMessage,
  isVapiCall,
  isStripeCharge,

  // Discriminated union guards
  hasTag,
  hasType,
  hasKind,

  // Exhaustive matching
  assertNever,
  exhaustiveMatch,
  matchWithDefault,

  // Assertions
  AssertionError,
  assert,
  assertDefined,
  assertNonEmptyString,
  assertPositiveInteger,
  assertSchema,

  // Property access
  getProperty,
  getNestedProperty,
  getPropertyGuarded,

  // Array guards
  isNonEmptyArray,
  isArrayOf,
  hasLength,
  hasMinLength,

  // Webhook guards
  HubSpotWebhookPayloadSchema,
  type HubSpotWebhookPayload,
  isHubSpotWebhookPayload,
  WhatsAppWebhookPayloadSchema,
  type WhatsAppWebhookPayload,
  isWhatsAppWebhookPayload,
  StripeWebhookPayloadSchema,
  type StripeWebhookPayload,
  isStripeWebhookPayload,

  // Validation utilities
  validate,
  validateOrThrow,
  validateWithErrors,

  // Type narrowing
  toNonEmptyArray,
  toNonEmptyString,
  filterMap,
  partition,
} from './guards.js';
