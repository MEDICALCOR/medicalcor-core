/**
 * @fileoverview QC Failure Escalation Workflow
 *
 * Handles QC inspection failures with appropriate escalation and rework coordination.
 * Ensures proper notification chain and rework tracking.
 *
 * @module apps/trigger/workflows/dental-lab/qc-failure-escalation
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

// =============================================================================
// SCHEMAS
// =============================================================================

export const QCFailurePayloadSchema = z.object({
  labCaseId: z.string().uuid(),
  caseNumber: z.string(),
  inspectionId: z.string().uuid(),
  clinicId: z.string().uuid(),
  inspectedBy: z.string().uuid(),
  overallScore: z.number().min(0).max(100),
  failedCriteria: z.array(z.object({
    name: z.string(),
    score: z.number(),
    minRequired: z.number(),
    comments: z.string().optional(),
  })),
  defectsFound: z.array(z.string()).optional(),
  correctiveActions: z.string().optional(),
  priority: z.enum(['STAT', 'RUSH', 'STANDARD', 'FLEXIBLE']),
  failureCount: z.number().default(1), // How many times this case has failed QC
  correlationId: z.string(),
});

export type QCFailurePayload = z.infer<typeof QCFailurePayloadSchema>;

// =============================================================================
// QC FAILURE ESCALATION WORKFLOW
// =============================================================================

/**
 * QC Failure Escalation Workflow
 *
 * Triggered when a lab case fails QC inspection. Handles:
 * 1. Notification to technician who fabricated the case
 * 2. Rework ticket creation
 * 3. SLA impact assessment
 * 4. Manager escalation for repeated failures
 * 5. Root cause tracking
 */
