/**
 * @fileoverview OSAX GDPR Audit Module
 *
 * GDPR compliance infrastructure for OSAX clinical data.
 * Provides audit logging, data export, and erasure capabilities.
 *
 * @module core/security/gdpr/osax-audit
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OsaxCase, OsaxDomainEventUnion } from '@medicalcor/domain';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Audit log entry
 */
export interface OsaxAuditLogEntry {
  readonly id: string;
  readonly caseId: string;
  readonly caseNumber: string;
  readonly action: OsaxAuditAction;
  readonly actorId: string;
  readonly actorType: 'USER' | 'SYSTEM' | 'AUTOMATED';
  readonly timestamp: Date;
  readonly details: Record<string, unknown>;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly correlationId: string;
}

/**
 * Audit actions
 */
export type OsaxAuditAction =
  | 'CASE_CREATED'
  | 'CASE_VIEWED'
  | 'CASE_UPDATED'
  | 'CASE_SCORED'
  | 'CASE_REVIEWED'
  | 'TREATMENT_INITIATED'
  | 'TREATMENT_UPDATED'
  | 'FOLLOW_UP_SCHEDULED'
  | 'FOLLOW_UP_COMPLETED'
  | 'CONSENT_OBTAINED'
  | 'CONSENT_WITHDRAWN'
  | 'DATA_ACCESSED'
  | 'DATA_EXPORTED'
  | 'DATA_ANONYMIZED'
  | 'DATA_DELETED'
  | 'PII_ACCESSED';

/**
 * Data export format
 */
export type OsaxExportFormat = 'JSON' | 'PDF' | 'FHIR' | 'CSV';

/**
 * Export result
 */
export interface OsaxDataExportResult {
  readonly success: boolean;
  readonly exportId: string;
  readonly format: OsaxExportFormat;
  readonly data?: string | Buffer;
  readonly downloadUrl?: string;
  readonly expiresAt?: Date;
  readonly error?: string;
}

/**
 * Deletion result
 */
export interface OsaxDataDeletionResult {
  readonly success: boolean;
  readonly deletionId: string;
  readonly deletionType: 'SOFT' | 'HARD';
  readonly recordsAffected: number;
  readonly auditTrailPreserved: boolean;
  readonly error?: string;
}

/**
 * Audit service dependencies
 */
export interface OsaxAuditServiceDeps {
  readonly supabase: SupabaseClient;
  readonly encryptionKey?: string;
  readonly retentionPeriodDays?: number;
}

// ============================================================================
// AUDIT SERVICE
// ============================================================================

/**
 * OsaxAuditService
 *
 * Provides GDPR-compliant audit and data management for OSAX cases.
 */
export class OsaxAuditService {
  private readonly supabase: SupabaseClient;
  private readonly auditTableName = 'osax_audit_log';
  private readonly retentionPeriodDays: number;

  constructor(deps: OsaxAuditServiceDeps) {
    this.supabase = deps.supabase;
    this.retentionPeriodDays = deps.retentionPeriodDays ?? 2555; // 7 years default (medical records)
  }

  // ============================================================================
  // AUDIT LOGGING
  // ============================================================================

  /**
   * Log an audit entry
   */
  async logAuditEntry(entry: Omit<OsaxAuditLogEntry, 'id' | 'timestamp'>): Promise<string> {
    const id = crypto.randomUUID();

    await this.supabase.from(this.auditTableName).insert({
      id,
      case_id: entry.caseId,
      case_number: entry.caseNumber,
      action: entry.action,
      actor_id: entry.actorId,
      actor_type: entry.actorType,
      details: entry.details,
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
      correlation_id: entry.correlationId,
      created_at: new Date().toISOString(),
    });

    return id;
  }

  /**
   * Log domain event as audit entry
   */
  async logDomainEvent(event: OsaxDomainEventUnion): Promise<string> {
    const action = this.mapEventToAction(event.type);

    return this.logAuditEntry({
      caseId: event.aggregateId,
      caseNumber: ((event.payload as Record<string, unknown>).caseNumber as string) ?? 'UNKNOWN',
      action,
      actorId: event.metadata.actor ?? 'SYSTEM',
      actorType: event.metadata.actor ? 'USER' : 'SYSTEM',
      details: event.payload as Record<string, unknown>,
      correlationId: event.metadata.correlationId,
    });
  }

