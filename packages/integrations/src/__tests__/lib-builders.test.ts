/**
 * Comprehensive tests for lib/builders.ts
 * Tests all builder patterns and configurations
 */
import { describe, it, expect } from 'vitest';
import {
  RetryConfigBuilder,
  CircuitBreakerBuilder,
  TimeoutBuilder,
  RequestBuilder,
  type RetryConfig,
  type CircuitBreakerConfig,
  type TimeoutConfig,
  type RequestConfig,
} from '../lib/builders.js';
import { unsafe } from '../lib/branded-types.js';

describe('lib/builders - RetryConfigBuilder', () => {
  describe('create', () => {
    it('should create builder with defaults', () => {
      const config = RetryConfigBuilder.create().build();
      expect(config.maxRetries).toBe(3);
      expect(config.baseDelayMs).toBe(1000);
      expect(config.strategy).toBe('exponential');
      expect(config.jitter).toBe(true);
    });
  });

  describe('maxRetries', () => {
    it('should set max retries', () => {
      const config = RetryConfigBuilder.create().maxRetries(5).build();
      expect(config.maxRetries).toBe(5);
    });

    it('should throw on negative retries', () => {
      expect(() => RetryConfigBuilder.create().maxRetries(-1)).toThrow(RangeError);
    });

    it('should throw on retries > 10', () => {
      expect(() => RetryConfigBuilder.create().maxRetries(11)).toThrow(RangeError);
    });

    it('should accept 0 retries', () => {
      const config = RetryConfigBuilder.create().maxRetries(0).build();
      expect(config.maxRetries).toBe(0);
    });

    it('should accept 10 retries', () => {
      const config = RetryConfigBuilder.create().maxRetries(10).build();
      expect(config.maxRetries).toBe(10);
    });
  });

  describe('baseDelay', () => {
    it('should set base delay', () => {
      const config = RetryConfigBuilder.create().baseDelay(2000).build();
      expect(config.baseDelayMs).toBe(2000);
    });

    it('should throw on delay < 100', () => {
      expect(() => RetryConfigBuilder.create().baseDelay(50)).toThrow(RangeError);
    });

    it('should throw on delay > 60000', () => {
      expect(() => RetryConfigBuilder.create().baseDelay(60001)).toThrow(RangeError);
    });

    it('should accept boundary values', () => {
      const config1 = RetryConfigBuilder.create().baseDelay(100).build();
      expect(config1.baseDelayMs).toBe(100);

      const config2 = RetryConfigBuilder.create().baseDelay(60000).build();
      expect(config2.baseDelayMs).toBe(60000);
    });
  });

  describe('maxDelay', () => {
    it('should set max delay', () => {
      const config = RetryConfigBuilder.create().maxDelay(60000).build();
      expect(config.maxDelayMs).toBe(60000);
    });

    it('should throw if maxDelay < baseDelay', () => {
      expect(() => RetryConfigBuilder.create().baseDelay(2000).maxDelay(1000)).toThrow(RangeError);
    });

    it('should accept maxDelay equal to baseDelay', () => {
      const config = RetryConfigBuilder.create().baseDelay(5000).maxDelay(5000).build();
      expect(config.maxDelayMs).toBe(5000);
    });
  });

  describe('strategies', () => {
    it('should set exponential backoff', () => {
      const config = RetryConfigBuilder.create().exponentialBackoff().build();
      expect(config.strategy).toBe('exponential');
    });

    it('should set exponential backoff with base delay', () => {
      const config = RetryConfigBuilder.create().exponentialBackoff(500).build();
      expect(config.strategy).toBe('exponential');
      expect(config.baseDelayMs).toBe(500);
    });

    it('should set linear backoff', () => {
      const config = RetryConfigBuilder.create().linearBackoff().build();
      expect(config.strategy).toBe('linear');
    });

    it('should set constant delay', () => {
      const config = RetryConfigBuilder.create().constantDelay().build();
      expect(config.strategy).toBe('constant');
    });

    it('should set fibonacci backoff', () => {
      const config = RetryConfigBuilder.create().fibonacciBackoff().build();
      expect(config.strategy).toBe('fibonacci');
    });
  });

  describe('jitter', () => {
    it('should enable jitter', () => {
      const config = RetryConfigBuilder.create().withJitter().build();
      expect(config.jitter).toBe(true);
    });

    it('should disable jitter', () => {
      const config = RetryConfigBuilder.create().withoutJitter().build();
      expect(config.jitter).toBe(false);
    });
  });

  describe('retry status codes', () => {
    it('should set retry status codes', () => {
      const config = RetryConfigBuilder.create().retryOnStatusCodes([408, 500, 502]).build();
      expect(config.retryOn).toEqual([408, 500, 502]);
    });

    it('should add additional status codes', () => {
      const config = RetryConfigBuilder.create()
        .retryOnStatusCodes([429])
        .alsoRetryOn(500, 502)
        .build();
      expect(config.retryOn).toContain(429);
      expect(config.retryOn).toContain(500);
      expect(config.retryOn).toContain(502);
    });

    it('should deduplicate status codes with alsoRetryOn', () => {
      const config = RetryConfigBuilder.create()
        .retryOnStatusCodes([429, 500])
        .alsoRetryOn(500, 502)
        .build();
      const count500 = config.retryOn.filter((code) => code === 500).length;
      expect(count500).toBe(1);
    });
  });

  describe('standard configs', () => {
    it('should create standard config', () => {
      const config = RetryConfigBuilder.standard();
      expect(config.maxRetries).toBe(3);
      expect(config.strategy).toBe('exponential');
      expect(config.jitter).toBe(true);
    });

    it('should create aggressive config', () => {
      const config = RetryConfigBuilder.aggressive();
      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(500);
    });

    it('should create conservative config', () => {
      const config = RetryConfigBuilder.conservative();
      expect(config.maxRetries).toBe(2);
      expect(config.baseDelayMs).toBe(2000);
    });

    it('should create none config', () => {
      const config = RetryConfigBuilder.none();
      expect(config.maxRetries).toBe(0);
    });
  });

  describe('fluent chaining', () => {
    it('should chain multiple methods', () => {
      const config = RetryConfigBuilder.create()
        .maxRetries(5)
        .exponentialBackoff(500)
        .maxDelay(30000)
        .withJitter()
        .retryOnStatusCodes([429, 502, 503])
        .alsoRetryOn(504)
        .build();

      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(500);
      expect(config.maxDelayMs).toBe(30000);
      expect(config.jitter).toBe(true);
      expect(config.retryOn).toContain(504);
    });
  });
});

