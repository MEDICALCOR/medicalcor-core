/**
 * M15: Data Lineage Tracking Types
 *
 * Comprehensive type definitions for event-based data lineage tracking
 * for compliance (HIPAA/GDPR) and debugging purposes.
 *
 * @module core/data-lineage/types
 */

import { z } from 'zod';

// =============================================================================
// AGGREGATE TYPES
// =============================================================================

/**
 * Supported aggregate types in the system
 */
export const AggregateTypeSchema = z.enum([
  'Lead',
  'Patient',
  'Contact',
  'Appointment',
  'Consent',
  'Message',
  'Case',
  'TreatmentPlan',
  'Payment',
  'User',
  'Clinic',
]);
export type AggregateType = z.infer<typeof AggregateTypeSchema>;

// =============================================================================
// TRANSFORMATION TYPES
// =============================================================================

/**
 * Types of data transformations tracked in lineage
 */
export const TransformationTypeSchema = z.enum([
  /** Raw data creation from external source */
  'ingestion',
  /** AI/ML-based enrichment */
  'enrichment',
  /** Score calculation (lead scoring, retention scoring) */
  'scoring',
  /** Multiple sources combined */
  'aggregation',
  /** Data format or structure change */
  'transformation',
  /** Derived calculation from existing data */
  'derivation',
  /** Data validation and cleaning */
  'validation',
  /** AI pattern detection */
  'pattern_detection',
  /** Behavioral insight generation */
  'insight_generation',
  /** Routing decision */
  'routing_decision',
  /** Consent-related processing */
  'consent_processing',
  /** External system sync */
  'sync',
  /** Manual user update */
  'manual_update',
  /** System-generated update */
  'system_update',
  /** Data merge operation */
  'merge',
  /** Data anonymization/pseudonymization */
  'anonymization',
]);
export type TransformationType = z.infer<typeof TransformationTypeSchema>;

// =============================================================================
// COMPLIANCE TYPES
// =============================================================================

/**
 * Compliance frameworks tracked
 */
export const ComplianceFrameworkSchema = z.enum(['HIPAA', 'GDPR', 'PCI', 'SOC2', 'CCPA']);
export type ComplianceFramework = z.infer<typeof ComplianceFrameworkSchema>;

/**
 * Legal basis for data processing (GDPR Article 6)
 */
export const LegalBasisSchema = z.enum([
  'consent',
  'contract',
  'legal_obligation',
  'vital_interests',
  'public_task',
  'legitimate_interests',
]);
export type LegalBasis = z.infer<typeof LegalBasisSchema>;

/**
 * Data sensitivity classification
 */
export const DataSensitivitySchema = z.enum([
  'public',
  'internal',
  'confidential',
  'restricted',
  'phi', // Protected Health Information
  'pii', // Personally Identifiable Information
]);
export type DataSensitivity = z.infer<typeof DataSensitivitySchema>;

// =============================================================================
// LINEAGE NODE TYPES
// =============================================================================

/**
 * Represents a data source in the lineage graph
 */
