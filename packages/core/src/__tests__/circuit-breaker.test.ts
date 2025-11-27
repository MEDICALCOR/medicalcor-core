/**
 * Circuit Breaker Unit Tests
 *
 * Tests for the circuit breaker pattern implementation including:
 * - State transitions (CLOSED -> OPEN -> HALF_OPEN -> CLOSED)
 * - Failure threshold detection
 * - Success threshold for recovery
 * - Reset timeout behavior
 * - Callback invocations
 * - Registry management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerError,
  CircuitBreakerRegistry,
  withCircuitBreaker,
  createCircuitBreakerWrapper,
} from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
      failureWindowMs: 5000,
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should allow requests when CLOSED', () => {
      expect(breaker.isAllowingRequests()).toBe(true);
    });

    it('should have zero stats initially', () => {
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
    });
  });

  describe('Successful Execution', () => {
    it('should allow successful calls through', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should track successful requests', async () => {
      await breaker.execute(async () => 'success');
      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.lastSuccessTime).not.toBeNull();
    });

    it('should reset failure count on success', async () => {
      // Create some failures (but not enough to open)
      for (let i = 0; i < 2; i++) {
        await breaker
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }

      // Success should reset the failure count
      await breaker.execute(async () => 'success');

      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
    });
  });

  describe('Failure Threshold', () => {
    it('should remain CLOSED under failure threshold', async () => {
      // Fail twice (threshold is 3)
      for (let i = 0; i < 2; i++) {
        await breaker
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN after reaching failure threshold', async () => {
      // Fail 3 times (threshold is 3)
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should track failure statistics', async () => {
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }

      const stats = breaker.getStats();
      expect(stats.totalFailures).toBe(3);
      expect(stats.lastFailureTime).not.toBeNull();
    });
  });

  describe('OPEN State Behavior', () => {
    beforeEach(async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }
    });

    it('should throw CircuitBreakerError when OPEN', async () => {
      await expect(breaker.execute(async () => 'test')).rejects.toThrow(CircuitBreakerError);
    });

    it('should not allow requests when OPEN', () => {
      expect(breaker.isAllowingRequests()).toBe(false);
    });

    it('should include service name and state in error', async () => {
      try {
        await breaker.execute(async () => 'test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        const cbError = error as CircuitBreakerError;
        expect(cbError.serviceName).toBe('test-service');
        expect(cbError.state).toBe(CircuitState.OPEN);
      }
    });
  });

  describe('HALF_OPEN State and Recovery', () => {
    beforeEach(async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Trigger the transition by attempting a request
      try {
        await breaker.execute(async () => 'test');
      } catch {
        // May fail, but should transition state
      }

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should allow requests in HALF_OPEN state', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(breaker.isAllowingRequests()).toBe(true);
    });

    it('should return to CLOSED after success threshold in HALF_OPEN', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Success threshold is 2
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return to OPEN on failure in HALF_OPEN', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Trigger transition to HALF_OPEN
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Any failure should reopen
      await breaker
        .execute(async () => {
          throw new Error('failure');
        })
        .catch(() => {});

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Callbacks', () => {
    it('should call onStateChange on transitions', async () => {
      const onStateChange = vi.fn();
      const cbWithCallbacks = new CircuitBreaker({
        name: 'callback-test',
        failureThreshold: 2,
        resetTimeoutMs: 100,
        successThreshold: 1,
        onStateChange,
      });

      // Trigger CLOSED -> OPEN
      for (let i = 0; i < 2; i++) {
        await cbWithCallbacks
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }

      expect(onStateChange).toHaveBeenCalledWith(
        'callback-test',
        CircuitState.CLOSED,
        CircuitState.OPEN
      );
    });

    it('should call onOpen when circuit opens', async () => {
      const onOpen = vi.fn();
      const cbWithCallbacks = new CircuitBreaker({
        name: 'open-callback-test',
        failureThreshold: 2,
        resetTimeoutMs: 100,
        successThreshold: 1,
        onOpen,
      });

      for (let i = 0; i < 2; i++) {
        await cbWithCallbacks
          .execute(async () => {
            throw new Error('test error');
          })
          .catch(() => {});
      }

      expect(onOpen).toHaveBeenCalledWith('open-callback-test', expect.any(Error));
    });

    it('should call onClose when circuit closes', async () => {
      const onClose = vi.fn();
      const cbWithCallbacks = new CircuitBreaker({
        name: 'close-callback-test',
        failureThreshold: 1,
        resetTimeoutMs: 50,
        successThreshold: 1,
        onClose,
      });

      // Open the circuit
      await cbWithCallbacks
        .execute(async () => {
          throw new Error('failure');
        })
        .catch(() => {});

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Recover
      await cbWithCallbacks.execute(async () => 'success');

      expect(onClose).toHaveBeenCalledWith('close-callback-test');
    });
  });

  describe('Reset', () => {
    it('should reset all counters and state', async () => {
      // Create some activity
      for (let i = 0; i < 3; i++) {
        await breaker
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
    });
  });

  describe('Failure Window', () => {
    it('should only count failures within the window', async () => {
      const shortWindowBreaker = new CircuitBreaker({
        name: 'short-window',
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        successThreshold: 1,
        failureWindowMs: 100, // Very short window
      });

      // Fail twice
      for (let i = 0; i < 2; i++) {
        await shortWindowBreaker
          .execute(async () => {
            throw new Error('failure');
          })
          .catch(() => {});
      }

      // Wait for failures to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // This failure should not trigger opening because old failures expired
      await shortWindowBreaker
        .execute(async () => {
          throw new Error('failure');
        })
        .catch(() => {});

      expect(shortWindowBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
    });
  });

  it('should create and return circuit breakers by name', () => {
    const breaker1 = registry.get('service-1');
    const breaker2 = registry.get('service-2');

    expect(breaker1).toBeInstanceOf(CircuitBreaker);
    expect(breaker2).toBeInstanceOf(CircuitBreaker);
    expect(breaker1).not.toBe(breaker2);
  });

  it('should return same breaker for same name', () => {
    const breaker1 = registry.get('service');
    const breaker2 = registry.get('service');

    expect(breaker1).toBe(breaker2);
  });

  it('should allow custom config per breaker', () => {
    const customBreaker = registry.get('custom', {
      failureThreshold: 10,
    });

    expect(customBreaker).toBeInstanceOf(CircuitBreaker);
  });

  it('should return all stats', async () => {
    const breaker1 = registry.get('service-1');
    const breaker2 = registry.get('service-2');

    await breaker1.execute(async () => 'success');
    await breaker2.execute(async () => 'success');

    const allStats = registry.getAllStats();
    expect(allStats).toHaveLength(2);
    expect(allStats.map((s) => s.name)).toContain('service-1');
    expect(allStats.map((s) => s.name)).toContain('service-2');
  });

  it('should return open circuits', async () => {
    const breaker = registry.get('failing-service', {
      failureThreshold: 1,
    });

    await breaker
      .execute(async () => {
        throw new Error('failure');
      })
      .catch(() => {});

    const openCircuits = registry.getOpenCircuits();
    expect(openCircuits).toContain('failing-service');
  });

  it('should reset all breakers', async () => {
    const breaker = registry.get('test-service', {
      failureThreshold: 1,
    });

    await breaker
      .execute(async () => {
        throw new Error('failure');
      })
      .catch(() => {});

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    registry.resetAll();

    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should reset specific breaker', async () => {
    const breaker = registry.get('specific-service', {
      failureThreshold: 1,
    });

    await breaker
      .execute(async () => {
        throw new Error('failure');
      })
      .catch(() => {});

    expect(breaker.getState()).toBe(CircuitState.OPEN);

    registry.reset('specific-service');

    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });
});

describe('Helper Functions', () => {
  describe('withCircuitBreaker', () => {
    it('should wrap function with circuit breaker', async () => {
      const registry = new CircuitBreakerRegistry();
      const result = await withCircuitBreaker('test-fn', async () => 'wrapped-result', registry);

      expect(result).toBe('wrapped-result');
    });

    it('should fail fast when circuit is open', async () => {
      const registry = new CircuitBreakerRegistry({
        failureThreshold: 1,
        resetTimeoutMs: 10000,
        successThreshold: 1,
      });

      // Open the circuit
      await withCircuitBreaker(
        'failing-fn',
        async () => {
          throw new Error('failure');
        },
        registry
      ).catch(() => {});

      // Should fail fast
      await expect(
        withCircuitBreaker('failing-fn', async () => 'success', registry)
      ).rejects.toThrow(CircuitBreakerError);
    });
  });

  describe('createCircuitBreakerWrapper', () => {
    it('should create a reusable wrapped function', async () => {
      const registry = new CircuitBreakerRegistry();
      const originalFn = async (a: number, b: number) => a + b;
      const wrappedFn = createCircuitBreakerWrapper('add-fn', originalFn, undefined, registry);

      const result = await wrappedFn(2, 3);
      expect(result).toBe(5);
    });

    it('should preserve function arguments', async () => {
      const registry = new CircuitBreakerRegistry();
      const originalFn = async (name: string, age: number) => ({ name, age });
      const wrappedFn = createCircuitBreakerWrapper('user-fn', originalFn, undefined, registry);

      const result = await wrappedFn('John', 30);
      expect(result).toEqual({ name: 'John', age: 30 });
    });

    it('should use custom config', async () => {
      const registry = new CircuitBreakerRegistry();
      const failingFn = async () => {
        throw new Error('always fails');
      };
      const wrappedFn = createCircuitBreakerWrapper(
        'custom-config-fn',
        failingFn,
        { failureThreshold: 1 },
        registry
      );

      // First call fails
      await wrappedFn().catch(() => {});

      // Circuit should be open now
      await expect(wrappedFn()).rejects.toThrow(CircuitBreakerError);
    });
  });
});
