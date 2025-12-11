/**
 * Compliance Matrix Schemas
 *
 * Tracks constraint compliance across sprints for HIPAA, GDPR,
 * architectural, and quality requirements.
 *
 * @module @medicalcor/types/schemas/compliance-matrix
 */
import { z } from 'zod';

// =============================================================================
// Compliance Status
// =============================================================================

/**
 * Compliance status for a constraint in a sprint
 *
 * - COMPLIANT: Fully meeting requirements (✅)
 * - IN_PROGRESS: Work underway to meet requirements (🔧)
 * - NON_COMPLIANT: Not meeting requirements (❌)
 * - NOT_APPLICABLE: Constraint doesn't apply to this sprint (➖)
 */
export const ComplianceStatusSchema = z.enum([
  'compliant',
  'in_progress',
  'non_compliant',
  'not_applicable',
]);

export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

// =============================================================================
// Constraint Category
// =============================================================================

/**
 * Categories of compliance constraints
 */
export const ConstraintCategorySchema = z.enum([
  'hipaa',
  'gdpr',
  'architecture',
  'testing',
  'technical_debt',
  'observability',
  'security',
  'performance',
]);

export type ConstraintCategory = z.infer<typeof ConstraintCategorySchema>;

// =============================================================================
// Constraint Severity
// =============================================================================

/**
 * Severity level for compliance violations
 */
export const ConstraintSeveritySchema = z.enum([
  'critical', // Must be addressed immediately
  'high', // Must be addressed before release
  'medium', // Should be addressed in current sprint
  'low', // Can be deferred to next sprint
]);

export type ConstraintSeverity = z.infer<typeof ConstraintSeveritySchema>;

// =============================================================================
// Constraint Definition
// =============================================================================

/**
 * Definition of a compliance constraint
 */
export const ConstraintDefinitionSchema = z.object({
  /** Unique identifier for the constraint */
  id: z.string().min(1),

  /** Human-readable name */
  name: z.string().min(1),

  /** Description of what this constraint validates */
  description: z.string(),

  /** Category of the constraint */
  category: ConstraintCategorySchema,

  /** Severity when violated */
  severity: ConstraintSeveritySchema,

  /** Compliance frameworks this relates to */
  frameworks: z.array(z.string()).default([]),

  /** Automated check command (if available) */
  checkCommand: z.string().optional(),

  /** Documentation link */
  documentationUrl: z.string().url().optional(),

  /** Whether this constraint is active */
  isActive: z.boolean().default(true),

  /** Creation timestamp */
  createdAt: z.coerce.date(),

  /** Last update timestamp */
  updatedAt: z.coerce.date(),
});

export type ConstraintDefinition = z.infer<typeof ConstraintDefinitionSchema>;

// =============================================================================
// Sprint Compliance Entry
// =============================================================================

/**
 * Work item reference for in-progress compliance work
 */
export const ComplianceWorkItemSchema = z.object({
  /** Work item type (issue, PR, task) */
  type: z.enum(['issue', 'pull_request', 'task', 'ticket']),

  /** Reference ID (e.g., issue number, ticket ID) */
  referenceId: z.string(),

  /** URL to the work item */
  url: z.string().url().optional(),

  /** Brief description */
  description: z.string().optional(),
});

export type ComplianceWorkItem = z.infer<typeof ComplianceWorkItemSchema>;

/**
 * Compliance status for a constraint in a specific sprint
 */
export const SprintComplianceEntrySchema = z.object({
  /** Constraint ID reference */
  constraintId: z.string().min(1),

  /** Sprint identifier */
  sprintId: z.string().min(1),

  /** Compliance status */
  status: ComplianceStatusSchema,

  /** Notes about the status (e.g., what's in progress) */
  notes: z.string().optional(),

  /** Associated work items for in-progress status */
  workItems: z.array(ComplianceWorkItemSchema).default([]),

  /** Who assessed this status */
  assessedBy: z.string().optional(),

  /** When the assessment was made */
  assessedAt: z.coerce.date(),

  /** Evidence or verification details */
  evidence: z.string().optional(),

  /** Target completion date for in-progress items */
  targetDate: z.coerce.date().optional(),
});

export type SprintComplianceEntry = z.infer<typeof SprintComplianceEntrySchema>;

// =============================================================================
// Sprint Definition
// =============================================================================

/**
 * Sprint definition for tracking
 */
export const SprintDefinitionSchema = z.object({
  /** Unique sprint identifier */
  id: z.string().min(1),

  /** Sprint name (e.g., "Sprint 1", "2024-Q1") */
  name: z.string().min(1),

  /** Sprint start date */
  startDate: z.coerce.date(),

  /** Sprint end date */
  endDate: z.coerce.date(),

  /** Whether this is the current sprint */
  isCurrent: z.boolean().default(false),

  /** Sprint goals */
  goals: z.array(z.string()).default([]),
});

