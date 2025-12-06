/**
 * @fileoverview OSAX v3.2 Multimodal Domain Events
 *
 * Domain events for the OSAX v3.2 Multimodal features:
 * - Imaging analysis events
 * - Financial prediction events
 * - Resource orchestration events
 *
 * @module core/events/osax/osax-multimodal-events
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Events are facts that happened
 * 2. STRICT TYPING - No any/unknown in event payloads
 * 3. SECURITY - No PHI in event payloads
 * 4. AUDIT TRAIL - Events are append-only for compliance
 */

import type {
  ImagingModality,
  RiskClass,
  ProbabilityTier,
  ResourceType,
} from '@medicalcor/domain/osax';

// ============================================================================
// EVENT METADATA (Shared with existing events)
// ============================================================================

/**
 * Event metadata - common to all domain events
 */
export interface OsaxMultimodalEventMetadata {
  /** Unique event identifier (UUID v4) */
  readonly eventId: string;

  /** Event timestamp (ISO 8601) */
  readonly timestamp: string;

  /** Correlation ID for distributed tracing */
  readonly correlationId: string;

  /** Causation ID - which event/command caused this */
  readonly causationId?: string;

  /** Idempotency key for safe retries */
  readonly idempotencyKey: string;

  /** Schema version for event evolution */
  readonly version: number;

  /** Source service that emitted the event */
  readonly source: string;

  /** Actor who triggered the event */
  readonly actor?: string;

  /** Tenant ID for multi-tenancy */
  readonly tenantId?: string;
}

/**
 * Base domain event interface
 */
export interface OsaxMultimodalDomainEvent<TType extends string, TPayload> {
  /** Event type discriminator */
  readonly type: TType;

  /** Aggregate ID this event belongs to */
  readonly aggregateId: string;

  /** Aggregate type */
  readonly aggregateType: 'OsaxCase';

  /** Event metadata */
  readonly metadata: OsaxMultimodalEventMetadata;

  /** Event payload (strongly typed) */
  readonly payload: TPayload;
}

// ============================================================================
// IMAGING EVENTS
// ============================================================================

/**
 * osax.imaging.screened - Emitted when imaging analysis is completed
 *
 * SECURITY: Event payload contains only aggregate metrics, not detailed findings or PHI
 */
export interface OsaxImagingScreenedPayload {
  /** Associated case ID */
  readonly caseId: string;

  /** Imaging modality analyzed */
  readonly modality: ImagingModality;

  /** Number of findings detected */
  readonly findingsCount: number;

  /** Overall analysis confidence (0-1) */
  readonly overallConfidence: number;

  /** Whether any high-risk (RED) findings were detected */
  readonly hasHighRiskFindings: boolean;

  /** Highest risk class in findings */
  readonly highestRiskClass: RiskClass;

  /** Whether specialist review is required */
  readonly requiresReview: boolean;

  /** Analysis timestamp (ISO 8601) */
  readonly analyzedAt: string;

  /** Algorithm version used */
  readonly algorithmVersion: string;

  // SECURITY: No raw findings or PHI in event
}

export type OsaxImagingScreenedEvent = OsaxMultimodalDomainEvent<
  'osax.imaging.screened',
  OsaxImagingScreenedPayload
>;

// ============================================================================
// FINANCIAL EVENTS
// ============================================================================

/**
 * osax.case.financial_predicted - Emitted when financial prediction is completed
 */
export interface OsaxFinancialPredictedPayload {
  /** Associated case ID */
  readonly caseId: string;

  /** Predicted probability of acceptance (0-1) */
  readonly probability: number;

  /** Prediction confidence (0-1) */
  readonly confidence: number;

  /** Probability tier classification */
  readonly probabilityTier: ProbabilityTier;

  /** Minimum estimated case value */
  readonly estimatedValueMin: number;

  /** Maximum estimated case value */
  readonly estimatedValueMax: number;

  /** Currency code (ISO 4217) */
  readonly currency: string;

