/**
 * Projection Health Monitoring
 *
 * Monitors the health of CQRS projections by tracking:
 * - Last processed event ID and timestamp
 * - Lag in seconds since last event
 * - Number of events behind
 * - Error status
 *
 * Used by health checks to detect stale projections that
 * could indicate processing failures or infrastructure issues.
 */

import type { Pool } from 'pg';

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectionHealth {
  /** Projection name */
  name: string;
  /** Last processed event ID, null if never processed */
  lastEventId: string | null;
  /** Timestamp of last processed event */
  lastEventTimestamp: Date | null;
  /** Seconds since last event was processed */
  lagSeconds: number;
  /** Whether projection is considered stale (lag > threshold) */
  isStale: boolean;
  /** Number of events behind the latest event */
  eventsBehind: number;
  /** Current status */
  status: 'running' | 'paused' | 'error' | 'rebuilding' | 'unknown';
  /** Last error message if any */
  lastError: string | null;
  /** When the last error occurred */
  lastErrorAt: Date | null;
  /** Total events processed by this projection */
  eventsProcessed: number;
}

export interface ProjectionHealthSummary {
  /** Overall health status */
  healthy: boolean;
  /** Number of healthy projections */
  healthyCount: number;
  /** Number of stale projections */
  staleCount: number;
  /** Number of projections in error state */
  errorCount: number;
  /** Individual projection health */
  projections: ProjectionHealth[];
  /** When the check was performed */
  checkedAt: Date;
}

export interface ProjectionHealthConfig {
  /** Seconds after which a projection is considered stale (default: 300 = 5 minutes) */
  staleThresholdSeconds: number;
  /** Maximum events behind before considered critical (default: 1000) */
  criticalEventsBehind: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_PROJECTION_HEALTH_CONFIG: ProjectionHealthConfig = {
  staleThresholdSeconds: 300, // 5 minutes
  criticalEventsBehind: 1000,
};

// ============================================================================
// PROJECTION HEALTH MONITOR
// ============================================================================

export class ProjectionHealthMonitor {
  private readonly config: ProjectionHealthConfig;

