/**
 * Cognitive Analyzer - Insight Generation & Churn Detection
 *
 * ADR-004 Phase 3: Analyzes episodic memory and behavioral patterns
 * to generate actionable insights including churn risk detection.
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';
import {
  DEFAULT_COGNITIVE_CONFIG,
  type CognitiveInsight,
  type SubjectMemorySummary,
  type BehavioralPattern,
  type SubjectType,
  type CognitiveSystemConfig,
} from './types.js';
import { PatternDetector } from './pattern-detector.js';
import { MemoryRetrievalService } from './memory-retrieval.js';
import type { IOpenAIClient, IEmbeddingService } from './episode-builder.js';

const logger = createLogger({ name: 'cognitive-analyzer' });

// =============================================================================
// Insight Generation Thresholds
// =============================================================================

interface InsightThresholds {
  /** Days without interaction for churn risk */
  churnInactiveDays: number;
  /** Negative sentiment ratio for churn risk */
  churnNegativeSentimentRatio: number;
  /** Days without interaction for reactivation */
  reactivationInactiveDays: number;
  /** Minimum events for reactivation candidate */
  reactivationMinEvents: number;
  /** Minimum positive events for referral opportunity */
  referralMinPositiveEvents: number;
  /** Minimum treatments for referral opportunity */
  referralMinTreatments: number;
  /** Engagement drop percentage for alert */
  engagementDropThreshold: number;
  /** Positive sentiment ratio for upsell opportunity */
  upsellPositiveSentimentRatio: number;
}

const DEFAULT_INSIGHT_THRESHOLDS: InsightThresholds = {
  churnInactiveDays: 45,
  churnNegativeSentimentRatio: 0.4,
  reactivationInactiveDays: 90,
  reactivationMinEvents: 5,
  referralMinPositiveEvents: 5,
  referralMinTreatments: 2,
  engagementDropThreshold: 0.5,
  upsellPositiveSentimentRatio: 0.7,
};

// =============================================================================
// Analysis Result Types
// =============================================================================

export interface SubjectAnalysis {
  subjectType: SubjectType;
  subjectId: string;
  summary: SubjectMemorySummary;
  patterns: BehavioralPattern[];
  insights: CognitiveInsight[];
  riskScore: number;
  opportunityScore: number;
  analysisTimestamp: Date;
}

export interface ChurnRiskAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  factors: string[];
  recommendedActions: string[];
  supportingEventIds: string[];
}

// =============================================================================
// Cognitive Analyzer Service
// =============================================================================

export class CognitiveAnalyzer {
  private config: CognitiveSystemConfig;
  private thresholds: InsightThresholds;
  private patternDetector: PatternDetector;
  private memoryRetrieval: MemoryRetrievalService;

  constructor(
    private pool: Pool,
    private openai: IOpenAIClient | null,
    embeddings: IEmbeddingService,
    config: Partial<CognitiveSystemConfig> = {},
    thresholds: Partial<InsightThresholds> = {}
  ) {
    this.config = { ...DEFAULT_COGNITIVE_CONFIG, ...config };
    this.thresholds = { ...DEFAULT_INSIGHT_THRESHOLDS, ...thresholds };
    this.patternDetector = new PatternDetector(pool, openai, config);
    this.memoryRetrieval = new MemoryRetrievalService(pool, embeddings, config);
  }

  /**
   * Perform comprehensive analysis for a subject
   */
  async analyzeSubject(subjectType: SubjectType, subjectId: string): Promise<SubjectAnalysis> {
    logger.info({ subjectType, subjectId }, 'Analyzing subject');

    // Get memory summary
    const summary = await this.memoryRetrieval.getSubjectSummary(subjectType, subjectId);

    // Detect patterns
    const patterns = await this.patternDetector.detectPatterns(subjectType, subjectId);

    // Generate insights
    const insights = this.generateInsights(summary, patterns);

    // Calculate risk and opportunity scores
    const riskScore = this.calculateRiskScore(summary, patterns, insights);
    const opportunityScore = this.calculateOpportunityScore(summary, patterns, insights);

    const analysis: SubjectAnalysis = {
      subjectType,
      subjectId,
      summary,
      patterns,
      insights,
      riskScore,
      opportunityScore,
      analysisTimestamp: new Date(),
    };

    logger.info(
      {
        subjectId,
        insightCount: insights.length,
        riskScore,
        opportunityScore,
      },
      'Subject analysis complete'
    );

    return analysis;
  }

