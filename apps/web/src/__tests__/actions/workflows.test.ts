/**
 * Server Action Tests: Workflows
 *
 * Tests for workflow server actions including:
 * - Permission checks
 * - Validation
 * - CRUD operations
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
}));

// Import after mocks are set up
import {
  getWorkflowsAction,
  getWorkflowByIdAction,
  createWorkflowAction,
  updateWorkflowAction,
  toggleWorkflowAction,
  deleteWorkflowAction,
  duplicateWorkflowAction,
} from '@/app/actions/workflows';
import { requirePermission } from '@/lib/auth/server-action-auth';

// Get mocked permission function after import
const mockRequirePermission = vi.mocked(requirePermission);

// Test data factories
const createMockWorkflowRow = (overrides = {}) => ({
  id: 'wf-123',
  name: 'Test Workflow',
  description: 'A test workflow',
  trigger_type: 'new_lead',
  trigger_config: {},
  steps: [],
  is_active: true,
  execution_count: 5,
  last_executed_at: new Date('2024-01-15'),
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-10'),
  ...overrides,
});

describe('Workflow Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(undefined);
  });

  describe('getWorkflowsAction', () => {
    it('should check for read permission', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getWorkflowsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('workflows:read');
    });

    it('should return transformed workflows', async () => {
      const mockRow = createMockWorkflowRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await getWorkflowsAction();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'wf-123',
        name: 'Test Workflow',
        isActive: true,
        executionCount: 5,
        trigger: {
          type: 'new_lead',
        },
      });
    });

    it('should return empty array when no workflows exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await getWorkflowsAction();

      expect(result).toEqual([]);
    });

    it('should throw when permission is denied', async () => {
      mockRequirePermission.mockRejectedValue(new Error('Permission denied'));

      await expect(getWorkflowsAction()).rejects.toThrow('Permission denied');
    });
  });

  describe('getWorkflowByIdAction', () => {
    it('should return workflow by ID', async () => {
      const mockRow = createMockWorkflowRow({ id: 'wf-456' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await getWorkflowByIdAction('wf-456');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('wf-456');
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['wf-456']);
    });

    it('should return null when workflow not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await getWorkflowByIdAction('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('createWorkflowAction', () => {
    it('should check for write permission', async () => {
      const mockRow = createMockWorkflowRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await createWorkflowAction({
        name: 'New Workflow',
        triggerType: 'new_lead',
        steps: [],
        isActive: true,
      });

      expect(mockRequirePermission).toHaveBeenCalledWith('workflows:write');
    });

    it('should validate input data', async () => {
      await expect(
        createWorkflowAction({
          name: '', // Invalid: empty name
          triggerType: 'new_lead',
          steps: [],
          isActive: true,
        })
      ).rejects.toThrow();
    });

    it('should create workflow with valid data', async () => {
      const mockRow = createMockWorkflowRow({ name: 'New Workflow' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await createWorkflowAction({
        name: 'New Workflow',
        description: 'Test description',
        triggerType: 'new_lead',
        steps: [],
        isActive: false,
      });

      expect(result.name).toBe('New Workflow');
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should reject invalid trigger type', async () => {
      await expect(
        createWorkflowAction({
          name: 'Test',
          // @ts-expect-error Testing invalid trigger type
          triggerType: 'invalid_trigger',
          steps: [],
        })
      ).rejects.toThrow();
    });
  });

  describe('updateWorkflowAction', () => {
    it('should update workflow with partial data', async () => {
      const mockRow = createMockWorkflowRow({ name: 'Updated Name' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await updateWorkflowAction({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw when workflow not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        updateWorkflowAction({
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Updated',
        })
      ).rejects.toThrow('Workflow not found');
    });

    it('should validate UUID format', async () => {
      await expect(
        updateWorkflowAction({
          id: 'invalid-uuid',
          name: 'Updated',
        })
      ).rejects.toThrow();
    });
  });

  describe('toggleWorkflowAction', () => {
    it('should toggle workflow active status', async () => {
      const mockRow = createMockWorkflowRow({ is_active: false });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await toggleWorkflowAction('wf-123', false);

      expect(result.isActive).toBe(false);
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [false, 'wf-123']);
    });

    it('should throw when workflow not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(toggleWorkflowAction('non-existent', true)).rejects.toThrow(
        'Workflow not found'
      );
    });
  });

  describe('deleteWorkflowAction', () => {
    it('should check for delete permission', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'wf-123' }] });

      await deleteWorkflowAction('wf-123');

      expect(mockRequirePermission).toHaveBeenCalledWith('workflows:delete');
    });

    it('should return true when workflow deleted', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: 'wf-123' }] });

      const result = await deleteWorkflowAction('wf-123');

      expect(result).toBe(true);
    });

    it('should return false when workflow not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await deleteWorkflowAction('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('duplicateWorkflowAction', () => {
    it('should create duplicate with "(Copie)" suffix', async () => {
      const mockRow = createMockWorkflowRow({ name: 'Original (Copie)' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await duplicateWorkflowAction('wf-123');

      expect(result.name).toContain('(Copie)');
    });

    it('should set duplicate as inactive', async () => {
      const mockRow = createMockWorkflowRow({ is_active: false });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await duplicateWorkflowAction('wf-123');

      expect(result.isActive).toBe(false);
    });

    it('should throw when source workflow not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(duplicateWorkflowAction('non-existent')).rejects.toThrow(
        'Source workflow not found'
      );
    });
  });
});

describe('Workflow Action Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(undefined);
  });

  it('should handle database connection errors', async () => {
    mockQuery.mockRejectedValue(new Error('Database connection failed'));

    await expect(getWorkflowsAction()).rejects.toThrow('Database connection failed');
  });

  it('should handle query timeout errors', async () => {
    mockQuery.mockRejectedValue(new Error('Query timeout'));

    await expect(getWorkflowsAction()).rejects.toThrow('Query timeout');
  });
});
