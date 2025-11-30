/**
 * @module architecture/security/encryption
 *
 * Encryption Infrastructure
 * =========================
 *
 * End-to-end encryption for data at rest and in transit.
 */

import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// ENCRYPTION TYPES
// ============================================================================

/**
 * Encryption key
 */
export interface EncryptionKey {
  readonly keyId: string;
  readonly algorithm: EncryptionAlgorithm;
  readonly purpose: KeyPurpose;
  readonly createdAt: Date;
  readonly expiresAt?: Date;
  readonly rotatedAt?: Date;
  readonly version: number;
  readonly status: KeyStatus;
}

export type EncryptionAlgorithm =
  | 'aes-256-gcm'
  | 'aes-256-cbc'
  | 'chacha20-poly1305'
  | 'rsa-oaep-256';

export type KeyPurpose = 'data_encryption' | 'key_encryption' | 'signing' | 'authentication';

export type KeyStatus = 'active' | 'rotating' | 'deprecated' | 'destroyed';

/**
 * Encrypted data envelope
 */
export interface EncryptedEnvelope {
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag?: string;
  readonly keyId: string;
  readonly keyVersion: number;
  readonly algorithm: EncryptionAlgorithm;
  readonly encryptedAt: string;
}

/**
 * Encryption service interface
 */
export interface EncryptionService {
  /**
   * Encrypt data
   */
  encrypt(
    plaintext: Buffer | string,
    purpose?: KeyPurpose
  ): Promise<Result<EncryptedEnvelope, EncryptionError>>;

  /**
   * Decrypt data
   */
  decrypt(envelope: EncryptedEnvelope): Promise<Result<Buffer, EncryptionError>>;

  /**
   * Rotate encryption key
   */
  rotateKey(keyId: string): Promise<Result<EncryptionKey, EncryptionError>>;

  /**
   * Re-encrypt data with new key
   */
  reencrypt(envelope: EncryptedEnvelope): Promise<Result<EncryptedEnvelope, EncryptionError>>;
}

export interface EncryptionError {
  readonly code: string;
  readonly message: string;
  readonly keyId?: string;
}

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * Key Management Service interface
 */
export interface KeyManagementService {
  /**
   * Generate a new encryption key
   */
  generateKey(options: KeyGenerationOptions): Promise<Result<EncryptionKey, KeyManagementError>>;

  /**
   * Get a key by ID
   */
  getKey(keyId: string): Promise<Result<EncryptionKey, KeyManagementError>>;

  /**
   * Get the current active key for a purpose
   */
  getCurrentKey(purpose: KeyPurpose): Promise<Result<EncryptionKey, KeyManagementError>>;

  /**
   * Rotate a key
   */
  rotateKey(keyId: string): Promise<Result<EncryptionKey, KeyManagementError>>;

  /**
   * Destroy a key (after ensuring no data uses it)
   */
  destroyKey(keyId: string): Promise<Result<void, KeyManagementError>>;

  /**
   * List all keys
   */
  listKeys(options?: KeyListOptions): Promise<EncryptionKey[]>;
}

export interface KeyGenerationOptions {
  readonly algorithm: EncryptionAlgorithm;
  readonly purpose: KeyPurpose;
  readonly expiresInDays?: number;
}

export interface KeyListOptions {
  readonly purpose?: KeyPurpose;
  readonly status?: KeyStatus;
  readonly includeExpired?: boolean;
}

export interface KeyManagementError {
  readonly code: string;
  readonly message: string;
}

// ============================================================================
// FIELD-LEVEL ENCRYPTION
// ============================================================================

/**
 * Field encryption configuration
 */
export interface FieldEncryptionConfig {
  readonly field: string;
  readonly algorithm: EncryptionAlgorithm;
  readonly deterministic: boolean; // For searchable encryption
  readonly keyPurpose: KeyPurpose;
}

/**
 * Field-level encryption service
 */
export class FieldEncryptionService {
  constructor(
    private encryptionService: EncryptionService,
    private config: Map<string, FieldEncryptionConfig>
  ) {}

  /**
   * Encrypt specified fields in an object
   */
  async encryptFields<T extends object>(data: T): Promise<Result<T, EncryptionError>> {
    const result = { ...data } as Record<string, unknown>;

    for (const [field, config] of this.config) {
      if (field in result && result[field] !== null && result[field] !== undefined) {
        const value = String(result[field]);
        const encrypted = await this.encryptionService.encrypt(value, config.keyPurpose);

        if (encrypted.isErr) {
          return Err(encrypted.error);
        }

        result[field] = encrypted.value;
      }
    }

    return Ok(result as T);
  }

