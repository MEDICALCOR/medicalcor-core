/**
 * @module architecture/application/use-case
 *
 * Use Case Pattern
 * ================
 *
 * Use Cases represent application-level operations.
 * They orchestrate domain logic to fulfill business requirements.
 */

import type {
  UseCase as IUseCase,
  UseCaseError,
  ApplicationComponent,
  RequestContext,
} from '../layers/contracts.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// USE CASE BASE CLASS
// ============================================================================

/**
 * Abstract base class for all use cases
 */
export abstract class UseCase<TRequest, TResponse>
  implements IUseCase<TRequest, TResponse>, ApplicationComponent
{
  readonly __layer = 'application' as const;
  abstract readonly useCaseName: string;

  /**
   * Execute the use case
   */
  abstract execute(request: TRequest): Promise<Result<TResponse, UseCaseError>>;

  /**
   * Validate the request before execution
   */
  protected abstract validate(request: TRequest): UseCaseError[];

  /**
   * Create a success result
   */
  protected success(data: TResponse): Result<TResponse, UseCaseError> {
    return Ok(data);
  }

  /**
   * Create an error result
   */
  protected failure(error: UseCaseError): Result<TResponse, UseCaseError> {
    return Err(error);
  }

  /**
   * Create a validation error
   */
  protected validationError(message: string, details?: Record<string, unknown>): UseCaseError {
    return {
      code: 'VALIDATION_ERROR',
      message,
      category: 'validation',
      details,
    };
  }

  /**
   * Create a not found error
   */
  protected notFoundError(entityType: string, entityId: string): UseCaseError {
    return {
      code: 'NOT_FOUND',
      message: `${entityType} with ID ${entityId} not found`,
      category: 'not_found',
      details: { entityType, entityId },
    };
  }

  /**
   * Create an authorization error
   */
  protected authorizationError(message: string): UseCaseError {
    return {
      code: 'UNAUTHORIZED',
      message,
      category: 'authorization',
    };
  }

  /**
   * Create a business rule violation error
   */
  protected businessRuleError(rule: string, message: string): UseCaseError {
    return {
      code: 'BUSINESS_RULE_VIOLATION',
      message,
      category: 'business_rule',
      details: { rule },
    };
  }

  /**
   * Create a conflict error
   */
  protected conflictError(message: string, details?: Record<string, unknown>): UseCaseError {
    return {
      code: 'CONFLICT',
      message,
      category: 'conflict',
      details,
    };
  }

  /**
   * Create an infrastructure error
   */
  protected infrastructureError(message: string, cause?: Error): UseCaseError {
    return {
      code: 'INFRASTRUCTURE_ERROR',
      message,
      category: 'infrastructure',
      details: cause ? { cause: cause.message } : undefined,
    };
  }
}

// ============================================================================
// AUTHORIZED USE CASE
// ============================================================================

/**
 * Use case with authorization support
 */
export abstract class AuthorizedUseCase<TRequest, TResponse> extends UseCase<TRequest, TResponse> {
  /**
   * Check if the user is authorized to execute this use case
   */
  protected abstract authorize(request: TRequest, context: RequestContext): boolean;

  /**
   * Get required permissions for this use case
   */
  protected abstract getRequiredPermissions(): string[];

  /**
   * Execute with authorization check
   */
  async executeWithAuth(
    request: TRequest,
    context: RequestContext
  ): Promise<Result<TResponse, UseCaseError>> {
    // Check authorization
    if (!this.authorize(request, context)) {
      return this.failure(
        this.authorizationError(
          `Not authorized to execute ${this.useCaseName}. Required permissions: ${this.getRequiredPermissions().join(', ')}`
        )
      );
    }

    return this.execute(request);
  }
}

// ============================================================================
// TRANSACTIONAL USE CASE
// ============================================================================

/**
 * Use case that runs within a transaction
 */
export abstract class TransactionalUseCase<TRequest, TResponse> extends UseCase<
  TRequest,
  TResponse
> {
  /**
   * Get the unit of work for transaction management
   */
  protected abstract getUnitOfWork(): UnitOfWork;

  /**
   * Execute within a transaction
   */
  async executeInTransaction(request: TRequest): Promise<Result<TResponse, UseCaseError>> {
    const uow = this.getUnitOfWork();

    try {
      await uow.begin();
      const result = await this.execute(request);

      if (result.isOk) {
        await uow.commit();
      } else {
        await uow.rollback();
      }

      return result;
    } catch (error) {
      await uow.rollback();
      return this.failure(
        this.infrastructureError('Transaction failed', error instanceof Error ? error : undefined)
      );
    }
  }
}

