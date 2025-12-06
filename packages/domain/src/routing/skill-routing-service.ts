/**
 * Skill-Based Routing Service
 * H6 Milestone: Intelligent Agent Routing
 *
 * Routes tasks/calls to agents based on skill requirements,
 * proficiency levels, availability, and routing rules.
 */
import { createLogger } from '@medicalcor/core';
import type {
  AgentProfile,
  AgentSkill,
  AgentMatchScore,
  RoutingDecision,
  RoutingRule,
  SkillRequirement,
  TaskSkillRequirements,
  SkillRoutingConfig,
  ProficiencyLevel,
  RoutingStrategy,
  FallbackBehavior,
} from '@medicalcor/types';
import { PROFICIENCY_WEIGHTS } from '@medicalcor/types';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger({ name: 'skill-routing-service' });

// =============================================================================
// Interfaces
// =============================================================================

/**
 * Repository interface for agent data
 */
export interface AgentRepository {
  getAvailableAgents(teamId?: string): Promise<AgentProfile[]>;
  getAgentById(agentId: string): Promise<AgentProfile | null>;
  getAgentsBySkill(skillId: string, minProficiency?: ProficiencyLevel): Promise<AgentProfile[]>;
  updateAgentAvailability(
    agentId: string,
    availability: AgentProfile['availability']
  ): Promise<void>;
}

/**
 * Repository interface for routing rules
 */
export interface RoutingRuleRepository {
  getActiveRules(): Promise<RoutingRule[]>;
  getRuleById(ruleId: string): Promise<RoutingRule | null>;
  getRulesForConditions(conditions: Partial<RoutingRule['conditions']>): Promise<RoutingRule[]>;
}

/**
 * Queue interface for pending tasks
 */
export interface RoutingQueue {
  enqueue(
    taskId: string,
    requirements: TaskSkillRequirements,
    priority: number
  ): Promise<{ queueId: string; position: number }>;
  dequeue(queueId: string): Promise<string | null>;
  getPosition(taskId: string): Promise<number | null>;
  getEstimatedWaitTime(queueId: string): Promise<number>;
}

/**
 * Routing context for a specific request
 */
export interface RoutingContext {
  taskId?: string;
  callSid?: string;
  procedureType?: string;
  urgencyLevel?: 'low' | 'normal' | 'high' | 'critical';
  channel?: 'voice' | 'whatsapp' | 'web' | 'chat';
  isVIP?: boolean;
  isExistingPatient?: boolean;
  leadScore?: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  language?: string;
  timestamp?: Date;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: SkillRoutingConfig = {
  defaultStrategy: 'best_match',
  defaultFallback: 'queue',
  weights: {
    skillMatch: 50,
    proficiencyBonus: 20,
    availabilityScore: 20,
    preferenceScore: 10,
  },
  thresholds: {
    minimumMatchScore: 30,
    proficiencyGap: 1,
    maxConcurrentTaskRatio: 0.8,
  },
  queue: {
    maxWaitTime: 600,
    escalationThreshold: 300,
    rebalanceInterval: 60,
  },
  features: {
    enableSkillInheritance: true,
    enableProficiencyDowngrade: true,
    enableCrossTeamRouting: false,
    enableAffinityRouting: true,
  },
};

// =============================================================================
// Skill Routing Service
// =============================================================================

export class SkillRoutingService {
  private config: SkillRoutingConfig;
  private agentRepo: AgentRepository;
  private ruleRepo: RoutingRuleRepository | null;
  private queue: RoutingQueue | null;

  // Skill inheritance cache (skillId -> parentSkillIds)
  private skillHierarchy: Map<string, string[]> = new Map();