  constructor(
    private readonly pool: Pool,
    config: Partial<ProjectionHealthConfig> = {}
  ) {
    this.config = { ...DEFAULT_PROJECTION_HEALTH_CONFIG, ...config };
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
   */
  async checkHealth(projectionName: string): Promise<ProjectionHealth> {
    try {
      const result = await this.pool.query<{
        projection_name: string;
        last_event_id: string | null;
        last_event_timestamp: Date | null;
        events_processed: string;
        status: string;
        last_error: string | null;
        last_error_at: Date | null;
        lag_seconds: string | null;
        events_behind: string;
      }>(
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
          pc.events_processed,
          pc.status,
          pc.last_error,
          pc.last_error_at,
          EXTRACT(EPOCH FROM (NOW() - pc.last_event_timestamp))::BIGINT as lag_seconds,
          COALESCE(
            (SELECT COUNT(*) FROM domain_events WHERE created_at > COALESCE(pc.last_event_timestamp, '1970-01-01')),
            0
          ) as events_behind
          EXTRACT(EPOCH FROM (NOW() - pc.last_event_timestamp)) as lag_seconds,
          (SELECT COUNT(*) FROM domain_events WHERE id > pc.last_event_id) as events_behind
        FROM projection_checkpoints pc
        WHERE pc.projection_name = $1
      `,
        [projectionName]
      );

      if (result.rows.length === 0) {
      // Projection never processed any events
      if (result.rows.length === 0) {
        logger.warn({ projectionName }, 'Projection has no checkpoint - never processed events');
        return {
          name: projectionName,
          lastEventId: null,
          lastEventTimestamp: null,
          lagSeconds: Infinity,
          isStale: true,
          eventsBehind: -1,
          status: 'unknown',
          lastError: 'Projection checkpoint not found',
          lastErrorAt: null,
          eventsProcessed: 0,
        };
      }

      // Safe to access after length check above
      const row = result.rows[0]!;
      const lagSeconds = row.lag_seconds !== null ? Number(row.lag_seconds) : Infinity;
      const eventsBehind = Number(row.events_behind);

      return {
        name: projectionName,
        lastEventId: row.last_event_id,
        lastEventTimestamp: row.last_event_timestamp,
        lagSeconds: Number.isFinite(lagSeconds) ? lagSeconds : Infinity,
        isStale: lagSeconds > this.config.staleThresholdSeconds,
        eventsBehind,
        status: row.status as ProjectionHealth['status'],
        lastError: row.last_error,
        lastErrorAt: row.last_error_at,
        eventsProcessed: Number(row.events_processed),
      };
    } catch (error) {
      // If the table doesn't exist, return unknown status
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('relation "projection_checkpoints" does not exist')) {
        return {
          name: projectionName,
          lastEventId: null,
          lastEventTimestamp: null,
          lagSeconds: 0,
          isStale: false,
          eventsBehind: 0,
          status: 'unknown',
          lastError: 'projection_checkpoints table not found - run migrations',
          lastErrorAt: null,
          eventsProcessed: 0,
        };
      }
      throw error;
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
   */
  async checkAllProjections(): Promise<ProjectionHealthSummary> {
    try {
      const result = await this.pool.query<{
        projection_name: string;
        last_event_id: string | null;
        last_event_timestamp: Date | null;
        events_processed: string;
        status: string;
        last_error: string | null;
        last_error_at: Date | null;
        lag_seconds: string | null;
        events_behind: string;
      }>(`
        SELECT
          pc.projection_name,
          pc.last_event_id,
          pc.last_event_timestamp,
          pc.events_processed,
          pc.status,
          pc.last_error,
          pc.last_error_at,
          EXTRACT(EPOCH FROM (NOW() - pc.last_event_timestamp))::BIGINT as lag_seconds,
          COALESCE(
            (SELECT COUNT(*) FROM domain_events WHERE created_at > COALESCE(pc.last_event_timestamp, '1970-01-01')),
            0
          ) as events_behind
        FROM projection_checkpoints pc
        ORDER BY pc.projection_name
      `);

      const projections: ProjectionHealth[] = result.rows.map((row) => {
        const lagSeconds = row.lag_seconds !== null ? Number(row.lag_seconds) : Infinity;
        return {
          name: row.projection_name,
          lastEventId: row.last_event_id,
          lastEventTimestamp: row.last_event_timestamp,
          lagSeconds: Number.isFinite(lagSeconds) ? lagSeconds : Infinity,
          isStale: lagSeconds > this.config.staleThresholdSeconds,
          eventsBehind: Number(row.events_behind),
          status: row.status as ProjectionHealth['status'],
          lastError: row.last_error,
          lastErrorAt: row.last_error_at,
          eventsProcessed: Number(row.events_processed),
        };
      });

      const staleCount = projections.filter((p) => p.isStale).length;
      const errorCount = projections.filter((p) => p.status === 'error').length;
      const healthyCount = projections.length - staleCount - errorCount;

      return {
        healthy: staleCount === 0 && errorCount === 0,
        healthyCount,
        staleCount,
        errorCount,
        projections,
        checkedAt: new Date(),
      };
    } catch (error) {
      // If the table doesn't exist, return empty but healthy (not yet set up)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('relation "projection_checkpoints" does not exist')) {
        return {
          healthy: true,
          healthyCount: 0,
          staleCount: 0,
          errorCount: 0,
          projections: [],
          checkedAt: new Date(),
        };
      }
      throw error;
    }
  }

  /**
   * Update projection checkpoint after processing events
   */
  async updateCheckpoint(
    projectionName: string,
    lastEventId: string,
    lastEventTimestamp: Date,
    eventsProcessed = 1
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO projection_checkpoints (
        projection_name, last_event_id, last_event_timestamp, events_processed, status
      ) VALUES ($1, $2, $3, $4, 'running')
      ON CONFLICT (projection_name) DO UPDATE SET
        last_event_id = EXCLUDED.last_event_id,
        last_event_timestamp = EXCLUDED.last_event_timestamp,
        events_processed = projection_checkpoints.events_processed + $4,
        status = 'running',
        last_error = NULL,
        last_error_at = NULL,
        updated_at = NOW()
    `,
      [projectionName, lastEventId, lastEventTimestamp, eventsProcessed]
    );
  }

  /**
   * Record an error for a projection
   */
  async recordError(projectionName: string, error: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE projection_checkpoints
      SET
        status = 'error',
        last_error = $2,
        last_error_at = NOW(),
        updated_at = NOW()
      WHERE projection_name = $1
    `,
      [projectionName, error]
    );
  }

  /**
   * Mark a projection as paused
   */
  async pauseProjection(projectionName: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE projection_checkpoints
      SET status = 'paused', updated_at = NOW()
      WHERE projection_name = $1
    `,
      [projectionName]
    );
  }

  /**
   * Resume a paused projection
   */
  async resumeProjection(projectionName: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE projection_checkpoints
      SET status = 'running', updated_at = NOW()
      WHERE projection_name = $1
    `,
      [projectionName]
    );
  }

  /**
   * Get configuration
   */
  getConfig(): ProjectionHealthConfig {
    return { ...this.config };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a projection health monitor
 */
export function createProjectionHealthMonitor(
  pool: Pool,
  config?: Partial<ProjectionHealthConfig>
): ProjectionHealthMonitor {
  return new ProjectionHealthMonitor(pool, config);
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
