import { schedules, logger } from '@trigger.dev/sdk/v3';
import {
  getClients,
  getSupabaseClient,
  generateCorrelationId,
  almostTwoYearsAgo,
  processBatch,
  emitJobEvent,
  type HubSpotContactResult,
} from './cron-shared.js';

/**
 * GDPR-related cron jobs
 * - Consent audit
 * - Hard deletion executor
 * - DSR due date monitor
 * - Article 30 report generation
 * - Article 30 quarterly report
 */

// ============================================
// GDPR Consent Audit
// ============================================

/**
 * GDPR consent audit - checks for consent expiry
 * Runs every day at 4:00 AM
 */
export const gdprConsentAudit = schedules.task({
  id: 'gdpr-consent-audit',
  cron: '0 4 * * *', // 4:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting GDPR consent audit', { correlationId });

    const { hubspot, whatsapp, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping consent audit', { correlationId });
      return { success: false, reason: 'HubSpot not configured', consentRenewalsSent: 0 };
    }

    let consentRenewalsSent = 0;
    let errors = 0;

    try {
      // Find contacts with consent expiring (approaching 2 years)
      const expiringConsent = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'consent_date', operator: 'LT', value: almostTwoYearsAgo() },
              { propertyName: 'consent_marketing', operator: 'EQ', value: 'true' },
            ],
          },
        ],
        properties: [
          'phone',
          'email',
          'firstname',
          'consent_date',
          'hs_language',
          'consent_renewal_sent',
        ],
        limit: 50,
      });

      logger.info(`Found ${expiringConsent.total} contacts with expiring consent`, {
        correlationId,
      });

      // Filter contacts that need consent renewal
      const contactsNeedingRenewal = (expiringConsent.results as HubSpotContactResult[]).filter(
        (contact) => {
          return contact.properties.phone && !contact.properties.consent_renewal_sent;
        }
      );

      // Process contacts in batches
      const batchResult = await processBatch(
        contactsNeedingRenewal,
        async (contact) => {
          const props = contact.properties;

          // Send consent renewal request via WhatsApp
          if (whatsapp) {
            const contactLang = props.hs_language;
            const language: 'ro' | 'en' | 'de' =
              contactLang === 'ro' || contactLang === 'en' || contactLang === 'de'
                ? contactLang
                : 'ro';
            await whatsapp.sendTemplate({
              to: props.phone!,
              templateName: 'consent_renewal',
              language: language === 'ro' ? 'ro' : language === 'de' ? 'de' : 'en',
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: props.firstname ?? 'Pacient' }],
                },
              ],
            });
          }

          // Mark consent renewal as sent
          await hubspot.updateContact(contact.id, {
            consent_renewal_sent: new Date().toISOString(),
          });

          logger.info('Sent consent renewal', { contactId: contact.id, correlationId });
        },
        logger
      );

      consentRenewalsSent = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors
      for (const { item, error } of batchResult.errors) {
        const c = item;
        logger.error('Failed to send consent renewal', {
          contactId: c.id,
          error,
          correlationId,
        });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.gdpr_consent_audit.completed', {
        expiringFound: expiringConsent.total,
        consentRenewalsSent,
        errors,
        correlationId,
      });

      logger.info('GDPR consent audit completed', { consentRenewalsSent, errors, correlationId });
    } catch (error) {
      logger.error('GDPR consent audit failed', { error, correlationId });
      return { success: false, error: String(error), consentRenewalsSent };
    }

    return { success: true, consentRenewalsSent, errors };
  },
});

// ============================================
// GDPR Hard Deletion Executor
// ============================================

/**
 * GDPR Hard Deletion Executor - permanently deletes data past retention period
 * Runs every day at 3:30 AM
 *
 * CRITICAL: This job executes permanent data deletion for GDPR Article 17 compliance.
 */
