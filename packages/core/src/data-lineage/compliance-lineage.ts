/**
 * M15: Compliance Lineage Service
 *
 * Provides HIPAA/GDPR compliance-specific lineage tracking and reporting.
 * Supports audit requirements, data subject access requests, and
 * regulatory compliance verification.
 *
 * @module core/data-lineage/compliance-lineage
 */

import { createLogger, type Logger } from '../logger.js';
import type {
  LineageEntry,
  LineageStore,
  ComplianceFramework,
  ComplianceLineageReport,
  LegalBasis,
  DataSensitivity,
  TransformationType,
} from './types.js';
import { LineageGraphBuilder } from './graph-builder.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Data subject access request (DSAR) report
 */
export interface DataSubjectReport {
  /** Subject identifier */
  subjectId: string;
  subjectType: string;
  /** Report generation time */
  generatedAt: Date;
  /** Request type (access, portability, erasure) */
  requestType: 'access' | 'portability' | 'erasure';
  /** All data sources that contributed to this subject */
  dataSources: {
    sourceType: string;
    sourceId: string;
    transformationType: TransformationType;
    legalBasis?: LegalBasis;
    timestamp: Date;
  }[];
  /** All processing activities on this subject's data */
  processingActivities: {
    activityType: TransformationType;
    description: string;
    purpose?: string;
    legalBasis?: LegalBasis;
    processor?: string;
    firstOccurrence: Date;
    lastOccurrence: Date;
    count: number;
  }[];
  /** Data sharing/transfers */
  dataTransfers: {
    recipientType: string;
    recipientId: string;
    purpose?: string;
    timestamp: Date;
  }[];
  /** Retention information */
  retention: {
    earliestData: Date;
    latestData: Date;
    retentionPolicyDays?: number;
    scheduledDeletionDate?: Date;
  };
  /** Consent records */
  consents: {
    consentId: string;
    purpose: string;
    grantedAt: Date;
    withdrawnAt?: Date;
    active: boolean;
  }[];
}

/**
 * HIPAA audit trail entry
 */
export interface HIPAAAuditEntry {
  /** Unique audit ID */
  id: string;
  /** PHI accessed */
  phiId: string;
  phiType: string;
  /** Access type */
  accessType: 'view' | 'create' | 'modify' | 'delete' | 'export' | 'transmit';
  /** Who accessed */
  userId: string;
  userName?: string;
  userRole?: string;
  /** When */
  timestamp: Date;
  /** Access context */
  purpose: string;
  /** Source system */
  sourceSystem: string;
  /** Outcome */
  outcome: 'success' | 'failure' | 'partial';
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Processing lawfulness assessment
 */
export interface LawfulnessAssessment {
  /** Aggregate being assessed */
  aggregateId: string;
  aggregateType: string;
  /** Assessment result */
  isLawful: boolean;
  /** Legal basis for each processing activity */
  processingBases: {
    transformationType: TransformationType;
    legalBasis?: LegalBasis;
    isDocumented: boolean;
    hasConsent: boolean;
    issues: string[];
  }[];
  /** Overall issues */
  issues: string[];
  /** Recommendations */
  recommendations: string[];
  /** Assessment timestamp */
  assessedAt: Date;
}

// =============================================================================
// COMPLIANCE SERVICE
// =============================================================================

/**
 * Compliance-focused lineage service
 */
export class ComplianceLineageService {
  private store: LineageStore;
  private graphBuilder: LineageGraphBuilder;
  private logger: Logger;

  constructor(store: LineageStore) {
    this.store = store;
    this.graphBuilder = new LineageGraphBuilder(store);
    this.logger = createLogger({ name: 'compliance-lineage' });
  }

  // ===========================================================================
  // COMPLIANCE REPORTS
  // ===========================================================================

