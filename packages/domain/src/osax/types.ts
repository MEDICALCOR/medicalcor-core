/**
 * @fileoverview OSAX Domain Types
 *
 * Types for OSAX (Oral Surgery Assessment eXtended) scoring system.
 * Pure domain types with no infrastructure dependencies.
 *
 * @module domain/osax/types
 */

// ============================================================================
// RISK CLASSES
// ============================================================================

/** Risk classification for OSAX cases */
export type OsaxRiskClass = 'RED' | 'YELLOW' | 'GREEN';

/** Status of an OSAX case */
export type OsaxCaseStatus = 'pending' | 'scored' | 'red' | 'yellow' | 'green';

/** Subject type for OSAX assessment */
export type OsaxSubjectType = 'lead' | 'patient';

// ============================================================================
// SCORING FACTORS
// ============================================================================

/** Bone quality level (1-4, Misch Classification) */
export type BoneQualityLevel = 1 | 2 | 3 | 4;

/** Soft tissue health level */
export type SoftTissueLevel = 'excellent' | 'good' | 'fair' | 'poor';

/** Systemic risk category */
export type SystemicRiskCategory =
  | 'none'
  | 'diabetes_controlled'
  | 'diabetes_uncontrolled'
  | 'smoking_light'
  | 'smoking_heavy'
  | 'bisphosphonates'
  | 'immunocompromised'
  | 'cardiovascular';

/** Urgency level */
export type UrgencyLevel = 'routine' | 'soon' | 'urgent' | 'emergency';

/** Financial readiness level */
export type FinancialReadiness = 'ready' | 'financing_needed' | 'uncertain' | 'not_ready';

// ============================================================================
// SCORING INPUT/OUTPUT
// ============================================================================

/**
 * Input factors for OSAX scoring
 */
export interface OsaxScoringFactors {
  /** Bone quality level (1-4) */
  readonly boneQuality: BoneQualityLevel;

  /** Soft tissue health */
  readonly softTissueHealth: SoftTissueLevel;

  /** List of systemic risk categories present */
  readonly systemicRisks: readonly SystemicRiskCategory[];

  /** Urgency of treatment needed */
  readonly urgency: UrgencyLevel;

  /** Patient financial readiness */
  readonly financialReadiness: FinancialReadiness;

  /** Patient age in years */
  readonly patientAge?: number;

  /** ASA classification (1-5) */
  readonly asaClassification?: number;
}

/**
 * Component score from an individual scorer
 */
export interface ComponentScore {
  /** Scorer identifier */
  readonly scorer: string;

  /** Raw score (0-100) */
  readonly rawScore: number;

  /** Weight applied */
  readonly weight: number;

  /** Weighted score contribution */
  readonly weightedScore: number;

  /** Risk factors identified */
  readonly riskFactors: readonly string[];
}

/**
 * Complete OSAX scoring result
 */
export interface OsaxScoringResult {
  /** Global score (0-100) */
  readonly globalScore: number;

  /** Risk classification */
  readonly riskClass: OsaxRiskClass;

  /** Individual component scores */
  readonly componentScores: readonly ComponentScore[];

  /** All identified risk factors */
  readonly riskFactors: readonly string[];

  /** Confidence level (0-1) */
  readonly confidence: number;

  /** Scoring algorithm version */
  readonly algorithmVersion: string;

  /** Timestamp of scoring */
  readonly scoredAt: Date;
}

// ============================================================================
// SCORER INTERFACE
// ============================================================================

/**
 * Interface for individual scoring components
 */
export interface IOsaxScorer {
  /** Unique scorer identifier */
  readonly name: string;

  /** Weight in composite score (0-1) */
  readonly weight: number;

  /**
   * Calculate score from factors
   * @returns Raw score (0-100) and identified risk factors
   */
  score(factors: OsaxScoringFactors): {
    rawScore: number;
    riskFactors: string[];
  };
}

// ============================================================================
// OSAX CASE ENTITY
// ============================================================================

/**
 * OSAX Case entity for persistence
 */
export interface OsaxCase {
  readonly id: string;
  readonly subjectId: string;
  readonly subjectType: OsaxSubjectType;
  readonly status: OsaxCaseStatus;
  readonly globalScore: number | null;
  readonly riskClass: OsaxRiskClass | null;
  readonly componentScores: Record<string, ComponentScore> | null;
  readonly encryptedMedicalData: Buffer | null;
  readonly encryptionKeyId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date | null;
  readonly deletedAt: Date | null;
  readonly correlationId: string | null;
}

/**
 * Input for creating a new OSAX case
 */
export interface CreateOsaxCaseInput {
  readonly subjectId: string;
  readonly subjectType: OsaxSubjectType;
  readonly encryptionKeyId: string;
  readonly correlationId?: string;
}

/**
 * Input for scoring an OSAX case
 */
export interface ScoreOsaxCaseInput {
  readonly caseId: string;
  readonly factors: OsaxScoringFactors;
  readonly correlationId?: string;
}
