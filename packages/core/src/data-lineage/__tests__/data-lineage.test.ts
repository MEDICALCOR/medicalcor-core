/**
 * M15: Data Lineage Tracking Tests
 *
 * Comprehensive tests for data lineage tracking functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  createInMemoryLineageStore,
  createLineageTracker,
  createLineageGraphBuilder,
  createComplianceLineageService,
  createDebugLineageReporter,
  createDataLineageSystem,
  type LineageEntry,
  type DataSource,
  type LineageContext,
} from '../index.js';
import type { StoredEvent } from '../../event-store.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestEvent(overrides?: Partial<StoredEvent>): StoredEvent {
  return {
    id: uuidv4(),
    type: 'LeadScored',
    aggregateId: uuidv4(),
    aggregateType: 'Lead',
    version: 1,
    payload: { score: 85 },
    metadata: {
      correlationId: uuidv4(),
      causationId: undefined,
      idempotencyKey: uuidv4(),
      timestamp: new Date().toISOString(),
      source: 'test',
    },
    ...overrides,
  };
}

function createTestContext(overrides?: Partial<LineageContext>): LineageContext {
  return {
    service: 'test-service',
    version: '1.0.0',
    actor: {
      id: 'test-user',
      type: 'user',
      name: 'Test User',
    },
    ...overrides,
  };
}

function createTestSources(): DataSource[] {
  return [
    {
      aggregateId: uuidv4(),
      aggregateType: 'WebForm',
      eventId: uuidv4(),
      eventType: 'FormSubmitted',
      fields: ['name', 'email', 'phone'],
    },
    {
      aggregateId: uuidv4(),
      aggregateType: 'Interaction',
      eventId: uuidv4(),
      eventType: 'InteractionRecorded',
    },
  ];
}

// =============================================================================
// IN-MEMORY STORE TESTS
// =============================================================================

describe('InMemoryLineageStore', () => {
  let store: ReturnType<typeof createInMemoryLineageStore>;

  beforeEach(() => {
    store = createInMemoryLineageStore();
  });

  it('should save and retrieve a lineage entry', async () => {
    const entry: LineageEntry = {
      id: uuidv4(),
      targetAggregateId: 'lead-123',
      targetAggregateType: 'Lead',
      triggerEventId: 'event-456',
      triggerEventType: 'LeadScored',
      transformationType: 'scoring',
      sources: createTestSources(),
      quality: { confidence: 0.9, completeness: 1.0 },
      correlationId: 'corr-789',
      createdAt: new Date().toISOString(),
    };

    await store.save(entry);
    const result = await store.getByAggregateId('lead-123', 'Lead');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: entry.id,
      targetAggregateId: 'lead-123',
      transformationType: 'scoring',
    });
  });

  it('should query entries with filters', async () => {
    const leadId = 'lead-123';

    // Create entries with different transformation types
    const entries: LineageEntry[] = [
      {
        id: uuidv4(),
        targetAggregateId: leadId,
        targetAggregateType: 'Lead',
        triggerEventId: uuidv4(),
        triggerEventType: 'LeadScored',
        transformationType: 'scoring',
        sources: [],
        correlationId: 'corr-1',
        createdAt: new Date(Date.now() - 1000).toISOString(),
      },
      {
        id: uuidv4(),
        targetAggregateId: leadId,
        targetAggregateType: 'Lead',
        triggerEventId: uuidv4(),
        triggerEventType: 'LeadEnriched',
        transformationType: 'enrichment',
        sources: [],
        correlationId: 'corr-2',
        createdAt: new Date().toISOString(),
      },
    ];

    await store.saveBatch(entries);

    // Query by transformation type
    const scoringResult = await store.query({
      aggregateId: leadId,
      transformationType: 'scoring',
    });

    expect(scoringResult.entries).toHaveLength(1);
    expect(scoringResult.entries[0]?.transformationType).toBe('scoring');
  });

  it('should build upstream graph', async () => {
    const targetId = 'lead-final';
    const source1Id = 'source-1';
    const source2Id = 'source-2';

    // Create lineage chain
    const entries: LineageEntry[] = [
      {
        id: uuidv4(),
        targetAggregateId: targetId,
        targetAggregateType: 'Lead',
        triggerEventId: uuidv4(),
        triggerEventType: 'LeadScored',
        transformationType: 'scoring',
        sources: [
          { aggregateId: source1Id, aggregateType: 'Interaction' },
          { aggregateId: source2Id, aggregateType: 'WebForm' },
        ],
        correlationId: 'corr-1',
        createdAt: new Date().toISOString(),
      },
    ];

    await store.saveBatch(entries);

    const graph = await store.getUpstreamSources(targetId);

    expect(graph.nodes).toHaveLength(3); // target + 2 sources
    expect(graph.edges).toHaveLength(2);
    expect(graph.direction).toBe('upstream');
  });

  it('should delete entries by aggregate ID', async () => {
    const aggregateId = 'lead-to-delete';

    await store.save({
      id: uuidv4(),
      targetAggregateId: aggregateId,
      targetAggregateType: 'Lead',
      triggerEventId: uuidv4(),
      triggerEventType: 'LeadScored',
      transformationType: 'scoring',
      sources: [],
      correlationId: 'corr-1',
      createdAt: new Date().toISOString(),
    });

    expect(store.size()).toBe(1);

    const deletedCount = await store.deleteByAggregateId(aggregateId);

    expect(deletedCount).toBe(1);
    expect(store.size()).toBe(0);
  });
});

// =============================================================================
// LINEAGE TRACKER TESTS
// =============================================================================

describe('LineageTracker', () => {
  let store: ReturnType<typeof createInMemoryLineageStore>;
  let tracker: ReturnType<typeof createLineageTracker>;

  beforeEach(() => {
    store = createInMemoryLineageStore();
    tracker = createLineageTracker(store, { asyncProcessing: false });
  });

  it('should track lineage from an event', async () => {
    const event = createTestEvent();
    const sources = createTestSources();
    const context = createTestContext();

    const entry = await tracker.trackFromEvent(event, sources, context, {
      confidence: 0.95,
    });

    expect(entry).not.toBeNull();
    expect(entry?.targetAggregateId).toBe(event.aggregateId);
    expect(entry?.triggerEventId).toBe(event.id);
    expect(entry?.sources).toHaveLength(2);
    expect(entry?.quality?.confidence).toBe(0.95);
  });

  it('should track scoring operations', async () => {
    const entry = await tracker.trackScoring(
      'lead-123',
      'Lead',
      'event-456',
      'LeadScored',
      'corr-789',
      createTestSources(),
      createTestContext(),
      {
        scoreValue: 85,
        algorithm: 'ml-scoring-v2',
        factors: ['engagement', 'intent', 'fit'],
      }
    );

    expect(entry.transformationType).toBe('scoring');
    expect(entry.metadata?.scoreDetails).toMatchObject({
      scoreValue: 85,
      algorithm: 'ml-scoring-v2',
    });
  });

  it('should track enrichment operations', async () => {
    const entry = await tracker.trackEnrichment(
      'lead-123',
      'Lead',
      'event-456',
      'LeadEnriched',
      'corr-789',
      createTestSources(),
      createTestContext(),
      {
        model: 'gpt-4o',
        enrichedFields: ['intent', 'sentiment', 'keyEntities'],
        confidence: 0.92,
      }
    );

    expect(entry.transformationType).toBe('enrichment');
    expect(entry.quality?.confidence).toBe(0.92);
    expect(entry.processingContext?.model).toBe('gpt-4o');
  });

  it('should track pattern detection', async () => {
    const entry = await tracker.trackPatternDetection(
      'lead-123',
      'Lead',
      'corr-789',
      createTestSources(),
      createTestContext(),
      {
        patternType: 'high_engagement',
        confidence: 0.85,
        supportingEventCount: 5,
      }
    );

    expect(entry.transformationType).toBe('pattern_detection');
    expect(entry.metadata?.patternDetails).toMatchObject({
      patternType: 'high_engagement',
      confidence: 0.85,
    });
  });

  it('should track consent processing', async () => {
    const entry = await tracker.trackConsentProcessing(
      'patient-123',
      'Patient',
      'event-456',
      'ConsentGranted',
      'corr-789',
      'consent-abc',
      createTestContext(),
      {
        action: 'grant',
        purposes: ['marketing', 'analytics'],
      }
    );

    expect(entry.transformationType).toBe('consent_processing');
    expect(entry.compliance?.consentId).toBe('consent-abc');
    expect(entry.compliance?.legalBasis).toBe('consent');
  });

  it('should skip low quality entries when threshold set', async () => {
    const trackerWithThreshold = createLineageTracker(store, {
      minQualityConfidence: 0.7,
      asyncProcessing: false,
    });

    const event = createTestEvent();
    const entry = await trackerWithThreshold.trackFromEvent(event, [], undefined, {
      confidence: 0.5, // Below threshold
    });

    expect(entry).toBeNull();
    expect(store.size()).toBe(0);
  });
});

// =============================================================================
// GRAPH BUILDER TESTS
// =============================================================================

describe('LineageGraphBuilder', () => {
  let store: ReturnType<typeof createInMemoryLineageStore>;
  let graphBuilder: ReturnType<typeof createLineageGraphBuilder>;

  beforeEach(async () => {
    store = createInMemoryLineageStore();
    graphBuilder = createLineageGraphBuilder(store);

    // Create a multi-level lineage chain
    const entries: LineageEntry[] = [
      // Level 1: Raw data -> Lead
      {
        id: uuidv4(),
        targetAggregateId: 'lead-1',
        targetAggregateType: 'Lead',
        triggerEventId: uuidv4(),
        triggerEventType: 'LeadCreated',
        transformationType: 'ingestion',
        sources: [{ aggregateId: 'form-1', aggregateType: 'WebForm' }],
        correlationId: 'corr-1',
        createdAt: new Date(Date.now() - 3000).toISOString(),
      },
      // Level 2: Lead enrichment
      {
        id: uuidv4(),
        targetAggregateId: 'lead-1',
        targetAggregateType: 'Lead',
        triggerEventId: uuidv4(),
        triggerEventType: 'LeadEnriched',
        transformationType: 'enrichment',
        sources: [
          { aggregateId: 'lead-1', aggregateType: 'Lead' },
          { aggregateId: 'interaction-1', aggregateType: 'Interaction' },
        ],
        correlationId: 'corr-2',
        createdAt: new Date(Date.now() - 2000).toISOString(),
      },
      // Level 3: Lead scored
      {
        id: uuidv4(),
        targetAggregateId: 'lead-1',
        targetAggregateType: 'Lead',
        triggerEventId: uuidv4(),
        triggerEventType: 'LeadScored',
        transformationType: 'scoring',
        sources: [{ aggregateId: 'lead-1', aggregateType: 'Lead' }],
        compliance: {
          frameworks: ['GDPR'],
          legalBasis: 'legitimate_interests',
          sensitivity: 'pii',
        },
        correlationId: 'corr-3',
        createdAt: new Date(Date.now() - 1000).toISOString(),
      },
      // Downstream: Lead -> Patient conversion
      {
        id: uuidv4(),
        targetAggregateId: 'patient-1',
        targetAggregateType: 'Patient',
        triggerEventId: uuidv4(),
        triggerEventType: 'PatientCreated',
        transformationType: 'transformation',
        sources: [{ aggregateId: 'lead-1', aggregateType: 'Lead' }],
        compliance: {
          frameworks: ['HIPAA', 'GDPR'],
          sensitivity: 'phi',
        },
        correlationId: 'corr-4',
        createdAt: new Date().toISOString(),
      },
    ];

    await store.saveBatch(entries);
  });

  it('should build upstream graph', async () => {
    const graph = await graphBuilder.buildUpstreamGraph('lead-1', 'Lead');

    expect(graph.direction).toBe('upstream');
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.stats.uniqueTransformations).toBeGreaterThan(0);
  });

  it('should build downstream graph', async () => {
    const graph = await graphBuilder.buildDownstreamGraph('lead-1', 'Lead');

    expect(graph.direction).toBe('downstream');
    // Should find patient-1 as downstream
    const patientNode = graph.nodes.find((n) => n.id === 'patient-1');
    expect(patientNode).toBeDefined();
  });

  it('should build full bidirectional graph', async () => {
    const graph = await graphBuilder.buildFullGraph('lead-1', 'Lead');

    expect(graph.direction).toBe('both');
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('should analyze impact', async () => {
    const impact = await graphBuilder.analyzeImpact('lead-1', 'Lead');

    expect(impact.source.aggregateId).toBe('lead-1');
    expect(impact.directlyAffected.length).toBeGreaterThanOrEqual(0);
    expect(impact.totalImpactedCount).toBeGreaterThanOrEqual(0);
  });

  it('should generate visualization', async () => {
    const graph = await graphBuilder.buildFullGraph('lead-1', 'Lead');
    const viz = graphBuilder.generateVisualization(graph);

    expect(viz.mermaid).toContain('graph LR');
    expect(viz.d3Graph.nodes.length).toBe(graph.nodes.length);
    expect(viz.summary).toContain('Lineage');
  });

  it('should filter by transformation types', async () => {
    const graph = await graphBuilder.buildUpstreamGraph('lead-1', 'Lead', {
      transformationTypes: ['scoring'],
    });

    for (const edge of graph.edges) {
      expect(edge.transformationType).toBe('scoring');
    }
  });
});

// =============================================================================
// COMPLIANCE SERVICE TESTS
// =============================================================================

describe('ComplianceLineageService', () => {
  let store: ReturnType<typeof createInMemoryLineageStore>;
  let compliance: ReturnType<typeof createComplianceLineageService>;

  beforeEach(async () => {
    store = createInMemoryLineageStore();
    compliance = createComplianceLineageService(store);

    // Create compliance-focused entries
    const entries: LineageEntry[] = [
      {
        id: uuidv4(),
        targetAggregateId: 'patient-1',
        targetAggregateType: 'Patient',
        triggerEventId: uuidv4(),
        triggerEventType: 'PatientCreated',
        transformationType: 'ingestion',
        sources: [{ aggregateId: 'lead-1', aggregateType: 'Lead' }],
        compliance: {
          frameworks: ['HIPAA', 'GDPR'],
          legalBasis: 'contract',
          sensitivity: 'phi',
          purpose: 'Patient onboarding',
          consentId: 'consent-123',
        },
        actor: {
          id: 'user-1',
          type: 'user',
          name: 'Dr. Smith',
        },
        processingContext: {
          service: 'patient-service',
        },
        correlationId: 'corr-1',
        createdAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        targetAggregateId: 'patient-1',
        targetAggregateType: 'Patient',
        triggerEventId: uuidv4(),
        triggerEventType: 'PatientUpdated',
        transformationType: 'manual_update',
        sources: [],
        compliance: {
          frameworks: ['HIPAA'],
          legalBasis: 'contract',
          sensitivity: 'phi',
          purpose: 'Treatment documentation',
        },
        actor: {
          id: 'user-2',
          type: 'user',
          name: 'Nurse Johnson',
        },
        processingContext: {
          service: 'ehr-service',
        },
        correlationId: 'corr-2',
        createdAt: new Date().toISOString(),
      },
    ];

    await store.saveBatch(entries);
  });

  it('should generate HIPAA compliance report', async () => {
    const report = await compliance.generateComplianceReport('patient-1', 'Patient', 'HIPAA');

    expect(report.framework).toBe('HIPAA');
    expect(report.subject.aggregateId).toBe('patient-1');
    expect(report.processingActivities.length).toBeGreaterThan(0);
  });

  it('should generate DSAR report', async () => {
    const report = await compliance.generateDSARReport('patient-1', 'Patient', 'access');

    expect(report.subjectId).toBe('patient-1');
    expect(report.requestType).toBe('access');
    expect(report.processingActivities.length).toBeGreaterThan(0);
    expect(report.consents.length).toBeGreaterThan(0);
  });

  it('should assess lawfulness', async () => {
    const assessment = await compliance.assessLawfulness('patient-1', 'Patient');

    expect(assessment.aggregateId).toBe('patient-1');
    expect(assessment.processingBases.length).toBeGreaterThan(0);
    // All entries have legal basis, should be lawful
    expect(assessment.isLawful).toBe(true);
  });

  it('should generate HIPAA audit trail', async () => {
    const auditTrail = await compliance.generateHIPAAAuditTrail('patient-1', 'Patient');

    expect(auditTrail.length).toBeGreaterThan(0);
    for (const entry of auditTrail) {
      expect(entry.phiId).toBe('patient-1');
      expect(entry.phiType).toBe('Patient');
    }
  });

  it('should check minimum necessary compliance', async () => {
    const result = await compliance.checkMinimumNecessary('patient-1', 'Patient');

    expect(result.accessPatterns.length).toBeGreaterThanOrEqual(0);
    // No fields tracked in test data, so should be compliant
    expect(result.isCompliant).toBe(true);
  });

  it('should get erasure scope', async () => {
    const scope = await compliance.getErasureScope('patient-1', 'Patient');

    expect(scope.primaryData.aggregateId).toBe('patient-1');
    expect(scope.totalAffectedCount).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// DEBUG REPORTER TESTS
// =============================================================================

describe('DebugLineageReporter', () => {
  let store: ReturnType<typeof createInMemoryLineageStore>;
  let debug: ReturnType<typeof createDebugLineageReporter>;

  beforeEach(async () => {
    store = createInMemoryLineageStore();
    debug = createDebugLineageReporter(store);

    // Create some lineage data for testing
    const entries: LineageEntry[] = [
      {
        id: uuidv4(),
        targetAggregateId: 'lead-1',
        targetAggregateType: 'Lead',
        triggerEventId: 'event-1',
        triggerEventType: 'LeadScored',
        transformationType: 'scoring',
        sources: [{ aggregateId: 'form-1', aggregateType: 'WebForm' }],
        quality: { confidence: 0.9 },
        correlationId: 'corr-1',
        processingContext: {
          service: 'scoring-service',
          durationMs: 150,
        },
        createdAt: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        targetAggregateId: 'lead-1',
        targetAggregateType: 'Lead',
        triggerEventId: 'event-2',
        triggerEventType: 'LeadEnriched',
        transformationType: 'enrichment',
        sources: [],
        quality: { confidence: 0.4 }, // Low quality - should trigger warning
        correlationId: 'corr-1',
        processingContext: {
          service: 'enrichment-service',
          durationMs: 500,
        },
        createdAt: new Date().toISOString(),
      },
    ];

    await store.saveBatch(entries);
  });

  it('should investigate aggregate', async () => {
    const result = await debug.investigateAggregate('lead-1', 'Lead');

    expect(result.query.type).toBe('aggregate');
    expect(result.query.id).toBe('lead-1');
    expect(result.lineageEntries.length).toBe(2);
    expect(result.issues.length).toBeGreaterThan(0); // Should find low quality issue
    expect(result.visualization.mermaid).toContain('graph');
    expect(result.summary).toContain('Investigation');
  });

  it('should investigate event', async () => {
    const result = await debug.investigateEvent('event-1');

    expect(result.query.type).toBe('event');
    expect(result.lineageEntries.length).toBe(1);
  });

  it('should investigate correlation', async () => {
    const result = await debug.investigateCorrelation('corr-1');

    expect(result.query.type).toBe('correlation');
    expect(result.lineageEntries.length).toBe(2);
  });

  it('should perform health check', async () => {
    const health = await debug.performHealthCheck();

    expect(health.status).toBeDefined();
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(health.checks.length).toBeGreaterThan(0);
    expect(health.stats.totalEntries).toBe(2);
  });

  it('should generate trace', async () => {
    const trace = await debug.generateTrace('lead-1', 'Lead');

    expect(trace.target.aggregateId).toBe('lead-1');
    expect(trace.lineageEntries.length).toBe(2);
    expect(trace.causationChain.length).toBe(2);
    expect(trace.stats.chainLength).toBe(2);
    // Should detect low quality issue
    expect(trace.issues.some((i) => i.type === 'quality_below_threshold')).toBe(true);
  });
});

// =============================================================================
// DATA LINEAGE SYSTEM INTEGRATION TESTS
// =============================================================================

describe('DataLineageSystem Integration', () => {
  let system: ReturnType<typeof createDataLineageSystem>;

  beforeEach(() => {
    const store = createInMemoryLineageStore();
    system = createDataLineageSystem(store);
  });

  it('should create a complete lineage system', () => {
    expect(system.tracker).toBeDefined();
    expect(system.graphBuilder).toBeDefined();
    expect(system.compliance).toBeDefined();
    expect(system.debug).toBeDefined();
    expect(system.store).toBeDefined();
  });

  it('should track and query lineage end-to-end', async () => {
    // Track scoring
    const entry = await system.tracker.trackScoring(
      'lead-123',
      'Lead',
      'event-1',
      'LeadScored',
      'corr-1',
      [{ aggregateId: 'form-1', aggregateType: 'WebForm' }],
      { service: 'test-service' },
      { scoreValue: 85, algorithm: 'ml-v2', factors: ['engagement'] }
    );

    // Verify tracking
    expect(entry.id).toBeDefined();

    // Query
    const result = await system.store.query({
      aggregateId: 'lead-123',
    });
    expect(result.entries).toHaveLength(1);

    // Build graph
    const graph = await system.graphBuilder.buildUpstreamGraph('lead-123', 'Lead');
    expect(graph.nodes.length).toBeGreaterThan(0);

    // Health check
    const health = await system.debug.performHealthCheck();
    expect(health.stats.totalEntries).toBe(1);
  });

  it('should support full compliance workflow', async () => {
    // Track consent
    await system.tracker.trackConsentProcessing(
      'patient-1',
      'Patient',
      'event-1',
      'ConsentGranted',
      'corr-1',
      'consent-abc',
      { service: 'consent-service' },
      { action: 'grant', purposes: ['treatment'] }
    );

    // Track PHI access
    await system.tracker.trackEnrichment(
      'patient-1',
      'Patient',
      'event-2',
      'PatientEnriched',
      'corr-2',
      [],
      {
        service: 'ehr-service',
        complianceFrameworks: ['HIPAA'],
        sensitivity: 'phi',
      },
      { model: 'gpt-4o', enrichedFields: ['summary'], confidence: 0.95 }
    );

    // Generate compliance report
    const report = await system.compliance.generateComplianceReport(
      'patient-1',
      'Patient',
      'HIPAA'
    );

    expect(report.processingActivities.length).toBeGreaterThan(0);
  });
});
