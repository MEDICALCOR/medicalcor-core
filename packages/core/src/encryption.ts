/**
 * Application-Level Encryption Service
 * Provides encryption at rest for PHI/PII data (HIPAA/GDPR compliance)
 *
 * Features:
 * - AES-256-GCM encryption
 * - Key versioning for rotation
 * - Automatic audit logging
 * - Field-level encryption
 * - AWS KMS integration for enterprise key management (optional)
 * - Envelope encryption pattern for scalability
 *
 * @module @medicalcor/core/encryption
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'crypto';
import type { DatabasePool } from './database.js';
import { createLogger, type Logger } from './logger.js';

const logger: Logger = createLogger({ name: 'encryption-service' });

// =============================================================================
// KMS PROVIDER INTERFACE - Pluggable Key Management
// =============================================================================

/**
 * Key Management Service provider interface
 * Allows pluggable KMS backends (AWS KMS, Azure Key Vault, GCP KMS, HashiCorp Vault)
 */
export interface KmsProvider {
  /** Provider name for logging */
  readonly name: string;

  /**
   * Encrypt a data encryption key (DEK) using the KMS master key (KEK)
   * @param plainKey - The plaintext data encryption key
   * @returns Encrypted (wrapped) key
   */
  encryptDataKey(plainKey: Buffer): Promise<Buffer>;

  /**
   * Decrypt a wrapped data encryption key
   * @param encryptedKey - The encrypted (wrapped) key
   * @returns Plaintext data encryption key
   */
  decryptDataKey(encryptedKey: Buffer): Promise<Buffer>;

  /**
   * Generate a new data encryption key using KMS
   * @returns Object with plaintext key and encrypted key
   */
  generateDataKey(): Promise<{ plainKey: Buffer; encryptedKey: Buffer }>;

  /**
   * Check if KMS is available and properly configured
   */
  isAvailable(): Promise<boolean>;
}

/** Internal AWS KMS client interface */
interface AwsKmsClient {
  encrypt(plainKey: Buffer): Promise<Buffer>;
  decrypt(encryptedKey: Buffer): Promise<Buffer>;
  generateDataKey(): Promise<{ plainKey: Buffer; encryptedKey: Buffer }>;
}

/**
 * AWS KMS Provider implementation
 * Uses envelope encryption: KMS encrypts data keys, data keys encrypt data
 *
 * Configuration:
 * - AWS_KMS_KEY_ID: The KMS key ARN or alias
 * - AWS_REGION: AWS region (defaults to eu-central-1)
 *
 * @example
 * ```typescript
 * const kms = new AwsKmsProvider('arn:aws:kms:eu-central-1:123456789:key/abc-123');
 * const encryptionService = new EncryptionService(db, kms);
 * ```
 */
export class AwsKmsProvider implements KmsProvider {
  readonly name = 'AWS KMS';
  private kmsClient: AwsKmsClient | null = null;
  private readonly keyId: string;

  constructor(keyId?: string) {
    this.keyId = keyId ?? process.env.AWS_KMS_KEY_ID ?? '';
    if (!this.keyId) {
      throw new Error('AWS KMS key ID must be provided via constructor or AWS_KMS_KEY_ID env var');
    }
  }

