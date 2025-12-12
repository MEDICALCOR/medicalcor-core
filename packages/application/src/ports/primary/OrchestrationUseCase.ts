/**
 * Orchestration Use Case Port
 *
 * Primary port for multi-agent orchestration operations.
 * Defines the interface for coordinating tasks across specialized agents.
 *
 * @module @medicalcor/application/ports/primary
 */

import type {
  TaskAnalysis,
  AgentDirective,
  AgentReport,
  QualityGateResult,
  OrchestrationSession,
  CreateOrchestrationSession,
  OrchestrationReport,
} from '@medicalcor/types';

/**
 * Result type for orchestration operations
 */
export interface OrchestrationResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Primary port for orchestration use cases
 */
export interface IOrchestrationUseCase {
  /**
   * Create a new orchestration session for a task
   */
  createSession(input: CreateOrchestrationSession): Promise<OrchestrationResult<OrchestrationSession>>;

  /**
   * Analyze a task and determine orchestration strategy
   */
  analyzeTask(sessionId: string): Promise<OrchestrationResult<TaskAnalysis>>;

  /**
   * Dispatch agents for a session
   */
  dispatchAgents(sessionId: string): Promise<OrchestrationResult<AgentDirective[]>>;

  /**
   * Record an agent's report
   */
  recordAgentReport(
    sessionId: string,
    report: AgentReport
  ): Promise<OrchestrationResult<OrchestrationSession>>;

  /**
   * Record a quality gate result
   */
  recordQualityGate(
    sessionId: string,
    result: QualityGateResult
  ): Promise<OrchestrationResult<OrchestrationSession>>;

  /**
   * Complete an orchestration session
   */
  completeSession(sessionId: string): Promise<OrchestrationResult<OrchestrationReport>>;

  /**
   * Get session status
   */
  getSession(sessionId: string): Promise<OrchestrationResult<OrchestrationSession>>;

  /**
   * Get orchestration report for a session
   */
  getReport(sessionId: string): Promise<OrchestrationResult<OrchestrationReport>>;
}

/**
 * Session state for tracking orchestration progress
 */
export interface OrchestrationState {
  sessionId: string;
  phase: 'ANALYZING' | 'DISPATCHING' | 'EXECUTING' | 'VALIDATING' | 'COMPLETE';
  progress: {
    totalAgents: number;
    completedAgents: number;
    totalGates: number;
    passedGates: number;
  };
  currentAgent?: string;
  estimatedCompletion?: Date;
}

/**
 * Callback for orchestration progress updates
 */
export type OrchestrationProgressCallback = (state: OrchestrationState) => void;

/**
 * Extended orchestration use case with streaming support
 */
export interface IStreamingOrchestrationUseCase extends IOrchestrationUseCase {
  /**
   * Execute orchestration with progress streaming
   */
  executeWithProgress(
    input: CreateOrchestrationSession,
    onProgress: OrchestrationProgressCallback
  ): Promise<OrchestrationResult<OrchestrationReport>>;
}
