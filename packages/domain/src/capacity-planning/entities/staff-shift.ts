/**
 * @fileoverview StaffShift Entity
 *
 * Represents a staff member's scheduled shift for capacity planning.
 * This is an Entity with identity and lifecycle management.
 *
 * @module domain/capacity-planning/entities/staff-shift
 */

import { CapacityScore } from '../../shared-kernel/value-objects/capacity-score.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Shift type classification
 */
export type ShiftType = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT' | 'FULL_DAY' | 'CUSTOM';

/**
 * Shift status
 */
export type ShiftStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

/**
 * Staff role for the shift
 */
export type StaffRole =
  | 'DENTIST'
  | 'HYGIENIST'
  | 'DENTAL_ASSISTANT'
  | 'RECEPTIONIST'
  | 'PRACTICE_MANAGER'
  | 'SPECIALIST';

/**
 * Conflict type that can occur in scheduling
 */
export type ShiftConflictType =
  | 'OVERLAP' // Two shifts overlap in time
  | 'CONSECUTIVE_DAYS' // Too many consecutive days
  | 'OVERTIME' // Exceeds maximum hours
  | 'REST_VIOLATION' // Insufficient rest between shifts
  | 'DOUBLE_BOOKING' // Same staff member double-booked
  | 'UNDERSTAFFED' // Shift doesn't meet minimum staffing
  | 'SKILL_GAP'; // Missing required skills for procedures

/**
 * Input for creating a new staff shift
 */
export interface CreateStaffShiftInput {
  clinicId: string;
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  shiftType: ShiftType;
  startTime: Date;
  endTime: Date;
  breakMinutes?: number;
  maxAppointments?: number;
  procedureTypes?: string[];
  notes?: string;
}

/**
 * Staff shift entity
 */
