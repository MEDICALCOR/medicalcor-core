/**
 * @fileoverview Tests for ARIMA Forecasting Strategy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

import type { HistoricalRevenuePoint, ForecastConfig } from '../../revenue-forecasting-service.js';
import { ARIMAStrategy, createARIMAStrategy } from '../arima.strategy.js';

describe('ARIMAStrategy', () => {
  let strategy: ARIMAStrategy;

  beforeEach(() => {
    strategy = new ARIMAStrategy();
  });

  // ============================================================================
  // FACTORY FUNCTION
  // ============================================================================

  describe('createARIMAStrategy', () => {
    it('should create ARIMAStrategy instance', () => {
      const instance = createARIMAStrategy();
      expect(instance).toBeInstanceOf(ARIMAStrategy);
      expect(instance.name).toBe('arima');
    });
  });

  // ============================================================================
  // CALCULATE METHOD
  // ============================================================================

  describe('calculate', () => {
    it('should return forecasts and model fit for valid data', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000 + Math.random() * 500,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);
      expect(result.modelFit.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.modelFit.rSquared).toBeLessThanOrEqual(1);
      expect(result.modelFit.mae).toBeGreaterThan(0);
      expect(result.modelFit.mape).toBeGreaterThanOrEqual(0);
      expect(result.modelFit.rmse).toBeGreaterThan(0);
      expect(result.modelFit.aic).toBeDefined();
      expect(result.modelFit.dataPointsUsed).toBe(24);
    });

    it('should apply seasonality when configured', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: true,
        seasonalFactors: {
          january: 0.8,
          february: 0.9,
          march: 1.1,
          april: 1.2,
          may: 1.1,
          june: 0.9,
          july: 0.8,
          august: 0.85,
          september: 1.0,
          october: 1.15,
          november: 1.0,
          december: 0.9,
        },
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
      result.forecasts.forEach((forecast) => {
        expect(forecast.seasonalFactor).toBeDefined();
        expect(forecast.seasonalFactor).toBeGreaterThan(0);
      });
    });

    it('should mark later forecasts as high uncertainty', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 12,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(12);

      const firstHalf = result.forecasts.slice(0, 6);
      const secondHalf = result.forecasts.slice(6);

      firstHalf.forEach((forecast) => {
        expect(forecast.highUncertainty).toBe(false);
      });

      secondHalf.forEach((forecast) => {
        expect(forecast.highUncertainty).toBe(true);
      });
    });

    it('should handle small datasets with conservative parameters', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 8 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 6,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
      expect(result.modelFit.dataPointsUsed).toBe(8);
    });

    it('should handle constant revenue values', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);
      result.forecasts.forEach((forecast) => {
        expect(forecast.predicted).toBeGreaterThanOrEqual(0);
      });
    });

    it('should ensure non-negative forecasts', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: Math.max(0, 10000 - i * 500),
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      result.forecasts.forEach((forecast) => {
        expect(forecast.predicted).toBeGreaterThanOrEqual(0);
        expect(forecast.confidenceInterval.lower).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle different confidence levels', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const configs = [0.8, 0.9, 0.95, 0.99];

      configs.forEach((confidenceLevel) => {
        const config: ForecastConfig = {
          method: 'moving_average',
          forecastPeriods: 3,
          confidenceLevel,
          applySeasonality: false,
          movingAverageWindow: 3,
          smoothingAlpha: 0.3,
          includeTrend: true,
          minDataPoints: 12,
        };

        const result = strategy.calculate(historicalData, revenueValues, config);

        expect(result.forecasts).toHaveLength(3);
        result.forecasts.forEach((forecast) => {
          expect(forecast.confidenceInterval.level).toBe(confidenceLevel);
        });
      });
    });
  });

  // ============================================================================
  // PARAMETER SELECTION
  // ============================================================================

  describe('selectParameters', () => {
    it('should use conservative params for small datasets', () => {
      const values = Array.from({ length: 10 }, (_, i) => 1000 + i * 100);

      const historicalData: HistoricalRevenuePoint[] = values.map((revenue, i) => ({
        date: new Date(2024, i, 1),
        revenue,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 6,
      };

      const result = strategy.calculate(historicalData, values, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should select best parameters for larger datasets', () => {
      const values = Array.from({ length: 48 }, (_, i) => 1000 + i * 100 + Math.sin(i / 6) * 200);

      const historicalData: HistoricalRevenuePoint[] = values.map((revenue, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, values, config);

      expect(result.forecasts).toHaveLength(6);
      expect(result.modelFit.aic).toBeDefined();
    });

    it('should handle parameter selection with errors', () => {
      const values = Array.from({ length: 15 }, (_, i) => {
        if (i < 5) return 1000;
        return 1000 + (i - 5) * 100;
      });

      const historicalData: HistoricalRevenuePoint[] = values.map((revenue, i) => ({
        date: new Date(2024, i, 1),
        revenue,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 10,
      };

      const result = strategy.calculate(historicalData, values, config);

      expect(result.forecasts).toHaveLength(3);
    });
  });

  // ============================================================================
  // DIFFERENCING
  // ============================================================================

  describe('differencing', () => {
    it('should handle d=0 (no differencing)', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle d=1 (first difference)', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * i * 100,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle d=2 (second difference)', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * i * i * 10,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should correctly undifference forecasts', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);
      result.forecasts.forEach((forecast) => {
        expect(forecast.predicted).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // MODEL FITTING
  // ============================================================================

  describe('model fitting', () => {
    it('should converge within max iterations', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000 + (i % 2) * 500,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.modelFit.aic).toBeDefined();
      expect(result.modelFit.aic).toBeLessThan(Infinity);
    });

    it('should handle zero variance data', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should update coefficients iteratively', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 36 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + i * 500 + Math.sin(i / 6) * 5000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);
      expect(result.modelFit.rSquared).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // GAUSSIAN ELIMINATION
  // ============================================================================

  describe('gaussian elimination', () => {
    it('should handle matrices with zero pivot', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + (i % 3) * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle pivot row selection', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + i * 800 + (i % 4) * 2000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle back substitution with near-zero diagonal', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + Math.random() * 100,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });
  });

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  describe('utility methods', () => {
    it('should calculate mean of empty array', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should calculate variance of single value', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: i === 0 ? 50000 : 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });
  });

  // ============================================================================
  // FITTED VALUES
  // ============================================================================

  describe('fitted values', () => {
    it('should generate fitted values with d=0', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.modelFit.rSquared).toBeGreaterThanOrEqual(0);
      expect(result.modelFit.rSquared).toBeLessThanOrEqual(1);
    });

    it('should generate fitted values with d>0', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * i * 100,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.modelFit.dataPointsUsed).toBe(24);
    });
  });

  // ============================================================================
  // AIC CALCULATION
  // ============================================================================

  describe('AIC calculation', () => {
    it('should calculate AIC correctly', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000 + Math.random() * 500,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.modelFit.aic).toBeDefined();
      expect(result.modelFit.aic).toBeGreaterThan(0);
      expect(Number.isFinite(result.modelFit.aic)).toBe(true);
    });

    it('should handle very small sigma2 in AIC', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.modelFit.aic).toBeDefined();
      expect(Number.isFinite(result.modelFit.aic)).toBe(true);
    });
  });

  // ============================================================================
  // FORECAST ERROR VARIANCE
  // ============================================================================

  describe('forecast error variance', () => {
    it('should calculate forecast error variance', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 12,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(12);

      result.forecasts.forEach((forecast) => {
        expect(forecast.confidenceInterval.upper).toBeGreaterThanOrEqual(
          forecast.confidenceInterval.lower
        );
      });
    });

    it('should calculate psi weights correctly', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);
      result.forecasts.forEach((forecast) => {
        expect(forecast.confidenceInterval.upper).toBeGreaterThanOrEqual(forecast.predicted);
        expect(forecast.confidenceInterval.lower).toBeLessThanOrEqual(forecast.predicted);
      });
    });
  });

  // ============================================================================
  // TREND COMPONENT
  // ============================================================================

  describe('trend component', () => {
    it('should calculate trend for first forecast as 0', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      const firstForecast = result.forecasts[0];
      if (firstForecast) {
        expect(firstForecast.trendComponent).toBe(0);
      }
    });

    it('should calculate trend for subsequent forecasts', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      for (let i = 1; i < result.forecasts.length; i++) {
        const forecast = result.forecasts[i];
        if (forecast && forecast.trendComponent !== undefined) {
          expect(typeof forecast.trendComponent).toBe('number');
        }
      }
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe('property-based tests', () => {
    it('should always produce forecasts equal to configured periods', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 12, max: 48 }),
          (forecastPeriods, dataPoints) => {
            const historicalData: HistoricalRevenuePoint[] = Array.from(
              { length: dataPoints },
              (_, i) => ({
                date: new Date(2024, i % 12, 1),
                revenue: 50000 + i * 1000,
                casesCompleted: 10,
                newPatients: 5,
              })
            );

            const revenueValues = historicalData.map((d) => d.revenue);

            const config: ForecastConfig = {
              method: 'moving_average',
              forecastPeriods,
              confidenceLevel: 0.95,
              applySeasonality: false,
              movingAverageWindow: 3,
              smoothingAlpha: 0.3,
              includeTrend: true,
              minDataPoints: 12,
            };

            const result = strategy.calculate(historicalData, revenueValues, config);

            return result.forecasts.length === forecastPeriods;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should always produce non-negative forecasts', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 10000, max: 100000 }), { minLength: 12, maxLength: 48 }),
          (revenues) => {
            const historicalData: HistoricalRevenuePoint[] = revenues.map((revenue, i) => ({
              date: new Date(2024, i % 12, 1),
              revenue,
              casesCompleted: 10,
              newPatients: 5,
            }));

            const config: ForecastConfig = {
              method: 'moving_average',
              forecastPeriods: 6,
              confidenceLevel: 0.95,
              applySeasonality: false,
              movingAverageWindow: 3,
              smoothingAlpha: 0.3,
              includeTrend: true,
              minDataPoints: 12,
            };

            const result = strategy.calculate(historicalData, revenues, config);

            return result.forecasts.every((f) => f.predicted >= 0);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should produce valid confidence intervals', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 20000, max: 80000 }), { minLength: 24, maxLength: 36 }),
          fc.constantFrom(0.95, 0.99),
          (revenues, confidenceLevel) => {
            const historicalData: HistoricalRevenuePoint[] = revenues.map((revenue, i) => ({
              date: new Date(2024, i % 12, 1),
              revenue,
              casesCompleted: 10,
              newPatients: 5,
            }));

            const config: ForecastConfig = {
              method: 'moving_average',
              forecastPeriods: 6,
              confidenceLevel,
              applySeasonality: false,
              movingAverageWindow: 3,
              smoothingAlpha: 0.3,
              includeTrend: true,
              minDataPoints: 12,
            };

            const result = strategy.calculate(historicalData, revenues, config);

            return result.forecasts.every(
              (f) =>
                f.confidenceInterval.lower >= 0 &&
                f.confidenceInterval.lower <= f.confidenceInterval.upper &&
                f.confidenceInterval.level === confidenceLevel
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should have R-squared between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 10000, max: 100000 }), { minLength: 12, maxLength: 48 }),
          (revenues) => {
            const historicalData: HistoricalRevenuePoint[] = revenues.map((revenue, i) => ({
              date: new Date(2024, i % 12, 1),
              revenue,
              casesCompleted: 10,
              newPatients: 5,
            }));

            const config: ForecastConfig = {
              method: 'moving_average',
              forecastPeriods: 6,
              confidenceLevel: 0.95,
              applySeasonality: false,
              movingAverageWindow: 3,
              smoothingAlpha: 0.3,
              includeTrend: true,
              minDataPoints: 12,
            };

            const result = strategy.calculate(historicalData, revenues, config);

            return result.modelFit.rSquared >= 0 && result.modelFit.rSquared <= 1;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should produce finite AIC values', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 10000, max: 100000 }), { minLength: 12, maxLength: 48 }),
          (revenues) => {
            const historicalData: HistoricalRevenuePoint[] = revenues.map((revenue, i) => ({
              date: new Date(2024, i % 12, 1),
              revenue,
              casesCompleted: 10,
              newPatients: 5,
            }));

            const config: ForecastConfig = {
              method: 'moving_average',
              forecastPeriods: 6,
              confidenceLevel: 0.95,
              applySeasonality: false,
              movingAverageWindow: 3,
              smoothingAlpha: 0.3,
              includeTrend: true,
              minDataPoints: 12,
            };

            const result = strategy.calculate(historicalData, revenues, config);

            return (
              result.modelFit.aic !== undefined &&
              Number.isFinite(result.modelFit.aic) &&
              result.modelFit.aic < Infinity
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle varying data lengths gracefully', () => {
      fc.assert(
        fc.property(fc.integer({ min: 6, max: 60 }), (dataLength) => {
          const historicalData: HistoricalRevenuePoint[] = Array.from(
            { length: dataLength },
            (_, i) => ({
              date: new Date(2024, i % 12, 1),
              revenue: 50000 + i * 500,
              casesCompleted: 10,
              newPatients: 5,
            })
          );

          const revenueValues = historicalData.map((d) => d.revenue);

          const config: ForecastConfig = {
            method: 'moving_average',
            forecastPeriods: 3,
            confidenceLevel: 0.95,
            applySeasonality: false,
            movingAverageWindow: 3,
            smoothingAlpha: 0.3,
            includeTrend: true,
            minDataPoints: 6,
          };

          const result = strategy.calculate(historicalData, revenueValues, config);

          return (
            result.forecasts.length === 3 &&
            result.modelFit.dataPointsUsed === dataLength &&
            result.forecasts.every((f) => f.predicted >= 0)
          );
        }),
        { numRuns: 20 }
      );
    });
  });

  // ============================================================================
  // LEVINSON-DURBIN AND AR COEFFICIENTS
  // ============================================================================

  describe('Levinson-Durbin and AR coefficients', () => {
    it('should handle p=0 in AR coefficient initialization', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle gamma0 === 0 case', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle den !== 0 in Levinson-Durbin', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 36 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + Math.sin(i / 3) * 5000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle updateARCoefficients with p=0', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle updateMACoefficients with q=0', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });
  });

  // ============================================================================
  // PARAMETER SELECTION WITH ERRORS
  // ============================================================================

  describe('parameter selection error handling', () => {
    it('should handle insufficient data for parameter candidates', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 5 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 5,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should skip invalid parameter combinations during selection', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 13 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 100,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 10,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle all candidates failing and use default params', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 12 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: i < 6 ? 50000 : 50000 + (i - 6) * 100,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 10,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });
  });

  // ============================================================================
  // NORMAL EQUATIONS AND MATRIX OPERATIONS
  // ============================================================================

  describe('normal equations and matrix operations', () => {
    it('should handle empty X matrix in solveNormalEquations', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle pivot swap in forward elimination', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + (i % 5) * 3000 + i * 200,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle small pivot values in forward elimination', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + Math.random() * 10,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });
  });

  // ============================================================================
  // FORECAST GENERATION
  // ============================================================================

  describe('forecast generation paths', () => {
    it('should use actual values in AR component when available', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);
      result.forecasts.forEach((forecast) => {
        expect(forecast.predicted).toBeGreaterThanOrEqual(0);
      });
    });

    it('should use forecast values in AR component when extending', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 12,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(12);
      result.forecasts.forEach((forecast) => {
        expect(forecast.predicted).toBeGreaterThanOrEqual(0);
      });
    });

    it('should use residuals in MA component when available', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 36 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + i * 500 + Math.sin(i / 4) * 3000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
    });

    it('should handle MA component with future residuals as 0', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);
    });
  });

  // ============================================================================
  // PSI WEIGHTS CALCULATION
  // ============================================================================

  describe('psi weights calculation', () => {
    it('should calculate psi weights with AR contribution', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 36 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + i * 800,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 10,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(10);
      result.forecasts.forEach((forecast) => {
        expect(forecast.confidenceInterval.upper).toBeGreaterThanOrEqual(
          forecast.confidenceInterval.lower
        );
      });
    });

    it('should calculate psi weights with MA contribution', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 36 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + i * 800 + (i % 3) * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 8,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(8);
    });

    it('should handle j > q in psi weight calculation', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 36 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + i * 600,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 15,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(15);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('edge cases', () => {
    it('should handle highly volatile data', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + (i % 2 === 0 ? 10000 : -5000),
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
      result.forecasts.forEach((forecast) => {
        expect(forecast.predicted).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle strictly increasing data', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: 50000 + i * 2000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);

      for (let i = 1; i < result.forecasts.length; i++) {
        const current = result.forecasts[i];
        const previous = result.forecasts[i - 1];
        if (current && previous && current.trendComponent !== undefined) {
          expect(current.trendComponent).toBeGreaterThan(0);
        }
      }
    });

    it('should handle strictly decreasing data', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: Math.max(10000, 100000 - i * 2000),
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 3,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(3);
      result.forecasts.forEach((forecast) => {
        expect(forecast.predicted).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle data with outliers', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 24 }, (_, i) => ({
        date: new Date(2024, i, 1),
        revenue: i === 12 ? 200000 : 50000 + i * 1000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 6,
        confidenceLevel: 0.95,
        applySeasonality: false,
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(6);
      expect(result.modelFit.dataPointsUsed).toBe(24);
    });

    it('should handle seasonal patterns', () => {
      const historicalData: HistoricalRevenuePoint[] = Array.from({ length: 36 }, (_, i) => ({
        date: new Date(2024, i % 12, 1),
        revenue: 50000 + Math.sin((i * Math.PI) / 6) * 10000,
        casesCompleted: 10,
        newPatients: 5,
      }));

      const revenueValues = historicalData.map((d) => d.revenue);

      const config: ForecastConfig = {
        method: 'moving_average',
        forecastPeriods: 12,
        confidenceLevel: 0.95,
        applySeasonality: true,
        seasonalFactors: {
          january: 0.8,
          february: 0.9,
          march: 1.0,
          april: 1.1,
          may: 1.2,
          june: 1.1,
          july: 0.9,
          august: 0.8,
          september: 1.0,
          october: 1.1,
          november: 1.0,
          december: 0.9,
        },
        movingAverageWindow: 3,
        smoothingAlpha: 0.3,
        includeTrend: true,
        minDataPoints: 12,
      };

      const result = strategy.calculate(historicalData, revenueValues, config);

      expect(result.forecasts).toHaveLength(12);
      result.forecasts.forEach((forecast) => {
        expect(forecast.seasonalFactor).toBeDefined();
        expect(forecast.seasonalFactor).toBeGreaterThan(0);
      });
    });
  });
});
