'use client';

/**
 * Supervisor Context
 *
 * Provides real-time monitoring state and actions for the supervisor dashboard.
 * Manages SSE connection, call monitoring, and intervention actions.
 */

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
import type { MonitoredCall, SupervisorDashboardStats, FlexWorker } from '@medicalcor/types';
import {
  useSupervisorSSE,
  type SupervisorSSEEvent,
  type SSEConnectionState,
} from './use-supervisor-sse';

export interface SupervisorAlert {
  id: string;
  type: 'escalation' | 'long-hold' | 'silence' | 'high-value' | 'ai-handoff';
  severity: 'info' | 'warning' | 'critical';
  callSid?: string;
  agentName?: string;
  message: string;
  timestamp: Date;
}

interface SupervisorSession {
  sessionId: string;
  supervisorId: string;
  supervisorName: string;
  role: 'supervisor' | 'manager' | 'admin';
  monitoringMode?: 'listen' | 'whisper' | 'barge';
  activeCallSid?: string;
}

export interface SupervisorContextValue {
  // Connection state
  connectionState: SSEConnectionState;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;

  // Session state
  session: SupervisorSession | null;
  isSessionActive: boolean;
  createSession: () => Promise<void>;
  endSession: () => Promise<void>;

  // Monitoring data
  stats: SupervisorDashboardStats | null;
  activeCalls: MonitoredCall[];
  agents: FlexWorker[];
  alerts: SupervisorAlert[];

  // Monitoring actions
  startMonitoring: (callSid: string, mode: 'listen' | 'whisper' | 'barge') => Promise<boolean>;
  stopMonitoring: () => Promise<boolean>;
  changeMonitoringMode: (mode: 'listen' | 'whisper' | 'barge') => Promise<boolean>;

  // Call actions
  flagCall: (callSid: string, flag: string) => Promise<boolean>;
  unflagCall: (callSid: string, flag: string) => Promise<boolean>;
  endCall: (callSid: string) => Promise<boolean>;

  // Alert actions
  dismissAlert: (alertId: string) => void;
  dismissAllAlerts: () => void;

  // Handoff actions
  requestHandoff: (callSid: string, reason: string) => Promise<boolean>;

  // Refresh actions
  refreshData: () => Promise<void>;
}

const SupervisorContext = createContext<SupervisorContextValue | null>(null);

interface SupervisorProviderProps {
  children: React.ReactNode;
  apiUrl?: string;
}

const MAX_ALERTS = 50;
const REFRESH_INTERVAL = 30000; // 30 seconds

