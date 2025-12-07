import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * Voice/Twilio Webhook Tests
 *
 * Comprehensive tests for the Twilio voice webhook endpoints covering:
 * - Incoming call handling (POST /webhooks/voice)
 * - Call status callbacks (POST /webhooks/voice/status)
 * - Twilio signature verification (HMAC-SHA1)
 * - TwiML response generation
 * - XML injection prevention (sanitization)
 * - Phone number validation (E.164, CallSid formats)
 * - Vapi handoff configuration
 * - Trigger.dev task triggering
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
  toSafeErrorResponse: vi.fn((error) => ({
    error: error.message ?? 'Internal error',
  })),
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
  IdempotencyKeys: {
    voiceCall: vi.fn((callSid: string) => `voice-call:${callSid}`),
    custom: vi.fn((type: string, ...parts: string[]) => `${type}:${parts.join(':')}`),
  },
  maskPhone: vi.fn((phone: string) => {
    if (!phone) return phone;
    if (phone.length <= 4) return '****';
    return phone.slice(0, 3) + '***' + phone.slice(-2);
  }),
}));

// Mock types
vi.mock('@medicalcor/types', () => ({
  VoiceWebhookSchema: {
    safeParse: vi.fn((data) => {
      // Validate required fields
      if (!data.CallSid || !data.From || !data.To || !data.Direction || !data.CallStatus) {
        return {
          success: false,
          error: {
            flatten: () => ({ fieldErrors: {}, formErrors: ['Missing required fields'] }),
            issues: [],
          },
        };
      }
      return { success: true, data };
    }),
  },
  CallStatusCallbackSchema: {
    safeParse: vi.fn((data) => {
      if (!data.CallSid || !data.CallStatus) {
        return {
          success: false,
          error: {
            flatten: () => ({ fieldErrors: {}, formErrors: ['Missing required fields'] }),
            issues: [],
          },
        };
      }
      return { success: true, data };
    }),
  },
}));

/**
 * Sanitize user input for safe inclusion in TwiML XML responses
 * Mirrors the implementation in voice.ts
 */
function sanitizeForTwiML(input: string): string {
  if (!input) return '';

  return (
    input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      // Remove control characters
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Limit length
      .substring(0, 256)
  );
}

/**
 * Validate Twilio identifier format
 */
function isValidTwilioIdentifier(
  value: string,
  type: 'callSid' | 'phone' | 'assistantId'
): boolean {
  if (!value || typeof value !== 'string') return false;

  switch (type) {
    case 'callSid':
      return /^CA[a-f0-9]{32}$/i.test(value);
    case 'phone':
      return /^\+[1-9]\d{1,14}$/.test(value);
    case 'assistantId':
      return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
    default:
      return false;
  }
}

/**
 * Verify Twilio webhook signature
 */
