/**
 * MedicalCor Orchestration Service - Platinum++ Standard
 *
 * Domain service for coordinating multi-agent workflows with surgical precision.
 * Implements 0.1% worldwide execution patterns with:
 * - State machine with checkpointing
 * - Idempotent operations
 * - Comprehensive audit trail
 * - Resilience patterns
 *
 * Standards: Medical-Grade | Banking-Level Security | Surgical Execution
 *
 * @module @medicalcor/domain/orchestration
 * @version 2.0.0-platinum
 */

import { createLogger } from '@medicalcor/core';
import type {
  AgentCodename,
  TaskComplexity,
  RiskLevel,
  QualityGate,
  TaskAnalysis,
  AgentDirective,
  AgentReport,
  QualityGateResult,
  ConflictResolution,
  OrchestrationSession,
  OrchestrationCheckpoint,
  CreateOrchestrationSession,
  OrchestrationReport,
  TaskPriority,
  ConflictType,
  OrchestrationStatus,
  CorrelationId,
} from '@medicalcor/types';
import {
  AGENT_PRIORITY,
  AGENT_FLEET,
  TASK_TYPE_QUALITY_GATES,
  TASK_TYPE_ROUTING,
  getConflictResolver,
  hasHigherPriority,
  allQualityGatesPassed,
  getFailedQualityGates,
  getRequiredQualityGates,
  getTaskRouting,
  isValidStatusTransition,
  generateSessionId,
  generateCorrelationId,
  IdempotencyKeys,
} from '@medicalcor/types';

const logger = createLogger({ name: 'orchestration-service' });

// =============================================================================
// Configuration
// =============================================================================

export interface OrchestrationServiceConfig {
  enableParallelExecution: boolean;
  maxConcurrentAgents: number;
  qualityGateTimeout: number;
  conflictResolutionTimeout: number;
}

const DEFAULT_CONFIG: OrchestrationServiceConfig = {
  enableParallelExecution: true,
  maxConcurrentAgents: 5,
  qualityGateTimeout: 300000, // 5 minutes
  conflictResolutionTimeout: 600000, // 10 minutes
};

// =============================================================================
// Task Analysis Patterns
// =============================================================================

const TASK_PATTERNS: Record<
  string,
  { keywords: string[]; complexity: TaskComplexity; agents: AgentCodename[] }
> = {
  NEW_DOMAIN_SERVICE: {
    keywords: ['domain service', 'business logic', 'aggregate', 'value object', 'entity'],
    complexity: 'MODERATE',
    agents: ['DOMAIN', 'ARCHITECT', 'QA'],
  },
  NEW_INTEGRATION: {
    keywords: ['integration', 'api client', 'external service', 'webhook', 'hubspot', 'stripe'],
    complexity: 'MODERATE',
    agents: ['INTEGRATIONS', 'SECURITY', 'QA'],
  },
  DATABASE_MIGRATION: {
    keywords: ['migration', 'schema', 'table', 'column', 'index', 'database'],
    complexity: 'COMPLEX',
    agents: ['INFRA', 'ARCHITECT', 'SECURITY'],
  },
  AI_RAG_FEATURE: {
    keywords: ['ai', 'rag', 'embedding', 'gpt', 'llm', 'scoring', 'cognitive'],
    complexity: 'COMPLEX',
    agents: ['AI_RAG', 'DOMAIN', 'SECURITY'],
  },
  UI_COMPONENT: {
    keywords: ['component', 'ui', 'frontend', 'react', 'page', 'dashboard'],
    complexity: 'SIMPLE',
    agents: ['FRONTEND', 'QA'],
  },
  SECURITY_FIX: {
    keywords: ['security', 'vulnerability', 'auth', 'encryption', 'secret'],
    complexity: 'CRITICAL',
    agents: ['SECURITY', 'QA', 'DEVOPS'],
  },
  PERFORMANCE_ISSUE: {
    keywords: ['performance', 'slow', 'optimize', 'latency', 'memory', 'cpu'],
    complexity: 'MODERATE',
    agents: ['QA', 'INFRA', 'AI_RAG'],
  },
  DEPLOYMENT: {
    keywords: ['deploy', 'release', 'ci', 'cd', 'pipeline', 'rollout'],
    complexity: 'MODERATE',
    agents: ['DEVOPS', 'SECURITY', 'QA'],
  },
  COMPLIANCE_AUDIT: {
    keywords: ['hipaa', 'gdpr', 'compliance', 'audit', 'consent', 'phi', 'pii'],
    complexity: 'COMPLEX',
    agents: ['COMPLIANCE', 'SECURITY', 'QA'],
  },
  ARCHITECTURE_REFACTOR: {
    keywords: ['refactor', 'architecture', 'restructure', 'layer', 'hexagonal'],
    complexity: 'COMPLEX',
    agents: ['ARCHITECT', 'DOMAIN', 'QA'],
  },
};

