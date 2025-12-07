/**
 * Round-Robin Agent Assignment Service
 * M7 Milestone: Capacity-Aware Lead Distribution
 *
 * Implements automated lead distribution using round-robin algorithm
 * with capacity awareness to replace manual agent assignment.
 *
 * Features:
 * - True round-robin tracking per queue/team
 * - Capacity awareness (respects agent workload limits)
 * - Skip unavailable or at-capacity agents
 * - Assignment history tracking
 * - Configurable capacity thresholds
 */
import { createLogger } from '@medicalcor/core';
import { v4 as uuidv4 } from 'uuid';
import { InMemoryRoundRobinStateRepository as DefaultStateRepo } from './round-robin-repositories.js';

const logger = createLogger({ name: 'round-robin-assignment' });

// =============================================================================
// Types
// =============================================================================

/**
 * Agent availability status for assignment
 */
export type AgentAssignmentStatus = 'available' | 'busy' | 'away' | 'offline' | 'at_capacity';

/**
 * Agent information for assignment decisions
 */
export interface AssignableAgent {
  /** Unique agent identifier */
  agentId: string;
  /** Agent display name */
  name: string;
  /** Current availability status */
  status: AgentAssignmentStatus;
  /** Current number of assigned leads */
  currentLeadCount: number;
  /** Maximum leads this agent can handle */
  maxLeadCapacity: number;
  /** Team/queue this agent belongs to */
  teamId?: string;
  /** Skills for filtered assignment */
  skills?: string[];
  /** Languages agent can handle */
  languages?: string[];
  /** Last time agent was assigned a lead */
  lastAssignedAt?: Date;
  /** Optional priority weight (higher = more assignments) */
  priorityWeight?: number;
}

/**
 * Lead information for assignment
 */
export interface LeadForAssignment {
  /** Unique lead identifier */
  leadId: string;
  /** Lead score classification */
  score?: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  /** Source of the lead */
  source?: string;
  /** Preferred language */
  language?: string;
  /** Required skills for handling this lead */
  requiredSkills?: string[];
  /** Preferred agent (for continuity) */
  preferredAgentId?: string;
  /** Priority level (higher = more urgent) */
  priority?: number;
}

/**
 * Assignment decision result
 */
