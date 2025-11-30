/**
 * @fileoverview OSAX Domain Events
 *
 * Banking/Medical Grade Domain Events for OSAX Case Aggregate.
 * Strictly typed events following Event Sourcing patterns.
 *
 * @module domain/osax/events/osax-events
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Events are facts that happened
 * 2. STRICT TYPING - No any/unknown in event payloads
 * 3. VERSIONING - Schema version for evolution
 * 4. IDEMPOTENCY - Events have unique IDs for deduplication
 * 5. HIPAA/GDPR AWARENESS - Sensitive data handling
 */

import type { OsaxCaseStatus, OsaxStudyType, OsaxTreatmentStatus } from '../entities/OsaxCase.js';
import type {
  OsaxSeverity,
  OsaxTreatmentRecommendation,
} from '../value-objects/OsaxClinicalScore.js';

// ============================================================================
// BASE EVENT TYPES
// ============================================================================

/**
 * Event metadata - common to all domain events
 */
export interface OsaxEventMetadata {
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

  /** Actor who triggered the event (user ID, system, etc.) */
  readonly actor?: string;

  /** Tenant ID for multi-tenancy */
  readonly tenantId?: string;
}

/**
 * Base domain event interface for OSAX
 */
export interface OsaxDomainEvent<TType extends string, TPayload> {
  /** Event type discriminator */
  readonly type: TType;

  /** Aggregate ID this event belongs to */
  readonly aggregateId: string;

  /** Aggregate type */
  readonly aggregateType: 'OsaxCase';

  /** Event metadata */
  readonly metadata: OsaxEventMetadata;

  /** Event payload (strongly typed) */
  readonly payload: TPayload;
}

// ============================================================================
// CASE LIFECYCLE EVENTS
// ============================================================================

/**
 * OsaxCaseCreated - Emitted when a new OSAX case is created
 */
export interface OsaxCaseCreatedPayload {
  readonly caseNumber: string;
  readonly subjectId: string;
  readonly patientId: string;
  readonly referringPhysicianId?: string;
  readonly assignedSpecialistId?: string;
  readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  readonly consentStatus: 'PENDING' | 'OBTAINED' | 'WITHDRAWN';
}

export type OsaxCaseCreatedEvent = OsaxDomainEvent<'osax.case.created', OsaxCaseCreatedPayload>;

/**
 * OsaxCaseStatusChanged - Emitted when case status changes
 */
export interface OsaxCaseStatusChangedPayload {
  readonly caseNumber: string;
  readonly previousStatus: OsaxCaseStatus;
  readonly newStatus: OsaxCaseStatus;
  readonly reason?: string;
  readonly changedBy: string;
}

export type OsaxCaseStatusChangedEvent = OsaxDomainEvent<
  'osax.case.status_changed',
  OsaxCaseStatusChangedPayload
>;

/**
 * OsaxCasePriorityChanged - Emitted when case priority changes
 */
export interface OsaxCasePriorityChangedPayload {
  readonly caseNumber: string;
  readonly previousPriority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  readonly newPriority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  readonly reason?: string;
}

export type OsaxCasePriorityChangedEvent = OsaxDomainEvent<
  'osax.case.priority_changed',
  OsaxCasePriorityChangedPayload
>;

/**
 * OsaxCaseAssigned - Emitted when case is assigned to a specialist
 */
export interface OsaxCaseAssignedPayload {
  readonly caseNumber: string;
  readonly specialistId: string;
  readonly specialistName?: string;
  readonly previousSpecialistId?: string;
  readonly assignedBy: string;
  readonly reason?: string;
}

export type OsaxCaseAssignedEvent = OsaxDomainEvent<'osax.case.assigned', OsaxCaseAssignedPayload>;

/**
 * OsaxCaseClosed - Emitted when case is closed
 */
export interface OsaxCaseClosedPayload {
  readonly caseNumber: string;
  readonly closureReason:
    | 'TREATMENT_COMPLETE'
    | 'PATIENT_DECLINED'
    | 'TRANSFERRED'
    | 'NO_OSA'
    | 'OTHER';
  readonly closureNotes?: string;
  readonly finalSeverity?: OsaxSeverity;
  readonly treatmentOutcome?: 'SUCCESSFUL' | 'PARTIAL' | 'UNSUCCESSFUL' | 'NOT_APPLICABLE';
}

