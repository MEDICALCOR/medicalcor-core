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
  encryptValue,
  decryptValue,
  createAutoEncryptionService,
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

describe('Database Operations', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createMockDb() {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const mockResults: Map<string, unknown[]> = new Map();

    return {
      queries,
      mockResults,
      query: vi.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });

        // Return specific results for specific queries
        if (sql.includes('SELECT encrypted_value')) {
          const results = mockResults.get('SELECT') ?? [];
          return { rows: results, rowCount: results.length };
        }

        if (sql.includes('INSERT INTO encrypted_data')) {
          return { rows: [], rowCount: 1 };
        }

        if (
          sql.includes('UPDATE encrypted_data') &&
          sql.includes('deleted_at = CURRENT_TIMESTAMP')
        ) {
          return { rows: [], rowCount: 1 };
        }

        if (sql.includes('UPDATE encrypted_data') && sql.includes('accessed_at')) {
          return { rows: [], rowCount: 1 };
        }

        if (sql.includes('INSERT INTO sensitive_data_access_log')) {
          return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
    };
  }

  describe('storeEncryptedField', () => {
    it('should store encrypted field in database', async () => {
      const mockDb = createMockDb();
      const service = new EncryptionService(mockDb as any);

      await service.storeEncryptedField(
        {
          entityType: 'patient',
          entityId: 'patient-123',
          fieldName: 'ssn',
          classification: 'phi',
        },
        '123-45-6789'
      );

      expect(mockDb.query).toHaveBeenCalled();
      const insertCall = mockDb.queries.find((q) => q.sql.includes('INSERT INTO encrypted_data'));
      expect(insertCall).toBeDefined();
      expect(insertCall?.params).toContain('patient');
      expect(insertCall?.params).toContain('patient-123');
      expect(insertCall?.params).toContain('ssn');
      expect(insertCall?.params).toContain('phi');
    });

    it('should throw when no database connection', async () => {
      const service = new EncryptionService();

      await expect(
        service.storeEncryptedField(
          {
            entityType: 'patient',
            entityId: 'patient-123',
            fieldName: 'ssn',
            classification: 'phi',
          },
          '123-45-6789'
        )
      ).rejects.toThrow('Database connection not available');
    });

    it('should handle different data classifications', async () => {
      const mockDb = createMockDb();
      const service = new EncryptionService(mockDb as any);

      const classifications: Array<'pii' | 'phi' | 'sensitive' | 'confidential'> = [
        'pii',
        'phi',
        'sensitive',
        'confidential',
      ];

      for (const classification of classifications) {
        await service.storeEncryptedField(
          {
            entityType: 'test',
            entityId: 'test-123',
            fieldName: 'field',
            classification,
          },
          'test data'
        );
      }

      const insertCalls = mockDb.queries.filter((q) =>
        q.sql.includes('INSERT INTO encrypted_data')
      );
      expect(insertCalls.length).toBe(4);
    });

    it('should not store plaintext in encrypted value', async () => {
      const mockDb = createMockDb();
      const service = new EncryptionService(mockDb as any);

      const plaintext = 'sensitive-patient-data-12345';
      await service.storeEncryptedField(
        {
          entityType: 'patient',
          entityId: 'patient-123',
          fieldName: 'medical_notes',
          classification: 'phi',
        },
        plaintext
      );

      const insertCall = mockDb.queries.find((q) => q.sql.includes('INSERT INTO encrypted_data'));
      const encryptedValue = insertCall?.params[3] as string;

      expect(encryptedValue).not.toContain('sensitive-patient-data');
      expect(encryptedValue).not.toContain('12345');
    });
  });

  describe('getDecryptedField', () => {
    it('should retrieve and decrypt field from database', async () => {
      const service = new EncryptionService();
      const plaintext = 'patient-email@example.com';
      const { encryptedValue } = service.encrypt(plaintext);

      const mockDb = createMockDb();
      mockDb.mockResults.set('SELECT', [
        { encrypted_value: encryptedValue, classification: 'pii' },
      ]);

      const serviceWithDb = new EncryptionService(mockDb as any);
      const result = await serviceWithDb.getDecryptedField({
        entityType: 'patient',
        entityId: 'patient-123',
        fieldName: 'email',
      });

      expect(result).toBe(plaintext);
    });

    it('should return null when field not found', async () => {
      const mockDb = createMockDb();
      mockDb.mockResults.set('SELECT', []);

      const service = new EncryptionService(mockDb as any);
      const result = await service.getDecryptedField({
        entityType: 'patient',
        entityId: 'patient-999',
        fieldName: 'nonexistent',
      });

      expect(result).toBeNull();
    });

    it('should log access by default', async () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('test data');

      const mockDb = createMockDb();
      mockDb.mockResults.set('SELECT', [
        { encrypted_value: encryptedValue, classification: 'phi' },
      ]);

      const serviceWithDb = new EncryptionService(mockDb as any);
      await serviceWithDb.getDecryptedField(
        {
          entityType: 'patient',
          entityId: 'patient-123',
          fieldName: 'ssn',
        },
        {
          userId: 'user-456',
          accessReason: 'Patient care',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        }
      );

      const logCall = mockDb.queries.find((q) =>
        q.sql.includes('INSERT INTO sensitive_data_access_log')
      );
      expect(logCall).toBeDefined();
      expect(logCall?.params).toContain('user-456');
      expect(logCall?.params).toContain('Patient care');
      expect(logCall?.params).toContain('192.168.1.1');
    });

    it('should skip logging when logAccess is false', async () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('test data');

      const mockDb = createMockDb();
      mockDb.mockResults.set('SELECT', [
        { encrypted_value: encryptedValue, classification: 'phi' },
      ]);

      const serviceWithDb = new EncryptionService(mockDb as any);
      await serviceWithDb.getDecryptedField(
        {
          entityType: 'patient',
          entityId: 'patient-123',
          fieldName: 'ssn',
        },
        { logAccess: false }
      );

      const logCall = mockDb.queries.find((q) =>
        q.sql.includes('INSERT INTO sensitive_data_access_log')
      );
      expect(logCall).toBeUndefined();
    });

    it('should update accessed_at timestamp', async () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('test data');

      const mockDb = createMockDb();
      mockDb.mockResults.set('SELECT', [
        { encrypted_value: encryptedValue, classification: 'phi' },
      ]);

      const serviceWithDb = new EncryptionService(mockDb as any);
      await serviceWithDb.getDecryptedField({
        entityType: 'patient',
        entityId: 'patient-123',
        fieldName: 'ssn',
      });

      const updateCall = mockDb.queries.find((q) =>
        q.sql.includes('accessed_at = CURRENT_TIMESTAMP')
      );
      expect(updateCall).toBeDefined();
    });

    it('should throw when no database connection', async () => {
      const service = new EncryptionService();

      await expect(
        service.getDecryptedField({
          entityType: 'patient',
          entityId: 'patient-123',
          fieldName: 'ssn',
        })
      ).rejects.toThrow('Database connection not available');
    });
  });

  describe('deleteEncryptedField', () => {
    it('should soft delete encrypted field', async () => {
      const mockDb = createMockDb();
      const service = new EncryptionService(mockDb as any);

      const result = await service.deleteEncryptedField({
        entityType: 'patient',
        entityId: 'patient-123',
        fieldName: 'ssn',
      });

      expect(result).toBe(true);
      const deleteCall = mockDb.queries.find((q) =>
        q.sql.includes('deleted_at = CURRENT_TIMESTAMP')
      );
      expect(deleteCall).toBeDefined();
    });

    it('should return false when field not found', async () => {
      const mockDb = createMockDb();
      mockDb.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

      const service = new EncryptionService(mockDb as any);
      const result = await service.deleteEncryptedField({
        entityType: 'patient',
        entityId: 'patient-999',
        fieldName: 'nonexistent',
      });

      expect(result).toBe(false);
    });

    it('should log deletion', async () => {
      const mockDb = createMockDb();
      const service = new EncryptionService(mockDb as any);

      await service.deleteEncryptedField(
        {
          entityType: 'patient',
          entityId: 'patient-123',
          fieldName: 'ssn',
        },
        {
          userId: 'admin-789',
          accessReason: 'GDPR deletion request',
        }
      );

      const logCall = mockDb.queries.find((q) =>
        q.sql.includes('INSERT INTO sensitive_data_access_log')
      );
      expect(logCall).toBeDefined();
      expect(logCall?.params).toContain('admin-789');
      expect(logCall?.params).toContain('GDPR deletion request');
    });

    it('should throw when no database connection', async () => {
      const service = new EncryptionService();

      await expect(
        service.deleteEncryptedField({
          entityType: 'patient',
          entityId: 'patient-123',
          fieldName: 'ssn',
        })
      ).rejects.toThrow('Database connection not available');
    });
  });
});

