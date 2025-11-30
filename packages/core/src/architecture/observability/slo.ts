/**
 * @module architecture/observability/slo
 *
 * SLO (Service Level Objective) Monitoring
 * ========================================
 *
 * Track and alert on service level objectives.
 */

// ============================================================================
// SLO TYPES
// ============================================================================

/**
 * Service Level Indicator (SLI)
 */
export interface SLI {
  readonly name: string;
  readonly type: SLIType;
  readonly description: string;
  readonly unit: string;
  current(): Promise<number>;
}

export type SLIType =
  | 'availability'
  | 'latency'
  | 'throughput'
  | 'error_rate'
  | 'saturation'
  | 'custom';

/**
 * Service Level Objective (SLO)
 */
export interface SLO {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sli: SLI;
  readonly target: number;
  readonly window: SLOWindow;
  readonly alerting: AlertingConfig;
}

export interface SLOWindow {
  readonly type: 'rolling' | 'calendar';
  readonly duration: number; // in seconds
}

export interface AlertingConfig {
  readonly burnRateThresholds: BurnRateThreshold[];
  readonly errorBudgetThresholds: ErrorBudgetThreshold[];
}

export interface BurnRateThreshold {
  readonly window: number; // in seconds
  readonly burnRate: number;
  readonly severity: AlertSeverity;
}

export interface ErrorBudgetThreshold {
  readonly percentRemaining: number;
  readonly severity: AlertSeverity;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * SLO status
 */
export interface SLOStatus {
  readonly sloId: string;
  readonly sloName: string;
  readonly currentValue: number;
  readonly target: number;
  readonly isMet: boolean;
  readonly errorBudget: ErrorBudget;
  readonly burnRate: BurnRate;
  readonly trend: SLOTrend;
  readonly calculatedAt: Date;
}

export interface ErrorBudget {
  readonly total: number;
  readonly consumed: number;
  readonly remaining: number;
  readonly percentRemaining: number;
}

export interface BurnRate {
  readonly current: number;
  readonly windows: { window: number; rate: number }[];
}

export interface SLOTrend {
  readonly direction: 'improving' | 'stable' | 'degrading';
  readonly changePercent: number;
  readonly predictedBudgetExhaustion?: Date;
}

// ============================================================================
// SLO CALCULATOR
// ============================================================================

export class SLOCalculator {
  private measurements = new Map<string, SLOMeasurement[]>();
  private maxMeasurements = 10000;

  /**
   * Record a measurement for an SLI
   */
  recordMeasurement(sliName: string, value: number, timestamp?: Date): void {
    const measurements = this.measurements.get(sliName) ?? [];
    measurements.push({
      value,
      timestamp: timestamp ?? new Date(),
    });

    // Keep only recent measurements
    if (measurements.length > this.maxMeasurements) {
      measurements.shift();
    }

    this.measurements.set(sliName, measurements);
  }

  /**
   * Calculate SLO status
   */
  async calculateStatus(slo: SLO): Promise<SLOStatus> {
    const currentValue = await slo.sli.current();
    const isMet = this.checkIfMet(slo, currentValue);
    const errorBudget = this.calculateErrorBudget(slo, currentValue);
    const burnRate = this.calculateBurnRate(slo);
    const trend = this.calculateTrend(slo, errorBudget);

    return {
      sloId: slo.id,
      sloName: slo.name,
      currentValue,
      target: slo.target,
      isMet,
      errorBudget,
      burnRate,
      trend,
      calculatedAt: new Date(),
    };
  }

  private checkIfMet(slo: SLO, currentValue: number): boolean {
    // For availability/success rate, higher is better
    // For latency/error rate, lower is better
    switch (slo.sli.type) {
      case 'availability':
      case 'throughput':
        return currentValue >= slo.target;
      case 'latency':
      case 'error_rate':
      case 'saturation':
        return currentValue <= slo.target;
      default:
        return currentValue >= slo.target;
    }
  }

  private calculateErrorBudget(slo: SLO, currentValue: number): ErrorBudget {
    // For availability SLOs
    const total = 100 - slo.target; // e.g., 0.1% for 99.9% availability
    const consumed = Math.max(0, slo.target - currentValue);
    const remaining = total - consumed;

    return {
      total,
      consumed,
      remaining: Math.max(0, remaining),
      percentRemaining: total > 0 ? (remaining / total) * 100 : 0,
    };
  }

  private calculateBurnRate(slo: SLO): BurnRate {
    const measurements = this.measurements.get(slo.sli.name) ?? [];
    if (measurements.length === 0) {
      return { current: 0, windows: [] };
    }

    const windows: { window: number; rate: number }[] = [];

    for (const threshold of slo.alerting.burnRateThresholds) {
      const windowStart = new Date(Date.now() - threshold.window * 1000);
      const windowMeasurements = measurements.filter((m) => m.timestamp >= windowStart);

      if (windowMeasurements.length > 0) {
        const badMeasurements = windowMeasurements.filter((m) => {
          switch (slo.sli.type) {
            case 'availability':
            case 'throughput':
              return m.value < slo.target;
            default:
              return m.value > slo.target;
          }
        });

        const rate = badMeasurements.length / windowMeasurements.length;
        windows.push({ window: threshold.window, rate });
      }
    }

    return {
      current: windows[0]?.rate ?? 0,
      windows,
    };
  }