export type OsaxCaseClosedEvent = OsaxDomainEvent<'osax.case.closed', OsaxCaseClosedPayload>;

/**
 * OsaxCaseCancelled - Emitted when case is cancelled
 */
export interface OsaxCaseCancelledPayload {
  readonly caseNumber: string;
  readonly cancellationReason: string;
  readonly cancelledBy: string;
}

export type OsaxCaseCancelledEvent = OsaxDomainEvent<
  'osax.case.cancelled',
  OsaxCaseCancelledPayload
>;

// ============================================================================
// STUDY EVENTS
// ============================================================================

/**
 * OsaxStudyCompleted - Emitted when sleep study is completed
 */
export interface OsaxStudyCompletedPayload {
  readonly caseNumber: string;
  readonly studyType: OsaxStudyType;
  readonly studyDate: string; // ISO 8601
  readonly durationHours: number;
  readonly facility?: string;
  readonly technician?: string;
  readonly qualityScore?: number;
}

export type OsaxStudyCompletedEvent = OsaxDomainEvent<
  'osax.study.completed',
  OsaxStudyCompletedPayload
>;

/**
 * OsaxStudyDataReceived - Emitted when study data is received
 */
export interface OsaxStudyDataReceivedPayload {
  readonly caseNumber: string;
  readonly studyDataRef: string;
  readonly dataFormat: 'EDF' | 'XML' | 'HL7' | 'FHIR' | 'OTHER';
  readonly dataSize: number;
  readonly checksumSha256: string;
}

export type OsaxStudyDataReceivedEvent = OsaxDomainEvent<
  'osax.study.data_received',
  OsaxStudyDataReceivedPayload
>;

// ============================================================================
// SCORING EVENTS
// ============================================================================

/**
 * OsaxCaseScored - Emitted when clinical score is calculated
 */
export interface OsaxCaseScoredPayload {
  readonly caseNumber: string;

  /** Severity classification */
  readonly severity: OsaxSeverity;

  /** Key clinical indicators (limited for HIPAA) */
  readonly indicators: {
    readonly ahi: number;
    readonly odi: number;
    readonly spo2Nadir: number;
    readonly essScore: number;
  };

  /** Composite score (0-100) */
  readonly compositeScore: number;

  /** Scoring confidence */
  readonly confidence: number;

  /** Scoring method */
  readonly scoringMethod: 'SYSTEM' | 'PHYSICIAN';

  /** Treatment recommendation */
  readonly treatmentRecommendation: OsaxTreatmentRecommendation;

  /** Cardiovascular risk level */
  readonly cardiovascularRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

  /** Risk flags identified */
  readonly riskFlags: readonly string[];

  /** Previous score if rescoring */
  readonly previousSeverity?: OsaxSeverity;
  readonly previousCompositeScore?: number;
}

export type OsaxCaseScoredEvent = OsaxDomainEvent<'osax.case.scored', OsaxCaseScoredPayload>;

/**
 * OsaxScoreOverridden - Emitted when physician overrides system score
 */
export interface OsaxScoreOverriddenPayload {
  readonly caseNumber: string;
  readonly originalSeverity: OsaxSeverity;
  readonly overriddenSeverity: OsaxSeverity;
  readonly originalRecommendation: OsaxTreatmentRecommendation;
  readonly overriddenRecommendation: OsaxTreatmentRecommendation;
  readonly physicianId: string;
  readonly overrideReason: string;
}

export type OsaxScoreOverriddenEvent = OsaxDomainEvent<
  'osax.score.overridden',
  OsaxScoreOverriddenPayload
>;

// ============================================================================
// REVIEW EVENTS
// ============================================================================

/**
 * OsaxCaseReviewed - Emitted when physician reviews the case
 */
export interface OsaxCaseReviewedPayload {
  readonly caseNumber: string;
  readonly physicianId: string;
  readonly physicianName?: string;
  readonly decision: 'APPROVE' | 'MODIFY' | 'REQUEST_RESTUDY' | 'REFER';
  readonly modifiedRecommendation?: OsaxTreatmentRecommendation;
  readonly reviewNotes?: string;
  readonly referralSpecialty?: string;
  readonly reviewDurationMinutes?: number;
}

