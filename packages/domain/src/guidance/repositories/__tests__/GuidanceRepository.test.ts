/**
 * GuidanceRepository Unit Tests
 *
 * Tests for the guidance repository port interface error helper functions
 * and type definitions.
 */
import { describe, it, expect } from 'vitest';
import {
  notFoundError,
  duplicateNameError,
  validationError,
  databaseError,
  type GuidanceRepositoryError,
  type GuidanceRepositoryErrorCode,
  type GuidanceRepositoryResult,
  type GuidanceForCallSpec,
  type GuidanceSearchSpec,
  type PaginatedGuidance,
} from '../GuidanceRepository.js';

// =============================================================================
// Error Helper Tests
// =============================================================================

describe('Guidance Repository Error Helpers', () => {
  describe('notFoundError', () => {
    it('should create a NOT_FOUND error with id', () => {
      const error = notFoundError('guidance-123');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Guidance not found: guidance-123');
      expect(error.details).toBeUndefined();
    });

    it('should handle UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const error = notFoundError(uuid);

      expect(error.message).toBe(`Guidance not found: ${uuid}`);
    });

    it('should handle empty id', () => {
      const error = notFoundError('');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Guidance not found: ');
    });

    it('should handle special characters in id', () => {
      const error = notFoundError('id-with-special_chars.123');

      expect(error.message).toBe('Guidance not found: id-with-special_chars.123');
    });
  });

  describe('duplicateNameError', () => {
    it('should create a DUPLICATE_NAME error with name', () => {
      const error = duplicateNameError('Welcome Script');

      expect(error.code).toBe('DUPLICATE_NAME');
      expect(error.message).toBe('Guidance with name "Welcome Script" already exists');
      expect(error.details).toBeUndefined();
    });

    it('should handle names with special characters', () => {
      const error = duplicateNameError("Dr. Smith's All-on-X Script");

      expect(error.message).toBe(
        'Guidance with name "Dr. Smith\'s All-on-X Script" already exists'
      );
    });

    it('should handle empty name', () => {
      const error = duplicateNameError('');

      expect(error.code).toBe('DUPLICATE_NAME');
      expect(error.message).toBe('Guidance with name "" already exists');
    });

    it('should handle long names', () => {
      const longName = 'A'.repeat(200);
      const error = duplicateNameError(longName);

      expect(error.message).toContain(longName);
    });
  });

  describe('validationError', () => {
    it('should create a VALIDATION_ERROR with message only', () => {
      const error = validationError('Name is required');

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Name is required');
      expect(error.details).toBeUndefined();
    });

    it('should include optional details', () => {
      const error = validationError('Invalid step order', {
        field: 'steps',
        expectedOrder: [1, 2, 3],
        actualOrder: [1, 3, 2],
      });

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid step order');
      expect(error.details).toEqual({
        field: 'steps',
        expectedOrder: [1, 2, 3],
        actualOrder: [1, 3, 2],
      });
    });

    it('should handle complex validation details', () => {
      const error = validationError('Multiple validation errors', {
        errors: [
          { field: 'name', message: 'Required' },
          { field: 'type', message: 'Invalid type' },
          { field: 'steps', message: 'At least one step required' },
        ],
        totalErrors: 3,
        invalidFields: ['name', 'type', 'steps'],
      });

      expect(error.details?.errors).toHaveLength(3);
      expect(error.details?.totalErrors).toBe(3);
      expect(error.details?.invalidFields).toEqual(['name', 'type', 'steps']);
    });

    it('should handle empty details', () => {
      const error = validationError('Some error', {});

      expect(error.details).toEqual({});
    });

    it('should handle nested objects in details', () => {
      const error = validationError('Complex error', {
        nested: {
          level1: {
            level2: {
              value: 'deep',
            },
          },
        },
      });

      expect((error.details?.nested as any).level1.level2.value).toBe('deep');
    });
  });

  describe('databaseError', () => {
    it('should create a DATABASE_ERROR with message', () => {
      const error = databaseError('Connection failed');

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.message).toBe('Connection failed');
      expect(error.details).toBeUndefined();
    });

    it('should handle various database error messages', () => {
      const messages = [
        'Connection timeout',
        'Deadlock detected',
        'Transaction rolled back',
        'Query execution failed',
        'Connection pool exhausted',
      ];

      messages.forEach((msg) => {
        const error = databaseError(msg);
        expect(error.code).toBe('DATABASE_ERROR');
        expect(error.message).toBe(msg);
      });
    });

    it('should handle empty message', () => {
      const error = databaseError('');

      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.message).toBe('');
    });

    it('should handle multiline error messages', () => {
      const multilineMsg = 'Error at line 1\nError at line 2\nStack trace follows';
      const error = databaseError(multilineMsg);

      expect(error.message).toBe(multilineMsg);
    });
  });
});

