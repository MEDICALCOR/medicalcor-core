/**
 * M15: Lineage Graph Builder
 *
 * Builds dependency graphs from lineage entries for visualization,
 * impact analysis, and debugging.
 *
 * @module core/data-lineage/graph-builder
 */

import { createLogger, type Logger } from '../logger.js';
import type {
  LineageEntry,
  LineageGraph,
  LineageNode,
  LineageEdge,
  LineageStore,
  ImpactAnalysis,
  DataFlowVisualization,
  TransformationType,
  ComplianceFramework,
} from './types.js';

// =============================================================================
// GRAPH BUILDER
// =============================================================================

/**
 * Options for graph building
 */
export interface GraphBuildOptions {
  /** Maximum traversal depth */
  maxDepth?: number;
  /** Include compliance metadata */
  includeCompliance?: boolean;
  /** Filter by transformation types */
  transformationTypes?: TransformationType[];
  /** Filter by compliance frameworks */
  complianceFrameworks?: ComplianceFramework[];
  /** Time range filter */
  timeRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Builds and analyzes lineage graphs
 */
export class LineageGraphBuilder {
  private store: LineageStore;
  private logger: Logger;

  constructor(store: LineageStore) {
    this.store = store;
    this.logger = createLogger({ name: 'lineage-graph-builder' });
  }

  // ===========================================================================
  // GRAPH BUILDING
  // ===========================================================================

  /**
   * Build upstream lineage graph (where did data come from)
   */
  async buildUpstreamGraph(
    aggregateId: string,
    aggregateType: string,
    options?: GraphBuildOptions
  ): Promise<LineageGraph> {
    const maxDepth = options?.maxDepth ?? 10;
    const nodesMap = new Map<string, LineageNode>();
    const edges: LineageEdge[] = [];
    const visited = new Set<string>();
    const rootKey = this.nodeKey(aggregateId, aggregateType);

    // Add root node
    nodesMap.set(rootKey, {
      id: aggregateId,
      type: aggregateType,
      label: `${aggregateType}:${aggregateId.substring(0, 8)}`,
    });

    await this.traverseUpstream(
      aggregateId,
      aggregateType,
      0,
      maxDepth,
      nodesMap,
      edges,
      visited,
      options
    );

    const nodes = Array.from(nodesMap.values());

    return {
      nodes,
      edges,
      rootId: aggregateId,
      direction: 'upstream',
      depth: maxDepth,
      stats: this.calculateStats(nodes, edges),
    };
  }

  /**
   * Build downstream lineage graph (what does this data affect)
   */
  async buildDownstreamGraph(
    aggregateId: string,
    aggregateType: string,
    options?: GraphBuildOptions
  ): Promise<LineageGraph> {
    const maxDepth = options?.maxDepth ?? 10;
    const nodesMap = new Map<string, LineageNode>();
    const edges: LineageEdge[] = [];
    const visited = new Set<string>();
    const rootKey = this.nodeKey(aggregateId, aggregateType);

    // Add root node
    nodesMap.set(rootKey, {
      id: aggregateId,
      type: aggregateType,
      label: `${aggregateType}:${aggregateId.substring(0, 8)}`,
    });

    await this.traverseDownstream(
      aggregateId,
      aggregateType,
      0,
      maxDepth,
      nodesMap,
      edges,
      visited,
      options
    );

    const nodes = Array.from(nodesMap.values());

    return {
      nodes,
      edges,
      rootId: aggregateId,
      direction: 'downstream',
      depth: maxDepth,
      stats: this.calculateStats(nodes, edges),
    };
  }

