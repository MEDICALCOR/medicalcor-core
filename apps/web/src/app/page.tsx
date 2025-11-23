import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  Users,
  Calendar,
  TrendingUp,
  Phone,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { getRecentLeadsAction, getDashboardStatsAction } from './actions/get-patients';
import type { RecentLead, DashboardStats } from '@medicalcor/types';

/**
 * Dashboard Page - Server Component
 *
 * Fetches real data from HubSpot via Server Actions.
 * All data fetching happens on the server - no client-side API calls.
 */

// Stats card configuration with icons
const STAT_CONFIG = {
  totalLeads: { name: 'Leads Activi', icon: Users },
  urgentTriage: { name: 'Triage Urgențe', icon: Activity },
  appointmentsToday: { name: 'Programări Azi', icon: Calendar },
  dailyRevenue: { name: 'Venit Zilnic', icon: TrendingUp },
} as const;

interface StatsCardsProps {
  stats: DashboardStats;
}

function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      key: 'totalLeads',
      name: STAT_CONFIG.totalLeads.name,
      value: stats.totalLeads.toString(),
      icon: STAT_CONFIG.totalLeads.icon,
      trend: 'up' as const,
    },
    {
      key: 'urgentTriage',
      name: STAT_CONFIG.urgentTriage.name,
      value: stats.urgentTriage.toString(),
      icon: STAT_CONFIG.urgentTriage.icon,
      trend: stats.urgentTriage > 5 ? 'up' : ('neutral' as const),
      isAlert: stats.urgentTriage > 5,
    },
    {
      key: 'appointmentsToday',
      name: STAT_CONFIG.appointmentsToday.name,
      value: stats.appointmentsToday.toString(),
      icon: STAT_CONFIG.appointmentsToday.icon,
      trend: 'neutral' as const,
    },
    {
      key: 'activePatients',
      name: 'Pacienți Activi',
      value: stats.activePatients.toString(),
      icon: Users,
      trend: 'up' as const,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((stat) => (
        <Card key={stat.key} className={stat.isAlert ? 'border-destructive/50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
            <stat.icon
              className={`h-4 w-4 ${stat.isAlert ? 'text-destructive' : 'text-muted-foreground'}`}
            />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stat.isAlert ? 'text-destructive' : ''}`}>
              {stat.value}
            </div>
            {stat.isAlert && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="h-3 w-3" />
                Necesită atenție
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface RecentLeadsTableProps {
  leads: RecentLead[];
}

function RecentLeadsTable({ leads }: RecentLeadsTableProps) {
  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="live-pulse pl-4">Leads Recente</span>
        </CardTitle>
        <CardDescription>Ultimele leads primite în timp real</CardDescription>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mb-2 opacity-50" />
            <p>Nu există leads recente</p>
            <p className="text-xs">Leads-urile noi vor apărea aici</p>
          </div>
        ) : (
          <div className="space-y-4">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  {lead.source === 'whatsapp' ? (
                    <MessageSquare className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Phone className="h-5 w-5 text-blue-600" />
                  )}
                  <div>
                    <p className="font-medium font-mono">{lead.phone}</p>
                    <p className="text-xs text-muted-foreground">{lead.time}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      lead.classification === 'HOT'
                        ? 'hot'
                        : lead.classification === 'WARM'
                          ? 'warm'
                          : 'cold'
                    }
                  >
                    {lead.classification}
                  </Badge>
                  <span className="text-sm font-semibold">{lead.score}/5</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface UrgentTriageCardProps {
  urgentCount: number;
}

function UrgentTriageCard({ urgentCount }: UrgentTriageCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Urgențe Triage
        </CardTitle>
        <CardDescription>Cazuri care necesită atenție imediată</CardDescription>
      </CardHeader>
      <CardContent>
        {urgentCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mb-2 opacity-50" />
            <p>Nicio urgență activă</p>
            <p className="text-xs text-emerald-600">Toate cazurile sunt gestionate</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-destructive">{urgentCount}</span>
                <Badge variant="hot">URGENT</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Cazuri cu scor 4+ care așteaptă contact
              </p>
              <a
                href="/triage?filter=urgent"
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                Vezi toate urgențele →
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatsCardsSkeleton() {
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

function RecentLeadsSkeleton() {
  return (
    <Card className="col-span-2">
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function UrgentTriageSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}

// Async component for stats (enables streaming)
async function DashboardStatsSection() {
  const stats = await getDashboardStatsAction();
  return <StatsCards stats={stats} />;
}

// Async component for recent leads (enables streaming)
async function RecentLeadsSection() {
  const leads = await getRecentLeadsAction(5);
  return <RecentLeadsTable leads={leads} />;
}

// Async component for urgent triage (enables streaming)
async function UrgentTriageSection() {
  const stats = await getDashboardStatsAction();
  return <UrgentTriageCard urgentCount={stats.urgentTriage} />;
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Bine ai venit în MedicalCor Cortex</p>
      </div>

      <Suspense fallback={<StatsCardsSkeleton />}>
        <DashboardStatsSection />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-3">
        <Suspense fallback={<RecentLeadsSkeleton />}>
          <RecentLeadsSection />
        </Suspense>
        <Suspense fallback={<UrgentTriageSkeleton />}>
          <UrgentTriageSection />
        </Suspense>
      </div>
    </div>
  );
}
