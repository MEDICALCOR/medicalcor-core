'use client';

import { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Mail,
  Phone,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Eye,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Template {
  id: string;
  name: string;
  channel: 'whatsapp' | 'sms' | 'email';
  category: string;
  subject?: string;
  content: string;
  variables: string[];
  isActive: boolean;
}

const initialTemplates: Template[] = [
  {
    id: 't1',
    name: 'Bun venit',
    channel: 'whatsapp',
    category: 'Onboarding',
    content:
      'Bună ziua {{nume}}! Mulțumim că ați ales {{clinica}}. Suntem aici să vă ajutăm. Pentru programări, răspundeți la acest mesaj.',
    variables: ['nume', 'clinica'],
    isActive: true,
  },
  {
    id: 't2',
    name: 'Reminder programare 24h',
    channel: 'whatsapp',
    category: 'Programări',
    content:
      'Vă reamintim că mâine, {{data}}, la ora {{ora}}, aveți programare la {{clinica}}. Vă așteptăm!',
    variables: ['data', 'ora', 'clinica'],
    isActive: true,
  },
  {
    id: 't3',
    name: 'Confirmare programare',
    channel: 'sms',
    category: 'Programări',
    content: 'Programarea dvs. pentru {{data}} ora {{ora}} a fost confirmată. {{clinica}}',
    variables: ['data', 'ora', 'clinica'],
    isActive: true,
  },
  {
    id: 't4',
    name: 'Follow-up consultație',
    channel: 'email',
    category: 'Follow-up',
    subject: 'Cum vă simțiți după consultație?',
    content:
      'Dragă {{nume}},\n\nSperăm că vă simțiți bine după vizita la clinica noastră.\n\nDacă aveți întrebări, nu ezitați să ne contactați.\n\nCu stimă,\n{{clinica}}',
    variables: ['nume', 'clinica'],
    isActive: true,
  },
  {
    id: 't5',
    name: 'Reactivare lead',
    channel: 'whatsapp',
    category: 'Marketing',
    content:
      'Bună {{nume}}, am observat că nu ne-ați mai vizitat de ceva timp. Ne-ar face plăcere să vă revedem! Programați acum și beneficiați de 10% reducere.',
    variables: ['nume'],
    isActive: false,
  },
];

const channelIcons = {
  whatsapp: MessageSquare,
  sms: Phone,
  email: Mail,
};

const channelColors = {
  whatsapp: 'bg-green-100 text-green-700',
  sms: 'bg-blue-100 text-blue-700',
  email: 'bg-purple-100 text-purple-700',
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'all' | 'whatsapp' | 'sms' | 'email'>('all');

  const filteredTemplates =
    activeChannel === 'all' ? templates : templates.filter((t) => t.channel === activeChannel);

  const handleEdit = (template: Template) => {
    setSelectedTemplate(template);
    setIsEditing(true);
  };

  const handleDuplicate = (template: Template) => {
    const newTemplate: Template = {
      ...template,
      id: `t-${Date.now()}`,
      name: `${template.name} (Copie)`,
    };
    setTemplates((prev) => [...prev, newTemplate]);
  };

  const handleDelete = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* WhatsApp Business Templates Banner */}
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-green-900">Template-uri WhatsApp Business</p>
                <p className="text-sm text-green-700">
                  Creează template-uri pre-aprobate pentru WhatsApp cu previzualizare și analytics
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="border-green-300 hover:bg-green-100">
              <Link href="/settings/whatsapp">
                Gestionează
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Template-uri Mesaje</CardTitle>
              <CardDescription>
                Gestionează template-urile pentru comunicări automate
              </CardDescription>
            </div>
            <Button onClick={() => setIsEditing(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Template nou
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Channel Filter */}
          <Tabs
            value={activeChannel}
            onValueChange={(v) => setActiveChannel(v as typeof activeChannel)}
            className="mb-6"
          >
            <TabsList>
              <TabsTrigger value="all">Toate ({templates.length})</TabsTrigger>
              <TabsTrigger value="whatsapp">
                <MessageSquare className="h-4 w-4 mr-1" />
                WhatsApp ({templates.filter((t) => t.channel === 'whatsapp').length})
              </TabsTrigger>
              <TabsTrigger value="sms">
                <Phone className="h-4 w-4 mr-1" />
                SMS ({templates.filter((t) => t.channel === 'sms').length})
              </TabsTrigger>
              <TabsTrigger value="email">
                <Mail className="h-4 w-4 mr-1" />
                Email ({templates.filter((t) => t.channel === 'email').length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Templates List */}
          <div className="space-y-3">
            {filteredTemplates.map((template) => {
              const ChannelIcon = channelIcons[template.channel];
              return (
                <div
                  key={template.id}
                  className={cn(
                    'flex items-start justify-between p-4 border rounded-lg',
                    !template.isActive && 'opacity-60'
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        channelColors[template.channel]
                      )}
                    >
                      <ChannelIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{template.name}</h3>
                        <Badge variant="secondary" className="text-[10px]">
                          {template.category}
                        </Badge>
                        {!template.isActive && (
                          <Badge variant="outline" className="text-[10px]">
                            Inactiv
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 max-w-lg">
                        {template.content}
                      </p>
                      {template.variables.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-xs text-muted-foreground">Variabile:</span>
                          {template.variables.map((v) => (
                            <Badge key={v} variant="outline" className="text-[10px] font-mono">
                              {`{{${v}}}`}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(template)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editează
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSelectedTemplate(template)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Previzualizare
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplică
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(template.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Șterge
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? 'Editează Template' : 'Template Nou'}</DialogTitle>
            <DialogDescription>
              Creează sau editează un template pentru mesaje automate
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nume template</Label>
                <Input placeholder="ex: Reminder programare" />
              </div>
              <div className="space-y-2">
                <Label>Canal</Label>
                <Select defaultValue={selectedTemplate?.channel ?? 'whatsapp'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categorie</Label>
              <Input placeholder="ex: Programări, Marketing, Follow-up" />
            </div>

            <div className="space-y-2">
              <Label>Conținut mesaj</Label>
              <Textarea
                placeholder="Scrie mesajul aici... Folosește {{variabila}} pentru câmpuri dinamice"
                rows={5}
                defaultValue={selectedTemplate?.content}
              />
              <p className="text-xs text-muted-foreground">
                Variabile disponibile: {`{{nume}}, {{clinica}}, {{data}}, {{ora}}, {{doctor}}`}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Anulează
              </Button>
              <Button onClick={() => setIsEditing(false)}>Salvează template</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
