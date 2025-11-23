import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Phone,
  MessageSquare,
  Clock,
  ChevronRight,
  Flame,
  Thermometer,
  Snowflake,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

// Mock data - will be replaced with Server Actions querying domain_events
const triageColumns = [
  {
    id: 'new',
    title: 'Nou',
    icon: Clock,
    color: 'bg-gray-100 dark:bg-gray-800',
    leads: [
      {
        id: '1',
        phone: '+40721***001',
        source: 'whatsapp',
        time: '2 min',
        message: 'Bună, vreau info implant',
      },
      {
        id: '2',
        phone: '+40722***002',
        source: 'voice',
        time: '8 min',
        message: 'Apel incoming - în așteptare',
      },
    ],
  },
  {
    id: 'hot',
    title: 'HOT',
    icon: Flame,
    color: 'bg-red-50 dark:bg-red-950/30',
    leads: [
      {
        id: '3',
        phone: '+40723***003',
        source: 'whatsapp',
        time: '15 min',
        score: 5,
        confidence: 0.92,
        reasoning: 'All-on-X interest + budget mentioned (10k EUR)',
        procedureInterest: ['All-on-X', 'implant'],
      },
      {
        id: '4',
        phone: '+40724***004',
        source: 'voice',
        time: '32 min',
        score: 5,
        confidence: 0.88,
        reasoning: 'Urgent pain + immediate appointment request',
        procedureInterest: ['extraction', 'emergency'],
      },
    ],
  },
  {
    id: 'warm',
    title: 'WARM',
    icon: Thermometer,
    color: 'bg-amber-50 dark:bg-amber-950/30',
    leads: [
      {
        id: '5',
        phone: '+40725***005',
        source: 'whatsapp',
        time: '1h',
        score: 3,
        confidence: 0.75,
        reasoning: 'General inquiry about dental services',
        procedureInterest: ['cleaning', 'consultation'],
      },
    ],
  },
  {
    id: 'cold',
    title: 'COLD',
    icon: Snowflake,
    color: 'bg-blue-50 dark:bg-blue-950/30',
    leads: [
      {
        id: '6',
        phone: '+40726***006',
        source: 'whatsapp',
        time: '2h',
        score: 2,
        confidence: 0.65,
        reasoning: 'Price comparison only',
        procedureInterest: [],
      },
    ],
  },
  {
    id: 'scheduled',
    title: 'Programat',
    icon: CheckCircle2,
    color: 'bg-emerald-50 dark:bg-emerald-950/30',
    leads: [
      {
        id: '7',
        phone: '+40727***007',
        source: 'whatsapp',
        time: '3h',
        score: 4,
        appointment: 'Luni 10:00',
        procedureInterest: ['implant'],
      },
    ],
  },
];

interface Lead {
  id: string;
  phone: string;
  source: string;
  time: string;
  message?: string;
  score?: number;
  confidence?: number;
  reasoning?: string;
  procedureInterest?: string[];
  appointment?: string;
}

function LeadCard({ lead, columnId }: { lead: Lead; columnId: string }) {
  const isScored = columnId !== 'new';

  return (
    <Link href={`/patient/${lead.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {lead.source === 'whatsapp' ? (
                <MessageSquare className="h-4 w-4 text-emerald-600" />
              ) : (
                <Phone className="h-4 w-4 text-blue-600" />
              )}
              <span className="font-medium">{lead.phone}</span>
            </div>
            <span className="text-xs text-muted-foreground">{lead.time}</span>
          </div>

          {lead.message && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{lead.message}</p>
          )}

          {isScored && lead.score && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Badge
                  variant={lead.score >= 4 ? 'hot' : lead.score >= 3 ? 'warm' : 'cold'}
                  className="text-xs"
                >
                  Score: {lead.score}/5
                </Badge>
                {lead.confidence && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(lead.confidence * 100)}% conf
                  </span>
                )}
              </div>

              {lead.reasoning && (
                <p className="text-xs text-muted-foreground italic line-clamp-2">
                  "{lead.reasoning}"
                </p>
              )}

              {lead.procedureInterest && lead.procedureInterest.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {lead.procedureInterest.map((proc) => (
                    <Badge key={proc} variant="outline" className="text-[10px]">
                      {proc}
                    </Badge>
                  ))}
                </div>
              )}

              {lead.appointment && (
                <div className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  {lead.appointment}
                </div>
              )}
            </div>
          )}

          <Button variant="ghost" size="sm" className="mt-2 w-full justify-between">
            Vezi detalii
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}

function TriageColumn({ column }: { column: (typeof triageColumns)[0] }) {
  const Icon = column.icon;

  return (
    <div className={`flex flex-col rounded-lg ${column.color} p-4`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <h3 className="font-semibold">{column.title}</h3>
        </div>
        <Badge variant="secondary">{column.leads.length}</Badge>
      </div>

      <div className="flex flex-col gap-3">
        {column.leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} columnId={column.id} />
        ))}
      </div>
    </div>
  );
}

function TriageBoardSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-lg bg-muted p-4">
          <Skeleton className="mb-4 h-6 w-24" />
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TriagePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Live Triage Board</h2>
          <p className="text-muted-foreground">Monitorizare leads în timp real cu AI scoring</p>
        </div>
        <div className="live-pulse pl-4">
          <Badge variant="success" className="gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live
          </Badge>
        </div>
      </div>

      <Suspense fallback={<TriageBoardSkeleton />}>
        <div className="grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-3 lg:grid-cols-5">
          {triageColumns.map((column) => (
            <TriageColumn key={column.id} column={column} />
          ))}
        </div>
      </Suspense>
    </div>
  );
}
