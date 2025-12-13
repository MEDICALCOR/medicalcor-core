/**
 * MedicalCor Orchestration Types - Platinum++ Standard
 *
 * Type definitions for the multi-agent orchestration system.
 * Implements 0.1% worldwide surgical execution patterns with:
 * - Branded types for compile-time safety
 * - Result monad for functional error handling
 * - State machine patterns with checkpointing
 * - Resilience patterns (bulkhead, deduplication)
 * - Full telemetry and audit trail integration
 *
 * Standards: Medical-Grade | Banking-Level Security | Surgical Execution
 *
 * @module @medicalcor/types/schemas/orchestration
 * @version 2.0.0-platinum
 */

import { z } from 'zod';

// =============================================================================
// BRANDED TYPES - Compile-Time Safety
// =============================================================================

declare const __brand: unique symbol;
type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

/** Unique orchestration session identifier */
export type OrchestrationSessionId = Brand<string, 'OrchestrationSessionId'>;
/** Unique agent directive identifier */
export type AgentDirectiveId = Brand<string, 'AgentDirectiveId'>;
/** Unique conflict resolution identifier */
export type ConflictId = Brand<string, 'ConflictId'>;
/** Trace ID for distributed tracing */
export type TraceId = Brand<string, 'TraceId'>;
/** Idempotency key for exactly-once execution */
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
/** Correlation ID for workflow tracing */
export type CorrelationId = Brand<string, 'CorrelationId'>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSessionId(value: string): OrchestrationSessionId {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid OrchestrationSessionId: ${value}`);
  }
  return value as OrchestrationSessionId;
}

export function createDirectiveId(value: string): AgentDirectiveId {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid AgentDirectiveId: ${value}`);
  }
  return value as AgentDirectiveId;
}

export function createCorrelationId(value: string): CorrelationId {
  return value as CorrelationId;
}

export function createIdempotencyKey(operation: string, ...parts: string[]): IdempotencyKey {
  return `${operation}:${parts.join(':')}` as IdempotencyKey;
}

// =============================================================================
// IDEMPOTENCY KEY FACTORY - Exactly-Once Semantics
// =============================================================================

export const IdempotencyKeys = {
  /** Custom key for specific operations */
  custom: (operation: string, ...parts: string[]): IdempotencyKey =>
    createIdempotencyKey(operation, ...parts),

  /** Key for scheduled/cron jobs */
  cronJob: (jobName: string, dateString: string): IdempotencyKey =>
    createIdempotencyKey('cron', jobName, dateString),

  /** Key for agent dispatch */
  agentDispatch: (sessionId: string, agent: string): IdempotencyKey =>
    createIdempotencyKey('agent-dispatch', sessionId, agent),

  /** Key for quality gate check */
  qualityGate: (sessionId: string, gate: string): IdempotencyKey =>
    createIdempotencyKey('quality-gate', sessionId, gate),

  /** Key for session operations */
  session: (operation: string, sessionId: string): IdempotencyKey =>
    createIdempotencyKey('session', operation, sessionId),
} as const;

// =============================================================================
// AGENT CODENAMES & ROLES - Fleet Configuration
// =============================================================================

export const AGENT_CODENAMES = [
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
] as const;

export const AgentCodenameSchema = z.enum(AGENT_CODENAMES);

export type AgentCodename = z.infer<typeof AgentCodenameSchema>;

/** Agent metadata for fleet management */
export interface AgentMetadata {
  codename: AgentCodename;
  displayName: string;
  priority: number;
  capabilities: string[];
  constraints: string[];
  healthCheckUrl?: string;
}

