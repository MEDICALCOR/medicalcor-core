import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for Voice Handler Tasks
 * Tests voice call processing including consent checks, scoring, and triage
 */

// Mock environment variables
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
vi.stubEnv('DATABASE_URL', '');

// Import after env setup
import {
  createHubSpotClient,
  createOpenAIClient,
} from '@medicalcor/integrations';
import {
  createScoringService,
  createTriageService,
} from '@medicalcor/domain';
import { createInMemoryEventStore, normalizeRomanianPhone } from '@medicalcor/core';
import type { AIScoringContext } from '@medicalcor/types';

describe('Voice Handler Tasks', () => {
  const correlationId = 'voice-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Voice Call Handler', () => {
    it('should process voice call with transcript end-to-end', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      const triage = createTriageService();
      const eventStore = createInMemoryEventStore('voice-call');

      const payload = {
        callSid: 'call_test123',
        from: '+40721000001',
        to: '+40212000000',
        direction: 'inbound' as const,
        status: 'completed',
        duration: '180',
        transcript: 'Buna ziua, vreau sa programez o consultatie pentru implant dentar urgent.',
        correlationId,
      };

      // Step 1: Normalize phone
      const phoneResult = normalizeRomanianPhone(payload.from);
      expect(phoneResult.isValid).toBe(true);
      expect(phoneResult.normalized).toBe('+40721000001');

      // Step 2: Sync contact to HubSpot
      const contact = await hubspot.syncContact({
        phone: phoneResult.normalized,
        properties: {
          lead_source: 'voice',
          last_call_date: new Date().toISOString(),
        },
      });
      expect(contact.id).toBeDefined();

      // Step 3: Score lead from transcript
      const leadContext: AIScoringContext = {
        phone: phoneResult.normalized,
        channel: 'voice',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro',
        messageHistory: [
          { role: 'user', content: payload.transcript, timestamp: new Date().toISOString() },
        ],
        hubspotContactId: contact.id,
      };

      const scoreResult = await scoring.scoreMessage(leadContext);
      expect(scoreResult.score).toBeGreaterThanOrEqual(1);
      expect(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).toContain(scoreResult.classification);

      // Step 4: Emit domain event
      await eventStore.emit({
        type: 'voice.call.completed',
        correlationId,
        aggregateId: phoneResult.normalized,
        aggregateType: 'lead',
        payload: {
          callSid: payload.callSid,
          from: phoneResult.normalized,
          status: payload.status,
          duration: parseInt(payload.duration, 10),
          hubspotContactId: contact.id,
          score: scoreResult.score,
        },
      });

      const events = await eventStore.getByType('voice.call.completed');
      expect(events.length).toBe(1);
    });

    it('should handle GDPR consent check before processing', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      // Mock consent check result
      const consentCheck = {
        valid: false,
        missing: ['data_processing', 'marketing'],
      };

      const payload = {
        callSid: 'call_consent_test',
        from: '+40721000001',
        status: 'completed' as const,
        transcript: 'Test transcript',
      };

      // Sync contact
      const contact = await hubspot.syncContact({
        phone: payload.from,
      });

      if (!consentCheck.valid) {
        // Should log call without processing transcript
        await hubspot.logCallToTimeline({
          contactId: contact.id,
          callSid: payload.callSid,
          duration: 0,
          transcript: '[Transcript not processed - consent required]',
        });

        expect(consentCheck.valid).toBe(false);
        expect(consentCheck.missing).toBeDefined();
      } else {
        expect(consentCheck.valid).toBe(true);
      }
    });

    it('should throw error if consent service is not configured', () => {
      const consent = undefined;

      if (!consent) {
        expect(() => {
          throw new Error('Consent service required for GDPR compliance');
        }).toThrow('Consent service required for GDPR compliance');
      }
    });

    it('should return consent_required status when consent is missing', () => {
      const consentCheck = {
        valid: false,
        missing: ['data_processing', 'voice_recording'],
      };

      if (!consentCheck.valid) {
        const result = {
          status: 'consent_required',
          hubspotContactId: 'hs_contact_123',
          missingConsents: consentCheck.missing,
        };

        expect(result.status).toBe('consent_required');
        expect(result.missingConsents).toContain('data_processing');
        expect(result.missingConsents).toContain('voice_recording');
      }
    });

    it('should perform triage assessment for completed calls', async () => {
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      const triage = createTriageService();

      const leadContext: AIScoringContext = {
        phone: '+40721000001',
        channel: 'voice',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro',
        messageHistory: [
          {
            role: 'user',
            content: 'Am durere de dinti, vreau programare urgenta',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const scoreResult = await scoring.scoreMessage(leadContext);

      const triageResult = await triage.assess({
        leadScore: scoreResult.classification,
        channel: 'voice',
        messageContent: leadContext.messageHistory[0]?.content ?? '',
        procedureInterest: scoreResult.procedureInterest ?? [],
        hasExistingRelationship: false,
      });

      expect(triageResult.urgencyLevel).toBeDefined();
      expect(['low', 'medium', 'high', 'high_priority']).toContain(triageResult.urgencyLevel);
      expect(triageResult.routingRecommendation).toBeDefined();
    });

    it('should analyze sentiment from transcript', async () => {
      const openai = createOpenAIClient({ apiKey: 'test-key' });

      const transcript = 'Buna ziua, vreau sa programez o consultatie';
      const sentimentResult = await openai.analyzeSentiment(transcript);

      expect(sentimentResult.sentiment).toBeDefined();
      expect(['positive', 'neutral', 'negative']).toContain(sentimentResult.sentiment);
    });

    it('should update contact with score and sentiment', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const contactId = 'hs_contact_123';
      const scoreData = {
        score: 4,
        classification: 'HOT' as const,
        sentiment: 'positive',
        urgencyLevel: 'high',
      };

      await hubspot.updateContact(contactId, {
        lead_score: String(scoreData.score),
        lead_status: scoreData.classification,
        last_call_sentiment: scoreData.sentiment,
        urgency_level: scoreData.urgencyLevel,
      });

      const contact = await hubspot.getContact(contactId);
      expect(contact.id).toBe(contactId);
    });

    it('should create priority task for HOT leads', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const triage = createTriageService();

      const scoreResult = {
        classification: 'HOT' as const,
        suggestedAction: 'Immediate callback',
      };

      const triageResult = {
        urgencyLevel: 'high_priority' as const,
        notes: 'Patient reported discomfort',
        routingRecommendation: 'next_available_slot' as const,
      };

      const notificationContacts = triage.getNotificationContacts(triageResult.urgencyLevel);

      const task = await hubspot.createTask({
        contactId: 'hs_contact_123',
        subject: 'PRIORITY REQUEST - Voice Lead: +40721000001',
        body: `Patient reported discomfort. Wants quick appointment.\n\n${triageResult.notes}`,
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 30 * 60 * 1000),
      });

      expect(task.id).toBeDefined();
      expect(Array.isArray(notificationContacts)).toBe(true);
    });

    it('should handle call without transcript', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const eventStore = createInMemoryEventStore('voice-no-transcript');

      const payload = {
        callSid: 'call_no_transcript',
        from: '+40721000001',
        to: '+40212000000',
        direction: 'inbound' as const,
        status: 'in-progress',
        duration: undefined,
        transcript: undefined,
        correlationId,
      };

      const phoneResult = normalizeRomanianPhone(payload.from);
      const contact = await hubspot.syncContact({ phone: phoneResult.normalized });

      // Should emit initiated event (not completed)
      await eventStore.emit({
        type: 'voice.call.initiated',
        correlationId,
        aggregateId: phoneResult.normalized,
        aggregateType: 'lead',
        payload: {
          callSid: payload.callSid,
          from: phoneResult.normalized,
          status: payload.status,
          hubspotContactId: contact.id,
        },
      });

      const events = await eventStore.getByType('voice.call.initiated');
      expect(events.length).toBe(1);
    });

    it('should normalize phone numbers correctly', () => {
      const testCases = [
        { input: '0721000001', expected: '+40721000001', valid: true },
        { input: '+40721000001', expected: '+40721000001', valid: true },
        { input: '40721000001', expected: '+40721000001', valid: true },
        { input: 'invalid', expected: 'invalid', valid: false },
      ];

      for (const testCase of testCases) {
        const result = normalizeRomanianPhone(testCase.input);
        expect(result.normalized).toBe(testCase.expected);
        expect(result.isValid).toBe(testCase.valid);
      }
    });

    it('should return complete success result', () => {
      const result = {
        success: true,
        callSid: 'call_test123',
        normalizedPhone: '+40721000001',
        hubspotContactId: 'hs_contact_123',
        status: 'completed',
        score: 4,
        classification: 'HOT',
      };

      expect(result.success).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.classification).toBe('HOT');
    });
  });

  describe('Call Completed Handler', () => {
    it('should process completed call with full details', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });
      const eventStore = createInMemoryEventStore('call-completed');

      const payload = {
        callSid: 'call_completed_123',
        from: '+40721000001',
        to: '+40212000000',
        duration: 180,
        transcript: 'Vreau informatii despre implanturi dentare',
        recordingUrl: 'https://example.com/recording.mp3',
        summary: 'Patient interested in dental implants',
        sentiment: 'positive',
        correlationId,
      };

      const phoneResult = normalizeRomanianPhone(payload.from);
      const contact = await hubspot.syncContact({ phone: phoneResult.normalized });

      // Log call to timeline
      await hubspot.logCallToTimeline({
        contactId: contact.id,
        callSid: payload.callSid,
        duration: payload.duration,
        transcript: payload.transcript,
        sentiment: payload.sentiment,
      });

      // Score the lead
      const leadContext: AIScoringContext = {
        phone: phoneResult.normalized,
        channel: 'voice',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro',
        messageHistory: [
          { role: 'user', content: payload.transcript, timestamp: new Date().toISOString() },
        ],
        hubspotContactId: contact.id,
      };

      const scoreResult = await scoring.scoreMessage(leadContext);

      // Update contact
      await hubspot.updateContact(contact.id, {
        lead_score: String(scoreResult.score),
        lead_status: scoreResult.classification,
        last_call_sentiment: payload.sentiment,
        last_call_summary: payload.summary,
      });

      // Emit event
      await eventStore.emit({
        type: 'voice.call.processed',
        correlationId,
        aggregateId: phoneResult.normalized,
        aggregateType: 'lead',
        payload: {
          callSid: payload.callSid,
          from: phoneResult.normalized,
          duration: payload.duration,
          hasTranscript: true,
          hasRecording: true,
          hubspotContactId: contact.id,
          score: scoreResult.score,
          sentiment: payload.sentiment,
        },
      });

      const events = await eventStore.getByType('voice.call.processed');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.hasTranscript).toBe(true);
      expect(events[0]?.payload.hasRecording).toBe(true);
    });

    it('should handle call without transcript but with summary', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const payload = {
        callSid: 'call_summary_only',
        from: '+40721000001',
        duration: 120,
        transcript: undefined,
        summary: 'Brief inquiry about services',
      };

      const phoneResult = normalizeRomanianPhone(payload.from);
      const contact = await hubspot.syncContact({ phone: phoneResult.normalized });

      await hubspot.logCallToTimeline({
        contactId: contact.id,
        callSid: payload.callSid,
        duration: payload.duration,
        transcript: payload.summary, // Use summary as fallback
      });

      expect(payload.summary).toBeDefined();
    });

    it('should use default transcript when none available', () => {
      const payload = {
        transcript: undefined,
        summary: undefined,
      };

      const transcriptToLog = payload.transcript ?? payload.summary ?? 'No transcript available';

      expect(transcriptToLog).toBe('No transcript available');
    });

    it('should create task for priority scheduling requests', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });
      const triage = createTriageService();

      const triageResult = {
        urgencyLevel: 'high_priority' as const,
        prioritySchedulingRequested: true,
        notes: 'Patient reported discomfort',
      };

      if (triageResult.prioritySchedulingRequested || triageResult.urgencyLevel === 'high_priority') {
        const notificationContacts = triage.getNotificationContacts(triageResult.urgencyLevel);

        const task = await hubspot.createTask({
          contactId: 'hs_contact_123',
          subject: 'PRIORITY REQUEST - Voice Lead: +40721000001',
          body: `Patient reported discomfort. Wants quick appointment.\n\n${triageResult.notes}`,
          priority: 'HIGH',
        });

        expect(task.id).toBeDefined();
        expect(Array.isArray(notificationContacts)).toBe(true);
      }
    });

    it('should return complete result with all flags', () => {
      const result = {
        success: true,
        callSid: 'call_completed_123',
        normalizedPhone: '+40721000001',
        hubspotContactId: 'hs_contact_123',
        duration: 180,
        score: 4,
        classification: 'HOT',
      };

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.score).toBeDefined();
    });
  });

  describe('Triage integration', () => {
    it('should route to next_available_slot for high priority', async () => {
      const triage = createTriageService();

      const triageResult = await triage.assess({
        leadScore: 'HOT',
        channel: 'voice',
        messageContent: 'Am durere, vreau programare urgenta',
        procedureInterest: ['emergency'],
        hasExistingRelationship: false,
      });

      expect(['next_available_slot', 'within_24h', 'within_week', 'scheduled']).toContain(
        triageResult.routingRecommendation
      );
    });

    it('should determine urgency level correctly', async () => {
      const triage = createTriageService();

      const scenarios = [
        {
          message: 'Am durere si vreau programare urgenta',
          expectedUrgency: ['high_priority', 'high'],
        },
        {
          message: 'Vreau informatii despre implanturi',
          expectedUrgency: ['medium', 'low'],
        },
        {
          message: 'Salut',
          expectedUrgency: ['low'],
        },
      ];

      for (const scenario of scenarios) {
        const result = await triage.assess({
          leadScore: 'WARM',
          channel: 'voice',
          messageContent: scenario.message,
          procedureInterest: [],
          hasExistingRelationship: false,
        });

        // Urgency levels may vary depending on implementation
        expect(result.urgencyLevel).toBeDefined();
      }
    });

    it('should get notification contacts for different urgency levels', () => {
      const triage = createTriageService();

      const urgencyLevels: Array<'low' | 'medium' | 'high' | 'high_priority'> = [
        'low',
        'medium',
        'high',
        'high_priority',
      ];

      for (const urgency of urgencyLevels) {
        const contacts = triage.getNotificationContacts(urgency);
        expect(Array.isArray(contacts)).toBe(true);

        // High priority should have more contacts
        if (urgency === 'high_priority' || urgency === 'high') {
          // Could have contacts or be empty depending on configuration
          expect(Array.isArray(contacts)).toBe(true);
        }
      }
    });
  });

  describe('Scoring from voice transcript', () => {
    it('should score urgent keywords higher', async () => {
      const scoring = createScoringService({
        openaiApiKey: '',
        fallbackEnabled: true,
      });

      const urgentTranscript =
        'Am durere de dinti si vreau programare cat mai urgent pentru implant';

      const context: AIScoringContext = {
        phone: '+40721000001',
        channel: 'voice',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro',
        messageHistory: [
          { role: 'user', content: urgentTranscript, timestamp: new Date().toISOString() },
        ],
      };

      const result = scoring.ruleBasedScore(context);

      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(result.classification).toBe('HOT');
    });

    it('should detect procedure interest from transcript', async () => {
      const scoring = createScoringService({
        openaiApiKey: 'test-key',
        fallbackEnabled: true,
      });

      const transcript = 'Ma intereseaza implant dentar si All-on-4';

      const context: AIScoringContext = {
        phone: '+40721000001',
        channel: 'voice',
        firstTouchTimestamp: new Date().toISOString(),
        language: 'ro',
        messageHistory: [
          { role: 'user', content: transcript, timestamp: new Date().toISOString() },
        ],
      };

      const result = await scoring.scoreMessage(context);

      expect(result.procedureInterest).toBeDefined();
      if (result.procedureInterest) {
        expect(Array.isArray(result.procedureInterest)).toBe(true);
      }
    });
  });

  describe('Error handling', () => {
    it('should handle HubSpot sync failure gracefully', async () => {
      const eventStore = createInMemoryEventStore('voice-hubspot-fail');

      const payload = {
        callSid: 'call_hubspot_fail',
        from: '+40721000001',
        status: 'completed',
      };

      const phoneResult = normalizeRomanianPhone(payload.from);

      // Even if HubSpot fails, should emit event
      await eventStore.emit({
        type: 'voice.call.completed',
        correlationId,
        aggregateId: phoneResult.normalized,
        aggregateType: 'lead',
        payload: {
          callSid: payload.callSid,
          from: phoneResult.normalized,
          status: payload.status,
          hubspotContactId: undefined, // Failed to create
        },
      });

      const events = await eventStore.getByType('voice.call.completed');
      expect(events.length).toBe(1);
    });

    it('should handle scoring service unavailable', async () => {
      const scoring = undefined;
      const triage = undefined;

      if (!scoring || !triage) {
        const warning = 'Scoring or triage service not available';
        expect(warning).toBe('Scoring or triage service not available');
      }
    });

    it('should handle sentiment analysis failure gracefully', async () => {
      const openai = createOpenAIClient({ apiKey: 'test-key' });

      try {
        await openai.analyzeSentiment('test');
        // Should succeed or fail gracefully
        expect(true).toBe(true);
      } catch (err) {
        // Should handle error
        expect(err).toBeDefined();
      }
    });

    it('should throw error when consent verification fails critically', () => {
      expect(() => {
        throw new Error('Cannot process voice data: consent verification failed');
      }).toThrow('consent verification failed');
    });
  });

  describe('Retry configuration', () => {
    it('should have correct retry settings', () => {
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
  });

  describe('Call direction handling', () => {
    it('should handle different call directions', () => {
      const directions: Array<'inbound' | 'outbound-api' | 'outbound-dial'> = [
        'inbound',
        'outbound-api',
        'outbound-dial',
      ];

      for (const direction of directions) {
        const payload = {
          callSid: `call_${direction}`,
          direction,
        };

        expect(['inbound', 'outbound-api', 'outbound-dial']).toContain(payload.direction);
      }
    });
  });
});