export interface StaffShift {
  readonly id: string;
  readonly clinicId: string;
  readonly staffId: string;
  readonly staffName: string;
  readonly staffRole: StaffRole;
  readonly shiftType: ShiftType;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly breakMinutes: number;
  readonly maxAppointments: number;
  readonly bookedAppointments: number;
  readonly procedureTypes: readonly string[];
  readonly status: ShiftStatus;
  readonly capacity: CapacityScore;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Shift conflict detected during scheduling
 */
export interface ShiftConflict {
  readonly type: ShiftConflictType;
  readonly shiftId: string;
  readonly conflictingShiftId?: string;
  readonly staffId: string;
  readonly description: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly suggestedResolution: string;
}

/**
 * Shift validation result
 */
export type ShiftValidationResult =
  | { valid: true; shift: StaffShift }
  | { valid: false; errors: ShiftValidationError[] };

/**
 * Shift validation error
 */
export interface ShiftValidationError {
  field: string;
  message: string;
  code: string;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new staff shift entity
 *
 * @param input - Input data for creating the shift
 * @returns Validation result with shift or errors
 */
export function createStaffShift(input: CreateStaffShiftInput): ShiftValidationResult {
  const errors: ShiftValidationError[] = [];

  // Validate required fields
  if (!input.clinicId.trim()) {
    errors.push({ field: 'clinicId', message: 'Clinic ID is required', code: 'REQUIRED' });
  }

  if (!input.staffId.trim()) {
    errors.push({ field: 'staffId', message: 'Staff ID is required', code: 'REQUIRED' });
  }

  if (!input.staffName.trim()) {
    errors.push({ field: 'staffName', message: 'Staff name is required', code: 'REQUIRED' });
  }

  // Validate times
  if (!(input.startTime instanceof Date) || isNaN(input.startTime.getTime())) {
    errors.push({ field: 'startTime', message: 'Valid start time is required', code: 'INVALID' });
  }

  if (!(input.endTime instanceof Date) || isNaN(input.endTime.getTime())) {
    errors.push({ field: 'endTime', message: 'Valid end time is required', code: 'INVALID' });
  }

  if (input.startTime >= input.endTime) {
    errors.push({
      field: 'endTime',
      message: 'End time must be after start time',
      code: 'INVALID_RANGE',
    });
  }

  // Validate shift duration (max 12 hours)
  const durationHours = (input.endTime.getTime() - input.startTime.getTime()) / (1000 * 60 * 60);
  if (durationHours > 12) {
    errors.push({
      field: 'endTime',
      message: 'Shift duration cannot exceed 12 hours',
      code: 'DURATION_EXCEEDED',
    });
  }

  // Validate break time
  const breakMinutes = input.breakMinutes ?? 0;
  if (breakMinutes < 0 || breakMinutes > 120) {
    errors.push({
      field: 'breakMinutes',
      message: 'Break time must be between 0 and 120 minutes',
      code: 'INVALID_RANGE',
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Calculate capacity
  const maxAppointments = input.maxAppointments ?? calculateDefaultMaxAppointments(input);
  const capacity = CapacityScore.fromSlots(0, maxAppointments);

  const now = new Date();
  const shift: StaffShift = {
    id: generateShiftId(),
    clinicId: input.clinicId,
    staffId: input.staffId,
    staffName: input.staffName,
    staffRole: input.staffRole,
    shiftType: input.shiftType,
    startTime: input.startTime,
    endTime: input.endTime,
    breakMinutes,
    maxAppointments,
    bookedAppointments: 0,
    procedureTypes: Object.freeze([...(input.procedureTypes ?? [])]),
    status: 'SCHEDULED',
    capacity,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  return { valid: true, shift: Object.freeze(shift) };
}

/**
 * Update a staff shift with new booking count
 */
export function updateShiftBookings(shift: StaffShift, bookedAppointments: number): StaffShift {
  const capacity = CapacityScore.fromSlots(bookedAppointments, shift.maxAppointments);

  return Object.freeze({
    ...shift,
    bookedAppointments,
    capacity,
    updatedAt: new Date(),
  });
}

/**
 * Update shift status
 */
export function updateShiftStatus(shift: StaffShift, status: ShiftStatus): StaffShift {
  return Object.freeze({
    ...shift,
    status,
    updatedAt: new Date(),
  });
}

/**
 * Calculate shift duration in hours (excluding breaks)
 */
export function getShiftWorkingHours(shift: StaffShift): number {
  const totalMinutes = (shift.endTime.getTime() - shift.startTime.getTime()) / (1000 * 60);
  const workingMinutes = totalMinutes - shift.breakMinutes;
  return workingMinutes / 60;
}

/**
 * Check if two shifts overlap
 */
export function shiftsOverlap(shift1: StaffShift, shift2: StaffShift): boolean {
  return shift1.startTime < shift2.endTime && shift2.startTime < shift1.endTime;
}

/**
 * Check if a shift is on a specific date
 */
export function isShiftOnDate(shift: StaffShift, date: Date): boolean {
  const shiftDate = new Date(shift.startTime);
  shiftDate.setHours(0, 0, 0, 0);
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  return shiftDate.getTime() === targetDate.getTime();
}

/**
 * Get the day of week for a shift (0 = Sunday, 6 = Saturday)
 */
export function getShiftDayOfWeek(shift: StaffShift): number {
  return shift.startTime.getDay();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique shift ID
 */
function generateShiftId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `shift_${timestamp}_${random}`;
}

/**
 * Calculate default max appointments based on shift type and duration
 */
function calculateDefaultMaxAppointments(input: CreateStaffShiftInput): number {
  const durationHours = (input.endTime.getTime() - input.startTime.getTime()) / (1000 * 60 * 60);
  const workingHours = durationHours - (input.breakMinutes ?? 0) / 60;

  // Assume 30-minute average appointment slots
  // Dentist/Specialist: 2 per hour, Hygienist: 2-3 per hour, Assistant: support role
  switch (input.staffRole) {
    case 'DENTIST':
    case 'SPECIALIST':
      return Math.floor(workingHours * 2);
    case 'HYGIENIST':
      return Math.floor(workingHours * 2.5);
    case 'DENTAL_ASSISTANT':
    case 'RECEPTIONIST':
    case 'PRACTICE_MANAGER':
      return 0; // Support roles don't have direct appointments
    default:
      return Math.floor(workingHours * 2);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { type StaffShift as IStaffShift, type ShiftConflict as IShiftConflict };
