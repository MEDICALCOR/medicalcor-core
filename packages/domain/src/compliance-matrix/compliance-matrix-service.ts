/**
 * Compliance Matrix Service
 *
 * Manages constraint compliance tracking across sprints for HIPAA, GDPR,
 * architectural, and quality requirements.
 *
 * HEXAGONAL ARCHITECTURE:
 * - This is a DOMAIN SERVICE (pure business logic)
 * - Dependencies (logger, repository) are injected via constructor
 * - No framework/infrastructure imports allowed
 *
 * @module @medicalcor/domain/compliance-matrix
 */

import type {
  ComplianceMatrix,
  ConstraintDefinition,
  CreateConstraintDefinition,
  SprintDefinition,
  SprintComplianceEntry,
  CreateSprintComplianceEntry,
  ComplianceQueryFilters,
  SprintComplianceSummary,
  CategoryComplianceSummary,
  ConstraintAttentionItem,
  ComplianceMatrixReport,
  ComplianceStatus,
  ConstraintCategory,
  ComplianceStatusChangedEvent,
  CriticalViolationDetectedEvent,
  ComplianceTargetMissedEvent,
} from '@medicalcor/types';
import {
  calculateCompliancePercentage,
  determineComplianceTrend,
  requiresImmediateAttention,
  calculateDaysFromTarget,
  getSeverityWeight,
  DEFAULT_MEDICALCOR_CONSTRAINTS,
} from '@medicalcor/types';
import type { ComplianceMatrixRepository } from './compliance-matrix-repository.js';
import { generatePrefixedId } from '../shared-kernel/utils/uuid.js';

/**
 * Logger interface for dependency injection
 */
export interface ComplianceLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  debug(obj: Record<string, unknown>, msg?: string): void;
}

/**
 * No-op logger for when no logger is provided
 */
