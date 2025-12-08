/**
 * Flex Routing Adapter
 * H6 Milestone: Skill-Based Agent Routing
 *
 * Bridges the skill routing service with Twilio Flex TaskRouter.
 * Converts Flex workers to agent profiles and routes tasks using
 * skill-based matching.
 */
import { createLogger } from '@medicalcor/core';
import type {
  FlexWorker,
  AgentProfile,
  AgentSkill,
  TaskSkillRequirements,
} from '@medicalcor/types';
import {
  SkillRoutingService,
  type AgentRepository,
  type RoutingContext,
} from './skill-routing-service.js';

const logger = createLogger({ name: 'flex-routing-adapter' });

// =============================================================================
// Flex Client Interface (Port - to be implemented by infrastructure layer)
// =============================================================================

/**
 * Flex client interface for routing operations
 * This is a port interface - implementations live in @medicalcor/integrations
 */
export interface FlexClient {
  listWorkers(options?: { available?: boolean }): Promise<FlexWorker[]>;
  getWorker(workerSid: string): Promise<FlexWorker>;
  createTask(input: CreateTaskInput): Promise<{ taskSid: string }>;
}

/**
 * Input for creating a Flex task
 */
export interface CreateTaskInput {
  workflowSid: string;
  attributes: Record<string, unknown>;
  priority?: number;
  timeout?: number;
  taskChannel?: string;
}

// =============================================================================
// Interfaces
// =============================================================================

/**
 * Flex skill configuration
 * Maps Flex worker attributes to skill-based routing
 */
export interface FlexSkillMapping {
  // Attribute name in Flex -> Skill ID in routing system
  attributeToSkill: Map<string, string>;

  // Proficiency mapping (attribute value -> proficiency level)
  proficiencyMapping: Map<string, 'basic' | 'intermediate' | 'advanced' | 'expert'>;

  // Default proficiency for skills without explicit mapping
  defaultProficiency: 'basic' | 'intermediate' | 'advanced' | 'expert';
}

/**
 * Task attributes for Flex routing
 */
export interface FlexRoutingTask {
  callSid?: string;
  customerPhone?: string;
  procedureType?: string;
  urgencyLevel?: 'low' | 'normal' | 'high' | 'critical';
  channel?: 'voice' | 'whatsapp' | 'web' | 'chat';
  isVIP?: boolean;
  isExistingPatient?: boolean;
  leadScore?: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  language?: string;
  skillRequirements?: TaskSkillRequirements;
}

/**
 * Result of skill-based Flex routing
 */
export interface FlexRoutingResult {
  success: boolean;
  taskSid?: string;
  workerSid?: string;
  agentId?: string;
  queueSid?: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
  routingDecisionId: string;
  outcome: 'routed' | 'queued' | 'escalated' | 'rejected';
  reason: string;
}

// =============================================================================
// Flex Agent Repository Adapter
// =============================================================================

/**
 * Adapts FlexClient to AgentRepository interface
 * Converts Flex workers to agent profiles with skills
 */
export class FlexAgentRepositoryAdapter implements AgentRepository {
  private flexClient: FlexClient;
  private skillMapping: FlexSkillMapping;
  private agentCache = new Map<string, AgentProfile>();
  private cacheExpiryMs = 60000; // 1 minute cache
  private lastCacheRefresh = 0;

  constructor(flexClient: FlexClient, skillMapping?: Partial<FlexSkillMapping>) {
    this.flexClient = flexClient;
    this.skillMapping = {
      attributeToSkill: skillMapping?.attributeToSkill ?? new Map<string, string>(),
      proficiencyMapping:
        skillMapping?.proficiencyMapping ??
        new Map<string, 'basic' | 'intermediate' | 'advanced' | 'expert'>(),
      defaultProficiency: skillMapping?.defaultProficiency ?? 'intermediate',
    };
  }

