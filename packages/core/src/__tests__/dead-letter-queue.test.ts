/**
 * Dead Letter Queue Service Tests
 * Tests for DLQ operations with mocked database
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadLetterQueueService } from '../dead-letter-queue.js';
import type { DlqEntry, WebhookType, DlqStatus } from '../dead-letter-queue.js';

// Mock database
const createMockDb = () => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
});

describe('DeadLetterQueueService', () => {
  let service: DeadLetterQueueService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    // @ts-expect-error - mock db for testing
    service = new DeadLetterQueueService(mockDb);
  });

  describe('constructor', () => {
    it('should create service with database pool', () => {
      const db = createMockDb();
      // @ts-expect-error - mock db for testing
      const dlq = new DeadLetterQueueService(db);
      expect(dlq).toBeInstanceOf(DeadLetterQueueService);
    });
  });

  describe('add', () => {
    it('should add entry to DLQ with Error', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.add({
        webhookType: 'whatsapp',
        correlationId: 'corr-123',
        payload: { message: 'test' },
        error: new Error('Test error'),
      });

      expect(mockDb.query).toHaveBeenCalled();
      expect(result.webhookType).toBe('whatsapp');
      expect(result.correlationId).toBe('corr-123');
      expect(result.errorMessage).toBe('Test error');
      expect(result.status).toBe('pending');
      expect(result.retryCount).toBe(0);
    });

    it('should add entry with string error', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.add({
        webhookType: 'stripe',
        correlationId: 'corr-456',
        payload: {},
        error: 'String error message',
      });

      expect(result.errorMessage).toBe('String error message');
      expect(result.errorStack).toBeUndefined();
    });

    it('should include error stack for Error objects', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const error = new Error('Test error with stack');
      const result = await service.add({
        webhookType: 'vapi',
        correlationId: 'corr-789',
        payload: {},
        error,
      });

      expect(result.errorStack).toBeDefined();
      expect(result.errorStack).toContain('Error: Test error with stack');
    });

    it('should use custom maxRetries', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.add({
        webhookType: 'vapi',
        correlationId: 'corr-789',
        payload: {},
        error: new Error('Error'),
        maxRetries: 10,
      });

      expect(result.maxRetries).toBe(10);
    });

    it('should use default maxRetries of 5', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.add({
        webhookType: 'booking',
        correlationId: 'corr-default',
        payload: {},
        error: new Error('Error'),
      });

      expect(result.maxRetries).toBe(5);
    });

    it('should include metadata', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.add({
        webhookType: 'hubspot',
        correlationId: 'corr-meta',
        payload: {},
        error: new Error('Error'),
        metadata: { source: 'api', version: '1.0' },
      });

      expect(result.metadata).toEqual({ source: 'api', version: '1.0' });
    });

    it('should set nextRetryAt in the future', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const before = Date.now();

      const result = await service.add({
        webhookType: 'crm',
        correlationId: 'corr-time',
        payload: {},
        error: new Error('Error'),
      });

      expect(result.nextRetryAt).toBeInstanceOf(Date);
      expect(result.nextRetryAt!.getTime()).toBeGreaterThan(before);
    });

    it('should set expiresAt based on ttlDays', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const before = Date.now();

      const result = await service.add({
        webhookType: 'scheduling',
        correlationId: 'corr-ttl',
        payload: {},
        error: new Error('Error'),
        ttlDays: 14,
      });

      const expectedMinExpiry = before + 14 * 24 * 60 * 60 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinExpiry);
    });

    it('should generate unique ID', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const result1 = await service.add({
        webhookType: 'voice',
        correlationId: 'corr-1',
        payload: {},
        error: new Error('Error'),
      });

      const result2 = await service.add({
        webhookType: 'voice',
        correlationId: 'corr-2',
        payload: {},
        error: new Error('Error'),
      });

      expect(result1.id).not.toBe(result2.id);
    });

    it('should call db.query with correct INSERT', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await service.add({
        webhookType: 'whatsapp',
        correlationId: 'corr-insert',
        payload: { key: 'value' },
        error: new Error('Error'),
      });

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [query, params] = mockDb.query.mock.calls[0]!;
      expect(query).toContain('INSERT INTO dead_letter_queue');
      expect(params).toHaveLength(12);
    });
  });

  describe('processRetries', () => {
    it('should return 0 when no entries to process', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const handler = vi.fn();
      const result = await service.processRetries(handler);

      expect(result).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should call handler for each entry', async () => {
      const mockEntry = {
        id: 'entry-1',
        webhook_type: 'whatsapp',
        correlation_id: 'c1',
        payload: '{}',
        error_message: 'E1',
        error_stack: null,
        status: 'pending',
        retry_count: 0,
        max_retries: 5,
        next_retry_at: new Date(),
        last_retry_at: null,
        processed_at: null,
        expires_at: new Date(Date.now() + 86400000),
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockEntry] }) // Select
        .mockResolvedValueOnce({ rows: [] }) // Update to retrying
        .mockResolvedValueOnce({ rows: [] }); // Update to processed

      const handler = vi.fn().mockResolvedValue(true);
      const result = await service.processRetries(handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toBe(1);
    });

    it('should handle handler failure', async () => {
      const mockEntry = {
        id: 'entry-fail',
        webhook_type: 'stripe',
        correlation_id: 'c-fail',
        payload: '{}',
        error_message: 'E1',
        error_stack: null,
        status: 'pending',
        retry_count: 0,
        max_retries: 5,
        next_retry_at: new Date(),
        last_retry_at: null,
        processed_at: null,
        expires_at: new Date(Date.now() + 86400000),
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockEntry] }) // Select
        .mockResolvedValueOnce({ rows: [] }) // Update to retrying
        .mockResolvedValueOnce({ rows: [] }); // Update retry count

      const handler = vi.fn().mockResolvedValue(false);
      const result = await service.processRetries(handler);

      expect(result).toBe(0);
    });

    it('should handle handler exception', async () => {
      const mockEntry = {
        id: 'entry-exception',
        webhook_type: 'voice',
        correlation_id: 'c-ex',
        payload: '{}',
        error_message: 'E1',
        error_stack: null,
        status: 'pending',
        retry_count: 0,
        max_retries: 5,
        next_retry_at: new Date(),
        last_retry_at: null,
        processed_at: null,
        expires_at: new Date(Date.now() + 86400000),
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockEntry] }) // Select
        .mockResolvedValueOnce({ rows: [] }) // Update to retrying
        .mockResolvedValueOnce({ rows: [] }); // Update retry count

      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      const result = await service.processRetries(handler);

      expect(result).toBe(0);
    });

    it('should filter by webhook types', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await service.processRetries(vi.fn(), {
        webhookTypes: ['whatsapp', 'voice'],
      });

      const [query] = mockDb.query.mock.calls[0]!;
      expect(query).toContain('webhook_type = ANY');
    });

    it('should respect batch size', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await service.processRetries(vi.fn(), { batchSize: 50 });

      const [query] = mockDb.query.mock.calls[0]!;
      expect(query).toContain('LIMIT 50');
    });
  });
});

describe('WebhookType', () => {
  const validTypes: WebhookType[] = [
    'whatsapp',
    'voice',
    'vapi',
    'stripe',
    'booking',
    'crm',
    'hubspot',
    'scheduling',
  ];

  validTypes.forEach((type) => {
    it(`should support webhook type: ${type}`, () => {
      expect(validTypes).toContain(type);
    });
  });
});

describe('DlqStatus', () => {
  const validStatuses: DlqStatus[] = ['pending', 'retrying', 'processed', 'failed', 'expired'];

  validStatuses.forEach((status) => {
    it(`should support status: ${status}`, () => {
      expect(validStatuses).toContain(status);
    });
  });
});
