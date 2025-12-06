import { schedules, logger } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';
import {
  createEventStore,
  createInMemoryEventStore,
  IdempotencyKeys,
  getTodayString,
} from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { nurtureSequenceWorkflow } from '../workflows/patient-journey.js';
import { scoreLeadWorkflow } from '../workflows/lead-scoring.js';

/**
 * HubSpot contact search result type
 */
interface HubSpotContactResult {
  id: string;
  properties: Record<string, string | undefined>;
}

/**
 * Scheduled Jobs (Cron)
 * Recurring tasks for automation
 */

// ============================================
// Client Initialization
// ============================================

function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  // Use shared client factory
  const clients = createIntegrationClients({
    source: 'cron-jobs',
    includeScheduling: true,
  });

  const eventStore = databaseUrl
    ? createEventStore({ source: 'cron-jobs', connectionString: databaseUrl })
    : createInMemoryEventStore('cron-jobs');

  return {
    hubspot: clients.hubspot,
    whatsapp: clients.whatsapp,
    scheduling: clients.scheduling,
    eventStore,
  };
}

// ============================================
// GDPR Consent Verification
// ============================================

/**
 * Consent types supported by the system
 */
type ConsentType = 'marketing' | 'appointment_reminders' | 'treatment_updates' | 'data_processing';

/**
 * CRITICAL GDPR FIX: Helper function to verify contact has valid consent
 * Returns true only if the contact has explicitly consented to the specified type
 *
 * @param contact - HubSpot contact with properties
 * @param consentType - Type of consent to check
 * @returns true if contact has valid consent, false otherwise
 */
function hasValidConsent(contact: HubSpotContactResult, consentType: ConsentType): boolean {
  const props = contact.properties;

  // Check specific consent property first
  const specificConsentProp = `consent_${consentType}`;
  if (props[specificConsentProp] === 'true') {
    return true;
  }

  // For appointment_reminders, also accept treatment_updates consent
  if (consentType === 'appointment_reminders' && props.consent_treatment_updates === 'true') {
    return true;
  }

  // Do NOT fall back to general marketing consent for medical communications
  // This would violate GDPR's principle of specific consent

  return false;
}

/**
 * Log consent check failure for audit trail
 */
function logConsentDenied(
  contactId: string,
  consentType: ConsentType,
  correlationId: string
): void {
  logger.info('Message not sent - consent not granted', {
    contactId,
    consentType,
    correlationId,
    reason: 'GDPR_CONSENT_MISSING',
  });
}

// ============================================
// Batch Processing Constants
// ============================================

/**
 * Batch size for parallel API calls
 * Prevents overwhelming external services while improving throughput
 */
const BATCH_SIZE = 10;

/**
 * Retry configuration for batch item processing
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Execute a function with exponential backoff retry
 * @param fn - Async function to execute
 * @param maxRetries - Maximum retry attempts
 * @param baseDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Result of the function
 */
async function withExponentialRetry<T>(
  fn: () => Promise<T>,
  maxRetries = RETRY_CONFIG.maxRetries,
  baseDelayMs = RETRY_CONFIG.baseDelayMs,
  maxDelayMs = RETRY_CONFIG.maxDelayMs
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      if (!isRetryable) {
        break;
      }

      // SECURITY: Use crypto-secure randomness for jitter calculation
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const randomBytes = new Uint32Array(1);
      crypto.getRandomValues(randomBytes);
      const jitter = (randomBytes[0]! / 0xffffffff) * 0.3 * exponentialDelay; // 30% jitter
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on network errors, rate limits, and server errors
    if (message.includes('rate_limit') || message.includes('429')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('502') || message.includes('503') || message.includes('504')) return true;
    if (message.includes('network') || message.includes('econnreset')) return true;
    if (message.includes('socket hang up')) return true;
  }
  return false;
}

/**
 * Process items in batches using Promise.allSettled for resilience
 * CRITICAL FIX: Now includes exponential backoff retry for individual items
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param loggerInstance - Logger for batch progress
 * @param options - Processing options
 * @returns Object with success count and errors array
 */
async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  loggerInstance: { info: (msg: string, meta?: Record<string, unknown>) => void },
  options: {
    enableRetry?: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
  } = {}
): Promise<{ successes: number; errors: { item: T; error: unknown }[] }> {
  const {
    enableRetry = true,
    maxRetries = RETRY_CONFIG.maxRetries,
    baseDelayMs = RETRY_CONFIG.baseDelayMs,
  } = options;

  let successes = 0;
  const errors: { item: T; error: unknown }[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    loggerInstance.info(`Processing batch ${batchNum}/${totalBatches}`, {
      batchSize: batch.length,
    });

    // Wrap processor with retry logic if enabled
    const processWithRetry = enableRetry
      ? (item: T) => withExponentialRetry(() => processor(item), maxRetries, baseDelayMs)
      : processor;

    const results = await Promise.allSettled(batch.map(processWithRetry));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result?.status === 'fulfilled') {
        successes++;
      } else if (result?.status === 'rejected') {
        errors.push({ item: batch[j] as T, error: result.reason });
      }
    }
  }

  return { successes, errors };
}

// ============================================
// Date Helper Functions
// ============================================

