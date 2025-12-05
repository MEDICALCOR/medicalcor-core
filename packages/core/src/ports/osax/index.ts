/**
 * @fileoverview OSAX Ports Index
 *
 * Exports all OSAX-related outbound ports for hexagonal architecture.
 *
 * @module core/ports/osax
 */

// Imaging Model Port
export {
  type ImagingModelPort,
  type ImagingAnalysisInput,
  type ImagingModelHealth,
  type PatientAgeGroup,
  type AnalysisDetailLevel,
  type ImagingAnalysisErrorCode,
  ImagingAnalysisError,
  isImagingModelPort,
} from './ImagingModelPort.js';

// Storage Port
export {
  type StoragePort,
  type StorageMetadata,
  type UploadOptions,
  type UploadResult,
  type StorageHealth,
  type StorageErrorCode,
  StorageError,
  MAX_IMAGING_URL_TTL_SECONDS,
  MAX_IMAGING_FILE_SIZE_BYTES,
  ALLOWED_IMAGING_MIME_TYPES,
  isStoragePort,
} from './StoragePort.js';

// Financial Model Port
export {
  type FinancialModelPort,
  type FinancialPredictionInput,
  type FinancialModelHealth,
  type FinancialModelInfo,
  type CaseSeverity,
  type TreatmentComplexity,
  type InsuranceTier,
  type CaseType,
  type FinancialPredictionErrorCode,
  FinancialPredictionError,
  isFinancialModelPort,
} from './FinancialModelPort.js';

// Resource Scheduler Port
export {
  type ResourceSchedulerPort,
  type SoftHoldOptions,
  type DateRange,
  type SchedulingPriority,
  type AvailabilityResult,
  type ResourceConflict,
  type TimeSlot,
  type SchedulerHealth,
  type SchedulingErrorCode,
  SchedulingError,
  MAX_SOFT_HOLD_TTL_HOURS,
  DEFAULT_SOFT_HOLD_TTL_HOURS,
  MAX_SOFT_HOLDS_PER_CASE,
  isResourceSchedulerPort,
} from './ResourceSchedulerPort.js';
