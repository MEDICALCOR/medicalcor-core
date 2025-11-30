/**
 * @module architecture/observability/health
 *
 * Health Check Infrastructure
 * ===========================
 *
 * Deep health checks for all system components.
 */

// ============================================================================
// HEALTH CHECK TYPES
// ============================================================================

export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly timestamp: string;
  readonly duration: number;
  readonly checks: ComponentHealth[];
  readonly version: string;
  readonly uptime: number;
}

export interface ComponentHealth {
  readonly name: string;
  readonly status: HealthStatus;
  readonly duration: number;
  readonly details?: Record<string, unknown>;
  readonly error?: string;
  readonly lastChecked: string;
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

// ============================================================================
// HEALTH CHECK INTERFACE
// ============================================================================

export interface HealthCheck {
  readonly name: string;
  readonly critical: boolean;
  readonly timeout: number;
  check(): Promise<HealthCheckResponse>;
}

export interface HealthCheckResponse {
  readonly healthy: boolean;
  readonly details?: Record<string, unknown>;
  readonly error?: string;
}

// ============================================================================
// HEALTH CHECK REGISTRY
// ============================================================================

export class HealthCheckRegistry {
  private checks = new Map<string, HealthCheck>();
  private startTime = Date.now();
  private version: string;

  constructor(version = '0.0.0') {
    this.version = version;
  }

  /**
   * Register a health check
   */
  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Run all health checks
   */
  async checkAll(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const results: ComponentHealth[] = [];

    for (const check of this.checks.values()) {
      const result = await this.runCheck(check);
      results.push(result);
    }

    const duration = Date.now() - startTime;
    const overallStatus = this.calculateOverallStatus(results);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      duration,
      checks: results,
      version: this.version,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Run a single health check
   */
  async check(name: string): Promise<ComponentHealth | null> {
    const check = this.checks.get(name);
    if (!check) return null;
    return this.runCheck(check);
  }

  /**
   * Check if system is ready (all critical checks pass)
   */
  async isReady(): Promise<boolean> {
    for (const check of this.checks.values()) {
      if (check.critical) {
        const result = await this.runCheck(check);
        if (result.status === 'unhealthy') {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Check if system is live (basic liveness)
   */
  async isLive(): Promise<boolean> {
    return true; // If we can respond, we're live
  }

  private async runCheck(check: HealthCheck): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const response = await Promise.race([
        check.check(),
        new Promise<HealthCheckResponse>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), check.timeout)
        ),
      ]);

      return {
        name: check.name,
        status: response.healthy ? 'healthy' : 'unhealthy',
        duration: Date.now() - startTime,
        details: response.details,
        error: response.error,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      return {
        name: check.name,
        status: 'unhealthy',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        lastChecked: new Date().toISOString(),
      };
    }
  }

  private calculateOverallStatus(results: ComponentHealth[]): HealthStatus {
    const criticalChecks = Array.from(this.checks.values()).filter((c) => c.critical);
    const criticalResults = results.filter((r) => criticalChecks.some((c) => c.name === r.name));

    if (criticalResults.some((r) => r.status === 'unhealthy')) {
      return 'unhealthy';
    }

    if (results.some((r) => r.status === 'unhealthy' || r.status === 'degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }
}

// ============================================================================
// STANDARD HEALTH CHECKS
// ============================================================================

/**
 * Database health check
 */
export class DatabaseHealthCheck implements HealthCheck {
  readonly name = 'database';
  readonly critical = true;
  readonly timeout = 5000;

  constructor(private queryFn: () => Promise<unknown>) {}

  async check(): Promise<HealthCheckResponse> {
    try {
      await this.queryFn();
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Redis/Cache health check
 */
export class CacheHealthCheck implements HealthCheck {
  readonly name: string;
  readonly critical = false;
  readonly timeout = 3000;

  constructor(
    private pingFn: () => Promise<string>,
    name = 'cache'
  ) {
    this.name = name;
  }

  async check(): Promise<HealthCheckResponse> {
    try {
      const result = await this.pingFn();
      return {
        healthy: result === 'PONG',
        details: { response: result },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * External service health check
 */
export class ExternalServiceHealthCheck implements HealthCheck {
  readonly critical: boolean;
  readonly timeout: number;

  constructor(
    readonly name: string,
    private healthEndpoint: string,
    options: { critical?: boolean; timeout?: number } = {}
  ) {
    this.critical = options.critical ?? false;
    this.timeout = options.timeout ?? 5000;
  }

  async check(): Promise<HealthCheckResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.healthEndpoint, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return {
        healthy: response.ok,
        details: {
          statusCode: response.status,
          statusText: response.statusText,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Memory health check
 */
export class MemoryHealthCheck implements HealthCheck {
  readonly name = 'memory';
  readonly critical = false;
  readonly timeout = 1000;

  constructor(private maxHeapUsedPercent = 90) {}

  async check(): Promise<HealthCheckResponse> {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

    return {
      healthy: heapUsedPercent < this.maxHeapUsedPercent,
      details: {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        heapUsedPercent: Math.round(heapUsedPercent),
        rss: Math.round(usage.rss / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
      },
    };
  }
}

/**
 * Disk space health check
 */
export class DiskSpaceHealthCheck implements HealthCheck {
  readonly name = 'disk';
  readonly critical = false;
  readonly timeout = 5000;

  constructor(
    private path = '/',
    private minFreePercent = 10
  ) {}

  async check(): Promise<HealthCheckResponse> {
    // This is a simplified check - in production, use a proper disk space library
    try {
      return {
        healthy: true,
        details: {
          path: this.path,
          minFreePercent: this.minFreePercent,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Event loop health check
 */
export class EventLoopHealthCheck implements HealthCheck {
  readonly name = 'event_loop';
  readonly critical = true;
  readonly timeout = 2000;

  constructor(private maxDelayMs = 100) {}

  async check(): Promise<HealthCheckResponse> {
    return new Promise((resolve) => {
      const start = Date.now();
      setImmediate(() => {
        const delay = Date.now() - start;
        resolve({
          healthy: delay < this.maxDelayMs,
          details: {
            delayMs: delay,
            maxDelayMs: this.maxDelayMs,
          },
        });
      });
    });
  }
}

// ============================================================================
// DEFAULT HEALTH REGISTRY
// ============================================================================

export const healthRegistry = new HealthCheckRegistry();

// Register default checks
healthRegistry.register(new MemoryHealthCheck());
healthRegistry.register(new EventLoopHealthCheck());
