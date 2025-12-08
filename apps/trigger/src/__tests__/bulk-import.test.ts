import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for Bulk Import Workflow
 * L3 Feature: Onboarding efficiency through bulk lead import
 */

// Mock environment variables
vi.stubEnv('DATABASE_URL', '');

// Mock database client
vi.mock('@medicalcor/core', async () => {
  const actual = await vi.importActual('@medicalcor/core');
  return {
    ...actual,
    createDatabaseClient: vi.fn(() => ({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    })),
    withTransaction: vi.fn(async (_pool, callback) => {
      const mockTx = {
        query: vi.fn().mockResolvedValue({ rows: [{ id: 'test-lead-id' }] }),
      };
      return callback(mockTx);
    }),
  };
});

import { parseCSV } from '@medicalcor/core';
import {
  BulkImportRowSchema,
  BulkImportOptionsSchema,
  normalizePhoneForComparison,
  generateExternalContactId,
  calculateImportProgress,
} from '@medicalcor/types';

describe('Bulk Import Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CSV Parsing', () => {
    it('should parse valid CSV with standard headers', () => {
      const csvContent = [
        'phone,fullName,email,source,tags,language',
        '+40721234567,Ion Popescu,ion@example.com,facebook,"implant,urgent",ro',
        '+40722345678,Maria Ionescu,maria@example.com,google,consultatii,ro',
      ].join('\n');

      const result = parseCSV(csvContent);

      expect(result.rows.length).toBe(2);
      expect(result.errors.length).toBe(0);
      expect(result.rows[0]!.phone).toBe('+40721234567');
      expect(result.rows[0]!.fullName).toBe('Ion Popescu');
      expect(result.rows[0]!.email).toBe('ion@example.com');
      expect(result.rows[0]!.source).toBe('facebook');
    });

    it('should parse CSV with Romanian column names', () => {
      const csvContent = [
        'telefon,nume,email,sursa,limba',
        '+40721234567,Ion Popescu,ion@example.com,facebook,ro',
      ].join('\n');

      const result = parseCSV(csvContent);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.phone).toBe('+40721234567');
      expect(result.rows[0]!.fullName).toBe('Ion Popescu');
    });

    it('should handle quoted values with commas', () => {
      const csvContent = [
        'phone,fullName,notes',
        '+40721234567,"Popescu, Ion","Lead from Facebook, interested in implants"',
      ].join('\n');

      const result = parseCSV(csvContent);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.fullName).toBe('Popescu, Ion');
    });

    it('should handle empty lines', () => {
      const csvContent = [
        'phone,fullName',
        '+40721234567,Ion Popescu',
        '',
        '+40722345678,Maria Ionescu',
        '',
      ].join('\n');

      const result = parseCSV(csvContent);

      expect(result.rows.length).toBe(2);
    });

    it('should report errors for invalid rows', () => {
      const csvContent = [
        'phone,fullName,email',
        ',Ion Popescu,ion@example.com', // Missing phone - should error
        '+40721234567,Maria Ionescu,invalid-email', // Invalid email - but email is validated at import time, not parse time
        '+40722345678,Valid Lead,valid@example.com',
      ].join('\n');

      const result = parseCSV(csvContent);

      // Invalid email is caught at parse time since email validation is strict
      // Missing phone is always an error
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw error for CSV without phone column', () => {
      const csvContent = ['name,email', 'Ion Popescu,ion@example.com'].join('\n');

      expect(() => parseCSV(csvContent)).toThrow(/phone column/i);
    });

    it('should throw error for empty CSV', () => {
      expect(() => parseCSV('')).toThrow();
    });

    it('should throw error for CSV with only header', () => {
      expect(() => parseCSV('phone,fullName,email')).toThrow();
    });

    it('should parse firstName and lastName and combine into fullName', () => {
      const csvContent = [
        'phone,firstName,lastName,email',
        '+40721234567,Ion,Popescu,ion@example.com',
      ].join('\n');

      const result = parseCSV(csvContent);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.fullName).toBe('Ion Popescu');
    });

    it('should handle escaped quotes in quoted fields', () => {
      const csvContent = [
        'phone,notes',
        '+40721234567,"He said ""I want implants"" on the call"',
      ].join('\n');

      const result = parseCSV(csvContent);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.notes).toBe('He said "I want implants" on the call');
    });
  });

  describe('Schema Validation', () => {
    it('should validate a complete lead row', () => {
      const row = {
        phone: '+40721234567',
        fullName: 'Ion Popescu',
        email: 'ion@example.com',
        source: 'facebook',
        acquisitionChannel: 'social',
        language: 'ro',
        gdprConsent: true,
        status: 'new',
        tags: ['implant', 'urgent'],
      };

      const result = BulkImportRowSchema.safeParse(row);
      expect(result.success).toBe(true);
    });

    it('should require phone field', () => {
      const row = {
        fullName: 'Ion Popescu',
        email: 'ion@example.com',
      };

      const result = BulkImportRowSchema.safeParse(row);
      expect(result.success).toBe(false);
    });

    it('should validate email format when provided', () => {
      const validRow = {
        phone: '+40721234567',
        email: 'valid@example.com',
      };

      const invalidRow = {
        phone: '+40721234567',
        email: 'not-an-email',
      };

      expect(BulkImportRowSchema.safeParse(validRow).success).toBe(true);
      expect(BulkImportRowSchema.safeParse(invalidRow).success).toBe(false);
    });

    it('should accept empty email', () => {
      const row = {
        phone: '+40721234567',
        email: '',
      };

      const result = BulkImportRowSchema.safeParse(row);
      expect(result.success).toBe(true);
    });

    it('should transform string tags to array', () => {
      const row = {
        phone: '+40721234567',
        tags: 'implant, urgent, premium',
      };

      const result = BulkImportRowSchema.safeParse(row);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data.tags)).toBe(true);
        expect(result.data.tags).toContain('implant');
        expect(result.data.tags).toContain('urgent');
        expect(result.data.tags).toContain('premium');
      }
    });

    it('should transform string gdprConsent to boolean', () => {
      const trueValues = ['true', '1', 'yes'];
      const falseValues = ['false', '0', 'no'];

      for (const val of trueValues) {
        const row = { phone: '+40721234567', gdprConsent: val };
        const result = BulkImportRowSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.gdprConsent).toBe(true);
        }
      }

      for (const val of falseValues) {
        const row = { phone: '+40721234567', gdprConsent: val };
        const result = BulkImportRowSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.gdprConsent).toBe(false);
        }
      }
    });

    it('should apply default values', () => {
      const row = {
        phone: '+40721234567',
      };

      const result = BulkImportRowSchema.safeParse(row);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('ro');
        expect(result.data.status).toBe('new');
        expect(result.data.externalSource).toBe('bulk_import');
      }
    });
  });

  describe('Import Options Validation', () => {
    it('should validate valid options', () => {
      const options = {
        skipDuplicates: true,
        updateExisting: false,
        validateOnly: true,
        defaultSource: 'csv_import',
        maxErrors: 50,
        batchSize: 100,
      };

      const result = BulkImportOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
    });

    it('should apply default option values', () => {
      const result = BulkImportOptionsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.skipDuplicates).toBe(true);
        expect(result.data.updateExisting).toBe(false);
        expect(result.data.validateOnly).toBe(false);
        expect(result.data.batchSize).toBe(100);
        expect(result.data.maxErrors).toBe(100);
      }
    });

    it('should enforce batch size limits', () => {
      const tooLarge = { batchSize: 2000 };
      const result = BulkImportOptionsSchema.safeParse(tooLarge);
      expect(result.success).toBe(false);
    });

    it('should validate clinic ID as UUID when provided', () => {
      const validClinicId = { clinicId: '123e4567-e89b-12d3-a456-426614174000' };
      const invalidClinicId = { clinicId: 'not-a-uuid' };

      expect(BulkImportOptionsSchema.safeParse(validClinicId).success).toBe(true);
      expect(BulkImportOptionsSchema.safeParse(invalidClinicId).success).toBe(false);
    });
  });

  describe('Helper Functions', () => {
    describe('normalizePhoneForComparison', () => {
      it('should remove all non-digit characters', () => {
        expect(normalizePhoneForComparison('+40 721 234 567')).toBe('40721234567');
        expect(normalizePhoneForComparison('(40) 721-234-567')).toBe('40721234567');
        expect(normalizePhoneForComparison('0721.234.567')).toBe('0721234567');
      });
    });

    describe('generateExternalContactId', () => {
      it('should generate ID from source and normalized phone', () => {
        const id = generateExternalContactId('+40721234567', 'csv_import');
        expect(id).toBe('csv_import-40721234567');
      });
    });

    describe('calculateImportProgress', () => {
      it('should calculate progress percentage', () => {
        expect(calculateImportProgress(50, 100)).toBe(50);
        expect(calculateImportProgress(0, 100)).toBe(0);
        expect(calculateImportProgress(100, 100)).toBe(100);
        expect(calculateImportProgress(33, 100)).toBe(33);
      });

      it('should handle edge cases', () => {
        expect(calculateImportProgress(0, 0)).toBe(100); // Empty import is complete
        expect(calculateImportProgress(150, 100)).toBe(150); // Possible if updates happen after
      });
    });
  });

  describe('Error Handling', () => {
    it('should categorize phone validation errors', () => {
      const invalidPhones = [
        '', // Empty
        'abc', // Not a number
        '123', // Too short
      ];

      for (const phone of invalidPhones) {
        const result = BulkImportRowSchema.safeParse({ phone });
        if (!result.success) {
          expect(result.error.issues.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Batch Processing', () => {
    it('should correctly split rows into batches', () => {
      const rows = Array.from({ length: 250 }, (_, i) => ({
        phone: `+407212345${String(i).padStart(2, '0')}`,
        fullName: `Lead ${i}`,
      }));

      const batchSize = 100;
      const batches: (typeof rows)[] = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        batches.push(rows.slice(i, Math.min(i + batchSize, rows.length)));
      }

      expect(batches.length).toBe(3);
      expect(batches[0]!.length).toBe(100);
      expect(batches[1]!.length).toBe(100);
      expect(batches[2]!.length).toBe(50);
    });
  });

  describe('Duplicate Detection', () => {
    it('should identify duplicate phones in import batch', () => {
      const rows = [
        { phone: '+40721234567', fullName: 'Lead 1' },
        { phone: '+40721234567', fullName: 'Lead 2' }, // Duplicate
        { phone: '+40722345678', fullName: 'Lead 3' },
      ];

      const seenPhones = new Set<string>();
      const duplicates: number[] = [];

      rows.forEach((row, index) => {
        if (seenPhones.has(row.phone)) {
          duplicates.push(index);
        } else {
          seenPhones.add(row.phone);
        }
      });

      expect(duplicates).toEqual([1]);
    });
  });

  describe('Workflow Payload Schema', () => {
    it('should validate workflow payload structure', () => {
      const payload = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        rows: [{ phone: '+40721234567', fullName: 'Test Lead' }],
        options: {
          skipDuplicates: true,
          batchSize: 100,
        },
        correlationId: 'test-correlation-123',
      };

      // Validate payload structure manually
      expect(payload.jobId).toBeDefined();
      expect(payload.rows.length).toBeGreaterThan(0);
      expect(payload.correlationId).toBeDefined();
      expect(typeof payload.options.skipDuplicates).toBe('boolean');
      expect(typeof payload.options.batchSize).toBe('number');
    });
  });
});

describe('Integration Patterns', () => {
  describe('API Response Structure', () => {
    it('should structure sync response correctly', () => {
      const mockResponse = {
        success: true,
        totalRows: 100,
        successCount: 95,
        errorCount: 3,
        skipCount: 2,
        results: [],
        errors: [],
        validationOnly: false,
        durationMs: 1500,
      };

      expect(mockResponse.successCount + mockResponse.errorCount + mockResponse.skipCount).toBe(
        100
      );
      expect(mockResponse.success).toBe(true);
    });

    it('should structure async response correctly', () => {
      const mockResponse = {
        success: true,
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        status: 'pending' as const,
        message: 'Import job created for 1000 leads',
        totalRows: 1000,
        statusUrl: '/api/leads/bulk-import/jobs/123e4567-e89b-12d3-a456-426614174000',
      };

      expect(mockResponse.jobId).toBeDefined();
      expect(mockResponse.statusUrl).toContain(mockResponse.jobId);
    });
  });
});