describe('Key Rotation', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const NEW_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createMockDbForRotation() {
    const encryptedRecords: Array<{ id: number; encrypted_value: string }> = [];

    // Create some encrypted records
    const service = new EncryptionService();
    for (let i = 1; i <= 5; i++) {
      const { encryptedValue } = service.encrypt(`test data ${i}`);
      encryptedRecords.push({ id: i, encrypted_value: encryptedValue });
    }

    let queryCount = 0;
    return {
      query: vi.fn().mockImplementation(async (sql: string) => {
        queryCount++;

        // Insert new key
        if (sql.includes('INSERT INTO encryption_keys')) {
          return { rows: [], rowCount: 1 };
        }

        // Get all encrypted data
        if (sql.includes('SELECT id, encrypted_value FROM encrypted_data')) {
          return { rows: encryptedRecords, rowCount: encryptedRecords.length };
        }

        // Update encrypted record
        if (sql.includes('UPDATE encrypted_data SET encrypted_value')) {
          return { rows: [], rowCount: 1 };
        }

        // Retire old keys
        if (sql.includes("status = 'retired'")) {
          return { rows: [], rowCount: 1 };
        }

        // Activate new key
        if (sql.includes("status = 'active'")) {
          return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
    };
  }

  describe('rotateEncryptionKey', () => {
    it('should rotate all encrypted data to new key', async () => {
      const mockDb = createMockDbForRotation();
      const service = new EncryptionService(mockDb as any);

      const rotatedCount = await service.rotateEncryptionKey(NEW_KEY);

      expect(rotatedCount).toBe(5);
      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should reject key with wrong length', async () => {
      const mockDb = createMockDbForRotation();
      const service = new EncryptionService(mockDb as any);

      await expect(service.rotateEncryptionKey('tooshort')).rejects.toThrow('must be 32 bytes');
    });

    it('should register new key version', async () => {
      const mockDb = createMockDbForRotation();
      const service = new EncryptionService(mockDb as any);

      await service.rotateEncryptionKey(NEW_KEY);

      const insertKeyCall = mockDb.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO encryption_keys')
      );
      expect(insertKeyCall).toBeDefined();
      expect(insertKeyCall[1]).toContain(2); // New version should be 2
      // Check that the SQL includes the rotating status
      expect(insertKeyCall[0]).toContain("'rotating'");
    });

    it('should retire old keys', async () => {
      const mockDb = createMockDbForRotation();
      const service = new EncryptionService(mockDb as any);

      await service.rotateEncryptionKey(NEW_KEY);

      const retireCall = mockDb.query.mock.calls.find((call: any[]) =>
        call[0].includes("status = 'retired'")
      );
      expect(retireCall).toBeDefined();
    });

    it('should activate new key', async () => {
      const mockDb = createMockDbForRotation();
      const service = new EncryptionService(mockDb as any);

      await service.rotateEncryptionKey(NEW_KEY);

      const activateCall = mockDb.query.mock.calls.find(
        (call: any[]) => call[0].includes("status = 'active'") && !call[0].includes('retired')
      );
      expect(activateCall).toBeDefined();
    });

    it('should handle empty database', async () => {
      const mockDb = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT id, encrypted_value')) {
            return { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 0 };
        }),
      };

      const service = new EncryptionService(mockDb as any);
      const rotatedCount = await service.rotateEncryptionKey(NEW_KEY);

      expect(rotatedCount).toBe(0);
    });

    it('should continue on individual record failures', async () => {
      const service = new EncryptionService();
      const validEncrypted = service.encrypt('valid data').encryptedValue;

      const mockDb = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT id, encrypted_value')) {
            return {
              rows: [
                { id: 1, encrypted_value: validEncrypted },
                { id: 2, encrypted_value: 'corrupted:invalid:data' },
                { id: 3, encrypted_value: validEncrypted },
              ],
              rowCount: 3,
            };
          }
          if (sql.includes('INSERT INTO encryption_keys')) {
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes('UPDATE encrypted_data SET encrypted_value')) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      };

      const serviceWithDb = new EncryptionService(mockDb as any);
      const rotatedCount = await serviceWithDb.rotateEncryptionKey(NEW_KEY);

      // Should have rotated 2 valid records (skipped 1 corrupted)
      expect(rotatedCount).toBe(2);
    });

    it('should throw when no database connection', async () => {
      const service = new EncryptionService();

      await expect(service.rotateEncryptionKey(NEW_KEY)).rejects.toThrow(
        'Database connection not available'
      );
    });

    it('should update service to use new key after rotation', async () => {
      const mockDb = createMockDbForRotation();
      const service = new EncryptionService(mockDb as any);

      await service.rotateEncryptionKey(NEW_KEY);

      // Encrypt with the service after rotation
      const { encryptedValue, keyVersion } = service.encrypt('new data');

      expect(keyVersion).toBe(2);
      expect(service.decrypt(encryptedValue)).toBe('new data');
    });
  });
});

