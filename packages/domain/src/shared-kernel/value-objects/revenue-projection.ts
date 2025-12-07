/**
 * @fileoverview RevenueProjection Value Object
 *
 * Banking/Medical Grade DDD Value Object for revenue forecasts.
 * Immutable, self-validating, and encapsulated.
 *
 * @module domain/shared-kernel/value-objects/revenue-projection
 *
 * DESIGN PRINCIPLES:
 * 1. IMMUTABILITY - Once created, cannot be changed
 * 2. SELF-VALIDATION - Invalid states are impossible
 * 3. EQUALITY BY VALUE - Two projections with same values are equal
 * 4. BUSINESS LOGIC ENCAPSULATION - Health assessment rules live here
 *
 * HEALTH THRESHOLDS:
 * - EXCELLENT: Growth > 15%, confidence HIGH
 * - GOOD: Growth > 5%, confidence >= MEDIUM
 * - FAIR: Stable or slight decline, any confidence
 * - POOR: Decline > 10% or very low confidence
 */

/**
 * Revenue trend direction types
 */
export type RevenueTrend = 'GROWING' | 'STABLE' | 'DECLINING' | 'VOLATILE';

/**
 * Forecast confidence level types
 */
export type ForecastConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Revenue health classification
 */
export type RevenueHealth = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';

/**
 * Financial quarter
 */
export type FinancialQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

/**
 * Confidence interval for the projection
 */
export interface ProjectionConfidenceInterval {
  readonly lower: number;
  readonly upper: number;
  readonly level: number;
}

/**
 * RevenueProjection Value Object
 *
 * Represents a forecasted revenue projection with confidence intervals
 * and trend analysis. This is a true Value Object following DDD principles.
 *
 * @example
 * ```typescript
 * // Create from forecast values
 * const projection = RevenueProjection.create({
 *   totalRevenue: 250000,
 *   periods: 6,
 *   growthRate: 12.5,
 *   trend: 'GROWING',
 *   confidenceLevel: 'HIGH',
 * });
 *
 * console.log(projection.health); // 'GOOD'
 * console.log(projection.isHealthy()); // true
 * console.log(projection.getMonthlyAverage()); // 41667
 *
 * // Business decisions
 * if (projection.requiresAttention()) {
 *   console.log(projection.getAlertActions());
 * }
 * ```
 */
export class RevenueProjection {
  /**
   * Total projected revenue in EUR
   */
  public readonly totalRevenue: number;

  /**
   * Number of periods in the forecast
   */
  public readonly periods: number;

  /**
   * Annualized growth rate (percentage)
   */
  public readonly annualizedGrowthRate: number;

  /**
   * Revenue trend direction
   */
  public readonly trend: RevenueTrend;

  /**
   * Forecast confidence level
   */
  public readonly confidenceLevel: ForecastConfidenceLevel;

  /**
   * Revenue health classification
   */
  public readonly health: RevenueHealth;

  /**
   * Confidence interval for total revenue
   */
  public readonly confidenceInterval: ProjectionConfidenceInterval;

  /**
   * Timestamp when projection was calculated
   */
  public readonly calculatedAt: Date;

  /**
   * Clinic identifier
   */
  public readonly clinicId: string;

  /**
   * Private constructor - use static factory methods
   */
  private constructor(
    totalRevenue: number,
    periods: number,
    annualizedGrowthRate: number,
    trend: RevenueTrend,
    confidenceLevel: ForecastConfidenceLevel,
    confidenceInterval: ProjectionConfidenceInterval,
    clinicId: string,
    calculatedAt: Date = new Date()
  ) {
    // INVARIANT: Total revenue must be non-negative
    if (typeof totalRevenue !== 'number' || totalRevenue < 0) {
      throw new InvalidRevenueProjectionError(
        `Total revenue must be a non-negative number, got: ${totalRevenue}`
      );
    }

    // INVARIANT: Periods must be positive integer
    if (!Number.isInteger(periods) || periods < 1) {
      throw new InvalidRevenueProjectionError(
        `Periods must be a positive integer, got: ${periods}`
      );
    }

    // INVARIANT: Confidence interval must be valid
    if (confidenceInterval.lower > confidenceInterval.upper) {
      throw new InvalidRevenueProjectionError(
        'Confidence interval lower bound cannot exceed upper bound'
      );
    }

    this.totalRevenue = Math.round(totalRevenue * 100) / 100;
    this.periods = periods;
    this.annualizedGrowthRate = Math.round(annualizedGrowthRate * 10) / 10;
    this.trend = trend;
    this.confidenceLevel = confidenceLevel;
    this.confidenceInterval = { ...confidenceInterval };
    this.clinicId = clinicId;
    this.calculatedAt = calculatedAt;
    this.health = RevenueProjection.determineHealth(annualizedGrowthRate, trend, confidenceLevel);

    // Freeze to ensure immutability
    Object.freeze(this.confidenceInterval);
    Object.freeze(this);
  }

