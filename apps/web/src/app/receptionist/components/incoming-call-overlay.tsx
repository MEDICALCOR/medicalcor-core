'use client';

import { Phone, PhoneOff, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IncomingCall {
  callSid: string;
  callerName: string | null;
  callerPhone: string;
  leadScore: 'HOT' | 'WARM' | 'COLD' | null;
  lastContact: string | null;
  tip: string | null;
}

interface IncomingCallOverlayProps {
  call: IncomingCall;
  onAnswer: () => void;
  onDecline: () => void;
}

/**
 * Incoming call overlay - kindergarten simple
 *
 * Big caller info
 * Context tip if available
 * Two buttons: green answer, red decline
 */
export function IncomingCallOverlay({ call, onAnswer, onDecline }: IncomingCallOverlayProps) {
  const scoreColor = {
    HOT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    WARM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    COLD: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-background rounded-3xl p-8 max-w-md w-full text-center animate-in zoom-in-95">
        {/* Pulsing phone icon */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
          <div className="relative w-24 h-24 bg-green-500 rounded-full flex items-center justify-center">
            <Phone className="h-10 w-10 text-white" />
          </div>
        </div>

        {/* Caller info */}
        <h2 className="text-2xl font-bold mb-1">{call.callerName ?? 'Unknown Caller'}</h2>
        <p className="text-muted-foreground mb-4">
          {call.callerPhone.replace(/(\d{4})(\d{3})(\d{3})/, '$1 *** $3')}
        </p>

        {/* Lead score badge */}
        {call.leadScore && (
          <span
            className={cn(
              'inline-block px-3 py-1 rounded-full text-sm font-medium mb-4',
              scoreColor[call.leadScore]
            )}
          >
            {call.leadScore === 'HOT'
              ? '🔥 Hot Lead'
              : call.leadScore === 'WARM'
                ? '🌡️ Warm Lead'
                : '❄️ New Contact'}
          </span>
        )}

        {/* Last contact */}
        {call.lastContact && (
          <p className="text-sm text-muted-foreground mb-4">{call.lastContact}</p>
        )}

        {/* Tip box - if there's context from previous interactions */}
        {call.tip && (
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-200">{call.tip}</p>
            </div>
          </div>
        )}

        {/* Action buttons - big and obvious */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={onDecline}
            className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center transition-all',
              'bg-red-500 hover:bg-red-600 active:scale-95 text-white'
            )}
          >
            <PhoneOff className="h-7 w-7" />
          </button>

          <button
            onClick={onAnswer}
            className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center transition-all',
              'bg-green-500 hover:bg-green-600 active:scale-95 text-white',
              'ring-4 ring-green-500/30'
            )}
          >
            <Phone className="h-9 w-9" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-4">Tap green to answer</p>
      </div>
    </div>
  );
}
