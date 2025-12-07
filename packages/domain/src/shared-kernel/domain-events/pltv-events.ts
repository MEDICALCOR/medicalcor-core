/**
 * @fileoverview pLTV Domain Events
 *
 * Banking/Medical Grade Domain Events for Predicted Lifetime Value.
 * Strictly typed events following Event Sourcing patterns.
 *
 * @module domain/shared-kernel/domain-events/pltv-events
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Events are facts that happened
 * 2. STRICT TYPING - No any/unknown in event payloads
 * 3. VERSIONING - Schema version for evolution
 * 4. IDEMPOTENCY - Events have unique IDs for deduplication
 */

import type { EventMetadata, DomainEvent } from './lead-events.js';
import type {
  PLTVTier,
  PLTVGrowthPotential,
  PLTVInvestmentPriority,
} from '../value-objects/predicted-ltv.js';

// ============================================================================
// PLTV LIFECYCLE EVENTS
// ============================================================================

/**
 * PLTVScored - Emitted when a patient's pLTV is calculated
 */
export interface PLTVScoredPayload {
  /** Lead/Patient ID */
  readonly leadId: string;

  /** Clinic ID */
  readonly clinicId: string;

  /** Predicted lifetime value in EUR */
  readonly predictedLTV: number;

  /** Previous pLTV if rescoring */
  readonly previousPLTV?: number;

  /** Tier classification */
  readonly tier: PLTVTier;

  /** Growth potential */
  readonly growthPotential: PLTVGrowthPotential;

  /** Investment priority */
  readonly investmentPriority: PLTVInvestmentPriority;

  /** Prediction confidence (0-1) */
  readonly confidence: number;

  /** Prediction method */
  readonly method: 'ml' | 'rule_based' | 'hybrid';

  /** Model version used */
  readonly modelVersion: string;

  /** Reasoning summary */
  readonly reasoning: string;
}

export type PLTVScoredEvent = DomainEvent<'pltv.scored', PLTVScoredPayload>;

/**
 * HighValuePatientIdentified - Emitted when a high-value patient is identified
 * Triggered for DIAMOND, PLATINUM, and GOLD tier patients
 */
export interface HighValuePatientIdentifiedPayload {
  /** Lead/Patient ID */
  readonly leadId: string;

  /** Clinic ID */
  readonly clinicId: string;

  /** Predicted lifetime value in EUR */
  readonly predictedLTV: number;

  /** Tier classification */
  readonly tier: PLTVTier;

  /** Growth potential */
  readonly growthPotential: PLTVGrowthPotential;

  /** Investment priority */
  readonly investmentPriority: PLTVInvestmentPriority;

  /** Prediction confidence */
  readonly confidence: number;

  /** Patient name for personalization */
  readonly patientName?: string;

  /** Patient phone for contact */
  readonly phone?: string;

  /** Recommended investment actions */
  readonly recommendedActions: readonly string[];

  /** SLA deadline for follow-up (ISO 8601) */
  readonly followUpDeadline: string;
}

export type HighValuePatientIdentifiedEvent = DomainEvent<
  'pltv.high_value_patient_identified',
  HighValuePatientIdentifiedPayload
>;

/**
 * PLTVTierChanged - Emitted when a patient's pLTV tier changes
 */
export interface PLTVTierChangedPayload {
  /** Lead/Patient ID */
  readonly leadId: string;

  /** Clinic ID */
  readonly clinicId: string;

  /** Previous predicted LTV */
  readonly previousPLTV: number;

  /** New predicted LTV */
  readonly newPLTV: number;

  /** Previous tier */
  readonly previousTier: PLTVTier;

  /** New tier */
  readonly newTier: PLTVTier;

  /** Percentage change */
  readonly changePercentage: number;

  /** Direction of change */
  readonly direction: 'upgrade' | 'downgrade';

  /** Reason for change */
  readonly changeReason: string;
}

export type PLTVTierChangedEvent = DomainEvent<'pltv.tier_changed', PLTVTierChangedPayload>;

/**
 * PLTVDeclineDetected - Emitted when significant decline in pLTV is detected
 */
export interface PLTVDeclineDetectedPayload {
  /** Lead/Patient ID */
  readonly leadId: string;

  /** Clinic ID */
  readonly clinicId: string;

  /** Previous predicted LTV */
  readonly previousPLTV: number;

