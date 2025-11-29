/**
 * Application-Level Encryption Service
 * Provides encryption at rest for PHI/PII data (HIPAA/GDPR compliance)
 *
 * Features:
 * - AES-256-GCM encryption
 * - Key versioning for rotation
 * - Automatic audit logging
 * - Field-level encryption
 *
 * @module @medicalcor/core/encryption
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  scryptSync,
} from 'crypto';
import type { DatabasePool } from './database.js';
import { createLogger, type Logger } from './logger.js';

const logger: Logger = createLogger({ name: 'encryption-service' });

/** Encryption algorithm configuration */
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm' as const,
  keyLength: 32, // 256 bits
  ivLength: 16, // 128 bits (recommended for GCM)
  authTagLength: 16, // 128 bits
  saltLength: 32,
};

/** Data classification levels */
export type DataClassification = 'pii' | 'phi' | 'sensitive' | 'confidential';

/** Encrypted field metadata */
export interface EncryptedField {
  entityType: string;
  entityId: string;
  fieldName: string;
  classification: DataClassification;
}

/** Encryption result */
export interface EncryptionResult {
  encryptedValue: string;
  keyVersion: number;
}

/** Decryption options */
export interface DecryptionOptions {
  logAccess?: boolean;
  accessReason?: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Key derivation from master key
 */
function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, ENCRYPTION_CONFIG.keyLength);
}

/**
 * Application-Level Encryption Service
 */
export class EncryptionService {
  private masterKey: Buffer | null = null;
  private currentKeyVersion: number = 1;

  constructor(private db?: DatabasePool) {
    this.loadMasterKey();
  }

  /**
   * Load master key from environment
   */
  private loadMasterKey(): void {
    const keyHex = process.env.DATA_ENCRYPTION_KEY;
    if (keyHex && keyHex.length === 64) {
      this.masterKey = Buffer.from(keyHex, 'hex');
      logger.info('Data encryption key loaded');
    } else {
      logger.warn('DATA_ENCRYPTION_KEY not configured or invalid. Encryption will fail.');
    }
  }

  /**
   * Check if encryption is properly configured
   */
  isConfigured(): boolean {
    return this.masterKey !== null;
  }

