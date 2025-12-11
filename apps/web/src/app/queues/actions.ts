'use server';

import { createClient } from '@supabase/supabase-js';
import type { QueueSLAStatus } from '@medicalcor/types';

// Re-export for components
export interface SLABreachEvent {
  eventId: string;
  queueSid: string;
  queueName: string;
  breachType: 'wait_time' | 'service_level' | 'abandon_rate';
  threshold: number;
  currentValue: number;
  detectedAt: Date;
  severity: 'warning' | 'critical';
  escalated: boolean;
  resolvedAt?: Date;
  affectedCalls?: number;
  durationSeconds?: number;
  alertSent?: boolean;
}

/**
 * Server actions for the Queue SLA Dashboard
 * Fetches real-time queue status, breaches, and reports from the database
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase credentials not configured');
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// =============================================================================
// Types
// =============================================================================

/** Database row shape for SLA breach records */
interface SLABreachRow {
  id: string;
  queue_sid: string;
  queue_name: string;
  breach_type: 'wait_time' | 'service_level' | 'abandon_rate';
  severity: 'warning' | 'critical';
  threshold_value: number;
  current_value: number;
  affected_calls?: number;
  detected_at: string;
  resolved_at?: string;
  duration_seconds?: number;
  alert_sent?: boolean;
  escalated: boolean;
}

export interface QueueDashboardStats {
  totalQueues: number;
  activeQueues: number;
  totalAgents: number;
  availableAgents: number;
  busyAgents: number;
  totalCallsToday: number;
  averageWaitTime: number;
  serviceLevel: number;
  breachesLast24h: number;
  criticalBreaches: number;
  complianceRate: number;
}

export interface QueueStatusWithAlerts extends QueueSLAStatus {
  alertCount: number;
  lastBreachAt?: Date;
}

export interface BreachSummary {
  breachType: string;
  count: number;
  criticalCount: number;
  lastOccurred: Date;
}

export interface DailyBreachStats {
  date: string;
  totalBreaches: number;
  criticalBreaches: number;
  warningBreaches: number;
  resolvedBreaches: number;
}

// =============================================================================
// Actions
// =============================================================================

/**
 * Get overall dashboard statistics
 */
export async function getQueueDashboardStatsAction(): Promise<QueueDashboardStats> {
  try {
    const supabase = getSupabaseClient();

    // Get current queue status data
    const { data: queueStatuses, error: statusError } = await supabase
      .from('queue_sla_status')
      .select('*');

    if (statusError) {
      throw new Error(`Failed to fetch queue statuses: ${statusError.message}`);
    }

    // Get breaches in the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentBreaches, error: breachError } = await supabase
      .from('queue_sla_breaches')
      .select('id, severity')
      .gte('detected_at', oneDayAgo);

    if (breachError) {
      throw new Error(`Failed to fetch breaches: ${breachError.message}`);
    }

    const statuses = queueStatuses as QueueSLAStatus[];
    const breaches = recentBreaches as { severity: string }[];

    // Calculate aggregate stats
    const totalQueues = statuses.length;
    const activeQueues = statuses.filter((q) => q.currentQueueSize > 0 || q.busyAgents > 0).length;
    const totalAgents = statuses.reduce((sum, q) => sum + q.totalAgents, 0);
    const availableAgents = statuses.reduce((sum, q) => sum + q.availableAgents, 0);
    const busyAgents = statuses.reduce((sum, q) => sum + q.busyAgents, 0);
    const totalCallsToday = statuses.reduce((sum, q) => sum + q.callsHandledToday, 0);

    const avgWaitTimes = statuses
      .filter((q) => q.averageWaitTime > 0)
      .map((q) => q.averageWaitTime);
    const averageWaitTime =
      avgWaitTimes.length > 0 ? avgWaitTimes.reduce((a, b) => a + b, 0) / avgWaitTimes.length : 0;

    const serviceLevels = statuses.filter((q) => q.serviceLevel > 0).map((q) => q.serviceLevel);
    const serviceLevel =
      serviceLevels.length > 0
        ? serviceLevels.reduce((a, b) => a + b, 0) / serviceLevels.length
        : 100;

    const compliantQueues = statuses.filter((q) => q.isCompliant).length;
    const complianceRate = totalQueues > 0 ? (compliantQueues / totalQueues) * 100 : 100;

    const breachesLast24h = breaches.length;
    const criticalBreaches = breaches.filter((b) => b.severity === 'critical').length;

    return {
      totalQueues,
      activeQueues,
      totalAgents,
      availableAgents,
      busyAgents,
      totalCallsToday,
      averageWaitTime: Math.round(averageWaitTime),
      serviceLevel: Math.round(serviceLevel * 10) / 10,
      breachesLast24h,
      criticalBreaches,
      complianceRate: Math.round(complianceRate * 10) / 10,
    };
  } catch (error) {
    console.error('Failed to get queue dashboard stats:', error);
    // Return default stats on error
    return {
      totalQueues: 0,
      activeQueues: 0,
      totalAgents: 0,
      availableAgents: 0,
      busyAgents: 0,
      totalCallsToday: 0,
      averageWaitTime: 0,
      serviceLevel: 100,
      breachesLast24h: 0,
      criticalBreaches: 0,
      complianceRate: 100,
    };
  }
}

/**
 * Get all queue statuses with alert counts
 */
