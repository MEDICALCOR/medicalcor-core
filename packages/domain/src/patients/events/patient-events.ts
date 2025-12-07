/**
 * @fileoverview Patient Domain Events
 *
 * Banking/Medical Grade Domain Events for Patient Aggregate.
 * Strictly typed events following Event Sourcing patterns.
 *
 * @module domain/patients/events/patient-events
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Events are facts that happened
 * 2. STRICT TYPING - No any/unknown in event payloads
 * 3. VERSIONING - Schema version for evolution
 * 4. IDEMPOTENCY - Events have unique IDs for deduplication
 */

import type { EventMetadata, DomainEvent } from '../../shared-kernel/domain-events/lead-events.js';
import { createEventMetadata } from '../../shared-kernel/domain-events/lead-events.js';

// Re-export createEventMetadata for convenience (EventMetadata is already exported from shared-kernel)
export { createEventMetadata };

// ============================================================================
// PATIENT STATUS TYPES
// ============================================================================

/**
 * Patient lifecycle statuses
 */
export type PatientStatus =
  | 'registered' // Just converted from Lead
  | 'active' // Currently an active patient
  | 'under_treatment' // Has active treatment plans
  | 'post_treatment' // Completed treatments, in follow-up
  | 'inactive' // No activity for extended period
  | 'archived'; // Permanently archived

/**
 * Insurance coverage status
 */
export type InsuranceStatus = 'verified' | 'pending' | 'expired' | 'none';

/**
 * Communication preferences
 */
export type CommunicationChannel = 'whatsapp' | 'sms' | 'email' | 'phone';

/**
 * Consent status for various purposes
 */
export type ConsentStatus = 'granted' | 'denied' | 'pending' | 'expired';

// ============================================================================
// PATIENT LIFECYCLE EVENTS
// ============================================================================

/**
 * PatientRegistered - Emitted when a lead is converted to a patient
 */
export interface PatientRegisteredPayload {
  readonly leadId: string;
  readonly phone: string;
  readonly email?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth?: string; // ISO 8601
  readonly conversionProcedure: string;
  readonly assignedProviderId?: string;
  readonly source: 'lead_conversion' | 'direct_registration' | 'referral' | 'transfer';
  readonly hubspotContactId?: string;
  readonly initialAppointmentId?: string;
}

export type PatientRegisteredEvent = DomainEvent<'patient.registered', PatientRegisteredPayload>;

/**
 * PatientActivated - Emitted when patient becomes active (first appointment completed)
 */
export interface PatientActivatedPayload {
  readonly phone: string;
  readonly activationReason: string;
  readonly firstAppointmentId?: string;
  readonly primaryProviderId?: string;
}

export type PatientActivatedEvent = DomainEvent<'patient.activated', PatientActivatedPayload>;

/**
 * PatientStatusChanged - Emitted when patient status changes
 */
export interface PatientStatusChangedPayload {
  readonly phone: string;
  readonly previousStatus: PatientStatus;
  readonly newStatus: PatientStatus;
  readonly reason?: string;
  readonly changedBy?: string;
}

export type PatientStatusChangedEvent = DomainEvent<
  'patient.status_changed',
  PatientStatusChangedPayload
>;

/**
 * PatientDemographicsUpdated - Emitted when patient demographics are updated
 */
export interface PatientDemographicsUpdatedPayload {
  readonly phone: string;
  readonly previousValues: {
    readonly firstName?: string;
    readonly lastName?: string;
    readonly email?: string;
    readonly dateOfBirth?: string;
    readonly address?: string;
    readonly city?: string;
    readonly county?: string;
  };
  readonly newValues: {
    readonly firstName?: string;
    readonly lastName?: string;
    readonly email?: string;
    readonly dateOfBirth?: string;
    readonly address?: string;
    readonly city?: string;
    readonly county?: string;
  };
  readonly updatedBy?: string;
}

export type PatientDemographicsUpdatedEvent = DomainEvent<
  'patient.demographics_updated',
  PatientDemographicsUpdatedPayload
