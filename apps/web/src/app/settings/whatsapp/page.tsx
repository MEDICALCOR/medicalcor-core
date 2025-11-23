'use client';

import { useState } from 'react';
import {
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  Copy,
  Eye,
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

interface WhatsAppTemplate {
  id: string;
  name: string;
  category: 'appointment' | 'reminder' | 'followup' | 'marketing' | 'utility';
  status: 'approved' | 'pending' | 'rejected';
  language: string;
  content: string;
  variables: string[];
  lastUsed: Date | null;
  usageCount: number;
}

const templates: WhatsAppTemplate[] = [
  {
    id: 't1',
    name: 'Confirmare programare',
    category: 'appointment',
    status: 'approved',
    language: 'ro',
    content:
      'Bună ziua {{1}}! Programarea dvs. la {{2}} a fost confirmată pentru {{3}} la ora {{4}}. Vă așteptăm!',
    variables: ['nume', 'medic', 'data', 'ora'],
    lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000),
    usageCount: 1234,
  },
  {
    id: 't2',
    name: 'Reminder 24h',
    category: 'reminder',
    status: 'approved',
    language: 'ro',
    content:
      'Bună ziua {{1}}! Vă reamintim că aveți programare mâine, {{2}}, la ora {{3}}. Pentru anulare, răspundeți cu ANULARE.',
    variables: ['nume', 'data', 'ora'],
    lastUsed: new Date(Date.now() - 1 * 60 * 60 * 1000),
    usageCount: 2456,
  },
  {
    id: 't3',
    name: 'Follow-up consultație',
    category: 'followup',
    status: 'approved',
    language: 'ro',
    content:
      'Bună ziua {{1}}! Sperăm că vă simțiți mai bine după vizita la {{2}}. Dacă aveți întrebări, suntem aici să vă ajutăm.',
    variables: ['nume', 'medic'],
    lastUsed: new Date(Date.now() - 24 * 60 * 60 * 1000),
    usageCount: 567,
  },
  {
    id: 't4',
    name: 'Promoție servicii',
    category: 'marketing',
    status: 'pending',
    language: 'ro',
    content:
      'Bună {{1}}! Avem o ofertă specială pentru dvs.: {{2}}. Valabilă până la {{3}}. Programează-te acum!',
    variables: ['nume', 'oferta', 'data_expirare'],
    lastUsed: null,
    usageCount: 0,
  },
  {
    id: 't5',
    name: 'Rezultate analize',
    category: 'utility',
    status: 'rejected',
    language: 'ro',
    content:
      'Bună ziua {{1}}! Rezultatele analizelor dvs. sunt disponibile. Puteți să le ridicați de la recepție sau să le vizualizați online.',
    variables: ['nume'],
    lastUsed: null,
    usageCount: 0,
  },
];

const categoryLabels = {
  appointment: 'Programări',
  reminder: 'Reminder',
  followup: 'Follow-up',
  marketing: 'Marketing',
  utility: 'Utilitar',
};

const categoryColors = {
  appointment: 'bg-blue-100 text-blue-700',
  reminder: 'bg-yellow-100 text-yellow-700',
  followup: 'bg-green-100 text-green-700',
  marketing: 'bg-purple-100 text-purple-700',
  utility: 'bg-gray-100 text-gray-700',
};

const statusConfig = {
  approved: { label: 'Aprobat', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  pending: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  rejected: { label: 'Respins', color: 'bg-red-100 text-red-700', icon: X },
};

export default function WhatsAppTemplatesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const approvedCount = templates.filter((t) => t.status === 'approved').length;
  const pendingCount = templates.filter((t) => t.status === 'pending').length;
  const totalUsage = templates.reduce((sum, t) => sum + t.usageCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            Template-uri WhatsApp
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestionează template-urile pre-aprobate pentru WhatsApp Business
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Template nou
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Creează template WhatsApp</DialogTitle>
              <DialogDescription>
                Template-urile trebuie aprobate de Meta înainte de utilizare
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nume template</Label>
                  <Input placeholder="ex: confirmare_programare" />
                </div>
                <div className="space-y-2">
                  <Label>Categorie</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selectează" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment">Programări</SelectItem>
                      <SelectItem value="reminder">Reminder</SelectItem>
                      <SelectItem value="followup">Follow-up</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="utility">Utilitar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Conținut mesaj</Label>
                <Textarea
                  placeholder="Bună ziua {{1}}! Programarea dvs. la {{2}} a fost confirmată..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Folosește {'{{1}}'}, {'{{2}}'}, etc. pentru variabile
                </p>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Template-urile de marketing necesită aprobare explicită și pot dura 24-48h.
                </AlertDescription>
              </Alert>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Trimite spre aprobare</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aprobate</p>
              <p className="text-xl font-bold">{approvedCount}</p>
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
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mesaje trimise</p>
              <p className="text-xl font-bold">{totalUsage.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template-urile mele</CardTitle>
          <CardDescription>Template-uri pentru comunicare prin WhatsApp Business</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {templates.map((template) => {
              const StatusIcon = statusConfig[template.status].icon;
              return (
                <div key={template.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium">{template.name}</h4>
                        <Badge className={cn('text-xs', categoryColors[template.category])}>
                          {categoryLabels[template.category]}
                        </Badge>
                        <Badge className={cn('text-xs', statusConfig[template.status].color)}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig[template.status].label}
                        </Badge>
                      </div>
                      <div className="mt-3 p-3 bg-muted/50 rounded text-sm">{template.content}</div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span>
                          Variabile: {template.variables.map((v) => `{{${v}}}`).join(', ')}
                        </span>
                        <span>{template.usageCount.toLocaleString()} utilizări</span>
                      </div>
                    </div>
                    <div className="flex gap-1 ml-4">
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4" />
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
