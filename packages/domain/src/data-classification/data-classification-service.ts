/**
 * Data Classification Service (L6 Feature)
 *
 * Manages data classification labels for HIPAA/GDPR compliance.
 * Provides explicit PII/PHI/sensitive labels for database tables.
 *
 * HEXAGONAL ARCHITECTURE:
 * - This is a DOMAIN SERVICE (pure business logic)
 * - Dependencies (logger, repository) are injected via constructor
 * - No framework/infrastructure imports allowed
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
  ClassificationComplianceReport,
  DataSensitivityLevel,
  ComplianceFramework,
  ColumnClassification,
} from '@medicalcor/types';
import {
  getHighestSensitivity,
  getRequiredFrameworks,
  isPiiColumnName,
  isPhiColumnName,
} from '@medicalcor/types';
import type { DataClassificationRepository } from './data-classification-repository.js';

/**
 * Logger interface for dependency injection
 */
export interface ClassificationLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
}

/**
 * No-op logger for when no logger is provided
 */
const noopLogger: ClassificationLogger = {
  info: () => {
    /* intentionally empty */
  },
  warn: () => {
    /* intentionally empty */
  },
  error: () => {
    /* intentionally empty */
  },
  debug: () => {
    /* intentionally empty */
  },
};

/**
 * Configuration for the classification service
 */
export interface DataClassificationConfig {
  /** Days after which a review is considered stale */
  staleReviewDays: number;
  /** Automatically infer PII from column names */
  autoDetectPii: boolean;
  /** Automatically infer PHI from column names */
  autoDetectPhi: boolean;
  /** Require encryption for PHI tables */
  requirePhiEncryption: boolean;
  /** Require RLS for PII/PHI tables */
  requirePiiRls: boolean;
}

const DEFAULT_CONFIG: DataClassificationConfig = {
  staleReviewDays: 90,
  autoDetectPii: true,
  autoDetectPhi: true,
  requirePhiEncryption: true,
  requirePiiRls: true,
};

/**
 * Options for creating the DataClassificationService
 */
export interface DataClassificationServiceOptions {
  /**
   * Classification repository for persistence (REQUIRED).
   */
  repository: DataClassificationRepository;
  /**
   * Configuration overrides (optional).
   */
  config?: Partial<DataClassificationConfig>;
  /**
   * Logger instance for audit and debug logging.
   */
  logger?: ClassificationLogger;
}

/**
 * Data Classification Service
 *
 * Provides CRUD operations and compliance reporting for data classifications.
 * Helps maintain HIPAA/GDPR compliance by tracking PII/PHI locations.
 *
 * @example
 * ```typescript
 * import { DataClassificationService } from '@medicalcor/domain';
 * import { PostgresClassificationRepository } from '@medicalcor/infrastructure';
 *
 * const repository = new PostgresClassificationRepository({ pool });
 * const service = new DataClassificationService({ repository });
 *
 * // Get classification for a table
 * const classification = await service.getTableClassification('leads');
 *
 * // Generate compliance report
 * const report = await service.generateComplianceReport();
 * ```
 */
export class DataClassificationService {
  private config: DataClassificationConfig;
  private repository: DataClassificationRepository;
  private logger: ClassificationLogger;