export const gdprHardDeletionExecutor = schedules.task({
  id: 'gdpr-hard-deletion-executor',
  cron: '30 3 * * *', // 3:30 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting GDPR hard deletion executor', { correlationId });

    const { eventStore } = getClients();
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      logger.warn('DATABASE_URL not configured, skipping hard deletion', { correlationId });
      return { success: false, reason: 'Database not configured', deletionsProcessed: 0 };
    }

    let deletionsProcessed = 0;
    let deletionsFailed = 0;
    const errors: { entityType: string; entityId: string; error: string }[] = [];

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured', { correlationId, error: supabaseError });
        return { success: false, reason: 'Supabase not configured', deletionsProcessed: 0 };
      }

      // Get scheduled deletions that are due
      const { data: pendingDeletions, error: fetchError } = await supabase
        .from('scheduled_deletions')
        .select('*')
        .is('executed_at', null)
        .lte('scheduled_for', new Date().toISOString())
        .limit(100);

      if (fetchError) {
        throw new Error(`Failed to fetch pending deletions: ${fetchError.message}`);
      }

      interface ScheduledDeletion {
        id: string;
        entity_type: string;
        entity_id: string;
        scheduled_for: string;
        reason: string | null;
        executed_at: string | null;
        created_at: string;
      }

      const deletions = pendingDeletions as ScheduledDeletion[] | null;
      if (!deletions || deletions.length === 0) {
        logger.info('No pending deletions to process', { correlationId });
        return { success: true, deletionsProcessed: 0, message: 'No pending deletions' };
      }
      logger.info(`Found ${deletions.length} deletions to process`, { correlationId });

      // Table mapping for entity types
      const tableMap: Record<string, string> = {
        lead: 'leads',
        patient_record: 'patients',
        consent: 'consents',
        message: 'message_log',
        appointment: 'appointments',
        subject_data: 'leads',
        consent_records: 'consent_records',
        lead_scoring_history: 'lead_scoring_history',
      };

      // Process each deletion
      for (const deletion of deletions) {
        try {
          const tableName = tableMap[deletion.entity_type] ?? deletion.entity_type;

          // Execute hard delete
          const { error: deleteError } = await supabase
            .from(tableName)
            .delete()
            .eq('id', deletion.entity_id);

          if (deleteError) {
            throw new Error(deleteError.message);
          }

          // Mark deletion as executed
          await supabase
            .from('scheduled_deletions')
            .update({ executed_at: new Date().toISOString() })
            .eq('id', deletion.id);

          deletionsProcessed++;

          logger.info('Hard deletion executed', {
            entityType: deletion.entity_type,
            entityId: deletion.entity_id,
            reason: deletion.reason,
            correlationId,
          });
        } catch (error) {
          deletionsFailed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            entityType: deletion.entity_type,
            entityId: deletion.entity_id,
            error: errorMessage,
          });

          logger.error('Hard deletion failed', {
            entityType: deletion.entity_type,
            entityId: deletion.entity_id,
            error: errorMessage,
            correlationId,
          });
        }
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.gdpr_hard_deletion.completed', {
        deletionsProcessed,
        deletionsFailed,
        errorsCount: errors.length,
        correlationId,
      });

      logger.info('GDPR hard deletion executor completed', {
        deletionsProcessed,
        deletionsFailed,
        correlationId,
      });
    } catch (error) {
      logger.error('GDPR hard deletion executor failed', { error, correlationId });

      await emitJobEvent(eventStore, 'cron.gdpr_hard_deletion.failed', {
        error: String(error),
        correlationId,
      });

      return { success: false, error: String(error), deletionsProcessed };
    }

    return {
      success: deletionsFailed === 0,
      deletionsProcessed,
      deletionsFailed,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});

// ============================================
// DSR Due Date Monitor
// ============================================

/**
 * DSR Due Date Monitor - alerts on overdue data subject requests
 * Runs every day at 8:00 AM
 *
 * GDPR requires response to DSRs within 30 days.
 */
