/**
 * @fileoverview Data Inventory Service
 *
 * GDPR Article 30 compliance: Records of Processing Activities (RoPA)
 * Maintains inventory of all data processing activities for compliance reporting.
 *
 * @module core/security/gdpr/data-inventory-service
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
 * Legal basis for processing
 */
export type LegalBasis =
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'vital_interests'
  | 'public_task'
  | 'legitimate_interests';

/**
 * Data recipient
 */
export interface DataRecipient {
  readonly name: string;
  readonly type: 'internal' | 'processor' | 'controller' | 'public_authority';
  readonly purpose: string;
  readonly country?: string;
}

/**
 * Data processing activity
 */
export interface DataProcessingActivity {
  readonly activityId: string;
  readonly name: string;
  readonly description: string;
  readonly purpose: string;
  readonly legalBasis: LegalBasis;
  readonly dataCategories: DataCategory[];
  readonly dataSubjectTypes: string[];
  readonly recipients: DataRecipient[];
  readonly retentionPeriod: string;
  readonly securityMeasures: string[];
  readonly transfersOutsideEU: boolean;
  readonly transferSafeguards?: string;
}

/**
 * Processing records (Article 30)
 */
export interface ProcessingRecords {
  readonly generatedAt: Date;
  readonly organizationName: string;
  readonly dpoContact?: string;
  readonly activities: DataProcessingActivity[];
}

/**
 * Data inventory service interface
 */
export interface DataInventoryService {
  registerActivity(activity: DataProcessingActivity): Promise<void>;
  getActivities(): Promise<DataProcessingActivity[]>;
  getActivitiesByCategory(category: DataCategory): Promise<DataProcessingActivity[]>;
  generateProcessingRecords(): Promise<ProcessingRecords>;
}

// ============================================================================
// SERVICE DEPENDENCIES
// ============================================================================

/**
 * Data Inventory Service dependencies
 */
export interface DataInventoryServiceDeps {
  readonly supabase: SupabaseClient;
  readonly organizationName: string;
  readonly dpoContact?: string;
}

/**
 * Database row type for gdpr_data_inventory table
 */
interface DataInventoryRow {
  id: string;
  activity_id: string;
  activity_name: string;
  description: string | null;
  purpose: string;
  legal_basis: LegalBasis;
  legitimate_interest_assessment: string | null;
  data_categories: string[];
  data_subject_types: string[];
  sensitive_data: boolean;
  special_categories: string[] | null;
  storage_location: string | null;
  retention_period_days: number;
  retention_policy_reference: string | null;
  data_source: string | null;
  recipients: DataRecipient[];
  transfers_outside_eu: boolean;
  transfer_safeguards: string | null;
  transfer_countries: string[] | null;
  security_measures: string[] | null;
  encryption_at_rest: boolean;
  encryption_in_transit: boolean;
  access_controls: string | null;
  dpia_required: boolean;
  dpia_reference: string | null;
  risk_level: string;
  is_active: boolean;
  last_reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DATA INVENTORY SERVICE IMPLEMENTATION
// ============================================================================

/**
 * PostgresDataInventoryService
 *
 * Implements GDPR Article 30 Records of Processing Activities.
 */
export class PostgresDataInventoryService implements DataInventoryService {
  private readonly supabase: SupabaseClient;
  private readonly organizationName: string;
  private readonly dpoContact?: string;
  private readonly tableName = 'gdpr_data_inventory';

  constructor(deps: DataInventoryServiceDeps) {
    this.supabase = deps.supabase;
    this.organizationName = deps.organizationName;
    this.dpoContact = deps.dpoContact;
  }

  /**
   * Register a processing activity
   */
  async registerActivity(activity: DataProcessingActivity): Promise<void> {
    const { error } = await this.supabase.from(this.tableName).upsert(
      {
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
        transfer_safeguards: activity.transferSafeguards,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'activity_id' }
    );

    if (error) {
      throw new Error(`Failed to register processing activity: ${error.message}`);
    }
  }

  /**
   * Get all processing activities
   */
  async getActivities(): Promise<DataProcessingActivity[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .order('activity_name', { ascending: true });

    if (error) {
      throw new Error(`Failed to get processing activities: ${error.message}`);
    }

    return (data as DataInventoryRow[]).map((row) => this.mapRowToActivity(row));
  }

  /**
   * Get activities by data category
   */
  async getActivitiesByCategory(category: DataCategory): Promise<DataProcessingActivity[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .contains('data_categories', [category]);

    if (error) {
      throw new Error(`Failed to get activities by category: ${error.message}`);
    }

    return (data as DataInventoryRow[]).map((row) => this.mapRowToActivity(row));
  }