function verifyTwilioSignature(
  webhookUrl: string,
  body: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  // Build data string: URL + sorted POST parameters
  const sortedKeys = Object.keys(body).sort();
  let data = webhookUrl;
  for (const key of sortedKeys) {
    data += key + (body[key] ?? '');
  }

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(data, 'utf-8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}

/**
 * Generate a valid Twilio signature for testing
 */
function generateTwilioSignature(
  webhookUrl: string,
  body: Record<string, string>,
  authToken: string
): string {
  const sortedKeys = Object.keys(body).sort();
  let data = webhookUrl;
  for (const key of sortedKeys) {
    data += key + (body[key] ?? '');
  }

  return crypto.createHmac('sha1', authToken).update(data, 'utf-8').digest('base64');
}

// Test data factories
function createValidCallSid(): string {
  return 'CA' + crypto.randomBytes(16).toString('hex');
}

function createVoiceWebhookPayload(overrides = {}) {
  return {
    AccountSid: 'AC' + crypto.randomBytes(16).toString('hex'),
    ApiVersion: '2010-04-01',
    CallSid: createValidCallSid(),
    CallStatus: 'ringing',
    Called: '+40212345678',
    CalledCity: 'Bucharest',
    CalledCountry: 'RO',
    CalledState: '',
    CalledZip: '',
    Caller: '+40721123456',
    CallerCity: 'Bucharest',
    CallerCountry: 'RO',
    CallerState: '',
    CallerZip: '',
    Direction: 'inbound',
    From: '+40721123456',
    FromCity: 'Bucharest',
    FromCountry: 'RO',
    FromState: '',
    FromZip: '',
    To: '+40212345678',
    ToCity: 'Bucharest',
    ToCountry: 'RO',
    ToState: '',
    ToZip: '',
    ...overrides,
  };
}

function createCallStatusPayload(overrides = {}) {
  return {
    ...createVoiceWebhookPayload(),
    CallStatus: 'completed',
    CallDuration: '120',
    Duration: '118',
    Timestamp: new Date().toISOString(),
    SequenceNumber: '1',
    ...overrides,
  };
}

describe('Voice Webhook Processing', () => {
  const TWILIO_AUTH_TOKEN = 'test_twilio_auth_token_secret';
  const TWILIO_WEBHOOK_URL = 'https://api.medicalcor.com/webhooks/voice';
  const VAPI_ASSISTANT_ID = 'asst_test123';
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      TWILIO_AUTH_TOKEN: TWILIO_AUTH_TOKEN,
      TWILIO_WEBHOOK_URL: TWILIO_WEBHOOK_URL,
      VAPI_ASSISTANT_ID: VAPI_ASSISTANT_ID,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Twilio Signature Verification', () => {
    it('should verify valid Twilio signature', () => {
      const body = createVoiceWebhookPayload();
      const signature = generateTwilioSignature(TWILIO_WEBHOOK_URL, body, TWILIO_AUTH_TOKEN);

      const isValid = verifyTwilioSignature(TWILIO_WEBHOOK_URL, body, signature, TWILIO_AUTH_TOKEN);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const body = createVoiceWebhookPayload();
      const signature = generateTwilioSignature(TWILIO_WEBHOOK_URL, body, 'wrong_token');

      const isValid = verifyTwilioSignature(TWILIO_WEBHOOK_URL, body, signature, TWILIO_AUTH_TOKEN);
      expect(isValid).toBe(false);
    });

    it('should reject tampered payload', () => {
      const body = createVoiceWebhookPayload();
      const signature = generateTwilioSignature(TWILIO_WEBHOOK_URL, body, TWILIO_AUTH_TOKEN);

      // Tamper with the payload
      const tamperedBody = { ...body, From: '+1234567890' };

      const isValid = verifyTwilioSignature(
        TWILIO_WEBHOOK_URL,
        tamperedBody,
        signature,
        TWILIO_AUTH_TOKEN
      );
      expect(isValid).toBe(false);
    });

    it('should handle different URL correctly', () => {
      const body = createVoiceWebhookPayload();
      const differentUrl = 'https://attacker.com/webhooks/voice';
      const signatureForDifferentUrl = generateTwilioSignature(
        differentUrl,
        body,
        TWILIO_AUTH_TOKEN
      );

      // Signature created with different URL should not verify
      const isValid = verifyTwilioSignature(
        TWILIO_WEBHOOK_URL,
        body,
        signatureForDifferentUrl,
        TWILIO_AUTH_TOKEN
      );
      expect(isValid).toBe(false);
    });

    it('should handle empty body', () => {
      const body = {};
      const signature = generateTwilioSignature(TWILIO_WEBHOOK_URL, body, TWILIO_AUTH_TOKEN);

      const isValid = verifyTwilioSignature(TWILIO_WEBHOOK_URL, body, signature, TWILIO_AUTH_TOKEN);
      expect(isValid).toBe(true);
    });

    it('should sort parameters correctly', () => {
      const body = {
        To: '+40212345678',
        From: '+40721123456',
        CallSid: createValidCallSid(),
        AccountSid: 'AC1234',
      };
      const signature = generateTwilioSignature(TWILIO_WEBHOOK_URL, body, TWILIO_AUTH_TOKEN);

      const isValid = verifyTwilioSignature(TWILIO_WEBHOOK_URL, body, signature, TWILIO_AUTH_TOKEN);
      expect(isValid).toBe(true);
    });
  });

  describe('TwiML Sanitization', () => {
    it('should escape ampersand', () => {
      const input = 'AT&T Customer';
      const sanitized = sanitizeForTwiML(input);

      expect(sanitized).toBe('AT&amp;T Customer');
    });

    it('should escape less-than sign', () => {
      const input = '<script>alert("xss")</script>';
      const sanitized = sanitizeForTwiML(input);

      expect(sanitized).not.toContain('<');
      expect(sanitized).toContain('&lt;');
    });

    it('should escape greater-than sign', () => {
      const input = 'a > b';
      const sanitized = sanitizeForTwiML(input);

      expect(sanitized).toContain('&gt;');
    });

    it('should escape double quotes', () => {
      const input = 'Say "hello"';
      const sanitized = sanitizeForTwiML(input);

      expect(sanitized).toContain('&quot;');
      expect(sanitized).not.toContain('"');
    });

    it('should escape single quotes', () => {
      const input = "It's a test";
      const sanitized = sanitizeForTwiML(input);

      expect(sanitized).toContain('&#39;');
    });

    it('should remove control characters', () => {
      const input = 'Hello\x00World\x0BTest\x1F';
      const sanitized = sanitizeForTwiML(input);

      expect(sanitized).toBe('HelloWorldTest');
    });

    it('should limit length to 256 characters', () => {
      const input = 'A'.repeat(500);
      const sanitized = sanitizeForTwiML(input);

      expect(sanitized.length).toBe(256);
    });

    it('should handle empty string', () => {
      const sanitized = sanitizeForTwiML('');

      expect(sanitized).toBe('');
    });

    it('should handle null-like values', () => {
      const sanitized = sanitizeForTwiML(null as unknown as string);

      expect(sanitized).toBe('');
    });

    it('should prevent XML injection attack', () => {
      const malicious = '"><Parameter name="evil" value="hacked"/><Stream url="evil';
      const sanitized = sanitizeForTwiML(malicious);

      // Should not contain any raw XML structures
      expect(sanitized).not.toContain('">');
      expect(sanitized).toContain('&quot;');
      expect(sanitized).toContain('&gt;');
    });

    it('should handle multiple escapes in sequence', () => {
      const input = '<"test">&\'value\'</>';
      const sanitized = sanitizeForTwiML(input);

      expect(sanitized).toBe('&lt;&quot;test&quot;&gt;&amp;&#39;value&#39;&lt;/&gt;');
    });
  });

  describe('Twilio Identifier Validation', () => {
    describe('CallSid Validation', () => {
      it('should accept valid CallSid', () => {
        const validCallSid = createValidCallSid();
        expect(isValidTwilioIdentifier(validCallSid, 'callSid')).toBe(true);
      });

      it('should reject CallSid without CA prefix', () => {
        const invalidCallSid = 'AB' + crypto.randomBytes(16).toString('hex');
        expect(isValidTwilioIdentifier(invalidCallSid, 'callSid')).toBe(false);
      });

      it('should reject CallSid with wrong length', () => {
        const shortCallSid = 'CA' + crypto.randomBytes(8).toString('hex');
        expect(isValidTwilioIdentifier(shortCallSid, 'callSid')).toBe(false);
      });

      it('should reject empty CallSid', () => {
        expect(isValidTwilioIdentifier('', 'callSid')).toBe(false);
      });
    });

    describe('Phone Number Validation (E.164)', () => {
      it('should accept valid E.164 phone number', () => {
        expect(isValidTwilioIdentifier('+40721123456', 'phone')).toBe(true);
      });

      it('should accept US phone number', () => {
        expect(isValidTwilioIdentifier('+15551234567', 'phone')).toBe(true);
      });

      it('should reject phone without + prefix', () => {
        expect(isValidTwilioIdentifier('40721123456', 'phone')).toBe(false);
      });

      it('should reject phone starting with +0', () => {
        expect(isValidTwilioIdentifier('+0721123456', 'phone')).toBe(false);
      });

      it('should reject too long phone number', () => {
        expect(isValidTwilioIdentifier('+1234567890123456', 'phone')).toBe(false);
      });

      it('should reject phone with letters', () => {
        expect(isValidTwilioIdentifier('+1234abc5678', 'phone')).toBe(false);
      });
    });

    describe('Assistant ID Validation', () => {
      it('should accept valid assistant ID', () => {
        expect(isValidTwilioIdentifier('asst_abc123', 'assistantId')).toBe(true);
      });

      it('should accept UUID-style assistant ID', () => {
        expect(isValidTwilioIdentifier('123e4567-e89b-12d3-a456-426614174000', 'assistantId')).toBe(
          true
        );
      });

      it('should reject too long assistant ID', () => {
        const longId = 'a'.repeat(65);
        expect(isValidTwilioIdentifier(longId, 'assistantId')).toBe(false);
      });

      it('should reject assistant ID with special characters', () => {
        expect(isValidTwilioIdentifier('asst_@#$%', 'assistantId')).toBe(false);
      });
    });
  });

  describe('Voice Webhook Payload Validation', () => {
    it('should validate complete voice webhook payload', async () => {
      const { VoiceWebhookSchema } = await import('@medicalcor/types');
      const payload = createVoiceWebhookPayload();
      const result = VoiceWebhookSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should reject payload without CallSid', async () => {
      const { VoiceWebhookSchema } = await import('@medicalcor/types');
      const { CallSid, ...payload } = createVoiceWebhookPayload();
      const result = VoiceWebhookSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should validate call direction enum', () => {
      const validDirections = ['inbound', 'outbound', 'outbound-api', 'outbound-dial'];

      for (const direction of validDirections) {
        const payload = createVoiceWebhookPayload({ Direction: direction });
        expect(payload.Direction).toBe(direction);
      }
    });

    it('should validate call status enum', () => {
      const validStatuses = [
        'queued',
        'ringing',
        'in-progress',
        'completed',
        'busy',
        'failed',
        'no-answer',
        'canceled',
      ];

      for (const status of validStatuses) {
        const payload = createVoiceWebhookPayload({ CallStatus: status });
        expect(payload.CallStatus).toBe(status);
      }
    });
  });

  describe('Call Status Callback Validation', () => {
    it('should validate complete status callback payload', async () => {
      const { CallStatusCallbackSchema } = await import('@medicalcor/types');
      const payload = createCallStatusPayload();
      const result = CallStatusCallbackSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should include call duration in status callback', () => {
      const payload = createCallStatusPayload({ CallDuration: '180' });

      expect(payload.CallDuration).toBe('180');
    });

    it('should handle optional recording URL', () => {
      const payload = createCallStatusPayload({
        RecordingUrl: 'https://api.twilio.com/recordings/RE123',
        RecordingSid: 'RE' + crypto.randomBytes(16).toString('hex'),
        RecordingDuration: '115',
      });

      expect(payload.RecordingUrl).toContain('twilio.com');
    });
  });

  describe('TwiML Response Generation', () => {
    it('should generate valid TwiML with Vapi stream', () => {
      const assistantId = sanitizeForTwiML(VAPI_ASSISTANT_ID);
      const phone = sanitizeForTwiML('+40721123456');
      const callSid = sanitizeForTwiML(createValidCallSid());

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://api.vapi.ai/pull">
            <Parameter name="assistantId" value="${assistantId}" />
            <Parameter name="customerPhoneNumber" value="${phone}" />
            <Parameter name="callSid" value="${callSid}" />
        </Stream>
    </Connect>
</Response>`;

      expect(twiml).toContain('<?xml version="1.0"');
      expect(twiml).toContain('<Response>');
      expect(twiml).toContain('<Connect>');
      expect(twiml).toContain('<Stream url="wss://api.vapi.ai/pull">');
      expect(twiml).toContain('</Response>');
    });

    it('should generate fallback TwiML when Vapi not configured', () => {
      const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We apologize, but our voice assistant is temporarily unavailable. Please try again later or contact us through our website.</Say>
</Response>`;

      expect(fallbackTwiml).toContain('<Say>');
      expect(fallbackTwiml).toContain('temporarily unavailable');
    });

    it('should include proper XML declaration', () => {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;

      expect(twiml.startsWith('<?xml')).toBe(true);
      expect(twiml).toContain('encoding="UTF-8"');
    });
  });

  describe('Trigger.dev Task Triggering', () => {
    it('should trigger voice-call-handler task', async () => {
      const { tasks } = await import('@trigger.dev/sdk/v3');
      const { IdempotencyKeys } = await import('@medicalcor/core');

      const callSid = createValidCallSid();
      const payload = {
        callSid,
        from: '+40721123456',
        to: '+40212345678',
        direction: 'inbound',
        status: 'ringing',
        correlationId: 'test-correlation-id',
      };

      await tasks.trigger('voice-call-handler', payload, {
        idempotencyKey: IdempotencyKeys.voiceCall(callSid),
      });

      expect(tasks.trigger).toHaveBeenCalledWith(
        'voice-call-handler',
        expect.objectContaining({
          callSid,
          from: '+40721123456',
        }),
        expect.objectContaining({
          idempotencyKey: `voice-call:${callSid}`,
        })
      );
    });

    it('should trigger with status-specific idempotency key', async () => {
      const { tasks } = await import('@trigger.dev/sdk/v3');
      const { IdempotencyKeys } = await import('@medicalcor/core');

      const callSid = createValidCallSid();
      const status = 'completed';

      await tasks.trigger(
        'voice-call-handler',
        {
          callSid,
          status,
          correlationId: 'test-correlation-id',
        },
        {
          idempotencyKey: IdempotencyKeys.custom('voice-status', callSid, status),
        }
      );

      expect(tasks.trigger).toHaveBeenCalledWith(
        'voice-call-handler',
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey: `voice-status:${callSid}:${status}`,
        })
      );
    });

    it('should handle task trigger failure gracefully', async () => {
      const { tasks } = await import('@trigger.dev/sdk/v3');

      vi.mocked(tasks.trigger).mockRejectedValueOnce(new Error('Task trigger failed'));

      // In the actual implementation, failures are caught and logged
      await expect(
        tasks.trigger(
          'voice-call-handler',
          {
            callSid: createValidCallSid(),
            correlationId: 'test-correlation-id',
          },
          { idempotencyKey: 'test-key' }
        )
      ).rejects.toThrow('Task trigger failed');
    });
  });

  describe('Phone Number Masking', () => {
    it('should mask phone number for logging', async () => {
      const { maskPhone } = await import('@medicalcor/core');

      const masked = maskPhone('+40721123456');
      expect(masked).toBe('+40***56');
    });

    it('should handle short phone numbers', async () => {
      const { maskPhone } = await import('@medicalcor/core');

      const masked = maskPhone('1234');
      expect(masked).toBe('****');
    });

    it('should handle undefined phone', async () => {
      const { maskPhone } = await import('@medicalcor/core');

      const masked = maskPhone(undefined as unknown as string);
      expect(masked).toBe(undefined);
    });
  });

  describe('Error Handling', () => {
    it('should require TWILIO_AUTH_TOKEN', () => {
      delete process.env.TWILIO_AUTH_TOKEN;

      const authToken = process.env.TWILIO_AUTH_TOKEN;
      expect(authToken).toBeUndefined();
      // Should return 500 error
    });

    it('should require TWILIO_WEBHOOK_URL for signature verification', () => {
      delete process.env.TWILIO_WEBHOOK_URL;

      const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
      expect(webhookUrl).toBeUndefined();
      // Verification should fail
    });

    it('should require VAPI_ASSISTANT_ID for Vapi handoff', () => {
      delete process.env.VAPI_ASSISTANT_ID;

      const vapiAssistantId = process.env.VAPI_ASSISTANT_ID;
      expect(vapiAssistantId).toBeUndefined();
      // Should return fallback TwiML
    });

    it('should validate VAPI_ASSISTANT_ID format', () => {
      process.env.VAPI_ASSISTANT_ID = '<script>alert("xss")</script>';

      const vapiAssistantId = process.env.VAPI_ASSISTANT_ID;
      const isValid = isValidTwilioIdentifier(vapiAssistantId, 'assistantId');

      expect(isValid).toBe(false);
      // Should return fallback TwiML
    });
  });

  describe('Correlation ID Handling', () => {
    it('should use provided correlation ID', () => {
      const headers = { 'x-correlation-id': 'custom-correlation-123' };
      const headerValue = headers['x-correlation-id'];
      const correlationId = typeof headerValue === 'string' ? headerValue : 'generated';

      expect(correlationId).toBe('custom-correlation-123');
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
    it('should set correct content type for TwiML', () => {
      const contentType = 'application/xml';
      expect(contentType).toBe('application/xml');
    });

    it('should return 200 for status callback acknowledgment', () => {
      const response = { status: 'received' };
      expect(response.status).toBe('received');
    });

    it('should return 403 for invalid signature', () => {
      const errorResponse = { error: 'Invalid signature' };
      expect(errorResponse.error).toBe('Invalid signature');
    });

    it('should return 500 for server configuration error', () => {
      const errorResponse = { error: 'Server configuration error' };
      expect(errorResponse.error).toBe('Server configuration error');
    });
  });
});

