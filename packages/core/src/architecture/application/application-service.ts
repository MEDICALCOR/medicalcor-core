/**
 * @module architecture/application/application-service
 *
 * Application Service
 * ===================
 *
 * Application Services coordinate domain objects and infrastructure
 * to implement use cases. They manage transactions and cross-cutting concerns.
 */

import type { ApplicationComponent, DomainEvent } from '../layers/contracts.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// APPLICATION SERVICE BASE CLASS
// ============================================================================

/**
 * Abstract base class for application services
 */
export abstract class ApplicationService implements ApplicationComponent {
  readonly __layer = 'application' as const;
  abstract readonly serviceName: string;

  protected events: DomainEvent[] = [];

  /**
   * Collect a domain event to be published after transaction commit
   */
  protected collectEvent(event: DomainEvent): void {
    this.events.push(event);
  }

  /**
   * Get and clear collected events
   */
  protected flushEvents(): DomainEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /**
   * Create an application service error
   */
  protected error(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): ApplicationServiceError {
    return { code, message, serviceName: this.serviceName, details };
  }
}

export interface ApplicationServiceError {
  code: string;
  message: string;
  serviceName: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// TRANSACTIONAL APPLICATION SERVICE
// ============================================================================

/**
 * Application service with transaction management
 */
export abstract class TransactionalApplicationService extends ApplicationService {
  constructor(protected readonly unitOfWork: UnitOfWork) {
    super();
  }

  /**
   * Execute within a transaction
   */
  protected async withTransaction<T>(
    operation: () => Promise<Result<T, ApplicationServiceError>>
  ): Promise<Result<T, ApplicationServiceError>> {
    try {
      await this.unitOfWork.begin();
      const result = await operation();

      if (result.isOk) {
        await this.unitOfWork.commit();
        // Publish events after successful commit
        const events = this.flushEvents();
        await this.publishEvents(events);
      } else {
        await this.unitOfWork.rollback();
      }

      return result;
    } catch (error) {
      await this.unitOfWork.rollback();
      return Err(
        this.error('TRANSACTION_ERROR', 'Transaction failed', {
          cause: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Publish collected events (override to implement)
   */
  protected async publishEvents(events: DomainEvent[]): Promise<void> {
    // Default: no-op. Override to publish to event bus
  }
}

export interface UnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isActive(): boolean;
}

// ============================================================================
// EVENT PUBLISHING APPLICATION SERVICE
// ============================================================================

/**
 * Application service with event publishing support
 */
export abstract class EventPublishingApplicationService extends TransactionalApplicationService {
  constructor(
    unitOfWork: UnitOfWork,
    protected readonly eventBus: EventBus
  ) {
    super(unitOfWork);
  }

  protected async publishEvents(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.eventBus.publish(event);
    }
  }
}

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: DomainEvent[]): Promise<void>;
}

// ============================================================================
// APPLICATION SERVICE COMPOSITION
// ============================================================================

/**
 * Compose multiple application services
 */
export class ApplicationServiceComposer {
  private services = new Map<string, ApplicationService>();

  /**
   * Register a service
   */
  register(service: ApplicationService): void {
    this.services.set(service.serviceName, service);
  }

  /**
   * Get a service by name
   */
  get<T extends ApplicationService>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Execute a cross-service operation
   */
  async execute<T>(
    serviceNames: string[],
    operation: (
      services: Map<string, ApplicationService>
    ) => Promise<Result<T, ApplicationServiceError>>
  ): Promise<Result<T, ApplicationServiceError>> {
    const requiredServices = new Map<string, ApplicationService>();

    for (const name of serviceNames) {
      const service = this.services.get(name);
      if (!service) {
        return Err({
          code: 'SERVICE_NOT_FOUND',
          message: `Service ${name} not found`,
          serviceName: 'ApplicationServiceComposer',
        });
      }
      requiredServices.set(name, service);
    }

    return operation(requiredServices);
  }
}

// ============================================================================
// APPLICATION SERVICE DECORATORS
// ============================================================================

/**
 * Retry decorator for application service methods
 */
export function Retry(maxAttempts = 3, delayMs = 100) {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (
      ...args: unknown[]
    ) => Promise<Result<unknown, ApplicationServiceError>>;

    descriptor.value = async function (
      this: ApplicationService,
      ...args: unknown[]
    ): Promise<Result<unknown, ApplicationServiceError>> {
      let lastError: ApplicationServiceError | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await original.apply(this, args);

        if (result.isOk) {
          return result;
        }

        lastError = result.error;

        // Only retry on transient errors
        if (!isTransientError(lastError)) {
          return result;
        }

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        }
      }

      return Err(lastError!);
    };

    return descriptor;
  };
}

function isTransientError(error: ApplicationServiceError): boolean {
  const transientCodes = [
    'CONNECTION_ERROR',
    'TIMEOUT',
    'SERVICE_UNAVAILABLE',
    'TRANSACTION_ERROR',
  ];
  return transientCodes.includes(error.code);
}

/**
 * Timeout decorator for application service methods
 */
export function Timeout(timeoutMs: number) {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (
      ...args: unknown[]
    ) => Promise<Result<unknown, ApplicationServiceError>>;

    descriptor.value = async function (
      this: ApplicationService,
      ...args: unknown[]
    ): Promise<Result<unknown, ApplicationServiceError>> {
      const timeoutPromise = new Promise<Result<unknown, ApplicationServiceError>>((resolve) => {
        setTimeout(() => {
          resolve(
            Err({
              code: 'TIMEOUT',
              message: `Operation ${String(propertyKey)} timed out after ${timeoutMs}ms`,
              serviceName: this.serviceName,
            })
          );
        }, timeoutMs);
      });

      return Promise.race([original.apply(this, args), timeoutPromise]);
    };

    return descriptor;
  };
}

/**
 * Circuit breaker decorator for application service methods
 */
export function CircuitBreaker(failureThreshold = 5, resetTimeoutMs = 30000) {
  const state = {
    failures: 0,
    lastFailure: 0,
    isOpen: false,
  };

  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (
      ...args: unknown[]
    ) => Promise<Result<unknown, ApplicationServiceError>>;

    descriptor.value = async function (
      this: ApplicationService,
      ...args: unknown[]
    ): Promise<Result<unknown, ApplicationServiceError>> {
      // Check if circuit is open
      if (state.isOpen) {
        const timeSinceLastFailure = Date.now() - state.lastFailure;
        if (timeSinceLastFailure < resetTimeoutMs) {
          return Err({
            code: 'CIRCUIT_OPEN',
            message: `Circuit breaker is open for ${String(propertyKey)}`,
            serviceName: this.serviceName,
          });
        }
        // Try to reset
        state.isOpen = false;
        state.failures = 0;
      }

      const result = await original.apply(this, args);

      if (result.isErr) {
        state.failures++;
        state.lastFailure = Date.now();

        if (state.failures >= failureThreshold) {
          state.isOpen = true;
        }
      } else {
        state.failures = 0;
      }

      return result;
    };

    return descriptor;
  };
}

// ============================================================================
// APPLICATION SERVICE REGISTRY
// ============================================================================

/**
 * Registry for application services
 */
export class ApplicationServiceRegistry {
  private services = new Map<string, ApplicationService>();

  /**
   * Register a service
   */
  register(service: ApplicationService): void {
    this.services.set(service.serviceName, service);
  }

  /**
   * Get a service by name
   */
  get<T extends ApplicationService>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}

// Singleton registry
export const applicationServiceRegistry = new ApplicationServiceRegistry();
