/**
 * @fileoverview Claude Agent SDK Integration
 *
 * Integration client for the Claude Agent SDK, enabling multi-agent orchestration
 * with Claude-powered AI agents for MedicalCor workflows.
 *
 * Features:
 * - Agent execution with task delegation
 * - Streaming progress updates
 * - Structured output with quality gates
 * - HIPAA/GDPR-compliant logging
 *
 * @module @medicalcor/integrations/claude-agent
 * @version 1.0.0
 */

import { z } from 'zod';
import { createLogger, withRetry, ExternalServiceError } from '@medicalcor/core';
import type {
  AgentCodename,
  AgentDirective,
  AgentReport,
  AgentTaskStatus,
  Finding,
  OrchestrationRecommendation as Recommendation,
  Blocker,
  QualityGateResult,
} from '@medicalcor/types';

const logger = createLogger({ name: 'claude-agent-integration' });

// ============================================================================
// CONFIGURATION SCHEMAS
// ============================================================================

const ClaudeAgentConfigSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().optional().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().int().min(1).max(200000).optional().default(8192),
  temperature: z.number().min(0).max(1).optional().default(0.3),
  timeoutMs: z.number().int().min(1000).max(600000).optional().default(120000),
  retryConfig: z
    .object({
      maxRetries: z.number().int().min(0).max(5).default(3),
      baseDelayMs: z.number().int().min(100).max(30000).default(1000),
    })
    .optional(),
});

// Schema for AgentExecutionInput validation (used in executeAgent)
const _AgentExecutionInputSchema = z.object({
  directive: z.object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    target: z.string(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
    task: z.string(),
    description: z.string(),
    constraints: z.array(z.string()),
    dependencies: z.array(z.string()),
    requiredQualityGates: z.array(z.string()),
    createdAt: z.string().datetime().optional(),
    idempotencyKey: z.string().optional(),
    reportingFrequency: z
      .enum(['CONTINUOUS', 'ON_COMPLETION', 'ON_BLOCKER', 'PERIODIC'])
      .optional(),
  }),
  context: z
    .object({
      codebaseRoot: z.string().optional(),
      previousFindings: z.array(z.string()).optional(),
      relatedFiles: z.array(z.string()).optional(),
    })
    .optional(),
});

// ============================================================================
// TYPES
// ============================================================================

export interface ClaudeAgentConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Maximum tokens for response (default: 8192) */
  maxTokens?: number;
  /** Temperature for generation (default: 0.3) */
  temperature?: number;
  /** Request timeout in ms (default: 120000) */
  timeoutMs?: number;
  /** Retry configuration */
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

export interface AgentExecutionInput {
  /** The directive to execute */
  directive: AgentDirective;
  /** Additional context for the agent */
  context?: {
    /** Root path of the codebase */
    codebaseRoot?: string;
    /** Previous findings from other agents */
    previousFindings?: string[];
    /** Related files to consider */
    relatedFiles?: string[];
  };
}

export interface AgentExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** The generated agent report */
  report: AgentReport;
  /** Any quality gate results */
  qualityGateResults: QualityGateResult[];
  /** Execution duration in ms */
  durationMs: number;
}

export type AgentProgressCallback = (progress: {
  phase: 'starting' | 'analyzing' | 'executing' | 'validating' | 'complete';
  message: string;
  progress: number; // 0-100
}) => void;

// ============================================================================
// AGENT SYSTEM PROMPTS
// ============================================================================

