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
 *
 * Returns an AllOnXCaseEntity instance with query methods available.
 * The return type is AllOnXCase for backward compatibility, but
 * the actual instance is AllOnXCaseEntity.
 *
 * @example
 * ```typescript
 * const caseEntity = createAllOnXCase({ patientId: 'patient-123' });
 *
 * // Use instance methods (preferred)
 * if (caseEntity instanceof AllOnXCaseEntity) {
 *   console.log(caseEntity.requiresImmediateAttention());
 * }
 *
 * // Or use deprecated helper functions
 * console.log(requiresImmediateAttention(caseEntity));
 * ```
 */
export function createAllOnXCase(input: CreateAllOnXCaseInput): AllOnXCaseEntity {
  return AllOnXCaseEntity.create(input);
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
// ALLONXCASE ENTITY CLASS
// ============================================================================

/**
 * AllOnXCaseEntity - Rich Domain Entity with Query Methods
 *
 * Encapsulates case data and provides instance methods for querying case state.
 * Follows DDD pattern where behavior is co-located with data.
 *
 * @example
 * ```typescript
 * const caseEntity = AllOnXCaseEntity.create({
 *   patientId: 'patient-123',
 *   priority: 'URGENT'
 * });
 *
 * if (caseEntity.requiresImmediateAttention()) {
 *   // Handle urgent case
 * }
 *
 * console.log(caseEntity.getCaseSummary());
 * ```
 */
export class AllOnXCaseEntity implements AllOnXCase {
  // Identity
  public readonly id: string;
  public readonly caseNumber: string;
  public readonly patientId: string;

  // Status
  public readonly status: AllOnXCaseStatus;
  public readonly priority: CasePriority;

  // Clinical Assessment
  public readonly clinicalScore: AllOnXClinicalScore | null;
  public readonly indicators: AllOnXClinicalIndicators | null;

  // Treatment Planning
  public readonly recommendedProcedure: AllOnXProcedureType | null;
  public readonly targetArch: 'MAXILLA' | 'MANDIBLE' | 'BOTH' | null;
  public readonly estimatedDuration: number | null;

  // Records
  public readonly imagingRecords: readonly ImagingRecord[];
  public readonly treatmentPhases: readonly TreatmentPhaseRecord[];
  public readonly consultations: readonly ConsultationRecord[];
  public readonly implants: readonly ImplantRecord[];
  public readonly followUps: readonly FollowUpRecord[];
  public readonly physicianReviews: readonly PhysicianReviewRecord[];

  // Assignment
  public readonly assignedClinicianId: string | null;
  public readonly assignedProsthodontistId: string | null;

  // Timestamps
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly assessmentCompletedAt: Date | null;
  public readonly surgeryScheduledFor: Date | null;
  public readonly surgeryCompletedAt: Date | null;
  public readonly prosthesisDeliveredAt: Date | null;

  // Consent & Compliance
  public readonly consentObtained: boolean;
  public readonly consentObtainedAt: Date | null;
  public readonly informedConsentDocumentId: string | null;

  // Notes
  public readonly clinicalNotes: string | null;
  public readonly internalNotes: string | null;

  // ============================================================================
  // PRIVATE CONSTRUCTOR
  // ============================================================================

  private constructor(data: AllOnXCase) {
    this.id = data.id;
    this.caseNumber = data.caseNumber;
    this.patientId = data.patientId;
    this.status = data.status;
    this.priority = data.priority;
    this.clinicalScore = data.clinicalScore;
    this.indicators = data.indicators;
    this.recommendedProcedure = data.recommendedProcedure;
    this.targetArch = data.targetArch;
    this.estimatedDuration = data.estimatedDuration;
    this.imagingRecords = data.imagingRecords;
    this.treatmentPhases = data.treatmentPhases;
    this.consultations = data.consultations;
    this.implants = data.implants;
    this.followUps = data.followUps;
    this.physicianReviews = data.physicianReviews;
    this.assignedClinicianId = data.assignedClinicianId;
    this.assignedProsthodontistId = data.assignedProsthodontistId;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.assessmentCompletedAt = data.assessmentCompletedAt;
    this.surgeryScheduledFor = data.surgeryScheduledFor;
    this.surgeryCompletedAt = data.surgeryCompletedAt;
    this.prosthesisDeliveredAt = data.prosthesisDeliveredAt;
    this.consentObtained = data.consentObtained;
    this.consentObtainedAt = data.consentObtainedAt;
    this.informedConsentDocumentId = data.informedConsentDocumentId;
    this.clinicalNotes = data.clinicalNotes;
    this.internalNotes = data.internalNotes;

    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create a new AllOnXCaseEntity from input
   */
  public static create(input: CreateAllOnXCaseInput): AllOnXCaseEntity {
    const now = new Date();

    const data: AllOnXCase = {
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
    };

    return new AllOnXCaseEntity(data);
  }

  /**
   * Reconstitute from existing data (e.g., from database)
   */
  public static fromData(data: AllOnXCase): AllOnXCaseEntity {
    return new AllOnXCaseEntity(data);
  }

  // ============================================================================
  // QUERY METHODS (Instance Methods)
  // ============================================================================

  /**
   * Check if case requires immediate attention
   */
  public requiresImmediateAttention(): boolean {
    if (this.priority === 'URGENT') return true;

    if (this.clinicalScore?.riskLevel === 'CRITICAL') return true;

    // Surgery scheduled within 7 days
    if (this.surgeryScheduledFor) {
      const daysUntilSurgery = Math.ceil(
        (this.surgeryScheduledFor.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilSurgery <= 7 && daysUntilSurgery >= 0) return true;
    }

    return false;
  }

  /**
   * Check if case is active (not completed/cancelled/on-hold)
   */
  public isActive(): boolean {
    return !['COMPLETED', 'CANCELLED', 'ON_HOLD'].includes(this.status);
  }

  /**
   * Check if case is ready for surgery
   */
  public isReadyForSurgery(): boolean {
    return (
      this.status === 'SURGICAL_PHASE' &&
      this.consentObtained &&
      this.clinicalScore !== null &&
      this.clinicalScore.isCandidate() &&
      this.assignedClinicianId !== null
    );
  }

  /**
   * Check if case needs clinical assessment
   */
  public needsAssessment(): boolean {
    return this.status === 'INTAKE' || this.clinicalScore === null;
  }

  /**
   * Check if case has bone augmentation requirement
   */
  public requiresBoneAugmentation(): boolean {
    return this.clinicalScore?.requiresBoneAugmentation() ?? false;
  }

  /**
   * Calculate case progress percentage
   */
  public getProgress(): number {
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
      ON_HOLD: -1,
      CANCELLED: -1,
    };

    return statusProgress[this.status];
  }

  /**
   * Get case summary
   */
  public getSummary(): string {
    const parts: string[] = [];

    parts.push(`Case ${this.caseNumber}`);
    parts.push(`Status: ${this.status}`);

    if (this.clinicalScore) {
      parts.push(`Eligibility: ${this.clinicalScore.eligibility}`);
      parts.push(`Risk: ${this.clinicalScore.riskLevel}`);
    }

    if (this.recommendedProcedure) {
      parts.push(`Procedure: ${this.recommendedProcedure.replace(/_/g, ' ')}`);
    }

    return parts.join(' | ');
  }

  /**
   * Get days since case creation
   */
  public getDaysSinceCreation(): number {
    return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if case is overdue for follow-up
   */
  public isOverdueForFollowUp(): boolean {
    if (this.status === 'CANCELLED') return false;

    const pendingFollowUps = this.followUps.filter(
      (f) => !f.completedAt && f.scheduledFor < new Date()
    );

    return pendingFollowUps.length > 0;
  }

  /**
   * Get next scheduled follow-up
   */
  public getNextFollowUp(): FollowUpRecord | null {
    const pendingFollowUps = this.followUps
      .filter((f) => !f.completedAt && f.scheduledFor >= new Date())
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

    return pendingFollowUps[0] ?? null;
  }

  /**
   * Get implant count
   */
  public getImplantCount(): number {
    return this.implants.length;
  }

  /**
   * Get expected implant count based on procedure
   */
  public getExpectedImplantCount(): number {
    if (!this.recommendedProcedure) return 0;

    const archMultiplier = this.targetArch === 'BOTH' ? 2 : 1;

    switch (this.recommendedProcedure) {
      case 'ALL_ON_4':
        return 4 * archMultiplier;
      case 'ALL_ON_6':
        return 6 * archMultiplier;
      case 'ALL_ON_X_HYBRID':
        return 5 * archMultiplier;
      default:
        return 0;
    }
  }

  /**
   * Check if all expected implants are placed
   */
  public areAllImplantsPlaced(): boolean {
    const expected = this.getExpectedImplantCount();
    const actual = this.getImplantCount();
    return expected > 0 && actual >= expected;
  }

  /**
   * Get case eligibility summary
   */
  public getEligibilitySummary(): {
    eligibility: AllOnXEligibility | null;
    riskLevel: AllOnXRiskLevel | null;
    complexity: AllOnXComplexity | null;
    recommendation: AllOnXTreatmentRecommendation | null;
    riskFactors: string[];
  } {
    if (!this.clinicalScore) {
      return {
        eligibility: null,
        riskLevel: null,
        complexity: null,
        recommendation: null,
        riskFactors: [],
      };
    }

    return {
      eligibility: this.clinicalScore.eligibility,
      riskLevel: this.clinicalScore.riskLevel,
      complexity: this.clinicalScore.complexity,
      recommendation: this.clinicalScore.treatmentRecommendation,
      riskFactors: this.clinicalScore.getRiskFactors(),
    };
  }

  /**
   * Convert to plain object
   */
  public toJSON(): AllOnXCase {
    return {
      id: this.id,
      caseNumber: this.caseNumber,
      patientId: this.patientId,
      status: this.status,
      priority: this.priority,
      clinicalScore: this.clinicalScore,
      indicators: this.indicators,
      recommendedProcedure: this.recommendedProcedure,
      targetArch: this.targetArch,
      estimatedDuration: this.estimatedDuration,
      imagingRecords: this.imagingRecords,
      treatmentPhases: this.treatmentPhases,
      consultations: this.consultations,
      implants: this.implants,
      followUps: this.followUps,
      physicianReviews: this.physicianReviews,
      assignedClinicianId: this.assignedClinicianId,
      assignedProsthodontistId: this.assignedProsthodontistId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      assessmentCompletedAt: this.assessmentCompletedAt,
      surgeryScheduledFor: this.surgeryScheduledFor,
      surgeryCompletedAt: this.surgeryCompletedAt,
      prosthesisDeliveredAt: this.prosthesisDeliveredAt,
      consentObtained: this.consentObtained,
      consentObtainedAt: this.consentObtainedAt,
      informedConsentDocumentId: this.informedConsentDocumentId,
      clinicalNotes: this.clinicalNotes,
      internalNotes: this.internalNotes,
    };
  }
}

// ============================================================================
// QUERY HELPERS (Backward-compatible module-level functions)
// ============================================================================

/**
 * Check if case requires immediate attention
 * @deprecated Use AllOnXCaseEntity.requiresImmediateAttention() instance method instead
 */
export function requiresImmediateAttention(caseEntity: AllOnXCase): boolean {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.requiresImmediateAttention();
  }

  if (caseEntity.priority === 'URGENT') return true;

  if (caseEntity.clinicalScore?.riskLevel === 'CRITICAL') return true;

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
 * @deprecated Use AllOnXCaseEntity.isActive() instance method instead
 */
export function isActiveCase(caseEntity: AllOnXCase): boolean {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.isActive();
  }
  return !['COMPLETED', 'CANCELLED', 'ON_HOLD'].includes(caseEntity.status);
}

/**
 * Check if case is ready for surgery
 * @deprecated Use AllOnXCaseEntity.isReadyForSurgery() instance method instead
 */
export function isReadyForSurgery(caseEntity: AllOnXCase): boolean {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.isReadyForSurgery();
  }
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
 * @deprecated Use AllOnXCaseEntity.needsAssessment() instance method instead
 */
export function needsAssessment(caseEntity: AllOnXCase): boolean {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.needsAssessment();
  }
  return caseEntity.status === 'INTAKE' || caseEntity.clinicalScore === null;
}

/**
 * Check if case has bone augmentation requirement
 * @deprecated Use AllOnXCaseEntity.requiresBoneAugmentation() instance method instead
 */
export function requiresBoneAugmentation(caseEntity: AllOnXCase): boolean {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.requiresBoneAugmentation();
  }
  return caseEntity.clinicalScore?.requiresBoneAugmentation() ?? false;
}

