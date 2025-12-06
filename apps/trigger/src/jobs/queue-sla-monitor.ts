import { schedules, logger } from '@trigger.dev/sdk/v3';
import * as crypto from 'crypto';
import {
  createEventStore,
  createInMemoryEventStore,
  createDatabaseClient,
  type DatabasePool,
} from '@medicalcor/core';
import { createFlexClient, getFlexCredentials } from '@medicalcor/integrations';
import type { QueueSLAConfig, QueueSLAStatus, SLABreachEvent } from '@medicalcor/types';

/**
 * Queue SLA Monitor (H6)
 *
 * Monitors call center queue SLAs and triggers alerts when thresholds are breached.
 * Runs every minute to provide near real-time monitoring.
 *
 * Features:
 * - Monitors wait times, queue sizes, and agent availability
 * - Detects SLA breaches and sends alerts
 * - Stores breach events for reporting
 * - Integrates with Twilio Flex for real-time metrics
 *
 * @module @medicalcor/trigger/jobs/queue-sla-monitor
 */

// ============================================================================
// TYPES
// ============================================================================

type SLABreachType =
  | 'wait_time_exceeded'
  | 'queue_size_exceeded'
  | 'abandon_rate_exceeded'
  | 'agent_availability_low'
  | 'service_level_missed';