export type OsaxCaseReviewedEvent = OsaxDomainEvent<'osax.case.reviewed', OsaxCaseReviewedPayload>;

// ============================================================================
// TREATMENT EVENTS
// ============================================================================

/**
 * OsaxTreatmentInitiated - Emitted when treatment is started
 */
export interface OsaxTreatmentInitiatedPayload {
  readonly caseNumber: string;
  readonly treatmentType: OsaxTreatmentRecommendation;
  readonly startDate: string; // ISO 8601
  readonly deviceInfo?: {
    readonly manufacturer?: string;
    readonly model?: string;
  };
  readonly prescribingPhysicianId: string;
}

export type OsaxTreatmentInitiatedEvent = OsaxDomainEvent<
  'osax.treatment.initiated',
  OsaxTreatmentInitiatedPayload
>;

/**
 * OsaxTreatmentStatusChanged - Emitted when treatment status changes
 */
export interface OsaxTreatmentStatusChangedPayload {
  readonly caseNumber: string;
  readonly treatmentType: OsaxTreatmentRecommendation;
  readonly previousStatus: OsaxTreatmentStatus;
  readonly newStatus: OsaxTreatmentStatus;
  readonly reason?: string;
  readonly complianceData?: {
    readonly averageUsageHours?: number;
    readonly compliancePercentage?: number;
  };
}

export type OsaxTreatmentStatusChangedEvent = OsaxDomainEvent<
  'osax.treatment.status_changed',
  OsaxTreatmentStatusChangedPayload
>;

/**
 * OsaxTreatmentCompleted - Emitted when treatment course is completed
 */
export interface OsaxTreatmentCompletedPayload {
  readonly caseNumber: string;
  readonly treatmentType: OsaxTreatmentRecommendation;
  readonly startDate: string;
  readonly endDate: string;
  readonly outcome: 'SUCCESSFUL' | 'PARTIAL' | 'UNSUCCESSFUL';
  readonly finalCompliancePercentage?: number;
  readonly followUpRecommended: boolean;
}

export type OsaxTreatmentCompletedEvent = OsaxDomainEvent<
  'osax.treatment.completed',
  OsaxTreatmentCompletedPayload
>;

// ============================================================================
// FOLLOW-UP EVENTS
// ============================================================================

/**
 * OsaxFollowUpScheduled - Emitted when follow-up is scheduled
 */
export interface OsaxFollowUpScheduledPayload {
  readonly caseNumber: string;
  readonly followUpId: string;
  readonly scheduledDate: string; // ISO 8601
  readonly followUpType: 'PHONE' | 'VIDEO' | 'IN_PERSON' | 'DEVICE_DATA_REVIEW';
  readonly scheduledBy: string;
}

export type OsaxFollowUpScheduledEvent = OsaxDomainEvent<
  'osax.followup.scheduled',
  OsaxFollowUpScheduledPayload
>;

/**
 * OsaxFollowUpCompleted - Emitted when follow-up is completed
 */
export interface OsaxFollowUpCompletedPayload {
  readonly caseNumber: string;
  readonly followUpId: string;
  readonly completedDate: string; // ISO 8601
  readonly followUpType: 'PHONE' | 'VIDEO' | 'IN_PERSON' | 'DEVICE_DATA_REVIEW';
  readonly outcome: 'STABLE' | 'IMPROVED' | 'WORSENED' | 'NEEDS_ADJUSTMENT';
  readonly nextFollowUpRecommended: boolean;
  readonly updatedAhi?: number;
}

export type OsaxFollowUpCompletedEvent = OsaxDomainEvent<
  'osax.followup.completed',
  OsaxFollowUpCompletedPayload
>;

/**
 * OsaxFollowUpMissed - Emitted when follow-up is missed
 */
export interface OsaxFollowUpMissedPayload {
  readonly caseNumber: string;
  readonly followUpId: string;
  readonly scheduledDate: string;
  readonly followUpType: 'PHONE' | 'VIDEO' | 'IN_PERSON' | 'DEVICE_DATA_REVIEW';
  readonly rescheduleAttempted: boolean;
  readonly newScheduledDate?: string;
}

