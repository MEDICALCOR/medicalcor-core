/**
 * @fileoverview Inventory Prediction Strategies
 *
 * Exports all concrete strategy implementations for the Strategy Pattern.
 *
 * @module domain/inventory/strategies
 */

// EOQ (Economic Order Quantity) Strategy - Cost optimization
export {
  EOQStrategy,
  createEOQStrategy,
  DEFAULT_EOQ_CONFIG,
  type EOQStrategyConfig,
} from './eoq-strategy.js';

// JIT (Just-In-Time) Strategy - Lean inventory
export {
  JITStrategy,
  createJITStrategy,
  DEFAULT_JIT_CONFIG,
  type JITStrategyConfig,
} from './jit-strategy.js';

// Safety Stock Strategy - High availability
export {
  SafetyStockStrategy,
  createSafetyStockStrategy,
  DEFAULT_SAFETY_STOCK_CONFIG,
  type SafetyStockStrategyConfig,
} from './safety-stock-strategy.js';
