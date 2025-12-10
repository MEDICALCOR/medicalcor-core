/**
 * Capacity Planning Repository Unit Tests
 *
 * Tests for the repository port interface error factory functions
 * and type definitions.
 */
import { describe, it, expect } from 'vitest';
import {
  notFoundError,
  duplicateError,
  validationError,
  constraintViolationError,
  connectionError,
  type CapacityRepositoryError,
  type CapacityRepositoryErrorCode,
  type CapacityRepositoryResult,
  type ShiftSpecification,
  type PlanSpecification,
  type PaginationOptions,
  type PaginatedResult,
  type CreateShiftInput,
  type UpdateShiftInput,
  type CreateCapacityPlanInput,
  type RecordDemandInput,
} from '../capacity-planning-repository.js';

// =============================================================================
// Error Factory Tests
// =============================================================================

describe('Capacity Planning Repository Error Factories', () => {
  describe('notFoundError', () => {
    it('should create a NOT_FOUND error with resource and id', () => {
      const error = notFoundError('Shift', 'shift-123');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe("Shift with ID 'shift-123' not found");
      expect(error.details).toEqual({ resource: 'Shift', id: 'shift-123' });
    });

    it('should handle different resource types', () => {
      const shiftError = notFoundError('Shift', 'shift-abc');
      const planError = notFoundError('CapacityPlan', 'plan-xyz');

      expect(shiftError.message).toBe("Shift with ID 'shift-abc' not found");
      expect(planError.message).toBe("CapacityPlan with ID 'plan-xyz' not found");
    });

    it('should handle special characters in id', () => {
      const error = notFoundError('Resource', "id-with-'quotes'-and-special");

      expect(error.details?.id).toBe("id-with-'quotes'-and-special");
    });

    it('should handle empty strings', () => {
      const error = notFoundError('', '');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe(" with ID '' not found");
      expect(error.details).toEqual({ resource: '', id: '' });
    });
  });

  describe('duplicateError', () => {
    it('should create a DUPLICATE error with resource, field, and value', () => {
      const error = duplicateError('Shift', 'staffId', 'staff-456');

      expect(error.code).toBe('DUPLICATE');
      expect(error.message).toBe("Shift with staffId 'staff-456' already exists");
      expect(error.details).toEqual({
        resource: 'Shift',
        field: 'staffId',
        value: 'staff-456',
      });
    });

    it('should handle different field types', () => {
      const emailError = duplicateError('User', 'email', 'user@example.com');
      const nameError = duplicateError('Plan', 'name', 'Weekly Plan');

      expect(emailError.message).toBe("User with email 'user@example.com' already exists");
      expect(nameError.message).toBe("Plan with name 'Weekly Plan' already exists");
    });

    it('should preserve all details', () => {
      const error = duplicateError('Entity', 'uniqueField', 'uniqueValue');

      expect(error.details?.resource).toBe('Entity');
      expect(error.details?.field).toBe('uniqueField');
      expect(error.details?.value).toBe('uniqueValue');
    });
  });

  describe('validationError', () => {
    it('should create a VALIDATION_ERROR with message', () => {
      const error = validationError('Start time must be before end time');

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Start time must be before end time');
      expect(error.details).toBeUndefined();
    });

    it('should include optional details', () => {
      const error = validationError('Invalid shift duration', {
        field: 'duration',
        minValue: 30,
        maxValue: 480,
        actualValue: 600,
      });

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid shift duration');
      expect(error.details).toEqual({
        field: 'duration',
        minValue: 30,
        maxValue: 480,
        actualValue: 600,
      });
    });

    it('should handle empty details object', () => {
      const error = validationError('Some validation error', {});

      expect(error.details).toEqual({});
    });

    it('should handle complex nested details', () => {
      const error = validationError('Multiple validation errors', {
        errors: [
          { field: 'startTime', message: 'Required' },
          { field: 'endTime', message: 'Must be after startTime' },
        ],
        totalErrors: 2,
      });

      expect(error.details?.errors).toHaveLength(2);
      expect(error.details?.totalErrors).toBe(2);
    });
  });

  describe('constraintViolationError', () => {
    it('should create a CONSTRAINT_VIOLATION error', () => {
      const error = constraintViolationError('shift_staff_unique');

      expect(error.code).toBe('CONSTRAINT_VIOLATION');
      expect(error.message).toBe('Constraint violation: shift_staff_unique');
      expect(error.details).toBeUndefined();
    });

    it('should include optional details', () => {
      const error = constraintViolationError('fk_shift_staff', {
        foreignKey: 'staff_id',
        referencedTable: 'staff',
        referencedColumn: 'id',
      });

      expect(error.code).toBe('CONSTRAINT_VIOLATION');
      expect(error.message).toBe('Constraint violation: fk_shift_staff');
      expect(error.details).toEqual({
        foreignKey: 'staff_id',
        referencedTable: 'staff',
        referencedColumn: 'id',
      });
    });

    it('should handle check constraint', () => {
      const error = constraintViolationError('chk_positive_duration', {
        constraintType: 'CHECK',
        expression: 'duration > 0',
      });

      expect(error.details?.constraintType).toBe('CHECK');
    });

    it('should handle unique constraint', () => {
      const error = constraintViolationError('uq_shift_slot', {
        constraintType: 'UNIQUE',
        columns: ['staff_id', 'start_time'],
      });

      expect(error.details?.constraintType).toBe('UNIQUE');
      expect(error.details?.columns).toEqual(['staff_id', 'start_time']);
    });
  });

  describe('connectionError', () => {
    it('should create a CONNECTION_ERROR with message', () => {
      const error = connectionError('Database connection timeout');

      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.message).toBe('Database connection timeout');
      expect(error.details).toBeUndefined();
    });

    it('should handle various connection error messages', () => {
      const timeoutError = connectionError('Connection timeout after 30000ms');
      const refusedError = connectionError('Connection refused: localhost:5432');
      const poolError = connectionError('Connection pool exhausted');

      expect(timeoutError.code).toBe('CONNECTION_ERROR');
      expect(refusedError.code).toBe('CONNECTION_ERROR');
      expect(poolError.code).toBe('CONNECTION_ERROR');
    });
  });
});

