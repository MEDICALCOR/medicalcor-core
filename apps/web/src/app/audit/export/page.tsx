'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Download,
  Calendar,
  ArrowLeft,
  Loader2,
  FileSpreadsheet,
  File,
  CheckCircle,
  Clock,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { getAuditLogsAction } from '@/app/actions';
import {
  toCSV,
  downloadCSV,
  downloadXLSX,
  downloadPDF,
  auditColumns,
  auditPdfColumns,
  type ExportFormat,
} from '@/lib/export';
import { cn } from '@/lib/utils';

type DatePreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const formatOptions: {
  value: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    value: 'csv',
    label: 'CSV',
    description: 'Format text simplu, compatibil cu Excel și alte aplicații',
    icon: FileText,
  },
  {
    value: 'xlsx',
    label: 'Excel (XLSX)',
    description: 'Format Microsoft Excel cu formatare și foi de calcul',
    icon: FileSpreadsheet,
  },
  {
    value: 'pdf',
    label: 'PDF',
    description: 'Document portabil pentru imprimare și arhivare',
    icon: File,
  },
];

const datePresets: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Astăzi' },
  { value: 'week', label: 'Ultima săptămână' },
  { value: 'month', label: 'Ultima lună' },
  { value: 'quarter', label: 'Ultimul trimestru' },
  { value: 'year', label: 'Ultimul an' },
  { value: 'custom', label: 'Perioadă personalizată' },
];

const categoryOptions = [
  { value: 'all', label: 'Toate categoriile' },
  { value: 'patient', label: 'Pacienți' },
  { value: 'document', label: 'Documente' },
  { value: 'settings', label: 'Setări' },
  { value: 'auth', label: 'Autentificare' },
  { value: 'billing', label: 'Facturare' },
  { value: 'system', label: 'Sistem' },
];

const statusOptions = [
  { value: 'all', label: 'Toate statusurile' },
  { value: 'success', label: 'Succes' },
  { value: 'failure', label: 'Erori' },
  { value: 'warning', label: 'Avertismente' },
];

function getDateRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const startDate = new Date(now);

  switch (preset) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      return { start: startDate, end };
    case 'week':
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      return { start: startDate, end };
    case 'month':
      startDate.setMonth(startDate.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
      return { start: startDate, end };
    case 'quarter':
      startDate.setMonth(startDate.getMonth() - 3);
      startDate.setHours(0, 0, 0, 0);
      return { start: startDate, end };
    case 'year':
      startDate.setFullYear(startDate.getFullYear() - 1);
      startDate.setHours(0, 0, 0, 0);
      return { start: startDate, end };
    case 'custom':
      return {
        start: customStart ? new Date(customStart) : new Date(now.getFullYear(), 0, 1),
        end: customEnd ? new Date(customEnd) : end,
      };
    default:
      return { start: new Date(now.getFullYear(), 0, 1), end };
  }
}