  /** Recommended action based on prediction */
  readonly recommendedAction: string;

  /** Prediction timestamp (ISO 8601) */
  readonly predictedAt: string;

  /** Model version used */
  readonly modelVersion: string;

  // SECURITY: No detailed factors in event for audit trail
}

export type OsaxFinancialPredictedEvent = OsaxMultimodalDomainEvent<
  'osax.case.financial_predicted',
  OsaxFinancialPredictedPayload
>;

// ============================================================================
// RESOURCE EVENTS
// ============================================================================

/**
 * Resource block summary for events
 */
export interface ResourceBlockSummary {
  /** Block ID */
  readonly blockId: string;

  /** Resource type */
  readonly resourceType: ResourceType;

  /** Duration in minutes */
  readonly durationMinutes: number;

  /** Expiration timestamp (for soft-holds) */
  readonly expiresAt?: string;

  /** Scheduled start (for confirmed blocks) */
  readonly scheduledStart?: string;
}

/**
 * osax.case.resources_soft_held - Emitted when resources are soft-held
 */
export interface OsaxResourcesSoftHeldPayload {
  /** Associated case ID */
  readonly caseId: string;

  /** Created resource blocks */
  readonly resourceBlocks: readonly ResourceBlockSummary[];

  /** Total duration across all resources (max, not sum) */
  readonly totalDurationMinutes: number;

  /** Creation timestamp (ISO 8601) */
  readonly createdAt: string;
}

export type OsaxResourcesSoftHeldEvent = OsaxMultimodalDomainEvent<
  'osax.case.resources_soft_held',
  OsaxResourcesSoftHeldPayload
>;

/**
 * osax.case.resources_confirmed - Emitted when resources are confirmed
 */
export interface OsaxResourcesConfirmedPayload {
  /** Associated case ID */
  readonly caseId: string;

  /** Confirmed resource blocks */
  readonly resourceBlocks: readonly ResourceBlockSummary[];

  /** Confirmation timestamp (ISO 8601) */
  readonly confirmedAt: string;
}

export type OsaxResourcesConfirmedEvent = OsaxMultimodalDomainEvent<
  'osax.case.resources_confirmed',
  OsaxResourcesConfirmedPayload
>;

/**
 * osax.case.resources_released - Emitted when resources are released
 */
export interface OsaxResourcesReleasedPayload {
  /** Associated case ID */
  readonly caseId: string;

  /** Released block IDs */
  readonly blockIds: readonly string[];

  /** Reason for release (optional) */
  readonly reason?: string;

  /** Release timestamp (ISO 8601) */
  readonly releasedAt: string;
}

export type OsaxResourcesReleasedEvent = OsaxMultimodalDomainEvent<
  'osax.case.resources_released',
  OsaxResourcesReleasedPayload
>;

/**
 * osax.case.resources_expired - Emitted when soft-held resources expire
 */
export interface OsaxResourcesExpiredPayload {
  /** Associated case ID */
  readonly caseId: string;

  /** Expired block IDs */
  readonly blockIds: readonly string[];

  /** Expiration timestamp (ISO 8601) */
  readonly expiredAt: string;
}

export type OsaxResourcesExpiredEvent = OsaxMultimodalDomainEvent<
  'osax.case.resources_expired',
  OsaxResourcesExpiredPayload
>;

// ============================================================================
// UNION TYPE FOR ALL MULTIMODAL EVENTS
// ============================================================================

/**
 * Union of all OSAX v3.2 Multimodal domain events
 */
export type OsaxMultimodalEventUnion =
  // Imaging events
  | OsaxImagingScreenedEvent
  // Financial events
  | OsaxFinancialPredictedEvent
  // Resource events
  | OsaxResourcesSoftHeldEvent
  | OsaxResourcesConfirmedEvent
  | OsaxResourcesReleasedEvent
  | OsaxResourcesExpiredEvent;

/**
 * Event type discriminator for multimodal events
 */
export type OsaxMultimodalEventType = OsaxMultimodalEventUnion['type'];

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  const cryptoObj = globalThis.crypto;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create event metadata
 */
