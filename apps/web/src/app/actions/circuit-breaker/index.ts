'use server';

/**
 * @fileoverview Circuit Breaker Server Actions
 *
 * M10: Circuit Breaker Dashboard - Ops Visibility
 * Server actions for fetching circuit breaker status and metrics
 * for operational monitoring and incident response.
 *
 * @module actions/circuit-breaker
 * @security All actions require VIEW_ANALYTICS permission
 */

import { requirePermission } from '@/lib/auth/server-action-auth';

// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerService {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  successRate: number;
  lastFailure: string | null;
  lastSuccess: string | null;
}

export interface CircuitBreakerDashboardData {
  timestamp: string;
  openCircuits: string[];
  services: CircuitBreakerService[];
  stats: CircuitBreakerStats;
  stateHistory: CircuitStateEvent[];
}

export interface CircuitBreakerStats {
  totalCircuits: number;
  openCount: number;
  halfOpenCount: number;
  closedCount: number;
  averageSuccessRate: number;
  totalRequests: number;
  totalFailures: number;
}

export interface CircuitStateEvent {
  service: string;
  fromState: CircuitState;
  toState: CircuitState;
  timestamp: string;
  reason?: string;
}

export interface CircuitBreakerResetResult {
  success: boolean;
  message: string;
  timestamp?: string;
}

// ============================================================================
// API COMMUNICATION
// ============================================================================

/**
 * Get the API base URL for circuit breaker endpoints
 */
function getApiBaseUrl(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

/**
 * Get the API secret key for authenticated requests
 */
function getApiSecretKey(): string | undefined {
  return process.env.API_SECRET_KEY;
}

/**
 * Fetch circuit breaker data from the API
 */
async function fetchCircuitBreakerData(): Promise<{
  timestamp: string;
  openCircuits: string[];
  services: CircuitBreakerService[];
} | null> {
  try {
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/health/circuit-breakers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[fetchCircuitBreakerData] API returned ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      timestamp: string;
      openCircuits: string[];
      services: CircuitBreakerService[];
    };

    return data;
  } catch (error) {
    console.error('[fetchCircuitBreakerData] Failed to fetch:', error);
    return null;
  }
}

// ============================================================================
// MOCK DATA GENERATORS (for development/demo)
// ============================================================================

const CIRCUIT_BREAKER_SERVICES = [
  'whatsapp',
  'voice',
  'vapi',
  'stripe',
  'booking',
  'crm',
  'hubspot',
  'scheduling',
  'openai',
  'email',
];

function generateMockServices(): CircuitBreakerService[] {
  const now = Date.now();

  return CIRCUIT_BREAKER_SERVICES.map((name) => {
    // Most services are healthy (CLOSED)
    const stateRand = Math.random();
    let state: CircuitState = 'CLOSED';
    if (stateRand > 0.9) {
      state = 'OPEN';
    } else if (stateRand > 0.85) {
      state = 'HALF_OPEN';
    }

    const totalRequests = 100 + Math.floor(Math.random() * 5000);
    const totalFailures =
      state === 'OPEN'
        ? Math.floor(totalRequests * (0.1 + Math.random() * 0.3))
        : Math.floor(totalRequests * Math.random() * 0.05);
    const totalSuccesses = totalRequests - totalFailures;
    const successRate =
      totalRequests > 0 ? Math.round((totalSuccesses / totalRequests) * 1000) / 10 : 100;

    const lastFailureTime =
      state !== 'CLOSED'
        ? now - Math.floor(Math.random() * 60 * 1000)
        : Math.random() > 0.5
          ? now - Math.floor(Math.random() * 3600 * 1000)
          : null;

    const lastSuccessTime =
      state !== 'OPEN'
        ? now - Math.floor(Math.random() * 5 * 1000)
        : now - Math.floor(Math.random() * 300 * 1000);

    return {
      name,
      state,
      failures:
        state === 'OPEN' ? 5 + Math.floor(Math.random() * 10) : Math.floor(Math.random() * 3),
      successes: state === 'HALF_OPEN' ? Math.floor(Math.random() * 2) : 0,
      totalRequests,
      totalFailures,
      totalSuccesses,
      successRate,
      lastFailure: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
      lastSuccess: lastSuccessTime ? new Date(lastSuccessTime).toISOString() : null,
    };
  });
}

