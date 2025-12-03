/**
 * XRAY Audit Engine - Repository Structure Analyzer
 * 
 * Analyzes the physical structure of the repository to understand
 * the application architecture and package organization.
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, relative } from 'path';
import type { RepositoryStructure, AnalyzerConfig } from './types.js';

export class StructureAnalyzer {
  constructor(private config: AnalyzerConfig) {}

  async analyze(): Promise<RepositoryStructure> {
    const rootPath = this.config.rootPath;

    const [apps, packages, migrations, workflows] = await Promise.all([
      this.scanDirectory(join(rootPath, 'apps')),
      this.scanDirectory(join(rootPath, 'packages')),
      this.scanDirectory(join(rootPath, 'db', 'migrations')),
      this.scanDirectory(join(rootPath, '.github', 'workflows')),
    ]);

    const { totalFiles, totalLines } = await this.countFilesAndLines(rootPath);

    return {
      apps,
      packages,
      migrations,
      workflows,
      totalFiles,
      totalLines,
    };
  }

  private async scanDirectory(dirPath: string): Promise<string[]> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`Directory not found: ${dirPath}`);
      }
      return [];
    }
  }

  private async countFilesAndLines(
    dirPath: string,
    currentDepth: number = 0
  ): Promise<{ totalFiles: number; totalLines: number }> {
    const maxDepth = 10;
    
    if (currentDepth > maxDepth) {
      return { totalFiles: 0, totalLines: 0 };
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      let totalFiles = 0;
      let totalLines = 0;

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        const relativePath = relative(this.config.rootPath, fullPath);

        // Skip excluded paths
        if (this.shouldExclude(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          const subResult = await this.countFilesAndLines(fullPath, currentDepth + 1);
          totalFiles += subResult.totalFiles;
          totalLines += subResult.totalLines;
        } else if (this.isSourceFile(entry.name)) {
          totalFiles++;
          const lines = await this.countLines(fullPath);
          totalLines += lines;
        }
      }

      return { totalFiles, totalLines };
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`Error scanning ${dirPath}:`, error);
      }
      return { totalFiles: 0, totalLines: 0 };
    }
  }

  private shouldExclude(relativePath: string): boolean {
    const excludePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'coverage',
      '.turbo',
      'pnpm-lock.yaml',
      'package-lock.json',
      ...this.config.excludePaths,
    ];

    return excludePatterns.some((pattern) => relativePath.includes(pattern));
  }

  private isSourceFile(filename: string): boolean {
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.sql', '.json', '.md'];
    return sourceExtensions.some((ext) => filename.endsWith(ext));
  }

  private async countLines(filePath: string): Promise<number> {
    try {
      const content = await readFile(filePath, 'utf-8');
      return content.split('\n').length;
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`Error reading ${filePath}:`, error);
      }
      return 0;
    }
  }

  /**
   * Get package.json dependencies across all packages
   */
  async getDependencies(): Promise<Map<string, string[]>> {
    const deps = new Map<string, string[]>();
    const rootPath = this.config.rootPath;

    const packageDirs = [
      join(rootPath, 'packages', 'core'),
      join(rootPath, 'packages', 'domain'),
      join(rootPath, 'packages', 'application'),
      join(rootPath, 'packages', 'types'),
      join(rootPath, 'packages', 'integrations'),
      join(rootPath, 'apps', 'api'),
      join(rootPath, 'apps', 'trigger'),
      join(rootPath, 'apps', 'web'),
    ];

    for (const pkgDir of packageDirs) {
      try {
        const pkgJsonPath = join(pkgDir, 'package.json');
        const content = await readFile(pkgJsonPath, 'utf-8');
        const pkgJson = JSON.parse(content);
        const pkgName = pkgJson.name || relative(rootPath, pkgDir);

        const allDeps = [
          ...Object.keys(pkgJson.dependencies || {}),
          ...Object.keys(pkgJson.devDependencies || {}),
        ];

        deps.set(pkgName, allDeps);
      } catch (error) {
        // Package.json not found or invalid
        continue;
      }
    }

    return deps;
  }

  /**
   * Check if repository follows expected MedicalCor structure
   */
  async validateStructure(): Promise<string[]> {
    const issues: string[] = [];
    const rootPath = this.config.rootPath;

    const requiredDirs = [
      'apps/api',
      'apps/trigger',
      'apps/web',
      'packages/core',
      'packages/domain',
      'packages/types',
      'db/migrations',
    ];

    for (const dir of requiredDirs) {
      try {
        const fullPath = join(rootPath, dir);
        await stat(fullPath);
      } catch (error) {
        issues.push(`Missing required directory: ${dir}`);
      }
    }

    return issues;
  }
}
