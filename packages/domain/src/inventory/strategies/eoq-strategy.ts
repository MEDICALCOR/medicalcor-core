/**
 * @fileoverview Economic Order Quantity (EOQ) Prediction Strategy
 *
 * Classic EOQ model implementation optimized for dental clinics.
 * Balances ordering costs against holding costs to minimize total
 * inventory cost while maintaining service levels.
 *
 * Best suited for:
 * - Established clinics with stable demand patterns
 * - Items with predictable usage
 * - Cost-conscious operations
 *
 * @module domain/inventory/strategies/eoq-strategy
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
 * EOQ strategy configuration
 */
export interface EOQStrategyConfig {
  /** Holding cost rate (percentage of item value per year) */
  readonly holdingCostRate: number;
  /** Fixed ordering cost per order */
  readonly orderingCostPerOrder: number;
  /** Service level target (0-1, probability of no stockout) */
  readonly serviceLevelTarget: number;
  /** Z-score lookup for service level (precomputed) */
  readonly zScoreForServiceLevel: number;
  /** Minimum days of history required for reliable predictions */
  readonly minHistoryDays: number;
  /** Critical threshold in days for stockout risk */
  readonly criticalThresholdDays: number;
  /** High risk threshold in days */
  readonly highRiskThresholdDays: number;
}

/**
 * Default EOQ configuration (95% service level)
 */
export const DEFAULT_EOQ_CONFIG: EOQStrategyConfig = {
  holdingCostRate: 0.25,
  orderingCostPerOrder: 50,
  serviceLevelTarget: 0.95,
  zScoreForServiceLevel: 1.645, // Z-score for 95% service level
  minHistoryDays: 30,
  criticalThresholdDays: 3,
  highRiskThresholdDays: 7,
} as const;

// ============================================================================
// EOQ STRATEGY IMPLEMENTATION
// ============================================================================

/**
 * Economic Order Quantity prediction strategy.
 *
 * Uses the Wilson EOQ formula with safety stock adjustments
 * based on demand variability and lead time.
 */
export class EOQStrategy implements InventoryPredictionStrategy {
  readonly strategyId = 'eoq';
  readonly name = 'Economic Order Quantity';

  private readonly config: EOQStrategyConfig;

  constructor(config?: Partial<EOQStrategyConfig>) {
    this.config = { ...DEFAULT_EOQ_CONFIG, ...config };
  }

  calculateReorderPoint(item: InventoryItem, usageHistory: UsageEvent[]): ReorderPoint {
    const { avgDaily, stdDevDaily } = this.calculateUsageStats(usageHistory);
    const leadTime = item.leadTimeDays || 7;

    // Safety stock = Z * σ * √L
    const safetyStock = Math.ceil(
      this.config.zScoreForServiceLevel * stdDevDaily * Math.sqrt(leadTime)
    );

    // Reorder point = (Average daily demand * Lead time) + Safety stock
    const reorderLevel = Math.ceil(avgDaily * leadTime + safetyStock);

    // Confidence based on history length
    const historyDays = this.getHistoryDays(usageHistory);
    const confidence = Math.min(1, historyDays / this.config.minHistoryDays);

    return {
      reorderLevel,
      safetyStock,
      averageDailyUsage: avgDaily,
      leadTimeDays: leadTime,
      confidence,
    };
  }

  predictStockout(item: InventoryItem, usageHistory: UsageEvent[]): StockoutPrediction {
    const { avgDaily } = this.calculateUsageStats(usageHistory);

    if (avgDaily <= 0) {
      return {
        predictedDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        daysUntilStockout: 365,
        probability: 0,
        riskLevel: 'none',
        recommendation: 'No usage detected. Consider removing from active inventory.',
      };
    }

    const daysUntilStockout = Math.floor(item.currentStock / avgDaily);
    const predictedDate = new Date(Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000);

    // Calculate probability based on lead time coverage
    const leadTime = item.leadTimeDays || 7;
    const coverageRatio = daysUntilStockout / leadTime;
    const probability =
      coverageRatio < 1 ? 1 - coverageRatio : Math.max(0, 1 - coverageRatio * 0.1);

    const riskLevel = this.classifyStockoutRisk(daysUntilStockout);
    const recommendation = this.generateStockoutRecommendation(daysUntilStockout, leadTime);

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
      return {
        quantity: 0,
        estimatedCost: 0,
        holdingCostPerUnit: item.unitPrice * this.config.holdingCostRate,
        annualDemand: 0,
        eoq: null,
        reasoning: 'No demand detected. Review if this item should remain in inventory.',
      };
    }

