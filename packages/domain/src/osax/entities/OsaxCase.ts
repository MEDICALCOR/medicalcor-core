/**
 * @fileoverview OsaxCase Aggregate Root
 *
 * Banking/Medical Grade DDD Aggregate Root for OSAX (Obstructive Sleep Apnea) cases.
 * Represents a complete clinical case including study data, scoring, and treatment tracking.
 *
 * @module domain/osax/entities/osax-case
 *
 * DESIGN PRINCIPLES:
 * 1. AGGREGATE ROOT - All modifications go through this entity
 * 2. INVARIANT PROTECTION - Business rules enforced at all times
 * 3. EVENT SOURCING READY - All state changes emit domain events
 * 4. GDPR COMPLIANT - Sensitive data handling built-in
 *
 * CLINICAL CONTEXT:
 * An OSAX case represents a patient's complete sleep apnea assessment,
 * including polysomnography data, clinical scoring, treatment recommendations,
 * and follow-up tracking.
 */

import type {
  OsaxClinicalScore,
  OsaxClinicalIndicators,
  OsaxSeverity,
  OsaxTreatmentRecommendation,
} from '../value-objects/OsaxClinicalScore.js';
import type { OsaxSubjectId } from '../value-objects/OsaxSubjectId.js';

// ============================================================================
// CASE STATUS & LIFECYCLE
// ============================================================================

/**
 * OSAX case lifecycle status
 */
export type OsaxCaseStatus =
  | 'PENDING_STUDY' // Awaiting sleep study
  | 'STUDY_COMPLETED' // Study done, awaiting scoring
  | 'SCORED' // Clinical score calculated
  | 'REVIEWED' // Physician reviewed
  | 'TREATMENT_PLANNED' // Treatment plan created
  | 'IN_TREATMENT' // Active treatment
  | 'FOLLOW_UP' // In follow-up phase
  | 'CLOSED' // Case closed
  | 'CANCELLED'; // Cancelled

/**
 * Study type
 */
export type OsaxStudyType =
  | 'PSG' // Polysomnography (in-lab)
  | 'HST' // Home Sleep Test
  | 'SPLIT_NIGHT' // Split night study
  | 'TITRATION' // CPAP/BiPAP titration
  | 'MSLT' // Multiple Sleep Latency Test
  | 'MWT'; // Maintenance of Wakefulness Test

/**
 * Treatment status
 */
export type OsaxTreatmentStatus =
  | 'NOT_STARTED'
  | 'INITIATED'
  | 'ADJUSTING'
  | 'STABLE'
  | 'NON_COMPLIANT'
  | 'DISCONTINUED';

/**
 * Study metadata
 */
export interface OsaxStudyMetadata {
  /** Study type performed */
  readonly studyType: OsaxStudyType;

  /** Date study was performed */
  readonly studyDate: Date;

  /** Study duration in hours */
  readonly durationHours: number;

  /** Study location/facility */
  readonly facility?: string;

  /** Technician who performed the study */
  readonly technician?: string;

  /** Equipment used */
  readonly equipment?: string;

  /** Study quality score (0-100) */
  readonly qualityScore?: number;

  /** Notes from the study */
  readonly notes?: string;
}

/**
 * Treatment record
 */
export interface OsaxTreatmentRecord {
  /** Treatment type */
  readonly type: OsaxTreatmentRecommendation;

  /** Treatment start date */
  readonly startDate: Date;

  /** Treatment end date (if ended) */
  readonly endDate?: Date;

  /** Treatment status */
  readonly status: OsaxTreatmentStatus;

  /** Device/equipment details if applicable */
  readonly deviceInfo?: {
    readonly manufacturer?: string;
    readonly model?: string;
    readonly settings?: Record<string, unknown>;
  };

  /** Compliance data */
  readonly compliance?: {
    readonly averageUsageHours?: number;
    readonly daysWithUsage?: number;
    readonly totalDays?: number;
    readonly compliancePercentage?: number;
  };

  /** Treatment notes */
  readonly notes?: string;
}

/**
 * Follow-up record
 */
export interface OsaxFollowUpRecord {
  /** Follow-up ID */
  readonly id: string;

  /** Scheduled date */
  readonly scheduledDate: Date;

