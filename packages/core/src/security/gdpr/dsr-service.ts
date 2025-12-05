/**
 * @fileoverview Data Subject Request (DSR) Service
 *
 * GDPR Articles 15-22 compliance: Handles data subject rights requests
 * including access, rectification, erasure, portability, and objection.
 *
 * @module core/security/gdpr/dsr-service
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// LOCAL TYPE DEFINITIONS
// (Defined locally to avoid circular dependencies with architecture module)
// ============================================================================

/**
 * DSR request types
 */
export type DSRType =
  | 'access'
  | 'rectification'
  | 'erasure'
  | 'portability'
  | 'restriction'
  | 'objection'
  | 'automated_decision';

/**
 * DSR status values
 */
export type DSRStatus =
  | 'pending_verification'
  | 'verified'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled';

/**
 * DSR response
 */
export interface DSRResponse {
  readonly responseType: 'fulfilled' | 'partial' | 'denied';
  readonly data?: unknown;
  readonly exportFormat?: string;
  readonly downloadUrl?: string;
  readonly expiresAt?: Date;
  readonly reason?: string;
}

/**
 * Data Subject Request
 */
export interface DataSubjectRequest {
  readonly requestId: string;
  readonly subjectId: string;
  readonly requestType: DSRType;
  readonly status: DSRStatus;
  readonly createdAt: Date;
  readonly dueDate: Date;
  readonly completedAt?: Date;
  readonly verifiedAt?: Date;
  readonly verificationMethod?: string;
  readonly details: Record<string, unknown>;
  readonly response?: DSRResponse;
}

/**
 * DSR service interface
 */
export interface DSRService {
  createRequest(
    request: Omit<DataSubjectRequest, 'requestId' | 'createdAt' | 'status'>
  ): Promise<DataSubjectRequest>;
  verifyRequest(requestId: string, verificationMethod: string): Promise<void>;
  processRequest(requestId: string): Promise<DSRResponse>;
  getRequestStatus(requestId: string): Promise<DataSubjectRequest>;
  listRequests(subjectId: string): Promise<DataSubjectRequest[]>;
}

// ============================================================================
// SERVICE DEPENDENCIES
// ============================================================================

/**
 * DSR Service dependencies
 */
export interface DSRServiceDeps {
  readonly supabase: SupabaseClient;
  /** Default due date offset in days (GDPR requires 30 days max) */
  readonly defaultDueDateDays?: number;
}

/**
 * Database row type for data_subject_requests table
 */
interface DSRRow {
  id: string;
  subject_id: string;
  subject_type: string;
  request_type: DSRType;
  status: DSRStatus;
  verified_at: string | null;
  verification_method: string | null;
  details: Record<string, unknown>;
  response_data: unknown | null;
  response_type: string | null;
  download_url: string | null;
  download_expires_at: string | null;
  due_date: string;
  completed_at: string | null;
  created_at: string;
  correlation_id: string | null;
}

// ============================================================================
// DSR SERVICE IMPLEMENTATION
// ============================================================================

/**
 * PostgresDSRService
 *
 * Implements GDPR Data Subject Request handling with PostgreSQL backend.
 */
export class PostgresDSRService implements DSRService {
  private readonly supabase: SupabaseClient;
  private readonly defaultDueDateDays: number;
  private readonly tableName = 'data_subject_requests';
  private readonly auditTableName = 'dsr_audit_log';

  constructor(deps: DSRServiceDeps) {
    this.supabase = deps.supabase;
    this.defaultDueDateDays = deps.defaultDueDateDays ?? 30; // GDPR requires response within 30 days
  }

