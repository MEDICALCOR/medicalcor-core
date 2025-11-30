/**
 * @fileoverview OSAX Journey Workflow
 *
 * Automated workflow for OSAX (Obstructive Sleep Apnea) case management.
 * Orchestrates the patient journey from initial case creation to treatment.
 *
 * @module trigger/workflows/osax-journey
 */

import { task, logger, wait } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

// ============================================================================
// SCHEMAS
// ============================================================================

export const OsaxJourneyPayloadSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  patientId: z.string(),
  severity: z.enum(['NONE', 'MILD', 'MODERATE', 'SEVERE']),
  ahi: z.number(),
  treatmentRecommendation: z.string(),
  cardiovascularRisk: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']),
  assignedSpecialistId: z.string().optional(),
  correlationId: z.string(),
});

export type OsaxJourneyPayload = z.infer<typeof OsaxJourneyPayloadSchema>;

// ============================================================================
// MAIN WORKFLOW
// ============================================================================

/**
 * OSAX Journey Workflow
 *
 * Orchestrates the complete OSAX case lifecycle:
 * 1. Case scoring notification
 * 2. Specialist assignment
 * 3. Review reminders
 * 4. Treatment planning
 * 5. Follow-up scheduling
 */
export const osaxJourneyWorkflow = task({
  id: 'osax-journey-workflow',
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: OsaxJourneyPayload) => {
    const {
      caseId,
      caseNumber,
      severity,
      ahi,
      treatmentRecommendation,
      cardiovascularRisk,
      correlationId,
    } = payload;
    // Note: patientId and assignedSpecialistId are available in payload but not used in current workflow

    logger.info('Starting OSAX journey workflow', {
      caseId,
      caseNumber,
      severity,
      cardiovascularRisk,
      correlationId,
    });

    // ============================================
    // STAGE 1: Immediate Notifications
    // ============================================
    logger.info('Stage 1: Processing immediate notifications', { correlationId });

    // Handle based on severity
    if (severity === 'SEVERE' || cardiovascularRisk === 'CRITICAL') {
      // Urgent case - immediate escalation
      await osaxUrgentReviewWorkflow.trigger({
        caseId,
        caseNumber,
        severity,
        cardiovascularRisk,
        ahi,
        correlationId: `${correlationId}_urgent`,
      });

      logger.info('Triggered urgent review workflow', { correlationId });
    } else {
      // Standard case - schedule review
      await osaxStandardReviewWorkflow.trigger({
        caseId,
        caseNumber,
        severity,
        treatmentRecommendation,
        correlationId: `${correlationId}_standard`,
      });

      logger.info('Triggered standard review workflow', { correlationId });
    }

    // ============================================
    // STAGE 2: Wait for Review Completion
    // ============================================
    logger.info('Stage 2: Waiting for review phase', { correlationId });

    // Wait based on severity
    const reviewWaitHours = severity === 'SEVERE' ? 4 : severity === 'MODERATE' ? 24 : 48;
    await wait.for({ hours: reviewWaitHours });

    // TODO: Check if case has been reviewed
    // In production, this would query the case repository or listen for events

    // ============================================
    // STAGE 3: Treatment Planning
    // ============================================
    if (severity !== 'NONE') {
      logger.info('Stage 3: Initiating treatment planning', { correlationId });

      await osaxTreatmentPlanningWorkflow.trigger({
        caseId,
        caseNumber,
        severity,
        treatmentRecommendation,
        correlationId: `${correlationId}_treatment`,
      });
    }

    // ============================================
    // STAGE 4: Schedule Initial Follow-up
    // ============================================
    logger.info('Stage 4: Scheduling follow-up', { correlationId });

    // Schedule follow-up based on severity
    const followUpDelayDays = severity === 'SEVERE' ? 7 : severity === 'MODERATE' ? 14 : 30;

    await osaxFollowUpWorkflow.trigger({
      caseId,
      caseNumber,
      followUpType: 'INITIAL',
      scheduledForDays: followUpDelayDays,
      correlationId: `${correlationId}_followup`,
    });

    logger.info('OSAX journey workflow completed initial stages', {
      caseId,
      caseNumber,
      severity,
      correlationId,
    });

    return {
      success: true,
      caseId,
      caseNumber,
      severity,
      stagesCompleted: [
        'notifications',
        'review_initiated',
        'treatment_planning',
        'followup_scheduled',
      ],
    };
  },
});

