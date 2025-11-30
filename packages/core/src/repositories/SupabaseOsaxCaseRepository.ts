/**
 * @fileoverview SupabaseOsaxCaseRepository
 *
 * Concrete implementation of IOsaxCaseRepository using Supabase/PostgreSQL.
 * Banking/Medical Grade implementation with GDPR compliance.
 *
 * @module core/repositories/supabase-osax-case-repository
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IOsaxCaseRepository,
  OsaxCaseRepositoryResult,
  OsaxCaseRepositoryError,
  OsaxCaseSpec,
  QueryOptions,
  TransactionContext,
  OsaxCaseStatistics,
} from '@medicalcor/domain';
import type {
  OsaxCase,
  OsaxCaseStatus,
  OsaxStudyMetadata,
  OsaxTreatmentRecord,
  OsaxFollowUpRecord,
  OsaxPhysicianReview,
  CreateOsaxCaseInput,
  UpdateOsaxCaseInput,
} from '@medicalcor/domain';
import type { OsaxClinicalScore } from '@medicalcor/domain';
import type { OsaxSubjectId } from '@medicalcor/domain';
import { createOsaxCase, isValidStatusTransition } from '@medicalcor/domain';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Database row type for osax_cases table
 */
interface OsaxCaseRow {
  id: string;
  subject_id: string;
  patient_id: string;
  case_number: string;
  status: OsaxCaseStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  referring_physician_id: string | null;
  assigned_specialist_id: string | null;
  tags: string[];
  study_metadata: Record<string, unknown> | null;
  study_data_ref: string | null;
  clinical_score: Record<string, unknown> | null;
  score_history: Record<string, unknown>[];
  physician_reviews: Record<string, unknown>[];
  review_status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_MODIFICATION';
  active_treatment: Record<string, unknown> | null;
  treatment_history: Record<string, unknown>[];
  treatment_adherence_score: number | null;
  follow_ups: Record<string, unknown>[];
  next_follow_up_date: string | null;
  consent_status: 'PENDING' | 'OBTAINED' | 'WITHDRAWN';
  retention_policy: string | null;
  version: number;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Repository dependencies
 */
export interface SupabaseOsaxCaseRepositoryDeps {
  supabase: SupabaseClient;
  tableName?: string;
  auditTableName?: string;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

/**
 * SupabaseOsaxCaseRepository
 *
 * Implements IOsaxCaseRepository using Supabase/PostgreSQL.
 */
export class SupabaseOsaxCaseRepository implements IOsaxCaseRepository {
  private readonly supabase: SupabaseClient;
  private readonly tableName: string;
  private readonly auditTableName: string;

  constructor(deps: SupabaseOsaxCaseRepositoryDeps) {
    this.supabase = deps.supabase;
    this.tableName = deps.tableName ?? 'osax_cases';
    this.auditTableName = deps.auditTableName ?? 'osax_audit_log';
  }

  // ============================================================================
  // QUERY OPERATIONS
  // ============================================================================

