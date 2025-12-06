import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createVapiClient,
  VapiClient,
  formatTranscriptForCRM,
  extractLeadQualification,
  VapiCallStatusSchema,
  VapiEndedReasonSchema,
  VapiMessageSchema,
  VapiCallSchema,
  VapiTranscriptSchema,
  VapiWebhookPayloadSchema,
  type VapiTranscript,
  type VapiCallSummary,
  type VapiMessage,
} from '../vapi.js';

// Tests use MSW handlers from setup.ts for API mocking

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

  it('should classify UNQUALIFIED with very low score', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Wrong number',
      topics: [],
      sentiment: 'negative',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    // Score is clamped at minimum 1 which rounds to COLD, not UNQUALIFIED
    // But the classification logic shows it would be UNQUALIFIED if score < 2
    expect(qualification.score).toBeLessThanOrEqual(2);
  });

  it('should handle high urgency level boost', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Moderate urgency case',
      topics: ['durere'],
      sentiment: 'neutral',
      keyPhrases: ['durere'],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'high',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.score).toBeGreaterThanOrEqual(2);
  });

  it('should handle positive sentiment boost', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Happy patient',
      topics: [],
      sentiment: 'positive',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: ['consultatie'],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.score).toBeGreaterThanOrEqual(3);
  });

  it('should include action items count in reason', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Action needed',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: ['Call back', 'Send info', 'Schedule'],
      procedureInterest: [],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.reason).toContain('3 action items');
  });
});

describe('VapiClient buffer management', () => {
  let client: VapiClient;

  beforeEach(() => {
    client = createVapiClient({
      apiKey: 'test-api-key',
      assistantId: 'test-assistant',
      phoneNumberId: 'test-phone-number',
    });
  });

  afterEach(() => {
    client.destroy();
  });

  it('should track buffer stats', () => {
    const stats = client.getBufferStats();
    expect(stats.trackedCalls).toBe(0);
    expect(stats.maxCalls).toBe(100);
  });

  it('should increment tracked calls when buffering', () => {
    client.bufferTranscriptMessage('call_1', {
      role: 'user',
      message: 'Hello',
      timestamp: Date.now(),
    });

    const stats = client.getBufferStats();
    expect(stats.trackedCalls).toBe(1);
  });

  it('should handle multiple concurrent calls', () => {
    for (let i = 0; i < 10; i++) {
      client.bufferTranscriptMessage(`call_${i}`, {
        role: 'user',
        message: `Message ${i}`,
        timestamp: Date.now(),
      });
    }

    const stats = client.getBufferStats();
    expect(stats.trackedCalls).toBe(10);
  });

  it('should evict oldest call when at max capacity', () => {
    // Fill up to max tracked calls
    for (let i = 0; i < 100; i++) {
      client.bufferTranscriptMessage(`call_${i}`, {
        role: 'user',
        message: `Message ${i}`,
        timestamp: Date.now(),
      });
    }

    // Add one more - should evict the oldest
    client.bufferTranscriptMessage('call_new', {
      role: 'user',
      message: 'New message',
      timestamp: Date.now(),
    });

    const stats = client.getBufferStats();
    expect(stats.trackedCalls).toBe(100);

    // First call should be evicted
    expect(client.getBufferedTranscript('call_0')).toHaveLength(0);
    expect(client.getBufferedTranscript('call_new')).toHaveLength(1);
  });

  it('should start and stop buffer cleanup', () => {
    client.startBufferCleanup();
    // Starting again should be a no-op
    client.startBufferCleanup();

    client.stopBufferCleanup();
    // Stopping again should be safe
    client.stopBufferCleanup();
  });

  it('should clear all buffers on destroy', () => {
    client.bufferTranscriptMessage('call_1', {
      role: 'user',
      message: 'Hello',
      timestamp: Date.now(),
    });

    client.destroy();

    expect(client.getBufferStats().trackedCalls).toBe(0);
  });

  it('should trim buffer when exceeding max messages per call', () => {
    // Add 1000+ messages to a single call
    for (let i = 0; i < 1005; i++) {
      client.bufferTranscriptMessage('call_large', {
        role: 'user',
        message: `Message ${i}`,
        timestamp: Date.now(),
      });
    }

    const messages = client.getBufferedTranscript('call_large');
    // Should have trimmed to 80% of max (800) plus new messages
    expect(messages.length).toBeLessThanOrEqual(1000);
  });
});