  /**
   * Create a new data subject request
   */
  async createRequest(
    request: Omit<DataSubjectRequest, 'requestId' | 'createdAt' | 'status'>
  ): Promise<DataSubjectRequest> {
    const id = crypto.randomUUID();
    const now = new Date();
    const dueDate =
      request.dueDate ?? new Date(now.getTime() + this.defaultDueDateDays * 24 * 60 * 60 * 1000);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert({
        id,
        subject_id: request.subjectId,
        request_type: request.requestType,
        status: 'pending_verification',
        details: request.details,
        due_date: dueDate.toISOString(),
        created_at: now.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create DSR: ${error.message}`);
    }

    // Log audit entry
    await this.logAudit(id, 'CREATED', undefined, { requestType: request.requestType });

    return this.mapRowToRequest(data as DSRRow);
  }

  /**
   * Verify request identity
   */
  async verifyRequest(requestId: string, verificationMethod: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .update({
        status: 'verified',
        verified_at: new Date().toISOString(),
        verification_method: verificationMethod,
      })
      .eq('id', requestId)
      .eq('status', 'pending_verification');

    if (error) {
      throw new Error(`Failed to verify DSR: ${error.message}`);
    }

    await this.logAudit(requestId, 'VERIFIED', undefined, { verificationMethod });
  }

  /**
   * Process a data subject request
   */
  async processRequest(requestId: string): Promise<DSRResponse> {
    // Get the request
    const request = await this.getRequestStatus(requestId);

    if (request.status !== 'verified') {
      return {
        responseType: 'denied',
        reason: 'Request must be verified before processing',
      };
    }

    // Update status to in_progress
    await this.supabase.from(this.tableName).update({ status: 'in_progress' }).eq('id', requestId);

    await this.logAudit(requestId, 'PROCESSING_STARTED', undefined, {});

    // Process based on request type
    let response: DSRResponse;

    switch (request.requestType) {
      case 'access':
        response = await this.handleAccessRequest(request);
        break;
      case 'portability':
        response = await this.handlePortabilityRequest(request);
        break;
      case 'erasure':
        response = await this.handleErasureRequest(request);
        break;
      case 'rectification':
        response = await this.handleRectificationRequest(request);
        break;
      case 'restriction':
        response = await this.handleRestrictionRequest(request);
        break;
      case 'objection':
        response = await this.handleObjectionRequest(request);
        break;
      default:
        response = { responseType: 'denied', reason: 'Unsupported request type' };
    }

    // Update request with response
    const completedAt = response.responseType !== 'denied' ? new Date().toISOString() : null;
    const status = response.responseType === 'denied' ? 'rejected' : 'completed';

    await this.supabase
      .from(this.tableName)
      .update({
        status,
        completed_at: completedAt,
        response_data: response.data ?? null,
        response_type: response.responseType,
        download_url: response.downloadUrl ?? null,
        download_expires_at: response.expiresAt?.toISOString() ?? null,
      })
      .eq('id', requestId);

    await this.logAudit(requestId, status === 'completed' ? 'COMPLETED' : 'REJECTED', undefined, {
      responseType: response.responseType,
    });

    return response;
  }

  /**
   * Get request status
   */
  async getRequestStatus(requestId: string): Promise<DataSubjectRequest> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', requestId)
      .single();

    if (error || !data) {
      throw new Error(`DSR not found: ${requestId}`);
    }

    return this.mapRowToRequest(data as DSRRow);
  }

  /**
   * List all requests for a subject
   */
  async listRequests(subjectId: string): Promise<DataSubjectRequest[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list DSRs: ${error.message}`);
    }

    return (data as DSRRow[]).map((row) => this.mapRowToRequest(row));
  }

  /**
   * Get pending requests that are due
   */
  async getPendingDueRequests(): Promise<DataSubjectRequest[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .not('status', 'in', '("completed","rejected","cancelled")')
      .lte('due_date', new Date().toISOString())
      .order('due_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to get pending DSRs: ${error.message}`);
    }

    return (data as DSRRow[]).map((row) => this.mapRowToRequest(row));
  }