  constructor(options: {
    config?: Partial<SkillRoutingConfig>;
    agentRepository: AgentRepository;
    ruleRepository?: RoutingRuleRepository;
    queue?: RoutingQueue;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.agentRepo = options.agentRepository;
    this.ruleRepo = options.ruleRepository ?? null;
    this.queue = options.queue ?? null;
  }

  // =============================================================================
  // Main Routing Entry Point
  // =============================================================================

  /**
   * Route a task/call to the best matching agent
   */
  async route(
    requirements: TaskSkillRequirements,
    context: RoutingContext = {}
  ): Promise<RoutingDecision> {
    const startTime = Date.now();
    const decisionId = uuidv4();

    logger.info({ decisionId, context }, 'Starting skill-based routing');

    try {
      // Step 1: Find applicable routing rule
      const rule = await this.findApplicableRule(context);
      const effectiveRequirements = rule
        ? this.mergeRequirements(requirements, rule.routing.skillRequirements)
        : requirements;

      const strategy = rule?.routing.strategy ?? this.config.defaultStrategy;
      const fallbackBehavior = rule?.routing.fallbackBehavior ?? this.config.defaultFallback;

      // Step 2: Get candidate agents
      const candidates = await this.getCandidateAgents(effectiveRequirements);

      if (candidates.length === 0) {
        logger.warn({ decisionId }, 'No candidate agents found');
        return this.handleNoAgents(decisionId, requirements, fallbackBehavior, startTime, rule);
      }

      // Step 3: Score all candidates
      const scoredCandidates = await this.scoreAgents(candidates, effectiveRequirements);

      // Step 4: Filter by minimum score
      const qualifiedCandidates = scoredCandidates.filter(
        (c) => c.totalScore >= this.config.thresholds.minimumMatchScore
      );

      if (qualifiedCandidates.length === 0) {
        logger.warn({ decisionId }, 'No agents meet minimum score threshold');
        return this.handleNoAgents(decisionId, requirements, fallbackBehavior, startTime, rule);
      }

      // Step 5: Apply routing strategy to select best agent
      const selectedAgent = this.selectAgent(qualifiedCandidates, strategy);

      logger.info(
        {
          decisionId,
          agentId: selectedAgent.agentId,
          score: selectedAgent.totalScore,
        },
        'Agent selected for routing'
      );

      return {
        decisionId,
        timestamp: new Date(),
        taskId: context.taskId,
        callSid: context.callSid,
        requirements: effectiveRequirements,
        appliedRuleId: rule?.ruleId,
        appliedRuleName: rule?.name,
        outcome: 'routed',
        selectedAgentId: selectedAgent.agentId,
        selectedAgentName: selectedAgent.agentName,
        selectedWorkerSid: selectedAgent.workerSid,
        candidateAgents: scoredCandidates,
        selectionReason: `Best match using ${strategy} strategy with score ${selectedAgent.totalScore}`,
        fallbacksAttempted: 0,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error, decisionId }, 'Routing failed');
      throw error;
    }
  }

  // =============================================================================
  // Rule Matching
  // =============================================================================

  /**
   * Find the best matching routing rule for the context
   */
  private async findApplicableRule(context: RoutingContext): Promise<RoutingRule | null> {
    if (!this.ruleRepo) {
      return null;
    }

    const rules = await this.ruleRepo.getActiveRules();
    const now = context.timestamp ?? new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Filter rules by conditions
    const matchingRules = rules.filter((rule) => {
      const conditions = rule.conditions;

      // Check procedure type
      if (conditions.procedureTypes && context.procedureType) {
        if (!conditions.procedureTypes.includes(context.procedureType)) {
          return false;
        }
      }

      // Check urgency level
      if (conditions.urgencyLevels && context.urgencyLevel) {
        if (!conditions.urgencyLevels.includes(context.urgencyLevel)) {
          return false;
        }
      }

      // Check channel
      if (conditions.channels && context.channel) {
        if (!conditions.channels.includes(context.channel)) {
          return false;
        }
      }

      // Check time range
      if (conditions.timeRange) {
        const { startHour, endHour, daysOfWeek } = conditions.timeRange;
        if (currentHour < startHour || currentHour >= endHour) {
          return false;
        }
        if (daysOfWeek && !daysOfWeek.includes(currentDay)) {
          return false;
        }
      }

      // Check VIP status
      if (conditions.isVIP !== undefined && context.isVIP !== undefined) {
        if (conditions.isVIP !== context.isVIP) {
          return false;
        }
      }

      // Check existing patient
      if (conditions.isExistingPatient !== undefined && context.isExistingPatient !== undefined) {
        if (conditions.isExistingPatient !== context.isExistingPatient) {
          return false;
        }
      }

      // Check lead score
      if (conditions.leadScore && context.leadScore) {
        if (conditions.leadScore !== context.leadScore) {
          return false;
        }
      }

      return true;
    });

    // Sort by priority (highest first) and return the first
    matchingRules.sort((a, b) => b.priority - a.priority);
    return matchingRules[0] ?? null;
  }

