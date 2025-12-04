'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, getCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Booking Management (Services & Doctors)
 */

let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  category: string;
  isActive: boolean;
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  email: string | null;
  phone: string | null;
  rating: number;
  nextAvailable: string;
  isActive: boolean;
}

export interface TimeSlot {
  id: string;
  doctorId: string;
  startTime: Date;
  endTime: Date;
  isBooked: boolean;
}

export interface BookingStats {
  totalServices: number;
  totalDoctors: number;
  appointmentsToday: number;
  availableSlotsToday: number;
}

interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  price: number | null;
  price_from: number | null;
  price_to: number | null;
  category: string | null;
  is_active: boolean;
}

interface DoctorRow {
  id: string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

interface TimeSlotRow {
  id: string;
  practitioner_id: string;
  start_time: Date;
  end_time: Date;
  is_booked: boolean;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateServiceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  duration: z.number().min(5).max(480),
  price: z.number().min(0).optional(),
  priceFrom: z.number().min(0).optional(),
  priceTo: z.number().min(0).optional(),
  category: z.string().max(100).optional(),
});

const UpdateServiceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  duration: z.number().min(5).max(480).optional(),
  price: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToService(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    duration: row.duration,
    price: row.price,
    priceFrom: row.price_from,
    priceTo: row.price_to,
    category: row.category ?? 'General',
    isActive: row.is_active,
  };
}

