'use client';

import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HotLead {
  id: string;
  name: string;
  phone: string;
  reason: string;
  waitingMinutes: number;
  procedureInterest?: string;
}

interface CallNowCardProps {
  lead: HotLead;
  onCall: (lead: HotLead) => void;
}

/**
 * Kindergarten-simple hot lead card
 * One glance: who needs a call
 * One action: tap to call
 */
export function CallNowCard({ lead, onCall }: CallNowCardProps) {
  const isUrgent = lead.waitingMinutes > 30;

  return (
    <button
      onClick={() => onCall(lead)}
      className={cn(
        'w-full text-left p-4 rounded-xl transition-all',
        'hover:scale-[1.02] active:scale-[0.98]',
        'border-2',
        isUrgent
          ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
          : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Name - biggest, most important */}
          <p className="font-semibold text-lg truncate">{lead.name}</p>

          {/* What they want - simple language */}
          <p className="text-sm text-muted-foreground truncate">{lead.reason}</p>
        </div>

        {/* Big call button */}
        <div
          className={cn(
            'flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center',
            'transition-colors',
            isUrgent
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-white'
          )}
        >
          <Phone className="h-6 w-6" />
        </div>
      </div>

      {/* Waiting time - simple */}
      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full',
            isUrgent
              ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
          )}
        >
          {lead.waitingMinutes < 60
            ? `${lead.waitingMinutes} min`
            : `${Math.floor(lead.waitingMinutes / 60)}h ${lead.waitingMinutes % 60}m`}
        </span>
        {lead.procedureInterest && (
          <span className="text-xs text-muted-foreground">{lead.procedureInterest}</span>
        )}
      </div>
    </button>
  );
}

/**
 * Empty state - no calls needed
 */
export function NoCallsNeeded() {
  return (
    <div className="text-center py-8 px-4">
      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
        <span className="text-3xl">✓</span>
      </div>
      <p className="font-medium text-green-700 dark:text-green-400">All caught up!</p>
      <p className="text-sm text-muted-foreground mt-1">No urgent calls right now</p>
    </div>
  );
}