>;

/**
 * PatientDeactivated - Emitted when patient becomes inactive
 */
export interface PatientDeactivatedPayload {
  readonly phone: string;
  readonly reason: 'no_activity' | 'patient_request' | 'moved_away' | 'other';
  readonly reasonDetails?: string;
  readonly lastActivityAt?: string;
  readonly reactivationEligible: boolean;
}

export type PatientDeactivatedEvent = DomainEvent<'patient.deactivated', PatientDeactivatedPayload>;

/**
 * PatientArchived - Emitted when patient is archived (GDPR or retention policy)
 */
export interface PatientArchivedPayload {
  readonly phone: string;
  readonly reason: 'gdpr_request' | 'retention_policy' | 'deceased' | 'duplicate' | 'other';
  readonly reasonDetails?: string;
  readonly retentionUntil?: string; // ISO 8601
  readonly archivedBy?: string;
}

export type PatientArchivedEvent = DomainEvent<'patient.archived', PatientArchivedPayload>;

// ============================================================================
// MEDICAL HISTORY EVENTS
// ============================================================================

/**
 * PatientMedicalHistoryAdded - Emitted when medical history is added
 */
export interface PatientMedicalHistoryAddedPayload {
  readonly phone: string;
  readonly conditionType: 'chronic' | 'acute' | 'surgical' | 'allergy' | 'medication';
  readonly description: string;
  readonly diagnosedAt?: string;
  readonly severity?: 'mild' | 'moderate' | 'severe';
  readonly currentStatus: 'active' | 'resolved' | 'managed';
  readonly addedBy?: string;
}

export type PatientMedicalHistoryAddedEvent = DomainEvent<
  'patient.medical_history_added',
  PatientMedicalHistoryAddedPayload
>;

/**
 * PatientAllergyRecorded - Emitted when an allergy is recorded
 */
export interface PatientAllergyRecordedPayload {
  readonly phone: string;
  readonly allergen: string;
  readonly severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  readonly reaction: string;
  readonly verifiedBy?: string;
}

export type PatientAllergyRecordedEvent = DomainEvent<
  'patient.allergy_recorded',
  PatientAllergyRecordedPayload
>;

// ============================================================================
// TREATMENT EVENTS
// ============================================================================

/**
 * PatientTreatmentStarted - Emitted when a treatment plan begins
 */
export interface PatientTreatmentStartedPayload {
  readonly phone: string;
  readonly treatmentPlanId: string;
  readonly procedureType: string;
  readonly providerId: string;
  readonly estimatedCompletionDate?: string;
  readonly estimatedCost?: number;
  readonly phases?: readonly string[];
}

export type PatientTreatmentStartedEvent = DomainEvent<
  'patient.treatment_started',
  PatientTreatmentStartedPayload
>;

/**
 * PatientTreatmentCompleted - Emitted when a treatment plan is completed
 */
export interface PatientTreatmentCompletedPayload {
  readonly phone: string;
  readonly treatmentPlanId: string;
  readonly procedureType: string;
  readonly providerId: string;
  readonly completedAt: string;
  readonly outcome: 'successful' | 'partial' | 'complications';
  readonly followUpRequired: boolean;
  readonly followUpScheduledFor?: string;
}

export type PatientTreatmentCompletedEvent = DomainEvent<
  'patient.treatment_completed',
  PatientTreatmentCompletedPayload
>;

/**
 * PatientTreatmentCancelled - Emitted when a treatment plan is cancelled
 */
export interface PatientTreatmentCancelledPayload {
  readonly phone: string;
  readonly treatmentPlanId: string;
  readonly reason: 'patient_request' | 'medical_contraindication' | 'financial' | 'other';
  readonly reasonDetails?: string;
  readonly cancelledBy?: string;
}

export type PatientTreatmentCancelledEvent = DomainEvent<
  'patient.treatment_cancelled',
  PatientTreatmentCancelledPayload
>;

// ============================================================================
// APPOINTMENT EVENTS
// ============================================================================

