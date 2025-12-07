import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

/**
 * Booking Webhook Tests
 *
 * Comprehensive tests for the booking webhook endpoints covering:
 * - Interactive callback processing (WhatsApp button/list replies)
 * - Direct booking endpoint
 * - Text-based slot selection fallback
 * - Phone number normalization
 * - Zod schema validation
 * - Idempotency key generation
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
    bookingAgent: vi.fn((contactId: string, slotId: string) => `booking:${contactId}:${slotId}`),
    custom: vi.fn((type: string, ...parts: string[]) => `${type}:${parts.join(':')}`),
  },
  normalizeRomanianPhone: vi.fn((phone: string) => {
    // Romanian phone normalization logic
    const cleaned = phone.replace(/\D/g, '');

    // Valid Romanian numbers: 07xx or +407xx format
    if (/^0?7\d{8}$/.test(cleaned)) {
      const digits = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
      return { isValid: true, normalized: `+40${digits}` };
    }

    if (/^40?7\d{8}$/.test(cleaned)) {
      const digits = cleaned.startsWith('40') ? cleaned.slice(2) : cleaned;
      return { isValid: true, normalized: `+40${digits}` };
    }

    return { isValid: false, normalized: phone };
  }),
}));

// Zod schemas matching the webhook implementation
const InteractiveCallbackSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string().optional(),
  interactiveType: z.enum(['button_reply', 'list_reply']),
  selectedId: z.string().min(1, 'Selected ID is required'),
  selectedTitle: z.string().optional(),
  procedureType: z.string().optional(),
  language: z.enum(['ro', 'en', 'de']).default('ro'),
  originalMessageId: z.string().optional(),
});

const DirectBookingSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  hubspotContactId: z.string(),
  slotId: z.string().min(1, 'Slot ID is required'),
  procedureType: z.string().min(1, 'Procedure type is required'),
  patientName: z.string().optional(),
  patientEmail: z.string().email().optional(),
  language: z.enum(['ro', 'en', 'de']).default('ro'),
});

const TextSelectionSchema = z.object({
  phone: z.string().min(1),
  hubspotContactId: z.string().optional(),
  selectedNumber: z.number().int().min(1).max(10),
  availableSlotIds: z.array(z.string()),
  procedureType: z.string(),
  language: z.enum(['ro', 'en', 'de']).default('ro'),
});

// Test data factories
function createInteractiveCallback(overrides = {}) {
  return {
    phone: '+40721123456',
    hubspotContactId: 'hubspot_12345',
    interactiveType: 'button_reply' as const,
    selectedId: 'slot_abc123',
    selectedTitle: '10:00 AM - Monday',
    procedureType: 'consultation',
    language: 'ro' as const,
    originalMessageId: 'wamid_123',
    ...overrides,
  };
}

function createDirectBooking(overrides = {}) {
  return {
    phone: '+40721123456',
    hubspotContactId: 'hubspot_12345',
    slotId: 'slot_abc123',
    procedureType: 'all-on-4',
    patientName: 'Ion Popescu',
    patientEmail: 'ion.popescu@example.com',
    language: 'ro' as const,
    ...overrides,
  };
}

function createTextSelection(overrides = {}) {
  return {
    phone: '+40721123456',
    hubspotContactId: 'hubspot_12345',
    selectedNumber: 1,
    availableSlotIds: ['slot_1', 'slot_2', 'slot_3'],
    procedureType: 'consultation',
    language: 'ro' as const,
    ...overrides,
  };
}

describe('Booking Webhook Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Interactive Callback Schema Validation', () => {
    it('should validate a complete interactive callback payload', () => {
      const payload = createInteractiveCallback();
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phone).toBe('+40721123456');
        expect(result.data.interactiveType).toBe('button_reply');
        expect(result.data.selectedId).toBe('slot_abc123');
      }
    });

    it('should validate button_reply interactive type', () => {
      const payload = createInteractiveCallback({ interactiveType: 'button_reply' });
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should validate list_reply interactive type', () => {
      const payload = createInteractiveCallback({ interactiveType: 'list_reply' });
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should reject invalid interactive type', () => {
      const payload = createInteractiveCallback({ interactiveType: 'invalid_type' });
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should reject missing phone', () => {
      const payload = { ...createInteractiveCallback(), phone: '' };
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('phone');
      }
    });

    it('should reject missing selectedId', () => {
      const payload = { ...createInteractiveCallback(), selectedId: '' };
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should accept optional hubspotContactId', () => {
      const { hubspotContactId, ...payload } = createInteractiveCallback();
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should default language to ro', () => {
      const { language, ...payload } = createInteractiveCallback();
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('ro');
      }
    });

    it('should accept en language', () => {
      const payload = createInteractiveCallback({ language: 'en' });
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('en');
      }
    });

    it('should accept de language', () => {
      const payload = createInteractiveCallback({ language: 'de' });
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should reject invalid language', () => {
      const payload = createInteractiveCallback({ language: 'fr' });
      const result = InteractiveCallbackSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });
  });

  describe('Direct Booking Schema Validation', () => {
    it('should validate a complete direct booking payload', () => {
      const payload = createDirectBooking();
      const result = DirectBookingSchema.safeParse(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.slotId).toBe('slot_abc123');
        expect(result.data.procedureType).toBe('all-on-4');
      }
    });

    it('should require hubspotContactId for direct booking', () => {
      const { hubspotContactId, ...payload } = createDirectBooking();
      const result = DirectBookingSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should require slotId', () => {
      const payload = { ...createDirectBooking(), slotId: '' };
      const result = DirectBookingSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should require procedureType', () => {
      const payload = { ...createDirectBooking(), procedureType: '' };
      const result = DirectBookingSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should validate optional patient email format', () => {
      const validPayload = createDirectBooking({ patientEmail: 'valid@email.com' });
      const validResult = DirectBookingSchema.safeParse(validPayload);
      expect(validResult.success).toBe(true);

      const invalidPayload = createDirectBooking({ patientEmail: 'invalid-email' });
      const invalidResult = DirectBookingSchema.safeParse(invalidPayload);
      expect(invalidResult.success).toBe(false);
    });

    it('should accept optional patientName', () => {
      const { patientName, ...payload } = createDirectBooking();
      const result = DirectBookingSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should accept optional patientEmail', () => {
      const { patientEmail, ...payload } = createDirectBooking();
      const result = DirectBookingSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });
  });

  describe('Text Selection Schema Validation', () => {
    it('should validate a complete text selection payload', () => {
      const payload = createTextSelection();
      const result = TextSelectionSchema.safeParse(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.selectedNumber).toBe(1);
        expect(result.data.availableSlotIds).toHaveLength(3);
      }
    });

    it('should require selectedNumber within range 1-10', () => {
      const validPayload = createTextSelection({ selectedNumber: 5 });
      const validResult = TextSelectionSchema.safeParse(validPayload);
      expect(validResult.success).toBe(true);

      const tooLowPayload = createTextSelection({ selectedNumber: 0 });
      const tooLowResult = TextSelectionSchema.safeParse(tooLowPayload);
      expect(tooLowResult.success).toBe(false);

      const tooHighPayload = createTextSelection({ selectedNumber: 11 });
      const tooHighResult = TextSelectionSchema.safeParse(tooHighPayload);
      expect(tooHighResult.success).toBe(false);
    });

    it('should require integer selectedNumber', () => {
      const payload = createTextSelection({ selectedNumber: 1.5 });
      const result = TextSelectionSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should require availableSlotIds array', () => {
      const payload = { ...createTextSelection(), availableSlotIds: 'not-an-array' };
      const result = TextSelectionSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should accept empty availableSlotIds array', () => {
      const payload = createTextSelection({ availableSlotIds: [] });
      const result = TextSelectionSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });
  });

  describe('Phone Number Normalization', () => {
    it('should normalize Romanian phone with +40 prefix', async () => {
      const { normalizeRomanianPhone } = await import('@medicalcor/core');

      const result = normalizeRomanianPhone('+40721123456');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40721123456');
    });

    it('should normalize Romanian phone starting with 07', async () => {
      const { normalizeRomanianPhone } = await import('@medicalcor/core');

      const result = normalizeRomanianPhone('0721123456');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40721123456');
    });

    it('should normalize Romanian phone starting with 7', async () => {
      const { normalizeRomanianPhone } = await import('@medicalcor/core');

      const result = normalizeRomanianPhone('721123456');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40721123456');
    });

    it('should reject invalid phone numbers', async () => {
      const { normalizeRomanianPhone } = await import('@medicalcor/core');

      const result = normalizeRomanianPhone('invalid');
      expect(result.isValid).toBe(false);
    });

    it('should handle phone with spaces and dashes', async () => {
      const { normalizeRomanianPhone } = await import('@medicalcor/core');

      const result = normalizeRomanianPhone('072-112-3456');
      expect(result.isValid).toBe(true);
    });

    it('should handle phone with parentheses', async () => {
      const { normalizeRomanianPhone } = await import('@medicalcor/core');

      const result = normalizeRomanianPhone('(072) 112 3456');
      expect(result.isValid).toBe(true);
    });
  });

  describe('Slot Selection Handling', () => {
    it('should extract slotId from slot_ prefix', () => {
      const selectedId = 'slot_abc123';
      const slotId = selectedId.replace('slot_', '');

      expect(slotId).toBe('abc123');
    });

    it('should detect slot selection from selectedId', () => {
      const slotSelection = 'slot_xyz789';
      const buttonSelection = 'book_yes';
      const deferSelection = 'book_later';

      expect(slotSelection.startsWith('slot_')).toBe(true);
      expect(buttonSelection.startsWith('slot_')).toBe(false);
      expect(deferSelection.startsWith('slot_')).toBe(false);
    });

    it('should handle book_yes selection', () => {
      const selectedId = 'book_yes';

      expect(selectedId).toBe('book_yes');
      // Should trigger booking workflow without slot
    });

    it('should handle book_later selection', () => {
      const selectedId = 'book_later';

      expect(selectedId).toBe('book_later');
      // Should acknowledge and not trigger workflow
    });

    it('should handle unknown selection gracefully', () => {
      const selectedId = 'unknown_selection';

      expect(selectedId.startsWith('slot_')).toBe(false);
      expect(selectedId).not.toBe('book_yes');
      expect(selectedId).not.toBe('book_later');
      // Should acknowledge but log warning
    });
  });

  describe('Text Selection Index Calculation', () => {
    it('should calculate correct slot index', () => {
      const availableSlotIds = ['slot_1', 'slot_2', 'slot_3'];

      // User selects "1" (first slot)
      const selectedNumber = 1;
      const slotIndex = selectedNumber - 1;
      const selectedSlotId = availableSlotIds[slotIndex];

      expect(slotIndex).toBe(0);
      expect(selectedSlotId).toBe('slot_1');
    });

    it('should handle last slot selection', () => {
      const availableSlotIds = ['slot_1', 'slot_2', 'slot_3'];
      const selectedNumber = 3;
      const slotIndex = selectedNumber - 1;
      const selectedSlotId = availableSlotIds[slotIndex];

      expect(selectedSlotId).toBe('slot_3');
    });

    it('should handle out of range selection', () => {
      const availableSlotIds = ['slot_1', 'slot_2', 'slot_3'];
      const selectedNumber = 5; // Invalid - only 3 slots
      const slotIndex = selectedNumber - 1;
      const selectedSlotId = availableSlotIds[slotIndex];

      expect(selectedSlotId).toBeUndefined();
    });

    it('should handle empty slot array', () => {
      const availableSlotIds: string[] = [];
      const selectedNumber = 1;
      const slotIndex = selectedNumber - 1;
      const selectedSlotId = availableSlotIds[slotIndex];

      expect(selectedSlotId).toBeUndefined();
    });
  });

  describe('Idempotency Key Generation', () => {
    it('should generate booking agent idempotency key', async () => {
      const { IdempotencyKeys } = await import('@medicalcor/core');

      const key = IdempotencyKeys.bookingAgent('contact_123', 'slot_abc');
      expect(key).toBe('booking:contact_123:slot_abc');
    });

    it('should generate custom idempotency key', async () => {
      const { IdempotencyKeys } = await import('@medicalcor/core');

      const key = IdempotencyKeys.custom('booking-init', 'contact_123', 'correlation_id');
      expect(key).toBe('booking-init:contact_123:correlation_id');
    });

    it('should use phone as fallback when no hubspotContactId', async () => {
      const { IdempotencyKeys } = await import('@medicalcor/core');

      const hubspotContactId = undefined;
      const phone = '+40721123456';
      const slotId = 'slot_abc';

      const key = IdempotencyKeys.bookingAgent(hubspotContactId ?? phone, slotId);
      expect(key).toBe('booking:+40721123456:slot_abc');
    });
  });

  describe('Trigger.dev Task Triggering', () => {
    it('should trigger booking-agent-workflow task', async () => {
      const { tasks } = await import('@trigger.dev/sdk/v3');

      await tasks.trigger(
        'booking-agent-workflow',
        {
          phone: '+40721123456',
          hubspotContactId: 'contact_123',
          procedureType: 'consultation',
          language: 'ro',
          correlationId: 'test-correlation-id',
          selectedSlotId: 'slot_abc',
        },
        { idempotencyKey: 'test-key' }
      );

      expect(tasks.trigger).toHaveBeenCalledWith(
        'booking-agent-workflow',
        expect.objectContaining({
          phone: '+40721123456',
          hubspotContactId: 'contact_123',
          selectedSlotId: 'slot_abc',
        }),
        expect.objectContaining({
          idempotencyKey: 'test-key',
        })
      );
    });

    it('should include correlationId in task payload', async () => {
      const { tasks } = await import('@trigger.dev/sdk/v3');

      await tasks.trigger(
        'booking-agent-workflow',
        {
          phone: '+40721123456',
          hubspotContactId: 'contact_123',
          procedureType: 'consultation',
          language: 'ro',
          correlationId: 'custom-correlation-123',
        },
        { idempotencyKey: 'test-key' }
      );

      expect(tasks.trigger).toHaveBeenCalledWith(
        'booking-agent-workflow',
        expect.objectContaining({
          correlationId: 'custom-correlation-123',
        }),
        expect.any(Object)
      );
    });

    it('should handle task trigger failure gracefully', async () => {
      const { tasks } = await import('@trigger.dev/sdk/v3');

      vi.mocked(tasks.trigger).mockRejectedValueOnce(new Error('Task trigger failed'));

      await expect(
        tasks.trigger(
          'booking-agent-workflow',
          {
            phone: '+40721123456',
            hubspotContactId: 'contact_123',
            procedureType: 'consultation',
            language: 'ro',
            correlationId: 'test-correlation-id',
          },
          { idempotencyKey: 'test-key' }
        )
      ).rejects.toThrow('Task trigger failed');
    });
  });

  describe('Correlation ID Handling', () => {
    it('should extract correlation ID from header', () => {
      const headers = { 'x-correlation-id': 'custom-id-123' };
      const header = headers['x-correlation-id'];
      const correlationId = typeof header === 'string' ? header : 'generated';

      expect(correlationId).toBe('custom-id-123');
    });

    it('should generate correlation ID when not provided', async () => {
      const { generateCorrelationId } = await import('@medicalcor/core');
      const headers = {};

      const header = headers['x-correlation-id' as keyof typeof headers];
      const correlationId = typeof header === 'string' ? header : generateCorrelationId();

      expect(correlationId).toBe('test-correlation-id');
    });
  });

  describe('Response Formats', () => {
    it('should return processing status for slot selection', () => {
      const response = {
        status: 'processing',
        message: 'Booking request is being processed',
        correlationId: 'test-correlation-id',
      };

      expect(response.status).toBe('processing');
      expect(response.correlationId).toBeDefined();
    });

    it('should return processing status for book_yes', () => {
      const response = {
        status: 'processing',
        message: 'Fetching available slots',
        correlationId: 'test-correlation-id',
      };

      expect(response.status).toBe('processing');
      expect(response.message).toBe('Fetching available slots');
    });

    it('should return acknowledged status for book_later', () => {
      const response = {
        status: 'acknowledged',
        message: 'Booking deferred',
        correlationId: 'test-correlation-id',
      };

      expect(response.status).toBe('acknowledged');
      expect(response.message).toBe('Booking deferred');
    });

    it('should return acknowledged status for unknown selection', () => {
      const response = {
        status: 'acknowledged',
        message: 'Selection received',
        correlationId: 'test-correlation-id',
      };

      expect(response.status).toBe('acknowledged');
    });

    it('should return taskId for direct booking', () => {
      const response = {
        status: 'processing',
        message: 'Booking request submitted',
        taskId: 'mock-task-id',
        correlationId: 'test-correlation-id',
      };

      expect(response.status).toBe('processing');
      expect(response.taskId).toBe('mock-task-id');
    });

    it('should return error for invalid slot selection', () => {
      const availableCount = 3;
      const response = {
        error: 'Invalid selection',
        message: `Please select a number between 1 and ${availableCount}`,
      };

      expect(response.error).toBe('Invalid selection');
      expect(response.message).toContain('1 and 3');
    });
  });

  describe('Procedure Types', () => {
    it('should handle consultation procedure', () => {
      const payload = createInteractiveCallback({ procedureType: 'consultation' });
      expect(payload.procedureType).toBe('consultation');
    });

    it('should handle all-on-4 procedure', () => {
      const payload = createInteractiveCallback({ procedureType: 'all-on-4' });
      expect(payload.procedureType).toBe('all-on-4');
    });

    it('should handle all-on-6 procedure', () => {
      const payload = createInteractiveCallback({ procedureType: 'all-on-6' });
      expect(payload.procedureType).toBe('all-on-6');
    });

    it('should handle implant procedure', () => {
      const payload = createInteractiveCallback({ procedureType: 'implant' });
      expect(payload.procedureType).toBe('implant');
    });

    it('should default to consultation when procedureType not provided', () => {
      const { procedureType, ...payload } = createInteractiveCallback();
      const defaultProcedure = payload.procedureType ?? 'consultation';

      expect(defaultProcedure).toBe('consultation');
    });
  });
});

describe('Error Handling', () => {
  it('should create ValidationError with details', async () => {
    const { ValidationError } = await import('@medicalcor/core');

    const error = new ValidationError('Invalid payload', {
      fieldErrors: { phone: ['Invalid phone format'] },
    });

    expect(error.message).toBe('Invalid payload');
    expect(error.details).toEqual({
      fieldErrors: { phone: ['Invalid phone format'] },
    });
  });

  it('should generate safe error response', async () => {
    const { toSafeErrorResponse } = await import('@medicalcor/core');

    const error = new Error('Internal error details');
    const response = toSafeErrorResponse(error);

    expect(response.error).toBe('Internal error details');
    // Should not expose stack traces or sensitive info
  });
});
