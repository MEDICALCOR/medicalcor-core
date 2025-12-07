/**
 * @fileoverview pLTV (Predicted Lifetime Value) Scoring Service
 *
 * ML-powered prediction of future patient lifetime value based on lead attributes.
 * Implements a weighted factor scoring algorithm with configurable parameters.
 *
 * @module domain/ltv/pltv-scoring-service
 *
 * PREDICTION ALGORITHM:
 * Base Value: Historical LTV (totalPaid) or Average Case Value × Expected Cases
 *
 * Factors:
 * 1. Payment Reliability Factor (0.7 - 1.3 multiplier)
 *    - On-time payment rate, missed payments, payment method
 *
 * 2. Engagement Factor (0.6 - 1.4 multiplier)
 *    - Appointment completion rate, referrals, NPS score
 *
 * 3. Procedure Interest Factor (1.0 - 2.5 multiplier)
 *    - All-on-X: 2.5x, Implants: 1.8x, Full-mouth: 2.0x
 *
 * 4. Retention Factor (0.5 - 1.2 multiplier)
 *    - Based on retention score (inverse of churn risk)
 *
 * 5. Tenure Factor (0.8 - 1.3 multiplier)
 *    - Longer tenure with recent activity = higher multiplier
 *
 * Growth Potential:
 * - Based on procedure interest, engagement trend, and capacity
 */

import {
  PredictedLTV,
  type PLTVTier,
  type PLTVGrowthPotential,
  type PLTVInvestmentPriority,
} from '../shared-kernel/value-objects/predicted-ltv.js';

// ============================================================================
// INPUT TYPES
// ============================================================================

/**
 * Historical LTV data for prediction
 */
export interface HistoricalLTVInput {
  totalPaid: number;
  totalCaseValue: number;
  totalOutstanding: number;
  completedCases: number;
  totalCases: number;
  avgCaseValue: number;
  daysSinceFirstCase: number | null;
  daysSinceLastCase: number | null;
}

/**
 * Payment behavior metrics
 */
export interface PaymentBehaviorInput {
  onTimePaymentRate: number;
  paymentPlansUsed: number;
  avgDaysToPayment: number | null;
  missedPayments: number;
  preferredPaymentMethod?: 'cash' | 'card' | 'transfer' | 'financing' | 'unknown';
}

/**
 * Engagement metrics
 */
export interface EngagementMetricsInput {
  totalAppointments: number;
  keptAppointments: number;
  canceledAppointments: number;
  noShows: number;
  daysSinceLastContact: number;
  referralsMade: number;
  hasNPSFeedback: boolean;
  npsScore: number | null;
}

/**
 * Procedure interest indicators
 */
export interface ProcedureInterestInput {
  allOnXInterest: boolean;
  implantInterest: boolean;
  fullMouthInterest: boolean;
  cosmeticInterest: boolean;
  highValueProceduresCompleted: number;
  expressedInterests?: string[];
}

/**
 * Complete input for pLTV prediction
 */
export interface PLTVPredictionInput {
  leadId: string;
  clinicId: string;
  historical: HistoricalLTVInput;
  paymentBehavior: PaymentBehaviorInput;
  engagement: EngagementMetricsInput;
  procedureInterest: ProcedureInterestInput;
  retentionScore: number | null;
  leadSource?: 'whatsapp' | 'voice' | 'web' | 'hubspot' | 'referral' | 'facebook' | 'google';
  locationTier?: 'tier1' | 'tier2' | 'tier3';
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * Factor contribution breakdown
 */
export interface PLTVFactorBreakdown {
  historicalBaseline: number;
  paymentReliabilityAdjustment: number;
  engagementAdjustment: number;
  procedureInterestAdjustment: number;
  retentionAdjustment: number;
  tenureAdjustment: number;
  growthMultiplier: number;
  predictedValue: number;
}

/**
 * Confidence interval
 */
export interface PLTVConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

/**
 * Full scoring output
 */
export interface PLTVScoringOutput {
  leadId: string;
  predictedLTV: number;
  tier: PLTVTier;
  growthPotential: PLTVGrowthPotential;
  investmentPriority: PLTVInvestmentPriority;
  confidence: number;
  confidenceInterval: PLTVConfidenceInterval;
  breakdown: PLTVFactorBreakdown;
  reasoning: string;
  recommendedActions: string[];
  modelVersion: string;
  method: 'ml' | 'rule_based' | 'hybrid';
  calculatedAt: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Weight configuration for scoring factors
 */
export interface PLTVScoreWeights {
  // Payment reliability weights
  paymentReliabilityBase: number;
  onTimePaymentBonus: number;
  missedPaymentPenalty: number;
  financingBonus: number;