  /** New predicted LTV */
  readonly newPLTV: number;

  /** Decline percentage */
  readonly declinePercentage: number;

  /** Risk factors identified */
  readonly riskFactors: readonly string[];

  /** Recommended interventions */
  readonly recommendedInterventions: readonly string[];

  /** Patient name */
  readonly patientName?: string;

  /** Patient phone */
  readonly phone?: string;
}

export type PLTVDeclineDetectedEvent = DomainEvent<
  'pltv.decline_detected',
  PLTVDeclineDetectedPayload
>;

/**
 * PLTVGrowthOpportunityIdentified - Emitted when growth opportunity is identified
 */
export interface PLTVGrowthOpportunityIdentifiedPayload {
  /** Lead/Patient ID */
  readonly leadId: string;

  /** Clinic ID */
  readonly clinicId: string;

  /** Current predicted LTV */
  readonly currentPLTV: number;

  /** Potential LTV with intervention */
  readonly potentialPLTV: number;

  /** Current tier */
  readonly currentTier: PLTVTier;

  /** Potential tier */
  readonly potentialTier: PLTVTier;

  /** Growth opportunity percentage */
  readonly growthOpportunityPercentage: number;

  /** Growth drivers identified */
  readonly growthDrivers: readonly string[];

  /** Recommended actions to capture growth */
  readonly recommendedActions: readonly string[];

  /** Patient name */
  readonly patientName?: string;

  /** Patient phone */
  readonly phone?: string;
}

export type PLTVGrowthOpportunityIdentifiedEvent = DomainEvent<
  'pltv.growth_opportunity_identified',
  PLTVGrowthOpportunityIdentifiedPayload
>;

// ============================================================================
// BATCH PROCESSING EVENTS
// ============================================================================

/**
 * BatchPLTVScoringStarted - Emitted when batch scoring begins
 */
export interface BatchPLTVScoringStartedPayload {
  /** Batch ID for tracking */
  readonly batchId: string;

  /** Clinic ID if clinic-specific batch */
  readonly clinicId?: string;

  /** Total patients to be scored */
  readonly totalPatients: number;

  /** Batch started at */
  readonly startedAt: string;
}

export type BatchPLTVScoringStartedEvent = DomainEvent<
  'pltv.batch_scoring_started',
  BatchPLTVScoringStartedPayload
>;

/**
 * BatchPLTVScoringCompleted - Emitted when batch scoring completes
 */
export interface BatchPLTVScoringCompletedPayload {
  /** Batch ID for tracking */
  readonly batchId: string;

  /** Clinic ID if clinic-specific batch */
  readonly clinicId?: string;

  /** Total patients processed */
  readonly totalPatients: number;

  /** Successfully scored count */
  readonly scored: number;

  /** High-value patients identified (GOLD+) */
  readonly highValueCount: number;

  /** Diamond tier count */
  readonly diamondCount: number;

  /** Platinum tier count */
  readonly platinumCount: number;

  /** Gold tier count */
  readonly goldCount: number;

  /** Total predicted value across all scored */
  readonly totalPredictedValue: number;

  /** Average predicted value */
  readonly avgPredictedValue: number;

  /** Errors encountered */
  readonly errorCount: number;

  /** Processing duration in ms */
  readonly durationMs: number;
}

export type BatchPLTVScoringCompletedEvent = DomainEvent<
  'pltv.batch_scoring_completed',
  BatchPLTVScoringCompletedPayload
>;

// ============================================================================
// UNION TYPE FOR ALL PLTV EVENTS
// ============================================================================

/**
 * Union of all pLTV domain events
 */
export type PLTVDomainEvent =
  | PLTVScoredEvent
  | HighValuePatientIdentifiedEvent
  | PLTVTierChangedEvent
  | PLTVDeclineDetectedEvent
  | PLTVGrowthOpportunityIdentifiedEvent
  | BatchPLTVScoringStartedEvent
  | BatchPLTVScoringCompletedEvent;

/**
 * Event type discriminator
 */
export type PLTVEventType = PLTVDomainEvent['type'];

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate UUID v4 (browser and Node.js compatible)
 */
function generateUUID(): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Required for older runtimes
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create event metadata for pLTV events
 */
