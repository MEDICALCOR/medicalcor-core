/**
 * @fileoverview ARIMA Forecasting Strategy
 *
 * AutoRegressive Integrated Moving Average (ARIMA) implementation for revenue forecasting.
 * Combines autoregression, differencing, and moving average components for sophisticated
 * time series prediction.
 *
 * ARIMA(p, d, q) where:
 * - p: Order of autoregressive (AR) component
 * - d: Degree of differencing (I) for stationarity
 * - q: Order of moving average (MA) component
 *
 * @module domain/ltv/strategies/arima
 */

import type { HistoricalRevenuePoint, ForecastConfig } from '../revenue-forecasting-service.js';

import type { IForecastingStrategy, ForecastingStrategyResult } from './forecasting-strategy.js';
import {
  getZScore,
  getSeasonalFactor,
  calculateModelFit,
  generateForecastPoints,
} from './forecasting-strategy.js';

// ============================================================================
// ARIMA CONFIGURATION
// ============================================================================

/**
 * ARIMA model parameters
 */
interface ARIMAParams {
  /** Order of autoregressive component (p) */
  p: number;
  /** Degree of differencing (d) */
  d: number;
  /** Order of moving average component (q) */
  q: number;
}

/**
 * Fitted ARIMA model coefficients
 */
interface ARIMACoefficients {
  /** AR coefficients (φ₁, φ₂, ..., φₚ) */
  ar: number[];
  /** MA coefficients (θ₁, θ₂, ..., θₐ) */
  ma: number[];
  /** Constant/intercept term */
  constant: number;
  /** Estimated residual variance */
  sigma2: number;
}

// ============================================================================
// ARIMA STRATEGY
// ============================================================================

/**
 * ARIMA Forecasting Strategy
 *
 * Implements AutoRegressive Integrated Moving Average model for time series forecasting.
 * Uses automatic parameter selection via AIC minimization when not specified.
 *
 * Characteristics:
 * - Captures both trend and autocorrelation patterns
 * - Handles non-stationary data through differencing
 * - Accounts for past forecast errors (MA component)
 * - More sophisticated than simple methods, better for complex patterns
 *
 * @example
 * ```typescript
 * const arima = new ARIMAStrategy();
 * const result = arima.calculate(historicalData, revenueValues, config);
 * ```
 */
export class ARIMAStrategy implements IForecastingStrategy {
  readonly name = 'arima';

  /** Default ARIMA parameters - ARIMA(2,1,2) works well for most business data */
  private readonly defaultParams: ARIMAParams = { p: 2, d: 1, q: 2 };

  /** Maximum iterations for coefficient optimization */
  private readonly maxIterations = 100;

  /** Convergence tolerance */
  private readonly tolerance = 1e-6;

  /**
   * Calculate forecast using ARIMA model
   */
  calculate(
    historicalData: HistoricalRevenuePoint[],
    revenueValues: number[],
    config: ForecastConfig
  ): ForecastingStrategyResult {
    // Select optimal parameters or use defaults
    const params = this.selectParameters(revenueValues);

    // Apply differencing to achieve stationarity
    const { differenced, originalLast } = this.difference(revenueValues, params.d);

    // Fit ARIMA model coefficients
    const coefficients = this.fitModel(differenced, params);

    // Generate in-sample fitted values for model fit calculation
    const fitted = this.getFittedValues(revenueValues, differenced, params, coefficients);

    // Calculate residuals and standard error
    const residuals = this.calculateResiduals(differenced, params, coefficients);
    const stdError = Math.sqrt(coefficients.sigma2);
    const zScore = getZScore(config.confidenceLevel);

    // Generate forecasts
    const forecasts = this.generateARIMAForecasts(
      historicalData,
      revenueValues,
      differenced,
      residuals,
      params,
      coefficients,
      originalLast,
      stdError,
      zScore,
      config
    );

    // Calculate model fit statistics
    const modelFit = calculateModelFit(revenueValues, fitted);

    // Add AIC to model fit for ARIMA-specific diagnostics
    const aic = this.calculateAIC(revenueValues.length, params, coefficients.sigma2);
    modelFit.aic = aic;

    return { forecasts, modelFit };
  }

  // ============================================================================
  // PARAMETER SELECTION
  // ============================================================================

