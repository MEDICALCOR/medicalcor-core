/**
 * @fileoverview Patient Entities Exports
 *
 * @module domain/patients/entities
 */

export {
  // Aggregate Root
  PatientAggregateRoot,
  // State types
  type PatientAggregateState,
  type MedicalHistoryEntry,
  type AllergyRecord,
  type TreatmentPlanReference,
  type AppointmentReference,
  type InsuranceInfo,
  type ConsentRecord,
  type ProviderAssignment,
  type PatientPreferences,
  // Event type
  type PatientDomainEvent,
  // Input types
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
} from './Patient.js';