// ============================================================================
// URGENT REVIEW WORKFLOW
// ============================================================================

export const OsaxUrgentReviewPayloadSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  severity: z.string(),
  cardiovascularRisk: z.string(),
  ahi: z.number(),
  correlationId: z.string(),
});

export const osaxUrgentReviewWorkflow = task({
  id: 'osax-urgent-review-workflow',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof OsaxUrgentReviewPayloadSchema>) => {
    const { caseId, caseNumber, severity, cardiovascularRisk, ahi: _ahi, correlationId } = payload;

    logger.info('Starting urgent review workflow', {
      caseId,
      caseNumber,
      severity,
      cardiovascularRisk,
      correlationId,
    });

    // 1. Send immediate notification to on-call specialist
    logger.info('Sending urgent notification to on-call specialist', { correlationId });
    // In production: Send push notification, SMS, or page

    // 2. Create high-priority task in CRM
    logger.info('Creating high-priority CRM task', { correlationId });
    // In production: Create HubSpot/CRM task

    // 3. Set SLA timer (4 hours for urgent cases)
    const slaDeadline = new Date(Date.now() + 4 * 60 * 60 * 1000);
    logger.info('SLA deadline set', { slaDeadline: slaDeadline.toISOString(), correlationId });

    // 4. Wait for 2 hours, then check if reviewed
    await wait.for({ hours: 2 });

    // Check if still pending (mock - in production would query database)
    const stillPending = true as boolean; // Placeholder - will be replaced with actual check

    if (stillPending) {
      // Escalate to department head
      logger.warn('Case still pending after 2 hours - escalating', { correlationId });
      // In production: Send escalation notification
    }

    return {
      success: true,
      caseId,
      caseNumber,
      slaDeadline: slaDeadline.toISOString(),
      escalated: stillPending,
    };
  },
});

// ============================================================================
// STANDARD REVIEW WORKFLOW
// ============================================================================

export const OsaxStandardReviewPayloadSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  severity: z.string(),
  treatmentRecommendation: z.string(),
  correlationId: z.string(),
});

export const osaxStandardReviewWorkflow = task({
  id: 'osax-standard-review-workflow',
  run: async (payload: z.infer<typeof OsaxStandardReviewPayloadSchema>) => {
    const { caseId, caseNumber, severity, correlationId } = payload;
    // Note: treatmentRecommendation is available in payload but not used in current workflow

    logger.info('Starting standard review workflow', {
      caseId,
      caseNumber,
      severity,
      correlationId,
    });

    // 1. Add to review queue
    logger.info('Adding case to review queue', { correlationId });
    // In production: Add to specialist's review queue

    // 2. Send notification to assigned specialist
    logger.info('Notifying assigned specialist', { correlationId });
    // In production: Send email/notification

    // 3. Set SLA based on severity
    const slaHours = severity === 'MODERATE' ? 24 : 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    // 4. Schedule reminder at 75% of SLA
    const reminderHours = Math.floor(slaHours * 0.75);
    await wait.for({ hours: reminderHours });

    // Send reminder if not reviewed
    logger.info('Sending review reminder', { correlationId });
    // In production: Send reminder notification

    return {
      success: true,
      caseId,
      caseNumber,
      slaDeadline: slaDeadline.toISOString(),
      reminderSent: true,
    };
  },
});

// ============================================================================
// TREATMENT PLANNING WORKFLOW
// ============================================================================

export const OsaxTreatmentPlanningPayloadSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  severity: z.string(),
  treatmentRecommendation: z.string(),
  correlationId: z.string(),
});

export const osaxTreatmentPlanningWorkflow = task({
  id: 'osax-treatment-planning-workflow',
  run: async (payload: z.infer<typeof OsaxTreatmentPlanningPayloadSchema>) => {
    const {
      caseId,
      caseNumber,
      severity: _severity,
      treatmentRecommendation,
      correlationId,
    } = payload;

    // Small delay to ensure async execution
    await Promise.resolve();

    logger.info('Starting treatment planning workflow', {
      caseId,
      caseNumber,
      treatmentRecommendation,
      correlationId,
    });

    // 1. Determine treatment path
    let treatmentPath: string;
    if (treatmentRecommendation.includes('CPAP') || treatmentRecommendation.includes('BIPAP')) {
      treatmentPath = 'PAP_THERAPY';
    } else if (treatmentRecommendation.includes('ORAL')) {
      treatmentPath = 'ORAL_APPLIANCE';
    } else if (treatmentRecommendation.includes('SURGERY')) {
      treatmentPath = 'SURGICAL_EVALUATION';
    } else {
      treatmentPath = 'LIFESTYLE_MODIFICATION';
    }

    logger.info('Treatment path determined', { treatmentPath, correlationId });

    // 2. Create treatment onboarding tasks
    const tasks = [];

    if (treatmentPath === 'PAP_THERAPY') {
      tasks.push('Schedule CPAP education session');
      tasks.push('Order CPAP equipment');
      tasks.push('Schedule mask fitting');
      tasks.push('Set up remote monitoring');
    } else if (treatmentPath === 'ORAL_APPLIANCE') {
      tasks.push('Refer to sleep dentist');
      tasks.push('Schedule dental impression');
      tasks.push('Order custom appliance');
    } else if (treatmentPath === 'SURGICAL_EVALUATION') {
      tasks.push('Refer to ENT specialist');
      tasks.push('Schedule surgical consultation');
      tasks.push('Order pre-surgical workup');
    } else {
      tasks.push('Schedule lifestyle counseling');
      tasks.push('Provide weight management resources');
      tasks.push('Send positional therapy instructions');
    }

    logger.info('Treatment tasks created', { taskCount: tasks.length, correlationId });

    // 3. Schedule patient contact
    // In production: Create CRM tasks and notifications

    return {
      success: true,
      caseId,
      caseNumber,
      treatmentPath,
      tasksCreated: tasks,
    };
  },
});

// ============================================================================
// FOLLOW-UP WORKFLOW
// ============================================================================

export const OsaxFollowUpPayloadSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  followUpType: z.enum(['INITIAL', 'COMPLIANCE_CHECK', 'TREATMENT_REVIEW', 'ANNUAL']),
  scheduledForDays: z.number(),
  correlationId: z.string(),
});

export const osaxFollowUpWorkflow = task({
  id: 'osax-followup-workflow',
  run: async (payload: z.infer<typeof OsaxFollowUpPayloadSchema>) => {
    const { caseId, caseNumber, followUpType, scheduledForDays, correlationId } = payload;

    logger.info('Starting follow-up workflow', {
      caseId,
      caseNumber,
      followUpType,
      scheduledForDays,
      correlationId,
    });

    // 1. Schedule the follow-up
    const followUpDate = new Date(Date.now() + scheduledForDays * 24 * 60 * 60 * 1000);
    logger.info('Follow-up scheduled', {
      followUpDate: followUpDate.toISOString(),
      correlationId,
    });

    // 2. Send reminder 2 days before
    const reminderDays = Math.max(0, scheduledForDays - 2);
    if (reminderDays > 0) {
      await wait.for({ days: reminderDays });

      logger.info('Sending follow-up reminder', { correlationId });
      // In production: Send reminder via preferred channel
    }

    // 3. Wait until follow-up day
    await wait.for({ days: 2 });

    // 4. Check if follow-up was completed
    logger.info('Checking follow-up completion', { correlationId });
    // In production: Query database for follow-up status

    // 5. If missed, trigger missed follow-up handling
    const followUpCompleted = false as boolean; // Placeholder - will be replaced with actual check

    if (!followUpCompleted) {
      logger.warn('Follow-up may have been missed', { correlationId });
      // In production: Trigger missed follow-up workflow
    }

    return {
      success: true,
      caseId,
      caseNumber,
      followUpType,
      scheduledDate: followUpDate.toISOString(),
      reminderSent: true,
    };
  },
});