  // Engagement weights
  engagementBase: number;
  appointmentCompletionBonus: number;
  referralBonus: number;
  npsPromoterBonus: number;
  npsDetractorPenalty: number;

  // Procedure interest weights
  allOnXMultiplier: number;
  implantMultiplier: number;
  fullMouthMultiplier: number;
  cosmeticMultiplier: number;
  highValueProcedureBonus: number;

  // Retention weights
  retentionBase: number;
  retentionScoreMultiplier: number;

  // Tenure weights
  tenureBase: number;
  tenureBonus: number;
  recencyBonus: number;
  recencyPenalty: number;
}

/**
 * Threshold configuration
 */
export interface PLTVThresholds {
  // Tier thresholds (EUR)
  diamondThreshold: number;
  platinumThreshold: number;
  goldThreshold: number;
  silverThreshold: number;

  // Growth potential thresholds
  highGrowthThreshold: number;
  moderateGrowthThreshold: number;
  decliningThreshold: number;

  // Confidence thresholds
  highConfidenceThreshold: number;
  lowConfidenceThreshold: number;

  // Activity thresholds (days)
  recentActivityThreshold: number;
  inactiveThreshold: number;
  longTenureThreshold: number;
}

/**
 * Service configuration
 */
export interface PLTVScoringServiceConfig {
  weights?: Partial<PLTVScoreWeights>;
  thresholds?: Partial<PLTVThresholds>;
  modelVersion?: string;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_WEIGHTS: PLTVScoreWeights = {
  // Payment reliability
  paymentReliabilityBase: 1.0,
  onTimePaymentBonus: 0.2,
  missedPaymentPenalty: 0.1,
  financingBonus: 0.1,

  // Engagement
  engagementBase: 1.0,
  appointmentCompletionBonus: 0.3,
  referralBonus: 0.15,
  npsPromoterBonus: 0.1,
  npsDetractorPenalty: 0.2,

  // Procedure interest
  allOnXMultiplier: 2.5,
  implantMultiplier: 1.8,
  fullMouthMultiplier: 2.0,
  cosmeticMultiplier: 1.3,
  highValueProcedureBonus: 0.2,

  // Retention
  retentionBase: 1.0,
  retentionScoreMultiplier: 0.004, // 0-100 score → 0-0.4 adjustment

  // Tenure
  tenureBase: 1.0,
  tenureBonus: 0.2,
  recencyBonus: 0.1,
  recencyPenalty: 0.3,
};

const DEFAULT_THRESHOLDS: PLTVThresholds = {
  // Tier thresholds
  diamondThreshold: 50000,
  platinumThreshold: 30000,
  goldThreshold: 15000,
  silverThreshold: 5000,

  // Growth potential
  highGrowthThreshold: 0.3,
  moderateGrowthThreshold: 0.1,
  decliningThreshold: -0.15,

  // Confidence
  highConfidenceThreshold: 0.8,
  lowConfidenceThreshold: 0.5,

  // Activity (days)
  recentActivityThreshold: 30,
  inactiveThreshold: 180,
  longTenureThreshold: 365,
};

// ============================================================================
// PLTV SCORING SERVICE
// ============================================================================

/**
 * pLTV (Predicted Lifetime Value) Scoring Service
 *
 * Calculates predicted future lifetime value for patients based on
 * historical data, engagement patterns, and procedure interests.
 */
export class PLTVScoringService {
  private weights: PLTVScoreWeights;
  private thresholds: PLTVThresholds;
  private modelVersion: string;

  constructor(config: PLTVScoringServiceConfig = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...config.weights };
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
    this.modelVersion = config.modelVersion ?? '1.0.0';
  }

