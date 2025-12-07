/**
 * @fileoverview ScorePatientPLTVUseCase
 *
 * Banking/Medical Grade Use Case for pLTV (Predicted Lifetime Value) Scoring.
 * Orchestrates data gathering and pLTV calculation with event emission.
 *
 * @module domain/ltv/use-cases/score-patient-pltv
 *
 * DESIGN PRINCIPLES:
 * 1. SINGLE RESPONSIBILITY - Only handles pLTV scoring orchestration
 * 2. DEPENDENCY INVERSION - Depends on interfaces, not implementations
 * 3. TESTABLE IN ISOLATION - No infrastructure dependencies
 * 4. IDEMPOTENT - Safe to retry with same correlation ID
 */

import {
  PredictedLTV,
  type PLTVTier,
  type PLTVGrowthPotential,
  type PLTVInvestmentPriority,
} from '../../shared-kernel/value-objects/predicted-ltv.js';
import {
  PLTVScoringService,
  type PLTVPredictionInput,
  type PLTVScoringOutput,
  type PLTVFactorBreakdown,
  type PLTVConfidenceInterval,
} from '../pltv-scoring-service.js';
import {
  type PLTVScoredEvent,
  type HighValuePatientIdentifiedEvent,
  type PLTVTierChangedEvent,
  createPLTVScoredEvent,
  createHighValuePatientIdentifiedEvent,
  createPLTVTierChangedEvent,
  createPLTVEventMetadata,
} from '../../shared-kernel/domain-events/pltv-events.js';

// ============================================================================
// USE CASE INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Score Patient pLTV Use Case Input
 */
export interface ScorePatientPLTVInput {
  /** Lead/Patient ID */
  readonly leadId: string;

  /** Clinic ID */
  readonly clinicId: string;

  /** Correlation ID for tracing */
  readonly correlationId: string;

  /** Force recalculation even if recently scored */
  readonly forceRecalculate?: boolean;

  /** Include full factor breakdown in output */
  readonly includeBreakdown?: boolean;
}

/**
 * Score Patient pLTV Use Case Output
 */
export interface ScorePatientPLTVOutput {
  /** Whether scoring was successful */
  readonly success: boolean;

  /** Lead/Patient ID */
  readonly leadId: string;

  /** Predicted lifetime value in EUR */
  readonly predictedLTV: number;

  /** pLTV tier classification */
  readonly tier: PLTVTier;

  /** Growth potential classification */
  readonly growthPotential: PLTVGrowthPotential;

  /** Investment priority */
  readonly investmentPriority: PLTVInvestmentPriority;

  /** Prediction confidence */
  readonly confidence: number;

  /** Confidence interval */
  readonly confidenceInterval: PLTVConfidenceInterval;

  /** Factor breakdown (if requested) */
  readonly breakdown?: PLTVFactorBreakdown;

  /** Human-readable reasoning */
  readonly reasoning: string;

  /** Recommended investment actions */
  readonly recommendedActions: string[];

  /** Prediction method used */
  readonly method: 'ml' | 'rule_based' | 'hybrid';

  /** Model version used */
  readonly modelVersion: string;

  /** Whether patient was identified as high-value (GOLD+) */
  readonly isHighValue: boolean;

  /** Whether tier changed from previous scoring */
  readonly tierChanged: boolean;

  /** Previous pLTV if this is a rescore */
  readonly previousPLTV?: number;

  /** Domain events emitted */
  readonly events: readonly (
    | PLTVScoredEvent
    | HighValuePatientIdentifiedEvent
    | PLTVTierChangedEvent
  )[];
}

/**
 * Score Patient pLTV Error
 */