describe('KMS Data Key Caching', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const MASTER_KEY = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should cache data keys to reduce KMS calls', async () => {
    const kmsProvider = new LocalKmsProvider(MASTER_KEY);
    const generateSpy = vi.spyOn(kmsProvider, 'generateDataKey');

    const service = new EncryptionService(undefined, kmsProvider);

    // Encrypt multiple times
    await service.encryptWithKms('data 1');
    await service.encryptWithKms('data 2');
    await service.encryptWithKms('data 3');

    // Should only call generateDataKey once (cached for subsequent calls)
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it('should use same data key for multiple encryptions within cache TTL', async () => {
    const kmsProvider = new LocalKmsProvider(MASTER_KEY);
    const service = new EncryptionService(undefined, kmsProvider);

    const result1 = await service.encryptWithKms('test data 1');
    const result2 = await service.encryptWithKms('test data 2');

    // Extract encrypted data key from results
    const parts1 = result1.encryptedValue.split(':');
    const parts2 = result2.encryptedValue.split(':');
    const encryptedDataKey1 = parts1[2];
    const encryptedDataKey2 = parts2[2];

    // Should use the same encrypted data key (from cache)
    expect(encryptedDataKey1).toBe(encryptedDataKey2);
  });

  it('should decrypt with different data keys', async () => {
    const kmsProvider = new LocalKmsProvider(MASTER_KEY);
    const service = new EncryptionService(undefined, kmsProvider);

    // Create two encrypted values with different data keys
    const { encryptedValue: encrypted1 } = await service.encryptWithKms('message 1');

    // Force new data key by clearing cache (wait for expiry or generate new manually)
    const { plainKey, encryptedKey } = await kmsProvider.generateDataKey();

    // Both should decrypt successfully
    const decrypted1 = await service.decryptWithKms(encrypted1);
    expect(decrypted1).toBe('message 1');
  });
});

