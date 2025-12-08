/**
 * @fileoverview Data Lineage Service Tests
 *
 * Tests for the Data Lineage domain service that provides
 * lineage tracking, compliance reporting, and debugging capabilities.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DataLineageService,
  createDataLineageService,
  type DataLineageServiceDependencies,
  type AggregateRef,
} from '../data-lineage/data-lineage-service.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockAggregateRef(overrides: Partial<AggregateRef> = {}): AggregateRef {
  return {
    aggregateId: '550e8400-e29b-41d4-a716-446655440000',
    aggregateType: 'Lead',
    ...overrides,
  };
}

function createMockLineageEntry() {
  return {
    id: 'lineage-001',
    aggregateId: '550e8400-e29b-41d4-a716-446655440000',
    aggregateType: 'Lead',
    eventId: 'event-001',
    eventType: 'LeadScored',
    correlationId: 'corr-001',
    transformationType: 'scoring',
    sources: [],
    timestamp: new Date(),
    quality: { confidence: 0.95 },
    compliance: { frameworks: ['HIPAA', 'GDPR'] },
  };
}

function createMockLineageGraph() {
  return {
    rootNode: {
      id: 'node-001',
      aggregateId: '550e8400-e29b-41d4-a716-446655440000',
      aggregateType: 'Lead',
    },
    nodes: [],
    edges: [],
    depth: 1,
    nodeCount: 1,
    edgeCount: 0,
  };
}

function createMockHealthCheck() {
  return {
    status: 'healthy' as const,
    storeConnected: true,
    pendingEntries: 0,
    lastEntryTime: new Date(),
    issues: [],
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('DataLineageService', () => {
  let service: DataLineageService;
  let deps: DataLineageServiceDependencies;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {};
    service = new DataLineageService(deps);
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  describe('constructor', () => {
    it('should create service with in-memory store by default', () => {
      const newService = new DataLineageService({});
      expect(newService).toBeDefined();
    });

    it('should accept custom config', () => {
      const newService = new DataLineageService({
        config: {
          batchSize: 100,
          flushIntervalMs: 5000,
        },
      });
      expect(newService).toBeDefined();
    });
  });

  describe('createDataLineageService factory', () => {
    it('should create service via factory function', () => {
      const newService = createDataLineageService({});
      expect(newService).toBeInstanceOf(DataLineageService);
    });
  });

  // ==========================================================================
  // Lineage Tracking - Integration Tests
  // ==========================================================================

  describe('trackScoring', () => {
    it('should track scoring lineage and return entry', async () => {
      const target = createMockAggregateRef();
      const result = await service.trackScoring(
        target,
        'event-001',
        'LeadScored',
        'corr-001',
        [{ id: 'src-001', type: 'external', name: 'HubSpot' }],
        { userId: 'user-001', timestamp: new Date() },
        { scoreValue: 85, algorithm: 'ml-v2', factors: ['urgency', 'budget'] }
      );

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('scoring');
    });

    it('should track scoring without optional score details', async () => {
      const target = createMockAggregateRef();
      const result = await service.trackScoring(target, 'event-002', 'LeadScored', 'corr-002', [], {
        userId: 'user-001',
        timestamp: new Date(),
      });

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('scoring');
    });
  });

  describe('trackEnrichment', () => {
    it('should track enrichment lineage', async () => {
      const target = createMockAggregateRef();
      const result = await service.trackEnrichment(
        target,
        'event-002',
        'LeadEnriched',
        'corr-002',
        [],
        { userId: 'user-001', timestamp: new Date() },
        { model: 'gpt-4', enrichedFields: ['industry', 'size'], confidence: 0.92 }
      );

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('enrichment');
    });
  });

  describe('trackPatternDetection', () => {
    it('should track pattern detection lineage', async () => {
      const target = createMockAggregateRef();
      const result = await service.trackPatternDetection(
        target,
        'corr-003',
        [],
        { userId: 'user-001', timestamp: new Date() },
        { patternType: 'churn-risk', confidence: 0.88, supportingEventCount: 15 }
      );

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('pattern_detection');
    });
  });

  describe('trackConsentProcessing', () => {
    it('should track consent processing lineage', async () => {
      const target = createMockAggregateRef();
      const result = await service.trackConsentProcessing(
        target,
        'event-004',
        'ConsentGranted',
        'corr-004',
        'consent-001',
        { userId: 'user-001', timestamp: new Date() },
        { action: 'grant', purposes: ['marketing', 'analytics'] }
      );

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('consent_processing');
    });

    it('should track consent withdrawal', async () => {
      const target = createMockAggregateRef();
      const result = await service.trackConsentProcessing(
        target,
        'event-005',
        'ConsentWithdrawn',
        'corr-005',
        'consent-001',
        { userId: 'user-001', timestamp: new Date() },
        { action: 'withdraw', purposes: ['marketing'] }
      );

      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // Graph Operations
  // ==========================================================================

  describe('getUpstreamLineage', () => {
    it('should get upstream lineage graph', async () => {
      const target = createMockAggregateRef();
      const result = await service.getUpstreamLineage(target);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
    });

    it('should respect maxDepth parameter', async () => {
      const target = createMockAggregateRef();
      const result = await service.getUpstreamLineage(target, 5);

      expect(result).toBeDefined();
    });
  });

  describe('getDownstreamLineage', () => {
    it('should get downstream lineage graph', async () => {
      const target = createMockAggregateRef();
      const result = await service.getDownstreamLineage(target);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('nodes');
    });

    it('should handle non-existent aggregate', async () => {
      const target = createMockAggregateRef({ aggregateId: 'non-existent' });
      const result = await service.getDownstreamLineage(target);

      expect(result).toBeDefined();
      expect(result.nodes).toBeDefined();
    });
  });

  describe('getFullLineage', () => {
    it('should get full lineage graph', async () => {
      const target = createMockAggregateRef();
      const result = await service.getFullLineage(target);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('edges');
    });
  });

  describe('analyzeImpact', () => {
    it('should analyze impact of changes', async () => {
      const target = createMockAggregateRef();
      const result = await service.analyzeImpact(target);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('directlyAffected');
      expect(result).toHaveProperty('transitivelyAffected');
      expect(result).toHaveProperty('totalImpactedCount');
    });
  });

  // ==========================================================================
  // Compliance Operations
  // ==========================================================================

  describe('generateComplianceReport', () => {
    it('should generate HIPAA compliance report', async () => {
      const target = createMockAggregateRef();
      const result = await service.generateComplianceReport(target, 'HIPAA');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('framework');
    });

    it('should generate GDPR compliance report', async () => {
      const target = createMockAggregateRef();
      const result = await service.generateComplianceReport(target, 'GDPR');

      expect(result).toBeDefined();
    });

    it('should accept period parameter', async () => {
      const target = createMockAggregateRef();
      const period = {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31'),
      };
      const result = await service.generateComplianceReport(target, 'HIPAA', period);

      expect(result).toBeDefined();
    });
  });

  describe('generateDSARReport', () => {
    it('should generate access report', async () => {
      const subject = createMockAggregateRef();
      const result = await service.generateDSARReport(subject, 'access');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('requestType');
    });

    it('should generate portability report', async () => {
      const subject = createMockAggregateRef();
      const result = await service.generateDSARReport(subject, 'portability');

      expect(result).toBeDefined();
    });

    it('should generate erasure report', async () => {
      const subject = createMockAggregateRef();
      const result = await service.generateDSARReport(subject, 'erasure');

      expect(result).toBeDefined();
    });
  });

  describe('assessLawfulness', () => {
    it('should assess lawfulness of processing', async () => {
      const target = createMockAggregateRef();
      const result = await service.assessLawfulness(target);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('isLawful');
    });
  });

  describe('generateHIPAAAuditTrail', () => {
    it('should generate HIPAA audit trail', async () => {
      const phi = createMockAggregateRef();
      const result = await service.generateHIPAAAuditTrail(phi);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should accept period parameter', async () => {
      const phi = createMockAggregateRef();
      const period = {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31'),
      };
      const result = await service.generateHIPAAAuditTrail(phi, period);

      expect(result).toBeDefined();
    });
  });

  describe('checkMinimumNecessary', () => {
    it('should check HIPAA minimum necessary compliance', async () => {
      const phi = createMockAggregateRef();
      const result = await service.checkMinimumNecessary(phi);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('isCompliant');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('accessPatterns');
    });
  });

  describe('getErasureScope', () => {
    it('should get erasure scope for GDPR right to be forgotten', async () => {
      const subject = createMockAggregateRef();
      const result = await service.getErasureScope(subject);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('primaryData');
      expect(result).toHaveProperty('derivedData');
      expect(result).toHaveProperty('retainedData');
      expect(result).toHaveProperty('totalAffectedCount');
    });
  });

  describe('deleteLineage', () => {
    it('should delete lineage for GDPR erasure', async () => {
      // First create some lineage
      const target = createMockAggregateRef();
      await service.trackScoring(target, 'event-001', 'LeadScored', 'corr-001', [], {
        userId: 'user-001',
        timestamp: new Date(),
      });

      const result = await service.deleteLineage(target.aggregateId);

      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Debugging Operations
  // ==========================================================================

  describe('investigateAggregate', () => {
    it('should investigate aggregate lineage', async () => {
      const target = createMockAggregateRef();
      const result = await service.investigateAggregate(target);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('lineageEntries');
    });
  });

  describe('investigateEvent', () => {
    it('should investigate event lineage', async () => {
      const result = await service.investigateEvent('event-001');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('lineageEntries');
    });
  });

  describe('investigateCorrelation', () => {
    it('should investigate correlation/trace', async () => {
      const result = await service.investigateCorrelation('corr-001');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('lineageEntries');
    });
  });

  describe('performHealthCheck', () => {
    it('should perform health check', async () => {
      const result = await service.performHealthCheck();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
    });
  });

  // ==========================================================================
  // Dashboard Data
  // ==========================================================================

  describe('getDashboardData', () => {
    it('should return dashboard data', async () => {
      const result = await service.getDashboardData();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('recentActivity');
      expect(result).toHaveProperty('topTransformations');
      expect(result).toHaveProperty('complianceSummary');
      expect(result).toHaveProperty('generatedAt');
    });

    it('should include recent activity counts', async () => {
      const result = await service.getDashboardData();

      expect(result.recentActivity).toHaveProperty('last24h');
      expect(result.recentActivity).toHaveProperty('last7d');
      expect(result.recentActivity).toHaveProperty('last30d');
    });

    it('should include compliance summary', async () => {
      const result = await service.getDashboardData();

      expect(result.complianceSummary).toHaveProperty('hipaaEntries');
      expect(result.complianceSummary).toHaveProperty('gdprEntries');
      expect(result.complianceSummary).toHaveProperty('withLegalBasis');
      expect(result.complianceSummary).toHaveProperty('withConsent');
    });
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('flush', () => {
    it('should flush pending entries', async () => {
      // Track some entries first
      const target = createMockAggregateRef();
      await service.trackScoring(target, 'event-001', 'LeadScored', 'corr-001', [], {
        userId: 'user-001',
        timestamp: new Date(),
      });

      // Flush should not throw
      await expect(service.flush()).resolves.not.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should shutdown the service', async () => {
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });
});
