/**
 * @fileoverview Tests for Encryption Infrastructure utilities
 * Tests for crypto utilities, data classification, and field-level encryption
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getEncryptionRequirements,
  generateSecureToken,
  generateSecureUUID,
  secureCompare,
  FieldEncryptionService,
  type EncryptionService,
  type EncryptedEnvelope,
  type DataClassification,
} from '../encryption.js';
import { Ok, Err } from '../../../types/result.js';

describe('getEncryptionRequirements', () => {
  it('should return correct requirements for public data', () => {
    const requirements = getEncryptionRequirements('public');

    expect(requirements.encryptAtRest).toBe(false);
    expect(requirements.encryptInTransit).toBe(true);
    expect(requirements.minimumKeySize).toBe(0);
    expect(requirements.algorithm).toBeUndefined();
  });

  it('should return correct requirements for internal data', () => {
    const requirements = getEncryptionRequirements('internal');

    expect(requirements.encryptAtRest).toBe(false);
    expect(requirements.encryptInTransit).toBe(true);
    expect(requirements.minimumKeySize).toBe(128);
    expect(requirements.algorithm).toBe('aes-256-gcm');
  });

  it('should return correct requirements for confidential data', () => {
    const requirements = getEncryptionRequirements('confidential');

    expect(requirements.encryptAtRest).toBe(true);
    expect(requirements.encryptInTransit).toBe(true);
    expect(requirements.minimumKeySize).toBe(256);
    expect(requirements.algorithm).toBe('aes-256-gcm');
  });

  it('should return correct requirements for restricted data', () => {
    const requirements = getEncryptionRequirements('restricted');

    expect(requirements.encryptAtRest).toBe(true);
    expect(requirements.encryptInTransit).toBe(true);
    expect(requirements.minimumKeySize).toBe(256);
    expect(requirements.algorithm).toBe('aes-256-gcm');
    expect(requirements.requireKeyRotation).toBe(true);
    expect(requirements.keyRotationDays).toBe(90);
    expect(requirements.requireAuditLog).toBe(true);
  });

  it('should return correct requirements for PII data', () => {
    const requirements = getEncryptionRequirements('pii');

    expect(requirements.encryptAtRest).toBe(true);
    expect(requirements.encryptInTransit).toBe(true);
    expect(requirements.requireKeyRotation).toBe(true);
    expect(requirements.keyRotationDays).toBe(90);
    expect(requirements.requireAuditLog).toBe(true);
  });

  it('should return correct requirements for PHI data', () => {
    const requirements = getEncryptionRequirements('phi');

    expect(requirements.encryptAtRest).toBe(true);
    expect(requirements.encryptInTransit).toBe(true);
    expect(requirements.requireKeyRotation).toBe(true);
    expect(requirements.requireAuditLog).toBe(true);
  });

  it('should return correct requirements for PCI data', () => {
    const requirements = getEncryptionRequirements('pci');

    expect(requirements.encryptAtRest).toBe(true);
    expect(requirements.encryptInTransit).toBe(true);
    expect(requirements.minimumKeySize).toBe(256);
    expect(requirements.requireKeyRotation).toBe(true);
  });

  it('should handle all classification types', () => {
    const classifications: DataClassification[] = [
      'public',
      'internal',
      'confidential',
      'restricted',
      'pii',
      'phi',
      'pci',
    ];

    classifications.forEach((classification) => {
      const requirements = getEncryptionRequirements(classification);
      expect(requirements).toBeDefined();
      expect(typeof requirements.encryptAtRest).toBe('boolean');
      expect(typeof requirements.encryptInTransit).toBe('boolean');
      expect(typeof requirements.minimumKeySize).toBe('number');
    });
  });
});

describe('generateSecureToken', () => {
  it('should generate token of default length (32 bytes = 64 hex chars)', () => {
    const token = generateSecureToken();

    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it('should generate token of specified length', () => {
    const token = generateSecureToken(16);

    expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it('should generate unique tokens', () => {
    const token1 = generateSecureToken();
    const token2 = generateSecureToken();

    expect(token1).not.toBe(token2);
  });

  it('should generate token with small length', () => {
    const token = generateSecureToken(4);

    expect(token).toHaveLength(8); // 4 bytes = 8 hex chars
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it('should generate token with large length', () => {
    const token = generateSecureToken(128);

    expect(token).toHaveLength(256); // 128 bytes = 256 hex chars
    expect(token).toMatch(/^[a-f0-9]+$/);
  });
});

describe('generateSecureUUID', () => {
  it('should generate valid UUID v4', () => {
    const uuid = generateSecureUUID();

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where x is any hex digit and y is one of 8, 9, a, or b
    expect(uuid).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });

  it('should generate unique UUIDs', () => {
    const uuid1 = generateSecureUUID();
    const uuid2 = generateSecureUUID();

    expect(uuid1).not.toBe(uuid2);
  });

  it('should generate many unique UUIDs', () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      uuids.add(generateSecureUUID());
    }
    expect(uuids.size).toBe(100);
  });
});

describe('secureCompare', () => {
  it('should return true for equal strings', () => {
    expect(secureCompare('test', 'test')).toBe(true);
    expect(secureCompare('password123', 'password123')).toBe(true);
    expect(secureCompare('', '')).toBe(true);
  });

  it('should return false for different strings', () => {
    expect(secureCompare('test', 'Test')).toBe(false);
    expect(secureCompare('password', 'password1')).toBe(false);
    expect(secureCompare('abc', 'xyz')).toBe(false);
  });

  it('should return false for strings of different lengths', () => {
    expect(secureCompare('short', 'longer')).toBe(false);
    expect(secureCompare('', 'nonempty')).toBe(false);
    expect(secureCompare('a', 'ab')).toBe(false);
  });

  it('should handle special characters', () => {
    expect(secureCompare('test!@#$%', 'test!@#$%')).toBe(true);
    expect(secureCompare('unicode: 日本語', 'unicode: 日本語')).toBe(true);
    expect(secureCompare('emoji: 🔐', 'emoji: 🔐')).toBe(true);
  });

  it('should handle long strings', () => {
    const long1 = 'x'.repeat(10000);
    const long2 = 'x'.repeat(10000);
    const long3 = 'x'.repeat(9999) + 'y';

    expect(secureCompare(long1, long2)).toBe(true);
    expect(secureCompare(long1, long3)).toBe(false);
  });

  it('should use constant-time comparison (not short-circuit)', () => {
    // Both should return false, but constant-time comparison
    // should not exit early on first mismatch
    const result1 = secureCompare('aaaaa', 'bbbbb');
    const result2 = secureCompare('aaaaa', 'abbbb');

    expect(result1).toBe(false);
    expect(result2).toBe(false);
  });
});

describe('FieldEncryptionService', () => {
  // Mock encryption service
  const createMockEncryptionService = () => {
    const mockEnvelope: EncryptedEnvelope = {
      ciphertext: 'encrypted_data',
      iv: 'random_iv',
      tag: 'auth_tag',
      keyId: 'key_123',
      keyVersion: 1,
      algorithm: 'aes-256-gcm',
      encryptedAt: new Date().toISOString(),
    };

    return {
      encrypt: vi.fn().mockResolvedValue(Ok(mockEnvelope)),
      decrypt: vi.fn().mockResolvedValue(Ok(Buffer.from('decrypted_value'))),
      rotateKey: vi.fn(),
      reencrypt: vi.fn(),
    } as unknown as EncryptionService;
  };

  it('should encrypt specified fields', async () => {
    const mockService = createMockEncryptionService();
    const config = new Map([
      [
        'email',
        {
          field: 'email',
          algorithm: 'aes-256-gcm' as const,
          deterministic: false,
          keyPurpose: 'data_encryption' as const,
        },
      ],
      [
        'phone',
        {
          field: 'phone',
          algorithm: 'aes-256-gcm' as const,
          deterministic: false,
          keyPurpose: 'data_encryption' as const,
        },
      ],
    ]);

    const fieldService = new FieldEncryptionService(mockService, config);

    const data = {
      email: 'test@example.com',
      phone: '+40700000000',
      name: 'John Doe', // Not in config, should not be encrypted
    };

    const result = await fieldService.encryptFields(data);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(mockService.encrypt).toHaveBeenCalledTimes(2);
      expect(mockService.encrypt).toHaveBeenCalledWith('test@example.com', 'data_encryption');
      expect(mockService.encrypt).toHaveBeenCalledWith('+40700000000', 'data_encryption');
    }
  });

  it('should skip null/undefined fields during encryption', async () => {
    const mockService = createMockEncryptionService();
    const config = new Map([
      [
        'email',
        {
          field: 'email',
          algorithm: 'aes-256-gcm' as const,
          deterministic: false,
          keyPurpose: 'data_encryption' as const,
        },
      ],
    ]);

    const fieldService = new FieldEncryptionService(mockService, config);

    const data = {
      email: null,
      name: 'John Doe',
    };

    const result = await fieldService.encryptFields(data);

    expect(result.isOk).toBe(true);
    expect(mockService.encrypt).not.toHaveBeenCalled();
  });

  it('should return error when encryption fails', async () => {
    const mockService = createMockEncryptionService();
    (mockService.encrypt as ReturnType<typeof vi.fn>).mockResolvedValue(
      Err({ code: 'ENCRYPT_FAILED', message: 'Encryption failed' })
    );

    const config = new Map([
      [
        'email',
        {
          field: 'email',
          algorithm: 'aes-256-gcm' as const,
          deterministic: false,
          keyPurpose: 'data_encryption' as const,
        },
      ],
    ]);

    const fieldService = new FieldEncryptionService(mockService, config);

    const data = { email: 'test@example.com' };
    const result = await fieldService.encryptFields(data);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('ENCRYPT_FAILED');
    }
  });

  it('should decrypt specified fields', async () => {
    const mockService = createMockEncryptionService();
    const config = new Map([
      [
        'email',
        {
          field: 'email',
          algorithm: 'aes-256-gcm' as const,
          deterministic: false,
          keyPurpose: 'data_encryption' as const,
        },
      ],
    ]);

    const fieldService = new FieldEncryptionService(mockService, config);

    const data = {
      email: {
        ciphertext: 'encrypted_data',
        iv: 'random_iv',
        tag: 'auth_tag',
        keyId: 'key_123',
        keyVersion: 1,
        algorithm: 'aes-256-gcm',
        encryptedAt: new Date().toISOString(),
      },
      name: 'John Doe',
    };

    const result = await fieldService.decryptFields(data);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(mockService.decrypt).toHaveBeenCalledTimes(1);
      expect(result.value.email).toBe('decrypted_value');
      expect(result.value.name).toBe('John Doe');
    }
  });

  it('should skip non-encrypted fields during decryption', async () => {
    const mockService = createMockEncryptionService();
    const config = new Map([
      [
        'email',
        {
          field: 'email',
          algorithm: 'aes-256-gcm' as const,
          deterministic: false,
          keyPurpose: 'data_encryption' as const,
        },
      ],
    ]);

    const fieldService = new FieldEncryptionService(mockService, config);

    const data = {
      email: 'plain_text_value', // Not an encrypted envelope
      name: 'John Doe',
    };

    const result = await fieldService.decryptFields(data);

    expect(result.isOk).toBe(true);
    expect(mockService.decrypt).not.toHaveBeenCalled();
  });

  it('should return error when decryption fails', async () => {
    const mockService = createMockEncryptionService();
    (mockService.decrypt as ReturnType<typeof vi.fn>).mockResolvedValue(
      Err({ code: 'DECRYPT_FAILED', message: 'Decryption failed' })
    );

    const config = new Map([
      [
        'email',
        {
          field: 'email',
          algorithm: 'aes-256-gcm' as const,
          deterministic: false,
          keyPurpose: 'data_encryption' as const,
        },
      ],
    ]);

    const fieldService = new FieldEncryptionService(mockService, config);

    const data = {
      email: {
        ciphertext: 'encrypted_data',
        iv: 'random_iv',
        tag: 'auth_tag',
        keyId: 'key_123',
        keyVersion: 1,
        algorithm: 'aes-256-gcm',
        encryptedAt: new Date().toISOString(),
      },
    };

    const result = await fieldService.decryptFields(data);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error.code).toBe('DECRYPT_FAILED');
    }
  });

  it('should handle empty config', async () => {
    const mockService = createMockEncryptionService();
    const config = new Map();

    const fieldService = new FieldEncryptionService(mockService, config);

    const data = { email: 'test@example.com' };
    const result = await fieldService.encryptFields(data);

    expect(result.isOk).toBe(true);
    expect(mockService.encrypt).not.toHaveBeenCalled();
  });
});
