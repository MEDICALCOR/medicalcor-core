/**
 * @module architecture/ai-data/data-lineage
 *
 * Data Lineage Tracking
 * =====================
 *
 * Track data provenance and transformations.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// LINEAGE TYPES
// ============================================================================

export interface DataAsset {
  readonly id: string;
  readonly type: DataAssetType;
  readonly name: string;
  readonly description?: string;
  readonly location: DataLocation;
  readonly metadata: AssetMetadata;
}

export type DataAssetType = 'database_table' | 'file' | 'api_endpoint' | 'stream' | 'model';

export interface DataLocation {
  readonly system: string;
  readonly path: string;
}

export interface AssetMetadata {
  readonly owner?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DataProcess {
  readonly id: string;
  readonly name: string;
  readonly type: ProcessType;
  readonly inputs: string[];
  readonly outputs: string[];
}

export type ProcessType = 'etl_job' | 'sql_query' | 'ml_pipeline' | 'api_call';

export interface LineageGraph {
  readonly assets: DataAsset[];
  readonly processes: DataProcess[];
}

// ============================================================================
// LINEAGE ERROR
// ============================================================================

export class LineageError extends Error {
  constructor(
    message: string,
    readonly code: LineageErrorCode
  ) {
    super(message);
    this.name = 'LineageError';
  }
}

export type LineageErrorCode = 'ASSET_NOT_FOUND' | 'PROCESS_NOT_FOUND' | 'INTERNAL_ERROR';

// ============================================================================
// LINEAGE SERVICE
// ============================================================================

export interface DataLineageService {
  registerAsset(asset: DataAsset): Promise<Result<void, LineageError>>;
  getAsset(id: string): Promise<Result<DataAsset, LineageError>>;
  registerProcess(process: DataProcess): Promise<Result<void, LineageError>>;
  getUpstream(assetId: string, depth?: number): Promise<Result<LineageGraph, LineageError>>;
  getDownstream(assetId: string, depth?: number): Promise<Result<LineageGraph, LineageError>>;
}

// ============================================================================
// IN-MEMORY LINEAGE SERVICE
// ============================================================================

export class InMemoryDataLineageService implements DataLineageService {
  private assets = new Map<string, DataAsset>();
  private processes = new Map<string, DataProcess>();

  registerAsset(asset: DataAsset): Promise<Result<void, LineageError>> {
    this.assets.set(asset.id, asset);
    return Promise.resolve(Ok(undefined));
  }

  getAsset(id: string): Promise<Result<DataAsset, LineageError>> {
    const asset = this.assets.get(id);
    if (!asset) {
      return Promise.resolve(Err(new LineageError('Asset not found', 'ASSET_NOT_FOUND')));
    }
    return Promise.resolve(Ok(asset));
  }

  registerProcess(process: DataProcess): Promise<Result<void, LineageError>> {
    this.processes.set(process.id, process);
    return Promise.resolve(Ok(undefined));
  }

  getUpstream(assetId: string, depth = 10): Promise<Result<LineageGraph, LineageError>> {
    if (!this.assets.has(assetId)) {
      return Promise.resolve(Err(new LineageError('Asset not found', 'ASSET_NOT_FOUND')));
    }
    return Promise.resolve(Ok(this.traverseLineage(assetId, 'upstream', depth)));
  }

  getDownstream(assetId: string, depth = 10): Promise<Result<LineageGraph, LineageError>> {
    if (!this.assets.has(assetId)) {
      return Promise.resolve(Err(new LineageError('Asset not found', 'ASSET_NOT_FOUND')));
    }
    return Promise.resolve(Ok(this.traverseLineage(assetId, 'downstream', depth)));
  }

  private traverseLineage(
    startId: string,
    direction: 'upstream' | 'downstream',
    maxDepth: number
  ): LineageGraph {
    const assets = new Map<string, DataAsset>();
    const processes = new Map<string, DataProcess>();
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { id, depth } = item;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const asset = this.assets.get(id);
      if (asset) assets.set(id, asset);

      for (const process of this.processes.values()) {
        const isConnected =
          direction === 'upstream' ? process.outputs.includes(id) : process.inputs.includes(id);

        if (isConnected) {
          processes.set(process.id, process);
          const nextIds = direction === 'upstream' ? process.inputs : process.outputs;
          for (const nextId of nextIds) {
            if (!visited.has(nextId)) {
              queue.push({ id: nextId, depth: depth + 1 });
            }
          }
        }
      }
    }

    return { assets: Array.from(assets.values()), processes: Array.from(processes.values()) };
  }
}