  async findById(id: string): Promise<OsaxCaseRepositoryResult<OsaxCase | null>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .eq('is_deleted', false)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: true, value: null };
        }
        return this.handleError(error);
      }

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async findBySubjectId(
    subjectId: OsaxSubjectId
  ): Promise<OsaxCaseRepositoryResult<OsaxCase | null>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('subject_id', subjectId.value)
        .eq('is_deleted', false)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: true, value: null };
        }
        return this.handleError(error);
      }

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async findByCaseNumber(caseNumber: string): Promise<OsaxCaseRepositoryResult<OsaxCase | null>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('case_number', caseNumber)
        .eq('is_deleted', false)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: true, value: null };
        }
        return this.handleError(error);
      }

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async findByPatientId(patientId: string): Promise<OsaxCaseRepositoryResult<OsaxCase[]>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('patient_id', patientId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) {
        return this.handleError(error);
      }

      return { success: true, value: data.map((row: OsaxCaseRow) => this.mapRowToCase(row)) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async findBySpecification(
    spec: OsaxCaseSpec,
    options?: QueryOptions
  ): Promise<OsaxCaseRepositoryResult<OsaxCase[]>> {
    try {
      let query = this.supabase.from(this.tableName).select('*');

      // Apply specification filter
      query = this.applySpecification(query, spec);

      // Apply deleted filter unless explicitly included
      if (!options?.includeDeleted) {
        query = query.eq('is_deleted', false);
      }

      // Apply ordering
      if (options?.orderBy) {
        query = query.order(this.mapFieldToColumn(options.orderBy), {
          ascending: options.orderDirection === 'asc',
        });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit ?? 100) - 1);
      }

      const { data, error } = await query;

      if (error) {
        return this.handleError(error);
      }

      return { success: true, value: data.map((row: OsaxCaseRow) => this.mapRowToCase(row)) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async countBySpecification(spec: OsaxCaseSpec): Promise<OsaxCaseRepositoryResult<number>> {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false);

      query = this.applySpecification(query, spec);

      const { count, error } = await query;

      if (error) {
        return this.handleError(error);
      }

      return { success: true, value: count ?? 0 };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async existsBySubjectId(subjectId: OsaxSubjectId): Promise<OsaxCaseRepositoryResult<boolean>> {
    try {
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', subjectId.value)
        .eq('is_deleted', false);

      if (error) {
        return this.handleError(error);
      }

      return { success: true, value: (count ?? 0) > 0 };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async getNextSequenceNumber(year: number): Promise<OsaxCaseRepositoryResult<number>> {
    try {
      const pattern = `OSA-${year}-%`;

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('case_number')
        .like('case_number', pattern)
        .order('case_number', { ascending: false })
        .limit(1);

      if (error) {
        return this.handleError(error);
      }

      if (!data || data.length === 0) {
        return { success: true, value: 1 };
      }

      const lastCaseNumber = data[0].case_number;
      const lastSequence = parseInt(lastCaseNumber.split('-')[2] ?? '0', 10);
      return { success: true, value: lastSequence + 1 };
    } catch (err) {
      return this.handleError(err);
    }
  }

  // ============================================================================
  // COMMAND OPERATIONS
  // ============================================================================

  async create(input: CreateOsaxCaseInput): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      // Get next sequence number
      const seqResult = await this.getNextSequenceNumber(new Date().getFullYear());
      if (!seqResult.success) {
        return seqResult;
      }

      // Create case entity
      const osaxCase = createOsaxCase(input, seqResult.value);

      // Insert into database
      const row: Partial<OsaxCaseRow> = {
        id: osaxCase.id,
        subject_id: input.subjectId.value,
        patient_id: input.patientId,
        case_number: osaxCase.caseNumber,
        status: osaxCase.status,
        priority: osaxCase.priority,
        referring_physician_id: input.referringPhysicianId ?? null,
        assigned_specialist_id: input.assignedSpecialistId ?? null,
        tags: input.tags ?? [],
        review_status: osaxCase.reviewStatus,
        consent_status: osaxCase.consentStatus,
        version: 1,
        is_deleted: false,
        score_history: [],
        physician_reviews: [],
        treatment_history: [],
        follow_ups: [],
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(row)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return {
            success: false,
            error: {
              code: 'DUPLICATE_SUBJECT_ID',
              message: 'A case with this subject ID already exists',
            },
          };
        }
        return this.handleError(error);
      }

      // Log audit entry
      await this.logAudit('CREATE', data.id, null, row);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async update(
    id: string,
    input: UpdateOsaxCaseInput,
    expectedVersion?: number
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      // Fetch current case
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Case not found' },
        };
      }

      const current = currentResult.value;

      // Check version for optimistic locking
      if (expectedVersion !== undefined && current.version !== expectedVersion) {
        return {
          success: false,
          error: {
            code: 'VERSION_CONFLICT',
            message: `Version conflict: expected ${expectedVersion}, got ${current.version}`,
          },
        };
      }

      // Validate status transition if status is being updated
      if (input.status && input.status !== current.status) {
        if (!isValidStatusTransition(current.status, input.status)) {
          return {
            success: false,
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: `Cannot transition from ${current.status} to ${input.status}`,
            },
          };
        }
      }

      // Prepare update
      const updates: Partial<OsaxCaseRow> = {
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      if (input.status) updates.status = input.status;
      if (input.priority) updates.priority = input.priority;
      if (input.assignedSpecialistId !== undefined) {
        updates.assigned_specialist_id = input.assignedSpecialistId ?? null;
      }
      if (input.tags) updates.tags = input.tags;
      if (input.consentStatus) updates.consent_status = input.consentStatus;

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version)
        .select()
        .single();

      if (error) {
        return this.handleError(error);
      }

      if (!data) {
        return {
          success: false,
          error: { code: 'VERSION_CONFLICT', message: 'Concurrent modification detected' },
        };
      }

      await this.logAudit('UPDATE', id, current, data);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async recordStudyCompletion(
    id: string,
    studyMetadata: OsaxStudyMetadata
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } };
      }

      const current = currentResult.value;

      const updates: Partial<OsaxCaseRow> = {
        status: 'STUDY_COMPLETED',
        study_metadata: {
          studyType: studyMetadata.studyType,
          studyDate: studyMetadata.studyDate.toISOString(),
          durationHours: studyMetadata.durationHours,
          facility: studyMetadata.facility,
          technician: studyMetadata.technician,
          equipment: studyMetadata.equipment,
          qualityScore: studyMetadata.qualityScore,
          notes: studyMetadata.notes,
        },
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version)
        .select()
        .single();

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('STUDY_COMPLETED', id, current, data);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async recordClinicalScore(
    id: string,
    score: OsaxClinicalScore,
    scoredBy: 'SYSTEM' | 'PHYSICIAN',
    notes?: string
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } };
      }

      const current = currentResult.value;

      const scoreEntry = {
        score: score.toJSON(),
        scoredAt: new Date().toISOString(),
        scoredBy,
        notes,
      };

      const updates: Partial<OsaxCaseRow> = {
        status: 'SCORED',
        clinical_score: score.toJSON(),
        score_history: [
          ...(current.scoreHistory as unknown as Record<string, unknown>[]),
          scoreEntry,
        ],
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version)
        .select()
        .single();

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('SCORED', id, current, data);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async recordPhysicianReview(
    id: string,
    review: OsaxPhysicianReview
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } };
      }

      const current = currentResult.value;

      const reviewEntry = {
        reviewDate: review.reviewDate.toISOString(),
        physicianId: review.physicianId,
        physicianName: review.physicianName,
        decision: review.decision,
        modifiedRecommendation: review.modifiedRecommendation,
        notes: review.notes,
        referralInfo: review.referralInfo,
      };

      const updates: Partial<OsaxCaseRow> = {
        status: 'REVIEWED',
        review_status: review.decision === 'APPROVE' ? 'APPROVED' : 'NEEDS_MODIFICATION',
        physician_reviews: [
          ...(current.physicianReviews as unknown as Record<string, unknown>[]),
          reviewEntry,
        ],
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version)
        .select()
        .single();

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('REVIEWED', id, current, data);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async initiateTreatment(
    id: string,
    treatment: OsaxTreatmentRecord
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } };
      }

      const current = currentResult.value;

      const treatmentEntry = {
        type: treatment.type,
        startDate: treatment.startDate.toISOString(),
        status: treatment.status,
        deviceInfo: treatment.deviceInfo,
        notes: treatment.notes,
      };

      const updates: Partial<OsaxCaseRow> = {
        status: 'IN_TREATMENT',
        active_treatment: treatmentEntry,
        treatment_history: [
          ...(current.treatmentHistory as unknown as Record<string, unknown>[]),
          treatmentEntry,
        ],
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version)
        .select()
        .single();

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('TREATMENT_INITIATED', id, current, data);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async updateTreatmentStatus(
    id: string,
    treatmentStatus: OsaxTreatmentRecord['status'],
    complianceData?: OsaxTreatmentRecord['compliance']
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } };
      }

      const current = currentResult.value;

      if (!current.activeTreatment) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'No active treatment found' },
        };
      }

      const updatedTreatment = {
        ...(current.activeTreatment as Record<string, unknown>),
        status: treatmentStatus,
        compliance: complianceData,
      };

      const updates: Partial<OsaxCaseRow> = {
        active_treatment: updatedTreatment,
        treatment_adherence_score: complianceData?.compliancePercentage ?? null,
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version)
        .select()
        .single();

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('TREATMENT_STATUS_UPDATED', id, current, data);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async scheduleFollowUp(
    id: string,
    followUp: Omit<OsaxFollowUpRecord, 'id'>
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } };
      }

      const current = currentResult.value;

      const followUpId = crypto.randomUUID();
      const followUpEntry = {
        id: followUpId,
        scheduledDate: followUp.scheduledDate.toISOString(),
        type: followUp.type,
        status: followUp.status,
        notes: followUp.notes,
      };

      const updates: Partial<OsaxCaseRow> = {
        follow_ups: [...(current.followUps as unknown as Record<string, unknown>[]), followUpEntry],
        next_follow_up_date: followUp.scheduledDate.toISOString(),
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version)
        .select()
        .single();

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('FOLLOW_UP_SCHEDULED', id, current, data);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async completeFollowUp(
    id: string,
    followUpId: string,
    completionData: {
      completedDate: Date;
      notes?: string;
      updatedIndicators?: Partial<OsaxClinicalScore['indicators']>;
    }
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } };
      }

      const current = currentResult.value;

      const followUps = current.followUps as unknown as Array<
        Record<string, unknown> & { scheduledDate: string; status: string }
      >;
      const updatedFollowUps = followUps.map((fu) => {
        if (fu.id === followUpId) {
          return {
            ...fu,
            status: 'COMPLETED' as const,
            completedDate: completionData.completedDate.toISOString(),
            notes: completionData.notes,
            updatedIndicators: completionData.updatedIndicators,
          };
        }
        return fu;
      });

      // Find next scheduled follow-up
      const scheduledFollowUps = updatedFollowUps.filter((fu) => fu.status === 'SCHEDULED');
      const nextFollowUp = scheduledFollowUps.sort(
        (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
      )[0];

      const updates: Partial<OsaxCaseRow> = {
        follow_ups: updatedFollowUps,
        next_follow_up_date: nextFollowUp ? nextFollowUp.scheduledDate : null,
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version)
        .select()
        .single();

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('FOLLOW_UP_COMPLETED', id, current, data);

      return { success: true, value: this.mapRowToCase(data) };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async updateStatus(
    id: string,
    newStatus: OsaxCaseStatus,
    _reason?: string
  ): Promise<OsaxCaseRepositoryResult<OsaxCase>> {
    return this.update(id, { status: newStatus });
  }

  async softDelete(id: string, reason: string): Promise<OsaxCaseRepositoryResult<void>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;
      if (!currentResult.value) {
        return { success: false, error: { code: 'NOT_FOUND', message: 'Case not found' } };
      }

      const current = currentResult.value;

      const updates: Partial<OsaxCaseRow> = {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      };

      const { error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('id', id)
        .eq('version', current.version);

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('SOFT_DELETE', id, current, { reason });

      return { success: true, value: undefined };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async hardDelete(id: string): Promise<OsaxCaseRepositoryResult<void>> {
    try {
      const currentResult = await this.findById(id);
      if (!currentResult.success) return currentResult;

      const { error } = await this.supabase.from(this.tableName).delete().eq('id', id);

      if (error) {
        return this.handleError(error);
      }

      await this.logAudit('HARD_DELETE', id, currentResult.value, null);

      return { success: true, value: undefined };
    } catch (err) {
      return this.handleError(err);
    }
  }

  // ============================================================================
  // BATCH OPERATIONS
  // ============================================================================

  async findManyByIds(ids: string[]): Promise<OsaxCaseRepositoryResult<Map<string, OsaxCase>>> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .in('id', ids)
        .eq('is_deleted', false);

      if (error) {
        return this.handleError(error);
      }

      const map = new Map<string, OsaxCase>();
      for (const row of data) {
        map.set(row.id, this.mapRowToCase(row));
      }

      return { success: true, value: map };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async bulkUpdatePriority(
    updates: Array<{ id: string; priority: OsaxCase['priority'] }>
  ): Promise<OsaxCaseRepositoryResult<number>> {
    try {
      let updatedCount = 0;

      for (const update of updates) {
        const result = await this.update(update.id, { priority: update.priority });
        if (result.success) {
          updatedCount++;
        }
      }

      return { success: true, value: updatedCount };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async getStatistics(dateRange?: {
    startDate: Date;
    endDate: Date;
  }): Promise<OsaxCaseRepositoryResult<OsaxCaseStatistics>> {
    try {
      let query = this.supabase.from(this.tableName).select('*').eq('is_deleted', false);

      if (dateRange) {
        query = query
          .gte('created_at', dateRange.startDate.toISOString())
          .lte('created_at', dateRange.endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) {
        return this.handleError(error);
      }

      const stats: OsaxCaseStatistics = {
        totalCases: data.length,
        casesByStatus: {} as Record<OsaxCaseStatus, number>,
        casesBySeverity: {},
        casesByTreatment: {},
        averageTimeToReview: 0,
        averageTimeToTreatment: 0,
        treatmentComplianceRate: 0,
        followUpCompletionRate: 0,
      };

      // Calculate statistics
      for (const row of data) {
        // By status
        stats.casesByStatus[row.status] = (stats.casesByStatus[row.status] ?? 0) + 1;

        // By severity
        if (row.clinical_score) {
          const severity = (row.clinical_score as Record<string, unknown>).severity as string;
          stats.casesBySeverity[severity] = (stats.casesBySeverity[severity] ?? 0) + 1;
        }

        // By treatment
        if (row.active_treatment) {
          const type = (row.active_treatment as Record<string, unknown>).type as string;
          stats.casesByTreatment[type] = (stats.casesByTreatment[type] ?? 0) + 1;
        }
      }

      return { success: true, value: stats };
    } catch (err) {
      return this.handleError(err);
    }
  }

  // ============================================================================
  // TRANSACTION SUPPORT
  // ============================================================================

  async beginTransaction(): Promise<TransactionContext> {
    return {
      id: crypto.randomUUID(),
      startedAt: new Date(),
      operations: [],
    };
  }

  async commitTransaction(_context: TransactionContext): Promise<void> {
    // Supabase doesn't support explicit transactions via client
    // This is a placeholder for future PostgreSQL direct connection support
  }

  async rollbackTransaction(_context: TransactionContext): Promise<void> {
    // Supabase doesn't support explicit transactions via client
    // This is a placeholder for future PostgreSQL direct connection support
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapRowToCase(row: OsaxCaseRow): OsaxCase {
    return {
      id: row.id,
      subjectId: { value: row.subject_id } as OsaxSubjectId,
      patientId: row.patient_id,
      caseNumber: row.case_number,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      referringPhysicianId: row.referring_physician_id ?? undefined,
      assignedSpecialistId: row.assigned_specialist_id ?? undefined,
      priority: row.priority,
      tags: Object.freeze(row.tags),
      studyMetadata: row.study_metadata ? this.mapStudyMetadata(row.study_metadata) : undefined,
      studyDataRef: row.study_data_ref ?? undefined,
      clinicalScore: row.clinical_score
        ? (row.clinical_score as unknown as OsaxClinicalScore)
        : undefined,
      scoreHistory: Object.freeze(
        row.score_history.map((s) => ({
          score: s.score as OsaxClinicalScore,
          scoredAt: new Date(s.scoredAt as string),
          scoredBy: s.scoredBy as 'SYSTEM' | 'PHYSICIAN',
          notes: s.notes as string | undefined,
        }))
      ),
      physicianReviews: Object.freeze(
        row.physician_reviews.map((r) => ({
          reviewDate: new Date(r.reviewDate as string),
          physicianId: r.physicianId as string,
          physicianName: r.physicianName as string | undefined,
          decision: r.decision as OsaxPhysicianReview['decision'],
          modifiedRecommendation:
            r.modifiedRecommendation as OsaxPhysicianReview['modifiedRecommendation'],
          notes: r.notes as string | undefined,
          referralInfo: r.referralInfo as OsaxPhysicianReview['referralInfo'],
        }))
      ),
      reviewStatus: row.review_status,
      activeTreatment: row.active_treatment
        ? this.mapTreatmentRecord(row.active_treatment)
        : undefined,
      treatmentHistory: Object.freeze(row.treatment_history.map((t) => this.mapTreatmentRecord(t))),
      treatmentAdherenceScore: row.treatment_adherence_score ?? undefined,
      followUps: Object.freeze(
        row.follow_ups.map((f) => ({
          id: f.id as string,
          scheduledDate: new Date(f.scheduledDate as string),
          completedDate: f.completedDate ? new Date(f.completedDate as string) : undefined,
          type: f.type as OsaxFollowUpRecord['type'],
          status: f.status as OsaxFollowUpRecord['status'],
          notes: f.notes as string | undefined,
          updatedIndicators: f.updatedIndicators as OsaxFollowUpRecord['updatedIndicators'],
        }))
      ),
      nextFollowUpDate: row.next_follow_up_date ? new Date(row.next_follow_up_date) : undefined,
      version: row.version,
      consentStatus: row.consent_status,
      retentionPolicy: row.retention_policy ?? undefined,
      isDeleted: row.is_deleted,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    };
  }

  private mapStudyMetadata(data: Record<string, unknown>): OsaxStudyMetadata {
    return {
      studyType: data.studyType as OsaxStudyMetadata['studyType'],
      studyDate: new Date(data.studyDate as string),
      durationHours: data.durationHours as number,
      facility: data.facility as string | undefined,
      technician: data.technician as string | undefined,
      equipment: data.equipment as string | undefined,
      qualityScore: data.qualityScore as number | undefined,
      notes: data.notes as string | undefined,
    };
  }

  private mapTreatmentRecord(data: Record<string, unknown>): OsaxTreatmentRecord {
    return {
      type: data.type as OsaxTreatmentRecord['type'],
      startDate: new Date(data.startDate as string),
      endDate: data.endDate ? new Date(data.endDate as string) : undefined,
      status: data.status as OsaxTreatmentRecord['status'],
      deviceInfo: data.deviceInfo as OsaxTreatmentRecord['deviceInfo'],
      compliance: data.compliance as OsaxTreatmentRecord['compliance'],
      notes: data.notes as string | undefined,
    };
  }

  private mapFieldToColumn(field: keyof OsaxCase): string {
    const fieldMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      patientId: 'patient_id',
      caseNumber: 'case_number',
      assignedSpecialistId: 'assigned_specialist_id',
      referringPhysicianId: 'referring_physician_id',
      nextFollowUpDate: 'next_follow_up_date',
      reviewStatus: 'review_status',
      consentStatus: 'consent_status',
      treatmentAdherenceScore: 'treatment_adherence_score',
      isDeleted: 'is_deleted',
      deletedAt: 'deleted_at',
    };
    return fieldMap[field as string] ?? String(field);
  }

  private applySpecification(
    query: ReturnType<SupabaseClient['from']>,
    spec: OsaxCaseSpec
  ): ReturnType<SupabaseClient['from']> {
    switch (spec.type) {
      case 'BY_STATUS':
        return query.eq('status', spec.status);
      case 'BY_SEVERITY':
        return query.eq('clinical_score->severity', spec.severity);
      case 'BY_PRIORITY':
        return query.eq('priority', spec.priority);
      case 'BY_SPECIALIST':
        return query.eq('assigned_specialist_id', spec.specialistId);
      case 'NEEDING_REVIEW':
        return query.eq('status', 'SCORED').eq('review_status', 'PENDING');
      case 'OVERDUE_FOLLOW_UP':
        return query.lt('next_follow_up_date', spec.asOfDate.toISOString());
      case 'BY_DATE_RANGE':
        return query
          .gte('created_at', spec.startDate.toISOString())
          .lte('created_at', spec.endDate.toISOString());
      case 'BY_TREATMENT':
        return query.eq('active_treatment->type', spec.treatmentType);
      default:
        return query;
    }
  }

  private async logAudit(
    action: string,
    caseId: string,
    before: unknown,
    after: unknown
  ): Promise<void> {
    try {
      await this.supabase.from(this.auditTableName).insert({
        case_id: caseId,
        action,
        before_state: before,
        after_state: after,
        performed_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to log audit entry:', err);
    }
  }

  private handleError(error: unknown): OsaxCaseRepositoryResult<never> {
    const err = error as { code?: string; message?: string };

    let code: OsaxCaseRepositoryError['code'] = 'UNKNOWN_ERROR';
    if (err.code === 'PGRST116') code = 'NOT_FOUND';
    if (err.code === '23505') code = 'DUPLICATE_SUBJECT_ID';
    if (err.code === '40001') code = 'VERSION_CONFLICT';
    if (err.code === 'PGRST301') code = 'TIMEOUT';

    return {
      success: false,
      error: {
        code,
        message: err.message ?? 'Unknown error occurred',
        cause: error instanceof Error ? error : undefined,
      },
    };
  }
}

/**
 * Factory function to create repository instance
 */
export function createSupabaseOsaxCaseRepository(
  deps: SupabaseOsaxCaseRepositoryDeps
): IOsaxCaseRepository {
  return new SupabaseOsaxCaseRepository(deps);
}