// =============================================================================
// Type Definition Tests
// =============================================================================

describe('Capacity Planning Repository Types', () => {
  describe('CapacityRepositoryResult', () => {
    it('should represent successful result', () => {
      const successResult: CapacityRepositoryResult<string> = {
        success: true,
        value: 'test-value',
      };

      expect(successResult.success).toBe(true);
      expect(successResult.value).toBe('test-value');
    });

    it('should represent failure result', () => {
      const failureResult: CapacityRepositoryResult<string> = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Not found',
        },
      };

      expect(failureResult.success).toBe(false);
      expect(failureResult.error.code).toBe('NOT_FOUND');
    });

    it('should work with complex value types', () => {
      interface ComplexType {
        id: string;
        data: number[];
      }

      const result: CapacityRepositoryResult<ComplexType> = {
        success: true,
        value: { id: 'test', data: [1, 2, 3] },
      };

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.id).toBe('test');
        expect(result.value.data).toEqual([1, 2, 3]);
      }
    });
  });

  describe('ShiftSpecification', () => {
    it('should allow partial specifications', () => {
      const spec: ShiftSpecification = {
        clinicId: 'clinic-123',
      };

      expect(spec.clinicId).toBe('clinic-123');
      expect(spec.staffId).toBeUndefined();
    });

    it('should allow full specifications', () => {
      const spec: ShiftSpecification = {
        clinicId: 'clinic-123',
        staffId: 'staff-456',
        staffRole: 'dentist',
        status: 'scheduled',
        shiftType: 'regular',
        startDateFrom: new Date('2024-01-01'),
        startDateTo: new Date('2024-01-31'),
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-01-31'),
        },
      };

      expect(spec.clinicId).toBe('clinic-123');
      expect(spec.staffRole).toBe('dentist');
    });

    it('should allow array of statuses', () => {
      const spec: ShiftSpecification = {
        status: ['scheduled', 'in_progress'],
      };

      expect(spec.status).toEqual(['scheduled', 'in_progress']);
    });
  });

  describe('PlanSpecification', () => {
    it('should allow partial specifications', () => {
      const spec: PlanSpecification = {
        clinicId: 'clinic-123',
      };

      expect(spec.clinicId).toBe('clinic-123');
    });

    it('should allow filtering by conflicts', () => {
      const spec: PlanSpecification = {
        clinicId: 'clinic-123',
        hasConflicts: true,
      };

      expect(spec.hasConflicts).toBe(true);
    });
  });

  describe('PaginationOptions', () => {
    it('should allow default pagination', () => {
      const options: PaginationOptions = {};

      expect(options.limit).toBeUndefined();
      expect(options.offset).toBeUndefined();
    });

    it('should allow custom pagination', () => {
      const options: PaginationOptions = {
        limit: 20,
        offset: 40,
        sortBy: 'startTime',
        sortOrder: 'desc',
      };

      expect(options.limit).toBe(20);
      expect(options.offset).toBe(40);
      expect(options.sortBy).toBe('startTime');
      expect(options.sortOrder).toBe('desc');
    });
  });

  describe('PaginatedResult', () => {
    it('should represent paginated data', () => {
      const result: PaginatedResult<{ id: string }> = {
        items: [{ id: '1' }, { id: '2' }],
        total: 100,
        limit: 10,
        offset: 0,
        hasMore: true,
      };

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
    });

    it('should indicate no more results', () => {
      const result: PaginatedResult<{ id: string }> = {
        items: [{ id: '1' }],
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false,
      };

      expect(result.hasMore).toBe(false);
    });
  });

  describe('CreateShiftInput', () => {
    it('should allow required fields only', () => {
      const input: CreateShiftInput = {
        clinicId: 'clinic-123',
        staffId: 'staff-456',
        staffName: 'Dr. Smith',
        staffRole: 'dentist',
        shiftType: 'regular',
        startTime: new Date('2024-01-15T09:00:00'),
        endTime: new Date('2024-01-15T17:00:00'),
      };

      expect(input.clinicId).toBe('clinic-123');
      expect(input.breakMinutes).toBeUndefined();
    });

    it('should allow all optional fields', () => {
      const input: CreateShiftInput = {
        clinicId: 'clinic-123',
        staffId: 'staff-456',
        staffName: 'Dr. Smith',
        staffRole: 'dentist',
        shiftType: 'regular',
        startTime: new Date('2024-01-15T09:00:00'),
        endTime: new Date('2024-01-15T17:00:00'),
        breakMinutes: 60,
        maxAppointments: 8,
        procedureTypes: ['implant', 'extraction'],
        notes: 'Morning shift',
      };

      expect(input.breakMinutes).toBe(60);
      expect(input.procedureTypes).toEqual(['implant', 'extraction']);
    });
  });

  describe('UpdateShiftInput', () => {
    it('should allow partial updates', () => {
      const input: UpdateShiftInput = {
        status: 'completed',
      };

      expect(input.status).toBe('completed');
      expect(input.startTime).toBeUndefined();
    });

    it('should allow multiple field updates', () => {
      const input: UpdateShiftInput = {
        startTime: new Date('2024-01-15T10:00:00'),
        endTime: new Date('2024-01-15T18:00:00'),
        breakMinutes: 45,
        notes: 'Updated schedule',
      };

      expect(input.breakMinutes).toBe(45);
      expect(input.notes).toBe('Updated schedule');
    });
  });

  describe('CreateCapacityPlanInput', () => {
    it('should require all fields', () => {
      const input: CreateCapacityPlanInput = {
        clinicId: 'clinic-123',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        period: 'monthly',
      };

      expect(input.clinicId).toBe('clinic-123');
      expect(input.period).toBe('monthly');
    });
  });

  describe('RecordDemandInput', () => {
    it('should capture demand metrics', () => {
      const input: RecordDemandInput = {
        clinicId: 'clinic-123',
        date: new Date('2024-01-15'),
        appointments: 25,
        noShows: 3,
        cancellations: 2,
      };

      expect(input.appointments).toBe(25);
      expect(input.noShows).toBe(3);
      expect(input.cancellations).toBe(2);
    });
  });

  describe('CapacityRepositoryErrorCode', () => {
    it('should cover all error codes', () => {
      const errorCodes: CapacityRepositoryErrorCode[] = [
        'NOT_FOUND',
        'DUPLICATE',
        'VALIDATION_ERROR',
        'CONSTRAINT_VIOLATION',
        'CONNECTION_ERROR',
        'TIMEOUT',
        'CONCURRENT_MODIFICATION',
        'UNKNOWN',
      ];

      expect(errorCodes).toHaveLength(8);
      errorCodes.forEach((code) => {
        expect(typeof code).toBe('string');
      });
    });
  });

  describe('CapacityRepositoryError', () => {
    it('should have required fields', () => {
      const error: CapacityRepositoryError = {
        code: 'TIMEOUT',
        message: 'Operation timed out',
      };

      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toBe('Operation timed out');
      expect(error.details).toBeUndefined();
    });

    it('should allow optional details', () => {
      const error: CapacityRepositoryError = {
        code: 'CONCURRENT_MODIFICATION',
        message: 'Resource was modified by another process',
        details: {
          currentVersion: 5,
          expectedVersion: 4,
        },
      };

      expect(error.details?.currentVersion).toBe(5);
    });
  });
});