export function SupervisorProvider({ children, apiUrl }: SupervisorProviderProps) {
  const { data: sessionData, status: authStatus } = useSession();
  const baseUrl = apiUrl ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

  // State
  const [session, setSession] = useState<SupervisorSession | null>(null);
  const [stats, setStats] = useState<SupervisorDashboardStats | null>(null);
  const [activeCalls, setActiveCalls] = useState<MonitoredCall[]>([]);
  const [agents] = useState<FlexWorker[]>([]);
  const [alerts, setAlerts] = useState<SupervisorAlert[]>([]);
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(new Set());

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Generate supervisor ID from session
  const user = sessionData?.user;
  const supervisorId = user?.id ?? '';
  const supervisorName = user?.name ?? 'Supervisor';

  // SSE connection
  const { connectionState, isConnected, connect, disconnect, subscribe } = useSupervisorSSE({
    supervisorId,
    apiUrl: baseUrl,
    autoConnect: false,
  });

  // API helper
  const apiCall = useCallback(
    async <T,>(endpoint: string, options: RequestInit = {}): Promise<T | null> => {
      try {
        // Merge headers safely
        const baseHeaders: HeadersInit = {
          'Content-Type': 'application/json',
          'x-supervisor-id': supervisorId,
        };
        const mergedHeaders = options.headers
          ? new Headers({ ...baseHeaders, ...(options.headers as Record<string, string>) })
          : new Headers(baseHeaders);

        const response = await fetch(`${baseUrl}${endpoint}`, {
          ...options,
          headers: mergedHeaders,
        });

        if (!response.ok) {
          console.error(`API error: ${response.status} ${response.statusText}`);
          return null;
        }

        return (await response.json()) as T;
      } catch (error) {
        console.error('API call failed:', error);
        return null;
      }
    },
    [baseUrl, supervisorId]
  );

  // Fetch dashboard data
  const refreshData = useCallback(async () => {
    const data = await apiCall<{
      stats: SupervisorDashboardStats;
      activeCalls: MonitoredCall[];
      supervisors: SupervisorSession[];
    }>('/supervisor/dashboard');

    if (data) {
      setStats(data.stats);
      setActiveCalls(data.activeCalls);
    }
  }, [apiCall]);

  // Create supervisor session
  const createSession = useCallback(async () => {
    if (session) return;

    const result = await apiCall<{ session: SupervisorSession }>('/supervisor/sessions', {
      method: 'POST',
      body: JSON.stringify({
        supervisorId,
        supervisorName,
        role: 'supervisor' as const,
      }),
    });

    if (result?.session) {
      setSession(result.session);
      connect();
      await refreshData();
    }
  }, [session, supervisorId, supervisorName, apiCall, connect, refreshData]);

  // End supervisor session
  const endSession = useCallback(async () => {
    if (!session) return;

    await apiCall(`/supervisor/sessions/${session.sessionId}`, {
      method: 'DELETE',
    });

    setSession(null);
    disconnect();
  }, [session, apiCall, disconnect]);

  // Start monitoring a call
  const startMonitoring = useCallback(
    async (callSid: string, mode: 'listen' | 'whisper' | 'barge'): Promise<boolean> => {
      if (!session) return false;

      const result = await apiCall<{ success: boolean }>(
        `/supervisor/sessions/${session.sessionId}/monitor`,
        {
          method: 'POST',
          body: JSON.stringify({ callSid, mode }),
        }
      );

      if (result?.success) {
        setSession((prev) =>
          prev
            ? {
                ...prev,
                monitoringMode: mode,
                activeCallSid: callSid,
              }
            : null
        );
      }

      return result?.success ?? false;
    },
    [session, apiCall]
  );

  // Stop monitoring
  const stopMonitoring = useCallback(async (): Promise<boolean> => {
    if (!session) return false;

    const result = await apiCall<{ success: boolean }>(
      `/supervisor/sessions/${session.sessionId}/monitor`,
      {
        method: 'DELETE',
      }
    );

    if (result?.success) {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              monitoringMode: undefined,
              activeCallSid: undefined,
            }
          : null
      );
    }

    return result?.success ?? false;
  }, [session, apiCall]);

  // Change monitoring mode
  const changeMonitoringMode = useCallback(
    async (mode: 'listen' | 'whisper' | 'barge'): Promise<boolean> => {
      if (!session) return false;

      const result = await apiCall<{ success: boolean }>(
        `/supervisor/sessions/${session.sessionId}/monitor/mode`,
        {
          method: 'PUT',
          body: JSON.stringify({ mode }),
        }
      );

      if (result?.success) {
        setSession((prev) => (prev ? { ...prev, monitoringMode: mode } : null));
      }

      return result?.success ?? false;
    },
    [session, apiCall]
  );

  // Flag a call
  const flagCall = useCallback(
    async (callSid: string, flag: string): Promise<boolean> => {
      const result = await apiCall<{ success: boolean }>(`/supervisor/calls/${callSid}/flag`, {
        method: 'POST',
        body: JSON.stringify({ flag }),
      });

      if (result?.success) {
        setActiveCalls((prev) =>
          prev.map((call) =>
            call.callSid === callSid
              ? { ...call, flags: [...call.flags, flag as MonitoredCall['flags'][number]] }
              : call
          )
        );
      }

      return result?.success ?? false;
    },
    [apiCall]
  );

  // Unflag a call
  const unflagCall = useCallback(
    async (callSid: string, flag: string): Promise<boolean> => {
      const result = await apiCall<{ success: boolean }>(
        `/supervisor/calls/${callSid}/flag/${flag}`,
        {
          method: 'DELETE',
        }
      );

      if (result?.success) {
        setActiveCalls((prev) =>
          prev.map((call) =>
            call.callSid === callSid
              ? { ...call, flags: call.flags.filter((f) => f !== flag) }
              : call
          )
        );
      }

      return result?.success ?? false;
    },
    [apiCall]
  );

  // End a call (placeholder - would need Twilio integration)
  const endCall = useCallback((callSid: string): Promise<boolean> => {
    console.warn('End call not fully implemented:', callSid);
    // TODO: Implement call termination via Twilio
    return Promise.resolve(false);
  }, []);

  // Request handoff
  const requestHandoff = useCallback(
    async (callSid: string, reason: string): Promise<boolean> => {
      const result = await apiCall<{ success: boolean; handoffId: string }>('/supervisor/handoff', {
        method: 'POST',
        body: JSON.stringify({
          callSid,
          reason,
          priority: 'high',
        }),
      });

      return result?.success ?? false;
    },
    [apiCall]
  );

  // Alert management
  const dismissAlert = useCallback((alertId: string) => {
    setReadAlertIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
  }, []);

  const dismissAllAlerts = useCallback(() => {
    setReadAlertIds(new Set(alerts.map((a) => a.id)));
  }, [alerts]);

  // Handle SSE events
  useEffect(() => {
    const unsubCallStarted = subscribe('call.started', (event: SupervisorSSEEvent) => {
      const call = event.call as MonitoredCall | undefined;
      if (call) {
        setActiveCalls((prev) => {
          // Avoid duplicates
          if (prev.some((c) => c.callSid === call.callSid)) {
            return prev;
          }
          return [call, ...prev];
        });
      }
    });

    const unsubCallUpdated = subscribe('call.updated', (event: SupervisorSSEEvent) => {
      const callSid = event.callSid;
      const changes = event.changes as Partial<MonitoredCall> | undefined;
      if (callSid && changes) {
        setActiveCalls((prev) =>
          prev.map((call) => (call.callSid === callSid ? { ...call, ...changes } : call))
        );
      }
    });

    const unsubCallEnded = subscribe('call.ended', (event: SupervisorSSEEvent) => {
      const callSid = event.callSid;
      if (callSid) {
        setActiveCalls((prev) => prev.filter((call) => call.callSid !== callSid));
      }
    });

    // Alert events
    const alertTypes = ['alert.escalation', 'alert.long-hold', 'alert.silence', 'alert.high-value'];
    const unsubAlerts = alertTypes.map((type) =>
      subscribe(type, (event: SupervisorSSEEvent) => {
        const alertType = type.split('.')[1] as SupervisorAlert['type'];
        const severity = event.severity as SupervisorAlert['severity'] | undefined;
        const message = event.message as string | undefined;
        const newAlert: SupervisorAlert = {
          id: event.eventId,
          type: alertType,
          severity: severity ?? 'warning',
          callSid: event.callSid,
          message: message ?? 'Alert',
          timestamp: new Date(event.timestamp),
        };

        setAlerts((prev) => {
          // Limit alerts to MAX_ALERTS
          const updated = [newAlert, ...prev];
          return updated.slice(0, MAX_ALERTS);
        });
      })
    );

    return () => {
      unsubCallStarted();
      unsubCallUpdated();
      unsubCallEnded();
      unsubAlerts.forEach((unsub) => unsub());
    };
  }, [subscribe]);

  // Auto-refresh data periodically
  useEffect(() => {
    if (session && isConnected) {
      void refreshData();

      refreshIntervalRef.current = setInterval(() => {
        void refreshData();
      }, REFRESH_INTERVAL);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [session, isConnected, refreshData]);

  // Auto-create session when authenticated
  useEffect(() => {
    if (authStatus === 'authenticated' && !session) {
      void createSession();
    }
  }, [authStatus, session, createSession]);

  // Filter out dismissed alerts
  const visibleAlerts = useMemo(
    () => alerts.filter((a) => !readAlertIds.has(a.id)),
    [alerts, readAlertIds]
  );

  const value = useMemo<SupervisorContextValue>(
    () => ({
      connectionState,
      isConnected,
      connect,
      disconnect,
      session,
      isSessionActive: !!session,
      createSession,
      endSession,
      stats,
      activeCalls,
      agents,
      alerts: visibleAlerts,
      startMonitoring,
      stopMonitoring,
      changeMonitoringMode,
      flagCall,
      unflagCall,
      endCall,
      dismissAlert,
      dismissAllAlerts,
      requestHandoff,
      refreshData,
    }),
    [
      connectionState,
      isConnected,
      connect,
      disconnect,
      session,
      createSession,
      endSession,
      stats,
      activeCalls,
      agents,
      visibleAlerts,
      startMonitoring,
      stopMonitoring,
      changeMonitoringMode,
      flagCall,
      unflagCall,
      endCall,
      dismissAlert,
      dismissAllAlerts,
      requestHandoff,
      refreshData,
    ]
  );

  return <SupervisorContext.Provider value={value}>{children}</SupervisorContext.Provider>;
}

export function useSupervisor() {
  const context = useContext(SupervisorContext);
  if (!context) {
    throw new Error('useSupervisor must be used within a SupervisorProvider');
  }
  return context;
}

export function useSupervisorConnection() {
  const { connectionState, isConnected, connect, disconnect } = useSupervisor();
  return { connectionState, isConnected, connect, disconnect };
}

export function useSupervisorActions() {
  const {
    startMonitoring,
    stopMonitoring,
    changeMonitoringMode,
    flagCall,
    unflagCall,
    endCall,
    requestHandoff,
  } = useSupervisor();

  return {
    startMonitoring,
    stopMonitoring,
    changeMonitoringMode,
    flagCall,
    unflagCall,
    endCall,
    requestHandoff,
  };
}
