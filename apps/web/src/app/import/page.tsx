'use client';

import { useState, useCallback } from 'react';
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Check,
  AlertCircle,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PagePermissionGate } from '@/components/auth/require-permission';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

interface FileColumn {
  index: number;
  name: string;
  sample: string[];
}

interface ColumnMapping {
  fileColumn: number | null;
  systemField: string;
  required: boolean;
}

const systemFields = [
  { id: 'firstName', label: 'Prenume', required: true },
  { id: 'lastName', label: 'Nume', required: true },
  { id: 'phone', label: 'Telefon', required: true },
  { id: 'email', label: 'Email', required: false },
  { id: 'dateOfBirth', label: 'Data nașterii', required: false },
  { id: 'cnp', label: 'CNP', required: false },
  { id: 'address', label: 'Adresă', required: false },
  { id: 'city', label: 'Oraș', required: false },
  { id: 'source', label: 'Sursă', required: false },
  { id: 'notes', label: 'Note', required: false },
];

// Simulated CSV data
const mockFileColumns: FileColumn[] = [
  { index: 0, name: 'Nume complet', sample: ['Ion Popescu', 'Maria Ionescu', 'Andrei Popa'] },
  { index: 1, name: 'Nr. Telefon', sample: ['0721123456', '0722234567', '0723345678'] },
  {
    index: 2,
    name: 'Adresa email',
    sample: ['ion@email.com', 'maria@email.com', 'andrei@email.com'],
  },
  { index: 3, name: 'Data nastere', sample: ['15/03/1985', '22/07/1990', '10/11/1978'] },
  { index: 4, name: 'Oras', sample: ['București', 'Cluj-Napoca', 'Timișoara'] },
  {
    index: 5,
    name: 'Adresa',
    sample: ['Str. Victoriei 10', 'Bd. Eroilor 25', 'Str. Mihai Viteazu 3'],
  },
  { index: 6, name: 'Observatii', sample: ['Client fidel', 'Recomandat', 'Nou'] },
];

const mockPreviewData = [
  {
    firstName: 'Ion',
    lastName: 'Popescu',
    phone: '0721123456',
    email: 'ion@email.com',
    city: 'București',
  },
  {
    firstName: 'Maria',
    lastName: 'Ionescu',
    phone: '0722234567',
    email: 'maria@email.com',
    city: 'Cluj-Napoca',
  },
  {
    firstName: 'Andrei',
    lastName: 'Popa',
    phone: '0723345678',
    email: 'andrei@email.com',
    city: 'Timișoara',
  },
  {
    firstName: 'Elena',
    lastName: 'Dumitrescu',
    phone: '0724456789',
    email: 'elena@email.com',
    city: 'Iași',
  },
  {
    firstName: 'Alexandru',
    lastName: 'Stan',
    phone: '0725567890',
    email: 'alex@email.com',
    city: 'Constanța',
  },
];