  /**
   * Get activity by ID
   */
  async getActivity(activityId: string): Promise<DataProcessingActivity | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('activity_id', activityId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapRowToActivity(data as DataInventoryRow);
  }

  /**
   * Update activity
   */
  async updateActivity(
    activityId: string,
    updates: Partial<DataProcessingActivity>
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateData.activity_name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.purpose !== undefined) updateData.purpose = updates.purpose;
    if (updates.legalBasis !== undefined) updateData.legal_basis = updates.legalBasis;
    if (updates.dataCategories !== undefined) updateData.data_categories = updates.dataCategories;
    if (updates.dataSubjectTypes !== undefined)
      updateData.data_subject_types = updates.dataSubjectTypes;
    if (updates.recipients !== undefined) updateData.recipients = updates.recipients;
    if (updates.retentionPeriod !== undefined)
      updateData.retention_period_days = parseInt(updates.retentionPeriod) || 365;
    if (updates.securityMeasures !== undefined)
      updateData.security_measures = updates.securityMeasures;
    if (updates.transfersOutsideEU !== undefined)
      updateData.transfers_outside_eu = updates.transfersOutsideEU;
    if (updates.transferSafeguards !== undefined)
      updateData.transfer_safeguards = updates.transferSafeguards;

    const { error } = await this.supabase
      .from(this.tableName)
      .update(updateData)
      .eq('activity_id', activityId);

    if (error) {
      throw new Error(`Failed to update processing activity: ${error.message}`);
    }
  }

  /**
   * Deactivate activity
   */
  async deactivateActivity(activityId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('activity_id', activityId);

    if (error) {
      throw new Error(`Failed to deactivate processing activity: ${error.message}`);
    }
  }

  /**
   * Generate Article 30 Processing Records
   */
  async generateProcessingRecords(): Promise<ProcessingRecords> {
    const activities = await this.getActivities();

    return {
      generatedAt: new Date(),
      organizationName: this.organizationName,
      dpoContact: this.dpoContact,
      activities,
    };
  }

  /**
   * Mark activity as reviewed
   */
  async markAsReviewed(activityId: string, reviewerId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        last_reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId,
        updated_at: new Date().toISOString(),
      })
      .eq('activity_id', activityId);

    if (error) {
      throw new Error(`Failed to mark activity as reviewed: ${error.message}`);
    }
  }

  /**
   * Get activities requiring DPIA
   */
  async getActivitiesRequiringDPIA(): Promise<DataProcessingActivity[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .eq('dpia_required', true);

    if (error) {
      throw new Error(`Failed to get DPIA activities: ${error.message}`);
    }

    return (data as DataInventoryRow[]).map((row) => this.mapRowToActivity(row));
  }

  /**
   * Get activities with EU transfers
   */
  async getActivitiesWithEUTransfers(): Promise<DataProcessingActivity[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .eq('transfers_outside_eu', true);

    if (error) {
      throw new Error(`Failed to get EU transfer activities: ${error.message}`);
    }

    return (data as DataInventoryRow[]).map((row) => this.mapRowToActivity(row));
  }

  /**
   * Get activities not reviewed in specified days
   */
  async getStaleActivities(daysSinceReview: number = 365): Promise<DataProcessingActivity[]> {
    const cutoffDate = new Date(Date.now() - daysSinceReview * 24 * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('is_active', true)
      .or(`last_reviewed_at.is.null,last_reviewed_at.lt.${cutoffDate.toISOString()}`);

    if (error) {
      throw new Error(`Failed to get stale activities: ${error.message}`);
    }

    return (data as DataInventoryRow[]).map((row) => this.mapRowToActivity(row));
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapRowToActivity(row: DataInventoryRow): DataProcessingActivity {
    return {
      activityId: row.activity_id,
      name: row.activity_name,
      description: row.description ?? '',
      purpose: row.purpose,
      legalBasis: row.legal_basis,
      dataCategories: row.data_categories as DataCategory[],
      dataSubjectTypes: row.data_subject_types,
      recipients: row.recipients ?? [],
      retentionPeriod: `${row.retention_period_days} days`,
      securityMeasures: row.security_measures ?? [],
      transfersOutsideEU: row.transfers_outside_eu,
      transferSafeguards: row.transfer_safeguards ?? undefined,
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create Data Inventory service instance
 */
export function createDataInventoryService(
  deps: DataInventoryServiceDeps
): PostgresDataInventoryService {
  return new PostgresDataInventoryService(deps);
}
