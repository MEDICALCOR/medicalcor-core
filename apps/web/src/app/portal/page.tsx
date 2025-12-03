'use client';

import { useState } from 'react';
import {
  User,
  Calendar,
  FileText,
  CreditCard,
  Clock,
  Download,
  Eye,
  ChevronRight,
  Plus,
  Phone,
  Mail,
  MapPin,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface Appointment {
  id: string;
  date: Date;
  time: string;
  doctor: string;
  specialty: string;
  service: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  location: string;
}

interface Document {
  id: string;
  name: string;
  type: 'result' | 'prescription' | 'report' | 'referral';
  date: Date;
  doctor: string;
  size: string;
}

interface Invoice {
  id: string;
  date: Date;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  service: string;
}

// SECURITY: Demo/placeholder data only - no real PII
// In production, this would be loaded from the authenticated patient's session
const patientData = {
  firstName: 'Demo',
  lastName: 'Patient',
  email: 'demo.patient@example.com',
  phone: '000 000 0000',
  dateOfBirth: '01 Jan 1990',
  cnp: '0000000******',
  address: 'Example Street 1, Example City',
  bloodType: 'A+',
  allergies: ['Penicilină', 'Polen'],
  chronicConditions: ['Hipertensiune'],
};

// SECURITY: Demo/placeholder appointment data
const appointments: Appointment[] = [
  {
    id: 'a1',
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    time: '10:00',
    doctor: 'Dr. Demo Internist',
    specialty: 'Medicină internă',
    service: 'Consultație generală',
    status: 'upcoming',
    location: 'Cabinet 3',
  },
  {
    id: 'a2',
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    time: '14:30',
    doctor: 'Dr. Demo Cardiologist',
    specialty: 'Cardiologie',
    service: 'Control periodic',
    status: 'upcoming',
    location: 'Cabinet 5',
  },
  {
    id: 'a3',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    time: '09:00',
    doctor: 'Dr. Demo Family',
    specialty: 'Medicină de familie',
    service: 'Consultație',
    status: 'completed',
    location: 'Cabinet 1',
  },
  {
    id: 'a4',
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    time: '11:00',
    doctor: 'Dr. Demo Internist',
    specialty: 'Medicină internă',
    service: 'Analize laborator',
    status: 'completed',
    location: 'Laborator',
  },
];

// SECURITY: Demo/placeholder document data
const documents: Document[] = [
  {
    id: 'd1',
    name: 'Rezultate analize sânge',
    type: 'result',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Demo Family',
    size: '245 KB',
  },
  {
    id: 'd2',
    name: 'Rețetă medicament',
    type: 'prescription',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Demo Family',
    size: '89 KB',
  },
  {
    id: 'd3',
    name: 'Ecografie abdominală',
    type: 'report',
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Demo Specialist',
    size: '1.2 MB',
  },
  {
    id: 'd4',
    name: 'Trimitere cardiologie',
    type: 'referral',
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Demo Family',
    size: '56 KB',
  },
];

const invoices: Invoice[] = [
  {
    id: 'i1',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    amount: 150,
    status: 'paid',
    service: 'Consultație generală',
  },
  {
    id: 'i2',
    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    amount: 200,
    status: 'paid',
    service: 'Ecografie abdominală',
  },
  {
    id: 'i3',
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    amount: 150,
    status: 'pending',
    service: 'Consultație generală',
  },
];

const documentTypeLabels = {
  result: 'Rezultat',
  prescription: 'Rețetă',
  report: 'Raport',
  referral: 'Trimitere',
};

const documentTypeColors = {
  result: 'bg-blue-100 text-blue-700',
  prescription: 'bg-green-100 text-green-700',
  report: 'bg-purple-100 text-purple-700',
  referral: 'bg-orange-100 text-orange-700',
};

export default function PatientPortalPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const upcomingAppointments = appointments.filter((a) => a.status === 'upcoming');
  const completedAppointments = appointments.filter((a) => a.status === 'completed');

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatFullDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl bg-primary text-primary-foreground">
              {patientData.firstName[0]}
              {patientData.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">Bun venit, {patientData.firstName}!</h1>
            <p className="text-muted-foreground">
              Portal pacient - gestionează-ți programările și documentele
            </p>
          </div>
        </div>
        <Button asChild>
          <a href="/booking">
            <Plus className="h-4 w-4 mr-2" />
            Programare nouă
          </a>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview">Prezentare</TabsTrigger>
          <TabsTrigger value="appointments">Programări</TabsTrigger>
          <TabsTrigger value="documents">Documente</TabsTrigger>
          <TabsTrigger value="billing">Facturi</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Quick Stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Următoarea programare</p>
                  <p className="font-medium">Peste 2 zile</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Documente noi</p>
                  <p className="font-medium">2 documente</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sold de plată</p>
                  <p className="font-medium">150 RON</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vizite totale</p>
                  <p className="font-medium">12 vizite</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Upcoming Appointments */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Programări viitoare
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {upcomingAppointments.map((apt) => (
                      <div key={apt.id} className="flex items-center gap-4 p-4 border rounded-lg">
                        <div className="text-center min-w-[60px]">
                          <div className="text-2xl font-bold text-primary">
                            {apt.date.getDate()}
                          </div>
                          <div className="text-xs text-muted-foreground uppercase">
                            {apt.date.toLocaleDateString('ro-RO', { month: 'short' })}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{apt.service}</h4>
                          <p className="text-sm text-muted-foreground">{apt.doctor}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {apt.time}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {apt.location}
                            </span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          Detalii
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nu ai programări viitoare</p>
                    <Button className="mt-4" asChild>
                      <a href="/booking">Programează acum</a>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Profile Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profilul meu
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{patientData.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{patientData.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{patientData.address}</span>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Grupa sanguină</span>
                    <Badge variant="outline">{patientData.bloodType}</Badge>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Alergii</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {patientData.allergies.map((allergy) => (
                        <Badge key={allergy} variant="destructive" className="text-xs">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Button variant="outline" className="w-full" size="sm">
                  Editează profilul
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Documents */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documente recente
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('documents')}>
                  Vezi toate
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-3">
                {documents.slice(0, 4).map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        documentTypeColors[doc.type]
                      )}
                    >
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{doc.name}</h4>
                      <p className="text-xs text-muted-foreground">{formatDate(doc.date)}</p>
                    </div>
                    <Button variant="ghost" size="icon">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Programări viitoare</CardTitle>
                <Button asChild>
                  <a href="/booking">
                    <Plus className="h-4 w-4 mr-2" />
                    Programare nouă
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingAppointments.length > 0 ? (
                <div className="space-y-4">
                  {upcomingAppointments.map((apt) => (
                    <div key={apt.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{apt.service}</h4>
                          <p className="text-sm text-muted-foreground">
                            {apt.doctor} - {apt.specialty}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatFullDate(apt.date)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {apt.time}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {apt.location}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            Reprogramează
                          </Button>
                          <Button variant="destructive" size="sm">
                            Anulează
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nu ai programări viitoare</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Istoric programări</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {completedAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium">{apt.service}</h4>
                      <p className="text-sm text-muted-foreground">{apt.doctor}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(apt.date)} • {apt.time}
                      </p>
                    </div>
                    <Badge variant="secondary">Finalizat</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Documentele mele</CardTitle>
              <CardDescription>Rezultate analize, rețete și rapoarte medicale</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-lg flex items-center justify-center',
                        documentTypeColors[doc.type]
                      )}
                    >
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{doc.name}</h4>
                      <p className="text-sm text-muted-foreground">{doc.doctor}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>{formatDate(doc.date)}</span>
                        <Badge variant="outline" className="text-xs">
                          {documentTypeLabels[doc.type]}
                        </Badge>
                        <span>{doc.size}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground">Total de plată</div>
                <div className="text-3xl font-bold text-primary">150 RON</div>
                <Button className="mt-4 w-full">Plătește acum</Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground">Plătit anul acesta</div>
                <div className="text-3xl font-bold">350 RON</div>
                <p className="text-xs text-muted-foreground mt-2">Din 3 facturi</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Facturile mele</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium">{inv.service}</h4>
                      <p className="text-sm text-muted-foreground">{formatDate(inv.date)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-medium">{inv.amount} RON</span>
                      <Badge
                        variant={
                          inv.status === 'paid'
                            ? 'secondary'
                            : inv.status === 'pending'
                              ? 'outline'
                              : 'destructive'
                        }
                      >
                        {inv.status === 'paid'
                          ? 'Plătit'
                          : inv.status === 'pending'
                            ? 'În așteptare'
                            : 'Restant'}
                      </Badge>
                      {inv.status !== 'paid' && <Button size="sm">Plătește</Button>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
