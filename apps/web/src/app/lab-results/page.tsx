'use client';

import { useState } from 'react';
import {
  FlaskConical,
  Search,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  Printer,
  ChevronDown,
  ChevronUp,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface LabTest {
  id: string;
  name: string;
  value: number;
  unit: string;
  referenceMin: number;
  referenceMax: number;
  status: 'normal' | 'low' | 'high' | 'critical';
  trend: 'up' | 'down' | 'stable';
  previousValue?: number;
}

interface LabResult {
  id: string;
  patientId: string;
  patientName: string;
  date: Date;
  category: string;
  status: 'completed' | 'pending' | 'processing';
  orderedBy: string;
  tests: LabTest[];
}

const labResults: LabResult[] = [
  {
    id: 'lr1',
    patientId: 'p1',
    patientName: 'Ion Popescu',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    category: 'Hemoleucogramă',
    status: 'completed',
    orderedBy: 'Dr. Maria Ionescu',
    tests: [
      {
        id: 't1',
        name: 'Hemoglobină',
        value: 14.2,
        unit: 'g/dL',
        referenceMin: 12,
        referenceMax: 17,
        status: 'normal',
        trend: 'stable',
        previousValue: 14.0,
      },
      {
        id: 't2',
        name: 'Leucocite',
        value: 8.5,
        unit: '×10³/µL',
        referenceMin: 4,
        referenceMax: 11,
        status: 'normal',
        trend: 'down',
        previousValue: 9.2,
      },
      {
        id: 't3',
        name: 'Trombocite',
        value: 245,
        unit: '×10³/µL',
        referenceMin: 150,
        referenceMax: 400,
        status: 'normal',
        trend: 'stable',
        previousValue: 250,
      },
      {
        id: 't4',
        name: 'Hematocrit',
        value: 42,
        unit: '%',
        referenceMin: 36,
        referenceMax: 50,
        status: 'normal',
        trend: 'up',
        previousValue: 40,
      },
    ],
  },
  {
    id: 'lr2',
    patientId: 'p1',
    patientName: 'Ion Popescu',
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    category: 'Biochimie',
    status: 'completed',
    orderedBy: 'Dr. Maria Ionescu',
    tests: [
      {
        id: 't5',
        name: 'Glucoză',
        value: 125,
        unit: 'mg/dL',
        referenceMin: 70,
        referenceMax: 100,
        status: 'high',
        trend: 'up',
        previousValue: 110,
      },
      {
        id: 't6',
        name: 'Colesterol total',
        value: 220,
        unit: 'mg/dL',
        referenceMin: 0,
        referenceMax: 200,
        status: 'high',
        trend: 'up',
        previousValue: 195,
      },
      {
        id: 't7',
        name: 'Trigliceride',
        value: 145,
        unit: 'mg/dL',
        referenceMin: 0,
        referenceMax: 150,
        status: 'normal',
        trend: 'down',
        previousValue: 160,
      },
      {
        id: 't8',
        name: 'Creatinină',
        value: 0.9,
        unit: 'mg/dL',
        referenceMin: 0.6,
        referenceMax: 1.2,
        status: 'normal',
        trend: 'stable',
        previousValue: 0.9,
      },
    ],
  },
  {
    id: 'lr3',
    patientId: 'p2',
    patientName: 'Maria Stan',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    category: 'Tiroidă',
    status: 'completed',
    orderedBy: 'Dr. Elena Dumitrescu',
    tests: [
      {
        id: 't9',
        name: 'TSH',
        value: 2.5,
        unit: 'mIU/L',
        referenceMin: 0.4,
        referenceMax: 4.0,
        status: 'normal',
        trend: 'stable',
      },
      {
        id: 't10',
        name: 'T4 liber',
        value: 1.2,
        unit: 'ng/dL',
        referenceMin: 0.8,
        referenceMax: 1.8,
        status: 'normal',
        trend: 'stable',
      },
      {
        id: 't11',
        name: 'T3 liber',
        value: 3.1,
        unit: 'pg/mL',
        referenceMin: 2.3,
        referenceMax: 4.2,
        status: 'normal',
        trend: 'stable',
      },
    ],
  },
  {
    id: 'lr4',
    patientId: 'p3',
    patientName: 'Andrei Georgescu',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    category: 'Hemoleucogramă',
    status: 'pending',
    orderedBy: 'Dr. Mihai Radu',
    tests: [],
  },
];

const statusConfig = {
  completed: { label: 'Finalizat', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  pending: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  processing: { label: 'În procesare', color: 'bg-blue-100 text-blue-700', icon: Clock },
};

const testStatusColors = {
  normal: 'text-green-600',
  low: 'text-yellow-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
};

export default function LabResultsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set(['lr1', 'lr2']));

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const toggleExpanded = (id: string) => {
    setExpandedResults((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const filteredResults = labResults.filter((result) => {
    const matchesSearch =
      searchQuery === '' ||
      result.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || result.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const completedCount = labResults.filter((r) => r.status === 'completed').length;
  const pendingCount = labResults.filter((r) => r.status === 'pending').length;
  const abnormalCount = labResults
    .flatMap((r) => r.tests)
    .filter((t) => t.status !== 'normal').length;

  const getValuePosition = (test: LabTest): number => {
    const range = test.referenceMax - test.referenceMin;
    const position = ((test.value - test.referenceMin) / range) * 100;
    return Math.max(0, Math.min(100, position));
  };

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <TrendingUp className="h-3 w-3 text-orange-500" />;
    if (trend === 'down') return <TrendingDown className="h-3 w-3 text-blue-500" />;
    return <Minus className="h-3 w-3 text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            Rezultate Analize
          </h1>
          <p className="text-muted-foreground mt-1">
            Vizualizează și gestionează rezultatele de laborator
          </p>
        </div>
        <Button>
          <Download className="h-4 w-4 mr-2" />
          Export raport
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FlaskConical className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total analize</p>
              <p className="text-xl font-bold">{labResults.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Finalizate</p>
              <p className="text-xl font-bold">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">În așteptare</p>
              <p className="text-xl font-bold">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valori anormale</p>
              <p className="text-xl font-bold">{abnormalCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Rezultate recente</CardTitle>
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
                  <SelectItem value="completed">Finalizate</SelectItem>
                  <SelectItem value="pending">În așteptare</SelectItem>
                  <SelectItem value="processing">În procesare</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredResults.map((result) => {
              const StatusIcon = statusConfig[result.status].icon;
              const isExpanded = expandedResults.has(result.id);

              return (
                <Collapsible
                  key={result.id}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(result.id)}
                >
                  <div className="border rounded-lg">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center',
                              statusConfig[result.status].color.split(' ')[0]
                            )}
                          >
                            <StatusIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{result.category}</h4>
                              <Badge className={cn('text-xs', statusConfig[result.status].color)}>
                                {statusConfig[result.status].label}
                              </Badge>
                              {result.tests.some((t) => t.status !== 'normal') && (
                                <Badge
                                  variant="outline"
                                  className="text-xs text-orange-600 border-orange-300"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Valori anormale
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {result.patientName} • {result.orderedBy}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(result.date)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {result.tests.length} teste
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {result.tests.length > 0 && (
                        <div className="px-4 pb-4 pt-2 border-t">
                          <div className="space-y-4">
                            {result.tests.map((test) => (
                              <div key={test.id} className="grid grid-cols-12 gap-4 items-center">
                                <div className="col-span-3">
                                  <p className="font-medium text-sm">{test.name}</p>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <TrendIcon trend={test.trend} />
                                    {test.previousValue && (
                                      <span>
                                        anterior: {test.previousValue} {test.unit}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="col-span-2 text-center">
                                  <span
                                    className={cn(
                                      'text-lg font-bold',
                                      testStatusColors[test.status]
                                    )}
                                  >
                                    {test.value}
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-1">
                                    {test.unit}
                                  </span>
                                </div>
                                <div className="col-span-5">
                                  <div className="relative h-2 bg-muted rounded-full">
                                    <div
                                      className="absolute top-0 left-0 h-full bg-green-200 rounded-full"
                                      style={{ width: '100%' }}
                                    />
                                    <div
                                      className={cn(
                                        'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow',
                                        test.status === 'normal'
                                          ? 'bg-green-500'
                                          : test.status === 'high'
                                            ? 'bg-orange-500'
                                            : 'bg-yellow-500'
                                      )}
                                      style={{ left: `calc(${getValuePosition(test)}% - 6px)` }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                    <span>{test.referenceMin}</span>
                                    <span>{test.referenceMax}</span>
                                  </div>
                                </div>
                                <div className="col-span-2 text-right">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'text-xs',
                                      test.status === 'normal'
                                        ? 'text-green-600 border-green-300'
                                        : test.status === 'high'
                                          ? 'text-orange-600 border-orange-300'
                                          : 'text-yellow-600 border-yellow-300'
                                    )}
                                  >
                                    {test.status === 'normal'
                                      ? 'Normal'
                                      : test.status === 'high'
                                        ? 'Crescut'
                                        : 'Scăzut'}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
