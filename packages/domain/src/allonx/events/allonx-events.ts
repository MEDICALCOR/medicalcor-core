/**
 * @fileoverview AllOnX Domain Events
 *
 * Domain events for the AllOnX bounded context.
 * These events represent significant state changes in the domain.
 *
 * @module domain/allonx/events/allonx-events
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Events are immutable facts that happened
 * 2. PAST TENSE - Event names describe what happened
 * 3. SELF-CONTAINED - Events carry all data needed for processing
 * 4. VERSIONED - Events include version for schema evolution
 */

import type {
  AllOnXEligibility,
  AllOnXRiskLevel,
  AllOnXComplexity,
  AllOnXTreatmentRecommendation,
  AllOnXProcedureType,
} from '../value-objects/AllOnXClinicalScore.js';

import type { AllOnXCaseStatus, CasePriority } from '../entities/AllOnXCase.js';

// ============================================================================
// EVENT METADATA
// ============================================================================

/**
 * Common metadata for all AllOnX events
 */
export interface AllOnXEventMetadata {
  /** Unique event ID */
  readonly eventId: string;

  /** Event timestamp */
  readonly timestamp: Date;

  /** Correlation ID for tracing */
  readonly correlationId: string;

  /** User/system that triggered the event */
  readonly triggeredBy: string;

  /** Event schema version */
  readonly version: string;

  /** Source system */
  readonly source: string;
}

/**
 * Base domain event interface
 */
export interface AllOnXDomainEvent<T extends string, P> {
  readonly type: T;
  readonly metadata: AllOnXEventMetadata;
  readonly payload: P;
}

/**
 * Create event metadata
 */