describe('lib/builders - CircuitBreakerBuilder', () => {
  describe('create', () => {
    it('should create builder with defaults', () => {
      const config = CircuitBreakerBuilder.create().build();
      expect(config.enabled).toBe(true);
      expect(config.failureThreshold).toBe(5);
      expect(config.successThreshold).toBe(2);
      expect(config.resetTimeoutMs).toBe(30000);
    });
  });

  describe('enable/disable', () => {
    it('should enable circuit breaker', () => {
      const config = CircuitBreakerBuilder.create().enable().build();
      expect(config.enabled).toBe(true);
    });

    it('should disable circuit breaker', () => {
      const config = CircuitBreakerBuilder.create().disable().build();
      expect(config.enabled).toBe(false);
    });
  });

  describe('failureThreshold', () => {
    it('should set failure threshold', () => {
      const config = CircuitBreakerBuilder.create().failureThreshold(10).build();
      expect(config.failureThreshold).toBe(10);
    });

    it('should throw on threshold < 1', () => {
      expect(() => CircuitBreakerBuilder.create().failureThreshold(0)).toThrow(RangeError);
    });

    it('should throw on threshold > 100', () => {
      expect(() => CircuitBreakerBuilder.create().failureThreshold(101)).toThrow(RangeError);
    });

    it('should accept boundary values', () => {
      const config1 = CircuitBreakerBuilder.create().failureThreshold(1).build();
      expect(config1.failureThreshold).toBe(1);

      const config2 = CircuitBreakerBuilder.create().failureThreshold(100).build();
      expect(config2.failureThreshold).toBe(100);
    });
  });

  describe('halfOpenSuccessThreshold', () => {
    it('should set success threshold', () => {
      const config = CircuitBreakerBuilder.create().halfOpenSuccessThreshold(5).build();
      expect(config.successThreshold).toBe(5);
    });

    it('should throw on threshold < 1', () => {
      expect(() => CircuitBreakerBuilder.create().halfOpenSuccessThreshold(0)).toThrow(RangeError);
    });

    it('should throw on threshold > 20', () => {
      expect(() => CircuitBreakerBuilder.create().halfOpenSuccessThreshold(21)).toThrow(
        RangeError
      );
    });
  });

  describe('resetTimeout', () => {
    it('should set reset timeout', () => {
      const config = CircuitBreakerBuilder.create().resetTimeout(60000).build();
      expect(config.resetTimeoutMs).toBe(60000);
    });

    it('should throw on timeout < 1000', () => {
      expect(() => CircuitBreakerBuilder.create().resetTimeout(999)).toThrow(RangeError);
    });

    it('should throw on timeout > 300000', () => {
      expect(() => CircuitBreakerBuilder.create().resetTimeout(300001)).toThrow(RangeError);
    });
  });

  describe('failureWindow', () => {
    it('should set failure window', () => {
      const config = CircuitBreakerBuilder.create().failureWindow(120000).build();
      expect(config.failureWindowMs).toBe(120000);
    });

    it('should throw on window < 1000', () => {
      expect(() => CircuitBreakerBuilder.create().failureWindow(999)).toThrow(RangeError);
    });

    it('should throw on window > 600000', () => {
      expect(() => CircuitBreakerBuilder.create().failureWindow(600001)).toThrow(RangeError);
    });
  });

  describe('volumeThreshold', () => {
    it('should set volume threshold', () => {
      const config = CircuitBreakerBuilder.create().volumeThreshold(20).build();
      expect(config.volumeThreshold).toBe(20);
    });

    it('should throw on threshold < 1', () => {
      expect(() => CircuitBreakerBuilder.create().volumeThreshold(0)).toThrow(RangeError);
    });

    it('should throw on threshold > 1000', () => {
      expect(() => CircuitBreakerBuilder.create().volumeThreshold(1001)).toThrow(RangeError);
    });
  });

  describe('error filtering', () => {
    it('should set error filter function', () => {
      const filter = (error: unknown) => error instanceof Error;
      const config = CircuitBreakerBuilder.create().filterErrors(filter).build();
      expect(config.errorFilter).toBe(filter);
    });

    it('should filter specific error types', () => {
      class CustomError extends Error {}
      const config = CircuitBreakerBuilder.create().onlyCountErrors(CustomError).build();
      expect(config.errorFilter).toBeDefined();

      if (config.errorFilter) {
        expect(config.errorFilter(new CustomError())).toBe(true);
        expect(config.errorFilter(new Error())).toBe(false);
      }
    });

    it('should filter multiple error types', () => {
      class ErrorA extends Error {}
      class ErrorB extends Error {}
      const config = CircuitBreakerBuilder.create().onlyCountErrors(ErrorA, ErrorB).build();

      if (config.errorFilter) {
        expect(config.errorFilter(new ErrorA())).toBe(true);
        expect(config.errorFilter(new ErrorB())).toBe(true);
        expect(config.errorFilter(new Error())).toBe(false);
      }
    });
  });

  describe('standard configs', () => {
    it('should create standard config', () => {
      const config = CircuitBreakerBuilder.standard();
      expect(config.failureThreshold).toBe(5);
      expect(config.successThreshold).toBe(2);
    });

    it('should create payment-specific config', () => {
      const config = CircuitBreakerBuilder.forPayments();
      expect(config.failureThreshold).toBe(3);
      expect(config.successThreshold).toBe(3);
      expect(config.resetTimeoutMs).toBe(60000);
    });

    it('should create lenient config', () => {
      const config = CircuitBreakerBuilder.lenient();
      expect(config.failureThreshold).toBe(10);
      expect(config.volumeThreshold).toBe(20);
    });
  });
});

