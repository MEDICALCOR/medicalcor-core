/**
 * CQRS Command Bus
 *
 * Handles command dispatching and execution with:
 * - Type-safe command/handler registration
 * - Middleware support (validation, logging, metrics)
 * - Async execution with correlation tracking
 */

import type { ZodSchema } from 'zod';
import type { EventStore, StoredEvent, EventPublisher } from '../event-store.js';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface Command<TPayload = unknown> {
  type: string;
  payload: TPayload;
  metadata: CommandMetadata;
}

export interface CommandMetadata {
  commandId: string;
  correlationId: string;
  causationId?: string | undefined;
  userId?: string | undefined;
  tenantId?: string | undefined;
  timestamp: Date;
  version?: number | undefined;
}

export interface CommandResult<TResult = unknown> {
  success: boolean;
  commandId: string;
  aggregateId?: string | undefined;
  version?: number | undefined;
  result?: TResult | undefined;
  events?: StoredEvent[] | undefined;
  error?:
    | {
        code: string;
        message: string;
        details?: unknown;
      }
    | undefined;
  executionTimeMs: number;
}

export interface CommandContext {
  correlationId: string;
  causationId?: string | undefined;
  userId?: string | undefined;
  tenantId?: string | undefined;
  eventStore: EventStore;
  eventPublisher?: EventPublisher | undefined;
}

export type CommandHandler<TPayload, TResult> = (
  command: Command<TPayload>,
  context: CommandContext
) => Promise<CommandResult<TResult>>;

export type CommandMiddleware = (
  command: Command,
  context: CommandContext,
  next: () => Promise<CommandResult>
) => Promise<CommandResult>;

// ============================================================================
// COMMAND BUS IMPLEMENTATION
// ============================================================================

interface RegisteredHandler {
  handler: CommandHandler<unknown, unknown>;
  schema?: ZodSchema | undefined;
}

export class CommandBus {
  private handlers = new Map<string, RegisteredHandler>();
  private middleware: CommandMiddleware[] = [];

  constructor(
    private eventStore: EventStore,
    private eventPublisher?: EventPublisher
  ) {}

  /**
   * Register a command handler
   */
  register<TPayload, TResult>(
    commandType: string,
    handler: CommandHandler<TPayload, TResult>,
    schema?: ZodSchema<TPayload>
  ): void {
    if (this.handlers.has(commandType)) {
      throw new Error(`Handler for command '${commandType}' already registered`);
    }

    this.handlers.set(commandType, {
      handler: handler as CommandHandler<unknown, unknown>,
      schema,
    });
  }

