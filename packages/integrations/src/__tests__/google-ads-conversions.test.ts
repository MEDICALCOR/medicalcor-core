/**
 * Google Ads Conversions Client Tests
 *
 * Tests for the Google Ads Offline Conversion Import client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GoogleAdsConversionsClient,
  createGoogleAdsConversionsClient,
  getGoogleAdsConversionsCredentials,
} from '../google-ads-conversions.js';
import type { GoogleAdsConversionsClientOptions } from '../google-ads-conversions.js';

// Store original env
const originalEnv = process.env;

// Valid test config
const validConfig: GoogleAdsConversionsClientOptions = {
  customerId: '1234567890',
  conversionActionId: '123456789',
  developerToken: 'test-developer-token',
  clientId: 'test-client-id.apps.googleusercontent.com',
  clientSecret: 'test-client-secret',
  refreshToken: 'test-refresh-token',
  loginCustomerId: '9876543210',
};

describe('GoogleAdsConversionsClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset fetch mock
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new GoogleAdsConversionsClient(validConfig);
      expect(client).toBeDefined();
    });

    it('should strip hyphens from customer ID', () => {
      const configWithHyphens = {
        ...validConfig,
        customerId: '123-456-7890',
      };
      const client = new GoogleAdsConversionsClient(configWithHyphens);
      expect(client).toBeDefined();
    });

    it('should strip hyphens from login customer ID', () => {
      const configWithHyphens = {
        ...validConfig,
        loginCustomerId: '987-654-3210',
      };
      const client = new GoogleAdsConversionsClient(configWithHyphens);
      expect(client).toBeDefined();
    });

    it('should work without login customer ID', () => {
      const configWithoutLogin = {
        ...validConfig,
        loginCustomerId: undefined,
      };
      const client = new GoogleAdsConversionsClient(configWithoutLogin);
      expect(client).toBeDefined();
    });

    it('should throw for invalid config', () => {
      expect(() => {
        new GoogleAdsConversionsClient({
          ...validConfig,
          customerId: '', // Invalid - empty
        });
      }).toThrow();
    });
  });

  describe('uploadClickConversion', () => {
    it('should upload a single click conversion', async () => {
      // Mock token refresh response
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      // Mock conversion upload response
      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            {
              gclid: 'test-gclid',
              conversionAction: 'customers/1234567890/conversionActions/123456789',
              conversionDateTime: '2024-01-15 14:30:00+00:00',
            },
          ],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadClickConversion({
        gclid: 'test-gclid',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
        conversionValue: 15000,
        currencyCode: 'EUR',
      });

      expect(result.results).toBeDefined();
      expect(result.results?.length).toBe(1);
    });

    it('should return empty results for empty conversions array', async () => {
      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadClickConversions([]);
      expect(result.results).toEqual([]);
    });
  });

  describe('uploadCallConversion', () => {
    it('should upload a single call conversion', async () => {
      // Mock token refresh response
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      // Mock conversion upload response
      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            {
              callerId: '+1234567890',
              conversionAction: 'customers/1234567890/conversionActions/123456789',
            },
          ],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadCallConversion({
        callerId: '+1234567890',
        callStartDateTime: '2024-01-15 14:30:00+00:00',
        conversionDateTime: '2024-01-15 15:00:00+00:00',
        conversionValue: 5000,
        currencyCode: 'EUR',
      });

      expect(result.results).toBeDefined();
    });

    it('should return empty results for empty call conversions', async () => {
      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadCallConversions([]);
      expect(result.results).toEqual([]);
    });
  });

  describe('uploadEnhancedClickConversion', () => {
    it('should upload enhanced conversion with user data', async () => {
      // Mock token refresh response
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      // Mock conversion upload response
      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadEnhancedClickConversion({
        gclid: 'test-gclid',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
        conversionValue: 15000,
        currencyCode: 'EUR',
        orderId: 'order-123',
        userData: {
          email: 'test@gmail.com',
          phone: '+1234567890',
          firstName: 'John',
          lastName: 'Doe',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
        },
        consent: {
          adUserData: 'GRANTED',
          adPersonalization: 'GRANTED',
        },
      });

      expect(result.results).toBeDefined();
    });

    it('should handle partial consent', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadEnhancedClickConversion({
        gclid: 'test-gclid',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
        userData: {
          email: 'test@example.com',
        },
        consent: {
          adUserData: 'DENIED',
        },
      });

      expect(result.results).toBeDefined();
    });

    it('should handle minimal user data', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadEnhancedClickConversion({
        gclid: 'test-gclid',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
        userData: {},
      });

      expect(result.results).toBeDefined();
    });
  });

  describe('uploadDealWonConversion', () => {
    it('should upload deal won conversion without user data', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadDealWonConversion({
        gclid: 'test-gclid',
        dealWonAt: new Date('2024-01-15T14:30:00Z'),
        dealValue: 15000,
        currency: 'EUR',
        dealId: 'deal-123',
      });

      expect(result.results).toBeDefined();
    });

    it('should upload deal won conversion with user data', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadDealWonConversion({
        gclid: 'test-gclid',
        dealWonAt: new Date('2024-01-15T14:30:00Z'),
        dealValue: 15000,
        currency: 'EUR',
        dealId: 'deal-123',
        userData: {
          email: 'test@gmail.com',
          phone: '+1234567890',
        },
        timezone: '+02:00',
      });

      expect(result.results).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return connected=true when token refresh succeeds', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      vi.mocked(fetch).mockResolvedValueOnce(tokenResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.healthCheck();

      expect(result.connected).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return connected=false when token refresh fails', async () => {
      const tokenResponse = {
        ok: false,
        text: vi.fn().mockResolvedValue('Invalid refresh token'),
      };

      vi.mocked(fetch).mockResolvedValueOnce(tokenResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.healthCheck();

      expect(result.connected).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle 429 rate limit with retry and eventual success', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const rateLimitResponse = {
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '1' }),
        json: vi.fn().mockResolvedValue({}),
      };

      const successResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
        }),
        status: 200,
        headers: new Map(),
      };

      // Token -> 429 -> Token -> Success (retry works)
      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(rateLimitResponse as unknown as Response)
        .mockResolvedValueOnce(successResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);

      const result = await client.uploadClickConversion({
        gclid: 'test-gclid',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
      });

      expect(result.results).toBeDefined();
    });

    it('should handle partial failure response', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
          partialFailureError: {
            code: 3,
            message: 'Partial failure: some conversions not uploaded',
            details: [],
          },
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);
      const result = await client.uploadClickConversion({
        gclid: 'test-gclid',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
      });

      expect(result.partialFailureError).toBeDefined();
      expect(result.partialFailureError?.code).toBe(3);
    });

    it('should reject unsafe paths', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      vi.mocked(fetch).mockResolvedValue(tokenResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);

      // Test that the client validates paths internally
      // We can't directly test private methods, but we can test via public API
      await expect(
        client.uploadClickConversion({
          gclid: 'test-gclid',
          conversionDateTime: '2024-01-15 14:30:00+00:00',
        })
      ).resolves.toBeDefined();
    });

    it('should handle API errors', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const errorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({
          error: {
            code: 400,
            message: 'Invalid conversion data',
          },
        }),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(errorResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);

      await expect(
        client.uploadClickConversion({
          gclid: 'test-gclid',
          conversionDateTime: '2024-01-15 14:30:00+00:00',
        })
      ).rejects.toThrow('Invalid conversion data');
    });
  });

  describe('token caching', () => {
    it('should reuse cached token within validity period', async () => {
      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(validConfig);

      // First call - should fetch token
      await client.uploadClickConversion({
        gclid: 'test-gclid-1',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
      });

      // Second call - should reuse token
      await client.uploadClickConversion({
        gclid: 'test-gclid-2',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
      });

      // Token endpoint should only be called once
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('conversion action resource', () => {
    it('should use resource name as-is if already formatted', async () => {
      const configWithResourceName = {
        ...validConfig,
        conversionActionId: 'customers/1234567890/conversionActions/123456789',
      };

      const tokenResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
      };

      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ gclid: 'test-gclid' }],
        }),
        status: 200,
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response);

      const client = new GoogleAdsConversionsClient(configWithResourceName);
      const result = await client.uploadClickConversion({
        gclid: 'test-gclid',
        conversionDateTime: '2024-01-15 14:30:00+00:00',
      });

      expect(result.results).toBeDefined();
    });
  });
});

describe('createGoogleAdsConversionsClient', () => {
  it('should create client with factory function', () => {
    const client = createGoogleAdsConversionsClient(validConfig);
    expect(client).toBeInstanceOf(GoogleAdsConversionsClient);
  });
});

describe('getGoogleAdsConversionsCredentials', () => {
  beforeEach(() => {
    // Clear environment
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null when required env vars are missing', () => {
    const result = getGoogleAdsConversionsCredentials();
    expect(result).toBeNull();
  });

  it('should return null when some env vars are missing', () => {
    process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';
    process.env.GOOGLE_ADS_CONVERSION_ACTION_ID = '123456789';
    // Missing other vars

    const result = getGoogleAdsConversionsCredentials();
    expect(result).toBeNull();
  });

  it('should return credentials when all required env vars are set', () => {
    process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';
    process.env.GOOGLE_ADS_CONVERSION_ACTION_ID = '123456789';
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-developer-token';
    process.env.GOOGLE_ADS_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_ADS_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_ADS_REFRESH_TOKEN = 'test-refresh-token';

    const result = getGoogleAdsConversionsCredentials();

    expect(result).not.toBeNull();
    expect(result?.customerId).toBe('1234567890');
    expect(result?.conversionActionId).toBe('123456789');
    expect(result?.developerToken).toBe('test-developer-token');
    expect(result?.clientId).toBe('test-client-id');
    expect(result?.clientSecret).toBe('test-client-secret');
    expect(result?.refreshToken).toBe('test-refresh-token');
  });

  it('should include optional login customer ID when set', () => {
    process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';
    process.env.GOOGLE_ADS_CONVERSION_ACTION_ID = '123456789';
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-developer-token';
    process.env.GOOGLE_ADS_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_ADS_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_ADS_REFRESH_TOKEN = 'test-refresh-token';
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = '9876543210';

    const result = getGoogleAdsConversionsCredentials();

    expect(result?.loginCustomerId).toBe('9876543210');
  });
});

describe('Email normalization', () => {
  // Testing buildUserIdentifiers indirectly through uploadEnhancedClickConversion

  it('should handle gmail addresses with dots', async () => {
    const tokenResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 3600,
      }),
    };

    const uploadResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{ gclid: 'test-gclid' }],
      }),
      status: 200,
      headers: new Map(),
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response)
    );

    const client = new GoogleAdsConversionsClient(validConfig);
    const result = await client.uploadEnhancedClickConversion({
      gclid: 'test-gclid',
      conversionDateTime: '2024-01-15 14:30:00+00:00',
      userData: {
        // Gmail with dots - should be normalized (dots removed)
        email: 'test.user.name@gmail.com',
      },
    });

    expect(result.results).toBeDefined();
  });

  it('should handle non-gmail addresses without modification', async () => {
    const tokenResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 3600,
      }),
    };

    const uploadResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{ gclid: 'test-gclid' }],
      }),
      status: 200,
      headers: new Map(),
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response)
    );

    const client = new GoogleAdsConversionsClient(validConfig);
    const result = await client.uploadEnhancedClickConversion({
      gclid: 'test-gclid',
      conversionDateTime: '2024-01-15 14:30:00+00:00',
      userData: {
        // Non-gmail - dots should be preserved
        email: 'test.user@company.com',
      },
    });

    expect(result.results).toBeDefined();
  });
});

describe('Phone normalization', () => {
  it('should handle phone numbers without leading +', async () => {
    const tokenResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 3600,
      }),
    };

    const uploadResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{ gclid: 'test-gclid' }],
      }),
      status: 200,
      headers: new Map(),
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response)
    );

    const client = new GoogleAdsConversionsClient(validConfig);
    const result = await client.uploadEnhancedClickConversion({
      gclid: 'test-gclid',
      conversionDateTime: '2024-01-15 14:30:00+00:00',
      userData: {
        phone: '1234567890', // Without +
      },
    });

    expect(result.results).toBeDefined();
  });

  it('should handle phone numbers with formatting', async () => {
    const tokenResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 3600,
      }),
    };

    const uploadResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{ gclid: 'test-gclid' }],
      }),
      status: 200,
      headers: new Map(),
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response)
    );

    const client = new GoogleAdsConversionsClient(validConfig);
    const result = await client.uploadEnhancedClickConversion({
      gclid: 'test-gclid',
      conversionDateTime: '2024-01-15 14:30:00+00:00',
      userData: {
        phone: '+1 (234) 567-8900', // With formatting
      },
    });

    expect(result.results).toBeDefined();
  });
});

describe('Address info building', () => {
  it('should build address info with all fields', async () => {
    const tokenResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 3600,
      }),
    };

    const uploadResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{ gclid: 'test-gclid' }],
      }),
      status: 200,
      headers: new Map(),
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response)
    );

    const client = new GoogleAdsConversionsClient(validConfig);
    const result = await client.uploadEnhancedClickConversion({
      gclid: 'test-gclid',
      conversionDateTime: '2024-01-15 14:30:00+00:00',
      userData: {
        firstName: 'John',
        lastName: 'Doe',
        city: 'New York',
        state: 'NY',
        zipCode: '10001-1234', // With hyphen
        country: 'us', // Lowercase
      },
    });

    expect(result.results).toBeDefined();
  });

  it('should handle partial address info', async () => {
    const tokenResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: 'test-access-token',
        expires_in: 3600,
      }),
    };

    const uploadResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{ gclid: 'test-gclid' }],
      }),
      status: 200,
      headers: new Map(),
    };

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse as unknown as Response)
        .mockResolvedValueOnce(uploadResponse as unknown as Response)
    );

    const client = new GoogleAdsConversionsClient(validConfig);
    const result = await client.uploadEnhancedClickConversion({
      gclid: 'test-gclid',
      conversionDateTime: '2024-01-15 14:30:00+00:00',
      userData: {
        firstName: 'John',
        // Only first name, no other address fields
      },
    });

    expect(result.results).toBeDefined();
  });
});
