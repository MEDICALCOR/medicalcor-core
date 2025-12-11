/**
 * @fileoverview HIPAA Medical Records Storage Compliance Tests
 *
 * Tests HIPAA-compliant medical records handling including:
 * - No unauthorized medical history storage
 * - PHI (Protected Health Information) access controls
 * - Minimum necessary principle enforcement
 * - Data retention and disposal policies
 * - Encryption requirements for PHI at rest
 * - Audit logging for PHI access
 * - De-identification requirements
 *
 * @module domain/__tests__/hipaa-medical-records
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  DataClassificationService,
  type DataClassificationServiceOptions,
  type ClassificationLogger,
} from '../data-classification/data-classification-service.js';
import type {
  TableClassification,
  CreateTableClassification,
  ComplianceFramework,
  DataSensitivityLevel,
  ColumnClassification,
  ComplianceGap,
  ClassificationSummary,
} from '@medicalcor/types';

// ============================================================================
// TEST FIXTURES & MOCKS
// ============================================================================

/**
 * Mock logger for testing
 */
const createMockLogger = (): ClassificationLogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

/**
 * In-memory repository for testing data classification
 */
class InMemoryClassificationRepository {
  private classifications: Map<string, TableClassification> = new Map();
  private columnClassifications: Map<string, ColumnClassification[]> = new Map();
  private nextId = 1;

  private getKey(tableName: string, schemaName: string): string {
    return `${schemaName}.${tableName}`;
  }

  async findByTable(tableName: string, schemaName: string): Promise<TableClassification | null> {
    return this.classifications.get(this.getKey(tableName, schemaName)) ?? null;
  }

  async findAll(): Promise<TableClassification[]> {
    return Array.from(this.classifications.values());
  }

  async findByFilters(filters: {
    sensitivityLevel?: DataSensitivityLevel;
    containsPii?: boolean;
    containsPhi?: boolean;
    complianceFramework?: ComplianceFramework;
  }): Promise<TableClassification[]> {
    let results = Array.from(this.classifications.values());

    if (filters.sensitivityLevel) {
      results = results.filter((c) => c.sensitivityLevel === filters.sensitivityLevel);
    }
    if (filters.containsPii !== undefined) {
      results = results.filter((c) => c.containsPii === filters.containsPii);
    }
    if (filters.containsPhi !== undefined) {
      results = results.filter((c) => c.containsPhi === filters.containsPhi);
    }
    if (filters.complianceFramework) {
      results = results.filter((c) =>
        c.complianceFrameworks.includes(filters.complianceFramework!)
      );
    }

    return results;
  }

  async upsert(classification: CreateTableClassification): Promise<TableClassification> {
    const key = this.getKey(classification.tableName, classification.schemaName ?? 'public');
    const existing = this.classifications.get(key);

    const record: TableClassification = {
      id: existing?.id ?? `cls_${this.nextId++}`,
      tableName: classification.tableName,
      schemaName: classification.schemaName ?? 'public',
      sensitivityLevel: classification.sensitivityLevel,
      containsPii: classification.containsPii,
      containsPhi: classification.containsPhi,
      containsFinancial: classification.containsFinancial ?? false,
      complianceFrameworks: classification.complianceFrameworks,
      columns: classification.columns,
      dataRetentionDays: classification.dataRetentionDays ?? null,
      encryptionRequirement: classification.encryptionRequirement ?? 'none',
      rlsEnabled: classification.rlsEnabled ?? false,
      softDeleteEnabled: classification.softDeleteEnabled ?? false,
      lastReviewedAt: existing?.lastReviewedAt ?? null,
      lastReviewedBy: existing?.lastReviewedBy ?? null,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };

    this.classifications.set(key, record);
    this.columnClassifications.set(key, classification.columns);

    return record;
  }

  async update(
    classification: Partial<TableClassification> & { tableName: string }
  ): Promise<TableClassification> {
    const key = this.getKey(classification.tableName, classification.schemaName ?? 'public');
    const existing = this.classifications.get(key);

    if (!existing) {
      throw new Error(`Classification not found: ${classification.tableName}`);
    }

    const updated = { ...existing, ...classification, updatedAt: new Date() };
    this.classifications.set(key, updated);

    return updated;
  }