export type SprintDefinition = z.infer<typeof SprintDefinitionSchema>;

// =============================================================================
// Compliance Matrix
// =============================================================================

/**
 * Full compliance matrix tracking all constraints across all sprints
 */
export const ComplianceMatrixSchema = z.object({
  /** Matrix identifier */
  id: z.string().min(1),

  /** Matrix name */
  name: z.string().min(1),

  /** Description of what this matrix tracks */
  description: z.string().optional(),

  /** All constraint definitions */
  constraints: z.array(ConstraintDefinitionSchema),

  /** All sprint definitions */
  sprints: z.array(SprintDefinitionSchema),

  /** All compliance entries (constraint x sprint) */
  entries: z.array(SprintComplianceEntrySchema),

  /** Matrix creation timestamp */
  createdAt: z.coerce.date(),

  /** Last update timestamp */
  updatedAt: z.coerce.date(),

  /** Version for optimistic locking */
  version: z.number().int().min(1).default(1),
});

export type ComplianceMatrix = z.infer<typeof ComplianceMatrixSchema>;

// =============================================================================
// Create/Update Schemas
// =============================================================================

/**
 * Schema for creating a new constraint definition
 */
export const CreateConstraintDefinitionSchema = ConstraintDefinitionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateConstraintDefinition = z.infer<typeof CreateConstraintDefinitionSchema>;

/**
 * Schema for updating a constraint definition
 */
export const UpdateConstraintDefinitionSchema = ConstraintDefinitionSchema.partial().extend({
  id: z.string().min(1),
});

export type UpdateConstraintDefinition = z.infer<typeof UpdateConstraintDefinitionSchema>;

/**
 * Schema for creating a sprint compliance entry
 */
export const CreateSprintComplianceEntrySchema = SprintComplianceEntrySchema.omit({
  assessedAt: true,
});

export type CreateSprintComplianceEntry = z.infer<typeof CreateSprintComplianceEntrySchema>;

/**
 * Schema for updating a sprint compliance entry
 */
export const UpdateSprintComplianceEntrySchema = SprintComplianceEntrySchema.partial().extend({
  constraintId: z.string().min(1),
  sprintId: z.string().min(1),
});

export type UpdateSprintComplianceEntry = z.infer<typeof UpdateSprintComplianceEntrySchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying compliance entries
 */
export const ComplianceQueryFiltersSchema = z.object({
  /** Filter by constraint ID */
  constraintId: z.string().optional(),

  /** Filter by sprint ID */
  sprintId: z.string().optional(),

  /** Filter by status */
  status: ComplianceStatusSchema.optional(),

  /** Filter by category */
  category: ConstraintCategorySchema.optional(),

  /** Filter by severity */
  severity: ConstraintSeveritySchema.optional(),

  /** Only show entries needing attention (non-compliant or in-progress) */
  needsAttention: z.boolean().optional(),
});

export type ComplianceQueryFilters = z.infer<typeof ComplianceQueryFiltersSchema>;

// =============================================================================
// Report Schemas
// =============================================================================

/**
 * Summary statistics for a sprint
 */
export const SprintComplianceSummarySchema = z.object({
  /** Sprint ID */
  sprintId: z.string(),

  /** Sprint name */
  sprintName: z.string(),

  /** Total constraints tracked */
  totalConstraints: z.number().int().min(0),

  /** Number compliant */
  compliantCount: z.number().int().min(0),

  /** Number in progress */
  inProgressCount: z.number().int().min(0),

  /** Number non-compliant */
  nonCompliantCount: z.number().int().min(0),

  /** Number not applicable */
  notApplicableCount: z.number().int().min(0),

  /** Compliance percentage (excluding N/A) */
  compliancePercentage: z.number().min(0).max(100),

  /** Critical violations count */
  criticalViolations: z.number().int().min(0),

  /** High severity violations count */
  highViolations: z.number().int().min(0),
});

export type SprintComplianceSummary = z.infer<typeof SprintComplianceSummarySchema>;

/**
 * Summary by category
 */
export const CategoryComplianceSummarySchema = z.object({
  /** Category */
  category: ConstraintCategorySchema,

  /** Total constraints in category */
  totalConstraints: z.number().int().min(0),

  /** Current sprint compliance percentage */
  currentCompliancePercentage: z.number().min(0).max(100),

  /** Trend compared to previous sprint */
  trend: z.enum(['improving', 'stable', 'declining']),

  /** Number of in-progress items */
  inProgressCount: z.number().int().min(0),
});

export type CategoryComplianceSummary = z.infer<typeof CategoryComplianceSummarySchema>;

