import { schedules, logger } from '@trigger.dev/sdk/v3';
import { createEventStore, createInMemoryEventStore } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { generateCorrelationId, monthsAgo } from '../shared/date-helpers';
import { processBatch } from '../shared/batch-processor';
import { emitJobEvent } from '../shared/event-emitter';

/**
 * Compliance Jobs - GDPR and consent management scheduled tasks
 */

/**
 * HubSpot contact search result type
 */
interface HubSpotContactResult {
  id: string;
  properties: Record<string, string | undefined>;
}

/**
 * Initialize clients for compliance jobs
 */
function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  const clients = createIntegrationClients({
    source: 'compliance-jobs',
    includeScheduling: false,
  });

  const eventStore = databaseUrl
    ? createEventStore({ source: 'compliance-jobs', connectionString: databaseUrl })
    : createInMemoryEventStore('compliance-jobs');

  return {
    hubspot: clients.hubspot,
    whatsapp: clients.whatsapp,
    eventStore,
  };
}

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
              { propertyName: 'consent_date', operator: 'LT', value: monthsAgo(23) },
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
      const contactsNeedingRenewal = (expiringConsent.results as HubSpotContactResult[]).filter((contact) => {
        // Skip if no phone or if consent renewal was already sent
        return contact.properties.phone && !contact.properties.consent_renewal_sent;
      });

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
              to: props.phone as string,
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
        const c = item as HubSpotContactResult;
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