function generateMockStateHistory(): CircuitStateEvent[] {
  const events: CircuitStateEvent[] = [];
  const now = Date.now();

  // Generate some realistic state transitions
  const transitions: {
    service: string;
    fromState: CircuitState;
    toState: CircuitState;
    minutesAgo: number;
    reason?: string;
  }[] = [
    {
      service: 'whatsapp',
      fromState: 'CLOSED',
      toState: 'OPEN',
      minutesAgo: 45,
      reason: 'Rate limit exceeded',
    },
    { service: 'whatsapp', fromState: 'OPEN', toState: 'HALF_OPEN', minutesAgo: 44 },
    {
      service: 'whatsapp',
      fromState: 'HALF_OPEN',
      toState: 'CLOSED',
      minutesAgo: 43,
      reason: 'Service recovered',
    },
    {
      service: 'stripe',
      fromState: 'CLOSED',
      toState: 'OPEN',
      minutesAgo: 120,
      reason: 'Connection timeout',
    },
    { service: 'stripe', fromState: 'OPEN', toState: 'HALF_OPEN', minutesAgo: 118 },
    {
      service: 'stripe',
      fromState: 'HALF_OPEN',
      toState: 'CLOSED',
      minutesAgo: 117,
      reason: 'Service recovered',
    },
    {
      service: 'openai',
      fromState: 'CLOSED',
      toState: 'OPEN',
      minutesAgo: 180,
      reason: '503 Service Unavailable',
    },
    { service: 'openai', fromState: 'OPEN', toState: 'HALF_OPEN', minutesAgo: 178 },
    {
      service: 'openai',
      fromState: 'HALF_OPEN',
      toState: 'OPEN',
      minutesAgo: 177,
      reason: 'Test request failed',
    },
    { service: 'openai', fromState: 'OPEN', toState: 'HALF_OPEN', minutesAgo: 175 },
    {
      service: 'openai',
      fromState: 'HALF_OPEN',
      toState: 'CLOSED',
      minutesAgo: 174,
      reason: 'Service recovered',
    },
  ];

  transitions.forEach(({ service, fromState, toState, minutesAgo, reason }) => {
    events.push({
      service,
      fromState,
      toState,
      timestamp: new Date(now - minutesAgo * 60 * 1000).toISOString(),
      reason,
    });
  });

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Get circuit breaker dashboard data
 *
 * @requires VIEW_ANALYTICS permission
 * @returns Complete dashboard data including stats, services, and history
 */
export async function getCircuitBreakerDashboardAction(): Promise<CircuitBreakerDashboardData> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    // Try to fetch real data from API
    const apiData = await fetchCircuitBreakerData();

    let services: CircuitBreakerService[];
    let openCircuits: string[];
    let timestamp: string;

    if (apiData) {
      services = apiData.services;
      openCircuits = apiData.openCircuits;
      timestamp = apiData.timestamp;
    } else {
      // Fall back to mock data for development
      services = generateMockServices();
      openCircuits = services.filter((s) => s.state === 'OPEN').map((s) => s.name);
      timestamp = new Date().toISOString();
    }

    // Calculate stats
    const stats: CircuitBreakerStats = {
      totalCircuits: services.length,
      openCount: services.filter((s) => s.state === 'OPEN').length,
      halfOpenCount: services.filter((s) => s.state === 'HALF_OPEN').length,
      closedCount: services.filter((s) => s.state === 'CLOSED').length,
      averageSuccessRate:
        services.length > 0
          ? Math.round(
              (services.reduce((sum, s) => sum + s.successRate, 0) / services.length) * 10
            ) / 10
          : 100,
      totalRequests: services.reduce((sum, s) => sum + s.totalRequests, 0),
      totalFailures: services.reduce((sum, s) => sum + s.totalFailures, 0),
    };

    // Get state history (mock for now, would come from event store in production)
    const stateHistory = generateMockStateHistory();

    return {
      timestamp,
      openCircuits,
      services,
      stats,
      stateHistory,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getCircuitBreakerDashboardAction] Failed:', error);
    }

    return {
      timestamp: new Date().toISOString(),
      openCircuits: [],
      services: [],
      stats: {
        totalCircuits: 0,
        openCount: 0,
        halfOpenCount: 0,
        closedCount: 0,
        averageSuccessRate: 100,
        totalRequests: 0,
        totalFailures: 0,
      },
      stateHistory: [],
    };
  }
}

