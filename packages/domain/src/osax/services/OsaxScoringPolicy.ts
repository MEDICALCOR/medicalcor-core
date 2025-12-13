/**
 * @fileoverview OSAX Scoring Policy
 *
 * Domain service that encapsulates OSAX scoring business logic.
 * Delegates to composite scorer for actual calculation.
 *
 * DESIGN:
 * - Cyclomatic complexity < 10 per function
 * - Each scorer class < 30 lines
 * - Map-based lookups (no conditionals in scoring)
 *
 * @module domain/osax/services/OsaxScoringPolicy
 */

import type { OsaxScoringFactors, OsaxScoringResult, OsaxRiskClass } from '../types.js';
import { OsaxCompositeScorer } from './OsaxCompositeScorer.js';
import {
  BoneQualityScorer,
  SoftTissueScorer,
  SystemicRiskScorer,
  UrgencyScorer,
  FinancialScorer,
} from './scorers/index.js';

/**
 * OSAX Scoring Policy
 *
 * Entry point for OSAX case scoring.
 * Composes all individual scorers and provides the scoring API.
 *
 * @example
 * ```typescript
 * const policy = OsaxScoringPolicy.create();
 * const result = policy.scoreFromFactors({
 *   boneQuality: 2,
 *   softTissueHealth: 'good',
 *   systemicRisks: ['diabetes_controlled'],
 *   urgency: 'soon',
 *   financialReadiness: 'ready',
 * });
 *
 * console.log(result.globalScore); // 75.5
 * console.log(result.riskClass); // 'GREEN'
 * ```
 */
export class OsaxScoringPolicy {
  private readonly compositeScorer: OsaxCompositeScorer;

  private constructor(compositeScorer: OsaxCompositeScorer) {
    this.compositeScorer = compositeScorer;
  }

  /**
   * Create a new OsaxScoringPolicy with default scorers
   */
  static create(): OsaxScoringPolicy {
    const scorers = [
      new BoneQualityScorer(), // 30%
      new SoftTissueScorer(), // 15%
      new SystemicRiskScorer(), // 25%
      new UrgencyScorer(), // 15%
      new FinancialScorer(), // 15%
    ];

    const compositeScorer = new OsaxCompositeScorer(scorers);
    return new OsaxScoringPolicy(compositeScorer);
  }

  /**
   * Create with custom scorers (for testing or extensions)
   */
  static withScorers(compositeScorer: OsaxCompositeScorer): OsaxScoringPolicy {
    return new OsaxScoringPolicy(compositeScorer);
  }

  /**
   * Score an OSAX case from factors
   */
  scoreFromFactors(factors: OsaxScoringFactors): OsaxScoringResult {
    this.validateFactors(factors);
    return this.compositeScorer.score(factors);
  }

  /**
   * Get suggested action based on risk class
   */
  getSuggestedAction(result: OsaxScoringResult): string {
    const actions: Record<OsaxRiskClass, string> = {
      GREEN: 'Proceed with standard treatment protocol',
      YELLOW: 'Review case with specialist before proceeding',
      RED: 'Requires comprehensive evaluation and medical clearance',
    };
    return actions[result.riskClass];
  }

  /**
   * Check if case requires immediate attention
   */
  requiresImmediateAttention(result: OsaxScoringResult): boolean {
    return (
      result.riskClass === 'RED' || result.riskFactors.includes('emergency_treatment_required')
    );
  }

  /**
   * Validate scoring factors
   */
  private validateFactors(factors: OsaxScoringFactors): void {
    if (factors.boneQuality < 1 || factors.boneQuality > 4) {
      throw new InvalidOsaxFactorsError(`boneQuality must be 1-4, got: ${factors.boneQuality}`);
    }

    const validTissue = ['excellent', 'good', 'fair', 'poor'];
    if (!validTissue.includes(factors.softTissueHealth)) {
      throw new InvalidOsaxFactorsError(`Invalid softTissueHealth: ${factors.softTissueHealth}`);
    }

    const validUrgency = ['routine', 'soon', 'urgent', 'emergency'];
    if (!validUrgency.includes(factors.urgency)) {
      throw new InvalidOsaxFactorsError(`Invalid urgency: ${factors.urgency}`);
    }

    const validFinancial = ['ready', 'financing_needed', 'uncertain', 'not_ready'];
    if (!validFinancial.includes(factors.financialReadiness)) {
      throw new InvalidOsaxFactorsError(
        `Invalid financialReadiness: ${factors.financialReadiness}`
      );
    }
  }
}

/**
 * Error thrown for invalid OSAX scoring factors
 */
export class InvalidOsaxFactorsError extends Error {
  readonly code = 'INVALID_OSAX_FACTORS' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidOsaxFactorsError';
    Object.setPrototypeOf(this, InvalidOsaxFactorsError.prototype);
  }
}
