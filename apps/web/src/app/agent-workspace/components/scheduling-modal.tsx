'use client';

import { useState, useCallback, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Calendar, Clock, Stethoscope } from 'lucide-react';
import { scheduleAppointmentAction } from '../actions';

interface SchedulingModalProps {
  leadId: string | null;
  leadName?: string;
  procedureInterest?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedulingComplete?: () => void;
}

const PROCEDURE_TYPES = [
  { value: 'consultation', label: 'Consultație' },
  { value: 'implant', label: 'Implant Dentar' },
  { value: 'all-on-4', label: 'All-on-4' },
  { value: 'all-on-6', label: 'All-on-6' },
  { value: 'extraction', label: 'Extracție' },
  { value: 'cleaning', label: 'Igienizare' },
  { value: 'whitening', label: 'Albire' },
  { value: 'filling', label: 'Plombă' },
  { value: 'crown', label: 'Coroană' },
  { value: 'root_canal', label: 'Tratament Canal' },
];

const TIME_SLOTS = [
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
];

export function SchedulingModal({
  leadId,
  leadName,
  procedureInterest,
  open,
  onOpenChange,
  onSchedulingComplete,
}: SchedulingModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [procedureType, setProcedureType] = useState(
    procedureInterest?.toLowerCase().includes('implant')
      ? 'implant'
      : procedureInterest?.toLowerCase().includes('all-on')
        ? 'all-on-4'
        : 'consultation'
  );
  const [notes, setNotes] = useState('');

  const resetForm = useCallback(() => {
    setDate('');
    setTime('');
    setProcedureType('consultation');
    setNotes('');
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetForm();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetForm]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!leadId) return;

      // Validation
      if (!date) {
        setError('Data programării este obligatorie');
        return;
      }
      if (!time) {
        setError('Ora programării este obligatorie');
        return;
      }

      setError(null);

      startTransition(() => {
        void (async () => {
          const result = await scheduleAppointmentAction(leadId, {
            date,
            time,
            procedureType,
            notes: notes.trim() || undefined,
          });

          if (result.success) {
            resetForm();
            onOpenChange(false);
            onSchedulingComplete?.();
          } else {
            setError('Eroare la programare. Vă rugăm încercați din nou.');
          }
        })();
      });
    },
    [leadId, date, time, procedureType, notes, resetForm, onOpenChange, onSchedulingComplete]
  );

  // Get minimum date (today)
  const minDate = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Programare Consultație
          </DialogTitle>
          <DialogDescription>
            {leadName
              ? `Programează o consultație pentru ${leadName}`
              : 'Completați detaliile pentru programare'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date Selection */}
          <div className="space-y-2">
            <Label htmlFor="date" className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Data
            </Label>
            <Input
              id="date"
              type="date"
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Time Selection */}
          <div className="space-y-2">
            <Label htmlFor="time" className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Ora
            </Label>
            <Select value={time} onValueChange={setTime} disabled={isPending}>
              <SelectTrigger id="time">
                <SelectValue placeholder="Selectați ora" />
              </SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Procedure Type */}
          <div className="space-y-2">
            <Label htmlFor="procedureType" className="flex items-center gap-1.5">
              <Stethoscope className="h-4 w-4" />
              Tip Procedură
            </Label>
            <Select value={procedureType} onValueChange={setProcedureType} disabled={isPending}>
              <SelectTrigger id="procedureType">
                <SelectValue placeholder="Selectați procedura" />
              </SelectTrigger>
              <SelectContent>
                {PROCEDURE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notițe (opțional)</Label>
            <Input
              id="notes"
              placeholder="Ex: Pacient solicită consultație de urgență"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Anulează
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmă Programare
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