  /**
   * Build bidirectional lineage graph
   */
  async buildFullGraph(
    aggregateId: string,
    aggregateType: string,
    options?: GraphBuildOptions
  ): Promise<LineageGraph> {
    const [upstream, downstream] = await Promise.all([
      this.buildUpstreamGraph(aggregateId, aggregateType, options),
      this.buildDownstreamGraph(aggregateId, aggregateType, options),
    ]);

    // Merge graphs
    const nodesMap = new Map<string, LineageNode>();
    for (const node of [...upstream.nodes, ...downstream.nodes]) {
      nodesMap.set(this.nodeKey(node.id, node.type), node);
    }

    // Deduplicate edges
    const edgeSet = new Set<string>();
    const edges: LineageEdge[] = [];
    for (const edge of [...upstream.edges, ...downstream.edges]) {
      const key = `${edge.sourceId}->${edge.targetId}:${edge.eventId}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push(edge);
      }
    }

    const nodes = Array.from(nodesMap.values());

    return {
      nodes,
      edges,
      rootId: aggregateId,
      direction: 'both',
      depth: options?.maxDepth ?? 10,
      stats: this.calculateStats(nodes, edges),
    };
  }

  // ===========================================================================
  // IMPACT ANALYSIS
  // ===========================================================================

  /**
   * Analyze impact of a change to an aggregate
   */
  async analyzeImpact(
    aggregateId: string,
    aggregateType: string,
    options?: GraphBuildOptions
  ): Promise<ImpactAnalysis> {
    const maxDepth = options?.maxDepth ?? 10;
    const graph = await this.buildDownstreamGraph(aggregateId, aggregateType, options);

    // Calculate directly affected (depth 1)
    const directlyAffected = graph.edges
      .filter((e) => e.sourceId === aggregateId)
      .map((e) => {
        const targetNode = graph.nodes.find((n) => n.id === e.targetId);
        return {
          aggregateId: e.targetId,
          aggregateType: targetNode?.type ?? 'Unknown',
          transformationType: e.transformationType,
          eventType: e.eventType,
        };
      });

    // Calculate transitively affected (depth > 1)
    const transitivelyAffected: ImpactAnalysis['transitivelyAffected'] = [];
    const paths = this.findAllPaths(graph, aggregateId);

    for (const [nodeId, pathInfo] of paths) {
      if (pathInfo.length > 1 && nodeId !== aggregateId) {
        const node = graph.nodes.find((n) => n.id === nodeId);
        transitivelyAffected.push({
          aggregateId: nodeId,
          aggregateType: node?.type ?? 'Unknown',
          pathLength: pathInfo.length,
          path: pathInfo,
        });
      }
    }

    return {
      source: {
        aggregateId,
        aggregateType,
      },
      directlyAffected,
      transitivelyAffected,
      totalImpactedCount: directlyAffected.length + transitivelyAffected.length,
      analysisDepth: maxDepth,
      analyzedAt: new Date(),
    };
  }

  // ===========================================================================
  // VISUALIZATION
  // ===========================================================================

  /**
   * Generate visualization data for a lineage graph
   */
  generateVisualization(graph: LineageGraph): DataFlowVisualization {
    return {
      mermaid: this.generateMermaid(graph),
      d3Graph: this.generateD3Graph(graph),
      summary: this.generateSummary(graph),
    };
  }

  private generateMermaid(graph: LineageGraph): string {
    const lines: string[] = ['graph LR'];

    // Add nodes with styling
    for (const node of graph.nodes) {
      const label = node.label.replace(/[:[\]()]/g, '_');
      const style = this.getMermaidNodeStyle(node);
      lines.push(`    ${node.id.substring(0, 8)}["${label}"]${style}`);
    }

    // Add edges
    for (const edge of graph.edges) {
      const sourceId = edge.sourceId.substring(0, 8);
      const targetId = edge.targetId.substring(0, 8);
      const label = this.getTransformationLabel(edge.transformationType);
      lines.push(`    ${sourceId} -->|${label}| ${targetId}`);
    }

    return lines.join('\n');
  }

  private generateD3Graph(graph: LineageGraph): DataFlowVisualization['d3Graph'] {
    const typeGroups = new Map<string, number>();
    let groupCounter = 0;

    const nodes = graph.nodes.map((node) => {
      if (!typeGroups.has(node.type)) {
        typeGroups.set(node.type, groupCounter++);
      }
      return {
        id: node.id,
        label: node.label,
        type: node.type,
        group: typeGroups.get(node.type) ?? 0,
      };
    });

    const links = graph.edges.map((edge) => ({
      source: edge.sourceId,
      target: edge.targetId,
      label: this.getTransformationLabel(edge.transformationType),
      value: 1,
    }));

    return { nodes, links };
  }

  private generateSummary(graph: LineageGraph): string {
    const lines: string[] = [];
    const { stats } = graph;

    lines.push(`Data Lineage Graph Summary`);
    lines.push(`==========================`);
    lines.push(`Direction: ${graph.direction}`);
    lines.push(`Root: ${graph.rootId ?? 'N/A'}`);
    lines.push(`Nodes: ${stats.nodeCount}`);
    lines.push(`Edges: ${stats.edgeCount}`);
    lines.push(`Max Depth: ${stats.maxDepth}`);
    lines.push(`Unique Transformations: ${stats.uniqueTransformations}`);
    lines.push(`Unique Aggregate Types: ${stats.uniqueAggregateTypes}`);

    // Group by aggregate type
    const byType = new Map<string, number>();
    for (const node of graph.nodes) {
      byType.set(node.type, (byType.get(node.type) ?? 0) + 1);
    }

    lines.push('\nAggregate Types:');
    for (const [type, count] of byType) {
      lines.push(`  - ${type}: ${count}`);
    }

    // Group by transformation
    const byTransform = new Map<string, number>();
    for (const edge of graph.edges) {
      byTransform.set(edge.transformationType, (byTransform.get(edge.transformationType) ?? 0) + 1);
    }

    lines.push('\nTransformations:');
    for (const [transform, count] of byTransform) {
      lines.push(`  - ${transform}: ${count}`);
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private async traverseUpstream(
    aggregateId: string,
    aggregateType: string,
    currentDepth: number,
    maxDepth: number,
    nodesMap: Map<string, LineageNode>,
    edges: LineageEdge[],
    visited: Set<string>,
    options?: GraphBuildOptions
  ): Promise<void> {
    const nodeKey = this.nodeKey(aggregateId, aggregateType);
    if (visited.has(nodeKey) || currentDepth >= maxDepth) {
      return;
    }
    visited.add(nodeKey);

    // Get lineage entries for this aggregate
    let entries = await this.store.getByAggregateId(aggregateId, aggregateType);

    // Apply filters
    entries = this.filterEntries(entries, options);

    // Process sources
    for (const entry of entries) {
      for (const source of entry.sources) {
        const sourceKey = this.nodeKey(source.aggregateId, source.aggregateType);

        // Add source node if not exists
        if (!nodesMap.has(sourceKey)) {
          nodesMap.set(sourceKey, {
            id: source.aggregateId,
            type: source.aggregateType,
            label: `${source.aggregateType}:${source.aggregateId.substring(0, 8)}`,
            complianceTags: entry.compliance?.frameworks,
            sensitivity: entry.compliance?.sensitivity,
          });
        }

        // Add edge
        edges.push({
          sourceId: source.aggregateId,
          targetId: aggregateId,
          transformationType: entry.transformationType,
          eventId: entry.triggerEventId,
          eventType: entry.triggerEventType,
          timestamp: new Date(entry.createdAt),
        });

        // Recurse
        await this.traverseUpstream(
          source.aggregateId,
          source.aggregateType,
          currentDepth + 1,
          maxDepth,
          nodesMap,
          edges,
          visited,
          options
        );
      }
    }
  }

  private async traverseDownstream(
    aggregateId: string,
    aggregateType: string,
    currentDepth: number,
    maxDepth: number,
    nodesMap: Map<string, LineageNode>,
    edges: LineageEdge[],
    visited: Set<string>,
    options?: GraphBuildOptions
  ): Promise<void> {
    const nodeKey = this.nodeKey(aggregateId, aggregateType);
    if (visited.has(nodeKey) || currentDepth >= maxDepth) {
      return;
    }
    visited.add(nodeKey);

    // Get entries where this aggregate is a source
    const result = await this.store.query({
      sourceAggregateId: aggregateId,
      limit: 1000,
    });

    // Apply filters
    const entries = this.filterEntries(result.entries, options);

    // Process targets
    for (const entry of entries) {
      const targetKey = this.nodeKey(entry.targetAggregateId, entry.targetAggregateType);

      // Add target node if not exists
      if (!nodesMap.has(targetKey)) {
        nodesMap.set(targetKey, {
          id: entry.targetAggregateId,
          type: entry.targetAggregateType,
          label: `${entry.targetAggregateType}:${entry.targetAggregateId.substring(0, 8)}`,
          complianceTags: entry.compliance?.frameworks,
          sensitivity: entry.compliance?.sensitivity,
        });
      }

      // Add edge
      edges.push({
        sourceId: aggregateId,
        targetId: entry.targetAggregateId,
        transformationType: entry.transformationType,
        eventId: entry.triggerEventId,
        eventType: entry.triggerEventType,
        timestamp: new Date(entry.createdAt),
      });

      // Recurse
      await this.traverseDownstream(
        entry.targetAggregateId,
        entry.targetAggregateType,
        currentDepth + 1,
        maxDepth,
        nodesMap,
        edges,
        visited,
        options
      );
    }
  }

  private filterEntries(entries: LineageEntry[], options?: GraphBuildOptions): LineageEntry[] {
    if (!options) return entries;

    return entries.filter((entry) => {
      // Filter by transformation types
      if (
        options.transformationTypes &&
        options.transformationTypes.length > 0 &&
        !options.transformationTypes.includes(entry.transformationType)
      ) {
        return false;
      }

      // Filter by compliance frameworks
      if (options.complianceFrameworks && options.complianceFrameworks.length > 0) {
        const hasFramework = entry.compliance?.frameworks?.some((f) =>
          options.complianceFrameworks!.includes(f)
        );
        if (!hasFramework) return false;
      }

      // Filter by time range
      if (options.timeRange) {
        const entryTime = new Date(entry.createdAt);
        if (entryTime < options.timeRange.start || entryTime > options.timeRange.end) {
          return false;
        }
      }

      return true;
    });
  }

  private findAllPaths(graph: LineageGraph, sourceId: string): Map<string, string[]> {
    const paths = new Map<string, string[]>();
    const visited = new Set<string>();

    const dfs = (nodeId: string, currentPath: string[]): void => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      paths.set(nodeId, [...currentPath]);

      const outgoingEdges = graph.edges.filter((e) => e.sourceId === nodeId);
      for (const edge of outgoingEdges) {
        dfs(edge.targetId, [...currentPath, edge.targetId]);
      }

      visited.delete(nodeId);
    };

    dfs(sourceId, [sourceId]);
    return paths;
  }

  private nodeKey(id: string, type: string): string {
    return `${type}:${id}`;
  }

  private calculateStats(nodes: LineageNode[], edges: LineageEdge[]): LineageGraph['stats'] {
    const transformations = new Set(edges.map((e) => e.transformationType));
    const aggregateTypes = new Set(nodes.map((n) => n.type));

    // Calculate max depth via BFS
    let maxDepth = 0;
    if (nodes.length > 0) {
      const visited = new Set<string>();
      const queue: { id: string; depth: number }[] = [{ id: nodes[0]?.id ?? '', depth: 0 }];

      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const { id, depth } = item;

        if (visited.has(id)) continue;
        visited.add(id);
        maxDepth = Math.max(maxDepth, depth);

        const outgoing = edges.filter((e) => e.sourceId === id);
        for (const edge of outgoing) {
          if (!visited.has(edge.targetId)) {
            queue.push({ id: edge.targetId, depth: depth + 1 });
          }
        }
      }
    }

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      maxDepth,
      uniqueTransformations: transformations.size,
      uniqueAggregateTypes: aggregateTypes.size,
    };
  }

  private getMermaidNodeStyle(node: LineageNode): string {
    if (node.sensitivity === 'phi') {
      return ':::phi';
    }
    if (node.sensitivity === 'pii') {
      return ':::pii';
    }
    return '';
  }

  private getTransformationLabel(type: TransformationType): string {
    const labels: Record<TransformationType, string> = {
      ingestion: 'ingest',
      enrichment: 'enrich',
      scoring: 'score',
      aggregation: 'aggregate',
      transformation: 'transform',
      derivation: 'derive',
      validation: 'validate',
      pattern_detection: 'detect',
      insight_generation: 'insight',
      routing_decision: 'route',
      consent_processing: 'consent',
      sync: 'sync',
      manual_update: 'update',
      system_update: 'sys_update',
      merge: 'merge',
      anonymization: 'anonymize',
    };
    return labels[type];
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a lineage graph builder
 */
export function createLineageGraphBuilder(store: LineageStore): LineageGraphBuilder {
  return new LineageGraphBuilder(store);
}
