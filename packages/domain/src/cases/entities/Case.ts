/**
 * @fileoverview Case Aggregate Root
 *
 * Domain entity linking treatment plans to payments.
 * H1 Production Fix: Provides end-to-end visibility from lead to treatment to payment.
 *
 * @module domain/cases/entities/case
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
// CASE ENTITY
// ============================================================================

/**
 * Case aggregate root - links treatment plans to payments
 */
export interface Case {
  /** Unique case identifier */
  readonly id: string;

  /** Clinic owning this case */
  readonly clinicId: string;

  /** Lead this case belongs to */
  readonly leadId: string;

  /** Treatment plan this case is based on */
  readonly treatmentPlanId: string;

  /** Human-readable case number */
  readonly caseNumber: string;

  /** Current status */
  readonly status: CaseStatus;

  // Financial summary
  /** Total amount for this case */
  readonly totalAmount: number;

  /** Amount already paid */
  readonly paidAmount: number;

  /** Outstanding balance (derived) */
  readonly outstandingAmount: number;

  /** Currency code */
  readonly currency: string;

  /** Payment status */
  readonly paymentStatus: PaymentStatus;

  // Financing
  /** Financing provider if using financing */
  readonly financingProvider?: string;

  /** Reference from financing provider */
  readonly financingReference?: string;

  /** When financing was approved */
  readonly financingApprovedAt?: Date;

  // Timeline
  /** When treatment started */
  readonly startedAt?: Date;

  /** When treatment completed */
  readonly completedAt?: Date;

  /** Expected completion date */
  readonly expectedCompletionDate?: Date;

  // Metadata
  /** Notes about the case */
  readonly notes?: string;

  /** Additional metadata */
  readonly metadata: Record<string, unknown>;

  // Audit
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date;
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
// CASE FACTORY
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
 * Generate a UUID v4
 */
function generateUUID(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a new case
 */
export function createCase(input: CreateCaseInput): Case {
  const now = new Date();

  return {
    id: generateUUID(),
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
 */
export function isValidCaseTransition(current: CaseStatus, next: CaseStatus): boolean {
  return VALID_CASE_TRANSITIONS[current].includes(next);
}

/**
 * Calculate payment status from amounts
 */
export function calculatePaymentStatus(totalAmount: number, paidAmount: number): PaymentStatus {
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount < totalAmount) return 'partial';
  if (paidAmount === totalAmount) return 'paid';
  return 'overpaid';
}

/**
 * Check if case can accept payments
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
 */
export function isCaseActive(caseEntity: Case): boolean {
  return (
    caseEntity.status !== 'cancelled' &&
    caseEntity.status !== 'completed' &&
    caseEntity.deletedAt === undefined
  );
}
