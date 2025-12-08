/**
 * @fileoverview Dental Laboratory Entities
 *
 * Exports all entities for the dental laboratory domain.
 *
 * @module domain/dental-lab/entities
 */

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
} from './LabCase.js';