const noopLogger: ComplianceLogger = {
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
 * Event publisher interface for domain events
 */
export interface ComplianceEventPublisher {
  publish(
    event:
      | ComplianceStatusChangedEvent
      | CriticalViolationDetectedEvent
      | ComplianceTargetMissedEvent
  ): Promise<void>;
}

/**
 * No-op event publisher
 */
const noopEventPublisher: ComplianceEventPublisher = {
  publish: async () => {
    /* intentionally empty */
  },
};

/**
 * Configuration for the compliance matrix service
 */
export interface ComplianceMatrixConfig {
  /** Days before an in-progress item is considered overdue */
  overdueThresholdDays: number;
  /** Minimum compliance percentage to be considered healthy */
  healthyComplianceThreshold: number;
  /** Automatically publish events on status changes */
  publishEvents: boolean;
  /** Auto-initialize with default MedicalCor constraints */
  autoInitializeDefaults: boolean;
}

const DEFAULT_CONFIG: ComplianceMatrixConfig = {
  overdueThresholdDays: 14,
  healthyComplianceThreshold: 90,
  publishEvents: true,
  autoInitializeDefaults: true,
};

/**
 * Options for creating the ComplianceMatrixService
 */
export interface ComplianceMatrixServiceOptions {
  /**
   * Repository for persistence (REQUIRED)
   */
  repository: ComplianceMatrixRepository;
  /**
   * Configuration overrides (optional)
   */
  config?: Partial<ComplianceMatrixConfig>;
  /**
   * Logger instance for audit and debug logging
   */
  logger?: ComplianceLogger;
  /**
   * Event publisher for domain events
   */
  eventPublisher?: ComplianceEventPublisher;
}

/**
 * Compliance Matrix Service
 *
 * Provides operations for tracking compliance constraints across sprints.
 * Supports HIPAA, GDPR, architectural, testing, and observability constraints.
 *
 * @example
 * ```typescript
 * import { ComplianceMatrixService } from '@medicalcor/domain/compliance-matrix';
 *
 * const service = new ComplianceMatrixService({ repository });
 *
 * // Create a new matrix
 * const matrix = await service.createMatrix({ name: 'Q1 2024 Compliance' });
 *
 * // Add a constraint
 * await service.addConstraint(matrix.id, {
 *   name: 'HIPAA Encryption',
 *   category: 'hipaa',
 *   severity: 'critical',
 * });
 *
 * // Update compliance status
 * await service.updateComplianceStatus(matrix.id, {
 *   constraintId: 'hipaa-encryption',
 *   sprintId: 'sprint-1',
 *   status: 'compliant',
 * });
 *
 * // Generate report
 * const report = await service.generateReport(matrix.id);
 * ```
 */
export class ComplianceMatrixService {
  private config: ComplianceMatrixConfig;
  private repository: ComplianceMatrixRepository;
  private logger: ComplianceLogger;
  private eventPublisher: ComplianceEventPublisher;

  constructor(options: ComplianceMatrixServiceOptions) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.repository = options.repository;
    this.logger = options.logger ?? noopLogger;
    this.eventPublisher = options.eventPublisher ?? noopEventPublisher;
  }

  // ===========================================================================
  // Matrix Operations
  // ===========================================================================

  /**
   * Create a new compliance matrix
   */
  async createMatrix(params: { name: string; description?: string }): Promise<ComplianceMatrix> {
    const now = new Date();
    const matrixId = generatePrefixedId('matrix');

    const matrix: ComplianceMatrix = {
      id: matrixId,
      name: params.name,
      description: params.description,
      constraints: [],
      sprints: [],
      entries: [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const saved = await this.repository.save(matrix);

    // Auto-initialize with default constraints if configured
    if (this.config.autoInitializeDefaults) {
      await this.initializeDefaultConstraints(matrixId);
    }

    this.logger.info({ matrixId, name: params.name }, 'Compliance matrix created');

    return saved;
  }

  /**
   * Get a compliance matrix by ID
   */
  async getMatrix(matrixId: string): Promise<ComplianceMatrix | null> {
    return this.repository.findById(matrixId);
  }

  /**
   * Get or create the default matrix
   */
  async getOrCreateDefaultMatrix(): Promise<ComplianceMatrix> {
    const existing = await this.repository.findDefault();
    if (existing) return existing;

    return this.createMatrix({
      name: 'MedicalCor Compliance Matrix',
      description: 'Default compliance tracking for HIPAA, GDPR, and architectural constraints',
    });
  }

  /**
   * Delete a compliance matrix
   */
  async deleteMatrix(matrixId: string): Promise<void> {
    await this.repository.delete(matrixId);
    this.logger.info({ matrixId }, 'Compliance matrix deleted');
  }

  // ===========================================================================
  // Constraint Operations
  // ===========================================================================

  /**
   * Add a constraint to a matrix
   */
  async addConstraint(
    matrixId: string,
    params: CreateConstraintDefinition
  ): Promise<ConstraintDefinition> {
    const now = new Date();
    const constraintId = generatePrefixedId('constraint');

    const constraint: ConstraintDefinition = {
      id: constraintId,
      ...params,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repository.addConstraint(matrixId, constraint);

    this.logger.info(
      {
        matrixId,
        constraintId,
        name: params.name,
        category: params.category,
      },
      'Constraint added'
    );

    return saved;
  }

  /**
   * Update a constraint
   */
  async updateConstraint(
    matrixId: string,
    constraintId: string,
    updates: Partial<CreateConstraintDefinition>
  ): Promise<ConstraintDefinition> {
    const updated = await this.repository.updateConstraint(matrixId, constraintId, {
      ...updates,
      updatedAt: new Date(),
    });

    this.logger.info({ matrixId, constraintId }, 'Constraint updated');

    return updated;
  }

  /**
   * Remove a constraint from a matrix
   */
  async removeConstraint(matrixId: string, constraintId: string): Promise<void> {
    await this.repository.removeConstraint(matrixId, constraintId);
    this.logger.info({ matrixId, constraintId }, 'Constraint removed');
  }

  /**
   * Get all constraints for a matrix
   */
  async getConstraints(matrixId: string): Promise<ConstraintDefinition[]> {
    return this.repository.findConstraints(matrixId);
  }

  /**
   * Get constraints by category
   */
  async getConstraintsByCategory(
    matrixId: string,
    category: ConstraintCategory
  ): Promise<ConstraintDefinition[]> {
    return this.repository.findConstraintsByCategory(matrixId, category);
  }

  /**
   * Initialize matrix with default MedicalCor constraints
   */
  async initializeDefaultConstraints(matrixId: string): Promise<ConstraintDefinition[]> {
    const results: ConstraintDefinition[] = [];

    for (const defaultConstraint of DEFAULT_MEDICALCOR_CONSTRAINTS) {
      const constraint = await this.addConstraint(matrixId, defaultConstraint);
      results.push(constraint);
    }

    this.logger.info({ matrixId, count: results.length }, 'Default constraints initialized');

    return results;
  }

  // ===========================================================================
  // Sprint Operations
  // ===========================================================================

  /**
   * Add a sprint to a matrix
   */
  async addSprint(
    matrixId: string,
    params: Omit<SprintDefinition, 'id'>
  ): Promise<SprintDefinition> {
    const sprintId = generatePrefixedId('sprint');

    const sprint: SprintDefinition = {
      id: sprintId,
      ...params,
    };

    const saved = await this.repository.addSprint(matrixId, sprint);

    this.logger.info({ matrixId, sprintId, name: params.name }, 'Sprint added');

    return saved;
  }

  /**
   * Update a sprint
   */
  async updateSprint(
    matrixId: string,
    sprintId: string,
    updates: Partial<Omit<SprintDefinition, 'id'>>
  ): Promise<SprintDefinition> {
    const updated = await this.repository.updateSprint(matrixId, sprintId, updates);

    this.logger.info({ matrixId, sprintId }, 'Sprint updated');

    return updated;
  }

  /**
   * Set a sprint as the current sprint
   */
  async setCurrentSprint(matrixId: string, sprintId: string): Promise<SprintDefinition> {
    // First, unset any existing current sprint
    const sprints = await this.repository.findSprints(matrixId);
    for (const sprint of sprints) {
      if (sprint.isCurrent && sprint.id !== sprintId) {
        await this.repository.updateSprint(matrixId, sprint.id, { isCurrent: false });
      }
    }

    // Set the new current sprint
    const updated = await this.repository.updateSprint(matrixId, sprintId, { isCurrent: true });

    this.logger.info({ matrixId, sprintId }, 'Current sprint set');

    return updated;
  }

  /**
   * Get the current sprint
   */
  async getCurrentSprint(matrixId: string): Promise<SprintDefinition | null> {
    return this.repository.findCurrentSprint(matrixId);
  }

  /**
   * Get all sprints for a matrix
   */
  async getSprints(matrixId: string): Promise<SprintDefinition[]> {
    return this.repository.findSprints(matrixId);
  }

  // ===========================================================================
  // Compliance Entry Operations
  // ===========================================================================

  /**
   * Update compliance status for a constraint in a sprint
   */
  async updateComplianceStatus(
    matrixId: string,
    params: CreateSprintComplianceEntry
  ): Promise<SprintComplianceEntry> {
    const now = new Date();

    // Get existing entry to detect status changes
    const existing = await this.repository.findEntry(
      matrixId,
      params.constraintId,
      params.sprintId
    );

    const entry: SprintComplianceEntry = {
      ...params,
      assessedAt: now,
    };

    const saved = await this.repository.upsertEntry(matrixId, entry);

    this.logger.info(
      {
        matrixId,
        constraintId: params.constraintId,
        sprintId: params.sprintId,
        status: params.status,
      },
      'Compliance status updated'
    );

    // Publish events if configured
    if (this.config.publishEvents) {
      await this.publishStatusChangeEvents(matrixId, existing, saved);
    }

    return saved;
  }

  /**
   * Bulk update compliance statuses
   */
  async bulkUpdateComplianceStatus(
    matrixId: string,
    entries: CreateSprintComplianceEntry[]
  ): Promise<SprintComplianceEntry[]> {
    const now = new Date();

    const entriesWithTimestamp: SprintComplianceEntry[] = entries.map((e) => ({
      ...e,
      assessedAt: now,
    }));

    const saved = await this.repository.bulkUpsertEntries(matrixId, entriesWithTimestamp);

    this.logger.info({ matrixId, count: saved.length }, 'Bulk compliance status update completed');

    return saved;
  }

  /**
   * Get compliance entry for a constraint in a sprint
   */
  async getComplianceEntry(
    matrixId: string,
    constraintId: string,
    sprintId: string
  ): Promise<SprintComplianceEntry | null> {
    return this.repository.findEntry(matrixId, constraintId, sprintId);
  }

  /**
   * Get all entries for a sprint
   */
  async getEntriesForSprint(matrixId: string, sprintId: string): Promise<SprintComplianceEntry[]> {
    return this.repository.findEntriesBySprint(matrixId, sprintId);
  }

  /**
   * Get compliance history for a constraint
   */
  async getConstraintHistory(
    matrixId: string,
    constraintId: string
  ): Promise<SprintComplianceEntry[]> {
    return this.repository.findEntriesByConstraint(matrixId, constraintId);
  }

  /**
   * Query entries with filters
   */
  async queryEntries(
    matrixId: string,
    filters: ComplianceQueryFilters
  ): Promise<SprintComplianceEntry[]> {
    return this.repository.queryEntries(matrixId, filters);
  }

  /**
   * Copy compliance entries from one sprint to another (for sprint rollover)
   */
  async rolloverSprint(
    matrixId: string,
    fromSprintId: string,
    toSprintId: string
  ): Promise<SprintComplianceEntry[]> {
    const copied = await this.repository.copyEntriesFromSprint(matrixId, fromSprintId, toSprintId);

    this.logger.info(
      { matrixId, fromSprintId, toSprintId, count: copied.length },
      'Sprint entries rolled over'
    );

    return copied;
  }

  // ===========================================================================
  // Reporting Operations
  // ===========================================================================

  /**
   * Get compliance summary for a sprint
   */
  async getSprintSummary(matrixId: string, sprintId: string): Promise<SprintComplianceSummary> {
    return this.repository.getSprintSummary(matrixId, sprintId);
  }

  /**
   * Get compliance summaries for all sprints
   */
  async getAllSprintSummaries(matrixId: string): Promise<SprintComplianceSummary[]> {
    return this.repository.getAllSprintSummaries(matrixId);
  }

  /**
   * Get category summaries for a sprint
   */
  async getCategorySummaries(
    matrixId: string,
    sprintId: string
  ): Promise<CategoryComplianceSummary[]> {
    return this.repository.getCategorySummary(matrixId, sprintId);
  }

  /**
   * Get items requiring attention
   */
  async getAttentionItems(matrixId: string): Promise<ConstraintAttentionItem[]> {
    const matrix = await this.repository.findById(matrixId);
    if (!matrix) return [];

    const entriesNeedingAttention = await this.repository.findEntriesNeedingAttention(matrixId);
    const constraints = await this.repository.findConstraints(matrixId);
    const constraintMap = new Map(constraints.map((c) => [c.id, c]));

    const attentionItems: ConstraintAttentionItem[] = [];

    for (const entry of entriesNeedingAttention) {
      const constraint = constraintMap.get(entry.constraintId);
      if (!constraint) continue;

      if (requiresImmediateAttention(entry, constraint)) {
        const daysOverdue = entry.targetDate
          ? Math.abs(calculateDaysFromTarget(new Date(entry.targetDate)))
          : undefined;

        attentionItems.push({
          constraint,
          currentStatus: entry.status,
          sprintId: entry.sprintId,
          notes: entry.notes,
          targetDate: entry.targetDate,
          daysOverdue: daysOverdue && daysOverdue > 0 ? daysOverdue : undefined,
        });
      }
    }

    // Sort by severity (most severe first)
    return attentionItems.sort((a, b) => {
      const aSeverity = getSeverityWeight(a.constraint.severity);
      const bSeverity = getSeverityWeight(b.constraint.severity);
      return bSeverity - aSeverity;
    });
  }

  /**
   * Generate a full compliance report
   */
  async generateReport(matrixId: string): Promise<ComplianceMatrixReport> {
    const [sprintSummaries, attentionItems] = await Promise.all([
      this.getAllSprintSummaries(matrixId),
      this.getAttentionItems(matrixId),
    ]);

    const currentSprint = await this.getCurrentSprint(matrixId);
    let categorySummaries: CategoryComplianceSummary[] = [];

    if (currentSprint) {
      categorySummaries = await this.getCategorySummaries(matrixId, currentSprint.id);
    }

    // Calculate overall metrics
    const totalCompliant = sprintSummaries.reduce((sum, s) => sum + s.compliantCount, 0);
    const totalNonCompliant = sprintSummaries.reduce((sum, s) => sum + s.nonCompliantCount, 0);
    const totalNotApplicable = sprintSummaries.reduce((sum, s) => sum + s.notApplicableCount, 0);
    const totalInProgress = sprintSummaries.reduce((sum, s) => sum + s.inProgressCount, 0);
    const total = totalCompliant + totalNonCompliant + totalInProgress + totalNotApplicable;

    const overallCompliancePercentage = calculateCompliancePercentage(
      totalCompliant,
      total,
      totalNotApplicable
    );

    const totalCriticalViolations = sprintSummaries.reduce(
      (sum, s) => sum + s.criticalViolations,
      0
    );
    const totalHighViolations = sprintSummaries.reduce((sum, s) => sum + s.highViolations, 0);

    const report: ComplianceMatrixReport = {
      generatedAt: new Date(),
      matrixId,
      overallCompliancePercentage,
      sprintSummaries,
      categorySummaries,
      attentionItems,
      totalCriticalViolations,
      totalHighViolations,
      overallTrend: determineComplianceTrend(sprintSummaries),
    };

    this.logger.info(
      {
        matrixId,
        overallCompliancePercentage,
        criticalViolations: totalCriticalViolations,
        attentionItemsCount: attentionItems.length,
      },
      'Compliance report generated'
    );

    return report;
  }

  /**
   * Check if compliance is healthy based on threshold
   */
  async isComplianceHealthy(matrixId: string, sprintId?: string): Promise<boolean> {
    let summary: SprintComplianceSummary;

    if (sprintId) {
      summary = await this.getSprintSummary(matrixId, sprintId);
    } else {
      const currentSprint = await this.getCurrentSprint(matrixId);
      if (!currentSprint) return true;
      summary = await this.getSprintSummary(matrixId, currentSprint.id);
    }

    return (
      summary.compliancePercentage >= this.config.healthyComplianceThreshold &&
      summary.criticalViolations === 0
    );
  }

  // ===========================================================================
  // Overdue Detection
  // ===========================================================================

  /**
   * Check for overdue in-progress items and publish events
   */
  async checkOverdueItems(matrixId: string): Promise<SprintComplianceEntry[]> {
    const entriesNeedingAttention = await this.repository.findEntriesNeedingAttention(matrixId);
    const overdueEntries: SprintComplianceEntry[] = [];

    for (const entry of entriesNeedingAttention) {
      if (entry.status === 'in_progress' && entry.targetDate) {
        const daysFromTarget = calculateDaysFromTarget(new Date(entry.targetDate));

        if (daysFromTarget < 0) {
          overdueEntries.push(entry);

          if (this.config.publishEvents) {
            const event: ComplianceTargetMissedEvent = {
              type: 'compliance.target_missed',
              constraintId: entry.constraintId,
              sprintId: entry.sprintId,
              targetDate: new Date(entry.targetDate),
              daysOverdue: Math.abs(daysFromTarget),
              currentStatus: entry.status,
            };

            await this.eventPublisher.publish(event);
          }
        }
      }
    }

    if (overdueEntries.length > 0) {
      this.logger.warn(
        { matrixId, overdueCount: overdueEntries.length },
        'Overdue compliance items detected'
      );
    }

    return overdueEntries;
  }

  // ===========================================================================
  // Matrix Display (for CLI/Dashboard)
  // ===========================================================================

  /**
   * Generate a display-friendly matrix
   */
  async generateDisplayMatrix(matrixId: string): Promise<{
    headers: string[];
    rows: {
      constraint: ConstraintDefinition;
      statuses: Record<string, ComplianceStatus>;
    }[];
  }> {
    const [constraints, sprints, entries] = await Promise.all([
      this.getConstraints(matrixId),
      this.getSprints(matrixId),
      this.repository.queryEntries(matrixId, {}),
    ]);

    // Build entry lookup
    const entryMap = new Map<string, ComplianceStatus>();
    for (const entry of entries) {
      entryMap.set(`${entry.constraintId}:${entry.sprintId}`, entry.status);
    }

    const headers = ['Constraint', ...sprints.map((s) => s.name)];
    const rows = constraints.map((constraint) => {
      const statuses: Record<string, ComplianceStatus> = {};
      for (const sprint of sprints) {
        statuses[sprint.id] = entryMap.get(`${constraint.id}:${sprint.id}`) ?? 'not_applicable';
      }
      return { constraint, statuses };
    });

    return { headers, rows };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Publish events for status changes
   */
  private async publishStatusChangeEvents(
    matrixId: string,
    existing: SprintComplianceEntry | null,
    updated: SprintComplianceEntry
  ): Promise<void> {
    const previousStatus = existing?.status ?? 'not_applicable';

    if (previousStatus !== updated.status) {
      const event: ComplianceStatusChangedEvent = {
        type: 'compliance.status_changed',
        constraintId: updated.constraintId,
        sprintId: updated.sprintId,
        previousStatus,
        newStatus: updated.status,
        changedBy: updated.assessedBy,
        changedAt: new Date(updated.assessedAt),
        notes: updated.notes,
      };

      await this.eventPublisher.publish(event);

      // Check for critical violations
      if (updated.status === 'non_compliant') {
        const constraints = await this.repository.findConstraints(matrixId);
        const constraint = constraints.find((c) => c.id === updated.constraintId);

        if (constraint?.severity === 'critical') {
          const violationEvent: CriticalViolationDetectedEvent = {
            type: 'compliance.critical_violation_detected',
            constraint,
            sprintId: updated.sprintId,
            detectedAt: new Date(),
            details: updated.notes,
          };

          await this.eventPublisher.publish(violationEvent);

          this.logger.warn(
            {
              matrixId,
              constraintId: constraint.id,
              constraintName: constraint.name,
              sprintId: updated.sprintId,
            },
            'Critical compliance violation detected'
          );
        }
      }
    }
  }
}

/**
 * Create a compliance matrix service instance
 */
export function createComplianceMatrixService(
  options: ComplianceMatrixServiceOptions
): ComplianceMatrixService {
  return new ComplianceMatrixService(options);
}