/**
 * Calculate case progress percentage
 * @deprecated Use AllOnXCaseEntity.getProgress() instance method instead
 */
export function calculateCaseProgress(caseEntity: AllOnXCase): number {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.getProgress();
  }

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
    ON_HOLD: -1,
    CANCELLED: -1,
  };

  return statusProgress[caseEntity.status];
}

/**
 * Get case summary
 * @deprecated Use AllOnXCaseEntity.getSummary() instance method instead
 */
export function getCaseSummary(caseEntity: AllOnXCase): string {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.getSummary();
  }

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
 * @deprecated Use AllOnXCaseEntity.getDaysSinceCreation() instance method instead
 */
export function getDaysSinceCreation(caseEntity: AllOnXCase): number {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.getDaysSinceCreation();
  }
  return Math.floor((Date.now() - caseEntity.createdAt.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if case is overdue for follow-up
 * @deprecated Use AllOnXCaseEntity.isOverdueForFollowUp() instance method instead
 */
export function isOverdueForFollowUp(caseEntity: AllOnXCase): boolean {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.isOverdueForFollowUp();
  }

  if (caseEntity.status === 'CANCELLED') return false;

  const pendingFollowUps = caseEntity.followUps.filter(
    (f) => !f.completedAt && f.scheduledFor < new Date()
  );

  return pendingFollowUps.length > 0;
}

/**
 * Get next scheduled follow-up
 * @deprecated Use AllOnXCaseEntity.getNextFollowUp() instance method instead
 */
export function getNextFollowUp(caseEntity: AllOnXCase): FollowUpRecord | null {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.getNextFollowUp();
  }

  const pendingFollowUps = caseEntity.followUps
    .filter((f) => !f.completedAt && f.scheduledFor >= new Date())
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

  return pendingFollowUps[0] ?? null;
}

