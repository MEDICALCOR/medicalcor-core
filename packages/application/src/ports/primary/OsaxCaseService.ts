/**
 * @fileoverview Primary Port - OsaxCaseService
 *
 * Defines what the application offers to the outside world (driving side).
 * This is the hexagonal architecture PRIMARY PORT - the interface through which
 * external actors (web, CLI, API) interact with the application.
 *
 * @module application/ports/primary/OsaxCaseService
 *
 * HEXAGONAL ARCHITECTURE PRINCIPLE:
 * Primary ports represent the application's USE CASE interfaces.
 * Adapters (REST controllers, GraphQL resolvers, CLI handlers) call these ports.
 */

import type { Result } from '../../shared/Result.js';
import type { SecurityContext } from '../../security/SecurityContext.js';

/**
 * PRIMARY PORT: What the application offers to the outside world
 *
 * This interface defines the complete set of operations available
 * for OSAX case management. All external access to case functionality
 * must go through this port.
 *
 * @example
 * ```typescript
 * // REST Controller (Adapter) using this port
 * class OsaxCaseController {
 *   constructor(private service: OsaxCaseService) {}
 *
 *   async createCase(req: Request, res: Response) {
 *     const context = SecurityContext.fromRequest(req);
 *     const result = await this.service.createCase(req.body, context);
 *     if (isErr(result)) {
 *       return res.status(400).json({ error: result.error });
 *     }
 *     return res.status(201).json(result.value);
 *   }
 * }
 * ```
 */
export interface OsaxCaseService {
  /**
   * Create a new OSAX case
   *
   * Business Rules:
   * - Requires OSAX_CASE_CREATE permission
   * - Subject must not have an existing active case
   * - Subject ID must be valid (lead or patient)
   */
  createCase(
    request: CreateCaseRequest,
    context: SecurityContext
  ): Promise<Result<CreateCaseResponse>>;

  /**
   * Score an OSAX case
   *
   * Business Rules:
   * - Requires OSAX_CASE_SCORE permission
   * - Case must exist and not be closed
   * - All clinical indicators must be provided
   */
  scoreCase(
    request: ScoreCaseRequest,
    context: SecurityContext
  ): Promise<Result<ScoreCaseResponse>>;

  /**
   * Verify an OSAX case (physician review)
   *
   * Business Rules:
   * - Requires OSAX_CASE_VERIFY permission
   * - Case must be in SCORED status
   * - Verifier must be a qualified physician
   */
  verifyCase(
    request: VerifyCaseRequest,
    context: SecurityContext
  ): Promise<Result<VerifyCaseResponse>>;

  /**
   * Get a single OSAX case by ID
   *
   * Business Rules:
   * - Requires OSAX_CASE_READ permission
   * - Respects data residency policies
   */
  getCase(
    caseId: string,
    context: SecurityContext
  ): Promise<Result<OsaxCaseDto>>;

  /**
   * Search OSAX cases with filters
   *
   * Business Rules:
   * - Requires OSAX_CASE_READ permission
   * - Results filtered by organization (multi-tenancy)
   * - Pagination enforced
   */
  searchCases(
    request: SearchCasesRequest,
    context: SecurityContext
  ): Promise<Result<SearchCasesResponse>>;

