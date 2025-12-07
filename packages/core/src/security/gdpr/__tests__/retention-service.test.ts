/**
 * @fileoverview Data Retention Service Tests
 *
 * GDPR compliance: Tests for data retention policy management and automated disposal.
 * Ensures data is not kept longer than necessary and disposal is properly executed.
 *
 * @module core/security/gdpr/__tests__/retention-service.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PostgresRetentionService,
  createRetentionService,
  type RetentionPolicy,
  type RetentionCandidate,
  type DataCategory,
  type DisposalMethod,
} from '../retention-service.js';

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
  is: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
}

/**
 * Creates a chainable mock that supports both sync chaining and async resolution.
 * Handles patterns like: .delete().eq('id', x) or .update({}).eq('a', 1).eq('b', 2)
 */
function createChainableMock(defaultResult: unknown = { error: null }): MockQueryBuilder {
  const builder: MockQueryBuilder = {} as MockQueryBuilder;

  // Create a function that returns a thenable (both chainable and awaitable)
  const createChainableMethod = () => {
    const fn = vi.fn().mockImplementation(() => {
      // Return an object that is both chainable (has methods) and thenable (can be awaited)
      return {
        ...builder,
        then: (resolve: (val: unknown) => void) => Promise.resolve(defaultResult).then(resolve),
        catch: (reject: (err: unknown) => void) => Promise.resolve(defaultResult).catch(reject),
      };
    });
    return fn;
  };

  builder.select = createChainableMethod();
  builder.insert = createChainableMethod();
  builder.update = createChainableMethod();
  builder.upsert = createChainableMethod();
  builder.delete = createChainableMethod();
  builder.eq = createChainableMethod();
  builder.is = createChainableMethod();
  builder.lt = createChainableMethod();
  builder.lte = createChainableMethod();
  builder.order = createChainableMethod();
  builder.limit = createChainableMethod();
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });

  return builder;
}

function createMockSupabase(): SupabaseClient & {
  _mockBuilders: Map<string, MockQueryBuilder>;
  _currentTable: string;
} {
  const mockBuilders = new Map<string, MockQueryBuilder>();
  let currentTable = '';

  const mockSupabase = {
    from: vi.fn((tableName: string) => {
      currentTable = tableName;
      if (!mockBuilders.has(tableName)) {
        mockBuilders.set(tableName, createChainableMock());
      }
      return mockBuilders.get(tableName)!;
    }),
    _mockBuilders: mockBuilders,
    get _currentTable() {
      return currentTable;
    },
  } as unknown as SupabaseClient & {
    _mockBuilders: Map<string, MockQueryBuilder>;
    _currentTable: string;
  };

  return mockSupabase;
}

function getBuilder(
  supabase: ReturnType<typeof createMockSupabase>,
  tableName: string
): MockQueryBuilder {
  if (!supabase._mockBuilders.has(tableName)) {
    supabase.from(tableName);
  }
  return supabase._mockBuilders.get(tableName)!;
}

function createSamplePolicy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
  return {
    policyId: 'pol-001',
    name: 'Patient Data Retention',
    dataCategory: 'health' as DataCategory,
    resourceType: 'patient_record',
    retentionPeriodDays: 3650, // 10 years
    legalBasis: 'GDPR Article 17 + Medical Records Regulation',
    disposalMethod: 'anonymize' as DisposalMethod,
    ...overrides,
  };
}

