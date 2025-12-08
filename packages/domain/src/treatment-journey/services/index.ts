/**
 * @fileoverview Treatment Journey Services
 *
 * Exports all services for the treatment journey domain.
 * These services power the intelligent dental workflow platform.
 *
 * @module domain/treatment-journey/services
 */

// AI Treatment Planning Service
export {
  // Types
  type ClinicalAssessmentInput,
  type TreatmentOption,
  type TreatmentPhase,
  type ProcedureRecommendation,
  type TreatmentRisk,
  type AITreatmentPlan,
  type TreatmentVisualization,
  type ToothState,

  // Core functions
  generateTreatmentPlanPrompt,
  analyzeRestorationStrategy,
  calculatePredictedSuccessRate,
  estimateTreatmentCost,
  assessUrgency,
  createPatientFriendlySummary,
  validateTreatmentPlan,
} from './AITreatmentPlanningService.js';

// Predictive Outcome Service
export {
  // Types
  type PatientRiskProfile,
  type TreatmentParameters,
  type OutcomePrediction,
  type ComparativeOutcome,

  // Core functions
  predictOutcome,
  compareOutcomes,
} from './PredictiveOutcomeService.js';

// Clinic-Lab Collaboration Service
export {
  // Types
  type CollaborationMessage,
  type MessageAttachment,
  type DesignFeedback,
  type DesignAnnotation,
  type CaseStatusUpdate,
  type NotificationPreferences,
  type CollaborationThread,
  type LabSLATracking,

  // Core functions
  createCollaborationThread,
  addMessageToThread,
  createDesignFeedback,
  generateStatusUpdateNotification,
  calculateSLATracking,
  generateClinicDailySummary,
  calculateLabPerformanceMetrics,
} from './ClinicLabCollaborationService.js';
