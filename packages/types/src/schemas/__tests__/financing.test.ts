/**
 * @fileoverview Financing Schema Tests
 *
 * L2 Feature: Tests for financing and payment plan type schemas.
 *
 * @module types/schemas/__tests__/financing
 */

import { describe, it, expect } from 'vitest';
import {
  FinancingApplicationStatusSchema,
  FinancingPlanTypeSchema,
  FinancingTermSchema,
  FinancingDecisionCodeSchema,
  FinancingProviderSchema,
  FinancingApplicantSchema,
  CreateFinancingApplicationSchema,
  FinancingOfferSchema,
  FinancingApplicationSchema,
  AcceptFinancingOfferSchema,
  FinancingEligibilityCheckSchema,
  FinancingEligibilityResultSchema,
  FinancingSummarySchema,
  toMajorCurrencyUnits,
  toMinorCurrencyUnits,
  formatFinancingAmount,
  calculateMonthlyPayment,
  calculateTotalRepayment,
  calculateFinanceCharge,
  isApplicationActionable,
  isApplicationExpired,
  getFinancingStatusLabel,
} from '../financing.js';

describe('Financing Enums', () => {
  describe('FinancingApplicationStatusSchema', () => {
    it('should accept valid statuses', () => {
      const validStatuses = [
        'draft',
        'pending',
        'approved',
        'declined',
        'expired',
        'cancelled',
        'accepted',
        'funded',
      ];

      for (const status of validStatuses) {
        const result = FinancingApplicationStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = FinancingApplicationStatusSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('FinancingPlanTypeSchema', () => {
    it('should accept valid plan types', () => {
      const validTypes = ['installment', 'deferred', 'revolving', 'promotional'];

      for (const type of validTypes) {
        const result = FinancingPlanTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('FinancingTermSchema', () => {
    it('should accept valid terms', () => {
      const validTerms = ['3', '6', '12', '18', '24', '36', '48', '60'];

      for (const term of validTerms) {
        const result = FinancingTermSchema.safeParse(term);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid term', () => {
      const result = FinancingTermSchema.safeParse('15');
      expect(result.success).toBe(false);
    });
  });

  describe('FinancingProviderSchema', () => {
    it('should accept valid providers', () => {
      const validProviders = ['stripe_financing', 'affirm', 'afterpay', 'klarna'];

      for (const provider of validProviders) {
        const result = FinancingProviderSchema.safeParse(provider);
        expect(result.success).toBe(true);
      }
    });
  });
});

describe('FinancingApplicantSchema', () => {
  it('should validate complete applicant data', () => {
    const applicant = {
      leadId: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'Maria',
      lastName: 'Popescu',
      email: 'maria@example.com',
      phone: '+40712345678',
      dateOfBirth: new Date('1985-03-15'),
      addressLine1: 'Str. Exemplu 123',
      city: 'Bucuresti',
      postalCode: '010101',
      country: 'RO',
    };

    const result = FinancingApplicantSchema.safeParse(applicant);
    expect(result.success).toBe(true);
  });

  it('should validate minimal applicant data', () => {
    const applicant = {
      leadId: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'Maria',
      lastName: 'Popescu',
      email: 'maria@example.com',
      phone: '+40712345678',
    };

    const result = FinancingApplicantSchema.safeParse(applicant);
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const applicant = {
      leadId: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'Maria',
      lastName: 'Popescu',
      email: 'invalid-email',
      phone: '+40712345678',
    };

    const result = FinancingApplicantSchema.safeParse(applicant);
    expect(result.success).toBe(false);
  });

  it('should default country to RO', () => {
    const applicant = {
      leadId: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'Maria',
      lastName: 'Popescu',
      email: 'maria@example.com',
      phone: '+40712345678',
    };

    const result = FinancingApplicantSchema.parse(applicant);
    expect(result.country).toBe('RO');
  });
});

describe('CreateFinancingApplicationSchema', () => {
  it('should validate complete application request', () => {
    const request = {
      caseId: '550e8400-e29b-41d4-a716-446655440001',
      clinicId: '550e8400-e29b-41d4-a716-446655440002',
      applicant: {
        leadId: '550e8400-e29b-41d4-a716-446655440000',
        firstName: 'Maria',
        lastName: 'Popescu',
        email: 'maria@example.com',
        phone: '+40712345678',
      },
      requestedAmount: 350000,
      currency: 'RON',
      preferredPlanType: 'installment',
      preferredTerm: '12',
      treatmentDescription: 'All-on-X implants',
      treatmentCategory: 'all_on_x',
      correlationId: 'corr-123',
    };

    const result = CreateFinancingApplicationSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('should reject negative requested amount', () => {
    const request = {
      caseId: '550e8400-e29b-41d4-a716-446655440001',
      clinicId: '550e8400-e29b-41d4-a716-446655440002',
      applicant: {
        leadId: '550e8400-e29b-41d4-a716-446655440000',
        firstName: 'Maria',
        lastName: 'Popescu',
        email: 'maria@example.com',
        phone: '+40712345678',
      },
      requestedAmount: -100,
      correlationId: 'corr-123',
    };

    const result = CreateFinancingApplicationSchema.safeParse(request);
    expect(result.success).toBe(false);
  });
});

describe('FinancingOfferSchema', () => {
  it('should validate complete offer', () => {
    const offer = {
      offerId: 'offer_123',
      provider: 'stripe_financing',
      planType: 'installment',
      approvedAmount: 350000,
      currency: 'RON',
      apr: 14.99,
      termMonths: 12,
      monthlyPayment: 31500,
      totalRepayment: 378000,
      financeCharge: 28000,
      downPayment: 0,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      requiresAcceptance: true,
      termsUrl: 'https://example.com/terms',
    };

    const result = FinancingOfferSchema.safeParse(offer);
    expect(result.success).toBe(true);
  });

  it('should reject APR over 100', () => {
    const offer = {
      offerId: 'offer_123',
      provider: 'stripe_financing',
      planType: 'installment',
      approvedAmount: 350000,
      currency: 'RON',
      apr: 150, // Invalid
      termMonths: 12,
      monthlyPayment: 31500,
      totalRepayment: 378000,
      financeCharge: 28000,
      downPayment: 0,
      validUntil: new Date(),
      requiresAcceptance: true,
    };

    const result = FinancingOfferSchema.safeParse(offer);
    expect(result.success).toBe(false);
  });
});

describe('FinancingEligibilityResultSchema', () => {
  it('should validate eligible result', () => {
    const result = {
      eligible: true,
      preQualifiedAmountMin: 100000,
      preQualifiedAmountMax: 500000,
      estimatedAprMin: 9.99,
      estimatedAprMax: 19.99,
      availableTerms: ['6', '12', '18', '24'],
      availablePlanTypes: ['installment', 'deferred'],
      ineligibleReason: null,
      checkId: 'check_123',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    const parsed = FinancingEligibilityResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('should validate ineligible result', () => {
    const result = {
      eligible: false,
      preQualifiedAmountMin: null,
      preQualifiedAmountMax: null,
      estimatedAprMin: null,
      estimatedAprMax: null,
      availableTerms: [],
      availablePlanTypes: [],
      ineligibleReason: 'Credit score below minimum',
      checkId: 'check_456',
      validUntil: new Date(),
    };

    const parsed = FinancingEligibilityResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('FinancingSummarySchema', () => {
  it('should validate summary data', () => {
    const summary = {
      totalApplications: 100,
      pendingApplications: 5,
      approvedApplications: 80,
      fundedApplications: 75,
      totalFundedAmount: 26250000, // 262,500 RON
      currency: 'RON',
      averageApr: 14.5,
      averageTermMonths: 12,
      approvalRate: 80.0,
    };

    const result = FinancingSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
  });
});

describe('Helper Functions', () => {
  describe('toMajorCurrencyUnits', () => {
    it('should convert minor to major units', () => {
      expect(toMajorCurrencyUnits(35000)).toBe(350);
      expect(toMajorCurrencyUnits(100)).toBe(1);
      expect(toMajorCurrencyUnits(150)).toBe(1.5);
    });

    it('should handle zero', () => {
      expect(toMajorCurrencyUnits(0)).toBe(0);
    });
  });

  describe('toMinorCurrencyUnits', () => {
    it('should convert major to minor units', () => {
      expect(toMinorCurrencyUnits(350)).toBe(35000);
      expect(toMinorCurrencyUnits(1)).toBe(100);
      expect(toMinorCurrencyUnits(1.5)).toBe(150);
    });

    it('should handle floating point precision', () => {
      expect(toMinorCurrencyUnits(19.99)).toBe(1999);
    });
  });

  describe('formatFinancingAmount', () => {
    it('should format amount in RON', () => {
      const formatted = formatFinancingAmount(35000, 'RON', 'ro-RO');
      expect(formatted).toContain('350');
      expect(formatted).toContain('RON');
    });

    it('should format amount in EUR', () => {
      const formatted = formatFinancingAmount(10000, 'EUR', 'ro-RO');
      expect(formatted).toContain('100');
      expect(formatted).toContain('EUR');
    });
  });

  describe('calculateMonthlyPayment', () => {
    it('should calculate monthly payment with interest', () => {
      // 3500 RON (350000 bani) at 14.99% APR for 12 months
      const payment = calculateMonthlyPayment(350000, 14.99, 12);

      // Expected: approximately 31,500 bani (315 RON) per month
      expect(payment).toBeGreaterThan(30000);
      expect(payment).toBeLessThan(33000);
    });

    it('should handle 0% APR', () => {
      const payment = calculateMonthlyPayment(120000, 0, 12);
      expect(payment).toBe(10000); // 120000 / 12
    });

    it('should calculate for different terms', () => {
      const payment6 = calculateMonthlyPayment(100000, 10, 6);
      const payment12 = calculateMonthlyPayment(100000, 10, 12);
      const payment24 = calculateMonthlyPayment(100000, 10, 24);

      // Shorter term = higher monthly payment
      expect(payment6).toBeGreaterThan(payment12);
      expect(payment12).toBeGreaterThan(payment24);
    });
  });

  describe('calculateTotalRepayment', () => {
    it('should calculate total repayment', () => {
      const total = calculateTotalRepayment(31500, 12, 0);
      expect(total).toBe(378000);
    });

    it('should include down payment', () => {
      const total = calculateTotalRepayment(31500, 12, 50000);
      expect(total).toBe(428000);
    });
  });

  describe('calculateFinanceCharge', () => {
    it('should calculate finance charge', () => {
      const charge = calculateFinanceCharge(350000, 378000);
      expect(charge).toBe(28000);
    });

    it('should account for down payment', () => {
      const charge = calculateFinanceCharge(350000, 428000, 50000);
      expect(charge).toBe(28000);
    });

    it('should return 0 for no interest', () => {
      const charge = calculateFinanceCharge(120000, 120000);
      expect(charge).toBe(0);
    });
  });

  describe('isApplicationActionable', () => {
    it('should return true for actionable statuses', () => {
      expect(isApplicationActionable('draft')).toBe(true);
      expect(isApplicationActionable('approved')).toBe(true);
    });

    it('should return false for non-actionable statuses', () => {
      expect(isApplicationActionable('pending')).toBe(false);
      expect(isApplicationActionable('funded')).toBe(false);
      expect(isApplicationActionable('declined')).toBe(false);
    });
  });

  describe('isApplicationExpired', () => {
    it('should return true for expired status', () => {
      expect(isApplicationExpired('expired', null)).toBe(true);
    });

    it('should return true for past expiration date', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(isApplicationExpired('approved', pastDate)).toBe(true);
    });

    it('should return false for future expiration date', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(isApplicationExpired('approved', futureDate)).toBe(false);
    });

    it('should return false when no expiration date', () => {
      expect(isApplicationExpired('pending', null)).toBe(false);
    });
  });

  describe('getFinancingStatusLabel', () => {
    it('should return English labels', () => {
      expect(getFinancingStatusLabel('approved', 'en')).toBe('Approved');
      expect(getFinancingStatusLabel('funded', 'en')).toBe('Funded');
      expect(getFinancingStatusLabel('pending', 'en')).toBe('Under Review');
    });

    it('should return Romanian labels', () => {
      expect(getFinancingStatusLabel('approved', 'ro')).toBe('Aprobat');
      expect(getFinancingStatusLabel('funded', 'ro')).toBe('Finanțat');
      expect(getFinancingStatusLabel('pending', 'ro')).toBe('În analiză');
    });

    it('should default to English for unknown locale', () => {
      expect(getFinancingStatusLabel('approved', 'fr')).toBe('Approved');
    });
  });
});