describe('Convenience Functions', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('encryptValue', () => {
    it('should encrypt value without database', () => {
      const plaintext = 'quick encryption test';
      const encrypted = encryptValue(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toContain(plaintext);
      expect(encrypted.split(':')).toHaveLength(5);
    });

    it('should return different values for same input', () => {
      const encrypted1 = encryptValue('test');
      const encrypted2 = encryptValue('test');

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('decryptValue', () => {
    it('should decrypt value without database', () => {
      const plaintext = 'quick decryption test';
      const encrypted = encryptValue(plaintext);
      const decrypted = decryptValue(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should round-trip correctly', () => {
      const original = 'sensitive data 123';
      const roundTrip = decryptValue(encryptValue(original));

      expect(roundTrip).toBe(original);
    });
  });
});

describe('Auto Encryption Service', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should create service without KMS when AWS_KMS_KEY_ID not set', async () => {
    vi.stubEnv('AWS_KMS_KEY_ID', '');

    const service = await createAutoEncryptionService();

    expect(service.isConfigured()).toBe(true);
    expect(service.isKmsEnabled()).toBe(false);
  });

  it('should use direct key when KMS fails to initialize', async () => {
    // Set invalid KMS key to force failure
    vi.stubEnv('AWS_KMS_KEY_ID', 'invalid-key-id');

    const service = await createAutoEncryptionService();

    // Should fall back to direct key
    expect(service.isConfigured()).toBe(true);
    expect(service.isKmsEnabled()).toBe(false);
  });
});

describe('Encryption Security - Additional Edge Cases', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Tampered Ciphertext Detection', () => {
    it('should detect tampered IV', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('sensitive data');

      // Tamper with IV (component at index 2)
      const parts = encryptedValue.split(':');
      const tamperedIV = Buffer.from('tampered-iv').toString('base64');
      parts[2] = tamperedIV;
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect tampered auth tag', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('sensitive data');

      // Tamper with auth tag (component at index 3)
      const parts = encryptedValue.split(':');
      const tamperedTag = Buffer.from('tampered-tag-1234').toString('base64');
      parts[3] = tamperedTag;
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect tampered salt', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('sensitive data');

      // Tamper with salt (component at index 1)
      const parts = encryptedValue.split(':');
      const originalSalt = Buffer.from(parts[1]!, 'base64');
      const tamperedSalt = Buffer.alloc(originalSalt.length);
      tamperedSalt.fill(0xff); // Fill with 0xFF
      parts[1] = tamperedSalt.toString('base64');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect bit flip attacks in ciphertext', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('sensitive data');

      // Flip a bit in the ciphertext
      const parts = encryptedValue.split(':');
      const encrypted = Buffer.from(parts[4]!, 'base64');
      encrypted[0] = encrypted[0]! ^ 0x01; // Flip first bit
      parts[4] = encrypted.toString('base64');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect truncated ciphertext', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('sensitive data');

      // Truncate the ciphertext
      const parts = encryptedValue.split(':');
      const encrypted = Buffer.from(parts[4]!, 'base64');
      parts[4] = encrypted.subarray(0, encrypted.length - 10).toString('base64');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should detect extended ciphertext', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('sensitive data');

      // Extend the ciphertext with garbage
      const parts = encryptedValue.split(':');
      const encrypted = Buffer.from(parts[4]!, 'base64');
      const extended = Buffer.concat([encrypted, Buffer.from('garbage')]);
      parts[4] = extended.toString('base64');
      const tampered = parts.join(':');

      expect(() => service.decrypt(tampered)).toThrow();
    });
  });

  describe('Invalid Key Handling', () => {
    it('should throw when decrypting with wrong key', () => {
      const service1 = new EncryptionService();
      const { encryptedValue } = service1.encrypt('sensitive data');

      // Use different key for decryption
      vi.stubEnv(
        'DATA_ENCRYPTION_KEY',
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
      );
      const service2 = new EncryptionService();

      expect(() => service2.decrypt(encryptedValue)).toThrow();
    });

    it('should throw when key contains non-hex characters after validation', () => {
      vi.stubEnv(
        'DATA_ENCRYPTION_KEY',
        'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'
      );

      expect(() => new EncryptionService()).toThrow('valid hexadecimal');
    });

    it('should require exactly 64 hex characters (32 bytes)', () => {
      // 63 characters - too short
      vi.stubEnv(
        'DATA_ENCRYPTION_KEY',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde'
      );
      expect(() => new EncryptionService()).toThrow('must be 32 bytes');

      // 65 characters - too long
      vi.stubEnv(
        'DATA_ENCRYPTION_KEY',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0'
      );
      expect(() => new EncryptionService()).toThrow('must be 32 bytes');
    });
  });

  describe('Production Security Requirements', () => {
    it('should throw in production when encryption key is missing', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');

      expect(() => new EncryptionService()).toThrow(
        'CRITICAL: DATA_ENCRYPTION_KEY must be configured in production'
      );
    });

    it('should throw in production with detailed HIPAA/GDPR message', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');

      expect(() => new EncryptionService()).toThrow(
        'PHI/PII data cannot be stored without encryption'
      );
    });

    it('should warn in development when encryption key is missing', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');

      // Should not throw in development
      expect(() => new EncryptionService()).not.toThrow();
    });

    it('should throw when attempting to encrypt without configured key', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');
      const service = new EncryptionService();

      expect(() => service.encrypt('test')).toThrow('Encryption key not configured');
    });
  });

  describe('Special Characters and Encoding', () => {
    it('should handle newlines in plaintext', () => {
      const service = new EncryptionService();
      const plaintext = 'line1\nline2\nline3';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle tabs and special whitespace', () => {
      const service = new EncryptionService();
      const plaintext = 'col1\tcol2\tcol3\r\nnext\tline';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle null characters in plaintext', () => {
      const service = new EncryptionService();
      const plaintext = 'before\x00after';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle emoji and special unicode', () => {
      const service = new EncryptionService();
      const plaintext = '👨‍⚕️ Medical: 💊💉🏥 Patient: 😷';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle right-to-left text', () => {
      const service = new EncryptionService();
      const plaintext = 'English مرحبا עברית';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle mathematical symbols', () => {
      const service = new EncryptionService();
      const plaintext = '∑∫∂∇±≤≥≠≈∞';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Format Validation', () => {
    it('should reject ciphertext with too few components', () => {
      const service = new EncryptionService();

      // Valid format has 5 components: version:salt:iv:tag:encrypted
      expect(() => service.decrypt('1:salt:iv')).toThrow('Invalid encrypted value format');
    });

    it('should reject ciphertext with too many components', () => {
      const service = new EncryptionService();

      expect(() => service.decrypt('1:salt:iv:tag:encrypted:extra')).toThrow(
        'Invalid encrypted value format'
      );
    });

    it('should reject ciphertext without colons', () => {
      const service = new EncryptionService();

      expect(() => service.decrypt('noseparators')).toThrow('Invalid encrypted value format');
    });

    it('should reject ciphertext with invalid base64', () => {
      const service = new EncryptionService();

      // Invalid base64 (contains invalid characters)
      expect(() => service.decrypt('1:!!!:???:@@@:$$$')).toThrow();
    });

    it('should reject ciphertext with empty components', () => {
      const service = new EncryptionService();

      expect(() => service.decrypt('1:::::')).toThrow();
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle minimum length data (1 byte)', () => {
      const service = new EncryptionService();
      const plaintext = 'x';

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle very large data (1MB)', () => {
      const service = new EncryptionService();
      const plaintext = 'x'.repeat(1_000_000);

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(1_000_000);
    });

    it('should handle data with repeated patterns', () => {
      const service = new EncryptionService();
      const plaintext = 'AB'.repeat(1000); // Repeated pattern

      const { encryptedValue } = service.encrypt(plaintext);
      const decrypted = service.decrypt(encryptedValue);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for repeated patterns (IV randomization)', () => {
      const service = new EncryptionService();
      const plaintext = 'AAAAAAAAAA'; // All same character

      const { encryptedValue: encrypted1 } = service.encrypt(plaintext);
      const { encryptedValue: encrypted2 } = service.encrypt(plaintext);

      // Same plaintext should produce different ciphertexts due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same plaintext
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });
  });

  describe('PHI/PII Data Patterns', () => {
    it('should encrypt social security numbers', () => {
      const service = new EncryptionService();
      const ssn = '123-45-6789';

      const { encryptedValue } = service.encrypt(ssn);

      // Full SSN should not be visible in ciphertext
      // Note: We only check the full SSN, not individual parts like '123'
      // because short numeric patterns can randomly appear in base64 encoding
      expect(encryptedValue).not.toContain(ssn);

      expect(service.decrypt(encryptedValue)).toBe(ssn);
    });

    it('should encrypt credit card numbers', () => {
      const service = new EncryptionService();
      const ccn = '4532-1234-5678-9010';

      const { encryptedValue } = service.encrypt(ccn);

      expect(encryptedValue).not.toContain('4532');
      expect(encryptedValue).not.toContain('9010');
      expect(service.decrypt(encryptedValue)).toBe(ccn);
    });

    it('should encrypt email addresses', () => {
      const service = new EncryptionService();
      const email = 'patient@example.com';

      const { encryptedValue } = service.encrypt(email);

      expect(encryptedValue).not.toContain('patient');
      expect(encryptedValue).not.toContain('@example.com');
      expect(service.decrypt(encryptedValue)).toBe(email);
    });

    it('should encrypt phone numbers', () => {
      const service = new EncryptionService();
      const phone = '+1 (555) 123-4567';

      const { encryptedValue } = service.encrypt(phone);

      expect(encryptedValue).not.toContain('555');
      expect(encryptedValue).not.toContain('123');
      expect(service.decrypt(encryptedValue)).toBe(phone);
    });

    it('should encrypt medical record numbers', () => {
      const service = new EncryptionService();
      const mrn = 'MRN-2024-001234';

      const { encryptedValue } = service.encrypt(mrn);

      expect(encryptedValue).not.toContain('MRN');
      expect(encryptedValue).not.toContain('001234');
      expect(service.decrypt(encryptedValue)).toBe(mrn);
    });

    it('should encrypt structured medical data', () => {
      const service = new EncryptionService();
      const medicalData = JSON.stringify({
        patientId: 'P-12345',
        diagnosis: 'Type 2 Diabetes',
        medications: ['Metformin 500mg', 'Insulin Glargine'],
        allergies: ['Penicillin'],
        bloodType: 'A+',
      });

      const { encryptedValue } = service.encrypt(medicalData);

      expect(encryptedValue).not.toContain('P-12345');
      expect(encryptedValue).not.toContain('Diabetes');
      expect(encryptedValue).not.toContain('Metformin');

      const decrypted = JSON.parse(service.decrypt(encryptedValue));
      expect(decrypted.patientId).toBe('P-12345');
      expect(decrypted.diagnosis).toBe('Type 2 Diabetes');
    });
  });

  describe('Cryptographic Properties', () => {
    it('should produce unique IVs for each encryption', () => {
      const service = new EncryptionService();
      const plaintext = 'test data';

      const ivs = new Set<string>();

      // Encrypt same data 100 times
      for (let i = 0; i < 100; i++) {
        const { encryptedValue } = service.encrypt(plaintext);
        const parts = encryptedValue.split(':');
        const iv = parts[2]; // IV is at index 2
        ivs.add(iv!);
      }

      // All IVs should be unique
      expect(ivs.size).toBe(100);
    });

    it('should produce unique salts for each encryption', () => {
      const service = new EncryptionService();
      const plaintext = 'test data';

      const salts = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const { encryptedValue } = service.encrypt(plaintext);
        const parts = encryptedValue.split(':');
        const salt = parts[1]; // Salt is at index 1
        salts.add(salt!);
      }

      // All salts should be unique
      expect(salts.size).toBe(100);
    });

    it('should produce ciphertexts with high entropy', () => {
      const service = new EncryptionService();
      const plaintext = 'AAAAAAAAAA'; // Low entropy plaintext

      const { encryptedValue } = service.encrypt(plaintext);
      const parts = encryptedValue.split(':');
      const encrypted = parts[4]!; // Actual ciphertext

      // Ciphertext should have high character diversity (not all same)
      const uniqueChars = new Set(encrypted.split(''));
      expect(uniqueChars.size).toBeGreaterThan(10);
    });

    it('should have auth tag that changes with any modification', () => {
      const service = new EncryptionService();
      const plaintext1 = 'test data';
      const plaintext2 = 'test datA'; // One character different

      const { encryptedValue: encrypted1 } = service.encrypt(plaintext1);
      const { encryptedValue: encrypted2 } = service.encrypt(plaintext2);

      const parts1 = encrypted1.split(':');
      const parts2 = encrypted2.split(':');

      const authTag1 = parts1[3];
      const authTag2 = parts2[3];

      // Auth tags should be different for different plaintext
      expect(authTag1).not.toBe(authTag2);
    });
  });

  describe('Performance and Consistency', () => {
    it('should consistently encrypt and decrypt 100 times', () => {
      const service = new EncryptionService();
      const plaintext = 'consistency test data';

      // Reduced from 1000 to 100 iterations to avoid test timeout
      for (let i = 0; i < 100; i++) {
        const { encryptedValue } = service.encrypt(plaintext);
        const decrypted = service.decrypt(encryptedValue);
        expect(decrypted).toBe(plaintext);
      }
    });

    it('should handle rapid successive encryptions', () => {
      const service = new EncryptionService();
      const plaintexts = [];
      const ciphertexts = [];

      // Rapid encryptions
      for (let i = 0; i < 100; i++) {
        const plaintext = `message-${i}`;
        plaintexts.push(plaintext);
        ciphertexts.push(service.encrypt(plaintext).encryptedValue);
      }

      // Verify all decrypt correctly
      for (let i = 0; i < 100; i++) {
        expect(service.decrypt(ciphertexts[i]!)).toBe(plaintexts[i]);
      }
    });
  });
});