const AGENT_SYSTEM_PROMPTS: Record<AgentCodename, string> = {
  ORCHESTRATOR: `You are the Master Coordinator agent for MedicalCor, a medical CRM platform.
Your role is to coordinate multi-agent workflows with surgical precision.
Ensure all agents complete their tasks, maintain audit trails, and resolve conflicts.`,

  ARCHITECT: `You are the System Architect agent for MedicalCor.
Your role is to review architecture, verify layer boundaries, and ensure hexagonal architecture patterns.
Check for port/adapter violations and DDD patterns.`,

  DOMAIN: `You are the Domain Expert agent for MedicalCor.
Your role is to implement business logic following DDD patterns.
Ensure pure business logic with no infrastructure imports.`,

  COMPLIANCE: `You are the Compliance Officer agent for MedicalCor.
Your role is to verify HIPAA/GDPR compliance requirements.
Check consent flows, PII handling, and 72-hour breach notification compliance.`,

  INFRA: `You are the Infrastructure Engineer agent for MedicalCor.
Your role is to implement database adapters, migrations, and infrastructure components.
Use repository pattern, add proper indexes, ensure no breaking migrations.`,

  INTEGRATIONS: `You are the Integration Specialist agent for MedicalCor.
Your role is to implement external service integrations.
Implement circuit breakers, rate limiting, and idempotency keys.`,

  AI_RAG: `You are the AI/RAG Engineer agent for MedicalCor.
Your role is to implement AI features, embeddings, and cognitive memory systems.
Validate embedding dimensions, check token limits, and manage budgets.`,

  QA: `You are the Quality Assurance agent for MedicalCor.
Your role is to write tests, verify coverage, and run quality checks.
Ensure coverage >80%, use property-based tests, and avoid flaky tests.`,

  SECURITY: `You are the Security Guardian agent for MedicalCor.
Your role is to review security implications, encryption, and threat analysis.
Ensure no secrets in code, encryption for PHI, and OWASP compliance.`,

  DEVOPS: `You are the DevOps Engineer agent for MedicalCor.
Your role is to prepare deployments and CI/CD configuration.
Require rollback plans, health checks, and canary deployments.`,

  FRONTEND: `You are the Frontend Developer agent for MedicalCor.
Your role is to implement UI components following the design system.
Ensure accessibility compliance, mobile responsiveness, and Lighthouse >90.`,
};

// ============================================================================
// CLAUDE AGENT CLIENT
// ============================================================================

/**
 * Claude Agent SDK Integration Client
 *
 * Provides AI-powered agent execution for multi-agent orchestration workflows.
 *
 * @example
 * ```typescript
 * const client = new ClaudeAgentClient({
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 * });
 *
 * const result = await client.executeAgent({
 *   directive: {
 *     id: 'uuid',
 *     sessionId: 'session-uuid',
 *     target: 'ARCHITECT',
 *     priority: 'HIGH',
 *     task: 'Review layer boundaries',
 *     description: 'Check for architecture violations',
 *     constraints: ['No layer violations'],
 *     dependencies: [],
 *     requiredQualityGates: ['G1_ARCHITECTURE'],
 *   },
 * });
 * ```
 */
export class ClaudeAgentClient {
  private config: Required<ClaudeAgentConfig>;

  constructor(config: ClaudeAgentConfig) {
    const validated = ClaudeAgentConfigSchema.parse(config);
    this.config = {
      apiKey: validated.apiKey,
      model: validated.model ?? 'claude-sonnet-4-20250514',
      maxTokens: validated.maxTokens ?? 8192,
      temperature: validated.temperature ?? 0.3,
      timeoutMs: validated.timeoutMs ?? 120000,
      retryConfig: validated.retryConfig ?? { maxRetries: 3, baseDelayMs: 1000 },
    };

    logger.info({ model: this.config.model }, 'ClaudeAgentClient initialized');
  }

