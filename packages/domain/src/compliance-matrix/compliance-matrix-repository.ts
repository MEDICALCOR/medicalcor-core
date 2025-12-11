/**
 * Compliance Matrix Repository Port
 *
 * Defines the persistence interface for compliance matrix operations.
 * This is a driven port (secondary) in hexagonal architecture.
 *
 * @module @medicalcor/domain/compliance-matrix
 */

import type {
  ComplianceMatrix,
  ConstraintDefinition,
  SprintDefinition,
  SprintComplianceEntry,
  ComplianceQueryFilters,
  SprintComplianceSummary,
  CategoryComplianceSummary,
  ConstraintCategory,
  ComplianceStatus,
} from '@medicalcor/types';

/**
 * Repository interface for compliance matrix persistence
 *
 * Implementations should handle:
 * - PostgreSQL adapter for production
 * - In-memory adapter for testing
 */
export interface ComplianceMatrixRepository {
  // ===========================================================================
  // Matrix Operations
  // ===========================================================================

  /**
   * Get a compliance matrix by ID
   */
  findById(matrixId: string): Promise<ComplianceMatrix | null>;

  /**
   * Get the default/active compliance matrix
   */
  findDefault(): Promise<ComplianceMatrix | null>;

  /**
   * Save a compliance matrix (upsert)
   */
  save(matrix: ComplianceMatrix): Promise<ComplianceMatrix>;

  /**
   * Delete a compliance matrix
   */
  delete(matrixId: string): Promise<void>;

  // ===========================================================================
  // Constraint Operations
  // ===========================================================================

  /**
   * Add a constraint to a matrix
   */
  addConstraint(matrixId: string, constraint: ConstraintDefinition): Promise<ConstraintDefinition>;

  /**
   * Update a constraint
   */
  updateConstraint(
    matrixId: string,
    constraintId: string,
    updates: Partial<ConstraintDefinition>
  ): Promise<ConstraintDefinition>;

  /**
   * Remove a constraint from a matrix
   */
  removeConstraint(matrixId: string, constraintId: string): Promise<void>;

  /**
   * Get all constraints for a matrix
   */
  findConstraints(matrixId: string): Promise<ConstraintDefinition[]>;

  /**
   * Get constraints by category
   */
  findConstraintsByCategory(
    matrixId: string,
    category: ConstraintCategory
  ): Promise<ConstraintDefinition[]>;

  // ===========================================================================
  // Sprint Operations
  // ===========================================================================

  /**
   * Add a sprint to a matrix
   */
  addSprint(matrixId: string, sprint: SprintDefinition): Promise<SprintDefinition>;

  /**
   * Update a sprint
   */
  updateSprint(
    matrixId: string,
    sprintId: string,
    updates: Partial<SprintDefinition>
  ): Promise<SprintDefinition>;

  /**
   * Remove a sprint from a matrix
   */
  removeSprint(matrixId: string, sprintId: string): Promise<void>;

  /**
   * Get all sprints for a matrix
   */
  findSprints(matrixId: string): Promise<SprintDefinition[]>;

  /**
   * Get the current sprint
   */
  findCurrentSprint(matrixId: string): Promise<SprintDefinition | null>;

  // ===========================================================================
  // Compliance Entry Operations
  // ===========================================================================

  /**
   * Upsert a compliance entry (create or update)
   */
  upsertEntry(matrixId: string, entry: SprintComplianceEntry): Promise<SprintComplianceEntry>;

  /**
   * Get an entry by constraint and sprint
   */
  findEntry(
    matrixId: string,
    constraintId: string,
    sprintId: string
  ): Promise<SprintComplianceEntry | null>;

  /**
   * Get all entries for a sprint
   */
  findEntriesBySprint(matrixId: string, sprintId: string): Promise<SprintComplianceEntry[]>;

  /**
   * Get all entries for a constraint
   */
  findEntriesByConstraint(matrixId: string, constraintId: string): Promise<SprintComplianceEntry[]>;

  /**
   * Query entries with filters
   */
  queryEntries(matrixId: string, filters: ComplianceQueryFilters): Promise<SprintComplianceEntry[]>;

  /**
   * Get entries needing attention (non-compliant or overdue in-progress)
   */
  findEntriesNeedingAttention(matrixId: string): Promise<SprintComplianceEntry[]>;

  /**
   * Delete an entry
   */
  deleteEntry(matrixId: string, constraintId: string, sprintId: string): Promise<void>;

  // ===========================================================================
  // Reporting Operations
  // ===========================================================================

  /**
   * Get compliance summary for a sprint
   */
  getSprintSummary(matrixId: string, sprintId: string): Promise<SprintComplianceSummary>;

  /**
   * Get compliance summaries for all sprints
   */
  getAllSprintSummaries(matrixId: string): Promise<SprintComplianceSummary[]>;

  /**
   * Get compliance summary by category
   */
  getCategorySummary(matrixId: string, sprintId: string): Promise<CategoryComplianceSummary[]>;

  /**
   * Get count of entries by status
   */
  getStatusCounts(matrixId: string, sprintId: string): Promise<Record<ComplianceStatus, number>>;

  /**
   * Get critical and high violations for a sprint
   */
  getViolationCounts(
    matrixId: string,
    sprintId: string
  ): Promise<{ critical: number; high: number }>;

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Bulk upsert entries
   */
  bulkUpsertEntries(
    matrixId: string,
    entries: SprintComplianceEntry[]
  ): Promise<SprintComplianceEntry[]>;

  /**
   * Copy entries from one sprint to another
   */
  copyEntriesFromSprint(
    matrixId: string,
    fromSprintId: string,
    toSprintId: string
  ): Promise<SprintComplianceEntry[]>;
}
