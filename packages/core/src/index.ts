export {
  createLogger,
  withCorrelationId,
  generateCorrelationId,
  logger,
  type Logger,
  type CreateLoggerOptions,
} from './logger.js';

// PII Masking utilities for safe logging (HIPAA/GDPR compliant)
export {
  maskPhone,
  maskEmail,
  maskName,
  redactString,
  deepRedactObject,
  PII_PATTERNS,
  REDACTION_PATHS,
  shouldRedactPath,
} from './logger/redaction.js';

export {
  AppError,
  ValidationError,
  AuthenticationError,
  WebhookSignatureError,
  RateLimitError,
  ExternalServiceError,
  NotFoundError,
  DatabaseConnectionError,
  DatabaseOperationError,
  LeadNotFoundError,
  LeadUpsertError,
  // Repository errors (standardized error handling)
  RepositoryError,
  RecordNotFoundError,
  RecordCreateError,
  RecordUpdateError,
  RecordDeleteError,
  ConcurrencyError,
  ConsentRequiredError,
  DatabaseConfigError,
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

// Redis-backed Idempotency Cache (distributed deduplication)
export {
  IdempotencyCache,
  createIdempotencyCache,
  createIdempotencyCacheFromEnv,
  type IdempotencyCacheConfig,
  type IdempotencyCheckResult,
  type IdempotencyCacheStats,
} from './idempotency-cache.js';

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
  // Read Model / Materialized View Refresh Metrics
  readModelRefreshTotal,
  readModelRefreshDuration,
  readModelStaleness,
  readModelRowCount,
  readModelConcurrentRefreshes,
  readModelHealth,
  readModelRefreshErrors,
  readModelRefreshQueueDepth,
  readModelRefreshInterval,
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
//
// Import from '@medicalcor/core/observability/otel-logs' when needed (server-side only):
// - initOtelLogs, shutdownOtelLogs, createOtelLogTransport, createDualDestination
// - emitLogRecord, getTraceContext, otelLogsConfig
// - Types: OtelLogsConfig

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
  // Projection Health Monitoring
  ProjectionHealthMonitor,
  createProjectionHealthMonitor,
  DEFAULT_PROJECTION_HEALTH_CONFIG,
  type ProjectionHealth,
  type ProjectionHealthSummary,
  type ProjectionHealthConfig,
  // Event Schema Registry
  EventSchemaRegistry,
  eventSchemaRegistry,
  createEventSchemaRegistry,
  registerCommonEventSchemas,
  type EventSchemaVersion,
  type RegisterSchemaOptions,
  type ValidationResult as EventValidationResult,
  type MigrationResult,
  type EventMigrationFn,
  // Schema-Validated Event Store
  SchemaValidatedEventStore,
  EventSchemaValidationError,
  createSchemaValidatedEventStore,
  withSchemaValidation,
  type SchemaValidatedEventStoreConfig,
  type SchemaViolation,
  // Saga Repository
  InMemorySagaRepository,
  PostgresSagaRepository,
  createSagaRepository,
  createInMemorySagaRepository,
  type SagaStatus,
  type SagaState,
  type SagaStepHistory,
  type CreateSagaOptions,
  type FindSagasOptions,
  type SagaRepository,
  // Read Model Metrics (Materialized View Refresh)
  ReadModelMetricsCollector,
  createReadModelMetricsCollector,
  type RefreshMetricEvent,
  type ReadModelMetadataSnapshot,
  type RefreshErrorType,
  type HealthStatus as ReadModelHealthStatus,
  type ReadModelMetricsCollectorConfig,
  type ViewMetricsSummary,
  type ReadModelMetricsSummary,
} from './cqrs/index.js';

// Enhanced Dead Letter Queue with Circuit Breaker
export {
  EnhancedDeadLetterQueueService,
  createEnhancedDeadLetterQueueService,
  type EnhancedDLQConfig,
  type EnhancedRetryResult,
  type DLQHealthStatus,
} from './enhanced-dead-letter-queue.js';

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
  createKmsEncryptionService,
  createAutoEncryptionService,
  encryptValue,
  decryptValue,
  // KMS Providers
  AwsKmsProvider,
  LocalKmsProvider,
  type KmsProvider,
  type DataClassification,
  type EncryptedField,
  type EncryptionResult,
  type DecryptionOptions,
} from './encryption.js';

// Dead Letter Queue (DLQ) for failed webhooks
export {
  DeadLetterQueueService,
  createDeadLetterQueueService,
  DLQ_MIGRATION_SQL,
  type WebhookType,
  type DlqStatus,
  type DlqEntry,
  type DlqAddOptions,
  type DlqRetryOptions,
  type RetryHandler,
} from './dead-letter-queue.js';

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

// Distributed Rate Limiter with Redis
export {
  DistributedRateLimiter,
  createDistributedRateLimiter,
  createRateLimiterFromEnv,
  RATE_LIMIT_TIERS,
  type RateLimitTier,
  type RateLimitResult as DistributedRateLimitResult,
  type DistributedRateLimiterConfig,
} from './distributed-rate-limiter.js';

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

// Bulk Lead Import (L3 Feature)
export {
  // CSV parsing
  parseCSV,
  // Core import functions
  processBulkImport,
  // Job management
  createBulkImportJob,
  getBulkImportJob,
  updateJobProgress,
  // Service factory
  createBulkImportService,
  // Types
  type BulkImportService,
  type BulkImportContext,
} from './bulk-import.js';

