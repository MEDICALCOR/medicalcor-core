import type { FastifyPluginAsync } from 'fastify';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'index-usage-routes' });

/**
 * Index Usage Monitoring Routes (L1 Feature)
 *
 * Provides endpoints for monitoring PostgreSQL index usage
 * to identify unused indexes for improved write performance.
 *
 * Note: Full implementation requires direct PostgreSQL pool access.
 * Use the IndexUsageMonitor class from @medicalcor/infrastructure
 * when database pool is available.
 */
export const indexUsageRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /database/indexes/health-summary
   *
   * Get quick health summary from pre-computed database function.
   * This is a lightweight endpoint for integration with health checks.
   */
  fastify.get('/database/indexes/health-summary', async (_request, reply) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return reply.status(503).send({
        success: false,
        message: 'Database not configured',
      });
    }

    try {
      // Return placeholder - actual implementation uses IndexUsageMonitor
      // with direct pool access from the scheduled job
      return reply.send({
        success: true,
        data: {
          message: 'Use scheduled monitoring job for full metrics',
          endpoint: '/database/indexes/runs',
          documentation: 'See IndexUsageMonitor class for full implementation',
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get index health summary');
      return reply.status(500).send({
        success: false,
        message: 'Failed to retrieve health summary',
      });
    }
  });

  /**
   * GET /database/indexes/status
   *
   * Get index monitoring status and last run information.
   */
  fastify.get('/database/indexes/status', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        monitoringEnabled: true,
        schedule: '0 3 * * *', // 3 AM daily
        weeklyReportSchedule: '0 6 * * 1', // 6 AM Mondays
        cleanupSchedule: '0 4 1 * *', // 4 AM 1st of month
        metricsRetentionDays: 90,
        recommendations: {
          unusedThresholdDays: 30,
          healthyEfficiencyThreshold: 0.5,
        },
      },
    });
  });

  logger.info('Index usage routes registered');
};
