/**
 * M15: Data Lineage Tracker Service
 *
 * Core service for tracking data lineage through event-based processing.
 * Integrates with the event store to capture causation chains and data flow.
 *
 * @module core/data-lineage/lineage-tracker
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger, type Logger } from '../logger.js';
import type { StoredEvent } from '../event-store.js';
import type {
  LineageEntry,
  LineageStore,
  LineageServiceConfig,
  DataSource,
  DataQualityMetrics,
  TransformationType,
  ComplianceFramework,
  LegalBasis,
  DataSensitivity,
  LineageQueryOptions,
  LineageQueryResult,
} from './types.js';
import { DEFAULT_LINEAGE_CONFIG } from './types.js';

// =============================================================================
// TRANSFORMATION METADATA
// =============================================================================

/**
 * Mapping of event types to transformation types
 */
const EVENT_TRANSFORMATION_MAP: Record<string, TransformationType> = {
  // Ingestion events
  LeadCreated: 'ingestion',
  PatientCreated: 'ingestion',
  ContactCreated: 'ingestion',
  MessageReceived: 'ingestion',
  WebhookReceived: 'ingestion',
  FormSubmitted: 'ingestion',

  // Scoring events
  LeadScored: 'scoring',
  RetentionScoreCalculated: 'scoring',
  ChurnRiskCalculated: 'scoring',
  EngagementScoreUpdated: 'scoring',

  // Enrichment events
  LeadEnriched: 'enrichment',
  PatientEnriched: 'enrichment',
  EpisodeCreated: 'enrichment',
  MemoryIndexed: 'enrichment',

  // Pattern detection
  PatternDetected: 'pattern_detection',
  BehavioralPatternIdentified: 'pattern_detection',

  // Insight generation
  InsightGenerated: 'insight_generation',
  CognitiveInsightCreated: 'insight_generation',

  // Routing
  LeadAssigned: 'routing_decision',
  RoutingDecisionMade: 'routing_decision',
  AgentSelected: 'routing_decision',

  // Consent
  ConsentGranted: 'consent_processing',
  ConsentWithdrawn: 'consent_processing',
  ConsentUpdated: 'consent_processing',

  // Aggregation
  PatientMerged: 'merge',
  LeadMerged: 'merge',
  DataAggregated: 'aggregation',

  // Updates
  LeadUpdated: 'manual_update',
  PatientUpdated: 'manual_update',
  AppointmentScheduled: 'manual_update',
  AppointmentRescheduled: 'manual_update',

  // Sync
  HubSpotSynced: 'sync',
  ExternalSystemSynced: 'sync',

  // Anonymization
  DataAnonymized: 'anonymization',
  DataPseudonymized: 'anonymization',
};

/**
 * Mapping of event types to compliance frameworks
 */
const EVENT_COMPLIANCE_MAP: Record<string, ComplianceFramework[]> = {
  PatientCreated: ['HIPAA', 'GDPR'],
  PatientUpdated: ['HIPAA', 'GDPR'],
  PatientMerged: ['HIPAA', 'GDPR'],
  LeadCreated: ['GDPR'],
  LeadUpdated: ['GDPR'],
  ConsentGranted: ['GDPR', 'HIPAA'],
  ConsentWithdrawn: ['GDPR', 'HIPAA'],
  MessageSent: ['HIPAA'],
  MessageReceived: ['HIPAA'],
  AppointmentScheduled: ['HIPAA'],
  EpisodeCreated: ['HIPAA', 'GDPR'],
  DataAnonymized: ['GDPR'],
  DataPseudonymized: ['GDPR'],
};

/**
 * Mapping of event types to data sensitivity
 */
const EVENT_SENSITIVITY_MAP: Record<string, DataSensitivity> = {
  PatientCreated: 'phi',
  PatientUpdated: 'phi',
  PatientMerged: 'phi',
  AppointmentScheduled: 'phi',
  MessageSent: 'phi',
  MessageReceived: 'phi',
  EpisodeCreated: 'phi',
  LeadCreated: 'pii',
  LeadUpdated: 'pii',
  ConsentGranted: 'pii',
  LeadScored: 'confidential',
};

