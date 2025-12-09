/**
 * @fileoverview CAD/CAM Workflow Service
 *
 * Domain service for managing the complete CAD/CAM digital workflow
 * in the dental laboratory. Handles design, milling, and quality control.
 *
 * @module domain/dental-lab/services/CADCAMWorkflowService
 */

import type { LabCase, CADDesign } from '../entities/index.js';
import type { ProstheticMaterial, ProstheticType } from '../value-objects/index.js';
import { transitionStatus } from '../entities/index.js';
import { MATERIAL_PROPERTIES } from '../value-objects/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DesignValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly score: number; // 0-100
}

export interface MillingParameters {
  readonly material: ProstheticMaterial;
  readonly strategy: 'WET' | 'DRY';
  readonly toolPaths: readonly string[];
  readonly estimatedTimeMinutes: number;
  readonly shrinkageFactor?: number; // For zirconia
  readonly sinteringRequired: boolean;
  readonly sinteringProfile?: string;
}

export interface QCChecklistItem {
  readonly criterion: string;
  readonly category: 'MARGINAL_FIT' | 'OCCLUSION' | 'CONTACTS' | 'SHADE' | 'ANATOMY' | 'SURFACE';
  readonly weight: number; // Importance 1-10
  readonly checkMethod: string;
}

export interface WorkflowRecommendation {
  readonly action: string;
  readonly priority: 'HIGH' | 'MEDIUM' | 'LOW';
  readonly estimatedTime: string;
  readonly assignTo: 'DESIGNER' | 'TECHNICIAN' | 'QC_INSPECTOR' | 'CLINICIAN';
}

// ============================================================================
// CAD/CAM WORKFLOW SERVICE
// ============================================================================

/**
 * Validates a CAD design before fabrication
 */
export function validateDesign(labCase: LabCase, design: CADDesign): DesignValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if design matches prescription
  if (labCase.prosthetics.length === 0) {
    errors.push('No prosthetic specifications in case');
  }

  // Check material compatibility
  for (const prosthetic of labCase.prosthetics) {
    const props = MATERIAL_PROPERTIES[prosthetic.material];
    if (props?.contraindicatedFor.includes(prosthetic.type)) {
      errors.push(`Material ${prosthetic.material} is contraindicated for ${prosthetic.type}`);
    }
  }

  // Check for required scans
  if (labCase.scans.length === 0) {
    errors.push('No digital scans uploaded for case');
  }

  // Check design revision history
  if (design.revisionNumber > 3) {
    warnings.push('Design has undergone multiple revisions - consider case review');
  }

  // Check for implant cases
  if (labCase.implantComponents && labCase.implantComponents.length > 0) {
    const hasImplantScan = labCase.scans.some(
      (s) => s.scanType === 'CBCT' || s.scanType === 'MODEL'
    );
    if (!hasImplantScan) {
      warnings.push('Implant case may require CBCT scan for accurate positioning');
    }
  }

  const score = calculateDesignScore(errors.length, warnings.length);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    score,
  };
}

function calculateDesignScore(errorCount: number, warningCount: number): number {
  const baseScore = 100;
  const errorPenalty = errorCount * 25;
  const warningPenalty = warningCount * 5;
  return Math.max(0, baseScore - errorPenalty - warningPenalty);
}

/**
 * Calculates milling parameters based on material and prosthetic type
 */
export function calculateMillingParameters(
  material: ProstheticMaterial,
  prostheticType: ProstheticType,
  unitCount: number
): MillingParameters {
  // Material properties are available for future extensibility
  // const props = MATERIAL_PROPERTIES[material];

  // Base time per unit (minutes)
  const baseTimePerUnit: Record<string, number> = {
    CROWN: 25,
    BRIDGE: 35,
    VENEER: 20,
    INLAY: 15,
    ONLAY: 18,
    IMPLANT_CROWN: 30,
    IMPLANT_ABUTMENT: 40,
  };

  const baseTime = baseTimePerUnit[prostheticType] ?? 30;
  const estimatedTimeMinutes = baseTime * unitCount;

  // Determine milling strategy
  const wetMaterials: ProstheticMaterial[] = ['TITANIUM', 'COBALT_CHROME', 'PEEK'];
  const strategy = wetMaterials.includes(material) ? 'WET' : 'DRY';

  // Zirconia-specific settings
  const isZirconia = material.startsWith('ZIRCONIA');
  const shrinkageFactor = isZirconia ? 1.25 : undefined; // 25% shrinkage compensation
  const sinteringRequired = isZirconia;

  return {
    material,
    strategy,
    toolPaths: generateToolPaths(prostheticType),
    estimatedTimeMinutes,
    shrinkageFactor,
    sinteringRequired,
    sinteringProfile: isZirconia ? 'STANDARD_1530C' : undefined,
  };
}

