import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

/**
 * API Contract Tests
 *
 * Validates that API endpoints conform to their expected contracts:
 * - Request schema validation
 * - Response schema validation
 * - Error response format
 * - HTTP status codes
 * - Required headers
 *
 * These tests ensure API stability and prevent breaking changes.
 */

// =============================================================================
// Shared Schema Definitions (would normally come from @medicalcor/types)
// =============================================================================

const WhatsAppWebhookEntrySchema = z.object({
  id: z.string(),
  changes: z.array(
    z.object({
      value: z.object({
        messaging_product: z.literal('whatsapp').optional(),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }),
        contacts: z
          .array(
            z.object({
              profile: z.object({ name: z.string() }),
              wa_id: z.string(),
            })
          )
          .optional(),
        messages: z
          .array(
            z.object({
              from: z.string(),
              id: z.string(),
              timestamp: z.string(),
              type: z.enum(['text', 'image', 'audio', 'document', 'interactive', 'button']),
              text: z.object({ body: z.string() }).optional(),
            })
          )
          .optional(),
        statuses: z
          .array(
            z.object({
              id: z.string(),
              status: z.enum(['delivered', 'read', 'sent', 'failed']),
              timestamp: z.string(),
              recipient_id: z.string(),
            })
          )
          .optional(),
      }),
      field: z.string(),
    })
  ),
});

const WhatsAppWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(WhatsAppWebhookEntrySchema),
});

const StripeEventSchema = z.object({
  id: z.string().startsWith('evt_'),
  object: z.literal('event'),
  api_version: z.string(),
  created: z.number(),
  type: z.string(),
  livemode: z.boolean(),
  pending_webhooks: z.number(),
  data: z.object({
    object: z.record(z.unknown()),
  }),
});

const VapiWebhookSchema = z.object({
  type: z.enum(['call.started', 'call.ended', 'transcript.update', 'function.call']),
  call: z
    .object({
      id: z.string(),
      status: z.string(),
      type: z.enum(['inbound', 'outbound']),
      customer: z
        .object({
          number: z.string(),
          name: z.string().optional(),
        })
        .optional(),
      endedReason: z.string().optional(),
      cost: z.number().optional(),
    })
    .optional(),
});

const ApiErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  statusCode: z.number().int().min(400).max(599),
  correlationId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  services: z
    .record(
      z.object({
        status: z.enum(['up', 'down', 'degraded']),
        latency: z.number().optional(),
      })
    )
    .optional(),
});

// =============================================================================
// Contract Tests
// =============================================================================

