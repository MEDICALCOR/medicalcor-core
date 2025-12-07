import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, RefreshCw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getQueueDetailAction, getQueueBreachesAction } from '../actions';
import { QueueMetrics, QueueMetricsSkeleton } from '../components/queue-metrics';
import { BreachTimeline, BreachTimelineSkeleton } from '../components/breach-timeline';
import { SLAComplianceGauge, SLAComplianceGaugeSkeleton } from '../components/sla-compliance-gauge';

interface QueueDetailPageProps {
  params: Promise<{ queueSid: string }>;
}

/**
 * Queue Detail Dashboard Page
 *
 * Detailed view of a single queue's SLA status, metrics, and breach history.
 * Provides comprehensive monitoring for supervisors.
 *
 * Features:
 * - Real-time queue metrics
 * - SLA compliance gauge
 * - Breach history timeline
 * - Configuration settings access
 */

async function QueueDetailLoader({ queueSid }: { queueSid: string }) {
  const [queueData, breaches] = await Promise.all([
    getQueueDetailAction(queueSid),
    getQueueBreachesAction(queueSid),
  ]);

  if (!queueData.status || !queueData.config) {
    notFound();
  }

  const { status, config } = queueData;

  return (
    <div className="space-y-6">
      {/* Queue header with status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold">{status.queueName}</h1>
            <Badge
              variant={
                status.severity === 'ok'
                  ? 'default'
                  : status.severity === 'warning'
                    ? 'outline'
                    : 'destructive'
              }
              className={
                status.severity === 'ok'
                  ? 'bg-emerald-100 text-emerald-700'
                  : status.severity === 'warning'
                    ? 'bg-amber-100 text-amber-700 border-amber-200'
                    : ''
              }
            >
              {status.severity.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Queue ID: {status.queueSid}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Configure SLA</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Main dashboard grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column - Metrics */}
        <div className="lg:col-span-2 space-y-6">
          <QueueMetrics status={status} config={config} />
        </div>

        {/* Right column - Compliance & Breaches */}
        <div className="space-y-6">
          <SLAComplianceGauge status={status} config={config} trend="stable" />
          <BreachTimeline breaches={breaches} />
        </div>
      </div>

      {/* Last updated timestamp */}
      <p className="text-xs text-muted-foreground text-center">
        Last updated: {new Date(status.lastUpdated).toLocaleString('ro-RO')}
      </p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="h-7 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-32 bg-muted rounded animate-pulse mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-muted rounded animate-pulse" />
          <div className="h-9 w-20 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <QueueMetricsSkeleton />
        </div>
        <div className="space-y-6">
          <SLAComplianceGaugeSkeleton />
          <BreachTimelineSkeleton />
        </div>
      </div>
    </div>
  );
}

export default async function QueueDetailPage({ params }: QueueDetailPageProps) {
  const { queueSid } = await params;

  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* Navigation header */}
      <div className="flex items-center gap-3">
        <Link href="/supervisor/queues">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to Queue List</span>
          </Button>
        </Link>
        <div>
          <p className="text-xs text-muted-foreground">Queue Details</p>
        </div>
      </div>

      {/* Dashboard content */}
      <Suspense fallback={<DetailSkeleton />}>
        <QueueDetailLoader queueSid={queueSid} />
      </Suspense>
    </div>
  );
}

// Generate metadata for the page
export async function generateMetadata({ params }: QueueDetailPageProps) {
  const { queueSid } = await params;
  const queueData = await getQueueDetailAction(queueSid);

  return {
    title: queueData.status
      ? `${queueData.status.queueName} | Queue Management`
      : 'Queue Details | Supervisor Dashboard',
    description: 'Detailed queue SLA monitoring and management',
  };
}
