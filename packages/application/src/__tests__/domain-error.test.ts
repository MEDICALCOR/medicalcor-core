import { describe, it, expect } from 'vitest';
import {
  DomainError,
  ErrorSeverity,
  OptimisticLockError,
  BusinessRuleError,
} from '../shared/DomainError.js';

/**
 * Tests for DomainError Classes
 *
 * Covers:
 * - DomainError base class
 * - Error severity levels
 * - Factory methods (notFound, validation, unauthorized, etc.)
 * - Serialization (toJSON, toClientJSON)
 * - Specialized error classes (OptimisticLockError, BusinessRuleError)
 * - Error metadata and correlation tracking
 */

describe('DomainError', () => {
  describe('Constructor', () => {
    it('should create error with required fields', () => {
      const error = new DomainError('test.error', 'Test error message');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.name).toBe('DomainError');
      expect(error.code).toBe('test.error');
      expect(error.message).toBe('Test error message');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM); // Default
      expect(error.details).toBeUndefined();
      expect(error.correlationId).toBeUndefined();
    });

    it('should create error with all fields', () => {
      const details = { field: 'value', extra: 123 };
      const error = new DomainError(
        'custom.error',
        'Custom error message',
        details,
        ErrorSeverity.HIGH,
        'corr-123'
      );

      expect(error.code).toBe('custom.error');
      expect(error.message).toBe('Custom error message');
      expect(error.details).toBe(details);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.correlationId).toBe('corr-123');
    });

    it('should have error stack trace', () => {
      const error = new DomainError('test.error', 'Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('DomainError');
    });

    it('should maintain prototype chain', () => {
      const error = new DomainError('test.error', 'Test error');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof DomainError).toBe(true);
    });
  });

  describe('Error Severity Levels', () => {
    it('should support LOW severity', () => {
      const error = new DomainError('test.error', 'Test', {}, ErrorSeverity.LOW);

      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.isCritical()).toBe(false);
    });

    it('should support MEDIUM severity (default)', () => {
      const error = new DomainError('test.error', 'Test');

      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.isCritical()).toBe(false);
    });

    it('should support HIGH severity', () => {
      const error = new DomainError('test.error', 'Test', {}, ErrorSeverity.HIGH);

      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.isCritical()).toBe(false);
    });

    it('should support CRITICAL severity', () => {
      const error = new DomainError('test.error', 'Test', {}, ErrorSeverity.CRITICAL);

      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.isCritical()).toBe(true);
    });
  });

  describe('isCritical', () => {
    it('should return true only for CRITICAL severity', () => {
      expect(new DomainError('e', 'm', {}, ErrorSeverity.LOW).isCritical()).toBe(false);
      expect(new DomainError('e', 'm', {}, ErrorSeverity.MEDIUM).isCritical()).toBe(false);
      expect(new DomainError('e', 'm', {}, ErrorSeverity.HIGH).isCritical()).toBe(false);
      expect(new DomainError('e', 'm', {}, ErrorSeverity.CRITICAL).isCritical()).toBe(true);
    });
  });
});

