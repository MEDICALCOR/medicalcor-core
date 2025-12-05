/**
 * @fileoverview RuleBasedFinancialPredictor - Production Rule-Based Adapter
 *
 * Implements case acceptance probability prediction using configurable rules.
 * This is a production-ready implementation that doesn't require external AI services.
 *
 * @module core/adapters/osax/financial/rule-based-financial-predictor
 *
 * BUSINESS RULES:
 * Base probability: 0.5
 * +0.15 if hasInsurance
 * +0.10 if insuranceTier == PREMIUM
 * +0.05 if treatmentComplexity == LOW
 * -0.10 if treatmentComplexity == HIGH
 * +0.10 if patientEngagementScore > 0.7
 * Final probability clamped to [0.1, 0.95]
 */

import type {
  FinancialModelPort,
  FinancialPredictionInput,
  FinancialModelHealth,
  FinancialModelInfo,
  CaseType,
} from '../../../ports/osax/FinancialModelPort.js';
import {
  FinancialPrediction,
  type PredictionFactor,
} from '@medicalcor/domain/osax/value-objects/FinancialPrediction.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Rule weights for probability calculation
 */
const RULE_WEIGHTS = {
  baselineProbability: 0.5,
  hasInsurance: 0.15,
  insurancePremium: 0.10,
  insuranceStandard: 0.05,
  lowComplexity: 0.05,
  highComplexity: -0.10,
  highEngagement: 0.10,
  moderateEngagement: 0.05,
  clinicHighConversion: 0.08,
} as const;

/**
 * Probability bounds
 */
const PROBABILITY_BOUNDS = {
  min: 0.1,
  max: 0.95,
} as const;

/**
 * Base pricing by case type (EUR)
 */
const BASE_PRICING: Record<CaseType, { min: number; max: number }> = {
  SINGLE_IMPLANT: { min: 1500, max: 3500 },
  MULTIPLE_IMPLANTS: { min: 4000, max: 12000 },
  FULL_ARCH: { min: 15000, max: 35000 },
  BONE_GRAFT: { min: 800, max: 2500 },
  SINUS_LIFT: { min: 1200, max: 3000 },
  EXTRACTION: { min: 100, max: 500 },
  GENERAL: { min: 500, max: 5000 },
};

// ============================================================================
// ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * RuleBasedFinancialPredictor - Production rule-based adapter
 *
 * Implements financial prediction using configurable business rules.
 * No external AI service dependencies - suitable for production use.
 *
 * @example
 * ```typescript
 * const predictor = new RuleBasedFinancialPredictor();
 *
 * const prediction = await predictor.predict({
 *   severity: 'MODERATE',
 *   treatmentComplexity: 'MEDIUM',
 *   estimatedProcedures: 3,
 *   hasInsurance: true,
 *   insuranceTier: 'PREMIUM',
 * });
 *
 * console.log(prediction.probability); // 0.80
 * console.log(prediction.getProbabilityTier()); // 'HIGH'
 * ```
 */
export class RuleBasedFinancialPredictor implements FinancialModelPort {
  public readonly portName = 'financial-model' as const;
  public readonly portType = 'outbound' as const;

  /**
   * Currency for predictions
   */
  private readonly currency: string;

  /**
   * Custom rules override
   */
  private readonly customWeights: Partial<typeof RULE_WEIGHTS>;

  constructor(options?: RuleBasedFinancialPredictorOptions) {
    this.currency = options?.currency ?? 'EUR';
    this.customWeights = options?.customWeights ?? {};
  }

  /**
   * Predict case acceptance probability using rule-based calculation
   */
  public async predict(input: FinancialPredictionInput): Promise<FinancialPrediction> {
    // Calculate probability and collect factors
    const { probability, factors, rationale } = this.calculateProbability(input);

    // Calculate estimated value range
    const valueRange = this.calculateValueRange(input);

    // Create and return prediction
    return FinancialPrediction.create({
      probability,
      confidence: 0.75, // Rule-based has moderate-high confidence
      rationale,
      factors,
      estimatedValueRange: {
        min: valueRange.min,
        max: valueRange.max,
        currency: this.currency,
      },
      modelVersion: 'rule-based-v1.0.0',
    });
  }

  /**
   * Health check
   */
  public async healthCheck(): Promise<FinancialModelHealth> {
    return {
      available: true,
      latencyMs: 1, // Rule-based is very fast
      modelVersion: 'rule-based-v1.0.0',
    };
  }

