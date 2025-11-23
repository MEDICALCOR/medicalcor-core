'use client';

import { useState } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Users,
  TrendingUp,
  DollarSign,
  Clock,
  Filter,
  Loader2,
  FileBarChart,
  PieChart,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  category: 'patients' | 'appointments' | 'financial' | 'performance';
  sections: string[];
  estimatedPages: number;
}

const reportTemplates: ReportTemplate[] = [
  {
    id: 'patients-overview',
    name: 'Raport Pacienți',
    description: 'Statistici generale despre pacienți, surse de achiziție și conversii',
    icon: Users,
    category: 'patients',
    sections: [
      'Sumar general',
      'Pacienți noi vs. existenți',
      'Surse de achiziție',
      'Distribuție pe status',
    ],
    estimatedPages: 5,
  },
  {
    id: 'appointments-report',
    name: 'Raport Programări',
    description: 'Analiza programărilor, rate de confirmare și no-show',
    icon: Calendar,
    category: 'appointments',
    sections: [
      'Programări totale',
      'Rate de confirmare',
      'No-show analysis',
      'Ocupare pe zile/ore',
    ],
    estimatedPages: 6,
  },
  {
    id: 'revenue-report',
    name: 'Raport Financiar',
    description: 'Venituri, încasări și analiză financiară detaliată',
    icon: DollarSign,
    category: 'financial',
    sections: ['Venituri totale', 'Încasări pe servicii', 'Comparație perioade', 'Predicții'],
    estimatedPages: 8,
  },
  {
    id: 'conversion-funnel',
    name: 'Raport Conversii',
    description: 'Funnel de conversie lead → pacient cu rate pe etape',
    icon: TrendingUp,
    category: 'performance',
    sections: [
      'Funnel overview',
      'Conversii pe etapă',
      'Timp mediu conversie',
      'Performanță canale',
    ],
    estimatedPages: 4,
  },
  {
    id: 'team-performance',
    name: 'Performanță Echipă',
    description: 'Statistici per operator și medic',
    icon: Clock,
    category: 'performance',
    sections: [
      'Performanță individuală',
      'Comparație echipă',
      'Timp răspuns',
      'Task-uri finalizate',
    ],
    estimatedPages: 5,
  },
  {
    id: 'custom-report',
    name: 'Raport Personalizat',
    description: 'Creează un raport cu secțiunile selectate de tine',
    icon: FileBarChart,
    category: 'patients',
    sections: ['Selectabil'],
    estimatedPages: 0,
  },
];

const categoryColors = {
  patients: 'bg-blue-100 text-blue-700',
  appointments: 'bg-green-100 text-green-700',
  financial: 'bg-yellow-100 text-yellow-700',
  performance: 'bg-purple-100 text-purple-700',
};

const categoryLabels = {
  patients: 'Pacienți',
  appointments: 'Programări',
  financial: 'Financiar',
  performance: 'Performanță',
};

interface GeneratedReport {
  id: string;
  name: string;
  generatedAt: Date;
  period: string;
  size: string;
}

const recentReports: GeneratedReport[] = [
  {
    id: 'r1',
    name: 'Raport Pacienți - Ianuarie 2024',
    generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    period: '01 Ian - 31 Ian 2024',
    size: '1.2 MB',
  },
  {
    id: 'r2',
    name: 'Raport Financiar Q4 2023',
    generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    period: '01 Oct - 31 Dec 2023',
    size: '2.4 MB',
  },
  {
    id: 'r3',
    name: 'Performanță Echipă - Decembrie',
    generatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    period: '01 Dec - 31 Dec 2023',
    size: '0.8 MB',
  },
];

