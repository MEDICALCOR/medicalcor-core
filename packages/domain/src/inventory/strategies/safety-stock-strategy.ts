/**
 * @fileoverview Safety Stock (High Availability) Prediction Strategy
 *
 * Conservative inventory strategy that prioritizes item availability
 * over cost optimization. Maintains higher safety stock levels to
 * minimize stockout risk for critical medical supplies.
 *
 * Best suited for:
 * - Surgical centers where stockouts are unacceptable
 * - Critical/emergency medical supplies
 * - Items with unreliable suppliers or long lead times
 * - High-revenue procedures where delays are costly
 *
 * @module domain/inventory/strategies/safety-stock-strategy
 */

import type {
  InventoryPredictionStrategy,
  InventoryItem,
  UsageEvent,
  ReorderPoint,
  StockoutPrediction,
  OrderRecommendation,
  ExpiryPrediction,
  StockoutRisk,
  ExpiryRecommendation,
} from '../interfaces.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Safety Stock strategy configuration
 */
export interface SafetyStockStrategyConfig {
  /** Target service level (probability of no stockout, 0-1) */
  readonly serviceLevelTarget: number;
  /** Z-score for the target service level */
  readonly zScoreForServiceLevel: number;
  /** Additional safety multiplier for critical items */
  readonly criticalItemMultiplier: number;
  /** Lead time variability factor (days) */
  readonly leadTimeVariabilityDays: number;
  /** Demand variability factor (percentage) */
  readonly demandVariabilityFactor: number;
  /** Holding cost rate (for ROI calculations) */
  readonly holdingCostRate: number;
  /** Critical threshold in days for stockout risk */
  readonly criticalThresholdDays: number;
  /** High risk threshold in days */
  readonly highRiskThresholdDays: number;
}

/**
 * Default Safety Stock configuration (99% service level)
 */
export const DEFAULT_SAFETY_STOCK_CONFIG: SafetyStockStrategyConfig = {
  serviceLevelTarget: 0.99,
  zScoreForServiceLevel: 2.326, // Z-score for 99% service level
  criticalItemMultiplier: 1.5,
  leadTimeVariabilityDays: 3,
  demandVariabilityFactor: 0.3,
  holdingCostRate: 0.25,
  criticalThresholdDays: 7,
  highRiskThresholdDays: 14,
} as const;

// ============================================================================
// SAFETY STOCK STRATEGY IMPLEMENTATION
// ============================================================================

/**
 * Safety Stock (High Availability) prediction strategy.
 *
 * Implements conservative inventory management with higher safety
 * stock levels to ensure 99%+ service level for critical supplies.
 */
export class SafetyStockStrategy implements InventoryPredictionStrategy {
  readonly strategyId = 'safety-stock';
  readonly name = 'Safety Stock (High Availability)';

  private readonly config: SafetyStockStrategyConfig;

  constructor(config?: Partial<SafetyStockStrategyConfig>) {
    this.config = { ...DEFAULT_SAFETY_STOCK_CONFIG, ...config };
  }

  calculateReorderPoint(item: InventoryItem, usageHistory: UsageEvent[]): ReorderPoint {
    const { avgDaily, stdDevDaily } = this.calculateUsageStats(usageHistory);
    const leadTime = item.leadTimeDays || 7;
    const leadTimeWithVariability = leadTime + this.config.leadTimeVariabilityDays;

    // Enhanced safety stock calculation:
    // SS = Z × √(L × σd² + d² × σL²)
    // where L = lead time, σd = demand std dev, d = avg demand, σL = lead time std dev
    const demandVariance = Math.pow(stdDevDaily, 2) * leadTimeWithVariability;
    const leadTimeVariance =
      Math.pow(avgDaily, 2) * Math.pow(this.config.leadTimeVariabilityDays, 2);
    const combinedStdDev = Math.sqrt(demandVariance + leadTimeVariance);

    let safetyStock = Math.ceil(this.config.zScoreForServiceLevel * combinedStdDev);

    // Apply critical item multiplier for high-value or essential items
    if (this.isCriticalItem(item)) {
      safetyStock = Math.ceil(safetyStock * this.config.criticalItemMultiplier);
    }

    // Minimum safety stock is at least 1 week of average usage
    safetyStock = Math.max(safetyStock, Math.ceil(avgDaily * 7));

    // Reorder point = (Average daily demand × Lead time) + Safety stock
    const reorderLevel = Math.ceil(avgDaily * leadTimeWithVariability + safetyStock);

    const historyDays = this.getHistoryDays(usageHistory);
    const confidence = Math.min(1, historyDays / 60); // Needs more history for high confidence

    return {
      reorderLevel,
      safetyStock,
      averageDailyUsage: avgDaily,
      leadTimeDays: leadTimeWithVariability,
      confidence,
    };
  }

