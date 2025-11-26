import { Suspense } from 'react';
import {
  Users,
  TrendingDown,
  TrendingUp,
  Target,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getCRMDashboardStatsAction,
  getCRMPatientsAction,
  getChurnRiskAlertsAction,
  getNPSTrendDataAction,
  getLoyaltyDistributionAction,
} from '../actions/get-crm-data';
import { NPSTrendChart, LoyaltyPieChart, RetentionBarChart } from '@/components/crm/crm-charts';
import { ChurnAlerts } from '@/components/crm/churn-alerts';
import { PatientsTable } from '@/components/crm/patients-table';

/**
 * CRM Dashboard Page
 * Retention scoring, NPS analytics, and loyalty management
 */

// KPI Card component
interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  gradient: string;
}

function KPICard({ title, value, subtitle, change, trend, icon, gradient }: KPICardProps) {
  return (
    <Card className={`text-white ${gradient}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium opacity-90">{title}</CardTitle>
        <div className="opacity-80">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {subtitle && <p className="text-sm opacity-90">{subtitle}</p>}
        {change && (
          <div className="mt-1 flex items-center text-sm">
            {trend === 'up' && <TrendingUp className="mr-1 h-4 w-4" />}
            {trend === 'down' && <TrendingDown className="mr-1 h-4 w-4" />}
            <span>{change}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Stats Section
async function StatsSection() {
  const stats = await getCRMDashboardStatsAction();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <KPICard
        title="Scor Retenție Mediu"
        value={`${stats.averageRetentionScore}%`}
        change="+12% vs. luna trecută"
        trend="up"
        icon={<Users className="h-6 w-6" />}
        gradient="bg-gradient-to-br from-blue-600 to-blue-700"
      />
      <KPICard
        title="Risc Abandon Ridicat"
        value={stats.patientsAtRisk}
        subtitle="pacienți necesită atenție"
        icon={<TrendingDown className="h-6 w-6" />}
        gradient="bg-gradient-to-br from-red-600 to-red-700"
      />
      <KPICard
        title="NPS Score"
        value={stats.npsScore}
        subtitle={`${stats.promotersCount} promotori`}
        change="+15 vs. luna trecută"
        trend="up"
        icon={<Target className="h-6 w-6" />}
        gradient="bg-gradient-to-br from-green-600 to-green-700"
      />
      <KPICard
        title="Venit Lunar"
        value={`${Math.round(stats.monthlyRevenue / 1000)}K`}
        subtitle="RON"
        change="+8.6%"
        trend="up"
        icon={<DollarSign className="h-6 w-6" />}
        gradient="bg-gradient-to-br from-purple-600 to-purple-700"
      />
    </div>
  );
}

// NPS Section
async function NPSSection() {
  const [stats, npsTrend] = await Promise.all([
    getCRMDashboardStatsAction(),
    getNPSTrendDataAction(),
  ]);

  const npsDistribution = [
    { name: `Promotori (${stats.promotersCount})`, value: stats.promotersCount, color: '#22c55e' },
    { name: `Pasivi (${stats.passivesCount})`, value: stats.passivesCount, color: '#eab308' },
    {
      name: `Detractori (${stats.detractorsCount})`,
      value: stats.detractorsCount,
      color: '#ef4444',
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Evoluție NPS Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NPSTrendChart data={npsTrend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Distribuție NPS</CardTitle>
        </CardHeader>
        <CardContent>
          <RetentionBarChart data={npsDistribution} />
          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <ThumbsUp className="mx-auto mb-1 h-5 w-5 text-green-600" />
              <p className="text-2xl font-bold text-green-600">{stats.promotersCount}</p>
              <p className="text-xs text-muted-foreground">Promotori (9-10)</p>
            </div>
            <div className="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
              <p className="text-2xl font-bold text-yellow-600">{stats.passivesCount}</p>
              <p className="text-xs text-muted-foreground">Pasivi (7-8)</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
              <ThumbsDown className="mx-auto mb-1 h-5 w-5 text-red-600" />
              <p className="text-2xl font-bold text-red-600">{stats.detractorsCount}</p>
              <p className="text-xs text-muted-foreground">Detractori (0-6)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Loyalty Section
async function LoyaltySection() {
  const [stats, distribution] = await Promise.all([
    getCRMDashboardStatsAction(),
    getLoyaltyDistributionAction(),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Distribuție Segmente Loialitate</CardTitle>
        </CardHeader>
        <CardContent>
          <LoyaltyPieChart data={distribution} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statistici per Segment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {distribution.map((segment) => (
            <div
              key={segment.segment}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-4 w-4 rounded-full ${
                    segment.segment === 'Platinum'
                      ? 'bg-purple-500'
                      : segment.segment === 'Gold'
                        ? 'bg-yellow-500'
                        : segment.segment === 'Silver'
                          ? 'bg-gray-400'
                          : 'bg-orange-500'
                  }`}
                />
                <div>
                  <p className="font-semibold">{segment.segment}</p>
                  <p className="text-sm text-muted-foreground">{segment.count} pacienți</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold">{segment.totalLTV.toLocaleString('ro-RO')} RON</p>
                <p className="text-sm text-muted-foreground">LTV Total</p>
              </div>
            </div>
          ))}
          <div className="mt-4 rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">LTV Mediu</p>
            <p className="text-2xl font-bold">
              {stats.averageLifetimeValue.toLocaleString('ro-RO')} RON
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Alerts Section
async function AlertsSection() {
  const alerts = await getChurnRiskAlertsAction();
  return <ChurnAlerts alerts={alerts} />;
}

// Patients Section
async function PatientsSection() {
  const patients = await getCRMPatientsAction();
  return <PatientsTable patients={patients} />;
}

// Loading skeletons
function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className="space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

export default function CRMDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">CRM Dashboard</h2>
        <p className="text-muted-foreground">
          Retenție pacienți, NPS Analytics și Management Loialitate
        </p>
      </div>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="nps">NPS Analytics</TabsTrigger>
          <TabsTrigger value="loyalty">Loialitate</TabsTrigger>
          <TabsTrigger value="patients">Pacienți</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Suspense
            fallback={
              <Card>
                <CardContent className="py-8">
                  <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            }
          >
            <AlertsSection />
          </Suspense>

          <Suspense fallback={<ChartsSkeleton />}>
            <NPSSection />
          </Suspense>
        </TabsContent>

        <TabsContent value="nps" className="space-y-6">
          <Suspense fallback={<ChartsSkeleton />}>
            <NPSSection />
          </Suspense>
        </TabsContent>

        <TabsContent value="loyalty" className="space-y-6">
          <Suspense fallback={<ChartsSkeleton />}>
            <LoyaltySection />
          </Suspense>
        </TabsContent>

        <TabsContent value="patients" className="space-y-6">
          <Suspense fallback={<TableSkeleton />}>
            <PatientsSection />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
