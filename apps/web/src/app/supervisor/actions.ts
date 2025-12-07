'use server';

/**
 * Server Actions for Supervisor Dashboard
 *
 * Provides real-time data for the mobile supervisor dashboard.
 * Data is fetched from the supervisor API endpoints.
 */

import type { SupervisorDashboardStats, MonitoredCall, FlexWorker } from '@medicalcor/types';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Get supervisor dashboard statistics
 */
export async function getSupervisorStatsAction(): Promise<SupervisorDashboardStats> {
  try {
    const response = await fetch(`${API_URL}/supervisor/dashboard`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-supervisor-id': 'server-action',
      },
      next: { revalidate: 10 }, // Cache for 10 seconds
    });

    if (!response.ok) {
      console.error('Failed to fetch supervisor stats:', response.status);
      return getDefaultStats();
    }

    const data = (await response.json()) as { stats: SupervisorDashboardStats };
    return data.stats;
  } catch (error) {
    console.error('Error fetching supervisor stats:', error);
    return getDefaultStats();
  }
}

function getDefaultStats(): SupervisorDashboardStats {
  return {
    activeCalls: 0,
    callsInQueue: 0,
    averageWaitTime: 0,

    agentsAvailable: 0,
    agentsBusy: 0,
    agentsOnBreak: 0,
    agentsOffline: 0,

    aiHandledCalls: 0,
    aiHandoffRate: 0,
    averageAiConfidence: 0,

    activeAlerts: 0,
    escalationsToday: 0,
    handoffsToday: 0,

    callsHandledToday: 0,
    averageHandleTime: 0,
    serviceLevelPercent: 100,
    abandonedCalls: 0,
    customerSatisfaction: 0,

    lastUpdated: new Date(),
  };
}

/**
 * Get active calls for monitoring
 */
export async function getActiveCallsAction(): Promise<MonitoredCall[]> {
  try {
    const response = await fetch(`${API_URL}/supervisor/calls`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-supervisor-id': 'server-action',
      },
      next: { revalidate: 5 }, // Cache for 5 seconds
    });

    if (!response.ok) {
      console.error('Failed to fetch active calls:', response.status);
      return [];
    }

    const data = (await response.json()) as { calls: MonitoredCall[] };

    // Transform dates from JSON and ensure arrays are initialized
    return data.calls.map((call) => {
      // API response might have undefined arrays, so we normalize them
      const transcript = call.recentTranscript as typeof call.recentTranscript | undefined;
      const callFlags = call.flags as typeof call.flags | undefined;
      return {
        ...call,
        startedAt: new Date(call.startedAt),
        recentTranscript: transcript ?? [],
        flags: callFlags ?? [],
      };
    });
  } catch (error) {
    console.error('Error fetching active calls:', error);
    return [];
  }
}

/**
 * Get agent statuses
 *
 * Note: In production, this would integrate with Twilio Flex Insights API
 * to get real-time agent status. For now, we derive agent info from active calls.
 */
export async function getAgentStatusesAction(): Promise<FlexWorker[]> {
  try {
    // Get active calls to derive agent status
    const callsResponse = await fetch(`${API_URL}/supervisor/calls`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-supervisor-id': 'server-action',
      },
      next: { revalidate: 10 },
    });

    if (!callsResponse.ok) {
      console.error('Failed to fetch calls for agent status:', callsResponse.status);
      return [];
    }

    const callsData = (await callsResponse.json()) as { calls: MonitoredCall[] };

    // Build agent status from active calls
    const agentMap = new Map<string, FlexWorker>();

    for (const call of callsData.calls) {
      if (call.agentId && call.agentName) {
        agentMap.set(call.agentId, {
          workerSid: call.agentId,
          friendlyName: call.agentName,
          activityName: 'busy',
          available: false,
          skills: ['dental'],
          languages: ['ro'],
          currentCallSid: call.callSid,
          tasksInProgress: 1,
        });
      }
    }

    return Array.from(agentMap.values());
  } catch (error) {
    console.error('Error fetching agent statuses:', error);
    return [];
  }
}

export interface SupervisorAlert {
  id: string;
  type: 'escalation' | 'long-hold' | 'silence' | 'high-value' | 'ai-handoff';
  severity: 'info' | 'warning' | 'critical';
  callSid?: string;
  agentName?: string;
  message: string;
  timestamp: Date;
}

/**
 * Get recent alerts for supervisor
 *
 * Alerts are derived from flagged calls and escalation history.
 * Real-time alerts come via SSE in the client.
 */
export async function getAlertsAction(): Promise<SupervisorAlert[]> {
  try {
    // Get flagged calls to derive alerts
    const callsResponse = await fetch(`${API_URL}/supervisor/calls`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-supervisor-id': 'server-action',
      },
      next: { revalidate: 5 },
    });

    if (!callsResponse.ok) {
      console.error('Failed to fetch calls for alerts:', callsResponse.status);
      return [];
    }

    const callsData = (await callsResponse.json()) as { calls: MonitoredCall[] };
    const alerts: SupervisorAlert[] = [];

    // Generate alerts from flagged calls
    for (const call of callsData.calls) {
      // API response might have undefined flags array
      const flags = (call.flags as typeof call.flags | undefined) ?? [];
      for (const flag of flags) {
        const alertType = mapFlagToAlertType(flag);
        const severity = mapFlagToSeverity(flag);
        const startedAt = call.startedAt as Date | string | undefined;

        alerts.push({
          id: `${call.callSid}-${flag}`,
          type: alertType,
          severity,
          callSid: call.callSid,
          agentName: call.agentName,
          message: getAlertMessage(flag, call),
          timestamp: startedAt ? new Date(startedAt) : new Date(),
        });
      }
    }

    // Sort by severity (critical first) then by timestamp (newest first)
    return alerts.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return [];
  }
}

function mapFlagToAlertType(flag: string): SupervisorAlert['type'] {
  switch (flag) {
    case 'escalation-requested':
      return 'escalation';
    case 'long-hold':
      return 'long-hold';
    case 'silence-detected':
      return 'silence';
    case 'high-value-lead':
      return 'high-value';
    case 'ai-handoff-needed':
      return 'ai-handoff';
    default:
      return 'escalation';
  }
}

function mapFlagToSeverity(flag: string): SupervisorAlert['severity'] {
  switch (flag) {
    case 'escalation-requested':
    case 'complaint':
      return 'critical';
    case 'long-hold':
    case 'ai-handoff-needed':
      return 'warning';
    default:
      return 'info';
  }
}

function getAlertMessage(flag: string, call: MonitoredCall): string {
  switch (flag) {
    case 'escalation-requested':
      return 'Solicitare de escaladare de la client';
    case 'long-hold':
      return `Client în așteptare de ${Math.round(call.duration / 60)} minute`;
    case 'silence-detected':
      return 'Tăcere prelungită detectată în apel';
    case 'high-value-lead':
      return 'Lead cu potențial ridicat identificat';
    case 'ai-handoff-needed':
      return 'AI solicită transfer către agent uman';
    case 'complaint':
      return 'Reclamație detectată în conversație';
    default:
      return 'Alertă activă';
  }
}
