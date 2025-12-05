/**
 * @fileoverview OSAX Value Objects Index
 *
 * Re-exports all value objects for the OSAX domain.
 *
 * @module domain/osax/value-objects
 */

// OsaxClinicalScore exports
export {
  OsaxClinicalScore,
  InvalidOsaxScoreError,
  isOsaxClinicalScore,
  isSuccessfulParse,
  CLINICAL_INDICATOR_RANGES,
  SEVERITY_THRESHOLDS,
  CLINICAL_SLA_HOURS,
  type OsaxSeverity,
  type OsaxCardiovascularRisk,
  type OsaxTreatmentRecommendation,
  type FollowUpUrgency,
  type ClinicalTaskPriority,
  type OsaxClinicalIndicators,
  type OsaxClinicalScoreDTO,
  type OsaxClinicalScoreParseResult,
  type InvalidOsaxScoreErrorDetails,
  type ValidatedAHI,
  type ValidatedSpO2,
  type ValidatedCompositeScore,
  type ValidatedConfidence,
} from './OsaxClinicalScore.js';

// OsaxSubjectId exports
export {
  OsaxSubjectId,
  InvalidOsaxSubjectIdError,
  type OsaxSubjectIdType,
  type OsaxSubjectType,
  type OsaxSubjectDemographics,
  type OsaxSubjectIdDTO,
  type OsaxSubjectIdParseResult,
} from './OsaxSubjectId.js';

// ImagingFindings exports (v3.2 Multimodal)
export {
  ImagingFindings,
  InvalidImagingFindingsError,
  isImagingFindings,
  type ImagingModality,
  type FindingType,
  type RiskClass,
  type BoundingBox,
  type RegionFinding,
  type CreateImagingFindingsInput,
  type ImagingFindingsDTO,
  type InvalidImagingFindingsErrorDetails,
} from './ImagingFindings.js';

// FinancialPrediction exports (v3.2 Multimodal)
export {
  FinancialPrediction,
  InvalidFinancialPredictionError,
  isFinancialPrediction,
  type ProbabilityTier,
  type FactorContribution,
  type PredictionFactor,
  type EstimatedValueRange,
  type CreateFinancialPredictionInput,
  type FinancialPredictionDTO,
  type InvalidFinancialPredictionErrorDetails,
} from './FinancialPrediction.js';