export default function ReportsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [dateRange, setDateRange] = useState('last-30');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeRawData, setIncludeRawData] = useState(false);

  const handleGenerateReport = () => {
    setIsGenerating(true);
    setGenerationProgress(0);

    const interval = setInterval(() => {
      setGenerationProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsGenerating(false);
            setSelectedTemplate(null);
            setGenerationProgress(0);
          }, 500);
          return 100;
        }
        return prev + Math.random() * 20;
      });
    }, 300);
  };

  const toggleSection = (section: string) => {
    setSelectedSections((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );
  };

  const formatRelativeDate = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Astăzi';
    if (diffDays === 1) return 'Ieri';
    return `Acum ${diffDays} zile`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Rapoarte
          </h1>
          <p className="text-muted-foreground mt-1">Generează rapoarte PDF cu date și grafice</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Rapoarte generate</p>
              <p className="text-xl font-bold">24</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Download className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Descărcări luna aceasta</p>
              <p className="text-xl font-bold">18</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <PieChart className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Grafice incluse</p>
              <p className="text-xl font-bold">156</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pagini totale</p>
              <p className="text-xl font-bold">342</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Template-uri Rapoarte</CardTitle>
          <CardDescription>Selectează un template pentru a genera un raport PDF</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportTemplates.map((template) => {
              const Icon = template.icon;
              return (
                <div
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplate(template);
                    setSelectedSections(template.sections.filter((s) => s !== 'Selectabil'));
                  }}
                  className="border rounded-lg p-4 cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        categoryColors[template.category]
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{template.name}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {categoryLabels[template.category]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                      {template.estimatedPages > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          ~{template.estimatedPages} pagini
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Rapoarte Recente</CardTitle>
          <CardDescription>Ultimele rapoarte generate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentReports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="font-medium">{report.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {report.period} • {report.size}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeDate(report.generatedAt)}
                  </span>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Descarcă
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Generate Report Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generează {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>Configurează opțiunile pentru raportul tău</DialogDescription>
          </DialogHeader>

          {isGenerating ? (
            <div className="py-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-4" />
              <h3 className="font-medium mb-2">Se generează raportul...</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Acest proces poate dura câteva secunde
              </p>
              <div className="max-w-xs mx-auto">
                <Progress value={generationProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {Math.round(generationProgress)}% completat
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {/* Date Range */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Perioada raportului
                </Label>
                <Select value={dateRange} onValueChange={(value: string) => setDateRange(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last-7">Ultimele 7 zile</SelectItem>
                    <SelectItem value="last-30">Ultimele 30 zile</SelectItem>
                    <SelectItem value="last-90">Ultimele 90 zile</SelectItem>
                    <SelectItem value="this-month">Luna curentă</SelectItem>
                    <SelectItem value="last-month">Luna trecută</SelectItem>
                    <SelectItem value="this-year">Anul curent</SelectItem>
                    <SelectItem value="custom">Perioadă personalizată</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sections */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Secțiuni incluse
                </Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {selectedTemplate?.sections
                    .filter((s) => s !== 'Selectabil')
                    .map((section) => (
                      <div
                        key={section}
                        className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleSection(section)}
                      >
                        <Checkbox
                          checked={selectedSections.includes(section)}
                          onCheckedChange={() => toggleSection(section)}
                        />
                        <span className="text-sm">{section}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <Label>Opțiuni export</Label>
                <div className="space-y-2">
                  <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setIncludeCharts(!includeCharts)}
                  >
                    <Checkbox
                      checked={includeCharts}
                      onCheckedChange={(checked: boolean) => setIncludeCharts(checked)}
                    />
                    <span className="text-sm">Include grafice și vizualizări</span>
                  </div>
                  <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setIncludeRawData(!includeRawData)}
                  >
                    <Checkbox
                      checked={includeRawData}
                      onCheckedChange={(checked: boolean) => setIncludeRawData(checked)}
                    />
                    <span className="text-sm">Include date brute în anexă</span>
                  </div>
                </div>
              </div>

              {/* Estimated Size */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Dimensiune estimată</span>
                  <span className="font-medium">
                    ~{selectedTemplate?.estimatedPages ?? selectedSections.length * 2} pagini
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                  Anulează
                </Button>
                <Button onClick={handleGenerateReport} disabled={selectedSections.length === 0}>
                  <Download className="h-4 w-4 mr-2" />
                  Generează PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
