'use client';

/**
 * @fileoverview Behavioral Insights Dashboard
 *
 * M5: Pattern Detection for Cognitive Memory - Behavioral Insights UI
 * Displays detected behavioral patterns and cognitive insights for patients/leads.
 */

import { useState, useEffect } from 'react';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  Target,
  Sparkles,
  RefreshCw,
  ChevronRight,
  BarChart3,
  Loader2,
  Activity,
  Eye,
  ArrowUpRight,
  Clock,
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getBehavioralInsightsDashboardAction,
  getActionableInsightsAction,
  type InsightsDashboardData,
  type CognitiveInsight,
  type BehavioralPattern,
} from '@/app/actions';

// ============================================================================
// CONSTANTS
// ============================================================================

const patternTypeLabels: Record<string, { label: string; color: string; icon: typeof Brain }> = {
  appointment_rescheduler: {
    label: 'Reprogramare frecventă',
    color: 'bg-yellow-100 text-yellow-700',
    icon: Clock,
  },
  monday_avoider: {
    label: 'Evită ziua de luni',
    color: 'bg-orange-100 text-orange-700',
    icon: Clock,
  },
  high_engagement: {
    label: 'Implicare ridicată',
    color: 'bg-green-100 text-green-700',
    icon: TrendingUp,
  },
  declining_engagement: {
    label: 'Implicare în scădere',
    color: 'bg-red-100 text-red-700',
    icon: TrendingDown,
  },
  quick_responder: {
    label: 'Răspuns rapid',
    color: 'bg-blue-100 text-blue-700',
    icon: Activity,
  },
  slow_responder: {
    label: 'Răspuns lent',
    color: 'bg-gray-100 text-gray-700',
    icon: Clock,
  },
  price_sensitive: {
    label: 'Sensibil la preț',
    color: 'bg-purple-100 text-purple-700',
    icon: Target,
  },
  quality_focused: {
    label: 'Focusat pe calitate',
    color: 'bg-indigo-100 text-indigo-700',
    icon: Sparkles,
  },
};

const insightTypeLabels: Record<
  string,
  { label: string; color: string; icon: typeof AlertTriangle }
