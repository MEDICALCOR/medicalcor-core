/**
 * @fileoverview Behavioral Insights Service
 *
 * M5: Pattern Detection for Cognitive Memory (Behavioral Insights)
 * High-level domain service for behavioral pattern analysis and insights.
 *
 * Architecture Note:
 * This domain service uses dependency injection for the database pool. The core package
 * functions (createPatternDetector, createMemoryRetrievalService) currently expect `pg.Pool`,
 * but the domain layer defines `IDatabasePool` to maintain architectural decoupling.
 * Type assertions are used at the injection points - this is a documented trade-off
 * that allows the domain layer to remain infrastructure-agnostic.
 *
 * TODO: Future improvement would be to update @medicalcor/core cognitive functions
 * to accept the exported DatabasePool interface instead of pg.Pool directly.
 *
 * @module domain/behavioral-insights/behavioral-insights-service
 */

import {
  createPatternDetector,
  createMemoryRetrievalService,
  type BehavioralPattern,
  type CognitiveInsight,
  type SubjectMemorySummary,
  type SubjectType,
  type IOpenAIClient,
  type IEmbeddingService,
  type CognitiveSystemConfig,
} from '@medicalcor/core';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Behavioral profile for a subject (lead/patient/contact)
 */
export interface BehavioralProfile {
  subjectType: SubjectType;
  subjectId: string;
  /** Summary statistics from memory */
  memorySummary: SubjectMemorySummary;
  /** Detected behavioral patterns */
  patterns: BehavioralPattern[];
  /** Generated cognitive insights */
  insights: CognitiveInsight[];
  /** Key recommendations for engagement */
  recommendations: string[];
  /** Risk level for churn */
  churnRisk: 'low' | 'medium' | 'high';
  /** Engagement score (0-100) */
  engagementScore: number;
  /** Timestamp of profile generation */
  generatedAt: Date;
}

/**
 * Subject behavioral summary for quick overview
 */
export interface BehavioralSummary {
  subjectType: SubjectType;
  subjectId: string;
  patternCount: number;
  topPatterns: string[];
  insightCount: number;
  topInsightTypes: string[];
  engagementScore: number;
  churnRisk: 'low' | 'medium' | 'high';
  lastInteraction: Date | null;
}

/**
 * Batch processing result
 */
export interface BatchProcessingResult {
  totalSubjects: number;
  successfulSubjects: number;
  failedSubjects: number;
  totalPatternsDetected: number;
  processingTimeMs: number;
  results: {
    subjectId: string;
    success: boolean;
    patternsDetected?: number;
    error?: string;
  }[];
}

/**
 * Database connection pool interface
 *
 * This interface defines the minimal contract needed for database operations.
 * It avoids importing pg directly in the domain layer while providing type safety.
 * The actual implementation (pg.Pool) is injected by the infrastructure layer.
 */
