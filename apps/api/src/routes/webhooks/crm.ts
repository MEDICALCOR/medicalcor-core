/**
 * CRM Webhook Routes
 * Handles incoming webhooks from CRM providers (Pipedrive, HubSpot, etc.)
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { getCRMProvider } from '@medicalcor/integrations';
import {
  upsertLeadFromDTO,
  upsertTreatmentPlanFromDTO,
  generateCorrelationId,
} from '@medicalcor/core';

/**
 * SECURITY: Timing-safe comparison for webhook secrets
 */
function verifySecretTimingSafe(
  providedSecret: string | undefined,
  expectedSecret: string | undefined
): boolean {
  if (!providedSecret || !expectedSecret) {
    return false;
  }

  try {
    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

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
 * Safely extract string value from payload
 */
function getStringValue(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * CRM Webhook Routes
 * Receives contact and deal updates from CRM providers
 */
export const crmWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  await Promise.resolve(); // Satisfy require-await for Fastify plugin pattern

  fastify.post('/webhooks/crm', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationIdHeader = request.headers['x-correlation-id'];
    const correlationId =
      typeof correlationIdHeader === 'string' ? correlationIdHeader : generateCorrelationId();

    const crm = getCRMProvider();
    const payload = request.body as Record<string, unknown>;

    // SECURITY: Verify webhook secret - REQUIRED for production
    // This prevents unauthorized requests from creating fake leads
    const secretHeaderValue = request.headers['x-crm-webhook-secret'];
    const secretHeader = typeof secretHeaderValue === 'string' ? secretHeaderValue : undefined;
    const configuredSecret = process.env.CRM_WEBHOOK_SECRET;

    // In production, always require authentication
    if (process.env.NODE_ENV === 'production' && !configuredSecret) {
      request.log.error({ correlationId }, 'CRM_WEBHOOK_SECRET not configured in production');
      return reply.status(503).send({
        status: 'error',
        message: 'Webhook authentication not configured',
      });
    }

    // SECURITY: Always require authentication - no bypass allowed
    // Even in development, authentication is mandatory to prevent security vulnerabilities
    if (!configuredSecret) {
      request.log.error({ correlationId }, 'CRM_WEBHOOK_SECRET not configured - rejecting request');
      return reply.status(503).send({
        status: 'error',
        message: 'Webhook authentication not configured',
      });
    }

    if (!verifySecretTimingSafe(secretHeader, configuredSecret)) {
      request.log.warn({ correlationId }, 'Invalid CRM webhook secret');
      return reply.status(401).send({ status: 'unauthorized' });
    }

    // Extract event metadata
    const metaValue = payload.meta;
    const meta =
      typeof metaValue === 'object' && metaValue !== null
        ? (metaValue as Record<string, unknown>)
        : undefined;

    const eventType = getStringValue(payload, 'event');
    const objectType = meta ? getStringValue(meta, 'object') : undefined;

    request.log.info(
      {
        correlationId,
        source: crm.sourceName,
        event: eventType,
        objectType,
      },
      'CRM Webhook Received'
    );

    try {
      // Determine if this is a person/contact event
      const isPersonEvent =
        objectType === 'person' || eventType?.toLowerCase().includes('person') === true;

      // Determine if this is a deal event
      const isDealEvent =
        objectType === 'deal' || eventType?.toLowerCase().includes('deal') === true;

      // Process Person -> Lead
      if (isPersonEvent) {
        const leadDto = crm.parseContactWebhook(payload);
        if (leadDto) {
          const leadId = await upsertLeadFromDTO(leadDto, {
            actor: `crm:${crm.sourceName}`,
          });
          request.log.info(
            { correlationId, leadId, source: crm.sourceName },
            'Lead synced successfully'
          );
        } else {
          request.log.info(
            { correlationId },
            'No lead DTO generated from webhook (missing required fields)'
          );
        }
      }

      // Process Deal -> Treatment Plan
      if (isDealEvent) {
        const planDto = crm.parseDealWebhook(payload);
        if (planDto) {
          try {
            const planId = await upsertTreatmentPlanFromDTO(planDto, {
              actor: `crm:${crm.sourceName}`,
            });
            request.log.info(
              { correlationId, planId, source: crm.sourceName },
              'Treatment Plan synced successfully'
            );
          } catch (error) {
            // Lead might not exist yet - log warning but don't fail
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (errorMessage.includes('Lead not found')) {
              request.log.warn(
                {
                  correlationId,
                  dealId: planDto.externalDealId,
                  leadExternalId: planDto.leadExternalId,
                },
                'Treatment plan skipped: associated lead not found'
              );
            } else {
              throw error;
            }
          }
        } else {
          request.log.info({ correlationId }, 'No treatment plan DTO generated from webhook');
        }
      }

      // If neither person nor deal, just acknowledge
      if (!isPersonEvent && !isDealEvent) {
        request.log.debug(
          { correlationId, objectType, eventType },
          'Unhandled CRM webhook event type'
        );
      }

      return await reply.status(200).send({ status: 'ok' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      request.log.error(
        {
          correlationId,
          err: error,
          payload: {
            event: eventType,
            object: objectType,
          },
        },
        'CRM Sync Failed'
      );

      // Respond 200 to avoid blocking the webhook
      // CRM providers typically don't handle error responses well
      return reply.status(200).send({
        status: 'error',
        message: 'logged',
        error: errorMessage,
      });
    }
  });
};
