'use client';

import { useState } from 'react';
import {
  CalendarDays,
  Users,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Coffee,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  department: string;
  avatar?: string;
}

interface Shift {
  id: string;
  staffId: string;
  date: Date;
  startTime: string;
  endTime: string;
  type: 'regular' | 'overtime' | 'on_call' | 'vacation' | 'sick';
}

const staff: StaffMember[] = [
  { id: 's1', name: 'Dr. Maria Ionescu', role: 'Medic', department: 'Medicină internă' },
  { id: 's2', name: 'Dr. Elena Dumitrescu', role: 'Medic', department: 'Cardiologie' },
  { id: 's3', name: 'Dr. Andrei Popa', role: 'Medic', department: 'Chirurgie' },
  { id: 's4', name: 'Ana Popescu', role: 'Asistent medical', department: 'Urgențe' },
  { id: 's5', name: 'Ion Gheorghe', role: 'Asistent medical', department: 'Medicină internă' },
  { id: 's6', name: 'Maria Radu', role: 'Recepționer', department: 'Recepție' },
];

const generateShifts = (): Shift[] => {
  const shifts: Shift[] = [];
  const today = new Date();

  staff.forEach((s) => {
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);

      if (date.getDay() === 0 || date.getDay() === 6) {
        if (Math.random() > 0.7) {
          shifts.push({
            id: `${s.id}-${i}`,
            staffId: s.id,
            date,
            startTime: '08:00',
            endTime: '14:00',
            type: 'on_call',
          });
        }
      } else {
        const types: Shift['type'][] = ['regular', 'overtime', 'vacation', 'sick'];
        const randomType =
          Math.random() > 0.85 ? types[Math.floor(Math.random() * 3) + 1] : 'regular';

        shifts.push({
          id: `${s.id}-${i}`,
          staffId: s.id,
          date,
          startTime: randomType === 'regular' || randomType === 'overtime' ? '09:00' : '',
          endTime: randomType === 'regular' ? '17:00' : randomType === 'overtime' ? '20:00' : '',
          type: randomType,
        });
      }
    }
  });

  return shifts;
};

const shifts = generateShifts();

const shiftTypeConfig = {
  regular: { label: 'Normal', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Briefcase },
  overtime: {
    label: 'Ore suplimentare',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: Clock,
  },
  on_call: {
    label: 'De gardă',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: AlertCircle,
  },
  vacation: {
    label: 'Concediu',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: Coffee,
  },
  sick: { label: 'Medical', color: 'bg-red-100 text-red-700 border-red-200', icon: User },
};

export default function StaffSchedulePage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
  });
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const weekDays = getWeekDays();

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeekStart((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      return newDate;
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  };

  const formatDayName = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { weekday: 'short' });
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getShiftForStaffAndDay = (staffId: string, date: Date): Shift | undefined => {
    return shifts.find(
      (s) => s.staffId === staffId && s.date.toDateString() === date.toDateString()
    );
  };

  const filteredStaff =
    departmentFilter === 'all' ? staff : staff.filter((s) => s.department === departmentFilter);

  const departments = [...new Set(staff.map((s) => s.department))];

  const todayShifts = shifts.filter(
    (s) =>
      s.date.toDateString() === new Date().toDateString() &&
      s.type !== 'vacation' &&
      s.type !== 'sick'
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Program Personal
          </h1>
          <p className="text-muted-foreground mt-1">Gestionează turele și programul angajaților</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Adaugă tură
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total angajați</p>
              <p className="text-xl font-bold">{staff.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">La lucru azi</p>
              <p className="text-xl font-bold">{todayShifts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">De gardă</p>
              <p className="text-xl font-bold">
                {shifts.filter((s) => s.type === 'on_call' && isToday(s.date)).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Coffee className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">În concediu</p>
              <p className="text-xl font-bold">
                {shifts.filter((s) => s.type === 'vacation' && isToday(s.date)).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <h3 className="font-medium">
                  {formatDate(weekDays[0])} - {formatDate(weekDays[6])}
                </h3>
                <p className="text-sm text-muted-foreground">{weekDays[0].getFullYear()}</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Select
                value={departmentFilter}
                onValueChange={(value: string) => setDepartmentFilter(value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Departament" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate departamentele</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() =>
                  setCurrentWeekStart(() => {
                    const today = new Date();
                    const day = today.getDay();
                    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                    return new Date(today.setDate(diff));
                  })
                }
              >
                Azi
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b w-48">Angajat</th>
                  {weekDays.map((day) => (
                    <th
                      key={day.toISOString()}
                      className={cn(
                        'text-center p-2 border-b min-w-[100px]',
                        isToday(day) && 'bg-primary/10'
                      )}
                    >
                      <div className="font-medium">{formatDayName(day)}</div>
                      <div
                        className={cn(
                          'text-sm',
                          isToday(day) ? 'text-primary font-bold' : 'text-muted-foreground'
                        )}
                      >
                        {formatDate(day)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((member) => (
                  <tr key={member.id} className="border-b">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {member.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.role}</p>
                        </div>
                      </div>
                    </td>
                    {weekDays.map((day) => {
                      const shift = getShiftForStaffAndDay(member.id, day);
                      const ShiftIcon = shift ? shiftTypeConfig[shift.type].icon : null;

                      return (
                        <td
                          key={day.toISOString()}
                          className={cn('p-1 text-center', isToday(day) && 'bg-primary/10')}
                        >
                          {shift ? (
                            <div
                              className={cn(
                                'p-2 rounded border text-xs cursor-pointer hover:opacity-80 transition-opacity',
                                shiftTypeConfig[shift.type].color
                              )}
                            >
                              <div className="flex items-center justify-center gap-1 mb-1">
                                {ShiftIcon && <ShiftIcon className="h-3 w-3" />}
                                <span className="font-medium">
                                  {shiftTypeConfig[shift.type].label}
                                </span>
                              </div>
                              {shift.startTime && shift.endTime && (
                                <div className="text-[10px] opacity-80">
                                  {shift.startTime} - {shift.endTime}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="p-2 text-muted-foreground text-xs">-</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4">
        {Object.entries(shiftTypeConfig).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <div key={key} className="flex items-center gap-2">
              <div className={cn('p-1 rounded border', config.color)}>
                <Icon className="h-3 w-3" />
              </div>
              <span className="text-sm text-muted-foreground">{config.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