// =============================================================================
// Type Definition Tests
// =============================================================================

describe('Guidance Repository Types', () => {
  describe('GuidanceRepositoryErrorCode', () => {
    it('should cover all error codes', () => {
      const errorCodes: GuidanceRepositoryErrorCode[] = [
        'NOT_FOUND',
        'DUPLICATE_NAME',
        'VALIDATION_ERROR',
        'DATABASE_ERROR',
        'PERMISSION_DENIED',
      ];

      expect(errorCodes).toHaveLength(5);
      errorCodes.forEach((code) => {
        expect(typeof code).toBe('string');
      });
    });
  });

  describe('GuidanceRepositoryError', () => {
    it('should have required fields', () => {
      const error: GuidanceRepositoryError = {
        code: 'PERMISSION_DENIED',
        message: 'Insufficient permissions to access guidance',
      };

      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.message).toBe('Insufficient permissions to access guidance');
      expect(error.details).toBeUndefined();
    });

    it('should allow optional details', () => {
      const error: GuidanceRepositoryError = {
        code: 'PERMISSION_DENIED',
        message: 'Cannot access guidance from another clinic',
        details: {
          requestedClinicId: 'clinic-456',
          userClinicId: 'clinic-123',
        },
      };

      expect(error.details?.requestedClinicId).toBe('clinic-456');
    });
  });

  describe('GuidanceRepositoryResult', () => {
    it('should represent successful result with data', () => {
      const result: GuidanceRepositoryResult<{ id: string; name: string }> = {
        success: true,
        data: { id: 'guid-123', name: 'Test Guidance' },
      };

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('guid-123');
        expect(result.data.name).toBe('Test Guidance');
      }
    });

    it('should represent failure result with error', () => {
      const result: GuidanceRepositoryResult<{ id: string }> = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Guidance not found',
        },
      };

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should work with void return type', () => {
      const successResult: GuidanceRepositoryResult<void> = {
        success: true,
        data: undefined,
      };

      const failureResult: GuidanceRepositoryResult<void> = {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Delete failed',
        },
      };

      expect(successResult.success).toBe(true);
      expect(failureResult.success).toBe(false);
    });

    it('should work with null return type', () => {
      const result: GuidanceRepositoryResult<null> = {
        success: true,
        data: null,
      };

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('should work with array return type', () => {
      const result: GuidanceRepositoryResult<string[]> = {
        success: true,
        data: ['guid-1', 'guid-2', 'guid-3'],
      };

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
      }
    });
  });

  describe('GuidanceForCallSpec', () => {
    it('should require clinicId', () => {
      const spec: GuidanceForCallSpec = {
        clinicId: 'clinic-123',
      };

      expect(spec.clinicId).toBe('clinic-123');
    });

    it('should allow all optional fields', () => {
      const spec: GuidanceForCallSpec = {
        clinicId: 'clinic-123',
        procedure: 'all-on-x',
        category: 'consultation',
        language: 'en',
        audience: 'new-patient',
        type: 'call-script',
      };

      expect(spec.procedure).toBe('all-on-x');
      expect(spec.category).toBe('consultation');
      expect(spec.language).toBe('en');
      expect(spec.audience).toBe('new-patient');
      expect(spec.type).toBe('call-script');
    });

    it('should allow Romanian language', () => {
      const spec: GuidanceForCallSpec = {
        clinicId: 'clinic-123',
        language: 'ro',
      };

      expect(spec.language).toBe('ro');
    });

    it('should allow all audience types', () => {
      const audiences: Array<GuidanceForCallSpec['audience']> = [
        'new-patient',
        'existing-patient',
        'referral',
        'emergency',
        'all',
      ];

      audiences.forEach((audience) => {
        const spec: GuidanceForCallSpec = {
          clinicId: 'clinic-123',
          audience,
        };
        expect(spec.audience).toBe(audience);
      });
    });
  });

  describe('GuidanceSearchSpec', () => {
    it('should require clinicId', () => {
      const spec: GuidanceSearchSpec = {
        clinicId: 'clinic-123',
      };

      expect(spec.clinicId).toBe('clinic-123');
    });

    it('should allow search term', () => {
      const spec: GuidanceSearchSpec = {
        clinicId: 'clinic-123',
        searchTerm: 'implant consultation',
      };

      expect(spec.searchTerm).toBe('implant consultation');
    });

    it('should allow tag filtering', () => {
      const spec: GuidanceSearchSpec = {
        clinicId: 'clinic-123',
        tags: ['premium', 'all-on-x', 'english'],
      };

      expect(spec.tags).toEqual(['premium', 'all-on-x', 'english']);
    });

    it('should allow including inactive guidance', () => {
      const spec: GuidanceSearchSpec = {
        clinicId: 'clinic-123',
        includeInactive: true,
      };

      expect(spec.includeInactive).toBe(true);
    });

    it('should allow including drafts', () => {
      const spec: GuidanceSearchSpec = {
        clinicId: 'clinic-123',
        includeDrafts: true,
      };

      expect(spec.includeDrafts).toBe(true);
    });

    it('should allow all options combined', () => {
      const spec: GuidanceSearchSpec = {
        clinicId: 'clinic-123',
        searchTerm: 'consultation',
        tags: ['premium'],
        includeInactive: true,
        includeDrafts: true,
      };

      expect(spec.clinicId).toBe('clinic-123');
      expect(spec.searchTerm).toBe('consultation');
      expect(spec.tags).toEqual(['premium']);
      expect(spec.includeInactive).toBe(true);
      expect(spec.includeDrafts).toBe(true);
    });
  });

  describe('PaginatedGuidance', () => {
    it('should represent paginated guidance list', () => {
      const result: PaginatedGuidance = {
        items: [],
        total: 0,
        limit: 10,
        offset: 0,
        hasMore: false,
      };

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should indicate more results available', () => {
      const result: PaginatedGuidance = {
        items: [], // Items would be AgentGuidance objects
        total: 100,
        limit: 10,
        offset: 0,
        hasMore: true,
      };

      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
    });

    it('should handle pagination offset', () => {
      const result: PaginatedGuidance = {
        items: [],
        total: 100,
        limit: 10,
        offset: 90,
        hasMore: false,
      };

      expect(result.offset).toBe(90);
      expect(result.hasMore).toBe(false);
    });
  });
});

// =============================================================================
// Error Code Consistency Tests
// =============================================================================

describe('Error Code Consistency', () => {
  it('should produce consistent error codes from factory functions', () => {
    expect(notFoundError('id').code).toBe('NOT_FOUND');
    expect(duplicateNameError('name').code).toBe('DUPLICATE_NAME');
    expect(validationError('msg').code).toBe('VALIDATION_ERROR');
    expect(databaseError('msg').code).toBe('DATABASE_ERROR');
  });

  it('should all errors be typed as GuidanceRepositoryError', () => {
    const errors: GuidanceRepositoryError[] = [
      notFoundError('id'),
      duplicateNameError('name'),
      validationError('msg'),
      databaseError('msg'),
    ];

    errors.forEach((error) => {
      expect(error).toHaveProperty('code');
      expect(error).toHaveProperty('message');
    });
  });
});
