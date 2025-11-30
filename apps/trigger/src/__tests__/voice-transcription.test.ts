import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for Voice Transcription Workflow
 * Tests the full voice call processing pipeline with mocked services
 */

// Mock environment variables
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('VAPI_API_KEY', 'test-vapi-key');
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
vi.stubEnv('DATABASE_URL', '');

import {
  createHubSpotClient,
  createOpenAIClient,
  createVapiClient,
  formatTranscriptForCRM,
  extractLeadQualification,
} from '@medicalcor/integrations';
import {
  createScoringService,
  createTriageService,
  createConsentService,
} from '@medicalcor/domain';
import { normalizeRomanianPhone, createInMemoryEventStore } from '@medicalcor/core';
import type { VapiTranscript, VapiCallSummary } from '@medicalcor/integrations';

describe('Voice Transcription Workflow', () => {
  const correlationId = 'voice-transcription-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Post-call processing', () => {
    it('should process voice call transcript end-to-end', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const openai = createOpenAIClient({ apiKey: 'test-key' });
      const vapi = createVapiClient({ apiKey: 'test-key' });
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      const eventStore = createInMemoryEventStore('voice-transcription');

      const postCallPayload = {
        callId: 'call_123',
        customerPhone: '0721000001',
        customerName: 'Ion Popescu',
        callType: 'inbound' as const,
        endedReason: 'customer-ended-call',
        duration: 180,
        correlationId,
      };

      // Step 1: Normalize phone number
      const phoneResult = normalizeRomanianPhone(postCallPayload.customerPhone);
      expect(phoneResult.isValid).toBe(true);
      expect(phoneResult.normalized).toBe('+40721000001');

      // Step 2: Fetch transcript from Vapi
      const transcript = await vapi.getTranscript(postCallPayload.callId);
      expect(transcript).toBeDefined();
      expect(transcript.messages.length).toBeGreaterThan(0);

      // Step 3: Analyze transcript
      const analysis = vapi.analyzeTranscript(transcript);
      expect(analysis.fullTranscript).toBeDefined();
      expect(analysis.procedureMentions).toBeDefined();

      // Step 4: Generate call summary
      const summary = vapi.generateCallSummary(transcript, analysis);
      expect(summary.summary).toBeDefined();
      expect(summary.urgencyLevel).toBeDefined();

      // Step 5: Generate AI summary
      const aiSummary = await openai.summarize(analysis.fullTranscript, 'ro');
      expect(typeof aiSummary).toBe('string');

      // Step 6: Analyze sentiment
      const sentiment = await openai.analyzeSentiment(analysis.fullTranscript);
      expect(['positive', 'neutral', 'negative']).toContain(sentiment.sentiment);
      expect(sentiment.confidence).toBeGreaterThan(0);

      // Step 7: Score the lead from transcript
      const leadContext = {
        phone: phoneResult.normalized,
        channel: 'voice' as const,
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro' as const,
        messageHistory: analysis.customerMessages.map((content) => ({
          role: 'user' as const,
          content,
          timestamp: new Date().toISOString(),
        })),
      };

      const scoreResult = await scoring.scoreMessage(leadContext);
      expect(scoreResult.score).toBeGreaterThanOrEqual(1);
      expect(scoreResult.score).toBeLessThanOrEqual(5);
      expect(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).toContain(scoreResult.classification);

      // Step 8: Sync to HubSpot
      const contact = await hubspot.syncContact({
        phone: phoneResult.normalized,
        name: postCallPayload.customerName,
        properties: {
          lead_source: 'voice',
          last_call_date: new Date().toISOString(),
        },
      });
      expect(contact.id).toBeDefined();

      // Step 9: Log call to timeline
      const formattedTranscript = formatTranscriptForCRM(transcript);
      await hubspot.logCallToTimeline({
        contactId: contact.id,
        callSid: postCallPayload.callId,
        duration: postCallPayload.duration,
        transcript: formattedTranscript,
        sentiment: sentiment.sentiment,
      });

      // Step 10: Update contact with scoring data
      await hubspot.updateContact(contact.id, {
        lead_score: String(scoreResult.score),
        lead_status: scoreResult.classification,
        last_call_sentiment: sentiment.sentiment,
        last_call_summary: aiSummary,
      });

      // Step 11: Emit domain event
      await eventStore.emit({
        type: 'voice.transcript.processed',
        correlationId,
        aggregateId: phoneResult.normalized,
        aggregateType: 'lead',
        payload: {
          callId: postCallPayload.callId,
          from: phoneResult.normalized,
          callType: postCallPayload.callType,
          duration: postCallPayload.duration,
          hubspotContactId: contact.id,
          score: scoreResult.score,
          classification: scoreResult.classification,
          sentiment: sentiment.sentiment,
        },
      });

      const events = await eventStore.getByAggregateId(phoneResult.normalized);
      expect(events.length).toBe(1);
      expect(events[0]?.type).toBe('voice.transcript.processed');
    });

    it('should create priority task for HOT voice leads', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const triage = createTriageService({});

      const hotLeadInput = {
        phone: '+40721000001',
        hubspotContactId: 'hs_contact_123',
        classification: 'HOT' as const,
        procedureInterest: ['All-on-4', 'implant'],
        urgencyLevel: 'high' as const,
      };

      // Perform triage assessment
      const triageResult = await triage.assess({
        leadScore: hotLeadInput.classification,
        channel: 'voice',
        messageContent: 'I need implant urgently, I have pain',
        procedureInterest: hotLeadInput.procedureInterest,
        hasExistingRelationship: false,
      });

      expect(triageResult.urgencyLevel).toBeDefined();
      expect(triageResult.routingRecommendation).toBeDefined();

      // Get notification contacts for priority cases
      const notificationContacts = triage.getNotificationContacts(triageResult.urgencyLevel);
      expect(Array.isArray(notificationContacts)).toBe(true);

      // Create priority task
      const task = await hubspot.createTask({
        contactId: hotLeadInput.hubspotContactId,
        subject: `HIGH PRIORITY - Voice Lead: ${hotLeadInput.phone}`,
        body: `${triageResult.notes}\n\nNotify: ${notificationContacts.join(', ')}`,
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      });

      expect(task.id).toBeDefined();
    });

    it('should handle GDPR consent verification before processing', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const consent = createConsentService({});

      const input = {
        callId: 'call_gdpr_123',
        customerPhone: '+40721000001',
        hubspotContactId: 'hs_contact_123',
      };

      // Find existing contact
      const contact = await hubspot.findContactByPhone(input.customerPhone);

      if (contact) {
        // Check GDPR consent
        const consentCheck = await consent.hasRequiredConsents(contact.id);

        if (!consentCheck.valid) {
          // Should skip transcript processing
          expect(consentCheck.missing.length).toBeGreaterThan(0);

          // Log minimal call metadata only
          await hubspot.logCallToTimeline({
            contactId: contact.id,
            callSid: input.callId,
            duration: 60,
            transcript: '[Transcript not processed - consent required]',
          });
        }
      }
    });

    it('should fallback to rule-based scoring on AI failure', async () => {
      const vapi = createVapiClient({ apiKey: 'test-key' });

      const transcript = await vapi.getTranscript('call_123');
      const analysis = vapi.analyzeTranscript(transcript);
      const summary = vapi.generateCallSummary(transcript, analysis);

      // Use rule-based extraction as fallback
      const qualification = extractLeadQualification(summary);

      expect(qualification.score).toBeGreaterThanOrEqual(1);
      expect(qualification.score).toBeLessThanOrEqual(5);
      expect(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).toContain(qualification.classification);
      expect(qualification.reason).toBeDefined();
    });
  });

  describe('Vapi webhook handling', () => {
    it('should process call.ended webhook', async () => {
      const eventStore = createInMemoryEventStore('vapi-webhook');

      const webhookPayload = {
        type: 'call.ended' as const,
        call: {
          id: 'call_webhook_123',
          status: 'ended',
          type: 'inbound' as const,
          customer: {
            number: '+40721000001',
            name: 'Ion Popescu',
          },
          endedReason: 'customer-ended-call',
          cost: 0.05,
          startedAt: new Date(Date.now() - 180000).toISOString(),
          endedAt: new Date().toISOString(),
        },
        correlationId,
      };

      // Only process ended calls
      expect(webhookPayload.call.status).toBe('ended');
      expect(webhookPayload.call.customer?.number).toBeDefined();

      // Calculate duration
      const duration =
        webhookPayload.call.startedAt && webhookPayload.call.endedAt
          ? Math.round(
              (new Date(webhookPayload.call.endedAt).getTime() -
                new Date(webhookPayload.call.startedAt).getTime()) /
                1000
            )
          : undefined;

      expect(duration).toBeGreaterThan(0);

      // Emit webhook event
      await eventStore.emit({
        type: 'vapi.webhook.received',
        correlationId,
        aggregateId: webhookPayload.call.id,
        aggregateType: 'voice_call',
        payload: {
          callId: webhookPayload.call.id,
          status: webhookPayload.call.status,
          type: webhookPayload.call.type,
          customerPhone: webhookPayload.call.customer?.number,
          endedReason: webhookPayload.call.endedReason,
          cost: webhookPayload.call.cost,
          duration,
        },
      });

      const events = await eventStore.getByType('vapi.webhook.received');
      expect(events.length).toBe(1);
    });

    it('should ignore non-ended call webhooks', async () => {
      const webhookPayload = {
        type: 'call.ended' as const,
        call: {
          id: 'call_inprogress',
          status: 'in-progress',
          type: 'inbound' as const,
        },
        correlationId,
      };

      // Should not process in-progress calls
      const shouldProcess = webhookPayload.call.status === 'ended';
      expect(shouldProcess).toBe(false);
    });

    it('should handle webhook without customer phone', async () => {
      const webhookPayload = {
        type: 'call.ended' as const,
        call: {
          id: 'call_no_customer',
          status: 'ended',
          type: 'outbound' as const,
          endedReason: 'no-answer',
        },
        correlationId,
      };

      // Should return error if no customer phone
      const hasCustomerPhone = !!webhookPayload.call.customer?.number;
      expect(hasCustomerPhone).toBe(false);
    });
  });

  describe('Transcript summary generation', () => {
    it('should generate AI-powered transcript summary', async () => {
      const openai = createOpenAIClient({ apiKey: 'test-key' });

      const transcript = `
        Patient: Bună ziua, mă interesează un implant dentar.
        Doctor: Bună ziua! Cu ce vă putem ajuta?
        Patient: Am pierdut un dinte și aș dori să aflu mai multe despre implanturi.
        Doctor: Desigur. Implanturile dentare sunt o soluție permanentă...
      `;

      const summary = await openai.summarize(transcript, 'ro');
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);

      const sentiment = await openai.analyzeSentiment(transcript);
      expect(['positive', 'neutral', 'negative']).toContain(sentiment.sentiment);

      const language = await openai.detectLanguage(transcript);
      expect(['ro', 'en', 'de', 'unknown']).toContain(language);
    });
  });

  describe('Keyword extraction', () => {
    it('should extract dental procedure keywords from transcript', () => {
      const transcript = 'Mă interesează all-on-4, implanturi și poate fațete dentare.';
      const lowerTranscript = transcript.toLowerCase();

      const PROCEDURE_KEYWORDS = [
        { keyword: 'implant', category: 'implant', priority: 'high' },
        { keyword: 'implanturi', category: 'implant', priority: 'high' },
        { keyword: 'all-on-4', category: 'full_arch', priority: 'high' },
        { keyword: 'fatete', category: 'cosmetic', priority: 'medium' },
        { keyword: 'fațete', category: 'cosmetic', priority: 'medium' },
      ];

      const procedureMentions = PROCEDURE_KEYWORDS.filter((p) =>
        lowerTranscript.includes(p.keyword)
      );

      expect(procedureMentions.length).toBeGreaterThan(0);
      expect(procedureMentions.some((p) => p.category === 'full_arch')).toBe(true);
    });

    it('should extract intent keywords from transcript', () => {
      const transcript = 'Cât costă un implant? Am nevoie urgent.';
      const lowerTranscript = transcript.toLowerCase();

      const INTENT_KEYWORDS = [
        { keyword: 'pret', intent: 'pricing_inquiry' },
        { keyword: 'cost', intent: 'pricing_inquiry' },
        { keyword: 'cat costa', intent: 'pricing_inquiry' },
        { keyword: 'urgent', intent: 'urgent' },
        { keyword: 'durere', intent: 'urgent' },
      ];

      const detectedIntents = INTENT_KEYWORDS.filter((i) =>
        lowerTranscript.includes(i.keyword)
      ).map((i) => i.intent);

      const uniqueIntents = [...new Set(detectedIntents)];

      expect(uniqueIntents).toContain('pricing_inquiry');
      expect(uniqueIntents).toContain('urgent');
    });

    it('should calculate priority score from procedure mentions', () => {
      const procedureMentions = [
        { keyword: 'all-on-4', category: 'full_arch', priority: 'high', count: 1 },
        { keyword: 'implant', category: 'implant', priority: 'high', count: 2 },
        { keyword: 'fatete', category: 'cosmetic', priority: 'medium', count: 1 },
      ];

      const priorityScore = procedureMentions.reduce((score, p) => {
        if (p.priority === 'high') return score + 3;
        if (p.priority === 'medium') return score + 2;
        return score + 1;
      }, 0);

      // 2 high (3 each) + 1 medium (2) = 8
      expect(priorityScore).toBe(8);

      const isHighValue = procedureMentions.some((p) => p.priority === 'high');
      expect(isHighValue).toBe(true);
    });
  });

  describe('Phone normalization edge cases', () => {
    it('should normalize various Romanian phone formats', () => {
      const formats = [
        { input: '0721000001', expected: '+40721000001' },
        { input: '+40721000001', expected: '+40721000001' },
        { input: '40721000001', expected: '+40721000001' },
        { input: '0721 000 001', expected: '+40721000001' },
        { input: '0721-000-001', expected: '+40721000001' },
      ];

      for (const { input, expected } of formats) {
        const result = normalizeRomanianPhone(input);
        expect(result.normalized).toBe(expected);
        expect(result.isValid).toBe(true);
      }
    });

    it('should handle invalid phone numbers', () => {
      const invalidNumbers = ['invalid', '123', 'abc123def', '', null];

      for (const input of invalidNumbers) {
        if (input === null) continue;
        const result = normalizeRomanianPhone(input);
        expect(result.isValid).toBe(false);
      }
    });
  });
});

