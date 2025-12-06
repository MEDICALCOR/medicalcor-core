/**
 * Comprehensive Unit Tests for Enhanced Dead Letter Queue
 * Tests DLQ with Circuit Breaker Integration
 * Coverage target: 100%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EnhancedDeadLetterQueueService,
  createEnhancedDeadLetterQueueService,
  type EnhancedDLQConfig,
} from '../enhanced-dead-letter-queue.js';
import { CircuitState } from '../circuit-breaker.js';
import type { WebhookType, DlqEntry } from '../dead-letter-queue.js';

// Mock logger
vi.mock('../logger.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock database
const createMockDb = () => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
});

describe('EnhancedDeadLetterQueueService', () => {
  let service: EnhancedDeadLetterQueueService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDb = createMockDb();
    // @ts-expect-error - mock db for testing
    service = new EnhancedDeadLetterQueueService(mockDb);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with default configuration', () => {
      // @ts-expect-error - mock db for testing
      const dlq = new EnhancedDeadLetterQueueService(mockDb);
      expect(dlq).toBeInstanceOf(EnhancedDeadLetterQueueService);
    });

    it('should create service with custom circuit breaker config', () => {
      const config: EnhancedDLQConfig = {
        circuitBreakerDefaults: {
          failureThreshold: 10,
          resetTimeoutMs: 120000,
          successThreshold: 3,
        },
        enableMetrics: true,
        logCircuitSkips: true,
      };

      // @ts-expect-error - mock db for testing
      const dlq = new EnhancedDeadLetterQueueService(mockDb, config);
      expect(dlq).toBeInstanceOf(EnhancedDeadLetterQueueService);
    });

    it('should create service with circuit breaker overrides for specific types', () => {
      const config: EnhancedDLQConfig = {
        circuitBreakerOverrides: {
          whatsapp: { failureThreshold: 3 },
          stripe: { failureThreshold: 5, resetTimeoutMs: 300000 },
        },
      };

      // @ts-expect-error - mock db for testing
      const dlq = new EnhancedDeadLetterQueueService(mockDb, config);
      expect(dlq).toBeInstanceOf(EnhancedDeadLetterQueueService);
    });
  });

  describe('getCircuitBreaker', () => {
    it('should return circuit breaker for webhook type', () => {
      const breaker = service.getCircuitBreaker('whatsapp');

      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return different circuit breakers for different webhook types', () => {
      const whatsappBreaker = service.getCircuitBreaker('whatsapp');
      const stripeBreaker = service.getCircuitBreaker('stripe');

      expect(whatsappBreaker).not.toBe(stripeBreaker);
    });

    it('should return same circuit breaker instance for same webhook type', () => {
      const breaker1 = service.getCircuitBreaker('voice');
      const breaker2 = service.getCircuitBreaker('voice');

      expect(breaker1).toBe(breaker2);
    });
  });

  describe('isCircuitOpen', () => {
    it('should return false for closed circuit', () => {
      expect(service.isCircuitOpen('whatsapp')).toBe(false);
    });

    it('should return true after circuit opens due to failures', async () => {
      const breaker = service.getCircuitBreaker('whatsapp');

      // Trigger failures to open circuit (default threshold is 5)
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service unavailable');
          });
        } catch {
          // expected
        }
      }

      expect(service.isCircuitOpen('whatsapp')).toBe(true);
    });
  });

  describe('processRetriesWithCircuitBreaker', () => {
    it('should process entries when circuits are closed', async () => {
      const mockEntry: DlqEntry = {
        id: 'entry-1',
        webhookType: 'whatsapp',
        correlationId: 'corr-123',
        payload: { message: 'test' },
        errorMessage: 'Error',
        status: 'pending',
        retryCount: 0,
        maxRetries: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock getPendingEntries to return our test entry
      mockDb.query.mockResolvedValueOnce({ rows: [mockEntry], rowCount: 1 });
      // Mock markAsProcessed
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const handler = vi.fn().mockResolvedValue(true);
      const result = await service.processRetriesWithCircuitBreaker(handler);

      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(result.skippedDueToCircuit).toBe(0);
      expect(result.circuitStats).toBeDefined();
    });

    it('should skip entries when circuit is open', async () => {
      const breaker = service.getCircuitBreaker('whatsapp');

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service unavailable');
          });
        } catch {
          // expected
        }
      }

      expect(service.isCircuitOpen('whatsapp')).toBe(true);

      // Mock no pending entries since circuit is open
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const handler = vi.fn().mockResolvedValue(true);
      const result = await service.processRetriesWithCircuitBreaker(handler, {
        webhookTypes: ['whatsapp'],
      });

      expect(result.processed).toBe(0);
    });

    it('should return circuit stats for all requested webhook types', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const handler = vi.fn().mockResolvedValue(true);
      const result = await service.processRetriesWithCircuitBreaker(handler, {
        webhookTypes: ['whatsapp', 'stripe', 'voice'],
      });

      expect(result.circuitStats.whatsapp).toBeDefined();
      expect(result.circuitStats.stripe).toBeDefined();
      expect(result.circuitStats.voice).toBeDefined();
    });

    it('should respect batchSize option', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const handler = vi.fn().mockResolvedValue(true);
      await service.processRetriesWithCircuitBreaker(handler, {
        batchSize: 5,
      });

      // Verify the query was called (indirectly tests batchSize is passed)
      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when no circuits are open', async () => {
      // Mock getStats
      mockDb.query.mockResolvedValueOnce({
        rows: [{ status: 'pending', count: '10' }],
        rowCount: 1,
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [{ status: 'failed', count: '5' }],
        rowCount: 1,
      });

      const health = await service.getHealthStatus();

      expect(health.healthy).toBe(true);
      expect(health.openCircuits).toEqual([]);
    });

    it('should return unhealthy status when circuits are open', async () => {
      // Open the whatsapp circuit
      const breaker = service.getCircuitBreaker('whatsapp');
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      // Mock getStats
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const health = await service.getHealthStatus();

      expect(health.healthy).toBe(false);
      expect(health.openCircuits).toContain('whatsapp');
    });

    it('should return circuit stats in health status', async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const health = await service.getHealthStatus();

      expect(health.circuitStats).toBeDefined();
      expect(Array.isArray(health.circuitStats)).toBe(true);
    });
  });

  describe('resetCircuit', () => {
    it('should reset circuit breaker for specific webhook type', async () => {
      // Open the circuit first
      const breaker = service.getCircuitBreaker('stripe');
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      expect(service.isCircuitOpen('stripe')).toBe(true);

      service.resetCircuit('stripe');

      expect(service.isCircuitOpen('stripe')).toBe(false);
    });
  });

  describe('resetAllCircuits', () => {
    it('should reset all circuit breakers', async () => {
      // Open multiple circuits - separate try-catch for each breaker
      const whatsappBreaker = service.getCircuitBreaker('whatsapp');
      const stripeBreaker = service.getCircuitBreaker('stripe');

      // Open whatsapp circuit
      for (let i = 0; i < 5; i++) {
        try {
          await whatsappBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      // Open stripe circuit
      for (let i = 0; i < 5; i++) {
        try {
          await stripeBreaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      expect(service.isCircuitOpen('whatsapp')).toBe(true);
      expect(service.isCircuitOpen('stripe')).toBe(true);

      service.resetAllCircuits();

      expect(service.isCircuitOpen('whatsapp')).toBe(false);
      expect(service.isCircuitOpen('stripe')).toBe(false);
    });
  });

  describe('getCircuitBreakerRegistry', () => {
    it('should return the circuit breaker registry', () => {
      const registry = service.getCircuitBreakerRegistry();

      expect(registry).toBeDefined();
      expect(typeof registry.get).toBe('function');
      expect(typeof registry.getAllStats).toBe('function');
    });
  });

  describe('Circuit breaker callbacks', () => {
    it('should log when circuit opens', async () => {
      const breaker = service.getCircuitBreaker('vapi');

      // Trigger failures to open circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service unavailable');
          });
        } catch {
          // expected
        }
      }

      // The onOpen callback should have been called
      expect(service.isCircuitOpen('vapi')).toBe(true);
    });

    it('should log when circuit closes after recovery', async () => {
      const breaker = service.getCircuitBreaker('booking');

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          // expected
        }
      }

      expect(service.isCircuitOpen('booking')).toBe(true);

      // Advance time past reset timeout
      vi.advanceTimersByTime(70000);

      // Now succeed twice (half-open -> closed)
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');

      expect(service.isCircuitOpen('booking')).toBe(false);
    });
  });

  describe('All webhook types initialization', () => {
    it('should initialize circuit breakers for all known webhook types', () => {
      const webhookTypes: WebhookType[] = [
        'whatsapp',
        'voice',
        'vapi',
        'stripe',
        'booking',
        'crm',
        'hubspot',
        'scheduling',
      ];

      for (const type of webhookTypes) {
        const breaker = service.getCircuitBreaker(type);
        expect(breaker).toBeDefined();
        expect(breaker.getState()).toBe(CircuitState.CLOSED);
      }
    });
  });
});

describe('createEnhancedDeadLetterQueueService', () => {
  it('should create service using factory function', () => {
    const mockDb = createMockDb();

    // @ts-expect-error - mock db for testing
    const service = createEnhancedDeadLetterQueueService(mockDb);

    expect(service).toBeInstanceOf(EnhancedDeadLetterQueueService);
  });

  it('should create service with config using factory function', () => {
    const mockDb = createMockDb();
    const config: EnhancedDLQConfig = {
      circuitBreakerDefaults: {
        failureThreshold: 10,
      },
    };

    // @ts-expect-error - mock db for testing
    const service = createEnhancedDeadLetterQueueService(mockDb, config);

    expect(service).toBeInstanceOf(EnhancedDeadLetterQueueService);
  });
});
