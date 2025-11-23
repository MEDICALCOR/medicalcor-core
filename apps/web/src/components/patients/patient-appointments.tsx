'use client';

import {
  Calendar,
  Clock,
  MapPin,
  User,
  MoreVertical,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { PatientAppointment } from '@/lib/patients';

interface PatientAppointmentsProps {
  appointments: PatientAppointment[];
  onNewAppointment?: () => void;
}

const statusLabels: Record<PatientAppointment['status'], string> = {
  scheduled: 'Programat',
  confirmed: 'Confirmat',
  completed: 'Finalizat',
  cancelled: 'Anulat',
  'no-show': 'Neprezentare',
};

const statusColors: Record<PatientAppointment['status'], string> = {
  scheduled: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  'no-show': 'bg-gray-100 text-gray-700',
};

const statusIcons: Record<PatientAppointment['status'], React.ElementType> = {
  scheduled: Clock,
  confirmed: CheckCircle2,
  completed: CheckCircle2,
  cancelled: XCircle,
  'no-show': AlertCircle,
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isUpcoming(date: Date): boolean {
  return date.getTime() > Date.now();
}

export function PatientAppointments({ appointments, onNewAppointment }: PatientAppointmentsProps) {
  const upcomingAppointments = appointments
    .filter((apt) => isUpcoming(apt.date))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const pastAppointments = appointments
    .filter((apt) => !isUpcoming(apt.date))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Programări</h3>
        <Button size="sm" onClick={onNewAppointment}>
          <Plus className="h-4 w-4 mr-2" />
          Programare nouă
        </Button>
      </div>

      {/* Upcoming Appointments */}
      {upcomingAppointments.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            Programări viitoare ({upcomingAppointments.length})
          </h4>
          <div className="space-y-3">
            {upcomingAppointments.map((apt) => {
              const StatusIcon = statusIcons[apt.status];
              return (
                <Card key={apt.id} className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge className={cn('text-xs', statusColors[apt.status])}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusLabels[apt.status]}
                          </Badge>
                          <span className="font-medium">{apt.type}</span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {formatDate(apt.date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {apt.time} ({apt.duration} min)
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {apt.doctor && (
                            <span className="flex items-center gap-1">
                              <User className="h-4 w-4" />
                              {apt.doctor}
                            </span>
                          )}
                          {apt.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {apt.location}
                            </span>
                          )}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Editează</DropdownMenuItem>
                          <DropdownMenuItem>Reprogramează</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">Anulează</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Past Appointments */}
      {pastAppointments.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            Istoric programări ({pastAppointments.length})
          </h4>
          <div className="space-y-2">
            {pastAppointments.map((apt) => {
              const StatusIcon = statusIcons[apt.status];
              return (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{apt.type}</span>
                        <Badge
                          variant="secondary"
                          className={cn('text-[10px]', statusColors[apt.status])}
                        >
                          <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                          {statusLabels[apt.status]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(apt.date)} • {apt.time}
                        {apt.doctor && ` • ${apt.doctor}`}
                      </p>
                    </div>
                  </div>
                  {apt.notes && (
                    <p className="text-xs text-muted-foreground max-w-xs truncate">{apt.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {appointments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nu există programări</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onNewAppointment}>
            <Plus className="h-4 w-4 mr-2" />
            Creează prima programare
          </Button>
        </div>
      )}
    </div>
  );
}
