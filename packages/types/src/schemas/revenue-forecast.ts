/**
 * Revenue Forecasting Schemas
 *
 * ML-powered prediction of future clinic revenue based on historical payment data.
 * Implements multiple forecasting methods: moving average, exponential smoothing,
 * and linear regression with seasonal adjustments.
 *
 * @module types/schemas/revenue-forecast
 *
 * FORECASTING METHODS:
 * - Simple Moving Average (SMA): Smooths short-term fluctuations
 * - Exponential Smoothing (ETS): Weights recent data more heavily
 * - Linear Regression: Identifies trends with confidence intervals
 * - Seasonal Decomposition: Accounts for dental clinic seasonality
 *
 * DENTAL CLINIC SEASONALITY:
 * - January: Low (post-holiday budget recovery)
 * - February-March: Rising (New Year resolutions)
 * - April-May: Peak (pre-summer cosmetic)
 * - June-August: Lower (vacation season)
 * - September-October: Peak (back-to-school, pre-holiday)
 * - November-December: Declining (holiday expenses)
 */
import { z } from 'zod';

import { UUIDSchema, TimestampSchema } from './common.js';

// =============================================================================
// Forecasting Method & Confidence
// =============================================================================

/**
 * Forecasting method used for prediction
 * - moving_average: Simple moving average (3/6/12 month windows)
 * - exponential_smoothing: Holt-Winters exponential smoothing
 * - linear_regression: OLS regression with trend analysis
 * - ensemble: Weighted combination of all methods
 */
export const ForecastMethodSchema = z.enum([
  'moving_average',
  'exponential_smoothing',
  'linear_regression',
  'ensemble',
]);

/**
 * Forecast confidence level based on data quality and model fit
 * - HIGH: R-squared >= 0.8, sufficient historical data (12+ months)
 * - MEDIUM: R-squared >= 0.6, adequate data (6-12 months)
 * - LOW: R-squared < 0.6 or limited data (< 6 months)
 */
export const ForecastConfidenceLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW']);

/**
 * Time granularity for forecasts
 */
export const ForecastGranularitySchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly']);

/**
 * Revenue trend direction
 */
export const RevenueTrendSchema = z.enum(['GROWING', 'STABLE', 'DECLINING', 'VOLATILE']);

// =============================================================================
// Historical Revenue Input
// =============================================================================

/**
 * Single historical revenue data point
 */
export const HistoricalRevenuePointSchema = z.object({
  /** Period date (start of period) */
  date: z.coerce.date(),

  /** Total revenue collected in EUR */
  revenue: z.number().min(0),

  /** Number of completed cases */
  casesCompleted: z.number().int().min(0),

  /** Number of new patients acquired */
  newPatients: z.number().int().min(0),

  /** Collection rate for the period (0-100) */
  collectionRate: z.number().min(0).max(100).optional(),

  /** Average case value for the period */
  avgCaseValue: z.number().min(0).optional(),

  /** Revenue from high-value procedures (All-on-X, implants) */
  highValueRevenue: z.number().min(0).optional(),
});

/**
 * Complete historical revenue dataset for forecasting
 */
export const HistoricalRevenueInputSchema = z.object({
  /** Clinic identifier */
  clinicId: UUIDSchema,

  /** Historical data points (must be chronologically sorted) */
  dataPoints: z.array(HistoricalRevenuePointSchema).min(3),

  /** Data granularity */
  granularity: ForecastGranularitySchema,

  /** Currency (default EUR) */
  currency: z.string().length(3).default('EUR'),
});

// =============================================================================
// Forecast Configuration
// =============================================================================

/**
 * Seasonal adjustment factors by month (1.0 = no adjustment)
 */
