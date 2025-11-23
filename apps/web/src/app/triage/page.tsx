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
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { getTriageBoardAction } from '../actions/triage';
import type { TriageColumn, TriageLead, TriageColumnId } from '@medicalcor/types';

/**
 * Triage Page - Server Component
 *
 * Displays leads grouped by AI scoring classification.
 * Data fetched from HubSpot via Server Actions.
 */

// Icon mapping for columns
const COLUMN_ICONS: Record<TriageColumnId, React.ElementType> = {
  new: Clock,
  hot: Flame,
  warm: Thermometer,
  cold: Snowflake,
  scheduled: CheckCircle2,
};

const COLUMN_COLORS: Record<TriageColumnId, string> = {
  new: 'bg-gray-100 dark:bg-gray-800',
  hot: 'bg-red-50 dark:bg-red-950/30',
  warm: 'bg-amber-50 dark:bg-amber-950/30',
  cold: 'bg-blue-50 dark:bg-blue-950/30',
  scheduled: 'bg-emerald-50 dark:bg-emerald-950/30',
};

function LeadCard({ lead, columnId }: { lead: TriageLead; columnId: TriageColumnId }) {
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
              <span className="font-medium font-mono">{lead.phone}</span>
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
                  &quot;{lead.reasoning}&quot;
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

function TriageColumnComponent({ column }: { column: TriageColumn }) {
  const Icon = COLUMN_ICONS[column.id];
  const bgColor = COLUMN_COLORS[column.id];

  return (
    <div className={`flex flex-col rounded-lg ${bgColor} p-4`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          <h3 className="font-semibold">{column.title}</h3>
        </div>
        <Badge variant="secondary">{column.leads.length}</Badge>
      </div>

      {column.leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Users className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">Niciun lead</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {column.leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} columnId={column.id} />
          ))}
        </div>
      )}
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

// Async component for triage board
async function TriageBoardSection() {
  const columns = await getTriageBoardAction();

  return (
    <div className="grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-3 lg:grid-cols-5">
      {columns.map((column) => (
        <TriageColumnComponent key={column.id} column={column} />
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
        <TriageBoardSection />
      </Suspense>
    </div>
  );
}
