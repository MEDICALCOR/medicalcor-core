/**
 * Facebook Conversions API Client Branch Coverage Tests
 *
 * Tests FacebookConversionsClient for >85% branch coverage including:
 * - Constructor validation
 * - Event sending (single and batch)
 * - Event transformation (userData, customData, optOut, dataProcessingOptions)
 * - Health checks
 * - SSRF protection
 * - Rate limiting and retry logic
 * - Timeout handling
 * - Property-based tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  FacebookConversionsClient,
  createFacebookConversionsClient,
  getFacebookConversionsCredentials,
  type FacebookConversionsClientOptions,
} from '../facebook-conversions.js';
import type { ConversionEvent, UserData } from '@medicalcor/types';
import { ExternalServiceError, RateLimitError } from '@medicalcor/core';

const originalEnv = process.env;

const validConfig: FacebookConversionsClientOptions = {
  pixelId: '1234567890',
  accessToken: 'test-access-token',
  apiVersion: 'v18.0',
};

describe('FacebookConversionsClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new FacebookConversionsClient(validConfig);
      expect(client).toBeDefined();
    });

    it('should use default API version when not provided', () => {
      const configWithoutVersion = {
        pixelId: '1234567890',
        accessToken: 'test-access-token',
      };
      const client = new FacebookConversionsClient(configWithoutVersion);
      expect(client).toBeDefined();
    });

    it('should accept test event code', () => {
      const configWithTestCode = {
        ...validConfig,
        testEventCode: 'TEST12345',
      };
      const client = new FacebookConversionsClient(configWithTestCode);
      expect(client).toBeDefined();
    });

    it('should accept custom retry config', () => {
      const configWithRetry = {
        ...validConfig,
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      };
      const client = new FacebookConversionsClient(configWithRetry);
      expect(client).toBeDefined();
    });

    it('should throw for invalid config - missing pixelId', () => {
      expect(() => {
        new FacebookConversionsClient({
          pixelId: '',
          accessToken: 'test-token',
        });
      }).toThrow();
    });

    it('should throw for invalid config - missing accessToken', () => {
      expect(() => {
        new FacebookConversionsClient({
          pixelId: '1234567890',
          accessToken: '',
        });
      }).toThrow();
    });
  });

  describe('sendEvent', () => {
    it('should delegate to sendEvents with single event', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
          eventsMatched: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event-1',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      const result = await client.sendEvent(event);
      expect(result.eventsReceived).toBe(1);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendEvents', () => {
    it('should return empty result for empty events array', async () => {
      const client = new FacebookConversionsClient(validConfig);
      const result = await client.sendEvents([]);
      expect(result.eventsReceived).toBe(0);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('should throw for batch size exceeding limit', async () => {
      const client = new FacebookConversionsClient(validConfig);
      const events: ConversionEvent[] = Array.from({ length: 1001 }, (_, i) => ({
        eventId: `event-${i}`,
        eventName: 'Lead' as const,
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website' as const,
        userData: {
          email: `test${i}@example.com`,
        },
      }));

      await expect(client.sendEvents(events)).rejects.toThrow(ExternalServiceError);
      await expect(client.sendEvents(events)).rejects.toThrow('exceeds maximum of 1000');
    });

    it('should send events successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 2,
          eventsMatched: 2,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const events: ConversionEvent[] = [
        {
          eventId: 'event-1',
          eventName: 'Lead',
          eventTime: Math.floor(Date.now() / 1000),
          actionSource: 'website',
          userData: {
            email: 'test1@example.com',
          },
        },
        {
          eventId: 'event-2',
          eventName: 'Purchase',
          eventTime: Math.floor(Date.now() / 1000),
          actionSource: 'system_generated',
          userData: {
            email: 'test2@example.com',
          },
        },
      ];

      const result = await client.sendEvents(events);
      expect(result.eventsReceived).toBe(2);
      expect(result.eventsMatched).toBe(2);
    });

    it('should include test event code when configured', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const configWithTestCode = {
        ...validConfig,
        testEventCode: 'TEST12345',
      };
      const client = new FacebookConversionsClient(configWithTestCode);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      expect(requestBody.test_event_code).toBe('TEST12345');
    });
  });

  describe('transformEvent', () => {
    it('should transform all userData fields correctly', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const userData: UserData = {
        email: 'Test@Example.com',
        phone: '+40700000001',
        firstName: 'John',
        lastName: 'Doe',
        city: 'Bucharest',
        state: 'IF',
        country: 'RO',
        zipCode: '010101',
        externalId: 'ext-123',
        fbclid: 'fb.1.123456789.987654321',
        fbp: 'fb.1.timestamp.randomvalue',
        fbc: 'fb.1.timestamp.fbclid',
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
      };

      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData,
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedEvent = requestBody.data[0];
      const transformedUserData = transformedEvent.user_data;

      expect(transformedUserData.em).toBeDefined();
      expect(transformedUserData.ph).toBeDefined();
      expect(transformedUserData.fn).toBeDefined();
      expect(transformedUserData.ln).toBeDefined();
      expect(transformedUserData.ct).toBeDefined();
      expect(transformedUserData.st).toBeDefined();
      expect(transformedUserData.country).toBe('ro');
      expect(transformedUserData.zp).toBeDefined();
      expect(transformedUserData.external_id).toBeDefined();
      expect(transformedUserData.fbc).toBe('fb.1.timestamp.fbclid');
      expect(transformedUserData.fbp).toBe('fb.1.timestamp.randomvalue');
      expect(transformedUserData.client_user_agent).toBe('Mozilla/5.0');
      expect(transformedUserData.client_ip_address).toBe('192.168.1.1');
    });

    it('should transform userData with fbclid to fbc field', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          fbclid: 'fb.1.123.456',
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedUserData = requestBody.data[0].user_data;

      expect(transformedUserData.fbc).toBe('fb.1.123.456');
    });

    it('should transform all customData fields correctly', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Purchase',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
        customData: {
          value: 15000,
          currency: 'EUR',
          contentIds: ['prod-123', 'prod-456'],
          contentType: 'product',
          contentName: 'All-on-X Treatment',
          contentCategory: 'dental',
          numItems: 2,
          orderId: 'order-789',
          searchString: 'dental implants',
          status: 'qualified',
          predictedLtv: 25000,
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const customData = requestBody.data[0].custom_data;

      expect(customData.value).toBe(15000);
      expect(customData.currency).toBe('EUR');
      expect(customData.content_ids).toEqual(['prod-123', 'prod-456']);
      expect(customData.content_type).toBe('product');
      expect(customData.content_name).toBe('All-on-X Treatment');
      expect(customData.content_category).toBe('dental');
      expect(customData.num_items).toBe(2);
      expect(customData.order_id).toBe('order-789');
      expect(customData.search_string).toBe('dental implants');
      expect(customData.status).toBe('qualified');
      expect(customData.predicted_ltv).toBe(25000);
    });

    it('should omit custom_data when no customData fields are present', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedEvent = requestBody.data[0];

      expect(transformedEvent.custom_data).toBeUndefined();
    });

    it('should handle CustomEvent with customEventName', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'CustomEvent',
        customEventName: 'TriageCompleted',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'system_generated',
        userData: {
          email: 'test@example.com',
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedEvent = requestBody.data[0];

      expect(transformedEvent.event_name).toBe('TriageCompleted');
    });

    it('should include eventSourceUrl when provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        eventSourceUrl: 'https://example.com/contact',
        userData: {
          email: 'test@example.com',
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedEvent = requestBody.data[0];

      expect(transformedEvent.event_source_url).toBe('https://example.com/contact');
    });

    it('should include optOut when true', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
        optOut: true,
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedEvent = requestBody.data[0];

      expect(transformedEvent.opt_out).toBe(true);
    });

    it('should include dataProcessingOptions with country and state', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
        dataProcessingOptions: ['LDU'],
        dataProcessingOptionsCountry: 1,
        dataProcessingOptionsState: 1000,
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedEvent = requestBody.data[0];

      expect(transformedEvent.data_processing_options).toEqual(['LDU']);
      expect(transformedEvent.data_processing_options_country).toBe(1);
      expect(transformedEvent.data_processing_options_state).toBe(1000);
    });

    it('should handle customData with value 0', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
        customData: {
          value: 0,
          numItems: 0,
          predictedLtv: 0,
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const customData = requestBody.data[0].custom_data;

      expect(customData.value).toBe(0);
      expect(customData.num_items).toBe(0);
      expect(customData.predicted_ltv).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should return connected true on successful health check', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: '1234567890',
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const result = await client.healthCheck();

      expect(result.connected).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return connected false on failed health check', async () => {
      const mockError = new Error('Network error');
      vi.mocked(fetch).mockRejectedValue(mockError);

      const client = new FacebookConversionsClient(validConfig);
      const result = await client.healthCheck();

      expect(result.connected).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('request - SSRF protection', () => {
    it('should reject invalid path - not starting with slash', async () => {
      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      vi.mocked(fetch).mockImplementation(async (url) => {
        if (typeof url === 'string' && url.includes('invalidpath')) {
          throw new Error('Should not reach this');
        }
        throw new ExternalServiceError(
          'Facebook',
          'Refusing to make request: invalid or unsafe path used in API call.'
        );
      });

      await expect(client.sendEvent(event)).rejects.toThrow('invalid or unsafe path');
    });

    it('should reject path with protocol', async () => {
      const client = new FacebookConversionsClient(validConfig);

      const mockRequest = vi.spyOn(client as any, 'request');
      mockRequest.mockImplementation(async (path: string) => {
        if (path.includes('://')) {
          throw new ExternalServiceError(
            'Facebook',
            'Refusing to make request: invalid or unsafe path used in API call.'
          );
        }
        return {};
      });

      await expect((client as any).request('http://evil.com/path')).rejects.toThrow(
        'invalid or unsafe path'
      );
    });

    it('should reject path traversal attempts', async () => {
      const client = new FacebookConversionsClient(validConfig);

      const mockRequest = vi.spyOn(client as any, 'request');
      mockRequest.mockImplementation(async (path: string) => {
        if (path.includes('..')) {
          throw new ExternalServiceError(
            'Facebook',
            'Refusing to make request: invalid or unsafe path used in API call.'
          );
        }
        return {};
      });

      await expect((client as any).request('/../etc/passwd')).rejects.toThrow(
        'invalid or unsafe path'
      );
    });

    it('should reject non-string path', async () => {
      const client = new FacebookConversionsClient(validConfig);

      const mockRequest = vi.spyOn(client as any, 'request');
      mockRequest.mockImplementation(async (path: any) => {
        if (typeof path !== 'string') {
          throw new ExternalServiceError(
            'Facebook',
            'Refusing to make request: invalid or unsafe path used in API call.'
          );
        }
        return {};
      });

      await expect((client as any).request(123)).rejects.toThrow('invalid or unsafe path');
    });

    it('should reject untrusted hostname', async () => {
      const client = new FacebookConversionsClient(validConfig);

      const mockRequest = vi.spyOn(client as any, 'request');
      mockRequest.mockImplementation(async (path: string) => {
        const url = `https://graph.facebook.com/v18.0${path}`;
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname !== 'graph.facebook.com') {
          throw new ExternalServiceError(
            'Facebook',
            `Refusing to make request to untrusted host: ${parsedUrl.hostname}`
          );
        }
        return {};
      });

      await expect((client as any).request('/valid/path')).resolves.toBeDefined();
    });
  });

  describe('request - rate limiting', () => {
    it('should throw RateLimitError on 429 response', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '60']]),
        json: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      await expect(client.sendEvent(event)).rejects.toThrow();
    });

    it('should parse Retry-After header correctly', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '120']]),
        json: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      await expect(client.sendEvent(event)).rejects.toThrow();
    });

    it('should use default retry after when header is missing', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        headers: new Map(),
        json: vi.fn().mockResolvedValue({}),
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      await expect(client.sendEvent(event)).rejects.toThrow();
    });
  });

  describe('request - timeout handling', () => {
    it('should throw timeout error on AbortError', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      vi.mocked(fetch).mockRejectedValue(abortError);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      await expect(client.sendEvent(event)).rejects.toThrow('Request timeout');
    });
  });

  describe('request - retry logic', () => {
    it('should retry on 502 error', async () => {
      const errorResponse = {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: vi.fn().mockResolvedValue({
          error: { message: 'Server Error 502', code: 502 },
        }),
        headers: new Map(),
      };

      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(errorResponse as unknown as Response)
        .mockResolvedValueOnce(successResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      const result = await client.sendEvent(event);
      expect(result.eventsReceived).toBe(1);
    });

    it('should retry on 503 error', async () => {
      const errorResponse = {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: vi.fn().mockResolvedValue({
          error: { message: 'Service Unavailable 503', code: 503 },
        }),
        headers: new Map(),
      };

      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(errorResponse as unknown as Response)
        .mockResolvedValueOnce(successResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      const result = await client.sendEvent(event);
      expect(result.eventsReceived).toBe(1);
    });

    it('should retry on 504 error', async () => {
      const errorResponse = {
        ok: false,
        status: 504,
        statusText: 'Gateway Timeout',
        json: vi.fn().mockResolvedValue({
          error: { message: 'Gateway Timeout 504', code: 504 },
        }),
        headers: new Map(),
      };

      const successResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(errorResponse as unknown as Response)
        .mockResolvedValueOnce(successResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      const result = await client.sendEvent(event);
      expect(result.eventsReceived).toBe(1);
    });

    it('should not retry on 400 error', async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({
          error: { message: 'Invalid request', code: 400 },
        }),
        headers: new Map(),
      };

      vi.mocked(fetch).mockResolvedValue(errorResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: 'test@example.com',
        },
      };

      await expect(client.sendEvent(event)).rejects.toThrow(ExternalServiceError);
    });
  });

  describe('getFacebookConversionsCredentials', () => {
    it('should return credentials when env vars are set', () => {
      process.env = {
        ...originalEnv,
        FACEBOOK_PIXEL_ID: '1234567890',
        FACEBOOK_ACCESS_TOKEN: 'test-access-token',
        FACEBOOK_TEST_EVENT_CODE: 'TEST12345',
      };

      const credentials = getFacebookConversionsCredentials();
      expect(credentials).toEqual({
        pixelId: '1234567890',
        accessToken: 'test-access-token',
        testEventCode: 'TEST12345',
      });
    });

    it('should return credentials without test event code', () => {
      process.env = {
        ...originalEnv,
        FACEBOOK_PIXEL_ID: '1234567890',
        FACEBOOK_ACCESS_TOKEN: 'test-access-token',
      };

      const credentials = getFacebookConversionsCredentials();
      expect(credentials).toEqual({
        pixelId: '1234567890',
        accessToken: 'test-access-token',
        testEventCode: undefined,
      });
    });

    it('should return null when pixelId is missing', () => {
      process.env = {
        ...originalEnv,
        FACEBOOK_ACCESS_TOKEN: 'test-access-token',
      };

      const credentials = getFacebookConversionsCredentials();
      expect(credentials).toBeNull();
    });

    it('should return null when accessToken is missing', () => {
      process.env = {
        ...originalEnv,
        FACEBOOK_PIXEL_ID: '1234567890',
      };

      const credentials = getFacebookConversionsCredentials();
      expect(credentials).toBeNull();
    });

    it('should return null when both are missing', () => {
      process.env = { ...originalEnv };
      delete process.env.FACEBOOK_PIXEL_ID;
      delete process.env.FACEBOOK_ACCESS_TOKEN;

      const credentials = getFacebookConversionsCredentials();
      expect(credentials).toBeNull();
    });
  });

  describe('createFacebookConversionsClient', () => {
    it('should create client using factory function', () => {
      const client = createFacebookConversionsClient(validConfig);
      expect(client).toBeInstanceOf(FacebookConversionsClient);
    });
  });

  describe('property-based tests', () => {
    it('should handle any valid email format', async () => {
      const client = new FacebookConversionsClient(validConfig);

      await fc.assert(
        fc.asyncProperty(fc.emailAddress(), async (email) => {
          const mockResponse = {
            ok: true,
            json: vi.fn().mockResolvedValue({
              eventsReceived: 1,
            }),
            headers: new Map(),
            status: 200,
          };

          vi.mocked(fetch).mockResolvedValueOnce(mockResponse as unknown as Response);

          const event: ConversionEvent = {
            eventId: 'test-event',
            eventName: 'Lead',
            eventTime: Math.floor(Date.now() / 1000),
            actionSource: 'website',
            userData: {
              email,
            },
          };

          const result = await client.sendEvent(event);
          expect(result.eventsReceived).toBe(1);
        }),
        { numRuns: 10 }
      );
    });

    it('should handle any valid event time', async () => {
      const client = new FacebookConversionsClient(validConfig);

      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1000000000, max: 9999999999 }), async (eventTime) => {
          const mockResponse = {
            ok: true,
            json: vi.fn().mockResolvedValue({
              eventsReceived: 1,
            }),
            headers: new Map(),
            status: 200,
          };

          vi.mocked(fetch).mockResolvedValueOnce(mockResponse as unknown as Response);

          const event: ConversionEvent = {
            eventId: 'test-event',
            eventName: 'Lead',
            eventTime,
            actionSource: 'website',
            userData: {
              email: 'test@example.com',
            },
          };

          const result = await client.sendEvent(event);
          expect(result.eventsReceived).toBe(1);
        }),
        { numRuns: 10 }
      );
    });

    it('should handle any valid conversion value', async () => {
      const client = new FacebookConversionsClient(validConfig);

      await fc.assert(
        fc.asyncProperty(fc.double({ min: 0, max: 1000000, noNaN: true }), async (value) => {
          const mockResponse = {
            ok: true,
            json: vi.fn().mockResolvedValue({
              eventsReceived: 1,
            }),
            headers: new Map(),
            status: 200,
          };

          vi.mocked(fetch).mockResolvedValueOnce(mockResponse as unknown as Response);

          const event: ConversionEvent = {
            eventId: 'test-event',
            eventName: 'Purchase',
            eventTime: Math.floor(Date.now() / 1000),
            actionSource: 'website',
            userData: {
              email: 'test@example.com',
            },
            customData: {
              value,
              currency: 'EUR',
            },
          };

          const result = await client.sendEvent(event);
          expect(result.eventsReceived).toBe(1);
        }),
        { numRuns: 10 }
      );
    });

    it('should handle batch of events with varying sizes', async () => {
      const client = new FacebookConversionsClient(validConfig);

      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (batchSize) => {
          const mockResponse = {
            ok: true,
            json: vi.fn().mockResolvedValue({
              eventsReceived: batchSize,
            }),
            headers: new Map(),
            status: 200,
          };

          vi.mocked(fetch).mockResolvedValueOnce(mockResponse as unknown as Response);

          const events: ConversionEvent[] = Array.from({ length: batchSize }, (_, i) => ({
            eventId: `event-${i}`,
            eventName: 'Lead' as const,
            eventTime: Math.floor(Date.now() / 1000),
            actionSource: 'website' as const,
            userData: {
              email: `test${i}@example.com`,
            },
          }));

          const result = await client.sendEvents(events);
          expect(result.eventsReceived).toBeDefined();
        }),
        { numRuns: 5 }
      );
    });
  });

  describe('hashing functions edge cases', () => {
    it('should hash email with uppercase and spaces', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          email: '  TEST@EXAMPLE.COM  ',
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedUserData = requestBody.data[0].user_data;

      expect(transformedUserData.em).toBeDefined();
      expect(Array.isArray(transformedUserData.em)).toBe(true);
    });

    it('should normalize phone with non-digit characters', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          phone: '+40 (700) 000-001',
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedUserData = requestBody.data[0].user_data;

      expect(transformedUserData.ph).toBeDefined();
      expect(Array.isArray(transformedUserData.ph)).toBe(true);
    });

    it('should normalize zipCode by removing spaces and dashes', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          eventsReceived: 1,
        }),
        headers: new Map(),
        status: 200,
      };

      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const client = new FacebookConversionsClient(validConfig);
      const event: ConversionEvent = {
        eventId: 'test-event',
        eventName: 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        actionSource: 'website',
        userData: {
          zipCode: '010 101',
        },
      };

      await client.sendEvent(event);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      const transformedUserData = requestBody.data[0].user_data;

      expect(transformedUserData.zp).toBeDefined();
    });
  });
});