export interface ScorePatientPLTVError {
  readonly code: ScorePatientPLTVErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type ScorePatientPLTVErrorCode =
  | 'LEAD_NOT_FOUND'
  | 'CLINIC_NOT_FOUND'
  | 'SCORING_FAILED'
  | 'INSUFFICIENT_DATA'
  | 'VALIDATION_ERROR'
  | 'REPOSITORY_ERROR';

/**
 * Score Patient pLTV Result
 */
export type ScorePatientPLTVResult =
  | { success: true; value: ScorePatientPLTVOutput }
  | { success: false; error: ScorePatientPLTVError };

// ============================================================================
// REPOSITORY INTERFACES
// ============================================================================

/**
 * Patient data for pLTV calculation
 */
export interface PatientPLTVData {
  leadId: string;
  clinicId: string;
  patientName?: string;
  phone?: string;
  historical: {
    totalPaid: number;
    totalCaseValue: number;
    totalOutstanding: number;
    completedCases: number;
    totalCases: number;
    avgCaseValue: number;
    daysSinceFirstCase: number | null;
    daysSinceLastCase: number | null;
  };
  paymentBehavior: {
    onTimePaymentRate: number;
    paymentPlansUsed: number;
    avgDaysToPayment: number | null;
    missedPayments: number;
    preferredPaymentMethod?: 'cash' | 'card' | 'transfer' | 'financing' | 'unknown';
  };
  engagement: {
    totalAppointments: number;
    keptAppointments: number;
    canceledAppointments: number;
    noShows: number;
    daysSinceLastContact: number;
    referralsMade: number;
    hasNPSFeedback: boolean;
    npsScore: number | null;
  };
  procedureInterest: {
    allOnXInterest: boolean;
    implantInterest: boolean;
    fullMouthInterest: boolean;
    cosmeticInterest: boolean;
    highValueProceduresCompleted: number;
    expressedInterests?: string[];
  };
  retentionScore: number | null;
  leadSource?: 'whatsapp' | 'voice' | 'web' | 'hubspot' | 'referral' | 'facebook' | 'google';
  locationTier?: 'tier1' | 'tier2' | 'tier3';
  lastPLTV?: {
    value: number;
    tier: PLTVTier;
    scoredAt: Date;
  };
}

/**
 * Interface for fetching patient data for pLTV calculation
 */
export interface IPLTVDataProvider {
  /**
   * Get patient data needed for pLTV calculation
   */
  getPatientPLTVData(leadId: string, clinicId: string): Promise<PatientPLTVData | null>;

  /**
   * Save pLTV score result
   */
  savePLTVScore(
    leadId: string,
    score: PLTVScoringOutput
  ): Promise<{ success: boolean; error?: string }>;
}

/**
 * Interface for event publishing
 */
export interface IPLTVEventPublisher {
  /**
   * Publish domain events
   */
  publish(
    events: readonly (PLTVScoredEvent | HighValuePatientIdentifiedEvent | PLTVTierChangedEvent)[]
  ): Promise<void>;
}

// ============================================================================
// USE CASE DEPENDENCIES
// ============================================================================

/**
 * Use case dependencies
 */
export interface ScorePatientPLTVDependencies {
  /** Data provider for patient LTV data */
  readonly dataProvider: IPLTVDataProvider;

  /** Event publisher (optional) */
  readonly eventPublisher?: IPLTVEventPublisher;

  /** pLTV scoring service (optional, will create default if not provided) */
  readonly scoringService?: PLTVScoringService;
}

// ============================================================================
// USE CASE IMPLEMENTATION
// ============================================================================

/**
 * Score Patient pLTV Use Case
 *
 * Orchestrates the calculation of predicted lifetime value for a patient.
 * Gathers data from multiple sources, calculates pLTV, and emits events.
 */
export class ScorePatientPLTVUseCase {
  private readonly dataProvider: IPLTVDataProvider;
  private readonly eventPublisher?: IPLTVEventPublisher;
  private readonly scoringService: PLTVScoringService;

  constructor(deps: ScorePatientPLTVDependencies) {
    this.dataProvider = deps.dataProvider;
    this.eventPublisher = deps.eventPublisher;
    this.scoringService = deps.scoringService ?? new PLTVScoringService();
  }

  /**
   * Execute the use case
   */
  public async execute(input: ScorePatientPLTVInput): Promise<ScorePatientPLTVResult> {
    try {
      // Step 1: Validate input
      const validation = this.validateInput(input);
      if (!validation.valid) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.message,
          },
        };
      }

      // Step 2: Fetch patient data
      const patientData = await this.dataProvider.getPatientPLTVData(input.leadId, input.clinicId);

      if (!patientData) {
        return {
          success: false,
          error: {
            code: 'LEAD_NOT_FOUND',
            message: `Patient not found: ${input.leadId}`,
          },
        };
      }

      // Step 3: Check if rescore is needed
      if (!input.forceRecalculate && patientData.lastPLTV) {
        const hoursSinceLastScore =
          (Date.now() - patientData.lastPLTV.scoredAt.getTime()) / (1000 * 60 * 60);

        // Skip if scored within last 24 hours
        if (hoursSinceLastScore < 24) {
          return this.buildSkippedResult(input, patientData);
        }
      }