/**
 * PatientAppointmentScheduled - Emitted when appointment is scheduled
 */
export interface PatientAppointmentScheduledPayload {
  readonly phone: string;
  readonly appointmentId: string;
  readonly appointmentType: string;
  readonly scheduledFor: string; // ISO 8601
  readonly duration: number; // minutes
  readonly providerId: string;
  readonly location?: string;
  readonly isFollowUp: boolean;
  readonly treatmentPlanId?: string;
}

export type PatientAppointmentScheduledEvent = DomainEvent<
  'patient.appointment_scheduled',
  PatientAppointmentScheduledPayload
>;

/**
 * PatientAppointmentCompleted - Emitted when appointment is completed
 */
export interface PatientAppointmentCompletedPayload {
  readonly phone: string;
  readonly appointmentId: string;
  readonly completedAt: string;
  readonly providerId: string;
  readonly notes?: string;
  readonly nextAppointmentScheduled: boolean;
  readonly nextAppointmentId?: string;
}

export type PatientAppointmentCompletedEvent = DomainEvent<
  'patient.appointment_completed',
  PatientAppointmentCompletedPayload
>;

/**
 * PatientAppointmentCancelled - Emitted when appointment is cancelled
 */
export interface PatientAppointmentCancelledPayload {
  readonly phone: string;
  readonly appointmentId: string;
  readonly reason: string;
  readonly cancelledBy: 'patient' | 'clinic' | 'provider' | 'system';
  readonly rescheduled: boolean;
  readonly newAppointmentId?: string;
  readonly lateCancellation: boolean;
}

export type PatientAppointmentCancelledEvent = DomainEvent<
  'patient.appointment_cancelled',
  PatientAppointmentCancelledPayload
>;

/**
 * PatientNoShow - Emitted when patient doesn't show for appointment
 */
export interface PatientNoShowPayload {
  readonly phone: string;
  readonly appointmentId: string;
  readonly scheduledFor: string;
  readonly providerId: string;
  readonly attemptedContact: boolean;
  readonly contactResult?: string;
  readonly noShowCount: number; // Running count for this patient
}

export type PatientNoShowEvent = DomainEvent<'patient.no_show', PatientNoShowPayload>;

// ============================================================================
// INSURANCE EVENTS
// ============================================================================

/**
 * PatientInsuranceAdded - Emitted when insurance is added
 */
export interface PatientInsuranceAddedPayload {
  readonly phone: string;
  readonly insuranceId: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly policyNumber: string;
  readonly groupNumber?: string;
  readonly coverageType: 'full' | 'partial' | 'dental_only';
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly verifiedAt?: string;
}

export type PatientInsuranceAddedEvent = DomainEvent<
  'patient.insurance_added',
  PatientInsuranceAddedPayload
>;

/**
 * PatientInsuranceVerified - Emitted when insurance is verified
 */
export interface PatientInsuranceVerifiedPayload {
  readonly phone: string;
  readonly insuranceId: string;
  readonly verificationStatus: 'active' | 'expired' | 'invalid';
  readonly coverageDetails?: {
    readonly deductible?: number;
    readonly remainingDeductible?: number;
    readonly annualMaximum?: number;
    readonly remainingMaximum?: number;
  };
  readonly verifiedBy?: string;
}

export type PatientInsuranceVerifiedEvent = DomainEvent<
  'patient.insurance_verified',
  PatientInsuranceVerifiedPayload
>;

// ============================================================================
// CONSENT EVENTS
// ============================================================================

/**
 * PatientConsentGranted - Emitted when patient grants consent
 */
export interface PatientConsentGrantedPayload {
  readonly phone: string;
  readonly consentType: 'treatment' | 'marketing' | 'data_sharing' | 'research' | 'communication';
  readonly scope: string;
  readonly grantedAt: string;
  readonly expiresAt?: string;
  readonly method: 'written' | 'verbal' | 'electronic';
  readonly witnessedBy?: string;
}

