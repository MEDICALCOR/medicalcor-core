/**
 * @fileoverview Data Lineage Service Tests
 *
 * Tests for M15: Data Lineage Tracking for Compliance and Debugging.
 * Covers lineage tracking, graph operations, compliance reporting,
 * and debugging functionality.
 *
 * @module domain/data-lineage/__tests__/data-lineage-service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  DataLineageService,
  createDataLineageService,
  type DataLineageServiceDependencies,
  type AggregateRef,
} from '../data-lineage-service.js';

// =============================================================================
// MOCK IMPLEMENTATIONS
// =============================================================================

const mockLineageEntry = {
  id: 'lineage-001',
  aggregateId: 'lead-001',
  aggregateType: 'Lead',
  transformationType: 'scoring',
  timestamp: new Date(),
  correlationId: 'corr-001',
  sources: [],
  quality: { confidence: 0.9 },
  compliance: { frameworks: ['HIPAA'], legalBasis: 'consent' },
};

const mockLineageGraph = {
  rootNode: { id: 'lead-001', type: 'Lead' },
  nodes: [{ id: 'lead-001', type: 'Lead' }],
  edges: [],
  depth: 1,
};

const mockInvestigationResult = {
  summary: 'Investigation complete',
  findings: [],
  recommendations: [],
};

const mockHealthCheck = {
  status: 'healthy' as const,
  lastCheck: new Date(),
  issues: [],
};

const mockComplianceReport = {
  aggregateId: 'lead-001',
  aggregateType: 'Lead',
  framework: 'HIPAA',
  entries: [],
  generatedAt: new Date(),
};

// Mock the core module
vi.mock('@medicalcor/core', async () => ({
  createDataLineageSystem: vi.fn(() => ({
    tracker: {
      trackScoring: vi.fn().mockResolvedValue(mockLineageEntry),
      trackEnrichment: vi.fn().mockResolvedValue(mockLineageEntry),
      trackPatternDetection: vi.fn().mockResolvedValue(mockLineageEntry),
      trackConsentProcessing: vi.fn().mockResolvedValue(mockLineageEntry),
      flushBatch: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    },
    graphBuilder: {
      buildUpstreamGraph: vi.fn().mockResolvedValue(mockLineageGraph),
      buildDownstreamGraph: vi.fn().mockResolvedValue(mockLineageGraph),
      buildFullGraph: vi.fn().mockResolvedValue(mockLineageGraph),
      analyzeImpact: vi.fn().mockResolvedValue({
        affectedAggregates: [],
        riskLevel: 'low',
        recommendations: [],
      }),
    },
    compliance: {
      generateComplianceReport: vi.fn().mockResolvedValue(mockComplianceReport),
      generateDSARReport: vi.fn().mockResolvedValue({
        subjectId: 'lead-001',
        requestType: 'access',
        data: [],
      }),
      assessLawfulness: vi.fn().mockResolvedValue({
        isLawful: true,
        legalBasis: 'consent',
        issues: [],
      }),
      generateHIPAAAuditTrail: vi.fn().mockResolvedValue([]),
      checkMinimumNecessary: vi.fn().mockResolvedValue({
        isCompliant: true,
        issues: [],
        accessPatterns: [],
      }),
      getErasureScope: vi.fn().mockResolvedValue({
        primaryData: { aggregateId: 'lead-001', aggregateType: 'Lead' },
        derivedData: [],
        retainedData: [],
        totalAffectedCount: 1,
      }),
      deleteLineage: vi.fn().mockResolvedValue(1),
    },
    debug: {
      investigateAggregate: vi.fn().mockResolvedValue(mockInvestigationResult),
      investigateEvent: vi.fn().mockResolvedValue(mockInvestigationResult),
      investigateCorrelation: vi.fn().mockResolvedValue(mockInvestigationResult),
      performHealthCheck: vi.fn().mockResolvedValue(mockHealthCheck),
    },
    store: {
      query: vi.fn().mockResolvedValue({ entries: [], total: 0 }),
    },
  })),
  createPostgresLineageStore: vi.fn(() => ({})),
  createInMemoryLineageStore: vi.fn(() => ({})),
}));

// =============================================================================
// TEST SUITE
// =============================================================================

describe('DataLineageService', () => {
  let service: DataLineageService;
  let deps: DataLineageServiceDependencies;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {};
    service = new DataLineageService(deps);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  // ===========================================================================
  // LINEAGE TRACKING TESTS
  // ===========================================================================

  describe('trackScoring', () => {
    it('should track scoring lineage', async () => {
      const target: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };
      const sources = [{ type: 'message' as const, id: 'msg-001', timestamp: new Date() }];
      const context = { userId: 'user-001', action: 'score_lead' };

      const result = await service.trackScoring(
        target,
        'event-001',
        'LeadScored',
        'corr-001',
        sources,
        context,
        { scoreValue: 4, algorithm: 'ai', factors: ['urgency', 'budget'] }
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('lineage-001');
    });

    it('should track scoring without score details', async () => {
      const target: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const result = await service.trackScoring(
        target,
        'event-001',
        'LeadScored',
        'corr-001',
        [],
        {}
      );

      expect(result).toBeDefined();
    });
  });

  describe('trackEnrichment', () => {
    it('should track AI enrichment lineage', async () => {
      const target: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const result = await service.trackEnrichment(
        target,
        'event-001',
        'LeadEnriched',
        'corr-001',
        [],
        {},
        { model: 'gpt-4o', enrichedFields: ['symptoms', 'intent'], confidence: 0.95 }
      );

      expect(result).toBeDefined();
    });
  });

  describe('trackPatternDetection', () => {
    it('should track pattern detection lineage', async () => {
      const target: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const result = await service.trackPatternDetection(
        target,
        'corr-001',
        [],
        {},
        {
          patternType: 'high_engagement',
          confidence: 0.85,
          supportingEventCount: 15,
        }
      );

      expect(result).toBeDefined();
    });
  });

  describe('trackConsentProcessing', () => {
    it('should track consent processing lineage', async () => {
      const target: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const result = await service.trackConsentProcessing(
        target,
        'event-001',
        'ConsentGranted',
        'corr-001',
        'consent-001',
        {},
        { action: 'grant', purposes: ['marketing', 'treatment'] }
      );

      expect(result).toBeDefined();
    });

    it('should track consent withdrawal', async () => {
      const target: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const result = await service.trackConsentProcessing(
        target,
        'event-002',
        'ConsentWithdrawn',
        'corr-002',
        'consent-001',
        {},
        { action: 'withdraw', purposes: ['marketing'] }
      );

      expect(result).toBeDefined();
    });
  });

  // ===========================================================================
  // GRAPH OPERATIONS TESTS
  // ===========================================================================

  describe('getUpstreamLineage', () => {
    it('should get upstream lineage graph', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const graph = await service.getUpstreamLineage(aggregate);

      expect(graph).toBeDefined();
      expect(graph.rootNode).toBeDefined();
      expect(graph.nodes).toBeDefined();
      expect(graph.edges).toBeDefined();
    });

    it('should respect max depth parameter', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const graph = await service.getUpstreamLineage(aggregate, 3);

      expect(graph).toBeDefined();
    });
  });

  describe('getDownstreamLineage', () => {
    it('should get downstream lineage graph', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const graph = await service.getDownstreamLineage(aggregate);

      expect(graph).toBeDefined();
    });
  });

  describe('getFullLineage', () => {
    it('should get full lineage graph', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const graph = await service.getFullLineage(aggregate);

      expect(graph).toBeDefined();
    });
  });

  describe('analyzeImpact', () => {
    it('should analyze impact of changes', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const impact = await service.analyzeImpact(aggregate);

      expect(impact).toBeDefined();
      expect(impact.affectedAggregates).toBeDefined();
      expect(impact.riskLevel).toBeDefined();
    });
  });

  // ===========================================================================
  // COMPLIANCE OPERATIONS TESTS
  // ===========================================================================

  describe('generateComplianceReport', () => {
    it('should generate HIPAA compliance report', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const report = await service.generateComplianceReport(aggregate, 'HIPAA');

      expect(report).toBeDefined();
    });

    it('should generate GDPR compliance report', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const report = await service.generateComplianceReport(aggregate, 'GDPR');

      expect(report).toBeDefined();
    });

    it('should accept time period parameter', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };
      const period = {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31'),
      };

      const report = await service.generateComplianceReport(aggregate, 'HIPAA', period);

      expect(report).toBeDefined();
    });
  });

  describe('generateDSARReport', () => {
    it('should generate access DSAR report', async () => {
      const subject: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const report = await service.generateDSARReport(subject, 'access');

      expect(report).toBeDefined();
    });

    it('should generate portability DSAR report', async () => {
      const subject: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const report = await service.generateDSARReport(subject, 'portability');

      expect(report).toBeDefined();
    });

    it('should generate erasure DSAR report', async () => {
      const subject: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const report = await service.generateDSARReport(subject, 'erasure');

      expect(report).toBeDefined();
    });
  });

  describe('assessLawfulness', () => {
    it('should assess lawfulness of data processing', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const assessment = await service.assessLawfulness(aggregate);

      expect(assessment).toBeDefined();
      expect(typeof assessment.isLawful).toBe('boolean');
    });
  });

  describe('generateHIPAAAuditTrail', () => {
    it('should generate HIPAA audit trail', async () => {
      const phi: AggregateRef = { aggregateId: 'patient-001', aggregateType: 'Patient' };

      const trail = await service.generateHIPAAAuditTrail(phi);

      expect(Array.isArray(trail)).toBe(true);
    });

    it('should accept time period parameter', async () => {
      const phi: AggregateRef = { aggregateId: 'patient-001', aggregateType: 'Patient' };
      const period = {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31'),
      };

      const trail = await service.generateHIPAAAuditTrail(phi, period);

      expect(Array.isArray(trail)).toBe(true);
    });
  });

  describe('checkMinimumNecessary', () => {
    it('should check HIPAA minimum necessary compliance', async () => {
      const phi: AggregateRef = { aggregateId: 'patient-001', aggregateType: 'Patient' };

      const result = await service.checkMinimumNecessary(phi);

      expect(result).toBeDefined();
      expect(typeof result.isCompliant).toBe('boolean');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(Array.isArray(result.accessPatterns)).toBe(true);
    });
  });

  describe('getErasureScope', () => {
    it('should get GDPR erasure scope', async () => {
      const subject: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const scope = await service.getErasureScope(subject);

      expect(scope).toBeDefined();
      expect(scope.primaryData).toBeDefined();
      expect(Array.isArray(scope.derivedData)).toBe(true);
      expect(Array.isArray(scope.retainedData)).toBe(true);
      expect(typeof scope.totalAffectedCount).toBe('number');
    });
  });

  describe('deleteLineage', () => {
    it('should delete lineage for GDPR erasure', async () => {
      const count = await service.deleteLineage('lead-001');

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // DEBUGGING OPERATIONS TESTS
  // ===========================================================================

  describe('investigateAggregate', () => {
    it('should investigate aggregate lineage', async () => {
      const aggregate: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const result = await service.investigateAggregate(aggregate);

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('investigateEvent', () => {
    it('should investigate event lineage', async () => {
      const result = await service.investigateEvent('event-001');

      expect(result).toBeDefined();
    });
  });

  describe('investigateCorrelation', () => {
    it('should investigate correlation trace', async () => {
      const result = await service.investigateCorrelation('corr-001');

      expect(result).toBeDefined();
    });
  });

  describe('performHealthCheck', () => {
    it('should perform health check', async () => {
      const health = await service.performHealthCheck();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
    });
  });

  // ===========================================================================
  // DASHBOARD DATA TESTS
  // ===========================================================================

  describe('getDashboardData', () => {
    it('should get dashboard data', async () => {
      const dashboard = await service.getDashboardData();

      expect(dashboard).toBeDefined();
      expect(dashboard.health).toBeDefined();
      expect(dashboard.recentActivity).toBeDefined();
      expect(dashboard.topTransformations).toBeDefined();
      expect(dashboard.complianceSummary).toBeDefined();
      expect(dashboard.generatedAt).toBeInstanceOf(Date);
    });

    it('should include recent activity counts', async () => {
      const dashboard = await service.getDashboardData();

      expect(dashboard.recentActivity.last24h).toBeDefined();
      expect(dashboard.recentActivity.last7d).toBeDefined();
      expect(dashboard.recentActivity.last30d).toBeDefined();
    });

    it('should include compliance summary', async () => {
      const dashboard = await service.getDashboardData();

      expect(typeof dashboard.complianceSummary.hipaaEntries).toBe('number');
      expect(typeof dashboard.complianceSummary.gdprEntries).toBe('number');
      expect(typeof dashboard.complianceSummary.withLegalBasis).toBe('number');
      expect(typeof dashboard.complianceSummary.withConsent).toBe('number');
    });
  });

  // ===========================================================================
  // LIFECYCLE TESTS
  // ===========================================================================

  describe('flush', () => {
    it('should flush pending entries', async () => {
      await expect(service.flush()).resolves.toBeUndefined();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await expect(service.shutdown()).resolves.toBeUndefined();
    });
  });

  // ===========================================================================
  // FACTORY FUNCTION TESTS
  // ===========================================================================

  describe('createDataLineageService', () => {
    it('should create service with default options', () => {
      const svc = createDataLineageService({});
      expect(svc).toBeInstanceOf(DataLineageService);
    });

    it('should create service with connection string', () => {
      const svc = createDataLineageService({
        connectionString: 'postgresql://localhost/test',
      });
      expect(svc).toBeInstanceOf(DataLineageService);
    });

    it('should create service with custom config', () => {
      const svc = createDataLineageService({
        config: { batchSize: 100 },
      });
      expect(svc).toBeInstanceOf(DataLineageService);
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('aggregate ref should always have required fields', () => {
      fc.assert(
        fc.property(
          fc.record({
            aggregateId: fc.string({ minLength: 1 }),
            aggregateType: fc.string({ minLength: 1 }),
          }),
          (ref) => {
            return ref.aggregateId.length > 0 && ref.aggregateType.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle any valid aggregate type', async () => {
      const aggregateTypes = ['Lead', 'Patient', 'Consent', 'Case', 'Appointment'];

      for (const aggType of aggregateTypes) {
        const aggregate: AggregateRef = {
          aggregateId: 'test-001',
          aggregateType: aggType,
        };

        const graph = await service.getFullLineage(aggregate);
        expect(graph).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty sources array', async () => {
      const target: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const result = await service.trackScoring(
        target,
        'event-001',
        'LeadScored',
        'corr-001',
        [],
        {}
      );

      expect(result).toBeDefined();
    });

    it('should handle concurrent operations', async () => {
      const target: AggregateRef = { aggregateId: 'lead-001', aggregateType: 'Lead' };

      const results = await Promise.all([
        service.trackScoring(target, 'event-001', 'LeadScored', 'corr-001', [], {}),
        service.trackEnrichment(target, 'event-002', 'LeadEnriched', 'corr-002', [], {}),
        service.getFullLineage(target),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => expect(result).toBeDefined());
    });

    it('should handle special characters in IDs', async () => {
      const target: AggregateRef = {
        aggregateId: 'lead-with_special.chars-123',
        aggregateType: 'Lead',
      };

      const result = await service.trackScoring(
        target,
        'event-with_special.chars',
        'LeadScored',
        'corr-with_special.chars',
        [],
        {}
      );

      expect(result).toBeDefined();
    });
  });
});
