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
        FROM projection_checkpoints pc
        WHERE pc.projection_name = $1
      `,
        [projectionName]
      );

      if (result.rows.length === 0) {
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
}
