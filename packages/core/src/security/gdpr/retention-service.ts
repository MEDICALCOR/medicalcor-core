/**
 * @fileoverview Data Retention Service
 *
 * GDPR compliance: Manages data retention policies and automated disposal.
 * Ensures data is not kept longer than necessary for the specified purpose.
 *
 * @module core/security/gdpr/retention-service
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// LOCAL TYPE DEFINITIONS
// (Defined locally to avoid circular dependencies with architecture module)
// ============================================================================

/**
 * Data category types
 */
export type DataCategory =
  | 'personal'
  | 'contact'
  | 'demographic'
  | 'financial'
  | 'health'
  | 'biometric'
  | 'behavioral'
  | 'location';

/**
 * Disposal methods
 */
export type DisposalMethod = 'delete' | 'anonymize' | 'archive' | 'pseudonymize';

/**
 * Retention exception
 */
export interface RetentionException {
  readonly condition: string;
  readonly extendedRetentionDays: number;
  readonly reason: string;
}

/**
 * Retention policy
 */
export interface RetentionPolicy {
  readonly policyId: string;
  readonly name: string;
  readonly dataCategory: DataCategory;
  readonly resourceType: string;
  readonly retentionPeriodDays: number;
  readonly legalBasis: string;
  readonly disposalMethod: DisposalMethod;
  readonly exceptions?: RetentionException[];
}

/**
 * Retention candidate
 */
export interface RetentionCandidate {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly dataCategory: DataCategory;
  readonly createdAt: Date;
  readonly policy: RetentionPolicy;
}

/**
 * Disposal error
 */
export interface DisposalError {
  readonly resourceId: string;
  readonly error: string;
}

/**
 * Disposal result
 */
export interface DisposalResult {
  processed: number;
  deleted: number;
  anonymized: number;
  archived: number;
  errors: DisposalError[];
}

/**
 * Retention service interface
 */
export interface RetentionService {
  registerPolicy(policy: RetentionPolicy): Promise<void>;
  getPolicy(dataCategory: DataCategory, resourceType: string): Promise<RetentionPolicy | null>;
  shouldRetain(dataCategory: DataCategory, resourceType: string, createdAt: Date): Promise<boolean>;
  getDataDueForDisposal(batchSize?: number): Promise<RetentionCandidate[]>;
  executeDisposal(candidates: RetentionCandidate[]): Promise<DisposalResult>;
}

// ============================================================================
// SERVICE DEPENDENCIES
// ============================================================================

/**
 * Retention Service dependencies
 */
export interface RetentionServiceDeps {
  readonly supabase: SupabaseClient;
  /** Default batch size for disposal operations */
  readonly defaultBatchSize?: number;
}

/**
 * Database row type for gdpr_retention_policies table
 */
interface RetentionPolicyRow {
  id: string;
  policy_id: string;
  policy_name: string;
  description: string | null;
  data_category: DataCategory;
  resource_type: string;
  retention_period_days: number;
  legal_basis: string;
  disposal_method: DisposalMethod;
  exceptions: RetentionException[];
  is_active: boolean;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Scheduled deletion row
 */
interface ScheduledDeletionRow {
  id: string;
  entity_type: string;
  entity_id: string;
  scheduled_for: string;
  reason: string | null;
  executed_at: string | null;
  created_at: string;
}

// ============================================================================
// RETENTION SERVICE IMPLEMENTATION
// ============================================================================

/**
 * PostgresRetentionService
 *
 * Implements data retention policy management and automated disposal.
 */
export class PostgresRetentionService implements RetentionService {
  private readonly supabase: SupabaseClient;
  private readonly defaultBatchSize: number;
  private readonly tableName = 'gdpr_retention_policies';
  private readonly deletionsTable = 'scheduled_deletions';

  constructor(deps: RetentionServiceDeps) {
    this.supabase = deps.supabase;
    this.defaultBatchSize = deps.defaultBatchSize ?? 100;
  }