export interface AssignmentDecision {
  /** Unique decision identifier */
  decisionId: string;
  /** Timestamp of decision */
  timestamp: Date;
  /** Lead being assigned */
  leadId: string;
  /** Assignment outcome */
  outcome: 'assigned' | 'queued' | 'rejected' | 'preferred_agent';
  /** Selected agent (if assigned) */
  selectedAgentId?: string;
  /** Selected agent name */
  selectedAgentName?: string;
  /** Reason for the decision */
  reason: string;
  /** Agents that were considered */
  consideredAgents: ConsideredAgent[];
  /** Queue position if queued */
  queuePosition?: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

/**
 * Agent that was considered for assignment
 */
export interface ConsideredAgent {
  agentId: string;
  agentName: string;
  status: AgentAssignmentStatus;
  currentLeadCount: number;
  maxLeadCapacity: number;
  capacityUtilization: number;
  skippedReason?: string;
  wasSelected: boolean;
}

/**
 * Round-robin state for a queue/team
 */
export interface RoundRobinState {
  /** Queue/team identifier */
  queueId: string;
  /** Index of the last assigned agent */
  lastAssignedIndex: number;
  /** Ordered list of agent IDs in rotation */
  agentOrder: string[];
  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Assignment statistics
 */
export interface AssignmentStats {
  /** Total assignments made */
  totalAssignments: number;
  /** Assignments per agent */
  assignmentsPerAgent: Record<string, number>;
  /** Average capacity utilization */
  averageCapacityUtilization: number;
  /** Number of rejected assignments */
  rejectedAssignments: number;
  /** Number of queued assignments */
  queuedAssignments: number;
  /** Time period start */
  periodStart: Date;
  /** Time period end */
  periodEnd: Date;
}

/**
 * Configuration for the round-robin assignment service
 */
export interface RoundRobinAssignmentConfig {
  /** Maximum capacity utilization before skipping (0-1) */
  maxCapacityThreshold: number;
  /** Enable weighted round-robin based on agent priority */
  enableWeightedDistribution: boolean;
  /** Enable skill matching for lead assignment */
  enableSkillMatching: boolean;
  /** Enable language matching for lead assignment */
  enableLanguageMatching: boolean;
  /** Prefer continuity (same agent for returning leads) */
  preferContinuity: boolean;
  /** Maximum rounds to try before rejecting */
  maxRetryRounds: number;
  /** Default queue ID for assignments without team */
  defaultQueueId: string;
}

/**
 * Repository interface for persistent round-robin state
 */
export interface RoundRobinStateRepository {
  /** Get state for a queue */
  getState(queueId: string): Promise<RoundRobinState | null>;
  /** Save state for a queue */
  saveState(state: RoundRobinState): Promise<void>;
  /** Record an assignment */
  recordAssignment(decision: AssignmentDecision): Promise<void>;
  /** Get assignment history for a lead */
  getLeadAssignmentHistory(leadId: string): Promise<AssignmentDecision[]>;
  /** Get assignment statistics */
  getStats(queueId: string, periodStart: Date, periodEnd: Date): Promise<AssignmentStats>;
}

/**
 * Repository interface for agent data
 */
export interface AssignableAgentRepository {
  /** Get all agents eligible for assignment in a queue/team */
  getAssignableAgents(queueId: string): Promise<AssignableAgent[]>;
  /** Get a specific agent by ID */
  getAgentById(agentId: string): Promise<AssignableAgent | null>;
  /** Update agent's current lead count */
  incrementLeadCount(agentId: string): Promise<void>;
  /** Update agent's last assigned timestamp */
  updateLastAssigned(agentId: string, timestamp: Date): Promise<void>;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: RoundRobinAssignmentConfig = {
  maxCapacityThreshold: 0.9, // Skip agents at 90%+ capacity
  enableWeightedDistribution: false,
  enableSkillMatching: true,
  enableLanguageMatching: true,
  preferContinuity: true,
  maxRetryRounds: 2,
  defaultQueueId: 'default',
};

// =============================================================================
// Round-Robin Agent Assignment Service
// =============================================================================

/**
 * Round-Robin Agent Assignment Service
 *
 * Provides automated lead distribution using a capacity-aware round-robin
 * algorithm. Replaces manual lead assignment with fair, balanced distribution.
 *
 * @example
 * ```typescript
 * const service = createRoundRobinAssignmentService({
 *   agentRepository: myAgentRepo,
 *   stateRepository: myStateRepo,
 * });
 *
 * // Assign a lead
 * const decision = await service.assignLead({
 *   leadId: 'lead-123',
 *   score: 'HOT',
 *   language: 'en',
 * });
 *
 * if (decision.outcome === 'assigned') {
 *   console.log(`Lead assigned to ${decision.selectedAgentName}`);
 * }
 * ```
 */
export class RoundRobinAssignmentService {
  private readonly config: RoundRobinAssignmentConfig;
  private readonly agentRepo: AssignableAgentRepository;
  private readonly stateRepo: RoundRobinStateRepository;

  // In-memory state cache (for services without persistent state)
  private stateCache = new Map<string, RoundRobinState>();

