'use server';

/**
 * @fileoverview Load Testing Server Actions
 *
 * Server actions for fetching K6 load test results and dashboard data.
 * Integrates with the API's load testing endpoints.
 *
 * @module actions/load-testing
 * @security All actions require VIEW_ANALYTICS permission
 */

import type { LoadTestDashboardData, LoadTestResult, LoadTestTimeRange } from '@medicalcor/types';
import { requirePermission } from '@/lib/auth/server-action-auth';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * API base URL for load testing endpoints
 */
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const API_SECRET_KEY = process.env.API_SECRET_KEY ?? '';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch from the API with authentication
 */
async function fetchFromApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_SECRET_KEY,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Create empty dashboard data for fallback
 */
function createEmptyDashboardData(): LoadTestDashboardData {
  return {
    stats: {
      totalRuns: 0,
      passedRuns: 0,
      failedRuns: 0,
      degradedRuns: 0,
      avgP95Duration: 0,
      avgSuccessRate: 0,
      lastRunAt: null,
    },
    trends: [],
    scenarioBreakdown: [],
    environmentComparison: [],
    recentRuns: [],
  };
}

// ============================================================================
// LOAD TESTING ACTIONS
// ============================================================================

/**
 * Fetches comprehensive load testing dashboard data
 *
 * Aggregates data to provide:
 * - Summary statistics (total runs, pass rate, avg latency)
 * - Performance trends over time
 * - Scenario breakdown (smoke, load, stress, soak)
 * - Environment comparison
 * - Recent test runs
 *
 * @param timeRange - Time range for data (7d, 30d, 90d, 6m, 1y)
 * @param environment - Optional environment filter
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Comprehensive load testing dashboard data
 *
 * @example
 * ```typescript
 * const dashboard = await getLoadTestDashboardAction('30d');
 * console.log(dashboard.stats.totalRuns);
 * console.log(dashboard.trends);
 * ```
 */
export async function getLoadTestDashboardAction(
  timeRange: LoadTestTimeRange = '30d',
  environment?: string
): Promise<LoadTestDashboardData> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const params = new URLSearchParams({ timeRange });
    if (environment) {
      params.set('environment', environment);
    }

    const data = await fetchFromApi<LoadTestDashboardData>(
      `/load-tests/dashboard?${params.toString()}`
    );

    return data;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getLoadTestDashboardAction] Failed to fetch dashboard data:', error);
    }
    return createEmptyDashboardData();
  }
}

/**
 * Fetches a list of load test results with filtering
 *
 * @param options - Query options
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Paginated list of load test results
 */
export async function getLoadTestResultsAction(
  options: {
    timeRange?: LoadTestTimeRange;
    scenario?: string;
    environment?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ results: LoadTestResult[]; total: number }> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const params = new URLSearchParams();
    if (options.timeRange) params.set('timeRange', options.timeRange);
    if (options.scenario) params.set('scenario', options.scenario);
    if (options.environment) params.set('environment', options.environment);
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());

    const data = await fetchFromApi<{ results: LoadTestResult[]; total: number }>(
      `/load-tests?${params.toString()}`
    );

    return data;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getLoadTestResultsAction] Failed to fetch results:', error);
    }
    return { results: [], total: 0 };
  }
}

/**
 * Fetches a specific load test result by ID
 *
 * @param id - Load test result ID
 * @requires VIEW_ANALYTICS permission
 *
 * @returns Load test result or null if not found
 */
export async function getLoadTestResultAction(id: string): Promise<LoadTestResult | null> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const data = await fetchFromApi<LoadTestResult>(`/load-tests/${id}`);
    return data;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getLoadTestResultAction] Failed to fetch result:', error);
    }
    return null;
  }
}

/**
 * Fetches list of available environments
 *
 * @requires VIEW_ANALYTICS permission
 *
 * @returns List of environment names
 */
export async function getLoadTestEnvironmentsAction(): Promise<string[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const data = await fetchFromApi<{ environments: string[] }>('/load-tests/environments');
    return data.environments;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getLoadTestEnvironmentsAction] Failed to fetch environments:', error);
    }
    return [];
  }
}

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type {
  LoadTestDashboardData,
  LoadTestResult,
  LoadTestTimeRange,
  LoadTestSummaryStats,
  LoadTestTrendPoint,
  ScenarioBreakdown,
  EnvironmentComparison,
} from '@medicalcor/types';
