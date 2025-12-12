/**
 * @fileoverview Lab Case Status Change Handler Workflow
 *
 * Central workflow for handling all lab case status transitions.
 * Triggers appropriate downstream workflows based on the new status.
 *
 * @module apps/trigger/workflows/dental-lab/status-change-handler
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

// =============================================================================
// SCHEMAS
// =============================================================================

export const StatusChangePayloadSchema = z.object({
  labCaseId: z.string().uuid(),
  caseNumber: z.string(),
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  previousStatus: z.string().nullable(),
  newStatus: z.string(),
  changedBy: z.string().uuid(),
  changedAt: z.string().datetime(),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  correlationId: z.string(),
});

export type StatusChangePayload = z.infer<typeof StatusChangePayloadSchema>;

// =============================================================================
// STATUS CHANGE HANDLER WORKFLOW
// =============================================================================

/**
 * Lab Case Status Change Handler Workflow
 *
 * Central orchestrator for status-based automation:
 * - Triggers notifications based on status
 * - Updates SLA tracking
 * - Initiates downstream workflows
 * - Records audit events
 */
export const labCaseStatusChangeWorkflow = task({
  id: 'dental-lab-status-change-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: StatusChangePayload) => {
    const {
      labCaseId,
      caseNumber,
      clinicId,
      patientId,
      previousStatus,
      newStatus,
      changedBy,
      changedAt,
      reason,
      metadata,
      correlationId,
    } = payload;

    logger.info('Processing lab case status change', {
      labCaseId,
      caseNumber,
      previousStatus,
      newStatus,
      correlationId,
    });

    const actions: string[] = [];
    const triggeredWorkflows: string[] = [];

    // =========================================================================
    // Route Based on New Status
    // =========================================================================

    switch (newStatus) {
      // -----------------------------------------------------------------------
      // Intake Statuses
      // -----------------------------------------------------------------------
      case 'RECEIVED':
        actions.push('Case received - initializing SLA tracking');
        await initializeSLATracking(labCaseId, clinicId, correlationId);
        break;

      case 'PENDING_SCAN':
        actions.push('Awaiting digital scan - notifying clinic');
        await notifyAwaitingScan(labCaseId, clinicId, correlationId);
        break;

      case 'SCAN_RECEIVED':
        actions.push('Scan received - ready for design');
        await notifyDesignTeam(labCaseId, clinicId, correlationId);
        break;

      // -----------------------------------------------------------------------
      // Design Statuses
      // -----------------------------------------------------------------------
      case 'IN_DESIGN':
        actions.push('Design started - updating SLA milestone');
        await updateSLAMilestone(labCaseId, 'DESIGN_STARTED', correlationId);
        break;

      case 'DESIGN_REVIEW':
        actions.push('Design ready for review - triggering notification workflow');
        triggeredWorkflows.push('design-review-notification');
        // Would trigger designReviewNotificationWorkflow
        break;

      case 'DESIGN_APPROVED':
        actions.push('Design approved - queuing for fabrication');
        await updateSLAMilestone(labCaseId, 'DESIGN_APPROVED', correlationId);
        break;

      case 'DESIGN_REVISION':
        actions.push('Revision requested - notifying designer');
        await notifyDesignRevision(labCaseId, reason, correlationId);
        break;

      // -----------------------------------------------------------------------
      // Fabrication Statuses
      // -----------------------------------------------------------------------
      case 'QUEUED_FOR_MILLING':
        actions.push('Queued for fabrication - updating production schedule');
        await updateProductionSchedule(labCaseId, correlationId);
        break;

      case 'MILLING':
        actions.push('Fabrication started - updating SLA milestone');
        await updateSLAMilestone(labCaseId, 'FABRICATION_STARTED', correlationId);
        break;

      case 'POST_PROCESSING':
        actions.push('Post-processing started');
        break;

      case 'FINISHING':
        actions.push('Finishing started - preparing for QC');
        break;

      // -----------------------------------------------------------------------
      // QC Statuses
      // -----------------------------------------------------------------------
      case 'QC_INSPECTION':
        actions.push('QC inspection started');
        await updateSLAMilestone(labCaseId, 'QC_STARTED', correlationId);
        break;

      case 'QC_PASSED':
        actions.push('QC passed - preparing for delivery');
        await updateSLAMilestone(labCaseId, 'QC_PASSED', correlationId);
        await notifyQCPassed(labCaseId, clinicId, correlationId);
        break;

      case 'QC_FAILED':
        actions.push('QC failed - triggering escalation workflow');
        triggeredWorkflows.push('qc-failure-escalation');
        // Would trigger qcFailureEscalationWorkflow
        break;

      // -----------------------------------------------------------------------
      // Delivery Statuses
      // -----------------------------------------------------------------------
      case 'READY_FOR_PICKUP':
        actions.push('Ready for pickup - triggering delivery notification');
        triggeredWorkflows.push('delivery-ready-notification');
        // Would trigger labCaseDeliveryReadyWorkflow
        break;

      case 'IN_TRANSIT':
        actions.push('In transit - updating tracking');
        await updateDeliveryTracking(labCaseId, 'IN_TRANSIT', correlationId);
        break;

      case 'DELIVERED':
        actions.push('Delivered - notifying clinic');
        await notifyDelivery(labCaseId, clinicId, correlationId);
        break;

      // -----------------------------------------------------------------------
      // Try-In Statuses
      // -----------------------------------------------------------------------
      case 'TRY_IN_SCHEDULED':
        actions.push('Try-in scheduled - setting up reminders');
        await scheduleTryInReminders(labCaseId, correlationId);
        break;

      case 'ADJUSTMENT_REQUIRED':
        actions.push('Adjustment required - creating rework ticket');
        await createAdjustmentTicket(labCaseId, reason, correlationId);
        break;

      case 'ADJUSTMENT_IN_PROGRESS':
        actions.push('Adjustment in progress');
        break;

      // -----------------------------------------------------------------------
      // Terminal Statuses
      // -----------------------------------------------------------------------
      case 'COMPLETED':
        actions.push('Case completed - finalizing records');
        await finalizeCase(labCaseId, clinicId, correlationId);
        await updateSLAMilestone(labCaseId, 'COMPLETED', correlationId);
        break;

      case 'CANCELLED':
        actions.push('Case cancelled - archiving');
        await archiveCase(labCaseId, reason, correlationId);
        break;

      case 'ON_HOLD':
        actions.push('Case on hold - pausing SLA tracking');
        await pauseSLATracking(labCaseId, reason, correlationId);
        break;

      default:
        logger.warn('Unhandled status transition', { newStatus, correlationId });
    }

    // =========================================================================
    // Record Audit Event
    // =========================================================================
    const auditEvent = {
      eventType: 'LAB_CASE_STATUS_CHANGED',
      labCaseId,
      caseNumber,
      clinicId,
      patientId,
      previousStatus,
      newStatus,
      changedBy,
      changedAt,
      reason,
      actionsTriggered: actions,
      workflowsTriggered: triggeredWorkflows,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    logger.info('Status change audit recorded', { auditEvent, correlationId });

    // =========================================================================
    // Workflow Complete
    // =========================================================================
    logger.info('Status change handling completed', {
      labCaseId,
      newStatus,
      actionsCount: actions.length,
      workflowsTriggered: triggeredWorkflows.length,
      correlationId,
    });

    return {
      success: true,
      labCaseId,
      previousStatus,
      newStatus,
      actions,
      triggeredWorkflows,
    };
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function initializeSLATracking(
  labCaseId: string,
  clinicId: string,
  correlationId: string
): Promise<void> {
  logger.info('Initializing SLA tracking', { labCaseId, correlationId });
  // In real implementation: Initialize SLA milestones and deadlines
}

async function updateSLAMilestone(
  labCaseId: string,
  milestone: string,
  correlationId: string
): Promise<void> {
  logger.info('Updating SLA milestone', { labCaseId, milestone, correlationId });
  // In real implementation: Update milestone completion in database
}

async function notifyAwaitingScan(
  labCaseId: string,
  clinicId: string,
  correlationId: string
): Promise<void> {
  logger.info('Notifying clinic about pending scan', { labCaseId, clinicId, correlationId });
  // In real implementation: Send notification via notification service
}

async function notifyDesignTeam(
  labCaseId: string,
  clinicId: string,
  correlationId: string
): Promise<void> {
  logger.info('Notifying design team', { labCaseId, correlationId });
  // In real implementation: Add to design queue and notify available designers
}

async function notifyDesignRevision(
  labCaseId: string,
  reason: string | undefined,
  correlationId: string
): Promise<void> {
  logger.info('Notifying designer of revision request', { labCaseId, reason, correlationId });
  // In real implementation: Send notification with revision details
}

async function updateProductionSchedule(
  labCaseId: string,
  correlationId: string
): Promise<void> {
  logger.info('Updating production schedule', { labCaseId, correlationId });
  // In real implementation: Add to milling queue based on priority
}

async function notifyQCPassed(
  labCaseId: string,
  clinicId: string,
  correlationId: string
): Promise<void> {
  logger.info('Notifying QC passed', { labCaseId, clinicId, correlationId });
  // In real implementation: Update internal tracking
}

async function updateDeliveryTracking(
  labCaseId: string,
  status: string,
  correlationId: string
): Promise<void> {
  logger.info('Updating delivery tracking', { labCaseId, status, correlationId });
  // In real implementation: Update tracking status
}

async function notifyDelivery(
  labCaseId: string,
  clinicId: string,
  correlationId: string
): Promise<void> {
  logger.info('Notifying clinic of delivery', { labCaseId, clinicId, correlationId });
  // In real implementation: Send delivery confirmation
}

async function scheduleTryInReminders(
  labCaseId: string,
  correlationId: string
): Promise<void> {
  logger.info('Scheduling try-in reminders', { labCaseId, correlationId });
  // In real implementation: Set up reminder notifications
}

async function createAdjustmentTicket(
  labCaseId: string,
  reason: string | undefined,
  correlationId: string
): Promise<void> {
  logger.info('Creating adjustment ticket', { labCaseId, reason, correlationId });
  // In real implementation: Create rework/adjustment ticket
}

async function finalizeCase(
  labCaseId: string,
  clinicId: string,
  correlationId: string
): Promise<void> {
  logger.info('Finalizing case', { labCaseId, clinicId, correlationId });
  // In real implementation: Calculate final metrics, close SLA tracking
}

async function archiveCase(
  labCaseId: string,
  reason: string | undefined,
  correlationId: string
): Promise<void> {
  logger.info('Archiving cancelled case', { labCaseId, reason, correlationId });
  // In real implementation: Mark as archived, release resources
}

async function pauseSLATracking(
  labCaseId: string,
  reason: string | undefined,
  correlationId: string
): Promise<void> {
  logger.info('Pausing SLA tracking', { labCaseId, reason, correlationId });
  // In real implementation: Pause SLA timers
}
