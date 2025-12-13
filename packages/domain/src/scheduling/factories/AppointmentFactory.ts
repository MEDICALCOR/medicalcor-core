/**
 * @fileoverview Appointment Factory
 *
 * Factory for creating and reconstituting Appointment aggregates.
 * Supports both fresh creation and event-sourced reconstitution.
 *
 * @module domain/scheduling/factories/AppointmentFactory
 *
 * DESIGN PRINCIPLES:
 * 1. ENCAPSULATED CREATION - Aggregate creation logic in one place
 * 2. EVENT SOURCING SUPPORT - Reconstitute from event history
 * 3. SNAPSHOT SUPPORT - Restore from snapshots for performance
 */

import {
  AppointmentAggregateRoot,
  type AppointmentAggregateState,
  type AppointmentDomainEvent,
  type CreateAppointmentParams,
  type AppointmentStatus,
  type CancellationReason,
  type ActionInitiator,
  type ReminderRecord,
} from '../entities/Appointment.js';

// ============================================================================
// APPOINTMENT FACTORY
// ============================================================================

/**
 * Factory for creating Appointment aggregates
 *
 * Provides centralized construction of Appointment aggregates with:
 * - Fresh creation with validation
 * - Reconstitution from event history
 * - Restoration from snapshots
 * - Hydration from database records
 *
 * @example
 * ```typescript
 * const factory = new AppointmentFactory();
 *
 * // Create new appointment
 * const appointment = factory.create({
 *   id: 'apt-123',
 *   patientId: 'patient-456',
 *   clinicId: 'clinic-789',
 *   procedureType: 'consultation',
 *   scheduledFor: new Date(),
 *   duration: 30,
 * });
 *
 * // Reconstitute from events
 * const reconstituted = factory.reconstitute('apt-123', events);
 *
 * // Hydrate from database record
 * const hydrated = factory.fromDatabaseRecord(dbRecord);
 * ```
 */
export class AppointmentFactory {
  /**
   * Create a new Appointment aggregate
   *
   * @param params - Creation parameters
   * @param correlationId - Optional correlation ID for tracing
   * @returns New AppointmentAggregateRoot instance
   */
  create(params: CreateAppointmentParams, correlationId?: string): AppointmentAggregateRoot {
    return AppointmentAggregateRoot.create(params, correlationId);
  }

  /**
   * Create a new Appointment with generated ID
   *
   * @param params - Creation parameters without ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns New AppointmentAggregateRoot instance
   */
  createWithGeneratedId(
    params: Omit<CreateAppointmentParams, 'id'>,
    correlationId?: string
  ): AppointmentAggregateRoot {
    const id = this.generateId();
    return AppointmentAggregateRoot.create({ ...params, id }, correlationId);
  }

  /**
   * Reconstitute an Appointment from event history (event sourcing)
   *
   * @param id - Appointment aggregate ID
   * @param events - Domain events to replay
   * @returns Reconstituted AppointmentAggregateRoot
   */
  reconstitute(id: string, events: AppointmentDomainEvent[]): AppointmentAggregateRoot {
    return AppointmentAggregateRoot.fromEvents(id, events);
  }

  /**
   * Restore an Appointment from a snapshot
   *
   * @param snapshot - Aggregate snapshot
   * @param eventsSinceSnapshot - Events since the snapshot was taken
   * @returns Restored AppointmentAggregateRoot
   */
  fromSnapshot(
    snapshot: AppointmentAggregateSnapshot,
    eventsSinceSnapshot: AppointmentDomainEvent[] = []
  ): AppointmentAggregateRoot {
    const state = this.snapshotToState(snapshot);
    const appointment = AppointmentAggregateRoot.reconstitute(state);

    // Apply any events that occurred after the snapshot
    if (eventsSinceSnapshot.length > 0) {
      appointment.loadFromHistory(eventsSinceSnapshot);
    }

    return appointment;
  }