  /** Actual date (if completed) */
  readonly completedDate?: Date;

  /** Follow-up type */
  readonly type: 'PHONE' | 'VIDEO' | 'IN_PERSON' | 'DEVICE_DATA_REVIEW';

  /** Status */
  readonly status: 'SCHEDULED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';

  /** Clinical notes */
  readonly notes?: string;

  /** Updated indicators if reassessed */
  readonly updatedIndicators?: Partial<OsaxClinicalIndicators>;
}

/**
 * Physician review record
 */
export interface OsaxPhysicianReview {
  /** Review date */
  readonly reviewDate: Date;

  /** Reviewing physician ID */
  readonly physicianId: string;

  /** Physician name */
  readonly physicianName?: string;

  /** Review decision */
  readonly decision: 'APPROVE' | 'MODIFY' | 'REQUEST_RESTUDY' | 'REFER';

  /** Modified recommendations if any */
  readonly modifiedRecommendation?: OsaxTreatmentRecommendation;

  /** Clinical notes */
  readonly notes?: string;

  /** Referral details if referred */
  readonly referralInfo?: {
    readonly specialty?: string;
    readonly reason?: string;
  };
}

// ============================================================================
// OSAX CASE AGGREGATE ROOT
// ============================================================================

/**
 * OsaxCase Aggregate Root
 *
 * Represents a complete OSAX clinical case. All modifications to the case
 * must go through this aggregate root to ensure business invariants.
 *
 * @example
 * ```typescript
 * // Create new case
 * const osaxCase = OsaxCase.create({
 *   subjectId: OsaxSubjectId.generate(1, 2025),
 *   patientId: 'patient-uuid',
 *   referringPhysicianId: 'doctor-uuid',
 * });
 *
 * // Record study completion
 * osaxCase.recordStudyCompletion({
 *   studyType: 'PSG',
 *   studyDate: new Date(),
 *   durationHours: 8,
 * });
 *
 * // Record clinical score
 * osaxCase.recordClinicalScore(clinicalScore);
 *
 * // Check treatment eligibility
 * if (osaxCase.requiresTreatment()) {
 *   osaxCase.initiateTreatment('CPAP_THERAPY');
 * }
 * ```
 */
export interface OsaxCase {
  // ============================================================================
  // IDENTITY
  // ============================================================================

  /** Unique case identifier (UUID) */
  readonly id: string;

  /** Pseudonymized subject identifier */
  readonly subjectId: OsaxSubjectId;

  /** Internal patient identifier (for linking to patient record) */
  readonly patientId: string;

  /** Case reference number (human-readable) */
  readonly caseNumber: string;

  // ============================================================================
  // CASE METADATA
  // ============================================================================

  /** Current case status */
  readonly status: OsaxCaseStatus;

  /** Case creation date */
  readonly createdAt: Date;

  /** Last update date */
  readonly updatedAt: Date;

  /** Referring physician ID */
  readonly referringPhysicianId?: string;

  /** Assigned sleep specialist ID */
  readonly assignedSpecialistId?: string;

  /** Case priority */
  readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  /** Case tags for categorization */
  readonly tags: readonly string[];

  // ============================================================================
  // STUDY DATA
  // ============================================================================

  /** Study metadata (if study completed) */
  readonly studyMetadata?: OsaxStudyMetadata;

  /** Raw study data reference (path/ID to full data) */
  readonly studyDataRef?: string;

  // ============================================================================
  // CLINICAL SCORING
  // ============================================================================

  /** Clinical score (if scored) */
  readonly clinicalScore?: OsaxClinicalScore;

  /** Score history */
  readonly scoreHistory: readonly {
    readonly score: OsaxClinicalScore;
    readonly scoredAt: Date;
    readonly scoredBy: 'SYSTEM' | 'PHYSICIAN';
    readonly notes?: string;
  }[];

  // ============================================================================
  // PHYSICIAN REVIEW
  // ============================================================================

  /** Physician review records */
  readonly physicianReviews: readonly OsaxPhysicianReview[];

  /** Current review status */
  readonly reviewStatus: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_MODIFICATION';

  // ============================================================================
  // TREATMENT TRACKING
  // ============================================================================

