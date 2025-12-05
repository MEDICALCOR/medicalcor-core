'use client';

import { memo, useMemo } from 'react';
import { useRealtimeLeads, type RealtimeLead } from '@/lib/realtime';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Phone, Globe, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const sourceIcons: Record<'whatsapp' | 'voice' | 'web', LucideIcon> = {
  whatsapp: MessageSquare,
  voice: Phone,
  web: Globe,
};

const classificationVariants = {
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
} as const;

interface LeadItemProps {
  lead: RealtimeLead;
  isNew: boolean;
}

/**
 * Memoized lead item component to prevent unnecessary re-renders
 * when the leads array updates but individual items haven't changed
 */
const LeadItem = memo(function LeadItem({ lead, isNew }: LeadItemProps) {
  const SourceIcon = sourceIcons[lead.source];

  const sourceClassName = useMemo(() => {
    switch (lead.source) {
      case 'whatsapp':
        return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
      case 'voice':
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
      case 'web':
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
    }
  }, [lead.source]);

  return (
    <li
      className={cn('p-3 transition-all duration-500', isNew ? 'bg-primary/5 animate-pulse' : '')}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg shrink-0', sourceClassName)}>
          <SourceIcon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm truncate">{lead.phone}</span>
            <span className="text-xs text-muted-foreground shrink-0">{lead.time}</span>
          </div>

          {lead.message && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">{lead.message}</p>
          )}

          <div className="flex items-center gap-2 mt-1.5">
            {lead.classification && (
              <Badge variant={classificationVariants[lead.classification]}>
                {lead.classification}
              </Badge>
            )}
            {lead.score !== undefined && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                <span>{lead.score}%</span>
              </div>
            )}
            {lead.procedureInterest && lead.procedureInterest.length > 0 && (
              <span className="text-xs text-muted-foreground truncate">
                {lead.procedureInterest[0]}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
});

LeadItem.displayName = 'LeadItem';

interface LiveFeedProps {
  maxItems?: number;
  showHeader?: boolean;
  className?: string;
}

export function LiveFeed({ maxItems = 10, showHeader = true, className }: LiveFeedProps) {
  const { leads } = useRealtimeLeads();

  // Memoize the sliced leads array to prevent unnecessary recalculations
  const displayLeads = useMemo(() => leads.slice(0, maxItems), [leads, maxItems]);

  return (
    <Card className={cn('', className)}>
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live Feed
            </CardTitle>
            <span className="text-xs text-muted-foreground">{leads.length} leads</span>
          </div>
        </CardHeader>
      )}
      <CardContent className="p-0">
        {displayLeads.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Așteptăm lead-uri noi...
          </div>
        ) : (
          <ul className="divide-y">
            {displayLeads.map((lead, index) => (
              <LeadItem key={lead.id} lead={lead} isNew={index === 0} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
