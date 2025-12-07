/**
 * @fileoverview Patient Factory
 *
 * Factory for creating and reconstituting Patient aggregates.
 * Supports both fresh creation and event-sourced reconstitution.
 *
 * @module domain/patients/factories/PatientFactory
 *
 * DESIGN PRINCIPLES:
 * 1. ENCAPSULATED CREATION - Aggregate creation logic in one place
 * 2. EVENT SOURCING SUPPORT - Reconstitute from event history
 * 3. SNAPSHOT SUPPORT - Restore from snapshots for performance
 */

import {
  PatientAggregateRoot,
  type PatientAggregateState,
  type PatientDomainEvent,
  type FromLeadConversionParams,
  type CreatePatientParams,
  type PatientPreferences,
  type MedicalHistoryEntry,
  type AllergyRecord,
  type TreatmentPlanReference,
  type AppointmentReference,
  type InsuranceInfo,
  type ConsentRecord,
  type ProviderAssignment,
} from '../entities/Patient.js';
import { PhoneNumber } from '../../shared-kernel/value-objects/phone-number.js';
import type { PatientStatus } from '../events/patient-events.js';

// ============================================================================
// PATIENT FACTORY
// ============================================================================

/**
 * Factory for creating Patient aggregates
 *
 * Provides centralized construction of Patient aggregates with:
 * - Fresh creation from lead conversion
 * - Direct registration
 * - Reconstitution from event history
 * - Restoration from snapshots
 * - Hydration from database records
 *
 * @example
 * ```typescript
 * const factory = new PatientFactory();
 *
 * // Create from lead conversion
 * const patient = factory.fromLeadConversion({
 *   id: 'patient-123',
 *   leadId: 'lead-456',
 *   phone: PhoneNumber.create('+40700000001'),
 *   firstName: 'Ion',
 *   lastName: 'Popescu',
 *   conversionProcedure: 'dental_implant',
 * });
 *
 * // Reconstitute from events
 * const reconstituted = factory.reconstitute('patient-123', events);
 *
 * // Hydrate from database record
 * const hydrated = factory.fromDatabaseRecord(dbRecord);
 * ```
 */
export class PatientFactory {
  /**
   * Create a Patient from lead conversion
   *
   * @param params - Lead conversion parameters
   * @param correlationId - Optional correlation ID for tracing
   * @returns New PatientAggregateRoot instance
   */
  fromLeadConversion(
    params: FromLeadConversionParams,
    correlationId?: string
  ): PatientAggregateRoot {
    return PatientAggregateRoot.fromLeadConversion(params, correlationId);
  }

  /**
   * Create a new Patient directly (walk-in, referral, etc.)
   *
   * @param params - Creation parameters
   * @param correlationId - Optional correlation ID for tracing
   * @returns New PatientAggregateRoot instance
   */
  create(params: CreatePatientParams, correlationId?: string): PatientAggregateRoot {
    return PatientAggregateRoot.create(params, correlationId);
  }

  /**
   * Create a new Patient with generated ID
   *
   * @param params - Creation parameters without ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns New PatientAggregateRoot instance
   */
  createWithGeneratedId(
    params: Omit<CreatePatientParams, 'id'>,
    correlationId?: string
  ): PatientAggregateRoot {
    const id = this.generateId();
    return PatientAggregateRoot.create({ ...params, id }, correlationId);
  }

  /**
   * Create a Patient from lead conversion with generated ID
   *
   * @param params - Lead conversion parameters without patient ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns New PatientAggregateRoot instance
   */
  fromLeadConversionWithGeneratedId(
    params: Omit<FromLeadConversionParams, 'id'>,
    correlationId?: string
  ): PatientAggregateRoot {
    const id = this.generateId();
    return PatientAggregateRoot.fromLeadConversion({ ...params, id }, correlationId);
  }

  /**
   * Reconstitute a Patient from event history (event sourcing)
   *
   * @param id - Patient aggregate ID
   * @param events - Domain events to replay
   * @returns Reconstituted PatientAggregateRoot
   */
  reconstitute(id: string, events: PatientDomainEvent[]): PatientAggregateRoot {
    return PatientAggregateRoot.fromEvents(id, events);
  }

  /**
   * Restore a Patient from a snapshot
   *
   * @param snapshot - Aggregate snapshot
   * @param eventsSinceSnapshot - Events since the snapshot was taken
   * @returns Restored PatientAggregateRoot
   */
  fromSnapshot(
    snapshot: PatientAggregateSnapshot,
    eventsSinceSnapshot: PatientDomainEvent[] = []
  ): PatientAggregateRoot {
    const state = this.snapshotToState(snapshot);
    const patient = PatientAggregateRoot.reconstitute(state);

    // Apply any events that occurred after the snapshot
    if (eventsSinceSnapshot.length > 0) {
      patient.loadFromHistory(eventsSinceSnapshot);
    }

    return patient;
  }

