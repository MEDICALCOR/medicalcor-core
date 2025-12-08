/**
 * @fileoverview PostgreSQL Data Classification Repository (Infrastructure Layer)
 *
 * Concrete PostgreSQL adapter implementing the DataClassificationRepository port
 * from the domain layer. Handles all database operations for data classifications.
 *
 * @module @medicalcor/infrastructure/repositories/postgres-data-classification-repository
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** - it implements the port (DataClassificationRepository)
 * defined in the domain. The domain layer depends only on the interface, not this implementation.
 *
 * @example
 * ```typescript
 * import { PostgresDataClassificationRepository } from '@medicalcor/infrastructure';
 *
 * const repository = new PostgresDataClassificationRepository({
 *   connectionString: process.env.DATABASE_URL,
 * });
 *
 * const classification = await repository.findByTable('leads');
 * const piiTables = await repository.findTablesWithPii();
 * ```
 */

import { Pool, type PoolConfig } from 'pg';
import { createLogger } from '@medicalcor/core';
import type {
  TableClassification,
  CreateTableClassification,
  UpdateTableClassification,
  ClassificationQueryFilters,
  ClassificationSummary,
  ComplianceGap,
  ColumnClassification,
  DataSensitivityLevel,
  ComplianceFramework,
  EncryptionRequirement,
  RetentionCategory,
} from '@medicalcor/types';
import type { DataClassificationRepository } from '@medicalcor/domain';

