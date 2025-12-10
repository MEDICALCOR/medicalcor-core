'use client';

/**
 * Supervisor SSE Hook
 *
 * Provides Server-Sent Events connection for real-time supervisor updates.
 * The backend uses SSE (not WebSocket) for supervisor events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SSEConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastConnected?: Date;
  reconnectAttempts: number;
}

export interface SupervisorSSEEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  callSid?: string;
  [key: string]: unknown;
}

interface UseSupervisorSSEOptions {
  supervisorId: string;
  apiUrl?: string;
  autoConnect?: boolean;
  onEvent?: (event: SupervisorSSEEvent) => void;
  onConnectionChange?: (state: SSEConnectionState) => void;
}

const DEFAULT_RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useSupervisorSSE(options: UseSupervisorSSEOptions) {
  const {
    supervisorId,
    apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
    autoConnect = true,
    onEvent,
    onConnectionChange,
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isManualDisconnectRef = useRef(false);
  const handlersRef = useRef<Map<string, Set<(event: SupervisorSSEEvent) => void>>>(new Map());

  // Store callback refs to avoid stale closures
  const onEventRef = useRef(onEvent);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onEventRef.current = onEvent;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onEvent, onConnectionChange]);

  const [connectionState, setConnectionState] = useState<SSEConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0,
  });

  // Update callback when state changes
  useEffect(() => {
    onConnectionChangeRef.current?.(connectionState);
  }, [connectionState]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    if (!supervisorId) {
      setConnectionState((prev) => ({ ...prev, status: 'error' }));
      return;
    }

    isManualDisconnectRef.current = false;
    setConnectionState((prev) => ({ ...prev, status: 'connecting' }));

    // Use fetch with ReadableStream for custom headers
    // Standard EventSource doesn't support custom headers, so we use fetch API
    const url = `${apiUrl}/supervisor/events`;
    const controller = new AbortController();

    const setupSSEWithHeaders = async () => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            'x-supervisor-id': supervisorId,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        setConnectionState({
          status: 'connected',
          lastConnected: new Date(),
          reconnectAttempts: 0,
        });
        reconnectAttemptsRef.current = 0;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = async () => {
          try {
            while (true) {
              const result = await reader.read();
              if (result.done) {
                break;
              }
              const value = result.value;

              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE messages
              const lines = buffer.split('\n\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  try {
                    const event = JSON.parse(data) as SupervisorSSEEvent;

                    // Call global handler
                    onEventRef.current?.(event);

                    // Call type-specific handlers
                    const typeHandlers = handlersRef.current.get(event.eventType);
                    typeHandlers?.forEach((handler) => handler(event));

                    // Call wildcard handlers
                    const wildcardHandlers = handlersRef.current.get('*');
                    wildcardHandlers?.forEach((handler) => handler(event));
                  } catch {
                    // Invalid JSON, skip
                  }
                }
              }
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              return;
            }
            throw error;
          }
        };

        processStream().catch(() => {
          // Stream ended or errored
          if (!isManualDisconnectRef.current) {
            handleReconnect();
          }
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setConnectionState((prev) => ({ ...prev, status: 'error' }));
        if (!isManualDisconnectRef.current) {
          handleReconnect();
        }
      }
    };

    const handleReconnect = () => {
      setConnectionState((prev) => ({
        ...prev,
        status: 'disconnected',
      }));

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          DEFAULT_RECONNECT_INTERVAL * Math.pow(1.5, reconnectAttemptsRef.current),
          60000
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          setConnectionState((prev) => ({
            ...prev,
            reconnectAttempts: reconnectAttemptsRef.current,
          }));
          connect();
        }, delay);
      } else {
        setConnectionState((prev) => ({
          ...prev,
          status: 'error',
        }));
      }
    };

    void setupSSEWithHeaders();

    // Store abort controller for cleanup
    eventSourceRef.current = { close: () => controller.abort() } as unknown as EventSource;
  }, [supervisorId, apiUrl, clearReconnectTimeout]);

  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    clearReconnectTimeout();

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionState({
      status: 'disconnected',
      reconnectAttempts: 0,
    });
  }, [clearReconnectTimeout]);

  const subscribe = useCallback(
    (eventType: string, handler: (event: SupervisorSSEEvent) => void) => {
      let handlers = handlersRef.current.get(eventType);
      if (!handlers) {
        handlers = new Set();
        handlersRef.current.set(eventType, handlers);
      }
      handlers.add(handler);

      return () => {
        handlersRef.current.get(eventType)?.delete(handler);
      };
    },
    []
  );

  // Auto-connect if enabled
  useEffect(() => {
    if (autoConnect && supervisorId) {
      connect();
    }

    return () => {
      isManualDisconnectRef.current = true;
      clearReconnectTimeout();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [autoConnect, supervisorId, connect, clearReconnectTimeout]);

  return {
    connectionState,
    isConnected: connectionState.status === 'connected',
    connect,
    disconnect,
    subscribe,
  };
}
