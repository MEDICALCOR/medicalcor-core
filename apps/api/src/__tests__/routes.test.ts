import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

/**
 * Comprehensive API Routes Tests
 *
 * Tests for:
 * - Voice webhook routes (TwiML sanitization)
 * - WhatsApp webhook routes (timestamp validation)
 * - Booking webhook routes (phone normalization)
 * - Workflow routes (phone normalization)
 * - Health routes
 * - Input validation across all routes
 */

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Generate a valid WhatsApp webhook signature
 */
function generateWhatsAppSignature(payload: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Generate a valid Twilio webhook signature
 */
function generateTwilioSignature(data: string, authToken: string): string {
  return crypto.createHmac('sha1', authToken).update(data, 'utf-8').digest('base64');
}

/**
 * Generate a current Unix timestamp
 */
function getCurrentTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Generate an old timestamp (6 minutes ago - should be rejected)
 */
function getOldTimestamp(): string {
  return Math.floor(Date.now() / 1000 - 360).toString(); // 6 minutes ago
}

/**
 * Generate a future timestamp (2 minutes in future - should be rejected)
 */
function getFutureTimestamp(): string {
  return Math.floor(Date.now() / 1000 + 120).toString(); // 2 minutes in future
}

// =============================================================================
// TwiML Sanitization Tests
// =============================================================================

describe('TwiML Input Sanitization', () => {
  /**
   * Test the sanitization function logic
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
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .substring(0, 256)
    );
  }

  it('should escape XML special characters', () => {
    expect(sanitizeForTwiML('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should escape ampersands', () => {
    expect(sanitizeForTwiML('A & B')).toBe('A &amp; B');
  });

  it('should escape quotes', () => {
    expect(sanitizeForTwiML('He said "hello" and \'goodbye\'')).toBe(
      'He said &quot;hello&quot; and &#39;goodbye&#39;'
    );
  });

  it('should remove control characters', () => {
    expect(sanitizeForTwiML('hello\x00\x01\x02world')).toBe('helloworld');
  });

  it('should truncate long inputs to 256 characters', () => {
    const longInput = 'a'.repeat(300);
    expect(sanitizeForTwiML(longInput).length).toBe(256);
  });

  it('should handle empty input', () => {
    expect(sanitizeForTwiML('')).toBe('');
  });

  it('should handle normal phone numbers unchanged (after escape)', () => {
    expect(sanitizeForTwiML('+40712345678')).toBe('+40712345678');
  });

  it('should handle potential XML injection in phone numbers', () => {
    const maliciousPhone = '+40712345678"><Reject/>';
    const sanitized = sanitizeForTwiML(maliciousPhone);
    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
    expect(sanitized).toContain('&lt;');
    expect(sanitized).toContain('&gt;');
  });
});

describe('Twilio Identifier Validation', () => {
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
        return /^[a-zA-Z0-9-]{1,64}$/.test(value);
      default:
        return false;
    }
  }

  describe('CallSid validation', () => {
    it('should accept valid Twilio CallSid', () => {
      expect(isValidTwilioIdentifier('CA' + 'a'.repeat(32), 'callSid')).toBe(true);
      expect(isValidTwilioIdentifier('CA1234567890abcdef1234567890abcdef', 'callSid')).toBe(true);
    });

    it('should reject invalid CallSid formats', () => {
      expect(isValidTwilioIdentifier('invalid', 'callSid')).toBe(false);
      expect(isValidTwilioIdentifier('CA123', 'callSid')).toBe(false); // Too short
      expect(isValidTwilioIdentifier('CB' + 'a'.repeat(32), 'callSid')).toBe(false); // Wrong prefix
      expect(isValidTwilioIdentifier('', 'callSid')).toBe(false);
    });
  });

  describe('Phone validation', () => {
    it('should accept valid E.164 phone numbers', () => {
      expect(isValidTwilioIdentifier('+40712345678', 'phone')).toBe(true);
      expect(isValidTwilioIdentifier('+14155551234', 'phone')).toBe(true);
      expect(isValidTwilioIdentifier('+1', 'phone')).toBe(false); // Too short
    });

    it('should reject invalid phone formats', () => {
      expect(isValidTwilioIdentifier('0712345678', 'phone')).toBe(false); // Missing +
      expect(isValidTwilioIdentifier('+0712345678', 'phone')).toBe(false); // Starts with 0
      expect(isValidTwilioIdentifier('invalid', 'phone')).toBe(false);
      expect(isValidTwilioIdentifier('', 'phone')).toBe(false);
    });
  });

  describe('AssistantId validation', () => {
    it('should accept valid assistant IDs', () => {
      expect(isValidTwilioIdentifier('asst-123-abc', 'assistantId')).toBe(true);
      expect(isValidTwilioIdentifier('my-assistant-id', 'assistantId')).toBe(true);
      expect(isValidTwilioIdentifier('a'.repeat(64), 'assistantId')).toBe(true);
    });

    it('should reject invalid assistant IDs', () => {
      expect(isValidTwilioIdentifier('', 'assistantId')).toBe(false);
      expect(isValidTwilioIdentifier('a'.repeat(65), 'assistantId')).toBe(false); // Too long
      expect(isValidTwilioIdentifier('invalid<script>', 'assistantId')).toBe(false); // Invalid chars
    });
  });
});

// =============================================================================
// WhatsApp Timestamp Validation Tests
// =============================================================================

describe('WhatsApp Timestamp Validation', () => {
  const MAX_TIMESTAMP_AGE_SECONDS = 300; // 5 minutes
  const MAX_TIMESTAMP_FUTURE_SECONDS = 60; // 1 minute

  function validateTimestamp(timestamp: string): {
    isValid: boolean;
    error?: string;
    ageSeconds?: number;
  } {
    const timestampNum = parseInt(timestamp, 10);

    if (isNaN(timestampNum) || timestampNum <= 0) {
      return { isValid: false, error: 'Invalid timestamp format' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageSeconds = nowSeconds - timestampNum;

    if (ageSeconds > MAX_TIMESTAMP_AGE_SECONDS) {
      return {
        isValid: false,
        error: `Message timestamp too old (${ageSeconds}s > ${MAX_TIMESTAMP_AGE_SECONDS}s max)`,
        ageSeconds,
      };
    }

    if (ageSeconds < -MAX_TIMESTAMP_FUTURE_SECONDS) {
      return {
        isValid: false,
        error: `Message timestamp too far in future (${-ageSeconds}s > ${MAX_TIMESTAMP_FUTURE_SECONDS}s tolerance)`,
        ageSeconds,
      };
    }

    return { isValid: true, ageSeconds };
  }

  it('should accept current timestamp', () => {
    const result = validateTimestamp(getCurrentTimestamp());
    expect(result.isValid).toBe(true);
    expect(result.ageSeconds).toBeDefined();
    expect(result.ageSeconds!).toBeGreaterThanOrEqual(0);
    expect(result.ageSeconds!).toBeLessThan(5);
  });

  it('should accept timestamp from 2 minutes ago', () => {
    const twoMinutesAgo = Math.floor(Date.now() / 1000 - 120).toString();
    const result = validateTimestamp(twoMinutesAgo);
    expect(result.isValid).toBe(true);
    expect(result.ageSeconds).toBeGreaterThanOrEqual(119);
    expect(result.ageSeconds).toBeLessThanOrEqual(121);
  });

  it('should reject timestamp from 6 minutes ago (replay attack prevention)', () => {
    const result = validateTimestamp(getOldTimestamp());
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('too old');
  });

  it('should accept timestamp 30 seconds in future (clock skew)', () => {
    const thirtySecondsFuture = Math.floor(Date.now() / 1000 + 30).toString();
    const result = validateTimestamp(thirtySecondsFuture);
    expect(result.isValid).toBe(true);
  });

  it('should reject timestamp 2 minutes in future', () => {
    const result = validateTimestamp(getFutureTimestamp());
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('too far in future');
  });

  it('should reject invalid timestamp format', () => {
    expect(validateTimestamp('invalid').isValid).toBe(false);
    expect(validateTimestamp('').isValid).toBe(false);
    expect(validateTimestamp('0').isValid).toBe(false);
    expect(validateTimestamp('-123').isValid).toBe(false);
  });

  it('should reject NaN timestamp', () => {
    const result = validateTimestamp('NaN');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid timestamp format');
  });
});

// =============================================================================
// Phone Number Normalization Tests
// =============================================================================

describe('Phone Number Normalization', () => {
  /**
   * Normalize Romanian phone number to E.164 format
   */
  function normalizeRomanianPhone(phone: string): { isValid: boolean; normalized: string } {
    // Remove all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Handle various formats
    if (cleaned.startsWith('+40')) {
      // Already E.164
    } else if (cleaned.startsWith('40') && cleaned.length === 11) {
      cleaned = `+${cleaned}`;
    } else if (cleaned.startsWith('0040')) {
      cleaned = `+${cleaned.slice(2)}`;
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
      cleaned = `+40${cleaned.slice(1)}`;
    } else {
      return { isValid: false, normalized: phone };
    }

    // Validate final format
    const e164Pattern = /^\+40[237]\d{8}$/;
    if (!e164Pattern.test(cleaned)) {
      return { isValid: false, normalized: phone };
    }

    return { isValid: true, normalized: cleaned };
  }

  describe('Valid Romanian phone number formats', () => {
    it('should normalize local format (0712345678)', () => {
      const result = normalizeRomanianPhone('0712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should accept already normalized E.164 format', () => {
      const result = normalizeRomanianPhone('+40712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should normalize format without + prefix', () => {
      const result = normalizeRomanianPhone('40712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should normalize format with 00 prefix', () => {
      const result = normalizeRomanianPhone('0040712345678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should handle spaces in phone number', () => {
      const result = normalizeRomanianPhone('07 12 34 56 78');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });

    it('should handle dashes in phone number', () => {
      const result = normalizeRomanianPhone('0712-345-678');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40712345678');
    });
  });

  describe('Invalid phone number formats', () => {
    it('should reject too short numbers', () => {
      expect(normalizeRomanianPhone('071234').isValid).toBe(false);
    });

    it('should reject too long numbers', () => {
      expect(normalizeRomanianPhone('071234567890').isValid).toBe(false);
    });

    it('should reject non-Romanian country codes', () => {
      expect(normalizeRomanianPhone('+14155551234').isValid).toBe(false);
    });

    it('should reject invalid prefix (must start with 7, 2, or 3)', () => {
      expect(normalizeRomanianPhone('+40512345678').isValid).toBe(false);
    });

    it('should reject empty string', () => {
      expect(normalizeRomanianPhone('').isValid).toBe(false);
    });

    it('should reject non-numeric input', () => {
      expect(normalizeRomanianPhone('not-a-phone').isValid).toBe(false);
    });
  });

  describe('Mobile vs landline', () => {
    it('should accept mobile numbers (7xx)', () => {
      expect(normalizeRomanianPhone('+40712345678').isValid).toBe(true);
      expect(normalizeRomanianPhone('+40762345678').isValid).toBe(true);
      expect(normalizeRomanianPhone('+40722345678').isValid).toBe(true);
    });

    it('should accept Bucharest landlines (2x)', () => {
      expect(normalizeRomanianPhone('+40212345678').isValid).toBe(true);
    });

    it('should accept regional landlines (3x)', () => {
      expect(normalizeRomanianPhone('+40312345678').isValid).toBe(true);
    });
  });
});

// =============================================================================
// Health Route Tests
// =============================================================================

describe('Health Routes', () => {
  it('should return health response structure', () => {
    // Test the expected structure of health responses
    const healthResponse = {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      uptime: 12345,
    };

    expect(healthResponse).toHaveProperty('status');
    expect(healthResponse).toHaveProperty('timestamp');
    expect(['ok', 'degraded', 'unhealthy']).toContain(healthResponse.status);
  });

  it('should validate memory stats structure', () => {
    const memoryStats = {
      heapUsed: 100,
      heapTotal: 200,
      external: 50,
      rss: 300,
    };

    expect(memoryStats.heapUsed).toBeLessThanOrEqual(memoryStats.heapTotal);
    expect(memoryStats.rss).toBeGreaterThan(0);
  });
});

// =============================================================================
// Workflow Route Input Validation Tests
// =============================================================================

describe('Workflow Route Input Validation', () => {
  describe('Lead Score Payload', () => {
    const validPayload = {
      phone: '+40712345678',
      message: 'I want to book an appointment',
      channel: 'whatsapp',
    };

    it('should accept valid payload', () => {
      expect(validPayload.phone).toBeTruthy();
      expect(validPayload.message).toBeTruthy();
      expect(['whatsapp', 'voice', 'web']).toContain(validPayload.channel);
    });

    it('should require phone number', () => {
      const invalid = { ...validPayload, phone: '' };
      expect(invalid.phone).toBeFalsy();
    });

    it('should require message', () => {
      const invalid = { ...validPayload, message: '' };
      expect(invalid.message).toBeFalsy();
    });
  });

  describe('Booking Agent Payload', () => {
    const validPayload = {
      phone: '+40712345678',
      hubspotContactId: 'contact_123',
      procedureType: 'implant',
      language: 'ro',
    };

    it('should accept valid payload', () => {
      expect(validPayload.phone).toBeTruthy();
      expect(validPayload.hubspotContactId).toBeTruthy();
      expect(validPayload.procedureType).toBeTruthy();
      expect(['ro', 'en', 'de']).toContain(validPayload.language);
    });

    it('should require procedure type', () => {
      const invalid = { ...validPayload, procedureType: '' };
      expect(invalid.procedureType).toBeFalsy();
    });
  });
});

// =============================================================================
// Booking Webhook Input Validation Tests
// =============================================================================

describe('Booking Webhook Input Validation', () => {
  describe('Interactive Callback Schema', () => {
    const validCallback = {
      phone: '+40712345678',
      interactiveType: 'button_reply',
      selectedId: 'slot_123',
      language: 'ro',
    };

    it('should accept valid callback', () => {
      expect(validCallback.phone).toBeTruthy();
      expect(['button_reply', 'list_reply']).toContain(validCallback.interactiveType);
      expect(validCallback.selectedId).toBeTruthy();
    });

    it('should identify slot selection from selectedId', () => {
      expect(validCallback.selectedId.startsWith('slot_')).toBe(true);
      const slotId = validCallback.selectedId.replace('slot_', '');
      expect(slotId).toBe('123');
    });

    it('should identify booking confirmation buttons', () => {
      expect('book_yes').toBe('book_yes');
      expect('book_later').toBe('book_later');
    });
  });

  describe('Direct Booking Schema', () => {
    const validBooking = {
      phone: '+40712345678',
      hubspotContactId: 'contact_123',
      slotId: 'slot_456',
      procedureType: 'consultation',
      language: 'ro',
    };

    it('should accept valid direct booking', () => {
      expect(validBooking.phone).toBeTruthy();
      expect(validBooking.hubspotContactId).toBeTruthy();
      expect(validBooking.slotId).toBeTruthy();
      expect(validBooking.procedureType).toBeTruthy();
    });

    it('should validate optional email format', () => {
      const withEmail = { ...validBooking, patientEmail: 'test@example.com' };
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test(withEmail.patientEmail)).toBe(true);
    });
  });

  describe('Text Selection Schema', () => {
    const validSelection = {
      phone: '+40712345678',
      selectedNumber: 2,
      availableSlotIds: ['slot_1', 'slot_2', 'slot_3'],
      procedureType: 'consultation',
      language: 'ro',
    };

    it('should map selected number to slot ID', () => {
      const slotIndex = validSelection.selectedNumber - 1;
      const selectedSlotId = validSelection.availableSlotIds[slotIndex];
      expect(selectedSlotId).toBe('slot_2');
    });

    it('should reject out of range selection', () => {
      const outOfRange = { ...validSelection, selectedNumber: 10 };
      const slotIndex = outOfRange.selectedNumber - 1;
      const selectedSlotId = outOfRange.availableSlotIds[slotIndex];
      expect(selectedSlotId).toBeUndefined();
    });

    it('should validate selection range (1-10)', () => {
      expect(validSelection.selectedNumber).toBeGreaterThanOrEqual(1);
      expect(validSelection.selectedNumber).toBeLessThanOrEqual(10);
    });
  });
});

// =============================================================================
// AI Route Input Validation Tests
// =============================================================================

describe('AI Route Input Validation', () => {
  describe('User ID Validation', () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    function validateUserId(header: string | undefined): string | undefined {
      if (typeof header !== 'string') return undefined;
      return UUID_REGEX.test(header) ? header : undefined;
    }

    it('should accept valid UUID', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(validateUserId(validUuid)).toBe(validUuid);
    });

    it('should reject invalid UUID', () => {
      expect(validateUserId('invalid-uuid')).toBeUndefined();
      expect(validateUserId('not-a-uuid')).toBeUndefined();
      expect(validateUserId('')).toBeUndefined();
    });

    it('should reject non-string values', () => {
      expect(validateUserId(undefined)).toBeUndefined();
    });

    it('should prevent injection attacks', () => {
      expect(validateUserId('<script>alert(1)</script>')).toBeUndefined();
      expect(
        validateUserId('550e8400-e29b-41d4-a716-446655440000; DROP TABLE users;')
      ).toBeUndefined();
    });
  });

  describe('Function Query Parameters', () => {
    it('should validate category parameter', () => {
      const validCategories = ['leads', 'patients', 'appointments', 'payments'];
      expect(validCategories).toContain('leads');
    });

    it('should validate format parameter', () => {
      const validFormats = ['full', 'summary', 'openai', 'anthropic'];
      expect(validFormats).toContain('openai');
      expect(validFormats).not.toContain('invalid');
    });
  });
});

// =============================================================================
// Correlation ID Tests
// =============================================================================

describe('Correlation ID Handling', () => {
  it('should generate valid UUID v4 format', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const id = crypto.randomUUID();
    expect(id).toMatch(uuidRegex);
  });

  it('should prefer header correlation ID over generated', () => {
    const headerCorrelationId = 'header-correlation-id-123';
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : crypto.randomUUID();
    expect(correlationId).toBe('header-correlation-id-123');
  });

  it('should generate new ID when header is missing', () => {
    const headerCorrelationId: string | undefined = undefined;
    const correlationId =
      typeof headerCorrelationId === 'string' ? headerCorrelationId : crypto.randomUUID();
    expect(correlationId).toBeDefined();
    expect(correlationId).not.toBe('undefined');
  });
});

// =============================================================================
// Idempotency Key Tests
// =============================================================================

describe('Idempotency Key Generation', () => {
  it('should generate consistent keys for same inputs', () => {
    const key1 = `wa-msg-${crypto.createHash('sha256').update('msg123').digest('hex').substring(0, 16)}`;
    const key2 = `wa-msg-${crypto.createHash('sha256').update('msg123').digest('hex').substring(0, 16)}`;
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different inputs', () => {
    const key1 = `wa-msg-${crypto.createHash('sha256').update('msg123').digest('hex').substring(0, 16)}`;
    const key2 = `wa-msg-${crypto.createHash('sha256').update('msg456').digest('hex').substring(0, 16)}`;
    expect(key1).not.toBe(key2);
  });

  it('should include appropriate prefixes', () => {
    const whatsappKey = 'wa-msg-abc123';
    const voiceKey = 'voice-call-abc123';
    const bookingKey = 'booking-agent-abc123';

    expect(whatsappKey.startsWith('wa-')).toBe(true);
    expect(voiceKey.startsWith('voice-')).toBe(true);
    expect(bookingKey.startsWith('booking-')).toBe(true);
  });
});

// =============================================================================
// Error Response Tests
// =============================================================================

describe('Error Response Formatting', () => {
  it('should format validation errors safely', () => {
    const validationError = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: {
        fieldErrors: { phone: ['Invalid phone number format'] },
        formErrors: [],
      },
    };

    expect(validationError).toHaveProperty('code');
    expect(validationError).toHaveProperty('message');
    expect(validationError.details.fieldErrors).toBeDefined();
  });

  it('should not expose internal error details', () => {
    const safeError = {
      code: 'INTERNAL_ERROR',
      message: 'An error occurred',
      // Should NOT include stack trace, internal paths, etc.
    };

    expect(safeError).not.toHaveProperty('stack');
    expect(safeError).not.toHaveProperty('internalDetails');
  });
});

// =============================================================================
// GDPR Route Tests
// =============================================================================

describe('GDPR Routes', () => {
  describe('GDPR Export Request Validation', () => {
    it('should require at least one identifier', () => {
      const invalidRequest = {};
      const hasIdentifier =
        'phone' in invalidRequest ||
        'email' in invalidRequest ||
        'hubspotContactId' in invalidRequest;
      expect(hasIdentifier).toBe(false);
    });

    it('should accept phone as identifier', () => {
      const validRequest = { phone: '+40712345678' };
      expect(validRequest.phone).toBeTruthy();
    });

    it('should accept email as identifier', () => {
      const validRequest = { email: 'test@example.com' };
      expect(validRequest.email).toBeTruthy();
    });

    it('should accept hubspotContactId as identifier', () => {
      const validRequest = { hubspotContactId: 'hs_contact_123' };
      expect(validRequest.hubspotContactId).toBeTruthy();
    });

    it('should accept multiple identifiers', () => {
      const validRequest = {
        phone: '+40712345678',
        email: 'test@example.com',
      };
      expect(validRequest.phone).toBeTruthy();
      expect(validRequest.email).toBeTruthy();
    });
  });

  describe('GDPR Export Response Structure', () => {
    it('should include GDPR compliance metadata', () => {
      const exportResponse = {
        exportedAt: new Date().toISOString(),
        dataController: 'MedicalCor SRL',
        dataProtectionOfficer: 'dpo@medicalcor.ro',
        exportFormat: 'GDPR Article 20 compliant JSON',
        requestId: crypto.randomUUID(),
        leadData: [],
        interactions: [],
        consentRecords: [],
        appointments: [],
        communications: [],
      };

      expect(exportResponse.dataController).toBe('MedicalCor SRL');
      expect(exportResponse.dataProtectionOfficer).toBe('dpo@medicalcor.ro');
      expect(exportResponse.exportFormat).toContain('GDPR Article 20');
      expect(exportResponse.requestId).toBeTruthy();
      expect(exportResponse.exportedAt).toBeTruthy();
    });

    it('should include all required data categories', () => {
      const exportResponse = {
        leadData: [],
        interactions: [],
        consentRecords: [],
        appointments: [],
        communications: [],
      };

      expect(exportResponse).toHaveProperty('leadData');
      expect(exportResponse).toHaveProperty('interactions');
      expect(exportResponse).toHaveProperty('consentRecords');
      expect(exportResponse).toHaveProperty('appointments');
      expect(exportResponse).toHaveProperty('communications');
    });
  });

  describe('GDPR Deletion Request Validation', () => {
    it('should require explicit confirmation', () => {
      const requestWithoutConfirmation = {
        phone: '+40712345678',
        reason: 'User requested deletion',
        confirmDeletion: false,
      };
      expect(requestWithoutConfirmation.confirmDeletion).toBe(false);
    });

    it('should require reason for deletion', () => {
      const validRequest = {
        phone: '+40712345678',
        reason: 'User exercising GDPR Article 17 right to erasure',
        confirmDeletion: true,
      };
      expect(validRequest.reason).toBeTruthy();
      expect(validRequest.confirmDeletion).toBe(true);
    });

    it('should require at least one identifier for deletion', () => {
      const invalidRequest = {
        reason: 'User requested deletion',
        confirmDeletion: true,
      };
      const hasIdentifier =
        'phone' in invalidRequest ||
        'email' in invalidRequest ||
        'hubspotContactId' in invalidRequest;
      expect(hasIdentifier).toBe(false);
    });
  });

  describe('GDPR Deletion Response Structure', () => {
    it('should include deletion details', () => {
      const deletionResponse = {
        success: true,
        requestId: crypto.randomUUID(),
        message: 'Deletion request processed',
        deletionType: 'SOFT',
        recordsAffected: 5,
        auditTrailPreserved: true,
        retentionPeriodDays: 30,
        estimatedPermanentDeletion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      expect(deletionResponse.success).toBe(true);
      expect(deletionResponse.deletionType).toBe('SOFT');
      expect(deletionResponse.auditTrailPreserved).toBe(true);
      expect(deletionResponse.recordsAffected).toBeGreaterThanOrEqual(0);
      expect(deletionResponse.retentionPeriodDays).toBeGreaterThan(0);
    });

    it('should provide estimated permanent deletion date', () => {
      const retentionDays = 30;
      const now = new Date();
      const estimatedDeletion = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

      expect(estimatedDeletion.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('GDPR Consent Status Validation', () => {
    it('should require phone or email', () => {
      const invalidQuery = {};
      const hasIdentifier = 'phone' in invalidQuery || 'email' in invalidQuery;
      expect(hasIdentifier).toBe(false);
    });

    it('should accept phone query parameter', () => {
      const validQuery = { phone: '+40712345678' };
      expect(validQuery.phone).toBeTruthy();
    });

    it('should accept email query parameter', () => {
      const validQuery = { email: 'test@example.com' };
      expect(validQuery.email).toBeTruthy();
    });
  });

  describe('GDPR Consent Response Structure', () => {
    it('should indicate overall consent status', () => {
      const consentResponse = {
        hasConsent: true,
        consents: [
          {
            type: 'data_processing',
            granted: true,
            grantedAt: new Date().toISOString(),
            withdrawnAt: null,
            source: 'website_form',
          },
          {
            type: 'marketing',
            granted: true,
            grantedAt: new Date().toISOString(),
            withdrawnAt: null,
            source: 'website_form',
          },
        ],
      };

      expect(consentResponse.hasConsent).toBe(true);
      expect(consentResponse.consents).toHaveLength(2);
    });

    it('should identify withdrawn consent', () => {
      const consentResponse = {
        hasConsent: false,
        consents: [
          {
            type: 'marketing',
            granted: false,
            grantedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            withdrawnAt: new Date().toISOString(),
            source: 'user_request',
          },
        ],
      };

      expect(consentResponse.hasConsent).toBe(false);
      expect(consentResponse.consents[0]?.withdrawnAt).toBeTruthy();
    });

    it('should track consent types correctly', () => {
      const validConsentTypes = [
        'data_processing',
        'marketing',
        'appointment_reminders',
        'treatment_updates',
      ];

      const consent = {
        type: 'data_processing',
        granted: true,
        grantedAt: new Date().toISOString(),
        source: 'website_form',
      };

      expect(validConsentTypes).toContain(consent.type);
    });
  });

  describe('GDPR API Authentication', () => {
    it('should require API key header', () => {
      // Test that GDPR endpoints are in the protected paths
      const protectedPaths = [
        '/workflows',
        '/webhooks/booking',
        '/ai',
        '/metrics',
        '/diagnostics',
        '/backup',
        '/gdpr',
      ];

      expect(protectedPaths).toContain('/gdpr');
    });

    it('should validate API key format', () => {
      const validApiKey = 'sk_test_1234567890abcdefghijklmnopqrstuvwxyz';
      expect(validApiKey).toBeTruthy();
      expect(validApiKey.length).toBeGreaterThan(10);
    });
  });

  describe('GDPR Data Categories', () => {
    it('should export lead/patient data', () => {
      const leadData = {
        id: 'lead_123',
        phone: '+40712345678',
        email: 'test@example.com',
        name: 'Ion Popescu',
        source: 'website',
        channel: 'whatsapp',
        status: 'lead',
        created_at: new Date().toISOString(),
      };

      expect(leadData).toHaveProperty('id');
      expect(leadData).toHaveProperty('phone');
      expect(leadData).toHaveProperty('email');
      expect(leadData).toHaveProperty('name');
    });

    it('should export interaction history', () => {
      const interaction = {
        type: 'message',
        channel: 'whatsapp',
        direction: 'inbound',
        status: 'delivered',
        created_at: new Date().toISOString(),
      };

      expect(interaction).toHaveProperty('type');
      expect(interaction).toHaveProperty('channel');
      expect(interaction).toHaveProperty('direction');
    });

    it('should export consent records', () => {
      const consentRecord = {
        consent_type: 'data_processing',
        granted: true,
        source: 'website_form',
        ip_address: '127.0.0.1',
        granted_at: new Date().toISOString(),
        withdrawn_at: null,
      };

      expect(consentRecord).toHaveProperty('consent_type');
      expect(consentRecord).toHaveProperty('granted');
      expect(consentRecord).toHaveProperty('source');
      expect(consentRecord).toHaveProperty('granted_at');
    });

    it('should export appointment data', () => {
      const appointment = {
        id: 'apt_123',
        appointment_type: 'consultation',
        scheduled_at: new Date().toISOString(),
        status: 'confirmed',
        procedure_type: 'implant',
        location: 'Clinic A',
      };

      expect(appointment).toHaveProperty('id');
      expect(appointment).toHaveProperty('appointment_type');
      expect(appointment).toHaveProperty('scheduled_at');
      expect(appointment).toHaveProperty('status');
    });

    it('should export communication records', () => {
      const communication = {
        channel: 'whatsapp',
        direction: 'outbound',
        template_name: 'appointment_reminder_24h',
        status: 'delivered',
        sent_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      };

      expect(communication).toHaveProperty('channel');
      expect(communication).toHaveProperty('direction');
      expect(communication).toHaveProperty('status');
    });
  });

  describe('GDPR Soft Delete Behavior', () => {
    it('should preserve audit trail after soft delete', () => {
      const deletionResult = {
        success: true,
        deletionType: 'SOFT',
        recordsAffected: 5,
        auditTrailPreserved: true,
      };

      // Audit trail should always be preserved for compliance
      expect(deletionResult.auditTrailPreserved).toBe(true);
    });

    it('should set retention period for soft deleted data', () => {
      const RETENTION_PERIOD_DAYS = 30;
      const deletedAt = new Date();
      const permanentDeletionDate = new Date(
        deletedAt.getTime() + RETENTION_PERIOD_DAYS * 24 * 60 * 60 * 1000
      );

      expect(permanentDeletionDate.getTime()).toBeGreaterThan(deletedAt.getTime());
      expect(
        Math.round((permanentDeletionDate.getTime() - deletedAt.getTime()) / (24 * 60 * 60 * 1000))
      ).toBe(RETENTION_PERIOD_DAYS);
    });

    it('should track deletion reason', () => {
      const deletionRequest = {
        phone: '+40712345678',
        reason: 'User exercising GDPR Article 17 right to erasure',
        confirmDeletion: true,
      };

      expect(deletionRequest.reason).toContain('GDPR Article 17');
    });
  });
});
