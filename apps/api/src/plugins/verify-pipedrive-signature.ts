/**
 * Pipedrive Webhook Signature Verification Plugin
 *
 * Verifies incoming webhooks from Pipedrive using HMAC-SHA256 signatures.
 * This is a critical security measure to prevent webhook spoofing.
 *
 * @see https://pipedrive.readme.io/docs/guide-for-webhooks#webhook-signature
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'crypto';

/**
 * Request with raw body attached by custom content type parser
 */
interface RequestWithRawBody extends FastifyRequest {
  rawBody?: string;
}

/**
 * SECURITY: Timing-safe HMAC signature verification
 *
 * Pipedrive uses HMAC-SHA256 to sign webhook payloads.
 * The signature is sent in the `x-pipedrive-signature` header.
 *
 * Algorithm:
 * 1. Compute HMAC-SHA256 of the raw request body using the webhook secret
 * 2. Encode the result as hex
 * 3. Compare with the provided signature using timing-safe comparison
 */
function verifyPipedriveSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    // SECURITY: Use timing-safe comparison to prevent timing attacks
    // Both buffers must be the same length for timingSafeEqual
    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length !== expectedBuffer.length) {
      // Perform dummy comparison to maintain constant time
      crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Pipedrive Signature Verification Plugin
 *
 * Automatically verifies signatures for all requests to /webhooks/crm routes.
 * If PIPEDRIVE_WEBHOOK_SECRET is not configured, verification is skipped
 * with a warning (development mode only - production requires configuration).
 *
 * Usage:
 * ```typescript
 * import { pipedriveSignaturePlugin } from './plugins/verify-pipedrive-signature.js';
 * await fastify.register(pipedriveSignaturePlugin);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin must be async
const verifyPipedriveSignaturePlugin: FastifyPluginAsync = async (fastify) => {
  const secret = process.env.PIPEDRIVE_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  fastify.addHook('preHandler', async (request: RequestWithRawBody, reply: FastifyReply) => {
    // Only apply to CRM webhook routes
    if (!request.url.includes('/webhooks/crm')) {
      return;
    }

    // SECURITY: In production, always require signature verification
    if (!secret) {
      if (isProduction) {
        fastify.log.error(
          { path: request.url },
          'CRITICAL: PIPEDRIVE_WEBHOOK_SECRET not configured in production'
        );
        return reply.status(503).send({
          error: 'Webhook signature verification not configured',
          code: 'SIGNATURE_NOT_CONFIGURED'
        });
      }

      // Development only: warn but allow through
      fastify.log.warn(
        { path: request.url },
        'PIPEDRIVE_WEBHOOK_SECRET not configured - skipping signature verification (UNSAFE for production)'
      );
      return;
    }

    // Extract signature from header
    const signatureHeader = request.headers['x-pipedrive-signature'];
    const signature = typeof signatureHeader === 'string' ? signatureHeader : undefined;

    // Get raw body (stored by custom content type parser in app.ts)
    const rawBody = request.rawBody;

    // SECURITY: Both signature and raw body are required
    if (!signature) {
      fastify.log.warn(
        { path: request.url, hasRawBody: !!rawBody },
        'Missing Pipedrive webhook signature'
      );
      return reply.status(401).send({
        error: 'Missing webhook signature',
        code: 'MISSING_SIGNATURE'
      });
    }

    if (!rawBody) {
      fastify.log.error(
        { path: request.url },
        'Raw body not available for signature verification'
      );
      return reply.status(500).send({
        error: 'Signature verification failed - raw body unavailable',
        code: 'RAW_BODY_UNAVAILABLE'
      });
    }

    // SECURITY: Verify the signature
    if (!verifyPipedriveSignature(rawBody, signature, secret)) {
      fastify.log.warn(
        { path: request.url },
        'Invalid Pipedrive webhook signature'
      );
      return reply.status(401).send({
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Signature verified successfully
    fastify.log.debug(
      { path: request.url },
      'Pipedrive webhook signature verified'
    );
  });
};

/**
 * Exported plugin with Fastify plugin metadata
 * Using fastify-plugin to ensure proper encapsulation
 */
export const pipedriveSignaturePlugin = fp(verifyPipedriveSignaturePlugin, {
  fastify: '5.x',
  name: 'pipedrive-signature-verification'
});

export default pipedriveSignaturePlugin;
