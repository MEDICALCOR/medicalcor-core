'use client';

/**
 * @fileoverview Circuit Breaker Dashboard
 *
 * M10: Circuit Breaker Dashboard - Ops Visibility
 * Real-time monitoring of circuit breaker states for operational awareness
 * and incident response.
 *
 * Features:
 * - Real-time WebSocket updates for instant state change visibility
 * - Fallback to polling when WebSocket is not available
 * - Live connection status indicator
 * - Visual pulse animations for state transitions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  TrendingDown,
  TrendingUp,
  Zap,
  History,
  RotateCcw,
  Loader2,
  Wifi,
  WifiOff,
  Radio,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCircuitBreakerRealtime, type CircuitBreakerServiceStats } from '@/lib/realtime';
import {
  getCircuitBreakerDashboardAction,
  resetCircuitBreakerAction,
  type CircuitState,
} from '@/app/actions/circuit-breaker';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATE_CONFIG: Record<
  CircuitState,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: typeof Shield;
    description: string;
  }
> = {
  CLOSED: {
    label: 'Healthy',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: ShieldCheck,
    description: 'Service is operating normally',
  },
  OPEN: {
    label: 'Open',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: ShieldOff,
    description: 'Service is unavailable, requests are failing fast',
  },
  HALF_OPEN: {
    label: 'Testing',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    icon: ShieldAlert,
    description: 'Testing recovery, limited requests allowed',
  },
};

const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds (fallback polling)
const REALTIME_STALE_THRESHOLD = 60000; // 60 seconds - consider data stale if no update

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

/**
 * Live connection status indicator showing WebSocket vs Polling mode
 */
function LiveStatusIndicator({
  isRealtime,
  connectionState,
  lastUpdated,
}: {
  isRealtime: boolean;
  connectionState: { status: string };
  lastUpdated: Date | null;
}) {
  const isStale = lastUpdated && Date.now() - lastUpdated.getTime() > REALTIME_STALE_THRESHOLD;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all',
              isRealtime
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            )}
            role="status"
            aria-live="polite"
          >
            {isRealtime ? (
              <>
                <Radio className="h-3 w-3 animate-pulse" />
                <span>Live</span>
              </>
            ) : connectionState.status === 'connecting' ? (
              <>
                <Wifi className="h-3 w-3 animate-pulse" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Polling</span>
              </>
            )}
            {isStale && !isRealtime && <span className="text-yellow-600 ml-1">(stale)</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {isRealtime ? (
            <p>Real-time WebSocket connection active. Updates appear instantly.</p>
          ) : connectionState.status === 'connecting' ? (
            <p>Establishing WebSocket connection...</p>
          ) : (
            <p>
              Using polling mode (every 30s). WebSocket not available.
              {isStale && ' Data may be outdated.'}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Animated pulse effect for recently changed services
 */
function RecentChangePulse({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <span className="absolute -top-1 -right-1 flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
    </span>
  );
}

function StateIndicator({
  state,
  recentlyChanged,
}: {
  state: CircuitState;
  recentlyChanged?: boolean;
}) {
  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'relative flex items-center gap-2 px-2 py-1 rounded-md transition-all',
        config.bgColor,
        recentlyChanged && 'ring-2 ring-blue-400 ring-offset-1'
      )}
    >
      <RecentChangePulse show={!!recentlyChanged} />
      <Icon className={cn('h-4 w-4', config.color)} />
      <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
    </div>
  );
}

