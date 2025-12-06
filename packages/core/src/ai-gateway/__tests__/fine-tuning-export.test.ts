/**
 * Fine-Tuning Export Service Tests
 *
 * Comprehensive tests for conversation export and PII redaction
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  FineTuningExportService,
  createFineTuningExportService,
  DEFAULT_PII_PATTERNS,
  DEFAULT_SYSTEM_PROMPT,
  FineTuningExportConfigSchema,
  type FineTuningExample,
} from '../fine-tuning-export.js';

describe('FineTuningExportService', () => {
  let mockPool: Pool;
  let service: FineTuningExportService;

  function createMockConversationRow(
    overrides: Partial<{
      phone: string;
      direction: 'IN' | 'OUT';
      content: string;
      intent: string;
      sentiment: string;
      timestamp: Date;
      metadata: Record<string, unknown>;
    }> = {}
  ) {
    return {
      phone: '+40721234567',
      direction: 'IN' as const,
      content: 'Test message',
      intent: 'general',
      sentiment: 'positive',
      timestamp: new Date('2025-01-15'),
      metadata: {},
      ...overrides,
    };
  }

  function createMockPool(rows: unknown[] = []): Pool {
    return {
      query: vi.fn().mockResolvedValue({ rows } as QueryResult<unknown>),
    } as unknown as Pool;
  }

  beforeEach(() => {
    mockPool = createMockPool();
    service = new FineTuningExportService(mockPool);
  });

  describe('Constructor', () => {
    it('should create service with default config', () => {
      const config = service.getConfig();

      expect(config.format).toBe('openai');
      expect(config.redactPII).toBe(true);
      expect(config.maxExamples).toBe(10000);
      expect(config.shuffleExamples).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customService = new FineTuningExportService(mockPool, {
        format: 'anthropic',
        redactPII: false,
        maxExamples: 5000,
      });

      const config = customService.getConfig();
      expect(config.format).toBe('anthropic');
      expect(config.redactPII).toBe(false);
      expect(config.maxExamples).toBe(5000);
    });

    it('should compile PII regex patterns', () => {
      const customService = new FineTuningExportService(mockPool, {
        piiPatterns: [{ name: 'test', pattern: '\\d{4}', replacement: '[TEST]' }],
      });

      expect(customService).toBeDefined();
    });
  });

  describe('exportConversations', () => {
    it('should export conversations with default system prompt', async () => {
      const rows = [
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Hello' }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'OUT',
          content: 'Hi there!',
        }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Can you help?',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Sure!' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, { shuffleExamples: false });

      const { examples, stats } = await service.exportConversations();

      expect(examples).toHaveLength(1); // One conversation
      expect(examples[0]!.messages[0]!.role).toBe('system');
      expect(examples[0]!.messages[0]!.content).toContain('dental clinic assistant');
      expect(stats.totalConversations).toBe(1);
    });

    it('should filter conversations by quality criteria', async () => {
      // Create conversation with too few messages
      const rows = [
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Hello' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Hi' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 4,
          maxMessages: 50,
          minUserMessages: 2,
          minAssistantMessages: 2,
        },
        shuffleExamples: false,
      });

      const { examples, stats } = await service.exportConversations();

      expect(examples).toHaveLength(0);
      expect(stats.filteredOut).toBe(1);
    });

    it('should redact PII when enabled', async () => {
      const rows = [
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'My email is john@example.com',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Thanks!' }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Call me at +40721999888',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Will do!' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        redactPII: true,
        shuffleExamples: false,
      });

      const { examples } = await service.exportConversations();

      const messages = examples[0]!.messages;
      expect(messages.find((m) => m.content.includes('[EMAIL]'))).toBeDefined();
      expect(messages.find((m) => m.content.includes('[PHONE]'))).toBeDefined();
      expect(messages.find((m) => m.content.includes('john@example.com'))).toBeUndefined();
    });

    it('should not redact PII when disabled', async () => {
      const rows = [
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'My email is john@example.com',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Thanks!' }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Help please',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Sure!' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        redactPII: false,
        shuffleExamples: false,
      });

      const { examples } = await service.exportConversations();

      const messages = examples[0]!.messages;
      expect(messages.find((m) => m.content.includes('john@example.com'))).toBeDefined();
    });

    it('should limit examples to maxExamples', async () => {
      // Create multiple conversations
      const rows: unknown[] = [];
      for (let i = 0; i < 20; i++) {
        const phone = `+4072100000${i.toString().padStart(2, '0')}`;
        rows.push(
          createMockConversationRow({ phone, direction: 'IN', content: 'Hello' }),
          createMockConversationRow({ phone, direction: 'OUT', content: 'Hi' }),
          createMockConversationRow({ phone, direction: 'IN', content: 'Help' }),
          createMockConversationRow({ phone, direction: 'OUT', content: 'Sure' })
        );
      }
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        maxExamples: 5,
        shuffleExamples: false,
      });

      const { examples } = await service.exportConversations();

      expect(examples).toHaveLength(5);
    });

    it('should filter by excluded intents', async () => {
      const rows = [
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Hello',
          intent: 'spam',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Hi' }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Bye',
          intent: 'spam',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Goodbye' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 4,
          maxMessages: 50,
          minUserMessages: 2,
          minAssistantMessages: 2,
          excludeIntents: ['spam'],
        },
        shuffleExamples: false,
      });

      const { examples, stats } = await service.exportConversations();

      expect(examples).toHaveLength(0);
      expect(stats.filteredOut).toBe(1);
    });

    it('should use custom system prompt', async () => {
      const rows = [
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Hello' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Hi' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Help' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Sure' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        systemPrompt: 'Custom system prompt',
        shuffleExamples: false,
      });

      const { examples } = await service.exportConversations();

      expect(examples[0]!.messages[0]!.content).toBe('Custom system prompt');
    });

    it('should return export statistics', async () => {
      const rows = [
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Hello' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Hi' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Help' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Sure' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, { shuffleExamples: false });

      const { stats } = await service.exportConversations();

      expect(stats.totalConversations).toBe(1);
      expect(stats.totalMessages).toBeGreaterThan(0);
      expect(stats.avgConversationLength).toBeGreaterThan(0);
      expect(stats.exportDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('exportToJSONL', () => {
    it('should export to JSONL format with train/validation split', async () => {
      const rows: unknown[] = [];
      for (let i = 0; i < 10; i++) {
        const phone = `+4072100000${i.toString().padStart(2, '0')}`;
        rows.push(
          createMockConversationRow({ phone, direction: 'IN', content: 'Hello' }),
          createMockConversationRow({ phone, direction: 'OUT', content: 'Hi' }),
          createMockConversationRow({ phone, direction: 'IN', content: 'Help' }),
          createMockConversationRow({ phone, direction: 'OUT', content: 'Sure' })
        );
      }
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        validationSplit: 0.2,
        shuffleExamples: false,
      });

      const { training, validation, stats } = await service.exportToJSONL();

      expect(training).toBeDefined();
      expect(validation).toBeDefined();
      expect(training.split('\n').length).toBe(8); // 80% of 10
      expect(validation.split('\n').length).toBe(2); // 20% of 10
      expect(stats.fileSizeBytes).toBeGreaterThan(0);
    });

    it('should produce valid JSONL lines', async () => {
      const rows = [
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Hello' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Hi' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Help' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Sure' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, { shuffleExamples: false });

      const { training } = await service.exportToJSONL();

      const lines = training.split('\n').filter(Boolean);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
        const parsed = JSON.parse(line) as FineTuningExample;
        expect(parsed.messages).toBeDefined();
      }
    });
  });

  describe('exportForAnthropic', () => {
    it('should export in Anthropic format', async () => {
      const rows = [
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Hello' }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'OUT',
          content: 'Hi there!',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Question' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Answer' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, { shuffleExamples: false });

      const { examples, stats } = await service.exportForAnthropic();

      expect(examples).toBeDefined();
      expect(examples[0]).toHaveProperty('human');
      expect(examples[0]).toHaveProperty('assistant');
      expect(stats.totalConversations).toBe(1);
    });

    it('should pair human/assistant messages', async () => {
      const rows = [
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'First question',
        }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'OUT',
          content: 'First answer',
        }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Second question',
        }),
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'OUT',
          content: 'Second answer',
        }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, { shuffleExamples: false });

      const { examples } = await service.exportForAnthropic();

      expect(examples).toHaveLength(2);
      expect(examples[0]!.human).toBe('First question');
      expect(examples[0]!.assistant).toBe('First answer');
      expect(examples[1]!.human).toBe('Second question');
      expect(examples[1]!.assistant).toBe('Second answer');
    });
  });

  describe('validateExamples', () => {
    it('should return valid for good examples', () => {
      const examples: FineTuningExample[] = Array(100).fill({
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'User message with sufficient content' },
          { role: 'assistant', content: 'Assistant response with good content' },
        ],
      });

      const result = service.validateExamples(examples);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should warn for low example count', () => {
      const examples: FineTuningExample[] = Array(50).fill({
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'User' },
          { role: 'assistant', content: 'Assistant' },
        ],
      });

      const result = service.validateExamples(examples);

      expect(result.warnings.some((w) => w.includes('Low example count'))).toBe(true);
    });

    it('should report issue for too few examples', () => {
      const examples: FineTuningExample[] = Array(5).fill({
        messages: [
          { role: 'user', content: 'User' },
          { role: 'assistant', content: 'Assistant' },
        ],
      });

      const result = service.validateExamples(examples);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('Too few examples'))).toBe(true);
    });

    it('should report issue for empty messages', () => {
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
      expect(result.issues.some((i) => i.includes('empty messages'))).toBe(true);
    });

    it('should warn for consecutive same-role messages', () => {
      const examples: FineTuningExample[] = Array(100).fill({
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'user', content: 'Second message' }, // Same role
          { role: 'assistant', content: 'Response' },
        ],
      });

      const result = service.validateExamples(examples);

      expect(result.warnings.some((w) => w.includes('consecutive same-role'))).toBe(true);
    });
  });

  describe('getExportChecksum', () => {
    it('should return consistent checksum for same data', () => {
      const examples: FineTuningExample[] = [{ messages: [{ role: 'user', content: 'Test' }] }];

      const checksum1 = service.getExportChecksum(examples);
      const checksum2 = service.getExportChecksum(examples);

      expect(checksum1).toBe(checksum2);
    });

    it('should return different checksum for different data', () => {
      const examples1: FineTuningExample[] = [{ messages: [{ role: 'user', content: 'Test 1' }] }];
      const examples2: FineTuningExample[] = [{ messages: [{ role: 'user', content: 'Test 2' }] }];

      const checksum1 = service.getExportChecksum(examples1);
      const checksum2 = service.getExportChecksum(examples2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should return 16 character hex string', () => {
      const examples: FineTuningExample[] = [{ messages: [{ role: 'user', content: 'Test' }] }];

      const checksum = service.getExportChecksum(examples);

      expect(checksum).toHaveLength(16);
      expect(/^[a-f0-9]+$/.test(checksum)).toBe(true);
    });
  });

  describe('createAugmentations', () => {
    it('should return original examples for now', () => {
      const examples: FineTuningExample[] = [{ messages: [{ role: 'user', content: 'Test' }] }];

      const augmented = service.createAugmentations(examples);

      expect(augmented).toEqual(examples);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      service.updateConfig({ maxExamples: 5000 });

      expect(service.getConfig().maxExamples).toBe(5000);
    });
  });

  describe('DEFAULT_PII_PATTERNS', () => {
    it('should have patterns for common PII types', () => {
      const patternNames = DEFAULT_PII_PATTERNS.map((p) => p.name);

      expect(patternNames).toContain('phone');
      expect(patternNames).toContain('email');
      expect(patternNames).toContain('cnp');
      expect(patternNames).toContain('iban');
      expect(patternNames).toContain('creditCard');
      expect(patternNames).toContain('date');
      expect(patternNames).toContain('address');
    });

    it('should have valid regex patterns', () => {
      for (const pattern of DEFAULT_PII_PATTERNS) {
        expect(() => new RegExp(pattern.pattern, 'gi')).not.toThrow();
      }
    });
  });

  describe('DEFAULT_SYSTEM_PROMPT', () => {
    it('should mention dental clinic', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('dental clinic');
    });

    it('should mention implant procedures', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('implant');
    });
  });

  describe('Schema Validation', () => {
    it('should validate config with defaults', () => {
      const parsed = FineTuningExportConfigSchema.parse({});

      expect(parsed.format).toBe('openai');
      expect(parsed.redactPII).toBe(true);
      expect(parsed.qualityCriteria.minMessages).toBe(4);
    });

    it('should reject invalid maxExamples', () => {
      expect(() => FineTuningExportConfigSchema.parse({ maxExamples: 0 })).toThrow();
    });

    it('should reject invalid validationSplit', () => {
      expect(() => FineTuningExportConfigSchema.parse({ validationSplit: 0.8 })).toThrow();
    });
  });

  describe('Factory Function', () => {
    it('should create service instance', () => {
      const newService = createFineTuningExportService(mockPool);

      expect(newService).toBeInstanceOf(FineTuningExportService);
    });

    it('should create with custom config', () => {
      const newService = createFineTuningExportService(mockPool, {
        format: 'anthropic',
      });

      expect(newService.getConfig().format).toBe('anthropic');
    });
  });

  describe('Quality Criteria Filtering', () => {
    it('should filter by minLeadScore', async () => {
      const rows = [
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Hello',
          metadata: { leadScore: 2 },
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Hi' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Help' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Sure' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 4,
          maxMessages: 50,
          minUserMessages: 2,
          minAssistantMessages: 2,
          minLeadScore: 4,
        },
        shuffleExamples: false,
      });

      const { examples, stats } = await service.exportConversations();

      expect(examples).toHaveLength(0);
      expect(stats.filteredOut).toBe(1);
    });

    it('should filter by negative sentiment', async () => {
      const rows = [
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Hello',
          sentiment: 'negative',
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Hi' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Bad' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Sorry' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 4,
          maxMessages: 50,
          minUserMessages: 2,
          minAssistantMessages: 2,
          excludeNegativeSentiment: true,
        },
        shuffleExamples: false,
      });

      const { examples, stats } = await service.exportConversations();

      expect(examples).toHaveLength(0);
      expect(stats.filteredOut).toBe(1);
    });

    it('should filter by successful outcome', async () => {
      const rows = [
        createMockConversationRow({
          phone: '+40721234567',
          direction: 'IN',
          content: 'Hello',
          metadata: { outcome: 'cancelled' },
        }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Hi' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'IN', content: 'Help' }),
        createMockConversationRow({ phone: '+40721234567', direction: 'OUT', content: 'Sure' }),
      ];
      mockPool = createMockPool(rows);
      service = new FineTuningExportService(mockPool, {
        qualityCriteria: {
          minMessages: 4,
          maxMessages: 50,
          minUserMessages: 2,
          minAssistantMessages: 2,
          requireSuccessfulOutcome: true,
        },
        shuffleExamples: false,
      });

      const { examples, stats } = await service.exportConversations();

      expect(examples).toHaveLength(0);
      expect(stats.filteredOut).toBe(1);
    });
  });
});
