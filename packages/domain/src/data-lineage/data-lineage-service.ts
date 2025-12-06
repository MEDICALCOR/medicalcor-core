/**
 * @fileoverview Data Lineage Domain Service
 *
 * M15: Data Lineage Tracking for Compliance and Debugging
 * High-level domain service providing data lineage capabilities.
 *
 * @module domain/data-lineage/data-lineage-service
 */

import type { Pool } from 'pg';
import {
  createDataLineageSystem,
  createPostgresLineageStore,
  createInMemoryLineageStore,
  type DataLineageSystem,
  type LineageEntry,
  type LineageGraph,
  type ComplianceLineageReport,
  type ComplianceFramework,
  type LineageHealthCheck,
  type InvestigationResult,
  type ImpactAnalysis,
  type DataSubjectReport,
  type HIPAAAuditEntry,
  type LawfulnessAssessment,
  type DataSource,
  type LineageContext,
  type LineageServiceConfig,
  type EventStoreRepository,
} from '@medicalcor/core';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dependencies for the data lineage service
 */
export interface DataLineageServiceDependencies {
  /** Database pool for production use */
  pool?: Pool;
  /** Connection string (alternative to pool) */
  connectionString?: string;
  /** Event store for enhanced debugging */
  eventStore?: EventStoreRepository;
  /** Service configuration */
  config?: Partial<LineageServiceConfig>;
}

/**
 * Aggregate reference
 */
export interface AggregateRef {
  aggregateId: string;
  aggregateType: string;
}

/**
 * Lineage dashboard data
 */
export interface LineageDashboard {
  /** Health status */
  health: LineageHealthCheck;
  /** Recent lineage activity */
  recentActivity: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
  /** Top transformations */
  topTransformations: {
    type: string;
    count: number;
    avgQuality: number;
  }[];
  /** Compliance summary */
  complianceSummary: {
    hipaaEntries: number;
    gdprEntries: number;
    withLegalBasis: number;
    withConsent: number;
  };
  /** Generated at */
  generatedAt: Date;
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Domain service for data lineage operations
 *
 * Provides high-level business operations for:
 * - Tracking data lineage across the system
 * - Generating compliance reports (HIPAA, GDPR)
 * - Debugging and troubleshooting data flow
 * - Impact analysis for data changes
 */
export class DataLineageService {
  private system: DataLineageSystem;

  constructor(deps: DataLineageServiceDependencies) {
    // Create store
    const store = deps.connectionString
      ? createPostgresLineageStore(deps.connectionString)
      : createInMemoryLineageStore();

    // Create system
    this.system = createDataLineageSystem(store, {
      config: deps.config,
      eventStore: deps.eventStore,
    });
  }

  // ===========================================================================
  // LINEAGE TRACKING
  // ===========================================================================

  /**
   * Track lineage for a scoring operation (lead scoring, retention scoring)
   */
  async trackScoring(
    target: AggregateRef,
    eventId: string,
    eventType: string,
    correlationId: string,
    sources: DataSource[],
    context: LineageContext,
    scoreDetails?: {
      scoreValue: number;
      algorithm: string;
      factors: string[];
    }
  ): Promise<LineageEntry> {
    return this.system.tracker.trackScoring(
      target.aggregateId,
      target.aggregateType,
      eventId,
      eventType,
      correlationId,
      sources,
      context,
      scoreDetails
    );
  }

  /**
   * Track lineage for AI enrichment
   */
  async trackEnrichment(
    target: AggregateRef,
    eventId: string,
    eventType: string,
    correlationId: string,
    sources: DataSource[],
    context: LineageContext,
    enrichmentDetails?: {
      model: string;
      enrichedFields: string[];
      confidence: number;
    }
  ): Promise<LineageEntry> {
    return this.system.tracker.trackEnrichment(
      target.aggregateId,
      target.aggregateType,
      eventId,
      eventType,
      correlationId,
      sources,
      context,
      enrichmentDetails
    );
  }

