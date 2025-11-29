/**
 * Batch Insert Utilities
 *
 * Optimized batch insert operations for large datasets with:
 * - Automatic chunking to avoid memory issues
 * - Transaction support for atomicity
 * - Progress callbacks for monitoring
 * - Error handling with partial success
 *
 * @module batch-insert
 */

import { createDatabaseClient, withTransaction, type TransactionClient } from './database.js';
import { createLogger } from './logger.js';

const logger = createLogger({ name: 'batch-insert' });

/**
 * Options for batch insert operations
 */
export interface BatchInsertOptions<T> {
  /**
   * Table name to insert into
   */
  table: string;

  /**
   * Column names in order
   */
  columns: string[];

  /**
   * Function to extract values from an item in column order
   */
  getValues: (item: T) => unknown[];

  /**
   * Items per batch (default: 1000)
   */
  chunkSize?: number;

  /**
   * Use a transaction for the entire operation (default: true)
   */
  useTransaction?: boolean;

  /**
   * Conflict handling strategy
   */
  onConflict?: {
    /**
     * Columns that form the unique constraint
     */
    columns: string[];

    /**
     * Action to take on conflict
     */
    action: 'DO NOTHING' | 'DO UPDATE';

    /**
     * Columns to update on conflict (if action is DO UPDATE)
     */
    updateColumns?: string[];
  };

  /**
   * Progress callback
   */
  onProgress?: (progress: BatchProgress) => void;
}

/**
 * Progress information for batch operations
 */
export interface BatchProgress {
  /**
   * Total items to process
   */
  total: number;

  /**
   * Items processed so far
   */
  processed: number;

  /**
   * Successful inserts
   */
  inserted: number;

  /**
   * Skipped due to conflict
   */
  skipped: number;

  /**
   * Failed inserts
   */
  failed: number;

  /**
   * Current batch number
   */
  batchNumber: number;

  /**
   * Total batches
   */
  totalBatches: number;

  /**
   * Percentage complete (0-100)
   */
  percentComplete: number;
}

/**
 * Result of batch insert operation
 */
export interface BatchInsertResult {
  /**
   * Whether the operation completed successfully
   */
  success: boolean;

  /**
   * Total rows inserted
   */
  inserted: number;

  /**
   * Total rows skipped (conflicts)
   */
  skipped: number;

  /**
   * Total rows failed
   */
  failed: number;

  /**
   * Error messages if any failures
   */
  errors: string[];

  /**
   * Time taken in milliseconds
   */
  durationMs: number;
}

/**
 * Split array into chunks of specified size
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Build parameterized INSERT query with values placeholders
 */
function buildInsertQuery(
  table: string,
  columns: string[],
  rowCount: number,
  onConflict?: BatchInsertOptions<unknown>['onConflict']
): string {
  const columnList = columns.join(', ');
  const paramCount = columns.length;

  // Build value placeholders for each row
  const valuePlaceholders: string[] = [];
  for (let row = 0; row < rowCount; row++) {
    const rowParams: string[] = [];
    for (let col = 0; col < paramCount; col++) {
      rowParams.push(`$${row * paramCount + col + 1}`);
    }
    valuePlaceholders.push(`(${rowParams.join(', ')})`);
  }

  let query = `INSERT INTO ${table} (${columnList}) VALUES ${valuePlaceholders.join(', ')}`;

  // Add conflict handling
  if (onConflict) {
    query += ` ON CONFLICT (${onConflict.columns.join(', ')})`;
    if (onConflict.action === 'DO NOTHING') {
      query += ' DO NOTHING';
    } else if (onConflict.action === 'DO UPDATE' && onConflict.updateColumns) {
      const updates = onConflict.updateColumns
        .map((col) => `${col} = EXCLUDED.${col}`)
        .join(', ');
      query += ` DO UPDATE SET ${updates}`;
    }
  }

  return query;
}

/**
 * Execute a batch insert operation with automatic chunking
 *
 * @param items - Items to insert
 * @param options - Insert options
 * @returns Batch insert result
 *
 * @example
 * ```typescript
 * const result = await batchInsert(leads, {
 *   table: 'leads',
 *   columns: ['phone', 'email', 'name', 'source'],
 *   getValues: (lead) => [lead.phone, lead.email, lead.name, lead.source],
 *   chunkSize: 500,
 *   onConflict: {
 *     columns: ['phone'],
 *     action: 'DO UPDATE',
 *     updateColumns: ['email', 'name', 'updated_at'],
 *   },
 *   onProgress: (p) => console.log(`${p.percentComplete}% complete`),
 * });
 * ```
 */
