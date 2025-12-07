/**
 * Tests for Round-Robin Agent Assignment Service
 * M7 Milestone: Capacity-Aware Lead Distribution
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RoundRobinAssignmentService,
  InMemoryAssignableAgentRepository,
  InMemoryRoundRobinStateRepository,
  createRoundRobinAssignmentService,
  type AssignableAgent,
  type LeadForAssignment,
  type RoundRobinAssignmentConfig,
} from '../routing/round-robin-assignment-service.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestAgent(overrides: Partial<AssignableAgent> = {}): AssignableAgent {
  return {
    agentId: `agent-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Agent',
    status: 'available',
    currentLeadCount: 0,
    maxLeadCapacity: 10,
    ...overrides,
  };
}

function createTestLead(overrides: Partial<LeadForAssignment> = {}): LeadForAssignment {
  return {
    leadId: `lead-${Math.random().toString(36).slice(2, 8)}`,
    score: 'WARM',
    priority: 50,
    ...overrides,
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('RoundRobinAssignmentService', () => {
  let agentRepo: InMemoryAssignableAgentRepository;
  let stateRepo: InMemoryRoundRobinStateRepository;
  let service: RoundRobinAssignmentService;

  beforeEach(() => {
    agentRepo = new InMemoryAssignableAgentRepository();
    stateRepo = new InMemoryRoundRobinStateRepository();
    service = createRoundRobinAssignmentService({
      agentRepository: agentRepo,
      stateRepository: stateRepo,
    });
  });

  describe('Basic Round-Robin', () => {
    it('should assign leads to agents in round-robin order', async () => {
      // Setup 3 agents
      const agent1 = createTestAgent({ agentId: 'agent-1', name: 'Agent One' });
      const agent2 = createTestAgent({ agentId: 'agent-2', name: 'Agent Two' });
      const agent3 = createTestAgent({ agentId: 'agent-3', name: 'Agent Three' });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);
      agentRepo.addAgent(agent3);

      // Assign 6 leads - should go 1,2,3,1,2,3
      const decisions = [];
      for (let i = 0; i < 6; i++) {
        const decision = await service.assignLead(createTestLead({ leadId: `lead-${i}` }));
        decisions.push(decision);
      }

      // All should be assigned
      expect(decisions.every((d) => d.outcome === 'assigned')).toBe(true);

      // Extract selected agent IDs
      const agentOrder = decisions.map((d) => d.selectedAgentId);

      // Verify round-robin distribution (order may vary based on initial state)
      const counts = agentOrder.reduce<Record<string, number>>((acc, id) => {
        acc[id!] = (acc[id!] ?? 0) + 1;
        return acc;
      }, {});

      // Each agent should have exactly 2 assignments
      expect(counts['agent-1']).toBe(2);
      expect(counts['agent-2']).toBe(2);
      expect(counts['agent-3']).toBe(2);
    });

    it('should continue round-robin from last assigned position', async () => {
      const agent1 = createTestAgent({ agentId: 'agent-1', name: 'Agent One' });
      const agent2 = createTestAgent({ agentId: 'agent-2', name: 'Agent Two' });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      // First assignment
      const decision1 = await service.assignLead(createTestLead());
      const firstAgentId = decision1.selectedAgentId;

      // Second assignment should go to other agent
      const decision2 = await service.assignLead(createTestLead());
      expect(decision2.selectedAgentId).not.toBe(firstAgentId);

      // Third assignment should come back to first agent
      const decision3 = await service.assignLead(createTestLead());
      expect(decision3.selectedAgentId).toBe(firstAgentId);
    });

    it('should reject when no agents available', async () => {
      const lead = createTestLead();
      const decision = await service.assignLead(lead);

      expect(decision.outcome).toBe('rejected');
      expect(decision.reason).toContain('No eligible agents');
      expect(decision.selectedAgentId).toBeUndefined();
    });
  });

  describe('Capacity Awareness', () => {
    it('should skip agents at capacity', async () => {
      // Agent 1 is at capacity, Agent 2 has room
      const atCapacityAgent = createTestAgent({
        agentId: 'at-capacity',
        name: 'At Capacity',
        currentLeadCount: 10,
        maxLeadCapacity: 10,
      });
      const availableAgent = createTestAgent({
        agentId: 'available',
        name: 'Available',
        currentLeadCount: 0,
        maxLeadCapacity: 10,
      });
      agentRepo.addAgent(atCapacityAgent);
      agentRepo.addAgent(availableAgent);

      const decision = await service.assignLead(createTestLead());

      expect(decision.outcome).toBe('assigned');
      expect(decision.selectedAgentId).toBe('available');

      // Check that at-capacity agent was considered but skipped
      const skipped = decision.consideredAgents.find((a) => a.agentId === 'at-capacity');
      expect(skipped?.skippedReason).toContain('At capacity');
    });

    it('should reject when all agents at capacity', async () => {
      const agent1 = createTestAgent({
        agentId: 'agent-1',
        currentLeadCount: 10,
        maxLeadCapacity: 10,
      });
      const agent2 = createTestAgent({
        agentId: 'agent-2',
        currentLeadCount: 10,
        maxLeadCapacity: 10,
      });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      const decision = await service.assignLead(createTestLead());

      expect(decision.outcome).toBe('rejected');
      expect(decision.reason).toContain('All agents at capacity');
    });

    it('should respect maxCapacityThreshold configuration', async () => {
      // Service with 80% threshold
      const strictService = createRoundRobinAssignmentService({
        config: { maxCapacityThreshold: 0.8 },
        agentRepository: agentRepo,
        stateRepository: stateRepo,
      });

      // Agent at 80% capacity
      const agent = createTestAgent({
        agentId: 'agent-1',
        currentLeadCount: 8,
        maxLeadCapacity: 10,
      });
      agentRepo.addAgent(agent);

      const decision = await strictService.assignLead(createTestLead());

      // Should be rejected because agent is at 80% (threshold)
      expect(decision.outcome).toBe('rejected');
    });

    it('should update lead count after assignment', async () => {
      const agent = createTestAgent({
        agentId: 'agent-1',
        currentLeadCount: 5,
        maxLeadCapacity: 10,
      });
      agentRepo.addAgent(agent);

      await service.assignLead(createTestLead());

      const updatedAgent = await agentRepo.getAgentById('agent-1');
      expect(updatedAgent?.currentLeadCount).toBe(6);
    });
  });

  describe('Agent Availability', () => {
    it('should skip unavailable agents', async () => {
      const busyAgent = createTestAgent({
        agentId: 'busy',
        name: 'Busy Agent',
        status: 'busy',
      });
      const availableAgent = createTestAgent({
        agentId: 'available',
        name: 'Available Agent',
        status: 'available',
      });
      agentRepo.addAgent(busyAgent);
      agentRepo.addAgent(availableAgent);

      const decision = await service.assignLead(createTestLead());

      expect(decision.outcome).toBe('assigned');
      expect(decision.selectedAgentId).toBe('available');

      // Busy agent should not be in considered list (filtered early)
      const busyInConsidered = decision.consideredAgents.find((a) => a.agentId === 'busy');
      expect(busyInConsidered).toBeUndefined();
    });

    it('should skip offline agents', async () => {
      const offlineAgent = createTestAgent({
        agentId: 'offline',
        status: 'offline',
      });
      const onlineAgent = createTestAgent({
        agentId: 'online',
        status: 'available',
      });
      agentRepo.addAgent(offlineAgent);
      agentRepo.addAgent(onlineAgent);

      const decision = await service.assignLead(createTestLead());

      expect(decision.selectedAgentId).toBe('online');
    });

    it('should handle all agents being unavailable', async () => {
      agentRepo.addAgent(createTestAgent({ agentId: 'agent-1', status: 'offline' }));
      agentRepo.addAgent(createTestAgent({ agentId: 'agent-2', status: 'away' }));
      agentRepo.addAgent(createTestAgent({ agentId: 'agent-3', status: 'busy' }));

      const decision = await service.assignLead(createTestLead());

      expect(decision.outcome).toBe('rejected');
      expect(decision.reason).toContain('No eligible agents');
    });
  });

  describe('Skill Matching', () => {
    it('should filter agents by required skills', async () => {
      const skilledAgent = createTestAgent({
        agentId: 'skilled',
        name: 'Skilled Agent',
        skills: ['implants', 'orthodontics'],
      });
      const unskilledAgent = createTestAgent({
        agentId: 'unskilled',
        name: 'Unskilled Agent',
        skills: ['general'],
      });
      agentRepo.addAgent(skilledAgent);
      agentRepo.addAgent(unskilledAgent);

      const lead = createTestLead({
        requiredSkills: ['implants'],
      });

      const decision = await service.assignLead(lead);

      expect(decision.outcome).toBe('assigned');
      expect(decision.selectedAgentId).toBe('skilled');
    });

    it('should require all skills to match', async () => {
      const partialSkillAgent = createTestAgent({
        agentId: 'partial',
        skills: ['implants'],
      });
      const fullSkillAgent = createTestAgent({
        agentId: 'full',
        skills: ['implants', 'orthodontics'],
      });
      agentRepo.addAgent(partialSkillAgent);
      agentRepo.addAgent(fullSkillAgent);

      const lead = createTestLead({
        requiredSkills: ['implants', 'orthodontics'],
      });

      const decision = await service.assignLead(lead);

      expect(decision.selectedAgentId).toBe('full');
    });

    it('should skip skill matching when disabled', async () => {
      const serviceNoSkills = createRoundRobinAssignmentService({
        config: { enableSkillMatching: false },
        agentRepository: agentRepo,
        stateRepository: stateRepo,
      });

      const unskilledAgent = createTestAgent({
        agentId: 'agent-1',
        skills: [],
      });
      agentRepo.addAgent(unskilledAgent);

      const lead = createTestLead({
        requiredSkills: ['implants'],
      });

      const decision = await serviceNoSkills.assignLead(lead);

      // Should assign even without matching skills
      expect(decision.outcome).toBe('assigned');
      expect(decision.selectedAgentId).toBe('agent-1');
    });
  });

  describe('Language Matching', () => {
    it('should filter agents by language', async () => {
      const englishAgent = createTestAgent({
        agentId: 'english',
        name: 'English Agent',
        languages: ['en'],
      });
      const romanianAgent = createTestAgent({
        agentId: 'romanian',
        name: 'Romanian Agent',
        languages: ['ro'],
      });
      agentRepo.addAgent(englishAgent);
      agentRepo.addAgent(romanianAgent);

      const lead = createTestLead({
        language: 'en',
      });

      const decision = await service.assignLead(lead);

      expect(decision.selectedAgentId).toBe('english');
    });

    it('should support multilingual agents', async () => {
      const bilingualAgent = createTestAgent({
        agentId: 'bilingual',
        languages: ['en', 'ro', 'de'],
      });
      agentRepo.addAgent(bilingualAgent);

      const germanLead = createTestLead({ language: 'de' });
      const decision = await service.assignLead(germanLead);

      expect(decision.selectedAgentId).toBe('bilingual');
    });
  });

  describe('Preferred Agent (Continuity)', () => {
    it('should assign to preferred agent when available', async () => {
      const preferredAgent = createTestAgent({
        agentId: 'preferred',
        name: 'Preferred Agent',
      });
      const otherAgent = createTestAgent({
        agentId: 'other',
        name: 'Other Agent',
      });
      agentRepo.addAgent(preferredAgent);
      agentRepo.addAgent(otherAgent);

      const lead = createTestLead({
        preferredAgentId: 'preferred',
      });

      const decision = await service.assignLead(lead);

      expect(decision.outcome).toBe('preferred_agent');
      expect(decision.selectedAgentId).toBe('preferred');
      expect(decision.reason).toContain('continuity');
    });

    it('should fall back to round-robin when preferred agent unavailable', async () => {
      const preferredAgent = createTestAgent({
        agentId: 'preferred',
        status: 'away',
      });
      const availableAgent = createTestAgent({
        agentId: 'available',
        status: 'available',
      });
      agentRepo.addAgent(preferredAgent);
      agentRepo.addAgent(availableAgent);

      const lead = createTestLead({
        preferredAgentId: 'preferred',
      });

      const decision = await service.assignLead(lead);

      expect(decision.outcome).toBe('assigned');
      expect(decision.selectedAgentId).toBe('available');
    });

    it('should fall back when preferred agent at capacity', async () => {
      const preferredAgent = createTestAgent({
        agentId: 'preferred',
        currentLeadCount: 10,
        maxLeadCapacity: 10,
      });
      const availableAgent = createTestAgent({
        agentId: 'available',
        currentLeadCount: 0,
        maxLeadCapacity: 10,
      });
      agentRepo.addAgent(preferredAgent);
      agentRepo.addAgent(availableAgent);

      const lead = createTestLead({
        preferredAgentId: 'preferred',
      });

      const decision = await service.assignLead(lead);

      expect(decision.outcome).toBe('assigned');
      expect(decision.selectedAgentId).toBe('available');
    });

    it('should skip continuity check when disabled', async () => {
      const serviceNoContinuity = createRoundRobinAssignmentService({
        config: { preferContinuity: false },
        agentRepository: agentRepo,
        stateRepository: stateRepo,
      });

      const agent1 = createTestAgent({ agentId: 'agent-1' });
      const agent2 = createTestAgent({ agentId: 'agent-2' });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      // First assign to set state
      await serviceNoContinuity.assignLead(createTestLead());

      // Second with preferredAgentId should still use round-robin
      const lead = createTestLead({ preferredAgentId: 'agent-1' });
      const decision = await serviceNoContinuity.assignLead(lead);

      // Should be 'assigned' not 'preferred_agent'
      expect(decision.outcome).toBe('assigned');
    });
  });

  describe('Weighted Distribution', () => {
    it('should distribute more leads to higher weight agents', async () => {
      const serviceWeighted = createRoundRobinAssignmentService({
        config: { enableWeightedDistribution: true },
        agentRepository: agentRepo,
        stateRepository: stateRepo,
      });

      // Agent 1 has weight 3, Agent 2 has weight 1
      const highWeightAgent = createTestAgent({
        agentId: 'high-weight',
        priorityWeight: 3,
        maxLeadCapacity: 100,
      });
      const lowWeightAgent = createTestAgent({
        agentId: 'low-weight',
        priorityWeight: 1,
        maxLeadCapacity: 100,
      });
      agentRepo.addAgent(highWeightAgent);
      agentRepo.addAgent(lowWeightAgent);

      // Assign many leads
      const counts: Record<string, number> = { 'high-weight': 0, 'low-weight': 0 };
      for (let i = 0; i < 40; i++) {
        const decision = await serviceWeighted.assignLead(createTestLead());
        if (decision.selectedAgentId) {
          counts[decision.selectedAgentId]++;
        }
      }

      // High weight agent should have significantly more assignments
      expect(counts['high-weight']).toBeGreaterThan(counts['low-weight']);
    });
  });

  describe('Batch Assignment', () => {
    it('should assign multiple leads in batch', async () => {
      const agent1 = createTestAgent({ agentId: 'agent-1', maxLeadCapacity: 10 });
      const agent2 = createTestAgent({ agentId: 'agent-2', maxLeadCapacity: 10 });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      const leads = [
        createTestLead({ leadId: 'lead-1' }),
        createTestLead({ leadId: 'lead-2' }),
        createTestLead({ leadId: 'lead-3' }),
        createTestLead({ leadId: 'lead-4' }),
      ];

      const decisions = await service.assignLeadsBatch(leads);

      expect(decisions).toHaveLength(4);
      expect(decisions.every((d) => d.outcome === 'assigned')).toBe(true);
    });

    it('should process batch in priority order', async () => {
      const agent = createTestAgent({ agentId: 'agent-1', maxLeadCapacity: 10 });
      agentRepo.addAgent(agent);

      const leads = [
        createTestLead({ leadId: 'low-priority', priority: 10 }),
        createTestLead({ leadId: 'high-priority', priority: 100 }),
        createTestLead({ leadId: 'medium-priority', priority: 50 }),
      ];

      const decisions = await service.assignLeadsBatch(leads);

      // High priority should be processed first
      expect(decisions[0]?.leadId).toBe('high-priority');
      expect(decisions[1]?.leadId).toBe('medium-priority');
      expect(decisions[2]?.leadId).toBe('low-priority');
    });
  });

  describe('State Management', () => {
    it('should persist round-robin state', async () => {
      const agent1 = createTestAgent({ agentId: 'agent-1' });
      const agent2 = createTestAgent({ agentId: 'agent-2' });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      // Make some assignments
      await service.assignLead(createTestLead());
      await service.assignLead(createTestLead());

      const state = await service.getState('default');

      expect(state).not.toBeNull();
      expect(state?.queueId).toBe('default');
      expect(state?.agentOrder).toContain('agent-1');
      expect(state?.agentOrder).toContain('agent-2');
    });

    it('should reset state correctly', async () => {
      const agent1 = createTestAgent({ agentId: 'agent-1' });
      const agent2 = createTestAgent({ agentId: 'agent-2' });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      // Make some assignments
      await service.assignLead(createTestLead());
      await service.assignLead(createTestLead());
      await service.assignLead(createTestLead());

      // Reset
      await service.resetState('default');

      const state = await service.getState('default');
      expect(state?.lastAssignedIndex).toBe(-1);
    });

    it('should handle agent order changes', async () => {
      const agent1 = createTestAgent({ agentId: 'agent-1' });
      const agent2 = createTestAgent({ agentId: 'agent-2' });
      const agent3 = createTestAgent({ agentId: 'agent-3' });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);
      agentRepo.addAgent(agent3);

      // Initial assignments
      await service.assignLead(createTestLead());

      // Reorder agents
      await service.reorderAgents('default', ['agent-3', 'agent-1', 'agent-2']);

      const state = await service.getState('default');
      expect(state?.agentOrder).toEqual(['agent-3', 'agent-1', 'agent-2']);
      expect(state?.lastAssignedIndex).toBe(-1); // Reset after reorder
    });
  });

  describe('Statistics & Monitoring', () => {
    it('should provide capacity overview', async () => {
      const agent1 = createTestAgent({
        agentId: 'agent-1',
        name: 'Agent 1',
        currentLeadCount: 5,
        maxLeadCapacity: 10,
      });
      const agent2 = createTestAgent({
        agentId: 'agent-2',
        name: 'Agent 2',
        currentLeadCount: 8,
        maxLeadCapacity: 10,
      });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      const overview = await service.getCapacityOverview('default');

      expect(overview.totalAgents).toBe(2);
      expect(overview.availableAgents).toBe(2);
      expect(overview.averageUtilization).toBe(65); // (50 + 80) / 2
    });

    it('should track assignment statistics', async () => {
      const agent1 = createTestAgent({ agentId: 'agent-1', maxLeadCapacity: 10 });
      const agent2 = createTestAgent({ agentId: 'agent-2', maxLeadCapacity: 10 });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      // Make some assignments
      for (let i = 0; i < 6; i++) {
        await service.assignLead(createTestLead());
      }

      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const stats = await service.getStats('default', hourAgo, now);

      expect(stats.totalAssignments).toBe(6);
      expect(stats.assignmentsPerAgent['agent-1']).toBe(3);
      expect(stats.assignmentsPerAgent['agent-2']).toBe(3);
    });

    it('should calculate decision processing time', async () => {
      const agent = createTestAgent({ agentId: 'agent-1' });
      agentRepo.addAgent(agent);

      const decision = await service.assignLead(createTestLead());

      expect(decision.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(decision.processingTimeMs).toBeLessThan(1000); // Should be fast
    });
  });

  describe('Multiple Teams/Queues', () => {
    it('should maintain separate state per queue', async () => {
      const teamAAgent = createTestAgent({
        agentId: 'team-a-agent',
        teamId: 'team-a',
      });
      const teamBAgent = createTestAgent({
        agentId: 'team-b-agent',
        teamId: 'team-b',
      });
      agentRepo.addAgent(teamAAgent);
      agentRepo.addAgent(teamBAgent);

      const decisionA = await service.assignLead(createTestLead(), 'team-a');
      const decisionB = await service.assignLead(createTestLead(), 'team-b');

      expect(decisionA.selectedAgentId).toBe('team-a-agent');
      expect(decisionB.selectedAgentId).toBe('team-b-agent');

      const stateA = await service.getState('team-a');
      const stateB = await service.getState('team-b');

      expect(stateA?.queueId).toBe('team-a');
      expect(stateB?.queueId).toBe('team-b');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single agent', async () => {
      const agent = createTestAgent({ agentId: 'solo', maxLeadCapacity: 100 });
      agentRepo.addAgent(agent);

      // All leads should go to single agent
      for (let i = 0; i < 5; i++) {
        const decision = await service.assignLead(createTestLead());
        expect(decision.selectedAgentId).toBe('solo');
      }
    });

    it('should handle agent with zero capacity', async () => {
      const zeroCapacityAgent = createTestAgent({
        agentId: 'zero',
        maxLeadCapacity: 0,
      });
      const normalAgent = createTestAgent({
        agentId: 'normal',
        maxLeadCapacity: 10,
      });
      agentRepo.addAgent(zeroCapacityAgent);
      agentRepo.addAgent(normalAgent);

      const decision = await service.assignLead(createTestLead());

      expect(decision.selectedAgentId).toBe('normal');
    });

    it('should handle new agent joining rotation', async () => {
      const agent1 = createTestAgent({ agentId: 'agent-1' });
      agentRepo.addAgent(agent1);

      // First assignment
      await service.assignLead(createTestLead());

      // New agent joins
      const agent2 = createTestAgent({ agentId: 'agent-2' });
      agentRepo.addAgent(agent2);

      // Should include new agent in rotation
      const decision = await service.assignLead(createTestLead());
      expect(['agent-1', 'agent-2']).toContain(decision.selectedAgentId);
    });

    it('should handle agent leaving rotation', async () => {
      const agent1 = createTestAgent({ agentId: 'agent-1' });
      const agent2 = createTestAgent({ agentId: 'agent-2' });
      agentRepo.addAgent(agent1);
      agentRepo.addAgent(agent2);

      // First assignment
      await service.assignLead(createTestLead());

      // Agent leaves
      agentRepo.removeAgent('agent-1');

      // Should continue with remaining agent
      const decision = await service.assignLead(createTestLead());
      expect(decision.selectedAgentId).toBe('agent-2');
    });

    it('should include decision metadata', async () => {
      const agent = createTestAgent({ agentId: 'agent-1', name: 'Test Agent' });
      agentRepo.addAgent(agent);

      const lead = createTestLead({ leadId: 'test-lead' });
      const decision = await service.assignLead(lead);

      expect(decision.decisionId).toBeDefined();
      expect(decision.timestamp).toBeInstanceOf(Date);
      expect(decision.leadId).toBe('test-lead');
      expect(decision.selectedAgentName).toBe('Test Agent');
      expect(decision.consideredAgents).toHaveLength(1);
    });
  });
});

describe('InMemoryAssignableAgentRepository', () => {
  let repo: InMemoryAssignableAgentRepository;

  beforeEach(() => {
    repo = new InMemoryAssignableAgentRepository();
  });

  it('should add and retrieve agents', async () => {
    const agent = createTestAgent({ agentId: 'test-1' });
    repo.addAgent(agent);

    const retrieved = await repo.getAgentById('test-1');
    expect(retrieved?.agentId).toBe('test-1');
  });

  it('should filter by team', async () => {
    repo.addAgent(createTestAgent({ agentId: 'team-a', teamId: 'team-a' }));
    repo.addAgent(createTestAgent({ agentId: 'team-b', teamId: 'team-b' }));

    const teamAAgents = await repo.getAssignableAgents('team-a');
    expect(teamAAgents).toHaveLength(1);
    expect(teamAAgents[0]?.agentId).toBe('team-a');
  });

  it('should increment lead count', async () => {
    repo.addAgent(createTestAgent({ agentId: 'agent-1', currentLeadCount: 5 }));

    await repo.incrementLeadCount('agent-1');

    const agent = await repo.getAgentById('agent-1');
    expect(agent?.currentLeadCount).toBe(6);
  });

  it('should update last assigned timestamp', async () => {
    repo.addAgent(createTestAgent({ agentId: 'agent-1' }));

    const timestamp = new Date();
    await repo.updateLastAssigned('agent-1', timestamp);

    const agent = await repo.getAgentById('agent-1');
    expect(agent?.lastAssignedAt).toEqual(timestamp);
  });
});

describe('InMemoryRoundRobinStateRepository', () => {
  let repo: InMemoryRoundRobinStateRepository;

  beforeEach(() => {
    repo = new InMemoryRoundRobinStateRepository();
  });

  it('should save and retrieve state', async () => {
    const state = {
      queueId: 'test-queue',
      lastAssignedIndex: 2,
      agentOrder: ['a', 'b', 'c'],
      updatedAt: new Date(),
    };

    await repo.saveState(state);
    const retrieved = await repo.getState('test-queue');

    expect(retrieved?.queueId).toBe('test-queue');
    expect(retrieved?.lastAssignedIndex).toBe(2);
    expect(retrieved?.agentOrder).toEqual(['a', 'b', 'c']);
  });

  it('should record and retrieve assignments', async () => {
    const decision = {
      decisionId: 'dec-1',
      timestamp: new Date(),
      leadId: 'lead-1',
      outcome: 'assigned' as const,
      selectedAgentId: 'agent-1',
      selectedAgentName: 'Agent One',
      reason: 'Test',
      consideredAgents: [],
      processingTimeMs: 10,
    };

    await repo.recordAssignment(decision);
    const history = await repo.getLeadAssignmentHistory('lead-1');

    expect(history).toHaveLength(1);
    expect(history[0]?.decisionId).toBe('dec-1');
  });

  it('should calculate statistics', async () => {
    const now = new Date();
    const decisions = [
      {
        decisionId: '1',
        timestamp: now,
        leadId: 'l1',
        outcome: 'assigned' as const,
        selectedAgentId: 'a1',
        selectedAgentName: 'Agent 1',
        reason: 'Test',
        consideredAgents: [
          {
            agentId: 'a1',
            agentName: 'Agent 1',
            status: 'available' as const,
            currentLeadCount: 5,
            maxLeadCapacity: 10,
            capacityUtilization: 50,
            wasSelected: true,
          },
        ],
        processingTimeMs: 10,
      },
      {
        decisionId: '2',
        timestamp: now,
        leadId: 'l2',
        outcome: 'assigned' as const,
        selectedAgentId: 'a2',
        selectedAgentName: 'Agent 2',
        reason: 'Test',
        consideredAgents: [
          {
            agentId: 'a2',
            agentName: 'Agent 2',
            status: 'available' as const,
            currentLeadCount: 3,
            maxLeadCapacity: 10,
            capacityUtilization: 30,
            wasSelected: true,
          },
        ],
        processingTimeMs: 10,
      },
    ];

    for (const d of decisions) {
      await repo.recordAssignment(d);
    }

    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const stats = await repo.getStats('default', hourAgo, now);

    expect(stats.totalAssignments).toBe(2);
    expect(stats.assignmentsPerAgent['a1']).toBe(1);
    expect(stats.assignmentsPerAgent['a2']).toBe(1);
  });
});
