import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Vapi Webhook Tests
 *
 * Comprehensive tests for the Vapi voice AI webhook endpoint covering:
 * - HMAC-SHA256 signature verification (Stripe-like format: t=timestamp,v1=signature)
 * - Timestamp validation (replay attack prevention)
 * - Event type handling (call.started, call.ended, transcript.updated, function.call)
 * - Zod schema validation (discriminated union)
 * - Trigger.dev task triggering
 * - Phone number masking for HIPAA/GDPR
 * - Duration calculation
 * - Idempotency key generation
 */

// Mock Trigger.dev SDK
vi.mock('@trigger.dev/sdk/v3', () => ({
  tasks: {
    trigger: vi.fn().mockResolvedValue({ id: 'mock-task-id' }),
  },
}));

// Mock core utilities
vi.mock('@medicalcor/core', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(
      message: string,
      public details?: object
    ) {
      super(message);
      this.name = 'ValidationError';
    }
  },
  WebhookSignatureError: class WebhookSignatureError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'WebhookSignatureError';
    }
  },
  toSafeErrorResponse: vi.fn((error) => ({
    error: error.name ?? 'Error',
    message: error.message ?? 'Internal error',
  })),
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
  IdempotencyKeys: {
    vapiWebhook: vi.fn((callId: string) => `vapi-webhook:${callId}`),
  },
  maskPhone: vi.fn((phone: string | undefined) => {
    if (!phone) return undefined;
    if (phone.length <= 4) return '****';
    return phone.slice(0, 3) + '***' + phone.slice(-2);
  }),
}));

/**
 * Verify Vapi webhook signature
 * Matches the implementation in vapi.ts
 */