function generateToolPaths(prostheticType: ProstheticType): readonly string[] {
  const commonPaths = ['ROUGHING', 'SEMI_FINISHING', 'FINISHING'];

  const additionalPaths: Record<string, readonly string[]> = {
    CROWN: [...commonPaths, 'MARGIN_DETAIL', 'OCCLUSAL_DETAIL'],
    BRIDGE: [...commonPaths, 'CONNECTOR_DETAIL', 'PONTIC_DETAIL'],
    VENEER: ['ROUGHING', 'FINISHING', 'INTAGLIO_DETAIL'],
    IMPLANT_ABUTMENT: [...commonPaths, 'SCREW_CHANNEL', 'MARGIN_CHAMFER'],
  };

  return additionalPaths[prostheticType] ?? commonPaths;
}

/**
 * Generates QC checklist based on prosthetic type
 */
export function generateQCChecklist(prostheticType: ProstheticType): readonly QCChecklistItem[] {
  const baseChecklist: QCChecklistItem[] = [
    {
      criterion: 'Marginal adaptation < 50μm',
      category: 'MARGINAL_FIT',
      weight: 10,
      checkMethod: 'Explorer and magnification (10x)',
    },
    {
      criterion: 'Proximal contacts appropriate',
      category: 'CONTACTS',
      weight: 8,
      checkMethod: 'Dental floss resistance test',
    },
    {
      criterion: 'Surface finish smooth and polished',
      category: 'SURFACE',
      weight: 6,
      checkMethod: 'Visual inspection under light',
    },
    {
      criterion: 'Shade match within acceptable range',
      category: 'SHADE',
      weight: 7,
      checkMethod: 'VITA shade guide comparison',
    },
  ];

  // Type-specific criteria
  const typeSpecific: Partial<Record<ProstheticType, QCChecklistItem[]>> = {
    CROWN: [
      {
        criterion: 'Occlusal anatomy accurate',
        category: 'ANATOMY',
        weight: 8,
        checkMethod: 'Articulating paper on model',
      },
      {
        criterion: 'Emergence profile natural',
        category: 'ANATOMY',
        weight: 6,
        checkMethod: 'Visual inspection from buccal',
      },
    ],
    IMPLANT_CROWN: [
      {
        criterion: 'Screw access hole positioned correctly',
        category: 'ANATOMY',
        weight: 10,
        checkMethod: 'Verify against prescription',
      },
      {
        criterion: 'Passive fit on abutment',
        category: 'MARGINAL_FIT',
        weight: 10,
        checkMethod: 'Sheffield test with single screw',
      },
    ],
    VENEER: [
      {
        criterion: 'Intaglio surface fit',
        category: 'MARGINAL_FIT',
        weight: 9,
        checkMethod: 'Fit checker on die',
      },
      {
        criterion: 'Translucency appropriate',
        category: 'SHADE',
        weight: 8,
        checkMethod: 'Backlight test',
      },
    ],
  };

  return [...baseChecklist, ...(typeSpecific[prostheticType] ?? [])];
}

/**
 * Calculates QC score from inspection results
 */
export function calculateQCScore(
  checklist: readonly QCChecklistItem[],
  results: readonly { criterion: string; passed: boolean }[]
): number {
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const item of checklist) {
    totalWeight += item.weight;
    const result = results.find((r) => r.criterion === item.criterion);
    if (result?.passed) {
      earnedWeight += item.weight;
    }
  }

  return totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
}

/**
 * Gets workflow recommendations based on current case state
 */