  /** Active treatment record */
  readonly activeTreatment?: OsaxTreatmentRecord;

  /** Treatment history */
  readonly treatmentHistory: readonly OsaxTreatmentRecord[];

  /** Treatment adherence score (0-100) */
  readonly treatmentAdherenceScore?: number;

  // ============================================================================
  // FOLLOW-UP
  // ============================================================================

  /** Scheduled and completed follow-ups */
  readonly followUps: readonly OsaxFollowUpRecord[];

  /** Next scheduled follow-up date */
  readonly nextFollowUpDate?: Date;

  // ============================================================================
  // AUDIT & COMPLIANCE
  // ============================================================================

  /** Version for optimistic locking */
  readonly version: number;

  /** Consent status */
  readonly consentStatus: 'PENDING' | 'OBTAINED' | 'WITHDRAWN';

  /** Data retention policy applied */
  readonly retentionPolicy?: string;

  /** Soft delete flag */
  readonly isDeleted: boolean;

  /** Deletion timestamp if deleted */
  readonly deletedAt?: Date;
}

// ============================================================================
// CASE CREATION INPUT
// ============================================================================

/**
 * Input for creating a new OSAX case
 */
export interface CreateOsaxCaseInput {
  /** Subject identifier */
  subjectId: OsaxSubjectId;

  /** Patient identifier */
  patientId: string;

  /** Referring physician ID */
  referringPhysicianId?: string;

  /** Assigned sleep specialist ID */
  assignedSpecialistId?: string;

  /** Initial priority */
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  /** Initial tags */
  tags?: string[];
}

/**
 * Input for updating an OSAX case
 */
export interface UpdateOsaxCaseInput {
  /** Update status */
  status?: OsaxCaseStatus;

  /** Update priority */
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  /** Update assigned specialist */
  assignedSpecialistId?: string;

  /** Update tags */
  tags?: string[];

  /** Update consent status */
  consentStatus?: 'PENDING' | 'OBTAINED' | 'WITHDRAWN';
}

// ============================================================================
// CASE FACTORY & HELPERS
// ============================================================================

/**
 * Generate a case number
 */
export function generateCaseNumber(year: number, sequence: number): string {
  const paddedSeq = sequence.toString().padStart(5, '0');
  return `OSA-${year}-${paddedSeq}`;
}

/**
 * Generate a UUID v4
 *
 * Uses crypto.randomUUID when available (Node.js 19+, modern browsers),
 * with a fallback for older environments.
 */
