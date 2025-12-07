/**
 * @fileoverview Primary Port - RevenueForecastingUseCase
 *
 * Defines what the application offers for revenue forecasting operations (driving side).
 * This is a hexagonal architecture PRIMARY PORT for ML-powered revenue prediction.
 *
 * @module application/ports/primary/RevenueForecastingUseCase
 *
 * HEXAGONAL ARCHITECTURE PRINCIPLE:
 * Primary ports define the use cases that the application exposes to driving adapters
 * (REST API, CLI, Trigger.dev jobs). They orchestrate domain services and
 * coordinate with secondary ports (repositories, external services).
 *
 * FORECASTING METHODS:
 * - Simple Moving Average: For stable, predictable revenue patterns
 * - Exponential Smoothing: For recent-trend-weighted predictions
 * - Linear Regression: For growth/decline trend analysis
 * - Ensemble: Combines all methods for robust predictions
 */

import type { Result } from '../../shared/Result.js';
import type { DomainError } from '../../shared/DomainError.js';
import type { SecurityContext } from '../../security/SecurityContext.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Forecasting method selection
 */
export type ForecastMethod =
  | 'moving_average'
  | 'exponential_smoothing'
  | 'linear_regression'
  | 'ensemble';

/**
 * Forecast confidence level
 */
export type ForecastConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Revenue trend direction
 */
export type RevenueTrend = 'GROWING' | 'STABLE' | 'DECLINING' | 'VOLATILE';

/**
 * Time granularity for historical data
 */
export type ForecastGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly';

// ============================================================================
// INPUT/OUTPUT INTERFACES
// ============================================================================

/**
 * Single historical revenue data point
 */
export interface HistoricalRevenuePoint {
  /** Period start date */
  readonly date: Date;

  /** Total revenue collected in EUR */
  readonly revenue: number;

  /** Number of cases completed */
  readonly casesCompleted: number;

  /** Number of new patients */
  readonly newPatients: number;

  /** Collection rate (0-100) */
  readonly collectionRate?: number;

  /** Average case value */
  readonly avgCaseValue?: number;

  /** Revenue from high-value procedures */
  readonly highValueRevenue?: number;
}

/**
 * Input for generating a revenue forecast
 */
export interface GenerateForecastInput {
  /** Clinic identifier */
  readonly clinicId: string;

  /** Correlation ID for tracing */
  readonly correlationId: string;

  /** Historical revenue data */
  readonly historicalData: readonly HistoricalRevenuePoint[];

  /** Data granularity */
  readonly granularity: ForecastGranularity;

  /** Forecasting method (default: ensemble) */
  readonly method?: ForecastMethod;

  /** Number of periods to forecast (default: 6) */
  readonly forecastPeriods?: number;

  /** Confidence interval level (default: 0.95) */
  readonly confidenceLevel?: number;

  /** Apply seasonal adjustments (default: true) */
  readonly applySeasonality?: boolean;

  /** Force recalculation even if cached */
  readonly forceRefresh?: boolean;

  /** Currency code (default: EUR) */
  readonly currency?: string;
}

/**
 * Confidence interval for a forecast
 */
export interface ForecastConfidenceInterval {
  /** Lower bound (EUR) */
  readonly lower: number;

  /** Upper bound (EUR) */
  readonly upper: number;

  /** Confidence level (e.g., 0.95) */
  readonly level: number;
}

/**
 * Single forecasted revenue point
 */
export interface ForecastedPoint {
  /** Forecast period date */
  readonly date: Date;

  /** Predicted revenue (EUR) */
  readonly predicted: number;

  /** Confidence interval */
  readonly confidenceInterval: ForecastConfidenceInterval;

  /** Seasonal adjustment factor applied */
  readonly seasonalFactor?: number;

  /** Trend component contribution */
  readonly trendComponent?: number;

  /** High uncertainty flag (far future) */
  readonly highUncertainty: boolean;
}

/**
 * Model fit statistics
 */
export interface ModelFitStatistics {
  /** R-squared (0-1) */
  readonly rSquared: number;

  /** Mean Absolute Error (EUR) */
  readonly mae: number;

  /** Mean Absolute Percentage Error (%) */
  readonly mape: number;

  /** Root Mean Square Error (EUR) */
  readonly rmse: number;

  /** Data points used for fitting */
  readonly dataPointsUsed: number;
}

/**
 * Trend analysis results
 */
export interface TrendAnalysis {
  /** Overall trend direction */
  readonly direction: RevenueTrend;

  /** Monthly growth rate (%) */
  readonly monthlyGrowthRate: number;

  /** Annualized growth rate (%) */
  readonly annualizedGrowthRate: number;

