/**
 * @module architecture/domain/repository
 *
 * Repository Pattern
 * ==================
 *
 * Repository interfaces are defined in the Domain layer.
 * Implementations are provided by the Infrastructure layer.
 */

import type {
  Repository as IRepository,
  AggregateRoot,
  DomainEvent,
  Specification,
  DomainComponent,
} from '../layers/contracts.js';
import type { Result } from '../../types/result.js';

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * Base repository interface with common operations
 */
export interface Repository<TAggregate extends AggregateRoot<TId>, TId>
  extends IRepository<TAggregate, TId>,
    DomainComponent {
  /**
   * Find by ID
   */
  findById(id: TId): Promise<TAggregate | null>;

  /**
   * Find by specification
   */
  findBySpec(spec: Specification<TAggregate>): Promise<TAggregate[]>;

  /**
   * Find one by specification
   */
  findOneBySpec(spec: Specification<TAggregate>): Promise<TAggregate | null>;

  /**
   * Count by specification
   */
  countBySpec(spec: Specification<TAggregate>): Promise<number>;

  /**
   * Check if any match specification
   */
  existsBySpec(spec: Specification<TAggregate>): Promise<boolean>;

  /**
   * Save aggregate (insert or update)
   */
  save(aggregate: TAggregate): Promise<void>;

  /**
   * Save multiple aggregates
   */
  saveAll(aggregates: TAggregate[]): Promise<void>;

  /**
   * Delete by ID
   */
  delete(id: TId): Promise<void>;

  /**
   * Delete by specification
   */
  deleteBySpec(spec: Specification<TAggregate>): Promise<number>;
}

// ============================================================================
// EXTENDED REPOSITORY INTERFACES
// ============================================================================

/**
 * Repository with pagination support
 */
export interface PaginatedRepository<TAggregate extends AggregateRoot<TId>, TId>
  extends Repository<TAggregate, TId> {
  /**
   * Find with pagination
   */
  findPaginated(
    spec: Specification<TAggregate>,
    options: PaginationOptions
  ): Promise<PaginatedResult<TAggregate>>;
}

export interface PaginationOptions {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy?: string;
  readonly sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  readonly items: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

/**
 * Repository with event sourcing support
 */
export interface EventSourcedRepository<
  TAggregate extends AggregateRoot<TId, TEvent>,
  TId,
  TEvent extends DomainEvent,
> extends Repository<TAggregate, TId> {
  /**
   * Load aggregate from event history
   */
  loadFromHistory(id: TId): Promise<TAggregate | null>;

  /**
   * Get events for an aggregate
   */
  getEvents(id: TId, afterVersion?: number): Promise<TEvent[]>;

  /**
   * Get all events (for projections)
   */
  getAllEvents(options?: EventStreamOptions): Promise<TEvent[]>;

  /**
   * Subscribe to events
   */
  subscribeToEvents(handler: (event: TEvent) => Promise<void>): Subscription;
}

export interface EventStreamOptions {
  readonly fromVersion?: number;
  readonly toVersion?: number;
  readonly fromTimestamp?: Date;
  readonly toTimestamp?: Date;
  readonly eventTypes?: string[];
  readonly aggregateTypes?: string[];
  readonly limit?: number;
}

export interface Subscription {
  readonly id: string;
  unsubscribe(): void;
}

/**
 * Repository with soft delete support
 */
export interface SoftDeleteRepository<TAggregate extends AggregateRoot<TId>, TId>
  extends Repository<TAggregate, TId> {
  /**
   * Soft delete an aggregate
   */
  softDelete(id: TId): Promise<void>;

  /**
   * Restore a soft-deleted aggregate
   */
  restore(id: TId): Promise<void>;

  /**
   * Find including soft-deleted
   */
  findByIdIncludingDeleted(id: TId): Promise<TAggregate | null>;

  /**
   * Find only soft-deleted
   */
  findDeleted(spec: Specification<TAggregate>): Promise<TAggregate[]>;

  /**
   * Permanently delete (hard delete)
   */
  hardDelete(id: TId): Promise<void>;
}

/**
 * Repository with audit trail
 */
export interface AuditedRepository<TAggregate extends AggregateRoot<TId>, TId>
  extends Repository<TAggregate, TId> {
  /**
   * Get audit history for an aggregate
   */
  getAuditHistory(id: TId): Promise<AuditRecord[]>;
}

export interface AuditRecord {
  readonly id: string;
  readonly aggregateId: string;
  readonly operation: 'create' | 'update' | 'delete';
  readonly changes: AuditChange[];
  readonly performedBy: string;
  readonly performedAt: Date;
  readonly metadata?: Record<string, unknown>;
}

export interface AuditChange {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

// ============================================================================
// REPOSITORY ERRORS
// ============================================================================

export class RepositoryError extends Error {
  readonly code: string;
  readonly aggregateType: string;

