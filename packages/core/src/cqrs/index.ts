/**
 * CQRS + Event Sourcing Infrastructure
 *
 * Provides scalable architecture with:
 * - Command Bus for write operations
 * - Query Bus for read operations (with caching)
 * - Aggregate roots with event replay
 * - Projections for read models
 * - Snapshot store for performance
 * - Event replay utilities
 */

// Command Bus
export {
  CommandBus,
  createCommandBus,
  defineCommand,
  loggingMiddleware,
  retryMiddleware,
  idempotencyMiddleware,
  type Command,
  type CommandMetadata,
  type CommandResult,
  type CommandContext,
  type CommandHandler,
  type CommandMiddleware,
  type IdempotencyCacheEntry,
} from './command-bus.js';

// Query Bus
export {
  QueryBus,
  createQueryBus,
  defineQuery,
  queryLoggingMiddleware,
  authorizationMiddleware,
  calculatePagination,
  paginate,
  type Query,
  type QueryMetadata,
  type QueryResult,
  type QueryContext,
  type QueryHandler,
  type QueryMiddleware,
  type PaginationInfo,
  type PaginatedParams,
} from './query-bus.js';

// Aggregates
export {
  AggregateRoot,
  EventSourcedRepository,
  LeadAggregate,
  LeadRepository,
  type DomainEvent,
  type AggregateState,
  type AggregateSnapshot,
  type AggregateRepository,
  type LeadState,
  type EventApplier,
} from './aggregate.js';

// Projections
export {
  ProjectionBuilder,
  ProjectionManager,
  defineProjection,
  createProjectionManager,
  // Example projections
  LeadStatsProjection,
  PatientActivityProjection,
  DailyMetricsProjection,
  type Projection,
  type ProjectionHandler,
  type ProjectionDefinition,
  type LeadStatsState,
  type PatientActivityState,
  type DailyMetricsState,
} from './projections.js';

// Commands - Domain command definitions and handlers
export {
  // Command definitions
  CreateLeadCommand,
  ScoreLeadCommand,
  QualifyLeadCommand,
  AssignLeadCommand,
  ConvertLeadCommand,
  MarkLeadLostCommand,
  CreatePatientCommand,
  UpdatePatientCommand,
  MergePatientCommand,
  ScheduleAppointmentCommand,
  RescheduleAppointmentCommand,
  CancelAppointmentCommand,
  CompleteAppointmentCommand,
  SendWhatsAppMessageCommand,
  MarkMessageReadCommand,
  RecordConsentCommand,
  WithdrawConsentCommand,
  TriggerWorkflowCommand,
  // Handlers
  createLeadHandler,
  scoreLeadHandler,
  qualifyLeadHandler,
  assignLeadHandler,
  convertLeadHandler,
  scheduleAppointmentHandler,
  cancelAppointmentHandler,
  recordConsentHandler,
  sendWhatsAppMessageHandler,
  triggerWorkflowHandler,
  getCommandHandlers,
  type CommandHandlerRegistry,
} from './commands.js';

// Queries - Domain query definitions and handlers
export {
  // Query definitions
  GetLeadByPhoneQuery,
  GetLeadsByClassificationQuery,
  GetLeadStatsQuery,
  SearchLeadsQuery,
  GetPatientQuery,
  SearchPatientsQuery,
  GetPatientHistoryQuery,
  GetAvailableSlotsQuery,
  GetAppointmentsByPatientQuery,
  GetAppointmentQuery,
  GetDoctorScheduleQuery,
  CheckConsentQuery,
  GetConsentAuditLogQuery,
  GetLeadAnalyticsQuery,
  GetConversionFunnelQuery,
  GetDailyMetricsQuery,
  GetWorkflowStatusQuery,
  // Handler factories
  createGetLeadStatsHandler,
  createGetLeadByPhoneHandler,
  createGetLeadAnalyticsHandler,
  createCheckConsentHandler,
  createGetAvailableSlotsHandler,
  createGetPatientActivityHandler,
  createQueryHandlers,
  type QueryHandlerDeps,
  type QueryHandlerRegistry,
} from './queries.js';