export const AGENT_FLEET: Record<AgentCodename, AgentMetadata> = {
  ORCHESTRATOR: {
    codename: 'ORCHESTRATOR',
    displayName: 'Master Coordinator',
    priority: 0,
    capabilities: ['task-routing', 'conflict-resolution', 'quality-gates', 'audit-trail'],
    constraints: ['Ensure all agents complete', 'Maintain audit trail'],
  },
  SECURITY: {
    codename: 'SECURITY',
    displayName: 'Security Guardian',
    priority: 1,
    capabilities: ['threat-analysis', 'encryption-review', 'secret-scanning', 'zero-trust'],
    constraints: ['No secrets in code', 'Encryption for PHI', 'OWASP compliance'],
  },
  COMPLIANCE: {
    codename: 'COMPLIANCE',
    displayName: 'Compliance Officer',
    priority: 2,
    capabilities: ['hipaa-audit', 'gdpr-review', 'consent-verification', 'breach-detection'],
    constraints: ['Verify consent flows', 'Check PII handling', '72h breach notification'],
  },
  ARCHITECT: {
    codename: 'ARCHITECT',
    displayName: 'System Architect',
    priority: 3,
    capabilities: ['layer-validation', 'ddd-patterns', 'hexagonal-design', 'port-adapter'],
    constraints: ['No layer violations', 'Follow hexagonal architecture', 'ADR required'],
  },
  DOMAIN: {
    codename: 'DOMAIN',
    displayName: 'Domain Expert',
    priority: 4,
    capabilities: ['business-logic', 'aggregate-design', 'event-sourcing', 'value-objects'],
    constraints: ['No infrastructure imports', 'Pure business logic only', 'DDD patterns'],
  },
  QA: {
    codename: 'QA',
    displayName: 'Quality Assurance',
    priority: 5,
    capabilities: ['unit-tests', 'integration-tests', 'e2e-tests', 'property-tests', 'k6-load'],
    constraints: ['Coverage >80%', 'Property-based tests', 'No flaky tests'],
  },
  INFRA: {
    codename: 'INFRA',
    displayName: 'Infrastructure Engineer',
    priority: 6,
    capabilities: ['database-design', 'migrations', 'indexing', 'caching', 'redis'],
    constraints: ['Repository pattern', 'Proper indexes', 'No breaking migrations'],
  },
  INTEGRATIONS: {
    codename: 'INTEGRATIONS',
    displayName: 'Integration Specialist',
    priority: 7,
    capabilities: ['api-clients', 'circuit-breakers', 'retry-logic', 'webhook-handlers'],
    constraints: ['Circuit breakers required', 'Rate limiting', 'Idempotency keys'],
  },
  AI_RAG: {
    codename: 'AI_RAG',
    displayName: 'AI/RAG Engineer',
    priority: 8,
    capabilities: ['embeddings', 'cognitive-memory', 'gpt-4o', 'scoring', 'vector-search'],
    constraints: ['Validate dimensions', 'Check token limits', 'Budget controls'],
  },
  DEVOPS: {
    codename: 'DEVOPS',
    displayName: 'DevOps Engineer',
    priority: 9,
    capabilities: ['ci-cd', 'deployment', 'monitoring', 'alerting', 'rollback'],
    constraints: ['Rollback plan required', 'Health checks', 'Canary deployment'],
  },
  FRONTEND: {
    codename: 'FRONTEND',
    displayName: 'Frontend Developer',
    priority: 10,
    capabilities: ['react', 'nextjs', 'radix-ui', 'tailwind', 'accessibility'],
    constraints: ['Accessibility compliance', 'Mobile responsive', 'Lighthouse >90'],
  },
};

// =============================================================================
// TASK COMPLEXITY & RISK - State Machine
// =============================================================================

export const TASK_COMPLEXITIES = [
  'TRIVIAL', // Single file, no deps, <10 min
  'SIMPLE', // 2-3 files, single package, <30 min
  'MODERATE', // Multiple packages, may have db changes, <2h
  'COMPLEX', // Cross-cutting, new integrations, <1 day
  'CRITICAL', // Security, compliance, production, requires ADR
] as const;

export const TaskComplexitySchema = z.enum(TASK_COMPLEXITIES);
export type TaskComplexity = z.infer<typeof TaskComplexitySchema>;

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const RiskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

// =============================================================================
// QUALITY GATES - Surgical Validation
// =============================================================================

export const QUALITY_GATES = [
  'G1_ARCHITECTURE', // Layer boundaries, ports/adapters
  'G2_DOMAIN_PURITY', // No infra imports, pure logic
  'G3_COMPLIANCE', // HIPAA/GDPR verification
  'G4_SECURITY', // No secrets, encryption verified
  'G5_QUALITY', // Tests pass, coverage >80%
  'G6_PERFORMANCE', // No regressions, k6 pass
  'G7_DEPLOYMENT', // CI green, rollback ready
] as const;

export const QualityGateSchema = z.enum(QUALITY_GATES);
export type QualityGate = z.infer<typeof QualityGateSchema>;

export const QUALITY_GATE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'SKIPPED',
  'BLOCKED',
] as const;

export const QualityGateStatusSchema = z.enum(QUALITY_GATE_STATUSES);
export type QualityGateStatus = z.infer<typeof QualityGateStatusSchema>;

