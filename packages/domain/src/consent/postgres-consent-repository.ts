/**
 * PostgreSQL Consent Repository
 * Persistent storage for GDPR consent records
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
 */

import type { ConsentRepository } from './consent-repository.js';
import type {
  ConsentRecord,
  ConsentAuditEntry,
  ConsentType,
  ConsentStatus,
  ConsentSource,
} from './consent-service.js';

interface DatabaseClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export class PostgresConsentRepository implements ConsentRepository {
  constructor(private readonly db: DatabaseClient) {}

  async save(consent: ConsentRecord): Promise<ConsentRecord> {
    const sql = `
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
    `;

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

    const result = await this.db.query(sql, params);
    const row = result.rows[0] as ConsentRow | undefined;
    if (!row) {
      throw new Error('Failed to save consent: no row returned');
    }
    return this.rowToConsent(row);
  }

  /**
   * Atomically upsert a consent record
   * SECURITY FIX: This method uses PostgreSQL's ON CONFLICT to prevent race conditions
   * and returns whether the record was created or updated for correct audit logging
   */
  async upsert(consent: ConsentRecord): Promise<{ record: ConsentRecord; wasCreated: boolean }> {
    // Use xmax system column to determine if row was inserted or updated
    // xmax = 0 means it was an INSERT, otherwise it was an UPDATE
    const sql = `
      INSERT INTO consents (
        id, contact_id, phone, consent_type, status, version,
        granted_at, withdrawn_at, expires_at,
        source_channel, source_method, evidence_url, witnessed_by,
        ip_address, user_agent, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (contact_id, consent_type) DO UPDATE SET
        status = EXCLUDED.status,
        version = EXCLUDED.version,
        granted_at = EXCLUDED.granted_at,
        withdrawn_at = EXCLUDED.withdrawn_at,
        expires_at = EXCLUDED.expires_at,
        source_channel = EXCLUDED.source_channel,
        source_method = EXCLUDED.source_method,
        evidence_url = EXCLUDED.evidence_url,
        witnessed_by = EXCLUDED.witnessed_by,
        ip_address = EXCLUDED.ip_address,
        user_agent = EXCLUDED.user_agent,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at
      RETURNING *, (xmax = 0) AS was_created
    `;

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

    const result = await this.db.query(sql, params);
    const row = result.rows[0] as (ConsentRow & { was_created: boolean }) | undefined;
    if (!row) {
      throw new Error('Failed to upsert consent: no row returned');
    }
    return {
      record: this.rowToConsent(row),
      wasCreated: row.was_created,
    };
  }

  async findByContactAndType(
    contactId: string,
    consentType: ConsentType
  ): Promise<ConsentRecord | null> {
    const sql = `
      SELECT * FROM consents
      WHERE contact_id = $1 AND consent_type = $2
    `;
    const result = await this.db.query(sql, [contactId, consentType]);
    const row = result.rows[0] as ConsentRow | undefined;
    return row ? this.rowToConsent(row) : null;
  }

  async findByContact(contactId: string): Promise<ConsentRecord[]> {
    const sql = `SELECT * FROM consents WHERE contact_id = $1 ORDER BY created_at DESC`;
    const result = await this.db.query(sql, [contactId]);
    return (result.rows as unknown as ConsentRow[]).map((row) => this.rowToConsent(row));
  }

  async delete(consentId: string): Promise<void> {
    await this.db.query(`DELETE FROM consents WHERE id = $1`, [consentId]);
  }

  async deleteByContact(contactId: string): Promise<number> {
    const result = await this.db.query(
      `WITH deleted AS (DELETE FROM consents WHERE contact_id = $1 RETURNING *) SELECT COUNT(*) as count FROM deleted`,
      [contactId]
    );
    const row = result.rows[0] as { count: string } | undefined;
    return parseInt(row?.count ?? '0', 10);
  }

  async findExpiringSoon(withinDays: number): Promise<ConsentRecord[]> {
    const sql = `
      SELECT * FROM consents
      WHERE status = 'granted'
        AND expires_at IS NOT NULL
        AND expires_at <= NOW() + INTERVAL '1 day' * $1
      ORDER BY expires_at ASC
    `;
    const result = await this.db.query(sql, [withinDays]);
    return (result.rows as unknown as ConsentRow[]).map((row) => this.rowToConsent(row));
  }

  async findByStatus(status: ConsentStatus): Promise<ConsentRecord[]> {
    const sql = `SELECT * FROM consents WHERE status = $1 ORDER BY updated_at DESC`;
    const result = await this.db.query(sql, [status]);
    return (result.rows as unknown as ConsentRow[]).map((row) => this.rowToConsent(row));
  }

  async appendAuditEntry(entry: ConsentAuditEntry): Promise<void> {
    const sql = `
      INSERT INTO consent_audit_log (
        id, consent_id, action, previous_status, new_status,
        performed_by, reason, ip_address, metadata, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    await this.db.query(sql, [
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
    ]);
  }

  async getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]> {
    const sql = `
      SELECT * FROM consent_audit_log
      WHERE consent_id = $1
      ORDER BY timestamp DESC
    `;
    const result = await this.db.query(sql, [consentId]);
    return (result.rows as unknown as AuditRow[]).map((row) => this.rowToAuditEntry(row));
  }

  async getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]> {
    const sql = `
      SELECT cal.* FROM consent_audit_log cal
      JOIN consents c ON cal.consent_id = c.id
      WHERE c.contact_id = $1
      ORDER BY cal.timestamp DESC
    `;
    const result = await this.db.query(sql, [contactId]);
    return (result.rows as unknown as AuditRow[]).map((row) => this.rowToAuditEntry(row));
  }

  private rowToConsent(row: ConsentRow): ConsentRecord {
    return {
      id: row.id,
      contactId: row.contact_id,
      phone: row.phone,
      consentType: row.consent_type as ConsentType,
      status: row.status as ConsentStatus,
      version: row.version,
      grantedAt: row.granted_at?.toISOString() ?? null,
      withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
      expiresAt: row.expires_at?.toISOString() ?? null,
      source: {
        channel: row.source_channel,
        method: row.source_method,
        evidenceUrl: row.evidence_url,
        witnessedBy: row.witnessed_by,
      } as ConsentSource,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      metadata:
        typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : row.metadata,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private rowToAuditEntry(row: AuditRow): ConsentAuditEntry {
    return {
      id: row.id,
      consentId: row.consent_id,
      action: row.action as ConsentAuditEntry['action'],
      previousStatus: row.previous_status as ConsentStatus | null,
      newStatus: row.new_status as ConsentStatus,
      performedBy: row.performed_by,
      reason: row.reason,
      ipAddress: row.ip_address,
      timestamp: row.timestamp.toISOString(),
      metadata:
        typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : row.metadata,
    };
  }
}

interface ConsentRow {
  id: string;
  contact_id: string;
  phone: string;
  consent_type: string;
  status: string;
  version: number;
  granted_at: Date | null;
  withdrawn_at: Date | null;
  expires_at: Date | null;
  source_channel: string;
  source_method: string;
  evidence_url: string | null;
  witnessed_by: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | string;
  created_at: Date;
  updated_at: Date;
}

interface AuditRow {
  id: string;
  consent_id: string;
  action: string;
  previous_status: string | null;
  new_status: string;
  performed_by: string;
  reason: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | string;
  timestamp: Date;
}
