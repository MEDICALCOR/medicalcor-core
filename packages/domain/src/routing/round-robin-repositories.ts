/**
 * Round-Robin Assignment In-Memory Repositories
 * M7 Milestone: Capacity-Aware Lead Distribution
 *
 * In-memory implementations of the round-robin assignment repositories
 * for testing and development purposes.
 */
import type {
  AssignableAgent,
  AssignmentDecision,
  AssignmentStats,
  RoundRobinState,
  RoundRobinStateRepository,
  AssignableAgentRepository,
  AgentAssignmentStatus,
} from './round-robin-assignment-service.js';

// =============================================================================
// In-Memory State Repository
// =============================================================================

/**
 * In-memory implementation of RoundRobinStateRepository
 */
export class InMemoryRoundRobinStateRepository implements RoundRobinStateRepository {
  private states = new Map<string, RoundRobinState>();
  private assignments: AssignmentDecision[] = [];

  getState(queueId: string): Promise<RoundRobinState | null> {
    return Promise.resolve(this.states.get(queueId) ?? null);
  }

  saveState(state: RoundRobinState): Promise<void> {
    this.states.set(state.queueId, { ...state });
    return Promise.resolve();
  }

  recordAssignment(decision: AssignmentDecision): Promise<void> {
    this.assignments.push({ ...decision });
    return Promise.resolve();
  }

  getLeadAssignmentHistory(leadId: string): Promise<AssignmentDecision[]> {
    return Promise.resolve(this.assignments.filter((a) => a.leadId === leadId));
  }

  getStats(_queueId: string, periodStart: Date, periodEnd: Date): Promise<AssignmentStats> {
    const relevantAssignments = this.assignments.filter(
      (a) => a.timestamp >= periodStart && a.timestamp <= periodEnd && a.outcome !== 'rejected'
    );

    const assignmentsPerAgent: Record<string, number> = {};
    let totalUtilization = 0;
    let rejectedCount = 0;
    let queuedCount = 0;

    for (const assignment of this.assignments.filter(
      (a) => a.timestamp >= periodStart && a.timestamp <= periodEnd
    )) {
      if (assignment.outcome === 'rejected') {
        rejectedCount++;
      } else if (assignment.outcome === 'queued') {
        queuedCount++;
      } else if (assignment.selectedAgentId) {
        assignmentsPerAgent[assignment.selectedAgentId] =
          (assignmentsPerAgent[assignment.selectedAgentId] ?? 0) + 1;
      }

      // Calculate average utilization from considered agents
      for (const agent of assignment.consideredAgents) {
        totalUtilization += agent.capacityUtilization;
      }
    }

    const totalConsideredAgents = this.assignments.reduce(
      (sum, a) => sum + a.consideredAgents.length,
      0
    );

    return Promise.resolve({
      totalAssignments: relevantAssignments.length,
      assignmentsPerAgent,
      averageCapacityUtilization:
        totalConsideredAgents > 0 ? Math.round(totalUtilization / totalConsideredAgents) : 0,
      rejectedAssignments: rejectedCount,
      queuedAssignments: queuedCount,
      periodStart,
      periodEnd,
    });
  }

  // Helper methods for testing
  clear(): void {
    this.states.clear();
    this.assignments = [];
  }

  getAllAssignments(): AssignmentDecision[] {
    return [...this.assignments];
  }
}

// =============================================================================
// In-Memory Agent Repository
// =============================================================================

/**
 * In-memory implementation of AssignableAgentRepository
 */
export class InMemoryAssignableAgentRepository implements AssignableAgentRepository {
  private agents = new Map<string, AssignableAgent>();

  addAgent(agent: AssignableAgent): void {
    this.agents.set(agent.agentId, { ...agent });
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  getAssignableAgents(queueId: string): Promise<AssignableAgent[]> {
    return Promise.resolve(
      Array.from(this.agents.values()).filter(
        (a) => !a.teamId || a.teamId === queueId || queueId === 'default'
      )
    );
  }

  getAgentById(agentId: string): Promise<AssignableAgent | null> {
    return Promise.resolve(this.agents.get(agentId) ?? null);
  }

  incrementLeadCount(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentLeadCount++;
    }
    return Promise.resolve();
  }

  updateLastAssigned(agentId: string, timestamp: Date): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastAssignedAt = timestamp;
    }
    return Promise.resolve();
  }

  // Helper methods for testing
  clear(): void {
    this.agents.clear();
  }

  getAllAgents(): AssignableAgent[] {
    return Array.from(this.agents.values());
  }

  setAgentLeadCount(agentId: string, count: number): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentLeadCount = count;
    }
  }

  setAgentStatus(agentId: string, status: AgentAssignmentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
    }
  }
}
