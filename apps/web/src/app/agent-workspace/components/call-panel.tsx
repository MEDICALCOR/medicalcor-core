'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Phone,
  PhoneOff,
  Pause,
  Play,
  ArrowRightLeft,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Calendar,
  MessageSquare,
  User,
  Smile,
  Meh,
  Frown,
  Star,
  History,
  StickyNote,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  type ActiveCall,
  type TranscriptEntry,
  holdCallAction,
  resumeCallAction,
  endCallAction,
  addCallNoteAction,
} from '../actions';

interface CallPanelProps {
  call: ActiveCall | null;
  onCallEnded?: () => void;
  onScheduleAppointment?: (leadId: string) => void;
}

const sentimentConfig = {
  positive: { icon: Smile, color: 'text-green-500', label: 'Pozitiv' },
  neutral: { icon: Meh, color: 'text-yellow-500', label: 'Neutru' },
  negative: { icon: Frown, color: 'text-red-500', label: 'Negativ' },
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function TranscriptView({ transcript }: { transcript: TranscriptEntry[] }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Transcript Live</span>
          <Badge variant="secondary" className="text-[10px]">
            {transcript.length} mesaje
          </Badge>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="max-h-48 overflow-y-auto p-3 pt-0 space-y-2">
          {transcript.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'p-2 rounded-lg text-sm',
                entry.speaker === 'patient'
                  ? 'bg-blue-50 dark:bg-blue-950/30 ml-0 mr-8'
                  : entry.speaker === 'agent'
                    ? 'bg-green-50 dark:bg-green-950/30 ml-8 mr-0'
                    : 'bg-purple-50 dark:bg-purple-950/30 mx-4 text-center italic'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    'text-[10px] font-medium uppercase',
                    entry.speaker === 'patient'
                      ? 'text-blue-600'
                      : entry.speaker === 'agent'
                        ? 'text-green-600'
                        : 'text-purple-600'
                  )}
                >
                  {entry.speaker === 'patient'
                    ? 'Pacient'
                    : entry.speaker === 'agent'
                      ? 'Agent'
                      : 'Asistent AI'}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleTimeString('ro-RO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p>{entry.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CallPanel({ call, onCallEnded, onScheduleAppointment }: CallPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [duration, setDuration] = useState(call?.duration ?? 0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [callNote, setCallNote] = useState('');
  const [isHolding, setIsHolding] = useState(call?.status === 'on-hold');

  // Update duration every second while call is active
  useEffect(() => {
    if (call?.status !== 'in-progress') return;

    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [call]);

  // Reset duration when call changes
  useEffect(() => {
    if (call) {
      setDuration(call.duration);
      setIsHolding(call.status === 'on-hold');
    }
  }, [call]);

  const handleHold = () => {
    if (!call) return;
    startTransition(async () => {
      if (isHolding) {
        await resumeCallAction(call.callSid);
        setIsHolding(false);
      } else {
        await holdCallAction(call.callSid);
        setIsHolding(true);
      }
    });
  };

  const handleEndCall = (outcome: 'scheduled' | 'callback' | 'not-interested' | 'voicemail') => {
    if (!call) return;
    startTransition(async () => {
      // Save note if any
      if (callNote.trim()) {
        await addCallNoteAction(call.callSid, callNote);
      }
      await endCallAction(call.callSid, outcome);
      setShowEndDialog(false);
      setCallNote('');
      onCallEnded?.();
    });
  };

  if (!call) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Apel Activ
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Phone className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Niciun apel activ</p>
            <p className="text-sm text-muted-foreground mt-1">
              Preia un item din coadă pentru a începe
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const SentimentIcon = call.sentiment ? sentimentConfig[call.sentiment].icon : Meh;
  const sentimentColor = call.sentiment
    ? sentimentConfig[call.sentiment].color
    : 'text-muted-foreground';
  const classificationVariant =
    call.classification === 'HOT' ? 'hot' : call.classification === 'WARM' ? 'warm' : 'cold';

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="relative">
                <Phone className="h-5 w-5 text-green-500" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </div>
              Apel Activ
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={isHolding ? 'warm' : 'success'}>
                {isHolding ? 'În așteptare' : call.status === 'ringing' ? 'Sună...' : 'În progres'}
              </Badge>
              <span className="font-mono text-lg font-bold tabular-nums">
                {formatDuration(duration)}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col gap-4 overflow-y-auto">
          {/* Lead Info */}
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-lg">
                  {call.leadName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{call.leadName}</h3>
                    <Badge variant={classificationVariant}>{call.classification}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{call.leadPhone}</p>
                  {call.procedureInterest && (
                    <p className="text-sm text-primary font-medium mt-1">
                      {call.procedureInterest}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right space-y-1">
                {call.aiScore !== undefined && (
                  <div className="flex items-center gap-1 justify-end">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">AI Score: {call.aiScore}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 justify-end">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {call.previousInteractions} interacțiuni anterioare
                  </span>
                </div>
                <div className="flex items-center gap-1 justify-end">
                  <SentimentIcon className={cn('h-4 w-4', sentimentColor)} />
                  <span className={cn('text-sm', sentimentColor)}>
                    {call.sentiment ? sentimentConfig[call.sentiment].label : 'Analizare...'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Call Controls */}
          <div className="flex items-center justify-center gap-3 py-2">
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <MicOff className="h-5 w-5 text-red-500" /> : <Mic className="h-5 w-5" />}
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={handleHold}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isHolding ? (
                <Play className="h-5 w-5 text-green-500" />
              ) : (
                <Pause className="h-5 w-5" />
              )}
            </Button>

            <Button
              variant="destructive"
              size="icon"
              className="h-14 w-14 rounded-full"
              onClick={() => setShowEndDialog(true)}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
            >
              {isSpeakerOn ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5 text-red-500" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-12 w-12 rounded-full">
                  <ArrowRightLeft className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem>Transfer la supervisor</DropdownMenuItem>
                <DropdownMenuItem>Transfer la alt agent</DropdownMenuItem>
                <DropdownMenuItem>Adaugă participant</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => onScheduleAppointment?.(call.leadId)}
            >
              <Calendar className="h-4 w-4" />
              Programează
            </Button>
            <Button variant="outline" size="sm" className="gap-1">
              <StickyNote className="h-4 w-4" />
              Adaugă notă
            </Button>
            <Button variant="outline" size="sm" className="gap-1">
              <User className="h-4 w-4" />
              Profil lead
            </Button>
          </div>

          {/* Live Transcript */}
          <TranscriptView transcript={call.transcript} />

          {/* Call Notes */}
          <div className="mt-auto">
            <label htmlFor="call-notes" className="text-sm font-medium mb-1.5 block">
              Note apel
            </label>
            <Textarea
              id="call-notes"
              placeholder="Adaugă notițe despre apel..."
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              className="resize-none"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* End Call Dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Încheie apelul</DialogTitle>
            <DialogDescription>Selectează rezultatul apelului cu {call.leadName}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-4">
            <Button
              variant="outline"
              className="h-24 flex-col gap-2"
              onClick={() => handleEndCall('scheduled')}
              disabled={isPending}
            >
              <Calendar className="h-6 w-6 text-green-500" />
              <span>Programat</span>
              <span className="text-xs text-muted-foreground">Consultație programată</span>
            </Button>

            <Button
              variant="outline"
              className="h-24 flex-col gap-2"
              onClick={() => handleEndCall('callback')}
              disabled={isPending}
            >
              <Phone className="h-6 w-6 text-blue-500" />
              <span>Callback</span>
              <span className="text-xs text-muted-foreground">De sunat înapoi</span>
            </Button>

            <Button
              variant="outline"
              className="h-24 flex-col gap-2"
              onClick={() => handleEndCall('not-interested')}
              disabled={isPending}
            >
              <User className="h-6 w-6 text-orange-500" />
              <span>Neinteresat</span>
              <span className="text-xs text-muted-foreground">Nu dorește servicii</span>
            </Button>

            <Button
              variant="outline"
              className="h-24 flex-col gap-2"
              onClick={() => handleEndCall('voicemail')}
              disabled={isPending}
            >
              <MessageSquare className="h-6 w-6 text-gray-500" />
              <span>Voicemail</span>
              <span className="text-xs text-muted-foreground">Mesaj vocal lăsat</span>
            </Button>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEndDialog(false)}>
              Anulează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Skeleton for loading state
export function CallPanelSkeleton() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
          <div className="flex items-center gap-2">
            <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
            <div className="h-6 w-16 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 w-12 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
