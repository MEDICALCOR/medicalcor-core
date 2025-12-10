/**
 * @fileoverview Lab Case Status Tests
 *
 * Tests for dental laboratory case status management.
 * Covers status validation, transitions, phases, and SLA calculations.
 *
 * @module domain/dental-lab/__tests__/lab-case-status
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  LAB_CASE_STATUSES,
  ACTIVE_STATUSES,
  DESIGN_PHASE_STATUSES,
  FABRICATION_PHASE_STATUSES,
  TERMINAL_STATUSES,
  VALID_STATUS_TRANSITIONS,
  LAB_CASE_SLA_HOURS,
  isValidLabCaseStatus,
  isValidStatusTransition,
  isActiveLabCase,
  isInDesignPhase,
  isInFabricationPhase,
  isTerminalStatus,
  getNextAllowedStatuses,
  getSLADeadline,
  type LabCaseStatus,
} from '../value-objects/LabCaseStatus.js';

// =============================================================================
// TEST SUITE
// =============================================================================

describe('LabCaseStatus', () => {
  // ===========================================================================
  // STATUS CONSTANTS
  // ===========================================================================

  describe('LAB_CASE_STATUSES', () => {
    it('should have all expected statuses', () => {
      expect(LAB_CASE_STATUSES).toContain('RECEIVED');
      expect(LAB_CASE_STATUSES).toContain('PENDING_SCAN');
      expect(LAB_CASE_STATUSES).toContain('SCAN_RECEIVED');
      expect(LAB_CASE_STATUSES).toContain('IN_DESIGN');
      expect(LAB_CASE_STATUSES).toContain('DESIGN_REVIEW');
      expect(LAB_CASE_STATUSES).toContain('DESIGN_APPROVED');
      expect(LAB_CASE_STATUSES).toContain('COMPLETED');
      expect(LAB_CASE_STATUSES).toContain('CANCELLED');
    });

    it('should have correct number of statuses', () => {
      expect(LAB_CASE_STATUSES.length).toBe(23);
    });
  });

  describe('STATUS_GROUPS', () => {
    it('should have correct active statuses', () => {
      expect(ACTIVE_STATUSES).toContain('RECEIVED');
      expect(ACTIVE_STATUSES).toContain('IN_DESIGN');
      expect(ACTIVE_STATUSES).toContain('MILLING');
      expect(ACTIVE_STATUSES).not.toContain('COMPLETED');
      expect(ACTIVE_STATUSES).not.toContain('CANCELLED');
    });

    it('should have correct design phase statuses', () => {
      expect(DESIGN_PHASE_STATUSES).toContain('IN_DESIGN');
      expect(DESIGN_PHASE_STATUSES).toContain('DESIGN_REVIEW');
      expect(DESIGN_PHASE_STATUSES).toContain('DESIGN_APPROVED');
      expect(DESIGN_PHASE_STATUSES).toContain('DESIGN_REVISION');
      expect(DESIGN_PHASE_STATUSES).not.toContain('MILLING');
    });

    it('should have correct fabrication phase statuses', () => {
      expect(FABRICATION_PHASE_STATUSES).toContain('QUEUED_FOR_MILLING');
      expect(FABRICATION_PHASE_STATUSES).toContain('MILLING');
      expect(FABRICATION_PHASE_STATUSES).toContain('POST_PROCESSING');
      expect(FABRICATION_PHASE_STATUSES).toContain('FINISHING');
      expect(FABRICATION_PHASE_STATUSES).not.toContain('IN_DESIGN');
    });

    it('should have correct terminal statuses', () => {
      expect(TERMINAL_STATUSES).toContain('COMPLETED');
      expect(TERMINAL_STATUSES).toContain('CANCELLED');
      expect(TERMINAL_STATUSES.length).toBe(2);
    });
  });

  // ===========================================================================
  // VALIDATION FUNCTIONS
  // ===========================================================================

  describe('isValidLabCaseStatus', () => {
    it('should return true for valid statuses', () => {
      for (const status of LAB_CASE_STATUSES) {
        expect(isValidLabCaseStatus(status)).toBe(true);
      }
    });

    it('should return false for invalid statuses', () => {
      expect(isValidLabCaseStatus('INVALID')).toBe(false);
      expect(isValidLabCaseStatus('')).toBe(false);
      expect(isValidLabCaseStatus(null)).toBe(false);
      expect(isValidLabCaseStatus(undefined)).toBe(false);
      expect(isValidLabCaseStatus(123)).toBe(false);
      expect(isValidLabCaseStatus({})).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(isValidLabCaseStatus('received')).toBe(false);
      expect(isValidLabCaseStatus('Received')).toBe(false);
      expect(isValidLabCaseStatus('RECEIVED')).toBe(true);
    });
  });

  // ===========================================================================
  // STATUS TRANSITIONS
  // ===========================================================================

  describe('isValidStatusTransition', () => {
    it('should allow valid transitions from RECEIVED', () => {
      expect(isValidStatusTransition('RECEIVED', 'PENDING_SCAN')).toBe(true);
      expect(isValidStatusTransition('RECEIVED', 'SCAN_RECEIVED')).toBe(true);
      expect(isValidStatusTransition('RECEIVED', 'CANCELLED')).toBe(true);
      expect(isValidStatusTransition('RECEIVED', 'ON_HOLD')).toBe(true);
    });

    it('should reject invalid transitions from RECEIVED', () => {
      expect(isValidStatusTransition('RECEIVED', 'IN_DESIGN')).toBe(false);
      expect(isValidStatusTransition('RECEIVED', 'MILLING')).toBe(false);
      expect(isValidStatusTransition('RECEIVED', 'COMPLETED')).toBe(false);
    });

    it('should allow design workflow transitions', () => {
      expect(isValidStatusTransition('SCAN_RECEIVED', 'IN_DESIGN')).toBe(true);
      expect(isValidStatusTransition('IN_DESIGN', 'DESIGN_REVIEW')).toBe(true);
      expect(isValidStatusTransition('DESIGN_REVIEW', 'DESIGN_APPROVED')).toBe(true);
      expect(isValidStatusTransition('DESIGN_REVIEW', 'DESIGN_REVISION')).toBe(true);
      expect(isValidStatusTransition('DESIGN_APPROVED', 'QUEUED_FOR_MILLING')).toBe(true);
    });

    it('should allow fabrication workflow transitions', () => {
      expect(isValidStatusTransition('QUEUED_FOR_MILLING', 'MILLING')).toBe(true);
      expect(isValidStatusTransition('MILLING', 'POST_PROCESSING')).toBe(true);
      expect(isValidStatusTransition('POST_PROCESSING', 'FINISHING')).toBe(true);
      expect(isValidStatusTransition('FINISHING', 'QC_INSPECTION')).toBe(true);
    });

    it('should allow QC workflow transitions', () => {
      expect(isValidStatusTransition('QC_INSPECTION', 'QC_PASSED')).toBe(true);
      expect(isValidStatusTransition('QC_INSPECTION', 'QC_FAILED')).toBe(true);
      expect(isValidStatusTransition('QC_PASSED', 'READY_FOR_PICKUP')).toBe(true);
    });

    it('should allow delivery workflow transitions', () => {
      expect(isValidStatusTransition('READY_FOR_PICKUP', 'IN_TRANSIT')).toBe(true);
      expect(isValidStatusTransition('READY_FOR_PICKUP', 'DELIVERED')).toBe(true);
      expect(isValidStatusTransition('IN_TRANSIT', 'DELIVERED')).toBe(true);
      expect(isValidStatusTransition('DELIVERED', 'COMPLETED')).toBe(true);
    });

    it('should not allow transitions from terminal statuses', () => {
      expect(getNextAllowedStatuses('COMPLETED')).toHaveLength(0);
      expect(getNextAllowedStatuses('CANCELLED')).toHaveLength(0);
    });

    it('should allow ON_HOLD to return to various statuses', () => {
      const onHoldTransitions = VALID_STATUS_TRANSITIONS['ON_HOLD'];
      expect(onHoldTransitions).toContain('RECEIVED');
      expect(onHoldTransitions).toContain('IN_DESIGN');
      expect(onHoldTransitions).toContain('QUEUED_FOR_MILLING');
    });
  });

  describe('getNextAllowedStatuses', () => {
    it('should return allowed transitions for each status', () => {
      for (const status of LAB_CASE_STATUSES) {
        const nextStatuses = getNextAllowedStatuses(status);
        expect(Array.isArray(nextStatuses)).toBe(true);
      }
    });

    it('should return empty array for terminal statuses', () => {
      expect(getNextAllowedStatuses('COMPLETED')).toHaveLength(0);
      expect(getNextAllowedStatuses('CANCELLED')).toHaveLength(0);
    });

    it('should return non-empty array for active statuses', () => {
      for (const status of ACTIVE_STATUSES) {
        if (!TERMINAL_STATUSES.includes(status as any)) {
          const next = getNextAllowedStatuses(status);
          expect(next.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ===========================================================================
  // PHASE CHECKS
  // ===========================================================================

  describe('isActiveLabCase', () => {
    it('should return true for active statuses', () => {
      expect(isActiveLabCase('RECEIVED')).toBe(true);
      expect(isActiveLabCase('IN_DESIGN')).toBe(true);
      expect(isActiveLabCase('MILLING')).toBe(true);
      expect(isActiveLabCase('QC_INSPECTION')).toBe(true);
    });

    it('should return false for terminal statuses', () => {
      expect(isActiveLabCase('COMPLETED')).toBe(false);
      expect(isActiveLabCase('CANCELLED')).toBe(false);
    });

    it('should return false for delivery statuses', () => {
      expect(isActiveLabCase('DELIVERED')).toBe(false);
      expect(isActiveLabCase('READY_FOR_PICKUP')).toBe(false);
    });
  });

  describe('isInDesignPhase', () => {
    it('should return true for design phase statuses', () => {
      expect(isInDesignPhase('IN_DESIGN')).toBe(true);
      expect(isInDesignPhase('DESIGN_REVIEW')).toBe(true);
      expect(isInDesignPhase('DESIGN_APPROVED')).toBe(true);
      expect(isInDesignPhase('DESIGN_REVISION')).toBe(true);
    });

    it('should return false for non-design statuses', () => {
      expect(isInDesignPhase('RECEIVED')).toBe(false);
      expect(isInDesignPhase('MILLING')).toBe(false);
      expect(isInDesignPhase('COMPLETED')).toBe(false);
    });
  });

  describe('isInFabricationPhase', () => {
    it('should return true for fabrication phase statuses', () => {
      expect(isInFabricationPhase('QUEUED_FOR_MILLING')).toBe(true);
      expect(isInFabricationPhase('MILLING')).toBe(true);
      expect(isInFabricationPhase('POST_PROCESSING')).toBe(true);
      expect(isInFabricationPhase('FINISHING')).toBe(true);
    });

    it('should return false for non-fabrication statuses', () => {
      expect(isInFabricationPhase('IN_DESIGN')).toBe(false);
      expect(isInFabricationPhase('QC_INSPECTION')).toBe(false);
      expect(isInFabricationPhase('DELIVERED')).toBe(false);
    });
  });

  describe('isTerminalStatus', () => {
    it('should return true for terminal statuses', () => {
      expect(isTerminalStatus('COMPLETED')).toBe(true);
      expect(isTerminalStatus('CANCELLED')).toBe(true);
    });

    it('should return false for non-terminal statuses', () => {
      expect(isTerminalStatus('RECEIVED')).toBe(false);
      expect(isTerminalStatus('IN_DESIGN')).toBe(false);
      expect(isTerminalStatus('DELIVERED')).toBe(false);
      expect(isTerminalStatus('ON_HOLD')).toBe(false);
    });
  });

  // ===========================================================================
  // SLA CALCULATIONS
  // ===========================================================================

  describe('LAB_CASE_SLA_HOURS', () => {
    it('should have SLA hours for all statuses', () => {
      for (const status of LAB_CASE_STATUSES) {
        expect(LAB_CASE_SLA_HOURS[status]).toBeDefined();
        expect(typeof LAB_CASE_SLA_HOURS[status]).toBe('number');
      }
    });

    it('should have zero SLA for terminal statuses', () => {
      expect(LAB_CASE_SLA_HOURS['COMPLETED']).toBe(0);
      expect(LAB_CASE_SLA_HOURS['CANCELLED']).toBe(0);
      expect(LAB_CASE_SLA_HOURS['ON_HOLD']).toBe(0);
    });

    it('should have positive SLA for active statuses', () => {
      expect(LAB_CASE_SLA_HOURS['RECEIVED']).toBeGreaterThan(0);
      expect(LAB_CASE_SLA_HOURS['IN_DESIGN']).toBeGreaterThan(0);
      expect(LAB_CASE_SLA_HOURS['MILLING']).toBeGreaterThan(0);
    });
  });

  describe('getSLADeadline', () => {
    it('should calculate correct deadline for RECEIVED status', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const deadline = getSLADeadline('RECEIVED', startTime);

      // RECEIVED has 4 hour SLA
      expect(deadline.getTime()).toBe(startTime.getTime() + 4 * 60 * 60 * 1000);
    });

    it('should calculate correct deadline for IN_DESIGN status', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const deadline = getSLADeadline('IN_DESIGN', startTime);

      // IN_DESIGN has 48 hour SLA
      expect(deadline.getTime()).toBe(startTime.getTime() + 48 * 60 * 60 * 1000);
    });

    it('should return same time for zero SLA statuses', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const deadline = getSLADeadline('COMPLETED', startTime);

      expect(deadline.getTime()).toBe(startTime.getTime());
    });

    it('should handle different start times', () => {
      const time1 = new Date('2024-01-15T10:00:00Z');
      const time2 = new Date('2024-01-16T10:00:00Z');

      const deadline1 = getSLADeadline('RECEIVED', time1);
      const deadline2 = getSLADeadline('RECEIVED', time2);

      expect(deadline2.getTime() - deadline1.getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('should have valid transition targets for all statuses', () => {
      for (const status of LAB_CASE_STATUSES) {
        const nextStatuses = getNextAllowedStatuses(status);
        for (const nextStatus of nextStatuses) {
          expect(LAB_CASE_STATUSES).toContain(nextStatus);
        }
      }
    });

    it('should not have self-transitions', () => {
      for (const status of LAB_CASE_STATUSES) {
        const nextStatuses = getNextAllowedStatuses(status);
        expect(nextStatuses).not.toContain(status);
      }
    });

    it('should have SLA deadline after or equal to start time', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...LAB_CASE_STATUSES),
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
          (status, startTime) => {
            const deadline = getSLADeadline(status, startTime);
            return deadline.getTime() >= startTime.getTime();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate all status constants correctly', () => {
      fc.assert(
        fc.property(fc.constantFrom(...LAB_CASE_STATUSES), (status) => {
          return isValidLabCaseStatus(status) === true;
        }),
        { numRuns: 50 }
      );
    });

    it('should reject random strings as statuses', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => !LAB_CASE_STATUSES.includes(s as any)),
          (randomString) => {
            return isValidLabCaseStatus(randomString) === false;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle QC_FAILED rework transitions', () => {
      const failedTransitions = getNextAllowedStatuses('QC_FAILED');
      expect(failedTransitions).toContain('IN_DESIGN');
      expect(failedTransitions).toContain('MILLING');
      expect(failedTransitions).toContain('CANCELLED');
    });

    it('should handle adjustment workflow', () => {
      expect(isValidStatusTransition('DELIVERED', 'ADJUSTMENT_REQUIRED')).toBe(true);
      expect(isValidStatusTransition('ADJUSTMENT_REQUIRED', 'ADJUSTMENT_IN_PROGRESS')).toBe(true);
      expect(isValidStatusTransition('ADJUSTMENT_IN_PROGRESS', 'QC_INSPECTION')).toBe(true);
    });

    it('should handle try-in workflow', () => {
      expect(isValidStatusTransition('DELIVERED', 'TRY_IN_SCHEDULED')).toBe(true);
      expect(isValidStatusTransition('TRY_IN_SCHEDULED', 'COMPLETED')).toBe(true);
      expect(isValidStatusTransition('TRY_IN_SCHEDULED', 'ADJUSTMENT_REQUIRED')).toBe(true);
    });

    it('should ensure design revision can restart design', () => {
      expect(isValidStatusTransition('DESIGN_REVISION', 'IN_DESIGN')).toBe(true);
    });

    it('should ensure approved design can be revised', () => {
      expect(isValidStatusTransition('DESIGN_APPROVED', 'DESIGN_REVISION')).toBe(true);
    });

    it('should ensure milling can fail QC', () => {
      expect(isValidStatusTransition('MILLING', 'QC_FAILED')).toBe(true);
    });
  });
});
