/**
 * @fileoverview OsaxFinancialService - Application Service for Financial Prediction
 *
 * Orchestrates the financial prediction workflow using hexagonal architecture ports.
 * This service coordinates between the financial model and event publishing.
 *
 * @module core/services/osax/osax-financial-service
 *
 * DESIGN PRINCIPLES:
 * 1. ORCHESTRATION ONLY - No business logic, delegates to domain
 * 2. PORT INJECTION - All infrastructure via constructor injection
 * 3. EVENT EMISSION - All predictions produce domain events
 */

import type {
  FinancialModelPort,
  FinancialPredictionInput,
} from '@medicalcor/core/ports/osax/FinancialModelPort.js';
import type { FinancialPrediction } from '@medicalcor/domain/osax';
import type { EventPublisher } from '../../../ports/secondary/messaging/EventPublisher.js';

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * OsaxFinancialService - Application service for financial prediction orchestration
 *
 * This service orchestrates the complete financial prediction workflow:
 * 1. Validate input parameters
 * 2. Call financial model via port
 * 3. Emit osax.case.financial_predicted event
 *
 * @example
 * ```typescript
 * const service = new OsaxFinancialService(financialPort, eventPublisher);
 *
 * const prediction = await service.predictFinancialOutcome({
 *   caseId: 'case-123',
 *   severity: 'MODERATE',
 *   treatmentComplexity: 'MEDIUM',
 *   estimatedProcedures: 3,
 *   hasInsurance: true,
 *   insuranceTier: 'PREMIUM',
 * });
 *
 * console.log(prediction.getSummary());
 * ```
 */
export class OsaxFinancialService {
  constructor(
    private readonly financialPort: FinancialModelPort,
    private readonly eventPublisher: EventPublisher
  ) {}

  /**
   * Predict financial outcome for a case
   *
   * TODO: Add OpenTelemetry span: osax.financial.predict
   *
   * @param input - Prediction request input
   * @returns FinancialPrediction value object with prediction results
   */
  public async predictFinancialOutcome(input: PredictFinancialInput): Promise<FinancialPrediction> {
    // 1. Validate input
    this.validateInput(input);

    // 2. Build prediction input for model
    const predictionInput: FinancialPredictionInput = {
      severity: input.severity,
      treatmentComplexity: input.treatmentComplexity,
      estimatedProcedures: input.estimatedProcedures,
      hasInsurance: input.hasInsurance,
      insuranceTier: input.insuranceTier,
      patientEngagementScore: input.patientEngagementScore,
      clinicConversionRate: input.clinicConversionRate,
      caseType: input.caseType,
      region: input.region,
      correlationId: input.correlationId,
    };

    // 3. Call financial model port for prediction
    // TODO: Add OpenTelemetry span: osax.financial.model.call
    const prediction = await this.financialPort.predict(predictionInput);

    // 4. Emit domain event
    await this.emitFinancialPredictedEvent(input.caseId, prediction, input.correlationId);

    return prediction;
  }

  /**
   * Check if financial prediction is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const health = await this.financialPort.healthCheck();
      return health.available;
    } catch {
      return false;
    }
  }

  /**
   * Get model information
   */
  public getModelInfo(): ReturnType<FinancialModelPort['getModelInfo']> {
    return this.financialPort.getModelInfo();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Validate prediction input
   */
  private validateInput(input: PredictFinancialInput): void {
    if (!input.caseId || typeof input.caseId !== 'string') {
      throw new FinancialServiceError('INVALID_INPUT', 'caseId is required');
    }

    const validSeverities = ['NONE', 'MILD', 'MODERATE', 'SEVERE'];
    if (!validSeverities.includes(input.severity)) {
      throw new FinancialServiceError('INVALID_INPUT', `Invalid severity: ${input.severity}`);
    }

    const validComplexities = ['LOW', 'MEDIUM', 'HIGH'];
    if (!validComplexities.includes(input.treatmentComplexity)) {
      throw new FinancialServiceError(
        'INVALID_INPUT',
        `Invalid treatmentComplexity: ${input.treatmentComplexity}`
      );
    }

    if (
      typeof input.estimatedProcedures !== 'number' ||
      input.estimatedProcedures < 1 ||
      input.estimatedProcedures > 50
    ) {
      throw new FinancialServiceError(
        'INVALID_INPUT',
        'estimatedProcedures must be between 1 and 50'
      );
    }

    if (typeof input.hasInsurance !== 'boolean') {
      throw new FinancialServiceError('INVALID_INPUT', 'hasInsurance must be a boolean');
    }
  }

  /**
   * Emit osax.case.financial_predicted domain event
   */
  private async emitFinancialPredictedEvent(
    caseId: string,
    prediction: FinancialPrediction,
    correlationId?: string
  ): Promise<void> {
    const event = {
      eventType: 'osax.case.financial_predicted',
      aggregateId: caseId,
      aggregateType: 'OsaxCase',
      aggregateVersion: 1,
      eventData: {
        caseId,
        probability: prediction.probability,
        confidence: prediction.confidence,
        probabilityTier: prediction.getProbabilityTier(),
        estimatedValueMin: prediction.estimatedValueRange.min,
        estimatedValueMax: prediction.estimatedValueRange.max,
        currency: prediction.estimatedValueRange.currency,
        recommendedAction: prediction.getRecommendedAction(),
        predictedAt: prediction.predictedAt.toISOString(),
        modelVersion: prediction.modelVersion,
        // SECURITY: No detailed factors in event for audit trail
      },
      correlationId: correlationId ?? caseId,
      causationId: null,
      actorId: 'system:osax-financial-service',
      occurredAt: new Date(),
    };

    await this.eventPublisher.publish(event);
  }
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Input for financial prediction request
 */
export interface PredictFinancialInput {
  /**
   * Associated case ID
   */
  readonly caseId: string;

  /**
   * Case severity classification
   */
  readonly severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';

  /**
   * Treatment complexity level
   */
  readonly treatmentComplexity: 'LOW' | 'MEDIUM' | 'HIGH';

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
  readonly insuranceTier?: 'BASIC' | 'STANDARD' | 'PREMIUM';

  /**
   * Patient engagement score (0-1)
   */
  readonly patientEngagementScore?: number;

  /**
   * Clinic conversion rate (0-1)
   */
  readonly clinicConversionRate?: number;

  /**
   * Case type for pricing
   */
  readonly caseType?:
    | 'SINGLE_IMPLANT'
    | 'MULTIPLE_IMPLANTS'
    | 'FULL_ARCH'
    | 'BONE_GRAFT'
    | 'SINUS_LIFT'
    | 'EXTRACTION'
    | 'GENERAL';

  /**
   * Region/locale for currency
   */
  readonly region?: string;

  /**
   * Correlation ID for distributed tracing
   */
  readonly correlationId?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for financial service
 */
export type FinancialServiceErrorCode = 'INVALID_INPUT' | 'MODEL_ERROR' | 'EVENT_PUBLISH_ERROR';

/**
 * Error thrown by financial service
 */
export class FinancialServiceError extends Error {
  public readonly code: FinancialServiceErrorCode;

  constructor(code: FinancialServiceErrorCode, message: string) {
    super(message);
    this.name = 'FinancialServiceError';
    this.code = code;
    Object.setPrototypeOf(this, FinancialServiceError.prototype);
  }
}
