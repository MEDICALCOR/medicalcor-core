/**
 * Resilient Fetch Unit Tests
 *
 * Tests for the resilient networking utilities including:
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Circuit breaker integration
 * - Service client creation
 * - withRetry utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../integrations/src/__mocks__/server.js';
import {
  resilientFetch,
  resilientJsonFetch,
  createServiceClient,
  withRetry,
} from '../resilient-fetch.js';
import { globalCircuitBreakerRegistry } from '../circuit-breaker.js';

const TEST_BASE_URL = 'https://test-api.medicalcor.local';

describe('resilientFetch', () => {
  beforeEach(() => {
    globalCircuitBreakerRegistry.resetAll();
  });

  describe('Successful Requests', () => {
    it('should return success for 2xx responses', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/data`, () => {
          return HttpResponse.json({ data: 'test' });
        })
      );

      const result = await resilientFetch<{ data: string }>(`${TEST_BASE_URL}/data`, {
        skipLogging: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test' });
      expect(result.status).toBe(200);
      expect(result.attempts).toBe(1);
    });

    it('should handle text responses', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/text`, () => {
          return new HttpResponse('plain text response', {
            headers: { 'Content-Type': 'text/plain' },
          });
        })
      );

      const result = await resilientFetch<string>(`${TEST_BASE_URL}/text`, {
        skipLogging: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('plain text response');
    });

    it('should track duration', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/timed`, () => {
          return HttpResponse.json({});
        })
      );

      const result = await resilientFetch(`${TEST_BASE_URL}/timed`, {
        skipLogging: true,
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should return error for non-2xx responses', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/missing`, () => {
          return new HttpResponse('Resource not found', { status: 404 });
        })
      );

      const result = await resilientFetch(`${TEST_BASE_URL}/missing`, {
        skipLogging: true,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error).toBe('Resource not found');
      expect(result.errorCode).toBe('HTTP_404');
    });

    it('should handle network errors', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/network-error`, () => {
          return HttpResponse.error();
        })
      );

      const result = await resilientFetch(`${TEST_BASE_URL}/network-error`, {
        skipLogging: true,
        retry: { maxAttempts: 1 },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 5xx errors', async () => {
      let callCount = 0;
      server.use(
        http.get(`${TEST_BASE_URL}/flaky`, () => {
          callCount++;
          if (callCount < 2) {
            return new HttpResponse('Server error', { status: 500 });
          }
          return HttpResponse.json({ success: true });
        })
      );

      const result = await resilientFetch(`${TEST_BASE_URL}/flaky`, {
        skipLogging: true,
        retry: { maxAttempts: 3, baseDelayMs: 10 },
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should retry on 429 (rate limit)', async () => {
      let callCount = 0;
      server.use(
        http.get(`${TEST_BASE_URL}/rate-limited`, () => {
          callCount++;
          if (callCount < 2) {
            return new HttpResponse('Rate limited', { status: 429 });
          }
          return HttpResponse.json({ data: 'ok' });
        })
      );

      const result = await resilientFetch(`${TEST_BASE_URL}/rate-limited`, {
        skipLogging: true,
        retry: { maxAttempts: 3, baseDelayMs: 10 },
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should not retry on 4xx errors (except 408, 429)', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/bad-request`, () => {
          return new HttpResponse('Invalid request', { status: 400 });
        })
      );

      const result = await resilientFetch(`${TEST_BASE_URL}/bad-request`, {
        skipLogging: true,
        retry: { maxAttempts: 3 },
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('should respect maxAttempts', async () => {
      let callCount = 0;
      server.use(
        http.get(`${TEST_BASE_URL}/always-fails`, () => {
          callCount++;
          return new HttpResponse('Server error', { status: 500 });
        })
      );

      const result = await resilientFetch(`${TEST_BASE_URL}/always-fails`, {
        skipLogging: true,
        retry: { maxAttempts: 2, baseDelayMs: 1 },
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2);
      expect(callCount).toBe(2);
    });
  });

  describe('Circuit Breaker Integration', () => {
    beforeEach(() => {
      globalCircuitBreakerRegistry.resetAll();
    });

    it('should use circuit breaker when configured', async () => {
      server.use(
        http.get(`${TEST_BASE_URL}/cb-test`, () => {
          return HttpResponse.json({ data: 'ok' });
        })
      );

      const result = await resilientFetch(`${TEST_BASE_URL}/cb-test`, {
        skipLogging: true,
        circuitBreakerName: 'test-api',
      });

      expect(result.success).toBe(true);
    });

    it('should block requests when circuit is open', async () => {
      // Open the circuit by failing many times
      const breaker = globalCircuitBreakerRegistry.get('failing-api', {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        successThreshold: 1,
      });

      await breaker
        .execute(async () => {
          throw new Error('failure');
        })
        .catch(() => {});

      // Now try to make a request
      const result = await resilientFetch(`${TEST_BASE_URL}/blocked`, {
        skipLogging: true,
        circuitBreakerName: 'failing-api',
      });

      expect(result.success).toBe(false);
      expect(result.circuitBreakerTripped).toBe(true);
      expect(result.errorCode).toBe('CIRCUIT_BREAKER_OPEN');
    });
  });
});

describe('resilientJsonFetch', () => {
  it('should handle JSON POST requests', async () => {
    server.use(
      http.post(`${TEST_BASE_URL}/json-post`, async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ received: body, success: true });
      })
    );

    const result = await resilientJsonFetch<{ received: unknown; success: boolean }>(
      `${TEST_BASE_URL}/json-post`,
      {
        method: 'POST',
        body: { key: 'value' },
        skipLogging: true,
      }
    );

    expect(result.success).toBe(true);
    expect(result.data?.success).toBe(true);
    expect(result.data?.received).toEqual({ key: 'value' });
  });

  it('should stringify body automatically', async () => {
    server.use(
      http.post(`${TEST_BASE_URL}/create`, () => {
        return HttpResponse.json({ id: 1 }, { status: 201 });
      })
    );

    const result = await resilientJsonFetch<{ id: number }>(`${TEST_BASE_URL}/create`, {
      method: 'POST',
      body: { name: 'test', value: 42 },
      skipLogging: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1 });
  });
});

describe('createServiceClient', () => {
  beforeEach(() => {
    globalCircuitBreakerRegistry.resetAll();
  });

  it('should create a client with base URL', async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/users`, () => {
        return HttpResponse.json({ endpoint: 'users' });
      })
    );

    const client = createServiceClient(TEST_BASE_URL, {
      skipLogging: true,
    });

    const result = await client<{ endpoint: string }>('/users');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ endpoint: 'users' });
  });

  it('should merge default headers with request headers', async () => {
    let receivedHeaders: Record<string, string> = {};
    server.use(
      http.get(`${TEST_BASE_URL}/protected`, ({ request }) => {
        receivedHeaders = {
          authorization: request.headers.get('authorization') ?? '',
          'x-custom-header': request.headers.get('x-custom-header') ?? '',
        };
        return HttpResponse.json({});
      })
    );

    const client = createServiceClient(TEST_BASE_URL, {
      headers: { Authorization: 'Bearer token123' },
      skipLogging: true,
    });

    const result = await client('/protected', {
      headers: { 'X-Custom-Header': 'custom-value' },
    });

    expect(result.success).toBe(true);
    expect(receivedHeaders.authorization).toBe('Bearer token123');
    expect(receivedHeaders['x-custom-header']).toBe('custom-value');
  });

  it('should use circuit breaker from default options', async () => {
    server.use(
      http.get(`${TEST_BASE_URL}/with-cb`, () => {
        return HttpResponse.json({});
      })
    );

    const client = createServiceClient(TEST_BASE_URL, {
      circuitBreakerName: 'example-api',
      skipLogging: true,
    });

    const result = await client('/with-cb');

    expect(result.success).toBe(true);
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValueOnce('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
      })
    ).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal error'));

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        shouldRetry: (error) => !error.message.includes('fatal'),
      })
    ).rejects.toThrow('fatal error');

    // Should not retry because shouldRetry returns false
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('retry me'))
      .mockResolvedValueOnce('success');

    await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });

  it('should apply exponential backoff', async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');

    await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 100,
      backoffMultiplier: 2,
      jitter: false, // Disable jitter for predictable testing
      onRetry: (_error, _attempt, delay) => {
        delays.push(delay);
      },
    });

    expect(delays[0]).toBe(100); // Base delay
    expect(delays[1]).toBe(200); // 100 * 2
  });

  it('should cap delay at maxDelayMs', async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    await withRetry(fn, {
      maxAttempts: 4,
      baseDelayMs: 100,
      maxDelayMs: 150,
      backoffMultiplier: 2,
      jitter: false,
      onRetry: (_error, _attempt, delay) => {
        delays.push(delay);
      },
    });

    expect(delays[0]).toBe(100);
    expect(delays[1]).toBe(150); // Capped at maxDelayMs
    expect(delays[2]).toBe(150); // Still capped
  });
});