  // ============================================================================
  // FACTORY METHODS
  // ============================================================================

  /**
   * Create RevenueProjection from forecast data
   */
  public static create(params: {
    totalRevenue: number;
    periods: number;
    annualizedGrowthRate: number;
    trend: RevenueTrend;
    confidenceLevel: ForecastConfidenceLevel;
    confidenceInterval: ProjectionConfidenceInterval;
    clinicId: string;
    calculatedAt?: Date;
  }): RevenueProjection {
    return new RevenueProjection(
      params.totalRevenue,
      params.periods,
      params.annualizedGrowthRate,
      params.trend,
      params.confidenceLevel,
      params.confidenceInterval,
      params.clinicId,
      params.calculatedAt
    );
  }

  /**
   * Create a growing projection (optimistic scenario)
   */
  public static growing(
    totalRevenue: number,
    periods: number,
    clinicId: string,
    growthRate = 15.0
  ): RevenueProjection {
    const intervalWidth = totalRevenue * 0.15;
    return new RevenueProjection(
      totalRevenue,
      periods,
      growthRate,
      'GROWING',
      'HIGH',
      {
        lower: totalRevenue - intervalWidth,
        upper: totalRevenue + intervalWidth,
        level: 0.95,
      },
      clinicId
    );
  }

  /**
   * Create a stable projection
   */
  public static stable(totalRevenue: number, periods: number, clinicId: string): RevenueProjection {
    const intervalWidth = totalRevenue * 0.2;
    return new RevenueProjection(
      totalRevenue,
      periods,
      0,
      'STABLE',
      'MEDIUM',
      {
        lower: totalRevenue - intervalWidth,
        upper: totalRevenue + intervalWidth,
        level: 0.95,
      },
      clinicId
    );
  }

  /**
   * Create a declining projection (pessimistic scenario)
   */
  public static declining(
    totalRevenue: number,
    periods: number,
    clinicId: string,
    declineRate = -10.0
  ): RevenueProjection {
    const intervalWidth = totalRevenue * 0.25;
    return new RevenueProjection(
      totalRevenue,
      periods,
      declineRate,
      'DECLINING',
      'MEDIUM',
      {
        lower: totalRevenue - intervalWidth,
        upper: totalRevenue + intervalWidth,
        level: 0.95,
      },
      clinicId
    );
  }

  /**
   * Parse from unknown input (for API/database hydration)
   */
  public static parse(input: unknown): RevenueProjectionParseResult {
    if (input instanceof RevenueProjection) {
      return { success: true, value: input };
    }

    if (typeof input === 'object' && input !== null) {
      const obj = input as Record<string, unknown>;
      try {
        if (
          'totalRevenue' in obj &&
          'periods' in obj &&
          'annualizedGrowthRate' in obj &&
          'trend' in obj &&
          'confidenceLevel' in obj &&
          'confidenceInterval' in obj &&
          'clinicId' in obj
        ) {
          return {
            success: true,
            value: RevenueProjection.create({
              totalRevenue: obj.totalRevenue as number,
              periods: obj.periods as number,
              annualizedGrowthRate: obj.annualizedGrowthRate as number,
              trend: obj.trend as RevenueTrend,
              confidenceLevel: obj.confidenceLevel as ForecastConfidenceLevel,
              confidenceInterval: obj.confidenceInterval as ProjectionConfidenceInterval,
              clinicId: obj.clinicId as string,
              calculatedAt: obj.calculatedAt ? new Date(obj.calculatedAt as string) : undefined,
            }),
          };
        }
      } catch (e) {
        return {
          success: false,
          error:
            e instanceof InvalidRevenueProjectionError
              ? e.message
              : 'Invalid revenue projection data',
        };
      }
    }

    return { success: false, error: `Cannot parse RevenueProjection from: ${typeof input}` };
  }

  // ============================================================================
  // CLASSIFICATION LOGIC
  // ============================================================================

  /**
   * Determine revenue health based on growth, trend, and confidence
   */
  private static determineHealth(
    growthRate: number,
    trend: RevenueTrend,
    confidence: ForecastConfidenceLevel
  ): RevenueHealth {
    // Excellent: Strong growth with high confidence
    if (growthRate >= 15 && confidence === 'HIGH' && trend === 'GROWING') {
      return 'EXCELLENT';
    }

    // Good: Positive growth with reasonable confidence
    if (
      growthRate >= 5 &&
      (confidence === 'HIGH' || confidence === 'MEDIUM') &&
      (trend === 'GROWING' || trend === 'STABLE')
    ) {
      return 'GOOD';
    }

    // Poor: Significant decline or very unreliable
    if (
      growthRate <= -10 ||
      trend === 'DECLINING' ||
      (confidence === 'LOW' && trend === 'VOLATILE')
    ) {
      return 'POOR';
    }

    // Fair: Everything else
    return 'FAIR';
  }

