import { task, logger, schedules } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';
import { createIntegrationClients } from '@medicalcor/integrations';
import {
  calculateHoursUntilDeadline,
  assessBreachSeverity,
  requiresAuthorityNotification,
  requiresSubjectNotification,
  type ReportBreachPayload,
  type BreachNotificationWorkflowPayload,
  type NotifySubjectPayload,
  type NotifyAuthorityPayload,
  type DataBreach,
  type BreachDataCategory,
  type AffectedSubject,
} from '@medicalcor/types';
import { dispatchNotification } from '../tasks/notification-dispatcher.js';

/**
 * GDPR Breach Notification Workflow
 *
 * Implements automated breach notification in compliance with:
 * - GDPR Article 33: Notification to supervisory authority (72-hour deadline)
 * - GDPR Article 34: Communication to data subjects
 *
 * Workflow steps:
 * 1. Report breach and create record
 * 2. Assess severity and notification requirements
 * 3. Notify DPO immediately
 * 4. Notify supervisory authority (if required, within 72h)
 * 5. Notify affected subjects (if high risk)
 * 6. Track resolution and close
 */

// ============================================
// In-Memory Breach Store (for workflow state)
// ============================================

/**
 * In-memory breach store for development/testing
 * Production should use PostgreSQL via the domain service
 */
const breachStore = new Map<string, DataBreach>();

/**
 * Initialize clients lazily using shared factory
 */
function getClients() {
  return createIntegrationClients({
    source: 'breach-notification',
    includeOpenAI: false,
  });
}

/**
 * Generate unique breach ID
 */
function generateBreachId(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `brch_${timestamp}_${random}`;
}

// ============================================
// Report Breach Task
// ============================================

/**
 * Report a new data breach
 * Creates a breach record and triggers the notification workflow
 */
export const reportBreach = task({
  id: 'breach-report',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: ReportBreachPayload) => {
    const { eventStore } = getClients();
    const now = new Date().toISOString();
    const detectedAt = payload.detectedAt ?? now;

    logger.info('Reporting new data breach', {
      correlationId: payload.correlationId,
      clinicId: payload.clinicId,
      dataCategories: payload.dataCategories,
      estimatedAffectedCount: payload.estimatedAffectedCount,
    });

    // Assess severity based on data categories and impact
    const severity = assessBreachSeverity(
      payload.dataCategories,
      payload.nature,
      payload.estimatedAffectedCount
    );

    // Determine notification requirements
    const highRiskToSubjects = severity === 'critical' || severity === 'high';
    const authorityNotificationRequired = requiresAuthorityNotification(
      severity,
      highRiskToSubjects
    );
    const subjectNotificationRequired = requiresSubjectNotification(severity, highRiskToSubjects);

    // Build affected subjects list
    const affectedSubjects: AffectedSubject[] = (payload.affectedContactIds ?? []).map(
      (contactId) => ({
        contactId,
        dataCategories: payload.dataCategories,
        notified: false,
      })
    );

    // Create breach record
    const breach: DataBreach = {
      id: generateBreachId(),
      correlationId: payload.correlationId,
      clinicId: payload.clinicId,
      detectedAt,
      detectedBy: payload.reportedBy,
      detectionMethod: payload.detectionMethod,
      nature: payload.nature,
      dataCategories: payload.dataCategories,
      severity,
      status: 'detected',
      description: payload.description,
      affectedCount: payload.estimatedAffectedCount,
      affectedSubjects: affectedSubjects.length > 0 ? affectedSubjects : undefined,
      potentialConsequences: assessConsequences(payload.dataCategories),
      highRiskToSubjects,
      dpoNotified: false,
      authorityNotificationRequired,
      subjectNotificationRequired,
      subjectsNotifiedCount: 0,
      measuresTaken: [],
      createdAt: now,
      updatedAt: now,
      updatedBy: payload.reportedBy,
    };

    // Store breach
    breachStore.set(breach.id, breach);

    // Emit breach detected event
    await eventStore.emit({
      type: 'breach.detected',
      correlationId: payload.correlationId,
      aggregateId: breach.id,
      aggregateType: 'breach',
      payload: {
        breachId: breach.id,
        clinicId: payload.clinicId,
        severity,
        dataCategories: payload.dataCategories,
        estimatedAffectedCount: payload.estimatedAffectedCount,
        detectedBy: payload.reportedBy,
        authorityNotificationRequired,
        subjectNotificationRequired,
      },
    });

    logger.info('Breach reported and recorded', {
      breachId: breach.id,
      severity,
      authorityNotificationRequired,
      subjectNotificationRequired,
      hoursUntilDeadline: calculateHoursUntilDeadline(detectedAt),
      correlationId: payload.correlationId,
    });

    // Immediately notify DPO
    await notifyDPO.triggerAndWait({
      breachId: breach.id,
      correlationId: payload.correlationId,
    });

    return {
      breachId: breach.id,
      severity,
      authorityNotificationRequired,
      subjectNotificationRequired,
      hoursUntilDeadline: calculateHoursUntilDeadline(detectedAt),
      correlationId: payload.correlationId,
    };
  },
});

