/**
 * @fileoverview Article 30 Report Service
 *
 * GDPR Article 30 compliance: Automated generation of Records of Processing Activities (RoPA).
 * Orchestrates data collection from various compliance services to generate comprehensive reports.
 *
 * @module core/security/gdpr/article30-report-service
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type {
  Article30Report,
  Article30ProcessingActivity,
  Article30ControllerInfo,
  Article30ConsentSummary,
  Article30DSRSummary,
  Article30DataBreachSummary,
  Article30ReportStatus,
  Article30ReportFrequency,
  GenerateArticle30ReportRequest,
} from '@medicalcor/types';
import { calculateReportStatistics } from '@medicalcor/types';
import { createLogger, type Logger } from '../../logger.js';
import type {
  DataProcessingActivity,
  DataCategory,
  LegalBasis,
  DataRecipient,
} from './data-inventory-service.js';
import type { DSRType, DSRStatus } from './dsr-service.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Article 30 Report Service dependencies
 */
export interface Article30ReportServiceDeps {
  /** Supabase client for database access */
  readonly supabase: SupabaseClient;
  /** Controller information */
  readonly controller: Article30ControllerInfo;
  /** Logger instance (optional) */
  readonly logger?: Logger;
}

/**
 * Report storage row
 */
interface Article30ReportRow {
  id: string;
  version: number;
  title: string;
  period_start: string;
  period_end: string;
  status: Article30ReportStatus;
  frequency: Article30ReportFrequency | null;
  report_data: Article30Report;
  generated_by: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_comments: string | null;
  previous_report_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * Consent status type
 */
type ConsentStatus = 'granted' | 'withdrawn' | 'expired' | 'pending' | 'denied';

/**
 * Consent record row
 */
interface ConsentRow {
  id: string;
  consent_type: string;
  status: ConsentStatus;
  granted_at: string;
  withdrawn_at: string | null;
  expires_at: string | null;
}

/**
 * DSR row for statistics
 */
interface DSRRow {
  id: string;
  request_type: DSRType;
  status: DSRStatus;
  created_at: string;
  completed_at: string | null;
  due_date: string;
}

/**
 * Data inventory row for mapping
 */
interface DataInventoryRow {
  id: string;
  activity_id: string;
  activity_name: string;
  description: string | null;
  purpose: string;
  legal_basis: LegalBasis;
  legitimate_interest_assessment: string | null;
  data_categories: DataCategory[];
  data_subject_types: string[];
  sensitive_data: boolean;
  special_categories: string[] | null;
  storage_location: string | null;
  retention_period_days: number;
  retention_policy_reference: string | null;
  recipients: DataRecipient[];
  transfers_outside_eu: boolean;
  transfer_safeguards: string | null;
  transfer_countries: string[] | null;
  security_measures: string[] | null;
  encryption_at_rest: boolean;
  encryption_in_transit: boolean;
  dpia_required: boolean;
  dpia_reference: string | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  processing_system: string | null;
  responsible_department: string | null;
  is_active: boolean;
  last_reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Article30ReportService
 *
 * Generates comprehensive GDPR Article 30 Records of Processing Activities reports.
 * Aggregates data from:
 * - Data Inventory (processing activities)
 * - Consent records
 * - Data Subject Requests (DSR)
 * - Data breach records
 */
export class Article30ReportService {
  private readonly supabase: SupabaseClient;
  private readonly controller: Article30ControllerInfo;
  private readonly logger: Logger;
  private readonly reportsTableName = 'gdpr_article30_reports';
  private readonly dataInventoryTableName = 'gdpr_data_inventory';
  private readonly consentTableName = 'consent_records';
  private readonly dsrTableName = 'data_subject_requests';
  private readonly breachTableName = 'data_breaches';

