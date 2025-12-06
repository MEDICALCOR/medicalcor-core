/**
 * @fileoverview Case Domain Events
 *
 * Events emitted during case and payment lifecycle.
 *
 * @module domain/cases/events/case-events
 */

import type { CaseStatus, PaymentStatus, PaymentType, PaymentMethod } from '../entities/Case.js';

// ============================================================================
// BASE EVENT
// ============================================================================

interface BaseCaseEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly correlationId?: string;
}

// ============================================================================
// CASE EVENTS
// ============================================================================

/**
 * Case created event
 */
export interface CaseCreatedEvent extends BaseCaseEvent {
  readonly eventType: 'case.created';
  readonly caseId: string;
  readonly clinicId: string;
  readonly leadId: string;
  readonly treatmentPlanId: string;
  readonly caseNumber: string;
  readonly totalAmount: number;
  readonly currency: string;
}

/**
 * Case status changed event
 */
export interface CaseStatusChangedEvent extends BaseCaseEvent {
  readonly eventType: 'case.status_changed';
  readonly caseId: string;
  readonly previousStatus: CaseStatus;
  readonly newStatus: CaseStatus;
  readonly changedBy?: string;
  readonly reason?: string;
}

/**
 * Case payment status changed event
 */
export interface CasePaymentStatusChangedEvent extends BaseCaseEvent {
  readonly eventType: 'case.payment_status_changed';
  readonly caseId: string;
  readonly previousStatus: PaymentStatus;
  readonly newStatus: PaymentStatus;
  readonly paidAmount: number;
  readonly totalAmount: number;
}

/**
 * Case started event
 */
export interface CaseStartedEvent extends BaseCaseEvent {
  readonly eventType: 'case.started';
  readonly caseId: string;
  readonly startedAt: Date;
  readonly startedBy?: string;
}

/**
 * Case completed event
 */
export interface CaseCompletedEvent extends BaseCaseEvent {
  readonly eventType: 'case.completed';
  readonly caseId: string;
  readonly completedAt: Date;
  readonly totalPaid: number;
  readonly outstandingBalance: number;
}

// ============================================================================
// PAYMENT EVENTS
// ============================================================================

/**
 * Payment created event
 */
export interface PaymentCreatedEvent extends BaseCaseEvent {
  readonly eventType: 'payment.created';
  readonly paymentId: string;
  readonly caseId: string;
  readonly amount: number;
  readonly currency: string;
  readonly type: PaymentType;
  readonly method: PaymentMethod;
}

/**
 * Payment processed event
 */
export interface PaymentProcessedEvent extends BaseCaseEvent {
  readonly eventType: 'payment.processed';
  readonly paymentId: string;
  readonly caseId: string;
  readonly amount: number;
  readonly processorName: string;
  readonly processorTransactionId: string;
  readonly processedAt: Date;
}

/**
 * Payment failed event
 */
export interface PaymentFailedEvent extends BaseCaseEvent {
  readonly eventType: 'payment.failed';
  readonly paymentId: string;
  readonly caseId: string;
  readonly amount: number;
  readonly reason: string;
}

/**
 * Refund processed event
 */
export interface RefundProcessedEvent extends BaseCaseEvent {
  readonly eventType: 'payment.refund_processed';
  readonly paymentId: string;
  readonly caseId: string;
  readonly originalPaymentId?: string;
  readonly amount: number;
  readonly reason?: string;
}

// ============================================================================
// PAYMENT PLAN EVENTS
// ============================================================================

/**
 * Payment plan created event
 */
export interface PaymentPlanCreatedEvent extends BaseCaseEvent {
  readonly eventType: 'payment_plan.created';
  readonly paymentPlanId: string;
  readonly caseId: string;
  readonly totalAmount: number;
  readonly numberOfInstallments: number;
  readonly installmentAmount: number;
  readonly startDate: Date;
}

/**
 * Installment paid event
 */
export interface InstallmentPaidEvent extends BaseCaseEvent {
  readonly eventType: 'payment_plan.installment_paid';
  readonly paymentPlanId: string;
  readonly installmentId: string;
  readonly installmentNumber: number;
  readonly amount: number;
  readonly remainingInstallments: number;
}

/**
 * Installment overdue event
 */
export interface InstallmentOverdueEvent extends BaseCaseEvent {
  readonly eventType: 'payment_plan.installment_overdue';
  readonly paymentPlanId: string;
  readonly installmentId: string;
  readonly installmentNumber: number;
  readonly amount: number;
  readonly dueDate: Date;
  readonly daysOverdue: number;
}

// ============================================================================
// EVENT UNION TYPE
// ============================================================================

export type CaseDomainEvent =
  | CaseCreatedEvent
  | CaseStatusChangedEvent
  | CasePaymentStatusChangedEvent
  | CaseStartedEvent
  | CaseCompletedEvent
  | PaymentCreatedEvent
  | PaymentProcessedEvent
  | PaymentFailedEvent
  | RefundProcessedEvent
  | PaymentPlanCreatedEvent
  | InstallmentPaidEvent
  | InstallmentOverdueEvent;

// ============================================================================
// EVENT FACTORIES
// ============================================================================

function generateEventId(): string {
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

export function createCaseCreatedEvent(
  caseId: string,
  clinicId: string,
  leadId: string,
  treatmentPlanId: string,
  caseNumber: string,
  totalAmount: number,
  currency: string,
  correlationId?: string
): CaseCreatedEvent {
  return {
    eventId: generateEventId(),
    eventType: 'case.created',
    occurredAt: new Date(),
    correlationId,
    caseId,
    clinicId,
    leadId,
    treatmentPlanId,
    caseNumber,
    totalAmount,
    currency,
  };
}

export function createPaymentProcessedEvent(
  paymentId: string,
  caseId: string,
  amount: number,
  processorName: string,
  processorTransactionId: string,
  correlationId?: string
): PaymentProcessedEvent {
  return {
    eventId: generateEventId(),
    eventType: 'payment.processed',
    occurredAt: new Date(),
    correlationId,
    paymentId,
    caseId,
    amount,
    processorName,
    processorTransactionId,
    processedAt: new Date(),
  };
}
