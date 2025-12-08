/**
 * @fileoverview Lab Case Status Value Object
 *
 * Defines the lifecycle states for dental laboratory cases,
 * supporting the complete digital workflow from impression to delivery.
 *
 * @module domain/dental-lab/value-objects/LabCaseStatus
 */

// ============================================================================
// LAB CASE STATUS TYPES
// ============================================================================

/**
 * Lab case lifecycle states following ISO 22674 dental laboratory standards
 */
export const LAB_CASE_STATUSES = [
  // Initial states
  'RECEIVED', // Case received from clinic
  'PENDING_SCAN', // Awaiting digital impression
  'SCAN_RECEIVED', // Digital impression uploaded

  // Design phase (CAD)
  'IN_DESIGN', // CAD design in progress
  'DESIGN_REVIEW', // Awaiting clinician approval
  'DESIGN_APPROVED', // Design approved for fabrication
  'DESIGN_REVISION', // Revision requested

  // Fabrication phase (CAM)
  'QUEUED_FOR_MILLING', // In milling queue
  'MILLING', // Active milling/printing
  'POST_PROCESSING', // Sintering, staining, glazing
  'FINISHING', // Manual finishing, polishing

  // Quality control
  'QC_INSPECTION', // Quality control check
  'QC_FAILED', // Failed QC, needs rework
  'QC_PASSED', // Passed QC

  // Delivery
  'READY_FOR_PICKUP', // Ready for clinic pickup
  'IN_TRANSIT', // Being delivered
  'DELIVERED', // Delivered to clinic

  // Try-in and adjustment
  'TRY_IN_SCHEDULED', // Try-in appointment scheduled
  'ADJUSTMENT_REQUIRED', // Needs adjustment after try-in
  'ADJUSTMENT_IN_PROGRESS', // Adjustment being made

  // Final states
  'COMPLETED', // Successfully completed
  'CANCELLED', // Cancelled
  'ON_HOLD', // Temporarily on hold
] as const;

export type LabCaseStatus = (typeof LAB_CASE_STATUSES)[number];

// ============================================================================
// STATUS GROUPS
// ============================================================================

export const ACTIVE_STATUSES: readonly LabCaseStatus[] = [
  'RECEIVED',
  'PENDING_SCAN',
  'SCAN_RECEIVED',
  'IN_DESIGN',
  'DESIGN_REVIEW',
  'DESIGN_REVISION',
  'QUEUED_FOR_MILLING',
  'MILLING',
  'POST_PROCESSING',
  'FINISHING',
  'QC_INSPECTION',
  'TRY_IN_SCHEDULED',
  'ADJUSTMENT_IN_PROGRESS',
] as const;

export const DESIGN_PHASE_STATUSES: readonly LabCaseStatus[] = [
  'IN_DESIGN',
  'DESIGN_REVIEW',
  'DESIGN_APPROVED',
  'DESIGN_REVISION',
] as const;

export const FABRICATION_PHASE_STATUSES: readonly LabCaseStatus[] = [
  'QUEUED_FOR_MILLING',
  'MILLING',
  'POST_PROCESSING',
  'FINISHING',
] as const;

export const TERMINAL_STATUSES: readonly LabCaseStatus[] = ['COMPLETED', 'CANCELLED'] as const;

// ============================================================================
// STATUS TRANSITIONS
// ============================================================================

/**
 * Valid status transitions following dental lab workflow
 */
