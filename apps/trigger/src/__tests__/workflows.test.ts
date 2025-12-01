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

// =============================================================================
// Voice Transcription Workflow Tests
// =============================================================================

describe('Voice Transcription Workflow', () => {
  const correlationId = 'voice-transcription-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Post-Call Processing', () => {
    it('should process transcript and score lead from voice call', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const openai = createOpenAIClient({ apiKey: 'test-key' });
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      const eventStore = createInMemoryEventStore('voice-transcription');

      // Simulate post-call payload
      const payload = {
        callId: 'call_123',
        customerPhone: '+40721000001',
        customerName: 'Ion Popescu',
        callType: 'inbound' as const,
        endedReason: 'customer-ended-call',
        duration: 180,
        correlationId,
      };

      // Step 1: Build lead context from call
      const leadContext = LeadContextBuilder.fromWhatsApp({
        from: payload.customerPhone,
        message: {
          id: `voice_${payload.callId}`,
          body: 'Bună ziua, vreau să programez o consultație pentru implant dentar.',
          type: 'text',
        },
        metadata: { phone_number_id: 'voice', display_phone_number: '+40212000000' },
      }).buildForScoring();

      // Step 2: Score lead from transcript
      const scoreResult = await scoring.scoreMessage(leadContext);
      expect(scoreResult.score).toBeGreaterThanOrEqual(1);
      expect(scoreResult.classification).toBeDefined();

      // Step 3: Generate AI summary
      const transcript = 'Bună ziua, vreau să programez o consultație pentru implant dentar.';
      const aiSummary = await openai.summarize(transcript, 'ro');
      expect(aiSummary).toBeDefined();

      // Step 4: Analyze sentiment
      const sentiment = await openai.analyzeSentiment(transcript);
      expect(['positive', 'neutral', 'negative']).toContain(sentiment.sentiment);

      // Step 5: Sync to HubSpot
      const contact = await hubspot.syncContact({
        phone: payload.customerPhone,
        name: payload.customerName,
        properties: {
          lead_source: 'voice',
          last_call_date: new Date().toISOString(),
        },
      });
      expect(contact.id).toBeDefined();

      // Step 6: Emit domain event
      await eventStore.emit({
        type: 'voice.transcript.processed',
        correlationId,
        aggregateId: payload.customerPhone,
        aggregateType: 'lead',
        payload: {
          callId: payload.callId,
          from: payload.customerPhone,
          callType: payload.callType,
          duration: payload.duration,
          hubspotContactId: contact.id,
          score: scoreResult.score,
          classification: scoreResult.classification,
          sentiment: sentiment.sentiment,
          hasTranscript: true,
        },
      });

      const events = await eventStore.getByType('voice.transcript.processed');
      expect(events.length).toBe(1);
    });

    it('should handle GDPR consent check before processing transcript', async () => {
      const eventStore = createInMemoryEventStore('voice-consent');

      // Simulate consent check failure
      const consentCheck = {
        valid: false,
        missing: ['data_processing', 'voice_recording'],
      };

      if (!consentCheck.valid) {
        await eventStore.emit({
          type: 'voice.transcript.consent_required',
          correlationId,
          aggregateId: 'hs_contact_123',
          aggregateType: 'lead',
          payload: {
            callId: 'call_123',
            contactId: 'hs_contact_123',
            missingConsents: consentCheck.missing,
            message: 'Voice transcript processing skipped due to missing GDPR consent',
          },
        });
      }

      const events = await eventStore.getByType('voice.transcript.consent_required');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.missingConsents).toContain('data_processing');
    });

    it('should extract keywords from transcript', () => {
      const transcript =
        'Bună ziua, mă interesează prețul pentru un implant dentar. Am nevoie urgent pentru că am durere. Aș vrea să știu și despre All-on-4.';

      // Procedure keywords (Romanian)
      const PROCEDURE_KEYWORDS = [
        { keyword: 'implant', category: 'implant', priority: 'high' },
        { keyword: 'all-on-4', category: 'full_arch', priority: 'high' },
        { keyword: 'durere', category: 'urgent', priority: 'high' },
      ];

      const lowerTranscript = transcript.toLowerCase();
      const procedureMentions = PROCEDURE_KEYWORDS.filter((p) =>
        lowerTranscript.includes(p.keyword)
      );

      expect(procedureMentions.length).toBeGreaterThanOrEqual(2);
      expect(procedureMentions.some((p) => p.keyword === 'implant')).toBe(true);
    });

    it('should create priority task for HOT leads from voice calls', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const scoreResult = {
        score: 5,
        classification: 'HOT' as const,
        confidence: 0.9,
        suggestedAction: 'Immediate callback',
        procedureInterest: ['implant', 'All-on-4'],
      };

      // Create urgent task for HOT voice lead
      const task = await hubspot.createTask({
        contactId: 'hs_contact_123',
        subject: 'HIGH PRIORITY - Voice: Ion Popescu',
        body: `Summary: Patient interested in implant\nProcedure Interest: ${scoreResult.procedureInterest.join(', ')}\nSuggested Action: ${scoreResult.suggestedAction}`,
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });

      expect(task.id).toBeDefined();
    });
  });

  describe('Vapi Webhook Handler', () => {
    it('should process call.ended webhook and trigger post-call processing', async () => {
      const eventStore = createInMemoryEventStore('vapi-webhook');

      const webhookPayload = {
        type: 'call.ended' as const,
        call: {
          id: 'vapi_call_123',
          status: 'ended',
          type: 'inbound' as const,
          customer: {
            number: '+40721000001',
            name: 'Maria Ionescu',
          },
          endedReason: 'assistant-ended-call',
          cost: 0.15,
          startedAt: '2025-01-15T10:00:00Z',
          endedAt: '2025-01-15T10:05:00Z',
        },
        correlationId,
      };

      // Emit webhook received event
      await eventStore.emit({
        type: 'vapi.webhook.received',
        correlationId: webhookPayload.correlationId,
        aggregateId: webhookPayload.call.id,
        aggregateType: 'voice_call',
        payload: {
          callId: webhookPayload.call.id,
          status: webhookPayload.call.status,
          type: webhookPayload.call.type,
          customerPhone: webhookPayload.call.customer.number,
          endedReason: webhookPayload.call.endedReason,
          cost: webhookPayload.call.cost,
        },
      });

      const events = await eventStore.getByType('vapi.webhook.received');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.callId).toBe('vapi_call_123');
    });

    it('should ignore non-ended calls', () => {
      const webhookPayload = {
        type: 'call.ended' as const,
        call: {
          id: 'vapi_call_456',
          status: 'in-progress', // Not ended
          type: 'inbound' as const,
        },
      };

      // Should not process in-progress calls
      const shouldProcess = webhookPayload.call.status === 'ended';
      expect(shouldProcess).toBe(false);
    });

    it('should reject webhooks without customer phone', () => {
      const webhookPayload = {
        type: 'call.ended' as const,
        call: {
          id: 'vapi_call_789',
          status: 'ended',
          type: 'inbound' as const,
          customer: undefined, // No customer info
        },
      };

      const hasCustomerPhone = !!webhookPayload.call.customer?.number;
      expect(hasCustomerPhone).toBe(false);
    });
  });
});

