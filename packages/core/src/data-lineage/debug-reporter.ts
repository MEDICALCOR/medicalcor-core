/**
 * M15: Debug Lineage Reporter
 *
 * Provides debugging and troubleshooting tools for data lineage.
 * Helps identify issues with data flow, broken causation chains,
 * and quality problems.
 *
 * @module core/data-lineage/debug-reporter
 */

import { createLogger, type Logger } from '../logger.js';
import type { StoredEvent, EventStoreRepository } from '../event-store.js';
import type {
  LineageEntry,
  LineageStore,
  DebugLineageTrace,
  DataFlowVisualization,
} from './types.js';
import { LineageGraphBuilder } from './graph-builder.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Issue found during lineage investigation
 */
export interface LineageIssue {
  /** Issue severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Issue type */
  type:
    | 'missing_source'
    | 'quality_below_threshold'
    | 'broken_chain'
    | 'circular_dependency'
    | 'orphan_entry'
    | 'duplicate_entry'
    | 'missing_compliance'
    | 'stale_data'
    | 'processing_timeout';
  /** Human-readable message */
  message: string;
  /** Related aggregate */
  aggregateId?: string;
  aggregateType?: string;
  /** Related event */
  eventId?: string;
  /** Related lineage entry */
  lineageEntryId?: string;
  /** Suggested fix */
  suggestion?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Health check result for lineage system
 */
export interface LineageHealthCheck {
  /** Overall health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Health score (0-100) */
  score: number;
  /** Check timestamp */
  checkedAt: Date;
  /** Individual checks */
  checks: {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    duration: number;
  }[];
  /** Statistics */
  stats: {
    totalEntries: number;
    entriesLast24h: number;
    averageQuality: number;
    issueCount: number;
    orphanCount: number;
  };
  /** Issues found */
  issues: LineageIssue[];
}

/**
 * Investigation result for a specific query
 */
export interface InvestigationResult {
  /** Investigation query */
  query: {
    type: 'aggregate' | 'event' | 'correlation';
    id: string;
    aggregateType?: string;
  };
  /** Investigation timestamp */
  investigatedAt: Date;
  /** Duration in ms */
  durationMs: number;
  /** Found lineage entries */
  lineageEntries: LineageEntry[];
  /** Related events (if event store available) */
  relatedEvents: StoredEvent[];
  /** Causation chain */
  causationChain: {
    eventId: string;
    eventType: string;
    correlationId: string;
    causationId?: string;
    timestamp: Date;
  }[];
  /** Issues found */
  issues: LineageIssue[];
  /** Visualization */
  visualization: DataFlowVisualization;
  /** Summary */
  summary: string;
}

// =============================================================================
// DEBUG REPORTER
// =============================================================================

/**
 * Debug reporter for lineage troubleshooting
 */
export class DebugLineageReporter {
  private store: LineageStore;
  private eventStore: EventStoreRepository | null;
  private graphBuilder: LineageGraphBuilder;
  private logger: Logger;

  constructor(store: LineageStore, eventStore?: EventStoreRepository) {
    this.store = store;
    this.eventStore = eventStore ?? null;
    this.graphBuilder = new LineageGraphBuilder(store);
    this.logger = createLogger({ name: 'debug-lineage-reporter' });
  }

  // ===========================================================================
  // INVESTIGATION
  // ===========================================================================