  // ============================================================================
  // QUERY METHODS (Tell, Don't Ask pattern)
  // ============================================================================

  /**
   * Check if revenue projection is healthy
   */
  public isHealthy(): boolean {
    return this.health === 'EXCELLENT' || this.health === 'GOOD';
  }

  /**
   * Check if revenue is growing
   */
  public isGrowing(): boolean {
    return this.trend === 'GROWING' && this.annualizedGrowthRate > 0;
  }

  /**
   * Check if revenue is declining
   */
  public isDeclining(): boolean {
    return this.trend === 'DECLINING' || this.annualizedGrowthRate < -5;
  }

  /**
   * Check if revenue is stable
   */
  public isStable(): boolean {
    return (
      this.trend === 'STABLE' ||
      (Math.abs(this.annualizedGrowthRate) <= 5 && this.trend !== 'VOLATILE')
    );
  }

  /**
   * Check if revenue is volatile
   */
  public isVolatile(): boolean {
    return this.trend === 'VOLATILE';
  }

  /**
   * Check if projection requires management attention
   */
  public requiresAttention(): boolean {
    return (
      this.health === 'POOR' ||
      this.trend === 'DECLINING' ||
      (this.confidenceLevel === 'LOW' && this.health !== 'EXCELLENT')
    );
  }

  /**
   * Check if projection is high confidence
   */
  public isHighConfidence(): boolean {
    return this.confidenceLevel === 'HIGH';
  }

  /**
   * Check if total revenue is within confidence interval
   */
  public isWithinInterval(actualRevenue: number): boolean {
    return (
      actualRevenue >= this.confidenceInterval.lower &&
      actualRevenue <= this.confidenceInterval.upper
    );
  }

  /**
   * Get monthly average projected revenue
   */
  public getMonthlyAverage(): number {
    return Math.round(this.totalRevenue / this.periods);
  }

  /**
   * Get quarterly projection (assumes monthly periods)
   */
  public getQuarterlyProjection(_quarter: FinancialQuarter): number {
    // Simplified: assume equal distribution
    // TODO: Implement quarter-specific projections based on seasonal factors
    const quarterlyShare = this.totalRevenue / 4;
    return Math.round(quarterlyShare);
  }

  /**
   * Get expected revenue change from current baseline
   */
  public getExpectedChange(currentAnnualRevenue: number): number {
    const projectedAnnual = (this.totalRevenue / this.periods) * 12;
    return Math.round(projectedAnnual - currentAnnualRevenue);
  }

  /**
   * Get actions to take based on projection health
   */
  public getAlertActions(): string[] {
    const actions: string[] = [];

    switch (this.health) {
      case 'EXCELLENT':
        actions.push('continue_current_strategy');
        actions.push('consider_expansion');
        break;
      case 'GOOD':
        actions.push('maintain_marketing_efforts');
        actions.push('optimize_operations');
        break;
      case 'FAIR':
        actions.push('review_marketing_roi');
        actions.push('analyze_patient_retention');
        actions.push('identify_growth_opportunities');
        break;
      case 'POOR':
        actions.push('urgent_revenue_review');
        actions.push('cost_reduction_analysis');
        actions.push('patient_acquisition_campaign');
        actions.push('service_portfolio_review');
        break;
      default: {
        // Exhaustive check - this should never happen
        const _exhaustiveCheck: never = this.health;
        void _exhaustiveCheck;
      }
    }

    // Add confidence-based actions
    if (this.confidenceLevel === 'LOW') {
      actions.push('improve_data_quality');
      actions.push('extend_historical_tracking');
    }

    // Add volatility-based actions
    if (this.isVolatile()) {
      actions.push('stabilize_revenue_streams');
      actions.push('diversify_services');
    }

    return actions;
  }