  /**
   * Hydrate a Patient from a database record
   *
   * @param record - Patient database record
   * @returns Hydrated PatientAggregateRoot
   */
  fromDatabaseRecord(record: PatientRecord): PatientAggregateRoot {
    const state: PatientAggregateState = {
      id: record.id,
      version: record.version,
      leadId: record.leadId,
      phone: record.phone,
      email: record.email,
      hubspotContactId: record.hubspotContactId,
      firstName: record.firstName,
      lastName: record.lastName,
      dateOfBirth: record.dateOfBirth,
      address: record.address,
      city: record.city,
      county: record.county,
      status: record.status,
      registeredAt: record.registeredAt,
      activatedAt: record.activatedAt,
      deactivatedAt: record.deactivatedAt,
      archivedAt: record.archivedAt,
      medicalHistory: record.medicalHistory,
      allergies: record.allergies,
      treatmentPlans: record.treatmentPlans,
      appointments: record.appointments,
      noShowCount: record.noShowCount,
      insuranceInfo: record.insuranceInfo,
      consents: record.consents,
      assignedProviders: record.assignedProviders,
      primaryProviderId: record.primaryProviderId,
      preferences: record.preferences,
      source: record.source,
      conversionProcedure: record.conversionProcedure,
      lastContactAt: record.lastContactAt,
      lastAppointmentAt: record.lastAppointmentAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      isDeleted: record.isDeleted ?? false,
      deletedAt: record.deletedAt,
      deletionReason: record.deletionReason,
    };

    return PatientAggregateRoot.reconstitute(state);
  }

  /**
   * Create an empty Patient for reconstitution
   * Used internally by event-sourced repositories
   *
   * @param id - Patient ID
   * @returns Empty PatientAggregateRoot ready for event replay
   */
  createEmpty(id: string): PatientAggregateRoot {
    return PatientAggregateRoot.fromEvents(id, []);
  }

  // ============================================================================
  // SNAPSHOT SUPPORT
  // ============================================================================