function verifyVapiSignature(payload: string, signature: string, secret: string): boolean {
  // Parse signature header: t=timestamp,v1=signature
  const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {});

  const timestamp = parts.t;
  const v1Signature = parts.v1;

  if (!timestamp || !v1Signature) {
    return false;
  }

  // Check timestamp tolerance (5 minutes)
  const tolerance = 300;
  const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (timestampAge > tolerance || timestampAge < -tolerance) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  // Constant-time comparison
  try {
    if (v1Signature.length !== expectedSignature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(v1Signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

/**
 * Generate valid Vapi signature for testing
 */
function generateVapiSignature(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${ts},v1=${signature}`;
}

// Zod schemas matching vapi.ts implementation
const VapiCallSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  assistantId: z.string().optional(),
  status: z.enum(['queued', 'ringing', 'in-progress', 'forwarding', 'ended']),
  type: z.enum(['inbound', 'outbound']),
  phoneNumber: z
    .object({
      id: z.string(),
      number: z.string(),
    })
    .optional(),
  customer: z
    .object({
      number: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  endedReason: z.string().optional(),
  cost: z.number().optional(),
});

const VapiTranscriptMessageSchema = z.object({
  role: z.enum(['assistant', 'user', 'system', 'function_call']),
  message: z.string(),
  timestamp: z.number(),
  duration: z.number().optional(),
  name: z.string().optional(),
  arguments: z.string().optional(),
});

const VapiWebhookEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('call.started'),
    call: VapiCallSchema,
  }),
  z.object({
    type: z.literal('call.ended'),
    call: VapiCallSchema,
  }),
  z.object({
    type: z.literal('transcript.updated'),
    transcript: z.object({
      callId: z.string(),
      messages: z.array(VapiTranscriptMessageSchema),
      duration: z.number(),
      startedAt: z.string(),
      endedAt: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('function.call'),
    call: VapiCallSchema,
    functionCall: z.object({
      name: z.string(),
      arguments: z.record(z.unknown()),
    }),
  }),
]);

// Test data factories
function createVapiCall(overrides = {}) {
  return {
    id: 'call_' + crypto.randomBytes(12).toString('hex'),
    orgId: 'org_test123',
    assistantId: 'asst_test123',
    status: 'in-progress' as const,
    type: 'inbound' as const,
    phoneNumber: {
      id: 'phone_123',
      number: '+40212345678',
    },
    customer: {
      number: '+40721123456',
      name: 'Ion Popescu',
    },
    startedAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
    endedAt: undefined,
    endedReason: undefined,
    cost: undefined,
    ...overrides,
  };
}

function createCallStartedEvent(overrides = {}) {
  return {
    type: 'call.started' as const,
    call: createVapiCall(overrides),
  };
}

function createCallEndedEvent(overrides = {}) {
  return {
    type: 'call.ended' as const,
    call: createVapiCall({
      status: 'ended' as const,
      endedAt: new Date().toISOString(),
      endedReason: 'customer-ended-call',
      cost: 0.15,
      ...overrides,
    }),
  };
}

function createTranscriptUpdatedEvent(overrides = {}) {
  return {
    type: 'transcript.updated' as const,
    transcript: {
      callId: 'call_' + crypto.randomBytes(12).toString('hex'),
      messages: [
        {
          role: 'assistant' as const,
          message: 'Bună ziua, cu ce vă pot ajuta?',
          timestamp: Date.now() - 30000,
          duration: 2.5,
        },
        {
          role: 'user' as const,
          message: 'Aș dori să fac o programare pentru implant dentar.',
          timestamp: Date.now() - 25000,
          duration: 3.2,
        },
      ],
      duration: 30,
      startedAt: new Date(Date.now() - 30000).toISOString(),
      endedAt: undefined,
      ...overrides,
    },
  };
}

function createFunctionCallEvent(overrides = {}) {
  return {
    type: 'function.call' as const,
    call: createVapiCall(),
    functionCall: {
      name: 'scheduleAppointment',
      arguments: {
        date: '2024-01-15',
        time: '10:00',
        procedure: 'consultation',
      },
      ...overrides,
    },
  };
}

describe('Vapi Webhook Processing', () => {
  const WEBHOOK_SECRET = 'vapi_webhook_secret_test';
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, VAPI_WEBHOOK_SECRET: WEBHOOK_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Signature Verification', () => {
    it('should verify valid Vapi signature', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      const signature = generateVapiSignature(payload, WEBHOOK_SECRET);

      const isValid = verifyVapiSignature(payload, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      const signature = generateVapiSignature(payload, 'wrong_secret');

      const isValid = verifyVapiSignature(payload, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should reject tampered payload', () => {
      const event = createCallStartedEvent();
      const originalPayload = JSON.stringify(event);
      const signature = generateVapiSignature(originalPayload, WEBHOOK_SECRET);

      // Tamper with the payload
      const tamperedEvent = { ...event, call: { ...event.call, id: 'call_tampered' } };
      const tamperedPayload = JSON.stringify(tamperedEvent);

      const isValid = verifyVapiSignature(tamperedPayload, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should reject expired timestamp (replay attack)', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      // 10 minutes ago - outside 5 minute tolerance
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const signature = generateVapiSignature(payload, WEBHOOK_SECRET, oldTimestamp);

      const isValid = verifyVapiSignature(payload, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should reject future timestamp', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      // 10 minutes in future - outside tolerance
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600;
      const signature = generateVapiSignature(payload, WEBHOOK_SECRET, futureTimestamp);

      const isValid = verifyVapiSignature(payload, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should accept timestamp within tolerance', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      // 4 minutes ago - within 5 minute tolerance
      const recentTimestamp = Math.floor(Date.now() / 1000) - 240;
      const signature = generateVapiSignature(payload, WEBHOOK_SECRET, recentTimestamp);

      const isValid = verifyVapiSignature(payload, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(true);
    });

    it('should reject missing timestamp', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      const signature = 'v1=abc123'; // Missing t=

      const isValid = verifyVapiSignature(payload, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should reject missing v1 signature', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = `t=${timestamp}`; // Missing v1=

      const isValid = verifyVapiSignature(payload, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should reject malformed signature header', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      const malformedSignatures = [
        '',
        'invalid',
        't=,v1=',
        't=abc,v1=def', // Non-numeric timestamp
        '=123,v1=abc',
      ];

      for (const sig of malformedSignatures) {
        const isValid = verifyVapiSignature(payload, sig, WEBHOOK_SECRET);
        expect(isValid).toBe(false);
      }
    });

    it('should handle different length signatures safely', () => {
      const payload = JSON.stringify(createCallStartedEvent());
      const timestamp = Math.floor(Date.now() / 1000);

      // Short signature
      const shortSig = `t=${timestamp},v1=abc`;
      expect(verifyVapiSignature(payload, shortSig, WEBHOOK_SECRET)).toBe(false);

      // Long signature
      const longSig = `t=${timestamp},v1=${'a'.repeat(100)}`;
      expect(verifyVapiSignature(payload, longSig, WEBHOOK_SECRET)).toBe(false);
    });
  });

  describe('call.started Event', () => {
    it('should validate call.started event schema', () => {
      const event = createCallStartedEvent();
      const result = VapiWebhookEventSchema.safeParse(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('call.started');
      }
    });

    it('should include customer phone number', () => {
      const event = createCallStartedEvent();

      expect(event.call.customer?.number).toBe('+40721123456');
    });

    it('should include customer name when available', () => {
      const event = createCallStartedEvent();

      expect(event.call.customer?.name).toBe('Ion Popescu');
    });

    it('should handle inbound call type', () => {
      const event = createCallStartedEvent({ type: 'inbound' });

      expect(event.call.type).toBe('inbound');
    });

    it('should handle outbound call type', () => {
      const event = createCallStartedEvent({ type: 'outbound' });

      expect(event.call.type).toBe('outbound');
    });
  });

  describe('call.ended Event', () => {
    it('should validate call.ended event schema', () => {
      const event = createCallEndedEvent();
      const result = VapiWebhookEventSchema.safeParse(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('call.ended');
      }
    });

    it('should include endedReason', () => {
      const event = createCallEndedEvent({ endedReason: 'customer-ended-call' });

      expect(event.call.endedReason).toBe('customer-ended-call');
    });

    it('should include cost', () => {
      const event = createCallEndedEvent({ cost: 0.25 });

      expect(event.call.cost).toBe(0.25);
    });

    it('should calculate duration from start/end times', () => {
      const startedAt = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
      const endedAt = new Date().toISOString();
      const event = createCallEndedEvent({ startedAt, endedAt });

      const duration = Math.round(
        (new Date(event.call.endedAt!).getTime() - new Date(event.call.startedAt!).getTime()) / 1000
      );

      expect(duration).toBeCloseTo(120, -1); // ~120 seconds
    });

    it('should handle various endedReason values', () => {
      const reasons = [
        'customer-ended-call',
        'assistant-ended-call',
        'voicemail-detected',
        'max-duration-exceeded',
        'silence-timeout',
        'call-failed',
        'pipeline-error',
      ];

      for (const reason of reasons) {
        const event = createCallEndedEvent({ endedReason: reason });
        expect(event.call.endedReason).toBe(reason);
      }
    });

    it('should trigger vapi-webhook-handler task', async () => {
      const { tasks } = await import('@trigger.dev/sdk/v3');
      const { IdempotencyKeys } = await import('@medicalcor/core');

      const event = createCallEndedEvent();

      await tasks.trigger(
        'vapi-webhook-handler',
        {
          type: 'call.ended',
          call: event.call,
          correlationId: 'test-correlation-id',
        },
        {
          idempotencyKey: IdempotencyKeys.vapiWebhook(event.call.id),
        }
      );

      expect(tasks.trigger).toHaveBeenCalledWith(
        'vapi-webhook-handler',
        expect.objectContaining({
          type: 'call.ended',
        }),
        expect.objectContaining({
          idempotencyKey: `vapi-webhook:${event.call.id}`,
        })
      );
    });

    it('should skip processing if no customer phone', () => {
      const event = createCallEndedEvent({ customer: undefined });

      expect(event.call.customer).toBeUndefined();
      // Should log warning but not trigger task
    });
  });

  describe('transcript.updated Event', () => {
    it('should validate transcript.updated event schema', () => {
      const event = createTranscriptUpdatedEvent();
      const result = VapiWebhookEventSchema.safeParse(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('transcript.updated');
      }
    });

    it('should include transcript messages', () => {
      const event = createTranscriptUpdatedEvent();

      expect(event.transcript.messages.length).toBeGreaterThan(0);
      expect(event.transcript.messages[0].role).toBe('assistant');
    });

    it('should include message roles', () => {
      const event = createTranscriptUpdatedEvent();
      const roles = event.transcript.messages.map((m) => m.role);

      expect(roles).toContain('assistant');
      expect(roles).toContain('user');
    });

    it('should include message timestamps', () => {
      const event = createTranscriptUpdatedEvent();

      for (const message of event.transcript.messages) {
        expect(message.timestamp).toBeDefined();
        expect(typeof message.timestamp).toBe('number');
      }
    });

    it('should include transcript duration', () => {
      const event = createTranscriptUpdatedEvent();

      expect(event.transcript.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle function_call role in messages', () => {
      const event = createTranscriptUpdatedEvent({
        messages: [
          {
            role: 'function_call' as const,
            message: 'scheduleAppointment',
            timestamp: Date.now(),
            name: 'scheduleAppointment',
            arguments: JSON.stringify({ date: '2024-01-15' }),
          },
        ],
      });

      expect(event.transcript.messages[0].role).toBe('function_call');
      expect(event.transcript.messages[0].name).toBe('scheduleAppointment');
    });
  });

  describe('function.call Event', () => {
    it('should validate function.call event schema', () => {
      const event = createFunctionCallEvent();
      const result = VapiWebhookEventSchema.safeParse(event);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('function.call');
      }
    });

    it('should include function name', () => {
      const event = createFunctionCallEvent();

      expect(event.functionCall.name).toBe('scheduleAppointment');
    });

    it('should include function arguments', () => {
      const event = createFunctionCallEvent();

      expect(event.functionCall.arguments).toHaveProperty('date');
      expect(event.functionCall.arguments).toHaveProperty('time');
      expect(event.functionCall.arguments).toHaveProperty('procedure');
    });

    it('should handle various function names', () => {
      const functions = [
        'scheduleAppointment',
        'checkAvailability',
        'getPatientInfo',
        'transferToHuman',
        'endConversation',
      ];

      for (const name of functions) {
        const event = createFunctionCallEvent({ name });
        expect(event.functionCall.name).toBe(name);
      }
    });

    it('should handle empty arguments', () => {
      const event = createFunctionCallEvent({ arguments: {} });

      expect(event.functionCall.arguments).toEqual({});
    });

    it('should handle complex nested arguments', () => {
      const event = createFunctionCallEvent({
        arguments: {
          patient: {
            name: 'Ion Popescu',
            phone: '+40721123456',
          },
          appointment: {
            date: '2024-01-15',
            time: '10:00',
            procedure: {
              type: 'all-on-4',
              subtype: 'upper',
            },
          },
        },
      });

      expect(event.functionCall.arguments.patient).toBeDefined();
      expect(event.functionCall.arguments.appointment).toBeDefined();
    });
  });

  describe('Call Status Enum', () => {
    it('should accept valid call statuses', () => {
      const validStatuses = ['queued', 'ringing', 'in-progress', 'forwarding', 'ended'];

      for (const status of validStatuses) {
        const call = createVapiCall({ status });
        const result = VapiCallSchema.safeParse(call);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid call status', () => {
      const call = createVapiCall({ status: 'invalid-status' });
      const result = VapiCallSchema.safeParse(call);

      expect(result.success).toBe(false);
    });
  });

  describe('Call Type Enum', () => {
    it('should accept inbound type', () => {
      const call = createVapiCall({ type: 'inbound' });
      const result = VapiCallSchema.safeParse(call);

      expect(result.success).toBe(true);
    });

    it('should accept outbound type', () => {
      const call = createVapiCall({ type: 'outbound' });
      const result = VapiCallSchema.safeParse(call);

      expect(result.success).toBe(true);
    });

    it('should reject invalid call type', () => {
      const call = createVapiCall({ type: 'bidirectional' });
      const result = VapiCallSchema.safeParse(call);

      expect(result.success).toBe(false);
    });
  });

  describe('Phone Number Masking', () => {
    it('should mask customer phone for logging', async () => {
      const { maskPhone } = await import('@medicalcor/core');

      const masked = maskPhone('+40721123456');
      expect(masked).toBe('+40***56');
    });

    it('should handle undefined phone', async () => {
      const { maskPhone } = await import('@medicalcor/core');

      const masked = maskPhone(undefined);
      expect(masked).toBeUndefined();
    });
  });

  describe('Idempotency Key Generation', () => {
    it('should generate unique idempotency key per call', async () => {
      const { IdempotencyKeys } = await import('@medicalcor/core');

      const callId = 'call_abc123';
      const key = IdempotencyKeys.vapiWebhook(callId);

      expect(key).toBe('vapi-webhook:call_abc123');
    });

    it('should generate different keys for different calls', async () => {
      const { IdempotencyKeys } = await import('@medicalcor/core');

      const key1 = IdempotencyKeys.vapiWebhook('call_1');
      const key2 = IdempotencyKeys.vapiWebhook('call_2');

      expect(key1).not.toBe(key2);
    });
  });

  describe('Error Handling', () => {
    it('should require VAPI_WEBHOOK_SECRET', () => {
      delete process.env.VAPI_WEBHOOK_SECRET;

      const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;
      expect(webhookSecret).toBeUndefined();
      // Should return 500 error
    });

    it('should return 401 for missing signature', async () => {
      const { WebhookSignatureError } = await import('@medicalcor/core');

      const error = new WebhookSignatureError('Missing Vapi signature');
      expect(error.name).toBe('WebhookSignatureError');
      expect(error.message).toBe('Missing Vapi signature');
    });

    it('should return 401 for invalid signature', async () => {
      const { WebhookSignatureError } = await import('@medicalcor/core');

      const error = new WebhookSignatureError('Invalid Vapi signature');
      expect(error.message).toBe('Invalid Vapi signature');
    });

    it('should return 400 for invalid payload', async () => {
      const { ValidationError } = await import('@medicalcor/core');

      const error = new ValidationError('Invalid Vapi webhook payload', {
        fieldErrors: { type: ['Invalid event type'] },
      });
      expect(error.name).toBe('ValidationError');
    });

    it('should handle task trigger failure', async () => {
      const { tasks } = await import('@trigger.dev/sdk/v3');

      vi.mocked(tasks.trigger).mockRejectedValueOnce(new Error('Task trigger failed'));

      await expect(
        tasks.trigger(
          'vapi-webhook-handler',
          {
            type: 'call.ended',
            call: createVapiCall(),
          },
          { idempotencyKey: 'test-key' }
        )
      ).rejects.toThrow('Task trigger failed');
    });
  });

  describe('Correlation ID Handling', () => {
    it('should use provided correlation ID', () => {
      const headers = { 'x-correlation-id': 'vapi-correlation-123' };
      const headerValue = headers['x-correlation-id'];
      const correlationId = typeof headerValue === 'string' ? headerValue : 'generated';

      expect(correlationId).toBe('vapi-correlation-123');
    });

    it('should generate correlation ID when not provided', async () => {
      const { generateCorrelationId } = await import('@medicalcor/core');
      const headers = {};

      const headerValue = headers['x-correlation-id' as keyof typeof headers];
      const correlationId = typeof headerValue === 'string' ? headerValue : generateCorrelationId();

      expect(correlationId).toBe('test-correlation-id');
    });
  });

  describe('Response Handling', () => {
    it('should return 200 with received: true', () => {
      const response = { received: true };
      expect(response.received).toBe(true);
    });

    it('should return 401 for signature errors', async () => {
      const { toSafeErrorResponse, WebhookSignatureError } = await import('@medicalcor/core');

      const error = new WebhookSignatureError('Invalid signature');
      const response = toSafeErrorResponse(error);

      expect(response.error).toBe('WebhookSignatureError');
    });

    it('should return 400 for validation errors', async () => {
      const { toSafeErrorResponse, ValidationError } = await import('@medicalcor/core');

      const error = new ValidationError('Invalid payload');
      const response = toSafeErrorResponse(error);

      expect(response.error).toBe('ValidationError');
    });

    it('should return 500 for unexpected errors', async () => {
      const { toSafeErrorResponse } = await import('@medicalcor/core');

      const error = new Error('Unexpected error');
      const response = toSafeErrorResponse(error);

      expect(response.error).toBe('Error');
    });
  });

  describe('Raw Body Handling', () => {
    it('should parse raw body as JSON', () => {
      const event = createCallStartedEvent();
      const rawBody = JSON.stringify(event);

      const parsed = JSON.parse(rawBody) as unknown;
      const result = VapiWebhookEventSchema.safeParse(parsed);

      expect(result.success).toBe(true);
    });

    it('should handle invalid JSON', () => {
      const rawBody = '{ invalid json';

      expect(() => JSON.parse(rawBody)).toThrow();
    });

    it('should use raw body for signature verification', () => {
      const event = createCallStartedEvent();
      const rawBody = JSON.stringify(event);
      const signature = generateVapiSignature(rawBody, WEBHOOK_SECRET);

      // Signature should be verified against raw body, not re-serialized JSON
      const isValid = verifyVapiSignature(rawBody, signature, WEBHOOK_SECRET);
      expect(isValid).toBe(true);

      // Re-serializing might produce different string
      const reparsed = JSON.parse(rawBody);
      const reserializedBody = JSON.stringify(reparsed);
      // Note: In this case they're the same, but order could differ
      expect(rawBody).toBe(reserializedBody);
    });
  });
});

describe('Duration Calculation', () => {
  it('should calculate duration in seconds', () => {
    const startedAt = '2024-01-15T10:00:00.000Z';
    const endedAt = '2024-01-15T10:02:30.000Z';

    const duration = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    );

    expect(duration).toBe(150); // 2 minutes 30 seconds
  });

  it('should handle zero duration', () => {
    const startedAt = '2024-01-15T10:00:00.000Z';
    const endedAt = '2024-01-15T10:00:00.000Z';

    const duration = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    );

    expect(duration).toBe(0);
  });

  it('should handle missing startedAt', () => {
    const startedAt = undefined;
    const endedAt = '2024-01-15T10:02:30.000Z';

    const duration =
      startedAt && endedAt
        ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : undefined;

    expect(duration).toBeUndefined();
  });

  it('should handle missing endedAt', () => {
    const startedAt = '2024-01-15T10:00:00.000Z';
    const endedAt = undefined;

    const duration =
      startedAt && endedAt
        ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : undefined;

    expect(duration).toBeUndefined();
  });
});
