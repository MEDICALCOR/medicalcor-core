'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LineageGraphView } from '../actions';

// =============================================================================
// TYPES
// =============================================================================

interface Position {
  x: number;
  y: number;
}

interface NodeLayout {
  id: string;
  type: string;
  label: string;
  position: Position;
  sensitivity?: string;
  complianceTags?: string[];
  isRoot: boolean;
}

interface EdgeLayout {
  sourceId: string;
  targetId: string;
  sourcePosX: number;
  sourcePosY: number;
  targetPosX: number;
  targetPosY: number;
  transformationType: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const LEVEL_SPACING_X = 220;
const NODE_SPACING_Y = 90;

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Lead: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700' },
  Patient: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700' },
  Appointment: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700' },
  Consent: { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-700' },
  Message: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700' },
  Case: { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-700' },
  TreatmentPlan: { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-700' },
  Payment: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700' },
  User: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700' },
  Clinic: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700' },
};

const SENSITIVITY_COLORS: Record<string, string> = {
  phi: 'bg-red-500',
  pii: 'bg-orange-500',
  confidential: 'bg-yellow-500',
  restricted: 'bg-purple-500',
  internal: 'bg-blue-500',
  public: 'bg-green-500',
};

const TRANSFORM_COLORS: Record<string, string> = {
  scoring: '#3b82f6',
  enrichment: '#8b5cf6',
  ingestion: '#22c55e',
  consent_processing: '#14b8a6',
  sync: '#f97316',
  validation: '#eab308',
  transformation: '#ec4899',
  derivation: '#6366f1',
};

// =============================================================================
// LAYOUT ALGORITHM
// =============================================================================

function layoutGraph(graph: LineageGraphView): { nodes: NodeLayout[]; edges: EdgeLayout[] } {
  const nodes: NodeLayout[] = [];
  const edges: EdgeLayout[] = [];

  // Find root node (the one with most connections or marked as root)
  if (graph.nodes.length === 0) return { nodes, edges };
  const rootNode = graph.nodes.find((n) => n.label.includes('Root')) ?? graph.nodes[0];

  // Build adjacency lists
  const upstreamOf = new Map<string, string[]>();
  const downstreamOf = new Map<string, string[]>();

  for (const edge of graph.edges) {
    const ups = upstreamOf.get(edge.targetId) ?? [];
    ups.push(edge.sourceId);
    upstreamOf.set(edge.targetId, ups);

    const downs = downstreamOf.get(edge.sourceId) ?? [];
    downs.push(edge.targetId);
    downstreamOf.set(edge.sourceId, downs);
  }

  // Assign levels using BFS from root
  const nodeLevels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: { id: string; level: number }[] = [{ id: rootNode.id, level: 0 }];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const { id, level } = item;
    if (visited.has(id)) continue;
    visited.add(id);
    nodeLevels.set(id, level);

    // Upstream nodes go to negative levels
    const upstreams = upstreamOf.get(id) ?? [];
    for (const upId of upstreams) {
      if (!visited.has(upId)) {
        queue.push({ id: upId, level: level - 1 });
      }
    }

    // Downstream nodes go to positive levels
    const downstreams = downstreamOf.get(id) ?? [];
    for (const downId of downstreams) {
      if (!visited.has(downId)) {
        queue.push({ id: downId, level: level + 1 });
      }
    }
  }

  // Group nodes by level
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of nodeLevels.entries()) {
    const group = levelGroups.get(level) ?? [];
    group.push(id);
    levelGroups.set(level, group);
  }

  // Find min/max levels
  const levels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
  const minLevel = levels[0] ?? 0;

  // Position nodes
  const nodePositions = new Map<string, Position>();
  for (const [level, nodeIds] of levelGroups.entries()) {
    const x = (level - minLevel) * LEVEL_SPACING_X + 50;
    const startY = 50;

    nodeIds.forEach((id, index) => {
      nodePositions.set(id, {
        x,
        y: startY + index * NODE_SPACING_Y,
      });
    });
  }

  // Create node layouts
  for (const node of graph.nodes) {
    const position = nodePositions.get(node.id) ?? { x: 0, y: 0 };
    nodes.push({
      id: node.id,
      type: node.type,
      label: node.label,
      position,
      sensitivity: node.sensitivity,
      complianceTags: node.complianceTags,
      isRoot: node.id === rootNode.id,
    });
  }

  // Create edge layouts
  for (const edge of graph.edges) {
    const sourcePos = nodePositions.get(edge.sourceId);
    const targetPos = nodePositions.get(edge.targetId);
    if (!sourcePos || !targetPos) continue;

    edges.push({
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      sourcePosX: sourcePos.x + NODE_WIDTH,
      sourcePosY: sourcePos.y + NODE_HEIGHT / 2,
      targetPosX: targetPos.x,
      targetPosY: targetPos.y + NODE_HEIGHT / 2,
      transformationType: edge.transformationType,
    });
  }

  return { nodes, edges };
}

// =============================================================================
// COMPONENTS
// =============================================================================

interface GraphNodeProps {
  node: NodeLayout;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function GraphNode({ node, isSelected, onSelect }: GraphNodeProps) {
  const colors = TYPE_COLORS[node.type] ?? TYPE_COLORS.Lead;
  const sensitivityColor = node.sensitivity ? SENSITIVITY_COLORS[node.sensitivity] : null;

  return (
    <g
      transform={`translate(${node.position.x}, ${node.position.y})`}
      className="cursor-pointer"
      onClick={() => onSelect(node.id)}
    >
      {/* Node background */}
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        className={cn(
          'transition-all',
          colors.bg,
          isSelected ? 'stroke-2 stroke-primary' : 'stroke-1',
          colors.border.replace('border-', 'stroke-')
        )}
        fill="currentColor"
      />

      {/* Root indicator */}
      {node.isRoot && <circle cx={NODE_WIDTH - 10} cy={10} r={6} className="fill-primary" />}

      {/* Sensitivity indicator */}
      {sensitivityColor && (
        <rect x={4} y={4} width={8} height={8} rx={2} className={sensitivityColor} />
      )}

      {/* Type label */}
      <text
        x={NODE_WIDTH / 2}
        y={20}
        textAnchor="middle"
        className={cn('text-xs font-semibold', colors.text)}
        fill="currentColor"
      >
        {node.type}
      </text>

      {/* Node label */}
      <text
        x={NODE_WIDTH / 2}
        y={38}
        textAnchor="middle"
        className="text-[10px] text-muted-foreground"
        fill="currentColor"
      >
        {node.label.length > 20 ? `${node.label.slice(0, 17)}...` : node.label}
      </text>

      {/* Compliance tags */}
      {node.complianceTags && node.complianceTags.length > 0 && (
        <text
          x={NODE_WIDTH / 2}
          y={52}
          textAnchor="middle"
          className="text-[9px] text-muted-foreground"
          fill="currentColor"
        >
          {node.complianceTags.join(' | ')}
        </text>
      )}
    </g>
  );
}

interface GraphEdgeProps {
  edge: EdgeLayout;
}

function GraphEdge({ edge }: GraphEdgeProps) {
  const color = TRANSFORM_COLORS[edge.transformationType] ?? '#888';

  // Calculate control points for bezier curve
  const midX = (edge.sourcePosX + edge.targetPosX) / 2;

  const pathD = `
    M ${edge.sourcePosX} ${edge.sourcePosY}
    C ${midX} ${edge.sourcePosY},
      ${midX} ${edge.targetPosY},
      ${edge.targetPosX} ${edge.targetPosY}
  `;

  return (
    <g>
      {/* Edge path */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        markerEnd="url(#arrowhead)"
        className="opacity-70"
      />

      {/* Edge label */}
      <text
        x={midX}
        y={(edge.sourcePosY + edge.targetPosY) / 2 - 8}
        textAnchor="middle"
        className="text-[9px] fill-muted-foreground"
      >
        {edge.transformationType.replace(/_/g, ' ')}
      </text>
    </g>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface LineageGraphProps {
  graph: LineageGraphView;
}

export function LineageGraph({ graph }: LineageGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => layoutGraph(graph), [graph]);

  // Calculate bounds
  const bounds = useMemo(() => {
    if (nodes.length === 0) return { width: 800, height: 600 };
    const maxX = Math.max(...nodes.map((n) => n.position.x)) + NODE_WIDTH + 50;
    const maxY = Math.max(...nodes.map((n) => n.position.y)) + NODE_HEIGHT + 50;
    return { width: Math.max(800, maxX), height: Math.max(600, maxY) };
  }, [nodes]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / 1.25, 0.25));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        setPan({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(Math.max(z * delta, 0.25), 3));
  }, []);

  // Get selected node details
  const selectedNodeData = useMemo(() => {
    return nodes.find((n) => n.id === selectedNode);
  }, [nodes, selectedNode]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground w-16 text-center">
            {(zoom * 100).toFixed(0)}%
          </span>
          <Button variant="outline" size="icon" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleReset}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{graph.stats.nodeCount} nodes</span>
          <span>{graph.stats.edgeCount} edges</span>
          <span>Max depth: {graph.stats.maxDepth}</span>
        </div>
      </div>

      {/* Graph viewport */}
      <div
        ref={containerRef}
        role="application"
        aria-label="Data lineage graph visualization"
        tabIndex={0}
        className={cn(
          'flex-1 overflow-hidden bg-muted/20',
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${bounds.width / zoom} ${bounds.height / zoom}`}
          className="select-none"
        >
          <defs>
            {/* Arrow marker */}
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" className="fill-muted-foreground/50" />
            </marker>
          </defs>

          {/* Grid pattern */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              className="stroke-muted-foreground/10"
              strokeWidth="1"
            />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Edges (render first so nodes appear on top) */}
          {edges.map((edge, i) => (
            <GraphEdge key={`${edge.sourceId}-${edge.targetId}-${i}`} edge={edge} />
          ))}

          {/* Nodes */}
          {nodes.map((node) => (
            <GraphNode
              key={node.id}
              node={node}
              isSelected={node.id === selectedNode}
              onSelect={setSelectedNode}
            />
          ))}
        </svg>
      </div>

      {/* Selected node info */}
      {selectedNodeData && (
        <div className="p-3 border-t bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{selectedNodeData.type}</div>
              <div className="text-sm text-muted-foreground">{selectedNodeData.id}</div>
            </div>
            <div className="flex items-center gap-2">
              {selectedNodeData.sensitivity && (
                <Badge variant="outline" className="capitalize">
                  {selectedNodeData.sensitivity}
                </Badge>
              )}
              {selectedNodeData.complianceTags?.map((tag) => (
                <Badge key={tag} variant={tag === 'HIPAA' ? 'success' : 'secondary'}>
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="p-2 border-t text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium">Sensitivity:</span>
          {Object.entries(SENSITIVITY_COLORS).map(([level, color]) => (
            <div key={level} className="flex items-center gap-1">
              <div className={cn('w-2 h-2 rounded-sm', color)} />
              <span className="uppercase">{level}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
