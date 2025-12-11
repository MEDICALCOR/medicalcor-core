/**
 * @fileoverview Exponential Smoothing Forecasting Strategy
 *
 * Holt's method implementation with trend component for revenue forecasting.
 * Gives more weight to recent observations while accounting for trends.
 *
 * @module domain/ltv/strategies/exponential-smoothing
 */

import type { HistoricalRevenuePoint, ForecastConfig } from '../revenue-forecasting-service.js';

import type { IForecastingStrategy, ForecastingStrategyResult } from './forecasting-strategy.js';
import {
  getZScore,
  getSeasonalFactor,
  calculateModelFit,
  generateForecastPoints,
} from './forecasting-strategy.js';

/**
 * Exponential Smoothing Forecasting Strategy
 *
 * Uses Holt's method (double exponential smoothing) to forecast future revenue.
 * Captures both level and trend components for more accurate predictions.
 *
 * Characteristics:
 * - Weights recent data more heavily (controlled by alpha)
 * - Captures linear trends (controlled by beta)
 * - Adapts quickly to changes in the data
 * - Good for data with trends but no strong seasonality
 */
export class ExponentialSmoothingStrategy implements IForecastingStrategy {
  readonly name = 'exponential_smoothing';

  /**
   * Trend smoothing parameter (beta)
   * Lower values = smoother trend, higher values = more responsive
   */
  private readonly beta = 0.1;

  /**
   * Calculate forecast using Holt's Exponential Smoothing
   */
  calculate(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): ForecastingStrategyResult {
    const alpha = config.smoothingAlpha;

    // Initialize with safe defaults
    let level = revenueValues[0] ?? 0;
    let trend = config.includeTrend ? (revenueValues[1] ?? 0) - (revenueValues[0] ?? 0) || 0 : 0;

    const fitted: number[] = [level];

    // Calculate smoothed values using Holt's method
    for (let i = 1; i < revenueValues.length; i++) {
      const prevLevel = level;
      const currentValue = revenueValues[i] ?? 0;

      // Update level: weighted average of current observation and previous forecast
      level = alpha * currentValue + (1 - alpha) * (level + trend);

      // Update trend: weighted average of current trend and previous trend
      if (config.includeTrend) {
        trend = this.beta * (level - prevLevel) + (1 - this.beta) * trend;
      }

      fitted.push(level + trend);
    }

    // Calculate residual standard error for confidence intervals
    const residuals = revenueValues.map((v, i) => v - (fitted[i] ?? 0));
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    const stdError = Math.sqrt(sse / (revenueValues.length - 2));
    const zScore = getZScore(config.confidenceLevel);

    // Generate forecasts
    const forecasts = generateForecastPoints(historicalData, config, (periodIndex, date) => {
      const seasonalFactor = config.applySeasonality
        ? getSeasonalFactor(date, config.seasonalFactors)
        : 1.0;

      // Forecast = level + trend * periods ahead
      const predicted = (level + trend * (periodIndex + 1)) * seasonalFactor;

      // Confidence interval widens with forecast horizon
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

    const modelFit = calculateModelFit(revenueValues, fitted);

    return { forecasts, modelFit };
  }
}

/**
 * Factory function to create an Exponential Smoothing strategy instance
 */
export function createExponentialSmoothingStrategy(): ExponentialSmoothingStrategy {
  return new ExponentialSmoothingStrategy();
}
