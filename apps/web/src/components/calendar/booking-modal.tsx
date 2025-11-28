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
import { Loader2, Calendar, Clock, User, Stethoscope } from 'lucide-react';
import type { CalendarSlot } from '@medicalcor/types';
import {
  bookAppointmentAction,
  type BookAppointmentRequest,
} from '@/app/actions/calendar';

interface BookingModalProps {
  slot: CalendarSlot | null;
  selectedDate: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookingComplete: () => void;
}

const PROCEDURE_TYPES = [
  { value: 'consultation', label: 'Consultație' },
  { value: 'implant', label: 'Implant Dentar' },
  { value: 'extraction', label: 'Extracție' },
  { value: 'cleaning', label: 'Igienizare' },
  { value: 'whitening', label: 'Albire' },
  { value: 'filling', label: 'Plombă' },
  { value: 'crown', label: 'Coroană' },
  { value: 'root_canal', label: 'Tratament Canal' },
];

export function BookingModal({
  slot,
  selectedDate,
  open,
  onOpenChange,
  onBookingComplete,
}: BookingModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [procedureType, setProcedureType] = useState('consultation');
  const [notes, setNotes] = useState('');

  const resetForm = useCallback(() => {
    setPatientName('');
    setPatientPhone('');
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

      if (!slot) return;

      // Validation
      if (!patientName.trim()) {
        setError('Numele pacientului este obligatoriu');
        return;
      }
      if (!patientPhone.trim()) {
        setError('Telefonul pacientului este obligatoriu');
        return;
      }

      setError(null);

      startTransition(async () => {
        const request: BookAppointmentRequest = {
          slotId: slot.id,
          patientId: `new-${Date.now()}`, // For new patients without HubSpot ID
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim(),
          procedureType,
          notes: notes.trim() || undefined,
        };

        const result = await bookAppointmentAction(request);

        if (result.success) {
          resetForm();
          onOpenChange(false);
          onBookingComplete();
        } else {
          setError(result.error ?? 'Eroare la programare');
        }
      });
    },
    [slot, patientName, patientPhone, procedureType, notes, resetForm, onOpenChange, onBookingComplete]
  );

  const formattedDate = selectedDate.toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Programare Nouă
          </DialogTitle>
          <DialogDescription>
            Completați detaliile pentru programarea nouă
          </DialogDescription>
        </DialogHeader>

        {slot && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Slot Info */}
            <div className="rounded-lg bg-muted p-3">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{slot.time}</span>
                </div>
                <div className="text-muted-foreground">
                  {slot.duration} minute
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formattedDate}
              </div>
            </div>

            {/* Patient Name */}
            <div className="space-y-2">
              <Label htmlFor="patientName" className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                Nume Pacient
              </Label>
              <Input
                id="patientName"
                placeholder="Ex: Ion Popescu"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                disabled={isPending}
              />
            </div>

            {/* Patient Phone */}
            <div className="space-y-2">
              <Label htmlFor="patientPhone">Telefon</Label>
              <Input
                id="patientPhone"
                type="tel"
                placeholder="Ex: +40721000000"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                disabled={isPending}
              />
            </div>

            {/* Procedure Type */}
            <div className="space-y-2">
              <Label htmlFor="procedureType" className="flex items-center gap-1.5">
                <Stethoscope className="h-4 w-4" />
                Tip Procedură
              </Label>
              <Select
                value={procedureType}
                onValueChange={setProcedureType}
                disabled={isPending}
              >
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
                placeholder="Ex: Pacient nou, trimis de Dr. Ionescu"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isPending}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
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
        )}
      </DialogContent>
    </Dialog>
  );
}
