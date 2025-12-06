/**
 * Tests for Skill-Based Agent Routing
 * H6 Milestone: Intelligent Agent Routing
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { AgentProfile, AgentSkill, RoutingRule, TaskSkillRequirements } from '@medicalcor/types';
import { STANDARD_SKILLS, PROFICIENCY_WEIGHTS } from '@medicalcor/types';
import {
  SkillRoutingService,
  InMemoryAgentRepository,
  InMemoryRoutingRuleRepository,
  InMemoryRoutingQueue,
  type RoutingContext,
} from '../routing/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  const now = new Date();
  return {
    agentId: `agent-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Agent',
    availability: 'available',
    maxConcurrentTasks: 3,
    currentTaskCount: 0,
    skills: [],
    primaryLanguages: ['ro'],
    secondaryLanguages: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTestSkill(
  agentId: string,
  skillId: string,
  proficiency: AgentSkill['proficiency'] = 'intermediate'
): AgentSkill {
  const now = new Date();
  return {
    agentId,
    skillId,
    proficiency,
    isActive: true,
    tasksCompleted: 0,
    assignedAt: now,
    updatedAt: now,
  };
}

function createTestRoutingRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  const now = new Date();
  return {
    ruleId: `rule-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Rule',
    isActive: true,
    priority: 100,
    conditions: {},
    routing: {
      strategy: 'best_match',
      skillRequirements: {
        requiredSkills: [],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      },
      fallbackBehavior: 'queue',
      fallbackRuleIds: [],
      maxQueueTime: 300,
      queuePriority: 50,
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('SkillRoutingService', () => {
  let agentRepo: InMemoryAgentRepository;
  let ruleRepo: InMemoryRoutingRuleRepository;
  let queue: InMemoryRoutingQueue;
  let routingService: SkillRoutingService;

  beforeEach(() => {
    agentRepo = new InMemoryAgentRepository();
    ruleRepo = new InMemoryRoutingRuleRepository();
    queue = new InMemoryRoutingQueue();
    routingService = new SkillRoutingService({
      agentRepository: agentRepo,
      ruleRepository: ruleRepo,
      queue,
    });
  });

  describe('Basic Routing', () => {
    it('should route to available agent with matching skills', async () => {
      // Create agent with implant skill
      const agent = createTestAgent({
        agentId: 'agent-1',
        name: 'Dr. Implant',
        skills: [createTestSkill('agent-1', STANDARD_SKILLS.IMPLANTS.skillId, 'advanced')],
      });
      agentRepo.addAgent(agent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'intermediate',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      expect(decision.outcome).toBe('routed');
      expect(decision.selectedAgentId).toBe('agent-1');
      expect(decision.candidateAgents).toHaveLength(1);
      expect(decision.candidateAgents[0]?.totalScore).toBeGreaterThan(50);
    });

    it('should reject when no agents available', async () => {
      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'intermediate',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      expect(decision.outcome).toBe('rejected');
      expect(decision.selectedAgentId).toBeUndefined();
    });

    it('should queue task when no matching agents available', async () => {
      // Create agent without required skill
      const agent = createTestAgent({
        agentId: 'agent-1',
        name: 'General Agent',
        skills: [createTestSkill('agent-1', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'advanced')],
      });
      agentRepo.addAgent(agent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.ALL_ON_X.skillId,
            matchType: 'required',
            minimumProficiency: 'expert',
            weight: 100,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      // Score too low, should be rejected or queued
      expect(['rejected', 'queued']).toContain(decision.outcome);
    });
  });

  describe('Skill Matching', () => {
    it('should score agents based on skill proficiency', async () => {
      // Create two agents with different proficiency levels
      const expertAgent = createTestAgent({
        agentId: 'expert',
        name: 'Expert Agent',
        skills: [createTestSkill('expert', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
      });
      const basicAgent = createTestAgent({
        agentId: 'basic',
        name: 'Basic Agent',
        skills: [createTestSkill('basic', STANDARD_SKILLS.IMPLANTS.skillId, 'basic')],
      });
      agentRepo.addAgent(expertAgent);
      agentRepo.addAgent(basicAgent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'intermediate',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      expect(decision.outcome).toBe('routed');
      // Expert should be selected due to higher proficiency
      expect(decision.selectedAgentId).toBe('expert');

      // Verify expert has higher score
      const expertScore = decision.candidateAgents.find((c) => c.agentId === 'expert');
      const basicScore = decision.candidateAgents.find((c) => c.agentId === 'basic');
      expect(expertScore?.skillScore).toBeGreaterThan(basicScore?.skillScore ?? 0);
    });

    it('should give bonus for exceeding proficiency requirements', async () => {
      const agent = createTestAgent({
        agentId: 'agent-1',
        name: 'Expert Agent',
        skills: [createTestSkill('agent-1', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
      });
      agentRepo.addAgent(agent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'basic', // Low requirement
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      expect(decision.outcome).toBe('routed');
      // Expert should get bonus for exceeding basic requirement
      const matchedSkill = decision.candidateAgents[0]?.matchedSkills[0];
      expect(matchedSkill?.score).toBeGreaterThan(50); // Should exceed base weight
    });

    it('should handle multiple required skills', async () => {
      const agent = createTestAgent({
        agentId: 'multi-skill',
        name: 'Multi-Skill Agent',
        skills: [
          createTestSkill('multi-skill', STANDARD_SKILLS.IMPLANTS.skillId, 'advanced'),
          createTestSkill('multi-skill', STANDARD_SKILLS.SCHEDULING.skillId, 'intermediate'),
          createTestSkill('multi-skill', 'language:en', 'advanced'),
        ],
        primaryLanguages: ['ro', 'en'],
      });
      agentRepo.addAgent(agent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'intermediate',
            weight: 50,
          },
          {
            skillId: STANDARD_SKILLS.SCHEDULING.skillId,
            matchType: 'required',
            minimumProficiency: 'basic',
            weight: 30,
          },
        ],
        preferredSkills: [],
        preferredLanguages: ['en'],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      expect(decision.outcome).toBe('routed');
      expect(decision.selectedAgentId).toBe('multi-skill');
      expect(decision.candidateAgents[0]?.matchedSkills).toHaveLength(2);
    });
  });

  describe('Availability & Workload', () => {
    it('should prefer less occupied agents', async () => {
      const busyAgent = createTestAgent({
        agentId: 'busy',
        name: 'Busy Agent',
        currentTaskCount: 2,
        maxConcurrentTasks: 3,
        skills: [createTestSkill('busy', STANDARD_SKILLS.IMPLANTS.skillId, 'advanced')],
      });
      const idleAgent = createTestAgent({
        agentId: 'idle',
        name: 'Idle Agent',
        currentTaskCount: 0,
        maxConcurrentTasks: 3,
        skills: [createTestSkill('idle', STANDARD_SKILLS.IMPLANTS.skillId, 'advanced')],
      });
      agentRepo.addAgent(busyAgent);
      agentRepo.addAgent(idleAgent);

      // Use least_occupied strategy
      const service = new SkillRoutingService({
        agentRepository: agentRepo,
        config: { defaultStrategy: 'least_occupied' },
      });

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'intermediate',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await service.route(requirements);

      expect(decision.outcome).toBe('routed');
      expect(decision.selectedAgentId).toBe('idle');
    });

    it('should not route to unavailable agents', async () => {
      const unavailableAgent = createTestAgent({
        agentId: 'unavailable',
        name: 'Away Agent',
        availability: 'away',
        skills: [createTestSkill('unavailable', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
      });
      const availableAgent = createTestAgent({
        agentId: 'available',
        name: 'Available Agent',
        availability: 'available',
        skills: [createTestSkill('available', STANDARD_SKILLS.IMPLANTS.skillId, 'basic')],
      });
      agentRepo.addAgent(unavailableAgent);
      agentRepo.addAgent(availableAgent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'basic',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      expect(decision.outcome).toBe('routed');
      expect(decision.selectedAgentId).toBe('available');
      // Unavailable agent should not be in candidates
      expect(decision.candidateAgents.find((c) => c.agentId === 'unavailable')).toBeUndefined();
    });

    it('should respect max concurrent task ratio', async () => {
      const nearCapacityAgent = createTestAgent({
        agentId: 'near-capacity',
        name: 'Near Capacity',
        currentTaskCount: 3,
        maxConcurrentTasks: 3, // At capacity
        skills: [createTestSkill('near-capacity', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
      });
      agentRepo.addAgent(nearCapacityAgent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'basic',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      // Agent at capacity should not be selected
      expect(decision.outcome).not.toBe('routed');
    });
  });

  describe('Routing Rules', () => {
    it('should apply matching routing rule', async () => {
      const agent = createTestAgent({
        agentId: 'vip-agent',
        name: 'VIP Handler',
        skills: [
          createTestSkill('vip-agent', STANDARD_SKILLS.VIP.skillId, 'expert'),
          createTestSkill('vip-agent', STANDARD_SKILLS.IMPLANTS.skillId, 'advanced'),
        ],
      });
      agentRepo.addAgent(agent);

      // Create rule for VIP patients
      const vipRule = createTestRoutingRule({
        ruleId: 'vip-rule',
        name: 'VIP Routing',
        priority: 200,
        conditions: {
          isVIP: true,
        },
        routing: {
          strategy: 'best_match',
          skillRequirements: {
            requiredSkills: [
              {
                skillId: STANDARD_SKILLS.VIP.skillId,
                matchType: 'required',
                minimumProficiency: 'advanced',
                weight: 75,
              },
            ],
            preferredSkills: [],
            preferredLanguages: [],
            excludeAgentIds: [],
            preferAgentIds: [],
            priority: 100,
          },
          fallbackBehavior: 'escalate',
          fallbackRuleIds: [],
          maxQueueTime: 60,
          queuePriority: 100,
        },
      });
      ruleRepo.addRule(vipRule);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const context: RoutingContext = {
        isVIP: true,
        procedureType: 'implant',
      };

      const decision = await routingService.route(requirements, context);

      expect(decision.outcome).toBe('routed');
      expect(decision.appliedRuleId).toBe('vip-rule');
      expect(decision.appliedRuleName).toBe('VIP Routing');
      expect(decision.selectedAgentId).toBe('vip-agent');
    });

    it('should select highest priority matching rule', async () => {
      // Create low priority rule
      const lowPriorityRule = createTestRoutingRule({
        ruleId: 'low-priority',
        name: 'Low Priority Rule',
        priority: 50,
        conditions: { channels: ['voice'] },
      });

      // Create high priority rule
      const highPriorityRule = createTestRoutingRule({
        ruleId: 'high-priority',
        name: 'High Priority Rule',
        priority: 200,
        conditions: { channels: ['voice'] },
      });

      ruleRepo.addRule(lowPriorityRule);
      ruleRepo.addRule(highPriorityRule);

      const agent = createTestAgent({ agentId: 'agent-1' });
      agentRepo.addAgent(agent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const context: RoutingContext = { channel: 'voice' };

      const decision = await routingService.route(requirements, context);

      expect(decision.appliedRuleId).toBe('high-priority');
    });
  });

  describe('Agent Preferences', () => {
    it('should give bonus to preferred agents', async () => {
      const preferredAgent = createTestAgent({
        agentId: 'preferred',
        name: 'Preferred Agent',
        skills: [createTestSkill('preferred', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'intermediate')],
      });
      const regularAgent = createTestAgent({
        agentId: 'regular',
        name: 'Regular Agent',
        skills: [createTestSkill('regular', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'advanced')],
      });
      agentRepo.addAgent(preferredAgent);
      agentRepo.addAgent(regularAgent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.GENERAL_DENTISTRY.skillId,
            matchType: 'required',
            minimumProficiency: 'basic',
            weight: 30,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: ['preferred'],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      const preferredScore = decision.candidateAgents.find((c) => c.agentId === 'preferred');
      const regularScore = decision.candidateAgents.find((c) => c.agentId === 'regular');

      // Preferred agent should have higher preference score
      expect(preferredScore?.preferenceScore).toBeGreaterThan(regularScore?.preferenceScore ?? 0);
    });

    it('should exclude specified agents', async () => {
      const excludedAgent = createTestAgent({
        agentId: 'excluded',
        name: 'Excluded Agent',
        skills: [createTestSkill('excluded', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
      });
      const includedAgent = createTestAgent({
        agentId: 'included',
        name: 'Included Agent',
        skills: [createTestSkill('included', STANDARD_SKILLS.IMPLANTS.skillId, 'basic')],
      });
      agentRepo.addAgent(excludedAgent);
      agentRepo.addAgent(includedAgent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'basic',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: ['excluded'],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      expect(decision.outcome).toBe('routed');
      expect(decision.selectedAgentId).toBe('included');
      expect(decision.candidateAgents.find((c) => c.agentId === 'excluded')).toBeUndefined();
    });
  });

  describe('Language Requirements', () => {
    it('should filter by required language', async () => {
      const romanianAgent = createTestAgent({
        agentId: 'romanian',
        name: 'Romanian Agent',
        primaryLanguages: ['ro'],
        skills: [createTestSkill('romanian', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'advanced')],
      });
      const englishAgent = createTestAgent({
        agentId: 'english',
        name: 'English Agent',
        primaryLanguages: ['en'],
        skills: [createTestSkill('english', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'expert')],
      });
      agentRepo.addAgent(romanianAgent);
      agentRepo.addAgent(englishAgent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [],
        preferredSkills: [],
        preferredLanguages: [],
        requiredLanguage: 'en',
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      expect(decision.outcome).toBe('routed');
      expect(decision.selectedAgentId).toBe('english');
      // Romanian agent should not be in candidates
      expect(decision.candidateAgents.find((c) => c.agentId === 'romanian')).toBeUndefined();
    });

    it('should give bonus for preferred languages', async () => {
      const bilingualAgent = createTestAgent({
        agentId: 'bilingual',
        name: 'Bilingual Agent',
        primaryLanguages: ['ro'],
        secondaryLanguages: ['de'],
        skills: [createTestSkill('bilingual', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'intermediate')],
      });
      const monolingualAgent = createTestAgent({
        agentId: 'monolingual',
        name: 'Monolingual Agent',
        primaryLanguages: ['ro'],
        secondaryLanguages: [],
        skills: [createTestSkill('monolingual', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'intermediate')],
      });
      agentRepo.addAgent(bilingualAgent);
      agentRepo.addAgent(monolingualAgent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [],
        preferredSkills: [],
        preferredLanguages: ['de'],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      const bilingualScore = decision.candidateAgents.find((c) => c.agentId === 'bilingual');
      const monolingualScore = decision.candidateAgents.find((c) => c.agentId === 'monolingual');

      // Bilingual agent should have higher preference score due to German
      expect(bilingualScore?.preferenceScore).toBeGreaterThan(monolingualScore?.preferenceScore ?? 0);
    });
  });

  describe('Routing Strategies', () => {
    it('should use best_match strategy by default', async () => {
      const expertAgent = createTestAgent({
        agentId: 'expert',
        currentTaskCount: 2,
        skills: [createTestSkill('expert', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
      });
      const basicAgent = createTestAgent({
        agentId: 'basic',
        currentTaskCount: 0,
        skills: [createTestSkill('basic', STANDARD_SKILLS.IMPLANTS.skillId, 'basic')],
      });
      agentRepo.addAgent(expertAgent);
      agentRepo.addAgent(basicAgent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'basic',
            weight: 80,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      // Best match should prefer expert due to skill score despite being busier
      expect(decision.selectedAgentId).toBe('expert');
    });

    it('should use skills_first strategy correctly', async () => {
      const service = new SkillRoutingService({
        agentRepository: agentRepo,
        config: { defaultStrategy: 'skills_first' },
      });

      const highSkillBusy = createTestAgent({
        agentId: 'high-skill-busy',
        currentTaskCount: 2,
        maxConcurrentTasks: 3,
        skills: [createTestSkill('high-skill-busy', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
      });
      const lowSkillIdle = createTestAgent({
        agentId: 'low-skill-idle',
        currentTaskCount: 0,
        skills: [createTestSkill('low-skill-idle', STANDARD_SKILLS.IMPLANTS.skillId, 'basic')],
      });
      agentRepo.addAgent(highSkillBusy);
      agentRepo.addAgent(lowSkillIdle);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'basic',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await service.route(requirements);

      // Skills first should still prefer higher skilled agent
      expect(decision.selectedAgentId).toBe('high-skill-busy');
    });
  });

  describe('Skill Hierarchy', () => {
    it('should support skill inheritance', async () => {
      // Register hierarchy: all-on-x inherits from implants
      routingService.registerSkillHierarchy(STANDARD_SKILLS.ALL_ON_X.skillId, [
        STANDARD_SKILLS.IMPLANTS.skillId,
      ]);

      // Agent only has implants skill
      const implantAgent = createTestAgent({
        agentId: 'implant-specialist',
        skills: [createTestSkill('implant-specialist', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
      });
      agentRepo.addAgent(implantAgent);

      // Requirement asks for all-on-x
      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.ALL_ON_X.skillId,
            matchType: 'required',
            minimumProficiency: 'advanced',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const decision = await routingService.route(requirements);

      // Should match because implants skill satisfies all-on-x requirement via inheritance
      expect(decision.outcome).toBe('routed');
      expect(decision.selectedAgentId).toBe('implant-specialist');
    });
  });

  describe('Queue Management', () => {
    it('should enqueue when no suitable agents available', async () => {
      // No agents available
      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'expert',
            weight: 100,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 75,
      };

      const decision = await routingService.route(requirements, { taskId: 'task-123' });

      // Should fallback to queue
      if (decision.outcome === 'queued') {
        expect(decision.queueId).toBeDefined();
        expect(decision.queuePosition).toBeDefined();
        expect(decision.estimatedWaitTime).toBeDefined();
      }
    });
  });

  describe('Agent Match Checking', () => {
    it('should check if agent matches requirements', async () => {
      const agent = createTestAgent({
        agentId: 'checker-test',
        skills: [
          createTestSkill('checker-test', STANDARD_SKILLS.IMPLANTS.skillId, 'advanced'),
          createTestSkill('checker-test', STANDARD_SKILLS.SCHEDULING.skillId, 'intermediate'),
        ],
      });
      agentRepo.addAgent(agent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.IMPLANTS.skillId,
            matchType: 'required',
            minimumProficiency: 'intermediate',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const result = await routingService.checkAgentMatch('checker-test', requirements);

      expect(result.matches).toBe(true);
      expect(result.missingSkills).toHaveLength(0);
    });

    it('should identify missing skills', async () => {
      const agent = createTestAgent({
        agentId: 'missing-test',
        skills: [createTestSkill('missing-test', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'advanced')],
      });
      agentRepo.addAgent(agent);

      const requirements: TaskSkillRequirements = {
        requiredSkills: [
          {
            skillId: STANDARD_SKILLS.ALL_ON_X.skillId,
            matchType: 'required',
            minimumProficiency: 'advanced',
            weight: 50,
          },
        ],
        preferredSkills: [],
        preferredLanguages: [],
        excludeAgentIds: [],
        preferAgentIds: [],
        priority: 50,
      };

      const result = await routingService.checkAgentMatch('missing-test', requirements);

      expect(result.matches).toBe(false);
      expect(result.missingSkills).toContain(STANDARD_SKILLS.ALL_ON_X.skillId);
    });
  });

  describe('Proficiency Weights', () => {
    it('should have correct proficiency weight ordering', () => {
      expect(PROFICIENCY_WEIGHTS.basic).toBeLessThan(PROFICIENCY_WEIGHTS.intermediate);
      expect(PROFICIENCY_WEIGHTS.intermediate).toBeLessThan(PROFICIENCY_WEIGHTS.advanced);
      expect(PROFICIENCY_WEIGHTS.advanced).toBeLessThan(PROFICIENCY_WEIGHTS.expert);
    });
  });

  describe('Standard Skills', () => {
    it('should have all required standard skills defined', () => {
      expect(STANDARD_SKILLS.IMPLANTS).toBeDefined();
      expect(STANDARD_SKILLS.ALL_ON_X).toBeDefined();
      expect(STANDARD_SKILLS.GENERAL_DENTISTRY).toBeDefined();
      expect(STANDARD_SKILLS.SCHEDULING).toBeDefined();
      expect(STANDARD_SKILLS.VIP).toBeDefined();
      expect(STANDARD_SKILLS.ESCALATIONS).toBeDefined();
      expect(STANDARD_SKILLS.ROMANIAN).toBeDefined();
      expect(STANDARD_SKILLS.ENGLISH).toBeDefined();
    });

    it('should have correct skill categories', () => {
      expect(STANDARD_SKILLS.IMPLANTS.category).toBe('procedure');
      expect(STANDARD_SKILLS.SCHEDULING.category).toBe('administrative');
      expect(STANDARD_SKILLS.VIP.category).toBe('customer_service');
      expect(STANDARD_SKILLS.ROMANIAN.category).toBe('language');
    });
  });
});

describe('InMemoryAgentRepository', () => {
  let repo: InMemoryAgentRepository;

  beforeEach(() => {
    repo = new InMemoryAgentRepository();
  });

  it('should add and retrieve agents', async () => {
    const agent = createTestAgent({ agentId: 'test-1' });
    repo.addAgent(agent);

    const retrieved = await repo.getAgentById('test-1');
    expect(retrieved).toEqual(agent);
  });

  it('should filter by team', async () => {
    const team1Agent = createTestAgent({ agentId: 'team1', teamId: 'team-a' });
    const team2Agent = createTestAgent({ agentId: 'team2', teamId: 'team-b' });
    repo.addAgent(team1Agent);
    repo.addAgent(team2Agent);

    const teamAAgents = await repo.getAvailableAgents('team-a');
    expect(teamAAgents).toHaveLength(1);
    expect(teamAAgents[0]?.agentId).toBe('team1');
  });

  it('should get agents by skill', async () => {
    const implantAgent = createTestAgent({
      agentId: 'implant-agent',
      skills: [createTestSkill('implant-agent', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
    });
    const generalAgent = createTestAgent({
      agentId: 'general-agent',
      skills: [createTestSkill('general-agent', STANDARD_SKILLS.GENERAL_DENTISTRY.skillId, 'expert')],
    });
    repo.addAgent(implantAgent);
    repo.addAgent(generalAgent);

    const implantAgents = await repo.getAgentsBySkill(STANDARD_SKILLS.IMPLANTS.skillId);
    expect(implantAgents).toHaveLength(1);
    expect(implantAgents[0]?.agentId).toBe('implant-agent');
  });

  it('should filter by minimum proficiency', async () => {
    const expertAgent = createTestAgent({
      agentId: 'expert',
      skills: [createTestSkill('expert', STANDARD_SKILLS.IMPLANTS.skillId, 'expert')],
    });
    const basicAgent = createTestAgent({
      agentId: 'basic',
      skills: [createTestSkill('basic', STANDARD_SKILLS.IMPLANTS.skillId, 'basic')],
    });
    repo.addAgent(expertAgent);
    repo.addAgent(basicAgent);

    const advancedAgents = await repo.getAgentsBySkill(STANDARD_SKILLS.IMPLANTS.skillId, 'advanced');
    expect(advancedAgents).toHaveLength(1);
    expect(advancedAgents[0]?.agentId).toBe('expert');
  });
});

describe('InMemoryRoutingQueue', () => {
  let queue: InMemoryRoutingQueue;

  beforeEach(() => {
    queue = new InMemoryRoutingQueue();
  });

  it('should enqueue and dequeue tasks', async () => {
    const requirements: TaskSkillRequirements = {
      requiredSkills: [],
      preferredSkills: [],
      preferredLanguages: [],
      excludeAgentIds: [],
      preferAgentIds: [],
      priority: 50,
    };

    const result = await queue.enqueue('task-1', requirements, 50);
    expect(result.queueId).toBeDefined();
    expect(result.position).toBe(1);

    const dequeued = await queue.dequeue(result.queueId);
    expect(dequeued).toBe('task-1');
  });

  it('should maintain priority order', async () => {
    const requirements: TaskSkillRequirements = {
      requiredSkills: [],
      preferredSkills: [],
      preferredLanguages: [],
      excludeAgentIds: [],
      preferAgentIds: [],
      priority: 50,
    };

    await queue.enqueue('low-priority', requirements, 25);
    await queue.enqueue('high-priority', requirements, 75);
    await queue.enqueue('medium-priority', requirements, 50);

    const first = await queue.dequeue('default');
    expect(first).toBe('high-priority');

    const second = await queue.dequeue('default');
    expect(second).toBe('medium-priority');

    const third = await queue.dequeue('default');
    expect(third).toBe('low-priority');
  });

  it('should track queue position', async () => {
    const requirements: TaskSkillRequirements = {
      requiredSkills: [],
      preferredSkills: [],
      preferredLanguages: [],
      excludeAgentIds: [],
      preferAgentIds: [],
      priority: 50,
    };

    await queue.enqueue('task-1', requirements, 50);
    await queue.enqueue('task-2', requirements, 50);
    await queue.enqueue('task-3', requirements, 50);

    const position1 = await queue.getPosition('task-1');
    const position2 = await queue.getPosition('task-2');
    const position3 = await queue.getPosition('task-3');

    expect(position1).toBe(1);
    expect(position2).toBe(2);
    expect(position3).toBe(3);
  });

  it('should estimate wait time', async () => {
    const requirements: TaskSkillRequirements = {
      requiredSkills: [],
      preferredSkills: [],
      preferredLanguages: [],
      excludeAgentIds: [],
      preferAgentIds: [],
      priority: 50,
    };

    await queue.enqueue('task-1', requirements, 50);
    await queue.enqueue('task-2', requirements, 50);

    const waitTime = await queue.getEstimatedWaitTime('default');
    expect(waitTime).toBe(240); // 2 tasks * 120 seconds
  });
});