  /**
   * Generate a compliance lineage report for a specific framework
   */
  async generateComplianceReport(
    aggregateId: string,
    aggregateType: string,
    framework: ComplianceFramework,
    period?: { start: Date; end: Date }
  ): Promise<ComplianceLineageReport> {
    const startTime = period?.start ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const endTime = period?.end ?? new Date();

    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

    // Get all lineage entries for this aggregate
    const entries = await this.store.getByAggregateId(aggregateId, aggregateType);

    // Filter by framework and time
    const relevantEntries = entries.filter((entry) => {
      const entryTime = new Date(entry.createdAt);
      const inTimeRange = entryTime >= startTime && entryTime <= endTime;
      const hasFramework = entry.compliance?.frameworks?.includes(framework);
      return inTimeRange && (hasFramework || !entry.compliance?.frameworks);
    });
    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */

    // Group processing activities
    const activityMap = new Map<
      string,
      {
        transformationType: TransformationType;
        description: string;
        legalBasis?: LegalBasis;
        purpose?: string;
        count: number;
        firstOccurrence: Date;
        lastOccurrence: Date;
      }
    >();

    for (const entry of relevantEntries) {
      const key = `${entry.transformationType}:${entry.compliance?.purpose ?? 'unspecified'}`;
      const existing = activityMap.get(key);
      const entryTime = new Date(entry.createdAt);

      if (existing) {
        existing.count++;
        if (entryTime < existing.firstOccurrence) existing.firstOccurrence = entryTime;
        if (entryTime > existing.lastOccurrence) existing.lastOccurrence = entryTime;
      } else {
        activityMap.set(key, {
          transformationType: entry.transformationType,
          description: entry.transformationDescription ?? entry.transformationType,
          legalBasis: entry.compliance?.legalBasis,
          purpose: entry.compliance?.purpose,
          count: 1,
          firstOccurrence: entryTime,
          lastOccurrence: entryTime,
        });
      }
    }

    // Collect data sources
    const sourceMap = new Map<
      string,
      { aggregateType: string; count: number; sensitivity?: DataSensitivity }
    >();
    for (const entry of relevantEntries) {
      for (const source of entry.sources) {
        const key = source.aggregateType;
        const existing = sourceMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          sourceMap.set(key, {
            aggregateType: source.aggregateType,
            count: 1,
            sensitivity: entry.compliance?.sensitivity,
          });
        }
      }
    }

    // Collect data recipients (downstream)
    const graph = await this.graphBuilder.buildDownstreamGraph(aggregateId, aggregateType, {
      maxDepth: 3,
      timeRange: { start: startTime, end: endTime },
    });

    const recipientMap = new Map<
      string,
      { aggregateType: string; transformationType: TransformationType; count: number }
    >();
    for (const edge of graph.edges) {
      if (edge.sourceId === aggregateId) {
        const targetNode = graph.nodes.find((n) => n.id === edge.targetId);
        const key = `${targetNode?.type}:${edge.transformationType}`;
        const existing = recipientMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          recipientMap.set(key, {
            aggregateType: targetNode?.type ?? 'Unknown',
            transformationType: edge.transformationType,
            count: 1,
          });
        }
      }
    }

    // Collect consents
    const consents = relevantEntries
      .filter((e) => e.compliance?.consentId)
      .map((e) => ({
        consentId: e.compliance!.consentId!,
        purpose: e.compliance?.purpose ?? 'General processing',
        grantedAt: new Date(e.createdAt),
        withdrawnAt: undefined,
      }));