  private calculateTrend(slo: SLO, errorBudget: ErrorBudget): SLOTrend {
    const measurements = this.measurements.get(slo.sli.name) ?? [];
    if (measurements.length < 2) {
      return { direction: 'stable', changePercent: 0 };
    }

    // Compare recent vs older measurements
    const midpoint = Math.floor(measurements.length / 2);
    const recentAvg = this.average(measurements.slice(midpoint).map((m) => m.value));
    const olderAvg = this.average(measurements.slice(0, midpoint).map((m) => m.value));

    const change = recentAvg - olderAvg;
    const changePercent = olderAvg !== 0 ? (change / olderAvg) * 100 : 0;

    let direction: SLOTrend['direction'];
    if (Math.abs(changePercent) < 1) {
      direction = 'stable';
    } else if (slo.sli.type === 'latency' || slo.sli.type === 'error_rate') {
      direction = change < 0 ? 'improving' : 'degrading';
    } else {
      direction = change > 0 ? 'improving' : 'degrading';
    }

    // Predict budget exhaustion
    let predictedBudgetExhaustion: Date | undefined;
    if (direction === 'degrading' && errorBudget.percentRemaining > 0) {
      const burnRatePerHour = errorBudget.consumed / (slo.window.duration / 3600);
      if (burnRatePerHour > 0) {
        const hoursUntilExhaustion = errorBudget.remaining / burnRatePerHour;
        predictedBudgetExhaustion = new Date(Date.now() + hoursUntilExhaustion * 60 * 60 * 1000);
      }
    }

    return {
      direction,
      changePercent,
      predictedBudgetExhaustion,
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

interface SLOMeasurement {
  value: number;
  timestamp: Date;
}

// ============================================================================
// SLO REGISTRY
// ============================================================================

export class SLORegistry {
  private slos = new Map<string, SLO>();
  private calculator = new SLOCalculator();

  /**
   * Register an SLO
   */
  register(slo: SLO): void {
    this.slos.set(slo.id, slo);
  }

  /**
   * Get all SLOs
   */
  getAll(): SLO[] {
    return Array.from(this.slos.values());
  }

  /**
   * Get SLO by ID
   */
  get(id: string): SLO | undefined {
    return this.slos.get(id);
  }

  /**
   * Record measurement for SLI
   */
  recordMeasurement(sliName: string, value: number): void {
    this.calculator.recordMeasurement(sliName, value);
  }

  /**
   * Get status of all SLOs
   */
  async getAllStatus(): Promise<SLOStatus[]> {
    const results: SLOStatus[] = [];
    for (const slo of this.slos.values()) {
      results.push(await this.calculator.calculateStatus(slo));
    }
    return results;
  }

  /**
   * Get status of a specific SLO
   */
  async getStatus(id: string): Promise<SLOStatus | null> {
    const slo = this.slos.get(id);
    if (!slo) return null;
    return this.calculator.calculateStatus(slo);
  }

  /**
   * Check for SLO alerts
   */
  async checkAlerts(): Promise<SLOAlert[]> {
    const alerts: SLOAlert[] = [];

    for (const slo of this.slos.values()) {
      const status = await this.calculator.calculateStatus(slo);

      // Check error budget thresholds
      for (const threshold of slo.alerting.errorBudgetThresholds) {
        if (status.errorBudget.percentRemaining <= threshold.percentRemaining) {
          alerts.push({
            sloId: slo.id,
            sloName: slo.name,
            type: 'error_budget',
            severity: threshold.severity,
            message: `Error budget is at ${status.errorBudget.percentRemaining.toFixed(1)}% (threshold: ${threshold.percentRemaining}%)`,
            timestamp: new Date(),
          });
        }
      }

      // Check burn rate thresholds
      for (const threshold of slo.alerting.burnRateThresholds) {
        const windowRate = status.burnRate.windows.find((w) => w.window === threshold.window);
        if (windowRate && windowRate.rate >= threshold.burnRate) {
          alerts.push({
            sloId: slo.id,
            sloName: slo.name,
            type: 'burn_rate',
            severity: threshold.severity,
            message: `Burn rate is ${(windowRate.rate * 100).toFixed(1)}% in ${threshold.window}s window (threshold: ${(threshold.burnRate * 100).toFixed(1)}%)`,
            timestamp: new Date(),
          });
        }
      }
    }

    return alerts;
  }
}

export interface SLOAlert {
  sloId: string;
  sloName: string;
  type: 'error_budget' | 'burn_rate';
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
}

// Singleton registry
export const sloRegistry = new SLORegistry();