export type OsaxFollowUpMissedEvent = OsaxDomainEvent<
  'osax.followup.missed',
  OsaxFollowUpMissedPayload
>;

// ============================================================================
// CONSENT & GDPR EVENTS
// ============================================================================

/**
 * OsaxConsentObtained - Emitted when patient consent is obtained
 */
export interface OsaxConsentObtainedPayload {
  readonly caseNumber: string;
  readonly consentType: 'TREATMENT' | 'DATA_PROCESSING' | 'RESEARCH';
  readonly consentDate: string; // ISO 8601
  readonly consentMethod: 'WRITTEN' | 'ELECTRONIC' | 'VERBAL';
  readonly consentVersion: string;
  readonly expiryDate?: string;
}

export type OsaxConsentObtainedEvent = OsaxDomainEvent<
  'osax.consent.obtained',
  OsaxConsentObtainedPayload
>;

/**
 * OsaxConsentWithdrawn - Emitted when patient withdraws consent
 */
export interface OsaxConsentWithdrawnPayload {
  readonly caseNumber: string;
  readonly consentType: 'TREATMENT' | 'DATA_PROCESSING' | 'RESEARCH';
  readonly withdrawalDate: string; // ISO 8601
  readonly withdrawalReason?: string;
  readonly dataRetentionRequired: boolean;
  readonly retentionPeriodDays?: number;
}

export type OsaxConsentWithdrawnEvent = OsaxDomainEvent<
  'osax.consent.withdrawn',
  OsaxConsentWithdrawnPayload
>;

/**
 * OsaxDataExported - Emitted when case data is exported (GDPR portability)
 */
export interface OsaxDataExportedPayload {
  readonly caseNumber: string;
  readonly exportFormat: 'JSON' | 'PDF' | 'FHIR';
  readonly exportDate: string;
  readonly requestedBy: string;
  readonly exportReference: string;
}

export type OsaxDataExportedEvent = OsaxDomainEvent<'osax.data.exported', OsaxDataExportedPayload>;

/**
 * OsaxDataDeleted - Emitted when case data is deleted (GDPR erasure)
 */
export interface OsaxDataDeletedPayload {
  readonly caseNumber: string;
  readonly deletionType: 'SOFT' | 'HARD';
  readonly deletionDate: string;
  readonly deletionReason: 'GDPR_REQUEST' | 'RETENTION_EXPIRED' | 'ADMINISTRATIVE';
  readonly requestedBy: string;
  readonly auditReference: string;
}

export type OsaxDataDeletedEvent = OsaxDomainEvent<'osax.data.deleted', OsaxDataDeletedPayload>;

// ============================================================================
// UNION TYPE FOR ALL OSAX EVENTS
// ============================================================================

/**
 * Union of all OSAX domain events
 */
export type OsaxDomainEventUnion =
  // Case lifecycle
  | OsaxCaseCreatedEvent
  | OsaxCaseStatusChangedEvent
  | OsaxCasePriorityChangedEvent
  | OsaxCaseAssignedEvent
  | OsaxCaseClosedEvent
  | OsaxCaseCancelledEvent
  // Study
  | OsaxStudyCompletedEvent
  | OsaxStudyDataReceivedEvent
  // Scoring
  | OsaxCaseScoredEvent
  | OsaxScoreOverriddenEvent
  // Review
  | OsaxCaseReviewedEvent
  // Treatment
  | OsaxTreatmentInitiatedEvent
  | OsaxTreatmentStatusChangedEvent
  | OsaxTreatmentCompletedEvent
  // Follow-up
  | OsaxFollowUpScheduledEvent
  | OsaxFollowUpCompletedEvent
  | OsaxFollowUpMissedEvent
  // Consent & GDPR
  | OsaxConsentObtainedEvent
  | OsaxConsentWithdrawnEvent
  | OsaxDataExportedEvent
  | OsaxDataDeletedEvent;

/**
 * Event type discriminator
 */
export type OsaxEventType = OsaxDomainEventUnion['type'];

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate UUID v4 (browser and Node.js compatible)
 */
function generateUUID(): string {
  // Modern environments always have crypto.randomUUID
  return globalThis.crypto.randomUUID();
}

/**
 * Create event metadata
 */
