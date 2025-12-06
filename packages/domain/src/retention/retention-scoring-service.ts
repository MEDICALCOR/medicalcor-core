/**
 * @fileoverview Retention Scoring Service
 *
 * AI-powered churn prediction and retention scoring for patient management.
 * Implements the core business logic for calculating retention scores.
 *
 * @module domain/retention/retention-scoring-service
 *
 * SCORING ALGORITHM:
 * Base score: 100 points
 *
 * Factors:
 * 1. Days Inactive (max -40 points)
 *    - 0-7 days: 0
 *    - 8-30 days: -10
 *    - 31-60 days: -20
 *    - 61-90 days: -30
 *    - 90+ days: -40
 *
 * 2. Canceled Appointments (max -30 points)
 *    - Each cancellation: -10 points
 *
 * 3. NPS Score (-20 to +10 points)
 *    - Detractor (0-6): -20
 *    - Passive (7-8): -5
 *    - Promoter (9-10): +10
 *
 * 4. Treatment Engagement (max +10 points)
 *    - 1-2 treatments: 0
 *    - 3-5 treatments: +5
 *    - 6+ treatments: +10
 *
 * 5. High-Value Patient Bonus (+5 points)
 *    - LTV > 20,000 EUR: +5
 */

import {
  RetentionScore,
  type ChurnRiskLevel,
  type FollowUpPriority,
  type RetentionClassification,
} from '../shared-kernel/value-objects/retention-score.js';

/**
 * Input metrics for retention score calculation
 */
export interface RetentionMetricsInput {
  /** Number of days since last patient activity */
  daysInactive: number;
  /** Number of canceled appointments in last 12 months */
  canceledAppointments: number;
  /** NPS score (0-10) if available */
  npsScore: number | null;
  /** Customer lifetime value in EUR */
  lifetimeValue: number;
  /** Total number of completed treatments */
  totalTreatments: number;
}

/**
 * Detailed scoring breakdown for transparency
 */
export interface RetentionScoreBreakdown {
  /** Base score before adjustments */
  baseScore: number;
  /** Inactivity penalty applied */
  inactivityPenalty: number;
  /** Cancellation penalty applied */
  cancellationPenalty: number;
  /** NPS adjustment (can be positive or negative) */
  npsAdjustment: number;
  /** Engagement bonus applied */
  engagementBonus: number;
  /** High-value patient bonus */
  highValueBonus: number;
  /** Final calculated score */
  finalScore: number;
}

/**
 * Full retention scoring output with breakdown
 */
export interface RetentionScoringOutput {
  /** Retention score (0-100) - probability of patient returning */
  score: number;
  /** Churn risk classification */
  churnRisk: ChurnRiskLevel;
  /** Recommended follow-up priority */
  followUpPriority: FollowUpPriority;
  /** Business classification for retention status */
  classification: RetentionClassification;
  /** Confidence level of the prediction (0-1) */
  confidence: number;
  /** Detailed score breakdown */
  breakdown: RetentionScoreBreakdown;
  /** Human-readable reasoning */
  reasoning: string;
  /** Recommended actions */
  suggestedActions: string[];
  /** Timestamp of calculation */
  calculatedAt: string;
}

// Simple logger interface for when @medicalcor/core is not available
const logger = {
  debug: (message: string, data?: Record<string, unknown>) => {
    if (process.env.DEBUG) {
      console.debug(`[retention-scoring] ${message}`, data);
    }
  },
};

/**
 * Configuration for the retention scoring service
 */
export interface RetentionScoringServiceConfig {
  /** Enable AI-enhanced scoring (future) */
  aiEnhanced?: boolean;

  /** Custom weight adjustments */
  weights?: Partial<RetentionScoreWeights>;

  /** Custom thresholds */
  thresholds?: Partial<RetentionThresholds>;
}

/**
 * Weight configuration for scoring factors
 */
export interface RetentionScoreWeights {
  /** Max penalty for inactivity */
  inactivityMaxPenalty: number;

  /** Penalty per cancellation */
  cancellationPenalty: number;

  /** Max cancellation penalty */
  cancellationMaxPenalty: number;

  /** NPS detractor penalty */
  npsDetractorPenalty: number;

  /** NPS passive penalty */
  npsPassivePenalty: number;

  /** NPS promoter bonus */
  npsPromoterBonus: number;

  /** Engagement bonus for 3-5 treatments */
  engagementMidBonus: number;

  /** Engagement bonus for 6+ treatments */
  engagementHighBonus: number;

  /** High-value patient bonus */
  highValueBonus: number;
}

/**
 * Threshold configuration
 */
export interface RetentionThresholds {
  /** Days for each inactivity tier */
  inactivityTiers: [number, number, number, number]; // [7, 30, 60, 90]

  /** Treatment count for mid engagement */
  engagementMidThreshold: number;

  /** Treatment count for high engagement */
  engagementHighThreshold: number;

  /** LTV threshold for high-value bonus */
  highValueLtvThreshold: number;

