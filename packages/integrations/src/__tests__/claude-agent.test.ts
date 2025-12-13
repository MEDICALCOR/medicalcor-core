/**
 * @fileoverview Tests for Claude Agent SDK Integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeAgentClient, createClaudeAgentClient } from '../claude-agent';
import type { AgentDirective } from '@medicalcor/types';

// Track shouldRetry calls for testing
let capturedShouldRetry: ((error: unknown) => boolean) | null = null;

// Mock logger
vi.mock('@medicalcor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@medicalcor/core')>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    withRetry: vi.fn(
      async (
        fn: () => Promise<string>,
        options?: { shouldRetry?: (error: unknown) => boolean }
      ) => {
        // Capture the shouldRetry function for testing
        if (options?.shouldRetry) {
          capturedShouldRetry = options.shouldRetry;
        }
        return fn();
      }
    ),
  };
});

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7),
});

// ============================================================================
// HELPERS
// ============================================================================

function createValidDirective(overrides: Partial<AgentDirective> = {}): AgentDirective {
  return {
    id: 'directive-123',
    sessionId: 'session-456',
    target: 'ARCHITECT',
    priority: 'HIGH',
    task: 'Review layer boundaries',
    description: 'Check for architecture violations',
    constraints: ['No layer violations', 'DDD patterns required'],
    dependencies: [],
    requiredQualityGates: ['G1_ARCHITECTURE'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createSuccessResponse(
  content: string = '{"status": "COMPLETED", "findings": [], "recommendations": [], "blockers": [], "nextSteps": []}'
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: content }],
    }),
    text: async () => content,
  };
}

function createErrorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: message }),
    text: async () => message,
  };
}

// ============================================================================
// CONSTRUCTOR TESTS
// ============================================================================

describe('ClaudeAgentClient', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    capturedShouldRetry = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new ClaudeAgentClient({
        apiKey: 'test-api-key',
      });

      expect(client).toBeInstanceOf(ClaudeAgentClient);
    });

    it('should use default values for optional config', () => {
      const client = new ClaudeAgentClient({
        apiKey: 'test-api-key',
      });

      expect(client).toBeDefined();
    });

    it('should accept custom model configuration', () => {
      const client = new ClaudeAgentClient({
        apiKey: 'test-api-key',
        model: 'claude-opus-4-20250514',
        maxTokens: 16384,
        temperature: 0.7,
        timeoutMs: 60000,
      });

      expect(client).toBeDefined();
    });

    it('should accept custom retry configuration', () => {
      const client = new ClaudeAgentClient({
        apiKey: 'test-api-key',
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });

      expect(client).toBeDefined();
    });

    it('should throw on empty API key', () => {
      expect(() => {
        new ClaudeAgentClient({ apiKey: '' });
      }).toThrow();
    });

    it('should throw on invalid maxTokens', () => {
      expect(() => {
        new ClaudeAgentClient({
          apiKey: 'test-key',
          maxTokens: 0,
        });
      }).toThrow();
    });

    it('should throw on maxTokens exceeding limit', () => {
      expect(() => {
        new ClaudeAgentClient({
          apiKey: 'test-key',
          maxTokens: 300000,
        });
      }).toThrow();
    });

    it('should throw on invalid temperature below 0', () => {
      expect(() => {
        new ClaudeAgentClient({
          apiKey: 'test-key',
          temperature: -0.1,
        });
      }).toThrow();
    });

    it('should throw on invalid temperature above 1', () => {
      expect(() => {
        new ClaudeAgentClient({
          apiKey: 'test-key',
          temperature: 1.5,
        });
      }).toThrow();
    });

    it('should throw on timeout below minimum', () => {
      expect(() => {
        new ClaudeAgentClient({
          apiKey: 'test-key',
          timeoutMs: 500,
        });
      }).toThrow();
    });

    it('should throw on timeout above maximum', () => {
      expect(() => {
        new ClaudeAgentClient({
          apiKey: 'test-key',
          timeoutMs: 700000,
        });
      }).toThrow();
    });
  });

  // ============================================================================
  // EXECUTE AGENT TESTS
  // ============================================================================

  describe('executeAgent', () => {
    it('should successfully execute agent with valid input', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(true);
      expect(result.report).toBeDefined();
      expect(result.report.status).toBe('COMPLETED');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw on missing directive id', async () => {
      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({ id: '' });

      await expect(
        client.executeAgent({ directive: { ...directive, id: undefined as unknown as string } })
      ).rejects.toThrow('Invalid directive: missing required fields');
    });

    it('should throw on missing directive task', async () => {
      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await expect(
        client.executeAgent({ directive: { ...directive, task: undefined as unknown as string } })
      ).rejects.toThrow('Invalid directive: missing required fields');
    });

    it('should call progress callback during execution', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();
      const progressCallbackMock = vi.fn();

      await client.executeAgent({ directive }, progressCallbackMock);

      expect(progressCallbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'starting', progress: 10 })
      );
      expect(progressCallbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'analyzing', progress: 30 })
      );
      expect(progressCallbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'executing', progress: 50 })
      );
      expect(progressCallbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'validating', progress: 80 })
      );
      expect(progressCallbackMock).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'complete', progress: 100 })
      );
    });

    it('should include context in user prompt when provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();
      const context = {
        codebaseRoot: '/home/project',
        previousFindings: ['Finding 1', 'Finding 2'],
        relatedFiles: ['file1.ts', 'file2.ts'],
      };

      await client.executeAgent({ directive, context });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages[0].content).toContain('file1.ts');
      expect(body.messages[0].content).toContain('Finding 1');
    });

    it('should handle empty context arrays', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();
      const context = {
        previousFindings: [],
        relatedFiles: [],
      };

      const result = await client.executeAgent({ directive, context });

      expect(result.success).toBe(true);
    });

    it('should return failed report on API error', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createErrorResponse(500, 'Internal Server Error'));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(false);
      expect(result.report.status).toBe('FAILED');
      expect(result.report.findings).toHaveLength(1);
      expect(result.report.findings[0].type).toBe('ERROR');
      expect(result.report.blockers).toHaveLength(1);
    });

    it('should handle network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(false);
      expect(result.report.status).toBe('FAILED');
    });

    it('should parse response with findings correctly', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [
          {
            type: 'WARNING',
            severity: 'HIGH',
            message: 'Layer violation detected',
            file: 'src/domain/service.ts',
            line: 42,
            suggestion: 'Remove infrastructure import',
          },
        ],
        recommendations: [],
        blockers: [],
        nextSteps: ['Fix the layer violation'],
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.findings).toHaveLength(1);
      expect(result.report.findings[0].message).toBe('Layer violation detected');
      expect(result.report.findings[0].file).toBe('src/domain/service.ts');
    });

    it('should parse response with recommendations correctly', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [],
        recommendations: [
          {
            priority: 'HIGH',
            action: 'Add unit tests',
            reason: 'Coverage is below threshold',
            category: 'MUST_FIX',
          },
        ],
        blockers: [],
        nextSteps: [],
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.recommendations).toHaveLength(1);
      expect(result.report.recommendations[0].action).toBe('Add unit tests');
    });

    it('should parse response with blockers correctly', async () => {
      const responseContent = JSON.stringify({
        status: 'BLOCKED',
        findings: [],
        recommendations: [],
        blockers: [
          {
            type: 'DEPENDENCY',
            severity: 'CRITICAL',
            description: 'Missing database migration',
            requiredAction: 'Run migrations first',
          },
        ],
        nextSteps: [],
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.status).toBe('BLOCKED');
      expect(result.report.blockers).toHaveLength(1);
      expect(result.report.blockers[0].type).toBe('DEPENDENCY');
    });

    it('should parse response with artifacts correctly', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [],
        recommendations: [],
        blockers: [],
        nextSteps: [],
        artifacts: {
          filesCreated: ['new-file.ts'],
          filesModified: ['existing.ts'],
          filesDeleted: [],
          testsAdded: ['test.spec.ts'],
          migrationsAdded: [],
        },
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.artifacts.filesCreated).toContain('new-file.ts');
      expect(result.report.artifacts.filesModified).toContain('existing.ts');
    });

    it('should parse response with metrics correctly', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [],
        recommendations: [],
        blockers: [],
        nextSteps: [],
        metrics: {
          linesAdded: 150,
          linesRemoved: 30,
          filesChanged: 5,
          testCoverage: 85,
        },
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.metrics.linesAdded).toBe(150);
      expect(result.report.metrics.linesRemoved).toBe(30);
    });

    it('should handle malformed JSON response gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse('This is not JSON at all'));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(true);
      expect(result.report.status).toBe('COMPLETED');
      expect(result.report.recommendations).toHaveLength(1);
      expect(result.report.recommendations[0].action).toBe('Review agent output manually');
    });

    it('should handle response with invalid JSON structure', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse('{invalid json'));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(true);
      expect(result.report.recommendations[0].reason).toContain('could not be parsed');
    });

    it('should handle empty response content', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: 'image', url: 'http://example.com' }],
        }),
      });
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(false);
      expect(result.report.status).toBe('FAILED');
    });
  });

  // ============================================================================
  // AGENT TYPE SYSTEM PROMPTS
  // ============================================================================

  describe('agent system prompts', () => {
    const agentTypes: Array<AgentDirective['target']> = [
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

    for (const agentType of agentTypes) {
      it(`should use correct system prompt for ${agentType} agent`, async () => {
        const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
        global.fetch = mockFetch;

        const client = new ClaudeAgentClient({ apiKey: 'test-key' });
        const directive = createValidDirective({ target: agentType });

        await client.executeAgent({ directive });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.system).toBeDefined();
        expect(body.system.length).toBeGreaterThan(0);
      });
    }

    it('should fallback to DOMAIN prompt for unknown agent type', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        target: 'UNKNOWN_AGENT' as AgentDirective['target'],
      });

      await client.executeAgent({ directive });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toContain('Domain Expert');
    });
  });

  // ============================================================================
  // EXECUTE AGENTS PARALLEL
  // ============================================================================

  describe('executeAgentsParallel', () => {
    it('should execute multiple agents in parallel', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const inputs = [
        { directive: createValidDirective({ id: 'directive-1', target: 'ARCHITECT' }) },
        { directive: createValidDirective({ id: 'directive-2', target: 'DOMAIN' }) },
        { directive: createValidDirective({ id: 'directive-3', target: 'QA' }) },
      ];

      const results = await client.executeAgentsParallel(inputs);

      expect(results).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should respect maxConcurrency parameter', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(createSuccessResponse()), 10);
        });
      });
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const inputs = [
        { directive: createValidDirective({ id: 'directive-1' }) },
        { directive: createValidDirective({ id: 'directive-2' }) },
        { directive: createValidDirective({ id: 'directive-3' }) },
        { directive: createValidDirective({ id: 'directive-4' }) },
        { directive: createValidDirective({ id: 'directive-5' }) },
      ];

      const results = await client.executeAgentsParallel(inputs, 2);

      expect(results).toHaveLength(5);
    });

    it('should handle partial failures in parallel execution', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve(createErrorResponse(500, 'Server Error'));
        }
        return Promise.resolve(createSuccessResponse());
      });
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const inputs = [
        { directive: createValidDirective({ id: 'directive-1' }) },
        { directive: createValidDirective({ id: 'directive-2' }) },
        { directive: createValidDirective({ id: 'directive-3' }) },
      ];

      const results = await client.executeAgentsParallel(inputs);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('should handle empty input array', async () => {
      const client = new ClaudeAgentClient({ apiKey: 'test-key' });

      const results = await client.executeAgentsParallel([]);

      expect(results).toHaveLength(0);
    });

    it('should process single input correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const inputs = [{ directive: createValidDirective() }];

      const results = await client.executeAgentsParallel(inputs, 1);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });
  });

  // ============================================================================
  // QUALITY GATE RESULTS
  // ============================================================================

  describe('quality gate results', () => {
    it('should generate passed quality gates for reports without critical findings', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [{ type: 'INFO', severity: 'LOW', message: 'Minor suggestion' }],
        recommendations: [],
        blockers: [],
        nextSteps: [],
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        requiredQualityGates: ['G1_ARCHITECTURE', 'G2_TESTING'],
      });

      const result = await client.executeAgent({ directive });

      expect(result.qualityGateResults).toHaveLength(2);
      expect(result.qualityGateResults[0].status).toBe('PASSED');
      expect(result.qualityGateResults[1].status).toBe('PASSED');
    });

    it('should generate failed quality gates for reports with critical findings', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [{ type: 'ERROR', severity: 'CRITICAL', message: 'Security vulnerability' }],
        recommendations: [],
        blockers: [],
        nextSteps: [],
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        requiredQualityGates: ['G3_SECURITY'],
      });

      const result = await client.executeAgent({ directive });

      expect(result.qualityGateResults).toHaveLength(1);
      expect(result.qualityGateResults[0].status).toBe('FAILED');
      expect(result.qualityGateResults[0].notes).toContain('critical/high severity');
    });

    it('should generate failed quality gates for reports with high severity findings', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [{ type: 'WARNING', severity: 'HIGH', message: 'Important issue' }],
        recommendations: [],
        blockers: [],
        nextSteps: [],
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        requiredQualityGates: ['G1_ARCHITECTURE'],
      });

      const result = await client.executeAgent({ directive });

      expect(result.qualityGateResults[0].status).toBe('FAILED');
    });

    it('should handle empty quality gates array', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({ requiredQualityGates: [] });

      const result = await client.executeAgent({ directive });

      expect(result.qualityGateResults).toHaveLength(0);
    });

    it('should include gate metadata in results', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        target: 'QA',
        requiredQualityGates: ['G2_TESTING'],
      });

      const result = await client.executeAgent({ directive });

      expect(result.qualityGateResults[0].gate).toBe('G2_TESTING');
      expect(result.qualityGateResults[0].checkedBy).toBe('QA');
      expect(result.qualityGateResults[0].checkedAt).toBeDefined();
    });
  });

  // ============================================================================
  // API CALL BEHAVIOR
  // ============================================================================

  describe('API call behavior', () => {
    it('should include correct headers in API call', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'my-secret-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['x-api-key']).toBe('my-secret-key');
      expect(options.headers['anthropic-version']).toBe('2023-06-01');
    });

    it('should include model configuration in API call', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({
        apiKey: 'test-key',
        model: 'claude-opus-4-20250514',
        maxTokens: 16384,
        temperature: 0.5,
      });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('claude-opus-4-20250514');
      expect(body.max_tokens).toBe(16384);
      expect(body.temperature).toBe(0.5);
    });

    it('should format user message correctly', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        task: 'Specific task description',
        description: 'Detailed explanation',
        constraints: ['Constraint A', 'Constraint B'],
        requiredQualityGates: ['G1', 'G2'],
        priority: 'CRITICAL',
      });

      await client.executeAgent({ directive });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userContent = body.messages[0].content;
      expect(userContent).toContain('TASK: Specific task description');
      expect(userContent).toContain('DESCRIPTION: Detailed explanation');
      expect(userContent).toContain('- Constraint A');
      expect(userContent).toContain('- Constraint B');
      expect(userContent).toContain('- G1');
      expect(userContent).toContain('- G2');
      expect(userContent).toContain('PRIORITY: CRITICAL');
    });
  });

  // ============================================================================
  // FAILED REPORT GENERATION
  // ============================================================================

  describe('failed report generation', () => {
    it('should create detailed failed report with error message', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.status).toBe('FAILED');
      expect(result.report.findings[0].message).toBe('Connection refused');
      expect(result.report.findings[0].severity).toBe('CRITICAL');
      expect(result.report.blockers[0].description).toBe('Agent execution failed');
      expect(result.report.nextSteps).toContain('Investigate failure cause');
    });

    it('should handle non-Error thrown objects', async () => {
      const mockFetch = vi.fn().mockRejectedValue('String error');
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.status).toBe('FAILED');
      expect(result.report.findings[0].message).toBe('Unknown error occurred');
    });

    it('should preserve directive metadata in failed report', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Test error'));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        id: 'specific-id',
        sessionId: 'specific-session',
        target: 'SECURITY',
        task: 'Security audit',
      });

      const result = await client.executeAgent({ directive });

      expect(result.report.directiveId).toBe('specific-id');
      expect(result.report.sessionId).toBe('specific-session');
      expect(result.report.agent).toBe('SECURITY');
      expect(result.report.task).toBe('Security audit');
    });

    it('should set empty artifacts and zero metrics in failed report', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Test error'));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.artifacts.filesCreated).toEqual([]);
      expect(result.report.artifacts.filesModified).toEqual([]);
      expect(result.report.metrics.linesAdded).toBe(0);
      expect(result.report.metrics.filesChanged).toBe(0);
    });
  });

  // ============================================================================
  // FACTORY FUNCTION
  // ============================================================================

  describe('createClaudeAgentClient', () => {
    it('should create client instance', () => {
      const client = createClaudeAgentClient({ apiKey: 'test-key' });
      expect(client).toBeInstanceOf(ClaudeAgentClient);
    });

    it('should pass configuration to client', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = createClaudeAgentClient({
        apiKey: 'factory-key',
        model: 'claude-opus-4-20250514',
      });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('claude-opus-4-20250514');
    });

    it('should throw on invalid configuration', () => {
      expect(() => createClaudeAgentClient({ apiKey: '' })).toThrow();
    });
  });

  // ============================================================================
  // RETRY LOGIC
  // ============================================================================

  describe('retry logic', () => {
    it('should configure shouldRetry callback', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      expect(capturedShouldRetry).toBeDefined();
    });

    it('should retry on rate_limit errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const rateLimitError = new Error('rate_limit exceeded');
      expect(capturedShouldRetry!(rateLimitError)).toBe(true);
    });

    it('should retry on overloaded errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const overloadedError = new Error('Server overloaded');
      expect(capturedShouldRetry!(overloadedError)).toBe(true);
    });

    it('should retry on timeout errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const timeoutError = new Error('Request timeout');
      expect(capturedShouldRetry!(timeoutError)).toBe(true);
    });

    it('should retry on 502 errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const error502 = new Error('502 Bad Gateway');
      expect(capturedShouldRetry!(error502)).toBe(true);
    });

    it('should retry on 503 errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const error503 = new Error('503 Service Unavailable');
      expect(capturedShouldRetry!(error503)).toBe(true);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      const authError = new Error('Authentication failed');
      expect(capturedShouldRetry!(authError)).toBe(false);
    });

    it('should not retry on non-Error objects', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      expect(capturedShouldRetry!('string error')).toBe(false);
      expect(capturedShouldRetry!(null)).toBe(false);
      expect(capturedShouldRetry!(undefined)).toBe(false);
      expect(capturedShouldRetry!(123)).toBe(false);
      expect(capturedShouldRetry!({ message: 'object error' })).toBe(false);
    });

    it('should handle case-insensitive error messages', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      capturedShouldRetry = null;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      await client.executeAgent({ directive });

      expect(capturedShouldRetry!(new Error('RATE_LIMIT exceeded'))).toBe(true);
      expect(capturedShouldRetry!(new Error('Server OVERLOADED'))).toBe(true);
      expect(capturedShouldRetry!(new Error('TIMEOUT error'))).toBe(true);
    });
  });

  // ============================================================================
  // EXECUTION TIMING
  // ============================================================================

  describe('execution timing', () => {
    it('should track execution duration', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(createSuccessResponse()), 20);
        });
      });
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('should track duration even on failure', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 20);
        });
      });
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.durationMs).toBeGreaterThanOrEqual(10);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('edge cases', () => {
    it('should handle response with embedded JSON in text', async () => {
      const responseContent =
        'Here is my analysis:\n\n{"status": "COMPLETED", "findings": [{"type": "INFO", "severity": "LOW", "message": "All good"}], "recommendations": [], "blockers": [], "nextSteps": []}\n\nEnd of analysis.';
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.status).toBe('COMPLETED');
      expect(result.report.findings[0].message).toBe('All good');
    });

    it('should handle response with nested JSON objects', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [],
        recommendations: [],
        blockers: [],
        nextSteps: ['Step 1', 'Step 2', 'Step 3'],
        artifacts: {
          filesCreated: ['a.ts', 'b.ts'],
          filesModified: ['c.ts'],
          filesDeleted: ['old.ts'],
          testsAdded: ['test.ts'],
          migrationsAdded: ['migration.sql'],
        },
        metrics: {
          linesAdded: 100,
          linesRemoved: 50,
          filesChanged: 4,
          testCoverage: 95,
        },
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      expect(result.report.nextSteps).toEqual(['Step 1', 'Step 2', 'Step 3']);
      expect(result.report.artifacts.filesDeleted).toContain('old.ts');
    });

    it('should handle directive with empty constraints', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({ constraints: [] });

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(true);
    });

    it('should handle directive with empty dependencies', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({ dependencies: [] });

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(true);
    });

    it('should handle progress callback that throws', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();
      const throwingCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      // Should not throw, just log the error
      const result = await client.executeAgent({ directive }, throwingCallback);

      // The callback error may cause execution to fail
      expect(result).toBeDefined();
    });

    it('should handle very long task descriptions', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const longDescription = 'A'.repeat(10000);
      const directive = createValidDirective({
        task: 'Long task',
        description: longDescription,
      });

      const result = await client.executeAgent({ directive });

      expect(result).toBeDefined();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain(longDescription);
    });

    it('should handle special characters in directive fields', async () => {
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse());
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        task: 'Task with "quotes" and \'apostrophes\'',
        description: 'Description with\nnewlines\tand\ttabs',
        constraints: ['Constraint with <html> & special chars'],
      });

      const result = await client.executeAgent({ directive });

      expect(result.success).toBe(true);
    });

    it('should use fallback values when parsed response has undefined fields', async () => {
      // Response with minimal fields - status, findings, recommendations, blockers, nextSteps are all missing
      const responseContent = JSON.stringify({});
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      // Should use fallback values
      expect(result.report.status).toBe('COMPLETED');
      expect(result.report.findings).toEqual([]);
      expect(result.report.recommendations).toEqual([]);
      expect(result.report.blockers).toEqual([]);
      expect(result.report.nextSteps).toEqual([]);
    });

    it('should handle response with null values for arrays', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: null,
        recommendations: null,
        blockers: null,
        nextSteps: null,
        artifacts: null,
        metrics: null,
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      // Should use fallback values for nulls
      expect(result.report.artifacts.filesCreated).toEqual([]);
      expect(result.report.metrics.linesAdded).toBe(0);
    });

    it('should handle report with undefined durationMs in quality gate generation', async () => {
      // A response that will create a report without explicit durationMs
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [],
        recommendations: [],
        blockers: [],
        nextSteps: [],
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective({
        requiredQualityGates: ['G1_TEST'],
      });

      const result = await client.executeAgent({ directive });

      // Quality gate should have durationMs set (either from report or fallback to 0)
      expect(result.qualityGateResults[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should generate unique IDs for findings, recommendations, and blockers', async () => {
      const responseContent = JSON.stringify({
        status: 'COMPLETED',
        findings: [
          { type: 'INFO', severity: 'LOW', message: 'Finding 1' },
          { type: 'INFO', severity: 'LOW', message: 'Finding 2' },
        ],
        recommendations: [
          { priority: 'LOW', action: 'Action 1', reason: 'Reason 1', category: 'OPTIONAL' },
          { priority: 'LOW', action: 'Action 2', reason: 'Reason 2', category: 'OPTIONAL' },
        ],
        blockers: [
          { type: 'TECHNICAL', severity: 'LOW', description: 'Blocker 1', requiredAction: 'Fix 1' },
          { type: 'TECHNICAL', severity: 'LOW', description: 'Blocker 2', requiredAction: 'Fix 2' },
        ],
        nextSteps: [],
      });
      const mockFetch = vi.fn().mockResolvedValue(createSuccessResponse(responseContent));
      global.fetch = mockFetch;

      const client = new ClaudeAgentClient({ apiKey: 'test-key' });
      const directive = createValidDirective();

      const result = await client.executeAgent({ directive });

      const findingIds = result.report.findings.map((f) => f.id);
      const recommendationIds = result.report.recommendations.map((r) => r.id);
      const blockerIds = result.report.blockers.map((b) => b.id);

      expect(new Set(findingIds).size).toBe(2);
      expect(new Set(recommendationIds).size).toBe(2);
      expect(new Set(blockerIds).size).toBe(2);
    });
  });
});