  /**
   * Assess churn risk for a subject
   */
  async assessChurnRisk(subjectType: SubjectType, subjectId: string): Promise<ChurnRiskAssessment> {
    const summary = await this.memoryRetrieval.getSubjectSummary(subjectType, subjectId);
    const patterns = await this.patternDetector.getPatterns(subjectType, subjectId);
    const recentEvents = await this.memoryRetrieval.getRecentEvents(
      subjectType,
      subjectId,
      60, // Last 60 days
      50
    );

    const factors: string[] = [];
    const supportingEventIds: string[] = [];
    let riskScore = 0;

    // Factor 1: Days since last interaction
    if (summary.lastInteraction) {
      const daysSinceLastInteraction = Math.floor(
        (Date.now() - summary.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastInteraction >= this.thresholds.churnInactiveDays) {
        const inactivityFactor = Math.min(1, daysSinceLastInteraction / 90);
        riskScore += inactivityFactor * 0.35;
        factors.push(`No interaction in ${daysSinceLastInteraction} days`);
      }
    } else {
      // No interactions at all - not enough data
      return {
        riskLevel: 'low',
        riskScore: 0,
        factors: ['Insufficient interaction history'],
        recommendedActions: ['Continue nurturing with regular touchpoints'],
        supportingEventIds: [],
      };
    }

    // Factor 2: Sentiment trend
    if (summary.sentimentTrend === 'declining') {
      riskScore += 0.25;
      factors.push('Declining sentiment trend');
    }

    // Factor 3: Negative sentiment ratio
    const totalSentiment =
      summary.sentimentCounts.positive +
      summary.sentimentCounts.neutral +
      summary.sentimentCounts.negative;

    if (totalSentiment > 0) {
      const negativeRatio = summary.sentimentCounts.negative / totalSentiment;
      if (negativeRatio >= this.thresholds.churnNegativeSentimentRatio) {
        riskScore += negativeRatio * 0.2;
        factors.push(`High negative sentiment (${Math.round(negativeRatio * 100)}%)`);

        // Add negative event IDs
        const negativeEvents = recentEvents.filter((e) => e.sentiment === 'negative');
        supportingEventIds.push(...negativeEvents.map((e) => e.id));
      }
    }

    // Factor 4: Declining engagement pattern
    const decliningEngagement = patterns.find((p) => p.patternType === 'declining_engagement');
    if (decliningEngagement) {
      riskScore += decliningEngagement.confidence * 0.2;
      factors.push('Declining engagement pattern detected');
      supportingEventIds.push(...decliningEngagement.supportingEventIds);
    }

    // Factor 5: Appointment rescheduler pattern
    const rescheduler = patterns.find((p) => p.patternType === 'appointment_rescheduler');
    if (rescheduler && rescheduler.occurrenceCount >= 3) {
      riskScore += 0.1;
      factors.push('Frequent appointment reschedules');
      supportingEventIds.push(...rescheduler.supportingEventIds);
    }

    // Factor 6: Price sensitivity without conversion
    const priceSensitive = patterns.find((p) => p.patternType === 'price_sensitive');
    const hasPayments = recentEvents.some((e) => e.eventType.includes('payment'));
    if (priceSensitive && !hasPayments) {
      riskScore += 0.1;
      factors.push('Price sensitive without recent conversion');
    }

    // Normalize risk score
    riskScore = Math.min(1, riskScore);

    // Determine risk level
    let riskLevel: ChurnRiskAssessment['riskLevel'];
    if (riskScore >= 0.75) {
      riskLevel = 'critical';
    } else if (riskScore >= 0.5) {
      riskLevel = 'high';
    } else if (riskScore >= 0.25) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    // Generate recommended actions based on factors
    const recommendedActions = this.generateChurnPreventionActions(factors, riskLevel);

    return {
      riskLevel,
      riskScore,
      factors,
      recommendedActions,
      supportingEventIds: [...new Set(supportingEventIds)],
    };
  }

  /**
   * Get subjects at risk of churning
   */
  async getChurnRiskSubjects(
    subjectType: SubjectType,
    minRiskScore = 0.5,
    limit = 50
  ): Promise<ChurnRiskAssessment[]> {
    // Get subjects with declining engagement or recent negative sentiment
    const result = await this.pool.query(
      `WITH subject_stats AS (
        SELECT
          subject_id,
          MAX(occurred_at) as last_interaction,
          COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_count,
          COUNT(*) as total_count
        FROM episodic_events
        WHERE subject_type = $1 AND deleted_at IS NULL
        GROUP BY subject_id
        HAVING COUNT(*) >= 3
      )
      SELECT subject_id
      FROM subject_stats
      WHERE
        last_interaction < NOW() - INTERVAL '30 days'
        OR (negative_count::float / NULLIF(total_count, 0) > 0.3)
      ORDER BY last_interaction ASC
      LIMIT $2`,
      [subjectType, limit * 2] // Get more to filter by risk score
    );

    const assessments: ChurnRiskAssessment[] = [];

    for (const row of result.rows as { subject_id: string }[]) {
      const assessment = await this.assessChurnRisk(subjectType, row.subject_id);
      if (assessment.riskScore >= minRiskScore) {
        assessments.push(assessment);
      }
      if (assessments.length >= limit) break;
    }

    return assessments.sort((a, b) => b.riskScore - a.riskScore);
  }

  // ===========================================================================
  // Insight Generation
  // ===========================================================================

  /**
   * Generate all insights for a subject
   */
  private generateInsights(
    summary: SubjectMemorySummary,
    patterns: BehavioralPattern[]
  ): CognitiveInsight[] {
    const insights: CognitiveInsight[] = [];

    // Churn risk insight
    const churnInsight = this.detectChurnRiskInsight(summary, patterns);
    if (churnInsight) insights.push(churnInsight);

    // Engagement drop insight
    const engagementInsight = this.detectEngagementDropInsight(summary, patterns);
    if (engagementInsight) insights.push(engagementInsight);

    // Positive momentum insight
    const momentumInsight = this.detectPositiveMomentumInsight(summary);
    if (momentumInsight) insights.push(momentumInsight);

    // Upsell opportunity insight
    const upsellInsight = this.detectUpsellOpportunityInsight(summary, patterns);
    if (upsellInsight) insights.push(upsellInsight);

    // Reactivation candidate insight
    const reactivationInsight = this.detectReactivationCandidateInsight(summary);
    if (reactivationInsight) insights.push(reactivationInsight);

    // Referral opportunity insight
    const referralInsight = this.detectReferralOpportunityInsight(summary, patterns);
    if (referralInsight) insights.push(referralInsight);

    // Pattern-based insights
    for (const pattern of patterns) {
      if (pattern.confidence >= 0.7) {
        insights.push({
          type: 'pattern_detected',
          confidence: pattern.confidence,
          description: `Pattern: ${pattern.patternDescription}`,
          recommendedAction: this.getPatternRecommendation(pattern.patternType),
          supportingEventIds: pattern.supportingEventIds,
        });
      }
    }

    return insights;
  }

  /**
   * Detect churn risk insight
   */
  private detectChurnRiskInsight(
    summary: SubjectMemorySummary,
    patterns: BehavioralPattern[]
  ): CognitiveInsight | null {
    let confidence = 0;
    const factors: string[] = [];

    // Check inactivity
    if (summary.lastInteraction) {
      const daysSince = Math.floor(
        (Date.now() - summary.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince >= this.thresholds.churnInactiveDays) {
        confidence += 0.4;
        factors.push(`inactive for ${daysSince} days`);
      }
    }

    // Check sentiment
    if (summary.sentimentTrend === 'declining') {
      confidence += 0.3;
      factors.push('declining sentiment');
    }

    // Check patterns
    const decliningPattern = patterns.find((p) => p.patternType === 'declining_engagement');
    if (decliningPattern) {
      confidence += decliningPattern.confidence * 0.3;
      factors.push('declining engagement');
    }

    if (confidence < 0.4) return null;

    return {
      type: 'churn_risk',
      confidence: Math.min(1, confidence),
      description: `Churn risk detected: ${factors.join(', ')}`,
      recommendedAction: 'Initiate retention campaign with personalized re-engagement',
      supportingEventIds: decliningPattern?.supportingEventIds,
    };
  }

  /**
   * Detect engagement drop insight
   */
  private detectEngagementDropInsight(
    summary: SubjectMemorySummary,
    patterns: BehavioralPattern[]
  ): CognitiveInsight | null {
    const decliningPattern = patterns.find((p) => p.patternType === 'declining_engagement');

    if (!decliningPattern || decliningPattern.confidence < 0.5) return null;

    const dropRatio =
      (decliningPattern.metadata as { dropRatio?: number } | undefined)?.dropRatio ?? 0;

    if (dropRatio < this.thresholds.engagementDropThreshold) return null;

    return {
      type: 'engagement_drop',
      confidence: decliningPattern.confidence,
      description: `Engagement dropped by ${Math.round(dropRatio * 100)}% in recent period`,
      recommendedAction: 'Reach out with value-add content or special offer to re-engage',
      supportingEventIds: decliningPattern.supportingEventIds,
    };
  }

  /**
   * Detect positive momentum insight
   */
  private detectPositiveMomentumInsight(summary: SubjectMemorySummary): CognitiveInsight | null {
    if (summary.sentimentTrend !== 'improving') return null;

    const positiveRatio =
      summary.sentimentCounts.positive /
      (summary.sentimentCounts.positive +
        summary.sentimentCounts.neutral +
        summary.sentimentCounts.negative || 1);

    if (positiveRatio < 0.6) return null;

    return {
      type: 'positive_momentum',
      confidence: positiveRatio,
      description: `Positive momentum with ${Math.round(positiveRatio * 100)}% positive interactions`,
      recommendedAction: 'Capitalize on positive relationship with upsell or referral request',
    };
  }

  /**
   * Detect upsell opportunity insight
   */
  private detectUpsellOpportunityInsight(
    summary: SubjectMemorySummary,
    patterns: BehavioralPattern[]
  ): CognitiveInsight | null {
    const totalSentiment =
      summary.sentimentCounts.positive +
      summary.sentimentCounts.neutral +
      summary.sentimentCounts.negative;

    if (totalSentiment < 3) return null;

    const positiveRatio = summary.sentimentCounts.positive / totalSentiment;

    if (positiveRatio < this.thresholds.upsellPositiveSentimentRatio) return null;

    // Check for quality focus pattern
    const qualityPattern = patterns.find((p) => p.patternType === 'quality_focused');
    const highEngagement = patterns.find((p) => p.patternType === 'high_engagement');

    if (!qualityPattern && !highEngagement) return null;

    const confidence = Math.min(1, positiveRatio * 0.7 + (qualityPattern?.confidence ?? 0) * 0.3);

    return {
      type: 'upsell_opportunity',
      confidence,
      description: 'High satisfaction and quality focus indicates upsell potential',
      recommendedAction: 'Present premium treatment options or complementary services',
      supportingEventIds: qualityPattern?.supportingEventIds ?? highEngagement?.supportingEventIds,
    };
  }

  /**
   * Detect reactivation candidate insight
   */
  private detectReactivationCandidateInsight(
    summary: SubjectMemorySummary
  ): CognitiveInsight | null {
    if (summary.totalEvents < this.thresholds.reactivationMinEvents) return null;
    if (!summary.lastInteraction) return null;

    const daysSince = Math.floor(
      (Date.now() - summary.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince < this.thresholds.reactivationInactiveDays) return null;

    // Check if they had positive history
    const positiveRatio =
      summary.sentimentCounts.positive /
      (summary.sentimentCounts.positive +
        summary.sentimentCounts.neutral +
        summary.sentimentCounts.negative || 1);

    if (positiveRatio < 0.4) return null; // Don't reactivate negative experiences

    return {
      type: 'reactivation_candidate',
      confidence: Math.min(1, positiveRatio * 0.8),
      description: `Inactive for ${daysSince} days with positive history (${Math.round(positiveRatio * 100)}% positive)`,
      recommendedAction: 'Send personalized reactivation campaign with special offer',
    };
  }

  /**
   * Detect referral opportunity insight
   */
  private detectReferralOpportunityInsight(
    summary: SubjectMemorySummary,
    patterns: BehavioralPattern[]
  ): CognitiveInsight | null {
    // Need sufficient positive interactions
    if (summary.sentimentCounts.positive < this.thresholds.referralMinPositiveEvents) return null;

    // Check for high engagement
    const highEngagement = patterns.find((p) => p.patternType === 'high_engagement');
    if (!highEngagement || highEngagement.confidence < 0.6) return null;

    // Check sentiment trend is not declining
    if (summary.sentimentTrend === 'declining') return null;

    return {
      type: 'referral_opportunity',
      confidence: highEngagement.confidence,
      description: 'Highly engaged patient with positive experience - referral candidate',
      recommendedAction: 'Request referral with incentive offer',
      supportingEventIds: highEngagement.supportingEventIds,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(
    summary: SubjectMemorySummary,
    patterns: BehavioralPattern[],
    insights: CognitiveInsight[]
  ): number {
    let score = 0;

    // Churn risk insight
    const churnInsight = insights.find((i) => i.type === 'churn_risk');
    if (churnInsight) score += churnInsight.confidence * 0.4;

    // Engagement drop
    const engagementDrop = insights.find((i) => i.type === 'engagement_drop');
    if (engagementDrop) score += engagementDrop.confidence * 0.3;

    // Declining sentiment
    if (summary.sentimentTrend === 'declining') score += 0.2;

    // Negative patterns
    const negativePatterns = patterns.filter(
      (p) =>
        p.patternType === 'declining_engagement' ||
        p.patternType === 'appointment_rescheduler' ||
        p.patternType === 'slow_responder'
    );
    score += negativePatterns.length * 0.1;

    return Math.min(1, score);
  }

  /**
   * Calculate opportunity score
   */
  private calculateOpportunityScore(
    summary: SubjectMemorySummary,
    patterns: BehavioralPattern[],
    insights: CognitiveInsight[]
  ): number {
    let score = 0;

    // Positive momentum
    const momentum = insights.find((i) => i.type === 'positive_momentum');
    if (momentum) score += momentum.confidence * 0.3;

    // Upsell opportunity
    const upsell = insights.find((i) => i.type === 'upsell_opportunity');
    if (upsell) score += upsell.confidence * 0.3;

    // Referral opportunity
    const referral = insights.find((i) => i.type === 'referral_opportunity');
    if (referral) score += referral.confidence * 0.2;

    // Positive patterns
    const positivePatterns = patterns.filter(
      (p) =>
        p.patternType === 'high_engagement' ||
        p.patternType === 'quick_responder' ||
        p.patternType === 'quality_focused'
    );
    score += positivePatterns.length * 0.1;

    // Improving sentiment
    if (summary.sentimentTrend === 'improving') score += 0.1;

    return Math.min(1, score);
  }

  /**
   * Generate churn prevention actions
   */
  private generateChurnPreventionActions(
    factors: string[],
    riskLevel: ChurnRiskAssessment['riskLevel']
  ): string[] {
    const actions: string[] = [];

    if (riskLevel === 'critical') {
      actions.push('Immediate personal outreach from account manager');
      actions.push('Offer VIP consultation or special retention package');
    }

    if (factors.some((f) => f.includes('No interaction'))) {
      actions.push('Send personalized re-engagement email with value content');
      actions.push('Schedule follow-up call to check on patient needs');
    }

    if (factors.some((f) => f.includes('negative sentiment'))) {
      actions.push('Review recent interactions for service recovery opportunities');
      actions.push('Reach out to address any unresolved concerns');
    }

    if (factors.some((f) => f.includes('reschedule'))) {
      actions.push('Offer flexible scheduling options or virtual consultations');
    }

    if (factors.some((f) => f.includes('Price sensitive'))) {
      actions.push('Present financing options or package discounts');
    }

    if (factors.some((f) => f.includes('Declining engagement'))) {
      actions.push('Send educational content about treatment benefits');
      actions.push('Invite to patient appreciation event');
    }

    // Ensure at least one action
    if (actions.length === 0) {
      actions.push('Schedule regular check-in touchpoint');
    }

    return actions;
  }

  /**
   * Get recommendation for a pattern type
   */
  private getPatternRecommendation(patternType: string): string {
    const recommendations: Record<string, string> = {
      appointment_rescheduler: 'Offer flexible scheduling or reminder system improvements',
      monday_avoider: 'Avoid scheduling on Mondays when possible',
      high_engagement: 'Maintain engagement level with regular value-add communications',
      declining_engagement: 'Initiate re-engagement campaign',
      quick_responder: 'Leverage quick response pattern for time-sensitive offers',
      slow_responder: 'Use async communication channels, avoid time pressure',
      price_sensitive: 'Lead with value proposition, offer financing options',
      quality_focused: 'Emphasize expertise, credentials, and premium options',
      llm_communication_preference: 'Adapt communication style to detected preference',
      llm_time_preference: 'Schedule communications during preferred times',
      llm_topic_interest: 'Focus content on topics of interest',
    };

    return recommendations[patternType] ?? 'Adapt approach based on observed behavior';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createCognitiveAnalyzer(
  pool: Pool,
  openai: IOpenAIClient | null,
  embeddings: IEmbeddingService,
  config?: Partial<CognitiveSystemConfig>,
  thresholds?: Partial<InsightThresholds>
): CognitiveAnalyzer {
  return new CognitiveAnalyzer(pool, openai, embeddings, config, thresholds);
}