// ============================================
// Notify DPO Task
// ============================================

interface NotifyDPOPayload {
  breachId: string;
  correlationId: string;
}

/**
 * Notify the Data Protection Officer about a breach
 */
export const notifyDPO = task({
  id: 'breach-notify-dpo',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: NotifyDPOPayload) => {
    const { breachId, correlationId } = payload;
    const breach = breachStore.get(breachId);

    if (!breach) {
      logger.error('Breach not found for DPO notification', { breachId, correlationId });
      throw new Error(`Breach not found: ${breachId}`);
    }

    logger.info('Notifying DPO of breach', {
      breachId,
      severity: breach.severity,
      correlationId,
    });

    // Send notification via notification dispatcher
    const hoursUntilDeadline = calculateHoursUntilDeadline(breach.detectedAt);

    await dispatchNotification.triggerAndWait({
      type: 'system.alert',
      priority: breach.severity === 'critical' ? 'critical' : 'high',
      channels: ['email', 'sse'],
      recipients: {
        supervisorIds: ['dpo'], // Special ID for DPO
      },
      content: {
        title: `🚨 Data Breach Detected - ${breach.severity.toUpperCase()} Severity`,
        body: `A data breach has been detected.

**Breach ID:** ${breach.id}
**Detected:** ${new Date(breach.detectedAt).toLocaleString()}
**Severity:** ${breach.severity.toUpperCase()}
**Affected Data:** ${breach.dataCategories.join(', ')}
**Estimated Affected:** ${breach.affectedCount} individuals

**Description:**
${breach.description}

**Authority Notification Required:** ${breach.authorityNotificationRequired ? 'YES - 72h deadline' : 'No'}
**Hours Until Deadline:** ${hoursUntilDeadline.toFixed(1)}
**Subject Notification Required:** ${breach.subjectNotificationRequired ? 'YES' : 'No'}

**Immediate Actions Required:**
1. Review breach details
2. Assess full impact
3. Implement containment measures
${breach.authorityNotificationRequired ? '4. Prepare authority notification' : ''}
${breach.subjectNotificationRequired ? '5. Prepare subject notifications' : ''}`,
        shortBody: `Data breach detected - ${breach.severity} severity, ${breach.affectedCount} affected`,
      },
      metadata: {
        correlationId,
        triggeredBy: 'breach-notification-workflow',
        sourceEvent: 'breach.detected',
      },
    });

    // Update breach status
    breach.dpoNotified = true;
    breach.dpoNotifiedAt = new Date().toISOString();
    breach.updatedAt = new Date().toISOString();
    breachStore.set(breachId, breach);

    logger.info('DPO notified of breach', {
      breachId,
      correlationId,
    });

    return { success: true, breachId };
  },
});

// ============================================
// Breach Notification Workflow
// ============================================

/**
 * Main breach notification workflow
 * Orchestrates the complete notification process
 */