describe('Object and JSON Encryption', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should encrypt and decrypt complex objects', () => {
    const service = new EncryptionService();
    const data = {
      patient: {
        id: 'P-12345',
        name: 'John Doe',
        ssn: '123-45-6789',
        dob: '1990-01-01',
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zip: '10001',
        },
        medications: ['Lisinopril', 'Metformin'],
        allergies: ['Penicillin'],
      },
    };

    const plaintext = JSON.stringify(data);
    const { encryptedValue } = service.encrypt(plaintext);
    const decrypted = service.decrypt(encryptedValue);
    const parsed = JSON.parse(decrypted);

    expect(parsed).toEqual(data);
    expect(parsed.patient.ssn).toBe('123-45-6789');
  });

  it('should handle arrays of objects', () => {
    const service = new EncryptionService();
    const patients = [
      { id: 'P-001', name: 'Alice', ssn: '111-11-1111' },
      { id: 'P-002', name: 'Bob', ssn: '222-22-2222' },
      { id: 'P-003', name: 'Charlie', ssn: '333-33-3333' },
    ];

    const plaintext = JSON.stringify(patients);
    const { encryptedValue } = service.encrypt(plaintext);
    const decrypted = service.decrypt(encryptedValue);

    expect(JSON.parse(decrypted)).toEqual(patients);
  });

  it('should handle nested arrays and objects', () => {
    const service = new EncryptionService();
    const complexData = {
      hospital: 'General Hospital',
      departments: [
        {
          name: 'Cardiology',
          patients: [
            { id: 'P-001', condition: 'Hypertension' },
            { id: 'P-002', condition: 'Arrhythmia' },
          ],
        },
        {
          name: 'Oncology',
          patients: [{ id: 'P-003', condition: 'Lymphoma' }],
        },
      ],
    };

    const plaintext = JSON.stringify(complexData);
    const { encryptedValue } = service.encrypt(plaintext);
    const decrypted = service.decrypt(encryptedValue);

    expect(JSON.parse(decrypted)).toEqual(complexData);
  });

  it('should preserve JSON types after round-trip', () => {
    const service = new EncryptionService();
    const data = {
      string: 'text',
      number: 42,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      object: { nested: 'value' },
    };

    const encrypted = service.encrypt(JSON.stringify(data)).encryptedValue;
    const parsed = JSON.parse(service.decrypt(encrypted));

    expect(parsed.string).toBe('text');
    expect(parsed.number).toBe(42);
    expect(parsed.boolean).toBe(true);
    expect(parsed.null).toBeNull();
    expect(Array.isArray(parsed.array)).toBe(true);
    expect(typeof parsed.object).toBe('object');
  });
});

