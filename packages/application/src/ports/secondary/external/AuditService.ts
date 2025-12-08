/**
 * @fileoverview Secondary Port - AuditService
 *
 * Defines what the application needs for audit logging (driven side).
 * This is a hexagonal architecture SECONDARY PORT for compliance and audit infrastructure.
 *
 * @module application/ports/secondary/external/AuditService
 *
 * HIPAA/GDPR COMPLIANCE:
 * All PHI access and modifications MUST be logged through this service.
 * Audit logs are immutable and retained according to compliance requirements.
 */

/**
 * SECONDARY PORT: Audit logging infrastructure
 *
 * This interface defines how the application records audit trails
 * for compliance and security monitoring.
 *
 * @example
 * ```typescript
 * // PostgreSQL Adapter implementing this port
 * class PostgresAuditService implements AuditService {
 *   async record(entry: AuditEntry): Promise<void> {
 *     await this.pool.query(
 *       `INSERT INTO audit_log (id, timestamp, correlation_id, ...) VALUES ($1, $2, ...)`,
 *       [entry.auditId, entry.timestamp, entry.correlationId, ...]
 *     );
 *   }
 * }
 * ```
 */
export interface AuditService {
  /**
   * Record an audit entry
   *
   * This operation MUST be durable and cannot fail silently.
   * If recording fails, the original operation should also fail.
   *
   * @param entry - The audit entry to record
   * @throws AuditRecordError if recording fails
   */
  record(entry: AuditEntry): Promise<void>;

  /**
   * Record multiple audit entries atomically
   *
   * @param entries - Array of audit entries
   * @throws AuditRecordError if recording fails
   */
  recordBatch(entries: AuditEntry[]): Promise<void>;

  /**
   * Query audit entries
   *
   * For compliance reporting and security investigations.
   *
   * @param criteria - Query criteria
   * @returns Matching audit entries
   */
  query(criteria: AuditQueryCriteria): Promise<AuditEntry[]>;

  /**
   * Count audit entries matching criteria
   *
   * @param criteria - Query criteria
   * @returns Count of matching entries
   */
  count(criteria: AuditQueryCriteria): Promise<number>;

  /**
   * Export audit entries for compliance reporting
   *
   * @param criteria - Query criteria
   * @param format - Export format
   * @returns Export data
   */
  export(criteria: AuditQueryCriteria, format: 'json' | 'csv' | 'pdf'): Promise<AuditExportResult>;

  /**
   * Get audit summary for a resource
   *
   * @param resourceType - Type of resource
   * @param resourceId - Resource identifier
   * @returns Summary of audit activity
   */
  getSummary(resourceType: string, resourceId: string): Promise<AuditSummary>;
}

/**
 * Audit Entry Structure
 *
 * Comprehensive audit record following healthcare compliance standards.
 * All fields are required except those marked optional.
 */
export interface AuditEntry {
  /** Unique audit entry ID (UUID) */
  auditId: string;

  /** Timestamp of the audited action */
  timestamp: Date;

  /** Correlation ID for request tracing */
  correlationId: string;

  /** ID of the principal performing the action */
  principalId: string;

  /** Type of principal (USER, SERVICE, SYSTEM) */
  principalType: string;

  /** Roles of the principal at time of action */
  principalRoles?: string[];

  /** Action performed (CREATE, READ, UPDATE, DELETE, etc.) */
  action: AuditAction;

  /** Type of resource being accessed */
  resourceType: string;

  /** ID of the resource being accessed */
  resourceId: string;

  /** Organization ID for multi-tenancy */
  organizationId?: string;

  /** Result of the action */
  result: 'SUCCESS' | 'FAILURE' | 'DENIED';

  /** Error code if result is FAILURE */
  errorCode?: string;

  /** IP address of the client */
  ipAddress?: string;

  /** User agent string */
  userAgent?: string;

  /** Geographic location (derived from IP) */
  geoLocation?: {
    country?: string;
    region?: string;
    city?: string;
  };

  /** Whether MFA was verified for this action */
  mfaVerified?: boolean;

