/**
 * Fastify application factory
 *
 * Creates and configures the Fastify server instance.
 */

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";
import { type PinoLoggerOptions } from "fastify/types/logger.js";

import { config } from "./config.js";
import correlationPlugin from "./plugins/correlation.js";
import healthRoutes from "./routes/health.js";

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
}

/**
 * Create logger options for Fastify
 */
function createLoggerOptions(): PinoLoggerOptions {
  const baseOptions: PinoLoggerOptions = {
    level: config.logger.level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.body.phone",
        "req.body.email",
        "req.body.name",
        "req.body.firstName",
        "req.body.lastName",
      ],
      censor: "[REDACTED]",
    },
  };

  // Only add transport in development (exactOptionalPropertyTypes compliance)
  if (config.isDev) {
    baseOptions.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    };
  }

  return baseOptions;
}

/**
 * Build the Fastify application
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? createLoggerOptions(),
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    disableRequestLogging: false,
  });

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: config.isProd,
  });

  await app.register(cors, {
    origin: config.isDev ? true : false, // Configure for production
    credentials: true,
  });

  // Utility plugins
  await app.register(sensible);

  // Custom plugins
  await app.register(correlationPlugin);

  // Routes
  await app.register(healthRoutes);

  // Global error handler
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(
      {
        err: error,
        correlationId: request.correlationId,
      },
      "Unhandled error"
    );

    // Don't expose internal errors in production
    if (config.isProd && error.statusCode === undefined) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      });
    }

    return reply.send(error);
  });

  // Not found handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: `Route ${request.method} ${request.url} not found`,
    });
  });

  return app;
}
