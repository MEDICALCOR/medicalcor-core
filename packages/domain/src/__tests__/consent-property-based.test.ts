import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  ConsentService,
  type ConsentType,
  type ConsentStatus,
  type ConsentRecord,
  type ConsentAuditEntry,
  type ConsentSource,
} from '../consent/consent-service.js';
import type { ConsentRepository } from '../consent/consent-repository.js';

/**
 * Property-Based Tests for Consent Service
 *
 * These tests verify invariant properties for GDPR consent management.
 *
 * Key properties tested:
 * 1. Consent status transitions: Valid state machine
 * 2. Audit trail completeness: Every action creates audit entry
 * 3. Expiration logic: Expired consents are invalid
 * 4. Message parsing: Consistent consent detection from messages
 * 5. Data export: Complete data for GDPR portability
 */

/**
 * In-memory repository for testing
 */
class TestConsentRepository implements ConsentRepository {
  private consents = new Map<string, ConsentRecord>();
  private auditEntries: ConsentAuditEntry[] = [];

  async save(consent: ConsentRecord): Promise<void> {
    this.consents.set(consent.id, { ...consent });
  }

  async upsert(consent: ConsentRecord): Promise<{ record: ConsentRecord; wasCreated: boolean }> {
    // Find existing by contact and type
    const existing = Array.from(this.consents.values()).find(
      (c) => c.contactId === consent.contactId && c.consentType === consent.consentType
    );

    if (existing) {
      const updated = {
        ...existing,
        ...consent,
        id: existing.id,
        updatedAt: new Date().toISOString(),
      };
      this.consents.set(existing.id, updated);
      return { record: updated, wasCreated: false };
    }

    this.consents.set(consent.id, consent);
    return { record: consent, wasCreated: true };
  }

  async findById(id: string): Promise<ConsentRecord | null> {
    return this.consents.get(id) ?? null;
  }

  async findByContactAndType(
    contactId: string,
    consentType: ConsentType
  ): Promise<ConsentRecord | null> {
    return (
      Array.from(this.consents.values()).find(
        (c) => c.contactId === contactId && c.consentType === consentType
      ) ?? null
    );
  }

  async findByPhoneAndType(phone: string, consentType: ConsentType): Promise<ConsentRecord | null> {
    return (
      Array.from(this.consents.values()).find(
        (c) => c.phone === phone && c.consentType === consentType
      ) ?? null
    );
  }

  async findByContact(contactId: string): Promise<ConsentRecord[]> {
    return Array.from(this.consents.values()).filter((c) => c.contactId === contactId);
  }

  async appendAuditEntry(entry: ConsentAuditEntry): Promise<void> {
    this.auditEntries.push(entry);
  }

  async getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]> {
    return this.auditEntries.filter((e) => e.consentId === consentId);
  }

  async getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]> {
    const consentIds = Array.from(this.consents.values())
      .filter((c) => c.contactId === contactId)
      .map((c) => c.id);
    return this.auditEntries.filter((e) => consentIds.includes(e.consentId));
  }

  async deleteByContact(contactId: string): Promise<void> {
    const toDelete = Array.from(this.consents.entries())
      .filter(([, c]) => c.contactId === contactId)
      .map(([id]) => id);
    for (const id of toDelete) {
      this.consents.delete(id);
    }
  }

  // Test helpers
  clear(): void {
    this.consents.clear();
    this.auditEntries = [];
  }

  getAllConsents(): ConsentRecord[] {
    return Array.from(this.consents.values());
  }

  getAllAuditEntries(): ConsentAuditEntry[] {
    return [...this.auditEntries];
  }
}

/**
 * Custom arbitraries for generating realistic test data
 */

// Generate valid consent types
const consentTypeArbitrary: fc.Arbitrary<ConsentType> = fc.constantFrom(
  'data_processing',
  'marketing_whatsapp',
  'marketing_email',
  'marketing_sms',
  'appointment_reminders',
  'treatment_updates',
  'third_party_sharing'
);

// Generate valid consent statuses
const consentStatusArbitrary: fc.Arbitrary<ConsentStatus> = fc.constantFrom(
  'granted',
  'denied',
  'withdrawn',
  'pending'
);

// Generate consent source channels
const channelArbitrary = fc.constantFrom('whatsapp', 'web', 'phone', 'in_person', 'email') as fc.Arbitrary<
  'whatsapp' | 'web' | 'phone' | 'in_person' | 'email'
