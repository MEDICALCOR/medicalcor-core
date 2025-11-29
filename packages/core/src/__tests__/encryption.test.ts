/**
 * Encryption Service Tests
 * Tests for PHI/PII data encryption at rest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EncryptionService, createEncryptionService } from '../encryption.js';

describe('EncryptionService', () => {
  const TEST_KEY = 'a'.repeat(64); // 32-byte hex key

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

    it('should return false when encryption key is invalid length', () => {
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'tooshort');
      const service = new EncryptionService();
      expect(service.isConfigured()).toBe(false);
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
});
