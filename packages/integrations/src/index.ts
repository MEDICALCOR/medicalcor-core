/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                         @medicalcor/integrations                              ║
 * ║                                                                               ║
 * ║  State-of-the-art third-party service integrations with enterprise-grade     ║
 * ║  type safety, resilience patterns, and observability infrastructure.          ║
 * ║                                                                               ║
 * ║  Features:                                                                    ║
 * ║  - Branded/Nominal types for compile-time safety                             ║
 * ║  - Result monad for functional error handling                                 ║
 * ║  - Fluent builders for type-safe configuration                               ║
 * ║  - OpenTelemetry-compatible observability                                    ║
 * ║  - Bulkhead, deduplication, and graceful degradation                        ║
 * ║  - Exhaustive type guards and runtime assertions                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// Core Integration Clients
// =============================================================================

export {
  HubSpotClient,
  createHubSpotClient,
  type HubSpotClientConfig,
  type TimelineEventInput,
  type TaskInput,
} from './hubspot.js';

// Re-export HubSpot types from @medicalcor/types for convenience
export type {
  HubSpotContact,
  HubSpotContactInput,
  HubSpotSearchRequest,
  HubSpotSearchResponse,
} from '@medicalcor/types';

export {
  WhatsAppClient,
  createWhatsAppClient,
  TEMPLATE_CATALOG,
  TemplateCatalogService,
  createTemplateCatalogService,
  type WhatsAppClientConfig,
  type SendTextOptions,
  type SendTemplateOptions,
  type TemplateComponent,
  type MessageResponse,
  type TemplateName,
  type TemplateDefinition,
  type TemplateParameter,
  type TemplateMessage,
  type TemplateSendResult,
  type SupportedLanguage,
} from './whatsapp.js';

export {
  OpenAIClient,
  createOpenAIClient,
  type OpenAIClientConfig,
  type ChatMessage,
  type ChatCompletionOptions,
  type AIReplyOptions,
} from './openai.js';

export {
  SchedulingService,
  MockSchedulingService,
  createSchedulingService,
  createMockSchedulingService,
  type SchedulingServiceConfig,
  type TimeSlot,
  type GetAvailableSlotsOptions,
  type BookAppointmentInput,
  type Appointment,
  type CancelAppointmentInput,
  type RescheduleAppointmentInput,
} from './scheduling.js';

export {
  VapiClient,
  createVapiClient,
  formatTranscriptForCRM,
  extractLeadQualification,
  type VapiClientConfig,
  type VapiCall,
  type VapiCallStatus,
  type VapiEndedReason,
  type VapiTranscript,
  type VapiMessage,
  type VapiCallSummary,
  type TranscriptAnalysis,
  type CreateOutboundCallInput,
  type GetCallInput,
  type ListCallsInput,
} from './vapi.js';

export {
  StripeClient,
  MockStripeClient,
  createStripeClient,
  createMockStripeClient,
  type StripeClientConfig,
  type DailyRevenueResult,
} from './stripe.js';

// =============================================================================
// Client Factory (Legacy)
// =============================================================================

export {
  createIntegrationClients,
  getOpenAIApiKey,
  type ClientsConfig,
  type IntegrationClients,
  type CircuitBreakerOptions,
  type ClientName,
  type EventStore,
} from './clients-factory.js';

// =============================================================================
// Enhanced Client Factory
// =============================================================================

export {
  createEnhancedIntegrationClients,
  type EnhancedClientsConfig,
  type EnhancedIntegrationClients,
  type CircuitBreakerStats as EnhancedCircuitBreakerStats,
  getHubSpotAccessToken,
  getWhatsAppCredentials,
  getVapiCredentials,
  getStripeCredentials,
  getSchedulingCredentials,
} from './clients-factory.enhanced.js';

// =============================================================================
// RAG - Embedding Service
// =============================================================================

export {
  EmbeddingService,
  createEmbeddingService,
  chunkText,
  prepareTextForEmbedding,
  EmbeddingConfigSchema,
  type EmbeddingConfig,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingInput,
  type ChunkOptions,
} from './embeddings.js';

// =============================================================================
// CRM Integrations
// =============================================================================

export {
  CRMFactory,
  getCRMProvider,
  resetCRMProvider,
  getMockCRMProvider,
  isMockCRMProvider,
  PipedriveAdapter,
  // Mock CRM Adapter
  MockCrmAdapter,
  MockCrmError,
  createMockCrmAdapter,
  createSuccessMockCrm,
  createErrorMockCrm,
  createFlakyMockCrm,
  createSlowMockCrm,
  MockCrmConfigSchema,
  MockCrmScenarioSchema,
  type MockCrmConfig,
  type MockCrmScenario,
  type CrmHealthCheckResult,
} from './crm/index.js';

