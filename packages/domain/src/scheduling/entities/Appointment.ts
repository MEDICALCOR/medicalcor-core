/**
 * @fileoverview Appointment Aggregate Root
 *
 * Banking/Medical Grade DDD Aggregate Root for Appointment lifecycle management.
 * This is the entry point for all Appointment-related domain operations.
 *
 * @module domain/scheduling/entities/Appointment
 *
 * DESIGN PRINCIPLES:
 * 1. AGGREGATE ROOT - All Appointment modifications go through this class
 * 2. INVARIANT ENFORCEMENT - Business rules are enforced here
 * 3. EVENT SOURCING - State changes emit domain events
 * 4. TELL DON'T ASK - Rich domain methods instead of anemic getters
 * 5. CONSENT VERIFICATION - GDPR/HIPAA mandatory consent checks
 *
 * USAGE:
 * ```typescript
 * // Create new appointment
 * const appointment = AppointmentAggregateRoot.create({
 *   id: 'apt-123',
 *   patientId: 'patient-456',
 *   clinicId: 'clinic-789',
 *   procedureType: 'consultation',
 *   scheduledFor: new Date(),
 *   duration: 30,
 * });
 *
 * // Confirm the appointment
 * appointment.confirm({ confirmedBy: 'staff-001' });
 *
 * // Get uncommitted events for persistence
 * const events = appointment.getUncommittedEvents();
 * ```
 */

// ============================================================================
// APPOINTMENT STATUS
// ============================================================================

/**
 * Appointment status enum
 */
export type AppointmentStatus =
  | 'REQUESTED' // Initial state - appointment request submitted
  | 'CONFIRMED' // Confirmed by clinic staff or patient
  | 'CHECKED_IN' // Patient has arrived
  | 'IN_PROGRESS' // Appointment is currently taking place
  | 'COMPLETED' // Appointment finished successfully
  | 'CANCELLED' // Cancelled by patient or clinic
  | 'NO_SHOW' // Patient did not show up
  | 'RESCHEDULED'; // Moved to a different time slot

/**
 * Cancellation reason types
 */
export type CancellationReason =
  | 'PATIENT_REQUEST'
  | 'CLINIC_REQUEST'
  | 'EMERGENCY'
  | 'NO_SHOW'
  | 'WEATHER'
  | 'EQUIPMENT_ISSUE'
  | 'PROVIDER_UNAVAILABLE'
  | 'OTHER';

/**
 * Who initiated an action
 */
export type ActionInitiator = 'PATIENT' | 'CLINIC' | 'SYSTEM' | 'PROVIDER';

// ============================================================================
// APPOINTMENT STATE
// ============================================================================

/**
 * Internal state for the Appointment aggregate
 */
export interface AppointmentAggregateState {
  readonly id: string;
  readonly version: number;

  // Patient & Clinic
  readonly patientId: string;
  readonly patientName?: string;
  readonly patientPhone?: string;
  readonly patientEmail?: string;
  readonly clinicId: string;

  // Appointment details
  readonly procedureType: string;
  readonly scheduledFor: Date;
  readonly duration: number; // in minutes
  readonly endTime: Date;
  readonly timeSlotId?: string;

  // Provider
  readonly providerId?: string;
  readonly providerName?: string;

  // Status tracking
  readonly status: AppointmentStatus;
  readonly previousStatus?: AppointmentStatus;

  // Confirmation details
  readonly confirmedAt?: Date;
  readonly confirmedBy?: string;

  // Check-in details
  readonly checkedInAt?: Date;

  // Completion details
  readonly completedAt?: Date;
  readonly treatmentNotes?: string;
  readonly actualDuration?: number;

  // Cancellation details
  readonly cancelledAt?: Date;
  readonly cancellationReason?: CancellationReason;
  readonly cancellationDetails?: string;
  readonly cancelledBy?: ActionInitiator;

  // Rescheduling
  readonly rescheduledFrom?: string; // Previous appointment ID
  readonly rescheduledTo?: string; // New appointment ID
  readonly rescheduleCount: number;

