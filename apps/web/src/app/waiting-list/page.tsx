'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getWaitingListAction,
  getWaitingListStatsAction,
  updateWaitingPatientAction,
  removeFromWaitingListAction,
  type WaitingPatient,
  type WaitingListStats,
} from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import {
  Clock,
  Plus,
  Phone,
  Mail,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreVertical,
  Search,
  Loader2,
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

const priorityConfig = {
  low: { label: 'Scăzut', color: 'bg-gray-100 text-gray-700' },
  normal: { label: 'Normal', color: 'bg-gray-100 text-gray-700' },
  high: { label: 'Ridicat', color: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' },
};

const statusConfig = {
  waiting: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  contacted: { label: 'Contactat', color: 'bg-blue-100 text-blue-700', icon: Phone },
  scheduled: { label: 'Programat', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelled: { label: 'Anulat', color: 'bg-gray-100 text-gray-700', icon: XCircle },
  expired: { label: 'Expirat', color: 'bg-gray-100 text-gray-700', icon: XCircle },
};

export default function WaitingListPage() {
  const [waitingList, setWaitingList] = useState<WaitingPatient[]>([]);
  const [stats, setStats] = useState<WaitingListStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [listResult, statsResult] = await Promise.all([
        getWaitingListAction(),
        getWaitingListStatsAction(),
      ]);

      setWaitingList(listResult.patients);
      if (statsResult.stats) {
        setStats(statsResult.stats);
      }
    } catch (_error) {
      toast({
        title: 'Eroare',
        description: 'Nu s-a putut încărca lista de așteptare',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleUpdateStatus(id: string, status: WaitingPatient['status']) {
    startTransition(async () => {
      const result = await updateWaitingPatientAction({ id, status });
      if (result.patient) {
        const updatedPatient = result.patient;
        setWaitingList((prev) => prev.map((p) => (p.id === id ? updatedPatient : p)));
        toast({ title: 'Succes', description: 'Statusul a fost actualizat' });
      } else {
        toast({ title: 'Eroare', description: result.error, variant: 'destructive' });
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const result = await removeFromWaitingListAction(id);
      if (result.success) {
        setWaitingList((prev) => prev.filter((p) => p.id !== id));
        toast({ title: 'Succes', description: 'Pacientul a fost eliminat din listă' });
      } else {
        toast({ title: 'Eroare', description: result.error, variant: 'destructive' });
      }
    });
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
  };

  const getDaysWaiting = (date: Date): number => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
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
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Serviciu solicitat</Label>
                <Input placeholder="ex: Consultație cardiologie" />
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
              <p className="text-xl font-bold">{stats?.totalWaiting ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Prioritate ridicată</p>
              <p className="text-xl font-bold">{stats?.highPriority ?? 0}</p>
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
              <p className="text-xl font-bold">{stats?.avgWaitDays ?? 0} zile</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contactați azi</p>
              <p className="text-xl font-bold">{stats?.contactedToday ?? 0}</p>
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
          {sortedList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nu există pacienți în lista de așteptare</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedList.map((patient, index) => {
                const status = patient.status;
                const StatusIcon = statusConfig[status].icon;
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
                          <Badge className={cn('text-xs', statusConfig[status].color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig[status].label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{patient.requestedService}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>
                            {patient.preferredDays.length > 0
                              ? patient.preferredDays.join(', ')
                              : 'Orice zi'}
                          </span>
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
                            <Button variant="ghost" size="icon" disabled={isPending}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleUpdateStatus(patient.id, 'contacted')}
                            >
                              <Phone className="h-4 w-4 mr-2" />
                              Marchează contactat
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleUpdateStatus(patient.id, 'scheduled')}
                            >
                              <Calendar className="h-4 w-4 mr-2" />
                              Programează
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleRemove(patient.id)}
                            >
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