export async function getQueueStatusesAction(): Promise<QueueStatusWithAlerts[]> {
  try {
    const supabase = getSupabaseClient();

    // Get current queue statuses
    const { data: queueStatuses, error: statusError } = await supabase
      .from('queue_sla_status')
      .select('*')
      .order('severity', { ascending: true });

    if (statusError) {
      throw new Error(`Failed to fetch queue statuses: ${statusError.message}`);
    }

    // Get recent breaches per queue for alert counts
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentBreaches, error: breachError } = await supabase
      .from('queue_sla_breaches')
      .select('queue_sid, detected_at')
      .gte('detected_at', oneDayAgo)
      .is('resolved_at', null);

    if (breachError) {
      throw new Error(`Failed to fetch breaches: ${breachError.message}`);
    }

    const statuses = queueStatuses as QueueSLAStatus[];
    const breaches = recentBreaches;

    // Build alert count map
    const alertCountMap = new Map<string, { count: number; lastAt: Date }>();
    for (const breach of breaches) {
      const existing = alertCountMap.get(breach.queue_sid);
      const breachDate = new Date(breach.detected_at);
      if (existing) {
        existing.count++;
        if (breachDate > existing.lastAt) {
          existing.lastAt = breachDate;
        }
      } else {
        alertCountMap.set(breach.queue_sid, { count: 1, lastAt: breachDate });
      }
    }

    return statuses.map((status) => {
      const alertInfo = alertCountMap.get(status.queueSid);
      return {
        ...status,
        alertCount: alertInfo?.count ?? 0,
        lastBreachAt: alertInfo?.lastAt,
      };
    });
  } catch (error) {
    console.error('Failed to get queue statuses:', error);
    return [];
  }
}

/**
 * Get recent SLA breaches
 */
export async function getRecentBreachesAction(limit = 50): Promise<SLABreachEvent[]> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('queue_sla_breaches')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch breaches: ${error.message}`);
    }

    // Transform to match SLABreachEvent type
    return (data as SLABreachRow[]).map((row) => ({
      eventId: row.id,
      queueSid: row.queue_sid,
      queueName: row.queue_name,
      breachType: row.breach_type,
      severity: row.severity,
      threshold: row.threshold_value,
      currentValue: row.current_value,
      affectedCalls: row.affected_calls,
      detectedAt: new Date(row.detected_at),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      durationSeconds: row.duration_seconds,
      alertSent: row.alert_sent,
      escalated: row.escalated,
    }));
  } catch (error) {
    console.error('Failed to get recent breaches:', error);
    return [];
  }
}

/**
 * Get breach summary by type
 */
export async function getBreachSummaryAction(): Promise<BreachSummary[]> {
  try {
    const supabase = getSupabaseClient();

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('queue_sla_breaches')
      .select('breach_type, severity, detected_at')
      .gte('detected_at', oneDayAgo);

    if (error) {
      throw new Error(`Failed to fetch breach summary: ${error.message}`);
    }

    const breaches = data;

    // Group by breach type
    const summaryMap = new Map<string, BreachSummary>();
    for (const breach of breaches) {
      const existing = summaryMap.get(breach.breach_type);
      const detectedAt = new Date(breach.detected_at);
      if (existing) {
        existing.count++;
        if (breach.severity === 'critical') {
          existing.criticalCount++;
        }
        if (detectedAt > existing.lastOccurred) {
          existing.lastOccurred = detectedAt;
        }
      } else {
        summaryMap.set(breach.breach_type, {
          breachType: breach.breach_type,
          count: 1,
          criticalCount: breach.severity === 'critical' ? 1 : 0,
          lastOccurred: detectedAt,
        });
      }
    }

    return Array.from(summaryMap.values()).sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Failed to get breach summary:', error);
    return [];
  }
}

/**
 * Get daily breach statistics for the past week
 */
export async function getDailyBreachStatsAction(days = 7): Promise<DailyBreachStats[]> {
  try {
    const supabase = getSupabaseClient();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('queue_sla_breaches')
      .select('detected_at, severity, resolved_at')
      .gte('detected_at', startDate.toISOString());

    if (error) {
      throw new Error(`Failed to fetch daily stats: ${error.message}`);
    }

    const breaches = data;

    // Group by date
    const statsMap = new Map<string, DailyBreachStats>();

    // Initialize all days
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0] ?? '';
      statsMap.set(dateStr, {
        date: dateStr,
        totalBreaches: 0,
        criticalBreaches: 0,
        warningBreaches: 0,
        resolvedBreaches: 0,
      });
    }

    // Count breaches per day
    for (const breach of breaches) {
      const dateStr = new Date(breach.detected_at).toISOString().split('T')[0] ?? '';
      const stats = statsMap.get(dateStr);
      if (stats) {
        stats.totalBreaches++;
        if (breach.severity === 'critical') {
          stats.criticalBreaches++;
        } else {
          stats.warningBreaches++;
        }
        if (breach.resolved_at) {
          stats.resolvedBreaches++;
        }
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('Failed to get daily breach stats:', error);
    return [];
  }
}

/**
 * Get SLA configuration for a specific queue
 */
export async function getQueueSLAConfigAction(queueSid: string) {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('queue_sla_configs')
      .select('*')
      .eq('queue_sid', queueSid)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch SLA config: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Failed to get SLA config:', error);
    return null;
  }
}