export const QualityGateResultSchema = z.object({
  gate: QualityGateSchema,
  status: QualityGateStatusSchema,
  checkedAt: z.string().datetime(),
  checkedBy: AgentCodenameSchema,
  durationMs: z.number().nonnegative(),
  notes: z.string().optional(),
  errors: z.array(z.string()).optional(),
  metrics: z
    .object({
      coverage: z.number().min(0).max(100).optional(),
      testsPass: z.number().nonnegative().optional(),
      testsFailed: z.number().nonnegative().optional(),
      latencyP99Ms: z.number().nonnegative().optional(),
    })
    .optional(),
});

export type QualityGateResult = z.infer<typeof QualityGateResultSchema>;

export const QualityGateConfigSchema = z.object({
  gate: QualityGateSchema,
  required: z.boolean(),
  timeout: z.number().positive(),
  retryAttempts: z.number().nonnegative().default(0),
  requiredAgents: z.array(AgentCodenameSchema),
  validationCommand: z.string().optional(),
});

export type QualityGateConfig = z.infer<typeof QualityGateConfigSchema>;

// =============================================================================
// TASK ANALYSIS - Strategic Decomposition
// =============================================================================

export const TaskAnalysisSchema = z.object({
  id: z.string().uuid(),
  complexity: TaskComplexitySchema,
  requiredAgents: z.array(AgentCodenameSchema),
  parallelizable: z.boolean(),
  dependencies: z.record(AgentCodenameSchema, z.array(AgentCodenameSchema)),
  estimatedRisk: RiskLevelSchema,
  complianceRequired: z.boolean(),
  securityReview: z.boolean(),
  affectedPackages: z.array(z.string()),
  affectedFiles: z.array(z.string()),
  estimatedDurationMs: z.number().nonnegative().optional(),
  requiredQualityGates: z.array(QualityGateSchema),
  taskType: z.string(),
  keywords: z.array(z.string()),
  analyzedAt: z.string().datetime(),
});

export type TaskAnalysis = z.infer<typeof TaskAnalysisSchema>;

// =============================================================================
// AGENT DIRECTIVES & REPORTS - Command/Response Pattern
// =============================================================================

export const TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const REPORTING_FREQUENCIES = [
  'CONTINUOUS', // Real-time updates
  'ON_COMPLETION', // Only when done
  'ON_BLOCKER', // Only when blocked
  'PERIODIC', // Every N minutes
] as const;

export const ReportingFrequencySchema = z.enum(REPORTING_FREQUENCIES);
export type ReportingFrequency = z.infer<typeof ReportingFrequencySchema>;