  /**
   * Investigate lineage for a specific aggregate
   */
  async investigateAggregate(
    aggregateId: string,
    aggregateType: string
  ): Promise<InvestigationResult> {
    const startTime = Date.now();
    this.logger.info({ aggregateId, aggregateType }, 'Starting aggregate investigation');

    // Get lineage entries
    const lineageEntries = await this.store.getByAggregateId(aggregateId, aggregateType);

    // Get related events if event store is available
    const relatedEvents = this.eventStore
      ? await this.eventStore.getByAggregateId(aggregateId)
      : [];

    // Build causation chain
    const causationChain = this.buildCausationChain(lineageEntries);

    // Find issues
    const issues = this.findIssues(lineageEntries, relatedEvents);

    // Build visualization
    const graph = await this.graphBuilder.buildFullGraph(aggregateId, aggregateType);
    const visualization = this.graphBuilder.generateVisualization(graph);

    // Generate summary
    const summary = this.generateInvestigationSummary(
      { aggregateId, aggregateType },
      lineageEntries,
      issues
    );

    return {
      query: { type: 'aggregate', id: aggregateId, aggregateType },
      investigatedAt: new Date(),
      durationMs: Date.now() - startTime,
      lineageEntries,
      relatedEvents,
      causationChain,
      issues,
      visualization,
      summary,
    };
  }

  /**
   * Investigate lineage for a specific event
   */
  async investigateEvent(eventId: string): Promise<InvestigationResult> {
    const startTime = Date.now();
    this.logger.info({ eventId }, 'Starting event investigation');

    // Get lineage entries for this event
    const lineageEntries = await this.store.getByEventId(eventId);

    // Get the event itself if event store available
    let relatedEvents: StoredEvent[] = [];
    if (this.eventStore && lineageEntries.length > 0) {
      const entry = lineageEntries[0];
      if (entry) {
        const correlationEvents = await this.eventStore.getByCorrelationId(entry.correlationId);
        relatedEvents = correlationEvents;
      }
    }

    // Build causation chain
    const causationChain = this.buildCausationChain(lineageEntries);

    // Find issues
    const issues = this.findIssues(lineageEntries, relatedEvents);

    // Build visualization
    let visualization: DataFlowVisualization;
    if (lineageEntries.length > 0) {
      const entry = lineageEntries[0];
      if (entry) {
        const graph = await this.graphBuilder.buildFullGraph(
          entry.targetAggregateId,
          entry.targetAggregateType
        );
        visualization = this.graphBuilder.generateVisualization(graph);
      } else {
        visualization = this.emptyVisualization();
      }
    } else {
      visualization = this.emptyVisualization();
    }

    // Generate summary
    const summary = this.generateInvestigationSummary({ eventId }, lineageEntries, issues);

    return {
      query: { type: 'event', id: eventId },
      investigatedAt: new Date(),
      durationMs: Date.now() - startTime,
      lineageEntries,
      relatedEvents,
      causationChain,
      issues,
      visualization,
      summary,
    };
  }