// ============================================================================
// TREATMENT ONBOARDING WORKFLOW
// ============================================================================

export const OsaxTreatmentOnboardingPayloadSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  treatmentType: z.string(),
  deviceInfo: z
    .object({
      manufacturer: z.string().optional(),
      model: z.string().optional(),
    })
    .optional(),
  correlationId: z.string(),
});

export const osaxTreatmentOnboardingWorkflow = task({
  id: 'osax-treatment-onboarding-workflow',
  run: async (payload: z.infer<typeof OsaxTreatmentOnboardingPayloadSchema>) => {
    const { caseId, caseNumber, treatmentType, deviceInfo: _deviceInfo, correlationId } = payload;

    logger.info('Starting treatment onboarding', {
      caseId,
      caseNumber,
      treatmentType,
      correlationId,
    });

    // Day 1: Welcome message
    logger.info('Sending welcome message', { correlationId });
    // In production: Send welcome message with treatment instructions

    // Day 3: First usage check
    await wait.for({ days: 3 });
    logger.info('Checking first usage', { correlationId });
    // In production: Check device data for initial usage

    // Day 7: Week 1 compliance check
    await wait.for({ days: 4 });
    logger.info('Week 1 compliance check', { correlationId });
    // In production: Review compliance data and send encouragement

    // Day 30: Month 1 review
    await wait.for({ days: 23 });
    logger.info('Month 1 treatment review', { correlationId });
    // In production: Schedule Month 1 review with provider

    return {
      success: true,
      caseId,
      caseNumber,
      treatmentType,
      onboardingStages: ['welcome', 'day3_check', 'week1_review', 'month1_review'],
    };
  },
});

// ============================================================================
// DATA RETENTION WORKFLOW
// ============================================================================

export const OsaxDataRetentionPayloadSchema = z.object({
  caseId: z.string().uuid(),
  caseNumber: z.string(),
  retentionPeriodDays: z.number().optional(),
  correlationId: z.string(),
});

export const osaxDataRetentionWorkflow = task({
  id: 'osax-data-retention-workflow',
  run: async (payload: z.infer<typeof OsaxDataRetentionPayloadSchema>) => {
    const { caseId, caseNumber, retentionPeriodDays = 2555, correlationId } = payload; // 7 years default

    logger.info('Starting data retention workflow', {
      caseId,
      caseNumber,
      retentionPeriodDays,
      correlationId,
    });

    // 1. Mark case for retention
    logger.info('Marking case for retention', { correlationId });
    // In production: Update case with retention policy

    // 2. Schedule deletion reminder at 90% of retention period
    const reminderDays = Math.floor(retentionPeriodDays * 0.9);
    await wait.for({ days: reminderDays });

    logger.info('Sending retention expiry reminder', { correlationId });
    // In production: Notify compliance team of upcoming retention expiry

    // 3. Wait remaining period
    await wait.for({ days: retentionPeriodDays - reminderDays });

    // 4. Trigger data deletion
    logger.info('Retention period expired - initiating deletion', { correlationId });
    // In production: Trigger hard delete workflow

    return {
      success: true,
      caseId,
      caseNumber,
      retentionPeriodDays,
      deletionTriggered: true,
    };
  },
});
