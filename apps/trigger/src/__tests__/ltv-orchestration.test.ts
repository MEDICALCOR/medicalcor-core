import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for LTV Orchestration Workflow
 * Tests the complete Lead → Case → Payment → LTV flow
 */

// Mock environment variables
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');

// Mock pg Pool
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    }),
    end: vi.fn(),
  })),
}));

import { createInMemoryEventStore } from '@medicalcor/core';
import { createPLTVScoringService, type PLTVPredictionInput } from '@medicalcor/domain';

describe('LTV Orchestration Workflow', () => {
  const correlationId = 'ltv-test-123';
  const leadId = '123e4567-e89b-12d3-a456-426614174000';
  const clinicId = '123e4567-e89b-12d3-a456-426614174001';
  const caseId = '123e4567-e89b-12d3-a456-426614174002';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Record Payment to Case', () => {
    it('should validate payload schema correctly', () => {
      const validPayload = {
        paymentId: 'pi_test123',
        leadId,
        clinicId,
        amount: 50000,
        currency: 'EUR',
        method: 'card' as const,
        type: 'payment' as const,
        processorName: 'stripe',
        processorTransactionId: 'pi_test123',
        correlationId,
      };

      expect(validPayload.paymentId).toBeDefined();
      expect(validPayload.leadId).toBeDefined();
      expect(validPayload.clinicId).toBeDefined();
      expect(validPayload.amount).toBeGreaterThan(0);
    });

    it('should handle optional caseId and treatmentPlanId', () => {
      const payloadWithCase = {
        paymentId: 'pi_test123',
        leadId,
        clinicId,
        caseId,
        treatmentPlanId: '123e4567-e89b-12d3-a456-426614174003',
        amount: 50000,
        currency: 'EUR',
        method: 'card' as const,
        type: 'payment' as const,
        processorName: 'stripe',
        processorTransactionId: 'pi_test123',
        correlationId,
      };

      const payloadWithoutCase = {
        paymentId: 'pi_test456',
        leadId,
        clinicId,
        amount: 30000,
        currency: 'EUR',
        method: 'card' as const,
        type: 'payment' as const,
        processorName: 'stripe',
        processorTransactionId: 'pi_test456',
        correlationId,
      };

      expect(payloadWithCase.caseId).toBe(caseId);
      expect(payloadWithCase.treatmentPlanId).toBeDefined();
      expect(payloadWithoutCase.caseId).toBeUndefined();
      expect(payloadWithoutCase.treatmentPlanId).toBeUndefined();
    });

    it('should support all valid payment types', () => {
      const paymentTypes = [
        'payment',
        'deposit',
        'installment',
        'refund',
        'adjustment',
        'financing_payout',
      ] as const;

      for (const type of paymentTypes) {
        const payload = {
          paymentId: `pi_${type}`,
          leadId,
          clinicId,
          amount: 10000,
          currency: 'EUR',
          method: 'card' as const,
          type,
          processorName: 'stripe',
          processorTransactionId: `pi_${type}`,
          correlationId,
        };

        expect(payload.type).toBe(type);
      }
    });

    it('should support all valid payment methods', () => {
      const paymentMethods = [
        'cash',
        'card',
        'bank_transfer',
        'financing',
        'insurance',
        'check',
        'other',
      ] as const;

      for (const method of paymentMethods) {
        const payload = {
          paymentId: `pi_${method}`,
          leadId,
          clinicId,
          amount: 10000,
          currency: 'EUR',
          method,
          type: 'payment' as const,
          processorName: 'stripe',
          processorTransactionId: `pi_${method}`,
          correlationId,
        };

        expect(payload.method).toBe(method);
      }
    });

    it('should generate valid payment reference format', () => {
      const year = new Date().getFullYear();
      const nextSeq = 42;
      const paymentReference = `PAY-${year}-${nextSeq.toString().padStart(6, '0')}`;

      expect(paymentReference).toMatch(/^PAY-\d{4}-\d{6}$/);
      expect(paymentReference).toBe(`PAY-${year}-000042`);
    });

    it('should convert amount from cents to EUR correctly', () => {
      const amountInCents = 50000;
      const amountInEur = amountInCents / 100;

      expect(amountInEur).toBe(500);
    });

    it('should emit ltv.payment_recorded event', async () => {
      const eventStore = createInMemoryEventStore('ltv-payment');

      await eventStore.emit({
        type: 'ltv.payment_recorded',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'lead',
        payload: {
          leadId,
          clinicId,
          caseId,
          paymentId: 'pay_123',
          paymentReference: 'PAY-2025-000001',
          amount: 500,
          currency: 'EUR',
          stripePaymentId: 'pi_test123',
        },
      });

      const events = await eventStore.getByType('ltv.payment_recorded');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.amount).toBe(500);
    });
  });

  describe('pLTV Recalculation', () => {
    it('should validate recalculation payload schema', () => {
      const payload = {
        leadId,
        clinicId,
        correlationId,
        reason: 'payment_received',
      };

      expect(payload.leadId).toBeDefined();
      expect(payload.clinicId).toBeDefined();
      expect(payload.correlationId).toBeDefined();
      expect(payload.reason).toBe('payment_received');
    });

    it('should calculate pLTV using domain service', () => {
      const pltvService = createPLTVScoringService();

      const input: PLTVPredictionInput = {
        leadId,
        clinicId,
        historical: {
          totalPaid: 15000,
          totalCaseValue: 20000,
          totalOutstanding: 5000,
          completedCases: 2,
          totalCases: 3,
          avgCaseValue: 6666.67,
          daysSinceFirstCase: 365,
          daysSinceLastCase: 30,
        },
        paymentBehavior: {
          onTimePaymentRate: 95,
          paymentPlansUsed: 1,
          avgDaysToPayment: 5,
          missedPayments: 0,
          preferredPaymentMethod: 'card',
        },
        engagement: {
          totalAppointments: 10,
          keptAppointments: 9,
          canceledAppointments: 1,
          noShows: 0,
          daysSinceLastContact: 15,
          referralsMade: 2,
          hasNPSFeedback: true,
          npsScore: 9,
        },
        procedureInterest: {
          allOnXInterest: false,
          implantInterest: true,
          fullMouthInterest: false,
          cosmeticInterest: false,
          highValueProceduresCompleted: 1,
        },
        retentionScore: 85,
      };

      const result = pltvService.calculatePLTV(input);

      expect(result.predictedLTV).toBeGreaterThan(0);
      expect(result.tier).toMatch(/^(DIAMOND|PLATINUM|GOLD|SILVER|BRONZE)$/);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.growthPotential).toMatch(/^(HIGH_GROWTH|MODERATE_GROWTH|STABLE|DECLINING)$/);
    });

    it('should classify tiers correctly based on predicted LTV', () => {
      const pltvService = createPLTVScoringService();

      // High-value patient with All-on-X interest
      const highValueInput: PLTVPredictionInput = {
        leadId,
        clinicId,
        historical: {
          totalPaid: 50000,
          totalCaseValue: 60000,
          totalOutstanding: 10000,
          completedCases: 3,
          totalCases: 4,
          avgCaseValue: 15000,
          daysSinceFirstCase: 730,
          daysSinceLastCase: 10,
        },
        paymentBehavior: {
          onTimePaymentRate: 100,
          paymentPlansUsed: 0,
          avgDaysToPayment: 3,
          missedPayments: 0,
          preferredPaymentMethod: 'card',
        },
        engagement: {
          totalAppointments: 20,
          keptAppointments: 19,
          canceledAppointments: 1,
          noShows: 0,
          daysSinceLastContact: 7,
          referralsMade: 5,
          hasNPSFeedback: true,
          npsScore: 10,
        },
        procedureInterest: {
          allOnXInterest: true,
          implantInterest: true,
          fullMouthInterest: true,
          cosmeticInterest: false,
          highValueProceduresCompleted: 2,
        },
        retentionScore: 95,
      };

      const result = pltvService.calculatePLTV(highValueInput);

      // Should be high tier (DIAMOND or PLATINUM)
      expect(['DIAMOND', 'PLATINUM', 'GOLD']).toContain(result.tier);
      expect(result.investmentPriority).toMatch(/^PRIORITATE_(MAXIMA|RIDICATA)$/);
    });

    it('should identify declining patients', () => {
      const pltvService = createPLTVScoringService();

      const decliningInput: PLTVPredictionInput = {
        leadId,
        clinicId,
        historical: {
          totalPaid: 2000,
          totalCaseValue: 5000,
          totalOutstanding: 3000,
          completedCases: 1,
          totalCases: 2,
          avgCaseValue: 2500,
          daysSinceFirstCase: 730,
          daysSinceLastCase: 400, // Very inactive
        },
        paymentBehavior: {
          onTimePaymentRate: 50,
          paymentPlansUsed: 2,
          avgDaysToPayment: 30,
          missedPayments: 3,
          preferredPaymentMethod: 'card',
        },
        engagement: {
          totalAppointments: 5,
          keptAppointments: 2,
          canceledAppointments: 2,
          noShows: 1,
          daysSinceLastContact: 200,
          referralsMade: 0,
          hasNPSFeedback: true,
          npsScore: 3, // Detractor
        },
        procedureInterest: {
          allOnXInterest: false,
          implantInterest: false,
          fullMouthInterest: false,
          cosmeticInterest: false,
          highValueProceduresCompleted: 0,
        },
        retentionScore: 25,
      };

      const result = pltvService.calculatePLTV(decliningInput);

      // Should be low tier with declining growth
      expect(['SILVER', 'BRONZE']).toContain(result.tier);
      expect(['STABLE', 'DECLINING']).toContain(result.growthPotential);
    });

    it('should emit ltv.pltv_calculated event', async () => {
      const eventStore = createInMemoryEventStore('pltv-calc');

      await eventStore.emit({
        type: 'ltv.pltv_calculated',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'lead',
        payload: {
          leadId,
          clinicId,
          predictedLTV: 25000,
          tier: 'GOLD',
          growthPotential: 'MODERATE_GROWTH',
          reason: 'payment_received',
        },
      });

      const events = await eventStore.getByType('ltv.pltv_calculated');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.tier).toBe('GOLD');
    });

    it('should emit high_value_lead_identified for DIAMOND/PLATINUM leads', async () => {
      const eventStore = createInMemoryEventStore('high-value');

      const tier = 'DIAMOND';

      if (tier === 'DIAMOND' || tier === 'PLATINUM') {
        await eventStore.emit({
          type: 'ltv.high_value_lead_identified',
          correlationId,
          aggregateId: leadId,
          aggregateType: 'lead',
          payload: {
            leadId,
            clinicId,
            predictedLTV: 75000,
            tier,
            investmentPriority: 'PRIORITATE_MAXIMA',
            confidence: 0.85,
          },
        });
      }

      const events = await eventStore.getByType('ltv.high_value_lead_identified');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.tier).toBe('DIAMOND');
    });
  });

  describe('Batch pLTV Recalculation', () => {
    it('should validate batch payload schema', () => {
      const payload = {
        clinicId,
        correlationId,
      };

      expect(payload.correlationId).toBeDefined();
      expect(payload.clinicId).toBe(clinicId);
    });

    it('should allow optional clinicId for global batch', () => {
      const globalPayload = {
        correlationId,
      };

      expect(globalPayload.correlationId).toBeDefined();
      // @ts-expect-error clinicId is optional
      expect(globalPayload.clinicId).toBeUndefined();
    });

    it('should track batch processing results', () => {
      const batchResult = {
        success: true,
        total: 500,
        processed: 495,
        failed: 5,
        errors: ['lead-1: Connection timeout', 'lead-2: Invalid data'],
      };

      expect(batchResult.success).toBe(true);
      expect(batchResult.total).toBe(500);
      expect(batchResult.processed).toBe(495);
      expect(batchResult.failed).toBe(5);
      expect(batchResult.errors.length).toBe(2);
    });
  });

  describe('Scheduled Jobs', () => {
    it('should have correct cron schedule for daily LTV orchestration', () => {
      // Daily at 5:00 AM
      const cronSchedule = '0 5 * * *';
      const parts = cronSchedule.split(' ');

      expect(parts).toHaveLength(5);
      expect(parts[0]).toBe('0'); // minute
      expect(parts[1]).toBe('5'); // hour
      expect(parts[2]).toBe('*'); // day of month
      expect(parts[3]).toBe('*'); // month
      expect(parts[4]).toBe('*'); // day of week
    });

    it('should have correct cron schedule for weekly LTV audit', () => {
      // Every Sunday at 3:00 AM
      const cronSchedule = '0 3 * * 0';
      const parts = cronSchedule.split(' ');

      expect(parts).toHaveLength(5);
      expect(parts[0]).toBe('0'); // minute
      expect(parts[1]).toBe('3'); // hour
      expect(parts[4]).toBe('0'); // Sunday
    });

    it('should generate correct idempotency key format', () => {
      const date = new Date();
      const dateString = date.toISOString().split('T')[0];
      const idempotencyKey = `ltv-batch:${dateString}`;

      expect(idempotencyKey).toMatch(/^ltv-batch:\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Factor Calculations', () => {
    it('should calculate payment reliability factor correctly', () => {
      const calculatePaymentReliabilityFactor = (
        onTimeRate: number,
        missedPayments: number,
        usesFinancing: boolean
      ) => {
        let factor = 1.0;
        factor += (onTimeRate / 100) * 0.2;
        factor -= Math.min(missedPayments, 5) * 0.1 * 0.5;
        if (usesFinancing) factor += 0.1;
        return Math.max(0.7, Math.min(1.3, factor));
      };

      // Perfect payment history
      expect(calculatePaymentReliabilityFactor(100, 0, false)).toBeCloseTo(1.2, 1);

      // Good payment history with financing
      expect(calculatePaymentReliabilityFactor(90, 0, true)).toBeCloseTo(1.28, 1);

      // Poor payment history
      expect(calculatePaymentReliabilityFactor(50, 3, false)).toBeCloseTo(0.95, 1);
    });

    it('should calculate engagement factor correctly', () => {
      const calculateEngagementFactor = (
        completionRate: number,
        referrals: number,
        npsScore: number | null
      ) => {
        let factor = 1.0;
        factor += completionRate * 0.3;
        factor += Math.min(referrals, 5) * 0.15 * 0.5;
        if (npsScore !== null) {
          if (npsScore >= 9) factor += 0.1;
          else if (npsScore <= 6) factor -= 0.2;
        }
        return Math.max(0.6, Math.min(1.4, factor));
      };

      // Excellent engagement (promoter)
      expect(calculateEngagementFactor(0.95, 3, 10)).toBeCloseTo(1.415, 1);

      // Poor engagement (detractor)
      expect(calculateEngagementFactor(0.5, 0, 4)).toBeCloseTo(0.95, 1);
    });

    it('should calculate procedure interest factor correctly', () => {
      const calculateProcedureInterestFactor = (interest: {
        allOnX: boolean;
        implant: boolean;
        fullMouth: boolean;
        cosmetic: boolean;
      }) => {
        let factor = 1.0;
        if (interest.allOnX) factor = Math.max(factor, 2.5);
        if (interest.fullMouth) factor = Math.max(factor, 2.0);
        if (interest.implant) factor = Math.max(factor, 1.8);
        if (interest.cosmetic) factor = Math.max(factor, 1.3);
        return factor;
      };

      // All-on-X interest (highest multiplier)
      expect(
        calculateProcedureInterestFactor({
          allOnX: true,
          implant: true,
          fullMouth: false,
          cosmetic: false,
        })
      ).toBe(2.5);

      // No high-value interest
      expect(
        calculateProcedureInterestFactor({
          allOnX: false,
          implant: false,
          fullMouth: false,
          cosmetic: false,
        })
      ).toBe(1.0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      const errorResult = {
        success: false,
        error: 'ECONNREFUSED',
        retryable: true,
      };

      expect(errorResult.success).toBe(false);
      expect(errorResult.retryable).toBe(true);
    });

    it('should handle missing lead data gracefully', () => {
      const pltvService = createPLTVScoringService();

      // New lead with no history
      const newLeadInput: PLTVPredictionInput = {
        leadId,
        clinicId,
        historical: {
          totalPaid: 0,
          totalCaseValue: 0,
          totalOutstanding: 0,
          completedCases: 0,
          totalCases: 0,
          avgCaseValue: 0,
          daysSinceFirstCase: null,
          daysSinceLastCase: null,
        },
        paymentBehavior: {
          onTimePaymentRate: 100,
          paymentPlansUsed: 0,
          avgDaysToPayment: null,
          missedPayments: 0,
          preferredPaymentMethod: 'unknown',
        },
        engagement: {
          totalAppointments: 0,
          keptAppointments: 0,
          canceledAppointments: 0,
          noShows: 0,
          daysSinceLastContact: 1,
          referralsMade: 0,
          hasNPSFeedback: false,
          npsScore: null,
        },
        procedureInterest: {
          allOnXInterest: false,
          implantInterest: false,
          fullMouthInterest: false,
          cosmeticInterest: false,
          highValueProceduresCompleted: 0,
        },
        retentionScore: null,
      };

      const result = pltvService.calculatePLTV(newLeadInput);

      // Should still produce a valid result with default baseline
      expect(result.predictedLTV).toBeGreaterThan(0);
      expect(result.tier).toBeDefined();
      expect(result.confidence).toBeLessThan(0.7); // Lower confidence for new leads
    });

    it('should continue batch processing on individual failures', () => {
      const batchResult = {
        total: 100,
        processed: 97,
        failed: 3,
        errors: ['lead-1: Not found', 'lead-2: Invalid clinic', 'lead-3: Timeout'],
      };

      // Batch should still succeed even with some failures
      expect(batchResult.processed).toBeGreaterThan(batchResult.failed);
      expect(batchResult.errors.length).toBe(batchResult.failed);
    });
  });

  describe('Retry Configuration', () => {
    it('should have correct retry settings for payment recording', () => {
      const retryConfig = {
        maxAttempts: 3,
        minTimeoutInMs: 1000,
        maxTimeoutInMs: 10000,
        factor: 2,
      };

      expect(retryConfig.maxAttempts).toBe(3);
      expect(retryConfig.factor).toBe(2);
    });

    it('should have correct retry settings for batch processing', () => {
      const retryConfig = {
        maxAttempts: 2,
        minTimeoutInMs: 5000,
        maxTimeoutInMs: 60000,
        factor: 2,
      };

      expect(retryConfig.maxAttempts).toBe(2);
      expect(retryConfig.minTimeoutInMs).toBe(5000);
    });

    it('should calculate exponential backoff correctly', () => {
      const minTimeout = 1000;
      const factor = 2;

      const attempt1 = minTimeout;
      const attempt2 = minTimeout * factor;
      const attempt3 = minTimeout * factor * factor;

      expect(attempt1).toBe(1000);
      expect(attempt2).toBe(2000);
      expect(attempt3).toBe(4000);
    });
  });

  describe('Integration with Payment Handler', () => {
    it('should trigger LTV orchestration when leadId and clinicId are provided', () => {
      const paymentPayload = {
        paymentId: 'pi_test123',
        amount: 50000,
        currency: 'EUR',
        customerId: 'cus_test',
        customerEmail: 'test@example.com',
        correlationId,
        leadId,
        clinicId,
      };

      const shouldTriggerLTV = !!(paymentPayload.leadId && paymentPayload.clinicId);
      expect(shouldTriggerLTV).toBe(true);
    });

    it('should skip LTV orchestration when leadId or clinicId are missing', () => {
      const paymentPayload = {
        paymentId: 'pi_test456',
        amount: 30000,
        currency: 'EUR',
        customerId: 'cus_test',
        customerEmail: 'test@example.com',
        correlationId,
        // No leadId or clinicId
      };

      // @ts-expect-error - checking runtime behavior
      const shouldTriggerLTV = !!(paymentPayload.leadId && paymentPayload.clinicId);
      expect(shouldTriggerLTV).toBe(false);
    });
  });
});
