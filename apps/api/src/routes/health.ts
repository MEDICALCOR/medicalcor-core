import type { FastifyPluginAsync } from 'fastify';

/**
 * Health check routes
 */
export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic health check
  fastify.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Readiness check (for k8s probes)
  fastify.get('/ready', async (_request, reply) => {
    // Add dependency checks here (DB, Redis, etc.)
    return reply.send({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  });

  // Liveness check (for k8s probes)
  fastify.get('/live', async (_request, reply) => {
    return reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });
};
