/**
 * @fileoverview Inventory Prediction Service
 *
 * Banking-grade domain service for predictive inventory management.
 * Uses Strategy Pattern to support different prediction algorithms
 * based on clinic profile (small office vs. surgical center).
 *
 * The "Inventory Brain" - transforms reactive CRUD into proactive
 * demand forecasting and automated reorder recommendations.
 *
 * @module domain/inventory/inventory-prediction-service
 */

import type {
  InventoryPredictionStrategy,
  InventoryPredictionServiceConfig,
  InventoryPredictionServiceDeps,
  InventoryItem,
  UsageEvent,
  ReorderPoint,
  StockoutPrediction,
  OrderRecommendation,
  ExpiryPrediction,
  IInventoryRepository,
  StockoutRisk,
} from './interfaces.js';
import { DEFAULT_INVENTORY_CONFIG } from './interfaces.js';

// ============================================================================
// AGGREGATE TYPES
// ============================================================================

/**
 * Comprehensive inventory analysis result
 */
export interface InventoryAnalysis {
  /** The inventory item analyzed */
  readonly item: InventoryItem;
  /** Reorder point calculation */
  readonly reorderPoint: ReorderPoint;
  /** Stockout prediction */
  readonly stockoutPrediction: StockoutPrediction;
  /** Order recommendation */
  readonly orderRecommendation: OrderRecommendation;
  /** Expiry prediction (if applicable) */
  readonly expiryPrediction: ExpiryPrediction | null;
  /** Analysis timestamp */
  readonly analyzedAt: Date;
  /** Strategy used for analysis */
  readonly strategyId: string;
}

/**
 * Clinic-wide inventory health summary
 */
export interface InventoryHealthSummary {
  /** Total active items */
  readonly totalItems: number;
  /** Items with critical stockout risk */
  readonly criticalItems: number;
  /** Items with high stockout risk */
  readonly highRiskItems: number;
  /** Items expiring within 30 days */
  readonly expiringSoonItems: number;
  /** Total value of stock at risk */
  readonly valueAtRisk: number;
  /** Items below reorder point */
  readonly itemsBelowReorder: number;
  /** Total recommended order value */
  readonly totalRecommendedOrderValue: number;
  /** Health score (0-100) */
  readonly healthScore: number;
  /** Analysis timestamp */
  readonly analyzedAt: Date;
}

/**
 * Reorder alert for immediate attention
 */
export interface ReorderAlert {
  /** The item requiring attention */
  readonly item: InventoryItem;
  /** Urgency level */
  readonly urgency: 'critical' | 'high' | 'medium';
  /** Recommended action */
  readonly action: string;
  /** Recommended order quantity */
  readonly recommendedQuantity: number;
  /** Estimated cost */
  readonly estimatedCost: number;
  /** Days until stockout */
  readonly daysUntilStockout: number;
}

// ============================================================================
// INVENTORY PREDICTION SERVICE
// ============================================================================

/**
 * Inventory Prediction Service - The "Inventory Brain"
 *
 * Provides intelligent inventory management through:
 * - Demand forecasting based on historical usage
 * - Optimal reorder point calculation
 * - Stockout risk prediction
 * - Order quantity optimization
 * - Expiry risk management
 *
 * Uses Strategy Pattern for algorithm flexibility:
 * - EOQStrategy: Cost optimization (balanced approach)
 * - JITStrategy: Lean inventory (minimal stock)
 * - SafetyStockStrategy: High availability (maximum safety)
 *
 * @example
 * ```typescript
 * const service = createInventoryPredictionService({
 *   repository: inventoryRepo,
 *   strategy: new SafetyStockStrategy(), // For surgical center
 * });
 *
 * const analysis = await service.analyzeItem(clinicId, itemId);
 * const alerts = await service.getReorderAlerts(clinicId);
 * ```
 */
export class InventoryPredictionService {
  private readonly config: InventoryPredictionServiceConfig;
  private readonly repository: IInventoryRepository;
  private strategy: InventoryPredictionStrategy;

  constructor(
    deps: InventoryPredictionServiceDeps,
    config?: Partial<InventoryPredictionServiceConfig>
  ) {
    this.config = { ...DEFAULT_INVENTORY_CONFIG, ...config };
    this.repository = deps.repository;
    this.strategy = deps.strategy;
  }

  // ==========================================================================
  // STRATEGY MANAGEMENT
  // ==========================================================================

  /**
   * Get the current prediction strategy
   */
  getStrategy(): InventoryPredictionStrategy {
    return this.strategy;
  }

  /**
   * Switch to a different prediction strategy at runtime.
   *
   * This enables dynamic strategy selection based on:
   * - Item category (critical items use SafetyStock)
   * - Clinic profile changes
   * - Seasonal adjustments
   *
   * @param strategy - New strategy to use
   */
  setStrategy(strategy: InventoryPredictionStrategy): void {
    this.strategy = strategy;
  }

  // ==========================================================================
  // ITEM-LEVEL ANALYSIS
  // ==========================================================================

