/**
 * XRAY Audit Engine - Type Definitions
 *
 * Defines all types used across the audit engine for analyzing repository architecture,
 * security, observability, and compliance against MedicalCor standards.
 */

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export type AuditCategory =
  | 'DDD'
  | 'HEXAGONAL'
  | 'EVENT_DRIVEN'
  | 'SECURITY'
  | 'PRIVACY'
  | 'OBSERVABILITY'
  | 'DATA'
  | 'AI'
  | 'TESTING'
  | 'DEVEX'
  | 'INFRASTRUCTURE';

export interface AuditIssue {
  category: AuditCategory;
  title: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  impact: string;
  priority: Priority;
  suggestedFix: string;
  suggestedPR: string;
}

export interface AuditScore {
  dddPurity: number;
  hexagonalAdherence: number;
  eventDrivenReadiness: number;
  securityPosture: number;
  privacyPosture: number;
  observabilityCompleteness: number;
  dataCleanliness: number;
  aiReadiness: number;
  devExperience: number;
  scalability: number;
}

export interface LayerAnalysis {
  path: string;
  violations: AuditIssue[];
  purity: number;
  frameworkDependencies: string[];
  crossLayerImports: string[];
}

export interface SecurityAnalysis {
  authBoundary: string[];
  rlsPolicies: string[];
  piiExposures: AuditIssue[];
  secretsFound: AuditIssue[];
  missingEncryption: string[];
  topRisks: AuditIssue[];
}

export interface ObservabilityAnalysis {
  loggingQuality: number;
  metricscoverage: number;
  tracingImplemented: boolean;
  correlationIDsUsed: boolean;
  healthChecks: string[];
  issues: AuditIssue[];
}

export interface EventDrivenAnalysis {
  events: EventDefinition[];
  outboxPresent: boolean;
  idempotencyGuarantees: boolean;
  versioningStrategy: string | null;
  issues: AuditIssue[];
}

export interface EventDefinition {
  name: string;
  filePath: string;
  properties: string[];
  versioned: boolean;
}

export interface CQRSAnalysis {
  commands: string[];
  queries: string[];
  separation: boolean;
  issues: AuditIssue[];
}

export interface TestCoverageAnalysis {
  unitTests: number;
  integrationTests: number;
  e2eTests: number;
  estimatedCoverage: number;
  missingTests: string[];
  issues: AuditIssue[];
}

export interface RepositoryStructure {
  apps: string[];
  packages: string[];
  migrations: string[];
  workflows: string[];
  totalFiles: number;
  totalLines: number;
}

export interface AuditReport {
  repositoryUrl: string;
  timestamp: string;
  structure: RepositoryStructure;
  scores: AuditScore;
  overallScore: number;
  issues: AuditIssue[];
  layers: {
    domain: LayerAnalysis;
    application: LayerAnalysis;
    infrastructure: LayerAnalysis;
  };
  security: SecurityAnalysis;
  observability: ObservabilityAnalysis;
  eventDriven: EventDrivenAnalysis;
  cqrs: CQRSAnalysis;
  testing: TestCoverageAnalysis;
  recommendations: {
    phase0: AuditIssue[]; // Firefighting (HIGH)
    phase1: AuditIssue[]; // Hardening (MEDIUM)
    phase2: AuditIssue[]; // Scaling (MEDIUM/LOW)
    phase3: AuditIssue[]; // Excellence (LOW)
  };
  strengths: string[];
  weaknesses: string[];
  deepAuditSuggestions: string[];
}

export interface AnalyzerConfig {
  rootPath: string;
  excludePaths: string[];
  medicalGrade: boolean;
  verbose: boolean;
}
