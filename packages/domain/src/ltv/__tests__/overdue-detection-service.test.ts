/**
 * @fileoverview Tests for Overdue Detection Service
 *
 * M5 Feature: Automated collections for overdue payment reminders
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OverdueDetectionService,
  createOverdueDetectionService,
  DEFAULT_REMINDER_CONFIG,
  type OverdueInstallmentRepository,
} from '../overdue-detection-service.js';
import type { OverdueInstallment, ReminderLevel } from '@medicalcor/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockInstallment(overrides: Partial<OverdueInstallment> = {}): OverdueInstallment {
  return {
    installmentId: 'inst-123',
    paymentPlanId: 'plan-456',
    caseId: 'case-789',
    clinicId: 'clinic-001',
    leadId: 'lead-abc',
    installmentNumber: 1,
    amountDue: 500,
    currency: 'EUR',
    dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    daysOverdue: 5,
    reminderCount: 0,
    lastReminderSentAt: null,
    reminderLevel: null,
    lateFeeApplied: 0,
    totalOwed: 500,
    phone: '+40712345678',
    fullName: 'Test Patient',
    email: 'test@example.com',
    language: 'ro',
    caseOutstandingAmount: 1500,
    planFrequency: 'monthly',
    totalInstallments: 6,
    installmentsPaid: 2,
    hubspotContactId: 'hubspot-123',
    ...overrides,
  };
}

function createMockRepository(): OverdueInstallmentRepository {
  return {
    findOverdueInstallments: vi.fn().mockResolvedValue([]),
    updateReminderTracking: vi.fn().mockResolvedValue(undefined),
    markAsOverdue: vi.fn().mockResolvedValue(undefined),
    applyLateFee: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('OverdueDetectionService', () => {
  let service: OverdueDetectionService;
  let mockRepository: OverdueInstallmentRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    service = createOverdueDetectionService(undefined, { repository: mockRepository });
  });

  describe('createOverdueDetectionService', () => {
    it('should create service with default config', () => {
      const svc = createOverdueDetectionService();
      expect(svc).toBeInstanceOf(OverdueDetectionService);
      expect(svc.getReminderConfig()).toEqual(DEFAULT_REMINDER_CONFIG);
    });

    it('should create service with custom config', () => {
      const customConfig = {
        reminderConfig: { ...DEFAULT_REMINDER_CONFIG, maxReminders: 5 },
        batchSize: 50,
      };
      const svc = createOverdueDetectionService(customConfig);
      expect(svc.getReminderConfig().maxReminders).toBe(5);
    });
  });

  describe('detectOverdueInstallments', () => {
    it('should detect overdue installments and prepare reminders', async () => {
      const installment = createMockInstallment({ daysOverdue: 5, reminderCount: 0 });
      vi.mocked(mockRepository.findOverdueInstallments).mockResolvedValue([installment]);

      const { result, reminders } = await service.detectOverdueInstallments(null, 'test-corr');

      expect(result.totalOverdue).toBe(1);
      expect(result.remindersTriggered).toBe(1);
      expect(reminders).toHaveLength(1);
      expect(reminders[0]?.reminderLevel).toBe('first');
      expect(reminders[0]?.templateName).toBe('payment_reminder_first');
    });

    it('should skip installments with recent reminders', async () => {
      const recentReminder = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const installment = createMockInstallment({
        daysOverdue: 5,
        reminderCount: 1,
        lastReminderSentAt: recentReminder,
      });
      vi.mocked(mockRepository.findOverdueInstallments).mockResolvedValue([installment]);

      const { result, reminders } = await service.detectOverdueInstallments(null, 'test-corr');

      expect(result.totalOverdue).toBe(1);
      expect(result.remindersTriggered).toBe(0);
      expect(reminders).toHaveLength(0);
    });

    it('should escalate reminders for installments past threshold', async () => {
      const installment = createMockInstallment({
        daysOverdue: 25,
        reminderCount: 2,
        lastReminderSentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });
      vi.mocked(mockRepository.findOverdueInstallments).mockResolvedValue([installment]);

      const { result, reminders } = await service.detectOverdueInstallments(null, 'test-corr');

      expect(result.byLevel.escalated).toBe(1);
      expect(reminders[0]?.reminderLevel).toBe('escalated');
      expect(reminders[0]?.createFollowUpTask).toBe(true);
    });

    it('should throw error when repository not configured', async () => {
      const svcWithoutDeps = createOverdueDetectionService();

      await expect(svcWithoutDeps.detectOverdueInstallments(null, 'test')).rejects.toThrow(
        'OverdueDetectionService dependencies not configured'
      );
    });
  });

  describe('determineReminderLevel', () => {
    const testCases: Array<{
      daysOverdue: number;
      reminderCount: number;
      expected: ReminderLevel;
    }> = [
      { daysOverdue: 1, reminderCount: 0, expected: 'first' },
      { daysOverdue: 5, reminderCount: 0, expected: 'first' },
      { daysOverdue: 7, reminderCount: 1, expected: 'second' },
      { daysOverdue: 10, reminderCount: 1, expected: 'second' },
      { daysOverdue: 14, reminderCount: 2, expected: 'final' },
      { daysOverdue: 18, reminderCount: 2, expected: 'final' },
      { daysOverdue: 21, reminderCount: 2, expected: 'escalated' },
      { daysOverdue: 5, reminderCount: 3, expected: 'escalated' }, // Max reminders hit
    ];

    testCases.forEach(({ daysOverdue, reminderCount, expected }) => {
      it(`should return ${expected} for ${daysOverdue} days overdue with ${reminderCount} reminders`, () => {
        const installment = createMockInstallment({
          daysOverdue,
          reminderCount,
          lastReminderSentAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        });
        vi.mocked(mockRepository.findOverdueInstallments).mockResolvedValue([installment]);

        // Test via detectOverdueInstallments result
        return service.detectOverdueInstallments(null, 'test').then(({ reminders }) => {
          expect(reminders[0]?.reminderLevel).toBe(expected);
        });
      });
    });
  });

  describe('filterUrgentInstallments', () => {
    it('should filter only final and escalated installments', () => {
      const installments = [
        createMockInstallment({ daysOverdue: 3, reminderCount: 0 }), // first
        createMockInstallment({ daysOverdue: 8, reminderCount: 1 }), // second
        createMockInstallment({ daysOverdue: 15, reminderCount: 2 }), // final
        createMockInstallment({ daysOverdue: 25, reminderCount: 3 }), // escalated
      ];

      const urgent = service.filterUrgentInstallments(installments);

      expect(urgent).toHaveLength(2);
      expect(urgent[0]?.daysOverdue).toBe(15);
      expect(urgent[1]?.daysOverdue).toBe(25);
    });

    it('should return empty array when no urgent installments', () => {
      const installments = [
        createMockInstallment({ daysOverdue: 3, reminderCount: 0 }),
        createMockInstallment({ daysOverdue: 8, reminderCount: 1 }),
      ];

      const urgent = service.filterUrgentInstallments(installments);

      expect(urgent).toHaveLength(0);
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate metrics for overdue installments', () => {
      const installments = [
        createMockInstallment({ totalOwed: 500, daysOverdue: 5 }),
        createMockInstallment({ totalOwed: 1000, daysOverdue: 15 }),
        createMockInstallment({ totalOwed: 750, daysOverdue: 25, reminderCount: 3 }),
      ];

      const metrics = service.calculateMetrics(installments);

      expect(metrics.totalOverdue).toBe(3);
      expect(metrics.totalAmount).toBe(2250);
      expect(metrics.avgDaysOverdue).toBe(15);
      expect(metrics.urgentCount).toBe(1); // final
      expect(metrics.escalatedCount).toBe(1); // escalated
    });

    it('should return zeros for empty array', () => {
      const metrics = service.calculateMetrics([]);

      expect(metrics.totalOverdue).toBe(0);
      expect(metrics.totalAmount).toBe(0);
      expect(metrics.avgDaysOverdue).toBe(0);
    });
  });

  describe('groupByLead', () => {
    it('should group installments by lead ID', () => {
      const installments = [
        createMockInstallment({ leadId: 'lead-1', installmentNumber: 1 }),
        createMockInstallment({ leadId: 'lead-1', installmentNumber: 2 }),
        createMockInstallment({ leadId: 'lead-2', installmentNumber: 1 }),
      ];

      const grouped = service.groupByLead(installments);

      expect(grouped.size).toBe(2);
      expect(grouped.get('lead-1')).toHaveLength(2);
      expect(grouped.get('lead-2')).toHaveLength(1);
    });
  });

  describe('isOverdue', () => {
    it('should return true for past dates', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(service.isOverdue(yesterday)).toBe(true);
    });

    it('should return false for future dates', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(service.isOverdue(tomorrow)).toBe(false);
    });

    it('should return false for today', () => {
      const today = new Date();
      expect(service.isOverdue(today)).toBe(false);
    });
  });

  describe('calculateDaysOverdue', () => {
    it('should calculate correct days overdue', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(service.calculateDaysOverdue(fiveDaysAgo)).toBe(5);
    });

    it('should return 0 for future dates', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(service.calculateDaysOverdue(tomorrow)).toBe(0);
    });
  });
});

describe('DEFAULT_REMINDER_CONFIG', () => {
  it('should have reasonable default values', () => {
    expect(DEFAULT_REMINDER_CONFIG.firstReminderDays).toBe(1);
    expect(DEFAULT_REMINDER_CONFIG.secondReminderDays).toBe(7);
    expect(DEFAULT_REMINDER_CONFIG.finalReminderDays).toBe(14);
    expect(DEFAULT_REMINDER_CONFIG.escalationDays).toBe(21);
    expect(DEFAULT_REMINDER_CONFIG.minDaysBetweenReminders).toBe(3);
    expect(DEFAULT_REMINDER_CONFIG.maxReminders).toBe(3);
    expect(DEFAULT_REMINDER_CONFIG.lateFeePercentage).toBe(0);
  });
});