export const SeasonalFactorsSchema = z.object({
  january: z.number().min(0).max(2).default(0.85),
  february: z.number().min(0).max(2).default(0.95),
  march: z.number().min(0).max(2).default(1.05),
  april: z.number().min(0).max(2).default(1.15),
  may: z.number().min(0).max(2).default(1.1),
  june: z.number().min(0).max(2).default(0.9),
  july: z.number().min(0).max(2).default(0.85),
  august: z.number().min(0).max(2).default(0.8),
  september: z.number().min(0).max(2).default(1.1),
  october: z.number().min(0).max(2).default(1.15),
  november: z.number().min(0).max(2).default(1.0),
  december: z.number().min(0).max(2).default(0.9),
});

/**
 * Forecast configuration options
 */
export const ForecastConfigSchema = z.object({
  /** Primary forecasting method */
  method: ForecastMethodSchema.default('ensemble'),

  /** Number of periods to forecast */
  forecastPeriods: z.number().int().min(1).max(24).default(6),

  /** Confidence interval level (0.8 = 80%, 0.95 = 95%) */
  confidenceLevel: z.number().min(0.5).max(0.99).default(0.95),

  /** Apply seasonal adjustments */
  applySeasonality: z.boolean().default(true),

  /** Custom seasonal factors (uses defaults if not provided) */
  seasonalFactors: SeasonalFactorsSchema.optional(),

  /** Moving average window size (for SMA method) */
  movingAverageWindow: z.number().int().min(2).max(12).default(3),

  /** Smoothing factor for exponential smoothing (0-1) */
  smoothingAlpha: z.number().min(0.1).max(0.9).default(0.3),

  /** Include trend component in ETS */
  includeTrend: z.boolean().default(true),

  /** Minimum data points required for reliable forecast */
  minDataPoints: z.number().int().min(3).default(6),
});

// =============================================================================
// Forecast Output
// =============================================================================

/**
 * Confidence interval for a forecast
 */
export const ForecastConfidenceIntervalSchema = z.object({
  /** Lower bound of prediction (EUR) */
  lower: z.number(),

  /** Upper bound of prediction (EUR) */
  upper: z.number(),

  /** Confidence level (e.g., 0.95 for 95% CI) */
  level: z.number().min(0).max(1),
});

/**
 * Single forecasted revenue point
 */
export const ForecastedRevenuePointSchema = z.object({
  /** Forecasted period date */
  date: z.coerce.date(),

  /** Point estimate (expected revenue EUR) */
  predicted: z.number(),

  /** Confidence interval */
  confidenceInterval: ForecastConfidenceIntervalSchema,

  /** Seasonal factor applied */
  seasonalFactor: z.number().optional(),

  /** Trend component contribution */
  trendComponent: z.number().optional(),

  /** Is this a high-uncertainty prediction (far future) */
  highUncertainty: z.boolean().default(false),
});

/**
 * Model fit statistics
 */
export const ModelFitStatisticsSchema = z.object({
  /** R-squared (coefficient of determination) */
  rSquared: z.number().min(0).max(1),

  /** Mean Absolute Error */
  mae: z.number().min(0),

  /** Mean Absolute Percentage Error */
  mape: z.number().min(0),

  /** Root Mean Square Error */
  rmse: z.number().min(0),

  /** Akaike Information Criterion (lower is better) */
  aic: z.number().optional(),

  /** Number of data points used */
  dataPointsUsed: z.number().int().min(0),

  /** Degrees of freedom */
  degreesOfFreedom: z.number().int().min(0).optional(),
});

/**
 * Trend analysis results
 */
export const TrendAnalysisSchema = z.object({
  /** Overall trend direction */
  direction: RevenueTrendSchema,

  /** Monthly growth rate (percentage) */
  monthlyGrowthRate: z.number(),

  /** Annualized growth rate (percentage) */
  annualizedGrowthRate: z.number(),

  /** Is trend statistically significant */
  isSignificant: z.boolean(),

  /** P-value for trend significance */
  pValue: z.number().min(0).max(1).optional(),

  /** Volatility measure (coefficient of variation) */
  volatility: z.number().min(0),
});

/**
 * Complete revenue forecast output
 */
