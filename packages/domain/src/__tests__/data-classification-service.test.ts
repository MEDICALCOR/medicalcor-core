/**
 * @fileoverview Data Classification Service Tests
 *
 * Tests for the Data Classification Service that manages
 * HIPAA/GDPR compliance through data classification tracking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DataClassificationService,
  createDataClassificationService,
  type DataClassificationServiceOptions,
  type ClassificationLogger,
} from '../data-classification/data-classification-service.js';
import type { DataClassificationRepository } from '../data-classification/data-classification-repository.js';
import type {
  TableClassification,
  CreateTableClassification,
  ClassificationSummary,
  ComplianceGap,
  ColumnClassification,
} from '@medicalcor/types';

// ============================================================================
// MOCK HELPERS
// ============================================================================

function createMockRepository(): DataClassificationRepository {
  return {
    findByTable: vi.fn(),
    findAll: vi.fn(),
    findByFilters: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findTablesWithPii: vi.fn(),
    findTablesWithPhi: vi.fn(),
    findBySensitivityLevel: vi.fn(),
    findByComplianceFramework: vi.fn(),
    getSummary: vi.fn(),
    getComplianceGaps: vi.fn(),
    getStaleReviews: vi.fn(),
    markAsReviewed: vi.fn(),
    isColumnPii: vi.fn(),
    getColumnClassifications: vi.fn(),
  };
}

function createMockLogger(): ClassificationLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createTestClassification(
  overrides: Partial<TableClassification> = {}
): TableClassification {
  return {
    id: 'test-id',
    tableName: 'test_table',
    schemaName: 'public',
    description: 'Test table description',
    sensitivityLevel: 'internal',
    containsPii: false,
    containsPhi: false,
    containsFinancial: false,
    dataOwner: 'test-owner',
    complianceFrameworks: [],
    retentionPolicyId: null,
    accessRestrictions: [],
    columns: [],
    rlsEnabled: false,
    encryptionRequirement: 'none',
    backupRequired: true,
    softDeleteEnabled: true,
    lastReviewedAt: null,
    lastReviewedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestInput(
  overrides: Partial<CreateTableClassification> = {}
): CreateTableClassification {
  return {
    tableName: 'new_table',
    schemaName: 'public',
    description: 'New table description',
    sensitivityLevel: 'internal',
    containsPii: false,
    containsPhi: false,
    containsFinancial: false,
    dataOwner: 'test-owner',
    complianceFrameworks: [],
    retentionPolicyId: null,
    accessRestrictions: [],
    columns: [],
    rlsEnabled: false,
    encryptionRequirement: 'none',
    backupRequired: true,
    softDeleteEnabled: true,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('DataClassificationService', () => {
  let repository: DataClassificationRepository;
  let logger: ClassificationLogger;
  let service: DataClassificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createMockRepository();
    logger = createMockLogger();
    service = new DataClassificationService({
      repository,
      logger,
    });
  });

  // ==========================================================================
  // Constructor and Factory
  // ==========================================================================

  describe('constructor', () => {
    it('should create service with default config', () => {
      const svc = new DataClassificationService({ repository });
      expect(svc).toBeDefined();
    });

    it('should create service with custom config', () => {
      const svc = new DataClassificationService({
        repository,
        config: {
          staleReviewDays: 30,
          autoDetectPii: false,
        },
      });
      expect(svc).toBeDefined();
    });
  });

  describe('createDataClassificationService', () => {
    it('should create service using factory function', () => {
      const svc = createDataClassificationService({ repository });
      expect(svc).toBeInstanceOf(DataClassificationService);
    });
  });

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  describe('getTableClassification', () => {
    it('should return classification for existing table', async () => {
      const mockClassification = createTestClassification();
      (repository.findByTable as ReturnType<typeof vi.fn>).mockResolvedValue(mockClassification);

      const result = await service.getTableClassification('test_table');

      expect(result).toEqual(mockClassification);
      expect(repository.findByTable).toHaveBeenCalledWith('test_table', 'public');
    });

    it('should return null for non-existent table', async () => {
      (repository.findByTable as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.getTableClassification('non_existent');

      expect(result).toBeNull();
    });

    it('should use custom schema name', async () => {
      await service.getTableClassification('my_table', 'custom_schema');

      expect(repository.findByTable).toHaveBeenCalledWith('my_table', 'custom_schema');
    });
  });

  describe('getAllClassifications', () => {
    it('should return all classifications', async () => {
      const mockClassifications = [
        createTestClassification({ tableName: 'table1' }),
        createTestClassification({ tableName: 'table2' }),
      ];
      (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(mockClassifications);

      const result = await service.getAllClassifications();

      expect(result).toHaveLength(2);
      expect(result[0].tableName).toBe('table1');
      expect(result[1].tableName).toBe('table2');
    });

    it('should return empty array when no classifications', async () => {
      (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.getAllClassifications();

      expect(result).toEqual([]);
    });
  });

  describe('upsertClassification', () => {
    it('should create new classification', async () => {
      const input = createTestInput({ tableName: 'new_table' });
      const savedClassification = createTestClassification({ tableName: 'new_table' });
      (repository.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(savedClassification);

      const result = await service.upsertClassification(input);

      expect(result.tableName).toBe('new_table');
      expect(logger.info).toHaveBeenCalled();
    });

    it('should auto-detect PII from column names', async () => {
      const input = createTestInput({
        columns: [
          {
            columnName: 'email',
            dataType: 'varchar',
            isPii: false,
            isPhi: false,
            sensitivityLevel: 'public',
            redactInLogs: false,
          },
        ],
      });
      (repository.upsert as ReturnType<typeof vi.fn>).mockImplementation((c) =>
        Promise.resolve(createTestClassification(c))
      );

      await service.upsertClassification(input);

      // The service should auto-detect email as PII
      const callArg = (repository.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.columns[0].isPii).toBe(true);
      expect(callArg.containsPii).toBe(true);
    });

    it('should auto-detect PHI from column names', async () => {
      const input = createTestInput({
        columns: [
          {
            columnName: 'diagnosis_code',
            dataType: 'varchar',
            isPii: false,
            isPhi: false,
            sensitivityLevel: 'internal',
            redactInLogs: false,
          },
        ],
      });
      (repository.upsert as ReturnType<typeof vi.fn>).mockImplementation((c) =>
        Promise.resolve(createTestClassification(c))
      );

      await service.upsertClassification(input);

      const callArg = (repository.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.columns[0].isPhi).toBe(true);
      expect(callArg.containsPhi).toBe(true);
    });

    it('should add compliance frameworks based on data types', async () => {
      const input = createTestInput({
        containsPii: true,
        containsPhi: true,
        complianceFrameworks: [],
      });
      (repository.upsert as ReturnType<typeof vi.fn>).mockImplementation((c) =>
        Promise.resolve(createTestClassification(c))
      );

      await service.upsertClassification(input);

      const callArg = (repository.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArg.complianceFrameworks).toContain('GDPR');
      expect(callArg.complianceFrameworks).toContain('HIPAA');
    });
  });

  describe('updateClassification', () => {
    it('should update existing classification', async () => {
      const update = { tableName: 'test_table', description: 'Updated description' };
      const updatedClassification = createTestClassification(update);
      (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedClassification);

      const result = await service.updateClassification(update);

      expect(result.description).toBe('Updated description');
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('deleteClassification', () => {
    it('should delete classification', async () => {
      (repository.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.deleteClassification('test_table');

      expect(repository.delete).toHaveBeenCalledWith('test_table', 'public');
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('markAsReviewed', () => {
    it('should mark classification as reviewed', async () => {
      (repository.markAsReviewed as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await service.markAsReviewed('test_table', 'reviewer@example.com');

      expect(repository.markAsReviewed).toHaveBeenCalledWith('test_table', 'reviewer@example.com');
      expect(logger.info).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  describe('getTablesWithPii', () => {
    it('should return tables containing PII', async () => {
      const piiTables = [
        createTestClassification({ tableName: 'users', containsPii: true }),
        createTestClassification({ tableName: 'contacts', containsPii: true }),
      ];
      (repository.findTablesWithPii as ReturnType<typeof vi.fn>).mockResolvedValue(piiTables);

      const result = await service.getTablesWithPii();

      expect(result).toHaveLength(2);
      expect(result.every((t) => t.containsPii)).toBe(true);
    });
  });

  describe('getTablesWithPhi', () => {
    it('should return tables containing PHI', async () => {
      const phiTables = [
        createTestClassification({ tableName: 'medical_records', containsPhi: true }),
      ];
      (repository.findTablesWithPhi as ReturnType<typeof vi.fn>).mockResolvedValue(phiTables);

      const result = await service.getTablesWithPhi();

      expect(result).toHaveLength(1);
      expect(result[0].containsPhi).toBe(true);
    });
  });

  describe('getTablesBySensitivity', () => {
    it('should return tables by sensitivity level', async () => {
      const highTables = [createTestClassification({ sensitivityLevel: 'restricted' })];
      (repository.findBySensitivityLevel as ReturnType<typeof vi.fn>).mockResolvedValue(highTables);

      const result = await service.getTablesBySensitivity('restricted');

      expect(result).toHaveLength(1);
      expect(result[0].sensitivityLevel).toBe('restricted');
    });
  });

  // ==========================================================================
  // Compliance Reporting
  // ==========================================================================

  describe('getSummary', () => {
    it('should return classification summary', async () => {
      const summary: ClassificationSummary = {
        totalTables: 10,
        tablesWithPii: 3,
        tablesWithPhi: 2,
        tablesWithFinancial: 1,
        bySensitivityLevel: {
          public: 2,
          internal: 5,
          confidential: 2,
          restricted: 1,
        },
        tablesNeedingReview: 2,
        tablesWithRls: 4,
        tablesWithEncryption: 3,
      };
      (repository.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue(summary);

      const result = await service.getSummary();

      expect(result.totalTables).toBe(10);
      expect(result.tablesWithPii).toBe(3);
    });
  });

  describe('getComplianceGaps', () => {
    it('should return compliance gaps from repository', async () => {
      const repositoryGaps: ComplianceGap[] = [
        {
          tableName: 'test_table',
          gapType: 'missing_rls',
          severity: 'high',
          description: 'RLS not enabled',
          remediation: 'Enable RLS',
          affectedFrameworks: ['GDPR'],
        },
      ];
      (repository.getComplianceGaps as ReturnType<typeof vi.fn>).mockResolvedValue(repositoryGaps);
      (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await service.getComplianceGaps();

      expect(result).toHaveLength(1);
      expect(result[0].gapType).toBe('missing_rls');
    });

    it('should detect additional gaps for PII tables without soft delete', async () => {
      (repository.getComplianceGaps as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([
        createTestClassification({
          tableName: 'users',
          containsPii: true,
          softDeleteEnabled: false,
        }),
      ]);

      const result = await service.getComplianceGaps();

      expect(result.some((g) => g.gapType === 'missing_soft_delete')).toBe(true);
    });

    it('should detect missing column classifications', async () => {
      (repository.getComplianceGaps as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([
        createTestClassification({
          tableName: 'users',
          containsPii: true,
          columns: [], // No column classifications
        }),
      ]);

      const result = await service.getComplianceGaps();

      expect(result.some((g) => g.gapType === 'missing_column_classification')).toBe(true);
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate comprehensive compliance report', async () => {
      const summary: ClassificationSummary = {
        totalTables: 5,
        tablesWithPii: 2,
        tablesWithPhi: 1,
        tablesWithFinancial: 0,
        bySensitivityLevel: { public: 1, internal: 3, confidential: 1, restricted: 0 },
        tablesNeedingReview: 1,
        tablesWithRls: 3,
        tablesWithEncryption: 2,
      };
      (repository.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue(summary);
      (repository.getComplianceGaps as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (repository.getStaleReviews as ReturnType<typeof vi.fn>).mockResolvedValue(['old_table']);
      (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const report = await service.generateComplianceReport();

      expect(report.summary.totalTables).toBe(5);
      expect(report.staleReviews).toContain('old_table');
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(logger.info).toHaveBeenCalled();
    });

    it('should identify high-risk PHI tables', async () => {
      const phiTableWithoutEncryption = createTestClassification({
        tableName: 'medical_records',
        containsPhi: true,
        encryptionRequirement: 'none',
        rlsEnabled: true,
      });

      (repository.getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
        totalTables: 1,
        tablesWithPii: 0,
        tablesWithPhi: 1,
        tablesWithFinancial: 0,
        bySensitivityLevel: { public: 0, internal: 0, confidential: 0, restricted: 1 },
        tablesNeedingReview: 0,
        tablesWithRls: 1,
        tablesWithEncryption: 0,
      });
      (repository.getComplianceGaps as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (repository.getStaleReviews as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue([
        phiTableWithoutEncryption,
      ]);

      const report = await service.generateComplianceReport();

      expect(report.highRiskTables).toContain('medical_records');
    });
  });

  // ==========================================================================
  // HIPAA/GDPR Audit Support
  // ==========================================================================

  describe('getHipaaInventory', () => {
    it('should return all PHI tables for HIPAA audit', async () => {
      const phiTables = [createTestClassification({ containsPhi: true })];
      (repository.findTablesWithPhi as ReturnType<typeof vi.fn>).mockResolvedValue(phiTables);

      const result = await service.getHipaaInventory();

      expect(result).toEqual(phiTables);
    });
  });

  describe('getGdprArticle30Inventory', () => {
    it('should return all PII and GDPR-marked tables', async () => {
      const allClassifications = [
        createTestClassification({ tableName: 'users', containsPii: true }),
        createTestClassification({
          tableName: 'audit_logs',
          containsPii: false,
          complianceFrameworks: ['GDPR'],
        }),
        createTestClassification({ tableName: 'config', containsPii: false }),
      ];
      (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(allClassifications);

      const result = await service.getGdprArticle30Inventory();

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.tableName)).toContain('users');
      expect(result.map((r) => r.tableName)).toContain('audit_logs');
    });
  });

  describe('validateTableCompliance', () => {
    it('should return non-compliant when table has no classification', async () => {
      (repository.findByTable as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await service.validateTableCompliance('unknown_table');

      expect(result.compliant).toBe(false);
      expect(result.issues).toContain('Table has no classification - needs review');
    });

    it('should detect PHI table without encryption', async () => {
      const phiTable = createTestClassification({
        containsPhi: true,
        encryptionRequirement: 'none',
        rlsEnabled: true,
        complianceFrameworks: ['HIPAA'],
        lastReviewedAt: new Date().toISOString(),
      });
      (repository.findByTable as ReturnType<typeof vi.fn>).mockResolvedValue(phiTable);

      const result = await service.validateTableCompliance('medical_records');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('encryption'))).toBe(true);
    });

    it('should detect PHI table without RLS', async () => {
      const phiTable = createTestClassification({
        containsPhi: true,
        encryptionRequirement: 'at_rest',
        rlsEnabled: false,
        complianceFrameworks: ['HIPAA'],
        lastReviewedAt: new Date().toISOString(),
      });
      (repository.findByTable as ReturnType<typeof vi.fn>).mockResolvedValue(phiTable);

      const result = await service.validateTableCompliance('medical_records');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('RLS'))).toBe(true);
    });

    it('should detect missing HIPAA framework for PHI', async () => {
      const phiTable = createTestClassification({
        containsPhi: true,
        encryptionRequirement: 'at_rest',
        rlsEnabled: true,
        complianceFrameworks: [],
        lastReviewedAt: new Date().toISOString(),
      });
      (repository.findByTable as ReturnType<typeof vi.fn>).mockResolvedValue(phiTable);

      const result = await service.validateTableCompliance('medical_records');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('HIPAA'))).toBe(true);
    });

    it('should detect stale review', async () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 100); // 100 days ago

      const staleTable = createTestClassification({
        lastReviewedAt: staleDate.toISOString(),
      });
      (repository.findByTable as ReturnType<typeof vi.fn>).mockResolvedValue(staleTable);

      const result = await service.validateTableCompliance('old_table');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('stale'))).toBe(true);
    });

    it('should return compliant for properly configured table', async () => {
      const compliantTable = createTestClassification({
        containsPii: false,
        containsPhi: false,
        lastReviewedAt: new Date().toISOString(),
      });
      (repository.findByTable as ReturnType<typeof vi.fn>).mockResolvedValue(compliantTable);

      const result = await service.validateTableCompliance('config_table');

      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Column Operations
  // ==========================================================================

  describe('isColumnPii', () => {
    it('should check if column is PII', async () => {
      (repository.isColumnPii as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await service.isColumnPii('users', 'email');

      expect(result).toBe(true);
      expect(repository.isColumnPii).toHaveBeenCalledWith('users', 'email');
    });
  });

  describe('getColumnClassifications', () => {
    it('should return column classifications for table', async () => {
      const columns: ColumnClassification[] = [
        {
          columnName: 'email',
          dataType: 'varchar',
          isPii: true,
          isPhi: false,
          sensitivityLevel: 'confidential',
          redactInLogs: true,
        },
      ];
      (repository.getColumnClassifications as ReturnType<typeof vi.fn>).mockResolvedValue(columns);

      const result = await service.getColumnClassifications('users');

      expect(result).toHaveLength(1);
      expect(result[0].isPii).toBe(true);
    });
  });
});