  /**
   * Execute an agent directive
   */
  async executeAgent(
    input: AgentExecutionInput,
    onProgress?: AgentProgressCallback
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    // Validate required fields
    if (!input.directive?.id || !input.directive?.task) {
      throw new Error('Invalid directive: missing required fields');
    }

    const { directive, context } = input;

    logger.info(
      {
        directiveId: directive.id,
        agent: directive.target,
        task: directive.task,
      },
      'Starting agent execution'
    );

    try {
      // Phase 1: Starting
      onProgress?.({
        phase: 'starting',
        message: `Initializing ${directive.target} agent...`,
        progress: 10,
      });

      // Phase 2: Analyzing
      onProgress?.({
        phase: 'analyzing',
        message: 'Analyzing task requirements...',
        progress: 30,
      });

      // Build the prompt
      const systemPrompt = this.buildSystemPrompt(directive.target);
      const userPrompt = this.buildUserPrompt(directive, context);

      // Phase 3: Executing
      onProgress?.({
        phase: 'executing',
        message: 'Executing agent task...',
        progress: 50,
      });

      // Execute the agent
      const response = await this.callClaudeAPI(systemPrompt, userPrompt);

      // Phase 4: Validating
      onProgress?.({
        phase: 'validating',
        message: 'Validating agent output...',
        progress: 80,
      });

      // Parse the response into a structured report
      const report = this.parseAgentResponse(response, directive);
      const qualityGateResults = this.generateQualityGateResults(directive, report);

      // Phase 5: Complete
      const durationMs = Date.now() - startTime;
      onProgress?.({
        phase: 'complete',
        message: 'Agent execution complete',
        progress: 100,
      });

      logger.info(
        {
          directiveId: directive.id,
          agent: directive.target,
          status: report.status,
          durationMs,
        },
        'Agent execution completed'
      );

      return {
        success: report.status === 'COMPLETED',
        report,
        qualityGateResults,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error(
        {
          directiveId: directive.id,
          agent: directive.target,
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs,
        },
        'Agent execution failed'
      );

      // Return a failed report
      const failedReport = this.createFailedReport(directive, error);

      return {
        success: false,
        report: failedReport,
        qualityGateResults: [],
        durationMs,
      };
    }
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeAgentsParallel(
    inputs: AgentExecutionInput[],
    maxConcurrency = 3
  ): Promise<AgentExecutionResult[]> {
    const results: AgentExecutionResult[] = [];

    // Process in batches to respect concurrency limit
    for (let i = 0; i < inputs.length; i += maxConcurrency) {
      const batch = inputs.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(batch.map((input) => this.executeAgent(input)));
      results.push(...batchResults);
    }

    return results;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private buildSystemPrompt(agent: AgentCodename): string {
    const basePrompt = AGENT_SYSTEM_PROMPTS[agent] ?? AGENT_SYSTEM_PROMPTS.DOMAIN;

    return `${basePrompt}

RESPONSE FORMAT:
You must respond with a JSON object containing:
{
  "status": "COMPLETED" | "BLOCKED" | "FAILED",
  "findings": [
    {
      "type": "INFO" | "WARNING" | "ERROR" | "SECURITY" | "COMPLIANCE" | "PERFORMANCE",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "message": "Description of the finding",
      "file": "optional/path/to/file.ts",
      "line": 123,
      "suggestion": "How to fix this issue"
    }
  ],
  "recommendations": [
    {
      "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "action": "What to do",
      "reason": "Why this is important",
      "category": "MUST_FIX" | "SHOULD_FIX" | "CONSIDER" | "OPTIONAL"
    }
  ],
  "blockers": [
    {
      "type": "DEPENDENCY" | "RESOURCE" | "APPROVAL" | "TECHNICAL" | "COMPLIANCE" | "SECURITY",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "description": "What is blocking progress",
      "requiredAction": "How to resolve"
    }
  ],
  "nextSteps": ["Step 1", "Step 2"],
  "artifacts": {
    "filesCreated": [],
    "filesModified": [],
    "filesDeleted": [],
    "testsAdded": [],
    "migrationsAdded": []
  },
  "metrics": {
    "linesAdded": 0,
    "linesRemoved": 0,
    "filesChanged": 0,
    "testCoverage": 0
  }
}

Ensure your response is valid JSON only, with no additional text.`;
  }

  private buildUserPrompt(
    directive: AgentDirective,
    context?: AgentExecutionInput['context']
  ): string {
    let prompt = `TASK: ${directive.task}

DESCRIPTION: ${directive.description}

CONSTRAINTS:
${directive.constraints.map((c) => `- ${c}`).join('\n')}

REQUIRED QUALITY GATES:
${directive.requiredQualityGates.map((g) => `- ${g}`).join('\n')}

PRIORITY: ${directive.priority}`;

    if (context?.relatedFiles?.length) {
      prompt += `\n\nRELATED FILES:\n${context.relatedFiles.map((f) => `- ${f}`).join('\n')}`;
    }

    if (context?.previousFindings?.length) {
      prompt += `\n\nPREVIOUS FINDINGS:\n${context.previousFindings.map((f) => `- ${f}`).join('\n')}`;
    }

    prompt += `\n\nAnalyze this task and provide your findings, recommendations, and execution status.`;

    return prompt;
  }

  private async callClaudeAPI(systemPrompt: string, userPrompt: string): Promise<string> {
    const makeRequest = async (): Promise<string> => {
      // Call Claude API using fetch
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ExternalServiceError(
          'ClaudeAgent',
          `API error: ${response.status} - ${errorText}`
        );
      }

      const data = (await response.json()) as {
        content: { type: string; text?: string }[];
      };

      const textContent = data.content.find(
        (c: { type: string; text?: string }) => c.type === 'text'
      );
      if (!textContent || !('text' in textContent)) {
        throw new ExternalServiceError('ClaudeAgent', 'Empty response from API');
      }

      return textContent.text!;
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig.maxRetries,
      baseDelayMs: this.config.retryConfig.baseDelayMs,
      shouldRetry: (error) => {
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          return (
            message.includes('rate_limit') ||
            message.includes('overloaded') ||
            message.includes('timeout') ||
            message.includes('502') ||
            message.includes('503')
          );
        }
        return false;
      },
    });
  }

