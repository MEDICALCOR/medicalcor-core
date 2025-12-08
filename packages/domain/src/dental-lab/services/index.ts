/**
 * @fileoverview Dental Laboratory Services
 *
 * Exports all domain services for the dental laboratory.
 *
 * @module domain/dental-lab/services
 */

export {
  // Types
  type DesignValidationResult,
  type MillingParameters,
  type QCChecklistItem,
  type WorkflowRecommendation,

  // Validation
  validateDesign,

  // Manufacturing
  calculateMillingParameters,

  // Quality Control
  generateQCChecklist,
  calculateQCScore,

  // Workflow
  getWorkflowRecommendations,
  approveAndQueueForFabrication,
  estimateTurnaroundDays,
} from './CADCAMWorkflowService.js';
