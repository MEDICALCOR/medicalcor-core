/**
 * Tests for Lineage Tracker Service
 *
 * Tests event-based lineage tracking, specialized tracking methods,
 * batch processing, and query functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LineageTracker, createLineageTracker, type LineageContext } from '../lineage-tracker.js';
import type { LineageStore, LineageEntry, LineageServiceConfig } from '../types.js';
import type { StoredEvent } from '../../event-store.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Helper to create mock stored event
const createMockEvent = (overrides: Partial<StoredEvent> = {}): StoredEvent => ({
  id: `evt-${Math.random().toString(36).substring(7)}`,
  type: 'LeadCreated',
  aggregateId: 'agg-123',
  aggregateType: 'Lead',
  data: {},
  metadata: {
    correlationId: 'corr-123',
    causationId: 'cause-123',
    timestamp: new Date().toISOString(),
  },
  timestamp: new Date(),
  version: 1,
  ...overrides,
});

// Helper to create mock store
const createMockStore = (): LineageStore => ({
  save: vi.fn().mockResolvedValue(undefined),
  saveBatch: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({ entries: [], total: 0, hasMore: false }),
  getByAggregateId: vi.fn().mockResolvedValue([]),
  getByEventId: vi.fn().mockResolvedValue([]),
  getByCorrelationId: vi.fn().mockResolvedValue([]),
  getUpstreamSources: vi
    .fn()
    .mockResolvedValue({
      nodes: [],
      edges: [],
      rootId: '',
      direction: 'upstream',
      depth: 0,
      stats: { nodeCount: 0, edgeCount: 0 },
    }),
  getDownstreamImpacts: vi
    .fn()
    .mockResolvedValue({
      nodes: [],
      edges: [],
      rootId: '',
      direction: 'downstream',
      depth: 0,
      stats: { nodeCount: 0, edgeCount: 0 },
    }),
  deleteByAggregateId: vi.fn().mockResolvedValue(0),
});

// Helper to create lineage context
const createContext = (overrides: Partial<LineageContext> = {}): LineageContext => ({
  service: 'test-service',
  version: '1.0.0',
  ...overrides,
});

describe('LineageTracker', () => {
  let tracker: LineageTracker;
  let mockStore: LineageStore;

  beforeEach(() => {
    vi.useFakeTimers();
    mockStore = createMockStore();
    // Use sync processing by default for easier testing
    tracker = new LineageTracker(mockStore, { asyncProcessing: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create tracker with default config', () => {
      const t = new LineageTracker(mockStore);
      expect(t).toBeInstanceOf(LineageTracker);
    });

    it('should create tracker with custom config', () => {
      const config: Partial<LineageServiceConfig> = {
        enabled: false,
        batchSize: 50,
        enableLogging: true,
      };
      const t = new LineageTracker(mockStore, config);
      expect(t).toBeInstanceOf(LineageTracker);
    });
  });

  describe('trackFromEvent', () => {
    it('should track lineage from event', async () => {
      const event = createMockEvent();
      const sources = [{ aggregateId: 'src-1', aggregateType: 'Form' }];
      const context = createContext();

      const result = await tracker.trackFromEvent(event, sources, context);

      expect(result).toBeDefined();
      expect(result?.targetAggregateId).toBe(event.aggregateId);
      expect(result?.triggerEventId).toBe(event.id);
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('should return null if tracking disabled', async () => {
      const disabledTracker = new LineageTracker(mockStore, { enabled: false });
      const event = createMockEvent();

      const result = await disabledTracker.trackFromEvent(event, []);

      expect(result).toBeNull();
      expect(mockStore.save).not.toHaveBeenCalled();
    });

    it('should skip low quality entries', async () => {
      const lowQualityTracker = new LineageTracker(mockStore, { minQualityConfidence: 0.8 });
      const event = createMockEvent();
      const quality = { confidence: 0.5, completeness: 1.0 };

      const result = await lowQualityTracker.trackFromEvent(event, [], undefined, quality);

      expect(result).toBeNull();
    });

    it('should use async batch processing when configured', async () => {
      const asyncTracker = new LineageTracker(mockStore, {
        asyncProcessing: true,
        batchSize: 10,
      });
      const event = createMockEvent();

      await asyncTracker.trackFromEvent(event, []);

      // Not immediately saved
      expect(mockStore.save).not.toHaveBeenCalled();
    });

    it('should map event type to transformation type', async () => {
      const event = createMockEvent({ type: 'LeadScored' });

      const result = await tracker.trackFromEvent(event, []);

      expect(result?.transformationType).toBe('scoring');
    });

    it('should use system_update for unknown event types', async () => {
      const event = createMockEvent({ type: 'UnknownEvent' });

      const result = await tracker.trackFromEvent(event, []);

      expect(result?.transformationType).toBe('system_update');
    });

    it('should apply compliance frameworks from event type', async () => {
      const event = createMockEvent({ type: 'PatientCreated' });

      const result = await tracker.trackFromEvent(event, []);

      expect(result?.compliance?.frameworks).toContain('HIPAA');
      expect(result?.compliance?.frameworks).toContain('GDPR');
    });

    it('should use custom compliance from context', async () => {
      const event = createMockEvent();
      const context = createContext({
        complianceFrameworks: ['SOC2'],
        sensitivity: 'internal',
      });

      const result = await tracker.trackFromEvent(event, [], context);

      expect(result?.compliance?.frameworks).toContain('SOC2');
      expect(result?.compliance?.sensitivity).toBe('internal');
    });

    it('should include processing context', async () => {
      const event = createMockEvent();
      const context = createContext({
        service: 'scoring-service',
        version: '2.0.0',
        model: 'gpt-4',
        modelVersion: '0.0.1',
        durationMs: 150,
      });

      const result = await tracker.trackFromEvent(event, [], context);

      expect(result?.processingContext?.service).toBe('scoring-service');
      expect(result?.processingContext?.model).toBe('gpt-4');
      expect(result?.processingContext?.durationMs).toBe(150);
    });

    it('should include actor information', async () => {
      const event = createMockEvent();
      const context = createContext({
        actor: { id: 'user-123', type: 'user', name: 'John Doe' },
      });

      const result = await tracker.trackFromEvent(event, [], context);

      expect(result?.actor?.id).toBe('user-123');
      expect(result?.actor?.type).toBe('user');
    });
  });

  describe('trackScoring', () => {
    it('should track scoring lineage', async () => {
      const context = createContext({
        actor: { id: 'system', type: 'system' },
      });

      const result = await tracker.trackScoring(
        'lead-123',
        'Lead',
        'evt-1',
        'LeadScored',
        'corr-1',
        [{ aggregateId: 'msg-1', aggregateType: 'Message' }],
        context,
        { scoreValue: 4.5, algorithm: 'ml-v2', factors: ['urgency', 'budget'] }
      );

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('scoring');
      expect(result.transformationDescription).toContain('4.5');
      expect(mockStore.save).toHaveBeenCalled();
    });

    it('should set confidence based on sources', async () => {
      const context = createContext();

      const resultWithSources = await tracker.trackScoring(
        'lead-1',
        'Lead',
        'evt-1',
        'LeadScored',
        'corr-1',
        [{ aggregateId: 's1', aggregateType: 'Source' }],
        context
      );
      expect(resultWithSources.quality?.confidence).toBe(0.9);

      const resultWithoutSources = await tracker.trackScoring(
        'lead-2',
        'Lead',
        'evt-2',
        'LeadScored',
        'corr-2',
        [],
        context
      );
      expect(resultWithoutSources.quality?.confidence).toBe(0.5);
    });

    it('should include score details in metadata', async () => {
      const scoreDetails = {
        scoreValue: 5,
        algorithm: 'rule-based',
        factors: ['intent', 'readiness'],
      };

      const result = await tracker.trackScoring(
        'lead-1',
        'Lead',
        'evt-1',
        'LeadScored',
        'corr-1',
        [],
        createContext(),
        scoreDetails
      );

      expect(result.metadata?.scoreDetails).toEqual(scoreDetails);
    });
  });

  describe('trackEnrichment', () => {
    it('should track enrichment lineage', async () => {
      const context = createContext({ model: 'gpt-4o' });
      const enrichmentDetails = {
        model: 'gpt-4o',
        enrichedFields: ['intent', 'sentiment'],
        confidence: 0.95,
      };

      const result = await tracker.trackEnrichment(
        'lead-123',
        'Lead',
        'evt-1',
        'LeadEnriched',
        'corr-1',
        [{ aggregateId: 'msg-1', aggregateType: 'Message' }],
        context,
        enrichmentDetails
      );

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('enrichment');
      expect(result.transformationDescription).toContain('gpt-4o');
      expect(result.transformationDescription).toContain('intent');
    });

    it('should use enrichment confidence for quality', async () => {
      const result = await tracker.trackEnrichment(
        'lead-1',
        'Lead',
        'evt-1',
        'LeadEnriched',
        'corr-1',
        [],
        createContext(),
        { model: 'test', enrichedFields: ['field'], confidence: 0.85 }
      );

      expect(result.quality?.confidence).toBe(0.85);
    });

    it('should set default actor for system enrichment', async () => {
      const result = await tracker.trackEnrichment(
        'lead-1',
        'Lead',
        'evt-1',
        'LeadEnriched',
        'corr-1',
        [],
        { service: 'enrichment-service' }
      );

      expect(result.actor?.type).toBe('system');
      expect(result.actor?.name).toContain('AI Enrichment');
    });
  });

  describe('trackPatternDetection', () => {
    it('should track pattern detection lineage', async () => {
      const patternDetails = {
        patternType: 'appointment-booking',
        confidence: 0.92,
        supportingEventCount: 5,
      };

      const result = await tracker.trackPatternDetection(
        'patient-123',
        'Patient',
        'corr-1',
        [{ aggregateId: 'evt-1', aggregateType: 'Event' }],
        createContext(),
        patternDetails
      );

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('pattern_detection');
      expect(result.transformationDescription).toContain('appointment-booking');
      expect(result.transformationDescription).toContain('0.92');
    });

    it('should set completeness based on event count', async () => {
      const highCountResult = await tracker.trackPatternDetection(
        'p1',
        'Patient',
        'corr-1',
        [],
        createContext(),
        { patternType: 'test', confidence: 0.9, supportingEventCount: 5 }
      );
      expect(highCountResult.quality?.completeness).toBe(1.0);

      const lowCountResult = await tracker.trackPatternDetection(
        'p2',
        'Patient',
        'corr-2',
        [],
        createContext(),
        { patternType: 'test', confidence: 0.9, supportingEventCount: 2 }
      );
      expect(lowCountResult.quality?.completeness).toBe(0.7);
    });

    it('should include HIPAA and GDPR compliance', async () => {
      const result = await tracker.trackPatternDetection(
        'p1',
        'Patient',
        'corr-1',
        [],
        createContext(),
        { patternType: 'test', confidence: 0.9, supportingEventCount: 5 }
      );

      expect(result.compliance?.frameworks).toContain('HIPAA');
      expect(result.compliance?.frameworks).toContain('GDPR');
    });
  });

  describe('trackConsentProcessing', () => {
    it('should track consent grant', async () => {
      const consentDetails = {
        action: 'grant' as const,
        purposes: ['marketing', 'analytics'],
      };

      const result = await tracker.trackConsentProcessing(
        'lead-123',
        'Lead',
        'evt-1',
        'ConsentGranted',
        'corr-1',
        'consent-abc',
        createContext(),
        consentDetails
      );

      expect(result).toBeDefined();
      expect(result.transformationType).toBe('consent_processing');
      expect(result.transformationDescription).toContain('grant');
      expect(result.compliance?.legalBasis).toBe('consent');
      expect(result.compliance?.consentId).toBe('consent-abc');
    });

    it('should track consent withdrawal', async () => {
      const consentDetails = {
        action: 'withdraw' as const,
        purposes: ['marketing'],
      };

      const result = await tracker.trackConsentProcessing(
        'lead-123',
        'Lead',
        'evt-1',
        'ConsentWithdrawn',
        'corr-1',
        'consent-abc',
        createContext(),
        consentDetails
      );

      expect(result.transformationDescription).toContain('withdraw');
    });

    it('should have full quality confidence for consent', async () => {
      const result = await tracker.trackConsentProcessing(
        'lead-1',
        'Lead',
        'evt-1',
        'ConsentGranted',
        'corr-1',
        'c1',
        createContext(),
        { action: 'grant', purposes: ['all'] }
      );

      expect(result.quality?.confidence).toBe(1.0);
      expect(result.quality?.completeness).toBe(1.0);
    });
  });

  describe('batch processing', () => {
    let asyncTracker: LineageTracker;

    beforeEach(() => {
      asyncTracker = new LineageTracker(mockStore, {
        asyncProcessing: true,
        batchSize: 3,
      });
    });

    it('should accumulate entries in batch', async () => {
      await asyncTracker.trackFromEvent(createMockEvent(), []);
      await asyncTracker.trackFromEvent(createMockEvent(), []);

      expect(mockStore.saveBatch).not.toHaveBeenCalled();
    });

    it('should flush when batch size reached', async () => {
      await asyncTracker.trackFromEvent(createMockEvent(), []);
      await asyncTracker.trackFromEvent(createMockEvent(), []);
      await asyncTracker.trackFromEvent(createMockEvent(), []);

      expect(mockStore.saveBatch).toHaveBeenCalledWith(expect.any(Array));
      expect((mockStore.saveBatch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toHaveLength(3);
    });

    it('should flush on timeout', async () => {
      await asyncTracker.trackFromEvent(createMockEvent(), []);

      // Advance timer past the 1000ms batch timeout
      await vi.advanceTimersByTimeAsync(1100);

      expect(mockStore.saveBatch).toHaveBeenCalled();
    });

    it('should handle flush errors gracefully', async () => {
      const failingStore = createMockStore();
      (failingStore.saveBatch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Save failed')
      );

      const errorTracker = new LineageTracker(failingStore, {
        asyncProcessing: true,
        batchSize: 1,
      });

      await errorTracker.trackFromEvent(createMockEvent(), []);

      // Should not throw
      expect(failingStore.saveBatch).toHaveBeenCalled();
    });
  });

  describe('flushBatch', () => {
    it('should do nothing if batch is empty', async () => {
      await tracker.flushBatch();

      expect(mockStore.saveBatch).not.toHaveBeenCalled();
    });

    it('should clear pending batch after flush', async () => {
      const asyncTracker = new LineageTracker(mockStore, {
        asyncProcessing: true,
        batchSize: 100,
      });

      await asyncTracker.trackFromEvent(createMockEvent(), []);
      await asyncTracker.flushBatch();

      expect(mockStore.saveBatch).toHaveBeenCalledTimes(1);

      // Second flush should be empty
      await asyncTracker.flushBatch();
      expect(mockStore.saveBatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('query methods', () => {
    it('should query lineage entries', async () => {
      const options = { aggregateId: 'agg-1' };
      await tracker.query(options);

      expect(mockStore.query).toHaveBeenCalledWith(options);
    });

    it('should get aggregate lineage', async () => {
      await tracker.getAggregateLineage('agg-1', 'Lead');

      expect(mockStore.getByAggregateId).toHaveBeenCalledWith('agg-1', 'Lead');
    });

    it('should get event lineage', async () => {
      await tracker.getEventLineage('evt-1');

      expect(mockStore.getByEventId).toHaveBeenCalledWith('evt-1');
    });

    it('should get correlation lineage', async () => {
      await tracker.getCorrelationLineage('corr-1');

      expect(mockStore.getByCorrelationId).toHaveBeenCalledWith('corr-1');
    });
  });

  describe('shutdown', () => {
    it('should flush pending batch on shutdown', async () => {
      const asyncTracker = new LineageTracker(mockStore, {
        asyncProcessing: true,
        batchSize: 100,
      });

      await asyncTracker.trackFromEvent(createMockEvent(), []);
      await asyncTracker.trackFromEvent(createMockEvent(), []);

      await asyncTracker.shutdown();

      expect(mockStore.saveBatch).toHaveBeenCalled();
    });
  });
});

describe('createLineageTracker factory', () => {
  it('should create tracker instance', () => {
    const store = createMockStore();
    const tracker = createLineageTracker(store);

    expect(tracker).toBeInstanceOf(LineageTracker);
  });

  it('should create tracker with config', () => {
    const store = createMockStore();
    const config = { enabled: false, batchSize: 50 };
    const tracker = createLineageTracker(store, config);

    expect(tracker).toBeInstanceOf(LineageTracker);
  });
});

describe('Event type mappings', () => {
  let mockStore: LineageStore;
  let tracker: LineageTracker;

  beforeEach(() => {
    mockStore = createMockStore();
    tracker = new LineageTracker(mockStore, { asyncProcessing: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const eventMappings = [
    { type: 'LeadCreated', expectedTransformation: 'ingestion' },
    { type: 'PatientCreated', expectedTransformation: 'ingestion' },
    { type: 'LeadScored', expectedTransformation: 'scoring' },
    { type: 'RetentionScoreCalculated', expectedTransformation: 'scoring' },
    { type: 'LeadEnriched', expectedTransformation: 'enrichment' },
    { type: 'EpisodeCreated', expectedTransformation: 'enrichment' },
    { type: 'PatternDetected', expectedTransformation: 'pattern_detection' },
    { type: 'InsightGenerated', expectedTransformation: 'insight_generation' },
    { type: 'LeadAssigned', expectedTransformation: 'routing_decision' },
    { type: 'ConsentGranted', expectedTransformation: 'consent_processing' },
    { type: 'PatientMerged', expectedTransformation: 'merge' },
    { type: 'LeadUpdated', expectedTransformation: 'manual_update' },
    { type: 'HubSpotSynced', expectedTransformation: 'sync' },
    { type: 'DataAnonymized', expectedTransformation: 'anonymization' },
  ];

  it.each(eventMappings)(
    'should map $type to $expectedTransformation',
    async ({ type, expectedTransformation }) => {
      const event = createMockEvent({ type });
      const result = await tracker.trackFromEvent(event, []);

      expect(result?.transformationType).toBe(expectedTransformation);
    }
  );
});

describe('Sensitivity mappings', () => {
  let mockStore: LineageStore;
  let tracker: LineageTracker;

  beforeEach(() => {
    mockStore = createMockStore();
    tracker = new LineageTracker(mockStore, { asyncProcessing: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Only test event types that have compliance frameworks (and thus sensitivity)
  const sensitivityMappings = [
    { type: 'PatientCreated', expectedSensitivity: 'phi' },
    { type: 'PatientUpdated', expectedSensitivity: 'phi' },
    { type: 'AppointmentScheduled', expectedSensitivity: 'phi' },
    { type: 'LeadCreated', expectedSensitivity: 'pii' },
    { type: 'ConsentGranted', expectedSensitivity: 'pii' },
  ];

  it.each(sensitivityMappings)(
    'should apply $expectedSensitivity sensitivity for $type',
    async ({ type, expectedSensitivity }) => {
      const event = createMockEvent({ type });
      const result = await tracker.trackFromEvent(event, []);

      expect(result?.compliance?.sensitivity).toBe(expectedSensitivity);
    }
  );

  it('should not have compliance when event type is not in compliance map', async () => {
    // LeadScored has sensitivity in EVENT_SENSITIVITY_MAP but not in EVENT_COMPLIANCE_MAP
    // so no compliance object is created
    const event = createMockEvent({ type: 'LeadScored' });
    const result = await tracker.trackFromEvent(event, []);

    // Without compliance frameworks, compliance object is undefined
    expect(result?.compliance).toBeUndefined();
  });
});
