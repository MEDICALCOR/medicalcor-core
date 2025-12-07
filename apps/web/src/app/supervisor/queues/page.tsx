import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getQueueStatusesAction, getQueueSummaryAction } from './actions';
import { QueueSummaryStats, QueueSummaryStatsSkeleton } from './components/queue-summary-stats';
import { QueueList, QueueListSkeleton } from './components/queue-list';

/**
 * Queue Management Dashboard Page
 *
 * Real-time queue SLA monitoring for supervisors.
 * Shows all queues with their compliance status and key metrics.
 *
 * Features:
 * - Mobile-first responsive design
 * - Real-time SLA status updates
 * - Filtering and sorting capabilities
 * - Breach alerts and notifications
 */

async function QueueDashboardLoader() {
  const [queues, summary] = await Promise.all([getQueueStatusesAction(), getQueueSummaryAction()]);

  return (
    <div className="space-y-6">
      <QueueSummaryStats summary={summary} />
      <QueueList queues={queues} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <QueueSummaryStatsSkeleton />
      <QueueListSkeleton />
    </div>
  );
}

export default function QueueManagementPage() {
  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/supervisor">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to Supervisor Dashboard</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Queue Management</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Real-time queue SLA monitoring
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Dashboard content */}
      <Suspense fallback={<DashboardSkeleton />}>
        <QueueDashboardLoader />
      </Suspense>
    </div>
  );
}

// Metadata for the page
export const metadata = {
  title: 'Queue Management | Supervisor Dashboard',
  description: 'Real-time queue SLA monitoring and management for supervisors',
};
