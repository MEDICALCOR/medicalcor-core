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
  XCircle,
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
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getInvoicesAction,
  getBillingStatsAction,
  updateInvoiceStatusAction,
  deleteInvoiceAction,
  createInvoiceAction,
  type Invoice,
  type InvoiceStatus,
  type BillingStats,
} from '@/app/actions';

const statusConfig: Record<
  InvoiceStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  draft: { label: 'Ciornă', color: 'bg-gray-100 text-gray-700', icon: FileText },
  pending: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  paid: { label: 'Plătit', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  overdue: { label: 'Restant', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: 'Anulat', color: 'bg-gray-100 text-gray-700', icon: XCircle },
  refunded: { label: 'Rambursat', color: 'bg-purple-100 text-purple-700', icon: Receipt },
};

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Form state
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerEmail, setFormCustomerEmail] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDueDate, setFormDueDate] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    void loadData();
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
    } catch {
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
    return new Date(date).toLocaleDateString('ro-RO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency = 'RON'): string => {
    return `${amount.toLocaleString('ro-RO', { minimumFractionDigits: 2 })} ${currency}`;
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
          taxRate: 19, // Default Romanian VAT rate
          discountAmount: 0,
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
      } catch {
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
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut actualiza factura',
          variant: 'destructive',
        });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteInvoiceAction(id);
        setInvoices((prev) => prev.filter((inv) => inv.id !== id));
        toast({
          title: 'Succes',
          description: 'Factura a fost ștearsă',
        });
        await loadData();
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut șterge factura',
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
        <Button onClick={() => setIsDialogOpen(true)} disabled={isPending}>
          <Plus className="h-4 w-4 mr-2" />
          Factură nouă
        </Button>
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
                <p className="text-xl font-bold">{formatCurrency(stats?.monthlyRevenue ?? 0)}</p>
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
                <p className="text-xl font-bold">{formatCurrency(stats?.pendingAmount ?? 0)}</p>
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
                <p className="text-xl font-bold">{formatCurrency(stats?.overdueAmount ?? 0)}</p>
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
                <p className="text-xl font-bold">{stats?.totalInvoices ?? invoices.length}</p>
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
                  <SelectItem value="draft">Ciorne</SelectItem>
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
                const statusStyle = statusConfig[inv.status];
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
                          <Badge className={cn('text-xs', statusStyle.color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusStyle.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{inv.customerName}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {inv.items.map((item) => item.description).join(', ') || 'Fără servicii'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(inv.total, inv.currency)}</p>
                        <p className="text-xs text-muted-foreground">
                          Scadent: {formatDate(inv.dueDate)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedInvoice(inv)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Printer className="h-4 w-4" />
                        </Button>
                        {inv.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMarkAsPaid(inv.id)}
                            disabled={isPending}
                            title="Marchează ca plătit"
                          >
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon">
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

      {/* Create Invoice Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
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

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Factură {selectedInvoice?.invoiceNumber}</DialogTitle>
            <DialogDescription>
              Emisă pe {selectedInvoice && formatDate(selectedInvoice.issueDate)}
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Client</Label>
                  <p className="font-medium">{selectedInvoice.customerName}</p>
                  {selectedInvoice.customerEmail && (
                    <p className="text-sm text-muted-foreground">{selectedInvoice.customerEmail}</p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge className={cn('mt-1', statusConfig[selectedInvoice.status].color)}>
                    {statusConfig[selectedInvoice.status].label}
                  </Badge>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <Label className="text-muted-foreground">Servicii</Label>
                <div className="mt-2 space-y-2">
                  {selectedInvoice.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>
                        {item.description} x{item.quantity}
                      </span>
                      <span>{formatCurrency(item.total, selectedInvoice.currency)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t mt-4 pt-4 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>
                      {formatCurrency(selectedInvoice.subtotal, selectedInvoice.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>TVA ({selectedInvoice.taxRate}%)</span>
                    <span>
                      {formatCurrency(selectedInvoice.taxAmount, selectedInvoice.currency)}
                    </span>
                  </div>
                  {selectedInvoice.discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>
                        -{formatCurrency(selectedInvoice.discountAmount, selectedInvoice.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Total</span>
                    <span>{formatCurrency(selectedInvoice.total, selectedInvoice.currency)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    handleDelete(selectedInvoice.id);
                    setSelectedInvoice(null);
                  }}
                  disabled={isPending}
                >
                  Șterge factura
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
                    Închide
                  </Button>
                  {selectedInvoice.status === 'pending' && (
                    <Button
                      onClick={() => {
                        handleMarkAsPaid(selectedInvoice.id);
                        setSelectedInvoice(null);
                      }}
                      disabled={isPending}
                    >
                      Marchează ca plătit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