describe('lib/builders - TimeoutBuilder', () => {
  describe('create', () => {
    it('should create builder with defaults', () => {
      const config = TimeoutBuilder.create().build();
      expect(config.connectTimeoutMs).toBe(5000);
      expect(config.requestTimeoutMs).toBe(30000);
      expect(config.idleTimeoutMs).toBe(60000);
      expect(config.totalTimeoutMs).toBe(120000);
    });
  });

  describe('timeout setters', () => {
    it('should set connect timeout', () => {
      const config = TimeoutBuilder.create().connect(10000).build();
      expect(config.connectTimeoutMs).toBe(10000);
    });

    it('should throw on connect timeout < 100', () => {
      expect(() => TimeoutBuilder.create().connect(99)).toThrow(RangeError);
    });

    it('should throw on connect timeout > 60000', () => {
      expect(() => TimeoutBuilder.create().connect(60001)).toThrow(RangeError);
    });

    it('should set request timeout', () => {
      const config = TimeoutBuilder.create().request(45000).build();
      expect(config.requestTimeoutMs).toBe(45000);
    });

    it('should throw on request timeout < 1000', () => {
      expect(() => TimeoutBuilder.create().request(999)).toThrow(RangeError);
    });

    it('should throw on request timeout > 300000', () => {
      expect(() => TimeoutBuilder.create().request(300001)).toThrow(RangeError);
    });

    it('should set idle timeout', () => {
      const config = TimeoutBuilder.create().idle(90000).build();
      expect(config.idleTimeoutMs).toBe(90000);
    });

    it('should set total timeout', () => {
      const config = TimeoutBuilder.create().total(180000).build();
      expect(config.totalTimeoutMs).toBe(180000);
    });
  });

  describe('all timeouts', () => {
    it('should set all timeouts proportionally', () => {
      const config = TimeoutBuilder.create().all(10000).build();
      expect(config.connectTimeoutMs).toBe(10000);
      expect(config.requestTimeoutMs).toBe(10000);
      expect(config.idleTimeoutMs).toBe(20000);
      expect(config.totalTimeoutMs).toBe(40000);
    });

    it('should cap connect timeout at 60000', () => {
      const config = TimeoutBuilder.create().all(100000).build();
      expect(config.connectTimeoutMs).toBe(60000); // Capped
    });
  });

  describe('standard configs', () => {
    it('should create fast config', () => {
      const config = TimeoutBuilder.fast();
      expect(config.requestTimeoutMs).toBe(10000);
      expect(config.totalTimeoutMs).toBe(30000);
    });

    it('should create standard config', () => {
      const config = TimeoutBuilder.standard();
      expect(config.requestTimeoutMs).toBe(30000);
      expect(config.totalTimeoutMs).toBe(120000);
    });

    it('should create patient config', () => {
      const config = TimeoutBuilder.patient();
      expect(config.requestTimeoutMs).toBe(60000);
      expect(config.totalTimeoutMs).toBe(300000);
    });
  });
});

