/**
 * Multi-Factor Authentication (MFA) Service
 * Implements TOTP (Time-based One-Time Password) for HIPAA/GDPR compliance
 *
 * @module @medicalcor/core/auth/mfa
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import type { DatabasePool } from '../database.js';
import { createLogger, type Logger } from '../logger.js';
import { AuthEventRepository } from './auth-event-repository.js';
import type { AuthContext } from './types.js';

const logger: Logger = createLogger({ name: 'mfa-service' });

/** MFA Configuration */
export const MFA_CONFIG = {
  /** TOTP token validity window in seconds (30s is standard) */
  totpTimeStep: 30,
  /** Number of time steps to allow for clock drift */
  totpWindow: 1,
  /** Number of backup codes to generate */
  backupCodeCount: 10,
  /** Length of each backup code (8 chars) */
  backupCodeLength: 8,
  /** Secret length in bytes (20 bytes = 160 bits, standard for TOTP) */
  secretLength: 20,
  /** Maximum failed MFA attempts before lockout */
  maxFailedAttempts: 5,
  /** Lockout duration in minutes */
  lockoutMinutes: 15,
};

/** MFA method types */
export type MfaMethod = 'totp' | 'email_otp' | 'sms_otp';

/** MFA status for a user */
export interface MfaStatus {
  enabled: boolean;
  method?: MfaMethod;
  verifiedAt?: Date;
  backupCodesRemaining?: number;
}

