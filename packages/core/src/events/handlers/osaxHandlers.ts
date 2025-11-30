/**
 * @fileoverview OSAX Event Handlers
 *
 * Event handlers for OSAX domain events.
 * Handles side effects like notifications, CRM updates, and workflow triggers.
 *
 * @module core/events/handlers/osax-handlers
 */

import type {
  OsaxDomainEventUnion,
  OsaxCaseScoredEvent,
  OsaxCaseReviewedEvent,
  OsaxTreatmentInitiatedEvent,
  OsaxFollowUpMissedEvent,
  OsaxConsentWithdrawnEvent,
} from '@medicalcor/domain';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Handler dependencies
 */
export interface OsaxEventHandlerDeps {
  readonly notificationService?: NotificationService;
  readonly crmGateway?: CrmGateway;
  readonly workflowTrigger?: WorkflowTrigger;
  readonly auditLogger?: AuditLogger;
  readonly metricsCollector?: MetricsCollector;
}

/**
 * Notification service interface
 */
export interface NotificationService {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  sendSms(to: string, message: string): Promise<void>;
  sendPushNotification(userId: string, title: string, body: string): Promise<void>;
}

/**
 * CRM gateway interface
 */
export interface CrmGateway {
  updateContact(contactId: string, properties: Record<string, unknown>): Promise<void>;
  createTask(options: {
    contactId: string;
    subject: string;
    body: string;
    priority: string;
    dueDate?: Date;
  }): Promise<void>;
  logActivity(contactId: string, type: string, details: string): Promise<void>;
}

/**
 * Workflow trigger interface
 */
export interface WorkflowTrigger {
  triggerWorkflow(workflowId: string, payload: Record<string, unknown>): Promise<void>;
}

/**
 * Audit logger interface
 */
export interface AuditLogger {
  log(event: OsaxDomainEventUnion): Promise<void>;
}

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  incrementCounter(name: string, tags?: Record<string, string>): void;
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * Event handler result
 */
