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
  ProjectionMigrator,
  LiveProjectionUpdater,
  createEventReplayService,
  createInMemoryCheckpointStore,
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
  type ProjectionHealth,
  type ProjectionHealthConfig,
} from './projection-health.js';
