'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Mail,
  Users,
  Calendar,
  Settings,
  MoreVertical,
  Star,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getClinicsAction,
  getClinicStatsAction,
  createClinicAction,
  updateClinicAction,
  type Clinic,
  type ClinicStats,
} from '@/app/actions';

export default function ClinicsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [stats, setStats] = useState<ClinicStats>({
    totalClinics: 0,
    activeClinics: 0,
    totalUsers: 0,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    loadData();
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
    } catch (error) {
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
  };

  const handleCreateClinic = async () => {
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
        const newClinic = await createClinicAction({
          name: formName,
          address: formAddress || undefined,
          city: formCity || undefined,
          phone: formPhone || undefined,
          email: formEmail || undefined,
        });
        setClinics((prev) => [newClinic, ...prev]);
        setIsDialogOpen(false);
        resetForm();
        await loadData();
        toast({
          title: 'Succes',
          description: 'Clinica a fost adăugată',
        });
      } catch (error) {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut adăuga clinica',
          variant: 'destructive',
        });
      }
    });
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    startTransition(async () => {
      try {
        const updated = await updateClinicAction({ id, status: newStatus as 'active' | 'inactive' });
        setClinics((prev) => prev.map((c) => (c.id === id ? updated : c)));
        toast({
          title: 'Succes',
          description: `Clinica a fost ${newStatus === 'active' ? 'activată' : 'dezactivată'}`,
        });
      } catch (error) {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut actualiza starea clinicii',
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
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Adaugă clinică
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adaugă clinică nouă</DialogTitle>
              <DialogDescription>Completează detaliile noii locații</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nume clinică *</Label>
                <Input
                  placeholder="ex: MedicalCor Sud"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Adresă</Label>
                  <Input
                    placeholder="Strada și număr"
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
                    placeholder="ex: 021 123 4567"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="ex: contact@clinica.ro"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button onClick={handleCreateClinic} disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Adaugă clinică
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
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clinici active</p>
              <p className="text-xl font-bold">{stats.activeClinics}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total angajați</p>
              <p className="text-xl font-bold">{stats.totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total clinici</p>
              <p className="text-xl font-bold">{stats.totalClinics}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">HIPAA Compliant</p>
              <p className="text-xl font-bold">{clinics.filter((c) => c.hipaaCompliant).length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {clinics.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nu există clinici</p>
              <p className="text-sm">Adaugă prima clinică pentru a începe</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {clinics.map((clinic) => (
            <Card key={clinic.id} className={cn(clinic.status !== 'active' && 'opacity-60')}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-lg flex items-center justify-center',
                        clinic.status === 'active' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}
                    >
                      <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{clinic.name}</CardTitle>
                        {clinic.status !== 'active' && <Badge variant="secondary">Inactiv</Badge>}
                        {clinic.hipaaCompliant && (
                          <Badge className="bg-green-100 text-green-700">HIPAA</Badge>
                        )}
                        {clinic.gdprCompliant && (
                          <Badge className="bg-blue-100 text-blue-700">GDPR</Badge>
                        )}
                      </div>
                      {clinic.address && (
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {clinic.address}{clinic.city && `, ${clinic.city}`}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Settings className="h-4 w-4 mr-2" />
                        Setări
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Users className="h-4 w-4 mr-2" />
                        Gestionează echipa
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Calendar className="h-4 w-4 mr-2" />
                        Vezi programări
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleStatus(clinic.id, clinic.status)}
                        disabled={isPending}
                      >
                        {clinic.status === 'active' ? 'Dezactivează' : 'Activează'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
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

                  {clinic.status === 'active' && (
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                      <div className="text-center">
                        <p className="text-xl font-bold">{clinic.userCount}</p>
                        <p className="text-xs text-muted-foreground">Angajați</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold">{clinic.country}</p>
                        <p className="text-xs text-muted-foreground">Țară</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold flex items-center justify-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          {clinic.hipaaCompliant && clinic.gdprCompliant ? '5.0' : '4.5'}
                        </p>
                        <p className="text-xs text-muted-foreground">Compliance</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Settings className="h-4 w-4 mr-2" />
                      Configurare
                    </Button>
                    <Button size="sm" className="flex-1">
                      <Calendar className="h-4 w-4 mr-2" />
                      Programări
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