  /**
   * Calculate pLTV for a patient
   *
   * @param input - Complete patient data for prediction
   * @returns Full scoring output with breakdown
   */
  public calculatePLTV(input: PLTVPredictionInput): PLTVScoringOutput {
    const breakdown = this.calculateBreakdown(input);
    const growthPotential = this.determineGrowthPotential(input, breakdown);
    const confidence = this.calculateConfidence(input);

    const valueObject = PredictedLTV.fromValue(
      breakdown.predictedValue,
      confidence,
      growthPotential
    );

    const output: PLTVScoringOutput = {
      leadId: input.leadId,
      predictedLTV: valueObject.predictedValue,
      tier: valueObject.tier,
      growthPotential: valueObject.growthPotential,
      investmentPriority: valueObject.investmentPriority,
      confidence: valueObject.confidence,
      confidenceInterval: { ...valueObject.confidenceInterval },
      breakdown,
      reasoning: this.generateReasoning(input, breakdown, valueObject),
      recommendedActions: valueObject.getInvestmentActions(),
      modelVersion: this.modelVersion,
      method: 'rule_based',
      calculatedAt: valueObject.calculatedAt.toISOString(),
    };

    return output;
  }

  /**
   * Get the PredictedLTV value object for domain operations
   */
  public getValueObject(input: PLTVPredictionInput): PredictedLTV {
    const breakdown = this.calculateBreakdown(input);
    const growthPotential = this.determineGrowthPotential(input, breakdown);
    const confidence = this.calculateConfidence(input);

    return PredictedLTV.fromValue(breakdown.predictedValue, confidence, growthPotential);
  }

  /**
   * Calculate simple pLTV result
   */
  public calculateSimplePLTV(input: PLTVPredictionInput): {
    predictedLTV: number;
    tier: PLTVTier;
    confidence: number;
  } {
    const breakdown = this.calculateBreakdown(input);
    const confidence = this.calculateConfidence(input);
    const valueObject = PredictedLTV.fromValue(breakdown.predictedValue, confidence);

    return {
      predictedLTV: valueObject.predictedValue,
      tier: valueObject.tier,
      confidence: valueObject.confidence,
    };
  }

  // ============================================================================
  // CALCULATION METHODS
  // ============================================================================

  /**
   * Calculate the detailed factor breakdown
   */
  private calculateBreakdown(input: PLTVPredictionInput): PLTVFactorBreakdown {
    // Step 1: Calculate historical baseline
    const historicalBaseline = this.calculateHistoricalBaseline(input.historical);

    // Step 2: Calculate factor adjustments
    const paymentReliabilityFactor = this.calculatePaymentReliabilityFactor(input.paymentBehavior);
    const engagementFactor = this.calculateEngagementFactor(input.engagement);
    const procedureInterestFactor = this.calculateProcedureInterestFactor(input.procedureInterest);
    const retentionFactor = this.calculateRetentionFactor(input.retentionScore);
    const tenureFactor = this.calculateTenureFactor(input.historical);

    // Step 3: Calculate adjustments in EUR
    const paymentReliabilityAdjustment = historicalBaseline * (paymentReliabilityFactor - 1);
    const engagementAdjustment = historicalBaseline * (engagementFactor - 1);
    const procedureInterestAdjustment = historicalBaseline * (procedureInterestFactor - 1);
    const retentionAdjustment = historicalBaseline * (retentionFactor - 1);
    const tenureAdjustment = historicalBaseline * (tenureFactor - 1);

    // Step 4: Apply growth multiplier
    const growthMultiplier = this.calculateGrowthMultiplier(input);

    // Step 5: Calculate final predicted value
    const adjustedValue =
      historicalBaseline +
      paymentReliabilityAdjustment +
      engagementAdjustment +
      procedureInterestAdjustment +
      retentionAdjustment +
      tenureAdjustment;

    const predictedValue = Math.max(0, Math.round(adjustedValue * growthMultiplier));

    return {
      historicalBaseline,
      paymentReliabilityAdjustment: Math.round(paymentReliabilityAdjustment),
      engagementAdjustment: Math.round(engagementAdjustment),
      procedureInterestAdjustment: Math.round(procedureInterestAdjustment),
      retentionAdjustment: Math.round(retentionAdjustment),
      tenureAdjustment: Math.round(tenureAdjustment),
      growthMultiplier,
      predictedValue,
    };
  }

  /**
   * Calculate historical baseline value
   */
  private calculateHistoricalBaseline(historical: HistoricalLTVInput): number {
    // If patient has payment history, use it as baseline
    if (historical.totalPaid > 0) {
      // Project future value based on average case value and expected continuation
      const avgCaseValue =
        historical.avgCaseValue || historical.totalPaid / Math.max(1, historical.completedCases);
      const expectedFutureCases = this.estimateFutureCases(historical);
      return historical.totalPaid + avgCaseValue * expectedFutureCases;
    }

    // For new leads, estimate based on case value and interest
    if (historical.totalCaseValue > 0) {
      return historical.totalCaseValue * 0.85; // 85% conversion expectation
    }

    // Default baseline for leads with no history
    return 5000; // Conservative baseline estimate
  }