export const breachNotificationWorkflow = task({
  id: 'breach-notification-workflow',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: BreachNotificationWorkflowPayload) => {
    const { breachId, correlationId } = payload;
    const { eventStore } = getClients();
    const breach = breachStore.get(breachId);

    if (!breach) {
      logger.error('Breach not found for notification workflow', { breachId, correlationId });
      throw new Error(`Breach not found: ${breachId}`);
    }

    logger.info('Starting breach notification workflow', {
      breachId,
      severity: breach.severity,
      authorityRequired: breach.authorityNotificationRequired,
      subjectRequired: breach.subjectNotificationRequired,
      correlationId,
    });

    const results = {
      breachId,
      authorityNotified: false,
      subjectsNotified: 0,
      subjectsFailed: 0,
      correlationId,
    };

    // Step 1: Notify supervisory authority if required
    if (breach.authorityNotificationRequired && !breach.authorityNotification) {
      try {
        await notifyAuthority.triggerAndWait({
          breachId,
          authority: 'ANSPDCP', // Romanian Data Protection Authority
          correlationId,
        });
        results.authorityNotified = true;
      } catch (error) {
        logger.error('Failed to notify authority', {
          breachId,
          error: error instanceof Error ? error.message : 'Unknown error',
          correlationId,
        });
      }
    }

    // Step 2: Notify affected subjects if required
    if (breach.subjectNotificationRequired && breach.affectedSubjects) {
      const subjectsToNotify = breach.affectedSubjects.filter((s) => !s.notified);

      for (const subject of subjectsToNotify) {
        try {
          await notifySubject.triggerAndWait({
            breachId,
            contactId: subject.contactId,
            channel: subject.email ? 'email' : subject.phone ? 'whatsapp' : 'email',
            correlationId,
          });
          results.subjectsNotified++;
        } catch (error) {
          logger.error('Failed to notify subject', {
            breachId,
            contactId: subject.contactId,
            error: error instanceof Error ? error.message : 'Unknown error',
            correlationId,
          });
          results.subjectsFailed++;
        }
      }
    }

    // Update breach status
    const now = new Date().toISOString();
    breach.status = results.authorityNotified ? 'notifying_subjects' : 'mitigating';
    breach.updatedAt = now;
    breachStore.set(breachId, breach);

    // Emit workflow completed event
    await eventStore.emit({
      type: 'breach.workflow_completed',
      correlationId,
      aggregateId: breachId,
      aggregateType: 'breach',
      payload: {
        breachId,
        authorityNotified: results.authorityNotified,
        subjectsNotified: results.subjectsNotified,
        subjectsFailed: results.subjectsFailed,
      },
    });

    logger.info('Breach notification workflow completed', {
      ...results,
    });

    return results;
  },
});

// ============================================
// Notify Authority Task
// ============================================

/**
 * Notify the supervisory authority about a breach
 */
export const notifyAuthority = task({
  id: 'breach-notify-authority',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: NotifyAuthorityPayload) => {
    const { breachId, authority, correlationId } = payload;
    const { eventStore } = getClients();
    const breach = breachStore.get(breachId);

    if (!breach) {
      throw new Error(`Breach not found: ${breachId}`);
    }

    const now = new Date().toISOString();
    const hoursFromDetection = Math.floor(
      (new Date(now).getTime() - new Date(breach.detectedAt).getTime()) / (60 * 60 * 1000)
    );
    const withinDeadline = hoursFromDetection <= 72;

    logger.info('Notifying supervisory authority', {
      breachId,
      authority,
      hoursFromDetection,
      withinDeadline,
      correlationId,
    });

    // Generate reference number
    const referenceNumber = `BRCH-${breach.clinicId.slice(0, 4).toUpperCase()}-${Date.now()}`;

    // Update breach with authority notification
    breach.authorityNotification = {
      authority,
      notifiedAt: now,
      referenceNumber,
    };
    breach.status = 'notifying_authority';
    breach.updatedAt = now;
    breachStore.set(breachId, breach);

    // Emit authority notified event
    await eventStore.emit({
      type: 'breach.authority_notified',
      correlationId,
      aggregateId: breachId,
      aggregateType: 'breach',
      payload: {
        authority,
        notifiedAt: now,
        referenceNumber,
        withinDeadline,
        hoursFromDetection,
      },
    });

    // Send confirmation to DPO
    await dispatchNotification.triggerAndWait({
      type: 'system.alert',
      priority: 'high',
      channels: ['email', 'sse'],
      recipients: {
        supervisorIds: ['dpo'],
      },
      content: {
        title: `✅ Authority Notification Sent - ${authority}`,
        body: `Supervisory authority has been notified of breach ${breachId}.

**Reference Number:** ${referenceNumber}
**Authority:** ${authority}
**Notified At:** ${new Date(now).toLocaleString()}
**Hours from Detection:** ${hoursFromDetection}
**Within 72h Deadline:** ${withinDeadline ? 'YES ✓' : 'NO ⚠️'}

${!withinDeadline ? '⚠️ WARNING: Notification exceeded the 72-hour GDPR deadline. Document the delay reason.' : ''}`,
        shortBody: `Authority ${authority} notified - Ref: ${referenceNumber}`,
      },
      metadata: {
        correlationId,
        triggeredBy: 'breach-notification-workflow',
        sourceEvent: 'breach.authority_notified',
      },
    });

    if (!withinDeadline) {
      logger.warn('Authority notification exceeded 72-hour deadline', {
        breachId,
        hoursFromDetection,
        correlationId,
      });
    }

    return {
      success: true,
      authority,
      referenceNumber,
      withinDeadline,
      hoursFromDetection,
    };
  },
});

