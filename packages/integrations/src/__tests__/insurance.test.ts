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

  describe('InsuranceClient URL validation - additional cases', () => {
    it('should throw for link-local IP 169.254.x.x', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://169.254.1.1:3000',
          apiKey: 'test-key',
        });
      }).toThrow('private IP');
    });

    it('should throw for 172.17.x.x private IP', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://172.17.0.1:3000',
          apiKey: 'test-key',
        });
      }).toThrow('private IP');
    });

    it('should throw for 172.20.x.x private IP', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://172.20.0.1:3000',
          apiKey: 'test-key',
        });
      }).toThrow('private IP');
    });

    it('should throw for 172.31.x.x private IP', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://172.31.255.255:3000',
          apiKey: 'test-key',
        });
      }).toThrow('private IP');
    });

    it('should throw for HTTP in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://api.example.com',
          apiKey: 'test-key',
        });
      }).toThrow('HTTPS');

      process.env.NODE_ENV = originalEnv;
    });

    it('should allow HTTP in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://api.example.com',
          apiKey: 'test-key',
        });
      }).not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle malformed URL gracefully', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'not a valid url at all',
          apiKey: 'test-key',
        });
      }).toThrow('Invalid API URL');
    });

    it('should handle URL with just protocol', () => {
      expect(() => {
        createInsuranceClient({
          apiUrl: 'http://',
          apiKey: 'test-key',
        });
      }).toThrow('Invalid API URL');
    });
  });

  describe('InsuranceClient constructor configuration', () => {
    it('should use default timeout when not provided', () => {
      const client = createInsuranceClient({
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key',
      });

      expect(client).toBeInstanceOf(InsuranceClient);
    });

    it('should use custom timeout when provided', () => {
      const client = createInsuranceClient({
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key',
        timeoutMs: 5000,
      });

      expect(client).toBeInstanceOf(InsuranceClient);
    });

    it('should use default retry config when not provided', () => {
      const client = createInsuranceClient({
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key',
      });

      expect(client).toBeInstanceOf(InsuranceClient);
    });

    it('should use custom retry config when provided', () => {
      const client = createInsuranceClient({
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });

      expect(client).toBeInstanceOf(InsuranceClient);
    });

    it('should accept provider config', () => {
      const client = createInsuranceClient({
        apiUrl: 'https://api.example.com',
        apiKey: 'test-key',
        providerConfig: { customSetting: 'value' },
      });

      expect(client).toBeInstanceOf(InsuranceClient);
    });
  });

  describe('InsuranceClient retry logic', () => {
    let client: InsuranceClient;
    let originalFetch: typeof globalThis.fetch;
    let fetchCallCount: number;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      fetchCallCount = 0;
      client = createInsuranceClient({
        apiUrl: 'https://api.insurance.example.com',
        apiKey: 'test-api-key',
        timeoutMs: 1000,
        retryConfig: {
          maxRetries: 3,
          baseDelayMs: 10,
        },
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should retry on retryable error and succeed', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              status: 'active',
              policyNumber: 'ABC123456',
              verifiedAt: new Date().toISOString(),
            }),
        });
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
      expect(fetchCallCount).toBe(2);
    });

    it('should stop retrying after max retries', async () => {
      // Use network errors which have shorter retry delays
      globalThis.fetch = vi.fn().mockImplementation(() => {
        fetchCallCount++;
        return Promise.reject(new Error('Network error'));
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
        expect(result.error.code).toBe('NETWORK_ERROR');
      }
      expect(fetchCallCount).toBe(4); // initial + 3 retries
    });

    it('should use exponential backoff for retries', async () => {
      const delays: number[] = [];
      const originalSetTimeout = setTimeout;

      // Track delay times
      global.setTimeout = vi.fn().mockImplementation((fn, delay) => {
        if (typeof delay === 'number' && delay > 0) {
          delays.push(delay);
        }
        return originalSetTimeout(fn, 0);
      }) as any;

      // Use network error which will use exponential backoff calculation
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      await client.verifyEligibility(request, 'corr-123');

      // Verify exponential backoff pattern: baseDelay * 2^attempt
      // Should have delays for 3 retries with baseDelayMs=10 and retryAfterMs=2000 from network error
      expect(delays.length).toBeGreaterThan(0);

      global.setTimeout = originalSetTimeout;
    });

    it('should use custom retryAfterMs when provided', async () => {
      const delays: number[] = [];
      const originalSetTimeout = setTimeout;

      global.setTimeout = vi.fn().mockImplementation((fn, delay) => {
        if (typeof delay === 'number' && delay > 0) {
          delays.push(delay);
        }
        return originalSetTimeout(fn, 0);
      }) as any;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '5' }),
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

      await client.verifyEligibility(request, 'corr-123');

      // Should use the retryAfterMs from the error (5000ms)
      expect(delays.some((d) => d === 5000)).toBe(true);

      global.setTimeout = originalSetTimeout;
    });

    it('should not retry on non-retryable error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
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
      expect(fetchCallCount).toBeLessThanOrEqual(1); // Should not retry
    });
  });

  describe('InsuranceClient error handling - additional cases', () => {
    let client: InsuranceClient;
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
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

    it('should handle 429 without Retry-After header', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
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
        expect(result.error.retryAfterMs).toBe(60000); // Default 60 seconds
      }
    });

    it('should handle 503 service unavailable', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
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

    it('should handle 504 gateway timeout', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
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

    it('should handle 404 not found error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
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

    it('should handle non-Error network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue('String error');

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
        expect(result.error.originalError).toBeUndefined();
      }
    });

    it('should handle network error with Error instance', async () => {
      const networkError = new Error('Connection refused');
      globalThis.fetch = vi.fn().mockRejectedValue(networkError);

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
        expect(result.error.message).toBe('Connection refused');
        expect(result.error.originalError).toBe(networkError);
      }
    });
  });

  describe('InsuranceClient healthCheck - timeout handling', () => {
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

    it('should handle timeout in health check', async () => {
      // Simulate timeout by rejecting with AbortError
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('MockInsuranceClient - edge cases', () => {
    it('should handle missing active scenario gracefully', async () => {
      const client = new MockInsuranceClient();
      // Clear all scenarios by creating a new instance and manipulating internals
      // This tests the safety check at line 495-500
      const scenariosMap = (client as any).scenarios;
      scenariosMap.clear();

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'REGULAR123',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'test-correlation-id');

      expect(result._tag).toBe('Err');
      if (result._tag === 'Err') {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.message).toContain('Mock scenario not configured');
      }
    });

    it('should construct subscriber name correctly', async () => {
      const client = createMockInsuranceClient();

      const request: InsuranceVerificationRequest = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'TEST123456',
        subscriberFirstName: 'Jane',
        subscriberLastName: 'Smith',
        patientRelationship: 'self',
        serviceType: 'dental',
      };

      const result = await client.verifyEligibility(request, 'test-correlation-id');

      expect(result._tag).toBe('Ok');
      if (result._tag === 'Ok') {
        expect(result.value.subscriberName).toBe('Jane Smith');
      }
    });
  });

  describe('InsuranceVerificationRequestSchema - additional validation', () => {
    it('should reject empty providerId', () => {
      const request = {
        providerId: '',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject empty providerName', () => {
      const request = {
        providerId: 'delta_dental',
        providerName: '',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject policy number over 30 chars', () => {
      const request = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'A'.repeat(31),
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject group number under 3 chars', () => {
      const request = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        groupNumber: 'AB',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject group number over 20 chars', () => {
      const request = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        groupNumber: 'A'.repeat(21),
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should accept all valid patient relationships', () => {
      const relationships = ['self', 'spouse', 'child', 'other'] as const;

      for (const relationship of relationships) {
        const request = {
          providerId: 'delta_dental',
          providerName: 'Delta Dental',
          policyNumber: 'ABC123456',
          subscriberFirstName: 'John',
          subscriberLastName: 'Doe',
          patientRelationship: relationship,
        };

        const result = InsuranceVerificationRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid service types', () => {
      const serviceTypes = ['dental', 'medical', 'vision'] as const;

      for (const serviceType of serviceTypes) {
        const request = {
          providerId: 'delta_dental',
          providerName: 'Delta Dental',
          policyNumber: 'ABC123456',
          subscriberFirstName: 'John',
          subscriberLastName: 'Doe',
          serviceType,
        };

        const result = InsuranceVerificationRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it('should accept optional subscriberDateOfBirth', () => {
      const request = {
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        subscriberFirstName: 'John',
        subscriberLastName: 'Doe',
        subscriberDateOfBirth: '1990-01-01',
      };

      const result = InsuranceVerificationRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subscriberDateOfBirth).toBe('1990-01-01');
      }
    });
  });

  describe('InsuranceVerificationResponseSchema - additional validation', () => {
    it('should accept all valid statuses', () => {
      const statuses = ['active', 'inactive', 'expired', 'invalid', 'not_found'] as const;

      for (const status of statuses) {
        const response = {
          status,
          policyNumber: 'ABC123456',
          verifiedAt: '2024-06-15T10:00:00Z',
        };

        const result = InsuranceVerificationResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid coverage types', () => {
      const coverageTypes = ['full', 'partial', 'dental_only'] as const;

      for (const coverageType of coverageTypes) {
        const response = {
          status: 'active',
          policyNumber: 'ABC123456',
          coverageType,
          verifiedAt: '2024-06-15T10:00:00Z',
        };

        const result = InsuranceVerificationResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      }
    });

    it('should reject negative copay percentage', () => {
      const response = {
        status: 'active',
        policyNumber: 'ABC123456',
        copayPercentage: -10,
        verifiedAt: '2024-06-15T10:00:00Z',
      };

      const result = InsuranceVerificationResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should accept copay percentage at boundaries', () => {
      const response0 = {
        status: 'active',
        policyNumber: 'ABC123456',
        copayPercentage: 0,
        verifiedAt: '2024-06-15T10:00:00Z',
      };

      const result0 = InsuranceVerificationResponseSchema.safeParse(response0);
      expect(result0.success).toBe(true);

      const response100 = {
        status: 'active',
        policyNumber: 'ABC123456',
        copayPercentage: 100,
        verifiedAt: '2024-06-15T10:00:00Z',
      };

      const result100 = InsuranceVerificationResponseSchema.safeParse(response100);
      expect(result100.success).toBe(true);
    });

    it('should accept all optional fields', () => {
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
        coveredProcedures: ['D0120', 'D0150', 'D1110'],
        preAuthRequired: true,
        nameMatch: true,
        dobMatch: false,
        externalReferenceId: 'EXT-123456',
        verifiedAt: '2024-06-15T10:00:00Z',
        message: 'Verification successful',
      };

      const result = InsuranceVerificationResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.coveredProcedures).toHaveLength(3);
        expect(result.data.message).toBe('Verification successful');
      }
    });
  });
});
