/**
 * @fileoverview OSAX Composite Scorer
 *
 * Composes multiple individual scorers to produce a weighted composite score.
 * Follows composition pattern for extensibility.
 *
 * @module domain/osax/services/OsaxCompositeScorer
 */

import type {
  IOsaxScorer,
  OsaxScoringFactors,
  OsaxScoringResult,
  OsaxRiskClass,
  ComponentScore,
} from '../types.js';

/** Risk class thresholds */
const RISK_THRESHOLDS = {
  GREEN: 70, // Score >= 70 is GREEN
  YELLOW: 40, // Score >= 40 is YELLOW
  // Below 40 is RED
} as const;

/** Algorithm version for tracking */
const ALGORITHM_VERSION = '1.0.0';

/**
 * OSAX Composite Scorer
 *
 * Aggregates scores from multiple specialized scorers using weighted averaging.
 * Each scorer contributes to the final composite score based on its weight.
 */
export class OsaxCompositeScorer {
  private readonly scorers: readonly IOsaxScorer[];

  constructor(scorers: readonly IOsaxScorer[]) {
    this.scorers = scorers;
    this.validateWeights();
  }

  /**
   * Calculate composite score from all scorers
   */
  score(factors: OsaxScoringFactors): OsaxScoringResult {
    const componentScores: ComponentScore[] = [];
    const allRiskFactors: string[] = [];
    let totalWeightedScore = 0;
    let totalWeight = 0;

    // Calculate each component score
    for (const scorer of this.scorers) {
      const result = scorer.score(factors);
      const weightedScore = result.rawScore * scorer.weight;

      componentScores.push({
        scorer: scorer.name,
        rawScore: result.rawScore,
        weight: scorer.weight,
        weightedScore,
        riskFactors: result.riskFactors,
      });

      totalWeightedScore += weightedScore;
      totalWeight += scorer.weight;
      allRiskFactors.push(...result.riskFactors);
    }

    // Normalize to 0-100 scale
    const globalScore =
      totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 10) / 10 : 0;

    // Determine risk class
    const riskClass = this.classifyRisk(globalScore);

    // Calculate confidence based on data completeness
    const confidence = this.calculateConfidence(factors);

    return {
      globalScore,
      riskClass,
      componentScores,
      riskFactors: [...new Set(allRiskFactors)], // Deduplicate
      confidence,
      algorithmVersion: ALGORITHM_VERSION,
      scoredAt: new Date(),
    };
  }

  /**
   * Classify risk based on global score
   */
  private classifyRisk(score: number): OsaxRiskClass {
    if (score >= RISK_THRESHOLDS.GREEN) return 'GREEN';
    if (score >= RISK_THRESHOLDS.YELLOW) return 'YELLOW';
    return 'RED';
  }

  /**
   * Calculate confidence based on data completeness
   */
  private calculateConfidence(factors: OsaxScoringFactors): number {
    let confidence = 0.9; // Base confidence

    // Reduce confidence if optional data is missing
    if (factors.patientAge === undefined) confidence -= 0.05;
    if (factors.asaClassification === undefined) confidence -= 0.05;

    return Math.max(0.5, confidence);
  }

  /**
   * Validate that weights sum to approximately 1.0
   */
  private validateWeights(): void {
    const totalWeight = this.scorers.reduce((sum, s) => sum + s.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error(`Scorer weights must sum to 1.0, got ${totalWeight.toFixed(2)}`);
    }
  }
}
