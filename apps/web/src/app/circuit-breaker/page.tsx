'use client';

/**
 * @fileoverview Circuit Breaker Dashboard
 *
 * M10: Circuit Breaker Dashboard - Ops Visibility
 * Real-time monitoring of circuit breaker states for operational awareness
 * and incident response.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getCircuitBreakerDashboardAction,
  resetCircuitBreakerAction,
  type CircuitBreakerDashboardData,
  type CircuitBreakerService,
  type CircuitStateEvent,
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

const AUTO_REFRESH_INTERVAL = 30000; // 30 seconds

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StateIndicator({ state }: { state: CircuitState }) {
  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-2 px-2 py-1 rounded-md', config.bgColor)}>
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
  const [data, setData] = useState<CircuitBreakerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [resetDialog, setResetDialog] = useState<{ open: boolean; service: string | null }>({
    open: false,
    service: null,
  });
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const dashboardData = await getCircuitBreakerDashboardAction();
      setData(dashboardData);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load circuit breaker data',
        variant: 'destructive',
      });
      console.error(error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      void loadData();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
    toast({
      title: 'Updated',
      description: 'Circuit breaker data refreshed',
    });
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
        await loadData();
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

  const stats = data?.stats ?? {
    totalCircuits: 0,
    openCount: 0,
    halfOpenCount: 0,
    closedCount: 0,
    averageSuccessRate: 100,
    totalRequests: 0,
    totalFailures: 0,
  };

  const hasIssues = stats.openCount > 0 || stats.halfOpenCount > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            Circuit Breaker Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time service health monitoring and circuit state visibility
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(autoRefresh && 'bg-green-50 border-green-200')}
          >
            <Activity className={cn('h-4 w-4 mr-2', autoRefresh && 'text-green-600')} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alert Banner for Open Circuits */}
      {stats.openCount > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div className="flex-1">
              <p className="font-medium text-red-800">
                {stats.openCount} circuit{stats.openCount > 1 ? 's' : ''} currently open
              </p>
              <p className="text-sm text-red-600">
                Services affected: {data?.openCircuits.join(', ')}
              </p>
            </div>
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
              <CardTitle>Service Circuit Breakers</CardTitle>
              <CardDescription>Real-time status of all protected services</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.services.length ?? 0) === 0 ? (
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
                    {data?.services.map((service: CircuitBreakerService) => (
                      <TableRow
                        key={service.name}
                        className={cn(
                          service.state === 'OPEN' && 'bg-red-50',
                          service.state === 'HALF_OPEN' && 'bg-yellow-50'
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium capitalize">{service.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StateIndicator state={service.state} />
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
                          <Badge variant={service.totalFailures > 0 ? 'destructive' : 'secondary'}>
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
                              onClick={() => setResetDialog({ open: true, service: service.name })}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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
              <CardTitle>State Transition History</CardTitle>
              <CardDescription>Recent circuit breaker state changes</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.stateHistory.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No state transitions recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data?.stateHistory.map((event: CircuitStateEvent, idx: number) => {
                    const fromConfig = STATE_CONFIG[event.fromState];
                    const toConfig = STATE_CONFIG[event.toState];
                    const FromIcon = fromConfig.icon;
                    const ToIcon = toConfig.icon;

                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                      >
                        <div className="flex-shrink-0">
                          <Server className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium capitalize">{event.service}</span>
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
      <div className="text-center text-sm text-muted-foreground">
        Last updated:{' '}
        {data?.timestamp ? new Date(data.timestamp).toLocaleString('ro-RO') : 'Unknown'}
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
