/**
 * Idempotency Key Management Tests
 * Comprehensive coverage with property-based testing
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createIdempotencyKey,
  createNamespacedIdempotencyKey,
  IdempotencyKeys,
  hashMessageContent,
  getTodayString,
  getCurrentHourString,
} from '../idempotency.js';

describe('createIdempotencyKey', () => {
  it('should create a deterministic key from string components', () => {
    const key1 = createIdempotencyKey('abc', 'def');
    const key2 = createIdempotencyKey('abc', 'def');
    expect(key1).toBe(key2);
  });

  it('should create different keys for different inputs', () => {
    const key1 = createIdempotencyKey('abc', 'def');
    const key2 = createIdempotencyKey('abc', 'xyz');
    expect(key1).not.toBe(key2);
  });

  it('should handle numeric components', () => {
    const key1 = createIdempotencyKey('test', 123);
    const key2 = createIdempotencyKey('test', 123);
    expect(key1).toBe(key2);
  });

  it('should filter out null and undefined components', () => {
    const key1 = createIdempotencyKey('a', null, 'b', undefined, 'c');
    const key2 = createIdempotencyKey('a', 'b', 'c');
    expect(key1).toBe(key2);
  });

  it('should throw if all components are null/undefined', () => {
    expect(() => createIdempotencyKey(null, undefined)).toThrow(
      'At least one non-null component is required'
    );
  });

  it('should return a 32-character hex string', () => {
    const key = createIdempotencyKey('test');
    expect(key).toHaveLength(32);
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });

  // Property-based tests
  it('should always return 32-character hex strings (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (input) => {
        const key = createIdempotencyKey(input);
        return key.length === 32 && /^[a-f0-9]{32}$/.test(key);
      })
    );
  });

  it('should be deterministic (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
        (components) => {
          const key1 = createIdempotencyKey(...components);
          const key2 = createIdempotencyKey(...components);
          return key1 === key2;
        }
      )
    );
  });
});

describe('createNamespacedIdempotencyKey', () => {
  it('should prefix key with namespace', () => {
    const key = createNamespacedIdempotencyKey('myns', 'test');
    expect(key).toMatch(/^myns:[a-f0-9]{32}$/);
  });

  it('should create different keys for different namespaces', () => {
    const key1 = createNamespacedIdempotencyKey('ns1', 'test');
    const key2 = createNamespacedIdempotencyKey('ns2', 'test');
    expect(key1).not.toBe(key2);
  });

  it('should be deterministic', () => {
    const key1 = createNamespacedIdempotencyKey('ns', 'a', 'b');
    const key2 = createNamespacedIdempotencyKey('ns', 'a', 'b');
    expect(key1).toBe(key2);
  });
});

describe('IdempotencyKeys', () => {
  describe('whatsAppMessage', () => {
    it('should create key with wa-msg namespace', () => {
      const key = IdempotencyKeys.whatsAppMessage('msg123');
      expect(key).toMatch(/^wa-msg:/);
    });

    it('should be deterministic', () => {
      const key1 = IdempotencyKeys.whatsAppMessage('msg123');
      const key2 = IdempotencyKeys.whatsAppMessage('msg123');
      expect(key1).toBe(key2);
    });
  });

  describe('whatsAppStatus', () => {
    it('should create key with wa-status namespace', () => {
      const key = IdempotencyKeys.whatsAppStatus('msg123', 'delivered');
      expect(key).toMatch(/^wa-status:/);
    });

    it('should create different keys for different statuses', () => {
      const key1 = IdempotencyKeys.whatsAppStatus('msg123', 'sent');
      const key2 = IdempotencyKeys.whatsAppStatus('msg123', 'delivered');
      expect(key1).not.toBe(key2);
    });
  });

  describe('voiceCall', () => {
    it('should create key with voice-call namespace', () => {
      const key = IdempotencyKeys.voiceCall('call123');
      expect(key).toMatch(/^voice-call:/);
    });
  });

  describe('voiceCallCompleted', () => {
    it('should create key with voice-completed namespace', () => {
      const key = IdempotencyKeys.voiceCallCompleted('call123');
      expect(key).toMatch(/^voice-completed:/);
    });
  });

  describe('paymentSucceeded', () => {
    it('should create key with payment-success namespace', () => {
      const key = IdempotencyKeys.paymentSucceeded('pay123');
      expect(key).toMatch(/^payment-success:/);
    });
  });

  describe('paymentFailed', () => {
    it('should create key with payment-failed namespace', () => {
      const key = IdempotencyKeys.paymentFailed('pay123');
      expect(key).toMatch(/^payment-failed:/);
    });
  });

  describe('refund', () => {
    it('should create key with refund namespace', () => {
      const key = IdempotencyKeys.refund('refund123');
      expect(key).toMatch(/^refund:/);
    });
  });

  describe('leadScoring', () => {
    it('should create key with lead-score namespace', () => {
      const key = IdempotencyKeys.leadScoring('phone123', 'whatsapp', 'hash123');
      expect(key).toMatch(/^lead-score:/);
    });

    it('should create different keys for different phones', () => {
      const key1 = IdempotencyKeys.leadScoring('phone1', 'whatsapp', 'hash');
      const key2 = IdempotencyKeys.leadScoring('phone2', 'whatsapp', 'hash');
      expect(key1).not.toBe(key2);
    });
  });

  describe('patientJourney', () => {
    it('should create key with patient-journey namespace', () => {
      const key = IdempotencyKeys.patientJourney('contact123', 'stage1');
      expect(key).toMatch(/^patient-journey:/);
    });
  });

  describe('nurtureSequence', () => {
    it('should create key with nurture namespace', () => {
      const key = IdempotencyKeys.nurtureSequence('contact123', 'seq1');
      expect(key).toMatch(/^nurture:/);
    });
  });

  describe('bookingAgent', () => {
    it('should create key with booking namespace', () => {
      const key = IdempotencyKeys.bookingAgent('contact123', 'appt1');
      expect(key).toMatch(/^booking:/);
    });
  });

  describe('appointmentReminder', () => {
    it('should create key with reminder namespace', () => {
      const key = IdempotencyKeys.appointmentReminder('contact123', 'appt1', '24h');
      expect(key).toMatch(/^reminder:/);
    });
  });

  describe('recallCheck', () => {
    it('should create key with recall namespace', () => {
      const key = IdempotencyKeys.recallCheck('contact123', '2024-01-01');
      expect(key).toMatch(/^recall:/);
    });
  });

  describe('cronJob', () => {
    it('should create key with cron namespace', () => {
      const key = IdempotencyKeys.cronJob('daily-cleanup', '2024-01-01');
      expect(key).toMatch(/^cron:/);
    });

    it('should create different keys for different dates', () => {
      const key1 = IdempotencyKeys.cronJob('job', '2024-01-01');
      const key2 = IdempotencyKeys.cronJob('job', '2024-01-02');
      expect(key1).not.toBe(key2);
    });
  });

  describe('cronJobItem', () => {
    it('should create key with cron-item namespace', () => {
      const key = IdempotencyKeys.cronJobItem('job', '2024-01-01', 'item1');
      expect(key).toMatch(/^cron-item:/);
    });
  });

  describe('voiceTranscription', () => {
    it('should create key with transcription namespace', () => {
      const key = IdempotencyKeys.voiceTranscription('call123');
      expect(key).toMatch(/^transcription:/);
    });
  });

  describe('consentAudit', () => {
    it('should create key with consent-audit namespace', () => {
      const key = IdempotencyKeys.consentAudit('contact123', '2024-01-01');
      expect(key).toMatch(/^consent-audit:/);
    });
  });

  describe('staleLeadCleanup', () => {
    it('should create key with stale-cleanup namespace', () => {
      const key = IdempotencyKeys.staleLeadCleanup('contact123', '2024-01-01');
      expect(key).toMatch(/^stale-cleanup:/);
    });
  });

  describe('webhook', () => {
    it('should create key with webhook namespace', () => {
      const key = IdempotencyKeys.webhook('stripe', 'evt123');
      expect(key).toMatch(/^webhook:/);
    });
  });

  describe('vapiWebhook', () => {
    it('should create key with vapi-webhook namespace', () => {
      const key = IdempotencyKeys.vapiWebhook('call123');
      expect(key).toMatch(/^vapi-webhook:/);
    });
  });

  describe('custom', () => {
    it('should create key with custom prefix', () => {
      const key = IdempotencyKeys.custom('custom-prefix', 'a', 'b', 'c');
      expect(key).toMatch(/^custom-prefix:/);
    });
  });
});

describe('hashMessageContent', () => {
  it('should return a 16-character hex string', () => {
    const hash = hashMessageContent('Hello, world!');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('should be deterministic', () => {
    const hash1 = hashMessageContent('test message');
    const hash2 = hashMessageContent('test message');
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different content', () => {
    const hash1 = hashMessageContent('message 1');
    const hash2 = hashMessageContent('message 2');
    expect(hash1).not.toBe(hash2);
  });

  // Property-based test
  it('should always return 16-char hex (property)', () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const hash = hashMessageContent(content);
        return hash.length === 16 && /^[a-f0-9]{16}$/.test(hash);
      })
    );
  });
});

describe('getTodayString', () => {
  it('should return a date in YYYY-MM-DD format', () => {
    const today = getTodayString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return a valid date', () => {
    const today = getTodayString();
    const parsed = new Date(today);
    expect(parsed.toString()).not.toBe('Invalid Date');
  });
});

describe('getCurrentHourString', () => {
  it('should return a datetime in YYYY-MM-DD-HH format', () => {
    const hourString = getCurrentHourString();
    expect(hourString).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}$/);
  });

  it('should have hour in 00-23 range', () => {
    const hourString = getCurrentHourString();
    const hour = parseInt(hourString.slice(-2), 10);
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });
});
