/**
 * @fileoverview Dental Laboratory Domain Module
 *
 * Complete digital workflow for dental laboratory case management.
 * Supports CAD/CAM design, milling, quality control, and delivery tracking.
 *
 * @module domain/dental-lab
 *
 * CLINICAL CONTEXT:
 * Modern dental laboratories operate with fully digital workflows:
 * 1. Digital impression (intraoral scan or model scan)
 * 2. CAD design (3Shape, Exocad, Dental Wings)
 * 3. CAM fabrication (milling, 3D printing)
 * 4. Post-processing (sintering, staining, glazing)
 * 5. Quality control and delivery
 *
 * This module integrates with the AllOnX module for full-arch
 * implant prosthetics (hybrid prostheses, provisional restorations).
 *
 * @see ISO 22674 - Metallic materials for fixed and removable restorations
 * @see ISO 6872 - Ceramic materials
 * @see ISO 10477 - Polymer-based restorative materials
 */

// ============================================================================
// VALUE OBJECTS
// ============================================================================

export {
  // Lab Case Status
  LAB_CASE_STATUSES,
  type LabCaseStatus,
  ACTIVE_STATUSES,
  DESIGN_PHASE_STATUSES,
  FABRICATION_PHASE_STATUSES,
  TERMINAL_STATUSES,
  VALID_STATUS_TRANSITIONS,
  isValidLabCaseStatus,
  isValidStatusTransition,
  isActiveLabCase,
  isInDesignPhase,
  isInFabricationPhase,
  isTerminalStatus,
  getNextAllowedStatuses,
  LAB_CASE_SLA_HOURS,
  getSLADeadline,

  // Prosthetic Types
  PROSTHETIC_TYPES,
  type ProstheticType,

  // Materials
  PROSTHETIC_MATERIALS,
  type ProstheticMaterial,

  // Shade Systems
  SHADE_SYSTEMS,
  type ShadeSystem,
  VITA_CLASSICAL_SHADES,
  type VitaClassicalShade,

  // Tooth Notation (FDI/ISO 3950)
  FDI_TOOTH_NUMBERS,
  type FDIToothNumber,

  // Specifications
  type ProstheticSpec,
  type ImplantComponentSpec,
  type MaterialProperties,
  MATERIAL_PROPERTIES,

  // Helper Functions
  isValidProstheticType,
  isValidMaterial,
  isValidFDITooth,
  isMaterialCompatibleWithType,
  getToothQuadrant,
  isMaxillaryTooth,
  isMandibularTooth,
  isAnteriorTooth,
  isPosteriorTooth,
} from './value-objects/index.js';

// ============================================================================
// ENTITIES
// ============================================================================

export {
  // Types
  type LabCasePriority,
  type DigitalScan,
  type CADDesign,
  type QCInspection,
  type QCCriteria,
  type FabricationRecord,
  type TryInRecord,
  type AdjustmentRequest,
  type StatusHistoryEntry,
  type LabCase,
  type CreateLabCaseInput,
  type UpdateLabCaseInput,

  // Factory functions
  generateLabCaseNumber,
  createLabCase,

  // State transitions
  transitionStatus,

  // Asset management
  addScan,
  addDesign,
  approveDesign,
  addFabricationRecord,
  addQCInspection,

  // Query helpers
  isOverdueSLA,
  isOverdueDueDate,
  getDaysUntilDue,
  getLatestQCResult,
  getCurrentDesign,
  getTotalUnitsCount,
  getProstheticsByType,
  getMaterialsUsed,
  requiresImplantComponents,
  getCaseSummary,
} from './entities/index.js';

// ============================================================================
// DOMAIN SERVICES
// ============================================================================

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
} from './services/index.js';
