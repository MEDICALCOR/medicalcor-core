/**
 * @fileoverview Comprehensive Tests for Consent Service
 *
 * Tests GDPR-compliant consent management including:
 * - Consent recording and retrieval
 * - Consent withdrawal
 * - Audit trail generation
 * - Message parsing for consent keywords
 * - Multi-language consent messages
 *
 * @module domain/__tests__/consent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConsentService,
  createConsentService,
  type ConsentRequest,
  type ConsentSource,
  type ConsentType,
} from '../consent/consent-service.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createTestConsentSource = (
  overrides?: Partial<ConsentSource>
): ConsentSource => ({
  channel: 'whatsapp',
  method: 'explicit',
  evidenceUrl: null,
  witnessedBy: null,
  ...overrides,
});

const createTestConsentRequest = (
  overrides?: Partial<ConsentRequest>
): ConsentRequest => ({
  contactId: '12345',
  phone: '+40721234567',
  consentType: 'data_processing' as ConsentType,
  status: 'granted',
  source: createTestConsentSource(),
  ...overrides,
});

// ============================================================================
// CONSENT RECORDING TESTS
// ============================================================================

describe('ConsentService', () => {
  let service: ConsentService;

  beforeEach(() => {
    service = createConsentService();
  });

  describe('recordConsent', () => {
    it('should record a new consent successfully', async () => {
      const request = createTestConsentRequest();

      const result = await service.recordConsent(request);

      expect(result).toBeDefined();
      expect(result.contactId).toBe(request.contactId);
      expect(result.phone).toBe(request.phone);
      expect(result.consentType).toBe(request.consentType);
      expect(result.status).toBe('granted');
      expect(result.id).toMatch(/^cns_\d+_[a-f0-9]+$/);
    });

    it('should set grantedAt when status is granted', async () => {
      const request = createTestConsentRequest({ status: 'granted' });

      const result = await service.recordConsent(request);

      expect(result.grantedAt).toBeDefined();
      expect(result.grantedAt).not.toBeNull();
      expect(new Date(result.grantedAt!).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should not set grantedAt when status is denied', async () => {
      const request = createTestConsentRequest({ status: 'denied' });

      const result = await service.recordConsent(request);

      expect(result.grantedAt).toBeNull();
    });

    it('should set expiresAt when consent is granted', async () => {
      const request = createTestConsentRequest({ status: 'granted' });

      const result = await service.recordConsent(request);

      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt).not.toBeNull();
      const expiresAt = new Date(result.expiresAt!);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should use custom expiration when provided', async () => {
      const request = createTestConsentRequest({
        status: 'granted',
        expiresInDays: 30,
      });

      const result = await service.recordConsent(request);

      const expiresAt = new Date(result.expiresAt!);
      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);

      // Allow 1 second tolerance
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000);
    });

    it('should update existing consent record', async () => {
      const request = createTestConsentRequest();

      const first = await service.recordConsent(request);
      const updated = await service.recordConsent({
        ...request,
        status: 'denied',
      });

      expect(updated.id).toBe(first.id);
      expect(updated.status).toBe('denied');
    });

    it('should record consent with IP address and user agent', async () => {
      const request = createTestConsentRequest({
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser',
      });

      const result = await service.recordConsent(request);

      expect(result.ipAddress).toBe('192.168.1.1');
      expect(result.userAgent).toBe('Mozilla/5.0 Test Browser');
    });

    it('should record consent with metadata', async () => {
      const request = createTestConsentRequest({
        metadata: { campaign: 'test-campaign', source: 'landing-page' },
      });

      const result = await service.recordConsent(request);

      expect(result.metadata).toEqual({
        campaign: 'test-campaign',
        source: 'landing-page',
      });
    });
  });

  // ============================================================================
  // CONSENT CONVENIENCE METHODS
  // ============================================================================

  describe('grantConsent', () => {
    it('should grant consent with explicit status', async () => {
      const result = await service.grantConsent(
        '12345',
        '+40721234567',
        'marketing_whatsapp',
        createTestConsentSource()
      );

      expect(result.status).toBe('granted');
      expect(result.consentType).toBe('marketing_whatsapp');
    });

    it('should pass through options correctly', async () => {
      const result = await service.grantConsent(
        '12345',
        '+40721234567',
        'data_processing',
        createTestConsentSource(),
        {
          ipAddress: '10.0.0.1',
          userAgent: 'Test Agent',
          metadata: { test: true },
        }
      );

      expect(result.ipAddress).toBe('10.0.0.1');
      expect(result.userAgent).toBe('Test Agent');
      expect(result.metadata).toEqual({ test: true });
    });
  });

  describe('withdrawConsent', () => {
    it('should withdraw existing consent', async () => {
      await service.recordConsent(createTestConsentRequest());

      const result = await service.withdrawConsent(
        '12345',
        'data_processing',
        'User requested',
        'patient'
      );

      expect(result.status).toBe('withdrawn');
      expect(result.withdrawnAt).toBeDefined();
    });

    it('should throw when withdrawing non-existent consent', async () => {
      await expect(
        service.withdrawConsent('nonexistent', 'data_processing')
      ).rejects.toThrow('Consent record not found');
    });
  });

  // ============================================================================
  // CONSENT VALIDATION
  // ============================================================================

  describe('hasValidConsent', () => {
    it('should return true for valid granted consent', async () => {
      await service.recordConsent(createTestConsentRequest());

      const result = await service.hasValidConsent('12345', 'data_processing');

      expect(result).toBe(true);
    });

    it('should return false for non-existent consent', async () => {
      const result = await service.hasValidConsent('nonexistent', 'data_processing');

      expect(result).toBe(false);
    });

    it('should return false for denied consent', async () => {
      await service.recordConsent(
        createTestConsentRequest({ status: 'denied' })
      );

      const result = await service.hasValidConsent('12345', 'data_processing');

      expect(result).toBe(false);
    });

    it('should return false for withdrawn consent', async () => {
      await service.recordConsent(createTestConsentRequest());
      await service.withdrawConsent('12345', 'data_processing');

      const result = await service.hasValidConsent('12345', 'data_processing');

      expect(result).toBe(false);
    });
  });

  describe('hasRequiredConsents', () => {
    it('should return valid when all required consents are granted', async () => {
      await service.recordConsent(createTestConsentRequest());

      const result = await service.hasRequiredConsents('12345');

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return missing consents list', async () => {
      const result = await service.hasRequiredConsents('12345');

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('data_processing');
    });
  });

  // ============================================================================
  // CONSENT RETRIEVAL
  // ============================================================================

  describe('getConsent', () => {
    it('should retrieve existing consent', async () => {
      await service.recordConsent(createTestConsentRequest());

      const result = await service.getConsent('12345', 'data_processing');

      expect(result).toBeDefined();
      expect(result?.contactId).toBe('12345');
    });

    it('should return null for non-existent consent', async () => {
      const result = await service.getConsent('nonexistent', 'data_processing');

      expect(result).toBeNull();
    });
  });

  describe('getConsentsForContact', () => {
    it('should retrieve all consents for a contact', async () => {
      await service.recordConsent(createTestConsentRequest());
      await service.recordConsent(
        createTestConsentRequest({ consentType: 'marketing_whatsapp' })
      );

      const result = await service.getConsentsForContact('12345');

      expect(result).toHaveLength(2);
    });

    it('should return empty array for contact with no consents', async () => {
      const result = await service.getConsentsForContact('nonexistent');

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // AUDIT TRAIL
  // ============================================================================

  describe('getAuditTrail', () => {
    it('should return audit entries for consent', async () => {
      const consent = await service.recordConsent(createTestConsentRequest());

      const trail = await service.getAuditTrail(consent.id);

      expect(trail).toHaveLength(1);
      expect(trail[0]?.action).toBe('created');
    });

    it('should track multiple actions', async () => {
      const consent = await service.recordConsent(createTestConsentRequest());
      await service.withdrawConsent('12345', 'data_processing');

      const trail = await service.getAuditTrail(consent.id);

      expect(trail).toHaveLength(2);
      expect(trail.map(e => e.action)).toContain('created');
      expect(trail.map(e => e.action)).toContain('withdrawn');
    });
  });

  // ============================================================================
  // GDPR DATA EXPORT
  // ============================================================================

  describe('exportConsentData', () => {
    it('should export all consent data for a contact', async () => {
      await service.recordConsent(createTestConsentRequest());

      const exported = await service.exportConsentData('12345');

      expect(exported.consents).toHaveLength(1);
      expect(exported.auditTrail.length).toBeGreaterThan(0);
      expect(exported.exportedAt).toBeDefined();
    });
  });

  // ============================================================================
  // MESSAGE PARSING
  // ============================================================================

  describe('parseConsentFromMessage', () => {
    it('should detect positive consent in Romanian', () => {
      const result = service.parseConsentFromMessage('Da, sunt de acord');

      expect(result).toBeDefined();
      expect(result?.granted).toBe(true);
    });

    it('should detect positive consent in English', () => {
      const result = service.parseConsentFromMessage('Yes, I agree');

      expect(result).toBeDefined();
      expect(result?.granted).toBe(true);
    });

    it('should detect negative consent', () => {
      const result = service.parseConsentFromMessage('Nu, refuz');

      expect(result).toBeDefined();
      expect(result?.granted).toBe(false);
    });

    it('should detect STOP keyword', () => {
      const result = service.parseConsentFromMessage('STOP');

      expect(result).toBeDefined();
      expect(result?.granted).toBe(false);
    });

    it('should return null for unclear messages', () => {
      const result = service.parseConsentFromMessage('Ce programari aveti?');

      expect(result).toBeNull();
    });

    it('should include default consent types', () => {
      const result = service.parseConsentFromMessage('Da');

      expect(result?.consentTypes).toContain('marketing_whatsapp');
      expect(result?.consentTypes).toContain('appointment_reminders');
    });
  });

  // ============================================================================
  // LOCALIZED MESSAGES
  // ============================================================================

  describe('generateConsentMessage', () => {
    it('should generate Romanian consent message by default', () => {
      const message = service.generateConsentMessage();

      expect(message).toContain('Pentru a continua');
      expect(message).toContain('DA');
      expect(message).toContain('STOP');
    });

    it('should generate English consent message', () => {
      const message = service.generateConsentMessage('en');

      expect(message).toContain('To continue');
      expect(message).toContain('YES');
      expect(message).toContain('STOP');
    });

    it('should generate German consent message', () => {
      const message = service.generateConsentMessage('de');

      expect(message).toContain('Um fortzufahren');
      expect(message).toContain('JA');
      expect(message).toContain('STOP');
    });
  });
});

// ============================================================================
// PRODUCTION GUARD TESTS
// ============================================================================

describe('ConsentService Production Guard', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should throw in production without persistent repository', () => {
    process.env.NODE_ENV = 'production';

    expect(() => createConsentService()).toThrow(
      /persistent repository/i
    );
  });

  it('should allow in-memory repository in development', () => {
    process.env.NODE_ENV = 'development';

    expect(() => createConsentService()).not.toThrow();
  });

  it('should allow in-memory repository in test', () => {
    process.env.NODE_ENV = 'test';

    expect(() => createConsentService()).not.toThrow();
  });
});