export function createPLTVEventMetadata(
  correlationId: string,
  causationId?: string,
  actor?: string
): EventMetadata {
  const metadata: EventMetadata = {
    eventId: generateUUID(),
    timestamp: new Date().toISOString(),
    correlationId,
    idempotencyKey: `pltv-${correlationId}-${generateUUID()}`,
    version: 1,
    source: 'pltv-scoring-service',
  };

  if (causationId !== undefined) {
    return { ...metadata, causationId };
  }
  if (actor !== undefined) {
    return { ...metadata, actor };
  }

  return metadata;
}

/**
 * Create PLTVScored event
 */
export function createPLTVScoredEvent(
  aggregateId: string,
  payload: PLTVScoredPayload,
  metadata: EventMetadata
): PLTVScoredEvent {
  return {
    type: 'pltv.scored',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create HighValuePatientIdentified event
 */
export function createHighValuePatientIdentifiedEvent(
  aggregateId: string,
  payload: HighValuePatientIdentifiedPayload,
  metadata: EventMetadata
): HighValuePatientIdentifiedEvent {
  return {
    type: 'pltv.high_value_patient_identified',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create PLTVTierChanged event
 */
export function createPLTVTierChangedEvent(
  aggregateId: string,
  payload: PLTVTierChangedPayload,
  metadata: EventMetadata
): PLTVTierChangedEvent {
  return {
    type: 'pltv.tier_changed',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create PLTVDeclineDetected event
 */
export function createPLTVDeclineDetectedEvent(
  aggregateId: string,
  payload: PLTVDeclineDetectedPayload,
  metadata: EventMetadata
): PLTVDeclineDetectedEvent {
  return {
    type: 'pltv.decline_detected',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create PLTVGrowthOpportunityIdentified event
 */
export function createPLTVGrowthOpportunityIdentifiedEvent(
  aggregateId: string,
  payload: PLTVGrowthOpportunityIdentifiedPayload,
  metadata: EventMetadata
): PLTVGrowthOpportunityIdentifiedEvent {
  return {
    type: 'pltv.growth_opportunity_identified',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create BatchPLTVScoringStarted event
 */
export function createBatchPLTVScoringStartedEvent(
  aggregateId: string,
  payload: BatchPLTVScoringStartedPayload,
  metadata: EventMetadata
): BatchPLTVScoringStartedEvent {
  return {
    type: 'pltv.batch_scoring_started',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create BatchPLTVScoringCompleted event
 */
export function createBatchPLTVScoringCompletedEvent(
  aggregateId: string,
  payload: BatchPLTVScoringCompletedPayload,
  metadata: EventMetadata
): BatchPLTVScoringCompletedEvent {
  return {
    type: 'pltv.batch_scoring_completed',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for PLTVScored event
 */
export function isPLTVScoredEvent(event: PLTVDomainEvent): event is PLTVScoredEvent {
  return event.type === 'pltv.scored';
}

/**
 * Type guard for HighValuePatientIdentified event
 */
export function isHighValuePatientIdentifiedEvent(
  event: PLTVDomainEvent
): event is HighValuePatientIdentifiedEvent {
  return event.type === 'pltv.high_value_patient_identified';
}

/**
 * Type guard for PLTVTierChanged event
 */
export function isPLTVTierChangedEvent(event: PLTVDomainEvent): event is PLTVTierChangedEvent {
  return event.type === 'pltv.tier_changed';
}

/**
 * Type guard for PLTVDeclineDetected event
 */
export function isPLTVDeclineDetectedEvent(
  event: PLTVDomainEvent
): event is PLTVDeclineDetectedEvent {
  return event.type === 'pltv.decline_detected';
}

/**
 * Type guard for PLTVGrowthOpportunityIdentified event
 */
export function isPLTVGrowthOpportunityIdentifiedEvent(
  event: PLTVDomainEvent
): event is PLTVGrowthOpportunityIdentifiedEvent {
  return event.type === 'pltv.growth_opportunity_identified';
}

/**
 * Type guard for BatchPLTVScoringStarted event
 */
export function isBatchPLTVScoringStartedEvent(
  event: PLTVDomainEvent
): event is BatchPLTVScoringStartedEvent {
  return event.type === 'pltv.batch_scoring_started';
}

/**
 * Type guard for BatchPLTVScoringCompleted event
 */
export function isBatchPLTVScoringCompletedEvent(
  event: PLTVDomainEvent
): event is BatchPLTVScoringCompletedEvent {
  return event.type === 'pltv.batch_scoring_completed';
}
