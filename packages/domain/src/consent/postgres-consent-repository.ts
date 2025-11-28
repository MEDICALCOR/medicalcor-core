/**
 * PostgreSQL Consent Repository - Production-Grade Implementation
 *
 * Persistent storage for GDPR consent records with:
 * - UPSERT semantics for idempotent operations
 * - Parameterized queries for SQL injection prevention
 * - Proper date/timestamp handling
 * - JSONB metadata storage
 *
 * IMPORTANT: Run the migration SQL below before using this repository:
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS consents (
 *   id VARCHAR(50) PRIMARY KEY,
 *   contact_id VARCHAR(100) NOT NULL,
 *   phone VARCHAR(20) NOT NULL,
 *   consent_type VARCHAR(50) NOT NULL,
 *   status VARCHAR(20) NOT NULL,
 *   version INTEGER NOT NULL DEFAULT 1,
 *   granted_at TIMESTAMP WITH TIME ZONE,
 *   withdrawn_at TIMESTAMP WITH TIME ZONE,
 *   expires_at TIMESTAMP WITH TIME ZONE,
 *   source_channel VARCHAR(20) NOT NULL,
 *   source_method VARCHAR(20) NOT NULL,
 *   evidence_url TEXT,
 *   witnessed_by VARCHAR(100),
 *   ip_address VARCHAR(45),
 *   user_agent TEXT,
 *   metadata JSONB DEFAULT '{}',
 *   created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
 *   updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
 *   UNIQUE(contact_id, consent_type)
 * );
 *
 * CREATE INDEX idx_consents_contact_id ON consents(contact_id);
 * CREATE INDEX idx_consents_status ON consents(status);
 * CREATE INDEX idx_consents_expires_at ON consents(expires_at) WHERE status = 'granted';
 *
 * CREATE TABLE IF NOT EXISTS consent_audit_log (
 *   id VARCHAR(50) PRIMARY KEY,
 *   consent_id VARCHAR(50) NOT NULL REFERENCES consents(id) ON DELETE CASCADE,
 *   action VARCHAR(20) NOT NULL,
 *   previous_status VARCHAR(20),
 *   new_status VARCHAR(20) NOT NULL,
 *   performed_by VARCHAR(100) NOT NULL,
 *   reason TEXT,
 *   ip_address VARCHAR(45),
 *   metadata JSONB DEFAULT '{}',
 *   timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_consent_audit_consent_id ON consent_audit_log(consent_id);
 * ```
 *
 * @module domain/consent
 */

import type {
  ConsentType,
  ConsentStatus,
  ConsentChannel,
  ConsentMethod,
  AuditAction,
} from '../types.js';
import type { ConsentRepository } from './consent-repository.js';
import type { ConsentRecord, ConsentAuditEntry, ConsentSource } from './consent-service.js';

// ============================================================================
// DATABASE INTERFACES
// ============================================================================

/**
 * Database client interface - compatible with pg.Pool and pg.Client
 */
export interface DatabaseClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Database row type for consents table
 */
