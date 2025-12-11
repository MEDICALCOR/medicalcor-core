/**
 * @fileoverview Forecasting Strategies Module
 *
 * Exports all forecasting strategy implementations and utilities.
 *
 * @module domain/ltv/strategies
 */

// Interface and shared utilities
export type { IForecastingStrategy, ForecastingStrategyResult } from './forecasting-strategy.js';
export {
  DEFAULT_SEASONAL_FACTORS,
  getZScore,
  getSeasonalFactor,
  calculateModelFit,
  generateForecastPoints,
} from './forecasting-strategy.js';

// Strategy implementations
export { MovingAverageStrategy, createMovingAverageStrategy } from './moving-average.strategy.js';
export {
  ExponentialSmoothingStrategy,
  createExponentialSmoothingStrategy,
} from './exponential-smoothing.strategy.js';
export {
  LinearRegressionStrategy,
  createLinearRegressionStrategy,
} from './linear-regression.strategy.js';
export { ARIMAStrategy, createARIMAStrategy } from './arima.strategy.js';

// ============================================================================
// DEFAULT STRATEGIES
// ============================================================================

import { MovingAverageStrategy } from './moving-average.strategy.js';
import { ExponentialSmoothingStrategy } from './exponential-smoothing.strategy.js';
import { LinearRegressionStrategy } from './linear-regression.strategy.js';
import { ARIMAStrategy } from './arima.strategy.js';
import type { IForecastingStrategy } from './forecasting-strategy.js';

/**
 * Create default set of forecasting strategies
 *
 * Returns the standard ensemble: Moving Average, Exponential Smoothing, Linear Regression
 */
export function createDefaultStrategies(): IForecastingStrategy[] {
  return [
    new MovingAverageStrategy(),
    new ExponentialSmoothingStrategy(),
    new LinearRegressionStrategy(),
  ];
}

/**
 * Strategy registry for runtime lookup by name
 */
export const STRATEGY_REGISTRY: Record<string, () => IForecastingStrategy> = {
  moving_average: () => new MovingAverageStrategy(),
  exponential_smoothing: () => new ExponentialSmoothingStrategy(),
  linear_regression: () => new LinearRegressionStrategy(),
  arima: () => new ARIMAStrategy(),
};

/**
 * Get a strategy by name from the registry
 *
 * @throws Error if strategy name is not found
 */
export function getStrategyByName(name: string): IForecastingStrategy {
  const factory = STRATEGY_REGISTRY[name];
  if (!factory) {
    const available = Object.keys(STRATEGY_REGISTRY).join(', ');
    throw new Error(`Unknown forecasting strategy: ${name}. Available: ${available}`);
  }
  return factory();
}
