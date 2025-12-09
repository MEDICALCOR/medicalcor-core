/**
 * @fileoverview Lab Case Entity
 *
 * Aggregate root for dental laboratory case management.
 * Tracks the complete digital workflow from impression to delivery.
 *
 * @module domain/dental-lab/entities/LabCase
 */

import type {
  LabCaseStatus,
  ProstheticSpec,
  ProstheticType,
  ProstheticMaterial,
  FDIToothNumber,
  ImplantComponentSpec,
} from '../value-objects/index.js';
import { isValidStatusTransition, getSLADeadline } from '../value-objects/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Priority levels for lab cases
 */
export type LabCasePriority = 'STANDARD' | 'RUSH' | 'EMERGENCY' | 'VIP';

/**
 * Digital impression/scan file
 */
export interface DigitalScan {
  readonly id: string;
  readonly scanType: 'INTRAORAL' | 'MODEL' | 'CBCT' | 'FACIAL';
  readonly fileFormat: 'STL' | 'PLY' | 'OBJ' | 'DCM' | 'DICOM';
  readonly filePath: string;
  readonly fileSize: number; // bytes
  readonly uploadedAt: Date;
  readonly scannerBrand?: string;
  readonly scannerModel?: string;
  readonly quality?: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR';
  readonly notes?: string;
}

/**
 * CAD design file
 */
export interface CADDesign {
  readonly id: string;
  readonly softwareUsed: string; // e.g., 'EXOCAD', '3SHAPE', 'DENTAL_WINGS'
  readonly version: string;
  readonly filePath: string;
  readonly designedBy: string; // technician ID
  readonly designedAt: Date;
  readonly approvedBy?: string;
  readonly approvedAt?: Date;
  readonly revisionNumber: number;
  readonly thumbnailPath?: string;
  readonly notes?: string;
}

/**
 * Quality control inspection record
 */
export interface QCInspection {
  readonly id: string;
  readonly inspectedBy: string;
  readonly inspectedAt: Date;
  readonly passed: boolean;
  readonly criteria: readonly QCCriteria[];
  readonly overallScore: number; // 0-100
  readonly notes?: string;
  readonly photos?: readonly string[];
}

export interface QCCriteria {
  readonly criterion: string;
  readonly passed: boolean;
  readonly score: number;
  readonly notes?: string;
}

/**
 * Fabrication record
 */
export interface FabricationRecord {
  readonly id: string;
  readonly method: 'MILLING' | 'PRINTING' | 'CASTING' | 'PRESSING' | 'LAYERING';
  readonly machine?: string;
  readonly materialBatch?: string;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly technicianId: string;
  readonly parameters?: Record<string, unknown>;
  readonly notes?: string;
}

/**
 * Try-in and adjustment record
 */
export interface TryInRecord {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly completedAt?: Date;
  readonly clinicianNotes?: string;
  readonly adjustmentsRequired: readonly AdjustmentRequest[];
  readonly patientSatisfaction?: 1 | 2 | 3 | 4 | 5;
  readonly photos?: readonly string[];
}

export interface AdjustmentRequest {
  readonly type:
    | 'OCCLUSION'
    | 'CONTACT'
    | 'SHADE'
    | 'CONTOUR'
    | 'MARGIN'
    | 'FIT'
    | 'TEXTURE'
    | 'OTHER';
  readonly description: string;
  readonly toothNumbers?: readonly FDIToothNumber[];
  readonly resolved: boolean;
}

/**
 * Status history entry
 */
export interface StatusHistoryEntry {
  readonly status: LabCaseStatus;
  readonly changedAt: Date;
  readonly changedBy: string;
  readonly reason?: string;
  readonly slaDeadline: Date;
}

// ============================================================================
// LAB CASE ENTITY
// ============================================================================

/**
 * Lab Case - Aggregate Root for dental laboratory case management
 */
export interface LabCase {
  // Identity
  readonly id: string;
  readonly caseNumber: string; // Human-readable case number (e.g., 'LAB-2024-001234')
  readonly clinicId: string;
  readonly patientId: string;
  readonly allOnXCaseId?: string; // Link to All-on-X case if applicable

  // Status
  readonly status: LabCaseStatus;
  readonly priority: LabCasePriority;
  readonly statusHistory: readonly StatusHistoryEntry[];

