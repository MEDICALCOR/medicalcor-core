'use client';

import { useState } from 'react';
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

interface Clinic {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  isMain: boolean;
  isActive: boolean;
  staffCount: number;
  patientsCount: number;
  appointmentsToday: number;
  rating: number;
}

// SECURITY: Demo/placeholder data only - no real PII or addresses
// These are fictional example clinics for UI demonstration purposes
const clinics: Clinic[] = [
  {
    id: 'c1',
    name: 'Demo Clinic Central',
    address: 'Example Street 100',
    city: 'Example City',
    phone: '000 000 0001',
    email: 'central@example.com',
    isMain: true,
    isActive: true,
    staffCount: 12,
    patientsCount: 2450,
    appointmentsToday: 24,
    rating: 4.9,
  },
  {
    id: 'c2',
    name: 'Demo Clinic North',
    address: 'Example Boulevard 45',
    city: 'Example City',
    phone: '000 000 0002',
    email: 'north@example.com',
    isMain: false,
    isActive: true,
    staffCount: 8,
    patientsCount: 1200,
    appointmentsToday: 16,
    rating: 4.7,
  },
  {
    id: 'c3',
    name: 'Demo Clinic Branch',
    address: 'Sample Road 28',
    city: 'Sample Town',
    phone: '000 000 0003',
    email: 'branch@example.com',
    isMain: false,
    isActive: true,
    staffCount: 6,
    patientsCount: 890,
    appointmentsToday: 12,
    rating: 4.8,
  },
  {
    id: 'c4',
    name: 'Demo Clinic Inactive',
    address: 'Test Square 10',
    city: 'Test City',
    phone: '000 000 0004',
    email: 'inactive@example.com',
    isMain: false,
    isActive: false,
    staffCount: 0,
    patientsCount: 0,
    appointmentsToday: 0,
    rating: 0,
  },
];

export default function ClinicsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const activeClinicCount = clinics.filter((c) => c.isActive).length;
  const totalStaff = clinics.reduce((sum, c) => sum + c.staffCount, 0);
  const totalPatients = clinics.reduce((sum, c) => sum + c.patientsCount, 0);
  const totalAppointmentsToday = clinics.reduce((sum, c) => sum + c.appointmentsToday, 0);

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
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                <Label>Nume clinică</Label>
                <Input placeholder="ex: MedicalCor Sud" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Adresă</Label>
                  <Input placeholder="Strada și număr" />
                </div>
                <div className="space-y-2">
                  <Label>Oraș</Label>
                  <Input placeholder="ex: București" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input placeholder="ex: 021 123 4567" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="ex: sud@medicalcor.ro" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Adaugă clinică</Button>
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
              <p className="text-xl font-bold">{activeClinicCount}</p>
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
              <p className="text-xl font-bold">{totalStaff}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total pacienți</p>
              <p className="text-xl font-bold">{totalPatients.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Programări azi</p>
              <p className="text-xl font-bold">{totalAppointmentsToday}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {clinics.map((clinic) => (
          <Card key={clinic.id} className={cn(!clinic.isActive && 'opacity-60')}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-lg flex items-center justify-center',
                      clinic.isMain ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{clinic.name}</CardTitle>
                      {clinic.isMain && <Badge className="bg-primary">Principal</Badge>}
                      {!clinic.isActive && <Badge variant="secondary">Inactiv</Badge>}
                    </div>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {clinic.address}, {clinic.city}
                    </CardDescription>
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {clinic.phone}
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {clinic.email}
                  </span>
                </div>

                {clinic.isActive && (
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <p className="text-xl font-bold">{clinic.staffCount}</p>
                      <p className="text-xs text-muted-foreground">Angajați</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold">{clinic.patientsCount}</p>
                      <p className="text-xs text-muted-foreground">Pacienți</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold">{clinic.appointmentsToday}</p>
                      <p className="text-xs text-muted-foreground">Azi</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold flex items-center justify-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        {clinic.rating}
                      </p>
                      <p className="text-xs text-muted-foreground">Rating</p>
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
    </div>
  );
}