  /**
   * Delete an OSAX case (soft delete)
   *
   * Business Rules:
   * - Requires OSAX_CASE_DELETE permission
   * - Requires MFA verification
   * - Only allowed during business hours
   * - Creates audit trail
   */
  deleteCase(
    caseId: string,
    context: SecurityContext
  ): Promise<Result<void>>;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new OSAX case
 */
export interface CreateCaseRequest {
  /** Subject identifier (lead or patient ID) */
  subjectId: string;
  /** Type of subject */
  subjectType: 'lead' | 'patient';
  /** Optional clinical notes */
  notes?: string;
  /** Priority level */
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  /** Initial tags */
  tags?: string[];
}

/**
 * Response from case creation
 */
export interface CreateCaseResponse {
  /** Generated case ID */
  caseId: string;
  /** Human-readable case number */
  caseNumber: string;
  /** Initial status */
  status: string;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Request to score an OSAX case
 */
export interface ScoreCaseRequest {
  /** Case ID to score */
  caseId: string;
  /** Bone quality assessment */
  boneQuality: 'low' | 'medium' | 'high';
  /** Soft tissue status */
  softTissueStatus: 'compromised' | 'acceptable' | 'ideal';
  /** Systemic risk level */
  systemicRisk: 'low' | 'medium' | 'high';
  /** Urgency level */
  urgency: 'low' | 'medium' | 'high';
  /** Financial flexibility */
  financialFlexibility: 'low' | 'medium' | 'high';
  /** Optional scoring notes */
  notes?: string;
}

/**
 * Response from case scoring
 */
export interface ScoreCaseResponse {
  /** Case ID */
  caseId: string;
  /** Calculated global score (0-100) */
  globalScore: number;
  /** Risk classification */
  riskClass: 'GREEN' | 'YELLOW' | 'RED';
  /** Updated case status */
  newStatus: string;
  /** Score breakdown */
  breakdown: {
    boneQualityScore: number;
    softTissueScore: number;
    systemicRiskScore: number;
    urgencyScore: number;
    financialScore: number;
  };
  /** Recommended next actions */
  recommendations: string[];
}

/**
 * Request to verify a case
 */
export interface VerifyCaseRequest {
  /** Case ID to verify */
  caseId: string;
  /** Verifier ID (physician) */
  verifiedBy: string;
  /** Verification decision */
  decision: 'APPROVE' | 'MODIFY' | 'REQUEST_RESTUDY' | 'REFER';
  /** Verification notes */
  verificationNotes?: string;
  /** Modified recommendation if decision is MODIFY */
  modifiedRecommendation?: string;
}

/**
 * Response from case verification
 */
export interface VerifyCaseResponse {
  /** Case ID */
  caseId: string;
  /** Verification timestamp */
  verifiedAt: Date;
  /** Verifier ID */
  verifiedBy: string;
  /** Verification decision */
  decision: string;
  /** Updated case status */
  newStatus: string;
}

/**
 * Request to search cases
 */
export interface SearchCasesRequest {
  /** Filter by status */
  status?: string;
  /** Filter by risk class */
  riskClass?: 'GREEN' | 'YELLOW' | 'RED';
  /** Filter by date range start */
  fromDate?: Date;
  /** Filter by date range end */
  toDate?: Date;
  /** Filter by priority */
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  /** Filter by tags */
  tags?: string[];
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'globalScore' | 'priority';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Page size (max 100) */
  limit?: number;
  /** Page offset */
  offset?: number;
}

/**
 * Response from case search
 */
export interface SearchCasesResponse {
  /** Found cases */
  cases: OsaxCaseDto[];
  /** Total matching count */
  total: number;
  /** Whether more results exist */
  hasMore: boolean;
  /** Applied pagination */
  pagination: {
    limit: number;
    offset: number;
  };
}

/**
 * OSAX Case Data Transfer Object
 *
 * Used for transferring case data across boundaries.
 * Contains only serializable, non-sensitive data.
 */
export interface OsaxCaseDto {
  /** Unique case ID */
  id: string;
  /** Human-readable case number */
  caseNumber: string;
  /** Subject ID (pseudonymized) */
  subjectId: string;
  /** Subject type */
  subjectType: 'lead' | 'patient';
  /** Current status */
  status: string;
  /** Priority level */
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  /** Global score if calculated */
  globalScore?: number;
  /** Risk classification if scored */
  riskClass?: 'GREEN' | 'YELLOW' | 'RED';
  /** Clinical notes (may be redacted) */
  notes?: string;
  /** Tags */
  tags: string[];
  /** Verifier ID if verified */
  verifiedBy?: string;
  /** Verification timestamp */
  verifiedAt?: Date;
  /** Review status */
  reviewStatus: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_MODIFICATION';
  /** Consent status */
  consentStatus: 'PENDING' | 'OBTAINED' | 'WITHDRAWN';
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Entity version for optimistic locking */
  version: number;
}
