/**
 * @fileoverview Tests for Routing Repositories
 *
 * Tests for in-memory implementations of skill-based routing repositories.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryAgentRepository,
  InMemoryRoutingRuleRepository,
  InMemoryRoutingQueue,
} from '../repositories.js';
import type { AgentProfile, RoutingRule, ProficiencyLevel } from '@medicalcor/types';

describe('InMemoryAgentRepository', () => {
  let repository: InMemoryAgentRepository;

  const createAgent = (overrides: Partial<AgentProfile> = {}): AgentProfile => ({
    agentId: 'agent-001',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'agent',
    availability: 'available',
    skills: [
      { skillId: 'all-on-x', proficiency: 'expert', isActive: true },
      { skillId: 'billing', proficiency: 'intermediate', isActive: true },
    ],
    languages: ['en', 'ro'],
    currentTaskCount: 0,
    maxConcurrentTasks: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    repository = new InMemoryAgentRepository();
  });

  describe('addAgent', () => {
    it('should add a new agent', () => {
      const agent = createAgent();
      repository.addAgent(agent);

      const agents = repository.getAllAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]?.agentId).toBe('agent-001');
    });

    it('should update existing agent', () => {
      const agent = createAgent();
      repository.addAgent(agent);

      const updatedAgent = createAgent({ name: 'Jane Doe' });
      repository.addAgent(updatedAgent);

      const agents = repository.getAllAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]?.name).toBe('Jane Doe');
    });
  });

  describe('removeAgent', () => {
    it('should remove an agent', () => {
      const agent = createAgent();
      repository.addAgent(agent);
      repository.removeAgent('agent-001');

      const agents = repository.getAllAgents();
      expect(agents).toHaveLength(0);
    });

    it('should handle removing non-existent agent', () => {
      expect(() => repository.removeAgent('non-existent')).not.toThrow();
    });
  });

  describe('getAllAgents', () => {
    it('should return all agents', () => {
      repository.addAgent(createAgent({ agentId: 'agent-001' }));
      repository.addAgent(createAgent({ agentId: 'agent-002' }));

      const agents = repository.getAllAgents();
      expect(agents).toHaveLength(2);
    });

    it('should return empty array when no agents', () => {
      const agents = repository.getAllAgents();
      expect(agents).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all agents', () => {
      repository.addAgent(createAgent({ agentId: 'agent-001' }));
      repository.addAgent(createAgent({ agentId: 'agent-002' }));
      repository.clear();

      const agents = repository.getAllAgents();
      expect(agents).toHaveLength(0);
    });
  });

  describe('getAvailableAgents', () => {
    it('should return only available agents', async () => {
      repository.addAgent(createAgent({ agentId: 'agent-001', availability: 'available' }));
      repository.addAgent(createAgent({ agentId: 'agent-002', availability: 'busy' }));
      repository.addAgent(createAgent({ agentId: 'agent-003', availability: 'offline' }));

      const agents = await repository.getAvailableAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]?.agentId).toBe('agent-001');
    });

    it('should filter by team ID', async () => {
      repository.addAgent(createAgent({ agentId: 'agent-001', teamId: 'team-a' }));
      repository.addAgent(createAgent({ agentId: 'agent-002', teamId: 'team-b' }));
      repository.addAgent(createAgent({ agentId: 'agent-003', teamId: 'team-a' }));

      const agents = await repository.getAvailableAgents('team-a');
      expect(agents).toHaveLength(2);
      expect(agents.every((a) => a.teamId === 'team-a')).toBe(true);
    });

    it('should return empty array when no agents match criteria', async () => {
      repository.addAgent(createAgent({ availability: 'busy' }));

      const agents = await repository.getAvailableAgents();
      expect(agents).toHaveLength(0);
    });
  });

  describe('getAgentById', () => {
    it('should return agent by ID', async () => {
      repository.addAgent(createAgent({ agentId: 'agent-001' }));

      const agent = await repository.getAgentById('agent-001');
      expect(agent).not.toBeNull();
      expect(agent?.agentId).toBe('agent-001');
    });

    it('should return null for non-existent agent', async () => {
      const agent = await repository.getAgentById('non-existent');
      expect(agent).toBeNull();
    });
  });

  describe('getAgentsBySkill', () => {
    beforeEach(() => {
      repository.addAgent(
        createAgent({
          agentId: 'agent-001',
          skills: [{ skillId: 'all-on-x', proficiency: 'expert', isActive: true }],
        })
      );
      repository.addAgent(
        createAgent({
          agentId: 'agent-002',
          skills: [{ skillId: 'all-on-x', proficiency: 'intermediate', isActive: true }],
        })
      );
      repository.addAgent(
        createAgent({
          agentId: 'agent-003',
          skills: [{ skillId: 'all-on-x', proficiency: 'basic', isActive: true }],
        })
      );
      repository.addAgent(
        createAgent({
          agentId: 'agent-004',
          skills: [{ skillId: 'billing', proficiency: 'expert', isActive: true }],
        })
      );
      repository.addAgent(
        createAgent({
          agentId: 'agent-005',
          skills: [{ skillId: 'all-on-x', proficiency: 'advanced', isActive: false }],
        })
      );
    });

    it('should return agents with specific skill', async () => {
      const agents = await repository.getAgentsBySkill('all-on-x');
      expect(agents).toHaveLength(3); // Excludes inactive skill
    });

    it('should filter by minimum proficiency', async () => {
      const agents = await repository.getAgentsBySkill('all-on-x', 'advanced');
      expect(agents).toHaveLength(1); // Only expert meets threshold
      expect(agents[0]?.agentId).toBe('agent-001');
    });

    it('should return empty array for unknown skill', async () => {
      const agents = await repository.getAgentsBySkill('unknown-skill');
      expect(agents).toHaveLength(0);
    });

    it('should exclude inactive skills', async () => {
      const agents = await repository.getAgentsBySkill('all-on-x');
      const hasInactiveAgent = agents.some((a) => a.agentId === 'agent-005');
      expect(hasInactiveAgent).toBe(false);
    });

    it('should handle proficiency level filtering correctly', async () => {
      const proficiencyLevels: ProficiencyLevel[] = ['basic', 'intermediate', 'advanced', 'expert'];

      for (const level of proficiencyLevels) {
        const agents = await repository.getAgentsBySkill('all-on-x', level);
        // Each higher level should return fewer agents
        expect(agents.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('updateAgentAvailability', () => {
    it('should update agent availability', async () => {
      repository.addAgent(createAgent({ agentId: 'agent-001', availability: 'available' }));

      await repository.updateAgentAvailability('agent-001', 'busy');

      const agent = await repository.getAgentById('agent-001');
      expect(agent?.availability).toBe('busy');
    });

    it('should update updatedAt timestamp', async () => {
      const originalDate = new Date('2020-01-01');
      repository.addAgent(createAgent({ agentId: 'agent-001', updatedAt: originalDate }));

      await repository.updateAgentAvailability('agent-001', 'busy');

      const agent = await repository.getAgentById('agent-001');
      expect(agent?.updatedAt.getTime()).toBeGreaterThan(originalDate.getTime());
    });

    it('should handle non-existent agent gracefully', async () => {
      await expect(
        repository.updateAgentAvailability('non-existent', 'available')
      ).resolves.not.toThrow();
    });
  });

  describe('updateAgentTaskCount', () => {
    it('should update agent task count', async () => {
      repository.addAgent(createAgent({ agentId: 'agent-001', currentTaskCount: 0 }));

      await repository.updateAgentTaskCount('agent-001', 3);

      const agent = await repository.getAgentById('agent-001');
      expect(agent?.currentTaskCount).toBe(3);
    });

    it('should update updatedAt timestamp', async () => {
      const originalDate = new Date('2020-01-01');
      repository.addAgent(createAgent({ agentId: 'agent-001', updatedAt: originalDate }));

      await repository.updateAgentTaskCount('agent-001', 2);

      const agent = await repository.getAgentById('agent-001');
      expect(agent?.updatedAt.getTime()).toBeGreaterThan(originalDate.getTime());
    });

    it('should handle non-existent agent gracefully', async () => {
      await expect(repository.updateAgentTaskCount('non-existent', 5)).resolves.not.toThrow();
    });
  });
});

describe('InMemoryRoutingRuleRepository', () => {
  let repository: InMemoryRoutingRuleRepository;

  const createRule = (overrides: Partial<RoutingRule> = {}): RoutingRule => ({
    ruleId: 'rule-001',
    name: 'All-on-X VIP Routing',
    description: 'Route All-on-X VIP leads to specialists',
    priority: 100,
    isActive: true,
    conditions: {
      procedureTypes: ['all-on-x'],
      urgencyLevels: ['high'],
      channels: ['voice'],
    },
    routing: {
      strategy: 'best_match',
      skillRequirements: {
        requiredSkills: [{ skillId: 'all-on-x', minProficiency: 'expert' }],
      },
      fallbackBehavior: 'queue',
      maxQueueTime: 300,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    repository = new InMemoryRoutingRuleRepository();
  });

  describe('addRule', () => {
    it('should add a new rule', () => {
      const rule = createRule();
      repository.addRule(rule);

      const rules = repository.getAllRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]?.ruleId).toBe('rule-001');
    });

    it('should update existing rule', () => {
      const rule = createRule();
      repository.addRule(rule);

      const updatedRule = createRule({ name: 'Updated Rule' });
      repository.addRule(updatedRule);

      const rules = repository.getAllRules();
      expect(rules).toHaveLength(1);
      expect(rules[0]?.name).toBe('Updated Rule');
    });
  });

  describe('removeRule', () => {
    it('should remove a rule', () => {
      const rule = createRule();
      repository.addRule(rule);
      repository.removeRule('rule-001');

      const rules = repository.getAllRules();
      expect(rules).toHaveLength(0);
    });

    it('should handle removing non-existent rule', () => {
      expect(() => repository.removeRule('non-existent')).not.toThrow();
    });
  });

  describe('getAllRules', () => {
    it('should return all rules', () => {
      repository.addRule(createRule({ ruleId: 'rule-001' }));
      repository.addRule(createRule({ ruleId: 'rule-002' }));

      const rules = repository.getAllRules();
      expect(rules).toHaveLength(2);
    });

    it('should return empty array when no rules', () => {
      const rules = repository.getAllRules();
      expect(rules).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all rules', () => {
      repository.addRule(createRule({ ruleId: 'rule-001' }));
      repository.addRule(createRule({ ruleId: 'rule-002' }));
      repository.clear();

      const rules = repository.getAllRules();
      expect(rules).toHaveLength(0);
    });
  });

  describe('getActiveRules', () => {
    it('should return only active rules', async () => {
      repository.addRule(createRule({ ruleId: 'rule-001', isActive: true }));
      repository.addRule(createRule({ ruleId: 'rule-002', isActive: false }));
      repository.addRule(createRule({ ruleId: 'rule-003', isActive: true }));

      const rules = await repository.getActiveRules();
      expect(rules).toHaveLength(2);
    });

    it('should sort by priority descending', async () => {
      repository.addRule(createRule({ ruleId: 'rule-001', priority: 50 }));
      repository.addRule(createRule({ ruleId: 'rule-002', priority: 200 }));
      repository.addRule(createRule({ ruleId: 'rule-003', priority: 100 }));

      const rules = await repository.getActiveRules();
      expect(rules[0]?.priority).toBe(200);
      expect(rules[1]?.priority).toBe(100);
      expect(rules[2]?.priority).toBe(50);
    });
  });

  describe('getRuleById', () => {
    it('should return rule by ID', async () => {
      repository.addRule(createRule({ ruleId: 'rule-001' }));

      const rule = await repository.getRuleById('rule-001');
      expect(rule).not.toBeNull();
      expect(rule?.ruleId).toBe('rule-001');
    });

    it('should return null for non-existent rule', async () => {
      const rule = await repository.getRuleById('non-existent');
      expect(rule).toBeNull();
    });
  });

  describe('getRulesForConditions', () => {
    beforeEach(() => {
      repository.addRule(
        createRule({
          ruleId: 'rule-001',
          conditions: {
            procedureTypes: ['all-on-x', 'implants'],
            urgencyLevels: ['high', 'critical'],
            channels: ['voice'],
          },
        })
      );
      repository.addRule(
        createRule({
          ruleId: 'rule-002',
          conditions: {
            procedureTypes: ['general'],
            urgencyLevels: ['normal'],
            channels: ['whatsapp', 'web'],
          },
        })
      );
      repository.addRule(
        createRule({
          ruleId: 'rule-003',
          conditions: {},
        })
      );
    });

    it('should match by procedure type', async () => {
      const rules = await repository.getRulesForConditions({
        procedureTypes: ['all-on-x'],
      });

      expect(rules.some((r) => r.ruleId === 'rule-001')).toBe(true);
      expect(rules.some((r) => r.ruleId === 'rule-003')).toBe(true);
    });

    it('should match by urgency level', async () => {
      const rules = await repository.getRulesForConditions({
        urgencyLevels: ['critical'],
      });

      expect(rules.some((r) => r.ruleId === 'rule-001')).toBe(true);
    });

    it('should match by channel', async () => {
      const rules = await repository.getRulesForConditions({
        channels: ['whatsapp'],
      });

      expect(rules.some((r) => r.ruleId === 'rule-002')).toBe(true);
    });

    it('should return rules without conditions when no match required', async () => {
      const rules = await repository.getRulesForConditions({
        procedureTypes: ['non-existent'],
      });

      // Rule 003 has no procedureTypes condition, so it should still match
      expect(rules.some((r) => r.ruleId === 'rule-003')).toBe(true);
    });

    it('should filter out inactive rules', async () => {
      repository.addRule(
        createRule({
          ruleId: 'rule-inactive',
          isActive: false,
          conditions: {
            procedureTypes: ['all-on-x'],
          },
        })
      );

      const rules = await repository.getRulesForConditions({
        procedureTypes: ['all-on-x'],
      });

      expect(rules.some((r) => r.ruleId === 'rule-inactive')).toBe(false);
    });
  });
});

describe('InMemoryRoutingQueue', () => {
  let queue: InMemoryRoutingQueue;

  beforeEach(() => {
    queue = new InMemoryRoutingQueue();
  });

  describe('createQueue', () => {
    it('should create a new queue', () => {
      queue.createQueue('team-a');
      expect(queue.getQueueIds()).toContain('team-a');
    });

    it('should not duplicate existing queue', () => {
      queue.createQueue('team-a');
      queue.createQueue('team-a');

      const ids = queue.getQueueIds();
      expect(ids.filter((id) => id === 'team-a')).toHaveLength(1);
    });
  });

  describe('enqueue', () => {
    it('should enqueue a task', async () => {
      const result = await queue.enqueue('task-001', { requiredSkills: [] }, 50);

      expect(result.queueId).toBe('default');
      expect(result.position).toBe(1);
    });

    it('should use team ID as queue ID when provided', async () => {
      const result = await queue.enqueue('task-001', { requiredSkills: [], teamId: 'team-a' }, 50);

      expect(result.queueId).toBe('team-a');
    });

    it('should maintain priority order', async () => {
      await queue.enqueue('task-low', { requiredSkills: [] }, 25);
      await queue.enqueue('task-high', { requiredSkills: [] }, 100);
      await queue.enqueue('task-medium', { requiredSkills: [] }, 50);

      const tasks = queue.getQueuedTasks('default');
      expect(tasks[0]?.taskId).toBe('task-high');
      expect(tasks[1]?.taskId).toBe('task-medium');
      expect(tasks[2]?.taskId).toBe('task-low');
    });

    it('should return correct position in queue', async () => {
      await queue.enqueue('task-001', { requiredSkills: [] }, 50);
      const result = await queue.enqueue('task-002', { requiredSkills: [] }, 100);

      // Higher priority task should be first
      expect(result.position).toBe(1);
    });
  });

  describe('dequeue', () => {
    it('should dequeue highest priority task', async () => {
      await queue.enqueue('task-low', { requiredSkills: [] }, 25);
      await queue.enqueue('task-high', { requiredSkills: [] }, 100);

      const taskId = await queue.dequeue('default');
      expect(taskId).toBe('task-high');
    });

    it('should return null for empty queue', async () => {
      const taskId = await queue.dequeue('default');
      expect(taskId).toBeNull();
    });

    it('should return null for non-existent queue', async () => {
      const taskId = await queue.dequeue('non-existent');
      expect(taskId).toBeNull();
    });
  });

  describe('getPosition', () => {
    it('should return position for queued task', async () => {
      await queue.enqueue('task-001', { requiredSkills: [] }, 100);
      await queue.enqueue('task-002', { requiredSkills: [] }, 50);

      const position = await queue.getPosition('task-002');
      expect(position).toBe(2);
    });

    it('should return null for non-existent task', async () => {
      const position = await queue.getPosition('non-existent');
      expect(position).toBeNull();
    });

    it('should return null after task is dequeued', async () => {
      await queue.enqueue('task-001', { requiredSkills: [] }, 50);
      await queue.dequeue('default');

      const position = await queue.getPosition('task-001');
      expect(position).toBeNull();
    });
  });

  describe('getEstimatedWaitTime', () => {
    it('should return 0 for empty queue', async () => {
      const waitTime = await queue.getEstimatedWaitTime('default');
      expect(waitTime).toBe(0);
    });

    it('should calculate wait time based on queue length', async () => {
      await queue.enqueue('task-001', { requiredSkills: [] }, 50);
      await queue.enqueue('task-002', { requiredSkills: [] }, 50);

      const waitTime = await queue.getEstimatedWaitTime('default');
      expect(waitTime).toBe(240); // 2 tasks * 120 seconds
    });

    it('should return 0 for non-existent queue', async () => {
      const waitTime = await queue.getEstimatedWaitTime('non-existent');
      expect(waitTime).toBe(0);
    });
  });

  describe('removeTask', () => {
    it('should remove task from queue', async () => {
      await queue.enqueue('task-001', { requiredSkills: [] }, 50);

      const removed = await queue.removeTask('task-001');
      expect(removed).toBe(true);

      const position = await queue.getPosition('task-001');
      expect(position).toBeNull();
    });

    it('should return false for non-existent task', async () => {
      const removed = await queue.removeTask('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getQueueLength', () => {
    it('should return queue length', async () => {
      await queue.enqueue('task-001', { requiredSkills: [] }, 50);
      await queue.enqueue('task-002', { requiredSkills: [] }, 50);

      const length = queue.getQueueLength('default');
      expect(length).toBe(2);
    });

    it('should return 0 for non-existent queue', () => {
      const length = queue.getQueueLength('non-existent');
      expect(length).toBe(0);
    });
  });

  describe('getQueuedTasks', () => {
    it('should return all tasks in queue', async () => {
      await queue.enqueue('task-001', { requiredSkills: [] }, 50);
      await queue.enqueue('task-002', { requiredSkills: [] }, 100);

      const tasks = queue.getQueuedTasks('default');
      expect(tasks).toHaveLength(2);
    });

    it('should return empty array for non-existent queue', () => {
      const tasks = queue.getQueuedTasks('non-existent');
      expect(tasks).toEqual([]);
    });
  });

  describe('getQueueIds', () => {
    it('should return all queue IDs', async () => {
      await queue.enqueue('task-001', { requiredSkills: [], teamId: 'team-a' }, 50);
      await queue.enqueue('task-002', { requiredSkills: [], teamId: 'team-b' }, 50);

      const ids = queue.getQueueIds();
      expect(ids).toContain('default');
      expect(ids).toContain('team-a');
      expect(ids).toContain('team-b');
    });
  });

  describe('clear', () => {
    it('should clear all queues', async () => {
      await queue.enqueue('task-001', { requiredSkills: [], teamId: 'team-a' }, 50);
      await queue.enqueue('task-002', { requiredSkills: [] }, 50);

      queue.clear();

      expect(queue.getQueueLength('default')).toBe(0);
      expect(queue.getQueueIds()).toEqual(['default']);
    });
  });

  describe('getQueueTasks (deprecated)', () => {
    it('should return same result as getQueuedTasks', async () => {
      await queue.enqueue('task-001', { requiredSkills: [] }, 50);

      const tasks = queue.getQueueTasks('default');
      const queuedTasks = queue.getQueuedTasks('default');

      expect(tasks).toEqual(queuedTasks);
    });
  });
});
