/**
 * Data Classification Schemas (L6 Feature)
 *
 * Provides explicit PII/PHI/sensitive labels for database tables and columns.
 * Supports HIPAA/GDPR compliance by documenting data sensitivity levels.
 *
 * @module @medicalcor/types/schemas/data-classification
 */
import { z } from 'zod';

// =============================================================================
// Data Sensitivity Level
// =============================================================================

/**
 * Data sensitivity classification levels (ISO 27001 / NIST aligned)
 *
 * - PUBLIC: Non-sensitive, can be shared openly
 * - INTERNAL: Internal use only, not PII/PHI
 * - CONFIDENTIAL: Business confidential (contracts, pricing)
 * - RESTRICTED_PII: Personally Identifiable Information (GDPR scope)
 * - PHI: Protected Health Information (HIPAA scope)
 * - FINANCIAL: Financial/payment data (PCI-DSS scope)
 */
export const DataSensitivityLevelSchema = z.enum([
  'public',
  'internal',
  'confidential',
  'restricted_pii',
  'phi',
  'financial',
]);

export type DataSensitivityLevel = z.infer<typeof DataSensitivityLevelSchema>;

// =============================================================================
// Compliance Framework
// =============================================================================

/**
 * Compliance frameworks applicable to data
 */
export const ComplianceFrameworkSchema = z.enum([
  'HIPAA',
  'GDPR',
  'CCPA',
  'PCI_DSS',
  'SOC2',
  'ISO27001',
]);

export type ComplianceFramework = z.infer<typeof ComplianceFrameworkSchema>;

// =============================================================================
// Data Category
// =============================================================================

/**
 * Categories of data for GDPR Article 30 compliance
 */
export const DataCategorySchema = z.enum([
  'personal', // Basic personal data (name, email, phone)
  'contact', // Contact information
  'demographic', // Age, gender, location
  'health', // Health/medical information (special category under GDPR)
  'financial', // Payment, billing, transactions
  'behavioral', // User activity, preferences
  'authentication', // Login, session, MFA
  'communication', // Messages, emails, call records
  'consent', // Consent records and preferences
  'audit', // Audit trails and logs
  'technical', // System metadata, IDs
  'ai_generated', // AI scores, embeddings, predictions
]);

export type DataCategory = z.infer<typeof DataCategorySchema>;

// =============================================================================
// Encryption Requirement
// =============================================================================

/**
 * Encryption requirements for data at rest
 */
export const EncryptionRequirementSchema = z.enum([
  'none', // No encryption required
  'recommended', // Encryption recommended but not required
  'required', // Must be encrypted
  'field_level', // Requires field-level encryption
]);

export type EncryptionRequirement = z.infer<typeof EncryptionRequirementSchema>;

// =============================================================================
// Retention Category
// =============================================================================

/**
 * Retention policy categories (maps to gdpr_retention_policies)
 */
export const RetentionCategorySchema = z.enum([
  'medical_records', // 7 years (legal requirement)
  'consent_records', // 7 years (GDPR proof)
  'audit_logs', // 7 years (compliance)
  'marketing_leads', // 2 years
  'communication_logs', // 1 year
  'appointment_data', // 7 years
  'financial_records', // 7 years (tax/accounting)
  'session_data', // 30 days
  'temporary', // 7 days
]);

export type RetentionCategory = z.infer<typeof RetentionCategorySchema>;

// =============================================================================
// Column Classification
// =============================================================================

/**
 * Classification metadata for a single column
 */
export const ColumnClassificationSchema = z.object({
  /** Column name in the database */
  columnName: z.string().min(1),

  /** Data sensitivity level */
  sensitivityLevel: DataSensitivityLevelSchema,

  /** Whether this column contains PII */
  isPii: z.boolean().default(false),

  /** Whether this column contains PHI */
  isPhi: z.boolean().default(false),

  /** Data category for GDPR Article 30 */
  dataCategory: DataCategorySchema,

  /** Whether the column is encrypted at rest */
  isEncrypted: z.boolean().default(false),

  /** Whether this column should be redacted in logs */
  redactInLogs: z.boolean().default(false),

  /** Human-readable description */
  description: z.string().optional(),

  /** Example of PII patterns (for validation) */
  piiPatterns: z.array(z.string()).optional(),
});

export type ColumnClassification = z.infer<typeof ColumnClassificationSchema>;

// =============================================================================
// Table Classification
// =============================================================================

/**
 * Classification metadata for a database table
 */
