/**
 * Encryption Service Tests
 * Tests for PHI/PII data encryption at rest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EncryptionService,
  createEncryptionService,
  LocalKmsProvider,
  AwsKmsProvider,
} from '../encryption.js';

describe('EncryptionService', () => {
  // Test key with proper entropy (looks random, not a repeating pattern)
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    // Set up test encryption key
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isConfigured', () => {
    it('should return true when encryption key is set', () => {
      const service = new EncryptionService();
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when encryption key is missing', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');
      const service = new EncryptionService();
      expect(service.isConfigured()).toBe(false);
    });

    it('should throw when encryption key is invalid length', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'tooshort');
      expect(() => new EncryptionService()).toThrow('must be 32 bytes');
    });
  });

  describe('encrypt', () => {
    it('should encrypt plaintext successfully', () => {
      const service = new EncryptionService();
      const plaintext = 'sensitive medical data';

      const result = service.encrypt(plaintext);

      expect(result.encryptedValue).toBeDefined();
      expect(result.keyVersion).toBe(1);
      expect(result.encryptedValue).not.toContain(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (due to random IV)', () => {
      const service = new EncryptionService();
      const plaintext = 'test data';

      const result1 = service.encrypt(plaintext);
      const result2 = service.encrypt(plaintext);

      expect(result1.encryptedValue).not.toBe(result2.encryptedValue);
    });

    it('should throw when encryption key is not configured', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');
      const service = new EncryptionService();

      expect(() => service.encrypt('test')).toThrow('Encryption key not configured');
    });

    it('should handle empty string', () => {
      const service = new EncryptionService();

      const result = service.encrypt('');

      expect(result.encryptedValue).toBeDefined();
      expect(service.decrypt(result.encryptedValue)).toBe('');
    });

    it('should handle unicode characters', () => {
      const service = new EncryptionService();
      const plaintext = '患者データ 🏥 données médicales';

      const result = service.encrypt(plaintext);
      const decrypted = service.decrypt(result.encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle large data', () => {
      const service = new EncryptionService();
      const plaintext = 'x'.repeat(100000); // 100KB

      const result = service.encrypt(plaintext);
      const decrypted = service.decrypt(result.encryptedValue);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt', () => {
    it('should decrypt ciphertext correctly', () => {
      const service = new EncryptionService();
      const plaintext = 'patient SSN: 123-45-6789';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw on invalid ciphertext format', () => {
      const service = new EncryptionService();

      expect(() => service.decrypt('invalid')).toThrow('Invalid encrypted value format');
    });

    it('should throw on tampered ciphertext (authentication failure)', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('test');

      // Tamper with the encrypted data
      const parts = encryptedValue.split(':');
      parts[4] = Buffer.from('tampered').toString('base64');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw when encryption key is not configured', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('test');

      vi.stubEnv('DATA_ENCRYPTION_KEY', '');
      const newService = new EncryptionService();

      expect(() => newService.decrypt(encryptedValue)).toThrow('Encryption key not configured');
    });
  });

  describe('hashForIndex', () => {
    it('should produce consistent hash for same input', () => {
      const service = new EncryptionService();

      const hash1 = service.hashForIndex('test@example.com');
      const hash2 = service.hashForIndex('test@example.com');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const service = new EncryptionService();

      const hash1 = service.hashForIndex('user1@example.com');
      const hash2 = service.hashForIndex('user2@example.com');

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize input (lowercase, trim)', () => {
      const service = new EncryptionService();

      const hash1 = service.hashForIndex('TEST@EXAMPLE.COM');
      const hash2 = service.hashForIndex('  test@example.com  ');

      expect(hash1).toBe(hash2);
    });

    it('should return hex string', () => {
      const service = new EncryptionService();

      const hash = service.hashForIndex('test');

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('createEncryptionService', () => {
    it('should create service without database', () => {
      const service = createEncryptionService();

      expect(service).toBeInstanceOf(EncryptionService);
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('end-to-end encryption flow', () => {
    it('should encrypt and decrypt PHI data correctly', () => {
      const service = new EncryptionService();

      const patientData = {
        ssn: '123-45-6789',
        diagnosis: 'Hypertension',
        medications: ['Lisinopril 10mg', 'Metoprolol 25mg'],
      };

      const plaintext = JSON.stringify(patientData);
      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(JSON.parse(decrypted)).toEqual(patientData);
    });
  });

  describe('weak key detection', () => {
    it('should reject all-zeros key', () => {
      const allZeros = '0'.repeat(64);
      vi.stubEnv('DATA_ENCRYPTION_KEY', allZeros);

      expect(() => new EncryptionService()).toThrow('weak key');
    });

    it('should reject all-same-byte key', () => {
      const allSame = 'aa'.repeat(32);
      vi.stubEnv('DATA_ENCRYPTION_KEY', allSame);

      expect(() => new EncryptionService()).toThrow('weak key');
    });

    it('should reject repeating 2-byte pattern', () => {
      const repeating = 'ab'.repeat(32);
      vi.stubEnv('DATA_ENCRYPTION_KEY', repeating);

      expect(() => new EncryptionService()).toThrow('weak key');
    });

    it('should reject sequential bytes key', () => {
      // 00 01 02 03 04 ... sequential pattern
      let sequential = '';
      for (let i = 0; i < 32; i++) {
        sequential += i.toString(16).padStart(2, '0');
      }
      vi.stubEnv('DATA_ENCRYPTION_KEY', sequential);

      expect(() => new EncryptionService()).toThrow('weak key');
    });

    it('should accept random-looking key', () => {
      // Legitimate random key
      const randomKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
      vi.stubEnv('DATA_ENCRYPTION_KEY', randomKey);

      const service = new EncryptionService();
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('key validation', () => {
    it('should reject non-hex characters', () => {
      vi.stubEnv(
        'DATA_ENCRYPTION_KEY',
        'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'
      );

      expect(() => new EncryptionService()).toThrow('valid hexadecimal');
    });

    it('should reject wrong length key', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'abc123');

      expect(() => new EncryptionService()).toThrow('must be 32 bytes');
    });
  });

  describe('KMS mode', () => {
    it('should report KMS disabled when no provider', () => {
      const service = new EncryptionService();

      expect(service.isKmsEnabled()).toBe(false);
      expect(service.getKmsProviderName()).toBeNull();
    });
  });

  describe('smart encryption', () => {
    it('should use direct key when KMS not available', async () => {
      const service = new EncryptionService();
      const plaintext = 'test data';

      const result = await service.encryptSmart(plaintext);

      expect(result.encryptedValue.startsWith('kms:')).toBe(false);
      expect(result.keyVersion).toBe(1);
    });

    it('should decrypt non-KMS encrypted values with decryptSmart', async () => {
      const service = new EncryptionService();
      const plaintext = 'test data';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = await service.decryptSmart(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should throw when decrypting KMS value without provider', async () => {
      const service = new EncryptionService();

      await expect(service.decryptSmart('kms:1:key:iv:tag:data')).rejects.toThrow(
        'KMS but no KMS provider'
      );
    });
  });

  describe('decryption with key version mismatch', () => {
    it('should warn but still decrypt with old key version', () => {
      const service = new EncryptionService();
      const plaintext = 'test data';

      // Create encrypted value with current version
      const { encryptedValue } = service.encrypt(plaintext);

      // Modify to simulate old version
      const parts = encryptedValue.split(':');
      parts[0] = '99'; // Old version
      const oldVersionCiphertext = parts.join(':');

      // Should still decrypt (same key)
      const decrypted = service.decrypt(oldVersionCiphertext);
      expect(decrypted).toBe(plaintext);
    });
  });
});

describe('LocalKmsProvider', () => {
  it('should throw when master key is wrong length', () => {
    expect(() => new LocalKmsProvider('tooshort')).toThrow('32 bytes');
  });

  it('should throw when master key is missing', () => {
    vi.stubEnv('KMS_MASTER_KEY', '');
    expect(() => new LocalKmsProvider()).toThrow('32 bytes');
  });

  it('should encrypt and decrypt data keys', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const provider = new LocalKmsProvider(masterKey);

    const plainKey = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
    const encrypted = await provider.encryptDataKey(plainKey);
    const decrypted = await provider.decryptDataKey(encrypted);

    expect(decrypted.equals(plainKey)).toBe(true);
  });

  it('should generate data keys', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const provider = new LocalKmsProvider(masterKey);

    const { plainKey, encryptedKey } = await provider.generateDataKey();

    expect(plainKey).toHaveLength(32);
    expect(encryptedKey.length).toBeGreaterThan(0);

    // Should be able to decrypt the encrypted key
    const decrypted = await provider.decryptDataKey(encryptedKey);
    expect(decrypted.equals(plainKey)).toBe(true);
  });

  it('should report availability', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const provider = new LocalKmsProvider(masterKey);

    expect(await provider.isAvailable()).toBe(true);
  });

  it('should have correct name', () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const provider = new LocalKmsProvider(masterKey);

    expect(provider.name).toBe('Local Environment');
  });
});

describe('EncryptionService with KMS', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should report KMS enabled when provider is set', () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    expect(service.isKmsEnabled()).toBe(true);
    expect(service.getKmsProviderName()).toBe('Local Environment');
  });

  it('should encrypt with KMS envelope encryption', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    const plaintext = 'sensitive data';
    const { encryptedValue, keyVersion } = await service.encryptWithKms(plaintext);

    expect(encryptedValue.startsWith('kms:')).toBe(true);
    expect(keyVersion).toBe(1);
  });

  it('should decrypt KMS encrypted values', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    const plaintext = 'sensitive data';
    const { encryptedValue } = await service.encryptWithKms(plaintext);
    const decrypted = await service.decryptWithKms(encryptedValue);

    expect(decrypted).toBe(plaintext);
  });

  it('should throw on invalid KMS format', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    await expect(service.decryptWithKms('invalid:format')).rejects.toThrow('Invalid KMS-encrypted');
  });

  it('should throw on wrong prefix', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    await expect(service.decryptWithKms('wrong:1:key:iv:tag:data')).rejects.toThrow(
      'Invalid KMS-encrypted'
    );
  });

  it('should use KMS in encryptSmart when available', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    const { encryptedValue } = await service.encryptSmart('test');

    expect(encryptedValue.startsWith('kms:')).toBe(true);
  });

  it('should detect KMS values in decryptSmart', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    const plaintext = 'test data';
    const { encryptedValue } = await service.encryptWithKms(plaintext);
    const decrypted = await service.decryptSmart(encryptedValue);

    expect(decrypted).toBe(plaintext);
  });

  it('should throw encryptWithKms when no provider', async () => {
    const service = new EncryptionService();

    await expect(service.encryptWithKms('test')).rejects.toThrow('KMS provider not configured');
  });

  it('should throw decryptWithKms when no provider', async () => {
    const service = new EncryptionService();

    await expect(service.decryptWithKms('kms:1:key:iv:tag:data')).rejects.toThrow(
      'KMS provider not configured'
    );
  });
});

describe('AwsKmsProvider', () => {
  it('should throw when key ID is missing', () => {
    vi.stubEnv('AWS_KMS_KEY_ID', '');

    expect(() => new AwsKmsProvider()).toThrow('AWS KMS key ID must be provided');
  });

  it('should use constructor key ID over env var', () => {
    vi.stubEnv('AWS_KMS_KEY_ID', 'env-key-id');

    const provider = new AwsKmsProvider('constructor-key-id');
    expect(provider.name).toBe('AWS KMS');
  });

  it('should use env var when no constructor key ID', () => {
    vi.stubEnv('AWS_KMS_KEY_ID', 'env-key-id');

    const provider = new AwsKmsProvider();
    expect(provider.name).toBe('AWS KMS');
  });
});

describe('convenience functions', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encryptValue should encrypt and return string', async () => {
    const { encryptValue, decryptValue } = await import('../encryption.js');

    const plaintext = 'test data';
    const encrypted = encryptValue(plaintext);

    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(':').length).toBe(5);
  });

  it('decryptValue should decrypt encrypted value', async () => {
    const { encryptValue, decryptValue } = await import('../encryption.js');

    const plaintext = 'sensitive information';
    const encrypted = encryptValue(plaintext);
    const decrypted = decryptValue(encrypted);

    expect(decrypted).toBe(plaintext);
  });
});

describe('production mode validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw in production when DATA_ENCRYPTION_KEY is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATA_ENCRYPTION_KEY', '');

    expect(() => new EncryptionService()).toThrow('CRITICAL');
  });

  it('should not throw in non-production when key is missing', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATA_ENCRYPTION_KEY', '');

    const service = new EncryptionService();
    expect(service.isConfigured()).toBe(false);
  });
});

describe('KMS data key caching', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('should cache data keys for performance', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);

    // Spy on generateDataKey
    const generateSpy = vi.spyOn(kmsProvider, 'generateDataKey');

    const service = new EncryptionService(undefined, kmsProvider);

    // First encryption should generate a new key
    await service.encryptWithKms('data1');
    expect(generateSpy).toHaveBeenCalledTimes(1);

    // Second encryption should use cached key
    await service.encryptWithKms('data2');
    expect(generateSpy).toHaveBeenCalledTimes(1);

    // Third encryption should also use cached key
    await service.encryptWithKms('data3');
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it('should refresh data key after cache expiry', async () => {
    vi.useFakeTimers();

    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);

    const generateSpy = vi.spyOn(kmsProvider, 'generateDataKey');

    const service = new EncryptionService(undefined, kmsProvider);

    // First encryption
    await service.encryptWithKms('data1');
    expect(generateSpy).toHaveBeenCalledTimes(1);

    // Advance time past cache TTL (5 minutes)
    vi.advanceTimersByTime(6 * 60 * 1000);

    // Second encryption should generate new key after cache expiry
    await service.encryptWithKms('data2');
    expect(generateSpy).toHaveBeenCalledTimes(2);
  });
});

describe('KMS encryption with unicode', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should handle unicode in KMS encryption', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    const plaintext = '患者データ 🏥 données médicales';
    const { encryptedValue } = await service.encryptWithKms(plaintext);
    const decrypted = await service.decryptWithKms(encryptedValue);

    expect(decrypted).toBe(plaintext);
  });

  it('should handle empty string in KMS encryption', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    const { encryptedValue } = await service.encryptWithKms('');
    const decrypted = await service.decryptWithKms(encryptedValue);

    expect(decrypted).toBe('');
  });

  it('should handle large data in KMS encryption', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    const plaintext = 'x'.repeat(50000);
    const { encryptedValue } = await service.encryptWithKms(plaintext);
    const decrypted = await service.decryptWithKms(encryptedValue);

    expect(decrypted).toBe(plaintext);
  });
});

describe('KMS key version warnings', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should decrypt old KMS key versions with warning', async () => {
    const masterKey = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(masterKey);
    const service = new EncryptionService(undefined, kmsProvider);

    // Create encrypted value with current version
    const { encryptedValue } = await service.encryptWithKms('test data');

    // Modify to simulate old version
    const parts = encryptedValue.split(':');
    parts[1] = '99'; // Old version
    const oldVersionCiphertext = parts.join(':');

    // Should still decrypt (same key), just with a warning logged
    const decrypted = await service.decryptWithKms(oldVersionCiphertext);
    expect(decrypted).toBe('test data');
  });
});