export const RevenueForecastOutputSchema = z.object({
  /** Clinic identifier */
  clinicId: UUIDSchema,

  /** Method used for this forecast */
  method: ForecastMethodSchema,

  /** Confidence level classification */
  confidenceLevel: ForecastConfidenceLevelSchema,

  /** Forecasted data points */
  forecasts: z.array(ForecastedRevenuePointSchema),

  /** Total predicted revenue for forecast period */
  totalPredictedRevenue: z.number(),

  /** Total confidence interval for forecast period */
  totalConfidenceInterval: ForecastConfidenceIntervalSchema,

  /** Model fit statistics */
  modelFit: ModelFitStatisticsSchema,

  /** Trend analysis */
  trendAnalysis: TrendAnalysisSchema,

  /** Human-readable summary */
  summary: z.string(),

  /** Recommended actions based on forecast */
  recommendedActions: z.array(z.string()),

  /** Model version */
  modelVersion: z.string(),

  /** Calculation timestamp */
  calculatedAt: TimestampSchema,
});

// =============================================================================
// Request/Response Schemas
// =============================================================================

/**
 * Request to generate a revenue forecast
 */
export const GenerateRevenueForecastRequestSchema = z.object({
  /** Clinic identifier */
  clinicId: UUIDSchema,

  /** Correlation ID for tracing */
  correlationId: z.string(),

  /** Forecast configuration (uses defaults if not provided) */
  config: ForecastConfigSchema.optional(),

  /** Use cached forecast if available and fresh */
  useCache: z.boolean().default(true),

  /** Maximum cache age in hours */
  maxCacheAgeHours: z.number().int().min(1).default(24),
});

/**
 * Response from revenue forecast generation
 */
export const RevenueForecastResponseSchema = z.object({
  /** Success indicator */
  success: z.boolean(),

  /** Forecast result if successful */
  forecast: RevenueForecastOutputSchema.optional(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Error code if failed */
  errorCode: z.string().optional(),

  /** Was result from cache */
  fromCache: z.boolean().default(false),

  /** Processing duration in ms */
  durationMs: z.number().optional(),
});

/**
 * Batch forecast request for multiple clinics
 */
export const BatchRevenueForecastRequestSchema = z.object({
  /** Clinic identifiers */
  clinicIds: z.array(UUIDSchema).min(1).max(100),

  /** Correlation ID for tracing */
  correlationId: z.string(),

  /** Forecast configuration (applied to all) */
  config: ForecastConfigSchema.optional(),
});

/**
 * Batch forecast result
 */
export const BatchRevenueForecastResultSchema = z.object({
  /** Success indicator */
  success: z.boolean(),

  /** Total clinics processed */
  totalClinics: z.number().int().min(0),

  /** Successfully forecasted count */
  succeeded: z.number().int().min(0),

  /** Failed count */
  failed: z.number().int().min(0),

  /** Individual results */
  results: z.array(
    z.object({
      clinicId: UUIDSchema,
      forecast: RevenueForecastOutputSchema.optional(),
      error: z.string().optional(),
    })
  ),

  /** Processing duration in ms */
  durationMs: z.number().optional(),
});

// =============================================================================
// Comparison & Analytics Schemas
// =============================================================================

/**
 * Forecast vs actual comparison for a period
 */
export const ForecastAccuracyPointSchema = z.object({
  /** Period date */
  date: z.coerce.date(),

  /** Forecasted revenue */
  predicted: z.number(),

  /** Actual revenue */
  actual: z.number(),

  /** Absolute error */
  absoluteError: z.number(),

  /** Percentage error */
  percentageError: z.number(),

  /** Was actual within confidence interval */
  withinConfidenceInterval: z.boolean(),
});

/**
 * Forecast accuracy analysis
 */
export const ForecastAccuracyAnalysisSchema = z.object({
  /** Clinic identifier */
  clinicId: UUIDSchema,

  /** Analysis period */
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),

  /** Individual comparison points */
  comparisons: z.array(ForecastAccuracyPointSchema),

  /** Overall accuracy metrics */
  overallMAPE: z.number().min(0),
  overallMAE: z.number().min(0),

  /** Percentage of actuals within confidence interval */
  coverageProbability: z.number().min(0).max(100),

  /** Forecast bias (positive = overestimate, negative = underestimate) */
  bias: z.number(),

  /** Is the model well-calibrated */
  isWellCalibrated: z.boolean(),
});

