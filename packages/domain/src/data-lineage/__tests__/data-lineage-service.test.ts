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
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    it('should get dashboard data', async () => {
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
  });
});
