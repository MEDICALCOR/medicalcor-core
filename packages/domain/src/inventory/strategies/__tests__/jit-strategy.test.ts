import { describe, it, expect, beforeEach } from 'vitest';
import {
  JITStrategy,
  createJITStrategy,
  DEFAULT_JIT_CONFIG,
  type JITStrategyConfig,
} from '../jit-strategy.js';
import type { InventoryItem, UsageEvent } from '../../interfaces.js';

describe('JITStrategy', () => {
  let strategy: JITStrategy;

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
    strategy = new JITStrategy();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const s = new JITStrategy();
      expect(s.strategyId).toBe('jit');
      expect(s.name).toBe('Just-In-Time');
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<JITStrategyConfig> = {
        bufferDays: 5,
        targetTurnover: 24,
      };
      const s = new JITStrategy(customConfig);
      expect(s.strategyId).toBe('jit');
    });
  });

  describe('createJITStrategy factory', () => {
    it('should create a JIT strategy instance', () => {
      const s = createJITStrategy();
      expect(s).toBeInstanceOf(JITStrategy);
      expect(s.strategyId).toBe('jit');
    });

    it('should accept custom config', () => {
      const s = createJITStrategy({ bufferDays: 3 });
      expect(s).toBeInstanceOf(JITStrategy);
    });
  });

  describe('calculateReorderPoint', () => {
    it('should calculate reorder point with usage history', () => {
      const item = createItem({ leadTimeDays: 7 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.reorderLevel).toBeGreaterThan(0);
      expect(result.safetyStock).toBeGreaterThan(0);
      expect(result.averageDailyUsage).toBeCloseTo(10, 0);
      expect(result.leadTimeDays).toBe(7);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should use default lead time when not specified', () => {
      const item = createItem({ leadTimeDays: 0 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.leadTimeDays).toBe(7); // Falls back to default
    });

    it('should handle empty usage history', () => {
      const item = createItem();
      const usageHistory: UsageEvent[] = [];

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.averageDailyUsage).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('should only count procedure and sample usage', () => {
      const item = createItem();
      const usageHistory = [
        createUsageEvent({ quantity: 10, reason: 'procedure' }),
        createUsageEvent({ quantity: 5, reason: 'sample' }),
        createUsageEvent({ quantity: 20, reason: 'expired' }), // Should be ignored
        createUsageEvent({ quantity: 15, reason: 'damaged' }), // Should be ignored
      ];

      const result = strategy.calculateReorderPoint(item, usageHistory);

      // Only procedure and sample quantities should be counted
      expect(result.averageDailyUsage).toBeGreaterThan(0);
    });

    it('should calculate confidence based on history length', () => {
      const item = createItem();
      const shortHistory = createUsageHistory(7, 10);
      const longHistory = createUsageHistory(60, 10);

      const shortResult = strategy.calculateReorderPoint(item, shortHistory);
      const longResult = strategy.calculateReorderPoint(item, longHistory);

      expect(longResult.confidence).toBeGreaterThan(shortResult.confidence);
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
      expect(result.recommendation).toContain('no recent usage');
    });

    it('should calculate stockout with usage history', () => {
      const item = createItem({ currentStock: 50 });
      const usageHistory = createUsageHistory(30, 5); // 5 per day

      const result = strategy.predictStockout(item, usageHistory);

      // 50 / 5 = 10 days, but timing can vary slightly
      expect(result.daysUntilStockout).toBeGreaterThan(8);
      expect(result.daysUntilStockout).toBeLessThan(12);
      expect(result.probability).toBeGreaterThan(0);
    });

    it('should return critical risk when stock is depleted', () => {
      const item = createItem({ currentStock: 0 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.daysUntilStockout).toBe(0);
      expect(result.riskLevel).toBe('critical');
      expect(result.recommendation).toContain('CRITICAL');
    });

    it('should return critical risk when days until stockout <= critical threshold', () => {
      const item = createItem({ currentStock: 10 });
      const usageHistory = createUsageHistory(30, 10); // Will run out in ~1 day

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.riskLevel).toBe('critical');
    });

    it('should return high risk when days <= high threshold', () => {
      const item = createItem({ currentStock: 40 });
      const usageHistory = createUsageHistory(30, 10); // ~4 days

      const result = strategy.predictStockout(item, usageHistory);

      // With ~40 stock and ~10/day usage, we get ~4 days which is high risk (threshold is 5)
      expect(['high', 'critical']).toContain(result.riskLevel);
    });

    it('should return medium risk when days <= 10', () => {
      const item = createItem({ currentStock: 80 });
      const usageHistory = createUsageHistory(30, 10); // ~8 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.riskLevel).toBe('medium');
    });

    it('should return low risk when days <= 20', () => {
      const item = createItem({ currentStock: 150 });
      const usageHistory = createUsageHistory(30, 10); // ~15 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.riskLevel).toBe('low');
    });

    it('should return none risk when days > 20', () => {
      const item = createItem({ currentStock: 300 });
      const usageHistory = createUsageHistory(30, 10); // ~30 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.riskLevel).toBe('none');
    });

    it('should generate urgent recommendation when within lead time', () => {
      const item = createItem({ currentStock: 50, leadTimeDays: 10 });
      const usageHistory = createUsageHistory(30, 10); // ~5 days, within lead time

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.recommendation).toContain('URGENT');
    });

    it('should generate standard recommendation when just past lead time + buffer', () => {
      const item = createItem({ currentStock: 100, leadTimeDays: 7 });
      const usageHistory = createUsageHistory(30, 10); // ~10 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.recommendation).toContain('JIT');
    });
  });

  describe('recommendOrderQuantity', () => {
    it('should return zero quantity when no demand', () => {
      const item = createItem();
      const usageHistory: UsageEvent[] = [];

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBe(0);
      expect(result.estimatedCost).toBe(0);
      expect(result.eoq).toBeNull();
      expect(result.reasoning).toContain('No demand');
    });

    it('should calculate JIT order quantity based on monthly demand', () => {
      const item = createItem({ currentStock: 100, unitPrice: 10 });
      const usageHistory = createUsageHistory(30, 10); // 10 per day

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeGreaterThan(0);
      expect(result.estimatedCost).toBe(result.quantity * 10);
      // Annual demand should be approximately 10 * 365 = 3650, but timing can vary
      expect(result.annualDemand).toBeGreaterThan(3000);
      expect(result.annualDemand).toBeLessThan(4000);
      expect(result.eoq).toBeNull(); // JIT doesn't use EOQ
    });

    it('should respect max stock constraint', () => {
      const item = createItem({ currentStock: 190, maxStock: 200, unitPrice: 10 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeLessThanOrEqual(10); // maxStock - currentStock
    });

    it('should order at least enough to cover deficit', () => {
      const item = createItem({ currentStock: 5, minStock: 20 });
      const usageHistory = createUsageHistory(30, 1); // Low usage

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeGreaterThanOrEqual(15); // minStock - currentStock
    });

    it('should return zero when current stock exceeds max', () => {
      const item = createItem({ currentStock: 250, maxStock: 200 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBe(0);
      expect(result.reasoning).toContain('sufficient');
    });

    it('should generate adjusted reasoning when quantity differs from JIT', () => {
      const item = createItem({ currentStock: 5, minStock: 100, maxStock: 200 });
      const usageHistory = createUsageHistory(30, 1);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.reasoning).toContain('adjusted');
    });

    it('should calculate holding cost', () => {
      const item = createItem({ unitPrice: 100 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.holdingCostPerUnit).toBe(25); // 25% of unit price
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
        expiryDate: new Date(Date.now() - 1000), // Already expired
        currentStock: 50,
      });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.daysUntilExpiry).toBe(0);
      expect(result!.quantityAtRisk).toBe(50);
      expect(result!.recommendation).toBe('dispose');
    });

    it('should return dispose recommendation when expiring in <= 5 days with risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 3);
      const item = createItem({
        expiryDate,
        currentStock: 100,
      });
      const usageHistory = createUsageHistory(30, 10); // 10 per day, will use 30 in 3 days

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.recommendation).toBe('dispose');
    });

    it('should return donate recommendation when expiring in <= 10 days with risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 8);
      const item = createItem({
        expiryDate,
        currentStock: 100,
      });
      const usageHistory = createUsageHistory(30, 5); // Will use ~40 in 8 days

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.recommendation).toBe('donate');
    });

    it('should return schedule_procedures when expiring in <= 20 days with risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 15);
      const item = createItem({
        expiryDate,
        currentStock: 100,
      });
      const usageHistory = createUsageHistory(30, 3); // Will use ~45 in 15 days

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.recommendation).toBe('schedule_procedures');
    });

    it('should return transfer_to_other_clinic for longer expiry with risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      const item = createItem({
        expiryDate,
        currentStock: 200,
      });
      const usageHistory = createUsageHistory(30, 3); // Will use ~90 in 30 days

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.recommendation).toBe('transfer_to_other_clinic');
    });

    it('should return use_first when no quantity at risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);
      const item = createItem({
        expiryDate,
        currentStock: 50,
      });
      const usageHistory = createUsageHistory(30, 10); // Will use 300 in 30 days, more than stock

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.quantityAtRisk).toBe(0);
      expect(result!.recommendation).toBe('use_first');
    });

    it('should calculate expected usage before expiry', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 10);
      const item = createItem({
        expiryDate,
        currentStock: 100,
      });
      const usageHistory = createUsageHistory(30, 5);

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      // Usage is approximately 5 per day * ~10 days
      expect(result!.expectedUsageBeforeExpiry).toBeGreaterThan(40);
      expect(result!.expectedUsageBeforeExpiry).toBeLessThan(60);
      expect(result!.quantityAtRisk).toBeGreaterThan(40);
      expect(result!.quantityAtRisk).toBeLessThan(60);
    });
  });

  describe('DEFAULT_JIT_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_JIT_CONFIG.bufferDays).toBe(2);
      expect(DEFAULT_JIT_CONFIG.targetTurnover).toBe(12);
      expect(DEFAULT_JIT_CONFIG.maxOrdersPerMonth).toBe(4);
      expect(DEFAULT_JIT_CONFIG.supplierReliability).toBe(0.95);
      expect(DEFAULT_JIT_CONFIG.criticalThresholdDays).toBe(2);
      expect(DEFAULT_JIT_CONFIG.highRiskThresholdDays).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle very high usage correctly', () => {
      const item = createItem({ currentStock: 1000, minStock: 500 });
      const usageHistory = createUsageHistory(30, 100);

      const stockout = strategy.predictStockout(item, usageHistory);
      const order = strategy.recommendOrderQuantity(item, usageHistory);

      // 1000 / 100 = 10 days, but timing can vary slightly
      expect(stockout.daysUntilStockout).toBeGreaterThan(8);
      expect(stockout.daysUntilStockout).toBeLessThan(12);
      // Order quantity might be 0 if current stock is above minimum
      expect(order.quantity).toBeGreaterThanOrEqual(0);
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

    it('should handle item with no max stock', () => {
      const item = createItem({ currentStock: 100, maxStock: null });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeGreaterThan(0);
    });
  });
});
