/**
 * @fileoverview Article 30 Report Service Tests
 *
 * GDPR Article 30 compliance: Tests for automated Records of Processing Activities (RoPA)
 * report generation. Ensures comprehensive compliance report generation works correctly.
 *
 * @module core/security/gdpr/__tests__/article30-report-service.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Article30ReportService,
  createArticle30ReportService,
  type Article30ReportServiceDeps,
} from '../article30-report-service.js';
import type { Article30ControllerInfo } from '@medicalcor/types';
import {
  calculateReportStatistics,
  activityNeedsReview,
  getLegalBasisLabel,
  getDataCategoryLabel,
} from '@medicalcor/types';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createSampleController(
  overrides: Partial<Article30ControllerInfo> = {}
): Article30ControllerInfo {
  return {
    name: 'MedicalCor SRL',
    address: '123 Medical Street, Bucharest',
    country: 'RO',
    email: 'contact@medicalcor.com',
    dpoName: 'John DPO',
    dpoEmail: 'dpo@medicalcor.com',
    dpoPhone: '+40123456789',
    ...overrides,
  };
}

function createMockSupabase() {
  // Create a simple mock that returns empty data
  // The builder must be thenable to work with await
  const createQueryBuilder = () => {
    const defaultResult = { data: [], error: null };

    const builder: Record<string, unknown> = {
      // Make the builder thenable so it can be awaited directly
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
        resolve(defaultResult);
        return Promise.resolve(defaultResult);
      },
    };

    const chainMethods = ['select', 'insert', 'update', 'eq', 'gte', 'lte', 'range'];

    chainMethods.forEach((method) => {
      builder[method] = vi.fn().mockReturnValue(builder);
    });

    // Handle order().limit().single() chain properly
    builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
    builder.limit = vi.fn().mockReturnValue({
      ...builder,
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    builder.order = vi.fn().mockReturnValue({
      ...builder,
      limit: vi.fn().mockReturnValue({
        ...builder,
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    return builder;
  };

  return {
    from: vi.fn().mockImplementation(() => createQueryBuilder()),
  } as unknown as SupabaseClient;
}

// ============================================================================
// UNIT TESTS - Helper Functions
// ============================================================================

describe('Article 30 Helper Functions', () => {
  describe('calculateReportStatistics', () => {
    it('should calculate empty statistics for no activities', () => {
      const stats = calculateReportStatistics([]);

      expect(stats.totalActivities).toBe(0);
      expect(stats.activitiesWithTransfers).toBe(0);
      expect(stats.activitiesRequiringDPIA).toBe(0);
      expect(stats.uniqueDataCategories).toBe(0);
      expect(stats.uniqueRecipients).toBe(0);
    });

    it('should count activities correctly', () => {
      const activities = [
        {
          activityId: 'act-1',
          name: 'Activity 1',
          description: 'Test',
          purpose: 'Testing',
          legalBasis: 'consent' as const,
          dataCategories: ['personal', 'contact'] as const[],
          dataSubjectTypes: ['patients'],
          recipients: [{ name: 'Recipient 1', type: 'internal' as const, purpose: 'Test' }],
          retentionPeriod: '365 days',
          securityMeasures: ['encryption'],
          transfersOutsideEU: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          riskLevel: 'medium' as const,
          encryptionAtRest: true,
          encryptionInTransit: true,
          dpiaRequired: false,
          specialCategoryData: false,
        },
        {
          activityId: 'act-2',
          name: 'Activity 2',
          description: 'Test',
          purpose: 'Testing',
          legalBasis: 'contract' as const,
          dataCategories: ['health'] as const[],
          dataSubjectTypes: ['patients'],
          recipients: [{ name: 'Recipient 2', type: 'processor' as const, purpose: 'Test' }],
          retentionPeriod: '365 days',
          securityMeasures: ['encryption'],
          transfersOutsideEU: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          riskLevel: 'high' as const,
          encryptionAtRest: true,
          encryptionInTransit: true,
          dpiaRequired: true,
          specialCategoryData: true,
        },
      ];

      const stats = calculateReportStatistics(activities);

      expect(stats.totalActivities).toBe(2);
      expect(stats.activitiesWithTransfers).toBe(1);
      expect(stats.activitiesRequiringDPIA).toBe(1);
      expect(stats.activitiesWithSpecialCategory).toBe(1);
      expect(stats.uniqueDataCategories).toBe(3); // personal, contact, health
      expect(stats.uniqueRecipients).toBe(2);
    });

    it('should count activities by legal basis', () => {
      const activities = [
        {
          activityId: 'act-1',
          name: 'Activity 1',
          description: '',
          purpose: 'Test',
          legalBasis: 'consent' as const,
          dataCategories: ['personal'] as const[],
          dataSubjectTypes: [],
          recipients: [],
          retentionPeriod: '365 days',
          securityMeasures: [],
          transfersOutsideEU: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          riskLevel: 'low' as const,
          encryptionAtRest: true,
          encryptionInTransit: true,
          dpiaRequired: false,
          specialCategoryData: false,
        },
        {
          activityId: 'act-2',
          name: 'Activity 2',
          description: '',
          purpose: 'Test',
          legalBasis: 'consent' as const,
          dataCategories: ['personal'] as const[],
          dataSubjectTypes: [],
          recipients: [],
          retentionPeriod: '365 days',
          securityMeasures: [],
          transfersOutsideEU: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          riskLevel: 'low' as const,
          encryptionAtRest: true,
          encryptionInTransit: true,
          dpiaRequired: false,
          specialCategoryData: false,
        },
        {
          activityId: 'act-3',
          name: 'Activity 3',
          description: '',
          purpose: 'Test',
          legalBasis: 'contract' as const,
          dataCategories: ['personal'] as const[],
          dataSubjectTypes: [],
          recipients: [],
          retentionPeriod: '365 days',
          securityMeasures: [],
          transfersOutsideEU: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          riskLevel: 'low' as const,
          encryptionAtRest: true,
          encryptionInTransit: true,
          dpiaRequired: false,
          specialCategoryData: false,
        },
      ];

      const stats = calculateReportStatistics(activities);

      expect(stats.activitiesByLegalBasis['consent']).toBe(2);
      expect(stats.activitiesByLegalBasis['contract']).toBe(1);
    });

    it('should exclude inactive activities', () => {
      const activities = [
        {
          activityId: 'act-1',
          name: 'Active',
          description: '',
          purpose: 'Test',
          legalBasis: 'consent' as const,
          dataCategories: ['personal'] as const[],
          dataSubjectTypes: [],
          recipients: [],
          retentionPeriod: '365 days',
          securityMeasures: [],
          transfersOutsideEU: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          riskLevel: 'low' as const,
          encryptionAtRest: true,
          encryptionInTransit: true,
          dpiaRequired: false,
          specialCategoryData: false,
        },
        {
          activityId: 'act-2',
          name: 'Inactive',
          description: '',
          purpose: 'Test',
          legalBasis: 'consent' as const,
          dataCategories: ['personal'] as const[],
          dataSubjectTypes: [],
          recipients: [],
          retentionPeriod: '365 days',
          securityMeasures: [],
          transfersOutsideEU: false,
          isActive: false, // Inactive
          createdAt: new Date(),
          updatedAt: new Date(),
          riskLevel: 'low' as const,
          encryptionAtRest: true,
          encryptionInTransit: true,
          dpiaRequired: false,
          specialCategoryData: false,
        },
      ];

      const stats = calculateReportStatistics(activities);

      expect(stats.totalActivities).toBe(1);
    });
  });

  describe('activityNeedsReview', () => {
    it('should return true for activity never reviewed', () => {
      const activity = {
        activityId: 'act-1',
        name: 'Test',
        description: '',
        purpose: 'Test',
        legalBasis: 'consent' as const,
        dataCategories: ['personal'] as const[],
        dataSubjectTypes: [],
        recipients: [],
        retentionPeriod: '365 days',
        securityMeasures: [],
        transfersOutsideEU: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskLevel: 'low' as const,
        encryptionAtRest: true,
        encryptionInTransit: true,
        dpiaRequired: false,
        specialCategoryData: false,
        lastReviewedAt: undefined,
      };

      expect(activityNeedsReview(activity)).toBe(true);
    });

    it('should return true for activity reviewed over 12 months ago', () => {
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 13);

      const activity = {
        activityId: 'act-1',
        name: 'Test',
        description: '',
        purpose: 'Test',
        legalBasis: 'consent' as const,
        dataCategories: ['personal'] as const[],
        dataSubjectTypes: [],
        recipients: [],
        retentionPeriod: '365 days',
        securityMeasures: [],
        transfersOutsideEU: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskLevel: 'low' as const,
        encryptionAtRest: true,
        encryptionInTransit: true,
        dpiaRequired: false,
        specialCategoryData: false,
        lastReviewedAt: oldDate,
      };

      expect(activityNeedsReview(activity)).toBe(true);
    });

    it('should return false for recently reviewed activity', () => {
      const recentDate = new Date();
      recentDate.setMonth(recentDate.getMonth() - 6);

      const activity = {
        activityId: 'act-1',
        name: 'Test',
        description: '',
        purpose: 'Test',
        legalBasis: 'consent' as const,
        dataCategories: ['personal'] as const[],
        dataSubjectTypes: [],
        recipients: [],
        retentionPeriod: '365 days',
        securityMeasures: [],
        transfersOutsideEU: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        riskLevel: 'low' as const,
        encryptionAtRest: true,
        encryptionInTransit: true,
        dpiaRequired: false,
        specialCategoryData: false,
        lastReviewedAt: recentDate,
      };

      expect(activityNeedsReview(activity)).toBe(false);
    });
  });

  describe('getLegalBasisLabel', () => {
    it('should return correct label for consent', () => {
      expect(getLegalBasisLabel('consent')).toBe('Consent (Art. 6(1)(a))');
    });

    it('should return correct label for contract', () => {
      expect(getLegalBasisLabel('contract')).toBe('Contract Performance (Art. 6(1)(b))');
    });

    it('should return correct label for legal_obligation', () => {
      expect(getLegalBasisLabel('legal_obligation')).toBe('Legal Obligation (Art. 6(1)(c))');
    });

    it('should return correct label for vital_interests', () => {
      expect(getLegalBasisLabel('vital_interests')).toBe('Vital Interests (Art. 6(1)(d))');
    });

    it('should return correct label for public_task', () => {
      expect(getLegalBasisLabel('public_task')).toBe('Public Task (Art. 6(1)(e))');
    });

    it('should return correct label for legitimate_interests', () => {
      expect(getLegalBasisLabel('legitimate_interests')).toBe(
        'Legitimate Interests (Art. 6(1)(f))'
      );
    });
  });

  describe('getDataCategoryLabel', () => {
    it('should return correct label for health data', () => {
      expect(getDataCategoryLabel('health')).toBe('Health Data');
    });

    it('should return correct label for personal data', () => {
      expect(getDataCategoryLabel('personal')).toBe('Personal Data');
    });

    it('should return correct label for contact data', () => {
      expect(getDataCategoryLabel('contact')).toBe('Contact Information');
    });

    it('should return correct label for financial data', () => {
      expect(getDataCategoryLabel('financial')).toBe('Financial Data');
    });
  });
});

// ============================================================================
// INTEGRATION TESTS - Service
// ============================================================================

describe('Article30ReportService', () => {
  let supabase: SupabaseClient;
  let service: Article30ReportService;
  let controller: Article30ControllerInfo;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    supabase = createMockSupabase();
    controller = createSampleController();
    service = new Article30ReportService({
      supabase,
      controller,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Factory Function', () => {
    it('should create service with createArticle30ReportService factory', () => {
      const svc = createArticle30ReportService({
        supabase,
        controller,
      });
      expect(svc).toBeInstanceOf(Article30ReportService);
    });

    it('should accept optional logger', () => {
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };

      const svc = createArticle30ReportService({
        supabase,
        controller,
        logger: mockLogger as unknown as Article30ReportServiceDeps['logger'],
      });
      expect(svc).toBeInstanceOf(Article30ReportService);
    });
  });

  describe('generateReport', () => {
    it('should generate a report with controller info', async () => {
      const report = await service.generateReport({});

      expect(report.reportId).toBeDefined();
      expect(report.controller.name).toBe('MedicalCor SRL');
      expect(report.controller.email).toBe('contact@medicalcor.com');
      expect(report.status).toBe('draft');
    });

    it('should use default period when not specified', async () => {
      const report = await service.generateReport({});

      expect(report.periodStart).toBeDefined();
      expect(report.periodEnd).toBeDefined();
    });

    it('should use custom period when specified', async () => {
      const periodStart = new Date('2024-01-01');
      const periodEnd = new Date('2024-03-31');

      const report = await service.generateReport({
        periodStart,
        periodEnd,
      });

      expect(report.periodStart).toEqual(periodStart);
      expect(report.periodEnd).toEqual(periodEnd);
    });

    it('should set custom title when provided', async () => {
      const report = await service.generateReport({
        title: 'Custom Report Title',
      });

      expect(report.title).toBe('Custom Report Title');
    });

    it('should set frequency when provided', async () => {
      const report = await service.generateReport({
        frequency: 'quarterly',
      });

      expect(report.frequency).toBe('quarterly');
    });

    it('should include notes when provided', async () => {
      const report = await service.generateReport({
        notes: 'Test notes',
      });

      expect(report.notes).toBe('Test notes');
    });

    it('should have statistics object', async () => {
      const report = await service.generateReport({});

      expect(report.statistics).toBeDefined();
      expect(report.statistics.totalActivities).toBeDefined();
      expect(report.statistics.activitiesByLegalBasis).toBeDefined();
      expect(report.statistics.activitiesByRiskLevel).toBeDefined();
    });
  });

  describe('getReport', () => {
    it('should return null when report not found', async () => {
      const result = await service.getReport('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('getLatestReport', () => {
    it('should return null when no reports exist', async () => {
      const result = await service.getLatestReport();
      expect(result).toBeNull();
    });
  });

  describe('listReports', () => {
    it('should return empty list when no reports', async () => {
      // Mock the range method to return expected structure with count
      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
        eq: vi.fn().mockReturnThis(),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.listReports();

      expect(result.reports).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('exportToJSON', () => {
    it('should throw error when report not found', async () => {
      await expect(service.exportToJSON('nonexistent-id')).rejects.toThrow(
        'Report not found: nonexistent-id'
      );
    });

    it('should return JSON string when report exists', async () => {
      // Create a mock builder that returns a report
      const mockReport = {
        reportId: 'test-report-123',
        version: 1,
        title: 'Test Report',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-06-30'),
        generatedAt: new Date('2024-06-15'),
        generatedBy: 'system',
        status: 'draft' as const,
        controller: controller,
        processingActivities: [],
        statistics: {
          totalActivities: 0,
          activitiesWithTransfers: 0,
          activitiesRequiringDPIA: 0,
          activitiesWithSpecialCategory: 0,
          uniqueDataCategories: 0,
          uniqueRecipients: 0,
          activitiesByLegalBasis: {},
          activitiesByRiskLevel: {},
        },
      };

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { report_data: mockReport },
          error: null,
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.exportToJSON('test-report-123');

      expect(result).toContain('test-report-123');
      expect(JSON.parse(result)).toHaveProperty('reportId', 'test-report-123');
    });
  });

  describe('approveReport', () => {
    it('should throw error when report not found', async () => {
      await expect(service.approveReport('nonexistent-id', 'approver')).rejects.toThrow(
        'Report not found: nonexistent-id'
      );
    });

    it('should throw error when report is not in approvable status', async () => {
      // Mock returning a report with 'published' status
      const mockReport = {
        reportId: 'test-report-123',
        version: 1,
        title: 'Test Report',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-06-30'),
        generatedAt: new Date('2024-06-15'),
        generatedBy: 'system',
        status: 'published' as const,
        controller: controller,
        processingActivities: [],
        statistics: {
          totalActivities: 0,
          activitiesWithTransfers: 0,
          activitiesRequiringDPIA: 0,
          activitiesWithSpecialCategory: 0,
          uniqueDataCategories: 0,
          uniqueRecipients: 0,
          activitiesByLegalBasis: {},
          activitiesByRiskLevel: {},
        },
      };

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { report_data: mockReport },
          error: null,
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.approveReport('test-report-123', 'approver')).rejects.toThrow(
        'Report cannot be approved in status: published'
      );
    });

    it('should throw error when database update fails', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        version: 1,
        title: 'Test Report',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-06-30'),
        generatedAt: new Date('2024-06-15'),
        generatedBy: 'system',
        status: 'draft' as const,
        controller: controller,
        processingActivities: [],
        statistics: {
          totalActivities: 0,
          activitiesWithTransfers: 0,
          activitiesRequiringDPIA: 0,
          activitiesWithSpecialCategory: 0,
          uniqueDataCategories: 0,
          uniqueRecipients: 0,
          activitiesByLegalBasis: {},
          activitiesByRiskLevel: {},
        },
      };

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call for getReport
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { report_data: mockReport },
              error: null,
            }),
          };
        }
        // Second call for update
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        };
      });

      await expect(
        service.approveReport('test-report-123', 'approver', 'Looks good')
      ).rejects.toThrow('Failed to approve report: Database error');
    });

    it('should approve report with pending_review status', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        version: 1,
        title: 'Test Report',
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-06-30'),
        generatedAt: new Date('2024-06-15'),
        generatedBy: 'system',
        status: 'pending_review' as const,
        controller: controller,
        processingActivities: [],
        statistics: {
          totalActivities: 0,
          activitiesWithTransfers: 0,
          activitiesRequiringDPIA: 0,
          activitiesWithSpecialCategory: 0,
          uniqueDataCategories: 0,
          uniqueRecipients: 0,
          activitiesByLegalBasis: {},
          activitiesByRiskLevel: {},
        },
      };

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { report_data: mockReport },
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const result = await service.approveReport('test-report-123', 'approver', 'LGTM');

      expect(result.status).toBe('approved');
      expect(result.approval?.approvedBy).toBe('approver');
      expect(result.approval?.comments).toBe('LGTM');
    });
  });

  describe('submitForReview', () => {
    it('should throw error when report not found', async () => {
      await expect(service.submitForReview('nonexistent-id')).rejects.toThrow(
        'Report not found: nonexistent-id'
      );
    });

    it('should throw error when report is not in draft status', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        status: 'approved' as const,
        controller: controller,
        processingActivities: [],
        statistics: {},
      };

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { report_data: mockReport },
          error: null,
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.submitForReview('test-report-123')).rejects.toThrow(
        'Report cannot be submitted for review in status: approved'
      );
    });

    it('should throw error when database update fails', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        status: 'draft' as const,
        controller: controller,
        processingActivities: [],
        statistics: {},
      };

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { report_data: mockReport },
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Update failed' },
          }),
        };
      });

      await expect(service.submitForReview('test-report-123')).rejects.toThrow(
        'Failed to submit report for review: Update failed'
      );
    });

    it('should submit draft report for review successfully', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        status: 'draft' as const,
        controller: controller,
        processingActivities: [],
        statistics: {},
      };

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { report_data: mockReport },
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const result = await service.submitForReview('test-report-123');

      expect(result.status).toBe('pending_review');
    });
  });

  describe('publishReport', () => {
    it('should throw error when report not found', async () => {
      await expect(service.publishReport('nonexistent-id')).rejects.toThrow(
        'Report not found: nonexistent-id'
      );
    });

    it('should throw error when report is not approved', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        status: 'draft' as const,
        controller: controller,
        processingActivities: [],
        statistics: {},
      };

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { report_data: mockReport },
          error: null,
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.publishReport('test-report-123')).rejects.toThrow(
        'Only approved reports can be published. Current status: draft'
      );
    });

    it('should throw error when database update fails', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        status: 'approved' as const,
        controller: controller,
        processingActivities: [],
        statistics: {},
      };

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { report_data: mockReport },
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Publish failed' },
          }),
        };
      });

      await expect(service.publishReport('test-report-123')).rejects.toThrow(
        'Failed to publish report: Publish failed'
      );
    });

    it('should publish approved report successfully', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        status: 'approved' as const,
        controller: controller,
        processingActivities: [],
        statistics: {},
      };

      let callCount = 0;
      supabase.from = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { report_data: mockReport },
              error: null,
            }),
          };
        }
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });

      const result = await service.publishReport('test-report-123');

      expect(result.status).toBe('published');
    });
  });

  describe('archiveReport', () => {
    it('should throw error when database update fails', async () => {
      const mockBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Archive failed' },
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.archiveReport('test-report-123')).rejects.toThrow(
        'Failed to archive report: Archive failed'
      );
    });

    it('should archive report successfully', async () => {
      const mockBuilder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.archiveReport('test-report-123')).resolves.toBeUndefined();
    });
  });

  describe('listReports', () => {
    it('should filter by status when provided', async () => {
      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await service.listReports({ status: 'approved', limit: 20, offset: 10 });

      expect(mockBuilder.eq).toHaveBeenCalledWith('status', 'approved');
    });

    it('should throw error when database query fails', async () => {
      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({
          data: null,
          count: null,
          error: { message: 'Query failed' },
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      await expect(service.listReports()).rejects.toThrow('Failed to list reports: Query failed');
    });

    it('should return reports with correct pagination', async () => {
      const mockReports = [
        { report_data: { reportId: 'report-1', title: 'Report 1' } },
        { report_data: { reportId: 'report-2', title: 'Report 2' } },
      ];

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockResolvedValue({ data: mockReports, count: 5, error: null }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.listReports({ limit: 2, offset: 0 });

      expect(result.reports).toHaveLength(2);
      expect(result.total).toBe(5);
    });
  });

  describe('getReport with data', () => {
    it('should return report data when found', async () => {
      const mockReport = {
        reportId: 'test-report-123',
        title: 'Found Report',
        status: 'draft' as const,
      };

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { report_data: mockReport },
          error: null,
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getReport('test-report-123');

      expect(result).toEqual(mockReport);
    });
  });

  describe('getLatestReport with data', () => {
    it('should return latest report when found', async () => {
      const mockReport = {
        reportId: 'latest-report',
        title: 'Latest Report',
        status: 'published' as const,
      };

      const mockBuilder = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { report_data: mockReport },
          error: null,
        }),
      };
      supabase.from = vi.fn().mockReturnValue(mockBuilder);

      const result = await service.getLatestReport();

      expect(result).toEqual(mockReport);
    });
  });

  describe('generateReport with optional flags', () => {
    it('should exclude consent summary when includeConsentSummary is false', async () => {
      const report = await service.generateReport({
        includeConsentSummary: false,
      });

      expect(report.consentSummary).toEqual([]);
    });

    it('should exclude DSR summary when includeDSRSummary is false', async () => {
      const report = await service.generateReport({
        includeDSRSummary: false,
      });

      expect(report.dsrSummary).toBeUndefined();
    });

    it('should exclude data breaches when includeDataBreaches is false', async () => {
      const report = await service.generateReport({
        includeDataBreaches: false,
      });

      expect(report.dataBreachSummary).toBeUndefined();
    });
  });
});

// ============================================================================
// CONSENT SUMMARY BRANCH COVERAGE TESTS
// ============================================================================

describe('Article30ReportService - Consent Summary Branches', () => {
  let supabase: SupabaseClient;
  let service: Article30ReportService;
  let controller: Article30ControllerInfo;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    supabase = createMockSupabase();
    controller = createSampleController();
    service = new Article30ReportService({
      supabase,
      controller,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle consent records with withdrawn status', async () => {
    const mockConsentRows = [
      {
        consent_type: 'marketing',
        status: 'withdrawn',
        granted_at: '2024-01-15T10:00:00Z',
        withdrawn_at: '2024-03-15T10:00:00Z',
        expires_at: null,
      },
      {
        consent_type: 'marketing',
        status: 'granted',
        granted_at: '2024-02-01T10:00:00Z',
        withdrawn_at: null,
        expires_at: null,
      },
    ];

    let tableCallCount = 0;
    supabase.from = vi.fn().mockImplementation((table: string) => {
      tableCallCount++;
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: mockConsentRows, error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    expect(report.consentSummary).toBeDefined();
    const marketingSummary = report.consentSummary?.find((s) => s.consentType === 'marketing');
    expect(marketingSummary?.withdrawnCount).toBe(1);
    expect(marketingSummary?.activeCount).toBe(1);
    expect(marketingSummary?.totalGranted).toBe(2);
  });

  it('should handle consent records with expired status', async () => {
    const mockConsentRows = [
      {
        consent_type: 'treatment',
        status: 'granted',
        granted_at: '2024-01-15T10:00:00Z',
        withdrawn_at: null,
        expires_at: '2024-05-01T10:00:00Z', // Expired before current time
      },
      {
        consent_type: 'treatment',
        status: 'granted',
        granted_at: '2024-02-01T10:00:00Z',
        withdrawn_at: null,
        expires_at: '2024-12-01T10:00:00Z', // Not expired
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: mockConsentRows, error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    expect(report.consentSummary).toBeDefined();
    const treatmentSummary = report.consentSummary?.find((s) => s.consentType === 'treatment');
    expect(treatmentSummary?.expiredCount).toBe(1);
    expect(treatmentSummary?.activeCount).toBe(1);
  });

  it('should handle consent records with withdrawn_at set but different status', async () => {
    const mockConsentRows = [
      {
        consent_type: 'data_sharing',
        status: 'granted', // Status says granted but withdrawn_at is set
        granted_at: '2024-01-15T10:00:00Z',
        withdrawn_at: '2024-04-15T10:00:00Z',
        expires_at: null,
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: mockConsentRows, error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    const summary = report.consentSummary?.find((s) => s.consentType === 'data_sharing');
    // Should be counted as withdrawn because withdrawn_at is set
    expect(summary?.withdrawnCount).toBe(1);
  });

  it('should handle consent fetch error gracefully', async () => {
    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Consent fetch failed' },
          }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    // Should return empty array on error
    expect(report.consentSummary).toEqual([]);
  });
});

// ============================================================================
// DSR SUMMARY BRANCH COVERAGE TESTS
// ============================================================================

describe('Article30ReportService - DSR Summary Branches', () => {
  let supabase: SupabaseClient;
  let service: Article30ReportService;
  let controller: Article30ControllerInfo;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    supabase = createMockSupabase();
    controller = createSampleController();
    service = new Article30ReportService({
      supabase,
      controller,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should count completed DSRs with response time', async () => {
    const mockDSRRows = [
      {
        id: 'dsr-1',
        request_type: 'access',
        status: 'completed',
        created_at: '2024-01-15T10:00:00Z',
        completed_at: '2024-01-25T10:00:00Z', // 10 days
        due_date: '2024-02-14T10:00:00Z',
      },
      {
        id: 'dsr-2',
        request_type: 'erasure',
        status: 'completed',
        created_at: '2024-02-01T10:00:00Z',
        completed_at: '2024-02-11T10:00:00Z', // 10 days
        due_date: '2024-03-02T10:00:00Z',
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: mockDSRRows, error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    expect(report.dsrSummary).toBeDefined();
    expect(report.dsrSummary?.completed).toBe(2);
    expect(report.dsrSummary?.averageResponseTimeDays).toBe(10);
    expect(report.dsrSummary?.byType.access).toBe(1);
    expect(report.dsrSummary?.byType.erasure).toBe(1);
  });

  it('should handle rejected and cancelled DSRs', async () => {
    const mockDSRRows = [
      {
        id: 'dsr-1',
        request_type: 'access',
        status: 'rejected',
        created_at: '2024-01-15T10:00:00Z',
        completed_at: null,
        due_date: '2024-02-14T10:00:00Z',
      },
      {
        id: 'dsr-2',
        request_type: 'portability',
        status: 'cancelled',
        created_at: '2024-02-01T10:00:00Z',
        completed_at: null,
        due_date: '2024-03-02T10:00:00Z',
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: mockDSRRows, error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    expect(report.dsrSummary?.rejected).toBe(2); // Both rejected and cancelled count as rejected
    expect(report.dsrSummary?.pending).toBe(0);
  });

  it('should count pending and overdue DSRs', async () => {
    const mockDSRRows = [
      {
        id: 'dsr-1',
        request_type: 'rectification',
        status: 'in_progress',
        created_at: '2024-01-15T10:00:00Z',
        completed_at: null,
        due_date: '2024-05-01T10:00:00Z', // Past due date
      },
      {
        id: 'dsr-2',
        request_type: 'restriction',
        status: 'pending_verification',
        created_at: '2024-06-01T10:00:00Z',
        completed_at: null,
        due_date: '2024-07-01T10:00:00Z', // Not overdue
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: mockDSRRows, error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    expect(report.dsrSummary?.pending).toBe(2);
    expect(report.dsrSummary?.overdue).toBe(1);
    expect(report.dsrSummary?.byType.rectification).toBe(1);
    expect(report.dsrSummary?.byType.restriction).toBe(1);
  });

  it('should handle DSR with objection type', async () => {
    const mockDSRRows = [
      {
        id: 'dsr-1',
        request_type: 'objection',
        status: 'completed',
        created_at: '2024-03-01T10:00:00Z',
        completed_at: '2024-03-15T10:00:00Z',
        due_date: '2024-03-31T10:00:00Z',
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: mockDSRRows, error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    expect(report.dsrSummary?.byType.objection).toBe(1);
  });
});

// ============================================================================
// DATA BREACH SUMMARY BRANCH COVERAGE TESTS
// ============================================================================

describe('Article30ReportService - Data Breach Summary Branches', () => {
  let supabase: SupabaseClient;
  let service: Article30ReportService;
  let controller: Article30ControllerInfo;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    supabase = createMockSupabase();
    controller = createSampleController();
    service = new Article30ReportService({
      supabase,
      controller,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should count breaches by risk level', async () => {
    const mockBreachRows = [
      {
        id: 'breach-1',
        risk_level: 'low',
        reported_to_authority: false,
        notified_to_subjects: false,
      },
      {
        id: 'breach-2',
        risk_level: 'medium',
        reported_to_authority: true,
        notified_to_subjects: false,
      },
      {
        id: 'breach-3',
        risk_level: 'high',
        reported_to_authority: true,
        notified_to_subjects: true,
      },
      {
        id: 'breach-4',
        risk_level: 'critical',
        reported_to_authority: true,
        notified_to_subjects: true,
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: mockBreachRows, error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    expect(report.dataBreachSummary).toBeDefined();
    expect(report.dataBreachSummary?.totalBreaches).toBe(4);
    expect(report.dataBreachSummary?.reportedToAuthority).toBe(3);
    expect(report.dataBreachSummary?.notifiedToSubjects).toBe(2);
    expect(report.dataBreachSummary?.byRiskLevel.low).toBe(1);
    expect(report.dataBreachSummary?.byRiskLevel.medium).toBe(1);
    expect(report.dataBreachSummary?.byRiskLevel.high).toBe(1);
    expect(report.dataBreachSummary?.byRiskLevel.critical).toBe(1);
  });

  it('should handle data breach fetch error gracefully', async () => {
    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Breach fetch failed' },
          }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    // Should return empty summary on error
    expect(report.dataBreachSummary?.totalBreaches).toBe(0);
    expect(report.dataBreachSummary?.byRiskLevel.low).toBe(0);
    expect(report.dataBreachSummary?.byRiskLevel.medium).toBe(0);
    expect(report.dataBreachSummary?.byRiskLevel.high).toBe(0);
    expect(report.dataBreachSummary?.byRiskLevel.critical).toBe(0);
  });
});

// ============================================================================
// PROCESSING ACTIVITIES MAPPING TESTS
// ============================================================================

describe('Article30ReportService - Processing Activities Mapping', () => {
  let supabase: SupabaseClient;
  let service: Article30ReportService;
  let controller: Article30ControllerInfo;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
    supabase = createMockSupabase();
    controller = createSampleController();
    service = new Article30ReportService({
      supabase,
      controller,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should map processing activities with all fields', async () => {
    const mockActivityRows = [
      {
        id: 'inv-1',
        activity_id: 'act-001',
        activity_name: 'Patient Records Processing',
        description: 'Processing of patient health records',
        purpose: 'Healthcare provision',
        legal_basis: 'contract',
        legitimate_interest_assessment: null,
        data_categories: ['health', 'personal'],
        data_subject_types: ['patients'],
        sensitive_data: true,
        special_categories: ['health_data', 'genetic_data'],
        storage_location: 'EU-West',
        retention_period_days: 730,
        retention_policy_reference: 'POL-001',
        recipients: [{ name: 'Lab Partner', type: 'processor', purpose: 'Testing', country: 'RO' }],
        transfers_outside_eu: true,
        transfer_safeguards: 'standard_contractual_clauses',
        transfer_countries: ['US', 'UK'],
        security_measures: ['encryption', 'access_control'],
        encryption_at_rest: true,
        encryption_in_transit: true,
        dpia_required: true,
        dpia_reference: 'DPIA-001',
        risk_level: 'high',
        processing_system: 'CRM System',
        responsible_department: 'Medical Records',
        is_active: true,
        last_reviewed_at: '2024-01-15T10:00:00Z',
        reviewed_by: 'dpo@clinic.com',
        created_at: '2023-01-01T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockActivityRows, error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    expect(report.processingActivities).toHaveLength(1);
    const activity = report.processingActivities[0];
    expect(activity.activityId).toBe('act-001');
    expect(activity.name).toBe('Patient Records Processing');
    expect(activity.specialCategoryData).toBe(true);
    expect(activity.specialCategoryCondition).toBe('health_data, genetic_data');
    expect(activity.transfersOutsideEU).toBe(true);
    expect(activity.transferSafeguards).toContain('standard_contractual_clauses');
    expect(activity.transferCountries).toEqual(['US', 'UK']);
    expect(activity.dpiaRequired).toBe(true);
    expect(activity.dpiaReference).toBe('DPIA-001');
    expect(activity.recipients[0].isInternationalTransfer).toBe(true);
    expect(activity.recipients[0].transferSafeguard).toBe('standard_contractual_clauses');
  });

  it('should handle activity without sensitive data or transfers', async () => {
    const mockActivityRows = [
      {
        id: 'inv-2',
        activity_id: 'act-002',
        activity_name: 'Newsletter Subscription',
        description: null,
        purpose: 'Marketing',
        legal_basis: 'consent',
        legitimate_interest_assessment: null,
        data_categories: ['contact'],
        data_subject_types: ['subscribers'],
        sensitive_data: false,
        special_categories: null,
        storage_location: null,
        retention_period_days: 365,
        retention_policy_reference: null,
        recipients: [],
        transfers_outside_eu: false,
        transfer_safeguards: null,
        transfer_countries: null,
        security_measures: null,
        encryption_at_rest: false,
        encryption_in_transit: true,
        dpia_required: false,
        dpia_reference: null,
        risk_level: 'low',
        processing_system: null,
        responsible_department: null,
        is_active: true,
        last_reviewed_at: null,
        reviewed_by: null,
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z',
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockActivityRows, error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    const activity = report.processingActivities[0];
    expect(activity.description).toBe('');
    expect(activity.specialCategoryData).toBe(false);
    expect(activity.specialCategoryCondition).toBeUndefined();
    expect(activity.transfersOutsideEU).toBe(false);
    expect(activity.transferSafeguards).toBeUndefined();
    expect(activity.transferCountries).toBeUndefined();
    expect(activity.dpiaReference).toBeUndefined();
    expect(activity.securityMeasures).toEqual([]);
    expect(activity.processingSystem).toBeUndefined();
    expect(activity.responsibleDepartment).toBeUndefined();
    expect(activity.lastReviewedAt).toBeUndefined();
    expect(activity.reviewedBy).toBeUndefined();
    expect(activity.retentionPolicyReference).toBeUndefined();
  });

  it('should handle legitimate interest with assessment', async () => {
    const mockActivityRows = [
      {
        id: 'inv-3',
        activity_id: 'act-003',
        activity_name: 'Fraud Prevention',
        description: 'Detecting fraudulent activities',
        purpose: 'Security',
        legal_basis: 'legitimate_interests',
        legitimate_interest_assessment: 'Necessary to protect business and customers from fraud',
        data_categories: ['behavioral'],
        data_subject_types: ['users'],
        sensitive_data: false,
        special_categories: null,
        storage_location: 'EU',
        retention_period_days: 180,
        retention_policy_reference: null,
        recipients: [],
        transfers_outside_eu: false,
        transfer_safeguards: null,
        transfer_countries: null,
        security_measures: ['encryption'],
        encryption_at_rest: true,
        encryption_in_transit: true,
        dpia_required: false,
        dpia_reference: null,
        risk_level: 'medium',
        processing_system: 'Fraud Detection System',
        responsible_department: 'Security',
        is_active: true,
        last_reviewed_at: '2024-03-01T10:00:00Z',
        reviewed_by: 'security@clinic.com',
        created_at: '2023-06-01T10:00:00Z',
        updated_at: '2024-03-01T10:00:00Z',
      },
    ];

    supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'gdpr_data_inventory') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockActivityRows, error: null }),
        };
      }
      if (table === 'consent_records') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_subject_requests') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'data_breaches') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'gdpr_article30_reports') {
        return {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return createMockSupabase().from(table);
    });

    const report = await service.generateReport({});

    const activity = report.processingActivities[0];
    expect(activity.legalBasis).toBe('legitimate_interests');
    expect(activity.legitimateInterestAssessment).toBe(
      'Necessary to protect business and customers from fraud'
    );
  });
});
