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

// NOTE: Telemetry is NOT exported from main index to avoid Edge Runtime issues
// Import from '@medicalcor/core/telemetry' when needed (server-side only)

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

export {
  createDatabaseClient,
  createIsolatedDatabaseClient,
  closeDatabasePool,
  type DatabaseClient,
  type DatabasePool,
  type PoolClient,
  type QueryResult,
} from './database.js';

// Observability-First (Metrics only - Edge Runtime compatible)
export {
  // Metrics
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  globalMetrics,
  httpRequestsTotal,
  httpRequestDuration,
  leadsCreated,
  leadsScored,
  leadsConverted,
  leadScoringDuration,
  appointmentsScheduled,
  appointmentsCancelled,
  messagesReceived,
  messagesSent,
  externalServiceRequests,
  externalServiceDuration,
  eventsAppended,
  eventStoreLatency,
  commandsExecuted,
  commandDuration,
  queriesExecuted,
  queryDuration,
  activeConnections,
  queueSize,
  aiFunctionCalls,
  aiFunctionDuration,
  aiIntentDetections,
  // Types
  type MetricLabel,
  type MetricValue,
  type MetricType,
  type MetricDefinition,
} from './observability/index.js';

// NOTE: Instrumentation and Diagnostics are NOT exported from main index to avoid Edge Runtime issues
// They use Node.js-specific APIs (OpenTelemetry SDK, process.platform, etc.)
//
// Import from '@medicalcor/core/observability/instrumentation' when needed (server-side only):
// - instrumentFastify, instrumentExternalCall, instrumentDatabase
// - createCommandMetricsMiddleware, createQueryMetricsMiddleware, createHealthIndicator
// - Types: InstrumentationOptions, ExternalCallOptions, RequestContext, HealthIndicator, HealthCheckResult, DatabaseClient
//
// Import from '@medicalcor/core/observability/diagnostics' when needed (server-side only):
// - DiagnosticsCollector, diagnostics, recordTrace, lookupTrace, searchTraces
// - getPrometheusMetrics, getMetricsJSON
// - Types: DiagnosticSnapshot, SystemSnapshot, HttpSnapshot, BusinessSnapshot, PerformanceSnapshot, HealthSnapshot, TraceLookup, TraceSpan

// CQRS + Event Sourcing
export {
  // Command Bus
  CommandBus,
  createCommandBus,
  defineCommand,
  loggingMiddleware,
  retryMiddleware,
  idempotencyMiddleware,
  // Query Bus
  QueryBus,
  createQueryBus,
  defineQuery,
  queryLoggingMiddleware,
  authorizationMiddleware,
  calculatePagination,
  paginate,
  // Aggregates
  AggregateRoot,
  EventSourcedRepository,
  LeadAggregate,
  LeadRepository,
  // Projections
  ProjectionBuilder,
  ProjectionManager,
  defineProjection,
  createProjectionManager,
  LeadStatsProjection,
  PatientActivityProjection,
  DailyMetricsProjection,
  // Types
  type Command,
  type CommandMetadata,
  type CommandResult,
  type CommandContext,
  type CommandHandler,
  type CommandMiddleware,
  type Query,
  type QueryMetadata,
  type QueryResult as CQRSQueryResult,
  type QueryContext,
  type QueryHandler,
  type QueryMiddleware,
  type PaginationInfo,
  type PaginatedParams,
  type DomainEvent,
  type AggregateState,
  type AggregateSnapshot,
  type AggregateRepository,
  type LeadState,
  type EventApplier,
  type Projection,
  type ProjectionHandler,
  type ProjectionDefinition,
  type LeadStatsState,
  type PatientActivityState,
  type DailyMetricsState,
} from './cqrs/index.js';

// AI-First API Gateway
export {
  // Function Registry
  FunctionRegistry,
  functionRegistry,
  RegisterFunction,
  zodToJsonSchema,
  // AI Router
  AIRouter,
  createAIRouter,
  detectIntent,
  AIRequestSchema,
  // Medical Functions
  ALL_MEDICAL_FUNCTIONS,
  FUNCTION_INPUT_SCHEMAS,
  ScoreLeadFunction,
  GetPatientFunction,
  UpdatePatientFunction,
  ScheduleAppointmentFunction,
  GetAvailableSlotsFunction,
  CancelAppointmentFunction,
  SendWhatsAppFunction,
  RecordConsentFunction,
  CheckConsentFunction,
  GetLeadAnalyticsFunction,
  TriggerWorkflowFunction,
  GetWorkflowStatusFunction,
  // Types
  type AIFunction,
  type AIFunctionCall,
  type AIFunctionResult,
  type AIFunctionCategory,
  type AIFunctionExample,
  type FunctionContext,
  type JSONSchemaProperty,
  type AIRequest,
  type AIResponse,
  type AIRouterConfig,
  type DetectedIntent,
} from './ai-gateway/index.js';

// Authentication & Authorization
export {
  // Services
  AuthService,
  PasswordResetService,
  // Repositories
  UserRepository,
  SessionRepository,
  AuthEventRepository,
  LoginAttemptRepository,
  toSafeUser,
  // Configuration
  PASSWORD_POLICY,
  SESSION_CONFIG,
  RATE_LIMIT_CONFIG,
  PASSWORD_RESET_CONFIG,
  // Types
  type UserRole,
  type UserStatus,
  type AuthEventType,
  type AuthEventResult,
  type User,
  type SafeUser,
  type CreateUserData,
  type UpdateUserData,
  type Session as AuthSession,
  type CreateSessionData,
  type AuthEvent,
  type CreateAuthEventData,
  type LoginAttempt,
  type PasswordResetToken,
  type RefreshToken,
  type RateLimitResult,
  type AuthContext,
  type LoginResult,
  type PasswordValidationResult,
} from './auth/index.js';