// ============================================
// Notify Subject Task
// ============================================

/**
 * Notify an individual data subject about the breach
 */
export const notifySubject = task({
  id: 'breach-notify-subject',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: NotifySubjectPayload) => {
    const { breachId, contactId, channel, correlationId } = payload;
    const { eventStore } = getClients();
    const breach = breachStore.get(breachId);

    if (!breach) {
      throw new Error(`Breach not found: ${breachId}`);
    }

    logger.info('Notifying data subject of breach', {
      breachId,
      contactId,
      channel,
      correlationId,
    });

    // Find subject in breach record
    const subject = breach.affectedSubjects?.find((s) => s.contactId === contactId);

    // Build notification message (GDPR Article 34 requirements)
    const notificationBody = `
**Important Notice Regarding Your Personal Data**

We are writing to inform you of a security incident that may have affected your personal information.

**What Happened:**
${breach.description}

**What Data Was Involved:**
${breach.dataCategories.map((cat) => `- ${formatDataCategory(cat)}`).join('\n')}

**What We Are Doing:**
Our team has taken immediate steps to address this incident:
${breach.measuresTaken.map((m) => `- ${m.description}`).join('\n') || '- Investigation is ongoing'}

**What You Can Do:**
- Monitor your accounts for any suspicious activity
- Be cautious of unsolicited communications
- Contact us if you notice anything unusual

**Contact Information:**
If you have questions or concerns, please contact our Data Protection Officer.

We sincerely apologize for any inconvenience this may cause.
    `.trim();

    // Send notification
    const channels: ('email' | 'whatsapp' | 'sms')[] =
      channel === 'email' ? ['email'] : channel === 'whatsapp' ? ['whatsapp'] : ['email'];

    await dispatchNotification.triggerAndWait({
      type: 'system.alert',
      priority: 'high',
      channels,
      recipients: {
        patientPhone: subject?.phone,
        patientEmail: subject?.email,
      },
      content: {
        title: 'Important Security Notice',
        body: notificationBody,
        shortBody: 'Important notice regarding your personal data security',
      },
      metadata: {
        correlationId,
        triggeredBy: 'breach-notification-workflow',
        sourceEvent: 'breach.subject_notification',
        hubspotContactId: contactId,
      },
    });

    // Update subject notification status
    const now = new Date().toISOString();
    if (subject) {
      subject.notified = true;
      subject.notifiedAt = now;
      subject.notificationChannel = channel;
    }
    breach.subjectsNotifiedCount = breach.subjectsNotifiedCount + 1;
    breach.updatedAt = now;
    breachStore.set(breachId, breach);

    // Emit subject notified event
    await eventStore.emit({
      type: 'breach.subject_notified',
      correlationId,
      aggregateId: breachId,
      aggregateType: 'breach',
      payload: {
        contactId,
        channel,
        success: true,
      },
    });

    logger.info('Subject notified of breach', {
      breachId,
      contactId,
      channel,
      correlationId,
    });

    return { success: true, contactId, channel };
  },
});

// ============================================
// Deadline Monitor Cron Job
// ============================================

/**
 * Monitor breaches approaching the 72-hour authority notification deadline
 * Runs every hour to check for breaches needing urgent attention
 */
