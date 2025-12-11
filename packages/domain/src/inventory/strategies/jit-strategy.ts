/**
 * @fileoverview Just-In-Time (JIT) Prediction Strategy
 *
 * Lean inventory strategy that minimizes stock holdings by ordering
 * closer to actual need. Reduces carrying costs but requires
 * reliable suppliers and accurate demand forecasting.
 *
 * Best suited for:
 * - Clinics with reliable suppliers
 * - High-value items with high carrying costs
 * - Items with short shelf life
 * - Clinics with limited storage space
 *
 * @module domain/inventory/strategies/jit-strategy
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
 * JIT strategy configuration
 */
export interface JITStrategyConfig {
  /** Buffer days beyond lead time for safety */
  readonly bufferDays: number;
  /** Target inventory turnover (times per year) */
  readonly targetTurnover: number;
  /** Maximum order frequency (orders per month) */
  readonly maxOrdersPerMonth: number;
  /** Supplier reliability factor (0-1) */
  readonly supplierReliability: number;
  /** Critical threshold in days for stockout risk */
  readonly criticalThresholdDays: number;
  /** High risk threshold in days */
  readonly highRiskThresholdDays: number;
}

/**
 * Default JIT configuration
 */
export const DEFAULT_JIT_CONFIG: JITStrategyConfig = {
  bufferDays: 2,
  targetTurnover: 12, // Monthly turnover target
  maxOrdersPerMonth: 4, // Weekly ordering maximum
  supplierReliability: 0.95,
  criticalThresholdDays: 2,
  highRiskThresholdDays: 5,
} as const;

// ============================================================================
// JIT STRATEGY IMPLEMENTATION
// ============================================================================

/**
 * Just-In-Time prediction strategy.
 *
 * Minimizes inventory holdings by ordering smaller quantities
 * more frequently, timed to arrive just before they're needed.
 */
export class JITStrategy implements InventoryPredictionStrategy {
  readonly strategyId = 'jit';
  readonly name = 'Just-In-Time';

  private readonly config: JITStrategyConfig;

  constructor(config?: Partial<JITStrategyConfig>) {
    this.config = { ...DEFAULT_JIT_CONFIG, ...config };
  }

  calculateReorderPoint(item: InventoryItem, usageHistory: UsageEvent[]): ReorderPoint {
    const avgDaily = this.calculateAverageDailyUsage(usageHistory);
    const leadTime = item.leadTimeDays || 7;

    // JIT uses minimal safety stock - just buffer for supplier reliability
    const reliabilityBuffer = Math.ceil(
      leadTime * (1 - this.config.supplierReliability) * avgDaily
    );
    const safetyStock = reliabilityBuffer + Math.ceil(avgDaily * this.config.bufferDays);

    // Reorder point: demand during lead time + minimal safety stock
    const reorderLevel = Math.ceil(avgDaily * leadTime + safetyStock);

    const historyDays = this.getHistoryDays(usageHistory);
    const confidence = Math.min(1, historyDays / 30) * this.config.supplierReliability;

    return {
      reorderLevel,
      safetyStock,
      averageDailyUsage: avgDaily,
      leadTimeDays: leadTime,
      confidence,
    };
  }

  predictStockout(item: InventoryItem, usageHistory: UsageEvent[]): StockoutPrediction {
    const avgDaily = this.calculateAverageDailyUsage(usageHistory);

    if (avgDaily <= 0) {
      return {
        predictedDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        daysUntilStockout: 365,
        probability: 0,
        riskLevel: 'none',
        recommendation: 'Item has no recent usage. Consider reducing stock to minimum.',
      };
    }

    const daysUntilStockout = Math.floor(item.currentStock / avgDaily);
    const predictedDate = new Date(Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000);

    // JIT has higher stockout probability due to lower safety stock
    const leadTime = item.leadTimeDays || 7;
    const coverageRatio = daysUntilStockout / (leadTime + this.config.bufferDays);
    const probability = coverageRatio < 1 ? 1 - coverageRatio * 0.8 : 0.1;

    const riskLevel = this.classifyStockoutRisk(daysUntilStockout);
    const recommendation = this.generateJITRecommendation(daysUntilStockout, leadTime, avgDaily);

    return {
      predictedDate,
      daysUntilStockout,
      probability,
      riskLevel,
      recommendation,
    };
  }

