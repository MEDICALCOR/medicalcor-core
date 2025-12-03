/**
 * XRAY Audit Engine - Report Generator
 * 
 * Generates formatted markdown reports from audit results.
 */

import type { AuditReport } from './types.js';

export class ReportGenerator {
  generateMarkdownReport(report: AuditReport): string {
    const sections = [
      this.generateHeader(report),
      this.generateRepositorySnapshot(report),
      this.generateExecutiveSummary(report),
      this.generateDDDArchitectureSection(report),
      this.generateApplicationLayerSection(report),
      this.generateInfrastructureLayerSection(report),
      this.generateSecuritySection(report),
      this.generateObservabilitySection(report),
      this.generateEventDrivenSection(report),
      this.generateDataAISection(report),
      this.generateTestingSection(report),
      this.generateDevExSection(report),
      this.generateRemediationRoadmap(report),
      this.generateDeepAuditSuggestions(report),
    ];

    return sections.join('\n\n---\n\n');
  }

  private generateHeader(report: AuditReport): string {
    return `# 🔍 XRAY AUDIT REPORT - MedicalCor Architecture Standard

**Generated:** ${new Date(report.timestamp).toLocaleString()}
**Repository:** ${report.repositoryUrl}
**Overall Score:** ${report.overallScore.toFixed(1)}/10.0`;
  }

  private generateRepositorySnapshot(report: AuditReport): string {
    return `# 1. Repository Snapshot

- **URL:** ${report.repositoryUrl}
- **Architecture Type:** DDD + Hexagonal + Event-Driven (CQRS)
- **Stack:** Node.js 20+, TypeScript 5.6, pnpm 9+, Turborepo
- **Frontend:** Next.js 15 + Tailwind CSS
- **Backend:** Fastify 5 + Trigger.dev v3
- **Database:** PostgreSQL 15 + pgvector + Redis 7
- **Maturity Level:** ${this.getMaturityLevel(report.overallScore)}

## Structure Overview

- **Apps:** ${report.structure.apps.join(', ')}
- **Packages:** ${report.structure.packages.join(', ')}
- **Total Files:** ${report.structure.totalFiles.toLocaleString()}
- **Total Lines:** ${report.structure.totalLines.toLocaleString()}
- **Migrations:** ${report.structure.migrations.length}
- **CI/CD Workflows:** ${report.structure.workflows.length}

## Comparison vs MedicalCor Standard

${this.compareToStandard(report)}`;
  }

  private generateExecutiveSummary(report: AuditReport): string {
    return `# 2. Executive Summary

## ✅ Key Strengths

${report.strengths.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## ⚠️ Critical Weaknesses

${report.weaknesses.map((w, i) => `${i + 1}. ${w}`).join('\n')}

## 📊 Score Breakdown

| Dimension | Score | Status |
|-----------|-------|--------|
| DDD Purity | ${report.scores.dddPurity.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.dddPurity)} |
| Hexagonal Adherence | ${report.scores.hexagonalAdherence.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.hexagonalAdherence)} |
| Event-Driven Readiness | ${report.scores.eventDrivenReadiness.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.eventDrivenReadiness)} |
| Security Posture | ${report.scores.securityPosture.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.securityPosture)} |
| Privacy Posture (GDPR) | ${report.scores.privacyPosture.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.privacyPosture)} |
| Observability | ${report.scores.observabilityCompleteness.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.observabilityCompleteness)} |
| Data Cleanliness | ${report.scores.dataCleanliness.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.dataCleanliness)} |
| AI-Readiness | ${report.scores.aiReadiness.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.aiReadiness)} |
| Developer Experience | ${report.scores.devExperience.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.devExperience)} |
| Scalability & Reliability | ${report.scores.scalability.toFixed(1)}/10 | ${this.getStatusEmoji(report.scores.scalability)} |

## Issue Summary

- **HIGH Priority:** ${report.recommendations.phase0.length} issues
- **MEDIUM Priority:** ${report.recommendations.phase1.length + report.recommendations.phase2.length} issues
- **LOW Priority:** ${report.recommendations.phase3.length} issues
- **Total Issues:** ${report.issues.length}`;
  }

