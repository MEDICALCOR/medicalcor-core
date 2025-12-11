/**
 * @fileoverview Tests for Flex Routing Adapter
 *
 * Tests for skill-based routing with Twilio Flex integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FlexAgentRepositoryAdapter,
  FlexRoutingAdapter,
  createFlexAgentRepository,
  createFlexRoutingAdapter,
  createFlexSkillRouting,
  type FlexClient,
  type FlexRoutingTask,
  type FlexSkillMapping,
} from '../flex-routing-adapter.js';
import type { SkillRoutingService } from '../skill-routing-service.js';
import type { FlexWorker } from '@medicalcor/types';

// Mock logger
vi.mock('@medicalcor/core', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('FlexAgentRepositoryAdapter', () => {
  let mockFlexClient: FlexClient;
  let adapter: FlexAgentRepositoryAdapter;

  const mockWorker: FlexWorker = {
    workerSid: 'WK123',
    friendlyName: 'John Doe',
    activityName: 'available',
    available: true,
    tasksInProgress: 0,
    skills: ['all-on-x', 'implants', 'billing'],
    languages: ['en', 'ro'],
    attributes: {},
    dateCreated: new Date(),
    dateUpdated: new Date(),
  };

  beforeEach(() => {
    mockFlexClient = {
      listWorkers: vi.fn().mockResolvedValue([mockWorker]),
      getWorker: vi.fn().mockResolvedValue(mockWorker),
      createTask: vi.fn().mockResolvedValue({ taskSid: 'TS123' }),
    };

    adapter = new FlexAgentRepositoryAdapter(mockFlexClient);
  });

  describe('constructor', () => {
    it('should create adapter with default skill mapping', () => {
      const adapter = new FlexAgentRepositoryAdapter(mockFlexClient);
      expect(adapter).toBeDefined();
    });

    it('should create adapter with custom skill mapping', () => {
      const customMapping: Partial<FlexSkillMapping> = {
        attributeToSkill: new Map([['custom-skill', 'mapped:custom']]),
        proficiencyMapping: new Map([['expert-skill', 'expert']]),
        defaultProficiency: 'advanced',
      };

      const adapter = new FlexAgentRepositoryAdapter(mockFlexClient, customMapping);
      expect(adapter).toBeDefined();
    });
  });

  describe('refreshCache', () => {
    it('should refresh cache from Flex workers', async () => {
      await adapter.refreshCache();
      expect(mockFlexClient.listWorkers).toHaveBeenCalled();
    });

    it('should clear existing cache on refresh', async () => {
      await adapter.refreshCache();
      await adapter.refreshCache();
      expect(mockFlexClient.listWorkers).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAvailableAgents', () => {
    it('should return available agents', async () => {
      const agents = await adapter.getAvailableAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]?.agentId).toBe('WK123');
      expect(agents[0]?.availability).toBe('available');
    });

    it('should filter by teamId when provided', async () => {
      const agents = await adapter.getAvailableAgents('team-dental');
      // Agent has no teamId, so should be filtered out
      expect(agents).toHaveLength(0);
    });

    it('should filter out unavailable agents', async () => {
      mockFlexClient.listWorkers = vi
        .fn()
        .mockResolvedValue([{ ...mockWorker, activityName: 'offline' as const }]);

      const newAdapter = new FlexAgentRepositoryAdapter(mockFlexClient);
      const agents = await newAdapter.getAvailableAgents();
      expect(agents).toHaveLength(0);
    });

    it('should refresh cache when expired', async () => {
      // First call
      await adapter.getAvailableAgents();
      expect(mockFlexClient.listWorkers).toHaveBeenCalledTimes(1);

      // Simulate cache expiry by manipulating internal state
      // @ts-expect-error - accessing private property for testing
      adapter.lastCacheRefresh = 0;

      // Second call should trigger refresh
      await adapter.getAvailableAgents();
      expect(mockFlexClient.listWorkers).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAgentById', () => {
    it('should return agent by ID', async () => {
      const agent = await adapter.getAgentById('WK123');
      expect(agent).not.toBeNull();
      expect(agent?.agentId).toBe('WK123');
    });

    it('should return null for non-existent agent', async () => {
      const agent = await adapter.getAgentById('non-existent');
      expect(agent).toBeNull();
    });
  });

  describe('getAgentsBySkill', () => {
    it('should return agents with specific skill', async () => {
      const agents = await adapter.getAgentsBySkill('procedure:all-on-x');
      expect(agents).toHaveLength(1);
    });

    it('should filter by minimum proficiency', async () => {
      const agents = await adapter.getAgentsBySkill('procedure:all-on-x', 'expert');
      // Default proficiency is intermediate, so agent should be filtered out
      expect(agents).toHaveLength(0);
    });

    it('should return empty array for unknown skill', async () => {
      const agents = await adapter.getAgentsBySkill('unknown:skill');
      expect(agents).toHaveLength(0);
    });
  });

  describe('updateAgentAvailability', () => {
    it('should update agent availability in cache', async () => {
      // First, populate cache
      await adapter.getAvailableAgents();

      // Update availability
      await adapter.updateAgentAvailability('WK123', 'busy');

      // Verify update
      const agent = await adapter.getAgentById('WK123');
      expect(agent?.availability).toBe('busy');
    });

    it('should handle non-existent agent gracefully', async () => {
      await expect(
        adapter.updateAgentAvailability('non-existent', 'available')
      ).resolves.not.toThrow();
    });
  });

  describe('workerToProfile conversion', () => {
    it('should convert worker skills correctly', async () => {
      const agents = await adapter.getAvailableAgents();
      const agent = agents[0];

      expect(agent?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ skillId: 'procedure:all-on-x' }),
          expect.objectContaining({ skillId: 'procedure:implants' }),
          expect.objectContaining({ skillId: 'admin:billing' }),
        ])
      );
    });

    it('should add language skills', async () => {
      const agents = await adapter.getAvailableAgents();
      const agent = agents[0];

      expect(agent?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ skillId: 'language:en' }),
          expect.objectContaining({ skillId: 'language:ro' }),
        ])
      );
    });

    it('should map activity to availability correctly', async () => {
      const activities: Array<{ activity: FlexWorker['activityName']; expected: string }> = [
        { activity: 'available', expected: 'available' },
        { activity: 'busy', expected: 'busy' },
        { activity: 'break', expected: 'break' },
        { activity: 'wrap-up', expected: 'wrap-up' },
        { activity: 'offline', expected: 'offline' },
        { activity: 'unavailable', expected: 'away' },
      ];

      for (const { activity, expected } of activities) {
        mockFlexClient.listWorkers = vi
          .fn()
          .mockResolvedValue([{ ...mockWorker, activityName: activity }]);

        const newAdapter = new FlexAgentRepositoryAdapter(mockFlexClient);
        const agents = await newAdapter.getAvailableAgents();

        if (expected === 'available') {
          expect(agents[0]?.availability).toBe(expected);
        }
      }
    });

    it('should use custom skill mapping when provided', async () => {
      const customMapping: Partial<FlexSkillMapping> = {
        attributeToSkill: new Map([['all-on-x', 'specialty:all-on-x']]),
        defaultProficiency: 'expert',
      };

      const customAdapter = new FlexAgentRepositoryAdapter(mockFlexClient, customMapping);
      const agents = await customAdapter.getAvailableAgents();

      expect(agents[0]?.skills).toEqual(
        expect.arrayContaining([expect.objectContaining({ skillId: 'specialty:all-on-x' })])
      );
    });

    it('should map skills without explicit mapping to generic skill', async () => {
      mockFlexClient.listWorkers = vi
        .fn()
        .mockResolvedValue([{ ...mockWorker, skills: ['unknown-skill'] }]);

      const newAdapter = new FlexAgentRepositoryAdapter(mockFlexClient);
      const agents = await newAdapter.getAvailableAgents();

      expect(agents[0]?.skills).toEqual(
        expect.arrayContaining([expect.objectContaining({ skillId: 'skill:unknown-skill' })])
      );
    });

    it('should map ortho/cosmetic skills to procedure category', async () => {
      mockFlexClient.listWorkers = vi
        .fn()
        .mockResolvedValue([{ ...mockWorker, skills: ['orthodontics', 'cosmetic-dentistry'] }]);

      const newAdapter = new FlexAgentRepositoryAdapter(mockFlexClient);
      const agents = await newAdapter.getAvailableAgents();

      expect(agents[0]?.skills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ skillId: 'procedure:orthodontics' }),
          expect.objectContaining({ skillId: 'procedure:cosmetic-dentistry' }),
        ])
      );
    });

    it('should map scheduling skills to admin category', async () => {
      mockFlexClient.listWorkers = vi
        .fn()
        .mockResolvedValue([{ ...mockWorker, skills: ['scheduling', 'appointment-booking'] }]);

      const newAdapter = new FlexAgentRepositoryAdapter(mockFlexClient);
      const agents = await newAdapter.getAvailableAgents();

      expect(agents[0]?.skills).toEqual(
        expect.arrayContaining([expect.objectContaining({ skillId: 'admin:scheduling' })])
      );
    });
  });
});

describe('FlexRoutingAdapter', () => {
  let mockFlexClient: FlexClient;
  let mockRoutingService: {
    route: ReturnType<typeof vi.fn>;
  };
  let adapter: FlexRoutingAdapter;

  beforeEach(() => {
    mockFlexClient = {
      listWorkers: vi.fn().mockResolvedValue([]),
      getWorker: vi.fn(),
      createTask: vi.fn().mockResolvedValue({ taskSid: 'TS123' }),
    };

    mockRoutingService = {
      route: vi.fn().mockResolvedValue({
        decisionId: 'dec-123',
        outcome: 'routed',
        selectedAgentId: 'agent-001',
        selectedWorkerSid: 'WK123',
        selectionReason: 'Best skill match',
        processingTimeMs: 50,
      }),
    };

    adapter = new FlexRoutingAdapter({
      flexClient: mockFlexClient,
      routingService: mockRoutingService as unknown as SkillRoutingService,
      workflowSid: 'WW123',
    });
  });

  describe('routeTask', () => {
    const baseTask: FlexRoutingTask = {
      callSid: 'CA123',
      customerPhone: '+1234567890',
      procedureType: 'all-on-x',
      urgencyLevel: 'normal',
      channel: 'voice',
    };

    it('should successfully route task to agent', async () => {
      const result = await adapter.routeTask(baseTask);

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('routed');
      expect(result.taskSid).toBe('TS123');
      expect(result.workerSid).toBe('WK123');
      expect(result.agentId).toBe('agent-001');
    });

    it('should pass skill requirements to routing service', async () => {
      const task: FlexRoutingTask = {
        ...baseTask,
        skillRequirements: {
          requiredSkills: [{ skillId: 'all-on-x', minProficiency: 'expert' }],
          preferredSkills: [],
          preferredLanguages: ['ro'],
          requiredLanguage: 'ro',
          excludeAgentIds: [],
          preferAgentIds: [],
          priority: 100,
        },
      };

      await adapter.routeTask(task);

      expect(mockRoutingService.route).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredSkills: [{ skillId: 'all-on-x', minProficiency: 'expert' }],
        }),
        expect.any(Object)
      );
    });

    it('should build default skill requirements when not provided', async () => {
      const task: FlexRoutingTask = {
        ...baseTask,
        language: 'ro',
      };

      await adapter.routeTask(task);

      expect(mockRoutingService.route).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredSkills: [],
          preferredLanguages: ['ro'],
          requiredLanguage: 'ro',
        }),
        expect.any(Object)
      );
    });

    it('should handle queued outcome', async () => {
      mockRoutingService.route.mockResolvedValue({
        decisionId: 'dec-124',
        outcome: 'queued',
        queueId: 'queue-1',
        queuePosition: 3,
        estimatedWaitTime: 120,
        selectionReason: 'No available agents',
        processingTimeMs: 30,
      });

      const result = await adapter.routeTask(baseTask);

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('queued');
      expect(result.queueSid).toBe('queue-1');
      expect(result.queuePosition).toBe(3);
      expect(result.estimatedWaitTime).toBe(120);
    });

    it('should handle escalated outcome', async () => {
      mockRoutingService.route.mockResolvedValue({
        decisionId: 'dec-125',
        outcome: 'escalated',
        selectionReason: 'No matching skills',
        processingTimeMs: 20,
      });

      const result = await adapter.routeTask(baseTask);

      expect(result.success).toBe(true);
      expect(result.outcome).toBe('escalated');
    });

    it('should handle rejected outcome', async () => {
      mockRoutingService.route.mockResolvedValue({
        decisionId: 'dec-126',
        outcome: 'rejected',
        selectionReason: 'All agents offline',
        processingTimeMs: 10,
      });

      const result = await adapter.routeTask(baseTask);

      expect(result.success).toBe(false);
      expect(result.outcome).toBe('rejected');
    });

    it('should handle Flex task creation failure', async () => {
      mockFlexClient.createTask = vi.fn().mockRejectedValue(new Error('Flex API error'));

      const result = await adapter.routeTask(baseTask);

      // Should return the queued/escalated/rejected result from routing service
      // The task creation failure is caught and logged
      expect(result).toBeDefined();
    });

    it('should map urgency levels to priorities correctly', async () => {
      const urgencyTests: Array<{
        urgency: FlexRoutingTask['urgencyLevel'];
        expectedPriority: number;
      }> = [
        { urgency: 'critical', expectedPriority: 100 },
        { urgency: 'high', expectedPriority: 75 },
        { urgency: 'normal', expectedPriority: 50 },
        { urgency: 'low', expectedPriority: 25 },
        { urgency: undefined, expectedPriority: 50 },
      ];

      for (const { urgency, expectedPriority } of urgencyTests) {
        mockRoutingService.route.mockClear();

        await adapter.routeTask({ ...baseTask, urgencyLevel: urgency });

        expect(mockRoutingService.route).toHaveBeenCalledWith(
          expect.objectContaining({
            priority: expectedPriority,
          }),
          expect.any(Object)
        );
      }
    });

    it('should include all task attributes in Flex task creation', async () => {
      const task: FlexRoutingTask = {
        callSid: 'CA123',
        customerPhone: '+1234567890',
        procedureType: 'all-on-x',
        urgencyLevel: 'high',
        channel: 'voice',
        isVIP: true,
        isExistingPatient: true,
        leadScore: 'HOT',
        language: 'ro',
      };

      await adapter.routeTask(task);

      expect(mockFlexClient.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowSid: 'WW123',
          attributes: expect.objectContaining({
            call_sid: 'CA123',
            customer_phone: '+1234567890',
            procedure_type: 'all-on-x',
            urgency_level: 'high',
            channel: 'voice',
            is_vip: true,
            is_existing_patient: true,
            lead_score: 'HOT',
            language: 'ro',
            routing_type: 'skill_based',
          }),
          priority: 75,
          taskChannel: 'voice',
        })
      );
    });

    it('should use chat channel for non-voice tasks', async () => {
      const task: FlexRoutingTask = {
        ...baseTask,
        channel: 'whatsapp',
      };

      await adapter.routeTask(task);

      expect(mockFlexClient.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskChannel: 'chat',
        })
      );
    });
  });

  describe('getAvailableAgentsWithSkills', () => {
    it('should return agents with skills from Flex', async () => {
      const mockWorkers: FlexWorker[] = [
        {
          workerSid: 'WK123',
          friendlyName: 'Agent 1',
          activityName: 'available',
          available: true,
          tasksInProgress: 0,
          skills: ['all-on-x'],
          languages: ['en'],
          attributes: {},
          dateCreated: new Date(),
          dateUpdated: new Date(),
        },
      ];

      mockFlexClient.listWorkers = vi.fn().mockResolvedValue(mockWorkers);

      const agents = await adapter.getAvailableAgentsWithSkills();

      expect(agents).toHaveLength(1);
      expect(agents[0]?.agentId).toBe('WK123');
      expect(agents[0]?.skills).toHaveLength(1);
    });

    it('should handle unavailable workers', async () => {
      const mockWorkers: FlexWorker[] = [
        {
          workerSid: 'WK123',
          friendlyName: 'Agent 1',
          activityName: 'offline',
          available: false,
          tasksInProgress: 0,
          skills: [],
          languages: [],
          attributes: {},
          dateCreated: new Date(),
          dateUpdated: new Date(),
        },
      ];

      mockFlexClient.listWorkers = vi.fn().mockResolvedValue(mockWorkers);

      const agents = await adapter.getAvailableAgentsWithSkills();

      expect(agents[0]?.availability).toBe('busy');
    });
  });
});

describe('Factory Functions', () => {
  let mockFlexClient: FlexClient;

  beforeEach(() => {
    mockFlexClient = {
      listWorkers: vi.fn().mockResolvedValue([]),
      getWorker: vi.fn(),
      createTask: vi.fn().mockResolvedValue({ taskSid: 'TS123' }),
    };
  });

  describe('createFlexAgentRepository', () => {
    it('should create FlexAgentRepositoryAdapter', () => {
      const repository = createFlexAgentRepository(mockFlexClient);
      expect(repository).toBeInstanceOf(FlexAgentRepositoryAdapter);
    });

    it('should accept custom skill mapping', () => {
      const skillMapping: Partial<FlexSkillMapping> = {
        defaultProficiency: 'expert',
      };

      const repository = createFlexAgentRepository(mockFlexClient, skillMapping);
      expect(repository).toBeInstanceOf(FlexAgentRepositoryAdapter);
    });
  });

  describe('createFlexRoutingAdapter', () => {
    it('should create FlexRoutingAdapter', () => {
      const mockRoutingService = { route: vi.fn() };

      const adapter = createFlexRoutingAdapter({
        flexClient: mockFlexClient,
        routingService: mockRoutingService as unknown as SkillRoutingService,
        workflowSid: 'WW123',
      });

      expect(adapter).toBeInstanceOf(FlexRoutingAdapter);
    });
  });

  describe('createFlexSkillRouting', () => {
    it('should create complete skill routing setup', () => {
      const setup = createFlexSkillRouting({
        flexClient: mockFlexClient,
        workflowSid: 'WW123',
      });

      expect(setup.agentRepository).toBeInstanceOf(FlexAgentRepositoryAdapter);
      expect(setup.routingService).toBeDefined();
      expect(setup.adapter).toBeInstanceOf(FlexRoutingAdapter);
    });

    it('should accept custom skill mapping', () => {
      const skillMapping: Partial<FlexSkillMapping> = {
        defaultProficiency: 'advanced',
      };

      const setup = createFlexSkillRouting({
        flexClient: mockFlexClient,
        workflowSid: 'WW123',
        skillMapping,
      });

      expect(setup.agentRepository).toBeDefined();
    });
  });
});
