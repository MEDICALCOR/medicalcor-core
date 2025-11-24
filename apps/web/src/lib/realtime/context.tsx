'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useWebSocket } from './use-websocket';
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
  const { data: session, status: sessionStatus } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [urgencies, setUrgencies] = useState<Urgency[]>([]);
  const [readUrgencies, setReadUrgencies] = useState<Set<string>>(new Set());
  const [authError, setAuthError] = useState<string | null>(null);

  // Use environment variable or provided URL
  const url = wsUrl ?? process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws';

  // SECURITY: Get auth token from session for WebSocket authentication
  // The token is derived from the session - in production, use a dedicated WS token endpoint
  const authToken = useMemo(() => {
    if (sessionStatus !== 'authenticated' || !session?.user) {
      return undefined;
    }
    // Use session user ID as token base - server should validate against session store
    // In production, implement a proper token exchange mechanism
    return btoa(JSON.stringify({
      userId: session.user.id,
      email: session.user.email,
      timestamp: Date.now(),
    }));
  }, [session, sessionStatus]);

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

  // Handle new lead events
  useEffect(() => {
    const unsubscribe = subscribe<LeadCreatedPayload>('lead.created', (event) => {
      const newLead: Lead = {
        id: event.data.id,
        phone: event.data.phone,
        source: event.data.source,
        time: formatTimeAgo(new Date(event.timestamp)),
        message: event.data.message,
      };

      setLeads((prev) => [newLead, ...prev].slice(0, 50)); // Keep max 50 leads
    });

    return unsubscribe;
  }, [subscribe]);

  // Handle lead scored events
  useEffect(() => {
    const unsubscribe = subscribe<LeadScoredPayload>('lead.scored', (event) => {
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === event.data.leadId
            ? {
                ...lead,
                score: event.data.score,
                classification: event.data.classification,
                confidence: event.data.confidence,
                reasoning: event.data.reasoning,
                procedureInterest: event.data.procedureInterest,
              }
            : lead
        )
      );
    });

    return unsubscribe;
  }, [subscribe]);

  // Handle urgency events
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

      setUrgencies((prev) => [newUrgency, ...prev].slice(0, 100)); // Cap to prevent unbounded growth
    });

    return unsubscribe;
  }, [subscribe]);

  // Handle urgency resolved
  useEffect(() => {
    const unsubscribe = subscribe<{ id: string }>('urgency.resolved', (event) => {
      setUrgencies((prev) => prev.filter((u) => u.id !== event.data.id));
    });

    return unsubscribe;
  }, [subscribe]);

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
  const { connectionState, isConnected, isAuthenticated, authError, connect, disconnect } = useRealtime();
  return { connectionState, isConnected, isAuthenticated, authError, connect, disconnect };
}
