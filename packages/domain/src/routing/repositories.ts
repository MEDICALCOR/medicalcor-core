/**
 * In-Memory Repository Implementations for Skill-Based Routing
 * H6 Milestone: Intelligent Agent Routing
 *
 * These implementations are suitable for testing and development.
 * Production should use PostgreSQL-backed repositories.
 */

import type {
  AgentProfile,
  RoutingRule,
  TaskSkillRequirements,
  ProficiencyLevel,
} from '@medicalcor/types';
import type { AgentRepository, RoutingRuleRepository, RoutingQueue } from './skill-routing-service.js';
import { PROFICIENCY_WEIGHTS } from '@medicalcor/types';

// =============================================================================
// In-Memory Agent Repository
// =============================================================================

export class InMemoryAgentRepository implements AgentRepository {
  private agents: Map<string, AgentProfile> = new Map();

  /**
   * Add or update an agent
   */
  addAgent(agent: AgentProfile): void {
    this.agents.set(agent.agentId, agent);
  }

  /**
   * Remove an agent
   */
  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * Get all agents (for debugging)
   */
  getAllAgents(): AgentProfile[] {
    return Array.from(this.agents.values());
  }

  /**
   * Clear all agents
   */
  clear(): void {
    this.agents.clear();
  }

  // AgentRepository interface implementation

  async getAvailableAgents(teamId?: string): Promise<AgentProfile[]> {
    const agents = Array.from(this.agents.values());

    return agents.filter((agent) => {
      // Filter by availability
      if (agent.availability !== 'available') {
        return false;
      }

      // Filter by team if specified
      if (teamId && agent.teamId !== teamId) {
        return false;
      }

      return true;
    });
  }

  async getAgentById(agentId: string): Promise<AgentProfile | null> {
    return this.agents.get(agentId) ?? null;
  }

  async getAgentsBySkill(
    skillId: string,
    minProficiency?: ProficiencyLevel
  ): Promise<AgentProfile[]> {
    const agents = Array.from(this.agents.values());
    const minWeight = minProficiency ? PROFICIENCY_WEIGHTS[minProficiency] : 0;

    return agents.filter((agent) => {
      const skill = agent.skills.find((s) => s.skillId === skillId && s.isActive);
      if (!skill) {
        return false;
      }

      if (minProficiency) {
        const agentWeight = PROFICIENCY_WEIGHTS[skill.proficiency];
        if (agentWeight < minWeight) {
          return false;
        }
      }

      return true;
    });
  }

  async updateAgentAvailability(
    agentId: string,
    availability: AgentProfile['availability']
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.availability = availability;
      agent.updatedAt = new Date();
    }
  }

  /**
   * Update agent task count
   */
  async updateAgentTaskCount(agentId: string, taskCount: number): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentTaskCount = taskCount;
      agent.updatedAt = new Date();
    }
  }
}

// =============================================================================
// In-Memory Routing Rule Repository
// =============================================================================

export class InMemoryRoutingRuleRepository implements RoutingRuleRepository {
  private rules: Map<string, RoutingRule> = new Map();

