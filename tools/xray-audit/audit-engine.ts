/**
 * XRAY Audit Engine - Main Orchestrator
 * 
 * Coordinates all analyzers and generates comprehensive audit reports.
 */

import type {
  AuditReport,
  AuditScore,
  AuditIssue,
  AnalyzerConfig,
  TestCoverageAnalysis,
} from './types.js';
import { StructureAnalyzer } from './structure-analyzer.js';
import { LayerAnalyzer } from './layer-analyzer.js';
import { SecurityAnalyzer } from './security-analyzer.js';
import { EventAnalyzer } from './event-analyzer.js';
import { ObservabilityAnalyzer } from './observability-analyzer.js';
import { readdir } from 'fs/promises';
import { join } from 'path';

export class AuditEngine {
  private config: AnalyzerConfig;

  constructor(rootPath: string, options: Partial<AnalyzerConfig> = {}) {
    this.config = {
      rootPath,
      excludePaths: options.excludePaths || [],
      medicalGrade: options.medicalGrade ?? true,
      verbose: options.verbose ?? false,
    };
  }

  async runFullAudit(): Promise<AuditReport> {
    console.log('🔍 Starting XRAY Audit...\n');

    // Initialize analyzers
    const structureAnalyzer = new StructureAnalyzer(this.config);
    const layerAnalyzer = new LayerAnalyzer(this.config);
    const securityAnalyzer = new SecurityAnalyzer(this.config);
    const eventAnalyzer = new EventAnalyzer(this.config);
    const observabilityAnalyzer = new ObservabilityAnalyzer(this.config);

    // Run all analyses in parallel
    console.log('📊 Analyzing repository structure...');
    const structure = await structureAnalyzer.analyze();

    console.log('🏗️  Analyzing DDD layers...');
    const [domainLayer, applicationLayer, infrastructureLayer] = await Promise.all([
      layerAnalyzer.analyzeDomain(),
      layerAnalyzer.analyzeApplication(),
      layerAnalyzer.analyzeInfrastructure(),
    ]);

    console.log('🔒 Analyzing security & privacy...');
    const security = await securityAnalyzer.analyze();

    console.log('📡 Analyzing event-driven architecture...');
    const [eventDriven, cqrs] = await Promise.all([
      eventAnalyzer.analyzeEventDriven(),
      eventAnalyzer.analyzeCQRS(),
    ]);

    console.log('📈 Analyzing observability...');
    const observability = await observabilityAnalyzer.analyze();

    console.log('🧪 Analyzing test coverage...');
    const testing = await this.analyzeTestCoverage();

    console.log('💯 Calculating scores...');
    const allIssues = this.collectAllIssues(
      domainLayer,
      applicationLayer,
      infrastructureLayer,
      security,
      eventDriven,
      cqrs,
      observability,
      testing
    );

    const scores = this.calculateScores(
      domainLayer,
      applicationLayer,
      infrastructureLayer,
      security,
      eventDriven,
      observability,
      testing
    );

    const overallScore = this.calculateOverallScore(scores);

    const recommendations = this.categorizeRecommendations(allIssues);

    const [strengths, weaknesses] = this.identifyStrengthsAndWeaknesses(
      scores,
      structure,
      allIssues
    );

    const deepAuditSuggestions = this.generateDeepAuditSuggestions(allIssues);

    console.log('✅ Audit complete!\n');

    return {
      repositoryUrl: 'https://github.com/MEDICALCOR/medicalcor-core',
      timestamp: new Date().toISOString(),
      structure,
      scores,
      overallScore,
      issues: allIssues,
      layers: {
        domain: domainLayer,
        application: applicationLayer,
        infrastructure: infrastructureLayer,
      },
      security,
      observability,
      eventDriven,
      cqrs,
      testing,
      recommendations,
      strengths,
      weaknesses,
      deepAuditSuggestions,
    };
  }

  private collectAllIssues(...sources: any[]): AuditIssue[] {
    const issues: AuditIssue[] = [];

    for (const source of sources) {
      if (Array.isArray(source)) {
        issues.push(...source);
      } else if (source && typeof source === 'object') {
        if (source.violations) issues.push(...source.violations);
        if (source.issues) issues.push(...source.issues);
        if (source.piiExposures) issues.push(...source.piiExposures);
        if (source.secretsFound) issues.push(...source.secretsFound);
      }
    }

    return issues;
  }

