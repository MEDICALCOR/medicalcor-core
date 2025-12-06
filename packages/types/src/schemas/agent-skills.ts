/**
 * Agent Skills and Skill-Based Routing Schemas
 * H6 Milestone: Skill-Based Agent Routing
 *
 * Defines skill definitions, proficiency levels, routing rules,
 * and matching algorithms for intelligent call/task routing.
 */
import { z } from 'zod';

import { TimestampSchema, UUIDSchema } from './common.js';

// =============================================================================
// Skill Categories & Definitions
// =============================================================================

/**
 * Skill categories for dental clinic operations
 */
export const SkillCategorySchema = z.enum([
  'procedure', // Dental procedures (implants, orthodontics, etc.)
  'language', // Language capabilities
  'specialty', // Clinical specialties
  'administrative', // Admin tasks (billing, scheduling)
  'communication', // Communication channels
  'customer_service', // Customer service skills
]);

/**
 * Proficiency level for a skill
 */
export const ProficiencyLevelSchema = z.enum([
  'basic', // Can handle simple cases
  'intermediate', // Can handle most cases
  'advanced', // Can handle complex cases
  'expert', // Subject matter expert, can train others
]);

/**
 * Proficiency level weights for scoring
 */
export const PROFICIENCY_WEIGHTS: Record<z.infer<typeof ProficiencyLevelSchema>, number> = {
  basic: 1,
  intermediate: 2,
  advanced: 3,
  expert: 4,
};

/**
 * Skill definition
 */
