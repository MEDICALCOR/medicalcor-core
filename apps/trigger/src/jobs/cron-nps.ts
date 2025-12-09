import { schedules, logger } from '@trigger.dev/sdk/v3';
import { IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { npsCollectionWorkflow } from '../workflows/nps-collection.js';
import {
  getClients,
  getSupabaseClient,
  generateCorrelationId,
  processBatch,
  emitJobEvent,
  hasValidConsent,
  logConsentDenied,
  type HubSpotContactResult,
} from './cron-shared.js';

/**
 * NPS-related cron jobs
 * - Post-appointment survey trigger
 * - Survey expiry check
 * - Follow-up reminder
 */

// ============================================
// NPS Post-Appointment Survey
// ============================================

/**
 * NPS Post-Appointment Survey - triggers NPS surveys after completed appointments
 * Runs every hour to check for recently completed appointments
 *
 * GDPR: Only sends surveys to patients with treatment_updates or marketing consent
 */
export const npsPostAppointmentSurvey = schedules.task({
  id: 'nps-post-appointment-survey',
  cron: '0 * * * *', // Every hour
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting NPS post-appointment survey check', { correlationId });

    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping NPS survey check', { correlationId });
      return { success: false, reason: 'HubSpot not configured', surveysTriggered: 0 };
    }

    let surveysTriggered = 0;
    let surveysSkipped = 0;
    let errors = 0;

    try {
      // Find patients with appointments completed in the last 2 hours
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);

      // Search for contacts with recent completed appointments
      // GDPR: Filter for consent at query level
      const recentAppointments = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'last_appointment_completed_at',
                operator: 'GTE',
                value: twoHoursAgo.getTime().toString(),
              },
              {
                propertyName: 'last_appointment_completed_at',
                operator: 'LTE',
                value: oneHourAgo.getTime().toString(),
              },
              {
                propertyName: 'consent_treatment_updates',
                operator: 'EQ',
                value: 'true',
              },
            ],
          },
          // Alternative: marketing consent
          {
            filters: [
              {
                propertyName: 'last_appointment_completed_at',
                operator: 'GTE',
                value: twoHoursAgo.getTime().toString(),
              },
              {
                propertyName: 'last_appointment_completed_at',
                operator: 'LTE',
                value: oneHourAgo.getTime().toString(),
              },
              {
                propertyName: 'consent_marketing',
                operator: 'EQ',
                value: 'true',
              },
            ],
          },
        ],
        properties: [
          'phone',
          'firstname',
          'last_appointment_id',
          'last_appointment_procedure',
          'nps_last_survey_sent',
          'hs_language',
          'consent_treatment_updates',
          'consent_marketing',
        ],
        limit: 50,
      });

      logger.info(`Found ${recentAppointments.total} contacts with recent completed appointments`, {
        correlationId,
      });

      // Filter contacts that are eligible for NPS survey
      const eligibleContacts = (recentAppointments.results as HubSpotContactResult[]).filter(
        (contact) => {
          // Must have phone
          if (!contact.properties.phone) {
            return false;
          }

          // Check if we recently sent an NPS survey (30-day cooldown)
          const lastSurveySent = contact.properties.nps_last_survey_sent;
          if (lastSurveySent) {
            const daysSinceLastSurvey = Math.floor(
              (Date.now() - new Date(lastSurveySent).getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysSinceLastSurvey < 30) {
              return false;
            }
          }

          // GDPR consent check
          if (!hasValidConsent(contact, 'treatment_updates')) {
            if (contact.properties.consent_marketing !== 'true') {
              logConsentDenied(contact.id, 'treatment_updates', correlationId);
              return false;
            }
          }

          return true;
        }
      );

      surveysSkipped =
        (recentAppointments.results as HubSpotContactResult[]).length - eligibleContacts.length;

      // Process eligible contacts in batches
      const todayStr = getTodayString();
      const batchResult = await processBatch(
        eligibleContacts,
        async (contact) => {
          const props = contact.properties;
          const hsLang = props.hs_language;
          const language: 'ro' | 'en' | 'de' =
            hsLang === 'ro' || hsLang === 'en' || hsLang === 'de' ? hsLang : 'ro';

          await npsCollectionWorkflow.trigger(
            {
              phone: props.phone!,
              hubspotContactId: contact.id,
              triggerType: 'post_appointment',
              appointmentId: props.last_appointment_id,
              procedureType: props.last_appointment_procedure,
              channel: 'whatsapp',
              language,
              delayMinutes: 60, // Send 1 hour after this job runs
              correlationId: `${correlationId}_${contact.id}`,
            },
            {
              idempotencyKey: IdempotencyKeys.cronJobItem(
                'nps-post-appointment',
                todayStr,
                contact.id
              ),
            }
          );

          logger.info('Triggered NPS survey for contact', {
            contactId: contact.id,
            phone: props.phone,
            correlationId,
          });
        },
        logger
      );

      surveysTriggered = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors
      for (const { item, error } of batchResult.errors) {
        logger.error('Failed to trigger NPS survey', {
          contactId: item.id,
          error,
          correlationId,
        });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.nps_post_appointment.completed', {
        contactsFound: recentAppointments.total,
        surveysTriggered,
        surveysSkipped,
        errors,
        correlationId,
      });

      logger.info('NPS post-appointment survey check completed', {
        surveysTriggered,
        surveysSkipped,
        errors,
        correlationId,
      });
    } catch (error) {
      logger.error('NPS post-appointment survey check failed', { error, correlationId });

      await emitJobEvent(eventStore, 'cron.nps_post_appointment.failed', {
        error: String(error),
        correlationId,
      });

      return { success: false, error: String(error), surveysTriggered };
    }

    return { success: true, surveysTriggered, surveysSkipped, errors };
  },
});

