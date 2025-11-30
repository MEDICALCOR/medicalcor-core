'use client';

import { useState } from 'react';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  MapPin,
  Check,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type BookingStep = 'service' | 'doctor' | 'datetime' | 'details' | 'confirm';

interface Service {
  id: string;
  name: string;
  duration: number;
  price: number;
  category: string;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  avatar: string;
  rating: number;
  nextAvailable: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

const services: Service[] = [
  { id: 's1', name: 'Consultație generală', duration: 30, price: 150, category: 'Consultații' },
  { id: 's2', name: 'Consultație specialist', duration: 45, price: 250, category: 'Consultații' },
  { id: 's3', name: 'Control periodic', duration: 30, price: 100, category: 'Controale' },
  { id: 's4', name: 'Ecografie abdominală', duration: 30, price: 200, category: 'Investigații' },
  { id: 's5', name: 'EKG', duration: 20, price: 80, category: 'Investigații' },
  { id: 's6', name: 'Analize laborator', duration: 15, price: 120, category: 'Laborator' },
  { id: 's7', name: 'Vaccinare', duration: 15, price: 50, category: 'Proceduri' },
  { id: 's8', name: 'Tratament perfuzabil', duration: 60, price: 300, category: 'Proceduri' },
];

const doctors: Doctor[] = [
  {
    id: 'd1',
    name: 'Dr. Maria Popescu',
    specialty: 'Medicină internă',
    avatar: 'MP',
    rating: 4.9,
    nextAvailable: 'Mâine',
  },
  {
    id: 'd2',
    name: 'Dr. Ion Ionescu',
    specialty: 'Cardiologie',
    avatar: 'II',
    rating: 4.8,
    nextAvailable: 'Azi',
  },
  {
    id: 'd3',
    name: 'Dr. Elena Dumitrescu',
    specialty: 'Medicină de familie',
    avatar: 'ED',
    rating: 4.7,
    nextAvailable: 'Mâine',
  },
  {
    id: 'd4',
    name: 'Dr. Andrei Popa',
    specialty: 'Gastroenterologie',
    avatar: 'AP',
    rating: 4.9,
    nextAvailable: 'Joi',
  },
];

const generateTimeSlots = (): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  for (let hour = 8; hour <= 18; hour++) {
    slots.push({ time: `${hour.toString().padStart(2, '0')}:00`, available: Math.random() > 0.3 });
    if (hour < 18) {
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:30`,
        available: Math.random() > 0.3,
      });
    }
  }
  return slots;
};

const getDaysInMonth = (year: number, month: number): Date[] => {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

export default function BookingPage() {
  const [currentStep, setCurrentStep] = useState<BookingStep>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isBookingConfirmed, setIsBookingConfirmed] = useState(false);
  const [patientDetails, setPatientDetails] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    notes: '',
  });

  const handleConfirmBooking = () => {
    // TODO: Implement actual booking API call
    // For now, just show success state
    setIsBookingConfirmed(true);
  };

  const timeSlots = generateTimeSlots();
  const days = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const steps: { id: BookingStep; label: string }[] = [
    { id: 'service', label: 'Serviciu' },
    { id: 'doctor', label: 'Medic' },
    { id: 'datetime', label: 'Data & Ora' },
    { id: 'details', label: 'Date pacient' },
    { id: 'confirm', label: 'Confirmare' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case 'service':
        return !!selectedService;
      case 'doctor':
        return !!selectedDoctor;
      case 'datetime':
        return !!selectedDate && !!selectedTime;
      case 'details':
        return patientDetails.firstName && patientDetails.lastName && patientDetails.phone;
      case 'confirm':
        return true;
    }
  };

  const nextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const prevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const monthNames = [
    'Ianuarie',
    'Februarie',
    'Martie',
    'Aprilie',
    'Mai',
    'Iunie',
    'Iulie',
    'August',
    'Septembrie',
    'Octombrie',
    'Noiembrie',
    'Decembrie',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" />
          Programare Online
        </h1>
        <p className="text-muted-foreground mt-1">
          Programează o consultație în câțiva pași simpli
        </p>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const isActive = index === currentStepIndex;
              const isComplete = index < currentStepIndex;

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                        isComplete
                          ? 'bg-green-500 text-white'
                          : isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {isComplete ? <Check className="h-5 w-5" /> : index + 1}
                    </div>
                    <span className={cn('text-xs mt-2 hidden sm:block', isActive && 'font-medium')}>
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        'h-[2px] w-8 sm:w-16 mx-2 sm:mx-4',
                        index < currentStepIndex ? 'bg-green-500' : 'bg-muted'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      {currentStep === 'service' && (
        <Card>
          <CardHeader>
            <CardTitle>Selectează serviciul</CardTitle>
            <CardDescription>Alege tipul de consultație sau procedură dorită</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3">
              {services.map((service) => (
                <div
                  key={service.id}
                  onClick={() => setSelectedService(service)}
                  className={cn(
                    'p-4 border rounded-lg cursor-pointer transition-all',
                    selectedService?.id === service.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'hover:border-primary/50'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">{service.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {service.duration} min
                      </p>
                    </div>
                    <Badge variant="secondary">{service.price} RON</Badge>
                  </div>
                  <Badge variant="outline" className="mt-2 text-xs">
                    {service.category}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 'doctor' && (
        <Card>
          <CardHeader>
            <CardTitle>Alege medicul</CardTitle>
            <CardDescription>Selectează medicul pentru {selectedService?.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              {doctors.map((doctor) => (
                <div
                  key={doctor.id}
                  onClick={() => setSelectedDoctor(doctor)}
                  className={cn(
                    'p-4 border rounded-lg cursor-pointer transition-all',
                    selectedDoctor?.id === doctor.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'hover:border-primary/50'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                      {doctor.avatar}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">{doctor.name}</h3>
                      <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          ⭐ {doctor.rating}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Disponibil: {doctor.nextAvailable}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 'datetime' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Selectează data</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium w-32 text-center">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
                      )
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-center mb-2">
                {['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'].map((day) => (
                  <div key={day} className="text-xs text-muted-foreground font-medium py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: (days[0].getDay() + 6) % 7 }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {days.map((day) => {
                  const isToday = day.toDateString() === new Date().toDateString();
                  const isPast = day < today;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  const isSelected = selectedDate?.toDateString() === day.toDateString();
                  const isDisabled = isPast || isWeekend;

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => !isDisabled && setSelectedDate(day)}
                      disabled={isDisabled}
                      className={cn(
                        'p-2 text-sm rounded-lg transition-colors',
                        isSelected && 'bg-primary text-primary-foreground',
                        isToday && !isSelected && 'ring-1 ring-primary',
                        isDisabled && 'text-muted-foreground/50 cursor-not-allowed',
                        !isDisabled && !isSelected && 'hover:bg-muted'
                      )}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selectează ora</CardTitle>
              <CardDescription>
                {selectedDate ? formatDate(selectedDate) : 'Selectează mai întâi o dată'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedDate ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot.time}
                      onClick={() => slot.available && setSelectedTime(slot.time)}
                      disabled={!slot.available}
                      className={cn(
                        'p-2 text-sm rounded-lg border transition-colors',
                        selectedTime === slot.time &&
                          'bg-primary text-primary-foreground border-primary',
                        !slot.available && 'bg-muted text-muted-foreground cursor-not-allowed',
                        slot.available && selectedTime !== slot.time && 'hover:border-primary'
                      )}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selectează o dată din calendar</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {currentStep === 'details' && (
        <Card>
          <CardHeader>
            <CardTitle>Datele pacientului</CardTitle>
            <CardDescription>Completează informațiile pentru programare</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prenume *</Label>
                <Input
                  id="firstName"
                  value={patientDetails.firstName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPatientDetails({ ...patientDetails, firstName: e.target.value })
                  }
                  placeholder="Prenume"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nume *</Label>
                <Input
                  id="lastName"
                  value={patientDetails.lastName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPatientDetails({ ...patientDetails, lastName: e.target.value })
                  }
                  placeholder="Nume"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={patientDetails.phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPatientDetails({ ...patientDetails, phone: e.target.value })
                  }
                  placeholder="07XX XXX XXX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={patientDetails.email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setPatientDetails({ ...patientDetails, email: e.target.value })
                  }
                  placeholder="email@exemplu.ro"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Note/Simptome (opțional)</Label>
                <Textarea
                  id="notes"
                  value={patientDetails.notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setPatientDetails({ ...patientDetails, notes: e.target.value })
                  }
                  placeholder="Descrieți pe scurt motivul vizitei..."
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 'confirm' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Confirmare programare
            </CardTitle>
            <CardDescription>Verifică detaliile și confirmă programarea</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 max-w-2xl">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Stethoscope className="h-4 w-4" />
                    Serviciu
                  </div>
                  <p className="font-medium">{selectedService?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedService?.duration} min • {selectedService?.price} RON
                  </p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <User className="h-4 w-4" />
                    Medic
                  </div>
                  <p className="font-medium">{selectedDoctor?.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedDoctor?.specialty}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    Data și ora
                  </div>
                  <p className="font-medium">{selectedDate && formatDate(selectedDate)}</p>
                  <p className="text-sm text-muted-foreground">Ora {selectedTime}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <MapPin className="h-4 w-4" />
                    Locație
                  </div>
                  <p className="font-medium">Clinica MedicalCor</p>
                  <p className="text-sm text-muted-foreground">Str. Victoriei 100, București</p>
                </div>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-3">Date pacient</h4>
                <div className="grid sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nume:</span> {patientDetails.firstName}{' '}
                    {patientDetails.lastName}
                  </div>
                  <div className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {patientDetails.phone}
                  </div>
                  {patientDetails.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      {patientDetails.email}
                    </div>
                  )}
                </div>
                {patientDetails.notes && (
                  <div className="mt-3 pt-3 border-t">
                    <span className="text-sm text-muted-foreground">Note:</span>
                    <p className="text-sm mt-1">{patientDetails.notes}</p>
                  </div>
                )}
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-400">
                  Vei primi o confirmare prin SMS și email după finalizarea programării. Te rugăm să
                  te prezinți cu 10 minute înainte de ora programată.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={prevStep} disabled={currentStepIndex === 0}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Înapoi
        </Button>
        {currentStep === 'confirm' ? (
          <Button onClick={handleConfirmBooking} disabled={isBookingConfirmed}>
            <Check className="h-4 w-4 mr-2" />
            {isBookingConfirmed ? 'Programare confirmată!' : 'Confirmă programarea'}
          </Button>
        ) : (
          <Button onClick={nextStep} disabled={!canProceed()}>
            Continuă
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>

      {/* Success Message */}
      {isBookingConfirmed && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-green-700">
              <Check className="h-6 w-6" />
              <div>
                <p className="font-medium">Programare confirmată cu succes!</p>
                <p className="text-sm text-green-600">
                  Veți primi un email de confirmare în curând.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