export const SkillSchema = z.object({
  skillId: z.string(),
  name: z.string().min(1).max(100),
  category: SkillCategorySchema,
  description: z.string().max(500).optional(),

  // Skill metadata
  isActive: z.boolean().default(true),
  requiredCertification: z.string().optional(),
  refreshIntervalDays: z.number().int().min(0).optional(), // Days until skill refresh needed

  // Skill hierarchy
  parentSkillId: z.string().optional(), // For skill inheritance (e.g., "implants" -> "all-on-x")
  childSkillIds: z.array(z.string()).default([]),

  // Audit
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

/**
 * Agent skill assignment (skill + proficiency for an agent)
 */
export const AgentSkillSchema = z.object({
  agentId: z.string(),
  skillId: z.string(),
  proficiency: ProficiencyLevelSchema,

  // Certification & validation
  certifiedAt: TimestampSchema.optional(),
  certificationExpiresAt: TimestampSchema.optional(),
  certifiedBy: z.string().optional(),

  // Performance metrics
  tasksCompleted: z.number().int().min(0).default(0),
  averageHandleTime: z.number().min(0).optional(), // seconds
  customerSatisfaction: z.number().min(0).max(100).optional(), // %
  lastUsedAt: TimestampSchema.optional(),

  // Status
  isActive: z.boolean().default(true),
  notes: z.string().max(500).optional(),

  // Audit
  assignedAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

// =============================================================================
// Agent Profile with Skills
// =============================================================================

/**
 * Agent availability status
 */
export const AgentAvailabilitySchema = z.enum([
  'available',
  'busy',
  'away',
  'offline',
  'break',
  'training',
  'wrap-up',
]);

/**
 * Complete agent profile with skills
 */
export const AgentProfileSchema = z.object({
  agentId: z.string(),
  workerSid: z.string().optional(), // Twilio Flex worker SID
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),

  // Availability
  availability: AgentAvailabilitySchema.default('offline'),
  maxConcurrentTasks: z.number().int().min(1).max(10).default(1),
  currentTaskCount: z.number().int().min(0).default(0),

  // Skills
  skills: z.array(AgentSkillSchema).default([]),
  primaryLanguages: z.array(z.string()).default(['ro']), // ISO 639-1 codes
  secondaryLanguages: z.array(z.string()).default([]),

  // Scheduling
  workSchedule: z
    .object({
      timezone: z.string().default('Europe/Bucharest'),
      weeklyHours: z
        .array(
          z.object({
            dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday
            startHour: z.number().int().min(0).max(23),
            endHour: z.number().int().min(0).max(23),
          })
        )
        .default([]),
    })
    .optional(),

  // Team assignment
  teamId: z.string().optional(),
  supervisorId: z.string().optional(),
  role: z.enum(['agent', 'senior_agent', 'supervisor', 'manager', 'admin']).default('agent'),

  // Performance metrics (rolling 30 days)
  metrics: z
    .object({
      tasksCompleted: z.number().int().min(0).default(0),
      averageHandleTime: z.number().min(0).default(0),
      customerSatisfaction: z.number().min(0).max(100).optional(),
      firstCallResolution: z.number().min(0).max(100).optional(),
      adherenceRate: z.number().min(0).max(100).optional(), // Schedule adherence
    })
    .optional(),

  // Audit
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  lastActiveAt: TimestampSchema.optional(),
});

// =============================================================================
// Skill Requirements (for tasks/calls)
// =============================================================================

/**
 * Skill requirement match type
 */
export const SkillMatchTypeSchema = z.enum([
  'required', // Agent MUST have this skill
  'preferred', // Agent SHOULD have this skill (bonus points)
  'excluded', // Agent MUST NOT have this skill (e.g., exclude trainees)
]);

/**
 * Single skill requirement for routing
 */
export const SkillRequirementSchema = z.object({
  skillId: z.string(),
  matchType: SkillMatchTypeSchema.default('required'),
  minimumProficiency: ProficiencyLevelSchema.default('basic'),

  // Weight for scoring (higher = more important)
  weight: z.number().min(0).max(100).default(50),
});

/**
 * Complete skill requirements for a task/call
 */
export const TaskSkillRequirementsSchema = z.object({
  // Required skills (all must be met)
  requiredSkills: z.array(SkillRequirementSchema).default([]),

  // Preferred skills (bonus for matching)
  preferredSkills: z.array(SkillRequirementSchema).default([]),

  // Language requirements
  requiredLanguage: z.string().optional(), // ISO 639-1 code
  preferredLanguages: z.array(z.string()).default([]),

  // Routing constraints
  excludeAgentIds: z.array(z.string()).default([]), // Agents to exclude
  preferAgentIds: z.array(z.string()).default([]), // Preferred agents
  teamId: z.string().optional(), // Restrict to specific team

  // Priority & SLA
  priority: z.number().int().min(0).max(100).default(50),
  slaDeadlineMinutes: z.number().int().min(0).optional(),
});

// =============================================================================
// Routing Rules
// =============================================================================

/**
 * Routing strategy for skill matching
 */
export const RoutingStrategySchema = z.enum([
  'best_match', // Route to agent with highest skill match score
  'round_robin', // Round robin among qualified agents
  'least_occupied', // Route to agent with fewest tasks
  'longest_idle', // Route to agent idle longest
  'skills_first', // Prioritize skills, then use least_occupied
]);

/**
 * Fallback behavior when no perfect match found
 */
export const FallbackBehaviorSchema = z.enum([
  'queue', // Place in queue for next available
  'downgrade_proficiency', // Accept lower proficiency level
  'expand_team', // Expand to other teams
  'escalate', // Escalate to supervisor
  'reject', // Reject the routing request
]);

/**
 * Skill-based routing rule
 */
export const RoutingRuleSchema = z.object({
  ruleId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),

  // Rule activation
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100), // Higher = evaluated first

  // Matching conditions (when to apply this rule)
  conditions: z.object({
    // Match by procedure/intent
    procedureTypes: z.array(z.string()).optional(),

    // Match by urgency
    urgencyLevels: z.array(z.enum(['low', 'normal', 'high', 'critical'])).optional(),

    // Match by channel
    channels: z.array(z.enum(['voice', 'whatsapp', 'web', 'chat'])).optional(),

    // Match by time of day (business hours handling)
    timeRange: z
      .object({
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(0).max(23),
        timezone: z.string().default('Europe/Bucharest'),
        daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
      })
      .optional(),

    // Match by customer attributes
    isVIP: z.boolean().optional(),
    isExistingPatient: z.boolean().optional(),
    leadScore: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
  }),

  // Routing configuration
  routing: z.object({
    strategy: RoutingStrategySchema.default('best_match'),
    skillRequirements: TaskSkillRequirementsSchema,
    fallbackBehavior: FallbackBehaviorSchema.default('queue'),

    // Fallback rule chain
    fallbackRuleIds: z.array(z.string()).default([]),

    // Queue configuration
    maxQueueTime: z.number().int().min(0).default(300), // seconds
    queuePriority: z.number().int().min(0).max(100).default(50),
  }),

  // Audit
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  createdBy: z.string().optional(),
});

// =============================================================================
// Routing Match Results
// =============================================================================

/**
 * Individual agent match score
 */
export const AgentMatchScoreSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  workerSid: z.string().optional(),

  // Scoring
  totalScore: z.number().min(0).max(100),
  skillScore: z.number().min(0).max(100), // Based on skill matches
  availabilityScore: z.number().min(0).max(100), // Based on workload
  preferenceScore: z.number().min(0).max(100), // Based on preferences

  // Match details
  matchedSkills: z.array(
    z.object({
      skillId: z.string(),
      skillName: z.string(),
      requiredProficiency: ProficiencyLevelSchema,
      agentProficiency: ProficiencyLevelSchema,
      matchType: SkillMatchTypeSchema,
      score: z.number().min(0).max(100),
    })
  ),

  // Availability info
  currentTaskCount: z.number().int().min(0),
  availability: AgentAvailabilitySchema,

  // Reasons for score adjustments
  scoreAdjustments: z.array(
    z.object({
      reason: z.string(),
      adjustment: z.number(),
    })
  ),
});