  /**
   * Estimate future cases based on historical patterns
   */
  private estimateFutureCases(historical: HistoricalLTVInput): number {
    if (historical.daysSinceFirstCase === null || historical.completedCases === 0) {
      return 2; // Default expectation for new patients
    }

    // Calculate cases per year rate
    const yearsActive = Math.max(historical.daysSinceFirstCase / 365, 0.25);
    const casesPerYear = historical.completedCases / yearsActive;

    // Project 3 years forward with decay
    const year1 = casesPerYear;
    const year2 = casesPerYear * 0.8;
    const year3 = casesPerYear * 0.6;

    return Math.round(year1 + year2 + year3);
  }

  /**
   * Calculate payment reliability factor (0.7 - 1.3)
   */
  private calculatePaymentReliabilityFactor(payment: PaymentBehaviorInput): number {
    let factor = this.weights.paymentReliabilityBase;

    // On-time payment bonus
    const onTimeRate = payment.onTimePaymentRate / 100;
    factor += onTimeRate * this.weights.onTimePaymentBonus;

    // Missed payment penalty
    factor -= Math.min(payment.missedPayments, 5) * this.weights.missedPaymentPenalty * 0.5;

    // Financing bonus (shows willingness to pay for expensive treatments)
    if (payment.preferredPaymentMethod === 'financing' || payment.paymentPlansUsed > 0) {
      factor += this.weights.financingBonus;
    }

    // Clamp to reasonable range
    return Math.max(0.7, Math.min(1.3, factor));
  }

  /**
   * Calculate engagement factor (0.6 - 1.4)
   */
  private calculateEngagementFactor(engagement: EngagementMetricsInput): number {
    let factor = this.weights.engagementBase;

    // Appointment completion rate bonus
    if (engagement.totalAppointments > 0) {
      const completionRate = engagement.keptAppointments / engagement.totalAppointments;
      factor += completionRate * this.weights.appointmentCompletionBonus;
    }

    // Referral bonus
    factor += Math.min(engagement.referralsMade, 5) * this.weights.referralBonus * 0.5;

    // NPS adjustment
    if (engagement.npsScore !== null) {
      if (engagement.npsScore >= 9) {
        factor += this.weights.npsPromoterBonus;
      } else if (engagement.npsScore <= 6) {
        factor -= this.weights.npsDetractorPenalty;
      }
    }

    // Inactivity penalty
    if (engagement.daysSinceLastContact > this.thresholds.inactiveThreshold) {
      factor -= 0.2;
    }

    // Clamp to reasonable range
    return Math.max(0.6, Math.min(1.4, factor));
  }

  /**
   * Calculate procedure interest factor (1.0 - 2.5)
   */
  private calculateProcedureInterestFactor(interest: ProcedureInterestInput): number {
    let factor = 1.0;

    // High-value procedure interest multipliers (not cumulative, take highest)
    if (interest.allOnXInterest) {
      factor = Math.max(factor, this.weights.allOnXMultiplier);
    }
    if (interest.fullMouthInterest) {
      factor = Math.max(factor, this.weights.fullMouthMultiplier);
    }
    if (interest.implantInterest) {
      factor = Math.max(factor, this.weights.implantMultiplier);
    }
    if (interest.cosmeticInterest) {
      factor = Math.max(factor, this.weights.cosmeticMultiplier);
    }

    // Bonus for proven high-value procedure history
    if (interest.highValueProceduresCompleted > 0) {
      factor +=
        Math.min(interest.highValueProceduresCompleted, 3) * this.weights.highValueProcedureBonus;
    }

    // Clamp to reasonable range
    return Math.max(1.0, Math.min(2.5, factor));
  }

  /**
   * Calculate retention factor (0.5 - 1.2)
   */
  private calculateRetentionFactor(retentionScore: number | null): number {
    if (retentionScore === null) {
      return this.weights.retentionBase; // Neutral if no retention score
    }

    // Convert 0-100 retention score to factor adjustment
    // Score 50 = neutral (1.0)
    // Score 100 = +0.2 (1.2)
    // Score 0 = -0.5 (0.5)
    const adjustment = (retentionScore - 50) * this.weights.retentionScoreMultiplier;
    return Math.max(0.5, Math.min(1.2, this.weights.retentionBase + adjustment));
  }

