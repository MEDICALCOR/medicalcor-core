/**
 * @fileoverview Inventory Prediction Strategy Interfaces
 *
 * Banking-grade strategy pattern implementation for predictive inventory
 * management. Enables swappable algorithms for different clinic profiles
 * (small dental office vs. large surgical hospital).
 *
 * @module domain/inventory/interfaces
 */

// ============================================================================
// VALUE TYPES
// ============================================================================

/**
 * Historical usage event for an inventory item
 */
export interface UsageEvent {
  /** Unique event identifier */
  readonly id: string;
  /** Inventory item identifier */
  readonly itemId: string;
  /** Quantity consumed */
  readonly quantity: number;
  /** Date of usage */
  readonly timestamp: Date;
  /** Usage reason/context */
  readonly reason: UsageReason;
  /** Associated procedure ID (if applicable) */
  readonly procedureId?: string;
  /** Associated patient ID (if applicable) - for HIPAA audit */
  readonly patientId?: string;
}

/**
 * Usage reason classification
 */
export type UsageReason =
  | 'procedure'
  | 'expired'
  | 'damaged'
  | 'lost'
  | 'returned_to_supplier'
  | 'sample'
  | 'adjustment';

/**
 * Inventory item with current stock levels
 */
export interface InventoryItem {
  readonly id: string;
  readonly clinicId: string;
  readonly name: string;
  readonly sku: string | null;
  readonly category: InventoryCategory;
  readonly currentStock: number;
  readonly minStock: number;
  readonly maxStock: number | null;
  readonly unitPrice: number;
  readonly unit: string;
  readonly leadTimeDays: number;
  readonly supplier: string | null;
  readonly expiryDate: Date | null;
  readonly isActive: boolean;
}

/**
 * Inventory categories for medical/dental supplies
 */
export type InventoryCategory =
  | 'consumables'
  | 'instruments'
  | 'implants'
  | 'prosthetics'
  | 'pharmaceuticals'
  | 'sterilization'
  | 'lab_materials'
  | 'office_supplies'
  | 'ppe'
  | 'other';

/**
 * Reorder point calculation result
 */
export interface ReorderPoint {
  /** Minimum stock level before reorder */
  readonly reorderLevel: number;
  /** Safety stock buffer */
  readonly safetyStock: number;
  /** Daily average usage rate */
  readonly averageDailyUsage: number;
  /** Lead time in days */
  readonly leadTimeDays: number;
  /** Confidence level (0-1) */
  readonly confidence: number;
}

/**
 * Stockout prediction result
 */
export interface StockoutPrediction {
  /** Predicted date of stockout */
  readonly predictedDate: Date;
  /** Days until stockout */
  readonly daysUntilStockout: number;
  /** Probability of stockout (0-1) */
  readonly probability: number;
  /** Risk level classification */
  readonly riskLevel: StockoutRisk;
  /** Recommended action */
  readonly recommendation: string;
}

/**
 * Stockout risk classification
 */
export type StockoutRisk = 'critical' | 'high' | 'medium' | 'low' | 'none';

/**
 * Order quantity recommendation
 */
export interface OrderRecommendation {
  /** Recommended quantity to order */
  readonly quantity: number;
  /** Estimated total cost */
  readonly estimatedCost: number;
  /** Holding cost per unit per period */
  readonly holdingCostPerUnit: number;
  /** Annual demand estimate */
  readonly annualDemand: number;
  /** Economic order quantity (if applicable) */
  readonly eoq: number | null;
  /** Reasoning for the recommendation */
  readonly reasoning: string;
}

/**
 * Expiry prediction for perishable items
 */
export interface ExpiryPrediction {
  /** Item ID */
  readonly itemId: string;
  /** Days until expiry */
  readonly daysUntilExpiry: number;
  /** Expected usage before expiry */
  readonly expectedUsageBeforeExpiry: number;
  /** Quantity at risk of expiring unused */
  readonly quantityAtRisk: number;
  /** Recommendation to minimize waste */
  readonly recommendation: ExpiryRecommendation;
}

/**
 * Expiry recommendation type
 */
export type ExpiryRecommendation =
  | 'use_first'
  | 'schedule_procedures'
  | 'transfer_to_other_clinic'
  | 'discount_sale'
  | 'donate'
  | 'dispose';

// ============================================================================
// STRATEGY INTERFACE
// ============================================================================