/**
 * Constraint requiring attention
 */
export const ConstraintAttentionItemSchema = z.object({
  /** Constraint definition */
  constraint: ConstraintDefinitionSchema,

  /** Current status */
  currentStatus: ComplianceStatusSchema,

  /** Sprint where attention is needed */
  sprintId: z.string(),

  /** Notes about what needs attention */
  notes: z.string().optional(),

  /** Target date if in progress */
  targetDate: z.coerce.date().optional(),

  /** Days overdue (if any) */
  daysOverdue: z.number().int().optional(),
});

export type ConstraintAttentionItem = z.infer<typeof ConstraintAttentionItemSchema>;

/**
 * Full compliance report
 */
export const ComplianceMatrixReportSchema = z.object({
  /** Report generation timestamp */
  generatedAt: z.coerce.date(),

  /** Matrix ID this report is for */
  matrixId: z.string(),

  /** Overall compliance percentage */
  overallCompliancePercentage: z.number().min(0).max(100),

  /** Per-sprint summaries */
  sprintSummaries: z.array(SprintComplianceSummarySchema),

  /** Per-category summaries */
  categorySummaries: z.array(CategoryComplianceSummarySchema),

  /** Items requiring attention */
  attentionItems: z.array(ConstraintAttentionItemSchema),

  /** Total critical violations across all sprints */
  totalCriticalViolations: z.number().int().min(0),

  /** Total high violations across all sprints */
  totalHighViolations: z.number().int().min(0),

  /** Trend analysis */
  overallTrend: z.enum(['improving', 'stable', 'declining']),
});

export type ComplianceMatrixReport = z.infer<typeof ComplianceMatrixReportSchema>;

// =============================================================================
// Event Schemas
// =============================================================================

/**
 * Event when compliance status changes
 */
export const ComplianceStatusChangedEventSchema = z.object({
  /** Event type */
  type: z.literal('compliance.status_changed'),

  /** Constraint ID */
  constraintId: z.string(),

  /** Sprint ID */
  sprintId: z.string(),

  /** Previous status */
  previousStatus: ComplianceStatusSchema,

  /** New status */
  newStatus: ComplianceStatusSchema,

  /** Who made the change */
  changedBy: z.string().optional(),

  /** When the change occurred */
  changedAt: z.coerce.date(),

  /** Notes about the change */
  notes: z.string().optional(),
});

export type ComplianceStatusChangedEvent = z.infer<typeof ComplianceStatusChangedEventSchema>;

/**
 * Event when a critical violation is detected
 */
export const CriticalViolationDetectedEventSchema = z.object({
  /** Event type */
  type: z.literal('compliance.critical_violation_detected'),

  /** Constraint that was violated */
  constraint: ConstraintDefinitionSchema,

  /** Sprint where violation was detected */
  sprintId: z.string(),

  /** Detection timestamp */
  detectedAt: z.coerce.date(),

  /** Details about the violation */
  details: z.string().optional(),

  /** Recommended remediation */
  remediation: z.string().optional(),
});

export type CriticalViolationDetectedEvent = z.infer<typeof CriticalViolationDetectedEventSchema>;

/**
 * Event when compliance target is missed
 */
export const ComplianceTargetMissedEventSchema = z.object({
  /** Event type */
  type: z.literal('compliance.target_missed'),

  /** Constraint ID */
  constraintId: z.string(),

  /** Sprint ID */
  sprintId: z.string(),

  /** Original target date */
  targetDate: z.coerce.date(),

  /** Days overdue */
  daysOverdue: z.number().int().min(1),

  /** Current status */
  currentStatus: ComplianceStatusSchema,
});

export type ComplianceTargetMissedEvent = z.infer<typeof ComplianceTargetMissedEventSchema>;

// =============================================================================
// Utility Constants
// =============================================================================

/**
 * Default constraints for MedicalCor compliance tracking
 */
export const DEFAULT_MEDICALCOR_CONSTRAINTS: Omit<
  ConstraintDefinition,
  'id' | 'createdAt' | 'updatedAt'
