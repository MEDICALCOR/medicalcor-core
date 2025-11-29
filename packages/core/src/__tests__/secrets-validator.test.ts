/**
 * Secrets Validator Tests
 * Tests for boot-time secrets validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateSecrets,
  validateSecretsAtStartup,
  getSecretsFingerprint,
  generateSecureKey,
  DEFAULT_SECRET_RULES,
  type SecretRule,
} from '../secrets-validator.js';

describe('SecretsValidator', () => {
  beforeEach(() => {
    // Clear all env vars before each test
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('validateSecrets', () => {
    it('should pass when all required secrets are present', () => {
      // Set up all required secrets
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      vi.stubEnv('API_SECRET_KEY', 'a'.repeat(32));
      vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'pat-na1-12345678-1234-1234-1234-123456789012');
      vi.stubEnv('WHATSAPP_API_KEY', 'whatsapp-api-key-12345678901234567890');
      vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1234567890');
      vi.stubEnv('OPENAI_API_KEY', 'sk-proj-test-key-12345');

      const result = validateSecrets();

      expect(result.valid).toBe(true);
      expect(result.criticalErrors).toBe(0);
    });

    it('should fail when required secrets are missing', () => {
      // Set only some required secrets
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      // Missing API_SECRET_KEY, HUBSPOT_ACCESS_TOKEN, etc.

      const result = validateSecrets();

      expect(result.valid).toBe(false);
      expect(result.criticalErrors).toBeGreaterThan(0);
      expect(result.missingRequired.length).toBeGreaterThan(0);
    });

    it('should report warnings for missing recommended secrets', () => {
      // Set all required secrets
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      vi.stubEnv('API_SECRET_KEY', 'a'.repeat(32));
      vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'pat-na1-12345678-1234-1234-1234-123456789012');
      vi.stubEnv('WHATSAPP_API_KEY', 'whatsapp-api-key-12345678901234567890');
      vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1234567890');
      vi.stubEnv('OPENAI_API_KEY', 'sk-proj-test-key-12345');
      // Missing MFA_ENCRYPTION_KEY (recommended)

      const result = validateSecrets();

      expect(result.valid).toBe(true);
      expect(result.warnings).toBeGreaterThan(0);
      expect(result.missingRecommended).toContain('MFA_ENCRYPTION_KEY');
    });

    it('should validate DATABASE_URL format', () => {
      vi.stubEnv('DATABASE_URL', 'invalid-url');

      const result = validateSecrets();
      const dbResult = result.results.find(r => r.envVar === 'DATABASE_URL');

      expect(dbResult?.valid).toBe(false);
      expect(dbResult?.error).toBe('Invalid format');
    });

    it('should validate API_SECRET_KEY minimum length', () => {
      vi.stubEnv('API_SECRET_KEY', 'tooshort');

      const result = validateSecrets();
      const keyResult = result.results.find(r => r.envVar === 'API_SECRET_KEY');

      expect(keyResult?.valid).toBe(false);
      expect(keyResult?.error).toContain('Too short');
    });

    it('should validate encryption key format (64 hex chars)', () => {
      vi.stubEnv('MFA_ENCRYPTION_KEY', 'not-valid-hex');

      const result = validateSecrets();
      const mfaResult = result.results.find(r => r.envVar === 'MFA_ENCRYPTION_KEY');

      expect(mfaResult?.valid).toBe(false);
      expect(mfaResult?.error).toBe('Invalid format');
    });

    it('should accept valid encryption key format', () => {
      vi.stubEnv('MFA_ENCRYPTION_KEY', 'a'.repeat(64));

      const result = validateSecrets();
      const mfaResult = result.results.find(r => r.envVar === 'MFA_ENCRYPTION_KEY');

      expect(mfaResult?.valid).toBe(true);
    });

    it('should use custom rules when provided', () => {
      const customRules: SecretRule[] = [
        {
          name: 'Custom Secret',
          envVar: 'CUSTOM_SECRET',
          requirement: 'required',
          minLength: 10,
          description: 'Custom test secret',
          securityImpact: 'Custom impact',
        },
      ];

      vi.stubEnv('CUSTOM_SECRET', 'short');

      const result = validateSecrets(customRules);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toContain('CUSTOM_SECRET');
    });
  });

  describe('validateSecretsAtStartup', () => {
    it('should not throw in development with missing secrets', () => {
      vi.stubEnv('NODE_ENV', 'development');

      expect(() => validateSecretsAtStartup({ failOnMissing: false })).not.toThrow();
    });

    it('should throw in production with missing required secrets', () => {
      vi.stubEnv('NODE_ENV', 'production');
      // Missing all required secrets

      expect(() =>
        validateSecretsAtStartup({ failOnMissing: true })
      ).toThrow(/FATAL.*missing required secrets/);
    });

    it('should not throw when failOnMissing is false', () => {
      vi.stubEnv('NODE_ENV', 'production');

      expect(() =>
        validateSecretsAtStartup({ failOnMissing: false })
      ).not.toThrow();
    });

    it('should throw on missing recommended secrets when failOnRecommended is true', () => {
      vi.stubEnv('NODE_ENV', 'production');
      // Set all required secrets
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      vi.stubEnv('API_SECRET_KEY', 'a'.repeat(32));
      vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'pat-na1-12345678-1234-1234-1234-123456789012');
      vi.stubEnv('WHATSAPP_API_KEY', 'whatsapp-api-key-12345678901234567890');
      vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1234567890');
      vi.stubEnv('OPENAI_API_KEY', 'sk-proj-test-key-12345');
      // Missing recommended secrets

      expect(() =>
        validateSecretsAtStartup({ failOnMissing: true, failOnRecommended: true })
      ).toThrow(/FATAL.*missing recommended secrets/);
    });
  });

  describe('getSecretsFingerprint', () => {
    it('should return fingerprints for configured secrets', () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
      vi.stubEnv('API_SECRET_KEY', 'testsecretkey123456789012345678');

      const fingerprints = getSecretsFingerprint();

      expect(fingerprints.DATABASE_URL).toMatch(/^[a-f0-9]{8}$/);
      expect(fingerprints.API_SECRET_KEY).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should return null for missing secrets', () => {
      // Don't set any secrets

      const fingerprints = getSecretsFingerprint();

      expect(fingerprints.DATABASE_URL).toBeNull();
      expect(fingerprints.API_SECRET_KEY).toBeNull();
    });

    it('should produce different fingerprints for different values', () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass1@localhost/db');
      const fingerprints1 = getSecretsFingerprint();

      vi.stubEnv('DATABASE_URL', 'postgresql://user:pass2@localhost/db');
      const fingerprints2 = getSecretsFingerprint();

      expect(fingerprints1.DATABASE_URL).not.toBe(fingerprints2.DATABASE_URL);
    });
  });

  describe('generateSecureKey', () => {
    it('should generate 32-byte key by default (64 hex chars)', () => {
      const key = generateSecureKey();

      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate key of specified length', () => {
      const key = generateSecureKey(16);

      expect(key).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should generate unique keys', () => {
      const key1 = generateSecureKey();
      const key2 = generateSecureKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('DEFAULT_SECRET_RULES', () => {
    it('should have rules for all critical secrets', () => {
      const criticalSecrets = [
        'DATABASE_URL',
        'API_SECRET_KEY',
        'HUBSPOT_ACCESS_TOKEN',
        'WHATSAPP_API_KEY',
        'OPENAI_API_KEY',
      ];

      for (const secret of criticalSecrets) {
        const rule = DEFAULT_SECRET_RULES.find(r => r.envVar === secret);
        expect(rule).toBeDefined();
        expect(rule?.requirement).toBe('required');
      }
    });

    it('should have proper patterns for format validation', () => {
      const patterned = DEFAULT_SECRET_RULES.filter(r => r.pattern);

      for (const rule of patterned) {
        expect(rule.pattern).toBeInstanceOf(RegExp);
      }
    });

    it('should have descriptions for all rules', () => {
      for (const rule of DEFAULT_SECRET_RULES) {
        expect(rule.description).toBeDefined();
        expect(rule.description.length).toBeGreaterThan(0);
      }
    });

    it('should have security impact for all rules', () => {
      for (const rule of DEFAULT_SECRET_RULES) {
        expect(rule.securityImpact).toBeDefined();
        expect(rule.securityImpact.length).toBeGreaterThan(0);
      }
    });
  });
});
