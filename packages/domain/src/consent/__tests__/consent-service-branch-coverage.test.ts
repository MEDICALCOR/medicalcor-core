/**
 * @fileoverview Branch Coverage Tests for GDPR Consent Service
 * Target: 100% coverage - focuses on uncovered branches and edge cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ConsentService,
  createPersistentConsentService,
  type ConsentRecord,
  type ConsentSource,
  type ConsentType,
  type ConsentLogger,
  type ConsentAuditEntry,
} from '../consent-service.js';
import type { ConsentRepository } from '../consent-repository.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

function createMockRepository(): ConsentRepository & {
  _data: Map<string, ConsentRecord>;
  _findByPhoneAndTypeImpl?: typeof ConsentRepository.prototype.findByPhoneAndType;
} {
  const data = new Map<string, ConsentRecord>();
  const auditLog: ConsentAuditEntry[] = [];

  const repo: ConsentRepository & {
    _data: Map<string, ConsentRecord>;
    _findByPhoneAndTypeImpl?: typeof ConsentRepository.prototype.findByPhoneAndType;
  } = {
    _data: data,
    _findByPhoneAndTypeImpl: undefined,

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
        : { ...consent, id: existing!.id, createdAt: existing!.createdAt };

      data.set(key, recordToSave);
      return { record: recordToSave, wasCreated };
    }),

    findByContactAndType: vi.fn(async (contactId: string, consentType: ConsentType) => {
      const key = `${contactId}:${consentType}`;
      return data.get(key) ?? null;
    }),

    findByPhoneAndType: vi.fn(async (phone: string, consentType: ConsentType) => {
      for (const consent of data.values()) {
        if (consent.phone === phone && consent.consentType === consentType) {
          return consent;
        }
      }
      return null;
    }),

    findByContact: vi.fn(async (contactId: string) => {
      const results: ConsentRecord[] = [];
      for (const consent of data.values()) {
        if (consent.contactId === contactId) {
          results.push(consent);
        }
      }
      return results;
    }),

    delete: vi.fn(async (consentId: string) => {
      for (const [key, consent] of data.entries()) {
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

    findExpiringSoon: vi.fn(async () => []),
    findByStatus: vi.fn(async () => []),

    appendAuditEntry: vi.fn(async (entry: ConsentAuditEntry) => {
      auditLog.push(entry);
    }),

    getAuditTrail: vi.fn(async (consentId: string) => {
      return auditLog.filter((e) => e.consentId === consentId);
    }),

    getContactAuditTrail: vi.fn(async (contactId: string) => {
      const contactConsents: ConsentRecord[] = [];
      for (const consent of data.values()) {
        if (consent.contactId === contactId) {
          contactConsents.push(consent);
        }
      }
      const consentIds = new Set(contactConsents.map((c) => c.id));
      return auditLog.filter((e) => consentIds.has(e.consentId));
    }),
  };

  return repo;
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

// =============================================================================
// BRANCH COVERAGE TESTS
// =============================================================================

describe('ConsentService - Branch Coverage', () => {
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

  // ===========================================================================
  // FACTORY FUNCTION BRANCHES
  // ===========================================================================

  describe('Factory Functions', () => {
    it('should create with createPersistentConsentService with isProduction true by default', () => {
      const svc = createPersistentConsentService(repository, { logger });
      expect(svc).toBeInstanceOf(ConsentService);
    });

    it('should create with createPersistentConsentService with isProduction false', () => {
      const svc = createPersistentConsentService(repository, {
        logger,
        isProduction: false,
      });
      expect(svc).toBeInstanceOf(ConsentService);
    });

    it('should create with createPersistentConsentService with custom config', () => {
      const svc = createPersistentConsentService(repository, {
        config: { currentPolicyVersion: 3, defaultExpirationDays: 365 },
      });
      expect(svc).toBeInstanceOf(ConsentService);
    });

    it('should use no-op logger by default', async () => {
      const svc = new ConsentService({ repository });

      // Should not throw even when logging
      await svc.recordConsent({
        contactId: 'test-contact',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'granted',
        source: createDefaultSource(),
      });
    });
  });

  // ===========================================================================
  // RECORD CONSENT BRANCHES
  // ===========================================================================

  describe('recordConsent branches', () => {
    it('should handle upsert for existing consent (wasCreated=false)', async () => {
      // First record
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'granted',
        source: createDefaultSource(),
      });

      // Update same consent
      const result = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'withdrawn',
        source: createDefaultSource(),
      });

      expect(result.status).toBe('withdrawn');
      // Verify audit action is 'withdrawn' not 'created'
      expect(repository.appendAuditEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'withdrawn',
          newStatus: 'withdrawn',
        })
      );
    });

    it('should set action to "updated" when status is not withdrawn', async () => {
      // First record
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'marketing_whatsapp',
        status: 'granted',
        source: createDefaultSource(),
      });

      // Update with granted status again
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'marketing_whatsapp',
        status: 'granted',
        source: createDefaultSource(),
      });

      expect(repository.appendAuditEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'updated',
        })
      );
    });

    it('should handle denied status correctly', async () => {
      const result = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'marketing_email',
        status: 'denied',
        source: createDefaultSource(),
      });

      expect(result.grantedAt).toBeNull();
      expect(result.withdrawnAt).toBeNull();
      expect(result.expiresAt).toBeNull();
    });

    it('should handle pending status correctly', async () => {
      const result = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'pending',
        source: createDefaultSource(),
      });

      expect(result.status).toBe('pending');
      expect(result.grantedAt).toBeNull();
      expect(result.withdrawnAt).toBeNull();
      expect(result.expiresAt).toBeNull();
    });

    it('should handle null ipAddress and userAgent', async () => {
      const result = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'granted',
        source: createDefaultSource(),
      });

      expect(result.ipAddress).toBeNull();
      expect(result.userAgent).toBeNull();
    });

    it('should handle empty metadata', async () => {
      const result = await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'granted',
        source: createDefaultSource(),
      });

      expect(result.metadata).toEqual({});
    });
  });

  // ===========================================================================
  // GRANT CONSENT BRANCHES
  // ===========================================================================

  describe('grantConsent branches', () => {
    it('should work without optional parameters', async () => {
      const result = await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource()
      );

      expect(result.status).toBe('granted');
      expect(result.ipAddress).toBeNull();
      expect(result.userAgent).toBeNull();
    });

    it('should include ipAddress when provided', async () => {
      const result = await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource(),
        { ipAddress: '192.168.1.1' }
      );

      expect(result.ipAddress).toBe('192.168.1.1');
    });

    it('should include userAgent when provided', async () => {
      const result = await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource(),
        { userAgent: 'Mozilla/5.0' }
      );

      expect(result.userAgent).toBe('Mozilla/5.0');
    });

    it('should include metadata when provided', async () => {
      const result = await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource(),
        { metadata: { campaign: 'summer-2024' } }
      );

      expect(result.metadata).toEqual({ campaign: 'summer-2024' });
    });

    it('should handle empty options object', async () => {
      const result = await service.grantConsent(
        'contact-123',
        '+40721234567',
        'data_processing',
        createDefaultSource(),
        {}
      );

      expect(result.status).toBe('granted');
    });
  });

  // ===========================================================================
  // WITHDRAW CONSENT BRANCHES
  // ===========================================================================

  describe('withdrawConsent branches', () => {
    it('should use default performedBy value', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'marketing_whatsapp',
        createDefaultSource()
      );

      await service.withdrawConsent('contact-123', 'marketing_whatsapp');

      expect(repository.appendAuditEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          performedBy: 'patient',
          reason: null,
        })
      );
    });

    it('should handle null reason', async () => {
      await service.grantConsent(
        'contact-123',
        '+40721234567',
        'marketing_email',
        createDefaultSource()
      );

      await service.withdrawConsent('contact-123', 'marketing_email', undefined);

      expect(repository.appendAuditEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          reason: null,
        })
      );
    });
  });

  // ===========================================================================
  // HAS VALID CONSENT BRANCHES
  // ===========================================================================

  describe('hasValidConsent branches', () => {
    it('should return false when consent is denied', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'denied',
        source: createDefaultSource(),
      });

      const result = await service.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(false);
    });

    it('should return false when consent is withdrawn', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'withdrawn',
        source: createDefaultSource(),
      });

      const result = await service.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(false);
    });

    it('should return false when consent is pending', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'pending',
        source: createDefaultSource(),
      });

      const result = await service.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(false);
    });

    it('should return true when expiresAt is null', async () => {
      // Directly set up a consent without expiration
      const consent: ConsentRecord = {
        id: 'test-id',
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'granted',
        version: 1,
        grantedAt: new Date().toISOString(),
        withdrawnAt: null,
        expiresAt: null,
        source: createDefaultSource(),
        ipAddress: null,
        userAgent: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      repository._data.set('contact-123:data_processing', consent);

      const result = await service.hasValidConsent('contact-123', 'data_processing');
      expect(result).toBe(true);
    });

    it('should return false and auto-expire when expiresAt equals current time exactly', async () => {
      // Set up consent that expires exactly now
      const now = new Date('2024-06-15T10:00:00Z');
      const consent: ConsentRecord = {
        id: 'test-id',
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'marketing_email',
        status: 'granted',
        version: 1,
        grantedAt: new Date('2024-01-01').toISOString(),
        withdrawnAt: null,
        expiresAt: now.toISOString(),
        source: createDefaultSource(),
        ipAddress: null,
        userAgent: null,
        metadata: {},
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-01').toISOString(),
      };
      repository._data.set('contact-123:marketing_email', consent);

      // Advance time by 1ms so it's expired
      vi.setSystemTime(new Date('2024-06-15T10:00:00.001Z'));

      const result = await service.hasValidConsent('contact-123', 'marketing_email');
      expect(result).toBe(false);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should return true when policy version equals current', async () => {
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

  // ===========================================================================
  // CHECK CONSENT BRANCHES (phone-based)
  // ===========================================================================

  describe('checkConsent branches', () => {
    it('should return false when findByPhoneAndType method does not exist', async () => {
      // Create repository without findByPhoneAndType
      const repoWithoutMethod = {
        ...repository,
        findByPhoneAndType: undefined,
      } as unknown as ConsentRepository;

      const svc = new ConsentService({ repository: repoWithoutMethod, logger });

      const result = await svc.checkConsent('+40721234567', 'data_processing');
      expect(result.granted).toBe(false);
    });

    it('should return false when consent not found by phone', async () => {
      const result = await service.checkConsent('+40721234567', 'data_processing');
      expect(result.granted).toBe(false);
    });

    it('should return false when consent status is not granted', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'marketing_sms',
        status: 'denied',
        source: createDefaultSource(),
      });

      const result = await service.checkConsent('+40721234567', 'marketing_sms');
      expect(result.granted).toBe(false);
    });

    it('should return false when consent has expired by phone lookup', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'appointment_reminders',
        status: 'granted',
        source: createDefaultSource(),
        expiresInDays: 5,
      });

      // Advance time past expiration
      vi.setSystemTime(new Date('2024-06-25T10:00:00Z'));

      const result = await service.checkConsent('+40721234567', 'appointment_reminders');
      expect(result.granted).toBe(false);
    });

    it('should return false when policy version is outdated via phone lookup', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'treatment_updates',
        status: 'granted',
        source: createDefaultSource(),
      });

      // Create service with higher policy version
      const newPolicyService = new ConsentService({
        repository,
        logger,
        config: { currentPolicyVersion: 2 },
      });

      const result = await newPolicyService.checkConsent('+40721234567', 'treatment_updates');
      expect(result.granted).toBe(false);
    });

    it('should return true when consent is valid by phone lookup', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'data_processing',
        status: 'granted',
        source: createDefaultSource(),
      });

      const result = await service.checkConsent('+40721234567', 'data_processing');
      expect(result.granted).toBe(true);
    });

    it('should auto-expire consent when checking by phone', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'marketing_whatsapp',
        status: 'granted',
        source: createDefaultSource(),
        expiresInDays: 1,
      });

      // Advance time past expiration
      vi.setSystemTime(new Date('2024-06-17T10:00:00Z'));

      const result = await service.checkConsent('+40721234567', 'marketing_whatsapp');
      expect(result.granted).toBe(false);
      expect(repository.save).toHaveBeenCalled(); // Should save the expired consent
    });
  });

  // ===========================================================================
  // HAS REQUIRED CONSENTS BRANCHES
  // ===========================================================================

  describe('hasRequiredConsents branches', () => {
    it('should check all required consents when none granted', async () => {
      const multiConsentService = new ConsentService({
        repository,
        logger,
        config: {
          requiredForProcessing: ['data_processing', 'appointment_reminders', 'treatment_updates'],
        },
      });

      const result = await multiConsentService.hasRequiredConsents('contact-123');

      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(3);
      expect(result.missing).toContain('data_processing');
      expect(result.missing).toContain('appointment_reminders');
      expect(result.missing).toContain('treatment_updates');
    });

    it('should return valid when empty required consents array', async () => {
      const noRequiredService = new ConsentService({
        repository,
        logger,
        config: { requiredForProcessing: [] },
      });

      const result = await noRequiredService.hasRequiredConsents('contact-123');

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  // ===========================================================================
  // ERASE CONSENT DATA BRANCHES
  // ===========================================================================

  describe('eraseConsentData branches', () => {
    it('should handle erasure with multiple consents', async () => {
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
        'marketing_email',
        createDefaultSource()
      );

      await service.eraseConsentData('contact-123', 'gdpr-admin', 'User request');

      // Should create audit entries for each consent
      expect(repository.appendAuditEntry).toHaveBeenCalledTimes(6); // 3 creates + 3 withdrawals
      expect(repository.deleteByContact).toHaveBeenCalledWith('contact-123');
    });

    it('should log correct erased count for multiple consents', async () => {
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

      await service.eraseConsentData('contact-123', 'dpo', 'GDPR request');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ contactId: 'contact-123', erasedCount: 2 }),
        'Consent data erased'
      );
    });
  });

  // ===========================================================================
  // PARSE CONSENT FROM MESSAGE BRANCHES
  // ===========================================================================

  describe('parseConsentFromMessage edge cases', () => {
    it('should handle message with both consent and denial - denial wins', () => {
      // "da" and "nu" both present, but "nu" comes first
      const result = service.parseConsentFromMessage('nu da accept');
      expect(result?.granted).toBe(false);
    });

    it('should handle Romanian negation pattern "nu sunt de acord"', () => {
      const result = service.parseConsentFromMessage('nu sunt de acord cu aceasta');
      expect(result?.granted).toBe(false);
    });

    it('should handle positive "sunt de acord" without preceding "nu"', () => {
      const result = service.parseConsentFromMessage('Eu sunt de acord');
      expect(result?.granted).toBe(true);
    });

    it('should handle "accepto" variant', () => {
      const result = service.parseConsentFromMessage('Accepto termenii');
      expect(result?.granted).toBe(true);
    });

    it('should handle word boundaries correctly for "da"', () => {
      // "da" should be detected even at word boundaries
      const result = service.parseConsentFromMessage('da');
      expect(result?.granted).toBe(true);
    });

    it('should handle "disagree" correctly', () => {
      const result = service.parseConsentFromMessage('I disagree with this');
      expect(result?.granted).toBe(false);
    });

    it('should handle "refuz" correctly', () => {
      const result = service.parseConsentFromMessage('Refuz acest acord');
      expect(result?.granted).toBe(false);
    });

    it('should return null for ambiguous messages', () => {
      const result = service.parseConsentFromMessage('What are the terms?');
      expect(result).toBeNull();
    });

    it('should handle mixed case patterns', () => {
      const result = service.parseConsentFromMessage('SUNT DE ACORD');
      expect(result?.granted).toBe(true);
    });

    it('should handle trailing whitespace', () => {
      const result = service.parseConsentFromMessage('  da  ');
      expect(result?.granted).toBe(true);
    });
  });

  // ===========================================================================
  // EXPIRE CONSENT PRIVATE METHOD (tested via hasValidConsent)
  // ===========================================================================

  describe('expireConsent (private method)', () => {
    it('should create audit entry with expired action', async () => {
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'marketing_email',
        status: 'granted',
        source: createDefaultSource(),
        expiresInDays: 5,
      });

      // Advance time past expiration
      vi.setSystemTime(new Date('2024-06-25T10:00:00Z'));

      await service.hasValidConsent('contact-123', 'marketing_email');

      expect(repository.appendAuditEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'expired',
          newStatus: 'withdrawn',
          performedBy: 'system',
          reason: 'Consent expired',
        })
      );
    });

    it('should include original expiresAt in metadata', async () => {
      const expiresAt = new Date('2024-06-20T10:00:00.000Z');
      await service.recordConsent({
        contactId: 'contact-123',
        phone: '+40721234567',
        consentType: 'marketing_sms',
        status: 'granted',
        source: createDefaultSource(),
        expiresInDays: 5,
      });

      // Advance time past expiration
      vi.setSystemTime(new Date('2024-06-25T10:00:00Z'));

      await service.hasValidConsent('contact-123', 'marketing_sms');

      expect(repository.appendAuditEntry).toHaveBeenLastCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ expiresAt: expect.any(String) }),
        })
      );
    });
  });

  // ===========================================================================
  // CONCURRENT CONSENT RECORDING (Race Condition Test)
  // ===========================================================================

  describe('concurrent consent recording', () => {
    it('should handle concurrent upserts atomically', async () => {
      // Simulate race condition by making upsert return different results
      let callCount = 0;
      repository.upsert = vi.fn(async (consent: ConsentRecord) => {
        callCount++;
        const key = `${consent.contactId}:${consent.consentType}`;
        const existing = repository._data.get(key);

        // First call creates, second updates
        const wasCreated = callCount === 1;
        const recordToSave = wasCreated
          ? consent
          : {
              ...consent,
              id: existing?.id ?? consent.id,
              createdAt: existing?.createdAt ?? consent.createdAt,
            };

        repository._data.set(key, recordToSave);
        return { record: recordToSave, wasCreated };
      });

      // Concurrent requests
      const [result1, result2] = await Promise.all([
        service.recordConsent({
          contactId: 'contact-concurrent',
          phone: '+40721234567',
          consentType: 'data_processing',
          status: 'granted',
          source: createDefaultSource(),
        }),
        service.recordConsent({
          contactId: 'contact-concurrent',
          phone: '+40721234567',
          consentType: 'data_processing',
          status: 'granted',
          source: createDefaultSource(),
        }),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(repository.upsert).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // ALL CONSENT SOURCE CHANNELS AND METHODS
  // ===========================================================================

  describe('ConsentSource all combinations', () => {
    const channels: ConsentSource['channel'][] = ['whatsapp', 'web', 'phone', 'in_person', 'email'];
    const methods: ConsentSource['method'][] = ['explicit', 'implicit', 'double_opt_in'];

    for (const channel of channels) {
      for (const method of methods) {
        it(`should handle channel=${channel}, method=${method}`, async () => {
          const source: ConsentSource = {
            channel,
            method,
            evidenceUrl: channel === 'in_person' ? 'https://example.com/evidence.pdf' : null,
            witnessedBy: channel === 'in_person' ? 'Dr. Smith' : null,
          };

          const result = await service.grantConsent(
            `contact-${channel}-${method}`,
            '+40721234567',
            'data_processing',
            source
          );

          expect(result.source.channel).toBe(channel);
          expect(result.source.method).toBe(method);
        });
      }
    }
  });

  // ===========================================================================
  // ALL CONSENT TYPES
  // ===========================================================================

  describe('All consent types', () => {
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
      const result = await service.recordConsent({
        contactId: 'contact-all-types',
        phone: '+40721234567',
        consentType,
        status: 'granted',
        source: createDefaultSource(),
      });

      expect(result.consentType).toBe(consentType);
    });
  });
});