/**
 * Routing decision result
 */
export const RoutingDecisionSchema = z.object({
  decisionId: UUIDSchema,
  timestamp: TimestampSchema,

  // Input
  taskId: z.string().optional(),
  callSid: z.string().optional(),
  requirements: TaskSkillRequirementsSchema,
  appliedRuleId: z.string().optional(),
  appliedRuleName: z.string().optional(),

  // Decision
  outcome: z.enum([
    'routed', // Successfully routed to agent
    'queued', // Placed in queue
    'escalated', // Escalated to supervisor
    'rejected', // No suitable agent found
    'fallback', // Used fallback rule
  ]),

  // Selected agent (if routed)
  selectedAgentId: z.string().optional(),
  selectedAgentName: z.string().optional(),
  selectedWorkerSid: z.string().optional(),

  // Scoring details
  candidateAgents: z.array(AgentMatchScoreSchema).default([]),
  selectionReason: z.string(),

  // Queue info (if queued)
  queueId: z.string().optional(),
  queuePosition: z.number().int().optional(),
  estimatedWaitTime: z.number().int().optional(), // seconds

  // Fallback info
  fallbacksAttempted: z.number().int().min(0).default(0),
  originalRuleId: z.string().optional(),

  // Audit
  processingTimeMs: z.number().int().min(0),
});

// =============================================================================
// Skill Routing Configuration
// =============================================================================

/**
 * Global skill routing configuration
 */
export const SkillRoutingConfigSchema = z.object({
  // Default routing strategy
  defaultStrategy: RoutingStrategySchema.default('best_match'),
  defaultFallback: FallbackBehaviorSchema.default('queue'),

  // Scoring weights
  weights: z.object({
    skillMatch: z.number().min(0).max(100).default(50),
    proficiencyBonus: z.number().min(0).max(100).default(20),
    availabilityScore: z.number().min(0).max(100).default(20),
    preferenceScore: z.number().min(0).max(100).default(10),
  }),

  // Thresholds
  thresholds: z.object({
    minimumMatchScore: z.number().min(0).max(100).default(30),
    proficiencyGap: z.number().int().min(0).max(3).default(1), // Max levels below requirement
    maxConcurrentTaskRatio: z.number().min(0).max(1).default(0.8),
  }),

  // Queue settings
  queue: z.object({
    maxWaitTime: z.number().int().min(0).default(600), // seconds
    escalationThreshold: z.number().int().min(0).default(300), // seconds
    rebalanceInterval: z.number().int().min(0).default(60), // seconds
  }),

  // Feature flags
  features: z.object({
    enableSkillInheritance: z.boolean().default(true),
    enableProficiencyDowngrade: z.boolean().default(true),
    enableCrossTeamRouting: z.boolean().default(false),
    enableAffinityRouting: z.boolean().default(true), // Prefer same agent for returning customers
  }),
});

