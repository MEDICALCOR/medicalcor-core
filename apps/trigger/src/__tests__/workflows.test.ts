import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testFixtures } from '@medicalcor/integrations/__mocks__/handlers';

/**
 * Integration tests for Trigger.dev workflows
 * Tests workflow logic with mocked external services
 */

// Mock environment variables
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('WHATSAPP_API_KEY', 'test-whatsapp-key');
vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456789');
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
vi.stubEnv('DATABASE_URL', '');

import {
  createHubSpotClient,
  createWhatsAppClient,
  createOpenAIClient,
} from '@medicalcor/integrations';
import { createScoringService } from '@medicalcor/domain';
import { LeadContextBuilder, createInMemoryEventStore } from '@medicalcor/core';

describe('Lead Scoring Workflow', () => {
  const correlationId = 'lead-scoring-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AI-powered scoring', () => {
    it('should score lead with GPT-4o and enrich from HubSpot', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const openai = createOpenAIClient({ apiKey: 'test-key' });
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      const eventStore = createInMemoryEventStore('lead-scoring');

      // Simulate workflow input
      const input = {
        phone: '+40721000001',
        hubspotContactId: 'hs_contact_123',
        message: testFixtures.messages.hotLead,
        channel: 'whatsapp' as const,
        messageHistory: [
          { role: 'user' as const, content: 'Hello', timestamp: new Date().toISOString() },
          {
            role: 'assistant' as const,
            content: 'Hi, how can I help?',
            timestamp: new Date().toISOString(),
          },
        ],
        correlationId,
      };

      // Step 1: Get existing contact for enrichment
      const existingContact = await hubspot.getContact(input.hubspotContactId);
      expect(existingContact.id).toBe('hs_contact_123');

      // Step 2: Build lead context with history
      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: input.phone,
        message: {
          id: 'msg_scoring',
          body: input.message,
          type: 'text',
        },
        metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
      })
        .withCorrelationId(correlationId)
        .withHubSpotContact(input.hubspotContactId)
        .withMessageHistory(input.messageHistory)
        .buildForScoring();

      expect(leadContext.messageHistory?.length).toBe(2);

      // Step 3: AI Scoring
      const scoreResult = await scoring.scoreMessage(leadContext);
      expect(scoreResult.score).toBeGreaterThanOrEqual(1);
      expect(scoreResult.classification).toBeDefined();

      // Step 4: Detect language (mock may return 'unknown' if not implemented)
      const languageDetection = await openai.detectLanguage(input.message);
      expect(['ro', 'en', 'de', 'unknown']).toContain(languageDetection);

      // Step 5: Update HubSpot with score
      await hubspot.updateContact(input.hubspotContactId, {
        lead_score: String(scoreResult.score),
        lead_status: scoreResult.classification,
        lead_confidence: String(scoreResult.confidence),
      });

      // Step 6: Emit domain event
      await eventStore.emit({
        type: 'lead.scored',
        correlationId,
        aggregateId: input.hubspotContactId,
        aggregateType: 'lead',
        payload: {
          phone: input.phone,
          hubspotContactId: input.hubspotContactId,
          score: scoreResult.score,
          classification: scoreResult.classification,
          confidence: scoreResult.confidence,
          suggestedAction: scoreResult.suggestedAction,
        },
      });

      const events = await eventStore.getByAggregateId(input.hubspotContactId);
      expect(events.length).toBe(1);
      expect(events[0]?.type).toBe('lead.scored');
    });

    it('should fallback to rule-based scoring on AI failure', async () => {
      const scoring = createScoringService({
        openaiApiKey: '',
        fallbackEnabled: true,
      });

      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: '+40721000001',
        message: {
          id: 'msg_fallback',
          body: 'Vreau implant dentar urgent! Cat costa All-on-4?',
          type: 'text',
        },
        metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
      }).buildForScoring();

      // Rule-based scoring as fallback
      const scoreResult = scoring.ruleBasedScore(leadContext);

      expect(scoreResult.score).toBeGreaterThanOrEqual(1);
      expect(scoreResult.score).toBeLessThanOrEqual(5);
      expect(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).toContain(scoreResult.classification);
      // Rule-based should detect "urgent" and "implant" keywords
      expect(scoreResult.score).toBeGreaterThanOrEqual(3);
    });

    it('should handle message history for context-aware scoring', async () => {
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });

      const messageHistory = [
        { role: 'user' as const, content: 'Hello', timestamp: new Date().toISOString() },
        {
          role: 'assistant' as const,
          content: 'Bună ziua! Cu ce vă putem ajuta?',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'user' as const,
          content: 'Am o problemă cu un dinte',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant' as const,
          content: 'Vom încerca să vă ajutăm.',
          timestamp: new Date().toISOString(),
        },
      ];

      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: '+40721000001',
        message: {
          id: 'msg_history',
          body: 'Cat costa un implant? Am nevoie urgent.',
          type: 'text',
        },
        metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
      })
        .withMessageHistory(messageHistory)
        .buildForScoring();

      expect(leadContext.messageHistory?.length).toBe(4);

      const scoreResult = await scoring.scoreMessage(leadContext);
      expect(scoreResult).toBeDefined();
    });
  });
});