export default function AuditExportPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [format, setFormat] = useState<ExportFormat>('csv');
  const [datePreset, setDatePreset] = useState<DatePreset>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exportProgress, setExportProgress] = useState<{
    status: 'idle' | 'loading' | 'success' | 'error';
    message?: string;
    recordCount?: number;
  }>({ status: 'idle' });

  function handleExport() {
    startTransition(async () => {
      try {
        setExportProgress({ status: 'loading', message: 'Se încarcă datele...' });

        const { start, end } = getDateRange(datePreset, customStartDate, customEndDate);

        const result = await getAuditLogsAction(
          {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            category: categoryFilter !== 'all' ? categoryFilter : undefined,
            status: statusFilter !== 'all' ? statusFilter : undefined,
          },
          10000,
          0
        );

        if (result.error) {
          setExportProgress({ status: 'error', message: result.error });
          toast({
            title: 'Eroare',
            description: result.error,
            variant: 'destructive',
          });
          return;
        }

        const logs = result.logs;
        setExportProgress({
          status: 'loading',
          message: `Se generează ${format.toUpperCase()}...`,
          recordCount: logs.length,
        });

        const filename = `audit-log-${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}`;
        const dateRangeLabel = {
          start: start.toLocaleDateString('ro-RO'),
          end: end.toLocaleDateString('ro-RO'),
        };

        switch (format) {
          case 'csv': {
            const csv = toCSV(logs, auditColumns);
            downloadCSV(csv, filename);
            break;
          }
          case 'xlsx': {
            downloadXLSX(logs, auditColumns, filename, 'Jurnal Audit');
            break;
          }
          case 'pdf': {
            downloadPDF(logs, auditPdfColumns, {
              title: 'Raport Jurnal Audit',
              subtitle: 'MedicalCor - Raport de Conformitate',
              filename,
              orientation: 'landscape',
              dateRange: dateRangeLabel,
            });
            break;
          }
          default:
            // Exhaustive check - all formats are covered
            break;
        }

        setExportProgress({
          status: 'success',
          message: `${logs.length} înregistrări exportate cu succes`,
          recordCount: logs.length,
        });

        toast({
          title: 'Export reușit',
          description: `${logs.length} înregistrări au fost exportate în format ${format.toUpperCase()}`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Eroare la export';
        setExportProgress({ status: 'error', message });
        toast({
          title: 'Eroare',
          description: message,
          variant: 'destructive',
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/audit')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Download className="h-6 w-6 text-primary" />
            Export Jurnal Audit
          </h1>
          <p className="text-muted-foreground mt-1">
            Exportă înregistrările din jurnalul de audit pentru rapoarte de conformitate
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Format export
              </CardTitle>
              <CardDescription>
                Selectează formatul în care dorești să exporți datele
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-3 gap-4">
                {formatOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = format === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormat(option.value)}
                      className={cn(
                        'flex flex-col items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all text-left',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/20'
                      )}
                    >
                      <div
                        className={cn(
                          'w-12 h-12 rounded-lg flex items-center justify-center',
                          isSelected ? 'bg-primary/10' : 'bg-muted'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-6 w-6',
                            isSelected ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                      </div>
                      <div className="text-center">
                        <p className="font-medium">{option.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Perioadă
              </CardTitle>
              <CardDescription>
                Selectează perioada pentru care dorești să exporți datele
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {datePresets.map((preset) => (
                  <Button
                    key={preset.value}
                    variant={datePreset === preset.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDatePreset(preset.value)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>

              {datePreset === 'custom' && (
                <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Data început</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Data sfârșit</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtre (opțional)
              </CardTitle>
              <CardDescription>Filtrează înregistrările după categorie și status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categorie</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sumar export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Format:</span>
                  <span className="font-medium">{format.toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Perioadă:</span>
                  <span className="font-medium">
                    {datePresets.find((p) => p.value === datePreset)?.label}
                  </span>
                </div>
                {categoryFilter !== 'all' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Categorie:</span>
                    <span className="font-medium">
                      {categoryOptions.find((c) => c.value === categoryFilter)?.label}
                    </span>
                  </div>
                )}
                {statusFilter !== 'all' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="font-medium">
                      {statusOptions.find((s) => s.value === statusFilter)?.label}
                    </span>
                  </div>
                )}
              </div>

              {exportProgress.status !== 'idle' && (
                <Alert
                  className={cn(
                    exportProgress.status === 'success' && 'border-green-500 bg-green-50',
                    exportProgress.status === 'error' && 'border-red-500 bg-red-50'
                  )}
                >
                  {exportProgress.status === 'loading' && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {exportProgress.status === 'success' && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  {exportProgress.status === 'error' && <Clock className="h-4 w-4 text-red-600" />}
                  <AlertDescription>{exportProgress.message}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleExport} disabled={isPending} className="w-full" size="lg">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Se exportă...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Exportă jurnalul
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Informații conformitate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Exporturile din jurnalul de audit sunt esențiale pentru conformitatea GDPR și HIPAA.
                Păstrați aceste rapoarte pentru o perioadă minimă de 6 ani.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
