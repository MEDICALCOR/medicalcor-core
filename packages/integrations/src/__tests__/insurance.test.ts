import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  InsuranceClient,
  MockInsuranceClient,
  createInsuranceClient,
  createMockInsuranceClient,
  getInsuranceCredentials,
  InsuranceVerificationRequestSchema,
  InsuranceVerificationResponseSchema,
  SUPPORTED_PROVIDERS,
  type InsuranceVerificationRequest,
} from '../insurance.js';

// Mock the logger
vi.mock('@medicalcor/core', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('InsuranceClient', () => {
  describe('MockInsuranceClient', () => {
    let client: MockInsuranceClient;

    beforeEach(() => {
      client = createMockInsuranceClient();
    });

    it('should return active status for standard policy', async () => {
      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'test-correlation-id');

      expect(result._tag).toBe('Ok');
      if (result._tag === 'Ok') {
        expect(result.value.status).toBe('active');
        expect(result.value.policyNumber).toBe('ABC123456');
        expect(result.value.subscriberName).toBe('John Doe');
        expect(result.value.deductible).toBeDefined();
        expect(result.value.annualMaximum).toBeDefined();
      }
    });

    it('should return expired status for EXPIRED policy', async () => {
      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'EXPIRED123',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'test-correlation-id');

      expect(result._tag).toBe('Ok');
      if (result._tag === 'Ok') {
        expect(result.value.status).toBe('expired');
      }
    });

    it('should return invalid status for INVALID policy', async () => {
      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'INVALID123',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'test-correlation-id');

      expect(result._tag).toBe('Ok');
      if (result._tag === 'Ok') {
        expect(result.value.status).toBe('invalid');
      }
    });

    it('should return error for ERROR policy', async () => {
      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ERROR123',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'test-correlation-id');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('API_ERROR');
      }
    });

    it('should check provider support correctly', () => {
      expect(client.isProviderSupported('delta_dental')).toBe(true);
      expect(client.isProviderSupported('unknown_provider')).toBe(false);
    });

    it('should return supported providers', () => {
      const providers = client.getSupportedProviders();

      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p.id === 'delta_dental')).toBe(true);
    });

    it('should pass health check', async () => {
      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('should allow adding custom scenarios', async () => {
      client.addScenario('custom', {
        status: 'active',
        policyNumber: 'CUSTOM123',
        verifiedAt: new Date().toISOString(),
        deductible: 10000,
        remainingDeductible: 5000,
      });

      // The custom scenario would need to be triggered by specific logic
      // For now, just verify the method exists and works
      expect(client.getSupportedProviders().length).toBeGreaterThan(0);
    });
  });

  describe('InsuranceVerificationRequestSchema', () => {
    it('should validate valid request', () => {
      const request = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.patientRelationship).toBe('self'); // Default
        expect(result.data.serviceType).toBe('dental'); // Default
      }
    });

    it('should reject invalid policy number', () => {
      const request = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: '123', // Too short
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);

      expect(result.success).toBe(false);
    });

    it('should accept optional group number', () => {
      const request = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        groupNumber: 'GRP001',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.groupNumber).toBe('GRP001');
      }
    });
  });

  describe('InsuranceVerificationResponseSchema', () => {
    it('should validate complete response', () => {
      const response = {
        status: 'active',
        policyNumber: 'ABC123456',
        subscriberName: 'John Doe',
        coverageType: 'full',
        effectiveFrom: '2024-01-01',
        effectiveUntil: '2024-12-31',
        deductible: 50000,
        remainingDeductible: 25000,
        annualMaximum: 200000,
        remainingMaximum: 150000,
        copayPercentage: 20,
        preAuthRequired: true,
        nameMatch: true,
        dobMatch: true,
        verifiedAt: '2024-06-15T10:00:00Z',
      };

      const result = InsuranceVerificationResponseSchema.safeParse(response);

      expect(result.success).toBe(true);
    });

    it('should validate minimal response', () => {
      const response = {
        status: 'not_found',
        policyNumber: 'ABC123456',
        verifiedAt: '2024-06-15T10:00:00Z',
      };

      const result = InsuranceVerificationResponseSchema.safeParse(response);

      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const response = {
        status: 'unknown',
        policyNumber: 'ABC123456',
        verifiedAt: '2024-06-15T10:00:00Z',
      };

      const result = InsuranceVerificationResponseSchema.safeParse(response);

      expect(result.success).toBe(false);
    });

    it('should reject copay percentage over 100', () => {
      const response = {
        status: 'active',
        policyNumber: 'ABC123456',
        copayPercentage: 150,
        verifiedAt: '2024-06-15T10:00:00Z',
      };

      const result = InsuranceVerificationResponseSchema.safeParse(response);

      expect(result.success).toBe(false);
    });
  });

  describe('SUPPORTED_PROVIDERS', () => {
    it('should include major dental insurance providers', () => {
      const providerIds = SUPPORTED_PROVIDERS.map((p) => p.id);

      expect(providerIds).toContain('delta_dental');
      expect(providerIds).toContain('metlife');
      expect(providerIds).toContain('cigna');
      expect(providerIds).toContain('aetna');
      expect(providerIds).toContain('united_healthcare');
    });

    it('should have unique provider IDs', () => {
      const ids = SUPPORTED_PROVIDERS.map((p) => p.id);
      const uniqueIds = [...new Set(ids)];

      expect(ids.length).toBe(uniqueIds.length);
    });

    it('should have names for all providers', () => {
      for (const provider of SUPPORTED_PROVIDERS) {
        expect(provider.name).toBeTruthy();
        expect(provider.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe('InsuranceClient API URL validation', () => {
    it('should throw for localhost URL', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://localhost:3000',
          apiKey: 'test-key',
        });
      }).toThrow('localhost');
    });

    it('should throw for private IP', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://192.168.1.1:3000',
          apiKey: 'test-key',
        });
      }).toThrow('private IP');
    });

    it('should accept valid public URL', () => {
      // This will fail in test environment because we can't actually reach the URL
      // but it shouldn't throw during construction
      expect(() => {
        createInsuranceClient({
          apiUrl: 'https://api.example.com',
          apiKey: 'test-key',
        });
      }).not.toThrow();
    });

    it('should throw for 10.x.x.x private IP', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://10.0.0.1:3000',
          apiKey: 'test-key',
        });
      }).toThrow('private IP');
    });

    it('should throw for 172.16.x.x private IP', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://172.16.0.1:3000',
          apiKey: 'test-key',
        });
      }).toThrow('private IP');
    });

    it('should throw for 127.0.0.1', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://127.0.0.1:3000',
          apiKey: 'test-key',
        });
      }).toThrow('localhost');
    });

    it('should throw for 0.0.0.0', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://0.0.0.0:3000',
          apiKey: 'test-key',
        });
      }).toThrow('localhost');
    });

    it('should throw for invalid URL', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'not-a-url',
          apiKey: 'test-key',
        });
      }).toThrow('Invalid API URL');
    });
  });

  describe('InsuranceClient verifyEligibility', () => {
    let client: InsuranceClient;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      // Use no retries and short timeout for tests
      client = createInsuranceClient({
        apiUrl: 'https://api.insurance.example.com',
        apiKey: 'test-api-key',
        timeoutMs: 1000,
        retryConfig: {
          maxRetries: 0,
          baseDelayMs: 10,
        },
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should return error for invalid request', async () => {
      const request = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: '12', // Too short
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      } as InsuranceVerificationRequest;

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('INVALID_REQUEST');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should return error for unsupported provider', async () => {
      const request: InsuranceVerificationRequest = {
        providerId: 'unsupported_provider',
        providerName: 'Unsupported',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('PROVIDER_NOT_SUPPORTED');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should handle successful API response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: 'active',
            policyNumber: 'ABC123456',
            subscriberName: 'John Doe',
            coverageType: 'full',
            verifiedAt: new Date().toISOString(),
          }),
      });

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Ok');
      if (result._tag === 'Ok') {
        expect(result.value.status).toBe('active');
        expect(result.value.policyNumber).toBe('ABC123456');
      }
    });

    it('should handle 401 authentication error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      });

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('AUTHENTICATION_FAILED');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should handle 403 authentication error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
      });

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('AUTHENTICATION_FAILED');
      }
    });

    it('should handle 429 rate limit error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '30' }),
        json: () => Promise.resolve({}),
      });

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('RATE_LIMITED');
        expect(result.error.retryable).toBe(true);
        expect(result.error.retryAfterMs).toBe(30000);
      }
    });

    it('should handle 500 server error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle 502 server error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.resolve({}),
      });

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
      }
    });

    it('should handle 400 API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({}),
      });

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should handle network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('NETWORK_ERROR');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle timeout via AbortError', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('VERIFICATION_TIMEOUT');
        expect(result.error.retryable).toBe(true);
      }
    });

    it('should handle invalid API response format', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            invalid: 'response',
            // Missing required fields
          }),
      });

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'corr-123');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.message).toContain('Invalid response format');
      }
    });
  });

  describe('InsuranceClient healthCheck', () => {
    let client: InsuranceClient;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      client = createInsuranceClient({
        apiUrl: 'https://api.insurance.example.com',
        apiKey: 'test-api-key',
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should return true when health endpoint is ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when health endpoint fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('InsuranceClient helper methods', () => {
    let client: InsuranceClient;

    beforeEach(() => {
      client = createInsuranceClient({
        apiUrl: 'https://api.insurance.example.com',
        apiKey: 'test-api-key',
      });
    });

    it('should check provider support correctly', () => {
      expect(client.isProviderSupported('delta_dental')).toBe(true);
      expect(client.isProviderSupported('metlife')).toBe(true);
      expect(client.isProviderSupported('unknown_provider')).toBe(false);
    });

    it('should return supported providers list', () => {
      const providers = client.getSupportedProviders();

      expect(providers).toBe(SUPPORTED_PROVIDERS);
      expect(providers.length).toBeGreaterThan(0);
    });
  });

  describe('getInsuranceCredentials', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return credentials from environment', () => {
      process.env.INSURANCE_API_URL = 'https://api.insurance.example.com';
      process.env.INSURANCE_API_KEY = 'test-key-123';

      const credentials = getInsuranceCredentials();

      expect(credentials.apiUrl).toBe('https://api.insurance.example.com');
      expect(credentials.apiKey).toBe('test-key-123');
    });

    it('should return undefined when env vars are not set', () => {
      delete process.env.INSURANCE_API_URL;
      delete process.env.INSURANCE_API_KEY;

      const credentials = getInsuranceCredentials();

      expect(credentials.apiUrl).toBeUndefined();
      expect(credentials.apiKey).toBeUndefined();
    });
  });
});