  /**
   * Get model information
   */
  public getModelInfo(): FinancialModelInfo {
    return {
      name: 'Rule-Based Financial Predictor',
      version: 'rule-based-v1.0.0',
      type: 'rule-based',
      supportedCaseTypes: [
        'SINGLE_IMPLANT',
        'MULTIPLE_IMPLANTS',
        'FULL_ARCH',
        'BONE_GRAFT',
        'SINUS_LIFT',
        'EXTRACTION',
        'GENERAL',
      ],
      defaultCurrency: this.currency,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Calculate probability using business rules
   */
  private calculateProbability(input: FinancialPredictionInput): {
    probability: number;
    factors: PredictionFactor[];
    rationale: string;
  } {
    const weights = { ...RULE_WEIGHTS, ...this.customWeights };
    const factors: PredictionFactor[] = [];
    let probability = weights.baselineProbability;
    const reasons: string[] = [];

    // Factor: Insurance coverage
    if (input.hasInsurance) {
      probability += weights.hasInsurance;
      factors.push({
        factor: 'insurance_coverage',
        weight: weights.hasInsurance,
        contribution: 'positive',
        description: 'Patient has dental insurance',
      });
      reasons.push('insurance coverage');

      // Factor: Insurance tier
      if (input.insuranceTier === 'PREMIUM') {
        probability += weights.insurancePremium;
        factors.push({
          factor: 'insurance_tier_premium',
          weight: weights.insurancePremium,
          contribution: 'positive',
          description: 'Premium insurance tier',
        });
        reasons.push('premium tier');
      } else if (input.insuranceTier === 'STANDARD') {
        probability += weights.insuranceStandard;
        factors.push({
          factor: 'insurance_tier_standard',
          weight: weights.insuranceStandard,
          contribution: 'positive',
          description: 'Standard insurance tier',
        });
      }
    } else {
      factors.push({
        factor: 'no_insurance',
        weight: 0,
        contribution: 'neutral',
        description: 'Patient does not have dental insurance',
      });
    }

    // Factor: Treatment complexity
    if (input.treatmentComplexity === 'LOW') {
      probability += weights.lowComplexity;
      factors.push({
        factor: 'low_complexity',
        weight: weights.lowComplexity,
        contribution: 'positive',
        description: 'Low treatment complexity',
      });
      reasons.push('low complexity');
    } else if (input.treatmentComplexity === 'HIGH') {
      probability += weights.highComplexity;
      factors.push({
        factor: 'high_complexity',
        weight: Math.abs(weights.highComplexity),
        contribution: 'negative',
        description: 'High treatment complexity',
      });
      reasons.push('high complexity (negative)');
    }

    // Factor: Patient engagement
    if (input.patientEngagementScore !== undefined) {
      if (input.patientEngagementScore > 0.7) {
        probability += weights.highEngagement;
        factors.push({
          factor: 'high_patient_engagement',
          weight: weights.highEngagement,
          contribution: 'positive',
          description: 'High patient engagement score',
        });
        reasons.push('high engagement');
      } else if (input.patientEngagementScore > 0.5) {
        probability += weights.moderateEngagement;
        factors.push({
          factor: 'moderate_patient_engagement',
          weight: weights.moderateEngagement,
          contribution: 'positive',
          description: 'Moderate patient engagement score',
        });
      }
    }

    // Factor: Clinic conversion rate
    if (input.clinicConversionRate !== undefined && input.clinicConversionRate > 0.7) {
      probability += weights.clinicHighConversion;
      factors.push({
        factor: 'clinic_high_conversion',
        weight: weights.clinicHighConversion,
        contribution: 'positive',
        description: 'Clinic has high historical conversion rate',
      });
    }

    // Clamp probability to bounds
    probability = Math.max(PROBABILITY_BOUNDS.min, Math.min(PROBABILITY_BOUNDS.max, probability));

    // Generate rationale
    const rationale =
      reasons.length > 0
        ? `Prediction based on: ${reasons.join(', ')}`
        : 'Baseline prediction without significant modifying factors';

    return { probability, factors, rationale };
  }

  /**
   * Calculate estimated value range based on case type and complexity
   */
  private calculateValueRange(input: FinancialPredictionInput): { min: number; max: number } {
    const caseType = input.caseType ?? 'GENERAL';
    const basePricing = BASE_PRICING[caseType];

    // Adjust based on complexity
    let multiplier = 1.0;
    if (input.treatmentComplexity === 'HIGH') {
      multiplier = 1.3;
    } else if (input.treatmentComplexity === 'LOW') {
      multiplier = 0.85;
    }

    // Adjust based on number of procedures
    const procedureMultiplier = Math.min(input.estimatedProcedures, 5) / 3;

    const min = Math.round(basePricing.min * multiplier * procedureMultiplier);
    const max = Math.round(basePricing.max * multiplier * procedureMultiplier);

    return { min, max };
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Options for RuleBasedFinancialPredictor
 */
export interface RuleBasedFinancialPredictorOptions {
  /**
   * Currency for predictions (default: EUR)
   */
  readonly currency?: string;

  /**
   * Custom rule weights to override defaults
   */
  readonly customWeights?: Partial<typeof RULE_WEIGHTS>;
}