  private calculateScores(
    domainLayer: any,
    applicationLayer: any,
    infrastructureLayer: any,
    security: any,
    eventDriven: any,
    observability: any,
    testing: any
  ): AuditScore {
    return {
      dddPurity: domainLayer.purity,
      hexagonalAdherence: this.calculateHexagonalScore(
        domainLayer,
        applicationLayer,
        infrastructureLayer
      ),
      eventDrivenReadiness: this.calculateEventScore(eventDriven),
      securityPosture: this.calculateSecurityScore(security),
      privacyPosture: this.calculatePrivacyScore(security),
      observabilityCompleteness: this.calculateObservabilityScore(observability),
      dataCleanliness: 8.0, // Placeholder - would need database analyzer
      aiReadiness: 8.5, // Placeholder - would need AI-specific analyzer
      devExperience: 8.0, // Placeholder - would need DX analyzer
      scalability: 7.5, // Placeholder - would need performance analyzer
    };
  }

  private calculateHexagonalScore(...layers: any[]): number {
    const totalViolations = layers.reduce(
      (sum, layer) => sum + (layer.violations?.length || 0),
      0
    );
    return Math.max(0, 10 - totalViolations * 0.5);
  }

  private calculateEventScore(eventDriven: any): number {
    let score = 10;
    if (!eventDriven.outboxPresent) score -= 3;
    if (!eventDriven.idempotencyGuarantees) score -= 2;
    if (!eventDriven.versioningStrategy) score -= 2;
    score -= Math.min(eventDriven.issues.length * 0.5, 3);
    return Math.max(0, score);
  }

  private calculateSecurityScore(security: any): number {
    let score = 10;
    const highPriorityIssues = security.secretsFound.filter(
      (i: AuditIssue) => i.priority === 'HIGH'
    ).length;
    score -= highPriorityIssues * 2;
    score -= Math.min(security.missingEncryption.length * 0.5, 3);
    return Math.max(0, score);
  }

  private calculatePrivacyScore(security: any): number {
    let score = 10;
    const piiIssues = security.piiExposures.length;
    score -= Math.min(piiIssues * 0.5, 5);
    return Math.max(0, score);
  }

  private calculateObservabilityScore(observability: any): number {
    let score = 0;
    score += observability.loggingQuality;
    score += observability.metricscoverage;
    if (observability.tracingImplemented) score += 5;
    if (observability.correlationIDsUsed) score += 3;
    score -= Math.min(observability.issues.length * 0.3, 3);
    return Math.min(10, Math.max(0, score));
  }

  private calculateOverallScore(scores: AuditScore): number {
    const values = Object.values(scores);
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round((sum / values.length) * 10) / 10;
  }

  private categorizeRecommendations(issues: AuditIssue[]) {
    return {
      phase0: issues.filter((i) => i.priority === 'HIGH'),
      phase1: issues.filter(
        (i) => i.priority === 'MEDIUM' && i.category === 'SECURITY'
      ),
      phase2: issues.filter(
        (i) => i.priority === 'MEDIUM' && i.category !== 'SECURITY'
      ),
      phase3: issues.filter((i) => i.priority === 'LOW'),
    };
  }

  private identifyStrengthsAndWeaknesses(
    scores: AuditScore,
    structure: any,
    issues: AuditIssue[]
  ): [string[], string[]] {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Analyze scores
    if (scores.dddPurity >= 8) strengths.push('Strong DDD implementation with clean domain layer');
    else weaknesses.push('Domain layer contains framework dependencies');

    if (scores.hexagonalAdherence >= 8)
      strengths.push('Excellent hexagonal architecture with proper port/adapter separation');
    else weaknesses.push('Cross-layer dependencies violate hexagonal principles');

    if (scores.eventDrivenReadiness >= 8)
      strengths.push('Well-implemented event-driven architecture with proper patterns');
    else weaknesses.push('Event-driven patterns incomplete (missing outbox or versioning)');

    if (scores.securityPosture >= 8) strengths.push('Strong security posture with proper safeguards');
    else weaknesses.push('Security vulnerabilities detected requiring immediate attention');

    if (scores.observabilityCompleteness >= 8)
      strengths.push('Comprehensive observability with tracing and structured logging');
    else weaknesses.push('Observability gaps in logging, metrics, or tracing');

    // Analyze structure
    if (structure.packages.length >= 5)
      strengths.push('Well-organized monorepo with clear package boundaries');

    // Analyze issues
    const highPriorityCount = issues.filter((i) => i.priority === 'HIGH').length;
    if (highPriorityCount > 5)
      weaknesses.push(`${highPriorityCount} high-priority issues requiring immediate action`);

    return [strengths.slice(0, 5), weaknesses.slice(0, 5)];
  }