  /**
   * Create a snapshot from a Patient aggregate
   *
   * @param patient - Patient aggregate to snapshot
   * @returns Patient aggregate snapshot
   */
  createSnapshot(patient: PatientAggregateRoot): PatientAggregateSnapshot {
    const state = patient.getState();
    return {
      aggregateId: state.id,
      aggregateType: 'Patient',
      version: state.version,
      state: {
        leadId: state.leadId,
        phone: state.phone.e164,
        email: state.email,
        hubspotContactId: state.hubspotContactId,
        firstName: state.firstName,
        lastName: state.lastName,
        dateOfBirth: state.dateOfBirth?.toISOString(),
        address: state.address,
        city: state.city,
        county: state.county,
        status: state.status,
        registeredAt: state.registeredAt.toISOString(),
        activatedAt: state.activatedAt?.toISOString(),
        deactivatedAt: state.deactivatedAt?.toISOString(),
        archivedAt: state.archivedAt?.toISOString(),
        medicalHistory: state.medicalHistory.map((entry) => ({
          ...entry,
          diagnosedAt: entry.diagnosedAt?.toISOString(),
          addedAt: entry.addedAt.toISOString(),
        })),
        allergies: state.allergies.map((allergy) => ({
          ...allergy,
          verifiedAt: allergy.verifiedAt?.toISOString(),
        })),
        treatmentPlans: state.treatmentPlans.map((tp) => ({
          ...tp,
          startedAt: tp.startedAt.toISOString(),
          completedAt: tp.completedAt?.toISOString(),
        })),
        appointments: state.appointments.map((apt) => ({
          ...apt,
          scheduledFor: apt.scheduledFor.toISOString(),
        })),
        noShowCount: state.noShowCount,
        insuranceInfo: state.insuranceInfo
          ? {
              ...state.insuranceInfo,
              effectiveFrom: state.insuranceInfo.effectiveFrom.toISOString(),
              effectiveUntil: state.insuranceInfo.effectiveUntil?.toISOString(),
              verifiedAt: state.insuranceInfo.verifiedAt?.toISOString(),
            }
          : undefined,
        consents: Object.fromEntries(
          Object.entries(state.consents).map(([key, consent]) => [
            key,
            {
              ...consent,
              grantedAt: consent.grantedAt?.toISOString(),
              revokedAt: consent.revokedAt?.toISOString(),
              expiresAt: consent.expiresAt?.toISOString(),
            },
          ])
        ),
        assignedProviders: state.assignedProviders.map((provider) => ({
          ...provider,
          assignedAt: provider.assignedAt.toISOString(),
        })),
        primaryProviderId: state.primaryProviderId,
        preferences: state.preferences,
        source: state.source,
        conversionProcedure: state.conversionProcedure,
        lastContactAt: state.lastContactAt?.toISOString(),
        lastAppointmentAt: state.lastAppointmentAt?.toISOString(),
        createdAt: state.createdAt.toISOString(),
        updatedAt: state.updatedAt.toISOString(),
        isDeleted: state.isDeleted,
        deletedAt: state.deletedAt?.toISOString(),
        deletionReason: state.deletionReason,
      },
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate a unique Patient ID
   */
  private generateId(): string {
    return `patient-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Convert a snapshot to aggregate state
   */
  private snapshotToState(snapshot: PatientAggregateSnapshot): PatientAggregateState {
    const data = snapshot.state;
    return {
      id: snapshot.aggregateId,
      version: snapshot.version,
      leadId: data.leadId,
      phone: PhoneNumber.create(data.phone),
      email: data.email,
      hubspotContactId: data.hubspotContactId,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      address: data.address,
      city: data.city,
      county: data.county,
      status: data.status,
      registeredAt: new Date(data.registeredAt),
      activatedAt: data.activatedAt ? new Date(data.activatedAt) : undefined,
      deactivatedAt: data.deactivatedAt ? new Date(data.deactivatedAt) : undefined,
      archivedAt: data.archivedAt ? new Date(data.archivedAt) : undefined,
      medicalHistory: data.medicalHistory.map((entry) => ({
        ...entry,
        diagnosedAt: entry.diagnosedAt ? new Date(entry.diagnosedAt) : undefined,
        addedAt: new Date(entry.addedAt),
      })),
      allergies: data.allergies.map((allergy) => ({
        ...allergy,
        verifiedAt: allergy.verifiedAt ? new Date(allergy.verifiedAt) : undefined,
      })),
      treatmentPlans: data.treatmentPlans.map((tp) => ({
        ...tp,
        startedAt: new Date(tp.startedAt),
        completedAt: tp.completedAt ? new Date(tp.completedAt) : undefined,
      })),
      appointments: data.appointments.map((apt) => ({
        ...apt,
        scheduledFor: new Date(apt.scheduledFor),
      })),
      noShowCount: data.noShowCount,
      insuranceInfo: data.insuranceInfo
        ? {
            ...data.insuranceInfo,
            effectiveFrom: new Date(data.insuranceInfo.effectiveFrom),
            effectiveUntil: data.insuranceInfo.effectiveUntil
              ? new Date(data.insuranceInfo.effectiveUntil)
              : undefined,
            verifiedAt: data.insuranceInfo.verifiedAt
              ? new Date(data.insuranceInfo.verifiedAt)
              : undefined,
          }
        : undefined,
      consents: Object.fromEntries(
        Object.entries(data.consents).map(([key, consent]) => [
          key,
          {
            ...consent,
            grantedAt: consent.grantedAt ? new Date(consent.grantedAt) : undefined,
            revokedAt: consent.revokedAt ? new Date(consent.revokedAt) : undefined,
            expiresAt: consent.expiresAt ? new Date(consent.expiresAt) : undefined,
          },
        ])
      ),
      assignedProviders: data.assignedProviders.map((provider) => ({
        ...provider,
        assignedAt: new Date(provider.assignedAt),
      })),
      primaryProviderId: data.primaryProviderId,
      preferences: data.preferences,
      source: data.source,
      conversionProcedure: data.conversionProcedure,
      lastContactAt: data.lastContactAt ? new Date(data.lastContactAt) : undefined,
      lastAppointmentAt: data.lastAppointmentAt ? new Date(data.lastAppointmentAt) : undefined,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      isDeleted: data.isDeleted,
      deletedAt: data.deletedAt ? new Date(data.deletedAt) : undefined,
      deletionReason: data.deletionReason,
    };
  }
}

// ============================================================================
// SNAPSHOT TYPES
// ============================================================================

/**
 * Patient aggregate snapshot for persistence
 */
export interface PatientAggregateSnapshot {
  readonly aggregateId: string;
  readonly aggregateType: 'Patient';
  readonly version: number;
  readonly state: PatientSnapshotState;
  readonly createdAt: string;
}

/**
 * Serializable Patient state for snapshots
 */
export interface PatientSnapshotState {
  readonly leadId?: string;
  readonly phone: string;
  readonly email?: string;
  readonly hubspotContactId?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth?: string;
  readonly address?: string;
  readonly city?: string;
  readonly county?: string;
  readonly status: PatientStatus;
  readonly registeredAt: string;
  readonly activatedAt?: string;
  readonly deactivatedAt?: string;
  readonly archivedAt?: string;
  readonly medicalHistory: readonly SerializedMedicalHistoryEntry[];
  readonly allergies: readonly SerializedAllergyRecord[];
  readonly treatmentPlans: readonly SerializedTreatmentPlanReference[];
  readonly appointments: readonly SerializedAppointmentReference[];
  readonly noShowCount: number;
  readonly insuranceInfo?: SerializedInsuranceInfo;
  readonly consents: Record<string, SerializedConsentRecord>;
  readonly assignedProviders: readonly SerializedProviderAssignment[];
  readonly primaryProviderId?: string;
  readonly preferences: PatientPreferences;
  readonly source: 'lead_conversion' | 'direct_registration' | 'referral' | 'transfer';
  readonly conversionProcedure?: string;
  readonly lastContactAt?: string;
  readonly lastAppointmentAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isDeleted: boolean;
  readonly deletedAt?: string;
  readonly deletionReason?: string;
}

/**
 * Serialized medical history entry
 */
export interface SerializedMedicalHistoryEntry {
  readonly id: string;
  readonly conditionType: 'chronic' | 'acute' | 'surgical' | 'allergy' | 'medication';
  readonly description: string;
  readonly diagnosedAt?: string;
  readonly severity?: 'mild' | 'moderate' | 'severe';
  readonly currentStatus: 'active' | 'resolved' | 'managed';
  readonly addedAt: string;
}

/**
 * Serialized allergy record
 */
export interface SerializedAllergyRecord {
  readonly id: string;
  readonly allergen: string;
  readonly severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  readonly reaction: string;
  readonly verifiedAt?: string;
}

/**
 * Serialized treatment plan reference
 */
export interface SerializedTreatmentPlanReference {
  readonly id: string;
  readonly procedureType: string;
  readonly providerId: string;
  readonly status: 'active' | 'completed' | 'cancelled';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly outcome?: 'successful' | 'partial' | 'complications';
}

/**
 * Serialized appointment reference
 */
export interface SerializedAppointmentReference {
  readonly id: string;
  readonly appointmentType: string;
  readonly scheduledFor: string;
  readonly duration: number;
  readonly providerId: string;
  readonly status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  readonly isFollowUp: boolean;
  readonly treatmentPlanId?: string;
}

/**
 * Serialized insurance info
 */
export interface SerializedInsuranceInfo {
  readonly id: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly policyNumber: string;
  readonly groupNumber?: string;
  readonly coverageType: 'full' | 'partial' | 'dental_only';
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly status: 'verified' | 'pending' | 'expired' | 'none';
  readonly verifiedAt?: string;
}

/**
 * Serialized consent record
 */
export interface SerializedConsentRecord {
  readonly type: 'treatment' | 'marketing' | 'data_sharing' | 'research' | 'communication';
  readonly status: 'granted' | 'denied' | 'pending' | 'expired';
  readonly grantedAt?: string;
  readonly revokedAt?: string;
  readonly expiresAt?: string;
  readonly method?: 'written' | 'verbal' | 'electronic';
}

/**
 * Serialized provider assignment
 */
export interface SerializedProviderAssignment {
  readonly providerId: string;
  readonly role: 'primary' | 'specialist' | 'hygienist' | 'consultant';
  readonly assignedAt: string;
}

/**
 * Patient database record interface
 */
export interface PatientRecord {
  readonly id: string;
  readonly version: number;
  readonly leadId?: string;
  readonly phone: PhoneNumber;
  readonly email?: string;
  readonly hubspotContactId?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth?: Date;
  readonly address?: string;
  readonly city?: string;
  readonly county?: string;
  readonly status: PatientStatus;
  readonly registeredAt: Date;
  readonly activatedAt?: Date;
  readonly deactivatedAt?: Date;
  readonly archivedAt?: Date;
  readonly medicalHistory: readonly MedicalHistoryEntry[];
  readonly allergies: readonly AllergyRecord[];
  readonly treatmentPlans: readonly TreatmentPlanReference[];
  readonly appointments: readonly AppointmentReference[];
  readonly noShowCount: number;
  readonly insuranceInfo?: InsuranceInfo;
  readonly consents: Record<string, ConsentRecord>;
  readonly assignedProviders: readonly ProviderAssignment[];
  readonly primaryProviderId?: string;
  readonly preferences: PatientPreferences;
  readonly source: 'lead_conversion' | 'direct_registration' | 'referral' | 'transfer';
  readonly conversionProcedure?: string;
  readonly lastContactAt?: Date;
  readonly lastAppointmentAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly isDeleted?: boolean;
  readonly deletedAt?: Date;
  readonly deletionReason?: string;
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Default PatientFactory instance
 */
export const patientFactory = new PatientFactory();