  constructor(code: string, aggregateType: string, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    this.aggregateType = aggregateType;
  }
}

export class AggregateNotFoundError extends RepositoryError {
  readonly aggregateId: unknown;

  constructor(aggregateType: string, aggregateId: unknown) {
    super('NOT_FOUND', aggregateType, `${aggregateType} with ID ${String(aggregateId)} not found`);
    this.name = 'AggregateNotFoundError';
    this.aggregateId = aggregateId;
  }
}

export class RepositoryConcurrencyError extends RepositoryError {
  readonly aggregateId: unknown;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(
    aggregateType: string,
    aggregateId: unknown,
    expectedVersion: number,
    actualVersion: number
  ) {
    super(
      'CONCURRENCY_CONFLICT',
      aggregateType,
      `Concurrency conflict for ${aggregateType} ${String(aggregateId)}: expected version ${expectedVersion}, actual ${actualVersion}`
    );
    this.name = 'RepositoryConcurrencyError';
    this.aggregateId = aggregateId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

// ============================================================================
// UNIT OF WORK
// ============================================================================

/**
 * Unit of Work pattern for transactional operations
 */
export interface UnitOfWork {
  /**
   * Begin a transaction
   */
  begin(): Promise<void>;

  /**
   * Commit the transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback the transaction
   */
  rollback(): Promise<void>;

  /**
   * Check if transaction is active
   */
  isActive(): boolean;

  /**
   * Get a repository within this unit of work
   */
  getRepository<TAggregate extends AggregateRoot<TId>, TId>(
    name: string
  ): Repository<TAggregate, TId>;
}

/**
 * Execute a function within a unit of work
 */
export async function withUnitOfWork<T>(
  uow: UnitOfWork,
  fn: () => Promise<T>
): Promise<Result<T, Error>> {
  const { Ok, Err } = await import('../../types/result.js');

  try {
    await uow.begin();
    const result = await fn();
    await uow.commit();
    return Ok(result);
  } catch (error) {
    await uow.rollback();
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}

// ============================================================================
// REPOSITORY DECORATORS
// ============================================================================

/**
 * Repository with caching
 */
export interface CachedRepository<TAggregate extends AggregateRoot<TId>, TId>
  extends Repository<TAggregate, TId> {
  /**
   * Invalidate cache for an aggregate
   */
  invalidateCache(id: TId): Promise<void>;

  /**
   * Invalidate all cache
   */
  invalidateAllCache(): Promise<void>;

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats;
}

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly size: number;
}

/**
 * Repository with retry logic
 */
export interface RetryableRepository<TAggregate extends AggregateRoot<TId>, TId>
  extends Repository<TAggregate, TId> {
  /**
   * Configure retry behavior
   */
  setRetryConfig(config: RetryConfig): void;
}

export interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly retryableErrors: string[];
}

// ============================================================================
// READ MODEL REPOSITORY
// ============================================================================

/**
 * Repository for read models (CQRS read side)
 */
export interface ReadModelRepository<TReadModel> {
  findById(id: string): Promise<TReadModel | null>;
  findBySpec(spec: Specification<TReadModel>): Promise<TReadModel[]>;
  findPaginated(
    spec: Specification<TReadModel>,
    options: PaginationOptions
  ): Promise<PaginatedResult<TReadModel>>;

  // Write operations (for projections)
  upsert(id: string, model: TReadModel): Promise<void>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// REPOSITORY FACTORY
// ============================================================================

/**
 * Factory for creating repositories
 */
export interface RepositoryFactory {
  create<TAggregate extends AggregateRoot<TId>, TId>(
    aggregateType: string
  ): Repository<TAggregate, TId>;
}
