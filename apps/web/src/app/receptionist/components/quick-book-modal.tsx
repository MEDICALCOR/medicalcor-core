'use client';

import { useState, useTransition } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface DaySlots {
  date: string;
  label: string; // "Tomorrow", "Thursday", etc.
  slots: TimeSlot[];
}

interface QuickBookModalProps {
  patientName: string;
  procedure?: string;
  days: DaySlots[];
  onBook: (date: string, time: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Quick booking modal - kindergarten simple
 *
 * Flow:
 * 1. See available days as columns
 * 2. Tap a time slot
 * 3. Done!
 *
 * Only shows AVAILABLE slots (can't make mistakes)
 */
export function QuickBookModal({
  patientName,
  procedure,
  days,
  onBook,
  onClose,
}: QuickBookModalProps) {
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBooked, setIsBooked] = useState(false);

  const handleBook = (date: string, time: string) => {
    setSelectedSlot({ date, time });
    startTransition(async () => {
      await onBook(date, time);
      setIsBooked(true);
      // Auto close after showing success
      setTimeout(() => {
        onClose();
      }, 2000);
    });
  };

  // Success state
  if (isBooked && selectedSlot) {
    const day = days.find((d) => d.date === selectedSlot.date);
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-background rounded-2xl p-8 max-w-sm w-full text-center animate-in zoom-in-95">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
            <Check className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Done!</h2>
          <p className="text-muted-foreground">
            {patientName} booked for
            <br />
            <span className="text-foreground font-medium">
              {day?.label} at {selectedSlot.time}
            </span>
          </p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-4">
            Confirmation sent via WhatsApp
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Book {patientName}</h2>
            {procedure && <p className="text-sm text-muted-foreground">{procedure}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Time slots grid */}
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {days.map((day) => (
              <div key={day.date} className="flex-1 min-w-[120px]">
                {/* Day header */}
                <div className="text-center mb-3">
                  <p className="font-medium">{day.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>

                {/* Time slots */}
                <div className="space-y-2">
                  {day.slots
                    .filter((slot) => slot.available) // Only show available slots
                    .map((slot) => {
                      const isSelected =
                        selectedSlot !== null &&
                        selectedSlot.date === day.date &&
                        selectedSlot.time === slot.time;
                      return (
                        <button
                          key={slot.time}
                          onClick={() => handleBook(day.date, slot.time)}
                          disabled={isPending}
                          className={cn(
                            'w-full py-3 px-4 rounded-xl text-sm font-medium transition-all',
                            'border-2',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted/50 hover:bg-muted border-transparent hover:border-primary/50',
                            'disabled:opacity-50'
                          )}
                        >
                          {isPending && isSelected ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : (
                            slot.time
                          )}
                        </button>
                      );
                    })}

                  {day.slots.filter((s) => s.available).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No slots</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hint */}
        <div className="p-4 border-t bg-muted/30">
          <p className="text-sm text-center text-muted-foreground">
            Tap any time to book instantly
          </p>
        </div>
      </div>
    </div>
  );
}
