/**
 * @fileoverview Lead Aggregate Root
 *
 * Banking/Medical Grade DDD Aggregate Root for Lead lifecycle management.
 * This is the entry point for all Lead-related domain operations.
 *
 * @module domain/leads/entities/Lead
 *
 * DESIGN PRINCIPLES:
 * 1. AGGREGATE ROOT - All Lead modifications go through this class
 * 2. INVARIANT ENFORCEMENT - Business rules are enforced here
 * 3. EVENT SOURCING - State changes emit domain events
 * 4. TELL DON'T ASK - Rich domain methods instead of anemic getters
 *
 * USAGE:
 * ```typescript
 * // Create new lead
 * const lead = LeadAggregateRoot.create({
 *   id: 'lead-123',
 *   phone: PhoneNumber.create('+40700000001'),
 *   source: 'whatsapp',
 * });
 *
 * // Score the lead
 * lead.score(LeadScore.hot(), {
 *   method: 'ai',
 *   reasoning: 'High intent detected',
 *   confidence: 0.9,
 * });
 *
 * // Get uncommitted events for persistence
 * const events = lead.getUncommittedEvents();
 * ```
 */

import {
  LeadScore,
  type LeadClassification,
} from '../../shared-kernel/value-objects/lead-score.js';
import { PhoneNumber } from '../../shared-kernel/value-objects/phone-number.js';
import type {
  LeadSource,
  LeadStatus,
  ConversationEntry,
  ScoringMetadata,
} from '../../shared-kernel/repository-interfaces/lead-repository.js';

// ============================================================================
// LEAD STATE
// ============================================================================

/**
 * Internal state for the Lead aggregate
 */
export interface LeadAggregateState {
  readonly id: string;
  readonly version: number;
  readonly phone: PhoneNumber;
  readonly email?: string;
  readonly hubspotContactId?: string;
  readonly hubspotDealId?: string;

  // Demographics
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: Date;
  readonly city?: string;
  readonly county?: string;

  // Lead metadata
  readonly source: LeadSource;
  readonly status: LeadStatus;
  readonly score?: LeadScore;

  // Medical context
  readonly primarySymptoms: readonly string[];
  readonly procedureInterest: readonly string[];
  readonly urgencyLevel?: 'emergency' | 'urgent' | 'routine' | 'preventive';

  // Conversation tracking
  readonly conversationHistory: readonly ConversationEntry[];
  readonly lastContactAt?: Date;

  // Assignment
  readonly assignedTo?: string;
  readonly assignedAt?: Date;

  // UTM tracking
  readonly utmSource?: string;
  readonly utmMedium?: string;
  readonly utmCampaign?: string;

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

export interface LeadDomainEvent<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly aggregateId: string;
  readonly aggregateType: 'Lead';
  readonly version: number;
  readonly timestamp: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
}

// ============================================================================
// LEAD AGGREGATE ROOT
// ============================================================================

/**
 * Lead Aggregate Root
 *
 * Encapsulates all Lead domain logic and enforces invariants.
 * All state changes are made through domain events.
 */
export class LeadAggregateRoot {
  private _state: LeadAggregateState;
  private _uncommittedEvents: LeadDomainEvent[] = [];

