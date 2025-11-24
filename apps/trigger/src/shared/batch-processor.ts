/**
 * Batch Processing Utilities for Trigger Jobs
 *
 * Provides resilient batch processing with controlled concurrency
 * to prevent overwhelming external services.
 */

/**
 * Batch size for parallel API calls
 * Prevents overwhelming external services while improving throughput
 */
export const BATCH_SIZE = 10;

/**
 * Result of batch processing operation
 */
export interface BatchResult<T> {
  successes: number;
  errors: Array<{ item: T; error: unknown }>;
}

/**
 * Logger interface for batch processing
 */
export interface BatchLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Process items in batches using Promise.allSettled for resilience
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param logger - Logger for progress tracking
 * @returns Object with success count and errors array
 *
 * @example
 * ```typescript
 * const result = await processBatch(
 *   contacts,
 *   async (contact) => {
 *     await sendReminder(contact);
 *   },
 *   logger
 * );
 * console.log(`Processed ${result.successes}, errors: ${result.errors.length}`);
 * ```
 */
export async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  logger: BatchLogger
): Promise<BatchResult<T>> {
  let successes = 0;
  const errors: Array<{ item: T; error: unknown }> = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    logger.info(`Processing batch ${batchNum}/${totalBatches}`, { batchSize: batch.length });

    const results = await Promise.allSettled(batch.map(processor));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result && result.status === 'fulfilled') {
        successes++;
      } else if (result && result.status === 'rejected') {
        errors.push({ item: batch[j] as T, error: result.reason });
      }
    }
  }

  return { successes, errors };
}
