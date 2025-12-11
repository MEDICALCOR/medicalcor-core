/**
 * @fileoverview Moving Average Forecasting Strategy
 *
 * Simple Moving Average (SMA) implementation for revenue forecasting.
 * Averages the last N periods to predict future values.
 *
 * @module domain/ltv/strategies/moving-average
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
 * Moving Average Forecasting Strategy
 *
 * Uses Simple Moving Average (SMA) to forecast future revenue.
 * Best suited for stable, non-trending data with low volatility.
 *
 * Characteristics:
 * - Smooths out short-term fluctuations
 * - Lags behind trends (reactive, not predictive)
 * - Window size affects responsiveness vs stability trade-off
 */
export class MovingAverageStrategy implements IForecastingStrategy {
  readonly name = 'moving_average';

  /**
   * Calculate forecast using Simple Moving Average
   */
  calculate(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): ForecastingStrategyResult {
    const window = Math.min(config.movingAverageWindow, revenueValues.length);
    const lastN = revenueValues.slice(-window);
    const avg = lastN.reduce((a, b) => a + b, 0) / window;

    // Calculate standard deviation for confidence intervals
    const variance = lastN.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / window;
    const stdDev = Math.sqrt(variance);
    const zScore = getZScore(config.confidenceLevel);

    // Generate forecasts
    const forecasts = generateForecastPoints(historicalData, config, (periodIndex, date) => {
      const seasonalFactor = config.applySeasonality
        ? getSeasonalFactor(date, config.seasonalFactors)
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
    const modelFit = calculateModelFit(revenueValues, this.getMAFitted(revenueValues, window));

    return { forecasts, modelFit };
  }

  /**
   * Get moving average fitted values for model fit calculation
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
}

/**
 * Factory function to create a Moving Average strategy instance
 */
export function createMovingAverageStrategy(): MovingAverageStrategy {
  return new MovingAverageStrategy();
}
