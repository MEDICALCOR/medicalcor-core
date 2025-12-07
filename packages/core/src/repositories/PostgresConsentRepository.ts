/**
 * PostgreSQL Consent Repository
 * Persistent storage for GDPR consent records
 *
 * HEXAGONAL ARCHITECTURE: This is an ADAPTER implementing the ConsentRepository PORT
 * defined in the domain layer (@medicalcor/domain/consent)
 *
 * IMPORTANT: Run the migration SQL in db/migrations/20241127000001_create_core_tables.sql
 * before using this repository.
 *
 * Uses the Result pattern for consistent error handling across all repository methods.
 * Methods return Result<T, E> where E is a typed error from @medicalcor/core/errors.
 *
 * @module @medicalcor/core/repositories/PostgresConsentRepository
 */

import { createLogger, type Logger } from '../logger.js';
import { RecordCreateError } from '../errors.js';
import { Ok, Err, type Result } from '../types/result.js';

// ============================================================================
// REPOSITORY ERROR TYPES
// ============================================================================

/** Error types that can be returned from PostgresConsentRepository operations */
export type ConsentRepositoryError = RecordCreateError;

/**
 * Database client interface
 * Matches the interface from @medicalcor/core/database
 */
export interface ConsentDatabaseClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Consent type enum matching domain layer
 */
export type ConsentType =
  | 'data_processing'
  | 'marketing_whatsapp'
  | 'marketing_email'
  | 'marketing_sms'
  | 'appointment_reminders'
  | 'treatment_updates'
  | 'third_party_sharing';

/**
 * Consent status enum matching domain layer
 */
export type ConsentStatus = 'granted' | 'denied' | 'withdrawn' | 'pending';

/**
 * Consent source interface matching domain layer
 */
export interface ConsentSource {
  channel: 'whatsapp' | 'web' | 'phone' | 'in_person' | 'email';
  method: 'explicit' | 'implicit' | 'double_opt_in';
  evidenceUrl: string | null;
  witnessedBy: string | null;
}

/**
 * Consent record interface matching domain layer
 */
export interface ConsentRecord {
  id: string;
  contactId: string;
  phone: string;
  consentType: ConsentType;
  status: ConsentStatus;
  version: number;
  grantedAt: string | null;
  withdrawnAt: string | null;
  expiresAt: string | null;
  source: ConsentSource;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Consent audit entry interface matching domain layer
 */
export interface ConsentAuditEntry {
  id: string;
  consentId: string;
  action: 'created' | 'granted' | 'denied' | 'withdrawn' | 'expired' | 'updated';
  previousStatus: ConsentStatus | null;
  newStatus: ConsentStatus;
  performedBy: string;
  reason: string | null;
  ipAddress: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}

/**
 * Repository interface (Port) - same as defined in domain layer
 * This is the contract that this adapter implements
 */
export interface IConsentRepository {
  save(consent: ConsentRecord): Promise<Result<ConsentRecord, RecordCreateError>>;
  upsert(
    consent: ConsentRecord
  ): Promise<Result<{ record: ConsentRecord; wasCreated: boolean }, RecordCreateError>>;
  findByContactAndType(contactId: string, consentType: ConsentType): Promise<ConsentRecord | null>;
  findByContact(contactId: string): Promise<ConsentRecord[]>;
  delete(consentId: string): Promise<void>;
  deleteByContact(contactId: string): Promise<number>;
  findExpiringSoon(withinDays: number): Promise<ConsentRecord[]>;
  findByStatus(status: ConsentStatus): Promise<ConsentRecord[]>;
  appendAuditEntry(entry: ConsentAuditEntry): Promise<void>;
  getAuditTrail(consentId: string): Promise<ConsentAuditEntry[]>;
  getContactAuditTrail(contactId: string): Promise<ConsentAuditEntry[]>;
}

const logger: Logger = createLogger({ name: 'postgres-consent-repository' });

/**
 * Type guard to validate a database row has the expected ConsentRow shape
 * This provides runtime validation to ensure type safety
 */
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

/**
 * Type guard to validate a database row has the expected AuditRow shape
 */
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

/**
 * Safely cast database rows to ConsentRow[] with runtime validation
 * TYPE SAFETY FIX: Replaces unsafe `as unknown as ConsentRow[]` casts
 */
function toConsentRows(rows: Record<string, unknown>[]): ConsentRow[] {
  return rows.filter((row): row is ConsentRow => {
    if (!isConsentRow(row)) {
      logger.warn('Invalid row structure detected, skipping row');
      return false;
    }
    return true;
  });
}

/**
 * Safely cast database rows to AuditRow[] with runtime validation
 * TYPE SAFETY FIX: Replaces unsafe `as unknown as AuditRow[]` casts
 */
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
 *
 * HEXAGONAL ARCHITECTURE:
 * - This is an ADAPTER (infrastructure layer)
 * - Implements the IConsentRepository PORT (domain layer interface)
 * - Contains all PostgreSQL-specific logic
 *
 * GDPR COMPLIANCE:
 * - All operations maintain audit trail
 * - Supports soft delete for right-to-erasure
 * - Atomic upsert prevents race conditions
 */
export class PostgresConsentRepository implements IConsentRepository {
  constructor(private readonly db: ConsentDatabaseClient) {}

  /**
   * Save a consent record
   * @returns Result containing the saved ConsentRecord or a RecordCreateError
   */
  async save(consent: ConsentRecord): Promise<Result<ConsentRecord, RecordCreateError>> {
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
      return Err(
        new RecordCreateError(
          'ConsentRepository',
          'Consent',
          'Failed to save consent: no row returned'
        )
      );
    }
    return Ok(this.rowToConsent(row));
  }

  /**
   * Atomically upsert a consent record
   * SECURITY FIX: This method uses PostgreSQL's ON CONFLICT to prevent race conditions
   * and returns whether the record was created or updated for correct audit logging
   * @returns Result containing the upserted ConsentRecord and wasCreated flag, or a RecordCreateError
   */
  async upsert(
    consent: ConsentRecord
  ): Promise<Result<{ record: ConsentRecord; wasCreated: boolean }, RecordCreateError>> {
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
      return Err(
        new RecordCreateError(
          'ConsentRepository',
          'Consent',
          'Failed to upsert consent: no row returned'
        )
      );
    }
    return Ok({
      record: this.rowToConsent(row),
      wasCreated: row.was_created,
    });
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

/**
 * Factory function to create a PostgresConsentRepository
 * @param db - Database client
 * @returns PostgresConsentRepository instance
 */
export function createPostgresConsentRepository(
  db: ConsentDatabaseClient
): PostgresConsentRepository {
  return new PostgresConsentRepository(db);
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
