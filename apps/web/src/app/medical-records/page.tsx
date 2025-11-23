'use client';

import { useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  Calendar,
  Pill,
  Stethoscope,
  Activity,
  Heart,
  Eye,
  Download,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  type: 'consultation' | 'diagnosis' | 'procedure' | 'lab_result' | 'prescription';
  date: Date;
  doctor: string;
  specialty: string;
  summary: string;
  details: string;
  attachments: number;
}

interface Diagnosis {
  id: string;
  code: string;
  name: string;
  date: Date;
  status: 'active' | 'resolved' | 'chronic';
  notes: string;
}

interface Prescription {
  id: string;
  medication: string;
  dosage: string;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  prescribedBy: string;
  status: 'active' | 'completed' | 'cancelled';
}

const records: MedicalRecord[] = [
  {
    id: 'r1',
    patientId: 'p1',
    patientName: 'Ion Popescu',
    type: 'consultation',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Maria Ionescu',
    specialty: 'Medicină internă',
    summary: 'Consultație de rutină',
    details: 'Pacient în stare generală bună...',
    attachments: 2,
  },
  {
    id: 'r2',
    patientId: 'p1',
    patientName: 'Ion Popescu',
    type: 'lab_result',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Andrei Popa',
    specialty: 'Laborator',
    summary: 'Analize sânge complete',
    details: 'Hemoleucogramă, biochimie...',
    attachments: 1,
  },
  {
    id: 'r3',
    patientId: 'p2',
    patientName: 'Maria Stan',
    type: 'diagnosis',
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Elena Dumitrescu',
    specialty: 'Cardiologie',
    summary: 'Hipertensiune arterială',
    details: 'Diagnostic confirmat...',
    attachments: 0,
  },
  {
    id: 'r4',
    patientId: 'p2',
    patientName: 'Maria Stan',
    type: 'prescription',
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Elena Dumitrescu',
    specialty: 'Cardiologie',
    summary: 'Tratament hipertensiune',
    details: 'Amlodipină 5mg...',
    attachments: 0,
  },
  {
    id: 'r5',
    patientId: 'p3',
    patientName: 'Andrei Georgescu',
    type: 'procedure',
    date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    doctor: 'Dr. Mihai Radu',
    specialty: 'Chirurgie',
    summary: 'Ecografie abdominală',
    details: 'Procedură efectuată fără complicații...',
    attachments: 3,
  },
];

const diagnoses: Diagnosis[] = [
  {
    id: 'd1',
    code: 'I10',
    name: 'Hipertensiune esențială',
    date: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    status: 'chronic',
    notes: 'Sub tratament medicamentos',
  },
  {
    id: 'd2',
    code: 'E11',
    name: 'Diabet zaharat tip 2',
    date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    status: 'chronic',
    notes: 'Control glicemic bun',
  },
  {
    id: 'd3',
    code: 'J06.9',
    name: 'Infecție acută a tractului respirator',
    date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    status: 'resolved',
    notes: 'Vindecat complet',
  },
  {
    id: 'd4',
    code: 'M54.5',
    name: 'Lombalgie',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    status: 'active',
    notes: 'În tratament fizioterapeutic',
  },
];

const prescriptions: Prescription[] = [
  {
    id: 'px1',
    medication: 'Amlodipină',
    dosage: '5mg',
    frequency: '1x/zi',
    startDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    endDate: null,
    prescribedBy: 'Dr. Elena Dumitrescu',
    status: 'active',
  },
  {
    id: 'px2',
    medication: 'Metformin',
    dosage: '850mg',
    frequency: '2x/zi',
    startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    endDate: null,
    prescribedBy: 'Dr. Maria Ionescu',
    status: 'active',
  },
  {
    id: 'px3',
    medication: 'Paracetamol',
    dosage: '500mg',
    frequency: 'la nevoie',
    startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    prescribedBy: 'Dr. Andrei Popa',
    status: 'completed',
  },
  {
    id: 'px4',
    medication: 'Ibuprofen',
    dosage: '400mg',
    frequency: '2x/zi',
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    prescribedBy: 'Dr. Mihai Radu',
    status: 'active',
  },
];

const typeConfig = {
  consultation: { label: 'Consultație', color: 'bg-blue-100 text-blue-700', icon: Stethoscope },
  diagnosis: { label: 'Diagnostic', color: 'bg-purple-100 text-purple-700', icon: Activity },
  procedure: { label: 'Procedură', color: 'bg-green-100 text-green-700', icon: Heart },
  lab_result: { label: 'Analize', color: 'bg-yellow-100 text-yellow-700', icon: FileText },
  prescription: { label: 'Rețetă', color: 'bg-pink-100 text-pink-700', icon: Pill },
};