      // Step 4: Prepare scoring input
      const scoringInput: PLTVPredictionInput = {
        leadId: patientData.leadId,
        clinicId: patientData.clinicId,
        historical: patientData.historical,
        paymentBehavior: patientData.paymentBehavior,
        engagement: patientData.engagement,
        procedureInterest: patientData.procedureInterest,
        retentionScore: patientData.retentionScore,
        leadSource: patientData.leadSource,
        locationTier: patientData.locationTier,
      };

      // Step 5: Calculate pLTV
      const scoringResult = this.scoringService.calculatePLTV(scoringInput);

      // Step 6: Determine if tier changed
      const tierChanged = patientData.lastPLTV
        ? patientData.lastPLTV.tier !== scoringResult.tier
        : false;

      // Step 7: Build and emit domain events
      const events = this.buildEvents(input, scoringResult, patientData, tierChanged);

      // Step 8: Save result
      const saveResult = await this.dataProvider.savePLTVScore(input.leadId, scoringResult);

      if (!saveResult.success) {
        return {
          success: false,
          error: {
            code: 'REPOSITORY_ERROR',
            message: saveResult.error ?? 'Failed to save pLTV score',
          },
        };
      }

      // Step 9: Publish events
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }

      // Step 10: Build output
      const output: ScorePatientPLTVOutput = {
        success: true,
        leadId: input.leadId,
        predictedLTV: scoringResult.predictedLTV,
        tier: scoringResult.tier,
        growthPotential: scoringResult.growthPotential,
        investmentPriority: scoringResult.investmentPriority,
        confidence: scoringResult.confidence,
        confidenceInterval: scoringResult.confidenceInterval,
        breakdown: input.includeBreakdown ? scoringResult.breakdown : undefined,
        reasoning: scoringResult.reasoning,
        recommendedActions: scoringResult.recommendedActions,
        method: scoringResult.method,
        modelVersion: scoringResult.modelVersion,
        isHighValue: this.isHighValue(scoringResult.tier),
        tierChanged,
        previousPLTV: patientData.lastPLTV?.value,
        events,
      };

      return { success: true, value: output };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SCORING_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error during pLTV scoring',
          details: error instanceof Error ? { stack: error.stack } : undefined,
        },
      };
    }
  }

  /**
   * Validate input
   */
  private validateInput(input: ScorePatientPLTVInput): { valid: boolean; message: string } {
    if (!input.leadId || typeof input.leadId !== 'string') {
      return { valid: false, message: 'leadId is required and must be a string' };
    }

    if (!input.clinicId || typeof input.clinicId !== 'string') {
      return { valid: false, message: 'clinicId is required and must be a string' };
    }

    if (!input.correlationId || typeof input.correlationId !== 'string') {
      return { valid: false, message: 'correlationId is required and must be a string' };
    }

    return { valid: true, message: '' };
  }

  /**
   * Build result for skipped scoring (recent score exists)
   */
  private buildSkippedResult(
    input: ScorePatientPLTVInput,
    patientData: PatientPLTVData
  ): ScorePatientPLTVResult {
    if (!patientData.lastPLTV) {
      return {
        success: false,
        error: {
          code: 'SCORING_FAILED',
          message: 'No previous score available',
        },
      };
    }

    const valueObject = PredictedLTV.fromValue(patientData.lastPLTV.value);

    const output: ScorePatientPLTVOutput = {
      success: true,
      leadId: input.leadId,
      predictedLTV: patientData.lastPLTV.value,
      tier: patientData.lastPLTV.tier,
      growthPotential: valueObject.growthPotential,
      investmentPriority: valueObject.investmentPriority,
      confidence: valueObject.confidence,
      confidenceInterval: { ...valueObject.confidenceInterval },
      reasoning: 'Using cached pLTV score (less than 24 hours old)',
      recommendedActions: valueObject.getInvestmentActions(),
      method: 'rule_based',
      modelVersion: this.scoringService.getModelVersion(),
      isHighValue: this.isHighValue(patientData.lastPLTV.tier),
      tierChanged: false,
      previousPLTV: patientData.lastPLTV.value,
      events: [],
    };

    return { success: true, value: output };
  }

  /**
   * Build domain events based on scoring result
   */
  private buildEvents(
    input: ScorePatientPLTVInput,
    result: PLTVScoringOutput,
    patientData: PatientPLTVData,
    tierChanged: boolean
  ): (PLTVScoredEvent | HighValuePatientIdentifiedEvent | PLTVTierChangedEvent)[] {
    const events: (PLTVScoredEvent | HighValuePatientIdentifiedEvent | PLTVTierChangedEvent)[] = [];
    const metadata = createPLTVEventMetadata(input.correlationId);

    // Always emit PLTVScored event
    const scoredEvent = createPLTVScoredEvent(
      input.leadId,
      {
        leadId: input.leadId,
        clinicId: input.clinicId,
        predictedLTV: result.predictedLTV,
        previousPLTV: patientData.lastPLTV?.value,
        tier: result.tier,
        growthPotential: result.growthPotential,
        investmentPriority: result.investmentPriority,
        confidence: result.confidence,
        method: result.method,
        modelVersion: result.modelVersion,
        reasoning: result.reasoning,
      },
      metadata
    );
    events.push(scoredEvent);

    // Emit HighValuePatientIdentified for GOLD+ tier
    if (this.isHighValue(result.tier)) {
      const followUpDeadline = new Date();
      const valueObject = PredictedLTV.fromValue(result.predictedLTV);
      followUpDeadline.setHours(followUpDeadline.getHours() + valueObject.getFollowUpSLAHours());

      const highValueEvent = createHighValuePatientIdentifiedEvent(
        input.leadId,
        {
          leadId: input.leadId,
          clinicId: input.clinicId,
          predictedLTV: result.predictedLTV,
          tier: result.tier,
          growthPotential: result.growthPotential,
          investmentPriority: result.investmentPriority,
          confidence: result.confidence,
          patientName: patientData.patientName,
          phone: patientData.phone,
          recommendedActions: result.recommendedActions,
          followUpDeadline: followUpDeadline.toISOString(),
        },
        metadata
      );
      events.push(highValueEvent);
    }

    // Emit PLTVTierChanged if tier changed
    if (tierChanged && patientData.lastPLTV) {
      const changePercentage =
        ((result.predictedLTV - patientData.lastPLTV.value) / patientData.lastPLTV.value) * 100;

      const tierChangedEvent = createPLTVTierChangedEvent(
        input.leadId,
        {
          leadId: input.leadId,
          clinicId: input.clinicId,
          previousPLTV: patientData.lastPLTV.value,
          newPLTV: result.predictedLTV,
          previousTier: patientData.lastPLTV.tier,
          newTier: result.tier,
          changePercentage: Math.round(changePercentage * 10) / 10,
          direction: this.getTierDirection(patientData.lastPLTV.tier, result.tier),
          changeReason: this.getChangeReason(
            patientData.lastPLTV.tier,
            result.tier,
            result.breakdown
          ),
        },
        metadata
      );
      events.push(tierChangedEvent);
    }

    return events;
  }

  /**
   * Check if tier is high-value (GOLD, PLATINUM, or DIAMOND)
   */
  private isHighValue(tier: PLTVTier): boolean {
    return tier === 'DIAMOND' || tier === 'PLATINUM' || tier === 'GOLD';
  }

  /**
   * Determine tier change direction
   */
  private getTierDirection(previousTier: PLTVTier, newTier: PLTVTier): 'upgrade' | 'downgrade' {
    const tierOrder: PLTVTier[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
    const previousIndex = tierOrder.indexOf(previousTier);
    const newIndex = tierOrder.indexOf(newTier);
    return newIndex > previousIndex ? 'upgrade' : 'downgrade';
  }

  /**
   * Generate reason for tier change
   */
  private getChangeReason(
    previousTier: PLTVTier,
    newTier: PLTVTier,
    breakdown: PLTVFactorBreakdown
  ): string {
    const direction = this.getTierDirection(previousTier, newTier);
    const factors: string[] = [];

    if (breakdown.procedureInterestAdjustment > 1000) {
      factors.push('high-value procedure interest');
    }
    if (breakdown.paymentReliabilityAdjustment > 500) {
      factors.push('improved payment reliability');
    }
    if (breakdown.paymentReliabilityAdjustment < -500) {
      factors.push('payment concerns');
    }
    if (breakdown.engagementAdjustment > 500) {
      factors.push('increased engagement');
    }
    if (breakdown.engagementAdjustment < -500) {
      factors.push('decreased engagement');
    }
    if (breakdown.retentionAdjustment < -500) {
      factors.push('retention risk');
    }

    const factorText = factors.length > 0 ? ` due to ${factors.join(', ')}` : '';
    return `Tier ${direction}d from ${previousTier} to ${newTier}${factorText}`;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a ScorePatientPLTV use case instance
 */
export function createScorePatientPLTVUseCase(
  deps: ScorePatientPLTVDependencies
): ScorePatientPLTVUseCase {
  return new ScorePatientPLTVUseCase(deps);
}
