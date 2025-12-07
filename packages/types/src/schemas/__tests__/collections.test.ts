/**
 * @fileoverview Tests for Collections & Overdue Payment Schemas
 *
 * M5 Feature: Automated collections for overdue payment reminders
 */

import { describe, it, expect } from 'vitest';
import {
  OverdueInstallmentSchema,
  ReminderConfigSchema,
  PaymentReminderPayloadSchema,
  OverdueDetectionResultSchema,
  determineReminderLevel,
  getReminderTemplateName,
  shouldSendReminder,
  calculateLateFee,
  formatCurrencyForReminder,
  formatDateForReminder,
  type ReminderConfig,
} from '../collections.js';

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

describe('OverdueInstallmentSchema', () => {
  const validInstallment = {
    installmentId: '550e8400-e29b-41d4-a716-446655440000',
    paymentPlanId: '550e8400-e29b-41d4-a716-446655440001',
    caseId: '550e8400-e29b-41d4-a716-446655440002',
    clinicId: '550e8400-e29b-41d4-a716-446655440003',
    leadId: '550e8400-e29b-41d4-a716-446655440004',
    installmentNumber: 1,
    amountDue: 500,
    currency: 'EUR',
    dueDate: new Date().toISOString(),
    daysOverdue: 5,
    reminderCount: 0,
    lastReminderSentAt: null,
    reminderLevel: null,
    lateFeeApplied: 0,
    totalOwed: 500,
    phone: '+40712345678',
    fullName: 'Test Patient',
    language: 'ro',
    caseOutstandingAmount: 1500,
    planFrequency: 'monthly',
    totalInstallments: 6,
    installmentsPaid: 2,
  };

  it('should validate a correct overdue installment', () => {
    const result = OverdueInstallmentSchema.safeParse(validInstallment);
    expect(result.success).toBe(true);
  });

  it('should reject invalid UUID', () => {
    const invalid = { ...validInstallment, installmentId: 'not-a-uuid' };
    const result = OverdueInstallmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject negative amount', () => {
    const invalid = { ...validInstallment, amountDue: -100 };
    const result = OverdueInstallmentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should validate with optional email', () => {
    const withEmail = { ...validInstallment, email: 'test@example.com' };
    const result = OverdueInstallmentSchema.safeParse(withEmail);
    expect(result.success).toBe(true);
  });
});

describe('ReminderConfigSchema', () => {
  it('should validate default config', () => {
    const config = {
      firstReminderDays: 1,
      secondReminderDays: 7,
      finalReminderDays: 14,
      escalationDays: 21,
      minDaysBetweenReminders: 3,
      maxReminders: 3,
      lateFeeAfterDays: 7,
      lateFeePercentage: 0.05,
    };
    const result = ReminderConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject invalid late fee percentage', () => {
    const invalid = { lateFeePercentage: 1.5 }; // > 100%
    const result = ReminderConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('determineReminderLevel', () => {
  const config: ReminderConfig = {
    firstReminderDays: 1,
    secondReminderDays: 7,
    finalReminderDays: 14,
    escalationDays: 21,
    minDaysBetweenReminders: 3,
    maxReminders: 3,
    lateFeeAfterDays: 7,
    lateFeePercentage: 0,
  };

  it('should return first for early overdue', () => {
    expect(determineReminderLevel(3, 0, config)).toBe('first');
  });

  it('should return second after 7 days', () => {
    expect(determineReminderLevel(8, 1, config)).toBe('second');
  });

  it('should return final after 14 days', () => {
    expect(determineReminderLevel(15, 2, config)).toBe('final');
  });

  it('should return escalated after 21 days', () => {
    expect(determineReminderLevel(22, 2, config)).toBe('escalated');
  });

  it('should return escalated when max reminders reached', () => {
    expect(determineReminderLevel(5, 3, config)).toBe('escalated');
  });
});

describe('getReminderTemplateName', () => {
  it('should return correct template for each level', () => {
    expect(getReminderTemplateName('first')).toBe('payment_reminder_first');
    expect(getReminderTemplateName('second')).toBe('payment_reminder_second');
    expect(getReminderTemplateName('final')).toBe('payment_reminder_final');
    expect(getReminderTemplateName('escalated')).toBe('payment_reminder_final');
  });
});

describe('shouldSendReminder', () => {
  it('should return true when never reminded', () => {
    expect(shouldSendReminder(null, 3)).toBe(true);
  });

  it('should return false when reminded recently', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    expect(shouldSendReminder(oneHourAgo, 3)).toBe(false);
  });

  it('should return true when min days passed', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    expect(shouldSendReminder(fourDaysAgo, 3)).toBe(true);
  });
});

describe('calculateLateFee', () => {
  const config: ReminderConfig = {
    firstReminderDays: 1,
    secondReminderDays: 7,
    finalReminderDays: 14,
    escalationDays: 21,
    minDaysBetweenReminders: 3,
    maxReminders: 3,
    lateFeeAfterDays: 7,
    lateFeePercentage: 0.05,
  };

  it('should return 0 when not overdue enough', () => {
    expect(calculateLateFee(1000, 5, config)).toBe(0);
  });

  it('should calculate late fee correctly', () => {
    expect(calculateLateFee(1000, 10, config)).toBe(50); // 5% of 1000
  });

  it('should return 0 when fee percentage is 0', () => {
    const noFeeConfig = { ...config, lateFeePercentage: 0 };
    expect(calculateLateFee(1000, 10, noFeeConfig)).toBe(0);
  });
});

describe('formatCurrencyForReminder', () => {
  it('should format EUR in Romanian', () => {
    const result = formatCurrencyForReminder(500, 'EUR', 'ro');
    expect(result).toContain('500');
    expect(result).toContain('EUR');
  });

  it('should format EUR in English', () => {
    const result = formatCurrencyForReminder(500, 'EUR', 'en');
    expect(result).toContain('500');
  });

  it('should format EUR in German', () => {
    const result = formatCurrencyForReminder(500, 'EUR', 'de');
    expect(result).toContain('500');
  });
});

describe('formatDateForReminder', () => {
  it('should format date in Romanian', () => {
    const date = new Date('2024-12-15');
    const result = formatDateForReminder(date, 'ro');
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });

  it('should format date in English', () => {
    const date = new Date('2024-12-15');
    const result = formatDateForReminder(date, 'en');
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });

  it('should format date in German', () => {
    const date = new Date('2024-12-15');
    const result = formatDateForReminder(date, 'de');
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });
});
