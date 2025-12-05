/**
 * Data Subject Request (DSR) Service Tests
 * Comprehensive tests for GDPR Data Subject Request handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PostgresDSRService,
  createDSRService,
  type DSRServiceDeps,
  type DSRType,
} from '../gdpr/dsr-service.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client with proper chaining
function createMockSupabase() {
  let mockResponse: any = { data: null, error: null };

  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    containedBy: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    rangeLt: vi.fn().mockReturnThis(),
    rangeGt: vi.fn().mockReturnThis(),
    rangeGte: vi.fn().mockReturnThis(),
    rangeLte: vi.fn().mockReturnThis(),
    rangeAdjacent: vi.fn().mockReturnThis(),
    overlaps: vi.fn().mockReturnThis(),
    textSearch: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(mockResponse)),
  };

  // Helper to set mock response
  chain.mockResponse = (data: any, error: any = null) => {
    mockResponse = { data, error };
  };

  return chain;
}

describe('PostgresDSRService', () => {
  let mockSupabase: any;
  let dsrService: PostgresDSRService;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    const deps: DSRServiceDeps = {
      supabase: mockSupabase as unknown as SupabaseClient,
      defaultDueDateDays: 30,
    };
    dsrService = new PostgresDSRService(deps);
  });

  describe('createRequest', () => {
    it('should create a new DSR with pending_verification status', async () => {
      const requestData = {
        subjectId: 'user@example.com',
        requestType: 'access' as DSRType,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        details: { reason: 'GDPR Article 15 request' },
      };

      const mockRow = {
        id: 'dsr-123',
        subject_id: requestData.subjectId,
        request_type: requestData.requestType,
        status: 'pending_verification',
        details: requestData.details,
        due_date: requestData.dueDate.toISOString(),
        created_at: new Date().toISOString(),
        verified_at: null,
        verification_method: null,
        completed_at: null,
        response_type: null,
        response_data: null,
        download_url: null,
        download_expires_at: null,
        correlation_id: null,
        subject_type: 'email',
      };

      mockSupabase.mockResponse(mockRow);

      const result = await dsrService.createRequest(requestData);

      expect(result.requestId).toBe('dsr-123');
      expect(result.status).toBe('pending_verification');
      expect(result.requestType).toBe('access');
      expect(result.subjectId).toBe(requestData.subjectId);
    });

    it('should use default due date if not provided', async () => {
      const requestData = {
        subjectId: 'user@example.com',
        requestType: 'erasure' as DSRType,
        details: {},
      };

      const mockRow = {
        id: 'dsr-456',
        subject_id: requestData.subjectId,
        request_type: requestData.requestType,
        status: 'pending_verification',
        details: requestData.details,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        verified_at: null,
        verification_method: null,
        completed_at: null,
        response_type: null,
        response_data: null,
        download_url: null,
        download_expires_at: null,
        correlation_id: null,
        subject_type: 'email',
      };

      mockSupabase.mockResponse(mockRow);

      const result = await dsrService.createRequest(requestData as any);

      expect(result.dueDate).toBeDefined();
      expect(result.dueDate.getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw error if database insert fails', async () => {
      const requestData = {
        subjectId: 'user@example.com',
        requestType: 'access' as DSRType,
        dueDate: new Date(),
        details: {},
      };

      mockSupabase.mockResponse(null, { message: 'Database error' });

      await expect(dsrService.createRequest(requestData)).rejects.toThrow(
        'Failed to create DSR: Database error'
      );
    });
  });

  describe('verifyRequest', () => {
    it('should verify a pending request', async () => {
      mockSupabase.eq.mockReturnValue({
        ...mockSupabase,
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      });

      await expect(
        dsrService.verifyRequest('dsr-123', 'email_verification')
      ).resolves.not.toThrow();
    });

    it('should throw error if verification fails', async () => {
      mockSupabase.eq.mockReturnValue({
        ...mockSupabase,
        eq: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Request not found' } })),
      });

      await expect(dsrService.verifyRequest('dsr-123', 'email')).rejects.toThrow(
        'Failed to verify DSR: Request not found'
      );
    });
  });

  describe('getRequestStatus', () => {
    it('should return request details', async () => {
      const mockRequest = {
        id: 'dsr-123',
        subject_id: 'user@example.com',
        request_type: 'access',
        status: 'completed',
        created_at: new Date().toISOString(),
        due_date: new Date().toISOString(),
        details: {},
        verified_at: new Date().toISOString(),
        verification_method: 'email',
        completed_at: new Date().toISOString(),
        response_type: 'fulfilled',
        response_data: { data: 'test' },
        download_url: 'https://example.com/download',
        download_expires_at: new Date().toISOString(),
        correlation_id: null,
        subject_type: 'email',
      };

      mockSupabase.mockResponse(mockRequest);

      const result = await dsrService.getRequestStatus('dsr-123');

      expect(result.requestId).toBe('dsr-123');
      expect(result.status).toBe('completed');
      expect(result.response).toBeDefined();
      expect(result.response?.responseType).toBe('fulfilled');
    });

    it('should throw error if request not found', async () => {
      mockSupabase.mockResponse(null, { message: 'Not found' });

      await expect(dsrService.getRequestStatus('invalid-id')).rejects.toThrow(
        'DSR not found: invalid-id'
      );
    });
  });

  describe('listRequests', () => {
    it('should return all requests for a subject', async () => {
      const mockRequests = [
        {
          id: 'dsr-1',
          subject_id: 'user@example.com',
          request_type: 'access',
          status: 'completed',
          created_at: new Date('2024-01-01').toISOString(),
          due_date: new Date('2024-02-01').toISOString(),
          details: {},
          verified_at: new Date().toISOString(),
          verification_method: 'email',
          completed_at: new Date().toISOString(),
          response_type: null,
          response_data: null,
          download_url: null,
          download_expires_at: null,
          correlation_id: null,
          subject_type: 'email',
        },
      ];

      mockSupabase.order.mockResolvedValue({ data: mockRequests, error: null });

      const result = await dsrService.listRequests('user@example.com');

      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('dsr-1');
    });

    it('should throw error if listing fails', async () => {
      mockSupabase.order.mockResolvedValue({ data: null, error: { message: 'Database error' } });

      await expect(dsrService.listRequests('user@example.com')).rejects.toThrow(
        'Failed to list DSRs: Database error'
      );
    });
  });

  describe('getPendingDueRequests', () => {
    it('should return requests that are past due date', async () => {
      const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const mockRequests = [
        {
          id: 'dsr-overdue',
          subject_id: 'user@example.com',
          request_type: 'access',
          status: 'verified',
          created_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
          due_date: pastDue,
          details: {},
          verified_at: new Date().toISOString(),
          verification_method: 'email',
          completed_at: null,
          response_type: null,
          response_data: null,
          download_url: null,
          download_expires_at: null,
          correlation_id: null,
          subject_type: 'email',
        },
      ];

      mockSupabase.order.mockResolvedValue({ data: mockRequests, error: null });

      const result = await dsrService.getPendingDueRequests();

      expect(result).toHaveLength(1);
      expect(result[0].requestId).toBe('dsr-overdue');
    });

    it('should throw error if query fails', async () => {
      mockSupabase.order.mockResolvedValue({ data: null, error: { message: 'Query failed' } });

      await expect(dsrService.getPendingDueRequests()).rejects.toThrow(
        'Failed to get pending DSRs: Query failed'
      );
    });
  });

  describe('getStatistics', () => {
    it('should calculate DSR statistics correctly', async () => {
      const now = new Date();
      const mockRequests = [
        {
          id: 'dsr-1',
          subject_id: 'user1@example.com',
          request_type: 'access',
          status: 'completed',
          created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          due_date: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
          details: {},
          verified_at: now.toISOString(),
          verification_method: 'email',
          completed_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          response_type: 'fulfilled',
          response_data: null,
          download_url: null,
          download_expires_at: null,
          correlation_id: null,
          subject_type: 'email',
        },
        {
          id: 'dsr-3',
          subject_id: 'user3@example.com',
          request_type: 'erasure',
          status: 'verified',
          created_at: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString(),
          due_date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          details: {},
          verified_at: now.toISOString(),
          verification_method: 'email',
          completed_at: null,
          response_type: null,
          response_data: null,
          download_url: null,
          download_expires_at: null,
          correlation_id: null,
          subject_type: 'email',
        },
      ];

      mockSupabase.select.mockResolvedValue({ data: mockRequests, error: null });

      const stats = await dsrService.getStatistics();

      expect(stats.total).toBe(2);
      expect(stats.byType.access).toBe(1);
      expect(stats.byType.erasure).toBe(1);
      expect(stats.byStatus.completed).toBe(1);
      expect(stats.byStatus.verified).toBe(1);
      expect(stats.overdueCount).toBe(1);
    });

    it('should throw error if statistics query fails', async () => {
      mockSupabase.select.mockResolvedValue({ data: null, error: { message: 'Stats query failed' } });

      await expect(dsrService.getStatistics()).rejects.toThrow(
        'Failed to get DSR statistics: Stats query failed'
      );
    });
  });

  describe('createDSRService factory', () => {
    it('should create a PostgresDSRService instance', () => {
      const deps: DSRServiceDeps = {
        supabase: mockSupabase as unknown as SupabaseClient,
      };

      const service = createDSRService(deps);

      expect(service).toBeInstanceOf(PostgresDSRService);
    });
  });
});
