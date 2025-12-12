/**
 * @fileoverview Design Review Notification Workflow
 *
 * Handles notifications when CAD designs are submitted for clinician review.
 * Includes SLA tracking for design approval turnaround.
 *
 * @module apps/trigger/workflows/dental-lab/design-review-notification
 */

import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

// =============================================================================
// SCHEMAS
// =============================================================================

export const DesignReviewNotificationPayloadSchema = z.object({
  labCaseId: z.string().uuid(),
  caseNumber: z.string(),
  designId: z.string().uuid(),
  clinicId: z.string().uuid(),
  clinicianId: z.string().uuid(),
  patientName: z.string().optional(),
  designerName: z.string().optional(),
  prostheticType: z.string(),
  toothNumbers: z.array(z.string()),
  reviewDeadlineHours: z.number().default(24),
  correlationId: z.string(),
});

export type DesignReviewNotificationPayload = z.infer<typeof DesignReviewNotificationPayloadSchema>;

// =============================================================================
// DESIGN REVIEW NOTIFICATION WORKFLOW
// =============================================================================

/**
 * Design Review Notification Workflow
 *
 * Triggered when a design is submitted for review. Handles:
 * 1. Initial notification to clinician
 * 2. Reminder if not reviewed within deadline
 * 3. Escalation if significantly overdue
 */
export const designReviewNotificationWorkflow = task({
  id: 'dental-lab-design-review-notification',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: DesignReviewNotificationPayload) => {
    const {
      labCaseId,
      caseNumber,
      designId,
      clinicId,
      clinicianId,
      patientName,
      designerName,
      prostheticType,
      toothNumbers,
      reviewDeadlineHours,
      correlationId,
    } = payload;

    logger.info('Starting design review notification workflow', {
      labCaseId,
      designId,
      clinicianId,
      correlationId,
    });

    // =========================================================================
    // Stage 1: Send Initial Notification
    // =========================================================================
    logger.info('Stage 1: Sending initial design review notification', { correlationId });

    const notification = {
      type: 'DESIGN_REVIEW_REQUIRED',
      recipient: clinicianId,
      title: `Design Ready for Review: ${caseNumber}`,
      body: buildNotificationBody({
        caseNumber,
        patientName,
        designerName,
        prostheticType,
        toothNumbers,
        reviewDeadlineHours,
      }),
      data: {
        labCaseId,
        designId,
        caseNumber,
        action: 'REVIEW_DESIGN',
      },
      channels: ['push', 'email'],
    };

    // In a real implementation, send via notification service
    logger.info('Initial notification sent', {
      recipient: clinicianId,
      channels: notification.channels,
      correlationId,
    });

    // =========================================================================
    // Stage 2: Wait and Check for Review
    // =========================================================================
    const firstReminderHours = Math.floor(reviewDeadlineHours * 0.5);
    logger.info('Stage 2: Waiting for first reminder check', {
      waitHours: firstReminderHours,
      correlationId,
    });

    await wait.for({ hours: firstReminderHours });

    // Check if design was reviewed
    const firstCheckResult = await checkDesignReviewStatus(designId);

    if (firstCheckResult.reviewed) {
      logger.info('Design already reviewed, workflow complete', {
        reviewedBy: firstCheckResult.reviewedBy,
        reviewedAt: firstCheckResult.reviewedAt,
        correlationId,
      });

      return {
        success: true,
        designReviewed: true,
        reviewedAt: firstCheckResult.reviewedAt,
        remindersSent: 0,
      };
    }

    // =========================================================================
    // Stage 3: Send First Reminder
    // =========================================================================
    logger.info('Stage 3: Sending first reminder', { correlationId });

    const reminder1 = {
      type: 'DESIGN_REVIEW_REMINDER',
      recipient: clinicianId,
      title: `Reminder: Design Awaiting Review - ${caseNumber}`,
      body: `A design for case ${caseNumber} has been waiting for review for ${firstReminderHours} hours. Please review at your earliest convenience.`,
      urgency: 'NORMAL',
      data: {
        labCaseId,
        designId,
        caseNumber,
        reminderNumber: 1,
      },
      channels: ['push'],
    };

    logger.info('First reminder sent', { correlationId });

    // =========================================================================
    // Stage 4: Wait and Check Again
    // =========================================================================
    const remainingHours = reviewDeadlineHours - firstReminderHours;
    await wait.for({ hours: remainingHours });

    const secondCheckResult = await checkDesignReviewStatus(designId);

    if (secondCheckResult.reviewed) {
      logger.info('Design reviewed after first reminder', {
        reviewedBy: secondCheckResult.reviewedBy,
        correlationId,
      });

      return {
        success: true,
        designReviewed: true,
        reviewedAt: secondCheckResult.reviewedAt,
        remindersSent: 1,
      };
    }

    // =========================================================================
    // Stage 5: Send Urgent Reminder
    // =========================================================================
    logger.info('Stage 5: Design review overdue, sending urgent reminder', { correlationId });

    const urgentReminder = {
      type: 'DESIGN_REVIEW_URGENT',
      recipient: clinicianId,
      title: `URGENT: Design Review Overdue - ${caseNumber}`,
      body: `A design for case ${caseNumber} is ${reviewDeadlineHours} hours overdue for review. This may impact the lab's delivery schedule.`,
      urgency: 'HIGH',
      data: {
        labCaseId,
        designId,
        caseNumber,
        reminderNumber: 2,
        hoursOverdue: reviewDeadlineHours,
      },
      channels: ['push', 'email', 'sms'],
    };

    logger.info('Urgent reminder sent', { correlationId });

    // Also notify lab manager
    logger.info('Notifying lab manager of overdue review', { correlationId });

    return {
      success: true,
      designReviewed: false,
      overdue: true,
      remindersSent: 2,
      hoursOverdue: reviewDeadlineHours,
    };
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildNotificationBody(params: {
  caseNumber: string;
  patientName?: string;
  designerName?: string;
  prostheticType: string;
  toothNumbers: string[];
  reviewDeadlineHours: number;
}): string {
  const { caseNumber, patientName, designerName, prostheticType, toothNumbers, reviewDeadlineHours } = params;

  const lines = [
    `A new CAD design is ready for your review.`,
    ``,
    `Case: ${caseNumber}`,
  ];

  if (patientName) {
    lines.push(`Patient: ${patientName}`);
  }

  lines.push(
    `Prosthetic: ${prostheticType}`,
    `Teeth: ${toothNumbers.join(', ')}`,
  );

  if (designerName) {
    lines.push(`Designer: ${designerName}`);
  }

  lines.push(
    ``,
    `Please review within ${reviewDeadlineHours} hours to avoid delays.`,
    ``,
    `Tap to open the design viewer.`
  );

  return lines.join('\n');
}

async function checkDesignReviewStatus(designId: string): Promise<{
  reviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  status?: string;
}> {
  // In a real implementation, this would query the database
  // For now, return not reviewed
  return {
    reviewed: false,
    status: 'PENDING',
  };
}