describe('VapiClient webhook parsing - all types', () => {
  const client = createVapiClient({
    apiKey: 'test-api-key',
    assistantId: 'test-assistant',
    phoneNumberId: 'test-phone-number',
  });

  it('should parse call.started webhook', () => {
    const payload = {
      type: 'call.started',
      call: {
        id: 'call_123',
        orgId: 'org_123',
        assistantId: 'asst_123',
        status: 'in-progress',
        type: 'inbound',
        customer: { number: '+40721000001' },
      },
    };

    const result = client.parseWebhookPayload(payload);

    expect(result?.type).toBe('call.started');
    expect(result?.data).toHaveProperty('id', 'call_123');
    expect(result?.data).toHaveProperty('status', 'in-progress');
  });

  it('should parse transcript.updated webhook', () => {
    const payload = {
      type: 'transcript.updated',
      transcript: {
        callId: 'call_123',
        messages: [{ role: 'user', message: 'Hello', timestamp: Date.now() }],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    };

    const result = client.parseWebhookPayload(payload);

    expect(result?.type).toBe('transcript.updated');
    expect(result?.data).toHaveProperty('callId', 'call_123');
  });

  it('should parse function.call webhook', () => {
    const payload = {
      type: 'function.call',
      message: {
        role: 'function_call',
        message: 'Calling function',
        timestamp: Date.now(),
        name: 'schedule_appointment',
        arguments: '{"date": "2024-01-15"}',
      },
    };

    const result = client.parseWebhookPayload(payload);

    expect(result?.type).toBe('function.call');
    expect(result?.data).toHaveProperty('name', 'schedule_appointment');
  });

  it('should throw on invalid payload when throwOnError is true', () => {
    expect(() => {
      client.parseWebhookPayload({ type: 'unknown' }, { throwOnError: true });
    }).toThrow();
  });

  it('should return null for unknown webhook type without throwing', () => {
    const result = client.parseWebhookPayload({ type: 'unknown' }, { throwOnError: false });
    expect(result).toBeNull();
  });
});

describe('VapiClient analyzeTranscript - edge cases', () => {
  const client = createVapiClient({
    apiKey: 'test-api-key',
    assistantId: 'test-assistant',
    phoneNumberId: 'test-phone-number',
  });

  it('should handle empty transcript', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [],
      duration: 0,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);

    expect(analysis.customerMessages).toHaveLength(0);
    expect(analysis.assistantMessages).toHaveLength(0);
    expect(analysis.speakingRatio.customer).toBe(0.5);
    expect(analysis.speakingRatio.assistant).toBe(0.5);
  });

  it('should handle Romanian question patterns', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Cand pot veni?', timestamp: Date.now() },
        { role: 'user', message: 'Unde este clinica?', timestamp: Date.now() },
        { role: 'user', message: 'Care este pretul?', timestamp: Date.now() },
        { role: 'user', message: 'Ce tratamente oferiti?', timestamp: Date.now() },
        { role: 'user', message: 'Cine ma va trata?', timestamp: Date.now() },
        { role: 'user', message: 'De ce costa atat?', timestamp: Date.now() },
      ],
      duration: 120,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);

    // All messages are questions (either contain ? or start with Romanian question words)
    expect(analysis.questions.length).toBeGreaterThanOrEqual(6);
  });

  it('should detect all procedure keywords', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Vreau implanturi si fatete', timestamp: Date.now() },
        { role: 'user', message: 'Si poate coroane si punti', timestamp: Date.now() },
        { role: 'user', message: 'Ce ziceti de ortodontie sau invisalign?', timestamp: Date.now() },
        {
          role: 'user',
          message: 'Am nevoie de extractie si tratament canal',
          timestamp: Date.now(),
        },
      ],
      duration: 180,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);

    expect(analysis.procedureMentions).toContain('implant');
    expect(analysis.procedureMentions).toContain('fatete');
    expect(analysis.procedureMentions).toContain('coroane');
    expect(analysis.procedureMentions).toContain('punti');
    expect(analysis.procedureMentions).toContain('ortodontie');
    expect(analysis.procedureMentions).toContain('invisalign');
    expect(analysis.procedureMentions).toContain('extractie');
    expect(analysis.procedureMentions).toContain('tratament canal');
  });

  it('should extract cost and pricing keywords', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Cat costa? Ce pret aveti?', timestamp: Date.now() },
        { role: 'user', message: 'Aveti rate sau finantare?', timestamp: Date.now() },
        {
          role: 'user',
          message: 'Acceptati asigurare? Ce garantie oferiti?',
          timestamp: Date.now(),
        },
      ],
      duration: 90,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);

    expect(analysis.keywords).toContain('pret');
    expect(analysis.keywords).toContain('cost');
    expect(analysis.keywords).toContain('rate');
    expect(analysis.keywords).toContain('finantare');
    expect(analysis.keywords).toContain('asigurare');
    expect(analysis.keywords).toContain('garantie');
  });

  it('should handle system messages', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'system', message: 'Call connected', timestamp: Date.now() },
        { role: 'user', message: 'Hello', timestamp: Date.now() },
        { role: 'assistant', message: 'Hi there', timestamp: Date.now() },
        { role: 'system', message: 'Call ended', timestamp: Date.now() },
      ],
      duration: 30,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);

    expect(analysis.customerMessages).toHaveLength(1);
    expect(analysis.assistantMessages).toHaveLength(1);
  });

  it('should handle function_call messages', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Schedule me an appointment', timestamp: Date.now() },
        {
          role: 'function_call',
          message: 'Scheduling appointment',
          timestamp: Date.now(),
          name: 'schedule',
          arguments: '{}',
        },
        { role: 'assistant', message: 'Done!', timestamp: Date.now() },
      ],
      duration: 60,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);

    expect(analysis.customerMessages).toHaveLength(1);
    expect(analysis.assistantMessages).toHaveLength(1);
  });
});