describe('DomainError', () => {
  describe('constructor', () => {
    it('should create error with required fields', () => {
      const error = new DomainError('test.error', 'Test message');

      expect(error.code).toBe('test.error');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('DomainError');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should create error with all fields', () => {
      const details = { key: 'value' };
      const error = new DomainError(
        'full.error',
        'Full message',
        details,
        ErrorSeverity.CRITICAL,
        'corr-123'
      );

      expect(error.code).toBe('full.error');
      expect(error.message).toBe('Full message');
      expect(error.details).toEqual(details);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.correlationId).toBe('corr-123');
    });

    it('should be instanceof Error', () => {
      const error = new DomainError('test', 'message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should have stack trace', () => {
      const error = new DomainError('test', 'message');
      expect(error.stack).toBeDefined();
    });
  });

  describe('toJSON', () => {
    it('should serialize all error fields', () => {
      const error = new DomainError(
        'test.error',
        'Test message',
        { field: 'value' },
        ErrorSeverity.HIGH,
        'corr-123'
      );

      const json = error.toJSON();

      expect(json.code).toBe('test.error');
      expect(json.message).toBe('Test message');
      expect(json.details).toEqual({ field: 'value' });
      expect(json.severity).toBe(ErrorSeverity.HIGH);
      expect(json.correlationId).toBe('corr-123');
    });

    it('should convert error to JSON', () => {
      const error = new DomainError(
        'test.code',
        'Test message',
        { extra: 'data' },
        ErrorSeverity.HIGH,
        'corr-456'
      );

      const json = error.toJSON();

      expect(json.name).toBe('DomainError');
      expect(json.code).toBe('test.code');
      expect(json.message).toBe('Test message');
      expect(json.details).toEqual({ extra: 'data' });
      expect(json.severity).toBe(ErrorSeverity.HIGH);
      expect(json.correlationId).toBe('corr-456');
      expect(json.stack).toBeDefined();
    });

    it('should include stack trace in JSON', () => {
      const error = new DomainError('test.error', 'Test');
      const json = error.toJSON();

      expect(json.stack).toBeDefined();
      expect(typeof json.stack).toBe('string');
    });

    it('should handle undefined optional fields', () => {
      const error = new DomainError('test.error', 'Test');
      const json = error.toJSON();

      expect(json.details).toBeUndefined();
      expect(json.correlationId).toBeUndefined();
    });

    it('should serialize complex details', () => {
      const complexDetails = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        mixed: { a: 'string', b: 42, c: true },
      };

      const error = new DomainError('test.error', 'Test', complexDetails);
      const json = error.toJSON();

      expect(json.details).toEqual(complexDetails);
    });
  });

  describe('toClientJSON', () => {
    it('should return safe client-facing error', () => {
      const error = new DomainError(
        'test.error',
        'Test message',
        { sensitive: 'data', internal: 'details' },
        ErrorSeverity.HIGH,
        'corr-123'
      );

      const clientJson = error.toClientJSON();

      expect(clientJson.code).toBe('test.error');
      expect(clientJson.message).toBe('Test message');
      expect(clientJson.correlationId).toBe('corr-123');
      expect(clientJson).not.toHaveProperty('stack');
      expect(clientJson).not.toHaveProperty('details');
    });
  });

  describe('toClientJSON extended', () => {
    it('should verify JSON structure', () => {
      const json = new DomainError(
        'test.code',
        'Test message',
        { extra: 'data' },
        ErrorSeverity.HIGH,
        'corr-456'
      ).toJSON();
      expect(json.code).toBe('test.code');
      expect(json.message).toBe('Test message');
      expect(json.details).toEqual({ extra: 'data' });
      expect(json.severity).toBe(ErrorSeverity.HIGH);
      expect(json.correlationId).toBe('corr-456');
      expect(json.stack).toBeDefined();
    });
  });

  describe('toClientJSON', () => {
    it('should return safe version without stack trace', () => {
      const error = new DomainError(
        'test.code',
        'Test message',
        { sensitive: 'data' },
        ErrorSeverity.HIGH,
        'corr-789'
      );

      const clientJson = error.toClientJSON();

      expect(clientJson.code).toBe('test.code');
      expect(clientJson.message).toBe('Test message');
      expect(clientJson.correlationId).toBe('corr-789');
      expect(clientJson).not.toHaveProperty('stack');
      expect(clientJson).not.toHaveProperty('details');
      expect(clientJson).not.toHaveProperty('severity');
    });

    it('should exclude sensitive information', () => {
      const error = new DomainError(
        'security.error',
        'Authentication failed',
        { password: 'secret123', token: 'xyz' },
        ErrorSeverity.HIGH,
        'corr-456'
      );

      const clientJson = error.toClientJSON();

      expect(clientJson).toEqual({
        code: 'security.error',
        message: 'Authentication failed',
        correlationId: 'corr-456',
      });
    });

    it('should handle missing correlation ID', () => {
      const error = new DomainError('test.error', 'Test message');
      const clientJson = error.toClientJSON();

      expect(clientJson.code).toBe('test.error');
      expect(clientJson.message).toBe('Test message');
      expect(clientJson.correlationId).toBeUndefined();
    });
  });

  describe('Factory Method: notFound', () => {
    it('should create not found error with correct structure', () => {
      const error = DomainError.notFound('Patient', 'patient-123', 'corr-456');

      expect(error.code).toBe('patient.not_found');
      expect(error.message).toBe("Patient with ID 'patient-123' not found");
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.correlationId).toBe('corr-456');
      expect(error.details).toEqual({
        resourceType: 'Patient',
        resourceId: 'patient-123',
      });
    });

    it('should handle different resource types', () => {
      const caseError = DomainError.notFound('OsaxCase', 'case-789');

      expect(caseError.code).toBe('osaxcase.not_found');
      expect(caseError.message).toBe("OsaxCase with ID 'case-789' not found");
    });

    it('should work without correlation ID', () => {
      const error = DomainError.notFound('User', 'user-123');

      expect(error.code).toBe('user.not_found');
      expect(error.correlationId).toBeUndefined();
    });

    it('should lowercase resource type in code', () => {
      const error = DomainError.notFound('MyResource', 'res-1');

      expect(error.code).toBe('myresource.not_found');
    });
  });

  describe('Factory Method: validation', () => {
    it('should create validation error with field errors', () => {
      const fieldErrors = {
        email: ['Email is required', 'Invalid email format'],
        age: ['Age must be positive'],
      };

      const error = DomainError.validation('Validation failed', fieldErrors, 'corr-789');

      expect(error.code).toBe('validation.failed');
      expect(error.message).toBe('Validation failed');
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.correlationId).toBe('corr-789');
      expect(error.details).toEqual({ fieldErrors });
    });

    it('should work with empty field errors', () => {
      const error = DomainError.validation('Validation failed', {});

      expect(error.details).toEqual({ fieldErrors: {} });
    });

    it('should work without correlation ID', () => {
      const error = DomainError.validation('Validation failed', { field: ['error'] });

      expect(error.correlationId).toBeUndefined();
    });

    it('should support complex validation messages', () => {
      const fieldErrors = {
        'user.profile.address.zipCode': ['Must be 5 digits'],
      };

      const error = DomainError.validation('Nested validation failed', fieldErrors);

      expect(error.details?.fieldErrors).toEqual(fieldErrors);
    });
  });

  describe('Factory Method: unauthorized', () => {
    it('should create unauthorized error', () => {
      const error = DomainError.unauthorized(
        'Invalid credentials',
        { attemptCount: 3 },
        'corr-999'
      );

      expect(error.code).toBe('security.unauthorized');
      expect(error.message).toBe('Invalid credentials');
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.correlationId).toBe('corr-999');
      expect(error.details).toEqual({ attemptCount: 3 });
    });

    it('should work without details', () => {
      const error = DomainError.unauthorized('Unauthorized');

      expect(error.code).toBe('security.unauthorized');
      expect(error.details).toBeUndefined();
      expect(error.correlationId).toBeUndefined();
    });

    it('should work with details but no correlation ID', () => {
      const error = DomainError.unauthorized('Unauthorized', { reason: 'token_expired' });

      expect(error.details).toEqual({ reason: 'token_expired' });
      expect(error.correlationId).toBeUndefined();
    });
  });

  describe('Factory Method: permissionDenied', () => {
    it('should create permission denied error', () => {
      const error = DomainError.permissionDenied('OSAX_CASE_DELETE', 'user-456', 'corr-111');

      expect(error.code).toBe('security.permission_denied');
      expect(error.message).toBe('Permission denied: OSAX_CASE_DELETE');
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.correlationId).toBe('corr-111');
      expect(error.details).toEqual({
        permission: 'OSAX_CASE_DELETE',
        principalId: 'user-456',
      });
    });

    it('should work without correlation ID', () => {
      const error = DomainError.permissionDenied('ADMIN_ACCESS', 'user-789');

      expect(error.code).toBe('security.permission_denied');
      expect(error.correlationId).toBeUndefined();
    });

    it('should include permission details', () => {
      const error = DomainError.permissionDenied('PHI_READ', 'user-123');

      expect(error.details?.permission).toBe('PHI_READ');
      expect(error.details?.principalId).toBe('user-123');
    });
  });

  describe('Factory Method: conflict', () => {
    it('should create conflict error', () => {
      const error = DomainError.conflict(
        'Resource already exists',
        { existingId: 'res-123' },
        'corr-222'
      );

      expect(error.code).toBe('conflict');
      expect(error.message).toBe('Resource already exists');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.correlationId).toBe('corr-222');
      expect(error.details).toEqual({ existingId: 'res-123' });
    });

    it('should work without details', () => {
      const error = DomainError.conflict('Conflict occurred');

      expect(error.code).toBe('conflict');
      expect(error.details).toBeUndefined();
    });
  });

  describe('Factory Method: internal', () => {
    it('should create internal error from Error cause', () => {
      const cause = new Error('Database connection failed');
      cause.stack = 'Original stack trace';

      const error = DomainError.internal('Internal server error', cause, 'corr-333');

      expect(error.code).toBe('internal.error');
      expect(error.message).toBe('Internal server error');
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.correlationId).toBe('corr-333');
      expect(error.details?.cause).toBe('Database connection failed');
      expect(error.details?.stack).toBe('Original stack trace');
      expect(error.isCritical()).toBe(true);
    });

    it('should work without cause', () => {
      const error = DomainError.internal('Unknown error');

      expect(error.code).toBe('internal.error');
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.details?.cause).toBeUndefined();
      expect(error.details?.stack).toBeUndefined();
    });

    it('should work with cause but no correlation ID', () => {
      const cause = new Error('Redis timeout');
      const error = DomainError.internal('Cache error', cause);

      expect(error.details?.cause).toBe('Redis timeout');
      expect(error.correlationId).toBeUndefined();
    });
  });

  describe('OptimisticLockError', () => {
    it('should create optimistic lock error', () => {
      const error = new OptimisticLockError('OsaxCase', 'case-123', 5, 6, 'corr-444');

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('OptimisticLockError');
      expect(error.code).toBe('concurrency.optimistic_lock_failed');
      expect(error.message).toBe(
        "Optimistic lock failed for OsaxCase 'case-123': expected version 5, actual 6"
      );
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.correlationId).toBe('corr-444');
      expect(error.details).toEqual({
        resourceType: 'OsaxCase',
        resourceId: 'case-123',
        expectedVersion: 5,
        actualVersion: 6,
      });
    });

    it('should work without correlation ID', () => {
      const error = new OptimisticLockError('Patient', 'patient-789', 1, 2);

      expect(error.code).toBe('concurrency.optimistic_lock_failed');
      expect(error.correlationId).toBeUndefined();
    });

    it('should be instanceof Error and DomainError', () => {
      const error = new OptimisticLockError('Resource', 'res-1', 1, 2);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof DomainError).toBe(true);
    });

    it('should include version mismatch details', () => {
      const error = new OptimisticLockError('Case', 'case-1', 10, 15);

      expect(error.details?.expectedVersion).toBe(10);
      expect(error.details?.actualVersion).toBe(15);
    });
  });

  describe('BusinessRuleError', () => {
    it('should create business rule error', () => {
      const error = new BusinessRuleError(
        'duplicate_active_case',
        'Cannot create case: active case already exists',
        { existingCaseId: 'case-456' },
        'corr-555'
      );

      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BusinessRuleError');
      expect(error.code).toBe('business_rule.duplicate_active_case');
      expect(error.message).toBe('Cannot create case: active case already exists');
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.correlationId).toBe('corr-555');
      expect(error.details).toEqual({ existingCaseId: 'case-456' });
    });

    it('should work without details', () => {
      const error = new BusinessRuleError('invalid_state', 'Invalid state transition');

      expect(error.code).toBe('business_rule.invalid_state');
      expect(error.details).toBeUndefined();
    });

    it('should work without correlation ID', () => {
      const error = new BusinessRuleError('max_limit_reached', 'Maximum limit reached');

      expect(error.code).toBe('business_rule.max_limit_reached');
      expect(error.correlationId).toBeUndefined();
    });

    it('should be instanceof Error and DomainError', () => {
      const error = new BusinessRuleError('test_rule', 'Test violation');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof DomainError).toBe(true);
    });

    it('should construct code with business_rule prefix', () => {
      const error1 = new BusinessRuleError('rule1', 'Message');
      expect(error1.code).toBe('business_rule.rule1');

      const error2 = new BusinessRuleError('another_rule', 'Message');
      expect(error2.code).toBe('business_rule.another_rule');
    });
  });

  describe('Error Throwing and Catching', () => {
    it('should be throwable and catchable', () => {
      expect(() => {
        throw new DomainError('test.error', 'Test error');
      }).toThrow(DomainError);
    });

    it('should preserve error properties when caught', () => {
      try {
        throw new DomainError('test.code', 'Test message', { detail: 'value' });
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        if (error instanceof DomainError) {
          expect(error.code).toBe('test.code');
          expect(error.message).toBe('Test message');
          expect(error.details).toEqual({ detail: 'value' });
        }
      }
    });

    it('should catch specialized errors as DomainError', () => {
      try {
        throw new OptimisticLockError('Resource', 'res-1', 1, 2);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('should support error chaining and context enrichment', () => {
      const originalError = new Error('Network timeout');
      const domainError = DomainError.internal('Failed to fetch data', originalError, 'corr-1');

      expect(domainError.details?.cause).toBe('Network timeout');
      expect(domainError.severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should support error categorization by severity', () => {
      const errors = [
        DomainError.validation('Validation failed', {}),
        DomainError.notFound('Resource', 'id-1'),
        DomainError.unauthorized('Auth failed'),
        DomainError.internal('System error'),
      ];

      const criticalErrors = errors.filter((e) => e.isCritical());
      const nonCriticalErrors = errors.filter((e) => !e.isCritical());

      expect(criticalErrors.length).toBe(1);
      expect(nonCriticalErrors.length).toBe(3);
      expect(criticalErrors[0]?.code).toBe('internal.error');
    });

    it('should support error filtering by code prefix', () => {
      const errors = [
        new DomainError('security.unauthorized', 'Unauthorized'),
        new DomainError('security.permission_denied', 'Permission denied'),
        DomainError.validation('Validation failed', {}),
        new BusinessRuleError('max_limit', 'Limit reached'),
      ];

      const securityErrors = errors.filter((e) => e.code.startsWith('security.'));
      const businessRuleErrors = errors.filter((e) => e.code.startsWith('business_rule.'));

      expect(securityErrors.length).toBe(2);
      expect(businessRuleErrors.length).toBe(1);
    });
  });

  describe('isCritical', () => {
    it('should return true for CRITICAL severity', () => {
      const error = new DomainError('test', 'message', undefined, ErrorSeverity.CRITICAL);
      expect(error.isCritical()).toBe(true);
    });

    it('should return false for non-CRITICAL severities', () => {
      expect(new DomainError('test', 'msg', undefined, ErrorSeverity.LOW).isCritical()).toBe(false);
      expect(new DomainError('test', 'msg', undefined, ErrorSeverity.MEDIUM).isCritical()).toBe(
        false
      );
      expect(new DomainError('test', 'msg', undefined, ErrorSeverity.HIGH).isCritical()).toBe(
        false
      );
    });
  });

  describe('static factory methods', () => {
    describe('notFound', () => {
      it('should create NOT_FOUND error', () => {
        const error = DomainError.notFound('Patient', 'patient-123', 'corr-1');

        expect(error.code).toBe('patient.not_found');
        expect(error.message).toBe("Patient with ID 'patient-123' not found");
        expect(error.details).toEqual({ resourceType: 'Patient', resourceId: 'patient-123' });
        expect(error.severity).toBe(ErrorSeverity.MEDIUM);
        expect(error.correlationId).toBe('corr-1');
      });

      it('should work without correlationId', () => {
        const error = DomainError.notFound('Case', 'case-456');
        expect(error.correlationId).toBeUndefined();
      });
    });

    describe('validation', () => {
      it('should create VALIDATION error', () => {
        const fieldErrors = {
          email: ['Invalid email format'],
          phone: ['Phone is required', 'Invalid phone format'],
        };
        const error = DomainError.validation('Validation failed', fieldErrors, 'corr-2');

        expect(error.code).toBe('validation.failed');
        expect(error.message).toBe('Validation failed');
        expect(error.details).toEqual({ fieldErrors });
        expect(error.severity).toBe(ErrorSeverity.LOW);
        expect(error.correlationId).toBe('corr-2');
      });
    });

    describe('unauthorized', () => {
      it('should create UNAUTHORIZED error', () => {
        const error = DomainError.unauthorized(
          'Invalid credentials',
          { attemptCount: 3 },
          'corr-3'
        );

        expect(error.code).toBe('security.unauthorized');
        expect(error.message).toBe('Invalid credentials');
        expect(error.details).toEqual({ attemptCount: 3 });
        expect(error.severity).toBe(ErrorSeverity.HIGH);
        expect(error.correlationId).toBe('corr-3');
      });

      it('should work without details', () => {
        const error = DomainError.unauthorized('Access denied');
        expect(error.details).toBeUndefined();
      });
    });

    describe('permissionDenied', () => {
      it('should create PERMISSION_DENIED error', () => {
        const error = DomainError.permissionDenied('write:patients', 'user-123', 'corr-4');

        expect(error.code).toBe('security.permission_denied');
        expect(error.message).toBe('Permission denied: write:patients');
        expect(error.details).toEqual({ permission: 'write:patients', principalId: 'user-123' });
        expect(error.severity).toBe(ErrorSeverity.HIGH);
        expect(error.correlationId).toBe('corr-4');
      });
    });

    describe('conflict', () => {
      it('should create CONFLICT error', () => {
        const error = DomainError.conflict(
          'Resource already exists',
          { existingId: 'abc-123' },
          'corr-5'
        );

        expect(error.code).toBe('conflict');
        expect(error.message).toBe('Resource already exists');
        expect(error.details).toEqual({ existingId: 'abc-123' });
        expect(error.severity).toBe(ErrorSeverity.MEDIUM);
        expect(error.correlationId).toBe('corr-5');
      });
    });

    describe('internal', () => {
      it('should create INTERNAL error with cause', () => {
        const cause = new Error('Database connection failed');
        const error = DomainError.internal('An unexpected error occurred', cause, 'corr-6');

        expect(error.code).toBe('internal.error');
        expect(error.message).toBe('An unexpected error occurred');
        expect(error.details?.cause).toBe('Database connection failed');
        expect(error.details?.stack).toBeDefined();
        expect(error.severity).toBe(ErrorSeverity.CRITICAL);
        expect(error.correlationId).toBe('corr-6');
      });

      it('should work without cause', () => {
        const error = DomainError.internal('Unknown error');
        expect(error.details?.cause).toBeUndefined();
        expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      });
    });
  });
});

describe('OptimisticLockError', () => {
  it('should create optimistic lock error', () => {
    const error = new OptimisticLockError('Case', 'case-123', 1, 2, 'corr-7');

    expect(error.code).toBe('concurrency.optimistic_lock_failed');
    expect(error.message).toBe(
      "Optimistic lock failed for Case 'case-123': expected version 1, actual 2"
    );
    expect(error.details).toEqual({
      resourceType: 'Case',
      resourceId: 'case-123',
      expectedVersion: 1,
      actualVersion: 2,
    });
    expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.correlationId).toBe('corr-7');
    expect(error.name).toBe('OptimisticLockError');
  });

  it('should be instanceof DomainError', () => {
    const error = new OptimisticLockError('Test', 'id', 1, 2);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('OptimisticLockError');
  });
});

describe('BusinessRuleError', () => {
  it('should create business rule error', () => {
    const error = new BusinessRuleError(
      'appointment_overlap',
      'Appointment overlaps with existing appointment',
      { existingAppointmentId: 'apt-456' },
      'corr-8'
    );

    expect(error.code).toBe('business_rule.appointment_overlap');
    expect(error.message).toBe('Appointment overlaps with existing appointment');
    expect(error.details).toEqual({ existingAppointmentId: 'apt-456' });
    expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.correlationId).toBe('corr-8');
    expect(error.name).toBe('BusinessRuleError');
  });

  it('should work without details', () => {
    const error = new BusinessRuleError('invalid_state', 'Invalid state transition');
    expect(error.details).toBeUndefined();
    expect(error.correlationId).toBeUndefined();
  });

  it('should be instanceof DomainError', () => {
    const error = new BusinessRuleError('test', 'message');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('BusinessRuleError');
  });
});

describe('ErrorSeverity', () => {
  it('should have all expected values', () => {
    expect(ErrorSeverity.LOW).toBe('LOW');
    expect(ErrorSeverity.MEDIUM).toBe('MEDIUM');
    expect(ErrorSeverity.HIGH).toBe('HIGH');
    expect(ErrorSeverity.CRITICAL).toBe('CRITICAL');
  });
});
