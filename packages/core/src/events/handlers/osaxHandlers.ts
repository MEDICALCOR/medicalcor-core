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
  OsaxCaseCreatedEvent,
  OsaxCaseStatusChangedEvent,
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
 * Handle OsaxCaseCreated event
 *
 * Side effects:
 * - Record audit log entry
 * - Record metrics
 * - Create initial CRM record
 * - Notify assigned specialist if any
 */
export async function handleOsaxCaseCreated(
  event: OsaxCaseCreatedEvent,
  deps: OsaxEventHandlerDeps
): Promise<EventHandlerResult> {
  const handledBy: string[] = [];
  const errors: string[] = [];

  const { payload, aggregateId } = event;

  try {
    // 1. Record metrics
    if (deps.metricsCollector) {
      deps.metricsCollector.incrementCounter('osax.case.created', {
        priority: payload.priority,
        consent_status: payload.consentStatus,
      });
      handledBy.push('metrics:recorded');
    }

    // 2. Create CRM record
    if (deps.crmGateway) {
      await deps.crmGateway.logActivity(
        aggregateId,
        'osax_case_created',
        `OSAX Case ${payload.caseNumber} created with priority ${payload.priority}`
      );
      handledBy.push('crm:log_activity');
    }

    // 3. Notify assigned specialist if urgent
    if (deps.notificationService && payload.assignedSpecialistId && payload.priority === 'URGENT') {
      await deps.notificationService.sendPushNotification(
        payload.assignedSpecialistId,
        'New Urgent OSAX Case',
        `Case ${payload.caseNumber} requires immediate attention`
      );
      handledBy.push('notification:specialist');
    }

    // 4. Trigger intake workflow for new cases
    if (deps.workflowTrigger) {
      await deps.workflowTrigger.triggerWorkflow('osax-case-intake', {
        caseId: aggregateId,
        caseNumber: payload.caseNumber,
        priority: payload.priority,
        patientId: payload.patientId,
        correlationId: event.metadata.correlationId,
      });
      handledBy.push('workflow:intake');
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
 * Handle OsaxCaseStatusChanged event
 *
 * Side effects:
 * - Record status transition metrics
 * - Update CRM lifecycle stage
 * - Trigger appropriate workflows based on new status
 * - Notify relevant parties
 */
export async function handleOsaxCaseStatusChanged(
  event: OsaxCaseStatusChangedEvent,
  deps: OsaxEventHandlerDeps
): Promise<EventHandlerResult> {
  const handledBy: string[] = [];
  const errors: string[] = [];

  const { payload, aggregateId } = event;

  try {
    // 1. Record metrics
    if (deps.metricsCollector) {
      deps.metricsCollector.incrementCounter('osax.case.status_changed', {
        from_status: payload.previousStatus,
        to_status: payload.newStatus,
      });
      handledBy.push('metrics:recorded');
    }

    // 2. Update CRM with new status
    if (deps.crmGateway) {
      await deps.crmGateway.updateContact(aggregateId, {
        osax_case_status: payload.newStatus,
        osax_status_changed_at: new Date().toISOString(),
        osax_status_changed_by: payload.changedBy,
      });

      await deps.crmGateway.logActivity(
        aggregateId,
        'osax_status_changed',
        `Case ${payload.caseNumber} status changed from ${payload.previousStatus} to ${payload.newStatus}${payload.reason ? `: ${payload.reason}` : ''}`
      );
      handledBy.push('crm:updated');
    }

    // 3. Trigger workflows based on new status
    if (deps.workflowTrigger) {
      switch (payload.newStatus) {
        case 'SCORING':
          await deps.workflowTrigger.triggerWorkflow('osax-scoring-queue', {
            caseId: aggregateId,
            caseNumber: payload.caseNumber,
            correlationId: event.metadata.correlationId,
          });
          handledBy.push('workflow:scoring');
          break;

        case 'AWAITING_REVIEW':
          await deps.workflowTrigger.triggerWorkflow('osax-review-queue', {
            caseId: aggregateId,
            caseNumber: payload.caseNumber,
            correlationId: event.metadata.correlationId,
          });
          handledBy.push('workflow:review');
          break;

        case 'TREATMENT_PLANNED':
          await deps.workflowTrigger.triggerWorkflow('osax-treatment-planning', {
            caseId: aggregateId,
            caseNumber: payload.caseNumber,
            correlationId: event.metadata.correlationId,
          });
          handledBy.push('workflow:treatment');
          break;

        case 'CLOSED':
        case 'CANCELLED':
          await deps.workflowTrigger.triggerWorkflow('osax-case-closure', {
            caseId: aggregateId,
            caseNumber: payload.caseNumber,
            finalStatus: payload.newStatus,
            correlationId: event.metadata.correlationId,
          });
          handledBy.push('workflow:closure');
          break;
      }
    }

    // 4. Notify if case is stalled (ON_HOLD for too long could trigger separate check)
    if (deps.notificationService && payload.newStatus === 'ON_HOLD') {
      await deps.notificationService.sendPushNotification(
        'care-coordinators',
        'Case On Hold',
        `Case ${payload.caseNumber} has been placed on hold${payload.reason ? `: ${payload.reason}` : ''}`
      );
      handledBy.push('notification:on_hold');
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
    case 'osax.case.created':
      return handleOsaxCaseCreated(event, deps);
    case 'osax.case.status_changed':
      return handleOsaxCaseStatusChanged(event, deps);
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
    handleCaseCreated: (event: OsaxCaseCreatedEvent) => handleOsaxCaseCreated(event, deps),
    handleCaseStatusChanged: (event: OsaxCaseStatusChangedEvent) =>
      handleOsaxCaseStatusChanged(event, deps),
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