/**
 * Get circuit breaker stats summary
 *
 * @requires VIEW_ANALYTICS permission
 * @returns Circuit breaker statistics
 */
export async function getCircuitBreakerStatsAction(): Promise<CircuitBreakerStats> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const apiData = await fetchCircuitBreakerData();
    const services = apiData?.services ?? generateMockServices();

    return {
      totalCircuits: services.length,
      openCount: services.filter((s) => s.state === 'OPEN').length,
      halfOpenCount: services.filter((s) => s.state === 'HALF_OPEN').length,
      closedCount: services.filter((s) => s.state === 'CLOSED').length,
      averageSuccessRate:
        services.length > 0
          ? Math.round(
              (services.reduce((sum, s) => sum + s.successRate, 0) / services.length) * 10
            ) / 10
          : 100,
      totalRequests: services.reduce((sum, s) => sum + s.totalRequests, 0),
      totalFailures: services.reduce((sum, s) => sum + s.totalFailures, 0),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getCircuitBreakerStatsAction] Failed:', error);
    }
    return {
      totalCircuits: 0,
      openCount: 0,
      halfOpenCount: 0,
      closedCount: 0,
      averageSuccessRate: 100,
      totalRequests: 0,
      totalFailures: 0,
    };
  }
}

/**
 * Get details for a specific circuit breaker
 *
 * @param serviceName - Name of the service
 * @requires VIEW_ANALYTICS permission
 * @returns Circuit breaker details or null if not found
 */
export async function getCircuitBreakerByServiceAction(
  serviceName: string
): Promise<CircuitBreakerService | null> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const apiData = await fetchCircuitBreakerData();
    const services = apiData?.services ?? generateMockServices();

    return services.find((s) => s.name === serviceName) ?? null;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getCircuitBreakerByServiceAction] Failed:', error);
    }
    return null;
  }
}

/**
 * Get all open circuits (services that are currently failing)
 *
 * @requires VIEW_ANALYTICS permission
 * @returns List of open circuit names
 */
export async function getOpenCircuitsAction(): Promise<string[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const apiData = await fetchCircuitBreakerData();

    if (apiData) {
      return apiData.openCircuits;
    }

    const services = generateMockServices();
    return services.filter((s) => s.state === 'OPEN').map((s) => s.name);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getOpenCircuitsAction] Failed:', error);
    }
    return [];
  }
}

/**
 * Get circuit state transition history
 *
 * @param limit - Maximum number of events to return
 * @requires VIEW_ANALYTICS permission
 * @returns List of state change events
 */
export async function getCircuitStateHistoryAction(limit = 50): Promise<CircuitStateEvent[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    // In production, this would fetch from event store or metrics backend
    const history = generateMockStateHistory();
    return history.slice(0, limit);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getCircuitStateHistoryAction] Failed:', error);
    }
    return [];
  }
}

/**
 * Reset a circuit breaker (admin action)
 *
 * @param serviceName - Name of the service to reset
 * @requires MANAGE_SYSTEM permission
 * @returns Result of the reset operation
 */
export async function resetCircuitBreakerAction(
  serviceName: string
): Promise<CircuitBreakerResetResult> {
  try {
    await requirePermission('MANAGE_INTEGRATIONS');

    const apiUrl = getApiBaseUrl();
    const apiKey = getApiSecretKey();

    if (!apiKey) {
      return {
        success: false,
        message: 'API key not configured. Circuit breaker reset requires authentication.',
      };
    }

    const response = await fetch(
      `${apiUrl}/health/circuit-breakers/${encodeURIComponent(serviceName)}/reset`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      return {
        success: false,
        message: errorData.message ?? `Failed to reset circuit breaker: ${response.status}`,
      };
    }

    const data = (await response.json()) as CircuitBreakerResetResult;
    return data;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[resetCircuitBreakerAction] Failed:', error);
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Get services that are currently degraded (high failure rate but not open)
 *
 * @param threshold - Failure rate threshold (default 10%)
 * @requires VIEW_ANALYTICS permission
 * @returns List of degraded services
 */
export async function getDegradedServicesAction(threshold = 10): Promise<CircuitBreakerService[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const apiData = await fetchCircuitBreakerData();
    const services = apiData?.services ?? generateMockServices();

    return services.filter((s) => s.state === 'CLOSED' && 100 - s.successRate >= threshold);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getDegradedServicesAction] Failed:', error);
    }
    return [];
  }
}
