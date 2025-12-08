/**
 * @fileoverview Tests for Case Aggregate Root
 *
 * Comprehensive tests for the Case entity including:
 * - Factory methods (create, reconstitute, fromEvents)
 * - Status transitions
 * - Payment handling
 * - Domain events
 * - Error conditions
 *
 * @module domain/cases/entities/__tests__/Case
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CaseAggregateRoot,
  createCase,
  createPayment,
  isValidCaseTransition,
  calculatePaymentStatus,
  canAcceptPayment,
  isCaseActive,
  CaseError,
  CaseDeletedError,
  CaseCancelledError,
  CaseCompletedError,
  InvalidCaseStatusTransitionError,
  type CaseStatus,
  type PaymentStatus,
  type CaseAggregateState,
  type CreateCaseInput,
} from '../Case.js';

describe('CaseAggregateRoot', () => {
  const defaultInput: CreateCaseInput = {
    clinicId: 'clinic-123',
    leadId: 'lead-456',
    treatmentPlanId: 'plan-789',
    caseNumber: 'CASE-2024-001',
    totalAmount: 15000,
    currency: 'EUR',
    createdBy: 'user-001',
  };

  describe('Factory methods', () => {
    describe('create', () => {
      it('should create a new case with pending status', () => {
        const caseEntity = CaseAggregateRoot.create(defaultInput);

        expect(caseEntity.status).toBe('pending');
        expect(caseEntity.clinicId).toBe('clinic-123');
        expect(caseEntity.leadId).toBe('lead-456');
        expect(caseEntity.treatmentPlanId).toBe('plan-789');
        expect(caseEntity.caseNumber).toBe('CASE-2024-001');
        expect(caseEntity.totalAmount).toBe(15000);
        expect(caseEntity.currency).toBe('EUR');
        expect(caseEntity.paidAmount).toBe(0);
        expect(caseEntity.outstandingAmount).toBe(15000);
        expect(caseEntity.paymentStatus).toBe('unpaid');
      });

      it('should generate a UUID for the case id', () => {
        const caseEntity = CaseAggregateRoot.create(defaultInput);

        expect(caseEntity.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      });

      it('should emit case.created event', () => {
        const caseEntity = CaseAggregateRoot.create(defaultInput, 'corr-123');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.created');
        expect(events[0].correlationId).toBe('corr-123');
      });

      it('should use default currency EUR when not specified', () => {
        const input = { ...defaultInput };
        delete input.currency;
        const caseEntity = CaseAggregateRoot.create(input);

        expect(caseEntity.currency).toBe('EUR');
      });

      it('should set expected completion date when provided', () => {
        const expectedDate = new Date('2024-12-31');
        const caseEntity = CaseAggregateRoot.create({
          ...defaultInput,
          expectedCompletionDate: expectedDate,
        });

        expect(caseEntity.expectedCompletionDate).toEqual(expectedDate);
      });

      it('should set notes when provided', () => {
        const caseEntity = CaseAggregateRoot.create({
          ...defaultInput,
          notes: 'Initial consultation completed',
        });

        expect(caseEntity.notes).toBe('Initial consultation completed');
      });
    });

    describe('reconstitute', () => {
      it('should reconstitute case from existing state', () => {
        const state: CaseAggregateState = {
          id: 'case-existing',
          version: 5,
          clinicId: 'clinic-123',
          leadId: 'lead-456',
          treatmentPlanId: 'plan-789',
          caseNumber: 'CASE-2024-002',
          status: 'in_progress',
          totalAmount: 20000,
          paidAmount: 10000,
          outstandingAmount: 10000,
          currency: 'EUR',
          paymentStatus: 'partial',
          startedAt: new Date('2024-01-15'),
          metadata: {},
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-02-01'),
        };

        const caseEntity = CaseAggregateRoot.reconstitute(state);

        expect(caseEntity.id).toBe('case-existing');
        expect(caseEntity.version).toBe(5);
        expect(caseEntity.status).toBe('in_progress');
        expect(caseEntity.paidAmount).toBe(10000);
        expect(caseEntity.startedAt).toEqual(new Date('2024-01-15'));
        expect(caseEntity.getUncommittedEvents()).toHaveLength(0);
      });
    });

    describe('fromEvents', () => {
      it('should reconstitute case from event history', () => {
        const events = [
          {
            type: 'case.created',
            payload: {
              clinicId: 'clinic-123',
              leadId: 'lead-456',
              treatmentPlanId: 'plan-789',
              caseNumber: 'CASE-2024-003',
              totalAmount: 10000,
              currency: 'USD',
            },
            aggregateId: 'case-from-events',
            aggregateType: 'Case' as const,
            version: 1,
            timestamp: new Date('2024-01-01'),
          },
          {
            type: 'case.started',
            payload: {
              caseNumber: 'CASE-2024-003',
              reason: 'Treatment beginning',
              previousStatus: 'pending',
            },
            aggregateId: 'case-from-events',
            aggregateType: 'Case' as const,
            version: 2,
            timestamp: new Date('2024-01-15'),
          },
        ];

        const caseEntity = CaseAggregateRoot.fromEvents('case-from-events', events);

        expect(caseEntity.id).toBe('case-from-events');
        expect(caseEntity.status).toBe('in_progress');
        expect(caseEntity.version).toBe(2);
        expect(caseEntity.caseNumber).toBe('CASE-2024-003');
        expect(caseEntity.totalAmount).toBe(10000);
        expect(caseEntity.currency).toBe('USD');
      });

      it('should handle payment events during reconstitution', () => {
        const events = [
          {
            type: 'case.created',
            payload: {
              clinicId: 'clinic-123',
              leadId: 'lead-456',
              treatmentPlanId: 'plan-789',
              caseNumber: 'CASE-2024-004',
              totalAmount: 10000,
              currency: 'EUR',
            },
            aggregateId: 'case-payment-events',
            aggregateType: 'Case' as const,
            version: 1,
            timestamp: new Date('2024-01-01'),
          },
          {
            type: 'case.payment_recorded',
            payload: {
              newPaidAmount: 5000,
              newPaymentStatus: 'partial',
            },
            aggregateId: 'case-payment-events',
            aggregateType: 'Case' as const,
            version: 2,
            timestamp: new Date('2024-01-15'),
          },
        ];

        const caseEntity = CaseAggregateRoot.fromEvents('case-payment-events', events);

        expect(caseEntity.paidAmount).toBe(5000);
        expect(caseEntity.outstandingAmount).toBe(5000);
        expect(caseEntity.paymentStatus).toBe('partial');
      });
    });
  });

  describe('Query methods', () => {
    let caseEntity: CaseAggregateRoot;

    beforeEach(() => {
      caseEntity = CaseAggregateRoot.create(defaultInput);
    });

    describe('isActive', () => {
      it('should return true for pending case', () => {
        expect(caseEntity.isActive()).toBe(true);
      });

      it('should return true for in_progress case', () => {
        caseEntity.start();
        expect(caseEntity.isActive()).toBe(true);
      });

      it('should return true for on_hold case', () => {
        caseEntity.putOnHold('Scheduling conflict');
        expect(caseEntity.isActive()).toBe(true);
      });

      it('should return false for cancelled case', () => {
        caseEntity.cancel('patient_request');
        expect(caseEntity.isActive()).toBe(false);
      });

      it('should return false for completed case', () => {
        caseEntity.start();
        caseEntity.complete();
        expect(caseEntity.isActive()).toBe(false);
      });

      it('should return false for deleted case', () => {
        caseEntity.softDelete('Test cleanup');
        expect(caseEntity.isActive()).toBe(false);
      });
    });

    describe('isInProgress', () => {
      it('should return false for pending case', () => {
        expect(caseEntity.isInProgress()).toBe(false);
      });

      it('should return true for in_progress case', () => {
        caseEntity.start();
        expect(caseEntity.isInProgress()).toBe(true);
      });
    });

    describe('isPending', () => {
      it('should return true for pending case', () => {
        expect(caseEntity.isPending()).toBe(true);
      });

      it('should return false for started case', () => {
        caseEntity.start();
        expect(caseEntity.isPending()).toBe(false);
      });
    });

    describe('isOnHold', () => {
      it('should return false for pending case', () => {
        expect(caseEntity.isOnHold()).toBe(false);
      });

      it('should return true for on_hold case', () => {
        caseEntity.putOnHold('Waiting for documents');
        expect(caseEntity.isOnHold()).toBe(true);
      });
    });

    describe('isCompleted', () => {
      it('should return false for pending case', () => {
        expect(caseEntity.isCompleted()).toBe(false);
      });

      it('should return true for completed case', () => {
        caseEntity.start();
        caseEntity.complete();
        expect(caseEntity.isCompleted()).toBe(true);
      });
    });

    describe('isCancelled', () => {
      it('should return false for pending case', () => {
        expect(caseEntity.isCancelled()).toBe(false);
      });

      it('should return true for cancelled case', () => {
        caseEntity.cancel('patient_request');
        expect(caseEntity.isCancelled()).toBe(true);
      });
    });

    describe('isDeleted', () => {
      it('should return false for non-deleted case', () => {
        expect(caseEntity.isDeleted()).toBe(false);
      });

      it('should return true for deleted case', () => {
        caseEntity.softDelete('Cleanup');
        expect(caseEntity.isDeleted()).toBe(true);
      });
    });

    describe('canAcceptPayment', () => {
      it('should return true for pending unpaid case', () => {
        expect(caseEntity.canAcceptPayment()).toBe(true);
      });

      it('should return true for in_progress case', () => {
        caseEntity.start();
        expect(caseEntity.canAcceptPayment()).toBe(true);
      });

      it('should return false for cancelled case', () => {
        caseEntity.cancel('patient_request');
        expect(caseEntity.canAcceptPayment()).toBe(false);
      });

      it('should return false for deleted case', () => {
        caseEntity.softDelete('Cleanup');
        expect(caseEntity.canAcceptPayment()).toBe(false);
      });

      it('should return false for fully paid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 15000,
          method: 'card',
        });
        expect(caseEntity.canAcceptPayment()).toBe(false);
      });
    });

    describe('canModify', () => {
      it('should return true for pending case', () => {
        expect(caseEntity.canModify()).toBe(true);
      });

      it('should return false for completed case', () => {
        caseEntity.start();
        caseEntity.complete();
        expect(caseEntity.canModify()).toBe(false);
      });

      it('should return false for cancelled case', () => {
        caseEntity.cancel('patient_request');
        expect(caseEntity.canModify()).toBe(false);
      });

      it('should return false for deleted case', () => {
        caseEntity.softDelete('Cleanup');
        expect(caseEntity.canModify()).toBe(false);
      });
    });

    describe('canTransitionTo', () => {
      it('should allow pending -> in_progress', () => {
        expect(caseEntity.canTransitionTo('in_progress')).toBe(true);
      });

      it('should allow pending -> cancelled', () => {
        expect(caseEntity.canTransitionTo('cancelled')).toBe(true);
      });

      it('should allow pending -> on_hold', () => {
        expect(caseEntity.canTransitionTo('on_hold')).toBe(true);
      });

      it('should not allow pending -> completed', () => {
        expect(caseEntity.canTransitionTo('completed')).toBe(false);
      });

      it('should allow in_progress -> completed', () => {
        caseEntity.start();
        expect(caseEntity.canTransitionTo('completed')).toBe(true);
      });

      it('should not allow completed -> any', () => {
        caseEntity.start();
        caseEntity.complete();
        expect(caseEntity.canTransitionTo('pending')).toBe(false);
        expect(caseEntity.canTransitionTo('in_progress')).toBe(false);
        expect(caseEntity.canTransitionTo('cancelled')).toBe(false);
      });
    });

    describe('isFullyPaid', () => {
      it('should return false for unpaid case', () => {
        expect(caseEntity.isFullyPaid()).toBe(false);
      });

      it('should return false for partially paid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 5000,
          method: 'card',
        });
        expect(caseEntity.isFullyPaid()).toBe(false);
      });

      it('should return true for fully paid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 15000,
          method: 'card',
        });
        expect(caseEntity.isFullyPaid()).toBe(true);
      });

      it('should return true for overpaid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 16000,
          method: 'card',
        });
        expect(caseEntity.isFullyPaid()).toBe(true);
      });
    });

    describe('hasFinancing', () => {
      it('should return false when no financing is added', () => {
        expect(caseEntity.hasFinancing()).toBe(false);
      });

      it('should return true when financing is added', () => {
        caseEntity.addFinancing('stripe', 'fin-ref-123');
        expect(caseEntity.hasFinancing()).toBe(true);
        expect(caseEntity.financingProvider).toBe('stripe');
        expect(caseEntity.financingReference).toBe('fin-ref-123');
      });
    });

    describe('getRemainingBalance', () => {
      it('should return total amount for unpaid case', () => {
        expect(caseEntity.getRemainingBalance()).toBe(15000);
      });

      it('should return remaining for partially paid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 5000,
          method: 'card',
        });
        expect(caseEntity.getRemainingBalance()).toBe(10000);
      });

      it('should return 0 for fully paid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 15000,
          method: 'card',
        });
        expect(caseEntity.getRemainingBalance()).toBe(0);
      });

      it('should return 0 for overpaid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 20000,
          method: 'card',
        });
        expect(caseEntity.getRemainingBalance()).toBe(0);
      });
    });

    describe('getPaymentProgress', () => {
      it('should return 0 for unpaid case', () => {
        expect(caseEntity.getPaymentProgress()).toBe(0);
      });

      it('should return correct percentage for partial payment', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 7500,
          method: 'card',
        });
        expect(caseEntity.getPaymentProgress()).toBe(50);
      });

      it('should return 100 for fully paid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 15000,
          method: 'card',
        });
        expect(caseEntity.getPaymentProgress()).toBe(100);
      });

      it('should return 100 for overpaid case', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 20000,
          method: 'card',
        });
        expect(caseEntity.getPaymentProgress()).toBe(100);
      });

      it('should return 100 for zero total amount', () => {
        const zeroCaseEntity = CaseAggregateRoot.create({
          ...defaultInput,
          totalAmount: 0,
        });
        expect(zeroCaseEntity.getPaymentProgress()).toBe(100);
      });
    });
  });

  describe('Domain methods', () => {
    let caseEntity: CaseAggregateRoot;

    beforeEach(() => {
      caseEntity = CaseAggregateRoot.create(defaultInput);
      caseEntity.clearUncommittedEvents();
    });

    describe('start', () => {
      it('should transition case to in_progress', () => {
        caseEntity.start('Treatment beginning', 'doctor-1');

        expect(caseEntity.status).toBe('in_progress');
        expect(caseEntity.startedAt).toBeInstanceOf(Date);
      });

      it('should emit case.started event', () => {
        caseEntity.start('Treatment beginning', 'doctor-1', 'corr-456');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.started');
        expect(events[0].correlationId).toBe('corr-456');
      });

      it('should throw when case is cancelled', () => {
        caseEntity.cancel('patient_request');
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.start()).toThrow(CaseCancelledError);
      });

      it('should throw when case is already in progress', () => {
        caseEntity.start();
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.start()).toThrow(InvalidCaseStatusTransitionError);
      });

      it('should throw when case is deleted', () => {
        caseEntity.softDelete('Cleanup');
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.start()).toThrow(CaseDeletedError);
      });
    });

    describe('complete', () => {
      it('should transition case to completed', () => {
        caseEntity.start();
        caseEntity.clearUncommittedEvents();
        caseEntity.complete('Treatment successful', 'doctor-1');

        expect(caseEntity.status).toBe('completed');
        expect(caseEntity.completedAt).toBeInstanceOf(Date);
      });

      it('should emit case.completed event', () => {
        caseEntity.start();
        caseEntity.clearUncommittedEvents();
        caseEntity.complete('Treatment successful', 'doctor-1', 'corr-789');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.completed');
      });

      it('should throw when case is pending', () => {
        expect(() => caseEntity.complete()).toThrow(InvalidCaseStatusTransitionError);
      });

      it('should throw when case is cancelled', () => {
        caseEntity.cancel('patient_request');
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.complete()).toThrow(CaseCancelledError);
      });
    });

    describe('cancel', () => {
      it('should transition case to cancelled', () => {
        caseEntity.cancel('patient_request', 'Patient moved', 'admin-1');

        expect(caseEntity.status).toBe('cancelled');
      });

      it('should emit case.cancelled event with refund info', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 5000,
          method: 'card',
        });
        caseEntity.clearUncommittedEvents();
        caseEntity.cancel('financial', 'Payment issues');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.cancelled');
        const payload = events[0].payload as Record<string, unknown>;
        expect(payload.refundRequired).toBe(true);
        expect(payload.paidAmount).toBe(5000);
      });

      it('should throw when case is deleted', () => {
        caseEntity.softDelete('Cleanup');
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.cancel('patient_request')).toThrow(CaseDeletedError);
      });

      it('should throw when case is already completed', () => {
        caseEntity.start();
        caseEntity.complete();
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.cancel('patient_request')).toThrow(
          InvalidCaseStatusTransitionError
        );
      });
    });

    describe('putOnHold', () => {
      it('should transition case to on_hold', () => {
        caseEntity.putOnHold('Waiting for insurance approval', 'admin-1');

        expect(caseEntity.status).toBe('on_hold');
      });

      it('should allow putting in_progress case on hold', () => {
        caseEntity.start();
        caseEntity.clearUncommittedEvents();
        caseEntity.putOnHold('Patient travel');

        expect(caseEntity.status).toBe('on_hold');
      });

      it('should emit case.on_hold event', () => {
        caseEntity.putOnHold('Insurance review');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.on_hold');
      });
    });

    describe('resume', () => {
      it('should resume case to pending status', () => {
        caseEntity.putOnHold('Waiting');
        caseEntity.clearUncommittedEvents();
        caseEntity.resume('pending', 'Insurance approved');

        expect(caseEntity.status).toBe('pending');
      });

      it('should resume case to in_progress status', () => {
        caseEntity.putOnHold('Waiting');
        caseEntity.clearUncommittedEvents();
        caseEntity.resume('in_progress', 'Ready to continue');

        expect(caseEntity.status).toBe('in_progress');
      });

      it('should emit case.resumed event', () => {
        caseEntity.putOnHold('Waiting');
        caseEntity.clearUncommittedEvents();
        caseEntity.resume('in_progress', 'Ready');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.resumed');
      });

      it('should throw when case is not on hold', () => {
        expect(() => caseEntity.resume('in_progress')).toThrow(CaseError);
      });

      it('should throw when case is deleted', () => {
        caseEntity.softDelete('Cleanup');
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.resume('in_progress')).toThrow(CaseDeletedError);
      });
    });

    describe('recordPayment', () => {
      it('should update paid amount', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 5000,
          method: 'card',
        });

        expect(caseEntity.paidAmount).toBe(5000);
        expect(caseEntity.outstandingAmount).toBe(10000);
        expect(caseEntity.paymentStatus).toBe('partial');
      });

      it('should update payment status to paid when fully paid', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 15000,
          method: 'card',
        });

        expect(caseEntity.paymentStatus).toBe('paid');
      });

      it('should update payment status to overpaid', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 20000,
          method: 'card',
        });

        expect(caseEntity.paymentStatus).toBe('overpaid');
      });

      it('should emit case.payment_recorded event', () => {
        caseEntity.recordPayment(
          {
            paymentId: 'pay-1',
            amount: 5000,
            method: 'card',
            type: 'deposit',
            reference: 'ref-123',
            processedBy: 'admin-1',
          },
          'corr-payment'
        );
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.payment_recorded');
      });

      it('should throw when case cannot accept payment', () => {
        caseEntity.cancel('patient_request');
        caseEntity.clearUncommittedEvents();

        expect(() =>
          caseEntity.recordPayment({
            paymentId: 'pay-1',
            amount: 5000,
            method: 'card',
          })
        ).toThrow(CaseError);
      });

      it('should throw when already fully paid', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 15000,
          method: 'card',
        });
        caseEntity.clearUncommittedEvents();

        expect(() =>
          caseEntity.recordPayment({
            paymentId: 'pay-2',
            amount: 1000,
            method: 'card',
          })
        ).toThrow(CaseError);
      });
    });

    describe('recordRefund', () => {
      it('should reduce paid amount', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 10000,
          method: 'card',
        });
        caseEntity.clearUncommittedEvents();

        caseEntity.recordRefund({
          refundId: 'ref-1',
          amount: 3000,
          reason: 'Treatment cancelled',
        });

        expect(caseEntity.paidAmount).toBe(7000);
        expect(caseEntity.outstandingAmount).toBe(8000);
        expect(caseEntity.paymentStatus).toBe('partial');
      });

      it('should update payment status to unpaid when fully refunded', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 5000,
          method: 'card',
        });
        caseEntity.clearUncommittedEvents();

        caseEntity.recordRefund({
          refundId: 'ref-1',
          amount: 5000,
          reason: 'Full refund',
        });

        expect(caseEntity.paidAmount).toBe(0);
        expect(caseEntity.paymentStatus).toBe('unpaid');
      });

      it('should throw when refund exceeds paid amount', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 5000,
          method: 'card',
        });
        caseEntity.clearUncommittedEvents();

        expect(() =>
          caseEntity.recordRefund({
            refundId: 'ref-1',
            amount: 10000,
            reason: 'Excess refund',
          })
        ).toThrow(CaseError);
      });

      it('should emit case.refund_recorded event', () => {
        caseEntity.recordPayment({
          paymentId: 'pay-1',
          amount: 5000,
          method: 'card',
        });
        caseEntity.clearUncommittedEvents();

        caseEntity.recordRefund({
          refundId: 'ref-1',
          amount: 2000,
          reason: 'Partial refund',
          processedBy: 'admin-1',
        });
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.refund_recorded');
      });
    });

    describe('addFinancing', () => {
      it('should add financing to case', () => {
        caseEntity.addFinancing('stripe', 'fin-123', 15000);

        expect(caseEntity.financingProvider).toBe('stripe');
        expect(caseEntity.financingReference).toBe('fin-123');
        expect(caseEntity.financingApprovedAt).toBeInstanceOf(Date);
      });

      it('should emit case.financing_added event', () => {
        caseEntity.addFinancing('affirm', 'fin-456');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.financing_added');
      });

      it('should throw when case cannot be modified', () => {
        caseEntity.cancel('patient_request');
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.addFinancing('stripe', 'fin-123')).toThrow(CaseCancelledError);
      });
    });

    describe('updateNotes', () => {
      it('should update case notes', () => {
        caseEntity.updateNotes('Important patient update', 'doctor-1');

        expect(caseEntity.notes).toBe('Important patient update');
      });

      it('should emit case.notes_updated event', () => {
        caseEntity.updateNotes('Note content');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.notes_updated');
      });

      it('should throw when case cannot be modified', () => {
        caseEntity.start();
        caseEntity.complete();
        caseEntity.clearUncommittedEvents();

        expect(() => caseEntity.updateNotes('Late update')).toThrow(CaseCompletedError);
      });
    });

    describe('updateExpectedCompletionDate', () => {
      it('should update expected completion date', () => {
        const newDate = new Date('2024-06-30');
        caseEntity.updateExpectedCompletionDate(newDate, 'Rescheduled');

        expect(caseEntity.expectedCompletionDate).toEqual(newDate);
      });

      it('should emit case.expected_completion_updated event', () => {
        caseEntity.updateExpectedCompletionDate(new Date());
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.expected_completion_updated');
      });
    });

    describe('softDelete', () => {
      it('should soft delete the case', () => {
        caseEntity.softDelete('Test cleanup', 'admin-1');

        expect(caseEntity.isDeleted()).toBe(true);
        expect(caseEntity.deletedAt).toBeInstanceOf(Date);
      });

      it('should emit case.deleted event', () => {
        caseEntity.softDelete('Cleanup');
        const events = caseEntity.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('case.deleted');
      });

      it('should be idempotent (no error if already deleted)', () => {
        caseEntity.softDelete('First delete');
        caseEntity.clearUncommittedEvents();

        // Should not throw
        caseEntity.softDelete('Second delete');

        // Should not emit new event
        expect(caseEntity.getUncommittedEvents()).toHaveLength(0);
      });
    });
  });

  describe('Event sourcing', () => {
    it('should track uncommitted events', () => {
      const caseEntity = CaseAggregateRoot.create(defaultInput);
      caseEntity.start();
      caseEntity.recordPayment({
        paymentId: 'pay-1',
        amount: 5000,
        method: 'card',
      });

      const events = caseEntity.getUncommittedEvents();
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('case.created');
      expect(events[1].type).toBe('case.started');
      expect(events[2].type).toBe('case.payment_recorded');
    });

    it('should clear uncommitted events', () => {
      const caseEntity = CaseAggregateRoot.create(defaultInput);
      expect(caseEntity.getUncommittedEvents()).toHaveLength(1);

      caseEntity.clearUncommittedEvents();
      expect(caseEntity.getUncommittedEvents()).toHaveLength(0);
    });

    it('should return state snapshot', () => {
      const caseEntity = CaseAggregateRoot.create(defaultInput);
      caseEntity.start();

      const state = caseEntity.getState();
      expect(state.status).toBe('in_progress');
      expect(state.clinicId).toBe('clinic-123');
    });

    it('should increment version with each event', () => {
      const caseEntity = CaseAggregateRoot.create(defaultInput);
      expect(caseEntity.version).toBe(1);

      caseEntity.start();
      expect(caseEntity.version).toBe(2);

      caseEntity.recordPayment({
        paymentId: 'pay-1',
        amount: 5000,
        method: 'card',
      });
      expect(caseEntity.version).toBe(3);
    });
  });
});

describe('Legacy helper functions', () => {
  describe('createCase', () => {
    it('should create case state object', () => {
      const result = createCase({
        clinicId: 'clinic-123',
        leadId: 'lead-456',
        treatmentPlanId: 'plan-789',
        caseNumber: 'CASE-2024-001',
        totalAmount: 10000,
      });

      expect(result.clinicId).toBe('clinic-123');
      expect(result.leadId).toBe('lead-456');
      expect(result.status).toBe('pending');
      expect(result.totalAmount).toBe(10000);
      expect(result.paidAmount).toBe(0);
      expect(result.paymentStatus).toBe('unpaid');
      expect(result.currency).toBe('EUR');
    });
  });

  describe('createPayment', () => {
    it('should create payment object', () => {
      const result = createPayment({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        paymentReference: 'PAY-001',
        amount: 5000,
        method: 'card',
      });

      expect(result.caseId).toBe('case-123');
      expect(result.clinicId).toBe('clinic-456');
      expect(result.paymentReference).toBe('PAY-001');
      expect(result.amount).toBe(5000);
      expect(result.method).toBe('card');
      expect(result.type).toBe('payment');
      expect(result.status).toBe('pending');
      expect(result.currency).toBe('EUR');
    });

    it('should use provided type and currency', () => {
      const result = createPayment({
        caseId: 'case-123',
        clinicId: 'clinic-456',
        paymentReference: 'DEP-001',
        amount: 2000,
        method: 'bank_transfer',
        type: 'deposit',
        currency: 'USD',
      });

      expect(result.type).toBe('deposit');
      expect(result.currency).toBe('USD');
    });
  });

  describe('isValidCaseTransition', () => {
    it('should return true for valid transitions', () => {
      expect(isValidCaseTransition('pending', 'in_progress')).toBe(true);
      expect(isValidCaseTransition('pending', 'cancelled')).toBe(true);
      expect(isValidCaseTransition('pending', 'on_hold')).toBe(true);
      expect(isValidCaseTransition('in_progress', 'completed')).toBe(true);
      expect(isValidCaseTransition('in_progress', 'cancelled')).toBe(true);
      expect(isValidCaseTransition('in_progress', 'on_hold')).toBe(true);
      expect(isValidCaseTransition('on_hold', 'pending')).toBe(true);
      expect(isValidCaseTransition('on_hold', 'in_progress')).toBe(true);
      expect(isValidCaseTransition('on_hold', 'cancelled')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(isValidCaseTransition('pending', 'completed')).toBe(false);
      expect(isValidCaseTransition('completed', 'in_progress')).toBe(false);
      expect(isValidCaseTransition('completed', 'cancelled')).toBe(false);
      expect(isValidCaseTransition('cancelled', 'pending')).toBe(false);
      expect(isValidCaseTransition('cancelled', 'in_progress')).toBe(false);
    });
  });

  describe('calculatePaymentStatus', () => {
    it('should return unpaid when nothing paid', () => {
      expect(calculatePaymentStatus(10000, 0)).toBe('unpaid');
    });

    it('should return unpaid for negative paid amount', () => {
      expect(calculatePaymentStatus(10000, -100)).toBe('unpaid');
    });

    it('should return partial when partially paid', () => {
      expect(calculatePaymentStatus(10000, 5000)).toBe('partial');
    });

    it('should return paid when exactly paid', () => {
      expect(calculatePaymentStatus(10000, 10000)).toBe('paid');
    });

    it('should return overpaid when more than total paid', () => {
      expect(calculatePaymentStatus(10000, 15000)).toBe('overpaid');
    });
  });

  describe('canAcceptPayment', () => {
    it('should return true for pending unpaid case', () => {
      const caseState = createCase({
        clinicId: 'c1',
        leadId: 'l1',
        treatmentPlanId: 'p1',
        caseNumber: 'C1',
        totalAmount: 10000,
      });
      expect(canAcceptPayment(caseState)).toBe(true);
    });

    it('should return false for cancelled case', () => {
      const caseState = {
        ...createCase({
          clinicId: 'c1',
          leadId: 'l1',
          treatmentPlanId: 'p1',
          caseNumber: 'C1',
          totalAmount: 10000,
        }),
        status: 'cancelled' as CaseStatus,
      };
      expect(canAcceptPayment(caseState)).toBe(false);
    });

    it('should return false for deleted case', () => {
      const caseState = {
        ...createCase({
          clinicId: 'c1',
          leadId: 'l1',
          treatmentPlanId: 'p1',
          caseNumber: 'C1',
          totalAmount: 10000,
        }),
        deletedAt: new Date(),
      };
      expect(canAcceptPayment(caseState)).toBe(false);
    });

    it('should return false for fully paid case', () => {
      const caseState = {
        ...createCase({
          clinicId: 'c1',
          leadId: 'l1',
          treatmentPlanId: 'p1',
          caseNumber: 'C1',
          totalAmount: 10000,
        }),
        paymentStatus: 'paid' as PaymentStatus,
      };
      expect(canAcceptPayment(caseState)).toBe(false);
    });
  });

  describe('isCaseActive', () => {
    it('should return true for pending case', () => {
      const caseState = createCase({
        clinicId: 'c1',
        leadId: 'l1',
        treatmentPlanId: 'p1',
        caseNumber: 'C1',
        totalAmount: 10000,
      });
      expect(isCaseActive(caseState)).toBe(true);
    });

    it('should return false for cancelled case', () => {
      const caseState = {
        ...createCase({
          clinicId: 'c1',
          leadId: 'l1',
          treatmentPlanId: 'p1',
          caseNumber: 'C1',
          totalAmount: 10000,
        }),
        status: 'cancelled' as CaseStatus,
      };
      expect(isCaseActive(caseState)).toBe(false);
    });

    it('should return false for completed case', () => {
      const caseState = {
        ...createCase({
          clinicId: 'c1',
          leadId: 'l1',
          treatmentPlanId: 'p1',
          caseNumber: 'C1',
          totalAmount: 10000,
        }),
        status: 'completed' as CaseStatus,
      };
      expect(isCaseActive(caseState)).toBe(false);
    });

    it('should return false for deleted case', () => {
      const caseState = {
        ...createCase({
          clinicId: 'c1',
          leadId: 'l1',
          treatmentPlanId: 'p1',
          caseNumber: 'C1',
          totalAmount: 10000,
        }),
        deletedAt: new Date(),
      };
      expect(isCaseActive(caseState)).toBe(false);
    });
  });
});

describe('Error classes', () => {
  describe('CaseError', () => {
    it('should create error with code and case id', () => {
      const error = new CaseError('TEST_CODE', 'case-123', 'Test error message');

      expect(error.name).toBe('CaseError');
      expect(error.code).toBe('TEST_CODE');
      expect(error.caseId).toBe('case-123');
      expect(error.message).toBe('Test error message');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('CaseDeletedError', () => {
    it('should create error with correct message', () => {
      const error = new CaseDeletedError('case-456');

      expect(error.name).toBe('CaseDeletedError');
      expect(error.code).toBe('CASE_DELETED');
      expect(error.caseId).toBe('case-456');
      expect(error.message).toBe('Case case-456 has been deleted');
      expect(error instanceof CaseError).toBe(true);
    });
  });

  describe('CaseCancelledError', () => {
    it('should create error with correct message', () => {
      const error = new CaseCancelledError('case-789');

      expect(error.name).toBe('CaseCancelledError');
      expect(error.code).toBe('CASE_CANCELLED');
      expect(error.caseId).toBe('case-789');
      expect(error.message).toBe('Case case-789 has been cancelled');
      expect(error instanceof CaseError).toBe(true);
    });
  });

  describe('CaseCompletedError', () => {
    it('should create error with correct message', () => {
      const error = new CaseCompletedError('case-completed');

      expect(error.name).toBe('CaseCompletedError');
      expect(error.code).toBe('CASE_COMPLETED');
      expect(error.caseId).toBe('case-completed');
      expect(error.message).toBe('Case case-completed is already completed');
      expect(error instanceof CaseError).toBe(true);
    });
  });

  describe('InvalidCaseStatusTransitionError', () => {
    it('should create error with status transition details', () => {
      const error = new InvalidCaseStatusTransitionError('case-transition', 'pending', 'completed');

      expect(error.name).toBe('InvalidCaseStatusTransitionError');
      expect(error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(error.caseId).toBe('case-transition');
      expect(error.fromStatus).toBe('pending');
      expect(error.toStatus).toBe('completed');
      expect(error.message).toBe(
        "Invalid status transition from 'pending' to 'completed' for case case-transition"
      );
      expect(error instanceof CaseError).toBe(true);
    });
  });
});
