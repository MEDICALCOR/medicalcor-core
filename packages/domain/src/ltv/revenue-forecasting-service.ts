/**
 * @fileoverview Revenue Forecasting Service
 *
 * ML-powered prediction of future clinic revenue based on historical payment data.
 * Implements the Strategy Pattern for extensible forecasting algorithms.
 *
 * @module domain/ltv/revenue-forecasting-service
 *
 * ARCHITECTURE:
 * This service follows the Strategy Pattern, allowing forecasting algorithms
 * to be added or swapped without modifying the service itself (Open/Closed Principle).
 *
 * FORECASTING ALGORITHMS (via strategies):
 * 1. Simple Moving Average (SMA): Averages last N periods
 * 2. Exponential Smoothing (ETS): Holt-Winters with trend
 * 3. Linear Regression: OLS with confidence intervals
 * 4. Ensemble: Weighted combination for robustness
 *
 * SEASONAL ADJUSTMENTS:
 * Dental clinics have predictable seasonal patterns:
 * - Q1: Post-holiday recovery, rising demand
 * - Q2: Peak cosmetic season (pre-summer)
 * - Q3: Summer slowdown (vacations)
 * - Q4: Pre-holiday peak, then December decline
 */

import type {
  RevenueTrend as RevenueTrendType,
  ForecastConfidenceLevel as ForecastConfidenceLevelType,
} from '../shared-kernel/value-objects/revenue-projection.js';

import type { IForecastingStrategy, ForecastingStrategyResult } from './strategies/index.js';
import { createDefaultStrategies, getStrategyByName } from './strategies/index.js';

// ============================================================================
// TYPE ALIASES (Re-export from value objects)
// ============================================================================

/**
 * Forecasting method for revenue prediction
 */
export type RevenueForecastMethod =
  | 'moving_average'
  | 'exponential_smoothing'
  | 'linear_regression'
  | 'ensemble';

/**
 * Time granularity for forecast data
 */
export type RevenueForecastGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly';

// Use types from value objects to avoid duplication
type RevenueTrend = RevenueTrendType;
type ForecastConfidenceLevel = ForecastConfidenceLevelType;

/**
 * Historical revenue data point
 */
export interface HistoricalRevenuePoint {
  date: Date;
  revenue: number;
  casesCompleted: number;
  newPatients: number;
  collectionRate?: number;
  avgCaseValue?: number;
  highValueRevenue?: number;
}

/**
 * Historical revenue input
 */
export interface HistoricalRevenueInput {
  clinicId: string;
  dataPoints: HistoricalRevenuePoint[];
  granularity: RevenueForecastGranularity;
  currency: string;
}

/**
 * Seasonal adjustment factors by month
 */
export interface SeasonalFactors {
  january: number;
  february: number;
  march: number;
  april: number;
  may: number;
  june: number;
  july: number;
  august: number;
  september: number;
  october: number;
  november: number;
  december: number;
}

/**
 * Forecast configuration
 */
