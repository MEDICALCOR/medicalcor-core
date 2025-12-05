'use server';

import { z } from 'zod';
import { createDatabaseClient, type DatabasePool } from '@medicalcor/core';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Medical Records Management
 * Uses interactions table for consultations and lead data for patient info
 */

let db: DatabasePool | null = null;

function getDatabase(): DatabasePool {
  db ??= createDatabaseClient();
  return db;
}

// =============================================================================
// Types
// =============================================================================

export interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  type: 'consultation' | 'lab_result' | 'imaging' | 'procedure' | 'note';
  date: Date;
  doctor: string;
  specialty: string;
  summary: string;
  details: string;
  attachments: number;
}

export interface Diagnosis {
  id: string;
  patientId: string;
  patientName: string;
  code: string;
  name: string;
  date: Date;
  doctor: string;
  status: 'active' | 'resolved' | 'chronic';
  notes: string | null;
}

export interface Prescription {
  id: string;
  patientId: string;
  patientName: string;
  date: Date;
  doctor: string;
  medications: { name: string; dosage: string; frequency: string }[];
  status: 'active' | 'completed' | 'cancelled';
}

export interface MedicalRecordStats {
  totalRecords: number;
  consultationsThisMonth: number;
  activeDiagnoses: number;
  pendingPrescriptions: number;
  // Alias properties for page compatibility
  chronicConditions: number;
  activeTreatments: number;
}

interface RecordRow {
  id: string;
  lead_id: string;
  patient_name: string | null;
  type: string;
  created_at: Date;
  content: string | null;
  channel: string | null;
}

