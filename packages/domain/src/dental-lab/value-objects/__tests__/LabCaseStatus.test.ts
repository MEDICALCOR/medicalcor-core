/**
 * @fileoverview Tests for LabCaseStatus Value Object
 *
 * Comprehensive tests for lab case status transitions and helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
} from '../LabCaseStatus.js';
import type { LabCaseStatus } from '../LabCaseStatus.js';

describe('LabCaseStatus Value Object', () => {
  // ==========================================================================
  // STATUS CONSTANTS TESTS
  // ==========================================================================

  describe('LAB_CASE_STATUSES', () => {
    it('should contain all expected statuses', () => {
      expect(LAB_CASE_STATUSES).toContain('RECEIVED');
      expect(LAB_CASE_STATUSES).toContain('PENDING_SCAN');
      expect(LAB_CASE_STATUSES).toContain('SCAN_RECEIVED');
      expect(LAB_CASE_STATUSES).toContain('IN_DESIGN');
      expect(LAB_CASE_STATUSES).toContain('DESIGN_REVIEW');
      expect(LAB_CASE_STATUSES).toContain('DESIGN_APPROVED');
      expect(LAB_CASE_STATUSES).toContain('DESIGN_REVISION');
      expect(LAB_CASE_STATUSES).toContain('QUEUED_FOR_MILLING');
      expect(LAB_CASE_STATUSES).toContain('MILLING');
      expect(LAB_CASE_STATUSES).toContain('POST_PROCESSING');
      expect(LAB_CASE_STATUSES).toContain('FINISHING');
      expect(LAB_CASE_STATUSES).toContain('QC_INSPECTION');
      expect(LAB_CASE_STATUSES).toContain('QC_FAILED');
      expect(LAB_CASE_STATUSES).toContain('QC_PASSED');
      expect(LAB_CASE_STATUSES).toContain('READY_FOR_PICKUP');
      expect(LAB_CASE_STATUSES).toContain('IN_TRANSIT');
      expect(LAB_CASE_STATUSES).toContain('DELIVERED');
      expect(LAB_CASE_STATUSES).toContain('TRY_IN_SCHEDULED');
      expect(LAB_CASE_STATUSES).toContain('ADJUSTMENT_REQUIRED');
      expect(LAB_CASE_STATUSES).toContain('ADJUSTMENT_IN_PROGRESS');
      expect(LAB_CASE_STATUSES).toContain('COMPLETED');
      expect(LAB_CASE_STATUSES).toContain('CANCELLED');
      expect(LAB_CASE_STATUSES).toContain('ON_HOLD');
    });

    it('should have correct total count', () => {
      expect(LAB_CASE_STATUSES.length).toBe(23);
    });
  });

  describe('ACTIVE_STATUSES', () => {
    it('should not contain terminal statuses', () => {
      expect(ACTIVE_STATUSES).not.toContain('COMPLETED');
      expect(ACTIVE_STATUSES).not.toContain('CANCELLED');
    });

    it('should contain work-in-progress statuses', () => {
      expect(ACTIVE_STATUSES).toContain('RECEIVED');
      expect(ACTIVE_STATUSES).toContain('IN_DESIGN');
      expect(ACTIVE_STATUSES).toContain('MILLING');
      expect(ACTIVE_STATUSES).toContain('QC_INSPECTION');
    });
  });

  describe('DESIGN_PHASE_STATUSES', () => {
    it('should contain only design-related statuses', () => {
      expect(DESIGN_PHASE_STATUSES).toContain('IN_DESIGN');
      expect(DESIGN_PHASE_STATUSES).toContain('DESIGN_REVIEW');
      expect(DESIGN_PHASE_STATUSES).toContain('DESIGN_APPROVED');
      expect(DESIGN_PHASE_STATUSES).toContain('DESIGN_REVISION');
      expect(DESIGN_PHASE_STATUSES.length).toBe(4);
    });
  });

  describe('FABRICATION_PHASE_STATUSES', () => {
    it('should contain only fabrication-related statuses', () => {
      expect(FABRICATION_PHASE_STATUSES).toContain('QUEUED_FOR_MILLING');
      expect(FABRICATION_PHASE_STATUSES).toContain('MILLING');
      expect(FABRICATION_PHASE_STATUSES).toContain('POST_PROCESSING');
      expect(FABRICATION_PHASE_STATUSES).toContain('FINISHING');
      expect(FABRICATION_PHASE_STATUSES.length).toBe(4);
    });
  });

  describe('TERMINAL_STATUSES', () => {
    it('should contain only terminal statuses', () => {
      expect(TERMINAL_STATUSES).toContain('COMPLETED');
      expect(TERMINAL_STATUSES).toContain('CANCELLED');
      expect(TERMINAL_STATUSES.length).toBe(2);
    });
  });

  // ==========================================================================
  // VALIDATION TESTS
  // ==========================================================================

  describe('isValidLabCaseStatus', () => {
    it('should return true for valid statuses', () => {
      for (const status of LAB_CASE_STATUSES) {
        expect(isValidLabCaseStatus(status)).toBe(true);
      }
    });

    it('should return false for invalid statuses', () => {
      expect(isValidLabCaseStatus('INVALID')).toBe(false);
      expect(isValidLabCaseStatus('pending')).toBe(false); // wrong case
      expect(isValidLabCaseStatus('')).toBe(false);
      expect(isValidLabCaseStatus(null)).toBe(false);
      expect(isValidLabCaseStatus(undefined)).toBe(false);
      expect(isValidLabCaseStatus(123)).toBe(false);
      expect(isValidLabCaseStatus({})).toBe(false);
    });
  });

  // ==========================================================================
  // STATUS TRANSITION TESTS
  // ==========================================================================

  describe('isValidStatusTransition', () => {
    describe('from RECEIVED', () => {
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

      it('should not allow direct transition to IN_DESIGN', () => {
        expect(isValidStatusTransition('RECEIVED', 'IN_DESIGN')).toBe(false);
      });

      it('should not allow direct transition to COMPLETED', () => {
        expect(isValidStatusTransition('RECEIVED', 'COMPLETED')).toBe(false);
      });
    });

    describe('from SCAN_RECEIVED', () => {
      it('should allow transition to IN_DESIGN', () => {
        expect(isValidStatusTransition('SCAN_RECEIVED', 'IN_DESIGN')).toBe(true);
      });

      it('should allow transition to CANCELLED', () => {
        expect(isValidStatusTransition('SCAN_RECEIVED', 'CANCELLED')).toBe(true);
      });
    });

    describe('from IN_DESIGN', () => {
      it('should allow transition to DESIGN_REVIEW', () => {
        expect(isValidStatusTransition('IN_DESIGN', 'DESIGN_REVIEW')).toBe(true);
      });

      it('should not allow transition to MILLING', () => {
        expect(isValidStatusTransition('IN_DESIGN', 'MILLING')).toBe(false);
      });
    });

    describe('from DESIGN_REVIEW', () => {
      it('should allow transition to DESIGN_APPROVED', () => {
        expect(isValidStatusTransition('DESIGN_REVIEW', 'DESIGN_APPROVED')).toBe(true);
      });

      it('should allow transition to DESIGN_REVISION', () => {
        expect(isValidStatusTransition('DESIGN_REVIEW', 'DESIGN_REVISION')).toBe(true);
      });
    });

    describe('from QC_INSPECTION', () => {
      it('should allow transition to QC_PASSED', () => {
        expect(isValidStatusTransition('QC_INSPECTION', 'QC_PASSED')).toBe(true);
      });

      it('should allow transition to QC_FAILED', () => {
        expect(isValidStatusTransition('QC_INSPECTION', 'QC_FAILED')).toBe(true);
      });
    });

    describe('from QC_FAILED', () => {
      it('should allow transition back to IN_DESIGN for rework', () => {
        expect(isValidStatusTransition('QC_FAILED', 'IN_DESIGN')).toBe(true);
      });

      it('should allow transition back to MILLING for rework', () => {
        expect(isValidStatusTransition('QC_FAILED', 'MILLING')).toBe(true);
      });
    });

    describe('from DELIVERED', () => {
      it('should allow transition to TRY_IN_SCHEDULED', () => {
        expect(isValidStatusTransition('DELIVERED', 'TRY_IN_SCHEDULED')).toBe(true);
      });

      it('should allow transition to COMPLETED', () => {
        expect(isValidStatusTransition('DELIVERED', 'COMPLETED')).toBe(true);
      });

      it('should allow transition to ADJUSTMENT_REQUIRED', () => {
        expect(isValidStatusTransition('DELIVERED', 'ADJUSTMENT_REQUIRED')).toBe(true);
      });
    });

    describe('from terminal statuses', () => {
      it('should not allow any transitions from COMPLETED', () => {
        expect(VALID_STATUS_TRANSITIONS['COMPLETED']).toEqual([]);
        expect(isValidStatusTransition('COMPLETED', 'RECEIVED')).toBe(false);
      });

      it('should not allow any transitions from CANCELLED', () => {
        expect(VALID_STATUS_TRANSITIONS['CANCELLED']).toEqual([]);
        expect(isValidStatusTransition('CANCELLED', 'RECEIVED')).toBe(false);
      });
    });

    describe('from ON_HOLD', () => {
      it('should allow transition back to active statuses', () => {
        expect(isValidStatusTransition('ON_HOLD', 'RECEIVED')).toBe(true);
        expect(isValidStatusTransition('ON_HOLD', 'PENDING_SCAN')).toBe(true);
        expect(isValidStatusTransition('ON_HOLD', 'SCAN_RECEIVED')).toBe(true);
        expect(isValidStatusTransition('ON_HOLD', 'IN_DESIGN')).toBe(true);
        expect(isValidStatusTransition('ON_HOLD', 'QUEUED_FOR_MILLING')).toBe(true);
      });
    });
  });

  // ==========================================================================
  // STATUS CATEGORY TESTS
  // ==========================================================================

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
      expect(isTerminalStatus('ON_HOLD')).toBe(false);
    });
  });

  // ==========================================================================
  // NEXT ALLOWED STATUSES TESTS
  // ==========================================================================

  describe('getNextAllowedStatuses', () => {
    it('should return correct transitions for RECEIVED', () => {
      const allowed = getNextAllowedStatuses('RECEIVED');
      expect(allowed).toContain('PENDING_SCAN');
      expect(allowed).toContain('SCAN_RECEIVED');
      expect(allowed).toContain('CANCELLED');
      expect(allowed).toContain('ON_HOLD');
    });

    it('should return empty array for COMPLETED', () => {
      const allowed = getNextAllowedStatuses('COMPLETED');
      expect(allowed).toEqual([]);
    });

    it('should return empty array for CANCELLED', () => {
      const allowed = getNextAllowedStatuses('CANCELLED');
      expect(allowed).toEqual([]);
    });

    it('should return correct transitions for QC_INSPECTION', () => {
      const allowed = getNextAllowedStatuses('QC_INSPECTION');
      expect(allowed).toContain('QC_PASSED');
      expect(allowed).toContain('QC_FAILED');
      expect(allowed.length).toBe(2);
    });
  });

  // ==========================================================================
  // SLA TESTS
  // ==========================================================================

  describe('LAB_CASE_SLA_HOURS', () => {
    it('should have SLA for all statuses', () => {
      for (const status of LAB_CASE_STATUSES) {
        expect(LAB_CASE_SLA_HOURS[status]).toBeDefined();
        expect(typeof LAB_CASE_SLA_HOURS[status]).toBe('number');
      }
    });

    it('should have 4 hours for RECEIVED', () => {
      expect(LAB_CASE_SLA_HOURS['RECEIVED']).toBe(4);
    });

    it('should have 48 hours for IN_DESIGN', () => {
      expect(LAB_CASE_SLA_HOURS['IN_DESIGN']).toBe(48);
    });

    it('should have 0 hours for terminal statuses', () => {
      expect(LAB_CASE_SLA_HOURS['COMPLETED']).toBe(0);
      expect(LAB_CASE_SLA_HOURS['CANCELLED']).toBe(0);
      expect(LAB_CASE_SLA_HOURS['DELIVERED']).toBe(0);
    });
  });

  describe('getSLADeadline', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should calculate correct deadline for RECEIVED (4 hours)', () => {
      const startTime = new Date('2024-01-15T10:00:00.000Z');
      const deadline = getSLADeadline('RECEIVED', startTime);

      expect(deadline.toISOString()).toBe('2024-01-15T14:00:00.000Z');
    });

    it('should calculate correct deadline for IN_DESIGN (48 hours)', () => {
      const startTime = new Date('2024-01-15T10:00:00.000Z');
      const deadline = getSLADeadline('IN_DESIGN', startTime);

      expect(deadline.toISOString()).toBe('2024-01-17T10:00:00.000Z');
    });

    it('should calculate correct deadline for QC_INSPECTION (4 hours)', () => {
      const startTime = new Date('2024-01-15T10:00:00.000Z');
      const deadline = getSLADeadline('QC_INSPECTION', startTime);

      expect(deadline.toISOString()).toBe('2024-01-15T14:00:00.000Z');
    });

    it('should return same time for statuses with 0 SLA hours', () => {
      const startTime = new Date('2024-01-15T10:00:00.000Z');
      const deadline = getSLADeadline('COMPLETED', startTime);

      expect(deadline.toISOString()).toBe(startTime.toISOString());
    });

    it('should handle different start times', () => {
      const startTime = new Date('2024-01-20T15:30:00.000Z');
      const deadline = getSLADeadline('MILLING', startTime);

      // MILLING has 24 hour SLA
      expect(deadline.toISOString()).toBe('2024-01-21T15:30:00.000Z');
    });
  });

  // ==========================================================================
  // COMPLETE WORKFLOW TESTS
  // ==========================================================================

  describe('Complete workflow validation', () => {
    it('should validate happy path workflow', () => {
      const workflow: LabCaseStatus[] = [
        'RECEIVED',
        'SCAN_RECEIVED',
        'IN_DESIGN',
        'DESIGN_REVIEW',
        'DESIGN_APPROVED',
        'QUEUED_FOR_MILLING',
        'MILLING',
        'POST_PROCESSING',
        'FINISHING',
        'QC_INSPECTION',
        'QC_PASSED',
        'READY_FOR_PICKUP',
        'DELIVERED',
        'COMPLETED',
      ];

      for (let i = 0; i < workflow.length - 1; i++) {
        expect(
          isValidStatusTransition(workflow[i], workflow[i + 1]),
          `Transition from ${workflow[i]} to ${workflow[i + 1]} should be valid`
        ).toBe(true);
      }
    });

    it('should validate rework workflow after QC failure', () => {
      const reworkFlow: LabCaseStatus[] = [
        'QC_INSPECTION',
        'QC_FAILED',
        'IN_DESIGN', // Back to design for rework
        'DESIGN_REVIEW',
        'DESIGN_APPROVED',
        'QUEUED_FOR_MILLING',
        'MILLING',
        'POST_PROCESSING',
        'FINISHING',
        'QC_INSPECTION',
        'QC_PASSED',
      ];

      for (let i = 0; i < reworkFlow.length - 1; i++) {
        expect(
          isValidStatusTransition(reworkFlow[i], reworkFlow[i + 1]),
          `Transition from ${reworkFlow[i]} to ${reworkFlow[i + 1]} should be valid`
        ).toBe(true);
      }
    });

    it('should validate adjustment workflow', () => {
      const adjustmentFlow: LabCaseStatus[] = [
        'DELIVERED',
        'ADJUSTMENT_REQUIRED',
        'ADJUSTMENT_IN_PROGRESS',
        'QC_INSPECTION',
        'QC_PASSED',
        'READY_FOR_PICKUP',
        'DELIVERED',
        'COMPLETED',
      ];

      for (let i = 0; i < adjustmentFlow.length - 1; i++) {
        expect(
          isValidStatusTransition(adjustmentFlow[i], adjustmentFlow[i + 1]),
          `Transition from ${adjustmentFlow[i]} to ${adjustmentFlow[i + 1]} should be valid`
        ).toBe(true);
      }
    });

    it('should validate cancellation from early statuses', () => {
      const cancellableStatuses: LabCaseStatus[] = [
        'RECEIVED',
        'PENDING_SCAN',
        'SCAN_RECEIVED',
        'IN_DESIGN',
        'DESIGN_REVISION',
        'QUEUED_FOR_MILLING',
      ];

      for (const status of cancellableStatuses) {
        expect(
          isValidStatusTransition(status, 'CANCELLED'),
          `Should be able to cancel from ${status}`
        ).toBe(true);
      }
    });
  });
});
