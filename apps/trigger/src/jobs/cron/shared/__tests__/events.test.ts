/**
 * Tests for cron job event emission utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emitJobEvent } from '../events.js';
import type { EventStoreEmitter } from '../types.js';

// Mock logger
vi.mock('@trigger.dev/sdk/v3', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock date-helpers
vi.mock('../date-helpers.js', () => ({
  generateCorrelationId: vi.fn().mockReturnValue('mock-correlation-id'),
}));

describe('emitJobEvent', () => {
  let mockEventStore: EventStoreEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventStore = {
      emit: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('should emit event with provided correlation ID', async () => {
    const payload = { correlationId: 'custom-id', data: 'test' };

    await emitJobEvent(mockEventStore, 'JOB_COMPLETED', payload);

    expect(mockEventStore.emit).toHaveBeenCalledWith({
      type: 'JOB_COMPLETED',
      correlationId: 'custom-id',
      payload,
      aggregateType: 'cron',
    });
  });

  it('should generate correlation ID when not provided', async () => {
    const payload = { data: 'test' };

    await emitJobEvent(mockEventStore, 'JOB_STARTED', payload);

    expect(mockEventStore.emit).toHaveBeenCalledWith({
      type: 'JOB_STARTED',
      correlationId: 'mock-correlation-id',
      payload,
      aggregateType: 'cron',
    });
  });

  it('should handle emit errors gracefully', async () => {
    const { logger } = await import('@trigger.dev/sdk/v3');
    mockEventStore.emit = vi.fn().mockRejectedValue(new Error('Emit failed'));

    await emitJobEvent(mockEventStore, 'JOB_FAILED', { error: 'test' });

    expect(logger.warn).toHaveBeenCalledWith('Failed to emit job event', {
      type: 'JOB_FAILED',
      error: expect.any(Error),
    });
  });

  it('should handle empty payload', async () => {
    await emitJobEvent(mockEventStore, 'HEARTBEAT', {});

    expect(mockEventStore.emit).toHaveBeenCalledWith({
      type: 'HEARTBEAT',
      correlationId: 'mock-correlation-id',
      payload: {},
      aggregateType: 'cron',
    });
  });
});