  constructor(options: {
    config?: Partial<RoundRobinAssignmentConfig>;
    agentRepository: AssignableAgentRepository;
    stateRepository?: RoundRobinStateRepository;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.agentRepo = options.agentRepository;
    this.stateRepo = options.stateRepository ?? new DefaultStateRepo();
  }

  // =============================================================================
  // Main Assignment Entry Point
  // =============================================================================

  /**
   * Assign a lead to an agent using round-robin with capacity awareness
   */
  async assignLead(lead: LeadForAssignment, queueId?: string): Promise<AssignmentDecision> {
    const startTime = Date.now();
    const decisionId = uuidv4();
    const effectiveQueueId = queueId ?? this.config.defaultQueueId;

    logger.info(
      { decisionId, leadId: lead.leadId, queueId: effectiveQueueId },
      'Starting round-robin lead assignment'
    );

    try {
      // Step 1: Check for preferred agent (continuity)
      if (this.config.preferContinuity && lead.preferredAgentId) {
        const preferredResult = await this.tryPreferredAgent(lead, decisionId, startTime);
        if (preferredResult) {
          await this.stateRepo.recordAssignment(preferredResult);
          return preferredResult;
        }
      }

      // Step 2: Get eligible agents
      const agents = await this.getEligibleAgents(effectiveQueueId, lead);

      if (agents.length === 0) {
        logger.warn({ decisionId, queueId: effectiveQueueId }, 'No eligible agents for assignment');
        return this.createRejectedDecision(
          decisionId,
          lead.leadId,
          'No eligible agents available',
          [],
          startTime
        );
      }

      // Step 3: Get current round-robin state
      const state = await this.getOrCreateState(effectiveQueueId, agents);

      // Step 4: Find next available agent using round-robin
      const selectedAgent = this.selectNextAgent(agents, state, lead);

      if (!selectedAgent) {
        logger.warn({ decisionId }, 'All agents at capacity or unavailable');
        return this.createRejectedDecision(
          decisionId,
          lead.leadId,
          'All agents at capacity',
          this.buildConsideredAgents(agents, null),
          startTime
        );
      }

      // Step 5: Update state and record assignment
      await this.updateStateAfterAssignment(state, selectedAgent.agentId, agents);
      await this.agentRepo.incrementLeadCount(selectedAgent.agentId);
      await this.agentRepo.updateLastAssigned(selectedAgent.agentId, new Date());

      const decision: AssignmentDecision = {
        decisionId,
        timestamp: new Date(),
        leadId: lead.leadId,
        outcome: 'assigned',
        selectedAgentId: selectedAgent.agentId,
        selectedAgentName: selectedAgent.name,
        reason: `Round-robin assignment to ${selectedAgent.name}`,
        consideredAgents: this.buildConsideredAgents(agents, selectedAgent.agentId),
        processingTimeMs: Date.now() - startTime,
      };

      await this.stateRepo.recordAssignment(decision);

      logger.info(
        {
          decisionId,
          agentId: selectedAgent.agentId,
          agentName: selectedAgent.name,
          processingTimeMs: decision.processingTimeMs,
        },
        'Lead assigned successfully'
      );

      return decision;
    } catch (error) {
      logger.error({ error, decisionId }, 'Assignment failed');
      throw error;
    }
  }

  /**
   * Assign multiple leads in batch
   */
  async assignLeadsBatch(
    leads: LeadForAssignment[],
    queueId?: string
  ): Promise<AssignmentDecision[]> {
    const results: AssignmentDecision[] = [];

    // Sort by priority (higher first)
    const sortedLeads = [...leads].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const lead of sortedLeads) {
      const decision = await this.assignLead(lead, queueId);
      results.push(decision);
    }

    return results;
  }

  // =============================================================================
  // Agent Selection
  // =============================================================================

