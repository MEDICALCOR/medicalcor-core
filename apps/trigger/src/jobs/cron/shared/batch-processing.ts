/**
 * Batch processing utilities with retry logic
 */

import crypto from 'crypto';
import { BATCH_SIZE, RETRY_CONFIG } from './constants.js';

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on network errors, rate limits, and server errors
    if (message.includes('rate_limit') || message.includes('429')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('502') || message.includes('503') || message.includes('504')) return true;
    if (message.includes('network') || message.includes('econnreset')) return true;
    if (message.includes('socket hang up')) return true;
  }
  return false;
}

/**
 * Execute a function with exponential backoff retry
 * @param fn - Async function to execute
 * @param maxRetries - Maximum retry attempts
 * @param baseDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Result of the function
 */
export async function withExponentialRetry<T>(
  fn: () => Promise<T>,
  maxRetries = RETRY_CONFIG.maxRetries,
  baseDelayMs = RETRY_CONFIG.baseDelayMs,
  maxDelayMs = RETRY_CONFIG.maxDelayMs
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if error is retryable
      const canRetry = isRetryableError(error);
      if (!canRetry) {
        break;
      }

      // SECURITY: Use crypto-secure randomness for jitter calculation
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const randomBytes = new Uint32Array(1);
      crypto.getRandomValues(randomBytes);
      const jitter = (randomBytes[0]! / 0xffffffff) * 0.3 * exponentialDelay; // 30% jitter
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Process items in batches using Promise.allSettled for resilience
 * CRITICAL FIX: Now includes exponential backoff retry for individual items
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param loggerInstance - Logger for batch progress
 * @param options - Processing options
 * @returns Object with success count and errors array
 */
export async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  loggerInstance: { info: (msg: string, meta?: Record<string, unknown>) => void },
  options: {
    enableRetry?: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
  } = {}
): Promise<{ successes: number; errors: { item: T; error: unknown }[] }> {
  const {
    enableRetry = true,
    maxRetries = RETRY_CONFIG.maxRetries,
    baseDelayMs = RETRY_CONFIG.baseDelayMs,
  } = options;

  let successes = 0;
  const errors: { item: T; error: unknown }[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    loggerInstance.info(`Processing batch ${batchNum}/${totalBatches}`, {
      batchSize: batch.length,
    });

    // Wrap processor with retry logic if enabled
    const processWithRetry = enableRetry
      ? (item: T) => withExponentialRetry(() => processor(item), maxRetries, baseDelayMs)
      : processor;

    const results = await Promise.allSettled(batch.map(processWithRetry));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result?.status === 'fulfilled') {
        successes++;
      } else if (result?.status === 'rejected') {
        errors.push({ item: batch[j] as T, error: result.reason });
      }
    }
  }

  return { successes, errors };
}
