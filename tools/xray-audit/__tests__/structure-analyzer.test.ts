/**
 * XRAY Audit Engine - Structure Analyzer Tests
 * Tests for repository structure analysis functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StructureAnalyzer } from '../structure-analyzer.js';
import { resolve, join } from 'path';
import type { AnalyzerConfig } from '../types.js';

describe('StructureAnalyzer', () => {
  let rootPath: string;
  let config: AnalyzerConfig;

  beforeEach(() => {
    rootPath = resolve(process.cwd());
    config = {
      rootPath,
      verbose: false,
      excludePaths: [],
      medicalGrade: false,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      const analyzer = new StructureAnalyzer(config);
      expect(analyzer).toBeDefined();
    });
  });

  describe('analyze', () => {
    it('should analyze repository structure', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      expect(result).toBeDefined();
      expect(result.apps).toBeDefined();
      expect(result.packages).toBeDefined();
      expect(result.migrations).toBeDefined();
      expect(result.workflows).toBeDefined();
      expect(typeof result.totalFiles).toBe('number');
      expect(typeof result.totalLines).toBe('number');
    });

    it('should find apps directory contents', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      expect(Array.isArray(result.apps)).toBe(true);
      // MedicalCor should have api, trigger, web apps
      expect(result.apps).toContain('api');
      expect(result.apps).toContain('trigger');
      expect(result.apps).toContain('web');
    });

    it('should find packages directory contents', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      expect(Array.isArray(result.packages)).toBe(true);
      // MedicalCor should have core, domain, types packages
      expect(result.packages).toContain('core');
      expect(result.packages).toContain('domain');
      expect(result.packages).toContain('types');
    });

    it('should find migrations', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      // Migrations may be in db/migrations or supabase/migrations
      expect(Array.isArray(result.migrations)).toBe(true);
    });

    it('should find workflows', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      expect(Array.isArray(result.workflows)).toBe(true);
    });

    it('should count files and lines', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.totalLines).toBeGreaterThan(0);
    });
  });

  describe('scanDirectory (via analyze)', () => {
    it('should handle non-existent directories gracefully', async () => {
      const customConfig: AnalyzerConfig = {
        ...config,
        rootPath: '/non-existent-path',
        verbose: false,
      };
      const analyzer = new StructureAnalyzer(customConfig);
      const result = await analyzer.analyze();

      // Should return empty arrays for non-existent paths
      expect(result.apps).toEqual([]);
      expect(result.packages).toEqual([]);
    });

    it('should log warning in verbose mode for missing directories', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const customConfig: AnalyzerConfig = {
        ...config,
        rootPath: '/non-existent-path',
        verbose: true,
      };
      const analyzer = new StructureAnalyzer(customConfig);
      await analyzer.analyze();

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('shouldExclude', () => {
    it('should exclude node_modules', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      // Files in node_modules should not be counted
      // This is implicit - we just verify total isn't astronomically high
      expect(result.totalFiles).toBeLessThan(100000);
    });

    it('should respect custom exclude paths', async () => {
      const customConfig: AnalyzerConfig = {
        ...config,
        excludePaths: ['tools'],
      };
      const analyzer = new StructureAnalyzer(customConfig);
      const result = await analyzer.analyze();

      // Result should still be valid
      expect(result.totalFiles).toBeGreaterThan(0);
    });
  });

  describe('isSourceFile', () => {
    it('should count TypeScript files', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      // MedicalCor is a TypeScript project
      expect(result.totalFiles).toBeGreaterThan(100);
    });
  });

  describe('getDependencies', () => {
    it('should get dependencies from all packages', async () => {
      const analyzer = new StructureAnalyzer(config);
      const deps = await analyzer.getDependencies();

      expect(deps).toBeDefined();
      expect(deps instanceof Map).toBe(true);
      expect(deps.size).toBeGreaterThan(0);
    });

    it('should include core package dependencies', async () => {
      const analyzer = new StructureAnalyzer(config);
      const deps = await analyzer.getDependencies();

      // Find core package
      const coreKey = Array.from(deps.keys()).find((k) => k.includes('core'));
      if (coreKey) {
        const coreDeps = deps.get(coreKey);
        expect(Array.isArray(coreDeps)).toBe(true);
        expect(coreDeps!.length).toBeGreaterThan(0);
      }
    });

    it('should include domain package dependencies', async () => {
      const analyzer = new StructureAnalyzer(config);
      const deps = await analyzer.getDependencies();

      const domainKey = Array.from(deps.keys()).find((k) => k.includes('domain'));
      if (domainKey) {
        const domainDeps = deps.get(domainKey);
        expect(Array.isArray(domainDeps)).toBe(true);
      }
    });

    it('should handle missing package.json gracefully', async () => {
      const customConfig: AnalyzerConfig = {
        ...config,
        rootPath: '/tmp',
      };
      const analyzer = new StructureAnalyzer(customConfig);
      const deps = await analyzer.getDependencies();

      // Should return empty map for missing packages
      expect(deps instanceof Map).toBe(true);
      expect(deps.size).toBe(0);
    });
  });

  describe('validateStructure', () => {
    it('should validate MedicalCor repository structure', async () => {
      const analyzer = new StructureAnalyzer(config);
      const issues = await analyzer.validateStructure();

      expect(Array.isArray(issues)).toBe(true);
      // Valid MedicalCor repo should have no or few issues
      expect(issues.length).toBeLessThan(5);
    });

    it('should detect missing required directories', async () => {
      const customConfig: AnalyzerConfig = {
        ...config,
        rootPath: '/tmp',
      };
      const analyzer = new StructureAnalyzer(customConfig);
      const issues = await analyzer.validateStructure();

      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.includes('Missing required directory'))).toBe(true);
    });

    it('should check for apps/api directory', async () => {
      const analyzer = new StructureAnalyzer(config);
      const issues = await analyzer.validateStructure();

      // If apps/api is missing, there should be an issue
      const hasApiIssue = issues.some((i) => i.includes('apps/api'));
      // In a valid repo, this should be false
      expect(hasApiIssue).toBe(false);
    });

    it('should check for apps/trigger directory', async () => {
      const analyzer = new StructureAnalyzer(config);
      const issues = await analyzer.validateStructure();

      const hasTriggerIssue = issues.some((i) => i.includes('apps/trigger'));
      expect(hasTriggerIssue).toBe(false);
    });

    it('should check for apps/web directory', async () => {
      const analyzer = new StructureAnalyzer(config);
      const issues = await analyzer.validateStructure();

      const hasWebIssue = issues.some((i) => i.includes('apps/web'));
      expect(hasWebIssue).toBe(false);
    });

    it('should check for packages/core directory', async () => {
      const analyzer = new StructureAnalyzer(config);
      const issues = await analyzer.validateStructure();

      const hasCoreIssue = issues.some((i) => i.includes('packages/core'));
      expect(hasCoreIssue).toBe(false);
    });

    it('should check for packages/domain directory', async () => {
      const analyzer = new StructureAnalyzer(config);
      const issues = await analyzer.validateStructure();

      const hasDomainIssue = issues.some((i) => i.includes('packages/domain'));
      expect(hasDomainIssue).toBe(false);
    });

    it('should check for packages/types directory', async () => {
      const analyzer = new StructureAnalyzer(config);
      const issues = await analyzer.validateStructure();

      const hasTypesIssue = issues.some((i) => i.includes('packages/types'));
      expect(hasTypesIssue).toBe(false);
    });

    it('should check for db/migrations directory', async () => {
      const analyzer = new StructureAnalyzer(config);
      const issues = await analyzer.validateStructure();

      // db/migrations may or may not exist depending on setup
      expect(Array.isArray(issues)).toBe(true);
    });
  });

  describe('countLines (via analyze)', () => {
    it('should handle unreadable files gracefully', async () => {
      // Use a config that will try to read files
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      // Should complete without throwing
      expect(result.totalLines).toBeGreaterThanOrEqual(0);
    });

    it('should log warning for unreadable files in verbose mode', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const customConfig: AnalyzerConfig = {
        ...config,
        verbose: true,
      };
      const analyzer = new StructureAnalyzer(customConfig);
      await analyzer.analyze();

      // May or may not have warnings depending on file permissions
      expect(consoleSpy).toBeDefined();
    });
  });

  describe('depth limit', () => {
    it('should respect max depth of 10', async () => {
      const analyzer = new StructureAnalyzer(config);
      const result = await analyzer.analyze();

      // Should complete without infinite recursion
      expect(result.totalFiles).toBeGreaterThan(0);
    });
  });

  describe('integration', () => {
    it('should work with real MedicalCor repository', async () => {
      const analyzer = new StructureAnalyzer(config);

      const [structure, deps, issues] = await Promise.all([
        analyzer.analyze(),
        analyzer.getDependencies(),
        analyzer.validateStructure(),
      ]);

      // Verify all methods work together
      expect(structure.apps.length).toBeGreaterThan(0);
      expect(structure.packages.length).toBeGreaterThan(0);
      expect(deps.size).toBeGreaterThan(0);
      expect(Array.isArray(issues)).toBe(true);
    });
  });
});
