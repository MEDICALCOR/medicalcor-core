/**
 * Comprehensive Encryption Service Tests
 * Tests for PHI/PII data encryption at rest with full coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EncryptionService,
  AwsKmsProvider,
  LocalKmsProvider,
  createEncryptionService,
  createKmsEncryptionService,
  createAutoEncryptionService,
  encryptValue,
  decryptValue,
  type KmsProvider,
  type EncryptedField,
  type DatabasePool,
  type QueryResult,
} from '../encryption.js';

describe('EncryptionService', () => {
  // Test key with proper entropy (looks random, not a repeating pattern)
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const VALID_MASTER_KEY = '1a2b3c4d5e6f7890abcdef1234567890fedcba0987654321abcdef0123456789';

  beforeEach(() => {
    // Set up test encryption key
    vi.stubEnv('DATA_ENCRYPTION_KEY', TEST_KEY);
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('loadMasterKey', () => {
    it('should load valid encryption key from environment', () => {
      const service = new EncryptionService();
      expect(service.isConfigured()).toBe(true);
    });

    it('should throw in production when key is missing', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');

      expect(() => new EncryptionService()).toThrow('CRITICAL: DATA_ENCRYPTION_KEY must be configured in production');
    });

    it('should warn in development when key is missing', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');

      const service = new EncryptionService();
      expect(service.isConfigured()).toBe(false);
    });

    it('should throw when key is invalid length', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'tooshort');
      expect(() => new EncryptionService()).toThrow('must be 32 bytes (64 hex characters)');
    });

    it('should throw when key is not valid hex', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'g'.repeat(64)); // Invalid hex character
      expect(() => new EncryptionService()).toThrow('must be a valid hexadecimal string');
    });

    it('should throw when key is all zeros (weak key)', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', '0'.repeat(64));
      expect(() => new EncryptionService()).toThrow('appears to be a weak key');
    });

    it('should throw when key is all same byte (weak key)', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'ff'.repeat(32));
      expect(() => new EncryptionService()).toThrow('appears to be a weak key');
    });

    it('should throw when key has repeating 2-byte pattern (weak key)', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'ab'.repeat(32));
      expect(() => new EncryptionService()).toThrow('appears to be a weak key');
    });

    it('should throw when key is sequential bytes (weak key)', () => {
      const sequentialKey = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('');
      vi.stubEnv('DATA_ENCRYPTION_KEY', sequentialKey);
      expect(() => new EncryptionService()).toThrow('appears to be a weak key');
    });
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

    it('should return true when KMS provider is configured', () => {
      const mockKms: KmsProvider = {
        name: 'Mock KMS',
        encryptDataKey: vi.fn(),
        decryptDataKey: vi.fn(),
        generateDataKey: vi.fn(),
        isAvailable: vi.fn(),
      };
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');
      const service = new EncryptionService(undefined, mockKms);
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('isKmsEnabled', () => {
    it('should return false when no KMS provider', () => {
      const service = new EncryptionService();
      expect(service.isKmsEnabled()).toBe(false);
    });

    it('should return true when KMS provider is configured', () => {
      const mockKms: KmsProvider = {
        name: 'Mock KMS',
        encryptDataKey: vi.fn(),
        decryptDataKey: vi.fn(),
        generateDataKey: vi.fn(),
        isAvailable: vi.fn(),
      };
      const service = new EncryptionService(undefined, mockKms);
      expect(service.isKmsEnabled()).toBe(true);
    });
  });

  describe('getKmsProviderName', () => {
    it('should return null when no KMS provider', () => {
      const service = new EncryptionService();
      expect(service.getKmsProviderName()).toBeNull();
    });

    it('should return provider name when KMS is configured', () => {
      const mockKms: KmsProvider = {
        name: 'Mock KMS',
        encryptDataKey: vi.fn(),
        decryptDataKey: vi.fn(),
        generateDataKey: vi.fn(),
        isAvailable: vi.fn(),
      };
      const service = new EncryptionService(undefined, mockKms);
      expect(service.getKmsProviderName()).toBe('Mock KMS');
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

    it('should include key version, salt, iv, authTag, and encrypted data', () => {
      const service = new EncryptionService();
      const result = service.encrypt('test');
      const parts = result.encryptedValue.split(':');

      expect(parts).toHaveLength(5);
      expect(parts[0]).toBe('1'); // key version
      expect(parts[1]).toBeDefined(); // salt
      expect(parts[2]).toBeDefined(); // iv
      expect(parts[3]).toBeDefined(); // authTag
      expect(parts[4]).toBeDefined(); // encrypted
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

    it('should throw on invalid format with wrong number of parts', () => {
      const service = new EncryptionService();

      expect(() => service.decrypt('1:2:3')).toThrow('Invalid encrypted value format');
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

    it('should handle old key version with warning', () => {
      const service = new EncryptionService();
      const { encryptedValue } = service.encrypt('test');

      // Simulate old key version
      const parts = encryptedValue.split(':');
      parts[0] = '0'; // Old version
      const oldVersionValue = parts.join(':');

      // Should still decrypt but log warning
      const decrypted = service.decrypt(oldVersionValue);
      expect(decrypted).toBe('test');
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

    it('should throw when encryption key is not configured', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', '');
      const service = new EncryptionService();

      expect(() => service.hashForIndex('test')).toThrow('Encryption key not configured');
    });
  });

  describe('KMS encryption methods', () => {
    let mockKms: KmsProvider;
    const plainKey = Buffer.from('a'.repeat(64), 'hex');
    const encryptedKey = Buffer.from('b'.repeat(64), 'hex');

    beforeEach(() => {
      mockKms = {
        name: 'Mock KMS',
        encryptDataKey: vi.fn().mockResolvedValue(encryptedKey),
        decryptDataKey: vi.fn().mockResolvedValue(plainKey),
        generateDataKey: vi.fn().mockResolvedValue({ plainKey, encryptedKey }),
        isAvailable: vi.fn().mockResolvedValue(true),
      };
    });

    describe('encryptWithKms', () => {
      it('should encrypt using KMS envelope encryption', async () => {
        const service = new EncryptionService(undefined, mockKms);
        const plaintext = 'sensitive data';

        const result = await service.encryptWithKms(plaintext);

        expect(result.encryptedValue).toBeDefined();
        expect(result.encryptedValue.startsWith('kms:')).toBe(true);
        expect(result.keyVersion).toBe(1);
        expect(mockKms.generateDataKey).toHaveBeenCalled();
      });

      it('should throw when KMS provider is not configured', async () => {
        const service = new EncryptionService();

        await expect(service.encryptWithKms('test')).rejects.toThrow('KMS provider not configured');
      });

      it('should include kms marker, version, encrypted key, iv, authTag, and encrypted data', async () => {
        const service = new EncryptionService(undefined, mockKms);
        const result = await service.encryptWithKms('test');
        const parts = result.encryptedValue.split(':');

        expect(parts).toHaveLength(6);
        expect(parts[0]).toBe('kms');
        expect(parts[1]).toBe('1'); // key version
        expect(parts[2]).toBeDefined(); // encrypted data key
        expect(parts[3]).toBeDefined(); // iv
        expect(parts[4]).toBeDefined(); // authTag
        expect(parts[5]).toBeDefined(); // encrypted
      });

      it('should cache data key for performance', async () => {
        const service = new EncryptionService(undefined, mockKms);

        await service.encryptWithKms('test1');
        await service.encryptWithKms('test2');

        // Should only call generateDataKey once due to caching
        expect(mockKms.generateDataKey).toHaveBeenCalledTimes(1);
      });
    });

    describe('decryptWithKms', () => {
      it('should decrypt KMS-encrypted value', async () => {
        const service = new EncryptionService(undefined, mockKms);
        const plaintext = 'sensitive data';

        const { encryptedValue } = await service.encryptWithKms(plaintext);
        const decrypted = await service.decryptWithKms(encryptedValue);

        expect(decrypted).toBe(plaintext);
        expect(mockKms.decryptDataKey).toHaveBeenCalled();
      });

      it('should throw when KMS provider is not configured', async () => {
        const service = new EncryptionService();

        await expect(service.decryptWithKms('kms:1:key:iv:tag:data')).rejects.toThrow('KMS provider not configured');
      });

      it('should throw on invalid KMS format', async () => {
        const service = new EncryptionService(undefined, mockKms);

        await expect(service.decryptWithKms('invalid:format')).rejects.toThrow('Invalid KMS-encrypted value format');
      });

      it('should throw when missing kms marker', async () => {
        const service = new EncryptionService(undefined, mockKms);

        await expect(service.decryptWithKms('1:key:iv:tag:data:extra')).rejects.toThrow('Invalid KMS-encrypted value format');
      });

      it('should handle old key version with warning', async () => {
        const service = new EncryptionService(undefined, mockKms);
        const { encryptedValue } = await service.encryptWithKms('test');

        // Simulate old key version
        const parts = encryptedValue.split(':');
        parts[1] = '0';
        const oldVersionValue = parts.join(':');

        const decrypted = await service.decryptWithKms(oldVersionValue);
        expect(decrypted).toBe('test');
      });
    });

    describe('encryptSmart', () => {
      it('should use KMS when available', async () => {
        const service = new EncryptionService(undefined, mockKms);
        const result = await service.encryptSmart('test');

        expect(result.encryptedValue.startsWith('kms:')).toBe(true);
      });

      it('should use direct encryption when KMS not available', async () => {
        const service = new EncryptionService();
        const result = await service.encryptSmart('test');

        expect(result.encryptedValue.startsWith('kms:')).toBe(false);
      });
    });

    describe('decryptSmart', () => {
      it('should decrypt KMS-encrypted values', async () => {
        const service = new EncryptionService(undefined, mockKms);
        const { encryptedValue } = await service.encryptWithKms('test');

        const decrypted = await service.decryptSmart(encryptedValue);
        expect(decrypted).toBe('test');
      });

      it('should decrypt direct-encrypted values', async () => {
        const service = new EncryptionService();
        const { encryptedValue } = service.encrypt('test');

        const decrypted = await service.decryptSmart(encryptedValue);
        expect(decrypted).toBe('test');
      });

      it('should throw when KMS value provided but no KMS configured', async () => {
        const service = new EncryptionService(undefined, mockKms);
        const { encryptedValue } = await service.encryptWithKms('test');

        const serviceWithoutKms = new EncryptionService();
        await expect(serviceWithoutKms.decryptSmart(encryptedValue)).rejects.toThrow(
          'Value was encrypted with KMS but no KMS provider is configured'
        );
      });
    });
  });

  describe('Database operations', () => {
    let mockDb: DatabasePool;
    const field: EncryptedField = {
      entityType: 'patient',
      entityId: '123',
      fieldName: 'ssn',
      classification: 'phi',
    };

    beforeEach(() => {
      mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        connect: vi.fn(),
        end: vi.fn(),
      } as unknown as DatabasePool;
    });

    describe('storeEncryptedField', () => {
      it('should store encrypted field in database', async () => {
        const service = new EncryptionService(mockDb);

        await service.storeEncryptedField(field, 'sensitive data');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO encrypted_data'),
          expect.arrayContaining(['patient', '123', 'ssn', expect.any(String), 1, 'phi'])
        );
      });

      it('should throw when database not available', async () => {
        const service = new EncryptionService();

        await expect(service.storeEncryptedField(field, 'data')).rejects.toThrow('Database connection not available');
      });
    });

    describe('getDecryptedField', () => {
      it('should retrieve and decrypt field from database', async () => {
        const service = new EncryptionService(mockDb);
        const plaintext = 'sensitive data';
        const { encryptedValue } = service.encrypt(plaintext);

        (mockDb.query as any).mockResolvedValueOnce({
          rows: [{ encrypted_value: encryptedValue, classification: 'phi' }],
          rowCount: 1,
        });

        const result = await service.getDecryptedField(field);

        expect(result).toBe(plaintext);
        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT encrypted_value'),
          ['patient', '123', 'ssn']
        );
      });

      it('should return null when field not found', async () => {
        const service = new EncryptionService(mockDb);

        (mockDb.query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await service.getDecryptedField(field);

        expect(result).toBeNull();
      });

      it('should log access by default', async () => {
        const service = new EncryptionService(mockDb);
        const { encryptedValue } = service.encrypt('data');

        (mockDb.query as any)
          .mockResolvedValueOnce({ rows: [{ encrypted_value: encryptedValue }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // access log insert
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // accessed_at update

        await service.getDecryptedField(field, { userId: 'user123' });

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO sensitive_data_access_log'),
          expect.arrayContaining(['user123', null, 'patient', '123', ['ssn'], 'read', null, null, null])
        );
      });

      it('should not log access when logAccess is false', async () => {
        const service = new EncryptionService(mockDb);
        const { encryptedValue } = service.encrypt('data');

        (mockDb.query as any)
          .mockResolvedValueOnce({ rows: [{ encrypted_value: encryptedValue }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // accessed_at update

        await service.getDecryptedField(field, { logAccess: false });

        const calls = (mockDb.query as any).mock.calls;
        const hasAccessLog = calls.some((call: any) => call[0].includes('sensitive_data_access_log'));
        expect(hasAccessLog).toBe(false);
      });

      it('should update accessed_at timestamp', async () => {
        const service = new EncryptionService(mockDb);
        const { encryptedValue } = service.encrypt('data');

        (mockDb.query as any)
          .mockResolvedValueOnce({ rows: [{ encrypted_value: encryptedValue }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // access log
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // accessed_at update

        await service.getDecryptedField(field, { userId: 'user123' });

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE encrypted_data SET accessed_at'),
          ['patient', '123', 'ssn', 'user123']
        );
      });

      it('should throw when database not available', async () => {
        const service = new EncryptionService();

        await expect(service.getDecryptedField(field)).rejects.toThrow('Database connection not available');
      });

      it('should include all access log fields', async () => {
        const service = new EncryptionService(mockDb);
        const { encryptedValue } = service.encrypt('data');

        (mockDb.query as any)
          .mockResolvedValueOnce({ rows: [{ encrypted_value: encryptedValue }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // access log
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // accessed_at update

        await service.getDecryptedField(field, {
          userId: 'user123',
          sessionId: 'session456',
          accessReason: 'Patient care',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        });

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO sensitive_data_access_log'),
          expect.arrayContaining([
            'user123',
            'session456',
            'patient',
            '123',
            ['ssn'],
            'read',
            'Patient care',
            '192.168.1.1',
            'Mozilla/5.0',
          ])
        );
      });
    });

    describe('deleteEncryptedField', () => {
      it('should soft delete encrypted field', async () => {
        const service = new EncryptionService(mockDb);

        (mockDb.query as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // access log

        const result = await service.deleteEncryptedField(field);

        expect(result).toBe(true);
        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE encrypted_data SET deleted_at'),
          ['patient', '123', 'ssn']
        );
      });

      it('should return false when field not found', async () => {
        const service = new EncryptionService(mockDb);

        (mockDb.query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await service.deleteEncryptedField(field);

        expect(result).toBe(false);
      });

      it('should log deletion', async () => {
        const service = new EncryptionService(mockDb);

        (mockDb.query as any)
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // access log

        await service.deleteEncryptedField(field, { userId: 'user123' });

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO sensitive_data_access_log'),
          expect.arrayContaining(['user123', null, 'patient', '123', ['ssn'], 'delete', null, null, null])
        );
      });

      it('should throw when database not available', async () => {
        const service = new EncryptionService();

        await expect(service.deleteEncryptedField(field)).rejects.toThrow('Database connection not available');
      });
    });
  });

  describe('rotateEncryptionKey', () => {
    let mockDb: DatabasePool;

    beforeEach(() => {
      mockDb = {
        query: vi.fn(),
        connect: vi.fn(),
        end: vi.fn(),
      } as unknown as DatabasePool;
    });

    it('should rotate encryption keys successfully', async () => {
      const service = new EncryptionService(mockDb);
      const { encryptedValue } = service.encrypt('test data');

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT new key
        .mockResolvedValueOnce({ rows: [{ id: 1, encrypted_value: encryptedValue }], rowCount: 1 }) // SELECT data
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE record
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE old keys
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE new key

      const rotatedCount = await service.rotateEncryptionKey(VALID_MASTER_KEY);

      expect(rotatedCount).toBe(1);

      // Check that the INSERT query was called
      const calls = (mockDb.query as any).mock.calls;
      const insertCall = calls.find((call: any) => call[0].includes('INSERT INTO encryption_keys'));
      expect(insertCall).toBeDefined();
      expect(insertCall[1][0]).toBe(2); // key version
      expect(insertCall[1][1]).toBeDefined(); // fingerprint
    });

    it('should throw when new key is invalid length', async () => {
      const service = new EncryptionService(mockDb);

      await expect(service.rotateEncryptionKey('short')).rejects.toThrow('must be 32 bytes');
    });

    it('should continue rotation even if some records fail', async () => {
      const service = new EncryptionService(mockDb);
      const { encryptedValue } = service.encrypt('test data');

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT new key
        .mockResolvedValueOnce({
          rows: [
            { id: 1, encrypted_value: encryptedValue },
            { id: 2, encrypted_value: 'invalid:data' },
          ],
          rowCount: 2,
        }) // SELECT data
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE record 1
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE old keys
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE new key

      const rotatedCount = await service.rotateEncryptionKey(VALID_MASTER_KEY);

      expect(rotatedCount).toBe(1); // Only one succeeded
    });

    it('should mark old key as retired and new key as active', async () => {
      const service = new EncryptionService(mockDb);

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT new key
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT data
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE old keys
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE new key

      await service.rotateEncryptionKey(VALID_MASTER_KEY);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE encryption_keys SET status = 'retired'"),
        [2]
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE encryption_keys SET status = 'active'"),
        [2]
      );
    });

    it('should throw when database not available', async () => {
      const service = new EncryptionService();

      await expect(service.rotateEncryptionKey(VALID_MASTER_KEY)).rejects.toThrow('Database connection not available');
    });
  });

  describe('LocalKmsProvider', () => {
    it('should create provider with valid master key', () => {
      const provider = new LocalKmsProvider(VALID_MASTER_KEY);
      expect(provider.name).toBe('Local Environment');
    });

    it('should create provider from environment variable', () => {
      vi.stubEnv('KMS_MASTER_KEY', VALID_MASTER_KEY);
      const provider = new LocalKmsProvider();
      expect(provider.name).toBe('Local Environment');
    });

    it('should throw when key is not 64 hex characters', () => {
      expect(() => new LocalKmsProvider('short')).toThrow('must be 32 bytes (64 hex characters)');
    });

    it('should throw when key is undefined', () => {
      vi.stubEnv('KMS_MASTER_KEY', '');
      expect(() => new LocalKmsProvider()).toThrow('must be 32 bytes (64 hex characters)');
    });

    it('should encrypt and decrypt data keys', async () => {
      const provider = new LocalKmsProvider(VALID_MASTER_KEY);
      const dataKey = Buffer.from('test data key contents here!');

      const encrypted = await provider.encryptDataKey(dataKey);
      const decrypted = await provider.decryptDataKey(encrypted);

      expect(decrypted.toString()).toBe(dataKey.toString());
    });

    it('should generate data keys', async () => {
      const provider = new LocalKmsProvider(VALID_MASTER_KEY);

      const { plainKey, encryptedKey } = await provider.generateDataKey();

      expect(plainKey).toHaveLength(32);
      expect(encryptedKey.length).toBeGreaterThan(0);

      const decrypted = await provider.decryptDataKey(encryptedKey);
      expect(decrypted.toString()).toBe(plainKey.toString());
    });

    it('should always be available', async () => {
      const provider = new LocalKmsProvider(VALID_MASTER_KEY);
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('should include IV and auth tag in encrypted key', async () => {
      const provider = new LocalKmsProvider(VALID_MASTER_KEY);
      const dataKey = Buffer.from('test');

      const encrypted = await provider.encryptDataKey(dataKey);

      // Format: iv(12) + authTag(16) + encrypted
      expect(encrypted.length).toBeGreaterThan(28);
    });
  });

  describe('AwsKmsProvider', () => {
    beforeEach(() => {
      vi.stubEnv('AWS_KMS_KEY_ID', 'arn:aws:kms:eu-central-1:123456789:key/test-key');
      vi.stubEnv('AWS_REGION', 'eu-central-1');
    });

    it('should create provider with key ID', () => {
      const provider = new AwsKmsProvider('test-key-id');
      expect(provider.name).toBe('AWS KMS');
    });

    it('should create provider from environment variable', () => {
      const provider = new AwsKmsProvider();
      expect(provider.name).toBe('AWS KMS');
    });

    it('should throw when key ID is not provided', () => {
      vi.stubEnv('AWS_KMS_KEY_ID', '');
      expect(() => new AwsKmsProvider()).toThrow('AWS KMS key ID must be provided');
    });

    // Note: The following tests for AWS KMS require @aws-sdk/client-kms to be installed
    // and AWS credentials configured. We test that it fails gracefully in test environment
    it('should fail when AWS credentials are not configured', async () => {
      const provider = new AwsKmsProvider('test-key');

      // AWS SDK is installed but credentials are not configured in test environment
      await expect(provider.encryptDataKey(Buffer.from('test'))).rejects.toThrow();
    });

    it('should return false when availability check fails without SDK', async () => {
      const provider = new AwsKmsProvider('test-key');

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('Helper functions', () => {
    describe('createEncryptionService', () => {
      it('should create service without database', () => {
        const service = createEncryptionService();

        expect(service).toBeInstanceOf(EncryptionService);
        expect(service.isConfigured()).toBe(true);
      });

      it('should create service with database', () => {
        const mockDb = { query: vi.fn() } as unknown as DatabasePool;
        const service = createEncryptionService(mockDb);

        expect(service).toBeInstanceOf(EncryptionService);
      });

      it('should create service with KMS provider', () => {
        const mockKms: KmsProvider = {
          name: 'Mock',
          encryptDataKey: vi.fn(),
          decryptDataKey: vi.fn(),
          generateDataKey: vi.fn(),
          isAvailable: vi.fn(),
        };
        const service = createEncryptionService(undefined, mockKms);

        expect(service.isKmsEnabled()).toBe(true);
      });
    });

    describe('createKmsEncryptionService', () => {
      beforeEach(() => {
        vi.stubEnv('AWS_KMS_KEY_ID', 'test-key');
      });

      it('should throw when KMS is not available (SDK not installed)', async () => {
        await expect(createKmsEncryptionService()).rejects.toThrow('AWS KMS is not available');
      });
    });

    describe('createAutoEncryptionService', () => {
      it('should fall back to direct key when KMS SDK not available', async () => {
        vi.stubEnv('AWS_KMS_KEY_ID', 'test-key');

        const service = await createAutoEncryptionService();

        // Should fall back to direct encryption when AWS SDK is not available
        expect(service.isKmsEnabled()).toBe(false);
        expect(service.isConfigured()).toBe(true);
      });

      it('should use direct key when AWS_KMS_KEY_ID is not set', async () => {
        vi.stubEnv('AWS_KMS_KEY_ID', '');

        const service = await createAutoEncryptionService();

        expect(service.isKmsEnabled()).toBe(false);
      });
    });

    describe('encryptValue', () => {
      it('should encrypt value without database', () => {
        const encrypted = encryptValue('test data');

        expect(encrypted).toBeDefined();
        expect(encrypted.split(':').length).toBe(5);
      });
    });

    describe('decryptValue', () => {
      it('should decrypt value without database', () => {
        const encrypted = encryptValue('test data');
        const decrypted = decryptValue(encrypted);

        expect(decrypted).toBe('test data');
      });
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

    it('should handle full database workflow with KMS', async () => {
      const plainKey = Buffer.from('a'.repeat(64), 'hex');
      const encryptedKey = Buffer.from('b'.repeat(64), 'hex');

      const mockKms: KmsProvider = {
        name: 'Mock KMS',
        encryptDataKey: vi.fn().mockResolvedValue(encryptedKey),
        decryptDataKey: vi.fn().mockResolvedValue(plainKey),
        generateDataKey: vi.fn().mockResolvedValue({ plainKey, encryptedKey }),
        isAvailable: vi.fn().mockResolvedValue(true),
      };

      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        connect: vi.fn(),
        end: vi.fn(),
      } as unknown as DatabasePool;

      const service = new EncryptionService(mockDb, mockKms);

      const field: EncryptedField = {
        entityType: 'patient',
        entityId: '123',
        fieldName: 'ssn',
        classification: 'phi',
      };

      // Store encrypted field
      await service.storeEncryptedField(field, '123-45-6789');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO encrypted_data'),
        expect.any(Array)
      );
    });
  });
});
