/* eslint-disable max-lines, max-lines-per-function, complexity */
/**
 * @fileoverview Patient Aggregate Root
 *
 * Banking/Medical Grade DDD Aggregate Root for Patient lifecycle management.
 * This is the entry point for all Patient-related domain operations.
 *
 * @module domain/patients/entities/Patient
 *
 * DESIGN PRINCIPLES:
 * 1. AGGREGATE ROOT - All Patient modifications go through this class
 * 2. INVARIANT ENFORCEMENT - Business rules are enforced here
 * 3. EVENT SOURCING - State changes emit domain events
 * 4. TELL DON'T ASK - Rich domain methods instead of anemic getters
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
 * // Convert lead to patient
 * const patient = PatientAggregateRoot.fromLeadConversion({
 *   id: 'patient-123',
 *   leadId: 'lead-456',
 *   phone: PhoneNumber.create('+40700000001'),
 *   firstName: 'Ion',
 *   lastName: 'Popescu',
 *   conversionProcedure: 'dental_implant',
 * });
 *
 * // Start treatment
 * patient.startTreatment({
 *   treatmentPlanId: 'plan-789',
 *   procedureType: 'all_on_4',
 *   providerId: 'dr-smith',
 * });
 *
 * // Get uncommitted events for persistence
 * const events = patient.getUncommittedEvents();
 * ```
 */

import { PhoneNumber } from '../../shared-kernel/value-objects/phone-number.js';
import type {
  PatientStatus,
  CommunicationChannel,
  ConsentStatus,
  InsuranceStatus,
} from '../events/patient-events.js';

// ============================================================================
// PATIENT STATE
// ============================================================================

/**
 * Medical history entry
 */
export interface MedicalHistoryEntry {
  readonly id: string;
  readonly conditionType: 'chronic' | 'acute' | 'surgical' | 'allergy' | 'medication';
  readonly description: string;
  readonly diagnosedAt?: Date;
  readonly severity?: 'mild' | 'moderate' | 'severe';
  readonly currentStatus: 'active' | 'resolved' | 'managed';
  readonly addedAt: Date;
}

/**
 * Allergy record
 */
export interface AllergyRecord {
  readonly id: string;
  readonly allergen: string;
  readonly severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  readonly reaction: string;
  readonly verifiedAt?: Date;
}

/**
 * Treatment plan reference
 */
export interface TreatmentPlanReference {
  readonly id: string;
  readonly procedureType: string;
  readonly providerId: string;
  readonly status: 'active' | 'completed' | 'cancelled';
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly outcome?: 'successful' | 'partial' | 'complications';
}

/**
 * Appointment reference
 */
export interface AppointmentReference {
  readonly id: string;
  readonly appointmentType: string;
  readonly scheduledFor: Date;
  readonly duration: number; // minutes
  readonly providerId: string;
  readonly status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  readonly isFollowUp: boolean;
  readonly treatmentPlanId?: string;
}

/**
 * Insurance information
 */
export interface InsuranceInfo {
  readonly id: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly policyNumber: string;
  readonly groupNumber?: string;
  readonly coverageType: 'full' | 'partial' | 'dental_only';
  readonly effectiveFrom: Date;
  readonly effectiveUntil?: Date;
  readonly status: InsuranceStatus;
  readonly verifiedAt?: Date;
}

/**
 * Consent record
 */
export interface ConsentRecord {
  readonly type: 'treatment' | 'marketing' | 'data_sharing' | 'research' | 'communication';
  readonly status: ConsentStatus;
  readonly grantedAt?: Date;
  readonly revokedAt?: Date;
  readonly expiresAt?: Date;
  readonly method?: 'written' | 'verbal' | 'electronic';
}

/**
 * Provider assignment
 */
export interface ProviderAssignment {
  readonly providerId: string;
  readonly role: 'primary' | 'specialist' | 'hygienist' | 'consultant';
  readonly assignedAt: Date;
}

/**
 * Patient preferences
 */
export interface PatientPreferences {
  readonly preferredLanguage: 'ro' | 'en' | 'de';
  readonly preferredChannel: CommunicationChannel;
  readonly preferredContactTime: 'morning' | 'afternoon' | 'evening' | 'any';
  readonly doNotContact: boolean;
  readonly specialInstructions?: string;
}

/**
 * Internal state for the Patient aggregate
 */
export interface PatientAggregateState {
  readonly id: string;
  readonly version: number;
  readonly leadId?: string; // Original lead ID if converted

  // Contact information
  readonly phone: PhoneNumber;
  readonly email?: string;
  readonly hubspotContactId?: string;

  // Demographics
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth?: Date;
  readonly address?: string;
  readonly city?: string;
  readonly county?: string;

  // Status
  readonly status: PatientStatus;
  readonly registeredAt: Date;
  readonly activatedAt?: Date;
  readonly deactivatedAt?: Date;
  readonly archivedAt?: Date;

  // Medical information
  readonly medicalHistory: readonly MedicalHistoryEntry[];
  readonly allergies: readonly AllergyRecord[];

  // Treatment tracking
  readonly treatmentPlans: readonly TreatmentPlanReference[];
  readonly appointments: readonly AppointmentReference[];
  readonly noShowCount: number;

  // Insurance
  readonly insuranceInfo?: InsuranceInfo;

  // Consents
  readonly consents: Record<string, ConsentRecord>;

  // Providers
  readonly assignedProviders: readonly ProviderAssignment[];
  readonly primaryProviderId?: string;

  // Preferences
  readonly preferences: PatientPreferences;

