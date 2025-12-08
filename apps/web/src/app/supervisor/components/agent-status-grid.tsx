'use client';

/**
 * Agent Status Grid Component
 *
 * Mobile-first grid showing agent availability and status.
 * Uses a compact card layout optimized for touch interaction.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Phone, Coffee, Moon, CheckCircle2 } from 'lucide-react';
import type { FlexWorker, FlexWorkerActivity } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface AgentStatusGridProps {
  agents: FlexWorker[];
}

function getActivityIcon(activity: FlexWorkerActivity) {
  switch (activity) {
    case 'available':
      return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    case 'busy':
      return <Phone className="h-3 w-3 text-blue-500" />;
    case 'break':
      return <Coffee className="h-3 w-3 text-amber-500" />;
    case 'wrap-up':
      return <Phone className="h-3 w-3 text-orange-500" />;
    case 'offline':
    case 'unavailable':
      return <Moon className="h-3 w-3 text-muted-foreground" />;
    default:
      return null;
  }
}

function getActivityColor(activity: FlexWorkerActivity): string {
  switch (activity) {
    case 'available':
      return 'ring-2 ring-emerald-500 ring-offset-2';
    case 'busy':
      return 'ring-2 ring-blue-500 ring-offset-2';
    case 'break':
      return 'ring-2 ring-amber-500 ring-offset-2';
    case 'wrap-up':
      return 'ring-2 ring-orange-500 ring-offset-2';
    case 'offline':
    case 'unavailable':
      return 'opacity-50';
    default:
      return 'opacity-50';
  }
}

function getActivityLabel(activity: FlexWorkerActivity): string {
  switch (activity) {
    case 'available':
      return 'Disponibil';
    case 'busy':
      return 'În Apel';
    case 'break':
      return 'Pauză';
    case 'wrap-up':
      return 'Finalizare';
    case 'offline':
      return 'Offline';
    case 'unavailable':
      return 'Indisponibil';
    default:
      return activity;
  }
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface AgentCardProps {
  agent: FlexWorker;
}

function AgentCard({ agent }: AgentCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-3 transition-colors',
        agent.available && 'bg-emerald-500/5 border-emerald-500/20'
      )}
    >
      <Avatar className={cn('h-10 w-10', getActivityColor(agent.activityName))}>
        <AvatarFallback className="text-xs bg-muted">
          {getInitials(agent.friendlyName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{agent.friendlyName}</p>
          {getActivityIcon(agent.activityName)}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={agent.available ? 'default' : 'secondary'} className="text-[10px] h-5">
            {getActivityLabel(agent.activityName)}
          </Badge>
          {agent.skills.length > 0 && (
            <span className="text-[10px] text-muted-foreground truncate">
              {agent.skills.slice(0, 2).join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentStatusGrid({ agents }: AgentStatusGridProps) {
  // Group agents by status
  const available = agents.filter((a) => a.activityName === 'available');
  const busy = agents.filter((a) => a.activityName === 'busy');
  const onBreak = agents.filter((a) => a.activityName === 'break');
  const offline = agents.filter(
    (a) => a.activityName === 'offline' || a.activityName === 'unavailable'
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            Echipă
          </CardTitle>
          <div className="flex gap-1">
            <Badge variant="default" className="text-[10px]">
              {available.length} disponibili
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {busy.length} în apel
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mb-2 opacity-50" />
            <p>Niciun agent disponibil</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Available agents first */}
            {available.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Disponibili ({available.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {available.map((agent) => (
                    <AgentCard key={agent.workerSid} agent={agent} />
                  ))}
                </div>
              </div>
            )}

            {/* Busy agents */}
            {busy.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3 text-blue-500" />
                  În Apel ({busy.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {busy.map((agent) => (
                    <AgentCard key={agent.workerSid} agent={agent} />
                  ))}
                </div>
              </div>
            )}

            {/* On break */}
            {onBreak.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Coffee className="h-3 w-3 text-amber-500" />
                  Pauză ({onBreak.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {onBreak.map((agent) => (
                    <AgentCard key={agent.workerSid} agent={agent} />
                  ))}
                </div>
              </div>
            )}

            {/* Offline - collapsed by default on mobile */}
            {offline.length > 0 && (
              <details className="group">
                <summary className="text-xs font-medium text-muted-foreground flex items-center gap-1 cursor-pointer list-none">
                  <Moon className="h-3 w-3" />
                  Offline ({offline.length})
                  <span className="ml-1 text-[10px]">tap pentru a vedea</span>
                </summary>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {offline.map((agent) => (
                    <AgentCard key={agent.workerSid} agent={agent} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentStatusGridSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-5 w-24 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