  async delete(tableName: string, schemaName: string): Promise<void> {
    this.classifications.delete(this.getKey(tableName, schemaName));
  }

  async markAsReviewed(tableName: string, reviewedBy: string): Promise<void> {
    const key = this.getKey(tableName, 'public');
    const existing = this.classifications.get(key);

    if (existing) {
      existing.lastReviewedAt = new Date();
      existing.lastReviewedBy = reviewedBy;
    }
  }

  async findTablesWithPii(): Promise<TableClassification[]> {
    return Array.from(this.classifications.values()).filter((c) => c.containsPii);
  }

  async findTablesWithPhi(): Promise<TableClassification[]> {
    return Array.from(this.classifications.values()).filter((c) => c.containsPhi);
  }

  async findBySensitivityLevel(level: DataSensitivityLevel): Promise<TableClassification[]> {
    return Array.from(this.classifications.values()).filter((c) => c.sensitivityLevel === level);
  }

  async findByComplianceFramework(framework: ComplianceFramework): Promise<TableClassification[]> {
    return Array.from(this.classifications.values()).filter((c) =>
      c.complianceFrameworks.includes(framework)
    );
  }

  async isColumnPii(tableName: string, columnName: string): Promise<boolean> {
    const cols = this.columnClassifications.get(this.getKey(tableName, 'public')) ?? [];
    return cols.some((c) => c.columnName === columnName && c.isPii);
  }

  async getColumnClassifications(tableName: string): Promise<ColumnClassification[]> {
    return this.columnClassifications.get(this.getKey(tableName, 'public')) ?? [];
  }

  async getSummary(): Promise<ClassificationSummary> {
    const all = Array.from(this.classifications.values());
    return {
      totalTables: all.length,
      tablesWithPii: all.filter((c) => c.containsPii).length,
      tablesWithPhi: all.filter((c) => c.containsPhi).length,
      tablesWithFinancial: all.filter((c) => c.containsFinancial).length,
      bySensitivityLevel: {
        PHI: all.filter((c) => c.sensitivityLevel === 'PHI').length,
        PII: all.filter((c) => c.sensitivityLevel === 'PII').length,
        sensitive: all.filter((c) => c.sensitivityLevel === 'sensitive').length,
        general: all.filter((c) => c.sensitivityLevel === 'general').length,
      },
    };
  }

  async getComplianceGaps(): Promise<ComplianceGap[]> {
    const gaps: ComplianceGap[] = [];
    const all = Array.from(this.classifications.values());

    for (const classification of all) {
      if (classification.containsPhi && classification.encryptionRequirement === 'none') {
        gaps.push({
          tableName: classification.tableName,
          gapType: 'missing_encryption',
          severity: 'critical',
          description: 'PHI table requires encryption but has none configured',
          remediation: 'Enable encryption at rest for PHI data',
          affectedFrameworks: ['HIPAA'],
        });
      }
      if (classification.containsPhi && !classification.rlsEnabled) {
        gaps.push({
          tableName: classification.tableName,
          gapType: 'missing_rls',
          severity: 'high',
          description: 'PHI table requires row-level security but RLS is not enabled',
          remediation: 'Enable row-level security policies',
          affectedFrameworks: ['HIPAA'],
        });
      }
    }

    return gaps;
  }

  async getStaleReviews(): Promise<string[]> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    return Array.from(this.classifications.values())
      .filter((c) => !c.lastReviewedAt || new Date(c.lastReviewedAt) < ninetyDaysAgo)
      .map((c) => c.tableName);
  }

  clear(): void {
    this.classifications.clear();
    this.columnClassifications.clear();
  }
}

/**
 * Create test classification request
 */
const createPhiTableClassification = (
  overrides?: Partial<CreateTableClassification>
): CreateTableClassification => ({
  tableName: 'medical_records',
  schemaName: 'public',
  sensitivityLevel: 'PHI',
  containsPii: true,
  containsPhi: true,
  containsFinancial: false,
  complianceFrameworks: ['HIPAA', 'GDPR'],
  columns: [
    {
      columnName: 'patient_id',
      dataType: 'uuid',
      sensitivityLevel: 'PII',
      isPii: true,
      isPhi: false,
      redactInLogs: true,
      description: 'Patient identifier',
    },
    {
      columnName: 'diagnosis_code',
      dataType: 'varchar',
      sensitivityLevel: 'PHI',
      isPii: false,
      isPhi: true,
      redactInLogs: true,
      description: 'ICD-10 diagnosis code',
    },
    {
      columnName: 'treatment_notes',
      dataType: 'text',
      sensitivityLevel: 'PHI',
      isPii: false,
      isPhi: true,
      redactInLogs: true,
      description: 'Clinical treatment notes',
    },
  ],
  dataRetentionDays: 2555, // 7 years for HIPAA
  encryptionRequirement: 'at_rest',
  rlsEnabled: true,
  softDeleteEnabled: true,
  ...overrides,
});