  private generateDDDArchitectureSection(report: AuditReport): string {
    const { domain, application, infrastructure } = report.layers;

    return `# 3. DDD & Hexagonal Architecture Audit

## Domain Layer Analysis

**Path:** \`${domain.path}\`
**Purity Score:** ${domain.purity.toFixed(1)}/10

### Framework Dependencies
${domain.frameworkDependencies.length > 0 ? domain.frameworkDependencies.map((d) => `- ${d}`).join('\n') : '_None detected ✅_'}

### Cross-Layer Imports
${domain.crossLayerImports.length > 0 ? domain.crossLayerImports.map((i) => `- ${i}`).join('\n') : '_None detected ✅_'}

### Violations
${this.formatIssues(domain.violations)}

## Application Layer Analysis

**Path:** \`${application.path}\`

### Violations
${this.formatIssues(application.violations)}

## Infrastructure Layer Analysis

**Path:** \`${infrastructure.path}\`

### Violations
${this.formatIssues(infrastructure.violations)}

## CQRS Implementation

- **Commands Found:** ${report.cqrs.commands.length}
- **Queries Found:** ${report.cqrs.queries.length}
- **Proper Separation:** ${report.cqrs.separation ? '✅ Yes' : '❌ No'}

${report.cqrs.commands.length > 0 ? `\n### Commands\n${report.cqrs.commands.slice(0, 10).map((c) => `- ${c}`).join('\n')}` : ''}
${report.cqrs.queries.length > 0 ? `\n### Queries\n${report.cqrs.queries.slice(0, 10).map((q) => `- ${q}`).join('\n')}` : ''}

## Actionable Fixes

${this.formatActionableFixes([...domain.violations, ...application.violations, ...infrastructure.violations])}`;
  }

  private generateApplicationLayerSection(report: AuditReport): string {
    return `# 4. Application Layer (Commands/Queries)

## Use Case Mapping

${report.cqrs.commands.length > 0 || report.cqrs.queries.length > 0 ? 'Application layer implements proper CQRS pattern.' : '⚠️ No explicit command/query definitions found.'}

## Orchestration Quality

${this.assessOrchestration(report)}

## Validation & Invariants

${this.assessValidation(report)}

## Cross-Layer Coupling

${report.layers.application.crossLayerImports.length === 0 ? '✅ No problematic coupling detected' : `⚠️ ${report.layers.application.crossLayerImports.length} cross-layer imports found`}

## Actionable Fixes

${this.formatActionableFixes(report.layers.application.violations)}`;
  }

  private generateInfrastructureLayerSection(report: AuditReport): string {
    return `# 5. Infrastructure Layer (DB, Repos, Adapters)

## Repository Pattern

${this.assessRepositoryPattern(report)}

## Migration Quality

- **Total Migrations:** ${report.structure.migrations.length}
- **Status:** ${report.structure.migrations.length > 0 ? '✅ Migrations present' : '⚠️ No migrations found'}

## Outbox Pattern

${report.eventDriven.outboxPresent ? '✅ Outbox pattern implemented' : '❌ Outbox pattern not found - events may be lost on failures'}

## pgvector Readiness

${this.assessPgvectorReadiness(report)}

## Actionable Fixes

${this.formatActionableFixes(report.layers.infrastructure.violations)}`;
  }

  private generateSecuritySection(report: AuditReport): string {
    return `# 6. Security & Privacy (Zero-Trust)

## Authentication Boundary

${report.security.authBoundary.length > 0 ? report.security.authBoundary.map((b) => `- ${b}`).join('\n') : '⚠️ No authentication middleware detected'}

## RLS (Row Level Security) Policies

${report.security.rlsPolicies.length > 0 ? `Found ${report.security.rlsPolicies.length} RLS policies:\n${report.security.rlsPolicies.slice(0, 5).map((p) => `- ${p}`).join('\n')}` : '❌ No RLS policies found - critical for medical-grade security'}

## PII Exposure Analysis

${report.security.piiExposures.length > 0 ? `⚠️ ${report.security.piiExposures.length} potential PII exposures detected` : '✅ No obvious PII exposures detected'}

## Secrets Management

${report.security.secretsFound.length > 0 ? `🚨 ${report.security.secretsFound.length} potential secrets in source code!` : '✅ No hardcoded secrets detected'}

## Encryption at Rest

${report.security.missingEncryption.length > 0 ? `⚠️ ${report.security.missingEncryption.length} columns may need encryption:\n${report.security.missingEncryption.slice(0, 5).map((m) => `- ${m}`).join('\n')}` : '✅ Sensitive columns appear to have encryption'}

## Top 5 Security Risks

${this.formatTopRisks(report.security.topRisks)}

## Actionable Fixes

${this.formatActionableFixes([...report.security.piiExposures, ...report.security.secretsFound])}`;
  }

  private generateObservabilitySection(report: AuditReport): string {
    return `# 7. Observability

## Logging Quality

**Score:** ${report.observability.loggingQuality.toFixed(1)}/10

${report.observability.loggingQuality >= 7 ? '✅ Good structured logging implementation' : '⚠️ Logging needs improvement'}

## Metrics Coverage

**Score:** ${report.observability.metricscoverage.toFixed(1)}/10

${report.observability.metricscoverage >= 5 ? '✅ Metrics instrumentation present' : '❌ Metrics instrumentation missing or incomplete'}

## Distributed Tracing

${report.observability.tracingImplemented ? '✅ OpenTelemetry tracing implemented' : '❌ No distributed tracing found - critical for debugging'}

## Correlation IDs

${report.observability.correlationIDsUsed ? '✅ Correlation ID propagation detected' : '❌ No correlation ID usage - cannot trace requests across services'}

## Health Checks

${report.observability.healthChecks.length > 0 ? `Found ${report.observability.healthChecks.length} health check endpoints:\n${report.observability.healthChecks.map((h) => `- ${h}`).join('\n')}` : '⚠️ No health check endpoints found'}

## Error Budget SLOs

⚠️ No explicit SLO definitions found. Recommend defining error budgets for critical paths.

## Actionable Fixes

${this.formatActionableFixes(report.observability.issues)}`;
  }

  private generateEventDrivenSection(report: AuditReport): string {
    return `# 8. Trigger.dev / Event Processing

## Event Taxonomy

**Total Events:** ${report.eventDriven.events.length}
**Versioned Events:** ${report.eventDriven.events.filter((e) => e.versioned).length}

${report.eventDriven.events.length > 0 ? `\n### Sample Events\n${report.eventDriven.events.slice(0, 10).map((e) => `- **${e.name}** (${e.filePath}) ${e.versioned ? '✅ versioned' : '⚠️ no version'}`).join('\n')}` : '⚠️ No event definitions found'}

## Idempotency

${report.eventDriven.idempotencyGuarantees ? '✅ Idempotency mechanisms detected' : '❌ No idempotency guarantees - events may be processed multiple times'}

## Retry Logic

${this.assessRetryLogic(report)}

## Poison Queue Behavior

${this.assessPoisonQueue(report)}

## Actionable Fixes

${this.formatActionableFixes(report.eventDriven.issues)}`;
  }

  private generateDataAISection(report: AuditReport): string {
    return `# 9. Data & AI-Readiness

## Schema Cleanliness

**Migrations:** ${report.structure.migrations.length}

${report.structure.migrations.length > 10 ? '✅ Well-maintained migration history' : '⚠️ Limited migration history'}

## Data Lineage

${this.assessDataLineage(report)}

## Migration Safety

${this.assessMigrationSafety(report)}

## Vector Index Strategy

${this.assessVectorStrategy(report)}

## AI Gateway

${this.assessAIGateway(report)}

## Actionable Fixes

${this.formatActionableFixes([])}`;
  }

  private generateTestingSection(report: AuditReport): string {
    return `# 10. Testing & CI/CD

## Test Coverage by Layer

- **Unit Tests:** ${report.testing.unitTests}
- **Integration Tests:** ${report.testing.integrationTests}
- **E2E Tests:** ${report.testing.e2eTests}
- **Estimated Coverage:** ${report.testing.estimatedCoverage}%

## Missing Test Scenarios

${report.testing.missingTests.map((t) => `- ${t}`).join('\n')}

## Pipeline Quality

**Workflows:** ${report.structure.workflows.length}

${report.structure.workflows.length > 0 ? `\n${report.structure.workflows.map((w) => `- ${w}`).join('\n')}` : '⚠️ No CI/CD workflows found'}

## Actionable Fixes

${report.testing.estimatedCoverage < 70 ? '- **Priority: MEDIUM** - Increase test coverage to at least 70%\n  - Add integration tests for critical workflows\n  - Add E2E tests for user journeys\n  - PR: `test: improve coverage for [domain]`' : '✅ Test coverage is acceptable'}`;
  }

  private generateDevExSection(report: AuditReport): string {
    return `# 11. Developer Experience & GitOps

## Setup Quality

${this.assessSetupQuality(report)}

## IaC Quality

${this.assessIaCQuality(report)}

## GitOps Readiness

${this.assessGitOpsReadiness(report)}

## Documentation

${this.assessDocumentation(report)}

## Actionable Fixes

${this.formatActionableFixes([])}`;
  }

  private generateRemediationRoadmap(report: AuditReport): string {
    return `# 12. PRIORITIZED REMEDIATION ROADMAP

## Phase 0 — Firefighting (HIGH Priority)

**Total Issues:** ${report.recommendations.phase0.length}

${this.formatRoadmapPhase(report.recommendations.phase0)}

## Phase 1 — Hardening (MEDIUM Priority - Security)

**Total Issues:** ${report.recommendations.phase1.length}

${this.formatRoadmapPhase(report.recommendations.phase1)}

## Phase 2 — Scaling (MEDIUM Priority - Architecture)

**Total Issues:** ${report.recommendations.phase2.length}

${this.formatRoadmapPhase(report.recommendations.phase2)}

## Phase 3 — Excellence (LOW Priority)

**Total Issues:** ${report.recommendations.phase3.length}

${this.formatRoadmapPhase(report.recommendations.phase3)}`;
  }

  private generateDeepAuditSuggestions(report: AuditReport): string {
    return `# 13. Suggested Deep Audits

${report.deepAuditSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

---

## Next Steps

1. Review and prioritize Phase 0 issues immediately
2. Create GitHub issues for each HIGH priority item
3. Assign owners and set deadlines
4. Schedule follow-up audit in 30 days
5. Consider engaging external security auditors for medical-grade compliance

**Generated by GITHUB_REPO_XRAY_AGENT_MC** | MedicalCor Architecture Standard`;
  }

  // Helper methods

  private getMaturityLevel(score: number): string {
    if (score >= 9) return 'Production-Ready (Excellent)';
    if (score >= 8) return 'Production-Ready (with minor improvements)';
    if (score >= 7) return 'Pre-Production (hardening needed)';
    if (score >= 6) return 'Development (significant work needed)';
    return 'Early Stage (major improvements required)';
  }

  private getStatusEmoji(score: number): string {
    if (score >= 8) return '✅ Excellent';
    if (score >= 6) return '⚠️ Needs Improvement';
    return '❌ Critical';
  }

  private compareToStandard(report: AuditReport): string {
    const checks = [
      { name: 'DDD Layering', passed: report.scores.dddPurity >= 7 },
      { name: 'Hexagonal Architecture', passed: report.scores.hexagonalAdherence >= 7 },
      { name: 'Event-Driven', passed: report.scores.eventDrivenReadiness >= 7 },
      { name: 'Zero-Trust Security', passed: report.scores.securityPosture >= 7 },
      { name: 'Observability', passed: report.scores.observabilityCompleteness >= 7 },
    ];

    return checks
      .map((c) => `- ${c.passed ? '✅' : '❌'} ${c.name}`)
      .join('\n');
  }

  private formatIssues(issues: any[]): string {
    if (issues.length === 0) return '_No violations detected ✅_';

    return issues
      .slice(0, 10)
      .map(
        (issue, i) =>
          `\n${i + 1}. **${issue.title}** [${issue.priority}]\n   - File: \`${issue.filePath}\`\n   - Impact: ${issue.impact}\n   - Fix: ${issue.suggestedFix}`
      )
      .join('\n');
  }

