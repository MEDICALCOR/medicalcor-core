/**
 * @fileoverview Capacity Planning Module Tests
 *
 * Comprehensive tests for the M12 Shift Scheduling with Capacity Planning feature.
 *
 * @module domain/capacity-planning/__tests__
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  // Value Objects
  CapacityScore,
  InvalidCapacityScoreError,
  // Entities
  createStaffShift,
  updateShiftBookings,
  updateShiftStatus,
  getShiftWorkingHours,
  shiftsOverlap,
  type StaffShift,
  type CreateStaffShiftInput,
  // Capacity Plan
  createCapacityPlan,
  getCapacityForDate,
  getCriticalDates,
  getUnderutilizedDates,
  hasCriticalIssues,
  // Services
  CapacityPlanningPolicy,
  createCapacityPlanningPolicy,
  // Service Facade
  CapacityPlanningService,
  createCapacityPlanningService,
} from '../index.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestShiftInput(
  overrides: Partial<CreateStaffShiftInput> = {}
): CreateStaffShiftInput {
  const now = new Date();
  const startTime = new Date(now);
  startTime.setHours(8, 0, 0, 0);
  const endTime = new Date(now);
  endTime.setHours(14, 0, 0, 0);

  return {
    clinicId: 'clinic-001',
    staffId: 'staff-001',
    staffName: 'Dr. Maria Popescu',
    staffRole: 'DENTIST',
    shiftType: 'MORNING',
    startTime,
    endTime,
    breakMinutes: 30,
    maxAppointments: 12,
    procedureTypes: ['checkup', 'cleaning'],
    ...overrides,
  };
}

function createTestShift(overrides: Partial<CreateStaffShiftInput> = {}): StaffShift {
  const result = createStaffShift(createTestShiftInput(overrides));
  if (!result.valid) {
    throw new Error(`Failed to create test shift: ${result.errors[0].message}`);
  }
  return result.shift;
}

// ============================================================================
// CAPACITY SCORE VALUE OBJECT TESTS
// ============================================================================

describe('CapacityScore Value Object', () => {
  describe('Creation', () => {
    it('should create from utilization percentage', () => {
      const score = CapacityScore.fromUtilization(75);

      expect(score.utilizationPercent).toBe(75);
      expect(score.level).toBe('HIGH');
      expect(score.bookingStatus).toBe('LIMITED');
    });

    it('should create from slot counts', () => {
      const score = CapacityScore.fromSlots(6, 10);

      expect(score.utilizationPercent).toBe(60);
      expect(score.bookedSlots).toBe(6);
      expect(score.totalSlots).toBe(10);
      expect(score.level).toBe('OPTIMAL');
    });

    it('should handle zero total slots', () => {
      const score = CapacityScore.fromSlots(0, 0);

      expect(score.utilizationPercent).toBe(0);
      expect(score.level).toBe('UNDERUTILIZED');
    });

    it('should throw for invalid utilization', () => {
      expect(() => CapacityScore.fromUtilization(-10)).toThrow(InvalidCapacityScoreError);
      expect(() => CapacityScore.fromUtilization(200)).toThrow(InvalidCapacityScoreError);
    });
  });

  describe('Level Classification', () => {
    it('should classify UNDERUTILIZED (0-40%)', () => {
      expect(CapacityScore.fromUtilization(0).level).toBe('UNDERUTILIZED');
      expect(CapacityScore.fromUtilization(30).level).toBe('UNDERUTILIZED');
      expect(CapacityScore.fromUtilization(40).level).toBe('UNDERUTILIZED');
    });

    it('should classify OPTIMAL (41-70%)', () => {
      expect(CapacityScore.fromUtilization(41).level).toBe('OPTIMAL');
      expect(CapacityScore.fromUtilization(60).level).toBe('OPTIMAL');
      expect(CapacityScore.fromUtilization(70).level).toBe('OPTIMAL');
    });

    it('should classify HIGH (71-85%)', () => {
      expect(CapacityScore.fromUtilization(71).level).toBe('HIGH');
      expect(CapacityScore.fromUtilization(80).level).toBe('HIGH');
      expect(CapacityScore.fromUtilization(85).level).toBe('HIGH');
    });

    it('should classify CRITICAL (86-95%)', () => {
      expect(CapacityScore.fromUtilization(86).level).toBe('CRITICAL');
      expect(CapacityScore.fromUtilization(90).level).toBe('CRITICAL');
      expect(CapacityScore.fromUtilization(95).level).toBe('CRITICAL');
    });

    it('should classify OVERBOOKED (>95%)', () => {
      expect(CapacityScore.fromUtilization(96).level).toBe('OVERBOOKED');
      expect(CapacityScore.fromUtilization(110).level).toBe('OVERBOOKED');
    });
  });

  describe('Staffing Recommendations', () => {
    it('should recommend REDUCE_STAFF for underutilized', () => {
      const score = CapacityScore.fromUtilization(30);
      expect(score.staffingRecommendation).toBe('REDUCE_STAFF');
      expect(score.shouldReduceStaff()).toBe(true);
    });

    it('should recommend MAINTAIN for optimal', () => {
      const score = CapacityScore.fromUtilization(60);
      expect(score.staffingRecommendation).toBe('MAINTAIN');
    });

    it('should recommend ADD_STAFF for high', () => {
      const score = CapacityScore.fromUtilization(80);
      expect(score.staffingRecommendation).toBe('ADD_STAFF');
      expect(score.needsAdditionalStaff()).toBe(true);
    });

    it('should recommend URGENT_STAFF_NEEDED for critical/overbooked', () => {
      const critical = CapacityScore.fromUtilization(90);
      const overbooked = CapacityScore.fromUtilization(105);

      expect(critical.staffingRecommendation).toBe('URGENT_STAFF_NEEDED');
      expect(overbooked.staffingRecommendation).toBe('URGENT_STAFF_NEEDED');
    });
  });

  describe('Booking Status', () => {
    it('should be OPEN for underutilized/optimal', () => {
      expect(CapacityScore.fromUtilization(30).bookingStatus).toBe('OPEN');
      expect(CapacityScore.fromUtilization(60).bookingStatus).toBe('OPEN');
    });

    it('should be LIMITED for high', () => {
      expect(CapacityScore.fromUtilization(80).bookingStatus).toBe('LIMITED');
    });

    it('should be WAITLIST_ONLY for critical', () => {
      expect(CapacityScore.fromUtilization(90).bookingStatus).toBe('WAITLIST_ONLY');
    });

    it('should be CLOSED for overbooked', () => {
      expect(CapacityScore.fromUtilization(100).bookingStatus).toBe('CLOSED');
      expect(CapacityScore.fromUtilization(100).canAcceptBookings()).toBe(false);
    });
  });

  describe('Transformations', () => {
    it('should add bookings immutably', () => {
      const original = CapacityScore.fromSlots(5, 10);
      const updated = original.addBookings(3);

      expect(original.bookedSlots).toBe(5);
      expect(updated.bookedSlots).toBe(8);
      expect(updated.utilizationPercent).toBe(80);
    });

    it('should remove bookings immutably', () => {
      const original = CapacityScore.fromSlots(8, 10);
      const updated = original.removeBookings(2);

      expect(original.bookedSlots).toBe(8);
      expect(updated.bookedSlots).toBe(6);
    });

    it('should increase capacity immutably', () => {
      const original = CapacityScore.fromSlots(8, 10);
      const updated = original.increaseCapacity(5);

      expect(original.totalSlots).toBe(10);
      expect(updated.totalSlots).toBe(15);
      expect(updated.utilizationPercent).toBeCloseTo(53.3, 1);
    });
  });

  describe('Equality', () => {
    it('should be equal with same values', () => {
      const a = CapacityScore.fromSlots(5, 10);
      const b = CapacityScore.fromSlots(5, 10);

      expect(a.equals(b)).toBe(true);
    });

    it('should not be equal with different values', () => {
      const a = CapacityScore.fromSlots(5, 10);
      const b = CapacityScore.fromSlots(6, 10);

      expect(a.equals(b)).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON', () => {
      const score = CapacityScore.fromSlots(7, 10);
      const json = score.toJSON();

      expect(json.utilizationPercent).toBe(70);
      expect(json.bookedSlots).toBe(7);
      expect(json.totalSlots).toBe(10);
      expect(json.level).toBe('OPTIMAL');
    });

    it('should parse from object', () => {
      const result = CapacityScore.parse({ bookedSlots: 5, totalSlots: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.utilizationPercent).toBe(50);
      }
    });
  });
});

// ============================================================================
// STAFF SHIFT ENTITY TESTS
// ============================================================================

describe('StaffShift Entity', () => {
  describe('Creation', () => {
    it('should create a valid shift', () => {
      const result = createStaffShift(createTestShiftInput());

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.shift.clinicId).toBe('clinic-001');
        expect(result.shift.staffName).toBe('Dr. Maria Popescu');
        expect(result.shift.staffRole).toBe('DENTIST');
        expect(result.shift.status).toBe('SCHEDULED');
        expect(result.shift.capacity.level).toBe('UNDERUTILIZED');
      }
    });

    it('should reject missing clinic ID', () => {
      const result = createStaffShift(createTestShiftInput({ clinicId: '' }));

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual(expect.objectContaining({ field: 'clinicId' }));
      }
    });

    it('should reject invalid time range', () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() - 3600000); // 1 hour before

      const result = createStaffShift(createTestShiftInput({ startTime, endTime }));

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual(expect.objectContaining({ code: 'INVALID_RANGE' }));
      }
    });

    it('should reject shift longer than 12 hours', () => {
      const startTime = new Date();
      startTime.setHours(6, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(20, 0, 0, 0); // 14 hours

      const result = createStaffShift(createTestShiftInput({ startTime, endTime }));

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors).toContainEqual(
          expect.objectContaining({ code: 'DURATION_EXCEEDED' })
        );
      }
    });
  });

  describe('Updates', () => {
    it('should update bookings', () => {
      const shift = createTestShift();
      const updated = updateShiftBookings(shift, 8);

      expect(shift.bookedAppointments).toBe(0);
      expect(updated.bookedAppointments).toBe(8);
      expect(updated.capacity.utilizationPercent).toBeCloseTo(66.7, 1);
    });

    it('should update status', () => {
      const shift = createTestShift();
      const updated = updateShiftStatus(shift, 'CONFIRMED');

      expect(shift.status).toBe('SCHEDULED');
      expect(updated.status).toBe('CONFIRMED');
    });
  });

  describe('Working Hours', () => {
    it('should calculate working hours correctly', () => {
      const shift = createTestShift({
        breakMinutes: 60, // 1 hour break
      });

      const hours = getShiftWorkingHours(shift);
      // 8am-2pm = 6 hours - 1 hour break = 5 hours
      expect(hours).toBe(5);
    });
  });

  describe('Overlap Detection', () => {
    it('should detect overlapping shifts', () => {
      const now = new Date();
      const shift1 = createTestShift({
        startTime: new Date(now.setHours(8, 0, 0, 0)),
        endTime: new Date(now.setHours(14, 0, 0, 0)),
      });

      const overlappingStart = new Date(now);
      overlappingStart.setHours(12, 0, 0, 0);
      const overlappingEnd = new Date(now);
      overlappingEnd.setHours(18, 0, 0, 0);

      const shift2 = createTestShift({
        staffId: 'staff-002',
        staffName: 'Dr. Ion Ionescu',
        startTime: overlappingStart,
        endTime: overlappingEnd,
      });

      expect(shiftsOverlap(shift1, shift2)).toBe(true);
    });

    it('should not detect non-overlapping shifts', () => {
      const now = new Date();
      const shift1 = createTestShift({
        startTime: new Date(now.setHours(8, 0, 0, 0)),
        endTime: new Date(now.setHours(12, 0, 0, 0)),
      });

      const laterStart = new Date(now);
      laterStart.setHours(14, 0, 0, 0);
      const laterEnd = new Date(now);
      laterEnd.setHours(18, 0, 0, 0);

      const shift2 = createTestShift({
        staffId: 'staff-002',
        startTime: laterStart,
        endTime: laterEnd,
      });

      expect(shiftsOverlap(shift1, shift2)).toBe(false);
    });
  });
});

// ============================================================================
// CAPACITY PLANNING POLICY TESTS
// ============================================================================

describe('CapacityPlanningPolicy', () => {
  let policy: CapacityPlanningPolicy;

  beforeEach(() => {
    policy = createCapacityPlanningPolicy();
  });

  describe('Conflict Detection', () => {
    it('should detect overlapping shifts for same staff', () => {
      const now = new Date();
      const baseDate = new Date(now);
      baseDate.setHours(0, 0, 0, 0);

      const shift1 = createTestShift({
        startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000), // 8am
        endTime: new Date(baseDate.getTime() + 14 * 60 * 60 * 1000), // 2pm
      });

      const shift2 = createTestShift({
        startTime: new Date(baseDate.getTime() + 12 * 60 * 60 * 1000), // 12pm
        endTime: new Date(baseDate.getTime() + 18 * 60 * 60 * 1000), // 6pm
      });

      const result = policy.detectConflicts([shift1, shift2]);

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts.some((c) => c.type === 'OVERLAP')).toBe(true);
      expect(result.hasCritical).toBe(true);
    });

    it('should detect rest period violations', () => {
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);

      const shift1 = createTestShift({
        startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000), // 8am
        endTime: new Date(baseDate.getTime() + 16 * 60 * 60 * 1000), // 4pm
      });

      // Next day, only 4 hours rest
      const nextDay = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
      const shift2 = createTestShift({
        startTime: new Date(nextDay.getTime() + 4 * 60 * 60 * 1000), // 4am next day (only 12h rest, actually this would be 12 hours which is fine)
        endTime: new Date(nextDay.getTime() + 12 * 60 * 60 * 1000), // 12pm
      });

      // For a real rest violation test, we need shifts closer together
      const lateShift = createTestShift({
        startTime: new Date(baseDate.getTime() + 22 * 60 * 60 * 1000), // 10pm same day
        endTime: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2am next day
      });

      const earlyNextDay = createTestShift({
        startTime: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000), // 6am next day (only 4h rest)
        endTime: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000), // 12pm
      });

      const result = policy.detectConflicts([lateShift, earlyNextDay]);

      expect(result.conflicts.some((c) => c.type === 'REST_VIOLATION')).toBe(true);
    });

    it('should detect understaffing when no dentist scheduled', () => {
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);

      const assistantShift = createTestShift({
        staffId: 'staff-assistant',
        staffName: 'Ana Asistent',
        staffRole: 'DENTAL_ASSISTANT',
        startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000),
        endTime: new Date(baseDate.getTime() + 16 * 60 * 60 * 1000),
      });

      const receptionistShift = createTestShift({
        staffId: 'staff-reception',
        staffName: 'Maria Receptie',
        staffRole: 'RECEPTIONIST',
        startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000),
        endTime: new Date(baseDate.getTime() + 16 * 60 * 60 * 1000),
      });

      const result = policy.detectConflicts([assistantShift, receptionistShift]);

      expect(result.conflicts.some((c) => c.type === 'UNDERSTAFFED')).toBe(true);
    });

    it('should return no conflicts for valid schedule', () => {
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);

      const dentistShift = createTestShift({
        startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000),
        endTime: new Date(baseDate.getTime() + 14 * 60 * 60 * 1000),
      });

      const assistantShift = createTestShift({
        staffId: 'staff-assistant',
        staffName: 'Ana Asistent',
        staffRole: 'DENTAL_ASSISTANT',
        startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000),
        endTime: new Date(baseDate.getTime() + 14 * 60 * 60 * 1000),
      });

      const hygienistShift = createTestShift({
        staffId: 'staff-hygienist',
        staffName: 'Elena Igienist',
        staffRole: 'HYGIENIST',
        startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000),
        endTime: new Date(baseDate.getTime() + 14 * 60 * 60 * 1000),
      });

      const result = policy.detectConflicts([dentistShift, assistantShift, hygienistShift]);

      expect(result.conflicts.filter((c) => c.severity === 'CRITICAL').length).toBe(0);
    });
  });

  describe('Capacity Analysis', () => {
    it('should calculate daily summaries', () => {
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);

      const shifts = [
        createTestShift({
          startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000),
          endTime: new Date(baseDate.getTime() + 14 * 60 * 60 * 1000),
          maxAppointments: 10,
        }),
        createTestShift({
          staffId: 'staff-002',
          staffName: 'Dr. Ion',
          startTime: new Date(baseDate.getTime() + 14 * 60 * 60 * 1000),
          endTime: new Date(baseDate.getTime() + 20 * 60 * 60 * 1000),
          maxAppointments: 10,
        }),
      ];

      const updatedShifts = shifts.map((s, i) => updateShiftBookings(s, i === 0 ? 6 : 8));

      const summaries = policy.analyzeCapacity(updatedShifts);

      expect(summaries.length).toBe(1);
      expect(summaries[0].totalSlots).toBe(20);
      expect(summaries[0].bookedSlots).toBe(14);
      expect(summaries[0].utilization).toBe(70);
    });

    it('should calculate overall capacity', () => {
      const summaries = [
        {
          date: new Date(),
          totalSlots: 20,
          bookedSlots: 12,
          utilization: 60,
          level: 'OPTIMAL' as const,
          shiftCount: 2,
          staffCount: 2,
          conflicts: [],
        },
        {
          date: new Date(),
          totalSlots: 15,
          bookedSlots: 13,
          utilization: 86.7,
          level: 'CRITICAL' as const,
          shiftCount: 1,
          staffCount: 1,
          conflicts: [],
        },
      ];

      const overall = policy.calculateOverallCapacity(summaries);

      expect(overall.utilizationPercent).toBeCloseTo(71.4, 1);
    });
  });

  describe('Staffing Analysis', () => {
    it('should recommend additional staff for critical capacity', () => {
      const summaries = [
        {
          date: new Date(),
          totalSlots: 10,
          bookedSlots: 9,
          utilization: 90,
          level: 'CRITICAL' as const,
          shiftCount: 1,
          staffCount: 1,
          conflicts: [],
        },
      ];

      const result = policy.analyzeStaffing(summaries);

      expect(result.isAdequate).toBe(false);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0].priority).toBe('HIGH');
    });

    it('should recommend reducing staff for underutilized', () => {
      const summaries = [
        {
          date: new Date(),
          totalSlots: 20,
          bookedSlots: 4,
          utilization: 20,
          level: 'UNDERUTILIZED' as const,
          shiftCount: 2,
          staffCount: 2,
          conflicts: [],
        },
      ];

      const result = policy.analyzeStaffing(summaries);

      expect(result.recommendations.some((r) => r.recommendedStaff < r.currentStaff)).toBe(true);
    });
  });

  describe('Demand Forecasting', () => {
    it('should generate forecasts from historical data', () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);

      // Create historical data for past 30 days
      const historicalData = Array.from({ length: 30 }, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - 30 + i);
        return {
          date,
          dayOfWeek: date.getDay(),
          appointments: 15 + Math.floor(Math.random() * 5),
          noShows: 1,
          cancellations: 2,
        };
      });

      const forecasts = policy.forecastDemand(startDate, endDate, historicalData);

      expect(forecasts.length).toBeGreaterThan(0);
      forecasts.forEach((f) => {
        expect(f.predictedDemand).toBeGreaterThan(0);
        expect(f.confidence).toBeGreaterThan(0);
        expect(f.confidence).toBeLessThanOrEqual(1);
        expect(['INCREASING', 'STABLE', 'DECREASING']).toContain(f.trend);
      });
    });

    it('should return empty forecasts with no historical data', () => {
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);

      const forecasts = policy.forecastDemand(startDate, endDate, []);

      expect(forecasts.length).toBe(0);
    });
  });
});

// ============================================================================
// CAPACITY PLAN ENTITY TESTS
// ============================================================================

describe('CapacityPlan', () => {
  it('should create a valid capacity plan', () => {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    const shifts = [
      createTestShift({
        startTime: new Date(startDate.getTime() + 8 * 60 * 60 * 1000),
        endTime: new Date(startDate.getTime() + 14 * 60 * 60 * 1000),
      }),
    ];

    const plan = createCapacityPlan({
      clinicId: 'clinic-001',
      startDate,
      endDate,
      period: 'WEEK',
      shifts,
    });

    expect(plan.clinicId).toBe('clinic-001');
    expect(plan.shifts.length).toBe(1);
    expect(plan.dailySummaries.length).toBeGreaterThan(0);
    expect(plan.overallCapacity).toBeDefined();
  });

  it('should identify critical dates', () => {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    const overbooked = createTestShift({
      startTime: new Date(startDate.getTime() + 8 * 60 * 60 * 1000),
      endTime: new Date(startDate.getTime() + 14 * 60 * 60 * 1000),
      maxAppointments: 10,
    });

    const updatedShift = updateShiftBookings(overbooked, 10);

    const plan = createCapacityPlan({
      clinicId: 'clinic-001',
      startDate,
      endDate,
      period: 'DAY',
      shifts: [updatedShift],
    });

    const critical = getCriticalDates(plan);
    expect(critical.length).toBeGreaterThan(0);
    expect(hasCriticalIssues(plan)).toBe(true);
  });
});

// ============================================================================
// CAPACITY PLANNING SERVICE TESTS
// ============================================================================

describe('CapacityPlanningService', () => {
  let service: CapacityPlanningService;

  beforeEach(() => {
    service = createCapacityPlanningService();
  });

  describe('Shift Operations', () => {
    it('should create a shift', () => {
      const result = service.createShift(createTestShiftInput());

      expect(result.success).toBe(true);
      expect(result.shift).toBeDefined();
    });

    it('should return errors for invalid shift', () => {
      const result = service.createShift(createTestShiftInput({ clinicId: '' }));

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should check for shift overlaps', () => {
      const shift1 = createTestShift();
      const shift2 = createTestShift({
        staffId: 'staff-002',
      });

      expect(service.doShiftsOverlap(shift1, shift2)).toBe(true);
    });
  });

  describe('Capacity Analysis', () => {
    it('should analyze weekly capacity', () => {
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);
      // Set to Monday
      const dayOfWeek = baseDate.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      baseDate.setDate(baseDate.getDate() + mondayOffset);

      const shifts = Array.from({ length: 5 }, (_, i) => {
        const day = new Date(baseDate);
        day.setDate(day.getDate() + i);
        return createTestShift({
          staffId: `staff-${i}`,
          staffName: `Dr. Test ${i}`,
          startTime: new Date(day.getTime() + 8 * 60 * 60 * 1000),
          endTime: new Date(day.getTime() + 16 * 60 * 60 * 1000),
        });
      });

      const overview = service.getWeeklyOverview(shifts, baseDate);

      expect(overview.totalShifts).toBe(5);
      expect(overview.totalStaff).toBe(5);
      expect(overview.weekStartDate.getTime()).toBe(baseDate.getTime());
    });

    it('should calculate daily capacity', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const shift = createTestShift({
        startTime: new Date(today.getTime() + 8 * 60 * 60 * 1000),
        endTime: new Date(today.getTime() + 16 * 60 * 60 * 1000),
        maxAppointments: 16,
      });

      const updatedShift = updateShiftBookings(shift, 10);
      const summary = service.getDailyCapacity([updatedShift], today);

      expect(summary).not.toBeNull();
      expect(summary?.totalSlots).toBe(16);
      expect(summary?.bookedSlots).toBe(10);
    });
  });

  describe('Conflict Detection', () => {
    it('should detect when adding shift would create conflict', () => {
      const baseDate = new Date();
      baseDate.setHours(0, 0, 0, 0);

      const existingShift = createTestShift({
        startTime: new Date(baseDate.getTime() + 8 * 60 * 60 * 1000),
        endTime: new Date(baseDate.getTime() + 16 * 60 * 60 * 1000),
      });

      const newShift = createTestShift({
        startTime: new Date(baseDate.getTime() + 12 * 60 * 60 * 1000),
        endTime: new Date(baseDate.getTime() + 20 * 60 * 60 * 1000),
      });

      const wouldConflict = service.wouldCreateConflict(newShift, [existingShift]);

      expect(wouldConflict).toBe(true);
    });
  });

  describe('Capacity Score Calculation', () => {
    it('should calculate capacity from slots', () => {
      const capacity = service.calculateCapacity(7, 10);

      expect(capacity.utilizationPercent).toBe(70);
      expect(capacity.level).toBe('OPTIMAL');
    });
  });
});