  /**
   * Register a retention policy
   */
  async registerPolicy(policy: RetentionPolicy): Promise<void> {
    const { error } = await this.supabase.from(this.tableName).upsert(
      {
        policy_id: policy.policyId,
        policy_name: policy.name,
        data_category: policy.dataCategory,
        resource_type: policy.resourceType,
        retention_period_days: policy.retentionPeriodDays,
        legal_basis: policy.legalBasis,
        disposal_method: policy.disposalMethod,
        exceptions: policy.exceptions ?? [],
        is_active: true,
        effective_from: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'policy_id' }
    );

    if (error) {
      throw new Error(`Failed to register retention policy: ${error.message}`);
    }
  }

  /**
   * Get applicable policy for data
   */
  async getPolicy(dataCategory: DataCategory, resourceType: string): Promise<RetentionPolicy | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('data_category', dataCategory)
      .eq('resource_type', resourceType)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      // Try to find a default policy for the category
      const { data: defaultPolicy } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('data_category', dataCategory)
        .eq('resource_type', 'default')
        .eq('is_active', true)
        .single();

      if (defaultPolicy) {
        return this.mapRowToPolicy(defaultPolicy as RetentionPolicyRow);
      }
      return null;
    }

    return this.mapRowToPolicy(data as RetentionPolicyRow);
  }

  /**
   * Get all active policies
   */
  async getAllPolicies(): Promise<RetentionPolicy[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .order('data_category', { ascending: true });

    if (error) {
      throw new Error(`Failed to get retention policies: ${error.message}`);
    }

    return (data as RetentionPolicyRow[]).map((row) => this.mapRowToPolicy(row));
  }

  /**
   * Check if data should be retained
   */
  async shouldRetain(
    dataCategory: DataCategory,
    resourceType: string,
    createdAt: Date
  ): Promise<boolean> {
    const policy = await this.getPolicy(dataCategory, resourceType);

    if (!policy) {
      // No policy = retain by default (safe approach)
      return true;
    }

    const retentionEndDate = new Date(
      createdAt.getTime() + policy.retentionPeriodDays * 24 * 60 * 60 * 1000
    );

    return new Date() < retentionEndDate;
  }

  /**
   * Get data due for disposal
   */
  async getDataDueForDisposal(batchSize?: number): Promise<RetentionCandidate[]> {
    const limit = batchSize ?? this.defaultBatchSize;
    const candidates: RetentionCandidate[] = [];

    // Get scheduled deletions that are due
    const { data: scheduledDeletions, error: scheduledError } = await this.supabase
      .from(this.deletionsTable)
      .select('*')
      .is('executed_at', null)
      .lte('scheduled_for', new Date().toISOString())
      .limit(limit);

    if (scheduledError) {
      throw new Error(`Failed to get scheduled deletions: ${scheduledError.message}`);
    }

    // Get all active policies
    const policies = await this.getAllPolicies();

    // For each scheduled deletion, match with policy
    for (const deletion of scheduledDeletions as ScheduledDeletionRow[]) {
      const policy = policies.find((p) => p.resourceType === deletion.entity_type);

      if (policy) {
        candidates.push({
          resourceType: deletion.entity_type,
          resourceId: deletion.entity_id,
          dataCategory: policy.dataCategory,
          createdAt: new Date(deletion.created_at),
          policy,
        });
      }
    }

    return candidates;
  }

  /**
   * Execute disposal for candidates
   */
  async executeDisposal(candidates: RetentionCandidate[]): Promise<DisposalResult> {
    const result: DisposalResult = {
      processed: 0,
      deleted: 0,
      anonymized: 0,
      archived: 0,
      errors: [],
    };

    for (const candidate of candidates) {
      try {
        result.processed++;

        switch (candidate.policy.disposalMethod) {
          case 'delete':
            await this.hardDelete(candidate);
            result.deleted++;
            break;
          case 'anonymize':
            await this.anonymize(candidate);
            result.anonymized++;
            break;
          case 'archive':
            await this.archive(candidate);
            result.archived++;
            break;
          case 'pseudonymize':
            await this.anonymize(candidate); // Similar to anonymize
            result.anonymized++;
            break;
        }

        // Mark as executed in scheduled_deletions
        await this.supabase
          .from(this.deletionsTable)
          .update({ executed_at: new Date().toISOString() })
          .eq('entity_type', candidate.resourceType)
          .eq('entity_id', candidate.resourceId);
      } catch (error) {
        result.errors.push({
          resourceId: candidate.resourceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Schedule a deletion
   */
  async scheduleForDeletion(
    entityType: string,
    entityId: string,
    scheduledFor: Date,
    reason?: string
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from(this.deletionsTable)
      .upsert(
        {
          entity_type: entityType,
          entity_id: entityId,
          scheduled_for: scheduledFor.toISOString(),
          reason,
        },
        { onConflict: 'entity_type,entity_id' }
      )
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to schedule deletion: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Cancel a scheduled deletion
   */
  async cancelScheduledDeletion(entityType: string, entityId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.deletionsTable)
      .delete()
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .is('executed_at', null);

    if (error) {
      throw new Error(`Failed to cancel scheduled deletion: ${error.message}`);
    }
  }

  /**
   * Get pending deletions count
   */
  async getPendingDeletionsCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from(this.deletionsTable)
      .select('*', { count: 'exact', head: true })
      .is('executed_at', null);

    if (error) {
      throw new Error(`Failed to count pending deletions: ${error.message}`);
    }

    return count ?? 0;
  }

  /**
   * Get overdue deletions (past scheduled date)
   */
  async getOverdueDeletions(): Promise<ScheduledDeletionRow[]> {
    const { data, error } = await this.supabase
      .from(this.deletionsTable)
      .select('*')
      .is('executed_at', null)
      .lt('scheduled_for', new Date().toISOString());

    if (error) {
      throw new Error(`Failed to get overdue deletions: ${error.message}`);
    }

    return data as ScheduledDeletionRow[];
  }

  // ============================================================================
  // DISPOSAL METHODS
  // ============================================================================

  private async hardDelete(candidate: RetentionCandidate): Promise<void> {
    const tableName = this.getTableName(candidate.resourceType);

    const { error } = await this.supabase
      .from(tableName)
      .delete()
      .eq('id', candidate.resourceId);

    if (error) {
      throw new Error(`Failed to hard delete: ${error.message}`);
    }
  }

  private async anonymize(candidate: RetentionCandidate): Promise<void> {
    const tableName = this.getTableName(candidate.resourceType);
    const anonymizedId = `ANON-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    // Generic anonymization - update PII fields
    const { error } = await this.supabase
      .from(tableName)
      .update({
        phone: null,
        email: null,
        first_name: anonymizedId,
        last_name: 'ANONYMIZED',
        anonymized_at: new Date().toISOString(),
        anonymization_reason: 'retention_policy',
      })
      .eq('id', candidate.resourceId);

    if (error) {
      throw new Error(`Failed to anonymize: ${error.message}`);
    }
  }

  private async archive(candidate: RetentionCandidate): Promise<void> {
    const tableName = this.getTableName(candidate.resourceType);

    // Mark as archived (soft approach)
    const { error } = await this.supabase
      .from(tableName)
      .update({
        archived_at: new Date().toISOString(),
        archive_reason: 'retention_policy',
      })
      .eq('id', candidate.resourceId);

    if (error) {
      throw new Error(`Failed to archive: ${error.message}`);
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapRowToPolicy(row: RetentionPolicyRow): RetentionPolicy {
    return {
      policyId: row.policy_id,
      name: row.policy_name,
      dataCategory: row.data_category,
      resourceType: row.resource_type,
      retentionPeriodDays: row.retention_period_days,
      legalBasis: row.legal_basis,
      disposalMethod: row.disposal_method,
      exceptions: row.exceptions ?? undefined,
    };
  }

  private getTableName(resourceType: string): string {
    // Map resource types to table names
    const tableMap: Record<string, string> = {
      lead: 'leads',
      patient_record: 'patients',
      consent: 'consents',
      audit_log: 'consent_audit_log',
      message: 'message_log',
      appointment: 'appointments',
      subject_data: 'leads', // DSR erasure targets
    };

    return tableMap[resourceType] ?? resourceType;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create Retention service instance
 */
export function createRetentionService(deps: RetentionServiceDeps): PostgresRetentionService {
  return new PostgresRetentionService(deps);
}
