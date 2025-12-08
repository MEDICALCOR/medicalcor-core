// @ts-nocheck
/**
 * Server Action Tests: Audit
 *
 * Tests for audit log server actions including:
 * - Permission checks
 * - CRUD operations
 * - Filtering and pagination
 * - CSV export
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database client
const mockQuery = vi.fn();
const mockDbClient = { query: mockQuery };

vi.mock('@medicalcor/core', () => ({
  createDatabaseClient: () => mockDbClient,
}));

// Mock the auth module
vi.mock('@/lib/auth/server-action-auth', () => ({
  requirePermission: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

// Import after mocks are set up
import {
  getAuditLogsAction,
  getAuditStatsAction,
  createAuditLogAction,
  getAuditLogsByEntityAction,
  exportAuditLogsAction,
} from '@/app/actions/audit';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

const mockRequirePermission = vi.mocked(requirePermission);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

// Mock user
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin' as const,
  clinicId: 'clinic-123',
};

// Mock session
const mockSession = {
  user: mockUser,
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

// Test data factories
const createMockAuditLogRow = (overrides = {}) => ({
  id: 'audit-123',
  created_at: new Date('2024-01-15T10:00:00Z'),
  user_name: 'Test User',
  user_role: 'admin',
  action: 'Patient viewed',
  category: 'patient',
  status: 'success',
  details: 'Viewed patient record',
  entity_type: 'patient',
  entity_id: 'patient-456',
  entity_name: 'John Doe',
  ip_address: '192.168.1.1',
  ...overrides,
});

describe('Audit Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(mockSession);
    mockRequireCurrentUser.mockResolvedValue(mockUser);
  });

  describe('getAuditLogsAction', () => {
    it('should check for audit:read permission', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAuditLogsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('audit:read');
    });

    it('should return paginated audit logs', async () => {
      const mockRow = createMockAuditLogRow();
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await getAuditLogsAction(undefined, 100, 0);

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toMatchObject({
        id: 'audit-123',
        user: 'Test User',
        userRole: 'admin',
        action: 'Patient viewed',
        category: 'patient',
        status: 'success',
      });
      expect(result.total).toBe(1);
    });

    it('should apply category filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAuditLogsAction({ category: 'document' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('category = $2'),
        expect.arrayContaining(['clinic-123', 'document'])
      );
    });

    it('should apply status filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAuditLogsAction({ status: 'failure' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        expect.arrayContaining(['clinic-123', 'failure'])
      );
    });

    it('should apply userId filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAuditLogsAction({ userId: 'user-456' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $2'),
        expect.arrayContaining(['clinic-123', 'user-456'])
      );
    });

    it('should apply date range filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAuditLogsAction({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $2'),
        expect.arrayContaining(['clinic-123', '2024-01-01', '2024-01-31'])
      );
    });

    it('should apply search filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAuditLogsAction({ search: 'patient' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['clinic-123', '%patient%'])
      );
    });

    it('should handle pagination with limit and offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '100' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getAuditLogsAction(undefined, 50, 25);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([50, 25])
      );
    });

    it('should return empty array on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await getAuditLogsAction();

      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.error).toBe('Failed to fetch audit logs');
    });

    it('should handle null user_name as System', async () => {
      const mockRow = createMockAuditLogRow({ user_name: null });
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await getAuditLogsAction();

      expect(result.logs[0].user).toBe('System');
    });
  });

  describe('getAuditStatsAction', () => {
    it('should check for audit:read permission', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_logs: '100',
            today_logs: '5',
            failed_actions: '2',
            unique_users: '10',
            success_count: '95',
            warning_count: '3',
          },
        ],
      });

      await getAuditStatsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('audit:read');
    });

    it('should return audit statistics', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_logs: '250',
            today_logs: '15',
            failed_actions: '8',
            unique_users: '25',
            success_count: '230',
            warning_count: '12',
          },
        ],
      });

      const result = await getAuditStatsAction();

      expect(result.stats).toEqual({
        totalLogs: 250,
        todayLogs: 15,
        failedActions: 8,
        uniqueUsers: 25,
        successCount: 230,
        warningCount: 12,
        errorCount: 8,
        activeUsers: 25,
      });
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await getAuditStatsAction();

      expect(result.stats).toBeNull();
      expect(result.error).toBe('Failed to fetch audit stats');
    });
  });

  describe('createAuditLogAction', () => {
    it('should create audit log with valid data', async () => {
      const mockRow = createMockAuditLogRow({ action: 'Document uploaded' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await createAuditLogAction({
        action: 'Document uploaded',
        category: 'document',
        status: 'success',
        details: 'Uploaded patient consent form',
        entityType: 'document',
        entityId: '550e8400-e29b-41d4-a716-446655440000',
        entityName: 'consent.pdf',
      });

      expect(result.log).toBeTruthy();
      expect(result.log?.action).toBe('Document uploaded');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining([
          'clinic-123',
          'user-123',
          'Test User',
          'admin',
          'Document uploaded',
          'document',
          'success',
          'Uploaded patient consent form',
          'document',
          '550e8400-e29b-41d4-a716-446655440000',
          'consent.pdf',
        ])
      );
    });

    it('should validate input data', async () => {
      const result = await createAuditLogAction({
        // @ts-expect-error Testing invalid data
        action: '', // Empty action is invalid
        category: 'patient',
      });

      expect(result.log).toBeNull();
      expect(result.error).toBe('Failed to create audit log');
    });

    it('should validate category enum', async () => {
      const result = await createAuditLogAction({
        action: 'Test action',
        // @ts-expect-error Testing invalid category
        category: 'invalid_category',
      });

      expect(result.log).toBeNull();
      expect(result.error).toBe('Failed to create audit log');
    });

    it('should validate status enum', async () => {
      const result = await createAuditLogAction({
        action: 'Test action',
        category: 'patient',
        // @ts-expect-error Testing invalid status
        status: 'invalid_status',
      });

      expect(result.log).toBeNull();
      expect(result.error).toBe('Failed to create audit log');
    });

    it('should validate entityId as UUID', async () => {
      const result = await createAuditLogAction({
        action: 'Test action',
        category: 'patient',
        entityId: 'not-a-uuid',
      });

      expect(result.log).toBeNull();
      expect(result.error).toBe('Failed to create audit log');
    });

    it('should default status to success', async () => {
      const mockRow = createMockAuditLogRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await createAuditLogAction({
        action: 'Test action',
        category: 'patient',
      });

      expect(result.log).toBeTruthy();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['success'])
      );
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await createAuditLogAction({
        action: 'Test action',
        category: 'patient',
      });

      expect(result.log).toBeNull();
      expect(result.error).toBe('Failed to create audit log');
    });
  });

  describe('getAuditLogsByEntityAction', () => {
    it('should check for audit:read permission', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getAuditLogsByEntityAction('patient', 'patient-123');

      expect(mockRequirePermission).toHaveBeenCalledWith('audit:read');
    });

    it('should return logs for specific entity', async () => {
      const mockRows = [
        createMockAuditLogRow({ action: 'Patient viewed' }),
        createMockAuditLogRow({ action: 'Patient updated' }),
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await getAuditLogsByEntityAction('patient', 'patient-456');

      expect(result.logs).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('entity_type = $2 AND entity_id = $3'),
        ['clinic-123', 'patient', 'patient-456']
      );
    });

    it('should limit results to 50 logs', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getAuditLogsByEntityAction('document', 'doc-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 50'),
        expect.any(Array)
      );
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await getAuditLogsByEntityAction('patient', 'patient-123');

      expect(result.logs).toEqual([]);
      expect(result.error).toBe('Failed to fetch entity audit logs');
    });
  });

  describe('exportAuditLogsAction', () => {
    it('should check for audit:export permission', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await exportAuditLogsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('audit:export');
    });

    it('should export logs as CSV format', async () => {
      const mockRows = [
        createMockAuditLogRow({
          id: 'audit-1',
          action: 'Patient viewed',
          created_at: new Date('2024-01-15T10:00:00Z'),
        }),
        createMockAuditLogRow({
          id: 'audit-2',
          action: 'Document uploaded',
          created_at: new Date('2024-01-16T14:30:00Z'),
        }),
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await exportAuditLogsAction();

      expect(result.success).toBe(true);
      expect(result.data).toContain('ID,Timestamp,User,Role,Action,Category,Status');
      expect(result.data).toContain('audit-1');
      expect(result.data).toContain('audit-2');
      expect(result.data).toContain('Patient viewed');
      expect(result.data).toContain('Document uploaded');
    });

    it('should apply date range filters', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await exportAuditLogsAction({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $2'),
        expect.arrayContaining(['clinic-123', '2024-01-01', '2024-01-31'])
      );
    });

    it('should limit export to 10000 records', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await exportAuditLogsAction();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10000'),
        expect.any(Array)
      );
    });

    it('should escape CSV values with quotes', async () => {
      const mockRows = [
        createMockAuditLogRow({
          action: 'Action with "quotes" and, commas',
          details: 'Details with\nnewlines',
        }),
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await exportAuditLogsAction();

      expect(result.success).toBe(true);
      expect(result.data).toContain('"Action with "quotes" and, commas"');
    });

    it('should handle null values in CSV export', async () => {
      const mockRows = [
        createMockAuditLogRow({
          details: null,
          entity_name: null,
          ip_address: null,
        }),
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await exportAuditLogsAction();

      expect(result.success).toBe(true);
      expect(result.data).toContain('""'); // Empty quoted fields for nulls
    });

    it('should return error on database failure', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await exportAuditLogsAction();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to export audit logs');
    });
  });
});
