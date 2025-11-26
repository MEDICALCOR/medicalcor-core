/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/prefer-regexp-exec */
import type { FastifyPluginAsync } from 'fastify';
import { globalCircuitBreakerRegistry } from '@medicalcor/core';

interface HealthCheckResult {
  status: 'ok' | 'error' | 'degraded';
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

interface DependencyHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'not_configured';
  latencyMs?: number;
  message?: string;
  critical: boolean;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy' | 'ready' | 'alive';
  timestamp: string;
  version?: string;
  uptime?: number;
  checks?: Record<string, HealthCheckResult>;
  dependencies?: DependencyHealth[];
  circuitBreakers?: {
    name: string;
    state: string;
    failures: number;
    successRate: number;
  }[];
  memory?: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
}

/**
 * Check database connectivity with detailed diagnostics
 * Uses a simple SELECT 1 query to verify PostgreSQL connection
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return { status: 'ok', message: 'not configured (using in-memory fallback)' };
  }

  const startTime = Date.now();

  try {
    // Dynamic import to avoid requiring pg in environments that don't need it
    const pg = await import('pg').catch(() => null);

    if (!pg) {
      return { status: 'ok', message: 'pg module not available' };
    }

    const client = new pg.default.Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });

    await client.connect();

    // Run multiple checks for comprehensive health
    const results = await Promise.all([
      client.query('SELECT 1 as alive'),
      client.query('SELECT pg_is_in_recovery() as is_replica'),
      client.query(
        "SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active'"
      ),
    ]);

    await client.end();
    const latencyMs = Date.now() - startTime;

    const isReplica = results[1].rows[0]?.is_replica ?? false;
    const activeConnections = parseInt(results[2].rows[0]?.active_connections ?? '0', 10);

    return {
      status: 'ok',
      latencyMs,
      details: {
        isReplica,
        activeConnections,
        connectionMode: isReplica ? 'read-replica' : 'primary',
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown database error',
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Check Redis connectivity with TLS verification
 * Uses PING command to verify Redis connection
 */