export type PatientConsentGrantedEvent = DomainEvent<
  'patient.consent_granted',
  PatientConsentGrantedPayload
>;

/**
 * PatientConsentRevoked - Emitted when patient revokes consent
 */
export interface PatientConsentRevokedPayload {
  readonly phone: string;
  readonly consentType: 'treatment' | 'marketing' | 'data_sharing' | 'research' | 'communication';
  readonly revokedAt: string;
  readonly reason?: string;
  readonly effectiveImmediately: boolean;
}

export type PatientConsentRevokedEvent = DomainEvent<
  'patient.consent_revoked',
  PatientConsentRevokedPayload
>;

// ============================================================================
// COMMUNICATION EVENTS
// ============================================================================

/**
 * PatientPreferencesUpdated - Emitted when patient preferences are updated
 */
export interface PatientPreferencesUpdatedPayload {
  readonly phone: string;
  readonly preferredLanguage?: 'ro' | 'en' | 'de';
  readonly preferredChannel?: CommunicationChannel;
  readonly preferredContactTime?: 'morning' | 'afternoon' | 'evening' | 'any';
  readonly doNotContact?: boolean;
  readonly specialInstructions?: string;
}

export type PatientPreferencesUpdatedEvent = DomainEvent<
  'patient.preferences_updated',
  PatientPreferencesUpdatedPayload
>;

/**
 * PatientContacted - Emitted when patient is contacted
 */
export interface PatientContactedPayload {
  readonly phone: string;
  readonly channel: CommunicationChannel;
  readonly direction: 'inbound' | 'outbound';
  readonly purpose: 'appointment_reminder' | 'follow_up' | 'billing' | 'general' | 'emergency';
  readonly outcome: 'reached' | 'voicemail' | 'no_answer' | 'busy' | 'wrong_number';
  readonly notes?: string;
  readonly contactedBy?: string;
}

export type PatientContactedEvent = DomainEvent<'patient.contacted', PatientContactedPayload>;

// ============================================================================
// PROVIDER ASSIGNMENT EVENTS
// ============================================================================

/**
 * PatientProviderAssigned - Emitted when a provider is assigned to patient
 */
export interface PatientProviderAssignedPayload {
  readonly phone: string;
  readonly providerId: string;
  readonly providerRole: 'primary' | 'specialist' | 'hygienist' | 'consultant';
  readonly assignedBy?: string;
  readonly reason?: string;
  readonly effectiveFrom: string;
}

export type PatientProviderAssignedEvent = DomainEvent<
  'patient.provider_assigned',
  PatientProviderAssignedPayload
>;

// ============================================================================
// UNION TYPE FOR ALL PATIENT EVENTS
// ============================================================================

/**
 * Union of all patient domain events
 */
export type PatientDomainEvent =
  | PatientRegisteredEvent
  | PatientActivatedEvent
  | PatientStatusChangedEvent
  | PatientDemographicsUpdatedEvent
  | PatientDeactivatedEvent
  | PatientArchivedEvent
  | PatientMedicalHistoryAddedEvent
  | PatientAllergyRecordedEvent
  | PatientTreatmentStartedEvent
  | PatientTreatmentCompletedEvent
  | PatientTreatmentCancelledEvent
  | PatientAppointmentScheduledEvent
  | PatientAppointmentCompletedEvent
  | PatientAppointmentCancelledEvent
  | PatientNoShowEvent
  | PatientInsuranceAddedEvent
  | PatientInsuranceVerifiedEvent
  | PatientConsentGrantedEvent
  | PatientConsentRevokedEvent
  | PatientPreferencesUpdatedEvent
  | PatientContactedEvent
  | PatientProviderAssignedEvent;

/**
 * Event type discriminator
 */
export type PatientEventType = PatientDomainEvent['type'];

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Create PatientRegistered event
 */