  recommendOrderQuantity(item: InventoryItem, usageHistory: UsageEvent[]): OrderRecommendation {
    const avgDaily = this.calculateAverageDailyUsage(usageHistory);
    const annualDemand = avgDaily * 365;

    if (annualDemand <= 0) {
      return {
        quantity: 0,
        estimatedCost: 0,
        holdingCostPerUnit: 0,
        annualDemand: 0,
        eoq: null,
        reasoning: 'No demand detected. JIT suggests maintaining zero inventory.',
      };
    }

    // JIT orders based on target turnover
    // Order quantity = monthly demand / (maxOrdersPerMonth)
    const monthlyDemand = avgDaily * 30;
    const jitQuantity = Math.ceil(monthlyDemand / this.config.maxOrdersPerMonth);

    // Adjust for current stock and min order
    const currentDeficit = Math.max(0, item.minStock - item.currentStock);
    const quantity = Math.max(jitQuantity, currentDeficit);

    // Apply max stock constraint
    const finalQuantity = item.maxStock
      ? Math.min(quantity, item.maxStock - item.currentStock)
      : quantity;

    const estimatedCost = Math.max(0, finalQuantity) * item.unitPrice;

    return {
      quantity: Math.max(0, finalQuantity),
      estimatedCost,
      holdingCostPerUnit: item.unitPrice * 0.25, // Assumed 25% holding cost
      annualDemand,
      eoq: null, // JIT doesn't use EOQ
      reasoning: this.generateOrderReasoning(finalQuantity, jitQuantity, item),
    };
  }

  predictExpiryRisk(item: InventoryItem, usageHistory: UsageEvent[]): ExpiryPrediction | null {
    if (!item.expiryDate) {
      return null;
    }

    const avgDaily = this.calculateAverageDailyUsage(usageHistory);
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

  private calculateAverageDailyUsage(usageHistory: UsageEvent[]): number {
    if (usageHistory.length === 0) return 0;

    const procedureUsage = usageHistory.filter(
      (e) => e.reason === 'procedure' || e.reason === 'sample'
    );

    if (procedureUsage.length === 0) return 0;

    const totalUsage = procedureUsage.reduce((sum, e) => sum + e.quantity, 0);
    const historyDays = this.getHistoryDays(usageHistory) || 1;

    return totalUsage / historyDays;
  }

  private getHistoryDays(usageHistory: UsageEvent[]): number {
    if (usageHistory.length === 0) return 0;

    const timestamps = usageHistory.map((e) => e.timestamp.getTime());
    const earliest = Math.min(...timestamps);
    const latest = Math.max(...timestamps);

    return Math.max(1, Math.ceil((latest - earliest) / (24 * 60 * 60 * 1000)));
  }

  private classifyStockoutRisk(daysUntilStockout: number): StockoutRisk {
    if (daysUntilStockout <= 0) return 'critical';
    if (daysUntilStockout <= this.config.criticalThresholdDays) return 'critical';
    if (daysUntilStockout <= this.config.highRiskThresholdDays) return 'high';
    if (daysUntilStockout <= 10) return 'medium';
    if (daysUntilStockout <= 20) return 'low';
    return 'none';
  }

  private generateJITRecommendation(
    daysUntilStockout: number,
    leadTime: number,
    avgDaily: number
  ): string {
    if (daysUntilStockout <= 0) {
      return 'CRITICAL: Out of stock. Place expedited order immediately.';
    }
    if (daysUntilStockout <= leadTime) {
      const expeditedQty = Math.ceil(avgDaily * (leadTime - daysUntilStockout + 3));
      return `URGENT: Order ${expeditedQty} units with expedited shipping.`;
    }
    if (daysUntilStockout <= leadTime + this.config.bufferDays) {
      return 'Place standard JIT order now to maintain lean inventory levels.';
    }
    return 'JIT: Stock adequate. Next order based on demand velocity.';
  }

  private generateOrderReasoning(
    quantity: number,
    jitQuantity: number,
    item: InventoryItem
  ): string {
    if (quantity <= 0) {
      return 'JIT: Current stock is sufficient. No order needed.';
    }
    if (quantity > jitQuantity && item.maxStock) {
      return `JIT order adjusted to ${quantity} units (stock below minimum threshold).`;
    }
    return `JIT: Order ${quantity} units for ~1 week supply (${this.config.maxOrdersPerMonth}x/month frequency).`;
  }

  private determineExpiryRecommendation(
    quantityAtRisk: number,
    daysUntilExpiry: number
  ): ExpiryRecommendation {
    // JIT is more aggressive about reducing expiry risk
    if (quantityAtRisk === 0) return 'use_first';
    if (daysUntilExpiry <= 5) return 'dispose';
    if (daysUntilExpiry <= 10) return 'donate';
    if (daysUntilExpiry <= 20) return 'schedule_procedures';
    return 'transfer_to_other_clinic';
  }
}

/**
 * Factory function for JIT strategy
 */
export function createJITStrategy(config?: Partial<JITStrategyConfig>): JITStrategy {
  return new JITStrategy(config);
}
