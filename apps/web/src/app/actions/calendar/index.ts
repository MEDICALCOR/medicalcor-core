'use server';

/**
 * @fileoverview Calendar Server Actions
 *
 * Server actions for calendar and scheduling operations.
 * Integrates with SchedulingService for slot availability and appointments.
 *
 * @module actions/calendar
 * @security All actions require VIEW_APPOINTMENTS permission
 */

import type { CalendarSlot } from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { getSchedulingService } from '../shared/clients';
import { maskPhone } from '../shared/mappers';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default procedure type for slot queries
 * @constant
 */
const DEFAULT_PROCEDURE_TYPE = 'consultation';

/**
 * Maximum slots to fetch per day
 * @constant
 */
const MAX_SLOTS_PER_DAY = 50;

// ============================================================================
// CALENDAR ACTIONS
// ============================================================================

/**
 * Fetches calendar slots for a specific date
 *
 * Returns both available and booked slots for the given date.
 * Available slots show as open, booked slots include patient info.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD)
 * @requires VIEW_APPOINTMENTS permission
 *
 * @returns Array of calendar slots for the date
 *
 * @example
 * ```typescript
 * const slots = await getCalendarSlotsAction('2024-12-01');
 * const availableSlots = slots.filter(s => s.available);
 * const bookedSlots = slots.filter(s => !s.available);
 * ```
 */
export async function getCalendarSlotsAction(dateStr: string): Promise<CalendarSlot[]> {
  try {
    await requirePermission('VIEW_APPOINTMENTS');
    const scheduling = getSchedulingService();

    // Parse date and create day boundaries
    const date = new Date(dateStr);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Fetch both available slots and booked appointments in parallel
    const [availableSlots, appointments] = await Promise.all([
      scheduling.getAvailableSlots({
        procedureType: DEFAULT_PROCEDURE_TYPE,
        preferredDates: [dateStr],
        limit: MAX_SLOTS_PER_DAY,
      }),
      scheduling.getUpcomingAppointments(dayStart, dayEnd),
    ]);

    // Build slot map for merging
    const slotMap = new Map<string, CalendarSlot>();

    // Add available slots
    for (const slot of availableSlots) {
      slotMap.set(slot.startTime, {
        id: slot.id,
        time: slot.startTime,
        duration: slot.duration,
        available: true,
      });
    }

    // Merge in booked appointments (override available slots)
    for (const apt of appointments) {
      slotMap.set(apt.slot.startTime, {
        id: apt.id,
        time: apt.slot.startTime,
        duration: apt.slot.duration,
        available: false,
        patient: apt.patientName ?? maskPhone(apt.phone),
        procedure: apt.procedureType,
      });
    }

    // Convert to array and sort by time
    const allSlots = Array.from(slotMap.values()).sort((a, b) =>
      a.time.localeCompare(b.time)
    );

    return allSlots;
  } catch (error) {
    // SECURITY FIX: Only log in non-production to avoid console noise
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getCalendarSlotsAction] Failed to fetch calendar slots:', error);
    }
    return [];
  }
}

/**
 * Fetches available slots for a date range
 *
 * Useful for showing availability across multiple days (e.g., week view).
 *
 * @param startDate - Start date ISO string
 * @param endDate - End date ISO string
 * @param procedureType - Type of procedure (default: 'consultation')
 * @requires VIEW_APPOINTMENTS permission
 *
 * @returns Array of available slots across the date range
 *
 * @example
 * ```typescript
 * const slots = await getAvailableSlotsRangeAction(
 *   '2024-12-01',
 *   '2024-12-07',
 *   'implant'
 * );
 * ```
 */
export async function getAvailableSlotsRangeAction(
  startDate: string,
  endDate: string,
  procedureType = DEFAULT_PROCEDURE_TYPE
): Promise<CalendarSlot[]> {
  try {
    await requirePermission('VIEW_APPOINTMENTS');
    const scheduling = getSchedulingService();

    // Generate date array for the range
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]!);
      current.setDate(current.getDate() + 1);
    }

    const availableSlots = await scheduling.getAvailableSlots({
      procedureType,
      preferredDates: dates,
      limit: MAX_SLOTS_PER_DAY * dates.length,
    });

    return availableSlots.map((slot) => ({
      id: slot.id,
      time: slot.startTime,
      duration: slot.duration,
      available: true,
    }));
  } catch (error) {
    // SECURITY FIX: Only log in non-production to avoid console noise
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getAvailableSlotsRangeAction] Failed to fetch slots:', error);
    }
    return [];
  }
}

// ============================================================================
// BOOKING ACTION
// ============================================================================

/**
 * Request to book an appointment
 */
export interface BookAppointmentRequest {
  slotId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  procedureType: string;
  notes?: string;
}

/**
 * Response from booking an appointment
 */
export interface BookAppointmentResponse {
  success: boolean;
  appointmentId?: string;
  error?: string;
}

/**
 * Books an appointment for a patient
 *
 * @param request - Booking request with patient and slot details
 * @requires MANAGE_APPOINTMENTS permission
 *
 * @returns Booking response with success status and appointment ID
 *
 * @example
 * ```typescript
 * const result = await bookAppointmentAction({
 *   slotId: 'slot-123',
 *   patientId: 'hubspot-456',
 *   patientName: 'Ion Popescu',
 *   patientPhone: '+40721000000',
 *   procedureType: 'consultation',
 * });
 * if (result.success) {
 *   console.log('Booked:', result.appointmentId);
 * }
 * ```
 */
export async function bookAppointmentAction(
  request: BookAppointmentRequest
): Promise<BookAppointmentResponse> {
  try {
    await requirePermission('MANAGE_APPOINTMENTS');
    const scheduling = getSchedulingService();

    const result = await scheduling.bookAppointment({
      hubspotContactId: request.patientId,
      phone: request.patientPhone,
      patientName: request.patientName,
      slotId: request.slotId,
      procedureType: request.procedureType,
      notes: request.notes,
    });

    return {
      success: true,
      appointmentId: result.id,
    };
  } catch (error) {
    // SECURITY FIX: Only log in non-production to avoid console noise
    if (process.env.NODE_ENV !== 'production') {
      console.error('[bookAppointmentAction] Failed to book appointment:', error);
    }
    const message = error instanceof Error ? error.message : 'Eroare la programare';
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type { CalendarSlot } from '@medicalcor/types';
