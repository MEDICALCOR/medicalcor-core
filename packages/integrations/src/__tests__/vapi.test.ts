import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import {
  createVapiClient,
  formatTranscriptForCRM,
  extractLeadQualification,
  type VapiTranscript,
  type VapiCallSummary,
} from '../vapi.js';
import { server } from '../__mocks__/setup.js';

// MSW server lifecycle
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('VapiClient', () => {
  const client = createVapiClient({
    apiKey: 'test-api-key',
    assistantId: 'test-assistant',
    phoneNumberId: 'test-phone-number',
  });

  describe('createOutboundCall', () => {
    it('should create an outbound call', async () => {
      // MSW handles the mock response
      const result = await client.createOutboundCall({
        phoneNumber: '+40721000001',
        name: 'Test Patient',
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.type).toBe('outbound');
    });
  });

  describe('getCall', () => {
    it('should get call details', async () => {
      // MSW handles the mock response
      const result = await client.getCall({ callId: 'call_123' });

      expect(result.id).toBe('call_123');
      expect(result.status).toBe('ended');
    });
  });

  describe('getTranscript', () => {
    it('should get call transcript', async () => {
      // MSW handles the mock response
      const result = await client.getTranscript('call_123');

      expect(result.callId).toBe('call_123');
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('analyzeTranscript', () => {
    it('should analyze transcript for keywords and procedures', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          { role: 'assistant', message: 'Buna ziua! Cu ce va putem ajuta?', timestamp: Date.now() },
          {
            role: 'user',
            message: 'Vreau informatii despre implanturi dentare. Cat costa un implant?',
            timestamp: Date.now(),
          },
          { role: 'assistant', message: 'Pretul incepe de la 600 euro.', timestamp: Date.now() },
          { role: 'user', message: 'Si pentru all-on-4 cat este?', timestamp: Date.now() },
        ],
        duration: 180,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.customerMessages).toHaveLength(2);
      expect(analysis.assistantMessages).toHaveLength(2);
      expect(analysis.procedureMentions).toContain('implant');
      expect(analysis.procedureMentions).toContain('all-on-4');
      expect(analysis.keywords).toContain('pret');
      expect(analysis.durationSeconds).toBe(180);
    });

    it('should extract questions from transcript', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          { role: 'user', message: 'Cat costa un implant?', timestamp: Date.now() },
          { role: 'user', message: 'Cum pot face o programare?', timestamp: Date.now() },
          { role: 'user', message: 'Multumesc pentru informatii.', timestamp: Date.now() },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.questions).toHaveLength(2);
      expect(analysis.questions).toContain('Cat costa un implant?');
      expect(analysis.questions).toContain('Cum pot face o programare?');
    });
  });

  describe('generateCallSummary', () => {
    it('should generate summary with correct urgency level', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Am o durere puternica la un dinte. Este urgent!',
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            message: 'Intelegem. Va programam cat mai repede posibil.',
            timestamp: Date.now(),
          },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      // 'urgent' + 'durere' + 'cat mai repede' (from assistant) = 3 keywords = critical
      expect(summary.urgencyLevel).toBe('critical');
      expect(summary.callId).toBe('call_123');
    });

    it('should detect positive sentiment', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Multumesc foarte mult! A fost perfect!',
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            message: 'Cu placere! Asteptam sa va revedem.',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.sentiment).toBe('positive');
    });

    it('should identify procedure interest', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Sunt interesat de fatete si coroane dentare',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.procedureInterest).toContain('fatete');
      expect(summary.procedureInterest).toContain('coroane');
    });
  });

  describe('transcript buffer', () => {
    it('should buffer and retrieve transcript messages', () => {
      const callId = 'buffer_test_123';

      client.bufferTranscriptMessage(callId, {
        role: 'user',
        message: 'Hello',
        timestamp: Date.now(),
      });

      client.bufferTranscriptMessage(callId, {
        role: 'assistant',
        message: 'Hi there',
        timestamp: Date.now(),
      });

      const buffered = client.getBufferedTranscript(callId);
      expect(buffered).toHaveLength(2);

      const text = client.getBufferedTranscriptText(callId);
      expect(text).toContain('Patient: Hello');
      expect(text).toContain('Assistant: Hi there');

      client.clearTranscriptBuffer(callId);
      expect(client.getBufferedTranscript(callId)).toHaveLength(0);
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse call.ended webhook', () => {
      const payload = {
        type: 'call.ended',
        call: {
          id: 'call_123',
          orgId: 'org_123',
          assistantId: 'asst_123',
          status: 'ended',
          type: 'inbound',
          customer: { number: '+40721000001' },
        },
      };

      const result = client.parseWebhookPayload(payload);

      expect(result?.type).toBe('call.ended');
      expect(result?.data).toHaveProperty('id', 'call_123');
    });

    it('should return null for invalid payload', () => {
      const result = client.parseWebhookPayload({ type: 'unknown' });
      expect(result).toBeNull();
    });
  });
});

describe('formatTranscriptForCRM', () => {
  it('should format transcript for HubSpot timeline', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'assistant', message: 'Buna ziua!', timestamp: Date.now() },
        { role: 'user', message: 'Salut!', timestamp: Date.now() },
        { role: 'system', message: 'System message', timestamp: Date.now() },
      ],
      duration: 180,
      startedAt: '2024-01-15T10:00:00Z',
      endedAt: '2024-01-15T10:03:00Z',
    };

    const formatted = formatTranscriptForCRM(transcript);

    expect(formatted).toContain('Call ID: call_123');
    expect(formatted).toContain('Duration: 3 minutes');
    expect(formatted).toContain('[AI Assistant]: Buna ziua!');
    expect(formatted).toContain('[Patient]: Salut!');
    expect(formatted).not.toContain('[System]'); // System messages excluded
  });
});

describe('extractLeadQualification', () => {
  it('should classify HOT lead with high-value procedures', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Patient interested in implants',
      topics: ['implant', 'all-on-4'],
      sentiment: 'positive',
      keyPhrases: ['implant', 'pret', 'programare'],
      actionItems: ['Schedule consultation'],
      procedureInterest: ['implant', 'all-on-4'],
      urgencyLevel: 'high',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.classification).toBe('HOT');
    expect(qualification.score).toBeGreaterThanOrEqual(4);
  });

  it('should classify WARM lead with general interest', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Patient asking about dental services',
      topics: ['consultatie'],
      sentiment: 'neutral',
      keyPhrases: ['pret', 'consultatie'],
      actionItems: [],
      procedureInterest: ['consultatie'],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.classification).toBe('WARM');
    expect(qualification.score).toBe(3);
  });

  it('should classify COLD lead with no procedure interest', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'General inquiry',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.classification).toBe('COLD');
    expect(qualification.score).toBeLessThanOrEqual(2);
  });

  it('should boost score for urgent leads', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Urgent dental issue',
      topics: ['durere'],
      sentiment: 'negative',
      keyPhrases: ['urgent', 'durere'],
      actionItems: ['Immediate callback'],
      procedureInterest: [],
      urgencyLevel: 'critical',
    };

    const qualification = extractLeadQualification(summary);

    // Critical urgency should boost score
    expect(qualification.score).toBeGreaterThanOrEqual(3);
    expect(qualification.reason).toContain('Urgency: critical');
  });
});
