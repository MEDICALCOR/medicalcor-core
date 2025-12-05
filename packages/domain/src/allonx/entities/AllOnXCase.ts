/**
 * @fileoverview AllOnXCase Entity
 *
 * Entity representing an All-on-X dental implant case.
 * This is the aggregate root for the AllOnX bounded context.
 *
 * @module domain/allonx/entities/allonx-case
 *
 * DESIGN PRINCIPLES:
 * 1. AGGREGATE ROOT - All access to related entities through this entity
 * 2. INVARIANT PROTECTION - All state changes validate business rules
 * 3. RICH DOMAIN MODEL - Business logic encapsulated in entity methods
 * 4. EVENT SOURCING READY - All state changes can emit domain events
 */

import type {
  AllOnXClinicalScore,
  AllOnXEligibility,
  AllOnXRiskLevel,
  AllOnXComplexity,
  AllOnXTreatmentRecommendation,
  AllOnXProcedureType,
  AllOnXClinicalIndicators,
} from '../value-objects/AllOnXClinicalScore.js';

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * Case status lifecycle
 */
export type AllOnXCaseStatus =
  | 'INTAKE'
  | 'ASSESSMENT'
  | 'PLANNING'
  | 'PRE_TREATMENT'
  | 'SURGICAL_PHASE'
  | 'HEALING'
  | 'PROSTHETIC_PHASE'
  | 'COMPLETED'
  | 'FOLLOW_UP'
  | 'ON_HOLD'
  | 'CANCELLED';

/**
 * Treatment phase status
 */
export type TreatmentPhaseStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

/**
 * Imaging type
 */
export type ImagingType = 'PANORAMIC' | 'CBCT' | 'INTRAORAL' | 'PHOTOGRAPH';

/**
 * Case priority
 */
export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/**
 * Imaging record
 */
export interface ImagingRecord {
  readonly id: string;
  readonly type: ImagingType;
  readonly takenAt: Date;
  readonly storageUrl: string;
  readonly notes?: string;
  readonly findings?: string;
}

/**
 * Treatment phase record
 */
export interface TreatmentPhaseRecord {
  readonly phase: number;
  readonly name: string;
  readonly status: TreatmentPhaseStatus;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly procedures: readonly string[];
  readonly notes?: string;
  readonly complications?: string[];
}

/**
 * Consultation record
 */
export interface ConsultationRecord {
  readonly id: string;
  readonly consultedAt: Date;
  readonly consultantName: string;
  readonly consultantSpecialty: string;
  readonly findings: string;
  readonly recommendations: string;
  readonly clearanceGiven: boolean;
}

/**
 * Implant record
 */
export interface ImplantRecord {
  readonly id: string;
  readonly position: string; // e.g., "11", "14", "21", "24" for All-on-4
  readonly brand: string;
  readonly model: string;
  readonly diameter: number;
  readonly length: number;
  readonly placedAt: Date;
  readonly insertionTorque: number;
  readonly primaryStability: 'HIGH' | 'MODERATE' | 'LOW';
  readonly notes?: string;
}

/**
 * Follow-up record
 */
export interface FollowUpRecord {
  readonly id: string;
  readonly scheduledFor: Date;
  readonly completedAt?: Date;
  readonly type: 'ROUTINE' | 'HEALING_CHECK' | 'PROSTHETIC' | 'EMERGENCY';
  readonly findings?: string;
  readonly nextActions?: string[];
}

/**
 * Physician review record
 */
export interface PhysicianReviewRecord {
  readonly id: string;
  readonly reviewedAt: Date;
  readonly reviewedBy: string;
  readonly decision: 'APPROVED' | 'MODIFICATIONS_REQUIRED' | 'DEFERRED' | 'REJECTED';
  readonly comments?: string;
  readonly modifications?: string[];
}

/**
 * AllOnX Case entity
 */
export interface AllOnXCase {
  // Identity
  readonly id: string;
  readonly caseNumber: string;
  readonly patientId: string;

  // Status
  readonly status: AllOnXCaseStatus;
  readonly priority: CasePriority;

  // Clinical Assessment
  readonly clinicalScore: AllOnXClinicalScore | null;
  readonly indicators: AllOnXClinicalIndicators | null;

  // Treatment Planning
  readonly recommendedProcedure: AllOnXProcedureType | null;
  readonly targetArch: 'MAXILLA' | 'MANDIBLE' | 'BOTH' | null;
  readonly estimatedDuration: number | null; // months

  // Records
  readonly imagingRecords: readonly ImagingRecord[];
  readonly treatmentPhases: readonly TreatmentPhaseRecord[];
  readonly consultations: readonly ConsultationRecord[];
  readonly implants: readonly ImplantRecord[];
  readonly followUps: readonly FollowUpRecord[];
  readonly physicianReviews: readonly PhysicianReviewRecord[];

  // Assignment
  readonly assignedClinicianId: string | null;
  readonly assignedProsthodontistId: string | null;

  // Timestamps
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly assessmentCompletedAt: Date | null;
  readonly surgeryScheduledFor: Date | null;
  readonly surgeryCompletedAt: Date | null;
  readonly prosthesisDeliveredAt: Date | null;

