'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSession } from 'next-auth/react';
import { useWebSocket } from './use-websocket';
import { RingBuffer, REALTIME_MEMORY_LIMITS } from './ring-buffer';
import { RealtimeMemoryMonitor, attachMemoryMonitorToWindow } from './memory-monitor';
import type {
  ConnectionState,
  LeadCreatedPayload,
  LeadScoredPayload,
  RealtimeEventHandler,
  RealtimeEventType,
  UrgencyPayload,
} from './types';

interface Lead {
  id: string;
  phone: string;
  source: 'whatsapp' | 'voice' | 'web';
  time: string;
  message?: string;
  score?: number;
  classification?: 'HOT' | 'WARM' | 'COLD';
  confidence?: number;
  reasoning?: string;
  procedureInterest?: string[];
  appointment?: string;
}

interface Urgency {
  id: string;
  leadId: string;
  phone: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
  waitingTime: number;
  createdAt: Date;
}

interface RealtimeContextValue {
  // Connection state
  connectionState: ConnectionState;
  isConnected: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  connect: () => void;
  disconnect: () => void;

  // Subscriptions
  subscribe: <T = unknown>(
    eventType: RealtimeEventType | '*',
    handler: RealtimeEventHandler<T>
  ) => () => void;

  // Live data
  leads: Lead[];
  urgencies: Urgency[];
  unreadCount: number;

  // Actions
  markUrgencyRead: (id: string) => void;
  clearAllUrgencies: () => void;
  isUrgencyRead: (id: string) => boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

interface RealtimeProviderProps {
  children: React.ReactNode;
  wsUrl?: string;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'acum';
  if (diffMins < 60) return `${diffMins} min`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
  return `${Math.floor(diffMins / 1440)}d`;
}

export function RealtimeProvider({ children, wsUrl }: RealtimeProviderProps) {
  const { status: sessionStatus } = useSession();

  // Use Ring Buffers for memory-bounded storage
  // This prevents infinite memory growth when tab is open for 8+ hours
  const leadsBufferRef = useRef(new RingBuffer<Lead>(REALTIME_MEMORY_LIMITS.LEADS));
  const urgenciesBufferRef = useRef(new RingBuffer<Urgency>(REALTIME_MEMORY_LIMITS.URGENCIES));

  // Register buffers with memory monitor for debugging (development only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      RealtimeMemoryMonitor.registry.registerBuffer('leads', leadsBufferRef.current);
      RealtimeMemoryMonitor.registry.registerBuffer('urgencies', urgenciesBufferRef.current);
      attachMemoryMonitorToWindow();
    }

