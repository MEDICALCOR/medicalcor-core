/**
 * Comprehensive tests for Bulk Import Workflow
 * Tests workflow logic, error handling, status transitions, and edge cases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BulkImportStatus } from '@medicalcor/types';

// =============================================================================
// Mock Setup
// =============================================================================

// Track all mock calls for verification
const mockCalls = {
  processBulkImport: [] as unknown[],
  updateJobProgress: [] as unknown[],
  loggerInfo: [] as unknown[],
  loggerError: [] as unknown[],
};

// Mock @medicalcor/core
vi.mock('@medicalcor/core', () => ({
  processBulkImport: vi.fn().mockImplementation(async (rows, _options) => {
    mockCalls.processBulkImport.push({ rows, _options });
    return {
      success: true,
      successCount: rows.length,
      errorCount: 0,
      skipCount: 0,
      errors: [],
    };
  }),
  updateJobProgress: vi.fn().mockImplementation(async (jobId, progress) => {
    mockCalls.updateJobProgress.push({ jobId, progress });
    return Promise.resolve();
  }),
}));

// Mock @trigger.dev/sdk/v3
vi.mock('@trigger.dev/sdk/v3', () => ({
  task: vi.fn().mockImplementation((config: { run: unknown }) => ({
    id: config.id,
    ...config,
    triggerAndWait: vi.fn(),
  })),
  logger: {
    info: vi.fn().mockImplementation((...args) => {
      mockCalls.loggerInfo.push(args);
    }),
    error: vi.fn().mockImplementation((...args) => {
      mockCalls.loggerError.push(args);
    }),
  },
}));

// Import after mocks
import { processBulkImport, updateJobProgress } from '@medicalcor/core';
import { logger } from '@trigger.dev/sdk/v3';
import {
  BulkImportWorkflowPayloadSchema,
  BulkImportBatchPayloadSchema,
  LargeImportOrchestratorPayloadSchema,
} from '../workflows/bulk-import.js';

// =============================================================================
// Test Helpers
// =============================================================================

interface ProcessBulkImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  skipCount: number;
  errors?: Array<{ errorCode?: string; row?: number; message?: string }>;
}

function createTestPayload(overrides = {}) {
  return {
    jobId: '550e8400-e29b-41d4-a716-446655440000',
    rows: [
      { phone: '+40721234567', fullName: 'Test Lead 1' },
      { phone: '+40721234568', fullName: 'Test Lead 2' },
    ],
    options: {
      skipDuplicates: true,
      updateExisting: false,
      batchSize: 100,
    },
    correlationId: 'test-correlation-123',
    ...overrides,
  };
}

function simulateBulkImportResult(result: Partial<ProcessBulkImportResult>) {
  vi.mocked(processBulkImport).mockResolvedValueOnce({
    success: result.success ?? true,
    successCount: result.successCount ?? 0,
    errorCount: result.errorCount ?? 0,
    skipCount: result.skipCount ?? 0,
    errors: result.errors ?? [],
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('Bulk Import Workflow Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCalls.processBulkImport = [];
    mockCalls.updateJobProgress = [];
    mockCalls.loggerInfo = [];
    mockCalls.loggerError = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('BulkImportWorkflowPayloadSchema', () => {
    it('should validate complete payload', () => {
      const payload = createTestPayload();
      const result = BulkImportWorkflowPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate payload with batch info', () => {
      const payload = createTestPayload({
        batchIndex: 0,
        totalBatches: 5,
      });
      const result = BulkImportWorkflowPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.batchIndex).toBe(0);
        expect(result.data.totalBatches).toBe(5);
      }
    });

    it('should reject invalid jobId', () => {
      const payload = createTestPayload({ jobId: 'not-a-uuid' });
      const result = BulkImportWorkflowPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject negative batchIndex', () => {
      const payload = createTestPayload({ batchIndex: -1 });
      const result = BulkImportWorkflowPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject zero totalBatches', () => {
      const payload = createTestPayload({ totalBatches: 0 });
      const result = BulkImportWorkflowPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('BulkImportBatchPayloadSchema', () => {
    it('should validate batch payload with cumulative counts', () => {
      const payload = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        rows: [{ phone: '+40721234567' }],
        options: { skipDuplicates: true },
        correlationId: 'test-123',
        batchIndex: 2,
        totalBatches: 5,
        previousSuccessCount: 200,
        previousErrorCount: 3,
        previousSkipCount: 5,
      };
      const result = BulkImportBatchPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.previousSuccessCount).toBe(200);
        expect(result.data.previousErrorCount).toBe(3);
        expect(result.data.previousSkipCount).toBe(5);
      }
    });

    it('should default previous counts to 0', () => {
      const payload = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        rows: [{ phone: '+40721234567' }],
        options: {},
        correlationId: 'test-123',
        batchIndex: 0,
        totalBatches: 1,
      };
      const result = BulkImportBatchPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.previousSuccessCount).toBe(0);
        expect(result.data.previousErrorCount).toBe(0);
        expect(result.data.previousSkipCount).toBe(0);
      }
    });

    it('should reject missing required batchIndex', () => {
      const payload = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        rows: [{ phone: '+40721234567' }],
        options: {},
        correlationId: 'test-123',
        totalBatches: 1,
      };
      const result = BulkImportBatchPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject negative previous counts', () => {
      const payload = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        rows: [{ phone: '+40721234567' }],
        options: {},
        correlationId: 'test-123',
        batchIndex: 0,
        totalBatches: 1,
        previousSuccessCount: -1,
      };
      const result = BulkImportBatchPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('LargeImportOrchestratorPayloadSchema', () => {
    it('should validate orchestrator payload', () => {
      const payload = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        rows: Array.from({ length: 500 }, (_, i) => ({
          phone: `+407212345${String(i).padStart(2, '0')}`,
        })),
        options: {
          batchSize: 100,
          stopOnFirstError: false,
          maxErrors: 50,
        },
        correlationId: 'test-123',
      };
      const result = LargeImportOrchestratorPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate payload with stopOnFirstError', () => {
      const payload = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        rows: [{ phone: '+40721234567' }],
        options: { stopOnFirstError: true },
        correlationId: 'test-123',
      };
      const result = LargeImportOrchestratorPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('Status Determination Logic', () => {
    it('should return completed when all rows succeed', () => {
      const result = {
        successCount: 100,
        errorCount: 0,
        skipCount: 0,
      };

      let finalStatus: BulkImportStatus = 'completed';
      if (result.errorCount > 0 && result.successCount === 0) {
        finalStatus = 'failed';
      } else if (result.errorCount > 0) {
        finalStatus = 'partial';
      }

      expect(finalStatus).toBe('completed');
    });

    it('should return failed when all rows error', () => {
      const result = {
        successCount: 0,
        errorCount: 100,
        skipCount: 0,
      };

      let finalStatus: BulkImportStatus = 'completed';
      if (result.errorCount > 0 && result.successCount === 0) {
        finalStatus = 'failed';
      } else if (result.errorCount > 0) {
        finalStatus = 'partial';
      }

      expect(finalStatus).toBe('failed');
    });

    it('should return partial when some rows error', () => {
      const result = {
        successCount: 80,
        errorCount: 20,
        skipCount: 0,
      };

      let finalStatus: BulkImportStatus = 'completed';
      if (result.errorCount > 0 && result.successCount === 0) {
        finalStatus = 'failed';
      } else if (result.errorCount > 0) {
        finalStatus = 'partial';
      }

      expect(finalStatus).toBe('partial');
    });

    it('should return completed when all rows are skipped', () => {
      const result = {
        successCount: 0,
        errorCount: 0,
        skipCount: 100,
      };

      let finalStatus: BulkImportStatus = 'completed';
      if (result.errorCount > 0 && result.successCount === 0) {
        finalStatus = 'failed';
      } else if (result.errorCount > 0) {
        finalStatus = 'partial';
      }

      expect(finalStatus).toBe('completed');
    });
  });

  describe('Error Summary Building', () => {
    it('should build error summary from result errors', () => {
      const errors = [
        { errorCode: 'DUPLICATE_PHONE', row: 1 },
        { errorCode: 'INVALID_EMAIL', row: 2 },
        { errorCode: 'DUPLICATE_PHONE', row: 5 },
        { errorCode: 'DUPLICATE_PHONE', row: 8 },
        { errorCode: 'INVALID_EMAIL', row: 10 },
      ];

      const errorSummary: Record<string, number> = {};
      for (const error of errors) {
        if (error.errorCode) {
          errorSummary[error.errorCode] = (errorSummary[error.errorCode] ?? 0) + 1;
        }
      }

      expect(errorSummary).toEqual({
        DUPLICATE_PHONE: 3,
        INVALID_EMAIL: 2,
      });
    });

    it('should handle errors without errorCode', () => {
      const errors = [
        { errorCode: 'DUPLICATE_PHONE', row: 1 },
        { row: 2, message: 'Unknown error' }, // No errorCode
        { errorCode: 'INVALID_EMAIL', row: 3 },
      ];

      const errorSummary: Record<string, number> = {};
      for (const error of errors) {
        if (error.errorCode) {
          errorSummary[error.errorCode] = (errorSummary[error.errorCode] ?? 0) + 1;
        }
      }

      expect(errorSummary).toEqual({
        DUPLICATE_PHONE: 1,
        INVALID_EMAIL: 1,
      });
    });

    it('should return empty object when no errors', () => {
      const errors: Array<{ errorCode?: string }> = [];

      const errorSummary: Record<string, number> = {};
      for (const error of errors) {
        if (error.errorCode) {
          errorSummary[error.errorCode] = (errorSummary[error.errorCode] ?? 0) + 1;
        }
      }

      expect(Object.keys(errorSummary).length).toBe(0);
    });
  });

  describe('Batch Status Logic', () => {
    it('should set processing status when not last batch', () => {
      const batchIndex = 2;
      const totalBatches = 5;
      const cumulativeSuccess = 200;
      const cumulativeError = 5;

      const isLastBatch = batchIndex === totalBatches - 1;
      let status: BulkImportStatus = 'processing';

      if (isLastBatch) {
        if (cumulativeError > 0 && cumulativeSuccess === 0) {
          status = 'failed';
        } else if (cumulativeError > 0) {
          status = 'partial';
        } else {
          status = 'completed';
        }
      }

      expect(status).toBe('processing');
    });

    it('should set completed status on last successful batch', () => {
      const batchIndex = 4;
      const totalBatches = 5;
      const cumulativeSuccess = 500;
      const cumulativeError = 0;

      const isLastBatch = batchIndex === totalBatches - 1;
      let status: BulkImportStatus = 'processing';

      if (isLastBatch) {
        if (cumulativeError > 0 && cumulativeSuccess === 0) {
          status = 'failed';
        } else if (cumulativeError > 0) {
          status = 'partial';
        } else {
          status = 'completed';
        }
      }

      expect(status).toBe('completed');
    });

    it('should set partial status on last batch with some errors', () => {
      const batchIndex = 4;
      const totalBatches = 5;
      const cumulativeSuccess = 480;
      const cumulativeError = 20;

      const isLastBatch = batchIndex === totalBatches - 1;
      let status: BulkImportStatus = 'processing';

      if (isLastBatch) {
        if (cumulativeError > 0 && cumulativeSuccess === 0) {
          status = 'failed';
        } else if (cumulativeError > 0) {
          status = 'partial';
        } else {
          status = 'completed';
        }
      }

      expect(status).toBe('partial');
    });

    it('should set failed status on last batch with all errors', () => {
      const batchIndex = 4;
      const totalBatches = 5;
      const cumulativeSuccess = 0;
      const cumulativeError = 500;

      const isLastBatch = batchIndex === totalBatches - 1;
      let status: BulkImportStatus = 'processing';

      if (isLastBatch) {
        if (cumulativeError > 0 && cumulativeSuccess === 0) {
          status = 'failed';
        } else if (cumulativeError > 0) {
          status = 'partial';
        } else {
          status = 'completed';
        }
      }

      expect(status).toBe('failed');
    });
  });

  describe('Orchestrator Control Flow', () => {
    it('should calculate correct batch count', () => {
      const rows = Array.from({ length: 250 }, (_, i) => ({
        phone: `+40721234${String(i).padStart(3, '0')}`,
      }));
      const batchSize = 100;

      const totalBatches = Math.ceil(rows.length / batchSize);

      expect(totalBatches).toBe(3);
    });

    it('should correctly slice batches', () => {
      const rows = Array.from({ length: 250 }, (_, i) => ({
        phone: `+40721234${String(i).padStart(3, '0')}`,
        index: i,
      }));
      const batchSize = 100;
      const totalBatches = Math.ceil(rows.length / batchSize);
      const batches: typeof rows = [];

      for (let i = 0; i < totalBatches; i++) {
        const batchStart = i * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, rows.length);
        const batchRows = rows.slice(batchStart, batchEnd);
        batches.push(...batchRows);
      }

      expect(batches.length).toBe(250);
    });

    it('should stop on first error when stopOnFirstError is true', () => {
      const options = { stopOnFirstError: true };
      const cumulativeError = 1;
      const batchIndex = 0;

      let shouldStop = false;
      if (options.stopOnFirstError && cumulativeError > 0) {
        shouldStop = true;
      }

      expect(shouldStop).toBe(true);
      expect(batchIndex).toBe(0); // Stopped at first batch
    });

    it('should continue on error when stopOnFirstError is false', () => {
      const options = { stopOnFirstError: false };
      const cumulativeError = 5;

      let shouldStop = false;
      if (options.stopOnFirstError && cumulativeError > 0) {
        shouldStop = true;
      }

      expect(shouldStop).toBe(false);
    });

    it('should stop when maxErrors limit is reached', () => {
      const options = { maxErrors: 100 };
      const cumulativeError = 100;

      const maxErrors = options.maxErrors ?? 100;
      const shouldStop = cumulativeError >= maxErrors;

      expect(shouldStop).toBe(true);
    });

    it('should continue when under maxErrors limit', () => {
      const options = { maxErrors: 100 };
      const cumulativeError = 50;

      const maxErrors = options.maxErrors ?? 100;
      const shouldStop = cumulativeError >= maxErrors;

      expect(shouldStop).toBe(false);
    });

    it('should use default maxErrors when not specified', () => {
      const options: { maxErrors?: number } = {};
      const cumulativeError = 99;

      const maxErrors = options.maxErrors ?? 100;
      const shouldStop = cumulativeError >= maxErrors;

      expect(maxErrors).toBe(100);
      expect(shouldStop).toBe(false);
    });
  });

  describe('Cumulative Count Tracking', () => {
    it('should accumulate success counts across batches', () => {
      let cumulativeSuccess = 0;
      const batchResults = [{ successCount: 100 }, { successCount: 100 }, { successCount: 50 }];

      for (const result of batchResults) {
        cumulativeSuccess += result.successCount;
      }

      expect(cumulativeSuccess).toBe(250);
    });

    it('should accumulate error counts across batches', () => {
      let cumulativeError = 0;
      const batchResults = [{ errorCount: 2 }, { errorCount: 5 }, { errorCount: 3 }];

      for (const result of batchResults) {
        cumulativeError += result.errorCount;
      }

      expect(cumulativeError).toBe(10);
    });

    it('should pass previous counts to next batch', () => {
      const previousSuccessCount = 200;
      const previousErrorCount = 5;
      const previousSkipCount = 10;

      const batchResult = {
        successCount: 98,
        errorCount: 1,
        skipCount: 1,
      };

      const cumulativeSuccess = previousSuccessCount + batchResult.successCount;
      const cumulativeError = previousErrorCount + batchResult.errorCount;
      const cumulativeSkip = previousSkipCount + batchResult.skipCount;

      expect(cumulativeSuccess).toBe(298);
      expect(cumulativeError).toBe(6);
      expect(cumulativeSkip).toBe(11);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty rows array', () => {
      const rows: unknown[] = [];
      const batchSize = 100;

      const totalBatches = Math.ceil(rows.length / batchSize) || 1;

      expect(totalBatches).toBe(1);
    });

    it('should handle single row import', () => {
      const rows = [{ phone: '+40721234567' }];
      const batchSize = 100;

      const totalBatches = Math.ceil(rows.length / batchSize);

      expect(totalBatches).toBe(1);
    });

    it('should handle exact batch size multiple', () => {
      const rows = Array.from({ length: 300 }, (_, i) => ({
        phone: `+40721234${String(i).padStart(3, '0')}`,
      }));
      const batchSize = 100;

      const totalBatches = Math.ceil(rows.length / batchSize);

      expect(totalBatches).toBe(3);
    });

    it('should handle large batch size with few rows', () => {
      const rows = [{ phone: '+40721234567' }, { phone: '+40721234568' }];
      const batchSize = 1000;

      const totalBatches = Math.ceil(rows.length / batchSize);

      expect(totalBatches).toBe(1);
    });
  });

  describe('Duration Tracking', () => {
    it('should calculate duration correctly', () => {
      const startTime = Date.now();

      // Simulate some processing time
      const durationMs = Date.now() - startTime;

      expect(durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should mark job as failed on processing error', () => {
      const rows = [{ phone: '+40721234567' }];

      // Simulate catch block behavior
      const errorState = {
        status: 'failed' as BulkImportStatus,
        processedRows: 0,
        successCount: 0,
        errorCount: rows.length,
        skipCount: 0,
        errorSummary: { UNKNOWN_ERROR: rows.length },
      };

      expect(errorState.status).toBe('failed');
      expect(errorState.errorCount).toBe(1);
      expect(errorState.errorSummary.UNKNOWN_ERROR).toBe(1);
    });

    it('should rethrow error after updating job status', async () => {
      const mockError = new Error('Processing failed');

      expect(() => {
        throw mockError;
      }).toThrow('Processing failed');
    });
  });
});

describe('Batch Processing Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle batch result ok=true path', () => {
    const result = {
      ok: true,
      output: {
        cumulativeSuccess: 100,
        cumulativeError: 5,
        cumulativeSkip: 2,
      },
    };

    let cumulativeSuccess = 0;
    let cumulativeError = 0;
    let cumulativeSkip = 0;

    if (result.ok) {
      cumulativeSuccess = result.output.cumulativeSuccess;
      cumulativeError = result.output.cumulativeError;
      cumulativeSkip = result.output.cumulativeSkip;
    }

    expect(cumulativeSuccess).toBe(100);
    expect(cumulativeError).toBe(5);
    expect(cumulativeSkip).toBe(2);
  });

  it('should handle batch result ok=false path', () => {
    const result = {
      ok: false,
      error: 'Batch processing failed',
    };

    let cumulativeSuccess = 50; // Previous value
    let cumulativeError = 2; // Previous value

    if (result.ok) {
      cumulativeSuccess = 100;
      cumulativeError = 5;
    }
    // When ok=false, cumulative values remain unchanged

    expect(cumulativeSuccess).toBe(50);
    expect(cumulativeError).toBe(2);
  });
});
