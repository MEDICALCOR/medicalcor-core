/**
 * Health check routes
 *
 * Provides endpoints for Kubernetes probes and load balancer health checks.
 */

import { type FastifyPluginAsync } from "fastify";

interface HealthResponse {
  status: "ok" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks?: Record<string, { status: string; message?: string }>;
}

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /health
   *
   * Basic health check for load balancers.
   * Returns 200 if the service is running.
   */
  fastify.get<{ Reply: HealthResponse }>("/health", async (_request, _reply) => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env["npm_package_version"] ?? "0.0.1",
      uptime: process.uptime(),
    };
  });

  /**
   * GET /health/ready
   *
   * Readiness probe for Kubernetes.
   * Returns 200 when the service is ready to accept traffic.
   */
  fastify.get<{ Reply: HealthResponse }>("/health/ready", async (_request, reply) => {
    // TODO: Add actual dependency checks (database, external services)
    const checks = {
      database: { status: "ok" }, // Placeholder
      cache: { status: "ok" }, // Placeholder
    };

    const allHealthy = Object.values(checks).every((c) => c.status === "ok");

    if (!allHealthy) {
      return reply.status(503).send({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        version: process.env["npm_package_version"] ?? "0.0.1",
        uptime: process.uptime(),
        checks,
      });
    }

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env["npm_package_version"] ?? "0.0.1",
      uptime: process.uptime(),
      checks,
    };
  });

  /**
   * GET /health/live
   *
   * Liveness probe for Kubernetes.
   * Returns 200 if the process is alive.
   */
  fastify.get("/health/live", async () => {
    return { status: "ok" };
  });
};

export default healthRoutes;
