'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import {
  Webhook,
  RefreshCw,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PagePermissionGate } from '@/components/auth/require-permission';
import { useToast } from '@/hooks/use-toast';
import { WebhookTable, WebhookFilters, WebhookDetailsDialog } from './components';
import {
  type WebhookEvent,
  type WebhookFilter,
  type WebhookStats,
  getWebhooksAction,
  getWebhookStatsAction,
  getEventTypesAction,
  replayWebhookAction,
  replayMultipleWebhooksAction,
} from './actions';

/**
 * Webhook Replay & Debug UI
 *
 * Admin interface for:
 * - Viewing webhook history with filtering
 * - Replaying failed/stale webhooks
 * - Debugging webhook payloads and responses
 * - Monitoring webhook health metrics
 */

export default function WebhooksPage() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // State
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [filter, setFilter] = useState<WebhookFilter>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookEvent | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      const [webhooksData, statsData, typesData] = await Promise.all([
        getWebhooksAction(filter, page),
        getWebhookStatsAction(),
        getEventTypesAction(),
      ]);
      setWebhooks(webhooksData.webhooks);
      setTotal(webhooksData.total);
      setStats(statsData);
      setEventTypes(typesData);
    } finally {
      setIsLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle refresh
  const handleRefresh = () => {
    startTransition(async () => {
      await loadData();
      toast({
        title: 'Refreshed',
        description: 'Webhook data has been updated.',
      });
    });
  };

  // Handle filter change
  const handleFilterChange = (newFilter: WebhookFilter) => {
    setFilter(newFilter);
    setPage(1);
    setSelectedIds([]);
  };

  // Handle single replay
  const handleReplay = async (id: string) => {
    setReplayingId(id);
    try {
      const result = await replayWebhookAction(id);
      if (result.success) {
        toast({
          title: 'Replay successful',
          description: `Webhook ${id} was replayed successfully.`,
        });
      } else {
        toast({
          title: 'Replay failed',
          description: result.errorMessage ?? 'Unknown error occurred.',
          variant: 'destructive',
        });
      }
      // Refresh data
      await loadData();
    } finally {
      setReplayingId(null);
    }
  };

  // Handle bulk replay
  const handleBulkReplay = async () => {
    if (selectedIds.length === 0) return;

    startTransition(async () => {
      const result = await replayMultipleWebhooksAction(selectedIds);
      toast({
        title: 'Bulk replay complete',
        description: `${result.successCount} succeeded, ${result.failedCount} failed.`,
        variant: result.failedCount > 0 ? 'destructive' : 'default',
      });
      setSelectedIds([]);
      await loadData();
    });
  };

  // Handle view details
  const handleViewDetails = (webhook: WebhookEvent) => {
    setSelectedWebhook(webhook);
    setIsDetailsOpen(true);
  };

  if (isLoading) {
    return (
      <PagePermissionGate pathname="/webhooks">
        <div className="space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
              <div className="space-y-2">
                <div className="h-5 w-32 bg-muted animate-pulse rounded" />
                <div className="h-4 w-48 bg-muted animate-pulse rounded" />
              </div>
            </div>
          </div>

          {/* Stats skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Table skeleton */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </PagePermissionGate>
    );
  }

  return (
    <PagePermissionGate pathname="/webhooks">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Webhook className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Webhook Replay</h1>
              <p className="text-sm text-muted-foreground">
                Debug and replay incoming webhooks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {selectedIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkReplay}
                disabled={isPending}
                className="gap-2 flex-1 sm:flex-initial"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Replay {selectedIds.length} selected
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isPending}
              className="gap-2"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Webhooks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{stats.total}</span>
                  <Badge variant="secondary">{total} in view</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{stats.successRate}%</span>
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Failed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{stats.failed}</span>
                  {stats.retrying > 0 && (
                    <Badge variant="warm" className="gap-1">
                      <RefreshCw className="h-3 w-3" />
                      {stats.retrying} retrying
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Avg Response Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold tabular-nums">{stats.avgResponseTime}ms</span>
                  {stats.pending > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {stats.pending} pending
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <WebhookFilters
              filter={filter}
              onFilterChange={handleFilterChange}
              eventTypes={eventTypes}
            />
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="pt-6">
            <WebhookTable
              webhooks={webhooks}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onReplay={handleReplay}
              onViewDetails={handleViewDetails}
              isReplaying={replayingId}
            />

            {/* Pagination info */}
            {total > 0 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {webhooks.length} of {total} webhooks
                </p>
                {total > 20 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">Page {page}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={webhooks.length < 20}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details Dialog */}
        <WebhookDetailsDialog
          webhook={selectedWebhook}
          open={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
          onReplay={handleReplay}
          isReplaying={replayingId === selectedWebhook?.id}
        />
      </div>
    </PagePermissionGate>
  );
}
