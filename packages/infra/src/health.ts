/**
 * Health Check Utilities
 *
 * Provides standardized health check responses for services.
 * Compatible with Kubernetes liveness/readiness probes and load balancers.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Health status values
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Individual dependency check result
 */
export interface DependencyCheck {
  name: string;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  lastChecked: Date;
}

/**
 * Full health check response
 */
export interface HealthCheckResponse {
  status: HealthStatus;
  version: string;
  uptime: number;
  timestamp: Date;
  dependencies: DependencyCheck[];
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Service version string */
  version: string;
  /** Process start time */
  startTime: Date;
  /** Timeout for individual checks in ms */
  checkTimeout?: number;
}

// =============================================================================
// Health Check Implementation
// =============================================================================

/**
 * Health check function type
 */
export type HealthChecker = () => Promise<DependencyCheck>;

/**
 * Create a health check manager
 *
 * @param config - Health check configuration
 * @returns Health check manager with add/check methods
 *
 * @example
 * ```typescript
 * const health = createHealthCheck({ version: '1.0.0', startTime: new Date() });
 *
 * health.addCheck('database', async () => {
 *   const start = Date.now();
 *   await db.query('SELECT 1');
 *   return { name: 'database', status: 'healthy', latencyMs: Date.now() - start };
 * });
 *
 * const response = await health.check();
 * ```
 */
export function createHealthCheck(config: HealthCheckConfig) {
  const checkers = new Map<string, HealthChecker>();
  const { version, startTime, checkTimeout = 5000 } = config;

  /**
   * Add a health checker for a dependency
   */
  function addCheck(name: string, checker: HealthChecker): void {
    checkers.set(name, checker);
  }

  /**
   * Remove a health checker
   */
  function removeCheck(name: string): void {
    checkers.delete(name);
  }

  /**
   * Run all health checks with timeout
   */
  async function check(): Promise<HealthCheckResponse> {
    const dependencies: DependencyCheck[] = [];
    let overallStatus: HealthStatus = 'healthy';

    for (const [name, checker] of checkers) {
      try {
        const result = await Promise.race([
          checker(),
          new Promise<DependencyCheck>((_, reject) =>
            setTimeout(() => reject(new Error('Check timeout')), checkTimeout)
          ),
        ]);

        result.lastChecked = new Date();
        dependencies.push(result);

        if (result.status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        dependencies.push({
          name,
          status: 'unhealthy',
          message,
          lastChecked: new Date(),
        });
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      version,
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
      timestamp: new Date(),
      dependencies,
    };
  }

  /**
   * Quick liveness check (just returns ok if process is running)
   */
  function liveness(): { status: 'ok'; timestamp: Date } {
    return { status: 'ok', timestamp: new Date() };
  }

  /**
   * Readiness check (runs all dependency checks)
   */
  async function readiness(): Promise<{ ready: boolean; checks: DependencyCheck[] }> {
    const response = await check();
    return {
      ready: response.status !== 'unhealthy',
      checks: response.dependencies,
    };
  }

  return {
    addCheck,
    removeCheck,
    check,
    liveness,
    readiness,
  };
}

// =============================================================================
// Common Health Checkers
// =============================================================================

/**
 * Create a database health checker
 *
 * @param queryFn - Function to execute a test query
 * @param name - Dependency name (default: 'database')
 */
export function createDatabaseChecker(
  queryFn: () => Promise<void>,
  name = 'database'
): HealthChecker {
  return async () => {
    const start = Date.now();
    try {
      await queryFn();
      return {
        name,
        status: 'healthy',
        latencyMs: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Database check failed';
      return {
        name,
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message,
        lastChecked: new Date(),
      };
    }
  };
}

/**
 * Create a Redis health checker
 *
 * @param pingFn - Function to ping Redis
 * @param name - Dependency name (default: 'redis')
 */
export function createRedisChecker(pingFn: () => Promise<string>, name = 'redis'): HealthChecker {
  return async () => {
    const start = Date.now();
    try {
      const response = await pingFn();
      if (response === 'PONG') {
        return {
          name,
          status: 'healthy',
          latencyMs: Date.now() - start,
          lastChecked: new Date(),
        };
      }
      return {
        name,
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: `Unexpected response: ${response}`,
        lastChecked: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Redis check failed';
      return {
        name,
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message,
        lastChecked: new Date(),
      };
    }
  };
}

/**
 * Create an HTTP endpoint health checker
 *
 * @param url - URL to check
 * @param name - Dependency name
 * @param expectedStatus - Expected HTTP status code (default: 200)
 */
export function createHttpChecker(url: string, name: string, expectedStatus = 200): HealthChecker {
  return async () => {
    const start = Date.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - start;

      if (response.status === expectedStatus) {
        return {
          name,
          status: 'healthy',
          latencyMs,
          lastChecked: new Date(),
        };
      }

      return {
        name,
        status: response.status >= 500 ? 'unhealthy' : 'degraded',
        latencyMs,
        message: `HTTP ${response.status}`,
        lastChecked: new Date(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'HTTP check failed';
      return {
        name,
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message,
        lastChecked: new Date(),
      };
    }
  };
}
