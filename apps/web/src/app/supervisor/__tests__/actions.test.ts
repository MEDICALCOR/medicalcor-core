/**
 * Supervisor Actions Branch Coverage Tests
 * Targets all branches for 85% HIPAA/GDPR coverage threshold
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSupervisorStatsAction,
  getActiveCallsAction,
  getAgentStatusesAction,
  getAlertsAction,
} from '../actions.js';

// =============================================================================
// Mock Setup
// =============================================================================

// Wrapper to convert simple mock objects to proper Response-like objects
function wrapMockResponse(mockResult: {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}) {
  const ok = mockResult.ok ?? true;
  const status = mockResult.status ?? (ok ? 200 : 500);

  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: mockResult.json ?? (async () => ({})),
    text: async () => '{}',
    clone: function () {
      return wrapMockResponse(mockResult);
    },
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(['{}'], { type: 'application/json' }),
    formData: async () => new FormData(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
  };
}

// Create a fetch mock that wraps responses properly
const mockFetch = vi.fn().mockImplementation(async () => {
  throw new Error('Mock not configured');
});

// Store original fetch and override
const originalFetch = globalThis.fetch;

// Console mocks - must be set up in beforeEach to survive restoreAllMocks
let consoleMocks: { error: ReturnType<typeof vi.spyOn> };

beforeEach(() => {
  vi.clearAllMocks();

  // Set up console mock
  consoleMocks = {
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };

  // Create wrapper that auto-converts mock responses
  const wrappedMockFetch = vi.fn().mockImplementation(async (...args: Parameters<typeof fetch>) => {
    const result = await mockFetch(...args);
    // If result already has clone method, return as-is; otherwise wrap it
    if (result && typeof result.clone === 'function') {
      return result;
    }
    return wrapMockResponse(result);
  });
  globalThis.fetch = wrappedMockFetch as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// =============================================================================
// Test Data
// =============================================================================

function createMockStats() {
  return {
    stats: {
      activeCalls: 5,
      callsInQueue: 3,
      averageWaitTime: 120,
      agentsAvailable: 10,
      agentsBusy: 5,
      agentsOnBreak: 2,
      agentsOffline: 3,
      aiHandledCalls: 100,
      aiHandoffRate: 15,
      averageAiConfidence: 85,
      activeAlerts: 2,
      escalationsToday: 5,
      handoffsToday: 10,
      callsHandledToday: 150,
      averageHandleTime: 180,
      serviceLevelPercent: 95,
      abandonedCalls: 3,
      customerSatisfaction: 4.5,
      agentsInWrapUp: 2,
      wrapUpsToday: 50,
      averageWrapUpTime: 30,
      lastUpdated: new Date().toISOString(),
    },
  };
}

function createMockCalls() {
  return {
    calls: [
      {
        callSid: 'CA123',
        agentId: 'agent-1',
        agentName: 'Ana M.',
        customerPhone: '+40712345678',
        direction: 'inbound',
        status: 'in-progress',
        duration: 300,
        startedAt: '2024-01-15T10:00:00Z',
        recentTranscript: [{ role: 'agent', text: 'Hello' }],
        flags: ['high-value-lead'],
        aiConfidence: 90,
      },
      {
        callSid: 'CA456',
        agentId: 'agent-2',
        agentName: 'Ion P.',
        customerPhone: '+40723456789',
        direction: 'outbound',
        status: 'ringing',
        duration: 60,
        startedAt: '2024-01-15T10:05:00Z',
        // Intentionally missing recentTranscript and flags
      },
    ],
  };
}

// =============================================================================
// getSupervisorStatsAction Tests
// =============================================================================

describe('getSupervisorStatsAction', () => {
  it('should return stats when fetch succeeds', async () => {
    const mockStats = createMockStats();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStats,
    });

    const result = await getSupervisorStatsAction();

    expect(result.activeCalls).toBe(5);
    expect(result.callsInQueue).toBe(3);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/supervisor/dashboard'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-supervisor-id': 'server-action',
        }),
      })
    );
  });

  it('should return default stats when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await getSupervisorStatsAction();

    expect(result.activeCalls).toBe(0);
    expect(result.callsInQueue).toBe(0);
    expect(result.serviceLevelPercent).toBe(100);
    expect(consoleMocks.error).toHaveBeenCalledWith('Failed to fetch supervisor stats:', 500);
  });

  it('should return default stats when fetch throws error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await getSupervisorStatsAction();

    expect(result.activeCalls).toBe(0);
    expect(result.agentsAvailable).toBe(0);
    expect(consoleMocks.error).toHaveBeenCalledWith(
      'Error fetching supervisor stats:',
      expect.any(Error)
    );
  });

  it('should include lastUpdated as Date in default stats', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Error'));

    const result = await getSupervisorStatsAction();

    expect(result.lastUpdated).toBeInstanceOf(Date);
  });
});

// =============================================================================
// getActiveCallsAction Tests
// =============================================================================

describe('getActiveCallsAction', () => {
  it('should return transformed calls when fetch succeeds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockCalls(),
    });

    const result = await getActiveCallsAction();

    expect(result).toHaveLength(2);
    expect(result[0]?.callSid).toBe('CA123');
    expect(result[0]?.startedAt).toBeInstanceOf(Date);
    expect(result[0]?.recentTranscript).toHaveLength(1);
    expect(result[0]?.flags).toContain('high-value-lead');
  });

  it('should return empty array when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await getActiveCallsAction();

    expect(result).toEqual([]);
    expect(consoleMocks.error).toHaveBeenCalledWith('Failed to fetch active calls:', 404);
  });

  it('should return empty array when fetch throws error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await getActiveCallsAction();

    expect(result).toEqual([]);
    expect(consoleMocks.error).toHaveBeenCalledWith(
      'Error fetching active calls:',
      expect.any(Error)
    );
  });

  it('should handle undefined recentTranscript in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA789',
            agentId: 'agent-1',
            agentName: 'Test',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            recentTranscript: undefined,
            flags: ['test'],
          },
        ],
      }),
    });

    const result = await getActiveCallsAction();

    expect(result[0]?.recentTranscript).toEqual([]);
  });

  it('should handle undefined flags in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA789',
            agentId: 'agent-1',
            agentName: 'Test',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            recentTranscript: [],
            flags: undefined,
          },
        ],
      }),
    });

    const result = await getActiveCallsAction();

    expect(result[0]?.flags).toEqual([]);
  });

  it('should transform startedAt string to Date', async () => {
    const isoDate = '2024-01-15T12:30:45.000Z';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-date',
            agentId: 'agent-1',
            agentName: 'Test',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: isoDate,
            recentTranscript: [],
            flags: [],
          },
        ],
      }),
    });

    const result = await getActiveCallsAction();

    expect(result[0]?.startedAt).toBeInstanceOf(Date);
    expect(result[0]?.startedAt.toISOString()).toBe(isoDate);
  });
});

// =============================================================================
// getAgentStatusesAction Tests
// =============================================================================

describe('getAgentStatusesAction', () => {
  it('should return agent statuses derived from calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createMockCalls(),
    });

    const result = await getAgentStatusesAction();

    expect(result).toHaveLength(2);
    expect(result[0]?.workerSid).toBe('agent-1');
    expect(result[0]?.friendlyName).toBe('Ana M.');
    expect(result[0]?.activityName).toBe('busy');
    expect(result[0]?.available).toBe(false);
    expect(result[0]?.currentCallSid).toBe('CA123');
    expect(result[0]?.tasksInProgress).toBe(1);
  });

  it('should return empty array when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const result = await getAgentStatusesAction();

    expect(result).toEqual([]);
    expect(consoleMocks.error).toHaveBeenCalledWith('Failed to fetch calls for agent status:', 503);
  });

  it('should return empty array when fetch throws error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Timeout'));

    const result = await getAgentStatusesAction();

    expect(result).toEqual([]);
    expect(consoleMocks.error).toHaveBeenCalledWith(
      'Error fetching agent statuses:',
      expect.any(Error)
    );
  });

  it('should skip calls without agentId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-no-agent',
            agentId: undefined,
            agentName: 'Test',
            direction: 'inbound',
            status: 'queued',
            duration: 0,
            startedAt: '2024-01-15T10:00:00Z',
          },
        ],
      }),
    });

    const result = await getAgentStatusesAction();

    expect(result).toHaveLength(0);
  });

  it('should skip calls without agentName', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-no-name',
            agentId: 'agent-1',
            agentName: undefined,
            direction: 'inbound',
            status: 'queued',
            duration: 0,
            startedAt: '2024-01-15T10:00:00Z',
          },
        ],
      }),
    });

    const result = await getAgentStatusesAction();

    expect(result).toHaveLength(0);
  });

  it('should deduplicate agents by agentId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentId: 'agent-1',
            agentName: 'Ana M.',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
          },
          {
            callSid: 'CA-2',
            agentId: 'agent-1', // Same agent
            agentName: 'Ana M.',
            direction: 'outbound',
            status: 'wrap-up',
            duration: 200,
            startedAt: '2024-01-15T10:05:00Z',
          },
        ],
      }),
    });

    const result = await getAgentStatusesAction();

    expect(result).toHaveLength(1);
    // Last call wins due to Map.set
    expect(result[0]?.currentCallSid).toBe('CA-2');
  });

  it('should set default skills and languages', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-skills',
            agentId: 'agent-1',
            agentName: 'Test Agent',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
          },
        ],
      }),
    });

    const result = await getAgentStatusesAction();

    expect(result[0]?.skills).toEqual(['dental']);
    expect(result[0]?.languages).toEqual(['ro']);
  });
});

// =============================================================================
// getAlertsAction Tests
// =============================================================================

describe('getAlertsAction', () => {
  it('should return alerts from flagged calls', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-alert',
            agentId: 'agent-1',
            agentName: 'Ana M.',
            direction: 'inbound',
            status: 'in-progress',
            duration: 600,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['escalation-requested', 'high-value-lead'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();

    expect(result).toHaveLength(2);
    // Sorted by severity (critical first)
    expect(result[0]?.type).toBe('escalation');
    expect(result[0]?.severity).toBe('critical');
    expect(result[1]?.type).toBe('high-value');
    expect(result[1]?.severity).toBe('info');
  });

  it('should return empty array when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await getAlertsAction();

    expect(result).toEqual([]);
    expect(consoleMocks.error).toHaveBeenCalledWith('Failed to fetch calls for alerts:', 500);
  });

  it('should return empty array when fetch throws error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await getAlertsAction();

    expect(result).toEqual([]);
    expect(consoleMocks.error).toHaveBeenCalledWith('Error fetching alerts:', expect.any(Error));
  });

  it('should handle undefined flags array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-no-flags',
            agentId: 'agent-1',
            agentName: 'Test',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: undefined,
          },
        ],
      }),
    });

    const result = await getAlertsAction();

    expect(result).toEqual([]);
  });

  it('should handle empty flags array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-empty-flags',
            agentId: 'agent-1',
            agentName: 'Test',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: [],
          },
        ],
      }),
    });

    const result = await getAlertsAction();

    expect(result).toEqual([]);
  });

  it('should use current date when startedAt is undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-no-date',
            agentId: 'agent-1',
            agentName: 'Test',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: undefined,
            flags: ['escalation-requested'],
          },
        ],
      }),
    });

    const before = new Date();
    const result = await getAlertsAction();
    const after = new Date();

    expect(result[0]?.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result[0]?.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should sort alerts by severity then timestamp', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentId: 'agent-1',
            agentName: 'A',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z', // Earlier
            flags: ['high-value-lead'], // info
          },
          {
            callSid: 'CA-2',
            agentId: 'agent-2',
            agentName: 'B',
            direction: 'inbound',
            status: 'in-progress',
            duration: 200,
            startedAt: '2024-01-15T10:05:00Z', // Later
            flags: ['long-hold'], // warning
          },
          {
            callSid: 'CA-3',
            agentId: 'agent-3',
            agentName: 'C',
            direction: 'inbound',
            status: 'in-progress',
            duration: 300,
            startedAt: '2024-01-15T10:02:00Z',
            flags: ['complaint'], // critical
          },
        ],
      }),
    });

    const result = await getAlertsAction();

    expect(result).toHaveLength(3);
    // Critical first
    expect(result[0]?.severity).toBe('critical');
    // Warning second
    expect(result[1]?.severity).toBe('warning');
    // Info last
    expect(result[2]?.severity).toBe('info');
  });

  it('should sort by timestamp when severity is equal', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-older',
            agentId: 'agent-1',
            agentName: 'A',
            direction: 'inbound',
            status: 'in-progress',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z', // Earlier
            flags: ['high-value-lead'],
          },
          {
            callSid: 'CA-newer',
            agentId: 'agent-2',
            agentName: 'B',
            direction: 'inbound',
            status: 'in-progress',
            duration: 200,
            startedAt: '2024-01-15T10:30:00Z', // Later
            flags: ['silence-detected'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();

    // Both are 'info' severity, newer first
    expect(result[0]?.callSid).toBe('CA-newer');
    expect(result[1]?.callSid).toBe('CA-older');
  });
});

// =============================================================================
// mapFlagToAlertType Branch Coverage
// =============================================================================

describe('mapFlagToAlertType - all cases', () => {
  it('should map escalation-requested to escalation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['escalation-requested'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.type).toBe('escalation');
  });

  it('should map long-hold to long-hold', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['long-hold'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.type).toBe('long-hold');
  });

  it('should map silence-detected to silence', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['silence-detected'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.type).toBe('silence');
  });

  it('should map high-value-lead to high-value', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['high-value-lead'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.type).toBe('high-value');
  });

  it('should map ai-handoff-needed to ai-handoff', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['ai-handoff-needed'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.type).toBe('ai-handoff');
  });

  it('should map unknown flag to escalation (default)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['unknown-flag'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.type).toBe('escalation');
  });
});

// =============================================================================
// mapFlagToSeverity Branch Coverage
// =============================================================================

describe('mapFlagToSeverity - all cases', () => {
  it('should map escalation-requested to critical', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['escalation-requested'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.severity).toBe('critical');
  });

  it('should map complaint to critical', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['complaint'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.severity).toBe('critical');
  });

  it('should map long-hold to warning', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['long-hold'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.severity).toBe('warning');
  });

  it('should map ai-handoff-needed to warning', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['ai-handoff-needed'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.severity).toBe('warning');
  });

  it('should map unknown flags to info (default)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['high-value-lead'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.severity).toBe('info');
  });
});

// =============================================================================
// getAlertMessage Branch Coverage
// =============================================================================

describe('getAlertMessage - all cases', () => {
  it('should return correct message for escalation-requested', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['escalation-requested'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.message).toBe('Solicitare de escaladare de la client');
  });

  it('should return correct message for long-hold with duration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 300, // 5 minutes
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['long-hold'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.message).toBe('Client în așteptare de 5 minute');
  });

  it('should return correct message for silence-detected', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['silence-detected'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.message).toBe('Tăcere prelungită detectată în apel');
  });

  it('should return correct message for high-value-lead', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['high-value-lead'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.message).toBe('Lead cu potențial ridicat identificat');
  });

  it('should return correct message for ai-handoff-needed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['ai-handoff-needed'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.message).toBe('AI solicită transfer către agent uman');
  });

  it('should return correct message for complaint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['complaint'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.message).toBe('Reclamație detectată în conversație');
  });

  it('should return default message for unknown flags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        calls: [
          {
            callSid: 'CA-1',
            agentName: 'Test',
            duration: 100,
            startedAt: '2024-01-15T10:00:00Z',
            flags: ['some-unknown-flag'],
          },
        ],
      }),
    });

    const result = await getAlertsAction();
    expect(result[0]?.message).toBe('Alertă activă');
  });
});
