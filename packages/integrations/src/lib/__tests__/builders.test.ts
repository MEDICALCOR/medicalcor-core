/**
 * @file Builders Tests
 * @description Comprehensive tests for type-safe builder patterns
 */

import { describe, it, expect } from 'vitest';
import {
  RetryConfigBuilder,
  CircuitBreakerBuilder,
  TimeoutBuilder,
  RequestBuilder,
  BaseClientBuilder,
  RetryConfig,
  CircuitBreakerConfig,
  TimeoutConfig,
  RequestConfig,
  BaseClientConfig,
} from '../builders';
import { unsafe } from '../branded-types';

// ============================================
// RetryConfigBuilder Tests
// ============================================

describe('RetryConfigBuilder', () => {
  describe('create', () => {
    it('should create builder with default values', () => {
      const config = RetryConfigBuilder.create().build();

      expect(config.maxRetries).toBe(3);
      expect(config.baseDelayMs).toBe(1000);
      expect(config.maxDelayMs).toBe(30000);
      expect(config.strategy).toBe('exponential');
      expect(config.jitter).toBe(true);
      expect(config.retryOn).toEqual([429, 502, 503, 504]);
    });

    it('should return frozen config object', () => {
      const config = RetryConfigBuilder.create().build();

      expect(Object.isFrozen(config)).toBe(true);
    });
  });

  describe('maxRetries', () => {
    it('should set max retries', () => {
      const config = RetryConfigBuilder.create().maxRetries(5).build();

      expect(config.maxRetries).toBe(5);
    });

    it('should throw for negative max retries', () => {
      expect(() => RetryConfigBuilder.create().maxRetries(-1)).toThrow(RangeError);
    });

    it('should throw for max retries > 10', () => {
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
      const config = RetryConfigBuilder.create().baseDelay(500).build();

      expect(config.baseDelayMs).toBe(500);
    });

    it('should throw for delay < 100ms', () => {
      expect(() => RetryConfigBuilder.create().baseDelay(99)).toThrow(RangeError);
    });

    it('should throw for delay > 60000ms', () => {
      expect(() => RetryConfigBuilder.create().baseDelay(60001)).toThrow(RangeError);
    });

    it('should accept 100ms delay', () => {
      const config = RetryConfigBuilder.create().baseDelay(100).build();

      expect(config.baseDelayMs).toBe(100);
    });

    it('should accept 60000ms delay', () => {
      const config = RetryConfigBuilder.create().baseDelay(60000).build();

      expect(config.baseDelayMs).toBe(60000);
    });
  });

  describe('maxDelay', () => {
    it('should set max delay', () => {
      const config = RetryConfigBuilder.create().maxDelay(60000).build();

      expect(config.maxDelayMs).toBe(60000);
    });

    it('should throw when maxDelay < baseDelay', () => {
      expect(() => RetryConfigBuilder.create().baseDelay(5000).maxDelay(1000)).toThrow(RangeError);
    });
  });

  describe('backoff strategies', () => {
    it('should set exponential backoff', () => {
      const config = RetryConfigBuilder.create().exponentialBackoff().build();

      expect(config.strategy).toBe('exponential');
    });

    it('should set exponential backoff with custom base', () => {
      const config = RetryConfigBuilder.create().exponentialBackoff(2000).build();

      expect(config.strategy).toBe('exponential');
      expect(config.baseDelayMs).toBe(2000);
    });

    it('should set linear backoff', () => {
      const config = RetryConfigBuilder.create().linearBackoff().build();

      expect(config.strategy).toBe('linear');
    });

    it('should set linear backoff with custom base', () => {
      const config = RetryConfigBuilder.create().linearBackoff(1500).build();

      expect(config.strategy).toBe('linear');
      expect(config.baseDelayMs).toBe(1500);
    });

    it('should set constant delay', () => {
      const config = RetryConfigBuilder.create().constantDelay().build();

      expect(config.strategy).toBe('constant');
    });

    it('should set constant delay with custom value', () => {
      const config = RetryConfigBuilder.create().constantDelay(3000).build();

      expect(config.strategy).toBe('constant');
      expect(config.baseDelayMs).toBe(3000);
    });

    it('should set fibonacci backoff', () => {
      const config = RetryConfigBuilder.create().fibonacciBackoff().build();

      expect(config.strategy).toBe('fibonacci');
    });

    it('should set fibonacci backoff with custom base', () => {
      const config = RetryConfigBuilder.create().fibonacciBackoff(800).build();

      expect(config.strategy).toBe('fibonacci');
      expect(config.baseDelayMs).toBe(800);
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

  describe('retryOnStatusCodes', () => {
    it('should set retry status codes', () => {
      const config = RetryConfigBuilder.create().retryOnStatusCodes([500, 503]).build();

      expect(config.retryOn).toEqual([500, 503]);
    });

    it('should overwrite default status codes', () => {
      const config = RetryConfigBuilder.create().retryOnStatusCodes([408]).build();

      expect(config.retryOn).toEqual([408]);
    });
  });

  describe('alsoRetryOn', () => {
    it('should add additional status codes', () => {
      const config = RetryConfigBuilder.create().alsoRetryOn(408, 500).build();

      expect(config.retryOn).toContain(408);
      expect(config.retryOn).toContain(500);
      expect(config.retryOn).toContain(429); // original
    });

    it('should not duplicate status codes', () => {
      const config = RetryConfigBuilder.create().alsoRetryOn(429).build();

      const count429 = config.retryOn.filter((code) => code === 429).length;
      expect(count429).toBe(1);
    });
  });

  describe('preset configurations', () => {
    it('should create standard config', () => {
      const config = RetryConfigBuilder.standard();

      expect(config.maxRetries).toBe(3);
      expect(config.strategy).toBe('exponential');
      expect(config.baseDelayMs).toBe(1000);
      expect(config.jitter).toBe(true);
    });

    it('should create aggressive config', () => {
      const config = RetryConfigBuilder.aggressive();

      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(500);
      expect(config.retryOn).toContain(408);
      expect(config.retryOn).toContain(500);
    });

    it('should create conservative config', () => {
      const config = RetryConfigBuilder.conservative();

      expect(config.maxRetries).toBe(2);
      expect(config.baseDelayMs).toBe(2000);
      expect(config.maxDelayMs).toBe(10000);
    });

    it('should create none config', () => {
      const config = RetryConfigBuilder.none();

      expect(config.maxRetries).toBe(0);
    });
  });

  describe('method chaining', () => {
    it('should support full fluent API', () => {
      const config = RetryConfigBuilder.create()
        .maxRetries(4)
        .exponentialBackoff(1500)
        .maxDelay(45000)
        .withJitter()
        .retryOnStatusCodes([429, 503])
        .alsoRetryOn(500)
        .build();

      expect(config.maxRetries).toBe(4);
      expect(config.baseDelayMs).toBe(1500);
      expect(config.maxDelayMs).toBe(45000);
      expect(config.strategy).toBe('exponential');
      expect(config.jitter).toBe(true);
      expect(config.retryOn).toContain(500);
    });
  });
});

// ============================================
// CircuitBreakerBuilder Tests
// ============================================

describe('CircuitBreakerBuilder', () => {
  describe('create', () => {
    it('should create builder with default values', () => {
      const config = CircuitBreakerBuilder.create().build();

      expect(config.enabled).toBe(true);
      expect(config.failureThreshold).toBe(5);
      expect(config.successThreshold).toBe(2);
      expect(config.resetTimeoutMs).toBe(30000);
      expect(config.failureWindowMs).toBe(60000);
      expect(config.volumeThreshold).toBe(10);
    });

    it('should return frozen config object', () => {
      const config = CircuitBreakerBuilder.create().build();

      expect(Object.isFrozen(config)).toBe(true);
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

    it('should throw for threshold < 1', () => {
      expect(() => CircuitBreakerBuilder.create().failureThreshold(0)).toThrow(RangeError);
    });

    it('should throw for threshold > 100', () => {
      expect(() => CircuitBreakerBuilder.create().failureThreshold(101)).toThrow(RangeError);
    });

    it('should accept boundary value 1', () => {
      const config = CircuitBreakerBuilder.create().failureThreshold(1).build();

      expect(config.failureThreshold).toBe(1);
    });

    it('should accept boundary value 100', () => {
      const config = CircuitBreakerBuilder.create().failureThreshold(100).build();

      expect(config.failureThreshold).toBe(100);
    });
  });

  describe('halfOpenSuccessThreshold', () => {
    it('should set success threshold', () => {
      const config = CircuitBreakerBuilder.create().halfOpenSuccessThreshold(5).build();

      expect(config.successThreshold).toBe(5);
    });

    it('should throw for threshold < 1', () => {
      expect(() => CircuitBreakerBuilder.create().halfOpenSuccessThreshold(0)).toThrow(RangeError);
    });

    it('should throw for threshold > 20', () => {
      expect(() => CircuitBreakerBuilder.create().halfOpenSuccessThreshold(21)).toThrow(RangeError);
    });
  });

  describe('resetTimeout', () => {
    it('should set reset timeout', () => {
      const config = CircuitBreakerBuilder.create().resetTimeout(60000).build();

      expect(config.resetTimeoutMs).toBe(60000);
    });

    it('should throw for timeout < 1000ms', () => {
      expect(() => CircuitBreakerBuilder.create().resetTimeout(999)).toThrow(RangeError);
    });

    it('should throw for timeout > 300000ms', () => {
      expect(() => CircuitBreakerBuilder.create().resetTimeout(300001)).toThrow(RangeError);
    });
  });

  describe('failureWindow', () => {
    it('should set failure window', () => {
      const config = CircuitBreakerBuilder.create().failureWindow(120000).build();

      expect(config.failureWindowMs).toBe(120000);
    });

    it('should throw for window < 1000ms', () => {
      expect(() => CircuitBreakerBuilder.create().failureWindow(999)).toThrow(RangeError);
    });

    it('should throw for window > 600000ms', () => {
      expect(() => CircuitBreakerBuilder.create().failureWindow(600001)).toThrow(RangeError);
    });
  });

  describe('volumeThreshold', () => {
    it('should set volume threshold', () => {
      const config = CircuitBreakerBuilder.create().volumeThreshold(20).build();

      expect(config.volumeThreshold).toBe(20);
    });

    it('should throw for threshold < 1', () => {
      expect(() => CircuitBreakerBuilder.create().volumeThreshold(0)).toThrow(RangeError);
    });

    it('should throw for threshold > 1000', () => {
      expect(() => CircuitBreakerBuilder.create().volumeThreshold(1001)).toThrow(RangeError);
    });
  });

  describe('filterErrors', () => {
    it('should set error filter', () => {
      const filter = (error: unknown) => error instanceof TypeError;
      const config = CircuitBreakerBuilder.create().filterErrors(filter).build();

      expect(config.errorFilter).toBe(filter);
    });

    it('should filter errors correctly', () => {
      const config = CircuitBreakerBuilder.create()
        .filterErrors((error) => error instanceof TypeError)
        .build();

      expect(config.errorFilter!(new TypeError())).toBe(true);
      expect(config.errorFilter!(new Error())).toBe(false);
    });
  });

  describe('onlyCountErrors', () => {
    it('should only count specific error types', () => {
      const config = CircuitBreakerBuilder.create().onlyCountErrors(TypeError, RangeError).build();

      expect(config.errorFilter!(new TypeError())).toBe(true);
      expect(config.errorFilter!(new RangeError())).toBe(true);
      expect(config.errorFilter!(new Error())).toBe(false);
    });
  });

  describe('preset configurations', () => {
    it('should create standard config', () => {
      const config = CircuitBreakerBuilder.standard();

      expect(config.failureThreshold).toBe(5);
      expect(config.successThreshold).toBe(2);
      expect(config.resetTimeoutMs).toBe(30000);
    });

    it('should create payment-specific config', () => {
      const config = CircuitBreakerBuilder.forPayments();

      expect(config.failureThreshold).toBe(3);
      expect(config.successThreshold).toBe(3);
      expect(config.resetTimeoutMs).toBe(60000);
      expect(config.volumeThreshold).toBe(5);
    });

    it('should create lenient config', () => {
      const config = CircuitBreakerBuilder.lenient();

      expect(config.failureThreshold).toBe(10);
      expect(config.successThreshold).toBe(1);
      expect(config.resetTimeoutMs).toBe(15000);
      expect(config.failureWindowMs).toBe(120000);
    });
  });

  describe('method chaining', () => {
    it('should support full fluent API', () => {
      const config = CircuitBreakerBuilder.create()
        .enable()
        .failureThreshold(8)
        .halfOpenSuccessThreshold(4)
        .resetTimeout(45000)
        .failureWindow(90000)
        .volumeThreshold(15)
        .build();

      expect(config.enabled).toBe(true);
      expect(config.failureThreshold).toBe(8);
      expect(config.successThreshold).toBe(4);
      expect(config.resetTimeoutMs).toBe(45000);
      expect(config.failureWindowMs).toBe(90000);
      expect(config.volumeThreshold).toBe(15);
    });
  });
});

// ============================================
// TimeoutBuilder Tests
// ============================================

describe('TimeoutBuilder', () => {
  describe('create', () => {
    it('should create builder with default values', () => {
      const config = TimeoutBuilder.create().build();

      expect(config.connectTimeoutMs).toBe(5000);
      expect(config.requestTimeoutMs).toBe(30000);
      expect(config.idleTimeoutMs).toBe(60000);
      expect(config.totalTimeoutMs).toBe(120000);
    });

    it('should return frozen config object', () => {
      const config = TimeoutBuilder.create().build();

      expect(Object.isFrozen(config)).toBe(true);
    });
  });

  describe('connect', () => {
    it('should set connect timeout', () => {
      const config = TimeoutBuilder.create().connect(3000).build();

      expect(config.connectTimeoutMs).toBe(3000);
    });

    it('should throw for timeout < 100ms', () => {
      expect(() => TimeoutBuilder.create().connect(99)).toThrow(RangeError);
    });

    it('should throw for timeout > 60000ms', () => {
      expect(() => TimeoutBuilder.create().connect(60001)).toThrow(RangeError);
    });
  });

  describe('request', () => {
    it('should set request timeout', () => {
      const config = TimeoutBuilder.create().request(15000).build();

      expect(config.requestTimeoutMs).toBe(15000);
    });

    it('should throw for timeout < 1000ms', () => {
      expect(() => TimeoutBuilder.create().request(999)).toThrow(RangeError);
    });

    it('should throw for timeout > 300000ms', () => {
      expect(() => TimeoutBuilder.create().request(300001)).toThrow(RangeError);
    });
  });

  describe('idle', () => {
    it('should set idle timeout', () => {
      const config = TimeoutBuilder.create().idle(90000).build();

      expect(config.idleTimeoutMs).toBe(90000);
    });

    it('should throw for timeout < 1000ms', () => {
      expect(() => TimeoutBuilder.create().idle(999)).toThrow(RangeError);
    });

    it('should throw for timeout > 600000ms', () => {
      expect(() => TimeoutBuilder.create().idle(600001)).toThrow(RangeError);
    });
  });

  describe('total', () => {
    it('should set total timeout', () => {
      const config = TimeoutBuilder.create().total(180000).build();

      expect(config.totalTimeoutMs).toBe(180000);
    });

    it('should throw for timeout < 1000ms', () => {
      expect(() => TimeoutBuilder.create().total(999)).toThrow(RangeError);
    });

    it('should throw for timeout > 600000ms', () => {
      expect(() => TimeoutBuilder.create().total(600001)).toThrow(RangeError);
    });
  });

  describe('all', () => {
    it('should set all timeouts proportionally', () => {
      const config = TimeoutBuilder.create().all(20000).build();

      expect(config.connectTimeoutMs).toBe(20000);
      expect(config.requestTimeoutMs).toBe(20000);
      expect(config.idleTimeoutMs).toBe(40000);
      expect(config.totalTimeoutMs).toBe(80000);
    });

    it('should cap connect timeout at 60000ms', () => {
      const config = TimeoutBuilder.create().all(100000).build();

      expect(config.connectTimeoutMs).toBe(60000);
      expect(config.requestTimeoutMs).toBe(100000);
    });
  });

  describe('preset configurations', () => {
    it('should create fast config', () => {
      const config = TimeoutBuilder.fast();

      expect(config.connectTimeoutMs).toBe(2000);
      expect(config.requestTimeoutMs).toBe(10000);
      expect(config.idleTimeoutMs).toBe(30000);
      expect(config.totalTimeoutMs).toBe(30000);
    });

    it('should create standard config', () => {
      const config = TimeoutBuilder.standard();

      expect(config.connectTimeoutMs).toBe(5000);
      expect(config.requestTimeoutMs).toBe(30000);
      expect(config.idleTimeoutMs).toBe(60000);
      expect(config.totalTimeoutMs).toBe(120000);
    });

    it('should create patient config', () => {
      const config = TimeoutBuilder.patient();

      expect(config.connectTimeoutMs).toBe(10000);
      expect(config.requestTimeoutMs).toBe(60000);
      expect(config.idleTimeoutMs).toBe(120000);
      expect(config.totalTimeoutMs).toBe(300000);
    });
  });

  describe('method chaining', () => {
    it('should support full fluent API', () => {
      const config = TimeoutBuilder.create()
        .connect(4000)
        .request(25000)
        .idle(50000)
        .total(100000)
        .build();

      expect(config.connectTimeoutMs).toBe(4000);
      expect(config.requestTimeoutMs).toBe(25000);
      expect(config.idleTimeoutMs).toBe(50000);
      expect(config.totalTimeoutMs).toBe(100000);
    });
  });
});

// ============================================
// RequestBuilder Tests
// ============================================

describe('RequestBuilder', () => {
  describe('static factory methods', () => {
    it('should create GET request', () => {
      const request = RequestBuilder.get('/path').build();

      expect(request.method).toBe('GET');
      expect(request.path).toBe('/path');
    });

    it('should create POST request', () => {
      const request = RequestBuilder.post('/path').build();

      expect(request.method).toBe('POST');
      expect(request.path).toBe('/path');
    });

    it('should create PUT request', () => {
      const request = RequestBuilder.put('/path').build();

      expect(request.method).toBe('PUT');
      expect(request.path).toBe('/path');
    });

    it('should create PATCH request', () => {
      const request = RequestBuilder.patch('/path').build();

      expect(request.method).toBe('PATCH');
      expect(request.path).toBe('/path');
    });

    it('should create DELETE request', () => {
      const request = RequestBuilder.delete('/path').build();

      expect(request.method).toBe('DELETE');
      expect(request.path).toBe('/path');
    });
  });

  describe('body', () => {
    it('should set request body', () => {
      const request = RequestBuilder.post<{ name: string }>('/path').body({ name: 'test' }).build();

      expect(request.body).toEqual({ name: 'test' });
    });
  });

  describe('json', () => {
    it('should set JSON body with content-type header', () => {
      const request = RequestBuilder.post<{ data: number }>('/path').json({ data: 42 }).build();

      expect(request.body).toEqual({ data: 42 });
      expect(request.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('query parameters', () => {
    it('should add single query parameter', () => {
      const request = RequestBuilder.get('/path').query('page', '1').build();

      expect(request.query).toEqual({ page: '1' });
    });

    it('should convert number to string', () => {
      const request = RequestBuilder.get('/path').query('limit', 10).build();

      expect(request.query.limit).toBe('10');
    });

    it('should convert boolean to string', () => {
      const request = RequestBuilder.get('/path').query('active', true).build();

      expect(request.query.active).toBe('true');
    });

    it('should add multiple query parameters', () => {
      const request = RequestBuilder.get('/path')
        .queries({ page: 1, limit: 10, active: undefined, name: 'test' })
        .build();

      expect(request.query.page).toBe('1');
      expect(request.query.limit).toBe('10');
      expect(request.query.name).toBe('test');
      expect(request.query.active).toBeUndefined();
    });
  });

  describe('headers', () => {
    it('should add single header', () => {
      const request = RequestBuilder.get('/path').header('X-Custom', 'value').build();

      expect(request.headers['X-Custom']).toBe('value');
    });

    it('should add multiple headers', () => {
      const request = RequestBuilder.get('/path')
        .headers({ 'X-First': '1', 'X-Second': '2' })
        .build();

      expect(request.headers['X-First']).toBe('1');
      expect(request.headers['X-Second']).toBe('2');
    });

    it('should set bearer token', () => {
      const request = RequestBuilder.get('/path').bearerToken('my-token').build();

      expect(request.headers.Authorization).toBe('Bearer my-token');
    });
  });

  describe('timeout', () => {
    it('should set request timeout', () => {
      const request = RequestBuilder.get('/path').timeout(5000).build();

      expect(request.timeout).toBe(5000);
    });
  });

  describe('abort', () => {
    it('should set abort signal', () => {
      const controller = new AbortController();
      const request = RequestBuilder.get('/path').abort(controller.signal).build();

      expect(request.signal).toBe(controller.signal);
    });
  });

  describe('getUrl', () => {
    it('should build URL without query parameters', () => {
      const builder = RequestBuilder.get('/contacts');
      const url = builder.getUrl('https://api.example.com');

      expect(url).toBe('https://api.example.com/contacts');
    });

    it('should build URL with query parameters', () => {
      const builder = RequestBuilder.get('/contacts').query('page', 1).query('limit', 10);
      const url = builder.getUrl('https://api.example.com');

      expect(url).toContain('page=1');
      expect(url).toContain('limit=10');
    });
  });

  describe('build', () => {
    it('should return frozen config object', () => {
      const request = RequestBuilder.get('/path').build();

      expect(Object.isFrozen(request)).toBe(true);
    });
  });

  describe('method chaining', () => {
    it('should support full fluent API', () => {
      const controller = new AbortController();
      const request = RequestBuilder.post<{ name: string }>('/users')
        .json({ name: 'John' })
        .query('notify', true)
        .header('X-Request-ID', '123')
        .bearerToken('token')
        .timeout(10000)
        .abort(controller.signal)
        .build();

      expect(request.method).toBe('POST');
      expect(request.path).toBe('/users');
      expect(request.body).toEqual({ name: 'John' });
      expect(request.headers['Content-Type']).toBe('application/json');
      expect(request.headers['Authorization']).toBe('Bearer token');
      expect(request.headers['X-Request-ID']).toBe('123');
      expect(request.query.notify).toBe('true');
      expect(request.timeout).toBe(10000);
      expect(request.signal).toBe(controller.signal);
    });
  });
});

// ============================================
// BaseClientBuilder Tests
// ============================================

describe('BaseClientBuilder', () => {
  // Create a concrete implementation for testing
  interface TestClientConfig extends BaseClientConfig {
    readonly customOption?: string;
  }

  interface TestClient {
    execute: () => void;
  }

  class TestClientBuilder extends BaseClientBuilder<TestClientConfig, TestClient> {
    private customOption?: string;

    constructor() {
      super();
    }

    static create(): TestClientBuilder {
      return new TestClientBuilder();
    }

    withCustomOption(value: string): this {
      this.customOption = value;
      return this;
    }

    build(): TestClient {
      this.validate();
      return {
        execute: () => {
          // noop
        },
      };
    }
  }

  describe('withApiKey', () => {
    it('should set API key', () => {
      const builder = TestClientBuilder.create().withApiKey('test-api-key');

      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('withBaseUrl', () => {
    it('should set base URL', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withBaseUrl('https://api.example.com');

      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('withRetry', () => {
    it('should accept RetryConfig object', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withRetry(RetryConfigBuilder.aggressive());

      expect(() => builder.build()).not.toThrow();
    });

    it('should accept builder function', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withRetry((b) => b.maxRetries(5).exponentialBackoff(2000));

      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('withTimeout', () => {
    it('should accept TimeoutConfig object', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withTimeout(TimeoutBuilder.fast());

      expect(() => builder.build()).not.toThrow();
    });

    it('should accept builder function', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withTimeout((b) => b.connect(3000).request(15000));

      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('withCircuitBreaker', () => {
    it('should accept CircuitBreakerConfig object', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withCircuitBreaker(CircuitBreakerBuilder.forPayments());

      expect(() => builder.build()).not.toThrow();
    });

    it('should accept builder function', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withCircuitBreaker((b) => b.failureThreshold(10).resetTimeout(60000));

      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('withoutCircuitBreaker', () => {
    it('should disable circuit breaker', () => {
      const builder = TestClientBuilder.create().withApiKey('key').withoutCircuitBreaker();

      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('withCorrelationId', () => {
    it('should set correlation ID', () => {
      const correlationId = unsafe.correlationId('test-correlation-id');
      const builder = TestClientBuilder.create().withApiKey('key').withCorrelationId(correlationId);

      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('withHeaders', () => {
    it('should add custom headers', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withHeaders({ 'X-Custom': 'value' });

      expect(() => builder.build()).not.toThrow();
    });

    it('should merge multiple header calls', () => {
      const builder = TestClientBuilder.create()
        .withApiKey('key')
        .withHeaders({ 'X-First': '1' })
        .withHeaders({ 'X-Second': '2' });

      expect(() => builder.build()).not.toThrow();
    });
  });

  describe('validate', () => {
    it('should throw when API key is not set', () => {
      const builder = TestClientBuilder.create();

      expect(() => builder.build()).toThrow('API key is required');
    });
  });

  describe('method chaining', () => {
    it('should support full fluent API', () => {
      const correlationId = unsafe.correlationId('corr-123');
      const builder = TestClientBuilder.create()
        .withApiKey('my-api-key')
        .withBaseUrl('https://api.example.com')
        .withRetry((b) => b.maxRetries(5))
        .withTimeout((b) => b.connect(3000))
        .withCircuitBreaker((b) => b.failureThreshold(10))
        .withCorrelationId(correlationId)
        .withHeaders({ 'X-Custom': 'value' })
        .withCustomOption('custom');

      expect(() => builder.build()).not.toThrow();
    });
  });
});