// =============================================================================
// Retention Scoring Workflow Tests
// =============================================================================

describe('Retention Scoring Workflow', () => {
  const correlationId = 'retention-scoring-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Retention Score Calculation', () => {
    it('should calculate retention score based on patient metrics', () => {
      // Test calculation function logic
      function calculateRetentionScore(params: {
        daysInactive: number;
        canceledAppointments: number;
        npsScore: number | null;
        lifetimeValue: number;
        totalTreatments: number;
      }): {
        score: number;
        churnRisk: 'SCAZUT' | 'MEDIU' | 'RIDICAT' | 'FOARTE_RIDICAT';
        followUpPriority: 'URGENTA' | 'RIDICATA' | 'MEDIE' | 'SCAZUTA';
      } {
        let score = 100;

        // Factor 1: Days Inactive
        if (params.daysInactive > 90) score -= 40;
        else if (params.daysInactive > 60) score -= 30;
        else if (params.daysInactive > 30) score -= 20;
        else if (params.daysInactive > 7) score -= 10;

        // Factor 2: Canceled Appointments
        score -= Math.min(params.canceledAppointments * 10, 30);

        // Factor 3: NPS Score
        if (params.npsScore !== null) {
          if (params.npsScore <= 6) score -= 20;
          else if (params.npsScore <= 8) score -= 5;
          else score += 10;
        }

        // Factor 4: Engagement bonus
        if (params.totalTreatments >= 6) score += 10;
        else if (params.totalTreatments >= 3) score += 5;

        // Factor 5: High-value bonus
        if (params.lifetimeValue > 20000) score += 5;

        score = Math.max(0, Math.min(100, score));

        // Determine churn risk
        let churnRisk: 'SCAZUT' | 'MEDIU' | 'RIDICAT' | 'FOARTE_RIDICAT';
        if (score >= 80) churnRisk = 'SCAZUT';
        else if (score >= 50) churnRisk = 'MEDIU';
        else if (score >= 30) churnRisk = 'RIDICAT';
        else churnRisk = 'FOARTE_RIDICAT';

        // Determine follow-up priority
        const isHighValue = params.lifetimeValue > 10000;
        let followUpPriority: 'URGENTA' | 'RIDICATA' | 'MEDIE' | 'SCAZUTA';
        if (churnRisk === 'FOARTE_RIDICAT' || (churnRisk === 'RIDICAT' && isHighValue)) {
          followUpPriority = 'URGENTA';
        } else if (churnRisk === 'RIDICAT' || (churnRisk === 'MEDIU' && isHighValue)) {
          followUpPriority = 'RIDICATA';
        } else if (churnRisk === 'MEDIU') {
          followUpPriority = 'MEDIE';
        } else {
          followUpPriority = 'SCAZUTA';
        }

        return { score, churnRisk, followUpPriority };
      }

      // Test healthy patient (low churn risk)
      const healthyPatient = calculateRetentionScore({
        daysInactive: 5,
        canceledAppointments: 0,
        npsScore: 9, // Promoter
        lifetimeValue: 25000,
        totalTreatments: 8,
      });
      expect(healthyPatient.score).toBeGreaterThanOrEqual(80);
      expect(healthyPatient.churnRisk).toBe('SCAZUT');
      expect(healthyPatient.followUpPriority).toBe('SCAZUTA');

      // Test at-risk patient (high churn risk)
      const atRiskPatient = calculateRetentionScore({
        daysInactive: 100,
        canceledAppointments: 2,
        npsScore: 5, // Detractor
        lifetimeValue: 5000,
        totalTreatments: 1,
      });
      expect(atRiskPatient.score).toBeLessThanOrEqual(30);
      expect(atRiskPatient.churnRisk).toBe('FOARTE_RIDICAT');
      expect(atRiskPatient.followUpPriority).toBe('URGENTA');

      // Test medium risk patient
      const mediumRiskPatient = calculateRetentionScore({
        daysInactive: 45,
        canceledAppointments: 1,
        npsScore: 7, // Passive
        lifetimeValue: 8000,
        totalTreatments: 3,
      });
      expect(mediumRiskPatient.churnRisk).toBe('MEDIU');
    });

    it('should emit churn risk event for high-risk patients', async () => {
      const eventStore = createInMemoryEventStore('retention-scoring');

      const result = {
        score: 25,
        churnRisk: 'FOARTE_RIDICAT' as const,
        followUpPriority: 'URGENTA' as const,
      };

      // Emit churn risk event
      await eventStore.emit({
        type: 'patient.churn_risk_detected',
        correlationId,
        aggregateId: 'hs_contact_123',
        aggregateType: 'patient',
        payload: {
          contactId: 'hs_contact_123',
          retentionScore: result.score,
          churnRisk: result.churnRisk,
          followUpPriority: result.followUpPriority,
          lifetimeValue: 15000,
          patientName: 'Ion Popescu',
          phone: '+40721000001',
        },
      });

      const events = await eventStore.getByType('patient.churn_risk_detected');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.churnRisk).toBe('FOARTE_RIDICAT');
    });

    it('should update HubSpot with retention metrics', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      await hubspot.updateContact('hs_contact_123', {
        retention_score: '75',
        churn_risk: 'MEDIU',
        days_inactive: '30',
        follow_up_priority: 'MEDIE',
      });

      // Verify contact was updated (mock verifies call was made)
      const contact = await hubspot.getContact('hs_contact_123');
      expect(contact.id).toBe('hs_contact_123');
    });
  });

  describe('Batch Retention Scoring', () => {
    it('should process multiple patients with rate limiting', async () => {
      const patients = [
        { id: 'p1', daysInactive: 10, lifetimeValue: 5000 },
        { id: 'p2', daysInactive: 100, lifetimeValue: 25000 },
        { id: 'p3', daysInactive: 50, lifetimeValue: 12000 },
      ];

      let scored = 0;
      const highRisk: string[] = [];

      for (const patient of patients) {
        // Simulate scoring
        const score = patient.daysInactive > 90 ? 20 : patient.daysInactive > 30 ? 60 : 90;
        scored++;

        if (score < 30) {
          highRisk.push(patient.id);
        }

        // Rate limiting simulation
        if (scored % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 10)); // Reduced for test
        }
      }

      expect(scored).toBe(3);
      expect(highRisk).toContain('p2');
    });

    it('should emit batch completion event', async () => {
      const eventStore = createInMemoryEventStore('retention-batch');

      await eventStore.emit({
        type: 'retention.batch_scoring_completed',
        correlationId,
        aggregateId: 'system',
        aggregateType: 'retention',
        payload: {
          totalPatients: 150,
          scored: 148,
          highRiskCount: 23,
          errors: 2,
        },
      });

      const events = await eventStore.getByType('retention.batch_scoring_completed');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.totalPatients).toBe(150);
    });
  });
});

