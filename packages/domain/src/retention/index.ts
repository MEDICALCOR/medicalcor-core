/**
 * @fileoverview Retention Domain Module
 *
 * Churn prediction and patient retention scoring.
 *
 * @module domain/retention
 *
 * @example
 * ```typescript
 * import {
 *   createRetentionScoringService,
 *   RetentionScoringService,
 *   ScorePatientRetentionUseCase,
 * } from '@medicalcor/domain/retention';
 *
 * const service = createRetentionScoringService();
 * const result = service.calculateScore({
 *   daysInactive: 45,
 *   canceledAppointments: 1,
 *   npsScore: 8,
 *   lifetimeValue: 15000,
 *   totalTreatments: 4,
 * });
 *
 * console.log(result.score); // 65
 * console.log(result.classification); // 'STABLE'
 * console.log(result.churnRisk); // 'MEDIU'
 * ```
 */

export {
  RetentionScoringService,
  createRetentionScoringService,
  type RetentionScoringServiceConfig,
  type RetentionScoreWeights,
  type RetentionThresholds,
  type RetentionMetricsInput,
  type RetentionScoringOutput,
  type RetentionScoreBreakdown,
} from './retention-scoring-service.js';

export {
  ScorePatientRetentionUseCase,
  // Input/Output types
  type ScorePatientRetentionInput,
  type ScorePatientRetentionOutput,
  type ScorePatientRetentionError,
  type ScorePatientRetentionErrorCode,
  type ScorePatientRetentionResult,
  // Domain events
  type RetentionDomainEvent,
  type ChurnRiskDetectedEvent,
  type RetentionScoreUpdatedEvent,
  // Repository interfaces
  type IPatientRetentionRepository,
  type PatientRetentionData,
  type IRetentionEventPublisher,
  type IRetentionCrmGateway,
  type IRetentionIdempotencyStore,
  type ScorePatientRetentionDependencies,
} from './use-cases/score-patient-retention.js';