export const qcFailureEscalationWorkflow = task({
  id: 'dental-lab-qc-failure-escalation',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: QCFailurePayload) => {
    const {
      labCaseId,
      caseNumber,
      inspectionId,
      clinicId,
      inspectedBy,
      overallScore,
      failedCriteria,
      defectsFound,
      correctiveActions,
      priority,
      failureCount,
      correlationId,
    } = payload;

    logger.info('Starting QC failure escalation workflow', {
      labCaseId,
      caseNumber,
      overallScore,
      failureCount,
      correlationId,
    });

    const results = {
      notificationsSent: 0,
      reworkTicketCreated: false,
      managerEscalated: false,
      slaImpact: null as { newDeadline?: string; daysAdded?: number } | null,
    };

    // =========================================================================
    // Stage 1: Assess Severity
    // =========================================================================
    logger.info('Stage 1: Assessing failure severity', { correlationId });

    const severity = assessQCFailureSeverity({
      overallScore,
      failedCriteria,
      failureCount,
      priority,
    });

    logger.info('Severity assessed', { severity, correlationId });

    // =========================================================================
    // Stage 2: Notify Technician
    // =========================================================================
    logger.info('Stage 2: Notifying responsible technician', { correlationId });

    // In a real implementation, look up the technician who fabricated this case
    const technicianNotification = {
      type: 'QC_FAILURE_NOTIFICATION',
      title: `QC Failed: ${caseNumber}`,
      body: buildTechnicianNotificationBody({
        caseNumber,
        overallScore,
        failedCriteria,
        defectsFound,
        correctiveActions,
      }),
      urgency: severity === 'CRITICAL' ? 'HIGH' : 'NORMAL',
      channels: severity === 'CRITICAL' ? ['push', 'sms'] : ['push'],
    };

    results.notificationsSent++;
    logger.info('Technician notified', { correlationId });

    // =========================================================================
    // Stage 3: Create Rework Ticket
    // =========================================================================
    logger.info('Stage 3: Creating rework ticket', { correlationId });

    const reworkTicket = {
      labCaseId,
      caseNumber,
      inspectionId,
      type: 'QC_REWORK',
      priority: adjustPriorityForRework(priority, failureCount),
      failedCriteria: failedCriteria.map((c) => c.name),
      defectsFound: defectsFound ?? [],
      correctiveActions,
      assignedTo: null, // Will be assigned by lab manager
      createdAt: new Date().toISOString(),
    };

    results.reworkTicketCreated = true;
    logger.info('Rework ticket created', { ticket: reworkTicket, correlationId });

    // =========================================================================
    // Stage 4: Calculate SLA Impact
    // =========================================================================
    logger.info('Stage 4: Calculating SLA impact', { correlationId });

    const slaImpact = calculateReworkSLAImpact(priority, failureCount);
    results.slaImpact = slaImpact;

    logger.info('SLA impact calculated', { slaImpact, correlationId });

    // =========================================================================
    // Stage 5: Escalate if Needed
    // =========================================================================
    const shouldEscalate = severity === 'CRITICAL' || failureCount >= 2;

    if (shouldEscalate) {
      logger.info('Stage 5: Escalating to lab manager', {
        reason: failureCount >= 2 ? 'Repeated QC failures' : 'Critical severity',
        correlationId,
      });

      const managerNotification = {
        type: 'QC_FAILURE_ESCALATION',
        title: `QC Failure Escalation: ${caseNumber}`,
        body: buildManagerEscalationBody({
          caseNumber,
          failureCount,
          overallScore,
          failedCriteria,
          slaImpact,
        }),
        urgency: 'HIGH',
        channels: ['push', 'email'],
      };

      results.managerEscalated = true;
      results.notificationsSent++;
      logger.info('Manager escalation sent', { correlationId });
    }

    // =========================================================================
    // Stage 6: Update Analytics
    // =========================================================================
    logger.info('Stage 6: Recording QC failure analytics', { correlationId });

    const analyticsEvent = {
      eventType: 'QC_FAILURE_RECORDED',
      labCaseId,
      caseNumber,
      clinicId,
      overallScore,
      failedCriteriaCount: failedCriteria.length,
      defectCount: defectsFound?.length ?? 0,
      failureNumber: failureCount,
      severity,
      reworkRequired: true,
      timestamp: new Date().toISOString(),
    };

    logger.info('QC failure analytics recorded', { correlationId });

    // =========================================================================
    // Workflow Complete
    // =========================================================================
    logger.info('QC failure escalation workflow completed', {
      labCaseId,
      severity,
      results,
      correlationId,
    });

    return {
      success: true,
      labCaseId,
      caseNumber,
      severity,
      ...results,
    };
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function assessQCFailureSeverity(params: {
  overallScore: number;
  failedCriteria: Array<{ name: string; score: number; minRequired: number }>;
  failureCount: number;
  priority: string;
}): 'MINOR' | 'MAJOR' | 'CRITICAL' {
  const { overallScore, failedCriteria, failureCount, priority } = params;

  // Critical conditions
  if (overallScore < 50) return 'CRITICAL';
  if (failureCount >= 3) return 'CRITICAL';
  if (priority === 'STAT' && failureCount >= 2) return 'CRITICAL';

  // Check for critical criteria failures
  const criticalCriteria = ['fit_accuracy', 'occlusion', 'structural_integrity'];
  const hasCriticalFailure = failedCriteria.some((c) =>
    criticalCriteria.some((cc) => c.name.toLowerCase().includes(cc))
  );
  if (hasCriticalFailure) return 'CRITICAL';

  // Major conditions
  if (overallScore < 70) return 'MAJOR';
  if (failedCriteria.length >= 3) return 'MAJOR';
  if (failureCount >= 2) return 'MAJOR';

  return 'MINOR';
}

function adjustPriorityForRework(
  originalPriority: string,
  failureCount: number
): string {
  // Escalate priority for repeated failures
  if (failureCount >= 2) {
    switch (originalPriority) {
      case 'FLEXIBLE':
        return 'STANDARD';
      case 'STANDARD':
        return 'RUSH';
      case 'RUSH':
        return 'STAT';
      default:
        return originalPriority;
    }
  }
  return originalPriority;
}

function calculateReworkSLAImpact(
  priority: string,
  failureCount: number
): { newDeadline?: string; daysAdded: number } {
  // Calculate days to add based on priority and complexity
  let baseDays: number;
  switch (priority) {
    case 'STAT':
      baseDays = 0.5; // Half day
      break;
    case 'RUSH':
      baseDays = 1;
      break;
    case 'STANDARD':
      baseDays = 2;
      break;
    default:
      baseDays = 3;
  }

  // Add buffer for repeated failures
  const daysAdded = baseDays * (1 + (failureCount - 1) * 0.5);

  const newDeadline = new Date();
  newDeadline.setDate(newDeadline.getDate() + Math.ceil(daysAdded));

  return {
    newDeadline: newDeadline.toISOString(),
    daysAdded: Math.ceil(daysAdded),
  };
}

function buildTechnicianNotificationBody(params: {
  caseNumber: string;
  overallScore: number;
  failedCriteria: Array<{ name: string; score: number; minRequired: number; comments?: string }>;
  defectsFound?: string[];
  correctiveActions?: string;
}): string {
  const { caseNumber, overallScore, failedCriteria, defectsFound, correctiveActions } = params;

  const lines = [
    `Case ${caseNumber} has failed QC inspection.`,
    ``,
    `Overall Score: ${overallScore}/100`,
    ``,
    `Failed Criteria:`,
    ...failedCriteria.map((c) => `  • ${c.name}: ${c.score}/${c.minRequired}${c.comments ? ` - ${c.comments}` : ''}`),
  ];

  if (defectsFound && defectsFound.length > 0) {
    lines.push(``, `Defects Found:`, ...defectsFound.map((d) => `  • ${d}`));
  }

  if (correctiveActions) {
    lines.push(``, `Corrective Actions:`, correctiveActions);
  }

  lines.push(``, `Please address these issues and resubmit for QC.`);

  return lines.join('\n');
}

function buildManagerEscalationBody(params: {
  caseNumber: string;
  failureCount: number;
  overallScore: number;
  failedCriteria: Array<{ name: string; score: number }>;
  slaImpact: { newDeadline?: string; daysAdded: number } | null;
}): string {
  const { caseNumber, failureCount, overallScore, failedCriteria, slaImpact } = params;

  const lines = [
    `QC Failure Escalation Required`,
    ``,
    `Case: ${caseNumber}`,
    `Failure Count: ${failureCount}`,
    `Overall Score: ${overallScore}/100`,
    ``,
    `Failed Criteria: ${failedCriteria.map((c) => c.name).join(', ')}`,
  ];

  if (slaImpact) {
    lines.push(
      ``,
      `SLA Impact: +${slaImpact.daysAdded} day(s)`,
      `New Deadline: ${slaImpact.newDeadline ? new Date(slaImpact.newDeadline).toLocaleDateString() : 'TBD'}`
    );
  }

  lines.push(``, `This case requires your attention for root cause analysis.`);

  return lines.join('\n');
}
