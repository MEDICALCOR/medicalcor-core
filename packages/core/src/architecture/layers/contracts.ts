/**
 * @module architecture/layers/contracts
 *
 * Layer Contracts
 * ===============
 *
 * Type definitions that enforce architectural boundaries.
 * Each layer has specific responsibilities and allowed dependencies.
 */

import type { Result } from '../../types/result.js';
import type { Brand } from '../../types/branded.js';

// ============================================================================
// LAYER IDENTIFIERS
// ============================================================================

/**
 * Architectural layers in order of dependency (outer to inner)
 */
export type ArchitecturalLayer = 'ui' | 'application' | 'domain' | 'infrastructure';

/**
 * Layer metadata for runtime validation
 */
export interface LayerMetadata {
  readonly layer: ArchitecturalLayer;
  readonly module: string;
  readonly version: string;
}

// ============================================================================
// DOMAIN LAYER CONTRACTS
// ============================================================================

/**
 * Marker interface for Domain Layer components.
 * Domain components have NO external dependencies.
 */
export interface DomainComponent {
  readonly __layer: 'domain';
}

/**
 * Entity - Has identity and lifecycle
 */
export interface Entity<TId> extends DomainComponent {
  readonly id: TId;
  equals(other: Entity<TId>): boolean;
}

/**
 * Aggregate Root - Consistency boundary for a cluster of entities
 */
export interface AggregateRoot<TId, TEvent extends DomainEvent = DomainEvent> extends Entity<TId> {
  readonly version: number;
  readonly uncommittedEvents: readonly TEvent[];
  clearUncommittedEvents(): void;
}

/**
 * Value Object - Immutable, identity-less, equality by value
 */
export interface ValueObject<T> extends DomainComponent {
  readonly value: T;
  equals(other: ValueObject<T>): boolean;
  toString(): string;
}

/**
 * Domain Event - Something that happened in the domain
 */
export interface DomainEvent {
  readonly __layer: 'domain';
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly payload: unknown;
  readonly metadata: EventMetadata;
}

/**
 * Event metadata for tracing and auditing
 */
export interface EventMetadata {
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly userId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly source: string;
  readonly timestamp: string;
}

/**
 * Domain Service - Stateless business logic that doesn't belong to an entity
 */
export interface DomainService extends DomainComponent {
  readonly serviceName: string;
}

/**
 * Repository Interface - Defined in Domain, implemented in Infrastructure
 */
export interface Repository<TAggregate extends AggregateRoot<TId>, TId> extends DomainComponent {
  findById(id: TId): Promise<TAggregate | null>;
  save(aggregate: TAggregate): Promise<void>;
  delete(id: TId): Promise<void>;
}

/**
 * Specification Pattern - Encapsulates query logic in domain terms
 */
export interface Specification<T> extends DomainComponent {
  isSatisfiedBy(candidate: T): boolean;
  and(other: Specification<T>): Specification<T>;
  or(other: Specification<T>): Specification<T>;
  not(): Specification<T>;
  toQueryCriteria(): QueryCriteria;
}

/**
 * Query criteria for repository implementations
 */
export interface QueryCriteria {
  readonly field?: string;
  readonly operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'contains'
    | 'and'
    | 'or'
    | 'not';
  readonly value?: unknown;
  readonly children?: QueryCriteria[];
}

// ============================================================================
// APPLICATION LAYER CONTRACTS
// ============================================================================

/**
 * Marker interface for Application Layer components.
 * Application components depend ONLY on Domain layer.
 */
export interface ApplicationComponent {
  readonly __layer: 'application';
}

/**
 * Command - Intent to change state (write operation)
 */
export interface Command<TPayload = unknown> extends ApplicationComponent {
  readonly commandId: string;
  readonly commandType: string;
  readonly payload: TPayload;
  readonly metadata: CommandMetadata;
}

/**
 * Command metadata for tracing and authorization
 */
export interface CommandMetadata {
  readonly correlationId: string;
  readonly causationId?: string | undefined;
  readonly userId: string;
  readonly tenantId?: string | undefined;
  readonly timestamp: string;
  readonly expectedVersion?: number | undefined;
  readonly idempotencyKey?: string | undefined;
}

/**
 * Command Handler - Processes a command and returns a result
 */
export interface CommandHandler<TCommand extends Command, TResult = void>
  extends ApplicationComponent {
  readonly commandType: string;
  handle(command: TCommand): Promise<Result<TResult, CommandError>>;
}

/**
 * Command error types
 */
export interface CommandError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown> | undefined;
}

/**
 * Query - Read operation (doesn't change state)
 */
export interface Query<TPayload = unknown> extends ApplicationComponent {
  readonly queryId: string;
  readonly queryType: string;
  readonly payload: TPayload;
  readonly metadata: QueryMetadata;
}

/**
 * Query metadata for authorization and caching
 */
export interface QueryMetadata {
  readonly correlationId: string;
  readonly userId?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly timestamp: string;
  readonly cacheKey?: string | undefined;
  readonly cacheTTL?: number | undefined;
}

/**
 * Query Handler - Processes a query and returns data
 */
export interface QueryHandler<TQuery extends Query, TResult> extends ApplicationComponent {
  readonly queryType: string;
  handle(query: TQuery): Promise<Result<TResult, QueryError>>;
}

/**
 * Query error types
 */