  /**
   * Select optimal ARIMA parameters using grid search with AIC
   *
   * Tests common parameter combinations and selects the one with lowest AIC.
   * Constrained to reasonable ranges to avoid overfitting.
   */
  private selectParameters(values: number[]): ARIMAParams {
    // For small datasets, use conservative defaults
    if (values.length < 12) {
      return { p: 1, d: 1, q: 1 };
    }

    const candidates: ARIMAParams[] = [
      { p: 1, d: 1, q: 1 },
      { p: 2, d: 1, q: 1 },
      { p: 1, d: 1, q: 2 },
      { p: 2, d: 1, q: 2 },
      { p: 1, d: 0, q: 1 },
      { p: 2, d: 0, q: 2 },
    ];

    let bestParams = this.defaultParams;
    let bestAIC = Infinity;

    for (const params of candidates) {
      try {
        const { differenced } = this.difference(values, params.d);
        if (differenced.length < params.p + params.q + 2) continue;

        const coefficients = this.fitModel(differenced, params);
        const aic = this.calculateAIC(values.length, params, coefficients.sigma2);

        if (aic < bestAIC) {
          bestAIC = aic;
          bestParams = params;
        }
      } catch {
        // Skip invalid parameter combinations
        continue;
      }
    }

    return bestParams;
  }

  // ============================================================================
  // DIFFERENCING (I COMPONENT)
  // ============================================================================

  /**
   * Apply differencing to make series stationary
   *
   * @param values - Original time series
   * @param d - Degree of differencing
   * @returns Differenced series and last original values for reconstruction
   */
  private difference(
    values: number[],
    d: number
  ): { differenced: number[]; originalLast: number[] } {
    let current = [...values];
    const originalLast: number[] = [];

    for (let i = 0; i < d; i++) {
      originalLast.push(current[current.length - 1] ?? 0);
      const diff: number[] = [];
      for (let j = 1; j < current.length; j++) {
        diff.push((current[j] ?? 0) - (current[j - 1] ?? 0));
      }
      current = diff;
    }

    return { differenced: current, originalLast };
  }

  /**
   * Reverse differencing to get back to original scale
   */
  private undifference(forecasts: number[], originalLast: number[], d: number): number[] {
    let current = [...forecasts];

    for (let i = d - 1; i >= 0; i--) {
      const undiff: number[] = [];
      let lastValue = originalLast[i] ?? 0;

      for (const diff of current) {
        lastValue = lastValue + diff;
        undiff.push(lastValue);
      }
      current = undiff;
    }

    return current;
  }

  // ============================================================================
  // MODEL FITTING
  // ============================================================================

  /**
   * Fit ARIMA model coefficients using conditional least squares
   *
   * Estimates AR and MA coefficients that minimize sum of squared residuals.
   */
  private fitModel(differenced: number[], params: ARIMAParams): ARIMACoefficients {
    const { p, q } = params;

    // Initialize coefficients
    let ar = this.initializeARCoefficients(differenced, p);
    let ma: number[] = Array.from({ length: q }, () => 0.1);
    let constant = this.mean(differenced);

    // Iterative refinement using conditional least squares
    let prevSigma2 = Infinity;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      // Calculate residuals with current coefficients
      const residuals = this.calculateResiduals(differenced, params, {
        ar,
        ma,
        constant,
        sigma2: 0,
      });

      // Update AR coefficients using Yule-Walker equations
      ar = this.updateARCoefficients(differenced, residuals, p, constant);

      // Update MA coefficients using gradient descent
      ma = this.updateMACoefficients(differenced, residuals, ar, ma, q, constant);

      // Update constant
      constant = this.updateConstant(differenced, ar, ma, residuals);

      // Calculate residual variance
      const sigma2 = this.variance(residuals);

      // Check convergence
      if (Math.abs(sigma2 - prevSigma2) < this.tolerance) {
        return { ar, ma, constant, sigma2 };
      }
      prevSigma2 = sigma2;
    }

    const finalResiduals = this.calculateResiduals(differenced, params, {
      ar,
      ma,
      constant,
      sigma2: 0,
    });