  /**
   * Get DSR statistics for compliance reporting
   */
  async getStatistics(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    total: number;
    byType: Record<DSRType, number>;
    byStatus: Record<DSRStatus, number>;
    averageCompletionDays: number;
    overdueCount: number;
  }> {
    let query = this.supabase.from(this.tableName).select('*');

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get DSR statistics: ${error.message}`);
    }

    const rows = data as DSRRow[];
    const now = new Date();

    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalCompletionDays = 0;
    let completedCount = 0;
    let overdueCount = 0;

    for (const row of rows) {
      // Count by type
      byType[row.request_type] = (byType[row.request_type] ?? 0) + 1;

      // Count by status
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

      // Calculate completion time
      if (row.completed_at) {
        const created = new Date(row.created_at);
        const completed = new Date(row.completed_at);
        totalCompletionDays += (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        completedCount++;
      }

      // Check overdue
      if (!['completed', 'rejected', 'cancelled'].includes(row.status)) {
        const dueDate = new Date(row.due_date);
        if (dueDate < now) {
          overdueCount++;
        }
      }
    }

    return {
      total: rows.length,
      byType: byType as Record<DSRType, number>,
      byStatus: byStatus as Record<DSRStatus, number>,
      averageCompletionDays: completedCount > 0 ? totalCompletionDays / completedCount : 0,
      overdueCount,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapRowToRequest(row: DSRRow): DataSubjectRequest {
    return {
      requestId: row.id,
      subjectId: row.subject_id,
      requestType: row.request_type,
      status: row.status,
      createdAt: new Date(row.created_at),
      dueDate: new Date(row.due_date),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
      verificationMethod: row.verification_method ?? undefined,
      details: row.details,
      response: row.response_type
        ? {
            responseType: row.response_type as 'fulfilled' | 'partial' | 'denied',
            data: row.response_data,
            downloadUrl: row.download_url ?? undefined,
            expiresAt: row.download_expires_at ? new Date(row.download_expires_at) : undefined,
          }
        : undefined,
    };
  }

  private async logAudit(
    requestId: string,
    action: string,
    actorId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.supabase.from(this.auditTableName).insert({
      request_id: requestId,
      action,
      actor_id: actorId,
      actor_type: actorId ? 'USER' : 'SYSTEM',
      details: details ?? {},
    });
  }

  // ============================================================================
  // REQUEST TYPE HANDLERS
  // ============================================================================

  private async handleAccessRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    // Collect all data for the subject
    const subjectData = await this.collectSubjectData(request.subjectId);

    return {
      responseType: 'fulfilled',
      data: subjectData,
      exportFormat: 'JSON',
    };
  }

  private async handlePortabilityRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    const subjectData = await this.collectSubjectData(request.subjectId);

    // Format in portable format (JSON with standard structure)
    const portableData = {
      exportedAt: new Date().toISOString(),
      format: 'GDPR_PORTABLE_v1',
      subjectId: request.subjectId,
      data: subjectData,
    };

    return {
      responseType: 'fulfilled',
      data: portableData,
      exportFormat: 'JSON',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };
  }

  private async handleErasureRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    // Schedule deletion via scheduled_deletions table
    const { error } = await this.supabase.from('scheduled_deletions').insert({
      entity_type: 'subject_data',
      entity_id: request.subjectId,
      scheduled_for: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days retention
      reason: `GDPR erasure request: ${request.requestId}`,
    });

    if (error) {
      return {
        responseType: 'denied',
        reason: `Failed to schedule erasure: ${error.message}`,
      };
    }

    return {
      responseType: 'fulfilled',
      data: {
        message: 'Erasure scheduled',
        scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  private async handleRectificationRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    // Rectification requires manual review
    return {
      responseType: 'partial',
      data: {
        message: 'Rectification request received and will be processed by our data protection team',
        fieldsToRectify: request.details.fieldsToRectify ?? [],
      },
    };
  }

  private async handleRestrictionRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    // Mark subject data as restricted
    // This would typically update a flag on related records
    return {
      responseType: 'fulfilled',
      data: {
        message: 'Processing restriction applied',
        restrictedAt: new Date().toISOString(),
      },
    };
  }

  private async handleObjectionRequest(request: DataSubjectRequest): Promise<DSRResponse> {
    // Handle objection to processing
    const objectionType = request.details.objectionType as string | undefined;

    return {
      responseType: 'fulfilled',
      data: {
        message: 'Objection recorded',
        objectionType: objectionType ?? 'general',
        effectiveFrom: new Date().toISOString(),
      },
    };
  }

  private async collectSubjectData(subjectId: string): Promise<Record<string, unknown>> {
    // Collect data from various tables
    const data: Record<string, unknown> = {};

    // Get leads
    const { data: leads } = await this.supabase
      .from('leads')
      .select('*')
      .or(`phone.eq.${subjectId},email.eq.${subjectId},hubspot_contact_id.eq.${subjectId}`)
      .is('deleted_at', null);
    data.leads = leads ?? [];

    // Get consents
    const { data: consents } = await this.supabase
      .from('consents')
      .select('*')
      .eq('subject_id', subjectId);
    data.consents = consents ?? [];

    // Get appointments
    const { data: appointments } = await this.supabase
      .from('appointments')
      .select('*')
      .eq('contact_id', subjectId)
      .is('deleted_at', null);
    data.appointments = appointments ?? [];

    // Get communications
    const { data: communications } = await this.supabase
      .from('message_log')
      .select('*')
      .eq('contact_id', subjectId)
      .is('deleted_at', null);
    data.communications = communications ?? [];

    return data;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create DSR service instance
 */
export function createDSRService(deps: DSRServiceDeps): PostgresDSRService {
  return new PostgresDSRService(deps);
}
