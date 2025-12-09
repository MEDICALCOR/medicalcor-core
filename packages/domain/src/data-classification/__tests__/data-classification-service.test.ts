/**
 * @fileoverview Tests for Data Classification Service
 *
 * Tests for HIPAA/GDPR compliance data classification functionality.
 * Covers CRUD operations, compliance reporting, and validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DataClassificationService,
  createDataClassificationService,
  type ClassificationLogger,
  type DataClassificationConfig,
} from '../data-classification-service.js';
import type { DataClassificationRepository } from '../data-classification-repository.js';
import type {
  TableClassification,
  CreateTableClassification,
  UpdateTableClassification,
  ClassificationSummary,
  ComplianceGap,
  ColumnClassification,
} from '@medicalcor/types';

// Mock repository factory
function createMockRepository(
  overrides: Partial<DataClassificationRepository> = {}
): DataClassificationRepository {
  return {
    findByTable: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    findByFilters: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockImplementation((c) =>
      Promise.resolve({
        ...c,
        lastReviewedAt: undefined,
        reviewedBy: undefined,
      })
    ),
    update: vi.fn().mockImplementation((c) => Promise.resolve(c)),
    delete: vi.fn().mockResolvedValue(undefined),
    findTablesWithPii: vi.fn().mockResolvedValue([]),
    findTablesWithPhi: vi.fn().mockResolvedValue([]),
    findBySensitivityLevel: vi.fn().mockResolvedValue([]),
    findByComplianceFramework: vi.fn().mockResolvedValue([]),
    getSummary: vi.fn().mockResolvedValue(createMockSummary()),
    getComplianceGaps: vi.fn().mockResolvedValue([]),
    getStaleReviews: vi.fn().mockResolvedValue([]),
    markAsReviewed: vi.fn().mockResolvedValue(undefined),
    isColumnPii: vi.fn().mockResolvedValue(false),
    getColumnClassifications: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// Mock logger factory
function createMockLogger(): ClassificationLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

// Mock table classification factory
function createMockTableClassification(
  overrides: Partial<TableClassification> = {}
): TableClassification {
  return {
    tableName: 'test_table',
    schemaName: 'public',
    sensitivityLevel: 'internal',
    containsPii: false,
    containsPhi: false,
    containsFinancial: false,
    complianceFrameworks: [],
    encryptionRequirement: 'none',
    retentionCategory: 'audit_logs',
    rlsEnabled: false,
    softDeleteEnabled: false,
    columns: [],
    ...overrides,
  };
}

// Mock summary factory
function createMockSummary(): ClassificationSummary {
  return {
    totalTables: 10,
    tablesWithPii: 5,
    tablesWithPhi: 3,
    tablesWithFinancial: 2,
    tablesWithRls: 4,
    tablesWithEncryption: 3,
    bySensitivityLevel: {
      public: 2,
      internal: 3,
      confidential: 2,
      restricted_pii: 2,
      phi: 1,
      financial: 0,
    },
    byComplianceFramework: {
      HIPAA: 3,
      GDPR: 5,
      CCPA: 2,
      PCI_DSS: 1,
      SOC2: 8,
      ISO27001: 1,
    },
    byRetentionCategory: {
      medical_records: 3,
      consent_records: 2,
      audit_logs: 5,
      marketing_leads: 0,
      communication_logs: 0,
      appointment_data: 0,
      financial_records: 0,
      session_data: 0,
      temporary: 0,
    },
    lastUpdatedAt: new Date(),
  };
}

describe('DataClassificationService', () => {
  let repository: DataClassificationRepository;
  let logger: ClassificationLogger;
  let service: DataClassificationService;

  beforeEach(() => {
    repository = createMockRepository();
    logger = createMockLogger();
    service = new DataClassificationService({ repository, logger });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with required options', () => {
      const svc = new DataClassificationService({ repository });
      expect(svc).toBeInstanceOf(DataClassificationService);
    });

    it('should create service with custom config', () => {
      const config: Partial<DataClassificationConfig> = {
        staleReviewDays: 60,
        autoDetectPii: false,
      };
      const svc = new DataClassificationService({ repository, config });
      expect(svc).toBeInstanceOf(DataClassificationService);
    });

    it('should create service using factory function', () => {
      const svc = createDataClassificationService({ repository });
      expect(svc).toBeInstanceOf(DataClassificationService);
    });
  });

  describe('CRUD Operations', () => {
    describe('getTableClassification', () => {
      it('should return null when table not found', async () => {
        const result = await service.getTableClassification('unknown_table');
        expect(result).toBeNull();
        expect(repository.findByTable).toHaveBeenCalledWith('unknown_table', 'public');
      });

      it('should return classification when found', async () => {
        const mockClassification = createMockTableClassification();
        vi.mocked(repository.findByTable).mockResolvedValue(mockClassification);

        const result = await service.getTableClassification('test_table');
        expect(result).toEqual(mockClassification);
      });

      it('should use custom schema name', async () => {
        await service.getTableClassification('test_table', 'custom_schema');
        expect(repository.findByTable).toHaveBeenCalledWith('test_table', 'custom_schema');
      });
    });

    describe('getAllClassifications', () => {
      it('should return empty array when no classifications', async () => {
        const result = await service.getAllClassifications();
        expect(result).toEqual([]);
      });

      it('should return all classifications', async () => {
        const classifications = [
          createMockTableClassification({ tableName: 'table1' }),
          createMockTableClassification({ tableName: 'table2' }),
        ];
        vi.mocked(repository.findAll).mockResolvedValue(classifications);

        const result = await service.getAllClassifications();
        expect(result).toHaveLength(2);
      });
    });

    describe('queryClassifications', () => {
      it('should query with filters', async () => {
        const filters = { containsPii: true };
        await service.queryClassifications(filters);
        expect(repository.findByFilters).toHaveBeenCalledWith(filters);
      });
    });

    describe('upsertClassification', () => {
      it('should create classification', async () => {
        const input: CreateTableClassification = {
          tableName: 'new_table',
          schemaName: 'public',
          sensitivityLevel: 'internal',
          containsPii: false,
          containsPhi: false,
          containsFinancial: false,
          complianceFrameworks: [],
          encryptionRequirement: 'none',
          retentionCategory: 'audit_logs',
          rlsEnabled: false,
          softDeleteEnabled: false,
          columns: [],
        };

        await service.upsertClassification(input);
        expect(repository.upsert).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalled();
      });

      it('should auto-detect PII from column names', async () => {
        const input: CreateTableClassification = {
          tableName: 'users',
          schemaName: 'public',
          sensitivityLevel: 'internal',
          containsPii: false,
          containsPhi: false,
          containsFinancial: false,
          complianceFrameworks: [],
          encryptionRequirement: 'none',
          retentionCategory: 'audit_logs',
          rlsEnabled: false,
          softDeleteEnabled: false,
          columns: [
            {
              columnName: 'email',
              sensitivityLevel: 'internal',
              isPii: false,
              isPhi: false,
              dataCategory: 'contact',
              isEncrypted: false,
              redactInLogs: false,
            },
          ],
        };

        await service.upsertClassification(input);

        // The upsert should have been called with enhanced classification
        const upsertCall = vi.mocked(repository.upsert).mock.calls[0][0];
        expect(upsertCall.columns[0].isPii).toBe(true);
        expect(upsertCall.containsPii).toBe(true);
      });

      it('should auto-detect PHI from column names', async () => {
        const input: CreateTableClassification = {
          tableName: 'patients',
          schemaName: 'public',
          sensitivityLevel: 'internal',
          containsPii: false,
          containsPhi: false,
          containsFinancial: false,
          complianceFrameworks: [],
          encryptionRequirement: 'none',
          retentionCategory: 'medical_records',
          rlsEnabled: false,
          softDeleteEnabled: false,
          columns: [
            {
              columnName: 'diagnosis_code',
              sensitivityLevel: 'internal',
              isPii: false,
              isPhi: false,
              dataCategory: 'health',
              isEncrypted: false,
              redactInLogs: false,
            },
          ],
        };

        await service.upsertClassification(input);

        const upsertCall = vi.mocked(repository.upsert).mock.calls[0][0];
        expect(upsertCall.columns[0].isPhi).toBe(true);
        expect(upsertCall.containsPhi).toBe(true);
      });

      it('should auto-add compliance frameworks for PII/PHI', async () => {
        const input: CreateTableClassification = {
          tableName: 'medical_records',
          schemaName: 'public',
          sensitivityLevel: 'phi',
          containsPii: true,
          containsPhi: true,
          containsFinancial: false,
          complianceFrameworks: [],
          encryptionRequirement: 'required',
          retentionCategory: 'medical_records',
          rlsEnabled: true,
          softDeleteEnabled: true,
          columns: [],
        };

        await service.upsertClassification(input);

        const upsertCall = vi.mocked(repository.upsert).mock.calls[0][0];
        expect(upsertCall.complianceFrameworks).toContain('GDPR');
        expect(upsertCall.complianceFrameworks).toContain('HIPAA');
        expect(upsertCall.complianceFrameworks).toContain('SOC2');
      });
    });

    describe('updateClassification', () => {
      it('should update classification', async () => {
        const update: UpdateTableClassification = {
          tableName: 'test_table',
          rlsEnabled: true,
        };

        vi.mocked(repository.update).mockResolvedValue(
          createMockTableClassification({ ...update })
        );

        await service.updateClassification(update);
        expect(repository.update).toHaveBeenCalledWith(update);
        expect(logger.info).toHaveBeenCalled();
      });
    });

    describe('deleteClassification', () => {
      it('should delete classification', async () => {
        await service.deleteClassification('test_table');
        expect(repository.delete).toHaveBeenCalledWith('test_table', 'public');
        expect(logger.info).toHaveBeenCalled();
      });

      it('should delete with custom schema', async () => {
        await service.deleteClassification('test_table', 'custom_schema');
        expect(repository.delete).toHaveBeenCalledWith('test_table', 'custom_schema');
      });
    });

    describe('markAsReviewed', () => {
      it('should mark table as reviewed', async () => {
        await service.markAsReviewed('test_table', 'user@example.com');
        expect(repository.markAsReviewed).toHaveBeenCalledWith('test_table', 'user@example.com');
        expect(logger.info).toHaveBeenCalled();
      });
    });
  });

  describe('Query Operations', () => {
    describe('getTablesWithPii', () => {
      it('should return tables with PII', async () => {
        const piiTables = [createMockTableClassification({ containsPii: true })];
        vi.mocked(repository.findTablesWithPii).mockResolvedValue(piiTables);

        const result = await service.getTablesWithPii();
        expect(result).toHaveLength(1);
        expect(result[0].containsPii).toBe(true);
      });
    });

    describe('getTablesWithPhi', () => {
      it('should return tables with PHI', async () => {
        const phiTables = [createMockTableClassification({ containsPhi: true })];
        vi.mocked(repository.findTablesWithPhi).mockResolvedValue(phiTables);

        const result = await service.getTablesWithPhi();
        expect(result).toHaveLength(1);
        expect(result[0].containsPhi).toBe(true);
      });
    });

    describe('getTablesBySensitivity', () => {
      it('should return tables by sensitivity level', async () => {
        const phiTables = [createMockTableClassification({ sensitivityLevel: 'phi' })];
        vi.mocked(repository.findBySensitivityLevel).mockResolvedValue(phiTables);

        const result = await service.getTablesBySensitivity('phi');
        expect(result).toHaveLength(1);
        expect(repository.findBySensitivityLevel).toHaveBeenCalledWith('phi');
      });
    });

    describe('getTablesByComplianceFramework', () => {
      it('should return tables by compliance framework', async () => {
        const hipaaTable = createMockTableClassification({ complianceFrameworks: ['HIPAA'] });
        vi.mocked(repository.findByComplianceFramework).mockResolvedValue([hipaaTable]);

        const result = await service.getTablesByComplianceFramework('HIPAA');
        expect(result).toHaveLength(1);
        expect(repository.findByComplianceFramework).toHaveBeenCalledWith('HIPAA');
      });
    });

    describe('isColumnPii', () => {
      it('should check if column is PII', async () => {
        vi.mocked(repository.isColumnPii).mockResolvedValue(true);

        const result = await service.isColumnPii('users', 'email');
        expect(result).toBe(true);
        expect(repository.isColumnPii).toHaveBeenCalledWith('users', 'email');
      });
    });

    describe('getColumnClassifications', () => {
      it('should return column classifications', async () => {
        const columns: ColumnClassification[] = [
          {
            columnName: 'email',
            sensitivityLevel: 'restricted_pii',
            isPii: true,
            isPhi: false,
            dataCategory: 'contact',
            isEncrypted: false,
            redactInLogs: true,
          },
        ];
        vi.mocked(repository.getColumnClassifications).mockResolvedValue(columns);

        const result = await service.getColumnClassifications('users');
        expect(result).toHaveLength(1);
        expect(result[0].columnName).toBe('email');
      });
    });
  });

  describe('Compliance Reporting', () => {
    describe('getSummary', () => {
      it('should return classification summary', async () => {
        const result = await service.getSummary();
        expect(result.totalTables).toBe(10);
        expect(result.tablesWithPii).toBe(5);
      });
    });

    describe('getComplianceGaps', () => {
      it('should return compliance gaps from repository', async () => {
        const gaps: ComplianceGap[] = [
          {
            tableName: 'test_table',
            gapType: 'missing_encryption',
            severity: 'high',
            description: 'PHI table missing encryption',
            remediation: 'Enable encryption',
            affectedFrameworks: ['HIPAA'],
          },
        ];
        vi.mocked(repository.getComplianceGaps).mockResolvedValue(gaps);

        const result = await service.getComplianceGaps();
        expect(result.length).toBeGreaterThanOrEqual(1);
      });

      it('should detect soft delete gaps for PII tables', async () => {
        const piiTableWithoutSoftDelete = createMockTableClassification({
          tableName: 'users',
          containsPii: true,
          softDeleteEnabled: false,
        });
        vi.mocked(repository.findAll).mockResolvedValue([piiTableWithoutSoftDelete]);

        const result = await service.getComplianceGaps();
        const softDeleteGap = result.find((g) => g.gapType === 'missing_soft_delete');
        expect(softDeleteGap).toBeDefined();
        expect(softDeleteGap?.tableName).toBe('users');
      });

      it('should detect missing column classification gaps', async () => {
        const piiTableNoColumns = createMockTableClassification({
          tableName: 'users',
          containsPii: true,
          columns: [],
        });
        vi.mocked(repository.findAll).mockResolvedValue([piiTableNoColumns]);

        const result = await service.getComplianceGaps();
        const columnGap = result.find((g) => g.gapType === 'missing_column_classification');
        expect(columnGap).toBeDefined();
      });
    });

    describe('getStaleReviews', () => {
      it('should return stale reviews', async () => {
        vi.mocked(repository.getStaleReviews).mockResolvedValue(['old_table']);

        const result = await service.getStaleReviews();
        expect(result).toContain('old_table');
      });
    });

    describe('generateComplianceReport', () => {
      it('should generate full compliance report', async () => {
        vi.mocked(repository.findAll).mockResolvedValue([]);
        vi.mocked(repository.getStaleReviews).mockResolvedValue(['stale_table']);

        const report = await service.generateComplianceReport();

        expect(report.generatedAt).toBeInstanceOf(Date);
        expect(report.summary).toBeDefined();
        expect(report.gaps).toBeInstanceOf(Array);
        expect(report.staleReviews).toContain('stale_table');
        expect(logger.info).toHaveBeenCalled();
      });

      it('should identify high-risk PHI tables without encryption', async () => {
        const phiTableNoEncryption = createMockTableClassification({
          tableName: 'medical_data',
          containsPhi: true,
          encryptionRequirement: 'none',
        });
        vi.mocked(repository.findAll).mockResolvedValue([phiTableNoEncryption]);

        const report = await service.generateComplianceReport();
        expect(report.highRiskTables).toContain('medical_data');
      });

      it('should identify high-risk PHI tables without RLS', async () => {
        const phiTableNoRls = createMockTableClassification({
          tableName: 'patient_records',
          containsPhi: true,
          encryptionRequirement: 'required',
          rlsEnabled: false,
        });
        vi.mocked(repository.findAll).mockResolvedValue([phiTableNoRls]);

        const report = await service.generateComplianceReport();
        expect(report.highRiskTables).toContain('patient_records');
      });
    });
  });

  describe('HIPAA/GDPR Audit Support', () => {
    describe('getHipaaInventory', () => {
      it('should return PHI tables for HIPAA audit', async () => {
        const phiTables = [createMockTableClassification({ containsPhi: true })];
        vi.mocked(repository.findTablesWithPhi).mockResolvedValue(phiTables);

        const result = await service.getHipaaInventory();
        expect(result).toHaveLength(1);
      });
    });

    describe('getGdprArticle30Inventory', () => {
      it('should return PII tables for GDPR Article 30', async () => {
        const tables = [
          createMockTableClassification({ containsPii: true }),
          createMockTableClassification({ complianceFrameworks: ['GDPR'] }),
          createMockTableClassification({ containsPii: false, complianceFrameworks: [] }),
        ];
        vi.mocked(repository.findAll).mockResolvedValue(tables);

        const result = await service.getGdprArticle30Inventory();
        expect(result).toHaveLength(2);
      });
    });

    describe('validateTableCompliance', () => {
      it('should return non-compliant for unclassified table', async () => {
        vi.mocked(repository.findByTable).mockResolvedValue(null);

        const result = await service.validateTableCompliance('unknown_table');
        expect(result.compliant).toBe(false);
        expect(result.issues).toContain('Table has no classification - needs review');
      });

      it('should flag PHI table without encryption', async () => {
        const phiTable = createMockTableClassification({
          containsPhi: true,
          encryptionRequirement: 'none',
        });
        vi.mocked(repository.findByTable).mockResolvedValue(phiTable);

        const result = await service.validateTableCompliance('phi_table');
        expect(result.compliant).toBe(false);
        expect(result.issues.some((i) => i.includes('encryption'))).toBe(true);
      });

      it('should flag PHI table without RLS', async () => {
        const phiTable = createMockTableClassification({
          containsPhi: true,
          encryptionRequirement: 'required',
          rlsEnabled: false,
        });
        vi.mocked(repository.findByTable).mockResolvedValue(phiTable);

        const result = await service.validateTableCompliance('phi_table');
        expect(result.compliant).toBe(false);
        expect(result.issues.some((i) => i.includes('RLS'))).toBe(true);
      });

      it('should flag PHI table without HIPAA framework', async () => {
        const phiTable = createMockTableClassification({
          containsPhi: true,
          encryptionRequirement: 'required',
          rlsEnabled: true,
          complianceFrameworks: [],
        });
        vi.mocked(repository.findByTable).mockResolvedValue(phiTable);

        const result = await service.validateTableCompliance('phi_table');
        expect(result.issues.some((i) => i.includes('HIPAA'))).toBe(true);
      });

      it('should flag PII table without RLS', async () => {
        const piiTable = createMockTableClassification({
          containsPii: true,
          rlsEnabled: false,
        });
        vi.mocked(repository.findByTable).mockResolvedValue(piiTable);

        const result = await service.validateTableCompliance('pii_table');
        expect(result.issues.some((i) => i.includes('RLS'))).toBe(true);
      });

      it('should flag PII table without GDPR framework', async () => {
        const piiTable = createMockTableClassification({
          containsPii: true,
          rlsEnabled: true,
          complianceFrameworks: [],
        });
        vi.mocked(repository.findByTable).mockResolvedValue(piiTable);

        const result = await service.validateTableCompliance('pii_table');
        expect(result.issues.some((i) => i.includes('GDPR'))).toBe(true);
      });

      it('should flag tables never reviewed', async () => {
        const table = createMockTableClassification({
          lastReviewedAt: undefined,
        });
        vi.mocked(repository.findByTable).mockResolvedValue(table);

        const result = await service.validateTableCompliance('test_table');
        expect(result.issues.some((i) => i.includes('never been reviewed'))).toBe(true);
      });

      it('should flag stale reviews', async () => {
        const staleDate = new Date();
        staleDate.setDate(staleDate.getDate() - 100); // 100 days ago

        const table = createMockTableClassification({
          lastReviewedAt: staleDate,
        });
        vi.mocked(repository.findByTable).mockResolvedValue(table);

        const result = await service.validateTableCompliance('test_table');
        expect(result.issues.some((i) => i.includes('stale'))).toBe(true);
      });

      it('should return compliant for properly configured table', async () => {
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 30); // 30 days ago

        const compliantTable = createMockTableClassification({
          containsPii: false,
          containsPhi: false,
          lastReviewedAt: recentDate,
          reviewedBy: 'admin@example.com',
        });
        vi.mocked(repository.findByTable).mockResolvedValue(compliantTable);

        const result = await service.validateTableCompliance('compliant_table');
        expect(result.compliant).toBe(true);
        expect(result.issues).toHaveLength(0);
      });
    });
  });

  describe('Configuration', () => {
    it('should respect autoDetectPii config', async () => {
      const svc = new DataClassificationService({
        repository,
        config: { autoDetectPii: false },
      });

      const input: CreateTableClassification = {
        tableName: 'users',
        schemaName: 'public',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        containsFinancial: false,
        complianceFrameworks: [],
        encryptionRequirement: 'none',
        retentionCategory: 'audit_logs',
        rlsEnabled: false,
        softDeleteEnabled: false,
        columns: [
          {
            columnName: 'email',
            sensitivityLevel: 'internal',
            isPii: false,
            isPhi: false,
            dataCategory: 'contact',
            isEncrypted: false,
            redactInLogs: false,
          },
        ],
      };

      await svc.upsertClassification(input);

      const upsertCall = vi.mocked(repository.upsert).mock.calls[0][0];
      // Should NOT auto-detect since config disabled it
      expect(upsertCall.columns[0].isPii).toBe(false);
    });

    it('should respect autoDetectPhi config', async () => {
      const svc = new DataClassificationService({
        repository,
        config: { autoDetectPhi: false },
      });

      const input: CreateTableClassification = {
        tableName: 'patients',
        schemaName: 'public',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        containsFinancial: false,
        complianceFrameworks: [],
        encryptionRequirement: 'none',
        retentionCategory: 'medical_records',
        rlsEnabled: false,
        softDeleteEnabled: false,
        columns: [
          {
            columnName: 'diagnosis',
            sensitivityLevel: 'internal',
            isPii: false,
            isPhi: false,
            dataCategory: 'health',
            isEncrypted: false,
            redactInLogs: false,
          },
        ],
      };

      await svc.upsertClassification(input);

      const upsertCall = vi.mocked(repository.upsert).mock.calls[0][0];
      expect(upsertCall.columns[0].isPhi).toBe(false);
    });

    it('should respect requirePhiEncryption config', async () => {
      const svc = new DataClassificationService({
        repository,
        config: { requirePhiEncryption: false },
      });

      const phiTableNoEncryption = createMockTableClassification({
        containsPhi: true,
        encryptionRequirement: 'none',
        rlsEnabled: true,
        complianceFrameworks: ['HIPAA'],
        lastReviewedAt: new Date(),
      });
      vi.mocked(repository.findAll).mockResolvedValue([phiTableNoEncryption]);

      const report = await svc.generateComplianceReport();
      // Should NOT be flagged as high-risk since encryption not required
      expect(report.highRiskTables).not.toContain('test_table');
    });
  });

  describe('Logger Integration', () => {
    it('should work without logger (noop)', async () => {
      const svc = new DataClassificationService({ repository });

      // Should not throw
      await svc.deleteClassification('test_table');
      expect(repository.delete).toHaveBeenCalled();
    });

    it('should log operations when logger provided', async () => {
      await service.deleteClassification('test_table');
      expect(logger.info).toHaveBeenCalled();
    });
  });
});
