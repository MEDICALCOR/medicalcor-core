/**
 * @fileoverview Case Aggregate Root
 *
 * Banking/Medical Grade DDD Aggregate Root for Case lifecycle management.
 * Links treatment plans to payments with end-to-end visibility.
 *
 * @module domain/cases/entities/case
 *
 * DESIGN PRINCIPLES:
 * 1. AGGREGATE ROOT - All Case modifications go through this class
 * 2. INVARIANT ENFORCEMENT - Business rules are enforced here
 * 3. EVENT SOURCING - State changes emit domain events
 * 4. TELL DON'T ASK - Rich domain methods instead of anemic getters
 *
 * LIFECYCLE:
 * pending → [start] → in_progress → [complete] → completed
 *    ↓          ↓          ↓
 * on_hold ← → on_hold ← → on_hold
 *    ↓          ↓          ↓
 * cancelled   cancelled   cancelled
 *
 * @example
 * ```typescript
 * // Create new case from treatment plan acceptance
 * const caseEntity = CaseAggregateRoot.create({
 *   clinicId: 'clinic-123',
 *   leadId: 'lead-456',
 *   treatmentPlanId: 'plan-789',
 *   caseNumber: 'CASE-2024-001',
 *   totalAmount: 15000,
 *   currency: 'EUR',
 * });
 *
 * // Start treatment
 * caseEntity.start('Treatment beginning');
 *
 * // Record a payment
 * caseEntity.recordPayment({
 *   paymentId: 'pay-123',
 *   amount: 5000,
 *   method: 'card',
 * });
 *
 * // Get uncommitted events for persistence
 * const events = caseEntity.getUncommittedEvents();
 * ```
 */

// ============================================================================
// CASE STATUS & TYPES
// ============================================================================

/**
 * Case lifecycle status
 */
export type CaseStatus =
  | 'pending' // Treatment plan accepted, awaiting start
  | 'in_progress' // Treatment ongoing
  | 'completed' // Treatment finished
  | 'cancelled' // Case cancelled
  | 'on_hold'; // Temporarily paused

/**
 * Payment status for a case
 */
export type PaymentStatus =
  | 'unpaid' // No payments received
  | 'partial' // Some payments received
  | 'paid' // Fully paid
  | 'overpaid' // More than total paid
  | 'refunded'; // Full refund issued

/**
 * Payment type
 */
export type PaymentType =
  | 'payment' // Regular payment
  | 'deposit' // Initial deposit
  | 'installment' // Payment plan installment
  | 'refund' // Money returned to patient
  | 'adjustment' // Manual adjustment
  | 'financing_payout'; // Payment from financing provider

/**
 * Payment method
 */
export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'bank_transfer'
  | 'financing'
  | 'insurance'
  | 'check'
  | 'other';

/**
 * Payment status for individual payments
 */
export type IndividualPaymentStatus =
  | 'pending' // Awaiting processing
  | 'completed' // Successfully processed
  | 'failed' // Processing failed
  | 'cancelled' // Cancelled before processing
  | 'refunded'; // Payment refunded

// ============================================================================
// CASE AGGREGATE STATE
// ============================================================================

/**
 * Internal state for the Case aggregate
 */
export interface CaseAggregateState {
  readonly id: string;
  readonly version: number;
  readonly clinicId: string;
  readonly leadId: string;
  readonly treatmentPlanId: string;
  readonly caseNumber: string;
  readonly status: CaseStatus;

  // Financial summary
  readonly totalAmount: number;
  readonly paidAmount: number;
  readonly outstandingAmount: number;
  readonly currency: string;
  readonly paymentStatus: PaymentStatus;

  // Financing
  readonly financingProvider?: string;
  readonly financingReference?: string;
  readonly financingApprovedAt?: Date;

  // Timeline
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly expectedCompletionDate?: Date;

  // Metadata
  readonly notes?: string;
  readonly metadata: Record<string, unknown>;

  // Audit
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date;
}

/**
 * @deprecated Use CaseAggregateState instead. Kept for backward compatibility.
 */
export type Case = CaseAggregateState;

// ============================================================================
// AGGREGATE EVENTS (Internal Event Sourcing)
// ============================================================================

/**
 * Internal domain event for Case aggregate root event sourcing.
 * Not to be confused with CaseDomainEvent in case-events.ts which are external integration events.
 */
