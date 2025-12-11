/**
 * Triage-Routing Integration
 * H6 Milestone: Skill-Based Agent Routing
 *
 * Integrates the triage service with skill-based routing.
 * Uses triage results to determine skill requirements for routing.
 */
import { createLogger } from '@medicalcor/core';
import type {
  TaskSkillRequirements,
  SkillRequirement,
  RoutingDecision,
  LeadScore,
  LeadChannel,
} from '@medicalcor/types';
import { STANDARD_SKILLS } from '@medicalcor/types';
import type { TriageResult, TriageInput, TriageService } from '../triage/triage-service.js';
import type { SkillRoutingService, RoutingContext } from './skill-routing-service.js';

const logger = createLogger({ name: 'triage-routing-integration' });

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for triage-to-routing mapping
 */
export interface TriageRoutingConfig {
  // Procedure to skill mapping
  procedureSkillMapping: Map<string, string[]>;

  // Urgency to priority mapping (0-100)
  urgencyPriorityMapping: {
    high_priority: number;
    high: number;
    normal: number;
    low: number;
  };

  // Lead score to priority boost
  leadScorePriorityBoost: {
    HOT: number;
    WARM: number;
    COLD: number;
    UNQUALIFIED: number;
  };

  // Channel to skill requirements
  channelSkillMapping: Map<LeadChannel, string[]>;

  // VIP/existing patient skill requirements
  vipSkillId?: string;
  escalationSkillId?: string;

  // Default skill requirements for routing
  defaultSkillRequirements: SkillRequirement[];

  // Whether to use suggested owner from triage as preferred agent
  useSuggestedOwnerAsPreference: boolean;
}

/**
 * Result of triage-based routing
 */
export interface TriageRoutingResult {
  triageResult: TriageResult;
  routingDecision: RoutingDecision;
  skillRequirements: TaskSkillRequirements;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: TriageRoutingConfig = {
  procedureSkillMapping: new Map([
    ['implant', [STANDARD_SKILLS.IMPLANTS.skillId]],
    ['all-on-x', [STANDARD_SKILLS.ALL_ON_X.skillId, STANDARD_SKILLS.IMPLANTS.skillId]],
    ['All-on-X', [STANDARD_SKILLS.ALL_ON_X.skillId, STANDARD_SKILLS.IMPLANTS.skillId]],
    ['orthodontics', [STANDARD_SKILLS.ORTHODONTICS.skillId]],
    ['general', [STANDARD_SKILLS.GENERAL_DENTISTRY.skillId]],
    ['cosmetic', [STANDARD_SKILLS.COSMETIC.skillId]],
    ['pediatric', [STANDARD_SKILLS.PEDIATRIC.skillId]],
  ]),

  urgencyPriorityMapping: {
    high_priority: 100,
    high: 75,
    normal: 50,
    low: 25,
  },

  leadScorePriorityBoost: {
    HOT: 20,
    WARM: 10,
    COLD: 0,
    UNQUALIFIED: -10,
  },

  channelSkillMapping: new Map([
    ['voice', []],
    ['whatsapp', []],
    ['web', []],
    ['referral', []],
  ]),

  vipSkillId: STANDARD_SKILLS.VIP.skillId,
  escalationSkillId: STANDARD_SKILLS.ESCALATIONS.skillId,

  defaultSkillRequirements: [
    {
      skillId: STANDARD_SKILLS.SCHEDULING.skillId,
      matchType: 'preferred',
      minimumProficiency: 'basic',
      weight: 25,
    },
  ],

  useSuggestedOwnerAsPreference: true,
};

// =============================================================================
// Triage Routing Integration
// =============================================================================

/**
 * Integrates triage assessment with skill-based routing
 */
export class TriageRoutingIntegration {
  private config: TriageRoutingConfig;
  private triageService: TriageService;
  private routingService: SkillRoutingService;

