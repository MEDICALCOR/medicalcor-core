/**
 * MedicalCor Orchestration Types
 *
 * Type definitions for the multi-agent orchestration system.
 * Supports task coordination, agent dispatch, and quality gate enforcement.
 *
 * @module @medicalcor/types/schemas/orchestration
 */

import { z } from 'zod';

// =============================================================================
// Agent Codenames & Roles
// =============================================================================

export const AgentCodenameSchema = z.enum([
  'ORCHESTRATOR',
  'ARCHITECT',
  'DOMAIN',
  'COMPLIANCE',
  'INFRA',
  'INTEGRATIONS',
  'AI_RAG',
  'QA',
  'SECURITY',
  'DEVOPS',
  'FRONTEND',
]);

export type AgentCodename = z.infer<typeof AgentCodenameSchema>;

// =============================================================================
// Task Complexity & Risk Assessment
// =============================================================================

export const TaskComplexitySchema = z.enum([
  'TRIVIAL', // Single file change, no dependencies
  'SIMPLE', // 2-3 files, single package, no external deps
  'MODERATE', // Multiple packages, database changes
  'COMPLEX', // Cross-cutting concerns, new integrations
  'CRITICAL', // Security, compliance, production incidents
]);

export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type RiskLevel = z.infer<typeof RiskLevelSchema>;

// =============================================================================
// Quality Gates
// =============================================================================

export const QualityGateSchema = z.enum([
  'G1_ARCHITECTURE', // No layer violations, ports/adapters correct
  'G2_DOMAIN_PURITY', // No infra imports, pure business logic
  'G3_COMPLIANCE', // HIPAA/GDPR checks passed
  'G4_SECURITY', // No secrets exposed, encryption verified
  'G5_QUALITY', // Tests pass, coverage >80%
  'G6_PERFORMANCE', // No regressions, k6 benchmarks pass
  'G7_DEPLOYMENT', // CI green, rollback plan ready
]);

export type QualityGate = z.infer<typeof QualityGateSchema>;

export const QualityGateStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'SKIPPED',
]);

export type QualityGateStatus = z.infer<typeof QualityGateStatusSchema>;

export const QualityGateResultSchema = z.object({
  gate: QualityGateSchema,
  status: QualityGateStatusSchema,
  checkedAt: z.string().datetime().optional(),
  checkedBy: AgentCodenameSchema.optional(),
  notes: z.string().optional(),
  errors: z.array(z.string()).optional(),
});

export type QualityGateResult = z.infer<typeof QualityGateResultSchema>;

// =============================================================================
// Task Analysis & Decomposition
// =============================================================================

export const TaskAnalysisSchema = z.object({
  complexity: TaskComplexitySchema,
  requiredAgents: z.array(AgentCodenameSchema),
  parallelizable: z.boolean(),
  dependencies: z.record(AgentCodenameSchema, z.array(AgentCodenameSchema)),
  estimatedRisk: RiskLevelSchema,
  complianceRequired: z.boolean(),
  securityReview: z.boolean(),
  affectedPackages: z.array(z.string()).optional(),
  affectedFiles: z.array(z.string()).optional(),
});

export type TaskAnalysis = z.infer<typeof TaskAnalysisSchema>;

// =============================================================================
// Agent Directives & Reports
// =============================================================================

export const TaskPrioritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const ReportingFrequencySchema = z.enum([
  'CONTINUOUS',
  'ON_COMPLETION',
  'ON_BLOCKER',
]);

export type ReportingFrequency = z.infer<typeof ReportingFrequencySchema>;

export const AgentDirectiveSchema = z.object({
  id: z.string().uuid(),
  target: AgentCodenameSchema,
  priority: TaskPrioritySchema,
  task: z.string(),
  description: z.string(),
  constraints: z.array(z.string()),
  deadline: z.string().datetime().optional(),
  dependencies: z.array(AgentCodenameSchema),
  reportingFrequency: ReportingFrequencySchema,
  requiredQualityGates: z.array(QualityGateSchema),
  context: z
    .object({
      files: z.array(z.string()).optional(),
      codeSnippets: z.record(z.string(), z.string()).optional(),
      previousFindings: z.array(z.string()).optional(),
    })
    .optional(),
});

export type AgentDirective = z.infer<typeof AgentDirectiveSchema>;

