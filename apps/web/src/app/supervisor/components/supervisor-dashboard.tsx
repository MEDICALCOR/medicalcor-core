'use client';

/**
 * Supervisor Dashboard Client Component
 *
 * Client-side wrapper that integrates real-time data from the supervisor context
 * with the dashboard UI components.
 */

import Link from 'next/link';
import { SupervisorProvider, useSupervisor } from '@/lib/supervisor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, Loader2, LayoutGrid } from 'lucide-react';
import type { MonitoredCall, SupervisorDashboardStats, FlexWorker } from '@medicalcor/types';
import type { SupervisorAlert } from '../actions';
import { SupervisorStats } from './supervisor-stats';
import { ActiveCallsList } from './active-calls-list';
import { AgentStatusGrid } from './agent-status-grid';
import { AlertsPanel } from './alerts-panel';

interface SupervisorDashboardInnerProps {
  initialStats: SupervisorDashboardStats;
  initialCalls: MonitoredCall[];
  initialAgents: FlexWorker[];
  initialAlerts: SupervisorAlert[];
}

function SupervisorDashboardInner({
  initialStats,
  initialCalls,
  initialAgents,
  initialAlerts,
}: SupervisorDashboardInnerProps) {
  const {
    connectionState,
    session,
    stats: realtimeStats,
    activeCalls: realtimeCalls,
    alerts: realtimeAlerts,
    startMonitoring,
    stopMonitoring,
    endCall,
    dismissAlert,
    dismissAllAlerts,
  } = useSupervisor();

  // Use realtime data when available, otherwise use initial SSR data
  const stats = realtimeStats ?? initialStats;
  const calls = realtimeCalls.length > 0 ? realtimeCalls : initialCalls;
  const alerts = realtimeAlerts.length > 0 ? realtimeAlerts : initialAlerts;
  const agents = initialAgents; // Agents don't update in realtime yet

  // Get active monitoring state from session
  const activeMonitoringCallSid = session?.activeCallSid;
  const activeMonitoringMode = session?.monitoringMode;

  // Handle alert action (navigate to call)
  const handleAlertAction = (alertId: string) => {
    const alert = alerts.find((a) => a.id === alertId);
    if (alert?.callSid) {
      // Find the call and trigger click
      const call = calls.find((c) => c.callSid === alert.callSid);
      if (call) {
        // Dismiss the alert
        dismissAlert(alertId);
        // Could add navigation to the call detail here
      }
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* Header - compact on mobile */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Supervisor</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Monitor apeluri în timp real</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/supervisor/queues">
            <Button variant="outline" size="sm" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Queue SLA</span>
            </Button>
          </Link>
          <ConnectionBadge state={connectionState.status} />
        </div>
      </div>

      {/* Stats Section */}
      <SupervisorStats stats={stats} />

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Active Calls - Full width on mobile, 2/3 on desktop */}
        <div className="lg:col-span-2 space-y-4">
          <ActiveCallsList
            calls={calls}
            onStartMonitoring={startMonitoring}
            onStopMonitoring={stopMonitoring}
            onEndCall={endCall}
            activeMonitoringCallSid={activeMonitoringCallSid}
            activeMonitoringMode={activeMonitoringMode}
          />
        </div>

        {/* Sidebar - Stacks below on mobile */}
        <div className="space-y-4">
          <AlertsPanel
            alerts={alerts}
            onDismiss={dismissAlert}
            onDismissAll={dismissAllAlerts}
            onAlertAction={handleAlertAction}
          />

          <AgentStatusGrid agents={agents} />
        </div>
      </div>
    </div>
  );
}

interface ConnectionBadgeProps {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
}

function ConnectionBadge({ state }: ConnectionBadgeProps) {
  if (state === 'connecting') {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
        <span className="hidden sm:inline">Conectare...</span>
      </Badge>
    );
  }

  if (state === 'connected') {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Wifi className="h-3 w-3 text-emerald-500" />
        <span className="hidden sm:inline">Conectat</span>
      </Badge>
    );
  }

  if (state === 'error') {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-destructive/50">
        <WifiOff className="h-3 w-3 text-destructive" />
        <span className="hidden sm:inline">Eroare</span>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <WifiOff className="h-3 w-3 text-muted-foreground" />
      <span className="hidden sm:inline">Deconectat</span>
    </Badge>
  );
}

interface SupervisorDashboardProps {
  initialStats: SupervisorDashboardStats;
  initialCalls: MonitoredCall[];
  initialAgents: FlexWorker[];
  initialAlerts: SupervisorAlert[];
}

export function SupervisorDashboard(props: SupervisorDashboardProps) {
  return (
    <SupervisorProvider>
      <SupervisorDashboardInner {...props} />
    </SupervisorProvider>
  );
}
