/**
 * @fileoverview Revenue Forecasting Service
 *
 * ML-powered prediction of future clinic revenue based on historical payment data.
 * Implements multiple forecasting methods with configurable parameters.
 *
 * @module domain/ltv/revenue-forecasting-service
 *
 * FORECASTING ALGORITHMS:
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
}

/**
 * Default seasonal factors for dental clinics
 */
const DEFAULT_SEASONAL_FACTORS: SeasonalFactors = {
  january: 0.85,
  february: 0.95,
  march: 1.05,
  april: 1.15,
  may: 1.1,
  june: 0.9,
  july: 0.85,
  august: 0.8,
  september: 1.1,
  october: 1.15,
  november: 1.0,
  december: 0.9,
};

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
 * Supports multiple forecasting algorithms with seasonal adjustments.
 */
export class RevenueForecastingService {
  private defaultConfig: ForecastConfig;
  private modelVersion: string;

  constructor(config: RevenueForecastingServiceConfig = {}) {
    this.defaultConfig = {
      ...DEFAULT_CONFIG,
      method: config.defaultMethod ?? DEFAULT_CONFIG.method,
      forecastPeriods: config.defaultForecastPeriods ?? DEFAULT_CONFIG.forecastPeriods,
      confidenceLevel: config.defaultConfidenceLevel ?? DEFAULT_CONFIG.confidenceLevel,
      movingAverageWindow: config.defaultMovingAverageWindow ?? DEFAULT_CONFIG.movingAverageWindow,
      smoothingAlpha: config.defaultSmoothingAlpha ?? DEFAULT_CONFIG.smoothingAlpha,
    };
    this.modelVersion = config.modelVersion ?? '1.0.0';
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

    switch (finalConfig.method) {
      case 'moving_average':
        ({ forecasts, modelFit } = this.movingAverageForecast(
          sortedData,
          revenueValues,
          finalConfig
        ));
        break;
      case 'exponential_smoothing':
        ({ forecasts, modelFit } = this.exponentialSmoothingForecast(
          sortedData,
          revenueValues,
          finalConfig
        ));
        break;
      case 'linear_regression':
        ({ forecasts, modelFit } = this.linearRegressionForecast(
          sortedData,
          revenueValues,
          finalConfig
        ));
        break;
      case 'ensemble':
        ({ forecasts, modelFit } = this.ensembleForecast(sortedData, revenueValues, finalConfig));
        break;
      default: {
        // Exhaustive check - this should never happen
        const _exhaustiveCheck: never = finalConfig.method;
        return _exhaustiveCheck;
      }
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
  // FORECASTING METHODS
  // ============================================================================

  /**
   * Simple Moving Average forecast
   */
  private movingAverageForecast(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): { forecasts: ForecastedRevenuePoint[]; modelFit: ModelFitStatistics } {
    const window = Math.min(config.movingAverageWindow, revenueValues.length);
    const lastN = revenueValues.slice(-window);
    const avg = lastN.reduce((a, b) => a + b, 0) / window;

    // Calculate standard deviation for confidence intervals
    const variance = lastN.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / window;
    const stdDev = Math.sqrt(variance);
    const zScore = this.getZScore(config.confidenceLevel);

    // Generate forecasts
    const forecasts = this.generateForecastPoints(historicalData, config, (periodIndex, date) => {
      const seasonalFactor = config.applySeasonality
        ? this.getSeasonalFactor(date, config.seasonalFactors)
        : 1.0;
      const predicted = avg * seasonalFactor;
      const intervalWidth = zScore * stdDev * Math.sqrt(1 + periodIndex / window) * seasonalFactor;

      return {
        date,
        predicted: Math.round(predicted),
        confidenceInterval: {
          lower: Math.max(0, Math.round(predicted - intervalWidth)),
          upper: Math.round(predicted + intervalWidth),
          level: config.confidenceLevel,
        },
        seasonalFactor,
        highUncertainty: periodIndex >= config.forecastPeriods / 2,
      };
    });

    // Calculate model fit using in-sample predictions
    const modelFit = this.calculateModelFit(revenueValues, this.getMAFitted(revenueValues, window));

    return { forecasts, modelFit };
  }

  /**
   * Exponential Smoothing (Holt's method with trend)
   */
  private exponentialSmoothingForecast(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): { forecasts: ForecastedRevenuePoint[]; modelFit: ModelFitStatistics } {
    const alpha = config.smoothingAlpha;
    const beta = 0.1; // Trend smoothing parameter

    // Initialize with safe defaults
    let level = revenueValues[0] ?? 0;
    let trend = config.includeTrend ? (revenueValues[1] ?? 0) - (revenueValues[0] ?? 0) || 0 : 0;

    const fitted: number[] = [level];

    // Calculate smoothed values
    for (let i = 1; i < revenueValues.length; i++) {
      const prevLevel = level;
      const currentValue = revenueValues[i] ?? 0;
      level = alpha * currentValue + (1 - alpha) * (level + trend);
      if (config.includeTrend) {
        trend = beta * (level - prevLevel) + (1 - beta) * trend;
      }
      fitted.push(level + trend);
    }

    // Calculate residual standard error
    const residuals = revenueValues.map((v, i) => v - (fitted[i] ?? 0));
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    const stdError = Math.sqrt(sse / (revenueValues.length - 2));
    const zScore = this.getZScore(config.confidenceLevel);

    // Generate forecasts
    const forecasts = this.generateForecastPoints(historicalData, config, (periodIndex, date) => {
      const seasonalFactor = config.applySeasonality
        ? this.getSeasonalFactor(date, config.seasonalFactors)
        : 1.0;
      const predicted = (level + trend * (periodIndex + 1)) * seasonalFactor;
      const intervalWidth = zScore * stdError * Math.sqrt(1 + periodIndex * 0.1) * seasonalFactor;

      return {
        date,
        predicted: Math.round(Math.max(0, predicted)),
        confidenceInterval: {
          lower: Math.max(0, Math.round(predicted - intervalWidth)),
          upper: Math.round(predicted + intervalWidth),
          level: config.confidenceLevel,
        },
        seasonalFactor,
        trendComponent: Math.round(trend * (periodIndex + 1)),
        highUncertainty: periodIndex >= config.forecastPeriods / 2,
      };
    });

    const modelFit = this.calculateModelFit(revenueValues, fitted);

    return { forecasts, modelFit };
  }

  /**
   * Linear Regression forecast with trend
   */
  private linearRegressionForecast(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): { forecasts: ForecastedRevenuePoint[]; modelFit: ModelFitStatistics } {
    const n = revenueValues.length;
    const x = Array.from({ length: n }, (_, i) => i);

    // Calculate regression coefficients
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = revenueValues.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * (revenueValues[i] ?? 0), 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate fitted values and residuals
    const fitted = x.map((xi) => intercept + slope * xi);
    const residuals = revenueValues.map((y, i) => y - (fitted[i] ?? 0));
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    const mse = sse / (n - 2);
    const stdError = Math.sqrt(mse);

    // Standard error of prediction
    const meanX = sumX / n;
    const sxx = sumX2 - (sumX * sumX) / n;
    const zScore = this.getZScore(config.confidenceLevel);

    // Generate forecasts
    const forecasts = this.generateForecastPoints(historicalData, config, (periodIndex, date) => {
      const xForecast = n + periodIndex;
      const seasonalFactor = config.applySeasonality
        ? this.getSeasonalFactor(date, config.seasonalFactors)
        : 1.0;

      const predicted = (intercept + slope * xForecast) * seasonalFactor;

      // Prediction interval widens for extrapolation
      const sePredict = stdError * Math.sqrt(1 + 1 / n + Math.pow(xForecast - meanX, 2) / sxx);
      const intervalWidth = zScore * sePredict * seasonalFactor;

      return {
        date,
        predicted: Math.round(Math.max(0, predicted)),
        confidenceInterval: {
          lower: Math.max(0, Math.round(predicted - intervalWidth)),
          upper: Math.round(predicted + intervalWidth),
          level: config.confidenceLevel,
        },
        seasonalFactor,
        trendComponent: Math.round(slope * (periodIndex + 1)),
        highUncertainty: periodIndex >= config.forecastPeriods / 2,
      };
    });

    const modelFit = this.calculateModelFit(revenueValues, fitted);

    return { forecasts, modelFit };
  }

  /**
   * Ensemble forecast combining all methods
   */
  private ensembleForecast(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): { forecasts: ForecastedRevenuePoint[]; modelFit: ModelFitStatistics } {
    // Get forecasts from all methods
    const maForecast = this.movingAverageForecast(historicalData, revenueValues, config);
    const etsForecast = this.exponentialSmoothingForecast(historicalData, revenueValues, config);
    const lrForecast = this.linearRegressionForecast(historicalData, revenueValues, config);

    // Weight methods by their R-squared (model fit)
    const weights = this.calculateEnsembleWeights([
      maForecast.modelFit,
      etsForecast.modelFit,
      lrForecast.modelFit,
    ]);

    // Combine forecasts
    const forecasts: ForecastedRevenuePoint[] = [];
    for (let i = 0; i < config.forecastPeriods; i++) {
      const ma = maForecast.forecasts[i];
      const ets = etsForecast.forecasts[i];
      const lr = lrForecast.forecasts[i];

      // Skip if any forecast is missing
      if (!ma || !ets || !lr) continue;

      const w0 = weights[0] ?? 0.33;
      const w1 = weights[1] ?? 0.33;
      const w2 = weights[2] ?? 0.34;

      const predicted = Math.round(w0 * ma.predicted + w1 * ets.predicted + w2 * lr.predicted);

      const lower = Math.round(
        w0 * ma.confidenceInterval.lower +
          w1 * ets.confidenceInterval.lower +
          w2 * lr.confidenceInterval.lower
      );

      const upper = Math.round(
        w0 * ma.confidenceInterval.upper +
          w1 * ets.confidenceInterval.upper +
          w2 * lr.confidenceInterval.upper
      );

      forecasts.push({
        date: ma.date,
        predicted,
        confidenceInterval: {
          lower: Math.max(0, lower),
          upper,
          level: config.confidenceLevel,
        },
        seasonalFactor: ma.seasonalFactor,
        trendComponent: lr.trendComponent,
        highUncertainty: i >= config.forecastPeriods / 2,
      });
    }

    // Ensemble model fit is weighted average
    const w0 = weights[0] ?? 0.33;
    const w1 = weights[1] ?? 0.33;
    const w2 = weights[2] ?? 0.34;

    const modelFit: ModelFitStatistics = {
      rSquared:
        w0 * maForecast.modelFit.rSquared +
        w1 * etsForecast.modelFit.rSquared +
        w2 * lrForecast.modelFit.rSquared,
      mae:
        w0 * maForecast.modelFit.mae + w1 * etsForecast.modelFit.mae + w2 * lrForecast.modelFit.mae,
      mape:
        w0 * maForecast.modelFit.mape +
        w1 * etsForecast.modelFit.mape +
        w2 * lrForecast.modelFit.mape,
      rmse:
        w0 * maForecast.modelFit.rmse +
        w1 * etsForecast.modelFit.rmse +
        w2 * lrForecast.modelFit.rmse,
      dataPointsUsed: revenueValues.length,
    };

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
   * Generate forecast points for future periods
   */
  private generateForecastPoints(
    historicalData: HistoricalRevenuePoint[],
    config: ForecastConfig,
    calculator: (periodIndex: number, date: Date) => ForecastedRevenuePoint
  ): ForecastedRevenuePoint[] {
    const lastDataPoint = historicalData[historicalData.length - 1];
    const lastDate = lastDataPoint?.date ?? new Date();
    const forecasts: ForecastedRevenuePoint[] = [];

    for (let i = 0; i < config.forecastPeriods; i++) {
      const forecastDate = this.addPeriod(lastDate, i + 1, 'monthly');
      forecasts.push(calculator(i, forecastDate));
    }

    return forecasts;
  }

  /**
   * Add period to date based on granularity
   */
  private addPeriod(date: Date, periods: number, granularity: RevenueForecastGranularity): Date {
    const result = new Date(date);
    switch (granularity) {
      case 'daily':
        result.setDate(result.getDate() + periods);
        break;
      case 'weekly':
        result.setDate(result.getDate() + periods * 7);
        break;
      case 'monthly':
        result.setMonth(result.getMonth() + periods);
        break;
      case 'quarterly':
        result.setMonth(result.getMonth() + periods * 3);
        break;
      default: {
        // Exhaustive check - this should never happen
        const _exhaustiveCheck: never = granularity;
        return _exhaustiveCheck;
      }
    }
    return result;
  }

  /**
   * Get seasonal factor for a given date
   */
  private getSeasonalFactor(date: Date, customFactors?: SeasonalFactors): number {
    const factors = customFactors ?? DEFAULT_SEASONAL_FACTORS;
    const monthNames: (keyof SeasonalFactors)[] = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    const monthKey = monthNames[date.getMonth()];
    return monthKey !== undefined ? factors[monthKey] : 1.0;
  }

  /**
   * Get z-score for confidence level
   */
  private getZScore(confidenceLevel: number): number {
    // Common z-scores
    if (confidenceLevel >= 0.99) return 2.576;
    if (confidenceLevel >= 0.95) return 1.96;
    if (confidenceLevel >= 0.9) return 1.645;
    if (confidenceLevel >= 0.8) return 1.282;
    return 1.0;
  }

  /**
   * Get moving average fitted values
   */
  private getMAFitted(values: number[], window: number): number[] {
    const fitted: number[] = [];
    for (let i = 0; i < values.length; i++) {
      if (i < window - 1) {
        // Use available data for initial values
        const slice = values.slice(0, i + 1);
        fitted.push(slice.reduce((a, b) => a + b, 0) / slice.length);
      } else {
        const slice = values.slice(i - window + 1, i + 1);
        fitted.push(slice.reduce((a, b) => a + b, 0) / window);
      }
    }
    return fitted;
  }

  /**
   * Calculate model fit statistics
   */
  private calculateModelFit(actual: number[], fitted: number[]): ModelFitStatistics {
    const n = actual.length;
    const mean = actual.reduce((a, b) => a + b, 0) / n;

    // Sum of squared errors
    let sse = 0;
    let sst = 0;
    let absoluteErrors = 0;
    let percentageErrors = 0;

    for (let i = 0; i < n; i++) {
      const actualValue = actual[i] ?? 0;
      const fittedValue = fitted[i] ?? 0;
      const residual = actualValue - fittedValue;
      sse += residual * residual;
      sst += Math.pow(actualValue - mean, 2);
      absoluteErrors += Math.abs(residual);
      if (actualValue !== 0) {
        percentageErrors += Math.abs(residual / actualValue);
      }
    }

    const rSquared = sst > 0 ? Math.max(0, 1 - sse / sst) : 0;
    const mae = absoluteErrors / n;
    const mape = (percentageErrors / n) * 100;
    const rmse = Math.sqrt(sse / n);

    return {
      rSquared: Math.round(rSquared * 1000) / 1000,
      mae: Math.round(mae),
      mape: Math.round(mape * 10) / 10,
      rmse: Math.round(rmse),
      dataPointsUsed: n,
      degreesOfFreedom: n - 2,
    };
  }

  /**
   * Calculate ensemble weights based on model fit
   */
  private calculateEnsembleWeights(fits: ModelFitStatistics[]): number[] {
    // Use R-squared as weight indicator
    const rSquaredSum = fits.reduce((sum, f) => sum + Math.max(0.1, f.rSquared), 0);
    return fits.map((f) => Math.max(0.1, f.rSquared) / rSquaredSum);
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
 */
export function createRevenueForecastingService(
  config: RevenueForecastingServiceConfig = {}
): RevenueForecastingService {
  return new RevenueForecastingService(config);
}