  /**
   * Track lineage for pattern detection
   */
  async trackPatternDetection(
    target: AggregateRef,
    correlationId: string,
    sources: DataSource[],
    context: LineageContext,
    patternDetails: {
      patternType: string;
      confidence: number;
      supportingEventCount: number;
    }
  ): Promise<LineageEntry> {
    return this.system.tracker.trackPatternDetection(
      target.aggregateId,
      target.aggregateType,
      correlationId,
      sources,
      context,
      patternDetails
    );
  }

  /**
   * Track lineage for consent processing
   */
  async trackConsentProcessing(
    target: AggregateRef,
    eventId: string,
    eventType: string,
    correlationId: string,
    consentId: string,
    context: LineageContext,
    consentDetails: {
      action: 'grant' | 'withdraw' | 'update';
      purposes: string[];
    }
  ): Promise<LineageEntry> {
    return this.system.tracker.trackConsentProcessing(
      target.aggregateId,
      target.aggregateType,
      eventId,
      eventType,
      correlationId,
      consentId,
      context,
      consentDetails
    );
  }

  // ===========================================================================
  // GRAPH OPERATIONS
  // ===========================================================================

  /**
   * Get upstream lineage graph (data sources)
   */
  async getUpstreamLineage(aggregate: AggregateRef, maxDepth?: number): Promise<LineageGraph> {
    return this.system.graphBuilder.buildUpstreamGraph(
      aggregate.aggregateId,
      aggregate.aggregateType,
      { maxDepth }
    );
  }

  /**
   * Get downstream lineage graph (data impacts)
   */
  async getDownstreamLineage(aggregate: AggregateRef, maxDepth?: number): Promise<LineageGraph> {
    return this.system.graphBuilder.buildDownstreamGraph(
      aggregate.aggregateId,
      aggregate.aggregateType,
      { maxDepth }
    );
  }

  /**
   * Get full lineage graph (both directions)
   */
  async getFullLineage(aggregate: AggregateRef, maxDepth?: number): Promise<LineageGraph> {
    return this.system.graphBuilder.buildFullGraph(aggregate.aggregateId, aggregate.aggregateType, {
      maxDepth,
    });
  }

  /**
   * Analyze impact of a change to an aggregate
   */
  async analyzeImpact(aggregate: AggregateRef, maxDepth?: number): Promise<ImpactAnalysis> {
    return this.system.graphBuilder.analyzeImpact(aggregate.aggregateId, aggregate.aggregateType, {
      maxDepth,
    });
  }

  // ===========================================================================
  // COMPLIANCE OPERATIONS
  // ===========================================================================

  /**
   * Generate compliance report for an aggregate
   */
  async generateComplianceReport(
    aggregate: AggregateRef,
    framework: ComplianceFramework,
    period?: { start: Date; end: Date }
  ): Promise<ComplianceLineageReport> {
    return this.system.compliance.generateComplianceReport(
      aggregate.aggregateId,
      aggregate.aggregateType,
      framework,
      period
    );
  }

  /**
   * Generate DSAR report (Data Subject Access Request)
   */
  async generateDSARReport(
    subject: AggregateRef,
    requestType: 'access' | 'portability' | 'erasure'
  ): Promise<DataSubjectReport> {
    return this.system.compliance.generateDSARReport(
      subject.aggregateId,
      subject.aggregateType,
      requestType
    );
  }

  /**
   * Assess lawfulness of data processing
   */
  async assessLawfulness(aggregate: AggregateRef): Promise<LawfulnessAssessment> {
    return this.system.compliance.assessLawfulness(aggregate.aggregateId, aggregate.aggregateType);
  }

  /**
   * Generate HIPAA audit trail
   */
  async generateHIPAAAuditTrail(
    phi: AggregateRef,
    period?: { start: Date; end: Date }
  ): Promise<HIPAAAuditEntry[]> {
    return this.system.compliance.generateHIPAAAuditTrail(
      phi.aggregateId,
      phi.aggregateType,
      period
    );
  }

  /**
   * Check HIPAA minimum necessary compliance
   */
  async checkMinimumNecessary(phi: AggregateRef): Promise<{
    isCompliant: boolean;
    issues: string[];
    accessPatterns: {
      purpose: string;
      accessCount: number;
      fieldsAccessed: string[];
    }[];
  }> {
    return this.system.compliance.checkMinimumNecessary(phi.aggregateId, phi.aggregateType);
  }