> = {
  churn_risk: {
    label: 'Risc de abandon',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertTriangle,
  },
  upsell_opportunity: {
    label: 'Oportunitate upsell',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: ArrowUpRight,
  },
  engagement_drop: {
    label: 'Scădere implicare',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: TrendingDown,
  },
  positive_momentum: {
    label: 'Trend pozitiv',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: TrendingUp,
  },
  pattern_detected: {
    label: 'Pattern detectat',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: Brain,
  },
  reactivation_candidate: {
    label: 'Candidat reactivare',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: RefreshCw,
  },
  referral_opportunity: {
    label: 'Oportunitate referral',
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    icon: Users,
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function BehavioralInsightsPage() {
  const [dashboardData, setDashboardData] = useState<InsightsDashboardData | null>(null);
  const [actionableInsights, setActionableInsights] = useState<CognitiveInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      const [dashboard, actionable] = await Promise.all([
        getBehavioralInsightsDashboardAction(),
        getActionableInsightsAction(),
      ]);
      setDashboardData(dashboard);
      setActionableInsights(actionable);
    } catch (error) {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca datele',
        variant: 'destructive',
      });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({
      title: 'Actualizat',
      description: 'Datele au fost reîmprospătate',
    });
  }

  const getPatternLabel = (type: string) => {
    return patternTypeLabels[type] ?? {
      label: type.replace(/_/g, ' ').replace('llm ', ''),
      color: 'bg-gray-100 text-gray-700',
      icon: Brain,
    };
  };

  const getInsightLabel = (type: string) => {
    return insightTypeLabels[type] ?? {
      label: type.replace(/_/g, ' '),
      color: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: Brain,
    };
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ro-RO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = dashboardData?.stats ?? {
    totalPatterns: 0,
    byType: {},
    highConfidenceCount: 0,
    recentlyDetected: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-600" />
            Behavioral Insights
          </h1>
          <p className="text-muted-foreground mt-1">
            Analiză AI a comportamentului pacienților și lead-urilor
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Actualizează
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Patterns</p>
              <p className="text-xl font-bold">{stats.totalPatterns}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Target className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">High Confidence</p>
              <p className="text-xl font-bold">{stats.highConfidenceCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Recent (7 zile)</p>
              <p className="text-xl font-bold">{stats.recentlyDetected}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Subiecți unici</p>
              <p className="text-xl font-bold">{dashboardData?.subjectsWithPatterns ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actionable Insights Alert */}
      {actionableInsights.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              Insights care necesită atenție ({actionableInsights.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {actionableInsights.slice(0, 3).map((insight, idx) => {
                const insightMeta = getInsightLabel(insight.type);
                const InsightIcon = insightMeta.icon;
                return (
                  <div
                    key={idx}
                    className={cn(
                      'p-3 rounded-lg border flex items-start gap-3',
                      insightMeta.color
                    )}
                  >
                    <InsightIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{insightMeta.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {formatConfidence(insight.confidence)}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1 opacity-90">{insight.description}</p>
                      <p className="text-xs mt-1 font-medium">
                        Acțiune: {insight.recommendedAction}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost">
                      <Eye className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="patterns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="patterns">
            <Brain className="h-4 w-4 mr-1" />
            Patterns ({stats.totalPatterns})
          </TabsTrigger>
          <TabsTrigger value="insights">
            <Sparkles className="h-4 w-4 mr-1" />
            Insights ({dashboardData?.recentInsights.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="distribution">
            <BarChart3 className="h-4 w-4 mr-1" />
            Distribuție
          </TabsTrigger>
        </TabsList>

        {/* Patterns Tab */}
        <TabsContent value="patterns">
          <Card>
            <CardHeader>
              <CardTitle>Patterns Detectate</CardTitle>
              <CardDescription>
                Tipare comportamentale identificate prin analiză AI
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(dashboardData?.topPatterns.length ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nu există patterns detectate</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tip Pattern</TableHead>
                      <TableHead>Subiect</TableHead>
                      <TableHead>Descriere</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Prima detectare</TableHead>
                      <TableHead>Apariții</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData?.topPatterns.map((pattern) => {
                      const patternMeta = getPatternLabel(pattern.patternType);
                      const PatternIcon = patternMeta.icon;
                      return (
                        <TableRow key={pattern.id}>
                          <TableCell>
                            <Badge className={cn('text-xs', patternMeta.color)}>
                              <PatternIcon className="h-3 w-3 mr-1" />
                              {patternMeta.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm capitalize">
                                {pattern.subjectType}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {pattern.subjectId.slice(0, 12)}...
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <p className="text-sm truncate">{pattern.patternDescription}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={pattern.confidence * 100}
                                className="w-16 h-2"
                              />
                              <span className="text-sm font-medium">
                                {formatConfidence(pattern.confidence)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(pattern.firstObservedAt)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{pattern.occurrenceCount}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
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

        {/* Insights Tab */}
        <TabsContent value="insights">
          <Card>
            <CardHeader>
              <CardTitle>Cognitive Insights</CardTitle>
              <CardDescription>
                Recomandări și acțiuni bazate pe patterns detectate
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(dashboardData?.recentInsights ?? []).map((insight, idx) => {
                  const insightMeta = getInsightLabel(insight.type);
                  const InsightIcon = insightMeta.icon;
                  return (
                    <div
                      key={idx}
                      className={cn('p-4 rounded-lg border', insightMeta.color)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-white/50">
                          <InsightIcon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">{insightMeta.label}</h4>
                            <Badge variant="outline">
                              {formatConfidence(insight.confidence)} confidence
                            </Badge>
                          </div>
                          <p className="text-sm mt-1">{insight.description}</p>
                          <div className="mt-3 p-2 bg-white/60 rounded text-sm">
                            <strong>Acțiune recomandată:</strong> {insight.recommendedAction}
                          </div>
                          {insight.supportingEventIds && insight.supportingEventIds.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Bazat pe {insight.supportingEventIds.length} evenimente
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Patterns după Tip</CardTitle>
                <CardDescription>Distribuția patterns detectate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(dashboardData?.patternsByType ?? []).map((item) => {
                    const patternMeta = getPatternLabel(item.type);
                    const PatternIcon = patternMeta.icon;
                    const percentage = stats.totalPatterns
                      ? (item.count / stats.totalPatterns) * 100
                      : 0;
                    return (
                      <div key={item.type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <PatternIcon className="h-4 w-4 text-muted-foreground" />
                            <span>{patternMeta.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {formatConfidence(item.avgConfidence)} avg
                            </span>
                            <Badge variant="secondary">{item.count}</Badge>
                          </div>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Statistici Insights</CardTitle>
                <CardDescription>Rezumat insights generate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(insightTypeLabels).map(([type, meta]) => {
                    const count =
                      dashboardData?.recentInsights.filter((i) => i.type === type).length ?? 0;
                    if (count === 0) return null;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={type}
                        className={cn('p-3 rounded-lg border flex items-center gap-3', meta.color)}
                      >
                        <Icon className="h-5 w-5" />
                        <div className="flex-1">
                          <span className="font-medium">{meta.label}</span>
                        </div>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
