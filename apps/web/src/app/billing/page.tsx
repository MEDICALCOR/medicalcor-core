'use client';

import { useState, useEffect, useTransition } from 'react';
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
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getInvoicesAction,
  getBillingStatsAction,
  createInvoiceAction,
  updateInvoiceStatusAction,
  type Invoice,
  type InvoiceStatus,
  type BillingStats,
} from '@/app/actions';

const statusConfig: Record<InvoiceStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  draft: { label: 'Ciornă', color: 'bg-gray-100 text-gray-700', icon: FileText },
  pending: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  paid: { label: 'Plătit', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  overdue: { label: 'Restant', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: 'Anulat', color: 'bg-gray-100 text-gray-500', icon: AlertCircle },
  refunded: { label: 'Rambursat', color: 'bg-purple-100 text-purple-700', icon: Receipt },
};

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<BillingStats>({
    totalInvoices: 0,
    pendingAmount: 0,
    paidAmount: 0,
    overdueAmount: 0,
    monthlyRevenue: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerEmail, setFormCustomerEmail] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setIsLoading(true);
      const [invoicesData, statsData] = await Promise.all([
        getInvoicesAction(),
        getBillingStatsAction(),
      ]);
      setInvoices(invoicesData);
      setStats(statsData);
    } catch (error) {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca facturile',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const resetForm = () => {
    setFormCustomerName('');
    setFormCustomerEmail('');
    setFormDescription('');
    setFormAmount('');
    setFormDueDate('');
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      searchQuery === '' ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateInvoice = async () => {
    if (!formCustomerName || !formDescription || !formAmount || !formDueDate) {
      toast({
        title: 'Eroare',
        description: 'Completează toate câmpurile obligatorii',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      try {
        const newInvoice = await createInvoiceAction({
          customerName: formCustomerName,
          customerEmail: formCustomerEmail || undefined,
          dueDate: new Date(formDueDate),
          items: [
            {
              description: formDescription,
              quantity: 1,
              unitPrice: parseFloat(formAmount),
            },
          ],
        });
        setInvoices((prev) => [newInvoice, ...prev]);
        setIsDialogOpen(false);
        resetForm();
        await loadData();
        toast({
          title: 'Succes',
          description: 'Factura a fost creată',
        });
      } catch (error) {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut crea factura',
          variant: 'destructive',
        });
      }
    });
  };

  const handleMarkAsPaid = async (id: string) => {
    startTransition(async () => {
      try {
        const updated = await updateInvoiceStatusAction({
          id,
          status: 'paid',
          paymentMethod: 'manual',
        });
        setInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
        await loadData();
        toast({
          title: 'Succes',
          description: 'Factura a fost marcată ca plătită',
        });
      } catch (error) {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut actualiza factura',
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
            <CreditCard className="h-6 w-6 text-primary" />
            Facturare
          </h1>
          <p className="text-muted-foreground mt-1">Gestionează facturile și plățile</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
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
                <Label>Nume client *</Label>
                <Input
                  placeholder="ex: Ion Popescu"
                  value={formCustomerName}
                  onChange={(e) => setFormCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email client</Label>
                <Input
                  type="email"
                  placeholder="email@exemplu.ro"
                  value={formCustomerEmail}
                  onChange={(e) => setFormCustomerEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Descriere servicii *</Label>
                <Textarea
                  placeholder="ex: Consultație generală, Ecografie"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sumă (RON) *</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scadență *</Label>
                  <Input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button onClick={handleCreateInvoice} disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Creează factură
                </Button>
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
                <p className="text-xl font-bold">{stats.monthlyRevenue.toLocaleString()} RON</p>
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
                <p className="text-xl font-bold">{stats.pendingAmount.toLocaleString()} RON</p>
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
                <p className="text-xl font-bold">{stats.overdueAmount.toLocaleString()} RON</p>
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
                <p className="text-xl font-bold">{stats.totalInvoices}</p>
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
                onValueChange={(value: string) => setStatusFilter(value as InvoiceStatus | 'all')}
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
          {filteredInvoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nu există facturi</p>
              <p className="text-sm">Creează prima factură pentru a începe</p>
            </div>
          ) : (
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
                          <h4 className="font-medium">{inv.invoiceNumber}</h4>
                          <Badge className={cn('text-xs', statusConfig[inv.status].color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig[inv.status].label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{inv.customerName}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {inv.items.map((item) => item.description).join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold">{inv.total.toLocaleString()} {inv.currency}</p>
                        <p className="text-xs text-muted-foreground">
                          Scadent: {formatDate(inv.dueDate)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="Vizualizează">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Printează">
                          <Printer className="h-4 w-4" />
                        </Button>
                        {inv.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Marchează ca plătit"
                            onClick={() => handleMarkAsPaid(inv.id)}
                            disabled={isPending}
                          >
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Trimite">
                          <Send className="h-4 w-4" />
                        </Button>
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
