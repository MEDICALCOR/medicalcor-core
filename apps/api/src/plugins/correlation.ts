/**
 * Correlation ID plugin for request tracing
 *
 * Adds correlation ID to every request for distributed tracing.
 * Reads from x-correlation-id header or generates a new UUID.
 */

import { randomUUID } from "node:crypto";

import { type FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

const CORRELATION_HEADER = "x-correlation-id";

const correlationPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("correlationId", "");

  fastify.addHook("onRequest", async (request, reply) => {
    // Get correlation ID from header or generate new one
    const correlationId =
      (request.headers[CORRELATION_HEADER] as string | undefined) ?? randomUUID();

    request.correlationId = correlationId;

    // Add to response headers
    void reply.header(CORRELATION_HEADER, correlationId);

    // Add to logger context
    request.log = request.log.child({ correlationId });
  });
};

export default fp(correlationPlugin, {
  name: "correlation",
  fastify: "5.x",
});