export const VALID_STATUS_TRANSITIONS: Record<LabCaseStatus, readonly LabCaseStatus[]> = {
  RECEIVED: ['PENDING_SCAN', 'SCAN_RECEIVED', 'CANCELLED', 'ON_HOLD'],
  PENDING_SCAN: ['SCAN_RECEIVED', 'CANCELLED', 'ON_HOLD'],
  SCAN_RECEIVED: ['IN_DESIGN', 'CANCELLED', 'ON_HOLD'],

  IN_DESIGN: ['DESIGN_REVIEW', 'CANCELLED', 'ON_HOLD'],
  DESIGN_REVIEW: ['DESIGN_APPROVED', 'DESIGN_REVISION', 'ON_HOLD'],
  DESIGN_APPROVED: ['QUEUED_FOR_MILLING', 'DESIGN_REVISION'],
  DESIGN_REVISION: ['IN_DESIGN', 'CANCELLED'],

  QUEUED_FOR_MILLING: ['MILLING', 'CANCELLED', 'ON_HOLD'],
  MILLING: ['POST_PROCESSING', 'QC_FAILED'],
  POST_PROCESSING: ['FINISHING'],
  FINISHING: ['QC_INSPECTION'],

  QC_INSPECTION: ['QC_PASSED', 'QC_FAILED'],
  QC_FAILED: ['IN_DESIGN', 'MILLING', 'CANCELLED'],
  QC_PASSED: ['READY_FOR_PICKUP'],

  READY_FOR_PICKUP: ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: ['TRY_IN_SCHEDULED', 'COMPLETED', 'ADJUSTMENT_REQUIRED'],

  TRY_IN_SCHEDULED: ['ADJUSTMENT_REQUIRED', 'COMPLETED'],
  ADJUSTMENT_REQUIRED: ['ADJUSTMENT_IN_PROGRESS'],
  ADJUSTMENT_IN_PROGRESS: ['QC_INSPECTION', 'DELIVERED'],

  COMPLETED: [],
  CANCELLED: [],
  ON_HOLD: ['RECEIVED', 'PENDING_SCAN', 'SCAN_RECEIVED', 'IN_DESIGN', 'QUEUED_FOR_MILLING'],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function isValidLabCaseStatus(value: unknown): value is LabCaseStatus {
  return typeof value === 'string' && LAB_CASE_STATUSES.includes(value as LabCaseStatus);
}

export function isValidStatusTransition(from: LabCaseStatus, to: LabCaseStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from].includes(to);
}

export function isActiveLabCase(status: LabCaseStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isInDesignPhase(status: LabCaseStatus): boolean {
  return DESIGN_PHASE_STATUSES.includes(status);
}

export function isInFabricationPhase(status: LabCaseStatus): boolean {
  return FABRICATION_PHASE_STATUSES.includes(status);
}

export function isTerminalStatus(status: LabCaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function getNextAllowedStatuses(current: LabCaseStatus): readonly LabCaseStatus[] {
  return VALID_STATUS_TRANSITIONS[current];
}

// ============================================================================
// SLA CONFIGURATION (hours)
// ============================================================================

export const LAB_CASE_SLA_HOURS: Record<LabCaseStatus, number> = {
  RECEIVED: 4, // Acknowledge within 4 hours
  PENDING_SCAN: 24,
  SCAN_RECEIVED: 8,
  IN_DESIGN: 48, // Standard design turnaround
  DESIGN_REVIEW: 24,
  DESIGN_APPROVED: 4,
  DESIGN_REVISION: 24,
  QUEUED_FOR_MILLING: 8,
  MILLING: 24,
  POST_PROCESSING: 12,
  FINISHING: 8,
  QC_INSPECTION: 4,
  QC_FAILED: 24,
  QC_PASSED: 2,
  READY_FOR_PICKUP: 48,
  IN_TRANSIT: 24,
  DELIVERED: 0,
  TRY_IN_SCHEDULED: 0,
  ADJUSTMENT_REQUIRED: 24,
  ADJUSTMENT_IN_PROGRESS: 48,
  COMPLETED: 0,
  CANCELLED: 0,
  ON_HOLD: 0,
};

export function getSLADeadline(status: LabCaseStatus, startTime: Date): Date {
  const hours = LAB_CASE_SLA_HOURS[status];
  return new Date(startTime.getTime() + hours * 60 * 60 * 1000);
}