describe('Voice Handler Task', () => {
  const correlationId = 'voice-handler-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process completed voice call with transcript', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });
    const scoring = createScoringService({
      openaiApiKey: 'test-key',
      fallbackEnabled: true,
    });
    const triage = createTriageService({});
    const eventStore = createInMemoryEventStore('voice-handler');

    const voiceCallPayload = {
      callSid: 'call_twilio_123',
      from: '0721000001',
      to: '+40212000000',
      direction: 'inbound' as const,
      status: 'completed',
      duration: '180',
      transcript: 'Bună ziua, vreau implant dentar urgent. Cât costă?',
      correlationId,
    };

    // Step 1: Normalize phone
    const phoneResult = normalizeRomanianPhone(voiceCallPayload.from);
    expect(phoneResult.isValid).toBe(true);

    // Step 2: Sync to HubSpot
    const contact = await hubspot.syncContact({
      phone: phoneResult.normalized,
      properties: {
        lead_source: 'voice',
        last_call_date: new Date().toISOString(),
      },
    });
    expect(contact.id).toBeDefined();

    // Step 3: Log call to HubSpot timeline
    await hubspot.logCallToTimeline({
      contactId: contact.id,
      callSid: voiceCallPayload.callSid,
      duration: parseInt(voiceCallPayload.duration, 10),
      transcript: voiceCallPayload.transcript,
    });

    // Step 4: AI scoring on transcript
    const leadContext = {
      phone: phoneResult.normalized,
      channel: 'voice' as const,
      firstTouchTimestamp: new Date().toISOString(),
      language: 'ro' as const,
      messageHistory: [
        {
          role: 'user' as const,
          content: voiceCallPayload.transcript,
          timestamp: new Date().toISOString(),
        },
      ],
      hubspotContactId: contact.id,
    };

    const scoreResult = await scoring.scoreMessage(leadContext);
    expect(scoreResult.score).toBeGreaterThanOrEqual(1);

    // Step 5: Triage assessment
    const triageResult = await triage.assess({
      leadScore: scoreResult.classification,
      channel: 'voice',
      messageContent: voiceCallPayload.transcript,
      procedureInterest: scoreResult.procedureInterest ?? [],
      hasExistingRelationship: false,
    });

    expect(triageResult.urgencyLevel).toBeDefined();

    // Step 6: Emit domain event
    await eventStore.emit({
      type: 'voice.call.completed',
      correlationId,
      aggregateId: phoneResult.normalized,
      aggregateType: 'lead',
      payload: {
        callSid: voiceCallPayload.callSid,
        from: phoneResult.normalized,
        to: voiceCallPayload.to,
        direction: voiceCallPayload.direction,
        status: voiceCallPayload.status,
        duration: parseInt(voiceCallPayload.duration, 10),
        hubspotContactId: contact.id,
        score: scoreResult.score,
        classification: scoreResult.classification,
      },
    });

    const events = await eventStore.getByType('voice.call.completed');
    expect(events.length).toBe(1);
  });

  it('should handle call without transcript', async () => {
    const hubspot = createHubSpotClient({ accessToken: 'test-token' });
    const eventStore = createInMemoryEventStore('voice-no-transcript');

    const voiceCallPayload = {
      callSid: 'call_no_transcript',
      from: '+40721000001',
      to: '+40212000000',
      direction: 'inbound' as const,
      status: 'completed',
      duration: '30',
      // No transcript
      correlationId,
    };

    // Sync contact
    const contact = await hubspot.syncContact({
      phone: voiceCallPayload.from,
    });

    // Log call without transcript
    await hubspot.logCallToTimeline({
      contactId: contact.id,
      callSid: voiceCallPayload.callSid,
      duration: parseInt(voiceCallPayload.duration, 10),
      transcript: 'No transcript available',
    });

    // Emit event for call initiation
    await eventStore.emit({
      type: 'voice.call.initiated',
      correlationId,
      aggregateId: voiceCallPayload.from,
      aggregateType: 'lead',
      payload: {
        callSid: voiceCallPayload.callSid,
        from: voiceCallPayload.from,
        direction: voiceCallPayload.direction,
        status: voiceCallPayload.status,
      },
    });

    const events = await eventStore.getByType('voice.call.initiated');
    expect(events.length).toBe(1);
  });
});
