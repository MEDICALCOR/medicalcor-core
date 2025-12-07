/**
 * Queue SLA Service Tests
 * H8: Queue SLA Tracking for Call Center
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  QueueSLAService,
  createQueueSLAService,
  getQueueSLAService,
  resetQueueSLAService,
  type QueueMetricsInput,
  type HistoricalMetrics,
} from '../voice/queue-sla-service.js';
import type { QueueSLAConfig, SLABreachEvent } from '@medicalcor/types';

describe('QueueSLAService', () => {
  let service: QueueSLAService;
  let defaultConfig: QueueSLAConfig;

  beforeEach(() => {
    resetQueueSLAService();
    service = createQueueSLAService();
    defaultConfig = {
      queueSid: 'WQ123',
      queueName: 'Sales Queue',
      targetAnswerTime: 30,
      maxWaitTime: 120,
      criticalWaitTime: 300,
      maxQueueSize: 10,
      criticalQueueSize: 20,
      maxAbandonRate: 5,
      minAvailableAgents: 1,
      targetAgentUtilization: 80,
      serviceLevelTarget: 80,
      alertEnabled: true,
      escalationEnabled: true,
    };
  });

  afterEach(() => {
    resetQueueSLAService();
  });

  describe('SLA Evaluation', () => {
    it('should return compliant status when all metrics are within thresholds', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 3,
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(true);
      expect(result.status.severity).toBe('ok');
      expect(result.breaches).toHaveLength(0);
      expect(result.requiresAlert).toBe(false);
      expect(result.requiresEscalation).toBe(false);
    });

    it('should detect wait time exceeded (warning)', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 3,
        longestWaitTime: 150, // Exceeds maxWaitTime (120) but not criticalWaitTime (300)
        averageWaitTime: 60,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.severity).toBe('warning');
      expect(result.status.breaches).toContain('wait_time_exceeded');
      expect(result.breaches).toHaveLength(1);
      expect(result.breaches[0].breachType).toBe('wait_time_exceeded');
      expect(result.breaches[0].severity).toBe('warning');
    });

    it('should detect wait time exceeded (critical)', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 3,
        longestWaitTime: 350, // Exceeds criticalWaitTime (300)
        averageWaitTime: 60,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.severity).toBe('critical');
      expect(result.status.breaches).toContain('wait_time_exceeded');
      expect(result.requiresEscalation).toBe(true);
    });

    it('should detect queue size exceeded (warning)', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 15, // Exceeds maxQueueSize (10) but not criticalQueueSize (20)
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.severity).toBe('warning');
      expect(result.status.breaches).toContain('queue_size_exceeded');
    });

    it('should detect queue size exceeded (critical)', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 25, // Exceeds criticalQueueSize (20)
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.severity).toBe('critical');
      expect(result.status.breaches).toContain('queue_size_exceeded');
    });

    it('should detect agent availability low', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 5, // Has callers waiting
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 0, // No agents available
        busyAgents: 8,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.breaches).toContain('agent_availability_low');
    });

    it('should not detect agent availability low when queue is empty', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 0, // No callers waiting
        longestWaitTime: 0,
        averageWaitTime: 0,
        availableAgents: 0, // No agents available but queue is empty
        busyAgents: 8,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.breaches).not.toContain('agent_availability_low');
    });

    it('should detect abandon rate exceeded', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 3,
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 90,
        callsAbandonedToday: 10, // 10% abandon rate (exceeds 5%)
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.breaches).toContain('abandon_rate_exceeded');
      expect(result.status.abandonRate).toBeCloseTo(10);
    });

    it('should not evaluate abandon rate with insufficient calls', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 3,
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 5,
        callsAbandonedToday: 3, // Would be 37.5% but only 8 total calls
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.breaches).not.toContain('abandon_rate_exceeded');
    });

    it('should detect service level missed', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 3,
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 70, // Below 80% target
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.breaches).toContain('service_level_missed');
    });

    it('should detect multiple breaches', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 25, // Critical queue size
        longestWaitTime: 350, // Critical wait time
        averageWaitTime: 120,
        availableAgents: 0, // No agents
        busyAgents: 8,
        totalAgents: 8,
        callsHandledToday: 90,
        callsAbandonedToday: 10, // High abandon rate
        serviceLevel: 60, // Low service level
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.isCompliant).toBe(false);
      expect(result.status.severity).toBe('critical');
      expect(result.status.breaches.length).toBeGreaterThan(3);
      expect(result.breaches.length).toBeGreaterThan(3);
    });

    it('should calculate agent utilization correctly', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 3,
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 2,
        busyAgents: 6,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.agentUtilization).toBe(75);
    });
  });

  describe('Config with Defaults', () => {
    it('should apply default values when config is partial', () => {
      const config = service.getConfigWithDefaults('WQ123', 'Test Queue', {
        maxWaitTime: 180,
      });

      expect(config.queueSid).toBe('WQ123');
      expect(config.queueName).toBe('Test Queue');
      expect(config.maxWaitTime).toBe(180); // Custom value
      expect(config.targetAnswerTime).toBe(30); // Default value
      expect(config.criticalWaitTime).toBe(300); // Default value
    });

    it('should use all defaults when no config provided', () => {
      const config = service.getConfigWithDefaults('WQ123', 'Test Queue', null);

      expect(config.queueSid).toBe('WQ123');
      expect(config.targetAnswerTime).toBe(30);
      expect(config.maxWaitTime).toBe(120);
      expect(config.maxQueueSize).toBe(10);
      expect(config.alertEnabled).toBe(true);
    });
  });

  describe('Breach Continuation', () => {
    it('should detect breach continuation within threshold', () => {
      const now = new Date();
      const existingBreach: SLABreachEvent = {
        eventId: crypto.randomUUID(),
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        breachType: 'wait_time_exceeded',
        severity: 'warning',
        threshold: 120,
        currentValue: 150,
        affectedCalls: 3,
        detectedAt: new Date(now.getTime() - 60000), // 1 minute ago
        alertSent: true,
        escalated: false,
      };

      const newBreach: SLABreachEvent = {
        eventId: crypto.randomUUID(),
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        breachType: 'wait_time_exceeded',
        severity: 'warning',
        threshold: 120,
        currentValue: 160,
        affectedCalls: 4,
        detectedAt: now,
        alertSent: false,
        escalated: false,
      };

      const isContinuation = service.isBreachContinuation(newBreach, [existingBreach]);

      expect(isContinuation).toBe(true);
    });

    it('should not detect continuation for different breach types', () => {
      const now = new Date();
      const existingBreach: SLABreachEvent = {
        eventId: crypto.randomUUID(),
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        breachType: 'wait_time_exceeded',
        severity: 'warning',
        threshold: 120,
        currentValue: 150,
        affectedCalls: 3,
        detectedAt: new Date(now.getTime() - 60000),
        alertSent: true,
        escalated: false,
      };

      const newBreach: SLABreachEvent = {
        eventId: crypto.randomUUID(),
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        breachType: 'queue_size_exceeded', // Different type
        severity: 'warning',
        threshold: 10,
        currentValue: 15,
        affectedCalls: 15,
        detectedAt: now,
        alertSent: false,
        escalated: false,
      };

      const isContinuation = service.isBreachContinuation(newBreach, [existingBreach]);

      expect(isContinuation).toBe(false);
    });

    it('should not detect continuation for resolved breaches', () => {
      const now = new Date();
      const existingBreach: SLABreachEvent = {
        eventId: crypto.randomUUID(),
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        breachType: 'wait_time_exceeded',
        severity: 'warning',
        threshold: 120,
        currentValue: 150,
        affectedCalls: 3,
        detectedAt: new Date(now.getTime() - 60000),
        resolvedAt: new Date(now.getTime() - 30000), // Resolved
        alertSent: true,
        escalated: false,
      };

      const newBreach: SLABreachEvent = {
        eventId: crypto.randomUUID(),
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        breachType: 'wait_time_exceeded',
        severity: 'warning',
        threshold: 120,
        currentValue: 160,
        affectedCalls: 4,
        detectedAt: now,
        alertSent: false,
        escalated: false,
      };

      const isContinuation = service.isBreachContinuation(newBreach, [existingBreach]);

      expect(isContinuation).toBe(false);
    });
  });

  describe('Breach Duration Calculation', () => {
    it('should calculate duration for ongoing breach', () => {
      const detectedAt = new Date(Date.now() - 120000); // 2 minutes ago
      const breach: SLABreachEvent = {
        eventId: crypto.randomUUID(),
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        breachType: 'wait_time_exceeded',
        severity: 'warning',
        threshold: 120,
        currentValue: 150,
        affectedCalls: 3,
        detectedAt,
        alertSent: true,
        escalated: false,
      };

      const duration = service.calculateBreachDuration(breach);

      expect(duration).toBeGreaterThanOrEqual(119); // At least ~2 minutes
      expect(duration).toBeLessThan(130); // But not too much more
    });

    it('should calculate duration for resolved breach', () => {
      const detectedAt = new Date('2024-01-01T10:00:00Z');
      const resolvedAt = new Date('2024-01-01T10:05:00Z'); // 5 minutes later
      const breach: SLABreachEvent = {
        eventId: crypto.randomUUID(),
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        breachType: 'wait_time_exceeded',
        severity: 'warning',
        threshold: 120,
        currentValue: 150,
        affectedCalls: 3,
        detectedAt,
        resolvedAt,
        alertSent: true,
        escalated: false,
      };

      const duration = service.calculateBreachDuration(breach);

      expect(duration).toBe(300); // 5 minutes = 300 seconds
    });
  });

  describe('Report Generation', () => {
    it('should generate a valid SLA report', () => {
      const periodStart = new Date('2024-01-01T00:00:00Z');
      const periodEnd = new Date('2024-01-02T00:00:00Z');

      const historicalMetrics: HistoricalMetrics = {
        periodStart,
        periodEnd,
        totalCalls: 500,
        callsAnswered: 480,
        callsAbandoned: 20,
        callsWithinSLA: 400,
        averageWaitTime: 25,
        averageHandleTime: 180,
        maxWaitTime: 90,
        averageAgentUtilization: 75,
        peakQueueSize: 12,
      };

      const breaches: SLABreachEvent[] = [
        {
          eventId: crypto.randomUUID(),
          queueSid: 'WQ123',
          queueName: 'Sales Queue',
          breachType: 'wait_time_exceeded',
          severity: 'warning',
          threshold: 120,
          currentValue: 150,
          affectedCalls: 3,
          detectedAt: new Date('2024-01-01T10:00:00Z'),
          alertSent: true,
          escalated: false,
        },
        {
          eventId: crypto.randomUUID(),
          queueSid: 'WQ123',
          queueName: 'Sales Queue',
          breachType: 'queue_size_exceeded',
          severity: 'critical',
          threshold: 10,
          currentValue: 15,
          affectedCalls: 15,
          detectedAt: new Date('2024-01-01T14:00:00Z'),
          alertSent: true,
          escalated: true,
        },
      ];

      const report = service.generateReport(
        'WQ123',
        'Sales Queue',
        historicalMetrics,
        breaches,
        'daily'
      );

      expect(report.queueSid).toBe('WQ123');
      expect(report.queueName).toBe('Sales Queue');
      expect(report.periodType).toBe('daily');
      expect(report.totalCalls).toBe(500);
      expect(report.callsAnswered).toBe(480);
      expect(report.callsAbandoned).toBe(20);
      expect(report.callsWithinSLA).toBe(400);
      expect(report.overallServiceLevel).toBe(80); // 400/500 * 100
      expect(report.abandonRate).toBe(4); // 20/500 * 100
      expect(report.totalBreaches).toBe(2);
      expect(report.criticalBreaches).toBe(1);
      expect(report.breachesByType?.['wait_time_exceeded']).toBe(1);
      expect(report.breachesByType?.['queue_size_exceeded']).toBe(1);
    });

    it('should handle empty breach list', () => {
      const periodStart = new Date('2024-01-01T00:00:00Z');
      const periodEnd = new Date('2024-01-02T00:00:00Z');

      const historicalMetrics: HistoricalMetrics = {
        periodStart,
        periodEnd,
        totalCalls: 500,
        callsAnswered: 495,
        callsAbandoned: 5,
        callsWithinSLA: 490,
        averageWaitTime: 15,
        averageHandleTime: 180,
        maxWaitTime: 45,
        averageAgentUtilization: 70,
        peakQueueSize: 8,
      };

      const report = service.generateReport('WQ123', 'Sales Queue', historicalMetrics, [], 'daily');

      expect(report.totalBreaches).toBe(0);
      expect(report.criticalBreaches).toBe(0);
      expect(report.complianceRate).toBe(100);
    });

    it('should handle zero calls gracefully', () => {
      const periodStart = new Date('2024-01-01T00:00:00Z');
      const periodEnd = new Date('2024-01-02T00:00:00Z');

      const historicalMetrics: HistoricalMetrics = {
        periodStart,
        periodEnd,
        totalCalls: 0,
        callsAnswered: 0,
        callsAbandoned: 0,
        callsWithinSLA: 0,
        averageWaitTime: 0,
        averageHandleTime: 0,
        maxWaitTime: 0,
        averageAgentUtilization: 0,
        peakQueueSize: 0,
      };

      const report = service.generateReport('WQ123', 'Sales Queue', historicalMetrics, [], 'daily');

      expect(report.overallServiceLevel).toBe(100); // No calls = 100% service level
      expect(report.abandonRate).toBe(0);
    });
  });

  describe('Metrics Calculations', () => {
    it('should calculate service level correctly', () => {
      expect(service.calculateServiceLevel(80, 100)).toBe(80);
      expect(service.calculateServiceLevel(0, 100)).toBe(0);
      expect(service.calculateServiceLevel(100, 100)).toBe(100);
      expect(service.calculateServiceLevel(0, 0)).toBe(100); // No calls = 100%
    });

    it('should calculate agent utilization correctly', () => {
      expect(service.calculateAgentUtilization(8, 10)).toBe(80);
      expect(service.calculateAgentUtilization(0, 10)).toBe(0);
      expect(service.calculateAgentUtilization(10, 10)).toBe(100);
      expect(service.calculateAgentUtilization(0, 0)).toBe(0); // No agents = 0%
    });

    it('should calculate abandon rate correctly', () => {
      expect(service.calculateAbandonRate(5, 100)).toBe(5);
      expect(service.calculateAbandonRate(0, 100)).toBe(0);
      expect(service.calculateAbandonRate(100, 100)).toBe(100);
      expect(service.calculateAbandonRate(0, 0)).toBe(0); // No calls = 0%
    });
  });

  describe('Utility Functions', () => {
    it('should return correct severity colors', () => {
      expect(service.getSeverityColor('ok')).toBe('green');
      expect(service.getSeverityColor('warning')).toBe('yellow');
      expect(service.getSeverityColor('critical')).toBe('red');
    });

    it('should format duration correctly', () => {
      expect(service.formatDuration(30)).toBe('30s');
      expect(service.formatDuration(90)).toBe('1m 30s');
      expect(service.formatDuration(3661)).toBe('1h 1m');
      expect(service.formatDuration(7200)).toBe('2h 0m');
    });
  });

  describe('Singleton Pattern', () => {
    afterEach(() => {
      resetQueueSLAService();
    });

    it('should return same instance from getQueueSLAService', () => {
      const service1 = getQueueSLAService();
      const service2 = getQueueSLAService();

      expect(service1).toBe(service2);
    });

    it('should reset instance correctly', () => {
      const service1 = getQueueSLAService();
      resetQueueSLAService();
      const service2 = getQueueSLAService();

      expect(service1).not.toBe(service2);
    });

    it('should create new instance with createQueueSLAService', () => {
      const service1 = createQueueSLAService();
      const service2 = createQueueSLAService();

      expect(service1).not.toBe(service2);
    });
  });

  describe('Custom Service Configuration', () => {
    it('should use custom default config', () => {
      const customService = createQueueSLAService({
        defaultConfig: {
          targetAnswerTime: 45,
          maxWaitTime: 180,
        },
      });

      const config = customService.getConfigWithDefaults('WQ123', 'Test Queue', null);

      expect(config.targetAnswerTime).toBe(45);
      expect(config.maxWaitTime).toBe(180);
      expect(config.criticalWaitTime).toBe(300); // Still default
    });

    it('should use custom minimum calls for abandon rate', () => {
      const customService = createQueueSLAService({
        minCallsForAbandonRate: 5, // Lower threshold
      });

      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 3,
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 4,
        callsAbandonedToday: 2, // 33% abandon rate with only 6 calls
        serviceLevel: 90,
      };

      const result = customService.evaluateSLA(metrics, defaultConfig);

      expect(result.status.breaches).toContain('abandon_rate_exceeded');
    });
  });

  describe('Alert and Escalation Flags', () => {
    it('should require alert when breaches detected and alertEnabled', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 15,
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.requiresAlert).toBe(true);
    });

    it('should not require alert when alertEnabled is false', () => {
      const configWithAlertsDisabled: QueueSLAConfig = {
        ...defaultConfig,
        alertEnabled: false,
      };

      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 15,
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, configWithAlertsDisabled);

      expect(result.requiresAlert).toBe(false);
    });

    it('should require escalation for critical breaches when escalationEnabled', () => {
      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 25, // Critical
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, defaultConfig);

      expect(result.status.severity).toBe('critical');
      expect(result.requiresEscalation).toBe(true);
    });

    it('should not require escalation when escalationEnabled is false', () => {
      const configWithEscalationDisabled: QueueSLAConfig = {
        ...defaultConfig,
        escalationEnabled: false,
      };

      const metrics: QueueMetricsInput = {
        queueSid: 'WQ123',
        queueName: 'Sales Queue',
        currentQueueSize: 25, // Critical
        longestWaitTime: 45,
        averageWaitTime: 20,
        availableAgents: 5,
        busyAgents: 3,
        totalAgents: 8,
        callsHandledToday: 100,
        callsAbandonedToday: 2,
        serviceLevel: 90,
      };

      const result = service.evaluateSLA(metrics, configWithEscalationDisabled);

      expect(result.status.severity).toBe('critical');
      expect(result.requiresEscalation).toBe(false);
    });
  });
});