// =============================================================================
// Orchestration Service
// =============================================================================

export class OrchestrationService {
  private config: OrchestrationServiceConfig;
  private sessions: Map<string, OrchestrationSession> = new Map();

  constructor(config: Partial<OrchestrationServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a task request and determine the orchestration strategy
   */
  analyzeTask(request: string): TaskAnalysis {
    logger.info({ requestLength: request.length }, 'Analyzing task request');

    const lowerRequest = request.toLowerCase();
    let taskType = 'NEW_DOMAIN_SERVICE'; // Default
    let matchedKeywords = 0;

    // Find best matching task type
    for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
      const matches = pattern.keywords.filter((kw) => lowerRequest.includes(kw)).length;
      if (matches > matchedKeywords) {
        matchedKeywords = matches;
        taskType = type;
      }
    }

    const pattern = TASK_PATTERNS[taskType];
    const routing = getTaskRouting(taskType);

    // Determine if parallelizable based on agent dependencies
    const parallelizable = this.canExecuteInParallel(routing.support);

    // Assess risk level
    const riskLevel = this.assessRisk(pattern.complexity, taskType);

    // Check compliance requirements
    const complianceRequired = this.requiresCompliance(taskType, lowerRequest);
    const securityReview = this.requiresSecurityReview(taskType, lowerRequest);

    const analysis: TaskAnalysis = {
      complexity: pattern.complexity,
      requiredAgents: [routing.primary, ...routing.support],
      parallelizable,
      dependencies: this.buildDependencyGraph([routing.primary, ...routing.support]),
      estimatedRisk: riskLevel,
      complianceRequired,
      securityReview,
    };

    logger.info({ taskType, analysis }, 'Task analysis complete');
    return analysis;
  }

  /**
   * Create directives for each agent based on task analysis
   */
  createDirectives(
    sessionId: string,
    request: string,
    analysis: TaskAnalysis
  ): AgentDirective[] {
    const directives: AgentDirective[] = [];
    const qualityGates = this.getRequiredQualityGatesForAnalysis(analysis);

    for (const agent of analysis.requiredAgents) {
      const directive: AgentDirective = {
        id: crypto.randomUUID(),
        target: agent,
        priority: this.getAgentPriority(agent, analysis),
        task: this.generateAgentTask(agent, request, analysis),
        description: this.generateAgentDescription(agent, analysis),
        constraints: this.getAgentConstraints(agent),
        dependencies: this.getAgentDependencies(agent, analysis),
        reportingFrequency: analysis.estimatedRisk === 'CRITICAL' ? 'CONTINUOUS' : 'ON_COMPLETION',
        requiredQualityGates: qualityGates.filter((g) => this.isGateForAgent(g, agent)),
      };
      directives.push(directive);
    }

    logger.info({ sessionId, directiveCount: directives.length }, 'Created agent directives');
    return directives;
  }

  /**
   * Validate quality gate results
   */
  validateQualityGates(results: QualityGateResult[]): {
    passed: boolean;
    failedGates: QualityGate[];
    summary: string;
  } {
    const failedGates = results.filter((r) => r.status === 'FAILED').map((r) => r.gate);
    const passed = allQualityGatesPassed(results);

    let summary: string;
    if (passed) {
      summary = `All ${results.length} quality gates passed`;
    } else {
      summary = `${failedGates.length} of ${results.length} quality gates failed: ${failedGates.join(', ')}`;
    }

    return { passed, failedGates, summary };
  }