    // Wilson EOQ formula: Q* = √(2DS/H)
    // D = annual demand, S = ordering cost, H = holding cost per unit
    const holdingCostPerUnit = item.unitPrice * this.config.holdingCostRate;
    const eoq = Math.ceil(
      Math.sqrt((2 * annualDemand * this.config.orderingCostPerOrder) / holdingCostPerUnit)
    );

    // Adjust for max stock constraint if applicable
    const quantity = item.maxStock ? Math.min(eoq, item.maxStock - item.currentStock) : eoq;
    const finalQuantity = Math.max(0, quantity);

    const estimatedCost = finalQuantity * item.unitPrice;

    return {
      quantity: finalQuantity,
      estimatedCost,
      holdingCostPerUnit,
      annualDemand,
      eoq,
      reasoning: this.generateOrderReasoning(finalQuantity, eoq, item),
    };
  }

  predictExpiryRisk(item: InventoryItem, usageHistory: UsageEvent[]): ExpiryPrediction | null {
    if (!item.expiryDate) {
      return null;
    }

    const { avgDaily } = this.calculateUsageStats(usageHistory);
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

    const expectedUsageBeforeExpiry = Math.floor(avgDaily * daysUntilExpiry);
    const quantityAtRisk = Math.max(0, item.currentStock - expectedUsageBeforeExpiry);
    const recommendation = this.determineExpiryRecommendation(quantityAtRisk, daysUntilExpiry);

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

    return { avgDaily, stdDevDaily };
  }

  private getHistoryDays(usageHistory: UsageEvent[]): number {
    if (usageHistory.length === 0) return 0;

    const timestamps = usageHistory.map((e) => e.timestamp.getTime());
    const earliest = Math.min(...timestamps);
    const latest = Math.max(...timestamps);

    return Math.ceil((latest - earliest) / (24 * 60 * 60 * 1000));
  }

  private classifyStockoutRisk(daysUntilStockout: number): StockoutRisk {
    if (daysUntilStockout <= 0) return 'critical';
    if (daysUntilStockout <= this.config.criticalThresholdDays) return 'critical';
    if (daysUntilStockout <= this.config.highRiskThresholdDays) return 'high';
    if (daysUntilStockout <= 14) return 'medium';
    if (daysUntilStockout <= 30) return 'low';
    return 'none';
  }

  private generateStockoutRecommendation(daysUntilStockout: number, leadTime: number): string {
    if (daysUntilStockout <= 0) {
      return 'URGENT: Item is out of stock. Place emergency order immediately.';
    }
    if (daysUntilStockout < leadTime) {
      return `CRITICAL: Stock will run out before lead time (${leadTime} days). Place expedited order.`;
    }
    if (daysUntilStockout <= leadTime * 1.5) {
      return 'Place order now to maintain safety stock levels.';
    }
    if (daysUntilStockout <= leadTime * 2) {
      return 'Schedule reorder within the next few days.';
    }
    return 'Stock levels adequate. No immediate action required.';
  }

  private generateOrderReasoning(quantity: number, eoq: number, item: InventoryItem): string {
    if (quantity === 0) {
      return 'No order needed at this time.';
    }
    if (quantity < eoq && item.maxStock) {
      return `Order ${quantity} units (limited by max stock of ${item.maxStock}). EOQ suggests ${eoq} units.`;
    }
    return `Order ${quantity} units based on EOQ calculation to minimize total inventory cost.`;
  }

  private determineExpiryRecommendation(
    quantityAtRisk: number,
    daysUntilExpiry: number
  ): ExpiryRecommendation {
    if (quantityAtRisk === 0) return 'use_first';
    if (daysUntilExpiry <= 7) return 'dispose';
    if (daysUntilExpiry <= 14) return 'donate';
    if (daysUntilExpiry <= 30) return 'schedule_procedures';
    if (quantityAtRisk > 10) return 'transfer_to_other_clinic';
    return 'use_first';
  }
}

/**
 * Factory function for EOQ strategy
 */
export function createEOQStrategy(config?: Partial<EOQStrategyConfig>): EOQStrategy {
  return new EOQStrategy(config);
}
