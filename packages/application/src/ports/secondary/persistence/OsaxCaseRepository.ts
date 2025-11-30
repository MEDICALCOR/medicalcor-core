/**
 * @fileoverview Secondary Port - OsaxCaseRepository
 *
 * Defines what the application needs from infrastructure (driven side).
 * This is a hexagonal architecture SECONDARY PORT - the interface through which
 * the application accesses persistence infrastructure.
 *
 * @module application/ports/secondary/persistence/OsaxCaseRepository
 *
 * HEXAGONAL ARCHITECTURE PRINCIPLE:
 * Secondary ports represent the application's INFRASTRUCTURE DEPENDENCIES.
 * Infrastructure adapters (PostgreSQL, Supabase, MongoDB) implement these ports.
 */

import type { OsaxCaseStatus } from '@medicalcor/domain/osax';

/**
 * Correlation ID for distributed tracing
 */
export interface CorrelationId {
  getValue(): string;
}

/**
 * SECONDARY PORT: What the application needs from persistence infrastructure
 *
 * This interface defines the complete set of persistence operations required
 * for OSAX case management. Infrastructure adapters (PostgreSQL, Supabase)
 * implement this interface.
 *
 * @example
 * ```typescript
 * // PostgreSQL Adapter implementing this port
 * class PostgresOsaxCaseRepository implements OsaxCaseRepository {
 *   constructor(private pool: Pool) {}
 *
 *   async findById(id: string): Promise<OsaxCaseEntity | null> {
 *     const result = await this.pool.query(
 *       'SELECT * FROM osax_cases WHERE id = $1 AND deleted_at IS NULL',
 *       [id]
 *     );
 *     return result.rows[0] ? this.toDomain(result.rows[0]) : null;
 *   }
 * }
 * ```
 */
export interface OsaxCaseRepository {
  /**
   * Find a case by its unique identifier
   *
   * @param id - Case UUID
   * @param correlationId - Optional correlation ID for tracing
   * @returns The case entity or null if not found
   */
  findById(id: string, correlationId?: CorrelationId): Promise<OsaxCaseEntity | null>;

  /**
   * Find cases by subject identifier
   *
   * @param subjectId - Pseudonymized subject ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns Array of matching cases
   */
  findBySubjectId(subjectId: string, correlationId?: CorrelationId): Promise<OsaxCaseEntity[]>;

  /**
   * Find cases by status with optional limit
   *
   * @param status - Case status to filter by
   * @param limit - Maximum number of results
   * @param correlationId - Optional correlation ID for tracing
   * @returns Array of matching cases
   */
  findByStatus(
    status: OsaxCaseStatus,
    limit?: number,
    correlationId?: CorrelationId
  ): Promise<OsaxCaseEntity[]>;

  /**
   * Save (create or update) a case
   *
   * Implements optimistic locking via version field.
   *
   * @param entity - The case entity to save
   * @param correlationId - Optional correlation ID for tracing
   * @throws OptimisticLockError if version mismatch
   */
  save(entity: OsaxCaseEntity, correlationId?: CorrelationId): Promise<void>;

  /**
   * Soft delete a case
   *
   * @param id - Case UUID
   * @param expectedVersion - Expected version for optimistic locking
   * @param correlationId - Optional correlation ID for tracing
   * @throws OptimisticLockError if version mismatch
   * @throws NotFoundError if case doesn't exist
   */
  delete(id: string, expectedVersion?: number, correlationId?: CorrelationId): Promise<void>;

  /**
   * Count cases matching criteria
   *
   * @param criteria - Filter criteria
   * @returns Count of matching cases
   */
  count(criteria: CountCriteria): Promise<number>;

  /**
   * Search cases with complex criteria
   *
   * @param criteria - Search criteria including filters, sorting, pagination
   * @param correlationId - Optional correlation ID for tracing
   * @returns Array of matching cases
   */
  search(criteria: SearchCriteria, correlationId?: CorrelationId): Promise<OsaxCaseEntity[]>;

  /**
   * Check if a case exists
   *
   * @param id - Case UUID
   * @returns True if case exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Get next sequence number for case numbering
   *
   * @param year - Year for the sequence
   * @returns Next available sequence number
   */
  getNextSequenceNumber(year: number): Promise<number>;
}

/**
 * OSAX Case Entity
 *
 * Persistence-focused representation of an OSAX case.
 * Maps directly to database schema.
 */
export interface OsaxCaseEntity {
  /** Unique case ID (UUID) */
  id: string;

  /** Human-readable case number */
  caseNumber: string;

  /** Pseudonymized subject identifier */
  subjectId: string;

  /** Subject type */
  subjectType: 'lead' | 'patient';

  /** Internal patient ID for linking */
  patientId?: string;

  /** Current case status */
  status: OsaxCaseStatus;

  /** Priority level */
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  /** Tags for categorization */
  tags: string[];

  /** Clinical notes */
  notes?: string;

