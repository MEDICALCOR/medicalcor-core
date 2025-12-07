/**
 * @fileoverview Tests for HNSW optimizer and benchmarking utilities
 */

import { describe, it, expect } from 'vitest';
import {
  SEARCH_PROFILES,
  RECOMMENDED_PARAMS,
  buildHNSWIndexSQL,
  setEfSearchSQL,
} from '../hnsw-optimizer';
import { EF_SEARCH_BY_PROFILE } from '../PgVectorService';

describe('HNSW Optimizer', () => {
  describe('SEARCH_PROFILES', () => {
    it('should have all required profiles', () => {
      expect(SEARCH_PROFILES).toHaveProperty('fast');
      expect(SEARCH_PROFILES).toHaveProperty('balanced');
      expect(SEARCH_PROFILES).toHaveProperty('accurate');
      expect(SEARCH_PROFILES).toHaveProperty('exact');
    });

    it('should have increasing ef_search values', () => {
      expect(SEARCH_PROFILES.fast.efSearch).toBeLessThan(SEARCH_PROFILES.balanced.efSearch);
      expect(SEARCH_PROFILES.balanced.efSearch).toBeLessThan(SEARCH_PROFILES.accurate.efSearch);
      expect(SEARCH_PROFILES.accurate.efSearch).toBeLessThan(SEARCH_PROFILES.exact.efSearch);
    });

    it('should match EF_SEARCH_BY_PROFILE', () => {
      expect(SEARCH_PROFILES.fast.efSearch).toBe(EF_SEARCH_BY_PROFILE.fast);
      expect(SEARCH_PROFILES.balanced.efSearch).toBe(EF_SEARCH_BY_PROFILE.balanced);
      expect(SEARCH_PROFILES.accurate.efSearch).toBe(EF_SEARCH_BY_PROFILE.accurate);
      expect(SEARCH_PROFILES.exact.efSearch).toBe(EF_SEARCH_BY_PROFILE.exact);
    });
  });

  describe('RECOMMENDED_PARAMS', () => {
    it('should have configurations for all dataset sizes', () => {
      expect(RECOMMENDED_PARAMS).toHaveProperty('small');
      expect(RECOMMENDED_PARAMS).toHaveProperty('medium');
      expect(RECOMMENDED_PARAMS).toHaveProperty('large');
      expect(RECOMMENDED_PARAMS).toHaveProperty('xlarge');
    });

    it('should have valid M parameter ranges (4-64)', () => {
      for (const key of Object.keys(RECOMMENDED_PARAMS)) {
        const params = RECOMMENDED_PARAMS[key as keyof typeof RECOMMENDED_PARAMS];
        expect(params.m).toBeGreaterThanOrEqual(4);
        expect(params.m).toBeLessThanOrEqual(64);
      }
    });

    it('should have increasing M values for larger datasets', () => {
      expect(RECOMMENDED_PARAMS.small.m).toBeLessThanOrEqual(RECOMMENDED_PARAMS.medium.m);
      expect(RECOMMENDED_PARAMS.medium.m).toBeLessThanOrEqual(RECOMMENDED_PARAMS.large.m);
      expect(RECOMMENDED_PARAMS.large.m).toBeLessThanOrEqual(RECOMMENDED_PARAMS.xlarge.m);
    });

    it('should have valid ef_construction ranges (64-512)', () => {
      for (const key of Object.keys(RECOMMENDED_PARAMS)) {
        const params = RECOMMENDED_PARAMS[key as keyof typeof RECOMMENDED_PARAMS];
        expect(params.efConstruction).toBeGreaterThanOrEqual(64);
        expect(params.efConstruction).toBeLessThanOrEqual(512);
      }
    });
  });

  describe('buildHNSWIndexSQL', () => {
    it('should generate valid SQL for index creation', () => {
      const sql = buildHNSWIndexSQL('test_table', 'embedding', {
        m: 24,
        efConstruction: 200,
        efSearch: 100,
      });

      expect(sql).toContain('CREATE INDEX CONCURRENTLY');
      expect(sql).toContain('test_table');
      expect(sql).toContain('embedding');
      expect(sql).toContain('hnsw');
      expect(sql).toContain('vector_cosine_ops');
      expect(sql).toContain('m = 24');
      expect(sql).toContain('ef_construction = 200');
    });

    it('should generate non-concurrent index when specified', () => {
      const sql = buildHNSWIndexSQL(
        'test_table',
        'embedding',
        { m: 16, efConstruction: 128, efSearch: 100 },
        false
      );

      expect(sql).not.toContain('CONCURRENTLY');
      expect(sql).toContain('CREATE INDEX');
    });

    it('should drop existing index before creating', () => {
      const sql = buildHNSWIndexSQL('my_table', 'vec', {
        m: 32,
        efConstruction: 256,
        efSearch: 150,
      });

      expect(sql).toContain('DROP INDEX IF EXISTS');
      expect(sql).toContain('idx_my_table_vec_hnsw');
    });
  });

  describe('setEfSearchSQL', () => {
    it('should generate valid SET command', () => {
      const sql = setEfSearchSQL(100);
      expect(sql).toBe('SET hnsw.ef_search = 100;');
    });

    it('should handle various ef_search values', () => {
      expect(setEfSearchSQL(40)).toBe('SET hnsw.ef_search = 40;');
      expect(setEfSearchSQL(200)).toBe('SET hnsw.ef_search = 200;');
      expect(setEfSearchSQL(500)).toBe('SET hnsw.ef_search = 500;');
    });
  });
});

describe('EF_SEARCH_BY_PROFILE', () => {
  it('should have fast profile optimized for low latency', () => {
    expect(EF_SEARCH_BY_PROFILE.fast).toBe(40);
  });

  it('should have balanced profile as default', () => {
    expect(EF_SEARCH_BY_PROFILE.balanced).toBe(100);
  });

  it('should have accurate profile for scoring', () => {
    expect(EF_SEARCH_BY_PROFILE.accurate).toBe(200);
  });

  it('should have exact profile for near-exact results', () => {
    expect(EF_SEARCH_BY_PROFILE.exact).toBe(400);
  });
});
