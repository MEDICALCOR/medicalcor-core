'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConnectionState,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeEventType,
} from './types';

interface UseWebSocketOptions {
  url: string;
  /**
   * Authentication token for WebSocket connection
   * SECURITY: Required for all connections
   */
  authToken?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onAuthError?: () => void;
}

const DEFAULT_RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Build authenticated WebSocket URL
 * Adds token as query parameter for authentication
 */
function buildAuthenticatedUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    authToken,
    reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
    maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS,
    onOpen,
    onClose,
    onError,
    onAuthError,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlersRef = useRef<Map<RealtimeEventType | '*', Set<RealtimeEventHandler>>>(new Map());

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0,
  });

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // SECURITY: Require authentication token
    if (!authToken) {
      console.error('[WebSocket] Authentication token required - connection rejected');
      setConnectionState((prev) => ({
        ...prev,
        status: 'error',
      }));
      onAuthError?.();
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionState((prev) => ({
      ...prev,
      status: 'connecting',
    }));

    try {
      // Build authenticated URL with token
      const authenticatedUrl = buildAuthenticatedUrl(url, authToken);
      const ws = new WebSocket(authenticatedUrl);

      ws.onopen = () => {
        setConnectionState({
          status: 'connected',
          lastConnected: new Date(),
          reconnectAttempts: 0,
        });
        onOpen?.();
      };

      ws.onclose = (event) => {
        setConnectionState((prev) => ({
          ...prev,
          status: 'disconnected',
        }));
        onClose?.();

        // Check for authentication failure (4401 = Unauthorized)
        if (event.code === 4401) {
          console.error('[WebSocket] Authentication failed');
          onAuthError?.();
          return; // Don't reconnect on auth failure
        }

        // Auto-reconnect logic (only if we have a valid token)
        if (authToken && connectionState.reconnectAttempts < maxReconnectAttempts) {
          const delay = reconnectInterval * Math.pow(1.5, connectionState.reconnectAttempts);
          reconnectTimeoutRef.current = setTimeout(() => {
            setConnectionState((prev) => ({
              ...prev,
              reconnectAttempts: prev.reconnectAttempts + 1,
            }));
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        setConnectionState((prev) => ({
          ...prev,
          status: 'error',
        }));
        onError?.(error);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const realtimeEvent = JSON.parse(event.data) as RealtimeEvent;

          // Handle authentication errors from server
          if (realtimeEvent.type === 'auth_error') {
            console.error('[WebSocket] Server rejected authentication');
            ws.close(4401, 'Authentication failed');
            onAuthError?.();
            return;
          }

          // Notify specific handlers
          const specificHandlers = handlersRef.current.get(realtimeEvent.type);
          specificHandlers?.forEach((handler) => handler(realtimeEvent));

          // Notify wildcard handlers
          const wildcardHandlers = handlersRef.current.get('*');
          wildcardHandlers?.forEach((handler) => handler(realtimeEvent));
        } catch {
          // Invalid JSON, ignore
        }
      };

      wsRef.current = ws;
    } catch {
      setConnectionState((prev) => ({
        ...prev,
        status: 'error',
      }));
    }
  }, [
    url,
    authToken,
    reconnectInterval,
    maxReconnectAttempts,
    onOpen,
    onClose,
    onError,
    onAuthError,
    connectionState.reconnectAttempts,
  ]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState({
      status: 'disconnected',
      reconnectAttempts: 0,
    });
  }, [clearReconnectTimeout]);

  const subscribe = useCallback(
    <T = unknown>(eventType: RealtimeEventType | '*', handler: RealtimeEventHandler<T>) => {
      let handlers = handlersRef.current.get(eventType);
      if (!handlers) {
        handlers = new Set();
        handlersRef.current.set(eventType, handlers);
      }
      handlers.add(handler as RealtimeEventHandler);

      // Return unsubscribe function
      return () => {
        handlersRef.current.get(eventType)?.delete(handler as RealtimeEventHandler);
      };
    },
    []
  );

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [clearReconnectTimeout]);

  return {
    connectionState,
    connect,
    disconnect,
    subscribe,
    send,
    isConnected: connectionState.status === 'connected',
    isAuthenticated: !!authToken,
  };
}
