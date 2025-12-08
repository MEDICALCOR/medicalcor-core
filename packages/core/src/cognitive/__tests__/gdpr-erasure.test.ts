/**
 * @fileoverview Tests for GDPR Erasure Service
 *
 * Tests the CognitiveGDPRErasureService including soft delete, hard delete,
 * data export, and audit logging functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import {
  CognitiveGDPRErasureService,
  createCognitiveGDPRErasureService,
  type ErasureOptions,
  type CognitiveErasureResult,
} from '../gdpr-erasure.js';

// Mock the logger
vi.mock('../../logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('CognitiveGDPRErasureService', () => {
  let mockPool: Pool;
  let mockClient: PoolClient;
  let queryResults: Map<string, QueryResult>;

  beforeEach(() => {
    queryResults = new Map();

    mockClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        // Check for specific query patterns
        for (const [pattern, result] of queryResults) {
          if (sql.includes(pattern)) {
            return Promise.resolve(result);
          }
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      release: vi.fn(),
    } as unknown as PoolClient;

    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn().mockImplementation((sql: string) => {
        for (const [pattern, result] of queryResults) {
          if (sql.includes(pattern)) {
            return Promise.resolve(result);
          }
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    } as unknown as Pool;
  });

  describe('createCognitiveGDPRErasureService', () => {
    it('should create a service instance', () => {
      const service = createCognitiveGDPRErasureService(mockPool);

      expect(service).toBeInstanceOf(CognitiveGDPRErasureService);
    });
  });

  describe('eraseSubjectMemory', () => {
    const defaultOptions: ErasureOptions = {
      reason: 'GDPR erasure request',
      requestedBy: 'user-123',
      dsrRequestId: 'dsr-456',
      correlationId: 'corr-789',
    };

    describe('soft delete (default)', () => {
      it('should soft delete episodic events and delete behavioral patterns', async () => {
        queryResults.set('UPDATE episodic_events', {
          rows: [{ id: '1' }, { id: '2' }, { id: '3' }],
          rowCount: 3,
        });
        queryResults.set('DELETE FROM behavioral_patterns', {
          rows: [{ id: '1' }],
          rowCount: 1,
        });
        queryResults.set('INSERT INTO domain_events', { rows: [], rowCount: 1 });

        const service = createCognitiveGDPRErasureService(mockPool);
        const result = await service.eraseSubjectMemory('lead', 'lead-123', defaultOptions);

        expect(result.success).toBe(true);
        expect(result.episodicEventsDeleted).toBe(3);
        expect(result.behavioralPatternsDeleted).toBe(1);
        expect(result.subjectType).toBe('lead');
        expect(result.subjectId).toBe('lead-123');
        expect(result.reason).toBe('GDPR erasure request');
        expect(result.erasedAt).toBeInstanceOf(Date);
        expect(result.error).toBeUndefined();
      });

      it('should commit transaction on success', async () => {
        queryResults.set('UPDATE episodic_events', { rows: [], rowCount: 0 });
        queryResults.set('DELETE FROM behavioral_patterns', { rows: [], rowCount: 0 });
        queryResults.set('INSERT INTO domain_events', { rows: [], rowCount: 1 });

        const service = createCognitiveGDPRErasureService(mockPool);
        await service.eraseSubjectMemory('patient', 'patient-123', defaultOptions);

        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      });

      it('should release client on success', async () => {
        queryResults.set('UPDATE episodic_events', { rows: [], rowCount: 0 });
        queryResults.set('DELETE FROM behavioral_patterns', { rows: [], rowCount: 0 });
        queryResults.set('INSERT INTO domain_events', { rows: [], rowCount: 1 });

        const service = createCognitiveGDPRErasureService(mockPool);
        await service.eraseSubjectMemory('contact', 'contact-123', defaultOptions);

        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should redact PII in soft delete', async () => {
        queryResults.set('UPDATE episodic_events', { rows: [], rowCount: 1 });
        queryResults.set('DELETE FROM behavioral_patterns', { rows: [], rowCount: 0 });
        queryResults.set('INSERT INTO domain_events', { rows: [], rowCount: 1 });

        const service = createCognitiveGDPRErasureService(mockPool);
        await service.eraseSubjectMemory('lead', 'lead-123', defaultOptions);

        // Verify the update query contains PII redaction
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('embedding = NULL'),
          expect.any(Array)
        );
        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('[REDACTED - GDPR ERASURE]'),
          expect.any(Array)
        );
      });
    });

    describe('hard delete', () => {
      it('should permanently delete all records', async () => {
        queryResults.set('DELETE FROM behavioral_patterns', {
          rows: [{ id: '1' }, { id: '2' }],
          rowCount: 2,
        });
        queryResults.set('DELETE FROM episodic_events', {
          rows: [{ id: '1' }, { id: '2' }, { id: '3' }],
          rowCount: 3,
        });
        queryResults.set('INSERT INTO domain_events', { rows: [], rowCount: 1 });

        const service = createCognitiveGDPRErasureService(mockPool);
        const result = await service.eraseSubjectMemory('lead', 'lead-123', {
          ...defaultOptions,
          hardDelete: true,
        });

        expect(result.success).toBe(true);
        expect(result.episodicEventsDeleted).toBe(3);
        expect(result.behavioralPatternsDeleted).toBe(2);
      });

      it('should delete behavioral patterns before episodic events', async () => {
        const deletionOrder: string[] = [];
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('DELETE FROM behavioral_patterns')) {
            deletionOrder.push('patterns');
            return Promise.resolve({ rows: [], rowCount: 0 });
          }
          if (sql.includes('DELETE FROM episodic_events')) {
            deletionOrder.push('events');
            return Promise.resolve({ rows: [], rowCount: 0 });
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const service = createCognitiveGDPRErasureService(mockPool);
        await service.eraseSubjectMemory('lead', 'lead-123', {
          ...defaultOptions,
          hardDelete: true,
        });

        expect(deletionOrder[0]).toBe('patterns');
        expect(deletionOrder[1]).toBe('events');
      });
    });

    describe('error handling', () => {
      it('should rollback on failure', async () => {
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('UPDATE episodic_events')) {
            return Promise.reject(new Error('Database error'));
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const service = createCognitiveGDPRErasureService(mockPool);
        await service.eraseSubjectMemory('lead', 'lead-123', defaultOptions);

        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      });

      it('should return failure result on error', async () => {
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('UPDATE episodic_events')) {
            return Promise.reject(new Error('Database connection failed'));
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const service = createCognitiveGDPRErasureService(mockPool);
        const result = await service.eraseSubjectMemory('lead', 'lead-123', defaultOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Database connection failed');
        expect(result.episodicEventsDeleted).toBe(0);
        expect(result.behavioralPatternsDeleted).toBe(0);
      });

      it('should handle non-Error throws', async () => {
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('UPDATE episodic_events')) {
            return Promise.reject('string error');
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const service = createCognitiveGDPRErasureService(mockPool);
        const result = await service.eraseSubjectMemory('lead', 'lead-123', defaultOptions);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error');
      });

      it('should release client on failure', async () => {
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('UPDATE episodic_events')) {
            return Promise.reject(new Error('Database error'));
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const service = createCognitiveGDPRErasureService(mockPool);
        await service.eraseSubjectMemory('lead', 'lead-123', defaultOptions);

        expect(mockClient.release).toHaveBeenCalled();
      });
    });

    describe('audit logging', () => {
      it('should log to domain_events table', async () => {
        queryResults.set('UPDATE episodic_events', { rows: [], rowCount: 1 });
        queryResults.set('DELETE FROM behavioral_patterns', { rows: [], rowCount: 0 });
        queryResults.set('INSERT INTO domain_events', { rows: [], rowCount: 1 });

        const service = createCognitiveGDPRErasureService(mockPool);
        await service.eraseSubjectMemory('lead', 'lead-123', defaultOptions);

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining("'cognitive.memory_erased'"),
          expect.arrayContaining(['lead', 'lead-123'])
        );
      });

      it('should fall back to logger if domain_events insert fails', async () => {
        queryResults.set('UPDATE episodic_events', { rows: [], rowCount: 1 });
        queryResults.set('DELETE FROM behavioral_patterns', { rows: [], rowCount: 0 });
        mockClient.query = vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('INSERT INTO domain_events')) {
            return Promise.reject(new Error('Table does not exist'));
          }
          if (sql.includes('UPDATE episodic_events')) {
            return Promise.resolve({ rows: [], rowCount: 1 });
          }
          return Promise.resolve({ rows: [], rowCount: 0 });
        });

        const service = createCognitiveGDPRErasureService(mockPool);
        const result = await service.eraseSubjectMemory('lead', 'lead-123', defaultOptions);

        // Should still succeed even if audit log fails
        expect(result.success).toBe(true);
      });
    });
  });

  describe('eraseMultipleSubjects', () => {
    it('should erase all subjects', async () => {
      queryResults.set('UPDATE episodic_events', { rows: [], rowCount: 2 });
      queryResults.set('DELETE FROM behavioral_patterns', { rows: [], rowCount: 1 });
      queryResults.set('INSERT INTO domain_events', { rows: [], rowCount: 1 });

      const service = createCognitiveGDPRErasureService(mockPool);
      const results = await service.eraseMultipleSubjects(
        [
          { subjectType: 'lead', subjectId: 'lead-1' },
          { subjectType: 'patient', subjectId: 'patient-1' },
        ],
        { reason: 'Bulk erasure' }
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.subjectId).toBe('lead-1');
      expect(results[1]?.subjectId).toBe('patient-1');
    });

    it('should continue even if some erasures fail', async () => {
      let callCount = 0;
      mockClient.query = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('UPDATE episodic_events')) {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('First failed'));
          }
          return Promise.resolve({ rows: [], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const service = createCognitiveGDPRErasureService(mockPool);
      const results = await service.eraseMultipleSubjects(
        [
          { subjectType: 'lead', subjectId: 'lead-1' },
          { subjectType: 'lead', subjectId: 'lead-2' },
        ],
        { reason: 'Bulk erasure' }
      );

      expect(results[0]?.success).toBe(false);
      expect(results[1]?.success).toBe(true);
    });
  });

  describe('hasMemoryData', () => {
    it('should return true when subject has episodic events', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ has_data: true }],
      });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.hasMemoryData('lead', 'lead-123');

      expect(result).toBe(true);
    });

    it('should return true when subject has behavioral patterns', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ has_data: true }],
      });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.hasMemoryData('patient', 'patient-123');

      expect(result).toBe(true);
    });

    it('should return false when subject has no data', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ has_data: false }],
      });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.hasMemoryData('contact', 'contact-123');

      expect(result).toBe(false);
    });

    it('should return false when query returns no rows', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.hasMemoryData('lead', 'lead-123');

      expect(result).toBe(false);
    });
  });

  describe('getMemoryDataCount', () => {
    it('should return counts for both episodic events and behavioral patterns', async () => {
      let callCount = 0;
      mockPool.query = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: [{ count: '5' }] });
        }
        return Promise.resolve({ rows: [{ count: '2' }] });
      });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.getMemoryDataCount('lead', 'lead-123');

      expect(result.episodicEvents).toBe(5);
      expect(result.behavioralPatterns).toBe(2);
    });

    it('should return zero when no data exists', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [{ count: '0' }] });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.getMemoryDataCount('lead', 'lead-123');

      expect(result.episodicEvents).toBe(0);
      expect(result.behavioralPatterns).toBe(0);
    });

    it('should handle missing count gracefully', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.getMemoryDataCount('lead', 'lead-123');

      expect(result.episodicEvents).toBe(0);
      expect(result.behavioralPatterns).toBe(0);
    });
  });

  describe('exportSubjectData', () => {
    it('should export all episodic events and behavioral patterns', async () => {
      let callCount = 0;
      mockPool.query = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            rows: [
              {
                id: 'event-1',
                subject_type: 'lead',
                subject_id: 'lead-123',
                event_type: 'message',
                summary: 'Test event',
              },
            ],
          });
        }
        return Promise.resolve({
          rows: [
            {
              id: 'pattern-1',
              subject_type: 'lead',
              subject_id: 'lead-123',
              pattern_type: 'engagement',
              confidence: 0.95,
            },
          ],
        });
      });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.exportSubjectData('lead', 'lead-123');

      expect(result.episodicEvents).toHaveLength(1);
      expect(result.behavioralPatterns).toHaveLength(1);
      expect(result.exportedAt).toBeInstanceOf(Date);
    });

    it('should return empty arrays when no data exists', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [] });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.exportSubjectData('lead', 'lead-123');

      expect(result.episodicEvents).toHaveLength(0);
      expect(result.behavioralPatterns).toHaveLength(0);
    });

    it('should only export non-deleted events', async () => {
      const service = createCognitiveGDPRErasureService(mockPool);
      await service.exportSubjectData('lead', 'lead-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });
  });

  describe('purgeExpiredRecords', () => {
    it('should delete records older than retention period', async () => {
      mockPool.query = vi.fn().mockResolvedValue({
        rows: [{ id: '1' }, { id: '2' }],
        rowCount: 2,
      });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.purgeExpiredRecords(30);

      expect(result).toBe(2);
    });

    it('should use default retention of 30 days', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

      const service = createCognitiveGDPRErasureService(mockPool);
      await service.purgeExpiredRecords();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NOT NULL'),
        expect.any(Array)
      );
    });

    it('should return 0 when no records to purge', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.purgeExpiredRecords(30);

      expect(result).toBe(0);
    });

    it('should handle null rowCount', async () => {
      mockPool.query = vi.fn().mockResolvedValue({ rows: [], rowCount: null });

      const service = createCognitiveGDPRErasureService(mockPool);
      const result = await service.purgeExpiredRecords(30);

      expect(result).toBe(0);
    });
  });
});
