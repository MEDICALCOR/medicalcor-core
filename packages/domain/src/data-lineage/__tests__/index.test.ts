/**
 * Tests for data-lineage module exports
 *
 * Ensures all exports are properly re-exported from the index file
 */

import { describe, it, expect } from 'vitest';
import {
  DataLineageService,
  createDataLineageService,
  type DataLineageServiceDependencies,
  type AggregateRef,
  type LineageDashboard,
} from '../index.js';

describe('Data Lineage Module Exports', () => {
  describe('Class Exports', () => {
    it('should export DataLineageService class', () => {
      expect(DataLineageService).toBeDefined();
      expect(typeof DataLineageService).toBe('function');
    });
  });

  describe('Function Exports', () => {
    it('should export createDataLineageService factory function', () => {
      expect(createDataLineageService).toBeDefined();
      expect(typeof createDataLineageService).toBe('function');
    });

    it('should create service instance using factory', () => {
      const service = createDataLineageService({});
      expect(service).toBeInstanceOf(DataLineageService);
    });
  });

  describe('Type Exports', () => {
    it('should allow using DataLineageServiceDependencies type', () => {
      const deps: DataLineageServiceDependencies = {
        connectionString: 'postgresql://localhost:5432/test',
      };
      expect(deps.connectionString).toBe('postgresql://localhost:5432/test');
    });

    it('should allow using AggregateRef type', () => {
      const aggregate: AggregateRef = {
        aggregateId: 'test-123',
        aggregateType: 'Lead',
      };
      expect(aggregate.aggregateId).toBe('test-123');
      expect(aggregate.aggregateType).toBe('Lead');
    });

    it('should allow using LineageDashboard type', () => {
      const dashboard: Partial<LineageDashboard> = {
        recentActivity: {
          last24h: 10,
          last7d: 50,
          last30d: 100,
        },
      };
      expect(dashboard.recentActivity?.last24h).toBe(10);
    });
  });

  describe('Module Integration', () => {
    it('should work with all exported types together', () => {
      const deps: DataLineageServiceDependencies = {
        config: {
          batchSize: 100,
        },
      };

      const service = createDataLineageService(deps);
      expect(service).toBeInstanceOf(DataLineageService);

      const aggregate: AggregateRef = {
        aggregateId: 'agg-456',
        aggregateType: 'Patient',
      };

      expect(aggregate).toBeDefined();
    });
  });
});