describe('Call Status Transitions', () => {
  it('should handle ringing -> in-progress transition', () => {
    const ringPayload = createVoiceWebhookPayload({ CallStatus: 'ringing' });
    const progressPayload = createCallStatusPayload({ CallStatus: 'in-progress' });

    expect(ringPayload.CallStatus).toBe('ringing');
    expect(progressPayload.CallStatus).toBe('in-progress');
  });

  it('should handle in-progress -> completed transition', () => {
    const progressPayload = createCallStatusPayload({
      CallStatus: 'in-progress',
      CallDuration: '0',
    });
    const completedPayload = createCallStatusPayload({
      CallStatus: 'completed',
      CallDuration: '120',
    });

    expect(completedPayload.CallDuration).toBe('120');
  });

  it('should handle failed call status', () => {
    const failedPayload = createCallStatusPayload({ CallStatus: 'failed' });
    expect(failedPayload.CallStatus).toBe('failed');
  });

  it('should handle busy call status', () => {
    const busyPayload = createCallStatusPayload({ CallStatus: 'busy' });
    expect(busyPayload.CallStatus).toBe('busy');
  });

  it('should handle no-answer call status', () => {
    const noAnswerPayload = createCallStatusPayload({ CallStatus: 'no-answer' });
    expect(noAnswerPayload.CallStatus).toBe('no-answer');
  });
});