export function createAllOnXEventMetadata(
  triggeredBy: string,
  correlationId?: string
): AllOnXEventMetadata {
  return Object.freeze({
    eventId: `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date(),
    correlationId:
      correlationId ??
      `cor_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`,
    triggeredBy,
    version: '1.0.0',
    source: 'allonx-domain',
  });
}

// ============================================================================
// CASE LIFECYCLE EVENTS
// ============================================================================

/**
 * Case created event payload
 */
export interface AllOnXCaseCreatedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly targetArch: 'MAXILLA' | 'MANDIBLE' | 'BOTH' | null;
  readonly priority: CasePriority;
  readonly assignedClinicianId: string | null;
}

/**
 * Case created event
 */
export type AllOnXCaseCreatedEvent = AllOnXDomainEvent<
  'ALLONX_CASE_CREATED',
  AllOnXCaseCreatedPayload
>;

/**
 * Case status changed event payload
 */
export interface AllOnXCaseStatusChangedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly previousStatus: AllOnXCaseStatus;
  readonly newStatus: AllOnXCaseStatus;
  readonly reason?: string;
}

/**
 * Case status changed event
 */
export type AllOnXCaseStatusChangedEvent = AllOnXDomainEvent<
  'ALLONX_CASE_STATUS_CHANGED',
  AllOnXCaseStatusChangedPayload
>;

/**
 * Case priority changed event payload
 */
export interface AllOnXCasePriorityChangedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly previousPriority: CasePriority;
  readonly newPriority: CasePriority;
  readonly reason?: string;
}

/**
 * Case priority changed event
 */
export type AllOnXCasePriorityChangedEvent = AllOnXDomainEvent<
  'ALLONX_CASE_PRIORITY_CHANGED',
  AllOnXCasePriorityChangedPayload
>;

/**
 * Case assigned event payload
 */
export interface AllOnXCaseAssignedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly assigneeType: 'CLINICIAN' | 'PROSTHODONTIST';
  readonly previousAssigneeId: string | null;
  readonly newAssigneeId: string;
}

/**
 * Case assigned event
 */
export type AllOnXCaseAssignedEvent = AllOnXDomainEvent<
  'ALLONX_CASE_ASSIGNED',
  AllOnXCaseAssignedPayload
>;

/**
 * Case completed event payload
 */
export interface AllOnXCaseCompletedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly procedure: AllOnXProcedureType;
  readonly implantCount: number;
  readonly totalDurationDays: number;
  readonly successIndicators: {
    readonly allImplantsIntegrated: boolean;
    readonly prosthesisDelivered: boolean;
    readonly patientSatisfied: boolean;
  };
}

/**
 * Case completed event
 */
export type AllOnXCaseCompletedEvent = AllOnXDomainEvent<
  'ALLONX_CASE_COMPLETED',
  AllOnXCaseCompletedPayload
>;

/**
 * Case cancelled event payload
 */
export interface AllOnXCaseCancelledPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly reason: string;
  readonly cancelledAtStatus: AllOnXCaseStatus;
}

/**
 * Case cancelled event
 */
export type AllOnXCaseCancelledEvent = AllOnXDomainEvent<
  'ALLONX_CASE_CANCELLED',
  AllOnXCaseCancelledPayload
>;

// ============================================================================
// CLINICAL ASSESSMENT EVENTS
// ============================================================================

/**
 * Case scored event payload
 */
export interface AllOnXCaseScoredPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly compositeScore: number;
  readonly eligibility: AllOnXEligibility;
  readonly riskLevel: AllOnXRiskLevel;
  readonly complexity: AllOnXComplexity;
  readonly treatmentRecommendation: AllOnXTreatmentRecommendation;
  readonly recommendedProcedure: AllOnXProcedureType;
  readonly confidence: number;
  readonly riskFlags: readonly string[];
  readonly contraindications: readonly string[];
}

/**
 * Case scored event
 */
export type AllOnXCaseScoredEvent = AllOnXDomainEvent<
  'ALLONX_CASE_SCORED',
  AllOnXCaseScoredPayload
>;

/**
 * Score overridden event payload
 */
export interface AllOnXScoreOverriddenPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly previousScore: number;
  readonly newScore: number;
  readonly previousEligibility: AllOnXEligibility;
  readonly newEligibility: AllOnXEligibility;
  readonly overriddenBy: string;
  readonly reason: string;
}

/**
 * Score overridden event
 */
export type AllOnXScoreOverriddenEvent = AllOnXDomainEvent<
  'ALLONX_SCORE_OVERRIDDEN',
  AllOnXScoreOverriddenPayload
>;

/**
 * Case reviewed event payload
 */
export interface AllOnXCaseReviewedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly reviewedBy: string;
  readonly decision: 'APPROVED' | 'MODIFICATIONS_REQUIRED' | 'DEFERRED' | 'REJECTED';
  readonly comments?: string;
  readonly modifications?: readonly string[];
}

/**
 * Case reviewed event
 */
export type AllOnXCaseReviewedEvent = AllOnXDomainEvent<
  'ALLONX_CASE_REVIEWED',
  AllOnXCaseReviewedPayload
>;

// ============================================================================
// IMAGING EVENTS
// ============================================================================

/**
 * Imaging uploaded event payload
 */
export interface AllOnXImagingUploadedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly imagingId: string;
  readonly imagingType: 'PANORAMIC' | 'CBCT' | 'INTRAORAL' | 'PHOTOGRAPH';
  readonly storageUrl: string;
}

/**
 * Imaging uploaded event
 */
export type AllOnXImagingUploadedEvent = AllOnXDomainEvent<
  'ALLONX_IMAGING_UPLOADED',
  AllOnXImagingUploadedPayload
>;

/**
 * CBCT analyzed event payload
 */
export interface AllOnXCBCTAnalyzedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly imagingId: string;
  readonly boneHeightMaxilla: number;
  readonly boneHeightMandible: number;
  readonly boneWidth: number;
  readonly boneDensity: number;
  readonly sinusPneumatization?: number;
  readonly findings: string;
}

/**
 * CBCT analyzed event
 */
export type AllOnXCBCTAnalyzedEvent = AllOnXDomainEvent<
  'ALLONX_CBCT_ANALYZED',
  AllOnXCBCTAnalyzedPayload
>;

// ============================================================================
// SURGICAL EVENTS
// ============================================================================

/**
 * Surgery scheduled event payload
 */
export interface AllOnXSurgeryScheduledPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly scheduledFor: Date;
  readonly procedure: AllOnXProcedureType;
  readonly surgeonId: string;
  readonly estimatedDuration: number; // minutes
}

/**
 * Surgery scheduled event
 */
export type AllOnXSurgeryScheduledEvent = AllOnXDomainEvent<
  'ALLONX_SURGERY_SCHEDULED',
  AllOnXSurgeryScheduledPayload
>;

/**
 * Implant placed event payload
 */
export interface AllOnXImplantPlacedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly implantId: string;
  readonly position: string;
  readonly brand: string;
  readonly model: string;
  readonly diameter: number;
  readonly length: number;
  readonly insertionTorque: number;
  readonly primaryStability: 'HIGH' | 'MODERATE' | 'LOW';
}

/**
 * Implant placed event
 */
export type AllOnXImplantPlacedEvent = AllOnXDomainEvent<
  'ALLONX_IMPLANT_PLACED',
  AllOnXImplantPlacedPayload
>;

/**
 * Surgery completed event payload
 */
export interface AllOnXSurgeryCompletedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly procedure: AllOnXProcedureType;
  readonly implantCount: number;
  readonly immediateLoadingPerformed: boolean;
  readonly complications: readonly string[];
  readonly duration: number; // minutes
}

/**
 * Surgery completed event
 */
export type AllOnXSurgeryCompletedEvent = AllOnXDomainEvent<
  'ALLONX_SURGERY_COMPLETED',
  AllOnXSurgeryCompletedPayload
>;

// ============================================================================
// PROSTHETIC EVENTS
// ============================================================================

/**
 * Provisional prosthesis delivered event payload
 */
export interface AllOnXProvisionalDeliveredPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly arch: 'MAXILLA' | 'MANDIBLE' | 'BOTH';
  readonly deliveredAt: Date;
  readonly immediateLoad: boolean;
}

/**
 * Provisional prosthesis delivered event
 */
export type AllOnXProvisionalDeliveredEvent = AllOnXDomainEvent<
  'ALLONX_PROVISIONAL_DELIVERED',
  AllOnXProvisionalDeliveredPayload
>;

/**
 * Final prosthesis delivered event payload
 */
export interface AllOnXFinalProsthesisDeliveredPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly arch: 'MAXILLA' | 'MANDIBLE' | 'BOTH';
  readonly prosthesisType: string;
  readonly material: string;
  readonly deliveredAt: Date;
}

/**
 * Final prosthesis delivered event
 */
export type AllOnXFinalProsthesisDeliveredEvent = AllOnXDomainEvent<
  'ALLONX_FINAL_PROSTHESIS_DELIVERED',
  AllOnXFinalProsthesisDeliveredPayload
>;

// ============================================================================
// FOLLOW-UP EVENTS
// ============================================================================

/**
 * Follow-up scheduled event payload
 */
export interface AllOnXFollowUpScheduledPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly followUpId: string;
  readonly scheduledFor: Date;
  readonly type: 'ROUTINE' | 'HEALING_CHECK' | 'PROSTHETIC' | 'EMERGENCY';
}

/**
 * Follow-up scheduled event
 */
export type AllOnXFollowUpScheduledEvent = AllOnXDomainEvent<
  'ALLONX_FOLLOW_UP_SCHEDULED',
  AllOnXFollowUpScheduledPayload
>;

/**
 * Follow-up completed event payload
 */
export interface AllOnXFollowUpCompletedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly followUpId: string;
  readonly findings: string;
  readonly osseointegrationStatus: 'SUCCESSFUL' | 'PROGRESSING' | 'CONCERNING' | 'FAILED';
  readonly nextActions: readonly string[];
}

/**
 * Follow-up completed event
 */
export type AllOnXFollowUpCompletedEvent = AllOnXDomainEvent<
  'ALLONX_FOLLOW_UP_COMPLETED',
  AllOnXFollowUpCompletedPayload
>;

/**
 * Follow-up missed event payload
 */
export interface AllOnXFollowUpMissedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly followUpId: string;
  readonly scheduledFor: Date;
  readonly attemptedContact: boolean;
}

/**
 * Follow-up missed event
 */
export type AllOnXFollowUpMissedEvent = AllOnXDomainEvent<
  'ALLONX_FOLLOW_UP_MISSED',
  AllOnXFollowUpMissedPayload
>;

// ============================================================================
// COMPLICATION EVENTS
// ============================================================================

/**
 * Complication reported event payload
 */
export interface AllOnXComplicationReportedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly complicationType:
    | 'IMPLANT_FAILURE'
    | 'INFECTION'
    | 'NERVE_DAMAGE'
    | 'PROSTHETIC_FRACTURE'
    | 'SOFT_TISSUE'
    | 'OTHER';
  readonly severity: 'MINOR' | 'MODERATE' | 'SEVERE';
  readonly description: string;
  readonly implantId?: string;
  readonly reportedAt: Date;
}

/**
 * Complication reported event
 */
export type AllOnXComplicationReportedEvent = AllOnXDomainEvent<
  'ALLONX_COMPLICATION_REPORTED',
  AllOnXComplicationReportedPayload
>;

/**
 * Complication resolved event payload
 */
export interface AllOnXComplicationResolvedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly complicationId: string;
  readonly resolution: string;
  readonly resolvedAt: Date;
}

/**
 * Complication resolved event
 */
export type AllOnXComplicationResolvedEvent = AllOnXDomainEvent<
  'ALLONX_COMPLICATION_RESOLVED',
  AllOnXComplicationResolvedPayload
>;

// ============================================================================
// CONSENT EVENTS
// ============================================================================

/**
 * Consent obtained event payload
 */
export interface AllOnXConsentObtainedPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly consentType: 'INFORMED_CONSENT' | 'SURGICAL_CONSENT' | 'ANESTHESIA_CONSENT';
  readonly documentId: string;
  readonly obtainedAt: Date;
  readonly witnessId?: string;
}

/**
 * Consent obtained event
 */
export type AllOnXConsentObtainedEvent = AllOnXDomainEvent<
  'ALLONX_CONSENT_OBTAINED',
  AllOnXConsentObtainedPayload
>;

/**
 * Consent withdrawn event payload
 */
export interface AllOnXConsentWithdrawnPayload {
  readonly caseId: string;
  readonly caseNumber: string;
  readonly patientId: string;
  readonly reason: string;
  readonly withdrawnAt: Date;
}

/**
 * Consent withdrawn event
 */
export type AllOnXConsentWithdrawnEvent = AllOnXDomainEvent<
  'ALLONX_CONSENT_WITHDRAWN',
  AllOnXConsentWithdrawnPayload
>;

// ============================================================================
// UNION TYPES
// ============================================================================

/**
 * All AllOnX domain event types
 */
export type AllOnXDomainEventUnion =
  // Case lifecycle
  | AllOnXCaseCreatedEvent
  | AllOnXCaseStatusChangedEvent
  | AllOnXCasePriorityChangedEvent
  | AllOnXCaseAssignedEvent
  | AllOnXCaseCompletedEvent
  | AllOnXCaseCancelledEvent
  // Clinical assessment
  | AllOnXCaseScoredEvent
  | AllOnXScoreOverriddenEvent
  | AllOnXCaseReviewedEvent
  // Imaging
  | AllOnXImagingUploadedEvent
  | AllOnXCBCTAnalyzedEvent
  // Surgical
  | AllOnXSurgeryScheduledEvent
  | AllOnXImplantPlacedEvent
  | AllOnXSurgeryCompletedEvent
  // Prosthetic
  | AllOnXProvisionalDeliveredEvent
  | AllOnXFinalProsthesisDeliveredEvent
  // Follow-up
  | AllOnXFollowUpScheduledEvent
  | AllOnXFollowUpCompletedEvent
  | AllOnXFollowUpMissedEvent
  // Complications
  | AllOnXComplicationReportedEvent
  | AllOnXComplicationResolvedEvent
  // Consent
  | AllOnXConsentObtainedEvent
  | AllOnXConsentWithdrawnEvent;

/**
 * All event type strings
 */
export type AllOnXEventType = AllOnXDomainEventUnion['type'];

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Create case created event
 */
export function createAllOnXCaseCreatedEvent(
  payload: AllOnXCaseCreatedPayload,
  triggeredBy: string,
  correlationId?: string
): AllOnXCaseCreatedEvent {
  return {
    type: 'ALLONX_CASE_CREATED',
    metadata: createAllOnXEventMetadata(triggeredBy, correlationId),
    payload,
  };
}

/**
 * Create case scored event
 */
export function createAllOnXCaseScoredEvent(
  payload: AllOnXCaseScoredPayload,
  triggeredBy: string,
  correlationId?: string
): AllOnXCaseScoredEvent {
  return {
    type: 'ALLONX_CASE_SCORED',
    metadata: createAllOnXEventMetadata(triggeredBy, correlationId),
    payload,
  };
}

/**
 * Create case status changed event
 */
export function createAllOnXCaseStatusChangedEvent(
  payload: AllOnXCaseStatusChangedPayload,
  triggeredBy: string,
  correlationId?: string
): AllOnXCaseStatusChangedEvent {
  return {
    type: 'ALLONX_CASE_STATUS_CHANGED',
    metadata: createAllOnXEventMetadata(triggeredBy, correlationId),
    payload,
  };
}

/**
 * Create surgery scheduled event
 */
export function createAllOnXSurgeryScheduledEvent(
  payload: AllOnXSurgeryScheduledPayload,
  triggeredBy: string,
  correlationId?: string
): AllOnXSurgeryScheduledEvent {
  return {
    type: 'ALLONX_SURGERY_SCHEDULED',
    metadata: createAllOnXEventMetadata(triggeredBy, correlationId),
    payload,
  };
}

/**
 * Create implant placed event
 */
export function createAllOnXImplantPlacedEvent(
  payload: AllOnXImplantPlacedPayload,
  triggeredBy: string,
  correlationId?: string
): AllOnXImplantPlacedEvent {
  return {
    type: 'ALLONX_IMPLANT_PLACED',
    metadata: createAllOnXEventMetadata(triggeredBy, correlationId),
    payload,
  };
}

/**
 * Create follow-up scheduled event
 */
export function createAllOnXFollowUpScheduledEvent(
  payload: AllOnXFollowUpScheduledPayload,
  triggeredBy: string,
  correlationId?: string
): AllOnXFollowUpScheduledEvent {
  return {
    type: 'ALLONX_FOLLOW_UP_SCHEDULED',
    metadata: createAllOnXEventMetadata(triggeredBy, correlationId),
    payload,
  };
}

/**
 * Create complication reported event
 */
export function createAllOnXComplicationReportedEvent(
  payload: AllOnXComplicationReportedPayload,
  triggeredBy: string,
  correlationId?: string
): AllOnXComplicationReportedEvent {
  return {
    type: 'ALLONX_COMPLICATION_REPORTED',
    metadata: createAllOnXEventMetadata(triggeredBy, correlationId),
    payload,
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if event is case created
 */
export function isAllOnXCaseCreatedEvent(
  event: AllOnXDomainEventUnion
): event is AllOnXCaseCreatedEvent {
  return event.type === 'ALLONX_CASE_CREATED';
}

/**
 * Check if event is case scored
 */
export function isAllOnXCaseScoredEvent(
  event: AllOnXDomainEventUnion
): event is AllOnXCaseScoredEvent {
  return event.type === 'ALLONX_CASE_SCORED';
}

/**
 * Check if event is status changed
 */
export function isAllOnXCaseStatusChangedEvent(
  event: AllOnXDomainEventUnion
): event is AllOnXCaseStatusChangedEvent {
  return event.type === 'ALLONX_CASE_STATUS_CHANGED';
}

/**
 * Check if event is surgery related
 */
export function isAllOnXSurgeryEvent(
  event: AllOnXDomainEventUnion
): event is AllOnXSurgeryScheduledEvent | AllOnXImplantPlacedEvent | AllOnXSurgeryCompletedEvent {
  return ['ALLONX_SURGERY_SCHEDULED', 'ALLONX_IMPLANT_PLACED', 'ALLONX_SURGERY_COMPLETED'].includes(
    event.type
  );
}

/**
 * Check if event is complication related
 */
export function isAllOnXComplicationEvent(
  event: AllOnXDomainEventUnion
): event is AllOnXComplicationReportedEvent | AllOnXComplicationResolvedEvent {
  return ['ALLONX_COMPLICATION_REPORTED', 'ALLONX_COMPLICATION_RESOLVED'].includes(event.type);
}

/**
 * Check if event is consent related
 */
export function isAllOnXConsentEvent(
  event: AllOnXDomainEventUnion
): event is AllOnXConsentObtainedEvent | AllOnXConsentWithdrawnEvent {
  return ['ALLONX_CONSENT_OBTAINED', 'ALLONX_CONSENT_WITHDRAWN'].includes(event.type);
}

/**
 * Check if event is follow-up related
 */
export function isAllOnXFollowUpEvent(
  event: AllOnXDomainEventUnion
): event is
  | AllOnXFollowUpScheduledEvent
  | AllOnXFollowUpCompletedEvent
  | AllOnXFollowUpMissedEvent {
  return [
    'ALLONX_FOLLOW_UP_SCHEDULED',
    'ALLONX_FOLLOW_UP_COMPLETED',
    'ALLONX_FOLLOW_UP_MISSED',
  ].includes(event.type);
}
