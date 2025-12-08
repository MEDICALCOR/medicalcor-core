/**
 * Data Classification Repository Interface
 *
 * Port interface for data classification persistence.
 * Implementation in infrastructure layer (PostgreSQL adapter).
 *
 * @module @medicalcor/domain/data-classification
 */

import type {
  TableClassification,
  CreateTableClassification,
  UpdateTableClassification,
  ClassificationQueryFilters,
  ClassificationSummary,
  ComplianceGap,
  ColumnClassification,
} from '@medicalcor/types';

/**
 * Repository interface for data classification persistence
 *
 * HEXAGONAL ARCHITECTURE:
 * - This is a PORT (interface) in the domain layer
 * - Adapters (PostgreSQL, in-memory) implement this in infrastructure layer
 */
export interface DataClassificationRepository {
  /**
   * Get classification for a specific table
   * @param tableName - Name of the table
   * @param schemaName - Schema name (default: 'public')
   */
  findByTable(tableName: string, schemaName?: string): Promise<TableClassification | null>;

  /**
   * Get all table classifications
   */
  findAll(): Promise<TableClassification[]>;

  /**
   * Query classifications with filters
   */
  findByFilters(filters: ClassificationQueryFilters): Promise<TableClassification[]>;

  /**
   * Create or update a table classification
   */
  upsert(classification: CreateTableClassification): Promise<TableClassification>;

  /**
   * Update an existing classification
   */
  update(classification: UpdateTableClassification): Promise<TableClassification>;

  /**
   * Delete a classification
   */
  delete(tableName: string, schemaName?: string): Promise<void>;

  /**
   * Get tables containing PII
   */
  findTablesWithPii(): Promise<TableClassification[]>;

  /**
   * Get tables containing PHI
   */
  findTablesWithPhi(): Promise<TableClassification[]>;

  /**
   * Get tables by sensitivity level
   */
  findBySensitivityLevel(
    level: TableClassification['sensitivityLevel']
  ): Promise<TableClassification[]>;

  /**
   * Get tables by compliance framework
   */
  findByComplianceFramework(framework: string): Promise<TableClassification[]>;

  /**
   * Get summary statistics
   */
  getSummary(): Promise<ClassificationSummary>;

  /**
   * Identify compliance gaps
   */
  getComplianceGaps(): Promise<ComplianceGap[]>;

  /**
   * Get tables needing review (stale > 90 days)
   */
  getStaleReviews(): Promise<string[]>;

  /**
   * Mark a table as reviewed
   */
  markAsReviewed(tableName: string, reviewedBy: string): Promise<void>;

  /**
   * Check if a specific column is classified as PII
   */
  isColumnPii(tableName: string, columnName: string): Promise<boolean>;

  /**
   * Get column classifications for a table
   */
  getColumnClassifications(tableName: string): Promise<ColumnClassification[]>;
}

/**
 * Result types for repository operations
 */
export interface ClassificationRepositoryResult<T> {
  success: boolean;
  data?: T;
  error?: ClassificationRepositoryError;
}

export interface ClassificationRepositoryError {
  code: ClassificationRepositoryErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type ClassificationRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE_ENTRY'
  | 'VALIDATION_ERROR'
  | 'DATABASE_ERROR'
  | 'CONNECTION_ERROR';
