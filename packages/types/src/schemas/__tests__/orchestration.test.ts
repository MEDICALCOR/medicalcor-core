/**
 * Orchestration Types Tests
 *
 * Tests for orchestration session, agent, and event types.
 *
 * @module types/schemas/__tests__/orchestration
 */

import { describe, it, expect } from 'vitest';
import {
  createSessionId,
  createDirectiveId,
  createCorrelationId,
  createIdempotencyKey,
  IdempotencyKeys,
  isValidStatusTransition,
  AGENT_CODENAMES,
  AGENT_FLEET,
  ORCHESTRATION_STATUSES,
  VALID_STATUS_TRANSITIONS,
  CONFLICT_TYPES,
  CONFLICT_ACTIONS,
  QUALITY_GATES,
  ORCHESTRATION_EVENT_TYPES,
  TASK_PRIORITIES,
  AgentCodenameSchema,
  OrchestrationStatusSchema,
  TaskPrioritySchema,
  QualityGateSchema,
  ConflictTypeSchema,
  ConflictActionSchema,
  OrchestrationEventTypeSchema,
  OrchestrationSessionSchema,
  AgentDirectiveSchema,
  AgentReportSchema,
  ConflictResolutionSchema,
  OrchestrationCheckpointSchema,
  QualityGateResultSchema,
  TaskAnalysisSchema,
} from '../orchestration.js';

// ============================================================================
// BRANDED TYPE CREATORS TESTS
// ============================================================================

describe('Branded Type Creators', () => {
  describe('createSessionId', () => {
    it('should create a valid session ID from UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const sessionId = createSessionId(uuid);
      expect(sessionId).toBe(uuid);
    });

    it('should throw error for invalid UUID format', () => {
      expect(() => createSessionId('invalid-uuid')).toThrow('Invalid OrchestrationSessionId');
      expect(() => createSessionId('')).toThrow('Invalid OrchestrationSessionId');
      expect(() => createSessionId('12345')).toThrow('Invalid OrchestrationSessionId');
    });

    it('should accept lowercase UUIDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => createSessionId(uuid)).not.toThrow();
    });

    it('should accept uppercase UUIDs', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      expect(() => createSessionId(uuid)).not.toThrow();
    });
  });

  describe('createDirectiveId', () => {
    it('should create a valid directive ID from UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const directiveId = createDirectiveId(uuid);
      expect(directiveId).toBe(uuid);
    });

    it('should throw error for invalid UUID format', () => {
      expect(() => createDirectiveId('not-a-uuid')).toThrow('Invalid AgentDirectiveId');
      expect(() => createDirectiveId('')).toThrow('Invalid AgentDirectiveId');
    });
  });

  describe('createCorrelationId', () => {
    it('should create correlation ID from any string', () => {
      const id = createCorrelationId('my-correlation-id');
      expect(id).toBe('my-correlation-id');
    });

    it('should allow empty strings', () => {
      const id = createCorrelationId('');
      expect(id).toBe('');
    });
  });

  describe('createIdempotencyKey', () => {
    it('should create idempotency key with operation and parts', () => {
      const key = createIdempotencyKey('test-op', 'part1', 'part2');
      expect(key).toBe('test-op:part1:part2');
    });

    it('should handle single part', () => {
      const key = createIdempotencyKey('operation', 'single');
      expect(key).toBe('operation:single');
    });

    it('should handle no parts', () => {
      const key = createIdempotencyKey('operation');
      expect(key).toBe('operation:');
    });
  });
});

// ============================================================================
// IDEMPOTENCY KEYS FACTORY TESTS
// ============================================================================

describe('IdempotencyKeys', () => {
  describe('custom', () => {
    it('should create custom idempotency key', () => {
      const key = IdempotencyKeys.custom('my-operation', 'id1', 'id2');
      expect(key).toBe('my-operation:id1:id2');
    });
  });

  describe('cronJob', () => {
    it('should create cron job idempotency key', () => {
      const key = IdempotencyKeys.cronJob('daily-cleanup', '2024-06-15');
      expect(key).toBe('cron:daily-cleanup:2024-06-15');
    });
  });

  describe('agentDispatch', () => {
    it('should create agent dispatch idempotency key', () => {
      const key = IdempotencyKeys.agentDispatch('session-123', 'ARCHITECT');
      expect(key).toBe('agent-dispatch:session-123:ARCHITECT');
    });
  });

  describe('qualityGate', () => {
    it('should create quality gate idempotency key', () => {
      const key = IdempotencyKeys.qualityGate('session-456', 'TYPECHECK');
      expect(key).toBe('quality-gate:session-456:TYPECHECK');
    });
  });

  describe('session', () => {
    it('should create session idempotency key', () => {
      const key = IdempotencyKeys.session('start', 'session-789');
      expect(key).toBe('session:start:session-789');
    });
  });
});

