/**
 * Comprehensive Unit Tests for Circuit Breaker
 * Coverage target: 100%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerRegistry,
  CircuitState,
  globalCircuitBreakerRegistry,
  withCircuitBreaker,
  createCircuitBreakerWrapper,
} from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      successThreshold: 2,
      failureWindowMs: 10000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('starts in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('allows requests in CLOSED state', () => {
      expect(breaker.isAllowingRequests()).toBe(true);
    });

    it('has correct initial stats', () => {
      const stats = breaker.getStats();
      expect(stats).toEqual({
        name: 'test-service',
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        totalRequests: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      });
    });
  });

  describe('Success Handling', () => {
    it('increments success counters on successful execution', async () => {
      await breaker.execute(async () => 'success');

      const stats = breaker.getStats();
      expect(stats.successes).toBe(1);
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('records lastSuccessTime', async () => {
      const now = Date.now();
      await breaker.execute(async () => 'success');

      const stats = breaker.getStats();
      expect(stats.lastSuccessTime).toBeGreaterThanOrEqual(now);
    });

    it('returns the result from executed function', async () => {
      const result = await breaker.execute(async () => ({ data: 'test' }));
      expect(result).toEqual({ data: 'test' });
    });

    it('resets failure count on success in CLOSED state', async () => {
      // Cause some failures (but not enough to open)
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      // Now succeed
      await breaker.execute(async () => 'success');

      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
    });
  });

  describe('Failure Handling', () => {
    it('increments failure counters on failed execution', async () => {
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.totalFailures).toBe(1);
    });

    it('records lastFailureTime', async () => {
      const now = Date.now();
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      const stats = breaker.getStats();
      expect(stats.lastFailureTime).toBeGreaterThanOrEqual(now);
    });

    it('propagates the error to caller', async () => {
      await expect(
        breaker.execute(async () => {
          throw new Error('specific error');
        })
      ).rejects.toThrow('specific error');
    });
  });

  describe('State Transitions', () => {
    it('opens after failure threshold is reached', async () => {
      // Cause 3 failures (threshold)
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('fail');
          })
          .catch(() => {});
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('rejects requests when OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('fail');
          })
          .catch(() => {});
      }

      await expect(breaker.execute(async () => 'should not run')).rejects.toBeInstanceOf(
        CircuitBreakerError
      );
    });

    it('transitions to HALF_OPEN after resetTimeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('fail');
          })
          .catch(() => {});
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past reset timeout
      vi.advanceTimersByTime(5001);

      // The state transitions on next request attempt
      expect(breaker.isAllowingRequests()).toBe(true);
    });

    it('closes after success threshold in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('fail');
          })
          .catch(() => {});
      }

      // Advance time to allow transition to HALF_OPEN
      vi.advanceTimersByTime(5001);

      // Succeed twice (successThreshold = 2)
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('reopens on failure in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('fail');
          })
          .catch(() => {});
      }

      // Advance time to allow transition to HALF_OPEN
      vi.advanceTimersByTime(5001);

      // Fail in HALF_OPEN
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Callbacks', () => {
    it('calls onStateChange when state changes', async () => {
      const onStateChange = vi.fn();
      const breakerWithCallback = new CircuitBreaker({
        name: 'callback-test',
        failureThreshold: 1,
        resetTimeoutMs: 5000,
        successThreshold: 1,
        onStateChange,
      });

      await breakerWithCallback
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      expect(onStateChange).toHaveBeenCalledWith(
        'callback-test',
        CircuitState.CLOSED,
        CircuitState.OPEN
      );
    });

    it('calls onOpen when circuit opens', async () => {
      const onOpen = vi.fn();
      const breakerWithCallback = new CircuitBreaker({
        name: 'open-test',
        failureThreshold: 1,
        resetTimeoutMs: 5000,
        successThreshold: 1,
        onOpen,
      });

      await breakerWithCallback
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      expect(onOpen).toHaveBeenCalledWith('open-test', expect.any(Error));
    });

    it('calls onClose when circuit closes', async () => {
      const onClose = vi.fn();
      const breakerWithCallback = new CircuitBreaker({
        name: 'close-test',
        failureThreshold: 1,
        resetTimeoutMs: 100,
        successThreshold: 1,
        onClose,
      });

      // Open the circuit
      await breakerWithCallback
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      // Wait for reset timeout
      vi.advanceTimersByTime(101);

      // Succeed to close
      await breakerWithCallback.execute(async () => 'success');

      expect(onClose).toHaveBeenCalledWith('close-test');
    });
  });

  describe('Reset', () => {
    it('resets to CLOSED state and counters', async () => {
      // Create a fresh breaker for this test
      const freshBreaker = new CircuitBreaker({
        name: 'fresh-test',
        failureThreshold: 1,
        resetTimeoutMs: 5000,
        successThreshold: 2,
        failureWindowMs: 10000,
      });

      // Open the circuit by failing
      await freshBreaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      expect(freshBreaker.getState()).toBe(CircuitState.OPEN);

      freshBreaker.reset();

      const stats = freshBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      // Counters should be reset
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
      expect(stats.lastFailureTime).toBeNull();
      expect(stats.lastSuccessTime).toBeNull();
    });
  });

  describe('Failure Window', () => {
    it('only counts failures within the window', async () => {
      // Cause 2 failures
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Advance time past failure window
      vi.advanceTimersByTime(11000);

      // This failure should not trigger opening because old failures expired
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});

describe('CircuitBreakerError', () => {
  it('has correct properties', () => {
    const error = new CircuitBreakerError('my-service', CircuitState.OPEN);

    expect(error.name).toBe('CircuitBreakerError');
    expect(error.serviceName).toBe('my-service');
    expect(error.state).toBe(CircuitState.OPEN);
    expect(error.message).toContain('my-service');
    expect(error.message).toContain('OPEN');
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  describe('get', () => {
    it('creates new circuit breaker if not exists', () => {
      const breaker = registry.get('new-service');
      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });

    it('returns existing circuit breaker if exists', () => {
      const breaker1 = registry.get('existing-service');
      const breaker2 = registry.get('existing-service');
      expect(breaker1).toBe(breaker2);
    });

    it('applies custom config', () => {
      const breaker = registry.get('custom-service', {
        failureThreshold: 10,
      });
      expect(breaker.getStats().name).toBe('custom-service');
    });
  });

  describe('getAllStats', () => {
    it('returns stats for all breakers', () => {
      registry.get('service-1');
      registry.get('service-2');

      const stats = registry.getAllStats();
      expect(stats).toHaveLength(2);
      expect(stats.map((s) => s.name)).toContain('service-1');
      expect(stats.map((s) => s.name)).toContain('service-2');
    });
  });

  describe('getOpenCircuits', () => {
    it('returns names of open circuits', async () => {
      vi.useFakeTimers();

      const breaker = registry.get('failing-service', {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        successThreshold: 1,
      });

      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      const open = registry.getOpenCircuits();
      expect(open).toContain('failing-service');

      vi.useRealTimers();
    });
  });

  describe('resetAll', () => {
    it('resets all circuit breakers', async () => {
      vi.useFakeTimers();

      const breaker1 = registry.get('service-1', {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        successThreshold: 1,
      });
      const breaker2 = registry.get('service-2', {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        successThreshold: 1,
      });

      await breaker1
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      await breaker2
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      registry.resetAll();

      expect(breaker1.getState()).toBe(CircuitState.CLOSED);
      expect(breaker2.getState()).toBe(CircuitState.CLOSED);

      vi.useRealTimers();
    });
  });

  describe('reset', () => {
    it('resets specific circuit breaker', async () => {
      vi.useFakeTimers();

      const breaker = registry.get('to-reset', {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        successThreshold: 1,
      });
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      registry.reset('to-reset');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      vi.useRealTimers();
    });
  });

  describe('isOpen', () => {
    it('returns true for open circuits', async () => {
      vi.useFakeTimers();

      const breaker = registry.get('check-open', {
        failureThreshold: 1,
        resetTimeoutMs: 60000,
        successThreshold: 1,
      });
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      expect(registry.isOpen('check-open')).toBe(true);

      vi.useRealTimers();
    });

    it('returns false for non-existent circuit', () => {
      expect(registry.isOpen('non-existent')).toBe(false);
    });

    it('returns false for closed circuits', () => {
      registry.get('closed-circuit');
      expect(registry.isOpen('closed-circuit')).toBe(false);
    });
  });

  describe('wrapClient', () => {
    it('wraps async methods with circuit breaker', async () => {
      const client = {
        async fetch(url: string) {
          return { url, data: 'response' };
        },
        sync: 'not a function',
      };

      const wrapped = registry.wrapClient('api-client', client);

      const result = await wrapped.fetch('/test');
      expect(result).toEqual({ url: '/test', data: 'response' });
    });

    it('passes through non-function properties', () => {
      const client = {
        name: 'my-client',
        version: 1,
        async fetch() {
          return 'data';
        },
      };

      const wrapped = registry.wrapClient('simple-client', client);

      expect(wrapped.name).toBe('my-client');
      expect(wrapped.version).toBe(1);
    });
  });
});

describe('globalCircuitBreakerRegistry', () => {
  beforeEach(() => {
    globalCircuitBreakerRegistry.resetAll();
  });

  it('is a singleton registry', () => {
    const breaker1 = globalCircuitBreakerRegistry.get('global-test');
    const breaker2 = globalCircuitBreakerRegistry.get('global-test');
    expect(breaker1).toBe(breaker2);
  });
});

describe('withCircuitBreaker', () => {
  beforeEach(() => {
    globalCircuitBreakerRegistry.resetAll();
  });

  it('executes function through circuit breaker', async () => {
    const result = await withCircuitBreaker('wrap-test', async () => 'wrapped-result');
    expect(result).toBe('wrapped-result');
  });

  it('uses custom registry', async () => {
    const customRegistry = new CircuitBreakerRegistry();
    const result = await withCircuitBreaker('custom-wrap', async () => 'custom', customRegistry);
    expect(result).toBe('custom');
  });
});

describe('createCircuitBreakerWrapper', () => {
  beforeEach(() => {
    globalCircuitBreakerRegistry.resetAll();
  });

  it('creates wrapped function', async () => {
    const original = async (x: number, y: number) => x + y;
    const wrapped = createCircuitBreakerWrapper('add-wrapper', original);

    const result = await wrapped(2, 3);
    expect(result).toBe(5);
  });

  it('respects custom config', async () => {
    vi.useFakeTimers();

    const failing = async () => {
      throw new Error('fail');
    };
    const wrapped = createCircuitBreakerWrapper('failing-wrapper', failing, {
      failureThreshold: 1,
      resetTimeoutMs: 60000,
      successThreshold: 1,
    });

    await expect(wrapped()).rejects.toThrow('fail');

    // Second call should be blocked by circuit breaker
    await expect(wrapped()).rejects.toBeInstanceOf(CircuitBreakerError);

    vi.useRealTimers();
  });
});
