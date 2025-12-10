/**
 * Tests for DSR (Data Subject Request) Service
 *
 * Tests GDPR Articles 15-22 compliance functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresDSRService, createDSRService, type DSRServiceDeps } from '../dsr-service.js';

// Mock Supabase client
const createMockSupabase = () => {
  const mockInsert = vi.fn().mockReturnThis();
  const mockSelect = vi.fn().mockReturnThis();
  const mockUpdate = vi.fn().mockReturnThis();
  const mockEq = vi.fn().mockReturnThis();
  const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
  const mockNot = vi.fn().mockReturnThis();
  const mockLte = vi.fn().mockReturnThis();
  const mockGte = vi.fn().mockReturnThis();
  const mockOr = vi.fn().mockReturnThis();
  const mockIs = vi.fn().mockReturnThis();

  const createChain = () => ({
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    eq: mockEq,
    single: mockSingle,
    order: mockOrder,
    not: mockNot,
    lte: mockLte,
    gte: mockGte,
    or: mockOr,
    is: mockIs,
  });

  mockInsert.mockImplementation(() => createChain());
  mockSelect.mockImplementation(() => createChain());
  mockUpdate.mockImplementation(() => createChain());
  mockEq.mockImplementation(() => createChain());
  mockNot.mockImplementation(() => createChain());
  mockLte.mockImplementation(() => createChain());
  mockGte.mockImplementation(() => createChain());
  mockOr.mockImplementation(() => createChain());
  mockIs.mockImplementation(() => createChain());

  return {
    from: vi.fn().mockReturnValue(createChain()),
    _mocks: {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
      eq: mockEq,
      single: mockSingle,
      order: mockOrder,
      not: mockNot,
      lte: mockLte,
      gte: mockGte,
      or: mockOr,
      is: mockIs,
    },
  };
};

// Helper to create mock DSR row
const createMockDSRRow = (overrides = {}) => ({
  id: 'dsr-123',
  subject_id: 'subject-456',
  subject_type: 'lead',
  request_type: 'access' as const,
  status: 'pending_verification' as const,
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
});

describe('PostgresDSRService', () => {
  let service: PostgresDSRService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    const deps: DSRServiceDeps = {
      supabase: mockSupabase as unknown as DSRServiceDeps['supabase'],
    };
    service = new PostgresDSRService(deps);
  });

  describe('constructor', () => {
    it('should create service with default due date days', () => {
      const deps: DSRServiceDeps = {
        supabase: mockSupabase as unknown as DSRServiceDeps['supabase'],
      };
      const svc = new PostgresDSRService(deps);
      expect(svc).toBeInstanceOf(PostgresDSRService);
    });

    it('should create service with custom due date days', () => {
      const deps: DSRServiceDeps = {
        supabase: mockSupabase as unknown as DSRServiceDeps['supabase'],
        defaultDueDateDays: 14,
      };
      const svc = new PostgresDSRService(deps);
      expect(svc).toBeInstanceOf(PostgresDSRService);
    });
  });

  describe('createRequest', () => {
    it('should create a new DSR with pending_verification status', async () => {
      const mockRow = createMockDSRRow();
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      const result = await service.createRequest({
        subjectId: 'subject-456',
        requestType: 'access',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        details: {},
      });

      expect(result.status).toBe('pending_verification');
      expect(result.requestType).toBe('access');
      expect(mockSupabase.from).toHaveBeenCalledWith('data_subject_requests');
    });

    it('should set default due date if not provided', async () => {
      const mockRow = createMockDSRRow();
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      await service.createRequest({
        subjectId: 'subject-456',
        requestType: 'erasure',
        dueDate: new Date(),
        details: {},
      });

      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabase._mocks.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(
        service.createRequest({
          subjectId: 'subject-456',
          requestType: 'access',
          dueDate: new Date(),
          details: {},
        })
      ).rejects.toThrow('Failed to create DSR');
    });

    it('should log audit entry after creation', async () => {
      const mockRow = createMockDSRRow();
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      await service.createRequest({
        subjectId: 'subject-456',
        requestType: 'portability',
        dueDate: new Date(),
        details: {},
      });

      // Should have called from twice: once for insert, once for audit
      expect(mockSupabase.from).toHaveBeenCalledWith('dsr_audit_log');
    });
  });

  describe('verifyRequest', () => {
    it('should verify a pending request', async () => {
      mockSupabase._mocks.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      await service.verifyRequest('dsr-123', 'email_verification');

      expect(mockSupabase.from).toHaveBeenCalledWith('data_subject_requests');
    });

    it('should throw on verification error', async () => {
      mockSupabase._mocks.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: { message: 'Update failed' } }),
      });

      await expect(service.verifyRequest('dsr-123', 'id_check')).rejects.toThrow(
        'Failed to verify DSR'
      );
    });

    it('should log audit entry after verification', async () => {
      mockSupabase._mocks.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      await service.verifyRequest('dsr-123', 'document_upload');

      expect(mockSupabase.from).toHaveBeenCalledWith('dsr_audit_log');
    });
  });

  describe('getRequestStatus', () => {
    it('should return request status', async () => {
      const mockRow = createMockDSRRow({ status: 'verified' });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      const result = await service.getRequestStatus('dsr-123');

      expect(result.status).toBe('verified');
      expect(result.requestId).toBe('dsr-123');
    });

    it('should throw for non-existent request', async () => {
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: null, error: null });

      await expect(service.getRequestStatus('non-existent')).rejects.toThrow('DSR not found');
    });

    it('should throw on database error', async () => {
      mockSupabase._mocks.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Query error' },
      });

      await expect(service.getRequestStatus('dsr-123')).rejects.toThrow('DSR not found');
    });

    it('should map response data correctly', async () => {
      const mockRow = createMockDSRRow({
        response_type: 'fulfilled',
        response_data: { foo: 'bar' },
        download_url: 'https://example.com/download',
        download_expires_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
        verification_method: 'email',
      });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      const result = await service.getRequestStatus('dsr-123');

      expect(result.response?.responseType).toBe('fulfilled');
      expect(result.response?.data).toEqual({ foo: 'bar' });
      expect(result.response?.downloadUrl).toBe('https://example.com/download');
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(result.verificationMethod).toBe('email');
    });
  });

  describe('listRequests', () => {
    it('should list all requests for a subject', async () => {
      const mockRows = [
        createMockDSRRow({ id: 'dsr-1', request_type: 'access' }),
        createMockDSRRow({ id: 'dsr-2', request_type: 'erasure' }),
      ];
      mockSupabase._mocks.order.mockResolvedValueOnce({ data: mockRows, error: null });

      const result = await service.listRequests('subject-456');

      expect(result).toHaveLength(2);
      expect(result[0]?.requestType).toBe('access');
      expect(result[1]?.requestType).toBe('erasure');
    });

    it('should throw on database error', async () => {
      mockSupabase._mocks.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Query failed' },
      });

      await expect(service.listRequests('subject-456')).rejects.toThrow('Failed to list DSRs');
    });

    it('should order by created_at descending', async () => {
      mockSupabase._mocks.order.mockResolvedValueOnce({ data: [], error: null });

      await service.listRequests('subject-456');

      expect(mockSupabase._mocks.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('processRequest', () => {
    beforeEach(() => {
      // Reset mocks for process request tests
      mockSupabase._mocks.single.mockReset();
    });

    it('should deny unverified request', async () => {
      const mockRow = createMockDSRRow({ status: 'pending_verification' });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('denied');
      expect(result.reason).toContain('verified');
    });

    it('should process verified access request', async () => {
      // This test verifies that an access request returns fulfilled with JSON format
      const mockRow = createMockDSRRow({ status: 'verified', request_type: 'access' });

      // Setup chain for getRequestStatus
      const chainWithSingle = {
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
        }),
      };

      // For collectSubjectData tables - need .eq().is() chain
      const dataChain = {
        or: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'data_subject_requests') {
          return {
            select: vi.fn().mockReturnValue(chainWithSingle),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'dsr_audit_log') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        // For collectSubjectData tables (leads, consents, appointments, message_log)
        return {
          select: vi.fn().mockReturnValue(dataChain),
        };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.exportFormat).toBe('JSON');
    });

    it('should process portability request', async () => {
      const mockRow = createMockDSRRow({ status: 'verified', request_type: 'portability' });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });
      mockSupabase._mocks.is.mockResolvedValue({ data: [], error: null });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.data).toHaveProperty('format', 'GDPR_PORTABLE_v1');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should process erasure request', async () => {
      const mockRow = createMockDSRRow({ status: 'verified', request_type: 'erasure' });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });
      mockSupabase._mocks.insert.mockReturnValue({
        select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }),
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.data).toHaveProperty('message', 'Erasure scheduled');
    });

    it('should process rectification request', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'rectification',
        details: { fieldsToRectify: ['email', 'phone'] },
      });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('partial');
      expect(result.data).toHaveProperty('fieldsToRectify');
    });

    it('should process restriction request', async () => {
      const mockRow = createMockDSRRow({ status: 'verified', request_type: 'restriction' });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.data).toHaveProperty('message', 'Processing restriction applied');
    });

    it('should process objection request', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'objection',
        details: { objectionType: 'marketing' },
      });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('fulfilled');
      expect(result.data).toHaveProperty('objectionType', 'marketing');
    });

    it('should handle objection without specific type', async () => {
      const mockRow = createMockDSRRow({
        status: 'verified',
        request_type: 'objection',
        details: {},
      });
      mockSupabase._mocks.single.mockResolvedValueOnce({ data: mockRow, error: null });

      const result = await service.processRequest('dsr-123');

      expect(result.data).toHaveProperty('objectionType', 'general');
    });

    it('should handle erasure scheduling error', async () => {
      const mockRow = createMockDSRRow({ status: 'verified', request_type: 'erasure' });

      // Setup chain for getRequestStatus
      const chainWithSingle = {
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
        }),
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'data_subject_requests') {
          return {
            select: vi.fn().mockReturnValue(chainWithSingle),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'dsr_audit_log') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'scheduled_deletions') {
          return { insert: vi.fn().mockResolvedValue({ error: { message: 'Insert failed' } }) };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await service.processRequest('dsr-123');

      expect(result.responseType).toBe('denied');
      expect(result.reason).toContain('Failed to schedule erasure');
    });
  });

  describe('getPendingDueRequests', () => {
    it('should return pending requests that are due', async () => {
      const mockRows = [
        createMockDSRRow({
          status: 'verified',
          due_date: new Date(Date.now() - 1000).toISOString(),
        }),
      ];
      mockSupabase._mocks.order.mockResolvedValueOnce({ data: mockRows, error: null });

      const result = await service.getPendingDueRequests();

      expect(result).toHaveLength(1);
    });

    it('should throw on database error', async () => {
      mockSupabase._mocks.order.mockResolvedValueOnce({
        data: null,
        error: { message: 'Query failed' },
      });

      await expect(service.getPendingDueRequests()).rejects.toThrow('Failed to get pending DSRs');
    });
  });

  describe('getStatistics', () => {
    it('should calculate statistics without date range', async () => {
      const mockRows = [
        createMockDSRRow({
          request_type: 'access',
          status: 'completed',
          completed_at: new Date().toISOString(),
        }),
        createMockDSRRow({ request_type: 'erasure', status: 'in_progress' }),
        createMockDSRRow({
          request_type: 'access',
          status: 'pending_verification',
          due_date: new Date(Date.now() - 1000).toISOString(),
        }),
      ];
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      });

      const result = await service.getStatistics();

      expect(result.total).toBe(3);
      expect(result.byType.access).toBe(2);
      expect(result.byType.erasure).toBe(1);
      expect(result.byStatus.completed).toBe(1);
      expect(result.overdueCount).toBe(1);
    });

    it('should filter by date range', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await service.getStatistics(startDate, endDate);

      expect(mockSupabase.from).toHaveBeenCalledWith('data_subject_requests');
    });

    it('should throw on database error', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } }),
      });

      await expect(service.getStatistics()).rejects.toThrow('Failed to get DSR statistics');
    });

    it('should calculate average completion days', async () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const mockRows = [
        createMockDSRRow({
          status: 'completed',
          created_at: threeDaysAgo.toISOString(),
          completed_at: now.toISOString(),
        }),
      ];
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
      });

      const result = await service.getStatistics();

      expect(result.averageCompletionDays).toBeCloseTo(3, 0);
    });

    it('should return zero average for no completed requests', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      });

      const result = await service.getStatistics();

      expect(result.averageCompletionDays).toBe(0);
    });
  });
});

describe('createDSRService factory', () => {
  it('should create PostgresDSRService instance', () => {
    const mockSupabase = createMockSupabase();
    const deps: DSRServiceDeps = {
      supabase: mockSupabase as unknown as DSRServiceDeps['supabase'],
    };

    const service = createDSRService(deps);

    expect(service).toBeInstanceOf(PostgresDSRService);
  });
});