function rowToDoctor(row: DoctorRow, nextAvailable: string = 'Indisponibil'): Doctor {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty ?? 'Medicină generală',
    email: row.email,
    phone: row.phone,
    rating: 4.5, // Default rating, could be calculated from reviews
    nextAvailable,
    isActive: row.is_active,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getServicesAction(): Promise<{ services: Service[]; error?: string }> {
  try {
    await requirePermission('services:read');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query<ServiceRow>(
      `SELECT id, name, description, duration, price, price_from, price_to, category, is_active
       FROM services
       WHERE clinic_id = $1
       ORDER BY display_order, name`,
      [user.clinicId]
    );

    return { services: result.rows.map(rowToService) };
  } catch (error) {
    console.error('Error fetching services:', error);
    return { services: [], error: 'Failed to fetch services' };
  }
}

export async function getDoctorsAction(): Promise<{ doctors: Doctor[]; error?: string }> {
  try {
    await requirePermission('doctors:read');
    const database = getDatabase();

    const result = await database.query<DoctorRow>(
      `SELECT id, name, specialty, email, phone, is_active
       FROM practitioners
       WHERE is_active = true
       ORDER BY name`
    );

    // Get next available slot for each doctor
    const doctorsWithAvailability = await Promise.all(
      result.rows.map(async (row) => {
        const slotResult = await database.query<{ start_time: Date }>(
          `SELECT start_time FROM time_slots
           WHERE practitioner_id = $1 AND is_booked = false AND start_time > NOW()
           ORDER BY start_time LIMIT 1`,
          [row.id]
        );

        let nextAvailable = 'Indisponibil';
        if (slotResult.rows.length > 0) {
          const date = new Date(slotResult.rows[0].start_time);
          const isToday = date.toDateString() === new Date().toDateString();
          const isTomorrow =
            date.toDateString() === new Date(Date.now() + 86400000).toDateString();

          if (isToday) nextAvailable = 'Astăzi';
          else if (isTomorrow) nextAvailable = 'Mâine';
          else nextAvailable = date.toLocaleDateString('ro-RO', { weekday: 'long' });
        }

        return rowToDoctor(row, nextAvailable);
      })
    );

    return { doctors: doctorsWithAvailability };
  } catch (error) {
    console.error('Error fetching doctors:', error);
    return { doctors: [], error: 'Failed to fetch doctors' };
  }
}

export async function getAvailableSlotsAction(
  doctorId: string,
  date: string
): Promise<{ slots: TimeSlot[]; error?: string }> {
  try {
    await requirePermission('appointments:read');
    const database = getDatabase();

    const result = await database.query<TimeSlotRow>(
      `SELECT id, practitioner_id, start_time, end_time, is_booked
       FROM time_slots
       WHERE practitioner_id = $1
         AND DATE(start_time) = $2
         AND is_booked = false
       ORDER BY start_time`,
      [doctorId, date]
    );

    return {
      slots: result.rows.map((row) => ({
        id: row.id,
        doctorId: row.practitioner_id,
        startTime: row.start_time,
        endTime: row.end_time,
        isBooked: row.is_booked,
      })),
    };
  } catch (error) {
    console.error('Error fetching available slots:', error);
    return { slots: [], error: 'Failed to fetch available slots' };
  }
}

export async function getBookingStatsAction(): Promise<{ stats: BookingStats | null; error?: string }> {
  try {
    await requirePermission('appointments:read');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_services: string;
      total_doctors: string;
      appointments_today: string;
      available_slots_today: string;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM services WHERE clinic_id = $1 AND is_active = true) as total_services,
        (SELECT COUNT(*) FROM practitioners WHERE is_active = true) as total_doctors,
        (SELECT COUNT(*) FROM appointments a
         JOIN time_slots ts ON ts.id = a.slot_id
         WHERE DATE(ts.start_time) = CURRENT_DATE AND a.status != 'cancelled') as appointments_today,
        (SELECT COUNT(*) FROM time_slots
         WHERE DATE(start_time) = CURRENT_DATE AND is_booked = false) as available_slots_today`,
      [user.clinicId]
    );

    const row = result.rows[0];
    return {
      stats: {
        totalServices: parseInt(row.total_services),
        totalDoctors: parseInt(row.total_doctors),
        appointmentsToday: parseInt(row.appointments_today),
        availableSlotsToday: parseInt(row.available_slots_today),
      },
    };
  } catch (error) {
    console.error('Error fetching booking stats:', error);
    return { stats: null, error: 'Failed to fetch booking stats' };
  }
}

export async function createServiceAction(
  data: z.infer<typeof CreateServiceSchema>
): Promise<{ service: Service | null; error?: string }> {
  try {
    await requirePermission('services:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const validated = CreateServiceSchema.parse(data);

    const result = await database.query<ServiceRow>(
      `INSERT INTO services (clinic_id, name, description, duration, price, price_from, price_to, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, description, duration, price, price_from, price_to, category, is_active`,
      [
        user.clinicId,
        validated.name,
        validated.description ?? null,
        validated.duration,
        validated.price ?? null,
        validated.priceFrom ?? null,
        validated.priceTo ?? null,
        validated.category ?? 'General',
      ]
    );

    return { service: rowToService(result.rows[0]) };
  } catch (error) {
    console.error('Error creating service:', error);
    return { service: null, error: 'Failed to create service' };
  }
}

export async function updateServiceAction(
  data: z.infer<typeof UpdateServiceSchema>
): Promise<{ service: Service | null; error?: string }> {
  try {
    await requirePermission('services:write');
    const user = await getCurrentUser();
    const database = getDatabase();

    const validated = UpdateServiceSchema.parse(data);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(validated.name);
    }
    if (validated.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(validated.description);
    }
    if (validated.duration !== undefined) {
      updates.push(`duration = $${paramIndex++}`);
      values.push(validated.duration);
    }
    if (validated.price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      values.push(validated.price);
    }
    if (validated.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(validated.isActive);
    }

    if (updates.length === 0) {
      return { service: null, error: 'No updates provided' };
    }

    values.push(validated.id, user.clinicId);

    const result = await database.query<ServiceRow>(
      `UPDATE services SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND clinic_id = $${paramIndex}
       RETURNING id, name, description, duration, price, price_from, price_to, category, is_active`,
      values
    );

    if (result.rows.length === 0) {
      return { service: null, error: 'Service not found' };
    }

    return { service: rowToService(result.rows[0]) };
  } catch (error) {
    console.error('Error updating service:', error);
    return { service: null, error: 'Failed to update service' };
  }
}

export async function deleteServiceAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('services:delete');
    const user = await getCurrentUser();
    const database = getDatabase();

    const result = await database.query(
      `DELETE FROM services WHERE id = $1 AND clinic_id = $2`,
      [id, user.clinicId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Service not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting service:', error);
    return { success: false, error: 'Failed to delete service' };
  }
}