export const DataSourceSchema = z.object({
  /** Aggregate ID of the source */
  aggregateId: z.string(),
  /** Type of the source aggregate */
  aggregateType: z.string(),
  /** Specific event that provided the data */
  eventId: z.string().optional(),
  /** Event type */
  eventType: z.string().optional(),
  /** Specific fields used from this source */
  fields: z.array(z.string()).optional(),
  /** Timestamp of the source data */
  timestamp: z.string().optional(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

/**
 * Quality metrics for lineage data
 */
export const DataQualityMetricsSchema = z.object({
  /** Confidence score (0-1) */
  confidence: z.number().min(0).max(1),
  /** Completeness score (0-1) */
  completeness: z.number().min(0).max(1).optional(),
  /** Accuracy score (0-1) */
  accuracy: z.number().min(0).max(1).optional(),
  /** Timeliness - age of source data in seconds */
  dataAgeSeconds: z.number().optional(),
  /** List of missing required fields */
  missingFields: z.array(z.string()).optional(),
  /** Validation errors if any */
  validationErrors: z.array(z.string()).optional(),
});
export type DataQualityMetrics = z.infer<typeof DataQualityMetricsSchema>;

// =============================================================================
// LINEAGE ENTRY
// =============================================================================

/**
 * A single lineage entry tracking data provenance
 */
export const LineageEntrySchema = z.object({
  /** Unique lineage entry ID */
  id: z.string().uuid(),

  /** Target aggregate receiving/affected by the data */
  targetAggregateId: z.string(),
  targetAggregateType: z.string(),

  /** Event that triggered this lineage entry */
  triggerEventId: z.string(),
  triggerEventType: z.string(),

  /** Type of transformation applied */
  transformationType: TransformationTypeSchema,

  /** Human-readable description of the transformation */
  transformationDescription: z.string().optional(),

  /** Source data inputs */
  sources: z.array(DataSourceSchema),

  /** Data quality metrics */
  quality: DataQualityMetricsSchema.optional(),

  /** Compliance context */
  compliance: z
    .object({
      /** Applicable compliance frameworks */
      frameworks: z.array(ComplianceFrameworkSchema).optional(),
      /** Legal basis for processing */
      legalBasis: LegalBasisSchema.optional(),
      /** Consent ID if consent-based */
      consentId: z.string().optional(),
      /** Data sensitivity level */
      sensitivity: DataSensitivitySchema.optional(),
      /** Purpose of processing */
      purpose: z.string().optional(),
      /** Data retention period in days */
      retentionDays: z.number().optional(),
    })
    .optional(),

  /** Actor who initiated the transformation */
  actor: z
    .object({
      id: z.string(),
      type: z.enum(['user', 'system', 'api', 'integration', 'cron']),
      name: z.string().optional(),
    })
    .optional(),

  /** Distributed tracing context */
  correlationId: z.string(),
  causationId: z.string().optional(),

  /** Processing context */
  processingContext: z
    .object({
      /** Service that performed the transformation */
      service: z.string(),
      /** Version of the service/algorithm */
      version: z.string().optional(),
      /** AI model used if applicable */
      model: z.string().optional(),
      /** Model version */
      modelVersion: z.string().optional(),
      /** Processing duration in milliseconds */
      durationMs: z.number().optional(),
    })
    .optional(),

  /** Additional metadata */
  metadata: z.record(z.unknown()).optional(),

  /** When the lineage was recorded */
  createdAt: z.string(),
});
export type LineageEntry = z.infer<typeof LineageEntrySchema>;

/**
 * Input for creating a lineage entry
 */
export const CreateLineageEntrySchema = LineageEntrySchema.omit({
  id: true,
  createdAt: true,
});
export type CreateLineageEntry = z.infer<typeof CreateLineageEntrySchema>;

// =============================================================================
// LINEAGE GRAPH
// =============================================================================

/**
 * Node in the lineage graph
 */
export interface LineageNode {
  /** Aggregate ID */
  id: string;
  /** Aggregate type */
  type: string;
  /** Display label */
  label: string;
  /** Node metadata */
  metadata?: Record<string, unknown>;
  /** Compliance tags */
  complianceTags?: ComplianceFramework[];
  /** Data sensitivity */
  sensitivity?: DataSensitivity;
  /** First seen timestamp */
  firstSeen?: Date;
  /** Last updated timestamp */
  lastUpdated?: Date;
}

/**
 * Edge in the lineage graph
 */
export interface LineageEdge {
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Transformation type */
  transformationType: TransformationType;
  /** Event that created this edge */
  eventId: string;
  /** Event type */
  eventType: string;
  /** Timestamp */
  timestamp: Date;
  /** Edge metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Complete lineage graph
 */
export interface LineageGraph {
  /** Graph nodes */
  nodes: LineageNode[];
  /** Graph edges */
  edges: LineageEdge[];
  /** Root node ID (starting point of traversal) */
  rootId?: string;
  /** Traversal direction */
  direction: 'upstream' | 'downstream' | 'both';
  /** Maximum depth traversed */
  depth: number;
  /** Graph statistics */
  stats: {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
    uniqueTransformations: number;
    uniqueAggregateTypes: number;
  };
}

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Options for querying lineage
 */
export interface LineageQueryOptions {
  /** Filter by target aggregate ID */
  aggregateId?: string;
  /** Filter by aggregate type */
  aggregateType?: string;
  /** Filter by transformation type */
  transformationType?: TransformationType;
  /** Filter by compliance framework */
  complianceFramework?: ComplianceFramework;
  /** Filter by correlation ID */
  correlationId?: string;
  /** Filter by source aggregate ID */
  sourceAggregateId?: string;
  /** Start time filter */
  startTime?: Date;
  /** End time filter */
  endTime?: Date;
  /** Actor ID filter */
  actorId?: string;
  /** Service name filter */
  service?: string;
  /** Minimum quality confidence */
  minConfidence?: number;
  /** Include entries with validation errors */
  includeErrors?: boolean;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Result of a lineage query
 */
export interface LineageQueryResult {
  entries: LineageEntry[];
  total: number;
  hasMore: boolean;
  queryTime: Date;
}

// =============================================================================
// IMPACT ANALYSIS
// =============================================================================

/**
 * Impact analysis result showing affected entities
 */
export interface ImpactAnalysis {
  /** Source aggregate being analyzed */
  source: {
    aggregateId: string;
    aggregateType: string;
  };
  /** Directly affected aggregates */
  directlyAffected: {
    aggregateId: string;
    aggregateType: string;
    transformationType: TransformationType;
    eventType: string;
  }[];
  /** Transitively affected aggregates */
  transitivelyAffected: {
    aggregateId: string;
    aggregateType: string;
    pathLength: number;
    path: string[];
  }[];
  /** Total impact count */
  totalImpactedCount: number;
  /** Analysis depth */
  analysisDepth: number;
  /** Analysis timestamp */
  analyzedAt: Date;
}

// =============================================================================
// COMPLIANCE REPORT
// =============================================================================

/**
 * Compliance lineage report for auditors
 */
export interface ComplianceLineageReport {
  /** Report period */
  period: {
    start: Date;
    end: Date;
  };
  /** Requested compliance framework */
  framework: ComplianceFramework;
  /** Subject aggregate */
  subject: {
    aggregateId: string;
    aggregateType: string;
  };
  /** Processing activities affecting the subject */
  processingActivities: {
    transformationType: TransformationType;
    description: string;
    legalBasis?: LegalBasis;
    purpose?: string;
    count: number;
    firstOccurrence: Date;
    lastOccurrence: Date;
  }[];
  /** Data sources that contributed to the subject */
  dataSources: {
    aggregateType: string;
    count: number;
    sensitivity?: DataSensitivity;
  }[];
  /** Data recipients (where data was sent) */
  dataRecipients: {
    aggregateType: string;
    transformationType: TransformationType;
    count: number;
  }[];
  /** Consent records if applicable */
  consents: {
    consentId: string;
    purpose: string;
    grantedAt: Date;
    withdrawnAt?: Date;
  }[];
  /** Report generation metadata */
  generatedAt: Date;
  generatedBy: string;
}

// =============================================================================
// DEBUG TYPES
// =============================================================================

/**
 * Debug trace for a specific event/aggregate
 */
export interface DebugLineageTrace {
  /** Trace ID */
  id: string;
  /** Target being traced */
  target: {
    aggregateId: string;
    aggregateType: string;
    eventId?: string;
  };
  /** Full event causation chain */
  causationChain: {
    eventId: string;
    eventType: string;
    timestamp: Date;
    correlationId: string;
    causationId?: string;
  }[];
  /** Lineage entries in the chain */
  lineageEntries: LineageEntry[];
  /** Identified issues */
  issues: {
    severity: 'warning' | 'error';
    type: 'missing_source' | 'quality_below_threshold' | 'broken_chain' | 'circular_dependency';
    message: string;
    relatedEntryId?: string;
  }[];
  /** Trace statistics */
  stats: {
    chainLength: number;
    uniqueSources: number;
    averageQuality: number;
    totalProcessingTimeMs: number;
  };
  /** Trace timestamp */
  tracedAt: Date;
}

/**
 * Data flow visualization for debugging
 */
export interface DataFlowVisualization {
  /** Mermaid diagram definition */
  mermaid: string;
  /** D3-compatible graph data */
  d3Graph: {
    nodes: {
      id: string;
      label: string;
      type: string;
      group: number;
    }[];
    links: {
      source: string;
      target: string;
      label: string;
      value: number;
    }[];
  };
  /** Plain text summary */
  summary: string;
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

/**
 * Lineage store interface for persistence
 */
export interface LineageStore {
  /** Save a lineage entry */
  save(entry: LineageEntry): Promise<void>;
  /** Save multiple entries in batch */
  saveBatch(entries: LineageEntry[]): Promise<void>;
  /** Query lineage entries */
  query(options: LineageQueryOptions): Promise<LineageQueryResult>;
  /** Get lineage for a specific aggregate */
  getByAggregateId(aggregateId: string, aggregateType: string): Promise<LineageEntry[]>;
  /** Get lineage by event ID */
  getByEventId(eventId: string): Promise<LineageEntry[]>;
  /** Get lineage by correlation ID */
  getByCorrelationId(correlationId: string): Promise<LineageEntry[]>;
  /** Get upstream sources for an aggregate */
  getUpstreamSources(aggregateId: string, maxDepth?: number): Promise<LineageGraph>;
  /** Get downstream impacts for an aggregate */
  getDownstreamImpacts(aggregateId: string, maxDepth?: number): Promise<LineageGraph>;
  /** Delete lineage entries (for GDPR erasure) */
  deleteByAggregateId(aggregateId: string): Promise<number>;
}

// =============================================================================
// SERVICE CONFIGURATION
// =============================================================================

/**
 * Configuration for the lineage tracking service
 */
export interface LineageServiceConfig {
  /** Enable lineage tracking */
  enabled: boolean;
  /** Minimum quality confidence to track */
  minQualityConfidence: number;
  /** Default data retention in days */
  defaultRetentionDays: number;
  /** Maximum graph traversal depth */
  maxGraphDepth: number;
  /** Batch size for bulk operations */
  batchSize: number;
  /** Enable async processing */
  asyncProcessing: boolean;
  /** Log lineage operations */
  enableLogging: boolean;
}

export const DEFAULT_LINEAGE_CONFIG: LineageServiceConfig = {
  enabled: true,
  minQualityConfidence: 0.5,
  defaultRetentionDays: 365 * 7, // 7 years for HIPAA
  maxGraphDepth: 10,
  batchSize: 100,
  asyncProcessing: true,
  enableLogging: true,
};