export interface QueryError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown> | undefined;
}

/**
 * Use Case - Orchestrates domain logic for a specific business operation
 */
export interface UseCase<TRequest, TResponse> extends ApplicationComponent {
  readonly useCaseName: string;
  execute(request: TRequest): Promise<Result<TResponse, UseCaseError>>;
}

/**
 * Use case error types
 */
export interface UseCaseError {
  readonly code: string;
  readonly message: string;
  readonly category:
    | 'validation'
    | 'authorization'
    | 'business_rule'
    | 'not_found'
    | 'conflict'
    | 'infrastructure';
  readonly details?: Record<string, unknown> | undefined;
}

/**
 * Saga / Process Manager - Long-running business process
 */
export interface Saga<TState = unknown> extends ApplicationComponent {
  readonly sagaId: string;
  readonly sagaType: string;
  readonly state: TState;
  readonly status: SagaStatus;
  handle(event: DomainEvent): Promise<SagaAction[]>;
  compensate(): Promise<SagaAction[]>;
}

export type SagaStatus = 'started' | 'running' | 'completed' | 'compensating' | 'failed';

export interface SagaAction {
  readonly type: 'command' | 'event' | 'timeout' | 'complete' | 'fail';
  readonly payload: unknown;
}

// ============================================================================
// INFRASTRUCTURE LAYER CONTRACTS
// ============================================================================

/**
 * Marker interface for Infrastructure Layer components.
 * Infrastructure implements Domain interfaces and provides technical capabilities.
 */
export interface InfrastructureComponent {
  readonly __layer: 'infrastructure';
}

/**
 * Port - Interface defined by the application for external interactions
 */
export interface Port extends InfrastructureComponent {
  readonly portName: string;
  readonly portType: 'inbound' | 'outbound';
}

/**
 * Adapter - Implementation of a Port
 */
export interface Adapter<TPort extends Port> extends InfrastructureComponent {
  readonly adapterName: string;
  readonly port: TPort;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  readonly healthy: boolean;
  readonly name: string;
  readonly latencyMs?: number;
  readonly details?: Record<string, unknown>;
  readonly error?: string;
}

/**
 * Message Bus - For publishing and subscribing to events
 */
export interface MessageBus extends InfrastructureComponent {
  publish<TEvent extends DomainEvent>(event: TEvent): Promise<void>;
  subscribe<TEvent extends DomainEvent>(
    eventType: string,
    handler: (event: TEvent) => Promise<void>
  ): Subscription;
  unsubscribe(subscription: Subscription): void;
}

export interface Subscription {
  readonly id: string;
  readonly eventType: string;
  unsubscribe(): void;
}

/**
 * Unit of Work - Transaction management
 */
export interface UnitOfWork extends InfrastructureComponent {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
}

/**
 * Outbox Pattern - For reliable event publishing
 */
export interface Outbox extends InfrastructureComponent {
  store(event: DomainEvent): Promise<void>;
  markAsPublished(eventId: string): Promise<void>;
  getPendingEvents(batchSize: number): Promise<DomainEvent[]>;
}

// ============================================================================
// UI LAYER CONTRACTS
// ============================================================================

/**
 * Marker interface for UI Layer components.
 * UI depends on Application layer only.
 */
export interface UIComponent {
  readonly __layer: 'ui';
}

/**
 * Controller - Handles HTTP/API requests
 */
export interface Controller extends UIComponent {
  readonly controllerName: string;
  readonly basePath: string;
}

/**
 * Presenter - Transforms domain data for UI consumption
 */
export interface Presenter<TDomainData, TViewData> extends UIComponent {
  present(data: TDomainData): TViewData;
}

/**
 * View Model - Data structure optimized for UI rendering
 */
export interface ViewModel<T = unknown> {
  readonly data: T;
  readonly metadata: ViewMetadata;
}

export interface ViewMetadata {
  readonly generatedAt: string;
  readonly cacheHit?: boolean;
  readonly version?: string;
}

// ============================================================================
// CROSS-CUTTING CONCERNS
// ============================================================================

/**
 * Audit Trail Entry
 */
export interface AuditEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly userId: string;
  readonly tenantId?: string;
  readonly changes: AuditChange[];
  readonly metadata: Record<string, unknown>;
}

export interface AuditChange {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/**
 * Tenant context for multi-tenancy
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly settings: TenantSettings;
}

export interface TenantSettings {
  readonly features: Record<string, boolean>;
  readonly limits: Record<string, number>;
  readonly customizations: Record<string, unknown>;
}

/**
 * Request context - Carries all contextual information through the layers
 */
export interface RequestContext {
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly permissions: string[];
  readonly locale: string;
  readonly timezone: string;
  readonly timestamp: string;
}

// ============================================================================
// TYPE BRANDS FOR LAYER ENFORCEMENT
// ============================================================================

/**
 * Domain Layer Brand - Ensures type belongs to domain layer
 */
export type DomainLayerType<T> = Brand<T, 'DomainLayer'>;

/**
 * Application Layer Brand
 */
export type ApplicationLayerType<T> = Brand<T, 'ApplicationLayer'>;

/**
 * Infrastructure Layer Brand
 */
export type InfrastructureLayerType<T> = Brand<T, 'InfrastructureLayer'>;

/**
 * UI Layer Brand
 */
export type UILayerType<T> = Brand<T, 'UILayer'>;