  /** Score thresholds for classification */
  classificationThresholds: {
    loyal: number;
    stable: number;
    atRisk: number;
    churning: number;
  };
}

/**
 * Default weights for scoring factors
 */
const DEFAULT_WEIGHTS: RetentionScoreWeights = {
  inactivityMaxPenalty: 40,
  cancellationPenalty: 10,
  cancellationMaxPenalty: 30,
  npsDetractorPenalty: 20,
  npsPassivePenalty: 5,
  npsPromoterBonus: 10,
  engagementMidBonus: 5,
  engagementHighBonus: 10,
  highValueBonus: 5,
};

/**
 * Default thresholds
 */
const DEFAULT_THRESHOLDS: RetentionThresholds = {
  inactivityTiers: [7, 30, 60, 90],
  engagementMidThreshold: 3,
  engagementHighThreshold: 6,
  highValueLtvThreshold: 20000,
  classificationThresholds: {
    loyal: 80,
    stable: 60,
    atRisk: 40,
    churning: 20,
  },
};

/**
 * Retention Scoring Service
 *
 * Calculates patient retention scores and churn risk predictions.
 */
export class RetentionScoringService {
  private weights: RetentionScoreWeights;
  private thresholds: RetentionThresholds;
  private aiEnhanced: boolean;

