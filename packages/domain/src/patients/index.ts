/**
 * @fileoverview Patient Bounded Context Exports
 *
 * Patient Aggregate Root and related DDD components.
 * Models the Lead → Patient transition and patient lifecycle.
 *
 * @module domain/patients
 *
 * This module provides:
 * - PatientAggregateRoot: The aggregate root for Patient lifecycle management
 * - PatientFactory: Factory for creating and reconstituting Patient aggregates
 * - Patient domain events: Strictly typed events for event sourcing
 * - Patient errors: Domain-specific error types
 *
 * LIFECYCLE:
 * Lead → [convert] → Patient(registered) → [activate] → Patient(active)
 *   → [startTreatment] → Patient(under_treatment)
 *   → [completeTreatment] → Patient(post_treatment)
 *   → [deactivate] → Patient(inactive)
 *   → [archive] → Patient(archived)
 *
 * @example
 * ```typescript
 * import {
 *   PatientAggregateRoot,
 *   PatientFactory,
 *   patientFactory,
 * } from '@medicalcor/domain/patients';
 *
 * // Convert lead to patient
 * const patient = patientFactory.fromLeadConversion({
 *   id: 'patient-123',
 *   leadId: 'lead-456',
 *   phone: PhoneNumber.create('+40700000001'),
 *   firstName: 'Ion',
 *   lastName: 'Popescu',
 *   conversionProcedure: 'dental_implant',
 * });
 *
 * // Activate after first appointment
 * patient.activate('First consultation completed', 'apt-789');
 *
 * // Start treatment
 * patient.startTreatment({
 *   treatmentPlanId: 'plan-abc',
 *   procedureType: 'all_on_4',
 *   providerId: 'dr-smith',
 * });
 *
 * // Get events for persistence
 * const events = patient.getUncommittedEvents();
 * ```
 */

// Entities
export {
  PatientAggregateRoot,
  type PatientAggregateState,
  type PatientDomainEvent,
  type MedicalHistoryEntry,
  type AllergyRecord,
  type TreatmentPlanReference,
  type AppointmentReference,
  type InsuranceInfo,
  type ConsentRecord,
  type ProviderAssignment,
  type PatientPreferences,
  type FromLeadConversionParams,
  type CreatePatientParams,
  type StartTreatmentParams,
  type CompleteTreatmentParams,
  type ScheduleAppointmentParams,
  type UpdateDemographicsParams,
  // Errors
  PatientError,
  PatientDeletedError,
  PatientArchivedError,
  PatientNotActiveError,
  InvalidPatientStatusTransitionError,
} from './entities/index.js';

// Factories
export {
  PatientFactory,
  patientFactory,
  type PatientAggregateSnapshot,
  type PatientSnapshotState,
  type SerializedMedicalHistoryEntry,
  type SerializedAllergyRecord,
  type SerializedTreatmentPlanReference,
  type SerializedAppointmentReference,
  type SerializedInsuranceInfo,
  type SerializedConsentRecord,
  type SerializedProviderAssignment,
  type PatientRecord,
} from './factories/index.js';

// Events
export {
  // Status types
  type PatientStatus,
  type InsuranceStatus,
  type CommunicationChannel,
  type ConsentStatus,
  // Event payloads
  type PatientRegisteredPayload,
  type PatientActivatedPayload,
  type PatientStatusChangedPayload,
  type PatientDemographicsUpdatedPayload,
  type PatientDeactivatedPayload,
  type PatientArchivedPayload,
  type PatientMedicalHistoryAddedPayload,
  type PatientAllergyRecordedPayload,
  type PatientTreatmentStartedPayload,
  type PatientTreatmentCompletedPayload,
  type PatientTreatmentCancelledPayload,
  type PatientAppointmentScheduledPayload,
  type PatientAppointmentCompletedPayload,
  type PatientAppointmentCancelledPayload,
  type PatientNoShowPayload,
  type PatientInsuranceAddedPayload,
  type PatientInsuranceVerifiedPayload,
  type PatientConsentGrantedPayload,
  type PatientConsentRevokedPayload,
  type PatientPreferencesUpdatedPayload,
  type PatientContactedPayload,
  type PatientProviderAssignedPayload,
  // Event types
  type PatientRegisteredEvent,
  type PatientActivatedEvent,
  type PatientStatusChangedEvent,
  type PatientDemographicsUpdatedEvent,
  type PatientDeactivatedEvent,
  type PatientArchivedEvent,
  type PatientMedicalHistoryAddedEvent,
  type PatientAllergyRecordedEvent,
  type PatientTreatmentStartedEvent,
  type PatientTreatmentCompletedEvent,
  type PatientTreatmentCancelledEvent,
  type PatientAppointmentScheduledEvent,
  type PatientAppointmentCompletedEvent,
  type PatientAppointmentCancelledEvent,
  type PatientNoShowEvent,
  type PatientInsuranceAddedEvent,
  type PatientInsuranceVerifiedEvent,
  type PatientConsentGrantedEvent,
  type PatientConsentRevokedEvent,
  type PatientPreferencesUpdatedEvent,
  type PatientContactedEvent,
  type PatientProviderAssignedEvent,
  // Union type
  type PatientDomainEvent as PatientDomainEventUnion,
  type PatientEventType,
  // Factory functions
  createPatientRegisteredEvent,
  createPatientActivatedEvent,
  createPatientStatusChangedEvent,
  createPatientTreatmentStartedEvent,
  createPatientTreatmentCompletedEvent,
  createPatientAppointmentScheduledEvent,
  createPatientAppointmentCompletedEvent,
  // Type guards
  isPatientRegisteredEvent,
  isPatientActivatedEvent,
  isPatientStatusChangedEvent,
  isPatientTreatmentStartedEvent,
  isPatientTreatmentCompletedEvent,
  isPatientAppointmentScheduledEvent,
  isPatientLifecycleEvent,
  isPatientTreatmentEvent,
  isPatientAppointmentEvent,
} from './events/index.js';

// Insurance Verification
export {
  // Types
  type InsuranceVerificationInput,
  type ExternalVerificationResult,
  type CoverageDetails,
  type VerificationOutcome,
  type PreVerificationCheck,
  type PreVerificationErrorCode,
  type InsuranceVerificationConfig,
  // Constants
  DEFAULT_VERIFICATION_CONFIG,
  // Functions
  performPreVerificationChecks,
  processVerificationResult,
  shouldReVerify,
  calculateCoverageEstimate,
  isValidPolicyNumber,
  isValidGroupNumber,
  normalizePolicyNumber,
} from './insurance/index.js';