export async function batchInsert<T>(
  items: T[],
  options: BatchInsertOptions<T>
): Promise<BatchInsertResult> {
  const {
    table,
    columns,
    getValues,
    chunkSize = 1000,
    useTransaction = true,
    onConflict,
    onProgress,
  } = options;

  const startTime = Date.now();
  const result: BatchInsertResult = {
    success: true,
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  if (items.length === 0) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  const chunks = chunk(items, chunkSize);
  const totalBatches = chunks.length;

  logger.info('Starting batch insert', {
    table,
    totalItems: items.length,
    chunkSize,
    totalBatches,
  });

  const processChunk = async (
    client: TransactionClient | ReturnType<typeof createDatabaseClient>,
    chunkItems: T[],
    batchNumber: number
  ): Promise<{ inserted: number; skipped: number }> => {
    const values: unknown[] = [];
    for (const item of chunkItems) {
      values.push(...getValues(item));
    }

    const query = buildInsertQuery(table, columns, chunkItems.length, onConflict);

    try {
      const queryResult = await client.query(query, values);
      const inserted = queryResult.rowCount ?? chunkItems.length;
      const skipped = chunkItems.length - inserted;

      return { inserted, skipped };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Batch insert chunk failed', { batchNumber, error: errorMsg });
      throw error;
    }
  };

  const reportProgress = (
    processed: number,
    inserted: number,
    skipped: number,
    failed: number,
    batchNumber: number
  ): void => {
    if (onProgress) {
      onProgress({
        total: items.length,
        processed,
        inserted,
        skipped,
        failed,
        batchNumber,
        totalBatches,
        percentComplete: Math.round((processed / items.length) * 100),
      });
    }
  };

  if (useTransaction) {
    // Process all chunks in a single transaction
    const db = createDatabaseClient();
    try {
      await withTransaction(db, async (tx) => {
        for (let i = 0; i < chunks.length; i++) {
          const chunkResult = await processChunk(tx, chunks[i]!, i + 1);
          result.inserted += chunkResult.inserted;
          result.skipped += chunkResult.skipped;

          const processed = Math.min((i + 1) * chunkSize, items.length);
          reportProgress(processed, result.inserted, result.skipped, result.failed, i + 1);
        }
      });
    } catch (error) {
      result.success = false;
      result.failed = items.length - result.inserted - result.skipped;
      result.errors.push(error instanceof Error ? error.message : 'Transaction failed');
    }
  } else {
    // Process each chunk independently
    const db = createDatabaseClient();
    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunkResult = await processChunk(db, chunks[i]!, i + 1);
        result.inserted += chunkResult.inserted;
        result.skipped += chunkResult.skipped;
      } catch (error) {
        result.failed += chunks[i]!.length;
        result.errors.push(
          `Batch ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      const processed = Math.min((i + 1) * chunkSize, items.length);
      reportProgress(processed, result.inserted, result.skipped, result.failed, i + 1);
    }

    if (result.errors.length > 0) {
      result.success = false;
    }
  }

  result.durationMs = Date.now() - startTime;

  logger.info('Batch insert completed', {
    table,
    success: result.success,
    inserted: result.inserted,
    skipped: result.skipped,
    failed: result.failed,
    durationMs: result.durationMs,
  });

  return result;
}

/**
 * Stream-based batch insert for very large datasets
 *
 * Processes items as they come in without loading all into memory.
 *
 * @param itemGenerator - Async generator yielding items
 * @param options - Insert options
 * @returns Batch insert result
 */
export async function batchInsertStream<T>(
  itemGenerator: AsyncIterable<T>,
  options: BatchInsertOptions<T>
): Promise<BatchInsertResult> {
  const { chunkSize = 1000 } = options;

  const result: BatchInsertResult = {
    success: true,
    inserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  const startTime = Date.now();
  let buffer: T[] = [];
  let batchNumber = 0;

  const processBuffer = async (): Promise<void> => {
    if (buffer.length === 0) return;

    batchNumber++;
    const batchResult = await batchInsert(buffer, {
      ...options,
      useTransaction: false, // Each chunk is independent
      onProgress: undefined, // Disable nested progress
    });

    result.inserted += batchResult.inserted;
    result.skipped += batchResult.skipped;
    result.failed += batchResult.failed;
    result.errors.push(...batchResult.errors);

    if (!batchResult.success) {
      result.success = false;
    }

    buffer = [];
  };

  for await (const item of itemGenerator) {
    buffer.push(item);

    if (buffer.length >= chunkSize) {
      await processBuffer();

      if (options.onProgress) {
        options.onProgress({
          total: -1, // Unknown total for streams
          processed: result.inserted + result.skipped + result.failed,
          inserted: result.inserted,
          skipped: result.skipped,
          failed: result.failed,
          batchNumber,
          totalBatches: -1,
          percentComplete: -1,
        });
      }
    }
  }

  // Process remaining items
  await processBuffer();

  result.durationMs = Date.now() - startTime;

  return result;
}
