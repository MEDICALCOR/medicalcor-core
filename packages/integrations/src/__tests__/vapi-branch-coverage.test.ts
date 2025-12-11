/**
 * Vapi Integration Branch Coverage Tests
 *
 * Tests VapiClient for 100% branch coverage including:
 * - Call management (create, get, list, end)
 * - Transcript analysis
 * - Call summary generation
 * - Webhook payload parsing
 * - Transcript buffering with memory limits
 * - Lead qualification extraction
 *
 * Uses MSW for HTTP mocking via the global vitest.setup.ts configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../__mocks__/server.js';
import {
  VapiClient,
  createVapiClient,
  formatTranscriptForCRM,
  extractLeadQualification,
  type VapiClientConfig,
  type VapiTranscript,
  type VapiCallSummary,
  type VapiMessage,
} from '../vapi.js';

// =============================================================================
// VapiClient Tests
// =============================================================================

describe('VapiClient', () => {
  const validConfig: VapiClientConfig = {
    apiKey: 'test-vapi-api-key',
    assistantId: 'ast_test_assistant',
    phoneNumberId: 'pn_test_phone',
  };

  let client: VapiClient;

  beforeEach(() => {
    client = new VapiClient(validConfig);
  });

  afterEach(() => {
    client.destroy();
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      expect(client).toBeInstanceOf(VapiClient);
    });

    it('should create client with minimal config', () => {
      const minimalClient = new VapiClient({ apiKey: 'test-key' });
      expect(minimalClient).toBeInstanceOf(VapiClient);
      minimalClient.destroy();
    });

    it('should use custom baseUrl when provided', () => {
      const customClient = new VapiClient({
        apiKey: 'test-key',
        baseUrl: 'https://custom.vapi.ai',
      });
      expect(customClient).toBeInstanceOf(VapiClient);
      customClient.destroy();
    });

    it('should accept custom timeout', () => {
      const timeoutClient = new VapiClient({
        apiKey: 'test-key',
        timeoutMs: 60000,
      });
      expect(timeoutClient).toBeInstanceOf(VapiClient);
      timeoutClient.destroy();
    });

    it('should accept custom retry config', () => {
      const retryClient = new VapiClient({
        apiKey: 'test-key',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });
      expect(retryClient).toBeInstanceOf(VapiClient);
      retryClient.destroy();
    });
  });

  describe('createOutboundCall', () => {
    it('should create outbound call successfully', async () => {
      const result = await client.createOutboundCall({
        phoneNumber: '+40721000001',
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('status', 'queued');
      expect(result).toHaveProperty('type', 'outbound');
    });

    it('should create call with custom assistant ID', async () => {
      const result = await client.createOutboundCall({
        phoneNumber: '+40721000001',
        assistantId: 'ast_custom',
      });

      expect(result).toHaveProperty('id');
    });

    it('should create call with name and metadata', async () => {
      const result = await client.createOutboundCall({
        phoneNumber: '+40721000001',
        name: 'Test Patient',
        metadata: { leadId: 'lead_123' },
      });

      expect(result).toHaveProperty('id');
    });
  });

  describe('getCall', () => {
    it('should get call details successfully', async () => {
      const result = await client.getCall({ callId: 'call_test_123' });

      expect(result).toHaveProperty('id', 'call_test_123');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('orgId');
    });
  });

  describe('listCalls', () => {
    it('should list calls without filters', async () => {
      const result = await client.listCalls();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should list calls with assistant filter', async () => {
      const result = await client.listCalls({
        assistantId: 'ast_test_assistant',
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should list calls with limit', async () => {
      const result = await client.listCalls({
        limit: 5,
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

    it('should list calls with all filters', async () => {
      const result = await client.listCalls({
        assistantId: 'ast_test',
        limit: 10,
        createdAtGte: '2024-01-01T00:00:00Z',
        createdAtLte: '2024-12-31T23:59:59Z',
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getTranscript', () => {
    it('should get transcript successfully', async () => {
      const result = await client.getTranscript('call_test_123');

      expect(result).toHaveProperty('callId', 'call_test_123');
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('duration');
      expect(Array.isArray(result.messages)).toBe(true);
    });
  });

  describe('endCall', () => {
    it('should end call successfully', async () => {
      await expect(client.endCall('call_test_123')).resolves.not.toThrow();
    });
  });

  describe('analyzeTranscript', () => {
    const mockTranscript: VapiTranscript = {
      callId: 'call_test',
      messages: [
        {
          role: 'assistant',
          message: 'Buna ziua! Cu ce va putem ajuta astazi?',
          timestamp: Date.now() - 180000,
          duration: 3,
        },
        {
          role: 'user',
          message: 'Buna ziua, vreau informatii despre implanturi dentare. Cat costa un implant?',
          timestamp: Date.now() - 175000,
          duration: 5,
        },
        {
          role: 'assistant',
          message: 'Pretul unui implant incepe de la 600 euro. Doriti o consultatie?',
          timestamp: Date.now() - 168000,
          duration: 4,
        },
        {
          role: 'user',
          message: 'Da, as dori o programare. Cand pot veni?',
          timestamp: Date.now() - 160000,
          duration: 3,
        },
      ],
      duration: 180,
      startedAt: new Date(Date.now() - 180000).toISOString(),
      endedAt: new Date().toISOString(),
    };

    it('should analyze transcript and extract insights', () => {
      const analysis = client.analyzeTranscript(mockTranscript);

      expect(analysis).toHaveProperty('fullTranscript');
      expect(analysis).toHaveProperty('customerMessages');
      expect(analysis).toHaveProperty('assistantMessages');
      expect(analysis).toHaveProperty('wordCount');
      expect(analysis).toHaveProperty('durationSeconds', 180);
      expect(analysis).toHaveProperty('speakingRatio');
      expect(analysis).toHaveProperty('keywords');
      expect(analysis).toHaveProperty('procedureMentions');
      expect(analysis).toHaveProperty('questions');
    });

    it('should identify procedure mentions', () => {
      const analysis = client.analyzeTranscript(mockTranscript);

      expect(analysis.procedureMentions).toContain('implant');
    });

    it('should extract customer questions', () => {
      const analysis = client.analyzeTranscript(mockTranscript);

      expect(analysis.questions.length).toBeGreaterThan(0);
      expect(analysis.questions.some((q) => q.includes('?'))).toBe(true);
    });

    it('should calculate speaking ratio', () => {
      const analysis = client.analyzeTranscript(mockTranscript);

      expect(analysis.speakingRatio.customer).toBeGreaterThan(0);
      expect(analysis.speakingRatio.assistant).toBeGreaterThan(0);
      expect(analysis.speakingRatio.customer + analysis.speakingRatio.assistant).toBe(1);
    });

    it('should extract keywords', () => {
      const analysis = client.analyzeTranscript(mockTranscript);

      // Should find dental-related keywords
      expect(analysis.keywords.length).toBeGreaterThan(0);
    });

    it('should handle transcript with no user messages', () => {
      const assistantOnlyTranscript: VapiTranscript = {
        callId: 'call_assistant_only',
        messages: [
          {
            role: 'assistant',
            message: 'Hello, this is an automated message.',
            timestamp: Date.now(),
          },
        ],
        duration: 10,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(assistantOnlyTranscript);

      expect(analysis.customerMessages).toHaveLength(0);
      expect(analysis.assistantMessages).toHaveLength(1);
      expect(analysis.speakingRatio.customer).toBe(0);
    });

    it('should handle Romanian question patterns without ?', () => {
      const romanianTranscript: VapiTranscript = {
        callId: 'call_ro',
        messages: [
          {
            role: 'user',
            message: 'Cum pot face o programare',
            timestamp: Date.now(),
          },
          {
            role: 'user',
            message: 'Cand sunteti deschisi',
            timestamp: Date.now(),
          },
          {
            role: 'user',
            message: 'Cat costa procedura',
            timestamp: Date.now(),
          },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(romanianTranscript);

      expect(analysis.questions.length).toBe(3);
    });
  });

  describe('generateCallSummary', () => {
    const mockTranscript: VapiTranscript = {
      callId: 'call_summary_test',
      messages: [
        {
          role: 'user',
          message: 'Buna, am nevoie urgent de un implant. Ma doare foarte tare.',
          timestamp: Date.now() - 120000,
        },
        {
          role: 'assistant',
          message: 'Intelegem situatia. Va vom programa pentru o consultatie cat mai repede.',
          timestamp: Date.now() - 110000,
        },
        {
          role: 'user',
          message: 'Perfect, multumesc! Cand pot veni?',
          timestamp: Date.now() - 100000,
        },
        {
          role: 'assistant',
          message: 'Va pot programa maine la ora 10. Va convine?',
          timestamp: Date.now() - 90000,
        },
      ],
      duration: 120,
      startedAt: new Date(Date.now() - 120000).toISOString(),
      endedAt: new Date().toISOString(),
    };

    it('should generate call summary', () => {
      const analysis = client.analyzeTranscript(mockTranscript);
      const summary = client.generateCallSummary(mockTranscript, analysis);

      expect(summary).toHaveProperty('callId', 'call_summary_test');
      expect(summary).toHaveProperty('summary');
      expect(summary).toHaveProperty('topics');
      expect(summary).toHaveProperty('sentiment');
      expect(summary).toHaveProperty('keyPhrases');
      expect(summary).toHaveProperty('actionItems');
      expect(summary).toHaveProperty('procedureInterest');
      expect(summary).toHaveProperty('urgencyLevel');
    });

    it('should detect positive sentiment', () => {
      const positiveTranscript: VapiTranscript = {
        callId: 'call_positive',
        messages: [
          {
            role: 'user',
            message: 'Multumesc foarte mult! Excelent! Perfect!',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(positiveTranscript);
      const summary = client.generateCallSummary(positiveTranscript, analysis);

      expect(summary.sentiment).toBe('positive');
    });

    it('should detect negative sentiment', () => {
      const negativeTranscript: VapiTranscript = {
        callId: 'call_negative',
        messages: [
          {
            role: 'user',
            message: 'Nu sunt multumit. Am o problema mare. Este rau.',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(negativeTranscript);
      const summary = client.generateCallSummary(negativeTranscript, analysis);

      expect(summary.sentiment).toBe('negative');
    });

    it('should detect neutral sentiment', () => {
      const neutralTranscript: VapiTranscript = {
        callId: 'call_neutral',
        messages: [
          { role: 'user', message: 'Vreau informatii despre preturi.', timestamp: Date.now() },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(neutralTranscript);
      const summary = client.generateCallSummary(neutralTranscript, analysis);

      expect(summary.sentiment).toBe('neutral');
    });

    it('should detect critical urgency', () => {
      const urgentTranscript: VapiTranscript = {
        callId: 'call_urgent',
        messages: [
          {
            role: 'user',
            message: 'Este urgent! Ma doare foarte tare! Am nevoie de ajutor imediat!',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(urgentTranscript);
      const summary = client.generateCallSummary(urgentTranscript, analysis);

      expect(summary.urgencyLevel).toBe('critical');
    });

    it('should detect high urgency', () => {
      const highUrgencyTranscript: VapiTranscript = {
        callId: 'call_high',
        messages: [
          {
            role: 'user',
            message: 'Am o durere si as vrea sa vin cat mai repede.',
            timestamp: Date.now(),
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(highUrgencyTranscript);
      const summary = client.generateCallSummary(highUrgencyTranscript, analysis);

      expect(summary.urgencyLevel).toBe('high');
    });

    it('should detect medium urgency', () => {
      const mediumUrgencyTranscript: VapiTranscript = {
        callId: 'call_medium',
        messages: [
          { role: 'user', message: 'As vrea o programare pentru maine.', timestamp: Date.now() },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(mediumUrgencyTranscript);
      const summary = client.generateCallSummary(mediumUrgencyTranscript, analysis);

      expect(summary.urgencyLevel).toBe('medium');
    });

    it('should detect low urgency', () => {
      const lowUrgencyTranscript: VapiTranscript = {
        callId: 'call_low',
        messages: [
          { role: 'user', message: 'Vreau doar informatii generale.', timestamp: Date.now() },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(lowUrgencyTranscript);
      const summary = client.generateCallSummary(lowUrgencyTranscript, analysis);

      expect(summary.urgencyLevel).toBe('low');
    });

    it('should extract action items from assistant messages', () => {
      const actionTranscript: VapiTranscript = {
        callId: 'call_action',
        messages: [
          {
            role: 'assistant',
            message: 'Va vom contacta maine pentru confirmare.',
            timestamp: Date.now(),
          },
          {
            role: 'assistant',
            message: 'Veti primi un email cu detaliile.',
            timestamp: Date.now(),
          },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(actionTranscript);
      const summary = client.generateCallSummary(actionTranscript, analysis);

      expect(summary.actionItems.length).toBeGreaterThan(0);
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse call.started event', () => {
      const payload = {
        type: 'call.started',
        call: {
          id: 'call_123',
          orgId: 'org_123',
          assistantId: 'ast_123',
          status: 'in-progress',
          type: 'inbound',
        },
      };

      const result = client.parseWebhookPayload(payload);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('call.started');
      expect(result?.data).toHaveProperty('id', 'call_123');
    });

    it('should parse call.ended event', () => {
      const payload = {
        type: 'call.ended',
        call: {
          id: 'call_123',
          orgId: 'org_123',
          assistantId: 'ast_123',
          status: 'ended',
          type: 'inbound',
          endedReason: 'customer-ended-call',
        },
      };

      const result = client.parseWebhookPayload(payload);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('call.ended');
    });

    it('should parse transcript.updated event', () => {
      const payload = {
        type: 'transcript.updated',
        transcript: {
          callId: 'call_123',
          messages: [{ role: 'user', message: 'Hello', timestamp: Date.now() }],
          duration: 30,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
        },
      };

      const result = client.parseWebhookPayload(payload);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('transcript.updated');
    });

    it('should parse function.call event', () => {
      const payload = {
        type: 'function.call',
        message: {
          role: 'function_call',
          message: 'Booking appointment',
          timestamp: Date.now(),
          name: 'book_appointment',
          arguments: '{"date": "2024-01-15"}',
        },
      };

      const result = client.parseWebhookPayload(payload);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('function.call');
    });

    it('should return null for invalid payload', () => {
      const result = client.parseWebhookPayload({ invalid: 'payload' });
      expect(result).toBeNull();
    });

    it('should throw on invalid payload when throwOnError is true', () => {
      expect(() =>
        client.parseWebhookPayload({ invalid: 'payload' }, { throwOnError: true })
      ).toThrow();
    });
  });

  describe('transcript buffer', () => {
    it('should buffer transcript messages', () => {
      const message: VapiMessage = {
        role: 'user',
        message: 'Test message',
        timestamp: Date.now(),
      };

      client.bufferTranscriptMessage('call_buffer_test', message);

      const buffered = client.getBufferedTranscript('call_buffer_test');
      expect(buffered).toHaveLength(1);
      expect(buffered[0]?.message).toBe('Test message');
    });

    it('should return empty array for non-existent call', () => {
      const buffered = client.getBufferedTranscript('non_existent_call');
      expect(buffered).toHaveLength(0);
    });

    it('should clear transcript buffer', () => {
      const message: VapiMessage = {
        role: 'user',
        message: 'Test',
        timestamp: Date.now(),
      };

      client.bufferTranscriptMessage('call_clear_test', message);
      client.clearTranscriptBuffer('call_clear_test');

      const buffered = client.getBufferedTranscript('call_clear_test');
      expect(buffered).toHaveLength(0);
    });

    it('should get buffer stats', () => {
      client.bufferTranscriptMessage('call_stats_1', {
        role: 'user',
        message: 'Test 1',
        timestamp: Date.now(),
      });

      const stats = client.getBufferStats();
      expect(stats).toHaveProperty('trackedCalls');
      expect(stats).toHaveProperty('maxCalls', 100);
      expect(stats.trackedCalls).toBeGreaterThan(0);
    });

    it('should get buffered transcript as text', () => {
      client.bufferTranscriptMessage('call_text_test', {
        role: 'user',
        message: 'Hello from patient',
        timestamp: Date.now(),
      });
      client.bufferTranscriptMessage('call_text_test', {
        role: 'assistant',
        message: 'Hello from assistant',
        timestamp: Date.now(),
      });

      const text = client.getBufferedTranscriptText('call_text_test');

      expect(text).toContain('Patient: Hello from patient');
      expect(text).toContain('Assistant: Hello from assistant');
    });

    it('should filter out system and function_call messages in text', () => {
      client.bufferTranscriptMessage('call_filter_test', {
        role: 'system',
        message: 'System message',
        timestamp: Date.now(),
      });
      client.bufferTranscriptMessage('call_filter_test', {
        role: 'user',
        message: 'User message',
        timestamp: Date.now(),
      });

      const text = client.getBufferedTranscriptText('call_filter_test');

      expect(text).not.toContain('System message');
      expect(text).toContain('Patient: User message');
    });

    it('should evict oldest call when max tracked calls reached', () => {
      // Buffer 101 calls to trigger eviction
      for (let i = 0; i < 101; i++) {
        client.bufferTranscriptMessage(`call_evict_${i}`, {
          role: 'user',
          message: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const stats = client.getBufferStats();
      expect(stats.trackedCalls).toBeLessThanOrEqual(100);
    });

    it('should trim messages when max per call reached', () => {
      // Buffer 1001 messages to trigger trimming
      for (let i = 0; i < 1001; i++) {
        client.bufferTranscriptMessage('call_trim_test', {
          role: 'user',
          message: `Message ${i}`,
          timestamp: Date.now(),
        });
      }

      const buffered = client.getBufferedTranscript('call_trim_test');
      expect(buffered.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('buffer cleanup', () => {
    it('should start and stop buffer cleanup', () => {
      client.startBufferCleanup();
      client.startBufferCleanup(); // Should not start twice
      client.stopBufferCleanup();
      client.stopBufferCleanup(); // Should handle being called twice
    });

    it('should destroy client and cleanup resources', () => {
      client.bufferTranscriptMessage('call_destroy_test', {
        role: 'user',
        message: 'Test',
        timestamp: Date.now(),
      });

      client.destroy();

      const buffered = client.getBufferedTranscript('call_destroy_test');
      expect(buffered).toHaveLength(0);
    });

    it('should clean up stale buffers when cleanup interval fires', () => {
      vi.useFakeTimers();

      const cleanupClient = new VapiClient({ apiKey: 'test-key' });

      // Buffer a message
      cleanupClient.bufferTranscriptMessage('call_stale_test', {
        role: 'user',
        message: 'Old message',
        timestamp: Date.now(),
      });

      // Verify message is buffered
      expect(cleanupClient.getBufferedTranscript('call_stale_test')).toHaveLength(1);

      // Start cleanup and advance time past TTL (2 hours) + cleanup interval (10 min)
      cleanupClient.startBufferCleanup();

      // Advance past TTL (2 hours = 7200000ms)
      vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);

      // Trigger cleanup interval (10 minutes)
      vi.advanceTimersByTime(10 * 60 * 1000);

      // Buffer should be cleaned up
      expect(cleanupClient.getBufferedTranscript('call_stale_test')).toHaveLength(0);

      cleanupClient.destroy();
      vi.useRealTimers();
    });

    it('should not clean up buffers within TTL', () => {
      vi.useFakeTimers();

      const freshClient = new VapiClient({ apiKey: 'test-key' });

      // Buffer a message
      freshClient.bufferTranscriptMessage('call_fresh_test', {
        role: 'user',
        message: 'Fresh message',
        timestamp: Date.now(),
      });

      freshClient.startBufferCleanup();

      // Advance only 1 hour (less than 2 hour TTL)
      vi.advanceTimersByTime(1 * 60 * 60 * 1000);

      // Trigger cleanup interval
      vi.advanceTimersByTime(10 * 60 * 1000);

      // Buffer should still exist
      expect(freshClient.getBufferedTranscript('call_fresh_test')).toHaveLength(1);

      freshClient.destroy();
      vi.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle API errors', async () => {
      server.use(
        http.get('https://api.vapi.ai/call/:callId', () => {
          return new HttpResponse('Not Found', { status: 404 });
        })
      );

      await expect(client.getCall({ callId: 'invalid_call' })).rejects.toThrow(
        'Request failed with status 404'
      );
    });

    it('should retry on 502 errors', async () => {
      let callCount = 0;
      server.use(
        http.get('https://api.vapi.ai/call/:callId', () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 502 });
          }
          return HttpResponse.json({
            id: 'call_retry',
            orgId: 'org_123',
            assistantId: 'ast_123',
            status: 'ended',
            type: 'inbound',
          });
        })
      );

      const result = await client.getCall({ callId: 'call_retry' });
      expect(result.id).toBe('call_retry');
      expect(callCount).toBeGreaterThan(1);
    });

    it('should retry on 503 errors', async () => {
      let callCount = 0;
      server.use(
        http.get('https://api.vapi.ai/call', () => {
          callCount++;
          if (callCount === 1) {
            return new HttpResponse(null, { status: 503 });
          }
          return HttpResponse.json([]);
        })
      );

      const result = await client.listCalls();
      expect(Array.isArray(result)).toBe(true);
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe('factory function', () => {
    it('should create client via factory function', () => {
      const factoryClient = createVapiClient(validConfig);
      expect(factoryClient).toBeInstanceOf(VapiClient);
      factoryClient.destroy();
    });
  });
});

// =============================================================================
// Utility Functions Tests
// =============================================================================

describe('formatTranscriptForCRM', () => {
  it('should format transcript for CRM display', () => {
    const transcript: VapiTranscript = {
      callId: 'call_crm_test',
      messages: [
        { role: 'user', message: 'Hello, I need an appointment', timestamp: Date.now() },
        { role: 'assistant', message: 'Sure, when would you like to come?', timestamp: Date.now() },
      ],
      duration: 120,
      startedAt: '2024-01-15T10:00:00Z',
      endedAt: '2024-01-15T10:02:00Z',
    };

    const formatted = formatTranscriptForCRM(transcript);

    expect(formatted).toContain('Call ID: call_crm_test');
    expect(formatted).toContain('Duration: 2 minutes');
    expect(formatted).toContain('--- Transcript ---');
    expect(formatted).toContain('[Patient]: Hello, I need an appointment');
    expect(formatted).toContain('[AI Assistant]: Sure, when would you like to come?');
  });

  it('should filter out system messages', () => {
    const transcript: VapiTranscript = {
      callId: 'call_filter',
      messages: [
        { role: 'system', message: 'System init', timestamp: Date.now() },
        { role: 'user', message: 'Hello', timestamp: Date.now() },
      ],
      duration: 30,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    const formatted = formatTranscriptForCRM(transcript);

    expect(formatted).not.toContain('System init');
    expect(formatted).toContain('[Patient]: Hello');
  });
});

describe('extractLeadQualification', () => {
  it('should extract HOT lead qualification', () => {
    const summary: VapiCallSummary = {
      callId: 'call_hot',
      summary: 'Patient interested in All-on-4 implants',
      topics: ['all-on-4', 'implant'],
      sentiment: 'positive',
      keyPhrases: ['implant', 'price', 'appointment'],
      actionItems: ['Book consultation', 'Send pricing'],
      procedureInterest: ['all-on-4', 'implant'],
      urgencyLevel: 'critical',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.score).toBeGreaterThanOrEqual(4);
    expect(qualification.classification).toBe('HOT');
    expect(qualification.reason).toContain('all-on-4');
  });

  it('should extract WARM lead qualification', () => {
    const summary: VapiCallSummary = {
      callId: 'call_warm',
      summary: 'General dental inquiry',
      topics: ['cleaning', 'checkup'],
      sentiment: 'neutral',
      keyPhrases: ['cleaning'],
      actionItems: [],
      procedureInterest: ['cleaning'],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.classification).toBe('WARM');
  });

  it('should extract COLD lead qualification', () => {
    const summary: VapiCallSummary = {
      callId: 'call_cold',
      summary: 'Information request',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: [],
      urgencyLevel: 'low',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.classification).toBe('COLD');
  });

  it('should factor in urgency level', () => {
    const criticalSummary: VapiCallSummary = {
      callId: 'call_critical',
      summary: 'Urgent dental issue',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: ['Emergency appointment'],
      procedureInterest: [],
      urgencyLevel: 'critical',
    };

    const lowSummary: VapiCallSummary = {
      ...criticalSummary,
      callId: 'call_low',
      urgencyLevel: 'low',
      actionItems: [],
    };

    const criticalQual = extractLeadQualification(criticalSummary);
    const lowQual = extractLeadQualification(lowSummary);

    expect(criticalQual.score).toBeGreaterThan(lowQual.score);
  });

  it('should factor in sentiment', () => {
    const positiveSummary: VapiCallSummary = {
      callId: 'call_pos',
      summary: 'Happy patient',
      topics: ['cleaning'],
      sentiment: 'positive',
      keyPhrases: [],
      actionItems: [],
      procedureInterest: ['cleaning'],
      urgencyLevel: 'low',
    };

    const negativeSummary: VapiCallSummary = {
      ...positiveSummary,
      callId: 'call_neg',
      sentiment: 'negative',
    };

    const positiveQual = extractLeadQualification(positiveSummary);
    const negativeQual = extractLeadQualification(negativeSummary);

    expect(positiveQual.score).toBeGreaterThan(negativeQual.score);
  });

  it('should include action items count in reason', () => {
    const summary: VapiCallSummary = {
      callId: 'call_actions',
      summary: 'Patient with action items',
      topics: [],
      sentiment: 'neutral',
      keyPhrases: [],
      actionItems: ['Action 1', 'Action 2'],
      procedureInterest: [],
      urgencyLevel: 'high',
    };

    const qualification = extractLeadQualification(summary);

    expect(qualification.reason).toContain('2 action items');
  });

  it('should return general inquiry for no specific reason', () => {
    const summary: VapiCallSummary = {
      callId: 'call_general',
      summary: 'General call',
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

  it('should clamp score to valid range', () => {
    const highSummary: VapiCallSummary = {
      callId: 'call_high_score',
      summary: 'Everything positive',
      topics: ['all-on-4'],
      sentiment: 'positive',
      keyPhrases: ['implant', 'all-on-4'],
      actionItems: ['Book', 'Call', 'Email'],
      procedureInterest: ['all-on-4', 'implant'],
      urgencyLevel: 'critical',
    };

    const qualification = extractLeadQualification(highSummary);

    expect(qualification.score).toBeLessThanOrEqual(5);
    expect(qualification.score).toBeGreaterThanOrEqual(1);
  });
});