/** MFA setup result */
export interface MfaSetupResult {
  secret: string;
  secretEncrypted: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

/** MFA verification result */
export interface MfaVerifyResult {
  success: boolean;
  error?: string;
  attemptsRemaining?: number;
  lockedUntil?: Date;
}

/**
 * Base32 encoding for TOTP secrets
 * Uses RFC 4648 alphabet (A-Z, 2-7)
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET.charAt((value >> (bits - 5)) & 0x1f);
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET.charAt((value << (5 - bits)) & 0x1f);
  }

  return result;
}

function base32Decode(encoded: string): Buffer {
  const cleanedInput = encoded.replace(/[^A-Z2-7]/gi, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleanedInput) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate HMAC-based OTP (HOTP) as per RFC 4226
 */
function generateHotp(secret: Buffer, counter: bigint, digits = 6): string {
  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  // HMAC-SHA1 as per RFC 4226
  // Use HMAC properly with inner and outer pads
  const innerKey = Buffer.alloc(64, 0x36);
  const outerKey = Buffer.alloc(64, 0x5c);

  // Pad or truncate key to 64 bytes
  const keyPadded = Buffer.alloc(64);
  secret.copy(keyPadded);

  // Buffer.alloc guarantees all indices are initialized to the specified fill value (0x36 and 0x5c)
  // so we can safely use non-null assertions here
  for (let i = 0; i < 64; i++) {
    innerKey[i] = innerKey[i]! ^ keyPadded[i]!;
    outerKey[i] = outerKey[i]! ^ keyPadded[i]!;
  }

  // Inner hash
  const innerHash = createHash('sha1').update(innerKey).update(counterBuffer).digest();

  // Outer hash
  const hmacResult = createHash('sha1').update(outerKey).update(innerHash).digest();

  // Dynamic truncation
  const offset = hmacResult[19]! & 0x0f;
  const binary =
    ((hmacResult[offset]! & 0x7f) << 24) |
    ((hmacResult[offset + 1]! & 0xff) << 16) |
    ((hmacResult[offset + 2]! & 0xff) << 8) |
    (hmacResult[offset + 3]! & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Generate TOTP as per RFC 6238
 */
function generateTotp(secret: Buffer, timeStep = 30): string {
  const counter = BigInt(Math.floor(Date.now() / 1000 / timeStep));
  return generateHotp(secret, counter);
}

/**
 * Verify TOTP with time window allowance
 */
function verifyTotp(secret: Buffer, token: string, timeStep = 30, window = 1): boolean {
  const counter = BigInt(Math.floor(Date.now() / 1000 / timeStep));

  // Check current and adjacent time steps
  for (let i = -window; i <= window; i++) {
    const checkCounter = counter + BigInt(i);
    const expectedToken = generateHotp(secret, checkCounter);

    // Constant-time comparison
    if (timingSafeEqual(token, expectedToken)) {
      return true;
    }
  }

  return false;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Multi-Factor Authentication Service
 *
 * SECURITY: MFA encryption is REQUIRED in production environments.
 * Without proper encryption, TOTP secrets would be stored in plaintext,
 * violating HIPAA/GDPR requirements for PHI/PII protection.
 */
export class MfaService {
  private eventRepo: AuthEventRepository;
  private encryptionKey: Buffer | null = null;
  private readonly isProduction: boolean;

  constructor(private db: DatabasePool) {
    this.eventRepo = new AuthEventRepository(db);
    this.isProduction = process.env.NODE_ENV === 'production';

    // Load encryption key from environment
    const keyHex = process.env.MFA_ENCRYPTION_KEY;
    if (keyHex?.length === 64) {
      this.encryptionKey = Buffer.from(keyHex, 'hex');
      logger.info('MFA encryption key loaded successfully');
    } else if (keyHex && keyHex.length !== 64) {
      // Invalid key format - warn but don't fail immediately
      logger.error(
        { keyLength: keyHex.length, expected: 64 },
        'MFA_ENCRYPTION_KEY has invalid length (expected 64 hex characters / 32 bytes)'
      );
    }

    // SECURITY: Enforce encryption in production
    this.enforceProductionSecurity();
  }

  /**
   * Enforce security requirements in production
   * Throws if MFA encryption is not properly configured
   */
  private enforceProductionSecurity(): void {
    if (!this.isProduction) {
      if (!this.encryptionKey) {
        logger.warn(
          'MFA encryption key not configured in development mode. ' +
            'Set MFA_ENCRYPTION_KEY (64 hex chars) for production-like security.'
        );
      }
      return;
    }

    // Production environment - encryption is REQUIRED
    if (!this.encryptionKey) {
      const errorMsg =
        'SECURITY VIOLATION: MFA encryption is REQUIRED in production. ' +
        'Set MFA_ENCRYPTION_KEY environment variable with a 64-character hex string (32 bytes). ' +
        'Generate a secure key with: openssl rand -hex 32';

      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Validate key is not a weak/test key
    if (this.isWeakKey(this.encryptionKey)) {
      const errorMsg =
        'SECURITY VIOLATION: MFA encryption key appears to be a weak or test key. ' +
        'Use a cryptographically secure random key in production. ' +
        'Generate with: openssl rand -hex 32';

      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    logger.info('MFA encryption security checks passed for production');
  }

  /**
   * Check if the encryption key appears to be weak or a test key
   */
  private isWeakKey(key: Buffer): boolean {
    const keyHex = key.toString('hex');

    // Check for common weak patterns
    const weakPatterns = [
      /^0+$/, // All zeros
      /^f+$/i, // All F's
      /^(00|ff)+$/i, // Repeating 00 or FF
      /^0123456789abcdef/i, // Sequential
      /^(.)\\1{31,}$/, // All same character
      /^test/i, // Starts with 'test'
      /^(deadbeef|cafebabe|baadf00d)/i, // Common test values
    ];

    return weakPatterns.some((pattern) => pattern.test(keyHex));
  }

  /**
   * Check if MFA encryption is properly configured
   */
  isEncryptionConfigured(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * Get MFA status for a user
   */
  async getStatus(userId: string): Promise<MfaStatus> {
    const result = await this.db.query(
      `SELECT method, verified_at,
              (SELECT COUNT(*) FROM mfa_backup_codes WHERE user_id = $1 AND used_at IS NULL) as backup_codes
       FROM mfa_secrets WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return { enabled: false };
    }

    const row = result.rows[0]!;
    const status: MfaStatus = {
      enabled: true,
      method: row.method as MfaMethod,
      backupCodesRemaining: parseInt(row.backup_codes as string, 10),
    };

    // Only add verifiedAt if it's defined (exactOptionalPropertyTypes compliance)
    if (row.verified_at) {
      status.verifiedAt = new Date(row.verified_at as string);
    }

    return status;
  }

  /**
   * Begin MFA setup for a user
   * Returns the secret and QR code URL for authenticator app setup
   */
  async beginSetup(
    userId: string,
    email: string,
    method: MfaMethod = 'totp'
  ): Promise<MfaSetupResult> {
    if (method === 'totp' && !this.encryptionKey) {
      throw new Error(
        'MFA encryption key not configured. Set MFA_ENCRYPTION_KEY environment variable.'
      );
    }

    // Generate secret
    const secretBytes = randomBytes(MFA_CONFIG.secretLength);
    const secret = base32Encode(secretBytes);

    // Encrypt secret for storage
    const secretEncrypted = this.encryptSecret(secretBytes);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    const backupCodeHashes = backupCodes.map((code) =>
      createHash('sha256').update(code).digest('hex')
    );

    // Store encrypted secret (pending verification)
    await this.db.query(
      `INSERT INTO mfa_secrets (user_id, method, secret_encrypted, pending_secret_encrypted)
       VALUES ($1, $2, NULL, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         pending_secret_encrypted = $3,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, method, secretEncrypted]
    );

    // Store backup codes (pending)
    for (const hash of backupCodeHashes) {
      await this.db.query(
        `INSERT INTO mfa_backup_codes (user_id, code_hash, pending)
         VALUES ($1, $2, true)`,
        [userId, hash]
      );
    }

    // Generate QR code URL (otpauth:// format)
    const issuer = encodeURIComponent(process.env.APP_NAME ?? 'MedicalCor');
    const accountName = encodeURIComponent(email);
    const qrCodeUrl = `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    logger.info({ userId, method }, 'MFA setup initiated');

    return {
      secret,
      secretEncrypted,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Complete MFA setup by verifying the first TOTP code
   */
  async completeSetup(
    userId: string,
    token: string,
    context?: AuthContext
  ): Promise<{ success: boolean; error?: string }> {
    // Get pending secret
    const result = await this.db.query(
      `SELECT pending_secret_encrypted, method FROM mfa_secrets WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0]?.pending_secret_encrypted) {
      return { success: false, error: 'No pending MFA setup found' };
    }

    const pendingSecret = result.rows[0].pending_secret_encrypted as string;

    // Decrypt and verify token
    const secretBytes = this.decryptSecret(pendingSecret);
    if (!verifyTotp(secretBytes, token, MFA_CONFIG.totpTimeStep, MFA_CONFIG.totpWindow)) {
      return { success: false, error: 'Invalid verification code' };
    }

    // Move pending secret to active
    await this.db.query(
      `UPDATE mfa_secrets SET
         secret_encrypted = pending_secret_encrypted,
         pending_secret_encrypted = NULL,
         verified_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [userId]
    );

    // Activate pending backup codes
    await this.db.query(
      `UPDATE mfa_backup_codes SET pending = false WHERE user_id = $1 AND pending = true`,
      [userId]
    );

    // Log event
    await this.eventRepo.log({
      userId,
      eventType: 'mfa_enabled',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      details: { method: result.rows[0].method },
    });

    logger.info({ userId }, 'MFA setup completed');

    return { success: true };
  }

  /**
   * Verify MFA token during login
   */
  async verify(userId: string, token: string, context?: AuthContext): Promise<MfaVerifyResult> {
    // Check for lockout
    const lockoutResult = await this.db.query(
      `SELECT failed_attempts, locked_until FROM mfa_secrets WHERE user_id = $1`,
      [userId]
    );

    if (lockoutResult.rows.length === 0) {
      return { success: false, error: 'MFA not configured for this user' };
    }

    const mfaRow = lockoutResult.rows[0]!;
    const lockedUntil = mfaRow.locked_until ? new Date(mfaRow.locked_until as string) : null;

    if (lockedUntil && lockedUntil > new Date()) {
      return {
        success: false,
        error: 'MFA temporarily locked due to too many failed attempts',
        lockedUntil,
      };
    }

    // Try TOTP verification
    const totpResult = await this.verifyTotp(userId, token);
    if (totpResult) {
      // Reset failed attempts
      await this.db.query(
        `UPDATE mfa_secrets SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1`,
        [userId]
      );

      await this.eventRepo.log({
        userId,
        eventType: 'login_success',
        result: 'success',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        details: { mfa: 'totp' },
      });

      return { success: true };
    }

    // Try backup code verification
    const backupResult = await this.verifyBackupCode(userId, token);
    if (backupResult) {
      await this.db.query(
        `UPDATE mfa_secrets SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1`,
        [userId]
      );

      await this.eventRepo.log({
        userId,
        eventType: 'login_success',
        result: 'success',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        details: { mfa: 'backup_code' },
      });

      return { success: true };
    }

    // Increment failed attempts

    const failedAttempts = ((mfaRow.failed_attempts as number) ?? 0) + 1;
    let newLockedUntil: Date | undefined;

    if (failedAttempts >= MFA_CONFIG.maxFailedAttempts) {
      newLockedUntil = new Date(Date.now() + MFA_CONFIG.lockoutMinutes * 60 * 1000);
    }

    await this.db.query(
      `UPDATE mfa_secrets SET
         failed_attempts = $2,
         locked_until = $3
       WHERE user_id = $1`,
      [userId, failedAttempts, newLockedUntil?.toISOString() ?? null]
    );

    await this.eventRepo.log({
      userId,
      eventType: 'login_failure',
      result: 'failure',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      details: { mfa: true, failedAttempts },
    });

    const result: MfaVerifyResult = {
      success: false,
      error: 'Invalid verification code',
      attemptsRemaining: Math.max(0, MFA_CONFIG.maxFailedAttempts - failedAttempts),
    };

    // Only add lockedUntil if it's defined (exactOptionalPropertyTypes compliance)
    if (newLockedUntil) {
      result.lockedUntil = newLockedUntil;
    }

    return result;
  }

  /**
   * Disable MFA for a user (requires password verification first)
   */
  async disable(userId: string, context?: AuthContext): Promise<boolean> {
    await this.db.query(`DELETE FROM mfa_backup_codes WHERE user_id = $1`, [userId]);
    await this.db.query(`DELETE FROM mfa_secrets WHERE user_id = $1`, [userId]);

    await this.eventRepo.log({
      userId,
      eventType: 'mfa_disabled',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    logger.info({ userId }, 'MFA disabled');

    return true;
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string, context?: AuthContext): Promise<string[]> {
    // Delete old backup codes
    await this.db.query(`DELETE FROM mfa_backup_codes WHERE user_id = $1`, [userId]);

    // Generate new backup codes
    const backupCodes = this.generateBackupCodes();
    const backupCodeHashes = backupCodes.map((code) =>
      createHash('sha256').update(code).digest('hex')
    );

    // Store new codes
    for (const hash of backupCodeHashes) {
      await this.db.query(
        `INSERT INTO mfa_backup_codes (user_id, code_hash, pending)
         VALUES ($1, $2, false)`,
        [userId, hash]
      );
    }

    await this.eventRepo.log({
      userId,
      eventType: 'settings_changed',
      result: 'success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      details: { action: 'backup_codes_regenerated' },
    });

    logger.info({ userId }, 'MFA backup codes regenerated');

    return backupCodes;
  }

  // Private methods

  private async verifyTotp(userId: string, token: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT secret_encrypted FROM mfa_secrets WHERE user_id = $1 AND secret_encrypted IS NOT NULL`,
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const secretEncrypted = result.rows[0]!.secret_encrypted as string;
    const secretBytes = this.decryptSecret(secretEncrypted);

    return verifyTotp(secretBytes, token, MFA_CONFIG.totpTimeStep, MFA_CONFIG.totpWindow);
  }

  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const codeHash = createHash('sha256').update(code.replace(/\s/g, '')).digest('hex');

    const result = await this.db.query(
      `UPDATE mfa_backup_codes
       SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL AND pending = false
       RETURNING id`,
      [userId, codeHash]
    );

    return result.rows.length > 0;
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I and O to avoid confusion

    for (let i = 0; i < MFA_CONFIG.backupCodeCount; i++) {
      let code = '';
      const bytes = randomBytes(MFA_CONFIG.backupCodeLength);
      for (let j = 0; j < MFA_CONFIG.backupCodeLength; j++) {
        code += chars.charAt(bytes[j]! % chars.length);
      }
      // Format as XXXX-XXXX for readability
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }

    return codes;
  }

  private encryptSecret(secret: Buffer): string {
    if (!this.encryptionKey) {
      throw new Error('MFA encryption key not configured');
    }

    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptSecret(encryptedData: string): Buffer {
    if (!this.encryptionKey) {
      throw new Error('MFA encryption key not configured');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted secret format');
    }

    const iv = Buffer.from(parts[0]!, 'base64');
    const authTag = Buffer.from(parts[1]!, 'base64');
    const encrypted = Buffer.from(parts[2]!, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

export { generateTotp, verifyTotp, base32Encode, base32Decode };