  /**
   * Get erasure scope for GDPR right to be forgotten
   */
  async getErasureScope(subject: AggregateRef): Promise<{
    primaryData: AggregateRef;
    derivedData: (AggregateRef & { path: string[] })[];
    retainedData: (AggregateRef & { reason: string })[];
    totalAffectedCount: number;
  }> {
    return this.system.compliance.getErasureScope(subject.aggregateId, subject.aggregateType);
  }

  /**
   * Delete lineage for GDPR erasure
   */
  async deleteLineage(aggregateId: string): Promise<number> {
    return this.system.compliance.deleteLineage(aggregateId);
  }

  // ===========================================================================
  // DEBUGGING OPERATIONS
  // ===========================================================================

  /**
   * Investigate an aggregate's lineage
   */
  async investigateAggregate(aggregate: AggregateRef): Promise<InvestigationResult> {
    return this.system.debug.investigateAggregate(aggregate.aggregateId, aggregate.aggregateType);
  }

  /**
   * Investigate an event's lineage
   */
  async investigateEvent(eventId: string): Promise<InvestigationResult> {
    return this.system.debug.investigateEvent(eventId);
  }

  /**
   * Investigate a correlation (trace a request)
   */
  async investigateCorrelation(correlationId: string): Promise<InvestigationResult> {
    return this.system.debug.investigateCorrelation(correlationId);
  }

  /**
   * Perform health check on lineage system
   */
  async performHealthCheck(): Promise<LineageHealthCheck> {
    return this.system.debug.performHealthCheck();
  }

  // ===========================================================================
  // DASHBOARD DATA
  // ===========================================================================

  /**
   * Get lineage dashboard data
   */
  async getDashboardData(): Promise<LineageDashboard> {
    const [health, last24h, last7d, last30d] = await Promise.all([
      this.system.debug.performHealthCheck(),
      this.system.store.query({
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 1,
      }),
      this.system.store.query({
        startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        limit: 1,
      }),
      this.system.store.query({
        startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        limit: 1,
      }),
    ]);

    // Get recent entries for analysis
    const recentEntries = await this.system.store.query({
      startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      limit: 1000,
    });

    // Calculate top transformations
    const transformationMap = new Map<string, { count: number; totalQuality: number }>();
    for (const entry of recentEntries.entries) {
      const existing = transformationMap.get(entry.transformationType) ?? {
        count: 0,
        totalQuality: 0,
      };
      existing.count++;
      existing.totalQuality += entry.quality?.confidence ?? 0;
      transformationMap.set(entry.transformationType, existing);
    }

    const topTransformations = Array.from(transformationMap.entries())
      .map(([type, data]) => ({
        type,
        count: data.count,
        avgQuality: data.count > 0 ? data.totalQuality / data.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate compliance summary
    let hipaaEntries = 0;
    let gdprEntries = 0;
    let withLegalBasis = 0;
    let withConsent = 0;

    for (const entry of recentEntries.entries) {
      if (entry.compliance?.frameworks?.includes('HIPAA')) hipaaEntries++;
      if (entry.compliance?.frameworks?.includes('GDPR')) gdprEntries++;
      if (entry.compliance?.legalBasis) withLegalBasis++;
      if (entry.compliance?.consentId) withConsent++;
    }

    return {
      health,
      recentActivity: {
        last24h: last24h.total,
        last7d: last7d.total,
        last30d: last30d.total,
      },
      topTransformations,
      complianceSummary: {
        hipaaEntries,
        gdprEntries,
        withLegalBasis,
        withConsent,
      },
      generatedAt: new Date(),
    };
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Flush pending lineage entries
   */
  async flush(): Promise<void> {
    await this.system.tracker.flushBatch();
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    await this.system.tracker.shutdown();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a data lineage service
 */
export function createDataLineageService(deps: DataLineageServiceDependencies): DataLineageService {
  return new DataLineageService(deps);
}
