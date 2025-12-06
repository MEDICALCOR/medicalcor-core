/**
 * @fileoverview FinancialModelPort - Outbound Port for Financial Prediction
 *
 * Hexagonal Architecture SECONDARY PORT for case financial outcome prediction.
 * This port abstracts away the prediction model infrastructure.
 *
 * @module core/ports/osax/financial-model-port
 *
 * HEXAGONAL ARCHITECTURE:
 * - Port defined in Core layer
 * - Adapters implement this interface in Infrastructure layer
 * - Domain services depend on this port, not concrete implementations
 */

import type { FinancialPrediction } from '@medicalcor/domain/osax';

// ============================================================================
// PORT INTERFACE
// ============================================================================

/**
 * FinancialModelPort - Outbound port for financial prediction
 *
 * This interface defines how the application predicts case acceptance
 * probability and financial outcomes. Adapters can implement rule-based
 * calculations or ML model integrations.
 *
 * @example
 * ```typescript
 * // Rule-based adapter implementing this port
 * class RuleBasedFinancialPredictor implements FinancialModelPort {
 *   readonly portName = 'financial-model';
 *   readonly portType = 'outbound';
 *
 *   async predict(input: FinancialPredictionInput): Promise<FinancialPrediction> {
 *     let probability = 0.5; // Base probability
 *     if (input.hasInsurance) probability += 0.15;
 *     // ... more rules
 *     return FinancialPrediction.create({ probability, ... });
 *   }
 * }
 * ```
 */
export interface FinancialModelPort {
  /**
   * Port identifier
   */
  readonly portName: 'financial-model';

  /**
   * Port type (outbound = driven)
   */
  readonly portType: 'outbound';

  /**
   * Predict case acceptance probability and financial outcome
   *
   * @param input - Clinical and demographic factors
   * @returns Financial prediction with rationale
   *
   * TODO: Add OpenTelemetry span: osax.financial.predict
   */
  predict(input: FinancialPredictionInput): Promise<FinancialPrediction>;

  /**
   * Health check for prediction service
   */
  healthCheck(): Promise<FinancialModelHealth>;

  /**
   * Get model metadata
   */
  getModelInfo(): FinancialModelInfo;
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Input for financial prediction
 */
export interface FinancialPredictionInput {
  /**
   * Case severity classification
   */
  readonly severity: CaseSeverity;

  /**
   * Treatment complexity level
   */
  readonly treatmentComplexity: TreatmentComplexity;

  /**
   * Estimated number of procedures
   */
  readonly estimatedProcedures: number;

  /**
   * Whether patient has dental insurance
   */
  readonly hasInsurance: boolean;

  /**
   * Insurance tier (if applicable)
   */
  readonly insuranceTier?: InsuranceTier;

  /**
   * Patient engagement score (0-1) based on communication history
   */
  readonly patientEngagementScore?: number;

  /**
   * Clinic's historical conversion rate (0-1)
   */
  readonly clinicConversionRate?: number;

  /**
   * Case type for pricing lookup
   */
  readonly caseType?: CaseType;

  /**
   * Region/locale for currency and pricing
   */
  readonly region?: string;

  /**
   * Request correlation ID for tracing
   */
  readonly correlationId?: string;
}

/**
 * Case severity levels
 */
export type CaseSeverity = 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';

/**
 * Treatment complexity levels
 */
export type TreatmentComplexity = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Insurance tier levels
 */
export type InsuranceTier = 'BASIC' | 'STANDARD' | 'PREMIUM';

/**
 * Case types for pricing
 */
export type CaseType =
  | 'SINGLE_IMPLANT'
  | 'MULTIPLE_IMPLANTS'
  | 'FULL_ARCH'
  | 'BONE_GRAFT'
  | 'SINUS_LIFT'
  | 'EXTRACTION'
  | 'GENERAL';

/**
 * Financial model health status
 */
export interface FinancialModelHealth {
  /**
   * Whether the model is available
   */
  readonly available: boolean;

  /**
   * Current latency in milliseconds
   */
  readonly latencyMs: number;

  /**
   * Model version
   */
  readonly modelVersion?: string;
}

/**
 * Financial model information
 */
export interface FinancialModelInfo {
  /**
   * Model name/identifier
   */
  readonly name: string;

  /**
   * Model version
   */
  readonly version: string;

  /**
   * Model type (rule-based, ml, hybrid)
   */
  readonly type: 'rule-based' | 'ml' | 'hybrid';

  /**
   * Supported case types
   */
  readonly supportedCaseTypes: readonly CaseType[];

  /**
   * Default currency
   */
  readonly defaultCurrency: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for financial prediction
 */
export type FinancialPredictionErrorCode =
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_CASE_TYPE'
  | 'PREDICTION_FAILED'
  | 'INTERNAL_ERROR';

/**
 * Error thrown by financial prediction
 */
export class FinancialPredictionError extends Error {
  public readonly code: FinancialPredictionErrorCode;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: FinancialPredictionErrorCode,
    message: string,
    retryable = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FinancialPredictionError';
    this.code = code;
    this.retryable = retryable;
    this.details = details;
    Object.setPrototypeOf(this, FinancialPredictionError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for FinancialModelPort
 */
export function isFinancialModelPort(value: unknown): value is FinancialModelPort {
  return (
    typeof value === 'object' &&
    value !== null &&
    'portName' in value &&
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (value as FinancialModelPort).portName === 'financial-model' &&
    'predict' in value &&
    typeof (value as FinancialModelPort).predict === 'function'
  );
}