function generateUUID(): string {
  // Modern environments have crypto.randomUUID
  const cryptoObj = globalThis.crypto;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- fallback for older environments
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  // Fallback for older Node.js versions
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a new OSAX case
 */
export function createOsaxCase(input: CreateOsaxCaseInput, sequenceNumber: number): OsaxCase {
  const now = new Date();
  const year = now.getFullYear();

  // Build case with optional properties using spread operator (immutable pattern)
  // This avoids type assertions and mutation after object creation
  return {
    id: generateUUID(),
    subjectId: input.subjectId,
    patientId: input.patientId,
    caseNumber: generateCaseNumber(year, sequenceNumber),
    status: 'PENDING_STUDY',
    createdAt: now,
    updatedAt: now,
    priority: input.priority ?? 'NORMAL',
    tags: Object.freeze(input.tags ?? []),
    scoreHistory: Object.freeze([]),
    physicianReviews: Object.freeze([]),
    reviewStatus: 'PENDING',
    treatmentHistory: Object.freeze([]),
    followUps: Object.freeze([]),
    version: 1,
    consentStatus: 'PENDING',
    isDeleted: false,
    // Conditionally include optional properties (only if defined)
    ...(input.referringPhysicianId !== undefined && {
      referringPhysicianId: input.referringPhysicianId,
    }),
    ...(input.assignedSpecialistId !== undefined && {
      assignedSpecialistId: input.assignedSpecialistId,
    }),
  };
}

// ============================================================================
// CASE STATE MACHINE HELPERS
// ============================================================================

/**
 * Valid status transitions
 */
const VALID_STATUS_TRANSITIONS: Record<OsaxCaseStatus, readonly OsaxCaseStatus[]> = {
  PENDING_STUDY: ['STUDY_COMPLETED', 'CANCELLED'],
  STUDY_COMPLETED: ['SCORED', 'CANCELLED'],
  SCORED: ['REVIEWED', 'CANCELLED'],
  REVIEWED: ['TREATMENT_PLANNED', 'FOLLOW_UP', 'CLOSED', 'CANCELLED'],
  TREATMENT_PLANNED: ['IN_TREATMENT', 'CANCELLED'],
  IN_TREATMENT: ['FOLLOW_UP', 'CLOSED', 'CANCELLED'],
  FOLLOW_UP: ['IN_TREATMENT', 'CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  currentStatus: OsaxCaseStatus,
  newStatus: OsaxCaseStatus
): boolean {
  const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
  return validTransitions.includes(newStatus);
}

/**
 * Get allowed next statuses
 */
export function getAllowedNextStatuses(currentStatus: OsaxCaseStatus): readonly OsaxCaseStatus[] {
  return VALID_STATUS_TRANSITIONS[currentStatus];
}

// ============================================================================
// CASE QUERY HELPERS
// ============================================================================

/**
 * Check if case requires immediate attention
 */
export function requiresImmediateAttention(osaxCase: OsaxCase): boolean {
  // Urgent priority
  if (osaxCase.priority === 'URGENT') return true;

  // Severe score requiring immediate intervention
  if (osaxCase.clinicalScore?.requiresUrgentIntervention()) return true;

  // Overdue for review
  if (
    osaxCase.status === 'SCORED' &&
    osaxCase.reviewStatus === 'PENDING' &&
    osaxCase.clinicalScore
  ) {
    const scoredAt = osaxCase.scoreHistory[osaxCase.scoreHistory.length - 1]?.scoredAt;
    if (scoredAt) {
      const hoursSinceScored = (Date.now() - scoredAt.getTime()) / (1000 * 60 * 60);
      const slaHours = osaxCase.clinicalScore.getClinicalReviewSLAHours();
      if (hoursSinceScored > slaHours) return true;
    }
  }

  return false;
}

/**
 * Check if case is active (not closed/cancelled)
 */
export function isActiveCase(osaxCase: OsaxCase): boolean {
  return osaxCase.status !== 'CLOSED' && osaxCase.status !== 'CANCELLED' && !osaxCase.isDeleted;
}

/**
 * Check if case requires treatment
 */
export function requiresTreatment(osaxCase: OsaxCase): boolean {
  if (!osaxCase.clinicalScore) return false;
  return osaxCase.clinicalScore.hasOSA() && osaxCase.clinicalScore.severity !== 'NONE';
}

/**
 * Check if case is ready for treatment initiation
 */
export function isReadyForTreatment(osaxCase: OsaxCase): boolean {
  return (
    osaxCase.status === 'TREATMENT_PLANNED' &&
    osaxCase.reviewStatus === 'APPROVED' &&
    osaxCase.consentStatus === 'OBTAINED' &&
    !osaxCase.activeTreatment
  );
}

/**
 * Calculate overall case progress (0-100)
 */
export function calculateCaseProgress(osaxCase: OsaxCase): number {
  const statusProgress: Record<OsaxCaseStatus, number> = {
    PENDING_STUDY: 10,
    STUDY_COMPLETED: 25,
    SCORED: 40,
    REVIEWED: 55,
    TREATMENT_PLANNED: 70,
    IN_TREATMENT: 85,
    FOLLOW_UP: 90,
    CLOSED: 100,
    CANCELLED: 0,
  };

  return statusProgress[osaxCase.status];
}

/**
 * Get case severity summary
 */
export function getCaseSeveritySummary(osaxCase: OsaxCase): {
  severity: OsaxSeverity | 'UNKNOWN';
  ahi: number | null;
  requiresImmediate: boolean;
} {
  if (!osaxCase.clinicalScore) {
    return {
      severity: 'UNKNOWN',
      ahi: null,
      requiresImmediate: osaxCase.priority === 'URGENT',
    };
  }

  return {
    severity: osaxCase.clinicalScore.severity,
    ahi: osaxCase.clinicalScore.indicators.ahi,
    requiresImmediate: osaxCase.clinicalScore.requiresUrgentIntervention(),
  };
}
