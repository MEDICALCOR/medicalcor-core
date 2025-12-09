/**
 * @fileoverview Tests for CRM Health Check Service
 *
 * Tests the CRM health monitoring functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CrmHealthCheckService,
  CrmHealthCheckError,
  hasCrmHealthCheck,
  createCrmHealthCheckService,
  createCrmHealthChecker,
  quickCrmHealthCheck,
  formatCrmHealthResult,
  CrmHealthConfigSchema,
  type CrmHealthResult,
  type CrmWithHealthCheck,
} from '../crm-health.js';

describe('CrmHealthCheckService', () => {
  let service: CrmHealthCheckService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
    service = new CrmHealthCheckService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('CrmHealthConfigSchema', () => {
    it('should parse valid config', () => {
      const config = CrmHealthConfigSchema.parse({
        timeoutMs: 3000,
        degradedThresholdMs: 1500,
        unhealthyThresholdMs: 4000,
        verbose: true,
        providerName: 'pipedrive',
        critical: true,
      });

      expect(config.timeoutMs).toBe(3000);
      expect(config.providerName).toBe('pipedrive');
      expect(config.critical).toBe(true);
    });

    it('should apply defaults for missing fields', () => {
      const config = CrmHealthConfigSchema.parse({});

      expect(config.timeoutMs).toBe(5000);
      expect(config.degradedThresholdMs).toBe(2000);
      expect(config.providerName).toBe('crm');
      expect(config.verbose).toBe(false);
    });

    it('should reject invalid timeoutMs', () => {
      expect(() => CrmHealthConfigSchema.parse({ timeoutMs: 50 })).toThrow();
      expect(() => CrmHealthConfigSchema.parse({ timeoutMs: 31000 })).toThrow();
    });
  });

  describe('hasCrmHealthCheck', () => {
    it('should return true for valid CRM provider', () => {
      const mockProvider = {
        sourceName: 'test-crm',
        checkHealth: vi.fn(),
      };

      expect(hasCrmHealthCheck(mockProvider)).toBe(true);
    });

    it('should return false for null', () => {
      expect(hasCrmHealthCheck(null)).toBe(false);
    });

    it('should return false for provider without sourceName', () => {
      expect(hasCrmHealthCheck({ checkHealth: vi.fn() })).toBe(false);
    });

    it('should return false for provider without checkHealth', () => {
      expect(hasCrmHealthCheck({ sourceName: 'test' })).toBe(false);
    });

    it('should return false for provider with non-function checkHealth', () => {
      expect(hasCrmHealthCheck({ sourceName: 'test', checkHealth: 'not-function' })).toBe(false);
    });
  });

  describe('check', () => {
    it('should return unhealthy when provider is null', async () => {
      const result = await service.check(null);

      expect(result.status).toBe('unhealthy');
      expect(result.details.configured).toBe(false);
      expect(result.details.error?.code).toBe('CRM_NOT_CONFIGURED');
    });

    it('should return unhealthy when provider is undefined', async () => {
      const result = await service.check(undefined);

      expect(result.status).toBe('unhealthy');
      expect(result.details.error?.message).toContain('not configured');
    });

    it('should return healthy for provider without health check support', async () => {
      const mockProvider = { sourceName: 'simple-crm' };

      const result = await service.check(mockProvider);

      expect(result.status).toBe('healthy');
      expect(result.details.configured).toBe(true);
    });

    it('should execute health check for compliant provider', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockResolvedValue({
          status: 'healthy',
          latencyMs: 50,
          details: {
            connectionStatus: 'connected',
            apiVersion: 'v1.0',
            rateLimitRemaining: 100,
          },
        }),
      };

      const result = await service.check(mockProvider);

      expect(result.status).toBe('healthy');
      expect(result.provider).toBe('test-crm');
      expect(result.details.apiConnected).toBe(true);
      expect(result.details.apiVersion).toBe('v1.0');
    });

    it('should mark as degraded when latency exceeds threshold', async () => {
      const slowService = new CrmHealthCheckService({ degradedThresholdMs: 100 });
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'slow-crm',
        checkHealth: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return {
            status: 'healthy',
            latencyMs: 150,
            details: { connectionStatus: 'connected' },
          };
        }),
      };

      vi.useRealTimers();
      const result = await slowService.check(mockProvider);

      expect(result.status).toBe('degraded');
    });

    it('should handle health check timeout', async () => {
      const fastTimeoutService = new CrmHealthCheckService({ timeoutMs: 100 });
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'slow-crm',
        checkHealth: vi
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500))),
      };

      vi.useRealTimers();
      const result = await fastTimeoutService.check(mockProvider);

      expect(result.status).toBe('unhealthy');
      expect(result.details.error?.code).toBe('TIMEOUT');
    });

    it('should handle checkHealth rejection with Error', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'error-crm',
        checkHealth: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };

      const result = await service.check(mockProvider);

      expect(result.status).toBe('unhealthy');
      expect(result.details.apiConnected).toBe(false);
      expect(result.details.error?.message).toContain('Connection refused');
    });

    it('should handle checkHealth rejection with non-Error', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'error-crm',
        checkHealth: vi.fn().mockRejectedValue('String error'),
      };

      const result = await service.check(mockProvider);

      expect(result.status).toBe('unhealthy');
      expect(result.details.error?.code).toBe('UNKNOWN_ERROR');
    });

    it('should track consecutive failures', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'failing-crm',
        checkHealth: vi.fn().mockRejectedValue(new Error('Failed')),
      };

      await service.check(mockProvider);
      await service.check(mockProvider);
      await service.check(mockProvider);

      expect(service.getConsecutiveFailures()).toBe(3);
    });

    it('should reset consecutive failures on success', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi
          .fn()
          .mockRejectedValueOnce(new Error('Failed'))
          .mockResolvedValueOnce({
            status: 'healthy',
            latencyMs: 50,
            details: { connectionStatus: 'connected' },
          }),
      };

      await service.check(mockProvider);
      expect(service.getConsecutiveFailures()).toBe(1);

      await service.check(mockProvider);
      expect(service.getConsecutiveFailures()).toBe(0);
    });

    it('should store last result', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockResolvedValue({
          status: 'healthy',
          latencyMs: 50,
          details: { connectionStatus: 'connected' },
        }),
      };

      await service.check(mockProvider);
      const lastResult = service.getLastResult();

      expect(lastResult).toBeDefined();
      expect(lastResult?.provider).toBe('test-crm');
    });
  });

  describe('createChecker', () => {
    it('should return a HealthChecker function', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockResolvedValue({
          status: 'healthy',
          latencyMs: 50,
          message: 'All good',
          details: { connectionStatus: 'connected' },
        }),
      };

      const checker = service.createChecker(() => mockProvider);
      const result = await checker();

      expect(result.name).toBe('crm');
      expect(result.status).toBe('healthy');
      expect(result.message).toBe('All good');
      expect(result.latencyMs).toBeDefined();
    });

    it('should use configured provider name', async () => {
      const customService = new CrmHealthCheckService({ providerName: 'pipedrive' });
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockResolvedValue({
          status: 'healthy',
          latencyMs: 50,
          details: { connectionStatus: 'connected' },
        }),
      };

      const checker = customService.createChecker(() => mockProvider);
      const result = await checker();

      expect(result.name).toBe('pipedrive');
    });
  });

  describe('reset', () => {
    it('should reset lastResult and consecutiveFailures', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockRejectedValue(new Error('Failed')),
      };

      await service.check(mockProvider);
      expect(service.getLastResult()).toBeDefined();
      expect(service.getConsecutiveFailures()).toBe(1);

      service.reset();

      expect(service.getLastResult()).toBeUndefined();
      expect(service.getConsecutiveFailures()).toBe(0);
    });
  });

  describe('Error Parsing', () => {
    it('should detect timeout errors', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockRejectedValue(new Error('Request timeout exceeded')),
      };

      const result = await service.check(mockProvider);
      expect(result.details.error?.code).toBe('TIMEOUT');
    });

    it('should detect auth errors from 401', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockRejectedValue(new Error('401 Unauthorized')),
      };

      const result = await service.check(mockProvider);
      expect(result.details.error?.code).toBe('AUTH_ERROR');
      expect(result.details.authenticated).toBe(false);
    });

    it('should detect auth errors from 403', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockRejectedValue(new Error('403 Forbidden')),
      };

      const result = await service.check(mockProvider);
      expect(result.details.error?.code).toBe('AUTH_ERROR');
    });

    it('should detect rate limit errors', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockRejectedValue(new Error('429 Rate limit exceeded')),
      };

      const result = await service.check(mockProvider);
      expect(result.details.error?.code).toBe('RATE_LIMIT');
    });

    it('should detect network errors', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };

      const result = await service.check(mockProvider);
      expect(result.details.error?.code).toBe('NETWORK_ERROR');
    });

    it('should handle CrmHealthCheckError', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi
          .fn()
          .mockRejectedValue(new CrmHealthCheckError('Custom error', 'CUSTOM_CODE', true)),
      };

      const result = await service.check(mockProvider);
      expect(result.details.error?.code).toBe('CUSTOM_CODE');
      expect(result.details.error?.isRetryable).toBe(true);
    });
  });
});

describe('CrmHealthCheckError', () => {
  it('should create error with all properties', () => {
    const error = new CrmHealthCheckError('Test error', 'TEST_CODE', true, { extra: 'data' });

    expect(error.name).toBe('CrmHealthCheckError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.isRetryable).toBe(true);
    expect(error.details).toEqual({ extra: 'data' });
  });

  it('should create error without optional details', () => {
    const error = new CrmHealthCheckError('Test error', 'TEST_CODE', false);

    expect(error.details).toBeUndefined();
    expect(error.isRetryable).toBe(false);
  });
});

describe('Factory Functions', () => {
  describe('createCrmHealthCheckService', () => {
    it('should create service with default config', () => {
      const service = createCrmHealthCheckService();

      expect(service).toBeInstanceOf(CrmHealthCheckService);
    });

    it('should create service with custom config', () => {
      const service = createCrmHealthCheckService({ timeoutMs: 3000 });

      expect(service).toBeInstanceOf(CrmHealthCheckService);
    });
  });

  describe('createCrmHealthChecker', () => {
    it('should create health checker function', async () => {
      const mockProvider: CrmWithHealthCheck = {
        sourceName: 'test-crm',
        checkHealth: vi.fn().mockResolvedValue({
          status: 'healthy',
          latencyMs: 50,
          details: { connectionStatus: 'connected' },
        }),
      };

      const checker = createCrmHealthChecker(() => mockProvider, { providerName: 'test' });
      const result = await checker();

      expect(result.name).toBe('test');
      expect(result.status).toBe('healthy');
    });
  });
});

describe('quickCrmHealthCheck', () => {
  it('should return health status', async () => {
    const mockProvider: CrmWithHealthCheck = {
      sourceName: 'test-crm',
      checkHealth: vi.fn().mockResolvedValue({
        status: 'healthy',
        latencyMs: 50,
        details: { connectionStatus: 'connected' },
      }),
    };

    const status = await quickCrmHealthCheck(mockProvider);

    expect(status).toBe('healthy');
  });

  it('should return unhealthy for null provider', async () => {
    const status = await quickCrmHealthCheck(null);

    expect(status).toBe('unhealthy');
  });
});

describe('formatCrmHealthResult', () => {
  it('should format healthy result', () => {
    const result: CrmHealthResult = {
      status: 'healthy',
      provider: 'pipedrive',
      latencyMs: 100,
      details: {
        configured: true,
        apiConnected: true,
        authenticated: true,
      },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    };

    const formatted = formatCrmHealthResult(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('HEALTHY');
    expect(formatted).toContain('pipedrive');
    expect(formatted).toContain('100ms');
  });

  it('should format degraded result', () => {
    const result: CrmHealthResult = {
      status: 'degraded',
      provider: 'hubspot',
      latencyMs: 3000,
      message: 'High latency',
      details: {
        configured: true,
        apiConnected: true,
        authenticated: true,
      },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    };

    const formatted = formatCrmHealthResult(result);

    expect(formatted).toContain('⚠');
    expect(formatted).toContain('DEGRADED');
    expect(formatted).toContain('High latency');
  });

  it('should format unhealthy result with error', () => {
    const result: CrmHealthResult = {
      status: 'unhealthy',
      provider: 'salesforce',
      latencyMs: 5000,
      details: {
        configured: true,
        apiConnected: false,
        authenticated: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Invalid credentials',
          isRetryable: false,
        },
      },
      timestamp: new Date('2024-01-15T10:00:00Z'),
    };

    const formatted = formatCrmHealthResult(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('UNHEALTHY');
    expect(formatted).toContain('AUTH_ERROR');
    expect(formatted).toContain('Invalid credentials');
  });
});
