'use server';

import { requirePermission } from '@/lib/auth/server-action-auth';
import { getSchedulingService } from './utils/clients';
import { maskPhone } from './utils/formatters';
import type { CalendarSlot } from './types';

/**
 * Calendar Server Actions
 *
 * Actions for fetching calendar slots and availability.
 */

/**
 * Fetches calendar slots for a specific date
 * @requires VIEW_APPOINTMENTS permission
 */
export async function getCalendarSlotsAction(dateStr: string): Promise<CalendarSlot[]> {
  try {
    await requirePermission('VIEW_APPOINTMENTS');
    const scheduling = getSchedulingService();

    const date = new Date(dateStr);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Get available slots for the day
    const availableSlots = await scheduling.getAvailableSlots({
      procedureType: 'consultation',
      preferredDates: [dateStr],
      limit: 50,
    });

    // Get booked appointments for the day
    const appointments = await scheduling.getUpcomingAppointments(dayStart, dayEnd);

    // Merge available slots with appointments
    const allSlots: CalendarSlot[] = [];

    // Add available slots
    for (const slot of availableSlots) {
      allSlots.push({
        id: slot.id,
        time: slot.startTime,
        duration: slot.duration,
        available: true,
      });
    }

    // Add booked slots
    for (const apt of appointments) {
      // Check if this slot already exists
      const existingIndex = allSlots.findIndex((s) => s.time === apt.slot.startTime);
      if (existingIndex >= 0) {
        allSlots[existingIndex] = {
          id: apt.id,
          time: apt.slot.startTime,
          duration: apt.slot.duration,
          available: false,
          patient: apt.patientName ?? maskPhone(apt.phone),
          procedure: apt.procedureType,
        };
      } else {
        allSlots.push({
          id: apt.id,
          time: apt.slot.startTime,
          duration: apt.slot.duration,
          available: false,
          patient: apt.patientName ?? maskPhone(apt.phone),
          procedure: apt.procedureType,
        });
      }
    }

    // Sort by time
    allSlots.sort((a, b) => a.time.localeCompare(b.time));

    return allSlots;
  } catch (error) {
    console.error('[getCalendarSlotsAction] Failed to fetch calendar slots:', error);
    return [];
  }
}