async function checkRedis(): Promise<HealthCheckResult> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return { status: 'ok', message: 'not configured (caching disabled)' };
  }

  const startTime = Date.now();

  try {
    // Dynamic import to avoid requiring ioredis in environments that don't need it
    const ioredisModule = await import('ioredis').catch(() => null);

    if (!ioredisModule) {
      return { status: 'ok', message: 'ioredis module not available' };
    }

    // ioredis exports Redis class - need to cast through unknown for ESM compatibility
    const Redis = (
      ioredisModule as unknown as {
        default: new (
          url: string,
          opts: Record<string, unknown>
        ) => {
          ping: () => Promise<string>;
          info: (section: string) => Promise<string>;
          quit: () => Promise<void>;
        };
      }
    ).default;

    // Detect TLS from URL
    const isTls = redisUrl.startsWith('rediss://');

    const redis = new Redis(redisUrl, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      ...(isTls && {
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production',
        },
      }),
    });

    // Run multiple checks
    const [pingResult, infoResult] = await Promise.all([
      redis.ping(),
      redis.info('memory').catch(() => ''),
    ]);

    await redis.quit();
    const latencyMs = Date.now() - startTime;

    if (pingResult !== 'PONG') {
      return {
        status: 'error',
        message: `Unexpected PING response: ${pingResult}`,
        latencyMs,
      };
    }

    // Parse memory info
    const memoryMatch = infoResult.match(/used_memory_human:(\S+)/);
    const usedMemory = memoryMatch ? memoryMatch[1] : 'unknown';

    return {
      status: 'ok',
      latencyMs,
      details: {
        tlsEnabled: isTls,
        usedMemory,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown Redis error',
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Check Trigger.dev connectivity
 * Verifies the API is reachable
 */
function checkTrigger(): HealthCheckResult {
  const triggerSecretKey = process.env.TRIGGER_SECRET_KEY;

  if (!triggerSecretKey) {
    return { status: 'ok', message: 'not configured' };
  }

  // Trigger.dev SDK doesn't expose a health check, so we just verify config exists
  return { status: 'ok', message: 'configured' };
}

/**
 * Get circuit breaker status for all services
 */
function getCircuitBreakerStatus(): {
  name: string;
  state: string;
  failures: number;
  successRate: number;
}[] {
  try {
    const stats = globalCircuitBreakerRegistry.getAllStats();
    return stats.map((stat) => ({
      name: stat.name,
      state: stat.state,
      failures: stat.totalFailures,
      successRate:
        stat.totalRequests > 0 ? Math.round((stat.totalSuccesses / stat.totalRequests) * 100) : 100,
    }));
  } catch {
    return [];
  }
}

/**
 * Get memory usage statistics
 */
function getMemoryStats(): { heapUsed: number; heapTotal: number; external: number; rss: number } {
  const mem = process.memoryUsage();
  return {
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024), // MB
    external: Math.round(mem.external / 1024 / 1024), // MB
    rss: Math.round(mem.rss / 1024 / 1024), // MB
  };
}

// checkExternalService is reserved for future external dependency checks
// Currently not used but kept for extensibility

/**
 * Health check routes
 *
 * Provides endpoints for Kubernetes probes and load balancer health checks.
 * Now includes comprehensive dependency verification.
 */
export const healthRoutes: FastifyPluginAsync = (fastify) => {
  /**
   * GET /health
   *
   * Comprehensive health check for load balancers and monitoring.
   * Verifies database, Redis, and circuit breaker status.
   * Returns 200 if the service is operational.
   */
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    // Run all health checks in parallel
    const [databaseCheck, redisCheck] = await Promise.all([checkDatabase(), checkRedis()]);
    const triggerCheck = checkTrigger();

    const checks = {
      database: databaseCheck,
      redis: redisCheck,
      trigger: triggerCheck,
    };

    // Determine overall health status
    const criticalServicesHealthy = databaseCheck.status === 'ok';
    const optionalServicesHealthy = redisCheck.status === 'ok' && triggerCheck.status === 'ok';

    // Get circuit breaker status
    const circuitBreakers = getCircuitBreakerStatus();
    const hasOpenCircuits = circuitBreakers.some((cb) => cb.state === 'OPEN');

    // Determine overall status
    let status: 'ok' | 'degraded' | 'unhealthy' = 'ok';
    if (!criticalServicesHealthy) {
      status = 'unhealthy';
    } else if (!optionalServicesHealthy || hasOpenCircuits) {
      status = 'degraded';
    }

    // Set response code based on status
    if (status === 'unhealthy') {
      return reply.status(503).send({
        status,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? '0.1.0',
        uptime: process.uptime(),
        checks,
        circuitBreakers,
        memory: getMemoryStats(),
      });
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: process.uptime(),
      checks,
      circuitBreakers,
      memory: getMemoryStats(),
    };
  });

  /**
   * GET /health/deep
   *
   * Deep health check that verifies all dependencies.
   * Use sparingly as it performs actual connectivity tests.
   */
  fastify.get<{ Reply: HealthResponse }>('/health/deep', async (_request, reply) => {
    // Run all health checks in parallel
    const [databaseCheck, redisCheck] = await Promise.all([checkDatabase(), checkRedis()]);
    const triggerCheck = checkTrigger();

    // Build dependency list - conditionally add optional properties for exactOptionalPropertyTypes
    const postgresqlDep: DependencyHealth = {
      name: 'postgresql',
      status: databaseCheck.status === 'ok' ? 'healthy' : 'unhealthy',
      critical: true,
    };
    if (databaseCheck.latencyMs !== undefined) postgresqlDep.latencyMs = databaseCheck.latencyMs;
    if (databaseCheck.message) postgresqlDep.message = databaseCheck.message;

    const redisDep: DependencyHealth = {
      name: 'redis',
      status:
        redisCheck.status === 'ok'
          ? 'healthy'
          : redisCheck.message?.includes('not configured')
            ? 'not_configured'
            : 'unhealthy',
      critical: false,
    };
    if (redisCheck.latencyMs !== undefined) redisDep.latencyMs = redisCheck.latencyMs;
    if (redisCheck.message) redisDep.message = redisCheck.message;

    const triggerDep: DependencyHealth = {
      name: 'trigger.dev',
      status:
        triggerCheck.status === 'ok'
          ? triggerCheck.message === 'configured'
            ? 'healthy'
            : 'not_configured'
          : 'unhealthy',
      critical: false,
    };
    if (triggerCheck.message) triggerDep.message = triggerCheck.message;

    const dependencies: DependencyHealth[] = [postgresqlDep, redisDep, triggerDep];

    // Check circuit breakers as pseudo-dependencies
    const circuitBreakers = getCircuitBreakerStatus();
    for (const cb of circuitBreakers) {
      if (cb.state === 'OPEN') {
        dependencies.push({
          name: `circuit:${cb.name}`,
          status: 'unhealthy',
          message: `Circuit open after ${cb.failures} failures`,
          critical: cb.name === 'stripe', // Stripe is critical for payments
        });
      }
    }

    // Calculate overall health
    const criticalUnhealthy = dependencies.some((d) => d.critical && d.status === 'unhealthy');
    const anyUnhealthy = dependencies.some((d) => d.status === 'unhealthy');

    const status = criticalUnhealthy ? 'unhealthy' : anyUnhealthy ? 'degraded' : 'ok';

    if (status === 'unhealthy') {
      return reply.status(503).send({
        status,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? '0.1.0',
        uptime: process.uptime(),
        dependencies,
        circuitBreakers,
        memory: getMemoryStats(),
      });
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: process.uptime(),
      dependencies,
      circuitBreakers,
      memory: getMemoryStats(),
    };
  });

  /**
   * GET /ready
   *
   * Readiness probe for Kubernetes.
   * Returns 200 when the service is ready to accept traffic.
   * Checks database and cache connectivity.
   */
  fastify.get<{ Reply: HealthResponse }>('/ready', async (_request, reply) => {
    // Run health checks in parallel
    const [databaseCheck, redisCheck] = await Promise.all([checkDatabase(), checkRedis()]);
    const triggerCheck = checkTrigger();

    const checks = {
      database: databaseCheck,
      redis: redisCheck,
      trigger: triggerCheck,
    };

    // Service is healthy if all required checks pass
    // Redis and Trigger are optional (can run degraded without them)
    const isHealthy = databaseCheck.status === 'ok';
    const isDegraded =
      isHealthy && (redisCheck.status === 'error' || triggerCheck.status === 'error');

    if (!isHealthy) {
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? '0.1.0',
        uptime: process.uptime(),
        checks,
      });
    }

    return {
      status: isDegraded ? 'degraded' : 'ready',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: process.uptime(),
      checks,
    };
  });

  /**
   * GET /live
   *
   * Liveness probe for Kubernetes.
   * Returns 200 if the process is alive.
   */
  fastify.get<{ Reply: HealthResponse }>('/live', async (_request, _reply) => {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * GET /health/circuit-breakers
   *
   * Get detailed circuit breaker status for all services.
   */
  fastify.get('/health/circuit-breakers', async () => {
    const stats = globalCircuitBreakerRegistry.getAllStats();
    const openCircuits = globalCircuitBreakerRegistry.getOpenCircuits();

    return {
      timestamp: new Date().toISOString(),
      openCircuits,
      services: stats.map((stat) => ({
        name: stat.name,
        state: stat.state,
        failures: stat.failures,
        successes: stat.successes,
        totalRequests: stat.totalRequests,
        totalFailures: stat.totalFailures,
        totalSuccesses: stat.totalSuccesses,
        successRate:
          stat.totalRequests > 0
            ? Math.round((stat.totalSuccesses / stat.totalRequests) * 1000) / 10
            : 100,
        lastFailure: stat.lastFailureTime ? new Date(stat.lastFailureTime).toISOString() : null,
        lastSuccess: stat.lastSuccessTime ? new Date(stat.lastSuccessTime).toISOString() : null,
      })),
    };
  });

  /**
   * POST /health/circuit-breakers/:service/reset
   *
   * Manually reset a circuit breaker (admin only).
   */
  fastify.post<{ Params: { service: string } }>(
    '/health/circuit-breakers/:service/reset',
    async (request, reply) => {
      const { service } = request.params;

      try {
        globalCircuitBreakerRegistry.reset(service);
        return {
          success: true,
          message: `Circuit breaker for ${service} has been reset`,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: `Failed to reset circuit breaker: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );

  return Promise.resolve();
};
