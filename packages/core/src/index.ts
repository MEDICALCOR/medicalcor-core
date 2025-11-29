export {
  createLogger,
  withCorrelationId,
  generateCorrelationId,
  logger,
  type Logger,
  type CreateLoggerOptions,
} from './logger.js';

// PII Masking utilities for safe logging (HIPAA/GDPR compliant)
export { maskPhone, maskEmail, maskName } from './logger/redaction.js';

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
  // Transaction management
  withTransaction,
  withAdvisoryLock,
  stringToLockKey,
  IsolationLevel,
  SerializationError,
  DeadlockError,
  LockNotAvailableError,
  // Types
  type DatabaseClient,
  type DatabasePool,
  type PoolClient,
  type QueryResult,
  type TransactionClient,
  type TransactionOptions,
} from './database.js';

// Phone validation utilities
export {
  // Main validation functions
  validatePhone,
  validatePhoneSync,
  // Romanian-specific utilities
  normalizeRomanianPhone,
  isValidRomanianPhone,
  formatPhoneForDisplay,
  // Utility functions
  isLikelyMobile,
  redactPhone,
  getCountryCallingCode,
  // Legacy (deprecated)
  normalizePhone,
  // Types
  type PhoneNumberType,
  type PhoneValidationResult,
  type PhoneParseOptions,
  type RomanianPhoneResult,
} from './phone.js';

// Resilient networking utilities
export {
  resilientFetch,
  resilientJsonFetch,
  createServiceClient,
  withRetry as resilientWithRetry,
  // Types
  type RetryConfig,
  type ResilientFetchOptions,
  type ResilientFetchResult,
} from './resilient-fetch.js';

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
  // Rate Limiter
  UserRateLimiter,
  createUserRateLimiter,
  createRateLimitMiddleware,
  // Token Estimator
  TokenEstimator,
  createTokenEstimator,
  tokenEstimator,
  // Budget Controller
  AIBudgetController,
  createAIBudgetController,
  // Adaptive Timeout
  AdaptiveTimeoutManager,
  createAdaptiveTimeoutManager,
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
  type UserTier,
  type AIOperationType,
} from './ai-gateway/index.js';

// Authentication & Authorization
export {
  // Services
  AuthService,
  PasswordResetService,
  MfaService,
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
  MFA_CONFIG,
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
  type MfaMethod,
  type MfaStatus,
  type MfaSetupResult,
  type MfaVerifyResult,
} from './auth/index.js';

// Encryption Service (PHI/PII at-rest encryption)
export {
  EncryptionService,
  createEncryptionService,
  encryptValue,
  decryptValue,
  type DataClassification,
  type EncryptedField,
  type EncryptionResult,
  type DecryptionOptions,
} from './encryption.js';

// Secrets Validation (Boot-time security checks)
export {
  validateSecrets,
  validateSecretsAtStartup,
  getSecretsFingerprint,
  generateSecureKey,
  printSetupInstructions,
  DEFAULT_SECRET_RULES,
  type SecretRequirement,
  type SecretRule,
  type SecretValidationResult,
  type ValidationSummary,
} from './secrets-validator.js';

// Infrastructure - Redis with TLS
export {
  SecureRedisClient,
  createSecureRedisClient,
  createRedisClientFromEnv,
  type RedisConfig,
  type RedisHealthStatus,
  type RedisStats,
} from './infrastructure/redis-client.js';

// Infrastructure - Backup Service
export {
  BackupService,
  createBackupService,
  createBackupServiceFromEnv,
  type BackupConfig,
  type BackupMetadata,
  type BackupProgress,
  type BackupType,
  type BackupStatus,
  type BackupFrequency,
  type StorageProvider,
  type StorageConfig,
  type EncryptionConfig,
  type RetentionPolicy,
  type ScheduleConfig,
  type RestoreOptions,
} from './infrastructure/backup-service.js';

// RAG - Retrieval-Augmented Generation
export {
  // Knowledge Base Repository
  KnowledgeBaseRepository,
  createKnowledgeBaseRepository,
  // Vector Search Service
  VectorSearchService,
  createVectorSearchService,
  // RAG Pipeline
  RAGPipeline,
  createRAGPipeline,
  buildRAGEnhancedPrompt,
  DEFAULT_RAG_CONFIG,
  // Types
  type KnowledgeEntry,
  type CreateKnowledgeEntry,
  type KnowledgeSourceType,
  type Language,
  type SearchType,
  type SearchFilters,
  type SearchOptions,
  type SearchResult,
  type SearchResponse,
  type RAGContext,
  type RAGResult,
  type RAGConfig,
  type MessageEmbedding,
  type RAGQueryLogEntry,
  type IKnowledgeBaseRepository,
  type ListOptions,
  type PaginatedResult,
  type SearchQueryOptions,
  type HybridSearchOptions,
  type VectorSearchConfig,
  type RAGPromptOptions,
  type IEmbeddingService,
} from './rag/index.js';

// CRM Database Operations
export {
  // Lead operations
  upsertLeadFromDTO,
  findLeadIdByExternal,
  getLeadById,
  getLeadByExternal,
  // Treatment plan operations
  upsertTreatmentPlanFromDTO,
  getTreatmentPlansByLead,
  // Interaction operations
  insertInteractionFromDTO,
  getInteractionsByLead,
  // Event operations
  recordLeadEvent,
  getLeadEvents,
  // Practitioner helpers
  findPractitionerIdByExternalUserId,
  // Types
  type UpsertLeadOptions,
  type UpsertTreatmentPlanOptions,
  type InsertInteractionOptions,
} from './crm.db.js';

// ============================================================================
// TYPE SYSTEM - State of the Art TypeScript Utilities
// ============================================================================

// Re-export all types from the types module
export * from './types/index.js';