  /**
   * Investigate lineage for a correlation ID (trace a request)
   */
  async investigateCorrelation(correlationId: string): Promise<InvestigationResult> {
    const startTime = Date.now();
    this.logger.info({ correlationId }, 'Starting correlation investigation');

    // Get all lineage entries for this correlation
    const lineageEntries = await this.store.getByCorrelationId(correlationId);

    // Get related events if event store available
    const relatedEvents = this.eventStore
      ? await this.eventStore.getByCorrelationId(correlationId)
      : [];

    // Build causation chain from events
    const causationChain = this.buildCausationChainFromEvents(relatedEvents);

    // Find issues
    const issues = this.findIssues(lineageEntries, relatedEvents);

    // Build visualization - combine all aggregates
    const visualization = this.buildCorrelationVisualization(lineageEntries);

    // Generate summary
    const summary = this.generateInvestigationSummary({ correlationId }, lineageEntries, issues);

    return {
      query: { type: 'correlation', id: correlationId },
      investigatedAt: new Date(),
      durationMs: Date.now() - startTime,
      lineageEntries,
      relatedEvents,
      causationChain,
      issues,
      visualization,
      summary,
    };
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  /**
   * Perform a health check on the lineage system
   */
  async performHealthCheck(): Promise<LineageHealthCheck> {
    const checks: LineageHealthCheck['checks'] = [];
    const issues: LineageIssue[] = [];

    // Check 1: Recent entries exist
    const checkRecentStart = Date.now();
    const recentResult = await this.store.query({
      startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
      limit: 100,
    });
    checks.push({
      name: 'Recent Entries',
      status: recentResult.total > 0 ? 'pass' : 'warn',
      message:
        recentResult.total > 0
          ? `${recentResult.total} entries in last 24h`
          : 'No entries in last 24h',
      duration: Date.now() - checkRecentStart,
    });

    // Check 2: Quality scores
    const checkQualityStart = Date.now();
    const qualityScores = recentResult.entries
      .filter((e) => e.quality?.confidence !== undefined)
      .map((e) => e.quality!.confidence);
    const avgQuality =
      qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 0;
    checks.push({
      name: 'Average Quality',
      status: avgQuality >= 0.7 ? 'pass' : avgQuality >= 0.5 ? 'warn' : 'fail',
      message: `Average quality score: ${(avgQuality * 100).toFixed(1)}%`,
      duration: Date.now() - checkQualityStart,
    });

    if (avgQuality < 0.5) {
      issues.push({
        severity: 'warning',
        type: 'quality_below_threshold',
        message: 'Average data quality below 50%',
        suggestion: 'Review data sources and enrichment processes',
      });
    }

    // Check 3: Orphan entries (no sources)
    const checkOrphanStart = Date.now();
    const orphanEntries = recentResult.entries.filter(
      (e) => e.sources.length === 0 && e.transformationType !== 'ingestion'
    );
    checks.push({
      name: 'Orphan Entries',
      status: orphanEntries.length === 0 ? 'pass' : 'warn',
      message:
        orphanEntries.length === 0
          ? 'No orphan entries found'
          : `${orphanEntries.length} orphan entries found`,
      duration: Date.now() - checkOrphanStart,
    });

    if (orphanEntries.length > 0) {
      issues.push({
        severity: 'warning',
        type: 'orphan_entry',
        message: `${orphanEntries.length} entries have no sources`,
        suggestion: 'Verify data source tracking is properly configured',
      });
    }

    // Check 4: Compliance tags
    const checkComplianceStart = Date.now();
    const entriesWithCompliance = recentResult.entries.filter(
      (e) => e.compliance?.frameworks && e.compliance.frameworks.length > 0
    );
    const complianceRate =
      recentResult.total > 0 ? entriesWithCompliance.length / recentResult.total : 0;
    checks.push({
      name: 'Compliance Tags',
      status: complianceRate >= 0.8 ? 'pass' : complianceRate >= 0.5 ? 'warn' : 'fail',
      message: `${(complianceRate * 100).toFixed(1)}% of entries have compliance tags`,
      duration: Date.now() - checkComplianceStart,
    });

    if (complianceRate < 0.5) {
      issues.push({
        severity: 'error',
        type: 'missing_compliance',
        message: 'Less than 50% of entries have compliance tags',
        suggestion: 'Review compliance tagging in lineage tracker configuration',
      });
    }

    // Check 5: Processing latency
    const checkLatencyStart = Date.now();
    const processingTimes = recentResult.entries
      .filter((e) => e.processingContext?.durationMs !== undefined)
      .map((e) => e.processingContext!.durationMs!);
    const avgLatency =
      processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0;
    const maxLatency = processingTimes.length > 0 ? Math.max(...processingTimes) : 0;
    checks.push({
      name: 'Processing Latency',
      status: avgLatency < 1000 ? 'pass' : avgLatency < 5000 ? 'warn' : 'fail',
      message: `Avg: ${avgLatency.toFixed(0)}ms, Max: ${maxLatency.toFixed(0)}ms`,
      duration: Date.now() - checkLatencyStart,
    });

    if (maxLatency > 10000) {
      issues.push({
        severity: 'warning',
        type: 'processing_timeout',
        message: 'Some processing operations taking >10s',
        suggestion: 'Investigate slow processing operations',
      });
    }

    // Calculate overall score
    const passCount = checks.filter((c) => c.status === 'pass').length;
    const warnCount = checks.filter((c) => c.status === 'warn').length;
    const score = Math.round(((passCount + warnCount * 0.5) / checks.length) * 100);

    // Determine status
    let status: LineageHealthCheck['status'];
    if (checks.some((c) => c.status === 'fail')) {
      status = 'unhealthy';
    } else if (checks.some((c) => c.status === 'warn')) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    // Get total count
    const totalResult = await this.store.query({ limit: 1 });

    return {
      status,
      score,
      checkedAt: new Date(),
      checks,
      stats: {
        totalEntries: totalResult.total,
        entriesLast24h: recentResult.total,
        averageQuality: avgQuality,
        issueCount: issues.length,
        orphanCount: orphanEntries.length,
      },
      issues,
    };
  }

  // ===========================================================================
  // TRACE GENERATION
  // ===========================================================================

  /**
   * Generate a debug trace for an aggregate
   */
  async generateTrace(aggregateId: string, aggregateType: string): Promise<DebugLineageTrace> {
    const lineageEntries = await this.store.getByAggregateId(aggregateId, aggregateType);
    const causationChain = this.buildCausationChain(lineageEntries);

    // Find issues
    const issues: DebugLineageTrace['issues'] = [];

    // Check for missing sources
    for (const entry of lineageEntries) {
      if (entry.sources.length === 0 && entry.transformationType !== 'ingestion') {
        issues.push({
          severity: 'warning',
          type: 'missing_source',
          message: `Entry ${entry.id} has no sources for ${entry.transformationType}`,
          relatedEntryId: entry.id,
        });
      }

      if (entry.quality && entry.quality.confidence < 0.5) {
        issues.push({
          severity: 'warning',
          type: 'quality_below_threshold',
          message: `Entry ${entry.id} has low quality (${(entry.quality.confidence * 100).toFixed(0)}%)`,
          relatedEntryId: entry.id,
        });
      }
    }

    // Check for broken chains
    const eventIds = new Set(lineageEntries.map((e) => e.triggerEventId));
    for (const entry of lineageEntries) {
      if (entry.causationId && !eventIds.has(entry.causationId)) {
        issues.push({
          severity: 'error',
          type: 'broken_chain',
          message: `Entry ${entry.id} references missing causation ${entry.causationId}`,
          relatedEntryId: entry.id,
        });
      }
    }

    // Calculate stats
    const qualityScores = lineageEntries
      .filter((e) => e.quality?.confidence !== undefined)
      .map((e) => e.quality!.confidence);
    const avgQuality =
      qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 0;

    const processingTimes = lineageEntries
      .filter((e) => e.processingContext?.durationMs !== undefined)
      .map((e) => e.processingContext!.durationMs!);
    const totalProcessingTime = processingTimes.reduce((a, b) => a + b, 0);

    const uniqueSources = new Set<string>();
    for (const entry of lineageEntries) {
      for (const source of entry.sources) {
        uniqueSources.add(`${source.aggregateType}:${source.aggregateId}`);
      }
    }

    return {
      id: `trace-${aggregateId}-${Date.now()}`,
      target: {
        aggregateId,
        aggregateType,
      },
      causationChain,
      lineageEntries,
      issues,
      stats: {
        chainLength: causationChain.length,
        uniqueSources: uniqueSources.size,
        averageQuality: avgQuality,
        totalProcessingTimeMs: totalProcessingTime,
      },
      tracedAt: new Date(),
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private buildCausationChain(entries: LineageEntry[]): DebugLineageTrace['causationChain'] {
    // Build chain from entries
    const chain: DebugLineageTrace['causationChain'] = [];

    // Sort by timestamp
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const entry of sortedEntries) {
      chain.push({
        eventId: entry.triggerEventId,
        eventType: entry.triggerEventType,
        correlationId: entry.correlationId,
        causationId: entry.causationId,
        timestamp: new Date(entry.createdAt),
      });
    }

    return chain;
  }

  private buildCausationChainFromEvents(
    events: StoredEvent[]
  ): DebugLineageTrace['causationChain'] {
    return events
      .sort(
        (a, b) =>
          new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime()
      )
      .map((e) => ({
        eventId: e.id,
        eventType: e.type,
        correlationId: e.metadata.correlationId,
        causationId: e.metadata.causationId,
        timestamp: new Date(e.metadata.timestamp),
      }));
  }

  private findIssues(entries: LineageEntry[], events: StoredEvent[]): LineageIssue[] {
    const issues: LineageIssue[] = [];

    // Check for entries without corresponding events
    const eventIds = new Set(events.map((e) => e.id));
    for (const entry of entries) {
      if (events.length > 0 && !eventIds.has(entry.triggerEventId)) {
        issues.push({
          severity: 'warning',
          type: 'missing_source',
          message: `Lineage references event ${entry.triggerEventId} not found in event store`,
          eventId: entry.triggerEventId,
          lineageEntryId: entry.id,
        });
      }
    }

    // Check for low quality
    for (const entry of entries) {
      if (entry.quality && entry.quality.confidence < 0.5) {
        issues.push({
          severity: 'warning',
          type: 'quality_below_threshold',
          message: `Low quality score (${(entry.quality.confidence * 100).toFixed(0)}%) for ${entry.transformationType}`,
          aggregateId: entry.targetAggregateId,
          aggregateType: entry.targetAggregateType,
          lineageEntryId: entry.id,
          suggestion: 'Review data sources and enrichment process',
        });
      }
    }

    // Check for missing compliance on PHI
    for (const entry of entries) {
      if (
        entry.compliance?.sensitivity === 'phi' &&
        !entry.compliance.frameworks?.includes('HIPAA')
      ) {
        issues.push({
          severity: 'error',
          type: 'missing_compliance',
          message: 'PHI data without HIPAA compliance tag',
          aggregateId: entry.targetAggregateId,
          aggregateType: entry.targetAggregateType,
          lineageEntryId: entry.id,
          suggestion: 'Add HIPAA compliance framework to entry',
        });
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (entryId: string): boolean => {
      if (recursionStack.has(entryId)) return true;
      if (visited.has(entryId)) return false;

      visited.add(entryId);
      recursionStack.add(entryId);

      const entry = entries.find((e) => e.id === entryId);
      if (entry) {
        for (const source of entry.sources) {
          const sourceEntries = entries.filter(
            (e) =>
              e.targetAggregateId === source.aggregateId &&
              e.targetAggregateType === source.aggregateType
          );
          for (const sourceEntry of sourceEntries) {
            if (hasCycle(sourceEntry.id)) return true;
          }
        }
      }

      recursionStack.delete(entryId);
      return false;
    };

    for (const entry of entries) {
      if (hasCycle(entry.id)) {
        issues.push({
          severity: 'error',
          type: 'circular_dependency',
          message: 'Circular dependency detected in lineage',
          lineageEntryId: entry.id,
          suggestion: 'Review data flow to break circular dependency',
        });
        break;
      }
    }

    return issues;
  }

  private buildCorrelationVisualization(entries: LineageEntry[]): DataFlowVisualization {
    const nodesMap = new Map<string, { id: string; label: string; type: string; group: number }>();
    const links: { source: string; target: string; label: string; value: number }[] = [];
    const mermaidLines: string[] = ['graph LR'];

    let groupCounter = 0;
    const typeGroups = new Map<string, number>();

    for (const entry of entries) {
      // Add target node
      const targetKey = `${entry.targetAggregateType}:${entry.targetAggregateId}`;
      if (!nodesMap.has(targetKey)) {
        if (!typeGroups.has(entry.targetAggregateType)) {
          typeGroups.set(entry.targetAggregateType, groupCounter++);
        }
        nodesMap.set(targetKey, {
          id: entry.targetAggregateId,
          label: `${entry.targetAggregateType}:${entry.targetAggregateId.substring(0, 8)}`,
          type: entry.targetAggregateType,
          group: typeGroups.get(entry.targetAggregateType) ?? 0,
        });
      }

      // Add source nodes and edges
      for (const source of entry.sources) {
        const sourceKey = `${source.aggregateType}:${source.aggregateId}`;
        if (!nodesMap.has(sourceKey)) {
          if (!typeGroups.has(source.aggregateType)) {
            typeGroups.set(source.aggregateType, groupCounter++);
          }
          nodesMap.set(sourceKey, {
            id: source.aggregateId,
            label: `${source.aggregateType}:${source.aggregateId.substring(0, 8)}`,
            type: source.aggregateType,
            group: typeGroups.get(source.aggregateType) ?? 0,
          });
        }

        links.push({
          source: source.aggregateId,
          target: entry.targetAggregateId,
          label: entry.transformationType,
          value: 1,
        });

        mermaidLines.push(
          `    ${source.aggregateId.substring(0, 8)} -->|${entry.transformationType}| ${entry.targetAggregateId.substring(0, 8)}`
        );
      }
    }

    // Add node definitions to mermaid
    for (const node of nodesMap.values()) {
      const escapedLabel = node.label.replace(/[:[\]()]/g, '_');
      mermaidLines.splice(1, 0, `    ${node.id.substring(0, 8)}["${escapedLabel}"]`);
    }

    return {
      mermaid: mermaidLines.join('\n'),
      d3Graph: {
        nodes: Array.from(nodesMap.values()),
        links,
      },
      summary: this.generateVisualizationSummary(entries),
    };
  }

  private emptyVisualization(): DataFlowVisualization {
    return {
      mermaid: 'graph LR\n    empty["No data"]',
      d3Graph: { nodes: [], links: [] },
      summary: 'No lineage data found for this query.',
    };
  }

  private generateVisualizationSummary(entries: LineageEntry[]): string {
    if (entries.length === 0) {
      return 'No lineage entries found.';
    }

    const aggregates = new Set<string>();
    const transformations = new Set<string>();

    for (const entry of entries) {
      aggregates.add(`${entry.targetAggregateType}:${entry.targetAggregateId.substring(0, 8)}`);
      transformations.add(entry.transformationType);
      for (const source of entry.sources) {
        aggregates.add(`${source.aggregateType}:${source.aggregateId.substring(0, 8)}`);
      }
    }

    return [
      `Lineage Visualization Summary`,
      `=============================`,
      `Entries: ${entries.length}`,
      `Unique Aggregates: ${aggregates.size}`,
      `Transformation Types: ${Array.from(transformations).join(', ')}`,
    ].join('\n');
  }

  private generateInvestigationSummary(
    query: Record<string, unknown>,
    entries: LineageEntry[],
    issues: LineageIssue[]
  ): string {
    const lines: string[] = [];

    lines.push('Investigation Summary');
    lines.push('=====================');
    lines.push(`Query: ${JSON.stringify(query)}`);
    lines.push(`Lineage Entries Found: ${entries.length}`);
    lines.push(`Issues Found: ${issues.length}`);

    if (issues.length > 0) {
      lines.push('\nIssues:');
      for (const issue of issues) {
        lines.push(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
        if (issue.suggestion) {
          lines.push(`    Suggestion: ${issue.suggestion}`);
        }
      }
    }

    if (entries.length > 0) {
      const transformations = new Map<string, number>();
      for (const entry of entries) {
        transformations.set(
          entry.transformationType,
          (transformations.get(entry.transformationType) ?? 0) + 1
        );
      }

      lines.push('\nTransformations:');
      for (const [type, count] of transformations) {
        lines.push(`  - ${type}: ${count}`);
      }

      // Time range
      const timestamps = entries.map((e) => new Date(e.createdAt).getTime());
      const earliest = new Date(Math.min(...timestamps));
      const latest = new Date(Math.max(...timestamps));
      lines.push(`\nTime Range: ${earliest.toISOString()} to ${latest.toISOString()}`);
    }

    return lines.join('\n');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a debug lineage reporter
 */
export function createDebugLineageReporter(
  store: LineageStore,
  eventStore?: EventStoreRepository
): DebugLineageReporter {
  return new DebugLineageReporter(store, eventStore);
}
