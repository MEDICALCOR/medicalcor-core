/**
 * @fileoverview Primary Port - LeadScoringUseCase
 *
 * Defines what the application offers for lead scoring operations (driving side).
 * This is a hexagonal architecture PRIMARY PORT for AI-powered lead qualification.
 *
 * @module application/ports/primary/LeadScoringUseCase
 *
 * HEXAGONAL ARCHITECTURE PRINCIPLE:
 * Primary ports define the use cases that the application exposes to driving adapters
 * (REST API, CLI, message consumers). They orchestrate domain services and
 * coordinate with secondary ports (repositories, external services).
 *
 * HIPAA/GDPR COMPLIANCE:
 * All scoring operations are audited. PHI in conversation history is handled
 * according to data minimization principles.
 */

import type { Result } from '../../shared/Result.js';
import type { DomainError } from '../../shared/DomainError.js';
import type { SecurityContext } from '../../security/SecurityContext.js';

/**
 * Lead classification levels based on AI scoring
 */
export type LeadClassification = 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

/**
 * Channel through which the lead was acquired
 */
export type LeadChannel =
  | 'whatsapp'
  | 'voice'
  | 'web'
  | 'hubspot'
  | 'facebook'
  | 'google'
  | 'referral';

/**
 * Scoring method used for qualification
 */
export type ScoringMethod = 'ai' | 'rule_based' | 'hybrid';

/**
 * Message history entry for AI context
 */
export interface MessageHistoryEntry {
  /** Message role (user = patient, assistant = AI/agent) */
  readonly role: 'user' | 'assistant';

  /** Message content */
  readonly content: string;

  /** Message timestamp (ISO 8601) */
  readonly timestamp: string;
}

/**
 * Input for scoring a lead
 */
export interface ScoreLeadInput {
  /** Lead phone number in E.164 format */
  readonly phone: string;

  /** Current message content to score */
  readonly message: string;

  /** Acquisition channel */
  readonly channel: LeadChannel;

  /** HubSpot contact ID (if synced) */
  readonly hubspotContactId?: string;

  /** Conversation history for context */
  readonly messageHistory?: readonly MessageHistoryEntry[];

  /** Preferred language (affects AI prompts) */
  readonly language?: 'ro' | 'en' | 'de';

  /** Correlation ID for distributed tracing */
  readonly correlationId: string;

  /** Idempotency key to prevent duplicate scoring */
  readonly idempotencyKey?: string;

  /** Force re-scoring even if recent score exists */
  readonly forceRescore?: boolean;

  /** UTM parameters for attribution */
  readonly utm?: {
    readonly source?: string;
    readonly medium?: string;
    readonly campaign?: string;
    readonly term?: string;
    readonly content?: string;
  };
}

/**
 * Output from lead scoring operation
 */
export interface ScoreLeadOutput {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** Lead identifier */
  readonly leadId: string;

  /** Numeric score (1-5 scale) */
  readonly score: number;

  /** Classification based on score */
  readonly classification: LeadClassification;

  /** AI confidence level (0-1) */
  readonly confidence: number;

  /** Scoring method used */
  readonly method: ScoringMethod;

  /** Suggested next action for sales team */
  readonly suggestedAction: string;

  /** AI reasoning for the score */
  readonly reasoning: string;

  /** Detected patient intent */
  readonly detectedIntent?: string;

  /** Urgency indicators found in conversation */
  readonly urgencyIndicators?: readonly string[];

  /** Whether budget was mentioned */
  readonly budgetMentioned?: boolean;

  /** Procedures the patient expressed interest in */
  readonly procedureInterest?: readonly string[];

  /** Whether lead was newly qualified (crossed threshold) */
  readonly wasQualified: boolean;

  /** Whether this was a cached/idempotent result */
  readonly wasCached?: boolean;

  /** Scoring timestamp */
  readonly scoredAt: Date;
}

/**
 * Input for batch scoring multiple leads
 */
export interface BatchScoreInput {
  /** Array of leads to score */
  readonly leads: readonly ScoreLeadInput[];

  /** Correlation ID for the batch operation */
  readonly correlationId: string;

  /** Whether to continue on individual failures */
  readonly continueOnError?: boolean;
}

/**
 * Result of a single lead in batch scoring
 */
export interface BatchScoreItemResult {
  /** Phone number of the lead */
  readonly phone: string;

  /** Scoring result if successful */
  readonly result?: ScoreLeadOutput;

  /** Error if scoring failed */
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

/**
 * Output from batch scoring operation
 */
export interface BatchScoreOutput {
  /** Total leads processed */
  readonly total: number;

  /** Successfully scored count */
  readonly succeeded: number;

  /** Failed scoring count */
  readonly failed: number;

  /** Individual results */
  readonly results: readonly BatchScoreItemResult[];

  /** Processing duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Input for retrieving score history
 */
export interface GetScoreHistoryInput {
  /** Lead identifier */
  readonly leadId: string;

  /** Maximum number of records to return */
  readonly limit?: number;

  /** Date range start */
  readonly fromDate?: Date;

  /** Date range end */
  readonly toDate?: Date;
}

/**
 * Historical score entry
 */
export interface ScoreHistoryEntry {
  /** Score ID */
  readonly id: string;

  /** Numeric score */
  readonly score: number;

  /** Classification at time of scoring */
  readonly classification: LeadClassification;

  /** Confidence level */
  readonly confidence: number;

  /** Scoring method */
  readonly method: ScoringMethod;

