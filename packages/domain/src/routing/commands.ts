/**
 * CQRS Commands for Skill-Based Routing
 * H6 Milestone: Intelligent Agent Routing
 *
 * Commands for managing agent skills, routing rules, and routing operations.
 */

import { z } from 'zod';
import { defineCommand, type CommandHandler } from '@medicalcor/core';
import {
  ProficiencyLevelSchema,
  SkillCategorySchema,
  RoutingStrategySchema,
  FallbackBehaviorSchema,
  TaskSkillRequirementsSchema,
} from '@medicalcor/types';
import type { SkillRoutingService, RoutingContext } from './skill-routing-service.js';

// ============================================================================
// SKILL MANAGEMENT COMMANDS
// ============================================================================

/**
 * Create a new skill definition
 */
export const CreateSkillCommand = defineCommand(
  'CreateSkill',
  z.object({
    skillId: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    category: SkillCategorySchema,
    description: z.string().max(500).optional(),
    parentSkillId: z.string().optional(),
    requiredCertification: z.string().optional(),
    refreshIntervalDays: z.number().int().min(0).optional(),
  })
);

/**
 * Update an existing skill
 */
export const UpdateSkillCommand = defineCommand(
  'UpdateSkill',
  z.object({
    skillId: z.string(),
    updates: z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      isActive: z.boolean().optional(),
      requiredCertification: z.string().optional(),
      refreshIntervalDays: z.number().int().min(0).optional(),
    }),
  })
);

/**
 * Delete a skill definition
 */
export const DeleteSkillCommand = defineCommand(
  'DeleteSkill',
  z.object({
    skillId: z.string(),
    reassignAgentsTo: z.string().optional(), // Move agents to another skill
  })
);

// ============================================================================
// AGENT SKILL ASSIGNMENT COMMANDS
// ============================================================================

/**
 * Assign a skill to an agent
 */
export const AssignAgentSkillCommand = defineCommand(
  'AssignAgentSkill',
  z.object({
    agentId: z.string(),
    skillId: z.string(),
    proficiency: ProficiencyLevelSchema,
    certifiedBy: z.string().optional(),
    certificationExpiresAt: z.string().datetime().optional(),
    notes: z.string().max(500).optional(),
  })
);

/**
 * Update an agent's skill proficiency
 */
export const UpdateAgentSkillCommand = defineCommand(
  'UpdateAgentSkill',
  z.object({
    agentId: z.string(),
    skillId: z.string(),
    updates: z.object({
      proficiency: ProficiencyLevelSchema.optional(),
      isActive: z.boolean().optional(),
      certifiedBy: z.string().optional(),
      certificationExpiresAt: z.string().datetime().optional(),
      notes: z.string().max(500).optional(),
    }),
  })
);

/**
 * Remove a skill from an agent
 */
export const RemoveAgentSkillCommand = defineCommand(
  'RemoveAgentSkill',
  z.object({
    agentId: z.string(),
    skillId: z.string(),
    reason: z.string().optional(),
  })
);

/**
 * Bulk assign skills to multiple agents
 */
export const BulkAssignSkillsCommand = defineCommand(
  'BulkAssignSkills',
  z.object({
    assignments: z.array(
      z.object({
        agentId: z.string(),
        skillId: z.string(),
        proficiency: ProficiencyLevelSchema,
      })
    ),
    certifiedBy: z.string().optional(),
  })
);

// ============================================================================
// AGENT PROFILE COMMANDS
// ============================================================================

/**
 * Create a new agent profile
 */
export const CreateAgentProfileCommand = defineCommand(
  'CreateAgentProfile',
  z.object({
    agentId: z.string(),
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    workerSid: z.string().optional(),
    teamId: z.string().optional(),
    role: z.enum(['agent', 'senior_agent', 'supervisor', 'manager', 'admin']).optional(),
    maxConcurrentTasks: z.number().int().min(1).max(10).optional(),
    primaryLanguages: z.array(z.string()).optional(),
    secondaryLanguages: z.array(z.string()).optional(),
  })
);

/**
 * Update agent availability
 */
