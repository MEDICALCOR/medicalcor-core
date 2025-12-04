'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Prescription Management
 */

let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientId: string | null;
  patientName: string;
  patientCnp: string | null;
  doctorId: string | null;
  doctorName: string;
  diagnosis: string | null;
  diagnosisCode: string | null;
  prescriptionType: 'standard' | 'compensated' | 'free' | 'narcotic';
  status: 'draft' | 'active' | 'dispensed' | 'partially_dispensed' | 'expired' | 'cancelled';
  validFrom: Date;
  validUntil: Date | null;
  dispensedAt: Date | null;
  medications: PrescriptionMedication[];
  createdAt: Date;
}

export interface PrescriptionMedication {
  id: string;
  name: string;
  dosage: string;
  form: string | null;
  frequency: string;
  duration: string | null;
  quantity: number | null;
  instructions: string | null;
}

export interface PrescriptionStats {
  totalPrescriptions: number;
  totalCount: number;
  activePrescriptions: number;
  activeCount: number;
  dispensedThisMonth: number;
  expiringSoon: number;
  expiringCount: number;
  todayCount: number;
}

interface PrescriptionRow {
  id: string;
  prescription_number: string;
  patient_id: string | null;
  patient_name: string;
  patient_cnp: string | null;
  doctor_id: string | null;
  doctor_name: string;
  diagnosis: string | null;
  diagnosis_code: string | null;
  prescription_type: string;
  status: string;
  valid_from: Date;
  valid_until: Date | null;
  dispensed_at: Date | null;
  created_at: Date;
}

interface MedicationRow {
  id: string;
  medication_name: string;
  dosage: string | null;
  form: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: number | null;
  instructions: string | null;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const MedicationSchema = z.object({
  name: z.string().min(1).max(200),
  dosage: z.string().max(100).optional(),
  form: z.string().max(100).optional(),
  frequency: z.string().max(100).optional(),
  duration: z.string().max(100).optional(),
  quantity: z.number().min(1).optional(),
  instructions: z.string().optional(),
});

const CreatePrescriptionSchema = z.object({
  patientName: z.string().min(1).max(200),
  patientId: z.string().uuid().optional(),
  patientCnp: z.string().max(20).optional(),
  diagnosis: z.string().optional(),
  diagnosisCode: z.string().max(50).optional(),
  prescriptionType: z.enum(['standard', 'compensated', 'free', 'narcotic']).default('standard'),
  validUntil: z.string().optional(),
  medications: z.array(MedicationSchema).min(1),
});

const UpdatePrescriptionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['draft', 'active', 'dispensed', 'partially_dispensed', 'expired', 'cancelled']).optional(),
  diagnosis: z.string().optional(),
  dispensedBy: z.string().optional(),
  pharmacyName: z.string().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToPrescription(row: PrescriptionRow, medications: PrescriptionMedication[] = []): Prescription {
  return {
    id: row.id,
    prescriptionNumber: row.prescription_number,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientCnp: row.patient_cnp,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    diagnosis: row.diagnosis,
    diagnosisCode: row.diagnosis_code,
    prescriptionType: row.prescription_type as Prescription['prescriptionType'],
    status: row.status as Prescription['status'],
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    dispensedAt: row.dispensed_at,
    medications,
    createdAt: row.created_at,
  };
}

