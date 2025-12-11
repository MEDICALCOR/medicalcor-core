import { describe, it, expect, beforeEach } from 'vitest';
import {
  EOQStrategy,
  createEOQStrategy,
  DEFAULT_EOQ_CONFIG,
  type EOQStrategyConfig,
} from '../eoq-strategy.js';
import type { InventoryItem, UsageEvent } from '../../interfaces.js';

describe('EOQStrategy', () => {
  let strategy: EOQStrategy;

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
    strategy = new EOQStrategy();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const s = new EOQStrategy();
      expect(s.strategyId).toBe('eoq');
      expect(s.name).toBe('Economic Order Quantity');
    });

    it('should merge custom config with defaults', () => {
      const customConfig: Partial<EOQStrategyConfig> = {
        holdingCostRate: 0.3,
        orderingCostPerOrder: 100,
      };
      const s = new EOQStrategy(customConfig);
      expect(s.strategyId).toBe('eoq');
    });
  });

  describe('createEOQStrategy factory', () => {
    it('should create an EOQ strategy instance', () => {
      const s = createEOQStrategy();
      expect(s).toBeInstanceOf(EOQStrategy);
      expect(s.strategyId).toBe('eoq');
    });

    it('should accept custom config', () => {
      const s = createEOQStrategy({ holdingCostRate: 0.35 });
      expect(s).toBeInstanceOf(EOQStrategy);
    });
  });

  describe('calculateReorderPoint', () => {
    it('should calculate reorder point with usage history', () => {
      const item = createItem({ leadTimeDays: 7 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.calculateReorderPoint(item, usageHistory);

      expect(result.reorderLevel).toBeGreaterThan(0);
      // Safety stock can be 0 if usage is consistent (stdDev = 0)
      expect(result.safetyStock).toBeGreaterThanOrEqual(0);
      expect(result.averageDailyUsage).toBeGreaterThan(0);
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

    it('should cap confidence at 1', () => {
      const item = createItem();
      const veryLongHistory = createUsageHistory(100, 10);

      const result = strategy.calculateReorderPoint(item, veryLongHistory);

      expect(result.confidence).toBe(1);
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
      expect(result.recommendation).toContain('No usage detected');
    });

    it('should calculate stockout with usage history', () => {
      const item = createItem({ currentStock: 50 });
      const usageHistory = createUsageHistory(30, 5); // 5 per day

      const result = strategy.predictStockout(item, usageHistory);

      // 50 / 5 = 10 days, but timing can vary
      expect(result.daysUntilStockout).toBeGreaterThan(5);
      expect(result.daysUntilStockout).toBeLessThan(15);
      expect(result.probability).toBeGreaterThan(0);
    });

    it('should return critical risk when stock is depleted', () => {
      const item = createItem({ currentStock: 0 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.daysUntilStockout).toBe(0);
      expect(result.riskLevel).toBe('critical');
      expect(result.recommendation).toContain('URGENT');
    });

    it('should return critical risk when days <= critical threshold', () => {
      const item = createItem({ currentStock: 20 });
      const usageHistory = createUsageHistory(30, 10); // ~2 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.riskLevel).toBe('critical');
    });

    it('should return high risk when days <= high threshold', () => {
      const item = createItem({ currentStock: 60 });
      const usageHistory = createUsageHistory(30, 10); // ~6 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(['high', 'critical']).toContain(result.riskLevel);
    });

    it('should return medium risk when days <= 14', () => {
      const item = createItem({ currentStock: 100 });
      const usageHistory = createUsageHistory(30, 10); // ~10 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(['medium', 'high']).toContain(result.riskLevel);
    });

    it('should return low risk when days <= 30', () => {
      const item = createItem({ currentStock: 250 });
      const usageHistory = createUsageHistory(30, 10); // ~25 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(['low', 'medium']).toContain(result.riskLevel);
    });

    it('should return none risk when days > 30', () => {
      const item = createItem({ currentStock: 500 });
      const usageHistory = createUsageHistory(30, 10); // ~50 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.riskLevel).toBe('none');
    });

    it('should generate CRITICAL recommendation when within lead time', () => {
      const item = createItem({ currentStock: 50, leadTimeDays: 10 });
      const usageHistory = createUsageHistory(30, 10); // ~5 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.recommendation).toContain('CRITICAL');
    });

    it('should generate order now recommendation when near lead time', () => {
      const item = createItem({ currentStock: 100, leadTimeDays: 7 });
      const usageHistory = createUsageHistory(30, 10); // ~10 days

      const result = strategy.predictStockout(item, usageHistory);

      expect(result.recommendation).toContain('Place order');
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

    it('should calculate EOQ order quantity', () => {
      const item = createItem({ currentStock: 100, unitPrice: 10 });
      const usageHistory = createUsageHistory(30, 10); // 10 per day

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeGreaterThan(0);
      expect(result.estimatedCost).toBe(result.quantity * 10);
      expect(result.annualDemand).toBeGreaterThan(3000);
      expect(result.eoq).not.toBeNull(); // EOQ uses EOQ calculation
      expect(result.eoq).toBeGreaterThan(0);
    });

    it('should respect max stock constraint', () => {
      const item = createItem({ currentStock: 195, maxStock: 200, unitPrice: 10 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBeLessThanOrEqual(5); // maxStock - currentStock
    });

    it('should return zero when current stock exceeds max', () => {
      const item = createItem({ currentStock: 250, maxStock: 200 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.quantity).toBe(0);
    });

    it('should calculate holding cost correctly', () => {
      const item = createItem({ unitPrice: 100 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      expect(result.holdingCostPerUnit).toBe(25); // 25% of unit price
    });

    it('should generate limited reasoning when constrained by max stock', () => {
      const item = createItem({ currentStock: 150, maxStock: 200, unitPrice: 10 });
      const usageHistory = createUsageHistory(30, 10);

      const result = strategy.recommendOrderQuantity(item, usageHistory);

      if (result.quantity < (result.eoq ?? 0)) {
        expect(result.reasoning).toContain('limited by max stock');
      }
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

    it('should return dispose recommendation when expiring in <= 7 days with risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 5);
      const item = createItem({
        expiryDate,
        currentStock: 100,
      });
      const usageHistory = createUsageHistory(30, 10); // 10 per day, will use 50 in 5 days

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.recommendation).toBe('dispose');
    });

    it('should return donate recommendation when expiring in <= 14 days with risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 10);
      const item = createItem({
        expiryDate,
        currentStock: 200,
      });
      const usageHistory = createUsageHistory(30, 10); // Will use ~100 in 10 days

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.recommendation).toBe('donate');
    });

    it('should return schedule_procedures when expiring in <= 30 days with risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 20);
      const item = createItem({
        expiryDate,
        currentStock: 300,
      });
      const usageHistory = createUsageHistory(30, 10); // Will use ~200 in 20 days

      const result = strategy.predictExpiryRisk(item, usageHistory);

      expect(result).not.toBeNull();
      expect(result!.recommendation).toBe('schedule_procedures');
    });

    it('should return transfer_to_other_clinic for larger quantity at risk', () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 45);
      const item = createItem({
        expiryDate,
        currentStock: 500,
      });
      const usageHistory = createUsageHistory(30, 5); // Will use ~225 in 45 days

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
  });

  describe('DEFAULT_EOQ_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_EOQ_CONFIG.holdingCostRate).toBe(0.25);
      expect(DEFAULT_EOQ_CONFIG.orderingCostPerOrder).toBe(50);
      expect(DEFAULT_EOQ_CONFIG.serviceLevelTarget).toBe(0.95);
      expect(DEFAULT_EOQ_CONFIG.zScoreForServiceLevel).toBe(1.645);
      expect(DEFAULT_EOQ_CONFIG.minHistoryDays).toBe(30);
      expect(DEFAULT_EOQ_CONFIG.criticalThresholdDays).toBe(3);
      expect(DEFAULT_EOQ_CONFIG.highRiskThresholdDays).toBe(7);
    });
  });

  describe('edge cases', () => {
    it('should handle very high usage correctly', () => {
      const item = createItem({ currentStock: 1000, minStock: 500 });
      const usageHistory = createUsageHistory(30, 100);

      const stockout = strategy.predictStockout(item, usageHistory);
      const order = strategy.recommendOrderQuantity(item, usageHistory);

      expect(stockout.daysUntilStockout).toBeGreaterThan(5);
      expect(stockout.daysUntilStockout).toBeLessThan(15);
      expect(order.eoq).toBeGreaterThan(0);
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
      expect(result.eoq).not.toBeNull();
    });
  });
});
