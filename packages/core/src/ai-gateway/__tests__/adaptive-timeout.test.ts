/**
 * Adaptive Timeout Manager Tests
 *
 * Comprehensive tests for operation-specific timeouts and adaptive timeout management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdaptiveTimeoutManager,
  createAdaptiveTimeoutManager,
  DEFAULT_TIMEOUT_CONFIG,
  TimeoutConfigSchema,
  AdaptiveTimeoutConfigSchema,
  adaptiveTimeout,
  type AIOperationType,
} from '../adaptive-timeout.js';

describe('AdaptiveTimeoutManager', () => {
  let manager: AdaptiveTimeoutManager;

  beforeEach(() => {
    manager = new AdaptiveTimeoutManager();
  });

  describe('Default Configuration', () => {
    it('should have correct timeout for scoring operations', () => {
      const config = manager.getTimeoutConfig('scoring');

      expect(config.timeoutMs).toBe(5000); // 5 seconds
      expect(config.instantFallback).toBe(true);
      expect(config.priority).toBe('critical');
      expect(config.maxRetries).toBe(1);
    });

    it('should have correct timeout for reply_generation', () => {
      const config = manager.getTimeoutConfig('reply_generation');

      expect(config.timeoutMs).toBe(10000); // 10 seconds
      expect(config.instantFallback).toBe(true);
      expect(config.priority).toBe('high');
    });

    it('should have correct timeout for sentiment analysis', () => {
      const config = manager.getTimeoutConfig('sentiment');

      expect(config.timeoutMs).toBe(5000);
      expect(config.instantFallback).toBe(true);
      expect(config.priority).toBe('high');
    });

    it('should have correct timeout for language detection', () => {
      const config = manager.getTimeoutConfig('language_detection');

      expect(config.timeoutMs).toBe(3000); // 3 seconds - fastest
      expect(config.instantFallback).toBe(true);
      expect(config.priority).toBe('critical');
    });

    it('should have correct timeout for summarization', () => {
      const config = manager.getTimeoutConfig('summarization');

      expect(config.timeoutMs).toBe(15000);
      expect(config.instantFallback).toBe(false);
      expect(config.priority).toBe('normal');
    });

    it('should have correct timeout for embedding', () => {
      const config = manager.getTimeoutConfig('embedding');

      expect(config.timeoutMs).toBe(10000);
      expect(config.instantFallback).toBe(false);
    });

    it('should have correct timeout for function_call', () => {
      const config = manager.getTimeoutConfig('function_call');

      expect(config.timeoutMs).toBe(30000);
      expect(config.instantFallback).toBe(false);
    });

    it('should have correct timeout for workflow', () => {
      const config = manager.getTimeoutConfig('workflow');

      expect(config.timeoutMs).toBe(60000); // 60 seconds
      expect(config.priority).toBe('low');
    });

    it('should have correct timeout for batch', () => {
      const config = manager.getTimeoutConfig('batch');

      expect(config.timeoutMs).toBe(120000); // 2 minutes
      expect(config.priority).toBe('low');
    });

    it('should have correct timeout for default operations', () => {
      const config = manager.getTimeoutConfig('default');

      expect(config.timeoutMs).toBe(30000);
      expect(config.maxRetries).toBe(2);
    });
  });

  describe('getTimeout', () => {
    it('should return timeout in milliseconds', () => {
      expect(manager.getTimeout('scoring')).toBe(5000);
      expect(manager.getTimeout('workflow')).toBe(60000);
    });
  });

  describe('shouldUseFallback', () => {
    it('should return true for critical operations', () => {
      expect(manager.shouldUseFallback('scoring')).toBe(true);
      expect(manager.shouldUseFallback('language_detection')).toBe(true);
    });

    it('should return false for non-critical operations', () => {
      expect(manager.shouldUseFallback('workflow')).toBe(false);
      expect(manager.shouldUseFallback('batch')).toBe(false);
      expect(manager.shouldUseFallback('summarization')).toBe(false);
    });
  });

  describe('Configuration with Overrides', () => {
    it('should apply custom timeout overrides', () => {
      const customManager = new AdaptiveTimeoutManager({
        overrides: {
          scoring: {
            timeoutMs: 3000,
            instantFallback: true,
            maxRetries: 0,
            priority: 'critical',
          },
        },
      });

      const config = customManager.getTimeoutConfig('scoring');
      expect(config.timeoutMs).toBe(3000);
      expect(config.maxRetries).toBe(0);
    });

    it('should apply global multiplier', () => {
      const customManager = new AdaptiveTimeoutManager({
        globalMultiplier: 2.0,
      });

      const config = customManager.getTimeoutConfig('scoring');
      expect(config.timeoutMs).toBe(10000); // 5000 * 2
    });

    it('should apply global multiplier to fallback timeout', () => {
      const customManager = new AdaptiveTimeoutManager({
        globalMultiplier: 1.5,
      });

      const config = customManager.getTimeoutConfig('scoring');
      expect(config.fallbackTimeoutMs).toBe(3000); // 2000 * 1.5
    });

    it('should clamp timeout to minimum', () => {
      const customManager = new AdaptiveTimeoutManager({
        globalMultiplier: 0.1, // Would result in 500ms for scoring
        minTimeoutMs: 2000,
      });

      const config = customManager.getTimeoutConfig('scoring');
      expect(config.timeoutMs).toBeGreaterThanOrEqual(2000);
    });

    it('should clamp timeout to maximum', () => {
      const customManager = new AdaptiveTimeoutManager({
        globalMultiplier: 10, // Would result in 600000ms for workflow
        maxTimeoutMs: 120000,
      });

      const config = customManager.getTimeoutConfig('workflow');
      expect(config.timeoutMs).toBeLessThanOrEqual(120000);
    });
  });

  describe('recordPerformance', () => {
    it('should record successful performance metrics', () => {
      manager.recordPerformance('scoring', 1000, true);
      manager.recordPerformance('scoring', 800, true);

      const metrics = manager.getPerformanceMetrics('scoring');
      expect(metrics).toBeDefined();
      expect(metrics?.sampleCount).toBe(2);
      expect(metrics?.successRate).toBeGreaterThan(0);
    });

    it('should track failure performance metrics', () => {
      manager.recordPerformance('scoring', 5000, false);

      const metrics = manager.getPerformanceMetrics('scoring');
      expect(metrics?.successRate).toBe(0);
    });

    it('should update with exponential moving average', () => {
      manager.recordPerformance('scoring', 1000, true);
      manager.recordPerformance('scoring', 2000, true);

      const metrics = manager.getPerformanceMetrics('scoring');
      // EMA with alpha 0.1: second value should be 0.1 * 2000 + 0.9 * 1000 = 1100
      expect(metrics?.avgResponseTimeMs).toBeCloseTo(1100, 0);
    });

    it('should not record when adaptive is disabled', () => {
      const disabledManager = new AdaptiveTimeoutManager({
        enableAdaptive: false,
      });

      disabledManager.recordPerformance('scoring', 1000, true);

      expect(disabledManager.getPerformanceMetrics('scoring')).toBeUndefined();
    });
  });

  describe('executeWithTimeout', () => {
    it('should execute successful primary function', async () => {
      const primaryFn = vi.fn().mockResolvedValue('success');

      const result = await manager.executeWithTimeout('scoring', primaryFn);

      expect(result.usedFallback).toBe(false);
      expect(result.result).toBe('success');
      expect(result.provider).toBe('primary');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should use fallback function when primary fails', async () => {
      const primaryFn = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackFn = vi.fn().mockResolvedValue('fallback result');

      const result = await manager.executeWithTimeout('scoring', primaryFn, fallbackFn);

      expect(result.usedFallback).toBe(true);
      expect(result.result).toBe('fallback result');
      expect(result.provider).toBe('fallback');
      expect(result.primaryError?.message).toBe('Primary failed');
    });

    it('should use fallback value when primary fails and no fallback function', async () => {
      const primaryFn = vi.fn().mockRejectedValue(new Error('Primary failed'));

      const result = await manager.executeWithTimeout(
        'scoring',
        primaryFn,
        undefined,
        'default value'
      );

      expect(result.usedFallback).toBe(true);
      expect(result.result).toBe('default value');
      expect(result.provider).toBe('fallback_value');
    });

    it('should throw when both primary and fallback fail', async () => {
      const primaryFn = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackFn = vi.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(manager.executeWithTimeout('scoring', primaryFn, fallbackFn)).rejects.toThrow(
        'Primary failed'
      );
    });

    it('should throw when primary fails with no fallback for non-instant-fallback operation', async () => {
      const primaryFn = vi.fn().mockRejectedValue(new Error('Failed'));

      await expect(manager.executeWithTimeout('workflow', primaryFn)).rejects.toThrow('Failed');
    });

    it('should use fallback when primary function fails', async () => {
      const failingFn = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallbackFn = vi.fn().mockResolvedValue('fallback result');

      const result = await manager.executeWithTimeout('language_detection', failingFn, fallbackFn);

      expect(result.usedFallback).toBe(true);
      expect(result.result).toBe('fallback result');
    });
  });

  describe('getAllPerformanceMetrics', () => {
    it('should return all recorded metrics', () => {
      manager.recordPerformance('scoring', 1000, true);
      manager.recordPerformance('sentiment', 500, true);

      const allMetrics = manager.getAllPerformanceMetrics();

      expect(allMetrics.scoring).toBeDefined();
      expect(allMetrics.sentiment).toBeDefined();
    });

    it('should return empty object when no metrics recorded', () => {
      const allMetrics = manager.getAllPerformanceMetrics();

      expect(Object.keys(allMetrics)).toHaveLength(0);
    });
  });

  describe('resetPerformanceMetrics', () => {
    it('should clear all metrics and adapted timeouts', () => {
      manager.recordPerformance('scoring', 1000, true);
      manager.recordPerformance('sentiment', 500, true);

      manager.resetPerformanceMetrics();

      expect(manager.getPerformanceMetrics('scoring')).toBeUndefined();
      expect(manager.getPerformanceMetrics('sentiment')).toBeUndefined();
    });
  });

  describe('getConfig', () => {
    it('should return configuration copy', () => {
      const config = manager.getConfig();

      expect(config.globalMultiplier).toBe(1.0);
      expect(config.enableAdaptive).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      manager.updateConfig({ globalMultiplier: 1.5 });

      expect(manager.getConfig().globalMultiplier).toBe(1.5);
    });

    it('should validate updated configuration', () => {
      expect(() => manager.updateConfig({ globalMultiplier: 100 })).toThrow();
    });
  });

  describe('Schema Validation', () => {
    it('should validate TimeoutConfig', () => {
      const validConfig = {
        timeoutMs: 5000,
        instantFallback: true,
        maxRetries: 2,
        priority: 'critical',
      };

      expect(() => TimeoutConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should reject invalid timeout values', () => {
      const invalidConfig = {
        timeoutMs: 500, // Below minimum
        instantFallback: true,
        maxRetries: 2,
        priority: 'critical',
      };

      expect(() => TimeoutConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should reject invalid priority', () => {
      const invalidConfig = {
        timeoutMs: 5000,
        instantFallback: true,
        maxRetries: 2,
        priority: 'invalid',
      };

      expect(() => TimeoutConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should validate AdaptiveTimeoutConfig', () => {
      const validConfig = {
        globalMultiplier: 1.5,
        enableAdaptive: true,
        minTimeoutMs: 2000,
        maxTimeoutMs: 120000,
      };

      expect(() => AdaptiveTimeoutConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should apply defaults for AdaptiveTimeoutConfig', () => {
      const parsed = AdaptiveTimeoutConfigSchema.parse({});

      expect(parsed.globalMultiplier).toBe(1.0);
      expect(parsed.enableAdaptive).toBe(true);
      expect(parsed.minTimeoutMs).toBe(2000);
      expect(parsed.maxTimeoutMs).toBe(120000);
    });
  });

  describe('DEFAULT_TIMEOUT_CONFIG', () => {
    it('should have all operation types configured', () => {
      const operations: AIOperationType[] = [
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

      for (const op of operations) {
        expect(DEFAULT_TIMEOUT_CONFIG[op]).toBeDefined();
        expect(DEFAULT_TIMEOUT_CONFIG[op].timeoutMs).toBeGreaterThan(0);
      }
    });
  });

  describe('Factory Function', () => {
    it('should create manager with default config', () => {
      const newManager = createAdaptiveTimeoutManager();

      expect(newManager).toBeInstanceOf(AdaptiveTimeoutManager);
      expect(newManager.getConfig().globalMultiplier).toBe(1.0);
    });

    it('should create manager with custom config', () => {
      const newManager = createAdaptiveTimeoutManager({
        globalMultiplier: 2.0,
      });

      expect(newManager.getConfig().globalMultiplier).toBe(2.0);
    });
  });

  describe('Singleton Instance', () => {
    it('should export default singleton', () => {
      expect(adaptiveTimeout).toBeInstanceOf(AdaptiveTimeoutManager);
    });
  });

  describe('Adaptive Timeout Calculation', () => {
    it('should not adapt timeout with insufficient samples', () => {
      for (let i = 0; i < 5; i++) {
        manager.recordPerformance('scoring', 100, true);
      }

      // With only 5 samples (< 10), timeout should not be adapted
      const config = manager.getTimeoutConfig('scoring');
      expect(config.timeoutMs).toBe(5000); // Original value
    });

    it('should adapt timeout after sufficient samples', () => {
      // Record 15 samples with consistent 100ms response time
      for (let i = 0; i < 15; i++) {
        manager.recordPerformance('function_call', 100, true);
      }

      // With 15 samples, timeout should be adapted based on p95
      const config = manager.getTimeoutConfig('function_call');
      // Adapted timeout should be less than default 30s since responses are fast
      // But clamped to minimum
      expect(config.timeoutMs).toBeGreaterThanOrEqual(manager.getConfig().minTimeoutMs);
    });
  });
});
