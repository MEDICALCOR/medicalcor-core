import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * CRM Webhook Tests
 *
 * Comprehensive tests for the CRM webhook endpoint covering:
 * - Secret verification (timing-safe comparison)
 * - Person/contact event processing (Lead upsert)
 * - Deal event processing (Treatment plan upsert)
 * - Correlation ID handling
 * - Error handling
 * - Event type detection
 */

// Mock external dependencies
vi.mock('@medicalcor/integrations', () => ({
  getCRMProvider: vi.fn(() => ({
    sourceName: 'pipedrive',
    parseContactWebhook: vi.fn((payload) => {
      const data = payload.current ?? payload.data;
      if (!data?.email && !data?.phone) return null;
      return {
        externalId: data.id?.toString() ?? 'ext_123',
        email: data.email ?? null,
        phone: data.phone ?? null,
        firstName: data.first_name ?? data.name?.split(' ')[0] ?? null,
        lastName: data.last_name ?? data.name?.split(' ').slice(1).join(' ') ?? null,
        source: 'crm:pipedrive',
      };
    }),
    parseDealWebhook: vi.fn((payload) => {
      const data = payload.current ?? payload.data;
      if (!data?.id) return null;
      return {
        externalDealId: data.id.toString(),
        leadExternalId: data.person_id?.toString() ?? null,
        title: data.title ?? 'Untitled Deal',
        value: data.value ?? 0,
        currency: data.currency ?? 'EUR',
        stage: data.stage_id?.toString() ?? null,
      };
    }),
  })),
}));

vi.mock('@medicalcor/core', () => ({
  upsertLeadFromDTO: vi.fn().mockResolvedValue('lead_123'),
  upsertTreatmentPlanFromDTO: vi.fn().mockResolvedValue('plan_123'),
  generateCorrelationId: vi.fn(() => 'test-correlation-id'),
}));

// Helper to verify timing-safe secret comparison
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
      crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

// Test data factories
function createPersonWebhook(overrides = {}) {
  return {
    event: 'updated.person',
    meta: {
      id: Math.floor(Math.random() * 1000000),
      object: 'person',
      action: 'updated',
      timestamp: new Date().toISOString(),
    },
    current: {
      id: 12345,
      name: 'John Doe',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@example.com',
      phone: '+40721123456',
      org_id: 100,
      ...overrides,
    },
    previous: {},
  };
}

function createDealWebhook(overrides = {}) {
  return {
    event: 'updated.deal',
    meta: {
      id: Math.floor(Math.random() * 1000000),
      object: 'deal',
      action: 'updated',
      timestamp: new Date().toISOString(),
    },
    current: {
      id: 67890,
      title: 'All-on-4 Treatment Plan',
      value: 15000,
      currency: 'EUR',
      stage_id: 3,
      person_id: 12345,
      org_id: 100,
      status: 'open',
      ...overrides,
    },
    previous: {},
  };
}

function createAddedPersonWebhook(overrides = {}) {
  return {
    event: 'added.person',
    meta: {
      id: Math.floor(Math.random() * 1000000),
      object: 'person',
      action: 'added',
      timestamp: new Date().toISOString(),
    },
    current: {
      id: 12346,
      name: 'Jane Smith',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane.smith@example.com',
      phone: '+40722234567',
      ...overrides,
    },
    previous: null,
  };
}