  /** Session ID */
  sessionId?: string;

  /** Additional action-specific details */
  details?: Record<string, unknown>;

  /** Before state for UPDATE/DELETE actions */
  beforeState?: Record<string, unknown>;

  /** After state for CREATE/UPDATE actions */
  afterState?: Record<string, unknown>;

  /** Fields that were accessed (for PHI tracking) */
  accessedFields?: string[];

  /** Risk score for the action (0-100) */
  riskScore?: number;

  /** Whether this access involved PHI */
  involvesPhi?: boolean;

  /** Data classification level */
  dataClassification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
}

/**
 * Audit action types
 */
export type AuditAction =
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'SEARCH'
  | 'EXPORT'
  | 'IMPORT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGE'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'PERMISSION_GRANT'
  | 'PERMISSION_REVOKE'
  | 'CONSENT_GRANT'
  | 'CONSENT_REVOKE'
  | 'DATA_ACCESS'
  | 'PHI_ACCESS'
  | 'VERIFICATION'
  | 'SCORE_CALCULATION'
  | 'REPORT_GENERATION'
  | 'BULK_OPERATION';

/**
 * Query criteria for audit entries
 */
export interface AuditQueryCriteria {
  /** Filter by principal ID */
  principalId?: string;

  /** Filter by principal type */
  principalType?: string;

  /** Filter by resource type */
  resourceType?: string;

  /** Filter by resource ID */
  resourceId?: string;

  /** Filter by organization */
  organizationId?: string;

  /** Filter by action type */
  action?: AuditAction | AuditAction[];

  /** Filter by result */
  result?: 'SUCCESS' | 'FAILURE' | 'DENIED';

  /** Filter by date range start */
  fromDate?: Date;

  /** Filter by date range end */
  toDate?: Date;

  /** Filter by IP address (supports CIDR notation) */
  ipAddress?: string;

  /** Filter entries involving PHI */
  involvesPhi?: boolean;

  /** Filter by risk score threshold */
  minRiskScore?: number;

  /** Page size */
  limit?: number;

  /** Page offset */
  offset?: number;

  /** Sort field */
  orderBy?: 'timestamp' | 'riskScore' | 'action';

  /** Sort direction */
  orderDirection?: 'asc' | 'desc';
}

/**
 * Audit export result
 */
export interface AuditExportResult {
  /** Export data (format depends on requested format) */
  data: string | Buffer;

  /** MIME type of the export */
  mimeType: string;

  /** Filename suggestion */
  filename: string;

  /** Number of entries exported */
  entryCount: number;

  /** Export generation timestamp */
  generatedAt: Date;

  /** Hash of the export for integrity verification */
  integrityHash: string;
}

/**
 * Audit summary for a resource
 */
export interface AuditSummary {
  /** Resource type */
  resourceType: string;

  /** Resource ID */
  resourceId: string;

  /** Total number of audit entries */
  totalEntries: number;

  /** Breakdown by action type */
  actionCounts: Record<AuditAction, number>;

  /** Breakdown by result */
  resultCounts: {
    success: number;
    failure: number;
    denied: number;
  };

  /** First access timestamp */
  firstAccess: Date;

  /** Last access timestamp */
  lastAccess: Date;

  /** Unique principals who accessed */
  uniquePrincipals: number;

  /** Whether any PHI access occurred */
  hadPhiAccess: boolean;

  /** Highest risk score recorded */
  maxRiskScore: number;
}

/**
 * Factory function for creating audit entries
 */
export function createAuditEntry(
  principalId: string,
  principalType: string,
  action: AuditAction,
  resourceType: string,
  resourceId: string,
  correlationId: string,
  result: 'SUCCESS' | 'FAILURE' | 'DENIED',
  options?: Partial<AuditEntry>
): AuditEntry {
  return {
    auditId: crypto.randomUUID(),
    timestamp: new Date(),
    correlationId,
    principalId,
    principalType,
    action,
    resourceType,
    resourceId,
    result,
    ...options,
  };
}