// ============================================================================
// STATUS TRANSITION TESTS
// ============================================================================

describe('isValidStatusTransition', () => {
  it('should return true for valid transition CREATED -> ANALYZING', () => {
    expect(isValidStatusTransition('CREATED', 'ANALYZING')).toBe(true);
  });

  it('should return true for valid transition CREATED -> CANCELLED', () => {
    expect(isValidStatusTransition('CREATED', 'CANCELLED')).toBe(true);
  });

  it('should return false for invalid transition CREATED -> COMPLETED', () => {
    expect(isValidStatusTransition('CREATED', 'COMPLETED')).toBe(false);
  });

  it('should return false for transition from APPROVED (terminal state)', () => {
    expect(isValidStatusTransition('APPROVED', 'COMPLETED')).toBe(false);
    expect(isValidStatusTransition('APPROVED', 'CREATED')).toBe(false);
  });

  it('should return false for transition from FAILED (terminal state)', () => {
    expect(isValidStatusTransition('FAILED', 'CREATED')).toBe(false);
  });

  it('should return false for transition from CANCELLED (terminal state)', () => {
    expect(isValidStatusTransition('CANCELLED', 'CREATED')).toBe(false);
  });

  it('should handle all IN_PROGRESS transitions', () => {
    expect(isValidStatusTransition('IN_PROGRESS', 'VALIDATING')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'RESOLVING_CONFLICTS')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'BLOCKED')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'FAILED')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'PAUSED')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'CANCELLED')).toBe(true);
    expect(isValidStatusTransition('IN_PROGRESS', 'CREATED')).toBe(false);
  });

  it('should handle BLOCKED recovery transitions', () => {
    expect(isValidStatusTransition('BLOCKED', 'IN_PROGRESS')).toBe(true);
    expect(isValidStatusTransition('BLOCKED', 'CANCELLED')).toBe(true);
    expect(isValidStatusTransition('BLOCKED', 'FAILED')).toBe(true);
  });

  it('should handle PAUSED resume transitions', () => {
    expect(isValidStatusTransition('PAUSED', 'IN_PROGRESS')).toBe(true);
    expect(isValidStatusTransition('PAUSED', 'CANCELLED')).toBe(true);
  });

  it('should handle TIMED_OUT transitions', () => {
    expect(isValidStatusTransition('TIMED_OUT', 'FAILED')).toBe(true);
    expect(isValidStatusTransition('TIMED_OUT', 'IN_PROGRESS')).toBe(false);
  });
});

// ============================================================================
// AGENT FLEET TESTS
// ============================================================================

describe('Agent Fleet Configuration', () => {
  it('should have all agent codenames defined', () => {
    expect(AGENT_CODENAMES).toContain('ORCHESTRATOR');
    expect(AGENT_CODENAMES).toContain('ARCHITECT');
    expect(AGENT_CODENAMES).toContain('DOMAIN');
    expect(AGENT_CODENAMES).toContain('COMPLIANCE');
    expect(AGENT_CODENAMES).toContain('SECURITY');
    expect(AGENT_CODENAMES).toContain('QA');
  });

  it('should have metadata for all agents in fleet', () => {
    for (const codename of AGENT_CODENAMES) {
      const agent = AGENT_FLEET[codename];
      expect(agent).toBeDefined();
      expect(agent.codename).toBe(codename);
      expect(agent.displayName).toBeTruthy();
      expect(typeof agent.priority).toBe('number');
      expect(Array.isArray(agent.capabilities)).toBe(true);
      expect(Array.isArray(agent.constraints)).toBe(true);
    }
  });

  it('should have ORCHESTRATOR with highest priority (0)', () => {
    expect(AGENT_FLEET.ORCHESTRATOR.priority).toBe(0);
  });

  it('should have SECURITY with high priority (1)', () => {
    expect(AGENT_FLEET.SECURITY.priority).toBe(1);
  });
});

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

