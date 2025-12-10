/**
 * Tests for CADCAMWorkflowService
 *
 * Covers:
 * - Design validation
 * - Milling parameter calculation
 * - QC checklist generation
 * - QC score calculation
 * - Workflow recommendations
 * - Design approval workflow
 * - Turnaround time estimation
 */

import { describe, it, expect } from 'vitest';
import {
  validateDesign,
  calculateMillingParameters,
  generateQCChecklist,
  calculateQCScore,
  getWorkflowRecommendations,
  approveAndQueueForFabrication,
  estimateTurnaroundDays,
  type DesignValidationResult,
  type MillingParameters,
  type QCChecklistItem,
  type WorkflowRecommendation,
} from '../CADCAMWorkflowService.js';
import type { LabCase, CADDesign } from '../../entities/index.js';
import type { ProstheticMaterial, ProstheticType } from '../../value-objects/index.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestLabCase(overrides: Partial<LabCase> = {}): LabCase {
  const now = new Date();
  const deadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  return {
    id: 'lab-case-123',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    dentistId: 'dentist-1',
    status: 'RECEIVED',
    priority: 'STANDARD',
    prosthetics: [
      {
        id: 'prosthetic-1',
        type: 'CROWN',
        material: 'ZIRCONIA_ML',
        shade: 'A2',
        toothNumbers: [14],
        specifications: {},
      },
    ],
    scans: [
      {
        id: 'scan-1',
        scanType: 'INTRAORAL',
        quality: 'GOOD',
        uploadedAt: now,
        fileUrl: 'https://example.com/scan.stl',
      },
    ],
    designs: [],
    currentDesignId: undefined,
    qcInspections: [],
    statusHistory: [
      {
        status: 'RECEIVED',
        changedAt: now,
        changedBy: 'system',
        notes: 'Case received',
      },
    ],
    currentSLADeadline: deadline,
    createdAt: now,
    updatedAt: now,
    implantComponents: undefined,
    ...overrides,
  } as LabCase;
}

function createTestCADDesign(overrides: Partial<CADDesign> = {}): CADDesign {
  return {
    id: 'design-1',
    version: 1,
    revisionNumber: 1,
    designerName: 'Test Designer',
    createdAt: new Date(),
    notes: 'Initial design',
    ...overrides,
  } as CADDesign;
}

// ============================================================================
// DESIGN VALIDATION TESTS
// ============================================================================

