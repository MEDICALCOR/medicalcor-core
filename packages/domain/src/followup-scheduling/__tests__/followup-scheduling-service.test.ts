/**
 * @fileoverview Tests for Follow-up Scheduling Service
 *
 * M9 Feature: Automated follow-up task creation after call dispositions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FollowUpSchedulingService,
  createFollowUpSchedulingService,
  FollowUpTaskNotFoundError,
  SnoozeNotAllowedError,
  MaxAttemptsReachedError,
  InvalidTaskStateError,
  type IFollowUpSchedulingRepository,
  type ScheduleFromDispositionInput,
  type ScheduleManualFollowUpInput,
} from '../followup-scheduling-service.js';
import type {
  FollowUpTask,
  CreateFollowUpTask,
  UpdateFollowUpTask,
  FollowUpTaskFilters,
  FollowUpTaskPagination,
  FollowUpTaskPaginatedResult,
  FollowUpSchedulingConfig,
  FollowUpTaskSummary,
  AgentFollowUpPerformance,
} from '@medicalcor/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

// Valid UUIDs for testing
const MOCK_IDS = {
  taskId: '11111111-1111-1111-1111-111111111111',
  clinicId: '22222222-2222-2222-2222-222222222222',
  leadId: '33333333-3333-3333-3333-333333333333',
  dispositionId: '44444444-4444-4444-4444-444444444444',
  agentId: '55555555-5555-5555-5555-555555555555',
  caseId: '66666666-6666-6666-6666-666666666666',
};

function createMockTask(overrides: Partial<FollowUpTask> = {}): FollowUpTask {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return {
    id: MOCK_IDS.taskId,
    clinicId: MOCK_IDS.clinicId,
    leadId: MOCK_IDS.leadId,
    dispositionId: MOCK_IDS.dispositionId,
    caseId: null,
    type: 'callback',
    priority: 'high',
    status: 'pending',
    preferredChannel: 'phone',
    scheduledAt: now,
    dueAt: tomorrow,
    timeWindowStart: null,
    timeWindowEnd: null,
    assignedAgentId: null,
    requiredSkills: [],
    reason: 'Customer requested callback',
    notes: null,
    guidanceId: null,
    tags: [],
    leadPhone: '+40712345678',
    leadName: 'Ion Popescu',
    leadScore: 'HOT',
    leadLanguage: 'ro',
    attemptCount: 0,
    maxAttempts: 3,
    lastAttemptAt: null,
    lastAttemptOutcome: null,
    reminderSent: false,
    reminderSentAt: null,
    completedAt: null,
    completionOutcome: null,
    completionNotes: null,
    resultDispositionId: null,
    snoozeCount: 0,
    maxSnoozes: 2,
    originalDueAt: null,
    hubspotTaskId: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    correlationId: 'corr-123',
    metadata: {},
    ...overrides,
  };
}

function createMockRepository(): IFollowUpSchedulingRepository {
  return {
    create: vi
      .fn()
      .mockImplementation((input: CreateFollowUpTask) =>
        Promise.resolve(createMockTask({ ...input, id: 'new-task-id' }))
      ),
    findById: vi.fn().mockResolvedValue(null),
    findByLeadId: vi.fn().mockResolvedValue([]),
    findMany: vi.fn().mockResolvedValue({
      data: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
    } as FollowUpTaskPaginatedResult),
    update: vi
      .fn()
      .mockImplementation((id: string, updates: UpdateFollowUpTask) =>
        Promise.resolve(createMockTask({ id, ...updates }))
      ),
    delete: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi
      .fn()
      .mockImplementation((id: string, status) => Promise.resolve(createMockTask({ id, status }))),
    getPendingForAgent: vi.fn().mockResolvedValue([]),
    getDueTasks: vi.fn().mockResolvedValue([]),
    getOverdueTasks: vi.fn().mockResolvedValue([]),
    markOverdue: vi.fn().mockResolvedValue(0),
    assignToAgent: vi
      .fn()
      .mockImplementation((taskId: string, agentId: string) =>
        Promise.resolve(createMockTask({ id: taskId, assignedAgentId: agentId }))
      ),
    unassign: vi
      .fn()
      .mockImplementation((taskId: string) =>
        Promise.resolve(createMockTask({ id: taskId, assignedAgentId: null }))
      ),
    getSummary: vi.fn().mockResolvedValue({
      clinicId: MOCK_IDS.clinicId,
      period: { start: new Date(), end: new Date() },
      totalTasks: 0,
      byStatus: {
        pending: 0,
        due: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        overdue: 0,
        snoozed: 0,
      },
      byType: {},
      byPriority: { urgent: 0, high: 0, medium: 0, low: 0 },
      completionRate: 0,
      avgCompletionTimeHours: null,
      overdueRate: 0,
    } as FollowUpTaskSummary),
    getAgentPerformance: vi.fn().mockResolvedValue({
      clinicId: MOCK_IDS.clinicId,
      agentId: MOCK_IDS.agentId,
      period: { start: new Date(), end: new Date() },
      tasksAssigned: 0,
      tasksCompleted: 0,
      tasksOverdue: 0,
      avgCompletionTimeHours: null,
      completionRate: 0,
      onTimeRate: 0,
      avgAttemptsPerTask: 0,
    } as AgentFollowUpPerformance),
    countByStatus: vi.fn().mockResolvedValue(0),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('FollowUpSchedulingService', () => {
  let service: FollowUpSchedulingService;
  let mockRepository: IFollowUpSchedulingRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    service = createFollowUpSchedulingService({
      repository: mockRepository,
    });
  });

  describe('createFollowUpSchedulingService', () => {
    it('should create service with default config', () => {
      const svc = createFollowUpSchedulingService({
        repository: mockRepository,
      });
      expect(svc).toBeInstanceOf(FollowUpSchedulingService);
    });

    it('should create service with custom config', () => {
      const customConfig: Partial<FollowUpSchedulingConfig> = {
        autoAssignToOriginalAgent: false,
        businessHoursStart: '08:00',
        businessHoursEnd: '20:00',
      };
      const svc = createFollowUpSchedulingService({
        repository: mockRepository,
        config: customConfig,
      });
      expect(svc).toBeInstanceOf(FollowUpSchedulingService);
    });
  });

  describe('scheduleFromDisposition', () => {
    const baseInput: ScheduleFromDispositionInput = {
      clinicId: MOCK_IDS.clinicId,
      leadId: MOCK_IDS.leadId,
      dispositionId: MOCK_IDS.dispositionId,
      dispositionCode: 'CALLBACK_REQUESTED',
      requiresFollowUp: true,
      leadPhone: '+40712345678',
      leadName: 'Ion Popescu',
      leadScore: 'HOT',
      correlationId: 'corr-123',
    };

    it('should create follow-up task from disposition', async () => {
      const task = await service.scheduleFromDisposition(baseInput);

      expect(task).not.toBeNull();
      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(task?.type).toBe('callback');
      expect(task?.priority).toBe('urgent'); // HOT leads get urgent priority
    });

    it('should return null when follow-up not required', async () => {
      const task = await service.scheduleFromDisposition({
        ...baseInput,
        requiresFollowUp: false,
      });

      expect(task).toBeNull();
      expect(mockRepository.create).not.toHaveBeenCalled();
    });

    it('should determine correct task type from disposition code', async () => {
      const testCases = [
        { code: 'CALLBACK_REQUESTED', expectedType: 'callback' },
        { code: 'DECISION_PENDING', expectedType: 'decision_follow_up' },
        { code: 'INTERESTED', expectedType: 'nurture' },
        { code: 'NO_ANSWER', expectedType: 'follow_up_call' },
        { code: 'VOICEMAIL', expectedType: 'follow_up_call' },
      ];

      for (const { code, expectedType } of testCases) {
        vi.clearAllMocks();
        const task = await service.scheduleFromDisposition({
          ...baseInput,
          dispositionCode: code,
        });

        expect(task?.type).toBe(expectedType);
      }
    });

    it('should determine priority based on lead score', async () => {
      const testCases = [
        { score: 'HOT' as const, expectedPriority: 'urgent' },
        { score: 'WARM' as const, expectedPriority: 'high' },
        { score: 'COLD' as const, expectedPriority: 'medium' },
        { score: 'UNQUALIFIED' as const, expectedPriority: 'low' },
      ];

      for (const { score, expectedPriority } of testCases) {
        vi.clearAllMocks();
        const task = await service.scheduleFromDisposition({
          ...baseInput,
          leadScore: score,
        });

        expect(task?.priority).toBe(expectedPriority);
      }
    });

    it('should use followUpDays from disposition when provided', async () => {
      await service.scheduleFromDisposition({
        ...baseInput,
        followUpDays: 5,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledAt: expect.any(Date),
        })
      );

      const createCall = vi.mocked(mockRepository.create).mock.calls[0]?.[0];
      const scheduledAt = new Date(createCall?.scheduledAt as Date);
      const now = new Date();
      const diffDays = Math.round((scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Should be around 5 days (may vary due to business hours adjustment)
      expect(diffDays).toBeGreaterThanOrEqual(4);
      expect(diffDays).toBeLessThanOrEqual(7);
    });

    it('should auto-assign to original agent when configured', async () => {
      const svc = createFollowUpSchedulingService({
        repository: mockRepository,
        config: { autoAssignToOriginalAgent: true },
      });

      await svc.scheduleFromDisposition({
        ...baseInput,
        agentId: MOCK_IDS.agentId,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedAgentId: MOCK_IDS.agentId,
        })
      );
    });
  });

  describe('scheduleManual', () => {
    const baseInput: ScheduleManualFollowUpInput = {
      clinicId: MOCK_IDS.clinicId,
      leadId: MOCK_IDS.leadId,
      type: 'follow_up_call',
      scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 2 days from now
      reason: 'Manual follow-up for VIP lead',
      leadPhone: '+40712345678',
      leadName: 'Ion Popescu',
    };

    it('should create manual follow-up task', async () => {
      const task = await service.scheduleManual(baseInput);

      expect(task).not.toBeNull();
      expect(mockRepository.create).toHaveBeenCalledTimes(1);
      expect(task?.type).toBe('follow_up_call');
      expect(task?.reason).toBe('Manual follow-up for VIP lead');
    });

    it('should accept custom priority', async () => {
      const task = await service.scheduleManual({
        ...baseInput,
        priority: 'urgent',
      });

      expect(task?.priority).toBe('urgent');
    });

    it('should apply tags', async () => {
      await service.scheduleManual({
        ...baseInput,
        tags: ['vip', 'allonx'],
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['vip', 'allonx'],
        })
      );
    });
  });

  describe('getTask', () => {
    it('should return task when found', async () => {
      const mockTask = createMockTask();
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      const task = await service.getTask(MOCK_IDS.taskId);

      expect(task).toEqual(mockTask);
      expect(mockRepository.findById).toHaveBeenCalledWith(MOCK_IDS.taskId);
    });

    it('should throw FollowUpTaskNotFoundError when not found', async () => {
      vi.mocked(mockRepository.findById).mockResolvedValue(null);

      await expect(service.getTask('77777777-7777-7777-7777-777777777777')).rejects.toThrow(
        FollowUpTaskNotFoundError
      );
    });
  });

  describe('snoozeTask', () => {
    it('should snooze a pending task', async () => {
      const mockTask = createMockTask({ status: 'pending', snoozeCount: 0, maxSnoozes: 2 });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const result = await service.snoozeTask(MOCK_IDS.taskId, {
        snoozedUntil,
        reason: 'Customer requested delay',
      });

      expect(result.status).toBe('snoozed');
      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('should throw SnoozeNotAllowedError when max snoozes reached', async () => {
      const mockTask = createMockTask({ status: 'pending', snoozeCount: 2, maxSnoozes: 2 });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      await expect(
        service.snoozeTask(MOCK_IDS.taskId, { snoozedUntil: new Date() })
      ).rejects.toThrow(SnoozeNotAllowedError);
    });

    it('should throw SnoozeNotAllowedError for completed task', async () => {
      // Completed tasks can't be snoozed - canSnoozeTask returns false
      const mockTask = createMockTask({ status: 'completed' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      await expect(
        service.snoozeTask(MOCK_IDS.taskId, { snoozedUntil: new Date() })
      ).rejects.toThrow(SnoozeNotAllowedError);
    });
  });

  describe('recordAttempt', () => {
    it('should record an attempt on a task', async () => {
      const mockTask = createMockTask({ status: 'in_progress', attemptCount: 0, maxAttempts: 3 });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      const result = await service.recordAttempt(MOCK_IDS.taskId, {
        outcome: 'No answer',
        channel: 'phone',
      });

      expect(result).not.toBeNull();
      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('should throw MaxAttemptsReachedError when max attempts reached', async () => {
      const mockTask = createMockTask({ status: 'pending', attemptCount: 3, maxAttempts: 3 });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      await expect(
        service.recordAttempt(MOCK_IDS.taskId, { outcome: 'No answer' })
      ).rejects.toThrow(MaxAttemptsReachedError);
    });
  });

  describe('completeTask', () => {
    it('should complete a task', async () => {
      const mockTask = createMockTask({ status: 'in_progress' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      const result = await service.completeTask(MOCK_IDS.taskId, {
        outcome: 'Appointment scheduled',
        notes: 'Patient confirmed for next Monday',
      });

      expect(result.status).toBe('completed');
      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('should throw InvalidTaskStateError for already completed task', async () => {
      const mockTask = createMockTask({ status: 'completed' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      await expect(service.completeTask(MOCK_IDS.taskId, { outcome: 'Done' })).rejects.toThrow(
        InvalidTaskStateError
      );
    });

    it('should create follow-up task when requested', async () => {
      const mockTask = createMockTask({ status: 'in_progress' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      await service.completeTask(MOCK_IDS.taskId, {
        outcome: 'Needs another follow-up',
        createFollowUp: true,
        nextFollowUp: {
          type: 'check_in',
          scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          reason: 'Weekly check-in',
        },
      });

      // Should call create twice: once for completing original, once for the new task
      expect(mockRepository.update).toHaveBeenCalledTimes(1);
      expect(mockRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelTask', () => {
    it('should cancel a task', async () => {
      const mockTask = createMockTask({ status: 'pending' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      const result = await service.cancelTask(MOCK_IDS.taskId, 'Lead converted');

      expect(result.status).toBe('cancelled');
    });

    it('should throw InvalidTaskStateError for already cancelled task', async () => {
      const mockTask = createMockTask({ status: 'cancelled' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      await expect(service.cancelTask(MOCK_IDS.taskId)).rejects.toThrow(InvalidTaskStateError);
    });
  });

  describe('assignTask', () => {
    it('should assign task to agent', async () => {
      const mockTask = createMockTask({ status: 'pending' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      const result = await service.assignTask(MOCK_IDS.taskId, MOCK_IDS.agentId);

      expect(result.assignedAgentId).toBe(MOCK_IDS.agentId);
      expect(mockRepository.assignToAgent).toHaveBeenCalledWith(MOCK_IDS.taskId, MOCK_IDS.agentId);
    });
  });

  describe('startTask', () => {
    it('should start a pending task', async () => {
      const mockTask = createMockTask({ status: 'pending' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      const result = await service.startTask(MOCK_IDS.taskId);

      expect(result.status).toBe('in_progress');
      expect(mockRepository.updateStatus).toHaveBeenCalledWith(MOCK_IDS.taskId, 'in_progress');
    });

    it('should start a due task', async () => {
      const mockTask = createMockTask({ status: 'due' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      await service.startTask(MOCK_IDS.taskId);

      expect(mockRepository.updateStatus).toHaveBeenCalledWith(MOCK_IDS.taskId, 'in_progress');
    });

    it('should throw InvalidTaskStateError for completed task', async () => {
      const mockTask = createMockTask({ status: 'completed' });
      vi.mocked(mockRepository.findById).mockResolvedValue(mockTask);

      await expect(service.startTask(MOCK_IDS.taskId)).rejects.toThrow(InvalidTaskStateError);
    });
  });

  describe('processDueTasks', () => {
    it('should process due tasks and mark overdue', async () => {
      const now = new Date();
      const pastDue = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

      const dueTasks = [
        createMockTask({ id: 'task-1', dueAt: pastDue, status: 'pending' }),
        createMockTask({ id: 'task-2', dueAt: pastDue, status: 'pending' }),
      ];
      vi.mocked(mockRepository.getDueTasks).mockResolvedValue(dueTasks);
      vi.mocked(mockRepository.markOverdue).mockResolvedValue(2);

      const result = await service.processDueTasks(MOCK_IDS.clinicId, 'corr-123');

      expect(result.totalDue).toBe(2);
      expect(result.totalOverdue).toBe(2);
      expect(result.markedOverdue).toBe(2);
      expect(mockRepository.markOverdue).toHaveBeenCalledWith(['task-1', 'task-2']);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(mockRepository.getDueTasks).mockRejectedValue(new Error('DB error'));

      const result = await service.processDueTasks(MOCK_IDS.clinicId, 'corr-123');

      expect(result.errors).toBe(1);
    });
  });

  describe('getAgentQueue', () => {
    it('should return pending tasks for agent', async () => {
      const tasks = [
        createMockTask({ assignedAgentId: MOCK_IDS.agentId }),
        createMockTask({ assignedAgentId: MOCK_IDS.agentId }),
      ];
      vi.mocked(mockRepository.getPendingForAgent).mockResolvedValue(tasks);

      const result = await service.getAgentQueue(MOCK_IDS.agentId);

      expect(result).toHaveLength(2);
      expect(mockRepository.getPendingForAgent).toHaveBeenCalledWith(MOCK_IDS.agentId, 20);
    });
  });

  describe('queryTasks', () => {
    it('should query tasks with filters', async () => {
      const mockResult: FollowUpTaskPaginatedResult = {
        data: [createMockTask()],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      };
      vi.mocked(mockRepository.findMany).mockResolvedValue(mockResult);

      const filters: FollowUpTaskFilters = {
        clinicId: MOCK_IDS.clinicId,
        status: 'pending',
      };
      const pagination: FollowUpTaskPagination = {
        limit: 20,
        offset: 0,
        orderBy: 'dueAt',
        orderDirection: 'asc',
      };

      const result = await service.queryTasks(filters, pagination);

      expect(result.data).toHaveLength(1);
      expect(mockRepository.findMany).toHaveBeenCalledWith(filters, pagination);
    });
  });
});

describe('Error Classes', () => {
  describe('FollowUpTaskNotFoundError', () => {
    it('should have correct properties', () => {
      const error = new FollowUpTaskNotFoundError(MOCK_IDS.taskId);

      expect(error.name).toBe('FollowUpTaskNotFoundError');
      expect(error.code).toBe('FOLLOWUP_TASK_NOT_FOUND');
      expect(error.taskId).toBe(MOCK_IDS.taskId);
      expect(error.message).toContain(MOCK_IDS.taskId);
    });
  });

  describe('SnoozeNotAllowedError', () => {
    it('should have correct properties', () => {
      const error = new SnoozeNotAllowedError(MOCK_IDS.taskId, 2, 2);

      expect(error.name).toBe('SnoozeNotAllowedError');
      expect(error.code).toBe('SNOOZE_NOT_ALLOWED');
      expect(error.taskId).toBe(MOCK_IDS.taskId);
      expect(error.snoozeCount).toBe(2);
      expect(error.maxSnoozes).toBe(2);
    });
  });

  describe('MaxAttemptsReachedError', () => {
    it('should have correct properties', () => {
      const error = new MaxAttemptsReachedError(MOCK_IDS.taskId, 3, 3);

      expect(error.name).toBe('MaxAttemptsReachedError');
      expect(error.code).toBe('MAX_ATTEMPTS_REACHED');
      expect(error.taskId).toBe(MOCK_IDS.taskId);
      expect(error.attemptCount).toBe(3);
      expect(error.maxAttempts).toBe(3);
    });
  });

  describe('InvalidTaskStateError', () => {
    it('should have correct properties', () => {
      const error = new InvalidTaskStateError(MOCK_IDS.taskId, 'completed', 'snooze');

      expect(error.name).toBe('InvalidTaskStateError');
      expect(error.code).toBe('INVALID_TASK_STATE');
      expect(error.taskId).toBe(MOCK_IDS.taskId);
      expect(error.currentStatus).toBe('completed');
      expect(error.operation).toBe('snooze');
    });
  });
});
