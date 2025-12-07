/**
 * @fileoverview Revenue Forecast Domain Events
 *
 * Banking/Medical Grade Domain Events for Revenue Forecasting.
 * Strictly typed events following Event Sourcing patterns.
 *
 * @module domain/shared-kernel/domain-events/revenue-forecast-events
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Events are facts that happened
 * 2. STRICT TYPING - No any/unknown in event payloads
 * 3. VERSIONING - Schema version for evolution
 * 4. IDEMPOTENCY - Events have unique IDs for deduplication
 */

import type { EventMetadata, DomainEvent } from './lead-events.js';
import type { RevenueTrend, ForecastConfidenceLevel } from '../value-objects/revenue-projection.js';

// ============================================================================
// TYPE ALIASES
// ============================================================================

/**
 * Forecasting method type for revenue events
 */
export type RevenueForecastEventMethod =
  | 'moving_average'
  | 'exponential_smoothing'
  | 'linear_regression'
  | 'ensemble';

// ============================================================================
// REVENUE FORECAST LIFECYCLE EVENTS
// ============================================================================

/**
 * RevenueForecastGenerated - Emitted when a revenue forecast is calculated
 */
export interface RevenueForecastGeneratedPayload {
  /** Clinic ID */
  readonly clinicId: string;

  /** Forecasting method used */
  readonly method: RevenueForecastEventMethod;

  /** Confidence level of the forecast */
  readonly confidenceLevel: ForecastConfidenceLevel;

  /** Total predicted revenue in EUR */
  readonly totalPredictedRevenue: number;

  /** Number of forecast periods */
  readonly forecastPeriods: number;

  /** Lower bound of confidence interval */
  readonly confidenceIntervalLower: number;

  /** Upper bound of confidence interval */
  readonly confidenceIntervalUpper: number;

  /** Revenue trend direction */
  readonly trendDirection: RevenueTrend;

  /** Annualized growth rate */
  readonly annualizedGrowthRate: number;

  /** Model R-squared (goodness of fit) */
  readonly modelRSquared: number;

  /** Model version used */
  readonly modelVersion: string;

  /** Historical data points used */
  readonly dataPointsUsed: number;
}

export type RevenueForecastGeneratedEvent = DomainEvent<
  'revenue_forecast.generated',
  RevenueForecastGeneratedPayload
>;

/**
 * RevenueGrowthDetected - Emitted when significant revenue growth is forecasted
 * Triggered when annualized growth > 10%
 */
export interface RevenueGrowthDetectedPayload {
  /** Clinic ID */
  readonly clinicId: string;

  /** Annualized growth rate (percentage) */
  readonly annualizedGrowthRate: number;

  /** Total predicted revenue */
  readonly totalPredictedRevenue: number;

  /** Confidence level */
  readonly confidenceLevel: ForecastConfidenceLevel;

  /** Growth drivers identified */
  readonly growthDrivers: readonly string[];

  /** Recommended scaling actions */
  readonly recommendedActions: readonly string[];
}

export type RevenueGrowthDetectedEvent = DomainEvent<
  'revenue_forecast.growth_detected',
  RevenueGrowthDetectedPayload
>;

/**
 * RevenueDeclineAlert - Emitted when revenue decline is forecasted
 * Triggered when annualized growth < -5%
 */
export interface RevenueDeclineAlertPayload {
  /** Clinic ID */
  readonly clinicId: string;

  /** Decline rate (negative percentage) */
  readonly declineRate: number;

  /** Projected revenue loss in EUR */
  readonly projectedRevenueLoss: number;

  /** Previous period revenue */
  readonly previousRevenue: number;

  /** Forecasted revenue */
  readonly forecastedRevenue: number;

  /** Risk factors contributing to decline */
  readonly riskFactors: readonly string[];

  /** Recommended intervention actions */
  readonly recommendedActions: readonly string[];

  /** Alert severity */
  readonly severity: 'WARNING' | 'CRITICAL';
}

export type RevenueDeclineAlertEvent = DomainEvent<
  'revenue_forecast.decline_alert',
  RevenueDeclineAlertPayload
>;

/**
 * RevenueVolatilityDetected - Emitted when high revenue volatility is detected
 */
export interface RevenueVolatilityDetectedPayload {
  /** Clinic ID */
  readonly clinicId: string;

  /** Volatility coefficient (coefficient of variation) */
  readonly volatilityCoefficient: number;

  /** Monthly revenue variance */
  readonly monthlyVariance: number;

  /** Impact on forecast confidence */
  readonly forecastConfidenceLevel: ForecastConfidenceLevel;

  /** Stabilization recommendations */
  readonly stabilizationActions: readonly string[];
}

export type RevenueVolatilityDetectedEvent = DomainEvent<
  'revenue_forecast.volatility_detected',
  RevenueVolatilityDetectedPayload