  /** Clinical score data (JSON) */
  clinicalScore?: OsaxClinicalScoreData;

  /** Score history */
  scoreHistory: OsaxScoreHistoryEntry[];

  /** Physician reviews */
  physicianReviews: OsaxPhysicianReviewData[];

  /** Review status */
  reviewStatus: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_MODIFICATION';

  /** Referring physician ID */
  referringPhysicianId?: string;

  /** Assigned specialist ID */
  assignedSpecialistId?: string;

  /** Study metadata */
  studyMetadata?: OsaxStudyMetadataData;

  /** Active treatment record */
  activeTreatment?: OsaxTreatmentRecordData;

  /** Treatment history */
  treatmentHistory: OsaxTreatmentRecordData[];

  /** Treatment adherence score */
  treatmentAdherenceScore?: number;

  /** Follow-up records */
  followUps: OsaxFollowUpRecordData[];

  /** Next follow-up date */
  nextFollowUpDate?: Date;

  /** Consent status */
  consentStatus: 'PENDING' | 'OBTAINED' | 'WITHDRAWN';

  /** Data retention policy */
  retentionPolicy?: string;

  /** Version for optimistic locking */
  version: number;

  /** Soft delete flag */
  isDeleted: boolean;

  /** Deletion timestamp */
  deletedAt?: Date;

  /** Organization ID for multi-tenancy */
  organizationId?: string;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Clinical score data structure for persistence
 */
export interface OsaxClinicalScoreData {
  boneQuality: 'low' | 'medium' | 'high';
  softTissueStatus: 'compromised' | 'acceptable' | 'ideal';
  systemicRisk: 'low' | 'medium' | 'high';
  urgency: 'low' | 'medium' | 'high';
  financialFlexibility: 'low' | 'medium' | 'high';
  globalScore: number;
  riskClass: 'GREEN' | 'YELLOW' | 'RED';
  scoredAt: Date;
  scoredBy: string;
}

/**
 * Score history entry for persistence
 */
export interface OsaxScoreHistoryEntry {
  score: OsaxClinicalScoreData;
  scoredAt: Date;
  scoredBy: 'SYSTEM' | 'PHYSICIAN';
  notes?: string;
}

/**
 * Physician review data for persistence
 */
export interface OsaxPhysicianReviewData {
  reviewDate: Date;
  physicianId: string;
  physicianName?: string;
  decision: 'APPROVE' | 'MODIFY' | 'REQUEST_RESTUDY' | 'REFER';
  modifiedRecommendation?: string;
  notes?: string;
  referralInfo?: {
    specialty?: string;
    reason?: string;
  };
}

/**
 * Study metadata for persistence
 */
export interface OsaxStudyMetadataData {
  studyType: string;
  studyDate: Date;
  durationHours: number;
  facility?: string;
  technician?: string;
  equipment?: string;
  qualityScore?: number;
  notes?: string;
}

/**
 * Treatment record data for persistence
 */
export interface OsaxTreatmentRecordData {
  type: string;
  startDate: Date;
  endDate?: Date;
  status: string;
  deviceInfo?: {
    manufacturer?: string;
    model?: string;
    settings?: Record<string, unknown>;
  };
  compliance?: {
    averageUsageHours?: number;
    daysWithUsage?: number;
    totalDays?: number;
    compliancePercentage?: number;
  };
  notes?: string;
}

/**
 * Follow-up record data for persistence
 */
export interface OsaxFollowUpRecordData {
  id: string;
  scheduledDate: Date;
  completedDate?: Date;
  type: 'PHONE' | 'VIDEO' | 'IN_PERSON' | 'DEVICE_DATA_REVIEW';
  status: 'SCHEDULED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
  notes?: string;
}

/**
 * Count criteria for repository
 */
export interface CountCriteria {
  /** Filter by status */
  status?: OsaxCaseStatus;
  /** Filter by risk class */
  riskClass?: 'GREEN' | 'YELLOW' | 'RED';
  /** Filter by date range start */
  fromDate?: Date;
  /** Filter by date range end */
  toDate?: Date;
  /** Filter by organization */
  organizationId?: string;
}

/**
 * Search criteria for repository
 */
export interface SearchCriteria {
  /** Filter by status */
  status?: OsaxCaseStatus;
  /** Filter by risk class */
  riskClass?: 'GREEN' | 'YELLOW' | 'RED';
  /** Filter by priority */
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  /** Filter by date range start */
  fromDate?: Date;
  /** Filter by date range end */
  toDate?: Date;
  /** Filter by tags */
  tags?: string[];
  /** Filter by organization */
  organizationId?: string;
  /** Page size */
  limit?: number;
  /** Page offset */
  offset?: number;
  /** Sort field */
  orderBy?: 'createdAt' | 'updatedAt' | 'globalScore' | 'priority';
  /** Sort direction */
  orderDirection?: 'asc' | 'desc';
}
