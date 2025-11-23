'use server';

import { z } from 'zod';
import { DayScheduleSchema, type DaySchedule, type TimeSlot } from '@medicalcor/types';

/**
 * Server Actions for Calendar/Appointments
 * In production, integrates with SchedulingService from @medicalcor/domain.
 */

const CLINIC_HOURS = {
  start: 9,
  end: 18,
  slotDuration: 30,
  lunchStart: 13,
  lunchEnd: 14,
};

function generateSlotsForDate(date: Date): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dateStr = date.toISOString().split('T')[0];

  for (let hour = CLINIC_HOURS.start; hour < CLINIC_HOURS.end; hour++) {
    if (hour >= CLINIC_HOURS.lunchStart && hour < CLINIC_HOURS.lunchEnd) continue;

    for (let min = 0; min < 60; min += CLINIC_HOURS.slotDuration) {
      const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      const slotId = `${dateStr}-${time}`;
      const isBooked = Math.random() < 0.3;

      const slot: TimeSlot = {
        id: slotId,
        time,
        duration: CLINIC_HOURS.slotDuration,
        available: !isBooked,
      };

      if (isBooked) {
        const patients = ['Ion P.', 'Maria D.', 'Andrei M.', 'Elena S.', 'Mihai R.'];
        const procedures = ['Consultație', 'Implant', 'Cleaning', 'Follow-up', 'Extraction'];
        const doctors = ['Dr. Popescu', 'Dr. Ionescu', 'Dr. Marin'];

        slot.patient = patients[Math.floor(Math.random() * patients.length)];
        slot.procedure = procedures[Math.floor(Math.random() * procedures.length)];
        slot.doctor = doctors[Math.floor(Math.random() * doctors.length)];
        slot.status = 'booked';
      }

      slots.push(slot);
    }
  }

  return slots;
}

/**
 * Fetches schedule for a specific date
 */
export function getDayScheduleAction(dateStr: string): DaySchedule {
  const date = new Date(dateStr);
  const slots = generateSlotsForDate(date);

  const schedule: DaySchedule = {
    date: dateStr,
    slots,
    totalAvailable: slots.filter((s) => s.available).length,
    totalBooked: slots.filter((s) => !s.available).length,
  };

  return DayScheduleSchema.parse(schedule);
}

/**
 * Fetches schedule for a week
 */
export function getWeekScheduleAction(startDateStr: string): DaySchedule[] {
  const startDate = new Date(startDateStr);
  const schedules: DaySchedule[] = [];

  for (let i = 0; i < 5; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const dateStr = date.toISOString().split('T')[0];
    if (dateStr) {
      const slots = generateSlotsForDate(date);
      schedules.push({
        date: dateStr,
        slots,
        totalAvailable: slots.filter((s) => s.available).length,
        totalBooked: slots.filter((s) => !s.available).length,
      });
    }
  }

  return z.array(DayScheduleSchema).parse(schedules);
}

/**
 * Books a time slot
 */
export async function bookSlotAction(
  slotId: string,
  patientData: { name: string; phone: string; procedure: string }
): Promise<{ success: boolean; message: string }> {
  // In production: check availability, create appointment, sync to HubSpot, send WhatsApp
  await Promise.resolve(); // Placeholder for async operations

  return {
    success: true,
    message: `Programare confirmată pentru ${patientData.name}`,
  };
}