  /** Is trend statistically significant */
  readonly isSignificant: boolean;

  /** Volatility measure (coefficient of variation) */
  readonly volatility: number;
}

/**
 * Output from revenue forecast generation
 */
export interface GenerateForecastOutput {
  /** Operation success */
  readonly success: boolean;

  /** Clinic identifier */
  readonly clinicId: string;

  /** Method used for forecasting */
  readonly method: ForecastMethod;

  /** Overall confidence level */
  readonly confidenceLevel: ForecastConfidenceLevel;

  /** Individual forecast points */
  readonly forecasts: readonly ForecastedPoint[];

  /** Total predicted revenue for forecast period (EUR) */
  readonly totalPredictedRevenue: number;

  /** Total confidence interval */
  readonly totalConfidenceInterval: ForecastConfidenceInterval;

  /** Model fit statistics */
  readonly modelFit: ModelFitStatistics;

  /** Trend analysis */
  readonly trendAnalysis: TrendAnalysis;

  /** Human-readable summary */
  readonly summary: string;

  /** Recommended actions */
  readonly recommendedActions: readonly string[];

  /** Model version used */
  readonly modelVersion: string;

  /** Calculation timestamp */
  readonly calculatedAt: Date;

  /** Was result from cache */
  readonly fromCache: boolean;
}

/**
 * Input for comparing forecast to actuals
 */
export interface CompareForecastInput {
  /** Clinic identifier */
  readonly clinicId: string;

  /** Correlation ID */
  readonly correlationId: string;

  /** Period start date */
  readonly periodStart: Date;

  /** Period end date */
  readonly periodEnd: Date;

  /** Forecasted revenue for the period */
  readonly forecastedRevenue: number;

  /** Forecasted confidence interval */
  readonly forecastedInterval: ForecastConfidenceInterval;

  /** Actual revenue for the period */
  readonly actualRevenue: number;
}

/**
 * Forecast accuracy comparison result
 */
export interface ForecastAccuracyOutput {
  /** Clinic identifier */
  readonly clinicId: string;

  /** Period analyzed */
  readonly periodStart: Date;
  readonly periodEnd: Date;

  /** Forecasted vs actual */
  readonly forecastedRevenue: number;
  readonly actualRevenue: number;

  /** Absolute error (EUR) */
  readonly absoluteError: number;

  /** Percentage error */
  readonly percentageError: number;

  /** Was actual within confidence interval */
  readonly withinConfidenceInterval: boolean;

  /** Forecast bias (positive = overestimate) */
  readonly bias: number;

  /** Model needs recalibration */
  readonly needsRecalibration: boolean;

  /** Accuracy assessment */
  readonly assessment: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
}

/**
 * Input for batch forecasting
 */
export interface BatchForecastInput {
  /** Clinic IDs to forecast */
  readonly clinicIds: readonly string[];

  /** Correlation ID */
  readonly correlationId: string;

  /** Forecast configuration (applied to all) */
  readonly method?: ForecastMethod;
  readonly forecastPeriods?: number;
  readonly applySeasonality?: boolean;

  /** Continue on individual failures */
  readonly continueOnError?: boolean;
}

/**
 * Batch forecast result for a single clinic
 */
export interface BatchForecastItem {
  /** Clinic ID */
  readonly clinicId: string;

  /** Forecast output if successful */
  readonly forecast?: GenerateForecastOutput;

  /** Error if failed */
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

/**
 * Batch forecast output
 */
export interface BatchForecastOutput {
  /** Total clinics processed */
  readonly total: number;

  /** Successfully forecasted */
  readonly succeeded: number;

  /** Failed */
  readonly failed: number;

  /** Individual results */
  readonly results: readonly BatchForecastItem[];

  /** Aggregate statistics */
  readonly aggregateStats: {
    /** Total predicted revenue across all clinics */
    readonly totalPredictedRevenue: number;

    /** Average growth rate */
    readonly averageGrowthRate: number;

    /** Clinics with growth */
    readonly growingClinics: number;

    /** Clinics with decline */
    readonly decliningClinics: number;
  };

  /** Processing duration (ms) */
  readonly durationMs: number;
}

/**
 * Forecast summary for dashboard
 */
export interface ForecastDashboardSummary {
  /** Clinic ID */
  readonly clinicId: string;

  /** Current period (month/quarter) */
  readonly currentPeriod: string;

  /** Forecast for next period */
  readonly nextPeriodForecast: number;

  /** Forecast for next 6 months */
  readonly sixMonthForecast: number;

  /** Trend direction */
  readonly trend: RevenueTrend;

  /** Year-over-year growth */
  readonly yoyGrowth: number;