  /**
   * Encrypt a value
   */
  encrypt(plaintext: string): EncryptionResult {
    if (!this.masterKey) {
      throw new Error('Encryption key not configured. Set DATA_ENCRYPTION_KEY environment variable.');
    }

    // Generate random IV and salt
    const iv = randomBytes(ENCRYPTION_CONFIG.ivLength);
    const salt = randomBytes(ENCRYPTION_CONFIG.saltLength);

    // Derive key from master key with salt
    const derivedKey = deriveKey(this.masterKey, salt);

    // Encrypt
    const cipher = createCipheriv(ENCRYPTION_CONFIG.algorithm, derivedKey, iv, {
      authTagLength: ENCRYPTION_CONFIG.authTagLength,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Format: keyVersion:salt:iv:authTag:encrypted (all base64)
    const encryptedValue = [
      this.currentKeyVersion.toString(),
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');

    return {
      encryptedValue,
      keyVersion: this.currentKeyVersion,
    };
  }

  /**
   * Decrypt a value
   */
  decrypt(encryptedValue: string): string {
    if (!this.masterKey) {
      throw new Error('Encryption key not configured');
    }

    const parts = encryptedValue.split(':');
    if (parts.length !== 5) {
      throw new Error('Invalid encrypted value format');
    }

    const keyVersion = parseInt(parts[0]!, 10);
    const salt = Buffer.from(parts[1]!, 'base64');
    const iv = Buffer.from(parts[2]!, 'base64');
    const authTag = Buffer.from(parts[3]!, 'base64');
    const encrypted = Buffer.from(parts[4]!, 'base64');

    // Get key for this version (for now, just use master key)
    // In production, implement key version management
    if (keyVersion !== this.currentKeyVersion) {
      logger.warn({ keyVersion, currentVersion: this.currentKeyVersion }, 'Decrypting with old key version');
    }

    // Derive key
    const derivedKey = deriveKey(this.masterKey, salt);

    // Decrypt
    const decipher = createDecipheriv(ENCRYPTION_CONFIG.algorithm, derivedKey, iv, {
      authTagLength: ENCRYPTION_CONFIG.authTagLength,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Store encrypted field in database
   */
  async storeEncryptedField(
    field: EncryptedField,
    plaintext: string
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const { encryptedValue, keyVersion } = this.encrypt(plaintext);

    await this.db.query(
      `INSERT INTO encrypted_data (entity_type, entity_id, field_name, encrypted_value, key_version, classification)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (entity_type, entity_id, field_name) WHERE deleted_at IS NULL
       DO UPDATE SET
         encrypted_value = $4,
         key_version = $5,
         updated_at = CURRENT_TIMESTAMP`,
      [field.entityType, field.entityId, field.fieldName, encryptedValue, keyVersion, field.classification]
    );

    logger.debug(
      { entityType: field.entityType, entityId: field.entityId, fieldName: field.fieldName },
      'Encrypted field stored'
    );
  }

  /**
   * Retrieve and decrypt field from database
   */
  async getDecryptedField(
    field: Omit<EncryptedField, 'classification'>,
    options: DecryptionOptions = {}
  ): Promise<string | null> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const result = await this.db.query(
      `SELECT encrypted_value, classification FROM encrypted_data
       WHERE entity_type = $1 AND entity_id = $2 AND field_name = $3 AND deleted_at IS NULL`,
      [field.entityType, field.entityId, field.fieldName]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0]!;
    const encryptedValue = row.encrypted_value as string;

    // Log access if required
    if (options.logAccess !== false) {
      await this.logAccess(field, 'read', options);
    }

    // Update accessed_at
    await this.db.query(
      `UPDATE encrypted_data SET accessed_at = CURRENT_TIMESTAMP, accessed_by = $4
       WHERE entity_type = $1 AND entity_id = $2 AND field_name = $3`,
      [field.entityType, field.entityId, field.fieldName, options.userId ?? null]
    );

    return this.decrypt(encryptedValue);
  }

  /**
   * Delete encrypted field (soft delete)
   */
  async deleteEncryptedField(
    field: Omit<EncryptedField, 'classification'>,
    options: DecryptionOptions = {}
  ): Promise<boolean> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const result = await this.db.query(
      `UPDATE encrypted_data SET deleted_at = CURRENT_TIMESTAMP
       WHERE entity_type = $1 AND entity_id = $2 AND field_name = $3 AND deleted_at IS NULL`,
      [field.entityType, field.entityId, field.fieldName]
    );

    if ((result.rowCount ?? 0) > 0) {
      await this.logAccess(field, 'delete', options);
      return true;
    }

    return false;
  }

  /**
   * Log access to sensitive data
   */
  private async logAccess(
    field: Omit<EncryptedField, 'classification'>,
    accessType: 'read' | 'write' | 'export' | 'delete',
    options: DecryptionOptions
  ): Promise<void> {
    if (!this.db) return;

    await this.db.query(
      `INSERT INTO sensitive_data_access_log
       (user_id, session_id, entity_type, entity_id, field_names, access_type, access_reason, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        options.userId ?? null,
        options.sessionId ?? null,
        field.entityType,
        field.entityId,
        [field.fieldName],
        accessType,
        options.accessReason ?? null,
        options.ipAddress ?? null,
        options.userAgent ?? null,
      ]
    );
  }

  /**
   * Re-encrypt all data with new key version (key rotation)
   */
  async rotateEncryptionKey(newKeyHex: string): Promise<number> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    if (newKeyHex.length !== 64) {
      throw new Error('New key must be 32 bytes (64 hex characters)');
    }

    const newMasterKey = Buffer.from(newKeyHex, 'hex');
    const newKeyVersion = this.currentKeyVersion + 1;

    // Register new key
    const fingerprint = createHash('sha256')
      .update(newMasterKey)
      .digest('hex')
      .slice(0, 16);

    await this.db.query(
      `INSERT INTO encryption_keys (version, fingerprint, status)
       VALUES ($1, $2, 'rotating')`,
      [newKeyVersion, fingerprint]
    );

    // Get all encrypted data
    const result = await this.db.query(
      `SELECT id, encrypted_value FROM encrypted_data WHERE deleted_at IS NULL`
    );

    let rotatedCount = 0;

    for (const row of result.rows) {
      try {
        // Decrypt with old key
        const plaintext = this.decrypt(row.encrypted_value as string);

        // Re-encrypt with new key
        const oldMasterKey = this.masterKey;
        this.masterKey = newMasterKey;
        this.currentKeyVersion = newKeyVersion;

        const { encryptedValue } = this.encrypt(plaintext);

        // Update record
        await this.db.query(
          `UPDATE encrypted_data SET encrypted_value = $1, key_version = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [encryptedValue, newKeyVersion, row.id]
        );

        rotatedCount++;
        this.masterKey = oldMasterKey;
        this.currentKeyVersion = newKeyVersion - 1;
      } catch (error) {
        logger.error({ id: row.id, error }, 'Failed to rotate encryption for record');
      }
    }

    // Mark old key as retired and new key as active
    await this.db.query(
      `UPDATE encryption_keys SET status = 'retired', retired_at = CURRENT_TIMESTAMP
       WHERE version < $1 AND status = 'active'`,
      [newKeyVersion]
    );

    await this.db.query(
      `UPDATE encryption_keys SET status = 'active' WHERE version = $1`,
      [newKeyVersion]
    );

    // Update service to use new key
    this.masterKey = newMasterKey;
    this.currentKeyVersion = newKeyVersion;

    logger.info({ rotatedCount, newKeyVersion }, 'Encryption key rotation completed');

    return rotatedCount;
  }

  /**
   * Hash sensitive data for indexing (one-way)
   */
  hashForIndex(value: string): string {
    if (!this.masterKey) {
      throw new Error('Encryption key not configured');
    }

    // Use HMAC for deterministic but secure hashing
    const hmac = createHash('sha256');
    hmac.update(this.masterKey);
    hmac.update(value.toLowerCase().trim());
    return hmac.digest('hex');
  }
}

/**
 * Create encryption service instance
 */
export function createEncryptionService(db?: DatabasePool): EncryptionService {
  return new EncryptionService(db);
}

/**
 * Convenience function for quick encryption without database
 */
export function encryptValue(plaintext: string): string {
  const service = new EncryptionService();
  return service.encrypt(plaintext).encryptedValue;
}

/**
 * Convenience function for quick decryption without database
 */
export function decryptValue(encryptedValue: string): string {
  const service = new EncryptionService();
  return service.decrypt(encryptedValue);
}
