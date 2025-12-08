'use client';

/**
 * @fileoverview Capacity Planning Dashboard
 *
 * M12: Shift Scheduling with Capacity Planning
 * Provides demand forecasting, staffing recommendations, and conflict detection.
 */

import { useState, useEffect } from 'react';
import {
  CalendarDays,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  BarChart3,
  Target,
  AlertCircle,
  Calendar,
  UserCheck,
  UserX,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getCapacityDashboardAction,
  type CapacityDashboardData,
  type CapacityMetrics,
  type StaffingRecommendation,
  type ShiftConflict,
} from '@/app/actions';

// ============================================================================
// CONSTANTS
// ============================================================================

const statusColors = {
  understaffed: 'bg-red-100 text-red-700 border-red-200',
  optimal: 'bg-green-100 text-green-700 border-green-200',
  overstaffed: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

const statusLabels = {
  understaffed: 'Sub capacitate',
  optimal: 'Optim',
  overstaffed: 'Supra capacitate',
};

const priorityColors = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-blue-500 text-white',
};

const priorityLabels = {
  critical: 'Critic',
  high: 'Ridicat',
  medium: 'Mediu',
  low: 'Scăzut',
};

const conflictLabels = {
  double_booking: 'Suprapunere',
  insufficient_rest: 'Odihnă insuficientă',
  overtime_exceeded: 'Ore suplimentare',
  consecutive_days: 'Zile consecutive',
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function CapacityPlanningPage() {
  const [data, setData] = useState<CapacityDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
  });

  useEffect(() => {
    void loadData();
  }, [currentWeekStart]);

  async function loadData() {
    try {
      const weekStartStr = currentWeekStart.toISOString().split('T')[0] ?? '';
      const result = await getCapacityDashboardAction(weekStartStr);
      setData(result);
    } catch {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca datele de capacitate',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: 'Actualizat', description: 'Datele au fost reîmprospătate' });
  }

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeekStart((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      return newDate;
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  };

  const formatDateStr = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('ro-RO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const getWeekEndDate = (): Date => {
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    return end;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const summary = data?.summary ?? {
    avgUtilization: 0,
    understaffedDays: 0,
    overstaffedDays: 0,
    totalConflicts: 0,
    weeklyHoursScheduled: 0,
    weeklyHoursRequired: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            Planificare Capacitate
          </h1>
          <p className="text-muted-foreground mt-1">
            Analiză cerere, recomandări personal și detectare conflicte
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[180px]">
            <p className="font-medium">
              {formatDate(currentWeekStart)} - {formatDate(getWeekEndDate())}
            </p>
            <p className="text-sm text-muted-foreground">{currentWeekStart.getFullYear()}</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Actualizează
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Target className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Utilizare medie</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold">{summary.avgUtilization}%</p>
                {summary.avgUtilization < 80 && (
                  <Badge variant="destructive" className="text-xs">
                    Sub
                  </Badge>
                )}
                {summary.avgUtilization >= 80 && summary.avgUtilization <= 100 && (
                  <Badge className="bg-green-500 text-xs">Optim</Badge>
                )}
                {summary.avgUtilization > 100 && (
                  <Badge variant="secondary" className="text-xs">
                    Supra
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <UserX className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Zile sub capacitate</p>
              <p className="text-xl font-bold">{summary.understaffedDays}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Conflicte detectate</p>
              <p className="text-xl font-bold">{summary.totalConflicts}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ore săptămânale</p>
              <p className="text-xl font-bold">
                {summary.weeklyHoursScheduled}
                <span className="text-sm font-normal text-muted-foreground">
                  /{summary.weeklyHoursRequired}h
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts for critical issues */}
      {(data?.recommendations.filter((r) => r.priority === 'critical').length ?? 0) > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Atenție urgentă necesară</AlertTitle>
          <AlertDescription>
            Există {data?.recommendations.filter((r) => r.priority === 'critical').length} zile cu
            lipsă critică de personal în această săptămână.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="capacity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="capacity">
            <CalendarDays className="h-4 w-4 mr-1" />
            Capacitate Zilnică
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <Users className="h-4 w-4 mr-1" />
            Recomandări ({data?.recommendations.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="conflicts">
            <AlertCircle className="h-4 w-4 mr-1" />
            Conflicte ({data?.conflicts.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="forecast">
            <TrendingUp className="h-4 w-4 mr-1" />
            Prognoză
          </TabsTrigger>
        </TabsList>

        {/* Capacity Tab */}
        <TabsContent value="capacity">
          <Card>
            <CardHeader>
              <CardTitle>Capacitate Săptămânală</CardTitle>
              <CardDescription>
                Comparație între personalul programat și necesar pentru fiecare zi
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {(data?.weeklyCapacity ?? []).map((day) => (
                  <div
                    key={day.date}
                    className={cn('p-3 rounded-lg border text-center', statusColors[day.status])}
                  >
                    <p className="font-medium text-sm">{day.dayOfWeek}</p>
                    <p className="text-xs opacity-80">
                      {new Date(day.date).toLocaleDateString('ro-RO', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <div className="mt-3">
                      <p className="text-2xl font-bold">{day.scheduledStaff}</p>
                      <p className="text-xs opacity-80">din {day.requiredStaff} necesari</p>
                    </div>
                    <div className="mt-2">
                      <Progress value={Math.min(day.utilizationRate, 100)} className="h-2" />
                      <p className="text-xs mt-1">{day.utilizationRate}%</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('mt-2 text-xs', statusColors[day.status])}
                    >
                      {statusLabels[day.status]}
                    </Badge>
                    <p className="text-xs mt-2 opacity-80">
                      ~{day.predictedAppointments} programări
                    </p>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex justify-center gap-4 mt-6">
                {Object.entries(statusLabels).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-3 h-3 rounded',
                        statusColors[key as keyof typeof statusColors]
                      )}
                    />
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations">
          <Card>
            <CardHeader>
              <CardTitle>Recomandări Personal</CardTitle>
              <CardDescription>Acțiuni sugerate pentru optimizarea programului</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.recommendations.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>Nicio problemă de capacitate detectată</p>
                  <p className="text-sm">Programul săptămânii este optim</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data?.recommendations.map((rec, idx) => (
                    <div key={idx} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={priorityColors[rec.priority]}>
                              {priorityLabels[rec.priority]}
                            </Badge>
                            <span className="font-medium">
                              {rec.dayOfWeek}, {formatDateStr(rec.date)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{rec.reason}</p>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1">
                              <UserX className="h-4 w-4 text-red-500" />
                              Actual: {rec.currentStaff}
                            </span>
                            <span className="flex items-center gap-1">
                              <UserCheck className="h-4 w-4 text-green-500" />
                              Necesar: {rec.recommendedStaff}
                            </span>
                            <Badge variant={rec.gap < 0 ? 'destructive' : 'default'}>
                              {rec.gap > 0 ? '+' : ''}
                              {rec.gap}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm font-medium mb-2">Acțiuni sugerate:</p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {rec.suggestedActions.map((action, actionIdx) => (
                            <li key={actionIdx} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conflicts Tab */}
        <TabsContent value="conflicts">
          <Card>
            <CardHeader>
              <CardTitle>Conflicte Detectate</CardTitle>
              <CardDescription>Probleme de programare ce necesită atenție</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.conflicts.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>Niciun conflict detectat</p>
                  <p className="text-sm">Toate turele sunt conforme</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data?.conflicts.map((conflict, idx) => (
                    <Alert key={idx} variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle className="flex items-center gap-2">
                        {conflict.staffName}
                        <Badge variant="outline" className="ml-2">
                          {conflictLabels[conflict.conflictType]}
                        </Badge>
                      </AlertTitle>
                      <AlertDescription>
                        <p>{conflict.description}</p>
                        <p className="text-sm mt-1 opacity-80">
                          Data: {formatDateStr(conflict.date)}
                        </p>
                        {conflict.shifts.length > 0 && (
                          <div className="mt-2 flex gap-2">
                            {conflict.shifts.map((shift) => (
                              <Badge key={shift.id} variant="secondary">
                                {shift.type}: {shift.start} - {shift.end}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast">
          <Card>
            <CardHeader>
              <CardTitle>Prognoză Cerere</CardTitle>
              <CardDescription>Estimări bazate pe date istorice și tendințe</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(data?.demandForecast ?? []).map((forecast) => (
                  <div
                    key={forecast.date}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{formatDateStr(forecast.date)}</p>
                        <p className="text-sm text-muted-foreground">
                          Medie istorică: {forecast.historicalAvg} programări
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-lg font-bold">{forecast.predictedAppointments}</p>
                        <p className="text-xs text-muted-foreground">Programări</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold">{forecast.recommendedStaff}</p>
                        <p className="text-xs text-muted-foreground">Personal</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {forecast.trend === 'increasing' && (
                          <Badge className="bg-green-100 text-green-700">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            Creștere
                          </Badge>
                        )}
                        {forecast.trend === 'decreasing' && (
                          <Badge className="bg-red-100 text-red-700">
                            <TrendingDown className="h-3 w-3 mr-1" />
                            Scădere
                          </Badge>
                        )}
                        {forecast.trend === 'stable' && <Badge variant="secondary">Stabil</Badge>}
                      </div>
                      <div className="text-right">
                        <Progress value={forecast.confidence * 100} className="w-20 h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.round(forecast.confidence * 100)}% încredere
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
