/**
 * @fileoverview Data Inventory Service Tests
 *
 * GDPR Article 30 compliance: Tests for Records of Processing Activities (RoPA)
 * Ensures data cataloging and processing activity management works correctly.
 *
 * @module core/security/gdpr/__tests__/data-inventory-service.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PostgresDataInventoryService,
  createDataInventoryService,
  type DataProcessingActivity,
  type DataCategory,
  type LegalBasis,
  type DataRecipient,
} from '../data-inventory-service.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

interface MockQueryBuilder {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  contains: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}

function createMockSupabase(): SupabaseClient & { _mockQueryBuilder: MockQueryBuilder } {
  const mockQueryBuilder: MockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  const mockSupabase = {
    from: vi.fn().mockReturnValue(mockQueryBuilder),
    _mockQueryBuilder: mockQueryBuilder,
  } as unknown as SupabaseClient & { _mockQueryBuilder: MockQueryBuilder };

  return mockSupabase;
}

function createSampleActivity(
  overrides: Partial<DataProcessingActivity> = {}
): DataProcessingActivity {
  return {
    activityId: 'act-001',
    name: 'Patient Registration',
    description: 'Collection of patient data during registration',
    purpose: 'Healthcare service provision',
    legalBasis: 'contract' as LegalBasis,
    dataCategories: ['personal', 'contact', 'health'] as DataCategory[],
    dataSubjectTypes: ['patients'],
    recipients: [
      {
        name: 'Internal Staff',
        type: 'internal',
        purpose: 'Treatment provision',
      },
    ] as DataRecipient[],
    retentionPeriod: '3650 days',
    securityMeasures: ['encryption', 'access_control', 'audit_logging'],
    transfersOutsideEU: false,
    ...overrides,
  };
}

function createSampleDbRow(activity: DataProcessingActivity) {
  return {
    id: 'db-uuid-001',
    activity_id: activity.activityId,
    activity_name: activity.name,
    description: activity.description,
    purpose: activity.purpose,
    legal_basis: activity.legalBasis,
    data_categories: activity.dataCategories,
    data_subject_types: activity.dataSubjectTypes,
    recipients: activity.recipients,
    retention_period_days: parseInt(activity.retentionPeriod) || 365,
    security_measures: activity.securityMeasures,
    transfers_outside_eu: activity.transfersOutsideEU,
    transfer_safeguards: activity.transferSafeguards ?? null,
    is_active: true,
    last_reviewed_at: null,
    reviewed_by: null,
    dpia_required: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PostgresDataInventoryService', () => {
  let supabase: ReturnType<typeof createMockSupabase>;
  let service: PostgresDataInventoryService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    supabase = createMockSupabase();
    service = new PostgresDataInventoryService({
      supabase,
      organizationName: 'MedicalCor Clinic',
      dpoContact: 'dpo@medicalcor.com',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // FACTORY TESTS
  // ==========================================================================

  describe('Factory Function', () => {
    it('should create service with createDataInventoryService factory', () => {
      const svc = createDataInventoryService({
        supabase,
        organizationName: 'Test Org',
      });
      expect(svc).toBeInstanceOf(PostgresDataInventoryService);
    });

    it('should accept optional DPO contact', () => {
      const svc = createDataInventoryService({
        supabase,
        organizationName: 'Test Org',
        dpoContact: 'dpo@test.org',
      });
      expect(svc).toBeInstanceOf(PostgresDataInventoryService);
    });
  });

  // ==========================================================================
  // REGISTER ACTIVITY TESTS
  // ==========================================================================

  describe('registerActivity', () => {
    it('should register a new processing activity', async () => {
      const activity = createSampleActivity();
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase.from).toHaveBeenCalledWith('gdpr_data_inventory');
      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_id: 'act-001',
          activity_name: 'Patient Registration',
          purpose: 'Healthcare service provision',
          legal_basis: 'contract',
          data_categories: ['personal', 'contact', 'health'],
          is_active: true,
        }),
        { onConflict: 'activity_id' }
      );
    });

    it('should convert retention period to days', async () => {
      const activity = createSampleActivity({ retentionPeriod: '730 days' });
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          retention_period_days: 730,
        }),
        expect.anything()
      );
    });

    it('should default retention to 365 days for invalid input', async () => {
      const activity = createSampleActivity({ retentionPeriod: 'invalid' });
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          retention_period_days: 365,
        }),
        expect.anything()
      );
    });

    it('should include transfer safeguards when provided', async () => {
      const activity = createSampleActivity({
        transfersOutsideEU: true,
        transferSafeguards: 'Standard Contractual Clauses',
      });
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          transfers_outside_eu: true,
          transfer_safeguards: 'Standard Contractual Clauses',
        }),
        expect.anything()
      );
    });

    it('should throw error when database operation fails', async () => {
      const activity = createSampleActivity();
      supabase._mockQueryBuilder.upsert.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      await expect(service.registerActivity(activity)).rejects.toThrow(
        'Failed to register processing activity: Database connection failed'
      );
    });

    it('should set updated_at timestamp on registration', async () => {
      const activity = createSampleActivity();
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          updated_at: '2024-06-15T10:00:00.000Z',
        }),
        expect.anything()
      );
    });
  });

  // ==========================================================================
  // GET ACTIVITIES TESTS
  // ==========================================================================

  describe('getActivities', () => {
    it('should return all active processing activities', async () => {
      const activity1 = createSampleActivity({ activityId: 'act-001', name: 'Activity 1' });
      const activity2 = createSampleActivity({ activityId: 'act-002', name: 'Activity 2' });

      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: [createSampleDbRow(activity1), createSampleDbRow(activity2)],
        error: null,
      });

      const result = await service.getActivities();

      expect(supabase.from).toHaveBeenCalledWith('gdpr_data_inventory');
      expect(supabase._mockQueryBuilder.eq).toHaveBeenCalledWith('is_active', true);
      expect(result).toHaveLength(2);
      expect(result[0].activityId).toBe('act-001');
      expect(result[1].activityId).toBe('act-002');
    });

    it('should return empty array when no activities exist', async () => {
      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await service.getActivities();

      expect(result).toEqual([]);
    });

    it('should throw error when database operation fails', async () => {
      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: null,
        error: { message: 'Query timeout' },
      });

      await expect(service.getActivities()).rejects.toThrow(
        'Failed to get processing activities: Query timeout'
      );
    });

    it('should order activities by name ascending', async () => {
      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: [],
        error: null,
      });

      await service.getActivities();

      expect(supabase._mockQueryBuilder.order).toHaveBeenCalledWith('activity_name', {
        ascending: true,
      });
    });

    it('should correctly map database row to activity', async () => {
      const activity = createSampleActivity({
        transfersOutsideEU: true,
        transferSafeguards: 'SCC',
      });
      const dbRow = {
        ...createSampleDbRow(activity),
        security_measures: ['encryption', 'mfa'],
      };

      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: [dbRow],
        error: null,
      });

      const result = await service.getActivities();

      expect(result[0]).toEqual(
        expect.objectContaining({
          activityId: activity.activityId,
          name: activity.name,
          description: activity.description,
          purpose: activity.purpose,
          legalBasis: activity.legalBasis,
          dataCategories: activity.dataCategories,
          transfersOutsideEU: true,
          transferSafeguards: 'SCC',
          securityMeasures: ['encryption', 'mfa'],
        })
      );
    });
  });

  // ==========================================================================
  // GET ACTIVITIES BY CATEGORY TESTS
  // ==========================================================================

  describe('getActivitiesByCategory', () => {
    it('should filter activities by data category', async () => {
      const healthActivity = createSampleActivity({
        activityId: 'health-001',
        dataCategories: ['health', 'personal'],
      });

      supabase._mockQueryBuilder.contains.mockResolvedValue({
        data: [createSampleDbRow(healthActivity)],
        error: null,
      });

      const result = await service.getActivitiesByCategory('health');

      expect(supabase._mockQueryBuilder.contains).toHaveBeenCalledWith('data_categories', [
        'health',
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].dataCategories).toContain('health');
    });

    it('should return empty array when no matching activities', async () => {
      supabase._mockQueryBuilder.contains.mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await service.getActivitiesByCategory('biometric');

      expect(result).toEqual([]);
    });

    it('should throw error when database operation fails', async () => {
      supabase._mockQueryBuilder.contains.mockResolvedValue({
        data: null,
        error: { message: 'Invalid category' },
      });

      await expect(service.getActivitiesByCategory('health')).rejects.toThrow(
        'Failed to get activities by category: Invalid category'
      );
    });

    it.each([
      'personal',
      'contact',
      'demographic',
      'financial',
      'health',
      'biometric',
      'behavioral',
      'location',
    ] as DataCategory[])('should support category: %s', async (category) => {
      supabase._mockQueryBuilder.contains.mockResolvedValue({
        data: [],
        error: null,
      });

      await service.getActivitiesByCategory(category);

      expect(supabase._mockQueryBuilder.contains).toHaveBeenCalledWith('data_categories', [
        category,
      ]);
    });
  });

  // ==========================================================================
  // GET ACTIVITY BY ID TESTS
  // ==========================================================================

  describe('getActivity', () => {
    it('should return activity by ID', async () => {
      const activity = createSampleActivity();
      supabase._mockQueryBuilder.single.mockResolvedValue({
        data: createSampleDbRow(activity),
        error: null,
      });

      const result = await service.getActivity('act-001');

      expect(supabase._mockQueryBuilder.eq).toHaveBeenCalledWith('activity_id', 'act-001');
      expect(result).not.toBeNull();
      expect(result?.activityId).toBe('act-001');
    });

    it('should return null when activity not found', async () => {
      supabase._mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await service.getActivity('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // UPDATE ACTIVITY TESTS
  // ==========================================================================

  describe('updateActivity', () => {
    it('should update activity fields', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: null,
      });

      await service.updateActivity('act-001', {
        name: 'Updated Name',
        purpose: 'Updated Purpose',
      });

      expect(supabase._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          activity_name: 'Updated Name',
          purpose: 'Updated Purpose',
          updated_at: '2024-06-15T10:00:00.000Z',
        })
      );
    });

    it('should update legal basis', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: null,
      });

      await service.updateActivity('act-001', { legalBasis: 'consent' });

      expect(supabase._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          legal_basis: 'consent',
        })
      );
    });

    it('should update data categories', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: null,
      });

      await service.updateActivity('act-001', {
        dataCategories: ['personal', 'financial'],
      });

      expect(supabase._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data_categories: ['personal', 'financial'],
        })
      );
    });

    it('should update retention period correctly', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: null,
      });

      await service.updateActivity('act-001', { retentionPeriod: '1095 days' });

      expect(supabase._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          retention_period_days: 1095,
        })
      );
    });

    it('should update transfer settings', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: null,
      });

      await service.updateActivity('act-001', {
        transfersOutsideEU: true,
        transferSafeguards: 'Binding Corporate Rules',
      });

      expect(supabase._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          transfers_outside_eu: true,
          transfer_safeguards: 'Binding Corporate Rules',
        })
      );
    });

    it('should throw error when update fails', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });

      await expect(service.updateActivity('act-001', { name: 'New Name' })).rejects.toThrow(
        'Failed to update processing activity: Update failed'
      );
    });
  });

  // ==========================================================================
  // DEACTIVATE ACTIVITY TESTS
  // ==========================================================================

  describe('deactivateActivity', () => {
    it('should mark activity as inactive', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: null,
      });

      await service.deactivateActivity('act-001');

      expect(supabase._mockQueryBuilder.update).toHaveBeenCalledWith({
        is_active: false,
        updated_at: '2024-06-15T10:00:00.000Z',
      });
      expect(supabase._mockQueryBuilder.eq).toHaveBeenCalledWith('activity_id', 'act-001');
    });

    it('should throw error when deactivation fails', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: { message: 'Activity not found' },
      });

      await expect(service.deactivateActivity('nonexistent')).rejects.toThrow(
        'Failed to deactivate processing activity: Activity not found'
      );
    });
  });

  // ==========================================================================
  // GENERATE PROCESSING RECORDS TESTS (ARTICLE 30)
  // ==========================================================================

  describe('generateProcessingRecords (GDPR Article 30)', () => {
    it('should generate processing records with organization info', async () => {
      const activity = createSampleActivity();
      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: [createSampleDbRow(activity)],
        error: null,
      });

      const records = await service.generateProcessingRecords();

      expect(records.organizationName).toBe('MedicalCor Clinic');
      expect(records.dpoContact).toBe('dpo@medicalcor.com');
      expect(records.generatedAt).toEqual(new Date('2024-06-15T10:00:00Z'));
    });

    it('should include all active activities in records', async () => {
      const activities = [
        createSampleActivity({ activityId: 'act-001', name: 'Activity 1' }),
        createSampleActivity({ activityId: 'act-002', name: 'Activity 2' }),
        createSampleActivity({ activityId: 'act-003', name: 'Activity 3' }),
      ];

      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: activities.map(createSampleDbRow),
        error: null,
      });

      const records = await service.generateProcessingRecords();

      expect(records.activities).toHaveLength(3);
      expect(records.activities.map((a) => a.activityId)).toEqual([
        'act-001',
        'act-002',
        'act-003',
      ]);
    });

    it('should return empty activities when none exist', async () => {
      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: [],
        error: null,
      });

      const records = await service.generateProcessingRecords();

      expect(records.activities).toEqual([]);
    });

    it('should generate records suitable for regulatory submission', async () => {
      const activity = createSampleActivity({
        legalBasis: 'consent',
        dataCategories: ['health', 'personal'],
        recipients: [{ name: 'Lab Partner', type: 'processor', purpose: 'Testing', country: 'DE' }],
      });

      supabase._mockQueryBuilder.order.mockResolvedValue({
        data: [createSampleDbRow(activity)],
        error: null,
      });

      const records = await service.generateProcessingRecords();

      // Verify required Article 30 fields are present
      const recordedActivity = records.activities[0];
      expect(recordedActivity.purpose).toBeDefined();
      expect(recordedActivity.legalBasis).toBeDefined();
      expect(recordedActivity.dataCategories).toBeDefined();
      expect(recordedActivity.recipients).toBeDefined();
      expect(recordedActivity.retentionPeriod).toBeDefined();
      expect(recordedActivity.securityMeasures).toBeDefined();
    });
  });

  // ==========================================================================
  // MARK AS REVIEWED TESTS
  // ==========================================================================

  describe('markAsReviewed', () => {
    it('should update review timestamp and reviewer', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: null,
      });

      await service.markAsReviewed('act-001', 'reviewer-user-123');

      expect(supabase._mockQueryBuilder.update).toHaveBeenCalledWith({
        last_reviewed_at: '2024-06-15T10:00:00.000Z',
        reviewed_by: 'reviewer-user-123',
        updated_at: '2024-06-15T10:00:00.000Z',
      });
    });

    it('should throw error when marking review fails', async () => {
      supabase._mockQueryBuilder.eq.mockResolvedValue({
        data: null,
        error: { message: 'Activity not found' },
      });

      await expect(service.markAsReviewed('nonexistent', 'reviewer')).rejects.toThrow(
        'Failed to mark activity as reviewed: Activity not found'
      );
    });
  });

  // ==========================================================================
  // GET ACTIVITIES REQUIRING DPIA TESTS
  // ==========================================================================

  describe('getActivitiesRequiringDPIA', () => {
    it('should return activities requiring DPIA', async () => {
      const dpiaActivity = createSampleActivity({ activityId: 'dpia-001' });
      const dbRow = { ...createSampleDbRow(dpiaActivity), dpia_required: true };

      supabase._mockQueryBuilder.eq
        .mockReturnValueOnce(supabase._mockQueryBuilder) // is_active
        .mockResolvedValueOnce({ data: [dbRow], error: null }); // dpia_required

      const result = await service.getActivitiesRequiringDPIA();

      expect(supabase._mockQueryBuilder.eq).toHaveBeenCalledWith('dpia_required', true);
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no DPIA activities', async () => {
      supabase._mockQueryBuilder.eq
        .mockReturnValueOnce(supabase._mockQueryBuilder)
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.getActivitiesRequiringDPIA();

      expect(result).toEqual([]);
    });

    it('should throw error on database failure', async () => {
      supabase._mockQueryBuilder.eq
        .mockReturnValueOnce(supabase._mockQueryBuilder)
        .mockResolvedValueOnce({ data: null, error: { message: 'Query failed' } });

      await expect(service.getActivitiesRequiringDPIA()).rejects.toThrow(
        'Failed to get DPIA activities: Query failed'
      );
    });
  });

  // ==========================================================================
  // GET ACTIVITIES WITH EU TRANSFERS TESTS
  // ==========================================================================

  describe('getActivitiesWithEUTransfers', () => {
    it('should return activities with transfers outside EU', async () => {
      const transferActivity = createSampleActivity({
        activityId: 'transfer-001',
        transfersOutsideEU: true,
        transferSafeguards: 'SCC',
      });
      const dbRow = { ...createSampleDbRow(transferActivity), transfers_outside_eu: true };

      supabase._mockQueryBuilder.eq
        .mockReturnValueOnce(supabase._mockQueryBuilder)
        .mockResolvedValueOnce({ data: [dbRow], error: null });

      const result = await service.getActivitiesWithEUTransfers();

      expect(supabase._mockQueryBuilder.eq).toHaveBeenCalledWith('transfers_outside_eu', true);
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no EU transfers', async () => {
      supabase._mockQueryBuilder.eq
        .mockReturnValueOnce(supabase._mockQueryBuilder)
        .mockResolvedValueOnce({ data: [], error: null });

      const result = await service.getActivitiesWithEUTransfers();

      expect(result).toEqual([]);
    });

    it('should throw error on database failure', async () => {
      supabase._mockQueryBuilder.eq
        .mockReturnValueOnce(supabase._mockQueryBuilder)
        .mockResolvedValueOnce({ data: null, error: { message: 'Query failed' } });

      await expect(service.getActivitiesWithEUTransfers()).rejects.toThrow(
        'Failed to get EU transfer activities: Query failed'
      );
    });
  });

  // ==========================================================================
  // GET STALE ACTIVITIES TESTS
  // ==========================================================================

  describe('getStaleActivities', () => {
    it('should return activities not reviewed within specified days', async () => {
      const staleActivity = createSampleActivity({ activityId: 'stale-001' });
      const dbRow = {
        ...createSampleDbRow(staleActivity),
        last_reviewed_at: '2023-01-01T00:00:00Z', // Over a year ago
      };

      supabase._mockQueryBuilder.or.mockResolvedValue({
        data: [dbRow],
        error: null,
      });

      const result = await service.getStaleActivities(365);

      expect(result).toHaveLength(1);
      expect(result[0].activityId).toBe('stale-001');
    });

    it('should use default 365 days when not specified', async () => {
      supabase._mockQueryBuilder.or.mockResolvedValue({
        data: [],
        error: null,
      });

      await service.getStaleActivities();

      expect(supabase._mockQueryBuilder.or).toHaveBeenCalledWith(
        expect.stringMatching(/last_reviewed_at\.is\.null,last_reviewed_at\.lt/)
      );
    });

    it('should include activities never reviewed', async () => {
      const neverReviewed = createSampleActivity({ activityId: 'never-reviewed' });
      const dbRow = { ...createSampleDbRow(neverReviewed), last_reviewed_at: null };

      supabase._mockQueryBuilder.or.mockResolvedValue({
        data: [dbRow],
        error: null,
      });

      const result = await service.getStaleActivities();

      expect(result).toHaveLength(1);
    });

    it('should throw error on database failure', async () => {
      supabase._mockQueryBuilder.or.mockResolvedValue({
        data: null,
        error: { message: 'Query failed' },
      });

      await expect(service.getStaleActivities()).rejects.toThrow(
        'Failed to get stale activities: Query failed'
      );
    });
  });

  // ==========================================================================
  // DATA CATEGORY COVERAGE TESTS
  // ==========================================================================

  describe('Data Category Coverage', () => {
    const allCategories: DataCategory[] = [
      'personal',
      'contact',
      'demographic',
      'financial',
      'health',
      'biometric',
      'behavioral',
      'location',
    ];

    it.each(allCategories)('should handle %s data category', async (category) => {
      const activity = createSampleActivity({ dataCategories: [category] });
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          data_categories: [category],
        }),
        expect.anything()
      );
    });
  });

  // ==========================================================================
  // LEGAL BASIS COVERAGE TESTS
  // ==========================================================================

  describe('Legal Basis Coverage', () => {
    const allLegalBases: LegalBasis[] = [
      'consent',
      'contract',
      'legal_obligation',
      'vital_interests',
      'public_task',
      'legitimate_interests',
    ];

    it.each(allLegalBases)('should handle %s legal basis', async (legalBasis) => {
      const activity = createSampleActivity({ legalBasis });
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          legal_basis: legalBasis,
        }),
        expect.anything()
      );
    });
  });

  // ==========================================================================
  // RECIPIENT HANDLING TESTS
  // ==========================================================================

  describe('Recipient Handling', () => {
    it('should handle internal recipients', async () => {
      const activity = createSampleActivity({
        recipients: [{ name: 'HR Department', type: 'internal', purpose: 'Employee records' }],
      });
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [{ name: 'HR Department', type: 'internal', purpose: 'Employee records' }],
        }),
        expect.anything()
      );
    });

    it('should handle processor recipients with country', async () => {
      const activity = createSampleActivity({
        recipients: [
          {
            name: 'Cloud Provider',
            type: 'processor',
            purpose: 'Data hosting',
            country: 'US',
          },
        ],
      });
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: expect.arrayContaining([expect.objectContaining({ country: 'US' })]),
        }),
        expect.anything()
      );
    });

    it('should handle multiple recipients', async () => {
      const recipients: DataRecipient[] = [
        { name: 'Internal IT', type: 'internal', purpose: 'System admin' },
        { name: 'External Auditor', type: 'controller', purpose: 'Audit' },
        { name: 'DPA', type: 'public_authority', purpose: 'Regulatory compliance' },
      ];
      const activity = createSampleActivity({ recipients });
      supabase._mockQueryBuilder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerActivity(activity);

      expect(supabase._mockQueryBuilder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients,
        }),
        expect.anything()
      );
    });
  });
});