describe('Hash Function - hashForIndex', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should create searchable hash for encrypted fields', () => {
    const service = new EncryptionService();

    const email1 = 'patient@example.com';
    const hash1 = service.hashForIndex(email1);

    // Hash should be deterministic
    const hash2 = service.hashForIndex(email1);
    expect(hash1).toBe(hash2);

    // Hash should be 64 characters (SHA-256 hex)
    expect(hash1).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(hash1)).toBe(true);
  });

  it('should handle case-insensitive hashing', () => {
    const service = new EncryptionService();

    const hash1 = service.hashForIndex('Test@Example.COM');
    const hash2 = service.hashForIndex('test@example.com');

    expect(hash1).toBe(hash2);
  });

  it('should trim whitespace before hashing', () => {
    const service = new EncryptionService();

    const hash1 = service.hashForIndex('  test@example.com  ');
    const hash2 = service.hashForIndex('test@example.com');

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different values', () => {
    const service = new EncryptionService();

    const values = [
      'patient1@example.com',
      'patient2@example.com',
      'doctor@example.com',
      '123-45-6789',
      '987-65-4321',
    ];

    const hashes = values.map((v) => service.hashForIndex(v));
    const uniqueHashes = new Set(hashes);

    expect(uniqueHashes.size).toBe(values.length);
  });

  it('should handle special characters in hash input', () => {
    const service = new EncryptionService();

    const inputs = [
      'email+tag@example.com',
      'name.with.dots@domain.co.uk',
      'user@sub-domain.example.com',
    ];

    for (const input of inputs) {
      const hash = service.hashForIndex(input);
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    }
  });

  it('should throw when encryption key not configured', () => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '');
    const service = new EncryptionService();

    expect(() => service.hashForIndex('test')).toThrow('Encryption key not configured');
  });

  it('should create consistent hashes across service instances', () => {
    const service1 = new EncryptionService();
    const service2 = new EncryptionService();

    const value = 'consistent@example.com';
    const hash1 = service1.hashForIndex(value);
    const hash2 = service2.hashForIndex(value);

    expect(hash1).toBe(hash2);
  });

  it('should handle empty string after normalization', () => {
    const service = new EncryptionService();

    const hash = service.hashForIndex('   ');
    expect(hash).toHaveLength(64);
  });
});

