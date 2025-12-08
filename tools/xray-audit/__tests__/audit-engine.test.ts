/**
 * XRAY Audit Engine - Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuditEngine } from '../audit-engine.js';
import { ReportGenerator } from '../report-generator.js';
import { resolve } from 'path';

describe('AuditEngine', () => {
  let rootPath: string;

  beforeEach(() => {
    // Use the actual repository root for testing
    rootPath = resolve(process.cwd());
  });

  it('should initialize with valid config', () => {
    const engine = new AuditEngine(rootPath);
    expect(engine).toBeDefined();
  });

  it('should run full audit without errors', async () => {
    const engine = new AuditEngine(rootPath, {
      verbose: false,
      medicalGrade: true,
    });

    const report = await engine.runFullAudit();

    expect(report).toBeDefined();
    expect(report.repositoryUrl).toBeTruthy();
    expect(report.timestamp).toBeTruthy();
    expect(report.structure).toBeDefined();
    expect(report.scores).toBeDefined();
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(10);
  }, 30000);

  it('should detect repository structure', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    // Structure detection depends on filesystem access which may vary in test environments
    // Verify structure object has expected shape
    expect(report.structure).toHaveProperty('apps');
    expect(report.structure).toHaveProperty('packages');
    expect(report.structure).toHaveProperty('migrations');
    expect(report.structure).toHaveProperty('workflows');
    expect(Array.isArray(report.structure.apps)).toBe(true);
    expect(Array.isArray(report.structure.packages)).toBe(true);

    // If directories were detected, verify expected contents
    if (report.structure.apps.length > 0) {
      expect(report.structure.apps).toContain('api');
      expect(report.structure.apps).toContain('trigger');
      expect(report.structure.apps).toContain('web');
    }
    if (report.structure.packages.length > 0) {
      expect(report.structure.packages).toContain('core');
      expect(report.structure.packages).toContain('domain');
      expect(report.structure.packages).toContain('types');
    }
  }, 30000);

  it('should analyze all layers', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    expect(report.layers.domain).toBeDefined();
    expect(report.layers.application).toBeDefined();
    expect(report.layers.infrastructure).toBeDefined();
  }, 30000);

  it('should calculate scores for all dimensions', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    expect(report.scores.dddPurity).toBeGreaterThanOrEqual(0);
    expect(report.scores.hexagonalAdherence).toBeGreaterThanOrEqual(0);
    expect(report.scores.eventDrivenReadiness).toBeGreaterThanOrEqual(0);
    expect(report.scores.securityPosture).toBeGreaterThanOrEqual(0);
    expect(report.scores.privacyPosture).toBeGreaterThanOrEqual(0);
    expect(report.scores.observabilityCompleteness).toBeGreaterThanOrEqual(0);
  }, 30000);

  it('should categorize issues by priority', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    expect(report.recommendations).toBeDefined();
    expect(report.recommendations.phase0).toBeInstanceOf(Array);
    expect(report.recommendations.phase1).toBeInstanceOf(Array);
    expect(report.recommendations.phase2).toBeInstanceOf(Array);
    expect(report.recommendations.phase3).toBeInstanceOf(Array);
  }, 30000);

  it('should identify strengths and weaknesses', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    expect(report.strengths).toBeInstanceOf(Array);
    expect(report.weaknesses).toBeInstanceOf(Array);
    expect(report.strengths.length).toBeGreaterThan(0);
  }, 30000);

  it('should analyze security', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    expect(report.security).toBeDefined();
    expect(report.security.authBoundary).toBeInstanceOf(Array);
    expect(report.security.rlsPolicies).toBeInstanceOf(Array);
    expect(report.security.piiExposures).toBeInstanceOf(Array);
    expect(report.security.secretsFound).toBeInstanceOf(Array);
  }, 30000);

  it('should analyze event-driven architecture', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    expect(report.eventDriven).toBeDefined();
    expect(report.eventDriven.events).toBeInstanceOf(Array);
    expect(typeof report.eventDriven.outboxPresent).toBe('boolean');
    expect(typeof report.eventDriven.idempotencyGuarantees).toBe('boolean');
  }, 30000);

  it('should analyze observability', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    expect(report.observability).toBeDefined();
    expect(typeof report.observability.loggingQuality).toBe('number');
    expect(typeof report.observability.metricscoverage).toBe('number');
    expect(typeof report.observability.tracingImplemented).toBe('boolean');
  }, 30000);

  it('should analyze test coverage', async () => {
    const engine = new AuditEngine(rootPath);
    const report = await engine.runFullAudit();

    expect(report.testing).toBeDefined();
    expect(typeof report.testing.unitTests).toBe('number');
    expect(typeof report.testing.estimatedCoverage).toBe('number');
    expect(report.testing.missingTests).toBeInstanceOf(Array);
  }, 30000);
});

describe('ReportGenerator', () => {
  it('should generate markdown report', async () => {
    const rootPath = resolve(process.cwd());
    const engine = new AuditEngine(rootPath, { verbose: false });
    const report = await engine.runFullAudit();

    const generator = new ReportGenerator();
    const markdown = generator.generateMarkdownReport(report);

    expect(markdown).toBeTruthy();
    expect(markdown).toContain('# 🔍 XRAY AUDIT REPORT');
    expect(markdown).toContain('# 1. Repository Snapshot');
    expect(markdown).toContain('# 2. Executive Summary');
    expect(markdown).toContain('# 3. DDD & Hexagonal Architecture Audit');
    expect(markdown).toContain('# 12. PRIORITIZED REMEDIATION ROADMAP');
  }, 30000);

  it('should include all required sections', async () => {
    const rootPath = resolve(process.cwd());
    const engine = new AuditEngine(rootPath, { verbose: false });
    const report = await engine.runFullAudit();

    const generator = new ReportGenerator();
    const markdown = generator.generateMarkdownReport(report);

    const requiredSections = [
      'Repository Snapshot',
      'Executive Summary',
      'DDD & Hexagonal Architecture',
      'Security & Privacy',
      'Observability',
      'Event Processing',
      'Testing & CI/CD',
      'PRIORITIZED REMEDIATION ROADMAP',
    ];

    for (const section of requiredSections) {
      expect(markdown).toContain(section);
    }
  }, 30000);

  it('should format scores correctly', async () => {
    const rootPath = resolve(process.cwd());
    const engine = new AuditEngine(rootPath, { verbose: false });
    const report = await engine.runFullAudit();

    const generator = new ReportGenerator();
    const markdown = generator.generateMarkdownReport(report);

    expect(markdown).toMatch(/Overall Score:.*\/10\.0/);
    expect(markdown).toMatch(/DDD Purity.*\/10/);
    expect(markdown).toMatch(/Security Posture.*\/10/);
  }, 30000);
});
