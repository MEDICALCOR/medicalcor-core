/**
 * @fileoverview OSAX Events Index
 *
 * Exports all OSAX-related domain events.
 *
 * @module core/events/osax
 */

// Multimodal Events (v3.2)
export {
  // Metadata types
  type OsaxMultimodalEventMetadata,
  type OsaxMultimodalDomainEvent,

  // Imaging events
  type OsaxImagingScreenedPayload,
  type OsaxImagingScreenedEvent,

  // Financial events
  type OsaxFinancialPredictedPayload,
  type OsaxFinancialPredictedEvent,

  // Resource events
  type ResourceBlockSummary,
  type OsaxResourcesSoftHeldPayload,
  type OsaxResourcesSoftHeldEvent,
  type OsaxResourcesConfirmedPayload,
  type OsaxResourcesConfirmedEvent,
  type OsaxResourcesReleasedPayload,
  type OsaxResourcesReleasedEvent,
  type OsaxResourcesExpiredPayload,
  type OsaxResourcesExpiredEvent,

  // Union types
  type OsaxMultimodalEventUnion,
  type OsaxMultimodalEventType,

  // Factory functions
  createMultimodalEventMetadata,
  createOsaxImagingScreenedEvent,
  createOsaxFinancialPredictedEvent,
  createOsaxResourcesSoftHeldEvent,
  createOsaxResourcesConfirmedEvent,
  createOsaxResourcesReleasedEvent,

  // Type guards
  isOsaxImagingScreenedEvent,
  isOsaxFinancialPredictedEvent,
  isOsaxResourcesSoftHeldEvent,
  isOsaxResourceEvent,
} from './osax-multimodal-events.js';