/**
 * Get implant count
 * @deprecated Use AllOnXCaseEntity.getImplantCount() instance method instead
 */
export function getImplantCount(caseEntity: AllOnXCase): number {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.getImplantCount();
  }
  return caseEntity.implants.length;
}

/**
 * Get expected implant count based on procedure
 * @deprecated Use AllOnXCaseEntity.getExpectedImplantCount() instance method instead
 */
export function getExpectedImplantCount(caseEntity: AllOnXCase): number {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.getExpectedImplantCount();
  }

  if (!caseEntity.recommendedProcedure) return 0;

  const archMultiplier = caseEntity.targetArch === 'BOTH' ? 2 : 1;

  switch (caseEntity.recommendedProcedure) {
    case 'ALL_ON_4':
      return 4 * archMultiplier;
    case 'ALL_ON_6':
      return 6 * archMultiplier;
    case 'ALL_ON_X_HYBRID':
      return 5 * archMultiplier;
    default:
      return 0;
  }
}

/**
 * Check if all expected implants are placed
 * @deprecated Use AllOnXCaseEntity.areAllImplantsPlaced() instance method instead
 */
export function areAllImplantsPlaced(caseEntity: AllOnXCase): boolean {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.areAllImplantsPlaced();
  }
  const expected = getExpectedImplantCount(caseEntity);
  const actual = getImplantCount(caseEntity);
  return expected > 0 && actual >= expected;
}

/**
 * Get case eligibility summary
 * @deprecated Use AllOnXCaseEntity.getEligibilitySummary() instance method instead
 */
export function getEligibilitySummary(caseEntity: AllOnXCase): {
  eligibility: AllOnXEligibility | null;
  riskLevel: AllOnXRiskLevel | null;
  complexity: AllOnXComplexity | null;
  recommendation: AllOnXTreatmentRecommendation | null;
  riskFactors: string[];
} {
  if (caseEntity instanceof AllOnXCaseEntity) {
    return caseEntity.getEligibilitySummary();
  }

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
