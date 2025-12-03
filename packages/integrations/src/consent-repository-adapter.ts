/**
 * PostgreSQL Consent Repository Adapter (Infrastructure Layer)
 *
 * This adapter implements the ConsentRepository port from the domain layer.
 * It's placed in integrations to avoid circular dependency issues between
 * core and domain packages.
 *
 * @module @medicalcor/integrations/consent-repository-adapter
 */

import type { ConsentRepository } from '@medicalcor/domain';
import type {
  ConsentRecord,
  ConsentAuditEntry,
  ConsentType,
  ConsentStatus,
  ConsentSource,
} from '@medicalcor/domain';
import { createLogger, type Logger } from '@medicalcor/core';

const logger: Logger = createLogger({ name: 'postgres-consent-repository' });

interface DatabaseClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

interface ConsentRow {
  [key: string]: unknown;
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
  [key: string]: unknown;
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

function isConsentRow(row: Record<string, unknown>): row is ConsentRow {
  return (
    typeof row.id === 'string' &&
    typeof row.contact_id === 'string' &&
    typeof row.phone === 'string' &&
    typeof row.consent_type === 'string' &&
    typeof row.status === 'string' &&
    typeof row.version === 'number' &&
    typeof row.source_channel === 'string' &&
    typeof row.source_method === 'string' &&
    row.created_at instanceof Date &&
    row.updated_at instanceof Date
  );
}

function isAuditRow(row: Record<string, unknown>): row is AuditRow {
  return (
    typeof row.id === 'string' &&
    typeof row.consent_id === 'string' &&
    typeof row.action === 'string' &&
    typeof row.new_status === 'string' &&
    typeof row.performed_by === 'string' &&
    row.timestamp instanceof Date
  );
}

function toConsentRows(rows: Record<string, unknown>[]): ConsentRow[] {
  return rows.filter((row): row is ConsentRow => {
    if (!isConsentRow(row)) {
      logger.warn('Invalid row structure detected, skipping row');
      return false;
    }
    return true;
  });
}

function toAuditRows(rows: Record<string, unknown>[]): AuditRow[] {
  return rows.filter((row): row is AuditRow => {
    if (!isAuditRow(row)) {
      logger.warn('Invalid audit row structure detected, skipping row');
      return false;
    }
    return true;
  });
}

/**
 * PostgreSQL implementation of the Consent Repository
 */
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

  async upsert(consent: ConsentRecord): Promise<{ record: ConsentRecord; wasCreated: boolean }> {
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
    const sql = `SELECT * FROM consents WHERE contact_id = $1 AND consent_type = $2`;
    const result = await this.db.query(sql, [contactId, consentType]);
    const row = result.rows[0] as ConsentRow | undefined;
    return row ? this.rowToConsent(row) : null;
  }

  async findByContact(contactId: string): Promise<ConsentRecord[]> {
    const sql = `SELECT * FROM consents WHERE contact_id = $1 ORDER BY created_at DESC`;
    const result = await this.db.query(sql, [contactId]);
    return toConsentRows(result.rows).map((row) => this.rowToConsent(row));
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
    return toConsentRows(result.rows).map((row) => this.rowToConsent(row));
  }

  async findByStatus(status: ConsentStatus): Promise<ConsentRecord[]> {
    const sql = `SELECT * FROM consents WHERE status = $1 ORDER BY updated_at DESC`;
    const result = await this.db.query(sql, [status]);
    return toConsentRows(result.rows).map((row) => this.rowToConsent(row));
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
    return toAuditRows(result.rows).map((row) => this.rowToAuditEntry(row));
  }

  async getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]> {
    const sql = `
      SELECT cal.* FROM consent_audit_log cal
      JOIN consents c ON cal.consent_id = c.id
      WHERE c.contact_id = $1
      ORDER BY cal.timestamp DESC
    `;
    const result = await this.db.query(sql, [contactId]);
    return toAuditRows(result.rows).map((row) => this.rowToAuditEntry(row));
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