// =============================================================================
// Cron Jobs Tests
// =============================================================================

describe('Cron Jobs', () => {
  const correlationId = 'cron-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GDPR Consent Audit', () => {
    it('should identify contacts with expiring consent', () => {
      // Simulate contacts with consent approaching 2 years
      // c1: consent from 24 months ago (expired, needs renewal)
      // c2: consent from 6 months ago (still valid)
      const twentyFourMonthsAgoMs = Date.now() - 24 * 30 * 24 * 60 * 60 * 1000;
      const sixMonthsAgoMs = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;

      const contacts = [
        {
          id: 'c1',
          properties: {
            phone: '+40721000001',
            consent_date: new Date(twentyFourMonthsAgoMs).toISOString(), // 24 months ago - needs renewal
            consent_marketing: 'true',
            consent_renewal_sent: undefined,
          },
        },
        {
          id: 'c2',
          properties: {
            phone: '+40721000002',
            consent_date: new Date(sixMonthsAgoMs).toISOString(), // 6 months ago - still valid
            consent_marketing: 'true',
          },
        },
      ];

      // Threshold: consent is expiring if older than 22 months (approaching 2 year limit)
      const almostTwoYearsAgoMs = Date.now() - 22 * 30 * 24 * 60 * 60 * 1000;

      const contactsNeedingRenewal = contacts.filter((c) => {
        if (!c.properties.phone) return false;
        if (c.properties.consent_renewal_sent) return false;

        const consentDate = new Date(c.properties.consent_date).getTime();
        return consentDate < almostTwoYearsAgoMs;
      });

      expect(contactsNeedingRenewal.length).toBe(1);
      expect(contactsNeedingRenewal[0]?.id).toBe('c1');
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

    it('should emit GDPR consent audit completion event', async () => {
      const eventStore = createInMemoryEventStore('gdpr-consent');

      await eventStore.emit({
        type: 'cron.gdpr_consent_audit.completed',
        correlationId,
        aggregateId: 'cron',
        aggregateType: 'cron',
        payload: {
          expiringFound: 25,
          consentRenewalsSent: 23,
          errors: 2,
          correlationId,
        },
      });

      const events = await eventStore.getByType('cron.gdpr_consent_audit.completed');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.consentRenewalsSent).toBe(23);
    });
  });

  describe('Appointment Reminders', () => {
    it('should verify GDPR consent before sending reminders', () => {
      type ConsentType =
        | 'marketing'
        | 'appointment_reminders'
        | 'treatment_updates'
        | 'data_processing';

      function hasValidConsent(
        contact: { properties: Record<string, string | undefined> },
        consentType: ConsentType
      ): boolean {
        const props = contact.properties;

        // Check specific consent property
        const specificConsentProp = `consent_${consentType}`;
        if (props[specificConsentProp] === 'true') return true;

        // For appointment_reminders, also accept treatment_updates consent
        if (consentType === 'appointment_reminders' && props.consent_treatment_updates === 'true') {
          return true;
        }

        // Do NOT fall back to general marketing consent for medical communications
        return false;
      }

      // Test patient with appointment_reminders consent
      const patientWithConsent = {
        properties: {
          consent_appointment_reminders: 'true',
          consent_marketing: 'true',
        },
      };
      expect(hasValidConsent(patientWithConsent, 'appointment_reminders')).toBe(true);

      // Test patient with only marketing consent (should NOT qualify)
      const patientWithOnlyMarketing = {
        properties: {
          consent_marketing: 'true',
        },
      };
      expect(hasValidConsent(patientWithOnlyMarketing, 'appointment_reminders')).toBe(false);

      // Test patient with treatment_updates consent (should qualify)
      const patientWithTreatmentConsent = {
        properties: {
          consent_treatment_updates: 'true',
        },
      };
      expect(hasValidConsent(patientWithTreatmentConsent, 'appointment_reminders')).toBe(true);
    });

    it('should identify appointments in 24h window', () => {
      function isIn24Hours(dateStr: string): boolean {
        const date = new Date(dateStr);
        const now = new Date();
        const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
        return diffHours > 23 && diffHours <= 25;
      }

      const appointmentIn24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const appointmentIn48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const appointmentIn1h = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();

      expect(isIn24Hours(appointmentIn24h)).toBe(true);
      expect(isIn24Hours(appointmentIn48h)).toBe(false);
      expect(isIn24Hours(appointmentIn1h)).toBe(false);
    });

    it('should identify appointments in 2h window', () => {
      function isIn2Hours(dateStr: string): boolean {
        const date = new Date(dateStr);
        const now = new Date();
        const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
        return diffHours > 1.5 && diffHours <= 2.5;
      }

      const appointmentIn2h = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const appointmentIn5h = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
      const appointmentIn30m = new Date(Date.now() + 0.5 * 60 * 60 * 1000).toISOString();

      expect(isIn2Hours(appointmentIn2h)).toBe(true);
      expect(isIn2Hours(appointmentIn5h)).toBe(false);
      expect(isIn2Hours(appointmentIn30m)).toBe(false);
    });

    it('should send 24h reminder template', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const appointmentDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const result = await whatsapp.sendTemplate({
        to: '+40721000001',
        templateName: 'appointment_reminder_24h',
        language: 'ro',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Ion' },
              {
                type: 'text',
                text: appointmentDate.toLocaleDateString('ro-RO', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }),
              },
              {
                type: 'text',
                text: appointmentDate.toLocaleTimeString('ro-RO', {
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

    it('should emit appointment reminders completion event', async () => {
      const eventStore = createInMemoryEventStore('appointment-reminders');

      await eventStore.emit({
        type: 'cron.appointment_reminders.completed',
        correlationId,
        aggregateId: 'cron',
        aggregateType: 'cron',
        payload: {
          reminders24hSent: 15,
          reminders2hSent: 8,
          errors: 1,
          correlationId,
        },
      });

      const events = await eventStore.getByType('cron.appointment_reminders.completed');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.reminders24hSent).toBe(15);
    });
  });

  describe('Daily Recall Check', () => {
    it('should find contacts due for recall (>6 months since last appointment)', () => {
      const sixMonthsAgoMs = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;

      const contacts = [
        {
          id: 'c1',
          properties: {
            last_appointment_date: new Date(
              Date.now() - 7 * 30 * 24 * 60 * 60 * 1000
            ).toISOString(), // 7 months ago
            consent_marketing: 'true',
            lifecyclestage: 'customer',
            phone: '+40721000001',
          },
        },
        {
          id: 'c2',
          properties: {
            last_appointment_date: new Date(
              Date.now() - 2 * 30 * 24 * 60 * 60 * 1000
            ).toISOString(), // 2 months ago
            consent_marketing: 'true',
            lifecyclestage: 'customer',
            phone: '+40721000002',
          },
        },
      ];

      const recallDue = contacts.filter((c) => {
        const lastAppointment = new Date(c.properties.last_appointment_date).getTime();
        return (
          lastAppointment < sixMonthsAgoMs &&
          c.properties.consent_marketing === 'true' &&
          c.properties.lifecyclestage === 'customer'
        );
      });

      expect(recallDue.length).toBe(1);
      expect(recallDue[0]?.id).toBe('c1');
    });

    it('should emit recall check completion event', async () => {
      const eventStore = createInMemoryEventStore('recall-check');

      await eventStore.emit({
        type: 'cron.daily_recall_check.completed',
        correlationId,
        aggregateId: 'cron',
        aggregateType: 'cron',
        payload: {
          contactsFound: 42,
          contactsProcessed: 40,
          errors: 2,
          correlationId,
        },
      });

      const events = await eventStore.getByType('cron.daily_recall_check.completed');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.contactsProcessed).toBe(40);
    });
  });

  describe('Stale Lead Cleanup', () => {
    it('should identify leads with no activity in 90+ days', () => {
      const ninetyDaysAgoMs = Date.now() - 90 * 24 * 60 * 60 * 1000;

      const leads = [
        {
          id: 'l1',
          properties: {
            notes_last_updated: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
            lifecyclestage: 'lead',
            lead_status: 'warm',
          },
        },
        {
          id: 'l2',
          properties: {
            notes_last_updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
            lifecyclestage: 'lead',
            lead_status: 'hot',
          },
        },
        {
          id: 'l3',
          properties: {
            notes_last_updated: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), // 120 days ago
            lifecyclestage: 'customer', // Customers should not be archived
            lead_status: 'customer',
          },
        },
      ];

      const staleLeads = leads.filter((l) => {
        const lastActivity = new Date(l.properties.notes_last_updated).getTime();
        return (
          lastActivity < ninetyDaysAgoMs &&
          l.properties.lifecyclestage !== 'customer' &&
          l.properties.lead_status !== 'archived'
        );
      });

      expect(staleLeads.length).toBe(1);
      expect(staleLeads[0]?.id).toBe('l1');
    });

    it('should archive stale leads with proper metadata', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      await hubspot.updateContact('hs_stale_lead', {
        lead_status: 'archived',
        archived_date: new Date().toISOString(),
        archived_reason: 'No activity for 90+ days',
      });

      // Verify update was called (mock)
      const contact = await hubspot.getContact('hs_stale_lead');
      expect(contact.id).toBeDefined();
    });

    it('should emit stale lead cleanup completion event', async () => {
      const eventStore = createInMemoryEventStore('stale-cleanup');

      await eventStore.emit({
        type: 'cron.stale_lead_cleanup.completed',
        correlationId,
        aggregateId: 'cron',
        aggregateType: 'cron',
        payload: {
          leadsFound: 35,
          leadsArchived: 33,
          errors: 2,
          correlationId,
        },
      });

      const events = await eventStore.getByType('cron.stale_lead_cleanup.completed');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.leadsArchived).toBe(33);
    });
  });

  describe('Weekly Analytics Report', () => {
    it('should format weekly report correctly', () => {
      function formatWeeklyReport(metrics: {
        newLeads: number;
        hotLeads: number;
        warmLeads: number;
        coldLeads: number;
        conversions: number;
        period: string;
        generatedAt: string;
      }): string {
        const conversionRate =
          metrics.newLeads > 0 ? ((metrics.conversions / metrics.newLeads) * 100).toFixed(1) : '0';

        return `Weekly Analytics Report
Period: ${metrics.period}
New leads: ${metrics.newLeads}
Hot leads: ${metrics.hotLeads}
Warm leads: ${metrics.warmLeads}
Cold leads: ${metrics.coldLeads}
Conversions: ${metrics.conversions}
Conversion Rate: ${conversionRate}%`;
      }

      const report = formatWeeklyReport({
        newLeads: 100,
        hotLeads: 15,
        warmLeads: 35,
        coldLeads: 50,
        conversions: 8,
        period: '7 days',
        generatedAt: new Date().toISOString(),
      });

      expect(report).toContain('New leads: 100');
      expect(report).toContain('Hot leads: 15');
      expect(report).toContain('Conversions: 8');
      expect(report).toContain('8.0%');
    });

    it('should emit weekly analytics completion event', async () => {
      const eventStore = createInMemoryEventStore('weekly-analytics');

      const metrics = {
        newLeads: 85,
        hotLeads: 12,
        warmLeads: 30,
        coldLeads: 43,
        conversions: 6,
      };

      await eventStore.emit({
        type: 'cron.weekly_analytics.completed',
        correlationId,
        aggregateId: 'cron',
        aggregateType: 'cron',
        payload: {
          metrics,
          correlationId,
        },
      });

      const events = await eventStore.getByType('cron.weekly_analytics.completed');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.metrics.newLeads).toBe(85);
    });
  });

  describe('Batch Processing with Retry', () => {
    it('should process items in batches with exponential backoff', async () => {
      const BATCH_SIZE = 10;
      const items = Array.from({ length: 25 }, (_, i) => ({ id: `item_${i}` }));

      let processed = 0;
      const errors: { id: string; error: string }[] = [];

      // Simulate batch processing
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (item) => {
            // Simulate random failure for testing
            if (item.id === 'item_15') {
              throw new Error('Simulated failure');
            }
            processed++;
            return item;
          })
        );

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result?.status === 'rejected') {
            errors.push({ id: batch[j]!.id, error: (result.reason as Error).message });
          }
        }
      }

      expect(processed).toBe(24); // 25 - 1 failure
      expect(errors.length).toBe(1);
      expect(errors[0]?.id).toBe('item_15');
    });

    it('should determine if error is retryable', () => {
      function isRetryableError(error: unknown): boolean {
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (message.includes('rate_limit') || message.includes('429')) return true;
          if (message.includes('timeout')) return true;
          if (message.includes('502') || message.includes('503') || message.includes('504'))
            return true;
          if (message.includes('network') || message.includes('econnreset')) return true;
        }
        return false;
      }

      expect(isRetryableError(new Error('Rate limit exceeded - 429'))).toBe(true);
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
      expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('Invalid input'))).toBe(false);
      expect(isRetryableError(new Error('Not found'))).toBe(false);
    });
  });
});
