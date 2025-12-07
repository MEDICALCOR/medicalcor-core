/**
 * Cognitive Episodic Memory Types
 *
 * ADR-004: Types for AI-powered patient interaction memory system
 */

import { z } from 'zod';

// =============================================================================
// Subject Types (Polymorphic Reference)
// =============================================================================

export const SubjectTypeSchema = z.enum(['lead', 'patient', 'contact']);
export type SubjectType = z.infer<typeof SubjectTypeSchema>;

// =============================================================================
// Source Channel Types
// =============================================================================

export const SourceChannelSchema = z.enum(['whatsapp', 'voice', 'web', 'email', 'crm', 'system']);
export type SourceChannel = z.infer<typeof SourceChannelSchema>;

// =============================================================================
// Event Category Types
// =============================================================================

export const EventCategorySchema = z.enum([
  'communication',
  'scheduling',
  'clinical',
  'financial',
  'lifecycle',
  'other',
]);
export type EventCategory = z.infer<typeof EventCategorySchema>;

// =============================================================================
// Sentiment Types
// =============================================================================

export const SentimentSchema = z.enum(['positive', 'neutral', 'negative']);
export type Sentiment = z.infer<typeof SentimentSchema>;

// =============================================================================
// Key Entity Types (Extracted from events)
// =============================================================================

export const KeyEntitySchema = z.object({
  type: z.enum(['procedure', 'date', 'amount', 'person', 'location', 'product', 'other']),
  value: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});
export type KeyEntity = z.infer<typeof KeyEntitySchema>;

// =============================================================================
// Episodic Event Types
// =============================================================================

