'use client';

import { useState } from 'react';
import {
  Clock,
  Plus,
  Phone,
  Mail,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface WaitingPatient {
  id: string;
  patientId: string;
  patientName: string;
  phone: string;
  email: string;
  requestedService: string;
  preferredDoctor?: string;
  preferredDays: string[];
  preferredTime: 'morning' | 'afternoon' | 'any';
  priority: 'normal' | 'high' | 'urgent';
  addedAt: Date;
  notes?: string;
  status: 'waiting' | 'contacted' | 'scheduled' | 'cancelled';
}

const waitingList: WaitingPatient[] = [
  {
    id: 'w1',
    patientId: 'p1',
    patientName: 'Ion Popescu',
    phone: '0721 123 456',
    email: 'ion@email.ro',
    requestedService: 'Consultație cardiologie',
    preferredDoctor: 'Dr. Elena Dumitrescu',
    preferredDays: ['Luni', 'Miercuri'],
    preferredTime: 'morning',
    priority: 'high',
    addedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    status: 'waiting',
  },
  {
    id: 'w2',
    patientId: 'p2',
    patientName: 'Maria Stan',
    phone: '0722 234 567',
    email: 'maria@email.ro',
    requestedService: 'Ecografie abdominală',
    preferredDays: ['Marți', 'Joi'],
    preferredTime: 'afternoon',
    priority: 'normal',
    addedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    status: 'contacted',
  },
  {
    id: 'w3',
    patientId: 'p3',
    patientName: 'Andrei Georgescu',
    phone: '0723 345 678',
    email: 'andrei@email.ro',
    requestedService: 'Consultație ortopedică',
    preferredDoctor: 'Dr. Mihai Radu',
    preferredDays: ['Vineri'],
    preferredTime: 'any',
    priority: 'urgent',
    addedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    notes: 'Dureri acute',
    status: 'waiting',
  },
  {
    id: 'w4',
    patientId: 'p4',
    patientName: 'Elena Dumitrescu',
    phone: '0724 456 789',
    email: 'elena@email.ro',
    requestedService: 'Analize laborator',
    preferredDays: ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri'],
    preferredTime: 'morning',
    priority: 'normal',
    addedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    status: 'scheduled',
  },
  {
    id: 'w5',
    patientId: 'p5',
    patientName: 'Alexandru Stan',
    phone: '0725 567 890',
    email: 'alex@email.ro',
    requestedService: 'Consultație dermatologie',
    preferredDays: ['Miercuri'],
    preferredTime: 'afternoon',
    priority: 'normal',
    addedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    status: 'waiting',
  },
];

const priorityConfig = {
  normal: { label: 'Normal', color: 'bg-gray-100 text-gray-700' },
  high: { label: 'Ridicat', color: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' },
};

const statusConfig = {
  waiting: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  contacted: { label: 'Contactat', color: 'bg-blue-100 text-blue-700', icon: Phone },
  scheduled: { label: 'Programat', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelled: { label: 'Anulat', color: 'bg-gray-100 text-gray-700', icon: XCircle },
};

const timeLabels = {
  morning: 'Dimineața (09:00-13:00)',
  afternoon: 'După-amiaza (13:00-18:00)',
  any: 'Orice oră',
};

export default function WaitingListPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  };

  const getDaysWaiting = (date: Date): number => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const filteredList = waitingList.filter((patient) => {
    const matchesSearch =
      searchQuery === '' ||
      patient.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.requestedService.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || patient.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sortedList = [...filteredList].sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, normal: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.addedAt.getTime() - b.addedAt.getTime();
  });

  const waitingCount = waitingList.filter((p) => p.status === 'waiting').length;
  const urgentCount = waitingList.filter(
    (p) => p.priority === 'urgent' && p.status === 'waiting'
  ).length;
  const avgWaitDays = Math.round(
    waitingList
      .filter((p) => p.status === 'waiting')
      .reduce((sum, p) => sum + getDaysWaiting(p.addedAt), 0) / waitingCount || 0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Listă de Așteptare
          </h1>
          <p className="text-muted-foreground mt-1">Pacienți care așteaptă programări</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Adaugă în listă
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adaugă pacient în lista de așteptare</DialogTitle>
              <DialogDescription>Completează detaliile cererii de programare</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Pacient</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează pacient" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p1">Ion Popescu</SelectItem>
                    <SelectItem value="p2">Maria Stan</SelectItem>
                    <SelectItem value="p3">Andrei Georgescu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Serviciu solicitat</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează serviciul" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consult">Consultație</SelectItem>
                    <SelectItem value="echo">Ecografie</SelectItem>
                    <SelectItem value="lab">Analize laborator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioritate</Label>
                <Select defaultValue="normal">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Ridicat</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preferință oră</Label>
                <Select defaultValue="any">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Dimineața</SelectItem>
                    <SelectItem value="afternoon">După-amiaza</SelectItem>
                    <SelectItem value="any">Orice oră</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Adaugă</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">În așteptare</p>
              <p className="text-xl font-bold">{waitingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Urgente</p>
              <p className="text-xl font-bold">{urgentCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Așteptare medie</p>
              <p className="text-xl font-bold">{avgWaitDays} zile</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Programați azi</p>
              <p className="text-xl font-bold">
                {waitingList.filter((p) => p.status === 'scheduled').length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Lista de așteptare</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Caută pacient..."
                  className="pl-9 w-[180px]"
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(e.target.value)
                  }
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value: string) => setStatusFilter(value)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate</SelectItem>
                  <SelectItem value="waiting">În așteptare</SelectItem>
                  <SelectItem value="contacted">Contactat</SelectItem>
                  <SelectItem value="scheduled">Programat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedList.map((patient, index) => {
              const StatusIcon = statusConfig[patient.status].icon;
              const daysWaiting = getDaysWaiting(patient.addedAt);

              return (
                <div
                  key={patient.id}
                  className={cn(
                    'flex items-center justify-between p-4 border rounded-lg',
                    patient.priority === 'urgent' && 'border-red-200 bg-red-50'
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center text-muted-foreground">
                      <span className="text-lg font-bold">#{index + 1}</span>
                    </div>
                    <Avatar>
                      <AvatarFallback>
                        {patient.patientName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{patient.patientName}</h4>
                        <Badge className={cn('text-xs', priorityConfig[patient.priority].color)}>
                          {priorityConfig[patient.priority].label}
                        </Badge>
                        <Badge className={cn('text-xs', statusConfig[patient.status].color)}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig[patient.status].label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{patient.requestedService}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{patient.preferredDays.join(', ')}</span>
                        <span>•</span>
                        <span>{timeLabels[patient.preferredTime]}</span>
                        {patient.preferredDoctor && (
                          <>
                            <span>•</span>
                            <span>{patient.preferredDoctor}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm">
                        <span
                          className={cn('font-medium', daysWaiting > 5 ? 'text-orange-600' : '')}
                        >
                          {daysWaiting} zile
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        de la {formatDate(patient.addedAt)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon">
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Mail className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Calendar className="h-4 w-4 mr-2" />
                            Programează
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <ArrowUp className="h-4 w-4 mr-2" />
                            Mărește prioritatea
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <ArrowDown className="h-4 w-4 mr-2" />
                            Scade prioritatea
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600">
                            <XCircle className="h-4 w-4 mr-2" />
                            Elimină din listă
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