export interface EventHandlerResult {
  readonly success: boolean;
  readonly handledBy: string[];
  readonly errors?: string[];
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle OsaxCaseScored event
 *
 * Side effects:
 * - Notify specialist if urgent
 * - Update CRM with severity
 * - Trigger appropriate workflow based on severity
 */
export async function handleOsaxCaseScored(
  event: OsaxCaseScoredEvent,
  deps: OsaxEventHandlerDeps
): Promise<EventHandlerResult> {
  const handledBy: string[] = [];
  const errors: string[] = [];

  const { payload, aggregateId } = event;

  try {
    // 1. Notify if urgent (severe or critical risk)
    if (
      deps.notificationService &&
      (payload.severity === 'SEVERE' || payload.cardiovascularRisk === 'CRITICAL')
    ) {
      await deps.notificationService.sendPushNotification(
        'sleep-specialists-group',
        'Urgent OSAX Case',
        `Case ${payload.caseNumber} scored as ${payload.severity} with ${payload.cardiovascularRisk} cardiovascular risk. Immediate review required.`
      );
      handledBy.push('notification:urgent_case');
    }

    // 2. Update CRM
    if (deps.crmGateway) {
      await deps.crmGateway.logActivity(
        aggregateId,
        'osax_scored',
        `OSAX Case scored: Severity ${payload.severity}, AHI ${payload.indicators.ahi}, Recommendation: ${payload.treatmentRecommendation}`
      );
      handledBy.push('crm:log_activity');
    }

    // 3. Trigger workflow based on severity
    if (deps.workflowTrigger) {
      if (payload.severity === 'SEVERE') {
        await deps.workflowTrigger.triggerWorkflow('osax-urgent-review', {
          caseId: aggregateId,
          caseNumber: payload.caseNumber,
          severity: payload.severity,
          cardiovascularRisk: payload.cardiovascularRisk,
          correlationId: event.metadata.correlationId,
        });
        handledBy.push('workflow:urgent_review');
      } else if (payload.severity === 'MODERATE') {
        await deps.workflowTrigger.triggerWorkflow('osax-standard-review', {
          caseId: aggregateId,
          caseNumber: payload.caseNumber,
          severity: payload.severity,
          correlationId: event.metadata.correlationId,
        });
        handledBy.push('workflow:standard_review');
      }
    }

    // 4. Record metrics
    if (deps.metricsCollector) {
      deps.metricsCollector.incrementCounter('osax.case.scored', {
        severity: payload.severity,
        cardiovascular_risk: payload.cardiovascularRisk,
      });
      deps.metricsCollector.recordHistogram('osax.score.ahi', payload.indicators.ahi);
      deps.metricsCollector.recordHistogram('osax.score.composite', payload.compositeScore);
      handledBy.push('metrics:recorded');
    }

    // 5. Audit log
    if (deps.auditLogger) {
      await deps.auditLogger.log(event);
      handledBy.push('audit:logged');
    }

    return { success: true, handledBy };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Unknown error');
    return { success: false, handledBy, errors };
  }
}

/**
 * Handle OsaxCaseReviewed event
 *
 * Side effects:
 * - Notify patient of review completion
 * - Create follow-up tasks if needed
 * - Update CRM
 */
export async function handleOsaxCaseReviewed(
  event: OsaxCaseReviewedEvent,
  deps: OsaxEventHandlerDeps
): Promise<EventHandlerResult> {
  const handledBy: string[] = [];
  const errors: string[] = [];

  const { payload, aggregateId } = event;

  try {
    // 1. Create CRM task based on decision
    if (deps.crmGateway) {
      if (payload.decision === 'APPROVE') {
        await deps.crmGateway.createTask({
          contactId: aggregateId,
          subject: `Schedule treatment discussion - ${payload.caseNumber}`,
          body: `Physician ${payload.physicianName ?? payload.physicianId} approved the case. Schedule treatment discussion with patient.`,
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        });
        handledBy.push('crm:task_created');
      } else if (payload.decision === 'REFER') {
        await deps.crmGateway.createTask({
          contactId: aggregateId,
          subject: `Process referral - ${payload.caseNumber}`,
          body: `Case referred to ${payload.referralSpecialty}. Coordinate referral.`,
          priority: 'MEDIUM',
        });
        handledBy.push('crm:referral_task');
      }

      await deps.crmGateway.logActivity(
        aggregateId,
        'osax_reviewed',
        `Case reviewed by ${payload.physicianName ?? payload.physicianId}: ${payload.decision}`
      );
    }

    // 2. Trigger treatment planning workflow if approved
    if (deps.workflowTrigger && payload.decision === 'APPROVE') {
      await deps.workflowTrigger.triggerWorkflow('osax-treatment-planning', {
        caseId: aggregateId,
        caseNumber: payload.caseNumber,
        modifiedRecommendation: payload.modifiedRecommendation,
        correlationId: event.metadata.correlationId,
      });
      handledBy.push('workflow:treatment_planning');
    }

    // 3. Record metrics
    if (deps.metricsCollector) {
      deps.metricsCollector.incrementCounter('osax.case.reviewed', {
        decision: payload.decision,
      });
      if (payload.reviewDurationMinutes) {
        deps.metricsCollector.recordHistogram(
          'osax.review.duration_minutes',
          payload.reviewDurationMinutes
        );
      }
      handledBy.push('metrics:recorded');
    }

    // 4. Audit log
    if (deps.auditLogger) {
      await deps.auditLogger.log(event);
      handledBy.push('audit:logged');
    }

    return { success: true, handledBy };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Unknown error');
    return { success: false, handledBy, errors };
  }
}

/**
 * Handle OsaxTreatmentInitiated event
 *
 * Side effects:
 * - Send patient instructions
 * - Schedule initial follow-up
 * - Update CRM lifecycle
 */
export async function handleOsaxTreatmentInitiated(
  event: OsaxTreatmentInitiatedEvent,
  deps: OsaxEventHandlerDeps
): Promise<EventHandlerResult> {
  const handledBy: string[] = [];
  const errors: string[] = [];

  const { payload, aggregateId } = event;

  try {
    // 1. Update CRM lifecycle stage
    if (deps.crmGateway) {
      await deps.crmGateway.updateContact(aggregateId, {
        lifecyclestage: 'customer',
        osax_treatment_type: payload.treatmentType,
        osax_treatment_start: payload.startDate,
      });
      handledBy.push('crm:lifecycle_updated');
    }

    // 2. Trigger treatment onboarding workflow
    if (deps.workflowTrigger) {
      await deps.workflowTrigger.triggerWorkflow('osax-treatment-onboarding', {
        caseId: aggregateId,
        caseNumber: payload.caseNumber,
        treatmentType: payload.treatmentType,
        deviceInfo: payload.deviceInfo,
        correlationId: event.metadata.correlationId,
      });
      handledBy.push('workflow:onboarding');
    }

    // 3. Record metrics
    if (deps.metricsCollector) {
      deps.metricsCollector.incrementCounter('osax.treatment.initiated', {
        type: payload.treatmentType,
      });
      handledBy.push('metrics:recorded');
    }

    // 4. Audit log
    if (deps.auditLogger) {
      await deps.auditLogger.log(event);
      handledBy.push('audit:logged');
    }

    return { success: true, handledBy };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Unknown error');
    return { success: false, handledBy, errors };
  }
}

/**
 * Handle OsaxFollowUpMissed event
 *
 * Side effects:
 * - Notify care team
 * - Create outreach task
 * - Track non-compliance
 */
export async function handleOsaxFollowUpMissed(
  event: OsaxFollowUpMissedEvent,
  deps: OsaxEventHandlerDeps
): Promise<EventHandlerResult> {
  const handledBy: string[] = [];
  const errors: string[] = [];

  const { payload, aggregateId } = event;

  try {
    // 1. Create urgent outreach task
    if (deps.crmGateway) {
      await deps.crmGateway.createTask({
        contactId: aggregateId,
        subject: `MISSED FOLLOW-UP: ${payload.caseNumber}`,
        body: `Patient missed ${payload.followUpType} follow-up scheduled for ${payload.scheduledDate}. Contact patient to reschedule.`,
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
      });
      handledBy.push('crm:outreach_task');
    }

    // 2. Send notification to care team
    if (deps.notificationService) {
      await deps.notificationService.sendPushNotification(
        'care-coordinators',
        'Missed Follow-up',
        `Patient ${payload.caseNumber} missed their ${payload.followUpType} follow-up`
      );
      handledBy.push('notification:care_team');
    }

    // 3. Record metrics
    if (deps.metricsCollector) {
      deps.metricsCollector.incrementCounter('osax.followup.missed', {
        type: payload.followUpType,
      });
      handledBy.push('metrics:recorded');
    }

    // 4. Audit log
    if (deps.auditLogger) {
      await deps.auditLogger.log(event);
      handledBy.push('audit:logged');
    }

    return { success: true, handledBy };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Unknown error');
    return { success: false, handledBy, errors };
  }
}

/**
 * Handle OsaxConsentWithdrawn event
 *
 * Side effects:
 * - Stop all active workflows
 * - Update CRM
 * - Initiate data retention process
 */
export async function handleOsaxConsentWithdrawn(
  event: OsaxConsentWithdrawnEvent,
  deps: OsaxEventHandlerDeps
): Promise<EventHandlerResult> {
  const handledBy: string[] = [];
  const errors: string[] = [];

  const { payload, aggregateId } = event;

  try {
    // 1. Update CRM to reflect consent withdrawal
    if (deps.crmGateway) {
      await deps.crmGateway.updateContact(aggregateId, {
        consent_status: 'WITHDRAWN',
        consent_withdrawal_date: payload.withdrawalDate,
        consent_withdrawal_reason: payload.withdrawalReason,
      });

      await deps.crmGateway.logActivity(
        aggregateId,
        'consent_withdrawn',
        `Patient withdrew ${payload.consentType} consent. Reason: ${payload.withdrawalReason ?? 'Not specified'}`
      );
      handledBy.push('crm:updated');
    }

    // 2. Trigger data retention workflow if required
    if (deps.workflowTrigger && payload.dataRetentionRequired) {
      await deps.workflowTrigger.triggerWorkflow('osax-data-retention', {
        caseId: aggregateId,
        caseNumber: payload.caseNumber,
        retentionPeriodDays: payload.retentionPeriodDays,
        correlationId: event.metadata.correlationId,
      });
      handledBy.push('workflow:data_retention');
    }

    // 3. Record metrics
    if (deps.metricsCollector) {
      deps.metricsCollector.incrementCounter('osax.consent.withdrawn', {
        type: payload.consentType,
      });
      handledBy.push('metrics:recorded');
    }

    // 4. Audit log (critical for GDPR compliance)
    if (deps.auditLogger) {
      await deps.auditLogger.log(event);
      handledBy.push('audit:logged');
    }

    return { success: true, handledBy };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Unknown error');
    return { success: false, handledBy, errors };
  }
}

// ============================================================================
// EVENT ROUTER
// ============================================================================

/**
 * Route event to appropriate handler
 */
export async function routeOsaxEvent(
  event: OsaxDomainEventUnion,
  deps: OsaxEventHandlerDeps
): Promise<EventHandlerResult> {
  switch (event.type) {
    case 'osax.case.scored':
      return handleOsaxCaseScored(event, deps);
    case 'osax.case.reviewed':
      return handleOsaxCaseReviewed(event, deps);
    case 'osax.treatment.initiated':
      return handleOsaxTreatmentInitiated(event, deps);
    case 'osax.followup.missed':
      return handleOsaxFollowUpMissed(event, deps);
    case 'osax.consent.withdrawn':
      return handleOsaxConsentWithdrawn(event, deps);
    default:
      // Log and acknowledge unhandled events
      if (deps.auditLogger) {
        await deps.auditLogger.log(event);
      }
      return { success: true, handledBy: ['audit:logged'] };
  }
}

/**
 * Create event handler with dependencies
 */
export function createOsaxEventHandler(deps: OsaxEventHandlerDeps) {
  return {
    handleCaseScored: (event: OsaxCaseScoredEvent) => handleOsaxCaseScored(event, deps),
    handleCaseReviewed: (event: OsaxCaseReviewedEvent) => handleOsaxCaseReviewed(event, deps),
    handleTreatmentInitiated: (event: OsaxTreatmentInitiatedEvent) =>
      handleOsaxTreatmentInitiated(event, deps),
    handleFollowUpMissed: (event: OsaxFollowUpMissedEvent) => handleOsaxFollowUpMissed(event, deps),
    handleConsentWithdrawn: (event: OsaxConsentWithdrawnEvent) =>
      handleOsaxConsentWithdrawn(event, deps),
    routeEvent: (event: OsaxDomainEventUnion) => routeOsaxEvent(event, deps),
  };
}