  /**
   * Merge incoming requirements with rule requirements
   */
  private mergeRequirements(
    incoming: TaskSkillRequirements,
    rule: TaskSkillRequirements
  ): TaskSkillRequirements {
    return {
      requiredSkills: [...incoming.requiredSkills, ...rule.requiredSkills],
      preferredSkills: [...incoming.preferredSkills, ...rule.preferredSkills],
      requiredLanguage: incoming.requiredLanguage ?? rule.requiredLanguage,
      preferredLanguages: [...incoming.preferredLanguages, ...rule.preferredLanguages],
      excludeAgentIds: [...incoming.excludeAgentIds, ...rule.excludeAgentIds],
      preferAgentIds: [...incoming.preferAgentIds, ...rule.preferAgentIds],
      teamId: incoming.teamId ?? rule.teamId,
      priority: Math.max(incoming.priority, rule.priority),
      slaDeadlineMinutes: incoming.slaDeadlineMinutes ?? rule.slaDeadlineMinutes,
    };
  }

  // =============================================================================
  // Agent Selection
  // =============================================================================

  /**
   * Get candidate agents based on requirements
   */
  private async getCandidateAgents(requirements: TaskSkillRequirements): Promise<AgentProfile[]> {
    let agents = await this.agentRepo.getAvailableAgents(requirements.teamId);

    // Filter out excluded agents
    if (requirements.excludeAgentIds.length > 0) {
      agents = agents.filter((a) => !requirements.excludeAgentIds.includes(a.agentId));
    }

    // Filter by availability
    agents = agents.filter(
      (a) =>
        a.availability === 'available' &&
        a.currentTaskCount < a.maxConcurrentTasks * this.config.thresholds.maxConcurrentTaskRatio
    );

    // Filter by required language
    if (requirements.requiredLanguage) {
      agents = agents.filter(
        (a) =>
          a.primaryLanguages.includes(requirements.requiredLanguage!) ||
          a.secondaryLanguages.includes(requirements.requiredLanguage!)
      );
    }

    return agents;
  }

  /**
   * Score all candidate agents
   */
  private async scoreAgents(
    agents: AgentProfile[],
    requirements: TaskSkillRequirements
  ): Promise<AgentMatchScore[]> {
    return agents.map((agent) => this.scoreAgent(agent, requirements));
  }

