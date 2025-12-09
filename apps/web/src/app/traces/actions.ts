'use server';

/**
 * Server Actions for Request Tracing UI
 *
 * Fetches trace data from the API diagnostics endpoint
 * for visualization in the admin dashboard.
 */

// Types matching the diagnostics.ts TraceLookup interface
export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
}

export interface Trace {
  traceId: string;
  correlationId?: string;
  spans: TraceSpan[];
  totalDurationMs: number;
  status: 'ok' | 'error';
}

export interface TraceSearchFilters {
  correlationId?: string;
  minDurationMs?: number;
  status?: 'ok' | 'error';
  limit?: number;
}

export interface TraceStats {
  totalTraces: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.DIAGNOSTICS_API_KEY ?? process.env.API_KEY ?? '';

/**
 * Search traces with optional filters
 */
export async function searchTracesAction(
  filters: TraceSearchFilters = {}
): Promise<{ traces: Trace[]; count: number }> {
  try {
    const params = new URLSearchParams();
    if (filters.correlationId) params.set('correlationId', filters.correlationId);
    if (filters.minDurationMs) params.set('minDurationMs', String(filters.minDurationMs));
    if (filters.status) params.set('status', filters.status);
    if (filters.limit) params.set('limit', String(filters.limit));

    const response = await fetch(`${API_BASE_URL}/diagnostics/traces?${params.toString()}`, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      // Return empty result on error for graceful degradation
      return { traces: [], count: 0 };
    }

    const data = (await response.json()) as { traces: Trace[]; count: number };
    return data;
  } catch {
    // Return empty result on network error
    return { traces: [], count: 0 };
  }
}

/**
 * Lookup a specific trace by ID
 */
export async function lookupTraceAction(
  traceId: string
): Promise<{ trace: Trace | null; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/diagnostics/traces/${traceId}`, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (response.status === 404) {
      return { trace: null, error: 'Trace not found' };
    }

    if (!response.ok) {
      return { trace: null, error: 'Failed to fetch trace' };
    }

    const trace = (await response.json()) as Trace;
    return { trace };
  } catch {
    return { trace: null, error: 'Network error' };
  }
}

/**
 * Get trace statistics
 */
export async function getTraceStatsAction(): Promise<{ stats: TraceStats }> {
  try {
    // Fetch all traces to compute stats
    const { traces } = await searchTracesAction({ limit: 1000 });

    if (traces.length === 0) {
      return {
        stats: {
          totalTraces: 0,
          successCount: 0,
          errorCount: 0,
          avgDurationMs: 0,
          p95DurationMs: 0,
        },
      };
    }

    const successCount = traces.filter((t) => t.status === 'ok').length;
    const errorCount = traces.filter((t) => t.status === 'error').length;
    const durations = traces.map((t) => t.totalDurationMs).sort((a, b) => a - b);
    const avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p95Index = Math.floor(durations.length * 0.95);
    const p95DurationMs = durations[p95Index] ?? 0;

    return {
      stats: {
        totalTraces: traces.length,
        successCount,
        errorCount,
        avgDurationMs: Math.round(avgDurationMs * 100) / 100,
        p95DurationMs: Math.round(p95DurationMs * 100) / 100,
      },
    };
  } catch {
    return {
      stats: {
        totalTraces: 0,
        successCount: 0,
        errorCount: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
      },
    };
  }
}
