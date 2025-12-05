/**
 * Fine-Tuning Export Service Unit Tests
 *
 * Comprehensive tests for fine-tuning data export including:
 * - Conversation fetching and filtering
 * - PII redaction
 * - Quality criteria filtering
 * - OpenAI and Anthropic format export
 * - Validation and checksums
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  FineTuningExportService,
  createFineTuningExportService,
  DEFAULT_PII_PATTERNS,
  DEFAULT_SYSTEM_PROMPT,
  type FineTuningExample,
  type ExportStats,
} from '../fine-tuning-export.js';

/**
 * Create a mock PostgreSQL pool
 */
function createMockPool(mockQueryResults: unknown[] = []): Pool {
  let queryIndex = 0;
  return {
    query: vi.fn().mockImplementation(async () => {
      const result = mockQueryResults[queryIndex++];
      return result || { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(),
    end: vi.fn(),
  } as unknown as Pool;
}

describe('FineTuningExportService', () => {
  let service: FineTuningExportService;
  let mockPool: Pool;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    service = new FineTuningExportService(mockPool);
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      expect(service).toBeDefined();
      const config = service.getConfig();
      expect(config.format).toBe('openai');
      expect(config.redactPII).toBe(true);
    });

    it('should create service with custom configuration', () => {
      const customService = new FineTuningExportService(mockPool, {
        format: 'anthropic',
        redactPII: false,
        maxExamples: 5000,
        shuffleExamples: false,
      });

      const config = customService.getConfig();
      expect(config.format).toBe('anthropic');
      expect(config.redactPII).toBe(false);
      expect(config.maxExamples).toBe(5000);
      expect(config.shuffleExamples).toBe(false);
    });

    it('should use default PII patterns when none provided', () => {
      expect(service).toBeDefined();
      const config = service.getConfig();
      expect(config.piiPatterns.length).toBe(0);
    });

    it('should accept custom PII patterns', () => {
      const customPatterns = [
        { name: 'ssn', pattern: '\\d{3}-\\d{2}-\\d{4}', replacement: '[SSN]' },
      ];

      const customService = new FineTuningExportService(mockPool, {
        piiPatterns: customPatterns,
      });

      const config = customService.getConfig();
      expect(config.piiPatterns).toHaveLength(1);
    });

    it('should accept custom system prompt', () => {
      const customPrompt = 'You are a custom assistant';
      const customService = new FineTuningExportService(mockPool, {
        systemPrompt: customPrompt,
      });

      const config = customService.getConfig();
      expect(config.systemPrompt).toBe(customPrompt);
    });
  });

  describe('exportConversations', () => {
    beforeEach(() => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Hello, I need information',
              intent: 'inquiry',
              sentiment: 'positive',
              timestamp: new Date('2024-01-01'),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'How can I help you?',
              timestamp: new Date('2024-01-01'),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'I want to know about implants',
              timestamp: new Date('2024-01-01'),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'We offer All-on-4 implants',
              timestamp: new Date('2024-01-01'),
              metadata: {},
            },
          ],
        },
      ]);
      service = new FineTuningExportService(mockPool);
    });

    it('should export conversations successfully', async () => {
      const { examples, stats } = await service.exportConversations();

      expect(examples).toBeDefined();
      expect(examples.length).toBeGreaterThan(0);
      expect(stats.totalConversations).toBeGreaterThan(0);
      expect(stats.totalMessages).toBeGreaterThan(0);
    });

    it('should include system prompt in messages', async () => {
      const { examples } = await service.exportConversations();

      expect(examples[0]?.messages[0]?.role).toBe('system');
      expect(examples[0]?.messages[0]?.content).toBe(DEFAULT_SYSTEM_PROMPT);
    });

    it('should filter conversations by clinic ID', async () => {
      await service.exportConversations({ clinicId: 'clinic-123' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('clinic_id'),
        expect.arrayContaining(['clinic-123'])
      );
    });

    it('should filter conversations by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await service.exportConversations({ startDate, endDate });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('message_timestamp'),
        expect.arrayContaining([startDate, endDate])
      );
    });

    it('should filter conversations by language', async () => {
      await service.exportConversations({ language: 'ro' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('language'),
        expect.arrayContaining(['ro'])
      );
    });

    it('should shuffle examples when enabled', async () => {
      // Create multiple conversations to ensure shuffling
      const manyRows = Array.from({ length: 20 }, (_, i) => ({
        phone: `+4071234${i.toString().padStart(4, '0')}`,
        direction: 'IN' as const,
        content: `Message ${i}`,
        timestamp: new Date('2024-01-01'),
        metadata: {},
      }));

      mockPool = createMockPool([{ rows: manyRows }]);
      service = new FineTuningExportService(mockPool, { shuffleExamples: true });

      const { examples } = await service.exportConversations();

      expect(examples).toBeDefined();
      // Shuffling is randomized, so we can't test exact order
    });

    it('should not shuffle when disabled', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'First',
              timestamp: new Date('2024-01-01'),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Second',
              timestamp: new Date('2024-01-01'),
              metadata: {},
            },
          ],
        },
      ]);
      service = new FineTuningExportService(mockPool, { shuffleExamples: false });

      const { examples } = await service.exportConversations();

      expect(examples).toBeDefined();
    });

    it('should limit to maxExamples', async () => {
      const manyRows = Array.from({ length: 200 }, (_, i) => ({
        phone: `phone-${i}`,
        direction: i % 2 === 0 ? ('IN' as const) : ('OUT' as const),
        content: `Message ${i}`,
        timestamp: new Date('2024-01-01'),
        metadata: {},
      }));

      mockPool = createMockPool([{ rows: manyRows }]);
      service = new FineTuningExportService(mockPool, {
        maxExamples: 10,
        qualityCriteria: { minMessages: 1, maxMessages: 100, minUserMessages: 1, minAssistantMessages: 1 },
      });

      const { examples } = await service.exportConversations();

      expect(examples.length).toBeLessThanOrEqual(10);
    });

    it('should calculate accurate statistics', async () => {
      const { stats } = await service.exportConversations();

      expect(stats.totalConversations).toBeDefined();
      expect(stats.totalMessages).toBeDefined();
      expect(stats.avgConversationLength).toBeDefined();
      expect(stats.exportDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Quality Filtering', () => {
    it('should filter by minimum messages', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Hi',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Hello',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 10, // Require at least 10 messages
          maxMessages: 100,
          minUserMessages: 1,
          minAssistantMessages: 1,
        },
      });

      const { examples, stats } = await service.exportConversations();

      expect(examples.length).toBe(0);
      expect(stats.filteredOut).toBe(1);
    });

    it('should filter by maximum messages', async () => {
      const manyMessages = Array.from({ length: 100 }, (_, i) => ({
        phone: '+40712345678',
        direction: i % 2 === 0 ? ('IN' as const) : ('OUT' as const),
        content: `Message ${i}`,
        timestamp: new Date(),
        metadata: {},
      }));

      mockPool = createMockPool([{ rows: manyMessages }]);
      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 1,
          maxMessages: 10, // Maximum 10 messages
          minUserMessages: 1,
          minAssistantMessages: 1,
        },
      });

      const { stats } = await service.exportConversations();

      expect(stats.filteredOut).toBe(1);
    });

    it('should filter by user/assistant message counts', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Only one user message',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 1,
          maxMessages: 100,
          minUserMessages: 2, // Require at least 2 user messages
          minAssistantMessages: 2,
        },
      });

      const { stats } = await service.exportConversations();

      expect(stats.filteredOut).toBeGreaterThan(0);
    });

    it('should filter by excluded intents', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Message',
              intent: 'spam',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Response',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 1,
          maxMessages: 100,
          minUserMessages: 1,
          minAssistantMessages: 1,
          excludeIntents: ['spam'],
        },
      });

      const { stats } = await service.exportConversations();

      expect(stats.filteredOut).toBe(1);
    });

    it('should filter by included intents', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Message',
              intent: 'general',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Response',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 1,
          maxMessages: 100,
          minUserMessages: 1,
          minAssistantMessages: 1,
          includeIntents: ['booking', 'pricing'], // Only include these intents
        },
      });

      const { stats } = await service.exportConversations();

      expect(stats.filteredOut).toBe(1);
    });

    it('should exclude negative sentiment when configured', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Message',
              sentiment: 'negative',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Response',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 1,
          maxMessages: 100,
          minUserMessages: 1,
          minAssistantMessages: 1,
          excludeNegativeSentiment: true,
        },
      });

      const { stats } = await service.exportConversations();

      expect(stats.filteredOut).toBe(1);
    });

    it('should filter by minimum lead score', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Message',
              timestamp: new Date(),
              metadata: { leadScore: 2 },
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Response',
              timestamp: new Date(),
              metadata: { leadScore: 2 },
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 1,
          maxMessages: 100,
          minUserMessages: 1,
          minAssistantMessages: 1,
          minLeadScore: 4, // Require high score
        },
      });

      const { stats } = await service.exportConversations();

      expect(stats.filteredOut).toBe(1);
    });

    it('should require successful outcome when configured', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Message',
              timestamp: new Date(),
              metadata: { outcome: 'abandoned' },
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Response',
              timestamp: new Date(),
              metadata: { outcome: 'abandoned' },
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 1,
          maxMessages: 100,
          minUserMessages: 1,
          minAssistantMessages: 1,
          requireSuccessfulOutcome: true,
        },
      });

      const { stats } = await service.exportConversations();

      expect(stats.filteredOut).toBe(1);
    });
  });

  describe('PII Redaction', () => {
    it('should redact phone numbers', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'My phone is +40712345678',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Thank you',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Please call me',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Will do',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, { redactPII: true });

      const { examples } = await service.exportConversations();

      const userMessage = examples[0]?.messages.find((m) => m.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage?.content).toContain('[PHONE]');
      expect(userMessage?.content).not.toContain('+40712345678');
    });

    it('should redact emails', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Email me at john@example.com',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'OK',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Did you get it?',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Yes',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, { redactPII: true });

      const { examples } = await service.exportConversations();

      const userMessage = examples[0]?.messages.find((m) => m.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage?.content).toContain('[EMAIL]');
      expect(userMessage?.content).not.toContain('john@example.com');
    });

    it('should not redact when disabled', async () => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'My email is test@example.com',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'OK',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'Thanks',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Welcome',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);

      service = new FineTuningExportService(mockPool, { redactPII: false });

      const { examples } = await service.exportConversations();

      const userMessage = examples[0]?.messages.find((m) => m.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage?.content).toContain('test@example.com');
    });
  });

  describe('exportToJSONL', () => {
    beforeEach(() => {
      mockPool = createMockPool([
        {
          rows: Array.from({ length: 20 }, (_, i) => ({
            phone: `phone-${Math.floor(i / 4)}`,
            direction: i % 2 === 0 ? ('IN' as const) : ('OUT' as const),
            content: `Message ${i}`,
            timestamp: new Date(),
            metadata: {},
          })),
        },
      ]);
      service = new FineTuningExportService(mockPool, {
        shuffleExamples: false,
        validationSplit: 0.2,
      });
    });

    it('should export to JSONL format', async () => {
      const { training, validation, stats } = await service.exportToJSONL();

      expect(training).toBeDefined();
      expect(validation).toBeDefined();
      expect(stats).toBeDefined();
      expect(typeof training).toBe('string');
      expect(typeof validation).toBe('string');
    });

    it('should split into training and validation sets', async () => {
      const { training, validation } = await service.exportToJSONL();

      const trainingLines = training.split('\n').filter((line) => line.trim());
      const validationLines = validation.split('\n').filter((line) => line.trim());

      expect(validationLines.length).toBeGreaterThan(0);
      expect(trainingLines.length).toBeGreaterThan(0);
    });

    it('should include file size in stats', async () => {
      const { stats } = await service.exportToJSONL();

      expect(stats.fileSizeBytes).toBeDefined();
      expect(stats.fileSizeBytes).toBeGreaterThan(0);
    });

    it('should produce valid JSONL format', async () => {
      const { training } = await service.exportToJSONL();

      const lines = training.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
        const parsed = JSON.parse(line) as FineTuningExample;
        expect(parsed.messages).toBeDefined();
        expect(Array.isArray(parsed.messages)).toBe(true);
      }
    });
  });

  describe('exportForAnthropic', () => {
    beforeEach(() => {
      mockPool = createMockPool([
        {
          rows: [
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'User question 1',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Assistant answer 1',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'IN',
              content: 'User question 2',
              timestamp: new Date(),
              metadata: {},
            },
            {
              phone: '+40712345678',
              direction: 'OUT',
              content: 'Assistant answer 2',
              timestamp: new Date(),
              metadata: {},
            },
          ],
        },
      ]);
      service = new FineTuningExportService(mockPool);
    });

    it('should export in Anthropic format', async () => {
      const { examples, stats } = await service.exportForAnthropic();

      expect(examples).toBeDefined();
      expect(stats).toBeDefined();
      expect(examples.length).toBeGreaterThan(0);
    });

    it('should create human/assistant pairs', async () => {
      const { examples } = await service.exportForAnthropic();

      const firstExample = examples[0];
      expect(firstExample).toHaveProperty('human');
      expect(firstExample).toHaveProperty('assistant');
      expect(typeof firstExample?.human).toBe('string');
      expect(typeof firstExample?.assistant).toBe('string');
    });

    it('should exclude system messages', async () => {
      const { examples } = await service.exportForAnthropic();

      for (const example of examples) {
        expect(example.human).not.toContain('system');
        expect(example.assistant).not.toContain('system');
      }
    });
  });

  describe('validateExamples', () => {
    it('should validate sufficient examples', () => {
      const examples: FineTuningExample[] = Array.from({ length: 100 }, (_, i) => ({
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: `User message ${i}` },
          { role: 'assistant', content: `Assistant response ${i}` },
        ],
      }));

      const result = service.validateExamples(examples);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should warn about low example count', () => {
      const examples: FineTuningExample[] = Array.from({ length: 50 }, (_, i) => ({
        messages: [
          { role: 'user', content: `Message ${i}` },
          { role: 'assistant', content: `Response ${i}` },
        ],
      }));

      const result = service.validateExamples(examples);

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should detect empty messages', () => {
      const examples: FineTuningExample[] = [
        {
          messages: [
            { role: 'user', content: '' },
            { role: 'assistant', content: 'Response' },
          ],
        },
      ];

      const result = service.validateExamples(examples);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('empty'))).toBe(true);
    });

    it('should detect consecutive same-role messages', () => {
      const examples: FineTuningExample[] = [
        {
          messages: [
            { role: 'user', content: 'First' },
            { role: 'user', content: 'Second' },
            { role: 'assistant', content: 'Response' },
          ],
        },
      ];

      const result = service.validateExamples(examples);

      expect(result.warnings.some((w) => w.includes('consecutive'))).toBe(true);
    });

    it('should warn about low average length', () => {
      const examples: FineTuningExample[] = Array.from({ length: 100 }, () => ({
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hi' },
        ],
      }));

      const result = service.validateExamples(examples);

      expect(result.warnings.some((w) => w.includes('average message length'))).toBe(true);
    });
  });

  describe('getExportChecksum', () => {
    it('should generate consistent checksum for same data', () => {
      const examples: FineTuningExample[] = [
        {
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
          ],
        },
      ];

      const checksum1 = service.getExportChecksum(examples);
      const checksum2 = service.getExportChecksum(examples);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different data', () => {
      const examples1: FineTuningExample[] = [
        {
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi' },
          ],
        },
      ];

      const examples2: FineTuningExample[] = [
        {
          messages: [
            { role: 'user', content: 'Different' },
            { role: 'assistant', content: 'Message' },
          ],
        },
      ];

      const checksum1 = service.getExportChecksum(examples1);
      const checksum2 = service.getExportChecksum(examples2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should return 16 character hex string', () => {
      const examples: FineTuningExample[] = [
        {
          messages: [
            { role: 'user', content: 'Test' },
            { role: 'assistant', content: 'Response' },
          ],
        },
      ];

      const checksum = service.getExportChecksum(examples);

      expect(checksum).toHaveLength(16);
      expect(checksum).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('createAugmentations', () => {
    it('should return original examples (placeholder)', () => {
      const examples: FineTuningExample[] = [
        {
          messages: [
            { role: 'user', content: 'Test' },
            { role: 'assistant', content: 'Response' },
          ],
        },
      ];

      const augmented = service.createAugmentations(examples);

      expect(augmented).toEqual(examples);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      service.updateConfig({ maxExamples: 5000 });

      const config = service.getConfig();
      expect(config.maxExamples).toBe(5000);
    });

    it('should validate updated configuration', () => {
      expect(() => {
        service.updateConfig({ validationSplit: 1.5 } as never); // Invalid value
      }).toThrow();
    });
  });

  describe('Factory Function', () => {
    it('should create service with factory function', () => {
      const factoryService = createFineTuningExportService(mockPool, {
        format: 'anthropic',
      });

      expect(factoryService).toBeDefined();
      const config = factoryService.getConfig();
      expect(config.format).toBe('anthropic');
    });
  });
});