  /** Confidence level */
  readonly confidence: ForecastConfidenceLevel;

  /** Key insights */
  readonly insights: readonly string[];

  /** Last updated */
  readonly lastUpdated: Date;
}

// ============================================================================
// PRIMARY PORT INTERFACE
// ============================================================================

/**
 * PRIMARY PORT: Revenue Forecasting Use Case
 *
 * Defines the contract for ML-powered revenue prediction operations.
 * Driving adapters (REST API, Trigger.dev jobs, CLI) use this port to
 * generate revenue forecasts.
 *
 * @example
 * ```typescript
 * // REST API adapter implementing this port
 * class ForecastController {
 *   constructor(private useCase: RevenueForecastingUseCase) {}
 *
 *   async getForecast(req: FastifyRequest): Promise<FastifyReply> {
 *     const context = this.createSecurityContext(req);
 *     const result = await this.useCase.generateForecast(input, context);
 *
 *     if (isOk(result)) {
 *       return reply.status(200).send(result.value);
 *     }
 *     return reply.status(400).send(result.error.toClientJSON());
 *   }
 * }
 * ```
 */
export interface RevenueForecastingUseCase {
  /**
   * Generate revenue forecast for a clinic
   *
   * Uses ML algorithms to predict future revenue based on historical data.
   * Supports multiple forecasting methods with configurable parameters.
   *
   * @param input - Forecast generation input
   * @param context - Security context for authorization
   * @returns Result with forecast output or domain error
   */
  generateForecast(
    input: GenerateForecastInput,
    context: SecurityContext
  ): Promise<Result<GenerateForecastOutput, DomainError>>;

  /**
   * Generate forecasts for multiple clinics
   *
   * Optimized for batch processing with parallel execution.
   * Individual failures don't fail the entire batch.
   *
   * @param input - Batch forecast input
   * @param context - Security context
   * @returns Result with batch output or domain error
   */
  generateBatchForecast(
    input: BatchForecastInput,
    context: SecurityContext
  ): Promise<Result<BatchForecastOutput, DomainError>>;

  /**
   * Compare forecast to actual revenue
   *
   * Calculates forecast accuracy metrics for model validation
   * and identifies when recalibration is needed.
   *
   * @param input - Comparison input
   * @param context - Security context
   * @returns Result with accuracy analysis or domain error
   */
  compareForecastToActual(
    input: CompareForecastInput,
    context: SecurityContext
  ): Promise<Result<ForecastAccuracyOutput, DomainError>>;

  /**
   * Get forecast summary for dashboard
   *
   * Returns a simplified view of the forecast for display
   * on clinic dashboards with key insights.
   *
   * @param clinicId - Clinic identifier
   * @param context - Security context
   * @returns Result with dashboard summary or domain error
   */
  getForecastSummary(
    clinicId: string,
    context: SecurityContext
  ): Promise<Result<ForecastDashboardSummary, DomainError>>;

  /**
   * Invalidate cached forecast for a clinic
   *
   * Clears any cached forecast data, forcing fresh calculation.
   *
   * @param clinicId - Clinic identifier
   * @param context - Security context
   * @returns Result with success boolean or domain error
   */
  invalidateForecast(
    clinicId: string,
    context: SecurityContext
  ): Promise<Result<boolean, DomainError>>;

  /**
   * Get historical forecast accuracy for a clinic
   *
   * Returns accuracy metrics over time for trend analysis.
   *
   * @param clinicId - Clinic identifier
   * @param months - Number of months to analyze (default: 12)
   * @param context - Security context
   * @returns Result with historical accuracy data or domain error
   */
  getHistoricalAccuracy(
    clinicId: string,
    months: number,
    context: SecurityContext
  ): Promise<
    Result<
      {
        readonly periods: readonly ForecastAccuracyOutput[];
        readonly overallMape: number;
        readonly overallBias: number;
        readonly modelPerformance: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
      },
      DomainError
    >
  >;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for RevenueForecastingUseCase implementation
 */
export interface RevenueForecastingUseCaseConfig {
  /** Default forecasting method */
  readonly defaultMethod?: ForecastMethod;

  /** Default number of forecast periods */
  readonly defaultForecastPeriods?: number;

  /** Default confidence level */
  readonly defaultConfidenceLevel?: number;

  /** Minimum historical data points required */
  readonly minDataPoints?: number;

  /** Cache TTL in seconds */
  readonly cacheTtlSeconds?: number;

  /** Enable seasonal adjustments by default */
  readonly applySeasonalityDefault?: boolean;

  /** Recalibration threshold (MAPE %) */
  readonly recalibrationThreshold?: number;
}
