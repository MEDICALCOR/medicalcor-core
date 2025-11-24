/**
 * CQRS + Event Sourcing Infrastructure
 *
 * Provides scalable architecture with:
 * - Command Bus for write operations
 * - Query Bus for read operations (with caching)
 * - Aggregate roots with event replay
 * - Projections for read models
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
