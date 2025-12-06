/**
 * Workflows Server Actions Tests
 *
 * Comprehensive tests for workflow management actions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('@medicalcor/core', () => ({
  createDatabaseClient: vi.fn(() => mockDatabase),
}));

vi.mock('@/lib/auth/server-action-auth', () => ({
  requirePermission: vi.fn().mockResolvedValue(true),
}));

// Create mock database
const mockDatabase = {
  query: vi.fn(),
};

// Import after mocks
import {
  getWorkflowsAction,
  getWorkflowByIdAction,
  createWorkflowAction,
  updateWorkflowAction,
  toggleWorkflowAction,
  deleteWorkflowAction,
  duplicateWorkflowAction,
  getWorkflowTemplatesAction,
  createWorkflowFromTemplateAction,
} from '../workflows.js';
import { requirePermission } from '@/lib/auth/server-action-auth';

describe('Workflow Server Actions', () => {
  const mockWorkflowRow = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test Workflow',
    description: 'Test description',
    trigger_type: 'new_lead',
    trigger_config: { channel: 'whatsapp' },
    steps: [
      {
        id: 'step-1',
        type: 'action',
        action: {
          id: 'action-1',
          type: 'send_whatsapp',
          config: { template: 'welcome' },
        },
      },
    ],
    is_active: true,
    execution_count: 5,
    last_executed_at: new Date('2024-12-01'),
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-12-05'),
  };

  const mockTemplateRow = {
    id: 'template-1',
    name: 'Welcome Template',
    description: 'Welcome new leads',
    category: 'onboarding',
    trigger_type: 'new_lead',
    trigger_config: {},
    steps: [
      {
        id: 'step-1',
        type: 'action',
        action: {
          id: 'action-1',
          type: 'send_whatsapp',
          config: { template: 'welcome' },
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabase.query.mockReset();
  });

  describe('getWorkflowsAction', () => {
    it('should require workflows:read permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await getWorkflowsAction();

      expect(requirePermission).toHaveBeenCalledWith('workflows:read');
    });

    it('should return all workflows', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [mockWorkflowRow],
      });

      const result = await getWorkflowsAction();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(mockWorkflowRow.id);
      expect(result[0]?.name).toBe('Test Workflow');
    });

    it('should transform workflow rows correctly', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [mockWorkflowRow],
      });

      const result = await getWorkflowsAction();
      const workflow = result[0]!;

      expect(workflow.trigger.type).toBe('new_lead');
      expect(workflow.trigger.config).toEqual({ channel: 'whatsapp' });
      expect(workflow.isActive).toBe(true);
      expect(workflow.executionCount).toBe(5);
      expect(workflow.steps).toHaveLength(1);
    });

    it('should return empty array when no workflows', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await getWorkflowsAction();

      expect(result).toEqual([]);
    });

    it('should handle null description', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [{ ...mockWorkflowRow, description: null }],
      });

      const result = await getWorkflowsAction();

      expect(result[0]?.description).toBeUndefined();
    });

    it('should handle null last_executed_at', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [{ ...mockWorkflowRow, last_executed_at: null }],
      });

      const result = await getWorkflowsAction();

      expect(result[0]?.lastExecutedAt).toBeUndefined();
    });
  });

  describe('getWorkflowByIdAction', () => {
    it('should require workflows:read permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await getWorkflowByIdAction('test-id');

      expect(requirePermission).toHaveBeenCalledWith('workflows:read');
    });

    it('should return workflow by ID', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [mockWorkflowRow],
      });

      const result = await getWorkflowByIdAction(mockWorkflowRow.id);

      expect(result?.id).toBe(mockWorkflowRow.id);
      expect(mockDatabase.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [
        mockWorkflowRow.id,
      ]);
    });

    it('should return null when workflow not found', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await getWorkflowByIdAction('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('createWorkflowAction', () => {
    const validCreateData = {
      name: 'New Workflow',
      description: 'New description',
      triggerType: 'new_lead' as const,
      triggerConfig: { channel: 'web' },
      steps: [
        {
          id: 'step-1',
          type: 'action' as const,
          action: {
            id: 'action-1',
            type: 'send_whatsapp' as const,
            config: { template: 'welcome' },
          },
        },
      ],
      isActive: false,
    };

    it('should require workflows:write permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await createWorkflowAction(validCreateData);

      expect(requirePermission).toHaveBeenCalledWith('workflows:write');
    });

    it('should create workflow with valid data', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [mockWorkflowRow],
      });

      const result = await createWorkflowAction(validCreateData);

      expect(result).toBeDefined();
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workflows'),
        expect.arrayContaining([
          validCreateData.name,
          validCreateData.description,
          validCreateData.triggerType,
        ])
      );
    });

    it('should handle missing description', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const data = {
        name: 'Test',
        triggerType: 'new_lead' as const,
        steps: [],
        isActive: false,
      };

      await createWorkflowAction(data);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null])
      );
    });

    it('should handle missing triggerConfig', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const data = {
        name: 'Test',
        triggerType: 'appointment_scheduled' as const,
        steps: [],
        isActive: false,
      };

      await createWorkflowAction(data);

      expect(mockDatabase.query).toHaveBeenCalled();
    });

    it('should validate trigger types', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const triggerTypes = [
        'new_lead',
        'appointment_scheduled',
        'appointment_completed',
        'no_response',
        'message_received',
        'tag_added',
        'status_changed',
      ] as const;

      for (const triggerType of triggerTypes) {
        await createWorkflowAction({
          name: 'Test',
          triggerType,
          steps: [],
          isActive: false,
        });
      }

      expect(mockDatabase.query).toHaveBeenCalledTimes(triggerTypes.length);
    });
  });

  describe('updateWorkflowAction', () => {
    it('should require workflows:write permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await updateWorkflowAction({
        id: mockWorkflowRow.id,
        name: 'Updated Name',
      });

      expect(requirePermission).toHaveBeenCalledWith('workflows:write');
    });

    it('should update workflow name', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await updateWorkflowAction({
        id: mockWorkflowRow.id,
        name: 'Updated Name',
      });

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SET name ='),
        expect.arrayContaining(['Updated Name', mockWorkflowRow.id])
      );
    });

    it('should update multiple fields', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await updateWorkflowAction({
        id: mockWorkflowRow.id,
        name: 'Updated',
        description: 'New desc',
        isActive: true,
      });

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('description'),
        expect.arrayContaining(['Updated', 'New desc', true, mockWorkflowRow.id])
      );
    });

    it('should update trigger type and config', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await updateWorkflowAction({
        id: mockWorkflowRow.id,
        triggerType: 'message_received',
        triggerConfig: { channel: 'sms' },
      });

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('trigger_type'),
        expect.any(Array)
      );
    });

    it('should update steps', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const newSteps = [
        {
          id: 'new-step',
          type: 'delay' as const,
          delay: { value: 1, unit: 'hours' as const },
        },
      ];

      await updateWorkflowAction({
        id: mockWorkflowRow.id,
        steps: newSteps,
      });

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('steps'),
        expect.any(Array)
      );
    });

    it('should return existing workflow when no updates provided', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const result = await updateWorkflowAction({
        id: mockWorkflowRow.id,
      });

      expect(result).toBeDefined();
    });

    it('should throw when workflow not found during update', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      // Use valid UUID format to pass validation
      await expect(
        updateWorkflowAction({
          id: '550e8400-e29b-41d4-a716-446655440099',
          name: 'Test',
        })
      ).rejects.toThrow('Workflow not found');
    });

    it('should throw when workflow not found with empty updates', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      // Use valid UUID format to pass validation
      await expect(
        updateWorkflowAction({
          id: '550e8400-e29b-41d4-a716-446655440099',
        })
      ).rejects.toThrow('Workflow not found');
    });
  });

  describe('toggleWorkflowAction', () => {
    it('should require workflows:write permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await toggleWorkflowAction(mockWorkflowRow.id, true);

      expect(requirePermission).toHaveBeenCalledWith('workflows:write');
    });

    it('should toggle workflow to active', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await toggleWorkflowAction(mockWorkflowRow.id, true);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SET is_active = $1'),
        [true, mockWorkflowRow.id]
      );
    });

    it('should toggle workflow to inactive', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await toggleWorkflowAction(mockWorkflowRow.id, false);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SET is_active = $1'),
        [false, mockWorkflowRow.id]
      );
    });

    it('should throw when workflow not found', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await expect(toggleWorkflowAction('non-existent', true)).rejects.toThrow(
        'Workflow not found'
      );
    });
  });

  describe('deleteWorkflowAction', () => {
    it('should require workflows:delete permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [{ id: mockWorkflowRow.id }] });

      await deleteWorkflowAction(mockWorkflowRow.id);

      expect(requirePermission).toHaveBeenCalledWith('workflows:delete');
    });

    it('should return true when workflow deleted', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [{ id: mockWorkflowRow.id }],
      });

      const result = await deleteWorkflowAction(mockWorkflowRow.id);

      expect(result).toBe(true);
    });

    it('should return false when workflow not found', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await deleteWorkflowAction('non-existent');

      expect(result).toBe(false);
    });

    it('should execute DELETE query with ID', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await deleteWorkflowAction('test-id');

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM workflows WHERE id = $1'),
        ['test-id']
      );
    });
  });

  describe('duplicateWorkflowAction', () => {
    it('should require workflows:write permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await duplicateWorkflowAction(mockWorkflowRow.id);

      expect(requirePermission).toHaveBeenCalledWith('workflows:write');
    });

    it('should duplicate workflow', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [{ ...mockWorkflowRow, name: 'Test Workflow (Copie)' }],
      });

      const result = await duplicateWorkflowAction(mockWorkflowRow.id);

      expect(result.name).toContain('(Copie)');
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining("name || ' (Copie)'"),
        [mockWorkflowRow.id]
      );
    });

    it('should set duplicated workflow as inactive', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await duplicateWorkflowAction(mockWorkflowRow.id);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('false'),
        expect.any(Array)
      );
    });

    it('should throw when source workflow not found', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await expect(duplicateWorkflowAction('non-existent')).rejects.toThrow(
        'Source workflow not found'
      );
    });
  });

  describe('getWorkflowTemplatesAction', () => {
    it('should require workflows:read permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await getWorkflowTemplatesAction();

      expect(requirePermission).toHaveBeenCalledWith('workflows:read');
    });

    it('should return all templates', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [mockTemplateRow],
      });

      const result = await getWorkflowTemplatesAction();

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Welcome Template');
    });

    it('should transform template rows correctly', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [mockTemplateRow],
      });

      const result = await getWorkflowTemplatesAction();
      const template = result[0]!;

      expect(template.category).toBe('onboarding');
      expect(template.trigger.type).toBe('new_lead');
      expect(template.steps).toHaveLength(1);
    });
  });

  describe('createWorkflowFromTemplateAction', () => {
    it('should require workflows:write permission', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await createWorkflowFromTemplateAction('template-1');

      expect(requirePermission).toHaveBeenCalledWith('workflows:write');
    });

    it('should create workflow from template', async () => {
      mockDatabase.query.mockResolvedValue({
        rows: [mockWorkflowRow],
      });

      const result = await createWorkflowFromTemplateAction('template-1');

      expect(result).toBeDefined();
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM workflow_templates'),
        ['template-1']
      );
    });

    it('should set created workflow as inactive', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await createWorkflowFromTemplateAction('template-1');

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('false'),
        expect.any(Array)
      );
    });

    it('should throw when template not found', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      await expect(createWorkflowFromTemplateAction('non-existent')).rejects.toThrow(
        'Template not found'
      );
    });
  });

  describe('Validation Schemas', () => {
    it('should validate workflow step types', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const stepTypes = ['action', 'condition', 'delay'] as const;

      for (const type of stepTypes) {
        const step = {
          id: 'test',
          type,
          ...(type === 'delay' && { delay: { value: 1, unit: 'hours' as const } }),
        };

        await createWorkflowAction({
          name: 'Test',
          triggerType: 'new_lead',
          steps: [step],
          isActive: false,
        });
      }
    });

    it('should validate action types', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const actionTypes = [
        'send_whatsapp',
        'send_sms',
        'send_email',
        'add_tag',
        'remove_tag',
        'change_status',
        'assign_to',
        'create_task',
        'wait',
      ] as const;

      for (const type of actionTypes) {
        await createWorkflowAction({
          name: 'Test',
          triggerType: 'new_lead',
          steps: [
            {
              id: 'step',
              type: 'action',
              action: { id: 'action', type, config: {} },
            },
          ],
          isActive: false,
        });
      }
    });

    it('should validate condition step', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      await createWorkflowAction({
        name: 'Test',
        triggerType: 'new_lead',
        steps: [
          {
            id: 'condition-step',
            type: 'condition',
            condition: {
              conditions: [
                {
                  id: 'cond-1',
                  field: 'lead.score',
                  operator: 'greater_than',
                  value: 50,
                },
              ],
              logic: 'and',
              trueBranch: [],
              falseBranch: [],
            },
          },
        ],
        isActive: false,
      });

      expect(mockDatabase.query).toHaveBeenCalled();
    });

    it('should validate condition operators', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const operators = ['equals', 'not_equals', 'contains', 'greater_than', 'less_than'] as const;

      for (const operator of operators) {
        await createWorkflowAction({
          name: 'Test',
          triggerType: 'new_lead',
          steps: [
            {
              id: 'step',
              type: 'condition',
              condition: {
                conditions: [{ id: 'c', field: 'f', operator, value: 'v' }],
                logic: 'and',
              },
            },
          ],
          isActive: false,
        });
      }
    });

    it('should validate delay units', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [mockWorkflowRow] });

      const units = ['minutes', 'hours', 'days'] as const;

      for (const unit of units) {
        await createWorkflowAction({
          name: 'Test',
          triggerType: 'new_lead',
          steps: [
            {
              id: 'step',
              type: 'delay',
              delay: { value: 1, unit },
            },
          ],
          isActive: false,
        });
      }
    });
  });
});