function SuccessRateBar({ rate }: { rate: number }) {
  const getColor = (rate: number) => {
    if (rate >= 99) return 'bg-green-500';
    if (rate >= 95) return 'bg-green-400';
    if (rate >= 90) return 'bg-yellow-500';
    if (rate >= 80) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <Progress
        value={rate}
        className={cn('h-2 w-20', '[&>div]:transition-all', `[&>div]:${getColor(rate)}`)}
      />
      <span
        className={cn(
          'text-sm font-medium',
          rate >= 95 ? 'text-green-600' : rate >= 80 ? 'text-yellow-600' : 'text-red-600'
        )}
      >
        {rate.toFixed(1)}%
      </span>
    </div>
  );
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString('ro-RO');
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CircuitBreakerDashboardPage() {
  const [resetDialog, setResetDialog] = useState<{ open: boolean; service: string | null }>({
    open: false,
    service: null,
  });
  const [isResetting, setIsResetting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  // Track recently changed services for visual feedback
  const [recentlyChanged, setRecentlyChanged] = useState<Set<string>>(new Set());
  const recentlyChangedTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Polling fallback function for when WebSocket is not available
  const fetchCircuitBreakerData = useCallback(async () => {
    const dashboardData = await getCircuitBreakerDashboardAction();
    return {
      services: dashboardData.services as CircuitBreakerServiceStats[],
      openCircuits: dashboardData.openCircuits,
      stats: dashboardData.stats,
    };
  }, []);

  // Use real-time hook with WebSocket updates + polling fallback
  const {
    data: realtimeData,
    isLoading,
    error,
    refresh,
    isRealtime,
    connectionState,
  } = useCircuitBreakerRealtime({
    pollingInterval: AUTO_REFRESH_INTERVAL,
    enableRealtime: true,
    onPollingFetch: fetchCircuitBreakerData,
  });

  // Track state changes for visual feedback
  useEffect(() => {
    if (!isRealtime) return;

    // When we get real-time updates, mark changed services
    const markAsChanged = (serviceName: string) => {
      setRecentlyChanged((prev) => new Set([...prev, serviceName]));

      // Clear existing timeout for this service
      const existingTimeout = recentlyChangedTimeoutRef.current.get(serviceName);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Remove the pulse after 3 seconds
      const timeout = setTimeout(() => {
        setRecentlyChanged((prev) => {
          const next = new Set(prev);
          next.delete(serviceName);
          return next;
        });
        recentlyChangedTimeoutRef.current.delete(serviceName);
      }, 3000);

      recentlyChangedTimeoutRef.current.set(serviceName, timeout);
    };

    // Check for state changes in the history - use optional chaining for safety
    const latestService = realtimeData.stateHistory[0]?.service;
    if (latestService) {
      markAsChanged(latestService);
    }
  }, [realtimeData.stateHistory, isRealtime]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      recentlyChangedTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      await refresh();
      toast({
        title: 'Updated',
        description: isRealtime
          ? 'Data refreshed (real-time updates active)'
          : 'Circuit breaker data refreshed',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to refresh data',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleReset(serviceName: string) {
    setIsResetting(true);
    try {
      const result = await resetCircuitBreakerAction(serviceName);

      if (result.success) {
        toast({
          title: 'Circuit Reset',
          description: result.message,
        });
        await refresh();
      } else {
        toast({
          title: 'Reset Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to reset circuit breaker',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
      setResetDialog({ open: false, service: null });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <p className="text-muted-foreground">Failed to load circuit breaker data</p>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const stats = realtimeData.stats;
  const services = realtimeData.services;
  const openCircuits = realtimeData.openCircuits;
  const stateHistory = realtimeData.stateHistory;
  const hasIssues = stats.openCount > 0 || stats.halfOpenCount > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            Circuit Breaker Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time service health monitoring and circuit state visibility
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live Status Indicator */}
          <LiveStatusIndicator
            isRealtime={isRealtime}
            connectionState={connectionState}
            lastUpdated={realtimeData.lastUpdated}
          />
          <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" size="sm">
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alert Banner for Open Circuits */}
      {stats.openCount > 0 && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <p className="font-medium text-red-800 dark:text-red-200">
                {stats.openCount} circuit{stats.openCount > 1 ? 's' : ''} currently open
              </p>
              <p className="text-sm text-red-600 dark:text-red-400">
                Services affected: {openCircuits.join(', ')}
              </p>
            </div>
            {isRealtime && (
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">
                <Radio className="h-3 w-3 mr-1 animate-pulse" />
                Monitoring
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                hasIssues ? 'bg-yellow-100' : 'bg-green-100'
              )}
            >
              <Server className={cn('h-5 w-5', hasIssues ? 'text-yellow-600' : 'text-green-600')} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Services</p>
              <p className="text-xl font-bold">{stats.totalCircuits}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Healthy</p>
              <p className="text-xl font-bold text-green-600">{stats.closedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <ShieldOff className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Open</p>
              <p className="text-xl font-bold text-red-600">{stats.openCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Success Rate</p>
              <p className="text-xl font-bold">{stats.averageSuccessRate.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Request Stats */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Zap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Requests</p>
              <p className="text-xl font-bold">{stats.totalRequests.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <TrendingDown className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Failures</p>
              <p className="text-xl font-bold text-orange-600">
                {stats.totalFailures.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services">
            <Server className="h-4 w-4 mr-1" />
            Services ({stats.totalCircuits})
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1" />
            State History
          </TabsTrigger>
        </TabsList>

        {/* Services Tab */}
        <TabsContent value="services">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Service Circuit Breakers</CardTitle>
                  <CardDescription>
                    {isRealtime
                      ? 'Live status of all protected services (updates instantly)'
                      : 'Status of all protected services (updates every 30s)'}
                  </CardDescription>
                </div>
                {isRealtime && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Radio className="h-3 w-3 mr-1 animate-pulse" />
                    Live Updates
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {services.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No circuit breakers registered</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Requests</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead>Last Failure</TableHead>
                      <TableHead>Last Success</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((service) => {
                      const isRecentlyChanged = recentlyChanged.has(service.name);
                      return (
                        <TableRow
                          key={service.name}
                          className={cn(
                            'transition-colors',
                            service.state === 'OPEN' && 'bg-red-50 dark:bg-red-950/20',
                            service.state === 'HALF_OPEN' && 'bg-yellow-50 dark:bg-yellow-950/20',
                            isRecentlyChanged && 'animate-pulse bg-blue-50 dark:bg-blue-950/20'
                          )}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium capitalize">{service.name}</span>
                              {isRecentlyChanged && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-blue-50 text-blue-600 border-blue-200"
                                >
                                  Updated
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StateIndicator
                              state={service.state}
                              recentlyChanged={isRecentlyChanged}
                            />
                          </TableCell>
                          <TableCell>
                            <SuccessRateBar rate={service.successRate} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {service.totalRequests.toLocaleString()}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={service.totalFailures > 0 ? 'destructive' : 'secondary'}
                            >
                              {service.totalFailures.toLocaleString()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(service.lastFailure)}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeTime(service.lastSuccess)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {service.state !== 'CLOSED' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setResetDialog({ open: true, service: service.name })
                                }
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>State Transition History</CardTitle>
                  <CardDescription>
                    {isRealtime
                      ? 'Real-time circuit breaker state changes (live)'
                      : 'Recent circuit breaker state changes'}
                  </CardDescription>
                </div>
                {isRealtime && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Radio className="h-3 w-3 mr-1 animate-pulse" />
                    Live
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {stateHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No state transitions recorded</p>
                  {isRealtime && (
                    <p className="text-sm mt-2">State changes will appear here in real-time</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {stateHistory.map((event, idx: number) => {
                    const fromConfig = STATE_CONFIG[event.fromState];
                    const toConfig = STATE_CONFIG[event.toState];
                    const FromIcon = fromConfig.icon;
                    const ToIcon = toConfig.icon;
                    const isNew = idx === 0 && recentlyChanged.has(event.service);

                    return (
                      <div
                        key={idx}
                        className={cn(
                          'flex items-center gap-4 p-3 rounded-lg border bg-card transition-all',
                          isNew &&
                            'ring-2 ring-blue-400 ring-offset-1 animate-pulse bg-blue-50 dark:bg-blue-950/20'
                        )}
                      >
                        <div className="flex-shrink-0 relative">
                          <Server className="h-5 w-5 text-muted-foreground" />
                          {isNew && (
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium capitalize">{event.service}</span>
                            {isNew && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-blue-50 text-blue-600 border-blue-200"
                              >
                                Just now
                              </Badge>
                            )}
                            <div className="flex items-center gap-1">
                              <FromIcon className={cn('h-4 w-4', fromConfig.color)} />
                              <span className="text-muted-foreground">→</span>
                              <ToIcon className={cn('h-4 w-4', toConfig.color)} />
                            </div>
                            <Badge variant="outline" className={toConfig.bgColor}>
                              {toConfig.label}
                            </Badge>
                          </div>
                          {event.reason && (
                            <p className="text-sm text-muted-foreground mt-1">{event.reason}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(event.timestamp)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Last Updated */}
      <div className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <span>
          Last updated:{' '}
          {realtimeData.lastUpdated ? realtimeData.lastUpdated.toLocaleString('ro-RO') : 'Unknown'}
        </span>
        {isRealtime && (
          <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
            <Radio className="h-2.5 w-2.5 mr-1 animate-pulse" />
            Live
          </Badge>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog
        open={resetDialog.open}
        onOpenChange={(open) =>
          setResetDialog({ open, service: open ? resetDialog.service : null })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Circuit Breaker</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset the circuit breaker for{' '}
              <span className="font-medium">{resetDialog.service}</span>? This will close the
              circuit and allow requests to flow through again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetDialog({ open: false, service: null })}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => resetDialog.service && handleReset(resetDialog.service)}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Circuit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