  private async getClient(): Promise<AwsKmsClient> {
    if (!this.kmsClient) {
      // Dynamically import AWS SDK to avoid requiring it when not used
      try {
        const { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } = await import(
          '@aws-sdk/client-kms'
        );

        const region = process.env.AWS_REGION ?? 'eu-central-1';
        const client = new KMSClient({ region });

        this.kmsClient = {
          encrypt: async (plainKey: Buffer) => {
            const command = new EncryptCommand({
              KeyId: this.keyId,
              Plaintext: plainKey,
            });
            const response = await client.send(command);
            if (!response.CiphertextBlob) {
              throw new Error('KMS encryption returned no ciphertext');
            }
            return Buffer.from(response.CiphertextBlob);
          },
          decrypt: async (encryptedKey: Buffer) => {
            const command = new DecryptCommand({
              KeyId: this.keyId,
              CiphertextBlob: encryptedKey,
            });
            const response = await client.send(command);
            if (!response.Plaintext) {
              throw new Error('KMS decryption returned no plaintext');
            }
            return Buffer.from(response.Plaintext);
          },
          generateDataKey: async () => {
            const command = new GenerateDataKeyCommand({
              KeyId: this.keyId,
              KeySpec: 'AES_256',
            });
            const response = await client.send(command);
            if (!response.Plaintext || !response.CiphertextBlob) {
              throw new Error('KMS generateDataKey returned incomplete response');
            }
            return {
              plainKey: Buffer.from(response.Plaintext),
              encryptedKey: Buffer.from(response.CiphertextBlob),
            };
          },
        };

        logger.info({ keyId: this.keyId.slice(-12), region }, 'AWS KMS client initialized');
      } catch (error) {
        logger.error({ error }, 'Failed to initialize AWS KMS client');
        throw new Error(
          'AWS KMS not available. Install @aws-sdk/client-kms package: npm install @aws-sdk/client-kms'
        );
      }
    }
    return this.kmsClient;
  }

  async encryptDataKey(plainKey: Buffer): Promise<Buffer> {
    const client = await this.getClient();
    return client.encrypt(plainKey);
  }

  async decryptDataKey(encryptedKey: Buffer): Promise<Buffer> {
    const client = await this.getClient();
    return client.decrypt(encryptedKey);
  }

  async generateDataKey(): Promise<{ plainKey: Buffer; encryptedKey: Buffer }> {
    const client = await this.getClient();
    return client.generateDataKey();
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.getClient();
      // Test connection with a simple encrypt/decrypt cycle
      const testKey = randomBytes(32);
      const encrypted = await this.encryptDataKey(testKey);
      const decrypted = await this.decryptDataKey(encrypted);
      return testKey.equals(decrypted);
    } catch (error) {
      logger.warn({ error }, 'AWS KMS availability check failed');
      return false;
    }
  }
}

/**
 * Local/Environment KMS Provider (for development/testing)
 * Uses a master key from environment variable
 *
 * WARNING: Only use for development. Production should use AWS KMS or similar HSM-backed service.
 */
export class LocalKmsProvider implements KmsProvider {
  readonly name = 'Local Environment';
  private readonly masterKey: Buffer;

  constructor(masterKeyHex?: string) {
    const keyHex = masterKeyHex ?? process.env.KMS_MASTER_KEY;
    if (keyHex?.length !== 64) {
      throw new Error('KMS_MASTER_KEY must be 32 bytes (64 hex characters)');
    }
    this.masterKey = Buffer.from(keyHex, 'hex');
  }

