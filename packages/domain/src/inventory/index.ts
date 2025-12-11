/**
 * @fileoverview Inventory Prediction Module
 *
 * Banking-grade inventory management with Strategy Pattern for
 * swappable prediction algorithms. The "Inventory Brain" transforms
 * reactive CRUD into proactive demand forecasting.
 *
 * ## Strategy Pattern Usage
 *
 * Choose the right strategy for your clinic profile:
 *
 * - **EOQStrategy**: Balanced approach for established clinics with stable demand.
 *   Minimizes total inventory cost using Economic Order Quantity formula.
 *
 * - **JITStrategy**: Lean inventory for clinics with reliable suppliers.
 *   Minimizes stock holdings by ordering smaller quantities more frequently.
 *
 * - **SafetyStockStrategy**: High availability for surgical centers.
 *   Maintains larger safety buffers for 99%+ service level.
 *
 * @module domain/inventory
 *
 * @example
 * ```typescript
 * import {
 *   createInventoryPredictionService,
 *   createSafetyStockStrategy,
 *   createEOQStrategy,
 *   createJITStrategy,
 *   type InventoryPredictionStrategy,
 * } from '@medicalcor/domain/inventory';
 *
 * // For a surgical center
 * const surgicalService = createInventoryPredictionService({
 *   repository: inventoryRepo,
 *   strategy: createSafetyStockStrategy({ serviceLevelTarget: 0.99 }),
 * });
 *
 * // Get reorder alerts
 * const alerts = await surgicalService.getReorderAlerts(clinicId);
 *
 * // Get health summary
 * const health = await surgicalService.getHealthSummary(clinicId);
 *
 * // Switch strategy at runtime for specific analysis
 * surgicalService.setStrategy(createJITStrategy());
 * ```
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

export {
  // Strategy Interface
  type InventoryPredictionStrategy,

  // Repository Interface
  type IInventoryRepository,

  // Configuration
  type InventoryPredictionServiceConfig,
  type InventoryPredictionServiceDeps,
  DEFAULT_INVENTORY_CONFIG,

  // Core Types
  type UsageEvent,
  type UsageReason,
  type InventoryItem,
  type InventoryCategory,

  // Prediction Results
  type ReorderPoint,
  type StockoutPrediction,
  type StockoutRisk,
  type OrderRecommendation,
  type ExpiryPrediction,
  type ExpiryRecommendation,
} from './interfaces.js';

// ============================================================================
// PREDICTION STRATEGIES
// ============================================================================

export {
  // EOQ Strategy - Cost Optimization
  EOQStrategy,
  createEOQStrategy,
  DEFAULT_EOQ_CONFIG,
  type EOQStrategyConfig,

  // JIT Strategy - Lean Inventory
  JITStrategy,
  createJITStrategy,
  DEFAULT_JIT_CONFIG,
  type JITStrategyConfig,

  // Safety Stock Strategy - High Availability
  SafetyStockStrategy,
  createSafetyStockStrategy,
  DEFAULT_SAFETY_STOCK_CONFIG,
  type SafetyStockStrategyConfig,
} from './strategies/index.js';

// ============================================================================
// PREDICTION SERVICE
// ============================================================================

export {
  // Main Service
  InventoryPredictionService,
  createInventoryPredictionService,

  // Service Result Types
  type InventoryAnalysis,
  type InventoryHealthSummary,
  type ReorderAlert,
} from './inventory-prediction-service.js';