  // No-show tracking
  readonly markedNoShowAt?: Date;

  // Reminders
  readonly remindersSent: readonly ReminderRecord[];

  // HubSpot integration
  readonly hubspotContactId?: string;
  readonly hubspotDealId?: string;

  // Notes
  readonly notes?: string;
  readonly internalNotes?: string;

  // Metadata
  readonly metadata: Record<string, unknown>;

  // Timestamps
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // Consent tracking
  readonly consentVerifiedAt?: Date;
  readonly consentType?: string;
}

/**
 * Reminder record
 */
export interface ReminderRecord {
  readonly id: string;
  readonly type: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'VOICE';
  readonly sentAt: Date;
  readonly status: 'SENT' | 'DELIVERED' | 'FAILED';
  readonly responseReceived?: boolean;
}

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

export interface AppointmentDomainEvent<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly aggregateId: string;
  readonly aggregateType: 'Appointment';
  readonly version: number;
  readonly timestamp: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateAppointmentParams {
  readonly id: string;
  readonly patientId: string;
  readonly clinicId: string;
  readonly procedureType: string;
  readonly scheduledFor: Date;
  readonly duration: number;
  readonly patientName?: string;
  readonly patientPhone?: string;
  readonly patientEmail?: string;
  readonly providerId?: string;
  readonly providerName?: string;
  readonly timeSlotId?: string;
  readonly hubspotContactId?: string;
  readonly hubspotDealId?: string;
  readonly notes?: string;
  readonly metadata?: Record<string, unknown>;
  readonly rescheduledFrom?: string;
}

export interface ConfirmAppointmentParams {
  readonly confirmedBy: string;
  readonly sendConfirmation?: boolean;
}

export interface CancelAppointmentParams {
  readonly reason: CancellationReason;
  readonly details?: string;
  readonly cancelledBy: ActionInitiator;
  readonly notifyPatient?: boolean;
}

export interface RescheduleAppointmentParams {
  readonly newScheduledFor: Date;
  readonly newDuration?: number;
  readonly newProviderId?: string;
  readonly newTimeSlotId?: string;
  readonly reason?: string;
  readonly initiatedBy: ActionInitiator;
}

export interface CompleteAppointmentParams {
  readonly treatmentNotes?: string;
  readonly actualDuration?: number;
  readonly completedBy: string;
}

// ============================================================================
// APPOINTMENT AGGREGATE ROOT
// ============================================================================

/**
 * Appointment Aggregate Root
 *
 * Encapsulates all Appointment domain logic and enforces invariants.
 * All state changes are made through domain events.
 */
export class AppointmentAggregateRoot {
  private _state: AppointmentAggregateState;
  private _uncommittedEvents: AppointmentDomainEvent[] = [];

  private constructor(state: AppointmentAggregateState) {
    this._state = state;
  }

  // ============================================================================
  // ACCESSORS (Read-only state access)
  // ============================================================================

  get id(): string {
    return this._state.id;
  }

  get version(): number {
    return this._state.version;
  }

  get patientId(): string {
    return this._state.patientId;
  }

  get patientName(): string | undefined {
    return this._state.patientName;
  }

  get patientPhone(): string | undefined {
    return this._state.patientPhone;
  }

  get clinicId(): string {
    return this._state.clinicId;
  }

  get procedureType(): string {
    return this._state.procedureType;
  }

  get scheduledFor(): Date {
    return this._state.scheduledFor;
  }

  get duration(): number {
    return this._state.duration;
  }

  get endTime(): Date {
    return this._state.endTime;
  }

  get providerId(): string | undefined {
    return this._state.providerId;
  }

  get providerName(): string | undefined {
    return this._state.providerName;
  }

  get status(): AppointmentStatus {
    return this._state.status;
  }

  get hubspotContactId(): string | undefined {
    return this._state.hubspotContactId;
  }

  get hubspotDealId(): string | undefined {
    return this._state.hubspotDealId;
  }

