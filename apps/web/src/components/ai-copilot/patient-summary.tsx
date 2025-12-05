'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  User,
  TrendingUp,
  Calendar,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import type { PatientHistorySummary } from '@/lib/ai';
import { getPatientSummaryAction } from '@/app/actions/ai-copilot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PatientSummaryProps {
  patientId?: string;
}

const classificationVariants = {
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
} as const;

const sentimentIcons = {
  positive: { icon: CheckCircle2, color: 'text-green-500' },
  neutral: { icon: Clock, color: 'text-yellow-500' },
  negative: { icon: XCircle, color: 'text-red-500' },
};

export function PatientSummary({ patientId }: PatientSummaryProps) {
  const [summary, setSummary] = useState<PatientHistorySummary | null>(null);
  const [isLoading, startTransition] = useTransition();

  useEffect(() => {
    if (!patientId) return;

    startTransition(async () => {
      try {
        const result = await getPatientSummaryAction({
          patientId,
          // Pass conversation history if available from context
        });
        setSummary(result);
      } catch {
        setSummary(null);
      }
    });
  }, [patientId]);

  const handleRefresh = () => {
    if (!patientId) return;
    startTransition(async () => {
      try {
        const result = await getPatientSummaryAction({ patientId });
        setSummary(result);
      } catch {
        // Keep existing summary on error
      }
    });
  };

  if (!patientId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <User className="h-10 w-10 text-muted-foreground mb-3" />
        <h4 className="font-medium mb-1">Niciun pacient selectat</h4>
        <p className="text-sm text-muted-foreground">
          Selectează un pacient pentru a vedea rezumatul AI.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-3" />
        <h4 className="font-medium mb-1">Nu s-a putut genera rezumatul</h4>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          Încearcă din nou
        </Button>
      </div>
    );
  }

  const SentimentIcon = sentimentIcons[summary.sentiment].icon;

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={classificationVariants[summary.classification]}>
            {summary.classification}
          </Badge>
          <div className="flex items-center gap-1 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-semibold">{summary.score}%</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold">{summary.totalInteractions}</div>
          <div className="text-[10px] text-muted-foreground">Interacțiuni</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <div className="flex items-center justify-center">
            <SentimentIcon className={cn('h-5 w-5', sentimentIcons[summary.sentiment].color)} />
          </div>
          <div className="text-[10px] text-muted-foreground capitalize">{summary.sentiment}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <div className="text-lg font-bold capitalize">{summary.engagementLevel[0]}</div>
          <div className="text-[10px] text-muted-foreground">Engagement</div>
        </div>
      </div>

      {/* Key Insights */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Key Insights
        </h4>
        <ul className="space-y-1.5">
          {summary.keyInsights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2 text-sm bg-primary/5 rounded-lg p-2">
              <span className="text-primary mt-0.5">•</span>
              <span>{insight}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Procedures Interest */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Proceduri Discutate
        </h4>
        <div className="flex flex-wrap gap-1">
          {summary.proceduresDiscussed.map((proc, i) => (
            <Badge key={i} variant="outline" className="text-xs">
              {proc}
            </Badge>
          ))}
        </div>
      </div>

      {/* Objections */}
      {summary.objections.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-orange-500" />
            Obiecții / Îngrijorări
          </h4>
          <ul className="space-y-1">
            {summary.objections.map((objection, i) => (
              <li
                key={i}
                className="text-sm text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2"
              >
                {objection}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Appointment History */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Istoric Programări
        </h4>
        <div className="space-y-1.5">
          {summary.appointmentHistory.map((apt, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded-lg"
            >
              <div>
                <span className="font-medium">{apt.procedure}</span>
                <span className="text-muted-foreground ml-2">
                  {new Date(apt.date).toLocaleDateString('ro-RO')}
                </span>
              </div>
              <Badge
                variant={apt.status === 'completed' ? 'success' : 'secondary'}
                className="text-[10px]"
              >
                {apt.status === 'completed' && 'Finalizat'}
                {apt.status === 'cancelled' && 'Anulat'}
                {apt.status === 'no-show' && 'Absent'}
                {apt.status === 'scheduled' && 'Programat'}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          <span>Primul contact: {new Date(summary.firstContact).toLocaleDateString('ro-RO')}</span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Clock className="h-3 w-3" />
          <span>
            Ultima interacțiune: {new Date(summary.lastContact).toLocaleDateString('ro-RO')}
          </span>
        </div>
      </div>
    </div>
  );
}
