/**
 * @fileoverview Revenue Forecasting Use Case Implementation
 *
 * Orchestrates the revenue forecasting workflow following hexagonal architecture.
 * This use case:
 * 1. Validates inputs and authorization
 * 2. Fetches historical data from the repository (secondary port)
 * 3. Delegates forecasting to the domain service (Strategy Pattern)
 * 4. Emits domain events
 * 5. Returns structured results
 *
 * @module application/use-cases/revenue/RevenueForecastingUseCaseImpl
 */

import { createLogger } from '@medicalcor/core';
import {
  RevenueForecastingService,
  createRevenueForecastingService,
} from '@medicalcor/domain/ltv/revenue-forecasting-service.js';

import type { Result } from '../../shared/Result.js';
import { Ok, Err } from '../../shared/Result.js';
import { DomainError, BusinessRuleError } from '../../shared/DomainError.js';
import type { SecurityContext } from '../../security/SecurityContext.js';
import { Permission } from '../../security/SecurityContext.js';

import type {
  RevenueForecastingUseCase,
  GenerateForecastInput,
  GenerateForecastOutput,
  BatchForecastInput,
  BatchForecastOutput,
  BatchForecastItem,
  CompareForecastInput,
  ForecastAccuracyOutput,
  ForecastDashboardSummary,
  ForecastMethod,
  ForecastConfidenceLevel,
  ForecastedPoint,
  ModelFitStatistics,
  TrendAnalysis,
  RevenueTrend,
  RevenueForecastingUseCaseConfig,
} from '../../ports/primary/RevenueForecastingUseCase.js';

import type {
  IRevenueSnapshotRepository,
  RevenueSnapshotFilter,
} from '../../ports/secondary/persistence/RevenueSnapshotRepository.js';

const logger = createLogger({ name: 'revenue-forecasting-use-case' });

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<RevenueForecastingUseCaseConfig> = {
  defaultMethod: 'ensemble',
  defaultForecastPeriods: 6,
  defaultConfidenceLevel: 0.95,
  minDataPoints: 6,
  cacheTtlSeconds: 3600, // 1 hour
  applySeasonalityDefault: true,
  recalibrationThreshold: 25, // 25% MAPE triggers recalibration warning
};

// ============================================================================
// USE CASE IMPLEMENTATION
// ============================================================================

/**
 * Revenue Forecasting Use Case Implementation
 *
 * Orchestrates revenue forecasting by coordinating between:
 * - Domain service (RevenueForecastingService with Strategy Pattern)
 * - Secondary port (IRevenueSnapshotRepository for data access)
 * - Security context (authorization)
 *
 * @example
 * ```typescript
 * const useCase = new RevenueForecastingUseCaseImpl(
 *   revenueSnapshotRepository,
 *   { defaultMethod: 'ensemble' }
 * );
 *
 * const result = await useCase.generateForecast(input, securityContext);
 * if (isOk(result)) {
 *   console.log('Forecast:', result.value.totalPredictedRevenue);
 * }
 * ```
 */
export class RevenueForecastingUseCaseImpl implements RevenueForecastingUseCase {
  private readonly config: Required<RevenueForecastingUseCaseConfig>;
  private readonly forecastingService: RevenueForecastingService;
  private readonly forecastCache = new Map<string, { data: GenerateForecastOutput; expiresAt: Date }>();

  constructor(
    private readonly revenueSnapshotRepository: IRevenueSnapshotRepository,
    config: RevenueForecastingUseCaseConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.forecastingService = createRevenueForecastingService({
      defaultMethod: this.config.defaultMethod,
      defaultForecastPeriods: this.config.defaultForecastPeriods,
      defaultConfidenceLevel: this.config.defaultConfidenceLevel,
    });

    logger.info({ config: this.config }, 'RevenueForecastingUseCaseImpl initialized');
  }

  // ==========================================================================
  // GENERATE FORECAST
  // ==========================================================================

