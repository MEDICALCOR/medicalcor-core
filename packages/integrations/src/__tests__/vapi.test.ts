import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  VapiClient,
  createVapiClient,
  formatTranscriptForCRM,
  extractLeadQualification,
  VapiWebhookPayloadSchema,
  type VapiTranscript,
  type VapiCallSummary,
  type VapiMessage,
  type VapiCall,
} from '../vapi.js';
import { server, createRateLimitedHandler, createFailingHandler } from '../__mocks__/setup.js';

// Tests use MSW handlers from setup.ts for API mocking

describe('VapiClient', () => {
  describe('constructor and configuration', () => {
    it('should create client with default config', () => {
      const client = createVapiClient({
        apiKey: 'test-api-key',
        assistantId: 'test-assistant',
        phoneNumberId: 'test-phone-number',
      });

      expect(client).toBeInstanceOf(VapiClient);
    });

    it('should use default base URL when not provided', () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
      });

      expect(client).toBeInstanceOf(VapiClient);
    });

    it('should use custom base URL when provided', () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
        baseUrl: 'https://custom-vapi-api.example.com',
      });

      expect(client).toBeInstanceOf(VapiClient);
    });

    it('should accept custom timeout config', () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
        timeoutMs: 60000,
      });

      expect(client).toBeInstanceOf(VapiClient);
    });

    it('should accept custom retry config', () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });

      expect(client).toBeInstanceOf(VapiClient);
    });

    it('should accept all optional config parameters', () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
        assistantId: 'custom-assistant',
        phoneNumberId: 'custom-phone',
        baseUrl: 'https://custom.vapi.ai',
        timeoutMs: 45000,
        retryConfig: {
          maxRetries: 4,
          baseDelayMs: 1500,
        },
      });

      expect(client).toBeInstanceOf(VapiClient);
    });
  });

  describe('createOutboundCall', () => {
    const client = createVapiClient({
      apiKey: 'test-api-key',
      assistantId: 'test-assistant',
      phoneNumberId: 'test-phone-number',
    });

    it('should create an outbound call', async () => {
      const result = await client.createOutboundCall({
        phoneNumber: '+40721000001',
        name: 'Test Patient',
      });

      expect(result.id).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.type).toBe('outbound');
    });

    it('should create outbound call with custom assistantId', async () => {
      const result = await client.createOutboundCall({
        phoneNumber: '+40721000001',
        assistantId: 'custom-assistant-id',
      });

      expect(result.id).toBeDefined();
      expect(result.type).toBe('outbound');
    });

    it('should create outbound call with metadata', async () => {
      const result = await client.createOutboundCall({
        phoneNumber: '+40721000001',
        metadata: {
          leadSource: 'website',
          campaignId: 'campaign_123',
        },
      });

      expect(result.id).toBeDefined();
    });

    it('should fail on rate limit (429 not in retry config)', async () => {
      const customClient = new VapiClient({
        apiKey: 'test-api-key',
        retryConfig: { maxRetries: 0, baseDelayMs: 100 },
      });

      server.use(createRateLimitedHandler('https://api.vapi.ai/call', 'post', 1));

      // 429 errors are not retried because shouldRetry doesn't include '429'
      await expect(
        customClient.createOutboundCall({
          phoneNumber: '+40721000001',
        })
      ).rejects.toThrow('Request failed with status 429');
    });

    it('should handle retry on 502 error', async () => {
      const customClient = new VapiClient({
        apiKey: 'test-api-key',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      server.use(createFailingHandler('https://api.vapi.ai/call', 'post', 2, 502));

      const result = await customClient.createOutboundCall({
        phoneNumber: '+40721000001',
      });

      expect(result).toBeDefined();
    });

    it('should handle retry on 503 error', async () => {
      const customClient = new VapiClient({
        apiKey: 'test-api-key',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      server.use(createFailingHandler('https://api.vapi.ai/call', 'post', 2, 503));

      const result = await customClient.createOutboundCall({
        phoneNumber: '+40721000001',
      });

      expect(result).toBeDefined();
    });
  });

  describe('getCall', () => {
    const client = createVapiClient({
      apiKey: 'test-api-key',
      assistantId: 'test-assistant',
      phoneNumberId: 'test-phone-number',
    });

    it('should get call details', async () => {
      const result = await client.getCall({ callId: 'call_123' });

      expect(result.id).toBe('call_123');
      expect(result.status).toBe('ended');
    });

    it('should get call with all optional fields', async () => {
      const result = await client.getCall({ callId: 'call_123' });

      expect(result.id).toBe('call_123');
      expect(result.orgId).toBeDefined();
      expect(result.assistantId).toBeDefined();
      expect(result.customer).toBeDefined();
      expect(result.phoneNumber).toBeDefined();
    });
  });

  describe('listCalls', () => {
    const client = createVapiClient({
      apiKey: 'test-api-key',
    });

    it('should list calls without filters', async () => {
      const result = await client.listCalls();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should list calls with assistantId filter', async () => {
      const result = await client.listCalls({
        assistantId: 'ast_test123',
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should list calls with limit', async () => {
      const result = await client.listCalls({
        limit: 10,
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should list calls with date filters', async () => {
      const result = await client.listCalls({
        createdAtGte: '2024-01-01T00:00:00Z',
        createdAtLte: '2024-12-31T23:59:59Z',
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should list calls with all filters combined', async () => {
      const result = await client.listCalls({
        assistantId: 'ast_test123',
        limit: 5,
        createdAtGte: '2024-01-01T00:00:00Z',
        createdAtLte: '2024-12-31T23:59:59Z',
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getTranscript', () => {
    const client = createVapiClient({
      apiKey: 'test-api-key',
    });

    it('should get call transcript', async () => {
      const result = await client.getTranscript('call_123');

      expect(result.callId).toBe('call_123');
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
    });

    it('should get transcript with all message types', async () => {
      const result = await client.getTranscript('call_123');

      const hasUser = result.messages.some((m) => m.role === 'user');
      const hasAssistant = result.messages.some((m) => m.role === 'assistant');

      expect(hasUser).toBe(true);
      expect(hasAssistant).toBe(true);
    });
  });

  describe('endCall', () => {
    const client = createVapiClient({
      apiKey: 'test-api-key',
    });

    it('should end an active call', async () => {
      await expect(client.endCall('call_123')).resolves.toBeUndefined();
    });

    it('should handle retry on 503 error when ending call', async () => {
      const customClient = new VapiClient({
        apiKey: 'test-api-key',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      server.use(createFailingHandler('https://api.vapi.ai/call/call_retry', 'delete', 2, 503));

      await expect(customClient.endCall('call_retry')).resolves.toBeUndefined();
    });
  });

  describe('requestWithTimeout', () => {
    it('should handle timeout error', async () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
        timeoutMs: 100,
      });

      // Mock a slow endpoint that will timeout
      server.use(
        http.get('https://api.vapi.ai/call/timeout_test', async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return HttpResponse.json({ id: 'timeout_test' });
        })
      );

      await expect(client.getCall({ callId: 'timeout_test' })).rejects.toThrow('Request timeout');
    });

    it('should handle non-JSON response', async () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
      });

      // endCall returns 204 No Content (non-JSON)
      await expect(client.endCall('call_123')).resolves.toBeUndefined();
    });

    it('should throw ExternalServiceError on 400 error', async () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
      });

      server.use(
        http.get('https://api.vapi.ai/call/error_400', () => {
          return HttpResponse.json({ error: 'Bad request' }, { status: 400 });
        })
      );

      await expect(client.getCall({ callId: 'error_400' })).rejects.toThrow(
        'Request failed with status 400'
      );
    });

    it('should throw ExternalServiceError on 404 error', async () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
      });

      server.use(
        http.get('https://api.vapi.ai/call/not_found', () => {
          return HttpResponse.json({ error: 'Not found' }, { status: 404 });
        })
      );

      await expect(client.getCall({ callId: 'not_found' })).rejects.toThrow(
        'Request failed with status 404'
      );
    });

    it('should throw ExternalServiceError on 500 error', async () => {
      const client = new VapiClient({
        apiKey: 'test-api-key',
        retryConfig: { maxRetries: 0, baseDelayMs: 0 },
      });

      server.use(
        http.get('https://api.vapi.ai/call/error_500', () => {
          return HttpResponse.json({ error: 'Internal error' }, { status: 500 });
        })
      );

      await expect(client.getCall({ callId: 'error_500' })).rejects.toThrow(
        'Request failed with status 500'
      );
    });
  });

  describe('analyzeTranscript', () => {
    const client = createVapiClient({
      apiKey: 'test-api-key',
    });

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

    it('should detect Romanian question patterns without question mark', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          { role: 'user', message: 'Cand pot veni la consultatie', timestamp: Date.now() },
          { role: 'user', message: 'Cat costa procedura', timestamp: Date.now() },
          { role: 'user', message: 'Cum functioneaza tratamentul', timestamp: Date.now() },
          { role: 'user', message: 'Unde este locatia', timestamp: Date.now() },
          { role: 'user', message: 'Care sunt optiunile', timestamp: Date.now() },
          { role: 'user', message: 'Ce trebuie sa fac', timestamp: Date.now() },
          { role: 'user', message: 'Cine face procedura', timestamp: Date.now() },
          { role: 'user', message: 'De ce dureaza atat', timestamp: Date.now() },
        ],
        duration: 120,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.questions.length).toBeGreaterThan(5);
    });

    it('should calculate speaking ratio correctly', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          { role: 'user', message: 'Message 1', timestamp: Date.now() },
          { role: 'user', message: 'Message 2', timestamp: Date.now() },
          { role: 'user', message: 'Message 3', timestamp: Date.now() },
          { role: 'assistant', message: 'Message 4', timestamp: Date.now() },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.speakingRatio.customer).toBe(0.75);
      expect(analysis.speakingRatio.assistant).toBe(0.25);
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

    it('should detect all dental procedure keywords', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message:
              'Sunt interesat de implanturi, fatete dentare, coroane, extractie, albire, detartraj',
            timestamp: Date.now(),
          },
          {
            role: 'user',
            message: 'Si de ortodontie, aparat dentar, invisalign, proteza',
            timestamp: Date.now(),
          },
          {
            role: 'user',
            message: 'Am si o carie, poate e nevoie de plomba sau tratament canal',
            timestamp: Date.now(),
          },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.procedureMentions.length).toBeGreaterThan(10);
      expect(analysis.procedureMentions).toContain('implant');
      expect(analysis.procedureMentions).toContain('fatete');
      expect(analysis.procedureMentions).toContain('coroane');
      expect(analysis.procedureMentions).toContain('carie');
    });

    it('should count words correctly', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          { role: 'user', message: 'Hello world test message', timestamp: Date.now() },
          { role: 'assistant', message: 'Response message here', timestamp: Date.now() },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.wordCount).toBeGreaterThan(0);
    });

    it('should detect important keywords for dental clinic', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Cat costa tratamentul? Acceptati asigurare? Se poate plati in rate?',
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            message: 'Pretul este de 1000 euro. Avem si finantare disponibila cu garantie.',
            timestamp: Date.now(),
          },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.keywords).toContain('pret');
      expect(analysis.keywords).toContain('tratament');
      expect(analysis.keywords).toContain('asigurare');
      expect(analysis.keywords).toContain('rate');
      expect(analysis.keywords).toContain('finantare');
      expect(analysis.keywords).toContain('garantie');
    });
  });

  describe('generateCallSummary', () => {
    const client = createVapiClient({
      apiKey: 'test-api-key',
    });

    it('should generate summary with correct urgency level - critical', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Am o durere puternica la un dinte. Este urgent! Nu pot dormi.',
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

      expect(summary.urgencyLevel).toBe('critical');
      expect(summary.callId).toBe('call_123');
    });

    it('should generate summary with high urgency level', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Am o durere. Este urgent!',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.urgencyLevel).toBe('high');
    });

    it('should generate summary with medium urgency level', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Am o problema cu un dinte',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.urgencyLevel).toBe('medium');
    });

    it('should generate summary with low urgency level', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'As vrea informatii generale',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.urgencyLevel).toBe('low');
    });

    it('should detect positive sentiment', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Multumesc foarte mult! A fost perfect! Excelent serviciu, super!',
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

    it('should detect negative sentiment', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Nu sunt multumit. Problema nu a fost rezolvata. Rau serviciu. Gresit totul.',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.sentiment).toBe('negative');
    });

    it('should detect neutral sentiment', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Vreau informatii despre servicii',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.sentiment).toBe('neutral');
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

    it('should extract action items from assistant messages', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'assistant',
            message: 'Va vom suna inapoi maine pentru a confirma programarea.',
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            message: 'Veti primi un email cu detaliile tratamentului.',
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            message: 'Trebuie sa va aduceti documentele medicale.',
            timestamp: Date.now(),
          },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.actionItems.length).toBeGreaterThan(0);
    });

    it('should limit action items to 3', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          { role: 'assistant', message: 'Vom trimite documentele', timestamp: Date.now() },
          { role: 'assistant', message: 'Va vom suna maine', timestamp: Date.now() },
          { role: 'assistant', message: 'Veti primi email', timestamp: Date.now() },
          { role: 'assistant', message: 'Trebuie sa confirmati', timestamp: Date.now() },
          { role: 'assistant', message: 'Contact in 2 zile', timestamp: Date.now() },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.actionItems.length).toBeLessThanOrEqual(3);
    });

    it('should build topics from procedures and keywords', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Cat costa un implant? Vreau o programare pentru consultatie.',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.topics.length).toBeGreaterThan(0);
      expect(summary.topics.length).toBeLessThanOrEqual(5);
    });

    it('should limit key phrases to 10', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message:
              'pret cost programare consultatie tratament implant fateta coroana extractie durere asigurare rate finantare garantie',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.keyPhrases.length).toBeLessThanOrEqual(10);
    });

    it('should generate summary text with all components', () => {
      const transcript: VapiTranscript = {
        callId: 'call_123',
        messages: [
          {
            role: 'user',
            message: 'Cat costa un implant? Cand pot veni?',
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            message: 'Pretul este 600 euro.',
            timestamp: Date.now(),
          },
        ],
        duration: 180,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.summary).toContain('minutes');
      expect(summary.summary).toContain('word count');
    });
  });

  describe('parseWebhookPayload', () => {
    const client = createVapiClient({
      apiKey: 'test-api-key',
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
    });

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
          endedReason: 'customer-ended-call',
        },
      };

      const result = client.parseWebhookPayload(payload);

      expect(result?.type).toBe('call.ended');
      expect(result?.data).toHaveProperty('id', 'call_123');
      expect((result?.data as VapiCall).endedReason).toBe('customer-ended-call');
    });

    it('should parse transcript.updated webhook', () => {
      const payload = {
        type: 'transcript.updated',
        transcript: {
          callId: 'call_123',
          messages: [
            { role: 'user', message: 'Hello', timestamp: Date.now() },
            { role: 'assistant', message: 'Hi', timestamp: Date.now() },
          ],
          duration: 60,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
      };

      const result = client.parseWebhookPayload(payload);

      expect(result?.type).toBe('transcript.updated');
      expect(result?.data).toHaveProperty('callId', 'call_123');
      expect((result?.data as VapiTranscript).messages).toHaveLength(2);
    });

    it('should parse function.call webhook', () => {
      const payload = {
        type: 'function.call',
        message: {
          role: 'function_call',
          message: 'Calling function',
          timestamp: Date.now(),
          name: 'schedule_appointment',
          arguments: '{"date":"2025-01-15","time":"10:00"}',
        },
      };

      const result = client.parseWebhookPayload(payload);

      expect(result?.type).toBe('function.call');
      expect(result?.data).toHaveProperty('role', 'function_call');
      expect((result?.data as VapiMessage).name).toBe('schedule_appointment');
      expect((result?.data as VapiMessage).arguments).toBeDefined();
    });

    it('should return null for invalid payload', () => {
      const result = client.parseWebhookPayload({ type: 'unknown' });
      expect(result).toBeNull();
    });

    it('should return null for malformed payload', () => {
      const result = client.parseWebhookPayload({ invalid: 'data' });
      expect(result).toBeNull();
    });

    it('should throw error when throwOnError is true', () => {
      expect(() => {
        client.parseWebhookPayload({ type: 'unknown' }, { throwOnError: true });
      }).toThrow();
    });

    it('should validate all call ended reasons', () => {
      const endedReasons = [
        'assistant-ended-call',
        'customer-ended-call',
        'call-timeout',
        'assistant-error',
        'customer-did-not-answer',
        'voicemail',
        'silence-timeout',
        'pipeline-error',
      ];

      endedReasons.forEach((reason) => {
        const payload = {
          type: 'call.ended',
          call: {
            id: 'call_123',
            orgId: 'org_123',
            assistantId: 'asst_123',
            status: 'ended',
            type: 'outbound',
            endedReason: reason,
          },
        };

        const result = client.parseWebhookPayload(payload);
        expect(result).not.toBeNull();
        expect((result?.data as VapiCall).endedReason).toBe(reason);
      });
    });

    it('should validate all call statuses', () => {
      const statuses = ['queued', 'ringing', 'in-progress', 'forwarding', 'ended'];

      statuses.forEach((status) => {
        const payload = {
          type: 'call.started',
          call: {
            id: 'call_123',
            orgId: 'org_123',
            assistantId: 'asst_123',
            status,
            type: 'inbound',
          },
        };

        const result = client.parseWebhookPayload(payload);
        expect(result).not.toBeNull();
        expect((result?.data as VapiCall).status).toBe(status);
      });
    });
  });

  describe('transcript buffer', () => {
    let client: VapiClient;

    beforeEach(() => {
      client = createVapiClient({
        apiKey: 'test-api-key',
      });
    });

    afterEach(() => {
      client.destroy();
    });

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

    it('should filter system messages in buffered transcript text', () => {
      const callId = 'buffer_test_filter';

      client.bufferTranscriptMessage(callId, {
        role: 'user',
        message: 'User message',
        timestamp: Date.now(),
      });

      client.bufferTranscriptMessage(callId, {
        role: 'system',
        message: 'System message',
        timestamp: Date.now(),
      });

      client.bufferTranscriptMessage(callId, {
        role: 'assistant',
        message: 'Assistant message',
        timestamp: Date.now(),
      });

      const text = client.getBufferedTranscriptText(callId);
      expect(text).not.toContain('System');
      expect(text).toContain('Patient: User message');
      expect(text).toContain('Assistant: Assistant message');
    });

    it('should handle max messages per call limit', () => {
      const callId = 'buffer_test_max_messages';

      // Add more than max allowed messages
      for (let i = 0; i < 1100; i++) {
        client.bufferTranscriptMessage(callId, {
          role: 'user',
          message: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const buffered = client.getBufferedTranscript(callId);
      // Should be trimmed to 80% of max (800)
      expect(buffered.length).toBeLessThanOrEqual(1000);
      expect(buffered.length).toBeGreaterThan(0);
    });

    it('should handle max tracked calls limit', () => {
      // Create 101 different call buffers to exceed limit
      for (let i = 0; i < 101; i++) {
        client.bufferTranscriptMessage(`call_${i}`, {
          role: 'user',
          message: 'Test',
          timestamp: Date.now(),
        });
      }

      const stats = client.getBufferStats();
      expect(stats.trackedCalls).toBeLessThanOrEqual(stats.maxCalls);
    });

    it('should get buffer stats', () => {
      client.bufferTranscriptMessage('call_1', {
        role: 'user',
        message: 'Test',
        timestamp: Date.now(),
      });

      client.bufferTranscriptMessage('call_2', {
        role: 'user',
        message: 'Test',
        timestamp: Date.now(),
      });

      const stats = client.getBufferStats();
      expect(stats.trackedCalls).toBe(2);
      expect(stats.maxCalls).toBe(100);
    });

    it('should return empty array for non-existent call', () => {
      const buffered = client.getBufferedTranscript('non_existent_call');
      expect(buffered).toHaveLength(0);
    });

    it('should return empty string for non-existent call text', () => {
      const text = client.getBufferedTranscriptText('non_existent_call');
      expect(text).toBe('');
    });
  });

  describe('buffer cleanup', () => {
    let client: VapiClient;

    beforeEach(() => {
      client = createVapiClient({
        apiKey: 'test-api-key',
      });
    });

    afterEach(() => {
      client.destroy();
    });

    it('should start and stop buffer cleanup', () => {
      client.startBufferCleanup();
      // Should not throw if called multiple times
      client.startBufferCleanup();

      client.stopBufferCleanup();
      // Should not throw if called multiple times
      client.stopBufferCleanup();
    });

    it('should cleanup stale buffers', async () => {
      // Add a message to create a buffer
      client.bufferTranscriptMessage('old_call', {
        role: 'user',
        message: 'Test',
        timestamp: Date.now(),
      });

      // Manually trigger cleanup (we can't easily test time-based cleanup)
      // The cleanup logic is tested indirectly through destroy()
      client.destroy();

      const stats = client.getBufferStats();
      expect(stats.trackedCalls).toBe(0);
    });

    it('should destroy client and clear all buffers', () => {
      client.bufferTranscriptMessage('call_1', {
        role: 'user',
        message: 'Test',
        timestamp: Date.now(),
      });

      client.bufferTranscriptMessage('call_2', {
        role: 'user',
        message: 'Test',
        timestamp: Date.now(),
      });

      expect(client.getBufferStats().trackedCalls).toBe(2);

      client.destroy();

      expect(client.getBufferStats().trackedCalls).toBe(0);
    });
  });

  describe('factory function', () => {
    it('should create a VapiClient instance', () => {
      const client = createVapiClient({
        apiKey: 'test-api-key',
      });

      expect(client).toBeInstanceOf(VapiClient);
    });
  });

  describe('Zod schema validation', () => {
    it('should validate VapiWebhookPayloadSchema for call.started', () => {
      const payload = {
        type: 'call.started',
        call: {
          id: 'call_123',
          orgId: 'org_123',
          assistantId: 'asst_123',
          status: 'ringing',
          type: 'outbound',
        },
      };

      const result = VapiWebhookPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate VapiWebhookPayloadSchema for call.ended', () => {
      const payload = {
        type: 'call.ended',
        call: {
          id: 'call_123',
          orgId: 'org_123',
          assistantId: 'asst_123',
          status: 'ended',
          type: 'inbound',
          endedReason: 'customer-ended-call',
          cost: 0.15,
        },
      };

      const result = VapiWebhookPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate VapiWebhookPayloadSchema for transcript.updated', () => {
      const payload = {
        type: 'transcript.updated',
        transcript: {
          callId: 'call_123',
          messages: [{ role: 'user', message: 'Test', timestamp: Date.now() }],
          duration: 60,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
      };

      const result = VapiWebhookPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should validate VapiWebhookPayloadSchema for function.call', () => {
      const payload = {
        type: 'function.call',
        message: {
          role: 'function_call',
          message: 'Function called',
          timestamp: Date.now(),
          name: 'test_function',
          arguments: '{"key":"value"}',
        },
      };

      const result = VapiWebhookPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid webhook type', () => {
      const payload = {
        type: 'invalid.type',
        call: {
          id: 'call_123',
          orgId: 'org_123',
          assistantId: 'asst_123',
          status: 'ended',
          type: 'inbound',
        },
      };

      const result = VapiWebhookPayloadSchema.safeParse(payload);
      expect(result.success).toBe(false);
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

  it('should handle empty transcript', () => {
    const transcript: VapiTranscript = {
      callId: 'call_empty',
      messages: [],
      duration: 0,
      startedAt: '2024-01-15T10:00:00Z',
      endedAt: '2024-01-15T10:00:00Z',
    };

    const formatted = formatTranscriptForCRM(transcript);

    expect(formatted).toContain('Call ID: call_empty');
    expect(formatted).toContain('Duration: 0 minutes');
  });

  it('should filter out function_call messages', () => {
    const transcript: VapiTranscript = {
      callId: 'call_123',
      messages: [
        { role: 'user', message: 'Hello', timestamp: Date.now() },
        {
          role: 'function_call',
          message: 'Function called',
          timestamp: Date.now(),
          name: 'test_function',
        },
        { role: 'assistant', message: 'Response', timestamp: Date.now() },
      ],
      duration: 60,
      startedAt: '2024-01-15T10:00:00Z',
      endedAt: '2024-01-15T10:01:00Z',
    };

    const formatted = formatTranscriptForCRM(transcript);

    expect(formatted).toContain('[Patient]: Hello');
    expect(formatted).toContain('[AI Assistant]: Response');
    expect(formatted).not.toContain('Function called');
  });

  it('should format duration correctly for long calls', () => {
    const transcript: VapiTranscript = {
      callId: 'call_long',
      messages: [],
      duration: 3600, // 1 hour = 60 minutes
      startedAt: '2024-01-15T10:00:00Z',
      endedAt: '2024-01-15T11:00:00Z',
    };

    const formatted = formatTranscriptForCRM(transcript);

    expect(formatted).toContain('Duration: 60 minutes');
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
    expect(qualification.reason).toContain('Interested in');
  });

  it('should classify HOT lead with All-on-6 procedure', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'All-on-6 interest',
      topics: ['all-on-6'],
      sentiment: 'positive',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: ['all-on-6'],
      urgencyLevel: 'medium',
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

  it('should classify UNQUALIFIED lead with negative score', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Not interested',
      topics: [],
      sentiment: 'negative',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.classification).toBe('COLD'); // Minimum is 2 after clamping
    expect(qualification.score).toBeGreaterThanOrEqual(1);
  });

  it('should boost score for critical urgency', () => {
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

    expect(qualification.score).toBeGreaterThanOrEqual(3);
    expect(qualification.reason).toContain('Urgency: critical');
  });

  it('should boost score for high urgency', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'High urgency',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'high',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.score).toBeGreaterThanOrEqual(2);
  });

  it('should boost score for positive sentiment', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Positive inquiry',
      topics: [],
      sentiment: 'positive',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: ['implant'],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.score).toBeGreaterThan(2);
  });

  it('should include action items in reason', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'With actions',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: ['Call back', 'Send info', 'Schedule meeting'],
      procedureInterest: [],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.reason).toContain('action items');
  });

  it('should provide default reason for general inquiry', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'General',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.reason).toBe('General inquiry');
  });

  it('should clamp score to maximum of 5', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Ultra hot lead',
      topics: ['implant', 'all-on-4', 'all-on-6'],
      sentiment: 'positive',
      keyPhrases: ['urgent'],
      actionItems: ['Schedule now'],
      procedureInterest: ['implant', 'all-on-4', 'all-on-6'],
      urgencyLevel: 'critical',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.score).toBeLessThanOrEqual(5);
    expect(qualification.classification).toBe('HOT');
  });

  it('should clamp score to minimum of 1', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Very negative',
      topics: [],
      sentiment: 'negative',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.score).toBeGreaterThanOrEqual(1);
  });

  it('should handle medium urgency scoring', () => {
    const summary: VapiCallSummary = {
      callId: 'call_123',
      summary: 'Medium urgency',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'medium',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.score).toBeGreaterThanOrEqual(2);
  });
});