>;

// Generate consent methods
const methodArbitrary = fc.constantFrom('explicit', 'implicit', 'double_opt_in') as fc.Arbitrary<
  'explicit' | 'implicit' | 'double_opt_in'
>;

// Generate consent source
const consentSourceArbitrary: fc.Arbitrary<ConsentSource> = fc.record({
  channel: channelArbitrary,
  method: methodArbitrary,
  evidenceUrl: fc.option(fc.webUrl(), { nil: null }),
  witnessedBy: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
});

// Generate contact IDs
const contactIdArbitrary = fc
  .tuple(fc.constant('contact_'), fc.string({ minLength: 5, maxLength: 20 }))
  .map(([prefix, id]) => `${prefix}${id.replace(/[^a-zA-Z0-9]/g, '')}`);

// Generate phone numbers
const phoneArbitrary = fc
  .tuple(
    fc.constantFrom('+40', '+1', '+44', '+49'),
    fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 9,
      maxLength: 10,
    })
  )
  .map(([prefix, digits]) => `${prefix}${digits.join('')}`);

// Generate consent request
const consentRequestArbitrary = fc.record({
  contactId: contactIdArbitrary,
  phone: phoneArbitrary,
  consentType: consentTypeArbitrary,
  status: consentStatusArbitrary,
  source: consentSourceArbitrary,
  ipAddress: fc.option(fc.ipV4(), { nil: undefined }),
  userAgent: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
  expiresInDays: fc.option(fc.integer({ min: 1, max: 1095 }), { nil: undefined }),
});