export function createPatientRegisteredEvent(
  aggregateId: string,
  payload: PatientRegisteredPayload,
  metadata: EventMetadata
): PatientRegisteredEvent {
  return {
    type: 'patient.registered',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create PatientActivated event
 */
export function createPatientActivatedEvent(
  aggregateId: string,
  payload: PatientActivatedPayload,
  metadata: EventMetadata
): PatientActivatedEvent {
  return {
    type: 'patient.activated',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create PatientStatusChanged event
 */
export function createPatientStatusChangedEvent(
  aggregateId: string,
  payload: PatientStatusChangedPayload,
  metadata: EventMetadata
): PatientStatusChangedEvent {
  return {
    type: 'patient.status_changed',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create PatientTreatmentStarted event
 */
export function createPatientTreatmentStartedEvent(
  aggregateId: string,
  payload: PatientTreatmentStartedPayload,
  metadata: EventMetadata
): PatientTreatmentStartedEvent {
  return {
    type: 'patient.treatment_started',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create PatientTreatmentCompleted event
 */
export function createPatientTreatmentCompletedEvent(
  aggregateId: string,
  payload: PatientTreatmentCompletedPayload,
  metadata: EventMetadata
): PatientTreatmentCompletedEvent {
  return {
    type: 'patient.treatment_completed',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create PatientAppointmentScheduled event
 */
export function createPatientAppointmentScheduledEvent(
  aggregateId: string,
  payload: PatientAppointmentScheduledPayload,
  metadata: EventMetadata
): PatientAppointmentScheduledEvent {
  return {
    type: 'patient.appointment_scheduled',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

/**
 * Create PatientAppointmentCompleted event
 */
export function createPatientAppointmentCompletedEvent(
  aggregateId: string,
  payload: PatientAppointmentCompletedPayload,
  metadata: EventMetadata
): PatientAppointmentCompletedEvent {
  return {
    type: 'patient.appointment_completed',
    aggregateId,
    aggregateType: 'Patient',
    metadata,
    payload,
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for PatientRegistered event
 */
export function isPatientRegisteredEvent(
  event: PatientDomainEvent
): event is PatientRegisteredEvent {
  return event.type === 'patient.registered';
}

/**
 * Type guard for PatientActivated event
 */
export function isPatientActivatedEvent(event: PatientDomainEvent): event is PatientActivatedEvent {
  return event.type === 'patient.activated';
}

/**
 * Type guard for PatientStatusChanged event
 */
export function isPatientStatusChangedEvent(
  event: PatientDomainEvent
): event is PatientStatusChangedEvent {
  return event.type === 'patient.status_changed';
}

/**
 * Type guard for PatientTreatmentStarted event
 */
export function isPatientTreatmentStartedEvent(
  event: PatientDomainEvent
): event is PatientTreatmentStartedEvent {
  return event.type === 'patient.treatment_started';
}

/**
 * Type guard for PatientTreatmentCompleted event
 */
export function isPatientTreatmentCompletedEvent(
  event: PatientDomainEvent
): event is PatientTreatmentCompletedEvent {
  return event.type === 'patient.treatment_completed';
}

/**
 * Type guard for PatientAppointmentScheduled event
 */
export function isPatientAppointmentScheduledEvent(
  event: PatientDomainEvent
): event is PatientAppointmentScheduledEvent {
  return event.type === 'patient.appointment_scheduled';
}

/**
 * Type guard for lifecycle events
 */
export function isPatientLifecycleEvent(event: PatientDomainEvent): boolean {
  return [
    'patient.registered',
    'patient.activated',
    'patient.status_changed',
    'patient.deactivated',
    'patient.archived',
  ].includes(event.type);
}

/**
 * Type guard for treatment events
 */
export function isPatientTreatmentEvent(event: PatientDomainEvent): boolean {
  return [
    'patient.treatment_started',
    'patient.treatment_completed',
    'patient.treatment_cancelled',
  ].includes(event.type);
}

/**
 * Type guard for appointment events
 */
export function isPatientAppointmentEvent(event: PatientDomainEvent): boolean {
  return [
    'patient.appointment_scheduled',
    'patient.appointment_completed',
    'patient.appointment_cancelled',
    'patient.no_show',
  ].includes(event.type);
}
