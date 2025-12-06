import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Wifi } from 'lucide-react';
import {
  getSupervisorStatsAction,
  getActiveCallsAction,
  getAgentStatusesAction,
  getAlertsAction,
} from './actions';
import {
  SupervisorStats,
  SupervisorStatsSkeleton,
} from './components/supervisor-stats';
import {
  ActiveCallsList,
  ActiveCallsListSkeleton,
} from './components/active-calls-list';
import {
  AgentStatusGrid,
  AgentStatusGridSkeleton,
} from './components/agent-status-grid';
import { AlertsPanel, AlertsPanelSkeleton } from './components/alerts-panel';

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
 * - Real-time stats updates
 * - Horizontal scroll for stats on mobile
 */

// Async components for streaming
async function SupervisorStatsSection() {
  const stats = await getSupervisorStatsAction();
  return <SupervisorStats stats={stats} />;
}

async function ActiveCallsSection() {
  const calls = await getActiveCallsAction();
  return <ActiveCallsList calls={calls} />;
}

async function AgentStatusSection() {
  const agents = await getAgentStatusesAction();
  return <AgentStatusGrid agents={agents} />;
}

async function AlertsSection() {
  const alerts = await getAlertsAction();
  return <AlertsPanel alerts={alerts} />;
}

export default function SupervisorDashboardPage() {
  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* Header - compact on mobile */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Supervisor
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Monitor apeluri în timp real
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-xs">
          <Wifi className="h-3 w-3 text-emerald-500" />
          <span className="hidden sm:inline">Conectat</span>
        </Badge>
      </div>

      {/* Stats Section */}
      <Suspense fallback={<SupervisorStatsSkeleton />}>
        <SupervisorStatsSection />
      </Suspense>

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Active Calls - Full width on mobile, 2/3 on desktop */}
        <div className="lg:col-span-2 space-y-4">
          <Suspense fallback={<ActiveCallsListSkeleton />}>
            <ActiveCallsSection />
          </Suspense>
        </div>

        {/* Sidebar - Stacks below on mobile */}
        <div className="space-y-4">
          <Suspense fallback={<AlertsPanelSkeleton />}>
            <AlertsSection />
          </Suspense>

          <Suspense fallback={<AgentStatusGridSkeleton />}>
            <AgentStatusSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// Metadata for the page
export const metadata = {
  title: 'Supervisor Dashboard | MedicalCor Cortex',
  description: 'Real-time call monitoring and agent supervision dashboard',
};
