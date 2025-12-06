/**
 * Function Executor Tests
 *
 * Tests for the AI Gateway function execution with dependency injection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FunctionExecutor,
  createFunctionExecutor,
  type FunctionExecutorDeps,
} from '../function-executor.js';
import { createInMemoryEventStore } from '../../event-store.js';
import { createCommandBus } from '../../cqrs/command-bus.js';
import { createQueryBus } from '../../cqrs/query-bus.js';
import { createProjectionManager, ProjectionManager } from '../../cqrs/projections.js';
import type { FunctionContext } from '../function-registry.js';

describe('FunctionExecutor', () => {
  let deps: FunctionExecutorDeps;
  let executor: FunctionExecutor;
  let context: FunctionContext;

  beforeEach(() => {
    const eventStore = createInMemoryEventStore('test');
    const commandBus = createCommandBus(eventStore);
    const queryBus = createQueryBus();
    const projectionManager = createProjectionManager();

    // Register mock command handlers for fallback testing
    commandBus.register('ScoreLead', async (command) => ({
      success: true,
      commandId: command.metadata.commandId,
      result: {
        score: 3,
        classification: 'WARM',
        confidence: 0.8,
        reasoning: 'Mock scoring result',
        suggestedAction: 'send_follow_up',
      },
      executionTimeMs: 1,
    }));

    commandBus.register('ScheduleAppointment', async (command) => ({
      success: true,
      commandId: command.metadata.commandId,
      result: {
        appointmentId: 'apt-mock-123',
        status: 'confirmed',
        dateTime: '2024-12-15T10:00:00Z',
      },
      executionTimeMs: 1,
    }));

    commandBus.register('SendWhatsAppMessage', async (command) => ({
      success: true,
      commandId: command.metadata.commandId,
      result: {
        messageId: 'msg-mock-123',
        status: 'sent',
        timestamp: new Date().toISOString(),
      },
      executionTimeMs: 1,
    }));

    commandBus.register('RecordConsent', async (command) => ({
      success: true,
      commandId: command.metadata.commandId,
      result: {
        consentId: 'cons-mock-123',
        recordedAt: new Date().toISOString(),
      },
      executionTimeMs: 1,
    }));

    deps = {
      eventStore,
      commandBus,
      queryBus,
      projectionManager,
    };

    executor = createFunctionExecutor(deps);

    context = {
      correlationId: 'test-correlation-id',
      traceId: 'test-trace-id',
      userId: 'test-user',
    };
  });

  describe('score_lead', () => {
    it('should score a lead using command bus when no scoring service', async () => {
      const result = await executor.execute(
        'score_lead',
        {
          phone: '+40721234567',
          channel: 'whatsapp',
          messages: [{ role: 'user', content: 'Bună, sunt interesat de implant dentar' }],
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.function).toBe('score_lead');
      expect(result.traceId).toBe('test-trace-id');
    });

    it('should use scoring service when provided', async () => {
      const mockScoringService = {
        scoreMessage: vi.fn().mockResolvedValue({
          score: 5,
          classification: 'HOT',
          confidence: 0.95,
          reasoning: 'High purchase intent detected',
          suggestedAction: 'schedule_appointment',
        }),
      };

      const executorWithScoring = createFunctionExecutor({
        ...deps,
        scoringService: mockScoringService,
      });

      const result = await executorWithScoring.execute(
        'score_lead',
        {
          phone: '+40721234567',
          channel: 'whatsapp',
          messages: [{ role: 'user', content: 'Vreau all-on-4, cat costa?' }],
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockScoringService.scoreMessage).toHaveBeenCalled();
      expect((result.result as any).score).toBe(5);
      expect((result.result as any).classification).toBe('HOT');
    });

    it('should emit event after scoring', async () => {
      const mockScoringService = {
        scoreMessage: vi.fn().mockResolvedValue({
          score: 4,
          classification: 'HOT',
          confidence: 0.9,
          reasoning: 'Implant interest',
          suggestedAction: 'send_follow_up',
        }),
      };

      const executorWithScoring = createFunctionExecutor({
        ...deps,
        scoringService: mockScoringService,
      });

      await executorWithScoring.execute(
        'score_lead',
        {
          phone: '+40721234567',
          channel: 'whatsapp',
        },
        context
      );

      // Check event was emitted
      const events = await deps.eventStore.getByType('LeadScored');
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.payload).toMatchObject({
        phone: '+40721234567',
        score: 4,
        classification: 'HOT',
      });
    });
  });

  describe('schedule_appointment', () => {
    it('should schedule appointment using command bus', async () => {
      const result = await executor.execute(
        'schedule_appointment',
        {
          patientId: 'patient-123',
          serviceType: 'consultation',
          preferredDate: '2024-12-15',
          preferredTimeSlot: 'morning',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.function).toBe('schedule_appointment');
    });

    it('should use scheduling service when provided', async () => {
      const mockSchedulingService = {
        getAvailableSlots: vi.fn(),
        scheduleAppointment: vi.fn().mockResolvedValue({
          appointmentId: 'apt-123',
          status: 'confirmed',
          dateTime: '2024-12-15T10:00:00Z',
          doctor: { id: 'doc-1', name: 'Dr. Test' },
          location: 'Cabinet 1',
        }),
        cancelAppointment: vi.fn(),
      };

      // Mock consent service to allow scheduling (GDPR requirement)
      const mockConsentService = {
        checkConsent: vi.fn().mockResolvedValue({
          consents: [
            {
              type: 'data_processing',
              status: 'granted',
              recordedAt: new Date().toISOString(),
              source: 'test',
            },
          ],
        }),
        recordConsent: vi.fn(),
      };

      const executorWithScheduling = createFunctionExecutor({
        ...deps,
        schedulingService: mockSchedulingService,
        consentService: mockConsentService,
      });

      const result = await executorWithScheduling.execute(
        'schedule_appointment',
        {
          patientId: 'patient-123',
          serviceType: 'consultation',
          preferredDate: '2024-12-15',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockSchedulingService.scheduleAppointment).toHaveBeenCalled();
      expect((result.result as any).appointmentId).toBe('apt-123');
    });
  });

  describe('send_whatsapp', () => {
    it('should send WhatsApp message using command bus', async () => {
      const result = await executor.execute(
        'send_whatsapp',
        {
          to: '+40721234567',
          message: 'Test message',
        },
        context
      );

      expect(result.success).toBe(true);
    });

    it('should use WhatsApp service when provided', async () => {
      const mockWhatsAppService = {
        sendMessage: vi.fn().mockResolvedValue({
          messageId: 'msg-123',
          status: 'sent',
          timestamp: new Date().toISOString(),
        }),
      };

      const executorWithWhatsApp = createFunctionExecutor({
        ...deps,
        whatsappService: mockWhatsAppService,
      });

      const result = await executorWithWhatsApp.execute(
        'send_whatsapp',
        {
          to: '+40721234567',
          templateName: 'appointment_reminder',
          templateParams: { patient_name: 'Test' },
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith({
        to: '+40721234567',
        message: undefined,
        templateName: 'appointment_reminder',
        templateParams: { patient_name: 'Test' },
      });
    });
  });

  describe('record_consent', () => {
    it('should record consent with GDPR event', async () => {
      const result = await executor.execute(
        'record_consent',
        {
          patientId: 'patient-123',
          phone: '+40721234567',
          consentType: 'marketing_whatsapp',
          status: 'granted',
          source: 'whatsapp',
        },
        context
      );

      expect(result.success).toBe(true);
    });

    it('should use consent service when provided', async () => {
      const mockConsentService = {
        recordConsent: vi.fn().mockResolvedValue({
          consentId: 'cons-123',
          recordedAt: new Date().toISOString(),
        }),
        checkConsent: vi.fn(),
      };

      const executorWithConsent = createFunctionExecutor({
        ...deps,
        consentService: mockConsentService,
      });

      const result = await executorWithConsent.execute(
        'record_consent',
        {
          patientId: 'patient-123',
          phone: '+40721234567',
          consentType: 'data_processing',
          status: 'granted',
          source: 'web_form',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockConsentService.recordConsent).toHaveBeenCalled();
      expect((result.result as any).gdprCompliant).toBe(true);
    });

    it('should handle command bus failure for record consent', async () => {
      // Create fresh deps to register custom failing handler
      const eventStore = createInMemoryEventStore('test');
      const commandBus = createCommandBus(eventStore);
      const queryBus = createQueryBus();
      const projectionManager = createProjectionManager();

      // Register failing command handler
      commandBus.register('RecordConsent', async () => ({
        success: false,
        commandId: 'cmd-consent-fail',
        error: { message: 'GDPR service unavailable' },
        executionTimeMs: 1,
      }));

      const executorFailConsent = createFunctionExecutor({
        eventStore,
        commandBus,
        queryBus,
        projectionManager,
      });

      const result = await executorFailConsent.execute(
        'record_consent',
        {
          patientId: 'patient-fail',
          phone: '+40721234567',
          consentType: 'marketing_whatsapp',
          status: 'granted',
          source: 'test',
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('GDPR service unavailable');
    });
  });

  describe('check_consent', () => {
    it('should check consent using query bus when no consent service', async () => {
      // Create fresh deps without consent service
      const eventStore = createInMemoryEventStore('test');
      const commandBus = createCommandBus(eventStore);
      const queryBus = createQueryBus();
      const projectionManager = createProjectionManager();

      // Register CheckConsent query handler
      queryBus.register('CheckConsent', async (query) => ({
        success: true,
        queryId: query.metadata.queryId,
        data: {
          consents: [
            { type: 'data_processing', status: 'granted', recordedAt: '2024-12-01T00:00:00Z' },
            { type: 'marketing_whatsapp', status: 'denied', recordedAt: '2024-12-01T00:00:00Z' },
          ],
          patientId: query.params.patientId,
        },
        cached: false,
        executionTimeMs: 2,
      }));

      const executorNoConsent = createFunctionExecutor({
        eventStore,
        commandBus,
        queryBus,
        projectionManager,
      });

      const result = await executorNoConsent.execute(
        'check_consent',
        {
          patientId: 'patient-check-123',
          consentTypes: ['data_processing', 'marketing_whatsapp'],
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.function).toBe('check_consent');
      expect((result.result as any).consents).toHaveLength(2);
    });

    it('should use consent service when provided', async () => {
      const mockConsentService = {
        recordConsent: vi.fn(),
        checkConsent: vi.fn().mockResolvedValue({
          consents: [
            { type: 'data_processing', status: 'granted', recordedAt: '2024-12-01T00:00:00Z' },
          ],
        }),
      };

      const executorWithConsent = createFunctionExecutor({
        ...deps,
        consentService: mockConsentService,
      });

      const result = await executorWithConsent.execute(
        'check_consent',
        {
          patientId: 'patient-service-123',
          phone: '+40721234567',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockConsentService.checkConsent).toHaveBeenCalled();
      expect((result.result as any).consents).toHaveLength(1);
    });

    it('should return empty consents when query bus returns no data', async () => {
      // Create fresh deps without consent service
      const eventStore = createInMemoryEventStore('test');
      const commandBus = createCommandBus(eventStore);
      const queryBus = createQueryBus();
      const projectionManager = createProjectionManager();

      // Register handler that returns no data
      queryBus.register('CheckConsent', async (query) => ({
        success: true,
        queryId: query.metadata.queryId,
        data: null,
        cached: false,
        executionTimeMs: 1,
      }));

      const executorNoConsent = createFunctionExecutor({
        eventStore,
        commandBus,
        queryBus,
        projectionManager,
      });

      const result = await executorNoConsent.execute(
        'check_consent',
        {
          patientId: 'patient-empty',
        },
        context
      );

      expect(result.success).toBe(true);
      expect((result.result as any).consents).toEqual([]);
      expect((result.result as any).message).toBe('Consent service not available');
    });
  });

  describe('get_lead_analytics', () => {
    it('should return analytics from projections', async () => {
      const result = await executor.execute(
        'get_lead_analytics',
        {
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          groupBy: 'month',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
    });

    it('should fallback to query bus when projections are not available', async () => {
      // Create fresh projection manager WITHOUT default projections
      // Using raw ProjectionManager instead of createProjectionManager()
      const eventStore = createInMemoryEventStore('test');
      const commandBus = createCommandBus(eventStore);
      const queryBus = createQueryBus();
      const projectionManager = new ProjectionManager(); // Empty - no default projections

      // Register query handler for fallback - note: handler receives query.params
      queryBus.register('GetLeadAnalytics', async (query) => ({
        success: true,
        queryId: query.metadata.queryId,
        data: {
          summary: { totalLeads: 100, averageScore: 3.5 },
          byChannel: { whatsapp: 60, web: 40 },
          byClassification: { HOT: 20, WARM: 50, COLD: 30 },
          dateRange: { start: query.params.startDate, end: query.params.endDate },
        },
        cached: false,
        executionTimeMs: 5,
      }));

      const executorWithoutProjections = createFunctionExecutor({
        eventStore,
        commandBus,
        queryBus,
        projectionManager,
      });

      const result = await executorWithoutProjections.execute(
        'get_lead_analytics',
        {
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          groupBy: 'month',
        },
        context
      );

      expect(result.success).toBe(true);
      expect((result.result as any).summary.totalLeads).toBe(100);
    });
  });

  describe('trigger_workflow', () => {
    it('should trigger workflow using command bus when no workflow service', async () => {
      // Register TriggerWorkflow command handler
      deps.commandBus.register('TriggerWorkflow', async (command) => ({
        success: true,
        commandId: command.metadata.commandId,
        result: {
          taskId: 'task-mock-123',
          status: 'pending',
          workflow: command.payload.workflow,
        },
        executionTimeMs: 1,
      }));

      const result = await executor.execute(
        'trigger_workflow',
        {
          workflow: 'lead-scoring',
          payload: { leadId: 'lead-123' },
          priority: 'high',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.function).toBe('trigger_workflow');
      expect((result.result as any).taskId).toBe('task-mock-123');
    });

    it('should use workflow service when provided', async () => {
      const mockWorkflowService = {
        triggerWorkflow: vi.fn().mockResolvedValue({
          taskId: 'task-workflow-456',
          status: 'started',
          metadata: { priority: 'high' },
        }),
        getWorkflowStatus: vi.fn(),
      };

      const executorWithWorkflow = createFunctionExecutor({
        ...deps,
        workflowService: mockWorkflowService,
      });

      const result = await executorWithWorkflow.execute(
        'trigger_workflow',
        {
          workflow: 'patient-journey',
          payload: { patientId: 'patient-123', action: 'onboard' },
          priority: 'normal',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockWorkflowService.triggerWorkflow).toHaveBeenCalledWith({
        workflow: 'patient-journey',
        payload: { patientId: 'patient-123', action: 'onboard' },
        priority: 'normal',
      });
      expect((result.result as any).taskId).toBe('task-workflow-456');
    });

    it('should handle command bus failure', async () => {
      // Register failing command handler
      deps.commandBus.register('TriggerWorkflow', async () => ({
        success: false,
        commandId: 'cmd-123',
        error: { message: 'Workflow service unavailable' },
        executionTimeMs: 1,
      }));

      const result = await executor.execute(
        'trigger_workflow',
        {
          workflow: 'lead-scoring',
          payload: {},
        },
        context
      );

      expect(result.success).toBe(false);
      // Error message is taken from result.error.message, fallback is 'Failed to trigger workflow'
      expect(result.error?.message).toContain('Workflow service unavailable');
    });

    it('should emit WorkflowTriggered event when using workflow service', async () => {
      const mockWorkflowService = {
        triggerWorkflow: vi.fn().mockResolvedValue({
          taskId: 'task-emit-789',
          status: 'started',
        }),
        getWorkflowStatus: vi.fn(),
      };

      const executorWithWorkflow = createFunctionExecutor({
        ...deps,
        workflowService: mockWorkflowService,
      });

      await executorWithWorkflow.execute(
        'trigger_workflow',
        {
          workflow: 'booking-agent',
          payload: { appointmentRequest: true },
        },
        context
      );

      // Check that WorkflowTriggered event was emitted
      const events = await deps.eventStore.getByType('WorkflowTriggered');
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.payload).toMatchObject({
        workflow: 'booking-agent',
        taskId: 'task-emit-789',
        source: 'ai-gateway',
      });
    });
  });

  describe('get_workflow_status', () => {
    it('should get workflow status using query bus when no workflow service', async () => {
      // Create fresh deps without workflow service to trigger query bus path
      const eventStore = createInMemoryEventStore('test');
      const commandBus = createCommandBus(eventStore);
      const queryBus = createQueryBus();
      const projectionManager = createProjectionManager();

      // Register GetWorkflowStatus query handler - note: handler receives query.params
      queryBus.register('GetWorkflowStatus', async (query) => ({
        success: true,
        queryId: query.metadata.queryId,
        data: {
          taskId: query.params.taskId,
          status: 'completed',
          completedAt: '2024-12-15T10:00:00Z',
          result: { score: 4 },
        },
        cached: false,
        executionTimeMs: 2,
      }));

      const executorNoWorkflow = createFunctionExecutor({
        eventStore,
        commandBus,
        queryBus,
        projectionManager,
      });

      const result = await executorNoWorkflow.execute(
        'get_workflow_status',
        {
          taskId: 'task-query-123',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.function).toBe('get_workflow_status');
      expect((result.result as any).taskId).toBe('task-query-123');
      expect((result.result as any).status).toBe('completed');
    });

    it('should use workflow service when provided', async () => {
      const mockWorkflowService = {
        triggerWorkflow: vi.fn(),
        getWorkflowStatus: vi.fn().mockResolvedValue({
          taskId: 'task-service-456',
          status: 'running',
          progress: 50,
          startedAt: '2024-12-15T09:00:00Z',
        }),
      };

      const executorWithWorkflow = createFunctionExecutor({
        ...deps,
        workflowService: mockWorkflowService,
      });

      const result = await executorWithWorkflow.execute(
        'get_workflow_status',
        {
          taskId: 'task-service-456',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(mockWorkflowService.getWorkflowStatus).toHaveBeenCalledWith('task-service-456');
      expect((result.result as any).status).toBe('running');
      expect((result.result as any).progress).toBe(50);
    });

    it('should return unknown status when query bus returns no data', async () => {
      // Create fresh deps without workflow service
      const eventStore = createInMemoryEventStore('test');
      const commandBus = createCommandBus(eventStore);
      const queryBus = createQueryBus();
      const projectionManager = createProjectionManager();

      // Register handler that returns no data
      queryBus.register('GetWorkflowStatus', async (query) => ({
        success: true,
        queryId: query.metadata.queryId,
        data: null,
        cached: false,
        executionTimeMs: 1,
      }));

      const executorNoWorkflow = createFunctionExecutor({
        eventStore,
        commandBus,
        queryBus,
        projectionManager,
      });

      const result = await executorNoWorkflow.execute(
        'get_workflow_status',
        {
          taskId: 'task-unknown-789',
        },
        context
      );

      expect(result.success).toBe(true);
      expect((result.result as any).taskId).toBe('task-unknown-789');
      expect((result.result as any).status).toBe('unknown');
    });
  });

  describe('validation', () => {
    it('should reject invalid phone format', async () => {
      const result = await executor.execute(
        'score_lead',
        {
          phone: 'invalid-phone',
          channel: 'whatsapp',
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_ARGUMENTS');
    });

    it('should reject unknown function', async () => {
      const result = await executor.execute('unknown_function', {}, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FUNCTION_NOT_IMPLEMENTED');
    });
  });

  describe('error handling', () => {
    it('should handle service errors gracefully', async () => {
      const mockScoringService = {
        scoreMessage: vi.fn().mockRejectedValue(new Error('Service unavailable')),
      };

      const executorWithFailingService = createFunctionExecutor({
        ...deps,
        scoringService: mockScoringService,
      });

      const result = await executorWithFailingService.execute(
        'score_lead',
        {
          phone: '+40721234567',
          channel: 'whatsapp',
        },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('Service unavailable');
    });
  });
});
