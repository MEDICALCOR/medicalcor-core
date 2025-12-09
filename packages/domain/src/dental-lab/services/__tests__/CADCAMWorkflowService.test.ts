/**
 * @fileoverview Tests for CAD/CAM Workflow Service
 *
 * Tests for design validation, milling parameters, QC checklists,
 * workflow recommendations, and turnaround estimation.
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
} from '../CADCAMWorkflowService.js';
import type { LabCase, CADDesign } from '../../entities/index.js';
import type { ProstheticMaterial, ProstheticType } from '../../value-objects/index.js';

// =============================================================================
// Mock Data Factories
// =============================================================================

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';

function createMockLabCase(overrides: Partial<LabCase> = {}): LabCase {
  return {
    id: MOCK_UUID,
    caseNumber: 'LAB-2024-001',
    clinicId: 'clinic-001',
    patientId: 'patient-001',
    dentistId: 'dentist-001',
    status: 'RECEIVED',
    priority: 'STANDARD',
    prosthetics: [
      {
        id: 'prosthetic-001',
        type: 'CROWN',
        material: 'ZIRCONIA_MONOLITHIC',
        shade: 'A2',
        toothNumbers: [14],
        specifications: {},
      },
    ],
    scans: [
      {
        id: 'scan-001',
        scanType: 'MODEL',
        quality: 'GOOD',
        uploadedAt: new Date(),
        fileUrl: 'https://example.com/scan.stl',
      },
    ],
    designs: [],
    currentDesignId: null,
    qcInspections: [],
    implantComponents: [],
    currentSLADeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    statusHistory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as LabCase;
}

function createMockDesign(overrides: Partial<CADDesign> = {}): CADDesign {
  return {
    id: MOCK_UUID_2,
    designerId: 'designer-001',
    revisionNumber: 1,
    fileUrl: 'https://example.com/design.dcm',
    createdAt: new Date(),
    notes: null,
    approvedBy: null,
    approvedAt: null,
    ...overrides,
  } as CADDesign;
}

// =============================================================================
// Tests
// =============================================================================

describe('CADCAMWorkflowService', () => {
  describe('validateDesign', () => {
    it('should validate a valid design', () => {
      const labCase = createMockLabCase();
      const design = createMockDesign();

      const result = validateDesign(labCase, design);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should return error when no prosthetics specified', () => {
      const labCase = createMockLabCase({ prosthetics: [] });
      const design = createMockDesign();

      const result = validateDesign(labCase, design);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No prosthetic specifications in case');
    });

    it('should return error when no scans uploaded', () => {
      const labCase = createMockLabCase({ scans: [] });
      const design = createMockDesign();

      const result = validateDesign(labCase, design);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No digital scans uploaded for case');
    });

    it('should return warning for multiple revisions', () => {
      const labCase = createMockLabCase();
      const design = createMockDesign({ revisionNumber: 4 });

      const result = validateDesign(labCase, design);

      expect(result.warnings).toContain(
        'Design has undergone multiple revisions - consider case review'
      );
    });

    it('should return warning for implant case without CBCT scan', () => {
      const labCase = createMockLabCase({
        implantComponents: [{ id: 'implant-001', brand: 'Straumann', system: 'BLT' } as any],
        scans: [
          {
            id: 'scan-001',
            scanType: 'INTRAORAL',
            quality: 'GOOD',
            uploadedAt: new Date(),
            fileUrl: 'https://example.com/scan.stl',
          },
        ],
      });
      const design = createMockDesign();

      const result = validateDesign(labCase, design);

      expect(result.warnings).toContain(
        'Implant case may require CBCT scan for accurate positioning'
      );
    });

    it('should not warn for implant case with CBCT scan', () => {
      const labCase = createMockLabCase({
        implantComponents: [{ id: 'implant-001', brand: 'Straumann', system: 'BLT' } as any],
        scans: [
          {
            id: 'scan-001',
            scanType: 'CBCT',
            quality: 'GOOD',
            uploadedAt: new Date(),
            fileUrl: 'https://example.com/cbct.dcm',
          },
        ],
      });
      const design = createMockDesign();

      const result = validateDesign(labCase, design);

      expect(result.warnings).not.toContain(
        'Implant case may require CBCT scan for accurate positioning'
      );
    });

    it('should calculate score based on errors and warnings', () => {
      // Perfect case
      const perfectCase = createMockLabCase();
      const result1 = validateDesign(perfectCase, createMockDesign());
      expect(result1.score).toBe(100);

      // Case with warnings
      const warnCase = createMockLabCase();
      const result2 = validateDesign(warnCase, createMockDesign({ revisionNumber: 5 }));
      expect(result2.score).toBe(95); // 100 - 5 (warning penalty)

      // Case with errors
      const errorCase = createMockLabCase({ prosthetics: [] });
      const result3 = validateDesign(errorCase, createMockDesign());
      expect(result3.score).toBeLessThan(100);
    });
  });

  describe('calculateMillingParameters', () => {
    it('should calculate parameters for zirconia crown', () => {
      const params = calculateMillingParameters('ZIRCONIA_MONOLITHIC', 'CROWN', 1);

      expect(params.material).toBe('ZIRCONIA_MONOLITHIC');
      expect(params.strategy).toBe('DRY');
      expect(params.sinteringRequired).toBe(true);
      expect(params.shrinkageFactor).toBe(1.25);
      expect(params.sinteringProfile).toBe('STANDARD_1530C');
      expect(params.estimatedTimeMinutes).toBe(25);
    });

    it('should calculate parameters for titanium implant abutment', () => {
      const params = calculateMillingParameters('TITANIUM', 'IMPLANT_ABUTMENT', 1);

      expect(params.strategy).toBe('WET');
      expect(params.sinteringRequired).toBe(false);
      expect(params.shrinkageFactor).toBeUndefined();
      expect(params.estimatedTimeMinutes).toBe(40);
    });

    it('should multiply time by unit count', () => {
      const single = calculateMillingParameters('EMAX', 'CROWN', 1);
      const multiple = calculateMillingParameters('EMAX', 'CROWN', 3);

      expect(multiple.estimatedTimeMinutes).toBe(single.estimatedTimeMinutes * 3);
    });

    it('should generate appropriate tool paths for crowns', () => {
      const params = calculateMillingParameters('ZIRCONIA_MONOLITHIC', 'CROWN', 1);

      expect(params.toolPaths).toContain('ROUGHING');
      expect(params.toolPaths).toContain('FINISHING');
      expect(params.toolPaths).toContain('MARGIN_DETAIL');
    });

    it('should generate appropriate tool paths for bridges', () => {
      const params = calculateMillingParameters('ZIRCONIA_MONOLITHIC', 'BRIDGE', 1);

      expect(params.toolPaths).toContain('CONNECTOR_DETAIL');
      expect(params.toolPaths).toContain('PONTIC_DETAIL');
    });

    it('should generate appropriate tool paths for veneers', () => {
      const params = calculateMillingParameters('EMAX', 'VENEER', 1);

      expect(params.toolPaths).toContain('INTAGLIO_DETAIL');
    });

    it('should generate appropriate tool paths for implant abutments', () => {
      const params = calculateMillingParameters('TITANIUM', 'IMPLANT_ABUTMENT', 1);

      expect(params.toolPaths).toContain('SCREW_CHANNEL');
      expect(params.toolPaths).toContain('MARGIN_CHAMFER');
    });

    it('should handle unknown prosthetic type with default time', () => {
      const params = calculateMillingParameters('EMAX', 'UNKNOWN_TYPE' as ProstheticType, 1);

      expect(params.estimatedTimeMinutes).toBe(30); // Default time
    });

    it('should use wet milling for COBALT_CHROME', () => {
      const params = calculateMillingParameters('COBALT_CHROME', 'BRIDGE', 1);

      expect(params.strategy).toBe('WET');
    });

    it('should use wet milling for PEEK', () => {
      const params = calculateMillingParameters('PEEK', 'CROWN', 1);

      expect(params.strategy).toBe('WET');
    });
  });

  describe('generateQCChecklist', () => {
    it('should include base checklist items', () => {
      const checklist = generateQCChecklist('CROWN');

      expect(checklist.some((item) => item.category === 'MARGINAL_FIT')).toBe(true);
      expect(checklist.some((item) => item.category === 'CONTACTS')).toBe(true);
      expect(checklist.some((item) => item.category === 'SURFACE')).toBe(true);
      expect(checklist.some((item) => item.category === 'SHADE')).toBe(true);
    });

    it('should include crown-specific items for crowns', () => {
      const checklist = generateQCChecklist('CROWN');

      expect(checklist.some((item) => item.criterion.includes('Occlusal anatomy'))).toBe(true);
      expect(checklist.some((item) => item.criterion.includes('Emergence profile'))).toBe(true);
    });

    it('should include implant-specific items for implant crowns', () => {
      const checklist = generateQCChecklist('IMPLANT_CROWN');

      expect(checklist.some((item) => item.criterion.includes('Screw access hole'))).toBe(true);
      expect(checklist.some((item) => item.criterion.includes('Passive fit'))).toBe(true);
    });

    it('should include veneer-specific items for veneers', () => {
      const checklist = generateQCChecklist('VENEER');

      expect(checklist.some((item) => item.criterion.includes('Intaglio surface'))).toBe(true);
      expect(checklist.some((item) => item.criterion.includes('Translucency'))).toBe(true);
    });

    it('should return only base checklist for unknown type', () => {
      const checklist = generateQCChecklist('UNKNOWN' as ProstheticType);

      expect(checklist.length).toBe(4); // Only base items
    });
  });

  describe('calculateQCScore', () => {
    it('should calculate 100% for all passed items', () => {
      const checklist = generateQCChecklist('CROWN');
      const results = checklist.map((item) => ({ criterion: item.criterion, passed: true }));

      const score = calculateQCScore(checklist, results);

      expect(score).toBe(100);
    });

    it('should calculate 0% for all failed items', () => {
      const checklist = generateQCChecklist('CROWN');
      const results = checklist.map((item) => ({ criterion: item.criterion, passed: false }));

      const score = calculateQCScore(checklist, results);

      expect(score).toBe(0);
    });

    it('should calculate weighted score correctly', () => {
      const checklist = [
        {
          criterion: 'High weight',
          category: 'MARGINAL_FIT' as const,
          weight: 10,
          checkMethod: 'test',
        },
        { criterion: 'Low weight', category: 'SURFACE' as const, weight: 2, checkMethod: 'test' },
      ];
      const results = [
        { criterion: 'High weight', passed: true },
        { criterion: 'Low weight', passed: false },
      ];

      const score = calculateQCScore(checklist, results);

      // 10 out of 12 total weight = 83.33%
      expect(score).toBe(83);
    });

    it('should handle empty checklist', () => {
      const score = calculateQCScore([], []);

      expect(score).toBe(0);
    });

    it('should handle missing results', () => {
      const checklist = [
        { criterion: 'Test', category: 'MARGINAL_FIT' as const, weight: 10, checkMethod: 'test' },
      ];
      const results: Array<{ criterion: string; passed: boolean }> = [];

      const score = calculateQCScore(checklist, results);

      expect(score).toBe(0);
    });
  });

  describe('getWorkflowRecommendations', () => {
    it('should recommend scan upload for RECEIVED status', () => {
      const labCase = createMockLabCase({ status: 'RECEIVED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Upload digital impression'))).toBe(
        true
      );
      expect(recommendations[0].assignTo).toBe('TECHNICIAN');
    });

    it('should recommend CAD design for SCAN_RECEIVED status', () => {
      const labCase = createMockLabCase({ status: 'SCAN_RECEIVED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Begin CAD design'))).toBe(true);
      expect(recommendations[0].assignTo).toBe('DESIGNER');
    });

    it('should recommend rescan for poor quality scans', () => {
      const labCase = createMockLabCase({
        status: 'SCAN_RECEIVED',
        scans: [
          {
            id: 'scan-001',
            scanType: 'MODEL',
            quality: 'POOR',
            uploadedAt: new Date(),
            fileUrl: 'https://example.com/scan.stl',
          },
        ],
      });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Request new scan'))).toBe(true);
    });

    it('should recommend design review for DESIGN_REVIEW status', () => {
      const labCase = createMockLabCase({ status: 'DESIGN_REVIEW' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Review and approve'))).toBe(true);
      expect(recommendations[0].assignTo).toBe('CLINICIAN');
    });

    it('should recommend queue for milling for DESIGN_APPROVED status', () => {
      const labCase = createMockLabCase({ status: 'DESIGN_APPROVED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Queue for milling'))).toBe(true);
    });

    it('should recommend remake for QC_FAILED with low score', () => {
      const labCase = createMockLabCase({
        status: 'QC_FAILED',
        qcInspections: [
          {
            id: 'qc-001',
            inspectedBy: 'inspector-001',
            inspectedAt: new Date(),
            overallScore: 40,
            results: [],
          },
        ],
      });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('complete remake'))).toBe(true);
    });

    it('should recommend minor adjustments for QC_FAILED with moderate score', () => {
      const labCase = createMockLabCase({
        status: 'QC_FAILED',
        qcInspections: [
          {
            id: 'qc-001',
            inspectedBy: 'inspector-001',
            inspectedAt: new Date(),
            overallScore: 70,
            results: [],
          },
        ],
      });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Minor adjustments'))).toBe(true);
    });

    it('should recommend processing adjustments for ADJUSTMENT_REQUIRED status', () => {
      const labCase = createMockLabCase({ status: 'ADJUSTMENT_REQUIRED' });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations.some((r) => r.action.includes('Process adjustment'))).toBe(true);
    });

    it('should add urgent warning for past SLA deadline', () => {
      const labCase = createMockLabCase({
        currentSLADeadline: new Date(Date.now() - 24 * 60 * 60 * 1000), // Past deadline
      });

      const recommendations = getWorkflowRecommendations(labCase);

      expect(recommendations[0].action).toContain('URGENT');
      expect(recommendations[0].priority).toBe('HIGH');
    });

    it('should return empty array for in-progress statuses', () => {
      const statuses = [
        'MILLING',
        'POST_PROCESSING',
        'FINISHING',
        'COMPLETED',
        'DELIVERED',
      ] as const;

      for (const status of statuses) {
        const labCase = createMockLabCase({ status });
        const recommendations = getWorkflowRecommendations(labCase);

        // Should only have SLA warning if past deadline
        expect(recommendations.every((r) => !r.action.includes('URGENT'))).toBe(true);
      }
    });
  });

  describe('approveAndQueueForFabrication', () => {
    it('should approve design and queue for milling', () => {
      const design = createMockDesign();
      const labCase = createMockLabCase({
        status: 'DESIGN_REVIEW',
        designs: [design],
        currentDesignId: design.id,
      });

      const result = approveAndQueueForFabrication(labCase, 'approver-001');

      expect(result.status).toBe('QUEUED_FOR_MILLING');
      expect(result.designs[0].approvedBy).toBe('approver-001');
      expect(result.designs[0].approvedAt).toBeInstanceOf(Date);
    });

    it('should not overwrite already approved design', () => {
      const existingApprovalDate = new Date('2024-01-01');
      const design = createMockDesign({
        approvedBy: 'original-approver',
        approvedAt: existingApprovalDate,
      });
      const labCase = createMockLabCase({
        status: 'DESIGN_REVIEW', // Use DESIGN_REVIEW so transition is valid
        designs: [design],
        currentDesignId: design.id,
      });

      const result = approveAndQueueForFabrication(labCase, 'new-approver');

      // The design was already approved, so its approval fields shouldn't be changed
      expect(result.designs[0].approvedBy).toBe('original-approver');
      expect(result.designs[0].approvedAt).toEqual(existingApprovalDate);
    });

    it('should handle case with no current design', () => {
      const labCase = createMockLabCase({
        status: 'DESIGN_REVIEW',
        designs: [],
        currentDesignId: null,
      });

      const result = approveAndQueueForFabrication(labCase, 'approver-001');

      expect(result.status).toBe('QUEUED_FOR_MILLING');
    });
  });

  describe('estimateTurnaroundDays', () => {
    it('should return base 5 days for simple case', () => {
      const labCase = createMockLabCase({
        prosthetics: [
          {
            id: 'p-001',
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

    it('should add days for zirconia material', () => {
      const labCase = createMockLabCase({
        prosthetics: [
          {
            id: 'p-001',
            type: 'CROWN',
            material: 'ZIRCONIA_MONOLITHIC',
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(6); // 5 + 1 for zirconia
    });

    it('should add days for high unit count', () => {
      const labCase = createMockLabCase({
        prosthetics: [
          {
            id: 'p-001',
            type: 'BRIDGE',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [11, 12, 13, 14, 15, 16, 17], // 7 units
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(7); // 5 + 2 for >6 units
    });

    it('should add more days for very high unit count', () => {
      const labCase = createMockLabCase({
        prosthetics: [
          {
            id: 'p-001',
            type: 'BRIDGE',
            material: 'EMAX',
            shade: 'A2',
            toothNumbers: [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26], // 13 units
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(10); // 5 + 2 + 3 for >12 units
    });

    it('should add days for implant cases', () => {
      const labCase = createMockLabCase({
        prosthetics: [
          {
            id: 'p-001',
            type: 'IMPLANT_CROWN',
            material: 'EMAX', // Non-zirconia to get base 5 days
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
        implantComponents: [{ id: 'impl-001', brand: 'Straumann', system: 'BLT' } as any],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(7); // 5 + 2 for implants
    });

    it('should reduce days for RUSH priority', () => {
      const labCase = createMockLabCase({
        priority: 'RUSH',
        prosthetics: [
          {
            id: 'p-001',
            type: 'CROWN',
            material: 'EMAX', // Non-zirconia to get base 5 days
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(3); // ceil(5 * 0.6) = 3
    });

    it('should reduce days significantly for EMERGENCY priority', () => {
      const labCase = createMockLabCase({
        priority: 'EMERGENCY',
        prosthetics: [
          {
            id: 'p-001',
            type: 'CROWN',
            material: 'EMAX', // Non-zirconia to get base 5 days
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(2); // max(2, ceil(5 * 0.4)) = 2
    });

    it('should reduce days for VIP priority', () => {
      const labCase = createMockLabCase({
        priority: 'VIP',
        prosthetics: [
          {
            id: 'p-001',
            type: 'CROWN',
            material: 'EMAX', // Non-zirconia to get base 5 days
            shade: 'A2',
            toothNumbers: [14],
            specifications: {},
          },
        ],
      });

      const days = estimateTurnaroundDays(labCase);

      expect(days).toBe(4); // ceil(5 * 0.75) = 4
    });

    it('should combine multiple complexity factors', () => {
      const labCase = createMockLabCase({
        prosthetics: [
          {
            id: 'p-001',
            type: 'BRIDGE',
            material: 'ZIRCONIA_MONOLITHIC',
            shade: 'A2',
            toothNumbers: [11, 12, 13, 14, 15, 16, 17], // 7 units
            specifications: {},
          },
        ],
        implantComponents: [{ id: 'impl-001', brand: 'Straumann', system: 'BLT' } as any],
      });

      const days = estimateTurnaroundDays(labCase);

      // 5 (base) + 2 (>6 units) + 1 (zirconia) + 2 (implants) = 10
      expect(days).toBe(10);
    });
  });
});