describe('Patient Journey Workflow', () => {
  const correlationId = 'patient-journey-test-123';

  describe('HOT lead routing', () => {
    it('should create urgent task and send acknowledgment for HOT leads', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });
      const eventStore = createInMemoryEventStore('patient-journey-hot');

      // Simulate HOT lead input
      const input = {
        phone: '+40721000001',
        hubspotContactId: 'hs_contact_123',
        channel: 'whatsapp',
        initialScore: 5,
        classification: 'HOT' as const,
        procedureInterest: ['All-on-4', 'implant'],
        correlationId,
      };

      // Stage 1: Create urgent HubSpot task
      const task = await hubspot.createTask({
        contactId: input.hubspotContactId,
        subject: `URGENT: Hot lead requires immediate follow-up`,
        body: `Lead score: ${input.initialScore}/5. Interested in: ${input.procedureInterest.join(', ')}`,
        priority: 'HIGH',
        dueDate: new Date(),
      });
      expect(task.id).toBeDefined();

      // Send acknowledgment template
      const templateResult = await whatsapp.sendTemplate({
        to: input.phone,
        templateName: 'hot_lead_acknowledgment',
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'valued customer' }],
          },
        ],
      });
      expect(templateResult.messages[0]?.id).toBeDefined();

      // Emit engagement event
      await eventStore.emit({
        type: 'lead.engaged',
        correlationId,
        aggregateId: input.hubspotContactId,
        aggregateType: 'lead',
        payload: {
          phone: input.phone,
          classification: input.classification,
        },
      });

      // Stage 3: Send booking prompt
      const bookingPrompt = await whatsapp.sendInteractiveButtons({
        to: input.phone,
        headerText: 'Programare Consultație',
        bodyText: 'Doriți să programați o consultație gratuită?',
        buttons: [
          { id: 'book_yes', title: 'Da, vreau să programez' },
          { id: 'book_later', title: 'Mai târziu' },
        ],
      });
      expect(bookingPrompt.messages[0]?.id).toBeDefined();

      const events = await eventStore.getByType('lead.engaged');
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('WARM lead routing', () => {
    it('should trigger nurture sequence for WARM leads', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });
      const eventStore = createInMemoryEventStore('patient-journey-warm');

      const input = {
        phone: '+40721000002',
        hubspotContactId: 'hs_contact_warm',
        channel: 'whatsapp',
        initialScore: 3,
        classification: 'WARM' as const,
        correlationId,
      };

      // Send initial warm lead message
      const message = await whatsapp.sendText({
        to: input.phone,
        text: 'Bună ziua! Vă mulțumim pentru interesul acordat serviciilor noastre. Echipa noastră vă va contacta în curând.',
      });
      expect(message.messages[0]?.id).toBeDefined();

      // Emit event for nurture trigger
      await eventStore.emit({
        type: 'nurture.sequence.started',
        correlationId,
        aggregateId: input.hubspotContactId,
        aggregateType: 'lead',
        payload: {
          phone: input.phone,
          sequenceType: 'warm_lead',
        },
      });
    });
  });

  describe('COLD lead routing', () => {
    it('should send informational message for COLD leads', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const input = {
        phone: '+40721000003',
        hubspotContactId: 'hs_contact_cold',
        classification: 'COLD' as const,
        correlationId,
      };

      // Send cold lead introduction
      const message = await whatsapp.sendText({
        to: input.phone,
        text: 'Bună ziua! Vă mulțumim că ne-ați contactat. Dacă aveți întrebări despre serviciile noastre, suntem aici să vă ajutăm.',
      });
      expect(message.messages[0]?.id).toBeDefined();
    });
  });

  describe('UNQUALIFIED lead handling', () => {
    it('should send polite acknowledgment for UNQUALIFIED leads', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const input = {
        phone: '+40721000004',
        classification: 'UNQUALIFIED' as const,
        correlationId,
      };

      const message = await whatsapp.sendText({
        to: input.phone,
        text: 'Bună ziua! Vă mulțumim pentru mesaj. Dacă aveți întrebări în viitor, nu ezitați să ne contactați.',
      });
      expect(message.messages[0]?.id).toBeDefined();
    });
  });
});