describe('Schema Validations', () => {
  describe('AgentCodenameSchema', () => {
    it('should accept valid agent codenames', () => {
      expect(AgentCodenameSchema.parse('ORCHESTRATOR')).toBe('ORCHESTRATOR');
      expect(AgentCodenameSchema.parse('SECURITY')).toBe('SECURITY');
      expect(AgentCodenameSchema.parse('QA')).toBe('QA');
    });

    it('should reject invalid codenames', () => {
      expect(() => AgentCodenameSchema.parse('INVALID')).toThrow();
      expect(() => AgentCodenameSchema.parse('')).toThrow();
    });
  });

  describe('OrchestrationStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(OrchestrationStatusSchema.parse('CREATED')).toBe('CREATED');
      expect(OrchestrationStatusSchema.parse('IN_PROGRESS')).toBe('IN_PROGRESS');
      expect(OrchestrationStatusSchema.parse('COMPLETED')).toBe('COMPLETED');
    });

    it('should reject invalid statuses', () => {
      expect(() => OrchestrationStatusSchema.parse('INVALID')).toThrow();
    });
  });

  describe('TaskPrioritySchema', () => {
    it('should accept valid priorities', () => {
      for (const priority of TASK_PRIORITIES) {
        expect(TaskPrioritySchema.parse(priority)).toBe(priority);
      }
    });
  });

  describe('QualityGateSchema', () => {
    it('should accept valid quality gates', () => {
      for (const gate of QUALITY_GATES) {
        expect(QualityGateSchema.parse(gate)).toBe(gate);
      }
    });
  });

  describe('ConflictTypeSchema', () => {
    it('should accept valid conflict types', () => {
      for (const type of CONFLICT_TYPES) {
        expect(ConflictTypeSchema.parse(type)).toBe(type);
      }
    });
  });

  describe('ConflictActionSchema', () => {
    it('should accept valid conflict actions', () => {
      for (const action of CONFLICT_ACTIONS) {
        expect(ConflictActionSchema.parse(action)).toBe(action);
      }
    });
  });

  describe('OrchestrationEventTypeSchema', () => {
    it('should accept valid event types', () => {
      for (const eventType of ORCHESTRATION_EVENT_TYPES) {
        expect(OrchestrationEventTypeSchema.parse(eventType)).toBe(eventType);
      }
    });
  });
});

// ============================================================================
// COMPLEX SCHEMA TESTS
// ============================================================================

