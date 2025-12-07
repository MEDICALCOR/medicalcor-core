import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../__mocks__/setup.js';
import { createVapiClient, VapiClient, type VapiTranscript, type VapiMessage } from '../vapi.js';
import { ExternalServiceError } from '@medicalcor/core';

/**
 * Edge Case Tests for Vapi Voice AI Integration
 *
 * Tests cover:
 * 1. API failure scenarios (500, 502, 503, rate limiting)
 * 2. Timeout scenarios (request timeouts, slow responses)
 * 3. Partial transcription scenarios (incomplete data, malformed responses)
 * 4. Network failure scenarios
 */

// =============================================================================
// API Failure Scenarios
// =============================================================================

describe('Vapi API Failure Scenarios', () => {
  let client: VapiClient;

  beforeEach(() => {
    client = createVapiClient({
      apiKey: 'test-api-key',
      assistantId: 'test-assistant',
      phoneNumberId: 'test-phone-number',
      timeoutMs: 5000, // Short timeout for tests
      retryConfig: {
        maxRetries: 2,
        baseDelayMs: 100, // Fast retries for tests
      },
    });
  });

  afterEach(() => {
    client.destroy();
    server.resetHandlers();
  });

  describe('HTTP 500 Internal Server Error', () => {
    it('should throw ExternalServiceError on 500 response', async () => {
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      await expect(client.getTranscript('call_500_error')).rejects.toThrow(ExternalServiceError);
    });

    it('should include service name in error message', async () => {
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      try {
        await client.getTranscript('call_500_error');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        if (error instanceof ExternalServiceError) {
          expect(error.message).toContain('Vapi');
          expect(error.message).toContain('500');
        }
      }
    });
  });

  describe('HTTP 502 Bad Gateway', () => {
    it('should retry on 502 and eventually throw', async () => {
      let callCount = 0;
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          callCount++;
          return new HttpResponse(null, { status: 502 });
        })
      );

      await expect(client.getTranscript('call_502_error')).rejects.toThrow();
      // Should have retried (initial + retries)
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe('HTTP 503 Service Unavailable', () => {
    it('should retry on 503 and eventually throw', async () => {
      let callCount = 0;
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          callCount++;
          return new HttpResponse(null, { status: 503 });
        })
      );

      await expect(client.getTranscript('call_503_error')).rejects.toThrow();
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe('HTTP 429 Rate Limiting', () => {
    it('should throw on 429 when error message does not contain rate_limit keyword', async () => {
      // The retry logic looks for 'rate_limit' in the error message
      // A plain 429 without that keyword won't trigger retries
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          return new HttpResponse(null, { status: 429 });
        })
      );

      await expect(client.getTranscript('call_rate_limited')).rejects.toThrow(ExternalServiceError);
    });

    it('should throw after max retries on persistent rate limit', async () => {
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          return new HttpResponse(JSON.stringify({ error: 'rate_limit' }), { status: 429 });
        })
      );

      await expect(client.getTranscript('call_persistent_rate_limit')).rejects.toThrow();
    });
  });

  describe('HTTP 401 Unauthorized', () => {
    it('should throw on unauthorized without retry', async () => {
      let callCount = 0;
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          callCount++;
          return new HttpResponse(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
        })
      );

      await expect(client.getTranscript('call_unauthorized')).rejects.toThrow();
      // Should not retry 401 errors
      expect(callCount).toBe(1);
    });
  });

  describe('HTTP 404 Not Found', () => {
    it('should throw on call not found', async () => {
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          return new HttpResponse(JSON.stringify({ error: 'Call not found' }), { status: 404 });
        })
      );

      await expect(client.getTranscript('call_not_found')).rejects.toThrow(ExternalServiceError);
    });
  });

  describe('Malformed JSON Response', () => {
    it('should handle malformed JSON in response', async () => {
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          return new HttpResponse('not valid json {{{', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );

      await expect(client.getTranscript('call_malformed')).rejects.toThrow();
    });
  });

  describe('Empty Response Body', () => {
    it('should handle empty response body with non-JSON content type', async () => {
      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          return new HttpResponse(null, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        })
      );

      const result = await client.getTranscript('call_empty');
      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// Timeout Scenarios
// =============================================================================

describe('Vapi Timeout Scenarios', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  describe('Request Timeout', () => {
    it('should throw timeout error when request takes too long', async () => {
      const client = createVapiClient({
        apiKey: 'test-api-key',
        timeoutMs: 100, // Very short timeout
        retryConfig: {
          maxRetries: 0, // No retries for this test
          baseDelayMs: 100,
        },
      });

      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', async () => {
          await delay(500); // Longer than timeout
          return HttpResponse.json({
            callId: 'call_timeout',
            messages: [],
            duration: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
          });
        })
      );

      try {
        await client.getTranscript('call_timeout');
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        if (error instanceof ExternalServiceError) {
          expect(error.message).toContain('timeout');
        }
      }

      client.destroy();
    });

    it('should retry on timeout if configured', async () => {
      let callCount = 0;
      const client = createVapiClient({
        apiKey: 'test-api-key',
        timeoutMs: 100,
        retryConfig: {
          maxRetries: 2,
          baseDelayMs: 50,
        },
      });

      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', async () => {
          callCount++;
          if (callCount <= 2) {
            await delay(200); // Trigger timeout
            return HttpResponse.json({});
          }
          // Third attempt succeeds quickly
          return HttpResponse.json({
            callId: 'call_retry_timeout',
            messages: [],
            duration: 0,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
          });
        })
      );

      const result = await client.getTranscript('call_retry_timeout');
      expect(result.callId).toBe('call_retry_timeout');
      expect(callCount).toBe(3);

      client.destroy();
    });
  });

  describe('Slow Response Handling', () => {
    it('should complete successfully if response arrives before timeout', async () => {
      const client = createVapiClient({
        apiKey: 'test-api-key',
        timeoutMs: 500,
      });

      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', async () => {
          await delay(100); // Under timeout threshold
          return HttpResponse.json({
            callId: 'call_slow',
            messages: [{ role: 'user', message: 'Hello', timestamp: Date.now() }],
            duration: 60,
            startedAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
          });
        })
      );

      const result = await client.getTranscript('call_slow');
      expect(result.callId).toBe('call_slow');
      expect(result.messages).toHaveLength(1);

      client.destroy();
    });
  });

  describe('Connection Timeout', () => {
    it('should handle network errors gracefully', async () => {
      const client = createVapiClient({
        apiKey: 'test-api-key',
        timeoutMs: 1000,
        retryConfig: {
          maxRetries: 1,
          baseDelayMs: 100,
        },
      });

      server.use(
        http.get('https://api.vapi.ai/call/:callId/transcript', () => {
          return HttpResponse.error();
        })
      );

      await expect(client.getTranscript('call_network_error')).rejects.toThrow();

      client.destroy();
    });
  });
});

