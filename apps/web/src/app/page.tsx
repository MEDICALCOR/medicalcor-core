import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Users, Calendar, TrendingUp, Phone, MessageSquare } from 'lucide-react';

// Mock data - will be replaced with Server Actions
const stats = [
  { name: 'Leads Activi', value: '127', change: '+12%', icon: Users, trend: 'up' },
  { name: 'Triage Urgențe', value: '8', change: '+3', icon: Activity, trend: 'up' },
  { name: 'Programări Azi', value: '24', change: '0', icon: Calendar, trend: 'neutral' },
  { name: 'Venit Zilnic', value: '€4,230', change: '+18%', icon: TrendingUp, trend: 'up' },
];

const recentLeads = [
  {
    id: '1',
    phone: '+40721***001',
    score: 5,
    classification: 'HOT',
    source: 'whatsapp',
    time: 'acum 5 min',
  },
  {
    id: '2',
    phone: '+40722***002',
    score: 4,
    classification: 'HOT',
    source: 'voice',
    time: 'acum 12 min',
  },
  {
    id: '3',
    phone: '+40723***003',
    score: 3,
    classification: 'WARM',
    source: 'whatsapp',
    time: 'acum 28 min',
  },
  {
    id: '4',
    phone: '+40724***004',
    score: 2,
    classification: 'COLD',
    source: 'whatsapp',
    time: 'acum 45 min',
  },
];

function StatsCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.name}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">
              <span className={stat.trend === 'up' ? 'text-emerald-600' : 'text-muted-foreground'}>
                {stat.change}
              </span>{' '}
              față de ieri
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentLeadsTable() {
  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="live-pulse pl-4">Leads Recente</span>
        </CardTitle>
        <CardDescription>Ultimele leads primite în timp real</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentLeads.map((lead) => (
            <div key={lead.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                {lead.source === 'whatsapp' ? (
                  <MessageSquare className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Phone className="h-5 w-5 text-blue-600" />
                )}
                <div>
                  <p className="font-medium">{lead.phone}</p>
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
      </CardContent>
    </Card>
  );
}

function UrgentTriageCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-destructive">Urgențe Triage</CardTitle>
        <CardDescription>Cazuri care necesită atenție imediată</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">+40721***001</span>
              <Badge variant="hot">URGENT</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Durere acută - All-on-X inquiry</p>
            <p className="text-xs text-destructive">Așteaptă callback de 15 min</p>
          </div>
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">+40722***002</span>
              <Badge variant="warm">VIP</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Pacient recurent - follow-up</p>
            <p className="text-xs text-amber-600">Programare în 2 ore</p>
          </div>
        </div>
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

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Bine ai venit în MedicalCor Cortex</p>
      </div>

      <Suspense fallback={<StatsCardsSkeleton />}>
        <StatsCards />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-3">
        <Suspense fallback={<Skeleton className="col-span-2 h-96" />}>
          <RecentLeadsTable />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-96" />}>
          <UrgentTriageCard />
        </Suspense>
      </div>
    </div>
  );
}