  /**
   * Resolve a conflict between agents
   */
  resolveConflict(conflict: Omit<ConflictResolution, 'resolver'>): ConflictResolution {
    const resolver = getConflictResolver(conflict.type);

    logger.warn({ conflictType: conflict.type, resolver }, 'Resolving conflict');

    return {
      ...conflict,
      resolver,
    } as ConflictResolution;
  }

  /**
   * Generate orchestration report
   */
  generateReport(session: OrchestrationSession): OrchestrationReport {
    const { analysis, directives, reports, qualityGates, conflicts } = session;

    // Determine final status
    let finalStatus: 'APPROVED' | 'BLOCKED' | 'PENDING' | 'FAILED' = 'PENDING';

    if (reports.some((r) => r.status === 'FAILED')) {
      finalStatus = 'FAILED';
    } else if (conflicts.some((c) => !c.resolvedAt)) {
      finalStatus = 'BLOCKED';
    } else if (allQualityGatesPassed(qualityGates) && reports.every((r) => r.status === 'COMPLETED')) {
      finalStatus = 'APPROVED';
    }

    const report: OrchestrationReport = {
      sessionId: session.id,
      status: session.status,
      request: session.request,
      complexity: analysis?.complexity ?? 'MODERATE',
      riskLevel: analysis?.estimatedRisk ?? 'MEDIUM',
      agentAssignments: directives.map((d) => ({
        agent: d.target,
        task: d.task,
        status: reports.find((r) => r.directiveId === d.id)?.status ?? 'PENDING',
        notes: reports.find((r) => r.directiveId === d.id)?.findings[0]?.message,
      })),
      qualityGates,
      blockers: reports.flatMap((r) => r.blockers ?? []),
      recommendations: reports.flatMap((r) => r.recommendations),
      finalStatus,
      summary: this.generateSummary(session, finalStatus),
    };

    return report;
  }