  async generateForecast(
    input: GenerateForecastInput,
    context: SecurityContext
  ): Promise<Result<GenerateForecastOutput, DomainError>> {
    const startTime = Date.now();

    logger.info(
      {
        clinicId: input.clinicId,
        correlationId: input.correlationId,
        method: input.method,
        periods: input.forecastPeriods,
      },
      'Generating revenue forecast'
    );

    try {
      // 1. Authorization check
      if (!context.hasPermission(Permission.REPORT_VIEW)) {
        return Err(
          DomainError.permissionDenied(
            Permission.REPORT_VIEW,
            context.principal.id,
            input.correlationId
          )
        );
      }

      // 2. Check cache (unless force refresh)
      if (!input.forceRefresh) {
        const cached = this.getCachedForecast(input.clinicId);
        if (cached) {
          logger.info({ clinicId: input.clinicId }, 'Returning cached forecast');
          return Ok({ ...cached, fromCache: true });
        }
      }

      // 3. Validate sufficient historical data exists
      const hasSufficientData = await this.revenueSnapshotRepository.hasSufficientData(
        input.clinicId,
        this.config.minDataPoints
      );

      if (!hasSufficientData) {
        return Err(
          new BusinessRuleError(
            'insufficient_data',
            `Insufficient historical data for forecasting. Minimum ${this.config.minDataPoints} data points required.`,
            { clinicId: input.clinicId, minRequired: this.config.minDataPoints },
            input.correlationId
          )
        );
      }

      // 4. Fetch historical revenue data from repository
      const filter: RevenueSnapshotFilter = this.buildFilter(input);
      const historicalData = await this.revenueSnapshotRepository.getHistoricalRevenue(filter);

      if (historicalData.length < this.config.minDataPoints) {
        return Err(
          new BusinessRuleError(
            'insufficient_data',
            `Only ${historicalData.length} data points found, minimum ${this.config.minDataPoints} required.`,
            {
              clinicId: input.clinicId,
              found: historicalData.length,
              required: this.config.minDataPoints,
            },
            input.correlationId
          )
        );
      }

      // 5. Generate forecast using domain service (Strategy Pattern)
      const forecastResult = this.forecastingService.forecast(
        {
          clinicId: input.clinicId,
          dataPoints: historicalData,
          granularity: input.granularity,
          currency: input.currency ?? 'EUR',
        },
        {
          method: input.method ?? this.config.defaultMethod,
          forecastPeriods: input.forecastPeriods ?? this.config.defaultForecastPeriods,
          confidenceLevel: input.confidenceLevel ?? this.config.defaultConfidenceLevel,
          applySeasonality: input.applySeasonality ?? this.config.applySeasonalityDefault,
          movingAverageWindow: 3,
          smoothingAlpha: 0.3,
          includeTrend: true,
          minDataPoints: this.config.minDataPoints,
        }
      );

      // 6. Map domain result to use case output
      const output: GenerateForecastOutput = {
        success: true,
        clinicId: input.clinicId,
        method: forecastResult.method as ForecastMethod,
        confidenceLevel: forecastResult.confidenceLevel as ForecastConfidenceLevel,
        forecasts: forecastResult.forecasts.map((f) => this.mapForecastPoint(f)),
        totalPredictedRevenue: forecastResult.totalPredictedRevenue,
        totalConfidenceInterval: {
          lower: forecastResult.totalConfidenceInterval.lower,
          upper: forecastResult.totalConfidenceInterval.upper,
          level: forecastResult.totalConfidenceInterval.level,
        },
        modelFit: this.mapModelFit(forecastResult.modelFit),
        trendAnalysis: this.mapTrendAnalysis(forecastResult.trendAnalysis),
        summary: forecastResult.summary,
        recommendedActions: forecastResult.recommendedActions,
        modelVersion: forecastResult.modelVersion,
        calculatedAt: new Date(forecastResult.calculatedAt),
        fromCache: false,
      };

      // 7. Cache the result
      this.cacheForecast(input.clinicId, output);

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          clinicId: input.clinicId,
          durationMs,
          totalRevenue: output.totalPredictedRevenue,
          trend: output.trendAnalysis.direction,
        },
        'Revenue forecast generated successfully'
      );

      return Ok(output);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error(
        {
          clinicId: input.clinicId,
          correlationId: input.correlationId,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs,
        },
        'Failed to generate revenue forecast'
      );

