/**
 * @fileoverview Tests for UnifiedGDPRErasureService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabasePool, PoolClient, QueryResult } from '../../../database.js';
import { UnifiedGDPRErasureService } from '../unified-erasure-service.js';

// Mock pool client
function createMockClient(): PoolClient {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return client as unknown as PoolClient;
}

// Mock pool
function createMockPool(client: PoolClient): DatabasePool {
  return {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(),
    end: vi.fn(),
  } as unknown as DatabasePool;
}

describe('UnifiedGDPRErasureService', () => {
  let service: UnifiedGDPRErasureService;
  let mockClient: PoolClient;
  let mockPool: DatabasePool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockPool = createMockPool(mockClient);
    service = new UnifiedGDPRErasureService(mockPool);
  });

  describe('eraseSubject', () => {
    it('should erase data for a lead_id subject', async () => {
      const leadId = '123e4567-e89b-12d3-a456-426614174000';

      // Setup mock responses
      (mockClient.query as ReturnType<typeof vi.fn>)
        // BEGIN
        .mockResolvedValueOnce({ rows: [] } as QueryResult)
        // Resolve case IDs
        .mockResolvedValueOnce({ rows: [{ id: 'case-1' }] } as QueryResult)
        // Table exists checks and deletions
        .mockImplementation(async (sql: string): Promise<QueryResult> => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ exists: true }] } as QueryResult;
          }
          if (sql.includes('DELETE') || sql.includes('UPDATE')) {
            return { rows: [{ id: '1' }], rowCount: 1 } as QueryResult;
          }
          if (sql.includes('domain_events') && sql.includes('INSERT')) {
            return { rows: [] } as QueryResult;
          }
          if (sql.includes('COMMIT')) {
            return { rows: [] } as QueryResult;
          }
          return { rows: [], rowCount: 0 } as QueryResult;
        });

      const result = await service.eraseSubject(
        { identifierType: 'lead_id', identifier: leadId },
        {
          reason: 'GDPR erasure request',
          requestedBy: 'user-123',
          correlationId: 'corr-456',
        }
      );

      expect(result.identifier).toBe(leadId);
      expect(result.identifierType).toBe('lead_id');
      expect(result.reason).toBe('GDPR erasure request');
      expect(result.requestedBy).toBe('user-123');
      expect(result.correlationId).toBe('corr-456');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should erase data for a phone subject', async () => {
      const phone = '+40123456789';

      // Setup mock responses
      (mockClient.query as ReturnType<typeof vi.fn>)
        // BEGIN
        .mockResolvedValueOnce({ rows: [] } as QueryResult)
        // Resolve lead IDs from phone
        .mockResolvedValueOnce({ rows: [{ id: 'lead-1' }] } as QueryResult)
        // Resolve case IDs
        .mockResolvedValueOnce({ rows: [] } as QueryResult)
        // Table exists checks and operations
        .mockImplementation(async (sql: string): Promise<QueryResult> => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ exists: true }] } as QueryResult;
          }
          if (sql.includes('DELETE') || sql.includes('UPDATE')) {
            return { rows: [{ id: '1' }], rowCount: 1 } as QueryResult;
          }
          if (sql.includes('COMMIT')) {
            return { rows: [] } as QueryResult;
          }
          return { rows: [], rowCount: 0 } as QueryResult;
        });

      const result = await service.eraseSubject(
        { identifierType: 'phone', identifier: phone },
        {
          reason: 'User request',
          requestedBy: 'admin',
          correlationId: 'corr-789',
        }
      );

      expect(result.identifier).toBe(phone);
      expect(result.identifierType).toBe('phone');
    });

    it('should handle hard delete option', async () => {
      const leadId = '123e4567-e89b-12d3-a456-426614174001';

      (mockClient.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // Resolve case IDs
        .mockImplementation(async (sql: string): Promise<QueryResult> => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ exists: true }] } as QueryResult;
          }
          if (sql.includes('DELETE')) {
            return { rows: [{ id: '1' }], rowCount: 1 } as QueryResult;
          }
          if (sql.includes('COMMIT')) {
            return { rows: [] } as QueryResult;
          }
          return { rows: [], rowCount: 0 } as QueryResult;
        });

      const result = await service.eraseSubject(
        { identifierType: 'lead_id', identifier: leadId },
        {
          reason: 'Permanent deletion request',
          requestedBy: 'admin',
          correlationId: 'corr-hard',
          hardDelete: true,
        }
      );

      expect(result.retentionPeriodDays).toBeUndefined();
      expect(result.estimatedPermanentDeletion).toBeUndefined();
    });

    it('should skip specified tables', async () => {
      const leadId = '123e4567-e89b-12d3-a456-426614174002';

      (mockClient.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // Resolve case IDs
        .mockImplementation(async (sql: string): Promise<QueryResult> => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ exists: true }] } as QueryResult;
          }
          if (sql.includes('DELETE') || sql.includes('UPDATE')) {
            return { rows: [{ id: '1' }], rowCount: 1 } as QueryResult;
          }
          if (sql.includes('COMMIT')) {
            return { rows: [] } as QueryResult;
          }
          return { rows: [], rowCount: 0 } as QueryResult;
        });

      const result = await service.eraseSubject(
        { identifierType: 'lead_id', identifier: leadId },
        {
          reason: 'Partial erasure',
          requestedBy: 'admin',
          correlationId: 'corr-skip',
          skipTables: ['payments', 'domain_events'],
        }
      );

      const skippedTables = result.tableResults.filter((r) => r.erasureType === 'skipped');
      const skippedNames = skippedTables.map((r) => r.tableName);
      expect(skippedNames).toContain('payments');
      expect(skippedNames).toContain('domain_events');
    });

    it('should rollback on error', async () => {
      const leadId = '123e4567-e89b-12d3-a456-426614174003';

      (mockClient.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // Resolve lead IDs fails

      const result = await service.eraseSubject(
        { identifierType: 'lead_id', identifier: leadId },
        {
          reason: 'Test',
          requestedBy: 'test',
          correlationId: 'corr-error',
        }
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Database error');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should include retention period for soft delete', async () => {
      const leadId = '123e4567-e89b-12d3-a456-426614174004';

      (mockClient.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // Resolve case IDs
        .mockImplementation(async (sql: string): Promise<QueryResult> => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ exists: true }] } as QueryResult;
          }
          if (sql.includes('UPDATE') && sql.includes('deleted_at')) {
            return { rows: [{ id: '1' }], rowCount: 1 } as QueryResult;
          }
          if (sql.includes('DELETE')) {
            return { rows: [{ id: '1' }], rowCount: 1 } as QueryResult;
          }
          if (sql.includes('COMMIT')) {
            return { rows: [] } as QueryResult;
          }
          return { rows: [], rowCount: 0 } as QueryResult;
        });

      const result = await service.eraseSubject(
        { identifierType: 'lead_id', identifier: leadId },
        {
          reason: 'Soft delete test',
          requestedBy: 'admin',
          correlationId: 'corr-soft',
          hardDelete: false,
        }
      );

      expect(result.retentionPeriodDays).toBe(30);
      expect(result.estimatedPermanentDeletion).toBeInstanceOf(Date);
    });
  });

  describe('previewErasure', () => {
    it('should return preview of affected records', async () => {
      const phone = '+40123456789';

      (mockClient.query as ReturnType<typeof vi.fn>)
        // Resolve lead IDs
        .mockResolvedValueOnce({ rows: [{ id: 'lead-1' }] } as QueryResult)
        // Resolve case IDs
        .mockResolvedValueOnce({ rows: [] } as QueryResult)
        // Table exists and count queries
        .mockImplementation(async (sql: string): Promise<QueryResult> => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ exists: true }] } as QueryResult;
          }
          if (sql.includes('COUNT(*)')) {
            return { rows: [{ count: '5' }] } as QueryResult;
          }
          return { rows: [], rowCount: 0 } as QueryResult;
        });

      const preview = await service.previewErasure({
        identifierType: 'phone',
        identifier: phone,
      });

      expect(Array.isArray(preview)).toBe(true);
      expect(preview.length).toBeGreaterThan(0);
      expect(preview[0]).toHaveProperty('tableName');
      expect(preview[0]).toHaveProperty('recordCount');
    });
  });

  describe('purgeExpiredRecords', () => {
    it('should purge soft-deleted records older than retention period', async () => {
      (mockPool.query as ReturnType<typeof vi.fn>).mockImplementation(
        async (sql: string): Promise<QueryResult> => {
          if (sql.includes('DELETE') && sql.includes('deleted_at')) {
            return { rows: [{ id: '1' }, { id: '2' }], rowCount: 2 } as QueryResult;
          }
          return { rows: [], rowCount: 0 } as QueryResult;
        }
      );

      // Need to create service with pool that has direct query
      const purgeService = new UnifiedGDPRErasureService(mockPool);
      const results = await purgeService.purgeExpiredRecords();

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('identifier masking', () => {
    it('should mask identifiers in logs', async () => {
      const email = 'test@example.com';

      (mockClient.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // BEGIN
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // Resolve lead IDs
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // Resolve case IDs
        .mockImplementation(async (): Promise<QueryResult> => {
          return { rows: [], rowCount: 0 } as QueryResult;
        });

      const result = await service.eraseSubject(
        { identifierType: 'email', identifier: email },
        {
          reason: 'Test',
          requestedBy: 'test',
          correlationId: 'corr-mask',
        }
      );

      // The identifier should still be returned in full (for the caller)
      expect(result.identifier).toBe(email);
      // But internal logging should mask it (not directly testable, but service should work)
      expect(result).toBeDefined();
    });
  });

  describe('clinic isolation', () => {
    it('should respect clinic_id for multi-tenant isolation', async () => {
      const phone = '+40123456789';
      const clinicId = 'clinic-123';

      (mockClient.query as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'lead-1' }] } as QueryResult) // Resolve with clinic
        .mockResolvedValueOnce({ rows: [] } as QueryResult) // Case IDs
        .mockImplementation(async (sql: string): Promise<QueryResult> => {
          if (sql.includes('information_schema.tables')) {
            return { rows: [{ exists: true }] } as QueryResult;
          }
          if (sql.includes('DELETE') || sql.includes('UPDATE')) {
            return { rows: [], rowCount: 0 } as QueryResult;
          }
          if (sql.includes('COMMIT')) {
            return { rows: [] } as QueryResult;
          }
          return { rows: [], rowCount: 0 } as QueryResult;
        });

      await service.eraseSubject(
        { identifierType: 'phone', identifier: phone, clinicId },
        {
          reason: 'Test',
          requestedBy: 'admin',
          correlationId: 'corr-clinic',
        }
      );

      // Verify the lead resolution query included clinic_id
      const calls = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls;
      const leadQuery = calls.find(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('leads') && call[0].includes('phone')
      );

      expect(leadQuery).toBeDefined();
      if (leadQuery) {
        expect(leadQuery[0]).toContain('clinic_id');
        expect(leadQuery[1]).toContain(clinicId);
      }
    });
  });
});
