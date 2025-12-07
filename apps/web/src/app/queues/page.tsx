import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Activity, RefreshCw } from 'lucide-react';
import {
  getQueueDashboardStatsAction,
  getQueueStatusesAction,
  getRecentBreachesAction,
  getBreachSummaryAction,
  getDailyBreachStatsAction,
} from './actions';
import { QueueStats, QueueStatsSkeleton } from './components/queue-stats';
import { QueueStatusList, QueueStatusListSkeleton } from './components/queue-status-list';
import {
  BreachAlerts,
  BreachAlertsSkeleton,
  BreachSummaryPanel,
  BreachSummarySkeleton,
  BreachTrendChart,
  BreachTrendSkeleton,
} from './components/breach-alerts';

/**
 * Queue SLA Dashboard (M5)
 *
 * Real-time queue monitoring dashboard with SLA compliance tracking and breach alerts.
 *
 * Features:
 * - Real-time queue status visualization
 * - SLA compliance metrics
 * - Breach alerts with severity levels
 * - Historical breach trends
 * - Agent availability monitoring
 *
 * This dashboard consumes data from the queue_sla_monitor cron job
 * which runs every minute to collect metrics from Twilio Flex.
 */

// =============================================================================
// Async Components for Streaming
// =============================================================================

async function QueueStatsSection() {
  const stats = await getQueueDashboardStatsAction();
  return <QueueStats stats={stats} />;
}

async function QueueStatusSection() {
  const queues = await getQueueStatusesAction();
  return <QueueStatusList queues={queues} />;
}

async function BreachAlertsSection() {
  const breaches = await getRecentBreachesAction(20);
  return <BreachAlerts breaches={breaches} />;
}

async function BreachSummarySection() {
  const summary = await getBreachSummaryAction();
  return <BreachSummaryPanel summary={summary} />;
}

async function BreachTrendSection() {
  const stats = await getDailyBreachStatsAction(7);
  return <BreachTrendChart stats={stats} />;
}

// =============================================================================
// Page Component
// =============================================================================

export default function QueueDashboardPage() {
  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Queue Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            SLA monitoring and breach alerts in real-time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Activity className="h-3 w-3 text-emerald-500" />
            <span className="hidden sm:inline">Live</span>
          </Badge>
          <Badge variant="secondary" className="gap-1 text-xs">
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">1m refresh</span>
          </Badge>
        </div>
      </div>

      {/* Stats Overview */}
      <Suspense fallback={<QueueStatsSkeleton />}>
        <QueueStatsSection />
      </Suspense>

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Queue Status List - Full width on mobile, 2/3 on desktop */}
        <div className="lg:col-span-2 space-y-4">
          <Suspense fallback={<QueueStatusListSkeleton />}>
            <QueueStatusSection />
          </Suspense>
        </div>

        {/* Sidebar - Breach alerts and summary */}
        <div className="space-y-4">
          <Suspense fallback={<BreachAlertsSkeleton />}>
            <BreachAlertsSection />
          </Suspense>

          <Suspense fallback={<BreachSummarySkeleton />}>
            <BreachSummarySection />
          </Suspense>

          <Suspense fallback={<BreachTrendSkeleton />}>
            <BreachTrendSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Metadata
// =============================================================================

export const metadata = {
  title: 'Queue Dashboard | MedicalCor Cortex',
  description: 'Real-time queue SLA monitoring and breach alerts dashboard',
};

// Enable dynamic rendering for real-time data
export const dynamic = 'force-dynamic';
