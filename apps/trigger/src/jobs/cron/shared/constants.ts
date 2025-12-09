/**
 * Constants for cron job processing
 */

/**
 * Batch size for parallel API calls
 * Prevents overwhelming external services while improving throughput
 */
export const BATCH_SIZE = 10;

/**
 * Retry configuration for batch item processing
 */
export const RETRY_CONFIG: {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
} = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};