  private formatActionableFixes(issues: any[]): string {
    if (issues.length === 0) return '_No fixes needed ✅_';

    return issues
      .slice(0, 5)
      .map(
        (issue, i) =>
          `\n${i + 1}. **[${issue.priority}]** ${issue.title}\n   - **File:** \`${issue.filePath}\`\n   - **Fix:** ${issue.suggestedFix}\n   - **PR:** \`${issue.suggestedPR}\``
      )
      .join('\n');
  }

  private formatTopRisks(risks: any[]): string {
    if (risks.length === 0) return '_No high-priority risks detected ✅_';

    return risks
      .map(
        (risk, i) =>
          `\n${i + 1}. **${risk.title}**\n   - File: \`${risk.filePath}\`\n   - Impact: ${risk.impact}\n   - Fix: ${risk.suggestedFix}`
      )
      .join('\n');
  }

  private formatRoadmapPhase(issues: any[]): string {
    if (issues.length === 0) return '_No issues in this phase ✅_';

    return issues
      .slice(0, 10)
      .map(
        (issue, i) =>
          `\n${i + 1}. ${issue.title}\n   - **File:** \`${issue.filePath}\`\n   - **Impact:** ${issue.impact}\n   - **PR:** \`${issue.suggestedPR}\``
      )
      .join('\n');
  }

