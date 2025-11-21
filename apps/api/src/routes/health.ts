import type { FastifyPluginAsync } from 'fastify';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy' | 'ready' | 'alive';
  timestamp: string;
  version?: string;
  uptime?: number;
  checks?: Record<string, { status: string; message?: string }>;
}

/**
 * Health check routes
 *
 * Provides endpoints for Kubernetes probes and load balancer health checks.
 */
export const healthRoutes: FastifyPluginAsync = async (fastify) => {
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
      version: process.env['npm_package_version'] ?? '0.1.0',
      uptime: process.uptime(),
    };
  });

  /**
   * GET /ready
   *
   * Readiness probe for Kubernetes.
   * Returns 200 when the service is ready to accept traffic.
   */
  fastify.get<{ Reply: HealthResponse }>('/ready', async (_request, reply) => {
    // TODO: Add actual dependency checks (database, external services)
    const checks = {
      database: { status: 'ok' }, // Placeholder
      cache: { status: 'ok' }, // Placeholder
    };

    const allHealthy = Object.values(checks).every((c) => c.status === 'ok');

    if (!allHealthy) {
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] ?? '0.1.0',
        uptime: process.uptime(),
        checks,
      });
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '0.1.0',
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
};
