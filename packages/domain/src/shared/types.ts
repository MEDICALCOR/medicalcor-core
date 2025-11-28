/**
 * @fileoverview Shared Domain Types
 *
 * World-class TypeScript types for domain services.
 * Provides proper typing for external dependencies and shared patterns.
 *
 * @module domain/shared/types
 */

import type { z } from 'zod';

// ============================================================================
// RESULT PATTERN TYPES
// ============================================================================

/**
 * Success result type for operations that can fail
 * @template T - The type of the successful value
 */
export interface Success<T> {
  readonly success: true;
  readonly value: T;
  readonly error?: never;
}

/**
 * Failure result type for operations that can fail
 * @template E - The type of the error
 */
export interface Failure<E> {
  readonly success: false;
  readonly error: E;
  readonly value?: never;
}

/**
 * Result type - represents either success or failure
 * Use this for operations that can fail instead of throwing exceptions
 *
 * @template T - The type of the successful value
 * @template E - The type of the error (defaults to Error)
 *
 * @example
 * ```typescript
 * async function fetchUser(id: string): Promise<Result<User, NotFoundError>> {
 *   const user = await db.findUser(id);
 *   if (!user) {
 *     return { success: false, error: new NotFoundError('User not found') };
 *   }
 *   return { success: true, value: user };
 * }
 *
 * // Usage
 * const result = await fetchUser('123');
 * if (result.success) {
 *   console.log(result.value.name);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

// ============================================================================
// RESULT PATTERN UTILITIES
// ============================================================================

/**
 * Create a success result
 *
 * @template T - The type of the value
 * @param value - The successful value
 * @returns Success result containing the value
 *
 * @example
 * ```typescript
 * return ok({ id: '123', name: 'John' });
 * ```
 */
export function ok<T>(value: T): Success<T> {
  return { success: true, value };
}

/**
 * Create a failure result
 *
 * @template E - The type of the error
 * @param error - The error
 * @returns Failure result containing the error
 *
 * @example
 * ```typescript
 * return err(new ValidationError('Invalid email'));
 * ```
 */
export function err<E>(error: E): Failure<E> {
  return { success: false, error };
}

/**
 * Check if a result is a success
 *
 * @param result - The result to check
 * @returns True if the result is a success
 */
export function isOk<T, E>(result: Result<T, E>): result is Success<T> {
  return result.success === true;
}

/**
 * Check if a result is a failure
 *
 * @param result - The result to check
 * @returns True if the result is a failure
 */
export function isErr<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.success === false;
}

/**
 * Unwrap a result, throwing if it's a failure
 *
 * @param result - The result to unwrap
 * @returns The successful value
 * @throws The error if the result is a failure
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.success) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value
 *
 * @param result - The result to unwrap
 * @param defaultValue - The default value if the result is a failure
 * @returns The successful value or the default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.success ? result.value : defaultValue;
}

// ============================================================================
// OPENAI CLIENT TYPES
// ============================================================================

/**
 * OpenAI chat message role
 */
export type OpenAIChatRole = 'system' | 'user' | 'assistant' | 'function' | 'tool';

/**
 * OpenAI chat message
 */
export interface OpenAIChatMessage {
  /** The role of the message author */
  role: OpenAIChatRole;
  /** The content of the message */
  content: string;
  /** Optional name for the author */
  name?: string;
}

/**
 * OpenAI chat completion request parameters
 */
export interface OpenAIChatCompletionRequest {
  /** Model to use (e.g., 'gpt-4o', 'gpt-4-turbo') */
  model: string;
  /** Array of messages comprising the conversation */
  messages: OpenAIChatMessage[];
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Nucleus sampling parameter */
  top_p?: number;
  /** Frequency penalty (-2.0 to 2.0) */
  frequency_penalty?: number;
  /** Presence penalty (-2.0 to 2.0) */
  presence_penalty?: number;
  /** Stop sequences */
  stop?: string | string[];
  /** Response format */
  response_format?: { type: 'text' | 'json_object' };
}

/**
 * OpenAI chat completion choice
 */
export interface OpenAIChatCompletionChoice {
  /** Index of the choice */
  index: number;
  /** The generated message */
  message: {
    /** Role of the message (always 'assistant' for completions) */
    role: 'assistant';
    /** Content of the message */
    content: string;
  };
  /** Reason the generation stopped */
  finish_reason: 'stop' | 'length' | 'content_filter' | 'function_call' | 'tool_calls';
}

/**
 * OpenAI chat completion response
 */
export interface OpenAIChatCompletionResponse {
  /** Unique identifier for the completion */
  id: string;
  /** Object type (always 'chat.completion') */
  object: 'chat.completion';
  /** Unix timestamp of creation */
  created: number;
  /** Model used */
  model: string;
  /** Array of completion choices */
  choices: OpenAIChatCompletionChoice[];
  /** Token usage statistics */
  usage?: {
    /** Tokens in the prompt */
    prompt_tokens: number;
    /** Tokens in the completion */
    completion_tokens: number;
    /** Total tokens */
    total_tokens: number;
  };
}

/**
 * OpenAI client interface
 * Abstraction for OpenAI API client to enable testing and dependency injection
 *
 * @example
 * ```typescript
 * const openai: OpenAIClient = {
 *   chat: {
 *     completions: {
 *       create: async (params) => {
 *         return await realOpenAIClient.chat.completions.create(params);
 *       }
 *     }
 *   }
 * };
 * ```
 */
export interface OpenAIClient {
  chat: {
    completions: {
      create: (params: OpenAIChatCompletionRequest) => Promise<OpenAIChatCompletionResponse>;
    };
  };
}

// ============================================================================
// DOMAIN ERROR TYPES
// ============================================================================

/**
 * Domain error codes for structured error handling
 */
export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'CONSENT_REQUIRED'
  | 'CONSENT_EXPIRED'
  | 'CONSENT_WITHDRAWN'
  | 'SCHEDULING_CONFLICT'
  | 'SLOT_UNAVAILABLE'
  | 'AI_SERVICE_ERROR'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';

/**
 * Domain error class with structured error information
 */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DomainError';
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  /**
   * Convert to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Validation error with field-level details
 */
export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly fieldErrors: Record<string, string[]>
  ) {
    super('VALIDATION_ERROR', message, { fieldErrors });
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /**
   * Create from Zod error
   */
  static fromZodError(error: z.ZodError): ValidationError {
    const fieldErrors: Record<string, string[]> = {};

    for (const issue of error.issues) {
      const path = issue.path.join('.');
      const key = path || '_root';
      fieldErrors[key] = fieldErrors[key] ?? [];
      fieldErrors[key].push(issue.message);
    }

    return new ValidationError('Validation failed', fieldErrors);
  }
}

// ============================================================================
// SERVICE CONFIGURATION TYPES
// ============================================================================

/**
 * Base service options interface
 */
export interface BaseServiceOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger instance */
  logger?: {
    debug: (data: object, message: string) => void;
    info: (data: object, message: string) => void;
    warn: (data: object, message: string) => void;
    error: (data: object, message: string) => void;
  };
}

/**
 * Retry configuration for external service calls
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
} as const;

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Sleep for a specified duration
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 *
 * @template T - The return type of the operation
 * @param operation - The async operation to retry
 * @param config - Retry configuration
 * @returns Result of the operation
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < config.maxRetries) {
        await sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }
  }

  throw lastError;
}