export function createOsaxEventMetadata(
  correlationId: string,
  source: string,
  causationId?: string,
  actor?: string,
  tenantId?: string
): OsaxEventMetadata {
  const metadata: OsaxEventMetadata = {
    eventId: generateUUID(),
    timestamp: new Date().toISOString(),
    correlationId,
    idempotencyKey: `${source}-${correlationId}-${Date.now()}`,
    version: 1,
    source,
  };

  // Build optional properties to spread
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
 * Create OsaxCaseCreated event
 */
export function createOsaxCaseCreatedEvent(
  aggregateId: string,
  payload: OsaxCaseCreatedPayload,
  metadata: OsaxEventMetadata
): OsaxCaseCreatedEvent {
  return {
    type: 'osax.case.created',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

/**
 * Create OsaxCaseScored event
 */
export function createOsaxCaseScoredEvent(
  aggregateId: string,
  payload: OsaxCaseScoredPayload,
  metadata: OsaxEventMetadata
): OsaxCaseScoredEvent {
  return {
    type: 'osax.case.scored',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

/**
 * Create OsaxCaseStatusChanged event
 */
export function createOsaxCaseStatusChangedEvent(
  aggregateId: string,
  payload: OsaxCaseStatusChangedPayload,
  metadata: OsaxEventMetadata
): OsaxCaseStatusChangedEvent {
  return {
    type: 'osax.case.status_changed',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

/**
 * Create OsaxTreatmentInitiated event
 */
export function createOsaxTreatmentInitiatedEvent(
  aggregateId: string,
  payload: OsaxTreatmentInitiatedPayload,
  metadata: OsaxEventMetadata
): OsaxTreatmentInitiatedEvent {
  return {
    type: 'osax.treatment.initiated',
    aggregateId,
    aggregateType: 'OsaxCase',
    metadata,
    payload,
  };
}

/**
 * Create OsaxFollowUpScheduled event
 */
export function createOsaxFollowUpScheduledEvent(
  aggregateId: string,
  payload: OsaxFollowUpScheduledPayload,
  metadata: OsaxEventMetadata
): OsaxFollowUpScheduledEvent {
  return {
    type: 'osax.followup.scheduled',
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
 * Type guard for OsaxCaseCreated event
 */
export function isOsaxCaseCreatedEvent(event: OsaxDomainEventUnion): event is OsaxCaseCreatedEvent {
  return event.type === 'osax.case.created';
}

/**
 * Type guard for OsaxCaseScored event
 */
export function isOsaxCaseScoredEvent(event: OsaxDomainEventUnion): event is OsaxCaseScoredEvent {
  return event.type === 'osax.case.scored';
}

/**
 * Type guard for OsaxCaseStatusChanged event
 */
export function isOsaxCaseStatusChangedEvent(
  event: OsaxDomainEventUnion
): event is OsaxCaseStatusChangedEvent {
  return event.type === 'osax.case.status_changed';
}

/**
 * Type guard for OsaxTreatmentInitiated event
 */
export function isOsaxTreatmentInitiatedEvent(
  event: OsaxDomainEventUnion
): event is OsaxTreatmentInitiatedEvent {
  return event.type === 'osax.treatment.initiated';
}

/**
 * Type guard for OsaxCaseReviewed event
 */
export function isOsaxCaseReviewedEvent(
  event: OsaxDomainEventUnion
): event is OsaxCaseReviewedEvent {
  return event.type === 'osax.case.reviewed';
}

/**
 * Type guard for OsaxFollowUpCompleted event
 */
export function isOsaxFollowUpCompletedEvent(
  event: OsaxDomainEventUnion
): event is OsaxFollowUpCompletedEvent {
  return event.type === 'osax.followup.completed';
}

/**
 * Type guard for consent-related events
 */
export function isOsaxConsentEvent(
  event: OsaxDomainEventUnion
): event is OsaxConsentObtainedEvent | OsaxConsentWithdrawnEvent {
  return event.type === 'osax.consent.obtained' || event.type === 'osax.consent.withdrawn';
}

/**
 * Type guard for GDPR-related events
 */
export function isOsaxGdprEvent(
  event: OsaxDomainEventUnion
): event is OsaxDataExportedEvent | OsaxDataDeletedEvent {
  return event.type === 'osax.data.exported' || event.type === 'osax.data.deleted';
}