  /**
   * Decrypt specified fields in an object
   */
  async decryptFields<T extends object>(data: T): Promise<Result<T, EncryptionError>> {
    const result = { ...data } as Record<string, unknown>;

    for (const [field] of this.config) {
      const fieldValue = result[field];
      if (fieldValue && typeof fieldValue === 'object' && 'ciphertext' in fieldValue) {
        const decrypted = await this.encryptionService.decrypt(fieldValue as EncryptedEnvelope);

        if (decrypted.isErr) {
          return Err(decrypted.error);
        }

        result[field] = decrypted.value.toString('utf-8');
      }
    }

    return Ok(result as T);
  }
}

// ============================================================================
// HASHING
// ============================================================================

/**
 * Hashing service interface
 */
export interface HashingService {
  /**
   * Hash data (one-way)
   */
  hash(data: string, options?: HashOptions): Promise<string>;

  /**
   * Verify hash
   */
  verify(data: string, hash: string): Promise<boolean>;

  /**
   * Generate HMAC
   */
  hmac(data: string, key: string): Promise<string>;

  /**
   * Verify HMAC
   */
  verifyHmac(data: string, key: string, mac: string): Promise<boolean>;
}

export interface HashOptions {
  readonly algorithm?: HashAlgorithm;
  readonly salt?: string;
  readonly iterations?: number;
  readonly keyLength?: number;
}

export type HashAlgorithm = 'bcrypt' | 'argon2id' | 'scrypt' | 'sha256' | 'sha512';

// ============================================================================
// ENVELOPE ENCRYPTION
// ============================================================================

/**
 * Envelope encryption (encrypt data key with master key)
 */
export interface EnvelopeEncryption {
  /**
   * Encrypt data using envelope encryption
   */
  encrypt(
    plaintext: Buffer,
    context?: Record<string, string>
  ): Promise<Result<EnvelopeEncryptedData, EncryptionError>>;

  /**
   * Decrypt data using envelope encryption
   */
  decrypt(
    encrypted: EnvelopeEncryptedData,
    context?: Record<string, string>
  ): Promise<Result<Buffer, EncryptionError>>;
}

export interface EnvelopeEncryptedData {
  readonly encryptedDataKey: string;
  readonly masterKeyId: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly algorithm: EncryptionAlgorithm;
  readonly encryptionContext?: Record<string, string>;
}

// ============================================================================
// DATA CLASSIFICATION
// ============================================================================

/**
 * Data classification for encryption decisions
 */
export type DataClassification =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted'
  | 'pii'
  | 'phi'
  | 'pci';

/**
 * Get encryption requirements by classification
 */
export function getEncryptionRequirements(
  classification: DataClassification
): EncryptionRequirements {
  switch (classification) {
    case 'public':
      return {
        encryptAtRest: false,
        encryptInTransit: true,
        minimumKeySize: 0,
        algorithm: undefined,
      };

    case 'internal':
      return {
        encryptAtRest: false,
        encryptInTransit: true,
        minimumKeySize: 128,
        algorithm: 'aes-256-gcm',
      };

    case 'confidential':
      return {
        encryptAtRest: true,
        encryptInTransit: true,
        minimumKeySize: 256,
        algorithm: 'aes-256-gcm',
      };

    case 'restricted':
    case 'pii':
    case 'phi':
    case 'pci':
      return {
        encryptAtRest: true,
        encryptInTransit: true,
        minimumKeySize: 256,
        algorithm: 'aes-256-gcm',
        requireKeyRotation: true,
        keyRotationDays: 90,
        requireAuditLog: true,
      };
  }
}

export interface EncryptionRequirements {
  readonly encryptAtRest: boolean;
  readonly encryptInTransit: boolean;
  readonly minimumKeySize: number;
  readonly algorithm?: EncryptionAlgorithm;
  readonly requireKeyRotation?: boolean;
  readonly keyRotationDays?: number;
  readonly requireAuditLog?: boolean;
}

// ============================================================================
// CRYPTO UTILITIES
// ============================================================================

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a cryptographically secure UUID
 */
export function generateSecureUUID(): string {
  return crypto.randomUUID();
}

/**
 * Constant-time string comparison (prevents timing attacks)
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
