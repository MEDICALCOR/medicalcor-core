/**
 * @fileoverview Tests for Capacity Planning Domain Events
 *
 * Tests factory functions for all capacity planning event types.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createShiftCreatedEvent,
  createShiftCancelledEvent,
  createCapacityCalculatedEvent,
  createCapacityCriticalEvent,
  createConflictDetectedEvent,
  createPlanCreatedEvent,
  createStaffingRecommendationEvent,
  createStaffingGapDetectedEvent,
  createForecastGeneratedEvent,
  type EventMetadata,
  type ShiftCreatedPayload,
  type ShiftCancelledPayload,
  type CapacityCalculatedPayload,
  type CapacityCriticalPayload,
  type ConflictDetectedPayload,
  type PlanCreatedPayload,
  type StaffingRecommendationPayload,
  type StaffingGapDetectedPayload,
  type ForecastGeneratedPayload,
} from '../capacity-events.js';

describe('capacity-events', () => {
  const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
  const mockTimestamp = '2024-01-15T10:30:00.000Z';
  const mockRandomUUID = vi.fn().mockReturnValue(mockUUID);

  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockTimestamp));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  const baseMetadata: EventMetadata = {
    clinicId: 'clinic-001',
    source: 'system',
  };

  describe('createShiftCreatedEvent', () => {
    const payload: ShiftCreatedPayload = {
      shiftId: 'shift-001',
      clinicId: 'clinic-001',
      staffId: 'staff-001',
      staffName: 'Dr. Smith',
      staffRole: 'DENTIST',
      startTime: '2024-01-15T09:00:00Z',
      endTime: '2024-01-15T17:00:00Z',
      maxAppointments: 16,
    };

    it('should create shift created event', () => {
      const event = createShiftCreatedEvent('shift-001', payload, 'corr-123', baseMetadata);

      expect(event.type).toBe('shift.created');
      expect(event.aggregateType).toBe('shift');
      expect(event.aggregateId).toBe('shift-001');
      expect(event.correlationId).toBe('corr-123');
      expect(event.payload.staffRole).toBe('DENTIST');
    });

    it('should include all payload fields', () => {
      const event = createShiftCreatedEvent('shift-001', payload, 'corr-123', baseMetadata);

      expect(event.payload.shiftId).toBe('shift-001');
      expect(event.payload.staffName).toBe('Dr. Smith');
      expect(event.payload.maxAppointments).toBe(16);
    });

    it('should support different staff roles', () => {
      const roles = ['DENTIST', 'HYGIENIST', 'ASSISTANT', 'ADMIN', 'RECEPTIONIST'] as const;

      roles.forEach((role) => {
        const event = createShiftCreatedEvent(
          'shift-001',
          { ...payload, staffRole: role },
          'corr-123',
          baseMetadata
        );
        expect(event.payload.staffRole).toBe(role);
      });
    });
  });

  describe('createShiftCancelledEvent', () => {
    const payload: ShiftCancelledPayload = {
      shiftId: 'shift-001',
      staffId: 'staff-001',
      reason: 'Staff sick leave',
      cancelledBy: 'admin-001',
    };

    it('should create shift cancelled event', () => {
      const event = createShiftCancelledEvent('shift-001', payload, 'corr-123', baseMetadata);

      expect(event.type).toBe('shift.cancelled');
      expect(event.aggregateType).toBe('shift');
      expect(event.payload.reason).toBe('Staff sick leave');
      expect(event.payload.cancelledBy).toBe('admin-001');
    });
  });

  describe('createCapacityCalculatedEvent', () => {
    const payload: CapacityCalculatedPayload = {
      planId: 'plan-001',
      clinicId: 'clinic-001',
      date: '2024-01-15',
      utilizationPercent: 75.5,
      level: 'HIGH',
      totalSlots: 100,
      bookedSlots: 75,
      staffCount: 5,
    };

    it('should create capacity calculated event', () => {
      const event = createCapacityCalculatedEvent('plan-001', payload, 'corr-123', baseMetadata);

      expect(event.type).toBe('capacity.calculated');
      expect(event.aggregateType).toBe('capacity-plan');
      expect(event.payload.utilizationPercent).toBe(75.5);
      expect(event.payload.level).toBe('HIGH');
    });

    it('should support all capacity levels', () => {
      const levels = ['UNDERUTILIZED', 'OPTIMAL', 'HIGH', 'CRITICAL', 'OVERBOOKED'] as const;

      levels.forEach((level) => {
        const event = createCapacityCalculatedEvent(
          'plan-001',
          { ...payload, level },
          'corr-123',
          baseMetadata
        );
        expect(event.payload.level).toBe(level);
      });
    });
  });

  describe('createCapacityCriticalEvent', () => {
    const payload: CapacityCriticalPayload = {
      planId: 'plan-001',
      clinicId: 'clinic-001',
      date: '2024-01-15',
      utilizationPercent: 92,
      affectedShifts: ['shift-001', 'shift-002'],
      recommendedAction: 'Add additional staff',
    };

    it('should create capacity critical event', () => {
      const event = createCapacityCriticalEvent('plan-001', payload, 'corr-123', baseMetadata);

      expect(event.type).toBe('capacity.critical');
      expect(event.aggregateType).toBe('capacity-plan');
      expect(event.payload.utilizationPercent).toBe(92);
      expect(event.payload.affectedShifts).toHaveLength(2);
    });

    it('should include recommended action', () => {
      const event = createCapacityCriticalEvent('plan-001', payload, 'corr-123', baseMetadata);

      expect(event.payload.recommendedAction).toBe('Add additional staff');
    });
  });

  describe('createConflictDetectedEvent', () => {
    const payload: ConflictDetectedPayload = {
      conflictType: 'DOUBLE_BOOKING',
      shiftId: 'shift-001',
      conflictingShiftId: 'shift-002',
      staffId: 'staff-001',
      severity: 'HIGH',
      description: 'Staff member scheduled for overlapping shifts',
      suggestedResolution: 'Reassign one shift to different staff',
    };

    it('should create conflict detected event', () => {
      const event = createConflictDetectedEvent('shift-001', payload, 'corr-123', baseMetadata);

      expect(event.type).toBe('conflict.detected');
      expect(event.aggregateType).toBe('shift');
      expect(event.payload.conflictType).toBe('DOUBLE_BOOKING');
      expect(event.payload.severity).toBe('HIGH');
    });

    it('should support all severity levels', () => {
      const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

      severities.forEach((severity) => {
        const event = createConflictDetectedEvent(
          'shift-001',
          { ...payload, severity },
          'corr-123',
          baseMetadata
        );
        expect(event.payload.severity).toBe(severity);
      });
    });

    it('should support different conflict types', () => {
      const conflictTypes = [
        'DOUBLE_BOOKING',
        'OVERTIME',
        'INSUFFICIENT_REST',
        'SKILL_MISMATCH',
        'EQUIPMENT_CONFLICT',
      ] as const;

      conflictTypes.forEach((conflictType) => {
        const event = createConflictDetectedEvent(
          'shift-001',
          { ...payload, conflictType },
          'corr-123',
          baseMetadata
        );
        expect(event.payload.conflictType).toBe(conflictType);
      });
    });
  });

  describe('createPlanCreatedEvent', () => {
    const payload: PlanCreatedPayload = {
      planId: 'plan-001',
      clinicId: 'clinic-001',
      startDate: '2024-01-15',
      endDate: '2024-01-21',
      period: 'WEEK',
      shiftCount: 35,
      conflictCount: 2,
    };

    it('should create plan created event', () => {
      const event = createPlanCreatedEvent('plan-001', payload, 'corr-123', baseMetadata);

      expect(event.type).toBe('plan.created');
      expect(event.aggregateType).toBe('capacity-plan');
      expect(event.payload.period).toBe('WEEK');
      expect(event.payload.shiftCount).toBe(35);
    });

    it('should support different periods', () => {
      const periods = ['DAY', 'WEEK', 'MONTH'] as const;

      periods.forEach((period) => {
        const event = createPlanCreatedEvent(
          'plan-001',
          { ...payload, period },
          'corr-123',
          baseMetadata
        );
        expect(event.payload.period).toBe(period);
      });
    });
  });

  describe('createStaffingRecommendationEvent', () => {
    const payload: StaffingRecommendationPayload = {
      clinicId: 'clinic-001',
      date: '2024-01-15',
      currentStaff: 3,
      recommendedStaff: 5,
      role: 'DENTIST',
      priority: 'HIGH',
      reason: 'High appointment volume expected',
    };

    it('should create staffing recommendation event', () => {
      const event = createStaffingRecommendationEvent(
        'plan-001',
        payload,
        'corr-123',
        baseMetadata
      );

      expect(event.type).toBe('staffing.recommendation');
      expect(event.aggregateType).toBe('capacity-plan');
      expect(event.payload.currentStaff).toBe(3);
      expect(event.payload.recommendedStaff).toBe(5);
    });

    it('should support all priority levels', () => {
      const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

      priorities.forEach((priority) => {
        const event = createStaffingRecommendationEvent(
          'plan-001',
          { ...payload, priority },
          'corr-123',
          baseMetadata
        );
        expect(event.payload.priority).toBe(priority);
      });
    });
  });

  describe('createStaffingGapDetectedEvent', () => {
    const payload: StaffingGapDetectedPayload = {
      clinicId: 'clinic-001',
      date: '2024-01-15',
      role: 'HYGIENIST',
      required: 4,
      scheduled: 2,
      gap: 2,
    };

    it('should create staffing gap detected event', () => {
      const event = createStaffingGapDetectedEvent('plan-001', payload, 'corr-123', baseMetadata);

      expect(event.type).toBe('staffing.gap_detected');
      expect(event.aggregateType).toBe('capacity-plan');
      expect(event.payload.gap).toBe(2);
      expect(event.payload.role).toBe('HYGIENIST');
    });

    it('should calculate gap correctly in payload', () => {
      const event = createStaffingGapDetectedEvent('plan-001', payload, 'corr-123', baseMetadata);

      expect(event.payload.required - event.payload.scheduled).toBe(event.payload.gap);
    });
  });

  describe('createForecastGeneratedEvent', () => {
    const payload: ForecastGeneratedPayload = {
      planId: 'plan-001',
      clinicId: 'clinic-001',
      date: '2024-01-15',
      predictedDemand: 85,
      confidence: 0.92,
      basedOn: '30-day historical data',
      trend: 'INCREASING',
    };

    it('should create forecast generated event', () => {
      const event = createForecastGeneratedEvent('plan-001', payload, 'corr-123', baseMetadata);

      expect(event.type).toBe('forecast.generated');
      expect(event.aggregateType).toBe('capacity-plan');
      expect(event.payload.predictedDemand).toBe(85);
      expect(event.payload.confidence).toBe(0.92);
    });

    it('should support all trend directions', () => {
      const trends = ['INCREASING', 'STABLE', 'DECREASING'] as const;

      trends.forEach((trend) => {
        const event = createForecastGeneratedEvent(
          'plan-001',
          { ...payload, trend },
          'corr-123',
          baseMetadata
        );
        expect(event.payload.trend).toBe(trend);
      });
    });
  });

  describe('Event Metadata', () => {
    it('should include userId when provided', () => {
      const metadata: EventMetadata = {
        clinicId: 'clinic-001',
        userId: 'user-001',
        source: 'user',
      };

      const event = createShiftCreatedEvent(
        'shift-001',
        {
          shiftId: 'shift-001',
          clinicId: 'clinic-001',
          staffId: 'staff-001',
          staffName: 'Dr. Smith',
          staffRole: 'DENTIST',
          startTime: '2024-01-15T09:00:00Z',
          endTime: '2024-01-15T17:00:00Z',
          maxAppointments: 16,
        },
        'corr-123',
        metadata
      );

      expect(event.metadata.userId).toBe('user-001');
      expect(event.metadata.source).toBe('user');
    });

    it('should support all source types', () => {
      const sources = ['system', 'user', 'api', 'scheduler'] as const;

      sources.forEach((source) => {
        const metadata: EventMetadata = {
          clinicId: 'clinic-001',
          source,
        };

        const event = createCapacityCalculatedEvent(
          'plan-001',
          {
            planId: 'plan-001',
            clinicId: 'clinic-001',
            date: '2024-01-15',
            utilizationPercent: 75,
            level: 'HIGH',
            totalSlots: 100,
            bookedSlots: 75,
            staffCount: 5,
          },
          'corr-123',
          metadata
        );

        expect(event.metadata.source).toBe(source);
      });
    });
  });

  describe('Event Base Properties', () => {
    it('should include id, timestamp, and version', () => {
      const event = createCapacityCalculatedEvent(
        'plan-001',
        {
          planId: 'plan-001',
          clinicId: 'clinic-001',
          date: '2024-01-15',
          utilizationPercent: 75,
          level: 'OPTIMAL',
          totalSlots: 100,
          bookedSlots: 75,
          staffCount: 5,
        },
        'corr-123',
        baseMetadata
      );

      // ID is generated using custom format, not crypto.randomUUID
      expect(event.id).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);
      expect(event.timestamp).toBe(mockTimestamp);
      expect(event.version).toBe(1);
    });
  });
});
