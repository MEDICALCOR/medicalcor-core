/**
 * @fileoverview Overdue Detection Service
 *
 * M5 Feature: Automated collections for overdue payment reminders.
 * Detects overdue installments and prepares reminder payloads.
 *
 * @module domain/ltv/overdue-detection-service
 */

import type {
  OverdueInstallment,
  ReminderConfig,
  ReminderLevel,
  PaymentReminderPayload,
  OverdueDetectionResult,
} from '@medicalcor/types';
import {
  determineReminderLevel,
  getReminderTemplateName,
  shouldSendReminder,
  calculateLateFee,
} from '@medicalcor/types';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Default reminder configuration for collections
 */
export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  firstReminderDays: 1,
  secondReminderDays: 7,
  finalReminderDays: 14,
  escalationDays: 21,
  minDaysBetweenReminders: 3,
  maxReminders: 3,
  lateFeeAfterDays: 7,
  lateFeePercentage: 0, // No late fees by default (clinic can configure)
};

// ============================================================================
// SERVICE DEPENDENCIES
// ============================================================================

/**
 * Repository interface for fetching overdue installments
 */
export interface OverdueInstallmentRepository {
  /**
   * Find all overdue installments eligible for reminders
   * @param clinicId - Optional clinic filter (null for all clinics)
   * @param limit - Maximum number of installments to return
   */
  findOverdueInstallments(
    clinicId: string | null,
    limit?: number
  ): Promise<OverdueInstallment[]>;

  /**
   * Update installment reminder tracking after sending
   */
  updateReminderTracking(
    installmentId: string,
    reminderCount: number,
    reminderLevel: ReminderLevel,
    sentAt: Date
  ): Promise<void>;

  /**
   * Mark installment as overdue if currently pending
   */
  markAsOverdue(installmentId: string): Promise<void>;

  /**
   * Apply late fee to an installment
   */
  applyLateFee(installmentId: string, lateFee: number): Promise<void>;
}

/**
 * Service configuration
 */
export interface OverdueDetectionServiceConfig {
  /** Reminder timing configuration */
  reminderConfig?: ReminderConfig;
  /** Maximum installments to process per scan */
  batchSize?: number;
}

/**
 * Service dependencies (injected)
 */
export interface OverdueDetectionServiceDeps {
  /** Repository for installment data */
  repository: OverdueInstallmentRepository;
}

// ============================================================================
// OVERDUE DETECTION SERVICE
// ============================================================================

/**
 * Overdue Detection Service
 *
 * Scans for overdue installments and prepares reminder payloads
 * for the payment reminder workflow.
 */
export class OverdueDetectionService {
  private config: Required<OverdueDetectionServiceConfig>;
  private deps: OverdueDetectionServiceDeps | undefined;

  constructor(
    config?: OverdueDetectionServiceConfig,
    deps?: OverdueDetectionServiceDeps
  ) {
    this.config = {
      reminderConfig: config?.reminderConfig ?? DEFAULT_REMINDER_CONFIG,
      batchSize: config?.batchSize ?? 100,
    };
    this.deps = deps;
  }