interface MonitoringResult {
  success: boolean;
  queuesMonitored: number;
  breachesDetected: number;
  alertsSent: number;
  processingTimeMs: number;
  correlationId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default SLA configuration if not found in database */
const DEFAULT_SLA_CONFIG: Omit<QueueSLAConfig, 'queueSid' | 'queueName'> = {
  targetAnswerTime: 30, // 30 seconds
  maxWaitTime: 120, // 2 minutes
  criticalWaitTime: 300, // 5 minutes
  maxQueueSize: 10,
  criticalQueueSize: 20,
  maxAbandonRate: 5, // 5%
  minAvailableAgents: 1,
  targetAgentUtilization: 80,
  serviceLevelTarget: 80, // 80% answered within target time
  alertEnabled: true,
  escalationEnabled: true,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateCorrelationId(): string {
  return `sla_monitor_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const db = databaseUrl ? createDatabaseClient(databaseUrl) : null;

  const eventStore = databaseUrl
    ? createEventStore({ source: 'queue-sla-monitor', connectionString: databaseUrl })
    : createInMemoryEventStore('queue-sla-monitor');

  const flexCredentials = getFlexCredentials();
  const flex = flexCredentials ? createFlexClient(flexCredentials) : null;

  return { db, eventStore, flex };
}

/**
 * Load SLA configurations from database
 */
async function loadSLAConfigs(db: DatabasePool): Promise<Map<string, QueueSLAConfig>> {
  const configs = new Map<string, QueueSLAConfig>();

  try {
    const result = await db.query<{
      queue_sid: string;
      queue_name: string;
      config: QueueSLAConfig;
    }>(`
      SELECT queue_sid, queue_name, config
      FROM queue_sla_configs
      WHERE is_active = true
    `);

    for (const row of result.rows) {
      configs.set(row.queue_sid, {
        queueSid: row.queue_sid,
        queueName: row.queue_name,
        ...DEFAULT_SLA_CONFIG,
        ...row.config,
      });
    }
  } catch (error) {
    // Table might not exist yet, use defaults
    logger.warn('Failed to load SLA configs from database, using defaults', { error });
  }

  return configs;
}

/**
 * Evaluate SLA status for a queue
 */
function evaluateSLAStatus(
  queueSid: string,
  queueName: string,
  metrics: {
    currentQueueSize: number;
    longestWaitTime: number;
    averageWaitTime: number;
    availableAgents: number;
    busyAgents: number;
    totalAgents: number;
    callsHandledToday: number;
    callsAbandonedToday: number;
    serviceLevel: number;
  },
  config: QueueSLAConfig
): QueueSLAStatus {
  const breaches: SLABreachType[] = [];
  let severity: 'ok' | 'warning' | 'critical' = 'ok';

  // Check wait time
  if (metrics.longestWaitTime > config.criticalWaitTime) {
    breaches.push('wait_time_exceeded');
    severity = 'critical';
  } else if (metrics.longestWaitTime > config.maxWaitTime) {
    breaches.push('wait_time_exceeded');
    severity = 'warning';
  }

  // Check queue size
  if (metrics.currentQueueSize > config.criticalQueueSize) {
    breaches.push('queue_size_exceeded');
    severity = 'critical';
  } else if (metrics.currentQueueSize > config.maxQueueSize) {
    breaches.push('queue_size_exceeded');
    if (severity === 'ok') severity = 'warning';
  }

  // Check agent availability
  if (metrics.availableAgents < config.minAvailableAgents && metrics.currentQueueSize > 0) {
    breaches.push('agent_availability_low');
    if (severity === 'ok') severity = 'warning';
  }

  // Check abandonment rate
  const totalCalls = metrics.callsHandledToday + metrics.callsAbandonedToday;
  const abandonRate = totalCalls > 0 ? (metrics.callsAbandonedToday / totalCalls) * 100 : 0;
  if (abandonRate > config.maxAbandonRate && totalCalls >= 10) {
    breaches.push('abandon_rate_exceeded');
    if (severity === 'ok') severity = 'warning';
  }

  // Check service level
  if (metrics.serviceLevel < config.serviceLevelTarget && totalCalls >= 10) {
    breaches.push('service_level_missed');
    if (severity === 'ok') severity = 'warning';
  }

  // Calculate agent utilization
  const agentUtilization =
    metrics.totalAgents > 0 ? (metrics.busyAgents / metrics.totalAgents) * 100 : 0;

  return {
    queueSid,
    queueName,
    currentQueueSize: metrics.currentQueueSize,
    longestWaitTime: metrics.longestWaitTime,
    averageWaitTime: metrics.averageWaitTime,
    averageHandleTime: 0, // Would need historical data
    availableAgents: metrics.availableAgents,
    busyAgents: metrics.busyAgents,
    totalAgents: metrics.totalAgents,
    agentUtilization,
    callsHandledToday: metrics.callsHandledToday,
    callsAbandonedToday: metrics.callsAbandonedToday,
    abandonRate,
    serviceLevel: metrics.serviceLevel,
    isCompliant: breaches.length === 0,
    breaches,
    severity,
    lastUpdated: new Date(),
  };
}

/**
 * Store SLA status in database
 */
async function storeSLAStatus(db: DatabasePool, status: QueueSLAStatus): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO queue_sla_status (
        queue_sid, queue_name, current_queue_size, longest_wait_time,
        average_wait_time, available_agents, busy_agents, total_agents,
        agent_utilization, calls_handled_today, calls_abandoned_today,
        abandon_rate, service_level, is_compliant, breaches, severity, last_updated
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
      ON CONFLICT (queue_sid) DO UPDATE SET
        queue_name = EXCLUDED.queue_name,
        current_queue_size = EXCLUDED.current_queue_size,
        longest_wait_time = EXCLUDED.longest_wait_time,
        average_wait_time = EXCLUDED.average_wait_time,
        available_agents = EXCLUDED.available_agents,
        busy_agents = EXCLUDED.busy_agents,
        total_agents = EXCLUDED.total_agents,
        agent_utilization = EXCLUDED.agent_utilization,
        calls_handled_today = EXCLUDED.calls_handled_today,
        calls_abandoned_today = EXCLUDED.calls_abandoned_today,
        abandon_rate = EXCLUDED.abandon_rate,
        service_level = EXCLUDED.service_level,
        is_compliant = EXCLUDED.is_compliant,
        breaches = EXCLUDED.breaches,
        severity = EXCLUDED.severity,
        last_updated = EXCLUDED.last_updated
      `,
      [
        status.queueSid,
        status.queueName,
        status.currentQueueSize,
        status.longestWaitTime,
        status.averageWaitTime,
        status.availableAgents,
        status.busyAgents,
        status.totalAgents,
        status.agentUtilization,
        status.callsHandledToday,
        status.callsAbandonedToday,
        status.abandonRate,
        status.serviceLevel,
        status.isCompliant,
        JSON.stringify(status.breaches),
        status.severity,
        status.lastUpdated,
      ]
    );
  } catch (error) {
    logger.warn('Failed to store SLA status', { queueSid: status.queueSid, error });
  }
}

/**
 * Record SLA breach event
 */