    return {
      ar,
      ma,
      constant,
      sigma2: this.variance(finalResiduals),
    };
  }

  /**
   * Initialize AR coefficients using Yule-Walker equations
   */
  private initializeARCoefficients(values: number[], p: number): number[] {
    if (p === 0) return [];

    const mean = this.mean(values);
    const centered = values.map((v) => v - mean);
    const n = centered.length;

    // Calculate autocorrelations
    const autocorr: number[] = [];
    for (let lag = 0; lag <= p; lag++) {
      let sum = 0;
      for (let i = lag; i < n; i++) {
        sum += (centered[i] ?? 0) * (centered[i - lag] ?? 0);
      }
      autocorr.push(sum / n);
    }

    // Solve Yule-Walker equations using Levinson-Durbin recursion
    const gamma0 = autocorr[0] ?? 1;
    if (gamma0 === 0) return Array.from({ length: p }, () => 0);

    const r = autocorr.slice(1).map((g) => g / gamma0);
    return this.levinsonDurbin(r, p);
  }

  /**
   * Levinson-Durbin recursion for solving Yule-Walker equations
   */
  private levinsonDurbin(r: number[], p: number): number[] {
    if (p === 0) return [];

    const phi: number[][] = Array.from({ length: p + 1 }, () =>
      Array.from({ length: p + 1 }, () => 0)
    );

    phi[1][1] = r[0] ?? 0;

    for (let k = 2; k <= p; k++) {
      let num = r[k - 1] ?? 0;
      let den = 1;

      for (let j = 1; j < k; j++) {
        num -= (phi[k - 1]?.[j] ?? 0) * (r[k - 1 - j] ?? 0);
        den -= (phi[k - 1]?.[j] ?? 0) * (r[j - 1] ?? 0);
      }

      phi[k][k] = den !== 0 ? num / den : 0;

      for (let j = 1; j < k; j++) {
        phi[k][j] = (phi[k - 1]?.[j] ?? 0) - (phi[k]?.[k] ?? 0) * (phi[k - 1]?.[k - j] ?? 0);
      }
    }

    const result: number[] = [];
    for (let i = 1; i <= p; i++) {
      result.push(phi[p]?.[i] ?? 0);
    }
    return result;
  }

  /**
   * Update AR coefficients
   */
  private updateARCoefficients(
    values: number[],
    residuals: number[],
    p: number,
    constant: number
  ): number[] {
    if (p === 0) return [];

    const n = values.length;
    const adjusted = values.map((v, i) => v - constant - (residuals[i] ?? 0));

    // Build normal equations
    const X: number[][] = [];
    const y: number[] = [];

    for (let i = p; i < n; i++) {
      const row: number[] = [];
      for (let j = 1; j <= p; j++) {
        row.push(adjusted[i - j] ?? 0);
      }
      X.push(row);
      y.push(adjusted[i] ?? 0);
    }

    // Solve using normal equations: (X'X)^-1 X'y
    return this.solveNormalEquations(X, y, p);
  }

  /**
   * Update MA coefficients using gradient descent
   */
  private updateMACoefficients(
    _values: number[],
    residuals: number[],
    _ar: number[],
    ma: number[],
    q: number,
    _constant: number
  ): number[] {
    if (q === 0) return [];

    const learningRate = 0.01;
    const newMA = [...ma];

    // Gradient descent step for each MA coefficient
    for (let j = 0; j < q; j++) {
      let gradient = 0;
      for (let i = j + 1; i < residuals.length; i++) {
        gradient += (residuals[i] ?? 0) * (residuals[i - j - 1] ?? 0);
      }
      gradient = (gradient * 2) / residuals.length;

      newMA[j] = Math.max(-0.99, Math.min(0.99, (newMA[j] ?? 0) - learningRate * gradient));
    }

    return newMA;
  }

  /**
   * Update constant term
   */
  private updateConstant(
    values: number[],
    ar: number[],
    _ma: number[],
    _residuals: number[]
  ): number {
    const mean = this.mean(values);
    const arSum = ar.reduce((a, b) => a + b, 0);
    return mean * (1 - arSum);
  }

  /**
   * Solve normal equations using Gaussian elimination
   */
  private solveNormalEquations(X: number[][], y: number[], p: number): number[] {
    const m = X.length;
    if (m === 0 || p === 0) return Array.from({ length: p }, () => 0);

    // Compute X'X
    const XtX: number[][] = Array.from({ length: p }, () => Array.from({ length: p }, () => 0));

    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        let sum = 0;
        for (let k = 0; k < m; k++) {
          sum += (X[k]?.[i] ?? 0) * (X[k]?.[j] ?? 0);
        }
        XtX[i][j] = sum;
      }
    }

    // Compute X'y
    const Xty: number[] = Array.from({ length: p }, () => 0);
    for (let i = 0; i < p; i++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += (X[k]?.[i] ?? 0) * (y[k] ?? 0);
      }
      Xty[i] = sum;
    }

    // Solve using Gaussian elimination with partial pivoting
    return this.gaussianElimination(XtX, Xty);
  }

  /**
   * Gaussian elimination with partial pivoting
   */
  private gaussianElimination(A: number[][], b: number[]): number[] {
    const n = b.length;
    const augmented: number[][] = A.map((row, i) => [...row, b[i] ?? 0]);

    // Forward elimination with partial pivoting
    this.forwardElimination(augmented, n);

    // Back substitution
    return this.backSubstitution(augmented, n);
  }

  /**
   * Forward elimination phase of Gaussian elimination
   */
  private forwardElimination(augmented: number[][], n: number): void {
    for (let col = 0; col < n; col++) {
      // Find and swap pivot row
      const maxRow = this.findPivotRow(augmented, col, n);
      if (maxRow !== col) {
        [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];
      }

      // Eliminate below pivot
      const pivot = augmented[col]?.[col] ?? 1;
      if (Math.abs(pivot) < 1e-10) continue;

      for (let row = col + 1; row < n; row++) {
        const factor = (augmented[row]?.[col] ?? 0) / pivot;
        for (let j = col; j <= n; j++) {
          augmented[row][j] = (augmented[row]?.[j] ?? 0) - factor * (augmented[col]?.[j] ?? 0);
        }
      }
    }
  }

  /**
   * Find pivot row for partial pivoting
   */
  private findPivotRow(augmented: number[][], col: number, n: number): number {
    let maxRow = col;
    let maxVal = Math.abs(augmented[col]?.[col] ?? 0);

    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(augmented[row]?.[col] ?? 0);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    return maxRow;
  }

  /**
   * Back substitution phase of Gaussian elimination
   */
  private backSubstitution(augmented: number[][], n: number): number[] {
    const x: number[] = Array.from({ length: n }, () => 0);

    for (let i = n - 1; i >= 0; i--) {
      let sum = augmented[i]?.[n] ?? 0;
      for (let j = i + 1; j < n; j++) {
        sum -= (augmented[i]?.[j] ?? 0) * x[j];
      }
      const diag = augmented[i]?.[i] ?? 1;
      x[i] = Math.abs(diag) > 1e-10 ? sum / diag : 0;
    }

    return x;
  }

  // ============================================================================
  // RESIDUAL CALCULATION
  // ============================================================================

  /**
   * Calculate model residuals
   */
  private calculateResiduals(
    values: number[],
    params: ARIMAParams,
    coefficients: ARIMACoefficients
  ): number[] {
    const { p, q } = params;
    const { ar, ma, constant } = coefficients;
    const n = values.length;
    const residuals: number[] = Array.from({ length: n }, () => 0);

    const start = Math.max(p, q);

    for (let t = start; t < n; t++) {
      let prediction = constant;

      // AR component
      for (let i = 0; i < p; i++) {
        prediction += (ar[i] ?? 0) * (values[t - i - 1] ?? 0);
      }

      // MA component
      for (let i = 0; i < q; i++) {
        prediction += (ma[i] ?? 0) * (residuals[t - i - 1] ?? 0);
      }

      residuals[t] = (values[t] ?? 0) - prediction;
    }

    return residuals;
  }

  // ============================================================================
  // FITTED VALUES
  // ============================================================================

  /**
   * Generate in-sample fitted values for model evaluation
   */
  private getFittedValues(
    original: number[],
    differenced: number[],
    params: ARIMAParams,
    coefficients: ARIMACoefficients
  ): number[] {
    const residuals = this.calculateResiduals(differenced, params, coefficients);
    const fittedDiff = differenced.map((v, i) => v - (residuals[i] ?? 0));

    // Undifference to get back to original scale
    if (params.d === 0) {
      return fittedDiff;
    }

    // Reconstruct fitted values on original scale
    const fitted: number[] = [];
    const offset = original.length - fittedDiff.length;

    for (let i = 0; i < original.length; i++) {
      if (i < offset) {
        fitted.push(original[i] ?? 0);
      } else {
        const diffIdx = i - offset;
        let value = original[i - 1] ?? 0;
        value += fittedDiff[diffIdx] ?? 0;
        fitted.push(value);
      }
    }

    return fitted;
  }

  // ============================================================================
  // FORECASTING
  // ============================================================================

  /**
   * Generate ARIMA forecasts
   */
  private generateARIMAForecasts(
    historicalData: HistoricalRevenuePoint[],
    original: number[],
    differenced: number[],
    residuals: number[],
    params: ARIMAParams,
    coefficients: ARIMACoefficients,
    originalLast: number[],
    stdError: number,
    zScore: number,
    config: ForecastConfig
  ) {
    const { p, d, q } = params;
    const { ar, ma, constant } = coefficients;

    // Extend differenced series and residuals for forecasting
    const extendedDiff = [...differenced];
    const extendedResiduals = [...residuals];

    // Generate forecasts on differenced scale
    const forecastsDiff: number[] = [];

    for (let h = 0; h < config.forecastPeriods; h++) {
      let forecast = constant;

      // AR component - use actual values then forecasts
      for (let i = 0; i < p; i++) {
        const idx = extendedDiff.length - 1 - i + h;
        if (idx < extendedDiff.length) {
          forecast += (ar[i] ?? 0) * (extendedDiff[idx] ?? 0);
        } else {
          const forecastIdx = idx - extendedDiff.length;
          forecast += (ar[i] ?? 0) * (forecastsDiff[forecastIdx] ?? 0);
        }
      }

      // MA component - residuals become 0 for future
      for (let i = 0; i < q; i++) {
        const idx = extendedResiduals.length - 1 - i + h;
        if (idx < extendedResiduals.length) {
          forecast += (ma[i] ?? 0) * (extendedResiduals[idx] ?? 0);
        }
        // Future residuals are expected to be 0
      }

      forecastsDiff.push(forecast);
    }

    // Undifference forecasts
    const forecastsOriginal = this.undifference(forecastsDiff, originalLast, d);

    // Calculate cumulative forecast error variance
    const errorVariances = this.calculateForecastErrorVariance(
      config.forecastPeriods,
      params,
      coefficients
    );

    // Generate forecast points with confidence intervals
    return generateForecastPoints(historicalData, config, (periodIndex, date) => {
      const seasonalFactor = config.applySeasonality
        ? getSeasonalFactor(date, config.seasonalFactors)
        : 1.0;

      const predicted = (forecastsOriginal[periodIndex] ?? 0) * seasonalFactor;
      const errorStd = Math.sqrt(errorVariances[periodIndex] ?? coefficients.sigma2);
      const intervalWidth = zScore * errorStd * seasonalFactor;

      return {
        date,
        predicted: Math.round(Math.max(0, predicted)),
        confidenceInterval: {
          lower: Math.max(0, Math.round(predicted - intervalWidth)),
          upper: Math.round(predicted + intervalWidth),
          level: config.confidenceLevel,
        },
        seasonalFactor,
        trendComponent: this.estimateTrendComponent(forecastsOriginal, periodIndex),
        highUncertainty: periodIndex >= config.forecastPeriods / 2,
      };
    });
  }

  /**
   * Calculate forecast error variance for each horizon
   *
   * For ARIMA, forecast error variance increases with horizon
   */
  private calculateForecastErrorVariance(
    periods: number,
    params: ARIMAParams,
    coefficients: ARIMACoefficients
  ): number[] {
    const { sigma2 } = coefficients;
    const variances: number[] = [];

    // Calculate psi weights (MA representation coefficients)
    const psi = this.calculatePsiWeights(periods, params, coefficients);

    for (let h = 0; h < periods; h++) {
      let variance = sigma2;
      for (let i = 0; i < h; i++) {
        variance += sigma2 * Math.pow(psi[i] ?? 0, 2);
      }
      variances.push(variance);
    }

    return variances;
  }

  /**
   * Calculate psi weights for MA(∞) representation
   */
  private calculatePsiWeights(
    periods: number,
    params: ARIMAParams,
    coefficients: ARIMACoefficients
  ): number[] {
    const { p, q } = params;
    const { ar, ma } = coefficients;
    const psi: number[] = [1];

    for (let j = 1; j <= periods; j++) {
      let weight = 0;

      // AR contribution
      for (let i = 0; i < Math.min(j, p); i++) {
        weight += (ar[i] ?? 0) * (psi[j - i - 1] ?? 0);
      }

      // MA contribution
      if (j <= q) {
        weight += ma[j - 1] ?? 0;
      }

      psi.push(weight);
    }

    return psi.slice(1);
  }

  /**
   * Estimate trend component from forecasts
   */
  private estimateTrendComponent(forecasts: number[], periodIndex: number): number {
    if (periodIndex === 0 || forecasts.length < 2) return 0;

    const current = forecasts[periodIndex] ?? 0;
    const previous = forecasts[periodIndex - 1] ?? forecasts[0] ?? 0;

    return Math.round(current - previous);
  }

  // ============================================================================
  // MODEL DIAGNOSTICS
  // ============================================================================

  /**
   * Calculate Akaike Information Criterion (AIC)
   *
   * AIC = n * ln(σ²) + 2k where k = p + q + 1
   */
  private calculateAIC(n: number, params: ARIMAParams, sigma2: number): number {
    const k = params.p + params.q + 1;
    return n * Math.log(Math.max(sigma2, 1e-10)) + 2 * k;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Calculate mean of array
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate variance of array
   */
  private variance(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const sumSq = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0);
    return sumSq / (values.length - 1);
  }
}

/**
 * Factory function to create an ARIMA strategy instance
 */
export function createARIMAStrategy(): ARIMAStrategy {
  return new ARIMAStrategy();
}