  /**
   * Calculate tenure factor (0.8 - 1.3)
   */
  private calculateTenureFactor(historical: HistoricalLTVInput): number {
    let factor = this.weights.tenureBase;

    // Long tenure bonus
    if (historical.daysSinceFirstCase !== null) {
      if (historical.daysSinceFirstCase > this.thresholds.longTenureThreshold) {
        factor += this.weights.tenureBonus;
      }

      // Recency adjustment
      if (historical.daysSinceLastCase !== null) {
        if (historical.daysSinceLastCase < this.thresholds.recentActivityThreshold) {
          factor += this.weights.recencyBonus;
        } else if (historical.daysSinceLastCase > this.thresholds.inactiveThreshold) {
          factor -= this.weights.recencyPenalty;
        }
      }
    }

    // Clamp to reasonable range
    return Math.max(0.8, Math.min(1.3, factor));
  }

  /**
   * Calculate growth multiplier
   */
  private calculateGrowthMultiplier(input: PLTVPredictionInput): number {
    let multiplier = 1.0;

    // High-value procedure interest indicates growth potential
    if (input.procedureInterest.allOnXInterest || input.procedureInterest.fullMouthInterest) {
      multiplier += 0.15;
    }

    // Good engagement indicates growth potential
    if (input.engagement.totalAppointments > 0) {
      const completionRate = input.engagement.keptAppointments / input.engagement.totalAppointments;
      if (completionRate > 0.9) {
        multiplier += 0.1;
      }
    }

    // Referrals indicate satisfaction and potential growth
    if (input.engagement.referralsMade > 0) {
      multiplier += 0.05;
    }

    // Strong retention score indicates stable future
    if (input.retentionScore !== null && input.retentionScore >= 80) {
      multiplier += 0.1;
    }

    // Source-based adjustment
    if (input.leadSource === 'referral') {
      multiplier += 0.1; // Referral leads tend to have higher LTV
    }

    return Math.round(multiplier * 100) / 100;
  }

  /**
   * Determine growth potential classification
   */
  private determineGrowthPotential(
    input: PLTVPredictionInput,
    _breakdown: PLTVFactorBreakdown
  ): PLTVGrowthPotential {
    // Calculate growth indicators
    const hasHighValueInterest =
      input.procedureInterest.allOnXInterest ||
      input.procedureInterest.fullMouthInterest ||
      input.procedureInterest.implantInterest;

    const hasGoodEngagement =
      input.engagement.totalAppointments > 0 &&
      input.engagement.keptAppointments / input.engagement.totalAppointments > 0.8;

    const hasHighRetention = input.retentionScore !== null && input.retentionScore >= 70;

    const isRecent =
      input.historical.daysSinceLastCase !== null &&
      input.historical.daysSinceLastCase < this.thresholds.recentActivityThreshold;

    const isInactive =
      input.historical.daysSinceLastCase !== null &&
      input.historical.daysSinceLastCase > this.thresholds.inactiveThreshold;

    // Calculate growth score
    let growthScore = 0;
    if (hasHighValueInterest) growthScore += 0.15;
    if (hasGoodEngagement) growthScore += 0.1;
    if (hasHighRetention) growthScore += 0.1;
    if (isRecent) growthScore += 0.05;
    if (input.engagement.referralsMade > 0) growthScore += 0.05;

    // Penalize inactivity
    if (isInactive) growthScore -= 0.2;
    if (input.retentionScore !== null && input.retentionScore < 40) growthScore -= 0.15;

    // Classify
    if (growthScore >= this.thresholds.highGrowthThreshold) {
      return 'HIGH_GROWTH';
    }
    if (growthScore >= this.thresholds.moderateGrowthThreshold) {
      return 'MODERATE_GROWTH';
    }
    if (growthScore <= this.thresholds.decliningThreshold) {
      return 'DECLINING';
    }
    return 'STABLE';
  }

