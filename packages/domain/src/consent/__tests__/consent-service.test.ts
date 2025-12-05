/**
 * @fileoverview Additional Comprehensive Tests for ConsentService
 *
 * Tests advanced GDPR/HIPAA compliance scenarios including:
 * - Consent expiration and auto-expiry
 * - Policy version handling
 * - Data erasure (right to be forgotten)
 * - Audit trail completeness
 * - Race condition handling
 * - Source channel validation
 * - Evidence tracking
 * - Multi-consent type scenarios
 *
 * @module domain/consent/__tests__/consent-service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ConsentService,
  createConsentService,
  createPersistentConsentService,
  type ConsentRequest,
  type ConsentSource,
  type ConsentType,
  type ConsentLogger,
} from '../consent-service.js';
import { InMemoryConsentRepository } from '@medicalcor/core/repositories';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createTestConsentSource = (overrides?: Partial<ConsentSource>): ConsentSource => ({
  channel: 'whatsapp',
  method: 'explicit',
  evidenceUrl: null,
  witnessedBy: null,
  ...overrides,
});

const createTestConsentRequest = (overrides?: Partial<ConsentRequest>): ConsentRequest => ({
  contactId: '12345',
  phone: '+40721234567',
  consentType: 'data_processing' as ConsentType,
  status: 'granted',
  source: createTestConsentSource(),
  ...overrides,
});

// ============================================================================
// CONSENT EXPIRATION TESTS
// ============================================================================

describe('ConsentService - Expiration Handling', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
    service = createConsentService({ repository });
  });

  it('should auto-expire consent past expiration date', async () => {
    // Create consent that expired 1 day ago
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const consent = await service.recordConsent(
      createTestConsentRequest({ expiresInDays: -1 })
    );

    // Force expiration by checking validity
    const isValid = await service.hasValidConsent('12345', 'data_processing');

    expect(isValid).toBe(false);
  });

  it('should not expire consent before expiration date', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({ expiresInDays: 365 })
    );

    const isValid = await service.hasValidConsent('12345', 'data_processing');

    expect(isValid).toBe(true);
  });

  it('should create audit entry when consent expires', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({ expiresInDays: -1 })
    );

    // Trigger expiration check
    await service.hasValidConsent('12345', 'data_processing');

    const auditTrail = await service.getAuditTrail(consent.id);
    const expiredEntry = auditTrail.find((entry) => entry.action === 'expired');

    expect(expiredEntry).toBeDefined();
    expect(expiredEntry?.newStatus).toBe('withdrawn');
  });

  it('should handle consent without expiration', async () => {
    // Manually create consent without expiration
    const consent = await repository.save({
      id: 'cns_test_123',
      contactId: '12345',
      phone: '+40721234567',
      consentType: 'data_processing',
      status: 'granted',
      version: 1,
      grantedAt: new Date().toISOString(),
      withdrawnAt: null,
      expiresAt: null, // No expiration
      source: createTestConsentSource(),
      ipAddress: null,
      userAgent: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const isValid = await service.hasValidConsent('12345', 'data_processing');

    expect(isValid).toBe(true);
  });
});

// ============================================================================
// POLICY VERSION TESTS
// ============================================================================

describe('ConsentService - Policy Version', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
    service = createConsentService({
      repository,
      config: { currentPolicyVersion: 2 },
    });
  });

  it('should mark consent with old policy version as invalid', async () => {
    // Manually create consent with old version
    await repository.save({
      id: 'cns_old_version',
      contactId: '12345',
      phone: '+40721234567',
      consentType: 'data_processing',
      status: 'granted',
      version: 1, // Old version
      grantedAt: new Date().toISOString(),
      withdrawnAt: null,
      expiresAt: null,
      source: createTestConsentSource(),
      ipAddress: null,
      userAgent: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const isValid = await service.hasValidConsent('12345', 'data_processing');

    expect(isValid).toBe(false);
  });

  it('should accept consent with current policy version', async () => {
    const consent = await service.recordConsent(createTestConsentRequest());

    expect(consent.version).toBe(2);

    const isValid = await service.hasValidConsent('12345', 'data_processing');

    expect(isValid).toBe(true);
  });

  it('should use default policy version when not configured', async () => {
    const defaultService = createConsentService({ repository: new InMemoryConsentRepository() });

    const consent = await defaultService.recordConsent(createTestConsentRequest());

    expect(consent.version).toBe(1);
  });
});

// ============================================================================
// GDPR DATA ERASURE TESTS
// ============================================================================

describe('ConsentService - GDPR Data Erasure', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
    service = createConsentService({ repository });
  });

  it('should erase all consent data for a contact', async () => {
    await service.recordConsent(createTestConsentRequest());
    await service.recordConsent(
      createTestConsentRequest({ consentType: 'marketing_whatsapp' })
    );

    await service.eraseConsentData('12345', 'admin-user', 'GDPR erasure request');

    const consents = await service.getConsentsForContact('12345');

    expect(consents).toHaveLength(0);
  });

  it('should create audit entries before erasure', async () => {
    const consent = await service.recordConsent(createTestConsentRequest());
    const consentId = consent.id;

    await service.eraseConsentData('12345', 'admin-user', 'Patient request');

    // Audit trail should be retained for compliance (contains creation + erasure entry)
    const trail = await service.getAuditTrail(consentId);

    // Should have at least 2 entries: creation and erasure
    expect(trail.length).toBeGreaterThanOrEqual(2);
    const erasureEntry = trail.find((e) => e.reason?.includes('GDPR erasure'));
    expect(erasureEntry).toBeDefined();
  });

  it('should handle erasure of contact with no consents', async () => {
    await expect(
      service.eraseConsentData('nonexistent', 'admin-user', 'Test erasure')
    ).resolves.not.toThrow();
  });

  it('should erase multiple consent types for same contact', async () => {
    const consentTypes: ConsentType[] = [
      'data_processing',
      'marketing_whatsapp',
      'marketing_email',
      'marketing_sms',
      'appointment_reminders',
    ];

    for (const consentType of consentTypes) {
      await service.recordConsent(createTestConsentRequest({ consentType }));
    }

    await service.eraseConsentData('12345', 'admin-user', 'Full erasure');

    const remaining = await service.getConsentsForContact('12345');

    expect(remaining).toHaveLength(0);
  });
});

// ============================================================================
// AUDIT TRAIL COMPLETENESS TESTS
// ============================================================================

describe('ConsentService - Audit Trail Completeness', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
    service = createConsentService({ repository });
  });

  it('should track complete lifecycle in audit trail', async () => {
    // Create
    const consent = await service.recordConsent(createTestConsentRequest());

    // Update
    await service.recordConsent(
      createTestConsentRequest({
        status: 'denied',
      })
    );

    // Withdraw
    await service.withdrawConsent('12345', 'data_processing', 'Patient changed mind');

    const trail = await service.getAuditTrail(consent.id);

    expect(trail.length).toBeGreaterThanOrEqual(3);
    expect(trail.some((e) => e.action === 'created')).toBe(true);
    expect(trail.some((e) => e.action === 'updated')).toBe(true);
    expect(trail.some((e) => e.action === 'withdrawn')).toBe(true);
  });

  it('should include IP address in audit entries when available', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({
        ipAddress: '203.0.113.1',
      })
    );

    const trail = await service.getAuditTrail(consent.id);

    expect(trail[0]?.ipAddress).toBe('203.0.113.1');
  });

  it('should track who performed each action', async () => {
    const consent = await service.recordConsent(createTestConsentRequest());

    await service.withdrawConsent('12345', 'data_processing', 'Revoked', 'patient');

    const trail = await service.getAuditTrail(consent.id);

    expect(trail[0]?.performedBy).toBe('system'); // Creation
    expect(trail[1]?.performedBy).toBe('patient'); // Withdrawal
  });

  it('should track status transitions in audit entries', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({ status: 'granted' })
    );

    await service.withdrawConsent('12345', 'data_processing');

    const trail = await service.getAuditTrail(consent.id);
    const withdrawalEntry = trail.find((e) => e.action === 'withdrawn');

    expect(withdrawalEntry?.previousStatus).toBe('granted');
    expect(withdrawalEntry?.newStatus).toBe('withdrawn');
  });

  it('should get contact-level audit trail', async () => {
    await service.recordConsent(createTestConsentRequest());
    await service.recordConsent(
      createTestConsentRequest({ consentType: 'marketing_whatsapp' })
    );

    const trail = await service.getContactAuditTrail('12345');

    expect(trail.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// SOURCE CHANNEL AND EVIDENCE TESTS
// ============================================================================

describe('ConsentService - Source Channel & Evidence', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
    service = createConsentService({ repository });
  });

  it('should record consent from different channels', async () => {
    const channels: ConsentSource['channel'][] = ['whatsapp', 'web', 'phone', 'in_person', 'email'];

    for (const channel of channels) {
      const consent = await service.recordConsent(
        createTestConsentRequest({
          consentType: `${channel}_consent` as ConsentType,
          source: createTestConsentSource({ channel }),
        })
      );

      expect(consent.source.channel).toBe(channel);
    }
  });

  it('should record explicit consent method', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({
        source: createTestConsentSource({ method: 'explicit' }),
      })
    );

    expect(consent.source.method).toBe('explicit');
  });

  it('should record double opt-in consent', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({
        source: createTestConsentSource({ method: 'double_opt_in' }),
      })
    );

    expect(consent.source.method).toBe('double_opt_in');
  });

  it('should store evidence URL for consent', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({
        source: createTestConsentSource({
          evidenceUrl: 'https://storage.example.com/consent-recording-12345.mp3',
        }),
      })
    );

    expect(consent.source.evidenceUrl).toBe(
      'https://storage.example.com/consent-recording-12345.mp3'
    );
  });

  it('should record witnessed consent for in-person', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({
        source: createTestConsentSource({
          channel: 'in_person',
          witnessedBy: 'Staff Member: Dr. Smith',
        }),
      })
    );

    expect(consent.source.witnessedBy).toBe('Staff Member: Dr. Smith');
  });
});

// ============================================================================
// MULTI-CONSENT TYPE TESTS
// ============================================================================

describe('ConsentService - Multi-Consent Types', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
    service = createConsentService({ repository });
  });

  it('should manage different consent types independently', async () => {
    await service.recordConsent(
      createTestConsentRequest({
        consentType: 'data_processing',
        status: 'granted',
      })
    );

    await service.recordConsent(
      createTestConsentRequest({
        consentType: 'marketing_whatsapp',
        status: 'denied',
      })
    );

    const hasDataProcessing = await service.hasValidConsent('12345', 'data_processing');
    const hasMarketing = await service.hasValidConsent('12345', 'marketing_whatsapp');

    expect(hasDataProcessing).toBe(true);
    expect(hasMarketing).toBe(false);
  });

  it('should track all consent types for a contact', async () => {
    const consentTypes: ConsentType[] = [
      'data_processing',
      'marketing_whatsapp',
      'marketing_email',
      'appointment_reminders',
    ];

    for (const type of consentTypes) {
      await service.recordConsent(
        createTestConsentRequest({
          consentType: type,
          status: 'granted',
        })
      );
    }

    const consents = await service.getConsentsForContact('12345');

    expect(consents).toHaveLength(4);
    expect(new Set(consents.map((c) => c.consentType)).size).toBe(4);
  });

  it('should identify missing required consents', async () => {
    // Only grant some consents
    await service.recordConsent(
      createTestConsentRequest({
        consentType: 'marketing_whatsapp',
        status: 'granted',
      })
    );

    const result = await service.hasRequiredConsents('12345');

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('data_processing');
  });
});

// ============================================================================
// LOGGER INTEGRATION TESTS
// ============================================================================

describe('ConsentService - Logger Integration', () => {
  it('should use provided logger', async () => {
    const mockLogger: ConsentLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };

    const repository = new InMemoryConsentRepository();
    const service = createConsentService({ repository, logger: mockLogger });

    await service.recordConsent(createTestConsentRequest());

    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should work without logger (no-op logger)', async () => {
    const repository = new InMemoryConsentRepository();
    const service = createConsentService({ repository });

    await expect(service.recordConsent(createTestConsentRequest())).resolves.not.toThrow();
  });

  it('should log consent withdrawal', async () => {
    const mockLogger: ConsentLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };

    const repository = new InMemoryConsentRepository();
    const service = createConsentService({ repository, logger: mockLogger });

    await service.recordConsent(createTestConsentRequest());
    await service.withdrawConsent('12345', 'data_processing', 'Patient request');

    const logCalls = vi.mocked(mockLogger.info).mock.calls;
    const withdrawalLog = logCalls.find((call) => call[1] === 'Consent withdrawn');

    expect(withdrawalLog).toBeDefined();
  });

  it('should log data erasure', async () => {
    const mockLogger: ConsentLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };

    const repository = new InMemoryConsentRepository();
    const service = createConsentService({ repository, logger: mockLogger });

    await service.recordConsent(createTestConsentRequest());
    await service.eraseConsentData('12345', 'admin', 'GDPR request');

    const logCalls = vi.mocked(mockLogger.info).mock.calls;
    const erasureLog = logCalls.find((call) => call[1] === 'Consent data erased');

    expect(erasureLog).toBeDefined();
  });
});

// ============================================================================
// PERSISTENT CONSENT SERVICE FACTORY TESTS
// ============================================================================

describe('ConsentService - Factory Functions', () => {
  it('should create service with createConsentService', () => {
    const repository = new InMemoryConsentRepository();
    const service = createConsentService({ repository });

    expect(service).toBeInstanceOf(ConsentService);
  });

  it('should create service with createPersistentConsentService', () => {
    const repository = new InMemoryConsentRepository();
    const service = createPersistentConsentService(repository);

    expect(service).toBeInstanceOf(ConsentService);
  });

  it('should pass config to persistent service factory', () => {
    const repository = new InMemoryConsentRepository();
    const service = createPersistentConsentService(repository, {
      config: { currentPolicyVersion: 3 },
    });

    expect(service).toBeDefined();
  });

  it('should default to production mode in persistent service', async () => {
    const repository = new InMemoryConsentRepository();
    const service = createPersistentConsentService(repository);

    // Service should work normally
    await expect(service.recordConsent(createTestConsentRequest())).resolves.toBeDefined();
  });
});

// ============================================================================
// RACE CONDITION / CONCURRENCY TESTS
// ============================================================================

describe('ConsentService - Race Condition Handling', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
    service = createConsentService({ repository });
  });

  it('should handle concurrent consent recordings', async () => {
    const requests = Array.from({ length: 5 }, (_, i) =>
      service.recordConsent(
        createTestConsentRequest({
          metadata: { attempt: i },
        })
      )
    );

    const results = await Promise.all(requests);

    // All should succeed and point to same consent ID
    const uniqueIds = new Set(results.map((r) => r.id));
    expect(uniqueIds.size).toBe(1); // Should use same ID (upsert behavior)
  });

  it('should handle concurrent withdrawals idempotently', async () => {
    await service.recordConsent(createTestConsentRequest());

    const withdrawals = Array.from({ length: 3 }, () =>
      service.withdrawConsent('12345', 'data_processing', 'Test')
    );

    // All should succeed idempotently (withdrawing already withdrawn consent is safe)
    const results = await Promise.all(withdrawals);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'withdrawn')).toBe(true);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('ConsentService - Edge Cases', () => {
  let service: ConsentService;
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
    service = createConsentService({ repository });
  });

  it('should handle very long metadata', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({
        metadata: {
          longField: 'x'.repeat(1000),
          nested: {
            deep: {
              value: 'test',
            },
          },
        },
      })
    );

    expect(consent.metadata.longField).toBeDefined();
  });

  it('should handle special characters in phone numbers', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({
        phone: '+40-721-234-567', // With dashes
      })
    );

    expect(consent.phone).toBe('+40-721-234-567');
  });

  it('should generate unique IDs for different consents', async () => {
    const consent1 = await service.recordConsent(createTestConsentRequest());
    const consent2 = await service.recordConsent(
      createTestConsentRequest({
        contactId: 'different-contact',
      })
    );

    expect(consent1.id).not.toBe(consent2.id);
  });

  it('should handle empty metadata', async () => {
    const consent = await service.recordConsent(
      createTestConsentRequest({
        metadata: {},
      })
    );

    expect(consent.metadata).toEqual({});
  });

  it('should preserve metadata through updates', async () => {
    await service.recordConsent(
      createTestConsentRequest({
        metadata: { original: 'value' },
      })
    );

    const updated = await service.recordConsent(
      createTestConsentRequest({
        status: 'denied',
        metadata: { updated: 'newValue' },
      })
    );

    expect(updated.metadata.updated).toBe('newValue');
  });
});

// ============================================================================
// CONFIGURATION TESTS
// ============================================================================

describe('ConsentService - Configuration', () => {
  it('should use custom expiration days from config', async () => {
    const repository = new InMemoryConsentRepository();
    const service = createConsentService({
      repository,
      config: { defaultExpirationDays: 180 },
    });

    const consent = await service.recordConsent(
      createTestConsentRequest({ status: 'granted' })
    );

    const expiresAt = new Date(consent.expiresAt!);
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + 180);

    // Allow 1 second tolerance
    expect(Math.abs(expiresAt.getTime() - expectedDate.getTime())).toBeLessThan(2000);
  });

  it('should use custom required consent types', async () => {
    const repository = new InMemoryConsentRepository();
    const service = createConsentService({
      repository,
      config: {
        requiredForProcessing: ['data_processing', 'marketing_whatsapp'],
      },
    });

    await service.recordConsent(
      createTestConsentRequest({
        consentType: 'data_processing',
        status: 'granted',
      })
    );

    const result = await service.hasRequiredConsents('12345');

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('marketing_whatsapp');
  });

  it('should override default policy version', async () => {
    const repository = new InMemoryConsentRepository();
    const service = createConsentService({
      repository,
      config: { currentPolicyVersion: 5 },
    });

    const consent = await service.recordConsent(createTestConsentRequest());

    expect(consent.version).toBe(5);
  });
});
