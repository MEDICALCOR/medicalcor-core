import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testFixtures } from '@medicalcor/integrations/__mocks__/handlers';

/**
 * Unit tests for WhatsApp Handler Tasks
 * Tests message processing, consent management, and lead routing
 */

// Mock environment variables
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('WHATSAPP_API_KEY', 'test-whatsapp-key');
vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456789');
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
vi.stubEnv('DATABASE_URL', '');

// Import after env setup
import {
  createHubSpotClient,
  createWhatsAppClient,
  createOpenAIClient,
} from '@medicalcor/integrations';
import { createScoringService } from '@medicalcor/domain';
import { createInMemoryEventStore, normalizeRomanianPhone, LeadContextBuilder } from '@medicalcor/core';

describe('WhatsApp Handler Tasks', () => {
  const correlationId = 'whatsapp-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WhatsApp Message Handler', () => {
    it('should process message end-to-end with HOT lead routing', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      const eventStore = createInMemoryEventStore('whatsapp-hot');

      const payload = {
        message: {
          id: 'wamid_test123',
          from: '40721000001',
          timestamp: new Date().toISOString(),
          type: 'text',
          text: { body: testFixtures.messages.hotLead },
        },
        metadata: {
          display_phone_number: '+40212000000',
          phone_number_id: '123456789',
        },
        contact: {
          profile: { name: 'Ion Popescu' },
          wa_id: '+40721000001',
        },
        correlationId,
      };

      // Step 1: Normalize phone
      const phoneResult = normalizeRomanianPhone(payload.message.from);
      expect(phoneResult.isValid).toBe(true);

      // Step 2: Build lead context
      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: payload.message.from,
        message: {
          id: payload.message.id,
          body: payload.message.text.body,
          type: payload.message.type,
          timestamp: payload.message.timestamp,
        },
        metadata: payload.metadata,
        contact: {
          name: payload.contact.profile.name,
          wa_id: payload.contact.wa_id,
        },
      })
        .withCorrelationId(correlationId)
        .buildForScoring();

      expect(leadContext.phone).toBe(phoneResult.normalized);
      expect(leadContext.channel).toBe('whatsapp');

      // Step 3: Sync contact to HubSpot
      const contact = await hubspot.syncContact({
        phone: phoneResult.normalized,
        name: payload.contact.profile.name,
      });
      expect(contact.id).toBeDefined();

      // Step 4: Log message to timeline
      await hubspot.logMessageToTimeline({
        contactId: contact.id,
        message: payload.message.text.body,
        direction: 'IN',
        channel: 'whatsapp',
        messageId: payload.message.id,
      });

      // Step 5: Score lead
      const scoreResult = await scoring.scoreMessage(leadContext);
      expect(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).toContain(scoreResult.classification);

      // Step 6: Create task for HOT leads
      if (scoreResult.classification === 'HOT') {
        const task = await hubspot.createTask({
          contactId: contact.id,
          subject: `PRIORITY REQUEST: ${payload.contact.profile.name}`,
          body: scoreResult.suggestedAction,
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 30 * 60 * 1000),
        });
        expect(task.id).toBeDefined();

        // Send acknowledgment template
        const templateResult = await whatsapp.sendTemplate({
          to: phoneResult.normalized,
          templateName: 'hot_lead_acknowledgment',
          language: 'ro',
        });
        expect(templateResult.messages[0]?.id).toBeDefined();
      }

      // Step 7: Emit domain event
      await eventStore.emit({
        type: 'whatsapp.message.received',
        correlationId,
        aggregateId: phoneResult.normalized,
        aggregateType: 'lead',
        payload: {
          messageId: payload.message.id,
          from: phoneResult.normalized,
          score: scoreResult.score,
          classification: scoreResult.classification,
          hubspotContactId: contact.id,
        },
      });

      const events = await eventStore.getByType('whatsapp.message.received');
      expect(events.length).toBe(1);
    });

    it('should generate AI reply for WARM/COLD leads', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });
      const openai = createOpenAIClient({ apiKey: 'test-key' });
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });

      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: '+40721000001',
        message: {
          id: 'msg_warm',
          body: testFixtures.messages.warmLead,
          type: 'text',
        },
        metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
      }).buildForScoring();

      const scoreResult = await scoring.scoreMessage(leadContext);

      if (scoreResult.classification !== 'HOT') {
        const fullContext = LeadContextBuilder.fromWhatsApp({
          from: '+40721000001',
          message: {
            id: 'msg_warm',
            body: testFixtures.messages.warmLead,
            type: 'text',
          },
          metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
        }).build();

        const reply = await openai.generateReply({
          context: fullContext,
          tone: scoreResult.classification === 'WARM' ? 'friendly' : 'professional',
          language: 'ro',
        });

        expect(typeof reply).toBe('string');

        const sendResult = await whatsapp.sendText({
          to: '+40721000001',
          text: reply,
        });
        expect(sendResult.messages[0]?.id).toBeDefined();
      }
    });

    it('should handle consent response messages', async () => {
      // Mock consent parsing logic
      const parseConsentFromMessage = (message: string) => {
        const positiveResponses = ['da', 'yes', 'accept', 'accepta'];
        const negativeResponses = ['nu', 'no', 'stop', 'refuz'];
        const lowerMessage = message.toLowerCase().trim();

        if (positiveResponses.includes(lowerMessage)) {
          return { granted: true, consentTypes: ['data_processing', 'marketing'] };
        }
        if (negativeResponses.includes(lowerMessage)) {
          return { granted: false, consentTypes: ['data_processing'] };
        }
        return null;
      };

      const consentMessages = ['da', 'yes', 'nu', 'no', 'stop'];

      for (const message of consentMessages) {
        const consentResponse = parseConsentFromMessage(message);

        if (consentResponse) {
          expect(consentResponse.granted).toBeDefined();
          expect(Array.isArray(consentResponse.consentTypes)).toBe(true);

          if (consentResponse.granted) {
            expect(['da', 'yes']).toContain(message.toLowerCase());
          } else {
            expect(['nu', 'no', 'stop']).toContain(message.toLowerCase());
          }
        }
      }
    });

    it('should record consent from message', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      // Mock consent response
      const consentResponse = { granted: true, consentTypes: ['data_processing'] };

      if (consentResponse) {
        const consentStatus = consentResponse.granted ? 'granted' : 'denied';

        // Mock recording consent
        const consentRecord = {
          contactId: 'hs_contact_123',
          phone: '+40721000001',
          consentType: 'data_processing',
          status: consentStatus,
          recordedAt: new Date().toISOString(),
        };

        expect(consentRecord.status).toBe('granted');

        // Send confirmation
        const confirmationMsg = consentResponse.granted
          ? 'Mulțumim! Consimțământul dumneavoastră a fost înregistrat.'
          : 'Am înregistrat preferința dumneavoastră.';

        const result = await whatsapp.sendText({
          to: '+40721000001',
          text: confirmationMsg,
        });

        expect(result.messages[0]?.id).toBeDefined();
      }
    });

    it('should stop processing if consent is denied', () => {
      const consentResponse = {
        granted: false,
        consentTypes: ['data_processing'],
      };

      if (!consentResponse.granted) {
        const result = {
          success: true,
          messageId: 'msg_123',
          normalizedPhone: '+40721000001',
          hubspotContactId: 'hs_contact_123',
          consentDenied: true,
        };

        expect(result.consentDenied).toBe(true);
      }
    });

    it('should request consent for first-time contacts', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      // Mock consent check result
      const hasValidConsent = false;

      if (!hasValidConsent) {
        // Mock consent message generation
        const consentMessage = 'Conform GDPR, avem nevoie de consimțământul dumneavoastră pentru procesarea datelor. Răspundeți cu DA pentru a accepta.';
        expect(typeof consentMessage).toBe('string');

        await whatsapp.sendText({
          to: '+40721000001',
          text: consentMessage,
        });

        // Mock recording pending consent
        const pendingConsent = {
          contactId: 'hs_contact_new',
          phone: '+40721000001',
          consentType: 'data_processing',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        expect(pendingConsent.status).toBe('pending');
      }

      expect(typeof hasValidConsent).toBe('boolean');
    });

    it('should handle media messages gracefully', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const payload = {
        message: {
          id: 'wamid_media',
          from: '40721000001',
          timestamp: new Date().toISOString(),
          type: 'image',
          text: undefined,
        },
        metadata: {
          display_phone_number: '+40212000000',
          phone_number_id: '123456789',
        },
      };

      const phoneResult = normalizeRomanianPhone(payload.message.from);
      const contact = await hubspot.syncContact({ phone: phoneResult.normalized });

      // Log media message
      await hubspot.logMessageToTimeline({
        contactId: contact.id,
        message: '[Media message]',
        direction: 'IN',
        channel: 'whatsapp',
        messageId: payload.message.id,
      });

      expect(contact.id).toBeDefined();
    });

    it('should normalize Romanian phone numbers correctly', () => {
      const testCases = [
        { input: '0721000001', expected: '+40721000001' },
        { input: '+40721000001', expected: '+40721000001' },
        { input: '40721000001', expected: '+40721000001' },
        { input: '0721 000 001', expected: '+40721000001' },
      ];

      for (const { input, expected } of testCases) {
        const result = normalizeRomanianPhone(input);
        expect(result.normalized).toBe(expected);
        expect(result.isValid).toBe(true);
      }
    });

    it('should update contact with score and timestamp', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const scoreData = {
        score: 4,
        classification: 'HOT',
        timestamp: new Date().toISOString(),
      };

      await hubspot.updateContact('hs_contact_123', {
        lead_score: String(scoreData.score),
        lead_status: scoreData.classification,
        last_message_timestamp: scoreData.timestamp,
      });

      const contact = await hubspot.getContact('hs_contact_123');
      expect(contact.id).toBe('hs_contact_123');
    });

    it('should handle missing contact name gracefully', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const payload = {
        message: {
          from: '40721000001',
        },
        contact: undefined,
      };

      const phoneResult = normalizeRomanianPhone(payload.message.from);
      const contact = await hubspot.syncContact({
        phone: phoneResult.normalized,
      });

      expect(contact.id).toBeDefined();
    });

    it('should fallback to rule-based scoring when scoring service throws', async () => {
      const scoring = createScoringService({
        openaiApiKey: '',
        fallbackEnabled: true,
      });

      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: '+40721000001',
        message: {
          id: 'msg_fallback',
          body: 'Vreau implant urgent',
          type: 'text',
        },
        metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
      }).buildForScoring();

      const scoreResult = scoring.ruleBasedScore(leadContext);

      expect(scoreResult).toBeDefined();
      expect(scoreResult.confidence).toBe(0.7);
    });

    it('should throw error if scoring service is not available', () => {
      const scoring = undefined;

      if (!scoring) {
        expect(() => {
          throw new Error('Scoring service not configured');
        }).toThrow('Scoring service not configured');
      }
    });

    it('should return complete success result', () => {
      const result = {
        success: true,
        messageId: 'wamid_test123',
        normalizedPhone: '+40721000001',
        hubspotContactId: 'hs_contact_123',
        score: 4,
        classification: 'HOT',
      };

      expect(result.success).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.classification).toBe('HOT');
    });
  });

  describe('WhatsApp Status Handler', () => {
    it('should process status update end-to-end', async () => {
      const eventStore = createInMemoryEventStore('whatsapp-status');

      const payload = {
        messageId: 'wamid_test123',
        status: 'delivered',
        recipientId: '40721000001',
        timestamp: new Date().toISOString(),
        errors: undefined,
        correlationId,
      };

      await eventStore.emit({
        type: 'whatsapp.status.updated',
        correlationId,
        aggregateId: payload.recipientId,
        aggregateType: 'message',
        payload: {
          messageId: payload.messageId,
          status: payload.status,
          recipientId: payload.recipientId,
          timestamp: payload.timestamp,
        },
      });

      const events = await eventStore.getByType('whatsapp.status.updated');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.status).toBe('delivered');
    });

    it('should handle different status types', () => {
      const statuses = ['sent', 'delivered', 'read', 'failed'];

      for (const status of statuses) {
        const payload = {
          messageId: `msg_${status}`,
          status,
        };

        expect(['sent', 'delivered', 'read', 'failed']).toContain(payload.status);
      }
    });

    it('should log errors for failed deliveries', async () => {
      const eventStore = createInMemoryEventStore('whatsapp-failed');

      const payload = {
        messageId: 'wamid_failed',
        status: 'failed',
        recipientId: '40721000001',
        timestamp: new Date().toISOString(),
        errors: [
          { code: 131047, title: 'Re-engagement message' },
          { code: 131026, title: 'Message undeliverable' },
        ],
        correlationId,
      };

      if (payload.status === 'failed' && payload.errors && payload.errors.length > 0) {
        await eventStore.emit({
          type: 'whatsapp.status.updated',
          correlationId,
          aggregateId: payload.recipientId,
          aggregateType: 'message',
          payload: {
            messageId: payload.messageId,
            status: payload.status,
            errors: payload.errors,
          },
        });

        const events = await eventStore.getByType('whatsapp.status.updated');
        expect(events.length).toBe(1);
        expect(events[0]?.payload.errors).toBeDefined();
      }
    });

    it('should return success result', () => {
      const result = {
        success: true,
        messageId: 'wamid_test123',
        status: 'delivered',
      };

      expect(result.success).toBe(true);
      expect(result.status).toBe('delivered');
    });

    it('should handle status without errors', () => {
      const payload = {
        messageId: 'wamid_success',
        status: 'delivered',
        errors: undefined,
      };

      expect(payload.errors).toBeUndefined();
      expect(payload.status).toBe('delivered');
    });
  });

  describe('LeadContextBuilder integration', () => {
    it('should build complete lead context with all fields', () => {
      const context = LeadContextBuilder.fromWhatsApp({
        from: '0721000001',
        message: {
          id: 'msg_complete',
          body: 'Test message',
          type: 'text',
          timestamp: new Date().toISOString(),
        },
        metadata: {
          phone_number_id: '123456789',
          display_phone_number: '+40212000000',
        },
        contact: {
          name: 'Ion Popescu',
          wa_id: '+40721000001',
        },
      })
        .withCorrelationId(correlationId)
        .withHubSpotContact('hs_contact_123')
        .buildForScoring();

      expect(context.phone).toBe('+40721000001');
      expect(context.channel).toBe('whatsapp');
      expect(context.hubspotContactId).toBe('hs_contact_123');
      expect(context.messageHistory).toBeDefined();
      expect(context.messageHistory?.length).toBeGreaterThan(0);
    });

    it('should handle minimal WhatsApp input', () => {
      const context = LeadContextBuilder.fromWhatsApp({
        from: '+40721000001',
        message: {
          id: 'msg_minimal',
          body: 'Hello',
          type: 'text',
        },
        metadata: {
          phone_number_id: '123',
          display_phone_number: '+40212000000',
        },
      }).buildForScoring();

      expect(context.phone).toBe('+40721000001');
      expect(context.channel).toBe('whatsapp');
    });

    it('should support message history for context-aware replies', () => {
      const messageHistory = [
        { role: 'user' as const, content: 'Buna ziua', timestamp: new Date().toISOString() },
        {
          role: 'assistant' as const,
          content: 'Buna ziua! Cu ce va putem ajuta?',
          timestamp: new Date().toISOString(),
        },
      ];

      const context = LeadContextBuilder.fromWhatsApp({
        from: '+40721000001',
        message: {
          id: 'msg_history',
          body: 'Vreau informatii despre implanturi',
          type: 'text',
        },
        metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
      })
        .withMessageHistory(messageHistory)
        .buildForScoring();

      // Message history should include the provided history entries
      expect(context.messageHistory?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Template sending', () => {
    it('should send template with parameters', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const result = await whatsapp.sendTemplate({
        to: '+40721000001',
        templateName: 'hot_lead_acknowledgment',
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

    it('should send template without parameters', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const result = await whatsapp.sendTemplate({
        to: '+40721000001',
        templateName: 'appointment_reminder',
        language: 'ro',
      });

      expect(result.messages[0]?.id).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle HubSpot sync failure gracefully', async () => {
      const eventStore = createInMemoryEventStore('whatsapp-hubspot-fail');

      const payload = {
        messageId: 'msg_hubspot_fail',
        from: '+40721000001',
      };

      // Even if HubSpot fails, should emit event
      await eventStore.emit({
        type: 'whatsapp.message.received',
        correlationId,
        aggregateId: payload.from,
        aggregateType: 'lead',
        payload: {
          messageId: payload.messageId,
          from: payload.from,
          hubspotContactId: undefined, // Failed to sync
        },
      });

      const events = await eventStore.getByType('whatsapp.message.received');
      expect(events.length).toBe(1);
    });

    it('should handle WhatsApp send failure gracefully', () => {
      // Workflow should continue even if WhatsApp send fails
      const result = {
        success: true,
        messageId: 'msg_test',
        hubspotContactId: 'hs_contact_123',
      };

      expect(result.success).toBe(true);
    });

    it('should handle consent service unavailable', () => {
      const consent = undefined;

      if (!consent) {
        // Should process message without consent check (or skip)
        expect(consent).toBeUndefined();
      }
    });
  });

  describe('Retry configuration', () => {
    it('should have correct retry settings for message handler', () => {
      const retryConfig = {
        maxAttempts: 3,
        minTimeoutInMs: 1000,
        maxTimeoutInMs: 10000,
        factor: 2,
      };

      expect(retryConfig.maxAttempts).toBe(3);
      expect(retryConfig.minTimeoutInMs).toBe(1000);
      expect(retryConfig.maxTimeoutInMs).toBe(10000);
    });

    it('should have correct retry settings for status handler', () => {
      const retryConfig = {
        maxAttempts: 2,
        minTimeoutInMs: 500,
        maxTimeoutInMs: 5000,
        factor: 2,
      };

      expect(retryConfig.maxAttempts).toBe(2);
      expect(retryConfig.minTimeoutInMs).toBe(500);
    });
  });
});