// ============================================
// NPS Survey Expiry Check
// ============================================

/**
 * NPS Survey Expiry Check - expires surveys that haven't been responded to
 * Runs every day at 6:00 AM
 */
export const npsSurveyExpiryCheck = schedules.task({
  id: 'nps-survey-expiry-check',
  cron: '0 6 * * *', // 6:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting NPS survey expiry check', { correlationId });

    const { eventStore } = getClients();

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured', { correlationId, error: supabaseError });
        return { success: false, reason: 'Supabase not configured' };
      }

      // Find expired surveys
      const now = new Date();
      const { data: expiredSurveys, error } = await supabase
        .from('nps_surveys')
        .update({
          status: 'expired',
          expired_at: now.toISOString(),
        })
        .eq('status', 'sent')
        .lt('expires_at', now.toISOString())
        .select('id, phone, hubspot_contact_id, trigger_type, channel, sent_at');

      if (error) {
        throw new Error(`Failed to update expired surveys: ${error.message}`);
      }

      const expiredCount = expiredSurveys?.length ?? 0;

      // Emit expiry events
      for (const survey of expiredSurveys ?? []) {
        await emitJobEvent(eventStore, 'nps.survey_expired', {
          surveyId: survey.id,
          phone: survey.phone,
          hubspotContactId: survey.hubspot_contact_id,
          triggerType: survey.trigger_type,
          channel: survey.channel,
          sentAt: survey.sent_at,
          expiredAt: now.toISOString(),
          reason: 'timeout',
          correlationId,
        });
      }

      // Refresh daily aggregates for yesterday
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      await supabase.rpc('refresh_nps_daily_aggregate', { p_date: yesterdayStr });

      logger.info('NPS survey expiry check completed', {
        expiredCount,
        correlationId,
      });

      await emitJobEvent(eventStore, 'cron.nps_expiry_check.completed', {
        expiredCount,
        correlationId,
      });

      return { success: true, expiredCount };
    } catch (error) {
      logger.error('NPS survey expiry check failed', { error, correlationId });
      return { success: false, error: String(error) };
    }
  },
});

// ============================================
// NPS Follow-Up Reminder
// ============================================

/**
 * NPS Follow-Up Reminder - reminds about pending NPS follow-ups
 * Runs every day at 9:00 AM
 */
export const npsFollowUpReminder = schedules.task({
  id: 'nps-follow-up-reminder',
  cron: '0 9 * * *', // 9:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting NPS follow-up reminder check', { correlationId });

    const { eventStore } = getClients();

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured', { correlationId, error: supabaseError });
        return { success: false, reason: 'Supabase not configured' };
      }

      // Get pending follow-ups
      const { data: pendingFollowUps } = await supabase
        .from('nps_surveys')
        .select('id, phone, hubspot_contact_id, score, feedback, follow_up_priority, responded_at')
        .eq('requires_follow_up', true)
        .is('follow_up_completed_at', null)
        .order('follow_up_priority', { ascending: true })
        .limit(50);

      const pendingCount = pendingFollowUps?.length ?? 0;

      // Count by priority
      const criticalCount =
        pendingFollowUps?.filter((f) => f.follow_up_priority === 'critical').length ?? 0;
      const highCount =
        pendingFollowUps?.filter((f) => f.follow_up_priority === 'high').length ?? 0;

      if (criticalCount > 0) {
        logger.error('ALERT: Critical NPS follow-ups pending', {
          criticalCount,
          pendingCount,
          correlationId,
        });
      } else if (highCount > 0) {
        logger.warn('High priority NPS follow-ups pending', {
          highCount,
          pendingCount,
          correlationId,
        });
      }

      await emitJobEvent(eventStore, 'cron.nps_follow_up_reminder.completed', {
        pendingCount,
        criticalCount,
        highCount,
        correlationId,
      });

      logger.info('NPS follow-up reminder check completed', {
        pendingCount,
        criticalCount,
        highCount,
        correlationId,
      });

      return { success: true, pendingCount, criticalCount, highCount };
    } catch (error) {
      logger.error('NPS follow-up reminder check failed', { error, correlationId });
      return { success: false, error: String(error) };
    }
  },
});