const logger = createLogger({ name: 'postgres-data-classification-repository' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for PostgreSQL Data Classification Repository
 */
export interface PostgresDataClassificationRepositoryConfig {
  /** PostgreSQL connection string or pool */
  connectionString?: string;
  /** Existing connection pool (alternative to connectionString) */
  pool?: Pool;
  /** Maximum connections in the pool (default: 5) */
  maxConnections?: number;
}

// ============================================================================
// DATABASE ROW TYPES
// ============================================================================

interface ClassificationRow {
  id: string;
  table_name: string;
  schema_name: string;
  sensitivity_level: string;
  contains_pii: boolean;
  contains_phi: boolean;
  contains_financial: boolean;
  compliance_frameworks: string[];
  encryption_requirement: string;
  retention_category: string;
  rls_enabled: boolean;
  soft_delete_enabled: boolean;
  columns: ColumnClassification[];
  description: string | null;
  compliance_notes: string | null;
  last_reviewed_at: Date | null;
  reviewed_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * PostgreSQL implementation of DataClassificationRepository
 */
export class PostgresDataClassificationRepository implements DataClassificationRepository {
  private pool: Pool;
  private ownsPool: boolean;

  constructor(config: PostgresDataClassificationRepositoryConfig) {
    if (config.pool) {
      this.pool = config.pool;
      this.ownsPool = false;
    } else if (config.connectionString) {
      const poolConfig: PoolConfig = {
        connectionString: config.connectionString,
        max: config.maxConnections ?? 5,
      };
      this.pool = new Pool(poolConfig);
      this.ownsPool = true;
    } else {
      throw new Error('Either connectionString or pool must be provided');
    }
  }

  /**
   * Close the connection pool if we own it
   */
  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  async findByTable(tableName: string, schemaName = 'public'): Promise<TableClassification | null> {
    const result = await this.pool.query<ClassificationRow>(
      `SELECT * FROM data_classification
       WHERE table_name = $1 AND schema_name = $2`,
      [tableName, schemaName]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.rowToClassification(row);
  }

  async findAll(): Promise<TableClassification[]> {
    const result = await this.pool.query<ClassificationRow>(
      `SELECT * FROM data_classification ORDER BY table_name`
    );

    return result.rows.map((row) => this.rowToClassification(row));
  }

  async findByFilters(filters: ClassificationQueryFilters): Promise<TableClassification[]> {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.sensitivityLevel) {
      conditions.push(`sensitivity_level = $${paramIndex++}`);
      params.push(filters.sensitivityLevel);
    }

    if (filters.containsPii !== undefined) {
      conditions.push(`contains_pii = $${paramIndex++}`);
      params.push(filters.containsPii);
    }

    if (filters.containsPhi !== undefined) {
      conditions.push(`contains_phi = $${paramIndex++}`);
      params.push(filters.containsPhi);
    }

    if (filters.complianceFramework) {
      conditions.push(`$${paramIndex++} = ANY(compliance_frameworks)`);
      params.push(filters.complianceFramework);
    }

    if (filters.retentionCategory) {
      conditions.push(`retention_category = $${paramIndex++}`);
      params.push(filters.retentionCategory);
    }

    if (filters.rlsEnabled !== undefined) {
      conditions.push(`rls_enabled = $${paramIndex++}`);
      params.push(filters.rlsEnabled);
    }

    if (filters.tableNameSearch) {
      conditions.push(`table_name ILIKE $${paramIndex++}`);
      params.push(`%${filters.tableNameSearch}%`);
    }

    const result = await this.pool.query<ClassificationRow>(
      `SELECT * FROM data_classification
       WHERE ${conditions.join(' AND ')}
       ORDER BY table_name`,
      params
    );

    return result.rows.map((row) => this.rowToClassification(row));
  }

  async upsert(classification: CreateTableClassification): Promise<TableClassification> {
    const result = await this.pool.query<ClassificationRow>(
      `INSERT INTO data_classification (
        table_name, schema_name, sensitivity_level, contains_pii, contains_phi,
        contains_financial, compliance_frameworks, encryption_requirement,
        retention_category, rls_enabled, soft_delete_enabled, columns,
        description, compliance_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (schema_name, table_name) DO UPDATE SET
        sensitivity_level = EXCLUDED.sensitivity_level,
        contains_pii = EXCLUDED.contains_pii,
        contains_phi = EXCLUDED.contains_phi,
        contains_financial = EXCLUDED.contains_financial,
        compliance_frameworks = EXCLUDED.compliance_frameworks,
        encryption_requirement = EXCLUDED.encryption_requirement,
        retention_category = EXCLUDED.retention_category,
        rls_enabled = EXCLUDED.rls_enabled,
        soft_delete_enabled = EXCLUDED.soft_delete_enabled,
        columns = EXCLUDED.columns,
        description = EXCLUDED.description,
        compliance_notes = EXCLUDED.compliance_notes,
        updated_at = NOW()
      RETURNING *`,
      [
        classification.tableName,
        classification.schemaName,
        classification.sensitivityLevel,
        classification.containsPii,
        classification.containsPhi,
        classification.containsFinancial,
        classification.complianceFrameworks,
        classification.encryptionRequirement,
        classification.retentionCategory,
        classification.rlsEnabled,
        classification.softDeleteEnabled,
        JSON.stringify(classification.columns),
        classification.description ?? null,
        classification.complianceNotes ?? null,
      ]
    );

    const upsertedRow = result.rows[0];
    if (!upsertedRow) {
      throw new Error(`Failed to upsert classification for table: ${classification.tableName}`);
    }

    logger.info({ tableName: classification.tableName }, 'Classification upserted');

    return this.rowToClassification(upsertedRow);
  }

  async update(classification: UpdateTableClassification): Promise<TableClassification> {
    const updates: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (classification.sensitivityLevel !== undefined) {
      updates.push(`sensitivity_level = $${paramIndex++}`);
      params.push(classification.sensitivityLevel);
    }

    if (classification.containsPii !== undefined) {
      updates.push(`contains_pii = $${paramIndex++}`);
      params.push(classification.containsPii);
    }

    if (classification.containsPhi !== undefined) {
      updates.push(`contains_phi = $${paramIndex++}`);
      params.push(classification.containsPhi);
    }

    if (classification.containsFinancial !== undefined) {
      updates.push(`contains_financial = $${paramIndex++}`);
      params.push(classification.containsFinancial);
    }

    if (classification.complianceFrameworks !== undefined) {
      updates.push(`compliance_frameworks = $${paramIndex++}`);
      params.push(classification.complianceFrameworks);
    }

    if (classification.encryptionRequirement !== undefined) {
      updates.push(`encryption_requirement = $${paramIndex++}`);
      params.push(classification.encryptionRequirement);
    }

    if (classification.retentionCategory !== undefined) {
      updates.push(`retention_category = $${paramIndex++}`);
      params.push(classification.retentionCategory);
    }

    if (classification.rlsEnabled !== undefined) {
      updates.push(`rls_enabled = $${paramIndex++}`);
      params.push(classification.rlsEnabled);
    }

    if (classification.softDeleteEnabled !== undefined) {
      updates.push(`soft_delete_enabled = $${paramIndex++}`);
      params.push(classification.softDeleteEnabled);
    }

    if (classification.columns !== undefined) {
      updates.push(`columns = $${paramIndex++}`);
      params.push(JSON.stringify(classification.columns));
    }

    if (classification.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(classification.description);
    }

    if (classification.complianceNotes !== undefined) {
      updates.push(`compliance_notes = $${paramIndex++}`);
      params.push(classification.complianceNotes);
    }

    params.push(classification.tableName);

    const result = await this.pool.query<ClassificationRow>(
      `UPDATE data_classification
       SET ${updates.join(', ')}
       WHERE table_name = $${paramIndex}
       RETURNING *`,
      params
    );

    const updatedRow = result.rows[0];
    if (!updatedRow) {
      throw new Error(`Classification not found for table: ${classification.tableName}`);
    }

    return this.rowToClassification(updatedRow);
  }

  async delete(tableName: string, schemaName = 'public'): Promise<void> {
    await this.pool.query(
      `DELETE FROM data_classification
       WHERE table_name = $1 AND schema_name = $2`,
      [tableName, schemaName]
    );

    logger.info({ tableName, schemaName }, 'Classification deleted');
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  async findTablesWithPii(): Promise<TableClassification[]> {
    const result = await this.pool.query<ClassificationRow>(
      `SELECT * FROM data_classification
       WHERE contains_pii = true
       ORDER BY table_name`
    );

    return result.rows.map((row) => this.rowToClassification(row));
  }

  async findTablesWithPhi(): Promise<TableClassification[]> {
    const result = await this.pool.query<ClassificationRow>(
      `SELECT * FROM data_classification
       WHERE contains_phi = true
       ORDER BY table_name`
    );

    return result.rows.map((row) => this.rowToClassification(row));
  }

  async findBySensitivityLevel(level: DataSensitivityLevel): Promise<TableClassification[]> {
    const result = await this.pool.query<ClassificationRow>(
      `SELECT * FROM data_classification
       WHERE sensitivity_level = $1
       ORDER BY table_name`,
      [level]
    );

    return result.rows.map((row) => this.rowToClassification(row));
  }

  async findByComplianceFramework(framework: string): Promise<TableClassification[]> {
    const result = await this.pool.query<ClassificationRow>(
      `SELECT * FROM data_classification
       WHERE $1 = ANY(compliance_frameworks)
       ORDER BY table_name`,
      [framework]
    );

    return result.rows.map((row) => this.rowToClassification(row));
  }

  // ==========================================================================
  // Compliance Reporting
  // ==========================================================================

  async getSummary(): Promise<ClassificationSummary> {
    const [totals, bySensitivity, byFramework, byRetention] = await Promise.all([
      this.fetchSummaryTotals(),
      this.fetchBySensitivityLevel(),
      this.fetchByComplianceFramework(),
      this.fetchByRetentionCategory(),
    ]);

    return {
      ...totals,
      bySensitivityLevel: bySensitivity as Record<DataSensitivityLevel, number>,
      byComplianceFramework: byFramework as Record<ComplianceFramework, number>,
      byRetentionCategory: byRetention as Record<RetentionCategory, number>,
      lastUpdatedAt: new Date(),
    };
  }

  private async fetchSummaryTotals(): Promise<{
    totalTables: number;
    tablesWithPii: number;
    tablesWithPhi: number;
    tablesWithFinancial: number;
    tablesWithRls: number;
    tablesWithEncryption: number;
  }> {
    const result = await this.pool.query<{
      total_tables: string;
      tables_with_pii: string;
      tables_with_phi: string;
      tables_with_financial: string;
      tables_with_rls: string;
      tables_with_encryption: string;
    }>(
      `SELECT
        COUNT(*) as total_tables,
        SUM(CASE WHEN contains_pii THEN 1 ELSE 0 END) as tables_with_pii,
        SUM(CASE WHEN contains_phi THEN 1 ELSE 0 END) as tables_with_phi,
        SUM(CASE WHEN contains_financial THEN 1 ELSE 0 END) as tables_with_financial,
        SUM(CASE WHEN rls_enabled THEN 1 ELSE 0 END) as tables_with_rls,
        SUM(CASE WHEN encryption_requirement IN ('required', 'field_level') THEN 1 ELSE 0 END) as tables_with_encryption
       FROM data_classification`
    );

    const row = result.rows[0];
    return {
      totalTables: parseInt(row?.total_tables ?? '0', 10),
      tablesWithPii: parseInt(row?.tables_with_pii ?? '0', 10),
      tablesWithPhi: parseInt(row?.tables_with_phi ?? '0', 10),
      tablesWithFinancial: parseInt(row?.tables_with_financial ?? '0', 10),
      tablesWithRls: parseInt(row?.tables_with_rls ?? '0', 10),
      tablesWithEncryption: parseInt(row?.tables_with_encryption ?? '0', 10),
    };
  }

  private async fetchBySensitivityLevel(): Promise<Partial<Record<DataSensitivityLevel, number>>> {
    const result = await this.pool.query<{ sensitivity_level: string; count: string }>(
      `SELECT sensitivity_level, COUNT(*) as count
       FROM data_classification
       GROUP BY sensitivity_level`
    );

    const breakdown: Partial<Record<DataSensitivityLevel, number>> = {};
    for (const r of result.rows) {
      breakdown[r.sensitivity_level as DataSensitivityLevel] = parseInt(r.count, 10);
    }
    return breakdown;
  }

  private async fetchByComplianceFramework(): Promise<
    Partial<Record<ComplianceFramework, number>>
  > {
    const result = await this.pool.query<{ framework: string; count: string }>(
      `SELECT unnest(compliance_frameworks) as framework, COUNT(*) as count
       FROM data_classification
       GROUP BY unnest(compliance_frameworks)`
    );

    const breakdown: Partial<Record<ComplianceFramework, number>> = {};
    for (const r of result.rows) {
      breakdown[r.framework as ComplianceFramework] = parseInt(r.count, 10);
    }
    return breakdown;
  }

  private async fetchByRetentionCategory(): Promise<Partial<Record<RetentionCategory, number>>> {
    const result = await this.pool.query<{ retention_category: string; count: string }>(
      `SELECT retention_category, COUNT(*) as count
       FROM data_classification
       GROUP BY retention_category`
    );

    const breakdown: Partial<Record<RetentionCategory, number>> = {};
    for (const r of result.rows) {
      breakdown[r.retention_category as RetentionCategory] = parseInt(r.count, 10);
    }
    return breakdown;
  }

  async getComplianceGaps(): Promise<ComplianceGap[]> {
    const result = await this.pool.query<{
      table_name: string;
      gap_type: string;
      severity: string;
      description: string;
    }>(`SELECT * FROM data_classification_gaps`);

    return result.rows.map((row) => ({
      tableName: row.table_name,
      gapType: row.gap_type as ComplianceGap['gapType'],
      severity: row.severity as ComplianceGap['severity'],
      description: row.description,
      remediation: this.getRemediationForGap(row.gap_type),
      affectedFrameworks: this.getAffectedFrameworksForGap(row.gap_type),
    }));
  }

  async getStaleReviews(): Promise<string[]> {
    const result = await this.pool.query<{ table_name: string }>(
      `SELECT table_name FROM data_classification
       WHERE last_reviewed_at IS NULL
          OR last_reviewed_at < NOW() - INTERVAL '90 days'
       ORDER BY table_name`
    );

    return result.rows.map((row) => row.table_name);
  }

  async markAsReviewed(tableName: string, reviewedBy: string): Promise<void> {
    await this.pool.query(
      `UPDATE data_classification
       SET last_reviewed_at = NOW(), reviewed_by = $1, updated_at = NOW()
       WHERE table_name = $2`,
      [reviewedBy, tableName]
    );

    logger.info({ tableName, reviewedBy }, 'Classification marked as reviewed');
  }

  // ==========================================================================
  // Column Operations
  // ==========================================================================

  async isColumnPii(tableName: string, columnName: string): Promise<boolean> {
    const result = await this.pool.query<{ is_pii: boolean }>(
      `SELECT is_column_pii($1, $2) as is_pii`,
      [tableName, columnName]
    );

    return result.rows[0]?.is_pii ?? false;
  }

  async getColumnClassifications(tableName: string): Promise<ColumnClassification[]> {
    const result = await this.pool.query<{ columns: ColumnClassification[] }>(
      `SELECT columns FROM data_classification WHERE table_name = $1`,
      [tableName]
    );

    return result.rows[0]?.columns ?? [];
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private rowToClassification(row: ClassificationRow): TableClassification {
    return {
      tableName: row.table_name,
      schemaName: row.schema_name,
      sensitivityLevel: row.sensitivity_level as DataSensitivityLevel,
      containsPii: row.contains_pii,
      containsPhi: row.contains_phi,
      containsFinancial: row.contains_financial,
      complianceFrameworks: row.compliance_frameworks as ComplianceFramework[],
      encryptionRequirement: row.encryption_requirement as EncryptionRequirement,
      retentionCategory: row.retention_category as RetentionCategory,
      rlsEnabled: row.rls_enabled,
      softDeleteEnabled: row.soft_delete_enabled,
      columns: row.columns,
      description: row.description ?? undefined,
      complianceNotes: row.compliance_notes ?? undefined,
      lastReviewedAt: row.last_reviewed_at ?? undefined,
      reviewedBy: row.reviewed_by ?? undefined,
    };
  }

  private getRemediationForGap(gapType: string): string {
    const remediations: Record<string, string> = {
      missing_encryption: 'Add encryption_requirement = "required" or "field_level" for PHI tables',
      missing_rls: 'Enable Row Level Security on this table',
      stale_review: 'Review and update the classification for this table',
      missing_soft_delete: 'Add deleted_at column for GDPR erasure compliance',
      missing_column_classification: 'Add column-level classifications to document PII locations',
    };
    return remediations[gapType] ?? 'Review and address the compliance gap';
  }

  private getAffectedFrameworksForGap(gapType: string): ComplianceFramework[] {
    const frameworks: Record<string, ComplianceFramework[]> = {
      missing_encryption: ['HIPAA', 'SOC2'],
      missing_rls: ['HIPAA', 'GDPR', 'SOC2'],
      stale_review: ['SOC2', 'ISO27001'],
      missing_soft_delete: ['GDPR'],
      missing_column_classification: ['GDPR', 'HIPAA'],
    };
    return frameworks[gapType] ?? ['SOC2'];
  }
}

/**
 * Factory function to create PostgresDataClassificationRepository
 */
export function createDataClassificationRepository(
  config: PostgresDataClassificationRepositoryConfig
): PostgresDataClassificationRepository {
  return new PostgresDataClassificationRepository(config);
}