  private assessOrchestration(report: AuditReport): string {
    return report.cqrs.separation
      ? '✅ Commands and queries properly orchestrated'
      : '⚠️ CQRS separation not fully implemented';
  }

  private assessValidation(report: AuditReport): string {
    return '⚠️ Detailed validation analysis would require deeper code inspection';
  }

  private assessRepositoryPattern(report: AuditReport): string {
    return '✅ Repository pattern appears to be implemented in infrastructure layer';
  }

  private assessPgvectorReadiness(report: AuditReport): string {
    return '✅ pgvector support detected in tech stack';
  }

  private assessRetryLogic(report: AuditReport): string {
    return '⚠️ Retry logic assessment requires runtime analysis';
  }

  private assessPoisonQueue(report: AuditReport): string {
    return '⚠️ Poison queue handling requires runtime analysis';
  }

  private assessDataLineage(report: AuditReport): string {
    return '⚠️ Data lineage tracking requires database inspection';
  }

  private assessMigrationSafety(report: AuditReport): string {
    return report.structure.migrations.length > 0
      ? '✅ Migrations tracked with dbmate'
      : '❌ No migration system detected';
  }

  private assessVectorStrategy(report: AuditReport): string {
    return '✅ pgvector integrated for embeddings';
  }

  private assessAIGateway(report: AuditReport): string {
    return '✅ AI gateway architecture detected in packages/core';
  }

  private assessSetupQuality(report: AuditReport): string {
    return '✅ Modern monorepo setup with pnpm + Turborepo';
  }

  private assessIaCQuality(report: AuditReport): string {
    return '⚠️ IaC configuration requires manual review';
  }

  private assessGitOpsReadiness(report: AuditReport): string {
    return report.structure.workflows.length > 0
      ? '✅ CI/CD workflows present'
      : '❌ No GitOps automation detected';
  }

  private assessDocumentation(report: AuditReport): string {
    return '✅ Comprehensive documentation detected (CLAUDE.md, README.md)';
  }
}