  constructor(config: RetentionScoringServiceConfig = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...config.weights };
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    this.aiEnhanced = config.aiEnhanced ?? false;
  }

  /**
   * Calculate retention score for a patient
   *
   * @param metrics - Patient retention metrics
   * @returns Complete scoring output with breakdown
   */
  public calculateScore(metrics: RetentionMetricsInput): RetentionScoringOutput {
    const breakdown = this.calculateBreakdown(metrics);
    const valueObject = RetentionScore.fromNumeric(
      breakdown.finalScore,
      0.85, // Rule-based confidence
      metrics.lifetimeValue
    );

    const output: RetentionScoringOutput = {
      score: valueObject.numericValue,
      churnRisk: valueObject.churnRisk,
      followUpPriority: valueObject.followUpPriority,
      classification: valueObject.classification,
      confidence: valueObject.confidence,
      breakdown,
      reasoning: this.generateReasoning(metrics, breakdown),
      suggestedActions: valueObject.getSuggestedActions(),
      calculatedAt: valueObject.calculatedAt.toISOString(),
    };

    logger.debug('Retention score calculated', {
      score: output.score,
      churnRisk: output.churnRisk,
      classification: output.classification,
    });

    return output;
  }

  /**
   * Calculate a simple score result without full breakdown
   *
   * @param metrics - Patient retention metrics
   * @returns Simple score result
   */
  public calculateSimpleScore(metrics: RetentionMetricsInput): {
    score: number;
    churnRisk: ChurnRiskLevel;
    followUpPriority: FollowUpPriority;
  } {
    const breakdown = this.calculateBreakdown(metrics);
    const valueObject = RetentionScore.fromNumeric(
      breakdown.finalScore,
      0.85,
      metrics.lifetimeValue
    );

    return {
      score: valueObject.numericValue,
      churnRisk: valueObject.churnRisk,
      followUpPriority: valueObject.followUpPriority,
    };
  }

  /**
   * Get the RetentionScore value object for domain operations
   */
  public getValueObject(metrics: RetentionMetricsInput): RetentionScore {
    const breakdown = this.calculateBreakdown(metrics);
    return RetentionScore.fromNumeric(breakdown.finalScore, 0.85, metrics.lifetimeValue);
  }

  /**
   * Calculate the detailed score breakdown
   */
  private calculateBreakdown(metrics: RetentionMetricsInput): RetentionScoreBreakdown {
    const baseScore = 100;
    let score = baseScore;

    // Factor 1: Days Inactive
    const inactivityPenalty = this.calculateInactivityPenalty(metrics.daysInactive);
    score -= inactivityPenalty;

    // Factor 2: Canceled Appointments
    const cancellationPenalty = this.calculateCancellationPenalty(metrics.canceledAppointments);
    score -= cancellationPenalty;

    // Factor 3: NPS Score
    const npsAdjustment = this.calculateNpsAdjustment(metrics.npsScore);
    score += npsAdjustment;

    // Factor 4: Engagement bonus
    const engagementBonus = this.calculateEngagementBonus(metrics.totalTreatments);
    score += engagementBonus;

    // Factor 5: High-value patient bonus
    const highValueBonus = this.calculateHighValueBonus(metrics.lifetimeValue);
    score += highValueBonus;

    // Clamp to 0-100
    const finalScore = Math.max(0, Math.min(100, score));

    return {
      baseScore,
      inactivityPenalty,
      cancellationPenalty,
      npsAdjustment,
      engagementBonus,
      highValueBonus,
      finalScore,
    };
  }

  /**
   * Calculate inactivity penalty based on days since last activity
   */
  private calculateInactivityPenalty(daysInactive: number): number {
    const [tier1, tier2, tier3, tier4] = this.thresholds.inactivityTiers;

    if (daysInactive > tier4) {
      return this.weights.inactivityMaxPenalty; // -40 for 90+ days
    }
    if (daysInactive > tier3) {
      return 30; // -30 for 61-90 days
    }
    if (daysInactive > tier2) {
      return 20; // -20 for 31-60 days
    }
    if (daysInactive > tier1) {
      return 10; // -10 for 8-30 days
    }
    return 0; // No penalty for 0-7 days
  }

  /**
   * Calculate cancellation penalty
   */
  private calculateCancellationPenalty(canceledAppointments: number): number {
    return Math.min(
      canceledAppointments * this.weights.cancellationPenalty,
      this.weights.cancellationMaxPenalty
    );
  }

  /**
   * Calculate NPS adjustment
   */
  private calculateNpsAdjustment(npsScore: number | null): number {
    if (npsScore === null) {
      return 0; // No adjustment if no NPS data
    }

    if (npsScore <= 6) {
      return -this.weights.npsDetractorPenalty; // Detractor
    }
    if (npsScore <= 8) {
      return -this.weights.npsPassivePenalty; // Passive
    }
    return this.weights.npsPromoterBonus; // Promoter (9-10)
  }

  /**
   * Calculate engagement bonus based on treatment count
   */
  private calculateEngagementBonus(totalTreatments: number): number {
    if (totalTreatments >= this.thresholds.engagementHighThreshold) {
      return this.weights.engagementHighBonus; // +10 for 6+ treatments
    }
    if (totalTreatments >= this.thresholds.engagementMidThreshold) {
      return this.weights.engagementMidBonus; // +5 for 3-5 treatments
    }
    return 0; // No bonus for 1-2 treatments
  }

  /**
   * Calculate high-value patient bonus
   */
  private calculateHighValueBonus(lifetimeValue: number): number {
    if (lifetimeValue > this.thresholds.highValueLtvThreshold) {
      return this.weights.highValueBonus;
    }
    return 0;
  }

  /**
   * Generate human-readable reasoning for the score
   */
  private generateReasoning(
    metrics: RetentionMetricsInput,
    breakdown: RetentionScoreBreakdown
  ): string {
    const factors: string[] = [];

    // Inactivity
    if (breakdown.inactivityPenalty > 0) {
      factors.push(`${metrics.daysInactive} days inactive (-${breakdown.inactivityPenalty})`);
    } else {
      factors.push('Recently active');
    }

    // Cancellations
    if (breakdown.cancellationPenalty > 0) {
      factors.push(
        `${metrics.canceledAppointments} canceled appointments (-${breakdown.cancellationPenalty})`
      );
    }

    // NPS
    if (metrics.npsScore !== null) {
      if (breakdown.npsAdjustment > 0) {
        factors.push(`NPS promoter (${metrics.npsScore}) (+${breakdown.npsAdjustment})`);
      } else if (breakdown.npsAdjustment < 0) {
        const type = metrics.npsScore <= 6 ? 'detractor' : 'passive';
        factors.push(`NPS ${type} (${metrics.npsScore}) (${breakdown.npsAdjustment})`);
      }
    }

    // Engagement
    if (breakdown.engagementBonus > 0) {
      factors.push(
        `${metrics.totalTreatments} treatments, engaged patient (+${breakdown.engagementBonus})`
      );
    }

    // High-value
    if (breakdown.highValueBonus > 0) {
      factors.push(
        `High-value patient (LTV: ${metrics.lifetimeValue} EUR) (+${breakdown.highValueBonus})`
      );
    }

    return `Retention score: ${breakdown.finalScore}/100. Factors: ${factors.join('; ')}`;
  }

  /**
   * Get classification label in Romanian
   */
  public getClassificationLabel(classification: RetentionClassification): string {
    const labels: Record<RetentionClassification, string> = {
      LOYAL: 'Loial',
      STABLE: 'Stabil',
      AT_RISK: 'La Risc',
      CHURNING: 'În Pierdere',
      LOST: 'Pierdut',
    };
    return labels[classification];
  }

  /**
   * Get churn risk label in Romanian
   */
  public getChurnRiskLabel(churnRisk: ChurnRiskLevel): string {
    const labels: Record<ChurnRiskLevel, string> = {
      SCAZUT: 'Risc Scăzut',
      MEDIU: 'Risc Mediu',
      RIDICAT: 'Risc Ridicat',
      FOARTE_RIDICAT: 'Risc Foarte Ridicat',
    };
    return labels[churnRisk];
  }

  /**
   * Get follow-up priority label in Romanian
   */
  public getFollowUpPriorityLabel(priority: FollowUpPriority): string {
    const labels: Record<FollowUpPriority, string> = {
      URGENTA: 'Urgentă',
      RIDICATA: 'Ridicată',
      MEDIE: 'Medie',
      SCAZUTA: 'Scăzută',
    };
    return labels[priority];
  }
}

/**
 * Create a configured retention scoring service
 */
export function createRetentionScoringService(
  config: RetentionScoringServiceConfig = {}
): RetentionScoringService {
  return new RetentionScoringService(config);
}
