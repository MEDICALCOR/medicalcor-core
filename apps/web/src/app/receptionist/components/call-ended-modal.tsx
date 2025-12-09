'use client';

import { useState, useTransition } from 'react';
import { Calendar, Phone, X, FileText, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CallOutcome = 'booked' | 'callback' | 'not_interested' | 'voicemail';

interface CallEndedModalProps {
  patientName: string;
  callDuration: string;
  onOutcome: (outcome: CallOutcome, note?: string) => Promise<void>;
  onBookAppointment: () => void;
}

/**
 * Call ended modal - kindergarten simple
 *
 * Question: "What happened?"
 * Answers: 4 big buttons
 * Most common action is biggest
 */
export function CallEndedModal({
  patientName,
  callDuration,
  onOutcome,
  onBookAppointment,
}: CallEndedModalProps) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<CallOutcome | null>(null);
  const [isDone, setIsDone] = useState(false);

  const handleOutcome = (outcome: CallOutcome) => {
    if (outcome === 'booked') {
      onBookAppointment();
      return;
    }

    setSelected(outcome);
    startTransition(async () => {
      await onOutcome(outcome);
      setIsDone(true);
    });
  };

  // Done state
  if (isDone) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-background rounded-2xl p-8 max-w-sm w-full text-center animate-in zoom-in-95">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">Saved!</h2>
          <p className="text-muted-foreground">Ready for next call</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background rounded-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-6 border-b text-center">
          <p className="text-sm text-muted-foreground">Call ended with</p>
          <h2 className="text-xl font-bold">{patientName}</h2>
          <p className="text-sm text-muted-foreground mt-1">Duration: {callDuration}</p>
        </div>

        {/* Question */}
        <div className="p-6">
          <p className="text-center font-medium mb-6">What happened?</p>

          {/* Big primary action - Book appointment */}
          <button
            onClick={() => handleOutcome('booked')}
            disabled={isPending}
            className={cn(
              'w-full py-6 rounded-xl transition-all mb-4',
              'bg-green-500 hover:bg-green-600 active:scale-[0.98] text-white',
              'flex items-center justify-center gap-3',
              'text-lg font-semibold',
              'disabled:opacity-50'
            )}
          >
            <Calendar className="h-6 w-6" />
            Booked Appointment
          </button>

          {/* Secondary actions - grid */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => handleOutcome('callback')}
              disabled={isPending}
              className={cn(
                'py-4 rounded-xl transition-all',
                'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50',
                'flex flex-col items-center gap-2',
                'disabled:opacity-50',
                selected === 'callback' && 'ring-2 ring-blue-500'
              )}
            >
              {isPending && selected === 'callback' ? (
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              ) : (
                <Phone className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              )}
              <span className="text-xs font-medium">Call Back</span>
            </button>

            <button
              onClick={() => handleOutcome('not_interested')}
              disabled={isPending}
              className={cn(
                'py-4 rounded-xl transition-all',
                'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700',
                'flex flex-col items-center gap-2',
                'disabled:opacity-50',
                selected === 'not_interested' && 'ring-2 ring-gray-500'
              )}
            >
              {isPending && selected === 'not_interested' ? (
                <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
              ) : (
                <X className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              )}
              <span className="text-xs font-medium">Not Interested</span>
            </button>

            <button
              onClick={() => handleOutcome('voicemail')}
              disabled={isPending}
              className={cn(
                'py-4 rounded-xl transition-all',
                'bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50',
                'flex flex-col items-center gap-2',
                'disabled:opacity-50',
                selected === 'voicemail' && 'ring-2 ring-amber-500'
              )}
            >
              {isPending && selected === 'voicemail' ? (
                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
              ) : (
                <FileText className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              )}
              <span className="text-xs font-medium">Voicemail</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