// =============================================================================
// Events
// =============================================================================

/**
 * Event emitted when a revenue forecast is generated
 */
export const RevenueForecastGeneratedEventSchema = z.object({
  type: z.literal('revenue_forecast.generated'),
  clinicId: UUIDSchema,
  method: ForecastMethodSchema,
  confidenceLevel: ForecastConfidenceLevelSchema,
  totalPredictedRevenue: z.number(),
  forecastPeriods: z.number().int(),
  trendDirection: RevenueTrendSchema,
  timestamp: TimestampSchema,
});

/**
 * Event emitted when forecast indicates significant growth
 */
export const RevenueGrowthDetectedEventSchema = z.object({
  type: z.literal('revenue_forecast.growth_detected'),
  clinicId: UUIDSchema,
  annualizedGrowthRate: z.number(),
  confidenceLevel: ForecastConfidenceLevelSchema,
  timestamp: TimestampSchema,
});

/**
 * Event emitted when forecast indicates decline
 */
export const RevenueDeclineAlertEventSchema = z.object({
  type: z.literal('revenue_forecast.decline_alert'),
  clinicId: UUIDSchema,
  declineRate: z.number(),
  projectedRevenueLoss: z.number(),
  recommendedActions: z.array(z.string()),
  timestamp: TimestampSchema,
});

// =============================================================================
// Type Exports
// =============================================================================

export type ForecastMethod = z.infer<typeof ForecastMethodSchema>;
export type ForecastConfidenceLevel = z.infer<typeof ForecastConfidenceLevelSchema>;
export type ForecastGranularity = z.infer<typeof ForecastGranularitySchema>;
export type RevenueTrend = z.infer<typeof RevenueTrendSchema>;
export type HistoricalRevenuePoint = z.infer<typeof HistoricalRevenuePointSchema>;
export type HistoricalRevenueInput = z.infer<typeof HistoricalRevenueInputSchema>;
export type SeasonalFactors = z.infer<typeof SeasonalFactorsSchema>;
export type ForecastConfig = z.infer<typeof ForecastConfigSchema>;
export type ForecastConfidenceInterval = z.infer<typeof ForecastConfidenceIntervalSchema>;
export type ForecastedRevenuePoint = z.infer<typeof ForecastedRevenuePointSchema>;
export type ModelFitStatistics = z.infer<typeof ModelFitStatisticsSchema>;
export type TrendAnalysis = z.infer<typeof TrendAnalysisSchema>;
export type RevenueForecastOutput = z.infer<typeof RevenueForecastOutputSchema>;
export type GenerateRevenueForecastRequest = z.infer<typeof GenerateRevenueForecastRequestSchema>;
export type RevenueForecastResponse = z.infer<typeof RevenueForecastResponseSchema>;
export type BatchRevenueForecastRequest = z.infer<typeof BatchRevenueForecastRequestSchema>;
export type BatchRevenueForecastResult = z.infer<typeof BatchRevenueForecastResultSchema>;
export type ForecastAccuracyPoint = z.infer<typeof ForecastAccuracyPointSchema>;
export type ForecastAccuracyAnalysis = z.infer<typeof ForecastAccuracyAnalysisSchema>;
export type RevenueForecastGeneratedEvent = z.infer<typeof RevenueForecastGeneratedEventSchema>;
export type RevenueGrowthDetectedEvent = z.infer<typeof RevenueGrowthDetectedEventSchema>;
export type RevenueDeclineAlertEvent = z.infer<typeof RevenueDeclineAlertEventSchema>;