export default function ImportPage() {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileColumns, setFileColumns] = useState<FileColumn[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>(
    systemFields.map((f) => ({ fileColumn: null, systemField: f.id, required: f.required }))
  );
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0] as File | undefined;
    if (!file) return;
    const isValidFile =
      file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (isValidFile) {
      handleFileSelect(file);
    }
  };

  const handleFileSelect = (file: File) => {
    setUploadedFile(file);
    // Simulate parsing file columns
    setFileColumns(mockFileColumns);
    // Auto-map some columns
    const autoMappings = [...mappings];
    autoMappings[0].fileColumn = 0; // firstName/lastName from "Nume complet"
    autoMappings[1].fileColumn = 0; // We'll split this in real implementation
    autoMappings[2].fileColumn = 1; // phone
    autoMappings[3].fileColumn = 2; // email
    autoMappings[4].fileColumn = 3; // dateOfBirth
    autoMappings[6].fileColumn = 5; // address
    autoMappings[7].fileColumn = 4; // city
    autoMappings[9].fileColumn = 6; // notes
    setMappings(autoMappings);
    setCurrentStep('mapping');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleMappingChange = (systemField: string, fileColumnIndex: number | null) => {
    setMappings((prev) =>
      prev.map((m) => (m.systemField === systemField ? { ...m, fileColumn: fileColumnIndex } : m))
    );
  };

  const requiredFieldsMapped = mappings
    .filter((m) => m.required)
    .every((m) => m.fileColumn !== null);

  const startImport = () => {
    setCurrentStep('importing');
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setImportedCount(247);
        setCurrentStep('complete');
      }
      setImportProgress(Math.min(progress, 100));
    }, 200);
  };

  const resetImport = () => {
    setCurrentStep('upload');
    setUploadedFile(null);
    setFileColumns([]);
    setMappings(
      systemFields.map((f) => ({ fileColumn: null, systemField: f.id, required: f.required }))
    );
    setImportProgress(0);
    setImportedCount(0);
  };

  return (
    <PagePermissionGate pathname="/import">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="h-6 w-6 text-primary" />
            Import Date
          </h1>
          <p className="text-muted-foreground mt-1">Importă pacienți din fișiere CSV sau Excel</p>
        </div>

        {/* Progress Steps */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              {[
                { id: 'upload', label: 'Încărcare fișier' },
                { id: 'mapping', label: 'Mapare coloane' },
                { id: 'preview', label: 'Previzualizare' },
                { id: 'complete', label: 'Finalizat' },
              ].map((step, index) => {
                const steps: ImportStep[] = ['upload', 'mapping', 'preview', 'complete'];
                const currentIndex = steps.indexOf(
                  currentStep === 'importing' ? 'complete' : currentStep
                );
                const stepIndex = steps.indexOf(step.id as ImportStep);
                const isActive = stepIndex === currentIndex;
                const isComplete = stepIndex < currentIndex || currentStep === 'complete';

                return (
                  <div key={step.id} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                          isComplete
                            ? 'bg-green-500 text-white'
                            : isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {isComplete ? <Check className="h-5 w-5" /> : index + 1}
                      </div>
                      <span className={cn('text-xs mt-2', isActive && 'font-medium')}>
                        {step.label}
                      </span>
                    </div>
                    {index < 3 && (
                      <div
                        className={cn(
                          'h-[2px] w-16 mx-4',
                          stepIndex < currentIndex ? 'bg-green-500' : 'bg-muted'
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Step Content */}
        {currentStep === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Pasul 1: Încarcă fișierul</CardTitle>
              <CardDescription>
                Selectează un fișier CSV sau Excel cu datele pacienților
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'border-2 border-dashed rounded-lg p-12 text-center transition-colors',
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                )}
              >
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Trage fișierul aici</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  sau click pentru a selecta din calculator
                </p>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileInputChange}
                  className="hidden"
                  id="file-upload"
                />
                {}
                <label htmlFor="file-upload" aria-label="Selectează fișier pentru import">
                  <Button asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      Selectează fișier
                    </span>
                  </Button>
                </label>
                <p className="text-xs text-muted-foreground mt-4">
                  Formate acceptate: CSV, XLSX, XLS (max. 10MB)
                </p>
              </div>

              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Template de import
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Descarcă un template cu structura recomandată pentru import
                </p>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Descarcă template CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'mapping' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pasul 2: Mapare coloane</CardTitle>
                  <CardDescription>
                    Asociază coloanele din fișier cu câmpurile din sistem
                  </CardDescription>
                </div>
                <Badge variant="outline" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {uploadedFile?.name}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {!requiredFieldsMapped && (
                <Alert className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Mapează toate câmpurile obligatorii (marcate cu *) pentru a continua
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                {systemFields.map((field) => {
                  const mapping = mappings.find((m) => m.systemField === field.id);
                  const selectedColumn =
                    mapping?.fileColumn !== null
                      ? fileColumns.find((c) => c.index === mapping?.fileColumn)
                      : null;

                  return (
                    <div
                      key={field.id}
                      className="grid grid-cols-[200px,auto,1fr,200px] gap-4 items-center"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{field.label}</span>
                        {field.required && <span className="text-red-500">*</span>}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={mapping?.fileColumn?.toString() ?? 'none'}
                        onValueChange={(value: string) =>
                          handleMappingChange(field.id, value === 'none' ? null : parseInt(value))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selectează coloana" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Nu mapa --</SelectItem>
                          {fileColumns.map((col) => (
                            <SelectItem key={col.index} value={col.index.toString()}>
                              {col.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground truncate">
                        {selectedColumn && <span>ex: {selectedColumn.sample[0]}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between mt-8">
                <Button variant="outline" onClick={resetImport}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Înapoi
                </Button>
                <Button onClick={() => setCurrentStep('preview')} disabled={!requiredFieldsMapped}>
                  Continuă
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'preview' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pasul 3: Previzualizare</CardTitle>
                  <CardDescription>Verifică datele înainte de import</CardDescription>
                </div>
                <Badge className="bg-green-100 text-green-700">247 înregistrări găsite</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prenume</TableHead>
                      <TableHead>Nume</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Oraș</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockPreviewData.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.firstName}</TableCell>
                        <TableCell>{row.lastName}</TableCell>
                        <TableCell>{row.phone}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>{row.city}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Se afișează primele 5 înregistrări din 247
              </p>

              <Alert className="mt-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Atenție:</strong> Importul va crea 247 de pacienți noi în sistem.
                  Pacienții existenți cu același număr de telefon vor fi actualizați.
                </AlertDescription>
              </Alert>

              <div className="flex justify-between mt-8">
                <Button variant="outline" onClick={() => setCurrentStep('mapping')}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Înapoi
                </Button>
                <Button onClick={startImport}>
                  <Upload className="h-4 w-4 mr-2" />
                  Începe importul
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'importing' && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Upload className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <h3 className="text-lg font-medium mb-2">Import în curs...</h3>
              <p className="text-muted-foreground mb-6">Te rugăm să nu închizi această pagină</p>
              <div className="max-w-md mx-auto">
                <Progress value={importProgress} className="h-3" />
                <p className="text-sm text-muted-foreground mt-2">
                  {Math.round(importProgress)}% completat
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 'complete' && (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Import finalizat cu succes!</h3>
              <p className="text-muted-foreground mb-6">
                Au fost importați <strong>{importedCount}</strong> pacienți noi
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" onClick={resetImport}>
                  Import nou
                </Button>
                <Button asChild>
                  <a href="/patients">
                    Vizualizează pacienții
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Cards */}
        {currentStep === 'upload' && (
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium mb-2">Formate acceptate</h4>
                <p className="text-sm text-muted-foreground">
                  CSV, Excel (.xlsx, .xls). Fișierul trebuie să aibă anteturi pe primul rând.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium mb-2">Câmpuri obligatorii</h4>
                <p className="text-sm text-muted-foreground">
                  Prenume, Nume și Telefon sunt necesare pentru fiecare pacient.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium mb-2">Detectare duplicate</h4>
                <p className="text-sm text-muted-foreground">
                  Pacienții existenți sunt identificați după numărul de telefon și actualizați.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PagePermissionGate>
  );
}
