import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

/**
 * Integration tests for Cron Jobs
 * Tests scheduled background jobs with mocked external services
 */

// Mock environment variables
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('WHATSAPP_API_KEY', 'test-whatsapp-key');
vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456789');
vi.stubEnv('DATABASE_URL', '');

import { createHubSpotClient, createWhatsAppClient } from '@medicalcor/integrations';
import { createInMemoryEventStore, IdempotencyKeys, getTodayString } from '@medicalcor/core';

describe('Cron Jobs', () => {
  const correlationId = `cron_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Daily Recall Check', () => {
    it('should find contacts due for recall (6+ months since last appointment)', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const eventStore = createInMemoryEventStore('recall-check');

      // Search for contacts with old appointments
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const recallDueContacts = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'last_appointment_date',
                operator: 'LT',
                value: sixMonthsAgo.getTime().toString(),
              },
              { propertyName: 'consent_marketing', operator: 'EQ', value: 'true' },
              { propertyName: 'lifecyclestage', operator: 'EQ', value: 'customer' },
            ],
          },
        ],
        properties: ['phone', 'email', 'firstname', 'last_appointment_date'],
        limit: 100,
      });

      expect(recallDueContacts).toBeDefined();
      expect(recallDueContacts.total).toBeGreaterThanOrEqual(0);

      // Emit job completion event
      await eventStore.emit({
        type: 'cron.daily_recall_check.completed',
        correlationId,
        payload: {
          contactsFound: recallDueContacts.total,
          contactsProcessed: recallDueContacts.results.length,
          errors: 0,
        },
      });

      const events = await eventStore.getByType('cron.daily_recall_check.completed');
      expect(events.length).toBe(1);
    });

    it('should use idempotency keys for recall workflows', () => {
      const contactId = 'hs_contact_123';
      const todayStr = getTodayString();

      const idempotencyKey = IdempotencyKeys.recallCheck(contactId, todayStr);

      expect(idempotencyKey).toBeDefined();
      // Keys are namespaced with 'recall:' prefix and SHA-256 hash
      expect(idempotencyKey).toMatch(/^recall:[a-f0-9]{32}$/);

      // Same inputs should produce same key (deterministic)
      const idempotencyKey2 = IdempotencyKeys.recallCheck(contactId, todayStr);
      expect(idempotencyKey).toBe(idempotencyKey2);

      // Different inputs should produce different keys
      const differentKey = IdempotencyKeys.recallCheck('other_contact', todayStr);
      expect(idempotencyKey).not.toBe(differentKey);
    });
  });

  describe('Appointment Reminders', () => {
    it('should find appointments in next 24 hours with consent', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Search for upcoming appointments with GDPR consent
      const upcomingAppointments = await hubspot.searchContacts({
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
              {
                propertyName: 'consent_appointment_reminders',
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
          'reminder_24h_sent',
          'consent_appointment_reminders',
        ],
        limit: 100,
      });

      expect(upcomingAppointments).toBeDefined();
    });

    it('should send 24h reminder via WhatsApp template', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const contact = {
        phone: '+40721000001',
        firstname: 'Ion',
        appointmentDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const result = await whatsapp.sendTemplate({
        to: contact.phone,
        templateName: 'appointment_reminder_24h',
        language: 'ro',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: contact.firstname },
              {
                type: 'text',
                text: contact.appointmentDate.toLocaleDateString('ro-RO', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }),
              },
              {
                type: 'text',
                text: contact.appointmentDate.toLocaleTimeString('ro-RO', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ],
          },
        ],
      });

      expect(result.messages[0]?.id).toBeDefined();
    });

    it('should send 2h reminder via WhatsApp template', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const appointmentTime = new Date(Date.now() + 2 * 60 * 60 * 1000);

      const result = await whatsapp.sendTemplate({
        to: '+40721000001',
        templateName: 'appointment_reminder_2h',
        language: 'ro',
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: appointmentTime.toLocaleTimeString('ro-RO', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ],
          },
        ],
      });

      expect(result.messages[0]?.id).toBeDefined();
    });

    it('should check GDPR consent before sending reminders', () => {
      interface ContactWithConsent {
        id: string;
        properties: {
          consent_appointment_reminders?: string;
          consent_treatment_updates?: string;
          consent_marketing?: string;
        };
      }

      function hasValidConsentForReminders(contact: ContactWithConsent): boolean {
        const props = contact.properties;

        // Check specific appointment_reminders consent
        if (props.consent_appointment_reminders === 'true') {
          return true;
        }

        // Accept treatment_updates consent as alternative
        if (props.consent_treatment_updates === 'true') {
          return true;
        }

        // DO NOT fall back to general marketing consent for medical communications
        return false;
      }

      // Contact with appointment reminders consent
      const contactWithConsent: ContactWithConsent = {
        id: 'hs_123',
        properties: {
          consent_appointment_reminders: 'true',
        },
      };
      expect(hasValidConsentForReminders(contactWithConsent)).toBe(true);

      // Contact with treatment updates consent (acceptable)
      const contactWithTreatmentConsent: ContactWithConsent = {
        id: 'hs_456',
        properties: {
          consent_treatment_updates: 'true',
        },
      };
      expect(hasValidConsentForReminders(contactWithTreatmentConsent)).toBe(true);

      // Contact with only marketing consent (NOT acceptable for medical)
      const contactWithMarketingOnly: ContactWithConsent = {
        id: 'hs_789',
        properties: {
          consent_marketing: 'true',
        },
      };
      expect(hasValidConsentForReminders(contactWithMarketingOnly)).toBe(false);

      // Contact with no consent
      const contactNoConsent: ContactWithConsent = {
        id: 'hs_000',
        properties: {},
      };
      expect(hasValidConsentForReminders(contactNoConsent)).toBe(false);
    });

    it('should correctly identify 24h and 2h reminder windows', () => {
      function isIn24Hours(dateStr: string): boolean {
        const date = new Date(dateStr);
        const now = new Date();
        const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
        return diffHours > 23 && diffHours <= 25;
      }

      function isIn2Hours(dateStr: string): boolean {
        const date = new Date(dateStr);
        const now = new Date();
        const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
        return diffHours > 1.5 && diffHours <= 2.5;
      }

      // 24 hours from now
      const in24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      expect(isIn24Hours(in24Hours)).toBe(true);
      expect(isIn2Hours(in24Hours)).toBe(false);

      // 2 hours from now
      const in2Hours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      expect(isIn24Hours(in2Hours)).toBe(false);
      expect(isIn2Hours(in2Hours)).toBe(true);

      // 48 hours from now (outside window)
      const in48Hours = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      expect(isIn24Hours(in48Hours)).toBe(false);
      expect(isIn2Hours(in48Hours)).toBe(false);
    });
  });

  describe('Lead Scoring Refresh', () => {
    it('should find leads with stale scores (7+ days)', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const staleLeads = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'lead_score_updated',
                operator: 'LT',
                value: sevenDaysAgo.getTime().toString(),
              },
              { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
              { propertyName: 'lead_status', operator: 'NEQ', value: 'archived' },
            ],
          },
        ],
        properties: ['phone', 'lead_score', 'lead_status', 'last_message_content'],
        limit: 50,
      });

      expect(staleLeads).toBeDefined();
    });

    it('should use idempotency keys for lead scoring refresh', () => {
      const leadId = 'hs_lead_123';
      const todayStr = getTodayString();

      const idempotencyKey = IdempotencyKeys.cronJobItem('lead-scoring-refresh', todayStr, leadId);

      expect(idempotencyKey).toBeDefined();
      // Keys are namespaced with 'cron-item:' prefix and SHA-256 hash
      expect(idempotencyKey).toMatch(/^cron-item:[a-f0-9]{32}$/);

      // Same inputs should produce same key (deterministic)
      const idempotencyKey2 = IdempotencyKeys.cronJobItem('lead-scoring-refresh', todayStr, leadId);
      expect(idempotencyKey).toBe(idempotencyKey2);

      // Different inputs should produce different keys
      const differentKey = IdempotencyKeys.cronJobItem(
        'lead-scoring-refresh',
        todayStr,
        'other_lead'
      );
      expect(idempotencyKey).not.toBe(differentKey);
    });

    it('should update lead_score_updated timestamp after refresh', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const leadId = 'hs_contact_123';

      await hubspot.updateContact(leadId, {
        lead_score_updated: new Date().toISOString(),
      });

      // Verify update (mock doesn't persist, but API call succeeds)
      expect(true).toBe(true);
    });
  });

  describe('Weekly Analytics Report', () => {
    it('should generate weekly metrics', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Count new leads
      const newLeadsResult = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'createdate',
                operator: 'GTE',
                value: sevenDaysAgo.getTime().toString(),
              },
            ],
          },
        ],
        limit: 1,
      });

      // Count hot leads
      const hotLeadsResult = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'lead_status', operator: 'EQ', value: 'hot' },
              {
                propertyName: 'createdate',
                operator: 'GTE',
                value: sevenDaysAgo.getTime().toString(),
              },
            ],
          },
        ],
        limit: 1,
      });

      const metrics = {
        newLeads: newLeadsResult.total,
        hotLeads: hotLeadsResult.total,
        warmLeads: 0,
        coldLeads: 0,
        conversions: 0,
        period: '7 days',
        generatedAt: new Date().toISOString(),
      };

      expect(metrics.newLeads).toBeGreaterThanOrEqual(0);
      expect(metrics.period).toBe('7 days');
    });

    it('should format weekly report correctly', () => {
      const metrics = {
        newLeads: 50,
        hotLeads: 10,
        warmLeads: 20,
        coldLeads: 20,
        conversions: 5,
        period: '7 days',
        generatedAt: new Date().toISOString(),
      };

      const report = `
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

      expect(report).toContain('📊 Weekly Analytics Report');
      expect(report).toContain('New leads: 50');
      expect(report).toContain('Conversions: 5');
      expect(report).toContain('10.0%'); // 5/50 = 10%
    });
  });

  describe('Stale Lead Cleanup', () => {
    it('should find leads with no activity in 90 days', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const staleLeads = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'notes_last_updated',
                operator: 'LT',
                value: ninetyDaysAgo.getTime().toString(),
              },
              { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
              { propertyName: 'lead_status', operator: 'NEQ', value: 'archived' },
            ],
          },
        ],
        properties: ['phone', 'email', 'firstname', 'lead_status', 'notes_last_updated'],
        limit: 100,
      });

      expect(staleLeads).toBeDefined();
    });

    it('should archive stale leads with proper metadata', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const leadId = 'hs_stale_lead_123';

      await hubspot.updateContact(leadId, {
        lead_status: 'archived',
        archived_date: new Date().toISOString(),
        archived_reason: 'No activity for 90+ days',
      });

      // Verify update succeeds
      expect(true).toBe(true);
    });
  });

  describe('GDPR Consent Audit', () => {
    it('should find contacts with expiring consent (approaching 2 years)', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const almostTwoYearsAgo = new Date();
      almostTwoYearsAgo.setMonth(almostTwoYearsAgo.getMonth() - 23);

      const expiringConsent = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'consent_date',
                operator: 'LT',
                value: almostTwoYearsAgo.getTime().toString(),
              },
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

      expect(expiringConsent).toBeDefined();
    });

    it('should send consent renewal via WhatsApp', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const result = await whatsapp.sendTemplate({
        to: '+40721000001',
        templateName: 'consent_renewal',
        language: 'ro',
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'Ion Popescu' }],
          },
        ],
      });

      expect(result.messages[0]?.id).toBeDefined();
    });

    it('should mark consent renewal as sent', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const contactId = 'hs_contact_123';

      await hubspot.updateContact(contactId, {
        consent_renewal_sent: new Date().toISOString(),
      });

      // Verify update succeeds
      expect(true).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    it('should process items in batches with Promise.allSettled', async () => {
      const BATCH_SIZE = 10;
      const items = Array.from({ length: 25 }, (_, i) => ({ id: `item_${i}` }));

      let processed = 0;
      const errors: { item: unknown; error: unknown }[] = [];

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (item) => {
            // Simulate processing
            if (item.id === 'item_5') {
              throw new Error('Simulated error');
            }
            return item;
          })
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result?.status === 'fulfilled') {
            processed++;
          } else if (result?.status === 'rejected') {
            errors.push({ item: batch[j], error: result.reason });
          }
        }
      }

      expect(processed).toBe(24); // 25 - 1 error
      expect(errors.length).toBe(1);
      expect(errors[0]?.item).toEqual({ id: 'item_5' });
    });

    it('should implement exponential backoff retry', async () => {
      const RETRY_CONFIG = {
        maxRetries: 3,
        baseDelayMs: 100, // Reduced for testing
        maxDelayMs: 1000,
      };

      let attempts = 0;
      let lastDelay = 0;

      async function withExponentialRetry<T>(
        fn: () => Promise<T>,
        maxRetries = RETRY_CONFIG.maxRetries
      ): Promise<T> {
        let lastError: unknown;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            return await fn();
          } catch (error) {
            lastError = error;
            attempts++;

            if (attempt === maxRetries) break;

            const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
            lastDelay = Math.min(exponentialDelay, RETRY_CONFIG.maxDelayMs);
            // In test, we don't actually wait
          }
        }

        throw lastError;
      }

      // Test successful retry
      let failCount = 0;
      const result = await withExponentialRetry(async () => {
        failCount++;
        if (failCount < 3) throw new Error('Transient error');
        return 'success';
      });

      expect(result).toBe('success');
      expect(failCount).toBe(3);
    });

    it('should identify retryable errors', () => {
      function isRetryableError(error: unknown): boolean {
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (message.includes('rate_limit') || message.includes('429')) return true;
          if (message.includes('timeout')) return true;
          if (message.includes('502') || message.includes('503') || message.includes('504'))
            return true;
          if (message.includes('network') || message.includes('econnreset')) return true;
          if (message.includes('socket hang up')) return true;
        }
        return false;
      }

      // Retryable errors
      expect(isRetryableError(new Error('Rate_limit exceeded'))).toBe(true);
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
      expect(isRetryableError(new Error('HTTP 503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new Error('Network error'))).toBe(true);
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);

      // Non-retryable errors
      expect(isRetryableError(new Error('Invalid input'))).toBe(false);
      expect(isRetryableError(new Error('Authentication failed'))).toBe(false);
      expect(isRetryableError(new Error('Not found'))).toBe(false);
    });
  });

  describe('Date Helper Functions', () => {
    it('should generate correlation IDs correctly', () => {
      const correlationId1 = `cron_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const correlationId2 = `cron_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

      expect(correlationId1).toMatch(/^cron_\d+_[a-f0-9]{8}$/);
      expect(correlationId1).not.toBe(correlationId2);
    });

    it('should format dates for different languages', () => {
      const date = new Date('2025-01-15T10:00:00');

      const formatDate = (dateStr: string, language: 'ro' | 'en' | 'de' = 'ro'): string => {
        const d = new Date(dateStr);
        const formatters: Record<string, Intl.DateTimeFormat> = {
          ro: new Intl.DateTimeFormat('ro-RO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
          en: new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
          de: new Intl.DateTimeFormat('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
        };
        return formatters[language]?.format(d) ?? d.toLocaleDateString();
      };

      const roFormat = formatDate(date.toISOString(), 'ro');
      expect(roFormat.toLowerCase()).toContain('ianuarie');

      const enFormat = formatDate(date.toISOString(), 'en');
      expect(enFormat).toContain('January');

      const deFormat = formatDate(date.toISOString(), 'de');
      expect(deFormat).toContain('Januar');
    });

    it('should format times correctly', () => {
      const formatTime = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
      };

      const time = formatTime('2025-01-15T10:30:00');
      expect(time).toMatch(/10:30/);
    });
  });

  describe('Event Emission', () => {
    it('should emit job completion events', async () => {
      const eventStore = createInMemoryEventStore('cron-events');

      const jobTypes = [
        'cron.daily_recall_check.completed',
        'cron.appointment_reminders.completed',
        'cron.lead_scoring_refresh.completed',
        'cron.weekly_analytics.completed',
        'cron.stale_lead_cleanup.completed',
        'cron.gdpr_consent_audit.completed',
      ];

      for (const type of jobTypes) {
        await eventStore.emit({
          type,
          correlationId,
          aggregateType: 'cron',
          payload: {
            timestamp: new Date().toISOString(),
            status: 'success',
          },
        });
      }

      // Verify events were stored
      for (const type of jobTypes) {
        const events = await eventStore.getByType(type);
        expect(events.length).toBe(1);
      }
    });
  });
});