interface UnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// ============================================================================
// USE CASE PIPELINE
// ============================================================================

/**
 * Middleware for use case execution
 */
export interface UseCaseMiddleware<TRequest, TResponse> {
  execute(
    request: TRequest,
    next: () => Promise<Result<TResponse, UseCaseError>>
  ): Promise<Result<TResponse, UseCaseError>>;
}

/**
 * Use case with middleware support
 */
export class UseCasePipeline<TRequest, TResponse> {
  private middlewares: UseCaseMiddleware<TRequest, TResponse>[] = [];
  private useCase: UseCase<TRequest, TResponse>;

  constructor(useCase: UseCase<TRequest, TResponse>) {
    this.useCase = useCase;
  }

  /**
   * Add middleware to the pipeline
   */
  use(middleware: UseCaseMiddleware<TRequest, TResponse>): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Execute the pipeline
   */
  async execute(request: TRequest): Promise<Result<TResponse, UseCaseError>> {
    const executeNext = async (index: number): Promise<Result<TResponse, UseCaseError>> => {
      if (index >= this.middlewares.length) {
        return this.useCase.execute(request);
      }

      const middleware = this.middlewares[index];
      if (!middleware) {
        return this.useCase.execute(request);
      }

      return middleware.execute(request, () => executeNext(index + 1));
    };

    return executeNext(0);
  }
}

// ============================================================================
// COMMON MIDDLEWARES
// ============================================================================

/**
 * Validation middleware
 */
export class ValidationMiddleware<TRequest, TResponse>
  implements UseCaseMiddleware<TRequest, TResponse>
{
  constructor(private validator: (request: TRequest) => UseCaseError[]) {}

  async execute(
    request: TRequest,
    next: () => Promise<Result<TResponse, UseCaseError>>
  ): Promise<Result<TResponse, UseCaseError>> {
    const errors = this.validator(request);
    if (errors.length > 0) {
      return Err(errors[0]!);
    }
    return next();
  }
}

/**
 * Logging middleware
 */
export class LoggingMiddleware<TRequest, TResponse>
  implements UseCaseMiddleware<TRequest, TResponse>
{
  constructor(
    private useCaseName: string,
    private logger: { info: (msg: string, data?: object) => void }
  ) {}

  async execute(
    request: TRequest,
    next: () => Promise<Result<TResponse, UseCaseError>>
  ): Promise<Result<TResponse, UseCaseError>> {
    const startTime = Date.now();
    this.logger.info(`[${this.useCaseName}] Starting execution`);

    const result = await next();

    const duration = Date.now() - startTime;
    if (result.isOk) {
      this.logger.info(`[${this.useCaseName}] Completed successfully`, { durationMs: duration });
    } else {
      this.logger.info(`[${this.useCaseName}] Failed`, {
        durationMs: duration,
        error: result.error.code,
      });
    }

    return result;
  }
}

/**
 * Metrics middleware
 */
export class MetricsMiddleware<TRequest, TResponse>
  implements UseCaseMiddleware<TRequest, TResponse>
{
  constructor(
    private useCaseName: string,
    private metrics: {
      recordDuration: (name: string, duration: number) => void;
      incrementCounter: (name: string, labels: Record<string, string>) => void;
    }
  ) {}

  async execute(
    request: TRequest,
    next: () => Promise<Result<TResponse, UseCaseError>>
  ): Promise<Result<TResponse, UseCaseError>> {
    const startTime = Date.now();

    const result = await next();

    const duration = Date.now() - startTime;
    this.metrics.recordDuration(`usecase_duration_${this.useCaseName}`, duration);
    this.metrics.incrementCounter('usecase_executions', {
      useCase: this.useCaseName,
      status: result.isOk ? 'success' : 'failure',
    });

    return result;
  }
}

// ============================================================================
// USE CASE REGISTRY
// ============================================================================

/**
 * Registry for use cases
 */
export class UseCaseRegistry {
  private useCases = new Map<string, UseCase<unknown, unknown>>();

  /**
   * Register a use case
   */
  register<TRequest, TResponse>(useCase: UseCase<TRequest, TResponse>): void {
    this.useCases.set(useCase.useCaseName, useCase as UseCase<unknown, unknown>);
  }

  /**
   * Get a use case by name
   */
  get<TRequest, TResponse>(name: string): UseCase<TRequest, TResponse> | undefined {
    return this.useCases.get(name) as UseCase<TRequest, TResponse> | undefined;
  }

  /**
   * Get all registered use case names
   */
  getNames(): string[] {
    return Array.from(this.useCases.keys());
  }
}

// Singleton registry
export const useCaseRegistry = new UseCaseRegistry();