// GDPR Compliance Services
export {
  // DSR Service (Data Subject Requests - Articles 15-22)
  PostgresDSRService,
  createDSRService,
  // Data Inventory Service (Article 30)
  PostgresDataInventoryService,
  createDataInventoryService,
  // Retention Service
  PostgresRetentionService,
  createRetentionService,
  // Types
  type DSRServiceDeps,
  type DataInventoryServiceDeps,
  type RetentionServiceDeps,
  type DSRType,
  type DSRStatus,
  type DSRResponse,
  type DataSubjectRequest,
  type DSRService,
  type DataCategory,
  type LegalBasis,
  type DataRecipient,
  type DataProcessingActivity,
  type ProcessingRecords,
  type DataInventoryService,
  type DisposalMethod,
  type RetentionException,
  type RetentionPolicy as GDPRRetentionPolicy,
  type RetentionCandidate,
  type DisposalError,
  type DisposalResult,
  type RetentionService,
} from './security/gdpr/index.js';

// ============================================================================
// REPOSITORIES (Infrastructure Adapters)
// ============================================================================
// NOTE: Repository implementations are excluded from the main build to avoid
// circular dependencies with @medicalcor/domain. They are exported from
// the @medicalcor/core/repositories submodule.
//
// Available implementations (exported from @medicalcor/core/repositories):
// - PostgresConsentRepository: implements IConsentRepository
// - InMemoryConsentRepository: implements IConsentRepository (test/dev)
// - PostgresSchedulingRepository: implements ISchedulingRepository
//
// To use, import from '@medicalcor/core/repositories' or implement your own adapter.

// ============================================================================
// TYPE SYSTEM - State of the Art TypeScript Utilities
// ============================================================================

// Re-export all types from the types module
export * from './types/index.js';

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export {
  // Infrastructure
  InMemoryFeatureFlagService,
  FeatureFlagError,
  type FeatureFlag,
  type FeatureFlagService,
  type EvaluationContext,
  type EvaluationResult,
} from './feature-flags/index.js';

// =============================================================================
// COGNITIVE EPISODIC MEMORY (ADR-004)
// =============================================================================
// AI-powered patient interaction memory for contextual responses and pattern detection

export {
  // Factory
  createCognitiveSystem,
  // Services
  EpisodeBuilder,
  createEpisodeBuilder,
  MemoryRetrievalService,
  createMemoryRetrievalService,
  PatternDetector,
  createPatternDetector,
  // Configuration
  DEFAULT_COGNITIVE_CONFIG,
  // Schemas
  SubjectTypeSchema,
  SourceChannelSchema,
  EventCategorySchema,
  SentimentSchema,
  PatternTypeSchema,
  InsightTypeSchema,
  SentimentTrendSchema,
  KeyEntitySchema,
  EpisodicEventSchema,
  CreateEpisodicEventSchema,
  BehavioralPatternSchema,
  MemoryQuerySchema,
  CognitiveInsightSchema,
  // Types
  type SubjectType,
  type SourceChannel,
  type EventCategory,
  type Sentiment,
  type PatternType,
  type InsightType,
  type SentimentTrend,
  type KeyEntity,
  type EpisodicEvent,
  type EpisodicEventWithEmbedding,
  type CreateEpisodicEvent,
  type BehavioralPattern,
  type MemoryQuery,
  type SubjectMemorySummary,
  type CognitiveInsight,
  type CognitiveInsightWithEvents,
  type RawEventContext,
  type EventAnalysisResult,
  type PatternDetectionResult,
  type LLMPattern,
  type MemoryContext,
  type CognitiveSystemConfig,
  type CognitiveSystemDependencies,
  type CognitiveSystem,
  type IOpenAIClient,
  // Note: IEmbeddingService is exported from './rag/index.js' to avoid duplicate
} from './cognitive/index.js';

// =============================================================================
// DATA LINEAGE TRACKING (M15)
// =============================================================================
// Comprehensive data lineage for compliance (HIPAA/GDPR) and debugging

export {
  // Schemas
  AggregateTypeSchema,
  TransformationTypeSchema,
  ComplianceFrameworkSchema,
  LegalBasisSchema,
  DataSensitivitySchema,
  DataSourceSchema,
  DataQualityMetricsSchema,
  LineageEntrySchema,
  CreateLineageEntrySchema,
  // Types
  type AggregateType,
  type TransformationType,
  type ComplianceFramework,
  // Note: LegalBasis type is exported from security/gdpr/index.js
  type DataSensitivity,
  type DataSource,
  type DataQualityMetrics,
  type LineageEntry,
  type CreateLineageEntry,
  type LineageNode,
  type LineageEdge,
  type LineageGraph,
  type LineageQueryOptions,
  type LineageQueryResult,
  type ImpactAnalysis,
  type ComplianceLineageReport,
  type DebugLineageTrace,
  type DataFlowVisualization,
  type LineageStore,
  type LineageServiceConfig,
  // Constants
  DEFAULT_LINEAGE_CONFIG,
  // Lineage Tracker
  LineageTracker,
  createLineageTracker,
  type LineageContext,
  // Graph Builder
  LineageGraphBuilder,
  createLineageGraphBuilder,
  type GraphBuildOptions,
  // Compliance Service
  ComplianceLineageService,
  createComplianceLineageService,
  type DataSubjectReport,
  type HIPAAAuditEntry,
  type LawfulnessAssessment,
  // Debug Reporter
  DebugLineageReporter,
  createDebugLineageReporter,
  type LineageIssue,
  type LineageHealthCheck,
  type InvestigationResult,
  // Stores
  InMemoryLineageStore,
  PostgresLineageStore,
  createInMemoryLineageStore,
  createPostgresLineageStore,
  createLineageStore,
  // Factory
  createDataLineageSystem,
  type DataLineageSystem,
} from './data-lineage/index.js';