  private constructor(state: LeadAggregateState) {
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

  get phone(): PhoneNumber {
    return this._state.phone;
  }

  get email(): string | undefined {
    return this._state.email;
  }

  get source(): LeadSource {
    return this._state.source;
  }

  get status(): LeadStatus {
    return this._state.status;
  }

  get currentScore(): LeadScore | undefined {
    return this._state.score;
  }

  get classification(): LeadClassification | undefined {
    return this._state.score?.classification;
  }

  get firstName(): string | undefined {
    return this._state.firstName;
  }

  get lastName(): string | undefined {
    return this._state.lastName;
  }

  get fullName(): string | undefined {
    if (this._state.firstName && this._state.lastName) {
      return `${this._state.firstName} ${this._state.lastName}`;
    }
    return this._state.firstName ?? this._state.lastName;
  }

  get hubspotContactId(): string | undefined {
    return this._state.hubspotContactId;
  }

  get hubspotDealId(): string | undefined {
    return this._state.hubspotDealId;
  }

  get procedureInterest(): readonly string[] {
    return this._state.procedureInterest;
  }

  get urgencyLevel(): 'emergency' | 'urgent' | 'routine' | 'preventive' | undefined {
    return this._state.urgencyLevel;
  }

  get conversationHistory(): readonly ConversationEntry[] {
    return this._state.conversationHistory;
  }

  get lastContactAt(): Date | undefined {
    return this._state.lastContactAt;
  }

  get assignedTo(): string | undefined {
    return this._state.assignedTo;
  }

  get createdAt(): Date {
    return this._state.createdAt;
  }

  get updatedAt(): Date {
    return this._state.updatedAt;
  }

  get isDeleted(): boolean {
    return this._state.isDeleted;
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if lead is HOT (requires immediate attention)
   */
  isHot(): boolean {
    return this._state.score?.isHot() ?? false;
  }

  /**
   * Check if lead is qualified
   */
  isQualified(): boolean {
    return this._state.status === 'qualified' || this._state.status === 'converted';
  }

  /**
   * Check if lead is in a closed state (converted or lost)
   */
  isClosed(): boolean {
    return this._state.status === 'converted' || this._state.status === 'lost';
  }

  /**
   * Check if lead is active (not closed)
   */
  isActive(): boolean {
    return !this.isClosed() && !this._state.isDeleted;
  }

  /**
   * Check if lead requires immediate attention
   */
  requiresImmediateAttention(): boolean {
    return this._state.score?.requiresImmediateAttention() ?? false;
  }

  /**
   * Check if lead requires nurturing
   */
  requiresNurturing(): boolean {
    return this._state.score?.requiresNurturing() ?? false;
  }

  /**
   * Get SLA response time in minutes
   */
  getSLAResponseTimeMinutes(): number {
    return this._state.score?.getSLAResponseTimeMinutes() ?? 1440; // Default 24 hours
  }

  /**
   * Check if lead is assigned
   */
  isAssigned(): boolean {
    return this._state.assignedTo !== undefined;
  }

  /**
   * Check if lead can be modified
   */
  canModify(): boolean {
    return !this._state.isDeleted && !this.isClosed();
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new Lead aggregate
   */
  static create(params: CreateLeadParams, correlationId?: string): LeadAggregateRoot {
    const now = new Date();
    const state: LeadAggregateState = {
      id: params.id,
      version: 0,
      phone: params.phone,
      email: params.email,
      source: params.source,
      status: 'new',
      firstName: params.firstName,
      lastName: params.lastName,
      hubspotContactId: params.hubspotContactId,
      utmSource: params.utmSource,
      utmMedium: params.utmMedium,
      utmCampaign: params.utmCampaign,
      primarySymptoms: [],
      procedureInterest: [],
      conversationHistory: [],
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    const lead = new LeadAggregateRoot(state);

    lead.raise(
      'lead.created',
      {
        phone: params.phone.e164,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        source: params.source,
        hubspotContactId: params.hubspotContactId,
        utmSource: params.utmSource,
        utmMedium: params.utmMedium,
        utmCampaign: params.utmCampaign,
        language: params.phone.getPreferredLanguage(),
      },
      correlationId
    );

    return lead;
  }

  /**
   * Reconstitute a Lead from existing state (for loading from DB)
   */
  static reconstitute(state: LeadAggregateState): LeadAggregateRoot {
    return new LeadAggregateRoot(state);
  }

  /**
   * Reconstitute a Lead from event history (event sourcing)
   */
  static fromEvents(id: string, events: LeadDomainEvent[]): LeadAggregateRoot {
    // Start with minimal state
    const initialState: LeadAggregateState = {
      id,
      version: 0,
      phone: PhoneNumber.create('+40700000000'), // Placeholder, will be set by LeadCreated event
      source: 'manual',
      status: 'new',
      primarySymptoms: [],
      procedureInterest: [],
      conversationHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
    };

    const lead = new LeadAggregateRoot(initialState);
    lead.loadFromHistory(events);
    return lead;
  }

  // ============================================================================
  // DOMAIN METHODS (State-changing operations)
  // ============================================================================

  /**
   * Score the lead
   *
   * @throws LeadClosedError if lead is closed
   * @throws LeadDeletedError if lead is deleted
   */
  score(leadScore: LeadScore, metadata: ScoringMetadata, correlationId?: string): void {
    this.ensureCanModify();

    const previousScore = this._state.score?.numericValue;
    const previousClassification = this._state.score?.classification;

    this.raise(
      'lead.scored',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        channel: this.sourceToChannel(this._state.source),
        score: leadScore.numericValue,
        classification: leadScore.classification,
        confidence: metadata.confidence,
        method: metadata.method,
        reasoning: metadata.reasoning,
        suggestedAction: this.getSuggestedAction(leadScore),
        urgencyIndicators: metadata.urgencyIndicators,
        budgetMentioned: metadata.budgetMentioned,
        procedureInterest: metadata.procedureInterest,
        previousScore,
        previousClassification,
      },
      correlationId
    );

    // Auto-qualify if HOT
    if (leadScore.isHot() && this._state.status === 'new') {
      this.qualify(metadata.reasoning, metadata.procedureInterest, correlationId);
    }
  }

  /**
   * Qualify the lead (mark as qualified)
   *
   * @throws LeadClosedError if lead is already closed
   */
  qualify(reason: string, procedureInterest?: readonly string[], correlationId?: string): void {
    this.ensureCanModify();

    if (this._state.status === 'qualified') {
      return; // Already qualified, no-op
    }

    this.raise(
      'lead.qualified',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        score: this._state.score?.numericValue ?? 4,
        classification: 'HOT' as const,
        qualificationReason: reason,
        procedureInterest: procedureInterest ?? this._state.procedureInterest,
        assignedTo: this._state.assignedTo,
      },
      correlationId
    );
  }

  /**
   * Assign lead to an agent/user
   *
   * @throws LeadClosedError if lead is closed
   */
  assign(
    agentId: string,
    assignedBy: 'auto' | 'manual',
    reason: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    const priority = this._state.score?.getTaskPriority() ?? 'medium';
    const slaMinutes = this.getSLAResponseTimeMinutes();
    const slaDeadline = new Date(Date.now() + slaMinutes * 60 * 1000);

    this.raise(
      'lead.assigned',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        assignedTo: agentId,
        assignedBy,
        reason,
        priority,
        slaDeadline: slaDeadline.toISOString(),
      },
      correlationId
    );
  }

  /**
   * Record a contact with the lead
   */
  contact(
    channel: 'whatsapp' | 'voice' | 'sms' | 'email',
    direction: 'inbound' | 'outbound',
    outcome?: 'connected' | 'voicemail' | 'no_answer' | 'busy',
    messagePreview?: string,
    duration?: number,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'lead.contacted',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        channel,
        direction,
        outcome,
        messagePreview,
        duration,
      },
      correlationId
    );
  }

  /**
   * Record a message received from the lead
   */
  receiveMessage(
    channel: 'whatsapp' | 'voice' | 'web',
    messageId: string,
    content: string,
    analysis: {
      language?: 'ro' | 'en' | 'de';
      sentiment?: 'positive' | 'neutral' | 'negative';
      containsUrgency: boolean;
      containsBudgetMention: boolean;
    },
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'lead.message_received',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        channel,
        messageId,
        content,
        language: analysis.language,
        sentiment: analysis.sentiment,
        containsUrgency: analysis.containsUrgency,
        containsBudgetMention: analysis.containsBudgetMention,
      },
      correlationId
    );
  }

  /**
   * Add a conversation entry
   */
  addConversationEntry(entry: Omit<ConversationEntry, 'id'>): void {
    this.ensureCanModify();

    const entryWithId: ConversationEntry = {
      ...entry,
      id: this.generateEntryId(),
    };

    this._state = {
      ...this._state,
      conversationHistory: [...this._state.conversationHistory, entryWithId],
      lastContactAt: entry.timestamp,
      updatedAt: new Date(),
    };
  }

  /**
   * Transition lead status
   *
   * @throws InvalidStatusTransitionError if transition is not valid
   */
  transitionStatus(
    newStatus: LeadStatus,
    reason?: string,
    changedBy?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    if (!this.isValidTransition(this._state.status, newStatus)) {
      throw new InvalidStatusTransitionError(this._state.id, this._state.status, newStatus);
    }

    this.raise(
      'lead.status_changed',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        previousStatus: this._state.status,
        newStatus,
        reason,
        changedBy,
      },
      correlationId
    );
  }

  /**
   * Schedule an appointment for the lead
   */
  scheduleAppointment(
    appointmentId: string,
    appointmentType: string,
    scheduledFor: Date,
    duration: number,
    location?: string,
    provider?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'lead.appointment_scheduled',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        appointmentId,
        appointmentType,
        scheduledFor: scheduledFor.toISOString(),
        duration,
        location,
        provider,
        confirmationSent: false,
      },
      correlationId
    );

    // Auto-transition to scheduled status
    if (this._state.status !== 'scheduled') {
      this.transitionStatus('scheduled', 'Appointment scheduled', undefined, correlationId);
    }
  }

  /**
   * Cancel an appointment
   */
  cancelAppointment(
    appointmentId: string,
    reason: string,
    cancelledBy: 'patient' | 'clinic' | 'system',
    rescheduled = false,
    newAppointmentId?: string,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'lead.appointment_cancelled',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        appointmentId,
        reason,
        cancelledBy,
        rescheduled,
        newAppointmentId,
      },
      correlationId
    );
  }

  /**
   * Convert lead to patient
   */
  convert(
    patientId: string,
    procedure: string,
    appointmentId?: string,
    conversionValue?: number,
    correlationId?: string
  ): void {
    if (this._state.status === 'converted') {
      throw new LeadAlreadyConvertedError(this._state.id);
    }
    if (this._state.status === 'lost') {
      throw new LeadLostError(this._state.id);
    }
    if (this._state.isDeleted) {
      throw new LeadDeletedError(this._state.id);
    }

    const timeToConvertMs = Date.now() - this._state.createdAt.getTime();
    const timeToConvertDays = Math.ceil(timeToConvertMs / (1000 * 60 * 60 * 24));

    this.raise(
      'lead.converted',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        patientId,
        procedure,
        appointmentId,
        conversionValue,
        timeToConvertDays,
        touchpoints: this._state.conversationHistory.length,
      },
      correlationId
    );
  }

  /**
   * Mark lead as lost
   */
  markLost(
    reason: 'no_response' | 'competitor' | 'price' | 'timing' | 'invalid' | 'duplicate' | 'other',
    reasonDetails?: string,
    correlationId?: string
  ): void {
    if (this._state.status === 'lost') {
      return; // Already lost, no-op
    }
    if (this._state.status === 'converted') {
      throw new LeadAlreadyConvertedError(this._state.id);
    }
    if (this._state.isDeleted) {
      throw new LeadDeletedError(this._state.id);
    }

    this.raise(
      'lead.lost',
      {
        phone: this._state.phone.e164,
        hubspotContactId: this._state.hubspotContactId,
        reason,
        reasonDetails,
        lastContactAt: this._state.lastContactAt?.toISOString(),
        totalTouchpoints: this._state.conversationHistory.length,
      },
      correlationId
    );
  }

  /**
   * Soft delete the lead
   */
  softDelete(reason: string): void {
    if (this._state.isDeleted) {
      return; // Already deleted
    }

    this._state = {
      ...this._state,
      isDeleted: true,
      deletedAt: new Date(),
      deletionReason: reason,
      updatedAt: new Date(),
    };
  }

  /**
   * Restore a soft-deleted lead
   */
  restore(): void {
    if (!this._state.isDeleted) {
      return; // Not deleted
    }

    this._state = {
      ...this._state,
      isDeleted: false,
      deletedAt: undefined,
      deletionReason: undefined,
      updatedAt: new Date(),
    };
  }

  /**
   * Update lead demographics
   */
  updateDemographics(params: {
    firstName?: string;
    lastName?: string;
    email?: string;
    city?: string;
    county?: string;
    dateOfBirth?: Date;
  }): void {
    this.ensureCanModify();

    this._state = {
      ...this._state,
      ...(params.firstName !== undefined && { firstName: params.firstName }),
      ...(params.lastName !== undefined && { lastName: params.lastName }),
      ...(params.email !== undefined && { email: params.email }),
      ...(params.city !== undefined && { city: params.city }),
      ...(params.county !== undefined && { county: params.county }),
      ...(params.dateOfBirth !== undefined && { dateOfBirth: params.dateOfBirth }),
      updatedAt: new Date(),
    };
  }

  /**
   * Link to HubSpot contact
   */
  linkToHubSpot(contactId: string, dealId?: string): void {
    this.ensureCanModify();

    this._state = {
      ...this._state,
      hubspotContactId: contactId,
      ...(dealId !== undefined && { hubspotDealId: dealId }),
      updatedAt: new Date(),
    };
  }

  // ============================================================================
  // EVENT SOURCING
  // ============================================================================

  /**
   * Get uncommitted events
   */
  getUncommittedEvents(): readonly LeadDomainEvent[] {
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
  loadFromHistory(events: LeadDomainEvent[]): void {
    for (const event of events) {
      this.apply(event);
    }
  }

  /**
   * Get current state (for persistence)
   */
  getState(): Readonly<LeadAggregateState> {
    return this._state;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Raise a domain event
   */
  private raise(type: string, payload: unknown, correlationId?: string): void {
    const event: LeadDomainEvent = {
      type,
      payload,
      aggregateId: this._state.id,
      aggregateType: 'Lead',
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
  private apply(event: LeadDomainEvent): void {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case 'lead.created':
        this._state = {
          ...this._state,
          phone: PhoneNumber.create(payload.phone as string),
          email: payload.email as string | undefined,
          firstName: payload.firstName as string | undefined,
          lastName: payload.lastName as string | undefined,
          source: payload.source as LeadSource,
          hubspotContactId: payload.hubspotContactId as string | undefined,
          utmSource: payload.utmSource as string | undefined,
          utmMedium: payload.utmMedium as string | undefined,
          utmCampaign: payload.utmCampaign as string | undefined,
          status: 'new',
        };
        break;

      case 'lead.scored': {
        const newProcedures = payload.procedureInterest as string[] | undefined;
        this._state = {
          ...this._state,
          score: LeadScore.fromNumeric(payload.score as number, payload.confidence as number),
          procedureInterest: newProcedures ?? this._state.procedureInterest,
        };
        break;
      }

      case 'lead.qualified': {
        const qualifiedProcedures = payload.procedureInterest as string[] | undefined;
        this._state = {
          ...this._state,
          status: 'qualified',
          procedureInterest: qualifiedProcedures ?? this._state.procedureInterest,
        };
        break;
      }

      case 'lead.assigned':
        this._state = {
          ...this._state,
          assignedTo: payload.assignedTo as string,
          assignedAt: event.timestamp,
          status: this._state.status === 'new' ? 'contacted' : this._state.status,
        };
        break;

      case 'lead.contacted':
        this._state = {
          ...this._state,
          lastContactAt: event.timestamp,
          status: this._state.status === 'new' ? 'contacted' : this._state.status,
        };
        break;

      case 'lead.message_received':
        this._state = {
          ...this._state,
          lastContactAt: event.timestamp,
        };
        break;

      case 'lead.status_changed':
        this._state = {
          ...this._state,
          status: payload.newStatus as LeadStatus,
        };
        break;

      case 'lead.appointment_scheduled':
        this._state = {
          ...this._state,
          status: 'scheduled',
        };
        break;

      case 'lead.converted':
        this._state = {
          ...this._state,
          status: 'converted',
        };
        break;

      case 'lead.lost':
        this._state = {
          ...this._state,
          status: 'lost',
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
   * Ensure lead can be modified
   */
  private ensureCanModify(): void {
    if (this._state.isDeleted) {
      throw new LeadDeletedError(this._state.id);
    }
    if (this.isClosed()) {
      throw new LeadClosedError(this._state.id, this._state.status);
    }
  }

  /**
   * Check if status transition is valid
   */
  private isValidTransition(from: LeadStatus, to: LeadStatus): boolean {
    const validTransitions: Record<LeadStatus, LeadStatus[]> = {
      new: ['contacted', 'qualified', 'nurturing', 'scheduled', 'lost', 'invalid'],
      contacted: ['qualified', 'nurturing', 'scheduled', 'lost', 'invalid'],
      qualified: ['scheduled', 'nurturing', 'converted', 'lost'],
      nurturing: ['contacted', 'qualified', 'scheduled', 'lost'],
      scheduled: ['converted', 'lost', 'nurturing'],
      converted: [], // Terminal state
      lost: [], // Terminal state
      invalid: [], // Terminal state
    };

    return validTransitions[from].includes(to);
  }

  /**
   * Convert source to channel for events
   */
  private sourceToChannel(source: LeadSource): 'whatsapp' | 'voice' | 'web' | 'hubspot' {
    switch (source) {
      case 'whatsapp':
        return 'whatsapp';
      case 'voice':
        return 'voice';
      case 'hubspot':
        return 'hubspot';
      case 'web_form':
      case 'facebook':
      case 'google':
      case 'referral':
      case 'manual':
        return 'web';
    }
  }

  /**
   * Get suggested action based on score
   */
  private getSuggestedAction(score: LeadScore): string {
    if (score.isHot()) {
      return 'Contact within 5 minutes via WhatsApp or call';
    }
    if (score.isWarm()) {
      return 'Add to nurturing sequence and follow up within 24 hours';
    }
    if (score.isCold()) {
      return 'Add to long-term nurturing campaign';
    }
    return 'Review and archive if not a fit';
  }

  /**
   * Generate unique entry ID
   */
  private generateEntryId(): string {
    return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateLeadParams {
  readonly id: string;
  readonly phone: PhoneNumber;
  readonly source: LeadSource;
  readonly email?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly hubspotContactId?: string;
  readonly utmSource?: string;
  readonly utmMedium?: string;
  readonly utmCampaign?: string;
}

// ============================================================================
// ERRORS
// ============================================================================

export class LeadError extends Error {
  readonly code: string;
  readonly leadId: string;

  constructor(code: string, leadId: string, message: string) {
    super(message);
    this.name = 'LeadError';
    this.code = code;
    this.leadId = leadId;
    Object.setPrototypeOf(this, LeadError.prototype);
  }
}

export class LeadDeletedError extends LeadError {
  constructor(leadId: string) {
    super('LEAD_DELETED', leadId, `Lead ${leadId} has been deleted`);
    this.name = 'LeadDeletedError';
    Object.setPrototypeOf(this, LeadDeletedError.prototype);
  }
}

export class LeadClosedError extends LeadError {
  readonly status: LeadStatus;

  constructor(leadId: string, status: LeadStatus) {
    super('LEAD_CLOSED', leadId, `Lead ${leadId} is closed with status: ${status}`);
    this.name = 'LeadClosedError';
    this.status = status;
    Object.setPrototypeOf(this, LeadClosedError.prototype);
  }
}

export class LeadAlreadyConvertedError extends LeadError {
  constructor(leadId: string) {
    super('LEAD_ALREADY_CONVERTED', leadId, `Lead ${leadId} is already converted`);
    this.name = 'LeadAlreadyConvertedError';
    Object.setPrototypeOf(this, LeadAlreadyConvertedError.prototype);
  }
}

export class LeadLostError extends LeadError {
  constructor(leadId: string) {
    super('LEAD_LOST', leadId, `Lead ${leadId} is lost and cannot be modified`);
    this.name = 'LeadLostError';
    Object.setPrototypeOf(this, LeadLostError.prototype);
  }
}

export class InvalidStatusTransitionError extends LeadError {
  readonly fromStatus: LeadStatus;
  readonly toStatus: LeadStatus;

  constructor(leadId: string, from: LeadStatus, to: LeadStatus) {
    super(
      'INVALID_STATUS_TRANSITION',
      leadId,
      `Invalid status transition from '${from}' to '${to}' for lead ${leadId}`
    );
    this.name = 'InvalidStatusTransitionError';
    this.fromStatus = from;
    this.toStatus = to;
    Object.setPrototypeOf(this, InvalidStatusTransitionError.prototype);
  }
}
