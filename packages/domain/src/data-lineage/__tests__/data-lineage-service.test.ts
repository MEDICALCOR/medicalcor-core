/**
 * @fileoverview Tests for Data Lineage Service
 *
 * Tests for data lineage tracking, compliance reports, debugging operations,
 * and dashboard data generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DataLineageService,
  createDataLineageService,
  type DataLineageServiceDependencies,
} from '../data-lineage-service.js';

// =============================================================================
// Mock Setup
// =============================================================================

const mockTracker = {
  trackScoring: vi.fn(),
  trackEnrichment: vi.fn(),
  trackPatternDetection: vi.fn(),
  trackConsentProcessing: vi.fn(),
  flushBatch: vi.fn(),
  shutdown: vi.fn(),
};

const mockGraphBuilder = {
  buildUpstreamGraph: vi.fn(),
  buildDownstreamGraph: vi.fn(),
  buildFullGraph: vi.fn(),
  analyzeImpact: vi.fn(),
};

const mockCompliance = {
  generateComplianceReport: vi.fn(),
  generateDSARReport: vi.fn(),
  assessLawfulness: vi.fn(),
  generateHIPAAAuditTrail: vi.fn(),
  checkMinimumNecessary: vi.fn(),
  getErasureScope: vi.fn(),
  deleteLineage: vi.fn(),
};

const mockDebug = {
  investigateAggregate: vi.fn(),
  investigateEvent: vi.fn(),
  investigateCorrelation: vi.fn(),
  performHealthCheck: vi.fn(),
};

const mockStore = {
  query: vi.fn(),
};

vi.mock('@medicalcor/core', () => ({
  createDataLineageSystem: vi.fn(() => ({
    tracker: mockTracker,
    graphBuilder: mockGraphBuilder,
    compliance: mockCompliance,
    debug: mockDebug,
    store: mockStore,
  })),
  createPostgresLineageStore: vi.fn(() => ({})),
  createInMemoryLineageStore: vi.fn(() => ({})),
}));

// =============================================================================
// Mock Data
// =============================================================================

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
const MOCK_EVENT_ID = '550e8400-e29b-41d4-a716-446655440002';
const MOCK_CORRELATION_ID = '550e8400-e29b-41d4-a716-446655440003';
const MOCK_CONSENT_ID = '550e8400-e29b-41d4-a716-446655440004';

function createMockLineageEntry(overrides = {}) {
  return {
    id: MOCK_UUID,
    aggregateId: MOCK_UUID,
    aggregateType: 'lead',
    eventId: MOCK_EVENT_ID,
    eventType: 'LeadScored',
    correlationId: MOCK_CORRELATION_ID,
    transformationType: 'scoring',
    sources: [{ type: 'lead', id: MOCK_UUID }],
    createdAt: new Date(),
    quality: { confidence: 0.9 },
    compliance: {
      frameworks: ['HIPAA', 'GDPR'],
      legalBasis: 'consent',
      consentId: MOCK_CONSENT_ID,
    },
    ...overrides,
  };
}

function createMockLineageGraph() {
  return {
    rootNode: { aggregateId: MOCK_UUID, aggregateType: 'lead' },
    nodes: [{ aggregateId: MOCK_UUID, aggregateType: 'lead' }],
    edges: [],
    depth: 1,
    generatedAt: new Date(),
  };
}

function createMockHealthCheck() {
  return {
    status: 'healthy' as const,
    storeHealthy: true,
    totalEntries: 1000,
    entriesLast24h: 50,
    averageProcessingTime: 15,
    errorRate: 0.01,
    checkedAt: new Date(),
  };
}

function createMockInvestigation() {
  return {
    summary: 'Investigation complete',
    aggregateId: MOCK_UUID,
    aggregateType: 'lead',
    entries: [createMockLineageEntry()],
    timeline: [],
    findings: [],
    investigatedAt: new Date(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('DataLineageService', () => {
  let service: DataLineageService;
  let deps: DataLineageServiceDependencies;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = { config: {} };
    service = new DataLineageService(deps);

    // Default mock implementations
    mockTracker.trackScoring.mockResolvedValue(createMockLineageEntry());
    mockTracker.trackEnrichment.mockResolvedValue(
      createMockLineageEntry({ transformationType: 'enrichment' })
    );
    mockTracker.trackPatternDetection.mockResolvedValue(
      createMockLineageEntry({ transformationType: 'pattern_detection' })
    );
    mockTracker.trackConsentProcessing.mockResolvedValue(
      createMockLineageEntry({ transformationType: 'consent' })
    );
    mockTracker.flushBatch.mockResolvedValue(undefined);
    mockTracker.shutdown.mockResolvedValue(undefined);

    mockGraphBuilder.buildUpstreamGraph.mockResolvedValue(createMockLineageGraph());
    mockGraphBuilder.buildDownstreamGraph.mockResolvedValue(createMockLineageGraph());
    mockGraphBuilder.buildFullGraph.mockResolvedValue(createMockLineageGraph());
    mockGraphBuilder.analyzeImpact.mockResolvedValue({
      aggregate: { aggregateId: MOCK_UUID, aggregateType: 'lead' },
      impactedAggregates: [],
      totalImpact: 0,
    });

    mockCompliance.generateComplianceReport.mockResolvedValue({
      framework: 'HIPAA',
      aggregate: { aggregateId: MOCK_UUID, aggregateType: 'lead' },
      entries: [],
      issues: [],
      isCompliant: true,
    });
    mockCompliance.generateDSARReport.mockResolvedValue({
      subjectId: MOCK_UUID,
      requestType: 'access',
      data: {},
      generatedAt: new Date(),
    });
    mockCompliance.assessLawfulness.mockResolvedValue({
      isLawful: true,
      basis: 'consent',
      assessment: [],
    });
    mockCompliance.generateHIPAAAuditTrail.mockResolvedValue([]);
    mockCompliance.checkMinimumNecessary.mockResolvedValue({
      isCompliant: true,
      issues: [],
      accessPatterns: [],
    });
    mockCompliance.getErasureScope.mockResolvedValue({
      primaryData: { aggregateId: MOCK_UUID, aggregateType: 'lead' },
      derivedData: [],
      retainedData: [],
      totalAffectedCount: 1,
    });
    mockCompliance.deleteLineage.mockResolvedValue(5);

    mockDebug.investigateAggregate.mockResolvedValue(createMockInvestigation());
    mockDebug.investigateEvent.mockResolvedValue(createMockInvestigation());
    mockDebug.investigateCorrelation.mockResolvedValue(createMockInvestigation());
    mockDebug.performHealthCheck.mockResolvedValue(createMockHealthCheck());

    mockStore.query.mockResolvedValue({
      entries: [createMockLineageEntry()],
      total: 1,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor and Factory', () => {
    it('should create service via constructor with in-memory store', () => {
      const svc = new DataLineageService({});
      expect(svc).toBeInstanceOf(DataLineageService);
    });

    it('should create service with connection string for postgres store', () => {
      const svc = new DataLineageService({
        connectionString: 'postgresql://localhost:5432/test',
      });
      expect(svc).toBeInstanceOf(DataLineageService);
    });

    it('should create service via factory function', () => {
      const svc = createDataLineageService(deps);
      expect(svc).toBeInstanceOf(DataLineageService);
    });

    it('should create service with event store', () => {
      const mockEventStore = { getEvents: vi.fn() };
      const svc = new DataLineageService({
        eventStore: mockEventStore as any,
      });
      expect(svc).toBeInstanceOf(DataLineageService);
    });
  });

  describe('Lineage Tracking', () => {
    describe('trackScoring', () => {
      it('should track scoring lineage', async () => {
        const target = { aggregateId: MOCK_UUID, aggregateType: 'lead' };
        const sources = [{ type: 'lead', id: MOCK_UUID }];
        const context = { userId: 'user-1' };

        const entry = await service.trackScoring(
          target,
          MOCK_EVENT_ID,
          'LeadScored',
          MOCK_CORRELATION_ID,
          sources as any,
          context as any
        );

        expect(entry).toBeDefined();
        expect(mockTracker.trackScoring).toHaveBeenCalledWith(
          MOCK_UUID,
          'lead',
          MOCK_EVENT_ID,
          'LeadScored',
          MOCK_CORRELATION_ID,
          sources,
          context,
          undefined
        );
      });

      it('should track scoring with details', async () => {
        const target = { aggregateId: MOCK_UUID, aggregateType: 'lead' };
        const sources = [{ type: 'lead', id: MOCK_UUID }];
        const context = { userId: 'user-1' };
        const scoreDetails = {
          scoreValue: 85,
          algorithm: 'ml-v2',
          factors: ['engagement', 'urgency'],
        };

        await service.trackScoring(
          target,
          MOCK_EVENT_ID,
          'LeadScored',
          MOCK_CORRELATION_ID,
          sources as any,
          context as any,
          scoreDetails
        );

        expect(mockTracker.trackScoring).toHaveBeenCalledWith(
          MOCK_UUID,
          'lead',
          MOCK_EVENT_ID,
          'LeadScored',
          MOCK_CORRELATION_ID,
          sources,
          context,
          scoreDetails
        );
      });
    });

    describe('trackEnrichment', () => {
      it('should track enrichment lineage', async () => {
        const target = { aggregateId: MOCK_UUID, aggregateType: 'lead' };
        const sources = [{ type: 'lead', id: MOCK_UUID }];
        const context = { userId: 'user-1' };

        const entry = await service.trackEnrichment(
          target,
          MOCK_EVENT_ID,
          'LeadEnriched',
          MOCK_CORRELATION_ID,
          sources as any,
          context as any
        );

        expect(entry).toBeDefined();
        expect(mockTracker.trackEnrichment).toHaveBeenCalled();
      });

      it('should track enrichment with details', async () => {
        const target = { aggregateId: MOCK_UUID, aggregateType: 'lead' };
        const enrichmentDetails = { model: 'gpt-4', enrichedFields: ['intent'], confidence: 0.9 };

        await service.trackEnrichment(
          target,
          MOCK_EVENT_ID,
          'LeadEnriched',
          MOCK_CORRELATION_ID,
          [] as any,
          {} as any,
          enrichmentDetails
        );

        expect(mockTracker.trackEnrichment).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(String),
          expect.any(Array),
          expect.any(Object),
          enrichmentDetails
        );
      });
    });

    describe('trackPatternDetection', () => {
      it('should track pattern detection lineage', async () => {
        const target = { aggregateId: MOCK_UUID, aggregateType: 'lead' };
        const patternDetails = {
          patternType: 'high_engagement',
          confidence: 0.85,
          supportingEventCount: 10,
        };

        const entry = await service.trackPatternDetection(
          target,
          MOCK_CORRELATION_ID,
          [] as any,
          {} as any,
          patternDetails
        );

        expect(entry).toBeDefined();
        expect(mockTracker.trackPatternDetection).toHaveBeenCalledWith(
          MOCK_UUID,
          'lead',
          MOCK_CORRELATION_ID,
          [],
          {},
          patternDetails
        );
      });
    });

    describe('trackConsentProcessing', () => {
      it('should track consent processing lineage', async () => {
        const target = { aggregateId: MOCK_UUID, aggregateType: 'lead' };
        const consentDetails = { action: 'grant' as const, purposes: ['marketing', 'analytics'] };

        const entry = await service.trackConsentProcessing(
          target,
          MOCK_EVENT_ID,
          'ConsentGranted',
          MOCK_CORRELATION_ID,
          MOCK_CONSENT_ID,
          {} as any,
          consentDetails
        );

        expect(entry).toBeDefined();
        expect(mockTracker.trackConsentProcessing).toHaveBeenCalledWith(
          MOCK_UUID,
          'lead',
          MOCK_EVENT_ID,
          'ConsentGranted',
          MOCK_CORRELATION_ID,
          MOCK_CONSENT_ID,
          {},
          consentDetails
        );
      });
    });
  });

  describe('Graph Operations', () => {
    describe('getUpstreamLineage', () => {
      it('should get upstream lineage graph', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const graph = await service.getUpstreamLineage(aggregate);

        expect(graph).toBeDefined();
        expect(mockGraphBuilder.buildUpstreamGraph).toHaveBeenCalledWith(MOCK_UUID, 'lead', {
          maxDepth: undefined,
        });
      });

      it('should get upstream lineage with max depth', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        await service.getUpstreamLineage(aggregate, 3);

        expect(mockGraphBuilder.buildUpstreamGraph).toHaveBeenCalledWith(MOCK_UUID, 'lead', {
          maxDepth: 3,
        });
      });
    });

    describe('getDownstreamLineage', () => {
      it('should get downstream lineage graph', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const graph = await service.getDownstreamLineage(aggregate);

        expect(graph).toBeDefined();
        expect(mockGraphBuilder.buildDownstreamGraph).toHaveBeenCalledWith(MOCK_UUID, 'lead', {
          maxDepth: undefined,
        });
      });

      it('should get downstream lineage with max depth', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        await service.getDownstreamLineage(aggregate, 5);

        expect(mockGraphBuilder.buildDownstreamGraph).toHaveBeenCalledWith(MOCK_UUID, 'lead', {
          maxDepth: 5,
        });
      });
    });

    describe('getFullLineage', () => {
      it('should get full lineage graph', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const graph = await service.getFullLineage(aggregate);

        expect(graph).toBeDefined();
        expect(mockGraphBuilder.buildFullGraph).toHaveBeenCalledWith(MOCK_UUID, 'lead', {
          maxDepth: undefined,
        });
      });
    });

    describe('analyzeImpact', () => {
      it('should analyze impact of aggregate changes', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const impact = await service.analyzeImpact(aggregate);

        expect(impact).toBeDefined();
        expect(mockGraphBuilder.analyzeImpact).toHaveBeenCalledWith(MOCK_UUID, 'lead', {
          maxDepth: undefined,
        });
      });
    });
  });

  describe('Compliance Operations', () => {
    describe('generateComplianceReport', () => {
      it('should generate HIPAA compliance report', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const report = await service.generateComplianceReport(aggregate, 'HIPAA');

        expect(report).toBeDefined();
        expect(mockCompliance.generateComplianceReport).toHaveBeenCalledWith(
          MOCK_UUID,
          'lead',
          'HIPAA',
          undefined
        );
      });

      it('should generate GDPR compliance report with period', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };
        const period = { start: new Date('2024-01-01'), end: new Date('2024-06-30') };

        await service.generateComplianceReport(aggregate, 'GDPR', period);

        expect(mockCompliance.generateComplianceReport).toHaveBeenCalledWith(
          MOCK_UUID,
          'lead',
          'GDPR',
          period
        );
      });
    });

    describe('generateDSARReport', () => {
      it('should generate access request report', async () => {
        const subject = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const report = await service.generateDSARReport(subject, 'access');

        expect(report).toBeDefined();
        expect(mockCompliance.generateDSARReport).toHaveBeenCalledWith(MOCK_UUID, 'lead', 'access');
      });

      it('should generate portability request report', async () => {
        const subject = { aggregateId: MOCK_UUID, aggregateType: 'patient' };

        await service.generateDSARReport(subject, 'portability');

        expect(mockCompliance.generateDSARReport).toHaveBeenCalledWith(
          MOCK_UUID,
          'patient',
          'portability'
        );
      });

      it('should generate erasure request report', async () => {
        const subject = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        await service.generateDSARReport(subject, 'erasure');

        expect(mockCompliance.generateDSARReport).toHaveBeenCalledWith(
          MOCK_UUID,
          'lead',
          'erasure'
        );
      });
    });

    describe('assessLawfulness', () => {
      it('should assess lawfulness of data processing', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const assessment = await service.assessLawfulness(aggregate);

        expect(assessment).toBeDefined();
        expect(mockCompliance.assessLawfulness).toHaveBeenCalledWith(MOCK_UUID, 'lead');
      });
    });

    describe('generateHIPAAAuditTrail', () => {
      it('should generate HIPAA audit trail', async () => {
        const phi = { aggregateId: MOCK_UUID, aggregateType: 'patient' };

        const trail = await service.generateHIPAAAuditTrail(phi);

        expect(trail).toBeInstanceOf(Array);
        expect(mockCompliance.generateHIPAAAuditTrail).toHaveBeenCalledWith(
          MOCK_UUID,
          'patient',
          undefined
        );
      });

      it('should generate HIPAA audit trail with period', async () => {
        const phi = { aggregateId: MOCK_UUID, aggregateType: 'patient' };
        const period = { start: new Date('2024-01-01'), end: new Date('2024-06-30') };

        await service.generateHIPAAAuditTrail(phi, period);

        expect(mockCompliance.generateHIPAAAuditTrail).toHaveBeenCalledWith(
          MOCK_UUID,
          'patient',
          period
        );
      });
    });

    describe('checkMinimumNecessary', () => {
      it('should check HIPAA minimum necessary compliance', async () => {
        const phi = { aggregateId: MOCK_UUID, aggregateType: 'patient' };

        const result = await service.checkMinimumNecessary(phi);

        expect(result).toBeDefined();
        expect(result.isCompliant).toBeDefined();
        expect(mockCompliance.checkMinimumNecessary).toHaveBeenCalledWith(MOCK_UUID, 'patient');
      });
    });

    describe('getErasureScope', () => {
      it('should get erasure scope for GDPR deletion', async () => {
        const subject = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const scope = await service.getErasureScope(subject);

        expect(scope).toBeDefined();
        expect(scope.primaryData).toBeDefined();
        expect(mockCompliance.getErasureScope).toHaveBeenCalledWith(MOCK_UUID, 'lead');
      });
    });

    describe('deleteLineage', () => {
      it('should delete lineage for GDPR erasure', async () => {
        const count = await service.deleteLineage(MOCK_UUID);

        expect(count).toBe(5);
        expect(mockCompliance.deleteLineage).toHaveBeenCalledWith(MOCK_UUID);
      });
    });
  });

  describe('Debugging Operations', () => {
    describe('investigateAggregate', () => {
      it('should investigate aggregate lineage', async () => {
        const aggregate = { aggregateId: MOCK_UUID, aggregateType: 'lead' };

        const result = await service.investigateAggregate(aggregate);

        expect(result).toBeDefined();
        expect(mockDebug.investigateAggregate).toHaveBeenCalledWith(MOCK_UUID, 'lead');
      });
    });

    describe('investigateEvent', () => {
      it('should investigate event lineage', async () => {
        const result = await service.investigateEvent(MOCK_EVENT_ID);

        expect(result).toBeDefined();
        expect(mockDebug.investigateEvent).toHaveBeenCalledWith(MOCK_EVENT_ID);
      });
    });

    describe('investigateCorrelation', () => {
      it('should investigate correlation lineage', async () => {
        const result = await service.investigateCorrelation(MOCK_CORRELATION_ID);

        expect(result).toBeDefined();
        expect(mockDebug.investigateCorrelation).toHaveBeenCalledWith(MOCK_CORRELATION_ID);
      });
    });

    describe('performHealthCheck', () => {
      it('should perform health check on lineage system', async () => {
        const health = await service.performHealthCheck();

        expect(health).toBeDefined();
        expect(health.status).toBe('healthy');
        expect(mockDebug.performHealthCheck).toHaveBeenCalled();
      });
    });
  });

  describe('Dashboard Data', () => {
    describe('getDashboardData', () => {
      it('should return complete dashboard data', async () => {
        const dashboard = await service.getDashboardData();

        expect(dashboard).toBeDefined();
        expect(dashboard.health).toBeDefined();
        expect(dashboard.recentActivity).toBeDefined();
        expect(dashboard.topTransformations).toBeInstanceOf(Array);
        expect(dashboard.complianceSummary).toBeDefined();
        expect(dashboard.generatedAt).toBeInstanceOf(Date);
      });

      it('should calculate recent activity counts', async () => {
        mockStore.query
          .mockResolvedValueOnce({ entries: [], total: 50 }) // last24h
          .mockResolvedValueOnce({ entries: [], total: 200 }) // last7d
          .mockResolvedValueOnce({ entries: [], total: 500 }) // last30d
          .mockResolvedValueOnce({ entries: [], total: 0 }); // recent entries

        const dashboard = await service.getDashboardData();

        expect(dashboard.recentActivity.last24h).toBe(50);
        expect(dashboard.recentActivity.last7d).toBe(200);
        expect(dashboard.recentActivity.last30d).toBe(500);
      });

      it('should calculate top transformations', async () => {
        mockStore.query.mockResolvedValue({
          entries: [
            createMockLineageEntry({ transformationType: 'scoring', quality: { confidence: 0.9 } }),
            createMockLineageEntry({ transformationType: 'scoring', quality: { confidence: 0.8 } }),
            createMockLineageEntry({
              transformationType: 'enrichment',
              quality: { confidence: 0.7 },
            }),
          ],
          total: 3,
        });

        const dashboard = await service.getDashboardData();

        expect(dashboard.topTransformations.length).toBeGreaterThan(0);
        const scoringTransform = dashboard.topTransformations.find((t) => t.type === 'scoring');
        expect(scoringTransform?.count).toBe(2);
      });

      it('should calculate compliance summary', async () => {
        mockStore.query.mockResolvedValue({
          entries: [
            createMockLineageEntry({
              compliance: { frameworks: ['HIPAA'], legalBasis: 'consent', consentId: '123' },
            }),
            createMockLineageEntry({
              compliance: { frameworks: ['GDPR'], legalBasis: 'legitimate_interest' },
            }),
            createMockLineageEntry({
              compliance: {
                frameworks: ['HIPAA', 'GDPR'],
                legalBasis: 'consent',
                consentId: '456',
              },
            }),
          ],
          total: 3,
        });

        const dashboard = await service.getDashboardData();

        expect(dashboard.complianceSummary.hipaaEntries).toBe(2);
        expect(dashboard.complianceSummary.gdprEntries).toBe(2);
        expect(dashboard.complianceSummary.withLegalBasis).toBe(3);
        expect(dashboard.complianceSummary.withConsent).toBe(2);
      });

      it('should handle entries without quality field', async () => {
        mockStore.query.mockResolvedValue({
          entries: [createMockLineageEntry({ quality: undefined })],
          total: 1,
        });

        const dashboard = await service.getDashboardData();

        expect(dashboard.topTransformations).toBeInstanceOf(Array);
      });

      it('should handle entries without compliance field', async () => {
        mockStore.query.mockResolvedValue({
          entries: [createMockLineageEntry({ compliance: undefined })],
          total: 1,
        });

        const dashboard = await service.getDashboardData();

        expect(dashboard.complianceSummary.hipaaEntries).toBe(0);
        expect(dashboard.complianceSummary.gdprEntries).toBe(0);
      });
    });
  });

  describe('Lifecycle', () => {
    describe('flush', () => {
      it('should flush pending lineage entries', async () => {
        await service.flush();

        expect(mockTracker.flushBatch).toHaveBeenCalled();
      });
    });

    describe('shutdown', () => {
      it('should shutdown the service', async () => {
        await service.shutdown();

        expect(mockTracker.shutdown).toHaveBeenCalled();
      });
    });
  });
});