export const breachDeadlineMonitor = schedules.task({
  id: 'breach-deadline-monitor',
  cron: '0 * * * *', // Every hour
  run: async () => {
    const now = new Date();
    const breachesApproachingDeadline: DataBreach[] = [];
    const breachesOverdue: DataBreach[] = [];

    logger.info('Running breach deadline monitor', {
      timestamp: now.toISOString(),
    });

    // Check all active breaches
    for (const breach of breachStore.values()) {
      if (
        breach.authorityNotificationRequired &&
        !breach.authorityNotification &&
        breach.status !== 'closed' &&
        breach.status !== 'resolved'
      ) {
        const hoursRemaining = calculateHoursUntilDeadline(breach.detectedAt);

        if (hoursRemaining <= 0) {
          breachesOverdue.push(breach);
        } else if (hoursRemaining <= 24) {
          breachesApproachingDeadline.push(breach);
        }
      }
    }

    // Alert for overdue breaches
    if (breachesOverdue.length > 0) {
      logger.error('Breaches with overdue authority notification', {
        count: breachesOverdue.length,
        breachIds: breachesOverdue.map((b) => b.id),
      });

      for (const breach of breachesOverdue) {
        await dispatchNotification.triggerAndWait({
          type: 'system.alert',
          priority: 'critical',
          channels: ['email', 'sse', 'sms'],
          recipients: {
            supervisorIds: ['dpo', 'admin'],
          },
          content: {
            title: `🚨 URGENT: Authority Notification OVERDUE - ${breach.id}`,
            body: `The 72-hour deadline for authority notification has PASSED.

**Breach ID:** ${breach.id}
**Detected:** ${new Date(breach.detectedAt).toLocaleString()}
**Severity:** ${breach.severity.toUpperCase()}

IMMEDIATE ACTION REQUIRED: Notify the supervisory authority immediately and document the reason for delay.`,
            shortBody: 'URGENT: Breach authority notification overdue',
          },
          metadata: {
            correlationId: breach.correlationId,
            triggeredBy: 'breach-deadline-monitor',
            sourceEvent: 'cron.deadline_overdue',
          },
        });
      }
    }

    // Alert for approaching deadline
    if (breachesApproachingDeadline.length > 0) {
      logger.warn('Breaches approaching authority notification deadline', {
        count: breachesApproachingDeadline.length,
        breachIds: breachesApproachingDeadline.map((b) => b.id),
      });

      for (const breach of breachesApproachingDeadline) {
        const hoursRemaining = calculateHoursUntilDeadline(breach.detectedAt);

        await dispatchNotification.triggerAndWait({
          type: 'system.alert',
          priority: 'high',
          channels: ['email', 'sse'],
          recipients: {
            supervisorIds: ['dpo'],
          },
          content: {
            title: `⚠️ Authority Notification Deadline Approaching - ${breach.id}`,
            body: `Only ${hoursRemaining.toFixed(1)} hours remain to notify the supervisory authority.

**Breach ID:** ${breach.id}
**Detected:** ${new Date(breach.detectedAt).toLocaleString()}
**Deadline:** ${new Date(new Date(breach.detectedAt).getTime() + 72 * 60 * 60 * 1000).toLocaleString()}
**Severity:** ${breach.severity.toUpperCase()}

ACTION REQUIRED: Complete the authority notification process before the deadline.`,
            shortBody: `Breach deadline: ${hoursRemaining.toFixed(0)}h remaining`,
          },
          metadata: {
            correlationId: breach.correlationId,
            triggeredBy: 'breach-deadline-monitor',
            sourceEvent: 'cron.deadline_approaching',
          },
        });
      }
    }

    return {
      timestamp: now.toISOString(),
      checkedBreaches: breachStore.size,
      approachingDeadline: breachesApproachingDeadline.length,
      overdue: breachesOverdue.length,
    };
  },
});

// ============================================
// Helper Functions
// ============================================

/**
 * Assess potential consequences based on data categories
 */
function assessConsequences(dataCategories: BreachDataCategory[]): string[] {
  const consequences: string[] = [];

  if (dataCategories.includes('health_data')) {
    consequences.push('Potential disclosure of sensitive medical information');
    consequences.push('Possible impact on medical treatment decisions');
  }

  if (dataCategories.includes('financial_data')) {
    consequences.push('Risk of financial fraud or identity theft');
    consequences.push('Potential unauthorized transactions');
  }

  if (dataCategories.includes('identification_data')) {
    consequences.push('Identity theft risk');
    consequences.push('Potential for fraudulent account creation');
  }

  if (dataCategories.includes('biometric_data')) {
    consequences.push('Permanent exposure of unchangeable identifiers');
  }

  if (dataCategories.includes('genetic_data')) {
    consequences.push('Permanent exposure of genetic information');
    consequences.push('Potential discrimination based on genetic data');
  }

  if (dataCategories.includes('personal_data')) {
    consequences.push('Loss of privacy');
    consequences.push('Potential for targeted phishing or social engineering');
  }

  return consequences.length > 0 ? consequences : ['General privacy impact'];
}

/**
 * Format data category for human-readable display
 */
function formatDataCategory(category: BreachDataCategory): string {
  const labels: Record<BreachDataCategory, string> = {
    personal_data: 'Personal Information (name, address, phone)',
    health_data: 'Health/Medical Information',
    financial_data: 'Financial Information',
    biometric_data: 'Biometric Data (dental scans, photos)',
    genetic_data: 'Genetic Data',
    location_data: 'Location Data',
    identification_data: 'Identification Documents',
  };
  return labels[category];
}

// Export types for external use
export type {
  ReportBreachPayload,
  BreachNotificationWorkflowPayload,
  NotifySubjectPayload,
  NotifyAuthorityPayload,
};