  /**
   * Add or update a rule
   */
  addRule(rule: RoutingRule): void {
    this.rules.set(rule.ruleId, rule);
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Get all rules (for debugging)
   */
  getAllRules(): RoutingRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Clear all rules
   */
  clear(): void {
    this.rules.clear();
  }

  // RoutingRuleRepository interface implementation

  async getActiveRules(): Promise<RoutingRule[]> {
    return Array.from(this.rules.values())
      .filter((rule) => rule.isActive)
      .sort((a, b) => b.priority - a.priority);
  }

  async getRuleById(ruleId: string): Promise<RoutingRule | null> {
    return this.rules.get(ruleId) ?? null;
  }

  async getRulesForConditions(
    conditions: Partial<RoutingRule['conditions']>
  ): Promise<RoutingRule[]> {
    const activeRules = await this.getActiveRules();

    return activeRules.filter((rule) => {
      const ruleConditions = rule.conditions;

      // Check procedure type match
      if (conditions.procedureTypes && ruleConditions.procedureTypes) {
        const hasMatch = conditions.procedureTypes.some((pt) =>
          ruleConditions.procedureTypes!.includes(pt)
        );
        if (!hasMatch) return false;
      }

      // Check urgency level match
      if (conditions.urgencyLevels && ruleConditions.urgencyLevels) {
        const hasMatch = conditions.urgencyLevels.some((ul) =>
          ruleConditions.urgencyLevels!.includes(ul)
        );
        if (!hasMatch) return false;
      }

      // Check channel match
      if (conditions.channels && ruleConditions.channels) {
        const hasMatch = conditions.channels.some((ch) => ruleConditions.channels!.includes(ch));
        if (!hasMatch) return false;
      }

      return true;
    });
  }
}

// =============================================================================
// In-Memory Routing Queue
// =============================================================================

interface QueuedTask {
  taskId: string;
  requirements: TaskSkillRequirements;
  priority: number;
  queuedAt: Date;
  queueId: string;
}

export class InMemoryRoutingQueue implements RoutingQueue {
  private queues: Map<string, QueuedTask[]> = new Map();
  private taskToQueue: Map<string, string> = new Map();
  private defaultQueueId = 'default';

  constructor() {
    this.queues.set(this.defaultQueueId, []);
  }

  /**
   * Create a new queue
   */
  createQueue(queueId: string): void {
    if (!this.queues.has(queueId)) {
      this.queues.set(queueId, []);
    }
  }

  /**
   * Get queue length
   */
  getQueueLength(queueId: string): number {
    return this.queues.get(queueId)?.length ?? 0;
  }

  /**
   * Clear all queues
   */
  clear(): void {
    this.queues.clear();
    this.taskToQueue.clear();
    this.queues.set(this.defaultQueueId, []);
  }

  // RoutingQueue interface implementation

  async enqueue(
    taskId: string,
    requirements: TaskSkillRequirements,
    priority: number
  ): Promise<{ queueId: string; position: number }> {
    const queueId = requirements.teamId ?? this.defaultQueueId;

    if (!this.queues.has(queueId)) {
      this.queues.set(queueId, []);
    }

    const queue = this.queues.get(queueId)!;
    const task: QueuedTask = {
      taskId,
      requirements,
      priority,
      queuedAt: new Date(),
      queueId,
    };

    // Insert in priority order (higher priority first)
    let position = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (priority > queue[i]!.priority) {
        queue.splice(i, 0, task);
        position = i;
        break;
      }
    }

    if (position === queue.length) {
      queue.push(task);
    }

    this.taskToQueue.set(taskId, queueId);

    return { queueId, position: position + 1 };
  }

  async dequeue(queueId: string): Promise<string | null> {
    const queue = this.queues.get(queueId);
    if (!queue || queue.length === 0) {
      return null;
    }

    const task = queue.shift()!;
    this.taskToQueue.delete(task.taskId);
    return task.taskId;
  }

  async getPosition(taskId: string): Promise<number | null> {
    const queueId = this.taskToQueue.get(taskId);
    if (!queueId) {
      return null;
    }

    const queue = this.queues.get(queueId);
    if (!queue) {
      return null;
    }

    const index = queue.findIndex((t) => t.taskId === taskId);
    return index >= 0 ? index + 1 : null;
  }

  async getEstimatedWaitTime(queueId: string): Promise<number> {
    const queue = this.queues.get(queueId);
    if (!queue || queue.length === 0) {
      return 0;
    }

    // Estimate 120 seconds per task in queue
    return queue.length * 120;
  }

  /**
   * Remove a specific task from queue
   */
  async removeTask(taskId: string): Promise<boolean> {
    const queueId = this.taskToQueue.get(taskId);
    if (!queueId) {
      return false;
    }

    const queue = this.queues.get(queueId);
    if (!queue) {
      return false;
    }

    const index = queue.findIndex((t) => t.taskId === taskId);
    if (index >= 0) {
      queue.splice(index, 1);
      this.taskToQueue.delete(taskId);
      return true;
    }

    return false;
  }

  /**
   * Get all tasks in a queue
   */
  getQueueTasks(queueId: string): QueuedTask[] {
    return this.queues.get(queueId) ?? [];
  }
}