export const EpisodicEventSchema = z.object({
  id: z.string().uuid(),
  subjectType: SubjectTypeSchema,
  subjectId: z.string().uuid(),
  eventType: z.string().max(100),
  eventCategory: EventCategorySchema,
  sourceChannel: SourceChannelSchema,
  rawEventId: z.string().uuid().optional(),
  summary: z.string(),
  keyEntities: z.array(KeyEntitySchema).default([]),
  sentiment: SentimentSchema.optional(),
  intent: z.string().max(100).optional(),
  occurredAt: z.date(),
  processedAt: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type EpisodicEvent = z.infer<typeof EpisodicEventSchema>;

export interface EpisodicEventWithEmbedding extends EpisodicEvent {
  embedding: number[];
  embeddingModel: string;
}

// =============================================================================
// Create Episodic Event Input
// =============================================================================

export const CreateEpisodicEventSchema = EpisodicEventSchema.omit({
  id: true,
  processedAt: true,
});

export type CreateEpisodicEvent = z.infer<typeof CreateEpisodicEventSchema>;

// =============================================================================
// Behavioral Pattern Types
// =============================================================================

export const PatternTypeSchema = z.enum([
  // Rule-based patterns
  'appointment_rescheduler',
  'monday_avoider',
  'high_engagement',
  'declining_engagement',
  'quick_responder',
  'slow_responder',
  'price_sensitive',
  'quality_focused',
  // LLM-detected patterns (prefixed)
  'llm_communication_preference',
  'llm_time_preference',
  'llm_seasonal_behavior',
  'llm_topic_interest',
  'llm_other',
]);
export type PatternType = z.infer<typeof PatternTypeSchema>;

export const BehavioralPatternSchema = z.object({
  id: z.string().uuid(),
  subjectType: SubjectTypeSchema,
  subjectId: z.string().uuid(),
  patternType: z.string().max(50), // Can extend beyond enum
  patternDescription: z.string(),
  confidence: z.number().min(0).max(1),
  supportingEventIds: z.array(z.string().uuid()),
  firstObservedAt: z.date(),
  lastObservedAt: z.date(),
  occurrenceCount: z.number().int().min(1).default(1),
  metadata: z.record(z.unknown()).optional(),
});

export type BehavioralPattern = z.infer<typeof BehavioralPatternSchema>;

// =============================================================================
// Memory Query Types
// =============================================================================

export const MemoryQuerySchema = z.object({
  subjectType: SubjectTypeSchema.optional(),
  subjectId: z.string().uuid().optional(),
  eventTypes: z.array(z.string()).optional(),
  eventCategories: z.array(EventCategorySchema).optional(),
  channels: z.array(SourceChannelSchema).optional(),
  fromDate: z.date().optional(),
  toDate: z.date().optional(),
  semanticQuery: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
});

export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;

// =============================================================================
// Pagination Types (Cursor-based)
// =============================================================================

/**
 * Cursor data for stable pagination across large result sets.
 * Uses occurred_at + id for deterministic ordering.
 */
export const PaginationCursorDataSchema = z.object({
  /** Timestamp of the last item in the previous page */
  occurredAt: z.string().datetime(),
  /** ID of the last item for tie-breaking */
  id: z.string().uuid(),
  /** Similarity score for semantic search pagination */
  similarity: z.number().optional(),
});

export type PaginationCursorData = z.infer<typeof PaginationCursorDataSchema>;

/**
 * Extended memory query with cursor-based pagination support.
 */
export const PaginatedMemoryQuerySchema = MemoryQuerySchema.extend({
  /** Opaque cursor string from previous page */
  cursor: z.string().optional(),
  /** Page size (defaults to config defaultQueryLimit) */
  pageSize: z.number().int().min(1).max(100).optional(),
});

export type PaginatedMemoryQuery = z.infer<typeof PaginatedMemoryQuerySchema>;

/**
 * Paginated result container with cursor for next page.
 */
export interface PaginatedResult<T> {
  /** Items in the current page */
  items: T[];
  /** Cursor for fetching the next page (null if no more pages) */
  nextCursor: string | null;
  /** Whether there are more items available */
  hasMore: boolean;
  /** Total count if available (only when includeCount is true) */
  totalCount?: number;
}

// =============================================================================
// Subject Memory Summary Types
// =============================================================================

export const SentimentTrendSchema = z.enum(['improving', 'stable', 'declining']);
export type SentimentTrend = z.infer<typeof SentimentTrendSchema>;

export interface SubjectMemorySummary {
  subjectType: SubjectType;
  subjectId: string;
  totalEvents: number;
  firstInteraction: Date | null;
  lastInteraction: Date | null;
  channelBreakdown: Partial<Record<SourceChannel, number>>;
  sentimentTrend: SentimentTrend;
  sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  };
  patterns: BehavioralPattern[];
  recentSummary: string;
}

// =============================================================================
// Cognitive Insight Types
// =============================================================================

export const InsightTypeSchema = z.enum([
  'churn_risk',
  'upsell_opportunity',
  'engagement_drop',
  'positive_momentum',
  'pattern_detected',
  'reactivation_candidate',
  'referral_opportunity',
]);
export type InsightType = z.infer<typeof InsightTypeSchema>;

export const CognitiveInsightSchema = z.object({
  type: InsightTypeSchema,
  confidence: z.number().min(0).max(1),
  description: z.string(),
  recommendedAction: z.string(),
  supportingEventIds: z.array(z.string().uuid()).optional(),
});

export type CognitiveInsight = z.infer<typeof CognitiveInsightSchema>;

export interface CognitiveInsightWithEvents extends CognitiveInsight {
  supportingEvents: EpisodicEvent[];
}

// =============================================================================
// Raw Event Context (Input for Episode Builder)
// =============================================================================

export interface RawEventContext {
  eventType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  occurredAt: Date;
}

// =============================================================================
// Event Analysis Result (From LLM)
// =============================================================================

export interface EventAnalysisResult {
  summary: string;
  entities: KeyEntity[];
  sentiment: Sentiment;
  intent: string;
}

// =============================================================================
// Pattern Detection Result
// =============================================================================

export interface PatternDetectionResult {
  detected: boolean;
  confidence: number;
  supportingEvents: string[];
}

// =============================================================================
// LLM Pattern (From AI analysis)
// =============================================================================

export interface LLMPattern {
  type: string;
  description: string;
  confidence: number;
  reasoning?: string;
}

// =============================================================================
// Memory Context for AI Reply
// =============================================================================

export interface MemoryContext {
  recentHistory: string[];
  similarInteractions: string[];
  knownPatterns: string[];
  contextMarkdown: string;
}

// =============================================================================
// Cognitive System Configuration
// =============================================================================

export interface CognitiveSystemConfig {
  /** Enable/disable episodic memory processing */
  enabled: boolean;

  /** Embedding model to use */
  embeddingModel: string;

  /** Minimum confidence for pattern detection */
  minPatternConfidence: number;

  /** Minimum similarity for semantic search */
  minSimilarity: number;

  /** Maximum events to process for pattern detection */
  maxEventsForPatterns: number;

  /** Maximum events to return in queries */
  defaultQueryLimit: number;

  /** Enable LLM-based pattern detection (more expensive) */
  enableLLMPatterns: boolean;

  /** Temperature for LLM analysis */
  llmTemperature: number;

  /** Max tokens for LLM responses */
  llmMaxTokens: number;
}

export const DEFAULT_COGNITIVE_CONFIG: CognitiveSystemConfig = {
  enabled: true,
  embeddingModel: 'text-embedding-3-small',
  minPatternConfidence: 0.5,
  minSimilarity: 0.7,
  maxEventsForPatterns: 50,
  defaultQueryLimit: 20,
  enableLLMPatterns: true,
  llmTemperature: 0.3,
  llmMaxTokens: 500,
};

// =============================================================================
// Knowledge Graph Types (H8)
// =============================================================================

export const EntityTypeSchema = z.enum([
  'procedure',
  'date',
  'amount',
  'person',
  'location',
  'product',
  'other',
]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const RelationTypeSchema = z.enum([
  'used_for',
  'part_of',
  'associated_with',
  'mentioned_with',
  'prerequisite',
  'alternative_to',
  'contradicts',
  'temporal_before',
  'temporal_after',
  'temporal_during',
  'related',
  'other',
]);
export type RelationType = z.infer<typeof RelationTypeSchema>;

export const ExtractionMethodSchema = z.enum([
  'llm_extracted',
  'rule_based',
  'co_occurrence',
  'manual',
]);
export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

// =============================================================================
// Knowledge Entity Schema
// =============================================================================

export const KnowledgeEntitySchema = z.object({
  id: z.string().uuid(),
  entityType: EntityTypeSchema,
  entityValue: z.string().max(500),
  entityHash: z.string().length(64),
  canonicalForm: z.string().max(500).optional(),
  mentionCount: z.number().int().min(1).default(1),
  firstMentionedEventId: z.string().uuid().optional(),
  avgConfidence: z.number().min(0).max(1).optional(),
  firstObservedAt: z.date(),
  lastObservedAt: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

export type KnowledgeEntity = z.infer<typeof KnowledgeEntitySchema>;

export interface KnowledgeEntityWithEmbedding extends KnowledgeEntity {
  embedding: number[];
  embeddingModel: string;
}

// =============================================================================
// Knowledge Relation Schema
// =============================================================================

export const KnowledgeRelationSchema = z.object({
  id: z.string().uuid(),
  sourceEntityId: z.string().uuid(),
  targetEntityId: z.string().uuid(),
  relationType: RelationTypeSchema,
  confidence: z.number().min(0).max(1),
  weight: z.number().default(1.0),
  extractionMethod: ExtractionMethodSchema,
  supportingEventIds: z.array(z.string().uuid()).default([]),
  relationDescription: z.string().optional(),
  occurrenceCount: z.number().int().min(1).default(1),
  firstObservedAt: z.date(),
  lastObservedAt: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

export type KnowledgeRelation = z.infer<typeof KnowledgeRelationSchema>;

// =============================================================================
// Entity-Event Mapping Schema
// =============================================================================

export const EntityEventMappingSchema = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid(),
  eventId: z.string().uuid(),
  extractionPosition: z.number().int().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  createdAt: z.date(),
});

export type EntityEventMapping = z.infer<typeof EntityEventMappingSchema>;

// =============================================================================
// Knowledge Graph Query Types
// =============================================================================

export interface RelatedEntityResult {
  entityId: string;
  entityType: EntityType;
  entityValue: string;
  relationType: RelationType;
  confidence: number;
  depth: number;
  path: string[];
}

export interface EntityCooccurrenceResult {
  cooccurringEntityId: string;
  entityType: EntityType;
  entityValue: string;
  cooccurrenceCount: number;
  sharedEventIds: string[];
}

export interface EntitySearchResult {
  id: string;
  entityType: EntityType;
  entityValue: string;
  canonicalForm?: string;
  mentionCount: number;
  similarity: number;
}

// =============================================================================
// Knowledge Graph Service Configuration
// =============================================================================

export interface KnowledgeGraphConfig {
  /** Enable knowledge graph entity extraction */
  enabled: boolean;

  /** Minimum confidence for storing entities */
  minEntityConfidence: number;

  /** Minimum co-occurrence count to create a relation */
  minCooccurrenceForRelation: number;

  /** Generate embeddings for entities */
  enableEntityEmbeddings: boolean;

  /** Enable LLM-based relation extraction */
  enableLLMRelations: boolean;
}

export const DEFAULT_KNOWLEDGE_GRAPH_CONFIG: KnowledgeGraphConfig = {
  enabled: true,
  minEntityConfidence: 0.5,
  minCooccurrenceForRelation: 2,
  enableEntityEmbeddings: true,
  enableLLMRelations: false, // Expensive, opt-in
};

// =============================================================================
// Entity Deduplication Types (H8: Auto-merge similar entities)
// =============================================================================

/**
 * Configuration for entity deduplication service
 */
export interface EntityDeduplicationConfig {
  /** Minimum similarity score (0-1) to consider entities as duplicates */
  minSimilarityThreshold: number;

  /** Maximum number of duplicate candidates to retrieve per entity */
  maxCandidates: number;

  /** Enable automatic merging of high-confidence duplicates */
  autoMergeEnabled: boolean;

  /** Minimum similarity for automatic merging (higher than detection threshold) */
  autoMergeThreshold: number;

  /** Batch size for processing entities */
  batchSize: number;

  /** Whether to use LLM for disambiguation */
  useLLMDisambiguation: boolean;
}

export const DEFAULT_DEDUPLICATION_CONFIG: EntityDeduplicationConfig = {
  minSimilarityThreshold: 0.85,
  maxCandidates: 10,
  autoMergeEnabled: true,
  autoMergeThreshold: 0.95,
  batchSize: 50,
  useLLMDisambiguation: false, // Expensive, opt-in
};

/**
 * A candidate duplicate entity with similarity score
 */
export interface DuplicateCandidate {
  /** The entity that may be a duplicate */
  entity: KnowledgeEntity;

  /** Similarity score (0-1) */
  similarity: number;

  /** Reasons why this is considered a duplicate */
  matchReasons: DuplicateMatchReason[];
}

/**
 * Reasons for considering entities as duplicates
 */
export type DuplicateMatchReason =
  | 'embedding_similarity'
  | 'value_substring'
  | 'value_edit_distance'
  | 'llm_confirmed';

/**
 * Result of a duplicate detection operation
 */
export interface DuplicateDetectionResult {
  /** The source entity being checked */
  sourceEntity: KnowledgeEntity;

  /** List of duplicate candidates ordered by similarity */
  candidates: DuplicateCandidate[];

  /** Whether auto-merge was performed */
  autoMerged: boolean;

  /** IDs of entities that were auto-merged into source */
  mergedEntityIds: string[];
}

/**
 * Result of merging two entities
 */
export interface EntityMergeResult {
  /** The surviving (canonical) entity after merge */
  survivingEntity: KnowledgeEntity;

  /** The entity that was merged (soft deleted) */
  mergedEntity: KnowledgeEntity;

  /** Number of relations transferred */
  relationsTransferred: number;

  /** Number of event mappings transferred */
  eventMappingsTransferred: number;

  /** Whether the merge was successful */
  success: boolean;

  /** Error message if merge failed */
  error?: string;
}

/**
 * Options for the merge operation
 */
export interface MergeOptions {
  /** Which entity should survive (by id). If not specified, entity with higher mention count survives */
  survivorId?: string;

  /** Set canonical form for the surviving entity */
  canonicalForm?: string;

  /** Reason for the merge (for audit) */
  mergeReason?: string;
}

/**
 * Summary of a deduplication run
 */
export interface DeduplicationRunSummary {
  /** Total entities scanned */
  totalEntitiesScanned: number;

  /** Number of duplicate pairs detected */
  duplicatePairsDetected: number;

  /** Number of entities merged */
  entitiesMerged: number;

  /** Number of relations transferred */
  totalRelationsTransferred: number;

  /** Number of event mappings transferred */
  totalEventMappingsTransferred: number;

  /** Entities that had errors during processing */
  errors: { entityId: string; error: string }[];

  /** Duration of the run in milliseconds */
  durationMs: number;
}

// =============================================================================
// PII Masking Types (L6: Dynamic Query-Time Masking)
// =============================================================================

/**
 * User roles for PII access control
 *
 * HIPAA Minimum Necessary Rule: Users should only access the minimum PHI needed
 * for their job function.
 */
export const UserRoleSchema = z.enum([
  /** Full access to all PII - clinic administrators, compliance officers */
  'admin',
  /** Access to most PII - doctors, nurses with direct patient care */
  'clinician',
  /** Limited PII access - front desk, scheduling staff */
  'staff',
  /** Masked PII only - reporting, analytics, external integrations */
  'analyst',
  /** No PII access - system accounts, public views */
  'viewer',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * PII field types that can be masked
 */
export const PiiFieldTypeSchema = z.enum([
  'phone',
  'email',
  'name',
  'address',
  'date_of_birth',
  'ssn',
  'medical_record',
  'financial',
  'other',
]);
export type PiiFieldType = z.infer<typeof PiiFieldTypeSchema>;

/**
 * Masking level for different scenarios
 */
export const MaskingLevelSchema = z.enum([
  /** No masking - full PII visible */
  'none',
  /** Partial masking - shows first/last characters (e.g., jo***@example.com) */
  'partial',
  /** Full masking - replaces with [REDACTED] */
  'full',
  /** Hash masking - shows consistent hash for deduplication without exposing PII */
  'hash',
]);
export type MaskingLevel = z.infer<typeof MaskingLevelSchema>;

/**
 * Context for determining PII masking behavior
 */
export interface MaskingContext {
  /** User role for access control */
  userRole: UserRole;

  /** User ID for audit logging */
  userId?: string;

  /** Clinic/organization ID for multi-tenant access */
  clinicId?: string;

  /** Whether this is an emergency access (break-the-glass) */
  emergencyAccess?: boolean;

  /** Specific fields that should be unmasked (override) */
  unmaskedFields?: PiiFieldType[];

  /** Correlation ID for request tracing */
  correlationId?: string;
}

/**
 * Configuration for PII masking behavior
 */
export interface PiiMaskingConfig {
  /** Enable/disable masking (default: true) */
  enabled: boolean;

  /** Default masking level when role-based rules don't apply */
  defaultLevel: MaskingLevel;

  /** Role-specific masking levels */
  roleLevels: Record<UserRole, MaskingLevel>;

  /** Whether to log PII access for audit */
  auditLogging: boolean;

  /** Salt for hash masking (required for consistent hashes) */
  hashSalt?: string;

  /** Entity types that always require masking regardless of role */
  alwaysMaskEntityTypes: PiiFieldType[];

  /** Entity types that never require masking */
  neverMaskEntityTypes: string[];
}

/**
 * Default PII masking configuration
 *
 * Implements HIPAA Minimum Necessary and GDPR data minimization principles
 */
export const DEFAULT_PII_MASKING_CONFIG: PiiMaskingConfig = {
  enabled: true,
  defaultLevel: 'full',
  roleLevels: {
    admin: 'none',
    clinician: 'partial',
    staff: 'partial',
    analyst: 'full',
    viewer: 'full',
  },
  auditLogging: true,
  alwaysMaskEntityTypes: ['ssn', 'financial'],
  neverMaskEntityTypes: ['procedure', 'product'],
};

/**
 * Result of a masking operation with audit info
 */
export interface MaskingResult<T> {
  /** The masked data */
  data: T;

  /** Number of fields that were masked */
  fieldsMasked: number;

  /** Whether any masking was applied */
  wasMasked: boolean;

  /** Audit info for compliance logging */
  auditInfo: {
    userId?: string;
    userRole: UserRole;
    accessTime: Date;
    correlationId?: string;
    fieldsAccessed: string[];
  };
}

/**
 * Options for query-time masking
 */
export interface QueryMaskingOptions {
  /** Masking context with user info */
  context: MaskingContext;

  /** Override config for this query */
  configOverride?: Partial<PiiMaskingConfig>;

  /** Include audit info in result */
  includeAudit?: boolean;
}

// Real-Time Pattern Stream Types (L5: Stream Processing for Patterns)
// =============================================================================

/**
 * Configuration for real-time pattern stream processing
 */
export interface RealtimePatternStreamConfig {
  /** Enable real-time pattern updates */
  enabled: boolean;

  /** Minimum events before running incremental pattern detection */
  minEventsForIncremental: number;

  /** Maximum events to buffer before forcing pattern detection */
  maxEventBufferSize: number;

  /** Debounce window in milliseconds for batching rapid events */
  debounceWindowMs: number;

  /** Enable LLM patterns in real-time (expensive, usually disabled) */
  enableRealtimeLLMPatterns: boolean;

  /** Minimum confidence change to emit a pattern update event */
  minConfidenceChangeThreshold: number;

  /** Time window for incremental analysis (recent events only) */
  incrementalWindowMs: number;
}

export const DEFAULT_REALTIME_STREAM_CONFIG: RealtimePatternStreamConfig = {
  enabled: true,
  minEventsForIncremental: 1,
  maxEventBufferSize: 10,
  debounceWindowMs: 1000,
  enableRealtimeLLMPatterns: false,
  minConfidenceChangeThreshold: 0.1,
  incrementalWindowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Type of change in a pattern update
 */
export const PatternChangeTypeSchema = z.enum([
  'created', // New pattern detected
  'updated', // Existing pattern confidence/evidence changed
  'strengthened', // Pattern confidence increased
  'weakened', // Pattern confidence decreased
  'removed', // Pattern no longer meets threshold
]);
export type PatternChangeType = z.infer<typeof PatternChangeTypeSchema>;

/**
 * Describes a change in a behavioral pattern
 */
export interface PatternDelta {
  /** Type of change */
  changeType: PatternChangeType;

  /** The pattern type that changed */
  patternType: string;

  /** Previous confidence (null if new) */
  previousConfidence: number | null;

  /** New confidence (null if removed) */
  newConfidence: number | null;

  /** Events that triggered this change */
  triggeringEventIds: string[];

  /** Human-readable description of the change */
  changeDescription: string;
}

/**
 * Event emitted when patterns are updated in real-time
 */
export interface PatternUpdateEvent {
  /** Unique event ID */
  eventId: string;

  /** Subject information */
  subjectType: SubjectType;
  subjectId: string;

  /** Timestamp of the update */
  timestamp: Date;

  /** The episodic event that triggered this update */
  triggeringEventId: string;

  /** List of pattern changes */
  deltas: PatternDelta[];

  /** Current patterns after the update */
  currentPatterns: BehavioralPattern[];

  /** Processing metadata */
  metadata: {
    processingTimeMs: number;
    isIncremental: boolean;
    eventsAnalyzed: number;
  };
}

/**
 * Callback type for pattern update notifications
 */
export type PatternUpdateCallback = (event: PatternUpdateEvent) => void | Promise<void>;

/**
 * Stats for real-time pattern stream processing
 */
export interface RealtimePatternStats {
  /** Total events processed */
  totalEventsProcessed: number;

  /** Total pattern updates emitted */
  totalPatternUpdates: number;

  /** Events currently buffered */
  bufferedEventCount: number;

  /** Subjects currently being tracked */
  activeSubjects: number;

  /** Average processing time in ms */
  avgProcessingTimeMs: number;

  /** Pattern changes by type */
  changesByType: Record<PatternChangeType, number>;

  /** Last update timestamp */
  lastUpdateAt: Date | null;
}

/**
 * Subject buffer for tracking events per subject
 */
export interface SubjectEventBuffer {
  subjectType: SubjectType;
  subjectId: string;
  events: EpisodicEvent[];
  lastFlushAt: Date | null;
  pendingFlush: boolean;
}