export interface ForecastConfig {
  method: RevenueForecastMethod;
  forecastPeriods: number;
  confidenceLevel: number;
  applySeasonality: boolean;
  seasonalFactors?: SeasonalFactors;
  movingAverageWindow: number;
  smoothingAlpha: number;
  includeTrend: boolean;
  minDataPoints: number;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

/**
 * Confidence interval
 */
export interface ForecastConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

/**
 * Single forecasted point
 */
export interface ForecastedRevenuePoint {
  date: Date;
  predicted: number;
  confidenceInterval: ForecastConfidenceInterval;
  seasonalFactor?: number;
  trendComponent?: number;
  highUncertainty: boolean;
}

/**
 * Model fit statistics
 */
export interface ModelFitStatistics {
  rSquared: number;
  mae: number;
  mape: number;
  rmse: number;
  aic?: number;
  dataPointsUsed: number;
  degreesOfFreedom?: number;
}

/**
 * Trend analysis
 */
export interface TrendAnalysis {
  direction: RevenueTrend;
  monthlyGrowthRate: number;
  annualizedGrowthRate: number;
  isSignificant: boolean;
  pValue?: number;
  volatility: number;
}

/**
 * Complete forecast output
 */
export interface RevenueForecastOutput {
  clinicId: string;
  method: RevenueForecastMethod;
  confidenceLevel: ForecastConfidenceLevel;
  forecasts: ForecastedRevenuePoint[];
  totalPredictedRevenue: number;
  totalConfidenceInterval: ForecastConfidenceInterval;
  modelFit: ModelFitStatistics;
  trendAnalysis: TrendAnalysis;
  summary: string;
  recommendedActions: string[];
  modelVersion: string;
  calculatedAt: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Service configuration
 */
export interface RevenueForecastingServiceConfig {
  defaultMethod?: RevenueForecastMethod;
  defaultForecastPeriods?: number;
  defaultConfidenceLevel?: number;
  defaultMovingAverageWindow?: number;
  defaultSmoothingAlpha?: number;
  modelVersion?: string;
  /** Custom strategies to use instead of defaults */
  strategies?: IForecastingStrategy[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ForecastConfig = {
  method: 'ensemble',
  forecastPeriods: 6,
  confidenceLevel: 0.95,
  applySeasonality: true,
  movingAverageWindow: 3,
  smoothingAlpha: 0.3,
  includeTrend: true,
  minDataPoints: 6,
};

// ============================================================================
// REVENUE FORECASTING SERVICE
// ============================================================================

/**
 * Revenue Forecasting Service
 *
 * Predicts future clinic revenue using statistical methods on historical data.
 * Uses the Strategy Pattern for extensible forecasting algorithms.
 *
 * @example
 * ```typescript
 * // Use default strategies
 * const service = createRevenueForecastingService();
 *
 * // Use custom strategies
 * const service = createRevenueForecastingService({
 *   strategies: [new MovingAverageStrategy(), new ARIMAStrategy()]
 * });
 *
 * const result = service.forecast(input, { method: 'ensemble' });
 * ```
 */
export class RevenueForecastingService {
  private defaultConfig: ForecastConfig;
  private modelVersion: string;
  private strategies: Map<string, IForecastingStrategy>;
  private strategyList: IForecastingStrategy[];

  constructor(config: RevenueForecastingServiceConfig = {}) {
    this.defaultConfig = {
      ...DEFAULT_CONFIG,
      method: config.defaultMethod ?? DEFAULT_CONFIG.method,
      forecastPeriods: config.defaultForecastPeriods ?? DEFAULT_CONFIG.forecastPeriods,
      confidenceLevel: config.defaultConfidenceLevel ?? DEFAULT_CONFIG.confidenceLevel,
      movingAverageWindow: config.defaultMovingAverageWindow ?? DEFAULT_CONFIG.movingAverageWindow,
      smoothingAlpha: config.defaultSmoothingAlpha ?? DEFAULT_CONFIG.smoothingAlpha,
    };
    this.modelVersion = config.modelVersion ?? '2.0.0';

    // Initialize strategies (use provided or create defaults)
    this.strategyList = config.strategies ?? createDefaultStrategies();
    this.strategies = new Map(this.strategyList.map((s) => [s.name, s]));
  }

  /**
   * Generate revenue forecast
   */
  public forecast(
    input: HistoricalRevenueInput,
    config?: Partial<ForecastConfig>
  ): RevenueForecastOutput {
    const finalConfig = { ...this.defaultConfig, ...config };

    // Validate input
    this.validateInput(input, finalConfig);

    // Sort data chronologically
    const sortedData = [...input.dataPoints].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Extract revenue values
    const revenueValues = sortedData.map((p) => p.revenue);

    // Calculate forecast based on method
    let forecasts: ForecastedRevenuePoint[];
    let modelFit: ModelFitStatistics;

    if (finalConfig.method === 'ensemble') {
      // Use all available strategies for ensemble
      ({ forecasts, modelFit } = this.ensembleForecast(sortedData, revenueValues, finalConfig));
    } else {
      // Use specific strategy
      const strategy = this.getStrategy(finalConfig.method);
      ({ forecasts, modelFit } = strategy.calculate(sortedData, revenueValues, finalConfig));
    }

    // Calculate trend analysis
    const trendAnalysis = this.analyzeTrend(revenueValues);

    // Calculate totals
    const totalPredictedRevenue = forecasts.reduce((sum, f) => sum + f.predicted, 0);
    const totalConfidenceInterval = this.calculateTotalConfidenceInterval(
      forecasts,
      finalConfig.confidenceLevel
    );

    // Determine confidence level
    const confidenceLevel = this.determineConfidenceLevel(modelFit, sortedData.length);

    // Generate summary and actions
    const summary = this.generateSummary(
      totalPredictedRevenue,
      trendAnalysis,
      confidenceLevel,
      finalConfig.forecastPeriods
    );
    const recommendedActions = this.generateRecommendedActions(
      trendAnalysis,
      confidenceLevel,
      totalPredictedRevenue
    );

    return {
      clinicId: input.clinicId,
      method: finalConfig.method,
      confidenceLevel,
      forecasts,
      totalPredictedRevenue: Math.round(totalPredictedRevenue),
      totalConfidenceInterval,
      modelFit,
      trendAnalysis,
      summary,
      recommendedActions,
      modelVersion: this.modelVersion,
      calculatedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // STRATEGY MANAGEMENT
  // ============================================================================

  /**
   * Get a strategy by name
   */
  private getStrategy(name: string): IForecastingStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      // Try to get from global registry as fallback
      return getStrategyByName(name);
    }
    return strategy;
  }

  /**
   * Add a new strategy to the service
   */
  public addStrategy(strategy: IForecastingStrategy): void {
    this.strategies.set(strategy.name, strategy);
    this.strategyList.push(strategy);
  }

  /**
   * Get list of available strategy names
   */
  public getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  // ============================================================================
  // ENSEMBLE FORECASTING (Strategy-Agnostic)
  // ============================================================================

  /**
   * Ensemble forecast combining all available strategies
   *
   * Combines forecasts from all registered strategies using weights
   * based on each method's R-squared model fit.
   *
   * This method is now fully extensible - adding a new strategy
   * automatically includes it in the ensemble without code changes.
   */
  private ensembleForecast(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): ForecastingStrategyResult {
    // Run ALL registered strategies dynamically
    const results = this.strategyList.map((strategy) => ({
      name: strategy.name,
      result: strategy.calculate(historicalData, revenueValues, config),
    }));

    // Calculate weights based on R-squared (higher R² = higher weight)
    const weights = this.calculateEnsembleWeights(results.map((r) => r.result.modelFit));

    // Combine forecasts for each period
    const forecasts: ForecastedRevenuePoint[] = [];
    for (let i = 0; i < config.forecastPeriods; i++) {
      const periodForecasts = results.map((r) => r.result.forecasts[i]);

      // Skip if any forecast is missing
      if (periodForecasts.some((f) => !f)) continue;

      forecasts.push(
        this.combineEnsembleForecastPoint(
          periodForecasts as ForecastedRevenuePoint[],
          weights,
          results.map((r) => r.name),
          config,
          i
        )
      );
    }

    // Combine model fit statistics
    const modelFit = this.combineEnsembleModelFit(
      results.map((r) => r.result.modelFit),
      weights,
      revenueValues.length
    );

    return { forecasts, modelFit };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Validate input data
   */
  private validateInput(input: HistoricalRevenueInput, config: ForecastConfig): void {
    if (input.dataPoints.length < config.minDataPoints) {
      throw new InsufficientDataError(
        `Minimum ${config.minDataPoints} data points required, got ${input.dataPoints.length}`
      );
    }

    if (input.dataPoints.some((p) => p.revenue < 0)) {
      throw new InvalidRevenueDataError('Revenue values cannot be negative');
    }
  }

  /**
   * Calculate ensemble weights based on model fit
   */
  private calculateEnsembleWeights(fits: ModelFitStatistics[]): number[] {
    // Use R-squared as weight indicator (minimum 0.1 to avoid zero weights)
    const rSquaredSum = fits.reduce((sum, f) => sum + Math.max(0.1, f.rSquared), 0);
    return fits.map((f) => Math.max(0.1, f.rSquared) / rSquaredSum);
  }

  /**
   * Calculate weighted average of values
   */
  private weightedAverage(values: number[], weights: number[]): number {
    return values.reduce((sum, value, i) => sum + value * (weights[i] ?? 0), 0);
  }

  /**
   * Combine model fit statistics from multiple forecasts using weighted average
   */
  private combineEnsembleModelFit(
    fits: ModelFitStatistics[],
    weights: number[],
    dataPointsUsed: number
  ): ModelFitStatistics {
    return {
      rSquared: this.weightedAverage(
        fits.map((f) => f.rSquared),
        weights
      ),
      mae: this.weightedAverage(
        fits.map((f) => f.mae),
        weights
      ),
      mape: this.weightedAverage(
        fits.map((f) => f.mape),
        weights
      ),
      rmse: this.weightedAverage(
        fits.map((f) => f.rmse),
        weights
      ),
      dataPointsUsed,
    };
  }

  /**
   * Combine individual forecast points into a single ensemble forecast point
   *
   * Strategy-agnostic: uses strategy names to find seasonal/trend components
   * instead of hardcoded array indices.
   */
  private combineEnsembleForecastPoint(
    forecastPoints: ForecastedRevenuePoint[],
    weights: number[],
    strategyNames: string[],
    config: ForecastConfig,
    periodIndex: number
  ): ForecastedRevenuePoint {
    const predicted = Math.round(
      this.weightedAverage(
        forecastPoints.map((f) => f.predicted),
        weights
      )
    );

    const lower = Math.round(
      this.weightedAverage(
        forecastPoints.map((f) => f.confidenceInterval.lower),
        weights
      )
    );

    const upper = Math.round(
      this.weightedAverage(
        forecastPoints.map((f) => f.confidenceInterval.upper),
        weights
      )
    );

    // Find seasonal factor from moving_average strategy (if available)
    const maIndex = strategyNames.indexOf('moving_average');
    const seasonalFactor =
      maIndex >= 0 ? forecastPoints[maIndex]?.seasonalFactor : forecastPoints[0]?.seasonalFactor;

    // Find trend component from linear_regression strategy (if available)
    const lrIndex = strategyNames.indexOf('linear_regression');
    const trendComponent =
      lrIndex >= 0 ? forecastPoints[lrIndex]?.trendComponent : forecastPoints[0]?.trendComponent;

    return {
      date: forecastPoints[0]?.date ?? new Date(),
      predicted,
      confidenceInterval: {
        lower: Math.max(0, lower),
        upper,
        level: config.confidenceLevel,
      },
      seasonalFactor,
      trendComponent,
      highUncertainty: periodIndex >= config.forecastPeriods / 2,
    };
  }

  /**
   * Analyze revenue trend
   */
  private analyzeTrend(values: number[]): TrendAnalysis {
    const n = values.length;
    if (n < 2) {
      return {
        direction: 'STABLE',
        monthlyGrowthRate: 0,
        annualizedGrowthRate: 0,
        isSignificant: false,
        volatility: 0,
      };
    }

    // Calculate linear trend
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * (values[i] ?? 0), 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const meanY = sumY / n;

    // Monthly growth rate
    const monthlyGrowthRate = meanY > 0 ? (slope / meanY) * 100 : 0;
    const annualizedGrowthRate = Math.pow(1 + monthlyGrowthRate / 100, 12) * 100 - 100;

    // Calculate volatility (coefficient of variation)
    const variance = values.reduce((sum, v) => sum + Math.pow(v - meanY, 2), 0) / n;
    const volatility = meanY > 0 ? (Math.sqrt(variance) / meanY) * 100 : 0;

    // Determine direction
    let direction: RevenueTrend;
    if (volatility > 30) {
      direction = 'VOLATILE';
    } else if (monthlyGrowthRate > 2) {
      direction = 'GROWING';
    } else if (monthlyGrowthRate < -2) {
      direction = 'DECLINING';
    } else {
      direction = 'STABLE';
    }

    // Statistical significance (simplified t-test)
    const isSignificant = Math.abs(monthlyGrowthRate) > volatility / Math.sqrt(n);

    return {
      direction,
      monthlyGrowthRate: Math.round(monthlyGrowthRate * 10) / 10,
      annualizedGrowthRate: Math.round(annualizedGrowthRate * 10) / 10,
      isSignificant,
      volatility: Math.round(volatility * 10) / 10,
    };
  }

  /**
   * Calculate total confidence interval
   */
  private calculateTotalConfidenceInterval(
    forecasts: ForecastedRevenuePoint[],
    level: number
  ): ForecastConfidenceInterval {
    // Sum of independent intervals (simplified)
    const totalLower = forecasts.reduce((sum, f) => sum + f.confidenceInterval.lower, 0);
    const totalUpper = forecasts.reduce((sum, f) => sum + f.confidenceInterval.upper, 0);

    return {
      lower: Math.round(totalLower),
      upper: Math.round(totalUpper),
      level,
    };
  }

  /**
   * Determine confidence level classification
   */
  private determineConfidenceLevel(
    modelFit: ModelFitStatistics,
    dataPoints: number
  ): ForecastConfidenceLevel {
    if (modelFit.rSquared >= 0.8 && dataPoints >= 12) {
      return 'HIGH';
    }
    if (modelFit.rSquared >= 0.6 && dataPoints >= 6) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(
    totalRevenue: number,
    trend: TrendAnalysis,
    confidence: ForecastConfidenceLevel,
    periods: number
  ): string {
    const trendText = {
      GROWING: 'showing growth',
      STABLE: 'remaining stable',
      DECLINING: 'experiencing decline',
      VOLATILE: 'highly variable',
    }[trend.direction];

    const confidenceText = {
      HIGH: 'high confidence',
      MEDIUM: 'moderate confidence',
      LOW: 'low confidence (limited data)',
    }[confidence];

    return `Forecasted revenue of €${totalRevenue.toLocaleString()} over ${periods} months, ${trendText} at ${Math.abs(trend.annualizedGrowthRate).toFixed(1)}% annually. Prediction made with ${confidenceText}.`;
  }

  /**
   * Generate recommended actions based on forecast
   */
  private generateRecommendedActions(
    trend: TrendAnalysis,
    confidence: ForecastConfidenceLevel,
    totalRevenue: number
  ): string[] {
    const actions: string[] = [];

    // Trend-based actions
    switch (trend.direction) {
      case 'GROWING':
        actions.push('maintain_current_strategies');
        actions.push('invest_in_capacity_expansion');
        if (trend.annualizedGrowthRate > 20) {
          actions.push('hire_additional_staff');
        }
        break;
      case 'DECLINING':
        actions.push('review_marketing_effectiveness');
        actions.push('analyze_patient_retention');
        actions.push('consider_promotional_campaigns');
        if (trend.annualizedGrowthRate < -15) {
          actions.push('urgent_revenue_recovery_plan');
        }
        break;
      case 'STABLE':
        actions.push('optimize_operational_efficiency');
        actions.push('explore_new_service_offerings');
        break;
      case 'VOLATILE':
        actions.push('stabilize_revenue_streams');
        actions.push('diversify_patient_base');
        actions.push('implement_recurring_revenue_programs');
        break;
      default: {
        // Exhaustive check - this should never happen
        const _exhaustiveCheck: never = trend.direction;
        void _exhaustiveCheck;
      }
    }

    // Confidence-based actions
    if (confidence === 'LOW') {
      actions.push('improve_data_collection');
      actions.push('track_more_revenue_metrics');
    }

    // Revenue-based actions
    if (totalRevenue > 500000) {
      actions.push('consider_financial_planning_review');
    }

    return actions;
  }

  /**
   * Get model version
   */
  public getModelVersion(): string {
    return this.modelVersion;
  }
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Error thrown when insufficient data is provided
 */
export class InsufficientDataError extends Error {
  public readonly code = 'INSUFFICIENT_DATA' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InsufficientDataError';
    Object.setPrototypeOf(this, InsufficientDataError.prototype);
  }
}

/**
 * Error thrown when revenue data is invalid
 */
export class InvalidRevenueDataError extends Error {
  public readonly code = 'INVALID_REVENUE_DATA' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidRevenueDataError';
    Object.setPrototypeOf(this, InvalidRevenueDataError.prototype);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a revenue forecasting service instance
 *
 * @example
 * ```typescript
 * // Default strategies (MA, ES, LR)
 * const service = createRevenueForecastingService();
 *
 * // Custom strategies
 * const service = createRevenueForecastingService({
 *   strategies: [
 *     new MovingAverageStrategy(),
 *     new ARIMAStrategy(),
 *     new ProphetStrategy(),
 *   ]
 * });
 * ```
 */
export function createRevenueForecastingService(
  config: RevenueForecastingServiceConfig = {}
): RevenueForecastingService {
  return new RevenueForecastingService(config);
}