describe('Nurture Sequence Workflow', () => {
  it('should configure correct sequence based on type', async () => {
    const sequences: Record<string, { delays: number[]; templates: string[] }> = {
      warm_lead: {
        delays: [24, 72, 168],
        templates: ['warm_followup_1', 'warm_followup_2', 'warm_followup_3'],
      },
      cold_lead: {
        delays: [48, 168, 336],
        templates: ['cold_reengagement_1', 'cold_reengagement_2', 'cold_reengagement_3'],
      },
      post_consultation: {
        delays: [24, 72, 168],
        templates: ['post_consult_1', 'post_consult_2', 'post_consult_3'],
      },
      recall: {
        delays: [24, 168, 336],
        templates: ['recall_reminder_1', 'recall_reminder_2', 'recall_final'],
      },
    };

    // Verify warm_lead sequence
    expect(sequences.warm_lead?.delays).toEqual([24, 72, 168]);
    expect(sequences.warm_lead?.templates.length).toBe(3);

    // Verify cold_lead has longer delays
    expect(sequences.cold_lead?.delays[0]).toBeGreaterThan(sequences.warm_lead?.delays[0] ?? 0);
  });

  it('should stop sequence if lead converts to customer', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });

    // Simulate checking if lead converted
    const contact = await hubspot.getContact('hs_contact_123');

    // In real workflow, if lifecyclestage === 'customer', sequence stops
    const shouldStopSequence = contact.properties.lifecyclestage === 'customer';

    // Our mock returns 'lead', so sequence should continue
    expect(shouldStopSequence).toBe(false);
  });

  it('should send nurture templates via WhatsApp', async () => {
    const whatsapp = createWhatsAppClient({
      apiKey: 'test-key',
      phoneNumberId: '123456789',
    });

    const templates = ['warm_followup_1', 'warm_followup_2', 'warm_followup_3'];

    for (const template of templates) {
      const result = await whatsapp.sendTemplate({
        to: '+40721000001',
        templateName: template,
      });
      expect(result.messages[0]?.id).toBeDefined();
    }
  });
});