  private generateDeepAuditSuggestions(issues: AuditIssue[]): string[] {
    const suggestions: string[] = [];

    const categories = new Set(issues.map((i) => i.category));

    if (categories.has('SECURITY')) {
      suggestions.push('Security penetration testing and vulnerability assessment');
    }

    if (categories.has('PRIVACY')) {
      suggestions.push('GDPR compliance audit with data flow mapping');
    }

    if (categories.has('EVENT_DRIVEN')) {
      suggestions.push('Event model consistency review and versioning strategy');
    }

    if (categories.has('OBSERVABILITY')) {
      suggestions.push('Observability maturity assessment with SLO definition');
    }

    suggestions.push('Performance and scalability load testing');
    suggestions.push('AI ingestion pipeline validation and prompt injection testing');

    return suggestions;
  }

  private async analyzeTestCoverage(): Promise<TestCoverageAnalysis> {
    const rootPath = this.config.rootPath;
    const testFiles = await this.findTestFiles();

    const unitTests = testFiles.filter(
      (f) => f.includes('.test.') || f.includes('.spec.')
    ).length;
    const integrationTests = testFiles.filter((f) => f.includes('integration')).length;
    const e2eTests = testFiles.filter((f) => f.includes('e2e')).length;

    // Estimate coverage based on test-to-source ratio
    const sourceFiles = await this.countSourceFiles();
    const estimatedCoverage = Math.min(
      100,
      Math.round((testFiles.length / sourceFiles) * 100)
    );

    const missingTests = await this.identifyMissingTests();

    return {
      unitTests,
      integrationTests,
      e2eTests,
      estimatedCoverage,
      missingTests,
      issues: [],
    };
  }

  private async findTestFiles(): Promise<string[]> {
    const testFiles: string[] = [];
    const testDirs = ['__tests__', 'e2e', 'test', 'tests'];

    const scanDir = async (dirPath: string, depth: number = 0): Promise<void> => {
      if (depth > 10) return;

      try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);

          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;

          if (entry.isDirectory()) {
            if (testDirs.some((td) => entry.name.includes(td))) {
              const files = await this.getAllTestFiles(fullPath);
              testFiles.push(...files);
            } else {
              await scanDir(fullPath, depth + 1);
            }
          } else if (
            entry.name.includes('.test.') ||
            entry.name.includes('.spec.') ||
            entry.name.includes('.e2e.')
          ) {
            testFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Skip inaccessible directories
      }
    };

    await scanDir(this.config.rootPath);
    return testFiles;
  }

  private async getAllTestFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory() && entry.name !== 'node_modules') {
          const subFiles = await this.getAllTestFiles(fullPath);
          files.push(...subFiles);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
        ) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip
    }

    return files;
  }

  private async countSourceFiles(): Promise<number> {
    let count = 0;

    const scanDir = async (dirPath: string, depth: number = 0): Promise<void> => {
      if (depth > 10) return;

      try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);

          if (
            entry.name === 'node_modules' ||
            entry.name.startsWith('.') ||
            entry.name === 'dist' ||
            entry.name === 'build'
          )
            continue;

          if (entry.isDirectory()) {
            await scanDir(fullPath, depth + 1);
          } else if (
            (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
            !entry.name.includes('.test.') &&
            !entry.name.includes('.spec.')
          ) {
            count++;
          }
        }
      } catch (error) {
        // Skip
      }
    };

    await scanDir(join(this.config.rootPath, 'packages'));
    await scanDir(join(this.config.rootPath, 'apps'));
    return count;
  }

  private async identifyMissingTests(): Promise<string[]> {
    // Simplified - would need more sophisticated analysis
    return [
      'Integration tests for external service failures',
      'E2E tests for GDPR consent workflows',
      'Load tests for API endpoints',
      'Security tests for authentication flows',
    ];
  }
}
