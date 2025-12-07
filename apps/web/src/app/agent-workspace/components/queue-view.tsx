'use client';

import { useState, useTransition } from 'react';
import {
  Phone,
  MessageSquare,
  PhoneForwarded,
  ClipboardList,
  Clock,
  ChevronRight,
  User,
  Flame,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type QueueItem,
  type QueueItemPriority,
  type QueueItemType,
  acceptQueueItemAction,
} from '../actions';

interface QueueViewProps {
  items: QueueItem[];
  onItemAccepted?: (item: QueueItem) => void;
}

const typeConfig: Record<QueueItemType, { label: string; icon: typeof Phone; color: string }> = {
  call: { label: 'Apel', icon: Phone, color: 'text-green-500' },
  message: { label: 'Mesaj', icon: MessageSquare, color: 'text-blue-500' },
  callback: { label: 'Callback', icon: PhoneForwarded, color: 'text-purple-500' },
  task: { label: 'Task', icon: ClipboardList, color: 'text-orange-500' },
};

const priorityConfig: Record<QueueItemPriority, { label: string; color: string; bgColor: string }> =
  {
    critical: { label: 'Critic', color: 'text-red-700', bgColor: 'bg-red-100 dark:bg-red-900/30' },
    high: {
      label: 'Urgent',
      color: 'text-orange-700',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
    medium: {
      label: 'Normal',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    },
    low: { label: 'Scăzut', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-800' },
  };

// Source icons for future use with image components
const _sourceIcons: Record<string, string> = {
  whatsapp: '/icons/whatsapp.svg',
  voice: '/icons/phone.svg',
  web: '/icons/web.svg',
  hubspot: '/icons/hubspot.svg',
};

function formatWaitTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function QueueItemCard({
  item,
  onAccept,
  isAccepting,
}: {
  item: QueueItem;
  onAccept: () => void;
  isAccepting: boolean;
}) {
  const typeInfo = typeConfig[item.type];
  const priorityInfo = priorityConfig[item.priority];
  const TypeIcon = typeInfo.icon;

  const classificationVariant =
    item.classification === 'HOT' ? 'hot' : item.classification === 'WARM' ? 'warm' : 'cold';

  return (
    <div
      className={cn(
        'relative p-4 rounded-lg border transition-all hover:shadow-md',
        item.priority === 'critical' && 'border-red-300 dark:border-red-700 animate-pulse-subtle',
        item.priority === 'high' && 'border-orange-300 dark:border-orange-700'
      )}
    >
      {/* Priority indicator bar */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l-lg',
          item.priority === 'critical' && 'bg-red-500',
          item.priority === 'high' && 'bg-orange-500',
          item.priority === 'medium' && 'bg-yellow-500',
          item.priority === 'low' && 'bg-gray-400'
        )}
      />

      <div className="flex items-start justify-between gap-3 pl-2">
        {/* Left: Type icon & info */}
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg', priorityInfo.bgColor)}>
            <TypeIcon className={cn('h-5 w-5', typeInfo.color)} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Name & Classification */}
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium truncate">{item.leadName}</span>
              <Badge variant={classificationVariant} className="text-[10px] px-1.5 py-0">
                {item.classification}
              </Badge>
              {item.priority === 'critical' && (
                <Flame className="h-4 w-4 text-red-500 animate-pulse" />
              )}
            </div>

            {/* Phone & Source */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <span>{item.leadPhone}</span>
              <span>•</span>
              <span className="capitalize">{item.source}</span>
            </div>

            {/* Procedure interest */}
            {item.procedureInterest && (
              <div className="text-sm text-primary font-medium">{item.procedureInterest}</div>
            )}

            {/* Notes */}
            {item.notes && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.notes}</p>
            )}
          </div>
        </div>

        {/* Right: Wait time & Action */}
        <div className="flex flex-col items-end gap-2">
          {/* Wait time */}
          <div className="flex items-center gap-1 text-sm">
            <Clock
              className={cn(
                'h-4 w-4',
                item.waitTime > 300
                  ? 'text-red-500'
                  : item.waitTime > 120
                    ? 'text-orange-500'
                    : 'text-muted-foreground'
              )}
            />
            <span
              className={cn(
                'font-medium',
                item.waitTime > 300
                  ? 'text-red-500'
                  : item.waitTime > 120
                    ? 'text-orange-500'
                    : 'text-muted-foreground'
              )}
            >
              {formatWaitTime(item.waitTime)}
            </span>
          </div>

          {/* Accept button */}
          <Button size="sm" onClick={onAccept} disabled={isAccepting} className="gap-1">
            {isAccepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span>Preia</span>
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function QueueView({ items, onItemAccepted }: QueueViewProps) {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleAccept = (item: QueueItem) => {
    setAcceptingId(item.id);
    startTransition(async () => {
      const result = await acceptQueueItemAction(item.id);
      if (result.success) {
        onItemAccepted?.(item);
      }
      setAcceptingId(null);
    });
  };

  // Sort by priority and wait time
  const sortedItems = [...items].sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.waitTime - a.waitTime;
  });

  const criticalCount = items.filter((i) => i.priority === 'critical').length;
  const highCount = items.filter((i) => i.priority === 'high').length;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Coadă</CardTitle>
            <Badge variant="secondary">{items.length}</Badge>
          </div>

          {/* Priority breakdown */}
          <div className="flex items-center gap-2 text-xs">
            {criticalCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-600 font-medium">{criticalCount} critice</span>
              </div>
            )}
            {highCount > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-orange-600 font-medium">{highCount} urgente</span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto space-y-3 pb-4">
        {sortedItems.length > 0 ? (
          sortedItems.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              onAccept={() => handleAccept(item)}
              isAccepting={acceptingId === item.id}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Coada este goală</p>
            <p className="text-sm text-muted-foreground">Nu există task-uri în așteptare</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Skeleton for loading state
export function QueueViewSkeleton() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 bg-muted animate-pulse rounded" />
            <div className="h-5 w-6 bg-muted animate-pulse rounded-full" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-lg border">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                <div className="h-8 w-16 bg-muted animate-pulse rounded" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
