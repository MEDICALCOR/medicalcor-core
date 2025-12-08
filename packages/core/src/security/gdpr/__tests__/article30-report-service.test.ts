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
  const createQueryBuilder = () => {
    const builder: Record<string, unknown> = {};
    const chainMethods = ['select', 'insert', 'update', 'eq', 'gte', 'lte', 'range'];

    chainMethods.forEach((method) => {
      builder[method] = vi.fn().mockReturnValue(builder);
    });

    builder.order = vi.fn().mockReturnValue({
      ...builder,
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
    builder.limit = vi.fn().mockResolvedValue({ data: [], error: null });

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
  });
});
