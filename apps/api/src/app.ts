import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  createLogger,
  generateCorrelationId,
  validateEnv,
  getMissingSecrets,
  logSecretsStatus,
} from '@medicalcor/core';
import { healthRoutes, webhookRoutes, workflowRoutes } from './routes/index.js';

/**
 * MedicalCor API - Webhook Gateway
 *
 * This server receives webhooks from external services (WhatsApp, Twilio)
 * and forwards them to Trigger.dev for durable processing.
 */

const logger = createLogger({ name: 'api' });

/**
 * Validate environment and secrets on boot
 */
function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    validateEnv(isProduction);
    logger.info('Environment validation passed');
  } catch (error) {
    logger.error({ error }, 'Environment validation failed');
    if (isProduction) {
      process.exit(1);
    }
  }

  // Log secrets status (without revealing values)
  logSecretsStatus(logger);

  // Warn about missing secrets in development
  if (!isProduction) {
    const missing = getMissingSecrets();
    if (missing.length > 0) {
      logger.warn({ missing }, 'Some secrets are not configured (ok for development)');
    }
  }
}

async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Use custom serializers for PII redaction
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            remoteAddress: request.ip,
            correlationId: request.headers['x-correlation-id'],
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
    // Trust proxy headers (for load balancers)
    trustProxy: true,
  });

  // Add correlation ID to all requests
  fastify.addHook('onRequest', async (request, _reply) => {
    const header = request.headers['x-correlation-id'];
    const correlationId = typeof header === 'string' ? header : generateCorrelationId();
    request.headers['x-correlation-id'] = correlationId;
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Disable CSP for API
  });

  // CORS configuration
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? false,
    methods: ['GET', 'POST'],
  });

  // Parse URL-encoded bodies (for Twilio webhooks)
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, payload, done) => {
      try {
        const parsed = Object.fromEntries(new URLSearchParams(payload as string));
        done(null, parsed);
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  );

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(workflowRoutes);

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    const correlationId = request.headers['x-correlation-id'];
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;

    fastify.log.error({ correlationId, err: error }, 'Unhandled error');

    // Return safe error response
    return reply.status(statusCode).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      statusCode,
    });
  });

  // Not found handler
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Route not found',
      statusCode: 404,
    });
  });

  return fastify;
}

async function start() {
  // Validate environment before starting
  validateEnvironment();

  const app = await buildApp();

  const port = parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await app.listen({ port, host });
    logger.info({ port, host, env: process.env.NODE_ENV ?? 'development' }, 'Server started');
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    try {
      await app.close();
      logger.info('Server closed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void start();

export { buildApp };