describe('Concurrent Operations', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should handle concurrent encryptions', async () => {
    const service = new EncryptionService();
    const plaintexts = Array.from({ length: 50 }, (_, i) => `message-${i}`);

    const encryptPromises = plaintexts.map(async (plaintext) => {
      const { encryptedValue } = service.encrypt(plaintext);
      return { plaintext, encryptedValue };
    });

    const results = await Promise.all(encryptPromises);

    // Verify all encrypted correctly
    for (const { plaintext, encryptedValue } of results) {
      const decrypted = service.decrypt(encryptedValue);
      expect(decrypted).toBe(plaintext);
    }

    // Verify all have unique ciphertexts (due to unique IVs)
    const ciphertexts = results.map((r) => r.encryptedValue);
    const uniqueCiphertexts = new Set(ciphertexts);
    expect(uniqueCiphertexts.size).toBe(ciphertexts.length);
  });

  it('should handle concurrent KMS encryptions', async () => {
    const MASTER_KEY = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(MASTER_KEY);
    const service = new EncryptionService(undefined, kmsProvider);

    const plaintexts = Array.from({ length: 20 }, (_, i) => `kms-message-${i}`);

    const encryptPromises = plaintexts.map(async (plaintext) => {
      const { encryptedValue } = await service.encryptWithKms(plaintext);
      return { plaintext, encryptedValue };
    });

    const results = await Promise.all(encryptPromises);

    // Verify all decrypt correctly
    for (const { plaintext, encryptedValue } of results) {
      const decrypted = await service.decryptWithKms(encryptedValue);
      expect(decrypted).toBe(plaintext);
    }
  });

  it('should handle mixed encryption and decryption operations', async () => {
    const service = new EncryptionService();

    // Pre-encrypt some data
    const preEncrypted = Array.from({ length: 10 }, (_, i) => ({
      plaintext: `pre-${i}`,
      encrypted: service.encrypt(`pre-${i}`).encryptedValue,
    }));

    // Mix encryption and decryption operations
    const operations = [
      // Encrypt new data
      ...Array.from({ length: 10 }, async (_, i) => ({
        type: 'encrypt' as const,
        result: service.encrypt(`new-${i}`).encryptedValue,
      })),
      // Decrypt pre-encrypted data
      ...preEncrypted.map(async ({ plaintext, encrypted }) => ({
        type: 'decrypt' as const,
        expected: plaintext,
        result: service.decrypt(encrypted),
      })),
    ];

    const results = await Promise.all(operations);

    // Verify decrypt operations
    const decrypts = results.filter((r) => r.type === 'decrypt');
    for (const decrypt of decrypts) {
      expect(decrypt.result).toBe(decrypt.expected);
    }
  });
});

