/**
 * Function Executor Tests
 *
 * Tests for the AI Gateway function execution with dependency injection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FunctionExecutor, createFunctionExecutor, type FunctionExecutorDeps } from '../function-executor.js';
import { createInMemoryEventStore } from '../../event-store.js';
import { createCommandBus } from '../../cqrs/command-bus.js';
import { createQueryBus } from '../../cqrs/query-bus.js';
import { createProjectionManager } from '../../cqrs/projections.js';
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
          messages: [
            { role: 'user', content: 'Bună, sunt interesat de implant dentar' },
          ],
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
          suggestedAction: 'Contact immediately',
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
          messages: [
            { role: 'user', content: 'Vreau all-on-4, cat costa?' },
          ],
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
          suggestedAction: 'Follow up',
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

      const executorWithScheduling = createFunctionExecutor({
        ...deps,
        schedulingService: mockSchedulingService,
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