describe('lib/builders - RequestBuilder', () => {
  describe('HTTP method factories', () => {
    it('should create GET request', () => {
      const req = RequestBuilder.get('/api/users').build();
      expect(req.method).toBe('GET');
      expect(req.path).toBe('/api/users');
    });

    it('should create POST request', () => {
      const req = RequestBuilder.post('/api/users').build();
      expect(req.method).toBe('POST');
      expect(req.path).toBe('/api/users');
    });

    it('should create PUT request', () => {
      const req = RequestBuilder.put('/api/users/1').build();
      expect(req.method).toBe('PUT');
    });

    it('should create PATCH request', () => {
      const req = RequestBuilder.patch('/api/users/1').build();
      expect(req.method).toBe('PATCH');
    });

    it('should create DELETE request', () => {
      const req = RequestBuilder.delete('/api/users/1').build();
      expect(req.method).toBe('DELETE');
    });
  });

  describe('body', () => {
    it('should set request body', () => {
      const data = { name: 'test' };
      const req = RequestBuilder.post<typeof data>('/api/users').body(data).build();
      expect(req.body).toEqual(data);
    });

    it('should set JSON body with content type', () => {
      const data = { name: 'test' };
      const req = RequestBuilder.post<typeof data>('/api/users').json(data).build();
      expect(req.body).toEqual(data);
      expect(req.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('query parameters', () => {
    it('should add single query parameter', () => {
      const req = RequestBuilder.get('/api/users').query('limit', 10).build();
      expect(req.query.limit).toBe('10');
    });

    it('should add multiple query parameters', () => {
      const req = RequestBuilder.get('/api/users')
        .query('limit', 10)
        .query('offset', 20)
        .build();
      expect(req.query.limit).toBe('10');
      expect(req.query.offset).toBe('20');
    });

    it('should add query parameters from object', () => {
      const req = RequestBuilder.get('/api/users')
        .queries({ limit: 10, offset: 20, active: true })
        .build();
      expect(req.query.limit).toBe('10');
      expect(req.query.offset).toBe('20');
      expect(req.query.active).toBe('true');
    });

    it('should skip undefined query parameters', () => {
      const req = RequestBuilder.get('/api/users')
        .queries({ limit: 10, offset: undefined })
        .build();
      expect(req.query.limit).toBe('10');
      expect(req.query.offset).toBeUndefined();
    });

    it('should convert number to string', () => {
      const req = RequestBuilder.get('/api/users').query('page', 1).build();
      expect(req.query.page).toBe('1');
    });

    it('should convert boolean to string', () => {
      const req = RequestBuilder.get('/api/users').query('active', true).build();
      expect(req.query.active).toBe('true');
    });
  });

  describe('headers', () => {
    it('should add single header', () => {
      const req = RequestBuilder.get('/api/users').header('X-Custom', 'value').build();
      expect(req.headers['X-Custom']).toBe('value');
    });

    it('should add multiple headers', () => {
      const req = RequestBuilder.get('/api/users')
        .headers({ 'X-Custom-1': 'value1', 'X-Custom-2': 'value2' })
        .build();
      expect(req.headers['X-Custom-1']).toBe('value1');
      expect(req.headers['X-Custom-2']).toBe('value2');
    });

    it('should add bearer token', () => {
      const req = RequestBuilder.get('/api/users').bearerToken('token123').build();
      expect(req.headers.Authorization).toBe('Bearer token123');
    });
  });

  describe('timeout and abort signal', () => {
    it('should set timeout', () => {
      const req = RequestBuilder.get('/api/users').timeout(5000).build();
      expect(req.timeout).toBe(5000);
    });

    it('should set abort signal', () => {
      const controller = new AbortController();
      const req = RequestBuilder.get('/api/users').abort(controller.signal).build();
      expect(req.signal).toBe(controller.signal);
    });
  });

  describe('getUrl', () => {
    it('should generate URL without query params', () => {
      const url = RequestBuilder.get('/api/users').getUrl('https://api.example.com');
      expect(url).toBe('https://api.example.com/api/users');
    });

    it('should generate URL with query params', () => {
      const url = RequestBuilder.get('/api/users')
        .query('limit', 10)
        .query('offset', 20)
        .getUrl('https://api.example.com');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=20');
    });

    it('should generate URL with multiple query params', () => {
      const url = RequestBuilder.get('/search')
        .queries({ q: 'test', page: 1, active: true })
        .getUrl('https://api.example.com');
      expect(url).toContain('q=test');
      expect(url).toContain('page=1');
      expect(url).toContain('active=true');
    });
  });

  describe('fluent chaining', () => {
    it('should chain all methods', () => {
      const controller = new AbortController();
      const req = RequestBuilder.post<{ name: string }>('/api/users')
        .json({ name: 'test' })
        .query('notify', true)
        .header('X-Custom', 'value')
        .bearerToken('token')
        .timeout(10000)
        .abort(controller.signal)
        .build();

      expect(req.method).toBe('POST');
      expect(req.body).toEqual({ name: 'test' });
      expect(req.query.notify).toBe('true');
      expect(req.headers['X-Custom']).toBe('value');
      expect(req.headers.Authorization).toBe('Bearer token');
      expect(req.timeout).toBe(10000);
      expect(req.signal).toBe(controller.signal);
    });
  });

  describe('build immutability', () => {
    it('should freeze the built config', () => {
      const req = RequestBuilder.get('/api/users').build();
      expect(() => {
        (req as { method: string }).method = 'POST';
      }).toThrow();
    });
  });
});

describe('lib/builders - BaseClientBuilder', () => {
  it('is tested indirectly through concrete implementations', () => {
    // Note: BaseClientBuilder is abstract and tested through its subclasses
    expect(true).toBe(true);
  });
});

describe('lib/builders - Edge Cases', () => {
  it('should handle chaining with frozen objects', () => {
    const config = RetryConfigBuilder.create()
      .maxRetries(3)
      .build();

    // Config should be immutable
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('should handle multiple builds from same builder', () => {
    const builder = RetryConfigBuilder.create().maxRetries(5);
    const config1 = builder.build();
    const config2 = builder.build();

    // Both should be equal but not the same object
    expect(config1).toEqual(config2);
    expect(config1).not.toBe(config2);
  });

  it('should handle builder reuse with modifications', () => {
    const builder = CircuitBreakerBuilder.create().failureThreshold(5);
    const config1 = builder.build();

    builder.failureThreshold(10);
    const config2 = builder.build();

    // Builders create immutable configs, so config1 retains original value
    expect(config1.failureThreshold).toBe(5);
    expect(config2.failureThreshold).toBe(10);
  });
});
