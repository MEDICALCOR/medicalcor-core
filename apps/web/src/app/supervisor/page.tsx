import { Suspense } from 'react';
import {
  getSupervisorStatsAction,
  getActiveCallsAction,
  getAgentStatusesAction,
  getAlertsAction,
} from './actions';
import { SupervisorDashboard } from './components/supervisor-dashboard';
import { SupervisorStatsSkeleton } from './components/supervisor-stats';
import { ActiveCallsListSkeleton } from './components/active-calls-list';
import { AgentStatusGridSkeleton } from './components/agent-status-grid';
import { AlertsPanelSkeleton } from './components/alerts-panel';

/**
 * Mobile Supervisor Dashboard
 *
 * Real-time monitoring dashboard optimized for mobile devices.
 * Provides supervisors with call monitoring, agent status, and alerts.
 *
 * Features:
 * - Mobile-first responsive design
 * - Touch-friendly interactions
 * - Bottom sheet call details
 * - Real-time stats updates via SSE
 * - Horizontal scroll for stats on mobile
 * - Live monitoring actions (Listen, Whisper, Barge)
 */

// Fetch all initial data in parallel
async function SupervisorDashboardLoader() {
  const [stats, calls, agents, alerts] = await Promise.all([
    getSupervisorStatsAction(),
    getActiveCallsAction(),
    getAgentStatusesAction(),
    getAlertsAction(),
  ]);

  return (
    <SupervisorDashboard
      initialStats={stats}
      initialCalls={calls}
      initialAgents={agents}
      initialAlerts={alerts}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse mt-1" />
        </div>
        <div className="h-6 w-20 bg-muted rounded animate-pulse" />
      </div>

      {/* Stats skeleton */}
      <SupervisorStatsSkeleton />

      {/* Main content skeleton */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <ActiveCallsListSkeleton />
        </div>
        <div className="space-y-4">
          <AlertsPanelSkeleton />
          <AgentStatusGridSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function SupervisorDashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SupervisorDashboardLoader />
    </Suspense>
  );
}

// Metadata for the page
export const metadata = {
  title: 'Supervisor Dashboard | MedicalCor Cortex',
  description: 'Real-time call monitoring and agent supervision dashboard',
};
