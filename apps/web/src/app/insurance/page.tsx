'use client';

import { useState } from 'react';
import {
  Shield,
  Plus,
  Search,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Download,
  Eye,
  Send,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface InsuranceClaim {
  id: string;
  claimNumber: string;
  patientId: string;
  patientName: string;
  insuranceProvider: string;
  policyNumber: string;
  serviceDate: Date;
  submittedDate: Date;
  amount: number;
  approvedAmount?: number;
  status: 'draft' | 'submitted' | 'pending' | 'approved' | 'rejected' | 'paid';
  services: string[];
  notes?: string;
}

interface InsuranceProvider {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  activePatients: number;
  avgProcessingDays: number;
}

const claims: InsuranceClaim[] = [
  {
    id: 'c1',
    claimNumber: 'CLM-2024-001',
    patientId: 'p1',
    patientName: 'Ion Popescu',
    insuranceProvider: 'CNAS',
    policyNumber: 'POL-123456',
    serviceDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    submittedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    amount: 350,
    status: 'pending',
    services: ['Consultație', 'Ecografie'],
  },
  {
    id: 'c2',
    claimNumber: 'CLM-2024-002',
    patientId: 'p2',
    patientName: 'Maria Stan',
    insuranceProvider: 'Allianz',
    policyNumber: 'ALZ-789012',
    serviceDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    submittedDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    amount: 500,
    approvedAmount: 450,
    status: 'approved',
    services: ['Analize laborator', 'Consultație'],
  },
  {
    id: 'c3',
    claimNumber: 'CLM-2024-003',
    patientId: 'p3',
    patientName: 'Andrei Georgescu',
    insuranceProvider: 'Generali',
    policyNumber: 'GEN-345678',
    serviceDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    submittedDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    amount: 280,
    approvedAmount: 280,
    status: 'paid',
    services: ['Consultație cardiologie'],
  },
  {
    id: 'c4',
    claimNumber: 'CLM-2024-004',
    patientId: 'p4',
    patientName: 'Elena Dumitrescu',
    insuranceProvider: 'CNAS',
    policyNumber: 'POL-654321',
    serviceDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    submittedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    amount: 150,
    status: 'submitted',
    services: ['Consultație generală'],
  },
  {
    id: 'c5',
    claimNumber: 'CLM-2024-005',
    patientId: 'p5',
    patientName: 'Alexandru Stan',
    insuranceProvider: 'Allianz',
    policyNumber: 'ALZ-111222',
    serviceDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    submittedDate: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
    amount: 200,
    status: 'rejected',
    services: ['Procedură estetică'],
    notes: 'Serviciu neacoperit de poliță',
  },
];

const providers: InsuranceProvider[] = [
  {
    id: 'ins1',
    name: 'CNAS',
    code: 'CNAS',
    contactEmail: 'decontari@cnas.ro',
    activePatients: 1250,
    avgProcessingDays: 14,
  },
  {
    id: 'ins2',
    name: 'Allianz',
    code: 'ALZ',
    contactEmail: 'claims@allianz.ro',
    activePatients: 320,
    avgProcessingDays: 7,
  },
  {
    id: 'ins3',
    name: 'Generali',
    code: 'GEN',
    contactEmail: 'medical@generali.ro',
    activePatients: 180,
    avgProcessingDays: 10,
  },
  {
    id: 'ins4',
    name: 'Signal Iduna',
    code: 'SIG',
    contactEmail: 'sanatate@signal-iduna.ro',
    activePatients: 95,
    avgProcessingDays: 5,
  },
];

const statusConfig = {
  draft: { label: 'Ciornă', color: 'bg-gray-100 text-gray-700', icon: FileText },
  submitted: { label: 'Trimis', color: 'bg-blue-100 text-blue-700', icon: Send },
  pending: { label: 'În procesare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: 'Aprobat', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { label: 'Respins', color: 'bg-red-100 text-red-700', icon: XCircle },
  paid: { label: 'Plătit', color: 'bg-purple-100 text-purple-700', icon: CheckCircle },
};

export default function InsurancePage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const filteredClaims = claims.filter((claim) => {
    const matchesSearch =
      searchQuery === '' ||
      claim.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      claim.claimNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || claim.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingAmount = claims
    .filter((c) => c.status === 'pending' || c.status === 'submitted')
    .reduce((sum, c) => sum + c.amount, 0);
  const approvedAmount = claims
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + (c.approvedAmount ?? 0), 0);
  const paidAmount = claims
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + (c.approvedAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Asigurări & Decontări
          </h1>
          <p className="text-muted-foreground mt-1">Gestionează cererile de decontare</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Cerere nouă
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Cerere de decontare nouă</DialogTitle>
              <DialogDescription>
                Completează detaliile pentru decontarea serviciilor
              </DialogDescription>
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
                      <SelectItem value="p1">Ion Popescu</SelectItem>
                      <SelectItem value="p2">Maria Stan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Asigurator</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selectează asigurator" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Număr poliță</Label>
                  <Input placeholder="ex: POL-123456" />
                </div>
                <div className="space-y-2">
                  <Label>Data serviciului</Label>
                  <Input type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Servicii efectuate</Label>
                <Textarea placeholder="Descrieți serviciile prestate..." rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Sumă solicitată (RON)</Label>
                <Input type="number" placeholder="0.00" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button variant="outline">Salvează ciornă</Button>
                <Button onClick={() => setIsDialogOpen(false)}>Trimite cerere</Button>
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
              <p className="text-sm text-muted-foreground">În procesare</p>
              <p className="text-xl font-bold">{pendingAmount.toLocaleString()} RON</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aprobate</p>
              <p className="text-xl font-bold">{approvedAmount.toLocaleString()} RON</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Încasate</p>
              <p className="text-xl font-bold">{paidAmount.toLocaleString()} RON</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total cereri</p>
              <p className="text-xl font-bold">{claims.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="claims" className="space-y-4">
        <TabsList>
          <TabsTrigger value="claims">Cereri decontare</TabsTrigger>
          <TabsTrigger value="providers">Asigurători</TabsTrigger>
        </TabsList>

        <TabsContent value="claims">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle>Cereri de decontare</CardTitle>
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
                      <SelectItem value="submitted">Trimise</SelectItem>
                      <SelectItem value="pending">În procesare</SelectItem>
                      <SelectItem value="approved">Aprobate</SelectItem>
                      <SelectItem value="rejected">Respinse</SelectItem>
                      <SelectItem value="paid">Plătite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredClaims.map((claim) => {
                  const StatusIcon = statusConfig[claim.status].icon;
                  return (
                    <div
                      key={claim.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            statusConfig[claim.status].color.split(' ')[0]
                          )}
                        >
                          <StatusIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{claim.claimNumber}</h4>
                            <Badge className={cn('text-xs', statusConfig[claim.status].color)}>
                              {statusConfig[claim.status].label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {claim.patientName} • {claim.insuranceProvider} •{' '}
                            {claim.services.join(', ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold">{claim.amount.toLocaleString()} RON</p>
                          {claim.approvedAmount && claim.approvedAmount !== claim.amount && (
                            <p className="text-xs text-green-600">
                              Aprobat: {claim.approvedAmount.toLocaleString()} RON
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {formatDate(claim.submittedDate)}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                          {claim.status === 'pending' && (
                            <Button variant="ghost" size="icon">
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers">
          <Card>
            <CardHeader>
              <CardTitle>Asigurători parteneri</CardTitle>
              <CardDescription>Lista companiilor de asigurări cu care colaborăm</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                {providers.map((provider) => (
                  <div key={provider.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Shield className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium">{provider.name}</h4>
                          <p className="text-xs text-muted-foreground">Cod: {provider.code}</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Pacienți activi</p>
                        <p className="font-medium">{provider.activePatients}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Timp procesare</p>
                        <p className="font-medium">{provider.avgProcessingDays} zile</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground">{provider.contactEmail}</p>
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