  // Consent & Compliance
  readonly consentObtained: boolean;
  readonly consentObtainedAt: Date | null;
  readonly informedConsentDocumentId: string | null;

  // Notes
  readonly clinicalNotes: string | null;
  readonly internalNotes: string | null;
}

/**
 * Input for creating a new case
 */
export interface CreateAllOnXCaseInput {
  readonly patientId: string;
  readonly assignedClinicianId?: string;
  readonly targetArch?: 'MAXILLA' | 'MANDIBLE' | 'BOTH';
  readonly priority?: CasePriority;
  readonly clinicalNotes?: string;
}

/**
 * Input for updating a case
 */
export interface UpdateAllOnXCaseInput {
  readonly status?: AllOnXCaseStatus;
  readonly priority?: CasePriority;
  readonly assignedClinicianId?: string | null;
  readonly assignedProsthodontistId?: string | null;
  readonly targetArch?: 'MAXILLA' | 'MANDIBLE' | 'BOTH';
  readonly surgeryScheduledFor?: Date | null;
  readonly clinicalNotes?: string;
  readonly internalNotes?: string;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate a unique case number
 */
export function generateCaseNumber(prefix = 'AOX'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a new AllOnX case
 */
export function createAllOnXCase(input: CreateAllOnXCaseInput): AllOnXCase {
  const now = new Date();

  return Object.freeze({
    id: generateId(),
    caseNumber: generateCaseNumber(),
    patientId: input.patientId,

    status: 'INTAKE' as AllOnXCaseStatus,
    priority: input.priority ?? 'MEDIUM',

    clinicalScore: null,
    indicators: null,

    recommendedProcedure: null,
    targetArch: input.targetArch ?? null,
    estimatedDuration: null,

    imagingRecords: [],
    treatmentPhases: [],
    consultations: [],
    implants: [],
    followUps: [],
    physicianReviews: [],

    assignedClinicianId: input.assignedClinicianId ?? null,
    assignedProsthodontistId: null,

    createdAt: now,
    updatedAt: now,
    assessmentCompletedAt: null,
    surgeryScheduledFor: null,
    surgeryCompletedAt: null,
    prosthesisDeliveredAt: null,

    consentObtained: false,
    consentObtainedAt: null,
    informedConsentDocumentId: null,

    clinicalNotes: input.clinicalNotes ?? null,
    internalNotes: null,
  });
}

// ============================================================================
// STATE MACHINE
// ============================================================================

/**
 * Valid status transitions
 */
const STATUS_TRANSITIONS: Record<AllOnXCaseStatus, readonly AllOnXCaseStatus[]> = {
  INTAKE: ['ASSESSMENT', 'CANCELLED'],
  ASSESSMENT: ['PLANNING', 'INTAKE', 'ON_HOLD', 'CANCELLED'],
  PLANNING: ['PRE_TREATMENT', 'SURGICAL_PHASE', 'ASSESSMENT', 'ON_HOLD', 'CANCELLED'],
  PRE_TREATMENT: ['SURGICAL_PHASE', 'PLANNING', 'ON_HOLD', 'CANCELLED'],
  SURGICAL_PHASE: ['HEALING', 'PRE_TREATMENT', 'ON_HOLD', 'CANCELLED'],
  HEALING: ['PROSTHETIC_PHASE', 'SURGICAL_PHASE', 'ON_HOLD', 'CANCELLED'],
  PROSTHETIC_PHASE: ['COMPLETED', 'HEALING', 'ON_HOLD', 'CANCELLED'],
  COMPLETED: ['FOLLOW_UP'],
  FOLLOW_UP: ['COMPLETED', 'ON_HOLD'],
  ON_HOLD: [
    'INTAKE',
    'ASSESSMENT',
    'PLANNING',
    'PRE_TREATMENT',
    'SURGICAL_PHASE',
    'HEALING',
    'PROSTHETIC_PHASE',
    'CANCELLED',
  ],
  CANCELLED: [], // Terminal state
};

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  currentStatus: AllOnXCaseStatus,
  newStatus: AllOnXCaseStatus
): boolean {
  return STATUS_TRANSITIONS[currentStatus].includes(newStatus);
}

/**
 * Get allowed next statuses from current status
 */
export function getAllowedNextStatuses(
  currentStatus: AllOnXCaseStatus
): readonly AllOnXCaseStatus[] {
  return STATUS_TRANSITIONS[currentStatus];
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * Check if case requires immediate attention
 */
export function requiresImmediateAttention(caseEntity: AllOnXCase): boolean {
  if (caseEntity.priority === 'URGENT') return true;

  if (caseEntity.clinicalScore?.riskLevel === 'CRITICAL') return true;

  // Surgery scheduled within 7 days
  if (caseEntity.surgeryScheduledFor) {
    const daysUntilSurgery = Math.ceil(
      (caseEntity.surgeryScheduledFor.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilSurgery <= 7 && daysUntilSurgery >= 0) return true;
  }

  return false;
}

/**
 * Check if case is active (not completed/cancelled/on-hold)
 */
export function isActiveCase(caseEntity: AllOnXCase): boolean {
  return !['COMPLETED', 'CANCELLED', 'ON_HOLD'].includes(caseEntity.status);
}

/**
 * Check if case is ready for surgery
 */
export function isReadyForSurgery(caseEntity: AllOnXCase): boolean {
  return (
    caseEntity.status === 'SURGICAL_PHASE' &&
    caseEntity.consentObtained &&
    caseEntity.clinicalScore !== null &&
    caseEntity.clinicalScore.isCandidate() &&
    caseEntity.assignedClinicianId !== null
  );
}

/**
 * Check if case needs clinical assessment
 */
export function needsAssessment(caseEntity: AllOnXCase): boolean {
  return caseEntity.status === 'INTAKE' || caseEntity.clinicalScore === null;
}

/**
 * Check if case has bone augmentation requirement
 */
export function requiresBoneAugmentation(caseEntity: AllOnXCase): boolean {
  return caseEntity.clinicalScore?.requiresBoneAugmentation() ?? false;
}

/**
 * Calculate case progress percentage
 */
export function calculateCaseProgress(caseEntity: AllOnXCase): number {
  const statusProgress: Record<AllOnXCaseStatus, number> = {
    INTAKE: 5,
    ASSESSMENT: 15,
    PLANNING: 25,
    PRE_TREATMENT: 40,
    SURGICAL_PHASE: 60,
    HEALING: 75,
    PROSTHETIC_PHASE: 90,
    COMPLETED: 100,
    FOLLOW_UP: 100,
    ON_HOLD: -1, // Special case
    CANCELLED: -1, // Special case
  };

  return statusProgress[caseEntity.status];
}

/**
 * Get case summary
 */
export function getCaseSummary(caseEntity: AllOnXCase): string {
  const parts: string[] = [];

  parts.push(`Case ${caseEntity.caseNumber}`);
  parts.push(`Status: ${caseEntity.status}`);

  if (caseEntity.clinicalScore) {
    parts.push(`Eligibility: ${caseEntity.clinicalScore.eligibility}`);
    parts.push(`Risk: ${caseEntity.clinicalScore.riskLevel}`);
  }

  if (caseEntity.recommendedProcedure) {
    parts.push(`Procedure: ${caseEntity.recommendedProcedure.replace(/_/g, ' ')}`);
  }

  return parts.join(' | ');
}

/**
 * Get days since case creation
 */
export function getDaysSinceCreation(caseEntity: AllOnXCase): number {
  return Math.floor((Date.now() - caseEntity.createdAt.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if case is overdue for follow-up
 */
export function isOverdueForFollowUp(caseEntity: AllOnXCase): boolean {
  if (caseEntity.status === 'CANCELLED') return false;

  const pendingFollowUps = caseEntity.followUps.filter(
    (f) => !f.completedAt && f.scheduledFor < new Date()
  );

  return pendingFollowUps.length > 0;
}

/**
 * Get next scheduled follow-up
 */
export function getNextFollowUp(caseEntity: AllOnXCase): FollowUpRecord | null {
  const pendingFollowUps = caseEntity.followUps
    .filter((f) => !f.completedAt && f.scheduledFor >= new Date())
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

  return pendingFollowUps[0] ?? null;
}

/**
 * Get implant count
 */
export function getImplantCount(caseEntity: AllOnXCase): number {
  return caseEntity.implants.length;
}

/**
 * Get expected implant count based on procedure
 */
export function getExpectedImplantCount(caseEntity: AllOnXCase): number {
  if (!caseEntity.recommendedProcedure) return 0;

  const archMultiplier = caseEntity.targetArch === 'BOTH' ? 2 : 1;

  switch (caseEntity.recommendedProcedure) {
    case 'ALL_ON_4':
      return 4 * archMultiplier;
    case 'ALL_ON_6':
      return 6 * archMultiplier;
    case 'ALL_ON_X_HYBRID':
      return 5 * archMultiplier; // Average estimate
    default:
      return 0;
  }
}

/**
 * Check if all expected implants are placed
 */
export function areAllImplantsPlaced(caseEntity: AllOnXCase): boolean {
  const expected = getExpectedImplantCount(caseEntity);
  const actual = getImplantCount(caseEntity);
  return expected > 0 && actual >= expected;
}

/**
 * Get case eligibility summary
 */
export function getEligibilitySummary(caseEntity: AllOnXCase): {
  eligibility: AllOnXEligibility | null;
  riskLevel: AllOnXRiskLevel | null;
  complexity: AllOnXComplexity | null;
  recommendation: AllOnXTreatmentRecommendation | null;
  riskFactors: string[];
} {
  if (!caseEntity.clinicalScore) {
    return {
      eligibility: null,
      riskLevel: null,
      complexity: null,
      recommendation: null,
      riskFactors: [],
    };
  }

  return {
    eligibility: caseEntity.clinicalScore.eligibility,
    riskLevel: caseEntity.clinicalScore.riskLevel,
    complexity: caseEntity.clinicalScore.complexity,
    recommendation: caseEntity.clinicalScore.treatmentRecommendation,
    riskFactors: caseEntity.clinicalScore.getRiskFactors(),
  };
}