  /**
   * Hydrate an Appointment from a database record
   *
   * @param record - Appointment database record
   * @returns Hydrated AppointmentAggregateRoot
   */
  fromDatabaseRecord(record: AppointmentRecord): AppointmentAggregateRoot {
    const state: AppointmentAggregateState = {
      id: record.id,
      version: record.version,
      patientId: record.patientId,
      patientName: record.patientName,
      patientPhone: record.patientPhone,
      patientEmail: record.patientEmail,
      clinicId: record.clinicId,
      procedureType: record.procedureType,
      scheduledFor: record.scheduledFor,
      duration: record.duration,
      endTime: record.endTime,
      timeSlotId: record.timeSlotId,
      providerId: record.providerId,
      providerName: record.providerName,
      status: record.status,
      previousStatus: record.previousStatus,
      confirmedAt: record.confirmedAt,
      confirmedBy: record.confirmedBy,
      checkedInAt: record.checkedInAt,
      completedAt: record.completedAt,
      treatmentNotes: record.treatmentNotes,
      actualDuration: record.actualDuration,
      cancelledAt: record.cancelledAt,
      cancellationReason: record.cancellationReason,
      cancellationDetails: record.cancellationDetails,
      cancelledBy: record.cancelledBy,
      rescheduledFrom: record.rescheduledFrom,
      rescheduledTo: record.rescheduledTo,
      rescheduleCount: record.rescheduleCount,
      markedNoShowAt: record.markedNoShowAt,
      remindersSent: record.remindersSent,
      hubspotContactId: record.hubspotContactId,
      hubspotDealId: record.hubspotDealId,
      notes: record.notes,
      internalNotes: record.internalNotes,
      metadata: record.metadata,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      consentVerifiedAt: record.consentVerifiedAt,
      consentType: record.consentType,
    };

    return AppointmentAggregateRoot.reconstitute(state);
  }

  /**
   * Create an empty Appointment for reconstitution
   * Used internally by event-sourced repositories
   *
   * @param id - Appointment ID
   * @returns Empty AppointmentAggregateRoot ready for event replay
   */
  createEmpty(id: string): AppointmentAggregateRoot {
    return AppointmentAggregateRoot.fromEvents(id, []);
  }

  // ============================================================================
  // SNAPSHOT SUPPORT
  // ============================================================================