export const dsrDueDateMonitor = schedules.task({
  id: 'dsr-due-date-monitor',
  cron: '0 8 * * *', // 8:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting DSR due date monitor', { correlationId });

    const { eventStore } = getClients();

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured', { correlationId, error: supabaseError });
        return { success: false, reason: 'Supabase not configured' };
      }

      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      // Get overdue DSRs
      const { data: overdueDSRs } = await supabase
        .from('data_subject_requests')
        .select('*')
        .not('status', 'in', '("completed","rejected","cancelled")')
        .lt('due_date', now.toISOString());

      // Get DSRs due within 3 days
      const { data: approachingDSRs } = await supabase
        .from('data_subject_requests')
        .select('*')
        .not('status', 'in', '("completed","rejected","cancelled")')
        .gte('due_date', now.toISOString())
        .lte('due_date', threeDaysFromNow.toISOString());

      const overdueCount = overdueDSRs?.length ?? 0;
      const approachingCount = approachingDSRs?.length ?? 0;

      // Log alerts
      if (overdueCount > 0) {
        logger.error('GDPR ALERT: Overdue DSRs detected', {
          overdueCount,
          requests: overdueDSRs?.map(
            (r: { id: string; request_type: string; due_date: string }) => ({
              id: r.id,
              type: r.request_type,
              dueDate: r.due_date,
            })
          ),
          correlationId,
        });
      }

      if (approachingCount > 0) {
        logger.warn('DSRs approaching due date', {
          approachingCount,
          requests: approachingDSRs?.map(
            (r: { id: string; request_type: string; due_date: string }) => ({
              id: r.id,
              type: r.request_type,
              dueDate: r.due_date,
            })
          ),
          correlationId,
        });
      }

      // Emit monitoring event
      await emitJobEvent(eventStore, 'cron.dsr_monitor.completed', {
        overdueCount,
        approachingCount,
        correlationId,
      });

      logger.info('DSR due date monitor completed', {
        overdueCount,
        approachingCount,
        correlationId,
      });

      return {
        success: true,
        overdueCount,
        approachingCount,
      };
    } catch (error) {
      logger.error('DSR due date monitor failed', { error, correlationId });
      return { success: false, error: String(error) };
    }
  },
});

// ============================================
// GDPR Article 30 Report Generation
// ============================================

/**
 * GDPR Article 30 Report Generation - generates Records of Processing Activities reports
 * Runs on the 1st of every month at 5:00 AM
 *
 * L10: Automated Compliance Reporting
 */
export const gdprArticle30ReportGeneration = schedules.task({
  id: 'gdpr-article30-report-generation',
  cron: '0 5 1 * *', // 5:00 AM on the 1st of every month
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting GDPR Article 30 report generation', { correlationId });

    const { eventStore } = getClients();

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured, skipping Article 30 report', {
          correlationId,
          error: supabaseError,
        });
        return { success: false, reason: 'Supabase not configured' };
      }

      // Dynamic import for the report service
      const { createArticle30ReportService } = await import('@medicalcor/core');

      // Get controller information from environment
      const controllerInfo = {
        name: process.env.ORGANIZATION_NAME ?? 'MedicalCor',
        address: process.env.ORGANIZATION_ADDRESS ?? '',
        country: process.env.ORGANIZATION_COUNTRY ?? 'RO',
        email: process.env.DPO_EMAIL ?? 'dpo@medicalcor.com',
        phone: process.env.DPO_PHONE,
        dpoName: process.env.DPO_NAME,
        dpoEmail: process.env.DPO_EMAIL,
        dpoPhone: process.env.DPO_PHONE,
      };

      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      const reportService = createArticle30ReportService({
        supabase,
        controller: controllerInfo,
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */

      // Calculate report period (previous month)
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);

      // Generate the report
      const report = await reportService.generateReport({
        periodStart,
        periodEnd,
        frequency: 'monthly',
        includeConsentSummary: true,
        includeDSRSummary: true,
        includeDataBreaches: true,
        correlationId,
      });

      logger.info('GDPR Article 30 report generated', {
        reportId: report.reportId,
        version: report.version,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        totalActivities: report.statistics.totalActivities,
        activitiesWithTransfers: report.statistics.activitiesWithTransfers,
        activitiesNeedingReview: report.statistics.activitiesNeedingReview,
        correlationId,
      });

      // Emit report generated event
      await emitJobEvent(eventStore, 'gdpr.article30_report_generated', {
        reportId: report.reportId,
        version: report.version,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        status: report.status,
        totalActivities: report.statistics.totalActivities,
        uniqueDataCategories: report.statistics.uniqueDataCategories,
        uniqueRecipients: report.statistics.uniqueRecipients,
        activitiesWithTransfers: report.statistics.activitiesWithTransfers,
        activitiesRequiringDPIA: report.statistics.activitiesRequiringDPIA,
        activitiesNeedingReview: report.statistics.activitiesNeedingReview,
        consentSummaryCount: report.consentSummary.length,
        dsrReceived: report.dsrSummary?.totalReceived ?? 0,
        dsrCompleted: report.dsrSummary?.completed ?? 0,
        dsrOverdue: report.dsrSummary?.overdue ?? 0,
        dataBreaches: report.dataBreachSummary?.totalBreaches ?? 0,
        correlationId,
      });

      // Check for compliance alerts
      if (report.statistics.activitiesNeedingReview > 0) {
        logger.warn('GDPR ALERT: Processing activities need review', {
          activitiesNeedingReview: report.statistics.activitiesNeedingReview,
          correlationId,
        });
      }

      if (report.dsrSummary && report.dsrSummary.overdue > 0) {
        logger.error('GDPR ALERT: Overdue DSRs detected in report period', {
          overdueCount: report.dsrSummary.overdue,
          correlationId,
        });
      }

      if (report.dataBreachSummary && report.dataBreachSummary.totalBreaches > 0) {
        logger.warn('Data breaches recorded in report period', {
          totalBreaches: report.dataBreachSummary.totalBreaches,
          reportedToAuthority: report.dataBreachSummary.reportedToAuthority,
          notifiedToSubjects: report.dataBreachSummary.notifiedToSubjects,
          correlationId,
        });
      }

      await emitJobEvent(eventStore, 'cron.gdpr_article30_report.completed', {
        reportId: report.reportId,
        version: report.version,
        totalActivities: report.statistics.totalActivities,
        correlationId,
      });

      logger.info('GDPR Article 30 report generation completed', {
        reportId: report.reportId,
        correlationId,
      });

      return {
        success: true,
        reportId: report.reportId,
        version: report.version,
        totalActivities: report.statistics.totalActivities,
        status: report.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('GDPR Article 30 report generation failed', {
        error: errorMessage,
        correlationId,
      });

      await emitJobEvent(eventStore, 'cron.gdpr_article30_report.failed', {
        error: errorMessage,
        correlationId,
      });

      return { success: false, error: errorMessage };
    }
  },
});

