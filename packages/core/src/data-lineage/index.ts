/**
 * M15: Data Lineage Tracking
 *
 * Comprehensive data lineage tracking for compliance (HIPAA/GDPR) and debugging.
 *
 * @module core/data-lineage
 */

// =============================================================================
// TYPES
// =============================================================================

export {
  // Schemas
  AggregateTypeSchema,
  TransformationTypeSchema,
  ComplianceFrameworkSchema,
  LegalBasisSchema,
  DataSensitivitySchema,
  DataSourceSchema,
  DataQualityMetricsSchema,
  LineageEntrySchema,
  CreateLineageEntrySchema,

  // Types
  type AggregateType,
  type TransformationType,
  type ComplianceFramework,
  // Note: LegalBasis re-exported from security/gdpr
  type DataSensitivity,
  type DataSource,
  type DataQualityMetrics,
  type LineageEntry,
  type CreateLineageEntry,
  type LineageNode,
  type LineageEdge,
  type LineageGraph,
  type LineageQueryOptions,
  type LineageQueryResult,
  type ImpactAnalysis,
  type ComplianceLineageReport,
  type DebugLineageTrace,
  type DataFlowVisualization,
  type LineageStore,
  type LineageServiceConfig,

  // Constants
  DEFAULT_LINEAGE_CONFIG,
} from './types.js';

// =============================================================================
// LINEAGE TRACKER
// =============================================================================

export { LineageTracker, createLineageTracker, type LineageContext } from './lineage-tracker.js';

// =============================================================================
// GRAPH BUILDER
// =============================================================================

export {
  LineageGraphBuilder,
  createLineageGraphBuilder,
  type GraphBuildOptions,
} from './graph-builder.js';

// =============================================================================
// COMPLIANCE SERVICE
// =============================================================================

export {
  ComplianceLineageService,
  createComplianceLineageService,
  type DataSubjectReport,
  type HIPAAAuditEntry,
  type LawfulnessAssessment,
} from './compliance-lineage.js';

// =============================================================================
// DEBUG REPORTER
// =============================================================================

export {
  DebugLineageReporter,
  createDebugLineageReporter,
  type LineageIssue,
  type LineageHealthCheck,
  type InvestigationResult,
} from './debug-reporter.js';

// =============================================================================
// STORES
// =============================================================================

export {
  InMemoryLineageStore,
  PostgresLineageStore,
  createInMemoryLineageStore,
  createPostgresLineageStore,
  createLineageStore,
} from './stores.js';

// =============================================================================
// FACTORY
// =============================================================================

import type { EventStoreRepository } from '../event-store.js';
import type { LineageStore, LineageServiceConfig } from './types.js';
import { type LineageTracker, createLineageTracker } from './lineage-tracker.js';
import { type LineageGraphBuilder, createLineageGraphBuilder } from './graph-builder.js';
import {
  type ComplianceLineageService,
  createComplianceLineageService,
} from './compliance-lineage.js';
import { type DebugLineageReporter, createDebugLineageReporter } from './debug-reporter.js';

/**
 * Complete data lineage system
 */
export interface DataLineageSystem {
  /** Main lineage tracker for recording lineage */
  tracker: LineageTracker;
  /** Graph builder for visualization and analysis */
  graphBuilder: LineageGraphBuilder;
  /** Compliance service for HIPAA/GDPR reports */
  compliance: ComplianceLineageService;
  /** Debug reporter for troubleshooting */
  debug: DebugLineageReporter;
  /** Underlying store */
  store: LineageStore;
}

/**
 * Create a complete data lineage system
 */
export function createDataLineageSystem(
  store: LineageStore,
  options?: {
    config?: Partial<LineageServiceConfig>;
    eventStore?: EventStoreRepository;
  }
): DataLineageSystem {
  return {
    tracker: createLineageTracker(store, options?.config),
    graphBuilder: createLineageGraphBuilder(store),
    compliance: createComplianceLineageService(store),
    debug: createDebugLineageReporter(store, options?.eventStore),
    store,
  };
}