// =============================================================================
// LINEAGE TRACKER
// =============================================================================

/**
 * Context for creating lineage entries
 */
export interface LineageContext {
  /** Actor performing the transformation */
  actor?: {
    id: string;
    type: 'user' | 'system' | 'api' | 'integration' | 'cron';
    name?: string;
  };
  /** Service performing the transformation */
  service: string;
  /** Service version */
  version?: string;
  /** AI model used */
  model?: string;
  /** Model version */
  modelVersion?: string;
  /** Processing duration in ms */
  durationMs?: number;
  /** Legal basis for processing */
  legalBasis?: LegalBasis;
  /** Purpose of processing */
  purpose?: string;
  /** Consent ID if consent-based */
  consentId?: string;
  /** Custom compliance frameworks */
  complianceFrameworks?: ComplianceFramework[];
  /** Custom sensitivity level */
  sensitivity?: DataSensitivity;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Main lineage tracker service
 */
export class LineageTracker {
  private store: LineageStore;
  private config: LineageServiceConfig;
  private logger: Logger;
  private pendingBatch: LineageEntry[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(store: LineageStore, config?: Partial<LineageServiceConfig>) {
    this.store = store;
    this.config = { ...DEFAULT_LINEAGE_CONFIG, ...config };
    this.logger = createLogger({ name: 'lineage-tracker' });
  }

  // ===========================================================================
  // EVENT-BASED TRACKING
  // ===========================================================================

  /**
   * Track lineage from a stored event
   */
  async trackFromEvent(
    event: StoredEvent,
    sources: DataSource[],
    context?: LineageContext,
    quality?: DataQualityMetrics
  ): Promise<LineageEntry | null> {
    if (!this.config.enabled) {
      return null;
    }

    // Skip if quality below threshold
    if (quality && quality.confidence < this.config.minQualityConfidence) {
      this.logger.debug(
        { eventId: event.id, confidence: quality.confidence },
        'Skipping lineage due to low quality'
      );
      return null;
    }

    const entry = this.createLineageEntry(event, sources, context, quality);

    if (this.config.asyncProcessing) {
      await this.addToBatch(entry);
    } else {
      await this.store.save(entry);
    }

    if (this.config.enableLogging) {
      this.logger.debug(
        {
          entryId: entry.id,
          eventType: event.type,
          sources: sources.length,
          transformation: entry.transformationType,
        },
        'Lineage tracked'
      );
    }

    return entry;
  }

  /**
   * Track lineage for a scoring operation
   */
  async trackScoring(
    targetAggregateId: string,
    targetAggregateType: string,
    triggerEventId: string,
    triggerEventType: string,
    correlationId: string,
    sources: DataSource[],
    context: LineageContext,
    scoreDetails?: {
      scoreValue: number;
      algorithm: string;
      factors: string[];
    }
  ): Promise<LineageEntry> {
    const quality: DataQualityMetrics = {
      confidence: sources.length > 0 ? 0.9 : 0.5,
      completeness: sources.length > 0 ? 1.0 : 0.3,
    };

    const entry: LineageEntry = {
      id: uuidv4(),
      targetAggregateId,
      targetAggregateType,
      triggerEventId,
      triggerEventType,
      transformationType: 'scoring',
      transformationDescription: scoreDetails
        ? `Score calculated: ${scoreDetails.scoreValue} using ${scoreDetails.algorithm}`
        : 'Score calculated',
      sources,
      quality,
      compliance: {
        frameworks: context.complianceFrameworks ?? EVENT_COMPLIANCE_MAP[triggerEventType],
        legalBasis: context.legalBasis ?? 'legitimate_interests',
        sensitivity: context.sensitivity ?? 'confidential',
        purpose: context.purpose ?? 'Lead qualification and prioritization',
      },
      actor: context.actor,
      correlationId,
      processingContext: {
        service: context.service,
        version: context.version,
        model: context.model,
        modelVersion: context.modelVersion,
        durationMs: context.durationMs,
      },
      metadata: {
        ...context.metadata,
        scoreDetails,
      },
      createdAt: new Date().toISOString(),
    };

    await this.store.save(entry);
    return entry;
  }

  /**
   * Track lineage for AI/ML enrichment
   */
  async trackEnrichment(
    targetAggregateId: string,
    targetAggregateType: string,
    triggerEventId: string,
    triggerEventType: string,
    correlationId: string,
    sources: DataSource[],
    context: LineageContext,
    enrichmentDetails?: {
      model: string;
      enrichedFields: string[];
      confidence: number;
    }
  ): Promise<LineageEntry> {
    const quality: DataQualityMetrics = {
      confidence: enrichmentDetails?.confidence ?? 0.8,
      completeness: 1.0,
    };

    const entry: LineageEntry = {
      id: uuidv4(),
      targetAggregateId,
      targetAggregateType,
      triggerEventId,
      triggerEventType,
      transformationType: 'enrichment',
      transformationDescription: enrichmentDetails
        ? `AI enrichment using ${enrichmentDetails.model}: ${enrichmentDetails.enrichedFields.join(', ')}`
        : 'AI-based data enrichment',
      sources,
      quality,
      compliance: {
        frameworks: context.complianceFrameworks ?? EVENT_COMPLIANCE_MAP[triggerEventType],
        legalBasis: context.legalBasis ?? 'legitimate_interests',
        sensitivity: context.sensitivity ?? EVENT_SENSITIVITY_MAP[triggerEventType],
        purpose: context.purpose ?? 'AI-powered data enrichment',
      },
      actor: context.actor ?? { id: 'system', type: 'system', name: 'AI Enrichment Service' },
      correlationId,
      processingContext: {
        service: context.service,
        version: context.version,
        model: enrichmentDetails?.model ?? context.model,
        modelVersion: context.modelVersion,
        durationMs: context.durationMs,
      },
      metadata: {
        ...context.metadata,
        enrichmentDetails,
      },
      createdAt: new Date().toISOString(),
    };

    await this.store.save(entry);
    return entry;
  }

  /**
   * Track lineage for pattern detection
   */
  async trackPatternDetection(
    targetAggregateId: string,
    targetAggregateType: string,
    correlationId: string,
    sources: DataSource[],
    context: LineageContext,
    patternDetails: {
      patternType: string;
      confidence: number;
      supportingEventCount: number;
    }
  ): Promise<LineageEntry> {
    const quality: DataQualityMetrics = {
      confidence: patternDetails.confidence,
      completeness: patternDetails.supportingEventCount > 3 ? 1.0 : 0.7,
    };

    const entry: LineageEntry = {
      id: uuidv4(),
      targetAggregateId,
      targetAggregateType,
      triggerEventId: uuidv4(),
      triggerEventType: 'PatternDetected',
      transformationType: 'pattern_detection',
      transformationDescription: `Pattern detected: ${patternDetails.patternType} with ${patternDetails.confidence.toFixed(2)} confidence`,
      sources,
      quality,
      compliance: {
        frameworks: ['HIPAA', 'GDPR'],
        legalBasis: context.legalBasis ?? 'legitimate_interests',
        sensitivity: 'confidential',
        purpose: 'Behavioral pattern analysis for personalized care',
      },
      actor: context.actor ?? { id: 'system', type: 'system', name: 'Pattern Detection Service' },
      correlationId,
      processingContext: {
        service: context.service,
        version: context.version,
        model: context.model,
        durationMs: context.durationMs,
      },
      metadata: {
        ...context.metadata,
        patternDetails,
      },
      createdAt: new Date().toISOString(),
    };

    await this.store.save(entry);
    return entry;
  }

  /**
   * Track lineage for consent-related processing
   */
  async trackConsentProcessing(
    targetAggregateId: string,
    targetAggregateType: string,
    triggerEventId: string,
    triggerEventType: string,
    correlationId: string,
    consentId: string,
    context: LineageContext,
    consentDetails: {
      action: 'grant' | 'withdraw' | 'update';
      purposes: string[];
    }
  ): Promise<LineageEntry> {
    const entry: LineageEntry = {
      id: uuidv4(),
      targetAggregateId,
      targetAggregateType,
      triggerEventId,
      triggerEventType,
      transformationType: 'consent_processing',
      transformationDescription: `Consent ${consentDetails.action}: ${consentDetails.purposes.join(', ')}`,
      sources: [],
      quality: {
        confidence: 1.0,
        completeness: 1.0,
      },
      compliance: {
        frameworks: ['GDPR', 'HIPAA'],
        legalBasis: 'consent',
        consentId,
        sensitivity: 'pii',
        purpose: `Consent management - ${consentDetails.action}`,
      },
      actor: context.actor,
      correlationId,
      processingContext: {
        service: context.service,
        version: context.version,
      },
      metadata: {
        ...context.metadata,
        consentDetails,
      },
      createdAt: new Date().toISOString(),
    };

    await this.store.save(entry);
    return entry;
  }

  // ===========================================================================
  // BATCH PROCESSING
  // ===========================================================================

  private async addToBatch(entry: LineageEntry): Promise<void> {
    this.pendingBatch.push(entry);

    if (this.pendingBatch.length >= this.config.batchSize) {
      await this.flushBatch();
    } else {
      this.batchTimeout ??= setTimeout(async () => {
        await this.flushBatch();
      }, 1000);
    }
  }

  /**
   * Flush pending batch to storage
   */
  async flushBatch(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.pendingBatch.length === 0) {
      return;
    }

    const batch = [...this.pendingBatch];
    this.pendingBatch = [];

    try {
      await this.store.saveBatch(batch);
      this.logger.debug({ count: batch.length }, 'Lineage batch flushed');
    } catch (error) {
      this.logger.error({ error, count: batch.length }, 'Failed to flush lineage batch');
      // Re-add to batch for retry
      this.pendingBatch.push(...batch);
    }
  }

