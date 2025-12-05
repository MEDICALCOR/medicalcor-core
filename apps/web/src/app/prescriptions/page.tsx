'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getPrescriptionsAction,
  getPrescriptionsStatsAction,
  duplicatePrescriptionAction,
  type Prescription,
  type PrescriptionsStats,
} from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import {
  Pill,
  Plus,
  Search,
  Printer,
  Send,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  User,
  RefreshCw,
  Loader2,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { cn } from '@/lib/utils';

const statusConfig = {
  active: { label: 'Activă', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  dispensed: { label: 'Eliberată', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  expired: { label: 'Expirată', color: 'bg-gray-100 text-gray-700', icon: Clock },
  cancelled: { label: 'Anulată', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [stats, setStats] = useState<PrescriptionsStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [medications, setMedications] = useState([
    { name: '', dosage: '', frequency: '', duration: '', quantity: 1 },
  ]);
  const { toast } = useToast();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [prescriptionsResult, statsResult] = await Promise.all([
        getPrescriptionsAction(),
        getPrescriptionsStatsAction(),
      ]);

      setPrescriptions(prescriptionsResult.prescriptions);
      setStats(statsResult.stats);
    } catch (_error) {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca rețetele',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicatePrescriptionAction(id);
      if (result.prescription) {
        setPrescriptions((prev) => [result.prescription!, ...prev]);
        toast({ title: 'Succes', description: 'Rețeta a fost duplicată' });
      } else {
        toast({ title: 'Eroare', description: result.error, variant: 'destructive' });
      }
    });
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('ro-RO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const addMedication = () => {
    setMedications([
      ...medications,
      { name: '', dosage: '', frequency: '', duration: '', quantity: 1 },
    ]);
  };

  const filteredPrescriptions = prescriptions.filter((rx) => {
    const matchesSearch =
      searchQuery === '' ||
      rx.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rx.prescriptionNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || rx.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount =
    stats?.activeCount ?? prescriptions.filter((rx) => rx.status === 'active').length;
  const expiringCount =
    stats?.expiringCount ??
    prescriptions.filter((rx) => {
      if (!rx.validUntil) return false;
      const daysUntilExpiry = Math.ceil(
        (new Date(rx.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return rx.status === 'active' && daysUntilExpiry <= 7 && daysUntilExpiry > 0;
    }).length;
  const todayCount =
    stats?.todayCount ??
    prescriptions.filter(
      (rx) => new Date(rx.createdAt).toDateString() === new Date().toDateString()
    ).length;

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
            <Pill className="h-6 w-6 text-primary" />
            Rețete Electronice
          </h1>
          <p className="text-muted-foreground mt-1">Emite și gestionează rețetele medicale</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Rețetă nouă
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Emite rețetă electronică</DialogTitle>
              <DialogDescription>Completează detaliile pentru rețeta medicală</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pacient</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selectează pacient" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="p1">Patient Demo A - ID: P001</SelectItem>
                      <SelectItem value="p2">Patient Demo B - ID: P002</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Diagnostic</Label>
                  <Input placeholder="ex: Hipertensiune arterială" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Medicamente prescrise</Label>
                  <Button variant="outline" size="sm" onClick={addMedication}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adaugă
                  </Button>
                </div>

                {medications.map((med, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Medicament {index + 1}</span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Denumire</Label>
                        <Input placeholder="ex: Amlodipină" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Dozaj</Label>
                        <Input placeholder="ex: 5mg" />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Frecvență</Label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Selectează" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1x">1x/zi</SelectItem>
                            <SelectItem value="2x">2x/zi</SelectItem>
                            <SelectItem value="3x">3x/zi</SelectItem>
                            <SelectItem value="prn">La nevoie</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Durată</Label>
                        <Input placeholder="ex: 30 zile" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cantitate</Label>
                        <Input type="number" placeholder="30" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Instrucțiuni</Label>
                      <Input placeholder="ex: Dimineața, înainte de masă" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Observații</Label>
                <Textarea placeholder="Observații suplimentare..." rows={2} />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  Previzualizare
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Emite rețetă
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Pill className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total rețete</p>
              <p className="text-xl font-bold">{stats?.totalCount ?? prescriptions.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-xl font-bold">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Expiră curând</p>
              <p className="text-xl font-bold">{expiringCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Emise azi</p>
              <p className="text-xl font-bold">{todayCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Rețete recente</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Caută..."
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
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="dispensed">Eliberate</SelectItem>
                  <SelectItem value="expired">Expirate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredPrescriptions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Pill className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nu există rețete</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPrescriptions.map((rx) => {
                const status = rx.status as keyof typeof statusConfig;
                const StatusIcon = statusConfig[status].icon;
                const daysUntilExpiry = rx.validUntil
                  ? Math.ceil(
                      (new Date(rx.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                    )
                  : 999;
                const isExpiringSoon =
                  rx.status === 'active' && daysUntilExpiry <= 7 && daysUntilExpiry > 0;

                return (
                  <div key={rx.id} className="border rounded-lg">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            statusConfig[status].color.split(' ')[0]
                          )}
                        >
                          <StatusIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-medium">{rx.prescriptionNumber}</h4>
                            <Badge className={cn('text-xs', statusConfig[status].color)}>
                              {statusConfig[status].label}
                            </Badge>
                            {isExpiringSoon && (
                              <Badge
                                variant="outline"
                                className="text-xs text-yellow-600 border-yellow-300"
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Expiră în {daysUntilExpiry} zile
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <User className="h-3 w-3" />
                            {rx.patientName} • {rx.doctorName}
                          </p>
                          {rx.diagnosis && (
                            <p className="text-xs text-muted-foreground mt-1">Dg: {rx.diagnosis}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right text-sm">
                          <p>Emisă: {formatDate(rx.createdAt)}</p>
                          {rx.validUntil && (
                            <p className="text-muted-foreground">
                              Valabilă: {formatDate(rx.validUntil)}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicate(rx.id)}
                            disabled={isPending}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {rx.status === 'active' && (
                            <Button variant="ghost" size="icon">
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-4 border-t pt-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        Medicamente ({rx.medications.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {rx.medications.map((med, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            <Pill className="h-3 w-3 mr-1" />
                            {med.name} {med.dosage} - {med.frequency}
                          </Badge>
                        ))}
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