export const UpdateAgentAvailabilityCommand = defineCommand(
  'UpdateAgentAvailability',
  z.object({
    agentId: z.string(),
    availability: z.enum(['available', 'busy', 'away', 'offline', 'break', 'training', 'wrap-up']),
    reason: z.string().optional(),
  })
);

/**
 * Update agent's current task count
 */
export const UpdateAgentTaskCountCommand = defineCommand(
  'UpdateAgentTaskCount',
  z.object({
    agentId: z.string(),
    taskCount: z.number().int().min(0),
    action: z.enum(['increment', 'decrement', 'set']).default('set'),
  })
);

// ============================================================================
// ROUTING RULE COMMANDS
// ============================================================================

/**
 * Create a new routing rule
 */
export const CreateRoutingRuleCommand = defineCommand(
  'CreateRoutingRule',
  z.object({
    ruleId: z.string().optional(), // Auto-generated if not provided
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    priority: z.number().int().min(0).max(1000).default(100),
    conditions: z.object({
      procedureTypes: z.array(z.string()).optional(),
      urgencyLevels: z.array(z.enum(['low', 'normal', 'high', 'critical'])).optional(),
      channels: z.array(z.enum(['voice', 'whatsapp', 'web', 'chat'])).optional(),
      timeRange: z
        .object({
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(0).max(23),
          timezone: z.string().default('Europe/Bucharest'),
          daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
        })
        .optional(),
      isVIP: z.boolean().optional(),
      isExistingPatient: z.boolean().optional(),
      leadScore: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
    }),
    routing: z.object({
      strategy: RoutingStrategySchema.default('best_match'),
      skillRequirements: TaskSkillRequirementsSchema,
      fallbackBehavior: FallbackBehaviorSchema.default('queue'),
      fallbackRuleIds: z.array(z.string()).default([]),
      maxQueueTime: z.number().int().min(0).default(300),
      queuePriority: z.number().int().min(0).max(100).default(50),
    }),
  })
);

/**
 * Update an existing routing rule
 */
export const UpdateRoutingRuleCommand = defineCommand(
  'UpdateRoutingRule',
  z.object({
    ruleId: z.string(),
    updates: z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      priority: z.number().int().min(0).max(1000).optional(),
      isActive: z.boolean().optional(),
      conditions: z
        .object({
          procedureTypes: z.array(z.string()).optional(),
          urgencyLevels: z.array(z.enum(['low', 'normal', 'high', 'critical'])).optional(),
          channels: z.array(z.enum(['voice', 'whatsapp', 'web', 'chat'])).optional(),
          isVIP: z.boolean().optional(),
          isExistingPatient: z.boolean().optional(),
        })
        .optional(),
      routing: z
        .object({
          strategy: RoutingStrategySchema.optional(),
          fallbackBehavior: FallbackBehaviorSchema.optional(),
        })
        .optional(),
    }),
  })
);

/**
 * Delete a routing rule
 */
export const DeleteRoutingRuleCommand = defineCommand(
  'DeleteRoutingRule',
  z.object({
    ruleId: z.string(),
  })
);

/**
 * Activate/Deactivate a routing rule
 */
export const ToggleRoutingRuleCommand = defineCommand(
  'ToggleRoutingRule',
  z.object({
    ruleId: z.string(),
    isActive: z.boolean(),
  })
);

// ============================================================================
// ROUTING OPERATION COMMANDS
// ============================================================================

/**
 * Route a task to an agent
 */
export const RouteTaskCommand = defineCommand(
  'RouteTask',
  z.object({
    taskId: z.string(),
    callSid: z.string().optional(),
    requirements: TaskSkillRequirementsSchema,
    context: z
      .object({
        procedureType: z.string().optional(),
        urgencyLevel: z.enum(['low', 'normal', 'high', 'critical']).optional(),
        channel: z.enum(['voice', 'whatsapp', 'web', 'chat']).optional(),
        isVIP: z.boolean().optional(),
        isExistingPatient: z.boolean().optional(),
        leadScore: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
        language: z.string().optional(),
      })
      .optional(),
  })
);

/**
 * Force assign a task to a specific agent
 */
