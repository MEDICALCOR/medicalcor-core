/**
 * Adaptive Timeout Tests
 *
 * Comprehensive tests for adaptive timeout configuration and management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  AdaptiveTimeoutManager,
  createAdaptiveTimeoutManager,
  adaptiveTimeout,
  DEFAULT_TIMEOUT_CONFIG,
  TimeoutConfigSchema,
  AdaptiveTimeoutConfigSchema,
  type AIOperationType,
  type TimeoutConfig,
  type AdaptiveTimeoutConfig,
} from '../adaptive-timeout.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AdaptiveTimeout', () => {
  describe('DEFAULT_TIMEOUT_CONFIG', () => {
    it('should define timeout configs for all operation types', () => {
      const expectedOperations: AIOperationType[] = [
        'scoring',
        'reply_generation',
        'sentiment',
        'language_detection',
        'summarization',
        'embedding',
        'function_call',
        'workflow',
        'batch',
        'default',
      ];

      for (const op of expectedOperations) {
        expect(DEFAULT_TIMEOUT_CONFIG[op]).toBeDefined();
        expect(DEFAULT_TIMEOUT_CONFIG[op].timeoutMs).toBeGreaterThan(0);
        expect(DEFAULT_TIMEOUT_CONFIG[op].maxRetries).toBeGreaterThanOrEqual(0);
        expect(['critical', 'high', 'normal', 'low']).toContain(
          DEFAULT_TIMEOUT_CONFIG[op].priority
        );
      }
    });

    it('should configure scoring as critical with 5s timeout', () => {
      const config = DEFAULT_TIMEOUT_CONFIG.scoring;
      expect(config.timeoutMs).toBe(5000);
      expect(config.instantFallback).toBe(true);
      expect(config.fallbackTimeoutMs).toBe(2000);
      expect(config.maxRetries).toBe(1);
      expect(config.priority).toBe('critical');
    });

    it('should configure reply_generation with instant fallback', () => {
      const config = DEFAULT_TIMEOUT_CONFIG.reply_generation;
      expect(config.timeoutMs).toBe(10000);
      expect(config.instantFallback).toBe(true);
      expect(config.fallbackTimeoutMs).toBe(5000);
      expect(config.maxRetries).toBe(2);
      expect(config.priority).toBe('high');
    });

    it('should configure sentiment with instant fallback', () => {
      const config = DEFAULT_TIMEOUT_CONFIG.sentiment;
      expect(config.timeoutMs).toBe(5000);
      expect(config.instantFallback).toBe(true);
      expect(config.fallbackTimeoutMs).toBe(3000);
    });

    it('should configure language_detection as critical', () => {
      const config = DEFAULT_TIMEOUT_CONFIG.language_detection;
      expect(config.timeoutMs).toBe(3000);
      expect(config.priority).toBe('critical');
    });

    it('should configure longer timeouts for batch operations', () => {
      const config = DEFAULT_TIMEOUT_CONFIG.batch;
      expect(config.timeoutMs).toBe(120000); // 2 minutes
      expect(config.instantFallback).toBe(false);
      expect(config.priority).toBe('low');
    });

    it('should configure workflow with 60s timeout', () => {
      const config = DEFAULT_TIMEOUT_CONFIG.workflow;
      expect(config.timeoutMs).toBe(60000);
      expect(config.instantFallback).toBe(false);
    });
  });

  describe('TimeoutConfigSchema', () => {
    it('should validate a correct timeout config', () => {
      const validConfig = {
        timeoutMs: 5000,
        instantFallback: true,
        fallbackTimeoutMs: 2000,
        maxRetries: 2,
        priority: 'high' as const,
      };

      const result = TimeoutConfigSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    it('should reject timeout below minimum (1000ms)', () => {
      const invalidConfig = {
        timeoutMs: 500,
        instantFallback: false,
        maxRetries: 1,
        priority: 'normal' as const,
      };

      expect(() => TimeoutConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject timeout above maximum (300000ms)', () => {
      const invalidConfig = {
        timeoutMs: 400000,
        instantFallback: false,
        maxRetries: 1,
        priority: 'normal' as const,
      };

      expect(() => TimeoutConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject fallback timeout below minimum (500ms)', () => {
      const invalidConfig = {
        timeoutMs: 5000,
        instantFallback: true,
        fallbackTimeoutMs: 100,
        maxRetries: 1,
        priority: 'normal' as const,
      };

      expect(() => TimeoutConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject maxRetries above 5', () => {
      const invalidConfig = {
        timeoutMs: 5000,
        instantFallback: false,
        maxRetries: 10,
        priority: 'normal' as const,
      };

      expect(() => TimeoutConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject invalid priority', () => {
      const invalidConfig = {
        timeoutMs: 5000,
        instantFallback: false,
        maxRetries: 1,
        priority: 'urgent',
      };

      expect(() => TimeoutConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should allow optional fallbackTimeoutMs', () => {
      const validConfig = {
        timeoutMs: 5000,
        instantFallback: false,
        maxRetries: 1,
        priority: 'normal' as const,
      };

      const result = TimeoutConfigSchema.parse(validConfig);
      expect(result.fallbackTimeoutMs).toBeUndefined();
    });
  });

  describe('AdaptiveTimeoutConfigSchema', () => {
    it('should validate with default values', () => {
      const config = AdaptiveTimeoutConfigSchema.parse({});
      expect(config.globalMultiplier).toBe(1.0);
      expect(config.enableAdaptive).toBe(true);
      expect(config.minTimeoutMs).toBe(2000);
      expect(config.maxTimeoutMs).toBe(120000);
    });

    it('should accept custom global multiplier', () => {
      const config = AdaptiveTimeoutConfigSchema.parse({
        globalMultiplier: 2.5,
      });
      expect(config.globalMultiplier).toBe(2.5);
    });

    it('should reject global multiplier below minimum (0.1)', () => {
      expect(() =>
        AdaptiveTimeoutConfigSchema.parse({ globalMultiplier: 0.05 })
      ).toThrow();
    });

    it('should reject global multiplier above maximum (10)', () => {
      expect(() =>
        AdaptiveTimeoutConfigSchema.parse({ globalMultiplier: 15 })
      ).toThrow();
    });

    it('should accept custom min/max timeouts', () => {
      const config = AdaptiveTimeoutConfigSchema.parse({
        minTimeoutMs: 3000,
        maxTimeoutMs: 90000,
      });
      expect(config.minTimeoutMs).toBe(3000);
      expect(config.maxTimeoutMs).toBe(90000);
    });

    it('should validate overrides with TimeoutConfigSchema', () => {
      const config = AdaptiveTimeoutConfigSchema.parse({
        overrides: {
          scoring: {
            timeoutMs: 3000,
            instantFallback: false,
            maxRetries: 0,
            priority: 'high' as const,
          },
        },
      });

      expect(config.overrides?.scoring).toBeDefined();
    });

    it('should reject invalid overrides', () => {
      expect(() =>
        AdaptiveTimeoutConfigSchema.parse({
          overrides: {
            scoring: {
              timeoutMs: 100, // Too low
              instantFallback: false,
              maxRetries: 0,
              priority: 'high' as const,
            },
          },
        })
      ).toThrow();
    });
  });

  describe('AdaptiveTimeoutManager', () => {
    let manager: AdaptiveTimeoutManager;

    beforeEach(() => {
      manager = new AdaptiveTimeoutManager();
    });

    describe('constructor', () => {
      it('should initialize with default config', () => {
        const config = manager.getConfig();
        expect(config.globalMultiplier).toBe(1.0);
        expect(config.enableAdaptive).toBe(true);
        expect(config.minTimeoutMs).toBe(2000);
        expect(config.maxTimeoutMs).toBe(120000);
      });

      it('should accept custom config', () => {
        const customManager = new AdaptiveTimeoutManager({
          globalMultiplier: 2.0,
          enableAdaptive: false,
          minTimeoutMs: 3000,
          maxTimeoutMs: 90000,
        });

        const config = customManager.getConfig();
        expect(config.globalMultiplier).toBe(2.0);
        expect(config.enableAdaptive).toBe(false);
        expect(config.minTimeoutMs).toBe(3000);
        expect(config.maxTimeoutMs).toBe(90000);
      });

      it('should merge overrides with defaults', () => {
        const customManager = new AdaptiveTimeoutManager({
          overrides: {
            scoring: {
              timeoutMs: 3000,
              instantFallback: false,
              maxRetries: 0,
              priority: 'normal' as const,
            },
          },
        });

        const config = customManager.getTimeoutConfig('scoring');
        expect(config.timeoutMs).toBe(3000);
        expect(config.instantFallback).toBe(false);
        expect(config.maxRetries).toBe(0);
        expect(config.priority).toBe('normal');
      });

      it('should ignore invalid override keys', () => {
        const customManager = new AdaptiveTimeoutManager({
          overrides: {
            invalid_op: {
              timeoutMs: 3000,
              instantFallback: false,
              maxRetries: 0,
              priority: 'normal' as const,
            },
          },
        });

        // Should not throw, just ignore the invalid key
        expect(customManager).toBeDefined();
      });
    });

    describe('getTimeoutConfig', () => {
      it('should return config for known operation', () => {
        const config = manager.getTimeoutConfig('scoring');
        expect(config.timeoutMs).toBe(5000);
        expect(config.priority).toBe('critical');
      });

      it('should return default config for unknown operation', () => {
        const config = manager.getTimeoutConfig('unknown' as AIOperationType);
        expect(config.timeoutMs).toBe(30000); // default timeout
      });

      it('should apply global multiplier', () => {
        const customManager = new AdaptiveTimeoutManager({
          globalMultiplier: 2.0,
        });

        const config = customManager.getTimeoutConfig('scoring');
        expect(config.timeoutMs).toBe(10000); // 5000 * 2.0
      });

      it('should apply global multiplier to fallback timeout', () => {
        const customManager = new AdaptiveTimeoutManager({
          globalMultiplier: 2.0,
        });

        const config = customManager.getTimeoutConfig('scoring');
        expect(config.fallbackTimeoutMs).toBe(4000); // 2000 * 2.0
      });

      it('should clamp to minTimeoutMs', () => {
        const customManager = new AdaptiveTimeoutManager({
          globalMultiplier: 0.1, // Very low multiplier
          minTimeoutMs: 3000,
        });

        const config = customManager.getTimeoutConfig('scoring');
        expect(config.timeoutMs).toBe(3000); // Clamped to min
      });

      it('should clamp to maxTimeoutMs', () => {
        const customManager = new AdaptiveTimeoutManager({
          globalMultiplier: 10.0, // Very high multiplier
          maxTimeoutMs: 60000,
        });

        const config = customManager.getTimeoutConfig('batch');
        // batch is 120000ms * 10 = 1200000ms, clamped to 60000ms
        expect(config.timeoutMs).toBe(60000);
      });

      it('should use adapted timeout when available', () => {
        // Record performance to create adapted timeout
        for (let i = 0; i < 15; i++) {
          manager.recordPerformance('scoring', 3000, true);
        }

        const config = manager.getTimeoutConfig('scoring');
        // Should use adapted timeout based on performance
        expect(config.timeoutMs).toBeGreaterThan(0);
      });

      it('should respect enableAdaptive flag', () => {
        const customManager = new AdaptiveTimeoutManager({
          enableAdaptive: false,
        });

        // Record performance (should be ignored)
        for (let i = 0; i < 15; i++) {
          customManager.recordPerformance('scoring', 10000, true);
        }

        const config = customManager.getTimeoutConfig('scoring');
        expect(config.timeoutMs).toBe(5000); // Should remain default
      });
    });

    describe('getTimeout', () => {
      it('should return timeout in milliseconds', () => {
        const timeout = manager.getTimeout('scoring');
        expect(timeout).toBe(5000);
      });

      it('should match getTimeoutConfig().timeoutMs', () => {
        const timeout = manager.getTimeout('reply_generation');
        const config = manager.getTimeoutConfig('reply_generation');
        expect(timeout).toBe(config.timeoutMs);
      });
    });

    describe('shouldUseFallback', () => {
      it('should return true for operations with instant fallback', () => {
        expect(manager.shouldUseFallback('scoring')).toBe(true);
        expect(manager.shouldUseFallback('reply_generation')).toBe(true);
        expect(manager.shouldUseFallback('sentiment')).toBe(true);
      });

      it('should return false for operations without instant fallback', () => {
        expect(manager.shouldUseFallback('summarization')).toBe(false);
        expect(manager.shouldUseFallback('embedding')).toBe(false);
        expect(manager.shouldUseFallback('workflow')).toBe(false);
      });
    });

    describe('recordPerformance', () => {
      it('should record initial performance metrics', () => {
        manager.recordPerformance('scoring', 3000, true);

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics).toBeDefined();
        expect(metrics?.avgResponseTimeMs).toBe(3000);
        expect(metrics?.p95ResponseTimeMs).toBe(3000);
        expect(metrics?.successRate).toBe(1);
        expect(metrics?.sampleCount).toBe(1);
      });

      it('should update metrics with exponential moving average', () => {
        manager.recordPerformance('scoring', 2000, true);
        manager.recordPerformance('scoring', 4000, true);

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics?.avgResponseTimeMs).toBeGreaterThan(2000);
        expect(metrics?.avgResponseTimeMs).toBeLessThan(4000);
        expect(metrics?.sampleCount).toBe(2);
      });

      it('should track success rate', () => {
        manager.recordPerformance('scoring', 2000, true);
        manager.recordPerformance('scoring', 3000, true);
        manager.recordPerformance('scoring', 4000, false);

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics?.successRate).toBeGreaterThan(0);
        expect(metrics?.successRate).toBeLessThan(1);
      });

      it('should update p95 response time', () => {
        manager.recordPerformance('scoring', 2000, true);
        manager.recordPerformance('scoring', 5000, true);

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics?.p95ResponseTimeMs).toBeGreaterThanOrEqual(2000);
      });

      it('should not record when adaptive is disabled', () => {
        const customManager = new AdaptiveTimeoutManager({
          enableAdaptive: false,
        });

        customManager.recordPerformance('scoring', 3000, true);

        const metrics = customManager.getPerformanceMetrics('scoring');
        expect(metrics).toBeUndefined();
      });

      it('should recalculate adapted timeout after sufficient samples', () => {
        // Record enough samples (>= 10) to trigger adaptation
        for (let i = 0; i < 15; i++) {
          manager.recordPerformance('scoring', 6000, true);
        }

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics?.sampleCount).toBe(15);

        // Adapted timeout should be calculated
        const config = manager.getTimeoutConfig('scoring');
        // With 6000ms avg, p95 should be around 6000, adapted = 6000 * 1.5 = 9000
        // But critical operations use max(adapted, base), so at least 5000
        expect(config.timeoutMs).toBeGreaterThanOrEqual(5000);
      });

      it('should increase timeout for low success rate', () => {
        // Record samples with low success rate
        for (let i = 0; i < 15; i++) {
          manager.recordPerformance('embedding', 8000, i % 3 === 0); // ~33% success
        }

        const metrics = manager.getPerformanceMetrics('embedding');
        expect(metrics?.successRate).toBeLessThan(0.9);

        const config = manager.getTimeoutConfig('embedding');
        // Should have increased timeout due to low success rate
        expect(config.timeoutMs).toBeGreaterThan(10000);
      });

      it('should preserve base timeout for critical operations', () => {
        // Record fast responses
        for (let i = 0; i < 15; i++) {
          manager.recordPerformance('scoring', 1000, true);
        }

        const config = manager.getTimeoutConfig('scoring');
        // Should not go below base timeout for critical
        expect(config.timeoutMs).toBeGreaterThanOrEqual(5000);
      });

      it('should handle fallback for completely unknown operation type', () => {
        // Test the defensive fallback in recalculateAdaptedTimeout
        const unknownOp = 'unknown_operation' as AIOperationType;

        // Record enough samples to trigger recalculation
        for (let i = 0; i < 15; i++) {
          manager.recordPerformance(unknownOp, 5000, true);
        }

        // Should fall back to default config
        const config = manager.getTimeoutConfig(unknownOp);
        expect(config.timeoutMs).toBeGreaterThan(0);
      });
    });

    describe('executeWithTimeout', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should execute primary function successfully', async () => {
        const primaryFn = vi.fn().mockResolvedValue('success');

        const promise = manager.executeWithTimeout('scoring', primaryFn);

        // Fast-forward time but don't exceed timeout
        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(false);
        expect(result.result).toBe('success');
        expect(result.provider).toBe('primary');
        expect(primaryFn).toHaveBeenCalledTimes(1);
      });

      it('should record performance on success', async () => {
        const primaryFn = vi.fn().mockResolvedValue('success');

        const promise = manager.executeWithTimeout('scoring', primaryFn);
        await vi.advanceTimersByTimeAsync(100);
        await promise;

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics).toBeDefined();
        expect(metrics?.sampleCount).toBe(1);
        expect(metrics?.successRate).toBe(1);
      });

      it('should timeout primary function', async () => {
        const primaryFn = vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('delayed'), 10000);
            })
        );

        const promise = manager.executeWithTimeout('scoring', primaryFn);

        // Advance past timeout (5000ms for scoring)
        const result = vi.advanceTimersByTimeAsync(6000);

        await expect(promise).rejects.toThrow('Operation timed out');
        await result; // Ensure timers are cleared
      });

      it('should use fallback function on timeout', async () => {
        const primaryFn = vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('delayed'), 10000);
            })
        );
        const fallbackFn = vi.fn().mockResolvedValue('fallback-result');

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          fallbackFn
        );

        // Advance past primary timeout
        await vi.advanceTimersByTimeAsync(6000);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toBe('fallback-result');
        expect(result.provider).toBe('fallback');
        expect(result.primaryError).toBeDefined();
        expect(fallbackFn).toHaveBeenCalledTimes(1);
      });

      it('should use fallback value when fallback function fails', async () => {
        const primaryFn = vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('delayed'), 10000);
            })
        );
        const fallbackFn = vi.fn().mockRejectedValue(new Error('Fallback failed'));
        const fallbackValue = 'default-value';

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          fallbackFn,
          fallbackValue
        );

        // Advance past timeouts
        await vi.advanceTimersByTimeAsync(10000);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toBe('default-value');
        expect(result.provider).toBe('fallback_value');
      });

      it('should use fallback value directly when no fallback function', async () => {
        const primaryFn = vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('delayed'), 10000);
            })
        );
        const fallbackValue = { score: 0, reason: 'timeout' };

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          undefined,
          fallbackValue
        );

        // Advance past timeout
        await vi.advanceTimersByTimeAsync(6000);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toEqual(fallbackValue);
        expect(result.provider).toBe('fallback_value');
      });

      it('should throw when no fallback available', async () => {
        const customManager = new AdaptiveTimeoutManager({
          overrides: {
            summarization: {
              timeoutMs: 1000,
              instantFallback: false,
              maxRetries: 0,
              priority: 'normal' as const,
            },
          },
        });

        const primaryFn = vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('delayed'), 5000);
            })
        );

        const promise = customManager.executeWithTimeout(
          'summarization',
          primaryFn
        );

        // Advance past timeout
        const result = vi.advanceTimersByTimeAsync(2000);

        await expect(promise).rejects.toThrow('Operation timed out');
        await result; // Ensure timers are cleared
      });

      it('should handle primary function errors', async () => {
        const primaryFn = vi.fn().mockRejectedValue(new Error('Primary error'));
        const fallbackValue = 'fallback';

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          undefined,
          fallbackValue
        );

        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toBe('fallback');
        expect(result.primaryError?.message).toBe('Primary error');
      });

      it('should handle non-Error objects as errors', async () => {
        const primaryFn = vi.fn().mockRejectedValue('string error');
        const fallbackValue = 'fallback';

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          undefined,
          fallbackValue
        );

        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.primaryError).toBeInstanceOf(Error);
        expect(result.primaryError?.message).toBe('string error');
      });

      it('should preserve Error objects when primary fails with Error', async () => {
        const customError = new Error('Custom error message');
        const primaryFn = vi.fn().mockRejectedValue(customError);
        const fallbackFn = vi.fn().mockResolvedValue('fallback');

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          fallbackFn
        );

        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.primaryError).toBe(customError);
        expect(result.primaryError?.message).toBe('Custom error message');
      });

      it('should convert non-Error to Error when using fallback value', async () => {
        const primaryFn = vi.fn().mockRejectedValue({ code: 'CUSTOM_ERROR' });
        const fallbackValue = 'default';

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          undefined,
          fallbackValue
        );

        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toBe('default');
        expect(result.primaryError).toBeInstanceOf(Error);
        expect(result.primaryError?.message).toContain('object');
      });

      it('should preserve Error when using fallback value', async () => {
        const customError = new Error('Primary error');
        const primaryFn = vi.fn().mockRejectedValue(customError);
        const fallbackValue = 'default';

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          undefined,
          fallbackValue
        );

        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toBe('default');
        expect(result.primaryError).toBe(customError);
      });

      it('should convert non-Error to Error when fallback succeeds', async () => {
        const primaryFn = vi.fn().mockRejectedValue({ custom: 'error object' });
        const fallbackFn = vi.fn().mockResolvedValue('fallback-success');

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          fallbackFn
        );

        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toBe('fallback-success');
        expect(result.primaryError).toBeInstanceOf(Error);
      });

      it('should log warning when both primary and fallback fail', async () => {
        const { logger } = await import('../../logger.js');

        const primaryFn = vi.fn().mockRejectedValue(new Error('Primary failed'));
        const fallbackFn = vi.fn().mockRejectedValue(new Error('Fallback failed'));
        const fallbackValue = 'final-fallback';

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          fallbackFn,
          fallbackValue
        );

        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toBe('final-fallback');
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: 'scoring',
          }),
          'Both primary and fallback operations failed'
        );
      });

      it('should log warning with non-Error primary error when both fail', async () => {
        const { logger } = await import('../../logger.js');

        const primaryFn = vi.fn().mockRejectedValue('string error');
        const fallbackFn = vi.fn().mockRejectedValue(new Error('Fallback failed'));
        const fallbackValue = 'final-fallback';

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          fallbackFn,
          fallbackValue
        );

        await vi.advanceTimersByTimeAsync(100);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            operation: 'scoring',
            primaryError: 'string error',
          }),
          'Both primary and fallback operations failed'
        );
      });

      it('should apply fallback timeout from config', async () => {
        const primaryFn = vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('delayed'), 10000);
            })
        );
        const fallbackFn = vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('fallback'), 5000);
            })
        );

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          fallbackFn
        );

        // Advance past primary timeout (5000ms)
        const result1 = vi.advanceTimersByTimeAsync(5500);

        // Fallback should start, advance past fallback timeout (2000ms)
        const result2 = vi.advanceTimersByTimeAsync(2500);

        // Should throw because fallback also timed out
        await expect(promise).rejects.toThrow();
        await result1; // Ensure timers are cleared
        await result2;
      });

      it('should calculate fallback timeout when not specified', async () => {
        const customManager = new AdaptiveTimeoutManager({
          overrides: {
            summarization: {
              timeoutMs: 10000,
              instantFallback: true,
              // No fallbackTimeoutMs specified
              maxRetries: 1,
              priority: 'normal' as const,
            },
          },
        });

        const primaryFn = vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve('delayed'), 20000);
            })
        );
        const fallbackFn = vi.fn().mockResolvedValue('fallback');

        const promise = customManager.executeWithTimeout(
          'summarization',
          primaryFn,
          fallbackFn
        );

        await vi.advanceTimersByTimeAsync(11000);

        const result = await promise;

        expect(result.usedFallback).toBe(true);
        expect(result.result).toBe('fallback');
      });

      it('should record performance on primary failure', async () => {
        const primaryFn = vi.fn().mockRejectedValue(new Error('Fail'));

        const promise = manager.executeWithTimeout(
          'scoring',
          primaryFn,
          undefined,
          'fallback'
        );

        await vi.advanceTimersByTimeAsync(100);
        await promise;

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics?.successRate).toBe(0);
      });
    });

    describe('getPerformanceMetrics', () => {
      it('should return undefined for operation with no metrics', () => {
        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics).toBeUndefined();
      });

      it('should return metrics after recording', () => {
        manager.recordPerformance('scoring', 3000, true);

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics).toBeDefined();
        expect(metrics?.avgResponseTimeMs).toBe(3000);
      });
    });

    describe('getAllPerformanceMetrics', () => {
      it('should return empty object when no metrics recorded', () => {
        const allMetrics = manager.getAllPerformanceMetrics();
        expect(Object.keys(allMetrics)).toHaveLength(0);
      });

      it('should return all recorded metrics', () => {
        manager.recordPerformance('scoring', 3000, true);
        manager.recordPerformance('sentiment', 2000, true);

        const allMetrics = manager.getAllPerformanceMetrics();
        expect(Object.keys(allMetrics)).toHaveLength(2);
        expect(allMetrics.scoring).toBeDefined();
        expect(allMetrics.sentiment).toBeDefined();
      });
    });

    describe('resetPerformanceMetrics', () => {
      it('should clear all performance metrics', () => {
        manager.recordPerformance('scoring', 3000, true);
        manager.recordPerformance('sentiment', 2000, true);

        expect(Object.keys(manager.getAllPerformanceMetrics())).toHaveLength(2);

        manager.resetPerformanceMetrics();

        expect(Object.keys(manager.getAllPerformanceMetrics())).toHaveLength(0);
      });

      it('should clear adapted timeouts', () => {
        // Record enough samples to create adapted timeout
        for (let i = 0; i < 15; i++) {
          manager.recordPerformance('scoring', 6000, true);
        }

        manager.resetPerformanceMetrics();

        // Timeout should revert to default
        const config = manager.getTimeoutConfig('scoring');
        expect(config.timeoutMs).toBe(5000);
      });
    });

    describe('getConfig', () => {
      it('should return current configuration', () => {
        const config = manager.getConfig();
        expect(config.globalMultiplier).toBe(1.0);
        expect(config.enableAdaptive).toBe(true);
      });

      it('should return a copy of config', () => {
        const config1 = manager.getConfig();
        config1.globalMultiplier = 5.0; // Modify copy

        const config2 = manager.getConfig();
        expect(config2.globalMultiplier).toBe(1.0); // Should remain unchanged
      });
    });

    describe('updateConfig', () => {
      it('should update configuration', () => {
        manager.updateConfig({ globalMultiplier: 2.0 });

        const config = manager.getConfig();
        expect(config.globalMultiplier).toBe(2.0);
      });

      it('should merge with existing config', () => {
        manager.updateConfig({ globalMultiplier: 2.0 });
        manager.updateConfig({ enableAdaptive: false });

        const config = manager.getConfig();
        expect(config.globalMultiplier).toBe(2.0);
        expect(config.enableAdaptive).toBe(false);
      });

      it('should validate updated config', () => {
        expect(() => {
          manager.updateConfig({ globalMultiplier: 50.0 }); // Above max
        }).toThrow();
      });

      it('should preserve other config when updating', () => {
        const customManager = new AdaptiveTimeoutManager({
          minTimeoutMs: 5000,
          maxTimeoutMs: 100000,
        });

        customManager.updateConfig({ globalMultiplier: 1.5 });

        const config = customManager.getConfig();
        expect(config.minTimeoutMs).toBe(5000);
        expect(config.maxTimeoutMs).toBe(100000);
        expect(config.globalMultiplier).toBe(1.5);
      });
    });

    describe('edge cases', () => {
      it('should handle very fast responses', () => {
        manager.recordPerformance('scoring', 100, true);

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics?.avgResponseTimeMs).toBe(100);
      });

      it('should handle very slow responses', () => {
        manager.recordPerformance('batch', 90000, true);

        const metrics = manager.getPerformanceMetrics('batch');
        expect(metrics?.avgResponseTimeMs).toBe(90000);
      });

      it('should handle zero success rate', () => {
        for (let i = 0; i < 15; i++) {
          manager.recordPerformance('embedding', 5000, false);
        }

        const metrics = manager.getPerformanceMetrics('embedding');
        expect(metrics?.successRate).toBe(0);
      });

      it('should handle mixed success/failure patterns', () => {
        const pattern = [true, true, false, true, false, false, true];
        for (let i = 0; i < 20; i++) {
          manager.recordPerformance('scoring', 3000, pattern[i % pattern.length]);
        }

        const metrics = manager.getPerformanceMetrics('scoring');
        expect(metrics?.successRate).toBeGreaterThan(0);
        expect(metrics?.successRate).toBeLessThan(1);
      });
    });
  });

  describe('createAdaptiveTimeoutManager', () => {
    it('should create a new manager instance', () => {
      const manager = createAdaptiveTimeoutManager();
      expect(manager).toBeInstanceOf(AdaptiveTimeoutManager);
    });

    it('should accept configuration', () => {
      const manager = createAdaptiveTimeoutManager({
        globalMultiplier: 2.0,
        enableAdaptive: false,
      });

      const config = manager.getConfig();
      expect(config.globalMultiplier).toBe(2.0);
      expect(config.enableAdaptive).toBe(false);
    });

    it('should create independent instances', () => {
      const manager1 = createAdaptiveTimeoutManager({ globalMultiplier: 1.5 });
      const manager2 = createAdaptiveTimeoutManager({ globalMultiplier: 2.5 });

      expect(manager1.getConfig().globalMultiplier).toBe(1.5);
      expect(manager2.getConfig().globalMultiplier).toBe(2.5);
    });
  });

  describe('adaptiveTimeout singleton', () => {
    it('should be an instance of AdaptiveTimeoutManager', () => {
      expect(adaptiveTimeout).toBeInstanceOf(AdaptiveTimeoutManager);
    });

    it('should have default configuration', () => {
      const config = adaptiveTimeout.getConfig();
      expect(config.globalMultiplier).toBe(1.0);
      expect(config.enableAdaptive).toBe(true);
    });

    it('should be usable for timeout operations', () => {
      const timeout = adaptiveTimeout.getTimeout('scoring');
      expect(timeout).toBe(5000);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete adaptive workflow', async () => {
      vi.useFakeTimers();

      const manager = new AdaptiveTimeoutManager();

      // Initial execution
      const fn1 = vi.fn().mockResolvedValue('result1');
      const promise1 = manager.executeWithTimeout('scoring', fn1);
      await vi.advanceTimersByTimeAsync(100);
      const result1 = await promise1;

      expect(result1.usedFallback).toBe(false);

      // Record multiple successful operations
      for (let i = 0; i < 15; i++) {
        manager.recordPerformance('scoring', 4000, true);
      }

      // Check that adaptation occurred
      const metrics = manager.getPerformanceMetrics('scoring');
      expect(metrics?.sampleCount).toBeGreaterThanOrEqual(15);

      vi.useRealTimers();
    });

    it('should handle fallback chain', async () => {
      vi.useFakeTimers();

      const manager = new AdaptiveTimeoutManager();

      const primaryFn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('primary'), 10000);
          })
      );
      const fallbackFn = vi.fn().mockResolvedValue('fallback');

      const promise = manager.executeWithTimeout(
        'scoring',
        primaryFn,
        fallbackFn
      );

      await vi.advanceTimersByTimeAsync(6000);
      const result = await promise;

      expect(result.usedFallback).toBe(true);
      expect(result.result).toBe('fallback');
      expect(primaryFn).toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should adapt timeouts based on real performance', () => {
      const manager = new AdaptiveTimeoutManager();

      // Simulate consistently slow responses
      for (let i = 0; i < 15; i++) {
        manager.recordPerformance('reply_generation', 8000, true);
      }

      const config = manager.getTimeoutConfig('reply_generation');
      // Should have adapted to slower performance
      expect(config.timeoutMs).toBeGreaterThanOrEqual(10000);
    });

    it('should respect safety bounds during adaptation', () => {
      const manager = new AdaptiveTimeoutManager({
        minTimeoutMs: 5000,
        maxTimeoutMs: 30000,
      });

      // Record very fast responses
      for (let i = 0; i < 15; i++) {
        manager.recordPerformance('workflow', 1000, true);
      }

      const config1 = manager.getTimeoutConfig('workflow');
      expect(config1.timeoutMs).toBeGreaterThanOrEqual(5000); // Min bound

      // Record very slow responses
      for (let i = 0; i < 15; i++) {
        manager.recordPerformance('batch', 200000, true);
      }

      const config2 = manager.getTimeoutConfig('batch');
      expect(config2.timeoutMs).toBeLessThanOrEqual(30000); // Max bound
    });
  });
});