  /**
   * Add middleware to the command pipeline
   */
  use(middleware: CommandMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Dispatch a command for execution
   */
  async dispatch<TPayload, TResult>(command: Command<TPayload>): Promise<CommandResult<TResult>> {
    const startTime = Date.now();
    const registration = this.handlers.get(command.type);

    if (!registration) {
      return {
        success: false,
        commandId: command.metadata.commandId,
        error: {
          code: 'HANDLER_NOT_FOUND',
          message: `No handler registered for command '${command.type}'`,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Validate payload if schema provided
    if (registration.schema) {
      const validation = registration.schema.safeParse(command.payload);
      if (!validation.success) {
        return {
          success: false,
          commandId: command.metadata.commandId,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Command payload validation failed',
            details: validation.error.flatten(),
          },
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    const context: CommandContext = {
      correlationId: command.metadata.correlationId,
      causationId: command.metadata.causationId,
      userId: command.metadata.userId,
      tenantId: command.metadata.tenantId,
      eventStore: this.eventStore,
      eventPublisher: this.eventPublisher,
    };

    // Build middleware chain
    const executeHandler = async (): Promise<CommandResult> => {
      return registration.handler(command, context);
    };

    const chain = this.middleware.reduceRight<() => Promise<CommandResult>>(
      (next, mw) => () => mw(command, context, next),
      executeHandler
    );

    try {
      const result = await chain();
      return {
        ...result,
        executionTimeMs: Date.now() - startTime,
      } as CommandResult<TResult>;
    } catch (error) {
      return {
        success: false,
        commandId: command.metadata.commandId,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Helper to create and dispatch a command
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  async send<TPayload, TResult>(
    type: string,
    payload: TPayload,
    metadata: Partial<CommandMetadata> = {}
  ): Promise<CommandResult<TResult>> {
    const command: Command<TPayload> = {
      type,
      payload,
      metadata: {
        commandId: metadata.commandId ?? crypto.randomUUID(),
        correlationId: metadata.correlationId ?? crypto.randomUUID(),
        causationId: metadata.causationId,
        userId: metadata.userId,
        tenantId: metadata.tenantId,
        timestamp: metadata.timestamp ?? new Date(),
        version: metadata.version,
      },
    };

    return this.dispatch(command);
  }

  /**
   * Check if a handler is registered for a command type
   */
  hasHandler(commandType: string): boolean {
    return this.handlers.has(commandType);
  }

  /**
   * Get list of registered command types
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ============================================================================
// BUILT-IN MIDDLEWARE
// ============================================================================

/**
 * Logging middleware
 */
export function loggingMiddleware(logger: {
  info: (obj: unknown, msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}): CommandMiddleware {
  return async (command, context, next) => {
    logger.info(
      {
        commandType: command.type,
        commandId: command.metadata.commandId,
        correlationId: context.correlationId,
      },
      'Command received'
    );

    const result = await next();

    if (result.success) {
      logger.info(
        {
          commandType: command.type,
          commandId: command.metadata.commandId,
          aggregateId: result.aggregateId,
          eventCount: result.events?.length ?? 0,
          executionTimeMs: result.executionTimeMs,
        },
        'Command executed successfully'
      );
    } else {
      logger.error(
        {
          commandType: command.type,
          commandId: command.metadata.commandId,
          error: result.error,
        },
        'Command execution failed'
      );
    }

    return result;
  };
}

/**
 * Retry middleware for transient failures
 */
export function retryMiddleware(options: {
  maxRetries: number;
  retryableErrors: string[];
  backoffMs: number;
}): CommandMiddleware {
  return async (_command, _context, next) => {
    let lastError: CommandResult | undefined;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      const result = await next();

      if (result.success) {
        return result;
      }

      if (!options.retryableErrors.includes(result.error?.code ?? '')) {
        return result;
      }

      lastError = result;

      if (attempt < options.maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.backoffMs * Math.pow(2, attempt))
        );
      }
    }

    return lastError!;
  };
}

/**
 * Idempotency cache entry with timestamp for TTL expiration
 */
export interface IdempotencyCacheEntry {
  result: CommandResult;
  timestamp: number;
}

/**
 * Default idempotency cache TTL: 1 hour
 */
const DEFAULT_IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;

/**
 * Maximum cache size to prevent memory exhaustion
 */
const MAX_IDEMPOTENCY_CACHE_SIZE = 10000;

/**
 * Idempotency middleware with TTL-based expiration
 * SECURITY FIX: Added TTL and max size to prevent memory leak DoS
 */
export function idempotencyMiddleware(
  cache: Map<string, IdempotencyCacheEntry>,
  options?: { ttlMs?: number; maxSize?: number }
): CommandMiddleware {
  const ttlMs = options?.ttlMs ?? DEFAULT_IDEMPOTENCY_TTL_MS;
  const maxSize = options?.maxSize ?? MAX_IDEMPOTENCY_CACHE_SIZE;
  let lastCleanup = Date.now();

  return async (command, _context, next) => {
    const key = `${command.type}:${command.metadata.commandId}`;
    const now = Date.now();

    // Periodic cleanup of expired entries (every 5 minutes)
    if (now - lastCleanup > 5 * 60 * 1000) {
      lastCleanup = now;
      for (const [k, entry] of cache) {
        if (now - entry.timestamp > ttlMs) {
          cache.delete(k);
        }
      }
    }

    // Check for cached result (if not expired)
    const cached = cache.get(key);
    if (cached && now - cached.timestamp <= ttlMs) {
      return cached.result;
    }

    const result = await next();

    if (result.success) {
      // Evict oldest entries if cache is full
      if (cache.size >= maxSize) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [k, entry] of cache) {
          if (entry.timestamp < oldestTime) {
            oldestTime = entry.timestamp;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          cache.delete(oldestKey);
        }
      }
      cache.set(key, { result, timestamp: now });
    }

    return result;
  };
}

// ============================================================================
// COMMAND HELPERS
// ============================================================================

/**
 * Create a typed command factory
 */
export function defineCommand<TPayload>(type: string, schema: ZodSchema<TPayload>) {
  return {
    type,
    schema,
    create(payload: TPayload, metadata: Partial<CommandMetadata> = {}): Command<TPayload> {
      return {
        type,
        payload,
        metadata: {
          commandId: metadata.commandId ?? crypto.randomUUID(),
          correlationId: metadata.correlationId ?? crypto.randomUUID(),
          causationId: metadata.causationId,
          userId: metadata.userId,
          tenantId: metadata.tenantId,
          timestamp: metadata.timestamp ?? new Date(),
          version: metadata.version,
        },
      };
    },
  };
}

// ============================================================================
// FACTORY
// ============================================================================

export function createCommandBus(
  eventStore: EventStore,
  eventPublisher?: EventPublisher
): CommandBus {
  return new CommandBus(eventStore, eventPublisher);
}
