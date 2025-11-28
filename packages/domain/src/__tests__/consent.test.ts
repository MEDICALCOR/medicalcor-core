import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConsentService,
  createConsentService,
  type ConsentType,
  type ConsentSource,
  type ConsentRecord,
} from '../consent/consent-service.js';
import { InMemoryConsentRepository } from '../consent/consent-repository.js';

/**
 * GDPR Consent Service Tests
 *
 * These tests verify GDPR compliance requirements:
 * - Consent recording and withdrawal
 * - Audit trail generation
 * - Data portability (export)
 * - Right to erasure
 * - Consent expiration handling
 */

describe('ConsentService', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  const mockSource: ConsentSource = {
    channel: 'whatsapp',
    method: 'explicit',
    evidenceUrl: null,
    witnessedBy: null,
  };

  beforeEach(() => {
    // Reset NODE_ENV to allow in-memory repository
    vi.stubEnv('NODE_ENV', 'test');
    repository = new InMemoryConsentRepository();
    service = createConsentService({ repository });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('recordConsent', () => {
    it('should create a new consent record', async () => {
      const result = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721123456',
        consentType: 'marketing_whatsapp',
        status: 'granted',
        source: mockSource,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^cns_/);
      expect(result.contactId).toBe('contact-123');
      expect(result.phone).toBe('+40721123456');
      expect(result.consentType).toBe('marketing_whatsapp');
      expect(result.status).toBe('granted');
      expect(result.grantedAt).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.ipAddress).toBe('192.168.1.1');
    });

    it('should update an existing consent record', async () => {
      // First record
      const first = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721123456',
        consentType: 'marketing_whatsapp',
        status: 'granted',
        source: mockSource,
      });

      // Update - withdraw
      const second = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721123456',
        consentType: 'marketing_whatsapp',
        status: 'withdrawn',
        source: mockSource,
      });

      expect(second.id).toBe(first.id); // Same record
      expect(second.status).toBe('withdrawn');
      expect(second.withdrawnAt).toBeDefined();
    });

    it('should set expiration date based on config', async () => {
      const result = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721123456',
        consentType: 'data_processing',
        status: 'granted',
        source: mockSource,
      });

      const expiresAt = new Date(result.expiresAt!);
      const now = new Date();
      const daysDiff = Math.floor(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Default is 2 years (730 days), allow 1 day margin
      expect(daysDiff).toBeGreaterThanOrEqual(729);
      expect(daysDiff).toBeLessThanOrEqual(731);
    });

    it('should allow custom expiration', async () => {
      const result = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721123456',
        consentType: 'marketing_email',
        status: 'granted',
        source: mockSource,
        expiresInDays: 30,
      });

      const expiresAt = new Date(result.expiresAt!);
      const now = new Date();
      const daysDiff = Math.floor(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });
  });

  describe('grantConsent', () => {
    it('should grant consent with convenience method', async () => {
      const result = await service.grantConsent(
        'contact-456',
        '+40722123456',
        'appointment_reminders',
        mockSource,
        { metadata: { campaign: 'test' } }
      );

      expect(result.status).toBe('granted');
      expect(result.consentType).toBe('appointment_reminders');
      expect(result.metadata).toEqual({ campaign: 'test' });
    });
  });

  describe('withdrawConsent', () => {
    it('should withdraw existing consent', async () => {
      // First grant
      await service.grantConsent(
        'contact-789',
        '+40723123456',
        'marketing_sms',
        mockSource
      );

      // Then withdraw
      const result = await service.withdrawConsent(
        'contact-789',
        'marketing_sms',
        'User requested',
        'patient'
      );

      expect(result.status).toBe('withdrawn');
      expect(result.withdrawnAt).toBeDefined();
    });

    it('should throw error when withdrawing non-existent consent', async () => {
      await expect(
        service.withdrawConsent('non-existent', 'marketing_whatsapp')
      ).rejects.toThrow('Consent record not found');
    });
  });

  describe('hasValidConsent', () => {
    it('should return true for granted consent', async () => {
      await service.grantConsent(
        'contact-100',
        '+40724123456',
        'data_processing',
        mockSource
      );

      const isValid = await service.hasValidConsent('contact-100', 'data_processing');
      expect(isValid).toBe(true);
    });

    it('should return false for withdrawn consent', async () => {
      await service.grantConsent(
        'contact-101',
        '+40725123456',
        'marketing_whatsapp',
        mockSource
      );

      await service.withdrawConsent('contact-101', 'marketing_whatsapp');

      const isValid = await service.hasValidConsent('contact-101', 'marketing_whatsapp');
      expect(isValid).toBe(false);
    });

    it('should return false for non-existent consent', async () => {
      const isValid = await service.hasValidConsent('non-existent', 'data_processing');
      expect(isValid).toBe(false);
    });

    it('should return false for expired consent', async () => {
      // Create consent with very short expiration
      await service.recordConsent({
        contactId: 'contact-102',
        phone: '+40726123456',
        consentType: 'marketing_email',
        status: 'granted',
        source: mockSource,
        expiresInDays: -1, // Already expired
      });

      const isValid = await service.hasValidConsent('contact-102', 'marketing_email');
      expect(isValid).toBe(false);
    });

    it('should return false for outdated policy version', async () => {
      // Create service with higher policy version
      const serviceV2 = createConsentService({
        repository,
        config: { currentPolicyVersion: 2 },
      });

      // Create consent with old service (version 1)
      await service.grantConsent(
        'contact-103',
        '+40727123456',
        'data_processing',
        mockSource
      );

      // Check with new service (version 2 required)
      const isValid = await serviceV2.hasValidConsent('contact-103', 'data_processing');
      expect(isValid).toBe(false);
    });
  });

  describe('hasRequiredConsents', () => {
    it('should return valid when all required consents granted', async () => {
      await service.grantConsent(
        'contact-200',
        '+40728123456',
        'data_processing',
        mockSource
      );

      const result = await service.hasRequiredConsents('contact-200');
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return missing consents', async () => {
      const result = await service.hasRequiredConsents('contact-201');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('data_processing');
    });
  });

  describe('getConsent', () => {
    it('should return consent record by type', async () => {
      await service.grantConsent(
        'contact-300',
        '+40729123456',
        'treatment_updates',
        mockSource
      );

      const result = await service.getConsent('contact-300', 'treatment_updates');
      expect(result).toBeDefined();
      expect(result?.consentType).toBe('treatment_updates');
    });

    it('should return null for non-existent consent', async () => {
      const result = await service.getConsent('non-existent', 'marketing_whatsapp');
      expect(result).toBeNull();
    });
  });

  describe('getConsentsForContact', () => {
    it('should return all consents for contact', async () => {
      const consentTypes: ConsentType[] = [
        'data_processing',
        'marketing_whatsapp',
        'appointment_reminders',
      ];

      for (const type of consentTypes) {
        await service.grantConsent('contact-400', '+40730123456', type, mockSource);
      }

      const results = await service.getConsentsForContact('contact-400');
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.consentType).sort()).toEqual(consentTypes.sort());
    });
  });

  describe('audit trail', () => {
    it('should create audit entries for consent operations', async () => {
      // Grant
      const consent = await service.grantConsent(
        'contact-500',
        '+40731123456',
        'marketing_email',
        mockSource
      );

      // Withdraw
      await service.withdrawConsent('contact-500', 'marketing_email', 'Test reason');

      const auditTrail = await service.getAuditTrail(consent.id);
      expect(auditTrail.length).toBeGreaterThanOrEqual(2);

      // Check actions
      const actions = auditTrail.map((e) => e.action);
      expect(actions).toContain('created');
      expect(actions).toContain('withdrawn');
    });

    it('should record performer and reason in audit', async () => {
      await service.grantConsent(
        'contact-501',
        '+40732123456',
        'third_party_sharing',
        mockSource
      );

      await service.withdrawConsent(
        'contact-501',
        'third_party_sharing',
        'Patient requested removal',
        'staff-user-123'
      );

      const auditTrail = await service.getContactAuditTrail('contact-501');
      const withdrawEntry = auditTrail.find((e) => e.action === 'withdrawn');

      expect(withdrawEntry?.performedBy).toBe('staff-user-123');
      expect(withdrawEntry?.reason).toBe('Patient requested removal');
    });
  });

  describe('exportConsentData (GDPR Data Portability)', () => {
    it('should export all consent data for contact', async () => {
      await service.grantConsent(
        'contact-600',
        '+40733123456',
        'data_processing',
        mockSource
      );
      await service.grantConsent(
        'contact-600',
        '+40733123456',
        'marketing_whatsapp',
        mockSource
      );

      const exportData = await service.exportConsentData('contact-600');

      expect(exportData.consents).toHaveLength(2);
      expect(exportData.auditTrail.length).toBeGreaterThanOrEqual(2);
      expect(exportData.exportedAt).toBeDefined();
    });
  });

  describe('eraseConsentData (GDPR Right to Erasure)', () => {
    it('should delete all consent data for contact', async () => {
      await service.grantConsent(
        'contact-700',
        '+40734123456',
        'data_processing',
        mockSource
      );
      await service.grantConsent(
        'contact-700',
        '+40734123456',
        'marketing_sms',
        mockSource
      );

      await service.eraseConsentData(
        'contact-700',
        'admin-user',
        'Patient erasure request'
      );

      // Verify data is deleted
      const consents = await service.getConsentsForContact('contact-700');
      expect(consents).toHaveLength(0);
    });
  });

  describe('parseConsentFromMessage', () => {
    it('should parse positive consent from Romanian', () => {
      const result = service.parseConsentFromMessage('Da, sunt de acord');
      expect(result?.granted).toBe(true);
      expect(result?.consentTypes).toContain('marketing_whatsapp');
    });

    it('should parse positive consent from English', () => {
      const result = service.parseConsentFromMessage('Yes, I agree');
      expect(result?.granted).toBe(true);
    });

    it('should parse negative consent (STOP)', () => {
      const result = service.parseConsentFromMessage('STOP');
      expect(result?.granted).toBe(false);
    });

    it('should parse negative consent (Nu)', () => {
      const result = service.parseConsentFromMessage('Nu doresc');
      expect(result?.granted).toBe(false);
    });

    it('should return null for ambiguous messages', () => {
      const result = service.parseConsentFromMessage('Vreau informatii');
      expect(result).toBeNull();
    });
  });

  describe('generateConsentMessage', () => {
    it('should generate Romanian consent message', () => {
      const message = service.generateConsentMessage('ro');
      expect(message).toContain('acordul');
      expect(message).toContain('DA');
      expect(message).toContain('NU');
      expect(message).toContain('STOP');
    });

    it('should generate English consent message', () => {
      const message = service.generateConsentMessage('en');
      expect(message).toContain('consent');
      expect(message).toContain('YES');
      expect(message).toContain('NO');
    });

    it('should generate German consent message', () => {
      const message = service.generateConsentMessage('de');
      expect(message).toContain('Zustimmung');
      expect(message).toContain('JA');
      expect(message).toContain('NEIN');
    });
  });

  describe('production mode safeguards', () => {
    it('should throw error in production without repository', () => {
      vi.stubEnv('NODE_ENV', 'production');

      expect(() => createConsentService()).toThrow(
        /persistent repository in production/
      );
    });

    it('should allow in-memory repository in development', () => {
      vi.stubEnv('NODE_ENV', 'development');

      // Should not throw
      expect(() => createConsentService()).not.toThrow();
    });
  });
});
