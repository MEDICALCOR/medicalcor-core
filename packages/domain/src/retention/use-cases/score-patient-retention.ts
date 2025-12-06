/**
 * @fileoverview ScorePatientRetentionUseCase
 *
 * Banking/Medical Grade Use Case for Patient Retention Scoring.
 * Pure domain logic for churn prediction and retention analysis.
 *
 * @module domain/retention/use-cases/score-patient-retention
 *
 * DESIGN PRINCIPLES:
 * 1. SINGLE RESPONSIBILITY - Only handles retention scoring orchestration
 * 2. DEPENDENCY INVERSION - Depends on interfaces, not implementations
 * 3. TESTABLE IN ISOLATION - No infrastructure dependencies
 * 4. IDEMPOTENT - Safe to retry with same correlation ID
 */

import {
  RetentionScore,
  type ChurnRiskLevel,
  type FollowUpPriority,
  type RetentionClassification,
} from '../../shared-kernel/value-objects/retention-score.js';
import {
  RetentionScoringService,
  type RetentionMetricsInput,
  type RetentionScoringOutput,
} from '../retention-scoring-service.js';

// ============================================================================
// USE CASE INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Score Patient Retention Use Case Input
 */
export interface ScorePatientRetentionInput {
  /** Patient/Contact ID */
  readonly contactId: string;

  /** Clinic ID (optional) */
  readonly clinicId?: string;

  /** Patient name for personalization */
  readonly patientName?: string;

  /** Patient phone for outreach */
  readonly phone?: string;

  /** Retention metrics */
  readonly metrics: RetentionMetricsInput;

  /** Correlation ID for tracing */
  readonly correlationId: string;

  /** Force recalculation even if recently scored */
  readonly forceRecalculate?: boolean;

  /** Idempotency key (prevents duplicate processing) */
  readonly idempotencyKey?: string;
}

/**
 * Score Patient Retention Use Case Output
 */
export interface ScorePatientRetentionOutput {
  /** Whether scoring was successful */
  readonly success: boolean;

  /** Patient/Contact ID */
  readonly contactId: string;

  /** Numeric retention score (0-100) */
  readonly score: number;

  /** Churn risk level */
  readonly churnRisk: ChurnRiskLevel;

  /** Follow-up priority */
  readonly followUpPriority: FollowUpPriority;

  /** Classification */
  readonly classification: RetentionClassification;

  /** Confidence level */
  readonly confidence: number;

  /** Human-readable reasoning */
  readonly reasoning: string;

  /** Suggested actions */
  readonly suggestedActions: readonly string[];

  /** Domain events emitted */
  readonly events: readonly RetentionDomainEvent[];

  /** Whether this is a high-risk patient */
  readonly isHighRisk: boolean;

  /** Whether patient requires immediate intervention */
  readonly requiresIntervention: boolean;
}

/**
 * Score Patient Retention Use Case Error
 */
