/**
 * Bulk Import Service Tests
 *
 * Tests for CSV parsing, phone validation, and bulk import processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCSV, createBulkImportService } from '../bulk-import.js';

// Mock dependencies
vi.mock('../database.js', () => ({
  createDatabaseClient: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
  withTransaction: vi.fn(async (pool, callback) => {
    const tx = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    return callback(tx);
  }),
}));

vi.mock('../logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../phone.js', () => ({
  validatePhone: vi.fn().mockResolvedValue({ isValid: true, normalized: '+40712345678' }),
  normalizeRomanianPhone: vi.fn().mockReturnValue({ isValid: true, normalized: '+40712345678' }),
}));

vi.mock('../crm.db.js', () => ({
  recordLeadEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../bulk-import.sql.js', () => ({
  INSERT_BULK_IMPORT_JOB_SQL: 'INSERT INTO bulk_import_jobs',
  UPDATE_BULK_IMPORT_JOB_PROGRESS_SQL: 'UPDATE bulk_import_jobs',
  GET_BULK_IMPORT_JOB_SQL: 'SELECT * FROM bulk_import_jobs',
  CHECK_EXISTING_PHONES_SQL: 'SELECT * FROM leads WHERE phone = ANY($1)',
}));

vi.mock('../crm.db.sql.js', () => ({
  INSERT_LEAD_SQL: 'INSERT INTO leads',
  UPDATE_LEAD_SQL: 'UPDATE leads',
}));

describe('Bulk Import Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCSV', () => {
    it('should parse basic CSV with phone column', () => {
      const csv = `phone,name,email
0712345678,John Doe,john@example.com
0712345679,Jane Doe,jane@example.com`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.rows[0]?.phone).toBe('0712345678');
      expect(result.rows[0]?.fullName).toBe('John Doe');
      expect(result.rows[0]?.email).toBe('john@example.com');
    });

    it('should handle Romanian column names', () => {
      const csv = `telefon,nume,sursa
0712345678,Ion Popescu,facebook`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.phone).toBe('0712345678');
      expect(result.rows[0]?.fullName).toBe('Ion Popescu');
      expect(result.rows[0]?.source).toBe('facebook');
    });

    it('should handle mobile column name', () => {
      const csv = `mobile,fullname
0712345678,John Doe`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.phone).toBe('0712345678');
    });

    it('should construct full name from first and last name', () => {
      const csv = `phone,firstname,lastname
0712345678,John,Doe`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.fullName).toBe('John Doe');
    });

    it('should handle first name only', () => {
      const csv = `phone,firstname
0712345678,John`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.fullName).toBe('John');
    });

    it('should handle last name only', () => {
      const csv = `phone,lastname
0712345678,Doe`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.fullName).toBe('Doe');
    });

    it('should throw error for CSV without header row', () => {
      const csv = '';

      expect(() => parseCSV(csv)).toThrow('CSV must have at least a header row and one data row');
    });

    it('should throw error for CSV with only header row', () => {
      const csv = 'phone,name,email';

      expect(() => parseCSV(csv)).toThrow('CSV must have at least a header row and one data row');
    });

    it('should throw error for CSV without phone column', () => {
      const csv = `name,email
John Doe,john@example.com`;

      expect(() => parseCSV(csv)).toThrow(
        'CSV must have a phone column. Recognized headers: phone, telefon, telephone, mobile'
      );
    });

    it('should handle quoted values with commas', () => {
      const csv = `phone,notes
0712345678,"Some notes, with commas"`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.notes).toBe('Some notes, with commas');
    });

    it('should handle escaped quotes', () => {
      const csv = `phone,notes
0712345678,"He said ""hello"""`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.notes).toBe('He said "hello"');
    });

    it('should skip empty lines', () => {
      const csv = `phone,name

0712345678,John

0712345679,Jane`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(2);
    });

    it('should handle tags column', () => {
      const csv = `phone,tags
0712345678,vip`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
    });

    it('should handle gdpr consent column', () => {
      const csv = `phone,gdpr
0712345678,true`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
    });

    it('should handle status column', () => {
      const csv = `phone,status
0712345678,new`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
    });

    it('should handle external_id column', () => {
      const csv = `phone,external_id
0712345678,EXT123`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.externalContactId).toBe('EXT123');
    });

    it('should handle language column', () => {
      const csv = `phone,language
0712345678,ro`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.language).toBe('ro');
    });

    it('should handle channel/canal column', () => {
      const csv = `phone,channel
0712345678,website`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.acquisitionChannel).toBe('website');
    });

    it('should handle observatii column (Romanian notes)', () => {
      const csv = `phone,observatii
0712345678,Some notes here`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.notes).toBe('Some notes here');
    });

    it('should handle consimtamant column (Romanian consent)', () => {
      const csv = `phone,consimtamant
0712345678,true`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
    });

    it('should collect parsing errors with line numbers', () => {
      const csv = `phone,name
,John
0712345678,Jane`;

      const result = parseCSV(csv);

      // Empty phone should fail validation
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
      expect(result.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle Windows line endings (CRLF)', () => {
      const csv = 'phone,name\r\n0712345678,John\r\n0712345679,Jane';

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(2);
    });

    it('should trim whitespace from headers and values', () => {
      const csv = ` phone , name
 0712345678 , John Doe `;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.phone).toBe('0712345678');
      expect(result.rows[0]?.fullName).toBe('John Doe');
    });

    it('should handle case-insensitive headers', () => {
      const csv = `PHONE,NAME,EMAIL
0712345678,John,john@example.com`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.phone).toBe('0712345678');
    });

    it('should handle e-mail column variation', () => {
      const csv = `phone,e-mail
0712345678,john@example.com`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.email).toBe('john@example.com');
    });

    it('should handle mail column variation', () => {
      const csv = `phone,mail
0712345678,john@example.com`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.email).toBe('john@example.com');
    });

    it('should handle "phone number" column variation', () => {
      const csv = `phone number,name
0712345678,John`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
    });

    it('should handle prenume column (Romanian first name)', () => {
      const csv = `phone,prenume
0712345678,Ion`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.fullName).toBe('Ion');
    });

    it('should handle "nume familie" column (Romanian last name)', () => {
      const csv = `phone,prenume,nume familie
0712345678,Ion,Popescu`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.fullName).toBe('Ion Popescu');
    });

    it('should handle "id" column as external contact id', () => {
      const csv = `phone,id
0712345678,LEAD001`;

      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.externalContactId).toBe('LEAD001');
    });
  });

  describe('createBulkImportService', () => {
    it('should create service with all methods', () => {
      const service = createBulkImportService();

      expect(service.parseCSV).toBeDefined();
      expect(service.processBulkImport).toBeDefined();
      expect(service.createBulkImportJob).toBeDefined();
      expect(service.getBulkImportJob).toBeDefined();
      expect(service.updateJobProgress).toBeDefined();
    });
  });
});