>[] = [
  {
    name: 'HIPAA Encryption',
    description: 'All PHI data must be encrypted at rest and in transit',
    category: 'hipaa',
    severity: 'critical',
    frameworks: ['HIPAA', 'SOC2'],
    checkCommand: 'pnpm check:encryption',
    isActive: true,
  },
  {
    name: 'HIPAA Audit',
    description: 'Audit logging must be enabled for all PHI access',
    category: 'hipaa',
    severity: 'critical',
    frameworks: ['HIPAA', 'SOC2'],
    checkCommand: 'pnpm check:audit-logs',
    isActive: true,
  },
  {
    name: 'GDPR Consent',
    description: 'Valid consent must be obtained before processing personal data',
    category: 'gdpr',
    severity: 'critical',
    frameworks: ['GDPR', 'CCPA'],
    checkCommand: 'pnpm test --filter consent',
    isActive: true,
  },
  {
    name: 'GDPR Erasure',
    description: 'Right to erasure must be implemented for all PII',
    category: 'gdpr',
    severity: 'critical',
    frameworks: ['GDPR'],
    checkCommand: 'pnpm test --filter erasure',
    isActive: true,
  },
  {
    name: 'Hexagonal Architecture',
    description: 'Domain layer must not depend on infrastructure',
    category: 'architecture',
    severity: 'high',
    frameworks: [],
    checkCommand: 'pnpm check:layer-boundaries',
    isActive: true,
  },
  {
    name: 'Test Coverage',
    description: 'Minimum 80% code coverage required',
    category: 'testing',
    severity: 'medium',
    frameworks: [],
    checkCommand: 'pnpm test:coverage',
    isActive: true,
  },
  {
    name: 'Technical Debt',
    description: 'No unresolved TODOs in production code',
    category: 'technical_debt',
    severity: 'low',
    frameworks: [],
    checkCommand: 'pnpm check:todos',
    isActive: true,
  },
  {
    name: 'Observability',
    description: 'All services must have proper logging, metrics, and tracing',
    category: 'observability',
    severity: 'medium',
    frameworks: ['SOC2'],
    checkCommand: 'pnpm check:observability',
    isActive: true,
  },
];

/**
 * Status display configuration
 */
export const COMPLIANCE_STATUS_DISPLAY: Record<
  ComplianceStatus,
  { emoji: string; label: string; color: string }
> = {
  compliant: { emoji: '✅', label: 'Compliant', color: 'green' },
  in_progress: { emoji: '🔧', label: 'In Progress', color: 'yellow' },
  non_compliant: { emoji: '❌', label: 'Non-Compliant', color: 'red' },
  not_applicable: { emoji: '➖', label: 'N/A', color: 'gray' },
};

/**
 * Category display configuration
 */
export const CONSTRAINT_CATEGORY_DISPLAY: Record<
  ConstraintCategory,
  { label: string; icon: string }
> = {
  hipaa: { label: 'HIPAA', icon: '🏥' },
  gdpr: { label: 'GDPR', icon: '🇪🇺' },
  architecture: { label: 'Architecture', icon: '🏗️' },
  testing: { label: 'Testing', icon: '🧪' },
  technical_debt: { label: 'Tech Debt', icon: '📝' },
  observability: { label: 'Observability', icon: '📊' },
  security: { label: 'Security', icon: '🔒' },
  performance: { label: 'Performance', icon: '⚡' },
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate compliance percentage from counts
 */
export function calculateCompliancePercentage(
  compliantCount: number,
  totalCount: number,
  notApplicableCount: number
): number {
  const applicableCount = totalCount - notApplicableCount;
  if (applicableCount === 0) return 100;
  return Math.round((compliantCount / applicableCount) * 100 * 100) / 100;
}

/**
 * Determine overall trend from sprint summaries
 */
export function determineComplianceTrend(
  summaries: SprintComplianceSummary[]
): 'improving' | 'stable' | 'declining' {
  if (summaries.length < 2) return 'stable';

  const sorted = [...summaries].sort((a, b) => a.sprintId.localeCompare(b.sprintId));
  const recent = sorted.slice(-2);
  const older = recent[0];
  const newer = recent[1];

  if (!older || !newer) return 'stable';

  const diff = newer.compliancePercentage - older.compliancePercentage;

  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

/**
 * Check if a constraint requires immediate attention
 */
export function requiresImmediateAttention(
  entry: SprintComplianceEntry,
  constraint: ConstraintDefinition
): boolean {
  if (entry.status === 'compliant' || entry.status === 'not_applicable') {
    return false;
  }

  if (entry.status === 'non_compliant') {
    return constraint.severity === 'critical' || constraint.severity === 'high';
  }

  // In progress - check if overdue
  if (entry.targetDate && new Date(entry.targetDate) < new Date()) {
    return true;
  }

  return false;
}

/**
 * Calculate days until or since target date
 */
export function calculateDaysFromTarget(targetDate: Date): number {
  const now = new Date();
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get severity weight for sorting
 */
export function getSeverityWeight(severity: ConstraintSeverity): number {
  const weights: Record<ConstraintSeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  return weights[severity];
}

/**
 * Sort constraints by severity (most critical first)
 */
export function sortByPriority(constraints: ConstraintDefinition[]): ConstraintDefinition[] {
  return [...constraints].sort(
    (a, b) => getSeverityWeight(b.severity) - getSeverityWeight(a.severity)
  );
}