  get createdAt(): Date {
    return this._state.createdAt;
  }

  get updatedAt(): Date {
    return this._state.updatedAt;
  }

  get remindersSent(): readonly ReminderRecord[] {
    return this._state.remindersSent;
  }

  get rescheduleCount(): number {
    return this._state.rescheduleCount;
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if appointment is in a modifiable state
   */
  canModify(): boolean {
    return !this.isTerminal();
  }

  /**
   * Check if appointment is in a terminal state
   */
  isTerminal(): boolean {
    return (
      this._state.status === 'COMPLETED' ||
      this._state.status === 'CANCELLED' ||
      this._state.status === 'NO_SHOW' ||
      this._state.status === 'RESCHEDULED'
    );
  }

  /**
   * Check if appointment can be confirmed
   */
  canConfirm(): boolean {
    return this._state.status === 'REQUESTED';
  }

  /**
   * Check if appointment can be cancelled
   */
  canCancel(): boolean {
    return (
      this._state.status === 'REQUESTED' ||
      this._state.status === 'CONFIRMED' ||
      this._state.status === 'CHECKED_IN'
    );
  }

  /**
   * Check if patient can check in
   */
  canCheckIn(): boolean {
    return this._state.status === 'CONFIRMED';
  }

  /**
   * Check if appointment can be started
   */
  canStart(): boolean {
    return this._state.status === 'CHECKED_IN';
  }

  /**
   * Check if appointment can be completed
   */
  canComplete(): boolean {
    return this._state.status === 'IN_PROGRESS';
  }

  /**
   * Check if appointment can be rescheduled
   */
  canReschedule(): boolean {
    return this._state.status === 'REQUESTED' || this._state.status === 'CONFIRMED';
  }

  /**
   * Check if patient is late (past scheduled time but not checked in)
   */
  isPatientLate(): boolean {
    if (this._state.status !== 'CONFIRMED') return false;
    return new Date() > this._state.scheduledFor;
  }

  /**
   * Check if appointment is upcoming (within 24 hours)
   */
  isUpcoming(): boolean {
    if (this.isTerminal()) return false;
    const now = new Date();
    const hoursUntil = (this._state.scheduledFor.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil > 0 && hoursUntil <= 24;
  }

  /**
   * Check if appointment is today
   */
  isToday(): boolean {
    const now = new Date();
    const scheduled = this._state.scheduledFor;
    return (
      now.getFullYear() === scheduled.getFullYear() &&
      now.getMonth() === scheduled.getMonth() &&
      now.getDate() === scheduled.getDate()
    );
  }

  /**
   * Get time until appointment in minutes
   */
  getMinutesUntilStart(): number {
    return Math.round((this._state.scheduledFor.getTime() - Date.now()) / (1000 * 60));
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new Appointment aggregate
   */
  static create(params: CreateAppointmentParams, correlationId?: string): AppointmentAggregateRoot {
    const now = new Date();
    const endTime = new Date(params.scheduledFor.getTime() + params.duration * 60 * 1000);

    const state: AppointmentAggregateState = {
      id: params.id,
      version: 0,
      patientId: params.patientId,
      patientName: params.patientName,
      patientPhone: params.patientPhone,
      patientEmail: params.patientEmail,
      clinicId: params.clinicId,
      procedureType: params.procedureType,
      scheduledFor: params.scheduledFor,
      duration: params.duration,
      endTime,
      timeSlotId: params.timeSlotId,
      providerId: params.providerId,
      providerName: params.providerName,
      status: 'REQUESTED',
      rescheduleCount: params.rescheduledFrom ? 1 : 0,
      rescheduledFrom: params.rescheduledFrom,
      remindersSent: [],
      hubspotContactId: params.hubspotContactId,
      hubspotDealId: params.hubspotDealId,
      notes: params.notes,
      metadata: params.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const appointment = new AppointmentAggregateRoot(state);

    appointment.raise(
      'appointment.created',
      {
        patientId: params.patientId,
        patientName: params.patientName,
        patientPhone: params.patientPhone,
        clinicId: params.clinicId,
        procedureType: params.procedureType,
        scheduledFor: params.scheduledFor.toISOString(),
        duration: params.duration,
        providerId: params.providerId,
        providerName: params.providerName,
        timeSlotId: params.timeSlotId,
        hubspotContactId: params.hubspotContactId,
        rescheduledFrom: params.rescheduledFrom,
      },
      correlationId
    );

    return appointment;
  }

  /**
   * Reconstitute an Appointment from existing state (for loading from DB)
   */
  static reconstitute(state: AppointmentAggregateState): AppointmentAggregateRoot {
    return new AppointmentAggregateRoot(state);
  }

  /**
   * Reconstitute an Appointment from event history (event sourcing)
   */
  static fromEvents(id: string, events: AppointmentDomainEvent[]): AppointmentAggregateRoot {
    const initialState: AppointmentAggregateState = {
      id,
      version: 0,
      patientId: '',
      clinicId: '',
      procedureType: '',
      scheduledFor: new Date(),
      duration: 0,
      endTime: new Date(),
      status: 'REQUESTED',
      rescheduleCount: 0,
      remindersSent: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const appointment = new AppointmentAggregateRoot(initialState);
    appointment.loadFromHistory(events);
    return appointment;
  }

  // ============================================================================
  // DOMAIN METHODS (State-changing operations)
  // ============================================================================

  /**
   * Confirm the appointment
   *
   * @throws AppointmentAlreadyConfirmedError if already confirmed
   * @throws InvalidAppointmentStatusTransitionError if status transition is invalid
   */
  confirm(params: ConfirmAppointmentParams, correlationId?: string): void {
    // Check if already confirmed before transition check for better error message
    if (this._state.status === 'CONFIRMED') {
      throw new AppointmentAlreadyConfirmedError(this._state.id);
    }

    this.ensureCanTransition('CONFIRMED');

    this.raise(
      'appointment.confirmed',
      {
        patientId: this._state.patientId,
        patientPhone: this._state.patientPhone,
        clinicId: this._state.clinicId,
        procedureType: this._state.procedureType,
        scheduledFor: this._state.scheduledFor.toISOString(),
        confirmedBy: params.confirmedBy,
        sendConfirmation: params.sendConfirmation ?? true,
        hubspotContactId: this._state.hubspotContactId,
      },
      correlationId
    );
  }

  /**
   * Record patient check-in
   *
   * @throws InvalidAppointmentStatusTransitionError if not in CONFIRMED status
   */
  checkIn(correlationId?: string): void {
    this.ensureCanTransition('CHECKED_IN');

    this.raise(
      'appointment.checked_in',
      {
        patientId: this._state.patientId,
        clinicId: this._state.clinicId,
        procedureType: this._state.procedureType,
        scheduledFor: this._state.scheduledFor.toISOString(),
        actualArrivalTime: new Date().toISOString(),
        minutesEarly: this.getMinutesUntilStart(),
      },
      correlationId
    );
  }

  /**
   * Start the appointment (provider begins the procedure)
   *
   * @throws InvalidAppointmentStatusTransitionError if not in CHECKED_IN status
   */
  start(correlationId?: string): void {
    this.ensureCanTransition('IN_PROGRESS');

    this.raise(
      'appointment.started',
      {
        patientId: this._state.patientId,
        clinicId: this._state.clinicId,
        procedureType: this._state.procedureType,
        providerId: this._state.providerId,
        startedAt: new Date().toISOString(),
      },
      correlationId
    );
  }

  /**
   * Complete the appointment
   *
   * @throws InvalidAppointmentStatusTransitionError if not in IN_PROGRESS status
   */
  complete(params: CompleteAppointmentParams, correlationId?: string): void {
    this.ensureCanTransition('COMPLETED');

    const completedAt = new Date();
    const actualDuration = params.actualDuration ?? this._state.duration;

    this.raise(
      'appointment.completed',
      {
        patientId: this._state.patientId,
        clinicId: this._state.clinicId,
        procedureType: this._state.procedureType,
        providerId: this._state.providerId,
        completedAt: completedAt.toISOString(),
        actualDuration,
        treatmentNotes: params.treatmentNotes,
        completedBy: params.completedBy,
        hubspotContactId: this._state.hubspotContactId,
        hubspotDealId: this._state.hubspotDealId,
      },
      correlationId
    );
  }

  /**
   * Cancel the appointment
   *
   * @throws AppointmentAlreadyCancelledError if already cancelled
   * @throws InvalidAppointmentStatusTransitionError if cannot be cancelled
   */
  cancel(params: CancelAppointmentParams, correlationId?: string): void {
    if (this._state.status === 'CANCELLED') {
      throw new AppointmentAlreadyCancelledError(this._state.id);
    }

    this.ensureCanTransition('CANCELLED');

    this.raise(
      'appointment.cancelled',
      {
        patientId: this._state.patientId,
        patientPhone: this._state.patientPhone,
        clinicId: this._state.clinicId,
        procedureType: this._state.procedureType,
        scheduledFor: this._state.scheduledFor.toISOString(),
        reason: params.reason,
        details: params.details,
        cancelledBy: params.cancelledBy,
        notifyPatient: params.notifyPatient ?? true,
        previousStatus: this._state.status,
        hubspotContactId: this._state.hubspotContactId,
      },
      correlationId
    );
  }

  /**
   * Mark patient as no-show
   *
   * @throws InvalidAppointmentStatusTransitionError if cannot mark as no-show
   */
  markNoShow(correlationId?: string): void {
    this.ensureCanTransition('NO_SHOW');

    this.raise(
      'appointment.no_show',
      {
        patientId: this._state.patientId,
        patientPhone: this._state.patientPhone,
        clinicId: this._state.clinicId,
        procedureType: this._state.procedureType,
        scheduledFor: this._state.scheduledFor.toISOString(),
        markedAt: new Date().toISOString(),
        hubspotContactId: this._state.hubspotContactId,
      },
      correlationId
    );
  }

  /**
   * Reschedule the appointment
   * This marks the current appointment as RESCHEDULED.
   * The caller should create a new appointment with the new details.
   *
   * @returns The new appointment ID to be used
   * @throws InvalidAppointmentStatusTransitionError if cannot be rescheduled
   * @throws MaxReschedulesExceededError if rescheduled too many times
   */
  reschedule(
    params: RescheduleAppointmentParams,
    newAppointmentId: string,
    correlationId?: string
  ): void {
    this.ensureCanTransition('RESCHEDULED');

    // Check reschedule limit (configurable, default 3)
    const maxReschedules = 3;
    if (this._state.rescheduleCount >= maxReschedules) {
      throw new MaxReschedulesExceededError(this._state.id, maxReschedules);
    }

    this.raise(
      'appointment.rescheduled',
      {
        patientId: this._state.patientId,
        patientPhone: this._state.patientPhone,
        clinicId: this._state.clinicId,
        procedureType: this._state.procedureType,
        previousScheduledFor: this._state.scheduledFor.toISOString(),
        newScheduledFor: params.newScheduledFor.toISOString(),
        newDuration: params.newDuration ?? this._state.duration,
        newProviderId: params.newProviderId ?? this._state.providerId,
        newAppointmentId,
        reason: params.reason,
        initiatedBy: params.initiatedBy,
        rescheduleCount: this._state.rescheduleCount + 1,
        hubspotContactId: this._state.hubspotContactId,
      },
      correlationId
    );
  }

  /**
   * Record that a reminder was sent
   */
  recordReminderSent(reminder: Omit<ReminderRecord, 'id'>, correlationId?: string): void {
    const reminderId = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    this.raise(
      'appointment.reminder_sent',
      {
        patientId: this._state.patientId,
        patientPhone: this._state.patientPhone,
        clinicId: this._state.clinicId,
        appointmentId: this._state.id,
        scheduledFor: this._state.scheduledFor.toISOString(),
        reminderId,
        reminderType: reminder.type,
        status: reminder.status,
        sentAt: reminder.sentAt.toISOString(),
      },
      correlationId
    );
  }

  /**
   * Update appointment notes
   */
  updateNotes(notes: string, internalNotes?: string, correlationId?: string): void {
    this.ensureCanModify();

    this.raise(
      'appointment.notes_updated',
      {
        appointmentId: this._state.id,
        notes,
        internalNotes,
        updatedAt: new Date().toISOString(),
      },
      correlationId
    );
  }

  /**
   * Assign or reassign a provider
   */
  assignProvider(providerId: string, providerName?: string, correlationId?: string): void {
    this.ensureCanModify();

    this.raise(
      'appointment.provider_assigned',
      {
        appointmentId: this._state.id,
        patientId: this._state.patientId,
        clinicId: this._state.clinicId,
        previousProviderId: this._state.providerId,
        newProviderId: providerId,
        providerName,
        assignedAt: new Date().toISOString(),
      },
      correlationId
    );
  }

  /**
   * Record consent verification (GDPR/HIPAA compliance)
   */
  recordConsentVerification(consentType: string, correlationId?: string): void {
    this.raise(
      'appointment.consent_verified',
      {
        appointmentId: this._state.id,
        patientId: this._state.patientId,
        clinicId: this._state.clinicId,
        consentType,
        verifiedAt: new Date().toISOString(),
      },
      correlationId
    );
  }

  // ============================================================================
  // EVENT SOURCING
  // ============================================================================

  /**
   * Get uncommitted events
   */
  getUncommittedEvents(): readonly AppointmentDomainEvent[] {
    return [...this._uncommittedEvents];
  }

  /**
   * Clear uncommitted events (after persistence)
   */
  clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }

  /**
   * Load state from event history
   */
  loadFromHistory(events: AppointmentDomainEvent[]): void {
    for (const event of events) {
      this.apply(event);
    }
  }

  /**
   * Get current state (for persistence)
   */
  getState(): Readonly<AppointmentAggregateState> {
    return this._state;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Raise a domain event
   */
  private raise(type: string, payload: unknown, correlationId?: string): void {
    const event: AppointmentDomainEvent = {
      type,
      payload,
      aggregateId: this._state.id,
      aggregateType: 'Appointment',
      version: this._state.version + 1,
      timestamp: new Date(),
      correlationId,
    };

    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  /**
   * Event handler type for state mutations
   */
  private readonly eventHandlers: Record<
    string,
    (payload: Record<string, unknown>, timestamp: Date) => void
  > = {
    'appointment.created': (payload) => this.applyCreated(payload),
    'appointment.confirmed': (payload, timestamp) => this.applyConfirmed(payload, timestamp),
    'appointment.checked_in': (_, timestamp) => this.applyCheckedIn(timestamp),
    'appointment.started': () => this.applyStarted(),
    'appointment.completed': (payload, timestamp) => this.applyCompleted(payload, timestamp),
    'appointment.cancelled': (payload, timestamp) => this.applyCancelled(payload, timestamp),
    'appointment.no_show': (_, timestamp) => this.applyNoShow(timestamp),
    'appointment.rescheduled': (payload) => this.applyRescheduled(payload),
    'appointment.reminder_sent': (payload) => this.applyReminderSent(payload),
    'appointment.notes_updated': (payload) => this.applyNotesUpdated(payload),
    'appointment.provider_assigned': (payload) => this.applyProviderAssigned(payload),
    'appointment.consent_verified': (payload, timestamp) =>
      this.applyConsentVerified(payload, timestamp),
  };

  /**
   * Apply an event to update state
   */
  private apply(event: AppointmentDomainEvent): void {
    const payload = event.payload as Record<string, unknown>;
    const handler = this.eventHandlers[event.type];

    if (handler) {
      handler(payload, event.timestamp);
    }

    this._state = {
      ...this._state,
      version: event.version,
      updatedAt: event.timestamp,
    };
  }

  // ============================================================================
  // EVENT HANDLERS (State mutation methods)
  // ============================================================================

  private applyCreated(payload: Record<string, unknown>): void {
    const scheduledFor = new Date(payload.scheduledFor as string);
    const duration = payload.duration as number;
    const endTime = new Date(scheduledFor.getTime() + duration * 60 * 1000);

    this._state = {
      ...this._state,
      patientId: payload.patientId as string,
      patientName: payload.patientName as string | undefined,
      patientPhone: payload.patientPhone as string | undefined,
      clinicId: payload.clinicId as string,
      procedureType: payload.procedureType as string,
      scheduledFor,
      duration,
      endTime,
      providerId: payload.providerId as string | undefined,
      providerName: payload.providerName as string | undefined,
      timeSlotId: payload.timeSlotId as string | undefined,
      hubspotContactId: payload.hubspotContactId as string | undefined,
      rescheduledFrom: payload.rescheduledFrom as string | undefined,
      status: 'REQUESTED',
    };
  }

  private applyConfirmed(payload: Record<string, unknown>, timestamp: Date): void {
    this._state = {
      ...this._state,
      status: 'CONFIRMED',
      previousStatus: 'REQUESTED',
      confirmedAt: timestamp,
      confirmedBy: payload.confirmedBy as string,
    };
  }

  private applyCheckedIn(timestamp: Date): void {
    this._state = {
      ...this._state,
      status: 'CHECKED_IN',
      previousStatus: 'CONFIRMED',
      checkedInAt: timestamp,
    };
  }

  private applyStarted(): void {
    this._state = {
      ...this._state,
      status: 'IN_PROGRESS',
      previousStatus: 'CHECKED_IN',
    };
  }

  private applyCompleted(payload: Record<string, unknown>, timestamp: Date): void {
    this._state = {
      ...this._state,
      status: 'COMPLETED',
      previousStatus: 'IN_PROGRESS',
      completedAt: timestamp,
      actualDuration: payload.actualDuration as number | undefined,
      treatmentNotes: payload.treatmentNotes as string | undefined,
    };
  }

  private applyCancelled(payload: Record<string, unknown>, timestamp: Date): void {
    this._state = {
      ...this._state,
      status: 'CANCELLED',
      previousStatus: payload.previousStatus as AppointmentStatus,
      cancelledAt: timestamp,
      cancellationReason: payload.reason as CancellationReason,
      cancellationDetails: payload.details as string | undefined,
      cancelledBy: payload.cancelledBy as ActionInitiator,
    };
  }

  private applyNoShow(timestamp: Date): void {
    this._state = {
      ...this._state,
      status: 'NO_SHOW',
      previousStatus: this._state.status,
      markedNoShowAt: timestamp,
    };
  }

  private applyRescheduled(payload: Record<string, unknown>): void {
    this._state = {
      ...this._state,
      status: 'RESCHEDULED',
      previousStatus: this._state.status,
      rescheduledTo: payload.newAppointmentId as string,
      rescheduleCount: payload.rescheduleCount as number,
    };
  }

  private applyReminderSent(payload: Record<string, unknown>): void {
    const reminder: ReminderRecord = {
      id: payload.reminderId as string,
      type: payload.reminderType as ReminderRecord['type'],
      sentAt: new Date(payload.sentAt as string),
      status: payload.status as ReminderRecord['status'],
    };

    this._state = {
      ...this._state,
      remindersSent: [...this._state.remindersSent, reminder],
    };
  }

  private applyNotesUpdated(payload: Record<string, unknown>): void {
    this._state = {
      ...this._state,
      notes: payload.notes as string | undefined,
      internalNotes: payload.internalNotes as string | undefined,
    };
  }

  private applyProviderAssigned(payload: Record<string, unknown>): void {
    this._state = {
      ...this._state,
      providerId: payload.newProviderId as string,
      providerName: payload.providerName as string | undefined,
    };
  }

  private applyConsentVerified(payload: Record<string, unknown>, timestamp: Date): void {
    this._state = {
      ...this._state,
      consentVerifiedAt: timestamp,
      consentType: payload.consentType as string,
    };
  }

  /**
   * Ensure appointment can be modified
   */
  private ensureCanModify(): void {
    if (this.isTerminal()) {
      throw new AppointmentClosedError(this._state.id, this._state.status);
    }
  }

  /**
   * Ensure status transition is valid
   */
  private ensureCanTransition(targetStatus: AppointmentStatus): void {
    if (!this.isValidTransition(this._state.status, targetStatus)) {
      throw new InvalidAppointmentStatusTransitionError(
        this._state.id,
        this._state.status,
        targetStatus
      );
    }
  }

  /**
   * Check if status transition is valid
   */
  private isValidTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      REQUESTED: ['CONFIRMED', 'CANCELLED', 'RESCHEDULED'],
      CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'],
      CHECKED_IN: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [], // Terminal state
      CANCELLED: [], // Terminal state
      NO_SHOW: [], // Terminal state
      RESCHEDULED: [], // Terminal state
    };

    return validTransitions[from].includes(to);
  }
}

// ============================================================================
// ERRORS
// ============================================================================

export class AppointmentError extends Error {
  readonly code: string;
  readonly appointmentId: string;

  constructor(code: string, appointmentId: string, message: string) {
    super(message);
    this.name = 'AppointmentError';
    this.code = code;
    this.appointmentId = appointmentId;
    Object.setPrototypeOf(this, AppointmentError.prototype);
  }
}

export class AppointmentClosedError extends AppointmentError {
  readonly status: AppointmentStatus;

  constructor(appointmentId: string, status: AppointmentStatus) {
    super(
      'APPOINTMENT_CLOSED',
      appointmentId,
      `Appointment ${appointmentId} is closed with status: ${status}`
    );
    this.name = 'AppointmentClosedError';
    this.status = status;
    Object.setPrototypeOf(this, AppointmentClosedError.prototype);
  }
}

export class AppointmentAlreadyConfirmedError extends AppointmentError {
  constructor(appointmentId: string) {
    super(
      'APPOINTMENT_ALREADY_CONFIRMED',
      appointmentId,
      `Appointment ${appointmentId} is already confirmed`
    );
    this.name = 'AppointmentAlreadyConfirmedError';
    Object.setPrototypeOf(this, AppointmentAlreadyConfirmedError.prototype);
  }
}

export class AppointmentAlreadyCancelledError extends AppointmentError {
  constructor(appointmentId: string) {
    super(
      'APPOINTMENT_ALREADY_CANCELLED',
      appointmentId,
      `Appointment ${appointmentId} is already cancelled`
    );
    this.name = 'AppointmentAlreadyCancelledError';
    Object.setPrototypeOf(this, AppointmentAlreadyCancelledError.prototype);
  }
}

export class InvalidAppointmentStatusTransitionError extends AppointmentError {
  readonly fromStatus: AppointmentStatus;
  readonly toStatus: AppointmentStatus;

  constructor(appointmentId: string, from: AppointmentStatus, to: AppointmentStatus) {
    super(
      'INVALID_STATUS_TRANSITION',
      appointmentId,
      `Invalid status transition from '${from}' to '${to}' for appointment ${appointmentId}`
    );
    this.name = 'InvalidAppointmentStatusTransitionError';
    this.fromStatus = from;
    this.toStatus = to;
    Object.setPrototypeOf(this, InvalidAppointmentStatusTransitionError.prototype);
  }
}

export class MaxReschedulesExceededError extends AppointmentError {
  readonly maxReschedules: number;

  constructor(appointmentId: string, maxReschedules: number) {
    super(
      'MAX_RESCHEDULES_EXCEEDED',
      appointmentId,
      `Appointment ${appointmentId} has exceeded the maximum number of reschedules (${maxReschedules})`
    );
    this.name = 'MaxReschedulesExceededError';
    this.maxReschedules = maxReschedules;
    Object.setPrototypeOf(this, MaxReschedulesExceededError.prototype);
  }
}