export function getWorkflowRecommendations(labCase: LabCase): readonly WorkflowRecommendation[] {
  const recommendations: WorkflowRecommendation[] = [];
  const status = labCase.status;

  switch (status) {
    case 'RECEIVED':
      recommendations.push({
        action: 'Upload digital impression files',
        priority: 'HIGH',
        estimatedTime: '10-30 min',
        assignTo: 'TECHNICIAN',
      });
      break;

    case 'SCAN_RECEIVED':
      recommendations.push({
        action: 'Begin CAD design',
        priority: 'HIGH',
        estimatedTime: '2-4 hours',
        assignTo: 'DESIGNER',
      });
      if (labCase.scans.some((s) => s.quality === 'POOR')) {
        recommendations.push({
          action: 'Request new scan - quality insufficient',
          priority: 'HIGH',
          estimatedTime: 'N/A',
          assignTo: 'CLINICIAN',
        });
      }
      break;

    case 'DESIGN_REVIEW':
      recommendations.push({
        action: 'Review and approve CAD design',
        priority: 'HIGH',
        estimatedTime: '15-30 min',
        assignTo: 'CLINICIAN',
      });
      break;

    case 'DESIGN_APPROVED':
      recommendations.push({
        action: 'Queue for milling/fabrication',
        priority: 'HIGH',
        estimatedTime: '5 min',
        assignTo: 'TECHNICIAN',
      });
      break;

    case 'QC_FAILED': {
      const lastQC = labCase.qcInspections[labCase.qcInspections.length - 1];
      if (lastQC && lastQC.overallScore < 50) {
        recommendations.push({
          action: 'Case requires complete remake',
          priority: 'HIGH',
          estimatedTime: '4-8 hours',
          assignTo: 'DESIGNER',
        });
      } else {
        recommendations.push({
          action: 'Minor adjustments needed',
          priority: 'MEDIUM',
          estimatedTime: '1-2 hours',
          assignTo: 'TECHNICIAN',
        });
      }
      break;
    }

    case 'ADJUSTMENT_REQUIRED':
      recommendations.push({
        action: 'Process adjustment requests from try-in',
        priority: 'HIGH',
        estimatedTime: '1-4 hours',
        assignTo: 'TECHNICIAN',
      });
      break;

    // Cases that don't require specific workflow recommendations
    case 'PENDING_SCAN':
    case 'IN_DESIGN':
    case 'DESIGN_REVISION':
    case 'QUEUED_FOR_MILLING':
    case 'MILLING':
    case 'POST_PROCESSING':
    case 'FINISHING':
    case 'QC_INSPECTION':
    case 'QC_PASSED':
    case 'READY_FOR_PICKUP':
    case 'IN_TRANSIT':
    case 'DELIVERED':
    case 'TRY_IN_SCHEDULED':
    case 'ADJUSTMENT_IN_PROGRESS':
    case 'COMPLETED':
    case 'CANCELLED':
    case 'ON_HOLD':
      // These statuses are in progress or terminal - no immediate action needed
      break;
  }

  // Check SLA
  if (new Date() > labCase.currentSLADeadline) {
    recommendations.unshift({
      action: 'URGENT: Case is past SLA deadline',
      priority: 'HIGH',
      estimatedTime: 'ASAP',
      assignTo: 'TECHNICIAN',
    });
  }

  return recommendations;
}

/**
 * Processes a case through the design approval workflow
 */
export function approveAndQueueForFabrication(labCase: LabCase, approvedBy: string): LabCase {
  // First approve the design
  let updatedCase = labCase;
  const currentDesign = labCase.designs.find((d) => d.id === labCase.currentDesignId);

  if (currentDesign && !currentDesign.approvedAt) {
    const now = new Date();
    const approvedDesign: CADDesign = {
      ...currentDesign,
      approvedBy,
      approvedAt: now,
    };
    updatedCase = {
      ...updatedCase,
      designs: updatedCase.designs.map((d) => (d.id === currentDesign.id ? approvedDesign : d)),
    };
  }

  // Transition to approved status
  updatedCase = transitionStatus(updatedCase, 'DESIGN_APPROVED', approvedBy, 'Design approved');

  // Queue for milling
  updatedCase = transitionStatus(
    updatedCase,
    'QUEUED_FOR_MILLING',
    approvedBy,
    'Queued for fabrication'
  );

  return updatedCase;
}

/**
 * Estimates turnaround time based on case complexity
 */
export function estimateTurnaroundDays(labCase: LabCase): number {
  let baseDays = 5; // Standard turnaround

  // Add complexity factors
  const unitCount = labCase.prosthetics.reduce((sum, p) => sum + p.toothNumbers.length, 0);
  if (unitCount > 6) baseDays += 2;
  if (unitCount > 12) baseDays += 3;

  // Material complexity
  const hasZirconia = labCase.prosthetics.some((p) => p.material.startsWith('ZIRCONIA'));
  if (hasZirconia) baseDays += 1; // Sintering time

  // Implant complexity
  if (labCase.implantComponents && labCase.implantComponents.length > 0) {
    baseDays += 2;
  }

  // Priority adjustment
  switch (labCase.priority) {
    case 'STANDARD':
      // No adjustment for standard priority
      break;
    case 'RUSH':
      baseDays = Math.ceil(baseDays * 0.6);
      break;
    case 'EMERGENCY':
      baseDays = Math.max(2, Math.ceil(baseDays * 0.4));
      break;
    case 'VIP':
      baseDays = Math.ceil(baseDays * 0.75);
      break;
  }

  return baseDays;
}
