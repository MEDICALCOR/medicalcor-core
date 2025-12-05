/**
 * Saga Repository Tests
 *
 * Tests for saga state persistence and recovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemorySagaRepository,
  createSagaRepository,
  createInMemorySagaRepository,
  type SagaState,
  type CreateSagaOptions,
} from '../saga-repository.js';

describe('InMemorySagaRepository', () => {
  let repository: InMemorySagaRepository;

  beforeEach(() => {
    repository = new InMemorySagaRepository();
  });

  describe('create', () => {
    it('should create a new saga', async () => {
      const options: CreateSagaOptions<{ step: number }> = {
        sagaType: 'LeadOnboarding',
        correlationId: 'lead-123',
        initialState: { step: 0 },
        totalSteps: 5,
        maxRetries: 3,
        metadata: { source: 'test' },
      };

      const saga = await repository.create(options);

      expect(saga.sagaId).toBeDefined();
      expect(saga.sagaType).toBe('LeadOnboarding');
      expect(saga.correlationId).toBe('lead-123');
      expect(saga.state).toEqual({ step: 0 });
      expect(saga.status).toBe('pending');
      expect(saga.currentStep).toBe(0);
      expect(saga.totalSteps).toBe(5);
      expect(saga.maxRetries).toBe(3);
      expect(saga.retryCount).toBe(0);
      expect(saga.errorMessage).toBeNull();
      expect(saga.completedAt).toBeNull();
      expect(saga.stepHistory).toEqual([]);
    });

    it('should create saga with timeout', async () => {
      const options: CreateSagaOptions<{ data: string }> = {
        sagaType: 'AppointmentBooking',
        correlationId: 'apt-456',
        initialState: { data: 'test' },
        timeoutMs: 5000,
      };

      const saga = await repository.create(options);

      expect(saga.timeoutAt).not.toBeNull();
      expect(saga.timeoutAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should use default values when not provided', async () => {
      const options: CreateSagaOptions<Record<string, never>> = {
        sagaType: 'SimpleSaga',
        correlationId: 'simple-1',
        initialState: {},
      };

      const saga = await repository.create(options);

      expect(saga.totalSteps).toBe(0);
      expect(saga.maxRetries).toBe(3);
      expect(saga.metadata).toEqual({});
      expect(saga.timeoutAt).toBeNull();
    });
  });

  describe('save', () => {
    it('should save saga state', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: { count: 0 },
      });

      saga.state = { count: 5 };
      saga.currentStep = 2;
      saga.status = 'running';

      await repository.save(saga);

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.state).toEqual({ count: 5 });
      expect(retrieved?.currentStep).toBe(2);
      expect(retrieved?.status).toBe('running');
    });

    it('should update updatedAt timestamp', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      const originalUpdatedAt = saga.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await repository.save(saga);

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  describe('findById', () => {
    it('should find saga by id', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: { value: 'test' },
      });

      const found = await repository.findById(saga.sagaId);

      expect(found).not.toBeNull();
      expect(found?.sagaId).toBe(saga.sagaId);
      expect(found?.state).toEqual({ value: 'test' });
    });

    it('should return null for non-existent saga', async () => {
      const found = await repository.findById('nonexistent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByCorrelationId', () => {
    it('should find saga by correlation id and type', async () => {
      const saga = await repository.create({
        sagaType: 'LeadOnboarding',
        correlationId: 'lead-123',
        initialState: { step: 1 },
      });

      const found = await repository.findByCorrelationId('lead-123', 'LeadOnboarding');

      expect(found).not.toBeNull();
      expect(found?.sagaId).toBe(saga.sagaId);
      expect(found?.correlationId).toBe('lead-123');
    });

    it('should return null if type does not match', async () => {
      await repository.create({
        sagaType: 'LeadOnboarding',
        correlationId: 'lead-123',
        initialState: {},
      });

      const found = await repository.findByCorrelationId('lead-123', 'DifferentType');
      expect(found).toBeNull();
    });

    it('should return null if correlation id not found', async () => {
      const found = await repository.findByCorrelationId('nonexistent', 'TestSaga');
      expect(found).toBeNull();
    });
  });

  describe('findPending', () => {
    beforeEach(async () => {
      // Create sagas with different statuses
      const pending = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'pending-1',
        initialState: {},
      });

      const running = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'running-1',
        initialState: {},
      });
      running.status = 'running';
      await repository.save(running);

      const compensating = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'compensating-1',
        initialState: {},
      });
      compensating.status = 'compensating';
      await repository.save(compensating);

      const completed = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'completed-1',
        initialState: {},
      });
      completed.status = 'completed';
      await repository.save(completed);

      const failed = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'failed-1',
        initialState: {},
      });
      failed.status = 'failed';
      await repository.save(failed);
    });

    it('should find all pending sagas', async () => {
      const pending = await repository.findPending();

      expect(pending.length).toBe(3); // pending, running, compensating
      expect(pending.every((s) => ['pending', 'running', 'compensating'].includes(s.status))).toBe(
        true
      );
    });

    it('should filter by saga type', async () => {
      await repository.create({
        sagaType: 'DifferentType',
        correlationId: 'different-1',
        initialState: {},
      });

      const pending = await repository.findPending('TestSaga');

      expect(pending.every((s) => s.sagaType === 'TestSaga')).toBe(true);
    });

    it('should return sagas sorted by start time', async () => {
      const pending = await repository.findPending();

      for (let i = 0; i < pending.length - 1; i++) {
        expect(pending[i]!.startedAt.getTime()).toBeLessThanOrEqual(
          pending[i + 1]!.startedAt.getTime()
        );
      }
    });
  });

  describe('findForRecovery', () => {
    it('should find all incomplete sagas', async () => {
      await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'recovery-1',
        initialState: {},
      });

      const sagas = await repository.findForRecovery();

      expect(sagas.length).toBeGreaterThan(0);
      expect(sagas.every((s) => ['pending', 'running', 'compensating'].includes(s.status))).toBe(
        true
      );
    });
  });

  describe('markCompleted', () => {
    it('should mark saga as completed', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      await repository.markCompleted(saga.sagaId);

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.status).toBe('completed');
      expect(retrieved?.completedAt).not.toBeNull();
    });

    it('should update timestamps', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      await repository.markCompleted(saga.sagaId);

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.completedAt).toBeInstanceOf(Date);
      expect(retrieved?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('markFailed', () => {
    it('should mark saga as failed with error message', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      await repository.markFailed(saga.sagaId, 'Something went wrong');

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.status).toBe('failed');
      expect(retrieved?.errorMessage).toBe('Something went wrong');
    });
  });

  describe('markCompensating', () => {
    it('should mark saga as compensating', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      await repository.markCompensating(saga.sagaId);

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.status).toBe('compensating');
    });
  });

  describe('markCompensated', () => {
    it('should mark saga as compensated', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      await repository.markCompensated(saga.sagaId);

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.status).toBe('compensated');
      expect(retrieved?.completedAt).not.toBeNull();
    });
  });

  describe('appendStepHistory', () => {
    it('should append step to history', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      await repository.appendStepHistory(saga.sagaId, 'CreateLead', { phone: '+40721111111' });
      await repository.appendStepHistory(saga.sagaId, 'ScoreLead', { score: 85 });

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.stepHistory).toHaveLength(2);
      expect(retrieved?.stepHistory[0]?.step).toBe('CreateLead');
      expect(retrieved?.stepHistory[0]?.data).toEqual({ phone: '+40721111111' });
      expect(retrieved?.stepHistory[1]?.step).toBe('ScoreLead');
    });

    it('should record timestamp for each step', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      await repository.appendStepHistory(saga.sagaId, 'Step1');

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.stepHistory[0]?.timestamp).toBeDefined();
    });

    it('should handle empty data parameter', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      await repository.appendStepHistory(saga.sagaId, 'Step1');

      const retrieved = await repository.findById(saga.sagaId);
      expect(retrieved?.stepHistory[0]?.data).toEqual({});
    });
  });

  describe('findTimedOut', () => {
    it('should find timed out sagas', async () => {
      // Create saga with timeout in the past
      const timedOut = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'timeout-1',
        initialState: {},
        timeoutMs: -1000, // Negative means already timed out
      });

      // Create saga with future timeout
      await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'no-timeout-1',
        initialState: {},
        timeoutMs: 60000,
      });

      // Create saga without timeout
      await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'no-timeout-2',
        initialState: {},
      });

      const result = await repository.findTimedOut();

      expect(result.length).toBe(1);
      expect(result[0]?.sagaId).toBe(timedOut.sagaId);
    });

    it('should only find pending/running sagas', async () => {
      const timedOut = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'timeout-1',
        initialState: {},
        timeoutMs: -1000,
      });
      timedOut.status = 'completed';
      await repository.save(timedOut);

      const result = await repository.findTimedOut();

      expect(result.length).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete saga', async () => {
      const saga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      const deleted = await repository.delete(saga.sagaId);

      expect(deleted).toBe(true);
      expect(await repository.findById(saga.sagaId)).toBeNull();
    });

    it('should return false for non-existent saga', async () => {
      const deleted = await repository.delete('nonexistent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should clean up old completed sagas', async () => {
      // Create old completed saga
      const oldSaga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'old-1',
        initialState: {},
      });
      oldSaga.status = 'completed';
      oldSaga.completedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      await repository.save(oldSaga);

      // Create recent completed saga
      const recentSaga = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'recent-1',
        initialState: {},
      });
      recentSaga.status = 'completed';
      recentSaga.completedAt = new Date();
      await repository.save(recentSaga);

      const deleted = await repository.cleanup(30); // Clean up older than 30 days

      expect(deleted).toBe(1);
      expect(await repository.findById(oldSaga.sagaId)).toBeNull();
      expect(await repository.findById(recentSaga.sagaId)).not.toBeNull();
    });

    it('should clean up old failed sagas', async () => {
      const oldFailed = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'old-failed',
        initialState: {},
      });
      oldFailed.status = 'failed';
      oldFailed.completedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      await repository.save(oldFailed);

      const deleted = await repository.cleanup(30);

      expect(deleted).toBe(1);
    });

    it('should clean up old compensated sagas', async () => {
      const oldCompensated = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'old-compensated',
        initialState: {},
      });
      oldCompensated.status = 'compensated';
      oldCompensated.completedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      await repository.save(oldCompensated);

      const deleted = await repository.cleanup(30);

      expect(deleted).toBe(1);
    });

    it('should not clean up pending sagas', async () => {
      const oldPending = await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'old-pending',
        initialState: {},
      });
      // Manually set old started date
      oldPending.startedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      await repository.save(oldPending);

      const deleted = await repository.cleanup(30);

      expect(deleted).toBe(0);
      expect(await repository.findById(oldPending.sagaId)).not.toBeNull();
    });
  });

  describe('test helpers', () => {
    it('should clear all sagas', () => {
      repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      repository.clear();

      expect(repository.size()).toBe(0);
    });

    it('should return size', async () => {
      expect(repository.size()).toBe(0);

      await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-1',
        initialState: {},
      });

      expect(repository.size()).toBe(1);

      await repository.create({
        sagaType: 'TestSaga',
        correlationId: 'test-2',
        initialState: {},
      });

      expect(repository.size()).toBe(2);
    });
  });
});

describe('Factory Functions', () => {
  it('should create in-memory repository by default', () => {
    const repo = createSagaRepository();
    expect(repo).toBeInstanceOf(InMemorySagaRepository);
  });

  it('should create InMemorySagaRepository', () => {
    const repo = createInMemorySagaRepository();
    expect(repo).toBeInstanceOf(InMemorySagaRepository);
  });

  it('should create saga repository', async () => {
    const repo = createSagaRepository();

    const saga = await repo.create({
      sagaType: 'TestSaga',
      correlationId: 'test-1',
      initialState: { value: 'test' },
    });

    expect(saga.sagaId).toBeDefined();
  });
});

describe('Saga Lifecycle', () => {
  let repository: InMemorySagaRepository;

  beforeEach(() => {
    repository = new InMemorySagaRepository();
  });

  it('should handle complete saga lifecycle', async () => {
    // Create saga
    const saga = await repository.create({
      sagaType: 'LeadOnboarding',
      correlationId: 'lead-123',
      initialState: { currentStep: 0 },
      totalSteps: 3,
    });

    expect(saga.status).toBe('pending');

    // Start processing
    saga.status = 'running';
    saga.currentStep = 1;
    await repository.save(saga);
    await repository.appendStepHistory(saga.sagaId, 'CreateLead', { phone: '+40721111111' });

    // Continue processing
    saga.currentStep = 2;
    await repository.save(saga);
    await repository.appendStepHistory(saga.sagaId, 'ScoreLead', { score: 85 });

    // Complete saga
    await repository.markCompleted(saga.sagaId);

    // Verify final state
    const final = await repository.findById(saga.sagaId);
    expect(final?.status).toBe('completed');
    expect(final?.completedAt).not.toBeNull();
    expect(final?.stepHistory).toHaveLength(2);
  });

  it('should handle saga compensation flow', async () => {
    // Create and start saga
    const saga = await repository.create({
      sagaType: 'AppointmentBooking',
      correlationId: 'apt-456',
      initialState: { booked: false },
    });

    saga.status = 'running';
    await repository.save(saga);
    await repository.appendStepHistory(saga.sagaId, 'ReserveSlot');

    // Trigger compensation
    await repository.markCompensating(saga.sagaId);
    await repository.appendStepHistory(saga.sagaId, 'ReleaseSlot');

    // Complete compensation
    await repository.markCompensated(saga.sagaId);

    const final = await repository.findById(saga.sagaId);
    expect(final?.status).toBe('compensated');
    expect(final?.stepHistory).toHaveLength(2);
  });

  it('should handle saga failure', async () => {
    const saga = await repository.create({
      sagaType: 'PaymentProcessing',
      correlationId: 'payment-789',
      initialState: { amount: 100 },
      maxRetries: 3,
    });

    saga.status = 'running';
    saga.retryCount = 3;
    await repository.save(saga);

    await repository.markFailed(saga.sagaId, 'Payment gateway timeout after 3 retries');

    const final = await repository.findById(saga.sagaId);
    expect(final?.status).toBe('failed');
    expect(final?.errorMessage).toContain('timeout');
    expect(final?.retryCount).toBe(3);
  });
});