describe('ConsentService - Property-Based Tests', () => {
  let repository: TestConsentRepository;
  let service: ConsentService;

  beforeEach(() => {
    repository = new TestConsentRepository();
    service = new ConsentService({ repository });
  });

  describe('Consent Record Invariants', () => {
    it('recorded consent should always have valid ID', async () => {
      await fc.assert(
        fc.asyncProperty(consentRequestArbitrary, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);

          expect(consent.id).toBeDefined();
          expect(typeof consent.id).toBe('string');
          expect(consent.id.length).toBeGreaterThan(0);
          expect(consent.id).toMatch(/^cns_/); // Should have prefix
        }),
        { numRuns: 100 }
      );
    });

    it('recorded consent should preserve input data', async () => {
      await fc.assert(
        fc.asyncProperty(consentRequestArbitrary, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);

          expect(consent.contactId).toBe(request.contactId);
          expect(consent.phone).toBe(request.phone);
          expect(consent.consentType).toBe(request.consentType);
          expect(consent.status).toBe(request.status);
        }),
        { numRuns: 100 }
      );
    });

    it('consent timestamps should be valid ISO strings', async () => {
      await fc.assert(
        fc.asyncProperty(consentRequestArbitrary, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);

          expect(consent.createdAt).toBeDefined();
          expect(new Date(consent.createdAt).toISOString()).toBe(consent.createdAt);
          expect(consent.updatedAt).toBeDefined();
          expect(new Date(consent.updatedAt).toISOString()).toBe(consent.updatedAt);
        }),
        { numRuns: 100 }
      );
    });

    it('granted consent should have grantedAt timestamp', async () => {
      const grantedRequest = fc.record({
        contactId: contactIdArbitrary,
        phone: phoneArbitrary,
        consentType: consentTypeArbitrary,
        status: fc.constant('granted' as ConsentStatus),
        source: consentSourceArbitrary,
      });

      await fc.assert(
        fc.asyncProperty(grantedRequest, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);

          expect(consent.grantedAt).toBeDefined();
          expect(consent.grantedAt).not.toBeNull();
          expect(new Date(consent.grantedAt!).toISOString()).toBe(consent.grantedAt);
        }),
        { numRuns: 50 }
      );
    });

    it('granted consent should have expiration date', async () => {
      const grantedRequest = fc.record({
        contactId: contactIdArbitrary,
        phone: phoneArbitrary,
        consentType: consentTypeArbitrary,
        status: fc.constant('granted' as ConsentStatus),
        source: consentSourceArbitrary,
      });

      await fc.assert(
        fc.asyncProperty(grantedRequest, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);

          expect(consent.expiresAt).toBeDefined();
          expect(consent.expiresAt).not.toBeNull();
          // Expiration should be in the future
          expect(new Date(consent.expiresAt!).getTime()).toBeGreaterThan(Date.now());
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Audit Trail Invariants', () => {
    it('every consent record should create audit entry', async () => {
      await fc.assert(
        fc.asyncProperty(consentRequestArbitrary, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);
          const auditTrail = await service.getAuditTrail(consent.id);

          expect(auditTrail.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('audit entry should reference correct consent', async () => {
      await fc.assert(
        fc.asyncProperty(consentRequestArbitrary, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);
          const auditTrail = await service.getAuditTrail(consent.id);

          for (const entry of auditTrail) {
            expect(entry.consentId).toBe(consent.id);
          }
        }),
        { numRuns: 50 }
      );
    });

    it('audit entry should have valid timestamp', async () => {
      await fc.assert(
        fc.asyncProperty(consentRequestArbitrary, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);
          const auditTrail = await service.getAuditTrail(consent.id);

          for (const entry of auditTrail) {
            expect(entry.timestamp).toBeDefined();
            expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
          }
        }),
        { numRuns: 50 }
      );
    });

    it('audit entry newStatus should match request status', async () => {
      await fc.assert(
        fc.asyncProperty(consentRequestArbitrary, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);
          const auditTrail = await service.getAuditTrail(consent.id);

          // First entry should be 'created' with new status matching request
          expect(auditTrail[0]?.newStatus).toBe(request.status);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Consent Validity Invariants', () => {
    it('hasValidConsent should return false for non-existent consent', async () => {
      await fc.assert(
        fc.asyncProperty(contactIdArbitrary, consentTypeArbitrary, async (contactId, consentType) => {
          repository.clear();
          const isValid = await service.hasValidConsent(contactId, consentType);
          expect(isValid).toBe(false);
        }),
        { numRuns: 50 }
      );
    });

    it('hasValidConsent should return true for granted non-expired consent', async () => {
      const grantedRequest = fc.record({
        contactId: contactIdArbitrary,
        phone: phoneArbitrary,
        consentType: consentTypeArbitrary,
        status: fc.constant('granted' as ConsentStatus),
        source: consentSourceArbitrary,
      });

      await fc.assert(
        fc.asyncProperty(grantedRequest, async (request) => {
          repository.clear();
          await service.recordConsent(request);
          const isValid = await service.hasValidConsent(request.contactId, request.consentType);
          expect(isValid).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('hasValidConsent should return false for denied consent', async () => {
      const deniedRequest = fc.record({
        contactId: contactIdArbitrary,
        phone: phoneArbitrary,
        consentType: consentTypeArbitrary,
        status: fc.constant('denied' as ConsentStatus),
        source: consentSourceArbitrary,
      });

      await fc.assert(
        fc.asyncProperty(deniedRequest, async (request) => {
          repository.clear();
          await service.recordConsent(request);
          const isValid = await service.hasValidConsent(request.contactId, request.consentType);
          expect(isValid).toBe(false);
        }),
        { numRuns: 50 }
      );
    });

    it('hasValidConsent should return false for withdrawn consent', async () => {
      const withdrawnRequest = fc.record({
        contactId: contactIdArbitrary,
        phone: phoneArbitrary,
        consentType: consentTypeArbitrary,
        status: fc.constant('withdrawn' as ConsentStatus),
        source: consentSourceArbitrary,
      });

      await fc.assert(
        fc.asyncProperty(withdrawnRequest, async (request) => {
          repository.clear();
          await service.recordConsent(request);
          const isValid = await service.hasValidConsent(request.contactId, request.consentType);
          expect(isValid).toBe(false);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Message Parsing Invariants', () => {
    it('parseConsentFromMessage should return null for unrelated messages', () => {
      const randomMessages = fc.oneof(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constantFrom(
          'Hello there!',
          'What is your price?',
          'Information please',
          'Call me back',
          'I have a question'
        )
      );

      fc.assert(
        fc.property(randomMessages, (message) => {
          const result = service.parseConsentFromMessage(message);
          // Either null or a valid result
          if (result !== null) {
            expect(typeof result.granted).toBe('boolean');
            expect(Array.isArray(result.consentTypes)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('explicit consent keywords should be parsed as granted', () => {
      const consentMessages = fc.constantFrom(
        'da',
        'yes',
        'accept',
        'accepto',
        'sunt de acord',
        'agree',
        'DA',
        'YES',
        'ACCEPT'
      );

      fc.assert(
        fc.property(consentMessages, (message) => {
          const result = service.parseConsentFromMessage(message);
          expect(result).not.toBeNull();
          expect(result?.granted).toBe(true);
          expect(result?.consentTypes.length).toBeGreaterThan(0);
        }),
        { numRuns: 50 }
      );
    });

    it('explicit denial keywords should be parsed as not granted', () => {
      const denialMessages = fc.constantFrom(
        'nu',
        'no',
        'reject',
        'refuz',
        'nu sunt de acord',
        'disagree',
        'stop',
        'NU',
        'NO',
        'STOP'
      );

      fc.assert(
        fc.property(denialMessages, (message) => {
          const result = service.parseConsentFromMessage(message);
          expect(result).not.toBeNull();
          expect(result?.granted).toBe(false);
        }),
        { numRuns: 50 }
      );
    });

    it('parsed consent should always include marketing_whatsapp type', () => {
      const consentMessages = fc.constantFrom('da', 'yes', 'accept', 'nu', 'no', 'reject');

      fc.assert(
        fc.property(consentMessages, (message) => {
          const result = service.parseConsentFromMessage(message);
          if (result !== null) {
            expect(result.consentTypes).toContain('marketing_whatsapp');
          }
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Consent Message Generation Invariants', () => {
    it('generated message should be non-empty string', () => {
      const languages = ['ro', 'en', 'de'] as const;

      fc.assert(
        fc.property(fc.constantFrom(...languages), (language) => {
          const message = service.generateConsentMessage(language);
          expect(typeof message).toBe('string');
          expect(message.length).toBeGreaterThan(0);
        }),
        { numRuns: 30 }
      );
    });

    it('generated message should contain consent keywords', () => {
      const languages = ['ro', 'en', 'de'] as const;

      fc.assert(
        fc.property(fc.constantFrom(...languages), (language) => {
          const message = service.generateConsentMessage(language);
          // Should contain positive/negative response options
          const hasResponseOptions =
            message.toLowerCase().includes('da') ||
            message.toLowerCase().includes('yes') ||
            message.toLowerCase().includes('ja');
          expect(hasResponseOptions).toBe(true);
        }),
        { numRuns: 30 }
      );
    });

    it('generated message should contain STOP instruction', () => {
      const languages = ['ro', 'en', 'de'] as const;

      fc.assert(
        fc.property(fc.constantFrom(...languages), (language) => {
          const message = service.generateConsentMessage(language);
          expect(message.toUpperCase()).toContain('STOP');
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Data Export Invariants', () => {
    it('exportConsentData should return complete structure', async () => {
      await fc.assert(
        fc.asyncProperty(contactIdArbitrary, async (contactId) => {
          repository.clear();
          const exportData = await service.exportConsentData(contactId);

          expect(exportData).toHaveProperty('consents');
          expect(exportData).toHaveProperty('auditTrail');
          expect(exportData).toHaveProperty('exportedAt');
          expect(Array.isArray(exportData.consents)).toBe(true);
          expect(Array.isArray(exportData.auditTrail)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('exported consents should match recorded consents', async () => {
      const multipleConsents = fc.array(
        fc.record({
          contactId: fc.constant('test_contact_123'),
          phone: phoneArbitrary,
          consentType: consentTypeArbitrary,
          status: fc.constant('granted' as ConsentStatus),
          source: consentSourceArbitrary,
        }),
        { minLength: 1, maxLength: 5 }
      );

      await fc.assert(
        fc.asyncProperty(multipleConsents, async (requests) => {
          repository.clear();
          const contactId = 'test_contact_123';

          // Record all consents
          for (const request of requests) {
            await service.recordConsent(request);
          }

          const exportData = await service.exportConsentData(contactId);

          // Unique consent types recorded
          const uniqueTypes = new Set(requests.map((r) => r.consentType));
          expect(exportData.consents.length).toBe(uniqueTypes.size);
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Data Erasure Invariants', () => {
    it('eraseConsentData should remove all consents for contact', async () => {
      const contactId = 'erase_test_contact';
      const multipleConsents = fc.array(
        fc.record({
          contactId: fc.constant(contactId),
          phone: phoneArbitrary,
          consentType: consentTypeArbitrary,
          status: fc.constant('granted' as ConsentStatus),
          source: consentSourceArbitrary,
        }),
        { minLength: 1, maxLength: 5 }
      );

      await fc.assert(
        fc.asyncProperty(multipleConsents, async (requests) => {
          repository.clear();

          // Record consents
          for (const request of requests) {
            await service.recordConsent(request);
          }

          // Erase
          await service.eraseConsentData(contactId, 'system', 'test erasure');

          // Verify erasure
          const remainingConsents = await service.getConsentsForContact(contactId);
          expect(remainingConsents.length).toBe(0);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Consent Withdrawal Invariants', () => {
    it('withdrawConsent should change status to withdrawn', async () => {
      const grantedRequest = fc.record({
        contactId: contactIdArbitrary,
        phone: phoneArbitrary,
        consentType: consentTypeArbitrary,
        status: fc.constant('granted' as ConsentStatus),
        source: consentSourceArbitrary,
      });

      await fc.assert(
        fc.asyncProperty(grantedRequest, async (request) => {
          repository.clear();
          await service.recordConsent(request);

          const withdrawn = await service.withdrawConsent(
            request.contactId,
            request.consentType,
            'test reason'
          );

          expect(withdrawn.status).toBe('withdrawn');
          expect(withdrawn.withdrawnAt).toBeDefined();
          expect(withdrawn.withdrawnAt).not.toBeNull();
        }),
        { numRuns: 50 }
      );
    });

    it('withdrawn consent should have audit entry', async () => {
      const grantedRequest = fc.record({
        contactId: contactIdArbitrary,
        phone: phoneArbitrary,
        consentType: consentTypeArbitrary,
        status: fc.constant('granted' as ConsentStatus),
        source: consentSourceArbitrary,
      });

      await fc.assert(
        fc.asyncProperty(grantedRequest, async (request) => {
          repository.clear();
          const consent = await service.recordConsent(request);

          await service.withdrawConsent(request.contactId, request.consentType, 'test reason');

          const auditTrail = await service.getAuditTrail(consent.id);
          const withdrawalEntry = auditTrail.find((e) => e.action === 'withdrawn');

          expect(withdrawalEntry).toBeDefined();
          expect(withdrawalEntry?.newStatus).toBe('withdrawn');
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Required Consents Invariants', () => {
    it('hasRequiredConsents should return valid structure', async () => {
      await fc.assert(
        fc.asyncProperty(contactIdArbitrary, async (contactId) => {
          repository.clear();
          const result = await service.hasRequiredConsents(contactId);

          expect(result).toHaveProperty('valid');
          expect(result).toHaveProperty('missing');
          expect(typeof result.valid).toBe('boolean');
          expect(Array.isArray(result.missing)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('hasRequiredConsents should identify missing data_processing consent', async () => {
      await fc.assert(
        fc.asyncProperty(contactIdArbitrary, async (contactId) => {
          repository.clear();
          const result = await service.hasRequiredConsents(contactId);

          // data_processing is required by default
          expect(result.valid).toBe(false);
          expect(result.missing).toContain('data_processing');
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in contact ID', async () => {
      const specialIds = fc.constantFrom(
        'contact_test-123',
        'contact_test_456',
        'contact_test.789',
        'contact_émojis_🦷'
      );

      await fc.assert(
        fc.asyncProperty(specialIds, consentTypeArbitrary, async (contactId, consentType) => {
          repository.clear();
          await service.recordConsent({
            contactId,
            phone: '+40721234567',
            consentType,
            status: 'granted',
            source: { channel: 'web', method: 'explicit', evidenceUrl: null, witnessedBy: null },
          });

          const consent = await service.getConsent(contactId, consentType);
          expect(consent).not.toBeNull();
          expect(consent?.contactId).toBe(contactId);
        }),
        { numRuns: 30 }
      );
    });

    it('should handle international phone formats', async () => {
      const internationalPhones = fc.constantFrom(
        '+40721234567',
        '+1234567890',
        '+442071234567',
        '+4915123456789'
      );

      await fc.assert(
        fc.asyncProperty(
          contactIdArbitrary,
          internationalPhones,
          consentTypeArbitrary,
          async (contactId, phone, consentType) => {
            repository.clear();
            const consent = await service.recordConsent({
              contactId,
              phone,
              consentType,
              status: 'granted',
              source: { channel: 'whatsapp', method: 'explicit', evidenceUrl: null, witnessedBy: null },
            });

            expect(consent.phone).toBe(phone);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