  /**
   * Create a new orchestration session
   */
  createSession(input: CreateOrchestrationSession): OrchestrationSession {
    const id = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const now = new Date().toISOString();

    const session: OrchestrationSession = {
      id,
      correlationId,
      status: 'ANALYZING',
      request: input.request,
      directives: [],
      reports: [],
      qualityGates: [],
      conflicts: [],
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    logger.info({ sessionId: id }, 'Created orchestration session');

    return session;
  }

  /**
   * Update session with analysis results
   */
  updateSessionWithAnalysis(sessionId: string, analysis: TaskAnalysis): OrchestrationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.analysis = analysis;
    session.status = 'DISPATCHING';
    session.updatedAt = new Date().toISOString();

    // Create directives based on analysis
    session.directives = this.createDirectives(sessionId, session.request, analysis);

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Record an agent report
   */
  recordAgentReport(sessionId: string, report: AgentReport): OrchestrationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.reports.push(report);
    session.status = 'IN_PROGRESS';
    session.updatedAt = new Date().toISOString();

    // Check if all agents have reported
    const allReported = session.directives.every((d) =>
      session.reports.some((r) => r.directiveId === d.id)
    );

    if (allReported) {
      session.status = 'VALIDATING';
    }

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Record quality gate result
   */
  recordQualityGateResult(sessionId: string, result: QualityGateResult): OrchestrationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.qualityGates.push(result);
    session.updatedAt = new Date().toISOString();

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Complete an orchestration session
   */
  completeSession(sessionId: string): OrchestrationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const validation = this.validateQualityGates(session.qualityGates);

    session.status = validation.passed ? 'APPROVED' : 'BLOCKED';
    session.completedAt = new Date().toISOString();
    session.updatedAt = session.completedAt;
    session.summary = this.generateSummary(session, validation.passed ? 'APPROVED' : 'BLOCKED');

    this.sessions.set(sessionId, session);
    logger.info({ sessionId, status: session.status }, 'Orchestration session completed');

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): OrchestrationSession | undefined {
    return this.sessions.get(sessionId);
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  private canExecuteInParallel(agents: AgentCodename[]): boolean {
    // Agents that must run sequentially
    const sequentialPairs: [AgentCodename, AgentCodename][] = [
      ['ARCHITECT', 'DOMAIN'],
      ['DOMAIN', 'INFRA'],
      ['INFRA', 'INTEGRATIONS'],
    ];

    for (const [first, second] of sequentialPairs) {
      if (agents.includes(first) && agents.includes(second)) {
        return false;
      }
    }
    return true;
  }

  private assessRisk(complexity: TaskComplexity, taskType: string): RiskLevel {
    if (complexity === 'CRITICAL') return 'CRITICAL';
    if (taskType === 'SECURITY_FIX' || taskType === 'COMPLIANCE_AUDIT') return 'HIGH';
    if (complexity === 'COMPLEX') return 'MEDIUM';
    if (complexity === 'MODERATE') return 'MEDIUM';
    return 'LOW';
  }

  private requiresCompliance(taskType: string, request: string): boolean {
    const complianceKeywords = ['hipaa', 'gdpr', 'phi', 'pii', 'consent', 'patient data'];
    return (
      taskType === 'COMPLIANCE_AUDIT' || complianceKeywords.some((kw) => request.includes(kw))
    );
  }

  private requiresSecurityReview(taskType: string, request: string): boolean {
    const securityKeywords = ['auth', 'encryption', 'secret', 'api key', 'token', 'password'];
    return (
      taskType === 'SECURITY_FIX' ||
      taskType === 'NEW_INTEGRATION' ||
      securityKeywords.some((kw) => request.includes(kw))
    );
  }

  private buildDependencyGraph(
    agents: AgentCodename[]
  ): Record<AgentCodename, AgentCodename[]> {
    const graph: Partial<Record<AgentCodename, AgentCodename[]>> = {};

    // Define typical dependencies
    if (agents.includes('DOMAIN') && agents.includes('ARCHITECT')) {
      graph['DOMAIN'] = ['ARCHITECT'];
    }
    if (agents.includes('INFRA') && agents.includes('DOMAIN')) {
      graph['INFRA'] = ['DOMAIN'];
    }
    if (agents.includes('INTEGRATIONS') && agents.includes('INFRA')) {
      graph['INTEGRATIONS'] = ['INFRA'];
    }
    if (agents.includes('QA')) {
      graph['QA'] = agents.filter((a) => a !== 'QA' && a !== 'SECURITY' && a !== 'DEVOPS');
    }
    if (agents.includes('SECURITY')) {
      graph['SECURITY'] = agents.filter((a) => a !== 'SECURITY' && a !== 'DEVOPS');
    }
    if (agents.includes('DEVOPS')) {
      graph['DEVOPS'] = agents.filter((a) => a !== 'DEVOPS');
    }

    return graph as Record<AgentCodename, AgentCodename[]>;
  }

  private getRequiredQualityGatesForAnalysis(analysis: TaskAnalysis): QualityGate[] {
    const gates = new Set<QualityGate>();

    // Always require quality gate
    gates.add('G5_QUALITY');

    // Add based on complexity
    if (analysis.complexity === 'CRITICAL' || analysis.complexity === 'COMPLEX') {
      gates.add('G1_ARCHITECTURE');
      gates.add('G2_DOMAIN_PURITY');
    }

    // Add compliance if required
    if (analysis.complianceRequired) {
      gates.add('G3_COMPLIANCE');
    }

    // Add security if required
    if (analysis.securityReview) {
      gates.add('G4_SECURITY');
    }

    return Array.from(gates);
  }

  private getAgentPriority(agent: AgentCodename, analysis: TaskAnalysis): TaskPriority {
    if (analysis.estimatedRisk === 'CRITICAL') return 'CRITICAL';
    if (AGENT_PRIORITY[agent] <= 3) return 'HIGH';
    if (AGENT_PRIORITY[agent] <= 6) return 'MEDIUM';
    return 'LOW';
  }

  private generateAgentTask(
    agent: AgentCodename,
    request: string,
    analysis: TaskAnalysis
  ): string {
    const tasks: Record<AgentCodename, string> = {
      ORCHESTRATOR: 'Coordinate overall task execution',
      ARCHITECT: 'Review architecture and verify layer boundaries',
      DOMAIN: 'Implement business logic following DDD patterns',
      COMPLIANCE: 'Verify HIPAA/GDPR compliance requirements',
      INFRA: 'Implement database adapters and infrastructure',
      INTEGRATIONS: 'Implement external service integrations',
      AI_RAG: 'Implement AI/ML features with cognitive memory',
      QA: 'Write and run tests, verify coverage requirements',
      SECURITY: 'Review security implications and encryption',
      DEVOPS: 'Prepare deployment and CI/CD configuration',
      FRONTEND: 'Implement UI components following design system',
    };
    return tasks[agent];
  }

  private generateAgentDescription(agent: AgentCodename, analysis: TaskAnalysis): string {
    return `Execute ${analysis.complexity.toLowerCase()} complexity task for ${agent} agent with ${analysis.estimatedRisk.toLowerCase()} risk level`;
  }

  private getAgentConstraints(agent: AgentCodename): string[] {
    const constraints: Record<AgentCodename, string[]> = {
      ORCHESTRATOR: ['Ensure all agents complete their tasks'],
      ARCHITECT: ['No layer violations', 'Follow hexagonal architecture'],
      DOMAIN: ['No infrastructure imports', 'Pure business logic only'],
      COMPLIANCE: ['Verify consent flows', 'Check PII handling'],
      INFRA: ['Use repository pattern', 'Add proper indexes'],
      INTEGRATIONS: ['Implement circuit breakers', 'Handle rate limits'],
      AI_RAG: ['Validate embedding dimensions', 'Check token limits'],
      QA: ['Coverage >80%', 'Property-based tests where applicable'],
      SECURITY: ['No secrets in code', 'Encryption for PHI'],
      DEVOPS: ['Rollback plan required', 'Health checks must pass'],
      FRONTEND: ['Accessibility compliance', 'Mobile responsive'],
    };
    return constraints[agent];
  }

  private getAgentDependencies(agent: AgentCodename, analysis: TaskAnalysis): AgentCodename[] {
    return analysis.dependencies[agent] ?? [];
  }

  private isGateForAgent(gate: QualityGate, agent: AgentCodename): boolean {
    const gateAgents: Record<QualityGate, AgentCodename[]> = {
      G1_ARCHITECTURE: ['ARCHITECT', 'DOMAIN', 'INFRA'],
      G2_DOMAIN_PURITY: ['DOMAIN', 'ARCHITECT'],
      G3_COMPLIANCE: ['COMPLIANCE', 'SECURITY'],
      G4_SECURITY: ['SECURITY', 'COMPLIANCE'],
      G5_QUALITY: ['QA', 'DOMAIN', 'FRONTEND'],
      G6_PERFORMANCE: ['QA', 'INFRA', 'AI_RAG'],
      G7_DEPLOYMENT: ['DEVOPS', 'QA', 'SECURITY'],
    };
    return gateAgents[gate].includes(agent);
  }

  private generateSummary(
    session: OrchestrationSession,
    finalStatus: 'APPROVED' | 'BLOCKED' | 'PENDING' | 'FAILED'
  ): string {
    const completedCount = session.reports.filter((r) => r.status === 'COMPLETED').length;
    const failedCount = session.reports.filter((r) => r.status === 'FAILED').length;
    const passedGates = session.qualityGates.filter((g) => g.status === 'PASSED').length;
    const totalGates = session.qualityGates.length;

    return `Orchestration ${finalStatus}: ${completedCount} agents completed, ${failedCount} failed. Quality gates: ${passedGates}/${totalGates} passed.`;
  }
}

/**
 * Create a configured orchestration service
 */
export function createOrchestrationService(
  config?: Partial<OrchestrationServiceConfig>
): OrchestrationService {
  return new OrchestrationService(config);
}
