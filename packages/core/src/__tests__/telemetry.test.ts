/**
 * Comprehensive Unit Tests for Telemetry Module
 * Tests OpenTelemetry tracing configuration and span utilities
 * Coverage target: 100%
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock OpenTelemetry dependencies
const mockSpan = {
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

const mockTracer = {
  startSpan: vi.fn().mockReturnValue(mockSpan),
};

const mockContext = {
  active: vi.fn().mockReturnValue({}),
  with: vi.fn((ctx, fn) => fn()),
};

const mockTrace = {
  getTracer: vi.fn().mockReturnValue(mockTracer),
  getActiveSpan: vi.fn(),
  setSpan: vi.fn().mockReturnValue({}),
};

const mockNodeSDK = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@opentelemetry/api', () => ({
  trace: mockTrace,
  context: mockContext,
  SpanStatusCode: { OK: 0, ERROR: 2 },
  SpanKind: { CLIENT: 2, SERVER: 1, INTERNAL: 3 },
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: mockNodeSDK,
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn().mockReturnValue({}),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  SEMRESATTRS_SERVICE_NAME: 'service.name',
  SEMRESATTRS_SERVICE_VERSION: 'service.version',
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock('@opentelemetry/sdk-trace-base', () => ({
  ConsoleSpanExporter: vi.fn(),
}));

// Mock logger
vi.mock('../logger/index.js', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Telemetry Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTracer', () => {
    it('should return a tracer with the specified name', async () => {
      const { getTracer } = await import('../telemetry.js');

      const tracer = getTracer('test-service');

      expect(mockTrace.getTracer).toHaveBeenCalledWith('test-service', '0.1.0');
      expect(tracer).toBe(mockTracer);
    });

    it('should return a tracer with custom version', async () => {
      const { getTracer } = await import('../telemetry.js');

      getTracer('test-service', '1.0.0');

      expect(mockTrace.getTracer).toHaveBeenCalledWith('test-service', '1.0.0');
    });
  });

  describe('SpanAttributes', () => {
    it('should export correct span attribute constants', async () => {
      const { SpanAttributes } = await import('../telemetry.js');

      expect(SpanAttributes.LEAD_PHONE).toBe('medicalcor.lead.phone');
      expect(SpanAttributes.LEAD_CLASSIFICATION).toBe('medicalcor.lead.classification');
      expect(SpanAttributes.LEAD_SCORE).toBe('medicalcor.lead.score');
      expect(SpanAttributes.LEAD_CHANNEL).toBe('medicalcor.lead.channel');
      expect(SpanAttributes.HUBSPOT_CONTACT_ID).toBe('medicalcor.hubspot.contact_id');
      expect(SpanAttributes.HUBSPOT_OPERATION).toBe('medicalcor.hubspot.operation');
      expect(SpanAttributes.WHATSAPP_MESSAGE_ID).toBe('medicalcor.whatsapp.message_id');
      expect(SpanAttributes.WHATSAPP_TEMPLATE).toBe('medicalcor.whatsapp.template');
      expect(SpanAttributes.WHATSAPP_PHONE_NUMBER_ID).toBe('medicalcor.whatsapp.phone_number_id');
      expect(SpanAttributes.WORKFLOW_ID).toBe('medicalcor.workflow.id');
      expect(SpanAttributes.WORKFLOW_TASK_ID).toBe('medicalcor.workflow.task_id');
      expect(SpanAttributes.WORKFLOW_STATUS).toBe('medicalcor.workflow.status');
      expect(SpanAttributes.CORRELATION_ID).toBe('medicalcor.correlation_id');
    });
  });

  describe('createSpan', () => {
    it('should create a span with the given name', async () => {
      const { createSpan, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      const span = createSpan(tracer, 'test-span');

      expect(mockTracer.startSpan).toHaveBeenCalledWith('test-span', {});
      expect(span).toBe(mockSpan);
    });

    it('should add correlation ID attribute when provided', async () => {
      const { createSpan, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      createSpan(tracer, 'test-span', { correlationId: 'corr-123' });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('medicalcor.correlation_id', 'corr-123');
    });

    it('should not add correlation ID attribute when not provided', async () => {
      const { createSpan, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      createSpan(tracer, 'test-span');

      expect(mockSpan.setAttribute).not.toHaveBeenCalled();
    });

    it('should pass span options to startSpan', async () => {
      const { createSpan, getTracer, SpanKind } = await import('../telemetry.js');
      const tracer = getTracer('test');

      createSpan(tracer, 'test-span', { kind: SpanKind.CLIENT });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'test-span',
        expect.objectContaining({ kind: SpanKind.CLIENT })
      );
    });
  });

  describe('withSpan', () => {
    it('should execute function within span context', async () => {
      const { withSpan, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      const result = await withSpan(tracer, 'test-span', async () => 'result');

      expect(result).toBe('result');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle errors and set error status', async () => {
      const { withSpan, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      const testError = new Error('Test error');

      await expect(
        withSpan(tracer, 'test-span', async () => {
          throw testError;
        })
      ).rejects.toThrow('Test error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'Test error',
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      const { withSpan, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      await expect(
        withSpan(tracer, 'test-span', async () => {
          throw 'string error';
        })
      ).rejects.toBe('string error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'Unknown error',
      });
      expect(mockSpan.recordException).toHaveBeenCalled();
    });

    it('should pass span to the function', async () => {
      const { withSpan, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      let receivedSpan = null;
      await withSpan(tracer, 'test-span', async (span) => {
        receivedSpan = span;
        return 'done';
      });

      expect(receivedSpan).toBe(mockSpan);
    });
  });

  describe('withSpanSync', () => {
    it('should execute sync function within span context', async () => {
      const { withSpanSync, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      const result = withSpanSync(tracer, 'test-span', () => 'sync-result');

      expect(result).toBe('sync-result');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle sync errors and set error status', async () => {
      const { withSpanSync, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      const testError = new Error('Sync error');

      expect(() =>
        withSpanSync(tracer, 'test-span', () => {
          throw testError;
        })
      ).toThrow('Sync error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'Sync error',
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(testError);
    });

    it('should handle non-Error sync exceptions', async () => {
      const { withSpanSync, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      expect(() =>
        withSpanSync(tracer, 'test-span', () => {
          throw 'string error';
        })
      ).toThrow('string error');

      expect(mockSpan.recordException).toHaveBeenCalled();
    });
  });

  describe('getCurrentSpan', () => {
    it('should return active span when available', async () => {
      const { getCurrentSpan } = await import('../telemetry.js');
      mockTrace.getActiveSpan.mockReturnValue(mockSpan);

      const span = getCurrentSpan();

      expect(span).toBe(mockSpan);
    });

    it('should return undefined when no active span', async () => {
      const { getCurrentSpan } = await import('../telemetry.js');
      mockTrace.getActiveSpan.mockReturnValue(undefined);

      const span = getCurrentSpan();

      expect(span).toBeUndefined();
    });
  });

  describe('getCurrentContext', () => {
    it('should return active context', async () => {
      const { getCurrentContext } = await import('../telemetry.js');
      const mockActiveContext = { contextKey: 'value' };
      mockContext.active.mockReturnValue(mockActiveContext);

      const ctx = getCurrentContext();

      expect(ctx).toBe(mockActiveContext);
    });
  });

  describe('addSpanAttributes', () => {
    it('should add attributes to current span', async () => {
      const { addSpanAttributes } = await import('../telemetry.js');
      mockTrace.getActiveSpan.mockReturnValue(mockSpan);

      addSpanAttributes({ key1: 'value1', key2: 42, key3: true });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        key1: 'value1',
        key2: 42,
        key3: true,
      });
    });

    it('should not throw when no active span', async () => {
      const { addSpanAttributes } = await import('../telemetry.js');
      mockTrace.getActiveSpan.mockReturnValue(undefined);

      expect(() => addSpanAttributes({ key: 'value' })).not.toThrow();

      expect(mockSpan.setAttributes).not.toHaveBeenCalled();
    });
  });

  describe('recordException', () => {
    it('should record exception on current span', async () => {
      const { recordException } = await import('../telemetry.js');
      mockTrace.getActiveSpan.mockReturnValue(mockSpan);

      const error = new Error('Test exception');
      recordException(error);

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'Test exception',
      });
    });

    it('should add additional attributes when provided', async () => {
      const { recordException } = await import('../telemetry.js');
      mockTrace.getActiveSpan.mockReturnValue(mockSpan);

      const error = new Error('Test exception');
      recordException(error, { component: 'test', severity: 'high' });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        component: 'test',
        severity: 'high',
      });
    });

    it('should not throw when no active span', async () => {
      const { recordException } = await import('../telemetry.js');
      mockTrace.getActiveSpan.mockReturnValue(undefined);

      expect(() => recordException(new Error('Test'))).not.toThrow();
    });
  });

  describe('traceExternalCall', () => {
    it('should wrap function with tracing', async () => {
      const { traceExternalCall, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      const mockFn = vi.fn().mockResolvedValue('api-result');
      const tracedFn = traceExternalCall(tracer, 'hubspot', 'getContact', mockFn);

      const result = await tracedFn('arg1', 'arg2');

      expect(result).toBe('api-result');
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'hubspot.getContact',
        expect.objectContaining({ kind: 2 }) // SpanKind.CLIENT
      );
    });

    it('should set service attributes on span', async () => {
      const { traceExternalCall, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      const mockFn = vi.fn().mockResolvedValue('result');
      const tracedFn = traceExternalCall(tracer, 'whatsapp', 'sendMessage', mockFn);

      await tracedFn();

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('external.service', 'whatsapp');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('external.operation', 'sendMessage');
    });

    it('should propagate errors from wrapped function', async () => {
      const { traceExternalCall, getTracer } = await import('../telemetry.js');
      const tracer = getTracer('test');

      const error = new Error('API error');
      const mockFn = vi.fn().mockRejectedValue(error);
      const tracedFn = traceExternalCall(tracer, 'api', 'call', mockFn);

      await expect(tracedFn()).rejects.toThrow('API error');
    });
  });

  describe('Traced decorator', () => {
    it('should be a function that returns a decorator', async () => {
      const { Traced } = await import('../telemetry.js');

      expect(typeof Traced).toBe('function');

      // Traced() returns a decorator function
      const decorator = Traced();
      expect(typeof decorator).toBe('function');
    });

    it('should accept optional span name', async () => {
      const { Traced } = await import('../telemetry.js');

      // Should not throw when called with custom name
      const decoratorWithName = Traced('custom-span-name');
      expect(typeof decoratorWithName).toBe('function');
    });

    it('should modify method descriptor when applied manually', async () => {
      const { Traced } = await import('../telemetry.js');

      const originalFn = async function () {
        return 'original';
      };

      const mockDescriptor: PropertyDescriptor = {
        value: originalFn,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Traced('test-method');
      const result = decorator({}, 'testMethod', mockDescriptor);

      expect(result).toBeDefined();
      expect(result.value).toBeDefined();
      expect(typeof result.value).toBe('function');
      // The decorated method should be different from original
      expect(result.value).not.toBe(originalFn);
    });

    it('should execute original method through decorator', async () => {
      const { Traced } = await import('../telemetry.js');

      let wasCalled = false;
      const originalFn = async function () {
        wasCalled = true;
        return 'success';
      };

      const mockDescriptor: PropertyDescriptor = {
        value: originalFn,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Traced();
      const result = decorator({}, 'testMethod', mockDescriptor);

      // Call the decorated method
      const returnValue = await result.value();

      expect(wasCalled).toBe(true);
      expect(returnValue).toBe('success');
    });
  });

  describe('Re-exports', () => {
    it('should re-export SpanStatusCode', async () => {
      const { SpanStatusCode } = await import('../telemetry.js');

      expect(SpanStatusCode.OK).toBe(0);
      expect(SpanStatusCode.ERROR).toBe(2);
    });

    it('should re-export SpanKind', async () => {
      const { SpanKind } = await import('../telemetry.js');

      expect(SpanKind.CLIENT).toBe(2);
      expect(SpanKind.SERVER).toBe(1);
      expect(SpanKind.INTERNAL).toBe(3);
    });
  });
});