interface ConsentRow {
  readonly id: string;
  readonly contact_id: string;
  readonly phone: string;
  readonly consent_type: string;
  readonly status: string;
  readonly version: number;
  readonly granted_at: Date | null;
  readonly withdrawn_at: Date | null;
  readonly expires_at: Date | null;
  readonly source_channel: string;
  readonly source_method: string;
  readonly evidence_url: string | null;
  readonly witnessed_by: string | null;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly metadata: Record<string, unknown> | string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Database row type for consent_audit_log table
 */
interface AuditRow {
  readonly id: string;
  readonly consent_id: string;
  readonly action: string;
  readonly previous_status: string | null;
  readonly new_status: string;
  readonly performed_by: string;
  readonly reason: string | null;
  readonly ip_address: string | null;
  readonly metadata: Record<string, unknown> | string;
  readonly timestamp: Date;
}

// ============================================================================
// SQL QUERIES - Parameterized for safety
// ============================================================================

const SQL = {
  UPSERT_CONSENT: `
    INSERT INTO consents (
      id, contact_id, phone, consent_type, status, version,
      granted_at, withdrawn_at, expires_at,
      source_channel, source_method, evidence_url, witnessed_by,
      ip_address, user_agent, metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT (contact_id, consent_type) DO UPDATE SET
      status = $5,
      version = $6,
      granted_at = $7,
      withdrawn_at = $8,
      expires_at = $9,
      source_channel = $10,
      source_method = $11,
      evidence_url = $12,
      witnessed_by = $13,
      ip_address = $14,
      user_agent = $15,
      metadata = $16,
      updated_at = $18
    RETURNING *
  `,

  FIND_BY_CONTACT_AND_TYPE: `
    SELECT * FROM consents
    WHERE contact_id = $1 AND consent_type = $2
  `,

  FIND_BY_CONTACT: `
    SELECT * FROM consents
    WHERE contact_id = $1
    ORDER BY created_at DESC
  `,

  DELETE_BY_ID: `
    DELETE FROM consents WHERE id = $1
  `,

  DELETE_BY_CONTACT: `
    WITH deleted AS (
      DELETE FROM consents
      WHERE contact_id = $1
      RETURNING *
    )
    SELECT COUNT(*) as count FROM deleted
  `,

  FIND_EXPIRING_SOON: `
    SELECT * FROM consents
    WHERE status = 'granted'
      AND expires_at IS NOT NULL
      AND expires_at <= NOW() + INTERVAL '1 day' * $1
    ORDER BY expires_at ASC
  `,

  FIND_BY_STATUS: `
    SELECT * FROM consents
    WHERE status = $1
    ORDER BY updated_at DESC
  `,

  INSERT_AUDIT: `
    INSERT INTO consent_audit_log (
      id, consent_id, action, previous_status, new_status,
      performed_by, reason, ip_address, metadata, timestamp
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `,

  GET_AUDIT_TRAIL: `
    SELECT * FROM consent_audit_log
    WHERE consent_id = $1
    ORDER BY timestamp DESC
  `,

  GET_CONTACT_AUDIT_TRAIL: `
    SELECT cal.* FROM consent_audit_log cal
    JOIN consents c ON cal.consent_id = c.id
    WHERE c.contact_id = $1
    ORDER BY cal.timestamp DESC
  `,
} as const;

// ============================================================================
// POSTGRES CONSENT REPOSITORY
// ============================================================================

/**
 * PostgresConsentRepository - Production-grade consent storage
 *
 * @example
 * ```typescript
 * import { createDatabaseClient } from '@medicalcor/core';
 * import { PostgresConsentRepository, ConsentService } from '@medicalcor/domain';
 *
 * const db = createDatabaseClient();
 * const repository = new PostgresConsentRepository(db);
 * const service = new ConsentService({ repository });
 * ```
 */
export class PostgresConsentRepository implements ConsentRepository {
  constructor(private readonly db: DatabaseClient) {}

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  async save(consent: ConsentRecord): Promise<ConsentRecord> {
    const params = [
      consent.id,
      consent.contactId,
      consent.phone,
      consent.consentType,
      consent.status,
      consent.version,
      consent.grantedAt,
      consent.withdrawnAt,
      consent.expiresAt,
      consent.source.channel,
      consent.source.method,
      consent.source.evidenceUrl,
      consent.source.witnessedBy,
      consent.ipAddress,
      consent.userAgent,
      JSON.stringify(consent.metadata),
      consent.createdAt,
      consent.updatedAt,
    ];

    const result = await this.db.query(SQL.UPSERT_CONSENT, params);
    const row = result.rows[0] as ConsentRow | undefined;

    if (!row) {
      throw new Error('Failed to save consent: no row returned');
    }

    return this.rowToConsent(row);
  }

  async findByContactAndType(
    contactId: string,
    consentType: ConsentType
  ): Promise<ConsentRecord | null> {
    const result = await this.db.query(SQL.FIND_BY_CONTACT_AND_TYPE, [contactId, consentType]);
    const row = result.rows[0] as ConsentRow | undefined;
    return row ? this.rowToConsent(row) : null;
  }

