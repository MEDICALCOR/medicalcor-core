'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Mail,
  Users,
  Settings,
  MoreVertical,
  Star,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getClinicsAction,
  getClinicStatsAction,
  createClinicAction,
  updateClinicAction,
  deleteClinicAction,
  type Clinic,
  type ClinicStatus,
  type ClinicStats,
} from '@/app/actions';

const statusConfig: Record<ClinicStatus, { label: string; color: string }> = {
  active: { label: 'Activ', color: 'bg-green-100 text-green-700' },
  inactive: { label: 'Inactiv', color: 'bg-gray-100 text-gray-700' },
  suspended: { label: 'Suspendat', color: 'bg-red-100 text-red-700' },
};

export default function ClinicsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [stats, setStats] = useState<ClinicStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      setIsLoading(true);
      const [clinicsData, statsData] = await Promise.all([
        getClinicsAction(),
        getClinicStatsAction(),
      ]);
      setClinics(clinicsData);
      setStats(statsData);
    } catch {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca clinicile',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const resetForm = () => {
    setFormName('');
    setFormAddress('');
    setFormCity('');
    setFormPhone('');
    setFormEmail('');
    setSelectedClinic(null);
  };

  const openEditDialog = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    setFormName(clinic.name);
    setFormAddress(clinic.address ?? '');
    setFormCity(clinic.city ?? '');
    setFormPhone(clinic.phone ?? '');
    setFormEmail(clinic.email ?? '');
    setIsDialogOpen(true);
  };

  const handleCreateOrUpdate = () => {
    if (!formName) {
      toast({
        title: 'Eroare',
        description: 'Numele clinicii este obligatoriu',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      try {
        if (selectedClinic) {
          // Update
          const updated = await updateClinicAction({
            id: selectedClinic.id,
            name: formName,
            address: formAddress || null,
            city: formCity || null,
            phone: formPhone || null,
            email: formEmail || null,
          });
          setClinics((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          toast({
            title: 'Succes',
            description: 'Clinica a fost actualizată',
          });
        } else {
          // Create
          const newClinic = await createClinicAction({
            name: formName,
            country: 'Romania',
            address: formAddress || undefined,
            city: formCity || undefined,
            phone: formPhone || undefined,
            email: formEmail || undefined,
          });
          setClinics((prev) => [newClinic, ...prev]);
          toast({
            title: 'Succes',
            description: 'Clinica a fost creată',
          });
        }
        setIsDialogOpen(false);
        resetForm();
        await loadData();
      } catch (error) {
        toast({
          title: 'Eroare',
          description: error instanceof Error ? error.message : 'Nu s-a putut salva clinica',
          variant: 'destructive',
        });
      }
    });
  };

  const handleToggleStatus = (clinic: Clinic) => {
    startTransition(async () => {
      try {
        const newStatus: ClinicStatus = clinic.status === 'active' ? 'inactive' : 'active';
        await updateClinicAction({ id: clinic.id, status: newStatus });
        setClinics((prev) =>
          prev.map((c) => (c.id === clinic.id ? { ...c, status: newStatus } : c))
        );
        toast({
          title: 'Succes',
          description: `Clinica a fost ${newStatus === 'active' ? 'activată' : 'dezactivată'}`,
        });
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut actualiza statusul',
          variant: 'destructive',
        });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteClinicAction(id);
        setClinics((prev) => prev.filter((c) => c.id !== id));
        toast({
          title: 'Succes',
          description: 'Clinica a fost ștearsă',
        });
        await loadData();
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut șterge clinica',
          variant: 'destructive',
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeClinics = clinics.filter((c) => c.status === 'active');
  const totalUsers = clinics.reduce((sum, c) => sum + c.userCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Administrare Clinici
          </h1>
          <p className="text-muted-foreground mt-1">Gestionează toate locațiile clinicii</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setIsDialogOpen(true);
          }}
          disabled={isPending}
        >
          <Plus className="h-4 w-4 mr-2" />
          Adaugă clinică
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total clinici</p>
                <p className="text-xl font-bold">{stats?.totalClinics ?? clinics.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{stats?.activeClinics ?? activeClinics.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total utilizatori</p>
                <p className="text-xl font-bold">{stats?.totalUsers ?? totalUsers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Star className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Conformitate</p>
                <p className="text-xl font-bold">
                  {clinics.filter((c) => c.hipaaCompliant && c.gdprCompliant).length}/
                  {clinics.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clinici ({clinics.length})</CardTitle>
          <CardDescription>Gestionează locațiile și setările clinicilor</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {clinics.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 col-span-2">
                Nu există clinici înregistrate
              </p>
            ) : (
              clinics.map((clinic) => (
                <Card key={clinic.id} className={cn(clinic.status !== 'active' && 'opacity-60')}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{clinic.name}</h3>
                          <Badge className={cn('text-xs', statusConfig[clinic.status].color)}>
                            {statusConfig[clinic.status].label}
                          </Badge>
                        </div>
                        {(clinic.address ?? clinic.city) && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {[clinic.address, clinic.city].filter(Boolean).join(', ')}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          {clinic.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {clinic.phone}
                            </span>
                          )}
                          {clinic.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {clinic.email}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-3">
                          <span className="text-sm flex items-center gap-1">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            {clinic.userCount} utilizatori
                          </span>
                          <div className="flex items-center gap-2">
                            {clinic.hipaaCompliant && (
                              <Badge variant="outline" className="text-[10px]">
                                HIPAA
                              </Badge>
                            )}
                            {clinic.gdprCompliant && (
                              <Badge variant="outline" className="text-[10px]">
                                GDPR
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={clinic.status === 'active'}
                          onCheckedChange={() => handleToggleStatus(clinic)}
                          disabled={isPending}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(clinic)}>
                              <Settings className="h-4 w-4 mr-2" />
                              Editează
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(clinic.id)}
                              className="text-red-600"
                              disabled={isPending}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Șterge
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Clinic Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedClinic ? 'Editează clinica' : 'Adaugă clinică nouă'}</DialogTitle>
            <DialogDescription>Completează detaliile clinicii</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nume clinică *</Label>
              <Input
                placeholder="ex: MedicalCor Central"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Adresă</Label>
                <Input
                  placeholder="Strada, număr"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Oraș</Label>
                <Input
                  placeholder="ex: București"
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  placeholder="ex: 021 XXX XXXX"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="contact@clinica.ro"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
                disabled={isPending}
              >
                Anulează
              </Button>
              <Button onClick={handleCreateOrUpdate} disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selectedClinic ? 'Salvează' : 'Adaugă clinică'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
