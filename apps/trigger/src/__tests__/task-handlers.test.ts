import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testFixtures } from '@medicalcor/integrations/__mocks__/handlers';

/**
 * Integration tests for Trigger.dev task handlers
 * Tests the full flow with mocked external services
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
import {
  normalizeRomanianPhone,
  LeadContextBuilder,
  createInMemoryEventStore,
} from '@medicalcor/core';

describe('WhatsApp Message Handler Integration', () => {
  const correlationId = 'test-correlation-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Full message processing flow', () => {
    it('should process a hot lead message end-to-end', async () => {
      // Setup clients (will use MSW mocks)
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      const eventStore = createInMemoryEventStore('test');

      // Step 1: Normalize phone
      const phoneResult = normalizeRomanianPhone('0721000001');
      expect(phoneResult.isValid).toBe(true);
      expect(phoneResult.normalized).toBe('+40721000001');

      // Step 2: Build lead context
      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: '0721000001',
        message: {
          id: 'msg_123',
          body: testFixtures.messages.hotLead,
          type: 'text',
          timestamp: new Date().toISOString(),
        },
        contact: { name: 'Ion Popescu', wa_id: '+40721000001' },
        metadata: {
          phone_number_id: '123456789',
          display_phone_number: '+40212000000',
        },
      })
        .withCorrelationId(correlationId)
        .buildForScoring();

      expect(leadContext.phone).toBe('+40721000001');
      expect(leadContext.channel).toBe('whatsapp');

      // Step 3: Sync contact to HubSpot
      const hubspotContact = await hubspot.syncContact({
        phone: phoneResult.normalized,
        name: 'Ion Popescu',
      });
      expect(hubspotContact.id).toBeDefined();

      // Step 4: AI Scoring
      const scoreResult = await scoring.scoreMessage(leadContext);
      expect(scoreResult.score).toBeGreaterThanOrEqual(1);
      expect(scoreResult.score).toBeLessThanOrEqual(5);
      expect(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).toContain(scoreResult.classification);

      // Step 5: Create task for HOT leads
      if (scoreResult.classification === 'HOT') {
        const task = await hubspot.createTask({
          contactId: hubspotContact.id,
          subject: `HOT LEAD: Ion Popescu`,
          body: scoreResult.suggestedAction,
          priority: 'HIGH',
        });
        expect(task.id).toBeDefined();
      }

      // Step 6: Send WhatsApp acknowledgment
      const templateResult = await whatsapp.sendTemplate({
        to: phoneResult.normalized,
        templateName: 'hot_lead_acknowledgment',
        language: 'ro',
      });
      expect(templateResult.messages[0]?.id).toBeDefined();

      // Step 7: Emit domain event
      await eventStore.emit({
        type: 'whatsapp.message.received',
        correlationId,
        aggregateId: phoneResult.normalized,
        aggregateType: 'lead',
        payload: {
          messageId: 'msg_123',
          from: phoneResult.normalized,
          score: scoreResult.score,
          classification: scoreResult.classification,
          hubspotContactId: hubspotContact.id,
        },
      });

      // Verify event was stored
      const events = await eventStore.getByAggregateId(phoneResult.normalized);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]?.type).toBe('whatsapp.message.received');
    });

    it('should handle warm lead with AI reply', async () => {
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
        from: '+40721000003',
        message: {
          id: 'msg_456',
          body: testFixtures.messages.warmLead,
          type: 'text',
        },
        metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
      })
        .withCorrelationId(correlationId)
        .buildForScoring();

      // Score the lead
      const scoreResult = await scoring.scoreMessage(leadContext);

      // Generate AI reply for non-HOT leads
      if (scoreResult.classification !== 'HOT') {
        const reply = await openai.generateReply({
          context: leadContext,
          tone: 'friendly',
          language: 'ro',
        });
        expect(typeof reply).toBe('string');

        // Send the reply
        const sendResult = await whatsapp.sendText({
          to: '+40721000003',
          text: reply,
        });
        expect(sendResult.messages[0]?.id).toBeDefined();
      }
    });

    it('should fallback to rule-based scoring on AI failure', async () => {
      const scoring = createScoringService({
        openaiApiKey: '', // No API key - will fail AI scoring
        fallbackEnabled: true,
      });

      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: '+40721000001',
        message: {
          id: 'msg_789',
          body: 'Vreau implant dentar urgent! Cat costa?',
          type: 'text',
        },
        metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
      })
        .withCorrelationId(correlationId)
        .buildForScoring();

      // Rule-based scoring should work
      const scoreResult = scoring.ruleBasedScore(leadContext);
      expect(scoreResult.score).toBeGreaterThanOrEqual(1);
      expect(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).toContain(scoreResult.classification);
    });
  });

  describe('Phone normalization edge cases', () => {
    it('should normalize Romanian phone formats', () => {
      const formats = [
        { input: '0721000001', expected: '+40721000001' },
        { input: '+40721000001', expected: '+40721000001' },
        { input: '40721000001', expected: '+40721000001' },
        { input: '0721 000 001', expected: '+40721000001' },
      ];

      for (const { input, expected } of formats) {
        const result = normalizeRomanianPhone(input);
        expect(result.normalized).toBe(expected);
        expect(result.isValid).toBe(true);
      }
    });

    it('should handle invalid phone numbers', () => {
      const result = normalizeRomanianPhone('invalid');
      expect(result.isValid).toBe(false);
    });
  });
});

describe('Payment Handler Integration', () => {
  const correlationId = 'payment-test-123';

  it('should process successful payment end-to-end', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });
    const whatsapp = createWhatsAppClient({
      apiKey: 'test-key',
      phoneNumberId: '123456789',
    });
    const eventStore = createInMemoryEventStore('payment-test');

    const payment = {
      paymentId: 'pi_test123',
      amount: 50000, // 500.00 EUR
      currency: 'eur',
      customerEmail: 'test@example.com',
      customerName: 'Ion Popescu',
      metadata: { phone: '+40721000001' },
    };

    // Step 1: Find/create HubSpot contact
    const contact = await hubspot.syncContact({
      email: payment.customerEmail,
      name: payment.customerName,
      phone: payment.metadata.phone,
    });
    expect(contact.id).toBeDefined();

    // Step 2: Log payment to timeline
    await hubspot.logPaymentToTimeline({
      contactId: contact.id,
      paymentId: payment.paymentId,
      amount: payment.amount,
      currency: payment.currency,
      status: 'succeeded',
    });

    // Step 3: Update lifecycle stage
    await hubspot.updateContact(contact.id, {
      lifecyclestage: 'customer',
      hs_lead_status: 'CONVERTED',
    });

    // Step 4: Send WhatsApp confirmation
    const confirmation = await whatsapp.sendTemplate({
      to: payment.metadata.phone,
      templateName: 'payment_confirmation',
      language: 'ro',
    });
    expect(confirmation.messages[0]?.id).toBeDefined();

    // Step 5: Emit domain event
    await eventStore.emit({
      type: 'payment.received',
      correlationId,
      aggregateId: contact.id,
      aggregateType: 'payment',
      payload: {
        stripePaymentId: payment.paymentId,
        hubspotContactId: contact.id,
        amount: payment.amount,
        currency: payment.currency,
      },
    });

    const events = await eventStore.getByAggregateId(contact.id);
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('payment.received');
  });

  it('should handle failed payment with task creation', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });
    const eventStore = createInMemoryEventStore('payment-failed-test');

    const failedPayment = {
      paymentId: 'pi_failed123',
      amount: 100000,
      currency: 'ron',
      customerEmail: 'test@example.com',
      failureCode: 'card_declined',
      failureReason: 'Your card was declined',
    };

    // Find contact
    const contact = await hubspot.findContactByEmail(failedPayment.customerEmail);

    if (contact) {
      // Log failed payment
      await hubspot.logPaymentToTimeline({
        contactId: contact.id,
        paymentId: failedPayment.paymentId,
        amount: failedPayment.amount,
        currency: failedPayment.currency,
        status: `failed: ${failedPayment.failureReason}`,
      });

      // Create follow-up task
      const task = await hubspot.createTask({
        contactId: contact.id,
        subject: 'PAYMENT FAILED',
        body: `Reason: ${failedPayment.failureReason}`,
        priority: 'HIGH',
      });
      expect(task.id).toBeDefined();
    }

    // Emit domain event
    await eventStore.emit({
      type: 'payment.failed',
      correlationId,
      aggregateId: failedPayment.paymentId,
      aggregateType: 'payment',
      payload: {
        ...failedPayment,
      },
    });
  });
});

describe('Lead Scoring Integration', () => {
  it('should correctly classify hot leads', async () => {
    const scoring = createScoringService({
      openaiApiKey: 'test-key',
      fallbackEnabled: true,
    });

    const hotLeadContext = LeadContextBuilder.fromWhatsApp({
      from: '+40721000001',
      message: {
        id: 'msg_hot',
        body: 'Vreau All-on-4, am buget de 15000 euro. Când pot veni?',
        type: 'text',
      },
      metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
    }).buildForScoring();

    const result = await scoring.scoreMessage(hotLeadContext);

    // OpenAI mock returns HOT classification
    expect(result.classification).toBe('HOT');
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it('should detect procedure interest', async () => {
    const scoring = createScoringService({
      openaiApiKey: 'test-key',
      fallbackEnabled: true,
    });

    const context = LeadContextBuilder.fromWhatsApp({
      from: '+40721000001',
      message: {
        id: 'msg_proc',
        body: 'Informatii despre implanturi si fatete dentare',
        type: 'text',
      },
      metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
    }).buildForScoring();

    const result = await scoring.scoreMessage(context);
    expect(result.procedureInterest).toBeDefined();
  });
});

describe('HubSpot Integration', () => {
  it('should search contacts by phone', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });

    // This phone matches the MSW mock
    const contacts = await hubspot.searchContactsByPhone('+40721000001');
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts[0]?.id).toBe('hs_contact_123');
  });

  it('should create and update contacts', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });

    // Create new contact
    const newContact = await hubspot.syncContact({
      phone: '+40721999999',
      name: 'New User',
      email: 'new@example.com',
    });
    expect(newContact.id).toBeDefined();

    // Update contact
    await hubspot.updateContact(newContact.id, {
      lead_score: '5',
      lead_status: 'HOT',
    });
  });

  it('should log messages to timeline', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });

    await hubspot.logMessageToTimeline({
      contactId: 'hs_contact_123',
      message: 'Test message',
      direction: 'IN',
      channel: 'whatsapp',
      messageId: 'msg_test',
    });
  });
});

describe('WhatsApp Integration', () => {
  it('should send text messages', async () => {
    const whatsapp = createWhatsAppClient({
      apiKey: 'test-key',
      phoneNumberId: '123456789',
    });

    const result = await whatsapp.sendText({
      to: '+40721000001',
      text: 'Test message',
    });

    expect(result.messages[0]?.id).toBeDefined();
  });

  it('should send template messages', async () => {
    const whatsapp = createWhatsAppClient({
      apiKey: 'test-key',
      phoneNumberId: '123456789',
    });

    const result = await whatsapp.sendTemplate({
      to: '+40721000001',
      templateName: 'appointment_confirmation',
      language: 'ro',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '15 Ianuarie 2025' },
            { type: 'text', text: '10:00' },
            { type: 'text', text: 'Clinica Dentara' },
          ],
        },
      ],
    });

    expect(result.messages[0]?.id).toBeDefined();
  });

  it('should send interactive buttons', async () => {
    const whatsapp = createWhatsAppClient({
      apiKey: 'test-key',
      phoneNumberId: '123456789',
    });

    const result = await whatsapp.sendInteractiveButtons({
      to: '+40721000001',
      headerText: 'Confirmare',
      bodyText: 'Doriti sa confirmati programarea?',
      buttons: [
        { id: 'confirm', title: 'Da, confirm' },
        { id: 'reschedule', title: 'Reprogramare' },
      ],
    });

    expect(result.messages[0]?.id).toBeDefined();
  });
});

describe('Event Store Integration', () => {
  it('should store and retrieve events', async () => {
    const eventStore = createInMemoryEventStore('test');

    await eventStore.emit({
      type: 'test.event',
      correlationId: 'test-123',
      aggregateId: 'aggregate-1',
      aggregateType: 'test',
      payload: { data: 'test' },
    });

    const events = await eventStore.getByAggregateId('aggregate-1');
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('test.event');
  });

  it('should find events by type', async () => {
    const eventStore = createInMemoryEventStore('test2');

    await eventStore.emit({
      type: 'whatsapp.message.received',
      correlationId: 'test-1',
      aggregateId: 'lead-1',
      aggregateType: 'lead',
      payload: {},
    });

    await eventStore.emit({
      type: 'payment.received',
      correlationId: 'test-2',
      aggregateId: 'payment-1',
      aggregateType: 'payment',
      payload: {},
    });

    const waEvents = await eventStore.getByType('whatsapp.message.received');
    expect(waEvents.length).toBe(1);
  });
});
