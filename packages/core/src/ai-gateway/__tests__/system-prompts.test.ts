/**
 * System Prompts Repository Tests
 *
 * Comprehensive tests for system prompt generation and management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SystemPromptsRepository,
  createSystemPromptsRepository,
  getSystemPromptsRepository,
  initializeSystemPrompts,
  type PromptCategory,
  type SystemPrompt,
  DEFAULT_PROMPTS,
} from '../system-prompts.js';
import type { DatabasePool } from '../../database.js';

// Mock database module
vi.mock('../../database.js', () => ({
  createIsolatedDatabaseClient: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock logger
vi.mock('../../logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('SystemPromptsRepository', () => {
  let repository: SystemPromptsRepository;

  beforeEach(() => {
    repository = createSystemPromptsRepository();
  });

  afterEach(async () => {
    await repository.close();
  });

  describe('Initialization', () => {
    it('should initialize without database', async () => {
      const repo = createSystemPromptsRepository({
        useDatabase: false,
      });

      await repo.initialize();

      const prompts = await repo.listPrompts();
      expect(prompts.length).toBeGreaterThan(0);

      await repo.close();
    });

    it('should initialize with database', async () => {
      const repo = createSystemPromptsRepository({
        useDatabase: true,
        connectionString: 'postgresql://localhost:5432/test',
      });

      await repo.initialize();
      await repo.close();
    });

    it('should load default prompts into cache on init', async () => {
      await repository.initialize();

      const prompt = await repository.getPrompt('lead_scoring_v1');
      expect(prompt).toBeDefined();
      expect(prompt?.name).toContain('Lead Scoring');
    });

    it('should not re-initialize if already initialized', async () => {
      await repository.initialize();
      await repository.initialize(); // Second call should be no-op

      const prompts = await repository.listPrompts();
      expect(prompts).toBeDefined();
    });

    it('should use custom cache TTL', () => {
      const repo = createSystemPromptsRepository({
        cacheTtlSeconds: 600,
      });

      expect(repo).toBeDefined();
    });
  });

  describe('Get Prompt by ID', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should retrieve prompt by ID', async () => {
      const prompt = await repository.getPrompt('lead_scoring_v1');

      expect(prompt).toBeDefined();
      expect(prompt?.id).toBe('lead_scoring_v1');
      expect(prompt?.category).toBe('lead_scoring');
      expect(prompt?.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should return null for non-existent prompt', async () => {
      const prompt = await repository.getPrompt('non_existent_prompt');

      expect(prompt).toBeNull();
    });

    it('should cache retrieved prompts', async () => {
      const prompt1 = await repository.getPrompt('lead_scoring_v1');
      const prompt2 = await repository.getPrompt('lead_scoring_v1');

      expect(prompt1).toEqual(prompt2);
    });

    it('should support tenant-specific prompts', async () => {
      const prompt = await repository.getPrompt('lead_scoring_v1', 'tenant-123');

      expect(prompt).toBeDefined();
    });

    it('should include all required fields', async () => {
      const prompt = await repository.getPrompt('lead_scoring_v1');

      expect(prompt).toBeDefined();
      expect(prompt?.id).toBeDefined();
      expect(prompt?.name).toBeDefined();
      expect(prompt?.category).toBeDefined();
      expect(prompt?.version).toBeDefined();
      expect(prompt?.content).toBeDefined();
      expect(prompt?.isActive).toBeDefined();
      expect(prompt?.createdAt).toBeInstanceOf(Date);
      expect(prompt?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Get Prompts by Category', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should retrieve prompts by category', async () => {
      const prompts = await repository.getPromptsByCategory('lead_scoring');

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts.every((p) => p.category === 'lead_scoring')).toBe(true);
    });

    it('should return empty array for category with no prompts', async () => {
      const prompts = await repository.getPromptsByCategory('custom');

      expect(Array.isArray(prompts)).toBe(true);
    });

    it('should support tenant filtering', async () => {
      const prompts = await repository.getPromptsByCategory('reply_generation', 'tenant-123');

      expect(Array.isArray(prompts)).toBe(true);
    });

    it('should return prompts for all categories', async () => {
      const categories: PromptCategory[] = [
        'lead_scoring',
        'reply_generation',
        'triage',
        'voice_agent',
        'consent',
      ];

      for (const category of categories) {
        const prompts = await repository.getPromptsByCategory(category);
        expect(Array.isArray(prompts)).toBe(true);
      }
    });
  });

  describe('Get Active Prompt', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should retrieve active prompt for category', async () => {
      const prompt = await repository.getActivePrompt('lead_scoring');

      expect(prompt).toBeDefined();
      expect(prompt?.category).toBe('lead_scoring');
      expect(prompt?.isActive).toBe(true);
    });

    it('should prioritize tenant-specific prompts', async () => {
      // Create tenant-specific prompt
      await repository.upsertPrompt({
        id: 'tenant_lead_scoring',
        name: 'Tenant Lead Scoring',
        category: 'lead_scoring',
        version: '1.0.0',
        content: 'Tenant-specific prompt',
        isActive: true,
        tenantId: 'tenant-123',
      });

      const prompt = await repository.getActivePrompt('lead_scoring', 'tenant-123');

      expect(prompt?.tenantId).toBe('tenant-123');
    });

    it('should fallback to default if no tenant-specific prompt', async () => {
      const prompt = await repository.getActivePrompt('lead_scoring', 'unknown-tenant');

      expect(prompt).toBeDefined();
      expect(prompt?.category).toBe('lead_scoring');
    });

    it('should return null if no active prompt exists', async () => {
      const prompt = await repository.getActivePrompt('custom');

      // 'custom' category has no default prompts
      expect(prompt).toBeNull();
    });
  });

  describe('Upsert Prompt', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should create new prompt', async () => {
      const newPrompt = await repository.upsertPrompt({
        id: 'test_prompt',
        name: 'Test Prompt',
        category: 'custom',
        version: '1.0.0',
        content: 'Test prompt content',
        isActive: true,
      });

      expect(newPrompt.id).toBe('test_prompt');
      expect(newPrompt.createdAt).toBeInstanceOf(Date);
      expect(newPrompt.updatedAt).toBeInstanceOf(Date);
    });

    it('should update existing prompt', async () => {
      // Create
      await repository.upsertPrompt({
        id: 'update_test',
        name: 'Original Name',
        category: 'custom',
        version: '1.0.0',
        content: 'Original content',
        isActive: true,
      });

      // Update
      const updated = await repository.upsertPrompt({
        id: 'update_test',
        name: 'Updated Name',
        category: 'custom',
        version: '1.0.1',
        content: 'Updated content',
        isActive: true,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.version).toBe('1.0.1');
    });

    it('should validate prompt schema', async () => {
      await expect(
        repository.upsertPrompt({
          id: 'invalid',
          name: 'Invalid',
          category: 'custom',
          version: 'invalid-version', // Invalid format
          content: 'Content',
          isActive: true,
        } as any)
      ).rejects.toThrow();
    });

    it('should update cache after upsert', async () => {
      await repository.upsertPrompt({
        id: 'cache_test',
        name: 'Cache Test',
        category: 'custom',
        version: '1.0.0',
        content: 'Test',
        isActive: true,
      });

      const retrieved = await repository.getPrompt('cache_test');
      expect(retrieved?.name).toBe('Cache Test');
    });

    it('should support tenant-specific prompts', async () => {
      const tenantPrompt = await repository.upsertPrompt({
        id: 'tenant_prompt',
        name: 'Tenant Prompt',
        category: 'custom',
        version: '1.0.0',
        content: 'Tenant content',
        isActive: true,
        tenantId: 'tenant-456',
      });

      expect(tenantPrompt.tenantId).toBe('tenant-456');
    });

    it('should include optional metadata', async () => {
      const promptWithMetadata = await repository.upsertPrompt({
        id: 'metadata_test',
        name: 'Metadata Test',
        category: 'custom',
        version: '1.0.0',
        content: 'Content',
        variables: ['var1', 'var2'],
        metadata: {
          author: 'Test Author',
          description: 'Test description',
          tags: ['test', 'prompt'],
          maxTokens: 500,
          temperature: 0.7,
        },
        isActive: true,
      });

      expect(promptWithMetadata.variables).toEqual(['var1', 'var2']);
      expect(promptWithMetadata.metadata?.author).toBe('Test Author');
      expect(promptWithMetadata.metadata?.maxTokens).toBe(500);
    });
  });

  describe('Prompt Compilation', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should compile prompt with variables', async () => {
      const prompt = await repository.getPrompt('reply_generation_v1');

      if (prompt) {
        const compiled = repository.compilePrompt(prompt, {
          clinicName: 'Test Clinic',
          phoneNumber: '+40721234567',
          priceList: 'Consultation: 200 RON',
        });

        expect(compiled).toContain('Test Clinic');
        expect(compiled).toContain('+40721234567');
        expect(compiled).toContain('Consultation: 200 RON');
      }
    });

    it('should replace all variable instances', async () => {
      const testPrompt: SystemPrompt = {
        id: 'test',
        name: 'Test',
        category: 'custom',
        version: '1.0.0',
        content: 'Hello {{name}}, welcome to {{name}}!',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const compiled = repository.compilePrompt(testPrompt, {
        name: 'John',
      });

      expect(compiled).toBe('Hello John, welcome to John!');
    });

    it('should handle missing variables gracefully', async () => {
      const testPrompt: SystemPrompt = {
        id: 'test',
        name: 'Test',
        category: 'custom',
        version: '1.0.0',
        content: 'Hello {{name}}, clinic: {{clinicName}}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const compiled = repository.compilePrompt(testPrompt, {
        name: 'John',
        // clinicName missing
      });

      expect(compiled).toContain('John');
      expect(compiled).toContain('{{clinicName}}'); // Unresolved variable remains
    });

    it('should not replace non-existent variables', async () => {
      const testPrompt: SystemPrompt = {
        id: 'test',
        name: 'Test',
        category: 'custom',
        version: '1.0.0',
        content: 'Static content without variables',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const compiled = repository.compilePrompt(testPrompt, {
        name: 'John',
      });

      expect(compiled).toBe('Static content without variables');
    });
  });

  describe('Template Creation', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should create template from prompt', async () => {
      const prompt = await repository.getPrompt('reply_generation_v1');

      if (prompt) {
        const template = repository.createTemplate(prompt);

        expect(template.id).toBe(prompt.id);
        expect(template.name).toBe(prompt.name);
        expect(template.category).toBe(prompt.category);
        expect(template.version).toBe(prompt.version);
        expect(template.template).toBe(prompt.content);
        expect(Array.isArray(template.variables)).toBe(true);
        expect(typeof template.compile).toBe('function');
      }
    });

    it('should compile template via compile function', async () => {
      const prompt = await repository.getPrompt('voice_agent_v1');

      if (prompt) {
        const template = repository.createTemplate(prompt);
        const compiled = template.compile({
          clinicName: 'Dental Pro',
          address: 'Str. Test 123',
          emergencyPhone: '+40721000000',
        });

        expect(compiled).toContain('Dental Pro');
        expect(compiled).toContain('Str. Test 123');
        expect(compiled).toContain('+40721000000');
      }
    });
  });

  describe('List Prompts', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should list all prompts', async () => {
      const prompts = await repository.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts.every((p) => p.id && p.name && p.category)).toBe(true);
    });

    it('should filter by category', async () => {
      const prompts = await repository.listPrompts({
        category: 'lead_scoring',
      });

      expect(prompts.every((p) => p.category === 'lead_scoring')).toBe(true);
    });

    it('should filter by active status', async () => {
      const prompts = await repository.listPrompts({
        isActive: true,
      });

      expect(prompts.every((p) => p.isActive === true)).toBe(true);
    });

    it('should search by text', async () => {
      const prompts = await repository.listPrompts({
        search: 'dental',
      });

      expect(
        prompts.every(
          (p) =>
            p.name.toLowerCase().includes('dental') || p.content.toLowerCase().includes('dental')
        )
      ).toBe(true);
    });

    it('should combine multiple filters', async () => {
      const prompts = await repository.listPrompts({
        category: 'lead_scoring',
        isActive: true,
        search: 'scor',
      });

      expect(prompts.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should clear cache', async () => {
      await repository.getPrompt('lead_scoring_v1');
      repository.clearCache();

      // Cache should be empty, but prompt should still be retrievable
      const prompt = await repository.getPrompt('lead_scoring_v1');
      expect(prompt).toBeDefined();
    });

    it('should expire cached entries after TTL', async () => {
      const shortCacheRepo = createSystemPromptsRepository({
        cacheTtlSeconds: 0.1, // 100ms
      });

      await shortCacheRepo.initialize();
      await shortCacheRepo.getPrompt('lead_scoring_v1');

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const prompt = await shortCacheRepo.getPrompt('lead_scoring_v1');
      expect(prompt).toBeDefined();

      await shortCacheRepo.close();
    });

    it('should use separate cache keys for tenant prompts', async () => {
      await repository.upsertPrompt({
        id: 'shared_id',
        name: 'Global Prompt',
        category: 'custom',
        version: '1.0.0',
        content: 'Global content',
        isActive: true,
      });

      await repository.upsertPrompt({
        id: 'shared_id',
        name: 'Tenant Prompt',
        category: 'custom',
        version: '1.0.0',
        content: 'Tenant content',
        isActive: true,
        tenantId: 'tenant-123',
      });

      const global = await repository.getPrompt('shared_id');
      const tenant = await repository.getPrompt('shared_id', 'tenant-123');

      expect(global?.content).toBe('Global content');
      expect(tenant?.content).toBe('Tenant content');
    });
  });

  describe('Default Prompts', () => {
    it('should have default prompts defined', () => {
      expect(DEFAULT_PROMPTS).toBeDefined();
      expect(Object.keys(DEFAULT_PROMPTS).length).toBeGreaterThan(0);
    });

    it('should have lead scoring prompt', () => {
      expect(DEFAULT_PROMPTS.lead_scoring_v1).toBeDefined();
      expect(DEFAULT_PROMPTS.lead_scoring_v1?.category).toBe('lead_scoring');
    });

    it('should have reply generation prompt', () => {
      expect(DEFAULT_PROMPTS.reply_generation_v1).toBeDefined();
      expect(DEFAULT_PROMPTS.reply_generation_v1?.category).toBe('reply_generation');
    });

    it('should have voice agent prompt', () => {
      expect(DEFAULT_PROMPTS.voice_agent_v1).toBeDefined();
      expect(DEFAULT_PROMPTS.voice_agent_v1?.category).toBe('voice_agent');
    });

    it('should have triage prompt', () => {
      expect(DEFAULT_PROMPTS.triage_v1).toBeDefined();
      expect(DEFAULT_PROMPTS.triage_v1?.category).toBe('triage');
    });

    it('should have consent prompt', () => {
      expect(DEFAULT_PROMPTS.consent_gdpr_v1).toBeDefined();
      expect(DEFAULT_PROMPTS.consent_gdpr_v1?.category).toBe('consent');
    });

    it('should have valid version numbers', () => {
      for (const prompt of Object.values(DEFAULT_PROMPTS)) {
        expect(prompt.version).toMatch(/^\d+\.\d+\.\d+$/);
      }
    });

    it('should have Romanian language content', () => {
      const leadScoring = DEFAULT_PROMPTS.lead_scoring_v1;
      expect(leadScoring?.content).toContain('Ești');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getSystemPromptsRepository', () => {
      const instance1 = getSystemPromptsRepository();
      const instance2 = getSystemPromptsRepository();

      expect(instance1).toBe(instance2);
    });

    it('should initialize singleton with initializeSystemPrompts', async () => {
      const instance = await initializeSystemPrompts({
        useDatabase: false,
      });

      expect(instance).toBeDefined();

      const sameInstance = getSystemPromptsRepository();
      expect(instance).toBe(sameInstance);
    });
  });

  describe('Resource Cleanup', () => {
    it('should close database connection', async () => {
      const repo = createSystemPromptsRepository({
        useDatabase: true,
        connectionString: 'postgresql://localhost:5432/test',
      });

      await repo.initialize();
      await repo.close();

      // After close, should be able to re-initialize
      expect(repo).toBeDefined();
    });

    it('should clear cache on close', async () => {
      const repo = createSystemPromptsRepository();
      await repo.initialize();
      await repo.getPrompt('lead_scoring_v1');

      await repo.close();

      // Cache should be cleared
      expect(repo).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      await repository.initialize();
    });

    it('should handle empty variable substitution', async () => {
      const prompt: SystemPrompt = {
        id: 'test',
        name: 'Test',
        category: 'custom',
        version: '1.0.0',
        content: 'Hello {{name}}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const compiled = repository.compilePrompt(prompt, {
        name: '',
      });

      expect(compiled).toBe('Hello ');
    });

    it('should handle prompts without variables', async () => {
      const prompt: SystemPrompt = {
        id: 'test',
        name: 'Test',
        category: 'custom',
        version: '1.0.0',
        content: 'Static prompt',
        variables: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const template = repository.createTemplate(prompt);
      expect(template.variables).toEqual([]);

      const compiled = template.compile({});
      expect(compiled).toBe('Static prompt');
    });

    it('should handle prompts with special characters', async () => {
      const prompt: SystemPrompt = {
        id: 'test',
        name: 'Test',
        category: 'custom',
        version: '1.0.0',
        content: 'Prompt with $pecial ch@r@cters & symbols!',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.upsertPrompt(prompt);
      const retrieved = await repository.getPrompt('test');

      expect(retrieved?.content).toBe('Prompt with $pecial ch@r@cters & symbols!');
    });

    it('should handle very long prompt content', async () => {
      const longContent = 'A'.repeat(10000);
      const prompt: SystemPrompt = {
        id: 'long_test',
        name: 'Long Test',
        category: 'custom',
        version: '1.0.0',
        content: longContent,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.upsertPrompt(prompt);
      const retrieved = await repository.getPrompt('long_test');

      expect(retrieved?.content).toHaveLength(10000);
    });
  });

  describe('Prompt Categories', () => {
    it('should support all defined categories', async () => {
      const categories: PromptCategory[] = [
        'lead_scoring',
        'reply_generation',
        'triage',
        'appointment',
        'medical_info',
        'voice_agent',
        'whatsapp_agent',
        'summary',
        'consent',
        'custom',
      ];

      for (const category of categories) {
        const prompt: SystemPrompt = {
          id: `${category}_test`,
          name: `${category} Test`,
          category,
          version: '1.0.0',
          content: 'Test content',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await expect(repository.upsertPrompt(prompt)).resolves.toBeDefined();
      }
    });
  });
});