  /**
   * Perform comprehensive analysis on a single inventory item.
   *
   * @param clinicId - Clinic identifier
   * @param itemId - Inventory item identifier
   * @returns Full analysis including reorder point, stockout risk, and recommendations
   */
  async analyzeItem(clinicId: string, itemId: string): Promise<InventoryAnalysis | null> {
    const item = await this.repository.getItem(clinicId, itemId);
    if (!item) {
      return null;
    }

    const since = new Date(Date.now() - this.config.usageHistoryDays * 24 * 60 * 60 * 1000);
    const usageHistory = await this.repository.getUsageHistory(clinicId, itemId, since);

    return this.analyzeItemWithHistory(item, usageHistory);
  }

  /**
   * Analyze an item with pre-fetched usage history.
   * Useful for batch analysis to avoid multiple DB calls.
   */
  analyzeItemWithHistory(item: InventoryItem, usageHistory: UsageEvent[]): InventoryAnalysis {
    const reorderPoint = this.strategy.calculateReorderPoint(item, usageHistory);
    const stockoutPrediction = this.strategy.predictStockout(item, usageHistory);
    const orderRecommendation = this.strategy.recommendOrderQuantity(item, usageHistory);
    const expiryPrediction = this.strategy.predictExpiryRisk(item, usageHistory);

    return {
      item,
      reorderPoint,
      stockoutPrediction,
      orderRecommendation,
      expiryPrediction,
      analyzedAt: new Date(),
      strategyId: this.strategy.strategyId,
    };
  }

  // ==========================================================================
  // CLINIC-LEVEL ANALYSIS
  // ==========================================================================

  /**
   * Get health summary for all inventory in a clinic.
   *
   * @param clinicId - Clinic identifier
   * @returns Aggregate health metrics and risk summary
   */
  async getHealthSummary(clinicId: string): Promise<InventoryHealthSummary> {
    const items = await this.repository.getItems(clinicId);
    const since = new Date(Date.now() - this.config.usageHistoryDays * 24 * 60 * 60 * 1000);

    let criticalItems = 0;
    let highRiskItems = 0;
    let expiringSoonItems = 0;
    let valueAtRisk = 0;
    let itemsBelowReorder = 0;
    let totalRecommendedOrderValue = 0;

    for (const item of items) {
      const usageHistory = await this.repository.getUsageHistory(clinicId, item.id, since);
      const analysis = this.analyzeItemWithHistory(item, usageHistory);

      // Count risk levels
      if (analysis.stockoutPrediction.riskLevel === 'critical') {
        criticalItems++;
        valueAtRisk += item.currentStock * item.unitPrice;
      } else if (analysis.stockoutPrediction.riskLevel === 'high') {
        highRiskItems++;
        valueAtRisk += item.currentStock * item.unitPrice * 0.5; // 50% value at risk
      }

      // Count expiring items
      if (analysis.expiryPrediction && analysis.expiryPrediction.daysUntilExpiry <= 30) {
        expiringSoonItems++;
        valueAtRisk += analysis.expiryPrediction.quantityAtRisk * item.unitPrice;
      }

      // Count items below reorder point
      if (item.currentStock <= analysis.reorderPoint.reorderLevel) {
        itemsBelowReorder++;
      }

      // Sum recommended orders
      totalRecommendedOrderValue += analysis.orderRecommendation.estimatedCost;
    }

    // Calculate health score (0-100)
    const healthScore = this.calculateHealthScore(
      items.length,
      criticalItems,
      highRiskItems,
      expiringSoonItems,
      itemsBelowReorder
    );

    return {
      totalItems: items.length,
      criticalItems,
      highRiskItems,
      expiringSoonItems,
      valueAtRisk: Math.round(valueAtRisk * 100) / 100,
      itemsBelowReorder,
      totalRecommendedOrderValue: Math.round(totalRecommendedOrderValue * 100) / 100,
      healthScore,
      analyzedAt: new Date(),
    };
  }