export const ForceAssignTaskCommand = defineCommand(
  'ForceAssignTask',
  z.object({
    taskId: z.string(),
    agentId: z.string(),
    reason: z.string(),
    bypassSkillCheck: z.boolean().default(false),
  })
);

/**
 * Re-route a task to a different agent
 */
export const RerouteTaskCommand = defineCommand(
  'RerouteTask',
  z.object({
    taskId: z.string(),
    reason: z.enum([
      'agent_unavailable',
      'skill_mismatch',
      'customer_request',
      'supervisor_override',
      'timeout',
    ]),
    excludeAgentIds: z.array(z.string()).optional(),
    priorityBoost: z.number().int().min(0).max(50).optional(),
  })
);

/**
 * Escalate a task to supervisor/manager
 */
export const EscalateTaskCommand = defineCommand(
  'EscalateTask',
  z.object({
    taskId: z.string(),
    reason: z.string(),
    escalateToRole: z.enum(['supervisor', 'manager', 'admin']).default('supervisor'),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('high'),
  })
);

// ============================================================================
// COMMAND HANDLER TYPES
// ============================================================================

/**
 * Context required for routing command handlers
 */
export interface RoutingCommandContext {
  routingService: SkillRoutingService;
  correlationId: string;
}

/**
 * Route task command handler
 */
export const routeTaskHandler: CommandHandler<
  z.infer<typeof RouteTaskCommand.schema>,
  {
    decisionId: string;
    outcome: string;
    agentId?: string;
    agentName?: string;
    queuePosition?: number;
  }
> = async (command, context) => {
  const { routingService } = context as unknown as RoutingCommandContext;

  const routingContext: RoutingContext = {
    taskId: command.payload.taskId,
    callSid: command.payload.callSid,
    ...command.payload.context,
  };

  // Parse requirements to apply defaults (priority, requiredSkills, etc.)
  const requirements = TaskSkillRequirementsSchema.parse(command.payload.requirements);
  const decision = await routingService.route(requirements, routingContext);

  return {
    success: decision.outcome === 'routed' || decision.outcome === 'queued',
    commandId: command.metadata.commandId,
    aggregateId: command.payload.taskId,
    result: {
      decisionId: decision.decisionId,
      outcome: decision.outcome,
      agentId: decision.selectedAgentId,
      agentName: decision.selectedAgentName,
      queuePosition: decision.queuePosition,
    },
    executionTimeMs: decision.processingTimeMs,
  };
};

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

/**
 * Get all routing command schemas for registration
 */
export function getRoutingCommandSchemas(): Map<string, z.ZodSchema> {
  return new Map<string, z.ZodSchema>([
    // Skill management
    ['CreateSkill', CreateSkillCommand.schema],
    ['UpdateSkill', UpdateSkillCommand.schema],
    ['DeleteSkill', DeleteSkillCommand.schema],
    // Agent skill assignment
    ['AssignAgentSkill', AssignAgentSkillCommand.schema],
    ['UpdateAgentSkill', UpdateAgentSkillCommand.schema],
    ['RemoveAgentSkill', RemoveAgentSkillCommand.schema],
    ['BulkAssignSkills', BulkAssignSkillsCommand.schema],
    // Agent profile
    ['CreateAgentProfile', CreateAgentProfileCommand.schema],
    ['UpdateAgentAvailability', UpdateAgentAvailabilityCommand.schema],
    ['UpdateAgentTaskCount', UpdateAgentTaskCountCommand.schema],
    // Routing rules
    ['CreateRoutingRule', CreateRoutingRuleCommand.schema],
    ['UpdateRoutingRule', UpdateRoutingRuleCommand.schema],
    ['DeleteRoutingRule', DeleteRoutingRuleCommand.schema],
    ['ToggleRoutingRule', ToggleRoutingRuleCommand.schema],
    // Routing operations
    ['RouteTask', RouteTaskCommand.schema],
    ['ForceAssignTask', ForceAssignTaskCommand.schema],
    ['RerouteTask', RerouteTaskCommand.schema],
    ['EscalateTask', EscalateTaskCommand.schema],
  ]);
}