  /**
   * Log data access (for PII tracking)
   */
  async logDataAccess(
    caseId: string,
    caseNumber: string,
    accessorId: string,
    accessType: 'VIEW' | 'DOWNLOAD' | 'EXPORT',
    fieldsAccessed: string[],
    correlationId: string,
    requestInfo?: { ipAddress?: string; userAgent?: string }
  ): Promise<string> {
    const entry: Omit<OsaxAuditLogEntry, 'id' | 'timestamp'> = {
      caseId,
      caseNumber,
      action: accessType === 'EXPORT' ? 'DATA_EXPORTED' : 'DATA_ACCESSED',
      actorId: accessorId,
      actorType: 'USER',
      details: {
        accessType,
        fieldsAccessed,
        piiAccessed: this.containsPII(fieldsAccessed),
      },
      correlationId,
    };
    if (requestInfo?.ipAddress !== undefined) {
      (entry as { ipAddress?: string }).ipAddress = requestInfo.ipAddress;
    }
    if (requestInfo?.userAgent !== undefined) {
      (entry as { userAgent?: string }).userAgent = requestInfo.userAgent;
    }
    return this.logAuditEntry(entry);
  }

  /**
   * Get audit trail for a case
   */
  async getAuditTrail(
    caseId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      actions?: OsaxAuditAction[];
      limit?: number;
    }
  ): Promise<OsaxAuditLogEntry[]> {
    let query = this.supabase
      .from(this.auditTableName)
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (options?.startDate) {
      query = query.gte('created_at', options.startDate.toISOString());
    }
    if (options?.endDate) {
      query = query.lte('created_at', options.endDate.toISOString());
    }
    if (options?.actions && options.actions.length > 0) {
      query = query.in('action', options.actions);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch audit trail: ${error.message}`);
    }

    interface AuditLogRow {
      id: string;
      case_id: string;
      case_number: string;
      action: OsaxAuditAction;
      actor_id: string;
      actor_type: 'USER' | 'SYSTEM' | 'AUTOMATED';
      created_at: string;
      details: Record<string, unknown>;
      ip_address?: string;
      user_agent?: string;
      correlation_id: string;
    }

    return data.map((row: AuditLogRow) => ({
      id: row.id,
      caseId: row.case_id,
      caseNumber: row.case_number,
      action: row.action,
      actorId: row.actor_id,
      actorType: row.actor_type,
      timestamp: new Date(row.created_at),
      details: row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      correlationId: row.correlation_id,
    }));
  }

  // ============================================================================
  // DATA EXPORT (GDPR Portability)
  // ============================================================================

  /**
   * Export case data for GDPR portability request
   */
  async exportCaseData(
    osaxCase: OsaxCase,
    format: OsaxExportFormat,
    requesterId: string,
    correlationId: string
  ): Promise<OsaxDataExportResult> {
    const exportId = crypto.randomUUID();

    try {
      let data: string;

      switch (format) {
        case 'JSON':
          data = this.exportToJson(osaxCase);
          break;
        case 'FHIR':
          data = this.exportToFhir(osaxCase);
          break;
        case 'CSV':
          data = this.exportToCsv(osaxCase);
          break;
        case 'PDF':
          // PDF would require additional library
          data = this.exportToJson(osaxCase);
          break;
        default:
          data = this.exportToJson(osaxCase);
      }

      // Log the export
      await this.logAuditEntry({
        caseId: osaxCase.id,
        caseNumber: osaxCase.caseNumber,
        action: 'DATA_EXPORTED',
        actorId: requesterId,
        actorType: 'USER',
        details: {
          exportId,
          format,
          dataSize: data.length,
        },
        correlationId,
      });

      return {
        success: true,
        exportId,
        format,
        data,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };
    } catch (err) {
      return {
        success: false,
        exportId,
        format,
        error: err instanceof Error ? err.message : 'Export failed',
      };
    }
  }

  /**
   * Export to JSON format
   */
  private exportToJson(osaxCase: OsaxCase): string {
    // Remove internal fields and format for export
    const exportData = {
      caseNumber: osaxCase.caseNumber,
      status: osaxCase.status,
      createdAt: osaxCase.createdAt.toISOString(),
      updatedAt: osaxCase.updatedAt.toISOString(),
      studyMetadata: osaxCase.studyMetadata
        ? {
            studyType: osaxCase.studyMetadata.studyType,
            studyDate: osaxCase.studyMetadata.studyDate.toISOString(),
            durationHours: osaxCase.studyMetadata.durationHours,
            facility: osaxCase.studyMetadata.facility,
          }
        : null,
      clinicalScore: osaxCase.clinicalScore
        ? {
            severity: osaxCase.clinicalScore.severity,
            compositeScore: osaxCase.clinicalScore.compositeScore,
            indicators: osaxCase.clinicalScore.indicators,
            treatmentRecommendation: osaxCase.clinicalScore.treatmentRecommendation,
            scoredAt: osaxCase.clinicalScore.scoredAt.toISOString(),
          }
        : null,
      treatmentHistory: osaxCase.treatmentHistory.map(
        (t: {
          readonly type: string;
          readonly startDate: Date;
          readonly endDate?: Date;
          readonly status: string;
        }) => ({
          type: t.type,
          startDate: t.startDate.toISOString(),
          endDate: t.endDate?.toISOString(),
          status: t.status,
        })
      ),
      followUps: osaxCase.followUps.map(
        (f: {
          readonly scheduledDate: Date;
          readonly completedDate?: Date;
          readonly type: string;
          readonly status: string;
        }) => ({
          scheduledDate: f.scheduledDate.toISOString(),
          completedDate: f.completedDate?.toISOString(),
          type: f.type,
          status: f.status,
        })
      ),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export to FHIR format (basic implementation)
   */
  private exportToFhir(osaxCase: OsaxCase): string {
    // Basic FHIR DiagnosticReport resource
    const fhirResource = {
      resourceType: 'DiagnosticReport',
      id: osaxCase.id,
      status: this.mapStatusToFhir(osaxCase.status),
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '69970-1',
            display: 'Sleep study',
          },
        ],
      },
      effectiveDateTime: osaxCase.studyMetadata?.studyDate.toISOString(),
      issued: osaxCase.updatedAt.toISOString(),
      conclusion: osaxCase.clinicalScore
        ? `OSA Severity: ${osaxCase.clinicalScore.severity}, AHI: ${osaxCase.clinicalScore.indicators.ahi}`
        : 'Pending assessment',
      conclusionCode: osaxCase.clinicalScore
        ? [
            {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: this.mapSeverityToSnomed(osaxCase.clinicalScore.severity),
                  display: `${osaxCase.clinicalScore.severity} obstructive sleep apnea`,
                },
              ],
            },
          ]
        : [],
    };

    return JSON.stringify(fhirResource, null, 2);
  }

  /**
   * Export to CSV format
   */
  private exportToCsv(osaxCase: OsaxCase): string {
    const headers = [
      'Case Number',
      'Status',
      'Severity',
      'AHI',
      'ODI',
      'SpO2 Nadir',
      'Treatment',
      'Created At',
    ];

    const values = [
      osaxCase.caseNumber,
      osaxCase.status,
      osaxCase.clinicalScore?.severity ?? 'N/A',
      osaxCase.clinicalScore?.indicators.ahi.toString() ?? 'N/A',
      osaxCase.clinicalScore?.indicators.odi.toString() ?? 'N/A',
      osaxCase.clinicalScore?.indicators.spo2Nadir.toString() ?? 'N/A',
      osaxCase.activeTreatment?.type ?? 'None',
      osaxCase.createdAt.toISOString(),
    ];

    return `${headers.join(',')}\n${values.map((v) => `"${v}"`).join(',')}`;
  }

  // ============================================================================
  // DATA DELETION (GDPR Erasure)
  // ============================================================================

  /**
   * Soft delete case data (marks as deleted, preserves for retention period)
   */
  async softDeleteCaseData(
    caseId: string,
    caseNumber: string,
    requesterId: string,
    reason: string,
    correlationId: string
  ): Promise<OsaxDataDeletionResult> {
    const deletionId = crypto.randomUUID();

    try {
      // Update case to soft deleted
      const { error } = await this.supabase
        .from('osax_cases')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          retention_policy: `GDPR_REQUEST:${this.retentionPeriodDays}days`,
        })
        .eq('id', caseId);

      if (error) {
        throw error;
      }

      // Log deletion
      await this.logAuditEntry({
        caseId,
        caseNumber,
        action: 'DATA_DELETED',
        actorId: requesterId,
        actorType: 'USER',
        details: {
          deletionId,
          deletionType: 'SOFT',
          reason,
          retentionUntil: new Date(
            Date.now() + this.retentionPeriodDays * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
        correlationId,
      });

      return {
        success: true,
        deletionId,
        deletionType: 'SOFT',
        recordsAffected: 1,
        auditTrailPreserved: true,
      };
    } catch (err) {
      return {
        success: false,
        deletionId,
        deletionType: 'SOFT',
        recordsAffected: 0,
        auditTrailPreserved: true,
        error: err instanceof Error ? err.message : 'Deletion failed',
      };
    }
  }

  /**
   * Hard delete case data (permanent erasure after retention period)
   */
  async hardDeleteCaseData(
    caseId: string,
    caseNumber: string,
    requesterId: string,
    correlationId: string
  ): Promise<OsaxDataDeletionResult> {
    const deletionId = crypto.randomUUID();

    try {
      // Verify case is past retention period
      const { data: caseData } = await this.supabase
        .from('osax_cases')
        .select('deleted_at, retention_policy')
        .eq('id', caseId)
        .single();

      if (caseData?.deleted_at) {
        const deletedAt = new Date(caseData.deleted_at);
        const retentionEnd = new Date(
          deletedAt.getTime() + this.retentionPeriodDays * 24 * 60 * 60 * 1000
        );

        if (new Date() < retentionEnd) {
          return {
            success: false,
            deletionId,
            deletionType: 'HARD',
            recordsAffected: 0,
            auditTrailPreserved: true,
            error: `Retention period not expired. Can be deleted after ${retentionEnd.toISOString()}`,
          };
        }
      }

      // Delete case data
      const { error } = await this.supabase.from('osax_cases').delete().eq('id', caseId);

      if (error) {
        throw error;
      }

      // Log final deletion (this audit record is preserved)
      await this.logAuditEntry({
        caseId,
        caseNumber,
        action: 'DATA_DELETED',
        actorId: requesterId,
        actorType: 'USER',
        details: {
          deletionId,
          deletionType: 'HARD',
          finalErasure: true,
        },
        correlationId,
      });

      return {
        success: true,
        deletionId,
        deletionType: 'HARD',
        recordsAffected: 1,
        auditTrailPreserved: true, // Audit trail always preserved
      };
    } catch (err) {
      return {
        success: false,
        deletionId,
        deletionType: 'HARD',
        recordsAffected: 0,
        auditTrailPreserved: true,
        error: err instanceof Error ? err.message : 'Deletion failed',
      };
    }
  }

  /**
   * Anonymize case data (for research use while preserving privacy)
   */
  async anonymizeCaseData(
    caseId: string,
    caseNumber: string,
    requesterId: string,
    correlationId: string
  ): Promise<{ success: boolean; anonymizedId?: string; error?: string }> {
    const anonymizedId = `ANON-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    try {
      // Update case with anonymized data
      const { error } = await this.supabase
        .from('osax_cases')
        .update({
          patient_id: anonymizedId,
          subject_id: `anon_${anonymizedId}`,
          referring_physician_id: null,
          assigned_specialist_id: null,
          // Keep clinical data for research value
        })
        .eq('id', caseId);

      if (error) {
        throw error;
      }

      await this.logAuditEntry({
        caseId,
        caseNumber,
        action: 'DATA_ANONYMIZED',
        actorId: requesterId,
        actorType: 'USER',
        details: { anonymizedId },
        correlationId,
      });

      return { success: true, anonymizedId };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Anonymization failed',
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapEventToAction(eventType: string): OsaxAuditAction {
    const mapping: Record<string, OsaxAuditAction> = {
      'osax.case.created': 'CASE_CREATED',
      'osax.case.scored': 'CASE_SCORED',
      'osax.case.reviewed': 'CASE_REVIEWED',
      'osax.case.status_changed': 'CASE_UPDATED',
      'osax.treatment.initiated': 'TREATMENT_INITIATED',
      'osax.treatment.status_changed': 'TREATMENT_UPDATED',
      'osax.followup.scheduled': 'FOLLOW_UP_SCHEDULED',
      'osax.followup.completed': 'FOLLOW_UP_COMPLETED',
      'osax.consent.obtained': 'CONSENT_OBTAINED',
      'osax.consent.withdrawn': 'CONSENT_WITHDRAWN',
      'osax.data.exported': 'DATA_EXPORTED',
      'osax.data.deleted': 'DATA_DELETED',
    };

    return mapping[eventType] ?? 'CASE_UPDATED';
  }

  private containsPII(fields: string[]): boolean {
    const piiFields = ['patientId', 'firstName', 'lastName', 'dateOfBirth', 'phone', 'email'];
    return fields.some((f) => piiFields.includes(f));
  }

  private mapStatusToFhir(status: string): string {
    const mapping: Record<string, string> = {
      PENDING_STUDY: 'registered',
      STUDY_COMPLETED: 'preliminary',
      SCORED: 'preliminary',
      REVIEWED: 'final',
      TREATMENT_PLANNED: 'final',
      IN_TREATMENT: 'final',
      FOLLOW_UP: 'final',
      CLOSED: 'final',
      CANCELLED: 'cancelled',
    };
    return mapping[status] ?? 'unknown';
  }

  private mapSeverityToSnomed(severity: string): string {
    const mapping: Record<string, string> = {
      NONE: '70995007', // No diagnosis
      MILD: '78275009', // Mild OSA
      MODERATE: '80394007', // Moderate OSA
      SEVERE: '79430001', // Severe OSA
    };
    return mapping[severity] ?? '70995007';
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create audit service instance
 */
export function createOsaxAuditService(deps: OsaxAuditServiceDeps): OsaxAuditService {
  return new OsaxAuditService(deps);
}