describe('Complex Schema Validations', () => {
  describe('AgentDirectiveSchema', () => {
    it('should validate a complete agent directive', () => {
      const directive = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '550e8400-e29b-41d4-a716-446655440001',
        target: 'ARCHITECT',
        priority: 'HIGH',
        task: 'Review architecture',
        description: 'Review the architecture for compliance',
        constraints: ['No breaking changes'],
        dependencies: [],
        reportingFrequency: 'ON_COMPLETION',
        requiredQualityGates: ['G1_ARCHITECTURE'],
        idempotencyKey: 'directive-001',
        context: { files: ['src/index.ts'] },
        createdAt: '2024-06-15T10:00:00Z',
      };

      const result = AgentDirectiveSchema.safeParse(directive);
      expect(result.success).toBe(true);
    });
  });

  describe('QualityGateResultSchema', () => {
    it('should validate a quality gate result', () => {
      const result = {
        gate: 'G5_QUALITY',
        status: 'PASSED',
        checkedAt: '2024-06-15T10:00:00Z',
        checkedBy: 'QA',
        durationMs: 5000,
      };

      const parsed = QualityGateResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe('OrchestrationCheckpointSchema', () => {
    it('should validate a checkpoint', () => {
      const checkpoint = {
        version: 1,
        status: 'IN_PROGRESS',
        resumable: true,
        completedAgents: ['ARCHITECT', 'SECURITY'],
        pendingAgents: ['QA'],
        passedGates: ['G5_QUALITY'],
        failedGates: [],
        unresolvedConflicts: 0,
        checkpointData: {},
        savedAt: '2024-06-15T10:00:00Z',
      };

      const result = OrchestrationCheckpointSchema.safeParse(checkpoint);
      expect(result.success).toBe(true);
    });
  });

  describe('TaskAnalysisSchema', () => {
    it('should validate task analysis', () => {
      const analysis = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        complexity: 'MODERATE',
        requiredAgents: ['ARCHITECT', 'DOMAIN'],
        parallelizable: true,
        dependencies: {},
        estimatedRisk: 'MEDIUM',
        complianceRequired: false,
        securityReview: false,
        affectedPackages: ['domain', 'infrastructure'],
        affectedFiles: ['src/index.ts'],
        requiredQualityGates: ['G5_QUALITY'],
        taskType: 'FEATURE',
        keywords: ['add', 'feature'],
        analyzedAt: '2024-06-15T10:00:00Z',
      };

      const result = TaskAnalysisSchema.safeParse(analysis);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('Constants', () => {
  it('should have all orchestration statuses defined', () => {
    expect(ORCHESTRATION_STATUSES.length).toBeGreaterThan(10);
    expect(ORCHESTRATION_STATUSES).toContain('CREATED');
    expect(ORCHESTRATION_STATUSES).toContain('COMPLETED');
    expect(ORCHESTRATION_STATUSES).toContain('FAILED');
  });

  it('should have valid transitions for all statuses', () => {
    for (const status of ORCHESTRATION_STATUSES) {
      expect(VALID_STATUS_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(VALID_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });

  it('should have quality gates defined', () => {
    expect(QUALITY_GATES).toContain('G1_ARCHITECTURE');
    expect(QUALITY_GATES).toContain('G3_COMPLIANCE');
    expect(QUALITY_GATES).toContain('G4_SECURITY');
    expect(QUALITY_GATES).toContain('G5_QUALITY');
  });

  it('should have conflict types defined', () => {
    expect(CONFLICT_TYPES).toContain('MERGE_CONFLICT');
    expect(CONFLICT_TYPES).toContain('LAYER_VIOLATION');
    expect(CONFLICT_TYPES).toContain('SECURITY_RISK');
    expect(CONFLICT_TYPES).toContain('COMPLIANCE_BREACH');
  });

  it('should have conflict actions defined', () => {
    expect(CONFLICT_ACTIONS).toContain('AUTO_RESOLVE');
    expect(CONFLICT_ACTIONS).toContain('BLOCK_MERGE');
    expect(CONFLICT_ACTIONS).toContain('ESCALATE');
  });
});

// ============================================================================
// HELPER FUNCTIONS TESTS
// ============================================================================

import {
  getConflictResolver,
  hasHigherPriority,
  allQualityGatesPassed,
  getFailedQualityGates,
  getRequiredQualityGates,
  getTaskRouting,
  calculateProgress,
  isResumable,
  getAgentMetadata,
  generateSessionId,
  generateCorrelationId,
  AGENT_PRIORITY,
  TASK_TYPE_QUALITY_GATES,
  TASK_TYPE_ROUTING,
} from '../orchestration.js';
import type {
  QualityGateResult,
  OrchestrationSession,
  AgentCodename,
  ConflictType,
} from '../orchestration.js';

describe('Helper Functions', () => {
  describe('getConflictResolver', () => {
    it('should return ARCHITECT for LAYER_VIOLATION', () => {
      expect(getConflictResolver('LAYER_VIOLATION')).toBe('ARCHITECT');
    });

    it('should return SECURITY for SECURITY_RISK', () => {
      expect(getConflictResolver('SECURITY_RISK')).toBe('SECURITY');
    });

    it('should return COMPLIANCE for COMPLIANCE_BREACH', () => {
      expect(getConflictResolver('COMPLIANCE_BREACH')).toBe('COMPLIANCE');
    });

    it('should return QA for PERFORMANCE_REGRESSION', () => {
      expect(getConflictResolver('PERFORMANCE_REGRESSION')).toBe('QA');
    });

    it('should return INTEGRATIONS for INTEGRATION_FAILURE', () => {
      expect(getConflictResolver('INTEGRATION_FAILURE')).toBe('INTEGRATIONS');
    });

    it('should return QA for TEST_FAILURE', () => {
      expect(getConflictResolver('TEST_FAILURE')).toBe('QA');
    });

    it('should return ARCHITECT for MERGE_CONFLICT', () => {
      expect(getConflictResolver('MERGE_CONFLICT')).toBe('ARCHITECT');
    });

    it('should return ORCHESTRATOR for RESOURCE_CONTENTION', () => {
      expect(getConflictResolver('RESOURCE_CONTENTION')).toBe('ORCHESTRATOR');
    });

    it('should return ORCHESTRATOR for DEADLINE_CONFLICT', () => {
      expect(getConflictResolver('DEADLINE_CONFLICT')).toBe('ORCHESTRATOR');
    });
  });

  describe('hasHigherPriority', () => {
    it('should return true when first agent has higher priority (lower number)', () => {
      expect(hasHigherPriority('ORCHESTRATOR', 'SECURITY')).toBe(true);
      expect(hasHigherPriority('SECURITY', 'COMPLIANCE')).toBe(true);
      expect(hasHigherPriority('ORCHESTRATOR', 'FRONTEND')).toBe(true);
    });

    it('should return false when first agent has lower priority (higher number)', () => {
      expect(hasHigherPriority('FRONTEND', 'ORCHESTRATOR')).toBe(false);
      expect(hasHigherPriority('DEVOPS', 'SECURITY')).toBe(false);
      expect(hasHigherPriority('QA', 'ARCHITECT')).toBe(false);
    });

    it('should return false when agents have same priority', () => {
      expect(hasHigherPriority('ORCHESTRATOR', 'ORCHESTRATOR')).toBe(false);
      expect(hasHigherPriority('SECURITY', 'SECURITY')).toBe(false);
    });
  });

  describe('allQualityGatesPassed', () => {
    it('should return true when all gates passed', () => {
      const results: QualityGateResult[] = [
        {
          gate: 'G1_ARCHITECTURE',
          status: 'PASSED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'ARCHITECT',
          durationMs: 100,
        },
        {
          gate: 'G5_QUALITY',
          status: 'PASSED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'QA',
          durationMs: 200,
        },
      ];
      expect(allQualityGatesPassed(results)).toBe(true);
    });

    it('should return true when all gates are either passed or skipped', () => {
      const results: QualityGateResult[] = [
        {
          gate: 'G1_ARCHITECTURE',
          status: 'PASSED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'ARCHITECT',
          durationMs: 100,
        },
        {
          gate: 'G6_PERFORMANCE',
          status: 'SKIPPED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'QA',
          durationMs: 50,
        },
      ];
      expect(allQualityGatesPassed(results)).toBe(true);
    });

    it('should return false when any gate failed', () => {
      const results: QualityGateResult[] = [
        {
          gate: 'G1_ARCHITECTURE',
          status: 'PASSED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'ARCHITECT',
          durationMs: 100,
        },
        {
          gate: 'G5_QUALITY',
          status: 'FAILED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'QA',
          durationMs: 200,
        },
      ];
      expect(allQualityGatesPassed(results)).toBe(false);
    });

    it('should return false when any gate is pending', () => {
      const results: QualityGateResult[] = [
        {
          gate: 'G1_ARCHITECTURE',
          status: 'PENDING',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'ARCHITECT',
          durationMs: 0,
        },
      ];
      expect(allQualityGatesPassed(results)).toBe(false);
    });

    it('should return true for empty results', () => {
      expect(allQualityGatesPassed([])).toBe(true);
    });
  });

  describe('getFailedQualityGates', () => {
    it('should return empty array when no gates failed', () => {
      const results: QualityGateResult[] = [
        {
          gate: 'G1_ARCHITECTURE',
          status: 'PASSED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'ARCHITECT',
          durationMs: 100,
        },
        {
          gate: 'G5_QUALITY',
          status: 'PASSED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'QA',
          durationMs: 200,
        },
      ];
      expect(getFailedQualityGates(results)).toEqual([]);
    });

    it('should return failed gates', () => {
      const results: QualityGateResult[] = [
        {
          gate: 'G1_ARCHITECTURE',
          status: 'PASSED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'ARCHITECT',
          durationMs: 100,
        },
        {
          gate: 'G4_SECURITY',
          status: 'FAILED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'SECURITY',
          durationMs: 200,
        },
        {
          gate: 'G5_QUALITY',
          status: 'FAILED',
          checkedAt: '2024-01-01T00:00:00Z',
          checkedBy: 'QA',
          durationMs: 200,
        },
      ];
      expect(getFailedQualityGates(results)).toEqual(['G4_SECURITY', 'G5_QUALITY']);
    });

    it('should return empty array for empty results', () => {
      expect(getFailedQualityGates([])).toEqual([]);
    });
  });

  describe('getRequiredQualityGates', () => {
    it('should return gates for known task type', () => {
      const gates = getRequiredQualityGates('NEW_DOMAIN_SERVICE');
      expect(gates).toContain('G1_ARCHITECTURE');
      expect(gates).toContain('G2_DOMAIN_PURITY');
      expect(gates).toContain('G5_QUALITY');
    });

    it('should return gates for NEW_INTEGRATION', () => {
      const gates = getRequiredQualityGates('NEW_INTEGRATION');
      expect(gates).toContain('G3_COMPLIANCE');
      expect(gates).toContain('G4_SECURITY');
      expect(gates).toContain('G5_QUALITY');
    });

    it('should return gates for DATABASE_MIGRATION', () => {
      const gates = getRequiredQualityGates('DATABASE_MIGRATION');
      expect(gates).toContain('G1_ARCHITECTURE');
      expect(gates).toContain('G4_SECURITY');
    });

    it('should return gates for SECURITY_FIX', () => {
      const gates = getRequiredQualityGates('SECURITY_FIX');
      expect(gates).toContain('G3_COMPLIANCE');
      expect(gates).toContain('G4_SECURITY');
      expect(gates).toContain('G7_DEPLOYMENT');
    });

    it('should return default gates for unknown task type', () => {
      const gates = getRequiredQualityGates('UNKNOWN_TASK_TYPE');
      expect(gates).toEqual(['G5_QUALITY']);
    });
  });

  describe('getTaskRouting', () => {
    it('should return routing for NEW_DOMAIN_SERVICE', () => {
      const routing = getTaskRouting('NEW_DOMAIN_SERVICE');
      expect(routing.primary).toBe('DOMAIN');
      expect(routing.support).toContain('ARCHITECT');
      expect(routing.support).toContain('QA');
    });

    it('should return routing for NEW_INTEGRATION', () => {
      const routing = getTaskRouting('NEW_INTEGRATION');
      expect(routing.primary).toBe('INTEGRATIONS');
      expect(routing.support).toContain('SECURITY');
    });

    it('should return routing for SECURITY_FIX', () => {
      const routing = getTaskRouting('SECURITY_FIX');
      expect(routing.primary).toBe('SECURITY');
      expect(routing.support).toContain('COMPLIANCE');
    });

    it('should return routing for UI_COMPONENT', () => {
      const routing = getTaskRouting('UI_COMPONENT');
      expect(routing.primary).toBe('FRONTEND');
      expect(routing.support).toContain('QA');
    });

    it('should return default routing for unknown task type', () => {
      const routing = getTaskRouting('UNKNOWN_TASK_TYPE');
      expect(routing.primary).toBe('DOMAIN');
      expect(routing.support).toEqual(['QA']);
    });
  });

  describe('calculateProgress', () => {
    const baseSession: OrchestrationSession = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'test-correlation',
      status: 'CREATED',
      request: 'Test request',
      priority: 'MEDIUM',
      directives: [],
      reports: [],
      qualityGates: [],
      conflicts: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      auditTrail: [],
    };

    it('should return 100 for COMPLETED status', () => {
      const session = { ...baseSession, status: 'COMPLETED' as const };
      expect(calculateProgress(session)).toBe(100);
    });

    it('should return 100 for APPROVED status', () => {
      const session = { ...baseSession, status: 'APPROVED' as const };
      expect(calculateProgress(session)).toBe(100);
    });

    it('should return 0 for CREATED status', () => {
      const session = { ...baseSession, status: 'CREATED' as const };
      expect(calculateProgress(session)).toBe(0);
    });

    it('should return 10 for ANALYZING status', () => {
      const session = { ...baseSession, status: 'ANALYZING' as const };
      expect(calculateProgress(session)).toBe(10);
    });

    it('should return 20 for ANALYZED status', () => {
      const session = { ...baseSession, status: 'ANALYZED' as const };
      expect(calculateProgress(session)).toBe(20);
    });

    it('should return 30 for DISPATCHING status', () => {
      const session = { ...baseSession, status: 'DISPATCHING' as const };
      expect(calculateProgress(session)).toBe(30);
    });

    it('should calculate progress based on completed agents and gates for IN_PROGRESS', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'IN_PROGRESS',
        analysis: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          complexity: 'MODERATE',
          requiredAgents: ['DOMAIN', 'QA'],
          parallelizable: true,
          dependencies: {},
          estimatedRisk: 'LOW',
          complianceRequired: false,
          securityReview: false,
          affectedPackages: [],
          affectedFiles: [],
          requiredQualityGates: ['G1_ARCHITECTURE', 'G5_QUALITY'],
          taskType: 'NEW_DOMAIN_SERVICE',
          keywords: [],
          analyzedAt: '2024-01-01T00:00:00Z',
        },
        directives: [
          {
            id: '550e8400-e29b-41d4-a716-446655440002',
            sessionId: '550e8400-e29b-41d4-a716-446655440000',
            target: 'DOMAIN',
            priority: 'MEDIUM',
            task: 'Task 1',
            description: 'Description 1',
            constraints: [],
            dependencies: [],
            reportingFrequency: 'ON_COMPLETION',
            requiredQualityGates: [],
            idempotencyKey: 'key1',
            createdAt: '2024-01-01T00:00:00Z',
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440003',
            sessionId: '550e8400-e29b-41d4-a716-446655440000',
            target: 'QA',
            priority: 'MEDIUM',
            task: 'Task 2',
            description: 'Description 2',
            constraints: [],
            dependencies: [],
            reportingFrequency: 'ON_COMPLETION',
            requiredQualityGates: [],
            idempotencyKey: 'key2',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        reports: [
          {
            id: '550e8400-e29b-41d4-a716-446655440004',
            directiveId: '550e8400-e29b-41d4-a716-446655440002',
            sessionId: '550e8400-e29b-41d4-a716-446655440000',
            agent: 'DOMAIN',
            task: 'Task 1',
            status: 'COMPLETED',
            startedAt: '2024-01-01T00:00:00Z',
            findings: [],
            recommendations: [],
            blockers: [],
            nextSteps: [],
            qualityGateResults: [],
            artifacts: {
              filesCreated: [],
              filesModified: [],
              filesDeleted: [],
              testsAdded: [],
              migrationsAdded: [],
            },
            metrics: { linesAdded: 0, linesRemoved: 0, filesChanged: 0, executionTimeMs: 0 },
          },
        ],
        qualityGates: [
          {
            gate: 'G1_ARCHITECTURE',
            status: 'PASSED',
            checkedAt: '2024-01-01T00:00:00Z',
            checkedBy: 'ARCHITECT',
            durationMs: 100,
          },
        ],
      };

      const progress = calculateProgress(session);
      // Should be between 30 and 99
      expect(progress).toBeGreaterThan(30);
      expect(progress).toBeLessThanOrEqual(99);
    });

    it('should cap progress at 99 for IN_PROGRESS status', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'IN_PROGRESS',
        directives: [],
        reports: [],
        qualityGates: [],
      };
      expect(calculateProgress(session)).toBeLessThanOrEqual(99);
    });
  });

  describe('isResumable', () => {
    const baseSession: OrchestrationSession = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: 'test-correlation',
      status: 'PAUSED',
      request: 'Test request',
      priority: 'MEDIUM',
      directives: [],
      reports: [],
      qualityGates: [],
      conflicts: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      auditTrail: [],
    };

    it('should return true for PAUSED session with resumable checkpoint', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'PAUSED',
        checkpoint: {
          version: 1,
          status: 'PAUSED',
          resumable: true,
          completedAgents: [],
          pendingAgents: ['DOMAIN'],
          passedGates: [],
          failedGates: [],
          unresolvedConflicts: 0,
          checkpointData: {},
          savedAt: '2024-01-01T00:00:00Z',
        },
      };
      expect(isResumable(session)).toBe(true);
    });

    it('should return true for BLOCKED session with resumable checkpoint', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'BLOCKED',
        checkpoint: {
          version: 1,
          status: 'BLOCKED',
          resumable: true,
          completedAgents: [],
          pendingAgents: [],
          passedGates: [],
          failedGates: [],
          unresolvedConflicts: 1,
          checkpointData: {},
          savedAt: '2024-01-01T00:00:00Z',
        },
      };
      expect(isResumable(session)).toBe(true);
    });

    it('should return true for IN_PROGRESS session with resumable checkpoint', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'IN_PROGRESS',
        checkpoint: {
          version: 1,
          status: 'IN_PROGRESS',
          resumable: true,
          completedAgents: ['SECURITY'],
          pendingAgents: ['DOMAIN'],
          passedGates: ['G4_SECURITY'],
          failedGates: [],
          unresolvedConflicts: 0,
          checkpointData: {},
          savedAt: '2024-01-01T00:00:00Z',
        },
      };
      expect(isResumable(session)).toBe(true);
    });

    it('should return false when checkpoint is not resumable', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'PAUSED',
        checkpoint: {
          version: 1,
          status: 'PAUSED',
          resumable: false,
          completedAgents: [],
          pendingAgents: [],
          passedGates: [],
          failedGates: [],
          unresolvedConflicts: 0,
          checkpointData: {},
          savedAt: '2024-01-01T00:00:00Z',
        },
      };
      expect(isResumable(session)).toBe(false);
    });

    it('should return false when no checkpoint exists', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'PAUSED',
        checkpoint: undefined,
      };
      expect(isResumable(session)).toBe(false);
    });

    it('should return false for COMPLETED status', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'COMPLETED',
        checkpoint: {
          version: 1,
          status: 'COMPLETED',
          resumable: true,
          completedAgents: ['DOMAIN'],
          pendingAgents: [],
          passedGates: ['G5_QUALITY'],
          failedGates: [],
          unresolvedConflicts: 0,
          checkpointData: {},
          savedAt: '2024-01-01T00:00:00Z',
        },
      };
      expect(isResumable(session)).toBe(false);
    });

    it('should return false for FAILED status', () => {
      const session: OrchestrationSession = {
        ...baseSession,
        status: 'FAILED',
        checkpoint: {
          version: 1,
          status: 'FAILED',
          resumable: true,
          completedAgents: [],
          pendingAgents: [],
          passedGates: [],
          failedGates: ['G5_QUALITY'],
          unresolvedConflicts: 0,
          checkpointData: {},
          savedAt: '2024-01-01T00:00:00Z',
        },
      };
      expect(isResumable(session)).toBe(false);
    });
  });

  describe('getAgentMetadata', () => {
    it('should return metadata for ORCHESTRATOR', () => {
      const metadata = getAgentMetadata('ORCHESTRATOR');
      expect(metadata.codename).toBe('ORCHESTRATOR');
      expect(metadata.displayName).toBe('Master Coordinator');
      expect(metadata.priority).toBe(0);
      expect(metadata.capabilities).toContain('task-routing');
    });

    it('should return metadata for SECURITY', () => {
      const metadata = getAgentMetadata('SECURITY');
      expect(metadata.codename).toBe('SECURITY');
      expect(metadata.displayName).toBe('Security Guardian');
      expect(metadata.capabilities).toContain('threat-analysis');
    });

    it('should return metadata for all agents', () => {
      const agents: AgentCodename[] = [
        'ORCHESTRATOR',
        'ARCHITECT',
        'DOMAIN',
        'COMPLIANCE',
        'INFRA',
        'INTEGRATIONS',
        'AI_RAG',
        'QA',
        'SECURITY',
        'DEVOPS',
        'FRONTEND',
      ];

      for (const agent of agents) {
        const metadata = getAgentMetadata(agent);
        expect(metadata).toBeDefined();
        expect(metadata.codename).toBe(agent);
        expect(metadata.capabilities.length).toBeGreaterThan(0);
        expect(metadata.constraints.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateSessionId', () => {
    it('should generate valid UUID session ID', () => {
      const sessionId = generateSessionId();
      expect(sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate correlation ID without prefix', () => {
      const id = generateCorrelationId();
      expect(id).toBeDefined();
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate correlation ID with prefix', () => {
      const id = generateCorrelationId('test-prefix');
      expect(id).toContain('test-prefix');
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp component', () => {
      const id = generateCorrelationId();
      // Should contain digits (timestamp)
      expect(id).toMatch(/\d+/);
    });
  });

  describe('AGENT_PRIORITY constant', () => {
    it('should have ORCHESTRATOR with highest priority (0)', () => {
      expect(AGENT_PRIORITY.ORCHESTRATOR).toBe(0);
    });

    it('should have SECURITY with second highest priority (1)', () => {
      expect(AGENT_PRIORITY.SECURITY).toBe(1);
    });

    it('should have FRONTEND with lowest priority (10)', () => {
      expect(AGENT_PRIORITY.FRONTEND).toBe(10);
    });

    it('should have all agents defined', () => {
      const agents: AgentCodename[] = [
        'ORCHESTRATOR',
        'SECURITY',
        'COMPLIANCE',
        'ARCHITECT',
        'DOMAIN',
        'QA',
        'INFRA',
        'INTEGRATIONS',
        'AI_RAG',
        'DEVOPS',
        'FRONTEND',
      ];
      for (const agent of agents) {
        expect(AGENT_PRIORITY[agent]).toBeDefined();
        expect(typeof AGENT_PRIORITY[agent]).toBe('number');
      }
    });
  });

  describe('TASK_TYPE_QUALITY_GATES constant', () => {
    it('should have gates for all documented task types', () => {
      const taskTypes = [
        'NEW_DOMAIN_SERVICE',
        'NEW_INTEGRATION',
        'DATABASE_MIGRATION',
        'AI_RAG_FEATURE',
        'UI_COMPONENT',
        'SECURITY_FIX',
        'PERFORMANCE_ISSUE',
        'DEPLOYMENT',
        'COMPLIANCE_AUDIT',
        'ARCHITECTURE_REFACTOR',
      ] as const;

      for (const taskType of taskTypes) {
        const gates = TASK_TYPE_QUALITY_GATES[taskType];
        expect(gates).toBeDefined();
        expect(Array.isArray(gates)).toBe(true);
        expect(gates!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('TASK_TYPE_ROUTING constant', () => {
    it('should have routing for all documented task types', () => {
      const taskTypes = [
        'NEW_DOMAIN_SERVICE',
        'NEW_INTEGRATION',
        'DATABASE_MIGRATION',
        'AI_RAG_FEATURE',
        'UI_COMPONENT',
        'SECURITY_FIX',
        'PERFORMANCE_ISSUE',
        'DEPLOYMENT',
        'COMPLIANCE_AUDIT',
        'ARCHITECTURE_REFACTOR',
      ] as const;

      for (const taskType of taskTypes) {
        const routing = TASK_TYPE_ROUTING[taskType];
        expect(routing).toBeDefined();
        expect(routing!.primary).toBeDefined();
        expect(Array.isArray(routing!.support)).toBe(true);
      }
    });
  });
});