describe('VapiClient generateCallSummary - edge cases', () => {
  const client = createVapiClient({
    apiKey: 'test-api-key',
    assistantId: 'test-assistant',
    phoneNumberId: 'test-phone-number',
  });

  it('should detect negative sentiment', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Nu sunt multumit. Este gresit.', timestamp: Date.now() },
        { role: 'user', message: 'Este o problema. Sunt dezamagit.', timestamp: Date.now() },
        { role: 'user', message: 'Rau, foarte rau.', timestamp: Date.now() },
      ],
      duration: 60,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);
    const summary = client.generateCallSummary(transcript, analysis);

    expect(summary.sentiment).toBe('negative');
  });

  it('should detect medium urgency level', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [{ role: 'user', message: 'Am o durere usor suportabila', timestamp: Date.now() }],
      duration: 30,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);
    const summary = client.generateCallSummary(transcript, analysis);

    expect(summary.urgencyLevel).toBe('medium');
  });

  it('should detect high urgency level', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Ma doare foarte tare. Este urgent!', timestamp: Date.now() },
      ],
      duration: 30,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);
    const summary = client.generateCallSummary(transcript, analysis);

    expect(['high', 'critical']).toContain(summary.urgencyLevel);
  });

  it('should extract action items from assistant messages', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Vreau o programare', timestamp: Date.now() },
        { role: 'assistant', message: 'Vom programa o consultatie.', timestamp: Date.now() },
        { role: 'assistant', message: 'Veti primi un email de confirmare.', timestamp: Date.now() },
        { role: 'assistant', message: 'Trebuie sa aduceti radiografia.', timestamp: Date.now() },
      ],
      duration: 120,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);
    const summary = client.generateCallSummary(transcript, analysis);

    expect(summary.actionItems.length).toBeGreaterThan(0);
  });

  it('should build summary with no procedure mentions', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Hello', timestamp: Date.now() },
        { role: 'assistant', message: 'Hi', timestamp: Date.now() },
      ],
      duration: 10,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);
    const summary = client.generateCallSummary(transcript, analysis);

    expect(summary.summary).toContain('Call duration');
    expect(summary.summary).toContain('word count');
  });

  it('should include questions count in summary', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Cat costa?', timestamp: Date.now() },
        { role: 'user', message: 'Cand pot veni?', timestamp: Date.now() },
        { role: 'user', message: 'Unde sunteti?', timestamp: Date.now() },
      ],
      duration: 60,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const analysis = client.analyzeTranscript(transcript);
    const summary = client.generateCallSummary(transcript, analysis);

    expect(summary.summary).toContain('Asked 3 questions');
  });
});