// ============================================
// GDPR Article 30 Quarterly Report
// ============================================

/**
 * GDPR Article 30 Quarterly Report - comprehensive quarterly compliance report
 * Runs on the 1st of January, April, July, October at 6:00 AM
 */
export const gdprArticle30QuarterlyReport = schedules.task({
  id: 'gdpr-article30-quarterly-report',
  cron: '0 6 1 1,4,7,10 *', // 6:00 AM on 1st of Jan, Apr, Jul, Oct
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting GDPR Article 30 quarterly report generation', { correlationId });

    const { eventStore } = getClients();

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured', { correlationId, error: supabaseError });
        return { success: false, reason: 'Supabase not configured' };
      }

      const { createArticle30ReportService } = await import('@medicalcor/core');

      const controllerInfo = {
        name: process.env.ORGANIZATION_NAME ?? 'MedicalCor',
        address: process.env.ORGANIZATION_ADDRESS ?? '',
        country: process.env.ORGANIZATION_COUNTRY ?? 'RO',
        email: process.env.DPO_EMAIL ?? 'dpo@medicalcor.com',
        dpoName: process.env.DPO_NAME,
        dpoEmail: process.env.DPO_EMAIL,
      };

      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      const reportService = createArticle30ReportService({
        supabase,
        controller: controllerInfo,
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */

      // Calculate quarterly period (previous 3 months)
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() - 2, 1);

      const report = await reportService.generateReport({
        periodStart,
        periodEnd,
        title: `GDPR Article 30 Quarterly RoPA Report - Q${Math.ceil(periodEnd.getMonth() / 3)} ${periodEnd.getFullYear()}`,
        frequency: 'quarterly',
        includeConsentSummary: true,
        includeDSRSummary: true,
        includeDataBreaches: true,
        correlationId,
      });

      logger.info('GDPR Article 30 quarterly report generated', {
        reportId: report.reportId,
        version: report.version,
        quarter: `Q${Math.ceil(periodEnd.getMonth() / 3)}`,
        year: periodEnd.getFullYear(),
        totalActivities: report.statistics.totalActivities,
        correlationId,
      });

      await emitJobEvent(eventStore, 'gdpr.article30_quarterly_report_generated', {
        reportId: report.reportId,
        version: report.version,
        quarter: `Q${Math.ceil(periodEnd.getMonth() / 3)}`,
        year: periodEnd.getFullYear(),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        status: report.status,
        statistics: report.statistics,
        correlationId,
      });

      return {
        success: true,
        reportId: report.reportId,
        version: report.version,
        quarter: `Q${Math.ceil(periodEnd.getMonth() / 3)}`,
        totalActivities: report.statistics.totalActivities,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('GDPR Article 30 quarterly report generation failed', {
        error: errorMessage,
        correlationId,
      });

      await emitJobEvent(eventStore, 'cron.gdpr_article30_quarterly_report.failed', {
        error: errorMessage,
        correlationId,
      });

      return { success: false, error: errorMessage };
    }
  },
});