/**
 * Strategy interface for inventory prediction algorithms.
 *
 * Implementations can optimize for different clinic profiles:
 * - Small dental office: Minimize cash tied up in inventory
 * - Surgical center: Prioritize availability over cost
 * - Multi-clinic network: Optimize across locations
 *
 * @example
 * ```typescript
 * const strategy = new EOQStrategy({ holdingCostRate: 0.25 });
 * const reorderPoint = strategy.calculateReorderPoint(itemId, usageHistory);
 * ```
 */
export interface InventoryPredictionStrategy {
  /**
   * Strategy identifier for logging and configuration
   */
  readonly strategyId: string;

  /**
   * Human-readable strategy name
   */
  readonly name: string;

  /**
   * Calculates the optimal reorder point based on usage history.
   *
   * @param item - The inventory item
   * @param usageHistory - Historical usage events
   * @returns Reorder point with safety stock calculation
   */
  calculateReorderPoint(item: InventoryItem, usageHistory: UsageEvent[]): ReorderPoint;

  /**
   * Predicts when current stock will run out.
   *
   * @param item - The inventory item with current stock
   * @param usageHistory - Historical usage events
   * @returns Stockout prediction with risk assessment
   */
  predictStockout(item: InventoryItem, usageHistory: UsageEvent[]): StockoutPrediction;

  /**
   * Suggests optimal order quantity to balance cost vs. availability.
   *
   * @param item - The inventory item
   * @param usageHistory - Historical usage events
   * @returns Order recommendation with cost analysis
   */
  recommendOrderQuantity(item: InventoryItem, usageHistory: UsageEvent[]): OrderRecommendation;

  /**
   * Predicts expiry risk for perishable items.
   *
   * @param item - The inventory item
   * @param usageHistory - Historical usage events
   * @returns Expiry prediction with waste mitigation recommendation
   */
  predictExpiryRisk(item: InventoryItem, usageHistory: UsageEvent[]): ExpiryPrediction | null;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

/**
 * Repository interface for inventory data access
 */
export interface IInventoryRepository {
  /**
   * Get inventory item by ID
   */
  getItem(clinicId: string, itemId: string): Promise<InventoryItem | null>;

  /**
   * Get all active inventory items for a clinic
   */
  getItems(clinicId: string): Promise<InventoryItem[]>;

  /**
   * Get items below reorder point
   */
  getLowStockItems(clinicId: string): Promise<InventoryItem[]>;

  /**
   * Get items expiring within N days
   */
  getExpiringItems(clinicId: string, withinDays: number): Promise<InventoryItem[]>;

  /**
   * Get usage history for an item
   */
  getUsageHistory(clinicId: string, itemId: string, since: Date): Promise<UsageEvent[]>;

  /**
   * Record a usage event
   */
  recordUsage(clinicId: string, event: Omit<UsageEvent, 'id'>): Promise<UsageEvent>;

  /**
   * Update item stock level
   */
  updateStock(clinicId: string, itemId: string, newQuantity: number): Promise<InventoryItem>;
}

// ============================================================================
// SERVICE CONFIGURATION
// ============================================================================

/**
 * Configuration for the inventory prediction service
 */
export interface InventoryPredictionServiceConfig {
  /** Default lead time in days if not specified on item */
  readonly defaultLeadTimeDays: number;
  /** Holding cost rate (percentage of item value per year) */
  readonly holdingCostRate: number;
  /** Service level target (probability of no stockout, 0-1) */
  readonly serviceLevelTarget: number;
  /** Number of days to look back for usage history */
  readonly usageHistoryDays: number;
  /** Critical stockout threshold in days */
  readonly criticalThresholdDays: number;
  /** High risk threshold in days */
  readonly highRiskThresholdDays: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_INVENTORY_CONFIG: InventoryPredictionServiceConfig = {
  defaultLeadTimeDays: 7,
  holdingCostRate: 0.25,
  serviceLevelTarget: 0.95,
  usageHistoryDays: 90,
  criticalThresholdDays: 3,
  highRiskThresholdDays: 7,
} as const;

// ============================================================================
// SERVICE DEPENDENCIES
// ============================================================================

/**
 * Dependencies for the inventory prediction service
 */
export interface InventoryPredictionServiceDeps {
  /** Repository for inventory data access */
  readonly repository: IInventoryRepository;
  /** Prediction strategy to use */
  readonly strategy: InventoryPredictionStrategy;
}