  constructor(options: {
    config?: Partial<TriageRoutingConfig>;
    triageService: TriageService;
    routingService: SkillRoutingService;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.triageService = options.triageService;
    this.routingService = options.routingService;
  }

  /**
   * Perform triage assessment and route to best matching agent
   */
  async triageAndRoute(
    input: TriageInput,
    additionalContext?: Partial<RoutingContext>
  ): Promise<TriageRoutingResult> {
    logger.info(
      { phone: input.leadScore, channel: input.channel },
      'Starting triage-based routing'
    );

    // Step 1: Perform triage assessment
    const triageResult = await this.triageService.assess(input);

    logger.info(
      {
        urgencyLevel: triageResult.urgencyLevel,
        routingRecommendation: triageResult.routingRecommendation,
        suggestedOwner: triageResult.suggestedOwner,
      },
      'Triage assessment completed'
    );

    // Step 2: Build skill requirements from triage result
    const skillRequirements = this.buildSkillRequirements(input, triageResult);

    // Step 3: Build routing context
    const routingContext = this.buildRoutingContext(input, triageResult, additionalContext);

    // Step 4: Perform skill-based routing
    const routingDecision = await this.routingService.route(skillRequirements, routingContext);

    logger.info(
      {
        decisionId: routingDecision.decisionId,
        outcome: routingDecision.outcome,
        agentId: routingDecision.selectedAgentId,
      },
      'Triage-based routing completed'
    );

    return {
      triageResult,
      routingDecision,
      skillRequirements,
    };
  }

  /**
   * Build skill requirements from triage result
   */
  private buildSkillRequirements(input: TriageInput, triage: TriageResult): TaskSkillRequirements {
    const requiredSkills: SkillRequirement[] = [];
    const preferredSkills: SkillRequirement[] = [...this.config.defaultSkillRequirements];

    this.addProcedureSkills(input.procedureInterest, triage.urgencyLevel, requiredSkills);
    this.addChannelSkills(input.channel, preferredSkills);
    this.addVipSkillIfApplicable(input.messageContent, requiredSkills);
    this.addEscalationSkillIfHighPriority(triage.urgencyLevel, preferredSkills);

    const priority = this.calculatePriority(triage.urgencyLevel, input.leadScore);
    const preferAgentIds = this.buildPreferredAgentIds(triage.suggestedOwner);

    return {
      requiredSkills,
      preferredSkills,
      preferredLanguages: [],
      excludeAgentIds: [],
      preferAgentIds,
      priority,
      slaDeadlineMinutes: this.getSlaFromRouting(triage.routingRecommendation),
    };
  }

  /**
   * Add procedure-based skills to required skills list
   */
  private addProcedureSkills(
    procedureInterest: string[] | undefined,
    urgencyLevel: TriageResult['urgencyLevel'],
    requiredSkills: SkillRequirement[]
  ): void {
    if (!procedureInterest) return;

    const proficiency = urgencyLevel === 'high_priority' ? 'advanced' : 'intermediate';

    for (const procedure of procedureInterest) {
      const skillIds = this.lookupProcedureSkills(procedure);
      for (const skillId of skillIds) {
        requiredSkills.push({
          skillId,
          matchType: 'required',
          minimumProficiency: proficiency,
          weight: 50,
        });
      }
    }
  }

  /**
   * Look up skill IDs for a procedure (case-insensitive)
   */
  private lookupProcedureSkills(procedure: string): string[] {
    return (
      this.config.procedureSkillMapping.get(procedure.toLowerCase()) ??
      this.config.procedureSkillMapping.get(procedure) ??
      []
    );
  }

  /**
   * Add channel-based skills to preferred skills list
   */
  private addChannelSkills(channel: LeadChannel, preferredSkills: SkillRequirement[]): void {
    const channelSkills = this.config.channelSkillMapping.get(channel);
    if (!channelSkills) return;

    for (const skillId of channelSkills) {
      preferredSkills.push({
        skillId,
        matchType: 'preferred',
        minimumProficiency: 'intermediate',
        weight: 25,
      });
    }
  }

  /**
   * Add VIP skill requirement if the message content indicates VIP status
   */
  private addVipSkillIfApplicable(
    messageContent: string,
    requiredSkills: SkillRequirement[]
  ): void {
    if (!this.triageService.isVIP(messageContent) || !this.config.vipSkillId) return;

    requiredSkills.push({
      skillId: this.config.vipSkillId,
      matchType: 'required',
      minimumProficiency: 'advanced',
      weight: 75,
    });
  }

  /**
   * Add escalation skill for high priority cases
   */
  private addEscalationSkillIfHighPriority(
    urgencyLevel: TriageResult['urgencyLevel'],
    preferredSkills: SkillRequirement[]
  ): void {
    const isHighPriority = urgencyLevel === 'high_priority' || urgencyLevel === 'high';
    if (!isHighPriority || !this.config.escalationSkillId) return;

    preferredSkills.push({
      skillId: this.config.escalationSkillId,
      matchType: 'preferred',
      minimumProficiency: 'intermediate',
      weight: 40,
    });
  }

  /**
   * Calculate priority score from urgency level and lead score
   */
  private calculatePriority(
    urgencyLevel: TriageResult['urgencyLevel'],
    leadScore: LeadScore
  ): number {
    const basePriority = this.config.urgencyPriorityMapping[urgencyLevel];
    const scoreBoost = this.config.leadScorePriorityBoost[leadScore];
    return Math.min(100, Math.max(0, basePriority + scoreBoost));
  }

  /**
   * Build preferred agent IDs list from suggested owner
   */
  private buildPreferredAgentIds(suggestedOwner: string | undefined): string[] {
    if (!this.config.useSuggestedOwnerAsPreference || !suggestedOwner) {
      return [];
    }
    return [suggestedOwner];
  }

  /**
   * Build routing context from triage input and result
   */
  private buildRoutingContext(
    input: TriageInput,
    triage: TriageResult,
    additional?: Partial<RoutingContext>
  ): RoutingContext {
    // Map triage urgency to routing urgency
    const urgencyMapping: Record<TriageResult['urgencyLevel'], RoutingContext['urgencyLevel']> = {
      high_priority: 'critical',
      high: 'high',
      normal: 'normal',
      low: 'low',
    };

    // Map channel to routing context channel
    const mapChannel = (channel: LeadChannel): RoutingContext['channel'] => {
      switch (channel) {
        case 'whatsapp':
          return 'whatsapp';
        case 'voice':
          return 'voice';
        case 'web':
        case 'web_form':
        case 'hubspot':
        case 'facebook':
        case 'google':
        case 'referral':
        case 'manual':
        default:
          return 'web';
      }
    };

    return {
      procedureType: input.procedureInterest?.[0],
      urgencyLevel: urgencyMapping[triage.urgencyLevel],
      channel: mapChannel(input.channel),
      isExistingPatient: input.hasExistingRelationship,
      leadScore: input.leadScore,
      ...additional,
    };
  }

  /**
   * Get SLA deadline from routing recommendation
   */
  private getSlaFromRouting(recommendation: TriageResult['routingRecommendation']): number {
    switch (recommendation) {
      case 'next_available_slot':
        return 15; // 15 minutes
      case 'same_day':
        return 60; // 1 hour
      case 'next_business_day':
        return 480; // 8 hours
      case 'nurture_sequence':
        return 1440; // 24 hours
      default:
        return 60;
    }
  }

  /**
   * Update procedure skill mapping
   */
  updateProcedureMapping(procedure: string, skillIds: string[]): void {
    this.config.procedureSkillMapping.set(procedure, skillIds);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<TriageRoutingConfig> {
    return this.config;
  }

  /**
   * Quick triage without full routing (for previews)
   */
  async triageOnly(input: TriageInput): Promise<{
    triageResult: TriageResult;
    skillRequirements: TaskSkillRequirements;
  }> {
    const triageResult = await this.triageService.assess(input);
    const skillRequirements = this.buildSkillRequirements(input, triageResult);
    return { triageResult, skillRequirements };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a triage-routing integration
 */
export function createTriageRoutingIntegration(options: {
  config?: Partial<TriageRoutingConfig>;
  triageService: TriageService;
  routingService: SkillRoutingService;
}): TriageRoutingIntegration {
  return new TriageRoutingIntegration(options);
}