  /**
   * Get priority level for dashboard display
   */
  public getDashboardPriority(): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (this.health === 'POOR') return 'CRITICAL';
    if (this.health === 'FAIR' || this.requiresAttention()) return 'HIGH';
    if (this.health === 'GOOD') return 'MEDIUM';
    return 'LOW';
  }

  // ============================================================================
  // TRANSFORMATION METHODS
  // ============================================================================

  /**
   * Scale the projection by a factor
   * Returns new RevenueProjection (immutability preserved)
   */
  public scale(factor: number): RevenueProjection {
    return new RevenueProjection(
      this.totalRevenue * factor,
      this.periods,
      this.annualizedGrowthRate,
      this.trend,
      this.confidenceLevel,
      {
        lower: this.confidenceInterval.lower * factor,
        upper: this.confidenceInterval.upper * factor,
        level: this.confidenceInterval.level,
      },
      this.clinicId,
      this.calculatedAt
    );
  }

  /**
   * Extend the projection to more periods
   * Returns new RevenueProjection with extrapolated values
   */
  public extend(additionalPeriods: number): RevenueProjection {
    const monthlyRate = this.annualizedGrowthRate / 12 / 100;
    const newPeriods = this.periods + additionalPeriods;
    const extrapolatedRevenue =
      this.totalRevenue + this.getMonthlyAverage() * additionalPeriods * (1 + monthlyRate);

    // Confidence widens with extrapolation
    const confidenceWidening = 1 + additionalPeriods * 0.05;
    const newIntervalWidth =
      ((this.confidenceInterval.upper - this.confidenceInterval.lower) / 2) * confidenceWidening;
    const newMidpoint = extrapolatedRevenue;

    return new RevenueProjection(
      extrapolatedRevenue,
      newPeriods,
      this.annualizedGrowthRate,
      this.trend,
      this.confidenceLevel === 'HIGH' ? 'MEDIUM' : 'LOW', // Confidence degrades
      {
        lower: Math.max(0, newMidpoint - newIntervalWidth),
        upper: newMidpoint + newIntervalWidth,
        level: this.confidenceInterval.level,
      },
      this.clinicId,
      this.calculatedAt
    );
  }

  /**
   * Adjust growth rate
   * Returns new RevenueProjection with adjusted trend
   */
  public withGrowthRate(newGrowthRate: number): RevenueProjection {
    let newTrend: RevenueTrend;
    if (newGrowthRate > 5) {
      newTrend = 'GROWING';
    } else if (newGrowthRate < -5) {
      newTrend = 'DECLINING';
    } else {
      newTrend = 'STABLE';
    }

    return new RevenueProjection(
      this.totalRevenue,
      this.periods,
      newGrowthRate,
      newTrend,
      this.confidenceLevel,
      this.confidenceInterval,
      this.clinicId,
      this.calculatedAt
    );
  }

  // ============================================================================
  // EQUALITY & COMPARISON
  // ============================================================================

  /**
   * Value equality check
   */
  public equals(other: RevenueProjection): boolean {
    return (
      this.totalRevenue === other.totalRevenue &&
      this.periods === other.periods &&
      this.clinicId === other.clinicId &&
      this.trend === other.trend
    );
  }

  /**
   * Compare projections (for sorting by revenue)
   */
  public compareTo(other: RevenueProjection): number {
    return this.totalRevenue - other.totalRevenue;
  }

  /**
   * Check if this projection is higher than another
   */
  public isHigherThan(other: RevenueProjection): boolean {
    return this.totalRevenue > other.totalRevenue;
  }

  /**
   * Calculate variance from another projection
   */
  public varianceFrom(other: RevenueProjection): number {
    return this.totalRevenue - other.totalRevenue;
  }

  /**
   * Calculate percentage difference from another projection
   */
  public percentageDifferenceFrom(other: RevenueProjection): number {
    if (other.totalRevenue === 0) {
      return this.totalRevenue > 0 ? 100 : 0;
    }
    return ((this.totalRevenue - other.totalRevenue) / other.totalRevenue) * 100;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Convert to plain object (for JSON serialization)
   */
  public toJSON(): RevenueProjectionDTO {
    return {
      totalRevenue: this.totalRevenue,
      periods: this.periods,
      annualizedGrowthRate: this.annualizedGrowthRate,
      trend: this.trend,
      confidenceLevel: this.confidenceLevel,
      health: this.health,
      confidenceInterval: { ...this.confidenceInterval },
      clinicId: this.clinicId,
      calculatedAt: this.calculatedAt.toISOString(),
    };
  }

  /**
   * String representation
   */
  public toString(): string {
    return `RevenueProjection(€${this.totalRevenue.toLocaleString()}/${this.periods}mo, ${this.trend}, growth: ${this.annualizedGrowthRate}%, health: ${this.health})`;
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Error thrown when creating invalid RevenueProjection
 */
export class InvalidRevenueProjectionError extends Error {
  public readonly code = 'INVALID_REVENUE_PROJECTION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidRevenueProjectionError';
    Object.setPrototypeOf(this, InvalidRevenueProjectionError.prototype);
  }
}

/**
 * DTO for RevenueProjection serialization
 */
export interface RevenueProjectionDTO {
  totalRevenue: number;
  periods: number;
  annualizedGrowthRate: number;
  trend: RevenueTrend;
  confidenceLevel: ForecastConfidenceLevel;
  health: RevenueHealth;
  confidenceInterval: ProjectionConfidenceInterval;
  clinicId: string;
  calculatedAt: string;
}

/**
 * Parse result type
 */
export type RevenueProjectionParseResult =
  | { success: true; value: RevenueProjection }
  | { success: false; error: string };
