'use server';

/**
 * Server Actions for Queue Management Dashboard
 *
 * Provides real-time queue data for the supervisor queue management UI.
 * Data is fetched from the supervisor API endpoints.
 */

import type { QueueSLAStatus, QueueSLAConfig, SLABreachEvent } from '@medicalcor/types';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Queue summary statistics for dashboard overview
 */
export interface QueueSummary {
  totalQueues: number;
  compliantQueues: number;
  warningQueues: number;
  criticalQueues: number;
  totalCallsInQueue: number;
  totalAvailableAgents: number;
  totalBusyAgents: number;
  averageServiceLevel: number;
  activeBreaches: number;
}

/**
 * Get all queue statuses
 */
export async function getQueueStatusesAction(): Promise<QueueSLAStatus[]> {
  try {
    const response = await fetch(`${API_URL}/supervisor/queues`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-supervisor-id': 'server-action',
      },
      next: { revalidate: 5 }, // Cache for 5 seconds for real-time updates
    });

    if (!response.ok) {
      console.error('Failed to fetch queue statuses:', response.status);
      return [];
    }

    const data = (await response.json()) as { queues: QueueSLAStatus[] };

    // Transform dates from JSON
    return data.queues.map((queue) => ({
      ...queue,
      lastUpdated: new Date(queue.lastUpdated),
    }));
  } catch (error) {
    console.error('Error fetching queue statuses:', error);
    return [];
  }
}

/**
 * Get summary of all queues
 */
export async function getQueueSummaryAction(): Promise<QueueSummary> {
  try {
    const response = await fetch(`${API_URL}/supervisor/queues/summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-supervisor-id': 'server-action',
      },
      next: { revalidate: 10 },
    });

    if (!response.ok) {
      console.error('Failed to fetch queue summary:', response.status);
      return getDefaultSummary();
    }

    const data = (await response.json()) as { summary: QueueSummary };
    return data.summary;
  } catch (error) {
    console.error('Error fetching queue summary:', error);
    return getDefaultSummary();
  }
}

function getDefaultSummary(): QueueSummary {
  return {
    totalQueues: 0,
    compliantQueues: 0,
    warningQueues: 0,
    criticalQueues: 0,
    totalCallsInQueue: 0,
    totalAvailableAgents: 0,
    totalBusyAgents: 0,
    averageServiceLevel: 100,
    activeBreaches: 0,
  };
}

/**
 * Get specific queue details with SLA status
 */
export async function getQueueDetailAction(
  queueSid: string
): Promise<{ status: QueueSLAStatus | null; config: QueueSLAConfig | null }> {
  try {
    const response = await fetch(`${API_URL}/supervisor/queues/${encodeURIComponent(queueSid)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-supervisor-id': 'server-action',
      },
      next: { revalidate: 5 },
    });

    if (!response.ok) {
      console.error('Failed to fetch queue detail:', response.status);
      return { status: null, config: null };
    }

    const data = (await response.json()) as { status: QueueSLAStatus; config: QueueSLAConfig };
    return {
      status: {
        ...data.status,
        lastUpdated: new Date(data.status.lastUpdated),
      },
      config: data.config,
    };
  } catch (error) {
    console.error('Error fetching queue detail:', error);
    return { status: null, config: null };
  }
}

/**
 * Get SLA breaches for a queue
 */
export async function getQueueBreachesAction(
  queueSid: string,
  startTime?: Date,
  endTime?: Date
): Promise<SLABreachEvent[]> {
  try {
    const params = new URLSearchParams();
    if (startTime) params.append('startTime', startTime.toISOString());
    if (endTime) params.append('endTime', endTime.toISOString());

    const url = `${API_URL}/supervisor/queues/${encodeURIComponent(queueSid)}/breaches?${params}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-supervisor-id': 'server-action',
      },
      next: { revalidate: 30 }, // Breaches don't need real-time updates
    });

    if (!response.ok) {
      console.error('Failed to fetch queue breaches:', response.status);
      return [];
    }

    const data = (await response.json()) as { breaches: SLABreachEvent[] };

    // Transform dates from JSON
    return data.breaches.map((breach) => ({
      ...breach,
      detectedAt: new Date(breach.detectedAt),
      resolvedAt: breach.resolvedAt ? new Date(breach.resolvedAt) : undefined,
    }));
  } catch (error) {
    console.error('Error fetching queue breaches:', error);
    return [];
  }
}

/**
 * Update SLA configuration for a queue
 */
export async function updateQueueConfigAction(
  queueSid: string,
  config: Partial<QueueSLAConfig>
): Promise<{ success: boolean; config?: QueueSLAConfig; error?: string }> {
  try {
    const response = await fetch(
      `${API_URL}/supervisor/queues/${encodeURIComponent(queueSid)}/config`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-supervisor-id': 'server-action',
        },
        body: JSON.stringify(config),
      }
    );

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: string };
      return { success: false, error: errorData.error ?? 'Failed to update configuration' };
    }

    const data = (await response.json()) as { config: QueueSLAConfig };
    return { success: true, config: data.config };
  } catch (error) {
    console.error('Error updating queue config:', error);
    return { success: false, error: 'Failed to update configuration' };
  }
}

/**
 * Get breach type label for display
 */
export function getBreachTypeLabel(breachType: string): string {
  switch (breachType) {
    case 'wait_time_exceeded':
      return 'Wait Time Exceeded';
    case 'queue_size_exceeded':
      return 'Queue Size Exceeded';
    case 'abandon_rate_exceeded':
      return 'Abandon Rate High';
    case 'agent_availability_low':
      return 'Low Agent Availability';
    case 'service_level_missed':
      return 'Service Level Missed';
    default:
      return breachType;
  }
}

/**
 * Get severity color class for Tailwind
 */
export function getSeverityColorClass(severity: 'ok' | 'warning' | 'critical'): string {
  switch (severity) {
    case 'ok':
      return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    case 'warning':
      return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'critical':
      return 'text-red-600 bg-red-50 border-red-200';
    default:
      return 'text-muted-foreground bg-muted border-muted';
  }
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