async function recordBreachEvent(
  db: DatabasePool,
  breach: SLABreachEvent,
  correlationId: string
): Promise<void> {
  try {
    await db.query(
      `
      INSERT INTO queue_sla_breaches (
        id, queue_sid, queue_name, breach_type, severity,
        threshold_value, current_value, affected_calls,
        detected_at, alert_sent, escalated, correlation_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      `,
      [
        breach.eventId,
        breach.queueSid,
        breach.queueName,
        breach.breachType,
        breach.severity,
        breach.threshold,
        breach.currentValue,
        breach.affectedCalls ?? 0,
        breach.detectedAt,
        breach.alertSent,
        breach.escalated,
        correlationId,
      ]
    );
  } catch (error) {
    logger.warn('Failed to record breach event', { breachId: breach.eventId, error });
  }
}

/**
 * Emit SLA event
 */
async function emitSLAEvent(
  eventStore: {
    emit: (input: {
      type: string;
      correlationId: string;
      payload: Record<string, unknown>;
      aggregateType?: string;
    }) => Promise<unknown>;
  },
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await eventStore.emit({
      type,
      correlationId: (payload.correlationId as string) ?? generateCorrelationId(),
      payload,
      aggregateType: 'queue_sla',
    });
  } catch (error) {
    logger.warn('Failed to emit SLA event', { type, error });
  }
}

// ============================================================================
// CRON JOB: SLA Monitor (runs every minute)
// ============================================================================

/**
 * Monitor queue SLAs every minute
 *
 * Checks all configured queues for SLA compliance and triggers
 * alerts when thresholds are breached.
 */