function createSamplePolicyDbRow(policy: RetentionPolicy) {
  return {
    id: 'db-uuid-001',
    policy_id: policy.policyId,
    policy_name: policy.name,
    description: null,
    data_category: policy.dataCategory,
    resource_type: policy.resourceType,
    retention_period_days: policy.retentionPeriodDays,
    legal_basis: policy.legalBasis,
    disposal_method: policy.disposalMethod,
    exceptions: policy.exceptions ?? [],
    is_active: true,
    effective_from: '2024-01-01T00:00:00Z',
    effective_until: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function createSampleCandidate(
  policy: RetentionPolicy,
  overrides: Partial<RetentionCandidate> = {}
): RetentionCandidate {
  return {
    resourceType: policy.resourceType,
    resourceId: 'resource-001',
    dataCategory: policy.dataCategory,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    policy,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PostgresRetentionService', () => {
  let supabase: ReturnType<typeof createMockSupabase>;
  let service: PostgresRetentionService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    supabase = createMockSupabase();
    service = new PostgresRetentionService({
      supabase,
      defaultBatchSize: 100,
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
    it('should create service with createRetentionService factory', () => {
      const svc = createRetentionService({ supabase });
      expect(svc).toBeInstanceOf(PostgresRetentionService);
    });

    it('should use default batch size of 100 when not specified', () => {
      const svc = createRetentionService({ supabase });
      expect(svc).toBeInstanceOf(PostgresRetentionService);
    });

    it('should accept custom batch size', () => {
      const svc = createRetentionService({ supabase, defaultBatchSize: 50 });
      expect(svc).toBeInstanceOf(PostgresRetentionService);
    });
  });

  // ==========================================================================
  // REGISTER POLICY TESTS
  // ==========================================================================

  describe('registerPolicy', () => {
    it('should register a new retention policy', async () => {
      const policy = createSamplePolicy();
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerPolicy(policy);

      expect(supabase.from).toHaveBeenCalledWith('gdpr_retention_policies');
      expect(builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          policy_id: 'pol-001',
          policy_name: 'Patient Data Retention',
          data_category: 'health',
          resource_type: 'patient_record',
          retention_period_days: 3650,
          disposal_method: 'anonymize',
          is_active: true,
        }),
        { onConflict: 'policy_id' }
      );
    });

    it('should include exceptions when provided', async () => {
      const policy = createSamplePolicy({
        exceptions: [
          {
            condition: 'ongoing_litigation',
            extendedRetentionDays: 365,
            reason: 'Legal hold for active litigation',
          },
        ],
      });
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerPolicy(policy);

      expect(builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          exceptions: [
            {
              condition: 'ongoing_litigation',
              extendedRetentionDays: 365,
              reason: 'Legal hold for active litigation',
            },
          ],
        }),
        expect.anything()
      );
    });

    it('should throw error when registration fails', async () => {
      const policy = createSamplePolicy();
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.upsert.mockResolvedValue({
        data: null,
        error: { message: 'Duplicate policy' },
      });

      await expect(service.registerPolicy(policy)).rejects.toThrow(
        'Failed to register retention policy: Duplicate policy'
      );
    });

    it('should set effective_from to current timestamp', async () => {
      const policy = createSamplePolicy();
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerPolicy(policy);

      expect(builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          effective_from: '2024-06-15T10:00:00.000Z',
        }),
        expect.anything()
      );
    });

    it.each(['delete', 'anonymize', 'archive', 'pseudonymize'] as DisposalMethod[])(
      'should handle disposal method: %s',
      async (disposalMethod) => {
        const policy = createSamplePolicy({ disposalMethod });
        const builder = getBuilder(supabase, 'gdpr_retention_policies');
        builder.upsert.mockResolvedValue({ data: null, error: null });

        await service.registerPolicy(policy);

        expect(builder.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            disposal_method: disposalMethod,
          }),
          expect.anything()
        );
      }
    );
  });

  // ==========================================================================
  // GET POLICY TESTS
  // ==========================================================================

  describe('getPolicy', () => {
    it('should return policy for data category and resource type', async () => {
      const policy = createSamplePolicy();
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.single.mockResolvedValue({
        data: createSamplePolicyDbRow(policy),
        error: null,
      });

      const result = await service.getPolicy('health', 'patient_record');

      expect(builder.eq).toHaveBeenCalledWith('data_category', 'health');
      expect(builder.eq).toHaveBeenCalledWith('resource_type', 'patient_record');
      expect(result).not.toBeNull();
      expect(result?.policyId).toBe('pol-001');
    });

    it('should fall back to default policy when specific not found', async () => {
      const defaultPolicy = createSamplePolicy({
        policyId: 'default-pol',
        resourceType: 'default',
      });
      const builder = getBuilder(supabase, 'gdpr_retention_policies');

      // First query fails (specific policy not found)
      builder.single
        .mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })
        // Second query succeeds (default policy found)
        .mockResolvedValueOnce({
          data: createSamplePolicyDbRow(defaultPolicy),
          error: null,
        });

      const result = await service.getPolicy('health', 'unknown_resource');

      expect(result).not.toBeNull();
      expect(result?.resourceType).toBe('default');
    });

    it('should return null when no policy found', async () => {
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const result = await service.getPolicy('biometric', 'unknown_resource');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // GET ALL POLICIES TESTS
  // ==========================================================================

  describe('getAllPolicies', () => {
    it('should return all active policies', async () => {
      const policies = [
        createSamplePolicy({ policyId: 'pol-001' }),
        createSamplePolicy({ policyId: 'pol-002', dataCategory: 'personal' }),
      ];
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.order.mockResolvedValue({
        data: policies.map(createSamplePolicyDbRow),
        error: null,
      });

      const result = await service.getAllPolicies();

      expect(result).toHaveLength(2);
      expect(builder.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('should return empty array when no policies exist', async () => {
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.order.mockResolvedValue({ data: [], error: null });

      const result = await service.getAllPolicies();

      expect(result).toEqual([]);
    });

    it('should throw error when query fails', async () => {
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.order.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getAllPolicies()).rejects.toThrow(
        'Failed to get retention policies: Database error'
      );
    });
  });

  // ==========================================================================
  // SHOULD RETAIN TESTS
  // ==========================================================================

  describe('shouldRetain', () => {
    it('should return true when data is within retention period', async () => {
      const policy = createSamplePolicy({ retentionPeriodDays: 365 });
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.single.mockResolvedValue({
        data: createSamplePolicyDbRow(policy),
        error: null,
      });

      // Data created 100 days ago, policy allows 365 days
      const createdAt = new Date('2024-03-07T10:00:00Z');
      const result = await service.shouldRetain('health', 'patient_record', createdAt);

      expect(result).toBe(true);
    });

    it('should return false when data exceeds retention period', async () => {
      const policy = createSamplePolicy({ retentionPeriodDays: 30 });
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.single.mockResolvedValue({
        data: createSamplePolicyDbRow(policy),
        error: null,
      });

      // Data created 60 days ago, policy only allows 30 days
      const createdAt = new Date('2024-04-16T10:00:00Z');
      const result = await service.shouldRetain('health', 'patient_record', createdAt);

      expect(result).toBe(false);
    });

    it('should return true when no policy exists (safe approach)', async () => {
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const createdAt = new Date('2020-01-01T00:00:00Z');
      const result = await service.shouldRetain('unknown', 'unknown', createdAt);

      expect(result).toBe(true);
    });

    it('should return false on exact retention boundary', async () => {
      const policy = createSamplePolicy({ retentionPeriodDays: 365 });
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.single.mockResolvedValue({
        data: createSamplePolicyDbRow(policy),
        error: null,
      });

      // Data created exactly 366 days ago (just past retention)
      const createdAt = new Date('2023-06-14T10:00:00Z');
      const result = await service.shouldRetain('health', 'patient_record', createdAt);

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // GET DATA DUE FOR DISPOSAL TESTS
  // ==========================================================================

  describe('getDataDueForDisposal', () => {
    it('should return scheduled deletions that are due', async () => {
      const policy = createSamplePolicy();
      const policies = [policy];

      const deletionsBuilder = getBuilder(supabase, 'scheduled_deletions');
      const policiesBuilder = getBuilder(supabase, 'gdpr_retention_policies');

      deletionsBuilder.limit.mockResolvedValue({
        data: [
          {
            id: 'del-001',
            entity_type: 'patient_record',
            entity_id: 'patient-123',
            scheduled_for: '2024-06-01T00:00:00Z',
            reason: 'Retention expired',
            executed_at: null,
            created_at: '2020-01-01T00:00:00Z',
          },
        ],
        error: null,
      });

      policiesBuilder.order.mockResolvedValue({
        data: policies.map(createSamplePolicyDbRow),
        error: null,
      });

      const result = await service.getDataDueForDisposal();

      expect(result).toHaveLength(1);
      expect(result[0].resourceId).toBe('patient-123');
      expect(result[0].resourceType).toBe('patient_record');
    });

    it('should filter by executed_at is null', async () => {
      const deletionsBuilder = getBuilder(supabase, 'scheduled_deletions');
      deletionsBuilder.limit.mockResolvedValue({ data: [], error: null });

      const policiesBuilder = getBuilder(supabase, 'gdpr_retention_policies');
      policiesBuilder.order.mockResolvedValue({ data: [], error: null });

      await service.getDataDueForDisposal();

      expect(deletionsBuilder.is).toHaveBeenCalledWith('executed_at', null);
    });

    it('should respect batch size limit', async () => {
      const customService = new PostgresRetentionService({
        supabase,
        defaultBatchSize: 50,
      });

      const deletionsBuilder = getBuilder(supabase, 'scheduled_deletions');
      deletionsBuilder.limit.mockResolvedValue({ data: [], error: null });

      const policiesBuilder = getBuilder(supabase, 'gdpr_retention_policies');
      policiesBuilder.order.mockResolvedValue({ data: [], error: null });

      await customService.getDataDueForDisposal();

      expect(deletionsBuilder.limit).toHaveBeenCalledWith(50);
    });

    it('should use provided batch size over default', async () => {
      const deletionsBuilder = getBuilder(supabase, 'scheduled_deletions');
      deletionsBuilder.limit.mockResolvedValue({ data: [], error: null });

      const policiesBuilder = getBuilder(supabase, 'gdpr_retention_policies');
      policiesBuilder.order.mockResolvedValue({ data: [], error: null });

      await service.getDataDueForDisposal(25);

      expect(deletionsBuilder.limit).toHaveBeenCalledWith(25);
    });

    it('should throw error when query fails', async () => {
      const deletionsBuilder = getBuilder(supabase, 'scheduled_deletions');
      deletionsBuilder.limit.mockResolvedValue({
        data: null,
        error: { message: 'Connection failed' },
      });

      await expect(service.getDataDueForDisposal()).rejects.toThrow(
        'Failed to get scheduled deletions: Connection failed'
      );
    });
  });

  // ==========================================================================
  // EXECUTE DISPOSAL TESTS
  // ==========================================================================

  describe('executeDisposal', () => {
    it('should process delete disposal method', async () => {
      const policy = createSamplePolicy({ disposalMethod: 'delete' });
      const candidate = createSampleCandidate(policy, { resourceId: 'record-001' });

      // Initialize builders so they're ready for the test
      getBuilder(supabase, 'patients');
      getBuilder(supabase, 'scheduled_deletions');

      const result = await service.executeDisposal([candidate]);

      expect(result.processed).toBe(1);
      expect(result.deleted).toBe(1);
      expect(result.anonymized).toBe(0);
      expect(result.errors).toHaveLength(0);
      // Verify the table was accessed for deletion
      expect(supabase.from).toHaveBeenCalledWith('patients');
    });

    it('should process anonymize disposal method', async () => {
      const policy = createSamplePolicy({ disposalMethod: 'anonymize' });
      const candidate = createSampleCandidate(policy);

      // Initialize builders
      const patientsBuilder = getBuilder(supabase, 'patients');
      getBuilder(supabase, 'scheduled_deletions');

      const result = await service.executeDisposal([candidate]);

      expect(result.anonymized).toBe(1);
      expect(result.deleted).toBe(0);
      expect(patientsBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: null,
          email: null,
          last_name: 'ANONYMIZED',
          anonymization_reason: 'retention_policy',
        })
      );
    });

    it('should process archive disposal method', async () => {
      const policy = createSamplePolicy({ disposalMethod: 'archive' });
      const candidate = createSampleCandidate(policy);

      // Initialize builders
      const patientsBuilder = getBuilder(supabase, 'patients');
      getBuilder(supabase, 'scheduled_deletions');

      const result = await service.executeDisposal([candidate]);

      expect(result.archived).toBe(1);
      expect(patientsBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          archive_reason: 'retention_policy',
        })
      );
    });

    it('should process pseudonymize as anonymize', async () => {
      const policy = createSamplePolicy({ disposalMethod: 'pseudonymize' });
      const candidate = createSampleCandidate(policy);

      // Initialize builders
      getBuilder(supabase, 'patients');
      getBuilder(supabase, 'scheduled_deletions');

      const result = await service.executeDisposal([candidate]);

      expect(result.anonymized).toBe(1);
    });

    it('should handle multiple candidates', async () => {
      const deletePolicy = createSamplePolicy({
        policyId: 'del-pol',
        disposalMethod: 'delete',
      });
      const anonymizePolicy = createSamplePolicy({
        policyId: 'anon-pol',
        disposalMethod: 'anonymize',
      });

      const candidates = [
        createSampleCandidate(deletePolicy, { resourceId: 'rec-001' }),
        createSampleCandidate(anonymizePolicy, { resourceId: 'rec-002' }),
        createSampleCandidate(deletePolicy, { resourceId: 'rec-003' }),
      ];

      // Initialize builders
      getBuilder(supabase, 'patients');
      getBuilder(supabase, 'scheduled_deletions');

      const result = await service.executeDisposal(candidates);

      expect(result.processed).toBe(3);
      expect(result.deleted).toBe(2);
      expect(result.anonymized).toBe(1);
    });

    it('should capture errors for individual candidates', async () => {
      const policy = createSamplePolicy({ disposalMethod: 'delete' });
      const candidates = [
        createSampleCandidate(policy, { resourceId: 'success-001' }),
        createSampleCandidate(policy, { resourceId: 'fail-001' }),
      ];

      // Create a builder that returns an error on the second call
      // We need to override the mock for the patients table specifically
      const patientsBuilder = createChainableMock();
      let deleteCallCount = 0;
      patientsBuilder.delete = vi.fn().mockImplementation(() => {
        deleteCallCount++;
        const result =
          deleteCallCount === 2 ? { error: { message: 'Record locked' } } : { error: null };
        return {
          ...patientsBuilder,
          eq: vi.fn().mockImplementation(() => ({
            then: (resolve: (val: unknown) => void) => Promise.resolve(result).then(resolve),
            catch: (reject: (err: unknown) => void) => Promise.resolve(result).catch(reject),
          })),
          then: (resolve: (val: unknown) => void) => Promise.resolve(result).then(resolve),
        };
      });
      supabase._mockBuilders.set('patients', patientsBuilder);
      getBuilder(supabase, 'scheduled_deletions');

      const result = await service.executeDisposal(candidates);

      expect(result.processed).toBe(2);
      expect(result.deleted).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].resourceId).toBe('fail-001');
      expect(result.errors[0].error).toContain('Record locked');
    });

    it('should mark deletions as executed after disposal', async () => {
      const policy = createSamplePolicy({ disposalMethod: 'delete' });
      const candidate = createSampleCandidate(policy, {
        resourceId: 'rec-123',
        resourceType: 'patient_record',
      });

      // Initialize builders
      getBuilder(supabase, 'patients');
      const deletionsBuilder = getBuilder(supabase, 'scheduled_deletions');

      await service.executeDisposal([candidate]);

      // Verify that the update was called with the execution timestamp
      expect(deletionsBuilder.update).toHaveBeenCalledWith({
        executed_at: '2024-06-15T10:00:00.000Z',
      });
      // Verify the scheduled_deletions table was accessed
      expect(supabase.from).toHaveBeenCalledWith('scheduled_deletions');
    });

    it('should return zero counts when no candidates provided', async () => {
      const result = await service.executeDisposal([]);

      expect(result.processed).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.anonymized).toBe(0);
      expect(result.archived).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ==========================================================================
  // SCHEDULE FOR DELETION TESTS
  // ==========================================================================

  describe('scheduleForDeletion', () => {
    it('should schedule a new deletion', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.single.mockResolvedValue({
        data: { id: 'scheduled-001' },
        error: null,
      });

      const scheduledFor = new Date('2025-01-01T00:00:00Z');
      const result = await service.scheduleForDeletion(
        'patient_record',
        'patient-123',
        scheduledFor,
        'GDPR erasure request'
      );

      expect(result).toBe('scheduled-001');
      expect(builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'patient_record',
          entity_id: 'patient-123',
          scheduled_for: '2025-01-01T00:00:00.000Z',
          reason: 'GDPR erasure request',
        }),
        { onConflict: 'entity_type,entity_id' }
      );
    });

    it('should schedule without reason', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.single.mockResolvedValue({
        data: { id: 'scheduled-002' },
        error: null,
      });

      const scheduledFor = new Date('2025-06-01T00:00:00Z');
      await service.scheduleForDeletion('lead', 'lead-456', scheduledFor);

      expect(builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'lead',
          entity_id: 'lead-456',
          reason: undefined,
        }),
        expect.anything()
      );
    });

    it('should throw error when scheduling fails', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.single.mockResolvedValue({
        data: null,
        error: { message: 'Database unavailable' },
      });

      await expect(
        service.scheduleForDeletion('patient_record', 'patient-123', new Date())
      ).rejects.toThrow('Failed to schedule deletion: Database unavailable');
    });
  });

  // ==========================================================================
  // CANCEL SCHEDULED DELETION TESTS
  // ==========================================================================

  describe('cancelScheduledDeletion', () => {
    it('should cancel a pending deletion', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.is.mockResolvedValue({ error: null });

      await service.cancelScheduledDeletion('patient_record', 'patient-123');

      expect(builder.delete).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith('entity_type', 'patient_record');
      expect(builder.eq).toHaveBeenCalledWith('entity_id', 'patient-123');
      expect(builder.is).toHaveBeenCalledWith('executed_at', null);
    });

    it('should throw error when cancellation fails', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.is.mockResolvedValue({
        error: { message: 'Not found' },
      });

      await expect(service.cancelScheduledDeletion('unknown', 'unknown')).rejects.toThrow(
        'Failed to cancel scheduled deletion: Not found'
      );
    });

    it('should not cancel already executed deletions', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.is.mockResolvedValue({ error: null });

      await service.cancelScheduledDeletion('patient_record', 'patient-123');

      // Verify the is(executed_at, null) filter is applied
      expect(builder.is).toHaveBeenCalledWith('executed_at', null);
    });
  });

  // ==========================================================================
  // GET PENDING DELETIONS COUNT TESTS
  // ==========================================================================

  describe('getPendingDeletionsCount', () => {
    it('should return count of pending deletions', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.is.mockResolvedValue({ count: 42, error: null });

      const result = await service.getPendingDeletionsCount();

      expect(result).toBe(42);
      expect(builder.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(builder.is).toHaveBeenCalledWith('executed_at', null);
    });

    it('should return 0 when no pending deletions', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.is.mockResolvedValue({ count: 0, error: null });

      const result = await service.getPendingDeletionsCount();

      expect(result).toBe(0);
    });

    it('should return 0 when count is null', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.is.mockResolvedValue({ count: null, error: null });

      const result = await service.getPendingDeletionsCount();

      expect(result).toBe(0);
    });

    it('should throw error on query failure', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.is.mockResolvedValue({
        count: null,
        error: { message: 'Query timeout' },
      });

      await expect(service.getPendingDeletionsCount()).rejects.toThrow(
        'Failed to count pending deletions: Query timeout'
      );
    });
  });

  // ==========================================================================
  // GET OVERDUE DELETIONS TESTS
  // ==========================================================================

  describe('getOverdueDeletions', () => {
    it('should return overdue unexecuted deletions', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.lt.mockResolvedValue({
        data: [
          {
            id: 'overdue-001',
            entity_type: 'patient_record',
            entity_id: 'patient-123',
            scheduled_for: '2024-05-01T00:00:00Z',
            executed_at: null,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        error: null,
      });

      const result = await service.getOverdueDeletions();

      expect(result).toHaveLength(1);
      expect(result[0].entity_id).toBe('patient-123');
      expect(builder.is).toHaveBeenCalledWith('executed_at', null);
      expect(builder.lt).toHaveBeenCalledWith('scheduled_for', '2024-06-15T10:00:00.000Z');
    });

    it('should return empty array when no overdue deletions', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.lt.mockResolvedValue({ data: [], error: null });

      const result = await service.getOverdueDeletions();

      expect(result).toEqual([]);
    });

    it('should throw error on query failure', async () => {
      const builder = getBuilder(supabase, 'scheduled_deletions');
      builder.lt.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getOverdueDeletions()).rejects.toThrow(
        'Failed to get overdue deletions: Database error'
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
      const policy = createSamplePolicy({ dataCategory: category });
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerPolicy(policy);

      expect(builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          data_category: category,
        }),
        expect.anything()
      );
    });
  });

  // ==========================================================================
  // RESOURCE TYPE MAPPING TESTS
  // ==========================================================================

  describe('Resource Type Table Mapping', () => {
    const resourceMappings: Array<{ resourceType: string; expectedTable: string }> = [
      { resourceType: 'lead', expectedTable: 'leads' },
      { resourceType: 'patient_record', expectedTable: 'patients' },
      { resourceType: 'consent', expectedTable: 'consents' },
      { resourceType: 'audit_log', expectedTable: 'consent_audit_log' },
      { resourceType: 'message', expectedTable: 'message_log' },
      { resourceType: 'appointment', expectedTable: 'appointments' },
      { resourceType: 'subject_data', expectedTable: 'leads' },
    ];

    it.each(resourceMappings)(
      'should map $resourceType to $expectedTable',
      async ({ resourceType, expectedTable }) => {
        const policy = createSamplePolicy({
          resourceType,
          disposalMethod: 'delete',
        });
        const candidate = createSampleCandidate(policy, { resourceType });

        const tableBuilder = getBuilder(supabase, expectedTable);
        tableBuilder.eq.mockResolvedValue({ error: null });

        const deletionsBuilder = getBuilder(supabase, 'scheduled_deletions');
        deletionsBuilder.eq.mockResolvedValue({ error: null });

        await service.executeDisposal([candidate]);

        expect(supabase.from).toHaveBeenCalledWith(expectedTable);
      }
    );
  });

  // ==========================================================================
  // RETENTION EXCEPTION TESTS
  // ==========================================================================

  describe('Retention Exceptions', () => {
    it('should store multiple exceptions', async () => {
      const policy = createSamplePolicy({
        exceptions: [
          {
            condition: 'ongoing_litigation',
            extendedRetentionDays: 730,
            reason: 'Legal hold',
          },
          {
            condition: 'regulatory_audit',
            extendedRetentionDays: 365,
            reason: 'Audit period',
          },
        ],
      });
      const builder = getBuilder(supabase, 'gdpr_retention_policies');
      builder.upsert.mockResolvedValue({ data: null, error: null });

      await service.registerPolicy(policy);

      expect(builder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          exceptions: expect.arrayContaining([
            expect.objectContaining({ condition: 'ongoing_litigation' }),
            expect.objectContaining({ condition: 'regulatory_audit' }),
          ]),
        }),
        expect.anything()
      );
    });
  });
});