  /**
   * Get urgent reorder alerts for items requiring immediate attention.
   *
   * @param clinicId - Clinic identifier
   * @returns List of items needing reorder, sorted by urgency
   */
  async getReorderAlerts(clinicId: string): Promise<ReorderAlert[]> {
    const items = await this.repository.getItems(clinicId);
    const since = new Date(Date.now() - this.config.usageHistoryDays * 24 * 60 * 60 * 1000);
    const alerts: ReorderAlert[] = [];

    for (const item of items) {
      const usageHistory = await this.repository.getUsageHistory(clinicId, item.id, since);
      const analysis = this.analyzeItemWithHistory(item, usageHistory);

      const urgency = this.mapRiskToUrgency(analysis.stockoutPrediction.riskLevel);
      if (urgency && analysis.orderRecommendation.quantity > 0) {
        alerts.push({
          item,
          urgency,
          action: analysis.stockoutPrediction.recommendation,
          recommendedQuantity: analysis.orderRecommendation.quantity,
          estimatedCost: analysis.orderRecommendation.estimatedCost,
          daysUntilStockout: analysis.stockoutPrediction.daysUntilStockout,
        });
      }
    }

    // Sort by urgency (critical > high > medium) then by days until stockout
    return alerts.sort((a, b) => {
      const urgencyOrder = { critical: 0, high: 1, medium: 2 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return a.daysUntilStockout - b.daysUntilStockout;
    });
  }

  /**
   * Get items that will expire soon with waste mitigation recommendations.
   *
   * @param clinicId - Clinic identifier
   * @param withinDays - Days threshold for expiry
   * @returns List of expiring items with recommendations
   */
  async getExpiringItems(
    clinicId: string,
    withinDays = 30
  ): Promise<{ item: InventoryItem; prediction: ExpiryPrediction }[]> {
    const items = await this.repository.getExpiringItems(clinicId, withinDays);
    const since = new Date(Date.now() - this.config.usageHistoryDays * 24 * 60 * 60 * 1000);
    const results: { item: InventoryItem; prediction: ExpiryPrediction }[] = [];

    for (const item of items) {
      const usageHistory = await this.repository.getUsageHistory(clinicId, item.id, since);
      const prediction = this.strategy.predictExpiryRisk(item, usageHistory);

      if (prediction) {
        results.push({ item, prediction });
      }
    }

    // Sort by days until expiry (most urgent first)
    return results.sort((a, b) => a.prediction.daysUntilExpiry - b.prediction.daysUntilExpiry);
  }

  // ==========================================================================
  // BATCH OPERATIONS
  // ==========================================================================

  /**
   * Analyze all items in a clinic and return full analysis.
   *
   * @param clinicId - Clinic identifier
   * @returns Array of analyses for all active items
   */
  async analyzeAllItems(clinicId: string): Promise<InventoryAnalysis[]> {
    const items = await this.repository.getItems(clinicId);
    const since = new Date(Date.now() - this.config.usageHistoryDays * 24 * 60 * 60 * 1000);
    const analyses: InventoryAnalysis[] = [];

    for (const item of items) {
      const usageHistory = await this.repository.getUsageHistory(clinicId, item.id, since);
      analyses.push(this.analyzeItemWithHistory(item, usageHistory));
    }

    return analyses;
  }

  /**
   * Generate a consolidated purchase order recommendation.
   *
   * @param clinicId - Clinic identifier
   * @returns Purchase order with all recommended items and total cost
   */
  async generatePurchaseOrderRecommendation(clinicId: string): Promise<{
    items: {
      item: InventoryItem;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      reasoning: string;
    }[];
    totalCost: number;
    totalItems: number;
    generatedAt: Date;
  }> {
    const analyses = await this.analyzeAllItems(clinicId);
    const items: {
      item: InventoryItem;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      reasoning: string;
    }[] = [];

    let totalCost = 0;

    for (const analysis of analyses) {
      if (analysis.orderRecommendation.quantity > 0) {
        const totalPrice = analysis.orderRecommendation.quantity * analysis.item.unitPrice;
        items.push({
          item: analysis.item,
          quantity: analysis.orderRecommendation.quantity,
          unitPrice: analysis.item.unitPrice,
          totalPrice,
          reasoning: analysis.orderRecommendation.reasoning,
        });
        totalCost += totalPrice;
      }
    }

    // Sort by total price (highest first for budget review)
    items.sort((a, b) => b.totalPrice - a.totalPrice);

    return {
      items,
      totalCost: Math.round(totalCost * 100) / 100,
      totalItems: items.length,
      generatedAt: new Date(),
    };
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private calculateHealthScore(
    totalItems: number,
    criticalItems: number,
    highRiskItems: number,
    expiringSoonItems: number,
    itemsBelowReorder: number
  ): number {
    if (totalItems === 0) return 100;

    // Weighted scoring:
    // - Critical items: -20 points each (max -60)
    // - High risk items: -10 points each (max -30)
    // - Expiring items: -5 points each (max -20)
    // - Items below reorder: -3 points each (max -20)

    let score = 100;
    score -= Math.min(60, criticalItems * 20);
    score -= Math.min(30, highRiskItems * 10);
    score -= Math.min(20, expiringSoonItems * 5);
    score -= Math.min(20, itemsBelowReorder * 3);

    return Math.max(0, Math.round(score));
  }

  private mapRiskToUrgency(riskLevel: StockoutRisk): 'critical' | 'high' | 'medium' | null {
    switch (riskLevel) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
      case 'none':
        return null;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an Inventory Prediction Service instance.
 *
 * @param deps - Service dependencies (repository and strategy)
 * @param config - Optional configuration overrides
 * @returns Configured service instance
 *
 * @example
 * ```typescript
 * // For a surgical center prioritizing availability
 * const surgicalService = createInventoryPredictionService({
 *   repository: inventoryRepo,
 *   strategy: createSafetyStockStrategy({ serviceLevelTarget: 0.99 }),
 * });
 *
 * // For a small clinic optimizing costs
 * const clinicService = createInventoryPredictionService({
 *   repository: inventoryRepo,
 *   strategy: createEOQStrategy({ holdingCostRate: 0.25 }),
 * });
 * ```
 */
export function createInventoryPredictionService(
  deps: InventoryPredictionServiceDeps,
  config?: Partial<InventoryPredictionServiceConfig>
): InventoryPredictionService {
  return new InventoryPredictionService(deps, config);
}
