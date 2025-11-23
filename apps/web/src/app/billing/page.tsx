'use client';

import { useState } from 'react';
import {
  CreditCard,
  Plus,
  Download,
  Search,
  Eye,
  Send,
  Printer,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Receipt,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface Invoice {
  id: string;
  number: string;
  patient: string;
  date: Date;
  dueDate: Date;
  amount: number;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled';
  services: string[];
}

const invoices: Invoice[] = [
  {
    id: 'inv1',
    number: 'INV-2024-001',
    patient: 'Ion Popescu',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    amount: 350,
    status: 'pending',
    services: ['Consultație', 'Ecografie'],
  },
  {
    id: 'inv2',
    number: 'INV-2024-002',
    patient: 'Maria Ionescu',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    amount: 150,
    status: 'overdue',
    services: ['Consultație generală'],
  },
  {
    id: 'inv3',
    number: 'INV-2024-003',
    patient: 'Andrei Popa',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    amount: 500,
    status: 'paid',
    services: ['Analize laborator', 'Consultație', 'EKG'],
  },
  {
    id: 'inv4',
    number: 'INV-2024-004',
    patient: 'Elena Dumitrescu',
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    amount: 280,
    status: 'paid',
    services: ['Control periodic', 'Vaccinare'],
  },
  {
    id: 'inv5',
    number: 'INV-2024-005',
    patient: 'Alexandru Stan',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    dueDate: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000),
    amount: 200,
    status: 'pending',
    services: ['Ecografie abdominală'],
  },
];

const statusConfig = {
  paid: { label: 'Plătit', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  pending: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  overdue: { label: 'Restant', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: 'Anulat', color: 'bg-gray-100 text-gray-700', icon: AlertCircle },
};

export default function BillingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const totalRevenue = invoices
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.amount, 0);
  const pendingAmount = invoices
    .filter((i) => i.status === 'pending')
    .reduce((sum, i) => sum + i.amount, 0);
  const overdueAmount = invoices
    .filter((i) => i.status === 'overdue')
    .reduce((sum, i) => sum + i.amount, 0);

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      searchQuery === '' ||
      inv.patient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Facturare
          </h1>
          <p className="text-muted-foreground mt-1">Gestionează facturile și plățile</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Factură nouă
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Creează factură nouă</DialogTitle>
              <DialogDescription>Completează detaliile facturii</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Pacient</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează pacientul" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p1">Ion Popescu</SelectItem>
                    <SelectItem value="p2">Maria Ionescu</SelectItem>
                    <SelectItem value="p3">Andrei Popa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Servicii</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează serviciile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="s1">Consultație generală - 150 RON</SelectItem>
                    <SelectItem value="s2">Ecografie - 200 RON</SelectItem>
                    <SelectItem value="s3">Analize laborator - 120 RON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline">Anulează</Button>
                <Button>Creează factură</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Încasări luna aceasta</p>
                <p className="text-xl font-bold">{totalRevenue.toLocaleString()} RON</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">În așteptare</p>
                <p className="text-xl font-bold">{pendingAmount.toLocaleString()} RON</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Restanțe</p>
                <p className="text-xl font-bold">{overdueAmount.toLocaleString()} RON</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total facturi</p>
                <p className="text-xl font-bold">{invoices.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Facturi</CardTitle>
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
                  <SelectItem value="paid">Plătite</SelectItem>
                  <SelectItem value="pending">În așteptare</SelectItem>
                  <SelectItem value="overdue">Restante</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredInvoices.map((inv) => {
              const StatusIcon = statusConfig[inv.status].icon;
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{inv.number}</h4>
                        <Badge className={cn('text-xs', statusConfig[inv.status].color)}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig[inv.status].label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{inv.patient}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {inv.services.join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-bold">{inv.amount} RON</p>
                      <p className="text-xs text-muted-foreground">
                        Scadent: {formatDate(inv.dueDate)}
                      </p>
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