  /**
   * Calculate match score for a single agent
   */
  private scoreAgent(agent: AgentProfile, requirements: TaskSkillRequirements): AgentMatchScore {
    const scoreAdjustments: Array<{ reason: string; adjustment: number }> = [];
    const matchedSkills: AgentMatchScore['matchedSkills'] = [];

    // Calculate skill match score
    let skillScore = 0;
    let maxSkillScore = 0;

    // Score required skills
    for (const req of requirements.requiredSkills) {
      const agentSkill = this.findAgentSkill(agent, req.skillId);
      const weight = req.weight;
      maxSkillScore += weight;

      if (agentSkill) {
        const profMatch = this.calculateProficiencyMatch(
          agentSkill.proficiency,
          req.minimumProficiency
        );
        const skillPoints = weight * profMatch;
        skillScore += skillPoints;

        matchedSkills.push({
          skillId: req.skillId,
          skillName: req.skillId,
          requiredProficiency: req.minimumProficiency,
          agentProficiency: agentSkill.proficiency,
          matchType: req.matchType,
          score: skillPoints,
        });

        if (profMatch >= 1) {
          scoreAdjustments.push({
            reason: `Skill ${req.skillId} meets requirement`,
            adjustment: skillPoints,
          });
        } else {
          scoreAdjustments.push({
            reason: `Skill ${req.skillId} below required proficiency`,
            adjustment: skillPoints - weight,
          });
        }
      } else {
        matchedSkills.push({
          skillId: req.skillId,
          skillName: req.skillId,
          requiredProficiency: req.minimumProficiency,
          agentProficiency: 'basic',
          matchType: req.matchType,
          score: 0,
        });
        scoreAdjustments.push({
          reason: `Missing required skill: ${req.skillId}`,
          adjustment: -weight,
        });
      }
    }

    // Score preferred skills
    for (const pref of requirements.preferredSkills) {
      const agentSkill = this.findAgentSkill(agent, pref.skillId);
      const bonusWeight = pref.weight * 0.5; // Preferred skills worth 50% of required

      if (agentSkill) {
        const profMatch = this.calculateProficiencyMatch(
          agentSkill.proficiency,
          pref.minimumProficiency
        );
        const bonus = bonusWeight * profMatch;
        skillScore += bonus;
        maxSkillScore += bonusWeight;

        scoreAdjustments.push({
          reason: `Preferred skill ${pref.skillId} bonus`,
          adjustment: bonus,
        });
      }
    }

    // Normalize skill score to 0-100
    const normalizedSkillScore = maxSkillScore > 0 ? (skillScore / maxSkillScore) * 100 : 0;

    // Calculate availability score
    const taskRatio = agent.currentTaskCount / agent.maxConcurrentTasks;
    const availabilityScore = (1 - taskRatio) * 100;

    // Calculate preference score
    let preferenceScore = 50; // Base score
    if (requirements.preferAgentIds.includes(agent.agentId)) {
      preferenceScore = 100;
      scoreAdjustments.push({
        reason: 'Preferred agent',
        adjustment: 50,
      });
    }

    // Calculate language bonus
    if (requirements.preferredLanguages.length > 0) {
      const hasPreferred = requirements.preferredLanguages.some(
        (lang) =>
          agent.primaryLanguages.includes(lang) || agent.secondaryLanguages.includes(lang)
      );
      if (hasPreferred) {
        preferenceScore += 10;
        scoreAdjustments.push({
          reason: 'Preferred language match',
          adjustment: 10,
        });
      }
    }

    // Calculate total weighted score
    const weights = this.config.weights;
    const totalScore =
      (normalizedSkillScore * weights.skillMatch +
        availabilityScore * weights.availabilityScore +
        preferenceScore * weights.preferenceScore) /
      (weights.skillMatch + weights.availabilityScore + weights.preferenceScore);

    return {
      agentId: agent.agentId,
      agentName: agent.name,
      workerSid: agent.workerSid,
      totalScore: Math.round(totalScore * 100) / 100,
      skillScore: Math.round(normalizedSkillScore * 100) / 100,
      availabilityScore: Math.round(availabilityScore * 100) / 100,
      preferenceScore: Math.round(preferenceScore * 100) / 100,
      matchedSkills,
      currentTaskCount: agent.currentTaskCount,
      availability: agent.availability,
      scoreAdjustments,
    };
  }

  /**
   * Find agent skill by ID, including inherited skills
   */
  private findAgentSkill(agent: AgentProfile, skillId: string): AgentSkill | undefined {
    // Direct skill match
    const directMatch = agent.skills.find((s) => s.skillId === skillId && s.isActive);
    if (directMatch) {
      return directMatch;
    }

    // Check skill inheritance if enabled
    if (this.config.features.enableSkillInheritance) {
      const parentSkills = this.skillHierarchy.get(skillId) ?? [];
      for (const parentId of parentSkills) {
        const parentMatch = agent.skills.find((s) => s.skillId === parentId && s.isActive);
        if (parentMatch) {
          return parentMatch;
        }
      }
    }

    return undefined;
  }

