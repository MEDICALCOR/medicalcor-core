/**
 * @fileoverview Unit Tests for Inventory Prediction Service
 *
 * Tests the Strategy Pattern implementation for the "Inventory Brain"
 * with property-based testing for prediction algorithms.
 *
 * @module domain/inventory/__tests__/inventory-prediction-service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type {
  InventoryItem,
  UsageEvent,
  IInventoryRepository,
  InventoryPredictionServiceDeps,
} from '../interfaces.js';
import {
  InventoryPredictionService,
  createInventoryPredictionService,
} from '../inventory-prediction-service.js';
import { EOQStrategy, createEOQStrategy } from '../strategies/eoq-strategy.js';
import { JITStrategy, createJITStrategy } from '../strategies/jit-strategy.js';
import {
  SafetyStockStrategy,
  createSafetyStockStrategy,
} from '../strategies/safety-stock-strategy.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockItem = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'item-1',
  clinicId: 'clinic-1',
  name: 'Dental Composite',
  sku: 'DC-001',
  category: 'consumables',
  currentStock: 50,
  minStock: 10,
  maxStock: 100,
  unitPrice: 25.0,
  unit: 'unit',
  leadTimeDays: 7,
  supplier: 'DentalSupply Co',
  expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
  isActive: true,
  ...overrides,
});

const createMockUsageHistory = (count: number, avgPerDay: number): UsageEvent[] => {
  const events: UsageEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(i / Math.max(1, avgPerDay));
    events.push({
      id: `event-${i}`,
      itemId: 'item-1',
      quantity: Math.ceil(Math.random() * 3),
      timestamp: new Date(now - daysAgo * 24 * 60 * 60 * 1000),
      reason: 'procedure',
    });
  }

  return events;
};

const createMockRepository = (): IInventoryRepository => ({
  getItem: vi.fn(),
  getItems: vi.fn(),
  getLowStockItems: vi.fn(),
  getExpiringItems: vi.fn(),
  getUsageHistory: vi.fn(),
  recordUsage: vi.fn(),
  updateStock: vi.fn(),
});

// ============================================================================
// EOQ STRATEGY TESTS
// ============================================================================

describe('EOQStrategy', () => {
  it('should calculate reorder point based on lead time and usage', () => {
    const strategy = createEOQStrategy();
    const item = createMockItem({ leadTimeDays: 7 });
    const usageHistory = createMockUsageHistory(30, 2);

    const result = strategy.calculateReorderPoint(item, usageHistory);

    expect(result.reorderLevel).toBeGreaterThan(0);
    expect(result.safetyStock).toBeGreaterThanOrEqual(0);
    expect(result.averageDailyUsage).toBeGreaterThanOrEqual(0);
    expect(result.leadTimeDays).toBe(7);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should predict stockout date based on current stock and usage', () => {
    const strategy = createEOQStrategy();
    const item = createMockItem({ currentStock: 20 });
    const usageHistory = createMockUsageHistory(60, 3);

    const result = strategy.predictStockout(item, usageHistory);

    expect(result.daysUntilStockout).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
    expect(['critical', 'high', 'medium', 'low', 'none']).toContain(result.riskLevel);
    expect(result.recommendation).toBeTruthy();
  });

  it('should recommend order quantity using EOQ formula', () => {
    const strategy = createEOQStrategy({ orderingCostPerOrder: 50, holdingCostRate: 0.25 });
    const item = createMockItem({ unitPrice: 25 });
    const usageHistory = createMockUsageHistory(90, 3);

    const result = strategy.recommendOrderQuantity(item, usageHistory);

    expect(result.quantity).toBeGreaterThanOrEqual(0);
    expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
    expect(result.eoq).toBeGreaterThan(0);
    expect(result.annualDemand).toBeGreaterThanOrEqual(0);
    expect(result.reasoning).toBeTruthy();
  });

  // Property-based test
  it('should always return valid reorder point regardless of input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // currentStock
        fc.integer({ min: 1, max: 30 }), // leadTimeDays
        fc.integer({ min: 0, max: 100 }), // usageEvents
        (currentStock, leadTimeDays, eventCount) => {
          const strategy = createEOQStrategy();
          const item = createMockItem({ currentStock, leadTimeDays });
          const usageHistory = createMockUsageHistory(eventCount, 2);

          const result = strategy.calculateReorderPoint(item, usageHistory);

          return (
            result.reorderLevel >= 0 &&
            result.safetyStock >= 0 &&
            result.averageDailyUsage >= 0 &&
            result.confidence >= 0 &&
            result.confidence <= 1
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// JIT STRATEGY TESTS
// ============================================================================

describe('JITStrategy', () => {
  it('should use minimal safety stock', () => {
    const jitStrategy = createJITStrategy();
    const safetyStrategy = createSafetyStockStrategy();
    const item = createMockItem();
    const usageHistory = createMockUsageHistory(60, 3);

    const jitResult = jitStrategy.calculateReorderPoint(item, usageHistory);
    const safetyResult = safetyStrategy.calculateReorderPoint(item, usageHistory);

    // JIT should have lower safety stock compared to Safety Stock strategy
    // (Safety Stock is specifically designed for maximum buffer)
    expect(jitResult.safetyStock).toBeLessThan(safetyResult.safetyStock);
  });

  it('should recommend smaller, more frequent orders', () => {
    const strategy = createJITStrategy({ maxOrdersPerMonth: 4 });
    const item = createMockItem({ currentStock: 10 });
    const usageHistory = createMockUsageHistory(60, 3);

    const result = strategy.recommendOrderQuantity(item, usageHistory);

    // JIT orders should be for approximately weekly supply
    expect(result.eoq).toBeNull(); // JIT doesn't use EOQ
    expect(result.quantity).toBeGreaterThanOrEqual(0);
  });

  it('should classify stockout risk more aggressively', () => {
    const strategy = createJITStrategy();
    const item = createMockItem({ currentStock: 5, leadTimeDays: 7 });
    const usageHistory = createMockUsageHistory(30, 2);

    const result = strategy.predictStockout(item, usageHistory);

    // With low stock, JIT should report high/critical risk
    expect(['critical', 'high', 'medium']).toContain(result.riskLevel);
  });
});

// ============================================================================
// SAFETY STOCK STRATEGY TESTS
// ============================================================================

describe('SafetyStockStrategy', () => {
  it('should maintain higher safety stock levels', () => {
    const safetyStrategy = createSafetyStockStrategy();
    const eoqStrategy = createEOQStrategy();
    const item = createMockItem();
    const usageHistory = createMockUsageHistory(60, 3);

    const safetyResult = safetyStrategy.calculateReorderPoint(item, usageHistory);
    const eoqResult = eoqStrategy.calculateReorderPoint(item, usageHistory);

    // Safety stock strategy should have higher reorder levels
    expect(safetyResult.reorderLevel).toBeGreaterThanOrEqual(eoqResult.reorderLevel);
  });

  it('should apply critical item multiplier for surgical items', () => {
    const strategy = createSafetyStockStrategy({ criticalItemMultiplier: 1.5 });
    const criticalItem = createMockItem({ category: 'implants' });
    const normalItem = createMockItem({ category: 'office_supplies' });
    const usageHistory = createMockUsageHistory(60, 3);

    const criticalResult = strategy.calculateReorderPoint(criticalItem, usageHistory);
    const normalResult = strategy.calculateReorderPoint(normalItem, usageHistory);

    // Critical items should have higher safety stock
    expect(criticalResult.safetyStock).toBeGreaterThan(normalResult.safetyStock);
  });

  it('should recommend larger order quantities', () => {
    const safetyStrategy = createSafetyStockStrategy();
    const jitStrategy = createJITStrategy();
    const item = createMockItem({ currentStock: 20 });
    const usageHistory = createMockUsageHistory(60, 3);

    const safetyResult = safetyStrategy.recommendOrderQuantity(item, usageHistory);
    const jitResult = jitStrategy.recommendOrderQuantity(item, usageHistory);

    // Safety stock should recommend larger orders
    expect(safetyResult.quantity).toBeGreaterThan(jitResult.quantity);
  });
});

// ============================================================================
// INVENTORY PREDICTION SERVICE TESTS
// ============================================================================

describe('InventoryPredictionService', () => {
  let mockRepository: IInventoryRepository;
  let deps: InventoryPredictionServiceDeps;
  let service: InventoryPredictionService;

  beforeEach(() => {
    mockRepository = createMockRepository();
    deps = {
      repository: mockRepository,
      strategy: createEOQStrategy(),
    };
    service = createInventoryPredictionService(deps);
  });

  describe('Strategy Management', () => {
    it('should allow strategy switching at runtime', () => {
      const initialStrategy = service.getStrategy();
      expect(initialStrategy.strategyId).toBe('eoq');

      service.setStrategy(createJITStrategy());
      const newStrategy = service.getStrategy();
      expect(newStrategy.strategyId).toBe('jit');
    });

    it('should support all three strategies', () => {
      const strategies = [createEOQStrategy(), createJITStrategy(), createSafetyStockStrategy()];

      for (const strategy of strategies) {
        service.setStrategy(strategy);
        expect(service.getStrategy().strategyId).toBe(strategy.strategyId);
      }
    });
  });

  describe('analyzeItem', () => {
    it('should return null for non-existent items', async () => {
      vi.mocked(mockRepository.getItem).mockResolvedValue(null);

      const result = await service.analyzeItem('clinic-1', 'non-existent');

      expect(result).toBeNull();
    });

    it('should return full analysis for existing items', async () => {
      const item = createMockItem();
      const usageHistory = createMockUsageHistory(30, 2);

      vi.mocked(mockRepository.getItem).mockResolvedValue(item);
      vi.mocked(mockRepository.getUsageHistory).mockResolvedValue(usageHistory);

      const result = await service.analyzeItem('clinic-1', 'item-1');

      expect(result).not.toBeNull();
      expect(result?.item).toEqual(item);
      expect(result?.reorderPoint).toBeDefined();
      expect(result?.stockoutPrediction).toBeDefined();
      expect(result?.orderRecommendation).toBeDefined();
      expect(result?.strategyId).toBe('eoq');
    });
  });

  describe('analyzeItemWithHistory', () => {
    it('should perform analysis without database calls', () => {
      const item = createMockItem();
      const usageHistory = createMockUsageHistory(30, 2);

      const result = service.analyzeItemWithHistory(item, usageHistory);

      expect(result.item).toEqual(item);
      expect(result.reorderPoint.reorderLevel).toBeGreaterThan(0);
      expect(result.stockoutPrediction.daysUntilStockout).toBeGreaterThanOrEqual(0);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });
  });

  describe('getHealthSummary', () => {
    it('should calculate clinic-wide health metrics', async () => {
      const items = [
        createMockItem({ id: 'item-1', currentStock: 5, minStock: 10 }), // Low stock
        createMockItem({ id: 'item-2', currentStock: 50 }), // Normal
        createMockItem({
          id: 'item-3',
          expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }), // Expiring soon
      ];

      vi.mocked(mockRepository.getItems).mockResolvedValue(items);
      vi.mocked(mockRepository.getUsageHistory).mockResolvedValue(createMockUsageHistory(30, 2));

      const result = await service.getHealthSummary('clinic-1');

      expect(result.totalItems).toBe(3);
      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it('should return perfect health for empty inventory', async () => {
      vi.mocked(mockRepository.getItems).mockResolvedValue([]);

      const result = await service.getHealthSummary('clinic-1');

      expect(result.totalItems).toBe(0);
      expect(result.healthScore).toBe(100);
    });
  });

  describe('getReorderAlerts', () => {
    it('should return sorted alerts by urgency', async () => {
      const items = [
        createMockItem({ id: 'item-1', currentStock: 2, minStock: 10 }), // Critical
        createMockItem({ id: 'item-2', currentStock: 8, minStock: 10 }), // High
        createMockItem({ id: 'item-3', currentStock: 50, minStock: 10 }), // Normal
      ];

      vi.mocked(mockRepository.getItems).mockResolvedValue(items);
      vi.mocked(mockRepository.getUsageHistory).mockResolvedValue(createMockUsageHistory(30, 2));

      const alerts = await service.getReorderAlerts('clinic-1');

      // Should be sorted with critical first
      if (alerts.length > 1) {
        const urgencyOrder = { critical: 0, high: 1, medium: 2 };
        for (let i = 1; i < alerts.length; i++) {
          expect(urgencyOrder[alerts[i - 1].urgency]).toBeLessThanOrEqual(
            urgencyOrder[alerts[i].urgency]
          );
        }
      }
    });
  });

  describe('generatePurchaseOrderRecommendation', () => {
    it('should aggregate all order recommendations', async () => {
      const items = [
        createMockItem({ id: 'item-1', currentStock: 5, unitPrice: 25 }),
        createMockItem({ id: 'item-2', currentStock: 10, unitPrice: 50 }),
      ];

      vi.mocked(mockRepository.getItems).mockResolvedValue(items);
      vi.mocked(mockRepository.getUsageHistory).mockResolvedValue(createMockUsageHistory(30, 2));

      const result = await service.generatePurchaseOrderRecommendation('clinic-1');

      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      // Items should be sorted by total price descending
      if (result.items.length > 1) {
        for (let i = 1; i < result.items.length; i++) {
          expect(result.items[i - 1].totalPrice).toBeGreaterThanOrEqual(result.items[i].totalPrice);
        }
      }
    });
  });
});

// ============================================================================
// EXPIRY PREDICTION TESTS
// ============================================================================

describe('Expiry Prediction', () => {
  it('should predict expiry risk for perishable items', () => {
    const strategy = createEOQStrategy();
    const item = createMockItem({
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      currentStock: 100,
    });
    const usageHistory = createMockUsageHistory(30, 1); // Low usage

    const result = strategy.predictExpiryRisk(item, usageHistory);

    expect(result).not.toBeNull();
    expect(result?.daysUntilExpiry).toBeLessThanOrEqual(30);
    expect(result?.quantityAtRisk).toBeGreaterThanOrEqual(0);
    expect([
      'use_first',
      'schedule_procedures',
      'transfer_to_other_clinic',
      'discount_sale',
      'donate',
      'dispose',
    ]).toContain(result?.recommendation);
  });

  it('should return null for non-perishable items', () => {
    const strategy = createEOQStrategy();
    const item = createMockItem({ expiryDate: null });
    const usageHistory = createMockUsageHistory(30, 2);

    const result = strategy.predictExpiryRisk(item, usageHistory);

    expect(result).toBeNull();
  });

  it('should flag expired items for disposal', () => {
    const strategy = createEOQStrategy();
    const item = createMockItem({
      expiryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired yesterday
    });
    const usageHistory = createMockUsageHistory(30, 2);

    const result = strategy.predictExpiryRisk(item, usageHistory);

    expect(result).not.toBeNull();
    expect(result?.daysUntilExpiry).toBe(0);
    expect(result?.recommendation).toBe('dispose');
  });
});