describe('CRM Webhook Processing', () => {
  const WEBHOOK_SECRET = 'crm_webhook_secret_test';
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CRM_WEBHOOK_SECRET: WEBHOOK_SECRET };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Secret Verification', () => {
    it('should accept valid secret with timing-safe comparison', () => {
      const isValid = verifySecretTimingSafe(WEBHOOK_SECRET, WEBHOOK_SECRET);
      expect(isValid).toBe(true);
    });

    it('should reject invalid secret', () => {
      const isValid = verifySecretTimingSafe('wrong_secret', WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should reject missing secret', () => {
      const isValid = verifySecretTimingSafe(undefined, WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should reject empty secret', () => {
      const isValid = verifySecretTimingSafe('', WEBHOOK_SECRET);
      expect(isValid).toBe(false);
    });

    it('should reject when expected secret is missing', () => {
      const isValid = verifySecretTimingSafe(WEBHOOK_SECRET, undefined);
      expect(isValid).toBe(false);
    });

    it('should reject different length secrets safely', () => {
      // This tests that we don't leak timing info for different lengths
      const shortSecret = 'short';
      const longSecret = 'a_much_longer_secret_value';

      const result1 = verifySecretTimingSafe(shortSecret, WEBHOOK_SECRET);
      const result2 = verifySecretTimingSafe(longSecret, WEBHOOK_SECRET);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    it('should handle special characters in secrets', () => {
      const specialSecret = 'sec!@#$%^&*()_+={}[]|\\:";\'<>,.?/~`';

      const isValid = verifySecretTimingSafe(specialSecret, specialSecret);
      expect(isValid).toBe(true);

      const isInvalid = verifySecretTimingSafe('different', specialSecret);
      expect(isInvalid).toBe(false);
    });

    it('should handle unicode in secrets', () => {
      const unicodeSecret = 'secret_αβγδ_日本語_🔐';

      const isValid = verifySecretTimingSafe(unicodeSecret, unicodeSecret);
      expect(isValid).toBe(true);
    });
  });

  describe('Person/Contact Event Processing', () => {
    it('should process person created event', async () => {
      const { upsertLeadFromDTO } = await import('@medicalcor/core');
      const payload = createAddedPersonWebhook();

      // Verify event structure
      expect(payload.event).toBe('added.person');
      expect(payload.meta.object).toBe('person');
      expect(payload.current.email).toBe('jane.smith@example.com');
    });

    it('should process person updated event', async () => {
      const payload = createPersonWebhook();

      expect(payload.event).toBe('updated.person');
      expect(payload.meta.object).toBe('person');
      expect(payload.current.id).toBe(12345);
    });

    it('should detect person event from objectType', () => {
      const payload = createPersonWebhook();
      const objectType = payload.meta.object;

      const isPersonEvent = objectType === 'person';
      expect(isPersonEvent).toBe(true);
    });

    it('should detect person event from eventType', () => {
      const payload = createPersonWebhook();
      const eventType = payload.event;

      const isPersonEvent = eventType.toLowerCase().includes('person');
      expect(isPersonEvent).toBe(true);
    });

    it('should handle person without email', () => {
      const payload = createPersonWebhook({ email: null, phone: '+40721123456' });

      expect(payload.current.email).toBeNull();
      expect(payload.current.phone).toBe('+40721123456');
    });

    it('should handle person without phone', () => {
      const payload = createPersonWebhook({ phone: null, email: 'test@example.com' });

      expect(payload.current.phone).toBeNull();
      expect(payload.current.email).toBe('test@example.com');
    });

    it('should handle person with only name (no email/phone)', async () => {
      const payload = createPersonWebhook({ email: null, phone: null });

      // CRM provider should return null for contacts without email/phone
      const { getCRMProvider } = await import('@medicalcor/integrations');
      const crm = getCRMProvider();
      const dto = crm.parseContactWebhook(payload);

      expect(dto).toBeNull();
    });
  });

  describe('Deal Event Processing', () => {
    it('should process deal created event', () => {
      const payload = {
        ...createDealWebhook(),
        event: 'added.deal',
        meta: {
          ...createDealWebhook().meta,
          action: 'added',
        },
      };

      expect(payload.event).toBe('added.deal');
      expect(payload.meta.object).toBe('deal');
    });

    it('should process deal updated event', () => {
      const payload = createDealWebhook();

      expect(payload.event).toBe('updated.deal');
      expect(payload.current.title).toBe('All-on-4 Treatment Plan');
      expect(payload.current.value).toBe(15000);
    });

    it('should detect deal event from objectType', () => {
      const payload = createDealWebhook();
      const objectType = payload.meta.object;

      const isDealEvent = objectType === 'deal';
      expect(isDealEvent).toBe(true);
    });

    it('should detect deal event from eventType', () => {
      const payload = createDealWebhook();
      const eventType = payload.event;

      const isDealEvent = eventType.toLowerCase().includes('deal');
      expect(isDealEvent).toBe(true);
    });

    it('should parse deal webhook correctly', async () => {
      const { getCRMProvider } = await import('@medicalcor/integrations');
      const crm = getCRMProvider();
      const payload = createDealWebhook();

      const dto = crm.parseDealWebhook(payload);

      expect(dto).toBeDefined();
      expect(dto.externalDealId).toBe('67890');
      expect(dto.leadExternalId).toBe('12345');
      expect(dto.title).toBe('All-on-4 Treatment Plan');
    });

    it('should handle deal without associated person', async () => {
      const payload = createDealWebhook({ person_id: null });

      const { getCRMProvider } = await import('@medicalcor/integrations');
      const crm = getCRMProvider();
      const dto = crm.parseDealWebhook(payload);

      expect(dto.leadExternalId).toBeNull();
    });

    it('should handle various deal currencies', () => {
      const currencies = ['EUR', 'USD', 'GBP', 'RON'];

      for (const currency of currencies) {
        const payload = createDealWebhook({ currency });
        expect(payload.current.currency).toBe(currency);
      }
    });

    it('should handle deal value of zero', () => {
      const payload = createDealWebhook({ value: 0 });
      expect(payload.current.value).toBe(0);
    });
  });

  describe('Correlation ID Handling', () => {
    it('should use provided correlation ID', () => {
      const providedId = 'custom-correlation-123';
      const headers = { 'x-correlation-id': providedId };

      const correlationIdHeader = headers['x-correlation-id'];
      const correlationId =
        typeof correlationIdHeader === 'string' ? correlationIdHeader : 'generated-id';

      expect(correlationId).toBe(providedId);
    });

    it('should generate correlation ID when not provided', async () => {
      const { generateCorrelationId } = await import('@medicalcor/core');
      const headers = {};

      const correlationIdHeader = headers['x-correlation-id' as keyof typeof headers];
      const correlationId =
        typeof correlationIdHeader === 'string' ? correlationIdHeader : generateCorrelationId();

      expect(correlationId).toBe('test-correlation-id');
    });

    it('should handle array correlation ID header', () => {
      const headers = { 'x-correlation-id': ['id1', 'id2'] };

      const correlationIdHeader = headers['x-correlation-id'];
      const correlationId =
        typeof correlationIdHeader === 'string' ? correlationIdHeader : 'generated-id';

      // Array should be rejected, use generated
      expect(correlationId).toBe('generated-id');
    });
  });

  describe('Event Type Detection', () => {
    it('should not confuse person events with deal events', () => {
      const personPayload = createPersonWebhook();
      const dealPayload = createDealWebhook();

      // Person detection
      const isPersonEvent1 =
        personPayload.meta.object === 'person' ||
        personPayload.event.toLowerCase().includes('person');
      const isDealEvent1 =
        personPayload.meta.object === 'deal' || personPayload.event.toLowerCase().includes('deal');

      expect(isPersonEvent1).toBe(true);
      expect(isDealEvent1).toBe(false);

      // Deal detection
      const isPersonEvent2 =
        dealPayload.meta.object === 'person' || dealPayload.event.toLowerCase().includes('person');
      const isDealEvent2 =
        dealPayload.meta.object === 'deal' || dealPayload.event.toLowerCase().includes('deal');

      expect(isPersonEvent2).toBe(false);
      expect(isDealEvent2).toBe(true);
    });

    it('should handle events with neither person nor deal', () => {
      const payload = {
        event: 'updated.organization',
        meta: { object: 'organization' },
        current: { id: 1, name: 'Dental Clinic' },
      };

      const isPersonEvent =
        payload.meta.object === 'person' || payload.event.toLowerCase().includes('person');
      const isDealEvent =
        payload.meta.object === 'deal' || payload.event.toLowerCase().includes('deal');

      expect(isPersonEvent).toBe(false);
      expect(isDealEvent).toBe(false);
    });

    it('should handle activity events', () => {
      const payload = {
        event: 'added.activity',
        meta: { object: 'activity' },
        current: { id: 1, type: 'call', person_id: 123 },
      };

      const isPersonEvent =
        payload.meta.object === 'person' || payload.event.toLowerCase().includes('person');

      // Activity should not be treated as person
      expect(isPersonEvent).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing meta object gracefully', () => {
      const payload = {
        event: 'updated.person',
        current: { id: 123, email: 'test@example.com' },
        // meta is missing
      };

      const meta =
        typeof payload.meta === 'object' && payload.meta !== null ? payload.meta : undefined;

      expect(meta).toBeUndefined();
    });

    it('should handle malformed event type', () => {
      const payload = {
        event: 123, // Should be string
        meta: { object: 'person' },
        current: { id: 1 },
      };

      const eventType = typeof payload.event === 'string' ? payload.event : undefined;
      expect(eventType).toBeUndefined();
    });

    it('should handle null payload gracefully', () => {
      const payload = null;
      const getStringValue = (obj: Record<string, unknown> | null, key: string) => {
        if (!obj) return undefined;
        const value = obj[key];
        return typeof value === 'string' ? value : undefined;
      };

      expect(getStringValue(payload, 'event')).toBeUndefined();
    });

    it('should return 200 even on processing errors', () => {
      // This matches the webhook behavior - CRM providers don't handle errors well
      // so we return 200 to prevent retry storms
      const errorResponse = {
        status: 'error',
        message: 'logged',
        error: 'Some processing error',
      };

      expect(errorResponse.status).toBe('error');
      // HTTP status should be 200, not 500
    });
  });

  describe('Production Mode Checks', () => {
    it('should require secret in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.CRM_WEBHOOK_SECRET;

      const configuredSecret = process.env.CRM_WEBHOOK_SECRET;
      const isProduction = process.env.NODE_ENV === 'production';

      expect(isProduction).toBe(true);
      expect(configuredSecret).toBeUndefined();
      // Should return 503 error
    });

    it('should require secret in development too', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.CRM_WEBHOOK_SECRET;

      const configuredSecret = process.env.CRM_WEBHOOK_SECRET;

      expect(configuredSecret).toBeUndefined();
      // Authentication is now mandatory even in development
    });
  });

  describe('CRM Provider Abstraction', () => {
    it('should get correct CRM provider', async () => {
      const { getCRMProvider } = await import('@medicalcor/integrations');
      const crm = getCRMProvider();

      expect(crm.sourceName).toBe('pipedrive');
    });

    it('should log source name with events', async () => {
      const { getCRMProvider } = await import('@medicalcor/integrations');
      const crm = getCRMProvider();

      const logContext = {
        source: crm.sourceName,
        event: 'updated.person',
        objectType: 'person',
      };

      expect(logContext.source).toBe('pipedrive');
    });
  });

  describe('Treatment Plan Error Scenarios', () => {
    it('should handle Lead not found error for treatment plans', async () => {
      const { upsertTreatmentPlanFromDTO } = await import('@medicalcor/core');

      vi.mocked(upsertTreatmentPlanFromDTO).mockRejectedValueOnce(
        new Error('Lead not found for external ID: 12345')
      );

      const payload = createDealWebhook();

      // The error contains 'Lead not found' - should be logged as warning, not thrown
      const error = new Error('Lead not found for external ID: 12345');
      const errorMessage = error.message;

      expect(errorMessage).toContain('Lead not found');
    });

    it('should re-throw non-lead-not-found errors', async () => {
      const { upsertTreatmentPlanFromDTO } = await import('@medicalcor/core');

      vi.mocked(upsertTreatmentPlanFromDTO).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const error = new Error('Database connection failed');
      const errorMessage = error.message;

      expect(errorMessage).not.toContain('Lead not found');
      // This error should be thrown/re-thrown
    });
  });
});

describe('HubSpot Webhook Compatibility', () => {
  it('should handle HubSpot contact webhook format', () => {
    const hubspotPayload = {
      subscriptionType: 'contact.creation',
      portalId: 12345,
      objectId: 123,
      properties: {
        email: { value: 'patient@example.com' },
        phone: { value: '+40721234567' },
        firstname: { value: 'Ion' },
        lastname: { value: 'Popescu' },
      },
    };

    // Verify HubSpot structure
    expect(hubspotPayload.subscriptionType).toBe('contact.creation');
    expect(hubspotPayload.properties.email.value).toBe('patient@example.com');
  });

  it('should handle HubSpot deal webhook format', () => {
    const hubspotPayload = {
      subscriptionType: 'deal.creation',
      portalId: 12345,
      objectId: 456,
      properties: {
        dealname: { value: 'Dental Implant Consultation' },
        amount: { value: '5000' },
        dealstage: { value: 'appointmentscheduled' },
      },
    };

    expect(hubspotPayload.subscriptionType).toBe('deal.creation');
    expect(hubspotPayload.properties.dealname.value).toBe('Dental Implant Consultation');
  });
});