  // Metadata
  readonly source: 'lead_conversion' | 'direct_registration' | 'referral' | 'transfer';
  readonly conversionProcedure?: string;
  readonly lastContactAt?: Date;
  readonly lastAppointmentAt?: Date;

  // Timestamps
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // Soft delete
  readonly isDeleted: boolean;
  readonly deletedAt?: Date;
  readonly deletionReason?: string;
}

// ============================================================================
// DOMAIN EVENTS (Internal representation)
// ============================================================================

export interface PatientDomainEvent<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly aggregateId: string;
  readonly aggregateType: 'Patient';
  readonly version: number;
  readonly timestamp: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
}

// ============================================================================
// PATIENT AGGREGATE ROOT
// ============================================================================

/**
 * Patient Aggregate Root
 *
 * Encapsulates all Patient domain logic and enforces invariants.
 * All state changes are made through domain events.
 */
export class PatientAggregateRoot {
  private _state: PatientAggregateState;
  private _uncommittedEvents: PatientDomainEvent[] = [];

  private constructor(state: PatientAggregateState) {
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

  get leadId(): string | undefined {
    return this._state.leadId;
  }

  get phone(): PhoneNumber {
    return this._state.phone;
  }

  get email(): string | undefined {
    return this._state.email;
  }

  get firstName(): string {
    return this._state.firstName;
  }

  get lastName(): string {
    return this._state.lastName;
  }

  get fullName(): string {
    return `${this._state.firstName} ${this._state.lastName}`;
  }

  get status(): PatientStatus {
    return this._state.status;
  }

  get dateOfBirth(): Date | undefined {
    return this._state.dateOfBirth;
  }

  get registeredAt(): Date {
    return this._state.registeredAt;
  }

  get primaryProviderId(): string | undefined {
    return this._state.primaryProviderId;
  }

  get medicalHistory(): readonly MedicalHistoryEntry[] {
    return this._state.medicalHistory;
  }

  get allergies(): readonly AllergyRecord[] {
    return this._state.allergies;
  }

  get treatmentPlans(): readonly TreatmentPlanReference[] {
    return this._state.treatmentPlans;
  }

  get appointments(): readonly AppointmentReference[] {
    return this._state.appointments;
  }

  get noShowCount(): number {
    return this._state.noShowCount;
  }

  get insuranceInfo(): InsuranceInfo | undefined {
    return this._state.insuranceInfo;
  }

  get preferences(): PatientPreferences {
    return this._state.preferences;
  }

  get isDeleted(): boolean {
    return this._state.isDeleted;
  }

  get hubspotContactId(): string | undefined {
    return this._state.hubspotContactId;
  }

  get createdAt(): Date {
    return this._state.createdAt;
  }

  get updatedAt(): Date {
    return this._state.updatedAt;
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if patient is active (can receive services)
   */
  isActive(): boolean {
    return (
      this._state.status === 'active' ||
      this._state.status === 'under_treatment' ||
      this._state.status === 'post_treatment'
    );
  }

  /**
   * Check if patient is under treatment
   */
  isUnderTreatment(): boolean {
    return this._state.status === 'under_treatment';
  }

  /**
   * Check if patient is newly registered (not yet activated)
   */
  isNewlyRegistered(): boolean {
    return this._state.status === 'registered';
  }

  /**
   * Check if patient is inactive or archived
   */
  isInactiveOrArchived(): boolean {
    return this._state.status === 'inactive' || this._state.status === 'archived';
  }

  /**
   * Check if patient can be modified
   */
  canModify(): boolean {
    return !this._state.isDeleted && this._state.status !== 'archived';
  }

  /**
   * Check if patient has active treatment plans
   */
  hasActiveTreatmentPlans(): boolean {
    return this._state.treatmentPlans.some((tp) => tp.status === 'active');
  }

  /**
   * Get active treatment plans
   */
  getActiveTreatmentPlans(): readonly TreatmentPlanReference[] {
    return this._state.treatmentPlans.filter((tp) => tp.status === 'active');
  }

  /**
   * Get upcoming appointments
   */
  getUpcomingAppointments(): readonly AppointmentReference[] {
    const now = new Date();
    return this._state.appointments.filter(
      (apt) => apt.status === 'scheduled' && apt.scheduledFor > now
    );
  }

  /**
   * Check if patient has high no-show rate
   */
  hasHighNoShowRate(): boolean {
    const totalAppointments = this._state.appointments.length;
    if (totalAppointments < 3) return false;
    return this._state.noShowCount / totalAppointments > 0.3;
  }

  /**
   * Check if patient has valid insurance
   */
  hasValidInsurance(): boolean {
    if (!this._state.insuranceInfo) return false;
    const now = new Date();
    return (
      this._state.insuranceInfo.status === 'verified' &&
      this._state.insuranceInfo.effectiveFrom <= now &&
      (!this._state.insuranceInfo.effectiveUntil || this._state.insuranceInfo.effectiveUntil > now)
    );
  }

  /**
   * Check if patient has known allergies
   */
  hasAllergies(): boolean {
    return this._state.allergies.length > 0;
  }

  /**
   * Check if patient has life-threatening allergies
   */
  hasLifeThreateningAllergies(): boolean {
    return this._state.allergies.some((a) => a.severity === 'life_threatening');
  }

  /**
   * Check if consent is granted for a specific purpose
   */
  hasConsent(
    type: 'treatment' | 'marketing' | 'data_sharing' | 'research' | 'communication'
  ): boolean {
    const consent = this._state.consents[type];
    if (consent?.status !== 'granted') return false;
    if (consent.expiresAt && consent.expiresAt < new Date()) return false;
    return true;
  }

  /**
   * Get days since last contact
   */
  getDaysSinceLastContact(): number | undefined {
    if (!this._state.lastContactAt) return undefined;
    const now = new Date();
    const diffMs = now.getTime() - this._state.lastContactAt.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if patient needs follow-up (no contact in 30+ days)
   */
  needsFollowUp(): boolean {
    const daysSinceContact = this.getDaysSinceLastContact();
    return daysSinceContact !== undefined && daysSinceContact > 30;
  }

  /**
   * Get patient age
   */
  getAge(): number | undefined {
    if (!this._state.dateOfBirth) return undefined;
    const today = new Date();
    let age = today.getFullYear() - this._state.dateOfBirth.getFullYear();
    const m = today.getMonth() - this._state.dateOfBirth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < this._state.dateOfBirth.getDate())) {
      age--;
    }
    return age;
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a patient from lead conversion
   */
  static fromLeadConversion(
    params: FromLeadConversionParams,
    correlationId?: string
  ): PatientAggregateRoot {
    const now = new Date();
    const state: PatientAggregateState = {
      id: params.id,
      version: 0,
      leadId: params.leadId,
      phone: params.phone,
      email: params.email,
      hubspotContactId: params.hubspotContactId,
      firstName: params.firstName,
      lastName: params.lastName,
      dateOfBirth: params.dateOfBirth,
      status: 'registered',
      registeredAt: now,
      medicalHistory: [],
      allergies: [],
      treatmentPlans: [],
      appointments: [],
      noShowCount: 0,
      consents: {},
      assignedProviders: [],
      primaryProviderId: params.assignedProviderId,
      preferences: {
        preferredLanguage: params.phone.getPreferredLanguage(),
        preferredChannel: 'whatsapp',
        preferredContactTime: 'any',
        doNotContact: false,
      },
      source: 'lead_conversion',
      conversionProcedure: params.conversionProcedure,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    const patient = new PatientAggregateRoot(state);

    patient.raise(
      'patient.registered',
      {
        leadId: params.leadId,
        phone: params.phone.e164,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        dateOfBirth: params.dateOfBirth?.toISOString(),
        conversionProcedure: params.conversionProcedure,
        assignedProviderId: params.assignedProviderId,
        source: 'lead_conversion',
        hubspotContactId: params.hubspotContactId,
        initialAppointmentId: params.initialAppointmentId,
      },
      correlationId
    );

    return patient;
  }

  /**
   * Create a patient from direct registration (walk-in, referral, etc.)
   */
  static create(params: CreatePatientParams, correlationId?: string): PatientAggregateRoot {
    const now = new Date();
    const state: PatientAggregateState = {
      id: params.id,
      version: 0,
      phone: params.phone,
      email: params.email,
      hubspotContactId: params.hubspotContactId,
      firstName: params.firstName,
      lastName: params.lastName,
      dateOfBirth: params.dateOfBirth,
      address: params.address,
      city: params.city,
      county: params.county,
      status: 'registered',
      registeredAt: now,
      medicalHistory: [],
      allergies: [],
      treatmentPlans: [],
      appointments: [],
      noShowCount: 0,
      consents: {},
      assignedProviders: [],
      primaryProviderId: params.assignedProviderId,
      preferences: {
        preferredLanguage: params.preferredLanguage ?? params.phone.getPreferredLanguage(),
        preferredChannel: params.preferredChannel ?? 'whatsapp',
        preferredContactTime: params.preferredContactTime ?? 'any',
        doNotContact: false,
      },
      source: params.source ?? 'direct_registration',
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    const patient = new PatientAggregateRoot(state);

    patient.raise(
      'patient.registered',
      {
        leadId: '',
        phone: params.phone.e164,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        dateOfBirth: params.dateOfBirth?.toISOString(),
        conversionProcedure: '',
        assignedProviderId: params.assignedProviderId,
        source: params.source ?? 'direct_registration',
        hubspotContactId: params.hubspotContactId,
      },
      correlationId
    );

    return patient;
  }

  /**
   * Reconstitute a Patient from existing state (for loading from DB)
   */
  static reconstitute(state: PatientAggregateState): PatientAggregateRoot {
    return new PatientAggregateRoot(state);
  }

  /**
   * Reconstitute a Patient from event history (event sourcing)
   */
  static fromEvents(id: string, events: PatientDomainEvent[]): PatientAggregateRoot {
    const initialState: PatientAggregateState = {
      id,
      version: 0,
      phone: PhoneNumber.create('+40700000000'), // Placeholder
      firstName: '',
      lastName: '',
      status: 'registered',
      registeredAt: new Date(),
      medicalHistory: [],
      allergies: [],
      treatmentPlans: [],
      appointments: [],
      noShowCount: 0,
      consents: {},
      assignedProviders: [],
      preferences: {
        preferredLanguage: 'ro',
        preferredChannel: 'whatsapp',
        preferredContactTime: 'any',
        doNotContact: false,
      },
      source: 'direct_registration',
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };

    const patient = new PatientAggregateRoot(initialState);
    patient.loadFromHistory(events);
    return patient;
  }

  // ============================================================================
  // DOMAIN METHODS (State-changing operations)
  // ============================================================================

  /**
   * Activate the patient (after first appointment or verification)
   */
  activate(
    reason: string,
    firstAppointmentId?: string,
    primaryProviderId?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    if (this._state.status !== 'registered' && this._state.status !== 'inactive') {
      throw new InvalidPatientStatusTransitionError(this._state.id, this._state.status, 'active');
    }

    this.raise(
      'patient.activated',
      {
        phone: this._state.phone.e164,
        activationReason: reason,
        firstAppointmentId,
        primaryProviderId,
      },
      correlationId
    );
  }

  /**
   * Start a treatment plan
   */
  startTreatment(params: StartTreatmentParams, correlationId?: string): void {
    this.ensureCanModify();
    this.ensureActive();

    this.raise(
      'patient.treatment_started',
      {
        phone: this._state.phone.e164,
        treatmentPlanId: params.treatmentPlanId,
        procedureType: params.procedureType,
        providerId: params.providerId,
        estimatedCompletionDate: params.estimatedCompletionDate?.toISOString(),
        estimatedCost: params.estimatedCost,
        phases: params.phases,
      },
      correlationId
    );
  }

  /**
   * Complete a treatment plan
   */
  completeTreatment(params: CompleteTreatmentParams, correlationId?: string): void {
    this.ensureCanModify();

    const treatmentPlan = this._state.treatmentPlans.find((tp) => tp.id === params.treatmentPlanId);
    if (!treatmentPlan) {
      throw new PatientError(
        'TREATMENT_NOT_FOUND',
        this._state.id,
        `Treatment plan ${params.treatmentPlanId} not found`
      );
    }
    if (treatmentPlan.status !== 'active') {
      throw new PatientError(
        'TREATMENT_NOT_ACTIVE',
        this._state.id,
        `Treatment plan ${params.treatmentPlanId} is not active`
      );
    }

    this.raise(
      'patient.treatment_completed',
      {
        phone: this._state.phone.e164,
        treatmentPlanId: params.treatmentPlanId,
        procedureType: treatmentPlan.procedureType,
        providerId: treatmentPlan.providerId,
        completedAt: new Date().toISOString(),
        outcome: params.outcome,
        followUpRequired: params.followUpRequired,
        followUpScheduledFor: params.followUpScheduledFor?.toISOString(),
      },
      correlationId
    );
  }

  /**
   * Cancel a treatment plan
   */
  cancelTreatment(
    treatmentPlanId: string,
    reason: 'patient_request' | 'medical_contraindication' | 'financial' | 'other',
    reasonDetails?: string,
    cancelledBy?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    const treatmentPlan = this._state.treatmentPlans.find((tp) => tp.id === treatmentPlanId);
    if (!treatmentPlan) {
      throw new PatientError(
        'TREATMENT_NOT_FOUND',
        this._state.id,
        `Treatment plan ${treatmentPlanId} not found`
      );
    }

    this.raise(
      'patient.treatment_cancelled',
      {
        phone: this._state.phone.e164,
        treatmentPlanId,
        reason,
        reasonDetails,
        cancelledBy,
      },
      correlationId
    );
  }

  /**
   * Schedule an appointment
   */
  scheduleAppointment(params: ScheduleAppointmentParams, correlationId?: string): void {
    this.ensureCanModify();

    this.raise(
      'patient.appointment_scheduled',
      {
        phone: this._state.phone.e164,
        appointmentId: params.appointmentId,
        appointmentType: params.appointmentType,
        scheduledFor: params.scheduledFor.toISOString(),
        duration: params.duration,
        providerId: params.providerId,
        location: params.location,
        isFollowUp: params.isFollowUp ?? false,
        treatmentPlanId: params.treatmentPlanId,
      },
      correlationId
    );
  }

  /**
   * Complete an appointment
   */
  completeAppointment(
    appointmentId: string,
    providerId: string,
    notes?: string,
    nextAppointmentId?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    const appointment = this._state.appointments.find((a) => a.id === appointmentId);
    if (!appointment) {
      throw new PatientError(
        'APPOINTMENT_NOT_FOUND',
        this._state.id,
        `Appointment ${appointmentId} not found`
      );
    }

    this.raise(
      'patient.appointment_completed',
      {
        phone: this._state.phone.e164,
        appointmentId,
        completedAt: new Date().toISOString(),
        providerId,
        notes,
        nextAppointmentScheduled: !!nextAppointmentId,
        nextAppointmentId,
      },
      correlationId
    );
  }

  /**
   * Cancel an appointment
   */
  cancelAppointment(
    appointmentId: string,
    reason: string,
    cancelledBy: 'patient' | 'clinic' | 'provider' | 'system',
    rescheduled = false,
    newAppointmentId?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    const appointment = this._state.appointments.find((a) => a.id === appointmentId);
    if (!appointment) {
      throw new PatientError(
        'APPOINTMENT_NOT_FOUND',
        this._state.id,
        `Appointment ${appointmentId} not found`
      );
    }

    // Check if late cancellation (< 24 hours)
    const now = new Date();
    const hoursUntilAppointment =
      (appointment.scheduledFor.getTime() - now.getTime()) / (1000 * 60 * 60);
    const lateCancellation = hoursUntilAppointment < 24 && hoursUntilAppointment > 0;

    this.raise(
      'patient.appointment_cancelled',
      {
        phone: this._state.phone.e164,
        appointmentId,
        reason,
        cancelledBy,
        rescheduled,
        newAppointmentId,
        lateCancellation,
      },
      correlationId
    );
  }

  /**
   * Record a no-show
   */
  recordNoShow(
    appointmentId: string,
    attemptedContact: boolean,
    contactResult?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    const appointment = this._state.appointments.find((a) => a.id === appointmentId);
    if (!appointment) {
      throw new PatientError(
        'APPOINTMENT_NOT_FOUND',
        this._state.id,
        `Appointment ${appointmentId} not found`
      );
    }

    this.raise(
      'patient.no_show',
      {
        phone: this._state.phone.e164,
        appointmentId,
        scheduledFor: appointment.scheduledFor.toISOString(),
        providerId: appointment.providerId,
        attemptedContact,
        contactResult,
        noShowCount: this._state.noShowCount + 1,
      },
      correlationId
    );
  }

  /**
   * Add medical history entry
   */
  addMedicalHistory(
    entry: Omit<MedicalHistoryEntry, 'id' | 'addedAt'>,
    addedBy?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'patient.medical_history_added',
      {
        phone: this._state.phone.e164,
        conditionType: entry.conditionType,
        description: entry.description,
        diagnosedAt: entry.diagnosedAt?.toISOString(),
        severity: entry.severity,
        currentStatus: entry.currentStatus,
        addedBy,
      },
      correlationId
    );
  }

  /**
   * Record an allergy
   */
  recordAllergy(
    allergen: string,
    severity: 'mild' | 'moderate' | 'severe' | 'life_threatening',
    reaction: string,
    verifiedBy?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    // Check for duplicate
    if (this._state.allergies.some((a) => a.allergen.toLowerCase() === allergen.toLowerCase())) {
      throw new PatientError(
        'ALLERGY_ALREADY_EXISTS',
        this._state.id,
        `Allergy to ${allergen} already recorded`
      );
    }

    this.raise(
      'patient.allergy_recorded',
      {
        phone: this._state.phone.e164,
        allergen,
        severity,
        reaction,
        verifiedBy,
      },
      correlationId
    );
  }

  /**
   * Add insurance information
   */
  addInsurance(
    insurance: Omit<InsuranceInfo, 'status' | 'verifiedAt'>,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'patient.insurance_added',
      {
        phone: this._state.phone.e164,
        insuranceId: insurance.id,
        providerId: insurance.providerId,
        providerName: insurance.providerName,
        policyNumber: insurance.policyNumber,
        groupNumber: insurance.groupNumber,
        coverageType: insurance.coverageType,
        effectiveFrom: insurance.effectiveFrom.toISOString(),
        effectiveUntil: insurance.effectiveUntil?.toISOString(),
      },
      correlationId
    );
  }

  /**
   * Grant consent
   */
  grantConsent(
    type: 'treatment' | 'marketing' | 'data_sharing' | 'research' | 'communication',
    scope: string,
    method: 'written' | 'verbal' | 'electronic',
    expiresAt?: Date,
    witnessedBy?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'patient.consent_granted',
      {
        phone: this._state.phone.e164,
        consentType: type,
        scope,
        grantedAt: new Date().toISOString(),
        expiresAt: expiresAt?.toISOString(),
        method,
        witnessedBy,
      },
      correlationId
    );
  }

  /**
   * Revoke consent
   */
  revokeConsent(
    type: 'treatment' | 'marketing' | 'data_sharing' | 'research' | 'communication',
    reason?: string,
    effectiveImmediately = true,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'patient.consent_revoked',
      {
        phone: this._state.phone.e164,
        consentType: type,
        revokedAt: new Date().toISOString(),
        reason,
        effectiveImmediately,
      },
      correlationId
    );
  }