export function createMultimodalEventMetadata(
  correlationId: string,
  source: string,
  causationId?: string,
  actor?: string,
  tenantId?: string
): OsaxMultimodalEventMetadata {
  const metadata: OsaxMultimodalEventMetadata = {
    eventId: generateUUID(),
    timestamp: new Date().toISOString(),
    correlationId,
    idempotencyKey: `${source}-${correlationId}-${Date.now()}`,
    version: 1,
    source,
  };

  const optionalProps: {
    causationId?: string;
    actor?: string;
    tenantId?: string;
  } = {};
  if (causationId !== undefined) optionalProps.causationId = causationId;
  if (actor !== undefined) optionalProps.actor = actor;
  if (tenantId !== undefined) optionalProps.tenantId = tenantId;

  return { ...metadata, ...optionalProps };
}

/**
 * Create OsaxImagingScreened event
 */
export function createOsaxImagingScreenedEvent(
  aggregateId: string,
  payload: OsaxImagingScreenedPayload,
  metadata: OsaxMultimodalEventMetadata
): OsaxImagingScreenedEvent {
  return {
    type: 'osax.imaging.screened',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

/**
 * Create OsaxFinancialPredicted event
 */
export function createOsaxFinancialPredictedEvent(
  aggregateId: string,
  payload: OsaxFinancialPredictedPayload,
  metadata: OsaxMultimodalEventMetadata
): OsaxFinancialPredictedEvent {
  return {
    type: 'osax.case.financial_predicted',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

/**
 * Create OsaxResourcesSoftHeld event
 */
export function createOsaxResourcesSoftHeldEvent(
  aggregateId: string,
  payload: OsaxResourcesSoftHeldPayload,
  metadata: OsaxMultimodalEventMetadata
): OsaxResourcesSoftHeldEvent {
  return {
    type: 'osax.case.resources_soft_held',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

/**
 * Create OsaxResourcesConfirmed event
 */
export function createOsaxResourcesConfirmedEvent(
  aggregateId: string,
  payload: OsaxResourcesConfirmedPayload,
  metadata: OsaxMultimodalEventMetadata
): OsaxResourcesConfirmedEvent {
  return {
    type: 'osax.case.resources_confirmed',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

/**
 * Create OsaxResourcesReleased event
 */
export function createOsaxResourcesReleasedEvent(
  aggregateId: string,
  payload: OsaxResourcesReleasedPayload,
  metadata: OsaxMultimodalEventMetadata
): OsaxResourcesReleasedEvent {
  return {
    type: 'osax.case.resources_released',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for OsaxImagingScreened event
 */
export function isOsaxImagingScreenedEvent(
  event: OsaxMultimodalEventUnion
): event is OsaxImagingScreenedEvent {
  return event.type === 'osax.imaging.screened';
}

/**
 * Type guard for OsaxFinancialPredicted event
 */
export function isOsaxFinancialPredictedEvent(
  event: OsaxMultimodalEventUnion
): event is OsaxFinancialPredictedEvent {
  return event.type === 'osax.case.financial_predicted';
}

/**
 * Type guard for OsaxResourcesSoftHeld event
 */
export function isOsaxResourcesSoftHeldEvent(
  event: OsaxMultimodalEventUnion
): event is OsaxResourcesSoftHeldEvent {
  return event.type === 'osax.case.resources_soft_held';
}

/**
 * Type guard for resource-related events
 */
export function isOsaxResourceEvent(
  event: OsaxMultimodalEventUnion
): event is
  | OsaxResourcesSoftHeldEvent
  | OsaxResourcesConfirmedEvent
  | OsaxResourcesReleasedEvent
  | OsaxResourcesExpiredEvent {
  return (
    event.type === 'osax.case.resources_soft_held' ||
    event.type === 'osax.case.resources_confirmed' ||
    event.type === 'osax.case.resources_released' ||
    event.type === 'osax.case.resources_expired'
  );
}
