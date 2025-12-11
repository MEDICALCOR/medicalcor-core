/**
 * @fileoverview Branch Coverage Tests for Data Classification Service
 * Target: 100% coverage - focuses on HIPAA/GDPR compliance gap detection
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DataClassificationService,
  createDataClassificationService,
  type DataClassificationConfig,
  type ClassificationLogger,
} from '../data-classification-service.js';
import type { DataClassificationRepository } from '../data-classification-repository.js';
import type {
  TableClassification,
  CreateTableClassification,
  ComplianceGap,
  ClassificationSummary,
  DataSensitivityLevel,
  ComplianceFramework,
  ColumnClassification,
} from '@medicalcor/types';

// =============================================================================
// MOCK SETUP
// =============================================================================

function createMockRepository(): DataClassificationRepository & {
  _data: Map<string, TableClassification>;
} {
  const data = new Map<string, TableClassification>();
  const gaps: ComplianceGap[] = [];

  return {
    _data: data,

    findByTable: vi.fn(async (tableName: string, schemaName = 'public') => {
      const key = `${schemaName}.${tableName}`;
      return data.get(key) ?? null;
    }),

    findAll: vi.fn(async () => Array.from(data.values())),

    findByFilters: vi.fn(async () => Array.from(data.values())),

    upsert: vi.fn(async (classification: CreateTableClassification) => {
      const key = `${classification.schemaName ?? 'public'}.${classification.tableName}`;
      const existing = data.get(key);

      const record: TableClassification = {
        id: existing?.id ?? `class-${Date.now()}`,
        tableName: classification.tableName,
        schemaName: classification.schemaName ?? 'public',
        description: classification.description ?? null,
        sensitivityLevel: classification.sensitivityLevel,
        containsPii: classification.containsPii,
        containsPhi: classification.containsPhi,
        containsFinancial: classification.containsFinancial ?? false,
        encryptionRequirement: classification.encryptionRequirement,
        rlsEnabled: classification.rlsEnabled ?? false,
        softDeleteEnabled: classification.softDeleteEnabled ?? false,
        complianceFrameworks: classification.complianceFrameworks,
        columns: classification.columns as ColumnClassification[],
        retentionPolicy: classification.retentionPolicy ?? null,
        dataOwner: classification.dataOwner ?? null,
        lastReviewedAt: classification.lastReviewedAt ?? null,
        lastReviewedBy: classification.lastReviewedBy ?? null,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      data.set(key, record);
      return record;
    }),

    update: vi.fn(async (classification) => {
      const key = `${classification.schemaName ?? 'public'}.${classification.tableName}`;
      const existing = data.get(key);
      if (!existing) throw new Error('Not found');

      const updated = { ...existing, ...classification, updatedAt: new Date().toISOString() };
      data.set(key, updated);
      return updated;
    }),

    delete: vi.fn(async (tableName: string, schemaName = 'public') => {
      const key = `${schemaName}.${tableName}`;
      data.delete(key);
    }),

    markAsReviewed: vi.fn(async (tableName: string, reviewedBy: string) => {
      const key = `public.${tableName}`;
      const existing = data.get(key);
      if (existing) {
        existing.lastReviewedAt = new Date().toISOString();
        existing.lastReviewedBy = reviewedBy;
      }
    }),

    findTablesWithPii: vi.fn(async () => {
      return Array.from(data.values()).filter((c) => c.containsPii);
    }),

    findTablesWithPhi: vi.fn(async () => {
      return Array.from(data.values()).filter((c) => c.containsPhi);
    }),

    findBySensitivityLevel: vi.fn(async (level: DataSensitivityLevel) => {
      return Array.from(data.values()).filter((c) => c.sensitivityLevel === level);
    }),

    findByComplianceFramework: vi.fn(async (framework: ComplianceFramework) => {
      return Array.from(data.values()).filter((c) => c.complianceFrameworks.includes(framework));
    }),

    isColumnPii: vi.fn(async (tableName: string, columnName: string) => {
      const key = `public.${tableName}`;
      const classification = data.get(key);
      return classification?.columns.some((c) => c.columnName === columnName && c.isPii) ?? false;
    }),

    getColumnClassifications: vi.fn(async (tableName: string) => {
      const key = `public.${tableName}`;
      const classification = data.get(key);
      return classification?.columns ?? [];
    }),

    getSummary: vi.fn(
      async (): Promise<ClassificationSummary> => ({
        totalTables: data.size,
        tablesWithPii: Array.from(data.values()).filter((c) => c.containsPii).length,
        tablesWithPhi: Array.from(data.values()).filter((c) => c.containsPhi).length,
        bySensitivity: {
          public: 0,
          internal: 0,
          confidential: Array.from(data.values()).filter(
            (c) => c.sensitivityLevel === 'confidential'
          ).length,
          restricted: Array.from(data.values()).filter((c) => c.sensitivityLevel === 'restricted')
            .length,
        },
        unclassifiedTables: 0,
        staleReviews: 0,
      })
    ),

    getComplianceGaps: vi.fn(async () => gaps),

    getStaleReviews: vi.fn(async () => {
      return Array.from(data.values())
        .filter((c) => !c.lastReviewedAt)
        .map((c) => c.tableName);
    }),
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

// =============================================================================
// BRANCH COVERAGE TESTS
// =============================================================================

describe('DataClassificationService - Branch Coverage', () => {
  let repository: ReturnType<typeof createMockRepository>;
  let logger: ClassificationLogger;
  let service: DataClassificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    repository = createMockRepository();
    logger = createMockLogger();
    service = createDataClassificationService({ repository, logger });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // FACTORY AND CONSTRUCTOR
  // ===========================================================================

  describe('factory and constructor', () => {
    it('should create with default config', () => {
      const svc = createDataClassificationService({ repository });
      expect(svc).toBeInstanceOf(DataClassificationService);
    });

    it('should create with custom config', () => {
      const svc = createDataClassificationService({
        repository,
        config: {
          staleReviewDays: 30,
          autoDetectPii: false,
          autoDetectPhi: false,
          requirePhiEncryption: false,
          requirePiiRls: false,
        },
      });
      expect(svc).toBeInstanceOf(DataClassificationService);
    });

    it('should use noop logger when not provided', async () => {
      const svc = createDataClassificationService({ repository });

      // Should not throw even when logging
      await svc.upsertClassification({
        tableName: 'test',
        sensitivityLevel: 'public',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });
    });
  });

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  describe('CRUD operations', () => {
    it('should get classification by table name with default schema', async () => {
      await service.upsertClassification({
        tableName: 'patients',
        sensitivityLevel: 'restricted',
        containsPii: true,
        containsPhi: true,
        encryptionRequirement: 'column',
        complianceFrameworks: ['HIPAA', 'GDPR'],
        columns: [],
      });

      const result = await service.getTableClassification('patients');
      expect(result?.tableName).toBe('patients');
    });

    it('should get classification with custom schema', async () => {
      await service.upsertClassification({
        tableName: 'audit_logs',
        schemaName: 'audit',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      const result = await service.getTableClassification('audit_logs', 'audit');
      expect(result?.schemaName).toBe('audit');
    });

    it('should return null for non-existent table', async () => {
      const result = await service.getTableClassification('nonexistent');
      expect(result).toBeNull();
    });

    it('should get all classifications', async () => {
      await service.upsertClassification({
        tableName: 'table1',
        sensitivityLevel: 'public',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      await service.upsertClassification({
        tableName: 'table2',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      const all = await service.getAllClassifications();
      expect(all).toHaveLength(2);
    });

    it('should query with filters', async () => {
      await service.queryClassifications({ containsPhi: true });
      expect(repository.findByFilters).toHaveBeenCalled();
    });

    it('should update classification', async () => {
      await service.upsertClassification({
        tableName: 'patients',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: ['GDPR'],
        columns: [],
      });

      const updated = await service.updateClassification({
        tableName: 'patients',
        sensitivityLevel: 'restricted',
      });

      expect(updated.sensitivityLevel).toBe('restricted');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ tableName: 'patients' }),
        'Table classification updated'
      );
    });

    it('should delete classification', async () => {
      await service.upsertClassification({
        tableName: 'temp_table',
        sensitivityLevel: 'public',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      await service.deleteClassification('temp_table');

      expect(repository.delete).toHaveBeenCalledWith('temp_table', 'public');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ tableName: 'temp_table' }),
        'Table classification deleted'
      );
    });

    it('should delete with custom schema', async () => {
      await service.deleteClassification('table', 'custom_schema');
      expect(repository.delete).toHaveBeenCalledWith('table', 'custom_schema');
    });

    it('should mark as reviewed', async () => {
      await service.markAsReviewed('patients', 'admin@clinic.com');

      expect(repository.markAsReviewed).toHaveBeenCalledWith('patients', 'admin@clinic.com');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ tableName: 'patients', reviewedBy: 'admin@clinic.com' }),
        'Classification marked as reviewed'
      );
    });
  });

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  describe('query operations', () => {
    it('should get tables with PII', async () => {
      await service.getTablesWithPii();
      expect(repository.findTablesWithPii).toHaveBeenCalled();
    });

    it('should get tables with PHI', async () => {
      await service.getTablesWithPhi();
      expect(repository.findTablesWithPhi).toHaveBeenCalled();
    });

    it('should get tables by sensitivity level', async () => {
      await service.getTablesBySensitivity('restricted');
      expect(repository.findBySensitivityLevel).toHaveBeenCalledWith('restricted');
    });

    it('should get tables by compliance framework', async () => {
      await service.getTablesByComplianceFramework('HIPAA');
      expect(repository.findByComplianceFramework).toHaveBeenCalledWith('HIPAA');
    });

    it('should check if column is PII', async () => {
      await service.isColumnPii('patients', 'email');
      expect(repository.isColumnPii).toHaveBeenCalledWith('patients', 'email');
    });

    it('should get column classifications', async () => {
      await service.getColumnClassifications('patients');
      expect(repository.getColumnClassifications).toHaveBeenCalledWith('patients');
    });
  });

  // ===========================================================================
  // ENHANCE CLASSIFICATION (AUTO-DETECT)
  // ===========================================================================

  describe('enhanceClassification', () => {
    it('should auto-detect PII from column names when enabled', async () => {
      const result = await service.upsertClassification({
        tableName: 'leads',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [
          {
            columnName: 'email',
            sensitivityLevel: 'internal',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
          {
            columnName: 'phone',
            sensitivityLevel: 'internal',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
        ],
      });

      // Auto-detect should have set isPii for email and phone columns
      expect(result.containsPii).toBe(true);
      expect(result.columns.some((c) => c.columnName === 'email' && c.isPii)).toBe(true);
    });

    it('should auto-detect PHI from column names when enabled', async () => {
      const result = await service.upsertClassification({
        tableName: 'medical_records',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [
          {
            columnName: 'diagnosis',
            sensitivityLevel: 'internal',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
          {
            columnName: 'treatment',
            sensitivityLevel: 'internal',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
        ],
      });

      expect(result.containsPhi).toBe(true);
    });

    it('should not auto-detect when disabled', async () => {
      const svc = createDataClassificationService({
        repository,
        config: {
          autoDetectPii: false,
          autoDetectPhi: false,
        },
      });

      const result = await svc.upsertClassification({
        tableName: 'test',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [
          {
            columnName: 'email',
            sensitivityLevel: 'internal',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
        ],
      });

      // Should NOT auto-detect
      expect(result.containsPii).toBe(false);
    });

    it('should infer highest sensitivity level from columns', async () => {
      const result = await service.upsertClassification({
        tableName: 'mixed_data',
        sensitivityLevel: 'internal', // Lower than column sensitivity
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [
          {
            columnName: 'id',
            sensitivityLevel: 'public',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
          {
            columnName: 'data',
            sensitivityLevel: 'confidential',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
        ],
      });

      // Should use highest column sensitivity (confidential > internal)
      expect(result.sensitivityLevel).toBe('confidential');
    });

    it('should auto-add GDPR framework for PII tables', async () => {
      const result = await service.upsertClassification({
        tableName: 'contacts',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      expect(result.complianceFrameworks).toContain('GDPR');
    });

    it('should auto-add HIPAA framework for PHI tables', async () => {
      const result = await service.upsertClassification({
        tableName: 'health_records',
        sensitivityLevel: 'restricted',
        containsPii: false,
        containsPhi: true,
        encryptionRequirement: 'column',
        complianceFrameworks: [],
        columns: [],
      });

      expect(result.complianceFrameworks).toContain('HIPAA');
    });

    it('should auto-add PCI_DSS framework for financial tables', async () => {
      const result = await service.upsertClassification({
        tableName: 'payments',
        sensitivityLevel: 'financial',
        containsPii: false,
        containsPhi: false,
        containsFinancial: true,
        encryptionRequirement: 'column',
        complianceFrameworks: [],
        columns: [],
      });

      expect(result.complianceFrameworks).toContain('PCI_DSS');
    });

    it('should preserve explicitly set PII/PHI flags', async () => {
      const result = await service.upsertClassification({
        tableName: 'special',
        sensitivityLevel: 'restricted',
        containsPii: true, // Explicitly set
        containsPhi: true, // Explicitly set
        encryptionRequirement: 'column',
        complianceFrameworks: [],
        columns: [
          {
            columnName: 'data',
            sensitivityLevel: 'internal',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
        ],
      });

      expect(result.containsPii).toBe(true);
      expect(result.containsPhi).toBe(true);
    });

    it('should set redactInLogs for PII/PHI columns', async () => {
      const result = await service.upsertClassification({
        tableName: 'patients',
        sensitivityLevel: 'restricted',
        containsPii: true,
        containsPhi: true,
        encryptionRequirement: 'column',
        complianceFrameworks: ['HIPAA'],
        columns: [
          {
            columnName: 'phone',
            sensitivityLevel: 'confidential',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
        ],
      });

      // Phone should have redactInLogs set to true after auto-detection
      const phoneColumn = result.columns.find((c) => c.columnName === 'phone');
      expect(phoneColumn?.redactInLogs).toBe(true);
    });

    it('should handle empty columns array', async () => {
      const result = await service.upsertClassification({
        tableName: 'empty_columns',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      expect(result.columns).toHaveLength(0);
      expect(result.sensitivityLevel).toBe('internal'); // Should keep original
    });
  });

  // ===========================================================================
  // COMPLIANCE REPORTING
  // ===========================================================================

  describe('compliance reporting', () => {
    it('should get summary', async () => {
      const summary = await service.getSummary();
      expect(repository.getSummary).toHaveBeenCalled();
      expect(summary.totalTables).toBeDefined();
    });

    it('should get stale reviews', async () => {
      await service.getStaleReviews();
      expect(repository.getStaleReviews).toHaveBeenCalled();
    });

    it('should generate compliance report', async () => {
      await service.upsertClassification({
        tableName: 'patients',
        sensitivityLevel: 'restricted',
        containsPii: true,
        containsPhi: true,
        encryptionRequirement: 'none', // Should be flagged as high-risk
        rlsEnabled: false, // Should be flagged as high-risk
        complianceFrameworks: ['HIPAA', 'GDPR'],
        columns: [],
      });

      const report = await service.generateComplianceReport();

      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.highRiskTables).toContain('patients');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ highRiskCount: 1 }),
        'Compliance report generated'
      );
    });

    it('should identify high-risk tables with PHI but no encryption', async () => {
      await service.upsertClassification({
        tableName: 'medical',
        sensitivityLevel: 'restricted',
        containsPii: false,
        containsPhi: true,
        encryptionRequirement: 'none',
        rlsEnabled: true,
        complianceFrameworks: ['HIPAA'],
        columns: [],
      });

      const report = await service.generateComplianceReport();
      expect(report.highRiskTables).toContain('medical');
    });

    it('should identify high-risk tables with PHI but no RLS', async () => {
      const svc = createDataClassificationService({
        repository,
        config: { requirePiiRls: true, requirePhiEncryption: false },
      });

      await svc.upsertClassification({
        tableName: 'records',
        sensitivityLevel: 'restricted',
        containsPii: false,
        containsPhi: true,
        encryptionRequirement: 'column',
        rlsEnabled: false,
        complianceFrameworks: ['HIPAA'],
        columns: [],
      });

      const report = await svc.generateComplianceReport();
      expect(report.highRiskTables).toContain('records');
    });

    it('should not flag tables when requirements disabled', async () => {
      const svc = createDataClassificationService({
        repository,
        config: { requirePhiEncryption: false, requirePiiRls: false },
      });

      await svc.upsertClassification({
        tableName: 'flexible',
        sensitivityLevel: 'restricted',
        containsPii: true,
        containsPhi: true,
        encryptionRequirement: 'none',
        rlsEnabled: false,
        complianceFrameworks: ['HIPAA', 'GDPR'],
        columns: [],
      });

      const report = await svc.generateComplianceReport();
      expect(report.highRiskTables).not.toContain('flexible');
    });
  });

  // ===========================================================================
  // COMPLIANCE GAPS DETECTION
  // ===========================================================================

  describe('getComplianceGaps', () => {
    it('should detect missing soft delete on PII tables', async () => {
      await service.upsertClassification({
        tableName: 'contacts',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        softDeleteEnabled: false,
        complianceFrameworks: ['GDPR'],
        columns: [],
      });

      const gaps = await service.getComplianceGaps();

      const softDeleteGap = gaps.find(
        (g) => g.tableName === 'contacts' && g.gapType === 'missing_soft_delete'
      );
      expect(softDeleteGap).toBeDefined();
      expect(softDeleteGap?.severity).toBe('medium');
      expect(softDeleteGap?.affectedFrameworks).toContain('GDPR');
    });

    it('should detect missing soft delete on PHI tables', async () => {
      await service.upsertClassification({
        tableName: 'health',
        sensitivityLevel: 'restricted',
        containsPii: false,
        containsPhi: true,
        encryptionRequirement: 'column',
        softDeleteEnabled: false,
        complianceFrameworks: ['HIPAA'],
        columns: [],
      });

      const gaps = await service.getComplianceGaps();

      expect(
        gaps.some((g) => g.tableName === 'health' && g.gapType === 'missing_soft_delete')
      ).toBe(true);
    });

    it('should not flag soft delete gap when enabled', async () => {
      await service.upsertClassification({
        tableName: 'compliant',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        softDeleteEnabled: true,
        complianceFrameworks: ['GDPR'],
        columns: [],
      });

      const gaps = await service.getComplianceGaps();

      expect(
        gaps.some((g) => g.tableName === 'compliant' && g.gapType === 'missing_soft_delete')
      ).toBe(false);
    });

    it('should detect missing column classifications on PII tables', async () => {
      await service.upsertClassification({
        tableName: 'leads',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: ['GDPR'],
        columns: [], // No column classifications
      });

      const gaps = await service.getComplianceGaps();

      const columnGap = gaps.find(
        (g) => g.tableName === 'leads' && g.gapType === 'missing_column_classification'
      );
      expect(columnGap).toBeDefined();
      expect(columnGap?.affectedFrameworks).toContain('GDPR');
      expect(columnGap?.affectedFrameworks).toContain('HIPAA');
    });

    it('should not flag column gap when columns are classified', async () => {
      await service.upsertClassification({
        tableName: 'classified',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: ['GDPR'],
        columns: [
          {
            columnName: 'email',
            sensitivityLevel: 'confidential',
            isPii: true,
            isPhi: false,
            redactInLogs: true,
          },
        ],
      });

      const gaps = await service.getComplianceGaps();

      expect(
        gaps.some(
          (g) => g.tableName === 'classified' && g.gapType === 'missing_column_classification'
        )
      ).toBe(false);
    });

    it('should merge repository gaps with detected gaps', async () => {
      // Set up repository to return some gaps
      (repository.getComplianceGaps as any).mockResolvedValueOnce([
        {
          tableName: 'external_gap',
          gapType: 'missing_encryption',
          severity: 'high',
          description: 'External gap',
          remediation: 'Fix it',
          affectedFrameworks: ['HIPAA'],
        },
      ]);

      await service.upsertClassification({
        tableName: 'local_gap',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        softDeleteEnabled: false,
        complianceFrameworks: ['GDPR'],
        columns: [],
      });

      const gaps = await service.getComplianceGaps();

      expect(gaps.some((g) => g.tableName === 'external_gap')).toBe(true);
      expect(gaps.some((g) => g.tableName === 'local_gap')).toBe(true);
    });
  });

  // ===========================================================================
  // HIPAA/GDPR AUDIT SUPPORT
  // ===========================================================================

  describe('audit support', () => {
    it('should get HIPAA inventory', async () => {
      await service.getHipaaInventory();
      expect(repository.findTablesWithPhi).toHaveBeenCalled();
    });

    it('should get GDPR Article 30 inventory', async () => {
      await service.upsertClassification({
        tableName: 'pii_table',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      await service.upsertClassification({
        tableName: 'gdpr_table',
        sensitivityLevel: 'internal',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: ['GDPR'],
        columns: [],
      });

      await service.upsertClassification({
        tableName: 'other_table',
        sensitivityLevel: 'public',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      const inventory = await service.getGdprArticle30Inventory();

      expect(inventory.some((t) => t.tableName === 'pii_table')).toBe(true);
      expect(inventory.some((t) => t.tableName === 'gdpr_table')).toBe(true);
      expect(inventory.some((t) => t.tableName === 'other_table')).toBe(false);
    });
  });

  // ===========================================================================
  // VALIDATE TABLE COMPLIANCE
  // ===========================================================================

  describe('validateTableCompliance', () => {
    it('should return non-compliant for unclassified table', async () => {
      const result = await service.validateTableCompliance('nonexistent');

      expect(result.compliant).toBe(false);
      expect(result.issues).toContain('Table has no classification - needs review');
    });

    it('should detect PHI without encryption', async () => {
      await service.upsertClassification({
        tableName: 'unencrypted_phi',
        sensitivityLevel: 'restricted',
        containsPii: false,
        containsPhi: true,
        encryptionRequirement: 'none',
        rlsEnabled: true,
        complianceFrameworks: ['HIPAA'],
        columns: [],
      });

      const result = await service.validateTableCompliance('unencrypted_phi');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('PHI table requires encryption'))).toBe(true);
    });

    it('should detect PHI without RLS', async () => {
      await service.upsertClassification({
        tableName: 'no_rls_phi',
        sensitivityLevel: 'restricted',
        containsPii: false,
        containsPhi: true,
        encryptionRequirement: 'column',
        rlsEnabled: false,
        complianceFrameworks: ['HIPAA'],
        columns: [],
      });

      const result = await service.validateTableCompliance('no_rls_phi');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('PHI table requires RLS'))).toBe(true);
    });

    it('should detect PHI table with HIPAA framework as compliant when properly configured', async () => {
      // Service auto-adds HIPAA for PHI tables, so we test the compliant path
      await service.upsertClassification({
        tableName: 'phi_with_hipaa',
        sensitivityLevel: 'phi',
        containsPii: false,
        containsPhi: true,
        encryptionRequirement: 'column',
        rlsEnabled: true,
        complianceFrameworks: ['HIPAA'],
        columns: [],
        lastReviewedAt: new Date().toISOString(), // Required for compliance
        lastReviewedBy: 'compliance-officer',
      });

      const result = await service.validateTableCompliance('phi_with_hipaa');

      // Should be compliant since all requirements are met including review
      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect PII without RLS', async () => {
      await service.upsertClassification({
        tableName: 'no_rls_pii',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        rlsEnabled: false,
        complianceFrameworks: ['GDPR'],
        columns: [],
      });

      const result = await service.validateTableCompliance('no_rls_pii');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('PII table requires RLS'))).toBe(true);
    });

    it('should detect PII table with GDPR framework as compliant when properly configured', async () => {
      // Service auto-adds GDPR for PII tables, so we test the compliant path
      await service.upsertClassification({
        tableName: 'pii_with_gdpr',
        sensitivityLevel: 'confidential',
        containsPii: true,
        containsPhi: false,
        encryptionRequirement: 'none',
        rlsEnabled: true,
        complianceFrameworks: ['GDPR'],
        columns: [],
        lastReviewedAt: new Date().toISOString(), // Required for compliance
        lastReviewedBy: 'compliance-officer',
      });

      const result = await service.validateTableCompliance('pii_with_gdpr');

      // Should be compliant since RLS is enabled, GDPR framework is present, and recently reviewed
      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect never reviewed classification', async () => {
      await service.upsertClassification({
        tableName: 'never_reviewed',
        sensitivityLevel: 'public',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
      });

      const result = await service.validateTableCompliance('never_reviewed');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('never been reviewed'))).toBe(true);
    });

    it('should detect stale review', async () => {
      await service.upsertClassification({
        tableName: 'stale_review',
        sensitivityLevel: 'public',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
        lastReviewedAt: new Date('2024-01-01').toISOString(), // More than 90 days ago
      });

      const result = await service.validateTableCompliance('stale_review');

      expect(result.compliant).toBe(false);
      expect(result.issues.some((i) => i.includes('stale'))).toBe(true);
    });

    it('should pass compliant table', async () => {
      await service.upsertClassification({
        tableName: 'compliant_table',
        sensitivityLevel: 'restricted',
        containsPii: true,
        containsPhi: true,
        encryptionRequirement: 'column',
        rlsEnabled: true,
        complianceFrameworks: ['HIPAA', 'GDPR'],
        columns: [],
        lastReviewedAt: new Date('2024-06-01').toISOString(),
      });

      const result = await service.validateTableCompliance('compliant_table');

      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should handle review at exact boundary', async () => {
      // Review exactly at stale threshold (90 days ago)
      const reviewDate = new Date('2024-03-17T10:00:00Z'); // 90 days before June 15

      await service.upsertClassification({
        tableName: 'boundary_review',
        sensitivityLevel: 'public',
        containsPii: false,
        containsPhi: false,
        encryptionRequirement: 'none',
        complianceFrameworks: [],
        columns: [],
        lastReviewedAt: reviewDate.toISOString(),
      });

      const result = await service.validateTableCompliance('boundary_review');

      // At exactly 90 days, should not be stale (uses >)
      expect(result.issues.some((i) => i.includes('stale'))).toBe(false);
    });
  });
});