  /**
   * Update demographics
   */
  updateDemographics(
    params: UpdateDemographicsParams,
    updatedBy?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    const previousValues = {
      firstName: this._state.firstName,
      lastName: this._state.lastName,
      email: this._state.email,
      dateOfBirth: this._state.dateOfBirth?.toISOString(),
      address: this._state.address,
      city: this._state.city,
      county: this._state.county,
    };

    this.raise(
      'patient.demographics_updated',
      {
        phone: this._state.phone.e164,
        previousValues,
        newValues: {
          firstName: params.firstName,
          lastName: params.lastName,
          email: params.email,
          dateOfBirth: params.dateOfBirth?.toISOString(),
          address: params.address,
          city: params.city,
          county: params.county,
        },
        updatedBy,
      },
      correlationId
    );
  }

  /**
   * Update preferences
   */
  updatePreferences(params: Partial<PatientPreferences>, correlationId?: string): void {
    this.ensureCanModify();

    this.raise(
      'patient.preferences_updated',
      {
        phone: this._state.phone.e164,
        preferredLanguage: params.preferredLanguage,
        preferredChannel: params.preferredChannel,
        preferredContactTime: params.preferredContactTime,
        doNotContact: params.doNotContact,
        specialInstructions: params.specialInstructions,
      },
      correlationId
    );
  }