export const AgentTaskStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'BLOCKED',
  'FAILED',
]);

export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;

export const FindingSchema = z.object({
  type: z.enum(['INFO', 'WARNING', 'ERROR', 'SECURITY', 'COMPLIANCE']),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
  suggestion: z.string().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const RecommendationSchema = z.object({
  priority: TaskPrioritySchema,
  action: z.string(),
  reason: z.string(),
  assignTo: AgentCodenameSchema.optional(),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

export const BlockerSchema = z.object({
  type: z.enum([
    'DEPENDENCY',
    'RESOURCE',
    'APPROVAL',
    'TECHNICAL',
    'COMPLIANCE',
    'SECURITY',
  ]),
  description: z.string(),
  blockedBy: AgentCodenameSchema.optional(),
  requiredAction: z.string(),
});

export type Blocker = z.infer<typeof BlockerSchema>;

export const AgentReportSchema = z.object({
  id: z.string().uuid(),
  directiveId: z.string().uuid(),
  agent: AgentCodenameSchema,
  task: z.string(),
  status: AgentTaskStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  findings: z.array(FindingSchema),
  recommendations: z.array(RecommendationSchema),
  blockers: z.array(BlockerSchema).optional(),
  nextSteps: z.array(z.string()).optional(),
  qualityGateResults: z.array(QualityGateResultSchema).optional(),
  artifacts: z
    .object({
      filesCreated: z.array(z.string()).optional(),
      filesModified: z.array(z.string()).optional(),
      testsAdded: z.array(z.string()).optional(),
      migrationsAdded: z.array(z.string()).optional(),
    })
    .optional(),
});

export type AgentReport = z.infer<typeof AgentReportSchema>;

// =============================================================================
// Conflict Resolution
// =============================================================================

export const ConflictTypeSchema = z.enum([
  'LAYER_VIOLATION',
  'SECURITY_RISK',
  'COMPLIANCE_BREACH',
  'PERFORMANCE_REGRESSION',
  'INTEGRATION_FAILURE',
  'TEST_FAILURE',
  'MERGE_CONFLICT',
]);

export type ConflictType = z.infer<typeof ConflictTypeSchema>;

export const ConflictResolutionSchema = z.object({
  id: z.string().uuid(),
  type: ConflictTypeSchema,
  detectedBy: AgentCodenameSchema,
  detectedAt: z.string().datetime(),
  description: z.string(),
  affectedAgents: z.array(AgentCodenameSchema),
  resolver: AgentCodenameSchema,
  resolution: z.string().optional(),
  resolvedAt: z.string().datetime().optional(),
  action: z.enum(['BLOCK_MERGE', 'REQUIRE_REFACTOR', 'ESCALATE', 'ROLLBACK', 'CONTINUE']),
});

export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;

// =============================================================================
// Orchestration Session
// =============================================================================

export const OrchestrationStatusSchema = z.enum([
  'ANALYZING',
  'DISPATCHING',
  'IN_PROGRESS',
  'VALIDATING',
  'COMPLETED',
  'BLOCKED',
  'FAILED',
  'APPROVED',
]);

export type OrchestrationStatus = z.infer<typeof OrchestrationStatusSchema>;

export const OrchestrationSessionSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string().uuid(),
  status: OrchestrationStatusSchema,
  request: z.string(),
  analysis: TaskAnalysisSchema.optional(),
  directives: z.array(AgentDirectiveSchema),
  reports: z.array(AgentReportSchema),
  qualityGates: z.array(QualityGateResultSchema),
  conflicts: z.array(ConflictResolutionSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  summary: z.string().optional(),
});

export type OrchestrationSession = z.infer<typeof OrchestrationSessionSchema>;

// =============================================================================
// Orchestration Events
// =============================================================================

export const OrchestrationEventTypeSchema = z.enum([
  'SESSION_STARTED',
  'TASK_ANALYZED',
  'AGENT_DISPATCHED',
  'AGENT_COMPLETED',
  'AGENT_BLOCKED',
  'QUALITY_GATE_CHECKED',
  'CONFLICT_DETECTED',
  'CONFLICT_RESOLVED',
  'SESSION_COMPLETED',
  'SESSION_FAILED',
]);

export type OrchestrationEventType = z.infer<typeof OrchestrationEventTypeSchema>;

export const OrchestrationEventBaseSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  type: OrchestrationEventTypeSchema,
  timestamp: z.string().datetime(),
  correlationId: z.string().uuid(),
});

export const SessionStartedEventSchema = OrchestrationEventBaseSchema.extend({
  type: z.literal('SESSION_STARTED'),
  payload: z.object({
    request: z.string(),
    initiatedBy: z.string().optional(),
  }),
});

export const TaskAnalyzedEventSchema = OrchestrationEventBaseSchema.extend({
  type: z.literal('TASK_ANALYZED'),
  payload: z.object({
    analysis: TaskAnalysisSchema,
  }),
});

export const AgentDispatchedEventSchema = OrchestrationEventBaseSchema.extend({
  type: z.literal('AGENT_DISPATCHED'),
  payload: z.object({
    directive: AgentDirectiveSchema,
  }),
});

export const AgentCompletedEventSchema = OrchestrationEventBaseSchema.extend({
  type: z.literal('AGENT_COMPLETED'),
  payload: z.object({
    report: AgentReportSchema,
  }),
});

export const QualityGateCheckedEventSchema = OrchestrationEventBaseSchema.extend({
  type: z.literal('QUALITY_GATE_CHECKED'),
  payload: z.object({
    result: QualityGateResultSchema,
  }),
});

export const ConflictDetectedEventSchema = OrchestrationEventBaseSchema.extend({
  type: z.literal('CONFLICT_DETECTED'),
  payload: z.object({
    conflict: ConflictResolutionSchema,
  }),
});

export const SessionCompletedEventSchema = OrchestrationEventBaseSchema.extend({
  type: z.literal('SESSION_COMPLETED'),
  payload: z.object({
    status: z.enum(['APPROVED', 'COMPLETED']),
    summary: z.string(),
  }),
});

export type SessionStartedEvent = z.infer<typeof SessionStartedEventSchema>;
export type TaskAnalyzedEvent = z.infer<typeof TaskAnalyzedEventSchema>;
export type AgentDispatchedEvent = z.infer<typeof AgentDispatchedEventSchema>;
export type AgentCompletedEvent = z.infer<typeof AgentCompletedEventSchema>;
export type QualityGateCheckedEvent = z.infer<typeof QualityGateCheckedEventSchema>;
export type ConflictDetectedEvent = z.infer<typeof ConflictDetectedEventSchema>;
export type SessionCompletedEvent = z.infer<typeof SessionCompletedEventSchema>;

// =============================================================================
// Request/Response Schemas
// =============================================================================

export const CreateOrchestrationSessionSchema = z.object({
  request: z.string().min(10),
  priority: TaskPrioritySchema.optional(),
  initiatedBy: z.string().optional(),
  context: z
    .object({
      branch: z.string().optional(),
      relatedIssues: z.array(z.string()).optional(),
      previousSessions: z.array(z.string().uuid()).optional(),
    })
    .optional(),
});

export type CreateOrchestrationSession = z.infer<typeof CreateOrchestrationSessionSchema>;

export const OrchestrationReportSchema = z.object({
  sessionId: z.string().uuid(),
  status: OrchestrationStatusSchema,
  request: z.string(),
  complexity: TaskComplexitySchema,
  riskLevel: RiskLevelSchema,
  agentAssignments: z.array(
    z.object({
      agent: AgentCodenameSchema,
      task: z.string(),
      status: AgentTaskStatusSchema,
      notes: z.string().optional(),
    })
  ),
  qualityGates: z.array(QualityGateResultSchema),
  blockers: z.array(BlockerSchema),
  recommendations: z.array(RecommendationSchema),
  finalStatus: z.enum(['APPROVED', 'BLOCKED', 'PENDING', 'FAILED']),
  summary: z.string().optional(),
});

export type OrchestrationReport = z.infer<typeof OrchestrationReportSchema>;

// =============================================================================
// Constants
// =============================================================================

/**
 * Agent priority for conflict resolution (highest first)
 */
export const AGENT_PRIORITY: Record<AgentCodename, number> = {
  SECURITY: 1,
  COMPLIANCE: 2,
  ORCHESTRATOR: 3,
  ARCHITECT: 4,
  DOMAIN: 5,
  QA: 6,
  INFRA: 7,
  INTEGRATIONS: 8,
  AI_RAG: 9,
  DEVOPS: 10,
  FRONTEND: 11,
};

/**
 * Quality gates required for each task type
 */
export const TASK_TYPE_QUALITY_GATES: Record<string, QualityGate[]> = {
  NEW_DOMAIN_SERVICE: ['G1_ARCHITECTURE', 'G2_DOMAIN_PURITY', 'G5_QUALITY'],
  NEW_INTEGRATION: ['G3_COMPLIANCE', 'G4_SECURITY', 'G5_QUALITY'],
  DATABASE_MIGRATION: ['G1_ARCHITECTURE', 'G4_SECURITY'],
  AI_RAG_FEATURE: ['G2_DOMAIN_PURITY', 'G4_SECURITY', 'G5_QUALITY'],
  UI_COMPONENT: ['G5_QUALITY', 'G6_PERFORMANCE'],
  SECURITY_FIX: ['G3_COMPLIANCE', 'G4_SECURITY', 'G5_QUALITY'],
  PERFORMANCE_ISSUE: ['G5_QUALITY', 'G6_PERFORMANCE'],
  DEPLOYMENT: ['G4_SECURITY', 'G5_QUALITY', 'G7_DEPLOYMENT'],
  COMPLIANCE_AUDIT: ['G3_COMPLIANCE'],
  ARCHITECTURE_REFACTOR: ['G1_ARCHITECTURE', 'G2_DOMAIN_PURITY', 'G5_QUALITY'],
};

/**
 * Default routing for task types
 */
export const TASK_TYPE_ROUTING: Record<string, { primary: AgentCodename; support: AgentCodename[] }> =
  {
    NEW_DOMAIN_SERVICE: { primary: 'DOMAIN', support: ['ARCHITECT', 'QA'] },
    NEW_INTEGRATION: { primary: 'INTEGRATIONS', support: ['SECURITY', 'QA'] },
    DATABASE_MIGRATION: { primary: 'INFRA', support: ['ARCHITECT', 'SECURITY'] },
    AI_RAG_FEATURE: { primary: 'AI_RAG', support: ['DOMAIN', 'SECURITY'] },
    UI_COMPONENT: { primary: 'FRONTEND', support: ['QA'] },
    SECURITY_FIX: { primary: 'SECURITY', support: ['QA', 'DEVOPS'] },
    PERFORMANCE_ISSUE: { primary: 'QA', support: ['INFRA', 'AI_RAG'] },
    DEPLOYMENT: { primary: 'DEVOPS', support: ['SECURITY', 'QA'] },
    COMPLIANCE_AUDIT: { primary: 'COMPLIANCE', support: ['SECURITY', 'QA'] },
    ARCHITECTURE_REFACTOR: { primary: 'ARCHITECT', support: ['DOMAIN', 'QA'] },
  };

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the resolver agent for a conflict type
 */
export function getConflictResolver(conflictType: ConflictType): AgentCodename {
  const resolvers: Record<ConflictType, AgentCodename> = {
    LAYER_VIOLATION: 'ARCHITECT',
    SECURITY_RISK: 'SECURITY',
    COMPLIANCE_BREACH: 'COMPLIANCE',
    PERFORMANCE_REGRESSION: 'QA',
    INTEGRATION_FAILURE: 'INTEGRATIONS',
    TEST_FAILURE: 'QA',
    MERGE_CONFLICT: 'ARCHITECT',
  };
  return resolvers[conflictType];
}

/**
 * Check if an agent has higher priority than another
 */
export function hasHigherPriority(agent1: AgentCodename, agent2: AgentCodename): boolean {
  return AGENT_PRIORITY[agent1] < AGENT_PRIORITY[agent2];
}

/**
 * Determine if quality gates passed
 */
export function allQualityGatesPassed(results: QualityGateResult[]): boolean {
  return results.every((r) => r.status === 'PASSED' || r.status === 'SKIPPED');
}

/**
 * Get required quality gates for a task type
 */
export function getRequiredQualityGates(taskType: string): QualityGate[] {
  return TASK_TYPE_QUALITY_GATES[taskType] ?? ['G5_QUALITY'];
}

/**
 * Get default routing for a task type
 */
export function getTaskRouting(
  taskType: string
): { primary: AgentCodename; support: AgentCodename[] } {
  return TASK_TYPE_ROUTING[taskType] ?? { primary: 'DOMAIN', support: ['QA'] };
}
