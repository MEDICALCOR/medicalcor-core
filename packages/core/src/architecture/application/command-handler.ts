/**
 * @module architecture/application/command-handler
 *
 * Command Handler Pattern
 * =======================
 *
 * Command Handlers process commands (write operations) in CQRS.
 */

import type {
  Command,
  CommandHandler as ICommandHandler,
  CommandError,
  CommandMetadata,
  ApplicationComponent,
  DomainEvent,
} from '../layers/contracts.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// COMMAND BASE
// ============================================================================

/**
 * Create a command with proper structure
 */
export function createCommand<TPayload>(
  type: string,
  payload: TPayload,
  metadata: Partial<CommandMetadata>
): Command<TPayload> {
  return {
    __layer: 'application',
    commandId: crypto.randomUUID(),
    commandType: type,
    payload,
    metadata: {
      correlationId: metadata.correlationId ?? crypto.randomUUID(),
      causationId: metadata.causationId,
      userId: metadata.userId ?? 'system',
      tenantId: metadata.tenantId,
      timestamp: metadata.timestamp ?? new Date().toISOString(),
      expectedVersion: metadata.expectedVersion,
      idempotencyKey: metadata.idempotencyKey ?? crypto.randomUUID(),
    },
  };
}

// ============================================================================
// COMMAND HANDLER BASE CLASS
// ============================================================================

/**
 * Result of command execution
 */
export interface CommandResult<T = void> {
  readonly success: boolean;
  readonly commandId: string;
  readonly aggregateId?: string;
  readonly version?: number;
  readonly result?: T;
  readonly events: DomainEvent[];
  readonly executionTimeMs: number;
}

/**
 * Abstract base class for command handlers
 */
export abstract class CommandHandler<TPayload, TResult = void>
  implements ICommandHandler<Command<TPayload>, TResult>, ApplicationComponent
{
  readonly __layer = 'application' as const;
  abstract readonly commandType: string;

  /**
   * Handle the command
   */
  abstract handle(command: Command<TPayload>): Promise<Result<TResult, CommandError>>;

  /**
   * Validate the command payload
   */
  protected abstract validate(payload: TPayload): CommandError | null;

  /**
   * Create a success result
   */
  protected success(result: TResult): Result<TResult, CommandError> {
    return Ok(result);
  }

  /**
   * Create an error result
   */
  protected failure(error: CommandError): Result<TResult, CommandError> {
    return Err(error);
  }

  /**
   * Create a validation error
   */
  protected validationError(message: string, details?: Record<string, unknown>): CommandError {
    return {
      code: 'VALIDATION_ERROR',
      message,
      details,
    };
  }

  /**
   * Create a not found error
   */
  protected notFoundError(entityType: string, entityId: string): CommandError {
    return {
      code: 'NOT_FOUND',
      message: `${entityType} with ID ${entityId} not found`,
      details: { entityType, entityId },
    };
  }

  /**
   * Create a concurrency error
   */
  protected concurrencyError(
    aggregateId: string,
    expectedVersion: number,
    actualVersion: number
  ): CommandError {
    return {
      code: 'CONCURRENCY_ERROR',
      message: `Concurrency conflict for aggregate ${aggregateId}`,
      details: { aggregateId, expectedVersion, actualVersion },
    };
  }

  /**
   * Create a business rule violation error
   */
  protected businessRuleError(rule: string, message: string): CommandError {
    return {
      code: 'BUSINESS_RULE_VIOLATION',
      message,
      details: { rule },
    };
  }
}

// ============================================================================
// COMMAND BUS
// ============================================================================

/**
 * Command Bus - Dispatches commands to their handlers
 */
export class CommandBus {
  private handlers = new Map<string, CommandHandler<unknown, unknown>>();
  private middlewares: CommandMiddleware[] = [];

  /**
   * Register a command handler
   */
  register<TPayload, TResult>(handler: CommandHandler<TPayload, TResult>): void {
    this.handlers.set(handler.commandType, handler as CommandHandler<unknown, unknown>);
  }

  /**
   * Add middleware to the bus
   */
  use(middleware: CommandMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Dispatch a command
   */
  async dispatch<TPayload, TResult>(
    command: Command<TPayload>
  ): Promise<Result<CommandResult<TResult>, CommandError>> {
    const handler = this.handlers.get(command.commandType);
    if (!handler) {
      return Err({
        code: 'HANDLER_NOT_FOUND',
        message: `No handler registered for command type: ${command.commandType}`,
      });
    }

    const startTime = Date.now();

    // Execute middleware chain
    const execute = async (): Promise<Result<TResult, CommandError>> => {
      return handler.handle(command) as Promise<Result<TResult, CommandError>>;
    };

    let next = execute;
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      if (!middleware) continue;
      const currentNext = next;
      next = () => middleware.execute(command, currentNext);
    }

    const result = await next();
    const executionTimeMs = Date.now() - startTime;

    if (result.isOk) {
      return Ok({
        success: true,
        commandId: command.commandId,
        result: result.value,
        events: [],
        executionTimeMs,
      });
    }

    return Err(result.error);
  }