>;

/**
 * ForecastAccuracyReviewed - Emitted when forecast accuracy is compared to actuals
 */
export interface ForecastAccuracyReviewedPayload {
  /** Clinic ID */
  readonly clinicId: string;

  /** Review period start */
  readonly periodStart: string;

  /** Review period end */
  readonly periodEnd: string;

  /** Forecasted revenue for period */
  readonly forecastedRevenue: number;

  /** Actual revenue for period */
  readonly actualRevenue: number;

  /** Mean Absolute Percentage Error */
  readonly mape: number;

  /** Was actual within confidence interval */
  readonly withinConfidenceInterval: boolean;

  /** Forecast bias (positive = overestimate) */
  readonly bias: number;

  /** Model needs recalibration */
  readonly needsRecalibration: boolean;
}

export type ForecastAccuracyReviewedEvent = DomainEvent<
  'revenue_forecast.accuracy_reviewed',
  ForecastAccuracyReviewedPayload
>;

/**
 * SeasonalAnomalyDetected - Emitted when revenue deviates significantly from seasonal pattern
 */
export interface SeasonalAnomalyDetectedPayload {
  /** Clinic ID */
  readonly clinicId: string;

  /** Month affected */
  readonly month: string;

  /** Expected seasonal factor */
  readonly expectedSeasonalFactor: number;

  /** Observed pattern */
  readonly observedFactor: number;

  /** Deviation percentage */
  readonly deviationPercentage: number;

  /** Possible causes */
  readonly possibleCauses: readonly string[];
}

export type SeasonalAnomalyDetectedEvent = DomainEvent<
  'revenue_forecast.seasonal_anomaly',
  SeasonalAnomalyDetectedPayload
>;

// ============================================================================
// BATCH/AGGREGATE EVENTS
// ============================================================================

/**
 * BatchForecastCompleted - Emitted when batch forecasting completes
 */
export interface BatchForecastCompletedPayload {
  /** Batch ID for tracking */
  readonly batchId: string;

  /** Total clinics processed */
  readonly totalClinics: number;

  /** Successfully forecasted */
  readonly succeeded: number;

  /** Failed forecasts */
  readonly failed: number;

  /** Clinics with growth detected */
  readonly growthDetectedCount: number;

  /** Clinics with decline alerts */
  readonly declineAlertCount: number;

  /** Total predicted revenue across all clinics */
  readonly totalPredictedRevenue: number;

  /** Average growth rate across clinics */
  readonly averageGrowthRate: number;

  /** Processing duration in ms */
  readonly durationMs: number;
}

export type BatchForecastCompletedEvent = DomainEvent<
  'revenue_forecast.batch_completed',
  BatchForecastCompletedPayload
>;

/**
 * ForecastModelUpdated - Emitted when forecasting model parameters are updated
 */
export interface ForecastModelUpdatedPayload {
  /** Previous model version */
  readonly previousVersion: string;

  /** New model version */
  readonly newVersion: string;

  /** Parameters changed */
  readonly parametersChanged: readonly string[];

  /** Reason for update */
  readonly updateReason: string;

  /** Affected clinics count */
  readonly affectedClinics: number;
}

export type ForecastModelUpdatedEvent = DomainEvent<
  'revenue_forecast.model_updated',
  ForecastModelUpdatedPayload
>;

// ============================================================================
// UNION TYPE FOR ALL REVENUE FORECAST EVENTS
// ============================================================================

/**
 * Union of all revenue forecast domain events
 */
export type RevenueForecastDomainEvent =
  | RevenueForecastGeneratedEvent
  | RevenueGrowthDetectedEvent
  | RevenueDeclineAlertEvent
  | RevenueVolatilityDetectedEvent
  | ForecastAccuracyReviewedEvent
  | SeasonalAnomalyDetectedEvent
  | BatchForecastCompletedEvent
  | ForecastModelUpdatedEvent;

/**
 * Event type discriminator
 */
export type RevenueForecastEventType = RevenueForecastDomainEvent['type'];

// ============================================================================
// EVENT FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate UUID v4 (browser and Node.js compatible)
 */