export const AgentDirectiveSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  target: AgentCodenameSchema,
  priority: TaskPrioritySchema,
  task: z.string(),
  description: z.string(),
  constraints: z.array(z.string()),
  deadline: z.string().datetime().optional(),
  dependencies: z.array(AgentCodenameSchema),
  reportingFrequency: ReportingFrequencySchema,
  requiredQualityGates: z.array(QualityGateSchema),
  idempotencyKey: z.string(),
  context: z
    .object({
      files: z.array(z.string()).optional(),
      codeSnippets: z.record(z.string(), z.string()).optional(),
      previousFindings: z.array(z.string()).optional(),
      relatedIssues: z.array(z.string()).optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

export type AgentDirective = z.infer<typeof AgentDirectiveSchema>;

export const AGENT_TASK_STATUSES = [
  'PENDING',
  'QUEUED',
  'IN_PROGRESS',
  'COMPLETED',
  'BLOCKED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
] as const;

export const AgentTaskStatusSchema = z.enum(AGENT_TASK_STATUSES);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;

export const FINDING_TYPES = [
  'INFO',
  'WARNING',
  'ERROR',
  'SECURITY',
  'COMPLIANCE',
  'PERFORMANCE',
  'ACCESSIBILITY',
] as const;

export const FindingTypeSchema = z.enum(FINDING_TYPES);

export const FindingSchema = z.object({
  id: z.string().uuid(),
  type: FindingTypeSchema,
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  suggestion: z.string().optional(),
  codeSnippet: z.string().optional(),
  ruleId: z.string().optional(),
  documentationUrl: z.string().url().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const RecommendationSchema = z.object({
  id: z.string().uuid(),
  priority: TaskPrioritySchema,
  action: z.string(),
  reason: z.string(),
  assignTo: AgentCodenameSchema.optional(),
  estimatedEffortMs: z.number().nonnegative().optional(),
  category: z.enum(['MUST_FIX', 'SHOULD_FIX', 'CONSIDER', 'OPTIONAL']),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

export const BLOCKER_TYPES = [
  'DEPENDENCY', // Waiting on another agent
  'RESOURCE', // Missing resource/access
  'APPROVAL', // Needs human approval
  'TECHNICAL', // Technical issue
  'COMPLIANCE', // Compliance concern
  'SECURITY', // Security concern
  'EXTERNAL', // External system issue
] as const;

export const BlockerTypeSchema = z.enum(BLOCKER_TYPES);

export const BlockerSchema = z.object({
  id: z.string().uuid(),
  type: BlockerTypeSchema,
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string(),
  blockedBy: AgentCodenameSchema.optional(),
  requiredAction: z.string(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  resolution: z.string().optional(),
});

export type Blocker = z.infer<typeof BlockerSchema>;

export const AgentReportSchema = z.object({
  id: z.string().uuid(),
  directiveId: z.string().uuid(),
  sessionId: z.string().uuid(),
  agent: AgentCodenameSchema,
  task: z.string(),
  status: AgentTaskStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().nonnegative().optional(),
  findings: z.array(FindingSchema),
  recommendations: z.array(RecommendationSchema),
  blockers: z.array(BlockerSchema),
  nextSteps: z.array(z.string()),
  qualityGateResults: z.array(QualityGateResultSchema),
  artifacts: z.object({
    filesCreated: z.array(z.string()),
    filesModified: z.array(z.string()),
    filesDeleted: z.array(z.string()),
    testsAdded: z.array(z.string()),
    migrationsAdded: z.array(z.string()),
    logsUrl: z.string().url().optional(),
  }),
  metrics: z.object({
    linesAdded: z.number().nonnegative(),
    linesRemoved: z.number().nonnegative(),
    filesChanged: z.number().nonnegative(),
    testCoverage: z.number().min(0).max(100).optional(),
    executionTimeMs: z.number().nonnegative(),
  }),
  checkpoint: z
    .object({
      lastProcessedItem: z.string().optional(),
      progress: z.number().min(0).max(100),
      resumable: z.boolean(),
      checkpointData: z.record(z.unknown()),
    })
    .optional(),
});

export type AgentReport = z.infer<typeof AgentReportSchema>;

// =============================================================================
// CONFLICT RESOLUTION - Priority-Based Arbitration
// =============================================================================

export const CONFLICT_TYPES = [
  'LAYER_VIOLATION', // Architecture boundary crossed
  'SECURITY_RISK', // Security vulnerability introduced
  'COMPLIANCE_BREACH', // HIPAA/GDPR violation
  'PERFORMANCE_REGRESSION', // P95 latency increased
  'INTEGRATION_FAILURE', // External service issue
  'TEST_FAILURE', // Tests not passing
  'MERGE_CONFLICT', // Git merge conflict
  'RESOURCE_CONTENTION', // Same file modified
  'DEADLINE_CONFLICT', // Timeline issues
] as const;

export const ConflictTypeSchema = z.enum(CONFLICT_TYPES);
export type ConflictType = z.infer<typeof ConflictTypeSchema>;

export const CONFLICT_ACTIONS = [
  'BLOCK_MERGE', // Prevent merging
  'REQUIRE_REFACTOR', // Must refactor
  'ESCALATE', // Escalate to human
  'ROLLBACK', // Revert changes
  'CONTINUE_WITH_WARNING', // Proceed with warning
  'AUTO_RESOLVE', // Automatic resolution
] as const;

export const ConflictActionSchema = z.enum(CONFLICT_ACTIONS);

export const ConflictResolutionSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  type: ConflictTypeSchema,
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  detectedBy: AgentCodenameSchema,
  detectedAt: z.string().datetime(),
  description: z.string(),
  affectedAgents: z.array(AgentCodenameSchema),
  affectedFiles: z.array(z.string()),
  resolver: AgentCodenameSchema,
  resolution: z.string().optional(),
  resolvedAt: z.string().datetime().optional(),
  action: ConflictActionSchema,
  escalatedTo: z.string().optional(),
  auditTrail: z.array(
    z.object({
      timestamp: z.string().datetime(),
      actor: z.string(),
      action: z.string(),
      details: z.string().optional(),
    })
  ),
});

export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;

// =============================================================================
// ORCHESTRATION SESSION - State Machine with Checkpointing
// =============================================================================

export const ORCHESTRATION_STATUSES = [
  'CREATED', // Session created
  'ANALYZING', // Task analysis in progress
  'ANALYZED', // Analysis complete
  'DISPATCHING', // Dispatching agents
  'IN_PROGRESS', // Agents working
  'VALIDATING', // Quality gates running
  'RESOLVING_CONFLICTS', // Conflict resolution
  'COMPLETING', // Finalizing
  'COMPLETED', // Successfully completed
  'APPROVED', // Approved for merge
  'BLOCKED', // Blocked by issue
  'FAILED', // Failed with errors
  'CANCELLED', // Cancelled by user
  'PAUSED', // Paused for later
  'TIMED_OUT', // Exceeded deadline
] as const;

export const OrchestrationStatusSchema = z.enum(ORCHESTRATION_STATUSES);
export type OrchestrationStatus = z.infer<typeof OrchestrationStatusSchema>;

/** Valid status transitions */
export const VALID_STATUS_TRANSITIONS: Record<OrchestrationStatus, OrchestrationStatus[]> = {
  CREATED: ['ANALYZING', 'CANCELLED'],
  ANALYZING: ['ANALYZED', 'FAILED', 'CANCELLED'],
  ANALYZED: ['DISPATCHING', 'CANCELLED'],
  DISPATCHING: ['IN_PROGRESS', 'FAILED', 'CANCELLED'],
  IN_PROGRESS: ['VALIDATING', 'RESOLVING_CONFLICTS', 'BLOCKED', 'FAILED', 'PAUSED', 'CANCELLED'],
  VALIDATING: ['COMPLETING', 'RESOLVING_CONFLICTS', 'BLOCKED', 'FAILED'],
  RESOLVING_CONFLICTS: ['IN_PROGRESS', 'BLOCKED', 'FAILED', 'CANCELLED'],
  COMPLETING: ['COMPLETED', 'APPROVED', 'FAILED'],
  COMPLETED: ['APPROVED'],
  APPROVED: [],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED', 'FAILED'],
  FAILED: [],
  CANCELLED: [],
  PAUSED: ['IN_PROGRESS', 'CANCELLED'],
  TIMED_OUT: ['FAILED'],
};

export function isValidStatusTransition(
  from: OrchestrationStatus,
  to: OrchestrationStatus
): boolean {
  return VALID_STATUS_TRANSITIONS[from].includes(to);
}

export const OrchestrationCheckpointSchema = z.object({
  version: z.number(),
  status: OrchestrationStatusSchema,
  resumable: z.boolean().default(true),
  lastProcessedDirectiveId: z.string().uuid().optional(),
  completedAgents: z.array(AgentCodenameSchema),
  pendingAgents: z.array(AgentCodenameSchema),
  passedGates: z.array(QualityGateSchema),
  failedGates: z.array(QualityGateSchema),
  unresolvedConflicts: z.number(),
  checkpointData: z.record(z.unknown()),
  savedAt: z.string().datetime(),
});

export type OrchestrationCheckpoint = z.infer<typeof OrchestrationCheckpointSchema>;

export const OrchestrationSessionSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string(),
  traceId: z.string().optional(),
  status: OrchestrationStatusSchema,
  request: z.string(),
  priority: TaskPrioritySchema,
  analysis: TaskAnalysisSchema.optional(),
  directives: z.array(AgentDirectiveSchema),
  reports: z.array(AgentReportSchema),
  qualityGates: z.array(QualityGateResultSchema),
  conflicts: z.array(ConflictResolutionSchema),
  checkpoint: OrchestrationCheckpointSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  deadline: z.string().datetime().optional(),
  summary: z.string().optional(),
  metadata: z
    .object({
      initiatedBy: z.string().optional(),
      branch: z.string().optional(),
      relatedIssues: z.array(z.string()).optional(),
      previousSessions: z.array(z.string().uuid()).optional(),
      environment: z.enum(['development', 'staging', 'production']).optional(),
    })
    .optional(),
  auditTrail: z.array(
    z.object({
      timestamp: z.string().datetime(),
      actor: z.string(),
      action: z.string(),
      fromStatus: OrchestrationStatusSchema.optional(),
      toStatus: OrchestrationStatusSchema.optional(),
      details: z.string().optional(),
    })
  ),
});

export type OrchestrationSession = z.infer<typeof OrchestrationSessionSchema>;

// =============================================================================
// ORCHESTRATION EVENTS - Event Sourcing
// =============================================================================

export const ORCHESTRATION_EVENT_TYPES = [
  'SESSION_CREATED',
  'SESSION_STARTED',
  'TASK_ANALYZED',
  'AGENT_DISPATCHED',
  'AGENT_STARTED',
  'AGENT_PROGRESS',
  'AGENT_COMPLETED',
  'AGENT_BLOCKED',
  'AGENT_FAILED',
  'QUALITY_GATE_STARTED',
  'QUALITY_GATE_PASSED',
  'QUALITY_GATE_FAILED',
  'CONFLICT_DETECTED',
  'CONFLICT_RESOLVED',
  'CHECKPOINT_SAVED',
  'SESSION_PAUSED',
  'SESSION_RESUMED',
  'SESSION_COMPLETED',
  'SESSION_FAILED',
  'SESSION_CANCELLED',
] as const;

export const OrchestrationEventTypeSchema = z.enum(ORCHESTRATION_EVENT_TYPES);
export type OrchestrationEventType = z.infer<typeof OrchestrationEventTypeSchema>;

export const OrchestrationEventBaseSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  correlationId: z.string(),
  traceId: z.string().optional(),
  type: OrchestrationEventTypeSchema,
  timestamp: z.string().datetime(),
  version: z.number(),
  actor: z.string(),
});

export const SessionCreatedEventSchema = OrchestrationEventBaseSchema.extend({
  type: z.literal('SESSION_CREATED'),
  payload: z.object({
    request: z.string(),
    priority: TaskPrioritySchema,
    initiatedBy: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
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
  type: z.literal('QUALITY_GATE_PASSED').or(z.literal('QUALITY_GATE_FAILED')),
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
    durationMs: z.number().nonnegative(),
  }),
});

export type SessionCreatedEvent = z.infer<typeof SessionCreatedEventSchema>;
export type TaskAnalyzedEvent = z.infer<typeof TaskAnalyzedEventSchema>;
export type AgentDispatchedEvent = z.infer<typeof AgentDispatchedEventSchema>;
export type AgentCompletedEvent = z.infer<typeof AgentCompletedEventSchema>;
export type QualityGateCheckedEvent = z.infer<typeof QualityGateCheckedEventSchema>;
export type ConflictDetectedEvent = z.infer<typeof ConflictDetectedEventSchema>;
export type SessionCompletedEvent = z.infer<typeof SessionCompletedEventSchema>;

// =============================================================================
// REQUEST/RESPONSE - Input Validation
// =============================================================================

export const CreateOrchestrationSessionSchema = z.object({
  request: z.string().min(10).max(10000),
  priority: TaskPrioritySchema.optional().default('MEDIUM'),
  deadline: z.string().datetime().optional(),
  initiatedBy: z.string().optional(),
  context: z
    .object({
      branch: z.string().optional(),
      relatedIssues: z.array(z.string()).optional(),
      previousSessions: z.array(z.string().uuid()).optional(),
      environment: z.enum(['development', 'staging', 'production']).optional(),
    })
    .optional(),
  idempotencyKey: z.string().optional(),
});

export type CreateOrchestrationSession = z.infer<typeof CreateOrchestrationSessionSchema>;

export const OrchestrationReportSchema = z.object({
  sessionId: z.string().uuid(),
  correlationId: z.string(),
  status: OrchestrationStatusSchema,
  request: z.string(),
  complexity: TaskComplexitySchema,
  riskLevel: RiskLevelSchema,
  agentAssignments: z.array(
    z.object({
      agent: AgentCodenameSchema,
      task: z.string(),
      status: AgentTaskStatusSchema,
      durationMs: z.number().nonnegative().optional(),
      findings: z.number().nonnegative(),
      notes: z.string().optional(),
    })
  ),
  qualityGates: z.array(QualityGateResultSchema),
  blockers: z.array(BlockerSchema),
  recommendations: z.array(RecommendationSchema),
  conflicts: z.array(ConflictResolutionSchema),
  metrics: z.object({
    totalAgents: z.number().nonnegative(),
    completedAgents: z.number().nonnegative(),
    failedAgents: z.number().nonnegative(),
    totalGates: z.number().nonnegative(),
    passedGates: z.number().nonnegative(),
    failedGates: z.number().nonnegative(),
    totalFindings: z.number().nonnegative(),
    criticalFindings: z.number().nonnegative(),
    totalDurationMs: z.number().nonnegative(),
  }),
  finalStatus: z.enum(['APPROVED', 'BLOCKED', 'PENDING', 'FAILED']),
  summary: z.string(),
  generatedAt: z.string().datetime(),
});

export type OrchestrationReport = z.infer<typeof OrchestrationReportSchema>;

// =============================================================================
// RESILIENCE CONFIGURATION
// =============================================================================

export const OrchestrationResilienceConfigSchema = z.object({
  bulkhead: z.object({
    maxConcurrentAgents: z.number().min(1).max(20).default(5),
    maxQueuedDirectives: z.number().min(0).max(100).default(20),
    queueTimeoutMs: z.number().min(1000).max(300000).default(60000),
  }),
  timeout: z.object({
    agentExecutionMs: z.number().min(10000).max(3600000).default(300000),
    qualityGateMs: z.number().min(5000).max(600000).default(120000),
    sessionTotalMs: z.number().min(60000).max(86400000).default(3600000),
  }),
  retry: z.object({
    maxAttempts: z.number().min(0).max(5).default(3),
    initialDelayMs: z.number().min(100).max(10000).default(1000),
    maxDelayMs: z.number().min(1000).max(60000).default(30000),
    backoffFactor: z.number().min(1).max(4).default(2),
  }),
  circuitBreaker: z.object({
    failureThreshold: z.number().min(1).max(10).default(5),
    recoveryTimeMs: z.number().min(5000).max(300000).default(60000),
    halfOpenRequests: z.number().min(1).max(5).default(1),
  }),
});

export type OrchestrationResilienceConfig = z.infer<typeof OrchestrationResilienceConfigSchema>;

// =============================================================================
// CONSTANTS & HELPERS
// =============================================================================

/** Agent priority for conflict resolution (lower = higher priority) */
export const AGENT_PRIORITY: Record<AgentCodename, number> = {
  ORCHESTRATOR: 0,
  SECURITY: 1,
  COMPLIANCE: 2,
  ARCHITECT: 3,
  DOMAIN: 4,
  QA: 5,
  INFRA: 6,
  INTEGRATIONS: 7,
  AI_RAG: 8,
  DEVOPS: 9,
  FRONTEND: 10,
};

/** Quality gates required for each task type */
export const TASK_TYPE_QUALITY_GATES: Record<string, QualityGate[]> = {
  NEW_DOMAIN_SERVICE: ['G1_ARCHITECTURE', 'G2_DOMAIN_PURITY', 'G5_QUALITY'],
  NEW_INTEGRATION: ['G3_COMPLIANCE', 'G4_SECURITY', 'G5_QUALITY'],
  DATABASE_MIGRATION: ['G1_ARCHITECTURE', 'G4_SECURITY', 'G5_QUALITY'],
  AI_RAG_FEATURE: ['G2_DOMAIN_PURITY', 'G4_SECURITY', 'G5_QUALITY', 'G6_PERFORMANCE'],
  UI_COMPONENT: ['G5_QUALITY', 'G6_PERFORMANCE'],
  SECURITY_FIX: ['G3_COMPLIANCE', 'G4_SECURITY', 'G5_QUALITY', 'G7_DEPLOYMENT'],
  PERFORMANCE_ISSUE: ['G5_QUALITY', 'G6_PERFORMANCE'],
  DEPLOYMENT: ['G4_SECURITY', 'G5_QUALITY', 'G7_DEPLOYMENT'],
  COMPLIANCE_AUDIT: ['G3_COMPLIANCE', 'G4_SECURITY'],
  ARCHITECTURE_REFACTOR: ['G1_ARCHITECTURE', 'G2_DOMAIN_PURITY', 'G5_QUALITY'],
};

/** Default routing for task types */
export const TASK_TYPE_ROUTING: Record<
  string,
  { primary: AgentCodename; support: AgentCodename[] }
> = {
  NEW_DOMAIN_SERVICE: { primary: 'DOMAIN', support: ['ARCHITECT', 'QA'] },
  NEW_INTEGRATION: { primary: 'INTEGRATIONS', support: ['SECURITY', 'QA'] },
  DATABASE_MIGRATION: { primary: 'INFRA', support: ['ARCHITECT', 'SECURITY'] },
  AI_RAG_FEATURE: { primary: 'AI_RAG', support: ['DOMAIN', 'SECURITY', 'QA'] },
  UI_COMPONENT: { primary: 'FRONTEND', support: ['QA'] },
  SECURITY_FIX: { primary: 'SECURITY', support: ['QA', 'DEVOPS', 'COMPLIANCE'] },
  PERFORMANCE_ISSUE: { primary: 'QA', support: ['INFRA', 'AI_RAG'] },
  DEPLOYMENT: { primary: 'DEVOPS', support: ['SECURITY', 'QA'] },
  COMPLIANCE_AUDIT: { primary: 'COMPLIANCE', support: ['SECURITY', 'QA'] },
  ARCHITECTURE_REFACTOR: { primary: 'ARCHITECT', support: ['DOMAIN', 'QA'] },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Get the resolver agent for a conflict type */
export function getConflictResolver(conflictType: ConflictType): AgentCodename {
  const resolvers: Record<ConflictType, AgentCodename> = {
    LAYER_VIOLATION: 'ARCHITECT',
    SECURITY_RISK: 'SECURITY',
    COMPLIANCE_BREACH: 'COMPLIANCE',
    PERFORMANCE_REGRESSION: 'QA',
    INTEGRATION_FAILURE: 'INTEGRATIONS',
    TEST_FAILURE: 'QA',
    MERGE_CONFLICT: 'ARCHITECT',
    RESOURCE_CONTENTION: 'ORCHESTRATOR',
    DEADLINE_CONFLICT: 'ORCHESTRATOR',
  };
  return resolvers[conflictType];
}

/** Check if agent1 has higher priority than agent2 */
export function hasHigherPriority(agent1: AgentCodename, agent2: AgentCodename): boolean {
  return AGENT_PRIORITY[agent1] < AGENT_PRIORITY[agent2];
}

/** Check if all quality gates passed */
export function allQualityGatesPassed(results: QualityGateResult[]): boolean {
  return results.every((r) => r.status === 'PASSED' || r.status === 'SKIPPED');
}

/** Get failed quality gates */
export function getFailedQualityGates(results: QualityGateResult[]): QualityGate[] {
  return results.filter((r) => r.status === 'FAILED').map((r) => r.gate);
}

/** Get required quality gates for a task type */
export function getRequiredQualityGates(taskType: string): QualityGate[] {
  return TASK_TYPE_QUALITY_GATES[taskType] ?? ['G5_QUALITY'];
}

/** Get default routing for a task type */
export function getTaskRouting(taskType: string): {
  primary: AgentCodename;
  support: AgentCodename[];
} {
  return TASK_TYPE_ROUTING[taskType] ?? { primary: 'DOMAIN', support: ['QA'] };
}

/** Calculate session progress percentage */
export function calculateProgress(session: OrchestrationSession): number {
  if (session.status === 'COMPLETED' || session.status === 'APPROVED') return 100;
  if (session.status === 'CREATED') return 0;
  if (session.status === 'ANALYZING') return 10;
  if (session.status === 'ANALYZED') return 20;
  if (session.status === 'DISPATCHING') return 30;

  const totalAgents = session.directives.length;
  const completedAgents = session.reports.filter((r) => r.status === 'COMPLETED').length;
  const agentProgress = totalAgents > 0 ? (completedAgents / totalAgents) * 40 : 0;

  const totalGates = session.analysis?.requiredQualityGates.length ?? 0;
  const passedGates = session.qualityGates.filter((g) => g.status === 'PASSED').length;
  const gateProgress = totalGates > 0 ? (passedGates / totalGates) * 20 : 0;

  return Math.min(30 + agentProgress + gateProgress, 99);
}

/** Determine if session can be resumed */
export function isResumable(session: OrchestrationSession): boolean {
  return (
    session.checkpoint !== undefined &&
    session.checkpoint.resumable &&
    ['PAUSED', 'BLOCKED', 'IN_PROGRESS'].includes(session.status)
  );
}

/** Get agent by codename */
export function getAgentMetadata(codename: AgentCodename): AgentMetadata {
  return AGENT_FLEET[codename];
}

/** Generate unique session ID with timestamp */
export function generateSessionId(): OrchestrationSessionId {
  return createSessionId(crypto.randomUUID());
}

/** Generate correlation ID for workflow tracing */
export function generateCorrelationId(prefix?: string): CorrelationId {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  const random = crypto.randomUUID().split('-')[0];
  return createCorrelationId(
    prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`
  );
}