export const queueSLAMonitor = schedules.task({
  id: 'queue-sla-monitor',
  cron: '* * * * *', // Every minute
  run: async (): Promise<MonitoringResult> => {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    logger.info('Starting SLA monitoring cycle', { correlationId });

    const { db, eventStore, flex } = getClients();

    if (!flex) {
      logger.warn('Flex client not configured, skipping SLA monitoring', { correlationId });
      return {
        success: false,
        queuesMonitored: 0,
        breachesDetected: 0,
        alertsSent: 0,
        processingTimeMs: 0,
        correlationId,
      };
    }

    let queuesMonitored = 0;
    let breachesDetected = 0;
    let alertsSent = 0;

    try {
      // Load SLA configurations
      const slaConfigs = db ? await loadSLAConfigs(db) : new Map<string, QueueSLAConfig>();

      // Get all queues from Flex
      const queues = await flex.listQueues();

      // Get worker stats for agent metrics
      const workerStats = await flex.getWorkerStats();

      for (const queue of queues) {
        queuesMonitored++;

        // Get queue-specific stats
        const queueStats = await flex.getQueueStats(queue.queueSid);

        // Get or create SLA config for this queue
        const config: QueueSLAConfig = slaConfigs.get(queue.queueSid) ?? {
          queueSid: queue.queueSid,
          queueName: queue.friendlyName,
          ...DEFAULT_SLA_CONFIG,
        };

        // Evaluate SLA status
        const status = evaluateSLAStatus(queue.queueSid, queue.friendlyName, {
          currentQueueSize: queueStats.currentSize,
          longestWaitTime: queueStats.longestWaitTime,
          averageWaitTime: queueStats.averageWaitTime,
          availableAgents: workerStats.available,
          busyAgents: workerStats.busy,
          totalAgents: workerStats.totalWorkers,
          callsHandledToday: queueStats.tasksToday,
          callsAbandonedToday: 0, // Would need separate tracking
          serviceLevel: 85, // Would need historical calculation
        }, config);

        // Store status
        if (db) {
          await storeSLAStatus(db, status);
        }

        // Handle breaches
        if (status.breaches.length > 0 && config.alertEnabled) {
          for (const breachType of status.breaches) {
            breachesDetected++;

            // Determine threshold and current value based on breach type
            let threshold = 0;
            let currentValue = 0;

            switch (breachType) {
              case 'wait_time_exceeded':
                threshold = status.severity === 'critical' ? config.criticalWaitTime : config.maxWaitTime;
                currentValue = status.longestWaitTime;
                break;
              case 'queue_size_exceeded':
                threshold = status.severity === 'critical' ? config.criticalQueueSize : config.maxQueueSize;
                currentValue = status.currentQueueSize;
                break;
              case 'abandon_rate_exceeded':
                threshold = config.maxAbandonRate;
                currentValue = status.abandonRate;
                break;
              case 'agent_availability_low':
                threshold = config.minAvailableAgents;
                currentValue = status.availableAgents;
                break;
              case 'service_level_missed':
                threshold = config.serviceLevelTarget;
                currentValue = status.serviceLevel;
                break;
            }

            const breach: SLABreachEvent = {
              eventId: crypto.randomUUID(),
              queueSid: queue.queueSid,
              queueName: queue.friendlyName,
              breachType,
              severity: status.severity === 'critical' ? 'critical' : 'warning',
              threshold,
              currentValue,
              affectedCalls: status.currentQueueSize,
              detectedAt: new Date(),
              alertSent: true,
              escalated: config.escalationEnabled && status.severity === 'critical',
            };

            // Record breach
            if (db) {
              await recordBreachEvent(db, breach, correlationId);
            }

            // Emit breach event
            await emitSLAEvent(eventStore, 'sla.breach.detected', {
              ...breach,
              correlationId,
            });

            alertsSent++;

            logger.warn('SLA breach detected', {
              queueSid: queue.queueSid,
              queueName: queue.friendlyName,
              breachType,
              severity: status.severity,
              threshold,
              currentValue,
              correlationId,
            });
          }
        }

        // Log status
        if (status.severity !== 'ok') {
          logger.info('Queue SLA status', {
            queueSid: queue.queueSid,
            queueName: queue.friendlyName,
            severity: status.severity,
            queueSize: status.currentQueueSize,
            longestWait: status.longestWaitTime,
            availableAgents: status.availableAgents,
            correlationId,
          });
        }
      }

      // Emit monitoring completed event
      await emitSLAEvent(eventStore, 'sla.monitoring.completed', {
        queuesMonitored,
        breachesDetected,
        alertsSent,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      logger.info('SLA monitoring cycle completed', {
        queuesMonitored,
        breachesDetected,
        alertsSent,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: true,
        queuesMonitored,
        breachesDetected,
        alertsSent,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    } catch (error) {
      logger.error('SLA monitoring failed', { error, correlationId });

      await emitSLAEvent(eventStore, 'sla.monitoring.failed', {
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });

      return {
        success: false,
        queuesMonitored,
        breachesDetected,
        alertsSent,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      };
    } finally {
      if (db) {
        try {
          await db.end();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  },
});

// ============================================================================
// CRON JOB: Daily SLA Report
// ============================================================================

/**
 * Generate daily SLA report at 6 AM
 */
export const dailySLAReport = schedules.task({
  id: 'daily-sla-report',
  cron: '0 6 * * *', // 6:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Generating daily SLA report', { correlationId });

    const { db, eventStore } = getClients();

    if (!db) {
      logger.warn('Database not configured, skipping SLA report', { correlationId });
      return { success: false, reason: 'Database not configured' };
    }

    try {
      // Calculate report period (previous day)
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);

      // Get breach summary for the period
      const breachResult = await db.query<{
        queue_sid: string;
        queue_name: string;
        breach_count: string;
        critical_count: string;
      }>(`
        SELECT
          queue_sid,
          queue_name,
          COUNT(*) as breach_count,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_count
        FROM queue_sla_breaches
        WHERE detected_at >= $1 AND detected_at < $2
        GROUP BY queue_sid, queue_name
      `, [periodStart, periodEnd]);

      const queueBreaches = breachResult.rows.map(row => ({
        queueSid: row.queue_sid,
        queueName: row.queue_name,
        totalBreaches: parseInt(row.breach_count, 10),
        criticalBreaches: parseInt(row.critical_count, 10),
      }));

      const totalBreaches = queueBreaches.reduce((sum, q) => sum + q.totalBreaches, 0);
      const totalCritical = queueBreaches.reduce((sum, q) => sum + q.criticalBreaches, 0);

      // Emit report event
      await emitSLAEvent(eventStore, 'sla.report.generated', {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        periodType: 'daily',
        totalBreaches,
        criticalBreaches: totalCritical,
        queueBreaches,
        correlationId,
      });

      logger.info('Daily SLA report generated', {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalBreaches,
        criticalBreaches: totalCritical,
        correlationId,
      });

      return {
        success: true,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalBreaches,
        criticalBreaches: totalCritical,
        queueCount: queueBreaches.length,
      };
    } catch (error) {
      logger.error('Failed to generate daily SLA report', { error, correlationId });
      return { success: false, error: String(error) };
    } finally {
      try {
        await db.end();
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});
