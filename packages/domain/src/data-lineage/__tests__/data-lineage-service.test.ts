/**
 * Tests for DataLineageService
 *
 * Covers:
 * - Service construction (in-memory and postgres store)
 * - Lineage tracking operations
 * - Graph operations
 * - Compliance operations
 * - Debugging operations
 * - Dashboard data retrieval
 * - Lifecycle methods
 * - Property-based testing with fast-check
 * - Error handling and edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  DataLineageService,
  createDataLineageService,
  type DataLineageServiceDependencies,
  type AggregateRef,
  type LineageDashboard,
} from '../data-lineage-service.js';

// Mock the core module
vi.mock('@medicalcor/core', () => {
  const mockStore = {
    query: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
    save: vi.fn().mockResolvedValue(undefined),
    getByAggregateId: vi.fn().mockResolvedValue([]),
  };

  const mockTracker = {
    trackScoring: vi.fn().mockResolvedValue({
      id: 'lineage-1',
      aggregateId: 'agg-1',
      aggregateType: 'Lead',
      transformationType: 'scoring',
      timestamp: new Date(),
      sources: [],
      quality: { confidence: 0.9 },
    }),
    trackEnrichment: vi.fn().mockResolvedValue({
      id: 'lineage-2',
      aggregateId: 'agg-1',
      aggregateType: 'Lead',
      transformationType: 'enrichment',
      timestamp: new Date(),
      sources: [],
      quality: { confidence: 0.85 },
    }),
    trackPatternDetection: vi.fn().mockResolvedValue({
      id: 'lineage-3',
      aggregateId: 'agg-1',
      aggregateType: 'Lead',
      transformationType: 'pattern_detection',
      timestamp: new Date(),
      sources: [],
    }),
    trackConsentProcessing: vi.fn().mockResolvedValue({
      id: 'lineage-4',
      aggregateId: 'agg-1',
      aggregateType: 'Patient',
      transformationType: 'consent_processing',
      timestamp: new Date(),
      sources: [],
    }),
    flushBatch: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };

  const mockGraphBuilder = {
    buildUpstreamGraph: vi.fn().mockResolvedValue({
      nodes: [],
      edges: [],
      rootNodeId: 'root',
    }),
    buildDownstreamGraph: vi.fn().mockResolvedValue({
      nodes: [],
      edges: [],
      rootNodeId: 'root',
    }),
    buildFullGraph: vi.fn().mockResolvedValue({
      nodes: [],
      edges: [],
      rootNodeId: 'root',
    }),
    analyzeImpact: vi.fn().mockResolvedValue({
      affectedAggregates: [],
      totalImpactScore: 0,
      criticalPaths: [],
    }),
  };

  const mockCompliance = {
    generateComplianceReport: vi.fn().mockResolvedValue({
      framework: 'HIPAA',
      period: { start: new Date(), end: new Date() },
      findings: [],
      score: 95,
    }),
    generateDSARReport: vi.fn().mockResolvedValue({
      subjectId: 'patient-1',
      requestType: 'access',
      dataCategories: [],
      processingActivities: [],
    }),
    assessLawfulness: vi.fn().mockResolvedValue({
      isLawful: true,
      legalBases: ['consent'],
      assessment: 'Processing is lawful',
    }),
    generateHIPAAAuditTrail: vi.fn().mockResolvedValue([]),
    checkMinimumNecessary: vi.fn().mockResolvedValue({
      isCompliant: true,
      issues: [],
      accessPatterns: [],
    }),
    getErasureScope: vi.fn().mockResolvedValue({
      primaryData: { aggregateId: 'agg-1', aggregateType: 'Patient' },
      derivedData: [],
      retainedData: [],
      totalAffectedCount: 1,
    }),
    deleteLineage: vi.fn().mockResolvedValue(5),
  };

  const mockDebug = {
    investigateAggregate: vi.fn().mockResolvedValue({
      aggregateId: 'agg-1',
      timeline: [],
      anomalies: [],
    }),
    investigateEvent: vi.fn().mockResolvedValue({
      eventId: 'event-1',
      relatedAggregates: [],
      timeline: [],
    }),
    investigateCorrelation: vi.fn().mockResolvedValue({
      correlationId: 'corr-1',
      trace: [],
      duration: 100,
    }),
    performHealthCheck: vi.fn().mockResolvedValue({
      status: 'healthy',
      latency: 10,
      entryCount: 100,
      lastEntry: new Date(),
    }),
  };

  const mockSystem = {
    store: mockStore,
    tracker: mockTracker,
    graphBuilder: mockGraphBuilder,
    compliance: mockCompliance,
    debug: mockDebug,
  };

  return {
    createDataLineageSystem: vi.fn().mockReturnValue(mockSystem),
    createPostgresLineageStore: vi.fn().mockReturnValue(mockStore),
    createInMemoryLineageStore: vi.fn().mockReturnValue(mockStore),
  };
});

describe('DataLineageService', () => {
  let service: DataLineageService;
  const testAggregate: AggregateRef = {
    aggregateId: 'test-agg-123',
    aggregateType: 'Lead',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = createDataLineageService({});
  });

  // ============================================================================
  // CONSTRUCTION
  // ============================================================================

  describe('Construction', () => {
    it('should create service with in-memory store when no connection string provided', () => {
      const deps: DataLineageServiceDependencies = {};
      const svc = new DataLineageService(deps);
      expect(svc).toBeDefined();
    });

    it('should create service with postgres store when connection string provided', () => {
      const deps: DataLineageServiceDependencies = {
        connectionString: 'postgresql://localhost:5432/test',
      };
      const svc = new DataLineageService(deps);
      expect(svc).toBeDefined();
    });

    it('should create service with event store', () => {
      const mockEventStore = {
        append: vi.fn(),
        getEvents: vi.fn(),
      };
      const deps: DataLineageServiceDependencies = {
        eventStore: mockEventStore as unknown as DataLineageServiceDependencies['eventStore'],
      };
      const svc = new DataLineageService(deps);
      expect(svc).toBeDefined();
    });

    it('should create service with custom config', () => {
      const deps: DataLineageServiceDependencies = {
        config: {
          batchSize: 50,
          flushIntervalMs: 5000,
        },
      };
      const svc = new DataLineageService(deps);
      expect(svc).toBeDefined();
    });

    it('should create service using factory function', () => {
      const svc = createDataLineageService({});
      expect(svc).toBeInstanceOf(DataLineageService);
    });
  });

  // ============================================================================
  // LINEAGE TRACKING
  // ============================================================================

  describe('Lineage Tracking', () => {
    describe('trackScoring', () => {
      it('should track scoring lineage with all parameters', async () => {
        const result = await service.trackScoring(
          testAggregate,
          'event-123',
          'LeadScored',
          'corr-456',
          [{ type: 'internal', identifier: 'lead-data' }],
          { userId: 'user-1', sessionId: 'sess-1' },
          { scoreValue: 85, algorithm: 'ml-v2', factors: ['engagement', 'intent'] }
        );

        expect(result).toBeDefined();
        expect(result.id).toBe('lineage-1');
        expect(result.aggregateId).toBe('agg-1');
      });

      it('should track scoring lineage without optional score details', async () => {
        const result = await service.trackScoring(
          testAggregate,
          'event-123',
          'LeadScored',
          'corr-456',
          [],
          { userId: 'user-1' }
        );

        expect(result).toBeDefined();
      });
    });

    describe('trackEnrichment', () => {
      it('should track enrichment lineage with AI details', async () => {
        const result = await service.trackEnrichment(
          testAggregate,
          'event-124',
          'LeadEnriched',
          'corr-456',
          [{ type: 'external', identifier: 'openai-api' }],
          { userId: 'system' },
          { model: 'gpt-4o', enrichedFields: ['intent', 'urgency'], confidence: 0.92 }
        );

        expect(result).toBeDefined();
        expect(result.transformationType).toBe('enrichment');
      });

      it('should track enrichment lineage without optional details', async () => {
        const result = await service.trackEnrichment(
          testAggregate,
          'event-124',
          'LeadEnriched',
          'corr-456',
          [],
          { userId: 'system' }
        );

        expect(result).toBeDefined();
      });
    });

    describe('trackPatternDetection', () => {
      it('should track pattern detection lineage', async () => {
        const result = await service.trackPatternDetection(
          testAggregate,
          'corr-789',
          [{ type: 'internal', identifier: 'historical-events' }],
          { userId: 'ml-system' },
          {
            patternType: 'churn_risk',
            confidence: 0.88,
            supportingEventCount: 15,
          }
        );

        expect(result).toBeDefined();
        expect(result.transformationType).toBe('pattern_detection');
      });
    });

    describe('trackConsentProcessing', () => {
      it('should track consent grant lineage', async () => {
        const patientAggregate: AggregateRef = {
          aggregateId: 'patient-123',
          aggregateType: 'Patient',
        };

        const result = await service.trackConsentProcessing(
          patientAggregate,
          'event-125',
          'ConsentGranted',
          'corr-101',
          'consent-abc',
          { userId: 'patient-123' },
          { action: 'grant', purposes: ['marketing', 'communication'] }
        );

        expect(result).toBeDefined();
        expect(result.aggregateType).toBe('Patient');
      });

      it('should track consent withdrawal lineage', async () => {
        const patientAggregate: AggregateRef = {
          aggregateId: 'patient-456',
          aggregateType: 'Patient',
        };

        const result = await service.trackConsentProcessing(
          patientAggregate,
          'event-126',
          'ConsentWithdrawn',
          'corr-102',
          'consent-xyz',
          { userId: 'patient-456' },
          { action: 'withdraw', purposes: ['marketing'] }
        );

        expect(result).toBeDefined();
      });

      it('should track consent update lineage', async () => {
        const patientAggregate: AggregateRef = {
          aggregateId: 'patient-789',
          aggregateType: 'Patient',
        };

        const result = await service.trackConsentProcessing(
          patientAggregate,
          'event-127',
          'ConsentUpdated',
          'corr-103',
          'consent-def',
          { userId: 'admin-1' },
          { action: 'update', purposes: ['research', 'data_sharing'] }
        );

        expect(result).toBeDefined();
      });
    });
  });

  // ============================================================================
  // GRAPH OPERATIONS
  // ============================================================================

  describe('Graph Operations', () => {
    describe('getUpstreamLineage', () => {
      it('should get upstream lineage graph', async () => {
        const result = await service.getUpstreamLineage(testAggregate);

        expect(result).toBeDefined();
        expect(result.nodes).toEqual([]);
        expect(result.edges).toEqual([]);
      });

      it('should get upstream lineage with max depth', async () => {
        const result = await service.getUpstreamLineage(testAggregate, 3);

        expect(result).toBeDefined();
      });
    });

    describe('getDownstreamLineage', () => {
      it('should get downstream lineage graph', async () => {
        const result = await service.getDownstreamLineage(testAggregate);

        expect(result).toBeDefined();
        expect(result.nodes).toEqual([]);
      });

      it('should get downstream lineage with max depth', async () => {
        const result = await service.getDownstreamLineage(testAggregate, 5);

        expect(result).toBeDefined();
      });
    });

    describe('getFullLineage', () => {
      it('should get full lineage graph', async () => {
        const result = await service.getFullLineage(testAggregate);

        expect(result).toBeDefined();
        expect(result.rootNodeId).toBe('root');
      });

      it('should get full lineage with max depth', async () => {
        const result = await service.getFullLineage(testAggregate, 10);

        expect(result).toBeDefined();
      });
    });

    describe('analyzeImpact', () => {
      it('should analyze impact of changes', async () => {
        const result = await service.analyzeImpact(testAggregate);

        expect(result).toBeDefined();
        expect(result.affectedAggregates).toEqual([]);
        expect(result.totalImpactScore).toBe(0);
      });

      it('should analyze impact with max depth', async () => {
        const result = await service.analyzeImpact(testAggregate, 4);

        expect(result).toBeDefined();
      });
    });
  });

  // ============================================================================
  // COMPLIANCE OPERATIONS
  // ============================================================================

  describe('Compliance Operations', () => {
    describe('generateComplianceReport', () => {
      it('should generate HIPAA compliance report', async () => {
        const result = await service.generateComplianceReport(testAggregate, 'HIPAA');

        expect(result).toBeDefined();
        expect(result.framework).toBe('HIPAA');
        expect(result.score).toBe(95);
      });

      it('should generate GDPR compliance report with period', async () => {
        const period = {
          start: new Date('2024-01-01'),
          end: new Date('2024-12-31'),
        };

        const result = await service.generateComplianceReport(testAggregate, 'GDPR', period);

        expect(result).toBeDefined();
      });
    });

    describe('generateDSARReport', () => {
      it('should generate access DSAR report', async () => {
        const subject: AggregateRef = {
          aggregateId: 'patient-dsar-1',
          aggregateType: 'Patient',
        };

        const result = await service.generateDSARReport(subject, 'access');

        expect(result).toBeDefined();
        expect(result.requestType).toBe('access');
      });

      it('should generate portability DSAR report', async () => {
        const subject: AggregateRef = {
          aggregateId: 'patient-dsar-2',
          aggregateType: 'Patient',
        };

        const result = await service.generateDSARReport(subject, 'portability');

        expect(result).toBeDefined();
      });

      it('should generate erasure DSAR report', async () => {
        const subject: AggregateRef = {
          aggregateId: 'patient-dsar-3',
          aggregateType: 'Patient',
        };

        const result = await service.generateDSARReport(subject, 'erasure');

        expect(result).toBeDefined();
      });
    });

    describe('assessLawfulness', () => {
      it('should assess lawfulness of processing', async () => {
        const result = await service.assessLawfulness(testAggregate);

        expect(result).toBeDefined();
        expect(result.isLawful).toBe(true);
        expect(result.legalBases).toContain('consent');
      });
    });

    describe('generateHIPAAAuditTrail', () => {
      it('should generate HIPAA audit trail', async () => {
        const phi: AggregateRef = {
          aggregateId: 'phi-record-1',
          aggregateType: 'Patient',
        };

        const result = await service.generateHIPAAAuditTrail(phi);

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      });

      it('should generate HIPAA audit trail with period', async () => {
        const phi: AggregateRef = {
          aggregateId: 'phi-record-2',
          aggregateType: 'Patient',
        };
        const period = {
          start: new Date('2024-06-01'),
          end: new Date('2024-06-30'),
        };

        const result = await service.generateHIPAAAuditTrail(phi, period);

        expect(result).toBeDefined();
      });
    });

    describe('checkMinimumNecessary', () => {
      it('should check HIPAA minimum necessary compliance', async () => {
        const phi: AggregateRef = {
          aggregateId: 'phi-check-1',
          aggregateType: 'Patient',
        };

        const result = await service.checkMinimumNecessary(phi);

        expect(result).toBeDefined();
        expect(result.isCompliant).toBe(true);
        expect(result.issues).toEqual([]);
        expect(result.accessPatterns).toEqual([]);
      });
    });

    describe('getErasureScope', () => {
      it('should get erasure scope for GDPR right to be forgotten', async () => {
        const subject: AggregateRef = {
          aggregateId: 'patient-erasure-1',
          aggregateType: 'Patient',
        };

        const result = await service.getErasureScope(subject);

        expect(result).toBeDefined();
        expect(result.primaryData.aggregateId).toBe('agg-1');
        expect(result.totalAffectedCount).toBe(1);
      });
    });

    describe('deleteLineage', () => {
      it('should delete lineage for GDPR erasure', async () => {
        const result = await service.deleteLineage('patient-to-delete-123');

        expect(result).toBe(5);
      });
    });
  });

  // ============================================================================
  // DEBUGGING OPERATIONS
  // ============================================================================

  describe('Debugging Operations', () => {
    describe('investigateAggregate', () => {
      it('should investigate aggregate lineage', async () => {
        const result = await service.investigateAggregate(testAggregate);

        expect(result).toBeDefined();
        expect(result.aggregateId).toBe('agg-1');
      });
    });

    describe('investigateEvent', () => {
      it('should investigate event lineage', async () => {
        const result = await service.investigateEvent('event-to-investigate-123');

        expect(result).toBeDefined();
        expect(result.eventId).toBe('event-1');
      });
    });

    describe('investigateCorrelation', () => {
      it('should investigate correlation/trace', async () => {
        const result = await service.investigateCorrelation('correlation-to-investigate-456');

        expect(result).toBeDefined();
        expect(result.correlationId).toBe('corr-1');
      });
    });

    describe('performHealthCheck', () => {
      it('should perform health check', async () => {
        const result = await service.performHealthCheck();

        expect(result).toBeDefined();
        expect(result.status).toBe('healthy');
        expect(result.latency).toBe(10);
      });
    });
  });

  // ============================================================================
  // DASHBOARD DATA
  // ============================================================================

  describe('Dashboard Data', () => {
    it('should get dashboard data with empty results', async () => {
      const result = await service.getDashboardData();

      expect(result).toBeDefined();
      expect(result.health).toBeDefined();
      expect(result.recentActivity).toBeDefined();
      expect(result.recentActivity.last24h).toBe(0);
      expect(result.recentActivity.last7d).toBe(0);
      expect(result.recentActivity.last30d).toBe(0);
      expect(result.topTransformations).toEqual([]);
      expect(result.complianceSummary).toBeDefined();
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should calculate dashboard data with entries', async () => {
      // Import and get mock functions
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      // Mock data with entries
      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.9 },
          compliance: {
            frameworks: ['HIPAA', 'GDPR'],
            legalBasis: 'consent',
            consentId: 'consent-1',
          },
        },
        {
          id: 'e2',
          aggregateId: 'agg2',
          aggregateType: 'Patient',
          transformationType: 'enrichment',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.85 },
          compliance: {
            frameworks: ['HIPAA'],
            legalBasis: 'legitimate_interest',
          },
        },
        {
          id: 'e3',
          aggregateId: 'agg3',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          quality: undefined,
          compliance: {
            frameworks: ['GDPR'],
          },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 10 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 50 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 100 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.recentActivity.last24h).toBe(10);
      expect(result.recentActivity.last7d).toBe(50);
      expect(result.recentActivity.last30d).toBe(100);
      expect(result.topTransformations).toHaveLength(2);
      expect(result.topTransformations[0].type).toBe('scoring');
      expect(result.topTransformations[0].count).toBe(2);
      expect(result.complianceSummary.hipaaEntries).toBe(2);
      expect(result.complianceSummary.gdprEntries).toBe(2);
      expect(result.complianceSummary.withLegalBasis).toBe(2);
      expect(result.complianceSummary.withConsent).toBe(1);
    });

    it('should handle entries without quality confidence', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          quality: undefined,
          compliance: undefined,
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.topTransformations[0].avgQuality).toBe(0);
      expect(result.complianceSummary.hipaaEntries).toBe(0);
      expect(result.complianceSummary.gdprEntries).toBe(0);
    });

    it('should handle entries with missing compliance fields', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.8 },
          compliance: {
            frameworks: undefined,
            legalBasis: undefined,
            consentId: undefined,
          },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.complianceSummary.hipaaEntries).toBe(0);
      expect(result.complianceSummary.gdprEntries).toBe(0);
      expect(result.complianceSummary.withLegalBasis).toBe(0);
      expect(result.complianceSummary.withConsent).toBe(0);
    });

    it('should limit top transformations to 5', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = Array.from({ length: 10 }, (_, i) => ({
        id: `e${i}`,
        aggregateId: `agg${i}`,
        aggregateType: 'Lead',
        transformationType: `type${i}`,
        timestamp: new Date(),
        sources: [],
        quality: { confidence: 0.9 },
        compliance: undefined,
      }));

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.topTransformations).toHaveLength(5);
    });

    it('should sort transformations by count descending', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'typeA',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.9 },
        },
        {
          id: 'e2',
          aggregateId: 'agg2',
          aggregateType: 'Lead',
          transformationType: 'typeB',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.8 },
        },
        {
          id: 'e3',
          aggregateId: 'agg3',
          aggregateType: 'Lead',
          transformationType: 'typeB',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.85 },
        },
        {
          id: 'e4',
          aggregateId: 'agg4',
          aggregateType: 'Lead',
          transformationType: 'typeB',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.9 },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.topTransformations[0].type).toBe('typeB');
      expect(result.topTransformations[0].count).toBe(3);
      expect(result.topTransformations[1].type).toBe('typeA');
      expect(result.topTransformations[1].count).toBe(1);
    });

    it('should calculate average quality correctly', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.8 },
        },
        {
          id: 'e2',
          aggregateId: 'agg2',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.6 },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.topTransformations[0].avgQuality).toBeCloseTo(0.7, 5);
    });
  });

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  describe('Lifecycle', () => {
    it('should flush pending entries', async () => {
      await expect(service.flush()).resolves.toBeUndefined();
    });

    it('should shutdown service', async () => {
      await expect(service.shutdown()).resolves.toBeUndefined();
    });

    it('should handle flush errors gracefully', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.tracker.flushBatch.mockRejectedValueOnce(new Error('Flush failed'));

      await expect(service.flush()).rejects.toThrow('Flush failed');
    });

    it('should handle shutdown errors gracefully', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.tracker.shutdown.mockRejectedValueOnce(new Error('Shutdown failed'));

      await expect(service.shutdown()).rejects.toThrow('Shutdown failed');
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle tracking errors', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.tracker.trackScoring.mockRejectedValueOnce(
        new Error('Failed to track scoring')
      );

      await expect(
        service.trackScoring(
          testAggregate,
          'event-123',
          'LeadScored',
          'corr-456',
          [],
          { userId: 'user-1' }
        )
      ).rejects.toThrow('Failed to track scoring');
    });

    it('should handle graph building errors', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.graphBuilder.buildUpstreamGraph.mockRejectedValueOnce(
        new Error('Graph build failed')
      );

      await expect(service.getUpstreamLineage(testAggregate)).rejects.toThrow(
        'Graph build failed'
      );
    });

    it('should handle compliance report errors', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.compliance.generateComplianceReport.mockRejectedValueOnce(
        new Error('Report generation failed')
      );

      await expect(service.generateComplianceReport(testAggregate, 'HIPAA')).rejects.toThrow(
        'Report generation failed'
      );
    });

    it('should handle debug operation errors', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.debug.investigateAggregate.mockRejectedValueOnce(
        new Error('Investigation failed')
      );

      await expect(service.investigateAggregate(testAggregate)).rejects.toThrow(
        'Investigation failed'
      );
    });

    it('should handle dashboard data errors', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.debug.performHealthCheck.mockRejectedValueOnce(new Error('Health check failed'));

      await expect(service.getDashboardData()).rejects.toThrow('Health check failed');
    });

    it('should handle store query errors in dashboard', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.store.query.mockRejectedValueOnce(new Error('Query failed'));

      await expect(service.getDashboardData()).rejects.toThrow('Query failed');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty sources array in tracking', async () => {
      const result = await service.trackScoring(
        testAggregate,
        'event-123',
        'LeadScored',
        'corr-456',
        [],
        { userId: 'user-1' }
      );

      expect(result).toBeDefined();
    });

    it('should handle empty context in tracking', async () => {
      const result = await service.trackEnrichment(
        testAggregate,
        'event-124',
        'LeadEnriched',
        'corr-456',
        [],
        {}
      );

      expect(result).toBeDefined();
    });

    it('should handle maxDepth of 0 in graph operations', async () => {
      const result = await service.getUpstreamLineage(testAggregate, 0);
      expect(result).toBeDefined();
    });

    it('should handle very large maxDepth in graph operations', async () => {
      const result = await service.getDownstreamLineage(testAggregate, 1000);
      expect(result).toBeDefined();
    });

    it('should handle negative maxDepth gracefully', async () => {
      const result = await service.getFullLineage(testAggregate, -1);
      expect(result).toBeDefined();
    });

    it('should handle empty period in HIPAA audit trail', async () => {
      const phi: AggregateRef = {
        aggregateId: 'phi-record-1',
        aggregateType: 'Patient',
      };

      const result = await service.generateHIPAAAuditTrail(phi, undefined);
      expect(result).toBeDefined();
    });

    it('should handle compliance report without period', async () => {
      const result = await service.generateComplianceReport(testAggregate, 'GDPR', undefined);
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // INTEGRATION SCENARIOS
  // ============================================================================

  describe('Integration Scenarios', () => {
    it('should handle full workflow: track, investigate, generate report', async () => {
      // Track lineage
      const lineageEntry = await service.trackScoring(
        testAggregate,
        'event-123',
        'LeadScored',
        'corr-456',
        [{ type: 'internal', identifier: 'lead-data' }],
        { userId: 'user-1' },
        { scoreValue: 85, algorithm: 'ml-v2', factors: ['engagement', 'intent'] }
      );

      expect(lineageEntry).toBeDefined();

      // Investigate
      const investigation = await service.investigateAggregate(testAggregate);
      expect(investigation).toBeDefined();

      // Generate compliance report
      const report = await service.generateComplianceReport(testAggregate, 'HIPAA');
      expect(report).toBeDefined();
    });

    it('should handle concurrent tracking operations', async () => {
      const trackingPromises = [
        service.trackScoring(testAggregate, 'e1', 'LeadScored', 'c1', [], { userId: 'u1' }),
        service.trackEnrichment(testAggregate, 'e2', 'LeadEnriched', 'c2', [], { userId: 'u2' }),
        service.trackPatternDetection(
          testAggregate,
          'c3',
          [],
          { userId: 'u3' },
          { patternType: 'churn', confidence: 0.8, supportingEventCount: 10 }
        ),
      ];

      const results = await Promise.all(trackingPromises);
      expect(results).toHaveLength(3);
      results.forEach((result) => expect(result).toBeDefined());
    });

    it('should handle multiple graph operations in sequence', async () => {
      const upstream = await service.getUpstreamLineage(testAggregate);
      expect(upstream).toBeDefined();

      const downstream = await service.getDownstreamLineage(testAggregate);
      expect(downstream).toBeDefined();

      const full = await service.getFullLineage(testAggregate);
      expect(full).toBeDefined();

      const impact = await service.analyzeImpact(testAggregate);
      expect(impact).toBeDefined();
    });

    it('should handle GDPR erasure workflow', async () => {
      const subject: AggregateRef = {
        aggregateId: 'patient-erasure-1',
        aggregateType: 'Patient',
      };

      // Get erasure scope
      const scope = await service.getErasureScope(subject);
      expect(scope).toBeDefined();

      // Generate DSAR report
      const dsar = await service.generateDSARReport(subject, 'erasure');
      expect(dsar).toBeDefined();

      // Delete lineage
      const deletedCount = await service.deleteLineage(subject.aggregateId);
      expect(deletedCount).toBe(5);
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe('Property-Based Tests', () => {
    it('should handle any valid aggregate reference', () => {
      fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.constantFrom('Lead', 'Patient', 'Case', 'Episode'),
          async (aggregateId, aggregateType) => {
            const aggregate: AggregateRef = { aggregateId, aggregateType };
            const result = await service.getUpstreamLineage(aggregate);
            expect(result).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle any valid event ID', () => {
      fc.assert(
        fc.asyncProperty(fc.uuid(), async (eventId) => {
          const result = await service.investigateEvent(eventId);
          expect(result).toBeDefined();
        }),
        { numRuns: 20 }
      );
    });

    it('should handle any valid correlation ID', () => {
      fc.assert(
        fc.asyncProperty(fc.uuid(), async (correlationId) => {
          const result = await service.investigateCorrelation(correlationId);
          expect(result).toBeDefined();
        }),
        { numRuns: 20 }
      );
    });

    it('should handle various maxDepth values', () => {
      fc.assert(
        fc.asyncProperty(fc.integer({ min: -10, max: 100 }), async (maxDepth) => {
          const result = await service.getDownstreamLineage(testAggregate, maxDepth);
          expect(result).toBeDefined();
        }),
        { numRuns: 20 }
      );
    });

    it('should handle dashboard data with various entry counts', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 100 }), async (entryCount) => {
          const mockEntries = Array.from({ length: entryCount }, (_, i) => ({
            id: `e${i}`,
            aggregateId: `agg${i}`,
            aggregateType: 'Lead',
            transformationType: `type${i % 5}`,
            timestamp: new Date(),
            sources: [],
            quality: { confidence: Math.random() },
            compliance: {
              frameworks: Math.random() > 0.5 ? ['HIPAA'] : undefined,
            },
          }));

          mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
          mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
          mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
          mockSystem.store.query.mockResolvedValueOnce({
            entries: mockEntries,
            total: mockEntries.length,
          });

          const result = await service.getDashboardData();
          expect(result).toBeDefined();
          expect(result.generatedAt).toBeInstanceOf(Date);
        }),
        { numRuns: 10 }
      );
    });

    it('should handle tracking with various source counts', () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              type: fc.constantFrom('internal', 'external', 'api', 'database'),
              identifier: fc.uuid(),
            }),
            { maxLength: 10 }
          ),
          async (sources) => {
            const result = await service.trackScoring(
              testAggregate,
              'event-test',
              'LeadScored',
              'corr-test',
              sources as any[],
              { userId: 'test-user' }
            );
            expect(result).toBeDefined();
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ============================================================================
  // BRANCH COVERAGE TESTS
  // ============================================================================

  describe('Branch Coverage Tests', () => {
    it('should handle transformation map update for existing type', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.8 },
        },
        {
          id: 'e2',
          aggregateId: 'agg2',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          quality: { confidence: 0.9 },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.topTransformations).toHaveLength(1);
      expect(result.topTransformations[0].count).toBe(2);
      expect(result.topTransformations[0].avgQuality).toBeCloseTo(0.85, 5);
    });

    it('should handle HIPAA framework check', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          compliance: {
            frameworks: ['HIPAA'],
          },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.complianceSummary.hipaaEntries).toBe(1);
    });

    it('should handle GDPR framework check', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          compliance: {
            frameworks: ['GDPR'],
          },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.complianceSummary.gdprEntries).toBe(1);
    });

    it('should handle legal basis check', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          compliance: {
            legalBasis: 'consent',
          },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.complianceSummary.withLegalBasis).toBe(1);
    });

    it('should handle consent ID check', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          compliance: {
            consentId: 'consent-123',
          },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.complianceSummary.withConsent).toBe(1);
    });

    it('should handle mixed compliance flags', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      const mockEntries = [
        {
          id: 'e1',
          aggregateId: 'agg1',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          compliance: {
            frameworks: ['HIPAA', 'GDPR'],
            legalBasis: 'consent',
            consentId: 'consent-123',
          },
        },
        {
          id: 'e2',
          aggregateId: 'agg2',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          compliance: {
            frameworks: ['HIPAA'],
          },
        },
        {
          id: 'e3',
          aggregateId: 'agg3',
          aggregateType: 'Lead',
          transformationType: 'scoring',
          timestamp: new Date(),
          sources: [],
          compliance: {
            frameworks: ['GDPR'],
            legalBasis: 'legitimate_interest',
          },
        },
      ];

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({
        entries: mockEntries,
        total: mockEntries.length,
      });

      const result = await service.getDashboardData();

      expect(result.complianceSummary.hipaaEntries).toBe(2);
      expect(result.complianceSummary.gdprEntries).toBe(2);
      expect(result.complianceSummary.withLegalBasis).toBe(2);
      expect(result.complianceSummary.withConsent).toBe(1);
    });

    it('should handle transformation with zero count gracefully', async () => {
      const { createDataLineageSystem } = await import('@medicalcor/core');
      const mockSystem = (createDataLineageSystem as ReturnType<typeof vi.fn>).mock
        .results[0]?.value;

      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });
      mockSystem.store.query.mockResolvedValueOnce({ entries: [], total: 0 });

      const result = await service.getDashboardData();

      expect(result.topTransformations).toEqual([]);
    });
  });
});