  /**
   * Assign a provider
   */
  assignProvider(
    providerId: string,
    role: 'primary' | 'specialist' | 'hygienist' | 'consultant',
    assignedBy?: string,
    reason?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'patient.provider_assigned',
      {
        phone: this._state.phone.e164,
        providerId,
        providerRole: role,
        assignedBy,
        reason,
        effectiveFrom: new Date().toISOString(),
      },
      correlationId
    );
  }

  /**
   * Record contact with patient
   */
  recordContact(
    channel: CommunicationChannel,
    direction: 'inbound' | 'outbound',
    purpose: 'appointment_reminder' | 'follow_up' | 'billing' | 'general' | 'emergency',
    outcome: 'reached' | 'voicemail' | 'no_answer' | 'busy' | 'wrong_number',
    notes?: string,
    contactedBy?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'patient.contacted',
      {
        phone: this._state.phone.e164,
        channel,
        direction,
        purpose,
        outcome,
        notes,
        contactedBy,
      },
      correlationId
    );
  }

  /**
   * Deactivate patient
   */
  deactivate(
    reason: 'no_activity' | 'patient_request' | 'moved_away' | 'other',
    reasonDetails?: string,
    reactivationEligible = true,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    if (this.hasActiveTreatmentPlans()) {
      throw new PatientError(
        'ACTIVE_TREATMENT_EXISTS',
        this._state.id,
        'Cannot deactivate patient with active treatment plans'
      );
    }

    this.raise(
      'patient.deactivated',
      {
        phone: this._state.phone.e164,
        reason,
        reasonDetails,
        lastActivityAt: this._state.lastContactAt?.toISOString(),
        reactivationEligible,
      },
      correlationId
    );
  }

  /**
   * Archive patient (permanent, for GDPR/retention)
   */
  archive(
    reason: 'gdpr_request' | 'retention_policy' | 'deceased' | 'duplicate' | 'other',
    reasonDetails?: string,
    retentionUntil?: Date,
    archivedBy?: string,
    correlationId?: string
  ): void {
    if (this._state.status === 'archived') {
      return; // Already archived
    }

    if (this.hasActiveTreatmentPlans()) {
      throw new PatientError(
        'ACTIVE_TREATMENT_EXISTS',
        this._state.id,
        'Cannot archive patient with active treatment plans'
      );
    }

    this.raise(
      'patient.archived',
      {
        phone: this._state.phone.e164,
        reason,
        reasonDetails,
        retentionUntil: retentionUntil?.toISOString(),
        archivedBy,
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
  getUncommittedEvents(): readonly PatientDomainEvent[] {
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
  loadFromHistory(events: PatientDomainEvent[]): void {
    for (const event of events) {
      this.apply(event);
    }
  }

  /**
   * Get current state (for persistence)
   */
  getState(): Readonly<PatientAggregateState> {
    return this._state;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Raise a domain event
   */
  private raise(type: string, payload: unknown, correlationId?: string): void {
    const event: PatientDomainEvent = {
      type,
      payload,
      aggregateId: this._state.id,
      aggregateType: 'Patient',
      version: this._state.version + 1,
      timestamp: new Date(),
      correlationId,
    };

    this.apply(event);
    this._uncommittedEvents.push(event);
  }

  /**
   * Apply an event to update state
   */
  private apply(event: PatientDomainEvent): void {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case 'patient.registered':
        this._state = {
          ...this._state,
          phone: PhoneNumber.create(payload.phone as string),
          email: payload.email as string | undefined,
          firstName: payload.firstName as string,
          lastName: payload.lastName as string,
          dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth as string) : undefined,
          leadId: payload.leadId as string | undefined,
          hubspotContactId: payload.hubspotContactId as string | undefined,
          conversionProcedure: payload.conversionProcedure as string | undefined,
          primaryProviderId: payload.assignedProviderId as string | undefined,
          source: payload.source as
            | 'lead_conversion'
            | 'direct_registration'
            | 'referral'
            | 'transfer',
          status: 'registered',
        };
        break;

      case 'patient.activated':
        this._state = {
          ...this._state,
          status: 'active',
          activatedAt: event.timestamp,
          primaryProviderId:
            (payload.primaryProviderId as string | undefined) ?? this._state.primaryProviderId,
        };
        break;

      case 'patient.status_changed':
        this._state = {
          ...this._state,
          status: payload.newStatus as PatientStatus,
        };
        break;

      case 'patient.demographics_updated': {
        const newValues = payload.newValues as Record<string, unknown>;
        this._state = {
          ...this._state,
          ...(newValues.firstName !== undefined && { firstName: newValues.firstName as string }),
          ...(newValues.lastName !== undefined && { lastName: newValues.lastName as string }),
          ...(newValues.email !== undefined && { email: newValues.email as string }),
          ...(newValues.dateOfBirth !== undefined && {
            dateOfBirth: new Date(newValues.dateOfBirth as string),
          }),
          ...(newValues.address !== undefined && { address: newValues.address as string }),
          ...(newValues.city !== undefined && { city: newValues.city as string }),
          ...(newValues.county !== undefined && { county: newValues.county as string }),
        };
        break;
      }

      case 'patient.treatment_started':
        this._state = {
          ...this._state,
          status: 'under_treatment',
          treatmentPlans: [
            ...this._state.treatmentPlans,
            {
              id: payload.treatmentPlanId as string,
              procedureType: payload.procedureType as string,
              providerId: payload.providerId as string,
              status: 'active',
              startedAt: event.timestamp,
            },
          ],
        };
        break;

      case 'patient.treatment_completed':
        this._state = {
          ...this._state,
          status: this.hasOtherActiveTreatments(payload.treatmentPlanId as string)
            ? 'under_treatment'
            : 'post_treatment',
          treatmentPlans: this._state.treatmentPlans.map((tp) =>
            tp.id === payload.treatmentPlanId
              ? {
                  ...tp,
                  status: 'completed' as const,
                  completedAt: event.timestamp,
                  outcome: payload.outcome as 'successful' | 'partial' | 'complications',
                }
              : tp
          ),
        };
        break;

      case 'patient.treatment_cancelled':
        this._state = {
          ...this._state,
          status: this.hasOtherActiveTreatments(payload.treatmentPlanId as string)
            ? 'under_treatment'
            : 'active',
          treatmentPlans: this._state.treatmentPlans.map((tp) =>
            tp.id === payload.treatmentPlanId ? { ...tp, status: 'cancelled' as const } : tp
          ),
        };
        break;

      case 'patient.appointment_scheduled':
        this._state = {
          ...this._state,
          appointments: [
            ...this._state.appointments,
            {
              id: payload.appointmentId as string,
              appointmentType: payload.appointmentType as string,
              scheduledFor: new Date(payload.scheduledFor as string),
              duration: payload.duration as number,
              providerId: payload.providerId as string,
              status: 'scheduled',
              isFollowUp: payload.isFollowUp as boolean,
              treatmentPlanId: payload.treatmentPlanId as string | undefined,
            },
          ],
        };
        break;

      case 'patient.appointment_completed':
        this._state = {
          ...this._state,
          lastAppointmentAt: event.timestamp,
          appointments: this._state.appointments.map((apt) =>
            apt.id === payload.appointmentId ? { ...apt, status: 'completed' as const } : apt
          ),
        };
        break;

      case 'patient.appointment_cancelled':
        this._state = {
          ...this._state,
          appointments: this._state.appointments.map((apt) =>
            apt.id === payload.appointmentId ? { ...apt, status: 'cancelled' as const } : apt
          ),
        };
        break;

      case 'patient.no_show':
        this._state = {
          ...this._state,
          noShowCount: this._state.noShowCount + 1,
          appointments: this._state.appointments.map((apt) =>
            apt.id === payload.appointmentId ? { ...apt, status: 'no_show' as const } : apt
          ),
        };
        break;

      case 'patient.medical_history_added':
        this._state = {
          ...this._state,
          medicalHistory: [
            ...this._state.medicalHistory,
            {
              id: `mh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              conditionType: payload.conditionType as MedicalHistoryEntry['conditionType'],
              description: payload.description as string,
              diagnosedAt: payload.diagnosedAt
                ? new Date(payload.diagnosedAt as string)
                : undefined,
              severity: payload.severity as MedicalHistoryEntry['severity'],
              currentStatus: payload.currentStatus as MedicalHistoryEntry['currentStatus'],
              addedAt: event.timestamp,
            },
          ],
        };
        break;

      case 'patient.allergy_recorded':
        this._state = {
          ...this._state,
          allergies: [
            ...this._state.allergies,
            {
              id: `allergy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              allergen: payload.allergen as string,
              severity: payload.severity as AllergyRecord['severity'],
              reaction: payload.reaction as string,
              verifiedAt: payload.verifiedBy ? event.timestamp : undefined,
            },
          ],
        };
        break;

      case 'patient.insurance_added':
        this._state = {
          ...this._state,
          insuranceInfo: {
            id: payload.insuranceId as string,
            providerId: payload.providerId as string,
            providerName: payload.providerName as string,
            policyNumber: payload.policyNumber as string,
            groupNumber: payload.groupNumber as string | undefined,
            coverageType: payload.coverageType as InsuranceInfo['coverageType'],
            effectiveFrom: new Date(payload.effectiveFrom as string),
            effectiveUntil: payload.effectiveUntil
              ? new Date(payload.effectiveUntil as string)
              : undefined,
            status: 'pending',
          },
        };
        break;

      case 'patient.insurance_verified':
        if (this._state.insuranceInfo) {
          this._state = {
            ...this._state,
            insuranceInfo: {
              ...this._state.insuranceInfo,
              status: (payload.verificationStatus as string) === 'active' ? 'verified' : 'expired',
              verifiedAt: event.timestamp,
            },
          };
        }
        break;

      case 'patient.consent_granted':
        this._state = {
          ...this._state,
          consents: {
            ...this._state.consents,
            [payload.consentType as string]: {
              type: payload.consentType as ConsentRecord['type'],
              status: 'granted',
              grantedAt: new Date(payload.grantedAt as string),
              expiresAt: payload.expiresAt ? new Date(payload.expiresAt as string) : undefined,
              method: payload.method as ConsentRecord['method'],
            },
          },
        };
        break;

      case 'patient.consent_revoked':
        this._state = {
          ...this._state,
          consents: {
            ...this._state.consents,
            [payload.consentType as string]: {
              ...this._state.consents[payload.consentType as string],
              type: payload.consentType as ConsentRecord['type'],
              status: 'denied',
              revokedAt: new Date(payload.revokedAt as string),
            },
          },
        };
        break;

      case 'patient.preferences_updated':
        this._state = {
          ...this._state,
          preferences: {
            ...this._state.preferences,
            ...(payload.preferredLanguage !== undefined && {
              preferredLanguage:
                payload.preferredLanguage as PatientPreferences['preferredLanguage'],
            }),
            ...(payload.preferredChannel !== undefined && {
              preferredChannel: payload.preferredChannel as CommunicationChannel,
            }),
            ...(payload.preferredContactTime !== undefined && {
              preferredContactTime:
                payload.preferredContactTime as PatientPreferences['preferredContactTime'],
            }),
            ...(payload.doNotContact !== undefined && {
              doNotContact: payload.doNotContact as boolean,
            }),
            ...(payload.specialInstructions !== undefined && {
              specialInstructions: payload.specialInstructions as string,
            }),
          },
        };
        break;

      case 'patient.provider_assigned': {
        const newAssignment: ProviderAssignment = {
          providerId: payload.providerId as string,
          role: payload.providerRole as ProviderAssignment['role'],
          assignedAt: event.timestamp,
        };
        this._state = {
          ...this._state,
          assignedProviders: [...this._state.assignedProviders, newAssignment],
          ...(payload.providerRole === 'primary' && {
            primaryProviderId: payload.providerId as string,
          }),
        };
        break;
      }

      case 'patient.contacted':
        this._state = {
          ...this._state,
          lastContactAt: event.timestamp,
        };
        break;

      case 'patient.deactivated':
        this._state = {
          ...this._state,
          status: 'inactive',
          deactivatedAt: event.timestamp,
        };
        break;

      case 'patient.archived':
        this._state = {
          ...this._state,
          status: 'archived',
          archivedAt: event.timestamp,
          isDeleted: true,
          deletedAt: event.timestamp,
          deletionReason: payload.reason as string,
        };
        break;

      default:
        // Unknown event types are ignored during reconstitution
        break;
    }

    this._state = {
      ...this._state,
      version: event.version,
      updatedAt: event.timestamp,
    };
  }

  /**
   * Check if there are other active treatments besides the given one
   */
  private hasOtherActiveTreatments(excludeId: string): boolean {
    return this._state.treatmentPlans.some((tp) => tp.id !== excludeId && tp.status === 'active');
  }

  /**
   * Ensure patient can be modified
   */
  private ensureCanModify(): void {
    if (this._state.isDeleted) {
      throw new PatientDeletedError(this._state.id);
    }
    if (this._state.status === 'archived') {
      throw new PatientArchivedError(this._state.id);
    }
  }

  /**
   * Ensure patient is active
   */
  private ensureActive(): void {
    if (!this.isActive() && this._state.status !== 'registered') {
      throw new PatientNotActiveError(this._state.id, this._state.status);
    }
  }
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface FromLeadConversionParams {
  readonly id: string;
  readonly leadId: string;
  readonly phone: PhoneNumber;
  readonly email?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth?: Date;
  readonly conversionProcedure: string;
  readonly assignedProviderId?: string;
  readonly hubspotContactId?: string;
  readonly initialAppointmentId?: string;
}

export interface CreatePatientParams {
  readonly id: string;
  readonly phone: PhoneNumber;
  readonly email?: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth?: Date;
  readonly address?: string;
  readonly city?: string;
  readonly county?: string;
  readonly assignedProviderId?: string;
  readonly hubspotContactId?: string;
  readonly source?: 'direct_registration' | 'referral' | 'transfer';
  readonly preferredLanguage?: 'ro' | 'en' | 'de';
  readonly preferredChannel?: CommunicationChannel;
  readonly preferredContactTime?: 'morning' | 'afternoon' | 'evening' | 'any';
}

export interface StartTreatmentParams {
  readonly treatmentPlanId: string;
  readonly procedureType: string;
  readonly providerId: string;
  readonly estimatedCompletionDate?: Date;
  readonly estimatedCost?: number;
  readonly phases?: readonly string[];
}

export interface CompleteTreatmentParams {
  readonly treatmentPlanId: string;
  readonly outcome: 'successful' | 'partial' | 'complications';
  readonly followUpRequired: boolean;
  readonly followUpScheduledFor?: Date;
}

export interface ScheduleAppointmentParams {
  readonly appointmentId: string;
  readonly appointmentType: string;
  readonly scheduledFor: Date;
  readonly duration: number;
  readonly providerId: string;
  readonly location?: string;
  readonly isFollowUp?: boolean;
  readonly treatmentPlanId?: string;
}

export interface UpdateDemographicsParams {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly dateOfBirth?: Date;
  readonly address?: string;
  readonly city?: string;
  readonly county?: string;
}

// ============================================================================
// ERRORS
// ============================================================================

export class PatientError extends Error {
  readonly code: string;
  readonly patientId: string;

  constructor(code: string, patientId: string, message: string) {
    super(message);
    this.name = 'PatientError';
    this.code = code;
    this.patientId = patientId;
    Object.setPrototypeOf(this, PatientError.prototype);
  }
}

export class PatientDeletedError extends PatientError {
  constructor(patientId: string) {
    super('PATIENT_DELETED', patientId, `Patient ${patientId} has been deleted`);
    this.name = 'PatientDeletedError';
    Object.setPrototypeOf(this, PatientDeletedError.prototype);
  }
}

export class PatientArchivedError extends PatientError {
  constructor(patientId: string) {
    super('PATIENT_ARCHIVED', patientId, `Patient ${patientId} is archived`);
    this.name = 'PatientArchivedError';
    Object.setPrototypeOf(this, PatientArchivedError.prototype);
  }
}

export class PatientNotActiveError extends PatientError {
  readonly status: PatientStatus;

  constructor(patientId: string, status: PatientStatus) {
    super('PATIENT_NOT_ACTIVE', patientId, `Patient ${patientId} is not active: ${status}`);
    this.name = 'PatientNotActiveError';
    this.status = status;
    Object.setPrototypeOf(this, PatientNotActiveError.prototype);
  }
}

export class InvalidPatientStatusTransitionError extends PatientError {
  readonly fromStatus: PatientStatus;
  readonly toStatus: PatientStatus;

  constructor(patientId: string, from: PatientStatus, to: PatientStatus) {
    super(
      'INVALID_STATUS_TRANSITION',
      patientId,
      `Invalid status transition from '${from}' to '${to}' for patient ${patientId}`
    );
    this.name = 'InvalidPatientStatusTransitionError';
    this.fromStatus = from;
    this.toStatus = to;
    Object.setPrototypeOf(this, InvalidPatientStatusTransitionError.prototype);
  }
}
