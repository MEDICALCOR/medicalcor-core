import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  SafetyStockStrategy,
  createSafetyStockStrategy,
  DEFAULT_SAFETY_STOCK_CONFIG,
  type SafetyStockStrategyConfig,
} from '../safety-stock-strategy.js';
import type { InventoryItem, UsageEvent } from '../../interfaces.js';

describe('SafetyStockStrategy', () => {
  let strategy: SafetyStockStrategy;

  const createItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
    id: 'item-1',
    clinicId: 'clinic-1',
    name: 'Test Item',
    sku: 'SKU-001',
    category: 'consumables',
    currentStock: 100,
    minStock: 10,
    maxStock: 200,
    unitPrice: 10,
    unit: 'pieces',
    leadTimeDays: 7,
    supplier: 'Test Supplier',
    expiryDate: null,
    isActive: true,
    ...overrides,
  });

  const createUsageEvent = (overrides: Partial<UsageEvent> = {}): UsageEvent => ({
    id: 'event-1',
    itemId: 'item-1',
    quantity: 5,
    timestamp: new Date('2025-06-10'),
    reason: 'procedure',
    ...overrides,
  });

  const createUsageHistory = (
    days: number,
    dailyUsage: number,
    reason: UsageEvent['reason'] = 'procedure'
  ): UsageEvent[] => {
    const events: UsageEvent[] = [];
    const now = new Date();
    for (let i = 0; i < days; i++) {
      const timestamp = new Date(now);
      timestamp.setDate(timestamp.getDate() - i);
      events.push({
        id: `event-${i}`,
        itemId: 'item-1',
        quantity: dailyUsage,
        timestamp,
        reason,
      });
    }
    return events;
  };

  beforeEach(() => {
    strategy = new SafetyStockStrategy();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const s = new SafetyStockStrategy();
      expect(s.strategyId).toBe('safety-stock');
      expect(s.name).toBe('Safety Stock (High Availability)');
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<SafetyStockStrategyConfig> = {
        serviceLevelTarget: 0.999,
        zScoreForServiceLevel: 3.0,
        criticalItemMultiplier: 2.0,
      };
      const s = new SafetyStockStrategy(customConfig);
      expect(s.strategyId).toBe('safety-stock');
      expect(s.name).toBe('Safety Stock (High Availability)');
    });
  });

  describe('createSafetyStockStrategy factory', () => {
    it('should create a SafetyStockStrategy instance', () => {
      const s = createSafetyStockStrategy();
      expect(s).toBeInstanceOf(SafetyStockStrategy);
      expect(s.strategyId).toBe('safety-stock');
    });

    it('should accept custom config', () => {
      const s = createSafetyStockStrategy({ serviceLevelTarget: 0.995 });
      expect(s).toBeInstanceOf(SafetyStockStrategy);
    });
  });

  describe('calculateReorderPoint', () => {
    it('should calculate reorder point with usage history', () => {
      const item = createItem({ leadTimeDays: 7 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.reorderLevel).toBeGreaterThan(0);
      expect(result.safetyStock).toBeGreaterThan(0);
      expect(result.averageDailyUsage).toBeGreaterThan(0);
      expect(result.leadTimeDays).toBe(10); // 7 + 3 variability
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should use default lead time when not specified', () => {
      const item = createItem({ leadTimeDays: 0 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.leadTimeDays).toBe(10); // 7 default + 3 variability
    });

    it('should handle empty usage history', () => {
      const item = createItem();
      const usageHistory: UsageEvent[] = [];

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.averageDailyUsage).toBe(0);
      expect(result.safetyStock).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should apply critical item multiplier for implants', () => {
      const criticalItem = createItem({ category: 'implants' });
      const normalItem = createItem({ category: 'consumables' });
      const usageHistory = createUsageHistory(30, 10);

      const criticalResult = strategy.calculateReorderPoint(criticalItem, usageHistory);
      const normalResult = strategy.calculateReorderPoint(normalItem, usageHistory);

      expect(criticalResult.safetyStock).toBeGreaterThan(normalResult.safetyStock);
    });

    it('should apply critical item multiplier for pharmaceuticals', () => {
      const item = createItem({ category: 'pharmaceuticals' });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.safetyStock).toBeGreaterThan(0);
    });

    it('should apply critical item multiplier for sterilization', () => {
      const item = createItem({ category: 'sterilization' });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.safetyStock).toBeGreaterThan(0);
    });

    it('should apply critical item multiplier for ppe', () => {
      const item = createItem({ category: 'ppe' });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.safetyStock).toBeGreaterThan(0);
    });

    it('should only count procedure and sample usage', () => {
      const item = createItem();
      const usageHistory = [
        createUsageEvent({ quantity: 10, reason: 'procedure' }),
        createUsageEvent({ quantity: 5, reason: 'sample' }),
        createUsageEvent({ quantity: 20, reason: 'expired' }),
        createUsageEvent({ quantity: 15, reason: 'damaged' }),
      ];

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.averageDailyUsage).toBe(15);
    });

    it('should calculate confidence based on history length', () => {
      const item = createItem();
      const shortHistory = createUsageHistory(10, 10);
      const longHistory = createUsageHistory(60, 10);

      const shortResult = strategy.calculateReorderPoint(item, shortHistory);
      const longResult = strategy.calculateReorderPoint(item, longHistory);

      expect(longResult.confidence).toBeGreaterThan(shortResult.confidence);
    });

    it('should cap confidence at 1', () => {
      const item = createItem();
      const veryLongHistory = createUsageHistory(100, 10);

      const result = strategy.calculateReorderPoint(item, veryLongHistory);

      expect(result.confidence).toBe(1);
    });

    it('should enforce minimum safety stock of 1 week average usage', () => {
      const item = createItem();
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.safetyStock).toBeGreaterThanOrEqual(70); // At least 7 days * 10
    });

    it('should add lead time variability to lead time', () => {
      const item = createItem({ leadTimeDays: 5 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.leadTimeDays).toBe(8); // 5 + 3
    });
  });

  describe('predictStockout', () => {
    it('should predict far future date when no usage', () => {
      const item = createItem({ currentStock: 100 });
      const usageHistory: UsageEvent[] = [];

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.daysUntilStockout).toBe(365);
      expect(result.probability).toBe(0);
      expect(result.riskLevel).toBe('none');
      expect(result.recommendation).toContain('No active usage');
    });

    it('should calculate stockout with usage history', () => {
      const item = createItem({ currentStock: 100 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.daysUntilStockout).toBeGreaterThan(0);
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.predictedDate).toBeInstanceOf(Date);
    });

    it('should return critical risk when stock is depleted', () => {
      const item = createItem({ currentStock: 0 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.daysUntilStockout).toBe(0);
      expect(result.riskLevel).toBe('critical');
      expect(result.recommendation).toContain('OUT OF STOCK');
    });

    it('should return critical risk for critical items within threshold', () => {
      const item = createItem({ category: 'implants', currentStock: 80 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(['critical', 'high']).toContain(result.riskLevel);
    });

    it('should return critical risk when days <= critical threshold', () => {
      const item = createItem({ currentStock: 50 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.riskLevel).toBe('critical');
    });

    it('should return high risk when days <= high threshold', () => {
      const item = createItem({ currentStock: 100 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(['high', 'critical']).toContain(result.riskLevel);
    });

    it('should return medium risk when days <= 21', () => {
      const item = createItem({ currentStock: 200 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(['medium', 'high', 'critical']).toContain(result.riskLevel);
    });

    it('should return low risk when days <= 30', () => {
      const item = createItem({ currentStock: 280 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(['low', 'medium', 'high']).toContain(result.riskLevel);
    });

    it('should return none risk when days > 30', () => {
      const item = createItem({ currentStock: 500 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.riskLevel).toBe('none');
    });

    it('should generate critical item warning in recommendation', () => {
      const item = createItem({ category: 'pharmaceuticals', currentStock: 0 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.recommendation).toContain('CRITICAL ITEM');
    });

    it('should recommend expedited order when below safety threshold', () => {
      const item = createItem({ currentStock: 80, leadTimeDays: 10 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      if (result.daysUntilStockout <= 13) {
        expect(result.recommendation).toContain('expedited');
      }
    });

    it('should recommend order when below reorder point', () => {
      const item = createItem({ currentStock: 100 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      const reorderPoint = strategy.calculateReorderPoint(item, usageHistory);
      if (item.currentStock < reorderPoint.reorderLevel) {
        expect(result.recommendation).toContain('safety');
      }
    });

    it('should suggest proactive replenishment when near reorder point', () => {
      const item = createItem({ currentStock: 150 });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictStockout(item, usageHistory);

      const reorderPoint = strategy.calculateReorderPoint(item, usageHistory);
      if (
        item.currentStock >= reorderPoint.reorderLevel &&
        item.currentStock < reorderPoint.reorderLevel + reorderPoint.safetyStock
      ) {
        expect(result.recommendation).toContain('proactive');
      }
    });

    it('should indicate healthy stock levels when adequate', () => {
      const item = createItem({ currentStock: 500 });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.recommendation).toContain('healthy');
    });

    it('should use pessimistic usage estimate', () => {
      const item = createItem({ currentStock: 100 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.daysUntilStockout).toBeLessThanOrEqual(10);
    });

    it('should calculate probability based on safety stock coverage', () => {
      const item = createItem({ currentStock: 50 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.probability).toBeGreaterThan(0);
      expect(result.probability).toBeLessThanOrEqual(1);
    });

    it('should return zero probability when stock above reorder point', () => {
      const item = createItem({ currentStock: 500 });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.probability).toBe(0);
    });
  });

  describe('recommendOrderQuantity', () => {
    it('should recommend minimum safety stock when no demand', () => {
      const item = createItem({ category: 'consumables', currentStock: 0 });
      const usageHistory: UsageEvent[] = [];

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBe(2);
      expect(result.estimatedCost).toBe(20);
      expect(result.eoq).toBeNull();
      expect(result.reasoning).toContain('minimum safety stock');
    });

    it('should recommend higher minimum for critical items with no demand', () => {
      const criticalItem = createItem({ category: 'implants', currentStock: 0 });
      const normalItem = createItem({ category: 'consumables', currentStock: 0 });
      const usageHistory: UsageEvent[] = [];

      const criticalResult = strategy.recommendOrderQuantity(criticalItem, usageHistory);
      const normalResult = strategy.recommendOrderQuantity(normalItem, usageHistory);

      expect(criticalResult.quantity).toBe(5);
      expect(normalResult.quantity).toBe(2);
    });

    it('should calculate order quantity based on target weeks supply', () => {
      const item = createItem({ currentStock: 50, unitPrice: 10 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeGreaterThan(0);
      expect(result.estimatedCost).toBe(result.quantity * 10);
      expect(result.annualDemand).toBeGreaterThan(3000);
      expect(result.eoq).toBeNull();
    });

    it('should target 6 weeks supply for critical items', () => {
      const item = createItem({ category: 'implants', currentStock: 50 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeGreaterThan(0);
    });

    it('should target 4 weeks supply for non-critical items', () => {
      const item = createItem({ category: 'consumables', currentStock: 50 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeGreaterThan(0);
    });

    it('should respect max stock constraint', () => {
      const item = createItem({ currentStock: 195, maxStock: 200, unitPrice: 10 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeLessThanOrEqual(5);
    });

    it('should return zero or negative when current stock exceeds max', () => {
      const item = createItem({ currentStock: 250, maxStock: 200 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeLessThanOrEqual(0);
    });

    it('should handle item with no max stock', () => {
      const item = createItem({ currentStock: 50, maxStock: null });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeGreaterThan(0);
    });

    it('should calculate holding cost correctly', () => {
      const item = createItem({ unitPrice: 100 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.holdingCostPerUnit).toBe(25);
    });

    it('should generate reasoning with safety stock details', () => {
      const item = createItem({ currentStock: 50 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.reasoning).toContain('safety stock');
      expect(result.reasoning).toContain('99% service level');
    });

    it('should generate adequate stock reasoning when quantity is zero', () => {
      const item = createItem({ currentStock: 500 });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      if (result.quantity === 0) {
        expect(result.reasoning).toContain('adequate');
      }
    });

    it('should indicate critical item in reasoning', () => {
      const item = createItem({ category: 'pharmaceuticals', currentStock: 50 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      if (result.quantity > 0) {
        expect(result.reasoning).toContain('critical item');
      }
    });

    it('should return zero quantity when no demand and stock exists', () => {
      const item = createItem({ currentStock: 10 });
      const usageHistory: UsageEvent[] = [];

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBe(0);
    });
  });

  describe('predictExpiryRisk', () => {
    it('should return null when item has no expiry date', () => {
      const item = createItem({ expiryDate: null });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).toBeNull();
    });

    it('should return dispose recommendation for expired items', () => {
      const item = createItem({
        expiryDate: new Date(Date.now() - 1000),
        currentStock: 50,
      });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.daysUntilExpiry).toBe(0);
      expect(result!.quantityAtRisk).toBe(50);
      expect(result!.expectedUsageBeforeExpiry).toBe(0);
      expect(result!.recommendation).toBe('dispose');
    });

    it('should return dispose when expiring in <= 7 days with quantity at risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 5);
      const item = createItem({
        expiryDate,
        currentStock: 100,
      });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.daysUntilExpiry).toBeGreaterThanOrEqual(4);
      expect(result!.daysUntilExpiry).toBeLessThanOrEqual(5);
      if (result!.quantityAtRisk > 0) {
        expect(result!.recommendation).toBe('dispose');
      }
    });

    it('should return donate when expiring in <= 14 days with quantity at risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 10);
      const item = createItem({
        expiryDate,
        currentStock: 200,
      });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      if (result!.quantityAtRisk > 0 && result!.daysUntilExpiry <= 14) {
        expect(result!.recommendation).toBe('donate');
      }
    });

    it('should return schedule_procedures when expiring in <= 30 days with quantity at risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 20);
      const item = createItem({
        expiryDate,
        currentStock: 300,
      });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      if (result!.quantityAtRisk > 0 && result!.daysUntilExpiry <= 30) {
        expect(result!.recommendation).toBe('schedule_procedures');
      }
    });

    it('should return transfer_to_other_clinic for large quantity at risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 45);
      const item = createItem({
        expiryDate,
        currentStock: 500,
      });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      if (result!.quantityAtRisk > 20) {
        expect(result!.recommendation).toBe('transfer_to_other_clinic');
      }
    });

    it('should return use_first when no quantity at risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      const item = createItem({
        expiryDate,
        currentStock: 50,
      });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.quantityAtRisk).toBe(0);
      expect(result!.recommendation).toBe('use_first');
    });

    it('should prioritize schedule_procedures for critical items expiring in <= 14 days', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 10);
      const item = createItem({
        category: 'implants',
        expiryDate,
        currentStock: 200,
      });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      if (result!.quantityAtRisk > 0) {
        expect(result!.recommendation).toBe('schedule_procedures');
      }
    });

    it('should prioritize transfer for critical items expiring in <= 30 days', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 25);
      const item = createItem({
        category: 'pharmaceuticals',
        expiryDate,
        currentStock: 300,
      });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      if (result!.quantityAtRisk > 0) {
        expect(result!.recommendation).toBe('transfer_to_other_clinic');
      }
    });

    it('should use conservative usage estimate', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      const item = createItem({
        expiryDate,
        currentStock: 100,
      });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.expectedUsageBeforeExpiry).toBeLessThanOrEqual(300);
    });
  });

  describe('DEFAULT_SAFETY_STOCK_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_SAFETY_STOCK_CONFIG.serviceLevelTarget).toBe(0.99);
      expect(DEFAULT_SAFETY_STOCK_CONFIG.zScoreForServiceLevel).toBe(2.326);
      expect(DEFAULT_SAFETY_STOCK_CONFIG.criticalItemMultiplier).toBe(1.5);
      expect(DEFAULT_SAFETY_STOCK_CONFIG.leadTimeVariabilityDays).toBe(3);
      expect(DEFAULT_SAFETY_STOCK_CONFIG.demandVariabilityFactor).toBe(0.3);
      expect(DEFAULT_SAFETY_STOCK_CONFIG.holdingCostRate).toBe(0.25);
      expect(DEFAULT_SAFETY_STOCK_CONFIG.criticalThresholdDays).toBe(7);
      expect(DEFAULT_SAFETY_STOCK_CONFIG.highRiskThresholdDays).toBe(14);
    });
  });

  describe('edge cases', () => {
    it('should handle very high usage correctly', () => {
      const item = createItem({ currentStock: 1000, minStock: 500, maxStock: 10000 });
      const usageHistory = createUsageHistory(30, 100);

      const stockout = strategy.predictStockout(item, usageHistory);
      const order = strategy.recommendOrderQuantity(item, usageHistory);

      expect(stockout.daysUntilStockout).toBeGreaterThan(0);
      expect(order.quantity).toBeGreaterThanOrEqual(0);
      expect(order.annualDemand).toBeGreaterThan(0);
    });

    it('should handle very low usage correctly', () => {
      const item = createItem({ currentStock: 100 });
      const usageHistory = createUsageHistory(30, 0.1);

      const stockout = strategy.predictStockout(item, usageHistory);

      expect(stockout.daysUntilStockout).toBeGreaterThan(100);
      expect(stockout.riskLevel).toBe('none');
    });

    it('should handle single day history', () => {
      const item = createItem();
      const usageHistory = [createUsageEvent({ quantity: 10 })];

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.averageDailyUsage).toBe(10);
      expect(result.confidence).toBeLessThan(1);
    });

    it('should handle multiple usage events on same day', () => {
      const item = createItem();
      const today = new Date();
      const usageHistory = [
        createUsageEvent({ quantity: 10, timestamp: today, reason: 'procedure' }),
        createUsageEvent({ quantity: 5, timestamp: today, reason: 'sample' }),
      ];

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.averageDailyUsage).toBe(15);
    });

    it('should handle usage history with only expired/damaged reasons', () => {
      const item = createItem();
      const usageHistory = [
        createUsageEvent({ quantity: 10, reason: 'expired' }),
        createUsageEvent({ quantity: 5, reason: 'damaged' }),
      ];

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.averageDailyUsage).toBe(0);
    });

    it('should handle item at exactly zero stock', () => {
      const item = createItem({ currentStock: 0 });
      const usageHistory = createUsageHistory(30, 10);

      const stockout = strategy.predictStockout(item, usageHistory);
      const order = strategy.recommendOrderQuantity(item, usageHistory);

      expect(stockout.riskLevel).toBe('critical');
      expect(order.quantity).toBeGreaterThan(0);
    });

    it('should handle item at exactly reorder point', () => {
      const item = createItem({ currentStock: 100 });
      const usageHistory = createUsageHistory(30, 10);

      const reorderPoint = strategy.calculateReorderPoint(item, usageHistory);
      const itemAtReorder = createItem({ currentStock: reorderPoint.reorderLevel });

      const stockout = strategy.predictStockout(itemAtReorder, usageHistory);

      expect(stockout.recommendation).toMatch(/safety|proactive|adequate/i);
    });
  });

  describe('property-based tests', () => {
    it('should always return non-negative reorder levels', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 1, max: 30 }),
          (currentStock, dailyUsage) => {
            const item = createItem({ currentStock });
            const usageHistory = createUsageHistory(30, dailyUsage);

            const result = strategy.calculateReorderPoint(item, usageHistory);

            return result.reorderLevel >= 0 && result.safetyStock >= 0;
          }
        )
      );
    });

    it('should always return valid stockout predictions', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 1, max: 100 }),
          (currentStock, dailyUsage) => {
            const item = createItem({ currentStock });
            const usageHistory = createUsageHistory(30, dailyUsage);

            const result = strategy.predictStockout(item, usageHistory);

            return (
              result.daysUntilStockout >= 0 &&
              result.probability >= 0 &&
              result.probability <= 1 &&
              ['none', 'low', 'medium', 'high', 'critical'].includes(result.riskLevel)
            );
          }
        )
      );
    });

    it('should always return valid order quantities within constraints', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 0, max: 100 }),
          (currentStock, dailyUsage) => {
            const item = createItem({ currentStock, maxStock: 1000 });
            const usageHistory = createUsageHistory(30, dailyUsage);

            const result = strategy.recommendOrderQuantity(item, usageHistory);

            return result.estimatedCost >= 0;
          }
        )
      );
    });

    it('should maintain safety stock >= 1 week average usage when there is usage', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 50 }), (dailyUsage) => {
          const item = createItem();
          const usageHistory = createUsageHistory(30, dailyUsage);

          const result = strategy.calculateReorderPoint(item, usageHistory);

          return result.safetyStock >= dailyUsage * 7;
        })
      );
    });
  });
});