export const TableClassificationSchema = z.object({
  /** Table name in the database */
  tableName: z.string().min(1),

  /** Schema name (defaults to 'public') */
  schemaName: z.string().default('public'),

  /** Overall sensitivity level (highest among columns) */
  sensitivityLevel: DataSensitivityLevelSchema,

  /** Whether this table contains any PII */
  containsPii: z.boolean().default(false),

  /** Whether this table contains any PHI */
  containsPhi: z.boolean().default(false),

  /** Whether this table contains financial data */
  containsFinancial: z.boolean().default(false),

  /** Applicable compliance frameworks */
  complianceFrameworks: z.array(ComplianceFrameworkSchema).default([]),

  /** Encryption requirement for the table */
  encryptionRequirement: EncryptionRequirementSchema.default('none'),

  /** Retention category for this table's data */
  retentionCategory: RetentionCategorySchema,

  /** Whether RLS is enabled on this table */
  rlsEnabled: z.boolean().default(false),

  /** Whether soft delete is used (preserves for GDPR) */
  softDeleteEnabled: z.boolean().default(false),

  /** Column-level classifications */
  columns: z.array(ColumnClassificationSchema).default([]),

  /** Human-readable description */
  description: z.string().optional(),

  /** Additional notes for compliance auditors */
  complianceNotes: z.string().optional(),

  /** Last reviewed date */
  lastReviewedAt: z.coerce.date().optional(),

  /** Reviewer ID/name */
  reviewedBy: z.string().optional(),
});

export type TableClassification = z.infer<typeof TableClassificationSchema>;

// =============================================================================
// Create/Update Schemas
// =============================================================================

/**
 * Schema for creating a new table classification entry
 */
export const CreateTableClassificationSchema = TableClassificationSchema.omit({
  lastReviewedAt: true,
  reviewedBy: true,
});

export type CreateTableClassification = z.infer<typeof CreateTableClassificationSchema>;

/**
 * Schema for updating an existing table classification
 */
export const UpdateTableClassificationSchema = TableClassificationSchema.partial().extend({
  tableName: z.string().min(1),
});

export type UpdateTableClassification = z.infer<typeof UpdateTableClassificationSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Filters for querying table classifications
 */
export const ClassificationQueryFiltersSchema = z.object({
  /** Filter by sensitivity level */
  sensitivityLevel: DataSensitivityLevelSchema.optional(),

  /** Filter tables containing PII */
  containsPii: z.boolean().optional(),

  /** Filter tables containing PHI */
  containsPhi: z.boolean().optional(),

  /** Filter by compliance framework */
  complianceFramework: ComplianceFrameworkSchema.optional(),

  /** Filter by retention category */
  retentionCategory: RetentionCategorySchema.optional(),

  /** Filter by RLS status */
  rlsEnabled: z.boolean().optional(),

  /** Search by table name */
  tableNameSearch: z.string().optional(),
});

export type ClassificationQueryFilters = z.infer<typeof ClassificationQueryFiltersSchema>;

// =============================================================================
// Compliance Report Schemas
// =============================================================================

/**
 * Summary statistics for a compliance report
 */
export const ClassificationSummarySchema = z.object({
  /** Total tables in inventory */
  totalTables: z.number().int().min(0),

  /** Tables containing PII */
  tablesWithPii: z.number().int().min(0),

  /** Tables containing PHI */
  tablesWithPhi: z.number().int().min(0),

  /** Tables with financial data */
  tablesWithFinancial: z.number().int().min(0),

  /** Tables with RLS enabled */
  tablesWithRls: z.number().int().min(0),

  /** Tables with encryption required */
  tablesWithEncryption: z.number().int().min(0),

  /** Breakdown by sensitivity level */
  bySensitivityLevel: z.record(DataSensitivityLevelSchema, z.number().int()),

  /** Breakdown by compliance framework */
  byComplianceFramework: z.record(ComplianceFrameworkSchema, z.number().int()),

  /** Breakdown by retention category */
  byRetentionCategory: z.record(RetentionCategorySchema, z.number().int()),

  /** Last update timestamp */
  lastUpdatedAt: z.coerce.date(),
});

export type ClassificationSummary = z.infer<typeof ClassificationSummarySchema>;

/**
 * Compliance gap or issue detected
 */
export const ComplianceGapSchema = z.object({
  /** Table with the gap */
  tableName: z.string(),

  /** Type of gap */
  gapType: z.enum([
    'missing_encryption',
    'missing_rls',
    'missing_soft_delete',
    'unclassified_pii',
    'missing_retention_policy',
    'stale_review',
    'missing_column_classification',
  ]),

  /** Severity of the gap */
  severity: z.enum(['low', 'medium', 'high', 'critical']),

  /** Description of the issue */
  description: z.string(),

  /** Recommended remediation */
  remediation: z.string(),

  /** Affected compliance frameworks */
  affectedFrameworks: z.array(ComplianceFrameworkSchema),
});

