/**
 * @fileoverview Dental Laboratory Value Objects
 *
 * Exports all value objects for the dental laboratory domain.
 *
 * @module domain/dental-lab/value-objects
 */

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
} from './LabCaseStatus.js';

export {
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

  // Tooth Notation
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
} from './ProstheticSpec.js';
