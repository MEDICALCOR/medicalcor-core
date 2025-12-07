/**
 * Server Action Tests: Queue SLA Dashboard
 *
 * Tests for queue SLA dashboard server actions type definitions
 * and mock data factories.
 *
 * Note: Full integration tests require database connection.
 * These tests focus on type safety and mock data validation.
 */

import { describe, it, expect } from 'vitest';
import { createMockQueueSLAStatus, createMockSLABreachEvent } from '../setup/test-data';

// Import types from the actions module
import type {
  QueueDashboardStats,
  QueueStatusWithAlerts,
  BreachSummary,
  DailyBreachStats,
} from '@/app/queues/actions';

describe('Queue SLA Dashboard Types', () => {
  describe('QueueDashboardStats', () => {
    it('should have correct interface shape', () => {
      const stats: QueueDashboardStats = {
        totalQueues: 5,
        activeQueues: 3,
        totalAgents: 20,
        availableAgents: 12,
        busyAgents: 8,
        totalCallsToday: 150,
        averageWaitTime: 45,
        serviceLevel: 92,
        breachesLast24h: 2,
        criticalBreaches: 1,
        complianceRate: 96,
      };

      expect(stats.totalQueues).toBe(5);
      expect(stats.activeQueues).toBe(3);
      expect(stats.totalAgents).toBe(20);
      expect(stats.availableAgents).toBe(12);
      expect(stats.busyAgents).toBe(8);
      expect(stats.totalCallsToday).toBe(150);
      expect(stats.averageWaitTime).toBe(45);
      expect(stats.serviceLevel).toBe(92);
      expect(stats.breachesLast24h).toBe(2);
      expect(stats.criticalBreaches).toBe(1);
      expect(stats.complianceRate).toBe(96);
    });

    it('should allow zero values', () => {
      const emptyStats: QueueDashboardStats = {
        totalQueues: 0,
        activeQueues: 0,
        totalAgents: 0,
        availableAgents: 0,
        busyAgents: 0,
        totalCallsToday: 0,
        averageWaitTime: 0,
        serviceLevel: 0,
        breachesLast24h: 0,
        criticalBreaches: 0,
        complianceRate: 0,
      };

      expect(emptyStats.totalQueues).toBe(0);
      expect(emptyStats.complianceRate).toBe(0);
    });
  });

  describe('QueueStatusWithAlerts', () => {
    it('should extend QueueSLAStatus with alert fields', () => {
      const mockQueueStatus = createMockQueueSLAStatus();
      const statusWithAlerts: QueueStatusWithAlerts = {
        ...mockQueueStatus,
        alertCount: 3,
        lastBreachAt: new Date(),
      };

      expect(statusWithAlerts.alertCount).toBe(3);
      expect(statusWithAlerts.lastBreachAt).toBeInstanceOf(Date);
      expect(statusWithAlerts.queueSid).toBeDefined();
      expect(statusWithAlerts.queueName).toBeDefined();
    });

    it('should allow undefined lastBreachAt', () => {
      const mockQueueStatus = createMockQueueSLAStatus();
      const statusWithAlerts: QueueStatusWithAlerts = {
        ...mockQueueStatus,
        alertCount: 0,
      };

      expect(statusWithAlerts.lastBreachAt).toBeUndefined();
      expect(statusWithAlerts.alertCount).toBe(0);
    });
  });

  describe('BreachSummary', () => {
    it('should have correct interface shape', () => {
      const summary: BreachSummary = {
        breachType: 'wait_time',
        count: 5,
        criticalCount: 2,
        lastOccurred: new Date(),
      };

      expect(summary.breachType).toBe('wait_time');
      expect(summary.count).toBe(5);
      expect(summary.criticalCount).toBe(2);
      expect(summary.lastOccurred).toBeInstanceOf(Date);
    });

    it('should handle different breach types', () => {
      const breachTypes = ['wait_time', 'abandon_rate', 'service_level', 'agent_availability'];

      breachTypes.forEach((type) => {
        const summary: BreachSummary = {
          breachType: type,
          count: 1,
          criticalCount: 0,
          lastOccurred: new Date(),
        };
        expect(summary.breachType).toBe(type);
      });
    });
  });

  describe('DailyBreachStats', () => {
    it('should have correct interface shape', () => {
      const dailyStats: DailyBreachStats = {
        date: '2024-12-07',
        totalBreaches: 10,
        criticalBreaches: 3,
        warningBreaches: 7,
        resolvedBreaches: 8,
      };

      expect(dailyStats.date).toBe('2024-12-07');
      expect(dailyStats.totalBreaches).toBe(10);
      expect(dailyStats.criticalBreaches).toBe(3);
      expect(dailyStats.warningBreaches).toBe(7);
      expect(dailyStats.resolvedBreaches).toBe(8);
    });

    it('should allow zero values for all breach counts', () => {
      const emptyDay: DailyBreachStats = {
        date: '2024-12-07',
        totalBreaches: 0,
        criticalBreaches: 0,
        warningBreaches: 0,
        resolvedBreaches: 0,
      };

      expect(emptyDay.totalBreaches).toBe(0);
      expect(emptyDay.criticalBreaches).toBe(0);
      expect(emptyDay.warningBreaches).toBe(0);
      expect(emptyDay.resolvedBreaches).toBe(0);
    });
  });
});