  async findByContact(contactId: string): Promise<ConsentRecord[]> {
    const result = await this.db.query(SQL.FIND_BY_CONTACT, [contactId]);
    return (result.rows as unknown as ConsentRow[]).map((row) => this.rowToConsent(row));
  }

  // ==========================================================================
  // GDPR Erasure Operations
  // ==========================================================================

  async delete(consentId: string): Promise<void> {
    await this.db.query(SQL.DELETE_BY_ID, [consentId]);
  }

  async deleteByContact(contactId: string): Promise<number> {
    const result = await this.db.query(SQL.DELETE_BY_CONTACT, [contactId]);
    const row = result.rows[0] as { count: string } | undefined;
    return parseInt(row?.count ?? '0', 10);
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  async findExpiringSoon(withinDays: number): Promise<ConsentRecord[]> {
    const result = await this.db.query(SQL.FIND_EXPIRING_SOON, [withinDays]);
    return (result.rows as unknown as ConsentRow[]).map((row) => this.rowToConsent(row));
  }

  async findByStatus(status: ConsentStatus): Promise<ConsentRecord[]> {
    const result = await this.db.query(SQL.FIND_BY_STATUS, [status]);
    return (result.rows as unknown as ConsentRow[]).map((row) => this.rowToConsent(row));
  }

  // ==========================================================================
  // Audit Operations
  // ==========================================================================

  async appendAuditEntry(entry: ConsentAuditEntry): Promise<void> {
    const params = [
      entry.id,
      entry.consentId,
      entry.action,
      entry.previousStatus,
      entry.newStatus,
      entry.performedBy,
      entry.reason,
      entry.ipAddress,
      JSON.stringify(entry.metadata),
      entry.timestamp,
    ];

    await this.db.query(SQL.INSERT_AUDIT, params);
  }

  async getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]> {
    const result = await this.db.query(SQL.GET_AUDIT_TRAIL, [consentId]);
    return (result.rows as unknown as AuditRow[]).map((row) => this.rowToAuditEntry(row));
  }

  async getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]> {
    const result = await this.db.query(SQL.GET_CONTACT_AUDIT_TRAIL, [contactId]);
    return (result.rows as unknown as AuditRow[]).map((row) => this.rowToAuditEntry(row));
  }

  // ==========================================================================
  // Row Mappers - Convert database rows to domain objects
  // ==========================================================================

  /**
   * Convert database row to ConsentRecord
   */
  private rowToConsent(row: ConsentRow): ConsentRecord {
    const source: ConsentSource = {
      channel: row.source_channel as ConsentChannel,
      method: row.source_method as ConsentMethod,
      evidenceUrl: row.evidence_url,
      witnessedBy: row.witnessed_by,
    };

    const metadata =
      typeof row.metadata === 'string'
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : row.metadata;

    return Object.freeze({
      id: row.id,
      contactId: row.contact_id,
      phone: row.phone,
      consentType: row.consent_type as ConsentType,
      status: row.status as ConsentStatus,
      version: row.version,
      grantedAt: row.granted_at?.toISOString() ?? null,
      withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
      expiresAt: row.expires_at?.toISOString() ?? null,
      source: Object.freeze(source),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      metadata: Object.freeze(metadata),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    });
  }

  /**
   * Convert database row to ConsentAuditEntry
   */
  private rowToAuditEntry(row: AuditRow): ConsentAuditEntry {
    const metadata =
      typeof row.metadata === 'string'
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : row.metadata;

    return Object.freeze({
      id: row.id,
      consentId: row.consent_id,
      action: row.action as AuditAction,
      previousStatus: row.previous_status as ConsentStatus | null,
      newStatus: row.new_status as ConsentStatus,
      performedBy: row.performed_by,
      reason: row.reason,
      ipAddress: row.ip_address,
      timestamp: row.timestamp.toISOString(),
      metadata: Object.freeze(metadata),
    });
  }
}