  predictStockout(item: InventoryItem, usageHistory: UsageEvent[]): StockoutPrediction {
    const { avgDaily, stdDevDaily } = this.calculateUsageStats(usageHistory);

    if (avgDaily <= 0) {
      return {
        predictedDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        daysUntilStockout: 365,
        probability: 0,
        riskLevel: 'none',
        recommendation: 'No active usage. Maintain minimum safety stock for emergencies.',
      };
    }

    // Use pessimistic usage estimate (avg + 1 std dev) for safety
    const pessimisticDaily = avgDaily + stdDevDaily;
    const daysUntilStockout = Math.floor(item.currentStock / pessimisticDaily);
    const predictedDate = new Date(Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000);

    // Calculate probability based on safety stock coverage
    const reorderPoint = this.calculateReorderPoint(item, usageHistory);
    const stockAboveReorder = item.currentStock - reorderPoint.reorderLevel;
    const probability =
      stockAboveReorder < 0
        ? Math.min(1, Math.abs(stockAboveReorder) / reorderPoint.safetyStock)
        : 0;

    const riskLevel = this.classifyStockoutRisk(daysUntilStockout, item);
    const recommendation = this.generateSafetyStockRecommendation(
      daysUntilStockout,
      item,
      reorderPoint
    );

    return {
      predictedDate,
      daysUntilStockout,
      probability,
      riskLevel,
      recommendation,
    };
  }

  recommendOrderQuantity(item: InventoryItem, usageHistory: UsageEvent[]): OrderRecommendation {
    const { avgDaily } = this.calculateUsageStats(usageHistory);
    const annualDemand = avgDaily * 365;

    if (annualDemand <= 0) {
      // Still recommend minimum safety stock for emergencies
      const minQuantity = this.isCriticalItem(item) ? 5 : 2;
      return {
        quantity: Math.max(0, minQuantity - item.currentStock),
        estimatedCost: Math.max(0, minQuantity - item.currentStock) * item.unitPrice,
        holdingCostPerUnit: item.unitPrice * this.config.holdingCostRate,
        annualDemand: 0,
        eoq: null,
        reasoning:
          'Maintain minimum safety stock despite no recent demand (critical availability).',
      };
    }

    // Safety Stock strategy orders more, less frequently
    // Target: 4-6 weeks supply + safety stock
    const reorderPoint = this.calculateReorderPoint(item, usageHistory);
    const targetWeeksSupply = this.isCriticalItem(item) ? 6 : 4;
    const targetStock = avgDaily * 7 * targetWeeksSupply + reorderPoint.safetyStock;

    const quantity = Math.ceil(targetStock - item.currentStock);

    // Apply max stock constraint
    const finalQuantity = item.maxStock
      ? Math.min(Math.max(0, quantity), item.maxStock - item.currentStock)
      : Math.max(0, quantity);

    const estimatedCost = finalQuantity * item.unitPrice;
    const holdingCostPerUnit = item.unitPrice * this.config.holdingCostRate;

    return {
      quantity: finalQuantity,
      estimatedCost,
      holdingCostPerUnit,
      annualDemand,
      eoq: null, // Safety stock prioritizes availability over cost optimization
      reasoning: this.generateOrderReasoning(finalQuantity, targetWeeksSupply, item, reorderPoint),
    };
  }

