'use client';

import { useState, useTransition } from 'react';
import {
  Circle,
  Coffee,
  Clock,
  GraduationCap,
  LogOut,
  Phone,
  ChevronDown,
  Timer,
  MessageSquare,
  TrendingUp,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type AgentSession,
  type AgentAvailability,
  type AgentWorkspaceStats,
  updateAgentAvailabilityAction,
} from '../actions';

interface AgentStatusBarProps {
  session: AgentSession;
  stats: AgentWorkspaceStats;
  onSessionUpdate?: (session: AgentSession) => void;
}

const availabilityConfig: Record<
  AgentAvailability,
  { label: string; color: string; icon: typeof Circle; bgColor: string }
> = {
  available: {
    label: 'Disponibil',
    color: 'text-green-500',
    icon: Circle,
    bgColor: 'bg-green-500',
  },
  busy: {
    label: 'Ocupat',
    color: 'text-yellow-500',
    icon: Phone,
    bgColor: 'bg-yellow-500',
  },
  away: {
    label: 'Plecat',
    color: 'text-orange-500',
    icon: Clock,
    bgColor: 'bg-orange-500',
  },
  break: {
    label: 'Pauză',
    color: 'text-blue-500',
    icon: Coffee,
    bgColor: 'bg-blue-500',
  },
  training: {
    label: 'Training',
    color: 'text-purple-500',
    icon: GraduationCap,
    bgColor: 'bg-purple-500',
  },
  offline: {
    label: 'Offline',
    color: 'text-gray-400',
    icon: LogOut,
    bgColor: 'bg-gray-400',
  },
  'wrap-up': {
    label: 'Wrap-up',
    color: 'text-teal-500',
    icon: Timer,
    bgColor: 'bg-teal-500',
  },
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function AgentStatusBar({ session, stats, onSessionUpdate }: AgentStatusBarProps) {
  const [isPending, startTransition] = useTransition();
  const [localSession, setLocalSession] = useState(session);

  const currentConfig = availabilityConfig[localSession.availability];
  const StatusIcon = currentConfig.icon;

  const handleStatusChange = (newStatus: AgentAvailability) => {
    startTransition(async () => {
      const updatedSession = await updateAgentAvailabilityAction(newStatus);
      setLocalSession(updatedSession);
      onSessionUpdate?.(updatedSession);
    });
  };

  return (
    <div className="flex items-center justify-between bg-card border rounded-lg px-4 py-3">
      {/* Agent Info & Status */}
      <div className="flex items-center gap-4">
        {/* Avatar with status indicator */}
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold">
            {localSession.agentName
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card',
              currentConfig.bgColor
            )}
          />
        </div>

        {/* Name & Status Dropdown */}
        <div>
          <p className="font-medium text-sm">{localSession.agentName}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={isPending}>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-6 px-2 gap-1 text-xs', currentConfig.color)}
              >
                <StatusIcon className="h-3 w-3" />
                <span>{currentConfig.label}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {Object.entries(availabilityConfig).map(([status, config]) => {
                const Icon = config.icon;
                return (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => handleStatusChange(status as AgentAvailability)}
                    disabled={status === localSession.availability}
                    className="gap-2"
                  >
                    <Icon className={cn('h-4 w-4', config.color)} />
                    <span>{config.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="h-8 w-px bg-border" />

        {/* Session Stats */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Sesiune:</span>
            <span className="font-medium">
              {formatDuration(
                Math.floor((Date.now() - new Date(localSession.sessionStartedAt).getTime()) / 1000)
              )}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Apeluri:</span>
            <span className="font-medium">{localSession.callsHandled}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Lead-uri:</span>
            <span className="font-medium">{localSession.leadsHandled}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Talk time:</span>
            <span className="font-medium">{formatDuration(localSession.totalTalkTime)}</span>
          </div>
        </div>
      </div>

      {/* Queue & Performance Stats */}
      <div className="flex items-center gap-4">
        {/* Queue Info */}
        <div className="flex items-center gap-2">
          <Badge
            variant={
              stats.queueLength > 5 ? 'destructive' : stats.queueLength > 2 ? 'warm' : 'secondary'
            }
          >
            {stats.queueLength} în coadă
          </Badge>
          <span className="text-xs text-muted-foreground">avg {formatTime(stats.avgWaitTime)}</span>
        </div>

        <div className="h-8 w-px bg-border" />

        {/* Today's Performance */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span className="font-medium">{stats.conversionsToday} conversii</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="font-medium">{stats.satisfactionScore.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Skeleton for loading state
export function AgentStatusBarSkeleton() {
  return (
    <div className="flex items-center justify-between bg-card border rounded-lg px-4 py-3">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
        <div className="space-y-2">
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-20 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="h-6 w-24 bg-muted animate-pulse rounded-full" />
        <div className="h-8 w-px bg-border" />
        <div className="flex gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-4 w-20 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