function rowToMedication(row: MedicationRow): PrescriptionMedication {
  return {
    id: row.id,
    name: row.medication_name,
    dosage: row.dosage ?? '',
    form: row.form,
    frequency: row.frequency ?? '',
    duration: row.duration,
    quantity: row.quantity,
    instructions: row.instructions,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getPrescriptionsAction(
  patientId?: string
): Promise<{ prescriptions: Prescription[]; error?: string }> {
  try {
    await requirePermission('prescriptions:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    let query = `
      SELECT id, prescription_number, patient_id, patient_name, patient_cnp,
             doctor_id, doctor_name, diagnosis, diagnosis_code, prescription_type,
             status, valid_from, valid_until, dispensed_at, created_at
      FROM prescriptions
      WHERE clinic_id = $1
    `;
    const params: unknown[] = [user.clinicId];

    if (patientId) {
      query += ` AND patient_id = $2`;
      params.push(patientId);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await database.query<PrescriptionRow>(query, params);

    // Get medications for each prescription
    const prescriptions = await Promise.all(
      result.rows.map(async (row) => {
        const medsResult = await database.query<MedicationRow>(
          `SELECT id, medication_name, dosage, form, frequency, duration, quantity, instructions
           FROM prescription_medications
           WHERE prescription_id = $1`,
          [row.id]
        );
        return rowToPrescription(row, medsResult.rows.map(rowToMedication));
      })
    );

    return { prescriptions };
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    return { prescriptions: [], error: 'Failed to fetch prescriptions' };
  }
}

export async function getPrescriptionByIdAction(
  id: string
): Promise<{ prescription: Prescription | null; error?: string }> {
  try {
    await requirePermission('prescriptions:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<PrescriptionRow>(
      `SELECT id, prescription_number, patient_id, patient_name, patient_cnp,
              doctor_id, doctor_name, diagnosis, diagnosis_code, prescription_type,
              status, valid_from, valid_until, dispensed_at, created_at
       FROM prescriptions
       WHERE id = $1 AND clinic_id = $2`,
      [id, user.clinicId]
    );

    if (result.rows.length === 0) {
      return { prescription: null, error: 'Prescription not found' };
    }

    const medsResult = await database.query<MedicationRow>(
      `SELECT id, medication_name, dosage, form, frequency, duration, quantity, instructions
       FROM prescription_medications
       WHERE prescription_id = $1`,
      [id]
    );

    return {
      prescription: rowToPrescription(result.rows[0], medsResult.rows.map(rowToMedication)),
    };
  } catch (error) {
    console.error('Error fetching prescription:', error);
    return { prescription: null, error: 'Failed to fetch prescription' };
  }
}

export async function getPrescriptionStatsAction(): Promise<{ stats: PrescriptionStats | null; error?: string }> {
  try {
    await requirePermission('prescriptions:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_prescriptions: string;
      active_prescriptions: string;
      dispensed_this_month: string;
      expiring_soon: string;
    }>(
      `SELECT
        COUNT(*) as total_prescriptions,
        COUNT(*) FILTER (WHERE status = 'active') as active_prescriptions,
        COUNT(*) FILTER (WHERE dispensed_at >= DATE_TRUNC('month', NOW())) as dispensed_this_month,
        COUNT(*) FILTER (WHERE status = 'active' AND valid_until IS NOT NULL
                         AND valid_until < NOW() + INTERVAL '7 days') as expiring_soon
       FROM prescriptions
       WHERE clinic_id = $1`,
      [user.clinicId]
    );

    const row = result.rows[0];
    const totalPrescriptions = parseInt(row.total_prescriptions);
    const activePrescriptions = parseInt(row.active_prescriptions);
    const expiringSoon = parseInt(row.expiring_soon);
    return {
      stats: {
        totalPrescriptions,
        totalCount: totalPrescriptions,
        activePrescriptions,
        activeCount: activePrescriptions,
        dispensedThisMonth: parseInt(row.dispensed_this_month),
        expiringSoon,
        expiringCount: expiringSoon,
        todayCount: 0, // Would need additional query for today's count
      },
    };
  } catch (error) {
    console.error('Error fetching prescription stats:', error);
    return { stats: null, error: 'Failed to fetch prescription stats' };
  }
}

export async function createPrescriptionAction(
  data: z.infer<typeof CreatePrescriptionSchema>
): Promise<{ prescription: Prescription | null; error?: string }> {
  try {
    await requirePermission('prescriptions:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = CreatePrescriptionSchema.parse(data);

    const client = await database.connect();
    try {
      await client.query('BEGIN');

      // Create prescription
      const prescriptionResult = await client.query<PrescriptionRow>(
        `INSERT INTO prescriptions (clinic_id, patient_name, patient_id, patient_cnp,
                doctor_id, doctor_name, diagnosis, diagnosis_code, prescription_type, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, prescription_number, patient_id, patient_name, patient_cnp,
                   doctor_id, doctor_name, diagnosis, diagnosis_code, prescription_type,
                   status, valid_from, valid_until, dispensed_at, created_at`,
        [
          user.clinicId,
          validated.patientName,
          validated.patientId ?? null,
          validated.patientCnp ?? null,
          user.id,
          user.name,
          validated.diagnosis ?? null,
          validated.diagnosisCode ?? null,
          validated.prescriptionType,
          validated.validUntil ?? null,
        ]
      );

      const prescription = prescriptionResult.rows[0];

      // Create medications
      const medications: PrescriptionMedication[] = [];
      for (const med of validated.medications) {
        const medResult = await client.query<MedicationRow>(
          `INSERT INTO prescription_medications (prescription_id, medication_name, dosage,
                  form, frequency, duration, quantity, instructions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, medication_name, dosage, form, frequency, duration, quantity, instructions`,
          [
            prescription.id,
            med.name,
            med.dosage ?? null,
            med.form ?? null,
            med.frequency ?? null,
            med.duration ?? null,
            med.quantity ?? null,
            med.instructions ?? null,
          ]
        );
        medications.push(rowToMedication(medResult.rows[0]));
      }

      await client.query('COMMIT');

      return { prescription: rowToPrescription(prescription, medications) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating prescription:', error);
    return { prescription: null, error: 'Failed to create prescription' };
  }
}

export async function updatePrescriptionAction(
  data: z.infer<typeof UpdatePrescriptionSchema>
): Promise<{ prescription: Prescription | null; error?: string }> {
  try {
    await requirePermission('prescriptions:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = UpdatePrescriptionSchema.parse(data);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validated.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(validated.status);
      if (validated.status === 'dispensed') {
        updates.push(`dispensed_at = NOW()`);
        if (validated.dispensedBy) {
          updates.push(`dispensed_by = $${paramIndex++}`);
          values.push(validated.dispensedBy);
        }
        if (validated.pharmacyName) {
          updates.push(`pharmacy_name = $${paramIndex++}`);
          values.push(validated.pharmacyName);
        }
      }
    }
    if (validated.diagnosis !== undefined) {
      updates.push(`diagnosis = $${paramIndex++}`);
      values.push(validated.diagnosis);
    }

    if (updates.length === 0) {
      return { prescription: null, error: 'No updates provided' };
    }

    values.push(validated.id, user.clinicId);

    const result = await database.query<PrescriptionRow>(
      `UPDATE prescriptions SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND clinic_id = $${paramIndex}
       RETURNING id, prescription_number, patient_id, patient_name, patient_cnp,
                 doctor_id, doctor_name, diagnosis, diagnosis_code, prescription_type,
                 status, valid_from, valid_until, dispensed_at, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return { prescription: null, error: 'Prescription not found' };
    }

    // Get medications
    const medsResult = await database.query<MedicationRow>(
      `SELECT id, medication_name, dosage, form, frequency, duration, quantity, instructions
       FROM prescription_medications
       WHERE prescription_id = $1`,
      [validated.id]
    );

    return {
      prescription: rowToPrescription(result.rows[0], medsResult.rows.map(rowToMedication)),
    };
  } catch (error) {
    console.error('Error updating prescription:', error);
    return { prescription: null, error: 'Failed to update prescription' };
  }
}

export async function cancelPrescriptionAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('prescriptions:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query(
      `UPDATE prescriptions SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2 AND status IN ('draft', 'active')`,
      [id, user.clinicId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Prescription not found or cannot be cancelled' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error cancelling prescription:', error);
    return { success: false, error: 'Failed to cancel prescription' };
  }
}

export async function deletePrescriptionAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('prescriptions:delete');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const client = await database.connect();
    try {
      await client.query('BEGIN');

      // Delete medications first
      await client.query(
        `DELETE FROM prescription_medications WHERE prescription_id = $1`,
        [id]
      );

      // Delete prescription
      const result = await client.query(
        `DELETE FROM prescriptions WHERE id = $1 AND clinic_id = $2`,
        [id, user.clinicId]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Prescription not found' };
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting prescription:', error);
    return { success: false, error: 'Failed to delete prescription' };
  }
}

export async function duplicatePrescriptionAction(
  id: string
): Promise<{ prescription: Prescription | null; error?: string }> {
  try {
    await requirePermission('prescriptions:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const client = await database.connect();
    try {
      await client.query('BEGIN');

      // Get original prescription
      const origResult = await client.query<PrescriptionRow>(
        `SELECT * FROM prescriptions WHERE id = $1 AND clinic_id = $2`,
        [id, user.clinicId]
      );

      if (origResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { prescription: null, error: 'Prescription not found' };
      }

      const orig = origResult.rows[0];

      // Create new prescription
      const newResult = await client.query<PrescriptionRow>(
        `INSERT INTO prescriptions (clinic_id, patient_name, patient_id, patient_cnp,
                doctor_id, doctor_name, diagnosis, diagnosis_code, prescription_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, prescription_number, patient_id, patient_name, patient_cnp,
                   doctor_id, doctor_name, diagnosis, diagnosis_code, prescription_type,
                   status, valid_from, valid_until, dispensed_at, created_at`,
        [
          user.clinicId,
          orig.patient_name,
          orig.patient_id,
          orig.patient_cnp,
          user.id,
          user.name,
          orig.diagnosis,
          orig.diagnosis_code,
          orig.prescription_type,
        ]
      );

      const newPrescription = newResult.rows[0];

      // Copy medications
      await client.query(
        `INSERT INTO prescription_medications (prescription_id, medication_name, dosage,
                form, frequency, duration, quantity, instructions)
         SELECT $1, medication_name, dosage, form, frequency, duration, quantity, instructions
         FROM prescription_medications WHERE prescription_id = $2`,
        [newPrescription.id, id]
      );

      await client.query('COMMIT');

      // Get medications
      const medsResult = await database.query<MedicationRow>(
        `SELECT id, medication_name, dosage, form, frequency, duration, quantity, instructions
         FROM prescription_medications
         WHERE prescription_id = $1`,
        [newPrescription.id]
      );

      return {
        prescription: rowToPrescription(newPrescription, medsResult.rows.map(rowToMedication)),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error duplicating prescription:', error);
    return { prescription: null, error: 'Failed to duplicate prescription' };
  }
}
