/**
 * @fileoverview Tests for StaffShift Entity
 *
 * Tests for shift creation, validation, updates, and helper functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createStaffShift,
  updateShiftBookings,
  updateShiftStatus,
  getShiftWorkingHours,
  shiftsOverlap,
  isShiftOnDate,
  getShiftDayOfWeek,
  type CreateStaffShiftInput,
  type StaffShift,
  type ShiftType,
  type ShiftStatus,
  type StaffRole,
} from '../staff-shift.js';

describe('staff-shift', () => {
  const mockTimestamp = new Date('2024-01-15T10:30:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockTimestamp);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseInput: CreateStaffShiftInput = {
    clinicId: 'clinic-001',
    staffId: 'staff-001',
    staffName: 'Dr. Smith',
    staffRole: 'DENTIST',
    shiftType: 'FULL_DAY',
    startTime: new Date('2024-01-15T09:00:00Z'),
    endTime: new Date('2024-01-15T17:00:00Z'),
  };

  describe('createStaffShift', () => {
    describe('successful creation', () => {
      it('should create a valid staff shift', () => {
        const result = createStaffShift(baseInput);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.clinicId).toBe('clinic-001');
          expect(result.shift.staffId).toBe('staff-001');
          expect(result.shift.staffName).toBe('Dr. Smith');
          expect(result.shift.staffRole).toBe('DENTIST');
          expect(result.shift.shiftType).toBe('FULL_DAY');
          expect(result.shift.status).toBe('SCHEDULED');
          expect(result.shift.bookedAppointments).toBe(0);
        }
      });

      it('should generate a unique shift ID', () => {
        const result = createStaffShift(baseInput);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.id).toMatch(/^shift_[a-z0-9]+_[a-z0-9]+$/);
        }
      });

      it('should set createdAt and updatedAt to current time', () => {
        const result = createStaffShift(baseInput);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.createdAt).toEqual(mockTimestamp);
          expect(result.shift.updatedAt).toEqual(mockTimestamp);
        }
      });

      it('should default breakMinutes to 0', () => {
        const result = createStaffShift(baseInput);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.breakMinutes).toBe(0);
        }
      });

      it('should accept custom breakMinutes', () => {
        const result = createStaffShift({ ...baseInput, breakMinutes: 60 });

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.breakMinutes).toBe(60);
        }
      });

      it('should calculate default maxAppointments for dentist', () => {
        const result = createStaffShift(baseInput);

        expect(result.valid).toBe(true);
        if (result.valid) {
          // 8 hours * 2 appointments/hour = 16
          expect(result.shift.maxAppointments).toBe(16);
        }
      });

      it('should accept custom maxAppointments', () => {
        const result = createStaffShift({ ...baseInput, maxAppointments: 20 });

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.maxAppointments).toBe(20);
        }
      });

      it('should set notes to null when not provided', () => {
        const result = createStaffShift(baseInput);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.notes).toBeNull();
        }
      });

      it('should accept custom notes', () => {
        const result = createStaffShift({ ...baseInput, notes: 'Special shift' });

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.notes).toBe('Special shift');
        }
      });

      it('should freeze the shift object', () => {
        const result = createStaffShift(baseInput);

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(Object.isFrozen(result.shift)).toBe(true);
        }
      });

      it('should freeze procedureTypes array', () => {
        const result = createStaffShift({
          ...baseInput,
          procedureTypes: ['CLEANING', 'EXTRACTION'],
        });

        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(Object.isFrozen(result.shift.procedureTypes)).toBe(true);
          expect(result.shift.procedureTypes).toEqual(['CLEANING', 'EXTRACTION']);
        }
      });
    });

    describe('validation errors', () => {
      it('should return error for empty clinicId', () => {
        const result = createStaffShift({ ...baseInput, clinicId: '' });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'clinicId',
            message: 'Clinic ID is required',
            code: 'REQUIRED',
          });
        }
      });

      it('should return error for whitespace-only clinicId', () => {
        const result = createStaffShift({ ...baseInput, clinicId: '   ' });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors[0].field).toBe('clinicId');
        }
      });

      it('should return error for empty staffId', () => {
        const result = createStaffShift({ ...baseInput, staffId: '' });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'staffId',
            message: 'Staff ID is required',
            code: 'REQUIRED',
          });
        }
      });

      it('should return error for empty staffName', () => {
        const result = createStaffShift({ ...baseInput, staffName: '' });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'staffName',
            message: 'Staff name is required',
            code: 'REQUIRED',
          });
        }
      });

      it('should return error for invalid startTime', () => {
        const result = createStaffShift({
          ...baseInput,
          startTime: new Date('invalid'),
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'startTime',
            message: 'Valid start time is required',
            code: 'INVALID',
          });
        }
      });

      it('should return error for invalid endTime', () => {
        const result = createStaffShift({
          ...baseInput,
          endTime: new Date('invalid'),
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'endTime',
            message: 'Valid end time is required',
            code: 'INVALID',
          });
        }
      });

      it('should return error when endTime is before startTime', () => {
        const result = createStaffShift({
          ...baseInput,
          startTime: new Date('2024-01-15T17:00:00Z'),
          endTime: new Date('2024-01-15T09:00:00Z'),
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'endTime',
            message: 'End time must be after start time',
            code: 'INVALID_RANGE',
          });
        }
      });

      it('should return error when endTime equals startTime', () => {
        const result = createStaffShift({
          ...baseInput,
          startTime: new Date('2024-01-15T09:00:00Z'),
          endTime: new Date('2024-01-15T09:00:00Z'),
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors[0].code).toBe('INVALID_RANGE');
        }
      });

      it('should return error for shift exceeding 12 hours', () => {
        const result = createStaffShift({
          ...baseInput,
          startTime: new Date('2024-01-15T06:00:00Z'),
          endTime: new Date('2024-01-15T20:00:00Z'), // 14 hours
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'endTime',
            message: 'Shift duration cannot exceed 12 hours',
            code: 'DURATION_EXCEEDED',
          });
        }
      });

      it('should return error for negative breakMinutes', () => {
        const result = createStaffShift({ ...baseInput, breakMinutes: -30 });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'breakMinutes',
            message: 'Break time must be between 0 and 120 minutes',
            code: 'INVALID_RANGE',
          });
        }
      });

      it('should return error for breakMinutes exceeding 120', () => {
        const result = createStaffShift({ ...baseInput, breakMinutes: 150 });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toContainEqual({
            field: 'breakMinutes',
            message: 'Break time must be between 0 and 120 minutes',
            code: 'INVALID_RANGE',
          });
        }
      });

      it('should return multiple errors when multiple fields are invalid', () => {
        const result = createStaffShift({
          ...baseInput,
          clinicId: '',
          staffId: '',
          staffName: '',
        });

        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.errors).toHaveLength(3);
        }
      });
    });

    describe('default maxAppointments calculation by role', () => {
      it('should calculate for DENTIST (2 per hour)', () => {
        const result = createStaffShift({ ...baseInput, staffRole: 'DENTIST' });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.maxAppointments).toBe(16); // 8 hours * 2
        }
      });

      it('should calculate for SPECIALIST (2 per hour)', () => {
        const result = createStaffShift({ ...baseInput, staffRole: 'SPECIALIST' });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.maxAppointments).toBe(16);
        }
      });

      it('should calculate for HYGIENIST (2.5 per hour)', () => {
        const result = createStaffShift({ ...baseInput, staffRole: 'HYGIENIST' });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.maxAppointments).toBe(20); // 8 hours * 2.5
        }
      });

      it('should return 0 for DENTAL_ASSISTANT', () => {
        const result = createStaffShift({ ...baseInput, staffRole: 'DENTAL_ASSISTANT' });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.maxAppointments).toBe(0);
        }
      });

      it('should return 0 for RECEPTIONIST', () => {
        const result = createStaffShift({ ...baseInput, staffRole: 'RECEPTIONIST' });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.maxAppointments).toBe(0);
        }
      });

      it('should return 0 for PRACTICE_MANAGER', () => {
        const result = createStaffShift({ ...baseInput, staffRole: 'PRACTICE_MANAGER' });
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.shift.maxAppointments).toBe(0);
        }
      });

      it('should account for break time in calculation', () => {
        const result = createStaffShift({
          ...baseInput,
          staffRole: 'DENTIST',
          breakMinutes: 60, // 1 hour break
        });
        expect(result.valid).toBe(true);
        if (result.valid) {
          // 7 working hours * 2 = 14
          expect(result.shift.maxAppointments).toBe(14);
        }
      });
    });

    describe('shift types', () => {
      const shiftTypes: ShiftType[] = [
        'MORNING',
        'AFTERNOON',
        'EVENING',
        'NIGHT',
        'FULL_DAY',
        'CUSTOM',
      ];

      shiftTypes.forEach((shiftType) => {
        it(`should accept ${shiftType} shift type`, () => {
          const result = createStaffShift({ ...baseInput, shiftType });
          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.shift.shiftType).toBe(shiftType);
          }
        });
      });
    });

    describe('staff roles', () => {
      const staffRoles: StaffRole[] = [
        'DENTIST',
        'HYGIENIST',
        'DENTAL_ASSISTANT',
        'RECEPTIONIST',
        'PRACTICE_MANAGER',
        'SPECIALIST',
      ];

      staffRoles.forEach((staffRole) => {
        it(`should accept ${staffRole} role`, () => {
          const result = createStaffShift({ ...baseInput, staffRole });
          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.shift.staffRole).toBe(staffRole);
          }
        });
      });
    });
  });

  describe('updateShiftBookings', () => {
    it('should update booked appointments count', () => {
      const createResult = createStaffShift(baseInput);
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      const updatedShift = updateShiftBookings(createResult.shift, 5);

      expect(updatedShift.bookedAppointments).toBe(5);
      expect(updatedShift.id).toBe(createResult.shift.id);
    });

    it('should update capacity score based on new bookings', () => {
      const createResult = createStaffShift({ ...baseInput, maxAppointments: 10 });
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      const updatedShift = updateShiftBookings(createResult.shift, 8);

      // 8/10 = 80% utilization = HIGH
      expect(updatedShift.capacity.level).toBe('HIGH');
    });

    it('should update updatedAt timestamp', () => {
      const createResult = createStaffShift(baseInput);
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      // Advance time
      vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));

      const updatedShift = updateShiftBookings(createResult.shift, 5);

      expect(updatedShift.updatedAt).toEqual(new Date('2024-01-15T12:00:00.000Z'));
    });

    it('should return frozen object', () => {
      const createResult = createStaffShift(baseInput);
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      const updatedShift = updateShiftBookings(createResult.shift, 5);

      expect(Object.isFrozen(updatedShift)).toBe(true);
    });
  });

  describe('updateShiftStatus', () => {
    const statuses: ShiftStatus[] = [
      'SCHEDULED',
      'CONFIRMED',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ];

    statuses.forEach((status) => {
      it(`should update status to ${status}`, () => {
        const createResult = createStaffShift(baseInput);
        expect(createResult.valid).toBe(true);
        if (!createResult.valid) return;

        const updatedShift = updateShiftStatus(createResult.shift, status);

        expect(updatedShift.status).toBe(status);
      });
    });

    it('should update updatedAt timestamp', () => {
      const createResult = createStaffShift(baseInput);
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));

      const updatedShift = updateShiftStatus(createResult.shift, 'ACTIVE');

      expect(updatedShift.updatedAt).toEqual(new Date('2024-01-15T12:00:00.000Z'));
    });

    it('should return frozen object', () => {
      const createResult = createStaffShift(baseInput);
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      const updatedShift = updateShiftStatus(createResult.shift, 'COMPLETED');

      expect(Object.isFrozen(updatedShift)).toBe(true);
    });
  });

  describe('getShiftWorkingHours', () => {
    it('should calculate working hours without break', () => {
      const createResult = createStaffShift(baseInput);
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      const hours = getShiftWorkingHours(createResult.shift);

      expect(hours).toBe(8); // 9am to 5pm = 8 hours
    });

    it('should calculate working hours with break', () => {
      const createResult = createStaffShift({ ...baseInput, breakMinutes: 60 });
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      const hours = getShiftWorkingHours(createResult.shift);

      expect(hours).toBe(7); // 8 hours - 1 hour break
    });

    it('should handle partial hours', () => {
      const createResult = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T09:00:00Z'),
        endTime: new Date('2024-01-15T12:30:00Z'),
        breakMinutes: 30,
      });
      expect(createResult.valid).toBe(true);
      if (!createResult.valid) return;

      const hours = getShiftWorkingHours(createResult.shift);

      expect(hours).toBe(3); // 3.5 hours - 0.5 hour break
    });
  });

  describe('shiftsOverlap', () => {
    it('should return true for overlapping shifts', () => {
      const result1 = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T09:00:00Z'),
        endTime: new Date('2024-01-15T13:00:00Z'),
      });
      const result2 = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T12:00:00Z'),
        endTime: new Date('2024-01-15T17:00:00Z'),
      });

      expect(result1.valid && result2.valid).toBe(true);
      if (result1.valid && result2.valid) {
        expect(shiftsOverlap(result1.shift, result2.shift)).toBe(true);
      }
    });

    it('should return false for non-overlapping shifts', () => {
      const result1 = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T09:00:00Z'),
        endTime: new Date('2024-01-15T12:00:00Z'),
      });
      const result2 = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T13:00:00Z'),
        endTime: new Date('2024-01-15T17:00:00Z'),
      });

      expect(result1.valid && result2.valid).toBe(true);
      if (result1.valid && result2.valid) {
        expect(shiftsOverlap(result1.shift, result2.shift)).toBe(false);
      }
    });

    it('should return false for adjacent shifts (no overlap)', () => {
      const result1 = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T09:00:00Z'),
        endTime: new Date('2024-01-15T12:00:00Z'),
      });
      const result2 = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T12:00:00Z'),
        endTime: new Date('2024-01-15T17:00:00Z'),
      });

      expect(result1.valid && result2.valid).toBe(true);
      if (result1.valid && result2.valid) {
        expect(shiftsOverlap(result1.shift, result2.shift)).toBe(false);
      }
    });

    it('should return true when one shift contains another', () => {
      const result1 = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T09:00:00Z'),
        endTime: new Date('2024-01-15T17:00:00Z'),
      });
      const result2 = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T11:00:00Z'),
        endTime: new Date('2024-01-15T14:00:00Z'),
      });

      expect(result1.valid && result2.valid).toBe(true);
      if (result1.valid && result2.valid) {
        expect(shiftsOverlap(result1.shift, result2.shift)).toBe(true);
      }
    });
  });

  describe('isShiftOnDate', () => {
    it('should return true when shift is on the given date', () => {
      const result = createStaffShift(baseInput);
      expect(result.valid).toBe(true);
      if (!result.valid) return;

      expect(isShiftOnDate(result.shift, new Date('2024-01-15T00:00:00Z'))).toBe(true);
    });

    it('should return true regardless of time component', () => {
      const result = createStaffShift(baseInput);
      expect(result.valid).toBe(true);
      if (!result.valid) return;

      expect(isShiftOnDate(result.shift, new Date('2024-01-15T23:59:59Z'))).toBe(true);
    });

    it('should return false when shift is on different date', () => {
      const result = createStaffShift(baseInput);
      expect(result.valid).toBe(true);
      if (!result.valid) return;

      expect(isShiftOnDate(result.shift, new Date('2024-01-16T00:00:00Z'))).toBe(false);
    });
  });

  describe('getShiftDayOfWeek', () => {
    it('should return 0 for Sunday', () => {
      const result = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-14T09:00:00Z'), // Sunday
        endTime: new Date('2024-01-14T17:00:00Z'),
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(getShiftDayOfWeek(result.shift)).toBe(0);
      }
    });

    it('should return 1 for Monday', () => {
      const result = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-15T09:00:00Z'), // Monday
        endTime: new Date('2024-01-15T17:00:00Z'),
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(getShiftDayOfWeek(result.shift)).toBe(1);
      }
    });

    it('should return 6 for Saturday', () => {
      const result = createStaffShift({
        ...baseInput,
        startTime: new Date('2024-01-20T09:00:00Z'), // Saturday
        endTime: new Date('2024-01-20T17:00:00Z'),
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(getShiftDayOfWeek(result.shift)).toBe(6);
      }
    });
  });

  describe('capacity score integration', () => {
    it('should create shift with initial capacity at 0%', () => {
      const result = createStaffShift({ ...baseInput, maxAppointments: 10 });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.shift.capacity.utilizationPercent).toBe(0);
        expect(result.shift.capacity.level).toBe('UNDERUTILIZED');
      }
    });

    it('should update capacity level as bookings increase', () => {
      const result = createStaffShift({ ...baseInput, maxAppointments: 10 });
      expect(result.valid).toBe(true);
      if (!result.valid) return;

      // Update to 50% utilization
      const at50 = updateShiftBookings(result.shift, 5);
      expect(at50.capacity.level).toBe('OPTIMAL');

      // Update to 75% utilization
      const at75 = updateShiftBookings(result.shift, 7.5);
      expect(at75.capacity.level).toBe('HIGH');

      // Update to 90% utilization
      const at90 = updateShiftBookings(result.shift, 9);
      expect(at90.capacity.level).toBe('CRITICAL');
    });
  });
});
