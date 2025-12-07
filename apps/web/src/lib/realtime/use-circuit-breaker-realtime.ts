'use client';

/**
 * @fileoverview Real-time Circuit Breaker Hook
 *
 * Provides real-time updates for circuit breaker status via WebSocket.
 * Falls back to polling when WebSocket is not connected.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtime, useRealtimeConnection } from './context';
import type {
  CircuitBreakerStateChangePayload,
  CircuitBreakerStatsUpdatePayload,
  CircuitBreakerServiceStats,
  CircuitState,
} from './types';
import { RingBuffer } from './ring-buffer';

// ============================================================================
// TYPES
// ============================================================================

export interface CircuitBreakerStateEvent {
  service: string;
  fromState: CircuitState;
  toState: CircuitState;
  timestamp: string;
  reason?: string;
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

export interface CircuitBreakerRealtimeData {
  services: CircuitBreakerServiceStats[];
  openCircuits: string[];
  stats: CircuitBreakerStats;
  stateHistory: CircuitBreakerStateEvent[];
  lastUpdated: Date | null;
}

export interface UseCircuitBreakerRealtimeOptions {
  /** Polling interval in ms when WebSocket is not connected (default: 30000) */
  pollingInterval?: number;
  /** Maximum state history events to keep (default: 100) */
  maxHistoryEvents?: number;
  /** Enable real-time updates (default: true) */
  enableRealtime?: boolean;
  /** Callback when data is fetched via polling */
  onPollingFetch?: () => Promise<{
    services: CircuitBreakerServiceStats[];
    openCircuits: string[];
    stats: CircuitBreakerStats;
  } | null>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_POLLING_INTERVAL = 30000; // 30 seconds
const MAX_HISTORY_EVENTS = 100;

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useCircuitBreakerRealtime(options: UseCircuitBreakerRealtimeOptions = {}) {
  const {
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    maxHistoryEvents = MAX_HISTORY_EVENTS,
    enableRealtime = true,
    onPollingFetch,
  } = options;

  const { subscribe } = useRealtime();
  const { isConnected, connectionState } = useRealtimeConnection();

  // State
  const [data, setData] = useState<CircuitBreakerRealtimeData>({
    services: [],
    openCircuits: [],
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
    lastUpdated: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Ring buffer for state history (memory-bounded)
  const historyBufferRef = useRef(new RingBuffer<CircuitBreakerStateEvent>(maxHistoryEvents));

  // Polling interval ref
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track if we've received initial data
  const hasInitialDataRef = useRef(false);

  // Clear polling interval
  const clearPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Fetch data via polling (fallback when WebSocket is not connected)
  const fetchViaPolling = useCallback(async () => {
    if (!onPollingFetch) return;

    try {
      const result = await onPollingFetch();
      if (result) {
        setData((prev) => ({
          ...prev,
          services: result.services,
          openCircuits: result.openCircuits,
          stats: result.stats,
          lastUpdated: new Date(),
        }));
        setError(null);
        hasInitialDataRef.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch circuit breaker data'));
    } finally {
      setIsLoading(false);
    }
  }, [onPollingFetch]);

  // Handle state change events from WebSocket
  useEffect(() => {
    if (!enableRealtime) return;

    const unsubscribe = subscribe<CircuitBreakerStateChangePayload>(
      'circuit_breaker.state_change',
      (event) => {
        const stateEvent: CircuitBreakerStateEvent = {
          service: event.data.service,
          fromState: event.data.fromState,
          toState: event.data.toState,
          timestamp: event.timestamp,
          reason: event.data.reason,
        };

        // Add to history buffer
        historyBufferRef.current.push(stateEvent);

        // Update state
        setData((prev) => {
          // Update the specific service
          const updatedServices = prev.services.map((service) => {
            if (service.name === event.data.service) {
              return {
                ...service,
                state: event.data.toState,
                failures: event.data.failures,
                successes: event.data.successes,
                totalRequests: event.data.totalRequests,
                totalFailures: event.data.totalFailures,
                successRate: event.data.successRate,
              };
            }
            return service;
          });

          // Recalculate open circuits
          const openCircuits = updatedServices.filter((s) => s.state === 'OPEN').map((s) => s.name);

          // Recalculate stats
          const stats = {
            totalCircuits: updatedServices.length,
            openCount: updatedServices.filter((s) => s.state === 'OPEN').length,
            halfOpenCount: updatedServices.filter((s) => s.state === 'HALF_OPEN').length,
            closedCount: updatedServices.filter((s) => s.state === 'CLOSED').length,
            averageSuccessRate:
              updatedServices.length > 0
                ? Math.round(
                    (updatedServices.reduce((sum, s) => sum + s.successRate, 0) /
                      updatedServices.length) *
                      10
                  ) / 10
                : 100,
            totalRequests: updatedServices.reduce((sum, s) => sum + s.totalRequests, 0),
            totalFailures: updatedServices.reduce((sum, s) => sum + s.totalFailures, 0),
          };

          return {
            services: updatedServices,
            openCircuits,
            stats,
            stateHistory: historyBufferRef.current.toArrayReversed(),
            lastUpdated: new Date(),
          };
        });
      }
    );

    return unsubscribe;
  }, [subscribe, enableRealtime]);

  // Handle full stats update events from WebSocket
  useEffect(() => {
    if (!enableRealtime) return;

    const unsubscribe = subscribe<CircuitBreakerStatsUpdatePayload>(
      'circuit_breaker.stats_update',
      (event) => {
        setData((prev) => ({
          ...prev,
          services: event.data.services,
          openCircuits: event.data.openCircuits,
          stats: event.data.stats,
          lastUpdated: new Date(),
        }));
        hasInitialDataRef.current = true;
        setIsLoading(false);
        setError(null);
      }
    );

    return unsubscribe;
  }, [subscribe, enableRealtime]);

  // Setup polling fallback when WebSocket is not connected
  useEffect(() => {
    // If WebSocket is connected and realtime is enabled, don't poll
    if (isConnected && enableRealtime) {
      clearPolling();
      return;
    }

    // Fetch initial data if we don't have it
    if (!hasInitialDataRef.current) {
      void fetchViaPolling();
    }

    // Start polling
    pollingIntervalRef.current = setInterval(() => {
      void fetchViaPolling();
    }, pollingInterval);

    return clearPolling;
  }, [isConnected, enableRealtime, pollingInterval, fetchViaPolling, clearPolling]);

  // Manual refresh
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchViaPolling();
  }, [fetchViaPolling]);

  // Determine if using real-time updates
  const isRealtime = isConnected && enableRealtime;

  return {
    data,
    isLoading,
    error,
    refresh,
    isRealtime,
    connectionState,
  };
}

/**
 * Convenience hook for just getting the connection status for circuit breaker dashboard
 */
export function useCircuitBreakerConnectionStatus() {
  const { connectionState, isConnected, connect, disconnect } = useRealtimeConnection();

  return {
    connectionState,
    isConnected,
    isRealtime: isConnected,
    connect,
    disconnect,
  };
}
