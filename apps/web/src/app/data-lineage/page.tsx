'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import {
  Database,
  GitBranch,
  Shield,
  Activity,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Download,
  Eye,
  X,
} from 'lucide-react';
import { PagePermissionGate } from '@/components/auth/require-permission';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  getLineageDashboardDataAction,
  searchLineageEntriesAction,
  getLineageGraphAction,
  generateComplianceReportAction,
  getAggregateTypesAction,
  getTransformationTypesAction,
  getComplianceFrameworksAction,
  getSensitivityLevelsAction,
  type LineageDashboardData,
  type LineageSearchResult,
  type LineageEntryView,
  type LineageGraphView,
  type ComplianceReportView,
} from './actions';
import { LineageGraph } from './components/lineage-graph';
import { LineageEntryDetail } from './components/lineage-entry-detail';
import { ComplianceReport } from './components/compliance-report';

// =============================================================================
// COMPONENTS
// =============================================================================

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-[200px] w-full" />;
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

interface HealthStatusBadgeProps {
  status: 'healthy' | 'degraded' | 'unhealthy';
}

function HealthStatusBadge({ status }: HealthStatusBadgeProps) {
  const config = {
    healthy: { variant: 'success' as const, icon: CheckCircle2, label: 'Healthy' },
    degraded: { variant: 'warm' as const, icon: AlertCircle, label: 'Degraded' },
    unhealthy: { variant: 'destructive' as const, icon: AlertCircle, label: 'Unhealthy' },
  };

  const { variant, icon: Icon, label } = config[status];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-primary',
}: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={cn('p-2 rounded-lg bg-primary/10', iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TransformationBarProps {
  data: { type: string; count: number; avgQuality: number }[];
  maxCount: number;
}

function TransformationBar({ data, maxCount }: TransformationBarProps) {
  const colors: Record<string, string> = {
    scoring: 'bg-blue-500',
    enrichment: 'bg-purple-500',
    ingestion: 'bg-green-500',
    consent_processing: 'bg-teal-500',
    sync: 'bg-orange-500',
    validation: 'bg-yellow-500',
    transformation: 'bg-pink-500',
    derivation: 'bg-indigo-500',
  };

  return (
    <div className="space-y-3">
      {data.map(({ type, count, avgQuality }) => (
        <div key={type} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="capitalize">{type.replace(/_/g, ' ')}</span>
            <span className="text-muted-foreground">
              {count.toLocaleString()} ({(avgQuality * 100).toFixed(0)}% quality)
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', colors[type] ?? 'bg-gray-500')}
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

interface DistributionDonutProps {
  data: { label: string; count: number }[];
}

function DistributionDonut({ data }: DistributionDonutProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-green-500',
    'bg-blue-500',
    'bg-purple-500',
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24">
          <svg viewBox="0 0 100 100" className="transform -rotate-90">
            {
              data.reduce(
                (acc, { count }, i) => {
                  const percentage = (count / total) * 100;
                  const strokeDasharray = `${percentage} ${100 - percentage}`;
                  const strokeDashoffset = -acc.offset;
                  acc.elements.push(
                    <circle
                      key={i}
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      strokeWidth="12"
                      className={cn(
                        'transition-all',
                        colors[i % colors.length].replace('bg-', 'stroke-')
                      )}
                      strokeDasharray={strokeDasharray}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                    />
                  );
                  acc.offset += percentage;
                  return acc;
                },
                { elements: [] as React.ReactNode[], offset: 0 }
              ).elements
            }
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold">{total.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex-1 space-y-1">
          {data.map(({ label, count }, i) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <div className={cn('w-3 h-3 rounded-full', colors[i % colors.length])} />
              <span className="flex-1 capitalize">{label}</span>
              <span className="text-muted-foreground">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function DataLineagePage() {
  // State
  const [activeTab, setActiveTab] = useState<'overview' | 'explore' | 'compliance'>('overview');
  const [dashboardData, setDashboardData] = useState<LineageDashboardData | null>(null);
  const [searchResults, setSearchResults] = useState<LineageSearchResult | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<LineageEntryView | null>(null);
  const [graphData, setGraphData] = useState<LineageGraphView | null>(null);
  const [complianceReport, setComplianceReport] = useState<ComplianceReportView | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [aggregateTypeFilter, setAggregateTypeFilter] = useState<string>('');
  const [transformationFilter, setTransformationFilter] = useState<string>('');
  const [frameworkFilter, setFrameworkFilter] = useState<string>('');
  const [sensitivityFilter, setSensitivityFilter] = useState<string>('');

  // Filter options
  const [aggregateTypes, setAggregateTypes] = useState<string[]>([]);
  const [transformationTypes, setTransformationTypes] = useState<string[]>([]);
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [sensitivityLevels, setSensitivityLevels] = useState<string[]>([]);

  // Graph exploration
  const [graphAggregateId, setGraphAggregateId] = useState('');
  const [graphAggregateType, setGraphAggregateType] = useState('Lead');
  const [graphDirection, setGraphDirection] = useState<'upstream' | 'downstream' | 'both'>('both');

  // Compliance report
  const [reportAggregateId, setReportAggregateId] = useState('');
  const [reportAggregateType, setReportAggregateType] = useState('Patient');
  const [reportFramework, setReportFramework] = useState('HIPAA');
  const [reportStartDate, setReportStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [reportEndDate, setReportEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Dialogs
  const [showEntryDetail, setShowEntryDetail] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  // Loading states
  const [isPending, startTransition] = useTransition();
  const [isSearching, startSearchTransition] = useTransition();
  const [isLoadingGraph, startGraphTransition] = useTransition();
  const [isLoadingReport, startReportTransition] = useTransition();

  // Load dashboard data and filter options
  useEffect(() => {
    startTransition(async () => {
      const [dashboard, aggTypes, transTypes, fworks, sensLevels] = await Promise.all([
        getLineageDashboardDataAction(),
        getAggregateTypesAction(),
        getTransformationTypesAction(),
        getComplianceFrameworksAction(),
        getSensitivityLevelsAction(),
      ]);
      setDashboardData(dashboard);
      setAggregateTypes(aggTypes);
      setTransformationTypes(transTypes);
      setFrameworks(fworks);
      setSensitivityLevels(sensLevels);
    });
  }, []);

  // Search entries when filters change
  const searchEntries = useCallback(() => {
    startSearchTransition(async () => {
      const results = await searchLineageEntriesAction({
        search: searchQuery || undefined,
        aggregateType: aggregateTypeFilter || undefined,
        transformationType: transformationFilter || undefined,
        framework: frameworkFilter || undefined,
        sensitivity: sensitivityFilter || undefined,
        limit: 20,
      });
      setSearchResults(results);
    });
  }, [searchQuery, aggregateTypeFilter, transformationFilter, frameworkFilter, sensitivityFilter]);

  useEffect(() => {
    if (activeTab === 'explore') {
      searchEntries();
    }
  }, [activeTab, searchEntries]);

  // Load graph
  const loadGraph = useCallback(() => {
    if (!graphAggregateId) return;
    startGraphTransition(async () => {
      const graph = await getLineageGraphAction({
        aggregateId: graphAggregateId,
        aggregateType: graphAggregateType,
        direction: graphDirection,
      });
      setGraphData(graph);
      setShowGraph(true);
    });
  }, [graphAggregateId, graphAggregateType, graphDirection]);

  // Generate compliance report
  const generateReport = useCallback(() => {
    if (!reportAggregateId) return;
    startReportTransition(async () => {
      const report = await generateComplianceReportAction({
        aggregateId: reportAggregateId,
        aggregateType: reportAggregateType,
        framework: reportFramework,
        startDate: reportStartDate,
        endDate: reportEndDate,
      });
      setComplianceReport(report);
    });
  }, [reportAggregateId, reportAggregateType, reportFramework, reportStartDate, reportEndDate]);

  // View entry detail
  const viewEntry = (entry: LineageEntryView) => {
    setSelectedEntry(entry);
    setShowEntryDetail(true);
  };

  // Explore entry in graph
  const exploreInGraph = (entry: LineageEntryView) => {
    setGraphAggregateId(entry.targetAggregateId);
    setGraphAggregateType(entry.targetAggregateType);
    setActiveTab('explore');
  };

  return (
    <PagePermissionGate pathname="/data-lineage">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              Data Lineage
              {isPending && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </h1>
            <p className="text-muted-foreground">
              Track data flows for HIPAA/GDPR compliance and debugging
            </p>
          </div>
          {dashboardData && <HealthStatusBadge status={dashboardData.health.status} />}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="explore" className="gap-2">
              <GitBranch className="h-4 w-4" />
              Explore
            </TabsTrigger>
            <TabsTrigger value="compliance" className="gap-2">
              <Shield className="h-4 w-4" />
              Compliance
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            {isPending || !dashboardData ? (
              <MetricsSkeleton />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  title="Total Entries"
                  value={dashboardData.health.totalEntries}
                  subtitle={`Since ${dashboardData.health.oldestEntry?.toLocaleDateString() ?? 'N/A'}`}
                  icon={Database}
                />
                <MetricCard
                  title="Last 24 Hours"
                  value={dashboardData.recentActivity.last24h}
                  subtitle="New lineage entries"
                  icon={Clock}
                  iconColor="text-blue-500"
                />
                <MetricCard
                  title="HIPAA Entries"
                  value={dashboardData.complianceSummary.hipaaEntries}
                  subtitle={`${((dashboardData.complianceSummary.hipaaEntries / dashboardData.health.totalEntries) * 100).toFixed(1)}% of total`}
                  icon={Shield}
                  iconColor="text-green-500"
                />
                <MetricCard
                  title="With Consent"
                  value={dashboardData.complianceSummary.withConsent}
                  subtitle={`${((dashboardData.complianceSummary.withConsent / dashboardData.health.totalEntries) * 100).toFixed(1)}% of total`}
                  icon={CheckCircle2}
                  iconColor="text-teal-500"
                />
              </div>
            )}

            {/* Charts Row */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top Transformations */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top Transformations</CardTitle>
                </CardHeader>
                <CardContent>
                  {isPending || !dashboardData ? (
                    <ChartSkeleton />
                  ) : (
                    <TransformationBar
                      data={dashboardData.topTransformations}
                      maxCount={Math.max(...dashboardData.topTransformations.map((t) => t.count))}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Aggregate Distribution */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Aggregate Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {isPending || !dashboardData ? (
                    <ChartSkeleton />
                  ) : (
                    <DistributionDonut
                      data={dashboardData.aggregateDistribution.map((d) => ({
                        label: d.type,
                        count: d.count,
                      }))}
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Second Charts Row */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Sensitivity Distribution */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Data Sensitivity</CardTitle>
                </CardHeader>
                <CardContent>
                  {isPending || !dashboardData ? (
                    <ChartSkeleton />
                  ) : (
                    <DistributionDonut
                      data={dashboardData.sensitivityDistribution.map((d) => ({
                        label: d.level.toUpperCase(),
                        count: d.count,
                      }))}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Compliance Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Compliance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {isPending || !dashboardData ? (
                    <ChartSkeleton />
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">
                            {dashboardData.complianceSummary.hipaaEntries.toLocaleString()}
                          </div>
                          <div className="text-sm text-muted-foreground">HIPAA Entries</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">
                            {dashboardData.complianceSummary.gdprEntries.toLocaleString()}
                          </div>
                          <div className="text-sm text-muted-foreground">GDPR Entries</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">
                            {dashboardData.complianceSummary.withLegalBasis.toLocaleString()}
                          </div>
                          <div className="text-sm text-muted-foreground">With Legal Basis</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <div className="text-2xl font-bold">
                            {dashboardData.complianceSummary.withConsent.toLocaleString()}
                          </div>
                          <div className="text-sm text-muted-foreground">With Consent</div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Explore Tab */}
          <TabsContent value="explore" className="space-y-6">
            {/* Graph Explorer */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Lineage Graph Explorer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm text-muted-foreground mb-1">Aggregate ID</div>
                    <Input
                      placeholder="Enter aggregate ID..."
                      value={graphAggregateId}
                      onChange={(e) => setGraphAggregateId(e.target.value)}
                      aria-label="Aggregate ID"
                    />
                  </div>
                  <div className="w-40">
                    <div className="text-sm text-muted-foreground mb-1">Type</div>
                    <Select value={graphAggregateType} onValueChange={setGraphAggregateType}>
                      <SelectTrigger aria-label="Aggregate Type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {aggregateTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40">
                    <div className="text-sm text-muted-foreground mb-1">Direction</div>
                    <Select
                      value={graphDirection}
                      onValueChange={(v) => setGraphDirection(v as typeof graphDirection)}
                    >
                      <SelectTrigger aria-label="Direction">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upstream">Upstream (Sources)</SelectItem>
                        <SelectItem value="downstream">Downstream (Impact)</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={loadGraph} disabled={!graphAggregateId || isLoadingGraph}>
                    {isLoadingGraph ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <GitBranch className="h-4 w-4 mr-2" />
                    )}
                    Explore Lineage
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Search and Filters */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search Lineage Entries
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search Bar */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by aggregate ID, event ID, or correlation ID..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchEntries()}
                    />
                  </div>
                  <Button onClick={searchEntries} disabled={isSearching}>
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                  </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                  <Select value={aggregateTypeFilter} onValueChange={setAggregateTypeFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Aggregate Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Types</SelectItem>
                      {aggregateTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={transformationFilter} onValueChange={setTransformationFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Transformation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Transformations</SelectItem>
                      {transformationTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Framework" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Frameworks</SelectItem>
                      {frameworks.map((fw) => (
                        <SelectItem key={fw} value={fw}>
                          {fw}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={sensitivityFilter} onValueChange={setSensitivityFilter}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Sensitivity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Levels</SelectItem>
                      {sensitivityLevels.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(aggregateTypeFilter ||
                    transformationFilter ||
                    frameworkFilter ||
                    sensitivityFilter) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAggregateTypeFilter('');
                        setTransformationFilter('');
                        setFrameworkFilter('');
                        setSensitivityFilter('');
                      }}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Clear Filters
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Results Table */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Results
                    {searchResults && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({searchResults.total.toLocaleString()} entries)
                      </span>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {isSearching ? (
                  <TableSkeleton />
                ) : searchResults ? (
                  <div className="space-y-2">
                    {searchResults.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {entry.targetAggregateType}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {entry.transformationType.replace(/_/g, ' ')}
                              </Badge>
                              {entry.compliance?.frameworks?.map((fw) => (
                                <Badge
                                  key={fw}
                                  variant={fw === 'HIPAA' ? 'success' : 'secondary'}
                                  className="text-xs"
                                >
                                  {fw}
                                </Badge>
                              ))}
                            </div>
                            <div className="text-sm text-muted-foreground truncate">
                              {entry.targetAggregateId}
                            </div>
                          </div>
                          <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="text-center">
                              <div className="font-medium text-foreground">
                                {((entry.quality?.confidence ?? 0) * 100).toFixed(0)}%
                              </div>
                              <div className="text-xs">Quality</div>
                            </div>
                            <div className="text-center">
                              <div className="font-medium text-foreground">
                                {entry.sourcesCount}
                              </div>
                              <div className="text-xs">Sources</div>
                            </div>
                            <div className="text-xs">
                              {new Date(entry.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-4">
                          <Button variant="ghost" size="sm" onClick={() => viewEntry(entry)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => exploreInGraph(entry)}>
                            <GitBranch className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {searchResults.hasMore && (
                      <Button variant="outline" className="w-full mt-4">
                        Load More
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Use the search and filters above to find lineage entries
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance" className="space-y-6">
            {/* Report Generator */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Generate Compliance Report
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm text-muted-foreground mb-1">Subject ID</div>
                    <Input
                      placeholder="Enter patient/lead ID..."
                      value={reportAggregateId}
                      onChange={(e) => setReportAggregateId(e.target.value)}
                      aria-label="Subject ID"
                    />
                  </div>
                  <div className="w-40">
                    <div className="text-sm text-muted-foreground mb-1">Type</div>
                    <Select value={reportAggregateType} onValueChange={setReportAggregateType}>
                      <SelectTrigger aria-label="Subject Type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {aggregateTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32">
                    <div className="text-sm text-muted-foreground mb-1">Framework</div>
                    <Select value={reportFramework} onValueChange={setReportFramework}>
                      <SelectTrigger aria-label="Compliance Framework">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {frameworks.map((fw) => (
                          <SelectItem key={fw} value={fw}>
                            {fw}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-36">
                    <div className="text-sm text-muted-foreground mb-1">Start Date</div>
                    <Input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      aria-label="Report Start Date"
                    />
                  </div>
                  <div className="w-36">
                    <div className="text-sm text-muted-foreground mb-1">End Date</div>
                    <Input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      aria-label="Report End Date"
                    />
                  </div>
                  <Button onClick={generateReport} disabled={!reportAggregateId || isLoadingReport}>
                    {isLoadingReport ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Generate Report
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Report Display */}
            {complianceReport && <ComplianceReport report={complianceReport} />}

            {!complianceReport && (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Enter a subject ID and generate a compliance report</p>
                    <p className="text-sm mt-2">
                      Compliance reports show all data processing activities, sources, and
                      recipients for a specific subject within the selected time period.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Entry Detail Dialog */}
        <Dialog open={showEntryDetail} onOpenChange={setShowEntryDetail}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Lineage Entry Details</DialogTitle>
            </DialogHeader>
            {selectedEntry && (
              <LineageEntryDetail
                entry={selectedEntry}
                onExplore={() => {
                  setShowEntryDetail(false);
                  exploreInGraph(selectedEntry);
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Graph Dialog */}
        <Dialog open={showGraph} onOpenChange={setShowGraph}>
          <DialogContent className="max-w-4xl h-[80vh]">
            <DialogHeader>
              <DialogTitle>
                Lineage Graph: {graphAggregateType} ({graphAggregateId})
              </DialogTitle>
            </DialogHeader>
            {graphData && <LineageGraph graph={graphData} />}
          </DialogContent>
        </Dialog>
      </div>
    </PagePermissionGate>
  );
}