  /**
   * Create a snapshot from an Appointment aggregate
   *
   * @param appointment - Appointment aggregate to snapshot
   * @returns Appointment aggregate snapshot
   */
  createSnapshot(appointment: AppointmentAggregateRoot): AppointmentAggregateSnapshot {
    const state = appointment.getState();
    return {
      aggregateId: state.id,
      aggregateType: 'Appointment',
      version: state.version,
      state: {
        patientId: state.patientId,
        patientName: state.patientName,
        patientPhone: state.patientPhone,
        patientEmail: state.patientEmail,
        clinicId: state.clinicId,
        procedureType: state.procedureType,
        scheduledFor: state.scheduledFor.toISOString(),
        duration: state.duration,
        endTime: state.endTime.toISOString(),
        timeSlotId: state.timeSlotId,
        providerId: state.providerId,
        providerName: state.providerName,
        status: state.status,
        previousStatus: state.previousStatus,
        confirmedAt: state.confirmedAt?.toISOString(),
        confirmedBy: state.confirmedBy,
        checkedInAt: state.checkedInAt?.toISOString(),
        completedAt: state.completedAt?.toISOString(),
        treatmentNotes: state.treatmentNotes,
        actualDuration: state.actualDuration,
        cancelledAt: state.cancelledAt?.toISOString(),
        cancellationReason: state.cancellationReason,
        cancellationDetails: state.cancellationDetails,
        cancelledBy: state.cancelledBy,
        rescheduledFrom: state.rescheduledFrom,
        rescheduledTo: state.rescheduledTo,
        rescheduleCount: state.rescheduleCount,
        markedNoShowAt: state.markedNoShowAt?.toISOString(),
        remindersSent: state.remindersSent.map((r) => ({
          id: r.id,
          type: r.type,
          sentAt: r.sentAt.toISOString(),
          status: r.status,
          responseReceived: r.responseReceived,
        })),
        hubspotContactId: state.hubspotContactId,
        hubspotDealId: state.hubspotDealId,
        notes: state.notes,
        internalNotes: state.internalNotes,
        metadata: state.metadata,
        createdAt: state.createdAt.toISOString(),
        updatedAt: state.updatedAt.toISOString(),
        consentVerifiedAt: state.consentVerifiedAt?.toISOString(),
        consentType: state.consentType,
      },
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate a unique Appointment ID
   */
  private generateId(): string {
    return `apt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Convert a snapshot to aggregate state
   */
  private snapshotToState(snapshot: AppointmentAggregateSnapshot): AppointmentAggregateState {
    const data = snapshot.state;
    return {
      id: snapshot.aggregateId,
      version: snapshot.version,
      patientId: data.patientId,
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      patientEmail: data.patientEmail,
      clinicId: data.clinicId,
      procedureType: data.procedureType,
      scheduledFor: new Date(data.scheduledFor),
      duration: data.duration,
      endTime: new Date(data.endTime),
      timeSlotId: data.timeSlotId,
      providerId: data.providerId,
      providerName: data.providerName,
      status: data.status as AppointmentStatus,
      previousStatus: data.previousStatus as AppointmentStatus | undefined,
      confirmedAt: data.confirmedAt ? new Date(data.confirmedAt) : undefined,
      confirmedBy: data.confirmedBy,
      checkedInAt: data.checkedInAt ? new Date(data.checkedInAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      treatmentNotes: data.treatmentNotes,
      actualDuration: data.actualDuration,
      cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : undefined,
      cancellationReason: data.cancellationReason as CancellationReason | undefined,
      cancellationDetails: data.cancellationDetails,
      cancelledBy: data.cancelledBy as ActionInitiator | undefined,
      rescheduledFrom: data.rescheduledFrom,
      rescheduledTo: data.rescheduledTo,
      rescheduleCount: data.rescheduleCount,
      markedNoShowAt: data.markedNoShowAt ? new Date(data.markedNoShowAt) : undefined,
      remindersSent: data.remindersSent.map((r) => ({
        id: r.id,
        type: r.type as ReminderRecord['type'],
        sentAt: new Date(r.sentAt),
        status: r.status as ReminderRecord['status'],
        responseReceived: r.responseReceived,
      })),
      hubspotContactId: data.hubspotContactId,
      hubspotDealId: data.hubspotDealId,
      notes: data.notes,
      internalNotes: data.internalNotes,
      metadata: data.metadata,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      consentVerifiedAt: data.consentVerifiedAt ? new Date(data.consentVerifiedAt) : undefined,
      consentType: data.consentType,
    };
  }
}

// ============================================================================
// SNAPSHOT TYPES
// ============================================================================

/**
 * Appointment aggregate snapshot for persistence
 */
export interface AppointmentAggregateSnapshot {
  readonly aggregateId: string;
  readonly aggregateType: 'Appointment';
  readonly version: number;
  readonly state: AppointmentSnapshotState;
  readonly createdAt: string;
}

/**
 * Serializable Appointment state for snapshots
 */
export interface AppointmentSnapshotState {
  readonly patientId: string;
  readonly patientName?: string;
  readonly patientPhone?: string;
  readonly patientEmail?: string;
  readonly clinicId: string;
  readonly procedureType: string;
  readonly scheduledFor: string;
  readonly duration: number;
  readonly endTime: string;
  readonly timeSlotId?: string;
  readonly providerId?: string;
  readonly providerName?: string;
  readonly status: string;
  readonly previousStatus?: string;
  readonly confirmedAt?: string;
  readonly confirmedBy?: string;
  readonly checkedInAt?: string;
  readonly completedAt?: string;
  readonly treatmentNotes?: string;
  readonly actualDuration?: number;
  readonly cancelledAt?: string;
  readonly cancellationReason?: string;
  readonly cancellationDetails?: string;
  readonly cancelledBy?: string;
  readonly rescheduledFrom?: string;
  readonly rescheduledTo?: string;
  readonly rescheduleCount: number;
  readonly markedNoShowAt?: string;
  readonly remindersSent: readonly SerializedReminderRecord[];
  readonly hubspotContactId?: string;
  readonly hubspotDealId?: string;
  readonly notes?: string;
  readonly internalNotes?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly consentVerifiedAt?: string;
  readonly consentType?: string;
}

/**
 * Serialized reminder record for snapshots
 */
export interface SerializedReminderRecord {
  readonly id: string;
  readonly type: string;
  readonly sentAt: string;
  readonly status: string;
  readonly responseReceived?: boolean;
}

/**
 * Appointment database record type
 * Represents the appointment as stored in the database
 */
export interface AppointmentRecord {
  readonly id: string;
  readonly version: number;
  readonly patientId: string;
  readonly patientName?: string;
  readonly patientPhone?: string;
  readonly patientEmail?: string;
  readonly clinicId: string;
  readonly procedureType: string;
  readonly scheduledFor: Date;
  readonly duration: number;
  readonly endTime: Date;
  readonly timeSlotId?: string;
  readonly providerId?: string;
  readonly providerName?: string;
  readonly status: AppointmentStatus;
  readonly previousStatus?: AppointmentStatus;
  readonly confirmedAt?: Date;
  readonly confirmedBy?: string;
  readonly checkedInAt?: Date;
  readonly completedAt?: Date;
  readonly treatmentNotes?: string;
  readonly actualDuration?: number;
  readonly cancelledAt?: Date;
  readonly cancellationReason?: CancellationReason;
  readonly cancellationDetails?: string;
  readonly cancelledBy?: ActionInitiator;
  readonly rescheduledFrom?: string;
  readonly rescheduledTo?: string;
  readonly rescheduleCount: number;
  readonly markedNoShowAt?: Date;
  readonly remindersSent: readonly ReminderRecord[];
  readonly hubspotContactId?: string;
  readonly hubspotDealId?: string;
  readonly notes?: string;
  readonly internalNotes?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly consentVerifiedAt?: Date;
  readonly consentType?: string;
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Default AppointmentFactory instance
 */
export const appointmentFactory = new AppointmentFactory();