  /** Channel at time of scoring */
  readonly channel: LeadChannel;

  /** Scoring timestamp */
  readonly scoredAt: Date;

  /** Delta from previous score */
  readonly scoreDelta?: number;
}

/**
 * Output from score history query
 */
export interface ScoreHistoryOutput {
  /** Lead identifier */
  readonly leadId: string;

  /** Score history entries */
  readonly history: readonly ScoreHistoryEntry[];

  /** Current/latest score */
  readonly currentScore?: number;

  /** Average score over time */
  readonly averageScore?: number;

  /** Score trend direction */
  readonly trend?: 'improving' | 'stable' | 'declining';
}

/**
 * Scoring statistics for analytics
 */
export interface ScoringStats {
  /** Total leads scored in period */
  readonly totalScored: number;

  /** Breakdown by classification */
  readonly byClassification: {
    readonly hot: number;
    readonly warm: number;
    readonly cold: number;
    readonly unqualified: number;
  };

  /** Breakdown by method */
  readonly byMethod: {
    readonly ai: number;
    readonly ruleBased: number;
    readonly hybrid: number;
  };

  /** Average confidence score */
  readonly averageConfidence: number;

  /** Average processing time (ms) */
  readonly averageLatencyMs: number;

  /** Period start */
  readonly periodStart: Date;

  /** Period end */
  readonly periodEnd: Date;
}

/**
 * PRIMARY PORT: Lead Scoring Use Case
 *
 * Defines the contract for AI-powered lead qualification operations.
 * Driving adapters (REST API, webhooks, CLI) use this port to trigger
 * lead scoring workflows.
 *
 * @example
 * ```typescript
 * // REST API adapter implementing this port
 * class LeadScoringController {
 *   constructor(private useCase: LeadScoringUseCase) {}
 *
 *   async handleWebhook(req: FastifyRequest): Promise<FastifyReply> {
 *     const context = this.createSecurityContext(req);
 *     const result = await this.useCase.scoreLead(input, context);
 *
 *     if (isOk(result)) {
 *       return reply.status(200).send(result.value);
 *     }
 *     return reply.status(400).send(result.error.toClientJSON());
 *   }
 * }
 * ```
 */
export interface LeadScoringUseCase {
  /**
   * Score a single lead based on conversation context
   *
   * Uses AI (GPT-4o) as primary method with rule-based fallback.
   * Creates audit trail for HIPAA compliance.
   *
   * @param input - Lead scoring input
   * @param context - Security context for authorization and audit
   * @returns Result with scoring output or domain error
   *
   * @throws Never - errors are returned as Result.Err
   */
  scoreLead(
    input: ScoreLeadInput,
    context: SecurityContext
  ): Promise<Result<ScoreLeadOutput, DomainError>>;

  /**
   * Score multiple leads in batch
   *
   * Optimized for bulk processing with parallel execution.
   * Individual failures don't fail the entire batch.
   *
   * @param input - Batch scoring input
   * @param context - Security context
   * @returns Result with batch output or domain error
   */
  scoreLeadsBatch(
    input: BatchScoreInput,
    context: SecurityContext
  ): Promise<Result<BatchScoreOutput, DomainError>>;

  /**
   * Retrieve scoring history for a lead
   *
   * Returns chronological history of all scores for trend analysis.
   *
   * @param input - History query input
   * @param context - Security context
   * @returns Result with score history or domain error
   */
  getScoreHistory(
    input: GetScoreHistoryInput,
    context: SecurityContext
  ): Promise<Result<ScoreHistoryOutput, DomainError>>;

  /**
   * Get scoring statistics for analytics
   *
   * Returns aggregate metrics for a given time period.
   * Used for dashboard and reporting.
   *
   * @param fromDate - Period start date
   * @param toDate - Period end date
   * @param context - Security context
   * @returns Result with scoring stats or domain error
   */
  getScoringStats(
    fromDate: Date,
    toDate: Date,
    context: SecurityContext
  ): Promise<Result<ScoringStats, DomainError>>;

  /**
   * Recalculate score for a lead using latest model
   *
   * Forces re-scoring with current AI model, ignoring cache.
   * Useful after model updates or conversation changes.
   *
   * @param leadId - Lead identifier
   * @param correlationId - Correlation ID for tracing
   * @param context - Security context
   * @returns Result with new scoring output or domain error
   */
  recalculateScore(
    leadId: string,
    correlationId: string,
    context: SecurityContext
  ): Promise<Result<ScoreLeadOutput, DomainError>>;

  /**
   * Invalidate cached score for a lead
   *
   * Clears any cached scoring data, forcing fresh calculation on next request.
   *
   * @param leadId - Lead identifier
   * @param context - Security context
   * @returns Result with success boolean or domain error
   */
  invalidateScore(leadId: string, context: SecurityContext): Promise<Result<boolean, DomainError>>;
}

/**
 * Configuration for LeadScoringUseCase implementation
 */
export interface LeadScoringUseCaseConfig {
  /** OpenAI API key for AI scoring */
  readonly openaiApiKey: string;

  /** AI model to use (default: gpt-4o) */
  readonly model?: string;

  /** Enable rule-based fallback on AI failure */
  readonly fallbackEnabled?: boolean;

  /** Score cache TTL in seconds */
  readonly cacheTtlSeconds?: number;

  /** Maximum batch size */
  readonly maxBatchSize?: number;

  /** Qualification threshold score (default: 4) */
  readonly qualificationThreshold?: number;
}
