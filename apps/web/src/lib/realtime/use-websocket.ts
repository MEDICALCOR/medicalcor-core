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
   * Authentication token to send with WebSocket connection.
   * SECURITY FIX: Token is now sent ONLY via WebSocket message after connection,
   * NOT in query parameters (which would expose it in logs and browser history).
   * The server must validate the auth message before allowing other operations.
   */
  authToken?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  /**
   * Enable heartbeat/ping-pong mechanism to detect ghost disconnects
   * @default true
   */
  enableHeartbeat?: boolean;
  /**
   * Heartbeat interval in milliseconds
   * @default 30000 (30 seconds)
   */
  heartbeatInterval?: number;
  /**
   * Heartbeat timeout - if no pong received within this time, reconnect
   * @default 10000 (10 seconds)
   */
  heartbeatTimeout?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  /**
   * Called when authentication fails
   */
  onAuthError?: (message: string) => void;
  /**
   * Called when authentication succeeds
   */
  onAuthSuccess?: () => void;
}

const DEFAULT_RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_HEARTBEAT_INTERVAL = 30000;
const DEFAULT_HEARTBEAT_TIMEOUT = 10000;

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    authToken,
    reconnectInterval = DEFAULT_RECONNECT_INTERVAL,
    maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS,
    enableHeartbeat = true,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
    heartbeatTimeout = DEFAULT_HEARTBEAT_TIMEOUT,
    onOpen,
    onClose,
    onError,
    onAuthError,
    onAuthSuccess,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlersRef = useRef<Map<RealtimeEventType | '*', Set<RealtimeEventHandler>>>(new Map());

  // CRITICAL FIX: Use refs for values that need to be accessed in callbacks
  // to prevent stale closure issues. These refs are updated via useEffect
  // whenever the corresponding state changes.
  const reconnectAttemptsRef = useRef(0);
  const isAuthenticatedRef = useRef(false);
  const isManualDisconnectRef = useRef(false);

  // Store callback refs to avoid stale closures
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);
  const onAuthErrorRef = useRef(onAuthError);
  const onAuthSuccessRef = useRef(onAuthSuccess);

  // Update callback refs when callbacks change
  useEffect(() => {
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
    onAuthErrorRef.current = onAuthError;
    onAuthSuccessRef.current = onAuthSuccess;
  }, [onOpen, onClose, onError, onAuthError, onAuthSuccess]);

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0,
  });

  // Sync state to refs for use in callbacks (avoids stale closure issues)
  useEffect(() => {
    reconnectAttemptsRef.current = connectionState.reconnectAttempts;
    isAuthenticatedRef.current = connectionState.status === 'connected';
  }, [connectionState.reconnectAttempts, connectionState.status]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (!enableHeartbeat) return;

    clearHeartbeat();

    heartbeatIntervalRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN && isAuthenticatedRef.current) {
        // Send ping
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));

        // Set timeout for pong response
        heartbeatTimeoutRef.current = setTimeout(() => {
          // Force close and trigger reconnect on heartbeat timeout
          ws.close(4000, 'Heartbeat timeout');
        }, heartbeatTimeout);
      }
    }, heartbeatInterval);
  }, [enableHeartbeat, heartbeatInterval, heartbeatTimeout, clearHeartbeat]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Reset manual disconnect flag
    isManualDisconnectRef.current = false;

    // SECURITY: Require authentication token for WebSocket connections
    if (!authToken) {
      onAuthErrorRef.current?.('Authentication token required');
      setConnectionState((prev) => ({
        ...prev,
        status: 'error',
      }));
      return;
    }

    setConnectionState((prev) => ({
      ...prev,
      status: 'connecting',
    }));

    try {
      // SECURITY FIX: Do NOT pass token in query parameters
      // Query params are logged in access logs and visible in browser history
      // Instead, send auth message immediately after connection
      const ws = new WebSocket(url);

      ws.onopen = () => {
        // SECURITY: Send authentication message ONLY via WebSocket message
        // The server MUST validate this before accepting any other messages
        // Server should:
        //   1. Set a short timeout (e.g., 5s) for auth message
        //   2. Close connection if auth fails or times out
        //   3. Not process any other messages until auth succeeds
        ws.send(
          JSON.stringify({
            type: 'auth',
            token: authToken,
            // Include timestamp to prevent replay attacks
            timestamp: Date.now(),
          })
        );

        // Note: We don't set 'connected' status until auth_success is received
        setConnectionState((prev) => ({
          ...prev,
          status: 'authenticating',
        }));
        onOpenRef.current?.();
      };

      ws.onclose = () => {
        clearHeartbeat();

        setConnectionState((prev) => ({
          ...prev,
          status: 'disconnected',
        }));
        onCloseRef.current?.();

        // CRITICAL FIX: Use ref for reconnect attempts to avoid stale closure
        // Don't reconnect if this was a manual disconnect
        if (isManualDisconnectRef.current) {
          return;
        }

        // Auto-reconnect with exponential backoff
        const currentAttempts = reconnectAttemptsRef.current;
        if (currentAttempts < maxReconnectAttempts) {
          const delay = Math.min(
            reconnectInterval * Math.pow(1.5, currentAttempts),
            60000 // Cap at 60 seconds
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            // Use functional update to ensure we get the latest state
            setConnectionState((prev) => ({
              ...prev,
              reconnectAttempts: prev.reconnectAttempts + 1,
            }));
            connect();
          }, delay);
        } else {
          // Max reconnection attempts reached
          setConnectionState((prev) => ({
            ...prev,
            status: 'error',
          }));
        }
      };

      ws.onerror = (error) => {
        setConnectionState((prev) => ({
          ...prev,
          status: 'error',
        }));
        onErrorRef.current?.(error);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const realtimeEvent = JSON.parse(event.data) as RealtimeEvent;

          // Handle pong response for heartbeat
          if (realtimeEvent.type === 'pong') {
            // Clear heartbeat timeout - connection is alive
            if (heartbeatTimeoutRef.current) {
              clearTimeout(heartbeatTimeoutRef.current);
              heartbeatTimeoutRef.current = null;
            }
            return;
          }

          // Handle authentication success from server
          if (realtimeEvent.type === 'auth_success') {
            setConnectionState({
              status: 'connected',
              lastConnected: new Date(),
              reconnectAttempts: 0,
            });
            // Start heartbeat after successful authentication
            startHeartbeat();
            onAuthSuccessRef.current?.();
            return;
          }

          // Handle authentication error from server
          if (realtimeEvent.type === 'auth_error') {
            const errorMsg =
              (realtimeEvent.data as { message?: string } | undefined)?.message ??
              'Authentication failed';
            setConnectionState((prev) => ({
              ...prev,
              status: 'error',
            }));
            onAuthErrorRef.current?.(errorMsg);
            isManualDisconnectRef.current = true; // Don't auto-reconnect on auth failure
            ws.close();
            return;
          }

          // CRITICAL FIX: Use ref to check authentication status to avoid stale closure
          if (!isAuthenticatedRef.current) {
            // Received message before authentication complete - ignore
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
  }, [url, authToken, reconnectInterval, maxReconnectAttempts, clearHeartbeat, startHeartbeat]);

  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    clearReconnectTimeout();
    clearHeartbeat();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionState({
      status: 'disconnected',
      reconnectAttempts: 0,
    });
  }, [clearReconnectTimeout, clearHeartbeat]);

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
      isManualDisconnectRef.current = true;
      clearReconnectTimeout();
      clearHeartbeat();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [clearReconnectTimeout, clearHeartbeat]);

  return {
    connectionState,
    connect,
    disconnect,
    subscribe,
    send,
    isConnected: connectionState.status === 'connected',
  };
}
