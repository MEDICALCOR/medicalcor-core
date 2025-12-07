'use client';

/**
 * Active Calls List Component
 *
 * Mobile-first list of active calls with touch-friendly interaction.
 * Tapping a call opens a bottom sheet with details and actions.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Phone,
  PhoneOff,
  Bot,
  User,
  Clock,
  AlertTriangle,
  Ear,
  MessageSquare,
  PhoneForwarded,
  Flag,
  ChevronRight,
  Smile,
  Meh,
  Frown,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import type { MonitoredCall } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface ActiveCallsListProps {
  calls: MonitoredCall[];
  onStartMonitoring?: (callSid: string, mode: 'listen' | 'whisper' | 'barge') => Promise<boolean>;
  onStopMonitoring?: () => Promise<boolean>;
  onEndCall?: (callSid: string) => Promise<boolean>;
  activeMonitoringCallSid?: string;
  activeMonitoringMode?: 'listen' | 'whisper' | 'barge';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getSentimentIcon(sentiment?: 'positive' | 'neutral' | 'negative') {
  switch (sentiment) {
    case 'positive':
      return <Smile className="h-4 w-4 text-emerald-500" aria-label="Sentiment pozitiv" />;
    case 'negative':
      return <Frown className="h-4 w-4 text-destructive" aria-label="Sentiment negativ" />;
    case 'neutral':
    case undefined:
    default:
      return <Meh className="h-4 w-4 text-muted-foreground" aria-label="Sentiment neutru" />;
  }
}

function getUrgencyColor(urgency?: 'low' | 'medium' | 'high' | 'critical'): string {
  switch (urgency) {
    case 'critical':
      return 'border-l-4 border-l-destructive';
    case 'high':
      return 'border-l-4 border-l-amber-500';
    case 'medium':
      return 'border-l-4 border-l-yellow-400';
    case 'low':
    case undefined:
    default:
      return '';
  }
}

interface CallItemProps {
  call: MonitoredCall;
  onClick: () => void;
}

function CallItem({ call, onClick }: CallItemProps) {
  const isAI = Boolean(call.vapiCallId);
  const hasFlags = call.flags.length > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent/50 active:bg-accent',
        getUrgencyColor(call.urgencyLevel),
        hasFlags && 'bg-amber-500/5'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isAI ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <User className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{call.contactName ?? call.customerPhone}</p>
              {getSentimentIcon(call.sentiment)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isAI ? (
                <span className="text-primary">AI Assistant</span>
              ) : (
                <span>{call.agentName ?? 'Fără agent'}</span>
              )}
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatDuration(call.duration)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1">
            <Badge
              variant={
                call.state === 'in-progress'
                  ? 'default'
                  : call.state === 'on-hold'
                    ? 'hot'
                    : 'secondary'
              }
              className="text-[10px]"
            >
              {call.state === 'in-progress'
                ? 'Activ'
                : call.state === 'on-hold'
                  ? 'În Așteptare'
                  : call.state === 'wrapping-up'
                    ? 'Finalizare'
                    : call.state}
            </Badge>
            {hasFlags && (
              <div className="flex gap-0.5">
                {call.flags.includes('escalation-requested') && (
                  <AlertTriangle
                    className="h-3 w-3 text-destructive"
                    aria-label="Escaladare solicitată"
                  />
                )}
                {call.flags.includes('high-value-lead') && (
                  <Flag className="h-3 w-3 text-primary" aria-label="Lead valoros" />
                )}
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}

interface CallDetailSheetProps {
  call: MonitoredCall | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartMonitoring?: (callSid: string, mode: 'listen' | 'whisper' | 'barge') => Promise<boolean>;
  onStopMonitoring?: () => Promise<boolean>;
  onEndCall?: (callSid: string) => Promise<boolean>;
  isMonitoring?: boolean;
  monitoringMode?: 'listen' | 'whisper' | 'barge';
}

function CallDetailSheet({
  call,
  open,
  onOpenChange,
  onStartMonitoring,
  onStopMonitoring,
  onEndCall,
  isMonitoring,
  monitoringMode,
}: CallDetailSheetProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (!call) return null;

  const isAI = Boolean(call.vapiCallId);

  const handleListen = async () => {
    if (!onStartMonitoring) return;
    setLoadingAction('listen');
    try {
      await onStartMonitoring(call.callSid, 'listen');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleWhisper = async () => {
    if (!onStartMonitoring) return;
    setLoadingAction('whisper');
    try {
      await onStartMonitoring(call.callSid, 'whisper');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleBarge = async () => {
    if (!onStartMonitoring) return;
    setLoadingAction('barge');
    try {
      await onStartMonitoring(call.callSid, 'barge');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEndCall = async () => {
    if (!onEndCall) return;
    setLoadingAction('end');
    try {
      const success = await onEndCall(call.callSid);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStopMonitoring = async () => {
    if (!onStopMonitoring) return;
    setLoadingAction('stop');
    try {
      await onStopMonitoring();
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
        <SheetHeader className="text-left pb-4 border-b">
          <div className="flex items-center gap-3">
            {isAI ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <SheetTitle className="flex items-center gap-2">
                {call.contactName ?? call.customerPhone}
                {getSentimentIcon(call.sentiment)}
              </SheetTitle>
              <SheetDescription>
                {isAI ? 'AI Assistant' : call.agentName} • {formatDuration(call.duration)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="py-4 space-y-4 overflow-y-auto max-h-[calc(85vh-180px)]">
          {/* Call Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Telefon</p>
              <p className="font-mono text-sm">{call.customerPhone}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Direcție</p>
              <p className="text-sm capitalize">
                {call.direction === 'inbound' ? 'Intrare' : 'Ieșire'}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Scor AI</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{call.aiScore ?? '-'}%</p>
                {call.aiScore && call.aiScore < 60 && (
                  <Badge variant="hot" className="text-[10px]">
                    Low
                  </Badge>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Urgență</p>
              <Badge
                variant={
                  call.urgencyLevel === 'critical'
                    ? 'hot'
                    : call.urgencyLevel === 'high'
                      ? 'warm'
                      : 'secondary'
                }
                className="mt-1"
              >
                {call.urgencyLevel === 'critical'
                  ? 'Critic'
                  : call.urgencyLevel === 'high'
                    ? 'Ridicat'
                    : call.urgencyLevel === 'medium'
                      ? 'Mediu'
                      : 'Scăzut'}
              </Badge>
            </div>
          </div>

          {/* Flags */}
          {call.flags.length > 0 && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3">
              <p className="text-xs font-medium text-amber-600 mb-2">Alerte Active</p>
              <div className="flex flex-wrap gap-2">
                {call.flags.map((flag) => {
                  const flagLabels: Record<string, string> = {
                    'escalation-requested': 'Escaladare Solicitată',
                    'high-value-lead': 'Lead Valoros',
                    complaint: 'Reclamație',
                    'long-hold': 'Așteptare Lungă',
                    'silence-detected': 'Tăcere Detectată',
                    'ai-handoff-needed': 'Necesită Transfer',
                  };
                  return (
                    <Badge key={flag} variant="outline" className="text-xs">
                      {flagLabels[flag] ?? flag}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent Transcript */}
          {call.recentTranscript.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Transcript Recent</p>
              <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                {call.recentTranscript.map((msg, idx) => (
                  <div key={idx} className="text-sm">
                    <span
                      className={cn(
                        'font-medium',
                        msg.speaker === 'customer'
                          ? 'text-blue-600'
                          : msg.speaker === 'assistant'
                            ? 'text-primary'
                            : 'text-emerald-600'
                      )}
                    >
                      {msg.speaker === 'customer'
                        ? 'Client'
                        : msg.speaker === 'assistant'
                          ? 'AI'
                          : 'Agent'}
                      :
                    </span>{' '}
                    <span className="text-muted-foreground">{msg.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons - sticky at bottom */}
        <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4 space-y-3">
          {isMonitoring && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {monitoringMode === 'listen' && 'Ascultând apelul'}
                  {monitoringMode === 'whisper' && 'Mod șoaptă activ'}
                  {monitoringMode === 'barge' && 'În apel'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStopMonitoring}
                disabled={loadingAction === 'stop'}
              >
                {loadingAction === 'stop' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Oprește'
                )}
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={isMonitoring && monitoringMode === 'listen' ? 'default' : 'outline'}
              className="gap-2"
              onClick={handleListen}
              disabled={loadingAction !== null || (isMonitoring && monitoringMode === 'listen')}
            >
              {loadingAction === 'listen' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ear className="h-4 w-4" />
              )}
              Ascultă
            </Button>
            <Button
              variant={isMonitoring && monitoringMode === 'whisper' ? 'default' : 'outline'}
              className="gap-2"
              onClick={handleWhisper}
              disabled={loadingAction !== null || (isMonitoring && monitoringMode === 'whisper')}
            >
              {loadingAction === 'whisper' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4" />
              )}
              Șoptește
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={isMonitoring && monitoringMode === 'barge' ? 'secondary' : 'default'}
              className="gap-2"
              onClick={handleBarge}
              disabled={loadingAction !== null || (isMonitoring && monitoringMode === 'barge')}
            >
              {loadingAction === 'barge' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneForwarded className="h-4 w-4" />
              )}
              Intră în Apel
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={handleEndCall}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'end' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneOff className="h-4 w-4" />
              )}
              Încheie
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ActiveCallsList({
  calls,
  onStartMonitoring,
  onStopMonitoring,
  onEndCall,
  activeMonitoringCallSid,
  activeMonitoringMode,
}: ActiveCallsListProps) {
  const [selectedCall, setSelectedCall] = useState<MonitoredCall | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleCallClick = (call: MonitoredCall) => {
    setSelectedCall(call);
    setSheetOpen(true);
  };

  // Sort calls: flags first, then by urgency, then by duration
  const sortedCalls = [...calls].sort((a, b) => {
    // Flags first
    if (a.flags.length > 0 && b.flags.length === 0) return -1;
    if (a.flags.length === 0 && b.flags.length > 0) return 1;

    // Then by urgency
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const aUrgency = urgencyOrder[a.urgencyLevel ?? 'low'];
    const bUrgency = urgencyOrder[b.urgencyLevel ?? 'low'];
    if (aUrgency !== bUrgency) return aUrgency - bUrgency;

    // Then by duration (longest first)
    return b.duration - a.duration;
  });

  // Check if the selected call is being monitored
  const isSelectedCallMonitored = selectedCall?.callSid === activeMonitoringCallSid;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Phone className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              Apeluri Active
              <Badge variant="secondary" className="ml-1">
                {calls.length}
              </Badge>
            </CardTitle>
            {activeMonitoringCallSid && (
              <Badge variant="default" className="gap-1">
                <Ear className="h-3 w-3" />
                Monitorizare activă
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          {calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mb-2 opacity-50" />
              <p>Niciun apel activ</p>
              <p className="text-xs">Apelurile vor apărea aici</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedCalls.map((call) => (
                <CallItem key={call.callSid} call={call} onClick={() => handleCallClick(call)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CallDetailSheet
        call={selectedCall}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onStartMonitoring={onStartMonitoring}
        onStopMonitoring={onStopMonitoring}
        onEndCall={onEndCall}
        isMonitoring={isSelectedCallMonitored}
        monitoringMode={isSelectedCallMonitored ? activeMonitoringMode : undefined}
      />
    </>
  );
}

export function ActiveCallsListSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-5 w-32 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </CardContent>
    </Card>
  );
}