// =============================================================================
// Pre-defined Skills
// =============================================================================

/**
 * Standard dental clinic skills
 * These are commonly used skills that can be pre-loaded into the system
 */
export const STANDARD_SKILLS = {
  // Procedure skills
  IMPLANTS: {
    skillId: 'procedure:implants',
    name: 'Dental Implants',
    category: 'procedure' as const,
  },
  ALL_ON_X: {
    skillId: 'procedure:all-on-x',
    name: 'All-on-X Procedures',
    category: 'procedure' as const,
    parentSkillId: 'procedure:implants',
  },
  ORTHODONTICS: {
    skillId: 'procedure:orthodontics',
    name: 'Orthodontics',
    category: 'procedure' as const,
  },
  GENERAL_DENTISTRY: {
    skillId: 'procedure:general',
    name: 'General Dentistry',
    category: 'procedure' as const,
  },
  COSMETIC: {
    skillId: 'procedure:cosmetic',
    name: 'Cosmetic Dentistry',
    category: 'procedure' as const,
  },
  PEDIATRIC: {
    skillId: 'procedure:pediatric',
    name: 'Pediatric Dentistry',
    category: 'procedure' as const,
  },

  // Language skills
  ROMANIAN: {
    skillId: 'language:ro',
    name: 'Romanian',
    category: 'language' as const,
  },
  ENGLISH: {
    skillId: 'language:en',
    name: 'English',
    category: 'language' as const,
  },
  GERMAN: {
    skillId: 'language:de',
    name: 'German',
    category: 'language' as const,
  },
  ITALIAN: {
    skillId: 'language:it',
    name: 'Italian',
    category: 'language' as const,
  },

  // Administrative skills
  SCHEDULING: {
    skillId: 'admin:scheduling',
    name: 'Appointment Scheduling',
    category: 'administrative' as const,
  },
  BILLING: {
    skillId: 'admin:billing',
    name: 'Billing & Insurance',
    category: 'administrative' as const,
  },
  RECORDS: {
    skillId: 'admin:records',
    name: 'Medical Records',
    category: 'administrative' as const,
  },

  // Customer service skills
  COMPLAINTS: {
    skillId: 'service:complaints',
    name: 'Complaint Handling',
    category: 'customer_service' as const,
  },
  VIP: {
    skillId: 'service:vip',
    name: 'VIP Customer Service',
    category: 'customer_service' as const,
  },
  ESCALATIONS: {
    skillId: 'service:escalations',
    name: 'Escalation Handling',
    category: 'customer_service' as const,
  },
} as const;

// =============================================================================
// Type Exports
// =============================================================================

export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export type ProficiencyLevel = z.infer<typeof ProficiencyLevelSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type AgentSkill = z.infer<typeof AgentSkillSchema>;
export type AgentAvailability = z.infer<typeof AgentAvailabilitySchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
export type SkillMatchType = z.infer<typeof SkillMatchTypeSchema>;
export type SkillRequirement = z.infer<typeof SkillRequirementSchema>;
export type TaskSkillRequirements = z.infer<typeof TaskSkillRequirementsSchema>;
export type RoutingStrategy = z.infer<typeof RoutingStrategySchema>;
export type FallbackBehavior = z.infer<typeof FallbackBehaviorSchema>;
export type RoutingRule = z.infer<typeof RoutingRuleSchema>;
export type AgentMatchScore = z.infer<typeof AgentMatchScoreSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type SkillRoutingConfig = z.infer<typeof SkillRoutingConfigSchema>;
