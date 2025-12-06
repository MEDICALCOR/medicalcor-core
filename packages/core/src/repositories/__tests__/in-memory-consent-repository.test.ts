/**
 * @fileoverview In-Memory Consent Repository Tests
 *
 * Tests for the in-memory consent repository implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryConsentRepository,
  createInMemoryConsentRepository,
} from '../InMemoryConsentRepository.js';
import type {
  ConsentRecord,
  ConsentAuditEntry,
  ConsentType,
} from '../PostgresConsentRepository.js';

// ============================================================================
// HELPERS
// ============================================================================

function createTestConsent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    id: 'consent-123',
    contactId: 'contact-456',
    phone: '+40721234567',
    consentType: 'data_processing',
    status: 'granted',
    version: 1,
    grantedAt: '2025-01-01T10:00:00Z',
    withdrawnAt: null,
    expiresAt: '2026-01-01T10:00:00Z',
    source: {
      channel: 'whatsapp',
      method: 'explicit',
      evidenceUrl: null,
      witnessedBy: null,
    },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    metadata: {},
    createdAt: '2025-01-01T10:00:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
    ...overrides,
  };
}

function createTestAuditEntry(overrides: Partial<ConsentAuditEntry> = {}): ConsentAuditEntry {
  return {
    id: 'audit-123',
    consentId: 'consent-123',
    action: 'created',
    previousStatus: null,
    newStatus: 'granted',
    performedBy: 'system',
    reason: null,
    ipAddress: '192.168.1.1',
    timestamp: '2025-01-01T10:00:00Z',
    metadata: {},
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('InMemoryConsentRepository', () => {
  let repository: InMemoryConsentRepository;

  beforeEach(() => {
    repository = new InMemoryConsentRepository();
  });

  describe('Constructor', () => {
    it('should create an empty repository', () => {
      expect(repository.size()).toBe(0);
    });
  });

  describe('save', () => {
    it('should save a consent record', async () => {
      const consent = createTestConsent();

      const saved = await repository.save(consent);

      expect(saved).toEqual(consent);
      expect(repository.size()).toBe(1);
    });

    it('should overwrite existing consent for same contact and type', async () => {
      const consent1 = createTestConsent({ version: 1 });
      const consent2 = createTestConsent({ version: 2 });

      await repository.save(consent1);
      await repository.save(consent2);

      expect(repository.size()).toBe(1);
      const found = await repository.findByContactAndType('contact-456', 'data_processing');
      expect(found?.version).toBe(2);
    });

    it('should store different consent types separately', async () => {
      const consent1 = createTestConsent({ consentType: 'data_processing' });
      const consent2 = createTestConsent({
        id: 'consent-124',
        consentType: 'marketing_whatsapp',
      });

      await repository.save(consent1);
      await repository.save(consent2);

      expect(repository.size()).toBe(2);
    });

    it('should store different contacts separately', async () => {
      const consent1 = createTestConsent({ contactId: 'contact-1' });
      const consent2 = createTestConsent({
        id: 'consent-124',
        contactId: 'contact-2',
      });

      await repository.save(consent1);
      await repository.save(consent2);

      expect(repository.size()).toBe(2);
    });
  });

  describe('upsert', () => {
    it('should create new consent when not exists', async () => {
      const consent = createTestConsent();

      const result = await repository.upsert(consent);

      expect(result.wasCreated).toBe(true);
      expect(result.record).toEqual(consent);
    });

    it('should update existing consent preserving id and createdAt', async () => {
      const original = createTestConsent({
        id: 'original-id',
        createdAt: '2024-01-01T10:00:00Z',
        version: 1,
      });
      await repository.save(original);

      const updated = createTestConsent({
        id: 'new-id',
        createdAt: '2025-01-01T10:00:00Z',
        version: 2,
      });

      const result = await repository.upsert(updated);

      expect(result.wasCreated).toBe(false);
      expect(result.record.id).toBe('original-id');
      expect(result.record.createdAt).toBe('2024-01-01T10:00:00Z');
      expect(result.record.version).toBe(2);
    });
  });

  describe('findByContactAndType', () => {
    it('should find consent by contact and type', async () => {
      const consent = createTestConsent();
      await repository.save(consent);

      const found = await repository.findByContactAndType('contact-456', 'data_processing');

      expect(found).toEqual(consent);
    });

    it('should return null when not found', async () => {
      const found = await repository.findByContactAndType('non-existent', 'data_processing');

      expect(found).toBeNull();
    });

    it('should not find consent with different type', async () => {
      const consent = createTestConsent({ consentType: 'data_processing' });
      await repository.save(consent);

      const found = await repository.findByContactAndType('contact-456', 'marketing_whatsapp');

      expect(found).toBeNull();
    });
  });

  describe('findByContact', () => {
    it('should find all consents for a contact', async () => {
      const consent1 = createTestConsent({
        id: 'consent-1',
        consentType: 'data_processing',
      });
      const consent2 = createTestConsent({
        id: 'consent-2',
        consentType: 'marketing_whatsapp',
      });
      const consent3 = createTestConsent({
        id: 'consent-3',
        contactId: 'other-contact',
        consentType: 'marketing_email',
      });

      await repository.save(consent1);
      await repository.save(consent2);
      await repository.save(consent3);

      const found = await repository.findByContact('contact-456');

      expect(found).toHaveLength(2);
      expect(found.map((c) => c.id).sort()).toEqual(['consent-1', 'consent-2']);
    });

    it('should return empty array when contact has no consents', async () => {
      const found = await repository.findByContact('non-existent');

      expect(found).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete consent by id', async () => {
      const consent = createTestConsent({ id: 'to-delete' });
      await repository.save(consent);

      await repository.delete('to-delete');

      const found = await repository.findByContactAndType('contact-456', 'data_processing');
      expect(found).toBeNull();
      expect(repository.size()).toBe(0);
    });

    it('should not throw when deleting non-existent consent', async () => {
      await expect(repository.delete('non-existent')).resolves.toBeUndefined();
    });

    it('should only delete specific consent', async () => {
      const consent1 = createTestConsent({ id: 'keep', consentType: 'data_processing' });
      const consent2 = createTestConsent({
        id: 'delete',
        consentType: 'marketing_whatsapp',
      });

      await repository.save(consent1);
      await repository.save(consent2);

      await repository.delete('delete');

      expect(repository.size()).toBe(1);
      const remaining = await repository.findByContact('contact-456');
      expect(remaining[0]?.id).toBe('keep');
    });
  });

  describe('deleteByContact', () => {
    it('should delete all consents for a contact', async () => {
      const consent1 = createTestConsent({
        id: 'consent-1',
        consentType: 'data_processing',
      });
      const consent2 = createTestConsent({
        id: 'consent-2',
        consentType: 'marketing_whatsapp',
      });

      await repository.save(consent1);
      await repository.save(consent2);

      const deletedCount = await repository.deleteByContact('contact-456');

      expect(deletedCount).toBe(2);
      expect(repository.size()).toBe(0);
    });

    it('should return 0 when no consents found', async () => {
      const deletedCount = await repository.deleteByContact('non-existent');

      expect(deletedCount).toBe(0);
    });

    it('should not delete other contacts consents', async () => {
      const consent1 = createTestConsent({ contactId: 'contact-1' });
      const consent2 = createTestConsent({
        id: 'consent-2',
        contactId: 'contact-2',
        consentType: 'marketing_whatsapp',
      });

      await repository.save(consent1);
      await repository.save(consent2);

      await repository.deleteByContact('contact-1');

      expect(repository.size()).toBe(1);
    });
  });

  describe('findExpiringSoon', () => {
    it('should find consents expiring within specified days', async () => {
      const now = new Date();
      const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const in10Days = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

      const expiringConsent = createTestConsent({
        id: 'expiring',
        status: 'granted',
        expiresAt: in3Days.toISOString(),
      });
      const notExpiringConsent = createTestConsent({
        id: 'not-expiring',
        status: 'granted',
        expiresAt: in10Days.toISOString(),
        contactId: 'contact-2',
        consentType: 'marketing_email',
      });

      await repository.save(expiringConsent);
      await repository.save(notExpiringConsent);

      const expiring = await repository.findExpiringSoon(5);

      expect(expiring).toHaveLength(1);
      expect(expiring[0]?.id).toBe('expiring');
    });

    it('should not include non-granted consents', async () => {
      const now = new Date();
      const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const withdrawnConsent = createTestConsent({
        status: 'withdrawn',
        expiresAt: in3Days.toISOString(),
      });

      await repository.save(withdrawnConsent);

      const expiring = await repository.findExpiringSoon(5);

      expect(expiring).toHaveLength(0);
    });

    it('should not include consents without expiration date', async () => {
      const consent = createTestConsent({
        status: 'granted',
        expiresAt: null,
      });

      await repository.save(consent);

      const expiring = await repository.findExpiringSoon(30);

      expect(expiring).toHaveLength(0);
    });
  });

  describe('findByStatus', () => {
    it('should find all consents with given status', async () => {
      const granted1 = createTestConsent({
        id: 'granted-1',
        status: 'granted',
        consentType: 'data_processing',
      });
      const granted2 = createTestConsent({
        id: 'granted-2',
        status: 'granted',
        consentType: 'marketing_whatsapp',
      });
      const withdrawn = createTestConsent({
        id: 'withdrawn-1',
        status: 'withdrawn',
        consentType: 'marketing_email',
      });

      await repository.save(granted1);
      await repository.save(granted2);
      await repository.save(withdrawn);

      const grantedConsents = await repository.findByStatus('granted');

      expect(grantedConsents).toHaveLength(2);
      expect(grantedConsents.every((c) => c.status === 'granted')).toBe(true);
    });

    it('should return empty array when no consents match status', async () => {
      const consent = createTestConsent({ status: 'granted' });
      await repository.save(consent);

      const denied = await repository.findByStatus('denied');

      expect(denied).toHaveLength(0);
    });
  });

  describe('appendAuditEntry', () => {
    it('should append audit entry', async () => {
      const entry = createTestAuditEntry();

      await repository.appendAuditEntry(entry);

      const trail = await repository.getAuditTrail('consent-123');
      expect(trail).toHaveLength(1);
      expect(trail[0]).toEqual(entry);
    });

    it('should append multiple audit entries', async () => {
      const entry1 = createTestAuditEntry({ id: 'audit-1', action: 'created' });
      const entry2 = createTestAuditEntry({ id: 'audit-2', action: 'updated' });
      const entry3 = createTestAuditEntry({ id: 'audit-3', action: 'withdrawn' });

      await repository.appendAuditEntry(entry1);
      await repository.appendAuditEntry(entry2);
      await repository.appendAuditEntry(entry3);

      const trail = await repository.getAuditTrail('consent-123');
      expect(trail).toHaveLength(3);
    });
  });

  describe('getAuditTrail', () => {
    it('should return audit entries for specific consent', async () => {
      const entry1 = createTestAuditEntry({ id: 'audit-1', consentId: 'consent-1' });
      const entry2 = createTestAuditEntry({ id: 'audit-2', consentId: 'consent-2' });
      const entry3 = createTestAuditEntry({ id: 'audit-3', consentId: 'consent-1' });

      await repository.appendAuditEntry(entry1);
      await repository.appendAuditEntry(entry2);
      await repository.appendAuditEntry(entry3);

      const trail = await repository.getAuditTrail('consent-1');

      expect(trail).toHaveLength(2);
      expect(trail.every((e) => e.consentId === 'consent-1')).toBe(true);
    });

    it('should return empty array when no audit entries exist', async () => {
      const trail = await repository.getAuditTrail('non-existent');

      expect(trail).toEqual([]);
    });
  });

  describe('getContactAuditTrail', () => {
    it('should return all audit entries for a contacts consents', async () => {
      // Create consents for the contact
      const consent1 = createTestConsent({
        id: 'consent-1',
        consentType: 'data_processing',
      });
      const consent2 = createTestConsent({
        id: 'consent-2',
        consentType: 'marketing_whatsapp',
      });

      await repository.save(consent1);
      await repository.save(consent2);

      // Create audit entries
      const entry1 = createTestAuditEntry({ id: 'audit-1', consentId: 'consent-1' });
      const entry2 = createTestAuditEntry({ id: 'audit-2', consentId: 'consent-2' });
      const entry3 = createTestAuditEntry({ id: 'audit-3', consentId: 'other-consent' });

      await repository.appendAuditEntry(entry1);
      await repository.appendAuditEntry(entry2);
      await repository.appendAuditEntry(entry3);

      const trail = await repository.getContactAuditTrail('contact-456');

      expect(trail).toHaveLength(2);
    });

    it('should return empty array when contact has no consents', async () => {
      const trail = await repository.getContactAuditTrail('non-existent');

      expect(trail).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all consents and audit entries', async () => {
      await repository.save(createTestConsent());
      await repository.appendAuditEntry(createTestAuditEntry());

      repository.clear();

      expect(repository.size()).toBe(0);
      const trail = await repository.getAuditTrail('consent-123');
      expect(trail).toHaveLength(0);
    });
  });

  describe('size', () => {
    it('should return correct count of consents', async () => {
      expect(repository.size()).toBe(0);

      await repository.save(createTestConsent({ id: 'c1', consentType: 'data_processing' }));
      expect(repository.size()).toBe(1);

      await repository.save(createTestConsent({ id: 'c2', consentType: 'marketing_whatsapp' }));
      expect(repository.size()).toBe(2);

      await repository.delete('c1');
      expect(repository.size()).toBe(1);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createInMemoryConsentRepository', () => {
  it('should create a repository instance', () => {
    const repo = createInMemoryConsentRepository();

    expect(repo).toBeInstanceOf(InMemoryConsentRepository);
    expect(repo.size()).toBe(0);
  });
});