  /**
   * Calculate proficiency match ratio
   * Returns 1.0 for exact match, >1.0 for exceeding, <1.0 for below
   */
  private calculateProficiencyMatch(
    agentLevel: ProficiencyLevel,
    requiredLevel: ProficiencyLevel
  ): number {
    const agentWeight = PROFICIENCY_WEIGHTS[agentLevel];
    const requiredWeight = PROFICIENCY_WEIGHTS[requiredLevel];

    if (agentWeight >= requiredWeight) {
      // Agent meets or exceeds requirement
      // Bonus for exceeding (up to 25% bonus)
      const bonus = Math.min((agentWeight - requiredWeight) * 0.1, 0.25);
      return 1 + bonus;
    }

    // Agent below requirement
    const gap = requiredWeight - agentWeight;
    if (gap > this.config.thresholds.proficiencyGap) {
      // Too big a gap - severe penalty
      return 0.25;
    }

    // Small gap - moderate penalty
    return 0.75 - gap * 0.15;
  }

  /**
   * Select the best agent based on strategy
   */
  private selectAgent(
    candidates: AgentMatchScore[],
    strategy: RoutingStrategy
  ): AgentMatchScore {
    switch (strategy) {
      case 'best_match':
        // Sort by total score descending
        candidates.sort((a, b) => b.totalScore - a.totalScore);
        return candidates[0]!;

      case 'round_robin':
        // Simple round robin - just pick first qualified
        return candidates[0]!;

      case 'least_occupied':
        // Sort by current task count ascending, then by score
        candidates.sort((a, b) => {
          if (a.currentTaskCount !== b.currentTaskCount) {
            return a.currentTaskCount - b.currentTaskCount;
          }
          return b.totalScore - a.totalScore;
        });
        return candidates[0]!;

      case 'longest_idle':
        // Would need last activity time - fallback to least_occupied
        candidates.sort((a, b) => a.currentTaskCount - b.currentTaskCount);
        return candidates[0]!;

      case 'skills_first':
        // Sort by skill score first, then availability
        candidates.sort((a, b) => {
          if (Math.abs(a.skillScore - b.skillScore) > 10) {
            return b.skillScore - a.skillScore;
          }
          return a.currentTaskCount - b.currentTaskCount;
        });
        return candidates[0]!;

      default:
        return candidates[0]!;
    }
  }

  // =============================================================================
  // Fallback Handling
  // =============================================================================

