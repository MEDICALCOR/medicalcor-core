/**
 * XRAY Audit Engine - Observability Analyzer
 *
 * Analyzes logging, metrics, tracing, health checks, and error handling.
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import type { ObservabilityAnalysis, AuditIssue, AnalyzerConfig } from './types.js';

export class ObservabilityAnalyzer {
  constructor(private config: AnalyzerConfig) {}

  async analyze(): Promise<ObservabilityAnalysis> {
    const [
      loggingQuality,
      metricscoverage,
      tracingImplemented,
      correlationIDsUsed,
      healthChecks,
      issues,
    ] = await Promise.all([
      this.assessLogging(),
      this.assessMetrics(),
      this.checkTracing(),
      this.checkCorrelationIDs(),
      this.findHealthChecks(),
      this.detectIssues(),
    ]);

    return {
      loggingQuality,
      metricscoverage,
      tracingImplemented,
      correlationIDsUsed,
      healthChecks,
      issues,
    };
  }

  private async assessLogging(): Promise<number> {
    const rootPath = this.config.rootPath;
    let score = 10;

    const searchPaths = ['packages/core/src', 'apps/api/src', 'apps/trigger/src'];

    let totalFiles = 0;
    let filesWithStructuredLogging = 0;
    let filesWithConsoleLog = 0;

    for (const searchPath of searchPaths) {
      const fullPath = join(rootPath, searchPath);

      try {
        const files = await this.getAllFiles(fullPath, ['.ts', '.tsx']);

        for (const file of files) {
          const content = await readFile(file, 'utf-8');

          // Skip test files
          if (file.includes('__tests__') || file.includes('.test.')) {
            continue;
          }

          totalFiles++;

          // Check for structured logging
          if (
            content.includes('logger.info') ||
            content.includes('logger.error') ||
            content.includes('logger.warn')
          ) {
            filesWithStructuredLogging++;
          }

          // Check for console.log (anti-pattern)
          if (content.includes('console.log')) {
            filesWithConsoleLog++;
          }
        }
      } catch (error) {
        continue;
      }
    }

    // Calculate score
    if (totalFiles > 0) {
      const structuredRatio = filesWithStructuredLogging / totalFiles;
      const consoleLogPenalty = (filesWithConsoleLog / totalFiles) * 5;

      score = Math.max(0, structuredRatio * 10 - consoleLogPenalty);
    }

    return Math.round(score * 10) / 10;
  }

  private async assessMetrics(): Promise<number> {
    const rootPath = this.config.rootPath;

    // Check for metrics implementations
    const metricsPath = join(rootPath, 'packages/core/src/metrics');
    const observabilityPath = join(rootPath, 'packages/core/src/observability');

    try {
      const metricsFiles = await this.getAllFiles(metricsPath, ['.ts']);
      const observabilityFiles = await this.getAllFiles(observabilityPath, ['.ts']);

      const totalMetricFiles = metricsFiles.length + observabilityFiles.length;

      // Check for OpenTelemetry
      let hasOTel = false;
      for (const file of [...metricsFiles, ...observabilityFiles]) {
        const content = await readFile(file, 'utf-8');
        if (content.includes('@opentelemetry') || content.includes('OpenTelemetry')) {
          hasOTel = true;
          break;
        }
      }

      // Score based on implementation
      let score = 0;
      if (totalMetricFiles > 0) score += 5;
      if (hasOTel) score += 5;

      return score;
    } catch (error) {
      return 0;
    }
  }

  private async checkTracing(): Promise<boolean> {
    const rootPath = this.config.rootPath;

    const searchPaths = [
      'packages/core/src/observability',
      'packages/core/src/telemetry.ts',
      'apps/api/src/instrumentation.ts',
      'apps/trigger/src/instrumentation.ts',
    ];

    for (const searchPath of searchPaths) {
      const fullPath = join(rootPath, searchPath);

      try {
        const files = await this.getAllFiles(fullPath, ['.ts']);

        for (const file of files) {
          const content = await readFile(file, 'utf-8');

          if (
            content.includes('trace') ||
            content.includes('span') ||
            content.includes('@opentelemetry/api')
          ) {
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }

    return false;
  }

  private async checkCorrelationIDs(): Promise<boolean> {
    const rootPath = this.config.rootPath;

    const files = await this.getAllFiles(join(rootPath, 'packages/core/src'), ['.ts']);

    for (const file of files) {
      const content = await readFile(file, 'utf-8');

      if (
        content.includes('correlationId') ||
        content.includes('correlation-id') ||
        content.includes('requestId')
      ) {
        return true;
      }
    }

    return false;
  }

  private async findHealthChecks(): Promise<string[]> {
    const healthChecks: string[] = [];
    const rootPath = this.config.rootPath;

    const searchPaths = ['apps/api/src/routes/health.ts', 'apps/api/src/routes/diagnostics.ts'];

    for (const searchPath of searchPaths) {
      const fullPath = join(rootPath, searchPath);

      try {
        const content = await readFile(fullPath, 'utf-8');
        const relativePath = relative(rootPath, fullPath);

        // Extract health check endpoints
        const endpointMatches = content.matchAll(/(?:get|post)\(['"]([^'"]+)['"]/g);

        for (const match of endpointMatches) {
          healthChecks.push(`${relativePath}: ${match[1]}`);
        }
      } catch (error) {
        continue;
      }
    }

    return healthChecks;
  }

  private async detectIssues(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const rootPath = this.config.rootPath;

    // Check for console.log usage
    const files = await this.getAllFiles(join(rootPath, 'packages'), ['.ts', '.tsx']);

    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const relativePath = relative(rootPath, file);

      // Skip test files
      if (relativePath.includes('__tests__') || relativePath.includes('.test.')) {
        continue;
      }

      // Check for console.log
      if (content.includes('console.log')) {
        issues.push({
          category: 'OBSERVABILITY',
          title: 'Unstructured logging with console.log',
          description: 'Using console.log instead of structured logger',
          filePath: relativePath,
          impact: 'Logs cannot be properly indexed or searched',
          priority: 'MEDIUM',
          suggestedFix: 'Replace console.log with logger from @medicalcor/core/logger',
          suggestedPR: `fix(observability): replace console.log with structured logger in ${relativePath.split('/').pop()}`,
        });
      }

      // Check for missing error context
      const errorCatchMatches = content.matchAll(/catch\s*\(\s*(\w+)\s*\)/g);

      for (const match of errorCatchMatches) {
        const errorVar = match[1];
        const catchBlock = content.slice(match.index);

        // Check if error is logged or rethrown
        if (
          !catchBlock.includes(`logger.error`) &&
          !catchBlock.includes(`throw`) &&
          !catchBlock.includes(`console.error`)
        ) {
          issues.push({
            category: 'OBSERVABILITY',
            title: 'Silent error handling',
            description: 'Error caught but not logged or rethrown',
            filePath: relativePath,
            impact: 'Errors disappear without trace, making debugging impossible',
            priority: 'HIGH',
            suggestedFix: `Log error with context: logger.error({ err: ${errorVar} }, 'Operation failed')`,
            suggestedPR: `fix(observability): add error logging in ${relativePath.split('/').pop()}`,
          });
        }
      }
    }

    // Check if OpenTelemetry is configured
    const tracingImplemented = await this.checkTracing();
    if (!tracingImplemented) {
      issues.push({
        category: 'OBSERVABILITY',
        title: 'OpenTelemetry not implemented',
        description: 'No distributed tracing found',
        filePath: 'packages/core/src/observability',
        impact: 'Cannot trace requests across services',
        priority: 'MEDIUM',
        suggestedFix: 'Implement OpenTelemetry tracing with proper instrumentation',
        suggestedPR: 'feat(observability): implement OpenTelemetry distributed tracing',
      });
    }

    // Check if correlation IDs are used
    const correlationIDsUsed = await this.checkCorrelationIDs();
    if (!correlationIDsUsed) {
      issues.push({
        category: 'OBSERVABILITY',
        title: 'No correlation ID propagation',
        description: 'Cannot correlate logs across services',
        filePath: 'packages/core/src',
        impact: 'Difficult to debug distributed workflows',
        priority: 'MEDIUM',
        suggestedFix: 'Add correlation ID middleware and propagate through all calls',
        suggestedPR: 'feat(observability): implement correlation ID propagation',
      });
    }

    return issues;
  }

  private async getAllFiles(
    dirPath: string,
    extensions: string[],
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
          const subFiles = await this.getAllFiles(fullPath, extensions, currentDepth + 1);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          if (extensions.some((ext) => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      }

      return files;
    } catch (error) {
      return [];
    }
  }
}