  /**
   * Get all registered command types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Command middleware interface
 */
export interface CommandMiddleware {
  execute<TPayload, TResult>(
    command: Command<TPayload>,
    next: () => Promise<Result<TResult, CommandError>>
  ): Promise<Result<TResult, CommandError>>;
}

// ============================================================================
// COMMON COMMAND MIDDLEWARES
// ============================================================================

/**
 * Idempotency middleware - prevents duplicate command execution
 */
export class IdempotencyMiddleware implements CommandMiddleware {
  private processedKeys = new Set<string>();

  constructor(
    private idempotencyStore?: {
      has(key: string): Promise<boolean>;
      set(key: string): Promise<void>;
    }
  ) {}

  async execute<TPayload, TResult>(
    command: Command<TPayload>,
    next: () => Promise<Result<TResult, CommandError>>
  ): Promise<Result<TResult, CommandError>> {
    const key = command.metadata.idempotencyKey;
    if (!key) {
      return next();
    }

    // Check if already processed
    const alreadyProcessed = this.idempotencyStore
      ? await this.idempotencyStore.has(key)
      : this.processedKeys.has(key);

    if (alreadyProcessed) {
      return Err({
        code: 'DUPLICATE_COMMAND',
        message: `Command with idempotency key ${key} has already been processed`,
        details: { idempotencyKey: key },
      });
    }

    const result = await next();

    // Mark as processed on success
    if (result.isOk) {
      if (this.idempotencyStore) {
        await this.idempotencyStore.set(key);
      } else {
        this.processedKeys.add(key);
      }
    }

    return result;
  }
}

/**
 * Authorization middleware
 */
export class AuthorizationMiddleware implements CommandMiddleware {
  constructor(
    private authorizer: {
      canExecute(commandType: string, userId: string, tenantId?: string): Promise<boolean>;
    }
  ) {}

  async execute<TPayload, TResult>(
    command: Command<TPayload>,
    next: () => Promise<Result<TResult, CommandError>>
  ): Promise<Result<TResult, CommandError>> {
    const canExecute = await this.authorizer.canExecute(
      command.commandType,
      command.metadata.userId,
      command.metadata.tenantId
    );

    if (!canExecute) {
      return Err({
        code: 'UNAUTHORIZED',
        message: `User ${command.metadata.userId} is not authorized to execute ${command.commandType}`,
        details: { commandType: command.commandType, userId: command.metadata.userId },
      });
    }

    return next();
  }
}

/**
 * Logging middleware
 */
export class CommandLoggingMiddleware implements CommandMiddleware {
  constructor(
    private logger: {
      info(message: string, context?: object): void;
      error(message: string, context?: object): void;
    }
  ) {}

  async execute<TPayload, TResult>(
    command: Command<TPayload>,
    next: () => Promise<Result<TResult, CommandError>>
  ): Promise<Result<TResult, CommandError>> {
    this.logger.info(`Executing command: ${command.commandType}`, {
      commandId: command.commandId,
      correlationId: command.metadata.correlationId,
    });

    const startTime = Date.now();
    const result = await next();
    const duration = Date.now() - startTime;

    if (result.isOk) {
      this.logger.info(`Command completed: ${command.commandType}`, {
        commandId: command.commandId,
        durationMs: duration,
      });
    } else {
      this.logger.error(`Command failed: ${command.commandType}`, {
        commandId: command.commandId,
        error: result.error.code,
        durationMs: duration,
      });
    }

    return result;
  }
}

/**
 * Validation middleware
 */
export class CommandValidationMiddleware implements CommandMiddleware {
  constructor(private validators: Map<string, (payload: unknown) => CommandError | null>) {}

  async execute<TPayload, TResult>(
    command: Command<TPayload>,
    next: () => Promise<Result<TResult, CommandError>>
  ): Promise<Result<TResult, CommandError>> {
    const validator = this.validators.get(command.commandType);
    if (validator) {
      const error = validator(command.payload);
      if (error) {
        return Err(error);
      }
    }

    return next();
  }
}

// Singleton command bus
export const commandBus = new CommandBus();