  /**
   * Calculate prediction confidence (0-1)
   */
  private calculateConfidence(input: PLTVPredictionInput): number {
    let confidence = 0.5; // Base confidence

    // More historical data = higher confidence
    if (input.historical.completedCases >= 3) {
      confidence += 0.15;
    } else if (input.historical.completedCases >= 1) {
      confidence += 0.08;
    }

    // Payment history increases confidence
    if (input.historical.totalPaid > 0) {
      confidence += 0.1;
    }

    // Longer tenure increases confidence
    if (
      input.historical.daysSinceFirstCase !== null &&
      input.historical.daysSinceFirstCase > this.thresholds.longTenureThreshold
    ) {
      confidence += 0.1;
    }

    // Recent activity increases confidence
    if (
      input.historical.daysSinceLastCase !== null &&
      input.historical.daysSinceLastCase < this.thresholds.recentActivityThreshold
    ) {
      confidence += 0.1;
    }

    // Retention score available increases confidence
    if (input.retentionScore !== null) {
      confidence += 0.05;
    }

    // Clamp to valid range
    return Math.max(0.3, Math.min(0.95, confidence));
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(
    input: PLTVPredictionInput,
    breakdown: PLTVFactorBreakdown,
    valueObject: PredictedLTV
  ): string {
    const factors: string[] = [];

    // Historical baseline
    if (input.historical.totalPaid > 0) {
      factors.push(`Historical LTV: €${input.historical.totalPaid.toLocaleString()}`);
    } else {
      factors.push('New lead with no payment history');
    }

    // Payment reliability
    if (Math.abs(breakdown.paymentReliabilityAdjustment) > 100) {
      const direction = breakdown.paymentReliabilityAdjustment > 0 ? '+' : '';
      factors.push(
        `Payment reliability: ${direction}€${breakdown.paymentReliabilityAdjustment.toLocaleString()}`
      );
    }

    // Engagement
    if (Math.abs(breakdown.engagementAdjustment) > 100) {
      const direction = breakdown.engagementAdjustment > 0 ? '+' : '';
      factors.push(`Engagement: ${direction}€${breakdown.engagementAdjustment.toLocaleString()}`);
    }

    // Procedure interest
    if (breakdown.procedureInterestAdjustment > 100) {
      const interests: string[] = [];
      if (input.procedureInterest.allOnXInterest) interests.push('All-on-X');
      if (input.procedureInterest.fullMouthInterest) interests.push('Full-mouth');
      if (input.procedureInterest.implantInterest) interests.push('Implants');
      if (interests.length > 0) {
        factors.push(
          `High-value interest (${interests.join(', ')}): +€${breakdown.procedureInterestAdjustment.toLocaleString()}`
        );
      }
    }

    // Growth potential
    if (valueObject.growthPotential === 'HIGH_GROWTH') {
      factors.push('High growth potential identified');
    } else if (valueObject.growthPotential === 'DECLINING') {
      factors.push('Declining trend detected');
    }

    return `Predicted LTV: €${valueObject.predictedValue.toLocaleString()} (${valueObject.tier} tier). ${factors.join('; ')}`;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get tier label in Romanian
   */
  public getTierLabel(tier: PLTVTier): string {
    const labels: Record<PLTVTier, string> = {
      DIAMOND: 'Diamant',
      PLATINUM: 'Platinum',
      GOLD: 'Gold',
      SILVER: 'Argint',
      BRONZE: 'Bronz',
    };
    return labels[tier];
  }

  /**
   * Get growth potential label in Romanian
   */
  public getGrowthPotentialLabel(growth: PLTVGrowthPotential): string {
    const labels: Record<PLTVGrowthPotential, string> = {
      HIGH_GROWTH: 'Potențial Ridicat',
      MODERATE_GROWTH: 'Potențial Moderat',
      STABLE: 'Stabil',
      DECLINING: 'În Declin',
    };
    return labels[growth];
  }

  /**
   * Get investment priority label in Romanian
   */
  public getInvestmentPriorityLabel(priority: PLTVInvestmentPriority): string {
    const labels: Record<PLTVInvestmentPriority, string> = {
      PRIORITATE_MAXIMA: 'Prioritate Maximă',
      PRIORITATE_RIDICATA: 'Prioritate Ridicată',
      PRIORITATE_MEDIE: 'Prioritate Medie',
      PRIORITATE_SCAZUTA: 'Prioritate Scăzută',
    };
    return labels[priority];
  }

  /**
   * Get model version
   */
  public getModelVersion(): string {
    return this.modelVersion;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a pLTV scoring service instance
 */
export function createPLTVScoringService(
  config: PLTVScoringServiceConfig = {}
): PLTVScoringService {
  return new PLTVScoringService(config);
}