// Reserved for future use when diagnoses table is implemented
interface _DiagnosisRow {
  id: string;
  lead_id: string;
  patient_name: string | null;
  code: string;
  name: string;
  created_at: Date;
  doctor_name: string | null;
  status: string;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateRecordSchema = z.object({
  patientId: z.string().uuid(),
  type: z.enum(['consultation', 'lab_result', 'imaging', 'procedure', 'note']),
  summary: z.string().min(1).max(500),
  details: z.string().optional(),
  doctorId: z.string().uuid().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToMedicalRecord(row: RecordRow): MedicalRecord {
  return {
    id: row.id,
    patientId: row.lead_id,
    patientName: row.patient_name ?? 'Pacient necunoscut',
    type: (row.type || 'note') as MedicalRecord['type'],
    date: row.created_at,
    doctor: 'Dr. Staff',
    specialty: 'Medicină generală',
    summary: row.content?.substring(0, 100) ?? '',
    details: row.content ?? '',
    attachments: 0,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getMedicalRecordsAction(
  patientId?: string
): Promise<{ records: MedicalRecord[]; error?: string }> {
  try {
    await requirePermission('medical_records:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    let query = `
      SELECT i.id, i.lead_id, l.full_name as patient_name, i.type, i.created_at, i.content, i.channel
      FROM interactions i
      JOIN leads l ON l.id = i.lead_id
      WHERE l.clinic_id = $1
    `;
    const params: unknown[] = [user.clinicId];

    if (patientId) {
      query += ` AND i.lead_id = $2`;
      params.push(patientId);
    }

    query += ` ORDER BY i.created_at DESC LIMIT 100`;

    const result = await database.query<RecordRow>(query, params);

    return { records: result.rows.map(rowToMedicalRecord) };
  } catch (_error) {
    console.error('Error fetching medical records:', _error);
    return { records: [], error: 'Failed to fetch medical records' };
  }
}

export async function getMedicalRecordStatsAction(): Promise<{
  stats: MedicalRecordStats | null;
  error?: string;
}> {
  try {
    await requirePermission('medical_records:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_records: string;
      consultations_this_month: string;
      active_diagnoses: string;
      pending_prescriptions: string;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM interactions i
         JOIN leads l ON l.id = i.lead_id WHERE l.clinic_id = $1) as total_records,
        (SELECT COUNT(*) FROM interactions i
         JOIN leads l ON l.id = i.lead_id
         WHERE l.clinic_id = $1 AND i.created_at >= DATE_TRUNC('month', NOW())) as consultations_this_month,
        0 as active_diagnoses,
        (SELECT COUNT(*) FROM prescriptions WHERE clinic_id = $1 AND status = 'active') as pending_prescriptions`,
      [user.clinicId]
    );

    const row = result.rows[0];
    const activeDiagnoses = parseInt(row.active_diagnoses);
    return {
      stats: {
        totalRecords: parseInt(row.total_records),
        consultationsThisMonth: parseInt(row.consultations_this_month),
        activeDiagnoses,
        pendingPrescriptions: parseInt(row.pending_prescriptions),
        chronicConditions: activeDiagnoses,
        activeTreatments: parseInt(row.pending_prescriptions),
      },
    };
  } catch (_error) {
    console.error('Error fetching medical record stats:', _error);
    return { stats: null, error: 'Failed to fetch stats' };
  }
}

export async function createMedicalRecordAction(
  data: z.infer<typeof CreateRecordSchema>
): Promise<{ record: MedicalRecord | null; error?: string }> {
  try {
    await requirePermission('medical_records:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = CreateRecordSchema.parse(data);

    // Verify patient exists and belongs to clinic
    const patientCheck = await database.query<{ full_name: string }>(
      `SELECT full_name FROM leads WHERE id = $1 AND clinic_id = $2`,
      [validated.patientId, user.clinicId]
    );

    if (patientCheck.rows.length === 0) {
      return { record: null, error: 'Patient not found' };
    }

    const result = await database.query<RecordRow>(
      `INSERT INTO interactions (lead_id, type, content, channel, direction)
       VALUES ($1, $2, $3, 'note', 'outbound')
       RETURNING id, lead_id, type, created_at, content, channel`,
      [validated.patientId, validated.type, validated.details ?? validated.summary]
    );

    const record = result.rows[0];
    return {
      record: {
        id: record.id,
        patientId: record.lead_id,
        patientName: patientCheck.rows[0].full_name,
        type: validated.type,
        date: record.created_at,
        doctor: 'Dr. Staff',
        specialty: 'Medicină generală',
        summary: validated.summary,
        details: validated.details ?? '',
        attachments: 0,
      },
    };
  } catch (_error) {
    console.error('Error creating medical record:', _error);
    return { record: null, error: 'Failed to create medical record' };
  }
}

export async function getDiagnosesAction(
  _patientId?: string
): Promise<{ diagnoses: Diagnosis[]; error?: string }> {
  try {
    await requirePermission('medical_records:read');
    await requireCurrentUser();

    // For now, return empty as diagnoses need dedicated table
    // This would be implemented with a proper diagnoses table
    return { diagnoses: [] };
  } catch (_error) {
    console.error('Error fetching diagnoses:', _error);
    return { diagnoses: [], error: 'Failed to fetch diagnoses' };
  }
}

export async function getPrescriptionsAction(
  patientId?: string
): Promise<{ prescriptions: Prescription[]; error?: string }> {
  try {
    await requirePermission('medical_records:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    let query = `
      SELECT p.id, p.patient_id, p.patient_name, p.created_at, p.doctor_name, p.status,
             COALESCE(
               json_agg(json_build_object(
                 'name', pm.medication_name,
                 'dosage', pm.dosage,
                 'frequency', pm.frequency
               )) FILTER (WHERE pm.id IS NOT NULL),
               '[]'
             ) as medications
      FROM prescriptions p
      LEFT JOIN prescription_medications pm ON pm.prescription_id = p.id
      WHERE p.clinic_id = $1
    `;
    const params: unknown[] = [user.clinicId];

    if (patientId) {
      query += ` AND p.patient_id = $2`;
      params.push(patientId);
    }

    query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT 50`;

    const result = await database.query<{
      id: string;
      patient_id: string | null;
      patient_name: string;
      created_at: Date;
      doctor_name: string;
      status: string;
      medications: { name: string; dosage: string; frequency: string }[];
    }>(query, params);

    return {
      prescriptions: result.rows.map((row) => ({
        id: row.id,
        patientId: row.patient_id ?? '',
        patientName: row.patient_name,
        date: row.created_at,
        doctor: row.doctor_name,
        medications: row.medications,
        status: row.status as Prescription['status'],
      })),
    };
  } catch (_error) {
    console.error('Error fetching prescriptions:', _error);
    return { prescriptions: [], error: 'Failed to fetch prescriptions' };
  }
}