    return {
      period: { start: startTime, end: endTime },
      framework,
      subject: { aggregateId, aggregateType },
      processingActivities: Array.from(activityMap.values()),
      dataSources: Array.from(sourceMap.values()),
      dataRecipients: Array.from(recipientMap.values()),
      consents: this.deduplicateConsents(consents),
      generatedAt: new Date(),
      generatedBy: 'ComplianceLineageService',
    };
  }

  // ===========================================================================
  // GDPR SPECIFIC
  // ===========================================================================

  /**
   * Generate Data Subject Access Request (DSAR) report
   */
  async generateDSARReport(
    subjectId: string,
    subjectType: string,
    requestType: 'access' | 'portability' | 'erasure'
  ): Promise<DataSubjectReport> {
    this.logger.info({ subjectId, subjectType, requestType }, 'Generating DSAR report');

    // Get all lineage for this subject
    const entries = await this.store.getByAggregateId(subjectId, subjectType);

    // Get upstream graph to find all data sources
    const upstreamGraph = await this.graphBuilder.buildUpstreamGraph(subjectId, subjectType, {
      maxDepth: 5,
    });

    // Get downstream graph for data transfers
    const downstreamGraph = await this.graphBuilder.buildDownstreamGraph(subjectId, subjectType, {
      maxDepth: 3,
    });

    // Build data sources list
    const dataSources = upstreamGraph.edges.map((edge) => ({
      sourceType: upstreamGraph.nodes.find((n) => n.id === edge.sourceId)?.type ?? 'Unknown',
      sourceId: edge.sourceId,
      transformationType: edge.transformationType,
      legalBasis: entries.find((e) => e.triggerEventId === edge.eventId)?.compliance?.legalBasis,
      timestamp: edge.timestamp,
    }));

    // Build processing activities
    const activityMap = new Map<string, DataSubjectReport['processingActivities'][0]>();
    for (const entry of entries) {
      const key = entry.transformationType;
      const existing = activityMap.get(key);
      const entryTime = new Date(entry.createdAt);

      if (existing) {
        existing.count++;
        if (entryTime < existing.firstOccurrence) existing.firstOccurrence = entryTime;
        if (entryTime > existing.lastOccurrence) existing.lastOccurrence = entryTime;
      } else {
        activityMap.set(key, {
          activityType: entry.transformationType,
          description: entry.transformationDescription ?? entry.transformationType,
          purpose: entry.compliance?.purpose,
          legalBasis: entry.compliance?.legalBasis,
          processor: entry.processingContext?.service,
          firstOccurrence: entryTime,
          lastOccurrence: entryTime,
          count: 1,
        });
      }
    }

    // Build data transfers
    const dataTransfers = downstreamGraph.edges.map((edge) => ({
      recipientType: downstreamGraph.nodes.find((n) => n.id === edge.targetId)?.type ?? 'Unknown',
      recipientId: edge.targetId,
      purpose: entries.find((e) => e.triggerEventId === edge.eventId)?.compliance?.purpose,
      timestamp: edge.timestamp,
    }));

    // Calculate retention
    const timestamps = entries.map((e) => new Date(e.createdAt).getTime());
    const earliestData = new Date(Math.min(...timestamps));
    const latestData = new Date(Math.max(...timestamps));
    const retentionDays = entries[0]?.compliance?.retentionDays;

    // Collect consents
    const consents = entries
      .filter((e) => e.compliance?.consentId)
      .map((e) => ({
        consentId: e.compliance!.consentId!,
        purpose: e.compliance?.purpose ?? 'General processing',
        grantedAt: new Date(e.createdAt),
        withdrawnAt: undefined,
        active: true,
      }));

    return {
      subjectId,
      subjectType,
      generatedAt: new Date(),
      requestType,
      dataSources,
      processingActivities: Array.from(activityMap.values()),
      dataTransfers,
      retention: {
        earliestData,
        latestData,
        retentionPolicyDays: retentionDays,
        scheduledDeletionDate: retentionDays
          ? new Date(latestData.getTime() + retentionDays * 24 * 60 * 60 * 1000)
          : undefined,
      },
      consents: this.deduplicateConsents(consents),
    };
  }

  /**
   * Assess lawfulness of processing for a data subject
   */
  async assessLawfulness(
    aggregateId: string,
    aggregateType: string
  ): Promise<LawfulnessAssessment> {
    const entries = await this.store.getByAggregateId(aggregateId, aggregateType);

    const processingBases: LawfulnessAssessment['processingBases'] = [];
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Group by transformation type
    const byTransformation = new Map<TransformationType, LineageEntry[]>();
    for (const entry of entries) {
      const existing = byTransformation.get(entry.transformationType) ?? [];
      existing.push(entry);
      byTransformation.set(entry.transformationType, existing);
    }

    for (const [transformationType, typeEntries] of byTransformation) {
      const hasLegalBasis = typeEntries.some((e) => e.compliance?.legalBasis);
      const hasConsent = typeEntries.some((e) => e.compliance?.consentId);
      const entryIssues: string[] = [];

      // Check for issues
      if (!hasLegalBasis && !hasConsent) {
        entryIssues.push('No documented legal basis for processing');
        issues.push(`${transformationType}: Missing legal basis`);
      }

      // Check for PHI without HIPAA compliance
      const hasPHI = typeEntries.some((e) => e.compliance?.sensitivity === 'phi');
      const hasHIPAA = typeEntries.some((e) => e.compliance?.frameworks?.includes('HIPAA'));
      if (hasPHI && !hasHIPAA) {
        entryIssues.push('PHI processed without HIPAA compliance documentation');
        issues.push(`${transformationType}: PHI without HIPAA tag`);
      }

      // Check for consent-based processing without consent record
      const usesConsentBasis = typeEntries.some((e) => e.compliance?.legalBasis === 'consent');
      if (usesConsentBasis && !hasConsent) {
        entryIssues.push('Consent basis claimed but no consent ID documented');
        issues.push(`${transformationType}: Missing consent record`);
      }

      processingBases.push({
        transformationType,
        legalBasis: typeEntries.find((e) => e.compliance?.legalBasis)?.compliance?.legalBasis,
        isDocumented: hasLegalBasis,
        hasConsent,
        issues: entryIssues,
      });
    }

    // Generate recommendations
    if (issues.length > 0) {
      recommendations.push('Document legal basis for all processing activities');
    }
    if (issues.some((i) => i.includes('PHI'))) {
      recommendations.push('Ensure HIPAA compliance tags are applied to all PHI processing');
    }
    if (issues.some((i) => i.includes('consent'))) {
      recommendations.push('Link consent records to consent-based processing activities');
    }

    const isLawful = issues.length === 0;

    this.logger.info(
      { aggregateId, aggregateType, isLawful, issueCount: issues.length },
      'Lawfulness assessment completed'
    );

    return {
      aggregateId,
      aggregateType,
      isLawful,
      processingBases,
      issues,
      recommendations,
      assessedAt: new Date(),
    };
  }

  // ===========================================================================
  // HIPAA SPECIFIC
  // ===========================================================================

  /**
   * Generate HIPAA audit trail for PHI access
   */
  async generateHIPAAAuditTrail(
    phiId: string,
    phiType: string,
    period?: { start: Date; end: Date }
  ): Promise<HIPAAAuditEntry[]> {
    const startTime = period?.start ?? new Date(Date.now() - 6 * 365 * 24 * 60 * 60 * 1000); // 6 years default for HIPAA
    const endTime = period?.end ?? new Date();

    // Query entries with HIPAA compliance
    const result = await this.store.query({
      aggregateId: phiId,
      aggregateType: phiType,
      complianceFramework: 'HIPAA',
      startTime,
      endTime,
      limit: 10000,
    });

    return result.entries.map((entry) => this.toHIPAAAuditEntry(entry));
  }

  /**
   * Check HIPAA minimum necessary compliance
   */
  async checkMinimumNecessary(
    phiId: string,
    phiType: string
  ): Promise<{
    isCompliant: boolean;
    issues: string[];
    accessPatterns: {
      purpose: string;
      accessCount: number;
      fieldsAccessed: string[];
    }[];
  }> {
    const entries = await this.store.getByAggregateId(phiId, phiType);
    const hipaaEntries = entries.filter((e) => e.compliance?.frameworks?.includes('HIPAA'));

    const accessPatterns = new Map<
      string,
      { purpose: string; accessCount: number; fieldsAccessed: Set<string> }
    >();
    const issues: string[] = [];

    for (const entry of hipaaEntries) {
      const purpose = entry.compliance?.purpose ?? 'Unspecified';
      const pattern = accessPatterns.get(purpose) ?? {
        purpose,
        accessCount: 0,
        fieldsAccessed: new Set<string>(),
      };

      pattern.accessCount++;

      // Track fields accessed from sources
      for (const source of entry.sources) {
        if (source.fields) {
          source.fields.forEach((f) => pattern.fieldsAccessed.add(f));
        }
      }

      accessPatterns.set(purpose, pattern);

      // Check for issues
      if (!entry.compliance?.purpose) {
        issues.push(`Entry ${entry.id}: Missing purpose documentation`);
      }
    }

    // Check for excessive access patterns
    for (const [purpose, pattern] of accessPatterns) {
      if (pattern.fieldsAccessed.size > 20) {
        issues.push(
          `Purpose "${purpose}": Accessing ${pattern.fieldsAccessed.size} fields may violate minimum necessary`
        );
      }
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      accessPatterns: Array.from(accessPatterns.values()).map((p) => ({
        purpose: p.purpose,
        accessCount: p.accessCount,
        fieldsAccessed: Array.from(p.fieldsAccessed),
      })),
    };
  }

  // ===========================================================================
  // DATA ERASURE SUPPORT
  // ===========================================================================

  /**
   * Get all data that would be affected by erasure (GDPR right to be forgotten)
   */
  async getErasureScope(
    subjectId: string,
    subjectType: string
  ): Promise<{
    primaryData: { aggregateId: string; aggregateType: string };
    derivedData: { aggregateId: string; aggregateType: string; path: string[] }[];
    retainedData: {
      aggregateId: string;
      aggregateType: string;
      reason: string;
    }[];
    totalAffectedCount: number;
  }> {
    const downstreamGraph = await this.graphBuilder.buildDownstreamGraph(subjectId, subjectType, {
      maxDepth: 10,
    });

    const derivedData: {
      aggregateId: string;
      aggregateType: string;
      path: string[];
    }[] = [];
    const retainedData: {
      aggregateId: string;
      aggregateType: string;
      reason: string;
    }[] = [];

    // Check each downstream node
    for (const node of downstreamGraph.nodes) {
      if (node.id === subjectId) continue;

      // Get lineage for this node
      const entries = await this.store.getByAggregateId(node.id, node.type);

      // Check if data must be retained
      const hasLegalRetention = entries.some(
        (e) =>
          e.compliance?.legalBasis === 'legal_obligation' ||
          e.compliance?.legalBasis === 'vital_interests'
      );

      if (hasLegalRetention) {
        retainedData.push({
          aggregateId: node.id,
          aggregateType: node.type,
          reason: 'Legal obligation retention requirement',
        });
      } else {
        // Find path from subject to this node
        const path = this.findPath(downstreamGraph, subjectId, node.id);
        derivedData.push({
          aggregateId: node.id,
          aggregateType: node.type,
          path,
        });
      }
    }

    return {
      primaryData: { aggregateId: subjectId, aggregateType: subjectType },
      derivedData,
      retainedData,
      totalAffectedCount: 1 + derivedData.length,
    };
  }

  /**
   * Delete lineage entries for GDPR erasure
   */
  async deleteLineage(aggregateId: string): Promise<number> {
    this.logger.info({ aggregateId }, 'Deleting lineage for GDPR erasure');
    return this.store.deleteByAggregateId(aggregateId);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private deduplicateConsents<T extends { consentId: string }>(consents: T[]): T[] {
    const seen = new Set<string>();
    return consents.filter((c) => {
      if (seen.has(c.consentId)) return false;
      seen.add(c.consentId);
      return true;
    });
  }

  private toHIPAAAuditEntry(entry: LineageEntry): HIPAAAuditEntry {
    // Map transformation type to access type
    const accessTypeMap: Record<TransformationType, HIPAAAuditEntry['accessType']> = {
      ingestion: 'create',
      enrichment: 'modify',
      scoring: 'view',
      aggregation: 'view',
      transformation: 'modify',
      derivation: 'view',
      validation: 'view',
      pattern_detection: 'view',
      insight_generation: 'view',
      routing_decision: 'view',
      consent_processing: 'modify',
      sync: 'transmit',
      manual_update: 'modify',
      system_update: 'modify',
      merge: 'modify',
      anonymization: 'modify',
    };

    return {
      id: entry.id,
      phiId: entry.targetAggregateId,
      phiType: entry.targetAggregateType,
      accessType: accessTypeMap[entry.transformationType],
      userId: entry.actor?.id ?? 'system',
      userName: entry.actor?.name,
      userRole: entry.actor?.type,
      timestamp: new Date(entry.createdAt),
      purpose: entry.compliance?.purpose ?? 'System processing',
      sourceSystem: entry.processingContext?.service ?? 'Unknown',
      outcome: 'success',
      details: entry.metadata,
    };
  }

  private findPath(
    graph: { nodes: { id: string }[]; edges: { sourceId: string; targetId: string }[] },
    sourceId: string,
    targetId: string
  ): string[] {
    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: sourceId, path: [sourceId] }];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { id, path } = item;

      if (id === targetId) return path;
      if (visited.has(id)) continue;
      visited.add(id);

      const outgoing = graph.edges.filter((e) => e.sourceId === id);
      for (const edge of outgoing) {
        if (!visited.has(edge.targetId)) {
          queue.push({ id: edge.targetId, path: [...path, edge.targetId] });
        }
      }
    }

    return [];
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a compliance lineage service
 */
export function createComplianceLineageService(store: LineageStore): ComplianceLineageService {
  return new ComplianceLineageService(store);
}