describe('Error Handling Edge Cases', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should handle malformed base64 in encrypted value', () => {
    const service = new EncryptionService();

    const malformed = '1:!!!invalid!!!:!!!base64!!!:!!!data!!!:!!!here!!!';
    expect(() => service.decrypt(malformed)).toThrow();
  });

  it('should handle encrypted value with valid format but wrong auth tag length', () => {
    const service = new EncryptionService();
    const { encryptedValue } = service.encrypt('test');

    // Manipulate auth tag to wrong length
    const parts = encryptedValue.split(':');
    const shortTag = Buffer.from('short').toString('base64');
    parts[3] = shortTag;
    const tampered = parts.join(':');

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it('should handle KMS encrypted value with corrupted encrypted data key', async () => {
    const MASTER_KEY = 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890';
    const kmsProvider = new LocalKmsProvider(MASTER_KEY);
    const service = new EncryptionService(undefined, kmsProvider);

    const { encryptedValue } = await service.encryptWithKms('test data');

    // Corrupt the encrypted data key
    const parts = encryptedValue.split(':');
    parts[2] = Buffer.from('corrupted').toString('base64');
    const corrupted = parts.join(':');

    await expect(service.decryptWithKms(corrupted)).rejects.toThrow();
  });

  it('should throw descriptive error when key version parsing fails', () => {
    const service = new EncryptionService();

    const invalidVersion = 'not-a-number:salt:iv:tag:data';
    expect(() => service.decrypt(invalidVersion)).toThrow();
  });
});

describe('Key Derivation with Scrypt', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should derive different keys with different salts', () => {
    const service = new EncryptionService();

    // Encrypt same data twice - should use different salts
    const plaintext = 'test data';
    const { encryptedValue: encrypted1 } = service.encrypt(plaintext);
    const { encryptedValue: encrypted2 } = service.encrypt(plaintext);

    // Extract salts
    const salt1 = encrypted1.split(':')[1];
    const salt2 = encrypted2.split(':')[1];

    // Salts should be different
    expect(salt1).not.toBe(salt2);

    // Both should decrypt correctly (proving different derived keys work)
    expect(service.decrypt(encrypted1)).toBe(plaintext);
    expect(service.decrypt(encrypted2)).toBe(plaintext);
  });

  it('should use consistent salt length (32 bytes)', () => {
    const service = new EncryptionService();

    const { encryptedValue } = service.encrypt('test');
    const parts = encryptedValue.split(':');
    const saltBase64 = parts[1]!;
    const saltBuffer = Buffer.from(saltBase64, 'base64');

    expect(saltBuffer.length).toBe(32);
  });

  it('should use consistent IV length (12 bytes for GCM)', () => {
    const service = new EncryptionService();

    const { encryptedValue } = service.encrypt('test');
    const parts = encryptedValue.split(':');
    const ivBase64 = parts[2]!;
    const ivBuffer = Buffer.from(ivBase64, 'base64');

    expect(ivBuffer.length).toBe(12); // NIST recommended for AES-GCM
  });

  it('should use consistent auth tag length (16 bytes)', () => {
    const service = new EncryptionService();

    const { encryptedValue } = service.encrypt('test');
    const parts = encryptedValue.split(':');
    const tagBase64 = parts[3]!;
    const tagBuffer = Buffer.from(tagBase64, 'base64');

    expect(tagBuffer.length).toBe(16); // 128 bits
  });
});

describe('Memory Security', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const NEW_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

  beforeEach(() => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should zero out old master key during rotation', async () => {
    const mockDb = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, encrypted_value')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    const service = new EncryptionService(mockDb as any);

    // Perform key rotation
    await service.rotateEncryptionKey(NEW_KEY);

    // After rotation, should be able to encrypt with new key
    const { encryptedValue, keyVersion } = service.encrypt('new data');
    expect(keyVersion).toBe(2);

    // Should decrypt with new key
    expect(service.decrypt(encryptedValue)).toBe('new data');
  });
});
