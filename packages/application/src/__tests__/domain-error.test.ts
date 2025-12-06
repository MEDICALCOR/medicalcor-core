import { describe, it, expect } from 'vitest';
import {
  DomainError,
  ErrorSeverity,
  OptimisticLockError,
  BusinessRuleError,
} from '../shared/DomainError.js';

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
      expect(clientJson.stack).toBeUndefined();
      expect(clientJson.details).toBeUndefined();
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