  /**
   * Try to assign to preferred agent (for continuity)
   */
  private async tryPreferredAgent(
    lead: LeadForAssignment,
    decisionId: string,
    startTime: number
  ): Promise<AssignmentDecision | null> {
    if (!lead.preferredAgentId) return null;

    const agent = await this.agentRepo.getAgentById(lead.preferredAgentId);
    if (!agent) return null;

    // Check if preferred agent is available and has capacity
    if (agent.status !== 'available' || this.isAtCapacity(agent)) {
      logger.info(
        { agentId: agent.agentId, status: agent.status },
        'Preferred agent unavailable, using round-robin'
      );
      return null;
    }

    // Preferred agent available - assign directly
    await this.agentRepo.incrementLeadCount(agent.agentId);
    await this.agentRepo.updateLastAssigned(agent.agentId, new Date());

    return {
      decisionId,
      timestamp: new Date(),
      leadId: lead.leadId,
      outcome: 'preferred_agent',
      selectedAgentId: agent.agentId,
      selectedAgentName: agent.name,
      reason: `Assigned to preferred agent ${agent.name} for continuity`,
      consideredAgents: [this.buildConsideredAgent(agent, true)],
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get eligible agents filtered by lead requirements
   */
  private async getEligibleAgents(
    queueId: string,
    lead: LeadForAssignment
  ): Promise<AssignableAgent[]> {
    let agents = await this.agentRepo.getAssignableAgents(queueId);

    // Filter by availability
    agents = agents.filter((a) => a.status === 'available');

    // Filter by skills if enabled
    if (this.config.enableSkillMatching && lead.requiredSkills && lead.requiredSkills.length > 0) {
      const requiredSkills = lead.requiredSkills;
      agents = agents.filter((a) => requiredSkills.every((skill) => a.skills?.includes(skill)));
    }

    // Filter by language if enabled
    if (this.config.enableLanguageMatching && lead.language) {
      const targetLanguage = lead.language;
      agents = agents.filter((a) => a.languages?.includes(targetLanguage));
    }

    return agents;
  }

  /**
   * Select the next agent using round-robin with capacity awareness
   */
  private selectNextAgent(
    agents: AssignableAgent[],
    state: RoundRobinState,
    _lead: LeadForAssignment
  ): AssignableAgent | null {
    const agentCount = agents.length;
    if (agentCount === 0) return null;

    // Build agent lookup map
    const agentMap = new Map(agents.map((a) => [a.agentId, a]));

    // Sync agent order with current agents (handle agent additions/removals)
    const currentAgentIds = new Set(agents.map((a) => a.agentId));
    const orderedAgentIds = state.agentOrder.filter((id) => currentAgentIds.has(id));

    // Add new agents to the end of rotation
    for (const agent of agents) {
      if (!orderedAgentIds.includes(agent.agentId)) {
        orderedAgentIds.push(agent.agentId);
      }
    }
    state.agentOrder = orderedAgentIds;

    // Apply weighted distribution if enabled
    let effectiveOrder = orderedAgentIds;
    if (this.config.enableWeightedDistribution) {
      effectiveOrder = this.applyWeighting(orderedAgentIds, agentMap);
    }

    // Try to find next available agent with capacity
    const maxAttempts = effectiveOrder.length * this.config.maxRetryRounds;
    let attempts = 0;
    let currentIndex = state.lastAssignedIndex;

    while (attempts < maxAttempts) {
      currentIndex = (currentIndex + 1) % effectiveOrder.length;
      const agentId = effectiveOrder[currentIndex];
      if (agentId === undefined) {
        attempts++;
        continue;
      }
      const agent = agentMap.get(agentId);

      if (agent && !this.isAtCapacity(agent)) {
        state.lastAssignedIndex = currentIndex;
        return agent;
      }

      attempts++;
    }

    return null;
  }

  /**
   * Apply weighted distribution by duplicating agent IDs based on priority
   */
  private applyWeighting(agentIds: string[], agentMap: Map<string, AssignableAgent>): string[] {
    const weighted: string[] = [];

    for (const agentId of agentIds) {
      const agent = agentMap.get(agentId);
      const weight = agent?.priorityWeight ?? 1;

      // Add agent ID 'weight' times to increase their selection probability
      for (let i = 0; i < Math.max(1, weight); i++) {
        weighted.push(agentId);
      }
    }

    return weighted;
  }

  /**
   * Check if agent is at capacity
   */
  private isAtCapacity(agent: AssignableAgent): boolean {
    if (agent.maxLeadCapacity === 0) return true;

    const utilization = agent.currentLeadCount / agent.maxLeadCapacity;
    return utilization >= this.config.maxCapacityThreshold;
  }

  /**
   * Calculate capacity utilization percentage
   */
  private getCapacityUtilization(agent: AssignableAgent): number {
    if (agent.maxLeadCapacity === 0) return 100;
    return Math.round((agent.currentLeadCount / agent.maxLeadCapacity) * 100);
  }

  // =============================================================================
  // State Management
  // =============================================================================

  /**
   * Get or create round-robin state for a queue
   */
  private async getOrCreateState(
    queueId: string,
    agents: AssignableAgent[]
  ): Promise<RoundRobinState> {
    let state = await this.stateRepo.getState(queueId);

    if (!state) {
      state = {
        queueId,
        lastAssignedIndex: -1, // Start before first agent
        agentOrder: agents.map((a) => a.agentId),
        updatedAt: new Date(),
      };
      await this.stateRepo.saveState(state);
    }

    return state;
  }

  /**
   * Update state after successful assignment
   */
  private async updateStateAfterAssignment(
    state: RoundRobinState,
    selectedAgentId: string,
    agents: AssignableAgent[]
  ): Promise<void> {
    // Update agent order to include any new agents
    const currentAgentIds = new Set(agents.map((a) => a.agentId));
    state.agentOrder = state.agentOrder.filter((id) => currentAgentIds.has(id));

    for (const agent of agents) {
      if (!state.agentOrder.includes(agent.agentId)) {
        state.agentOrder.push(agent.agentId);
      }
    }

    state.updatedAt = new Date();
    await this.stateRepo.saveState(state);
  }

  // =============================================================================
  // Decision Building
  // =============================================================================

  /**
   * Build considered agents list
   */
  private buildConsideredAgents(
    agents: AssignableAgent[],
    selectedId: string | null
  ): ConsideredAgent[] {
    return agents.map((agent) => this.buildConsideredAgent(agent, agent.agentId === selectedId));
  }

  /**
   * Build single considered agent
   */
  private buildConsideredAgent(agent: AssignableAgent, wasSelected: boolean): ConsideredAgent {
    let skippedReason: string | undefined;

    if (!wasSelected) {
      if (agent.status !== 'available') {
        skippedReason = `Status: ${agent.status}`;
      } else if (this.isAtCapacity(agent)) {
        skippedReason = `At capacity (${agent.currentLeadCount}/${agent.maxLeadCapacity})`;
      }
    }

    return {
      agentId: agent.agentId,
      agentName: agent.name,
      status: agent.status,
      currentLeadCount: agent.currentLeadCount,
      maxLeadCapacity: agent.maxLeadCapacity,
      capacityUtilization: this.getCapacityUtilization(agent),
      skippedReason,
      wasSelected,
    };
  }

  /**
   * Create rejected decision
   */
  private createRejectedDecision(
    decisionId: string,
    leadId: string,
    reason: string,
    consideredAgents: ConsideredAgent[],
    startTime: number
  ): AssignmentDecision {
    return {
      decisionId,
      timestamp: new Date(),
      leadId,
      outcome: 'rejected',
      reason,
      consideredAgents,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // =============================================================================
  // Statistics & Monitoring
  // =============================================================================

  /**
   * Get assignment statistics for a queue
   */
  async getStats(queueId: string, periodStart: Date, periodEnd: Date): Promise<AssignmentStats> {
    return this.stateRepo.getStats(queueId, periodStart, periodEnd);
  }

  /**
   * Get current round-robin state for a queue
   */
  async getState(queueId: string): Promise<RoundRobinState | null> {
    return this.stateRepo.getState(queueId);
  }

  /**
   * Get current capacity overview for all agents in a queue
   */
  async getCapacityOverview(queueId: string): Promise<{
    totalAgents: number;
    availableAgents: number;
    atCapacityAgents: number;
    averageUtilization: number;
    agents: {
      agentId: string;
      name: string;
      status: AgentAssignmentStatus;
      currentLeadCount: number;
      maxLeadCapacity: number;
      utilization: number;
    }[];
  }> {
    const agents = await this.agentRepo.getAssignableAgents(queueId);
    const available = agents.filter((a) => a.status === 'available');
    const atCapacity = agents.filter((a) => this.isAtCapacity(a));

    const totalUtilization = agents.reduce((sum, a) => sum + this.getCapacityUtilization(a), 0);

    return {
      totalAgents: agents.length,
      availableAgents: available.length,
      atCapacityAgents: atCapacity.length,
      averageUtilization: agents.length > 0 ? Math.round(totalUtilization / agents.length) : 0,
      agents: agents.map((a) => ({
        agentId: a.agentId,
        name: a.name,
        status: a.status,
        currentLeadCount: a.currentLeadCount,
        maxLeadCapacity: a.maxLeadCapacity,
        utilization: this.getCapacityUtilization(a),
      })),
    };
  }

  /**
   * Reset round-robin state for a queue (admin operation)
   */
  async resetState(queueId: string): Promise<void> {
    const agents = await this.agentRepo.getAssignableAgents(queueId);
    const newState: RoundRobinState = {
      queueId,
      lastAssignedIndex: -1,
      agentOrder: agents.map((a) => a.agentId),
      updatedAt: new Date(),
    };
    await this.stateRepo.saveState(newState);
    logger.info({ queueId }, 'Round-robin state reset');
  }

  /**
   * Reorder agents in the rotation
   */
  async reorderAgents(queueId: string, newOrder: string[]): Promise<void> {
    const state = await this.stateRepo.getState(queueId);
    if (!state) {
      throw new Error(`No state found for queue ${queueId}`);
    }

    state.agentOrder = newOrder;
    state.lastAssignedIndex = -1; // Reset to start
    state.updatedAt = new Date();
    await this.stateRepo.saveState(state);

    logger.info({ queueId, newOrder }, 'Agent order updated');
  }
}

// =============================================================================
// In-Memory Implementations (re-exported from separate file)
// =============================================================================

export {
  InMemoryRoundRobinStateRepository,
  InMemoryAssignableAgentRepository,
} from './round-robin-repositories.js';

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a configured round-robin assignment service
 */
export function createRoundRobinAssignmentService(options: {
  config?: Partial<RoundRobinAssignmentConfig>;
  agentRepository: AssignableAgentRepository;
  stateRepository?: RoundRobinStateRepository;
}): RoundRobinAssignmentService {
  return new RoundRobinAssignmentService(options);
}