// =============================================================================
// State-of-the-Art Library Infrastructure
// =============================================================================

// Branded Types & Nominal Typing
export {
  type Brand,
  type Flavor,
  type Unbrand,
  type BrandOf,
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
  type E164PhoneNumber,
  type NormalizedPhoneNumber,
  type RawPhoneNumber,
  type MinorCurrencyAmount,
  type MajorCurrencyAmount,
  type CurrencyCode,
  type UnixTimestampSeconds,
  type UnixTimestampMs,
  type ISODateTime,
  type ISODate,
  type TimeString,
  type SecretApiKey,
  type WebhookSecret,
  type HMACSignature,
  type SanitizedInput,
  type JSONString,
  type Base64String,
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
  unsafe,
  isBranded,
  assertBrand,
} from './lib/index.js';

// Result Monad & Functional Error Handling
export {
  type Ok,
  type Err,
  type Result,
  type AsyncResult,
  ok,
  err,
  fromNullable,
  fromPredicate,
  tryCatch,
  tryCatchAsync,
  isOk,
  isErr,
  map,
  mapErr,
  flatMap,
  flatMapAsync,
  ap,
  getOrElse,
  getOrElseW,
  orElse,
  recover,
  match,
  unwrap,
  expect,
  unwrapErr,
  all,
  allSettled,
  firstOk,
  sequenceS,
  tap,
  tapErr,
  type IntegrationError,
  type IntegrationErrorCode,
  type IntegrationResult,
  type AsyncIntegrationResult,
  integrationError,
  toIntegrationError,
  wrapAsync,
  retryResult,
  ResultPipeline,
  pipeline,
} from './lib/index.js';

// Builder Patterns & Fluent APIs
export {
  type RetryStrategy,
  type RetryConfig,
  RetryConfigBuilder,
  type CircuitState,
  type CircuitBreakerConfig,
  CircuitBreakerBuilder,
  type TimeoutConfig,
  TimeoutBuilder,
  type BaseClientConfig,
  BaseClientBuilder,
  type HttpMethod,
  type RequestConfig,
  RequestBuilder,
  type BuilderState,
  type EmptyState,
  type WithApiKey,
  type WithRetryConfig,
  type WithTimeout,
  type WithCircuitBreaker,
} from './lib/index.js';

// Observability & Telemetry
export {
  type SpanStatusCode,
  type SpanKind,
  type SpanAttributes,
  type SpanEvent,
  type SpanLink,
  type Span,
  type TraceContext,
  type MetricType,
  type MetricLabels,
  type MetricDataPoint,
  type HistogramBucket,
  type HistogramData,
  IntegrationMetrics,
  IntegrationLabels,
  type TelemetryContext,
  createTelemetryContext,
  type TelemetryCollector,
  InMemoryTelemetryCollector,
  startSpan,
  endSpan,
  addSpanEvent,
  setSpanAttributes,
  recordMetric,
  incrementCounter,
  setGauge,
  observeHistogram,
  type InstrumentOptions,
  instrument,
  instrumentSync,
  getTelemetryRegistry,
  configureTelemetry,
  Timer,
} from './lib/index.js';

// Resilience Patterns
export {
  type BulkheadConfig,
  type BulkheadStats,
  BulkheadRejectedError,
  Bulkhead,
  type DeduplicationConfig,
  RequestDeduplicator,
  type DegradationLevel,
  type DegradationConfig,
  GracefulDegradation,
  type AdaptiveTimeoutConfig,
  AdaptiveTimeout,
  type RateLimiterConfig,
  TokenBucketRateLimiter,
  type CompositeResilienceConfig,
  CompositeResilience,
} from './lib/index.js';

// Type Guards & Assertions
export {
  type GuardResult,
  guardOk,
  guardFail,
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
  isHubSpotContact,
  isWhatsAppMessage,
  isVapiCall,
  isStripeCharge,
  hasTag,
  hasType,
  hasKind,
  assertNever,
  exhaustiveMatch,
  matchWithDefault,
  AssertionError,
  assert,
  assertDefined,
  assertNonEmptyString,
  assertPositiveInteger,
  assertSchema,
  getProperty,
  getNestedProperty,
  getPropertyGuarded,
  isNonEmptyArray,
  isArrayOf,
  hasLength,
  hasMinLength,
  HubSpotWebhookPayloadSchema,
  type HubSpotWebhookPayload,
  isHubSpotWebhookPayload,
  WhatsAppWebhookPayloadSchema,
  type WhatsAppWebhookPayload,
  isWhatsAppWebhookPayload,
  StripeWebhookPayloadSchema,
  type StripeWebhookPayload,
  isStripeWebhookPayload,
  validate,
  validateOrThrow,
  validateWithErrors,
  toNonEmptyArray,
  toNonEmptyString,
  filterMap,
  partition,
} from './lib/index.js';
