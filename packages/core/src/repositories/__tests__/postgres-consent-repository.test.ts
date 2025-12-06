/**
 * @fileoverview PostgreSQL Consent Repository Tests
 *
 * Tests for the PostgreSQL consent repository implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PostgresConsentRepository,
  createPostgresConsentRepository,
  type ConsentDatabaseClient,
  type ConsentRecord,
  type ConsentAuditEntry,
} from '../PostgresConsentRepository.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockClient(): ConsentDatabaseClient {
  return {
    query: vi.fn(),
  };
}

function createTestConsentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'consent-123',
    contact_id: 'contact-456',
    phone: '+40721234567',
    consent_type: 'data_processing',
    status: 'granted',
    version: 1,
    granted_at: new Date('2025-01-01T10:00:00Z'),
    withdrawn_at: null,
    expires_at: new Date('2026-01-01T10:00:00Z'),
    source_channel: 'whatsapp',
    source_method: 'explicit',
    evidence_url: null,
    witnessed_by: null,
    ip_address: '192.168.1.1',
    user_agent: 'Mozilla/5.0',
    metadata: {},
    created_at: new Date('2025-01-01T10:00:00Z'),
    updated_at: new Date('2025-01-01T10:00:00Z'),
    ...overrides,
  };
}

function createTestAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-123',
    consent_id: 'consent-123',
    action: 'created',
    previous_status: null,
    new_status: 'granted',
    performed_by: 'system',
    reason: null,
    ip_address: '192.168.1.1',
    metadata: {},
    timestamp: new Date('2025-01-01T10:00:00Z'),
    ...overrides,
  };
}

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

describe('PostgresConsentRepository', () => {
  let mockClient: ConsentDatabaseClient;
  let repository: PostgresConsentRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    repository = new PostgresConsentRepository(mockClient);
  });

  describe('Constructor', () => {
    it('should create repository with database client', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('save', () => {
    it('should save consent and return saved record', async () => {
      const consent = createTestConsent();
      const row = createTestConsentRow();
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await repository.save(consent);

      expect(result.id).toBe('consent-123');
      expect(result.contactId).toBe('contact-456');
      expect(result.consentType).toBe('data_processing');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO consents'),
        expect.any(Array)
      );
    });

    it('should throw when no row returned', async () => {
      const consent = createTestConsent();
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      await expect(repository.save(consent)).rejects.toThrow('Failed to save consent');
    });

    it('should handle JSON metadata', async () => {
      const consent = createTestConsent({
        metadata: { key: 'value', nested: { a: 1 } },
      });
      const row = createTestConsentRow({ metadata: '{"key":"value","nested":{"a":1}}' });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      await repository.save(consent);

      const queryParams = (mockClient.query as ReturnType<typeof vi.fn>).mock
        .calls[0]![1] as unknown[];
      expect(queryParams[15]).toBe('{"key":"value","nested":{"a":1}}');
    });
  });

  describe('upsert', () => {
    it('should return wasCreated true for new record', async () => {
      const consent = createTestConsent();
      const row = { ...createTestConsentRow(), was_created: true };
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await repository.upsert(consent);

      expect(result.wasCreated).toBe(true);
      expect(result.record.id).toBe('consent-123');
    });

    it('should return wasCreated false for updated record', async () => {
      const consent = createTestConsent();
      const row = { ...createTestConsentRow(), was_created: false };
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await repository.upsert(consent);

      expect(result.wasCreated).toBe(false);
    });

    it('should throw when no row returned', async () => {
      const consent = createTestConsent();
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      await expect(repository.upsert(consent)).rejects.toThrow('Failed to upsert consent');
    });
  });

  describe('findByContactAndType', () => {
    it('should find consent by contact and type', async () => {
      const row = createTestConsentRow();
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await repository.findByContactAndType('contact-456', 'data_processing');

      expect(result).not.toBeNull();
      expect(result?.contactId).toBe('contact-456');
      expect(result?.consentType).toBe('data_processing');
    });

    it('should return null when not found', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const result = await repository.findByContactAndType('non-existent', 'data_processing');

      expect(result).toBeNull();
    });

    it('should call query with correct parameters', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      await repository.findByContactAndType('contact-456', 'marketing_whatsapp');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('contact_id = $1 AND consent_type = $2'),
        ['contact-456', 'marketing_whatsapp']
      );
    });
  });

  describe('findByContact', () => {
    it('should find all consents for a contact', async () => {
      const row1 = createTestConsentRow({ id: 'consent-1', consent_type: 'data_processing' });
      const row2 = createTestConsentRow({ id: 'consent-2', consent_type: 'marketing_whatsapp' });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row1, row2] });

      const results = await repository.findByContact('contact-456');

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('consent-1');
      expect(results[1]?.id).toBe('consent-2');
    });

    it('should return empty array when no consents found', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const results = await repository.findByContact('non-existent');

      expect(results).toEqual([]);
    });

    it('should filter out invalid rows', async () => {
      const validRow = createTestConsentRow();
      const invalidRow = { id: 'invalid' }; // Missing required fields
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [validRow, invalidRow],
      });

      const results = await repository.findByContact('contact-456');

      expect(results).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('should delete consent by id', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      await repository.delete('consent-123');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM consents WHERE id = $1'),
        ['consent-123']
      );
    });
  });

  describe('deleteByContact', () => {
    it('should delete all consents for contact and return count', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ count: '3' }],
      });

      const count = await repository.deleteByContact('contact-456');

      expect(count).toBe(3);
    });

    it('should return 0 when no consents deleted', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });

      const count = await repository.deleteByContact('non-existent');

      expect(count).toBe(0);
    });

    it('should handle missing count gracefully', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const count = await repository.deleteByContact('contact-456');

      expect(count).toBe(0);
    });
  });

  describe('findExpiringSoon', () => {
    it('should find consents expiring within days', async () => {
      const row = createTestConsentRow({ status: 'granted' });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const results = await repository.findExpiringSoon(30);

      expect(results).toHaveLength(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'granted'"),
        [30]
      );
    });

    it('should return empty array when none found', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const results = await repository.findExpiringSoon(7);

      expect(results).toEqual([]);
    });
  });

  describe('findByStatus', () => {
    it('should find all consents with given status', async () => {
      const row1 = createTestConsentRow({ id: 'c1', status: 'granted' });
      const row2 = createTestConsentRow({ id: 'c2', status: 'granted' });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row1, row2] });

      const results = await repository.findByStatus('granted');

      expect(results).toHaveLength(2);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('WHERE status = $1'), [
        'granted',
      ]);
    });
  });

  describe('appendAuditEntry', () => {
    it('should insert audit entry', async () => {
      const entry = createTestAuditEntry();
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      await repository.appendAuditEntry(entry);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO consent_audit_log'),
        [
          entry.id,
          entry.consentId,
          entry.action,
          entry.previousStatus,
          entry.newStatus,
          entry.performedBy,
          entry.reason,
          entry.ipAddress,
          '{}',
          entry.timestamp,
        ]
      );
    });
  });

  describe('getAuditTrail', () => {
    it('should return audit entries for consent', async () => {
      const row1 = createTestAuditRow({ id: 'audit-1' });
      const row2 = createTestAuditRow({ id: 'audit-2', action: 'updated' });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row1, row2] });

      const results = await repository.getAuditTrail('consent-123');

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('audit-1');
      expect(results[1]?.id).toBe('audit-2');
    });

    it('should return empty array when no entries found', async () => {
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [] });

      const results = await repository.getAuditTrail('non-existent');

      expect(results).toEqual([]);
    });

    it('should filter out invalid audit rows', async () => {
      const validRow = createTestAuditRow();
      const invalidRow = { id: 'invalid' }; // Missing required fields
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [validRow, invalidRow],
      });

      const results = await repository.getAuditTrail('consent-123');

      expect(results).toHaveLength(1);
    });
  });

  describe('getContactAuditTrail', () => {
    it('should return all audit entries for contacts consents', async () => {
      const row = createTestAuditRow();
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const results = await repository.getContactAuditTrail('contact-456');

      expect(results).toHaveLength(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN consents c ON cal.consent_id = c.id'),
        ['contact-456']
      );
    });
  });

  describe('Row Mapping', () => {
    it('should correctly map consent row to record', async () => {
      const row = createTestConsentRow({
        granted_at: new Date('2025-01-15T10:00:00Z'),
        withdrawn_at: new Date('2025-06-01T10:00:00Z'),
        expires_at: new Date('2026-01-01T10:00:00Z'),
        metadata: { custom: 'value' },
      });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await repository.findByContactAndType('contact-456', 'data_processing');

      expect(result?.grantedAt).toBe('2025-01-15T10:00:00.000Z');
      expect(result?.withdrawnAt).toBe('2025-06-01T10:00:00.000Z');
      expect(result?.expiresAt).toBe('2026-01-01T10:00:00.000Z');
      expect(result?.source.channel).toBe('whatsapp');
      expect(result?.source.method).toBe('explicit');
    });

    it('should handle null date fields', async () => {
      const row = createTestConsentRow({
        granted_at: null,
        withdrawn_at: null,
        expires_at: null,
      });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await repository.findByContactAndType('contact-456', 'data_processing');

      expect(result?.grantedAt).toBeNull();
      expect(result?.withdrawnAt).toBeNull();
      expect(result?.expiresAt).toBeNull();
    });

    it('should parse JSON string metadata', async () => {
      const row = createTestConsentRow({
        metadata: '{"parsed":"correctly"}',
      });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const result = await repository.findByContactAndType('contact-456', 'data_processing');

      expect(result?.metadata).toEqual({ parsed: 'correctly' });
    });

    it('should correctly map audit row to entry', async () => {
      const row = createTestAuditRow({
        previous_status: 'pending',
        new_status: 'granted',
        metadata: { ip_country: 'RO' },
      });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const results = await repository.getAuditTrail('consent-123');

      expect(results[0]?.previousStatus).toBe('pending');
      expect(results[0]?.newStatus).toBe('granted');
      expect(results[0]?.metadata).toEqual({ ip_country: 'RO' });
    });

    it('should parse JSON string audit metadata', async () => {
      const row = createTestAuditRow({
        metadata: '{"audit":"data"}',
      });
      (mockClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [row] });

      const results = await repository.getAuditTrail('consent-123');

      expect(results[0]?.metadata).toEqual({ audit: 'data' });
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createPostgresConsentRepository', () => {
  it('should create a repository instance', () => {
    const mockClient = createMockClient();

    const repo = createPostgresConsentRepository(mockClient);

    expect(repo).toBeInstanceOf(PostgresConsentRepository);
  });
});