  constructor(deps: Article30ReportServiceDeps) {
    this.supabase = deps.supabase;
    this.controller = deps.controller;
    this.logger = deps.logger ?? createLogger({ name: 'article30-report-service' });
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Generate a new Article 30 compliance report
   */
  async generateReport(request: GenerateArticle30ReportRequest): Promise<Article30Report> {
    const correlationId = request.correlationId ?? randomUUID();
    const log = this.logger.child({ correlationId });

    log.info({ request }, 'Generating Article 30 report');

    const now = new Date();
    const periodStart = request.periodStart ?? new Date(now.getFullYear(), 0, 1);
    const periodEnd = request.periodEnd ?? now;

    // Get latest version for this period
    const version = await this.getNextVersion(periodStart, periodEnd);

    // Collect all report data
    const [processingActivities, consentSummary, dsrSummary, dataBreachSummary] = await Promise.all(
      [
        this.getProcessingActivities(),
        request.includeConsentSummary !== false
          ? this.getConsentSummary(periodStart, periodEnd)
          : [],
        request.includeDSRSummary !== false
          ? this.getDSRSummary(periodStart, periodEnd)
          : undefined,
        request.includeDataBreaches !== false
          ? this.getDataBreachSummary(periodStart, periodEnd)
          : undefined,
      ]
    );

    // Calculate statistics
    const statistics = calculateReportStatistics(processingActivities);

    // Build the report
    const report: Article30Report = {
      reportId: randomUUID(),
      version,
      title:
        request.title ??
        `GDPR Article 30 RoPA Report - ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`,
      periodStart,
      periodEnd,
      generatedAt: now,
      generatedBy: 'system',
      status: 'draft',
      frequency: request.frequency,
      controller: this.controller,
      processingActivities,
      consentSummary,
      dsrSummary,
      dataBreachSummary,
      statistics,
      notes: request.notes,
    };

    // Store the report
    await this.storeReport(report, correlationId);

    log.info(
      {
        reportId: report.reportId,
        version: report.version,
        activitiesCount: processingActivities.length,
      },
      'Article 30 report generated successfully'
    );

    return report;
  }

  /**
   * Get a report by ID
   */
  async getReport(reportId: string): Promise<Article30Report | null> {
    const { data, error } = await this.supabase
      .from(this.reportsTableName)
      .select('*')
      .eq('id', reportId)
      .single();

    if (error || !data) {
      return null;
    }

    return (data as Article30ReportRow).report_data;
  }

  /**
   * Get the latest report
   */
  async getLatestReport(): Promise<Article30Report | null> {
    const { data, error } = await this.supabase
      .from(this.reportsTableName)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return (data as Article30ReportRow).report_data;
  }

  /**
   * List reports with pagination
   */
  async listReports(options?: {
    limit?: number;
    offset?: number;
    status?: Article30ReportStatus;
  }): Promise<{ reports: Article30Report[]; total: number }> {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    let query = this.supabase
      .from(this.reportsTableName)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list reports: ${error.message}`);
    }

    const reports = (data as Article30ReportRow[]).map((row) => row.report_data);

    return {
      reports,
      total: count ?? 0,
    };
  }

  /**
   * Approve a report
   */
  async approveReport(
    reportId: string,
    approvedBy: string,
    comments?: string
  ): Promise<Article30Report> {
    const report = await this.getReport(reportId);

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    if (report.status !== 'draft' && report.status !== 'pending_review') {
      throw new Error(`Report cannot be approved in status: ${report.status}`);
    }

    const now = new Date();
    const updatedReport: Article30Report = {
      ...report,
      status: 'approved',
      approval: {
        approvedBy,
        approvedAt: now,
        comments,
      },
    };

    const { error } = await this.supabase
      .from(this.reportsTableName)
      .update({
        status: 'approved',
        report_data: updatedReport,
        approved_by: approvedBy,
        approved_at: now.toISOString(),
        approval_comments: comments,
        updated_at: now.toISOString(),
      })
      .eq('id', reportId);

    if (error) {
      throw new Error(`Failed to approve report: ${error.message}`);
    }

    this.logger.info({ reportId, approvedBy }, 'Article 30 report approved');

    return updatedReport;
  }

  /**
   * Submit report for review
   */
  async submitForReview(reportId: string): Promise<Article30Report> {
    const report = await this.getReport(reportId);

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    if (report.status !== 'draft') {
      throw new Error(`Report cannot be submitted for review in status: ${report.status}`);
    }

    const updatedReport: Article30Report = {
      ...report,
      status: 'pending_review',
    };

    const { error } = await this.supabase
      .from(this.reportsTableName)
      .update({
        status: 'pending_review',
        report_data: updatedReport,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    if (error) {
      throw new Error(`Failed to submit report for review: ${error.message}`);
    }

    this.logger.info({ reportId }, 'Article 30 report submitted for review');

    return updatedReport;
  }

  /**
   * Publish an approved report
   */
  async publishReport(reportId: string): Promise<Article30Report> {
    const report = await this.getReport(reportId);

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    if (report.status !== 'approved') {
      throw new Error(`Only approved reports can be published. Current status: ${report.status}`);
    }

    const updatedReport: Article30Report = {
      ...report,
      status: 'published',
    };

    const { error } = await this.supabase
      .from(this.reportsTableName)
      .update({
        status: 'published',
        report_data: updatedReport,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    if (error) {
      throw new Error(`Failed to publish report: ${error.message}`);
    }

    this.logger.info({ reportId }, 'Article 30 report published');

    return updatedReport;
  }

  /**
   * Archive a report (when superseded by a newer version)
   */
  async archiveReport(reportId: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.reportsTableName)
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    if (error) {
      throw new Error(`Failed to archive report: ${error.message}`);
    }

    this.logger.info({ reportId }, 'Article 30 report archived');
  }

  /**
   * Export report to JSON format
   */
  async exportToJSON(reportId: string): Promise<string> {
    const report = await this.getReport(reportId);

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    return JSON.stringify(report, null, 2);
  }

  // ============================================================================
  // PRIVATE METHODS - Data Collection
  // ============================================================================

  /**
   * Get processing activities from data inventory
   */
  private async getProcessingActivities(): Promise<Article30ProcessingActivity[]> {
    const { data, error } = await this.supabase
      .from(this.dataInventoryTableName)
      .select('*')
      .eq('is_active', true)
      .order('activity_name', { ascending: true });

    if (error) {
      this.logger.error({ error }, 'Failed to fetch processing activities');
      throw new Error(`Failed to fetch processing activities: ${error.message}`);
    }

    return (data as DataInventoryRow[]).map((row) => this.mapInventoryToActivity(row));
  }

  /**
   * Get consent summary for report period
   */
  private async getConsentSummary(
    periodStart: Date,
    periodEnd: Date
  ): Promise<Article30ConsentSummary[]> {
    // Query consent records grouped by type
    const { data, error } = await this.supabase
      .from(this.consentTableName)
      .select('consent_type, status, granted_at, withdrawn_at, expires_at')
      .gte('granted_at', periodStart.toISOString())
      .lte('granted_at', periodEnd.toISOString());

    if (error) {
      this.logger.warn({ error }, 'Failed to fetch consent summary, using empty data');
      return [];
    }

    const consentRows = data as ConsentRow[];
    const summaryMap = new Map<string, Article30ConsentSummary>();
    const now = new Date();

    for (const row of consentRows) {
      const existing = summaryMap.get(row.consent_type) ?? {
        consentType: row.consent_type,
        activeCount: 0,
        withdrawnCount: 0,
        expiredCount: 0,
        totalGranted: 0,
      };

      existing.totalGranted++;

      if (row.status === 'withdrawn' || row.withdrawn_at) {
        existing.withdrawnCount++;
      } else if (row.expires_at && new Date(row.expires_at) < now) {
        existing.expiredCount++;
      } else if (row.status === 'granted') {
        existing.activeCount++;
      }

      summaryMap.set(row.consent_type, existing);
    }

    return Array.from(summaryMap.values());
  }

  /**
   * Get DSR summary for report period
   */
  private async getDSRSummary(periodStart: Date, periodEnd: Date): Promise<Article30DSRSummary> {
    const { data, error } = await this.supabase
      .from(this.dsrTableName)
      .select('id, request_type, status, created_at, completed_at, due_date')
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    if (error) {
      this.logger.warn({ error }, 'Failed to fetch DSR summary, using default values');
      return this.getEmptyDSRSummary();
    }

    const dsrRows = data as DSRRow[];
    const now = new Date();

    const summary: Article30DSRSummary = {
      totalReceived: dsrRows.length,
      completed: 0,
      pending: 0,
      rejected: 0,
      overdue: 0,
      byType: {
        access: 0,
        rectification: 0,
        erasure: 0,
        restriction: 0,
        portability: 0,
        objection: 0,
      },
    };

    let totalResponseDays = 0;
    let completedCount = 0;

    for (const row of dsrRows) {
      // Count by status
      switch (row.status) {
        case 'completed':
          summary.completed++;
          if (row.completed_at && row.created_at) {
            const created = new Date(row.created_at);
            const completed = new Date(row.completed_at);
            totalResponseDays += (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
            completedCount++;
          }
          break;
        case 'rejected':
        case 'cancelled':
          summary.rejected++;
          break;
        default:
          summary.pending++;
          if (new Date(row.due_date) < now) {
            summary.overdue++;
          }
      }

      // Count by type
      const dsrType = row.request_type as keyof Article30DSRSummary['byType'];
      if (dsrType in summary.byType) {
        summary.byType[dsrType]++;
      }
    }

    if (completedCount > 0) {
      summary.averageResponseTimeDays = Math.round((totalResponseDays / completedCount) * 10) / 10;
    }

    return summary;
  }

  /**
   * Get data breach summary for report period
   */
  private async getDataBreachSummary(
    periodStart: Date,
    periodEnd: Date
  ): Promise<Article30DataBreachSummary> {
    const { data, error } = await this.supabase
      .from(this.breachTableName)
      .select('id, risk_level, reported_to_authority, notified_to_subjects')
      .gte('detected_at', periodStart.toISOString())
      .lte('detected_at', periodEnd.toISOString());

    if (error) {
      this.logger.warn({ error }, 'Failed to fetch data breach summary, using default values');
      return this.getEmptyBreachSummary();
    }

    const breachRows = data as Array<{
      id: string;
      risk_level: 'low' | 'medium' | 'high' | 'critical';
      reported_to_authority: boolean;
      notified_to_subjects: boolean;
    }>;

    const summary: Article30DataBreachSummary = {
      totalBreaches: breachRows.length,
      reportedToAuthority: 0,
      notifiedToSubjects: 0,
      byRiskLevel: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
    };

    for (const row of breachRows) {
      if (row.reported_to_authority) {
        summary.reportedToAuthority++;
      }
      if (row.notified_to_subjects) {
        summary.notifiedToSubjects++;
      }
      summary.byRiskLevel[row.risk_level]++;
    }

    return summary;
  }

  // ============================================================================
  // PRIVATE METHODS - Helpers
  // ============================================================================

  /**
   * Get next version number for a report period
   */
  private async getNextVersion(periodStart: Date, periodEnd: Date): Promise<number> {
    const { data, error } = await this.supabase
      .from(this.reportsTableName)
      .select('version')
      .gte('period_start', periodStart.toISOString())
      .lte('period_end', periodEnd.toISOString())
      .order('version', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return 1;
    }

    return (data[0] as { version: number }).version + 1;
  }

  /**
   * Store a report in the database
   */
  private async storeReport(report: Article30Report, correlationId: string): Promise<void> {
    const { error } = await this.supabase.from(this.reportsTableName).insert({
      id: report.reportId,
      version: report.version,
      title: report.title,
      period_start: report.periodStart.toISOString(),
      period_end: report.periodEnd.toISOString(),
      status: report.status,
      frequency: report.frequency ?? null,
      report_data: report,
      generated_by: report.generatedBy,
      notes: report.notes ?? null,
      metadata: { correlationId },
    });

    if (error) {
      throw new Error(`Failed to store report: ${error.message}`);
    }
  }

  /**
   * Map data inventory row to Article 30 processing activity
   */
  private mapInventoryToActivity(row: DataInventoryRow): Article30ProcessingActivity {
    return {
      activityId: row.activity_id,
      name: row.activity_name,
      description: row.description ?? '',
      purpose: row.purpose,
      legalBasis: row.legal_basis,
      legitimateInterestAssessment: row.legitimate_interest_assessment ?? undefined,
      dataCategories: row.data_categories,
      dataSubjectTypes: row.data_subject_types,
      specialCategoryData: row.sensitive_data,
      specialCategoryCondition:
        row.sensitive_data && row.special_categories
          ? row.special_categories.join(', ')
          : undefined,
      recipients: row.recipients.map((r) => ({
        name: r.name,
        type: r.type,
        purpose: r.purpose,
        country: r.country,
        isInternationalTransfer: row.transfers_outside_eu,
        transferSafeguard:
          row.transfers_outside_eu && row.transfer_safeguards
            ? (row.transfer_safeguards as Article30ProcessingActivity['recipients'][0]['transferSafeguard'])
            : undefined,
      })),
      retentionPeriod: `${row.retention_period_days} days`,
      retentionDays: row.retention_period_days,
      retentionPolicyReference: row.retention_policy_reference ?? undefined,
      securityMeasures: row.security_measures ?? [],
      encryptionAtRest: row.encryption_at_rest,
      encryptionInTransit: row.encryption_in_transit,
      transfersOutsideEU: row.transfers_outside_eu,
      transferSafeguards: row.transfer_safeguards
        ? ([row.transfer_safeguards] as Article30ProcessingActivity['transferSafeguards'])
        : undefined,
      transferCountries: row.transfer_countries ?? undefined,
      dpiaRequired: row.dpia_required,
      dpiaReference: row.dpia_reference ?? undefined,
      riskLevel: row.risk_level,
      processingSystem: row.processing_system ?? undefined,
      responsibleDepartment: row.responsible_department ?? undefined,
      isActive: row.is_active,
      lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
      reviewedBy: row.reviewed_by ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get empty DSR summary (fallback)
   */
  private getEmptyDSRSummary(): Article30DSRSummary {
    return {
      totalReceived: 0,
      completed: 0,
      pending: 0,
      rejected: 0,
      overdue: 0,
      byType: {
        access: 0,
        rectification: 0,
        erasure: 0,
        restriction: 0,
        portability: 0,
        objection: 0,
      },
    };
  }

  /**
   * Get empty breach summary (fallback)
   */
  private getEmptyBreachSummary(): Article30DataBreachSummary {
    return {
      totalBreaches: 0,
      reportedToAuthority: 0,
      notifiedToSubjects: 0,
      byRiskLevel: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
    };
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create Article 30 Report Service instance
 */
export function createArticle30ReportService(
  deps: Article30ReportServiceDeps
): Article30ReportService {
  return new Article30ReportService(deps);
}
