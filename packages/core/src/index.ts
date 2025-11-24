export {
  createLogger,
  withCorrelationId,
  generateCorrelationId,
  logger,
  type Logger,
  type CreateLoggerOptions,
} from './logger.js';

export {
  AppError,
  ValidationError,
  AuthenticationError,
  WebhookSignatureError,
  RateLimitError,
  ExternalServiceError,
  NotFoundError,
  isOperationalError,
  toSafeErrorResponse,
  type SafeErrorDetails,
} from './errors.js';

export {
  normalizeRomanianPhone,
  withRetry,
  sleep,
  createIdempotencyKey,
  safeJsonParse,
  isDefined,
  pick,
  omit,
} from './utils.js';

export {
  ApiEnvSchema,
  DevEnvSchema,
  validateEnv,
  getEnv,
  hasSecret,
  getMissingSecrets,
  logSecretsStatus,
  type ApiEnv,
  type DevEnv,
} from './env.js';

export {
  EventStore,
  InMemoryEventStore,
  PostgresEventStore,
  createEventStore,
  createInMemoryEventStore,
  type EventStoreConfig,
  type EventStoreRepository,
  type StoredEvent,
  type EventPublisher,
} from './event-store.js';

export {
  LeadContextBuilder,
  buildLeadContextFromWhatsApp,
  buildLeadContextFromVoiceCall,
  buildLeadContextFromWebForm,
  type LeadContext,
  type LeadChannel,
  type MessageRole,
  type SupportedLanguage,
  type UTMParams,
  type MessageEntry,
  type WhatsAppInput,
  type VoiceCallInput,
  type WebFormInput,
  type ReferralInput,
} from './lead-context.js';

export {
  initTelemetry,
  shutdownTelemetry,
  getTracer,
  createSpan,
  withSpan,
  withSpanSync,
  getCurrentSpan,
  getCurrentContext,
  addSpanAttributes,
  recordException,
  traceExternalCall,
  Traced,
  SpanAttributes,
  SpanStatusCode,
  SpanKind,
  type TelemetryConfig,
  type Span,
  type Tracer,
  type SpanOptions,
  type Context,
} from './telemetry.js';

export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitBreakerError,
  CircuitState,
  globalCircuitBreakerRegistry,
  withCircuitBreaker,
  createCircuitBreakerWrapper,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
} from './circuit-breaker.js';

export {
  IdempotencyKeys,
  createNamespacedIdempotencyKey,
  hashMessageContent,
  getTodayString,
  getCurrentHourString,
} from './idempotency.js';