  // ===========================================================================
  // QUERY METHODS
  // ===========================================================================

  /**
   * Query lineage entries
   */
  async query(options: LineageQueryOptions): Promise<LineageQueryResult> {
    return this.store.query(options);
  }

  /**
   * Get lineage for a specific aggregate
   */
  async getAggregateLineage(aggregateId: string, aggregateType: string): Promise<LineageEntry[]> {
    return this.store.getByAggregateId(aggregateId, aggregateType);
  }

  /**
   * Get lineage by event ID
   */
  async getEventLineage(eventId: string): Promise<LineageEntry[]> {
    return this.store.getByEventId(eventId);
  }

  /**
   * Get lineage by correlation ID (for tracing a request)
   */
  async getCorrelationLineage(correlationId: string): Promise<LineageEntry[]> {
    return this.store.getByCorrelationId(correlationId);
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private createLineageEntry(
    event: StoredEvent,
    sources: DataSource[],
    context?: LineageContext,
    quality?: DataQualityMetrics
  ): LineageEntry {
    const transformationType =
      EVENT_TRANSFORMATION_MAP[event.type] ?? ('system_update' as TransformationType);

    const complianceFrameworks = context?.complianceFrameworks ?? EVENT_COMPLIANCE_MAP[event.type];
    const sensitivity = context?.sensitivity ?? EVENT_SENSITIVITY_MAP[event.type];

    return {
      id: uuidv4(),
      targetAggregateId: event.aggregateId ?? '',
      targetAggregateType: event.aggregateType ?? '',
      triggerEventId: event.id,
      triggerEventType: event.type,
      transformationType,
      sources,
      quality: quality ?? { confidence: 0.8 },
      compliance: complianceFrameworks
        ? {
            frameworks: complianceFrameworks,
            legalBasis: context?.legalBasis,
            consentId: context?.consentId,
            sensitivity,
            purpose: context?.purpose,
            retentionDays: this.config.defaultRetentionDays,
          }
        : undefined,
      actor: context?.actor,
      correlationId: event.metadata.correlationId,
      causationId: event.metadata.causationId,
      processingContext: context
        ? {
            service: context.service,
            version: context.version,
            model: context.model,
            modelVersion: context.modelVersion,
            durationMs: context.durationMs,
          }
        : undefined,
      metadata: context?.metadata,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Shutdown the tracker (flush pending batch)
   */
  async shutdown(): Promise<void> {
    await this.flushBatch();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a lineage tracker
 */
export function createLineageTracker(
  store: LineageStore,
  config?: Partial<LineageServiceConfig>
): LineageTracker {
  return new LineageTracker(store, config);
}
