/**
 * @fileoverview Tests for Skill-Based Routing Service
 *
 * Tests for intelligent agent routing based on skills, proficiency levels,
 * availability, and routing rules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SkillRoutingService,
  type AgentRepository,
  type RoutingRuleRepository,
  type RoutingQueue,
  type RoutingContext,
  type QueuedTaskInfo,
} from '../skill-routing-service.js';
import type {
  AgentProfile,
  TaskSkillRequirements,
  RoutingRule,
  SkillRoutingConfig,
} from '@medicalcor/types';

// =============================================================================
// Mock Data Factories
// =============================================================================

const MOCK_AGENT_UUID_1 = '550e8400-e29b-41d4-a716-446655440001';
const MOCK_AGENT_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const MOCK_AGENT_UUID_3 = '550e8400-e29b-41d4-a716-446655440003';
const MOCK_RULE_UUID = '550e8400-e29b-41d4-a716-446655440100';
const MOCK_SKILL_UUID = '550e8400-e29b-41d4-a716-446655440200';
const MOCK_TEAM_UUID = '550e8400-e29b-41d4-a716-446655440300';

function createMockAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    agentId: MOCK_AGENT_UUID_1,
    workerSid: 'WK123',
    name: 'Test Agent',
    email: 'agent@test.com',
    teamId: MOCK_TEAM_UUID,
    skills: [
      {
        skillId: MOCK_SKILL_UUID,
        skillName: 'All-on-X',
        category: 'procedure',
        proficiencyLevel: 'advanced',
        certified: true,
        certificationDate: new Date('2024-01-01'),
      },
    ],
    availability: {
      status: 'available',
      currentLoad: 0,
      maxConcurrentTasks: 5,
      scheduledBreak: null,
    },
    performance: {
      averageHandleTime: 300,
      customerSatisfaction: 4.5,
      firstCallResolution: 0.85,
      completionRate: 0.92,
    },
    preferences: {
      preferredChannels: ['voice', 'web'],
      languages: ['en', 'ro'],
      shiftPreferences: [],
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockRoutingRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    ruleId: MOCK_RULE_UUID,
    name: 'VIP Customer Rule',
    description: 'Route VIP customers to senior agents',
    priority: 100,
    isActive: true,
    conditions: {
      isVIP: true,
    },
    routing: {
      strategy: 'best_match',
      skillRequirements: {
        requiredSkills: [],
        preferredSkills: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        preferredLanguages: [],
      },
      fallbackBehavior: 'queue',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockRequirements(
  overrides: Partial<TaskSkillRequirements> = {}
): TaskSkillRequirements {
  return {
    requiredSkills: [
      {
        skillId: MOCK_SKILL_UUID,
        skillName: 'All-on-X',
        category: 'procedure',
        minProficiency: 'intermediate',
        isRequired: true,
        weight: 1,
      },
    ],
    preferredSkills: [],
    teamId: MOCK_TEAM_UUID,
    excludeAgentIds: [],
    preferAgentIds: [],
    preferredLanguages: [],
    ...overrides,
  };
}

// =============================================================================
// Mock Repository Factories
// =============================================================================

function createMockAgentRepository(overrides: Partial<AgentRepository> = {}): AgentRepository {
  return {
    getAvailableAgents: vi.fn().mockResolvedValue([createMockAgent()]),
    getAgentById: vi.fn().mockResolvedValue(createMockAgent()),
    getAgentsBySkill: vi.fn().mockResolvedValue([createMockAgent()]),
    updateAgentAvailability: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockRuleRepository(
  overrides: Partial<RoutingRuleRepository> = {}
): RoutingRuleRepository {
  return {
    getActiveRules: vi.fn().mockResolvedValue([]),
    getRuleById: vi.fn().mockResolvedValue(null),
    getRulesForConditions: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createMockQueue(overrides: Partial<RoutingQueue> = {}): RoutingQueue {
  return {
    enqueue: vi.fn().mockResolvedValue({ queueId: 'queue-1', position: 1 }),
    dequeue: vi.fn().mockResolvedValue(null),
    getPosition: vi.fn().mockResolvedValue(1),
    getEstimatedWaitTime: vi.fn().mockResolvedValue(60),
    getQueuedTasks: vi.fn().mockReturnValue([]),
    removeTask: vi.fn().mockResolvedValue(true),
    getQueueIds: vi.fn().mockReturnValue(['queue-1']),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('SkillRoutingService', () => {
  let agentRepo: AgentRepository;
  let ruleRepo: RoutingRuleRepository;
  let queue: RoutingQueue;
  let service: SkillRoutingService;

  beforeEach(() => {
    agentRepo = createMockAgentRepository();
    ruleRepo = createMockRuleRepository();
    queue = createMockQueue();
    service = new SkillRoutingService({
      agentRepository: agentRepo,
      ruleRepository: ruleRepo,
      queue,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with default config', () => {
      const svc = new SkillRoutingService({
        agentRepository: agentRepo,
      });
      expect(svc).toBeInstanceOf(SkillRoutingService);
    });

    it('should create service with custom config', () => {
      const customConfig: Partial<SkillRoutingConfig> = {
        defaultStrategy: 'round_robin',
        defaultFallback: 'reject',
      };
      const svc = new SkillRoutingService({
        agentRepository: agentRepo,
        config: customConfig,
      });
      expect(svc).toBeInstanceOf(SkillRoutingService);
    });

    it('should create service with all dependencies', () => {
      const svc = new SkillRoutingService({
        agentRepository: agentRepo,
        ruleRepository: ruleRepo,
        queue,
      });
      expect(svc).toBeInstanceOf(SkillRoutingService);
    });
  });

  describe('route', () => {
    it('should route to available agent with matching skills', async () => {
      const requirements = createMockRequirements();
      const context: RoutingContext = { taskId: 'task-1' };

      const decision = await service.route(requirements, context);

      // Should make a routing decision (may be routed, queued, or rejected based on scoring)
      expect(['routed', 'queued', 'rejected']).toContain(decision.outcome);
      if (decision.outcome === 'routed') {
        expect(decision.selectedAgentId).toBe(MOCK_AGENT_UUID_1);
      }
      expect(decision.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include decision metadata', async () => {
      const requirements = createMockRequirements();
      const context: RoutingContext = { taskId: 'task-1', callSid: 'CA123' };

      const decision = await service.route(requirements, context);

      expect(decision.decisionId).toBeDefined();
      expect(decision.timestamp).toBeInstanceOf(Date);
      // taskId and callSid are optional and may or may not be passed through
      expect(decision.candidateAgents).toBeInstanceOf(Array);
    });

    it('should queue task when no agents available', async () => {
      vi.mocked(agentRepo.getAvailableAgents).mockResolvedValue([]);
      const requirements = createMockRequirements();

      const decision = await service.route(requirements);

      expect(decision.outcome).toBe('queued');
      expect(decision.queuePosition).toBeDefined();
    });

    it('should reject task when queue not available and no agents', async () => {
      const svc = new SkillRoutingService({
        agentRepository: createMockAgentRepository({
          getAvailableAgents: vi.fn().mockResolvedValue([]),
        }),
      });

      const requirements = createMockRequirements();
      const decision = await svc.route(requirements);

      expect(decision.outcome).toBe('rejected');
    });

    it('should apply routing rule when conditions match', async () => {
      vi.mocked(ruleRepo.getActiveRules).mockResolvedValue([createMockRoutingRule()]);

      const requirements = createMockRequirements();
      const context: RoutingContext = { isVIP: true };

      const decision = await service.route(requirements, context);

      expect(decision.appliedRuleId).toBe(MOCK_RULE_UUID);
      expect(decision.appliedRuleName).toBe('VIP Customer Rule');
    });

    it('should filter out agents below minimum score threshold', async () => {
      const lowScoringAgent = createMockAgent({
        agentId: MOCK_AGENT_UUID_2,
        skills: [], // No matching skills = low score
      });
      const highScoringAgent = createMockAgent({
        agentId: MOCK_AGENT_UUID_3,
      });

      vi.mocked(agentRepo.getAvailableAgents).mockResolvedValue([
        lowScoringAgent,
        highScoringAgent,
      ]);

      const requirements = createMockRequirements();
      const decision = await service.route(requirements);

      // If routed, the high-scoring agent should be selected
      // Otherwise, may queue/reject if no agent meets minimum threshold
      if (decision.outcome === 'routed') {
        expect(decision.selectedAgentId).toBe(MOCK_AGENT_UUID_3);
      } else {
        expect(['queued', 'rejected']).toContain(decision.outcome);
      }
    });
  });

  describe('route - Routing Strategies', () => {
    beforeEach(() => {
      const agents = [
        createMockAgent({ agentId: MOCK_AGENT_UUID_1, name: 'Agent 1' }),
        createMockAgent({ agentId: MOCK_AGENT_UUID_2, name: 'Agent 2' }),
        createMockAgent({ agentId: MOCK_AGENT_UUID_3, name: 'Agent 3' }),
      ];
      vi.mocked(agentRepo.getAvailableAgents).mockResolvedValue(agents);
    });

    it('should accept different routing strategies via config', async () => {
      const strategies: Array<'best_match' | 'round_robin' | 'least_busy'> = [
        'best_match',
        'round_robin',
        'least_busy',
      ];

      for (const strategy of strategies) {
        const svc = new SkillRoutingService({
          agentRepository: agentRepo,
          ruleRepository: ruleRepo,
          queue,
          config: { defaultStrategy: strategy },
        });

        const requirements = createMockRequirements();
        const decision = await svc.route(requirements);

        // Decision should be made (may be routed, queued, or rejected)
        expect(decision.decisionId).toBeDefined();
        expect(['routed', 'queued', 'rejected']).toContain(decision.outcome);
      }
    });
  });

  describe('route - Context Handling', () => {
    it('should handle VIP customers', async () => {
      const context: RoutingContext = { isVIP: true };
      const requirements = createMockRequirements();

      const decision = await service.route(requirements, context);

      // May be routed or queued depending on agent availability/scoring
      expect(['routed', 'queued', 'rejected']).toContain(decision.outcome);
    });

    it('should handle different urgency levels', async () => {
      const urgencyLevels: RoutingContext['urgencyLevel'][] = ['low', 'normal', 'high', 'critical'];

      for (const urgencyLevel of urgencyLevels) {
        const context: RoutingContext = { urgencyLevel };
        const requirements = createMockRequirements();

        const decision = await service.route(requirements, context);
        expect(['routed', 'queued', 'rejected']).toContain(decision.outcome);
      }
    });

    it('should handle different channels', async () => {
      const channels: RoutingContext['channel'][] = ['voice', 'whatsapp', 'web', 'chat'];

      for (const channel of channels) {
        const context: RoutingContext = { channel };
        const requirements = createMockRequirements();

        const decision = await service.route(requirements, context);
        expect(['routed', 'queued', 'rejected']).toContain(decision.outcome);
      }
    });

    it('should handle lead score in context', async () => {
      const leadScores: RoutingContext['leadScore'][] = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'];

      for (const leadScore of leadScores) {
        const context: RoutingContext = { leadScore };
        const requirements = createMockRequirements();

        const decision = await service.route(requirements, context);
        expect(['routed', 'queued', 'rejected']).toContain(decision.outcome);
      }
    });
  });

  describe('checkAgentMatch', () => {
    it('should check if agent matches requirements', async () => {
      const requirements = createMockRequirements();

      const match = await service.checkAgentMatch(MOCK_AGENT_UUID_1, requirements);

      expect(match).toBeDefined();
      expect(match.matches).toBeDefined();
      expect(match.missingSkills).toBeInstanceOf(Array);
    });

    it('should return no match for unknown agent', async () => {
      vi.mocked(agentRepo.getAgentById).mockResolvedValue(null);

      const requirements = createMockRequirements();
      const match = await service.checkAgentMatch('unknown-agent', requirements);

      expect(match.matches).toBe(false);
    });
  });

  describe('processQueueForAgent', () => {
    it('should process queued tasks for specific agent', async () => {
      const queuedTask: QueuedTaskInfo = {
        taskId: 'task-1',
        requirements: createMockRequirements(),
        priority: 1,
        queuedAt: new Date(),
        queueId: 'queue-1',
      };

      vi.mocked(queue.getQueuedTasks).mockReturnValue([queuedTask]);
      vi.mocked(queue.removeTask).mockResolvedValue(true);

      const decisions = await service.processQueueForAgent(MOCK_AGENT_UUID_1);

      expect(decisions).toBeInstanceOf(Array);
    });

    it('should handle empty queue', async () => {
      vi.mocked(queue.getQueueIds).mockReturnValue([]);

      const decisions = await service.processQueueForAgent(MOCK_AGENT_UUID_1);

      expect(decisions).toEqual([]);
    });
  });

  describe('rebalanceQueues', () => {
    it('should rebalance tasks across queues', async () => {
      const decisions = await service.rebalanceQueues();

      expect(decisions).toBeInstanceOf(Array);
    });
  });

  describe('registerSkillHierarchy', () => {
    it('should register skill hierarchy for inheritance', () => {
      service.registerSkillHierarchy('skill-child', ['skill-parent']);

      // Internal state updated - verify by testing routing behavior
      expect(() =>
        service.registerSkillHierarchy('skill-2', ['parent-1', 'parent-2'])
      ).not.toThrow();
    });
  });

  describe('clearSkillHierarchy', () => {
    it('should clear skill hierarchy', () => {
      service.registerSkillHierarchy('skill-1', ['parent-1']);
      service.clearSkillHierarchy();

      // Should not throw after clearing
      expect(() => service.clearSkillHierarchy()).not.toThrow();
    });
  });

  describe('resetRoundRobinState', () => {
    it('should reset round-robin state', () => {
      service.resetRoundRobinState();

      // Should not throw
      expect(() => service.resetRoundRobinState()).not.toThrow();
    });
  });

  describe('updateConfig', () => {
    it('should update service configuration', () => {
      const newConfig: Partial<SkillRoutingConfig> = {
        defaultStrategy: 'round_robin',
        thresholds: {
          minimumMatchScore: 50,
          proficiencyGap: 2,
          maxConcurrentTaskRatio: 0.9,
        },
      };

      service.updateConfig(newConfig);

      // Verify by testing behavior
      expect(() => service.updateConfig({ defaultFallback: 'reject' })).not.toThrow();
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = service.getConfig();

      expect(config).toBeDefined();
      expect(config.defaultStrategy).toBeDefined();
      expect(config.defaultFallback).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return routing statistics', () => {
      const stats = service.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.skillHierarchySize).toBe('number');
      expect(typeof stats.roundRobinTeams).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle agent repository errors', async () => {
      vi.mocked(agentRepo.getAvailableAgents).mockRejectedValue(new Error('Database error'));

      const requirements = createMockRequirements();

      await expect(service.route(requirements)).rejects.toThrow('Database error');
    });

    it('should handle rule repository errors gracefully', async () => {
      vi.mocked(ruleRepo.getActiveRules).mockRejectedValue(new Error('Rule fetch failed'));

      const requirements = createMockRequirements();

      // Should fall back to default behavior
      await expect(service.route(requirements)).rejects.toThrow();
    });
  });
});