describe('Queue Mock Data Factories', () => {
  describe('createMockQueueSLAStatus', () => {
    it('should create valid queue status with defaults', () => {
      const status = createMockQueueSLAStatus();

      expect(status).toHaveProperty('queueSid');
      expect(status).toHaveProperty('queueName');
      expect(status).toHaveProperty('currentQueueSize');
      expect(status).toHaveProperty('averageWaitTime');
      expect(status).toHaveProperty('longestWaitTime');
      expect(status).toHaveProperty('serviceLevel');
      expect(status).toHaveProperty('slaTarget');
      expect(status).toHaveProperty('isCompliant');
      expect(status).toHaveProperty('severity');
      expect(status).toHaveProperty('totalAgents');
      expect(status).toHaveProperty('availableAgents');
      expect(status).toHaveProperty('busyAgents');
      expect(status).toHaveProperty('callsHandledToday');
      expect(status).toHaveProperty('lastUpdated');
    });

    it('should generate unique queue SIDs', () => {
      const status1 = createMockQueueSLAStatus();
      const status2 = createMockQueueSLAStatus();

      expect(status1.queueSid).not.toBe(status2.queueSid);
    });

    it('should allow overriding defaults', () => {
      const status = createMockQueueSLAStatus({
        queueName: 'VIP Queue',
        currentQueueSize: 10,
        isCompliant: false,
        severity: 'critical',
      });

      expect(status.queueName).toBe('VIP Queue');
      expect(status.currentQueueSize).toBe(10);
      expect(status.isCompliant).toBe(false);
      expect(status.severity).toBe('critical');
    });

    it('should have lastUpdated as Date', () => {
      const status = createMockQueueSLAStatus();

      expect(status.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('createMockSLABreachEvent', () => {
    it('should create valid breach event with defaults', () => {
      const breach = createMockSLABreachEvent();

      expect(breach).toHaveProperty('eventId');
      expect(breach).toHaveProperty('queueSid');
      expect(breach).toHaveProperty('queueName');
      expect(breach).toHaveProperty('breachType');
      expect(breach).toHaveProperty('severity');
      expect(breach).toHaveProperty('threshold');
      expect(breach).toHaveProperty('currentValue');
      expect(breach).toHaveProperty('affectedCalls');
      expect(breach).toHaveProperty('detectedAt');
      expect(breach).toHaveProperty('alertSent');
      expect(breach).toHaveProperty('escalated');
    });

    it('should generate unique event IDs', () => {
      const breach1 = createMockSLABreachEvent();
      const breach2 = createMockSLABreachEvent();

      expect(breach1.eventId).not.toBe(breach2.eventId);
    });

    it('should allow overriding severity', () => {
      const warningBreach = createMockSLABreachEvent({ severity: 'warning' });
      const criticalBreach = createMockSLABreachEvent({ severity: 'critical' });

      expect(warningBreach.severity).toBe('warning');
      expect(criticalBreach.severity).toBe('critical');
    });

    it('should allow setting resolved state', () => {
      const resolvedBreach = createMockSLABreachEvent({
        resolvedAt: new Date(),
        durationSeconds: 300,
      });

      expect(resolvedBreach.resolvedAt).toBeInstanceOf(Date);
      expect(resolvedBreach.durationSeconds).toBe(300);
    });

    it('should have detectedAt as Date', () => {
      const breach = createMockSLABreachEvent();

      expect(breach.detectedAt).toBeInstanceOf(Date);
    });
  });
});

describe('Queue Dashboard Business Logic', () => {
  describe('Compliance Rate Calculation', () => {
    it('should calculate compliance rate correctly', () => {
      const compliantQueues = 4;
      const totalQueues = 5;
      const complianceRate = (compliantQueues / totalQueues) * 100;

      expect(complianceRate).toBe(80);
    });

    it('should return 100% when all queues are compliant', () => {
      const compliantQueues = 5;
      const totalQueues = 5;
      const complianceRate = (compliantQueues / totalQueues) * 100;

      expect(complianceRate).toBe(100);
    });

    it('should return 0% when no queues are compliant', () => {
      const compliantQueues = 0;
      const totalQueues = 5;
      const complianceRate = (compliantQueues / totalQueues) * 100;

      expect(complianceRate).toBe(0);
    });

    it('should handle zero total queues', () => {
      const compliantQueues = 0;
      const totalQueues = 0;
      const complianceRate = totalQueues > 0 ? (compliantQueues / totalQueues) * 100 : 100;

      expect(complianceRate).toBe(100);
    });
  });

  describe('Service Level Thresholds', () => {
    it('should identify normal service level (>=80%)', () => {
      const getStatus = (level: number) => {
        if (level >= 80) return 'ok';
        if (level >= 70) return 'warning';
        return 'critical';
      };

      expect(getStatus(95)).toBe('ok');
      expect(getStatus(80)).toBe('ok');
    });

    it('should identify warning service level (70-79%)', () => {
      const getStatus = (level: number) => {
        if (level >= 80) return 'ok';
        if (level >= 70) return 'warning';
        return 'critical';
      };

      expect(getStatus(75)).toBe('warning');
      expect(getStatus(70)).toBe('warning');
    });

    it('should identify critical service level (<70%)', () => {
      const getStatus = (level: number) => {
        if (level >= 80) return 'ok';
        if (level >= 70) return 'warning';
        return 'critical';
      };

      expect(getStatus(65)).toBe('critical');
      expect(getStatus(0)).toBe('critical');
    });
  });

  describe('Wait Time Formatting', () => {
    it('should format seconds correctly', () => {
      const formatWaitTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        if (minutes < 60) {
          return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
        }
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
      };

      expect(formatWaitTime(30)).toBe('30s');
      expect(formatWaitTime(60)).toBe('1m');
      expect(formatWaitTime(90)).toBe('1m 30s');
      expect(formatWaitTime(3600)).toBe('1h 0m');
      expect(formatWaitTime(3660)).toBe('1h 1m');
    });
  });
});