// =============================================================================
// Partial Transcription Scenarios
// =============================================================================

describe('Partial Transcription Scenarios', () => {
  let client: VapiClient;

  beforeEach(() => {
    client = createVapiClient({
      apiKey: 'test-api-key',
      assistantId: 'test-assistant',
    });
  });

  afterEach(() => {
    client.destroy();
  });

  describe('Empty Transcript', () => {
    it('should handle transcript with no messages', () => {
      const transcript: VapiTranscript = {
        callId: 'call_empty_transcript',
        messages: [],
        duration: 5,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.customerMessages).toHaveLength(0);
      expect(analysis.assistantMessages).toHaveLength(0);
      // Empty fullTranscript split by whitespace gives [''] which has length 1
      expect(analysis.wordCount).toBeLessThanOrEqual(1);
      expect(analysis.procedureMentions).toHaveLength(0);
      expect(analysis.speakingRatio.customer).toBe(0.5);
      expect(analysis.speakingRatio.assistant).toBe(0.5);
    });

    it('should generate summary for empty transcript', () => {
      const transcript: VapiTranscript = {
        callId: 'call_empty_summary',
        messages: [],
        duration: 0,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      expect(summary.callId).toBe('call_empty_summary');
      expect(summary.urgencyLevel).toBe('low');
      expect(summary.sentiment).toBe('neutral');
      expect(summary.procedureInterest).toHaveLength(0);
    });
  });

  describe('System Messages Only', () => {
    it('should handle transcript with only system messages', () => {
      const transcript: VapiTranscript = {
        callId: 'call_system_only',
        messages: [
          { role: 'system', message: 'Call connected', timestamp: Date.now() - 60000 },
          { role: 'system', message: 'Voice assistant activated', timestamp: Date.now() - 55000 },
          { role: 'system', message: 'Call ended by timeout', timestamp: Date.now() },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.customerMessages).toHaveLength(0);
      expect(analysis.assistantMessages).toHaveLength(0);
      expect(analysis.fullTranscript).toContain('SYSTEM');
      expect(analysis.speakingRatio.customer).toBe(0.5);
    });
  });

  describe('Incomplete Conversation', () => {
    it('should handle transcript with only user messages (no response)', () => {
      const transcript: VapiTranscript = {
        callId: 'call_no_response',
        messages: [
          { role: 'user', message: 'Hello?', timestamp: Date.now() - 30000 },
          { role: 'user', message: 'Is anyone there?', timestamp: Date.now() - 20000 },
          { role: 'user', message: 'Hello???', timestamp: Date.now() - 10000 },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.customerMessages).toHaveLength(3);
      expect(analysis.assistantMessages).toHaveLength(0);
      expect(analysis.speakingRatio.customer).toBe(1);
      expect(analysis.speakingRatio.assistant).toBe(0);
    });

    it('should handle transcript with only assistant messages (voicemail)', () => {
      const transcript: VapiTranscript = {
        callId: 'call_voicemail',
        messages: [
          {
            role: 'assistant',
            message: 'Buna ziua! Cu ce va putem ajuta?',
            timestamp: Date.now() - 10000,
          },
          { role: 'assistant', message: 'Alo? Sunteti acolo?', timestamp: Date.now() - 5000 },
        ],
        duration: 10,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.customerMessages).toHaveLength(0);
      expect(analysis.assistantMessages).toHaveLength(2);
      expect(analysis.speakingRatio.customer).toBe(0);
      expect(analysis.speakingRatio.assistant).toBe(1);
    });
  });

  describe('Truncated/Incomplete Data', () => {
    it('should handle transcript with missing timestamps', () => {
      const transcript: VapiTranscript = {
        callId: 'call_no_timestamps',
        messages: [
          { role: 'user', message: 'Vreau un implant', timestamp: 0 },
          { role: 'assistant', message: 'Sigur!', timestamp: 0 },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.customerMessages).toHaveLength(1);
      expect(analysis.procedureMentions).toContain('implant');
    });

    it('should handle transcript with very long messages', () => {
      const longMessage = 'Buna ziua, am nevoie de implanturi dentare. '.repeat(500);

      const transcript: VapiTranscript = {
        callId: 'call_long_message',
        messages: [{ role: 'user', message: longMessage, timestamp: Date.now() }],
        duration: 300,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.wordCount).toBeGreaterThan(1000);
      expect(analysis.procedureMentions).toContain('implant');
    });

    it('should handle transcript with special characters', () => {
      const transcript: VapiTranscript = {
        callId: 'call_special_chars',
        messages: [
          { role: 'user', message: 'Vreau să știu despre implanturi! 🦷', timestamp: Date.now() },
          {
            role: 'user',
            message: 'Cât costă? €€€ <script>alert(1)</script>',
            timestamp: Date.now(),
          },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.customerMessages).toHaveLength(2);
      expect(analysis.keywords).toContain('cost');
    });

    it('should handle transcript with empty message content', () => {
      const transcript: VapiTranscript = {
        callId: 'call_empty_messages',
        messages: [
          { role: 'user', message: '', timestamp: Date.now() - 20000 },
          { role: 'assistant', message: 'Buna ziua!', timestamp: Date.now() - 15000 },
          { role: 'user', message: '', timestamp: Date.now() - 10000 },
        ],
        duration: 20,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      // Empty messages should still be counted
      expect(analysis.customerMessages).toHaveLength(2);
      expect(analysis.assistantMessages).toHaveLength(1);
    });
  });

  describe('Function Call Messages', () => {
    it('should handle transcript with function call messages', () => {
      const transcript: VapiTranscript = {
        callId: 'call_function_calls',
        messages: [
          {
            role: 'user',
            message: 'Vreau o programare pentru maine',
            timestamp: Date.now() - 30000,
          },
          {
            role: 'function_call',
            message: 'Scheduling appointment',
            timestamp: Date.now() - 25000,
            name: 'schedule_appointment',
            arguments: '{"date":"2024-01-16"}',
          },
          {
            role: 'assistant',
            message: 'V-am programat pentru maine la ora 10.',
            timestamp: Date.now() - 20000,
          },
        ],
        duration: 30,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      // Function calls should not be counted as customer/assistant messages
      expect(analysis.customerMessages).toHaveLength(1);
      expect(analysis.assistantMessages).toHaveLength(1);
      expect(analysis.keywords).toContain('programare');
    });
  });

  describe('Mixed Content Scenarios', () => {
    it('should handle transcript mixing urgent and non-urgent content', () => {
      const transcript: VapiTranscript = {
        callId: 'call_mixed_urgency',
        messages: [
          {
            role: 'user',
            message: 'Buna ziua, vreau informatii generale',
            timestamp: Date.now() - 60000,
          },
          {
            role: 'assistant',
            message: 'Sigur! Cu ce va putem ajuta?',
            timestamp: Date.now() - 55000,
          },
          {
            role: 'user',
            message: 'Ah, si am durere foarte mare! Este urgent!',
            timestamp: Date.now() - 50000,
          },
          {
            role: 'user',
            message: 'Trebuie sa vin cat mai repede!',
            timestamp: Date.now() - 45000,
          },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);
      const summary = client.generateCallSummary(transcript, analysis);

      // Should detect critical urgency due to multiple urgency keywords
      expect(['high', 'critical']).toContain(summary.urgencyLevel);
    });

    it('should handle transcript with pricing and procedure questions', () => {
      const transcript: VapiTranscript = {
        callId: 'call_pricing_inquiry',
        messages: [
          { role: 'user', message: 'Cat costa un implant dentar?', timestamp: Date.now() - 60000 },
          { role: 'user', message: 'Aveti rate sau finantare?', timestamp: Date.now() - 50000 },
          { role: 'user', message: 'Ce garantie oferiti?', timestamp: Date.now() - 40000 },
        ],
        duration: 60,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      };

      const analysis = client.analyzeTranscript(transcript);

      expect(analysis.keywords).toContain('cost');
      expect(analysis.keywords).toContain('rate');
      expect(analysis.keywords).toContain('finantare');
      expect(analysis.keywords).toContain('garantie');
      expect(analysis.questions.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// =============================================================================
// API Method Edge Cases
// =============================================================================

describe('Vapi API Method Edge Cases', () => {
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
    server.resetHandlers();
  });

  describe('createOutboundCall', () => {
    it('should handle successful outbound call creation', async () => {
      server.use(
        http.post('https://api.vapi.ai/call', () => {
          return HttpResponse.json(
            {
              id: 'call_test_create',
              orgId: 'org_123',
              assistantId: 'test-assistant',
              status: 'queued',
              type: 'outbound',
            },
            { status: 201 }
          );
        })
      );

      const result = await client.createOutboundCall({
        phoneNumber: '+40721000001',
      });

      expect(result.id).toBe('call_test_create');
      expect(result.status).toBe('queued');
    });

    it('should handle API error during call creation', async () => {
      server.use(
        http.post('https://api.vapi.ai/call', () => {
          return new HttpResponse(JSON.stringify({ error: 'Invalid phone number' }), {
            status: 400,
          });
        })
      );

      await expect(client.createOutboundCall({ phoneNumber: 'invalid' })).rejects.toThrow(
        ExternalServiceError
      );
    });
  });

  describe('listCalls', () => {
    it('should handle empty call list', async () => {
      server.use(
        http.get('https://api.vapi.ai/call', () => {
          return HttpResponse.json([]);
        })
      );

      const result = await client.listCalls();

      expect(result).toEqual([]);
    });

    it('should handle filter parameters', async () => {
      let capturedUrl: string | null = null;
      server.use(
        http.get('https://api.vapi.ai/call', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json([]);
        })
      );

      await client.listCalls({
        assistantId: 'asst_123',
        limit: 10,
        createdAtGte: '2024-01-01',
        createdAtLte: '2024-01-31',
      });

      expect(capturedUrl).toContain('assistantId=asst_123');
      expect(capturedUrl).toContain('limit=10');
      expect(capturedUrl).toContain('createdAtGte=2024-01-01');
      expect(capturedUrl).toContain('createdAtLte=2024-01-31');
    });
  });

  describe('endCall', () => {
    it('should handle successful call termination', async () => {
      server.use(
        http.delete('https://api.vapi.ai/call/:callId', () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      await expect(client.endCall('call_to_end')).resolves.toBeUndefined();
    });

    it('should handle call already ended error', async () => {
      server.use(
        http.delete('https://api.vapi.ai/call/:callId', () => {
          return new HttpResponse(JSON.stringify({ error: 'Call already ended' }), { status: 409 });
        })
      );

      await expect(client.endCall('call_already_ended')).rejects.toThrow(ExternalServiceError);
    });
  });
});

// =============================================================================
// Webhook Parsing Edge Cases
// =============================================================================

describe('Webhook Parsing Edge Cases', () => {
  let client: VapiClient;

  beforeEach(() => {
    client = createVapiClient({
      apiKey: 'test-api-key',
    });
  });

  afterEach(() => {
    client.destroy();
  });

  it('should handle payload with unknown fields (forward compatibility)', () => {
    const payload = {
      type: 'call.ended',
      call: {
        id: 'call_123',
        orgId: 'org_123',
        assistantId: 'asst_123',
        status: 'ended',
        type: 'inbound',
        unknownField: 'should be ignored',
        anotherNewField: { nested: true },
      },
    };

    const result = client.parseWebhookPayload(payload);
    expect(result?.type).toBe('call.ended');
  });

  it('should handle payload with all ended reasons', () => {
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

    for (const reason of endedReasons) {
      const payload = {
        type: 'call.ended',
        call: {
          id: 'call_123',
          orgId: 'org_123',
          assistantId: 'asst_123',
          status: 'ended',
          type: 'inbound',
          endedReason: reason,
        },
      };

      const result = client.parseWebhookPayload(payload);
      expect(result?.type).toBe('call.ended');
      expect((result?.data as { endedReason: string }).endedReason).toBe(reason);
    }
  });

  it('should return null for completely invalid payload', () => {
    expect(client.parseWebhookPayload(null)).toBeNull();
    expect(client.parseWebhookPayload(undefined)).toBeNull();
    expect(client.parseWebhookPayload(123)).toBeNull();
    expect(client.parseWebhookPayload('string')).toBeNull();
    expect(client.parseWebhookPayload([])).toBeNull();
  });

  it('should return null for partial payload missing required fields', () => {
    const payloads = [
      { type: 'call.ended' }, // Missing call
      { type: 'call.ended', call: {} }, // Missing required call fields
      { type: 'call.ended', call: { id: 'call_123' } }, // Missing orgId, assistantId, etc.
    ];

    for (const payload of payloads) {
      expect(client.parseWebhookPayload(payload)).toBeNull();
    }
  });

  it('should throw when throwOnError is true for invalid payload', () => {
    expect(() => {
      client.parseWebhookPayload({ type: 'invalid' }, { throwOnError: true });
    }).toThrow();
  });
});

// =============================================================================
// Buffer Edge Cases
// =============================================================================

describe('Transcript Buffer Edge Cases', () => {
  let client: VapiClient;

  beforeEach(() => {
    client = createVapiClient({
      apiKey: 'test-api-key',
    });
  });

  afterEach(() => {
    client.destroy();
  });

  it('should handle rapid message buffering', () => {
    const callId = 'call_rapid';
    const messageCount = 100;

    for (let i = 0; i < messageCount; i++) {
      client.bufferTranscriptMessage(callId, {
        role: i % 2 === 0 ? 'user' : 'assistant',
        message: `Message ${i}`,
        timestamp: Date.now() + i,
      });
    }

    const buffered = client.getBufferedTranscript(callId);
    expect(buffered).toHaveLength(messageCount);
  });

  it('should handle concurrent calls at limit', () => {
    // Add messages to max number of calls
    for (let i = 0; i < 100; i++) {
      client.bufferTranscriptMessage(`call_${i}`, {
        role: 'user',
        message: `Message for call ${i}`,
        timestamp: Date.now(),
      });
    }

    expect(client.getBufferStats().trackedCalls).toBe(100);

    // Adding a new call should evict the oldest
    client.bufferTranscriptMessage('call_new', {
      role: 'user',
      message: 'New call message',
      timestamp: Date.now(),
    });

    expect(client.getBufferStats().trackedCalls).toBe(100);
    expect(client.getBufferedTranscript('call_0')).toHaveLength(0);
    expect(client.getBufferedTranscript('call_new')).toHaveLength(1);
  });

  it('should handle message with all optional fields', () => {
    const callId = 'call_full_message';
    const message: VapiMessage = {
      role: 'function_call',
      message: 'Calling function',
      timestamp: Date.now(),
      duration: 5,
      name: 'schedule_appointment',
      arguments: '{"date":"2024-01-15","time":"10:00"}',
    };

    client.bufferTranscriptMessage(callId, message);

    const buffered = client.getBufferedTranscript(callId);
    expect(buffered).toHaveLength(1);
    expect(buffered[0]).toEqual(message);
  });

  it('should return empty transcript text for non-existent call', () => {
    const text = client.getBufferedTranscriptText('non_existent_call');
    expect(text).toBe('');
  });

  it('should filter out system messages from transcript text', () => {
    const callId = 'call_with_system';

    client.bufferTranscriptMessage(callId, {
      role: 'system',
      message: 'Call connected',
      timestamp: Date.now(),
    });
    client.bufferTranscriptMessage(callId, {
      role: 'user',
      message: 'Hello',
      timestamp: Date.now(),
    });
    client.bufferTranscriptMessage(callId, {
      role: 'system',
      message: 'Processing',
      timestamp: Date.now(),
    });

    const text = client.getBufferedTranscriptText(callId);

    expect(text).toContain('Patient: Hello');
    expect(text).not.toContain('system');
    expect(text).not.toContain('connected');
  });
});
