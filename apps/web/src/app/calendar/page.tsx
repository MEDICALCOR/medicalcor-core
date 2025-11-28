'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Plus, Clock, User, Loader2, Calendar, Phone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCalendarSlotsAction, type CalendarSlot } from '@/app/actions/get-patients';

const weekDays = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin'];

function generateWeekDates(startDate: Date) {
  const dates = [];
  const start = new Date(startDate);
  start.setDate(start.getDate() - start.getDay() + 1); // Monday

  for (let i = 0; i < 5; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }
  return dates;
}

function TimeSlot({ slot, onBook }: { slot: CalendarSlot; onBook: (slot: CalendarSlot) => void }) {
  if (slot.available) {
    return (
      <button
        onClick={() => onBook(slot)}
        className="group flex h-16 w-full items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 transition-all hover:border-primary hover:bg-primary/10"
      >
        <div className="flex items-center gap-2 text-primary opacity-60 group-hover:opacity-100">
          <Plus className="h-4 w-4" />
          <span className="text-sm font-medium">{slot.time}</span>
        </div>
      </button>
    );
  }

  return (
    <div className="flex h-16 w-full flex-col justify-center rounded-lg bg-secondary px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{slot.time}</span>
        <Badge variant="outline" className="text-[10px]">
          {slot.duration} min
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <User className="h-3 w-3" />
        <span>{slot.patient}</span>
        <span>•</span>
        <span>{slot.procedure}</span>
      </div>
    </div>
  );
}

function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

// Procedure types for the booking form
const PROCEDURE_TYPES = [
  { value: 'consultatie', label: 'Consultație' },
  { value: 'control', label: 'Control' },
  { value: 'implant', label: 'Implant dentar' },
  { value: 'extractie', label: 'Extracție' },
  { value: 'albire', label: 'Albire dentară' },
  { value: 'detartraj', label: 'Detartraj' },
  { value: 'ortodontie', label: 'Ortodonție' },
  { value: 'alt', label: 'Alt serviciu' },
];

interface BookingFormData {
  patientName: string;
  patientPhone: string;
  procedure: string;
  notes: string;
}

const initialFormData: BookingFormData = {
  patientName: '',
  patientPhone: '',
  procedure: '',
  notes: '',
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [isPending, startTransition] = useTransition();

  // Booking modal state
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [formData, setFormData] = useState<BookingFormData>(initialFormData);
  const [isBooking, startBookingTransition] = useTransition();

  const weekDates = generateWeekDates(currentDate);

  // Fetch slots when selected date changes
  useEffect(() => {
    startTransition(async () => {
      const dateStr = selectedDate.toISOString().split('T')[0] ?? '';
      const fetchedSlots = await getCalendarSlotsAction(dateStr);
      setSlots(fetchedSlots);
    });
  }, [selectedDate]);

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleBookSlot = useCallback((slot: CalendarSlot) => {
    setSelectedSlot(slot);
    setFormData(initialFormData);
    setBookingModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setBookingModalOpen(false);
    setSelectedSlot(null);
    setFormData(initialFormData);
  }, []);

  const handleFormChange = useCallback((field: keyof BookingFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmitBooking = useCallback(() => {
    if (!selectedSlot || !formData.patientName || !formData.patientPhone || !formData.procedure) {
      return;
    }

    startBookingTransition(async () => {
      // TODO: Call server action to create booking
      // For now, simulate a successful booking
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Update local state to show slot as booked
      setSlots((prevSlots) =>
        prevSlots.map((slot) =>
          slot.id === selectedSlot.id
            ? {
                ...slot,
                available: false,
                patient: formData.patientName,
                procedure: PROCEDURE_TYPES.find((p) => p.value === formData.procedure)?.label ?? formData.procedure,
              }
            : slot
        )
      );

      handleCloseModal();
    });
  }, [selectedSlot, formData, handleCloseModal]);

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Calendar Programări</h2>
          <p className="text-muted-foreground">Gestionează programările și disponibilitatea</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Programare Nouă
        </Button>
      </div>

      {/* Week Navigation */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={goToPreviousWeek}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-lg">
              {currentDate.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={goToNextWeek}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Week Days Header */}
          <div className="mb-4 grid grid-cols-5 gap-2">
            {weekDates.map((date, i) => (
              <button
                key={i}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center rounded-lg p-3 transition-all ${
                  isSelected(date)
                    ? 'bg-primary text-primary-foreground'
                    : isToday(date)
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent'
                }`}
              >
                <span className="text-xs font-medium">{weekDays[i]}</span>
                <span className="text-2xl font-bold">{date.getDate()}</span>
              </button>
            ))}
          </div>

          {/* Time Slots */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>
                {selectedDate.toLocaleDateString('ro-RO', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>

            {isPending ? (
              <SlotsSkeleton />
            ) : slots.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {slots.map((slot) => (
                  <TimeSlot key={slot.id} slot={slot} onBook={handleBookSlot} />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <p>Nicio programare disponibilă pentru această zi.</p>
                <p className="text-sm">Selectați o altă zi sau adăugați sloturi noi.</p>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded border-2 border-dashed border-primary/30 bg-primary/5" />
              <span>Disponibil</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-3 w-3 rounded bg-secondary" />
              <span>Ocupat</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Booking Modal */}
      <Dialog open={bookingModalOpen} onOpenChange={setBookingModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" aria-hidden="true" />
              Programare Nouă
            </DialogTitle>
            <DialogDescription>
              {selectedSlot && (
                <>
                  {selectedDate.toLocaleDateString('ro-RO', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}{' '}
                  la ora {selectedSlot.time} ({selectedSlot.duration} minute)
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="patientName">Nume pacient *</Label>
              <Input
                id="patientName"
                placeholder="ex: Ion Popescu"
                value={formData.patientName}
                onChange={(e) => handleFormChange('patientName', e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="patientPhone">Telefon *</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="patientPhone"
                  placeholder="07XX XXX XXX"
                  className="pl-9"
                  value={formData.patientPhone}
                  onChange={(e) => handleFormChange('patientPhone', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="procedure">Procedură *</Label>
              <Select
                value={formData.procedure}
                onValueChange={(value) => handleFormChange('procedure', value)}
              >
                <SelectTrigger id="procedure">
                  <SelectValue placeholder="Selectează procedura" />
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

            <div className="grid gap-2">
              <Label htmlFor="notes">Observații</Label>
              <Input
                id="notes"
                placeholder="Observații opționale..."
                value={formData.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal}>
              Anulează
            </Button>
            <Button
              onClick={handleSubmitBooking}
              disabled={
                isBooking ||
                !formData.patientName ||
                !formData.patientPhone ||
                !formData.procedure
              }
            >
              {isBooking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Se salvează...
                </>
              ) : (
                'Confirmă Programarea'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