export interface ScorePatientRetentionError {
  readonly code: ScorePatientRetentionErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type ScorePatientRetentionErrorCode =
  | 'PATIENT_NOT_FOUND'
  | 'SCORING_FAILED'
  | 'CRM_UPDATE_FAILED'
  | 'DUPLICATE_REQUEST'
  | 'VALIDATION_ERROR'
  | 'METRICS_INVALID';

/**
 * Score Patient Retention Result
 */
export type ScorePatientRetentionResult =
  | { success: true; value: ScorePatientRetentionOutput }
  | { success: false; error: ScorePatientRetentionError };

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

/**
 * Base domain event structure
 */
export interface RetentionDomainEvent {
  readonly type: string;
  readonly aggregateId: string;
  readonly aggregateType: 'patient';
  readonly correlationId: string;
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Churn risk detected event
 */
export interface ChurnRiskDetectedEvent extends RetentionDomainEvent {
  readonly type: 'patient.churn_risk_detected';
  readonly payload: {
    readonly contactId: string;
    readonly retentionScore: number;
    readonly churnRisk: ChurnRiskLevel;
    readonly followUpPriority: FollowUpPriority;
    readonly lifetimeValue: number;
    readonly patientName?: string;
    readonly phone?: string;
  };
}

/**
 * Retention score updated event
 */
export interface RetentionScoreUpdatedEvent extends RetentionDomainEvent {
  readonly type: 'patient.retention_score_updated';
  readonly payload: {
    readonly contactId: string;
    readonly previousScore?: number;
    readonly newScore: number;
    readonly churnRisk: ChurnRiskLevel;
    readonly classification: RetentionClassification;
  };
}

// ============================================================================
// USE CASE DEPENDENCIES
// ============================================================================

/**
 * Patient repository interface for retention data
 */
export interface IPatientRetentionRepository {
  getRetentionMetrics(contactId: string): Promise<PatientRetentionData | null>;
  updateRetentionScore(
    contactId: string,
    data: {
      retentionScore: number;
      churnRisk: ChurnRiskLevel;
      followUpPriority: FollowUpPriority;
      classification: RetentionClassification;
      daysInactive: number;
    }
  ): Promise<void>;
}

/**
 * Patient retention data from repository
 */
export interface PatientRetentionData {
  readonly contactId: string;
  readonly patientName?: string;
  readonly phone?: string;
  readonly email?: string;
  readonly daysInactive: number;
  readonly canceledAppointments: number;
  readonly npsScore: number | null;
  readonly lifetimeValue: number;
  readonly totalTreatments: number;
  readonly lastAppointmentDate?: Date;
  readonly lastTreatmentDate?: Date;
  readonly previousRetentionScore?: number;
}

/**
 * Event publisher interface
 */
export interface IRetentionEventPublisher {
  publish(event: RetentionDomainEvent): Promise<void>;
}

/**
 * CRM gateway for updating retention metrics
 */
export interface IRetentionCrmGateway {
  updateRetentionMetrics(
    contactId: string,
    data: {
      retentionScore: number;
      churnRisk: ChurnRiskLevel;
      daysInactive: number;
      followUpPriority: FollowUpPriority;
    }
  ): Promise<void>;
}

/**
 * Idempotency store interface
 */
export interface IRetentionIdempotencyStore {
  exists(key: string): Promise<boolean>;
  set(key: string, result: ScorePatientRetentionOutput, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<ScorePatientRetentionOutput | null>;
}

/**
 * Use case dependencies (injected via constructor)
 */
export interface ScorePatientRetentionDependencies {
  readonly patientRepository?: IPatientRetentionRepository;
  readonly crmGateway?: IRetentionCrmGateway;
  readonly eventPublisher: IRetentionEventPublisher;
  readonly idempotencyStore?: IRetentionIdempotencyStore;
  readonly scoringService?: RetentionScoringService;
}

// ============================================================================
// USE CASE IMPLEMENTATION
// ============================================================================

/**
 * ScorePatientRetentionUseCase - Banking Grade Retention Scoring
 *
 * Orchestrates patient retention scoring with churn prediction.
 * This is a pure domain use case with no infrastructure dependencies.
 *
 * @example
 * ```typescript
 * const useCase = new ScorePatientRetentionUseCase({
 *   eventPublisher: kafkaPublisher,
 *   crmGateway: hubspotGateway,
 * });
 *
 * const result = await useCase.execute({
 *   contactId: 'patient-123',
 *   metrics: {
 *     daysInactive: 45,
 *     canceledAppointments: 1,
 *     npsScore: 8,
 *     lifetimeValue: 15000,
 *     totalTreatments: 4,
 *   },
 *   correlationId: 'trace-456',
 * });
 *
 * if (result.success) {
 *   console.log(result.value.classification); // 'STABLE'
 *   console.log(result.value.isHighRisk); // false
 * }
 * ```
 */
export class ScorePatientRetentionUseCase {
  private readonly patientRepository?: IPatientRetentionRepository;
  private readonly crmGateway?: IRetentionCrmGateway;
  private readonly eventPublisher: IRetentionEventPublisher;
  private readonly idempotencyStore?: IRetentionIdempotencyStore;
  private readonly scoringService: RetentionScoringService;

