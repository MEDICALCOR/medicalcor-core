/**
 * @fileoverview Comprehensive Tests for GDPR Consent Service
 *
 * Tests for consent verification, expiry handling, audit trail, and GDPR compliance.
 * Critical for HIPAA/GDPR compliance - untested consent code is a liability.
 *
 * Covers:
 * - Consent recording (create/update)
 * - Consent granting and withdrawal
 * - Consent validity checks (status, expiry, policy version)
 * - Required consent verification
 * - Audit trail generation
 * - GDPR data export (portability)
 * - GDPR data erasure (right to be forgotten)
 * - Message parsing (WhatsApp consent detection)
 * - Multi-language consent message generation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ConsentService,
  createConsentService,
  createPersistentConsentService,
  type ConsentRecord,
  type ConsentSource,
  type ConsentType,
  type ConsentRequest,
  type ConsentLogger,
  type ConsentAuditEntry,
} from '../consent-service.js';
import type { ConsentRepository } from '../consent-repository.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockRepository(): ConsentRepository & { _data: Map<string, ConsentRecord> } {
  const data = new Map<string, ConsentRecord>();
  const auditLog: ConsentAuditEntry[] = [];

  return {
    _data: data,

    save: vi.fn(async (consent: ConsentRecord) => {
      const key = `${consent.contactId}:${consent.consentType}`;
      data.set(key, consent);
      return consent;
    }),

    upsert: vi.fn(async (consent: ConsentRecord) => {
      const key = `${consent.contactId}:${consent.consentType}`;
      const existing = data.get(key);
      const wasCreated = !existing;

      const recordToSave = wasCreated
        ? consent
        : { ...consent, id: existing.id, createdAt: existing.createdAt };

      data.set(key, recordToSave);
      return { record: recordToSave, wasCreated };
    }),

    findByContactAndType: vi.fn(async (contactId: string, consentType: ConsentType) => {
      const key = `${contactId}:${consentType}`;
      return data.get(key) ?? null;
    }),

    findByContact: vi.fn(async (contactId: string) => {
      const results: ConsentRecord[] = [];
      for (const consent of Array.from(data.values())) {
        if (consent.contactId === contactId) {
          results.push(consent);
        }
      }
      return results;
    }),

    delete: vi.fn(async (consentId: string) => {
      for (const [key, consent] of Array.from(data.entries())) {
        if (consent.id === consentId) {
          data.delete(key);
          break;
        }
      }
    }),

    deleteByContact: vi.fn(async (contactId: string) => {
      let count = 0;
      for (const [key, consent] of Array.from(data.entries())) {
        if (consent.contactId === contactId) {
          data.delete(key);
          count++;
        }
      }
      return count;
    }),

    findExpiringSoon: vi.fn(async (_withinDays: number) => []),

    findByStatus: vi.fn(async (_status: string) => []),

    appendAuditEntry: vi.fn(async (entry: ConsentAuditEntry) => {
      auditLog.push(entry);
    }),

    getAuditTrail: vi.fn(async (consentId: string) => {
      return auditLog.filter((e) => e.consentId === consentId);
    }),

    getContactAuditTrail: vi.fn(async (contactId: string) => {
      const contactConsents: ConsentRecord[] = [];
      for (const consent of Array.from(data.values())) {
        if (consent.contactId === contactId) {
          contactConsents.push(consent);
        }
      }
      const consentIds = new Set(contactConsents.map((c) => c.id));
      return auditLog.filter((e) => consentIds.has(e.consentId));
    }),
  };
}

function createMockLogger(): ConsentLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
}

function createDefaultSource(): ConsentSource {
  return {
    channel: 'whatsapp',
    method: 'explicit',
    evidenceUrl: null,
    witnessedBy: null,
  };
}

function createConsentRequest(overrides: Partial<ConsentRequest> = {}): ConsentRequest {
  return {
    contactId: 'contact-123',
    phone: '+40721234567',
    consentType: 'data_processing',
    status: 'granted',
    source: createDefaultSource(),
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('ConsentService', () => {
  let repository: ReturnType<typeof createMockRepository>;
  let logger: ConsentLogger;
  let service: ConsentService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    repository = createMockRepository();
    logger = createMockLogger();
    service = new ConsentService({ repository, logger });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // CONSTRUCTOR & FACTORY TESTS
  // ==========================================================================

  describe('Constructor and Factory Functions', () => {
    it('should create service with createConsentService factory', () => {
      const svc = createConsentService({ repository });
      expect(svc).toBeInstanceOf(ConsentService);
    });

    it('should create service with createPersistentConsentService factory', () => {
      const svc = createPersistentConsentService(repository, { logger });
      expect(svc).toBeInstanceOf(ConsentService);
    });

    it('should use no-op logger when none provided', async () => {
      const svc = createConsentService({ repository });

      // Should not throw even without logger
      await svc.recordConsent(createConsentRequest());
      expect(repository.upsert).toHaveBeenCalled();
    });

    it('should accept custom config', () => {
      const svc = createConsentService({
        repository,
        config: {
          defaultExpirationDays: 365,
          currentPolicyVersion: 2,
        },
      });
      expect(svc).toBeInstanceOf(ConsentService);
    });
  });

  // ==========================================================================
  // RECORD CONSENT TESTS
  // ==========================================================================

  describe('recordConsent', () => {
    it('should create a new consent record', async () => {
      const request = createConsentRequest();

      const result = await service.recordConsent(request);

      expect(result.contactId).toBe('contact-123');
      expect(result.consentType).toBe('data_processing');
      expect(result.status).toBe('granted');
      expect(result.id).toMatch(/^cns_/);
      expect(repository.upsert).toHaveBeenCalled();
    });

    it('should set grantedAt when status is granted', async () => {
      const request = createConsentRequest({ status: 'granted' });

      const result = await service.recordConsent(request);

      expect(result.grantedAt).toBe('2024-06-15T10:00:00.000Z');
      expect(result.withdrawnAt).toBeNull();
    });

    it('should set withdrawnAt when status is withdrawn', async () => {
      const request = createConsentRequest({ status: 'withdrawn' });

      const result = await service.recordConsent(request);

      expect(result.withdrawnAt).toBe('2024-06-15T10:00:00.000Z');
      expect(result.grantedAt).toBeNull();
    });

    it('should set expiresAt based on defaultExpirationDays', async () => {
      const request = createConsentRequest({ status: 'granted' });

      const result = await service.recordConsent(request);

      // Default is 2 years (730 days)
      const expectedExpiry = new Date('2024-06-15T10:00:00Z');
      expectedExpiry.setDate(expectedExpiry.getDate() + 730);
      expect(result.expiresAt).toBe(expectedExpiry.toISOString());
    });

    it('should use custom expiresInDays when provided', async () => {
      const request = createConsentRequest({
        status: 'granted',
        expiresInDays: 30,
      });

      const result = await service.recordConsent(request);

      const expectedExpiry = new Date('2024-06-15T10:00:00Z');
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);
      expect(result.expiresAt).toBe(expectedExpiry.toISOString());
    });

    it('should not set expiresAt when status is not granted', async () => {
      const request = createConsentRequest({ status: 'denied' });

      const result = await service.recordConsent(request);

      expect(result.expiresAt).toBeNull();
    });

    it('should create audit entry for new consent', async () => {
      await service.recordConsent(createConsentRequest());

      expect(repository.appendAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          newStatus: 'granted',
          performedBy: 'system',
        })
      );
    });

    it('should store IP address and user agent when provided', async () => {
      const request = createConsentRequest({
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      });

      const result = await service.recordConsent(request);

      expect(result.ipAddress).toBe('192.168.1.100');
      expect(result.userAgent).toBe('Mozilla/5.0');
    });

    it('should store metadata when provided', async () => {
      const request = createConsentRequest({
        metadata: { campaignId: 'summer-2024', referrer: 'facebook' },
      });

      const result = await service.recordConsent(request);

      expect(result.metadata).toEqual({ campaignId: 'summer-2024', referrer: 'facebook' });
    });

    it('should log consent recording', async () => {
      await service.recordConsent(createConsentRequest());

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: 'contact-123', consentType: 'data_processing' }),
        'Consent recorded'
      );
    });
  });

  // ==========================================================================
  // GRANT CONSENT TESTS
  // ==========================================================================

  describe('grantConsent', () => {
    it('should grant consent with convenience method', async () => {
      const result = await service.grantConsent(
        'contact-456',
        '+40721111111',
        'marketing_whatsapp',
        createDefaultSource()
      );

      expect(result.status).toBe('granted');
      expect(result.contactId).toBe('contact-456');
      expect(result.consentType).toBe('marketing_whatsapp');
    });

    it('should accept optional parameters', async () => {
      const result = await service.grantConsent(
        'contact-789',
        '+40722222222',
        'marketing_email',
        createDefaultSource(),
        {
          ipAddress: '10.0.0.1',
          userAgent: 'TestAgent/1.0',
          metadata: { source: 'signup-form' },
        }
      );

      expect(result.ipAddress).toBe('10.0.0.1');
      expect(result.userAgent).toBe('TestAgent/1.0');
      expect(result.metadata).toEqual({ source: 'signup-form' });
    });
  });

  // ==========================================================================
  // WITHDRAW CONSENT TESTS
  // ==========================================================================

  describe('withdrawConsent', () => {
    it('should withdraw existing consent', async () => {
      // First grant consent
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'marketing_whatsapp',
        createDefaultSource()
      );

      // Then withdraw
      const result = await service.withdrawConsent('contact-123', 'marketing_whatsapp');

      expect(result.status).toBe('withdrawn');
      expect(result.withdrawnAt).toBe('2024-06-15T10:00:00.000Z');
    });

    it('should throw error when consent record not found', async () => {
      await expect(
        service.withdrawConsent('nonexistent-contact', 'data_processing')
      ).rejects.toThrow('Consent record not found');
    });

    it('should accept optional reason and performedBy', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'marketing_sms',
        createDefaultSource()
      );

      await service.withdrawConsent(
        'contact-123',
        'marketing_sms',
        'Patient requested via phone',
        'staff-user-456'
      );

      expect(repository.appendAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'withdrawn',
          performedBy: 'staff-user-456',
          reason: 'Patient requested via phone',
        })
      );
    });

    it('should create audit entry for withdrawal', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'appointment_reminders',
        createDefaultSource()
      );

      await service.withdrawConsent('contact-123', 'appointment_reminders');

      expect(repository.appendAuditEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'withdrawn',
          previousStatus: 'granted',
          newStatus: 'withdrawn',
        })
      );
    });

    it('should log consent withdrawal', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'treatment_updates',
        createDefaultSource()
      );

      await service.withdrawConsent('contact-123', 'treatment_updates', 'Changed mind');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: 'contact-123',
          consentType: 'treatment_updates',
          reason: 'Changed mind',
        }),
        'Consent withdrawn'
      );
    });
  });

  // ==========================================================================
  // HAS VALID CONSENT TESTS
  // ==========================================================================

  describe('hasValidConsent', () => {
    it('should return false when no consent exists', async () => {
      const result = await service.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(false);
    });

    it('should return false when consent status is not granted', async () => {
      await service.recordConsent(
        createConsentRequest({
          contactId: 'contact-123',
          consentType: 'data_processing',
          status: 'denied',
        })
      );

      const result = await service.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(false);
    });

    it('should return true for valid granted consent', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      const result = await service.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(true);
    });

    it('should return false and auto-expire when consent has expired', async () => {
      // Grant consent that expires in 10 days
      await service.recordConsent(
        createConsentRequest({
          contactId: 'contact-123',
          consentType: 'marketing_email',
          status: 'granted',
          expiresInDays: 10,
        })
      );

      // Advance time by 15 days
      vi.setSystemTime(new Date('2024-06-30T10:00:00Z'));

      const result = await service.hasValidConsent('contact-123', 'marketing_email');

      expect(result).toBe(false);
      // Should have saved the expired consent
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'withdrawn',
        })
      );
    });

    it('should return false when policy version is outdated', async () => {
      // Create service with newer policy version
      const newPolicyService = new ConsentService({
        repository,
        logger,
        config: { currentPolicyVersion: 2 },
      });

      // Grant consent with old policy version (default is 1)
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      // Check with new policy version service
      const result = await newPolicyService.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(false);
    });

    it('should return true when consent policy version matches or exceeds current', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      const result = await service.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // HAS REQUIRED CONSENTS TESTS
  // ==========================================================================

  describe('hasRequiredConsents', () => {
    it('should return valid:true when all required consents are granted', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      const result = await service.hasRequiredConsents('contact-123');

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should return valid:false with missing consents when required consent not granted', async () => {
      const result = await service.hasRequiredConsents('contact-123');

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('data_processing');
    });

    it('should check multiple required consents from config', async () => {
      const multiConsentService = new ConsentService({
        repository,
        logger,
        config: {
          requiredForProcessing: ['data_processing', 'appointment_reminders'],
        },
      });

      // Only grant one of the required consents
      await multiConsentService.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      const result = await multiConsentService.hasRequiredConsents('contact-123');

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('appointment_reminders');
      expect(result.missing).not.toContain('data_processing');
    });
  });

  // ==========================================================================
  // GET CONSENT TESTS
  // ==========================================================================

  describe('getConsent', () => {
    it('should return consent record when exists', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'marketing_whatsapp',
        createDefaultSource()
      );

      const result = await service.getConsent('contact-123', 'marketing_whatsapp');

      expect(result).not.toBeNull();
      expect(result?.contactId).toBe('contact-123');
      expect(result?.consentType).toBe('marketing_whatsapp');
    });

    it('should return null when consent does not exist', async () => {
      const result = await service.getConsent('nonexistent', 'data_processing');
      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // GET CONSENTS FOR CONTACT TESTS
  // ==========================================================================

  describe('getConsentsForContact', () => {
    it('should return all consents for a contact', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'marketing_whatsapp',
        createDefaultSource()
      );
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'appointment_reminders',
        createDefaultSource()
      );

      const results = await service.getConsentsForContact('contact-123');

      expect(results).toHaveLength(3);
      expect(results.map((c) => c.consentType)).toContain('data_processing');
      expect(results.map((c) => c.consentType)).toContain('marketing_whatsapp');
      expect(results.map((c) => c.consentType)).toContain('appointment_reminders');
    });

    it('should return empty array when no consents exist', async () => {
      const results = await service.getConsentsForContact('nonexistent');
      expect(results).toEqual([]);
    });
  });

  // ==========================================================================
  // AUDIT TRAIL TESTS
  // ==========================================================================

  describe('Audit Trail', () => {
    it('should get audit trail for a consent', async () => {
      const consent = await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      const auditTrail = await service.getAuditTrail(consent.id);

      expect(repository.getAuditTrail).toHaveBeenCalledWith(consent.id);
    });

    it('should get audit trail for a contact', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      await service.getContactAuditTrail('contact-123');

      expect(repository.getContactAuditTrail).toHaveBeenCalledWith('contact-123');
    });
  });

  // ==========================================================================
  // EXPORT CONSENT DATA (GDPR PORTABILITY) TESTS
  // ==========================================================================

  describe('exportConsentData (GDPR Data Portability)', () => {
    it('should export all consent data for a contact', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'marketing_email',
        createDefaultSource()
      );

      const exportData = await service.exportConsentData('contact-123');

      expect(exportData.consents).toHaveLength(2);
      expect(exportData.exportedAt).toBe('2024-06-15T10:00:00.000Z');
      expect(exportData.auditTrail).toBeDefined();
    });

    it('should include empty arrays when no data exists', async () => {
      const exportData = await service.exportConsentData('nonexistent');

      expect(exportData.consents).toEqual([]);
      expect(exportData.auditTrail).toEqual([]);
      expect(exportData.exportedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // ERASE CONSENT DATA (GDPR ERASURE) TESTS
  // ==========================================================================

  describe('eraseConsentData (GDPR Right to be Forgotten)', () => {
    it('should erase all consent data for a contact', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'marketing_whatsapp',
        createDefaultSource()
      );

      await service.eraseConsentData('contact-123', 'gdpr-admin', 'Subject access request');

      expect(repository.deleteByContact).toHaveBeenCalledWith('contact-123');
    });

    it('should create final audit entries before erasure', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      await service.eraseConsentData('contact-123', 'dpo-user', 'GDPR erasure request');

      // Should have created a withdrawal audit entry for the consent
      expect(repository.appendAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'withdrawn',
          performedBy: 'dpo-user',
          reason: 'GDPR erasure: GDPR erasure request',
          metadata: { erasureRequest: true },
        })
      );
    });

    it('should log erasure', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      await service.eraseConsentData('contact-123', 'admin', 'User request');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: 'contact-123', erasedCount: 1 }),
        'Consent data erased'
      );
    });

    it('should handle erasure when no data exists', async () => {
      await service.eraseConsentData('nonexistent', 'admin', 'Cleanup');

      expect(repository.deleteByContact).toHaveBeenCalledWith('nonexistent');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ erasedCount: 0 }),
        'Consent data erased'
      );
    });
  });

  // ==========================================================================
  // PARSE CONSENT FROM MESSAGE TESTS
  // ==========================================================================

  describe('parseConsentFromMessage', () => {
    describe('Consent granted patterns', () => {
      it.each([
        ['da', 'Romanian affirmative'],
        ['DA', 'Romanian affirmative uppercase'],
        ['Da', 'Romanian affirmative mixed case'],
        ['yes', 'English affirmative'],
        ['YES', 'English affirmative uppercase'],
        ['accept', 'Accept keyword'],
        ['Accept', 'Accept keyword mixed case'],
        ['accepto', 'Romanian accept'],
        ['sunt de acord', 'Romanian phrase'],
        ['Sunt de acord', 'Romanian phrase capitalized'],
        ['agree', 'English agree'],
        ['Agree', 'English agree capitalized'],
      ])('should detect granted consent from "%s" (%s)', (message, _description) => {
        const result = service.parseConsentFromMessage(message);

        expect(result).not.toBeNull();
        expect(result?.granted).toBe(true);
        expect(result?.consentTypes).toContain('marketing_whatsapp');
        expect(result?.consentTypes).toContain('appointment_reminders');
      });

      it('should detect consent in longer messages', () => {
        const result = service.parseConsentFromMessage('Da, sunt de acord cu termenii');
        expect(result?.granted).toBe(true);
      });
    });

    describe('Consent denied patterns', () => {
      it.each([
        ['nu', 'Romanian negative'],
        ['NU', 'Romanian negative uppercase'],
        ['Nu', 'Romanian negative mixed case'],
        ['no', 'English negative'],
        ['NO', 'English negative uppercase'],
        ['reject', 'Reject keyword'],
        ['refuz', 'Romanian refuz'],
        ['nu sunt de acord', 'Romanian negative phrase'],
        ['Nu sunt de acord', 'Romanian negative phrase capitalized'],
        ['disagree', 'English disagree'],
        ['stop', 'Stop keyword'],
        ['STOP', 'Stop keyword uppercase'],
      ])('should detect denied consent from "%s" (%s)', (message, _description) => {
        const result = service.parseConsentFromMessage(message);

        expect(result).not.toBeNull();
        expect(result?.granted).toBe(false);
      });

      it('should detect denial in longer messages', () => {
        const result = service.parseConsentFromMessage(
          'Nu, nu sunt de acord cu procesarea datelor'
        );
        expect(result?.granted).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should return null for unrecognized messages', () => {
        const result = service.parseConsentFromMessage('Hello, I have a question');
        expect(result).toBeNull();
      });

      it('should return null for empty message', () => {
        const result = service.parseConsentFromMessage('');
        expect(result).toBeNull();
      });

      it('should handle whitespace-only messages', () => {
        const result = service.parseConsentFromMessage('   ');
        expect(result).toBeNull();
      });

      it('should prioritize denial when both patterns present (safety)', () => {
        // "nu sunt de acord" contains both "nu" (denial) and patterns that could match affirmative
        const result = service.parseConsentFromMessage('nu sunt de acord');
        expect(result?.granted).toBe(false);
      });
    });
  });

  // ==========================================================================
  // GENERATE CONSENT MESSAGE TESTS
  // ==========================================================================

  describe('generateConsentMessage', () => {
    it('should generate Romanian consent message by default', () => {
      const message = service.generateConsentMessage();

      expect(message).toContain('DA');
      expect(message).toContain('NU');
      expect(message).toContain('STOP');
      expect(message).toContain('acordul');
    });

    it('should generate Romanian consent message when specified', () => {
      const message = service.generateConsentMessage('ro');

      expect(message).toContain('DA');
      expect(message).toContain('NU');
      expect(message).toContain('acordul');
    });

    it('should generate English consent message', () => {
      const message = service.generateConsentMessage('en');

      expect(message).toContain('YES');
      expect(message).toContain('NO');
      expect(message).toContain('STOP');
      expect(message).toContain('consent');
    });

    it('should generate German consent message', () => {
      const message = service.generateConsentMessage('de');

      expect(message).toContain('JA');
      expect(message).toContain('NEIN');
      expect(message).toContain('STOP');
      expect(message).toContain('Zustimmung');
    });
  });

  // ==========================================================================
  // CONSENT TYPE TESTS
  // ==========================================================================

  describe('Consent Types', () => {
    const consentTypes: ConsentType[] = [
      'data_processing',
      'marketing_whatsapp',
      'marketing_email',
      'marketing_sms',
      'appointment_reminders',
      'treatment_updates',
      'third_party_sharing',
    ];

    it.each(consentTypes)('should handle consent type: %s', async (consentType) => {
      await service.grantConsent('contact-123', '+40721234567', consentType, createDefaultSource());

      const result = await service.getConsent('contact-123', consentType);
      expect(result?.consentType).toBe(consentType);
    });
  });

  // ==========================================================================
  // CONSENT SOURCE TESTS
  // ==========================================================================

  describe('Consent Source', () => {
    it.each(['whatsapp', 'web', 'phone', 'in_person', 'email'] as const)(
      'should handle channel: %s',
      async (channel) => {
        const source: ConsentSource = {
          channel,
          method: 'explicit',
          evidenceUrl: null,
          witnessedBy: null,
        };

        const result = await service.grantConsent(
          'contact-123',
          '+40721234567',
          'data_processing',
          source
        );

        expect(result.source.channel).toBe(channel);
      }
    );

    it.each(['explicit', 'implicit', 'double_opt_in'] as const)(
      'should handle method: %s',
      async (method) => {
        const source: ConsentSource = {
          channel: 'web',
          method,
          evidenceUrl: null,
          witnessedBy: null,
        };

        const result = await service.grantConsent(
          'contact-123',
          '+40721234567',
          'data_processing',
          source
        );

        expect(result.source.method).toBe(method);
      }
    );

    it('should store evidence URL and witness', async () => {
      const source: ConsentSource = {
        channel: 'in_person',
        method: 'explicit',
        evidenceUrl: 'https://storage.example.com/consent-forms/12345.pdf',
        witnessedBy: 'Dr. Smith',
      };

      const result = await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        source
      );

      expect(result.source.evidenceUrl).toBe('https://storage.example.com/consent-forms/12345.pdf');
      expect(result.source.witnessedBy).toBe('Dr. Smith');
    });
  });

  // ==========================================================================
  // POLICY VERSION TESTS
  // ==========================================================================

  describe('Policy Version', () => {
    it('should use currentPolicyVersion from config', async () => {
      const v2Service = new ConsentService({
        repository,
        config: { currentPolicyVersion: 2 },
      });

      const result = await v2Service.recordConsent(createConsentRequest());

      expect(result.version).toBe(2);
    });

    it('should require new consent when policy version increases', async () => {
      // Grant consent with version 1
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      // Create service with higher policy version
      const v3Service = new ConsentService({
        repository,
        logger,
        config: { currentPolicyVersion: 3 },
      });

      // Old consent should be invalid
      const isValid = await v3Service.hasValidConsent('contact-123', 'data_processing');
      expect(isValid).toBe(false);
    });
  });
});
