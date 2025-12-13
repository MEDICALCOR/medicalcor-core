/**
 * Dental Lab Helper Functions Tests
 *
 * Tests for helper functions in dental-lab.ts schema.
 *
 * @module types/schemas/__tests__/dental-lab-helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isValidStatusTransition,
  getSLAHours,
  calculateSLADeadline,
  isActiveStatus,
  isDesignPhase,
  isFabricationPhase,
  calculateQCScore,
  didQCPass,
  getDaysUntilDue,
  isCaseOverdue,
  getPriorityMultiplier,
  formatCaseNumber,
  generateCaseSummary,
  LAB_CASE_STATUSES,
  LAB_CASE_PRIORITIES,
  QC_CRITERIA,
  type LabCaseStatus,
  type LabCasePriority,
  type QCCriteriaResult,
  type QCCriterion,
} from '../dental-lab.js';

// ============================================================================
// STATUS TRANSITION TESTS
// ============================================================================

describe('isValidStatusTransition', () => {
  describe('RECEIVED transitions', () => {
    it('should allow transition to PENDING_SCAN', () => {
      expect(isValidStatusTransition('RECEIVED', 'PENDING_SCAN')).toBe(true);
    });

    it('should allow transition to SCAN_RECEIVED', () => {
      expect(isValidStatusTransition('RECEIVED', 'SCAN_RECEIVED')).toBe(true);
    });

    it('should allow transition to CANCELLED', () => {
      expect(isValidStatusTransition('RECEIVED', 'CANCELLED')).toBe(true);
    });

    it('should allow transition to ON_HOLD', () => {
      expect(isValidStatusTransition('RECEIVED', 'ON_HOLD')).toBe(true);
    });

    it('should not allow transition to IN_DESIGN', () => {
      expect(isValidStatusTransition('RECEIVED', 'IN_DESIGN')).toBe(false);
    });
  });

  describe('Design phase transitions', () => {
    it('should allow IN_DESIGN to DESIGN_REVIEW', () => {
      expect(isValidStatusTransition('IN_DESIGN', 'DESIGN_REVIEW')).toBe(true);
    });

    it('should allow DESIGN_REVIEW to DESIGN_APPROVED', () => {
      expect(isValidStatusTransition('DESIGN_REVIEW', 'DESIGN_APPROVED')).toBe(true);
    });

    it('should allow DESIGN_REVIEW to DESIGN_REVISION', () => {
      expect(isValidStatusTransition('DESIGN_REVIEW', 'DESIGN_REVISION')).toBe(true);
    });

    it('should allow DESIGN_REVISION to IN_DESIGN', () => {
      expect(isValidStatusTransition('DESIGN_REVISION', 'IN_DESIGN')).toBe(true);
    });

    it('should allow DESIGN_APPROVED to QUEUED_FOR_MILLING', () => {
      expect(isValidStatusTransition('DESIGN_APPROVED', 'QUEUED_FOR_MILLING')).toBe(true);
    });
  });

  describe('Fabrication phase transitions', () => {
    it('should allow QUEUED_FOR_MILLING to MILLING', () => {
      expect(isValidStatusTransition('QUEUED_FOR_MILLING', 'MILLING')).toBe(true);
    });

    it('should allow MILLING to POST_PROCESSING', () => {
      expect(isValidStatusTransition('MILLING', 'POST_PROCESSING')).toBe(true);
    });

    it('should allow MILLING to QC_FAILED', () => {
      expect(isValidStatusTransition('MILLING', 'QC_FAILED')).toBe(true);
    });

    it('should allow POST_PROCESSING to FINISHING', () => {
      expect(isValidStatusTransition('POST_PROCESSING', 'FINISHING')).toBe(true);
    });

    it('should allow FINISHING to QC_INSPECTION', () => {
      expect(isValidStatusTransition('FINISHING', 'QC_INSPECTION')).toBe(true);
    });
  });

  describe('QC phase transitions', () => {
    it('should allow QC_INSPECTION to QC_PASSED', () => {
      expect(isValidStatusTransition('QC_INSPECTION', 'QC_PASSED')).toBe(true);
    });

    it('should allow QC_INSPECTION to QC_FAILED', () => {
      expect(isValidStatusTransition('QC_INSPECTION', 'QC_FAILED')).toBe(true);
    });

    it('should allow QC_FAILED to IN_DESIGN', () => {
      expect(isValidStatusTransition('QC_FAILED', 'IN_DESIGN')).toBe(true);
    });

    it('should allow QC_FAILED to MILLING', () => {
      expect(isValidStatusTransition('QC_FAILED', 'MILLING')).toBe(true);
    });

    it('should allow QC_PASSED to READY_FOR_PICKUP', () => {
      expect(isValidStatusTransition('QC_PASSED', 'READY_FOR_PICKUP')).toBe(true);
    });
  });

  describe('Delivery phase transitions', () => {
    it('should allow READY_FOR_PICKUP to IN_TRANSIT', () => {
      expect(isValidStatusTransition('READY_FOR_PICKUP', 'IN_TRANSIT')).toBe(true);
    });

    it('should allow READY_FOR_PICKUP to DELIVERED', () => {
      expect(isValidStatusTransition('READY_FOR_PICKUP', 'DELIVERED')).toBe(true);
    });

    it('should allow IN_TRANSIT to DELIVERED', () => {
      expect(isValidStatusTransition('IN_TRANSIT', 'DELIVERED')).toBe(true);
    });

    it('should allow DELIVERED to TRY_IN_SCHEDULED', () => {
      expect(isValidStatusTransition('DELIVERED', 'TRY_IN_SCHEDULED')).toBe(true);
    });

    it('should allow DELIVERED to COMPLETED', () => {
      expect(isValidStatusTransition('DELIVERED', 'COMPLETED')).toBe(true);
    });

    it('should allow DELIVERED to ADJUSTMENT_REQUIRED', () => {
      expect(isValidStatusTransition('DELIVERED', 'ADJUSTMENT_REQUIRED')).toBe(true);
    });
  });

  describe('Adjustment phase transitions', () => {
    it('should allow ADJUSTMENT_REQUIRED to ADJUSTMENT_IN_PROGRESS', () => {
      expect(isValidStatusTransition('ADJUSTMENT_REQUIRED', 'ADJUSTMENT_IN_PROGRESS')).toBe(true);
    });

    it('should allow ADJUSTMENT_IN_PROGRESS to QC_INSPECTION', () => {
      expect(isValidStatusTransition('ADJUSTMENT_IN_PROGRESS', 'QC_INSPECTION')).toBe(true);
    });

    it('should allow ADJUSTMENT_IN_PROGRESS to DELIVERED', () => {
      expect(isValidStatusTransition('ADJUSTMENT_IN_PROGRESS', 'DELIVERED')).toBe(true);
    });

    it('should allow TRY_IN_SCHEDULED to ADJUSTMENT_REQUIRED', () => {
      expect(isValidStatusTransition('TRY_IN_SCHEDULED', 'ADJUSTMENT_REQUIRED')).toBe(true);
    });

    it('should allow TRY_IN_SCHEDULED to COMPLETED', () => {
      expect(isValidStatusTransition('TRY_IN_SCHEDULED', 'COMPLETED')).toBe(true);
    });
  });

  describe('Terminal states', () => {
    it('should not allow transitions from COMPLETED', () => {
      expect(isValidStatusTransition('COMPLETED', 'RECEIVED')).toBe(false);
      expect(isValidStatusTransition('COMPLETED', 'IN_DESIGN')).toBe(false);
      expect(isValidStatusTransition('COMPLETED', 'CANCELLED')).toBe(false);
    });

    it('should not allow transitions from CANCELLED', () => {
      expect(isValidStatusTransition('CANCELLED', 'RECEIVED')).toBe(false);
      expect(isValidStatusTransition('CANCELLED', 'IN_DESIGN')).toBe(false);
      expect(isValidStatusTransition('CANCELLED', 'COMPLETED')).toBe(false);
    });
  });

  describe('ON_HOLD transitions', () => {
    it('should allow ON_HOLD to resume various states', () => {
      expect(isValidStatusTransition('ON_HOLD', 'RECEIVED')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'PENDING_SCAN')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'SCAN_RECEIVED')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'IN_DESIGN')).toBe(true);
      expect(isValidStatusTransition('ON_HOLD', 'QUEUED_FOR_MILLING')).toBe(true);
    });

    it('should not allow ON_HOLD to jump ahead', () => {
      expect(isValidStatusTransition('ON_HOLD', 'COMPLETED')).toBe(false);
      expect(isValidStatusTransition('ON_HOLD', 'DELIVERED')).toBe(false);
    });
  });
});

// ============================================================================
// SLA HOURS TESTS
// ============================================================================

describe('getSLAHours', () => {
  it('should return 4 hours for RECEIVED', () => {
    expect(getSLAHours('RECEIVED')).toBe(4);
  });

  it('should return 24 hours for PENDING_SCAN', () => {
    expect(getSLAHours('PENDING_SCAN')).toBe(24);
  });

  it('should return 48 hours for IN_DESIGN', () => {
    expect(getSLAHours('IN_DESIGN')).toBe(48);
  });

  it('should return 24 hours for MILLING', () => {
    expect(getSLAHours('MILLING')).toBe(24);
  });

  it('should return 4 hours for QC_INSPECTION', () => {
    expect(getSLAHours('QC_INSPECTION')).toBe(4);
  });

  it('should return 2 hours for QC_PASSED', () => {
    expect(getSLAHours('QC_PASSED')).toBe(2);
  });

  it('should return 0 hours for terminal states', () => {
    expect(getSLAHours('COMPLETED')).toBe(0);
    expect(getSLAHours('CANCELLED')).toBe(0);
    expect(getSLAHours('DELIVERED')).toBe(0);
  });

  it('should return correct hours for all statuses', () => {
    for (const status of LAB_CASE_STATUSES) {
      const hours = getSLAHours(status);
      expect(typeof hours).toBe('number');
      expect(hours).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// SLA DEADLINE TESTS
// ============================================================================

describe('calculateSLADeadline', () => {
  it('should calculate deadline correctly for RECEIVED (4 hours)', () => {
    const fromTime = new Date('2024-01-15T10:00:00Z');
    const deadline = calculateSLADeadline('RECEIVED', fromTime);
    expect(deadline.getTime()).toBe(new Date('2024-01-15T14:00:00Z').getTime());
  });

  it('should calculate deadline correctly for IN_DESIGN (48 hours)', () => {
    const fromTime = new Date('2024-01-15T10:00:00Z');
    const deadline = calculateSLADeadline('IN_DESIGN', fromTime);
    expect(deadline.getTime()).toBe(new Date('2024-01-17T10:00:00Z').getTime());
  });

  it('should calculate deadline correctly for QC_PASSED (2 hours)', () => {
    const fromTime = new Date('2024-01-15T10:00:00Z');
    const deadline = calculateSLADeadline('QC_PASSED', fromTime);
    expect(deadline.getTime()).toBe(new Date('2024-01-15T12:00:00Z').getTime());
  });

  it('should return same time for terminal states (0 hours)', () => {
    const fromTime = new Date('2024-01-15T10:00:00Z');
    const deadline = calculateSLADeadline('COMPLETED', fromTime);
    expect(deadline.getTime()).toBe(fromTime.getTime());
  });
});

// ============================================================================
// ACTIVE STATUS TESTS
// ============================================================================

describe('isActiveStatus', () => {
  it('should return false for COMPLETED', () => {
    expect(isActiveStatus('COMPLETED')).toBe(false);
  });

  it('should return false for CANCELLED', () => {
    expect(isActiveStatus('CANCELLED')).toBe(false);
  });

  it('should return true for all other statuses', () => {
    const activeStatuses = LAB_CASE_STATUSES.filter((s) => s !== 'COMPLETED' && s !== 'CANCELLED');
    for (const status of activeStatuses) {
      expect(isActiveStatus(status)).toBe(true);
    }
  });
});

// ============================================================================
// DESIGN PHASE TESTS
// ============================================================================

describe('isDesignPhase', () => {
  it('should return true for IN_DESIGN', () => {
    expect(isDesignPhase('IN_DESIGN')).toBe(true);
  });

  it('should return true for DESIGN_REVIEW', () => {
    expect(isDesignPhase('DESIGN_REVIEW')).toBe(true);
  });

  it('should return true for DESIGN_APPROVED', () => {
    expect(isDesignPhase('DESIGN_APPROVED')).toBe(true);
  });

  it('should return true for DESIGN_REVISION', () => {
    expect(isDesignPhase('DESIGN_REVISION')).toBe(true);
  });

  it('should return false for non-design statuses', () => {
    expect(isDesignPhase('RECEIVED')).toBe(false);
    expect(isDesignPhase('MILLING')).toBe(false);
    expect(isDesignPhase('QC_INSPECTION')).toBe(false);
    expect(isDesignPhase('DELIVERED')).toBe(false);
  });
});

// ============================================================================
// FABRICATION PHASE TESTS
// ============================================================================

describe('isFabricationPhase', () => {
  it('should return true for QUEUED_FOR_MILLING', () => {
    expect(isFabricationPhase('QUEUED_FOR_MILLING')).toBe(true);
  });

  it('should return true for MILLING', () => {
    expect(isFabricationPhase('MILLING')).toBe(true);
  });

  it('should return true for POST_PROCESSING', () => {
    expect(isFabricationPhase('POST_PROCESSING')).toBe(true);
  });

  it('should return true for FINISHING', () => {
    expect(isFabricationPhase('FINISHING')).toBe(true);
  });

  it('should return false for non-fabrication statuses', () => {
    expect(isFabricationPhase('RECEIVED')).toBe(false);
    expect(isFabricationPhase('IN_DESIGN')).toBe(false);
    expect(isFabricationPhase('QC_INSPECTION')).toBe(false);
    expect(isFabricationPhase('DELIVERED')).toBe(false);
  });
});

// ============================================================================
// QC SCORE CALCULATION TESTS
// ============================================================================

describe('calculateQCScore', () => {
  it('should return 0 for empty criteria', () => {
    expect(calculateQCScore([])).toBe(0);
  });

  it('should calculate weighted score correctly', () => {
    const criteria: QCCriteriaResult[] = [
      { criterion: 'MARGINAL_FIT', passed: true, score: 10 }, // weight 20
      { criterion: 'OCCLUSION', passed: true, score: 10 }, // weight 20
    ];
    // Both have score 10/10 = 100%, weighted by 20+20=40
    // Expected: (10/10 * 20 + 10/10 * 20) / 40 * 100 = 100
    expect(calculateQCScore(criteria)).toBe(100);
  });

  it('should calculate partial scores correctly', () => {
    const criteria: QCCriteriaResult[] = [
      { criterion: 'MARGINAL_FIT', passed: true, score: 5 }, // weight 20
      { criterion: 'OCCLUSION', passed: true, score: 10 }, // weight 20
    ];
    // (5/10 * 20 + 10/10 * 20) / 40 * 100 = (10 + 20) / 40 * 100 = 75
    expect(calculateQCScore(criteria)).toBe(75);
  });

  it('should handle all criteria types with their weights', () => {
    const criteria: QCCriteriaResult[] = [
      { criterion: 'MARGINAL_FIT', passed: true, score: 10 }, // 20
      { criterion: 'OCCLUSION', passed: true, score: 10 }, // 20
      { criterion: 'CONTACTS', passed: true, score: 10 }, // 15
      { criterion: 'AESTHETICS', passed: true, score: 10 }, // 15
      { criterion: 'CONTOUR', passed: true, score: 10 }, // 10
      { criterion: 'EMERGENCE', passed: true, score: 10 }, // 10
      { criterion: 'SHADE_MATCH', passed: true, score: 10 }, // 5
      { criterion: 'SURFACE_FINISH', passed: true, score: 10 }, // 5
    ];
    // All perfect scores = 100
    expect(calculateQCScore(criteria)).toBe(100);
  });

  it('should calculate low scores correctly', () => {
    const criteria: QCCriteriaResult[] = [
      { criterion: 'MARGINAL_FIT', passed: false, score: 2 },
      { criterion: 'OCCLUSION', passed: false, score: 3 },
    ];
    // (2/10 * 20 + 3/10 * 20) / 40 * 100 = (4 + 6) / 40 * 100 = 25
    expect(calculateQCScore(criteria)).toBe(25);
  });
});

// ============================================================================
// QC PASS DETERMINATION TESTS
// ============================================================================

describe('didQCPass', () => {
  it('should return false for empty criteria', () => {
    expect(didQCPass([])).toBe(false);
  });

  it('should return true when all passed and score >= 70', () => {
    const criteria: QCCriteriaResult[] = [
      { criterion: 'MARGINAL_FIT', passed: true, score: 8 },
      { criterion: 'OCCLUSION', passed: true, score: 8 },
    ];
    expect(didQCPass(criteria)).toBe(true);
  });

  it('should return false when any criterion failed', () => {
    const criteria: QCCriteriaResult[] = [
      { criterion: 'MARGINAL_FIT', passed: true, score: 10 },
      { criterion: 'OCCLUSION', passed: false, score: 8 },
    ];
    expect(didQCPass(criteria)).toBe(false);
  });

  it('should return false when score < 70 even if all passed', () => {
    const criteria: QCCriteriaResult[] = [
      { criterion: 'MARGINAL_FIT', passed: true, score: 6 },
      { criterion: 'OCCLUSION', passed: true, score: 6 },
    ];
    // Score = (6/10 * 20 + 6/10 * 20) / 40 * 100 = 60%
    expect(didQCPass(criteria)).toBe(false);
  });

  it('should return true at exactly 70 threshold', () => {
    const criteria: QCCriteriaResult[] = [
      { criterion: 'MARGINAL_FIT', passed: true, score: 7 },
      { criterion: 'OCCLUSION', passed: true, score: 7 },
    ];
    // Score = 70%
    expect(didQCPass(criteria)).toBe(true);
  });
});

// ============================================================================
// DAYS UNTIL DUE TESTS
// ============================================================================

describe('getDaysUntilDue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return positive days for future due date', () => {
    const dueDate = new Date('2024-01-20T12:00:00Z');
    expect(getDaysUntilDue(dueDate)).toBe(5);
  });

  it('should return negative days for past due date', () => {
    const dueDate = new Date('2024-01-10T12:00:00Z');
    expect(getDaysUntilDue(dueDate)).toBe(-5);
  });

  it('should return 0 for same day', () => {
    const dueDate = new Date('2024-01-15T12:00:00Z');
    expect(getDaysUntilDue(dueDate)).toBe(0);
  });

  it('should round up partial days', () => {
    const dueDate = new Date('2024-01-16T00:00:00Z');
    // 12 hours from now
    expect(getDaysUntilDue(dueDate)).toBe(1);
  });
});

// ============================================================================
// CASE OVERDUE TESTS
// ============================================================================

describe('isCaseOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true for active case with past due date', () => {
    const dueDate = new Date('2024-01-10T12:00:00Z');
    expect(isCaseOverdue(dueDate, 'IN_DESIGN')).toBe(true);
  });

  it('should return false for active case with future due date', () => {
    const dueDate = new Date('2024-01-20T12:00:00Z');
    expect(isCaseOverdue(dueDate, 'IN_DESIGN')).toBe(false);
  });

  it('should return false for COMPLETED even if past due', () => {
    const dueDate = new Date('2024-01-10T12:00:00Z');
    expect(isCaseOverdue(dueDate, 'COMPLETED')).toBe(false);
  });

  it('should return false for CANCELLED even if past due', () => {
    const dueDate = new Date('2024-01-10T12:00:00Z');
    expect(isCaseOverdue(dueDate, 'CANCELLED')).toBe(false);
  });

  it('should return true for ON_HOLD with past due date', () => {
    const dueDate = new Date('2024-01-10T12:00:00Z');
    expect(isCaseOverdue(dueDate, 'ON_HOLD')).toBe(true);
  });
});

// ============================================================================
// PRIORITY MULTIPLIER TESTS
// ============================================================================

describe('getPriorityMultiplier', () => {
  it('should return 1 for STANDARD', () => {
    expect(getPriorityMultiplier('STANDARD')).toBe(1);
  });

  it('should return 0.5 for RUSH', () => {
    expect(getPriorityMultiplier('RUSH')).toBe(0.5);
  });

  it('should return 0.25 for EMERGENCY', () => {
    expect(getPriorityMultiplier('EMERGENCY')).toBe(0.25);
  });

  it('should return 0.75 for VIP', () => {
    expect(getPriorityMultiplier('VIP')).toBe(0.75);
  });

  it('should return a multiplier for all priorities', () => {
    for (const priority of LAB_CASE_PRIORITIES) {
      const multiplier = getPriorityMultiplier(priority);
      expect(typeof multiplier).toBe('number');
      expect(multiplier).toBeGreaterThan(0);
      expect(multiplier).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// FORMAT CASE NUMBER TESTS
// ============================================================================

describe('formatCaseNumber', () => {
  it('should return the case number unchanged', () => {
    expect(formatCaseNumber('LC-2024-0001')).toBe('LC-2024-0001');
  });

  it('should handle empty string', () => {
    expect(formatCaseNumber('')).toBe('');
  });

  it('should handle various formats', () => {
    expect(formatCaseNumber('CASE123')).toBe('CASE123');
    expect(formatCaseNumber('lab-case-001')).toBe('lab-case-001');
  });
});

// ============================================================================
// GENERATE CASE SUMMARY TESTS
// ============================================================================

describe('generateCaseSummary', () => {
  it('should generate summary for single prosthetic', () => {
    const labCase = {
      caseNumber: 'LC-2024-0001',
      prosthetics: [{ type: 'CROWN' as const, toothNumbers: [14] }],
      status: 'IN_DESIGN' as const,
    };
    expect(generateCaseSummary(labCase)).toBe('LC-2024-0001: 1 unit(s) - CROWN [IN_DESIGN]');
  });

  it('should generate summary for multiple teeth on one prosthetic', () => {
    const labCase = {
      caseNumber: 'LC-2024-0002',
      prosthetics: [{ type: 'BRIDGE' as const, toothNumbers: [14, 15, 16] }],
      status: 'MILLING' as const,
    };
    expect(generateCaseSummary(labCase)).toBe('LC-2024-0002: 3 unit(s) - BRIDGE [MILLING]');
  });

  it('should generate summary for multiple prosthetics', () => {
    const labCase = {
      caseNumber: 'LC-2024-0003',
      prosthetics: [
        { type: 'CROWN' as const, toothNumbers: [14] },
        { type: 'VENEER' as const, toothNumbers: [11, 12] },
      ],
      status: 'QC_INSPECTION' as const,
    };
    expect(generateCaseSummary(labCase)).toBe(
      'LC-2024-0003: 3 unit(s) - CROWN, VENEER [QC_INSPECTION]'
    );
  });

  it('should generate summary for empty prosthetics', () => {
    const labCase = {
      caseNumber: 'LC-2024-0004',
      prosthetics: [],
      status: 'RECEIVED' as const,
    };
    expect(generateCaseSummary(labCase)).toBe('LC-2024-0004: 0 unit(s) -  [RECEIVED]');
  });

  it('should deduplicate prosthetic types', () => {
    const labCase = {
      caseNumber: 'LC-2024-0005',
      prosthetics: [
        { type: 'CROWN' as const, toothNumbers: [14] },
        { type: 'CROWN' as const, toothNumbers: [24] },
      ],
      status: 'COMPLETED' as const,
    };
    expect(generateCaseSummary(labCase)).toBe('LC-2024-0005: 2 unit(s) - CROWN [COMPLETED]');
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('Constants', () => {
  it('should have all lab case statuses defined', () => {
    expect(LAB_CASE_STATUSES.length).toBeGreaterThan(20);
    expect(LAB_CASE_STATUSES).toContain('RECEIVED');
    expect(LAB_CASE_STATUSES).toContain('IN_DESIGN');
    expect(LAB_CASE_STATUSES).toContain('MILLING');
    expect(LAB_CASE_STATUSES).toContain('COMPLETED');
    expect(LAB_CASE_STATUSES).toContain('CANCELLED');
  });

  it('should have all priorities defined', () => {
    expect(LAB_CASE_PRIORITIES).toContain('STANDARD');
    expect(LAB_CASE_PRIORITIES).toContain('RUSH');
    expect(LAB_CASE_PRIORITIES).toContain('EMERGENCY');
    expect(LAB_CASE_PRIORITIES).toContain('VIP');
  });

  it('should have all QC criteria defined', () => {
    expect(QC_CRITERIA).toContain('MARGINAL_FIT');
    expect(QC_CRITERIA).toContain('OCCLUSION');
    expect(QC_CRITERIA).toContain('CONTACTS');
    expect(QC_CRITERIA).toContain('AESTHETICS');
  });
});