// Snapshot Store - Performance optimization
export {
  InMemorySnapshotStore,
  PostgresSnapshotStore,
  SnapshotManager,
  SnapshotEnabledRepository,
  SnapshotEnabledLeadRepository,
  createSnapshotStore,
  createSnapshotManager,
  createInMemorySnapshotManager,
  type SnapshotStoreConfig,
  type SnapshotStoreRepository,
} from './snapshot-store.js';

// Event Replay - Projection rebuilding and migration
export {
  EventReplayService,
  InMemoryCheckpointStore,
  PostgresCheckpointStore,
  ProjectionMigrator,
  LiveProjectionUpdater,
  createEventReplayService,
  createInMemoryCheckpointStore,
  createCheckpointStore,
  createPostgresCheckpointStore,
  createProjectionMigrator,
  createLiveProjectionUpdater,
  type ReplayConfig,
  type ReplayResult,
  type CheckpointData,
  type CheckpointStore,
  type MigrationStep,
  type EventSubscriber,
} from './event-replay.js';

// Projection Health Monitoring
export {
  ProjectionHealthMonitor,
  createProjectionHealthMonitor,
  DEFAULT_PROJECTION_HEALTH_CONFIG,
  type ProjectionHealth,
  type ProjectionHealthSummary,
  type ProjectionHealthConfig,
} from './projection-health.js';

// Event Schema Registry - Versioned event schemas and migrations
export {
  EventSchemaRegistry,
  eventSchemaRegistry,
  createEventSchemaRegistry,
  registerCommonEventSchemas,
  type EventSchemaVersion,
  type RegisterSchemaOptions,
  type ValidationResult,
  type MigrationResult,
  type EventMigrationFn,
} from './event-schema-registry.js';

// Schema-Validated Event Store - Validated and versioned events
export {
  SchemaValidatedEventStore,
  EventSchemaValidationError,
  createSchemaValidatedEventStore,
  withSchemaValidation,
  type SchemaValidatedEventStoreConfig,
  type SchemaViolation,
} from './schema-validated-event-store.js';

// Saga Repository - Distributed transaction persistence
export {
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
} from './saga-repository.js';

// Audit Trail - Compliance logging (HIPAA, GDPR)
export {
  AuditTrailService,
  InMemoryAuditStore,
  PostgresAuditStore,
  createAuditTrailService,
  createInMemoryAuditStore,
  createPostgresAuditStore,
  type AuditActor,
  type AuditEntry,
  type AuditAction,
  type AuditSeverity,
  type AuditQueryOptions,
  type AuditQueryResult,
  type AuditSummary,
  type AuditStore,
} from './audit-trail.js';

// Temporal Replay - Enhanced event replay with temporal queries
export {
  TemporalReplayService,
  TemporalProjectionBuilder,
  createTemporalReplayService,
  defineTemporalProjection,
  type TemporalQueryMode,
  type TemporalQueryOptions,
  type TemporalQueryResult,
  type EventWindow,
  type SlidingWindowConfig,
  type TemporalReplayConfig,
  type TemporalReplayResult,
  type TemporalContext,
} from './temporal-replay.js';
// State Reconstruction - Point-in-time state replay (M6/H7)
export {
  StateReconstructionService,
  createStateReconstructionService,
  type ReconstructionOptions,
  type ReconstructionResult,
  type StateDiff,
  type StateChange,
  type AggregateFactory,
} from './state-reconstruction.js';

// Replay Audit - Audit trail for replay operations (M6/H7)
export {
  ReplayAuditService,
  InMemoryReplayAuditStore,
  PostgresReplayAuditStore,
  createReplayAuditStore,
  createReplayAuditService,
  createInMemoryReplayAuditService,
  type ReplayOperationType,
  type ReplayOperationStatus,
  type ReplayAuditEntry,
  type ReplayParameters,
  type ReplayResult as AuditReplayResult,
  type ReplayError,
  type ReplayProgress,
  type ReplayAuditStore,
} from './replay-audit.js';

// Replay Orchestrator - Coordinated replay operations (M6/H7)
export {
  ReplayOrchestrator,
  createReplayOrchestrator,
  type ReplayOrchestratorConfig,
  type ReconstructStateRequest,
  type RebuildProjectionRequest,
  type StateDiffRequest,
  type EventTimelineRequest,
  type VerifyStateRequest,
  type OrchestratedReplayResult,
} from './replay-orchestrator.js';
