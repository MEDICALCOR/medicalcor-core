/**
 * @fileoverview Forecasting Strategy Interface
 *
 * Defines the contract for forecasting algorithms following the Strategy Pattern.
 * This enables adding new forecasting methods without modifying the ensemble service.
 *
 * @module domain/ltv/strategies/forecasting-strategy
 */

import type {
  HistoricalRevenuePoint,
  ForecastedRevenuePoint,
  ForecastConfig,
  ModelFitStatistics,
  SeasonalFactors,
} from '../revenue-forecasting-service.js';

// ============================================================================
// STRATEGY RESULT TYPE
// ============================================================================

/**
 * Result from a forecasting strategy calculation
 */
export interface ForecastingStrategyResult {
  forecasts: ForecastedRevenuePoint[];
  modelFit: ModelFitStatistics;
}

// ============================================================================
// STRATEGY INTERFACE
// ============================================================================

/**
 * Forecasting Strategy Interface
 *
 * Contract for all forecasting algorithms. Implementations must provide:
 * - A unique name identifier
 * - A calculate method that produces forecasts and model fit statistics
 *
 * @example
 * ```typescript
 * class ARIMAStrategy implements IForecastingStrategy {
 *   readonly name = 'arima';
 *
 *   calculate(data, revenueValues, config) {
 *     // ARIMA-specific implementation
 *     return { forecasts, modelFit };
 *   }
 * }
 * ```
 */
export interface IForecastingStrategy {
  /**
   * Unique identifier for this forecasting method
   */
  readonly name: string;

  /**
   * Calculate forecast using this strategy's algorithm
   *
   * @param historicalData - Historical revenue data points with metadata
   * @param revenueValues - Extracted revenue values array for calculations
   * @param config - Forecast configuration parameters
   * @returns Forecasted points and model fit statistics
   */
  calculate(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): ForecastingStrategyResult;
}

// ============================================================================
// SHARED HELPER UTILITIES
// ============================================================================

/**
 * Default seasonal factors for dental clinics
 */
export const DEFAULT_SEASONAL_FACTORS: SeasonalFactors = {
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
 * Get z-score for confidence level
 */
export function getZScore(confidenceLevel: number): number {
  if (confidenceLevel >= 0.99) return 2.576;
  if (confidenceLevel >= 0.95) return 1.96;
  if (confidenceLevel >= 0.9) return 1.645;
  if (confidenceLevel >= 0.8) return 1.282;
  return 1.0;
}

/**
 * Get seasonal factor for a given date
 */
export function getSeasonalFactor(date: Date, customFactors?: SeasonalFactors): number {
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
 * Calculate model fit statistics from actual vs fitted values
 */
export function calculateModelFit(actual: number[], fitted: number[]): ModelFitStatistics {
  const n = actual.length;
  const mean = actual.reduce((a, b) => a + b, 0) / n;

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
 * Generate forecast points for future periods
 */
export function generateForecastPoints(
  historicalData: HistoricalRevenuePoint[],
  config: ForecastConfig,
  calculator: (periodIndex: number, date: Date) => ForecastedRevenuePoint
): ForecastedRevenuePoint[] {
  const lastDataPoint = historicalData[historicalData.length - 1];
  const lastDate = lastDataPoint?.date ?? new Date();
  const forecasts: ForecastedRevenuePoint[] = [];

  for (let i = 0; i < config.forecastPeriods; i++) {
    const forecastDate = addPeriod(lastDate, i + 1, 'monthly');
    forecasts.push(calculator(i, forecastDate));
  }

  return forecasts;
}

/**
 * Add period to date based on granularity
 */
function addPeriod(
  date: Date,
  periods: number,
  granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly'
): Date {
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
      const _exhaustiveCheck: never = granularity;
      return _exhaustiveCheck;
    }
  }
  return result;
}