export interface CaseAggregateEvent<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly aggregateId: string;
  readonly aggregateType: 'Case';
  readonly version: number;
  readonly timestamp: Date;
  readonly correlationId?: string;
  readonly causationId?: string;
}

// ============================================================================
// PAYMENT ENTITY
// ============================================================================

/**
 * Payment entity - individual financial transaction
 */
export interface Payment {
  /** Unique payment identifier */
  readonly id: string;

  /** Case this payment belongs to */
  readonly caseId: string;

  /** Clinic processing the payment */
  readonly clinicId: string;

  /** Payment reference (internal) */
  readonly paymentReference: string;

  /** External processor reference */
  readonly externalReference?: string;

  /** Payment amount (negative for refunds) */
  readonly amount: number;

  /** Currency code */
  readonly currency: string;

  /** Type of payment */
  readonly type: PaymentType;

  /** Payment method used */
  readonly method: PaymentMethod;

  /** Payment status */
  readonly status: IndividualPaymentStatus;

  // Processing details
  /** When payment was processed */
  readonly processedAt?: Date;

  /** Name of payment processor */
  readonly processorName?: string;

  /** Transaction ID from processor */
  readonly processorTransactionId?: string;

  /** Reason if payment failed */
  readonly failureReason?: string;

  // Receipt
  /** Receipt number */
  readonly receiptNumber?: string;

  /** URL to receipt document */
  readonly receiptUrl?: string;

  // Metadata
  readonly notes?: string;
  readonly metadata: Record<string, unknown>;

  // Audit
  readonly receivedBy?: string;
  readonly createdBy?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ============================================================================
// PAYMENT PLAN ENTITIES
// ============================================================================

/**
 * Payment plan frequency
 */
export type PaymentPlanFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

/**
 * Payment plan status
 */
export type PaymentPlanStatus = 'active' | 'completed' | 'defaulted' | 'cancelled';

/**
 * Installment status
 */
export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | 'skipped' | 'cancelled';

/**
 * Payment plan - scheduled installment payments
 */
export interface PaymentPlan {
  readonly id: string;
  readonly caseId: string;
  readonly name: string;
  readonly totalAmount: number;
  readonly numberOfInstallments: number;
  readonly installmentAmount: number;
  readonly frequency: PaymentPlanFrequency;
  readonly startDate: Date;
  readonly nextDueDate?: Date;
  readonly status: PaymentPlanStatus;
  readonly installmentsPaid: number;
  readonly totalPaid: number;
  readonly interestRate: number;
  readonly lateFee: number;
  readonly notes?: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Individual payment plan installment
 */
export interface PaymentPlanInstallment {
  readonly id: string;
  readonly paymentPlanId: string;
  readonly paymentId?: string; // Linked when paid
  readonly installmentNumber: number;
  readonly amount: number;
  readonly dueDate: Date;
  readonly status: InstallmentStatus;
  readonly paidAt?: Date;
  readonly paidAmount?: number;
  readonly lateFeeApplied: number;
  readonly reminderSentAt?: Date;
  readonly reminderCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ============================================================================
// CASE AGGREGATE ROOT
// ============================================================================

/**
 * Case Aggregate Root
 *
 * Encapsulates all Case domain logic and enforces invariants.
 * All state changes are made through domain events.
 */
export class CaseAggregateRoot {
  private _state: CaseAggregateState;
  private _uncommittedEvents: CaseAggregateEvent[] = [];