  constructor(options: DataClassificationServiceOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.repository = options.repository;
    this.logger = options.logger ?? noopLogger;
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Get classification for a specific table
   */
  async getTableClassification(
    tableName: string,
    schemaName = 'public'
  ): Promise<TableClassification | null> {
    return this.repository.findByTable(tableName, schemaName);
  }

  /**
   * Get all table classifications
   */
  async getAllClassifications(): Promise<TableClassification[]> {
    return this.repository.findAll();
  }

  /**
   * Query classifications with filters
   */
  async queryClassifications(filters: ClassificationQueryFilters): Promise<TableClassification[]> {
    return this.repository.findByFilters(filters);
  }

  /**
   * Create or update a table classification
   */
  async upsertClassification(
    classification: CreateTableClassification
  ): Promise<TableClassification> {
    // Auto-enhance classification if enabled
    const enhanced = this.enhanceClassification(classification);

    const result = await this.repository.upsert(enhanced);

    this.logger.info(
      {
        tableName: result.tableName,
        sensitivityLevel: result.sensitivityLevel,
        containsPii: result.containsPii,
        containsPhi: result.containsPhi,
      },
      'Table classification upserted'
    );

    return result;
  }

  /**
   * Update an existing classification
   */
  async updateClassification(
    classification: UpdateTableClassification
  ): Promise<TableClassification> {
    const result = await this.repository.update(classification);

    this.logger.info({ tableName: result.tableName }, 'Table classification updated');

    return result;
  }

  /**
   * Delete a classification
   */
  async deleteClassification(tableName: string, schemaName = 'public'): Promise<void> {
    await this.repository.delete(tableName, schemaName);

    this.logger.info({ tableName, schemaName }, 'Table classification deleted');
  }

  /**
   * Mark a table's classification as reviewed
   */
  async markAsReviewed(tableName: string, reviewedBy: string): Promise<void> {
    await this.repository.markAsReviewed(tableName, reviewedBy);

    this.logger.info({ tableName, reviewedBy }, 'Classification marked as reviewed');
  }

  // ===========================================================================
  // Query Operations
  // ===========================================================================

  /**
   * Get all tables containing PII
   */
  async getTablesWithPii(): Promise<TableClassification[]> {
    return this.repository.findTablesWithPii();
  }

  /**
   * Get all tables containing PHI
   */
  async getTablesWithPhi(): Promise<TableClassification[]> {
    return this.repository.findTablesWithPhi();
  }

  /**
   * Get tables by sensitivity level
   */
  async getTablesBySensitivity(level: DataSensitivityLevel): Promise<TableClassification[]> {
    return this.repository.findBySensitivityLevel(level);
  }

  /**
   * Get tables requiring a specific compliance framework
   */
  async getTablesByComplianceFramework(
    framework: ComplianceFramework
  ): Promise<TableClassification[]> {
    return this.repository.findByComplianceFramework(framework);
  }

  /**
   * Check if a specific column is PII
   */
  async isColumnPii(tableName: string, columnName: string): Promise<boolean> {
    return this.repository.isColumnPii(tableName, columnName);
  }

  /**
   * Get column classifications for a table
   */
  async getColumnClassifications(tableName: string): Promise<ColumnClassification[]> {
    return this.repository.getColumnClassifications(tableName);
  }

  // ===========================================================================
  // Compliance Reporting
  // ===========================================================================

  /**
   * Get summary statistics for all classifications
   */
  async getSummary(): Promise<ClassificationSummary> {
    return this.repository.getSummary();
  }

  /**
   * Identify compliance gaps across all tables
   */
  async getComplianceGaps(): Promise<ComplianceGap[]> {
    const gaps = await this.repository.getComplianceGaps();

    // Add additional business logic checks
    const additionalGaps = await this.detectAdditionalGaps();

    return [...gaps, ...additionalGaps];
  }

  /**
   * Get tables with stale reviews
   */
  async getStaleReviews(): Promise<string[]> {
    return this.repository.getStaleReviews();
  }

  /**
   * Generate full compliance report
   */
  async generateComplianceReport(): Promise<ClassificationComplianceReport> {
    const [summary, gaps, staleReviews] = await Promise.all([
      this.getSummary(),
      this.getComplianceGaps(),
      this.getStaleReviews(),
    ]);

    // Identify high-risk tables (PHI without encryption or RLS)
    const allClassifications = await this.getAllClassifications();
    const highRiskTables = allClassifications
      .filter((c) => {
        if (c.containsPhi) {
          if (this.config.requirePhiEncryption && c.encryptionRequirement === 'none') {
            return true;
          }
          if (this.config.requirePiiRls && !c.rlsEnabled) {
            return true;
          }
        }
        return false;
      })
      .map((c) => c.tableName);

    // Find unclassified tables (tables that exist but have no classification)
    // This would require database introspection, so for now return empty
    const unclassifiedTables: string[] = [];

    const report: ClassificationComplianceReport = {
      generatedAt: new Date(),
      summary,
      gaps,
      highRiskTables,
      staleReviews,
      unclassifiedTables,
    };

    this.logger.info(
      {
        totalTables: summary.totalTables,
        gapsCount: gaps.length,
        highRiskCount: highRiskTables.length,
      },
      'Compliance report generated'
    );

    return report;
  }

  // ===========================================================================
  // HIPAA/GDPR Audit Support
  // ===========================================================================

  /**
   * Get HIPAA audit inventory (all PHI tables with access info)
   */
  async getHipaaInventory(): Promise<TableClassification[]> {
    return this.repository.findTablesWithPhi();
  }

  /**
   * Get GDPR Article 30 inventory (all PII tables with processing info)
   */
  async getGdprArticle30Inventory(): Promise<TableClassification[]> {
    const classifications = await this.getAllClassifications();
    return classifications.filter((c) => c.containsPii || c.complianceFrameworks.includes('GDPR'));
  }

  /**
   * Validate that a table meets compliance requirements
   */
  async validateTableCompliance(tableName: string): Promise<{
    compliant: boolean;
    issues: string[];
  }> {
    const classification = await this.getTableClassification(tableName);

    if (!classification) {
      return {
        compliant: false,
        issues: ['Table has no classification - needs review'],
      };
    }

    const issues: string[] = [];

    // Check PHI requirements
    if (classification.containsPhi) {
      if (this.config.requirePhiEncryption && classification.encryptionRequirement === 'none') {
        issues.push('PHI table requires encryption but has none configured');
      }
      if (this.config.requirePiiRls && !classification.rlsEnabled) {
        issues.push('PHI table requires RLS but it is not enabled');
      }
      if (!classification.complianceFrameworks.includes('HIPAA')) {
        issues.push('PHI table should be marked with HIPAA framework');
      }
    }

    // Check PII requirements
    if (classification.containsPii) {
      if (this.config.requirePiiRls && !classification.rlsEnabled) {
        issues.push('PII table requires RLS but it is not enabled');
      }
      if (!classification.complianceFrameworks.includes('GDPR')) {
        issues.push('PII table should be marked with GDPR framework');
      }
    }

    // Check review freshness
    if (!classification.lastReviewedAt) {
      issues.push('Classification has never been reviewed');
    } else {
      const daysSinceReview = Math.floor(
        (Date.now() - new Date(classification.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceReview > this.config.staleReviewDays) {
        issues.push(`Classification review is stale (${daysSinceReview} days since last review)`);
      }
    }

    return {
      compliant: issues.length === 0,
      issues,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Enhance classification with auto-detected properties
   */
  private enhanceClassification(
    classification: CreateTableClassification
  ): CreateTableClassification {
    let enhanced = { ...classification };

    // Auto-detect PII/PHI from column names if enabled
    if (this.config.autoDetectPii || this.config.autoDetectPhi) {
      enhanced.columns = enhanced.columns.map((col) => {
        const isPii = this.config.autoDetectPii && isPiiColumnName(col.columnName);
        const isPhi = this.config.autoDetectPhi && isPhiColumnName(col.columnName);

        return {
          ...col,
          isPii: col.isPii || isPii,
          isPhi: col.isPhi || isPhi,
          redactInLogs: col.redactInLogs || isPii || isPhi,
        };
      });

      // Update table-level flags based on column detection
      const hasAnyPii = enhanced.columns.some((c) => c.isPii);
      const hasAnyPhi = enhanced.columns.some((c) => c.isPhi);

      enhanced = {
        ...enhanced,
        containsPii: enhanced.containsPii || hasAnyPii,
        containsPhi: enhanced.containsPhi || hasAnyPhi,
      };
    }

    // Auto-infer sensitivity level if not the highest
    const columnSensitivities = enhanced.columns.map((c) => c.sensitivityLevel);
    if (columnSensitivities.length > 0) {
      const highestColumnSensitivity = getHighestSensitivity(columnSensitivities);
      const currentSensitivity = enhanced.sensitivityLevel;

      // Use whichever is higher
      enhanced.sensitivityLevel = getHighestSensitivity([
        currentSensitivity,
        highestColumnSensitivity,
      ]);
    }

    // Auto-add compliance frameworks based on data types
    const requiredFrameworks = getRequiredFrameworks({
      containsPii: enhanced.containsPii,
      containsPhi: enhanced.containsPhi,
      containsFinancial: enhanced.containsFinancial,
    });

    enhanced.complianceFrameworks = [
      ...new Set([...enhanced.complianceFrameworks, ...requiredFrameworks]),
    ];

    return enhanced;
  }

  /**
   * Detect additional compliance gaps using business logic
   */
  private async detectAdditionalGaps(): Promise<ComplianceGap[]> {
    const gaps: ComplianceGap[] = [];
    const classifications = await this.getAllClassifications();

    for (const classification of classifications) {
      // Check for soft delete on PII tables
      if (
        (classification.containsPii || classification.containsPhi) &&
        !classification.softDeleteEnabled
      ) {
        gaps.push({
          tableName: classification.tableName,
          gapType: 'missing_soft_delete',
          severity: 'medium',
          description:
            'Table contains PII/PHI but soft delete is not enabled, which may complicate GDPR erasure',
          remediation: 'Add deleted_at column and implement soft delete for GDPR compliance',
          affectedFrameworks: ['GDPR'],
        });
      }

      // Check for missing column classifications
      if (classification.containsPii && classification.columns.length === 0) {
        gaps.push({
          tableName: classification.tableName,
          gapType: 'missing_column_classification',
          severity: 'medium',
          description: 'Table marked as containing PII but has no column-level classifications',
          remediation: 'Add column-level classifications to document which columns contain PII',
          affectedFrameworks: ['GDPR', 'HIPAA'],
        });
      }
    }

    return gaps;
  }
}

/**
 * Create a data classification service instance
 */
export function createDataClassificationService(
  options: DataClassificationServiceOptions
): DataClassificationService {
  return new DataClassificationService(options);
}