const statusColors = {
  active: 'bg-green-100 text-green-700',
  resolved: 'bg-gray-100 text-gray-700',
  chronic: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function MedicalRecordsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const filteredRecords = records.filter((record) => {
    const matchesSearch =
      searchQuery === '' ||
      record.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.summary.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || record.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const activePrescriptions = prescriptions.filter((p) => p.status === 'active').length;
  const chronicConditions = diagnoses.filter((d) => d.status === 'chronic').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Dosare Medicale
          </h1>
          <p className="text-muted-foreground mt-1">Istoric medical, diagnostice și tratamente</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Adaugă înregistrare
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total înregistrări</p>
              <p className="text-xl font-bold">{records.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Activity className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Diagnostice active</p>
              <p className="text-xl font-bold">
                {diagnoses.filter((d) => d.status !== 'resolved').length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Condiții cronice</p>
              <p className="text-xl font-bold">{chronicConditions}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Pill className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tratamente active</p>
              <p className="text-xl font-bold">{activePrescriptions}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="records" className="space-y-4">
        <TabsList>
          <TabsTrigger value="records">Istoric</TabsTrigger>
          <TabsTrigger value="diagnoses">Diagnostice</TabsTrigger>
          <TabsTrigger value="prescriptions">Tratamente</TabsTrigger>
        </TabsList>

        <TabsContent value="records">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle>Istoric medical</CardTitle>
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
                    value={typeFilter}
                    onValueChange={(value: string) => setTypeFilter(value)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Tip" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toate</SelectItem>
                      <SelectItem value="consultation">Consultații</SelectItem>
                      <SelectItem value="diagnosis">Diagnostice</SelectItem>
                      <SelectItem value="procedure">Proceduri</SelectItem>
                      <SelectItem value="lab_result">Analize</SelectItem>
                      <SelectItem value="prescription">Rețete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredRecords.map((record) => {
                  const TypeIcon = typeConfig[record.type].icon;
                  return (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            typeConfig[record.type].color.split(' ')[0]
                          )}
                        >
                          <TypeIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{record.summary}</h4>
                            <Badge className={cn('text-xs', typeConfig[record.type].color)}>
                              {typeConfig[record.type].label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {record.patientName} • {record.doctor} • {record.specialty}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(record.date)}
                          </p>
                          {record.attachments > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {record.attachments} atașamente
                            </p>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagnoses">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Diagnostice</CardTitle>
                  <CardDescription>Lista diagnosticelor pacientului</CardDescription>
                </div>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adaugă diagnostic
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {diagnoses.map((diagnosis) => (
                  <div
                    key={diagnosis.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Activity className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{diagnosis.name}</h4>
                          <Badge variant="outline" className="font-mono text-xs">
                            {diagnosis.code}
                          </Badge>
                          <Badge className={cn('text-xs', statusColors[diagnosis.status])}>
                            {diagnosis.status === 'active'
                              ? 'Activ'
                              : diagnosis.status === 'chronic'
                                ? 'Cronic'
                                : 'Rezolvat'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{diagnosis.notes}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{formatDate(diagnosis.date)}</p>
                      <Button variant="ghost" size="sm" className="mt-1">
                        <Eye className="h-4 w-4 mr-1" />
                        Detalii
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prescriptions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Tratamente & Prescripții</CardTitle>
                  <CardDescription>Medicamentele prescrise pacientului</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Prescripție nouă
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {prescriptions.map((prescription) => (
                  <div
                    key={prescription.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center',
                          prescription.status === 'active' ? 'bg-green-100' : 'bg-gray-100'
                        )}
                      >
                        <Pill
                          className={cn(
                            'h-5 w-5',
                            prescription.status === 'active' ? 'text-green-600' : 'text-gray-600'
                          )}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{prescription.medication}</h4>
                          <span className="text-sm text-muted-foreground">
                            {prescription.dosage}
                          </span>
                          <Badge className={cn('text-xs', statusColors[prescription.status])}>
                            {prescription.status === 'active'
                              ? 'Activ'
                              : prescription.status === 'completed'
                                ? 'Finalizat'
                                : 'Anulat'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {prescription.frequency} • Prescris de {prescription.prescribedBy}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">
                        {formatDate(prescription.startDate)}
                        {prescription.endDate && ` - ${formatDate(prescription.endDate)}`}
                      </p>
                      <Button variant="ghost" size="sm" className="mt-1">
                        <Eye className="h-4 w-4 mr-1" />
                        Detalii
                      </Button>
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
