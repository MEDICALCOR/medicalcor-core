'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type {
  ConnectionState,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeEventType,
} from './types';

/**
 * SECURITY FIX: Zod schema for validating incoming WebSocket messages
 * Prevents processing of malformed or malicious payloads
 */
const RealtimeEventSchema = z.object({
  id: z.string().max(100),
  type: z.enum([
    'lead.created',
    'lead.updated',
    'lead.scored',
    'lead.assigned',
    'message.received',
    'message.sent',
    'call.started',
    'call.ended',
    'appointment.created',
    'appointment.updated',
    'appointment.cancelled',
    'task.created',
    'task.completed',
    'urgency.new',
    'urgency.resolved',
    'auth_success',
    'auth_error',
  ]),
  timestamp: z.string(),
  data: z.unknown(),
});

/**
 * Maximum message size to process (prevents memory exhaustion)
 */
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB

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
    onAuthSuccess,
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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // SECURITY: Require authentication token for WebSocket connections
    if (!authToken) {
      console.error('[WebSocket] Authentication token required for connection');
      onAuthError?.('Authentication token required');
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
        onOpen?.();
      };

      ws.onclose = () => {
        setConnectionState((prev) => ({
          ...prev,
          status: 'disconnected',
        }));
        onClose?.();

        // Auto-reconnect logic
        if (connectionState.reconnectAttempts < maxReconnectAttempts) {
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
          // SECURITY: Check message size before parsing
          if (typeof event.data === 'string' && event.data.length > MAX_MESSAGE_SIZE) {
            console.warn('[WebSocket] Message too large, ignoring');
            return;
          }

          const rawData: unknown = JSON.parse(event.data);

          // SECURITY: Validate message structure with Zod schema
          const parseResult = RealtimeEventSchema.safeParse(rawData);
          if (!parseResult.success) {
            console.warn('[WebSocket] Invalid message format:', parseResult.error.issues);
            return;
          }

          const realtimeEvent = parseResult.data as RealtimeEvent;

          // Handle authentication success from server
          if (realtimeEvent.type === 'auth_success') {
            setConnectionState({
              status: 'connected',
              lastConnected: new Date(),
              reconnectAttempts: 0,
            });
            onAuthSuccess?.();
            return;
          }

          // Handle authentication error from server
          if (realtimeEvent.type === 'auth_error') {
            const errorMsg =
              (realtimeEvent.data as { message?: string } | undefined)?.message ??
              'Authentication failed';
            console.error('[WebSocket] Authentication failed:', errorMsg);
            setConnectionState((prev) => ({
              ...prev,
              status: 'error',
            }));
            onAuthError?.(errorMsg);
            ws.close();
            return;
          }

          // Only process messages if authenticated
          if (connectionState.status !== 'connected') {
            console.warn('[WebSocket] Received message before authentication complete');
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
  };
}