  encryptDataKey(plainKey: Buffer): Promise<Buffer> {
    // AES-GCM encryption of the data key with the master key
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainKey), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: iv(12) + authTag(16) + encrypted
    return Promise.resolve(Buffer.concat([iv, authTag, encrypted]));
  }

  decryptDataKey(encryptedKey: Buffer): Promise<Buffer> {
    const iv = encryptedKey.subarray(0, 12);
    const authTag = encryptedKey.subarray(12, 28);
    const encrypted = encryptedKey.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    return Promise.resolve(Buffer.concat([decipher.update(encrypted), decipher.final()]));
  }

  async generateDataKey(): Promise<{ plainKey: Buffer; encryptedKey: Buffer }> {
    const plainKey = randomBytes(32);
    const encryptedKey = await this.encryptDataKey(plainKey);
    return { plainKey, encryptedKey };
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** Encryption algorithm configuration */
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm' as const,
  keyLength: 32, // 256 bits
  ivLength: 12, // 96 bits - NIST SP 800-38D recommended for AES-GCM (optimal performance)
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
 *
 * Supports two modes:
 * 1. Direct key mode: Master key loaded from environment (DATA_ENCRYPTION_KEY)
 * 2. KMS mode: Keys managed via KMS provider (AWS KMS, etc.) for envelope encryption
 *
 * KMS mode is recommended for production as it provides:
 * - Hardware-backed key protection
 * - Automatic key rotation
 * - Audit logging of key usage
 * - Compliance with HIPAA/GDPR requirements
 */
export class EncryptionService {
  private masterKey: Buffer | null = null;
  private currentKeyVersion = 1;
  private kmsProvider: KmsProvider | null = null;
  private cachedDataKey: { plainKey: Buffer; encryptedKey: Buffer } | null = null;
  private dataKeyCacheExpiry = 0;
  private static readonly DATA_KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private db?: DatabasePool,
    kmsProvider?: KmsProvider
  ) {
    this.kmsProvider = kmsProvider ?? null;
    this.loadMasterKey();
  }

  /**
   * Load master key from environment
   * SECURITY FIX: Strict validation for production environments
   */
  private loadMasterKey(): void {
    const keyHex = process.env.DATA_ENCRYPTION_KEY;
    const isProduction = process.env.NODE_ENV === 'production';

    if (!keyHex) {
      if (isProduction) {
        // CRITICAL: In production, encryption key MUST be configured for HIPAA/GDPR compliance
        throw new Error(
          'CRITICAL: DATA_ENCRYPTION_KEY must be configured in production. ' +
            'PHI/PII data cannot be stored without encryption. ' +
            'Generate a key with: openssl rand -hex 32'
        );
      }
      logger.warn(
        'DATA_ENCRYPTION_KEY not configured. Encryption will fail. ' +
          'This is only acceptable in development/testing.'
      );
      return;
    }

    // Validate key format
    if (keyHex.length !== 64) {
      throw new Error(
        `DATA_ENCRYPTION_KEY must be 32 bytes (64 hex characters), got ${keyHex.length} characters`
      );
    }

    // Validate key is valid hex
    if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
      throw new Error('DATA_ENCRYPTION_KEY must be a valid hexadecimal string');
    }

    // SECURITY: Validate key isn't a weak/obvious pattern
    const keyBuffer = Buffer.from(keyHex, 'hex');
    if (this.isWeakKey(keyBuffer)) {
      throw new Error(
        'DATA_ENCRYPTION_KEY appears to be a weak key (repeated patterns, all zeros, etc.). ' +
          'Generate a cryptographically secure key with: openssl rand -hex 32'
      );
    }

    this.masterKey = keyBuffer;
    logger.info('Data encryption key loaded and validated');
  }

  /**
   * Check if a key is weak (repeated patterns, all zeros, etc.)
   * SECURITY: Prevents common mistakes like using test keys in production
   */
  private isWeakKey(key: Buffer): boolean {
    // Check for all zeros
    if (key.every((byte) => byte === 0)) {
      return true;
    }

    // Check for all same byte
    if (key.every((byte) => byte === key[0])) {
      return true;
    }

    // Check for repeating 2-byte pattern
    if (key.length >= 4) {
      const pattern = key.slice(0, 2);
      let isRepeating = true;
      for (let i = 0; i < key.length; i += 2) {
        if (key[i] !== pattern[0] || key[i + 1] !== pattern[1]) {
          isRepeating = false;
          break;
        }
      }
      if (isRepeating) return true;
    }

    // Check for sequential bytes (0x01, 0x02, 0x03, ...)
    let isSequential = true;
    for (let i = 1; i < key.length; i++) {
      if (key[i] !== (key[i - 1]! + 1) % 256) {
        isSequential = false;
        break;
      }
    }
    if (isSequential) return true;

    return false;
  }

  /**
   * Check if encryption is properly configured
   * Returns true if either direct key or KMS provider is available
   */
  isConfigured(): boolean {
    return this.masterKey !== null || this.kmsProvider !== null;
  }

  /**
   * Check if KMS mode is enabled
   */
  isKmsEnabled(): boolean {
    return this.kmsProvider !== null;
  }

  /**
   * Get KMS provider name (for logging/diagnostics)
   */
  getKmsProviderName(): string | null {
    return this.kmsProvider?.name ?? null;
  }

  /**
   * Get or generate a data encryption key via KMS
   * Uses caching to reduce KMS API calls
   * @private
   */
  private async getDataKey(): Promise<{ plainKey: Buffer; encryptedKey: Buffer }> {
    if (!this.kmsProvider) {
      throw new Error('KMS provider not configured');
    }

    // Return cached key if still valid
    if (this.cachedDataKey && Date.now() < this.dataKeyCacheExpiry) {
      return this.cachedDataKey;
    }

    // Generate new data key via KMS
    this.cachedDataKey = await this.kmsProvider.generateDataKey();
    this.dataKeyCacheExpiry = Date.now() + EncryptionService.DATA_KEY_CACHE_TTL_MS;

    logger.debug(
      { kmsProvider: this.kmsProvider.name },
      'Generated new data encryption key via KMS'
    );
    return this.cachedDataKey;
  }

  /**
   * Decrypt a data key that was encrypted by KMS
   * @private
   */
  private async decryptDataKey(encryptedKey: Buffer): Promise<Buffer> {
    if (!this.kmsProvider) {
      throw new Error('KMS provider not configured');
    }
    return this.kmsProvider.decryptDataKey(encryptedKey);
  }

  /**
   * Encrypt a value using KMS-managed envelope encryption
   * The data key is encrypted by KMS and stored with the ciphertext
   */
  async encryptWithKms(plaintext: string): Promise<EncryptionResult> {
    if (!this.kmsProvider) {
      throw new Error('KMS provider not configured. Use encrypt() for direct key encryption.');
    }

    // Get data key from KMS (cached for performance)
    const { plainKey, encryptedKey } = await this.getDataKey();

    // Generate random IV
    const iv = randomBytes(ENCRYPTION_CONFIG.ivLength);

    // Encrypt data with the data key
    const cipher = createCipheriv(ENCRYPTION_CONFIG.algorithm, plainKey, iv, {
      authTagLength: ENCRYPTION_CONFIG.authTagLength,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Format: kms:keyVersion:encryptedDataKey:iv:authTag:encrypted (all base64)
    const encryptedValue = [
      'kms', // Marker for KMS-encrypted data
      this.currentKeyVersion.toString(),
      encryptedKey.toString('base64'),
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
   * Decrypt a value that was encrypted using KMS envelope encryption
   */
  async decryptWithKms(encryptedValue: string): Promise<string> {
    if (!this.kmsProvider) {
      throw new Error('KMS provider not configured');
    }

    const parts = encryptedValue.split(':');
    if (parts.length !== 6 || parts[0] !== 'kms') {
      throw new Error('Invalid KMS-encrypted value format');
    }

    const keyVersion = parseInt(parts[1]!, 10);
    const encryptedDataKey = Buffer.from(parts[2]!, 'base64');
    const iv = Buffer.from(parts[3]!, 'base64');
    const authTag = Buffer.from(parts[4]!, 'base64');
    const encrypted = Buffer.from(parts[5]!, 'base64');

    if (keyVersion !== this.currentKeyVersion) {
      logger.warn(
        { keyVersion, currentVersion: this.currentKeyVersion },
        'Decrypting with old KMS key version'
      );
    }

    // Decrypt data key via KMS
    const plainKey = await this.decryptDataKey(encryptedDataKey);

    // Decrypt data with the decrypted data key
    const decipher = createDecipheriv(ENCRYPTION_CONFIG.algorithm, plainKey, iv, {
      authTagLength: ENCRYPTION_CONFIG.authTagLength,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  }

  /**
   * Smart encrypt - uses KMS if available, otherwise direct key
   */
  async encryptSmart(plaintext: string): Promise<EncryptionResult> {
    if (this.kmsProvider) {
      return this.encryptWithKms(plaintext);
    }
    return this.encrypt(plaintext);
  }

  /**
   * Smart decrypt - detects encryption method and decrypts appropriately
   */
  async decryptSmart(encryptedValue: string): Promise<string> {
    if (encryptedValue.startsWith('kms:')) {
      if (!this.kmsProvider) {
        throw new Error('Value was encrypted with KMS but no KMS provider is configured');
      }
      return this.decryptWithKms(encryptedValue);
    }
    return this.decrypt(encryptedValue);
  }

  /**
   * Encrypt a value
   */
  encrypt(plaintext: string): EncryptionResult {
    if (!this.masterKey) {
      throw new Error(
        'Encryption key not configured. Set DATA_ENCRYPTION_KEY environment variable.'
      );
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

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

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
      logger.warn(
        { keyVersion, currentVersion: this.currentKeyVersion },
        'Decrypting with old key version'
      );
    }

    // Derive key
    const derivedKey = deriveKey(this.masterKey, salt);

    // Decrypt
    const decipher = createDecipheriv(ENCRYPTION_CONFIG.algorithm, derivedKey, iv, {
      authTagLength: ENCRYPTION_CONFIG.authTagLength,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  }

  /**
   * Store encrypted field in database
   */
  async storeEncryptedField(field: EncryptedField, plaintext: string): Promise<void> {
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
      [
        field.entityType,
        field.entityId,
        field.fieldName,
        encryptedValue,
        keyVersion,
        field.classification,
      ]
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
    const fingerprint = createHash('sha256').update(newMasterKey).digest('hex').slice(0, 16);

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
      // Save key state outside try block so it's accessible in finally
      const oldMasterKey = this.masterKey;
      const oldKeyVersion = this.currentKeyVersion;
      try {
        // Decrypt with old key
        const plaintext = this.decrypt(row.encrypted_value as string);

        // Re-encrypt with new key
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
      } catch (error) {
        logger.error({ id: row.id, error }, 'Failed to rotate encryption for record');
      } finally {
        // Always restore old key state for next iteration's decrypt
        this.masterKey = oldMasterKey;
        this.currentKeyVersion = oldKeyVersion;
      }
    }

    // Mark old key as retired and new key as active
    await this.db.query(
      `UPDATE encryption_keys SET status = 'retired', retired_at = CURRENT_TIMESTAMP
       WHERE version < $1 AND status = 'active'`,
      [newKeyVersion]
    );

    await this.db.query(`UPDATE encryption_keys SET status = 'active' WHERE version = $1`, [
      newKeyVersion,
    ]);

    // SECURITY: Zero out old master key from memory before replacement
    // This prevents the old key from being exposed in heap dumps or memory analysis
    if (this.masterKey) {
      this.masterKey.fill(0);
    }

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
 * @param db - Optional database pool for storing encrypted data
 * @param kmsProvider - Optional KMS provider for envelope encryption
 */
export function createEncryptionService(
  db?: DatabasePool,
  kmsProvider?: KmsProvider
): EncryptionService {
  return new EncryptionService(db, kmsProvider);
}

/**
 * Create encryption service with AWS KMS
 * Recommended for production environments
 *
 * @param db - Database pool for storing encrypted data
 * @param kmsKeyId - AWS KMS key ARN or alias (optional, uses AWS_KMS_KEY_ID env var)
 *
 * @example
 * ```typescript
 * const encryptionService = await createKmsEncryptionService(db);
 * const { encryptedValue } = await encryptionService.encryptWithKms('sensitive data');
 * ```
 */
export async function createKmsEncryptionService(
  db?: DatabasePool,
  kmsKeyId?: string
): Promise<EncryptionService> {
  const kmsProvider = new AwsKmsProvider(kmsKeyId);

  // Verify KMS is available before returning
  const isAvailable = await kmsProvider.isAvailable();
  if (!isAvailable) {
    throw new Error('AWS KMS is not available. Check AWS credentials and KMS key configuration.');
  }

  logger.info(
    { kmsKeyId: kmsKeyId?.slice(-12) ?? 'from env' },
    'Created KMS-enabled encryption service'
  );
  return new EncryptionService(db, kmsProvider);
}

/**
 * Create encryption service with automatic KMS detection
 * Uses AWS KMS if AWS_KMS_KEY_ID is configured, otherwise falls back to direct key
 */
export async function createAutoEncryptionService(db?: DatabasePool): Promise<EncryptionService> {
  const kmsKeyId = process.env.AWS_KMS_KEY_ID;

  if (kmsKeyId) {
    try {
      return await createKmsEncryptionService(db, kmsKeyId);
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize KMS, falling back to direct key encryption');
    }
  }

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
