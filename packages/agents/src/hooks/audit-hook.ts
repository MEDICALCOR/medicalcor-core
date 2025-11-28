/**
 * Audit Hook for Claude Agent SDK
 *
 * Provides comprehensive audit logging for all agent operations:
 * - Tool call tracking
 * - Performance metrics
 * - Error logging
 * - Compliance audit trail
 */

import { redactPII } from './gdpr-hook.js';

/**
 * Audit event types
 */
export type AuditEventType =
  | 'agent_start'
  | 'agent_end'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'tool_call_error'
  | 'context_enrichment'
  | 'decision_made'
  | 'escalation';

/**
 * Audit event structure
 */
export interface AuditEvent {
  id: string;
  timestamp: Date;
  type: AuditEventType;
  agentId: string;
  agentType: string;
  correlationId?: string;
  sessionId?: string;

  // Tool-specific fields
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: Record<string, unknown>;

  // Performance metrics
  durationMs?: number;
  tokensUsed?: number;

  // Error tracking
  error?: {
    code: string;
    message: string;
    stack?: string;
  };

  // Decision tracking
  decision?: {
    action: string;
    reasoning: string;
    confidence: number;
  };

  // Additional metadata
  metadata?: Record<string, unknown>;
}

/**
 * Audit hook configuration
 */
export interface AuditHookConfig {
  /** Agent identifier */
  agentId: string;
  /** Agent type (e.g., 'scoring', 'support') */
  agentType: string;
  /** Function to persist audit events */
  persistEvent: (event: AuditEvent) => Promise<void>;
  /** Whether to redact PII from logs */
  redactPII?: boolean;
  /** Session ID for grouping related events */
  sessionId?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Include tool output in audit (may be large) */
  includeToolOutput?: boolean;
}

/**
 * Generate a unique event ID
 */
function generateEventId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an audit hook for comprehensive operation logging
 *
 * @example
 * ```typescript
 * const auditHook = createAuditHook({
 *   agentId: 'scoring-agent-001',
 *   agentType: 'lead_scoring',
 *   persistEvent: async (event) => {
 *     await db.auditEvents.insert(event);
 *   },
 *   redactPII: true,
 * });
 * ```
 */
export function createAuditHook(config: AuditHookConfig) {
  const {
    agentId,
    agentType,
    persistEvent,
    redactPII: shouldRedact = true,
    sessionId,
    correlationId,
    includeToolOutput = false,
  } = config;

  // Track tool call start times for duration calculation
  const toolCallStartTimes = new Map<string, number>();

  /**
   * Log agent session start
   */
  async function logAgentStart(metadata?: Record<string, unknown>): Promise<void> {
    const event: AuditEvent = {
      id: generateEventId(),
      timestamp: new Date(),
      type: 'agent_start',
      agentId,
      agentType,
      sessionId,
      correlationId,
      metadata: shouldRedact && metadata ? redactPII(metadata) : metadata,
    };

    await persistEvent(event);
  }

  /**
   * Log agent session end
   */
  async function logAgentEnd(
    result: { success: boolean; tokensUsed?: number },
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: AuditEvent = {
      id: generateEventId(),
      timestamp: new Date(),
      type: 'agent_end',
      agentId,
      agentType,
      sessionId,
      correlationId,
      tokensUsed: result.tokensUsed,
      metadata: {
        success: result.success,
        ...(shouldRedact && metadata ? redactPII(metadata) : metadata),
      },
    };

    await persistEvent(event);
  }

  /**
   * Pre-execution hook - logs tool call start
   */
  async function beforeToolCall(toolName: string, input: Record<string, unknown>): Promise<void> {
    const callId = `${toolName}_${Date.now()}`;
    toolCallStartTimes.set(callId, Date.now());

    const event: AuditEvent = {
      id: generateEventId(),
      timestamp: new Date(),
      type: 'tool_call_start',
      agentId,
      agentType,
      sessionId,
      correlationId,
      toolName,
      toolInput: shouldRedact ? redactPII(input) : input,
    };

    await persistEvent(event);
  }

  /**
   * Post-execution hook - logs tool call completion
   */
  async function afterToolCall(
    toolName: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>
  ): Promise<void> {
    // Find the matching start time
    const startTimeKey = Array.from(toolCallStartTimes.keys()).find((k) => k.startsWith(toolName));
    const startTime = startTimeKey ? toolCallStartTimes.get(startTimeKey) : undefined;
    const durationMs = startTime ? Date.now() - startTime : undefined;

    if (startTimeKey) {
      toolCallStartTimes.delete(startTimeKey);
    }

    const event: AuditEvent = {
      id: generateEventId(),
      timestamp: new Date(),
      type: 'tool_call_end',
      agentId,
      agentType,
      sessionId,
      correlationId,
      toolName,
      toolInput: shouldRedact ? redactPII(input) : input,
      toolOutput: includeToolOutput ? (shouldRedact ? redactPII(output) : output) : undefined,
      durationMs,
    };

    await persistEvent(event);
  }

  /**
   * Error hook - logs tool call failures
   */
  async function onToolError(
    toolName: string,
    input: Record<string, unknown>,
    error: Error
  ): Promise<void> {
    const event: AuditEvent = {
      id: generateEventId(),
      timestamp: new Date(),
      type: 'tool_call_error',
      agentId,
      agentType,
      sessionId,
      correlationId,
      toolName,
      toolInput: shouldRedact ? redactPII(input) : input,
      error: {
        code: error.name,
        message: error.message,
        stack: error.stack,
      },
    };

    await persistEvent(event);
  }

  /**
   * Log a decision made by the agent
   */
  async function logDecision(
    action: string,
    reasoning: string,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const event: AuditEvent = {
      id: generateEventId(),
      timestamp: new Date(),
      type: 'decision_made',
      agentId,
      agentType,
      sessionId,
      correlationId,
      decision: {
        action,
        reasoning,
        confidence,
      },
      metadata: shouldRedact && metadata ? redactPII(metadata) : metadata,
    };

    await persistEvent(event);
  }

  /**
   * Log an escalation to human operator
   */
  async function logEscalation(reason: string, metadata?: Record<string, unknown>): Promise<void> {
    const event: AuditEvent = {
      id: generateEventId(),
      timestamp: new Date(),
      type: 'escalation',
      agentId,
      agentType,
      sessionId,
      correlationId,
      metadata: {
        reason,
        ...(shouldRedact && metadata ? redactPII(metadata) : metadata),
      },
    };

    await persistEvent(event);
  }

  return {
    logAgentStart,
    logAgentEnd,
    beforeToolCall,
    afterToolCall,
    onToolError,
    logDecision,
    logEscalation,
  };
}

/**
 * In-memory audit store for testing/development
 */
export function createInMemoryAuditStore(): {
  events: AuditEvent[];
  persistEvent: (event: AuditEvent) => Promise<void>;
  getEvents: () => AuditEvent[];
  clear: () => void;
} {
  const events: AuditEvent[] = [];

  return {
    events,
    persistEvent: (event: AuditEvent): Promise<void> => {
      events.push(event);
      return Promise.resolve();
    },
    getEvents: () => [...events],
    clear: () => {
      events.length = 0;
    },
  };
}