  constructor(deps: ScorePatientRetentionDependencies) {
    this.eventPublisher = deps.eventPublisher;

    // Optional dependencies
    if (deps.patientRepository !== undefined) {
      this.patientRepository = deps.patientRepository;
    }
    if (deps.crmGateway !== undefined) {
      this.crmGateway = deps.crmGateway;
    }
    if (deps.idempotencyStore !== undefined) {
      this.idempotencyStore = deps.idempotencyStore;
    }

    // Use provided scoring service or create default
    this.scoringService = deps.scoringService ?? new RetentionScoringService();
  }

  /**
   * Execute the use case
   */
  async execute(input: ScorePatientRetentionInput): Promise<ScorePatientRetentionResult> {
    // =========================================================================
    // STEP 1: Validate Input
    // =========================================================================
    const validationResult = this.validateInput(input);
    if (!validationResult.success) {
      return validationResult;
    }

    // =========================================================================
    // STEP 2: Check Idempotency
    // =========================================================================
    if (input.idempotencyKey && this.idempotencyStore) {
      const existingResult = await this.idempotencyStore.get(input.idempotencyKey);
      if (existingResult && !input.forceRecalculate) {
        return { success: true, value: existingResult };
      }
    }

    // =========================================================================
    // STEP 3: Get Existing Patient Data (if repository available)
    // =========================================================================
    let previousScore: number | undefined;
    if (this.patientRepository) {
      const patientData = await this.patientRepository.getRetentionMetrics(input.contactId);
      if (patientData) {
        previousScore = patientData.previousRetentionScore;
      }
    }

    // =========================================================================
    // STEP 4: Calculate Retention Score
    // =========================================================================
    const scoringOutput = this.scoringService.calculateScore(input.metrics);
    const valueObject = RetentionScore.fromNumeric(
      scoringOutput.score,
      scoringOutput.confidence,
      input.metrics.lifetimeValue
    );

    // =========================================================================
    // STEP 5: Update Patient Repository (if available)
    // =========================================================================
    if (this.patientRepository) {
      await this.patientRepository.updateRetentionScore(input.contactId, {
        retentionScore: scoringOutput.score,
        churnRisk: scoringOutput.churnRisk,
        followUpPriority: scoringOutput.followUpPriority,
        classification: scoringOutput.classification,
        daysInactive: input.metrics.daysInactive,
      });
    }

    // =========================================================================
    // STEP 6: Update CRM (if gateway available)
    // =========================================================================
    if (this.crmGateway) {
      await this.crmGateway.updateRetentionMetrics(input.contactId, {
        retentionScore: scoringOutput.score,
        churnRisk: scoringOutput.churnRisk,
        daysInactive: input.metrics.daysInactive,
        followUpPriority: scoringOutput.followUpPriority,
      });
    }

    // =========================================================================
    // STEP 7: Emit Domain Events
    // =========================================================================
    const events: RetentionDomainEvent[] = [];
    const timestamp = new Date().toISOString();

    // Always emit retention score updated event
    const scoreUpdatedEvent: RetentionScoreUpdatedEvent = {
      type: 'patient.retention_score_updated',
      aggregateId: input.contactId,
      aggregateType: 'patient',
      correlationId: input.correlationId,
      timestamp,
      payload: {
        contactId: input.contactId,
        previousScore,
        newScore: scoringOutput.score,
        churnRisk: scoringOutput.churnRisk,
        classification: scoringOutput.classification,
      },
    };
    events.push(scoreUpdatedEvent);
    await this.eventPublisher.publish(scoreUpdatedEvent);

    // Emit churn risk event for high-risk patients
    const isHighRisk = valueObject.requiresUrgentIntervention();
    if (isHighRisk) {
      const churnRiskEvent: ChurnRiskDetectedEvent = {
        type: 'patient.churn_risk_detected',
        aggregateId: input.contactId,
        aggregateType: 'patient',
        correlationId: input.correlationId,
        timestamp,
        payload: {
          contactId: input.contactId,
          retentionScore: scoringOutput.score,
          churnRisk: scoringOutput.churnRisk,
          followUpPriority: scoringOutput.followUpPriority,
          lifetimeValue: input.metrics.lifetimeValue,
          patientName: input.patientName,
          phone: input.phone,
        },
      };
      events.push(churnRiskEvent);
      await this.eventPublisher.publish(churnRiskEvent);
    }

    // =========================================================================
    // STEP 8: Build Output
    // =========================================================================
    const output: ScorePatientRetentionOutput = {
      success: true,
      contactId: input.contactId,
      score: scoringOutput.score,
      churnRisk: scoringOutput.churnRisk,
      followUpPriority: scoringOutput.followUpPriority,
      classification: scoringOutput.classification,
      confidence: scoringOutput.confidence,
      reasoning: scoringOutput.reasoning,
      suggestedActions: scoringOutput.suggestedActions,
      events,
      isHighRisk,
      requiresIntervention: valueObject.needsProactiveOutreach(),
    };

    // =========================================================================
    // STEP 9: Store for Idempotency
    // =========================================================================
    if (input.idempotencyKey && this.idempotencyStore) {
      await this.idempotencyStore.set(input.idempotencyKey, output, 3600); // 1 hour TTL
    }

    return { success: true, value: output };
  }

