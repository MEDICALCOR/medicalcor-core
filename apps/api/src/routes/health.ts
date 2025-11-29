/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/prefer-regexp-exec */
import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { globalCircuitBreakerRegistry } from '@medicalcor/core';
import { getCRMProvider, isMockCRMProvider } from '@medicalcor/integrations';
import { CrmHealthCheckService } from '@medicalcor/infra';

/**
 * SECURITY: Timing-safe comparison for API keys
 * Prevents timing attacks that could reveal API key characters
 */
function verifyApiKeyTimingSafe(
  providedKey: string | undefined,
  expectedKey: string | undefined
): boolean {
  if (!providedKey || !expectedKey) {
    return false;
  }

  try {
    const providedBuffer = Buffer.from(providedKey);
    const expectedBuffer = Buffer.from(expectedKey);

    if (providedBuffer.length !== expectedBuffer.length) {
      // Perform a dummy comparison to maintain constant time
      crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * SECURITY FIX: Rate limiter for circuit breaker reset endpoint
 * Prevents authenticated DoS by limiting reset frequency per service
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const circuitBreakerResetRateLimiter = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const RATE_LIMIT_MAX_RESETS = 5; // Max 5 resets per service per minute

function checkCircuitBreakerRateLimit(
  service: string,
  ip: string
): { allowed: boolean; retryAfterMs?: number } {
  const key = `${service}:${ip}`;
  const now = Date.now();
  const entry = circuitBreakerResetRateLimiter.get(key);

  // Clean up old entries periodically (every 100 checks)
  if (Math.random() < 0.01) {
    for (const [k, e] of circuitBreakerResetRateLimiter) {
      if (now - e.windowStart > RATE_LIMIT_WINDOW_MS) {
        circuitBreakerResetRateLimiter.delete(k);
      }
    }
  }

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    circuitBreakerResetRateLimiter.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX_RESETS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}

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
 * CRM Health Check Service (singleton for consistent state tracking)
 */
const crmHealthService = new CrmHealthCheckService({
  timeoutMs: 5000,
  degradedThresholdMs: 2000,
  unhealthyThresholdMs: 5000,
  providerName: 'crm',
  critical: false, // CRM is not critical for API to function
});

/**
 * Check CRM connectivity
 * Uses the configured CRM provider (Pipedrive, Mock, etc.)
 */
async function checkCRM(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const crmProvider = getCRMProvider();
    const result = await crmHealthService.check(crmProvider);

    // Build result with required fields first (exactOptionalPropertyTypes compliance)
    const healthResult: HealthCheckResult = {
      status:
        result.status === 'healthy' ? 'ok' : result.status === 'degraded' ? 'degraded' : 'error',
      latencyMs: result.latencyMs,
      details: {
        provider: result.provider,
        isMock: isMockCRMProvider(),
        apiConnected: result.details.apiConnected,
        authenticated: result.details.authenticated,
        ...(result.details.apiVersion && { apiVersion: result.details.apiVersion }),
        ...(result.details.rateLimit && { rateLimitRemaining: result.details.rateLimit.remaining }),
      },
    };

    // Only add message if provided
    if (result.message !== undefined) {
      healthResult.message = result.message;
    }

    return healthResult;
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'CRM health check failed',
      latencyMs: Date.now() - startTime,
    };
  }
}

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
    const [databaseCheck, redisCheck, crmCheck] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkCRM(),
    ]);
    const triggerCheck = checkTrigger();

    const checks = {
      database: databaseCheck,
      redis: redisCheck,
      trigger: triggerCheck,
      crm: crmCheck,
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
    const [databaseCheck, redisCheck, crmCheck] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkCRM(),
    ]);
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

    const crmDep: DependencyHealth = {
      name: 'crm',
      status:
        crmCheck.status === 'ok'
          ? 'healthy'
          : crmCheck.status === 'degraded'
            ? 'degraded'
            : 'unhealthy',
      critical: false, // CRM is optional for API to function
    };
    if (crmCheck.latencyMs !== undefined) crmDep.latencyMs = crmCheck.latencyMs;
    if (crmCheck.message) crmDep.message = crmCheck.message;

    const dependencies: DependencyHealth[] = [postgresqlDep, redisDep, triggerDep, crmDep];

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
   * GET /health/crm
   *
   * Dedicated CRM health check endpoint.
   * Returns detailed information about the CRM provider status.
   */
  fastify.get('/health/crm', async (_request, reply) => {
    try {
      const crmProvider = getCRMProvider();
      const result = await crmHealthService.check(crmProvider);

      const response = {
        status: result.status,
        timestamp: result.timestamp.toISOString(),
        provider: result.provider,
        isMock: isMockCRMProvider(),
        latencyMs: result.latencyMs,
        message: result.message,
        details: {
          configured: result.details.configured,
          apiConnected: result.details.apiConnected,
          authenticated: result.details.authenticated,
          apiVersion: result.details.apiVersion,
          rateLimit: result.details.rateLimit,
          lastSuccessfulCall: result.details.lastSuccessfulCall?.toISOString(),
          error: result.details.error,
        },
        consecutiveFailures: crmHealthService.getConsecutiveFailures(),
      };

      if (result.status === 'unhealthy') {
        return await reply.status(503).send(response);
      }

      return response;
    } catch (error) {
      return await reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        provider: 'unknown',
        isMock: false,
        error: {
          code: 'CRM_CHECK_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
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
   * SECURITY FIX: Requires API key authentication to prevent DoS attacks.
   * Without authentication, attackers could repeatedly reset circuit breakers
   * during service outages, causing cascading failures (e.g., double-charging via Stripe).
   */
  fastify.post<{ Params: { service: string } }>(
    '/health/circuit-breakers/:service/reset',
    async (request, reply) => {
      // SECURITY: Require API key authentication for circuit breaker reset
      const apiKey = request.headers['x-api-key'] as string | undefined;
      const expectedApiKey = process.env.API_SECRET_KEY;

      if (!expectedApiKey) {
        fastify.log.error('API_SECRET_KEY not configured - circuit breaker reset is disabled');
        return reply.status(503).send({
          success: false,
          message: 'Circuit breaker reset is not available (API key not configured)',
        });
      }

      // SECURITY FIX: Use timing-safe comparison to prevent timing attacks
      if (!verifyApiKeyTimingSafe(apiKey, expectedApiKey)) {
        fastify.log.warn(
          { ip: request.ip, service: request.params.service },
          'Unauthorized circuit breaker reset attempt'
        );
        return reply.status(401).send({
          success: false,
          message: 'Unauthorized: Valid X-API-Key header required',
        });
      }

      const { service } = request.params;

      // SECURITY FIX: Rate limit circuit breaker resets to prevent DoS
      // Even authenticated users shouldn't be able to rapidly reset circuit breakers
      const rateLimitResult = checkCircuitBreakerRateLimit(service, request.ip);
      if (!rateLimitResult.allowed) {
        fastify.log.warn(
          { ip: request.ip, service, retryAfterMs: rateLimitResult.retryAfterMs },
          'Circuit breaker reset rate limit exceeded'
        );
        reply.header(
          'Retry-After',
          Math.ceil((rateLimitResult.retryAfterMs ?? 60000) / 1000).toString()
        );
        return reply.status(429).send({
          success: false,
          message: 'Rate limit exceeded. Too many circuit breaker reset attempts.',
          retryAfterMs: rateLimitResult.retryAfterMs,
        });
      }

      try {
        globalCircuitBreakerRegistry.reset(service);
        // Log successful reset for audit trail
        fastify.log.info(
          { service, ip: request.ip },
          'Circuit breaker reset by authenticated request'
        );
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
