/**
 * @fileoverview Orchestration Use Case Implementation
 *
 * Orchestrates the multi-agent workflow following hexagonal architecture.
 * This use case:
 * 1. Validates inputs and manages session lifecycle
 * 2. Coordinates task analysis with the domain service
 * 3. Dispatches agent directives
 * 4. Collects and validates agent reports
 * 5. Runs quality gate validations
 * 6. Resolves conflicts and generates reports
 *
 * @module application/use-cases/orchestration/OrchestrationUseCaseImpl
 */

import { createLogger } from '@medicalcor/core';
import { createOrchestrationService, type OrchestrationService } from '@medicalcor/domain';

import type {
  OrchestrationResult,
  OrchestrationProgressCallback,
  IStreamingOrchestrationUseCase,
} from '../../ports/primary/OrchestrationUseCase.js';

import type { IOrchestrationRepository } from '../../ports/secondary/persistence/OrchestrationRepository.js';

import type {
  TaskAnalysis,
  AgentDirective,
  AgentReport,
  QualityGateResult,
  OrchestrationSession,
  CreateOrchestrationSession,
  OrchestrationReport,
} from '@medicalcor/types';

const logger = createLogger({ name: 'orchestration-use-case' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface OrchestrationUseCaseConfig {
  /** Enable parallel agent execution */
  readonly enableParallelExecution?: boolean;
  /** Maximum concurrent agents */
  readonly maxConcurrentAgents?: number;
  /** Quality gate timeout in ms */
  readonly qualityGateTimeoutMs?: number;
  /** Session timeout in ms */
  readonly sessionTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<OrchestrationUseCaseConfig> = {
  enableParallelExecution: true,
  maxConcurrentAgents: 5,
  qualityGateTimeoutMs: 300000, // 5 minutes
  sessionTimeoutMs: 3600000, // 1 hour
};

// ============================================================================
// USE CASE IMPLEMENTATION
// ============================================================================

/**
 * Orchestration Use Case Implementation
 *
 * Orchestrates multi-agent workflows by coordinating between:
 * - Domain service (OrchestrationService for task analysis)
 * - Secondary port (IOrchestrationRepository for persistence)
 * - Security context (authorization)
 *
 * @example
 * ```typescript
 * const useCase = new OrchestrationUseCaseImpl(
 *   orchestrationRepository,
 *   { maxConcurrentAgents: 5 }
 * );
 *
 * const result = await useCase.createSession(input, securityContext);
 * if (result.success) {
 *   console.log('Session:', result.data.id);
 * }
 * ```
 */
export class OrchestrationUseCaseImpl implements IStreamingOrchestrationUseCase {
  private readonly config: Required<OrchestrationUseCaseConfig>;
  private readonly orchestrationService: OrchestrationService;

  constructor(
    private readonly repository: IOrchestrationRepository,
    config: OrchestrationUseCaseConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.orchestrationService = createOrchestrationService({
      enableParallelExecution: this.config.enableParallelExecution,
      maxConcurrentAgents: this.config.maxConcurrentAgents,
      qualityGateTimeout: this.config.qualityGateTimeoutMs,
    });

    logger.info({ config: this.config }, 'OrchestrationUseCaseImpl initialized');
  }

  // ==========================================================================
  // CREATE SESSION
  // ==========================================================================

  async createSession(
    input: CreateOrchestrationSession
  ): Promise<OrchestrationResult<OrchestrationSession>> {
    const startTime = Date.now();

    logger.info(
      {
        requestLength: input.request.length,
        priority: input.priority,
      },
      'Creating orchestration session'
    );

    try {
      // Check idempotency
      if (input.idempotencyKey) {
        const existing = await this.repository.isIdempotencyKeyUsed(input.idempotencyKey);
        if (existing) {
          logger.info({ idempotencyKey: input.idempotencyKey }, 'Session already exists');
          // Try to retrieve existing session
          const sessions = await this.repository.findSessions({ limit: 1 });
          if (sessions.length > 0) {
            return { success: true, data: sessions[0] };
          }
        }
      }

      // Create session
      const session = await this.repository.createSession(input);

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          sessionId: session.id,
          durationMs,
        },
        'Orchestration session created'
      );

      return { success: true, data: session };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
          durationMs,
        },
        'Failed to create orchestration session'
      );

      return {
        success: false,
        error: {
          code: 'session_creation_failed',
          message: error instanceof Error ? error.message : 'Failed to create session',
        },
      };
    }
  }

  // ==========================================================================
  // ANALYZE TASK
  // ==========================================================================

  async analyzeTask(sessionId: string): Promise<OrchestrationResult<TaskAnalysis>> {
    const startTime = Date.now();

    logger.info({ sessionId }, 'Analyzing task');

    try {
      const session = await this.repository.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: 'session_not_found',
            message: `Session not found: ${sessionId}`,
          },
        };
      }

      // Perform task analysis using domain service
      const analysis = this.orchestrationService.analyzeTask(session.request);

      // Update session with analysis
      await this.repository.updateSessionStatus(sessionId, 'ANALYZED');
      // Save analysis to session - we need to update the session object
      const updatedSession = await this.repository.getSession(sessionId);
      if (updatedSession) {
        // The InMemoryOrchestrationRepository will handle this
        await (
          this.repository as {
            saveAnalysis?: (
              sessionId: string,
              analysis: TaskAnalysis
            ) => Promise<OrchestrationSession>;
          }
        ).saveAnalysis?.(sessionId, analysis);
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          sessionId,
          complexity: analysis.complexity,
          agentCount: analysis.requiredAgents.length,
          durationMs,
        },
        'Task analysis complete'
      );

      return { success: true, data: analysis };
    } catch (error) {
      logger.error(
        {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Task analysis failed'
      );

      return {
        success: false,
        error: {
          code: 'analysis_failed',
          message: error instanceof Error ? error.message : 'Task analysis failed',
        },
      };
    }
  }

  // ==========================================================================
  // DISPATCH AGENTS
  // ==========================================================================

  async dispatchAgents(sessionId: string): Promise<OrchestrationResult<AgentDirective[]>> {
    const startTime = Date.now();

    logger.info({ sessionId }, 'Dispatching agents');

    try {
      const session = await this.repository.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: 'session_not_found',
            message: `Session not found: ${sessionId}`,
          },
        };
      }

      if (!session.analysis) {
        return {
          success: false,
          error: {
            code: 'analysis_required',
            message: 'Task must be analyzed before dispatching agents',
          },
        };
      }

      // Create directives using domain service
      const directives = this.orchestrationService.createDirectives(
        sessionId,
        session.request,
        session.analysis
      );

      // Save directives
      await this.repository.saveDirectives(sessionId, directives);

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          sessionId,
          directiveCount: directives.length,
          agents: directives.map((d: AgentDirective) => d.target),
          durationMs,
        },
        'Agents dispatched'
      );

      return { success: true, data: directives };
    } catch (error) {
      logger.error(
        {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Agent dispatch failed'
      );

      return {
        success: false,
        error: {
          code: 'dispatch_failed',
          message: error instanceof Error ? error.message : 'Agent dispatch failed',
        },
      };
    }
  }

  // ==========================================================================
  // RECORD AGENT REPORT
  // ==========================================================================

  async recordAgentReport(
    sessionId: string,
    report: AgentReport
  ): Promise<OrchestrationResult<OrchestrationSession>> {
    logger.info(
      {
        sessionId,
        agent: report.agent,
        status: report.status,
      },
      'Recording agent report'
    );

    try {
      const session = await this.repository.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: 'session_not_found',
            message: `Session not found: ${sessionId}`,
          },
        };
      }

      // Save report
      const updatedSession = await this.repository.saveReport(sessionId, report);

      // Check if all agents have reported
      const allReported = updatedSession.directives.every((d) =>
        updatedSession.reports.some((r) => r.directiveId === d.id)
      );

      if (allReported) {
        logger.info({ sessionId }, 'All agents reported, moving to validation');
        await this.repository.updateSessionStatus(sessionId, 'VALIDATING');
      }

      return { success: true, data: updatedSession };
    } catch (error) {
      logger.error(
        {
          sessionId,
          agent: report.agent,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to record agent report'
      );

      return {
        success: false,
        error: {
          code: 'report_failed',
          message: error instanceof Error ? error.message : 'Failed to record report',
        },
      };
    }
  }

  // ==========================================================================
  // RECORD QUALITY GATE
  // ==========================================================================

  async recordQualityGate(
    sessionId: string,
    result: QualityGateResult
  ): Promise<OrchestrationResult<OrchestrationSession>> {
    logger.info(
      {
        sessionId,
        gate: result.gate,
        status: result.status,
      },
      'Recording quality gate result'
    );

    try {
      const session = await this.repository.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: 'session_not_found',
            message: `Session not found: ${sessionId}`,
          },
        };
      }

      // Save quality gate result
      const updatedSession = await this.repository.saveQualityGateResult(sessionId, result);

      // Check quality gate validation
      const validation = this.orchestrationService.validateQualityGates(
        updatedSession.qualityGates
      );

      if (!validation.passed) {
        logger.warn(
          {
            sessionId,
            failedGates: validation.failedGates,
          },
          'Quality gates failed'
        );
      }

      return { success: true, data: updatedSession };
    } catch (error) {
      logger.error(
        {
          sessionId,
          gate: result.gate,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to record quality gate'
      );

      return {
        success: false,
        error: {
          code: 'quality_gate_failed',
          message: error instanceof Error ? error.message : 'Failed to record quality gate',
        },
      };
    }
  }

  // ==========================================================================
  // COMPLETE SESSION
  // ==========================================================================

  async completeSession(sessionId: string): Promise<OrchestrationResult<OrchestrationReport>> {
    const startTime = Date.now();

    logger.info({ sessionId }, 'Completing session');

    try {
      const session = await this.repository.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: 'session_not_found',
            message: `Session not found: ${sessionId}`,
          },
        };
      }

      // Validate quality gates
      const validation = this.orchestrationService.validateQualityGates(session.qualityGates);

      // Update session status
      const finalStatus = validation.passed ? 'APPROVED' : 'BLOCKED';
      await this.repository.updateSessionStatus(sessionId, finalStatus, validation.summary);

      // Generate report
      const report = await this.repository.generateReport(sessionId);
      if (!report) {
        return {
          success: false,
          error: {
            code: 'report_generation_failed',
            message: 'Failed to generate orchestration report',
          },
        };
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        {
          sessionId,
          finalStatus,
          durationMs,
        },
        'Session completed'
      );

      return { success: true, data: report };
    } catch (error) {
      logger.error(
        {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to complete session'
      );

      return {
        success: false,
        error: {
          code: 'completion_failed',
          message: error instanceof Error ? error.message : 'Failed to complete session',
        },
      };
    }
  }

  // ==========================================================================
  // GET SESSION
  // ==========================================================================

  async getSession(sessionId: string): Promise<OrchestrationResult<OrchestrationSession>> {
    try {
      const session = await this.repository.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: 'session_not_found',
            message: `Session not found: ${sessionId}`,
          },
        };
      }

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'get_session_failed',
          message: error instanceof Error ? error.message : 'Failed to get session',
        },
      };
    }
  }

  // ==========================================================================
  // GET REPORT
  // ==========================================================================

  async getReport(sessionId: string): Promise<OrchestrationResult<OrchestrationReport>> {
    try {
      const report = await this.repository.generateReport(sessionId);
      if (!report) {
        return {
          success: false,
          error: {
            code: 'report_not_found',
            message: `Report not found for session: ${sessionId}`,
          },
        };
      }

      return { success: true, data: report };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'get_report_failed',
          message: error instanceof Error ? error.message : 'Failed to get report',
        },
      };
    }
  }

  // ==========================================================================
  // EXECUTE WITH PROGRESS (STREAMING)
  // ==========================================================================

  async executeWithProgress(
    input: CreateOrchestrationSession,
    onProgress: OrchestrationProgressCallback
  ): Promise<OrchestrationResult<OrchestrationReport>> {
    const startTime = Date.now();

    try {
      // Phase 1: Create session
      onProgress({
        sessionId: '',
        phase: 'ANALYZING',
        progress: { totalAgents: 0, completedAgents: 0, totalGates: 0, passedGates: 0 },
      });

      const sessionResult = await this.createSession(input);
      if (!sessionResult.success || !sessionResult.data) {
        return {
          success: false,
          error: sessionResult.error ?? {
            code: 'session_creation_failed',
            message: 'Failed to create session',
          },
        };
      }

      const sessionId = sessionResult.data.id;

      // Phase 2: Analyze task
      onProgress({
        sessionId,
        phase: 'ANALYZING',
        progress: { totalAgents: 0, completedAgents: 0, totalGates: 0, passedGates: 0 },
      });

      const analysisResult = await this.analyzeTask(sessionId);
      if (!analysisResult.success || !analysisResult.data) {
        return {
          success: false,
          error: analysisResult.error ?? {
            code: 'analysis_failed',
            message: 'Failed to analyze task',
          },
        };
      }

      const analysis = analysisResult.data;

      // Phase 3: Dispatch agents
      onProgress({
        sessionId,
        phase: 'DISPATCHING',
        progress: {
          totalAgents: analysis.requiredAgents.length,
          completedAgents: 0,
          totalGates: analysis.requiredQualityGates.length,
          passedGates: 0,
        },
      });

      const dispatchResult = await this.dispatchAgents(sessionId);
      if (!dispatchResult.success || !dispatchResult.data) {
        return {
          success: false,
          error: dispatchResult.error ?? {
            code: 'dispatch_failed',
            message: 'Failed to dispatch agents',
          },
        };
      }

      // Phase 4: Execute (simulated for now - real execution happens via external agents)
      onProgress({
        sessionId,
        phase: 'EXECUTING',
        progress: {
          totalAgents: analysis.requiredAgents.length,
          completedAgents: 0,
          totalGates: analysis.requiredQualityGates.length,
          passedGates: 0,
        },
      });

      // In a real implementation, we would wait for agent reports
      // For now, simulate immediate completion

      // Phase 5: Validate
      onProgress({
        sessionId,
        phase: 'VALIDATING',
        progress: {
          totalAgents: analysis.requiredAgents.length,
          completedAgents: analysis.requiredAgents.length,
          totalGates: analysis.requiredQualityGates.length,
          passedGates: 0,
        },
      });

      // Phase 6: Complete
      const completionResult = await this.completeSession(sessionId);
      if (!completionResult.success || !completionResult.data) {
        return {
          success: false,
          error: completionResult.error ?? {
            code: 'completion_failed',
            message: 'Failed to complete session',
          },
        };
      }

      onProgress({
        sessionId,
        phase: 'COMPLETE',
        progress: {
          totalAgents: analysis.requiredAgents.length,
          completedAgents: analysis.requiredAgents.length,
          totalGates: analysis.requiredQualityGates.length,
          passedGates: analysis.requiredQualityGates.length,
        },
        estimatedCompletion: new Date(),
      });

      const durationMs = Date.now() - startTime;
      logger.info({ sessionId, durationMs }, 'Orchestration completed');

      return { success: true, data: completionResult.data };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Orchestration failed'
      );

      return {
        success: false,
        error: {
          code: 'orchestration_failed',
          message: error instanceof Error ? error.message : 'Orchestration failed',
        },
      };
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an orchestration use case instance
 */
export function createOrchestrationUseCase(
  repository: IOrchestrationRepository,
  config?: OrchestrationUseCaseConfig
): IStreamingOrchestrationUseCase {
  return new OrchestrationUseCaseImpl(repository, config);
}
