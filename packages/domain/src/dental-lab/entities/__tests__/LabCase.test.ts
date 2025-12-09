/**
 * @fileoverview Tests for LabCase Entity
 *
 * Comprehensive tests for the dental laboratory case aggregate root.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLabCase,
  transitionStatus,
  addScan,
  addDesign,
  approveDesign,
  addFabricationRecord,
  addQCInspection,
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
  generateLabCaseNumber,
} from '../LabCase.js';
import type {
  LabCase,
  CreateLabCaseInput,
  DigitalScan,
  CADDesign,
  FabricationRecord,
  QCInspection,
} from '../LabCase.js';
import type { ProstheticSpec } from '../../value-objects/index.js';

describe('LabCase Entity', () => {
  const mockUUID = 'mock-uuid-1234-5678';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));

    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue(mockUUID),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Sample prosthetic specs for testing
  const sampleProsthetics: ProstheticSpec[] = [
    {
      type: 'CROWN',
      material: 'ZIRCONIA',
      shade: { system: 'VITA_CLASSICAL', shade: 'A2' },
      toothNumbers: [21, 22],
    },
    {
      type: 'BRIDGE',
      material: 'EMAX',
      shade: { system: 'VITA_3D_MASTER', shade: '2M2' },
      toothNumbers: [14, 15, 16],
    },
  ];

  const createSampleInput = (): CreateLabCaseInput => ({
    clinicId: 'clinic-001',
    patientId: 'patient-001',
    prescribingDentist: 'Dr. Smith',
    prosthetics: sampleProsthetics,
    dueDate: new Date('2024-01-25T10:00:00.000Z'),
    priority: 'STANDARD',
    currency: 'EUR',
    estimatedCost: 1500,
  });

  // ==========================================================================
  // FACTORY FUNCTION TESTS
  // ==========================================================================

  describe('generateLabCaseNumber', () => {
    it('should generate case number with default code', () => {
      const caseNumber = generateLabCaseNumber();
      expect(caseNumber).toMatch(/^LAB-2024-\d{6}$/);
    });

    it('should generate case number with custom code', () => {
      const caseNumber = generateLabCaseNumber('CLINIC');
      expect(caseNumber).toMatch(/^CLINIC-2024-\d{6}$/);
    });

    it('should generate incrementing case numbers', () => {
      const first = generateLabCaseNumber();
      const second = generateLabCaseNumber();
      expect(first).not.toBe(second);
    });
  });

  describe('createLabCase', () => {
    it('should create a lab case with required fields', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.id).toBe(mockUUID);
      expect(labCase.caseNumber).toMatch(/^LAB-2024-\d{6}$/);
      expect(labCase.clinicId).toBe('clinic-001');
      expect(labCase.patientId).toBe('patient-001');
      expect(labCase.status).toBe('RECEIVED');
      expect(labCase.priority).toBe('STANDARD');
      expect(labCase.prescribingDentist).toBe('Dr. Smith');
      expect(labCase.prosthetics).toHaveLength(2);
      expect(labCase.currency).toBe('EUR');
      expect(labCase.estimatedCost).toBe(1500);
    });

    it('should initialize empty arrays for collections', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.scans).toEqual([]);
      expect(labCase.designs).toEqual([]);
      expect(labCase.fabricationRecords).toEqual([]);
      expect(labCase.qcInspections).toEqual([]);
      expect(labCase.tryInRecords).toEqual([]);
    });

    it('should set initial status history', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.statusHistory).toHaveLength(1);
      expect(labCase.statusHistory[0].status).toBe('RECEIVED');
      expect(labCase.statusHistory[0].changedBy).toBe('user-001');
      expect(labCase.statusHistory[0].reason).toBe('Case created');
    });

    it('should use default values when optional fields are not provided', () => {
      const input: CreateLabCaseInput = {
        clinicId: 'clinic-001',
        patientId: 'patient-001',
        prescribingDentist: 'Dr. Smith',
        prosthetics: sampleProsthetics,
        dueDate: new Date('2024-01-25T10:00:00.000Z'),
      };
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.priority).toBe('STANDARD');
      expect(labCase.currency).toBe('RON');
    });

    it('should link to All-on-X case when provided', () => {
      const input: CreateLabCaseInput = {
        ...createSampleInput(),
        allOnXCaseId: 'allonx-001',
      };
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.allOnXCaseId).toBe('allonx-001');
    });

    it('should set version to 1', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.version).toBe(1);
    });
  });

  // ==========================================================================
  // STATUS TRANSITION TESTS
  // ==========================================================================

  describe('transitionStatus', () => {
    it('should transition from RECEIVED to SCAN_RECEIVED', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const updated = transitionStatus(labCase, 'SCAN_RECEIVED', 'tech-001', 'Scan received');

      expect(updated.status).toBe('SCAN_RECEIVED');
      expect(updated.statusHistory).toHaveLength(2);
      expect(updated.statusHistory[1].status).toBe('SCAN_RECEIVED');
      expect(updated.statusHistory[1].changedBy).toBe('tech-001');
      expect(updated.statusHistory[1].reason).toBe('Scan received');
    });

    it('should increment version on status change', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const updated = transitionStatus(labCase, 'PENDING_SCAN', 'tech-001');

      expect(updated.version).toBe(2);
    });

    it('should throw error for invalid transition', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(() => {
        transitionStatus(labCase, 'COMPLETED', 'tech-001');
      }).toThrow('Invalid status transition');
    });

    it('should set completedAt when transitioning to COMPLETED', () => {
      const input = createSampleInput();
      let labCase = createLabCase(input, 'user-001');

      // Progress through valid workflow statuses
      labCase = transitionStatus(labCase, 'SCAN_RECEIVED', 'tech-001');
      labCase = transitionStatus(labCase, 'IN_DESIGN', 'tech-001');
      labCase = transitionStatus(labCase, 'DESIGN_REVIEW', 'tech-001');
      labCase = transitionStatus(labCase, 'DESIGN_APPROVED', 'tech-001');
      labCase = transitionStatus(labCase, 'QUEUED_FOR_MILLING', 'tech-001');
      labCase = transitionStatus(labCase, 'MILLING', 'tech-001');
      labCase = transitionStatus(labCase, 'POST_PROCESSING', 'tech-001');
      labCase = transitionStatus(labCase, 'FINISHING', 'tech-001');
      labCase = transitionStatus(labCase, 'QC_INSPECTION', 'tech-001');
      labCase = transitionStatus(labCase, 'QC_PASSED', 'tech-001');
      labCase = transitionStatus(labCase, 'READY_FOR_PICKUP', 'tech-001');
      labCase = transitionStatus(labCase, 'DELIVERED', 'tech-001');
      labCase = transitionStatus(labCase, 'COMPLETED', 'tech-001');

      expect(labCase.status).toBe('COMPLETED');
      expect(labCase.completedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // SCAN MANAGEMENT TESTS
  // ==========================================================================

  describe('addScan', () => {
    it('should add a scan to the lab case', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const scanData: Omit<DigitalScan, 'id'> = {
        scanType: 'INTRAORAL',
        fileFormat: 'STL',
        filePath: '/scans/case-001/scan.stl',
        fileSize: 1024000,
        uploadedAt: new Date(),
        scannerBrand: 'Primescan',
        scannerModel: 'CEREC',
        quality: 'EXCELLENT',
      };

      const updated = addScan(labCase, scanData);

      expect(updated.scans).toHaveLength(1);
      expect(updated.scans[0].id).toBe(mockUUID);
      expect(updated.scans[0].scanType).toBe('INTRAORAL');
      expect(updated.scans[0].quality).toBe('EXCELLENT');
    });

    it('should increment version when adding scan', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const scanData: Omit<DigitalScan, 'id'> = {
        scanType: 'MODEL',
        fileFormat: 'PLY',
        filePath: '/scans/model.ply',
        fileSize: 500000,
        uploadedAt: new Date(),
      };

      const updated = addScan(labCase, scanData);

      expect(updated.version).toBe(2);
    });
  });

  // ==========================================================================
  // DESIGN MANAGEMENT TESTS
  // ==========================================================================

  describe('addDesign', () => {
    it('should add a design to the lab case', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const designData: Omit<CADDesign, 'id'> = {
        softwareUsed: 'EXOCAD',
        version: '3.1',
        filePath: '/designs/case-001/design.exo',
        designedBy: 'designer-001',
        designedAt: new Date(),
        revisionNumber: 1,
      };

      const updated = addDesign(labCase, designData);

      expect(updated.designs).toHaveLength(1);
      expect(updated.designs[0].id).toBe(mockUUID);
      expect(updated.designs[0].softwareUsed).toBe('EXOCAD');
      expect(updated.currentDesignId).toBe(mockUUID);
    });

    it('should set currentDesignId to the new design', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const designData: Omit<CADDesign, 'id'> = {
        softwareUsed: '3SHAPE',
        version: '2022.1',
        filePath: '/designs/design.3ox',
        designedBy: 'designer-001',
        designedAt: new Date(),
        revisionNumber: 1,
      };

      const updated = addDesign(labCase, designData);

      expect(updated.currentDesignId).toBe(updated.designs[0].id);
    });
  });

  describe('approveDesign', () => {
    it('should approve a specific design', () => {
      const input = createSampleInput();
      let labCase = createLabCase(input, 'user-001');

      const designData: Omit<CADDesign, 'id'> = {
        softwareUsed: 'EXOCAD',
        version: '3.1',
        filePath: '/designs/design.exo',
        designedBy: 'designer-001',
        designedAt: new Date(),
        revisionNumber: 1,
      };

      labCase = addDesign(labCase, designData);
      const designId = labCase.designs[0].id;

      const updated = approveDesign(labCase, designId, 'approver-001');

      expect(updated.designs[0].approvedBy).toBe('approver-001');
      expect(updated.designs[0].approvedAt).toBeDefined();
    });
  });

  // ==========================================================================
  // FABRICATION TESTS
  // ==========================================================================

  describe('addFabricationRecord', () => {
    it('should add a fabrication record', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const recordData: Omit<FabricationRecord, 'id'> = {
        method: 'MILLING',
        machine: 'CEREC MC XL',
        materialBatch: 'BATCH-2024-001',
        startedAt: new Date(),
        technicianId: 'tech-001',
      };

      const updated = addFabricationRecord(labCase, recordData);

      expect(updated.fabricationRecords).toHaveLength(1);
      expect(updated.fabricationRecords[0].method).toBe('MILLING');
      expect(updated.fabricationRecords[0].machine).toBe('CEREC MC XL');
    });
  });

  // ==========================================================================
  // QC TESTS
  // ==========================================================================

  describe('addQCInspection', () => {
    it('should add a QC inspection', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const inspectionData: Omit<QCInspection, 'id'> = {
        inspectedBy: 'qc-001',
        inspectedAt: new Date(),
        passed: true,
        criteria: [
          { criterion: 'Fit', passed: true, score: 95 },
          { criterion: 'Color Match', passed: true, score: 90 },
        ],
        overallScore: 92,
      };

      const updated = addQCInspection(labCase, inspectionData);

      expect(updated.qcInspections).toHaveLength(1);
      expect(updated.qcInspections[0].passed).toBe(true);
      expect(updated.qcInspections[0].overallScore).toBe(92);
    });
  });

  // ==========================================================================
  // QUERY HELPER TESTS
  // ==========================================================================

  describe('isOverdueSLA', () => {
    it('should return false when within SLA', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(isOverdueSLA(labCase)).toBe(false);
    });

    it('should return true when past SLA deadline', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      // Move time forward past the SLA deadline
      vi.setSystemTime(new Date('2024-01-20T10:00:00.000Z'));

      expect(isOverdueSLA(labCase)).toBe(true);
    });
  });

  describe('isOverdueDueDate', () => {
    it('should return false when before due date', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(isOverdueDueDate(labCase)).toBe(false);
    });

    it('should return true when past due date and not completed', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      vi.setSystemTime(new Date('2024-01-30T10:00:00.000Z'));

      expect(isOverdueDueDate(labCase)).toBe(true);
    });
  });

  describe('getDaysUntilDue', () => {
    it('should return positive days when before due date', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const days = getDaysUntilDue(labCase);

      expect(days).toBe(10); // Due date is 10 days from start
    });

    it('should return negative days when past due date', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      vi.setSystemTime(new Date('2024-01-30T10:00:00.000Z'));

      const days = getDaysUntilDue(labCase);

      expect(days).toBeLessThan(0);
    });
  });

  describe('getLatestQCResult', () => {
    it('should return undefined when no inspections', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(getLatestQCResult(labCase)).toBeUndefined();
    });

    it('should return the last inspection', () => {
      const input = createSampleInput();
      let labCase = createLabCase(input, 'user-001');

      labCase = addQCInspection(labCase, {
        inspectedBy: 'qc-001',
        inspectedAt: new Date(),
        passed: false,
        criteria: [{ criterion: 'Fit', passed: false, score: 60 }],
        overallScore: 60,
      });

      labCase = addQCInspection(labCase, {
        inspectedBy: 'qc-002',
        inspectedAt: new Date(),
        passed: true,
        criteria: [{ criterion: 'Fit', passed: true, score: 95 }],
        overallScore: 95,
      });

      const latest = getLatestQCResult(labCase);

      expect(latest?.passed).toBe(true);
      expect(latest?.overallScore).toBe(95);
    });
  });

  describe('getCurrentDesign', () => {
    it('should return undefined when no designs', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(getCurrentDesign(labCase)).toBeUndefined();
    });

    it('should return the current design', () => {
      const input = createSampleInput();
      let labCase = createLabCase(input, 'user-001');

      labCase = addDesign(labCase, {
        softwareUsed: 'EXOCAD',
        version: '3.1',
        filePath: '/designs/design.exo',
        designedBy: 'designer-001',
        designedAt: new Date(),
        revisionNumber: 1,
      });

      const current = getCurrentDesign(labCase);

      expect(current?.softwareUsed).toBe('EXOCAD');
    });
  });

  describe('getTotalUnitsCount', () => {
    it('should count total prosthetic units', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      // Sample prosthetics have 2 + 3 = 5 units
      expect(getTotalUnitsCount(labCase)).toBe(5);
    });
  });

  describe('getProstheticsByType', () => {
    it('should filter prosthetics by type', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const crowns = getProstheticsByType(labCase, 'CROWN');
      expect(crowns).toHaveLength(1);
      expect(crowns[0].type).toBe('CROWN');

      const bridges = getProstheticsByType(labCase, 'BRIDGE');
      expect(bridges).toHaveLength(1);
      expect(bridges[0].type).toBe('BRIDGE');
    });

    it('should return empty array when type not found', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const veneers = getProstheticsByType(labCase, 'VENEER');
      expect(veneers).toHaveLength(0);
    });
  });

  describe('getMaterialsUsed', () => {
    it('should return unique materials', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const materials = getMaterialsUsed(labCase);

      expect(materials).toContain('ZIRCONIA');
      expect(materials).toContain('EMAX');
      expect(materials).toHaveLength(2);
    });
  });

  describe('requiresImplantComponents', () => {
    it('should return false for non-implant prosthetics', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      expect(requiresImplantComponents(labCase)).toBe(false);
    });

    it('should return true for implant prosthetics', () => {
      const implantProsthetics: ProstheticSpec[] = [
        {
          type: 'IMPLANT_CROWN',
          material: 'ZIRCONIA',
          shade: { system: 'VITA_CLASSICAL', shade: 'A2' },
          toothNumbers: [36],
        },
      ];

      const input: CreateLabCaseInput = {
        ...createSampleInput(),
        prosthetics: implantProsthetics,
      };
      const labCase = createLabCase(input, 'user-001');

      expect(requiresImplantComponents(labCase)).toBe(true);
    });

    it('should return true for hybrid prosthesis', () => {
      const hybridProsthetics: ProstheticSpec[] = [
        {
          type: 'HYBRID_PROSTHESIS',
          material: 'PMMA',
          shade: { system: 'VITA_CLASSICAL', shade: 'A2' },
          toothNumbers: [11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26],
        },
      ];

      const input: CreateLabCaseInput = {
        ...createSampleInput(),
        prosthetics: hybridProsthetics,
      };
      const labCase = createLabCase(input, 'user-001');

      expect(requiresImplantComponents(labCase)).toBe(true);
    });
  });

  describe('getCaseSummary', () => {
    it('should generate a readable summary', () => {
      const input = createSampleInput();
      const labCase = createLabCase(input, 'user-001');

      const summary = getCaseSummary(labCase);

      expect(summary).toContain(labCase.caseNumber);
      expect(summary).toContain('5 unit(s)');
      expect(summary).toContain('CROWN');
      expect(summary).toContain('BRIDGE');
    });
  });

  // ==========================================================================
  // PRIORITY TESTS
  // ==========================================================================

  describe('Priority handling', () => {
    it('should handle RUSH priority', () => {
      const input: CreateLabCaseInput = {
        ...createSampleInput(),
        priority: 'RUSH',
      };
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.priority).toBe('RUSH');
    });

    it('should handle EMERGENCY priority', () => {
      const input: CreateLabCaseInput = {
        ...createSampleInput(),
        priority: 'EMERGENCY',
      };
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.priority).toBe('EMERGENCY');
    });

    it('should handle VIP priority', () => {
      const input: CreateLabCaseInput = {
        ...createSampleInput(),
        priority: 'VIP',
      };
      const labCase = createLabCase(input, 'user-001');

      expect(labCase.priority).toBe('VIP');
    });
  });
});
