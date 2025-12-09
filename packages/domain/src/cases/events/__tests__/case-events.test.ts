/**
 * @fileoverview Tests for Case Domain Events
 *
 * Comprehensive tests for case and payment event factories.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCaseCreatedEvent, createPaymentProcessedEvent } from '../case-events.js';
import type {
  CaseDomainEvent,
  CaseCreatedEvent,
  CaseStatusChangedEvent,
  CasePaymentStatusChangedEvent,
  CaseStartedEvent,
  CaseCompletedEvent,
  PaymentCreatedEvent,
  PaymentProcessedEvent,
  PaymentFailedEvent,
  RefundProcessedEvent,
  PaymentPlanCreatedEvent,
  InstallmentPaidEvent,
  InstallmentOverdueEvent,
} from '../case-events.js';

describe('Case Domain Events', () => {
  // Mock crypto.randomUUID
  const mockUUID = 'mock-uuid-1234-5678-9012';
  const mockRandomUUID = vi.fn().mockReturnValue(mockUUID);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));

    // Use stubGlobal for crypto mocking
    vi.stubGlobal('crypto', {
      randomUUID: mockRandomUUID,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mockRandomUUID.mockClear();
  });

  // ==========================================================================
  // FACTORY FUNCTION TESTS
  // ==========================================================================

  describe('createCaseCreatedEvent', () => {
    it('should create a CaseCreated event with correct structure', () => {
      const event = createCaseCreatedEvent(
        'case-001',
        'clinic-001',
        'lead-001',
        'plan-001',
        'CASE-2024-001',
        15000,
        'EUR'
      );

      expect(event.eventId).toBe(mockUUID);
      expect(event.eventType).toBe('case.created');
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.caseId).toBe('case-001');
      expect(event.clinicId).toBe('clinic-001');
      expect(event.leadId).toBe('lead-001');
      expect(event.treatmentPlanId).toBe('plan-001');
      expect(event.caseNumber).toBe('CASE-2024-001');
      expect(event.totalAmount).toBe(15000);
      expect(event.currency).toBe('EUR');
    });

    it('should include correlationId when provided', () => {
      const event = createCaseCreatedEvent(
        'case-002',
        'clinic-002',
        'lead-002',
        'plan-002',
        'CASE-2024-002',
        25000,
        'USD',
        'corr-123'
      );

      expect(event.correlationId).toBe('corr-123');
    });

    it('should not include correlationId when not provided', () => {
      const event = createCaseCreatedEvent(
        'case-003',
        'clinic-003',
        'lead-003',
        'plan-003',
        'CASE-2024-003',
        10000,
        'RON'
      );

      expect(event.correlationId).toBeUndefined();
    });

    it('should handle different currencies', () => {
      const currencies = ['EUR', 'USD', 'RON', 'GBP'];

      for (const currency of currencies) {
        const event = createCaseCreatedEvent(
          `case-${currency}`,
          'clinic-001',
          'lead-001',
          'plan-001',
          `CASE-${currency}`,
          10000,
          currency
        );

        expect(event.currency).toBe(currency);
      }
    });
  });

  describe('createPaymentProcessedEvent', () => {
    it('should create a PaymentProcessed event with correct structure', () => {
      const event = createPaymentProcessedEvent(
        'payment-001',
        'case-001',
        5000,
        'Stripe',
        'txn_123456'
      );

      expect(event.eventId).toBe(mockUUID);
      expect(event.eventType).toBe('payment.processed');
      expect(event.occurredAt).toBeInstanceOf(Date);
      expect(event.paymentId).toBe('payment-001');
      expect(event.caseId).toBe('case-001');
      expect(event.amount).toBe(5000);
      expect(event.processorName).toBe('Stripe');
      expect(event.processorTransactionId).toBe('txn_123456');
      expect(event.processedAt).toBeInstanceOf(Date);
    });

    it('should include correlationId when provided', () => {
      const event = createPaymentProcessedEvent(
        'payment-002',
        'case-002',
        7500,
        'PayPal',
        'PP-789',
        'corr-456'
      );

      expect(event.correlationId).toBe('corr-456');
    });

    it('should handle various payment processors', () => {
      const processors = ['Stripe', 'PayPal', 'Square', 'Adyen', 'BrainTree'];

      for (const processor of processors) {
        const event = createPaymentProcessedEvent(
          `payment-${processor}`,
          'case-001',
          1000,
          processor,
          `txn_${processor}`
        );

        expect(event.processorName).toBe(processor);
      }
    });
  });

  // ==========================================================================
  // UUID FALLBACK TEST
  // ==========================================================================

  describe('UUID generation fallback', () => {
    it('should use fallback UUID generation when crypto.randomUUID is unavailable', () => {
      // Remove randomUUID to test fallback
      vi.stubGlobal('crypto', {
        randomUUID: undefined,
      });

      const event = createCaseCreatedEvent(
        'case-fallback',
        'clinic-001',
        'lead-001',
        'plan-001',
        'CASE-FALLBACK',
        10000,
        'EUR'
      );

      expect(event.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });
  });

  // ==========================================================================
  // EVENT INTERFACE TESTS
  // ==========================================================================

  describe('CaseCreatedEvent interface', () => {
    it('should match expected shape', () => {
      const event: CaseCreatedEvent = {
        eventId: 'evt-001',
        eventType: 'case.created',
        occurredAt: new Date(),
        correlationId: 'corr-001',
        caseId: 'case-001',
        clinicId: 'clinic-001',
        leadId: 'lead-001',
        treatmentPlanId: 'plan-001',
        caseNumber: 'CASE-001',
        totalAmount: 10000,
        currency: 'EUR',
      };

      expect(event.eventType).toBe('case.created');
    });
  });

  describe('CaseStatusChangedEvent interface', () => {
    it('should match expected shape for all statuses', () => {
      const statuses = [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
      ] as const;

      for (let i = 0; i < statuses.length - 1; i++) {
        const event: CaseStatusChangedEvent = {
          eventId: `evt-${i}`,
          eventType: 'case.status_changed',
          occurredAt: new Date(),
          caseId: 'case-001',
          previousStatus: statuses[i],
          newStatus: statuses[i + 1],
          changedBy: 'user-001',
          reason: 'Status progression',
        };

        expect(event.eventType).toBe('case.status_changed');
        expect(event.previousStatus).toBe(statuses[i]);
        expect(event.newStatus).toBe(statuses[i + 1]);
      }
    });
  });

  describe('CasePaymentStatusChangedEvent interface', () => {
    it('should match expected shape for payment statuses', () => {
      const event: CasePaymentStatusChangedEvent = {
        eventId: 'evt-001',
        eventType: 'case.payment_status_changed',
        occurredAt: new Date(),
        caseId: 'case-001',
        previousStatus: 'PENDING',
        newStatus: 'PARTIAL',
        paidAmount: 5000,
        totalAmount: 15000,
      };

      expect(event.eventType).toBe('case.payment_status_changed');
      expect(event.paidAmount).toBeLessThan(event.totalAmount);
    });

    it('should handle fully paid status', () => {
      const event: CasePaymentStatusChangedEvent = {
        eventId: 'evt-002',
        eventType: 'case.payment_status_changed',
        occurredAt: new Date(),
        caseId: 'case-001',
        previousStatus: 'PARTIAL',
        newStatus: 'PAID',
        paidAmount: 15000,
        totalAmount: 15000,
      };

      expect(event.paidAmount).toBe(event.totalAmount);
    });
  });

  describe('CaseStartedEvent interface', () => {
    it('should match expected shape', () => {
      const event: CaseStartedEvent = {
        eventId: 'evt-001',
        eventType: 'case.started',
        occurredAt: new Date(),
        caseId: 'case-001',
        startedAt: new Date(),
        startedBy: 'doctor-001',
      };

      expect(event.eventType).toBe('case.started');
    });

    it('should handle optional startedBy', () => {
      const event: CaseStartedEvent = {
        eventId: 'evt-002',
        eventType: 'case.started',
        occurredAt: new Date(),
        caseId: 'case-002',
        startedAt: new Date(),
      };

      expect(event.startedBy).toBeUndefined();
    });
  });

  describe('CaseCompletedEvent interface', () => {
    it('should match expected shape with no outstanding balance', () => {
      const event: CaseCompletedEvent = {
        eventId: 'evt-001',
        eventType: 'case.completed',
        occurredAt: new Date(),
        caseId: 'case-001',
        completedAt: new Date(),
        totalPaid: 15000,
        outstandingBalance: 0,
      };

      expect(event.eventType).toBe('case.completed');
      expect(event.outstandingBalance).toBe(0);
    });

    it('should handle outstanding balance', () => {
      const event: CaseCompletedEvent = {
        eventId: 'evt-002',
        eventType: 'case.completed',
        occurredAt: new Date(),
        caseId: 'case-002',
        completedAt: new Date(),
        totalPaid: 10000,
        outstandingBalance: 5000,
      };

      expect(event.outstandingBalance).toBe(5000);
    });
  });

  // ==========================================================================
  // PAYMENT EVENT INTERFACE TESTS
  // ==========================================================================

  describe('PaymentCreatedEvent interface', () => {
    it('should match expected shape for all payment types', () => {
      const types = ['DEPOSIT', 'INSTALLMENT', 'FINAL', 'REFUND'] as const;

      for (const type of types) {
        const event: PaymentCreatedEvent = {
          eventId: `evt-${type}`,
          eventType: 'payment.created',
          occurredAt: new Date(),
          paymentId: `payment-${type}`,
          caseId: 'case-001',
          amount: 5000,
          currency: 'EUR',
          type,
          method: 'CARD',
        };

        expect(event.type).toBe(type);
      }
    });

    it('should support all payment methods', () => {
      const methods = ['CARD', 'BANK_TRANSFER', 'CASH', 'FINANCING'] as const;

      for (const method of methods) {
        const event: PaymentCreatedEvent = {
          eventId: `evt-${method}`,
          eventType: 'payment.created',
          occurredAt: new Date(),
          paymentId: `payment-${method}`,
          caseId: 'case-001',
          amount: 5000,
          currency: 'EUR',
          type: 'DEPOSIT',
          method,
        };

        expect(event.method).toBe(method);
      }
    });
  });

  describe('PaymentProcessedEvent interface', () => {
    it('should match expected shape', () => {
      const event: PaymentProcessedEvent = {
        eventId: 'evt-001',
        eventType: 'payment.processed',
        occurredAt: new Date(),
        paymentId: 'payment-001',
        caseId: 'case-001',
        amount: 5000,
        processorName: 'Stripe',
        processorTransactionId: 'pi_123456',
        processedAt: new Date(),
      };

      expect(event.eventType).toBe('payment.processed');
    });
  });

  describe('PaymentFailedEvent interface', () => {
    it('should match expected shape', () => {
      const event: PaymentFailedEvent = {
        eventId: 'evt-001',
        eventType: 'payment.failed',
        occurredAt: new Date(),
        paymentId: 'payment-001',
        caseId: 'case-001',
        amount: 5000,
        reason: 'Insufficient funds',
      };

      expect(event.eventType).toBe('payment.failed');
      expect(event.reason).toBe('Insufficient funds');
    });

    it('should handle various failure reasons', () => {
      const reasons = [
        'Insufficient funds',
        'Card declined',
        'Expired card',
        'Invalid card number',
        'Processing error',
        'Fraud suspected',
      ];

      for (const reason of reasons) {
        const event: PaymentFailedEvent = {
          eventId: 'evt-001',
          eventType: 'payment.failed',
          occurredAt: new Date(),
          paymentId: 'payment-001',
          caseId: 'case-001',
          amount: 5000,
          reason,
        };

        expect(event.reason).toBe(reason);
      }
    });
  });

  describe('RefundProcessedEvent interface', () => {
    it('should match expected shape with original payment', () => {
      const event: RefundProcessedEvent = {
        eventId: 'evt-001',
        eventType: 'payment.refund_processed',
        occurredAt: new Date(),
        paymentId: 'refund-001',
        caseId: 'case-001',
        originalPaymentId: 'payment-001',
        amount: 2500,
        reason: 'Customer request',
      };

      expect(event.eventType).toBe('payment.refund_processed');
      expect(event.originalPaymentId).toBe('payment-001');
    });

    it('should handle refund without original payment reference', () => {
      const event: RefundProcessedEvent = {
        eventId: 'evt-002',
        eventType: 'payment.refund_processed',
        occurredAt: new Date(),
        paymentId: 'refund-002',
        caseId: 'case-002',
        amount: 1000,
      };

      expect(event.originalPaymentId).toBeUndefined();
      expect(event.reason).toBeUndefined();
    });
  });

  // ==========================================================================
  // PAYMENT PLAN EVENT INTERFACE TESTS
  // ==========================================================================

  describe('PaymentPlanCreatedEvent interface', () => {
    it('should match expected shape', () => {
      const event: PaymentPlanCreatedEvent = {
        eventId: 'evt-001',
        eventType: 'payment_plan.created',
        occurredAt: new Date(),
        paymentPlanId: 'plan-001',
        caseId: 'case-001',
        totalAmount: 15000,
        numberOfInstallments: 6,
        installmentAmount: 2500,
        startDate: new Date('2024-02-01'),
      };

      expect(event.eventType).toBe('payment_plan.created');
      expect(event.numberOfInstallments).toBe(6);
      expect(event.totalAmount / event.numberOfInstallments).toBe(event.installmentAmount);
    });
  });

  describe('InstallmentPaidEvent interface', () => {
    it('should match expected shape', () => {
      const event: InstallmentPaidEvent = {
        eventId: 'evt-001',
        eventType: 'payment_plan.installment_paid',
        occurredAt: new Date(),
        paymentPlanId: 'plan-001',
        installmentId: 'inst-001',
        installmentNumber: 2,
        amount: 2500,
        remainingInstallments: 4,
      };

      expect(event.eventType).toBe('payment_plan.installment_paid');
      expect(event.remainingInstallments).toBe(4);
    });

    it('should handle last installment', () => {
      const event: InstallmentPaidEvent = {
        eventId: 'evt-002',
        eventType: 'payment_plan.installment_paid',
        occurredAt: new Date(),
        paymentPlanId: 'plan-001',
        installmentId: 'inst-006',
        installmentNumber: 6,
        amount: 2500,
        remainingInstallments: 0,
      };

      expect(event.remainingInstallments).toBe(0);
    });
  });

  describe('InstallmentOverdueEvent interface', () => {
    it('should match expected shape', () => {
      const event: InstallmentOverdueEvent = {
        eventId: 'evt-001',
        eventType: 'payment_plan.installment_overdue',
        occurredAt: new Date(),
        paymentPlanId: 'plan-001',
        installmentId: 'inst-003',
        installmentNumber: 3,
        amount: 2500,
        dueDate: new Date('2024-04-01'),
        daysOverdue: 15,
      };

      expect(event.eventType).toBe('payment_plan.installment_overdue');
      expect(event.daysOverdue).toBe(15);
    });

    it('should handle various overdue scenarios', () => {
      const overdueScenarios = [1, 7, 30, 60, 90];

      for (const days of overdueScenarios) {
        const event: InstallmentOverdueEvent = {
          eventId: `evt-${days}`,
          eventType: 'payment_plan.installment_overdue',
          occurredAt: new Date(),
          paymentPlanId: 'plan-001',
          installmentId: 'inst-001',
          installmentNumber: 1,
          amount: 2500,
          dueDate: new Date('2024-03-01'),
          daysOverdue: days,
        };

        expect(event.daysOverdue).toBe(days);
      }
    });
  });

  // ==========================================================================
  // UNION TYPE TESTS
  // ==========================================================================

  describe('CaseDomainEvent union type', () => {
    it('should support all event types', () => {
      const events: CaseDomainEvent[] = [
        {
          eventId: 'evt-1',
          eventType: 'case.created',
          occurredAt: new Date(),
          caseId: 'case-001',
          clinicId: 'clinic-001',
          leadId: 'lead-001',
          treatmentPlanId: 'plan-001',
          caseNumber: 'CASE-001',
          totalAmount: 10000,
          currency: 'EUR',
        },
        {
          eventId: 'evt-2',
          eventType: 'case.status_changed',
          occurredAt: new Date(),
          caseId: 'case-001',
          previousStatus: 'DRAFT',
          newStatus: 'APPROVED',
        },
        {
          eventId: 'evt-3',
          eventType: 'case.payment_status_changed',
          occurredAt: new Date(),
          caseId: 'case-001',
          previousStatus: 'PENDING',
          newStatus: 'PAID',
          paidAmount: 10000,
          totalAmount: 10000,
        },
        {
          eventId: 'evt-4',
          eventType: 'case.started',
          occurredAt: new Date(),
          caseId: 'case-001',
          startedAt: new Date(),
        },
        {
          eventId: 'evt-5',
          eventType: 'case.completed',
          occurredAt: new Date(),
          caseId: 'case-001',
          completedAt: new Date(),
          totalPaid: 10000,
          outstandingBalance: 0,
        },
        {
          eventId: 'evt-6',
          eventType: 'payment.created',
          occurredAt: new Date(),
          paymentId: 'pay-001',
          caseId: 'case-001',
          amount: 5000,
          currency: 'EUR',
          type: 'DEPOSIT',
          method: 'CARD',
        },
        {
          eventId: 'evt-7',
          eventType: 'payment.processed',
          occurredAt: new Date(),
          paymentId: 'pay-001',
          caseId: 'case-001',
          amount: 5000,
          processorName: 'Stripe',
          processorTransactionId: 'pi_123',
          processedAt: new Date(),
        },
        {
          eventId: 'evt-8',
          eventType: 'payment.failed',
          occurredAt: new Date(),
          paymentId: 'pay-002',
          caseId: 'case-001',
          amount: 5000,
          reason: 'Declined',
        },
        {
          eventId: 'evt-9',
          eventType: 'payment.refund_processed',
          occurredAt: new Date(),
          paymentId: 'refund-001',
          caseId: 'case-001',
          amount: 2500,
        },
        {
          eventId: 'evt-10',
          eventType: 'payment_plan.created',
          occurredAt: new Date(),
          paymentPlanId: 'plan-001',
          caseId: 'case-001',
          totalAmount: 10000,
          numberOfInstallments: 5,
          installmentAmount: 2000,
          startDate: new Date(),
        },
        {
          eventId: 'evt-11',
          eventType: 'payment_plan.installment_paid',
          occurredAt: new Date(),
          paymentPlanId: 'plan-001',
          installmentId: 'inst-001',
          installmentNumber: 1,
          amount: 2000,
          remainingInstallments: 4,
        },
        {
          eventId: 'evt-12',
          eventType: 'payment_plan.installment_overdue',
          occurredAt: new Date(),
          paymentPlanId: 'plan-001',
          installmentId: 'inst-002',
          installmentNumber: 2,
          amount: 2000,
          dueDate: new Date(),
          daysOverdue: 10,
        },
      ];

      expect(events).toHaveLength(12);

      // Verify all event types are unique
      const eventTypes = events.map((e) => e.eventType);
      const uniqueTypes = new Set(eventTypes);
      expect(uniqueTypes.size).toBe(12);
    });
  });
});