  /**
   * Execute scoring for metrics only (no side effects)
   * Useful for preview/simulation
   */
  executePreview(metrics: RetentionMetricsInput): RetentionScoringOutput {
    return this.scoringService.calculateScore(metrics);
  }

  /**
   * Get the RetentionScore value object for domain operations
   */
  getValueObject(metrics: RetentionMetricsInput): RetentionScore {
    return this.scoringService.getValueObject(metrics);
  }

  /**
   * Validate input
   */
  private validateInput(
    input: ScorePatientRetentionInput
  ): ScorePatientRetentionResult | { success: true } {
    if (!input.contactId) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Contact ID is required',
        },
      };
    }

    if (!input.correlationId) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Correlation ID is required for tracing',
        },
      };
    }

    // Validate metrics
    if (input.metrics.daysInactive < 0) {
      return {
        success: false,
        error: {
          code: 'METRICS_INVALID',
          message: 'Days inactive cannot be negative',
          details: { daysInactive: input.metrics.daysInactive },
        },
      };
    }

    if (input.metrics.canceledAppointments < 0) {
      return {
        success: false,
        error: {
          code: 'METRICS_INVALID',
          message: 'Canceled appointments cannot be negative',
          details: { canceledAppointments: input.metrics.canceledAppointments },
        },
      };
    }

    if (input.metrics.npsScore !== null) {
      if (input.metrics.npsScore < 0 || input.metrics.npsScore > 10) {
        return {
          success: false,
          error: {
            code: 'METRICS_INVALID',
            message: 'NPS score must be between 0 and 10',
            details: { npsScore: input.metrics.npsScore },
          },
        };
      }
    }

    if (input.metrics.lifetimeValue < 0) {
      return {
        success: false,
        error: {
          code: 'METRICS_INVALID',
          message: 'Lifetime value cannot be negative',
          details: { lifetimeValue: input.metrics.lifetimeValue },
        },
      };
    }

    if (input.metrics.totalTreatments < 0) {
      return {
        success: false,
        error: {
          code: 'METRICS_INVALID',
          message: 'Total treatments cannot be negative',
          details: { totalTreatments: input.metrics.totalTreatments },
        },
      };
    }

    return { success: true };
  }
}