export type ComplianceGap = z.infer<typeof ComplianceGapSchema>;

/**
 * Full compliance report
 */
export const ClassificationComplianceReportSchema = z.object({
  /** Report generation timestamp */
  generatedAt: z.coerce.date(),

  /** Summary statistics */
  summary: ClassificationSummarySchema,

  /** List of compliance gaps */
  gaps: z.array(ComplianceGapSchema),

  /** High-risk tables requiring attention */
  highRiskTables: z.array(z.string()),

  /** Tables needing review (stale > 90 days) */
  staleReviews: z.array(z.string()),

  /** Unclassified tables */
  unclassifiedTables: z.array(z.string()),
});

export type ClassificationComplianceReport = z.infer<typeof ClassificationComplianceReportSchema>;

// =============================================================================
// Database Record Schema (matches migration)
// =============================================================================

/**
 * Schema for database record (matches data_classification table)
 */
export const DataClassificationRecordSchema = z.object({
  id: z.string().uuid(),
  tableName: z.string(),
  schemaName: z.string().default('public'),
  sensitivityLevel: DataSensitivityLevelSchema,
  containsPii: z.boolean(),
  containsPhi: z.boolean(),
  containsFinancial: z.boolean(),
  complianceFrameworks: z.array(z.string()),
  encryptionRequirement: EncryptionRequirementSchema,
  retentionCategory: RetentionCategorySchema,
  rlsEnabled: z.boolean(),
  softDeleteEnabled: z.boolean(),
  columns: z.array(ColumnClassificationSchema),
  description: z.string().nullable(),
  complianceNotes: z.string().nullable(),
  lastReviewedAt: z.coerce.date().nullable(),
  reviewedBy: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type DataClassificationRecord = z.infer<typeof DataClassificationRecordSchema>;

// =============================================================================
// Utility Constants
// =============================================================================

/**
 * Default PII column names to detect automatically
 */
export const DEFAULT_PII_COLUMN_PATTERNS = [
  'email',
  'phone',
  'phone_number',
  'full_name',
  'first_name',
  'last_name',
  'name',
  'address',
  'ip_address',
  'date_of_birth',
  'ssn',
  'social_security',
  'national_id',
] as const;

/**
 * Default PHI column patterns
 */
export const DEFAULT_PHI_COLUMN_PATTERNS = [
  'diagnosis',
  'treatment',
  'medication',
  'allergy',
  'symptom',
  'medical_history',
  'procedure',
  'health_status',
  'insurance',
  'prescription',
] as const;

/**
 * Sensitivity level precedence (higher = more sensitive)
 */
export const SENSITIVITY_PRECEDENCE: Record<DataSensitivityLevel, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  financial: 3,
  restricted_pii: 4,
  phi: 5,
};

/**
 * Get the highest sensitivity level from a list
 */
export function getHighestSensitivity(levels: DataSensitivityLevel[]): DataSensitivityLevel {
  if (levels.length === 0) return 'internal';

  return levels.reduce((highest, current) =>
    SENSITIVITY_PRECEDENCE[current] > SENSITIVITY_PRECEDENCE[highest] ? current : highest
  );
}

/**
 * Determine if a column name matches PII patterns
 */
export function isPiiColumnName(columnName: string): boolean {
  const normalized = columnName.toLowerCase();
  return DEFAULT_PII_COLUMN_PATTERNS.some(
    (pattern) => normalized.includes(pattern) || normalized === pattern
  );
}

/**
 * Determine if a column name matches PHI patterns
 */
export function isPhiColumnName(columnName: string): boolean {
  const normalized = columnName.toLowerCase();
  return DEFAULT_PHI_COLUMN_PATTERNS.some(
    (pattern) => normalized.includes(pattern) || normalized === pattern
  );
}

/**
 * Get required compliance frameworks based on data types
 */
export function getRequiredFrameworks(classification: {
  containsPii: boolean;
  containsPhi: boolean;
  containsFinancial: boolean;
}): ComplianceFramework[] {
  const frameworks: ComplianceFramework[] = [];

  if (classification.containsPii) {
    frameworks.push('GDPR', 'CCPA');
  }

  if (classification.containsPhi) {
    frameworks.push('HIPAA');
  }

  if (classification.containsFinancial) {
    frameworks.push('PCI_DSS');
  }

  // Always include SOC2 for medical applications
  frameworks.push('SOC2');

  return [...new Set(frameworks)];
}