  /**
   * Scan for overdue installments and prepare reminder payloads
   *
   * @param clinicId - Filter by clinic (null for all)
   * @param correlationId - Correlation ID for tracing
   * @returns Detection result with reminder payloads
   */
  async detectOverdueInstallments(
    clinicId: string | null,
    correlationId: string
  ): Promise<{
    result: OverdueDetectionResult;
    reminders: PaymentReminderPayload[];
  }> {
    if (!this.deps) {
      throw new Error('OverdueDetectionService dependencies not configured');
    }

    const scannedAt = new Date();
    const reminders: PaymentReminderPayload[] = [];
    const byLevel: Record<ReminderLevel, number> = {
      first: 0,
      second: 0,
      final: 0,
      escalated: 0,
    };
    let totalAmountOverdue = 0;
    let errors = 0;

    // Fetch overdue installments
    const overdueInstallments = await this.deps.repository.findOverdueInstallments(
      clinicId,
      this.config.batchSize
    );

    for (const installment of overdueInstallments) {
      try {
        // Determine if we should send a reminder
        const shouldRemind = shouldSendReminder(
          installment.lastReminderSentAt,
          this.config.reminderConfig.minDaysBetweenReminders
        );

        if (!shouldRemind) {
          continue; // Skip, too soon for another reminder
        }

        // Determine reminder level based on days overdue
        const reminderLevel = determineReminderLevel(
          installment.daysOverdue,
          installment.reminderCount,
          this.config.reminderConfig
        );

        // Get appropriate template
        const templateName = getReminderTemplateName(reminderLevel);

        // Calculate late fee if applicable
        const lateFee = calculateLateFee(
          installment.amountDue,
          installment.daysOverdue,
          this.config.reminderConfig
        );

        // Update installment with late fee if not already applied
        if (lateFee > 0 && installment.lateFeeApplied === 0) {
          await this.deps.repository.applyLateFee(installment.installmentId, lateFee);
        }

        // Create reminder payload
        const reminder: PaymentReminderPayload = {
          installment: {
            ...installment,
            lateFeeApplied: lateFee > 0 ? lateFee : installment.lateFeeApplied,
            totalOwed: installment.amountDue + (lateFee > 0 ? lateFee : installment.lateFeeApplied),
          },
          reminderLevel,
          templateName,
          correlationId: `${correlationId}_${installment.installmentId}`,
          createFollowUpTask: reminderLevel === 'escalated' || reminderLevel === 'final',
        };

        reminders.push(reminder);
        byLevel[reminderLevel]++;
        totalAmountOverdue += installment.totalOwed;
      } catch {
        errors++;
      }
    }

    const result: OverdueDetectionResult = {
      scannedAt,
      clinicId,
      totalOverdue: overdueInstallments.length,
      byLevel,
      totalAmountOverdue,
      remindersTriggered: reminders.length,
      errors,
      correlationId,
    };

    return { result, reminders };
  }

  /**
   * Filter installments that need immediate attention
   *
   * @param installments - List of overdue installments
   * @returns Installments requiring urgent follow-up
   */
  filterUrgentInstallments(installments: OverdueInstallment[]): OverdueInstallment[] {
    return installments.filter((inst) => {
      const level = determineReminderLevel(
        inst.daysOverdue,
        inst.reminderCount,
        this.config.reminderConfig
      );
      return level === 'final' || level === 'escalated';
    });
  }

  /**
   * Calculate collection metrics for a set of overdue installments
   */
  calculateMetrics(installments: OverdueInstallment[]): {
    totalOverdue: number;
    totalAmount: number;
    avgDaysOverdue: number;
    urgentCount: number;
    escalatedCount: number;
  } {
    if (installments.length === 0) {
      return {
        totalOverdue: 0,
        totalAmount: 0,
        avgDaysOverdue: 0,
        urgentCount: 0,
        escalatedCount: 0,
      };
    }

    let totalAmount = 0;
    let totalDaysOverdue = 0;
    let urgentCount = 0;
    let escalatedCount = 0;

    for (const inst of installments) {
      totalAmount += inst.totalOwed;
      totalDaysOverdue += inst.daysOverdue;

      const level = determineReminderLevel(
        inst.daysOverdue,
        inst.reminderCount,
        this.config.reminderConfig
      );
      if (level === 'final') urgentCount++;
      if (level === 'escalated') escalatedCount++;
    }

    return {
      totalOverdue: installments.length,
      totalAmount,
      avgDaysOverdue: Math.round(totalDaysOverdue / installments.length),
      urgentCount,
      escalatedCount,
    };
  }

  /**
   * Group installments by lead for consolidated reminders
   */
  groupByLead(
    installments: OverdueInstallment[]
  ): Map<string, OverdueInstallment[]> {
    const grouped = new Map<string, OverdueInstallment[]>();

    for (const inst of installments) {
      const existing = grouped.get(inst.leadId) ?? [];
      existing.push(inst);
      grouped.set(inst.leadId, existing);
    }

    return grouped;
  }

  /**
   * Get the reminder configuration
   */
  getReminderConfig(): ReminderConfig {
    return this.config.reminderConfig;
  }

  /**
   * Check if installment should be marked as overdue
   */
  isOverdue(dueDate: Date): boolean {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return due < now;
  }

  /**
   * Calculate days overdue from due date
   */
  calculateDaysOverdue(dueDate: Date): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffMs = now.getTime() - due.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an OverdueDetectionService instance
 */
export function createOverdueDetectionService(
  config?: OverdueDetectionServiceConfig,
  deps?: OverdueDetectionServiceDeps
): OverdueDetectionService {
  return new OverdueDetectionService(config, deps);
}