  /**
   * Refresh agent cache from Flex
   */
  async refreshCache(): Promise<void> {
    const workers = await this.flexClient.listWorkers();
    this.agentCache.clear();

    for (const worker of workers) {
      const profile = this.workerToProfile(worker);
      this.agentCache.set(profile.agentId, profile);
    }

    this.lastCacheRefresh = Date.now();
    logger.debug({ agentCount: this.agentCache.size }, 'Agent cache refreshed from Flex');
  }

  /**
   * Check if cache needs refresh
   */
  private shouldRefreshCache(): boolean {
    return Date.now() - this.lastCacheRefresh > this.cacheExpiryMs;
  }

  /**
   * Convert Flex worker to agent profile
   */
  private workerToProfile(worker: FlexWorker): AgentProfile {
    const now = new Date();

    // Extract skills from worker attributes
    const skills: AgentSkill[] = [];

    // Add skills from worker.skills array
    for (const skillName of worker.skills) {
      const skillId = this.mapAttributeToSkill(skillName);
      if (skillId) {
        skills.push({
          agentId: worker.workerSid,
          skillId,
          proficiency: this.getProficiency(skillName),
          isActive: true,
          tasksCompleted: 0,
          assignedAt: now,
          updatedAt: now,
        });
      }
    }

    // Add language skills
    for (const lang of worker.languages) {
      skills.push({
        agentId: worker.workerSid,
        skillId: `language:${lang}`,
        proficiency: 'advanced',
        isActive: true,
        tasksCompleted: 0,
        assignedAt: now,
        updatedAt: now,
      });
    }

    // Map Flex activity to availability
    const availability = this.mapActivityToAvailability(worker.activityName);

    return {
      agentId: worker.workerSid,
      workerSid: worker.workerSid,
      name: worker.friendlyName,
      availability,
      maxConcurrentTasks: 1, // Default to 1 for voice
      currentTaskCount: worker.tasksInProgress,
      skills,
      primaryLanguages: worker.languages,
      secondaryLanguages: [],
      role: 'agent' as const,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Map Flex attribute name to skill ID
   */
  private mapAttributeToSkill(attributeName: string): string {
    // Check explicit mapping first
    const mapped = this.skillMapping.attributeToSkill.get(attributeName);
    if (mapped) {
      return mapped;
    }

    // Default mapping: prepend category based on name
    const lowerName = attributeName.toLowerCase();
    if (lowerName.includes('implant') || lowerName.includes('all-on')) {
      return `procedure:${lowerName}`;
    }
    if (lowerName.includes('ortho') || lowerName.includes('cosmetic')) {
      return `procedure:${lowerName}`;
    }
    if (lowerName.includes('billing') || lowerName.includes('scheduling')) {
      return `admin:${lowerName}`;
    }

    // Generic skill
    return `skill:${lowerName}`;
  }

  /**
   * Get proficiency level for a skill
   */
  private getProficiency(skillName: string): 'basic' | 'intermediate' | 'advanced' | 'expert' {
    return (
      this.skillMapping.proficiencyMapping.get(skillName) ?? this.skillMapping.defaultProficiency
    );
  }

  /**
   * Map Flex activity name to availability
   */
  private mapActivityToAvailability(
    activityName: FlexWorker['activityName']
  ): AgentProfile['availability'] {
    switch (activityName) {
      case 'available':
        return 'available';
      case 'busy':
        return 'busy';
      case 'break':
        return 'break';
      case 'wrap-up':
        return 'wrap-up';
      case 'offline':
        return 'offline';
      case 'unavailable':
        return 'away';
    }
  }

  // =============================================================================
  // AgentRepository Interface Implementation
  // =============================================================================

  async getAvailableAgents(teamId?: string): Promise<AgentProfile[]> {
    if (this.shouldRefreshCache()) {
      await this.refreshCache();
    }

    const agents = Array.from(this.agentCache.values());
    return agents.filter((a) => {
      if (a.availability !== 'available') return false;
      if (teamId && a.teamId !== teamId) return false;
      return true;
    });
  }

  async getAgentById(agentId: string): Promise<AgentProfile | null> {
    if (this.shouldRefreshCache()) {
      await this.refreshCache();
    }

    return this.agentCache.get(agentId) ?? null;
  }

  async getAgentsBySkill(
    skillId: string,
    minProficiency?: 'basic' | 'intermediate' | 'advanced' | 'expert'
  ): Promise<AgentProfile[]> {
    if (this.shouldRefreshCache()) {
      await this.refreshCache();
    }

    const agents = Array.from(this.agentCache.values());
    const proficiencyOrder = ['basic', 'intermediate', 'advanced', 'expert'];
    const minIndex = minProficiency ? proficiencyOrder.indexOf(minProficiency) : 0;

    return agents.filter((agent) => {
      const skill = agent.skills.find((s) => s.skillId === skillId && s.isActive);
      if (!skill) return false;

      if (minProficiency) {
        const agentIndex = proficiencyOrder.indexOf(skill.proficiency);
        if (agentIndex < minIndex) return false;
      }

      return true;
    });
  }

  updateAgentAvailability(
    agentId: string,
    availability: AgentProfile['availability']
  ): Promise<void> {
    const agent = this.agentCache.get(agentId);
    if (agent) {
      agent.availability = availability;
      agent.updatedAt = new Date();
    }

    // Note: In production, this would also update Flex worker activity
    logger.info({ agentId, availability }, 'Agent availability updated in cache');
    return Promise.resolve();
  }
}

// =============================================================================
// Flex Routing Adapter
// =============================================================================

/**
 * Main adapter for skill-based routing with Twilio Flex
 */
export class FlexRoutingAdapter {
  private flexClient: FlexClient;
  private routingService: SkillRoutingService;
  private workflowSid: string;

  constructor(options: {
    flexClient: FlexClient;
    routingService: SkillRoutingService;
    workflowSid: string;
  }) {
    this.flexClient = options.flexClient;
    this.routingService = options.routingService;
    this.workflowSid = options.workflowSid;
  }

  /**
   * Route a task using skill-based matching
   */
  async routeTask(task: FlexRoutingTask): Promise<FlexRoutingResult> {
    // Build routing context
    const context: RoutingContext = {
      taskId: task.callSid,
      callSid: task.callSid,
      procedureType: task.procedureType,
      urgencyLevel: task.urgencyLevel,
      channel: task.channel,
      isVIP: task.isVIP,
      isExistingPatient: task.isExistingPatient,
      leadScore: task.leadScore,
      language: task.language,
    };

    // Build skill requirements
    const requirements = task.skillRequirements ?? {
      requiredSkills: [],
      preferredSkills: [],
      preferredLanguages: task.language ? [task.language] : [],
      requiredLanguage: task.language,
      excludeAgentIds: [],
      preferAgentIds: [],
      priority: this.mapUrgencyToPriority(task.urgencyLevel),
    };

    // Perform skill-based routing
    const decision = await this.routingService.route(requirements, context);

    logger.info(
      {
        decisionId: decision.decisionId,
        outcome: decision.outcome,
        agentId: decision.selectedAgentId,
        processingTimeMs: decision.processingTimeMs,
      },
      'Skill-based routing decision made'
    );

    // If routed to an agent, create Flex task
    if (decision.outcome === 'routed' && decision.selectedWorkerSid) {
      try {
        const flexTask = await this.createFlexTask(task, decision.selectedWorkerSid);
        return {
          success: true,
          taskSid: flexTask.taskSid,
          workerSid: decision.selectedWorkerSid,
          agentId: decision.selectedAgentId,
          routingDecisionId: decision.decisionId,
          outcome: 'routed',
          reason: decision.selectionReason,
        };
      } catch (error) {
        logger.error({ error, decisionId: decision.decisionId }, 'Failed to create Flex task');
        // Fall through to queue the task
      }
    }

    // If queued
    if (decision.outcome === 'queued') {
      return {
        success: true,
        queueSid: decision.queueId,
        queuePosition: decision.queuePosition,
        estimatedWaitTime: decision.estimatedWaitTime,
        routingDecisionId: decision.decisionId,
        outcome: 'queued',
        reason: decision.selectionReason,
      };
    }

    // If escalated
    if (decision.outcome === 'escalated') {
      return {
        success: true,
        routingDecisionId: decision.decisionId,
        outcome: 'escalated',
        reason: decision.selectionReason,
      };
    }

    // Rejected
    return {
      success: false,
      routingDecisionId: decision.decisionId,
      outcome: 'rejected',
      reason: decision.selectionReason,
    };
  }

  /**
   * Create a Flex task for the selected worker
   */
  private async createFlexTask(
    task: FlexRoutingTask,
    targetWorkerSid: string
  ): Promise<{ taskSid: string }> {
    const taskInput: CreateTaskInput = {
      workflowSid: this.workflowSid,
      attributes: {
        call_sid: task.callSid,
        customer_phone: task.customerPhone,
        procedure_type: task.procedureType,
        urgency_level: task.urgencyLevel,
        channel: task.channel,
        is_vip: task.isVIP,
        is_existing_patient: task.isExistingPatient,
        lead_score: task.leadScore,
        language: task.language,
        target_worker_sid: targetWorkerSid,
        routing_type: 'skill_based',
      },
      priority: this.mapUrgencyToPriority(task.urgencyLevel),
      taskChannel: task.channel === 'voice' ? 'voice' : 'chat',
    };

    const flexTask = await this.flexClient.createTask(taskInput);
    return { taskSid: flexTask.taskSid };
  }

  /**
   * Map urgency level to task priority (0-100)
   */
  private mapUrgencyToPriority(urgency?: 'low' | 'normal' | 'high' | 'critical'): number {
    switch (urgency) {
      case 'critical':
        return 100;
      case 'high':
        return 75;
      case 'normal':
        return 50;
      case 'low':
        return 25;
      case undefined:
        return 50;
    }
  }

  /**
   * Get available agents with their skill profiles
   */
  async getAvailableAgentsWithSkills(): Promise<AgentProfile[]> {
    const workers = await this.flexClient.listWorkers({ available: true });
    // This would normally use the FlexAgentRepositoryAdapter
    // Simplified implementation for direct use
    return workers.map((w: FlexWorker) => ({
      agentId: w.workerSid,
      workerSid: w.workerSid,
      name: w.friendlyName,
      availability: w.available ? ('available' as const) : ('busy' as const),
      maxConcurrentTasks: 1,
      currentTaskCount: w.tasksInProgress,
      skills: w.skills.map((skillName: string) => ({
        agentId: w.workerSid,
        skillId: `skill:${skillName.toLowerCase()}`,
        proficiency: 'intermediate' as const,
        isActive: true,
        tasksCompleted: 0,
        assignedAt: new Date(),
        updatedAt: new Date(),
      })),
      primaryLanguages: w.languages,
      secondaryLanguages: [],
      role: 'agent' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Flex agent repository adapter
 */
export function createFlexAgentRepository(
  flexClient: FlexClient,
  skillMapping?: Partial<FlexSkillMapping>
): FlexAgentRepositoryAdapter {
  return new FlexAgentRepositoryAdapter(flexClient, skillMapping);
}

/**
 * Create a Flex routing adapter
 */
export function createFlexRoutingAdapter(options: {
  flexClient: FlexClient;
  routingService: SkillRoutingService;
  workflowSid: string;
}): FlexRoutingAdapter {
  return new FlexRoutingAdapter(options);
}

/**
 * Create a complete skill-based routing setup for Flex
 */
export function createFlexSkillRouting(options: {
  flexClient: FlexClient;
  workflowSid: string;
  skillMapping?: Partial<FlexSkillMapping>;
}): {
  agentRepository: FlexAgentRepositoryAdapter;
  routingService: SkillRoutingService;
  adapter: FlexRoutingAdapter;
} {
  const agentRepository = createFlexAgentRepository(options.flexClient, options.skillMapping);

  const routingService = new SkillRoutingService({
    agentRepository,
  });

  const adapter = createFlexRoutingAdapter({
    flexClient: options.flexClient,
    routingService,
    workflowSid: options.workflowSid,
  });

  return {
    agentRepository,
    routingService,
    adapter,
  };
}
