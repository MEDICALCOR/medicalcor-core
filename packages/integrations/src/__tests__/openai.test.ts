import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a hoisted mock function
const mockCreate = vi.hoisted(() => vi.fn());

// Mock OpenAI with hoisted mock
vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }
  return { default: MockOpenAI };
});

import { OpenAIClient, createOpenAIClient, type OpenAIClientConfig } from '../openai.js';

describe('OpenAIClient', () => {
  const validConfig: OpenAIClientConfig = {
    apiKey: 'sk-test-api-key-12345',
    model: 'gpt-4o',
    maxTokens: 1000,
    temperature: 0.7,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Test response' } }],
    });
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new OpenAIClient(validConfig);
      expect(client).toBeDefined();
    });

    it('should accept minimal config with only apiKey', () => {
      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345' });
      expect(client).toBeDefined();
    });

    it('should accept organization in config', () => {
      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        organization: 'org-test-id',
      });
      expect(client).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        timeoutMs: 120000,
      });
      expect(client).toBeDefined();
    });

    it('should accept retry config', () => {
      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });
      expect(client).toBeDefined();
    });

    it('should throw on empty apiKey', () => {
      expect(() => new OpenAIClient({ apiKey: '' })).toThrow();
    });

    it('should throw on invalid temperature', () => {
      expect(
        () =>
          new OpenAIClient({
            apiKey: 'sk-test-key-12345',
            temperature: 3, // Max is 2
          })
      ).toThrow();
    });

    it('should throw on invalid maxTokens', () => {
      expect(
        () =>
          new OpenAIClient({
            apiKey: 'sk-test-key-12345',
            maxTokens: 0, // Min is 1
          })
      ).toThrow();
    });

    it('should throw on invalid timeout', () => {
      expect(
        () =>
          new OpenAIClient({
            apiKey: 'sk-test-key-12345',
            timeoutMs: 500, // Min is 1000
          })
      ).toThrow();
    });
  });

  describe('chatCompletion', () => {
    let client: OpenAIClient;

    beforeEach(() => {
      client = new OpenAIClient(validConfig);
    });

    it('should make a chat completion request', async () => {
      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result).toBe('Test response');
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should use default model when not specified', async () => {
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test message' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o' }));
    });

    it('should accept custom model', async () => {
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        model: 'gpt-3.5-turbo',
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-3.5-turbo' }));
    });

    it('should accept custom temperature', async () => {
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.5,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.5 }));
    });

    it('should accept jsonMode option', async () => {
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Give me JSON' }],
        jsonMode: true,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ response_format: { type: 'json_object' } })
      );
    });

    it('should throw on empty messages', async () => {
      await expect(client.chatCompletion({ messages: [] })).rejects.toThrow();
    });

    it('should throw on message with empty content', async () => {
      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: '' }],
        })
      ).rejects.toThrow();
    });

    it('should accept system and assistant roles', async () => {
      await client.chatCompletion({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ],
      });

      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('scoreMessage', () => {
    let client: OpenAIClient;

    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 4,
                classification: 'HOT',
                confidence: 0.85,
                reasoning: 'Strong interest shown',
                suggestedAction: 'Schedule consultation',
                detectedIntent: 'dental implants',
                urgencyIndicators: ['urgent', 'soon'],
                budgetMentioned: true,
                procedureInterest: ['All-on-4'],
              }),
            },
          },
        ],
      });
      client = new OpenAIClient(validConfig);
    });

    it('should score a lead message', async () => {
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [
          { role: 'user', content: 'I want dental implants', timestamp: new Date().toISOString() },
        ],
        metadata: {},
      });

      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(5);
      expect(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).toContain(result.classification);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle message history with multiple messages', async () => {
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'voice',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [
          { role: 'assistant', content: 'Welcome!', timestamp: new Date().toISOString() },
          { role: 'user', content: 'I need dental help', timestamp: new Date().toISOString() },
        ],
        metadata: {},
      });

      expect(result.score).toBeDefined();
    });

    it('should handle UTM data', async () => {
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'web',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [
          { role: 'user', content: 'Interested in implants', timestamp: new Date().toISOString() },
        ],
        metadata: {},
        utm: {
          utm_source: 'google',
          utm_medium: 'cpc',
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('scoreMessage with invalid JSON response', () => {
    it('should return fallback score on invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'invalid json' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
      });

      expect(result.score).toBe(2);
      expect(result.classification).toBe('COLD');
      expect(result.confidence).toBe(0.3);
      expect(result.reasoning).toContain('Failed to parse');
    });
  });

  describe('generateReply', () => {
    let client: OpenAIClient;

    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Thank you for contacting us!' } }],
      });
      client = new OpenAIClient(validConfig);
    });

    it('should generate a reply', async () => {
      const result = await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
          metadata: {},
        },
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should accept tone option', async () => {
      const result = await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [
            { role: 'user', content: 'I need help', timestamp: new Date().toISOString() },
          ],
          metadata: {},
        },
        tone: 'empathetic',
      });

      expect(result).toBeDefined();
    });

    it('should throw on invalid phone format', async () => {
      await expect(
        client.generateReply({
          context: {
            phone: '123', // Too short
            channel: 'whatsapp',
            firstTouchTimestamp: new Date().toISOString(),
            phoneIsValid: false,
            messageHistory: [{ role: 'user', content: 'Hi', timestamp: new Date().toISOString() }],
            metadata: {},
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('detectLanguage', () => {
    it('should detect Romanian', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'ro' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.detectLanguage('Bună ziua');
      expect(result).toBe('ro');
    });

    it('should detect English', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'en' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.detectLanguage('Hello');
      expect(result).toBe('en');
    });

    it('should detect German', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'de' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.detectLanguage('Guten Tag');
      expect(result).toBe('de');
    });

    it('should return unknown for unsupported language', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'fr' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.detectLanguage('Bonjour');
      expect(result).toBe('unknown');
    });
  });

  describe('summarize', () => {
    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'This is a summary.' } }],
      });
    });

    it('should summarize text in Romanian', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.summarize('Long text...', 'ro');
      expect(result).toBeDefined();
    });

    it('should summarize text in English', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.summarize('Long text...', 'en');
      expect(result).toBeDefined();
    });

    it('should summarize text in German', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.summarize('Long text...', 'de');
      expect(result).toBeDefined();
    });
  });

  describe('analyzeSentiment', () => {
    it('should analyze positive sentiment', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sentiment: 'positive',
                confidence: 0.9,
                reasoning: 'Positive words used',
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.analyzeSentiment('I am very happy!');

      expect(result.sentiment).toBe('positive');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should analyze negative sentiment', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sentiment: 'negative',
                confidence: 0.85,
                reasoning: 'Negative language detected',
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.analyzeSentiment('This is terrible!');

      expect(result.sentiment).toBe('negative');
    });

    it('should return neutral on parse failure', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not valid json' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.analyzeSentiment('Some text');

      expect(result.sentiment).toBe('neutral');
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('input sanitization', () => {
    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'ro' } }],
      });
    });

    it('should handle text with control characters', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.detectLanguage('Hello\x00World');
      expect(result).toBeDefined();
    });

    it('should truncate very long text', async () => {
      const client = new OpenAIClient(validConfig);
      const longText = 'a'.repeat(20000);
      const result = await client.summarize(longText);
      expect(result).toBeDefined();
    });
  });

  describe('createOpenAIClient factory', () => {
    it('should create an OpenAIClient instance', () => {
      const client = createOpenAIClient({ apiKey: 'sk-test-key-12345' });
      expect(client).toBeInstanceOf(OpenAIClient);
    });
  });

  describe('retry behavior', () => {
    it('should retry on rate limit error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('rate_limit exceeded');
        }
        return { choices: [{ message: { content: 'success' } }] };
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });

    it('should retry on 502 error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('502 Bad Gateway');
        }
        return { choices: [{ message: { content: 'success' } }] };
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result).toBe('success');
    });

    it('should not retry on non-retryable error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        throw new Error('Invalid API key');
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Invalid API key');

      expect(callCount).toBe(1);
    });
  });

  describe('empty response handling', () => {
    it('should throw on empty response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 0, baseDelayMs: 100 },
      });

      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Empty response');
    });

    it('should throw on empty choices', async () => {
      mockCreate.mockResolvedValue({ choices: [] });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 0, baseDelayMs: 100 },
      });

      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Empty response');
    });
  });

  describe('scoring response parsing', () => {
    it('should clamp score to valid range', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 10, // Higher than max
                classification: 'HOT',
                confidence: 1.5, // Higher than max
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
      });

      expect(result.score).toBe(5); // Clamped to max
      expect(result.confidence).toBe(1); // Clamped to max
    });

    it('should clamp score below minimum', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 0, // Below min
                classification: 'UNQUALIFIED',
                confidence: -0.5, // Below min
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
      });

      expect(result.score).toBe(1); // Clamped to min
      expect(result.confidence).toBe(0); // Clamped to min
    });

    it('should use default score when score is missing', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                // score is completely missing
                classification: 'WARM',
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
      });

      expect(result.score).toBe(2); // Default score
    });

    it('should use default confidence when confidence is missing', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 3,
                classification: 'WARM',
                // confidence is completely missing
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
      });

      expect(result.confidence).toBe(0.5); // Default confidence
    });

    it('should handle partial response', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ score: 3 }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
      });

      expect(result.score).toBe(3);
      expect(result.classification).toBe('COLD'); // Default
      expect(result.confidence).toBe(0.5); // Default
    });

    it('should handle empty message history', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 2,
                classification: 'COLD',
                confidence: 0.4,
                reasoning: 'No conversation data',
                suggestedAction: 'Initiate contact',
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'web',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [],
        metadata: {},
      });

      expect(result.score).toBeDefined();
    });

    it('should handle undefined message history', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 2,
                classification: 'COLD',
                confidence: 0.4,
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'referral',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        metadata: {},
      } as any);

      expect(result.score).toBeDefined();
    });

    it('should handle undefined language', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 3,
                classification: 'WARM',
                confidence: 0.6,
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
        // language is undefined
      });

      expect(result.score).toBeDefined();
    });

    it('should handle undefined utm', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 3,
                classification: 'WARM',
                confidence: 0.6,
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
        // utm is undefined
      });

      expect(result.score).toBeDefined();
    });

    it('should handle utm with undefined utm_source', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 3,
                classification: 'WARM',
                confidence: 0.6,
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.scoreMessage({
        phone: '+40712345678',
        channel: 'whatsapp',
        firstTouchTimestamp: new Date().toISOString(),
        phoneIsValid: true,
        messageHistory: [{ role: 'user', content: 'Test', timestamp: new Date().toISOString() }],
        metadata: {},
        utm: {
          utm_medium: 'cpc',
          // utm_source is undefined
        },
      });

      expect(result.score).toBeDefined();
    });
  });

  describe('chat method', () => {
    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Chat response' } }],
      });
    });

    it('should make basic chat request', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.chat({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.choices).toBeDefined();
      expect(result.choices[0].message.content).toBe('Chat response');
    });

    it('should use default temperature when not provided', async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345' });
      await client.chat({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
    });

    it('should use config temperature when provided', async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345', temperature: 0.9 });
      await client.chat({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.9 }));
    });

    it('should use default maxTokens when not provided', async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345' });
      await client.chat({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 1000 }));
    });

    it('should use config maxTokens when provided', async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345', maxTokens: 2000 });
      await client.chat({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 2000 }));
    });

    it('should use default model when not provided', async () => {
      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345' });
      await client.chat({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o' }));
    });

    it('should use custom temperature and maxTokens', async () => {
      const client = new OpenAIClient(validConfig);
      await client.chat({
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.3,
        maxTokens: 500,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
          max_tokens: 500,
        })
      );
    });
  });

  describe('generateReply with all options', () => {
    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Reply message' } }],
      });
    });

    it('should use default tone', async () => {
      const client = new OpenAIClient(validConfig);
      await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
          metadata: {},
        },
      });

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should use default maxLength', async () => {
      const client = new OpenAIClient(validConfig);
      await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
          metadata: {},
        },
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 200 }));
    });

    it('should use default language', async () => {
      const client = new OpenAIClient(validConfig);
      await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
          metadata: {},
        },
      });

      expect(mockCreate).toHaveBeenCalled();
    });

    it('should handle friendly tone', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [{ role: 'user', content: 'Hi', timestamp: new Date().toISOString() }],
          metadata: {},
        },
        tone: 'friendly',
      });

      expect(result).toBeDefined();
    });

    it('should handle English language', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
          metadata: {},
        },
        language: 'en',
      });

      expect(result).toBeDefined();
    });

    it('should handle German language', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [{ role: 'user', content: 'Hallo', timestamp: new Date().toISOString() }],
          metadata: {},
        },
        language: 'de',
      });

      expect(result).toBeDefined();
    });

    it('should handle more than 5 messages in history', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [
            { role: 'user', content: 'Message 1', timestamp: new Date().toISOString() },
            { role: 'assistant', content: 'Reply 1', timestamp: new Date().toISOString() },
            { role: 'user', content: 'Message 2', timestamp: new Date().toISOString() },
            { role: 'assistant', content: 'Reply 2', timestamp: new Date().toISOString() },
            { role: 'user', content: 'Message 3', timestamp: new Date().toISOString() },
            { role: 'assistant', content: 'Reply 3', timestamp: new Date().toISOString() },
            { role: 'user', content: 'Message 4', timestamp: new Date().toISOString() },
          ],
          metadata: {},
        },
      });

      expect(result).toBeDefined();
    });

    it('should handle empty message history', async () => {
      const client = new OpenAIClient(validConfig);
      const result = await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [],
          metadata: {},
        },
      });

      expect(result).toBeDefined();
    });

    it('should handle custom maxLength', async () => {
      const client = new OpenAIClient(validConfig);
      await client.generateReply({
        context: {
          phone: '+40712345678',
          channel: 'whatsapp',
          firstTouchTimestamp: new Date().toISOString(),
          phoneIsValid: true,
          messageHistory: [{ role: 'user', content: 'Hello', timestamp: new Date().toISOString() }],
          metadata: {},
        },
        maxLength: 500,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 500 }));
    });
  });

  describe('detectLanguage edge cases', () => {
    it('should handle uppercase response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'RO' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.detectLanguage('Salut');
      expect(result).toBe('ro');
    });

    it('should handle response with whitespace', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '  en  ' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.detectLanguage('Hello');
      expect(result).toBe('en');
    });

    it('should handle mixed case response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'De' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.detectLanguage('Guten Tag');
      expect(result).toBe('de');
    });
  });

  describe('summarize with default language', () => {
    it('should use default Romanian language', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Rezumat' } }],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.summarize('Text lung...');
      expect(result).toBeDefined();
    });
  });

  describe('analyzeSentiment with neutral', () => {
    it('should analyze neutral sentiment', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sentiment: 'neutral',
                confidence: 0.7,
                reasoning: 'Neutral tone detected',
              }),
            },
          },
        ],
      });

      const client = new OpenAIClient(validConfig);
      const result = await client.analyzeSentiment('This is a statement');

      expect(result.sentiment).toBe('neutral');
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('retry on additional error types', () => {
    it('should retry on 503 error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('503 Service Unavailable');
        }
        return { choices: [{ message: { content: 'success' } }] };
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });

    it('should retry on timeout error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Request timeout');
        }
        return { choices: [{ message: { content: 'success' } }] };
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result).toBe('success');
    });

    it('should retry on timed out error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Connection timed out');
        }
        return { choices: [{ message: { content: 'success' } }] };
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result).toBe('success');
    });

    it('should retry on econnreset error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('ECONNRESET');
        }
        return { choices: [{ message: { content: 'success' } }] };
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result).toBe('success');
    });

    it('should retry on socket hang up error', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('socket hang up');
        }
        return { choices: [{ message: { content: 'success' } }] };
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      const result = await client.chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result).toBe('success');
    });

    it('should not retry on non-Error object', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        throw 'String error';
      });

      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        retryConfig: { maxRetries: 3, baseDelayMs: 100 },
      });

      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();

      expect(callCount).toBe(1);
    });
  });

  describe('input sanitization edge cases', () => {
    beforeEach(() => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Test response' } }],
      });
    });

    it('should remove zero-width characters', async () => {
      const client = new OpenAIClient(validConfig);
      const textWithZeroWidth = 'Hello\u200BWorld\u200C\u200D\uFEFF';
      await client.detectLanguage(textWithZeroWidth);
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should not truncate text at exact maxLength boundary', async () => {
      const client = new OpenAIClient(validConfig);
      const exactLength = 'a'.repeat(1000);
      await client.detectLanguage(exactLength);
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should handle text with various control characters', async () => {
      const client = new OpenAIClient(validConfig);
      const textWithControls = 'Hello\x00\x01\x02\x1F\x7FWorld';
      await client.detectLanguage(textWithControls);
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('chatCompletion with jsonMode false', () => {
    it('should not include response_format when jsonMode is false', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Plain text response' } }],
      });

      const client = new OpenAIClient(validConfig);
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        jsonMode: false,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          response_format: expect.anything(),
        })
      );
    });
  });

  describe('validation edge cases', () => {
    it('should throw on message content too long', async () => {
      const client = new OpenAIClient(validConfig);
      const tooLong = 'a'.repeat(100001);

      await expect(
        client.chatCompletion({
          messages: [{ role: 'user', content: tooLong }],
        })
      ).rejects.toThrow();
    });

    it('should throw on maxTokens above maximum', async () => {
      expect(
        () =>
          new OpenAIClient({
            apiKey: 'sk-test-key-12345',
            maxTokens: 200000, // Above 128000 max
          })
      ).toThrow();
    });

    it('should throw on temperature below minimum', async () => {
      expect(
        () =>
          new OpenAIClient({
            apiKey: 'sk-test-key-12345',
            temperature: -1,
          })
      ).toThrow();
    });

    it('should throw on invalid retry config maxRetries', async () => {
      expect(
        () =>
          new OpenAIClient({
            apiKey: 'sk-test-key-12345',
            retryConfig: { maxRetries: 15, baseDelayMs: 1000 }, // Max is 10
          })
      ).toThrow();
    });

    it('should throw on invalid retry config baseDelayMs too low', async () => {
      expect(
        () =>
          new OpenAIClient({
            apiKey: 'sk-test-key-12345',
            retryConfig: { maxRetries: 3, baseDelayMs: 50 }, // Min is 100
          })
      ).toThrow();
    });

    it('should throw on invalid retry config baseDelayMs too high', async () => {
      expect(
        () =>
          new OpenAIClient({
            apiKey: 'sk-test-key-12345',
            retryConfig: { maxRetries: 3, baseDelayMs: 40000 }, // Max is 30000
          })
      ).toThrow();
    });

    it('should accept timeout at exact maximum', async () => {
      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
        timeoutMs: 300000, // Exactly at max
      });
      expect(client).toBeDefined();
    });

    it('should use default timeout when not provided', async () => {
      const client = new OpenAIClient({
        apiKey: 'sk-test-key-12345',
      });
      expect(client).toBeDefined();
    });

    it('should throw on invalid phone in generateReply', async () => {
      const client = new OpenAIClient(validConfig);
      await expect(
        client.generateReply({
          context: {
            phone: 'abc', // Invalid phone
            channel: 'whatsapp',
            firstTouchTimestamp: new Date().toISOString(),
            phoneIsValid: true,
            messageHistory: [],
            metadata: {},
          },
        })
      ).rejects.toThrow();
    });

    it('should throw on phone too long', async () => {
      const client = new OpenAIClient(validConfig);
      await expect(
        client.generateReply({
          context: {
            phone: '+' + '1'.repeat(30), // Too long
            channel: 'whatsapp',
            firstTouchTimestamp: new Date().toISOString(),
            phoneIsValid: true,
            messageHistory: [],
            metadata: {},
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('default config fallbacks in chatCompletion', () => {
    it('should use default model when not in config or options', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
      });

      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345' });
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o' }));
    });

    it('should use default maxTokens when not in config or options', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
      });

      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345' });
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 1000 }));
    });

    it('should use default temperature when not in config or options', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
      });

      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345' });
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.7 }));
    });

    it('should use default retry config when not provided', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
      });

      const client = new OpenAIClient({ apiKey: 'sk-test-key-12345' });
      await client.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(mockCreate).toHaveBeenCalled();
    });
  });
});
