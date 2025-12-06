/**
 * @fileoverview Supabase OSAX Case Repository Tests
 *
 * Tests for the Supabase OSAX case repository implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseOsaxCaseRepository,
  createSupabaseOsaxCaseRepository,
  type SupabaseOsaxCaseRepositoryDeps,
} from '../SupabaseOsaxCaseRepository.js';
import type { OsaxCaseStatus } from '@medicalcor/domain';

// ============================================================================
// MOCK SETUP
// ============================================================================

interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}

function createMockQueryBuilder(): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
  };
  return builder;
}

function createMockSupabaseClient(queryBuilder: MockQueryBuilder): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue(queryBuilder),
  } as unknown as SupabaseClient;
}

function createTestCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-123',
    subject_id: 'SUBJ-2025-001',
    patient_id: 'patient-456',
    case_number: 'OSA-2025-0001',
    status: 'PENDING_STUDY' as OsaxCaseStatus,
    priority: 'NORMAL' as const,
    referring_physician_id: 'dr-smith',
    assigned_specialist_id: null,
    tags: ['sleep-apnea', 'adult'],
    study_metadata: null,
    study_data_ref: null,
    clinical_score: null,
    score_history: [],
    physician_reviews: [],
    review_status: 'PENDING' as const,
    active_treatment: null,
    treatment_history: [],
    treatment_adherence_score: null,
    follow_ups: [],
    next_follow_up_date: null,
    consent_status: 'PENDING' as const,
    retention_policy: null,
    version: 1,
    is_deleted: false,
    deleted_at: null,
    created_at: '2025-01-01T10:00:00Z',
    updated_at: '2025-01-01T10:00:00Z',
    ...overrides,
  };
}

function createMockSubjectId(value: string) {
  return { value };
}

// ============================================================================
// TESTS
// ============================================================================

describe('SupabaseOsaxCaseRepository', () => {
  let mockQueryBuilder: MockQueryBuilder;
  let mockSupabase: SupabaseClient;
  let repository: SupabaseOsaxCaseRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryBuilder = createMockQueryBuilder();
    mockSupabase = createMockSupabaseClient(mockQueryBuilder);
    repository = new SupabaseOsaxCaseRepository({ supabase: mockSupabase });
  });

  describe('Constructor', () => {
    it('should create repository with default table names', () => {
      const repo = new SupabaseOsaxCaseRepository({ supabase: mockSupabase });
      expect(repo).toBeDefined();
    });

    it('should create repository with custom table names', () => {
      const repo = new SupabaseOsaxCaseRepository({
        supabase: mockSupabase,
        tableName: 'custom_cases',
        auditTableName: 'custom_audit',
      });
      expect(repo).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find case by id', async () => {
      const row = createTestCaseRow();
      mockQueryBuilder.single.mockResolvedValueOnce({ data: row, error: null });

      const result = await repository.findById('case-123');

      expect(result.success).toBe(true);
      expect(result.value?.id).toBe('case-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('id', 'case-123');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('is_deleted', false);
    });

    it('should return null when case not found (PGRST116)', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await repository.findById('non-existent');

      expect(result.success).toBe(true);
      expect(result.value).toBeNull();
    });

    it('should handle database errors', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'UNKNOWN', message: 'Database error' },
      });

      const result = await repository.findById('case-123');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('findBySubjectId', () => {
    it('should find case by subject id', async () => {
      const row = createTestCaseRow();
      mockQueryBuilder.single.mockResolvedValueOnce({ data: row, error: null });

      const subjectId = createMockSubjectId('SUBJ-2025-001');
      const result = await repository.findBySubjectId(subjectId as any);

      expect(result.success).toBe(true);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('subject_id', 'SUBJ-2025-001');
    });

    it('should return null when not found', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const subjectId = createMockSubjectId('SUBJ-NONE');
      const result = await repository.findBySubjectId(subjectId as any);

      expect(result.success).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('findByCaseNumber', () => {
    it('should find case by case number', async () => {
      const row = createTestCaseRow();
      mockQueryBuilder.single.mockResolvedValueOnce({ data: row, error: null });

      const result = await repository.findByCaseNumber('OSA-2025-0001');

      expect(result.success).toBe(true);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('case_number', 'OSA-2025-0001');
    });
  });

  describe('findByPatientId', () => {
    it('should find all cases for a patient', async () => {
      const rows = [createTestCaseRow({ id: 'case-1' }), createTestCaseRow({ id: 'case-2' })];
      mockQueryBuilder.order.mockResolvedValueOnce({ data: rows, error: null });

      const result = await repository.findByPatientId('patient-456');

      expect(result.success).toBe(true);
      expect(result.value).toHaveLength(2);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('patient_id', 'patient-456');
    });

    it('should return empty array when no cases found', async () => {
      mockQueryBuilder.order.mockResolvedValueOnce({ data: [], error: null });

      const result = await repository.findByPatientId('no-patient');

      expect(result.success).toBe(true);
      expect(result.value).toEqual([]);
    });
  });

  describe('findBySpecification', () => {
    it('should find cases by status specification', async () => {
      const rows = [createTestCaseRow({ status: 'PENDING' })];
      mockQueryBuilder.order.mockResolvedValueOnce({ data: rows, error: null });

      const result = await repository.findBySpecification({ type: 'BY_STATUS', status: 'PENDING' });

      expect(result.success).toBe(true);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', 'PENDING');
    });

    it('should apply limit and offset options', async () => {
      mockQueryBuilder.range.mockResolvedValueOnce({ data: [], error: null });

      await repository.findBySpecification(
        { type: 'BY_STATUS', status: 'PENDING' },
        { limit: 10, offset: 20 }
      );

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.range).toHaveBeenCalledWith(20, 29);
    });

    it('should apply ordering options', async () => {
      mockQueryBuilder.order.mockResolvedValueOnce({ data: [], error: null });

      await repository.findBySpecification(
        { type: 'BY_STATUS', status: 'PENDING' },
        { orderBy: 'createdAt', orderDirection: 'asc' }
      );

      expect(mockQueryBuilder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });

    it('should include deleted when option set', async () => {
      mockQueryBuilder.order.mockResolvedValueOnce({ data: [], error: null });

      await repository.findBySpecification(
        { type: 'BY_STATUS', status: 'PENDING' },
        { includeDeleted: true }
      );

      // Should NOT call eq with is_deleted when includeDeleted is true
      const eqCalls = mockQueryBuilder.eq.mock.calls;
      const isDeletedCall = eqCalls.find((call: unknown[]) => call[0] === 'is_deleted');
      expect(isDeletedCall).toBeUndefined();
    });

    it('should handle BY_PRIORITY specification', async () => {
      mockQueryBuilder.order.mockResolvedValueOnce({ data: [], error: null });

      await repository.findBySpecification({ type: 'BY_PRIORITY', priority: 'URGENT' });

      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('priority', 'URGENT');
    });

    it('should handle BY_SPECIALIST specification', async () => {
      mockQueryBuilder.order.mockResolvedValueOnce({ data: [], error: null });

      await repository.findBySpecification({ type: 'BY_SPECIALIST', specialistId: 'dr-jones' });

      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('assigned_specialist_id', 'dr-jones');
    });

    it('should handle NEEDING_REVIEW specification', async () => {
      mockQueryBuilder.order.mockResolvedValueOnce({ data: [], error: null });

      await repository.findBySpecification({ type: 'NEEDING_REVIEW' });

      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('status', 'SCORED');
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('review_status', 'PENDING');
    });

    it('should handle BY_DATE_RANGE specification', async () => {
      mockQueryBuilder.order.mockResolvedValueOnce({ data: [], error: null });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');

      await repository.findBySpecification({
        type: 'BY_DATE_RANGE',
        startDate,
        endDate,
      });

      expect(mockQueryBuilder.gte).toHaveBeenCalledWith('created_at', startDate.toISOString());
      expect(mockQueryBuilder.lte).toHaveBeenCalledWith('created_at', endDate.toISOString());
    });
  });

  describe('countBySpecification', () => {
    it('should return count of matching cases', async () => {
      mockQueryBuilder.eq.mockReturnValue({
        ...mockQueryBuilder,
        then: (resolve: (value: { count: number; error: null }) => void) =>
          resolve({ count: 5, error: null }),
      });
      // Override the select to return count
      mockQueryBuilder.select.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValueOnce({ count: 5, error: null }),
        }),
      });

      const result = await repository.countBySpecification({
        type: 'BY_STATUS',
        status: 'PENDING',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('existsBySubjectId', () => {
    it('should return true when case exists', async () => {
      mockQueryBuilder.eq.mockReturnValue({
        ...mockQueryBuilder,
        then: (resolve: (value: { count: number; error: null }) => void) =>
          resolve({ count: 1, error: null }),
      });
      mockQueryBuilder.select.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValueOnce({ count: 1, error: null }),
        }),
      });

      const subjectId = createMockSubjectId('SUBJ-EXISTS');
      const result = await repository.existsBySubjectId(subjectId as any);

      expect(result.success).toBe(true);
    });

    it('should return false when case does not exist', async () => {
      mockQueryBuilder.select.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValueOnce({ count: 0, error: null }),
        }),
      });

      const subjectId = createMockSubjectId('SUBJ-NONE');
      const result = await repository.existsBySubjectId(subjectId as any);

      expect(result.success).toBe(true);
      expect(result.value).toBe(false);
    });
  });

  describe('getNextSequenceNumber', () => {
    it('should return 1 when no cases for year', async () => {
      mockQueryBuilder.limit.mockResolvedValueOnce({ data: [], error: null });

      const result = await repository.getNextSequenceNumber(2025);

      expect(result.success).toBe(true);
      expect(result.value).toBe(1);
      expect(mockQueryBuilder.like).toHaveBeenCalledWith('case_number', 'OSA-2025-%');
    });

    it('should return next sequence number', async () => {
      mockQueryBuilder.limit.mockResolvedValueOnce({
        data: [{ case_number: 'OSA-2025-0042' }],
        error: null,
      });

      const result = await repository.getNextSequenceNumber(2025);

      expect(result.success).toBe(true);
      expect(result.value).toBe(43);
    });
  });

  describe('create', () => {
    it('should create a new case', async () => {
      // Mock getNextSequenceNumber - returns sequence 1
      mockQueryBuilder.limit.mockResolvedValueOnce({ data: [], error: null });
      // Mock insert -> select -> single chain
      const newRow = createTestCaseRow();
      mockQueryBuilder.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newRow, error: null }),
        }),
      });
      // Mock audit insert (from logAudit)
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const input = {
        subjectId: createMockSubjectId('SUBJ-NEW'),
        patientId: 'patient-new',
        referringPhysicianId: 'dr-new',
        tags: ['new-case'],
      };

      const result = await repository.create(input as any);

      expect(result.success).toBe(true);
      expect(result.value?.id).toBe('case-123');
    });

    it('should handle duplicate subject ID error', async () => {
      mockQueryBuilder.limit.mockResolvedValueOnce({ data: [], error: null });
      mockQueryBuilder.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'Duplicate' },
          }),
        }),
      });

      const input = {
        subjectId: createMockSubjectId('SUBJ-DUP'),
        patientId: 'patient-dup',
      };

      const result = await repository.create(input as any);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DUPLICATE_SUBJECT_ID');
    });
  });

  describe('update', () => {
    it('should update case with valid status transition', async () => {
      // PENDING_STUDY -> STUDY_COMPLETED is valid
      const currentRow = createTestCaseRow({
        status: 'PENDING_STUDY' as OsaxCaseStatus,
        version: 1,
      });
      // First findById call
      mockQueryBuilder.single.mockResolvedValueOnce({ data: currentRow, error: null });
      // The update -> eq -> eq -> select -> single chain
      mockQueryBuilder.update.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...currentRow, status: 'STUDY_COMPLETED', version: 2 },
                error: null,
              }),
            }),
          }),
        }),
      });
      // Audit insert
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const result = await repository.update('case-123', {
        status: 'STUDY_COMPLETED' as OsaxCaseStatus,
      });

      expect(result.success).toBe(true);
    });

    it('should return NOT_FOUND when case does not exist', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await repository.update('non-existent', { priority: 'HIGH' });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });

    it('should return VERSION_CONFLICT on optimistic lock failure', async () => {
      const currentRow = createTestCaseRow({ version: 2 });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: currentRow, error: null });

      const result = await repository.update('case-123', { priority: 'HIGH' }, 1);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VERSION_CONFLICT');
    });

    it('should reject invalid status transition', async () => {
      // PENDING_STUDY -> CLOSED is an invalid transition (can only go to STUDY_COMPLETED or CANCELLED)
      const currentRow = createTestCaseRow({
        status: 'PENDING_STUDY' as OsaxCaseStatus,
        version: 1,
      });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: currentRow, error: null });

      const result = await repository.update('case-123', { status: 'CLOSED' as OsaxCaseStatus });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('recordStudyCompletion', () => {
    it('should record study completion', async () => {
      const currentRow = createTestCaseRow({ status: 'STUDY_IN_PROGRESS' });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: currentRow, error: null })
        .mockResolvedValueOnce({
          data: { ...currentRow, status: 'STUDY_COMPLETED' },
          error: null,
        });
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const studyMetadata = {
        studyType: 'PSG' as const,
        studyDate: new Date(),
        durationHours: 8,
        facility: 'Sleep Lab A',
        technician: 'Tech One',
        qualityScore: 85,
      };

      const result = await repository.recordStudyCompletion('case-123', studyMetadata);

      expect(result.success).toBe(true);
    });

    it('should return NOT_FOUND when case does not exist', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await repository.recordStudyCompletion('non-existent', {
        studyType: 'PSG',
        studyDate: new Date(),
        durationHours: 8,
      } as any);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('recordClinicalScore', () => {
    it('should record clinical score', async () => {
      const currentRow = createTestCaseRow({ status: 'STUDY_COMPLETED', score_history: [] });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: currentRow, error: null })
        .mockResolvedValueOnce({ data: { ...currentRow, status: 'SCORED' }, error: null });
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const mockScore = {
        toJSON: () => ({ ahi: 15, severity: 'MODERATE' }),
      };

      const result = await repository.recordClinicalScore('case-123', mockScore as any, 'SYSTEM');

      expect(result.success).toBe(true);
    });
  });

  describe('recordPhysicianReview', () => {
    it('should record physician review', async () => {
      const currentRow = createTestCaseRow({
        status: 'SCORED',
        physician_reviews: [],
      });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: currentRow, error: null })
        .mockResolvedValueOnce({
          data: { ...currentRow, status: 'REVIEWED', review_status: 'APPROVED' },
          error: null,
        });
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const review = {
        reviewDate: new Date(),
        physicianId: 'dr-reviewer',
        physicianName: 'Dr. Reviewer',
        decision: 'APPROVE' as const,
        notes: 'Approved for treatment',
      };

      const result = await repository.recordPhysicianReview('case-123', review as any);

      expect(result.success).toBe(true);
    });
  });

  describe('initiateTreatment', () => {
    it('should initiate treatment', async () => {
      const currentRow = createTestCaseRow({
        status: 'REVIEWED',
        treatment_history: [],
      });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: currentRow, error: null })
        .mockResolvedValueOnce({
          data: { ...currentRow, status: 'IN_TREATMENT' },
          error: null,
        });
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const treatment = {
        type: 'CPAP' as const,
        startDate: new Date(),
        status: 'INITIATED' as const,
        deviceInfo: { model: 'ResMed AirSense 11' },
      };

      const result = await repository.initiateTreatment('case-123', treatment as any);

      expect(result.success).toBe(true);
    });
  });

  describe('updateTreatmentStatus', () => {
    it('should update treatment status', async () => {
      const currentRow = createTestCaseRow({
        active_treatment: { type: 'CPAP', status: 'INITIATED' },
      });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: currentRow, error: null })
        .mockResolvedValueOnce({ data: currentRow, error: null });
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const result = await repository.updateTreatmentStatus('case-123', 'IN_PROGRESS');

      expect(result.success).toBe(true);
    });

    it('should return error when no active treatment', async () => {
      const currentRow = createTestCaseRow({ active_treatment: null });
      mockQueryBuilder.single.mockResolvedValueOnce({ data: currentRow, error: null });

      const result = await repository.updateTreatmentStatus('case-123', 'IN_PROGRESS');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('scheduleFollowUp', () => {
    it('should schedule follow-up', async () => {
      const currentRow = createTestCaseRow({ follow_ups: [] });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: currentRow, error: null })
        .mockResolvedValueOnce({ data: currentRow, error: null });
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const followUp = {
        scheduledDate: new Date('2025-06-01'),
        type: 'STANDARD' as const,
        status: 'SCHEDULED' as const,
        notes: 'Initial follow-up',
      };

      const result = await repository.scheduleFollowUp('case-123', followUp as any);

      expect(result.success).toBe(true);
    });
  });

  describe('completeFollowUp', () => {
    it('should complete follow-up', async () => {
      const currentRow = createTestCaseRow({
        follow_ups: [
          {
            id: 'fu-123',
            scheduledDate: '2025-06-01T10:00:00Z',
            status: 'SCHEDULED',
            type: 'STANDARD',
          },
        ],
      });
      mockQueryBuilder.single
        .mockResolvedValueOnce({ data: currentRow, error: null })
        .mockResolvedValueOnce({ data: currentRow, error: null });
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const result = await repository.completeFollowUp('case-123', 'fu-123', {
        completedDate: new Date(),
        notes: 'Patient doing well',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('softDelete', () => {
    it('should soft delete case', async () => {
      const currentRow = createTestCaseRow();
      // findById call
      mockQueryBuilder.single.mockResolvedValueOnce({ data: currentRow, error: null });
      // update -> eq -> eq chain
      mockQueryBuilder.update.mockReturnValueOnce({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });
      // Audit insert
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const result = await repository.softDelete('case-123', 'Patient requested deletion');

      expect(result.success).toBe(true);
    });

    it('should return NOT_FOUND for non-existent case', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await repository.softDelete('non-existent', 'reason');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NOT_FOUND');
    });
  });

  describe('hardDelete', () => {
    it('should hard delete case', async () => {
      const currentRow = createTestCaseRow();
      // findById call
      mockQueryBuilder.single.mockResolvedValueOnce({ data: currentRow, error: null });
      // delete -> eq chain
      mockQueryBuilder.delete.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      // Audit insert
      mockQueryBuilder.insert.mockResolvedValueOnce({ error: null });

      const result = await repository.hardDelete('case-123');

      expect(result.success).toBe(true);
    });
  });

  describe('findManyByIds', () => {
    it('should find multiple cases by IDs', async () => {
      const rows = [createTestCaseRow({ id: 'case-1' }), createTestCaseRow({ id: 'case-2' })];
      mockQueryBuilder.eq.mockResolvedValueOnce({ data: rows, error: null });

      const result = await repository.findManyByIds(['case-1', 'case-2', 'case-3']);

      expect(result.success).toBe(true);
      expect(result.value?.size).toBe(2);
      expect(result.value?.get('case-1')).toBeDefined();
      expect(result.value?.get('case-2')).toBeDefined();
    });
  });

  describe('bulkUpdatePriority', () => {
    it('should bulk update priorities', async () => {
      const row = createTestCaseRow();
      mockQueryBuilder.single.mockResolvedValue({ data: row, error: null });
      mockQueryBuilder.insert.mockResolvedValue({ error: null });

      const updates = [
        { id: 'case-1', priority: 'HIGH' as const },
        { id: 'case-2', priority: 'URGENT' as const },
      ];

      const result = await repository.bulkUpdatePriority(updates);

      expect(result.success).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      const rows = [
        createTestCaseRow({ status: 'PENDING' }),
        createTestCaseRow({ status: 'PENDING', id: 'case-2' }),
        createTestCaseRow({ status: 'IN_TREATMENT', id: 'case-3' }),
      ];
      mockQueryBuilder.eq.mockResolvedValueOnce({ data: rows, error: null });

      const result = await repository.getStatistics();

      expect(result.success).toBe(true);
      expect(result.value?.totalCases).toBe(3);
      expect(result.value?.casesByStatus['PENDING']).toBe(2);
      expect(result.value?.casesByStatus['IN_TREATMENT']).toBe(1);
    });

    it('should filter by date range', async () => {
      mockQueryBuilder.lte.mockResolvedValueOnce({ data: [], error: null });

      const dateRange = {
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-06-30'),
      };

      await repository.getStatistics(dateRange);

      expect(mockQueryBuilder.gte).toHaveBeenCalledWith(
        'created_at',
        dateRange.startDate.toISOString()
      );
      expect(mockQueryBuilder.lte).toHaveBeenCalledWith(
        'created_at',
        dateRange.endDate.toISOString()
      );
    });
  });

  describe('Transaction Support', () => {
    it('should begin transaction', async () => {
      const context = await repository.beginTransaction();

      expect(context.id).toBeDefined();
      expect(context.startedAt).toBeInstanceOf(Date);
      expect(context.operations).toEqual([]);
    });

    it('should commit transaction (placeholder)', async () => {
      const context = await repository.beginTransaction();

      await expect(repository.commitTransaction(context)).resolves.toBeUndefined();
    });

    it('should rollback transaction (placeholder)', async () => {
      const context = await repository.beginTransaction();

      await expect(repository.rollbackTransaction(context)).resolves.toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST301', message: 'Timeout' },
      });

      const result = await repository.findById('case-123');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TIMEOUT');
    });

    it('should handle version conflict errors', async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: '40001', message: 'Version conflict' },
      });

      const result = await repository.findById('case-123');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VERSION_CONFLICT');
    });

    it('should handle unknown errors', async () => {
      mockQueryBuilder.single.mockRejectedValueOnce(new Error('Unexpected error'));

      const result = await repository.findById('case-123');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN_ERROR');
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createSupabaseOsaxCaseRepository', () => {
  it('should create a repository instance', () => {
    const mockQueryBuilder = createMockQueryBuilder();
    const mockSupabase = createMockSupabaseClient(mockQueryBuilder);

    const repo = createSupabaseOsaxCaseRepository({ supabase: mockSupabase });

    expect(repo).toBeDefined();
  });
});
