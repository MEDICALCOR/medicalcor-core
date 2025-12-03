/**
 * @fileoverview Projection Health Monitoring
 *
 * Monitors the health of CQRS projections by tracking event processing lag.
 * This helps detect stale or stuck projections that could cause data inconsistency.
 *
 * @module @medicalcor/core/cqrs/projection-health
 *
 * ## Usage
 *
 * ```typescript
 * import { ProjectionHealthMonitor } from '@medicalcor/core/cqrs/projection-health';
 * import { Pool } from 'pg';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const monitor = new ProjectionHealthMonitor(pool);
 *
 * // Check a specific projection
 * const health = await monitor.checkHealth('lead_stats');
 * if (health.isStale) {
 *   console.warn(`Projection ${health.name} is stale by ${health.lagSeconds}s`);
 * }
 *
 * // Check all projections
 * const allHealth = await monitor.checkAllProjections();
 * const staleProjections = allHealth.filter(h => h.isStale);
 * ```
 *
 * ## Integration with Prometheus
 *
 * ```typescript
 * // In a scheduled job (e.g., every 60 seconds)
 * const allHealth = await monitor.checkAllProjections();
 * for (const health of allHealth) {
 *   projectionLagGauge.set(
 *     { projection_name: health.name },
 *     health.lagSeconds
 *   );
 * }
 * ```
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';

const logger = createLogger({ name: 'projection-health' });

/**
 * Health status of a single projection
 */
export interface ProjectionHealth {
  /** Name of the projection (e.g., 'lead_stats', 'patient_activity') */
  name: string;

  /** ID of the last processed event (null if never processed) */
  lastEventId: string | null;

  /** Timestamp of the last processed event (null if never processed) */
  lastEventTimestamp: Date | null;

  /** Time lag in seconds between now and last processed event */
  lagSeconds: number;

  /** Whether this projection is considered stale */
  isStale: boolean;

  /** Number of events behind the latest event in the store */
  eventsBehind: number;
}

/**
 * Configuration for the projection health monitor
 */
export interface ProjectionHealthConfig {
  /** Database connection pool */
  pool: Pool;

  /**
   * Threshold in seconds after which a projection is considered stale
   * @default 300 (5 minutes)
   */
  staleThresholdSeconds?: number;
}

/**
 * Monitors health and lag of CQRS projections
 *
 * Tracks each projection's last processed event and calculates lag.
 * A projection is considered "stale" if it hasn't processed events within
 * the configured threshold.
 */
export class ProjectionHealthMonitor {
  private readonly pool: Pool;
  private readonly staleThresholdSeconds: number;

  constructor(config: ProjectionHealthConfig) {
    this.pool = config.pool;
    this.staleThresholdSeconds = config.staleThresholdSeconds ?? 300; // 5 minutes default
  }

  /**
   * Check health of a specific projection
   *
   * @param projectionName - Name of the projection to check
   * @returns Health status of the projection
   *
   * @example
   * ```typescript
   * const health = await monitor.checkHealth('lead_stats');
   * console.log(`Lag: ${health.lagSeconds}s, Events behind: ${health.eventsBehind}`);
   * ```
   */
  async checkHealth(projectionName: string): Promise<ProjectionHealth> {
    try {
      // Query the checkpoint for this projection
      const result = await this.pool.query(
        `
        SELECT
          pc.projection_name,
          pc.last_event_id,
          pc.last_event_timestamp,
          EXTRACT(EPOCH FROM (NOW() - pc.last_event_timestamp)) as lag_seconds,
          (SELECT COUNT(*) FROM domain_events WHERE id > pc.last_event_id) as events_behind
        FROM projection_checkpoints pc
        WHERE pc.projection_name = $1
      `,
        [projectionName]
      );

      // Projection never processed any events
      if (result.rows.length === 0) {
        logger.warn({ projectionName }, 'Projection has no checkpoint - never processed events');
        return {
          name: projectionName,
          lastEventId: null,
          lastEventTimestamp: null,
          lagSeconds: Infinity,
          isStale: true,
          eventsBehind: -1, // Unknown, could be all events
        };
      }

      const row = result.rows[0] as {
        projection_name: string;
        last_event_id: string;
        last_event_timestamp: Date;
        lag_seconds: string;
        events_behind: string;
      };
      const lagSeconds = parseFloat(row.lag_seconds) || 0;
      const eventsBehind = parseInt(row.events_behind, 10) || 0;

      const health: ProjectionHealth = {
        name: row.projection_name,
        lastEventId: row.last_event_id,
        lastEventTimestamp: row.last_event_timestamp,
        lagSeconds,
        isStale: lagSeconds > this.staleThresholdSeconds,
        eventsBehind,
      };

      if (health.isStale) {
        logger.warn(
          {
            projectionName,
            lagSeconds,
            eventsBehind,
            threshold: this.staleThresholdSeconds,
          },
          'Projection is STALE'
        );
      }

      return health;
    } catch (error) {
      logger.error({ error, projectionName }, 'Failed to check projection health');
      // Return worst-case health status on error
      return {
        name: projectionName,
        lastEventId: null,
        lastEventTimestamp: null,
        lagSeconds: Infinity,
        isStale: true,
        eventsBehind: -1,
      };
    }
  }