// ============================================================================
// HIPAA MEDICAL RECORDS STORAGE TESTS
// ============================================================================

describe('HIPAA Medical Records Storage Compliance', () => {
  let service: DataClassificationService;
  let repository: InMemoryClassificationRepository;
  let logger: ClassificationLogger;

  beforeEach(() => {
    repository = new InMemoryClassificationRepository();
    logger = createMockLogger();
    service = new DataClassificationService({
      repository,
      logger,
      config: {
        requirePhiEncryption: true,
        requirePiiRls: true,
      },
    });
  });

  // ============================================================================
  // PHI CLASSIFICATION & ACCESS CONTROL TESTS
  // ============================================================================

  describe('PHI Classification Requirements', () => {
    it('should classify medical records table as PHI', async () => {
      const classification = await service.upsertClassification(createPhiTableClassification());

      expect(classification.containsPhi).toBe(true);
      expect(classification.sensitivityLevel).toBe('PHI');
      expect(classification.complianceFrameworks).toContain('HIPAA');
    });

    it('should auto-detect PHI columns from column names', async () => {
      const classification = await service.upsertClassification({
        tableName: 'patient_history',
        schemaName: 'public',
        sensitivityLevel: 'general',
        containsPii: false,
        containsPhi: false,
        complianceFrameworks: [],
        columns: [
          {
            columnName: 'diagnosis',
            dataType: 'text',
            sensitivityLevel: 'general',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
          {
            columnName: 'medical_record_number',
            dataType: 'varchar',
            sensitivityLevel: 'general',
            isPii: false,
            isPhi: false,
            redactInLogs: false,
          },
        ],
      });

      // Service should auto-detect PHI based on column names
      expect(classification.containsPhi).toBe(true);
      const diagnosisCol = classification.columns.find((c) => c.columnName === 'diagnosis');
      expect(diagnosisCol?.isPhi).toBe(true);
    });

    it('should require HIPAA framework for PHI tables', async () => {
      const classification = await service.upsertClassification(createPhiTableClassification());

      expect(classification.complianceFrameworks).toContain('HIPAA');
    });

    it('should auto-add HIPAA framework for PHI tables during upsert', async () => {
      // When a table contains PHI, HIPAA should be auto-added even if only GDPR specified
      const classification = await service.upsertClassification({
        ...createPhiTableClassification(),
        complianceFrameworks: ['GDPR'], // Only GDPR specified
      });

      // Service should have auto-added HIPAA since containsPhi is true
      expect(classification.complianceFrameworks).toContain('HIPAA');
      expect(classification.complianceFrameworks).toContain('GDPR');
    });
  });

  // ============================================================================
  // ENCRYPTION AT REST TESTS
  // ============================================================================

  describe('PHI Encryption Requirements', () => {
    it('should require encryption at rest for PHI tables', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        encryptionRequirement: 'none',
      });

      const result = await service.validateTableCompliance('medical_records');

      expect(result.compliant).toBe(false);
      expect(result.issues).toContain('PHI table requires encryption but has none configured');
    });

    it('should pass compliance when PHI table has encryption enabled', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        encryptionRequirement: 'at_rest',
        rlsEnabled: true,
      });

      // Mark as reviewed to satisfy the review requirement
      await service.markAsReviewed('medical_records', 'compliance-officer');

      const result = await service.validateTableCompliance('medical_records');

      expect(result.compliant).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect encryption gaps in compliance report', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        encryptionRequirement: 'none',
      });

      const gaps = await service.getComplianceGaps();

      expect(gaps.some((g) => g.gapType === 'missing_encryption')).toBe(true);
      expect(gaps.some((g) => g.affectedFrameworks.includes('HIPAA'))).toBe(true);
    });
  });

  // ============================================================================
  // ROW-LEVEL SECURITY (ACCESS CONTROL) TESTS
  // ============================================================================

  describe('Row-Level Security Requirements', () => {
    it('should require RLS for PHI tables', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        rlsEnabled: false,
      });

      const result = await service.validateTableCompliance('medical_records');

      expect(result.compliant).toBe(false);
      expect(result.issues).toContain('PHI table requires RLS but it is not enabled');
    });

    it('should pass compliance when RLS is enabled on PHI table', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        rlsEnabled: true,
        encryptionRequirement: 'at_rest',
      });

      // Mark as reviewed to satisfy the review requirement
      await service.markAsReviewed('medical_records', 'compliance-officer');

      const result = await service.validateTableCompliance('medical_records');

      expect(result.compliant).toBe(true);
    });

    it('should detect RLS gaps in compliance report', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        rlsEnabled: false,
      });

      const gaps = await service.getComplianceGaps();

      expect(gaps.some((g) => g.gapType === 'missing_rls')).toBe(true);
    });
  });

  // ============================================================================
  // DATA RETENTION & DISPOSAL TESTS
  // ============================================================================

  describe('Data Retention Requirements', () => {
    it('should enforce minimum 7-year retention for HIPAA medical records', async () => {
      const classification = await service.upsertClassification({
        ...createPhiTableClassification(),
        dataRetentionDays: 2555, // 7 years
      });

      expect(classification.dataRetentionDays).toBeGreaterThanOrEqual(2555);
    });

    it('should track classification review freshness', async () => {
      await service.upsertClassification(createPhiTableClassification());

      const result = await service.validateTableCompliance('medical_records');

      expect(result.issues).toContain('Classification has never been reviewed');
    });

    it('should detect stale reviews older than 90 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      await service.upsertClassification(createPhiTableClassification());
      await repository.update({
        tableName: 'medical_records',
        lastReviewedAt: oldDate,
      });

      const result = await service.validateTableCompliance('medical_records');

      expect(result.issues.some((i) => i.includes('stale'))).toBe(true);
    });

    it('should list tables with stale reviews', async () => {
      await service.upsertClassification(createPhiTableClassification());

      const stale = await service.getStaleReviews();

      expect(stale).toContain('medical_records');
    });
  });

  // ============================================================================
  // MINIMUM NECESSARY PRINCIPLE TESTS
  // ============================================================================

  describe('Minimum Necessary Principle', () => {
    it('should classify each column individually for granular access', async () => {
      const classification = await service.upsertClassification(createPhiTableClassification());

      expect(classification.columns.length).toBeGreaterThan(0);
      expect(classification.columns.every((c) => c.sensitivityLevel !== undefined)).toBe(true);
    });

    it('should identify which specific columns are PHI', async () => {
      await service.upsertClassification(createPhiTableClassification());

      const columns = await service.getColumnClassifications('medical_records');

      const phiColumns = columns.filter((c) => c.isPhi);
      expect(phiColumns.length).toBeGreaterThan(0);
      expect(phiColumns.some((c) => c.columnName === 'diagnosis_code')).toBe(true);
      expect(phiColumns.some((c) => c.columnName === 'treatment_notes')).toBe(true);
    });

    it('should verify column-level PII classification', async () => {
      await service.upsertClassification(createPhiTableClassification());

      const isPii = await service.isColumnPii('medical_records', 'patient_id');

      expect(isPii).toBe(true);
    });

    it('should mark PHI columns for log redaction', async () => {
      await service.upsertClassification(createPhiTableClassification());

      const columns = await service.getColumnClassifications('medical_records');

      const phiColumns = columns.filter((c) => c.isPhi);
      expect(phiColumns.every((c) => c.redactInLogs)).toBe(true);
    });
  });

  // ============================================================================
  // HIPAA AUDIT INVENTORY TESTS
  // ============================================================================

  describe('HIPAA Audit Inventory', () => {
    it('should generate HIPAA inventory of all PHI tables', async () => {
      await service.upsertClassification(createPhiTableClassification());
      await service.upsertClassification({
        ...createPhiTableClassification(),
        tableName: 'clinical_notes',
      });

      const inventory = await service.getHipaaInventory();

      expect(inventory).toHaveLength(2);
      expect(inventory.every((t) => t.containsPhi)).toBe(true);
    });

    it('should include all PHI tables in HIPAA inventory', async () => {
      await service.upsertClassification(createPhiTableClassification());
      await service.upsertClassification({
        tableName: 'non_phi_table',
        schemaName: 'public',
        sensitivityLevel: 'general',
        containsPii: false,
        containsPhi: false,
        complianceFrameworks: [],
        columns: [],
      });

      const inventory = await service.getHipaaInventory();

      expect(inventory).toHaveLength(1);
      expect(inventory[0]?.tableName).toBe('medical_records');
    });

    it('should query tables by HIPAA compliance framework', async () => {
      await service.upsertClassification(createPhiTableClassification());

      const hipaaTable = await service.getTablesByComplianceFramework('HIPAA');

      expect(hipaaTable).toHaveLength(1);
      expect(hipaaTable[0]?.complianceFrameworks).toContain('HIPAA');
    });
  });

  // ============================================================================
  // COMPLIANCE REPORT TESTS
  // ============================================================================

  describe('Compliance Reporting', () => {
    it('should generate comprehensive compliance report', async () => {
      await service.upsertClassification(createPhiTableClassification());
      await service.upsertClassification({
        ...createPhiTableClassification(),
        tableName: 'appointments',
        encryptionRequirement: 'none',
        rlsEnabled: false,
      });

      const report = await service.generateComplianceReport();

      expect(report.summary.totalTables).toBe(2);
      expect(report.summary.tablesWithPhi).toBe(2);
      expect(report.gaps.length).toBeGreaterThan(0);
      expect(report.highRiskTables).toContain('appointments');
    });

    it('should identify high-risk PHI tables without encryption', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        encryptionRequirement: 'none',
      });

      const report = await service.generateComplianceReport();

      expect(report.highRiskTables).toContain('medical_records');
    });

    it('should summarize classification statistics', async () => {
      await service.upsertClassification(createPhiTableClassification());

      const summary = await service.getSummary();

      expect(summary.tablesWithPhi).toBe(1);
      expect(summary.tablesWithPii).toBe(1);
      expect(summary.bySensitivityLevel.PHI).toBe(1);
    });
  });

  // ============================================================================
  // SOFT DELETE FOR AUDIT TRAIL TESTS
  // ============================================================================

  describe('Soft Delete Requirements', () => {
    it('should detect missing soft delete on PHI tables', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        softDeleteEnabled: false,
      });

      const gaps = await service.getComplianceGaps();

      expect(gaps.some((g) => g.gapType === 'missing_soft_delete')).toBe(true);
    });

    it('should pass when soft delete is enabled for PHI tables', async () => {
      await service.upsertClassification({
        ...createPhiTableClassification(),
        softDeleteEnabled: true,
        encryptionRequirement: 'at_rest',
        rlsEnabled: true,
        lastReviewedAt: new Date(),
      });

      const result = await service.validateTableCompliance('medical_records');

      // Should not have soft delete gap
      const gaps = await service.getComplianceGaps();
      expect(gaps.some((g) => g.gapType === 'missing_soft_delete')).toBe(false);
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe('Property-Based Tests', () => {
    it('should always add HIPAA framework when table contains PHI', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (tableName) => {
          const validTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
          if (!validTableName || validTableName.length === 0) return true;

          const classification = await service.upsertClassification({
            tableName: validTableName,
            schemaName: 'public',
            sensitivityLevel: 'PHI',
            containsPii: true,
            containsPhi: true,
            complianceFrameworks: [], // Empty - service should auto-add
            columns: [],
          });

          // Service auto-adds required frameworks based on containsPhi flag
          return classification.complianceFrameworks.includes('HIPAA');
        }),
        { numRuns: 10 }
      );
    });

    it('should always include required compliance frameworks for PHI data', async () => {
      await fc.assert(
        fc.asyncProperty(fc.boolean(), fc.boolean(), async (containsPhi, containsPii) => {
          // Skip test case where neither PHI nor PII
          if (!containsPhi && !containsPii) return true;

          const classification = await service.upsertClassification({
            tableName: `test_table_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            schemaName: 'public',
            sensitivityLevel: containsPhi ? 'PHI' : 'PII',
            containsPii,
            containsPhi,
            complianceFrameworks: [],
            columns: [],
          });

          // Verify HIPAA is added for PHI and GDPR is added for PII
          if (containsPhi && !classification.complianceFrameworks.includes('HIPAA')) {
            return false;
          }
          if (containsPii && !classification.complianceFrameworks.includes('GDPR')) {
            return false;
          }
          return true;
        }),
        { numRuns: 10 }
      );
    });
  });
});

// ============================================================================
// MEDICAL HISTORY STORAGE RESTRICTION TESTS
// ============================================================================

describe('Medical History Storage Restrictions', () => {
  let service: DataClassificationService;
  let repository: InMemoryClassificationRepository;

  beforeEach(() => {
    repository = new InMemoryClassificationRepository();
    service = new DataClassificationService({
      repository,
      config: {
        requirePhiEncryption: true,
        requirePiiRls: true,
      },
    });
  });

  it('should detect PHI from column names when auto-detect is enabled', async () => {
    // Create service with auto-detect enabled
    const serviceWithAutoDetect = new DataClassificationService({
      repository,
      config: {
        requirePhiEncryption: true,
        requirePiiRls: true,
        autoDetectPhi: true,
        autoDetectPii: true,
      },
    });

    await serviceWithAutoDetect.upsertClassification({
      tableName: 'medical_history',
      schemaName: 'public',
      sensitivityLevel: 'general', // Will be upgraded based on column detection
      containsPii: false,
      containsPhi: false,
      complianceFrameworks: [],
      columns: [
        {
          columnName: 'diagnosis', // PHI column name pattern
          dataType: 'text',
          sensitivityLevel: 'general',
          isPii: false,
          isPhi: false,
          redactInLogs: false,
        },
      ],
    });

    // Service should auto-detect PHI based on column name 'diagnosis'
    const classification = await serviceWithAutoDetect.getTableClassification('medical_history');
    expect(classification?.containsPhi).toBe(true);
  });

  it('should require encryption for any table containing diagnosis information', async () => {
    await service.upsertClassification({
      tableName: 'diagnosis_records',
      schemaName: 'public',
      sensitivityLevel: 'PHI',
      containsPii: true,
      containsPhi: true,
      complianceFrameworks: ['HIPAA'],
      columns: [
        {
          columnName: 'icd10_code',
          dataType: 'varchar',
          sensitivityLevel: 'PHI',
          isPii: false,
          isPhi: true,
          redactInLogs: true,
        },
      ],
      encryptionRequirement: 'none',
    });

    const result = await service.validateTableCompliance('diagnosis_records');

    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.includes('encryption'))).toBe(true);
  });

  it('should enforce access controls on treatment history tables', async () => {
    await service.upsertClassification({
      tableName: 'treatment_history',
      schemaName: 'public',
      sensitivityLevel: 'PHI',
      containsPii: true,
      containsPhi: true,
      complianceFrameworks: ['HIPAA'],
      columns: [],
      rlsEnabled: false,
    });

    const result = await service.validateTableCompliance('treatment_history');

    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.includes('RLS'))).toBe(true);
  });

  it('should track all PHI tables for compliance audits', async () => {
    await service.upsertClassification(createPhiTableClassification());
    await service.upsertClassification({
      ...createPhiTableClassification(),
      tableName: 'lab_results',
    });
    await service.upsertClassification({
      ...createPhiTableClassification(),
      tableName: 'prescriptions',
    });

    const phiTables = await service.getTablesWithPhi();

    expect(phiTables).toHaveLength(3);
    expect(phiTables.map((t) => t.tableName)).toContain('medical_records');
    expect(phiTables.map((t) => t.tableName)).toContain('lab_results');
    expect(phiTables.map((t) => t.tableName)).toContain('prescriptions');
  });

  it('should generate compliance gaps for missing column classifications', async () => {
    await service.upsertClassification({
      tableName: 'patient_data',
      schemaName: 'public',
      sensitivityLevel: 'PHI',
      containsPii: true,
      containsPhi: false, // No PHI marked but PII exists
      complianceFrameworks: ['GDPR'],
      columns: [], // No column-level classification
    });

    const gaps = await service.getComplianceGaps();

    expect(gaps.some((g) => g.gapType === 'missing_column_classification')).toBe(true);
  });
});
