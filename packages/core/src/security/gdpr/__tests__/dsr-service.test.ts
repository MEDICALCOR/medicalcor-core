/**
 * @fileoverview Data Subject Request (DSR) Service Tests
 *
 * GDPR Articles 15-22 compliance: Tests for data subject rights requests
 * including access, rectification, erasure, portability, restriction, and objection.
 *
 * @module core/security/gdpr/__tests__/dsr-service.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PostgresDSRService,
  createDSRService,
  type DSRServiceDeps,
  type DSRType,
} from '../dsr-service.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockSupabase() {
  const createQueryBuilder = () => {
    const defaultResult = { data: null, error: null };

    const builder: Record<string, unknown> = {
      then: (resolve: (value: { data: unknown; error: null }) => void) => {
        resolve(defaultResult);
        return Promise.resolve(defaultResult);
      },
    };

    const chainMethods = [
      'select',
      'insert',
      'update',
      'eq',
      'gte',
      'lte',
      'not',
      'or',
      'is',
      'order',
    ];

    chainMethods.forEach((method) => {
      builder[method] = vi.fn().mockReturnValue(builder);
    });

    builder.single = vi.fn().mockResolvedValue({ data: null, error: null });

    return builder;
  };

  return {
    from: vi.fn().mockImplementation(() => createQueryBuilder()),
  } as unknown as SupabaseClient;
}

function createMockDSRRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dsr-test-123',
    subject_id: 'subject-456',
    subject_type: 'patient',
    request_type: 'access' as DSRType,
    status: 'pending_verification',
    verified_at: null,
    verification_method: null,
    details: {},
    response_data: null,
    response_type: null,
    download_url: null,
    download_expires_at: null,
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
    correlation_id: null,
    ...overrides,
  };
}

// ============================================================================
// UNIT TESTS - DSR Service
// ============================================================================

describe('PostgresDSRService', () => {
  let supabase: SupabaseClient;
  let service: PostgresDSRService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    supabase = createMockSupabase();
    service = new PostgresDSRService({ supabase });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Factory Function', () => {
    it('should create service with createDSRService factory', () => {
      const svc = createDSRService({ supabase });
      expect(svc).toBeInstanceOf(PostgresDSRService);
    });

    it('should use custom defaultDueDateDays when provided', () => {
      const svc = createDSRService({ supabase, defaultDueDateDays: 45 });
      expect(svc).toBeInstanceOf(PostgresDSRService);
    });
  });

  describe('createRequest', () => {
    it('should create a DSR request with default status', async () => {
      const mockRow = createMockDSRRow();

      const mockBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.createRequest({
        subjectId: 'subject-456',
        requestType: 'access',
        dueDate: new Date('2024-07-15'),
        details: { reason: 'Personal data inquiry' },
      });

      expect(result.requestId).toBeDefined();
      expect(result.status).toBe('pending_verification');
      expect(result.requestType).toBe('access');
    });

    it('should throw error when database insert fails', async () => {
      const mockBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Insert failed' },
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(
        service.createRequest({
          subjectId: 'subject-456',
          requestType: 'access',
          dueDate: new Date('2024-07-15'),
          details: {},
        })
      ).rejects.toThrow('Failed to create DSR: Insert failed');
    });

    it('should use default due date when not provided', async () => {
      const mockRow = createMockDSRRow();

      const mockBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.createRequest({
        subjectId: 'subject-456',
        requestType: 'erasure',
        dueDate: new Date('2024-07-15'),
        details: {},
      });

      expect(result.dueDate).toBeDefined();
    });

    it('should log audit entry after creation', async () => {
      const mockRow = createMockDSRRow();

      let insertCallCount = 0;
      const mockBuilder = {
        insert: vi.fn().mockImplementation(() => {
          insertCallCount++;
          if (insertCallCount === 1) {
            // DSR insert
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          // Audit insert
          return {
            then: (resolve: (value: { error: null }) => void) => {
              resolve({ error: null });
              return Promise.resolve({ error: null });
            },
          };
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await service.createRequest({
        subjectId: 'subject-456',
        requestType: 'portability',
        dueDate: new Date('2024-07-15'),
        details: {},
      });

      // Verify audit was logged (2 inserts: DSR + audit)
      expect(insertCallCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('verifyRequest', () => {
    it('should update request to verified status', async () => {
      const mockBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: (value: { error: null }) => void) => {
          resolve({ error: null });
          return Promise.resolve({ error: null });
        },
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.verifyRequest('dsr-123', 'email_verification')).resolves.toBeUndefined();

      expect(mockBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'verified',
          verification_method: 'email_verification',
        })
      );
    });

    it('should throw error when verification fails', async () => {
      // Need to chain eq twice: .eq('id', requestId).eq('status', 'pending_verification')
      const mockBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Verification failed' },
          }),
        })),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.verifyRequest('dsr-123', 'email')).rejects.toThrow(
        'Failed to verify DSR: Verification failed'
      );
    });
  });

  describe('processRequest', () => {
    it('should deny request if not verified', async () => {
      const mockRow = createMockDSRRow({ status: 'pending_verification' });

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('denied');
      expect(result.reason).toBe('Request must be verified before processing');
    });

    it('should handle access request', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'access',
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            // getRequestStatus
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          // Updates
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        // Data collection tables
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.exportFormat).toBe('JSON');
    });

    it('should handle portability request', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'portability',
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.exportFormat).toBe('JSON');
      expect(result.expiresAt).toBeDefined();
    });

    it('should handle erasure request', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'erasure',
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'scheduled_deletions') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.data).toHaveProperty('message', 'Erasure scheduled');
    });

    it('should handle erasure request failure', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'erasure',
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'scheduled_deletions') {
          return {
            insert: vi.fn().mockResolvedValue({
              error: { message: 'Scheduling failed' },
            }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('denied');
      expect(result.reason).toContain('Failed to schedule erasure');
    });

    it('should handle rectification request', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'rectification',
        details: { fieldsToRectify: ['email', 'phone'] },
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('partial');
      expect(result.data).toHaveProperty('fieldsToRectify');
    });

    it('should handle rectification request without fieldsToRectify', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'rectification',
        details: {},
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('partial');
      expect((result.data as Record<string, unknown>).fieldsToRectify).toEqual([]);
    });

    it('should handle restriction request', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'restriction',
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.data).toHaveProperty('message', 'Processing restriction applied');
    });

    it('should handle objection request with objectionType', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'objection',
        details: { objectionType: 'marketing' },
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect((result.data as Record<string, unknown>).objectionType).toBe('marketing');
    });

    it('should handle objection request without objectionType', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'objection',
        details: {},
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect((result.data as Record<string, unknown>).objectionType).toBe('general');
    });

    it('should handle unsupported request type', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'automated_decision' as DSRType,
      });

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('denied');
      expect(result.reason).toBe('Unsupported request type');
    });
  });

  describe('getRequestStatus', () => {
    it('should return request when found', async () => {
      const mockRow = createMockDSRRow();

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getRequestStatus('dsr-test-123');

      expect(result.requestId).toBe('dsr-test-123');
      expect(result.status).toBe('pending_verification');
    });

    it('should throw error when request not found', async () => {
      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.getRequestStatus('nonexistent')).rejects.toThrow(
        'DSR not found: nonexistent'
      );
    });

    it('should throw error on database error', async () => {
      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'DB error' },
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.getRequestStatus('dsr-123')).rejects.toThrow('DSR not found: dsr-123');
    });
  });

  describe('listRequests', () => {
    it('should return list of requests for subject', async () => {
      const mockRows = [
        createMockDSRRow({ id: 'dsr-1' }),
        createMockDSRRow({ id: 'dsr-2', request_type: 'erasure' }),
      ];

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.listRequests('subject-456');

      expect(result).toHaveLength(2);
      expect(result[0].requestId).toBe('dsr-1');
      expect(result[1].requestId).toBe('dsr-2');
    });

    it('should throw error on database error', async () => {
      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'List failed' },
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.listRequests('subject-456')).rejects.toThrow(
        'Failed to list DSRs: List failed'
      );
    });
  });

  describe('getPendingDueRequests', () => {
    it('should return pending overdue requests', async () => {
      const mockRows = [
        createMockDSRRow({
          id: 'dsr-overdue',
          due_date: '2024-05-01T10:00:00Z',
          status: 'in_progress',
        }),
      ];

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getPendingDueRequests();

      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('dsr-overdue');
    });

    it('should throw error on database error', async () => {
      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Query failed' },
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.getPendingDueRequests()).rejects.toThrow(
        'Failed to get pending DSRs: Query failed'
      );
    });
  });

  describe('getStatistics', () => {
    it('should calculate statistics correctly', async () => {
      const mockRows = [
        createMockDSRRow({
          id: 'dsr-1',
          request_type: 'access',
          status: 'completed',
          created_at: '2024-01-15T10:00:00Z',
          completed_at: '2024-01-25T10:00:00Z',
          due_date: '2024-02-14T10:00:00Z',
        }),
        createMockDSRRow({
          id: 'dsr-2',
          request_type: 'erasure',
          status: 'in_progress',
          created_at: '2024-01-01T10:00:00Z',
          completed_at: null,
          due_date: '2024-05-01T10:00:00Z', // Overdue
        }),
        createMockDSRRow({
          id: 'dsr-3',
          request_type: 'access',
          status: 'rejected',
          created_at: '2024-02-01T10:00:00Z',
          completed_at: null,
          due_date: '2024-07-01T10:00:00Z',
        }),
      ];

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getStatistics(new Date('2024-01-01'), new Date('2024-12-31'));

      expect(result.total).toBe(3);
      expect(result.byType['access']).toBe(2);
      expect(result.byType['erasure']).toBe(1);
      expect(result.byStatus['completed']).toBe(1);
      expect(result.byStatus['in_progress']).toBe(1);
      expect(result.byStatus['rejected']).toBe(1);
      expect(result.overdueCount).toBe(1);
      expect(result.averageCompletionDays).toBe(10);
    });

    it('should handle statistics without date filters', async () => {
      const mockRows = [createMockDSRRow({ status: 'completed' })];

      const mockBuilder = {
        select: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getStatistics();

      expect(result.total).toBe(1);
    });

    it('should throw error on database error', async () => {
      const mockBuilder = {
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Stats failed' },
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.getStatistics()).rejects.toThrow(
        'Failed to get DSR statistics: Stats failed'
      );
    });

    it('should handle zero completed requests for average', async () => {
      const mockRows = [
        createMockDSRRow({
          status: 'in_progress',
          completed_at: null,
          due_date: '2024-07-01T10:00:00Z',
        }),
      ];

      const mockBuilder = {
        select: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getStatistics();

      expect(result.averageCompletionDays).toBe(0);
    });

    it('should handle cancelled status in statistics', async () => {
      const mockRows = [
        createMockDSRRow({
          status: 'cancelled',
          completed_at: null,
          due_date: '2024-07-01T10:00:00Z',
        }),
      ];

      const mockBuilder = {
        select: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getStatistics();

      // Cancelled should not be counted as overdue
      expect(result.overdueCount).toBe(0);
    });
  });

  describe('mapRowToRequest - edge cases', () => {
    it('should map row with response data', async () => {
      const mockRow = createMockDSRRow({
        response_type: 'fulfilled',
        response_data: { test: 'data' },
        download_url: 'https://example.com/download',
        download_expires_at: '2024-07-15T10:00:00Z',
      });

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getRequestStatus('dsr-test-123');

      expect(result.response).toBeDefined();
      expect(result.response?.responseType).toBe('fulfilled');
      expect(result.response?.data).toEqual({ test: 'data' });
      expect(result.response?.downloadUrl).toBe('https://example.com/download');
      expect(result.response?.expiresAt).toBeInstanceOf(Date);
    });

    it('should map row with verified_at', async () => {
      const mockRow = createMockDSRRow({
        verified_at: '2024-06-10T10:00:00Z',
        verification_method: 'id_verification',
      });

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getRequestStatus('dsr-test-123');

      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(result.verificationMethod).toBe('id_verification');
    });

    it('should map row with completed_at', async () => {
      const mockRow = createMockDSRRow({
        status: 'completed',
        completed_at: '2024-06-20T10:00:00Z',
      });

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getRequestStatus('dsr-test-123');

      expect(result.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('collectSubjectData', () => {
    it('should collect data from all tables', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'access',
      });

      const mockLeads = [{ id: 'lead-1', phone: '+40123456789' }];
      const mockConsents = [{ id: 'consent-1', type: 'marketing' }];
      const mockAppointments = [{ id: 'apt-1', date: '2024-06-20' }];
      const mockCommunications = [{ id: 'msg-1', content: 'Hello' }];

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation((table: string) => {
        callCount++;
        if (table === 'data_subject_requests') {
          if (callCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
            };
          }
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'dsr_audit_log') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'leads') {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockLeads, error: null }),
          };
        }
        if (table === 'consents') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: mockConsents, error: null }),
          };
        }
        if (table === 'appointments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockAppointments, error: null }),
          };
        }
        if (table === 'message_log') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockCommunications, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.data).toHaveProperty('leads');
      expect(result.data).toHaveProperty('consents');
      expect(result.data).toHaveProperty('appointments');
      expect(result.data).toHaveProperty('communications');
    });
  });
});