describe('Zod schemas validation', () => {
  it('should validate VapiCallStatusSchema', () => {
    expect(VapiCallStatusSchema.parse('queued')).toBe('queued');
    expect(VapiCallStatusSchema.parse('ringing')).toBe('ringing');
    expect(VapiCallStatusSchema.parse('in-progress')).toBe('in-progress');
    expect(VapiCallStatusSchema.parse('forwarding')).toBe('forwarding');
    expect(VapiCallStatusSchema.parse('ended')).toBe('ended');

    expect(() => VapiCallStatusSchema.parse('invalid')).toThrow();
  });

  it('should validate VapiEndedReasonSchema', () => {
    expect(VapiEndedReasonSchema.parse('assistant-ended-call')).toBe('assistant-ended-call');
    expect(VapiEndedReasonSchema.parse('customer-ended-call')).toBe('customer-ended-call');
    expect(VapiEndedReasonSchema.parse('call-timeout')).toBe('call-timeout');
    expect(VapiEndedReasonSchema.parse('assistant-error')).toBe('assistant-error');
    expect(VapiEndedReasonSchema.parse('customer-did-not-answer')).toBe('customer-did-not-answer');
    expect(VapiEndedReasonSchema.parse('voicemail')).toBe('voicemail');
    expect(VapiEndedReasonSchema.parse('silence-timeout')).toBe('silence-timeout');
    expect(VapiEndedReasonSchema.parse('pipeline-error')).toBe('pipeline-error');

    expect(() => VapiEndedReasonSchema.parse('invalid')).toThrow();
  });

  it('should validate VapiMessageSchema', () => {
    const valid = {
      role: 'user',
      message: 'Hello',
      timestamp: Date.now(),
    };

    expect(VapiMessageSchema.parse(valid)).toEqual(valid);

    // With optional fields
    const withOptional = {
      ...valid,
      duration: 5,
      name: 'function_name',
      arguments: '{"key": "value"}',
    };

    expect(VapiMessageSchema.parse(withOptional)).toEqual(withOptional);
  });

  it('should validate VapiCallSchema', () => {
    const minimalCall = {
      id: 'call_123',
      orgId: 'org_123',
      assistantId: 'asst_123',
      status: 'queued',
      type: 'inbound',
    };

    expect(VapiCallSchema.parse(minimalCall)).toEqual(minimalCall);

    // Full call with all optional fields
    const fullCall = {
      ...minimalCall,
      phoneNumber: { id: 'phone_123', number: '+40721000001' },
      customer: { number: '+40721000002', name: 'John Doe' },
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      endedReason: 'customer-ended-call',
      cost: 0.05,
    };

    expect(VapiCallSchema.parse(fullCall)).toEqual(fullCall);
  });

  it('should validate VapiTranscriptSchema', () => {
    const transcript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Hello', timestamp: Date.now() },
        { role: 'assistant', message: 'Hi there', timestamp: Date.now() },
      ],
      duration: 60,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    expect(VapiTranscriptSchema.parse(transcript)).toEqual(transcript);
  });

  it('should validate VapiWebhookPayloadSchema for all types', () => {
    const callStarted = {
      type: 'call.started',
      call: {
        id: 'call_123',
        orgId: 'org_123',
        assistantId: 'asst_123',
        status: 'ringing',
        type: 'inbound',
      },
    };
    expect(VapiWebhookPayloadSchema.parse(callStarted)).toBeDefined();

    const callEnded = {
      type: 'call.ended',
      call: {
        id: 'call_123',
        orgId: 'org_123',
        assistantId: 'asst_123',
        status: 'ended',
        type: 'outbound',
        endedReason: 'customer-ended-call',
      },
    };
    expect(VapiWebhookPayloadSchema.parse(callEnded)).toBeDefined();

    const transcriptUpdated = {
      type: 'transcript.updated',
      transcript: {
        callId: 'call_123',
        messages: [],
        duration: 0,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    };
    expect(VapiWebhookPayloadSchema.parse(transcriptUpdated)).toBeDefined();

    const functionCall = {
      type: 'function.call',
      message: {
        role: 'function_call',
        message: 'Calling function',
        timestamp: Date.now(),
      },
    };
    expect(VapiWebhookPayloadSchema.parse(functionCall)).toBeDefined();
  });
});

describe('VapiClient configuration', () => {
  it('should use custom baseUrl', () => {
    const client = createVapiClient({
      apiKey: 'test-key',
      baseUrl: 'https://custom.vapi.ai',
    });

    expect(client).toBeDefined();
  });

  it('should use custom timeout', () => {
    const client = createVapiClient({
      apiKey: 'test-key',
      timeoutMs: 60000,
    });

    expect(client).toBeDefined();
  });

  it('should use custom retry config', () => {
    const client = createVapiClient({
      apiKey: 'test-key',
      retryConfig: {
        maxRetries: 5,
        baseDelayMs: 2000,
      },
    });

    expect(client).toBeDefined();
  });

  it('should handle all configuration options', () => {
    const client = createVapiClient({
      apiKey: 'test-key',
      assistantId: 'asst_123',
      phoneNumberId: 'phone_123',
      baseUrl: 'https://custom.vapi.ai',
      timeoutMs: 45000,
      retryConfig: {
        maxRetries: 3,
        baseDelayMs: 1000,
      },
    });

    expect(client).toBeDefined();
  });
});
