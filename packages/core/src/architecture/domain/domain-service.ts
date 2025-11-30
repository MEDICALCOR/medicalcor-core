/**
 * @module architecture/domain/domain-service
 *
 * Domain Service Base
 * ===================
 *
 * Domain Services contain domain logic that doesn't naturally belong
 * to any single Entity or Value Object. They are stateless and operate
 * on domain objects.
 */

import type { DomainService as IDomainService, DomainComponent } from '../layers/contracts.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// DOMAIN SERVICE BASE CLASS
// ============================================================================

/**
 * Abstract base class for domain services
 */
export abstract class DomainServiceBase implements IDomainService, DomainComponent {
  readonly __layer = 'domain' as const;
  abstract readonly serviceName: string;

  /**
   * Validate preconditions before executing service logic
   */
  protected validatePreconditions(
    ...conditions: PreconditionCheck[]
  ): Result<void, DomainServiceError> {
    for (const condition of conditions) {
      if (!condition.check()) {
        return Err({
          code: 'PRECONDITION_FAILED',
          serviceName: this.serviceName,
          message: condition.message,
          details: condition.details,
        });
      }
    }
    return Ok(undefined);
  }

  /**
   * Log service operation (can be overridden for custom logging)
   */
  protected logOperation(_operation: string, _context: Record<string, unknown>): void {
    // By default, do nothing (pure domain services shouldn't log)
    // Override in subclasses if logging is needed
  }
}

export interface PreconditionCheck {
  check: () => boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface DomainServiceError {
  code: string;
  serviceName: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}

// ============================================================================
// POLICY PATTERN
// ============================================================================

/**
 * Policy interface - encapsulates a business rule
 */
export interface Policy<TInput, TOutput> {
  readonly policyName: string;
  evaluate(input: TInput): TOutput;
}

/**
 * Abstract base class for policies
 */
export abstract class PolicyBase<TInput, TOutput>
  implements Policy<TInput, TOutput>, DomainComponent
{
  readonly __layer = 'domain' as const;
  abstract readonly policyName: string;

  abstract evaluate(input: TInput): TOutput;

  /**
   * Chain multiple policies
   */
  andThen<TNext>(next: Policy<TOutput, TNext>): Policy<TInput, TNext> {
    const self = this;
    return {
      policyName: `${self.policyName}_then_${next.policyName}`,
      evaluate(input: TInput): TNext {
        const intermediate = self.evaluate(input);
        return next.evaluate(intermediate);
      },
    };
  }
}

/**
 * Validation policy that returns Result
 */
export abstract class ValidationPolicy<TInput> extends PolicyBase<
  TInput,
  Result<TInput, ValidationError>
> {
  abstract validate(input: TInput): ValidationError[];

  evaluate(input: TInput): Result<TInput, ValidationError> {
    const errors = this.validate(input);
    if (errors.length > 0) {
      return Err(errors[0]!);
    }
    return Ok(input);
  }
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// ============================================================================
// CALCULATION SERVICES
// ============================================================================

/**
 * Service that performs a calculation
 */
export abstract class CalculationService<TInput, TResult> extends DomainServiceBase {
  /**
   * Perform the calculation
   */
  abstract calculate(input: TInput): Result<TResult, CalculationError>;

  /**
   * Validate input before calculation
   */
  protected abstract validateInput(input: TInput): ValidationError[];
}

export interface CalculationError {
  code: string;
  message: string;
  input?: unknown;
}

// ============================================================================
// SCORING SERVICES
// ============================================================================

/**
 * Service that calculates a score
 */
export abstract class ScoringService<TInput, TScore> extends CalculationService<TInput, TScore> {
  /**
   * Get the scoring algorithm name
   */
  abstract readonly algorithmName: string;

  /**
   * Get the scoring algorithm version
   */
  abstract readonly algorithmVersion: string;

  /**
   * Get scoring explanation for auditability
   */
  abstract explain(input: TInput): ScoringExplanation;
}

export interface ScoringExplanation {
  algorithmName: string;
  algorithmVersion: string;
  inputFactors: ScoringFactor[];
  calculation: string;
  finalScore: number;
  confidence: number;
}

export interface ScoringFactor {
  name: string;
  value: unknown;
  weight: number;
  contribution: number;
}

// ============================================================================
// STRATEGY PATTERN
// ============================================================================

/**
 * Strategy interface
 */
export interface Strategy<TContext, TResult> {
  readonly strategyName: string;
  execute(context: TContext): TResult;
}

/**
 * Strategy selector - chooses the right strategy based on context
 */
export class StrategySelector<TContext, TResult> {
  private strategies: {
    predicate: (context: TContext) => boolean;
    strategy: Strategy<TContext, TResult>;
    priority: number;
  }[] = [];

  private defaultStrategy?: Strategy<TContext, TResult>;

  /**
   * Register a strategy with a predicate
   */
  register(
    predicate: (context: TContext) => boolean,
    strategy: Strategy<TContext, TResult>,
    priority = 0
  ): void {
    this.strategies.push({ predicate, strategy, priority });
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Set the default strategy
   */
  setDefault(strategy: Strategy<TContext, TResult>): void {
    this.defaultStrategy = strategy;
  }

  /**
   * Select and execute the appropriate strategy
   */
  execute(context: TContext): Result<TResult, StrategyError> {
    for (const { predicate, strategy } of this.strategies) {
      if (predicate(context)) {
        return Ok(strategy.execute(context));
      }
    }

    if (this.defaultStrategy) {
      return Ok(this.defaultStrategy.execute(context));
    }

    return Err({
      code: 'NO_STRATEGY_FOUND',
      message: 'No applicable strategy found for the given context',
      context,
    });
  }
}

export interface StrategyError {
  code: string;
  message: string;
  context: unknown;
}

// ============================================================================
// DOMAIN SERVICE COMPOSITION
// ============================================================================

/**
 * Compose multiple domain services into a pipeline
 */
export class ServicePipeline<TInput, TOutput> {
  private steps: PipelineStep<unknown, unknown>[] = [];

  /**
   * Add a step to the pipeline
   */
  pipe<TNext>(
    service: DomainServiceBase & { execute: (input: TOutput) => Result<TNext, DomainServiceError> }
  ): ServicePipeline<TInput, TNext> {
    this.steps.push({
      serviceName: service.serviceName,
      execute: service.execute.bind(service) as (
        input: unknown
      ) => Result<unknown, DomainServiceError>,
    });
    return this as unknown as ServicePipeline<TInput, TNext>;
  }

  /**
   * Execute the pipeline
   */
  execute(input: TInput): Result<TOutput, DomainServiceError> {
    let current: unknown = input;

    for (const step of this.steps) {
      const result = step.execute(current);
      if (result.isErr) {
        return result as Result<TOutput, DomainServiceError>;
      }
      current = result.value;
    }

    return Ok(current as TOutput);
  }
}

interface PipelineStep<TIn, TOut> {
  serviceName: string;
  execute: (input: TIn) => Result<TOut, DomainServiceError>;
}

// ============================================================================
// DOMAIN SERVICE REGISTRY
// ============================================================================

/**
 * Registry for domain services
 */
export class DomainServiceRegistry {
  private services = new Map<string, DomainServiceBase>();

  /**
   * Register a service
   */
  register(service: DomainServiceBase): void {
    this.services.set(service.serviceName, service);
  }

  /**
   * Get a service by name
   */
  get<T extends DomainServiceBase>(name: string): T | undefined {
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
export const domainServiceRegistry = new DomainServiceRegistry();
