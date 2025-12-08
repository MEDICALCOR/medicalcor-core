'use client';

/**
 * @fileoverview Webhook Replay Dashboard
 *
 * L6: Webhook Replay UI - Admin UI for webhook replay/debug
 * Provides a comprehensive interface for viewing, filtering, and replaying
 * webhook events from all integrated services.
 *
 * Features:
 * - Paginated webhook event list with filtering
 * - Source and status filters
 * - Search by ID, correlation ID, or error message
 * - Bulk replay capability for failed webhooks
 * - Real-time status updates
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Webhook,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  XCircle,
  Play,
  MessageSquare,
  Phone,
  CreditCard,
  Calendar,
  Building2,
  Mic,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getWebhookListAction,
  getWebhookStatsAction,
  replayWebhookAction,
  bulkReplayWebhooksAction,
  type WebhookEvent,
  type WebhookSource,
  type WebhookStatus,
  type WebhookListFilters,
  type WebhookStats,
} from '@/app/actions/webhooks';

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE_CONFIG: Record<
  WebhookSource,
  {
    label: string;
    icon: typeof Webhook;
    color: string;
    bgColor: string;
  }
> = {
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageSquare,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  vapi: {
    label: 'Vapi',
    icon: Mic,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  stripe: {
    label: 'Stripe',
    icon: CreditCard,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  booking: {
    label: 'Booking',
    icon: Calendar,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  voice: {
    label: 'Voice',
    icon: Phone,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
  crm: {
    label: 'CRM',
    icon: Building2,
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
  },
  hubspot: {
    label: 'HubSpot',
    icon: Building2,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100',
  },
};

const STATUS_CONFIG: Record<
  WebhookStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    color: string;
    bgColor: string;
  }
> = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  replayed: {
    label: 'Replayed',
    icon: RotateCcw,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
};

const PAGE_SIZES = [10, 20, 50, 100];

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function SourceBadge({ source }: { source: WebhookSource }) {
  const config = SOURCE_CONFIG[source];
  if (!config) return <Badge variant="outline">{source}</Badge>;

  const Icon = config.icon;
  return (
    <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium', config.bgColor)}>
      <Icon className={cn('h-3 w-3', config.color)} />
      <span className={config.color}>{config.label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: WebhookStatus }) {
  const config = STATUS_CONFIG[status];
  if (!config) return <Badge variant="outline">{status}</Badge>;

  const Icon = config.icon;
  return (
    <div className={cn('flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium', config.bgColor)}>
      <Icon className={cn('h-3 w-3', config.color)} />
      <span className={config.color}>{config.label}</span>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('ro-RO');
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function WebhooksPage() {
  // State
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedWebhooks, setSelectedWebhooks] = useState<Set<string>>(new Set());

  // Filters
  const [filters, setFilters] = useState<WebhookListFilters>({});
  const [searchInput, setSearchInput] = useState('');

  // Dialog state
  const [replayDialog, setReplayDialog] = useState<{ open: boolean; webhook: WebhookEvent | null }>({
    open: false,
    webhook: null,
  });
  const [bulkReplayDialog, setBulkReplayDialog] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  const { toast } = useToast();

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [listResult, statsResult] = await Promise.all([
        getWebhookListAction(page, pageSize, filters),
        getWebhookStatsAction(),
      ]);

      setWebhooks(listResult.webhooks);
      setTotal(listResult.total);
      setStats(statsResult);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load webhook data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [page, pageSize, filters, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  function handleSearch() {
    setFilters((prev) => ({ ...prev, search: searchInput }));
    setPage(1);
  }

  function handleFilterChange(key: keyof WebhookListFilters, value: string | undefined) {
    setFilters((prev) => ({ ...prev, [key]: value === 'all' ? undefined : value }));
    setPage(1);
  }

  function handleClearFilters() {
    setFilters({});
    setSearchInput('');
    setPage(1);
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedWebhooks(new Set(webhooks.map((w) => w.id)));
    } else {
      setSelectedWebhooks(new Set());
    }
  }

  function handleSelectWebhook(webhookId: string, checked: boolean) {
    setSelectedWebhooks((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(webhookId);
      } else {
        next.delete(webhookId);
      }
      return next;
    });
  }

  async function handleReplay(webhook: WebhookEvent) {
    setIsReplaying(true);
    try {
      const result = await replayWebhookAction(webhook.id);

      if (result.success) {
        toast({
          title: 'Webhook Replayed',
          description: result.message,
        });
        await fetchData(true);
      } else {
        toast({
          title: 'Replay Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to replay webhook',
        variant: 'destructive',
      });
    } finally {
      setIsReplaying(false);
      setReplayDialog({ open: false, webhook: null });
    }
  }

  async function handleBulkReplay() {
    if (selectedWebhooks.size === 0) return;

    setIsReplaying(true);
    try {
      const result = await bulkReplayWebhooksAction(Array.from(selectedWebhooks));

      toast({
        title: 'Bulk Replay Complete',
        description: `${result.successCount} succeeded, ${result.failureCount} failed`,
        variant: result.failureCount > 0 ? 'destructive' : 'default',
      });

      setSelectedWebhooks(new Set());
      await fetchData(true);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to replay webhooks',
        variant: 'destructive',
      });
    } finally {
      setIsReplaying(false);
      setBulkReplayDialog(false);
    }
  }

  // ============================================================================
  // PAGINATION
  // ============================================================================

  const totalPages = Math.ceil(total / pageSize);
  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6 text-blue-600" />
            Webhook Replay Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            View, debug, and replay webhook events from all integrations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => fetchData(true)} disabled={isRefreshing} variant="outline" size="sm">
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Success
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.successful.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <XCircle className="h-3 w-3 text-red-600" />
                Failed
              </div>
              <div className="text-2xl font-bold text-red-600">{stats.failed.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 text-yellow-600" />
                Pending
              </div>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <RotateCcw className="h-3 w-3 text-blue-600" />
                Replayed
              </div>
              <div className="text-2xl font-bold text-blue-600">{stats.replayed.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Avg Duration</div>
              <div className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                Clear all
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, correlation ID, or error..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Source filter */}
            <Select
              value={filters.source ?? 'all'}
              onValueChange={(v) => handleFilterChange('source', v)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {Object.entries(SOURCE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status filter */}
            <Select
              value={filters.status ?? 'all'}
              onValueChange={(v) => handleFilterChange('status', v)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleSearch} size="sm">
              <Search className="h-4 w-4 mr-1" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedWebhooks.size > 0 && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedWebhooks.size} selected</Badge>
              <span className="text-sm text-muted-foreground">
                webhooks ready for bulk action
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedWebhooks(new Set())}>
                Clear Selection
              </Button>
              <Button size="sm" onClick={() => setBulkReplayDialog(true)}>
                <Play className="h-4 w-4 mr-1" />
                Replay Selected
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhooks Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Webhook Events</CardTitle>
              <CardDescription>
                {total.toLocaleString()} total events
                {hasActiveFilters && ' (filtered)'}
              </CardDescription>
            </div>
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => {
                setPageSize(parseInt(v, 10));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No webhooks found</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={handleClearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedWebhooks.size === webhooks.length && webhooks.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Correlation ID</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map((webhook) => (
                    <TableRow
                      key={webhook.id}
                      className={cn(
                        webhook.status === 'failed' && 'bg-red-50/50 dark:bg-red-950/20'
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedWebhooks.has(webhook.id)}
                          onCheckedChange={(checked) =>
                            handleSelectWebhook(webhook.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <SourceBadge source={webhook.source} />
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {webhook.eventType}
                        </code>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={webhook.status} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            webhook.httpStatus >= 200 && webhook.httpStatus < 300
                              ? 'default'
                              : webhook.httpStatus >= 400
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {webhook.httpStatus || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {webhook.duration > 0 ? formatDuration(webhook.duration) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              {formatRelativeTime(webhook.receivedAt)}
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(webhook.receivedAt).toLocaleString('ro-RO')}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-muted-foreground truncate max-w-[120px] block">
                          {webhook.correlationId}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link href={`/webhooks/${webhook.id}`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>View Details</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setReplayDialog({ open: true, webhook })}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Replay Webhook</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of{' '}
                  {total.toLocaleString()} results
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Errors Section */}
      {stats && stats.recentErrors.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Recent Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentErrors.map((error, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                >
                  <div className="flex-1">
                    <code className="text-xs text-muted-foreground">{error.eventType}</code>
                    <p className="text-sm text-red-600">{error.error}</p>
                  </div>
                  <Badge variant="secondary">{error.count}x</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single Replay Dialog */}
      <Dialog
        open={replayDialog.open}
        onOpenChange={(open) => setReplayDialog({ open, webhook: open ? replayDialog.webhook : null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replay Webhook</DialogTitle>
            <DialogDescription>
              Are you sure you want to replay this webhook event?
            </DialogDescription>
          </DialogHeader>
          {replayDialog.webhook && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Source</span>
                <SourceBadge source={replayDialog.webhook.source} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Event Type</span>
                <code className="text-sm">{replayDialog.webhook.eventType}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Original Status</span>
                <StatusBadge status={replayDialog.webhook.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Received At</span>
                <span className="text-sm">
                  {new Date(replayDialog.webhook.receivedAt).toLocaleString('ro-RO')}
                </span>
              </div>
              {replayDialog.webhook.error && (
                <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/50">
                  <p className="text-xs text-red-600">{replayDialog.webhook.error}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReplayDialog({ open: false, webhook: null })}
              disabled={isReplaying}
            >
              Cancel
            </Button>
            <Button
              onClick={() => replayDialog.webhook && handleReplay(replayDialog.webhook)}
              disabled={isReplaying}
            >
              {isReplaying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Replaying...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Replay Webhook
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Replay Dialog */}
      <Dialog open={bulkReplayDialog} onOpenChange={setBulkReplayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Replay Webhooks</DialogTitle>
            <DialogDescription>
              Are you sure you want to replay {selectedWebhooks.size} webhook events?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will re-process all selected webhooks with their original payloads.
              Events will be processed sequentially.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkReplayDialog(false)} disabled={isReplaying}>
              Cancel
            </Button>
            <Button onClick={handleBulkReplay} disabled={isReplaying}>
              {isReplaying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Replaying {selectedWebhooks.size}...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Replay {selectedWebhooks.size} Webhooks
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
