/**
 * XRAY Audit Engine - Layer Purity Analyzer
 *
 * Analyzes DDD layer boundaries and detects violations of hexagonal architecture
 * principles (domain depending on infrastructure, UI logic in domain, etc.)
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import type { LayerAnalysis, AuditIssue, AnalyzerConfig } from './types.js';

const FRAMEWORK_PATTERNS = [
  'fastify',
  'express',
  'next',
  'react',
  'pg',
  'redis',
  'axios',
  'node-fetch',
  '@trigger.dev',
  'openai',
  'stripe',
];

const LAYER_PATHS = {
  domain: ['packages/domain/src', 'packages/core/src/domain'],
  application: ['packages/application/src', 'packages/core/src/application'],
  infrastructure: [
    'packages/infrastructure/src',
    'packages/core/src/infra',
    'packages/core/src/infrastructure',
    'packages/integrations/src',
  ],
};

export class LayerAnalyzer {
  constructor(private config: AnalyzerConfig) {}

  async analyzeDomain(): Promise<LayerAnalysis> {
    return this.analyzeLayer('domain', LAYER_PATHS.domain);
  }

  async analyzeApplication(): Promise<LayerAnalysis> {
    return this.analyzeLayer('application', LAYER_PATHS.application);
  }

  async analyzeInfrastructure(): Promise<LayerAnalysis> {
    return this.analyzeLayer('infrastructure', LAYER_PATHS.infrastructure);
  }

  private async analyzeLayer(layerName: string, layerPaths: string[]): Promise<LayerAnalysis> {
    const violations: AuditIssue[] = [];
    const frameworkDeps: string[] = [];
    const crossLayerImports: string[] = [];

    for (const layerPath of layerPaths) {
      const fullPath = join(this.config.rootPath, layerPath);

      try {
        const files = await this.getAllTypeScriptFiles(fullPath);

        for (const file of files) {
          const content = await readFile(file, 'utf-8');
          const relativePath = relative(this.config.rootPath, file);

          // Check for framework dependencies (especially in domain)
          if (layerName === 'domain') {
            const frameworkImports = this.detectFrameworkImports(content);
            frameworkDeps.push(...frameworkImports);

            for (const fwImport of frameworkImports) {
              violations.push({
                category: 'DDD',
                title: 'Framework dependency in domain layer',
                description: `Domain layer should be framework-agnostic but imports ${fwImport}`,
                filePath: relativePath,
                impact: 'Breaks hexagonal architecture, reduces testability',
                priority: 'HIGH',
                suggestedFix: `Remove ${fwImport} import and use ports/interfaces instead`,
                suggestedPR: `refactor(domain): remove framework dependency from ${relativePath.split('/').pop()}`,
              });
            }
          }

          // Check for cross-layer imports
          const invalidImports = this.detectCrossLayerImports(content, layerName, relativePath);
          crossLayerImports.push(...invalidImports);

          for (const invalidImport of invalidImports) {
            violations.push({
              category: 'HEXAGONAL',
              title: 'Invalid cross-layer import',
              description: `${layerName} layer imports from ${invalidImport}`,
              filePath: relativePath,
              impact: 'Violates dependency inversion principle',
              priority: 'MEDIUM',
              suggestedFix: `Use dependency injection or ports/adapters pattern`,
              suggestedPR: `refactor(${layerName}): fix cross-layer dependency in ${relativePath.split('/').pop()}`,
            });
          }

          // Check for domain logic leaks in infrastructure
          if (layerName === 'infrastructure') {
            const logicLeaks = this.detectDomainLogicInInfra(content);
            if (logicLeaks.length > 0) {
              violations.push({
                category: 'DDD',
                title: 'Business logic in infrastructure layer',
                description: `Infrastructure should only handle technical concerns`,
                filePath: relativePath,
                impact: 'Makes business logic hard to test and maintain',
                priority: 'MEDIUM',
                suggestedFix: `Move business logic to domain layer`,
                suggestedPR: `refactor(domain): extract business logic from ${relativePath.split('/').pop()}`,
              });
            }
          }
        }
      } catch (error) {
        if (this.config.verbose) {
          console.warn(`Error analyzing ${layerPath}:`, error);
        }
      }
    }

    const purity = this.calculatePurity(violations.length, frameworkDeps.length);

    return {
      path: layerPaths.join(', '),
      violations,
      purity,
      frameworkDependencies: [...new Set(frameworkDeps)],
      crossLayerImports: [...new Set(crossLayerImports)],
    };
  }

  private async getAllTypeScriptFiles(
    dirPath: string,
    currentDepth: number = 0
  ): Promise<string[]> {
    const maxDepth = 10;

    if (currentDepth > maxDepth) {
      return [];
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.getAllTypeScriptFiles(fullPath, currentDepth + 1);
          files.push(...subFiles);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          files.push(fullPath);
        }
      }

      return files;
    } catch (error) {
      return [];
    }
  }

  private detectFrameworkImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      for (const framework of FRAMEWORK_PATTERNS) {
        if (importPath.includes(framework) && !importPath.includes('@medicalcor')) {
          imports.push(importPath);
        }
      }
    }

    return imports;
  }

  private detectCrossLayerImports(
    content: string,
    currentLayer: string,
    currentFilePath: string
  ): string[] {
    const invalidImports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];

      // Domain should not import from infrastructure
      if (currentLayer === 'domain' && this.isInfrastructureImport(importPath)) {
        invalidImports.push(importPath);
      }

      // Application should not import from infrastructure (only through ports)
      if (currentLayer === 'application' && this.isInfrastructureImport(importPath)) {
        // Allow port definitions
        if (!importPath.includes('/ports/')) {
          invalidImports.push(importPath);
        }
      }

      // UI layers should not import domain directly
      if (currentFilePath.includes('apps/web') && this.isDomainImport(importPath)) {
        invalidImports.push(importPath);
      }
    }

    return invalidImports;
  }

  private isInfrastructureImport(importPath: string): boolean {
    return (
      importPath.includes('/infra/') ||
      importPath.includes('/infrastructure/') ||
      importPath.includes('/integrations/')
    );
  }

  private isDomainImport(importPath: string): boolean {
    return importPath.includes('/domain/') && !importPath.includes('/types/');
  }

  private detectDomainLogicInInfra(content: string): string[] {
    const businessLogicPatterns = [
      /class\s+\w+Service/, // Services in infrastructure (should be in domain)
      /calculate\w+/, // Calculations
      /validate\w+Rules/, // Business rule validation
      /apply\w+Policy/, // Policy application
    ];

    const leaks: string[] = [];

    for (const pattern of businessLogicPatterns) {
      if (pattern.test(content)) {
        leaks.push(pattern.toString());
      }
    }

    return leaks;
  }

  private calculatePurity(violationCount: number, frameworkDepCount: number): number {
    // Perfect purity is 10, each violation reduces score
    const baseScore = 10;
    const violationPenalty = Math.min(violationCount * 0.5, 5);
    const frameworkPenalty = Math.min(frameworkDepCount * 0.3, 3);

    return Math.max(0, baseScore - violationPenalty - frameworkPenalty);
  }
}
