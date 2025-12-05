/**
 * @fileoverview OSAX Entities Index
 *
 * Re-exports all entities for the OSAX domain.
 *
 * @module domain/osax/entities
 */

export * from './OsaxCase.js';

// ResourceBlock exports (v3.2 Multimodal)
export {
  ResourceBlock,
  InvalidResourceBlockError,
  InvalidResourceBlockTransitionError,
  isResourceBlock,
  type ResourceType,
  type ResourceBlockStatus,
  type CreateResourceBlockInput,
  type ResourceBlockDTO,
  type InvalidResourceBlockErrorDetails,
} from './ResourceBlock.js';