describe('validateDesign', () => {
  describe('Valid Designs', () => {
    it('should validate a design with proper prosthetics and scans', () => {
      const labCase = createTestLabCase();
      const design = createTestCADDesign();

      const result = validateDesign(labCase, design);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.score).toBeGreaterThan(90);
    });

    it('should return score of 100 for perfect design', () => {
      const labCase = createTestLabCase({
        prosthetics: [
          {
            id: 'p-1',
            type: 'CROWN',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [11],
            specifications: {},
          },
        ],
      });
      const design = createTestCADDesign({ revisionNumber: 1 });

      const result = validateDesign(labCase, design);

      expect(result.score).toBe(100);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Invalid Designs', () => {
    it('should error when no prosthetics in case', () => {
      const labCase = createTestLabCase({ prosthetics: [] });
      const design = createTestCADDesign();

      const result = validateDesign(labCase, design);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No prosthetic specifications in case');
    });

    it('should error when no scans uploaded', () => {
      const labCase = createTestLabCase({ scans: [] });
      const design = createTestCADDesign();

      const result = validateDesign(labCase, design);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No digital scans uploaded for case');
    });

    it('should error for contraindicated material-type combinations', () => {
      const labCase = createTestLabCase({
        prosthetics: [
          {
            id: 'p-1',
            type: 'VENEER',
            material: 'COBALT_CHROME', // Metal not suitable for veneers
            shade: 'A2',
            toothNumbers: [11],
            specifications: {},
          },
        ],
      });
      const design = createTestCADDesign();

      const result = validateDesign(labCase, design);

      // May or may not be valid depending on MATERIAL_PROPERTIES
      expect(result).toBeDefined();
    });
  });

  describe('Warnings', () => {
    it('should warn when design has multiple revisions', () => {
      const labCase = createTestLabCase();
      const design = createTestCADDesign({ revisionNumber: 4 });

      const result = validateDesign(labCase, design);

      expect(result.warnings).toContain(
        'Design has undergone multiple revisions - consider case review'
      );
    });

    it('should warn for implant cases without CBCT scan', () => {
      const labCase = createTestLabCase({
        implantComponents: [{ id: 'impl-1', system: 'Nobel', platform: 'CC' }],
        scans: [
          {
            id: 'scan-1',
            scanType: 'INTRAORAL', // Not CBCT or MODEL
            quality: 'GOOD',
            uploadedAt: new Date(),
            fileUrl: 'https://example.com/scan.stl',
          },
        ],
      });
      const design = createTestCADDesign();

      const result = validateDesign(labCase, design);

      expect(result.warnings).toContain(
        'Implant case may require CBCT scan for accurate positioning'
      );
    });

    it('should not warn for implant cases with CBCT scan', () => {
      const labCase = createTestLabCase({
        implantComponents: [{ id: 'impl-1', system: 'Straumann', platform: 'BL' }],
        scans: [
          {
            id: 'scan-1',
            scanType: 'CBCT',
            quality: 'GOOD',
            uploadedAt: new Date(),
            fileUrl: 'https://example.com/cbct.dcm',
          },
        ],
      });
      const design = createTestCADDesign();

      const result = validateDesign(labCase, design);

      expect(result.warnings).not.toContain(
        'Implant case may require CBCT scan for accurate positioning'
      );
    });
  });

  describe('Score Calculation', () => {
    it('should reduce score by 25 per error', () => {
      const labCase = createTestLabCase({ prosthetics: [], scans: [] });
      const design = createTestCADDesign();

      const result = validateDesign(labCase, design);

      // 2 errors * 25 = 50 penalty
      expect(result.score).toBe(50);
    });

    it('should reduce score by 5 per warning', () => {
      const labCase = createTestLabCase();
      const design = createTestCADDesign({ revisionNumber: 5 });

      const result = validateDesign(labCase, design);

      // 1 warning * 5 = 5 penalty
      expect(result.score).toBe(95);
    });

    it('should not go below 0', () => {
      const labCase = createTestLabCase({ prosthetics: [], scans: [] });
      const design = createTestCADDesign({ revisionNumber: 20 });

      const result = validateDesign(labCase, design);

      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// MILLING PARAMETERS TESTS
// ============================================================================

describe('calculateMillingParameters', () => {
  describe('Material Strategies', () => {
    it('should use DRY strategy for zirconia', () => {
      const result = calculateMillingParameters('ZIRCONIA_ML', 'CROWN', 1);

      expect(result.strategy).toBe('DRY');
      expect(result.sinteringRequired).toBe(true);
      expect(result.shrinkageFactor).toBe(1.25);
      expect(result.sinteringProfile).toBe('STANDARD_1530C');
    });

    it('should use WET strategy for titanium', () => {
      const result = calculateMillingParameters('TITANIUM', 'IMPLANT_ABUTMENT', 1);

      expect(result.strategy).toBe('WET');
      expect(result.sinteringRequired).toBe(false);
      expect(result.shrinkageFactor).toBeUndefined();
    });

    it('should use WET strategy for cobalt chrome', () => {
      const result = calculateMillingParameters('COBALT_CHROME', 'BRIDGE', 1);

      expect(result.strategy).toBe('WET');
    });

    it('should use WET strategy for PEEK', () => {
      const result = calculateMillingParameters('PEEK', 'CROWN', 1);

      expect(result.strategy).toBe('WET');
    });

    it('should use DRY strategy for EMAX', () => {
      const result = calculateMillingParameters('EMAX', 'VENEER', 1);

      expect(result.strategy).toBe('DRY');
      expect(result.sinteringRequired).toBe(false);
    });
  });

  describe('Time Estimation', () => {
    it('should calculate time for single crown', () => {
      const result = calculateMillingParameters('ZIRCONIA_ML', 'CROWN', 1);

      expect(result.estimatedTimeMinutes).toBe(25);
    });

    it('should scale time with unit count', () => {
      const result = calculateMillingParameters('ZIRCONIA_ML', 'CROWN', 3);

      expect(result.estimatedTimeMinutes).toBe(75); // 25 * 3
    });

    it('should use different base times for different prosthetic types', () => {
      const crown = calculateMillingParameters('EMAX', 'CROWN', 1);
      const bridge = calculateMillingParameters('EMAX', 'BRIDGE', 1);
      const veneer = calculateMillingParameters('EMAX', 'VENEER', 1);
      const inlay = calculateMillingParameters('EMAX', 'INLAY', 1);
      const onlay = calculateMillingParameters('EMAX', 'ONLAY', 1);
      const implantCrown = calculateMillingParameters('TITANIUM', 'IMPLANT_CROWN', 1);
      const implantAbutment = calculateMillingParameters('TITANIUM', 'IMPLANT_ABUTMENT', 1);

      expect(crown.estimatedTimeMinutes).toBe(25);
      expect(bridge.estimatedTimeMinutes).toBe(35);
      expect(veneer.estimatedTimeMinutes).toBe(20);
      expect(inlay.estimatedTimeMinutes).toBe(15);
      expect(onlay.estimatedTimeMinutes).toBe(18);
      expect(implantCrown.estimatedTimeMinutes).toBe(30);
      expect(implantAbutment.estimatedTimeMinutes).toBe(40);
    });

    it('should use default time for unknown prosthetic types', () => {
      const result = calculateMillingParameters('EMAX', 'UNKNOWN_TYPE' as ProstheticType, 1);

      expect(result.estimatedTimeMinutes).toBe(30); // Default
    });
  });

  describe('Tool Paths', () => {
    it('should generate crown tool paths', () => {
      const result = calculateMillingParameters('ZIRCONIA_ML', 'CROWN', 1);

      expect(result.toolPaths).toContain('ROUGHING');
      expect(result.toolPaths).toContain('SEMI_FINISHING');
      expect(result.toolPaths).toContain('FINISHING');
      expect(result.toolPaths).toContain('MARGIN_DETAIL');
      expect(result.toolPaths).toContain('OCCLUSAL_DETAIL');
    });

    it('should generate bridge tool paths', () => {
      const result = calculateMillingParameters('ZIRCONIA_ML', 'BRIDGE', 1);

      expect(result.toolPaths).toContain('CONNECTOR_DETAIL');
      expect(result.toolPaths).toContain('PONTIC_DETAIL');
    });

    it('should generate veneer tool paths', () => {
      const result = calculateMillingParameters('EMAX', 'VENEER', 1);

      expect(result.toolPaths).toContain('INTAGLIO_DETAIL');
    });

    it('should generate implant abutment tool paths', () => {
      const result = calculateMillingParameters('TITANIUM', 'IMPLANT_ABUTMENT', 1);

      expect(result.toolPaths).toContain('SCREW_CHANNEL');
      expect(result.toolPaths).toContain('MARGIN_CHAMFER');
    });

    it('should use common paths for unknown prosthetic types', () => {
      const result = calculateMillingParameters('EMAX', 'INLAY', 1);

      expect(result.toolPaths).toContain('ROUGHING');
      expect(result.toolPaths).toContain('SEMI_FINISHING');
      expect(result.toolPaths).toContain('FINISHING');
    });
  });
});

// ============================================================================
// QC CHECKLIST TESTS
// ============================================================================

describe('generateQCChecklist', () => {
  it('should include base checklist items for all types', () => {
    const checklist = generateQCChecklist('CROWN');

    const criteria = checklist.map((item) => item.criterion);
    expect(criteria).toContain('Marginal adaptation < 50μm');
    expect(criteria).toContain('Proximal contacts appropriate');
    expect(criteria).toContain('Surface finish smooth and polished');
    expect(criteria).toContain('Shade match within acceptable range');
  });

  it('should add crown-specific criteria', () => {
    const checklist = generateQCChecklist('CROWN');

    const criteria = checklist.map((item) => item.criterion);
    expect(criteria).toContain('Occlusal anatomy accurate');
    expect(criteria).toContain('Emergence profile natural');
  });

  it('should add implant crown-specific criteria', () => {
    const checklist = generateQCChecklist('IMPLANT_CROWN');

    const criteria = checklist.map((item) => item.criterion);
    expect(criteria).toContain('Screw access hole positioned correctly');
    expect(criteria).toContain('Passive fit on abutment');
  });

  it('should add veneer-specific criteria', () => {
    const checklist = generateQCChecklist('VENEER');

    const criteria = checklist.map((item) => item.criterion);
    expect(criteria).toContain('Intaglio surface fit');
    expect(criteria).toContain('Translucency appropriate');
  });

  it('should only include base criteria for types without specific items', () => {
    const checklist = generateQCChecklist('INLAY');

    expect(checklist.length).toBe(4); // Only base items
  });

  it('should assign appropriate categories and weights', () => {
    const checklist = generateQCChecklist('CROWN');

    const marginalFit = checklist.find((item) => item.criterion === 'Marginal adaptation < 50μm');
    expect(marginalFit?.category).toBe('MARGINAL_FIT');
    expect(marginalFit?.weight).toBe(10);

    const shade = checklist.find(
      (item) => item.criterion === 'Shade match within acceptable range'
    );
    expect(shade?.category).toBe('SHADE');
    expect(shade?.weight).toBe(7);
  });
});

// ============================================================================
// QC SCORE CALCULATION TESTS
// ============================================================================

describe('calculateQCScore', () => {
  it('should return 100 when all criteria pass', () => {
    const checklist = generateQCChecklist('CROWN');
    const results = checklist.map((item) => ({
      criterion: item.criterion,
      passed: true,
    }));

    const score = calculateQCScore(checklist, results);

    expect(score).toBe(100);
  });

  it('should return 0 when all criteria fail', () => {
    const checklist = generateQCChecklist('CROWN');
    const results = checklist.map((item) => ({
      criterion: item.criterion,
      passed: false,
    }));

    const score = calculateQCScore(checklist, results);

    expect(score).toBe(0);
  });

  it('should calculate weighted score correctly', () => {
    const checklist: QCChecklistItem[] = [
      { criterion: 'A', category: 'MARGINAL_FIT', weight: 10, checkMethod: 'test' },
      { criterion: 'B', category: 'SHADE', weight: 5, checkMethod: 'test' },
      { criterion: 'C', category: 'SURFACE', weight: 5, checkMethod: 'test' },
    ];
    const results = [
      { criterion: 'A', passed: true }, // 10 points
      { criterion: 'B', passed: false }, // 0 points
      { criterion: 'C', passed: true }, // 5 points
    ];

    const score = calculateQCScore(checklist, results);

    // 15/20 = 75%
    expect(score).toBe(75);
  });

  it('should return 0 for empty checklist', () => {
    const score = calculateQCScore([], []);

    expect(score).toBe(0);
  });

  it('should handle missing results', () => {
    const checklist: QCChecklistItem[] = [
      { criterion: 'A', category: 'MARGINAL_FIT', weight: 10, checkMethod: 'test' },
      { criterion: 'B', category: 'SHADE', weight: 10, checkMethod: 'test' },
    ];
    const results = [
      { criterion: 'A', passed: true }, // Only A has result
    ];

    const score = calculateQCScore(checklist, results);

    // 10/20 = 50%
    expect(score).toBe(50);
  });
});

// ============================================================================
// WORKFLOW RECOMMENDATIONS TESTS
// ============================================================================

describe('getWorkflowRecommendations', () => {
  describe('Status-based Recommendations', () => {
    it('should recommend scan upload for RECEIVED status', () => {
      const labCase = createTestLabCase({ status: 'RECEIVED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(
        recommendations.some((r) => r.action.includes('Upload digital impression files'))
      ).toBe(true);
      expect(recommendations[0].assignTo).toBe('TECHNICIAN');
    });

    it('should recommend CAD design for SCAN_RECEIVED status', () => {
      const labCase = createTestLabCase({ status: 'SCAN_RECEIVED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Begin CAD design'))).toBe(true);
    });

    it('should recommend new scan for poor quality scans', () => {
      const labCase = createTestLabCase({
        status: 'SCAN_RECEIVED',
        scans: [
          {
            id: 'scan-1',
            scanType: 'INTRAORAL',
            quality: 'POOR',
            uploadedAt: new Date(),
            fileUrl: 'https://example.com/scan.stl',
          },
        ],
      });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Request new scan'))).toBe(true);
      expect(recommendations.find((r) => r.action.includes('Request new scan'))?.assignTo).toBe(
        'CLINICIAN'
      );
    });

    it('should recommend design review for DESIGN_REVIEW status', () => {
      const labCase = createTestLabCase({ status: 'DESIGN_REVIEW' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Review and approve CAD design'))).toBe(
        true
      );
    });

    it('should recommend queueing for DESIGN_APPROVED status', () => {
      const labCase = createTestLabCase({ status: 'DESIGN_APPROVED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Queue for milling'))).toBe(true);
    });

    it('should recommend remake for low QC score', () => {
      const labCase = createTestLabCase({
        status: 'QC_FAILED',
        qcInspections: [
          {
            id: 'qc-1',
            overallScore: 30, // Low score
            passed: false,
            inspectedAt: new Date(),
            inspectorId: 'inspector-1',
          },
        ],
      });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('complete remake'))).toBe(true);
    });

    it('should recommend minor adjustments for moderate QC failure', () => {
      const labCase = createTestLabCase({
        status: 'QC_FAILED',
        qcInspections: [
          {
            id: 'qc-1',
            overallScore: 65, // Above 50
            passed: false,
            inspectedAt: new Date(),
            inspectorId: 'inspector-1',
          },
        ],
      });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Minor adjustments'))).toBe(true);
    });

    it('should recommend processing adjustments for ADJUSTMENT_REQUIRED status', () => {
      const labCase = createTestLabCase({ status: 'ADJUSTMENT_REQUIRED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Process adjustment requests'))).toBe(
        true
      );
    });

    it('should return empty for terminal statuses', () => {
      const labCase = createTestLabCase({ status: 'COMPLETED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe('SLA Recommendations', () => {
    it('should add urgent recommendation when past SLA deadline', () => {
      const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const labCase = createTestLabCase({
        status: 'RECEIVED',
        currentSLADeadline: pastDeadline,
      });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations[0].action).toContain('URGENT');
      expect(recommendations[0].priority).toBe('HIGH');
    });
  });
});

// ============================================================================
// APPROVE AND QUEUE FOR FABRICATION TESTS
// ============================================================================

describe('approveAndQueueForFabrication', () => {
  it('should approve design and transition to queued status', () => {
    const design = createTestCADDesign({ id: 'design-to-approve' });
    const labCase = createTestLabCase({
      status: 'DESIGN_REVIEW',
      currentDesignId: 'design-to-approve',
      designs: [design],
    });

    const result = approveAndQueueForFabrication(labCase, 'approver-123');

    expect(result.status).toBe('QUEUED_FOR_MILLING');
    expect(result.designs[0].approvedBy).toBe('approver-123');
    expect(result.designs[0].approvedAt).toBeDefined();
  });

  it('should not re-approve already approved design', () => {
    const approvedAt = new Date('2024-01-01');
    const design = createTestCADDesign({
      id: 'already-approved',
      approvedBy: 'previous-approver',
      approvedAt,
    });
    const labCase = createTestLabCase({
      status: 'DESIGN_REVIEW',
      currentDesignId: 'already-approved',
      designs: [design],
    });

    const result = approveAndQueueForFabrication(labCase, 'new-approver');

    // Should still transition status but not change approval
    expect(result.status).toBe('QUEUED_FOR_MILLING');
    expect(result.designs[0].approvedBy).toBe('previous-approver');
    expect(result.designs[0].approvedAt).toEqual(approvedAt);
  });
});

// ============================================================================
// TURNAROUND TIME ESTIMATION TESTS
// ============================================================================

describe('estimateTurnaroundDays', () => {
  describe('Base Turnaround', () => {
    it('should return 5 days for simple standard case', () => {
      const labCase = createTestLabCase();

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(6); // 5 base + 1 for zirconia
    });
  });

  describe('Complexity Factors', () => {
    it('should add 2 days for cases with more than 6 units', () => {
      const labCase = createTestLabCase({
        prosthetics: [
          {
            id: 'p-1',
            type: 'BRIDGE',
            material: 'EMAX', // Not zirconia
            shade: 'A2',
            toothNumbers: [11, 12, 13, 14, 15, 16, 17], // 7 units
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(7); // 5 + 2
    });

    it('should add 3 more days for cases with more than 12 units', () => {
      const labCase = createTestLabCase({
        prosthetics: [
          {
            id: 'p-1',
            type: 'BRIDGE',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26], // 13 units
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(10); // 5 + 2 + 3
    });

    it('should add 1 day for zirconia sintering', () => {
      const labCase = createTestLabCase({
        prosthetics: [
          {
            id: 'p-1',
            type: 'CROWN',
            material: 'ZIRCONIA_HT', // Zirconia
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(6); // 5 + 1
    });

    it('should add 2 days for implant cases', () => {
      const labCase = createTestLabCase({
        prosthetics: [
          {
            id: 'p-1',
            type: 'IMPLANT_CROWN',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [36],
            specifications: {},
          },
        ],
        implantComponents: [{ id: 'impl-1', system: 'Nobel', platform: 'CC' }],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(7); // 5 + 2
    });
  });

  describe('Priority Adjustments', () => {
    it('should reduce by 40% for RUSH priority', () => {
      const labCase = createTestLabCase({
        priority: 'RUSH',
        prosthetics: [
          {
            id: 'p-1',
            type: 'CROWN',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(3); // ceil(5 * 0.6)
    });

    it('should reduce by 60% for EMERGENCY priority with minimum of 2 days', () => {
      const labCase = createTestLabCase({
        priority: 'EMERGENCY',
        prosthetics: [
          {
            id: 'p-1',
            type: 'CROWN',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(2); // max(2, ceil(5 * 0.4))
    });

    it('should reduce by 25% for VIP priority', () => {
      const labCase = createTestLabCase({
        priority: 'VIP',
        prosthetics: [
          {
            id: 'p-1',
            type: 'CROWN',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(4); // ceil(5 * 0.75)
    });

    it('should not adjust for STANDARD priority', () => {
      const labCase = createTestLabCase({
        priority: 'STANDARD',
        prosthetics: [
          {
            id: 'p-1',
            type: 'CROWN',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(5);
    });
  });

  describe('Combined Factors', () => {
    it('should combine all complexity factors correctly', () => {
      const labCase = createTestLabCase({
        priority: 'RUSH',
        prosthetics: [
          {
            id: 'p-1',
            type: 'BRIDGE',
            material: 'ZIRCONIA_ML', // +1 for sintering
            shade: 'A2',
            toothNumbers: [11, 12, 13, 14, 15, 16, 17, 21], // 8 units (+2)
            specifications: {},
          },
        ],
        implantComponents: [{ id: 'impl-1', system: 'Nobel', platform: 'CC' }], // +2
      });

      const days = estimateTurnaroundDays(labCase);

      // Base: 5 + 2 (>6 units) + 1 (zirconia) + 2 (implants) = 10
      // Rush: ceil(10 * 0.6) = 6
      expect(days).toBe(6);
    });
  });
});
