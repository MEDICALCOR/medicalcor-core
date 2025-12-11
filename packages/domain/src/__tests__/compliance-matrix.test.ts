/**
 * Compliance Matrix Service Tests
 *
 * Comprehensive test suite for the compliance matrix service including
 * unit tests, integration tests, and property-based tests.
 *
 * @module @medicalcor/domain/__tests__/compliance-matrix
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  ComplianceMatrixService,
  createComplianceMatrixService,
  type ComplianceMatrixRepository,
  type ComplianceLogger,
  type ComplianceEventPublisher,
} from '../compliance-matrix/index.js';
import type {
  ComplianceMatrix,
  ConstraintDefinition,
  SprintDefinition,
  SprintComplianceEntry,
  ComplianceStatus,
  ConstraintCategory,
  ConstraintSeverity,
  SprintComplianceSummary,
  CategoryComplianceSummary,
  ComplianceQueryFilters,
} from '@medicalcor/types';
import {
  calculateCompliancePercentage,
  determineComplianceTrend,
  requiresImmediateAttention,
  calculateDaysFromTarget,
  getSeverityWeight,
  sortByPriority,
  DEFAULT_MEDICALCOR_CONSTRAINTS,
} from '@medicalcor/types';

// =============================================================================
// Test Fixtures & Mocks
// =============================================================================

function createMockLogger(): ComplianceLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockEventPublisher(): ComplianceEventPublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockRepository(): ComplianceMatrixRepository {
  const matrices = new Map<string, ComplianceMatrix>();
  const constraints = new Map<string, ConstraintDefinition[]>();
  const sprints = new Map<string, SprintDefinition[]>();
  const entries = new Map<string, SprintComplianceEntry[]>();

  return {
    findById: vi.fn(async (matrixId: string) => matrices.get(matrixId) ?? null),
    findDefault: vi.fn(async () => {
      for (const matrix of matrices.values()) {
        return matrix;
      }
      return null;
    }),
    save: vi.fn(async (matrix: ComplianceMatrix) => {
      matrices.set(matrix.id, matrix);
      return matrix;
    }),
    delete: vi.fn(async (matrixId: string) => {
      matrices.delete(matrixId);
      constraints.delete(matrixId);
      sprints.delete(matrixId);
      entries.delete(matrixId);
    }),

    addConstraint: vi.fn(async (matrixId: string, constraint: ConstraintDefinition) => {
      const existing = constraints.get(matrixId) ?? [];
      existing.push(constraint);
      constraints.set(matrixId, existing);
      return constraint;
    }),
    updateConstraint: vi.fn(
      async (matrixId: string, constraintId: string, updates: Partial<ConstraintDefinition>) => {
        const existing = constraints.get(matrixId) ?? [];
        const idx = existing.findIndex((c) => c.id === constraintId);
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], ...updates };
          return existing[idx];
        }
        throw new Error('Constraint not found');
      }
    ),
    removeConstraint: vi.fn(async (matrixId: string, constraintId: string) => {
      const existing = constraints.get(matrixId) ?? [];
      constraints.set(
        matrixId,
        existing.filter((c) => c.id !== constraintId)
      );
    }),
    findConstraints: vi.fn(async (matrixId: string) => constraints.get(matrixId) ?? []),
    findConstraintsByCategory: vi.fn(async (matrixId: string, category: ConstraintCategory) => {
      const existing = constraints.get(matrixId) ?? [];
      return existing.filter((c) => c.category === category);
    }),

    addSprint: vi.fn(async (matrixId: string, sprint: SprintDefinition) => {
      const existing = sprints.get(matrixId) ?? [];
      existing.push(sprint);
      sprints.set(matrixId, existing);
      return sprint;
    }),
    updateSprint: vi.fn(
      async (matrixId: string, sprintId: string, updates: Partial<SprintDefinition>) => {
        const existing = sprints.get(matrixId) ?? [];
        const idx = existing.findIndex((s) => s.id === sprintId);
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], ...updates };
          return existing[idx];
        }
        throw new Error('Sprint not found');
      }
    ),
    removeSprint: vi.fn(async (matrixId: string, sprintId: string) => {
      const existing = sprints.get(matrixId) ?? [];
      sprints.set(
        matrixId,
        existing.filter((s) => s.id !== sprintId)
      );
    }),
    findSprints: vi.fn(async (matrixId: string) => sprints.get(matrixId) ?? []),
    findCurrentSprint: vi.fn(async (matrixId: string) => {
      const existing = sprints.get(matrixId) ?? [];
      return existing.find((s) => s.isCurrent) ?? null;
    }),

    upsertEntry: vi.fn(async (matrixId: string, entry: SprintComplianceEntry) => {
      const existing = entries.get(matrixId) ?? [];
      const idx = existing.findIndex(
        (e) => e.constraintId === entry.constraintId && e.sprintId === entry.sprintId
      );
      if (idx >= 0) {
        existing[idx] = entry;
      } else {
        existing.push(entry);
      }
      entries.set(matrixId, existing);
      return entry;
    }),
    findEntry: vi.fn(async (matrixId: string, constraintId: string, sprintId: string) => {
      const existing = entries.get(matrixId) ?? [];
      return (
        existing.find((e) => e.constraintId === constraintId && e.sprintId === sprintId) ?? null
      );
    }),
    findEntriesBySprint: vi.fn(async (matrixId: string, sprintId: string) => {
      const existing = entries.get(matrixId) ?? [];
      return existing.filter((e) => e.sprintId === sprintId);
    }),
    findEntriesByConstraint: vi.fn(async (matrixId: string, constraintId: string) => {
      const existing = entries.get(matrixId) ?? [];
      return existing.filter((e) => e.constraintId === constraintId);
    }),
    queryEntries: vi.fn(async (matrixId: string, filters: ComplianceQueryFilters) => {
      let result = entries.get(matrixId) ?? [];
      if (filters.constraintId) {
        result = result.filter((e) => e.constraintId === filters.constraintId);
      }
      if (filters.sprintId) {
        result = result.filter((e) => e.sprintId === filters.sprintId);
      }
      if (filters.status) {
        result = result.filter((e) => e.status === filters.status);
      }
      return result;
    }),
    findEntriesNeedingAttention: vi.fn(async (matrixId: string) => {
      const existing = entries.get(matrixId) ?? [];
      return existing.filter((e) => e.status === 'non_compliant' || e.status === 'in_progress');
    }),
    deleteEntry: vi.fn(async (matrixId: string, constraintId: string, sprintId: string) => {
      const existing = entries.get(matrixId) ?? [];
      entries.set(
        matrixId,
        existing.filter((e) => !(e.constraintId === constraintId && e.sprintId === sprintId))
      );
    }),

    getSprintSummary: vi.fn(async (matrixId: string, sprintId: string) => {
      const sprintEntries = entries.get(matrixId)?.filter((e) => e.sprintId === sprintId) ?? [];
      const summary: SprintComplianceSummary = {
        sprintId,
        sprintName: `Sprint ${sprintId}`,
        totalConstraints: sprintEntries.length,
        compliantCount: sprintEntries.filter((e) => e.status === 'compliant').length,
        inProgressCount: sprintEntries.filter((e) => e.status === 'in_progress').length,
        nonCompliantCount: sprintEntries.filter((e) => e.status === 'non_compliant').length,
        notApplicableCount: sprintEntries.filter((e) => e.status === 'not_applicable').length,
        compliancePercentage: 0,
        criticalViolations: 0,
        highViolations: 0,
      };
      const applicable = summary.totalConstraints - summary.notApplicableCount;
      summary.compliancePercentage =
        applicable > 0 ? Math.round((summary.compliantCount / applicable) * 100) : 100;
      return summary;
    }),
    getAllSprintSummaries: vi.fn(async (matrixId: string) => {
      const sprintList = sprints.get(matrixId) ?? [];
      const summaries: SprintComplianceSummary[] = [];
      for (const sprint of sprintList) {
        const sprintEntries = entries.get(matrixId)?.filter((e) => e.sprintId === sprint.id) ?? [];
        summaries.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          totalConstraints: sprintEntries.length,
          compliantCount: sprintEntries.filter((e) => e.status === 'compliant').length,
          inProgressCount: sprintEntries.filter((e) => e.status === 'in_progress').length,
          nonCompliantCount: sprintEntries.filter((e) => e.status === 'non_compliant').length,
          notApplicableCount: sprintEntries.filter((e) => e.status === 'not_applicable').length,
          compliancePercentage: 0,
          criticalViolations: 0,
          highViolations: 0,
        });
      }
      return summaries;
    }),
    getCategorySummary: vi.fn(async () => []),
    getStatusCounts: vi.fn(async () => ({
      compliant: 0,
      in_progress: 0,
      non_compliant: 0,
      not_applicable: 0,
    })),
    getViolationCounts: vi.fn(async () => ({ critical: 0, high: 0 })),

    bulkUpsertEntries: vi.fn(async (matrixId: string, newEntries: SprintComplianceEntry[]) => {
      for (const entry of newEntries) {
        const existing = entries.get(matrixId) ?? [];
        const idx = existing.findIndex(
          (e) => e.constraintId === entry.constraintId && e.sprintId === entry.sprintId
        );
        if (idx >= 0) {
          existing[idx] = entry;
        } else {
          existing.push(entry);
        }
        entries.set(matrixId, existing);
      }
      return newEntries;
    }),
    copyEntriesFromSprint: vi.fn(
      async (matrixId: string, fromSprintId: string, toSprintId: string) => {
        const existing = entries.get(matrixId) ?? [];
        const toCopy = existing.filter((e) => e.sprintId === fromSprintId);
        const copied = toCopy.map((e) => ({
          ...e,
          sprintId: toSprintId,
          assessedAt: new Date(),
        }));
        entries.set(matrixId, [...existing, ...copied]);
        return copied;
      }
    ),
  };
}

// =============================================================================
// Arbitraries for Property-Based Testing
// =============================================================================

const complianceStatusArb = fc.constantFrom<ComplianceStatus>(
  'compliant',
  'in_progress',
  'non_compliant',
  'not_applicable'
);

const constraintCategoryArb = fc.constantFrom<ConstraintCategory>(
  'hipaa',
  'gdpr',
  'architecture',
  'testing',
  'technical_debt',
  'observability',
  'security',
  'performance'
);

const constraintSeverityArb = fc.constantFrom<ConstraintSeverity>(
  'critical',
  'high',
  'medium',
  'low'
);

const constraintArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ maxLength: 500 }),
  category: constraintCategoryArb,
  severity: constraintSeverityArb,
  frameworks: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  isActive: fc.boolean(),
});



// =============================================================================
// Unit Tests
// =============================================================================

describe('ComplianceMatrixService', () => {
  let service: ComplianceMatrixService;
  let mockRepository: ComplianceMatrixRepository;
  let mockLogger: ComplianceLogger;
  let mockEventPublisher: ComplianceEventPublisher;

  beforeEach(() => {
    mockRepository = createMockRepository();
    mockLogger = createMockLogger();
    mockEventPublisher = createMockEventPublisher();

    service = createComplianceMatrixService({
      repository: mockRepository,
      logger: mockLogger,
      eventPublisher: mockEventPublisher,
      config: {
        autoInitializeDefaults: false, // Disable for tests
        publishEvents: true,
      },
    });
  });

  // ===========================================================================
  // Matrix Operations
  // ===========================================================================

  describe('Matrix Operations', () => {
    it('should create a new compliance matrix', async () => {
      const result = await service.createMatrix({
        name: 'Test Matrix',
        description: 'A test compliance matrix',
      });

      expect(result).toBeDefined();
      expect(result.id).toMatch(/^matrix_/);
      expect(result.name).toBe('Test Matrix');
      expect(result.description).toBe('A test compliance matrix');
      expect(result.constraints).toEqual([]);
      expect(result.sprints).toEqual([]);
      expect(result.entries).toEqual([]);
      expect(result.version).toBe(1);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should get a matrix by ID', async () => {
      const created = await service.createMatrix({ name: 'Test' });
      const found = await service.getMatrix(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return null for non-existent matrix', async () => {
      const found = await service.getMatrix('non-existent');
      expect(found).toBeNull();
    });

    it('should delete a matrix', async () => {
      const created = await service.createMatrix({ name: 'Test' });
      await service.deleteMatrix(created.id);

      expect(mockRepository.delete).toHaveBeenCalledWith(created.id);
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should get or create default matrix', async () => {
      const matrix = await service.getOrCreateDefaultMatrix();

      expect(matrix).toBeDefined();
      expect(matrix.name).toBe('MedicalCor Compliance Matrix');
    });
  });

  // ===========================================================================
  // Constraint Operations
  // ===========================================================================

  describe('Constraint Operations', () => {
    let matrixId: string;

    beforeEach(async () => {
      const matrix = await service.createMatrix({ name: 'Test Matrix' });
      matrixId = matrix.id;
    });

    it('should add a constraint to a matrix', async () => {
      const constraint = await service.addConstraint(matrixId, {
        name: 'HIPAA Encryption',
        description: 'All PHI must be encrypted',
        category: 'hipaa',
        severity: 'critical',
        frameworks: ['HIPAA', 'SOC2'],
        isActive: true,
      });

      expect(constraint).toBeDefined();
      expect(constraint.id).toMatch(/^constraint_/);
      expect(constraint.name).toBe('HIPAA Encryption');
      expect(constraint.category).toBe('hipaa');
      expect(constraint.severity).toBe('critical');
      expect(mockRepository.addConstraint).toHaveBeenCalled();
    });

    it('should update a constraint', async () => {
      const constraint = await service.addConstraint(matrixId, {
        name: 'Test Constraint',
        description: 'Test',
        category: 'testing',
        severity: 'low',
        isActive: true,
      });

      const updated = await service.updateConstraint(matrixId, constraint.id, {
        severity: 'high',
      });

      expect(updated.severity).toBe('high');
      expect(mockRepository.updateConstraint).toHaveBeenCalled();
    });

    it('should remove a constraint', async () => {
      const constraint = await service.addConstraint(matrixId, {
        name: 'Test',
        description: 'Test',
        category: 'testing',
        severity: 'low',
        isActive: true,
      });

      await service.removeConstraint(matrixId, constraint.id);

      expect(mockRepository.removeConstraint).toHaveBeenCalledWith(matrixId, constraint.id);
    });

    it('should get constraints by category', async () => {
      await service.addConstraint(matrixId, {
        name: 'HIPAA Test',
        description: 'Test',
        category: 'hipaa',
        severity: 'critical',
        isActive: true,
      });

      await service.addConstraint(matrixId, {
        name: 'GDPR Test',
        description: 'Test',
        category: 'gdpr',
        severity: 'high',
        isActive: true,
      });

      const hipaaConstraints = await service.getConstraintsByCategory(matrixId, 'hipaa');

      expect(mockRepository.findConstraintsByCategory).toHaveBeenCalledWith(matrixId, 'hipaa');
    });

    it('should initialize default MedicalCor constraints', async () => {
      const defaults = await service.initializeDefaultConstraints(matrixId);

      expect(defaults.length).toBe(DEFAULT_MEDICALCOR_CONSTRAINTS.length);
      expect(mockRepository.addConstraint).toHaveBeenCalledTimes(
        DEFAULT_MEDICALCOR_CONSTRAINTS.length
      );
    });
  });

  // ===========================================================================
  // Sprint Operations
  // ===========================================================================

  describe('Sprint Operations', () => {
    let matrixId: string;

    beforeEach(async () => {
      const matrix = await service.createMatrix({ name: 'Test Matrix' });
      matrixId = matrix.id;
    });

    it('should add a sprint', async () => {
      const sprint = await service.addSprint(matrixId, {
        name: 'Sprint 1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        isCurrent: false,
        goals: ['Complete HIPAA compliance'],
      });

      expect(sprint).toBeDefined();
      expect(sprint.id).toMatch(/^sprint_/);
      expect(sprint.name).toBe('Sprint 1');
      expect(mockRepository.addSprint).toHaveBeenCalled();
    });

    it('should set current sprint', async () => {
      const sprint1 = await service.addSprint(matrixId, {
        name: 'Sprint 1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        isCurrent: true,
        goals: [],
      });

      const sprint2 = await service.addSprint(matrixId, {
        name: 'Sprint 2',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-01-28'),
        isCurrent: false,
        goals: [],
      });

      await service.setCurrentSprint(matrixId, sprint2.id);

      expect(mockRepository.updateSprint).toHaveBeenCalled();
    });

    it('should get current sprint', async () => {
      await service.addSprint(matrixId, {
        name: 'Sprint 1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        isCurrent: true,
        goals: [],
      });

      await service.getCurrentSprint(matrixId);

      expect(mockRepository.findCurrentSprint).toHaveBeenCalledWith(matrixId);
    });
  });

  // ===========================================================================
  // Compliance Entry Operations
  // ===========================================================================

  describe('Compliance Entry Operations', () => {
    let matrixId: string;
    let constraintId: string;
    let sprintId: string;

    beforeEach(async () => {
      const matrix = await service.createMatrix({ name: 'Test Matrix' });
      matrixId = matrix.id;

      const constraint = await service.addConstraint(matrixId, {
        name: 'Test Constraint',
        description: 'Test',
        category: 'testing',
        severity: 'medium',
        isActive: true,
      });
      constraintId = constraint.id;

      const sprint = await service.addSprint(matrixId, {
        name: 'Sprint 1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        isCurrent: true,
        goals: [],
      });
      sprintId = sprint.id;
    });

    it('should update compliance status', async () => {
      const entry = await service.updateComplianceStatus(matrixId, {
        constraintId,
        sprintId,
        status: 'compliant',
        notes: 'All tests passing',
        workItems: [],
        assessedBy: 'test-user',
      });

      expect(entry).toBeDefined();
      expect(entry.status).toBe('compliant');
      expect(entry.notes).toBe('All tests passing');
      expect(mockRepository.upsertEntry).toHaveBeenCalled();
    });

    it('should publish status change event', async () => {
      await service.updateComplianceStatus(matrixId, {
        constraintId,
        sprintId,
        status: 'compliant',
        workItems: [],
      });

      // First call is for checking existing entry
      // Event should be published
      expect(mockEventPublisher.publish).toHaveBeenCalled();
    });

    it('should bulk update compliance statuses', async () => {
      const entries = await service.bulkUpdateComplianceStatus(matrixId, [
        {
          constraintId,
          sprintId,
          status: 'compliant',
          workItems: [],
        },
      ]);

      expect(entries.length).toBe(1);
      expect(mockRepository.bulkUpsertEntries).toHaveBeenCalled();
    });

    it('should get compliance entry', async () => {
      await service.updateComplianceStatus(matrixId, {
        constraintId,
        sprintId,
        status: 'in_progress',
        workItems: [],
      });

      await service.getComplianceEntry(matrixId, constraintId, sprintId);

      expect(mockRepository.findEntry).toHaveBeenCalledWith(matrixId, constraintId, sprintId);
    });

    it('should get entries for sprint', async () => {
      await service.getEntriesForSprint(matrixId, sprintId);

      expect(mockRepository.findEntriesBySprint).toHaveBeenCalledWith(matrixId, sprintId);
    });

    it('should get constraint history', async () => {
      await service.getConstraintHistory(matrixId, constraintId);

      expect(mockRepository.findEntriesByConstraint).toHaveBeenCalledWith(matrixId, constraintId);
    });

    it('should rollover sprint entries', async () => {
      const sprint2 = await service.addSprint(matrixId, {
        name: 'Sprint 2',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-01-28'),
        isCurrent: false,
        goals: [],
      });

      await service.rolloverSprint(matrixId, sprintId, sprint2.id);

      expect(mockRepository.copyEntriesFromSprint).toHaveBeenCalledWith(
        matrixId,
        sprintId,
        sprint2.id
      );
    });
  });

  // ===========================================================================
  // Reporting Operations
  // ===========================================================================

  describe('Reporting Operations', () => {
    let matrixId: string;

    beforeEach(async () => {
      const matrix = await service.createMatrix({ name: 'Test Matrix' });
      matrixId = matrix.id;
    });

    it('should get sprint summary', async () => {
      const sprint = await service.addSprint(matrixId, {
        name: 'Sprint 1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        isCurrent: true,
        goals: [],
      });

      await service.getSprintSummary(matrixId, sprint.id);

      expect(mockRepository.getSprintSummary).toHaveBeenCalledWith(matrixId, sprint.id);
    });

    it('should generate compliance report', async () => {
      const sprint = await service.addSprint(matrixId, {
        name: 'Sprint 1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        isCurrent: true,
        goals: [],
      });

      const report = await service.generateReport(matrixId);

      expect(report).toBeDefined();
      expect(report.matrixId).toBe(matrixId);
      expect(report.generatedAt).toBeDefined();
      expect(typeof report.overallCompliancePercentage).toBe('number');
      expect(Array.isArray(report.sprintSummaries)).toBe(true);
      expect(Array.isArray(report.attentionItems)).toBe(true);
    });

    it('should check compliance health', async () => {
      const sprint = await service.addSprint(matrixId, {
        name: 'Sprint 1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        isCurrent: true,
        goals: [],
      });

      const isHealthy = await service.isComplianceHealthy(matrixId);

      expect(typeof isHealthy).toBe('boolean');
    });

    it('should generate display matrix', async () => {
      const sprint = await service.addSprint(matrixId, {
        name: 'Sprint 1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-14'),
        isCurrent: true,
        goals: [],
      });

      const displayMatrix = await service.generateDisplayMatrix(matrixId);

      expect(displayMatrix).toBeDefined();
      expect(Array.isArray(displayMatrix.headers)).toBe(true);
      expect(Array.isArray(displayMatrix.rows)).toBe(true);
    });
  });

  // ===========================================================================
  // Overdue Detection
  // ===========================================================================

  describe('Overdue Detection', () => {
    let matrixId: string;

    beforeEach(async () => {
      const matrix = await service.createMatrix({ name: 'Test Matrix' });
      matrixId = matrix.id;
    });

    it('should check for overdue items', async () => {
      const overdueEntries = await service.checkOverdueItems(matrixId);

      expect(Array.isArray(overdueEntries)).toBe(true);
      expect(mockRepository.findEntriesNeedingAttention).toHaveBeenCalledWith(matrixId);
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Compliance Matrix Utility Functions', () => {
  describe('calculateCompliancePercentage', () => {
    it('should return 100% when all are compliant', () => {
      const result = calculateCompliancePercentage(10, 10, 0);
      expect(result).toBe(100);
    });

    it('should return 0% when none are compliant', () => {
      const result = calculateCompliancePercentage(0, 10, 0);
      expect(result).toBe(0);
    });

    it('should exclude N/A from calculation', () => {
      const result = calculateCompliancePercentage(5, 10, 5);
      expect(result).toBe(100); // 5 compliant out of 5 applicable
    });

    it('should return 100% when all are N/A', () => {
      const result = calculateCompliancePercentage(0, 5, 5);
      expect(result).toBe(100);
    });

    it('should handle partial compliance', () => {
      const result = calculateCompliancePercentage(7, 10, 0);
      expect(result).toBe(70);
    });
  });

  describe('determineComplianceTrend', () => {
    it('should return stable for single sprint', () => {
      const summaries: SprintComplianceSummary[] = [
        {
          sprintId: 'sprint-1',
          sprintName: 'Sprint 1',
          totalConstraints: 10,
          compliantCount: 8,
          inProgressCount: 1,
          nonCompliantCount: 1,
          notApplicableCount: 0,
          compliancePercentage: 80,
          criticalViolations: 0,
          highViolations: 0,
        },
      ];

      const result = determineComplianceTrend(summaries);
      expect(result).toBe('stable');
    });

    it('should return improving when percentage increases significantly', () => {
      const summaries: SprintComplianceSummary[] = [
        {
          sprintId: 'sprint-1',
          sprintName: 'Sprint 1',
          totalConstraints: 10,
          compliantCount: 7,
          inProgressCount: 2,
          nonCompliantCount: 1,
          notApplicableCount: 0,
          compliancePercentage: 70,
          criticalViolations: 0,
          highViolations: 0,
        },
        {
          sprintId: 'sprint-2',
          sprintName: 'Sprint 2',
          totalConstraints: 10,
          compliantCount: 9,
          inProgressCount: 1,
          nonCompliantCount: 0,
          notApplicableCount: 0,
          compliancePercentage: 90,
          criticalViolations: 0,
          highViolations: 0,
        },
      ];

      const result = determineComplianceTrend(summaries);
      expect(result).toBe('improving');
    });

    it('should return declining when percentage decreases significantly', () => {
      const summaries: SprintComplianceSummary[] = [
        {
          sprintId: 'sprint-1',
          sprintName: 'Sprint 1',
          totalConstraints: 10,
          compliantCount: 9,
          inProgressCount: 1,
          nonCompliantCount: 0,
          notApplicableCount: 0,
          compliancePercentage: 90,
          criticalViolations: 0,
          highViolations: 0,
        },
        {
          sprintId: 'sprint-2',
          sprintName: 'Sprint 2',
          totalConstraints: 10,
          compliantCount: 7,
          inProgressCount: 1,
          nonCompliantCount: 2,
          notApplicableCount: 0,
          compliancePercentage: 70,
          criticalViolations: 1,
          highViolations: 0,
        },
      ];

      const result = determineComplianceTrend(summaries);
      expect(result).toBe('declining');
    });
  });

  describe('requiresImmediateAttention', () => {
    const criticalConstraint: ConstraintDefinition = {
      id: 'test-1',
      name: 'Critical Constraint',
      description: 'Test',
      category: 'hipaa',
      severity: 'critical',
      frameworks: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const lowConstraint: ConstraintDefinition = {
      id: 'test-2',
      name: 'Low Constraint',
      description: 'Test',
      category: 'testing',
      severity: 'low',
      frameworks: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return false for compliant status', () => {
      const entry: SprintComplianceEntry = {
        constraintId: 'test-1',
        sprintId: 'sprint-1',
        status: 'compliant',
        workItems: [],
        assessedAt: new Date(),
      };

      expect(requiresImmediateAttention(entry, criticalConstraint)).toBe(false);
    });

    it('should return true for non-compliant critical constraint', () => {
      const entry: SprintComplianceEntry = {
        constraintId: 'test-1',
        sprintId: 'sprint-1',
        status: 'non_compliant',
        workItems: [],
        assessedAt: new Date(),
      };

      expect(requiresImmediateAttention(entry, criticalConstraint)).toBe(true);
    });

    it('should return false for non-compliant low constraint', () => {
      const entry: SprintComplianceEntry = {
        constraintId: 'test-2',
        sprintId: 'sprint-1',
        status: 'non_compliant',
        workItems: [],
        assessedAt: new Date(),
      };

      expect(requiresImmediateAttention(entry, lowConstraint)).toBe(false);
    });

    it('should return true for overdue in-progress entry', () => {
      const entry: SprintComplianceEntry = {
        constraintId: 'test-2',
        sprintId: 'sprint-1',
        status: 'in_progress',
        targetDate: new Date('2020-01-01'), // Past date
        workItems: [],
        assessedAt: new Date(),
      };

      expect(requiresImmediateAttention(entry, lowConstraint)).toBe(true);
    });
  });

  describe('calculateDaysFromTarget', () => {
    it('should return positive for future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const result = calculateDaysFromTarget(futureDate);
      expect(result).toBeGreaterThan(0);
    });

    it('should return negative for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const result = calculateDaysFromTarget(pastDate);
      expect(result).toBeLessThan(0);
    });
  });

  describe('getSeverityWeight', () => {
    it('should return correct weights', () => {
      expect(getSeverityWeight('critical')).toBe(4);
      expect(getSeverityWeight('high')).toBe(3);
      expect(getSeverityWeight('medium')).toBe(2);
      expect(getSeverityWeight('low')).toBe(1);
    });
  });

  describe('sortByPriority', () => {
    it('should sort constraints by severity (critical first)', () => {
      const constraints: ConstraintDefinition[] = [
        {
          id: '1',
          name: 'Low',
          description: '',
          category: 'testing',
          severity: 'low',
          frameworks: [],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Critical',
          description: '',
          category: 'hipaa',
          severity: 'critical',
          frameworks: [],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          name: 'Medium',
          description: '',
          category: 'architecture',
          severity: 'medium',
          frameworks: [],
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const sorted = sortByPriority(constraints);

      expect(sorted[0].severity).toBe('critical');
      expect(sorted[1].severity).toBe('medium');
      expect(sorted[2].severity).toBe('low');
    });
  });
});

// =============================================================================
// Property-Based Tests
// =============================================================================

describe('Compliance Matrix Property-Based Tests', () => {
  describe('calculateCompliancePercentage', () => {
    it('should always return a value between 0 and 100', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 1000 }),
          fc.nat({ max: 1000 }),
          fc.nat({ max: 1000 }),
          (compliant, nonCompliant, notApplicable) => {
            const total = compliant + nonCompliant + notApplicable;
            if (total === 0) return true; // Skip edge case

            const result = calculateCompliancePercentage(compliant, total, notApplicable);
            return result >= 0 && result <= 100;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be monotonic in compliant count', () => {
      fc.assert(
        fc.property(fc.nat({ max: 100 }), fc.nat({ max: 100 }), (compliant, additional) => {
          const total = compliant + additional + 10;
          const notApplicable = 2;

          const result1 = calculateCompliancePercentage(compliant, total, notApplicable);
          const result2 = calculateCompliancePercentage(
            compliant + additional,
            total,
            notApplicable
          );

          return result2 >= result1;
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('getSeverityWeight', () => {
    it('should return consistent weights for all severities', () => {
      fc.assert(
        fc.property(constraintSeverityArb, (severity) => {
          const weight = getSeverityWeight(severity);
          return weight >= 1 && weight <= 4;
        }),
        { numRuns: 20 }
      );
    });

    it('critical should always have highest weight', () => {
      fc.assert(
        fc.property(constraintSeverityArb, (severity) => {
          if (severity === 'critical') return true;
          return getSeverityWeight('critical') > getSeverityWeight(severity);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('sortByPriority', () => {
    it('should maintain all constraints (no loss)', () => {
      fc.assert(
        fc.property(
          fc.array(constraintArb, { minLength: 1, maxLength: 20 }),
          (constraintInputs) => {
            const constraints: ConstraintDefinition[] = constraintInputs.map((c, i) => ({
              id: `constraint-${i}`,
              ...c,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            const sorted = sortByPriority(constraints);
            return sorted.length === constraints.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should produce sorted output', () => {
      fc.assert(
        fc.property(
          fc.array(constraintArb, { minLength: 2, maxLength: 20 }),
          (constraintInputs) => {
            const constraints: ConstraintDefinition[] = constraintInputs.map((c, i) => ({
              id: `constraint-${i}`,
              ...c,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            const sorted = sortByPriority(constraints);

            // Check that each element has weight >= next element
            for (let i = 0; i < sorted.length - 1; i++) {
              if (
                getSeverityWeight(sorted[i].severity) < getSeverityWeight(sorted[i + 1].severity)
              ) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('determineComplianceTrend', () => {
    it('should always return a valid trend', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              sprintId: fc.string({ minLength: 1, maxLength: 20 }),
              sprintName: fc.string({ minLength: 1, maxLength: 50 }),
              totalConstraints: fc.nat({ max: 100 }),
              compliantCount: fc.nat({ max: 100 }),
              inProgressCount: fc.nat({ max: 100 }),
              nonCompliantCount: fc.nat({ max: 100 }),
              notApplicableCount: fc.nat({ max: 100 }),
              compliancePercentage: fc.float({ min: 0, max: 100 }),
              criticalViolations: fc.nat({ max: 10 }),
              highViolations: fc.nat({ max: 10 }),
            }),
            { maxLength: 10 }
          ),
          (summaries) => {
            const result = determineComplianceTrend(summaries);
            return ['improving', 'stable', 'declining'].includes(result);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('DEFAULT_MEDICALCOR_CONSTRAINTS', () => {
    it('should have valid structure for all default constraints', () => {
      for (const constraint of DEFAULT_MEDICALCOR_CONSTRAINTS) {
        expect(constraint.name).toBeTruthy();
        expect(constraint.description).toBeTruthy();
        expect([
          'hipaa',
          'gdpr',
          'architecture',
          'testing',
          'technical_debt',
          'observability',
          'security',
          'performance',
        ]).toContain(constraint.category);
        expect(['critical', 'high', 'medium', 'low']).toContain(constraint.severity);
        expect(constraint.isActive).toBe(true);
      }
    });

    it('should include both HIPAA and GDPR constraints', () => {
      const categories = DEFAULT_MEDICALCOR_CONSTRAINTS.map((c) => c.category);
      expect(categories).toContain('hipaa');
      expect(categories).toContain('gdpr');
    });

    it('should have critical constraints for HIPAA and GDPR', () => {
      const criticalHipaa = DEFAULT_MEDICALCOR_CONSTRAINTS.filter(
        (c) => c.category === 'hipaa' && c.severity === 'critical'
      );
      const criticalGdpr = DEFAULT_MEDICALCOR_CONSTRAINTS.filter(
        (c) => c.category === 'gdpr' && c.severity === 'critical'
      );

      expect(criticalHipaa.length).toBeGreaterThan(0);
      expect(criticalGdpr.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Compliance Matrix Integration Tests', () => {
  let service: ComplianceMatrixService;
  let mockRepository: ComplianceMatrixRepository;

  beforeEach(() => {
    mockRepository = createMockRepository();
    service = createComplianceMatrixService({
      repository: mockRepository,
      config: {
        autoInitializeDefaults: false,
        publishEvents: false,
      },
    });
  });

  it('should complete a full compliance tracking workflow', async () => {
    // 1. Create matrix
    const matrix = await service.createMatrix({
      name: 'Q1 2024 Compliance',
      description: 'Quarterly compliance tracking',
    });

    // 2. Add constraints
    const hipaaConstraint = await service.addConstraint(matrix.id, {
      name: 'HIPAA Encryption',
      description: 'All PHI must be encrypted at rest',
      category: 'hipaa',
      severity: 'critical',
      frameworks: ['HIPAA'],
      isActive: true,
    });

    const gdprConstraint = await service.addConstraint(matrix.id, {
      name: 'GDPR Consent',
      description: 'Valid consent required for data processing',
      category: 'gdpr',
      severity: 'critical',
      frameworks: ['GDPR'],
      isActive: true,
    });

    // 3. Add sprints
    const sprint1 = await service.addSprint(matrix.id, {
      name: 'Sprint 1',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-14'),
      isCurrent: false,
      goals: ['Initial setup'],
    });

    const sprint2 = await service.addSprint(matrix.id, {
      name: 'Sprint 2',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-01-28'),
      isCurrent: true,
      goals: ['Complete HIPAA compliance'],
    });

    // 4. Update compliance statuses for Sprint 1
    await service.updateComplianceStatus(matrix.id, {
      constraintId: hipaaConstraint.id,
      sprintId: sprint1.id,
      status: 'in_progress',
      notes: 'Implementing encryption',
      workItems: [{ type: 'issue', referenceId: 'JIRA-123' }],
    });

    await service.updateComplianceStatus(matrix.id, {
      constraintId: gdprConstraint.id,
      sprintId: sprint1.id,
      status: 'compliant',
      notes: 'Consent system deployed',
      workItems: [],
    });

    // 5. Rollover to Sprint 2 and update
    await service.rolloverSprint(matrix.id, sprint1.id, sprint2.id);

    await service.updateComplianceStatus(matrix.id, {
      constraintId: hipaaConstraint.id,
      sprintId: sprint2.id,
      status: 'compliant',
      notes: 'Encryption implemented and verified',
      workItems: [],
    });

    // 6. Generate report
    const report = await service.generateReport(matrix.id);

    expect(report).toBeDefined();
    expect(report.matrixId).toBe(matrix.id);

    // 7. Check compliance health
    const isHealthy = await service.isComplianceHealthy(matrix.id);
    expect(typeof isHealthy).toBe('boolean');

    // 8. Generate display matrix
    const displayMatrix = await service.generateDisplayMatrix(matrix.id);
    expect(displayMatrix.headers).toContain('Constraint');
    expect(displayMatrix.rows.length).toBeGreaterThan(0);
  });

  it('should handle sprint rollover correctly', async () => {
    const matrix = await service.createMatrix({ name: 'Test' });

    const constraint = await service.addConstraint(matrix.id, {
      name: 'Test',
      description: 'Test',
      category: 'testing',
      severity: 'low',
      isActive: true,
    });

    const sprint1 = await service.addSprint(matrix.id, {
      name: 'Sprint 1',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-14'),
      isCurrent: false,
      goals: [],
    });

    const sprint2 = await service.addSprint(matrix.id, {
      name: 'Sprint 2',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-01-28'),
      isCurrent: true,
      goals: [],
    });

    // Set status in sprint 1
    await service.updateComplianceStatus(matrix.id, {
      constraintId: constraint.id,
      sprintId: sprint1.id,
      status: 'in_progress',
      notes: 'Work started',
      workItems: [],
    });

    // Rollover
    const copied = await service.rolloverSprint(matrix.id, sprint1.id, sprint2.id);

    expect(copied.length).toBeGreaterThan(0);
    expect(mockRepository.copyEntriesFromSprint).toHaveBeenCalledWith(
      matrix.id,
      sprint1.id,
      sprint2.id
    );
  });
});
