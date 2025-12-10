/**
 * @fileoverview Queue SLA Service Tests
 *
 * Tests for H8: Queue SLA Tracking for Call Center.
 * Covers SLA evaluation, breach detection, reporting, and metrics calculation.
 *
 * @module domain/voice/__tests__/queue-sla-service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  QueueSLAService,
  createQueueSLAService,
  getQueueSLAService,
  resetQueueSLAService,
  type QueueMetricsInput,
  type QueueSLAServiceConfig,
  type SLABreachType,
  type HistoricalMetrics,
} from '../queue-sla-service.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createDefaultMetrics = (overrides: Partial<QueueMetricsInput> = {}): QueueMetricsInput => ({
  queueSid: 'WQ001',
  queueName: 'General Inquiries',
  currentQueueSize: 3,
  longestWaitTime: 45,
  averageWaitTime: 30,
  availableAgents: 2,
  busyAgents: 2,
  totalAgents: 4,
  callsHandledToday: 50,
  callsAbandonedToday: 2,
  serviceLevel: 85,
  ...overrides,
});

const createHistoricalMetrics = (
  overrides: Partial<HistoricalMetrics> = {}
): HistoricalMetrics => ({
  periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000),
  periodEnd: new Date(),
  totalCalls: 100,
  callsAnswered: 95,
  callsAbandoned: 5,
  callsWithinSLA: 80,
  averageWaitTime: 25,
  averageHandleTime: 180,
  maxWaitTime: 120,
  averageAgentUtilization: 75,
  peakQueueSize: 8,
  ...overrides,
});

// =============================================================================
// TEST SUITE
// =============================================================================

describe('QueueSLAService', () => {
  let service: QueueSLAService;

  beforeEach(() => {
    resetQueueSLAService();
    service = createQueueSLAService();
  });

  afterEach(() => {
    resetQueueSLAService();
  });

  // ===========================================================================
  // SLA EVALUATION TESTS
  // ===========================================================================

  describe('evaluateSLA', () => {
    it('should return OK status for compliant metrics', () => {
      const metrics = createDefaultMetrics();
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.isCompliant).toBe(true);
      expect(result.status.severity).toBe('ok');
      expect(result.breaches).toHaveLength(0);
      expect(result.requiresAlert).toBe(false);
    });

    it('should detect wait time exceeded breach', () => {
      const metrics = createDefaultMetrics({
        longestWaitTime: 150, // Above maxWaitTime (120)
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.severity).toBe('warning');
      expect(result.status.breaches).toContain('wait_time_exceeded');
    });

    it('should detect critical wait time breach', () => {
      const metrics = createDefaultMetrics({
        longestWaitTime: 350, // Above criticalWaitTime (300)
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.severity).toBe('critical');
      expect(result.requiresEscalation).toBe(true);
    });

    it('should detect queue size exceeded breach', () => {
      const metrics = createDefaultMetrics({
        currentQueueSize: 15, // Above maxQueueSize (10)
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.breaches).toContain('queue_size_exceeded');
    });

    it('should detect critical queue size breach', () => {
      const metrics = createDefaultMetrics({
        currentQueueSize: 25, // Above criticalQueueSize (20)
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.severity).toBe('critical');
    });

    it('should detect agent availability low breach', () => {
      const metrics = createDefaultMetrics({
        availableAgents: 0,
        currentQueueSize: 5,
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.breaches).toContain('agent_availability_low');
    });

    it('should detect abandon rate exceeded breach', () => {
      const metrics = createDefaultMetrics({
        callsHandledToday: 80,
        callsAbandonedToday: 20, // 20% abandon rate
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.breaches).toContain('abandon_rate_exceeded');
    });

    it('should not evaluate abandon rate with insufficient calls', () => {
      const metrics = createDefaultMetrics({
        callsHandledToday: 5,
        callsAbandonedToday: 2, // Would be 28% but only 7 calls
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.breaches).not.toContain('abandon_rate_exceeded');
    });

    it('should detect service level missed breach', () => {
      const metrics = createDefaultMetrics({
        serviceLevel: 60, // Below target (80)
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.breaches).toContain('service_level_missed');
    });

    it('should create breach events with correct details', () => {
      const metrics = createDefaultMetrics({
        longestWaitTime: 150,
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.breaches).toHaveLength(1);
      expect(result.breaches[0].breachType).toBe('wait_time_exceeded');
      expect(result.breaches[0].threshold).toBe(120); // maxWaitTime
      expect(result.breaches[0].currentValue).toBe(150);
      expect(result.breaches[0].queueSid).toBe('WQ001');
    });

    it('should handle multiple simultaneous breaches', () => {
      const metrics = createDefaultMetrics({
        longestWaitTime: 150,
        currentQueueSize: 15,
        availableAgents: 0,
      });
      const config = service.getConfigWithDefaults('WQ001', 'General Inquiries');

      const result = service.evaluateSLA(metrics, config);

      expect(result.status.breaches.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // QUEUE STATUS TESTS
  // ===========================================================================

  describe('updateQueueStatus', () => {
    it('should update queue status with new metrics', async () => {
      const metrics = createDefaultMetrics();

      const result = await service.updateQueueStatus(metrics);

      expect(result.status.queueSid).toBe('WQ001');
      expect(result.status.currentQueueSize).toBe(3);
    });

    it('should create config for new queue', async () => {
      const metrics = createDefaultMetrics({
        queueSid: 'WQ999',
        queueName: 'New Queue',
      });

      await service.updateQueueStatus(metrics);

      const config = await service.getSLAConfig('WQ999');
      expect(config).not.toBeNull();
      expect(config?.queueName).toBe('New Queue');
    });

    it('should accumulate breaches in history', async () => {
      const breachMetrics = createDefaultMetrics({
        longestWaitTime: 150,
      });

      await service.updateQueueStatus(breachMetrics);
      await service.updateQueueStatus(breachMetrics);

      const breaches = await service.getBreaches('WQ001', new Date(Date.now() - 60000), new Date());

      expect(breaches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getQueueStatus', () => {
    it('should return null for unknown queue', async () => {
      const status = await service.getQueueStatus('WQ_UNKNOWN');
      expect(status).toBeNull();
    });

    it('should return status after update', async () => {
      await service.updateQueueStatus(createDefaultMetrics());

      const status = await service.getQueueStatus('WQ001');
      expect(status).not.toBeNull();
    });
  });

  describe('getAllQueueStatuses', () => {
    it('should return all queue statuses', async () => {
      const statuses = await service.getAllQueueStatuses();

      // Service initializes with demo queues
      expect(statuses.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // SLA CONFIG TESTS
  // ===========================================================================

  describe('getSLAConfig', () => {
    it('should return config for known queue', async () => {
      await service.updateQueueStatus(createDefaultMetrics());

      const config = await service.getSLAConfig('WQ001');

      expect(config).not.toBeNull();
      expect(config?.targetAnswerTime).toBe(30);
    });

    it('should return null for unknown queue', async () => {
      const config = await service.getSLAConfig('WQ_UNKNOWN');
      expect(config).toBeNull();
    });
  });

  describe('updateSLAConfig', () => {
    it('should update existing config', async () => {
      await service.updateQueueStatus(createDefaultMetrics());

      const updated = await service.updateSLAConfig('WQ001', {
        maxWaitTime: 180,
        targetAnswerTime: 45,
      });

      expect(updated.maxWaitTime).toBe(180);
      expect(updated.targetAnswerTime).toBe(45);
    });

    it('should reject update for unknown queue', async () => {
      await expect(service.updateSLAConfig('WQ_UNKNOWN', { maxWaitTime: 180 })).rejects.toThrow(
        'Queue configuration not found'
      );
    });

    it('should preserve queueSid in update', async () => {
      await service.updateQueueStatus(createDefaultMetrics());

      const updated = await service.updateSLAConfig('WQ001', {
        queueSid: 'DIFFERENT_ID', // Should be ignored
        maxWaitTime: 180,
      });

      expect(updated.queueSid).toBe('WQ001');
    });
  });

  describe('getConfigWithDefaults', () => {
    it('should return config with default values', () => {
      const config = service.getConfigWithDefaults('WQ999', 'Test Queue');

      expect(config.queueSid).toBe('WQ999');
      expect(config.queueName).toBe('Test Queue');
      expect(config.targetAnswerTime).toBe(30);
      expect(config.maxWaitTime).toBe(120);
      expect(config.serviceLevelTarget).toBe(80);
    });

    it('should merge with existing config', () => {
      const existing = {
        maxWaitTime: 180,
        alertEnabled: false,
      };

      const config = service.getConfigWithDefaults('WQ999', 'Test Queue', existing);

      expect(config.maxWaitTime).toBe(180);
      expect(config.alertEnabled).toBe(false);
      expect(config.targetAnswerTime).toBe(30); // Default
    });
  });

  // ===========================================================================
  // BREACH MANAGEMENT TESTS
  // ===========================================================================

  describe('getBreaches', () => {
    it('should return breaches within time period', async () => {
      const breachMetrics = createDefaultMetrics({ longestWaitTime: 150 });
      await service.updateQueueStatus(breachMetrics);

      const breaches = await service.getBreaches(
        'WQ001',
        new Date(Date.now() - 60000),
        new Date(Date.now() + 60000)
      );

      expect(breaches.length).toBeGreaterThan(0);
    });

    it('should filter by queue', async () => {
      const metrics1 = createDefaultMetrics({ queueSid: 'WQ001', longestWaitTime: 150 });
      const metrics2 = createDefaultMetrics({ queueSid: 'WQ002', longestWaitTime: 150 });

      await service.updateQueueStatus(metrics1);
      await service.updateQueueStatus(metrics2);

      const breaches = await service.getBreaches(
        'WQ001',
        new Date(Date.now() - 60000),
        new Date(Date.now() + 60000)
      );

      expect(breaches.every((b) => b.queueSid === 'WQ001')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const breachMetrics = createDefaultMetrics({ longestWaitTime: 150 });

      // Create multiple breaches
      for (let i = 0; i < 5; i++) {
        await service.updateQueueStatus(breachMetrics);
      }

      const breaches = await service.getBreaches(
        'WQ001',
        new Date(Date.now() - 60000),
        new Date(Date.now() + 60000),
        3
      );

      expect(breaches.length).toBeLessThanOrEqual(3);
    });

    it('should sort breaches by detection time descending', async () => {
      const breachMetrics = createDefaultMetrics({ longestWaitTime: 150 });

      await service.updateQueueStatus(breachMetrics);
      await new Promise((r) => setTimeout(r, 10));
      await service.updateQueueStatus(breachMetrics);

      const breaches = await service.getBreaches(
        'WQ001',
        new Date(Date.now() - 60000),
        new Date(Date.now() + 60000)
      );

      if (breaches.length >= 2) {
        expect(breaches[0].detectedAt.getTime()).toBeGreaterThanOrEqual(
          breaches[1].detectedAt.getTime()
        );
      }
    });
  });

  describe('isBreachContinuation', () => {
    it('should identify breach continuation', async () => {
      const breachMetrics = createDefaultMetrics({ longestWaitTime: 150 });
      const result = await service.updateQueueStatus(breachMetrics);

      const newBreach = result.breaches[0];
      const existingBreaches = result.breaches;

      const isContinuation = service.isBreachContinuation(
        { ...newBreach, detectedAt: new Date(newBreach.detectedAt.getTime() + 60000) },
        existingBreaches.map((b) => ({ ...b, resolvedAt: undefined })),
        300
      );

      expect(isContinuation).toBe(true);
    });

    it('should not identify as continuation after threshold', () => {
      const now = new Date();
      const existingBreach = {
        eventId: 'evt-001',
        queueSid: 'WQ001',
        queueName: 'Test',
        breachType: 'wait_time_exceeded' as SLABreachType,
        severity: 'warning' as const,
        threshold: 120,
        currentValue: 150,
        affectedCalls: 5,
        detectedAt: new Date(now.getTime() - 600000), // 10 minutes ago
        alertSent: false,
        escalated: false,
      };

      const newBreach = {
        ...existingBreach,
        eventId: 'evt-002',
        detectedAt: now,
      };

      const isContinuation = service.isBreachContinuation(
        newBreach,
        [existingBreach],
        300 // 5 minute threshold
      );

      expect(isContinuation).toBe(false);
    });
  });

  describe('calculateBreachDuration', () => {
    it('should calculate duration for resolved breach', () => {
      const breach = {
        eventId: 'evt-001',
        queueSid: 'WQ001',
        queueName: 'Test',
        breachType: 'wait_time_exceeded' as SLABreachType,
        severity: 'warning' as const,
        threshold: 120,
        currentValue: 150,
        affectedCalls: 5,
        detectedAt: new Date(Date.now() - 300000), // 5 minutes ago
        resolvedAt: new Date(Date.now() - 60000), // 1 minute ago
        alertSent: false,
        escalated: false,
      };

      const duration = service.calculateBreachDuration(breach);

      expect(duration).toBeCloseTo(240, -1); // ~240 seconds (4 minutes)
    });

    it('should calculate duration for ongoing breach', () => {
      const breach = {
        eventId: 'evt-001',
        queueSid: 'WQ001',
        queueName: 'Test',
        breachType: 'wait_time_exceeded' as SLABreachType,
        severity: 'warning' as const,
        threshold: 120,
        currentValue: 150,
        affectedCalls: 5,
        detectedAt: new Date(Date.now() - 300000), // 5 minutes ago
        alertSent: false,
        escalated: false,
      };

      const duration = service.calculateBreachDuration(breach);

      expect(duration).toBeGreaterThanOrEqual(298); // At least ~5 minutes
    });
  });

  // ===========================================================================
  // REPORTING TESTS
  // ===========================================================================

  describe('generateReport', () => {
    it('should generate SLA report', () => {
      const historicalMetrics = createHistoricalMetrics();
      const breaches = [
        {
          eventId: 'evt-001',
          queueSid: 'WQ001',
          queueName: 'Test',
          breachType: 'wait_time_exceeded' as SLABreachType,
          severity: 'warning' as const,
          threshold: 120,
          currentValue: 150,
          affectedCalls: 5,
          detectedAt: new Date(),
          alertSent: false,
          escalated: false,
        },
        {
          eventId: 'evt-002',
          queueSid: 'WQ001',
          queueName: 'Test',
          breachType: 'queue_size_exceeded' as SLABreachType,
          severity: 'critical' as const,
          threshold: 10,
          currentValue: 15,
          affectedCalls: 5,
          detectedAt: new Date(),
          alertSent: true,
          escalated: true,
        },
      ];

      const report = service.generateReport(
        'WQ001',
        'General Inquiries',
        historicalMetrics,
        breaches,
        'daily'
      );

      expect(report.queueSid).toBe('WQ001');
      expect(report.totalCalls).toBe(100);
      expect(report.totalBreaches).toBe(2);
      expect(report.criticalBreaches).toBe(1);
      expect(report.breachesByType.wait_time_exceeded).toBe(1);
      expect(report.breachesByType.queue_size_exceeded).toBe(1);
    });

    it('should calculate service level correctly', () => {
      const historicalMetrics = createHistoricalMetrics({
        totalCalls: 100,
        callsWithinSLA: 75,
      });

      const report = service.generateReport(
        'WQ001',
        'General Inquiries',
        historicalMetrics,
        [],
        'daily'
      );

      expect(report.overallServiceLevel).toBe(75);
    });

    it('should calculate abandon rate correctly', () => {
      const historicalMetrics = createHistoricalMetrics({
        totalCalls: 100,
        callsAbandoned: 10,
      });

      const report = service.generateReport(
        'WQ001',
        'General Inquiries',
        historicalMetrics,
        [],
        'daily'
      );

      expect(report.abandonRate).toBe(10);
    });

    it('should support different period types', () => {
      const historicalMetrics = createHistoricalMetrics();

      const hourly = service.generateReport('WQ001', 'Test', historicalMetrics, [], 'hourly');
      const weekly = service.generateReport('WQ001', 'Test', historicalMetrics, [], 'weekly');
      const monthly = service.generateReport('WQ001', 'Test', historicalMetrics, [], 'monthly');

      expect(hourly.periodType).toBe('hourly');
      expect(weekly.periodType).toBe('weekly');
      expect(monthly.periodType).toBe('monthly');
    });
  });

  // ===========================================================================
  // METRICS CALCULATION TESTS
  // ===========================================================================

  describe('calculateServiceLevel', () => {
    it('should calculate service level percentage', () => {
      expect(service.calculateServiceLevel(80, 100)).toBe(80);
      expect(service.calculateServiceLevel(90, 100)).toBe(90);
      expect(service.calculateServiceLevel(0, 100)).toBe(0);
    });

    it('should return 100 for zero calls', () => {
      expect(service.calculateServiceLevel(0, 0)).toBe(100);
    });
  });

  describe('calculateAgentUtilization', () => {
    it('should calculate agent utilization percentage', () => {
      expect(service.calculateAgentUtilization(3, 4)).toBe(75);
      expect(service.calculateAgentUtilization(4, 4)).toBe(100);
      expect(service.calculateAgentUtilization(0, 4)).toBe(0);
    });

    it('should return 0 for zero agents', () => {
      expect(service.calculateAgentUtilization(0, 0)).toBe(0);
    });
  });

  describe('calculateAbandonRate', () => {
    it('should calculate abandon rate percentage', () => {
      expect(service.calculateAbandonRate(5, 100)).toBe(5);
      expect(service.calculateAbandonRate(10, 50)).toBe(20);
      expect(service.calculateAbandonRate(0, 100)).toBe(0);
    });

    it('should return 0 for zero calls', () => {
      expect(service.calculateAbandonRate(0, 0)).toBe(0);
    });
  });

  // ===========================================================================
  // UTILITY TESTS
  // ===========================================================================

  describe('getSeverityColor', () => {
    it('should return correct colors', () => {
      expect(service.getSeverityColor('ok')).toBe('green');
      expect(service.getSeverityColor('warning')).toBe('yellow');
      expect(service.getSeverityColor('critical')).toBe('red');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds', () => {
      expect(service.formatDuration(45)).toBe('45s');
    });

    it('should format minutes and seconds', () => {
      expect(service.formatDuration(125)).toBe('2m 5s');
    });

    it('should format hours and minutes', () => {
      expect(service.formatDuration(3725)).toBe('1h 2m');
    });
  });

  // ===========================================================================
  // FACTORY TESTS
  // ===========================================================================

  describe('Factory Functions', () => {
    describe('createQueueSLAService', () => {
      it('should create new instance', () => {
        const svc = createQueueSLAService();
        expect(svc).toBeInstanceOf(QueueSLAService);
      });

      it('should accept custom config', () => {
        const config: QueueSLAServiceConfig = {
          defaultConfig: { maxWaitTime: 180 },
          minCallsForAbandonRate: 20,
        };

        const svc = createQueueSLAService(config);
        const queueConfig = svc.getConfigWithDefaults('WQ999', 'Test');

        expect(queueConfig.maxWaitTime).toBe(180);
      });
    });

    describe('getQueueSLAService', () => {
      it('should return singleton instance', () => {
        const svc1 = getQueueSLAService();
        const svc2 = getQueueSLAService();

        expect(svc1).toBe(svc2);
      });
    });

    describe('resetQueueSLAService', () => {
      it('should reset singleton', () => {
        const svc1 = getQueueSLAService();
        resetQueueSLAService();
        const svc2 = getQueueSLAService();

        expect(svc1).not.toBe(svc2);
      });
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('severity should be valid enum value', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 400 }), // longestWaitTime
          fc.nat({ max: 50 }), // currentQueueSize
          fc.nat({ max: 10 }), // availableAgents
          fc.nat({ max: 100 }), // serviceLevel
          (waitTime, queueSize, availableAgents, serviceLevel) => {
            const metrics = createDefaultMetrics({
              longestWaitTime: waitTime,
              currentQueueSize: queueSize,
              availableAgents,
              serviceLevel,
            });
            const config = service.getConfigWithDefaults('WQ001', 'Test');
            const result = service.evaluateSLA(metrics, config);

            return ['ok', 'warning', 'critical'].includes(result.status.severity);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('service level should always be between 0 and 100', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 1000 }),
          fc.nat({ max: 1000 }),
          (callsWithinTarget, totalCalls) => {
            // Ensure calls within target never exceed total calls
            const actualWithinTarget = Math.min(callsWithinTarget, totalCalls);
            const result = service.calculateServiceLevel(actualWithinTarget, totalCalls);
            return result >= 0 && result <= 100;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('agent utilization should always be between 0 and 100', () => {
      fc.assert(
        fc.property(fc.nat({ max: 100 }), fc.nat({ max: 100 }), (busy, total) => {
          // Ensure busy agents never exceed total agents
          const actualBusy = Math.min(busy, total);
          const result = service.calculateAgentUtilization(actualBusy, total);
          return result >= 0 && result <= 100;
        }),
        { numRuns: 100 }
      );
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle zero metrics', async () => {
      const metrics = createDefaultMetrics({
        currentQueueSize: 0,
        longestWaitTime: 0,
        averageWaitTime: 0,
        callsHandledToday: 0,
        callsAbandonedToday: 0,
      });

      const result = await service.updateQueueStatus(metrics);

      expect(result.status.isCompliant).toBe(true);
    });

    it('should handle very large values', async () => {
      const metrics = createDefaultMetrics({
        currentQueueSize: 1000,
        longestWaitTime: 10000,
        callsHandledToday: 10000,
      });

      const result = await service.updateQueueStatus(metrics);

      expect(result.status).toBeDefined();
      expect(result.status.severity).toBe('critical');
    });

    it('should handle concurrent updates', async () => {
      const results = await Promise.all([
        service.updateQueueStatus(createDefaultMetrics({ queueSid: 'WQ001' })),
        service.updateQueueStatus(createDefaultMetrics({ queueSid: 'WQ002' })),
        service.updateQueueStatus(createDefaultMetrics({ queueSid: 'WQ003' })),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((r) => expect(r.status).toBeDefined());
    });
  });
});