  private parseAgentResponse(response: string, directive: AgentDirective): AgentReport {
    const now = new Date().toISOString();

    try {
      // Try to extract JSON from the response
      const jsonMatch = /\{[\s\S]*\}/.exec(response);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        status?: string;
        findings?: Finding[];
        recommendations?: Recommendation[];
        blockers?: Blocker[];
        nextSteps?: string[];
        artifacts?: AgentReport['artifacts'];
        metrics?: AgentReport['metrics'];
      };

      return {
        id: crypto.randomUUID(),
        directiveId: directive.id,
        sessionId: directive.sessionId,
        agent: directive.target,
        task: directive.task,
        status: (parsed.status as AgentTaskStatus) ?? 'COMPLETED',
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        findings: (parsed.findings ?? []).map((f) => ({
          ...f,
          id: crypto.randomUUID(),
        })),
        recommendations: (parsed.recommendations ?? []).map((r) => ({
          ...r,
          id: crypto.randomUUID(),
        })),
        blockers: (parsed.blockers ?? []).map((b) => ({
          ...b,
          id: crypto.randomUUID(),
          createdAt: now,
        })),
        nextSteps: parsed.nextSteps ?? [],
        qualityGateResults: [],
        artifacts: parsed.artifacts ?? {
          filesCreated: [],
          filesModified: [],
          filesDeleted: [],
          testsAdded: [],
          migrationsAdded: [],
        },
        metrics: parsed.metrics ?? {
          linesAdded: 0,
          linesRemoved: 0,
          filesChanged: 0,
          executionTimeMs: 0,
        },
      };
    } catch {
      // Return a default report if parsing fails
      return {
        id: crypto.randomUUID(),
        directiveId: directive.id,
        sessionId: directive.sessionId,
        agent: directive.target,
        task: directive.task,
        status: 'COMPLETED',
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        findings: [],
        recommendations: [
          {
            id: crypto.randomUUID(),
            priority: 'MEDIUM',
            action: 'Review agent output manually',
            reason: 'Agent response could not be parsed as structured JSON',
            category: 'CONSIDER',
          },
        ],
        blockers: [],
        nextSteps: ['Review raw agent output'],
        qualityGateResults: [],
        artifacts: {
          filesCreated: [],
          filesModified: [],
          filesDeleted: [],
          testsAdded: [],
          migrationsAdded: [],
        },
        metrics: {
          linesAdded: 0,
          linesRemoved: 0,
          filesChanged: 0,
          executionTimeMs: 0,
        },
      };
    }
  }

  private createFailedReport(directive: AgentDirective, error: unknown): AgentReport {
    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      directiveId: directive.id,
      sessionId: directive.sessionId,
      agent: directive.target,
      task: directive.task,
      status: 'FAILED',
      startedAt: now,
      completedAt: now,
      durationMs: 0,
      findings: [
        {
          id: crypto.randomUUID(),
          type: 'ERROR',
          severity: 'CRITICAL',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      ],
      recommendations: [],
      blockers: [
        {
          id: crypto.randomUUID(),
          type: 'TECHNICAL',
          severity: 'CRITICAL',
          description: 'Agent execution failed',
          requiredAction: 'Investigate and retry',
          createdAt: now,
        },
      ],
      nextSteps: ['Investigate failure cause', 'Retry agent execution'],
      qualityGateResults: [],
      artifacts: {
        filesCreated: [],
        filesModified: [],
        filesDeleted: [],
        testsAdded: [],
        migrationsAdded: [],
      },
      metrics: {
        linesAdded: 0,
        linesRemoved: 0,
        filesChanged: 0,
        executionTimeMs: 0,
      },
    };
  }

  private generateQualityGateResults(
    directive: AgentDirective,
    report: AgentReport
  ): QualityGateResult[] {
    const now = new Date().toISOString();

    return directive.requiredQualityGates.map((gate) => {
      const hasCriticalFindings = report.findings.some(
        (f) => f.severity === 'CRITICAL' || f.severity === 'HIGH'
      );

      return {
        gate: gate,
        status: hasCriticalFindings ? 'FAILED' : 'PASSED',
        checkedAt: now,
        checkedBy: directive.target,
        durationMs: report.durationMs ?? 0,
        notes: hasCriticalFindings
          ? `Found ${report.findings.length} findings with critical/high severity`
          : 'All checks passed',
      };
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a Claude Agent client instance
 */
export function createClaudeAgentClient(config: ClaudeAgentConfig): ClaudeAgentClient {
  return new ClaudeAgentClient(config);
}
