'use client';

import { useState, useTransition } from 'react';
import { Check, Clock, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Appointment {
  id: string;
  time: string;
  patientName: string;
  procedure: string;
  confirmed: boolean;
  checkedIn: boolean;
}

interface AppointmentRowProps {
  appointment: Appointment;
  onSendReminder: (id: string) => Promise<void>;
  onCheckIn: (id: string) => Promise<void>;
}

/**
 * Single appointment row - kindergarten simple
 * Status shown with icons, not text
 * One action button that's obvious
 */
function AppointmentRow({ appointment, onSendReminder, onCheckIn }: AppointmentRowProps) {
  const [isPending, startTransition] = useTransition();
  const [justSent, setJustSent] = useState(false);

  const handleReminder = () => {
    startTransition(async () => {
      await onSendReminder(appointment.id);
      setJustSent(true);
      setTimeout(() => setJustSent(false), 3000);
    });
  };

  const handleCheckIn = () => {
    startTransition(async () => {
      await onCheckIn(appointment.id);
    });
  };

  // Already checked in - show green
  if (appointment.checkedIn) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
        <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0">
          <Check className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{appointment.time}</span>
            <span className="font-medium truncate">{appointment.patientName}</span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{appointment.procedure}</p>
        </div>
        <span className="text-xs text-green-600 dark:text-green-400 font-medium">Here</span>
      </div>
    );
  }

  // Confirmed - show blue, allow check-in
  if (appointment.confirmed) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
          <Check className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{appointment.time}</span>
            <span className="font-medium truncate">{appointment.patientName}</span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{appointment.procedure}</p>
        </div>
        <button
          onClick={handleCheckIn}
          disabled={isPending}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            'bg-green-500 hover:bg-green-600 text-white',
            'disabled:opacity-50'
          )}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check In'}
        </button>
      </div>
    );
  }

  // Not confirmed - show yellow warning, send reminder button
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-400">
      <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
        <Clock className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{appointment.time}</span>
          <span className="font-medium truncate">{appointment.patientName}</span>
        </div>
        <p className="text-sm text-muted-foreground truncate">{appointment.procedure}</p>
      </div>

      {justSent ? (
        <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
          <Check className="h-3 w-3" /> Sent!
        </span>
      ) : (
        <button
          onClick={handleReminder}
          disabled={isPending}
          className={cn(
            'px-3 py-2 rounded-lg text-sm font-medium transition-all',
            'bg-amber-500 hover:bg-amber-600 text-white',
            'disabled:opacity-50 flex items-center gap-1'
          )}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="h-3 w-3" />
              Remind
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface TodaysAppointmentsProps {
  appointments: Appointment[];
  onSendReminder: (id: string) => Promise<void>;
  onCheckIn: (id: string) => Promise<void>;
}

/**
 * Today's appointments list - kindergarten simple
 * Shows at a glance:
 * - Green check = here/checked in
 * - Blue check = confirmed
 * - Yellow clock = not confirmed (needs reminder)
 */
export function TodaysAppointments({
  appointments,
  onSendReminder,
  onCheckIn,
}: TodaysAppointmentsProps) {
  const confirmed = appointments.filter((a) => a.confirmed || a.checkedIn).length;
  const unconfirmed = appointments.length - confirmed;

  return (
    <div className="space-y-3">
      {/* Header with summary */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <span>📅</span>
          Today
          <span className="text-muted-foreground font-normal text-base">
            ({appointments.length})
          </span>
        </h2>
        {unconfirmed > 0 && (
          <span className="text-sm px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {unconfirmed} unconfirmed
          </span>
        )}
      </div>

      {/* Appointment list */}
      <div className="space-y-2">
        {appointments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No appointments today</div>
        ) : (
          appointments.map((appointment) => (
            <AppointmentRow
              key={appointment.id}
              appointment={appointment}
              onSendReminder={onSendReminder}
              onCheckIn={onCheckIn}
            />
          ))
        )}
      </div>
    </div>
  );
}