export interface IDatabasePool {
  query(queryText: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Service dependencies
 *
 * Note: The pool parameter accepts any pg.Pool-compatible object.
 * This allows the domain layer to remain decoupled from the specific
 * database driver implementation.
 */
export interface BehavioralInsightsServiceDependencies {
  /** Database pool - must be pg.Pool compatible (injected by infrastructure layer) */
  pool: IDatabasePool;
  openai: IOpenAIClient;
  embeddings: IEmbeddingService;
  config?: Partial<CognitiveSystemConfig>;
}

// ============================================================================
// ENGAGEMENT SCORE CONFIGURATION
// ============================================================================

/**
 * Configuration for engagement score calculation
 * Each factor has a max contribution to the total score (0-100)
 */
const ENGAGEMENT_SCORE_CONFIG = {
  /** Points for interaction volume */
  interactions: {
    maxPoints: 30,
    pointsPerEvent: 2,
  },
  /** Points for using multiple communication channels */
  channelDiversity: {
    maxPoints: 20,
    pointsPerChannel: 5,
  },
  /** Points based on how recently the subject interacted */
  recency: {
    maxPoints: 20,
    tiers: [
      { maxDays: 7, points: 20 },
      { maxDays: 30, points: 15 },
      { maxDays: 60, points: 10 },
      { maxDays: 90, points: 5 },
    ] as const,
  },
  /** Points based on positive sentiment ratio */
  sentiment: {
    maxPoints: 15,
  },
  /** Bonus points for high engagement pattern */
  highEngagementBonus: {
    maxPoints: 15,
  },
  /** Penalty for declining engagement pattern */
  decliningEngagementPenalty: {
    maxPoints: 20,
  },
} as const;

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Domain service for behavioral insights and pattern detection
 *
 * Provides high-level abstractions over the cognitive system for:
 * - Generating comprehensive behavioral profiles
 * - Batch processing multiple subjects
 * - Churn risk assessment
 * - Engagement scoring
 */
export class BehavioralInsightsService {
  private patternDetector: ReturnType<typeof createPatternDetector>;
  private memoryRetrieval: ReturnType<typeof createMemoryRetrievalService>;

  constructor(private deps: BehavioralInsightsServiceDependencies) {
    // Cast pool to the expected type - the infrastructure layer is responsible for
    // providing a pg.Pool-compatible object

    this.patternDetector = createPatternDetector(deps.pool as unknown, deps.openai, deps.config);

    this.memoryRetrieval = createMemoryRetrievalService(
      deps.pool as unknown,
      deps.embeddings,
      deps.config
    );
  }

  // ============================================================================
  // PROFILE GENERATION
  // ============================================================================

  /**
   * Generate a comprehensive behavioral profile for a subject
   */
  async generateProfile(subjectType: SubjectType, subjectId: string): Promise<BehavioralProfile> {
    const _startTime = Date.now();

    // Gather all data in parallel
    const [memorySummary, patterns, insights] = await Promise.all([
      this.memoryRetrieval.getSubjectSummary(subjectType, subjectId),
      this.patternDetector.getStoredPatterns(subjectType, subjectId),
      this.patternDetector.generateInsights(subjectType, subjectId),
    ]);

    // Calculate engagement score
    const engagementScore = this.calculateEngagementScore(memorySummary, patterns);

    // Determine churn risk
    const churnRisk = this.assessChurnRisk(patterns, insights, memorySummary);

    // Generate recommendations
    const recommendations = this.generateRecommendations(patterns, insights, churnRisk);

    return {
      subjectType,
      subjectId,
      memorySummary,
      patterns,
      insights,
      recommendations,
      churnRisk,
      engagementScore,
      generatedAt: new Date(),
    };
  }

  /**
   * Get a quick behavioral summary for a subject
   */
  async getSummary(subjectType: SubjectType, subjectId: string): Promise<BehavioralSummary> {
    const [memorySummary, patterns, insights] = await Promise.all([
      this.memoryRetrieval.getSubjectSummary(subjectType, subjectId),
      this.patternDetector.getStoredPatterns(subjectType, subjectId),
      this.patternDetector.generateInsights(subjectType, subjectId),
    ]);

    const engagementScore = this.calculateEngagementScore(memorySummary, patterns);
    const churnRisk = this.assessChurnRisk(patterns, insights, memorySummary);

    // Extract top patterns (highest confidence)
    const topPatterns = patterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((p) => p.patternType);

    // Extract top insight types
    const topInsightTypes = insights
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((i) => i.type);

    return {
      subjectType,
      subjectId,
      patternCount: patterns.length,
      topPatterns,
      insightCount: insights.length,
      topInsightTypes,
      engagementScore,
      churnRisk,
      lastInteraction: memorySummary.lastInteraction,
    };
  }

  // ============================================================================
  // PATTERN DETECTION
  // ============================================================================

  /**
   * Detect patterns for a single subject
   */
  async detectPatterns(subjectType: SubjectType, subjectId: string): Promise<BehavioralPattern[]> {
    return this.patternDetector.detectPatterns(subjectType, subjectId);
  }

  /**
   * Batch detect patterns for multiple subjects
   */
  async detectPatternsBatch(
    subjects: { subjectType: SubjectType; subjectId: string }[]
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const results: BatchProcessingResult['results'] = [];
    let successfulSubjects = 0;
    let failedSubjects = 0;
    let totalPatternsDetected = 0;

    for (const subject of subjects) {
      try {
        const patterns = await this.patternDetector.detectPatterns(
          subject.subjectType,
          subject.subjectId
        );
        results.push({
          subjectId: subject.subjectId,
          success: true,
          patternsDetected: patterns.length,
        });
        successfulSubjects++;
        totalPatternsDetected += patterns.length;
      } catch (error) {
        results.push({
          subjectId: subject.subjectId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failedSubjects++;
      }
    }

    return {
      totalSubjects: subjects.length,
      successfulSubjects,
      failedSubjects,
      totalPatternsDetected,
      processingTimeMs: Date.now() - startTime,
      results,
    };
  }

  /**
   * Get stored patterns for a subject
   */
  async getPatterns(subjectType: SubjectType, subjectId: string): Promise<BehavioralPattern[]> {
    return this.patternDetector.getStoredPatterns(subjectType, subjectId);
  }

  // ============================================================================
  // INSIGHTS
  // ============================================================================

  /**
   * Generate insights for a subject
   */
  async generateInsights(subjectType: SubjectType, subjectId: string): Promise<CognitiveInsight[]> {
    return this.patternDetector.generateInsights(subjectType, subjectId);
  }

  /**
   * Get subjects at risk of churn
   */
  async getChurnRiskSubjects(
    clinicId: string,
    limit = 20
  ): Promise<{ subjectId: string; subjectType: SubjectType; riskLevel: string; reason: string }[]> {
    // Query for subjects with declining engagement or appointment_rescheduler patterns
    const result = await this.deps.pool.query(
      `
      SELECT DISTINCT
        bp.subject_id,
        bp.subject_type,
        bp.pattern_type,
        bp.confidence
      FROM behavioral_patterns bp
      INNER JOIN episodic_events ee ON ee.subject_id = bp.subject_id AND ee.subject_type = bp.subject_type
      WHERE bp.pattern_type IN ('declining_engagement', 'appointment_rescheduler')
        AND bp.confidence >= 0.6
      ORDER BY bp.confidence DESC
      LIMIT $1
      `,
      [limit]
    );

    return result.rows.map((row) => ({
      subjectId: row.subject_id as string,
      subjectType: row.subject_type as SubjectType,
      riskLevel: (row.confidence as number) >= 0.8 ? 'high' : 'medium',
      reason: this.getChurnReason(row.pattern_type as string),
    }));
  }

  /**
   * Get reactivation candidates
   */
  async getReactivationCandidates(
    clinicId: string,
    minDaysInactive = 60,
    limit = 20
  ): Promise<{ subjectId: string; subjectType: SubjectType; daysSinceLastInteraction: number }[]> {
    const result = await this.deps.pool.query(
      `
      SELECT
        subject_type,
        subject_id,
        MAX(occurred_at) as last_interaction
      FROM episodic_events
      WHERE deleted_at IS NULL
      GROUP BY subject_type, subject_id
      HAVING MAX(occurred_at) < NOW() - ($1 || ' days')::INTERVAL
        AND COUNT(*) >= 3
      ORDER BY last_interaction ASC
      LIMIT $2
      `,
      [minDaysInactive, limit]
    );

    return result.rows.map((row) => {
      const lastInteraction = row.last_interaction as Date;
      const daysSince = Math.floor(
        (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        subjectId: row.subject_id as string,
        subjectType: row.subject_type as SubjectType,
        daysSinceLastInteraction: daysSince,
      };
    });
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get pattern statistics for dashboard
   */
  async getPatternStats(): Promise<{
    totalPatterns: number;
    byType: Record<string, number>;
    highConfidenceCount: number;
    recentlyDetected: number;
  }> {
    return this.patternDetector.getPatternStats();
  }

  // ============================================================================
  // PRIVATE METHODS - ENGAGEMENT SCORING
  // ============================================================================

  /**
   * Calculate engagement score from memory summary and behavioral patterns
   * Score ranges from 0-100 based on multiple factors
   */
  private calculateEngagementScore(
    summary: SubjectMemorySummary,
    patterns: BehavioralPattern[]
  ): number {
    const score =
      this.scoreInteractionVolume(summary.totalEvents) +
      this.scoreChannelDiversity(summary.channelBreakdown) +
      this.scoreRecency(summary.lastInteraction) +
      this.scoreSentiment(summary.sentimentCounts) +
      this.scorePatternBonus(patterns) -
      this.scorePatternPenalty(patterns);

    return this.clampScore(score);
  }

  /**
   * Score based on total interaction count
   * More interactions indicate higher engagement
   */
  private scoreInteractionVolume(totalEvents: number): number {
    const { maxPoints, pointsPerEvent } = ENGAGEMENT_SCORE_CONFIG.interactions;
    return Math.min(totalEvents * pointsPerEvent, maxPoints);
  }

  /**
   * Score based on number of communication channels used
   * Using multiple channels indicates broader engagement
   */
  private scoreChannelDiversity(channelBreakdown: Record<string, number>): number {
    const { maxPoints, pointsPerChannel } = ENGAGEMENT_SCORE_CONFIG.channelDiversity;
    const channelCount = Object.keys(channelBreakdown).length;
    return Math.min(channelCount * pointsPerChannel, maxPoints);
  }

  /**
   * Score based on how recently the subject interacted
   * More recent interactions score higher
   */
  private scoreRecency(lastInteraction: Date | null): number {
    if (!lastInteraction) {
      return 0;
    }

    const daysSinceInteraction = Math.floor(
      (Date.now() - lastInteraction.getTime()) / MILLISECONDS_PER_DAY
    );

    for (const tier of ENGAGEMENT_SCORE_CONFIG.recency.tiers) {
      if (daysSinceInteraction <= tier.maxDays) {
        return tier.points;
      }
    }

    return 0;
  }

  /**
   * Score based on positive sentiment ratio
   * Higher positive sentiment indicates better engagement
   */
  private scoreSentiment(sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  }): number {
    const totalSentiment =
      sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative;

    if (totalSentiment === 0) {
      return 0;
    }

    const positiveRatio = sentimentCounts.positive / totalSentiment;
    return Math.round(positiveRatio * ENGAGEMENT_SCORE_CONFIG.sentiment.maxPoints);
  }

  /**
   * Bonus points for high engagement behavioral pattern
   */
  private scorePatternBonus(patterns: BehavioralPattern[]): number {
    const highEngagementPattern = patterns.find((p) => p.patternType === 'high_engagement');

    if (!highEngagementPattern) {
      return 0;
    }

    return Math.round(
      highEngagementPattern.confidence * ENGAGEMENT_SCORE_CONFIG.highEngagementBonus.maxPoints
    );
  }

  /**
   * Penalty for declining engagement behavioral pattern
   */
  private scorePatternPenalty(patterns: BehavioralPattern[]): number {
    const decliningPattern = patterns.find((p) => p.patternType === 'declining_engagement');

    if (!decliningPattern) {
      return 0;
    }

    return Math.round(
      decliningPattern.confidence * ENGAGEMENT_SCORE_CONFIG.decliningEngagementPenalty.maxPoints
    );
  }

  /**
   * Clamp score to valid range [0, 100]
   */
  private clampScore(score: number): number {
    return Math.max(0, Math.min(100, score));
  }

  // ============================================================================
  // PRIVATE METHODS - CHURN ASSESSMENT
  // ============================================================================

  private assessChurnRisk(
    patterns: BehavioralPattern[],
    insights: CognitiveInsight[],
    summary: SubjectMemorySummary
  ): 'low' | 'medium' | 'high' {
    // Check for explicit churn risk insight
    const churnInsight = insights.find((i) => i.type === 'churn_risk');
    if (churnInsight && churnInsight.confidence >= 0.7) {
      return 'high';
    }

    // Check for declining engagement pattern
    const decliningPattern = patterns.find((p) => p.patternType === 'declining_engagement');
    if (decliningPattern && decliningPattern.confidence >= 0.6) {
      return 'high';
    }

    // Check for appointment rescheduler pattern (moderate risk)
    const reschedulerPattern = patterns.find((p) => p.patternType === 'appointment_rescheduler');
    if (reschedulerPattern && reschedulerPattern.confidence >= 0.5) {
      return 'medium';
    }

    // Check for sentiment decline
    if (summary.sentimentTrend === 'declining') {
      return 'medium';
    }

    // Check for reactivation candidate
    const reactivationInsight = insights.find((i) => i.type === 'reactivation_candidate');
    if (reactivationInsight) {
      return 'medium';
    }

    return 'low';
  }

  private generateRecommendations(
    patterns: BehavioralPattern[],
    insights: CognitiveInsight[],
    churnRisk: 'low' | 'medium' | 'high'
  ): string[] {
    const recommendations: string[] = [];

    // Add insight-based recommendations
    for (const insight of insights) {
      if (insight.recommendedAction) {
        recommendations.push(insight.recommendedAction);
      }
    }

    // Add pattern-based recommendations
    for (const pattern of patterns) {
      if (pattern.patternType === 'quick_responder') {
        recommendations.push('Use real-time communication channels for best engagement');
      }
      if (pattern.patternType === 'slow_responder') {
        recommendations.push('Allow adequate response time before follow-ups');
      }
      if (pattern.patternType === 'monday_avoider') {
        recommendations.push('Avoid scheduling appointments on Mondays');
      }
      if (pattern.patternType === 'quality_focused') {
        recommendations.push('Emphasize credentials and success stories in communications');
      }
    }

    // Add risk-based recommendations
    if (churnRisk === 'high') {
      recommendations.push('Prioritize immediate follow-up with personalized outreach');
      recommendations.push('Consider offering special incentives or flexible options');
    } else if (churnRisk === 'medium') {
      recommendations.push('Schedule proactive check-in within the next week');
    }

    // Deduplicate and limit
    return Array.from(new Set(recommendations)).slice(0, 5);
  }

  private getChurnReason(patternType: string): string {
    switch (patternType) {
      case 'declining_engagement':
        return 'Declining engagement over time';
      case 'appointment_rescheduler':
        return 'Frequent appointment rescheduling';
      default:
        return 'Behavioral pattern indicates potential churn';
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a behavioral insights service
 */
export function createBehavioralInsightsService(
  deps: BehavioralInsightsServiceDependencies
): BehavioralInsightsService {
  return new BehavioralInsightsService(deps);
}
