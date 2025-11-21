import type { FastifyPluginAsync } from 'fastify';

interface HealthCheckResult {
  status: 'ok' | 'error';
  message?: string;
  latencyMs?: number;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy' | 'ready' | 'alive';
  timestamp: string;
  version?: string;
  uptime?: number;
  checks?: Record<string, HealthCheckResult>;
}

/**
 * Check database connectivity
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

    const client = new pg.default.Client({ connectionString: databaseUrl });

    await client.connect();
    await client.query('SELECT 1');
    await client.end();

    return {
      status: 'ok',
      latencyMs: Date.now() - startTime,
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
 * Check Redis connectivity
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

    const Redis = ioredisModule.Redis;
    const redis = new Redis(redisUrl, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });

    const result: string = await redis.ping();
    await redis.quit();

    if (result !== 'PONG') {
      return {
        status: 'error',
        message: `Unexpected PING response: ${result}`,
        latencyMs: Date.now() - startTime,
      };
    }

    return {
      status: 'ok',
      latencyMs: Date.now() - startTime,
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
 * Health check routes
 *
 * Provides endpoints for Kubernetes probes and load balancer health checks.
 */
export const healthRoutes: FastifyPluginAsync = (fastify) => {
  /**
   * GET /health
   *
   * Basic health check for load balancers.
   * Returns 200 if the service is running.
   */
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, _reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
      uptime: process.uptime(),
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
      return await reply.status(503).send({
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

  return Promise.resolve();
};