  predictExpiryRisk(item: InventoryItem, usageHistory: UsageEvent[]): ExpiryPrediction | null {
    if (!item.expiryDate) {
      return null;
    }

    const { avgDaily, stdDevDaily } = this.calculateUsageStats(usageHistory);
    const now = new Date();
    const daysUntilExpiry = Math.floor(
      (item.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (daysUntilExpiry <= 0) {
      return {
        itemId: item.id,
        daysUntilExpiry: 0,
        expectedUsageBeforeExpiry: 0,
        quantityAtRisk: item.currentStock,
        recommendation: 'dispose',
      };
    }

    // Use conservative (lower) usage estimate for expiry risk
    const conservativeDaily = Math.max(0, avgDaily - stdDevDaily);
    const expectedUsageBeforeExpiry = Math.floor(conservativeDaily * daysUntilExpiry);
    const quantityAtRisk = Math.max(0, item.currentStock - expectedUsageBeforeExpiry);
    const recommendation = this.determineExpiryRecommendation(
      quantityAtRisk,
      daysUntilExpiry,
      item
    );

    return {
      itemId: item.id,
      daysUntilExpiry,
      expectedUsageBeforeExpiry,
      quantityAtRisk,
      recommendation,
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private calculateUsageStats(usageHistory: UsageEvent[]): {
    avgDaily: number;
    stdDevDaily: number;
  } {
    if (usageHistory.length === 0) {
      return { avgDaily: 0, stdDevDaily: 0 };
    }

    // Group usage by day
    const usageByDay = new Map<string, number>();
    for (const event of usageHistory) {
      if (event.reason === 'procedure' || event.reason === 'sample') {
        const dateParts = event.timestamp.toISOString().split('T');
        const dayKey = dateParts[0] ?? event.timestamp.toISOString().slice(0, 10);
        usageByDay.set(dayKey, (usageByDay.get(dayKey) ?? 0) + event.quantity);
      }
    }

    const dailyUsages = Array.from(usageByDay.values());
    if (dailyUsages.length === 0) {
      return { avgDaily: 0, stdDevDaily: 0 };
    }

    // Calculate mean
    const sum = dailyUsages.reduce((a, b) => a + b, 0);
    const avgDaily = sum / dailyUsages.length;

    // Calculate standard deviation
    const squaredDiffs = dailyUsages.map((usage) => Math.pow(usage - avgDaily, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / dailyUsages.length;
    const stdDevDaily = Math.sqrt(avgSquaredDiff);

    // Apply demand variability factor for extra safety
    const adjustedStdDev = stdDevDaily * (1 + this.config.demandVariabilityFactor);

    return { avgDaily, stdDevDaily: adjustedStdDev };
  }

  private getHistoryDays(usageHistory: UsageEvent[]): number {
    if (usageHistory.length === 0) return 0;

    const timestamps = usageHistory.map((e) => e.timestamp.getTime());
    const earliest = Math.min(...timestamps);
    const latest = Math.max(...timestamps);

    return Math.max(1, Math.ceil((latest - earliest) / (24 * 60 * 60 * 1000)));
  }

  private isCriticalItem(item: InventoryItem): boolean {
    const criticalCategories = ['implants', 'pharmaceuticals', 'sterilization', 'ppe'];
    return criticalCategories.includes(item.category);
  }

  private classifyStockoutRisk(daysUntilStockout: number, item: InventoryItem): StockoutRisk {
    const multiplier = this.isCriticalItem(item) ? 1.5 : 1;

    if (daysUntilStockout <= 0) return 'critical';
    if (daysUntilStockout <= this.config.criticalThresholdDays * multiplier) return 'critical';
    if (daysUntilStockout <= this.config.highRiskThresholdDays * multiplier) return 'high';
    if (daysUntilStockout <= 21) return 'medium';
    if (daysUntilStockout <= 30) return 'low';
    return 'none';
  }

  private generateSafetyStockRecommendation(
    daysUntilStockout: number,
    item: InventoryItem,
    reorderPoint: ReorderPoint
  ): string {
    const isCritical = this.isCriticalItem(item);
    const criticalLabel = isCritical ? 'CRITICAL ITEM: ' : '';

    if (daysUntilStockout <= 0) {
      return `${criticalLabel}OUT OF STOCK. Initiate emergency procurement immediately.`;
    }
    if (daysUntilStockout <= reorderPoint.leadTimeDays) {
      return `${criticalLabel}Below safety threshold. Place expedited order to restore ${this.config.serviceLevelTarget * 100}% service level.`;
    }
    if (item.currentStock < reorderPoint.reorderLevel) {
      return `${criticalLabel}Stock below reorder point. Order now to maintain safety buffer.`;
    }
    if (item.currentStock < reorderPoint.reorderLevel + reorderPoint.safetyStock) {
      return 'Stock adequate but consider proactive replenishment for optimal safety margin.';
    }
    return 'Stock levels healthy. Safety buffer maintained for high availability.';
  }

  private generateOrderReasoning(
    quantity: number,
    targetWeeks: number,
    item: InventoryItem,
    reorderPoint: ReorderPoint
  ): string {
    if (quantity <= 0) {
      return `Stock adequate. Safety buffer of ${reorderPoint.safetyStock} units maintained.`;
    }

    const isCritical = this.isCriticalItem(item);
    const criticalNote = isCritical ? ' (critical item - enhanced safety stock)' : '';

    return `Order ${quantity} units for ${targetWeeks}-week supply + ${reorderPoint.safetyStock} safety stock${criticalNote}. Target: ${this.config.serviceLevelTarget * 100}% service level.`;
  }

  private determineExpiryRecommendation(
    quantityAtRisk: number,
    daysUntilExpiry: number,
    item: InventoryItem
  ): ExpiryRecommendation {
    if (quantityAtRisk === 0) return 'use_first';

    // Critical items: try harder to use before expiry
    if (this.isCriticalItem(item)) {
      if (daysUntilExpiry <= 14) return 'schedule_procedures';
      if (daysUntilExpiry <= 30) return 'transfer_to_other_clinic';
    }

    if (daysUntilExpiry <= 7) return 'dispose';
    if (daysUntilExpiry <= 14) return 'donate';
    if (daysUntilExpiry <= 30) return 'schedule_procedures';
    if (quantityAtRisk > 20) return 'transfer_to_other_clinic';
    return 'use_first';
  }
}

/**
 * Factory function for Safety Stock strategy
 */
export function createSafetyStockStrategy(
  config?: Partial<SafetyStockStrategyConfig>
): SafetyStockStrategy {
  return new SafetyStockStrategy(config);
}
