/**
 * @fileoverview Linear Regression Forecasting Strategy
 *
 * Ordinary Least Squares (OLS) implementation for revenue forecasting.
 * Fits a linear trend line and extrapolates into the future.
 *
 * @module domain/ltv/strategies/linear-regression
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
 * Linear Regression Forecasting Strategy
 *
 * Uses Ordinary Least Squares (OLS) regression to forecast future revenue.
 * Fits a linear trend line (y = intercept + slope * x) to historical data.
 *
 * Characteristics:
 * - Captures linear trends explicitly
 * - Provides statistically grounded confidence intervals
 * - Prediction intervals widen for extrapolation (farther future = more uncertainty)
 * - Best for data with clear, consistent trends
 */
export class LinearRegressionStrategy implements IForecastingStrategy {
  readonly name = 'linear_regression';

  /**
   * Calculate forecast using Ordinary Least Squares regression
   */
  calculate(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): ForecastingStrategyResult {
    const n = revenueValues.length;
    const x = Array.from({ length: n }, (_, i) => i);

    // Calculate regression coefficients using OLS formulas
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = revenueValues.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * (revenueValues[i] ?? 0), 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    // slope = (n * Σxy - Σx * Σy) / (n * Σx² - (Σx)²)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // intercept = (Σy - slope * Σx) / n
    const intercept = (sumY - slope * sumX) / n;

    // Calculate fitted values and residuals
    const fitted = x.map((xi) => intercept + slope * xi);
    const residuals = revenueValues.map((y, i) => y - (fitted[i] ?? 0));

    // Calculate standard error of the estimate
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    const mse = sse / (n - 2); // degrees of freedom = n - 2
    const stdError = Math.sqrt(mse);

    // Values needed for prediction interval calculation
    const meanX = sumX / n;
    const sxx = sumX2 - (sumX * sumX) / n;
    const zScore = getZScore(config.confidenceLevel);

    // Generate forecasts
    const forecasts = generateForecastPoints(historicalData, config, (periodIndex, date) => {
      const xForecast = n + periodIndex;
      const seasonalFactor = config.applySeasonality
        ? getSeasonalFactor(date, config.seasonalFactors)
        : 1.0;

      // Point forecast: intercept + slope * x
      const predicted = (intercept + slope * xForecast) * seasonalFactor;

      // Prediction interval: accounts for both estimation error and prediction uncertainty
      // SE_predict = SE * sqrt(1 + 1/n + (x - x̄)²/Sxx)
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

    const modelFit = calculateModelFit(revenueValues, fitted);

    return { forecasts, modelFit };
  }
}

/**
 * Factory function to create a Linear Regression strategy instance
 */
export function createLinearRegressionStrategy(): LinearRegressionStrategy {
  return new LinearRegressionStrategy();
}