  // Prescription
  readonly prescribingDentist: string;
  readonly prescriptionDate: Date;
  readonly prosthetics: readonly ProstheticSpec[];
  readonly implantComponents?: readonly ImplantComponentSpec[];
  readonly specialInstructions?: string;
  readonly antagonistInfo?: string; // Opposing arch information

  // Digital assets
  readonly scans: readonly DigitalScan[];
  readonly designs: readonly CADDesign[];
  readonly currentDesignId?: string;

  // Fabrication
  readonly fabricationRecords: readonly FabricationRecord[];

  // Quality Control
  readonly qcInspections: readonly QCInspection[];

  // Try-in and delivery
  readonly tryInRecords: readonly TryInRecord[];
  readonly deliveryDate?: Date;
  readonly deliveredBy?: string;
  readonly trackingNumber?: string;

  // Assignment
  readonly assignedTechnician?: string;
  readonly assignedDesigner?: string;

  // Financials
  readonly estimatedCost?: number;
  readonly actualCost?: number;
  readonly currency: string;

  // Dates
  readonly receivedAt: Date;
  readonly dueDate: Date;
  readonly completedAt?: Date;
  readonly currentSLADeadline: Date;

  // Metadata
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly notes?: string;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateLabCaseInput {
  readonly clinicId: string;
  readonly patientId: string;
  readonly allOnXCaseId?: string;
  readonly prescribingDentist: string;
  readonly prosthetics: readonly ProstheticSpec[];
  readonly implantComponents?: readonly ImplantComponentSpec[];
  readonly priority?: LabCasePriority;
  readonly dueDate: Date;
  readonly specialInstructions?: string;
  readonly antagonistInfo?: string;
  readonly currency?: string;
  readonly estimatedCost?: number;
}

export interface UpdateLabCaseInput {
  readonly status?: LabCaseStatus;
  readonly priority?: LabCasePriority;
  readonly assignedTechnician?: string;
  readonly assignedDesigner?: string;
  readonly dueDate?: Date;
  readonly specialInstructions?: string;
  readonly notes?: string;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

let caseCounter = 0;

export function generateLabCaseNumber(clinicCode = 'LAB'): string {
  const year = new Date().getFullYear();
  caseCounter++;
  const sequence = String(caseCounter).padStart(6, '0');
  return `${clinicCode}-${year}-${sequence}`;
}

export function createLabCase(input: CreateLabCaseInput, createdBy: string): LabCase {
  const now = new Date();
  const initialStatus: LabCaseStatus = 'RECEIVED';
  const slaDeadline = getSLADeadline(initialStatus, now);

  return {
    id: crypto.randomUUID(),
    caseNumber: generateLabCaseNumber(),
    clinicId: input.clinicId,
    patientId: input.patientId,
    allOnXCaseId: input.allOnXCaseId,
    status: initialStatus,
    priority: input.priority ?? 'STANDARD',
    statusHistory: [
      {
        status: initialStatus,
        changedAt: now,
        changedBy: createdBy,
        reason: 'Case created',
        slaDeadline,
      },
    ],
    prescribingDentist: input.prescribingDentist,
    prescriptionDate: now,
    prosthetics: input.prosthetics,
    implantComponents: input.implantComponents,
    specialInstructions: input.specialInstructions,
    antagonistInfo: input.antagonistInfo,
    scans: [],
    designs: [],
    fabricationRecords: [],
    qcInspections: [],
    tryInRecords: [],
    estimatedCost: input.estimatedCost,
    currency: input.currency ?? 'RON',
    receivedAt: now,
    dueDate: input.dueDate,
    currentSLADeadline: slaDeadline,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

// ============================================================================
// STATE TRANSITIONS
// ============================================================================

export function transitionStatus(
  labCase: LabCase,
  newStatus: LabCaseStatus,
  changedBy: string,
  reason?: string
): LabCase {
  if (!isValidStatusTransition(labCase.status, newStatus)) {
    throw new Error(
      `Invalid status transition from ${labCase.status} to ${newStatus} for case ${labCase.caseNumber}`
    );
  }

  const now = new Date();
  const slaDeadline = getSLADeadline(newStatus, now);
  const newEntry: StatusHistoryEntry = {
    status: newStatus,
    changedAt: now,
    changedBy,
    reason,
    slaDeadline,
  };

  return {
    ...labCase,
    status: newStatus,
    statusHistory: [...labCase.statusHistory, newEntry],
    currentSLADeadline: slaDeadline,
    completedAt: newStatus === 'COMPLETED' ? now : labCase.completedAt,
    updatedAt: now,
    version: labCase.version + 1,
  };
}

// ============================================================================
// SCAN MANAGEMENT
// ============================================================================

export function addScan(labCase: LabCase, scan: Omit<DigitalScan, 'id'>): LabCase {
  const newScan: DigitalScan = {
    ...scan,
    id: crypto.randomUUID(),
  };

  return {
    ...labCase,
    scans: [...labCase.scans, newScan],
    updatedAt: new Date(),
    version: labCase.version + 1,
  };
}

// ============================================================================
// DESIGN MANAGEMENT
// ============================================================================

export function addDesign(labCase: LabCase, design: Omit<CADDesign, 'id'>): LabCase {
  const newDesign: CADDesign = {
    ...design,
    id: crypto.randomUUID(),
  };

  return {
    ...labCase,
    designs: [...labCase.designs, newDesign],
    currentDesignId: newDesign.id,
    updatedAt: new Date(),
    version: labCase.version + 1,
  };
}

export function approveDesign(labCase: LabCase, designId: string, approvedBy: string): LabCase {
  const now = new Date();
  const updatedDesigns = labCase.designs.map((d) =>
    d.id === designId ? { ...d, approvedBy, approvedAt: now } : d
  );

  return {
    ...labCase,
    designs: updatedDesigns,
    updatedAt: now,
    version: labCase.version + 1,
  };
}

// ============================================================================
// FABRICATION MANAGEMENT
// ============================================================================

export function addFabricationRecord(
  labCase: LabCase,
  record: Omit<FabricationRecord, 'id'>
): LabCase {
  const newRecord: FabricationRecord = {
    ...record,
    id: crypto.randomUUID(),
  };

  return {
    ...labCase,
    fabricationRecords: [...labCase.fabricationRecords, newRecord],
    updatedAt: new Date(),
    version: labCase.version + 1,
  };
}

// ============================================================================
// QC MANAGEMENT
// ============================================================================

export function addQCInspection(labCase: LabCase, inspection: Omit<QCInspection, 'id'>): LabCase {
  const newInspection: QCInspection = {
    ...inspection,
    id: crypto.randomUUID(),
  };

  return {
    ...labCase,
    qcInspections: [...labCase.qcInspections, newInspection],
    updatedAt: new Date(),
    version: labCase.version + 1,
  };
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

export function isOverdueSLA(labCase: LabCase): boolean {
  return new Date() > labCase.currentSLADeadline;
}

export function isOverdueDueDate(labCase: LabCase): boolean {
  return new Date() > labCase.dueDate && labCase.status !== 'COMPLETED';
}

export function getDaysUntilDue(labCase: LabCase): number {
  const now = new Date();
  const diff = labCase.dueDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getLatestQCResult(labCase: LabCase): QCInspection | undefined {
  return labCase.qcInspections[labCase.qcInspections.length - 1];
}

export function getCurrentDesign(labCase: LabCase): CADDesign | undefined {
  return labCase.designs.find((d) => d.id === labCase.currentDesignId);
}

export function getTotalUnitsCount(labCase: LabCase): number {
  return labCase.prosthetics.reduce((sum, p) => sum + p.toothNumbers.length, 0);
}

export function getProstheticsByType(
  labCase: LabCase,
  type: ProstheticType
): readonly ProstheticSpec[] {
  return labCase.prosthetics.filter((p) => p.type === type);
}

export function getMaterialsUsed(labCase: LabCase): readonly ProstheticMaterial[] {
  const materials = new Set<ProstheticMaterial>();
  for (const p of labCase.prosthetics) {
    materials.add(p.material);
  }
  return Array.from(materials);
}

export function requiresImplantComponents(labCase: LabCase): boolean {
  return labCase.prosthetics.some(
    (p) =>
      p.type === 'IMPLANT_CROWN' ||
      p.type === 'IMPLANT_BRIDGE' ||
      p.type === 'IMPLANT_ABUTMENT' ||
      p.type === 'HYBRID_PROSTHESIS' ||
      p.type === 'SCREW_RETAINED_CROWN' ||
      p.type === 'CEMENT_RETAINED_CROWN'
  );
}

export function getCaseSummary(labCase: LabCase): string {
  const units = getTotalUnitsCount(labCase);
  const types = [...new Set(labCase.prosthetics.map((p) => p.type))].join(', ');
  return `${labCase.caseNumber}: ${units} unit(s) - ${types}`;
}
