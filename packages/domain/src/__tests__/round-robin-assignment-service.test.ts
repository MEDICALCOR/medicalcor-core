/**
 * @fileoverview Round-Robin Assignment Service Tests
 *
 * Tests for the capacity-aware round-robin lead assignment service.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RoundRobinAssignmentService,
  createRoundRobinAssignmentService,
  InMemoryRoundRobinStateRepository,
  InMemoryAssignableAgentRepository,
  type AssignableAgent,
  type LeadForAssignment,
  type RoundRobinAssignmentConfig,
} from '../routing/round-robin-assignment-service.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockAgent(overrides: Partial<AssignableAgent> = {}): AssignableAgent {
  return {
    agentId: 'agent-001',
    name: 'John Agent',
    status: 'available',
    currentLeadCount: 0,
    maxLeadCapacity: 10,
    teamId: 'default',
    skills: ['sales', 'support'],
    languages: ['en', 'ro'],
    ...overrides,
  };
}

function createMockLead(overrides: Partial<LeadForAssignment> = {}): LeadForAssignment {
  return {
    leadId: 'lead-001',
    score: 'HOT',
    source: 'website',
    language: 'en',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('RoundRobinAssignmentService', () => {
  let service: RoundRobinAssignmentService;
  let agentRepo: InMemoryAssignableAgentRepository;
  let stateRepo: InMemoryRoundRobinStateRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    agentRepo = new InMemoryAssignableAgentRepository();
    stateRepo = new InMemoryRoundRobinStateRepository();
    service = new RoundRobinAssignmentService({
      agentRepository: agentRepo,
      stateRepository: stateRepo,
    });
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  describe('constructor', () => {
    it('should create service with default config', () => {
      const newService = new RoundRobinAssignmentService({
        agentRepository: agentRepo,
      });
      expect(newService).toBeDefined();
    });

    it('should create service with custom config', () => {
      const config: Partial<RoundRobinAssignmentConfig> = {
        maxCapacityThreshold: 0.8,
        enableWeightedDistribution: true,
        enableSkillMatching: false,
      };
      const newService = new RoundRobinAssignmentService({
        config,
        agentRepository: agentRepo,
      });
      expect(newService).toBeDefined();
    });
  });

  describe('createRoundRobinAssignmentService factory', () => {
    it('should create service via factory function', () => {
      const newService = createRoundRobinAssignmentService({
        agentRepository: agentRepo,
      });
      expect(newService).toBeInstanceOf(RoundRobinAssignmentService);
    });
  });

  // ==========================================================================
  // assignLead - Basic Assignment
  // ==========================================================================

  describe('assignLead - basic', () => {
    it('should assign lead to available agent', async () => {
      const agent = createMockAgent();
      agentRepo.addAgent(agent);

      const lead = createMockLead();
      const result = await service.assignLead(lead);

      expect(result.outcome).toBe('assigned');
      expect(result.selectedAgentId).toBe(agent.agentId);
      expect(result.selectedAgentName).toBe(agent.name);
      expect(result.leadId).toBe(lead.leadId);
    });

    it('should distribute leads in round-robin order', async () => {
      // Add 3 agents
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1', name: 'Agent 1' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2', name: 'Agent 2' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-3', name: 'Agent 3' }));

      // Assign 3 leads
      const result1 = await service.assignLead(createMockLead({ leadId: 'lead-1' }));
      const result2 = await service.assignLead(createMockLead({ leadId: 'lead-2' }));
      const result3 = await service.assignLead(createMockLead({ leadId: 'lead-3' }));

      // Each agent should get exactly 1 lead
      const assignedAgents = [
        result1.selectedAgentId,
        result2.selectedAgentId,
        result3.selectedAgentId,
      ];
      expect(new Set(assignedAgents).size).toBe(3);
    });

    it('should cycle back to first agent after all agents assigned', async () => {
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1', name: 'Agent 1' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2', name: 'Agent 2' }));

      // Assign 3 leads to 2 agents
      const result1 = await service.assignLead(createMockLead({ leadId: 'lead-1' }));
      const result2 = await service.assignLead(createMockLead({ leadId: 'lead-2' }));
      const result3 = await service.assignLead(createMockLead({ leadId: 'lead-3' }));

      // Third assignment should cycle back
      expect(result3.selectedAgentId).toBe(result1.selectedAgentId);
    });

    it('should include processing time in decision', async () => {
      agentRepo.addAgent(createMockAgent());
      const lead = createMockLead();

      const result = await service.assignLead(lead);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // assignLead - Capacity Awareness
  // ==========================================================================

  describe('assignLead - capacity awareness', () => {
    it('should skip agents at capacity', async () => {
      // Agent 1 at 90% capacity (threshold)
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          name: 'Agent 1',
          currentLeadCount: 9,
          maxLeadCapacity: 10,
        })
      );
      // Agent 2 available
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-2',
          name: 'Agent 2',
          currentLeadCount: 0,
        })
      );

      const result = await service.assignLead(createMockLead());

      expect(result.outcome).toBe('assigned');
      expect(result.selectedAgentId).toBe('agent-2');
    });

    it('should reject when all agents at capacity', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          currentLeadCount: 10,
          maxLeadCapacity: 10,
        })
      );

      const result = await service.assignLead(createMockLead());

      expect(result.outcome).toBe('rejected');
      expect(result.reason).toContain('All agents at capacity');
    });

    it('should increment agent lead count after assignment', async () => {
      const agent = createMockAgent({ currentLeadCount: 0 });
      agentRepo.addAgent(agent);

      await service.assignLead(createMockLead());

      const updatedAgent = await agentRepo.getAgentById(agent.agentId);
      expect(updatedAgent?.currentLeadCount).toBe(1);
    });
  });

  // ==========================================================================
  // assignLead - Preferred Agent (Continuity)
  // ==========================================================================

  describe('assignLead - preferred agent', () => {
    it('should assign to preferred agent when available', async () => {
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1', name: 'Agent 1' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2', name: 'Agent 2' }));

      const lead = createMockLead({ preferredAgentId: 'agent-2' });
      const result = await service.assignLead(lead);

      expect(result.outcome).toBe('preferred_agent');
      expect(result.selectedAgentId).toBe('agent-2');
      expect(result.reason).toContain('continuity');
    });

    it('should fallback to round-robin when preferred agent unavailable', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          name: 'Agent 1',
          status: 'offline',
        })
      );
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-2',
          name: 'Agent 2',
          status: 'available',
        })
      );

      const lead = createMockLead({ preferredAgentId: 'agent-1' });
      const result = await service.assignLead(lead);

      expect(result.outcome).toBe('assigned');
      expect(result.selectedAgentId).toBe('agent-2');
    });

    it('should fallback when preferred agent at capacity', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          name: 'Agent 1',
          currentLeadCount: 10,
          maxLeadCapacity: 10,
        })
      );
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-2',
          name: 'Agent 2',
        })
      );

      const lead = createMockLead({ preferredAgentId: 'agent-1' });
      const result = await service.assignLead(lead);

      expect(result.outcome).toBe('assigned');
      expect(result.selectedAgentId).toBe('agent-2');
    });
  });

  // ==========================================================================
  // assignLead - Skill Matching
  // ==========================================================================

  describe('assignLead - skill matching', () => {
    beforeEach(() => {
      // Create service with skill matching enabled
      service = new RoundRobinAssignmentService({
        agentRepository: agentRepo,
        stateRepository: stateRepo,
        config: { enableSkillMatching: true },
      });
    });

    it('should filter agents by required skills', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          name: 'Sales Agent',
          skills: ['sales'],
        })
      );
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-2',
          name: 'Support Agent',
          skills: ['support', 'technical'],
        })
      );

      const lead = createMockLead({ requiredSkills: ['technical'] });
      const result = await service.assignLead(lead);

      expect(result.outcome).toBe('assigned');
      expect(result.selectedAgentId).toBe('agent-2');
    });

    it('should reject when no agents have required skills', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          skills: ['sales'],
        })
      );

      const lead = createMockLead({ requiredSkills: ['technical', 'billing'] });
      const result = await service.assignLead(lead);

      expect(result.outcome).toBe('rejected');
      expect(result.reason).toContain('No eligible agents');
    });
  });

  // ==========================================================================
  // assignLead - Language Matching
  // ==========================================================================

  describe('assignLead - language matching', () => {
    beforeEach(() => {
      service = new RoundRobinAssignmentService({
        agentRepository: agentRepo,
        stateRepository: stateRepo,
        config: { enableLanguageMatching: true },
      });
    });

    it('should filter agents by language', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          name: 'English Agent',
          languages: ['en'],
        })
      );
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-2',
          name: 'Romanian Agent',
          languages: ['ro'],
        })
      );

      const lead = createMockLead({ language: 'ro' });
      const result = await service.assignLead(lead);

      expect(result.outcome).toBe('assigned');
      expect(result.selectedAgentId).toBe('agent-2');
    });
  });

  // ==========================================================================
  // assignLead - No Eligible Agents
  // ==========================================================================

  describe('assignLead - no agents', () => {
    it('should reject when no agents exist', async () => {
      const lead = createMockLead();
      const result = await service.assignLead(lead);

      expect(result.outcome).toBe('rejected');
      expect(result.reason).toContain('No eligible agents');
    });

    it('should reject when all agents offline', async () => {
      agentRepo.addAgent(createMockAgent({ status: 'offline' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2', status: 'away' }));

      const result = await service.assignLead(createMockLead());

      expect(result.outcome).toBe('rejected');
    });
  });

  // ==========================================================================
  // assignLead - Considered Agents
  // ==========================================================================

  describe('assignLead - considered agents', () => {
    it('should include all considered agents in decision', async () => {
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1', name: 'Agent 1' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2', name: 'Agent 2' }));

      const result = await service.assignLead(createMockLead());

      expect(result.consideredAgents.length).toBeGreaterThan(0);
      expect(result.consideredAgents[0]).toHaveProperty('agentId');
      expect(result.consideredAgents[0]).toHaveProperty('capacityUtilization');
    });

    it('should mark skipped agents with reason', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          currentLeadCount: 10,
          maxLeadCapacity: 10,
        })
      );
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2' }));

      const result = await service.assignLead(createMockLead());

      const skippedAgent = result.consideredAgents.find((a) => a.agentId === 'agent-1');
      expect(skippedAgent?.skippedReason).toContain('capacity');
    });
  });

  // ==========================================================================
  // assignLeadsBatch
  // ==========================================================================

  describe('assignLeadsBatch', () => {
    it('should assign multiple leads in batch', async () => {
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2' }));

      const leads = [
        createMockLead({ leadId: 'lead-1' }),
        createMockLead({ leadId: 'lead-2' }),
        createMockLead({ leadId: 'lead-3' }),
      ];

      const results = await service.assignLeadsBatch(leads);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.outcome === 'assigned')).toBe(true);
    });

    it('should process leads by priority order', async () => {
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1' }));

      const leads = [
        createMockLead({ leadId: 'lead-low', priority: 1 }),
        createMockLead({ leadId: 'lead-high', priority: 10 }),
        createMockLead({ leadId: 'lead-medium', priority: 5 }),
      ];

      const results = await service.assignLeadsBatch(leads);

      // High priority should be processed first
      expect(results[0].leadId).toBe('lead-high');
      expect(results[1].leadId).toBe('lead-medium');
      expect(results[2].leadId).toBe('lead-low');
    });
  });

  // ==========================================================================
  // getStats
  // ==========================================================================

  describe('getStats', () => {
    it('should return assignment statistics', async () => {
      agentRepo.addAgent(createMockAgent());

      // Make some assignments
      await service.assignLead(createMockLead({ leadId: 'lead-1' }));
      await service.assignLead(createMockLead({ leadId: 'lead-2' }));

      const now = new Date();
      const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const stats = await service.getStats('default', periodStart, now);

      expect(stats.totalAssignments).toBe(2);
      expect(stats).toHaveProperty('assignmentsPerAgent');
      expect(stats).toHaveProperty('averageCapacityUtilization');
    });
  });

  // ==========================================================================
  // getState
  // ==========================================================================

  describe('getState', () => {
    it('should return current round-robin state', async () => {
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2' }));

      // Make an assignment to create state
      await service.assignLead(createMockLead());

      const state = await service.getState('default');

      expect(state).not.toBeNull();
      expect(state?.queueId).toBe('default');
      expect(state?.agentOrder).toContain('agent-1');
    });

    it('should return null for non-existent queue', async () => {
      const state = await service.getState('non-existent');
      expect(state).toBeNull();
    });
  });

  // ==========================================================================
  // getCapacityOverview
  // ==========================================================================

  describe('getCapacityOverview', () => {
    it('should return capacity overview for queue', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          currentLeadCount: 5,
          maxLeadCapacity: 10,
        })
      );
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-2',
          currentLeadCount: 8,
          maxLeadCapacity: 10,
        })
      );

      const overview = await service.getCapacityOverview('default');

      expect(overview.totalAgents).toBe(2);
      expect(overview.availableAgents).toBe(2);
      expect(overview.atCapacityAgents).toBe(0);
      expect(overview.averageUtilization).toBe(65); // (50 + 80) / 2
      expect(overview.agents).toHaveLength(2);
    });

    it('should count agents at capacity', async () => {
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          currentLeadCount: 10,
          maxLeadCapacity: 10,
        })
      );

      const overview = await service.getCapacityOverview('default');

      expect(overview.atCapacityAgents).toBe(1);
    });
  });

  // ==========================================================================
  // resetState
  // ==========================================================================

  describe('resetState', () => {
    it('should reset round-robin state for queue', async () => {
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2' }));

      // Make assignments to advance state
      await service.assignLead(createMockLead({ leadId: 'lead-1' }));
      await service.assignLead(createMockLead({ leadId: 'lead-2' }));

      // Reset state
      await service.resetState('default');

      const state = await service.getState('default');
      expect(state?.lastAssignedIndex).toBe(-1);
    });
  });

  // ==========================================================================
  // reorderAgents
  // ==========================================================================

  describe('reorderAgents', () => {
    it('should update agent order in rotation', async () => {
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-1' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-2' }));
      agentRepo.addAgent(createMockAgent({ agentId: 'agent-3' }));

      // Create initial state
      await service.assignLead(createMockLead());

      // Reorder
      await service.reorderAgents('default', ['agent-3', 'agent-1', 'agent-2']);

      const state = await service.getState('default');
      expect(state?.agentOrder).toEqual(['agent-3', 'agent-1', 'agent-2']);
    });

    it('should throw error for non-existent queue', async () => {
      await expect(service.reorderAgents('non-existent', ['agent-1'])).rejects.toThrow(
        'No state found'
      );
    });
  });

  // ==========================================================================
  // Weighted Distribution
  // ==========================================================================

  describe('weighted distribution', () => {
    beforeEach(() => {
      service = new RoundRobinAssignmentService({
        agentRepository: agentRepo,
        stateRepository: stateRepo,
        config: { enableWeightedDistribution: true },
      });
    });

    it('should apply weighting to agent selection', async () => {
      // Agent with weight 3 should appear 3x in rotation
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-1',
          name: 'Regular Agent',
          priorityWeight: 1,
        })
      );
      agentRepo.addAgent(
        createMockAgent({
          agentId: 'agent-2',
          name: 'Senior Agent',
          priorityWeight: 3,
        })
      );

      // Make assignments - with weights [1,3], agent-2 appears 3x in rotation
      const assignments: string[] = [];
      for (let i = 0; i < 8; i++) {
        const result = await service.assignLead(createMockLead({ leadId: `lead-${i}` }));
        if (result.selectedAgentId) {
          assignments.push(result.selectedAgentId);
        }
      }

      // Both agents should receive assignments
      const agent1Count = assignments.filter((a) => a === 'agent-1').length;
      const agent2Count = assignments.filter((a) => a === 'agent-2').length;
      expect(agent1Count).toBeGreaterThan(0);
      expect(agent2Count).toBeGreaterThan(0);
      // Total should equal number of leads assigned
      expect(agent1Count + agent2Count).toBe(8);
    });
  });
});