function generateCorrelationId(): string {
  return `cron_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function sixMonthsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return date.getTime().toString();
}

function sevenDaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.getTime().toString();
}

function ninetyDaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.getTime().toString();
}

function almostTwoYearsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 23); // 23 months = almost 2 years
  return date.getTime().toString();
}

function isIn24Hours(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours > 23 && diffHours <= 25; // 23-25 hours window
}

function isIn2Hours(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours > 1.5 && diffHours <= 2.5; // 1.5-2.5 hours window
}

function formatDate(dateStr: string, language: 'ro' | 'en' | 'de' = 'ro'): string {
  const date = new Date(dateStr);
  const formatters: Record<string, Intl.DateTimeFormat> = {
    ro: new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' }),
    en: new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }),
    de: new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
  return formatters[language]?.format(date) ?? date.toLocaleDateString();
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// Cron Jobs
// ============================================

/**
 * Daily recall check - finds patients due for follow-up
 * Runs every day at 9:00 AM
 */
export const dailyRecallCheck = schedules.task({
  id: 'daily-recall-check',
  cron: '0 9 * * *', // 9:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting daily recall check', { correlationId });

    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping recall check', { correlationId });
      return { success: false, reason: 'HubSpot not configured', contactsProcessed: 0 };
    }

    let contactsProcessed = 0;
    let errors = 0;

    try {
      // Find contacts due for recall (last appointment > 6 months ago)
      const recallDueContacts = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'last_appointment_date', operator: 'LT', value: sixMonthsAgo() },
              { propertyName: 'consent_marketing', operator: 'EQ', value: 'true' },
              { propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' },
            ],
          },
        ],
        properties: ['phone', 'email', 'firstname', 'last_appointment_date'],
        limit: 100, // Process in batches
      });

      logger.info(`Found ${recallDueContacts.total} contacts due for recall`, { correlationId });

      // Filter contacts with valid phone numbers
      const contactsWithPhone = (recallDueContacts.results as HubSpotContactResult[]).filter(
        (contact) => {
          if (!contact.properties.phone) {
            logger.warn('Contact missing phone, skipping', {
              contactId: contact.id,
              correlationId,
            });
            return false;
          }
          return true;
        }
      );

      // Process contacts in batches for better performance
      const todayStr = getTodayString();
      const batchResult = await processBatch(
        contactsWithPhone,
        async (contact) => {
          await nurtureSequenceWorkflow.trigger(
            {
              phone: contact.properties.phone!,
              hubspotContactId: contact.id,
              sequenceType: 'recall',
              correlationId: `${correlationId}_${contact.id}`,
            },
            {
              idempotencyKey: IdempotencyKeys.recallCheck(contact.id, todayStr),
            }
          );
        },
        logger
      );

      contactsProcessed = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors for debugging
      for (const { item, error } of batchResult.errors) {
        const contact = item;
        logger.error('Failed to trigger recall sequence', {
          contactId: contact.id,
          error,
          correlationId,
        });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.daily_recall_check.completed', {
        contactsFound: recallDueContacts.total,
        contactsProcessed,
        errors,
        correlationId,
      });

      logger.info('Daily recall check completed', { contactsProcessed, errors, correlationId });
    } catch (error) {
      logger.error('Daily recall check failed', { error, correlationId });
      return { success: false, error: String(error), contactsProcessed };
    }

    return { success: true, contactsProcessed, errors };
  },
});

/**
 * Appointment reminder - sends reminders for upcoming appointments
 * Runs every hour
 */
export const appointmentReminders = schedules.task({
  id: 'appointment-reminders',
  cron: '0 * * * *', // Every hour
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting appointment reminder check', { correlationId });

    const { hubspot, whatsapp, eventStore } = getClients();

    if (!whatsapp) {
      logger.warn('WhatsApp client not configured, skipping reminders', { correlationId });
      return { success: false, reason: 'WhatsApp not configured' };
    }

    let reminders24hSent = 0;
    let reminders2hSent = 0;
    let errors = 0;

    try {
      // Find contacts with appointments in the next 24 hours
      // We use HubSpot's next_appointment_date property
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // CRITICAL GDPR FIX: Only send reminders to contacts who have explicitly consented
      // to appointment reminders or treatment updates (GDPR requires specific consent)
      // DO NOT fall back to general marketing consent for medical communications
      const upcomingAppointments = await hubspot?.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'next_appointment_date',
                operator: 'GTE',
                value: now.getTime().toString(),
              },
              {
                propertyName: 'next_appointment_date',
                operator: 'LTE',
                value: in24Hours.getTime().toString(),
              },
              // GDPR CONSENT CHECK: Must have specific appointment_reminders consent
              {
                propertyName: 'consent_appointment_reminders',
                operator: 'EQ',
                value: 'true',
              },
            ],
          },
          // Alternative: Accept treatment_updates consent (related to appointments)
          {
            filters: [
              {
                propertyName: 'next_appointment_date',
                operator: 'GTE',
                value: now.getTime().toString(),
              },
              {
                propertyName: 'next_appointment_date',
                operator: 'LTE',
                value: in24Hours.getTime().toString(),
              },
              {
                propertyName: 'consent_treatment_updates',
                operator: 'EQ',
                value: 'true',
              },
            ],
          },
        ],
        properties: [
          'phone',
          'firstname',
          'next_appointment_date',
          'appointment_procedure',
          'reminder_24h_sent',
          'reminder_2h_sent',
          'hs_language',
          'consent_appointment_reminders',
          'consent_marketing',
        ],
        limit: 100,
      });

      if (!upcomingAppointments) {
        logger.warn('No HubSpot client to fetch appointments', { correlationId });
        return { success: false, reason: 'HubSpot not configured' };
      }

      logger.info(`Found ${upcomingAppointments.total} appointments in next 24 hours`, {
        correlationId,
      });

      // GDPR FIX: Filter contacts with valid data AND verified consent
      const validContacts = (upcomingAppointments.results as HubSpotContactResult[]).filter(
        (contact) => {
          // Must have phone and appointment date
          if (!contact.properties.phone || !contact.properties.next_appointment_date) {
            return false;
          }

          // CRITICAL: Verify consent for appointment reminders
          if (!hasValidConsent(contact, 'appointment_reminders')) {
            logConsentDenied(contact.id, 'appointment_reminders', correlationId);
            return false;
          }

          return true;
        }
      );

      // Separate contacts into 24h and 2h reminder groups
      const contacts24h = validContacts.filter((contact) => {
        return (
          isIn24Hours(contact.properties.next_appointment_date!) &&
          contact.properties.reminder_24h_sent !== 'true'
        );
      });

      const contacts2h = validContacts.filter((contact) => {
        return (
          isIn2Hours(contact.properties.next_appointment_date!) &&
          contact.properties.reminder_2h_sent !== 'true'
        );
      });

      // Process 24h reminders in batches
      if (contacts24h.length > 0) {
        logger.info(`Processing ${contacts24h.length} 24h reminders`, { correlationId });
        const batch24hResult = await processBatch(
          contacts24h,
          async (contact) => {
            const props = contact.properties;
            const appointmentDate = props.next_appointment_date!;
            const hsLang = props.hs_language;
            const language: 'ro' | 'en' | 'de' =
              hsLang === 'ro' || hsLang === 'en' || hsLang === 'de' ? hsLang : 'ro';

            await whatsapp.sendTemplate({
              to: props.phone!,
              templateName: 'appointment_reminder_24h',
              language: language === 'ro' ? 'ro' : language === 'de' ? 'de' : 'en',
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: props.firstname ?? 'Pacient' },
                    { type: 'text', text: formatDate(appointmentDate, language) },
                    { type: 'text', text: formatTime(appointmentDate) },
                  ],
                },
              ],
            });

            if (hubspot) {
              await hubspot.updateContact(contact.id, { reminder_24h_sent: 'true' });
            }
            logger.info('Sent 24h reminder', { contactId: contact.id, correlationId });
          },
          logger
        );
        reminders24hSent = batch24hResult.successes;
        errors += batch24hResult.errors.length;

        for (const { item, error } of batch24hResult.errors) {
          const c = item;
          logger.error('Failed to send 24h reminder', { contactId: c.id, error, correlationId });
        }
      }

      // Process 2h reminders in batches
      if (contacts2h.length > 0) {
        logger.info(`Processing ${contacts2h.length} 2h reminders`, { correlationId });
        const batch2hResult = await processBatch(
          contacts2h,
          async (contact) => {
            const props = contact.properties;
            const appointmentDate = props.next_appointment_date!;
            const hsLang = props.hs_language;
            const language: 'ro' | 'en' | 'de' =
              hsLang === 'ro' || hsLang === 'en' || hsLang === 'de' ? hsLang : 'ro';

            await whatsapp.sendTemplate({
              to: props.phone!,
              templateName: 'appointment_reminder_2h',
              language: language === 'ro' ? 'ro' : language === 'de' ? 'de' : 'en',
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: formatTime(appointmentDate) }],
                },
              ],
            });

            if (hubspot) {
              await hubspot.updateContact(contact.id, { reminder_2h_sent: 'true' });
            }
            logger.info('Sent 2h reminder', { contactId: contact.id, correlationId });
          },
          logger
        );
        reminders2hSent = batch2hResult.successes;
        errors += batch2hResult.errors.length;

        for (const { item, error } of batch2hResult.errors) {
          const c = item;
          logger.error('Failed to send 2h reminder', { contactId: c.id, error, correlationId });
        }
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.appointment_reminders.completed', {
        reminders24hSent,
        reminders2hSent,
        errors,
        correlationId,
      });

      logger.info('Appointment reminders completed', {
        reminders24hSent,
        reminders2hSent,
        errors,
        correlationId,
      });
    } catch (error) {
      logger.error('Appointment reminders failed', { error, correlationId });
      return { success: false, error: String(error) };
    }

    return { success: true, reminders24hSent, reminders2hSent, errors };
  },
});

/**
 * Lead scoring refresh - re-scores inactive leads
 * Runs every day at 2:00 AM
 */
export const leadScoringRefresh = schedules.task({
  id: 'lead-scoring-refresh',
  cron: '0 2 * * *', // 2:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting lead scoring refresh', { correlationId });

    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping scoring refresh', { correlationId });
      return { success: false, reason: 'HubSpot not configured', leadsRefreshed: 0 };
    }

    let leadsRefreshed = 0;
    let errors = 0;

    try {
      // Find leads that haven't been scored recently (7+ days)
      const staleLeads = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'lead_score_updated', operator: 'LT', value: sevenDaysAgo() },
              { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
              { propertyName: 'lead_status', operator: 'NEQ', value: 'archived' },
            ],
          },
        ],
        properties: [
          'phone',
          'email',
          'firstname',
          'lead_score',
          'lead_status',
          'last_message_content',
        ],
        limit: 50, // Process in smaller batches
      });

      logger.info(`Found ${staleLeads.total} stale leads to re-score`, { correlationId });

      // Filter leads with valid phone numbers
      const leadsWithPhone = (staleLeads.results as HubSpotContactResult[]).filter((lead) => {
        if (!lead.properties.phone) {
          logger.warn('Lead missing phone, skipping', { leadId: lead.id, correlationId });
          return false;
        }
        return true;
      });

      // Process leads in batches for better performance
      const todayStr = getTodayString();
      const batchResult = await processBatch(
        leadsWithPhone,
        async (lead) => {
          const message = lead.properties.last_message_content ?? 'Follow-up re-scoring';

          await scoreLeadWorkflow.trigger(
            {
              phone: lead.properties.phone!,
              hubspotContactId: lead.id,
              message,
              channel: 'whatsapp',
              correlationId: `${correlationId}_${lead.id}`,
            },
            {
              idempotencyKey: IdempotencyKeys.cronJobItem(
                'lead-scoring-refresh',
                todayStr,
                lead.id
              ),
            }
          );

          // Update the score timestamp
          await hubspot.updateContact(lead.id, {
            lead_score_updated: new Date().toISOString(),
          });
        },
        logger
      );

      leadsRefreshed = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors for debugging
      for (const { item, error } of batchResult.errors) {
        const lead = item;
        logger.error('Failed to re-score lead', { leadId: lead.id, error, correlationId });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.lead_scoring_refresh.completed', {
        leadsFound: staleLeads.total,
        leadsRefreshed,
        errors,
        correlationId,
      });

      logger.info('Lead scoring refresh completed', { leadsRefreshed, errors, correlationId });
    } catch (error) {
      logger.error('Lead scoring refresh failed', { error, correlationId });
      return { success: false, error: String(error), leadsRefreshed };
    }

    return { success: true, leadsRefreshed, errors };
  },
});

/**
 * Weekly analytics report - generates and sends weekly metrics
 * Runs every Monday at 8:00 AM
 */
export const weeklyAnalyticsReport = schedules.task({
  id: 'weekly-analytics-report',
  cron: '0 8 * * 1', // 8:00 AM every Monday
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Generating weekly analytics report', { correlationId });

    const { hubspot, eventStore } = getClients();

    try {
      // Calculate metrics from HubSpot
      const metrics = {
        newLeads: 0,
        hotLeads: 0,
        warmLeads: 0,
        coldLeads: 0,
        conversions: 0,
        period: '7 days',
        generatedAt: new Date().toISOString(),
      };

      if (hubspot) {
        // Count new leads in the last 7 days
        const newLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [{ propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgo() }],
            },
          ],
          limit: 1,
        });
        metrics.newLeads = newLeadsResult.total;

        // Count hot leads
        const hotLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_status', operator: 'EQ', value: 'hot' },
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgo() },
              ],
            },
          ],
          limit: 1,
        });
        metrics.hotLeads = hotLeadsResult.total;

        // Count warm leads
        const warmLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_status', operator: 'EQ', value: 'warm' },
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgo() },
              ],
            },
          ],
          limit: 1,
        });
        metrics.warmLeads = warmLeadsResult.total;

        // Count cold leads
        const coldLeadsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lead_status', operator: 'EQ', value: 'cold' },
                { propertyName: 'createdate', operator: 'GTE', value: sevenDaysAgo() },
              ],
            },
          ],
          limit: 1,
        });
        metrics.coldLeads = coldLeadsResult.total;

        // Count conversions (leads that became customers)
        const conversionsResult = await hubspot.searchContacts({
          filterGroups: [
            {
              filters: [
                { propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' },
                {
                  propertyName: 'hs_lifecyclestage_customer_date',
                  operator: 'GTE',
                  value: sevenDaysAgo(),
                },
              ],
            },
          ],
          limit: 1,
        });
        metrics.conversions = conversionsResult.total;
      }

      // Format report
      const report = formatWeeklyReport(metrics);

      logger.info('Weekly analytics report generated', { metrics, correlationId });

      // Emit report event (could trigger Slack/Email notification)
      await emitJobEvent(eventStore, 'cron.weekly_analytics.completed', {
        metrics,
        report,
        correlationId,
      });

      return { success: true, metrics };
    } catch (error) {
      logger.error('Weekly analytics report failed', { error, correlationId });
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Stale lead cleanup - archives old unresponsive leads
 * Runs every Sunday at 3:00 AM
 */
export const staleLeadCleanup = schedules.task({
  id: 'stale-lead-cleanup',
  cron: '0 3 * * 0', // 3:00 AM every Sunday
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting stale lead cleanup', { correlationId });

    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping cleanup', { correlationId });
      return { success: false, reason: 'HubSpot not configured', leadsArchived: 0 };
    }

    let leadsArchived = 0;
    let errors = 0;

    try {
      // Find leads with no activity in 90 days
      const staleLeads = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'notes_last_updated', operator: 'LT', value: ninetyDaysAgo() },
              { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
              { propertyName: 'lead_status', operator: 'NEQ', value: 'archived' },
            ],
          },
        ],
        properties: ['phone', 'email', 'firstname', 'lead_status', 'notes_last_updated'],
        limit: 100,
      });

      logger.info(`Found ${staleLeads.total} stale leads to archive`, { correlationId });

      // Process leads in batches for better performance
      const batchResult = await processBatch(
        staleLeads.results as HubSpotContactResult[],
        async (lead) => {
          await hubspot.updateContact(lead.id, {
            lead_status: 'archived',
            archived_date: new Date().toISOString(),
            archived_reason: 'No activity for 90+ days',
          });
        },
        logger
      );

      leadsArchived = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors for debugging
      for (const { item, error } of batchResult.errors) {
        const lead = item;
        logger.error('Failed to archive lead', { leadId: lead.id, error, correlationId });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.stale_lead_cleanup.completed', {
        leadsFound: staleLeads.total,
        leadsArchived,
        errors,
        correlationId,
      });

      logger.info('Stale lead cleanup completed', { leadsArchived, errors, correlationId });
    } catch (error) {
      logger.error('Stale lead cleanup failed', { error, correlationId });
      return { success: false, error: String(error), leadsArchived };
    }

    return { success: true, leadsArchived, errors };
  },
});

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
      // Note: We search for contacts with old consent date and filter out those with renewal sent
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
          // Skip if no phone or if consent renewal was already sent
          return contact.properties.phone && !contact.properties.consent_renewal_sent;
        }
      );

      // Process contacts in batches for better performance
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

      // Log individual errors for debugging
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

/**
 * Nightly knowledge base ingest - re-indexes knowledge base documents
 * Runs every day at 2:30 AM
 */
export const nightlyKnowledgeIngest = schedules.task({
  id: 'nightly-knowledge-ingest',
  cron: '30 2 * * *', // 2:30 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting nightly knowledge ingest', { correlationId });

    const { eventStore } = getClients();

    try {
      // Run the ingest script via child process
      // This approach keeps the cron job lightweight while using the full ingest script
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const startTime = Date.now();

      // Execute the ingest script
      // Use tsx for TypeScript execution
      const { stdout, stderr } = await execAsync('pnpm tsx scripts/ingest-knowledge.ts', {
        cwd: process.cwd(),
        env: {
          ...process.env,
          // Ensure DATABASE_URL is available
        },
        timeout: 300000, // 5 minute timeout
      });

      const duration = Date.now() - startTime;

      if (stderr.trim()) {
        logger.warn('Ingest script stderr', { stderr: stderr.trim(), correlationId });
      }

      // Parse results from stdout
      const entriesMatch = /Entries inserted: (\d+)/.exec(stdout);
      const updatedMatch = /Entries updated: (\d+)/.exec(stdout);
      const filesMatch = /Files processed: (\d+)/.exec(stdout);

      const entriesInserted = entriesMatch ? parseInt(entriesMatch[1]!, 10) : 0;
      const entriesUpdated = updatedMatch ? parseInt(updatedMatch[1]!, 10) : 0;
      const filesProcessed = filesMatch ? parseInt(filesMatch[1]!, 10) : 0;

      logger.info('Nightly knowledge ingest completed', {
        filesProcessed,
        entriesInserted,
        entriesUpdated,
        durationMs: duration,
        correlationId,
      });

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.knowledge_ingest.completed', {
        filesProcessed,
        entriesInserted,
        entriesUpdated,
        durationMs: duration,
        correlationId,
      });

      return {
        success: true,
        filesProcessed,
        entriesInserted,
        entriesUpdated,
        durationMs: duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Nightly knowledge ingest failed', { error: errorMessage, correlationId });

      await emitJobEvent(eventStore, 'cron.knowledge_ingest.failed', {
        error: errorMessage,
        correlationId,
      });

      return { success: false, error: errorMessage };
    }
  },
});

/**
 * CRM Health Monitoring - periodic health check of CRM integration
 * Runs every 15 minutes to detect CRM issues early
 */
export const crmHealthMonitor = schedules.task({
  id: 'crm-health-monitor',
  cron: '*/15 * * * *', // Every 15 minutes
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting CRM health check', { correlationId });

    const { eventStore } = getClients();

    try {
      // Dynamic import to get CRM provider and health service
      const { getCRMProvider, isMockCRMProvider } = await import('@medicalcor/integrations');
      const { CrmHealthCheckService } = await import('@medicalcor/infra');

      const crmProvider = getCRMProvider();
      const healthService = new CrmHealthCheckService({
        timeoutMs: 10000,
        degradedThresholdMs: 3000,
        unhealthyThresholdMs: 8000,
        providerName: 'crm',
      });

      const result = await healthService.check(crmProvider);

      const metrics = {
        status: result.status,
        provider: result.provider,
        isMock: isMockCRMProvider(),
        latencyMs: result.latencyMs,
        apiConnected: result.details.apiConnected,
        authenticated: result.details.authenticated,
        consecutiveFailures: healthService.getConsecutiveFailures(),
      };

      // Log based on health status
      if (result.status === 'healthy') {
        logger.info('CRM health check passed', { ...metrics, correlationId });
      } else if (result.status === 'degraded') {
        logger.warn('CRM health degraded', { ...metrics, message: result.message, correlationId });
      } else {
        logger.error('CRM health check failed', {
          ...metrics,
          message: result.message,
          error: result.details.error,
          correlationId,
        });
      }

      // Emit health check event for monitoring
      await emitJobEvent(eventStore, 'cron.crm_health_check.completed', {
        ...metrics,
        timestamp: result.timestamp.toISOString(),
        message: result.message,
        correlationId,
      });

      return {
        success: result.status !== 'unhealthy',
        ...metrics,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('CRM health check failed with exception', {
        error: errorMessage,
        correlationId,
      });

      await emitJobEvent(eventStore, 'cron.crm_health_check.failed', {
        error: errorMessage,
        correlationId,
      });

      return { success: false, error: errorMessage };
    }
  },
});

/**
 * GDPR Hard Deletion Executor - permanently deletes data past retention period
 * Runs every day at 3:30 AM
 *
 * CRITICAL: This job executes permanent data deletion for GDPR Article 17 compliance.
 * It processes records in the scheduled_deletions table that are past their scheduled date.
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
      // Dynamic import for Supabase client
      const { createClient } = await import('@supabase/supabase-js');

      // Create Supabase client for direct database access
      const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        logger.warn('Supabase credentials not configured', { correlationId });
        return { success: false, reason: 'Supabase not configured', deletionsProcessed: 0 };
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Get scheduled deletions that are due
      const { data: pendingDeletions, error: fetchError } = await supabase
        .from('scheduled_deletions')
        .select('*')
        .is('executed_at', null)
        .lte('scheduled_for', new Date().toISOString())
        .limit(100); // Process in batches

      if (fetchError) {
        throw new Error(`Failed to fetch pending deletions: ${fetchError.message}`);
      }

      // Type for scheduled deletion records
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

/**
 * DSR Due Date Monitor - alerts on overdue data subject requests
 * Runs every day at 8:00 AM
 *
 * GDPR requires response to DSRs within 30 days. This job monitors
 * for requests approaching or past their due date.
 */
export const dsrDueDateMonitor = schedules.task({
  id: 'dsr-due-date-monitor',
  cron: '0 8 * * *', // 8:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting DSR due date monitor', { correlationId });

    const { eventStore } = getClients();

    try {
      const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        logger.warn('Supabase credentials not configured', { correlationId });
        return { success: false, reason: 'Supabase not configured' };
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

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
          requests: overdueDSRs?.map((r: { id: string; request_type: string; due_date: string }) => ({
            id: r.id,
            type: r.request_type,
            dueDate: r.due_date,
          })),
          correlationId,
        });
      }

      if (approachingCount > 0) {
        logger.warn('DSRs approaching due date', {
          approachingCount,
          requests: approachingDSRs?.map((r: { id: string; request_type: string; due_date: string }) => ({
            id: r.id,
            type: r.request_type,
            dueDate: r.due_date,
          })),
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
// Follow-up Task Automation (M13)
// ============================================

/**
 * Follow-up task overdue monitor - checks for overdue tasks and escalates
 * Runs every 30 minutes
 */
export const followUpTaskOverdueMonitor = schedules.task({
  id: 'follow-up-task-overdue-monitor',
  cron: '*/30 * * * *', // Every 30 minutes
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting follow-up task overdue monitor', { correlationId });

    const { hubspot, eventStore } = getClients();

    let tasksEscalated = 0;
    let errors = 0;

    try {
      // Get Supabase client for task queries
      const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        logger.warn('Supabase credentials not configured', { correlationId });
        return { success: false, reason: 'Supabase not configured' };
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      const now = new Date();

      // Find overdue tasks that haven't been escalated
      const { data: overdueTasks, error: queryError } = await supabase
        .from('follow_up_tasks')
        .select('*')
        .in('status', ['pending', 'in_progress'])
        .lt('due_by', now.toISOString())
        .eq('is_escalated', false)
        .is('deleted_at', null)
        .limit(50);

      if (queryError) {
        throw new Error(`Failed to query overdue tasks: ${queryError.message}`);
      }

      interface FollowUpTaskRow {
        id: string;
        phone: string;
        hubspot_contact_id?: string;
        title: string;
        task_type: string;
        priority: string;
        attempt_count: number;
        max_attempts: number;
        due_by: string;
      }

      const tasks = (overdueTasks ?? []) as FollowUpTaskRow[];
      logger.info(`Found ${tasks.length} overdue follow-up tasks`, { correlationId });

      // Process overdue tasks
      for (const task of tasks) {
        try {
          // Calculate how overdue the task is
          const overdueMinutes = Math.floor(
            (now.getTime() - new Date(task.due_by).getTime()) / 60000
          );

          // Escalate if significantly overdue (>60 min) or max attempts reached
          const shouldEscalate =
            overdueMinutes > 60 || task.attempt_count >= task.max_attempts;

          if (shouldEscalate) {
            // Update task as escalated
            await supabase
              .from('follow_up_tasks')
              .update({
                is_escalated: true,
                escalated_at: now.toISOString(),
                escalation_reason: `Task overdue by ${overdueMinutes} minutes. Attempts: ${task.attempt_count}/${task.max_attempts}`,
                status: 'escalated',
              })
              .eq('id', task.id);

            // Create HubSpot escalation task if contact exists
            if (hubspot && task.hubspot_contact_id) {
              await hubspot.createTask({
                contactId: task.hubspot_contact_id,
                subject: `ESCALATION: ${task.title}`,
                body: [
                  `Follow-up task has been escalated.`,
                  `\nOriginal task: ${task.title}`,
                  `\nOverdue by: ${overdueMinutes} minutes`,
                  `\nAttempts made: ${task.attempt_count}/${task.max_attempts}`,
                  `\nPriority: ${task.priority}`,
                  `\n\nImmediate action required.`,
                ].join(''),
                priority: 'HIGH',
                dueDate: new Date(now.getTime() + 30 * 60 * 1000), // Due in 30 min
              });
            }

            // Emit escalation event
            await eventStore.emit({
              type: 'follow_up_task.escalated',
              correlationId,
              aggregateId: task.id,
              aggregateType: 'FollowUpTask',
              payload: {
                taskId: task.id,
                phone: task.phone,
                escalationReason: `Overdue by ${overdueMinutes} minutes`,
                escalatedAt: now.toISOString(),
                escalatedBy: 'auto',
                attemptCount: task.attempt_count,
                priority: 'urgent',
              },
            });

            tasksEscalated++;
            logger.info('Escalated overdue follow-up task', {
              taskId: task.id,
              overdueMinutes,
              correlationId,
            });
          }
        } catch (error) {
          errors++;
          logger.error('Failed to process overdue task', {
            taskId: task.id,
            error,
            correlationId,
          });
        }
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.follow_up_overdue_monitor.completed', {
        overdueTasks: tasks.length,
        tasksEscalated,
        errors,
        correlationId,
      });

      logger.info('Follow-up task overdue monitor completed', {
        overdueTasks: tasks.length,
        tasksEscalated,
        errors,
        correlationId,
      });
    } catch (error) {
      logger.error('Follow-up task overdue monitor failed', { error, correlationId });
      return { success: false, error: String(error) };
    }

    return { success: true, tasksEscalated, errors };
  },
});

/**
 * Follow-up task retry processor - processes tasks ready for retry
 * Runs every 15 minutes
 */
export const followUpTaskRetryProcessor = schedules.task({
  id: 'follow-up-task-retry-processor',
  cron: '*/15 * * * *', // Every 15 minutes
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting follow-up task retry processor', { correlationId });

    const { whatsapp, eventStore } = getClients();

    let tasksRetried = 0;
    let tasksFailed = 0;
    let errors = 0;

    try {
      const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        logger.warn('Supabase credentials not configured', { correlationId });
        return { success: false, reason: 'Supabase not configured' };
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      const now = new Date();

      // Find tasks with next_attempt_at that has passed
      const { data: retryTasks, error: queryError } = await supabase
        .from('follow_up_tasks')
        .select('*')
        .in('status', ['pending', 'in_progress'])
        .lte('next_attempt_at', now.toISOString())
        .eq('is_escalated', false)
        .is('deleted_at', null)
        .limit(50);

      if (queryError) {
        throw new Error(`Failed to query retry tasks: ${queryError.message}`);
      }

      interface FollowUpTaskRetryRow {
        id: string;
        phone: string;
        hubspot_contact_id?: string;
        title: string;
        task_type: string;
        channel: string;
        attempt_count: number;
        max_attempts: number;
        preferred_language: string;
        metadata: Record<string, unknown>;
      }

      const tasks = (retryTasks ?? []) as FollowUpTaskRetryRow[];
      logger.info(`Found ${tasks.length} tasks ready for retry`, { correlationId });

      for (const task of tasks) {
        try {
          const newAttemptCount = task.attempt_count + 1;

          if (newAttemptCount > task.max_attempts) {
            // Mark as failed
            await supabase
              .from('follow_up_tasks')
              .update({
                status: 'failed',
                outcome: 'max_attempts_reached',
                updated_at: now.toISOString(),
              })
              .eq('id', task.id);

            tasksFailed++;
            logger.info('Task failed - max attempts reached', {
              taskId: task.id,
              attempts: task.attempt_count,
              correlationId,
            });
            continue;
          }

          // Attempt to send follow-up
          if (task.channel === 'whatsapp' && whatsapp) {
            // Get default message for task type
            const language = (task.preferred_language ?? 'ro') as 'ro' | 'en' | 'de';
            const message = getFollowUpMessage(task.task_type, language);

            await whatsapp.sendText({
              to: task.phone,
              text: message,
            });

            // Calculate next retry with exponential backoff
            const nextRetryHours = Math.pow(2, newAttemptCount) * 2;
            const nextAttemptAt = new Date(now.getTime() + nextRetryHours * 60 * 60 * 1000);

            // Update task
            await supabase
              .from('follow_up_tasks')
              .update({
                attempt_count: newAttemptCount,
                last_attempt_at: now.toISOString(),
                next_attempt_at: nextAttemptAt.toISOString(),
                status: 'in_progress',
                updated_at: now.toISOString(),
              })
              .eq('id', task.id);

            tasksRetried++;
            logger.info('Follow-up retry sent', {
              taskId: task.id,
              attemptNumber: newAttemptCount,
              nextRetryHours,
              correlationId,
            });
          }
        } catch (error) {
          errors++;
          logger.error('Failed to process retry task', {
            taskId: task.id,
            error,
            correlationId,
          });
        }
      }

      await emitJobEvent(eventStore, 'cron.follow_up_retry_processor.completed', {
        tasksFound: tasks.length,
        tasksRetried,
        tasksFailed,
        errors,
        correlationId,
      });

      logger.info('Follow-up task retry processor completed', {
        tasksFound: tasks.length,
        tasksRetried,
        tasksFailed,
        errors,
        correlationId,
      });
    } catch (error) {
      logger.error('Follow-up task retry processor failed', { error, correlationId });
      return { success: false, error: String(error) };
    }

    return { success: true, tasksRetried, tasksFailed, errors };
  },
});

/**
 * Follow-up metrics aggregation - aggregates daily metrics
 * Runs every day at 1:00 AM
 */
export const followUpMetricsAggregation = schedules.task({
  id: 'follow-up-metrics-aggregation',
  cron: '0 1 * * *', // 1:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting follow-up metrics aggregation', { correlationId });

    const { eventStore } = getClients();

    try {
      const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        logger.warn('Supabase credentials not configured', { correlationId });
        return { success: false, reason: 'Supabase not configured' };
      }

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Calculate yesterday's date range
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const periodStart = yesterday.toISOString();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const periodEnd = today.toISOString();

      // Aggregate metrics from tasks created/completed yesterday
      const { data: tasks } = await supabase
        .from('follow_up_tasks')
        .select('*')
        .gte('created_at', periodStart)
        .lt('created_at', periodEnd);

      interface FollowUpTaskMetricsRow {
        status: string;
        is_escalated: boolean;
        scheduled_for: string;
        completed_at?: string;
        task_type: string;
        priority: string;
        assigned_to?: string;
        sla_minutes: number;
      }

      const taskList = (tasks ?? []) as FollowUpTaskMetricsRow[];

      // Calculate metrics
      const metrics = {
        tasksCreated: taskList.length,
        tasksCompleted: taskList.filter((t) => t.status === 'completed').length,
        tasksEscalated: taskList.filter((t) => t.is_escalated).length,
        tasksFailed: taskList.filter((t) => t.status === 'failed').length,
        tasksSkipped: taskList.filter((t) => t.status === 'skipped').length,
        slaMetCount: 0,
        slaBreachedCount: 0,
        avgCompletionTimeMinutes: 0,
        byType: {} as Record<string, number>,
        byPriority: {} as Record<string, number>,
      };

      // Calculate SLA metrics for completed tasks
      const completedTasks = taskList.filter(
        (t) => t.status === 'completed' && t.completed_at
      );

      if (completedTasks.length > 0) {
        let totalCompletionTime = 0;
        for (const task of completedTasks) {
          const scheduledTime = new Date(task.scheduled_for).getTime();
          const completedTime = new Date(task.completed_at!).getTime();
          const completionMinutes = (completedTime - scheduledTime) / 60000;
          totalCompletionTime += completionMinutes;

          if (completionMinutes <= task.sla_minutes) {
            metrics.slaMetCount++;
          } else {
            metrics.slaBreachedCount++;
          }
        }
        metrics.avgCompletionTimeMinutes = Math.round(
          totalCompletionTime / completedTasks.length
        );
      }

      // Count by type and priority
      for (const task of taskList) {
        metrics.byType[task.task_type] = (metrics.byType[task.task_type] ?? 0) + 1;
        metrics.byPriority[task.priority] = (metrics.byPriority[task.priority] ?? 0) + 1;
      }

      // Insert metrics into database
      await supabase.from('follow_up_task_metrics').insert({
        period_start: periodStart,
        period_end: periodEnd,
        period_type: 'daily',
        tasks_created: metrics.tasksCreated,
        tasks_completed: metrics.tasksCompleted,
        tasks_escalated: metrics.tasksEscalated,
        tasks_failed: metrics.tasksFailed,
        tasks_skipped: metrics.tasksSkipped,
        sla_met_count: metrics.slaMetCount,
        sla_breached_count: metrics.slaBreachedCount,
        avg_completion_time_minutes: metrics.avgCompletionTimeMinutes,
        by_type: metrics.byType,
        by_priority: metrics.byPriority,
      });

      await emitJobEvent(eventStore, 'cron.follow_up_metrics_aggregation.completed', {
        periodStart,
        periodEnd,
        metrics,
        correlationId,
      });

      logger.info('Follow-up metrics aggregation completed', {
        ...metrics,
        correlationId,
      });

      return { success: true, metrics };
    } catch (error) {
      logger.error('Follow-up metrics aggregation failed', { error, correlationId });
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Get default follow-up message for task type
 */
function getFollowUpMessage(taskType: string, language: 'ro' | 'en' | 'de'): string {
  const messages: Record<string, Record<string, string>> = {
    initial_contact: {
      ro: 'Bună ziua! Vă mulțumim pentru interesul acordat serviciilor noastre. Suntem aici să vă ajutăm.',
      en: 'Hello! Thank you for your interest in our services. We are here to help you.',
      de: 'Guten Tag! Vielen Dank für Ihr Interesse an unseren Dienstleistungen.',
    },
    follow_up_message: {
      ro: 'Bună ziua! Am dorit să verific dacă aveți întrebări suplimentare.',
      en: 'Hello! Just wanted to check if you have any additional questions.',
      de: 'Guten Tag! Wollte nur nachfragen, ob Sie weitere Fragen haben.',
    },
    nurture_check: {
      ro: 'Bună ziua! Ne-am gândit la dumneavoastră. Vă putem ajuta cu ceva?',
      en: 'Hello! We were thinking of you. Can we help you with anything?',
      de: 'Guten Tag! Wir haben an Sie gedacht. Können wir Ihnen helfen?',
    },
    recall: {
      ro: 'Bună ziua! Au trecut câteva luni de la ultima vizită. Vă recomandăm un control.',
      en: 'Hello! It has been a while since your last visit. We recommend a check-up.',
      de: 'Guten Tag! Es ist eine Weile her seit Ihrem letzten Besuch. Wir empfehlen eine Kontrolle.',
    },
  };

  const taskMessages = messages[taskType] ?? messages.follow_up_message;
  return taskMessages?.[language] ?? taskMessages?.ro ?? 'Hello!';
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format weekly report for notifications
 */
function formatWeeklyReport(metrics: {
  newLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  conversions: number;
  period: string;
  generatedAt: string;
}): string {
  return `
📊 Weekly Analytics Report
Period: ${metrics.period}
Generated: ${new Date(metrics.generatedAt).toLocaleString('ro-RO')}

📈 Lead Activity:
• New leads: ${metrics.newLeads}
• Hot leads: ${metrics.hotLeads}
• Warm leads: ${metrics.warmLeads}
• Cold leads: ${metrics.coldLeads}

🎯 Conversions: ${metrics.conversions}

💡 Conversion Rate: ${metrics.newLeads > 0 ? ((metrics.conversions / metrics.newLeads) * 100).toFixed(1) : 0}%
  `.trim();
}

/**
 * Emit job completion event
 */
async function emitJobEvent(
  eventStore: {
    emit: (input: {
      type: string;
      correlationId: string;
      payload: Record<string, unknown>;
      aggregateType?: string;
    }) => Promise<unknown>;
  },
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || generateCorrelationId();
  try {
    await eventStore.emit({
      type,
      correlationId,
      payload,
      aggregateType: 'cron',
    });
  } catch (error) {
    logger.warn('Failed to emit job event', { type, error });
  }
}