  private constructor(state: CaseAggregateState) {
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

  get clinicId(): string {
    return this._state.clinicId;
  }

  get leadId(): string {
    return this._state.leadId;
  }

  get treatmentPlanId(): string {
    return this._state.treatmentPlanId;
  }

  get caseNumber(): string {
    return this._state.caseNumber;
  }

  get status(): CaseStatus {
    return this._state.status;
  }

  get totalAmount(): number {
    return this._state.totalAmount;
  }

  get paidAmount(): number {
    return this._state.paidAmount;
  }

  get outstandingAmount(): number {
    return this._state.outstandingAmount;
  }

  get currency(): string {
    return this._state.currency;
  }

  get paymentStatus(): PaymentStatus {
    return this._state.paymentStatus;
  }

  get financingProvider(): string | undefined {
    return this._state.financingProvider;
  }

  get financingReference(): string | undefined {
    return this._state.financingReference;
  }

  get financingApprovedAt(): Date | undefined {
    return this._state.financingApprovedAt;
  }

  get startedAt(): Date | undefined {
    return this._state.startedAt;
  }

  get completedAt(): Date | undefined {
    return this._state.completedAt;
  }

  get expectedCompletionDate(): Date | undefined {
    return this._state.expectedCompletionDate;
  }

  get notes(): string | undefined {
    return this._state.notes;
  }

  get createdAt(): Date {
    return this._state.createdAt;
  }

  get updatedAt(): Date {
    return this._state.updatedAt;
  }

  get deletedAt(): Date | undefined {
    return this._state.deletedAt;
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if case is active (not cancelled, completed, or deleted)
   */
  isActive(): boolean {
    return (
      this._state.status !== 'cancelled' &&
      this._state.status !== 'completed' &&
      this._state.deletedAt === undefined
    );
  }

  /**
   * Check if case is in progress
   */
  isInProgress(): boolean {
    return this._state.status === 'in_progress';
  }

  /**
   * Check if case is pending (not yet started)
   */
  isPending(): boolean {
    return this._state.status === 'pending';
  }

  /**
   * Check if case is on hold
   */
  isOnHold(): boolean {
    return this._state.status === 'on_hold';
  }

  /**
   * Check if case is completed
   */
  isCompleted(): boolean {
    return this._state.status === 'completed';
  }

  /**
   * Check if case is cancelled
   */
  isCancelled(): boolean {
    return this._state.status === 'cancelled';
  }

  /**
   * Check if case is deleted
   */
  isDeleted(): boolean {
    return this._state.deletedAt !== undefined;
  }

  /**
   * Check if case can accept payments
   */
  canAcceptPayment(): boolean {
    return (
      this._state.status !== 'cancelled' &&
      this._state.deletedAt === undefined &&
      this._state.paymentStatus !== 'paid' &&
      this._state.paymentStatus !== 'overpaid'
    );
  }

  /**
   * Check if case can be modified
   */
  canModify(): boolean {
    return (
      this._state.status !== 'completed' &&
      this._state.status !== 'cancelled' &&
      this._state.deletedAt === undefined
    );
  }

  /**
   * Check if a status transition is valid from the current status
   */
  canTransitionTo(newStatus: CaseStatus): boolean {
    return VALID_CASE_TRANSITIONS[this._state.status].includes(newStatus);
  }

  /**
   * Check if case is fully paid
   */
  isFullyPaid(): boolean {
    return this._state.paymentStatus === 'paid' || this._state.paymentStatus === 'overpaid';
  }

  /**
   * Check if case has financing
   */
  hasFinancing(): boolean {
    return this._state.financingProvider !== undefined;
  }

  /**
   * Get remaining balance
   */
  getRemainingBalance(): number {
    return Math.max(0, this._state.totalAmount - this._state.paidAmount);
  }

  /**
   * Get payment progress percentage
   */
  getPaymentProgress(): number {
    if (this._state.totalAmount === 0) return 100;
    return Math.min(100, Math.round((this._state.paidAmount / this._state.totalAmount) * 100));
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new Case aggregate
   */
  static create(input: CreateCaseInput, correlationId?: string): CaseAggregateRoot {
    const now = new Date();
    const state: CaseAggregateState = {
      id: generateUUID(),
      version: 0,
      clinicId: input.clinicId,
      leadId: input.leadId,
      treatmentPlanId: input.treatmentPlanId,
      caseNumber: input.caseNumber,
      status: 'pending',
      totalAmount: input.totalAmount,
      paidAmount: 0,
      outstandingAmount: input.totalAmount,
      currency: input.currency ?? 'EUR',
      paymentStatus: 'unpaid',
      expectedCompletionDate: input.expectedCompletionDate,
      notes: input.notes,
      metadata: {},
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    const caseEntity = new CaseAggregateRoot(state);

    caseEntity.raise(
      'case.created',
      {
        clinicId: input.clinicId,
        leadId: input.leadId,
        treatmentPlanId: input.treatmentPlanId,
        caseNumber: input.caseNumber,
        totalAmount: input.totalAmount,
        currency: input.currency ?? 'EUR',
        expectedCompletionDate: input.expectedCompletionDate?.toISOString(),
        createdBy: input.createdBy,
      },
      correlationId
    );

    return caseEntity;
  }

  /**
   * Reconstitute a Case from existing state (for loading from DB)
   */
  static reconstitute(state: CaseAggregateState): CaseAggregateRoot {
    return new CaseAggregateRoot(state);
  }

  /**
   * Reconstitute a Case from event history (event sourcing)
   */
  static fromEvents(id: string, events: CaseAggregateEvent[]): CaseAggregateRoot {
    const initialState: CaseAggregateState = {
      id,
      version: 0,
      clinicId: '',
      leadId: '',
      treatmentPlanId: '',
      caseNumber: '',
      status: 'pending',
      totalAmount: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      currency: 'EUR',
      paymentStatus: 'unpaid',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const caseEntity = new CaseAggregateRoot(initialState);
    caseEntity.loadFromHistory(events);
    return caseEntity;
  }

  // ============================================================================
  // DOMAIN METHODS (State-changing operations)
  // ============================================================================

  /**
   * Start the case (begin treatment)
   *
   * @throws CaseCancelledError if case is cancelled
   * @throws CaseDeletedError if case is deleted
   * @throws InvalidCaseStatusTransitionError if transition is not valid
   */
  start(reason?: string, startedBy?: string, correlationId?: string): void {
    this.ensureCanModify();
    this.ensureCanTransition('in_progress');

    this.raise(
      'case.started',
      {
        caseNumber: this._state.caseNumber,
        reason,
        startedBy,
        previousStatus: this._state.status,
      },
      correlationId
    );
  }

  /**
   * Complete the case
   *
   * @throws CaseCancelledError if case is cancelled
   * @throws InvalidCaseStatusTransitionError if transition is not valid
   */
  complete(outcome?: string, completedBy?: string, correlationId?: string): void {
    this.ensureCanModify();
    this.ensureCanTransition('completed');

    this.raise(
      'case.completed',
      {
        caseNumber: this._state.caseNumber,
        outcome,
        completedBy,
        previousStatus: this._state.status,
        finalPaymentStatus: this._state.paymentStatus,
        outstandingAmount: this._state.outstandingAmount,
      },
      correlationId
    );
  }

  /**
   * Cancel the case
   *
   * @throws CaseDeletedError if case is deleted
   * @throws InvalidCaseStatusTransitionError if transition is not valid
   */
  cancel(
    reason: 'patient_request' | 'clinic_decision' | 'financial' | 'medical' | 'other',
    reasonDetails?: string,
    cancelledBy?: string,
    correlationId?: string
  ): void {
    if (this._state.deletedAt !== undefined) {
      throw new CaseDeletedError(this._state.id);
    }
    this.ensureCanTransition('cancelled');

    this.raise(
      'case.cancelled',
      {
        caseNumber: this._state.caseNumber,
        reason,
        reasonDetails,
        cancelledBy,
        previousStatus: this._state.status,
        refundRequired: this._state.paidAmount > 0,
        paidAmount: this._state.paidAmount,
      },
      correlationId
    );
  }

  /**
   * Put case on hold
   *
   * @throws CaseCancelledError if case is cancelled
   * @throws CaseDeletedError if case is deleted
   * @throws InvalidCaseStatusTransitionError if transition is not valid
   */
  putOnHold(reason: string, holdBy?: string, correlationId?: string): void {
    this.ensureCanModify();
    this.ensureCanTransition('on_hold');

    this.raise(
      'case.on_hold',
      {
        caseNumber: this._state.caseNumber,
        reason,
        holdBy,
        previousStatus: this._state.status,
      },
      correlationId
    );
  }

  /**
   * Resume case from hold
   *
   * @throws CaseDeletedError if case is deleted
   * @throws CaseError if case is not on hold
   */
  resume(resumeToStatus: 'pending' | 'in_progress', reason?: string, correlationId?: string): void {
    if (this._state.deletedAt !== undefined) {
      throw new CaseDeletedError(this._state.id);
    }
    if (this._state.status !== 'on_hold') {
      throw new CaseError('CASE_NOT_ON_HOLD', this._state.id, 'Case is not on hold');
    }
    if (!this.canTransitionTo(resumeToStatus)) {
      throw new InvalidCaseStatusTransitionError(
        this._state.id,
        this._state.status,
        resumeToStatus
      );
    }

    this.raise(
      'case.resumed',
      {
        caseNumber: this._state.caseNumber,
        newStatus: resumeToStatus,
        reason,
      },
      correlationId
    );
  }

  /**
   * Record a payment on the case
   *
   * @throws CaseError if case cannot accept payments
   */
  recordPayment(
    params: {
      paymentId: string;
      amount: number;
      method: PaymentMethod;
      type?: PaymentType;
      reference?: string;
      processedBy?: string;
    },
    correlationId?: string
  ): void {
    if (!this.canAcceptPayment()) {
      throw new CaseError(
        'CASE_CANNOT_ACCEPT_PAYMENT',
        this._state.id,
        `Case ${this._state.id} cannot accept payments in current state`
      );
    }

    const newPaidAmount = this._state.paidAmount + params.amount;
    const newPaymentStatus = calculatePaymentStatus(this._state.totalAmount, newPaidAmount);

    this.raise(
      'case.payment_recorded',
      {
        caseNumber: this._state.caseNumber,
        paymentId: params.paymentId,
        amount: params.amount,
        method: params.method,
        type: params.type ?? 'payment',
        reference: params.reference,
        processedBy: params.processedBy,
        previousPaidAmount: this._state.paidAmount,
        newPaidAmount,
        previousPaymentStatus: this._state.paymentStatus,
        newPaymentStatus,
      },
      correlationId
    );
  }

  /**
   * Record a refund on the case
   */
  recordRefund(
    params: {
      refundId: string;
      amount: number;
      reason: string;
      processedBy?: string;
    },
    correlationId?: string
  ): void {
    if (this._state.paidAmount < params.amount) {
      throw new CaseError(
        'INSUFFICIENT_PAID_AMOUNT',
        this._state.id,
        `Cannot refund ${params.amount} when only ${this._state.paidAmount} was paid`
      );
    }

    const newPaidAmount = this._state.paidAmount - params.amount;
    const newPaymentStatus = calculatePaymentStatus(this._state.totalAmount, newPaidAmount);

    this.raise(
      'case.refund_recorded',
      {
        caseNumber: this._state.caseNumber,
        refundId: params.refundId,
        amount: params.amount,
        reason: params.reason,
        processedBy: params.processedBy,
        previousPaidAmount: this._state.paidAmount,
        newPaidAmount,
        newPaymentStatus,
      },
      correlationId
    );
  }

  /**
   * Add financing to the case
   */
  addFinancing(
    provider: string,
    reference: string,
    approvedAmount?: number,
    correlationId?: string
  ): void {
    this.ensureCanModify();

    this.raise(
      'case.financing_added',
      {
        caseNumber: this._state.caseNumber,
        provider,
        reference,
        approvedAmount: approvedAmount ?? this._state.totalAmount,
      },
      correlationId
    );
  }

  /**
   * Update case notes
   */
  updateNotes(notes: string, updatedBy?: string, correlationId?: string): void {
    this.ensureCanModify();

    this.raise(
      'case.notes_updated',
      {
        caseNumber: this._state.caseNumber,
        previousNotes: this._state.notes,
        newNotes: notes,
        updatedBy,
      },
      correlationId
    );
  }

  /**
   * Update expected completion date
   */
  updateExpectedCompletionDate(date: Date, reason?: string, correlationId?: string): void {
    this.ensureCanModify();

    this.raise(
      'case.expected_completion_updated',
      {
        caseNumber: this._state.caseNumber,
        previousDate: this._state.expectedCompletionDate?.toISOString(),
        newDate: date.toISOString(),
        reason,
      },
      correlationId
    );
  }

  /**
   * Soft delete the case
   */
  softDelete(reason: string, deletedBy?: string, correlationId?: string): void {
    if (this._state.deletedAt !== undefined) {
      return; // Already deleted
    }

    this.raise(
      'case.deleted',
      {
        caseNumber: this._state.caseNumber,
        reason,
        deletedBy,
        status: this._state.status,
        paymentStatus: this._state.paymentStatus,
        outstandingAmount: this._state.outstandingAmount,
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
  getUncommittedEvents(): readonly CaseAggregateEvent[] {
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
  loadFromHistory(events: CaseAggregateEvent[]): void {
    for (const event of events) {
      this.apply(event);
    }
  }

  /**
   * Get current state (for persistence)
   */
  getState(): Readonly<CaseAggregateState> {
    return this._state;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Raise a domain event
   */
  private raise(type: string, payload: unknown, correlationId?: string): void {
    const event: CaseAggregateEvent = {
      type,
      payload,
      aggregateId: this._state.id,
      aggregateType: 'Case',
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
  private apply(event: CaseAggregateEvent): void {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case 'case.created':
        this._state = {
          ...this._state,
          clinicId: payload.clinicId as string,
          leadId: payload.leadId as string,
          treatmentPlanId: payload.treatmentPlanId as string,
          caseNumber: payload.caseNumber as string,
          totalAmount: payload.totalAmount as number,
          outstandingAmount: payload.totalAmount as number,
          currency: payload.currency as string,
          expectedCompletionDate: payload.expectedCompletionDate
            ? new Date(payload.expectedCompletionDate as string)
            : undefined,
          createdBy: payload.createdBy as string | undefined,
          status: 'pending',
        };
        break;

      case 'case.started':
        this._state = {
          ...this._state,
          status: 'in_progress',
          startedAt: event.timestamp,
        };
        break;

      case 'case.completed':
        this._state = {
          ...this._state,
          status: 'completed',
          completedAt: event.timestamp,
        };
        break;

      case 'case.cancelled':
        this._state = {
          ...this._state,
          status: 'cancelled',
        };
        break;

      case 'case.on_hold':
        this._state = {
          ...this._state,
          status: 'on_hold',
        };
        break;

      case 'case.resumed':
        this._state = {
          ...this._state,
          status: payload.newStatus as CaseStatus,
        };
        break;

      case 'case.payment_recorded':
        this._state = {
          ...this._state,
          paidAmount: payload.newPaidAmount as number,
          outstandingAmount: this._state.totalAmount - (payload.newPaidAmount as number),
          paymentStatus: payload.newPaymentStatus as PaymentStatus,
        };
        break;

      case 'case.refund_recorded':
        this._state = {
          ...this._state,
          paidAmount: payload.newPaidAmount as number,
          outstandingAmount: this._state.totalAmount - (payload.newPaidAmount as number),
          paymentStatus: payload.newPaymentStatus as PaymentStatus,
        };
        break;

      case 'case.financing_added':
        this._state = {
          ...this._state,
          financingProvider: payload.provider as string,
          financingReference: payload.reference as string,
          financingApprovedAt: event.timestamp,
        };
        break;

      case 'case.notes_updated':
        this._state = {
          ...this._state,
          notes: payload.newNotes as string,
        };
        break;

      case 'case.expected_completion_updated':
        this._state = {
          ...this._state,
          expectedCompletionDate: new Date(payload.newDate as string),
        };
        break;

      case 'case.deleted':
        this._state = {
          ...this._state,
          deletedAt: event.timestamp,
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
   * Ensure case can be modified
   */
  private ensureCanModify(): void {
    if (this._state.deletedAt !== undefined) {
      throw new CaseDeletedError(this._state.id);
    }
    if (this._state.status === 'cancelled') {
      throw new CaseCancelledError(this._state.id);
    }
    if (this._state.status === 'completed') {
      throw new CaseCompletedError(this._state.id);
    }
  }

  /**
   * Ensure status transition is valid
   */
  private ensureCanTransition(newStatus: CaseStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidCaseStatusTransitionError(this._state.id, this._state.status, newStatus);
    }
  }
}

// ============================================================================
// CASE FACTORY (Legacy - use CaseAggregateRoot.create instead)
// ============================================================================

/**
 * Input for creating a new case
 */
export interface CreateCaseInput {
  clinicId: string;
  leadId: string;
  treatmentPlanId: string;
  caseNumber: string;
  totalAmount: number;
  currency?: string;
  expectedCompletionDate?: Date;
  notes?: string;
  createdBy?: string;
}

/**
 * Generate a UUID v4 using crypto.randomUUID
 */
function generateUUID(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Create a new case
 * @deprecated Use CaseAggregateRoot.create() instead for rich domain behavior
 */
export function createCase(input: CreateCaseInput): Case {
  const now = new Date();

  return {
    id: generateUUID(),
    version: 0,
    clinicId: input.clinicId,
    leadId: input.leadId,
    treatmentPlanId: input.treatmentPlanId,
    caseNumber: input.caseNumber,
    status: 'pending',
    totalAmount: input.totalAmount,
    paidAmount: 0,
    outstandingAmount: input.totalAmount,
    currency: input.currency ?? 'EUR',
    paymentStatus: 'unpaid',
    expectedCompletionDate: input.expectedCompletionDate,
    notes: input.notes,
    metadata: {},
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// PAYMENT FACTORY
// ============================================================================

/**
 * Input for creating a payment
 */
export interface CreatePaymentInput {
  caseId: string;
  clinicId: string;
  paymentReference: string;
  amount: number;
  currency?: string;
  type?: PaymentType;
  method: PaymentMethod;
  externalReference?: string;
  notes?: string;
  createdBy?: string;
}

/**
 * Create a new payment
 */
export function createPayment(input: CreatePaymentInput): Payment {
  const now = new Date();

  return {
    id: generateUUID(),
    caseId: input.caseId,
    clinicId: input.clinicId,
    paymentReference: input.paymentReference,
    externalReference: input.externalReference,
    amount: input.amount,
    currency: input.currency ?? 'EUR',
    type: input.type ?? 'payment',
    method: input.method,
    status: 'pending',
    notes: input.notes,
    metadata: {},
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// CASE STATE HELPERS
// ============================================================================

/**
 * Valid status transitions for cases
 */
const VALID_CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  pending: ['in_progress', 'cancelled', 'on_hold'],
  in_progress: ['completed', 'cancelled', 'on_hold'],
  completed: [], // Terminal state
  cancelled: [], // Terminal state
  on_hold: ['pending', 'in_progress', 'cancelled'],
};

/**
 * Check if a case status transition is valid
 * @deprecated Use CaseAggregateRoot.canTransitionTo() instance method instead
 */
export function isValidCaseTransition(current: CaseStatus, next: CaseStatus): boolean {
  return VALID_CASE_TRANSITIONS[current].includes(next);
}

/**
 * Calculate payment status from amounts
 *
 * Note: This is a pure utility function and remains useful as a module function.
 */
export function calculatePaymentStatus(totalAmount: number, paidAmount: number): PaymentStatus {
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount < totalAmount) return 'partial';
  if (paidAmount === totalAmount) return 'paid';
  return 'overpaid';
}

/**
 * Check if case can accept payments
 * @deprecated Use CaseAggregateRoot.canAcceptPayment() instance method instead
 */
export function canAcceptPayment(caseEntity: Case): boolean {
  return (
    caseEntity.status !== 'cancelled' &&
    caseEntity.deletedAt === undefined &&
    caseEntity.paymentStatus !== 'paid' &&
    caseEntity.paymentStatus !== 'overpaid'
  );
}

/**
 * Check if case is active
 * @deprecated Use CaseAggregateRoot.isActive() instance method instead
 */
export function isCaseActive(caseEntity: Case): boolean {
  return (
    caseEntity.status !== 'cancelled' &&
    caseEntity.status !== 'completed' &&
    caseEntity.deletedAt === undefined
  );
}

// ============================================================================
// ERRORS
// ============================================================================

export class CaseError extends Error {
  readonly code: string;
  readonly caseId: string;

  constructor(code: string, caseId: string, message: string) {
    super(message);
    this.name = 'CaseError';
    this.code = code;
    this.caseId = caseId;
    Object.setPrototypeOf(this, CaseError.prototype);
  }
}

export class CaseDeletedError extends CaseError {
  constructor(caseId: string) {
    super('CASE_DELETED', caseId, `Case ${caseId} has been deleted`);
    this.name = 'CaseDeletedError';
    Object.setPrototypeOf(this, CaseDeletedError.prototype);
  }
}

export class CaseCancelledError extends CaseError {
  constructor(caseId: string) {
    super('CASE_CANCELLED', caseId, `Case ${caseId} has been cancelled`);
    this.name = 'CaseCancelledError';
    Object.setPrototypeOf(this, CaseCancelledError.prototype);
  }
}

export class CaseCompletedError extends CaseError {
  constructor(caseId: string) {
    super('CASE_COMPLETED', caseId, `Case ${caseId} is already completed`);
    this.name = 'CaseCompletedError';
    Object.setPrototypeOf(this, CaseCompletedError.prototype);
  }
}

export class InvalidCaseStatusTransitionError extends CaseError {
  readonly fromStatus: CaseStatus;
  readonly toStatus: CaseStatus;

  constructor(caseId: string, from: CaseStatus, to: CaseStatus) {
    super(
      'INVALID_STATUS_TRANSITION',
      caseId,
      `Invalid status transition from '${from}' to '${to}' for case ${caseId}`
    );
    this.name = 'InvalidCaseStatusTransitionError';
    this.fromStatus = from;
    this.toStatus = to;
    Object.setPrototypeOf(this, InvalidCaseStatusTransitionError.prototype);
  }
}