    return () => {
      if (process.env.NODE_ENV === 'development') {
        RealtimeMemoryMonitor.registry.unregister('leads');
        RealtimeMemoryMonitor.registry.unregister('urgencies');
      }
    };
  }, []);

  // State that triggers re-renders (derived from buffers)
  const [leads, setLeads] = useState<Lead[]>([]);
  const [urgencies, setUrgencies] = useState<Urgency[]>([]);
  const [readUrgencies, setReadUrgencies] = useState<Set<string>>(new Set());
  const [authError, setAuthError] = useState<string | null>(null);

  // Cleanup interval ref for proper cleanup
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Use environment variable or provided URL
  const url = wsUrl ?? process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws';

  // SECURITY: WebSocket authentication using server-signed JWT tokens
  // Flow:
  //   1. Client calls /api/ws/token with session cookie
  //   2. Server validates session and returns short-lived JWT (5 min)
  //   3. Client uses JWT for WebSocket auth
  //   4. WebSocket server validates JWT signature and expiry
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const tokenRefreshRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch WebSocket auth token from server
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchWsToken = useCallback(async () => {
    // Abort any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/ws/token', {
        method: 'POST',
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        setAuthToken(undefined);
        return;
      }

      const data = (await response.json()) as { token: string; expiresIn: number };
      setAuthToken(data.token);

      // Schedule token refresh 30 seconds before expiry
      const refreshIn = (data.expiresIn - 30) * 1000;
      if (refreshIn > 0) {
        tokenRefreshRef.current = setTimeout(() => {
          void fetchWsToken();
        }, refreshIn);
      }
    } catch (error) {
      // Ignore aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      setAuthToken(undefined);
    }
  }, []);

  // Fetch token when authenticated
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      void fetchWsToken();
    } else {
      setAuthToken(undefined);
      if (tokenRefreshRef.current) {
        clearTimeout(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
    }

    return () => {
      if (tokenRefreshRef.current) {
        clearTimeout(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
      // Abort in-flight token fetch on cleanup
      abortControllerRef.current?.abort();
    };
  }, [sessionStatus, fetchWsToken]);

  const { connectionState, isConnected, connect, disconnect, subscribe } = useWebSocket({
    url,
    authToken,
    onOpen: () => {
      setAuthError(null);
      // Request initial state when connected
    },
    onAuthError: (message) => {
      setAuthError(message);
      console.error('[Realtime] WebSocket authentication failed:', message);
    },
  });

  // Only auto-connect when authenticated
  useEffect(() => {
    if (sessionStatus === 'authenticated' && authToken) {
      connect();
    } else if (sessionStatus === 'unauthenticated') {
      disconnect();
    }
  }, [sessionStatus, authToken, connect, disconnect]);

  // Handle new lead events - using Ring Buffer for memory safety
  useEffect(() => {
    const unsubscribe = subscribe<LeadCreatedPayload>('lead.created', (event) => {
      const newLead: Lead = {
        id: event.data.id,
        phone: event.data.phone,
        source: event.data.source,
        time: formatTimeAgo(new Date(event.timestamp)),
        message: event.data.message,
      };

      // Add to ring buffer (automatically evicts oldest if at capacity)
      leadsBufferRef.current.push(newLead);
      // Update state from buffer (newest first for display)
      setLeads(leadsBufferRef.current.toArrayReversed());
    });

    return unsubscribe;
  }, [subscribe]);

  // Handle lead scored events - update in ring buffer
  useEffect(() => {
    const unsubscribe = subscribe<LeadScoredPayload>('lead.scored', (event) => {
      // Update lead in buffer
      leadsBufferRef.current.update(
        (lead) => lead.id === event.data.leadId,
        (lead) => ({
          ...lead,
          score: event.data.score,
          classification: event.data.classification,
          confidence: event.data.confidence,
          reasoning: event.data.reasoning,
          procedureInterest: event.data.procedureInterest,
        })
      );
      // Update state from buffer
      setLeads(leadsBufferRef.current.toArrayReversed());
    });

    return unsubscribe;
  }, [subscribe]);

  // Handle urgency events - using Ring Buffer for memory safety
  useEffect(() => {
    const unsubscribe = subscribe<UrgencyPayload>('urgency.new', (event) => {
      const newUrgency: Urgency = {
        id: event.data.id,
        leadId: event.data.leadId,
        phone: event.data.phone,
        reason: event.data.reason,
        priority: event.data.priority,
        waitingTime: event.data.waitingTime,
        createdAt: new Date(event.timestamp),
      };

      // Add to ring buffer (automatically evicts oldest if at capacity)
      urgenciesBufferRef.current.push(newUrgency);
      // Update state from buffer (newest first for display)
      setUrgencies(urgenciesBufferRef.current.toArrayReversed());
    });

    return unsubscribe;
  }, [subscribe]);

  // Handle urgency resolved - remove from buffer
  useEffect(() => {
    const unsubscribe = subscribe<{ id: string }>('urgency.resolved', (event) => {
      // Remove from ring buffer
      urgenciesBufferRef.current.remove((u) => u.id === event.data.id);
      // Update state from buffer
      setUrgencies(urgenciesBufferRef.current.toArrayReversed());
    });

    return unsubscribe;
  }, [subscribe]);

  // Periodic cleanup of read urgencies to prevent memory leaks
  // This cleans up the readUrgencies Set which could grow unbounded
  useEffect(() => {
    cleanupIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const maxAge = REALTIME_MEMORY_LIMITS.READ_URGENCY_MAX_AGE_MS;

      // Clean up read urgencies that are no longer in the buffer
      setReadUrgencies((prev) => {
        const currentUrgencyIds = new Set(urgenciesBufferRef.current.map((u) => u.id));
        const cleaned = new Set<string>();

        for (const id of prev) {
          // Keep only if urgency still exists in buffer
          if (currentUrgencyIds.has(id)) {
            cleaned.add(id);
          }
        }

        // Also clean up old urgencies from buffer that were read
        const cutoffTime = new Date(now - maxAge);
        urgenciesBufferRef.current.remove((u) => prev.has(u.id) && u.createdAt < cutoffTime);

        return cleaned;
      });

      // Update urgencies state after cleanup
      setUrgencies(urgenciesBufferRef.current.toArrayReversed());
    }, REALTIME_MEMORY_LIMITS.CLEANUP_INTERVAL_MS);

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []);

  const markUrgencyRead = useCallback((id: string) => {
    setReadUrgencies((prev) => new Set([...prev, id]));
  }, []);

  const clearAllUrgencies = useCallback(() => {
    setReadUrgencies(new Set(urgencies.map((u) => u.id)));
  }, [urgencies]);

  const isUrgencyRead = useCallback((id: string) => readUrgencies.has(id), [readUrgencies]);

  const unreadCount = useMemo(
    () => urgencies.filter((u) => !readUrgencies.has(u.id)).length,
    [urgencies, readUrgencies]
  );

  const isAuthenticated = sessionStatus === 'authenticated' && !!authToken;

  const value = useMemo<RealtimeContextValue>(
    () => ({
      connectionState,
      isConnected,
      isAuthenticated,
      authError,
      connect,
      disconnect,
      subscribe,
      leads,
      urgencies,
      unreadCount,
      markUrgencyRead,
      clearAllUrgencies,
      isUrgencyRead,
    }),
    [
      connectionState,
      isConnected,
      isAuthenticated,
      authError,
      connect,
      disconnect,
      subscribe,
      leads,
      urgencies,
      unreadCount,
      markUrgencyRead,
      clearAllUrgencies,
      isUrgencyRead,
    ]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

// Convenience hooks for specific event types
export function useRealtimeLeads() {
  const { leads, subscribe } = useRealtime();
  return { leads, subscribe };
}

export function useRealtimeUrgencies() {
  const { urgencies, unreadCount, markUrgencyRead, clearAllUrgencies, isUrgencyRead } =
    useRealtime();
  return { urgencies, unreadCount, markUrgencyRead, clearAllUrgencies, isUrgencyRead };
}

export function useRealtimeConnection() {
  const { connectionState, isConnected, isAuthenticated, authError, connect, disconnect } =
    useRealtime();
  return { connectionState, isConnected, isAuthenticated, authError, connect, disconnect };
}
