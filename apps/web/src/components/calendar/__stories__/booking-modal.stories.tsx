import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { useState } from 'react';
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

interface CalendarSlot {
  id: string;
  time: string;
  duration: number;
}

interface BookingModalDemoProps {
  slot?: CalendarSlot;
  selectedDate?: Date;
  isOpen?: boolean;
  isLoading?: boolean;
  error?: string;
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

function BookingModalDemo({
  slot = { id: '1', time: '10:00', duration: 45 },
  selectedDate = new Date(),
  isOpen = true,
  isLoading = false,
  error,
}: BookingModalDemoProps) {
  const [open, setOpen] = useState(isOpen);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [procedureType, setProcedureType] = useState('consultation');
  const [notes, setNotes] = useState('');

  const formattedDate = selectedDate.toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Programare Nouă
          </DialogTitle>
          <DialogDescription>Completați detaliile pentru programarea nouă</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          {/* Slot Info */}
          <div className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{slot.time}</span>
              </div>
              <div className="text-muted-foreground">{slot.duration} minute</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{formattedDate}</div>
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
              disabled={isLoading}
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
              disabled={isLoading}
            />
          </div>

          {/* Procedure Type */}
          <div className="space-y-2">
            <Label htmlFor="procedureType" className="flex items-center gap-1.5">
              <Stethoscope className="h-4 w-4" />
              Tip Procedură
            </Label>
            <Select value={procedureType} onValueChange={setProcedureType} disabled={isLoading}>
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
              disabled={isLoading}
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
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Anulează
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmă Programare
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  title: 'Calendar/BookingModal',
  component: BookingModalDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof BookingModalDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    slot: { id: '1', time: '10:00', duration: 45 },
    selectedDate: new Date(),
    isOpen: true,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const WithError: Story = {
  args: {
    error: 'Numele pacientului este obligatoriu',
  },
};

export const DifferentSlot: Story = {
  args: {
    slot: { id: '2', time: '14:30', duration: 60 },
    selectedDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
};

export const LongProcedure: Story = {
  args: {
    slot: { id: '3', time: '09:00', duration: 180 },
    selectedDate: new Date(),
  },
};

export const ProcedureTypes: Story = {
  render: () => (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Available Procedure Types</h3>
      <div className="grid grid-cols-2 gap-2">
        {PROCEDURE_TYPES.map((type) => (
          <div key={type.value} className="flex items-center gap-2 p-3 border rounded-lg">
            <Stethoscope className="h-4 w-4 text-primary" />
            <span>{type.label}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};