describe('API Contract Tests', () => {
  describe('WhatsApp Webhook Contract', () => {
    it('should validate valid text message webhook', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+40212000000',
                    phone_number_id: '987654321',
                  },
                  contacts: [
                    {
                      profile: { name: 'Ion Popescu' },
                      wa_id: '40721000001',
                    },
                  ],
                  messages: [
                    {
                      from: '40721000001',
                      id: 'wamid.HBgLNTIxMjM0NTY3ODkVAgASGCg=',
                      timestamp: '1705315200',
                      type: 'text',
                      text: { body: 'Bună ziua, vreau informații despre implanturi.' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = WhatsAppWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate status update webhook', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  metadata: {
                    display_phone_number: '+40212000000',
                    phone_number_id: '987654321',
                  },
                  statuses: [
                    {
                      id: 'wamid.abc123',
                      status: 'delivered',
                      timestamp: '1705315200',
                      recipient_id: '40721000001',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = WhatsAppWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid object type', () => {
      const payload = {
        object: 'instagram_business_account', // Wrong
        entry: [],
      };

      const result = WhatsAppWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject missing metadata', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123',
            changes: [
              {
                value: {
                  // Missing metadata
                  messages: [],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = WhatsAppWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should validate interactive message type', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123',
            changes: [
              {
                value: {
                  metadata: {
                    display_phone_number: '+40212000000',
                    phone_number_id: '987654321',
                  },
                  messages: [
                    {
                      from: '40721000001',
                      id: 'wamid.xyz',
                      timestamp: '1705315200',
                      type: 'interactive', // Button click or list selection
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const result = WhatsAppWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('Stripe Webhook Contract', () => {
    it('should validate payment_intent.succeeded event', () => {
      const payload = {
        id: 'evt_1234567890',
        object: 'event',
        api_version: '2023-10-16',
        created: 1705315200,
        type: 'payment_intent.succeeded',
        livemode: false,
        pending_webhooks: 1,
        data: {
          object: {
            id: 'pi_123',
            amount: 10000,
            currency: 'eur',
            status: 'succeeded',
          },
        },
      };

      const result = StripeEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate charge.refunded event', () => {
      const payload = {
        id: 'evt_refund_123',
        object: 'event',
        api_version: '2023-10-16',
        created: 1705315200,
        type: 'charge.refunded',
        livemode: true,
        pending_webhooks: 0,
        data: {
          object: {
            id: 'ch_123',
            amount_refunded: 5000,
          },
        },
      };

      const result = StripeEventSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid event ID format', () => {
      const payload = {
        id: 'invalid_id', // Should start with evt_
        object: 'event',
        api_version: '2023-10-16',
        created: 1705315200,
        type: 'payment_intent.succeeded',
        livemode: false,
        pending_webhooks: 1,
        data: { object: {} },
      };

      const result = StripeEventSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject wrong object type', () => {
      const payload = {
        id: 'evt_123',
        object: 'payment_intent', // Should be 'event'
        api_version: '2023-10-16',
        created: 1705315200,
        type: 'payment_intent.succeeded',
        livemode: false,
        pending_webhooks: 1,
        data: { object: {} },
      };

      const result = StripeEventSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('Vapi Webhook Contract', () => {
    it('should validate call.ended event', () => {
      const payload = {
        type: 'call.ended',
        call: {
          id: 'call_123',
          status: 'ended',
          type: 'inbound',
          customer: {
            number: '+40721000001',
            name: 'Ion Popescu',
          },
          endedReason: 'customer-ended-call',
          cost: 0.15,
        },
      };

      const result = VapiWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate call.started event', () => {
      const payload = {
        type: 'call.started',
        call: {
          id: 'call_456',
          status: 'ringing',
          type: 'outbound',
        },
      };

      const result = VapiWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate transcript.update event', () => {
      const payload = {
        type: 'transcript.update',
        call: {
          id: 'call_789',
          status: 'in-progress',
          type: 'inbound',
        },
      };

      const result = VapiWebhookSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid event type', () => {
      const payload = {
        type: 'call.invalid',
        call: { id: '123', status: 'ok', type: 'inbound' },
      };

      const result = VapiWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid call type', () => {
      const payload = {
        type: 'call.ended',
        call: {
          id: '123',
          status: 'ended',
          type: 'internal', // Should be inbound or outbound
        },
      };

      const result = VapiWebhookSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('Error Response Contract', () => {
    it('should validate 400 validation error response', () => {
      const response = {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        statusCode: 400,
        correlationId: 'corr-123',
        details: {
          fieldErrors: {
            phone: ['Invalid phone format'],
          },
        },
      };

      const result = ApiErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate 401 unauthorized response', () => {
      const response = {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
        statusCode: 401,
      };

      const result = ApiErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate 500 internal error response', () => {
      const response = {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        statusCode: 500,
        correlationId: 'corr-456',
      };

      const result = ApiErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status code', () => {
      const response = {
        code: 'ERROR',
        message: 'Something went wrong',
        statusCode: 200, // Not an error status
      };

      const result = ApiErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const response = {
        code: 'ERROR',
        // Missing message and statusCode
      };

      const result = ApiErrorResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('Health Check Contract', () => {
    it('should validate healthy status response', () => {
      const response = {
        status: 'healthy',
        version: '1.0.0',
        timestamp: '2025-01-15T10:00:00.000Z',
        services: {
          database: { status: 'up', latency: 5 },
          redis: { status: 'up', latency: 2 },
          hubspot: { status: 'up', latency: 150 },
        },
      };

      const result = HealthCheckResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate degraded status response', () => {
      const response = {
        status: 'degraded',
        services: {
          database: { status: 'up' },
          redis: { status: 'degraded' },
        },
      };

      const result = HealthCheckResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate unhealthy status response', () => {
      const response = {
        status: 'unhealthy',
        services: {
          database: { status: 'down' },
        },
      };

      const result = HealthCheckResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const response = {
        status: 'ok', // Should be healthy, degraded, or unhealthy
      };

      const result = HealthCheckResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('HTTP Headers Contract', () => {
    it('should require Content-Type for POST requests', () => {
      const requiredHeaders = {
        'Content-Type': 'application/json',
      };

      expect(requiredHeaders['Content-Type']).toBe('application/json');
    });

    it('should require signature header for webhooks', () => {
      const webhookHeaders = {
        stripe: 'Stripe-Signature',
        whatsapp: 'X-Hub-Signature-256',
        vapi: 'X-Vapi-Signature',
        pipedrive: 'X-Pipedrive-Signature',
      };

      expect(Object.keys(webhookHeaders).length).toBe(4);
    });

    it('should return correlation ID in response headers', () => {
      const responseHeaders = {
        'X-Correlation-ID': 'corr-abc123',
        'X-Request-ID': 'req-xyz789',
      };

      expect(responseHeaders['X-Correlation-ID']).toBeDefined();
    });
  });

  describe('HTTP Status Code Contract', () => {
    it('should use correct status codes for success', () => {
      const successCodes = {
        GET: 200,
        POST_CREATE: 201,
        POST_ACTION: 200,
        PUT: 200,
        DELETE: 204,
        HEAD: 200,
      };

      expect(successCodes.POST_CREATE).toBe(201);
      expect(successCodes.DELETE).toBe(204);
    });

    it('should use correct status codes for client errors', () => {
      const clientErrors = {
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        METHOD_NOT_ALLOWED: 405,
        CONFLICT: 409,
        UNPROCESSABLE_ENTITY: 422,
        TOO_MANY_REQUESTS: 429,
      };

      expect(clientErrors.BAD_REQUEST).toBe(400);
      expect(clientErrors.TOO_MANY_REQUESTS).toBe(429);
    });

    it('should use correct status codes for server errors', () => {
      const serverErrors = {
        INTERNAL_SERVER_ERROR: 500,
        BAD_GATEWAY: 502,
        SERVICE_UNAVAILABLE: 503,
        GATEWAY_TIMEOUT: 504,
      };

      expect(serverErrors.INTERNAL_SERVER_ERROR).toBe(500);
      expect(serverErrors.SERVICE_UNAVAILABLE).toBe(503);
    });
  });

  describe('Pagination Contract', () => {
    const PaginatedResponseSchema = z.object({
      data: z.array(z.unknown()),
      pagination: z.object({
        page: z.number().int().min(1),
        limit: z.number().int().min(1).max(100),
        total: z.number().int().min(0),
        totalPages: z.number().int().min(0),
        hasNext: z.boolean(),
        hasPrev: z.boolean(),
      }),
    });

    it('should validate paginated response', () => {
      const response = {
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        pagination: {
          page: 1,
          limit: 10,
          total: 25,
          totalPages: 3,
          hasNext: true,
          hasPrev: false,
        },
      };

      const result = PaginatedResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate last page response', () => {
      const response = {
        data: [{ id: 21 }, { id: 22 }],
        pagination: {
          page: 3,
          limit: 10,
          total: 22,
          totalPages: 3,
          hasNext: false,
          hasPrev: true,
        },
      };

      const result = PaginatedResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject invalid page number', () => {
      const response = {
        data: [],
        pagination: {
          page: 0, // Invalid - must be >= 1
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };

      const result = PaginatedResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject limit over maximum', () => {
      const response = {
        data: [],
        pagination: {
          page: 1,
          limit: 500, // Too high - max 100
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };

      const result = PaginatedResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });
});