describe('Booking Agent Workflow', () => {
  const correlationId = 'booking-test-123';

  it('should present available slots via interactive list', async () => {
    const whatsapp = createWhatsAppClient({
      apiKey: 'test-key',
      phoneNumberId: '123456789',
    });

    // Mock available slots
    const availableSlots = [
      { id: 'slot_1', startTime: '2025-01-15T10:00:00', duration: 60 },
      { id: 'slot_2', startTime: '2025-01-15T14:00:00', duration: 60 },
      { id: 'slot_3', startTime: '2025-01-16T09:00:00', duration: 60 },
    ];

    // Send interactive list with slots
    const result = await whatsapp.sendInteractiveList({
      to: '+40721000001',
      headerText: 'Programări Disponibile',
      bodyText: 'Am găsit următoarele intervale disponibile:',
      buttonText: 'Alege un interval',
      sections: [
        {
          title: 'Intervale disponibile',
          rows: availableSlots.map((slot) => ({
            id: `slot_${slot.id}`,
            title: new Date(slot.startTime).toLocaleString('ro-RO'),
            description: `${slot.duration} minute`,
          })),
        },
      ],
    });

    expect(result.messages[0]?.id).toBeDefined();
  });

  it('should send confirmation after booking', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });
    const whatsapp = createWhatsAppClient({
      apiKey: 'test-key',
      phoneNumberId: '123456789',
    });
    const eventStore = createInMemoryEventStore('booking');

    const appointment = {
      id: 'apt_123',
      scheduledAt: '2025-01-15T10:00:00',
      procedureType: 'consultation',
      confirmationCode: 'CONF-123',
      location: { name: 'Clinica Dentara', address: 'Str. Example 123' },
    };

    // Send confirmation template
    const confirmation = await whatsapp.sendTemplate({
      to: '+40721000001',
      templateName: 'appointment_confirmation',
      language: 'ro',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: '15 Ianuarie 2025' },
            { type: 'text', text: '10:00' },
            { type: 'text', text: appointment.location.name },
          ],
        },
      ],
    });
    expect(confirmation.messages[0]?.id).toBeDefined();

    // Update HubSpot contact
    await hubspot.updateContact('hs_contact_123', {
      lifecyclestage: 'opportunity',
      next_appointment_date: appointment.scheduledAt,
      appointment_procedure: appointment.procedureType,
    });

    // Emit domain event
    await eventStore.emit({
      type: 'appointment.scheduled',
      correlationId,
      aggregateId: appointment.id,
      aggregateType: 'appointment',
      payload: {
        appointmentId: appointment.id,
        hubspotContactId: 'hs_contact_123',
        procedureType: appointment.procedureType,
        scheduledAt: appointment.scheduledAt,
        confirmationCode: appointment.confirmationCode,
      },
    });

    const events = await eventStore.getByType('appointment.scheduled');
    expect(events.length).toBe(1);
  });

  it('should handle no available slots gracefully', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });
    const whatsapp = createWhatsAppClient({
      apiKey: 'test-key',
      phoneNumberId: '123456789',
    });

    const availableSlots: unknown[] = [];

    if (availableSlots.length === 0) {
      // Send no slots message
      const message = await whatsapp.sendText({
        to: '+40721000001',
        text: 'Ne pare rău, în momentul de față nu avem intervale disponibile. Un coleg vă va contacta în curând.',
      });
      expect(message.messages[0]?.id).toBeDefined();

      // Create HubSpot task for manual follow-up
      const task = await hubspot.createTask({
        contactId: 'hs_contact_123',
        subject: 'No slots available - manual scheduling needed',
        body: 'Patient tried to book but no slots were available.',
        priority: 'HIGH',
      });
      expect(task.id).toBeDefined();
    }
  });
});

describe('Multi-language Support', () => {
  it('should handle Romanian messages', async () => {
    const scoring = createScoringService({
      openaiApiKey: 'test-key',
      fallbackEnabled: true,
    });

    const context = LeadContextBuilder.fromWhatsApp({
      from: '+40721000001',
      message: {
        id: 'msg_ro',
        body: 'Bună ziua, aș dori informații despre implanturi.',
        type: 'text',
      },
      metadata: { phone_number_id: '123', display_phone_number: '+40212000000' },
    }).buildForScoring();

    const result = await scoring.scoreMessage(context);
    expect(result).toBeDefined();
  });

  it('should format dates for different languages', () => {
    const date = new Date('2025-01-15T10:00:00');

    const roFormat = date.toLocaleDateString('ro-RO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(roFormat).toContain('ianuarie');

    const enFormat = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(enFormat).toContain('January');

    const deFormat = date.toLocaleDateString('de-DE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    expect(deFormat).toContain('Januar');
  });
});