  /**
   * Check health of all registered projections
   *
   * @returns Array of health statuses for all projections
   *
   * @example
   * ```typescript
   * const allHealth = await monitor.checkAllProjections();
   * const stale = allHealth.filter(h => h.isStale);
   * if (stale.length > 0) {
   *   console.error(`${stale.length} stale projections detected!`);
   * }
   * ```
   */
  async checkAllProjections(): Promise<ProjectionHealth[]> {
    try {
      // Get all distinct projection names from checkpoints
      const result = await this.pool.query(`
        SELECT DISTINCT projection_name FROM projection_checkpoints
        ORDER BY projection_name
      `);

      if (result.rows.length === 0) {
        logger.warn('No projections found in checkpoint table');
        return [];
      }

      // Check health of each projection
      const healthChecks = result.rows.map((row: { projection_name: string }) =>
        this.checkHealth(row.projection_name)
      );

      return await Promise.all(healthChecks);
    } catch (error) {
      logger.error({ error }, 'Failed to check all projections');
      return [];
    }
  }

  /**
   * Get summary statistics of projection health
   *
   * @returns Summary with counts of healthy, stale, and total projections
   *
   * @example
   * ```typescript
   * const summary = await monitor.getSummary();
   * console.log(`${summary.staleCount}/${summary.totalCount} projections are stale`);
   * ```
   */
  async getSummary(): Promise<{
    totalCount: number;
    healthyCount: number;
    staleCount: number;
    maxLagSeconds: number;
    totalEventsBehind: number;
  }> {
    const allHealth = await this.checkAllProjections();

    // Filter out Infinity values when calculating max lag
    const finitelagSeconds = allHealth
      .map((h) => h.lagSeconds)
      .filter((lag) => lag !== Infinity && !Number.isNaN(lag));

    const summary = {
      totalCount: allHealth.length,
      healthyCount: allHealth.filter((h) => !h.isStale).length,
      staleCount: allHealth.filter((h) => h.isStale).length,
      maxLagSeconds: finitelagSeconds.length > 0 ? Math.max(...finitelagSeconds) : 0,
      totalEventsBehind: allHealth.reduce((sum, h) => sum + Math.max(h.eventsBehind, 0), 0),
    };

    logger.info(
      {
        total: summary.totalCount,
        healthy: summary.healthyCount,
        stale: summary.staleCount,
        maxLag: summary.maxLagSeconds,
      },
      'Projection health summary'
    );

    return summary;
  }
}

/**
 * Create a projection health monitor instance
 *
 * @param config - Monitor configuration
 * @returns ProjectionHealthMonitor instance
 *
 * @example
 * ```typescript
 * import { createProjectionHealthMonitor } from '@medicalcor/core/cqrs/projection-health';
 * import { Pool } from 'pg';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const monitor = createProjectionHealthMonitor({
 *   pool,
 *   staleThresholdSeconds: 600, // 10 minutes
 * });
 * ```
 */
export function createProjectionHealthMonitor(
  config: ProjectionHealthConfig
): ProjectionHealthMonitor {
  return new ProjectionHealthMonitor(config);
}
