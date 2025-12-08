'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  searchTracesAction,
  getTraceStatsAction,
  lookupTraceAction,
  type Trace,
  type TraceSpan,
  type TraceStats,
} from './actions';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  Search,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  Fingerprint,
  Timer,
  Network,
  Loader2,
  Copy,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const statusColors = {
  ok: 'bg-green-100 text-green-700 border-green-200',
  error: 'bg-red-100 text-red-700 border-red-200',
};

const statusIcons = {
  ok: CheckCircle,
  error: XCircle,
};

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function _formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateId(id: string, length = 12): string {
  if (id.length <= length) return id;
  return `${id.slice(0, length)}...`;
}

interface SpanViewerProps {
  spans: TraceSpan[];
  onClose: () => void;
}

function SpanViewer({ spans, onClose }: SpanViewerProps) {
  const sortedSpans = [...spans].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const minTime = sortedSpans.length > 0 ? new Date(sortedSpans[0].startTime).getTime() : 0;
  const maxTime =
    sortedSpans.length > 0 ? Math.max(...sortedSpans.map((s) => new Date(s.endTime).getTime())) : 0;
  const totalDuration = maxTime - minTime;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {spans.length} span{spans.length !== 1 ? 's' : ''} | Total:{' '}
          {formatDuration(totalDuration)}
        </p>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2">
        {sortedSpans.map((span) => {
          const spanStart = new Date(span.startTime).getTime() - minTime;
          const spanWidth = totalDuration > 0 ? (span.durationMs / totalDuration) * 100 : 100;
          const spanOffset = totalDuration > 0 ? (spanStart / totalDuration) * 100 : 0;
          const StatusIcon = statusIcons[span.status];

          return (
            <div key={span.spanId} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon
                    className={cn(
                      'h-4 w-4',
                      span.status === 'ok' ? 'text-green-600' : 'text-red-600'
                    )}
                  />
                  <span className="font-medium">{span.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {span.service}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatDuration(span.durationMs)}
                </span>
              </div>

              {/* Timeline bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full',
                    span.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                  )}
                  style={{
                    width: `${Math.max(spanWidth, 2)}%`,
                    marginLeft: `${spanOffset}%`,
                  }}
                />
              </div>

              {/* Span attributes */}
              {Object.keys(span.attributes).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {Object.entries(span.attributes)
                    .slice(0, 5)
                    .map(([key, value]) => (
                      <Badge key={key} variant="secondary" className="text-xs font-normal">
                        {key}: {String(value)}
                      </Badge>
                    ))}
                  {Object.keys(span.attributes).length > 5 && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      +{Object.keys(span.attributes).length - 5} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TracesPage() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [stats, setStats] = useState<TraceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'error'>('all');
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const loadData = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const [tracesResult, statsResult] = await Promise.all([
          searchTracesAction({ limit: 100 }),
          getTraceStatsAction(),
        ]);

        setTraces(tracesResult.traces);
        setStats(statsResult.stats);
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to load trace data',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = () => {
    void loadData(true);
  };

  const handleTraceClick = async (trace: Trace) => {
    // Fetch full trace details
    const result = await lookupTraceAction(trace.traceId);
    if (result.trace) {
      setSelectedTrace(result.trace);
      setDialogOpen(true);
    } else {
      // Use the trace we already have if lookup fails
      setSelectedTrace(trace);
      setDialogOpen(true);
    }
  };

  const handleCopyId = (id: string, type: 'trace' | 'correlation') => {
    void navigator.clipboard.writeText(id);
    toast({
      title: 'Copied',
      description: `${type === 'trace' ? 'Trace' : 'Correlation'} ID copied to clipboard`,
    });
  };

  const filteredTraces = traces.filter((trace) => {
    const matchesSearch =
      searchQuery === '' ||
      trace.traceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (trace.correlationId?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesStatus = statusFilter === 'all' || trace.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Request Traces
          </h1>
          <p className="text-muted-foreground mt-1">Monitor request flow with correlation IDs</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Network className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Traces</p>
              <p className="text-xl font-bold">{stats?.totalTraces ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Successful</p>
              <p className="text-xl font-bold">{stats?.successCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Errors</p>
              <p className="text-xl font-bold">{stats?.errorCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Timer className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">P95 Latency</p>
              <p className="text-xl font-bold">{formatDuration(stats?.p95DurationMs ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traces List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Recent Traces</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID..."
                  className="pl-9 w-[200px]"
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(e.target.value)
                  }
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value: string) => setStatusFilter(value as 'all' | 'ok' | 'error')}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ok">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTraces.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No traces found</p>
              <p className="text-sm mt-1">Traces will appear here as requests are processed</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTraces.map((trace) => {
                const StatusIcon = statusIcons[trace.status];
                return (
                  <div
                    key={trace.traceId}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => void handleTraceClick(trace)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        void handleTraceClick(trace);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Status */}
                    <Badge variant="outline" className={cn('shrink-0', statusColors[trace.status])}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {trace.status === 'ok' ? 'OK' : 'Error'}
                    </Badge>

                    {/* IDs */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Fingerprint className="h-4 w-4 text-muted-foreground shrink-0" />
                        <code className="text-sm font-mono">{truncateId(trace.traceId)}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyId(trace.traceId, 'trace');
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      {trace.correlationId && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="text-xs">Correlation:</span>
                          <code className="text-xs font-mono">
                            {truncateId(trace.correlationId)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyId(trace.correlationId!, 'correlation');
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Spans count */}
                    <div className="text-sm text-muted-foreground shrink-0">
                      {trace.spans.length} span{trace.spans.length !== 1 ? 's' : ''}
                    </div>

                    {/* Duration */}
                    <div className="flex items-center gap-1 text-sm shrink-0">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {formatDuration(trace.totalDurationMs)}
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trace Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Trace Details
            </DialogTitle>
          </DialogHeader>
          {selectedTrace && (
            <div className="space-y-4">
              {/* Trace Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Trace ID</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{selectedTrace.traceId}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleCopyId(selectedTrace.traceId, 'trace')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {selectedTrace.correlationId && (
                  <div>
                    <p className="text-sm text-muted-foreground">Correlation ID</p>
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{selectedTrace.correlationId}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopyId(selectedTrace.correlationId!, 'correlation')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline" className={cn(statusColors[selectedTrace.status])}>
                    {selectedTrace.status === 'ok' ? 'Success' : 'Error'}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Duration</p>
                  <p className="font-medium">{formatDuration(selectedTrace.totalDurationMs)}</p>
                </div>
              </div>

              {/* Spans */}
              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Span Timeline</h3>
                <SpanViewer spans={selectedTrace.spans} onClose={() => setDialogOpen(false)} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