function generateUUID(): string {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Required for older runtimes
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create event metadata for revenue forecast events
 */
export function createRevenueForecastEventMetadata(
  correlationId: string,
  causationId?: string,
  actor?: string
): EventMetadata {
  const metadata: EventMetadata = {
    eventId: generateUUID(),
    timestamp: new Date().toISOString(),
    correlationId,
    idempotencyKey: `forecast-${correlationId}-${generateUUID()}`,
    version: 1,
    source: 'revenue-forecasting-service',
  };

  if (causationId !== undefined) {
    return { ...metadata, causationId };
  }
  if (actor !== undefined) {
    return { ...metadata, actor };
  }

  return metadata;
}

/**
 * Create RevenueForecastGenerated event
 */
export function createRevenueForecastGeneratedEvent(
  aggregateId: string,
  payload: RevenueForecastGeneratedPayload,
  metadata: EventMetadata
): RevenueForecastGeneratedEvent {
  return {
    type: 'revenue_forecast.generated',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create RevenueGrowthDetected event
 */
export function createRevenueGrowthDetectedEvent(
  aggregateId: string,
  payload: RevenueGrowthDetectedPayload,
  metadata: EventMetadata
): RevenueGrowthDetectedEvent {
  return {
    type: 'revenue_forecast.growth_detected',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create RevenueDeclineAlert event
 */
export function createRevenueDeclineAlertEvent(
  aggregateId: string,
  payload: RevenueDeclineAlertPayload,
  metadata: EventMetadata
): RevenueDeclineAlertEvent {
  return {
    type: 'revenue_forecast.decline_alert',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create RevenueVolatilityDetected event
 */
export function createRevenueVolatilityDetectedEvent(
  aggregateId: string,
  payload: RevenueVolatilityDetectedPayload,
  metadata: EventMetadata
): RevenueVolatilityDetectedEvent {
  return {
    type: 'revenue_forecast.volatility_detected',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create ForecastAccuracyReviewed event
 */
export function createForecastAccuracyReviewedEvent(
  aggregateId: string,
  payload: ForecastAccuracyReviewedPayload,
  metadata: EventMetadata
): ForecastAccuracyReviewedEvent {
  return {
    type: 'revenue_forecast.accuracy_reviewed',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create SeasonalAnomalyDetected event
 */
export function createSeasonalAnomalyDetectedEvent(
  aggregateId: string,
  payload: SeasonalAnomalyDetectedPayload,
  metadata: EventMetadata
): SeasonalAnomalyDetectedEvent {
  return {
    type: 'revenue_forecast.seasonal_anomaly',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create BatchForecastCompleted event
 */
export function createBatchForecastCompletedEvent(
  aggregateId: string,
  payload: BatchForecastCompletedPayload,
  metadata: EventMetadata
): BatchForecastCompletedEvent {
  return {
    type: 'revenue_forecast.batch_completed',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

/**
 * Create ForecastModelUpdated event
 */
export function createForecastModelUpdatedEvent(
  aggregateId: string,
  payload: ForecastModelUpdatedPayload,
  metadata: EventMetadata
): ForecastModelUpdatedEvent {
  return {
    type: 'revenue_forecast.model_updated',
    aggregateId,
    aggregateType: 'Lead',
    metadata,
    payload,
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for RevenueForecastGenerated event
 */
export function isRevenueForecastGeneratedEvent(
  event: RevenueForecastDomainEvent
): event is RevenueForecastGeneratedEvent {
  return event.type === 'revenue_forecast.generated';
}

/**
 * Type guard for RevenueGrowthDetected event
 */
export function isRevenueGrowthDetectedEvent(
  event: RevenueForecastDomainEvent
): event is RevenueGrowthDetectedEvent {
  return event.type === 'revenue_forecast.growth_detected';
}

/**
 * Type guard for RevenueDeclineAlert event
 */
export function isRevenueDeclineAlertEvent(
  event: RevenueForecastDomainEvent
): event is RevenueDeclineAlertEvent {
  return event.type === 'revenue_forecast.decline_alert';
}

/**
 * Type guard for RevenueVolatilityDetected event
 */
export function isRevenueVolatilityDetectedEvent(
  event: RevenueForecastDomainEvent
): event is RevenueVolatilityDetectedEvent {
  return event.type === 'revenue_forecast.volatility_detected';
}

/**
 * Type guard for ForecastAccuracyReviewed event
 */
export function isForecastAccuracyReviewedEvent(
  event: RevenueForecastDomainEvent
): event is ForecastAccuracyReviewedEvent {
  return event.type === 'revenue_forecast.accuracy_reviewed';
}

/**
 * Type guard for SeasonalAnomalyDetected event
 */
export function isSeasonalAnomalyDetectedEvent(
  event: RevenueForecastDomainEvent
): event is SeasonalAnomalyDetectedEvent {
  return event.type === 'revenue_forecast.seasonal_anomaly';
}

/**
 * Type guard for BatchForecastCompleted event
 */
export function isBatchForecastCompletedEvent(
  event: RevenueForecastDomainEvent
): event is BatchForecastCompletedEvent {
  return event.type === 'revenue_forecast.batch_completed';
}

/**
 * Type guard for ForecastModelUpdated event
 */
export function isForecastModelUpdatedEvent(
  event: RevenueForecastDomainEvent
): event is ForecastModelUpdatedEvent {
  return event.type === 'revenue_forecast.model_updated';
}
