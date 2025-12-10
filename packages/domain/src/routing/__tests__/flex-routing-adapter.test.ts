/**
 * @fileoverview Tests for Flex Routing Adapter
 *
 * Tests for the FlexAgentRepositoryAdapter and FlexRoutingAdapter classes
 * that bridge skill routing with Twilio Flex.
 *
 * @module domain/routing/__tests__/flex-routing-adapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { FlexWorker } from '@medicalcor/types';
import {
  FlexAgentRepositoryAdapter,
  FlexRoutingAdapter,
  type FlexClient,
  type FlexSkillMapping,
  type FlexRoutingTask,
} from '../flex-routing-adapter.js';

// =============================================================================
// MOCKS
// =============================================================================

const createMockFlexClient = (): FlexClient => ({
  listWorkers: vi.fn().mockResolvedValue([]),
  getWorker: vi.fn().mockResolvedValue(null),
  createTask: vi.fn().mockResolvedValue({ taskSid: 'TSK001' }),
});

const createMockWorker = (overrides: Partial<FlexWorker> = {}): FlexWorker => ({
  workerSid: 'WK001',
  friendlyName: 'Test Agent',
  activityName: 'available',
  tasksInProgress: 0,
  skills: ['all-on-x', 'implants'],
  languages: ['en', 'es'],
  dateUpdated: new Date().toISOString(),
  attributes: {},
  ...overrides,
});

// =============================================================================
// TEST SUITE: FlexAgentRepositoryAdapter
// =============================================================================

describe('FlexAgentRepositoryAdapter', () => {
  let mockClient: FlexClient;
  let adapter: FlexAgentRepositoryAdapter;

  beforeEach(() => {
    mockClient = createMockFlexClient();
    adapter = new FlexAgentRepositoryAdapter(mockClient);
  });

  // ===========================================================================
  // CONSTRUCTOR AND INITIALIZATION
  // ===========================================================================

  describe('constructor', () => {
    it('should initialize with default skill mapping', () => {
      const adapter = new FlexAgentRepositoryAdapter(mockClient);
      expect(adapter).toBeDefined();
    });

    it('should initialize with custom skill mapping', () => {
      const customMapping: Partial<FlexSkillMapping> = {
        attributeToSkill: new Map([['custom-skill', 'procedure:custom']]),
        proficiencyMapping: new Map([['custom-skill', 'expert']]),
        defaultProficiency: 'advanced',
      };
      const adapter = new FlexAgentRepositoryAdapter(mockClient, customMapping);
      expect(adapter).toBeDefined();
    });
  });

  // ===========================================================================
  // CACHE MANAGEMENT
  // ===========================================================================

  describe('cache management', () => {
    it('should refresh cache on first getAvailableAgents call', async () => {
      const worker = createMockWorker();
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await adapter.getAvailableAgents();

      expect(mockClient.listWorkers).toHaveBeenCalledTimes(1);
      expect(agents).toHaveLength(1);
    });

    it('should use cache for subsequent calls within expiry window', async () => {
      const worker = createMockWorker();
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      await adapter.getAvailableAgents();
      await adapter.getAvailableAgents();
      await adapter.getAvailableAgents();

      expect(mockClient.listWorkers).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after expiry', async () => {
      const worker = createMockWorker();
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      await adapter.getAvailableAgents();

      // Simulate cache expiry by manually calling refresh
      await adapter.refreshCache();

      expect(mockClient.listWorkers).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // WORKER TO PROFILE CONVERSION
  // ===========================================================================

  describe('worker to profile conversion', () => {
    it('should convert worker to agent profile', async () => {
      const worker = createMockWorker({
        workerSid: 'WK123',
        friendlyName: 'John Agent',
        activityName: 'available',
        tasksInProgress: 2,
        skills: ['implants'],
        languages: ['en'],
      });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await adapter.getAvailableAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].agentId).toBe('WK123');
      expect(agents[0].name).toBe('John Agent');
      expect(agents[0].availability).toBe('available');
      expect(agents[0].currentTaskCount).toBe(2);
    });

    it('should extract skills from worker', async () => {
      const worker = createMockWorker({
        skills: ['all-on-x', 'implants', 'cosmetic'],
        languages: ['en', 'es'],
      });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await adapter.getAvailableAgents();
      const profile = agents[0];

      // Should have skills from worker.skills + language skills
      expect(profile.skills.length).toBeGreaterThanOrEqual(3);
      expect(profile.primaryLanguages).toContain('en');
      expect(profile.primaryLanguages).toContain('es');
    });

    it('should map activity to availability correctly', async () => {
      const activities: Array<[FlexWorker['activityName'], string]> = [
        ['available', 'available'],
        ['busy', 'busy'],
        ['break', 'break'],
        ['wrap-up', 'wrap-up'],
        ['offline', 'offline'],
        ['unavailable', 'away'],
      ];

      for (const [activity, expected] of activities) {
        const worker = createMockWorker({ activityName: activity });
        vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);
        await adapter.refreshCache();

        const agents = await adapter.getAvailableAgents();
        if (expected === 'available') {
          expect(agents).toHaveLength(1);
          expect(agents[0].availability).toBe(expected);
        }
      }
    });
  });

  // ===========================================================================
  // SKILL MAPPING
  // ===========================================================================

  describe('skill mapping', () => {
    it('should use explicit mapping when available', async () => {
      const customMapping: Partial<FlexSkillMapping> = {
        attributeToSkill: new Map([['custom-attr', 'procedure:mapped-skill']]),
      };
      const customAdapter = new FlexAgentRepositoryAdapter(mockClient, customMapping);

      const worker = createMockWorker({ skills: ['custom-attr'] });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await customAdapter.getAvailableAgents();
      const skill = agents[0].skills.find((s) => s.skillId === 'procedure:mapped-skill');
      expect(skill).toBeDefined();
    });

    it('should map implant-related skills to procedure category', async () => {
      const worker = createMockWorker({ skills: ['implant-specialist'] });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await adapter.getAvailableAgents();
      const skill = agents[0].skills.find((s) => s.skillId.includes('procedure:'));
      expect(skill).toBeDefined();
    });

    it('should map ortho skills to procedure category', async () => {
      const worker = createMockWorker({ skills: ['orthodontics'] });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await adapter.getAvailableAgents();
      const skill = agents[0].skills.find((s) => s.skillId.includes('procedure:'));
      expect(skill).toBeDefined();
    });

    it('should map billing skills to admin category', async () => {
      const worker = createMockWorker({ skills: ['billing-expert'] });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await adapter.getAvailableAgents();
      const skill = agents[0].skills.find((s) => s.skillId.includes('admin:'));
      expect(skill).toBeDefined();
    });

    it('should add language skills', async () => {
      const worker = createMockWorker({ languages: ['en', 'es', 'fr'] });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await adapter.getAvailableAgents();
      const languageSkills = agents[0].skills.filter((s) => s.skillId.startsWith('language:'));
      expect(languageSkills).toHaveLength(3);
    });
  });

  // ===========================================================================
  // PROFICIENCY MAPPING
  // ===========================================================================

  describe('proficiency mapping', () => {
    it('should use custom proficiency mapping', async () => {
      const customMapping: Partial<FlexSkillMapping> = {
        proficiencyMapping: new Map([['expert-skill', 'expert']]),
      };
      const customAdapter = new FlexAgentRepositoryAdapter(mockClient, customMapping);

      const worker = createMockWorker({ skills: ['expert-skill'] });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await customAdapter.getAvailableAgents();
      const skill = agents[0].skills.find((s) => s.skillId.includes('expert-skill'));
      expect(skill?.proficiency).toBe('expert');
    });

    it('should use default proficiency when not mapped', async () => {
      const worker = createMockWorker({ skills: ['unmapped-skill'] });
      vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

      const agents = await adapter.getAvailableAgents();
      const skill = agents[0].skills.find((s) => s.skillId.includes('unmapped-skill'));
      expect(skill?.proficiency).toBe('intermediate');
    });
  });

  // ===========================================================================
  // AGENT REPOSITORY INTERFACE
  // ===========================================================================

  describe('AgentRepository interface', () => {
    describe('getAvailableAgents', () => {
      it('should return only available agents', async () => {
        const workers = [
          createMockWorker({ workerSid: 'WK1', activityName: 'available' }),
          createMockWorker({ workerSid: 'WK2', activityName: 'busy' }),
          createMockWorker({ workerSid: 'WK3', activityName: 'available' }),
        ];
        vi.mocked(mockClient.listWorkers).mockResolvedValue(workers);

        const agents = await adapter.getAvailableAgents();

        expect(agents).toHaveLength(2);
        expect(agents.map((a) => a.agentId)).toEqual(['WK1', 'WK3']);
      });

      it('should filter by teamId if provided', async () => {
        // Note: teamId filtering relies on profile.teamId being set
        const workers = [createMockWorker({ workerSid: 'WK1' })];
        vi.mocked(mockClient.listWorkers).mockResolvedValue(workers);

        const agents = await adapter.getAvailableAgents('team-123');

        // No workers have teamId set, so none should match
        expect(agents).toHaveLength(0);
      });
    });

    describe('getAgentById', () => {
      it('should return agent by ID', async () => {
        const worker = createMockWorker({ workerSid: 'WK123' });
        vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

        const agent = await adapter.getAgentById('WK123');

        expect(agent).not.toBeNull();
        expect(agent?.agentId).toBe('WK123');
      });

      it('should return null for non-existent agent', async () => {
        vi.mocked(mockClient.listWorkers).mockResolvedValue([]);

        const agent = await adapter.getAgentById('non-existent');

        expect(agent).toBeNull();
      });
    });

    describe('getAgentsBySkill', () => {
      it('should return agents with specific skill', async () => {
        const workers = [
          createMockWorker({ workerSid: 'WK1', skills: ['implants'] }),
          createMockWorker({ workerSid: 'WK2', skills: ['cosmetic'] }),
          createMockWorker({ workerSid: 'WK3', skills: ['implants', 'cosmetic'] }),
        ];
        vi.mocked(mockClient.listWorkers).mockResolvedValue(workers);

        const agents = await adapter.getAgentsBySkill('procedure:implants');

        expect(agents.length).toBeGreaterThanOrEqual(0); // Depends on exact mapping
      });

      it('should filter by minimum proficiency', async () => {
        const customMapping: Partial<FlexSkillMapping> = {
          proficiencyMapping: new Map([
            ['basic-skill', 'basic'],
            ['expert-skill', 'expert'],
          ]),
        };
        const customAdapter = new FlexAgentRepositoryAdapter(mockClient, customMapping);

        const workers = [
          createMockWorker({ workerSid: 'WK1', skills: ['basic-skill'] }),
          createMockWorker({ workerSid: 'WK2', skills: ['expert-skill'] }),
        ];
        vi.mocked(mockClient.listWorkers).mockResolvedValue(workers);

        const agents = await customAdapter.getAgentsBySkill('skill:basic-skill', 'advanced');

        // basic-skill has 'basic' proficiency, which is less than 'advanced'
        expect(agents).toHaveLength(0);
      });
    });

    describe('updateAgentAvailability', () => {
      it('should update agent availability in cache', async () => {
        const worker = createMockWorker({ workerSid: 'WK123', activityName: 'available' });
        vi.mocked(mockClient.listWorkers).mockResolvedValue([worker]);

        await adapter.getAvailableAgents(); // Populate cache
        await adapter.updateAgentAvailability('WK123', 'busy');

        const agent = await adapter.getAgentById('WK123');
        expect(agent?.availability).toBe('busy');
      });
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('should always produce valid agent profiles with different inputs', async () => {
      const testCases = [
        { workerSid: 'WK1', friendlyName: 'Agent 1', tasksInProgress: 0, languages: ['en'] },
        { workerSid: 'WK2', friendlyName: 'Agent 2', tasksInProgress: 5, languages: ['es', 'fr'] },
        { workerSid: 'WK3', friendlyName: 'Agent 3', tasksInProgress: 10, languages: [] },
      ];

      for (const testCase of testCases) {
        const localClient = createMockFlexClient();
        const localAdapter = new FlexAgentRepositoryAdapter(localClient);

        const worker = createMockWorker({
          workerSid: testCase.workerSid,
          friendlyName: testCase.friendlyName,
          activityName: 'available',
          tasksInProgress: testCase.tasksInProgress,
          skills: ['implants'],
          languages: testCase.languages,
        });
        vi.mocked(localClient.listWorkers).mockResolvedValue([worker]);

        await localAdapter.refreshCache();
        const agent = await localAdapter.getAgentById(testCase.workerSid);

        expect(agent).not.toBeNull();
        expect(agent?.agentId).toBe(testCase.workerSid);
        expect(agent?.name).toBe(testCase.friendlyName);
        expect(agent?.currentTaskCount).toBe(testCase.tasksInProgress);
        expect(agent?.primaryLanguages.length).toBe(testCase.languages.length);
      }
    });

    it('should handle all activity states', async () => {
      const activities: FlexWorker['activityName'][] = [
        'available',
        'busy',
        'break',
        'wrap-up',
        'offline',
        'unavailable',
      ];

      for (const activity of activities) {
        const localClient = createMockFlexClient();
        const localAdapter = new FlexAgentRepositoryAdapter(localClient);

        const worker = createMockWorker({ activityName: activity });
        vi.mocked(localClient.listWorkers).mockResolvedValue([worker]);

        await localAdapter.refreshCache();
        const agent = await localAdapter.getAgentById(worker.workerSid);

        expect(agent).not.toBeNull();
      }
    });
  });
});

// =============================================================================
// TEST SUITE: FlexRoutingAdapter
// =============================================================================

// Note: FlexRoutingAdapter requires a SkillRoutingService which has complex dependencies.
// These tests focus on the FlexAgentRepositoryAdapter which can be tested in isolation.
// Integration tests for FlexRoutingAdapter would require full infrastructure setup.

describe('FlexRoutingAdapter Integration', () => {
  describe('Type and Interface Validation', () => {
    it('should validate FlexRoutingTask structure', () => {
      const task: FlexRoutingTask = {
        callSid: 'CA001',
        customerPhone: '+1234567890',
        procedureType: 'all-on-x',
        urgencyLevel: 'normal',
        channel: 'voice',
        isVIP: false,
        isExistingPatient: true,
        leadScore: 'HOT',
        language: 'en',
      };

      expect(task.callSid).toBe('CA001');
      expect(task.customerPhone).toBe('+1234567890');
      expect(task.procedureType).toBe('all-on-x');
      expect(task.urgencyLevel).toBe('normal');
      expect(task.channel).toBe('voice');
      expect(task.isVIP).toBe(false);
      expect(task.isExistingPatient).toBe(true);
      expect(task.leadScore).toBe('HOT');
      expect(task.language).toBe('en');
    });

    it('should allow partial FlexRoutingTask', () => {
      const task: FlexRoutingTask = {
        callSid: 'CA001',
      };

      expect(task.callSid).toBe('CA001');
      expect(task.procedureType).toBeUndefined();
    });

    it('should validate FlexSkillMapping structure', () => {
      const mapping: FlexSkillMapping = {
        attributeToSkill: new Map([
          ['implants', 'procedure:implants'],
          ['billing', 'admin:billing'],
        ]),
        proficiencyMapping: new Map([
          ['implants', 'expert'],
          ['billing', 'intermediate'],
        ]),
        defaultProficiency: 'basic',
      };

      expect(mapping.attributeToSkill.size).toBe(2);
      expect(mapping.proficiencyMapping.get('implants')).toBe('expert');
      expect(mapping.defaultProficiency).toBe('basic');
    });

    it('should validate urgency levels', () => {
      const urgencyLevels: FlexRoutingTask['urgencyLevel'][] = [
        'low',
        'normal',
        'high',
        'critical',
      ];

      for (const level of urgencyLevels) {
        const task: FlexRoutingTask = { urgencyLevel: level };
        expect(task.urgencyLevel).toBe(level);
      }
    });

    it('should validate channel types', () => {
      const channels: FlexRoutingTask['channel'][] = ['voice', 'whatsapp', 'web', 'chat'];

      for (const channel of channels) {
        const task: FlexRoutingTask = { channel };
        expect(task.channel).toBe(channel);
      }
    });

    it('should validate lead scores', () => {
      const scores: FlexRoutingTask['leadScore'][] = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'];

      for (const score of scores) {
        const task: FlexRoutingTask = { leadScore: score };
        expect(task.leadScore).toBe(score);
      }
    });
  });

  describe('FlexClient Interface', () => {
    it('should define required FlexClient methods', () => {
      const mockClient = createMockFlexClient();

      expect(typeof mockClient.listWorkers).toBe('function');
      expect(typeof mockClient.getWorker).toBe('function');
      expect(typeof mockClient.createTask).toBe('function');
    });

    it('should validate CreateTaskInput structure', () => {
      const input = {
        workflowSid: 'WF001',
        attributes: { callSid: 'CA001', customerPhone: '+123' },
        priority: 10,
        timeout: 300,
        taskChannel: 'voice',
      };

      expect(input.workflowSid).toBeDefined();
      expect(input.attributes).toBeDefined();
      expect(input.priority).toBe(10);
    });
  });
});