  /**
   * Handle case when no suitable agents are available
   */
  private async handleNoAgents(
    decisionId: string,
    requirements: TaskSkillRequirements,
    fallbackBehavior: FallbackBehavior,
    startTime: number,
    rule?: RoutingRule | null
  ): Promise<RoutingDecision> {
    switch (fallbackBehavior) {
      case 'queue':
        if (this.queue) {
          const queueResult = await this.queue.enqueue(
            decisionId,
            requirements,
            requirements.priority
          );
          const waitTime = await this.queue.getEstimatedWaitTime(queueResult.queueId);

          return {
            decisionId,
            timestamp: new Date(),
            requirements,
            appliedRuleId: rule?.ruleId,
            appliedRuleName: rule?.name,
            outcome: 'queued',
            candidateAgents: [],
            selectionReason: 'No available agents - task queued',
            queueId: queueResult.queueId,
            queuePosition: queueResult.position,
            estimatedWaitTime: waitTime,
            fallbacksAttempted: 1,
            processingTimeMs: Date.now() - startTime,
          };
        }
        // Fall through to reject if no queue
        break;

      case 'downgrade_proficiency':
        // Could implement recursive retry with lower proficiency requirements
        logger.info({ decisionId }, 'Proficiency downgrade not yet implemented');
        break;

      case 'expand_team':
        if (this.config.features.enableCrossTeamRouting) {
          // Retry without team restriction
          const expandedRequirements = { ...requirements, teamId: undefined };
          const agents = await this.agentRepo.getAvailableAgents();
          if (agents.length > 0) {
            const scored = await this.scoreAgents(agents, expandedRequirements);
            const qualified = scored.filter(
              (c) => c.totalScore >= this.config.thresholds.minimumMatchScore
            );
            if (qualified.length > 0) {
              const selected = this.selectAgent(qualified, this.config.defaultStrategy);
              return {
                decisionId,
                timestamp: new Date(),
                requirements: expandedRequirements,
                appliedRuleId: rule?.ruleId,
                appliedRuleName: rule?.name,
                outcome: 'fallback',
                selectedAgentId: selected.agentId,
                selectedAgentName: selected.agentName,
                selectedWorkerSid: selected.workerSid,
                candidateAgents: scored,
                selectionReason: 'Cross-team routing fallback',
                fallbacksAttempted: 1,
                originalRuleId: rule?.ruleId,
                processingTimeMs: Date.now() - startTime,
              };
            }
          }
        }
        break;

      case 'escalate':
        return {
          decisionId,
          timestamp: new Date(),
          requirements,
          appliedRuleId: rule?.ruleId,
          appliedRuleName: rule?.name,
          outcome: 'escalated',
          candidateAgents: [],
          selectionReason: 'No suitable agents - escalated to supervisor',
          fallbacksAttempted: 1,
          processingTimeMs: Date.now() - startTime,
        };
    }

    // Default: reject
    return {
      decisionId,
      timestamp: new Date(),
      requirements,
      appliedRuleId: rule?.ruleId,
      appliedRuleName: rule?.name,
      outcome: 'rejected',
      candidateAgents: [],
      selectionReason: 'No suitable agents and fallback exhausted',
      fallbacksAttempted: 1,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // =============================================================================
  // Skill Hierarchy Management
  // =============================================================================

  /**
   * Register skill inheritance relationship
   */
  registerSkillHierarchy(skillId: string, parentSkillIds: string[]): void {
    this.skillHierarchy.set(skillId, parentSkillIds);
  }

  /**
   * Clear skill hierarchy cache
   */
  clearSkillHierarchy(): void {
    this.skillHierarchy.clear();
  }

  // =============================================================================
  // Utility Methods
  // =============================================================================

  /**
   * Get current configuration
   */
  getConfig(): Readonly<SkillRoutingConfig> {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SkillRoutingConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info({ config: this.config }, 'Routing configuration updated');
  }

  /**
   * Check if an agent matches requirements (without scoring)
   */
  async checkAgentMatch(
    agentId: string,
    requirements: TaskSkillRequirements
  ): Promise<{ matches: boolean; missingSkills: string[] }> {
    const agent = await this.agentRepo.getAgentById(agentId);
    if (!agent) {
      return { matches: false, missingSkills: [] };
    }

    const missingSkills: string[] = [];
    for (const req of requirements.requiredSkills) {
      if (req.matchType === 'required') {
        const skill = this.findAgentSkill(agent, req.skillId);
        if (!skill) {
          missingSkills.push(req.skillId);
        } else {
          const profMatch = this.calculateProficiencyMatch(skill.proficiency, req.minimumProficiency);
          if (profMatch < 0.5) {
            missingSkills.push(`${req.skillId} (proficiency too low)`);
          }
        }
      }
    }

    return {
      matches: missingSkills.length === 0,
      missingSkills,
    };
  }

  /**
   * Get routing statistics (for monitoring)
   */
  getStats(): {
    skillHierarchySize: number;
  } {
    return {
      skillHierarchySize: this.skillHierarchy.size,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a configured skill routing service
 */
export function createSkillRoutingService(options: {
  config?: Partial<SkillRoutingConfig>;
  agentRepository: AgentRepository;
  ruleRepository?: RoutingRuleRepository;
  queue?: RoutingQueue;
}): SkillRoutingService {
  return new SkillRoutingService(options);
}