      return Err(
        DomainError.internal(
          'Failed to generate revenue forecast',
          error instanceof Error ? error : undefined,
          input.correlationId
        )
      );
    }
  }

  // ==========================================================================
  // BATCH FORECAST
  // ==========================================================================

  async generateBatchForecast(
    input: BatchForecastInput,
    context: SecurityContext
  ): Promise<Result<BatchForecastOutput, DomainError>> {
    const startTime = Date.now();

    logger.info(
      {
        clinicCount: input.clinicIds.length,
        correlationId: input.correlationId,
      },
      'Starting batch revenue forecast'
    );

    try {
      // Authorization check
      if (!context.hasPermission(Permission.REPORT_VIEW)) {
        return Err(
          DomainError.permissionDenied(
            Permission.REPORT_VIEW,
            context.principal.id,
            input.correlationId
          )
        );
      }

      const results: BatchForecastItem[] = [];
      let succeeded = 0;
      let failed = 0;
      let totalPredictedRevenue = 0;
      let totalGrowthRate = 0;
      let growingClinics = 0;
      let decliningClinics = 0;

      // Process each clinic
      for (const clinicId of input.clinicIds) {
        const forecastInput: GenerateForecastInput = {
          clinicId,
          correlationId: input.correlationId,
          historicalData: [], // Will be fetched by generateForecast
          granularity: 'monthly',
          method: input.method,
          forecastPeriods: input.forecastPeriods,
          applySeasonality: input.applySeasonality,
        };

        const result = await this.generateForecast(forecastInput, context);

        if (result._tag === 'Ok') {
          succeeded++;
          totalPredictedRevenue += result.value.totalPredictedRevenue;
          totalGrowthRate += result.value.trendAnalysis.annualizedGrowthRate;

          if (result.value.trendAnalysis.direction === 'GROWING') {
            growingClinics++;
          } else if (result.value.trendAnalysis.direction === 'DECLINING') {
            decliningClinics++;
          }

          results.push({
            clinicId,
            forecast: result.value,
          });
        } else {
          failed++;

          if (!input.continueOnError) {
            return Err(result.error);
          }

          results.push({
            clinicId,
            error: {
              code: result.error.code,
              message: result.error.message,
            },
          });
        }
      }

      const durationMs = Date.now() - startTime;

      const output: BatchForecastOutput = {
        total: input.clinicIds.length,
        succeeded,
        failed,
        results,
        aggregateStats: {
          totalPredictedRevenue,
          averageGrowthRate: succeeded > 0 ? totalGrowthRate / succeeded : 0,
          growingClinics,
          decliningClinics,
        },
        durationMs,
      };

      logger.info(
        {
          total: output.total,
          succeeded: output.succeeded,
          failed: output.failed,
          durationMs,
        },
        'Batch revenue forecast completed'
      );

      return Ok(output);
    } catch (error) {
      logger.error(
        {
          correlationId: input.correlationId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Batch forecast failed'
      );

      return Err(
        DomainError.internal(
          'Batch forecast failed',
          error instanceof Error ? error : undefined,
          input.correlationId
        )
      );
    }
  }

  // ==========================================================================
  // COMPARE FORECAST TO ACTUAL
  // ==========================================================================

  async compareForecastToActual(
    input: CompareForecastInput,
    context: SecurityContext
  ): Promise<Result<ForecastAccuracyOutput, DomainError>> {
    logger.info(
      {
        clinicId: input.clinicId,
        correlationId: input.correlationId,
      },
      'Comparing forecast to actual revenue'
    );

    try {
      // Authorization check
      if (!context.hasPermission(Permission.REPORT_VIEW)) {
        return Err(
          DomainError.permissionDenied(
            Permission.REPORT_VIEW,
            context.principal.id,
            input.correlationId
          )
        );
      }

      // Calculate accuracy metrics
      const absoluteError = Math.abs(input.forecastedRevenue - input.actualRevenue);
      const percentageError =
        input.actualRevenue !== 0
          ? (absoluteError / input.actualRevenue) * 100
          : input.forecastedRevenue !== 0
            ? 100
            : 0;

      const withinConfidenceInterval =
        input.actualRevenue >= input.forecastedInterval.lower &&
        input.actualRevenue <= input.forecastedInterval.upper;

      const bias = input.forecastedRevenue - input.actualRevenue; // Positive = overestimate

      // Determine if recalibration is needed
      const needsRecalibration = percentageError > this.config.recalibrationThreshold;

      // Assess forecast quality
      let assessment: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
      if (percentageError <= 5) {
        assessment = 'EXCELLENT';
      } else if (percentageError <= 10) {
        assessment = 'GOOD';
      } else if (percentageError <= 20) {
        assessment = 'FAIR';
      } else {
        assessment = 'POOR';
      }

      const output: ForecastAccuracyOutput = {
        clinicId: input.clinicId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        forecastedRevenue: input.forecastedRevenue,
        actualRevenue: input.actualRevenue,
        absoluteError: Math.round(absoluteError),
        percentageError: Math.round(percentageError * 10) / 10,
        withinConfidenceInterval,
        bias: Math.round(bias),
        needsRecalibration,
        assessment,
      };

      logger.info(
        {
          clinicId: input.clinicId,
          assessment,
          percentageError: output.percentageError,
          needsRecalibration,
        },
        'Forecast accuracy comparison completed'
      );

      return Ok(output);
    } catch (error) {
      logger.error(
        {
          clinicId: input.clinicId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Forecast comparison failed'
      );

      return Err(
        DomainError.internal(
          'Forecast comparison failed',
          error instanceof Error ? error : undefined,
          input.correlationId
        )
      );
    }
  }

  // ==========================================================================
  // GET FORECAST SUMMARY
  // ==========================================================================

  async getForecastSummary(
    clinicId: string,
    context: SecurityContext
  ): Promise<Result<ForecastDashboardSummary, DomainError>> {
    const correlationId = context.correlationId;

    logger.info({ clinicId, correlationId }, 'Getting forecast summary for dashboard');

    try {
      // Authorization check
      if (!context.hasPermission(Permission.REPORT_VIEW)) {
        return Err(
          DomainError.permissionDenied(Permission.REPORT_VIEW, context.principal.id, correlationId)
        );
      }

      // Generate forecast if not cached
      const forecastResult = await this.generateForecast(
        {
          clinicId,
          correlationId,
          historicalData: [],
          granularity: 'monthly',
        },
        context
      );

      if (forecastResult._tag === 'Err') {
        return Err(forecastResult.error);
      }

      const forecast = forecastResult.value;

      // Build dashboard summary
      const now = new Date();
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Get next period forecast (first forecast point)
      const nextPeriodForecast = forecast.forecasts[0]?.predicted ?? 0;

      // Get 6-month forecast (total)
      const sixMonthForecast = forecast.totalPredictedRevenue;

      // Generate insights based on forecast
      const insights = this.generateInsights(forecast);

      const summary: ForecastDashboardSummary = {
        clinicId,
        currentPeriod,
        nextPeriodForecast,
        sixMonthForecast,
        trend: forecast.trendAnalysis.direction as RevenueTrend,
        yoyGrowth: forecast.trendAnalysis.annualizedGrowthRate,
        confidence: forecast.confidenceLevel,
        insights,
        lastUpdated: forecast.calculatedAt,
      };

      return Ok(summary);
    } catch (error) {
      logger.error(
        {
          clinicId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get forecast summary'
      );

      return Err(
        DomainError.internal(
          'Failed to get forecast summary',
          error instanceof Error ? error : undefined,
          correlationId
        )
      );
    }
  }

  // ==========================================================================
  // INVALIDATE FORECAST
  // ==========================================================================

  async invalidateForecast(
    clinicId: string,
    context: SecurityContext
  ): Promise<Result<boolean, DomainError>> {
    logger.info({ clinicId }, 'Invalidating forecast cache');

    try {
      // Authorization check - require admin permission for cache invalidation
      if (!context.hasPermission(Permission.ADMIN_SYSTEM_CONFIG)) {
        return Err(
          DomainError.permissionDenied(
            Permission.ADMIN_SYSTEM_CONFIG,
            context.principal.id,
            context.correlationId
          )
        );
      }

      this.forecastCache.delete(clinicId);
      logger.info({ clinicId }, 'Forecast cache invalidated');

      return Ok(true);
    } catch (error) {
      return Err(
        DomainError.internal(
          'Failed to invalidate forecast',
          error instanceof Error ? error : undefined,
          context.correlationId
        )
      );
    }
  }

  // ==========================================================================
  // GET HISTORICAL ACCURACY
  // ==========================================================================

  async getHistoricalAccuracy(
    clinicId: string,
    months: number,
    context: SecurityContext
  ): Promise<
    Result<
      {
        readonly periods: readonly ForecastAccuracyOutput[];
        readonly overallMape: number;
        readonly overallBias: number;
        readonly modelPerformance: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
      },
      DomainError
    >
  > {
    logger.info({ clinicId, months }, 'Getting historical forecast accuracy');

    try {
      // Authorization check
      if (!context.hasPermission(Permission.REPORT_VIEW)) {
        return Err(
          DomainError.permissionDenied(
            Permission.REPORT_VIEW,
            context.principal.id,
            context.correlationId
          )
        );
      }

      // For now, return empty historical accuracy
      // This would typically be populated from stored forecast/actual comparisons
      const result = {
        periods: [] as ForecastAccuracyOutput[],
        overallMape: 0,
        overallBias: 0,
        modelPerformance: 'GOOD' as const,
      };

      return Ok(result);
    } catch (error) {
      return Err(
        DomainError.internal(
          'Failed to get historical accuracy',
          error instanceof Error ? error : undefined,
          context.correlationId
        )
      );
    }
  }

  // ==========================================================================
  // PRIVATE HELPER METHODS
  // ==========================================================================

  private buildFilter(input: GenerateForecastInput): RevenueSnapshotFilter {
    // Default to last 24 months of data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 24);

    return {
      clinicId: input.clinicId,
      startDate,
      endDate,
      granularity: input.granularity,
    };
  }

  private getCachedForecast(clinicId: string): GenerateForecastOutput | null {
    const cached = this.forecastCache.get(clinicId);
    if (!cached) return null;

    if (new Date() > cached.expiresAt) {
      this.forecastCache.delete(clinicId);
      return null;
    }

    return cached.data;
  }

  private cacheForecast(clinicId: string, data: GenerateForecastOutput): void {
    const expiresAt = new Date(Date.now() + this.config.cacheTtlSeconds * 1000);
    this.forecastCache.set(clinicId, { data, expiresAt });
  }

  private mapForecastPoint(point: {
    date: Date;
    predicted: number;
    confidenceInterval: { lower: number; upper: number; level: number };
    seasonalFactor?: number;
    trendComponent?: number;
    highUncertainty: boolean;
  }): ForecastedPoint {
    return {
      date: point.date,
      predicted: point.predicted,
      confidenceInterval: {
        lower: point.confidenceInterval.lower,
        upper: point.confidenceInterval.upper,
        level: point.confidenceInterval.level,
      },
      seasonalFactor: point.seasonalFactor,
      trendComponent: point.trendComponent,
      highUncertainty: point.highUncertainty,
    };
  }

  private mapModelFit(fit: {
    rSquared: number;
    mae: number;
    mape: number;
    rmse: number;
    dataPointsUsed: number;
  }): ModelFitStatistics {
    return {
      rSquared: fit.rSquared,
      mae: fit.mae,
      mape: fit.mape,
      rmse: fit.rmse,
      dataPointsUsed: fit.dataPointsUsed,
    };
  }

  private mapTrendAnalysis(trend: {
    direction: string;
    monthlyGrowthRate: number;
    annualizedGrowthRate: number;
    isSignificant: boolean;
    volatility: number;
  }): TrendAnalysis {
    return {
      direction: trend.direction as RevenueTrend,
      monthlyGrowthRate: trend.monthlyGrowthRate,
      annualizedGrowthRate: trend.annualizedGrowthRate,
      isSignificant: trend.isSignificant,
      volatility: trend.volatility,
    };
  }

  private generateInsights(forecast: GenerateForecastOutput): readonly string[] {
    const insights: string[] = [];

    // Trend-based insights
    switch (forecast.trendAnalysis.direction) {
      case 'GROWING':
        insights.push(
          `Revenue is growing at ${Math.abs(forecast.trendAnalysis.annualizedGrowthRate).toFixed(1)}% annually`
        );
        if (forecast.trendAnalysis.annualizedGrowthRate > 20) {
          insights.push('Consider expanding capacity to meet increasing demand');
        }
        break;
      case 'DECLINING':
        insights.push(
          `Revenue is declining at ${Math.abs(forecast.trendAnalysis.annualizedGrowthRate).toFixed(1)}% annually`
        );
        insights.push('Review marketing strategies and patient retention programs');
        break;
      case 'STABLE':
        insights.push('Revenue is stable with minimal fluctuation');
        insights.push('Good time to invest in growth initiatives');
        break;
      case 'VOLATILE':
        insights.push('Revenue shows high volatility');
        insights.push('Consider diversifying revenue streams for stability');
        break;
    }

    // Confidence-based insights
    if (forecast.confidenceLevel === 'LOW') {
      insights.push('Forecast confidence is low due to limited historical data');
    }

    // Model fit insights
    if (forecast.modelFit.rSquared < 0.6) {
      insights.push('Model fit indicates irregular revenue patterns');
    }

    return insights;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a revenue forecasting use case instance
 */
export function createRevenueForecastingUseCase(
  revenueSnapshotRepository: IRevenueSnapshotRepository,
  config?: RevenueForecastingUseCaseConfig
): RevenueForecastingUseCase {
  return new RevenueForecastingUseCaseImpl(revenueSnapshotRepository, config);
}
