/**
 * @fileoverview Tests for PostgreSQL Data Classification Repository
 *
 * Tests CRUD operations, compliance reporting, and column classification queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostgresDataClassificationRepository,
  createDataClassificationRepository,
} from '../PostgresDataClassificationRepository.js';
import type { Pool } from 'pg';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockPool(): Pool & {
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    release: vi.fn(),
  } as unknown as Pool & { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
}

function createMockClassificationRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'class-123',
    table_name: 'leads',
    schema_name: 'public',
    sensitivity_level: 'restricted',
    contains_pii: true,
    contains_phi: false,
    contains_financial: false,
    compliance_frameworks: ['GDPR', 'SOC2'],
    encryption_requirement: 'required',
    retention_category: 'customer_data',
    rls_enabled: true,
    soft_delete_enabled: true,
    columns: [
      { name: 'phone', isPii: true, piiType: 'phone' },
      { name: 'email', isPii: true, piiType: 'email' },
    ],
    description: 'Lead contact information',
    compliance_notes: null,
    last_reviewed_at: now,
    reviewed_by: 'admin-user',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function createMockComplianceGapRow(overrides = {}) {
  return {
    table_name: 'audit_logs',
    gap_type: 'missing_encryption',
    severity: 'high',
    description: 'Table contains PHI but lacks encryption requirement',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PostgresDataClassificationRepository', () => {
  let mockPool: Pool & { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  let repository: PostgresDataClassificationRepository;

  beforeEach(() => {
    mockPool = createMockPool();
    repository = new PostgresDataClassificationRepository({ pool: mockPool });
    vi.clearAllMocks();
  });

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  describe('constructor', () => {
    it('should create repository with pool', () => {
      const repo = new PostgresDataClassificationRepository({ pool: mockPool });
      expect(repo).toBeInstanceOf(PostgresDataClassificationRepository);
    });

    it('should create repository with connection string', () => {
      const repo = new PostgresDataClassificationRepository({
        connectionString: 'postgresql://test:test@localhost/test',
      });
      expect(repo).toBeInstanceOf(PostgresDataClassificationRepository);
    });

    it('should throw error without pool or connectionString', () => {
      expect(() => new PostgresDataClassificationRepository({})).toThrow(
        'Either connectionString or pool must be provided'
      );
    });
  });

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  describe('findByTable', () => {
    it('should find classification by table name', async () => {
      const mockRow = createMockClassificationRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.findByTable('leads');

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('table_name = $1'), [
        'leads',
        'public',
      ]);
      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('leads');
      expect(result!.containsPii).toBe(true);
    });

    it('should return null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.findByTable('nonexistent');

      expect(result).toBeNull();
    });

    it('should support custom schema', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.findByTable('my_table', 'custom_schema');

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [
        'my_table',
        'custom_schema',
      ]);
    });
  });

  describe('findAll', () => {
    it('should return all classifications', async () => {
      const mockRows = [
        createMockClassificationRow({ table_name: 'leads' }),
        createMockClassificationRow({ table_name: 'patients' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]!.tableName).toBe('leads');
    });
  });

  describe('findByFilters', () => {
    it('should filter by sensitivity level', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockClassificationRow()] });

      await repository.findByFilters({ sensitivityLevel: 'restricted' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('sensitivity_level = $'),
        ['restricted']
      );
    });

    it('should filter by contains PII', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockClassificationRow()] });

      await repository.findByFilters({ containsPii: true });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('contains_pii = $'), [
        true,
      ]);
    });

    it('should filter by compliance framework', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockClassificationRow()] });

      await repository.findByFilters({ complianceFramework: 'HIPAA' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ANY(compliance_frameworks)'),
        ['HIPAA']
      );
    });

    it('should filter by table name search', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockClassificationRow()] });

      await repository.findByFilters({ tableNameSearch: 'lead' });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('table_name ILIKE'), [
        '%lead%',
      ]);
    });

    it('should combine multiple filters', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await repository.findByFilters({
        sensitivityLevel: 'restricted',
        containsPhi: true,
        rlsEnabled: true,
      });

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('sensitivity_level'), [
        'restricted',
        true,
        true,
      ]);
    });
  });

  describe('upsert', () => {
    it('should insert new classification', async () => {
      const mockRow = createMockClassificationRow();
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.upsert({
        tableName: 'leads',
        schemaName: 'public',
        sensitivityLevel: 'restricted',
        containsPii: true,
        containsPhi: false,
        containsFinancial: false,
        complianceFrameworks: ['GDPR', 'SOC2'],
        encryptionRequirement: 'required',
        retentionCategory: 'customer_data',
        rlsEnabled: true,
        softDeleteEnabled: true,
        columns: [],
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO data_classification'),
        expect.any(Array)
      );
      expect(result.tableName).toBe('leads');
    });

    it('should throw error when upsert fails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.upsert({
          tableName: 'test',
          schemaName: 'public',
          sensitivityLevel: 'public',
          containsPii: false,
          containsPhi: false,
          containsFinancial: false,
          complianceFrameworks: [],
          encryptionRequirement: 'none',
          retentionCategory: 'operational',
          rlsEnabled: false,
          softDeleteEnabled: false,
          columns: [],
        })
      ).rejects.toThrow('Failed to upsert classification');
    });
  });

  describe('update', () => {
    it('should update classification fields', async () => {
      const mockRow = createMockClassificationRow({ rls_enabled: true });
      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await repository.update({
        tableName: 'leads',
        rlsEnabled: true,
        sensitivityLevel: 'confidential',
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE data_classification'),
        expect.any(Array)
      );
      expect(result.rlsEnabled).toBe(true);
    });

    it('should throw error when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.update({ tableName: 'nonexistent', rlsEnabled: true })
      ).rejects.toThrow('Classification not found');
    });
  });

  describe('delete', () => {
    it('should delete classification', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(repository.delete('leads')).resolves.not.toThrow();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM data_classification'),
        ['leads', 'public']
      );
    });
  });

  // ==========================================================================
  // QUERY OPERATIONS
  // ==========================================================================

  describe('findTablesWithPii', () => {
    it('should find tables containing PII', async () => {
      const mockRows = [createMockClassificationRow({ table_name: 'leads', contains_pii: true })];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.findTablesWithPii();

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('contains_pii = true'));
      expect(result).toHaveLength(1);
    });
  });

  describe('findTablesWithPhi', () => {
    it('should find tables containing PHI', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.findTablesWithPhi();

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('contains_phi = true'));
      expect(result).toHaveLength(0);
    });
  });

  describe('findBySensitivityLevel', () => {
    it('should find by sensitivity level', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockClassificationRow()] });

      const result = await repository.findBySensitivityLevel('restricted');

      expect(result).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('sensitivity_level = $1'),
        ['restricted']
      );
    });
  });

  describe('findByComplianceFramework', () => {
    it('should find tables by compliance framework', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [createMockClassificationRow()] });

      const result = await repository.findByComplianceFramework('GDPR');

      expect(result).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ANY(compliance_frameworks)'),
        ['GDPR']
      );
    });
  });

  // ==========================================================================
  // COMPLIANCE REPORTING
  // ==========================================================================

  describe('getSummary', () => {
    it('should return comprehensive summary', async () => {
      // Totals
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            total_tables: '25',
            tables_with_pii: '15',
            tables_with_phi: '8',
            tables_with_financial: '3',
            tables_with_rls: '20',
            tables_with_encryption: '12',
          },
        ],
      });
      // By sensitivity
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { sensitivity_level: 'restricted', count: '10' },
          { sensitivity_level: 'confidential', count: '8' },
        ],
      });
      // By framework
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { framework: 'GDPR', count: '15' },
          { framework: 'HIPAA', count: '8' },
        ],
      });
      // By retention
      mockPool.query.mockResolvedValueOnce({
        rows: [{ retention_category: 'customer_data', count: '12' }],
      });

      const result = await repository.getSummary();

      expect(result.totalTables).toBe(25);
      expect(result.tablesWithPii).toBe(15);
      expect(result.tablesWithPhi).toBe(8);
      expect(result.bySensitivityLevel.restricted).toBe(10);
      expect(result.byComplianceFramework.GDPR).toBe(15);
    });
  });

  describe('getComplianceGaps', () => {
    it('should return compliance gaps', async () => {
      const mockRows = [
        createMockComplianceGapRow(),
        createMockComplianceGapRow({ gap_type: 'missing_rls', severity: 'medium' }),
      ];
      mockPool.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await repository.getComplianceGaps();

      expect(result).toHaveLength(2);
      expect(result[0]!.gapType).toBe('missing_encryption');
      expect(result[0]!.severity).toBe('high');
      expect(result[0]!.remediation).toContain('encryption');
      expect(result[0]!.affectedFrameworks).toContain('HIPAA');
    });
  });

  describe('getStaleReviews', () => {
    it('should return tables needing review', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ table_name: 'old_table_1' }, { table_name: 'old_table_2' }],
      });

      const result = await repository.getStaleReviews();

      expect(result).toHaveLength(2);
      expect(result).toContain('old_table_1');
    });
  });

  describe('markAsReviewed', () => {
    it('should mark table as reviewed', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(repository.markAsReviewed('leads', 'admin-user')).resolves.not.toThrow();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('last_reviewed_at = NOW()'),
        ['admin-user', 'leads']
      );
    });
  });

  // ==========================================================================
  // COLUMN OPERATIONS
  // ==========================================================================

  describe('isColumnPii', () => {
    it('should check if column is PII', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_pii: true }] });

      const result = await repository.isColumnPii('leads', 'phone');

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('is_column_pii'), [
        'leads',
        'phone',
      ]);
    });

    it('should return false for non-PII column', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_pii: false }] });

      const result = await repository.isColumnPii('leads', 'created_at');

      expect(result).toBe(false);
    });

    it('should return false when no result', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.isColumnPii('nonexistent', 'column');

      expect(result).toBe(false);
    });
  });

  describe('getColumnClassifications', () => {
    it('should return column classifications', async () => {
      const columns = [
        { name: 'phone', isPii: true, piiType: 'phone' },
        { name: 'email', isPii: true, piiType: 'email' },
      ];
      mockPool.query.mockResolvedValueOnce({ rows: [{ columns }] });

      const result = await repository.getColumnClassifications('leads');

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('phone');
    });

    it('should return empty array when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getColumnClassifications('nonexistent');

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // CLOSE
  // ==========================================================================

  describe('close', () => {
    it('should close owned pool', async () => {
      const repoWithOwnPool = new PostgresDataClassificationRepository({
        connectionString: 'postgresql://test:test@localhost/test',
      });

      // Access private pool through any
      const pool = (repoWithOwnPool as any).pool;
      pool.end = vi.fn().mockResolvedValue(undefined);

      await repoWithOwnPool.close();

      expect(pool.end).toHaveBeenCalled();
    });

    it('should not close injected pool', async () => {
      await repository.close();

      expect(mockPool.end).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createDataClassificationRepository', () => {
  it('should create a repository instance', () => {
    const mockPool = createMockPool();
    const repo = createDataClassificationRepository({ pool: mockPool });

    expect(repo).toBeInstanceOf(PostgresDataClassificationRepository);
  });
});
