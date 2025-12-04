'use client';

import { useState, useEffect, useTransition } from 'react';
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
  Loader2,
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
import { useToast } from '@/hooks/use-toast';
import {
  getWhatsAppTemplatesAction,
  getWhatsAppTemplateStatsAction,
  createWhatsAppTemplateAction,
  updateWhatsAppTemplateAction,
  deleteWhatsAppTemplateAction,
  duplicateWhatsAppTemplateAction,
  type WhatsAppTemplate,
  type TemplateCategory,
  type TemplateStats,
} from '@/app/actions';

const categoryLabels: Record<TemplateCategory, string> = {
  appointment: 'Programări',
  reminder: 'Reminder',
  followup: 'Follow-up',
  marketing: 'Marketing',
  utility: 'Utilitar',
  authentication: 'Autentificare',
};

const categoryColors: Record<TemplateCategory, string> = {
  appointment: 'bg-blue-100 text-blue-700',
  reminder: 'bg-yellow-100 text-yellow-700',
  followup: 'bg-green-100 text-green-700',
  marketing: 'bg-purple-100 text-purple-700',
  utility: 'bg-gray-100 text-gray-700',
  authentication: 'bg-orange-100 text-orange-700',
};

const statusConfig = {
  approved: { label: 'Aprobat', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  pending: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  rejected: { label: 'Respins', color: 'bg-red-100 text-red-700', icon: X },
  disabled: { label: 'Dezactivat', color: 'bg-gray-100 text-gray-500', icon: X },
};

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [stats, setStats] = useState<TemplateStats>({
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    totalUsage: 0,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<TemplateCategory>('appointment');
  const [formContent, setFormContent] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      setIsLoading(true);
      const [templatesData, statsData] = await Promise.all([
        getWhatsAppTemplatesAction(),
        getWhatsAppTemplateStatsAction(),
      ]);
      setTemplates(templatesData);
      setStats(statsData);
    } catch {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca template-urile',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const resetForm = () => {
    setFormName('');
    setFormCategory('appointment');
    setFormContent('');
    setEditingTemplate(null);
  };

  const openEditDialog = (template: WhatsAppTemplate) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormCategory(template.category);
    setFormContent(template.content);
    setIsDialogOpen(true);
  };

  const handleCreateOrUpdate = () => {
    if (!formName || !formContent) {
      toast({
        title: 'Eroare',
        description: 'Completează toate câmpurile obligatorii',
        variant: 'destructive',
      });
      return;
    }

    startTransition(async () => {
      try {
        if (editingTemplate) {
          const updated = await updateWhatsAppTemplateAction({
            id: editingTemplate.id,
            name: formName,
            category: formCategory,
            content: formContent,
          });
          setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          toast({
            title: 'Succes',
            description: 'Template-ul a fost actualizat și retrimis spre aprobare',
          });
        } else {
          const newTemplate = await createWhatsAppTemplateAction({
            name: formName,
            category: formCategory,
            content: formContent,
            language: 'ro',
            variables: [],
          });
          setTemplates((prev) => [newTemplate, ...prev]);
          toast({
            title: 'Succes',
            description: 'Template-ul a fost creat și trimis spre aprobare',
          });
        }
        setIsDialogOpen(false);
        resetForm();
        await loadData();
      } catch (error) {
        toast({
          title: 'Eroare',
          description: error instanceof Error ? error.message : 'Nu s-a putut salva template-ul',
          variant: 'destructive',
        });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        await deleteWhatsAppTemplateAction(id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        toast({
          title: 'Succes',
          description: 'Template-ul a fost șters',
        });
        await loadData();
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut șterge template-ul',
          variant: 'destructive',
        });
      }
    });
  };

  const handleDuplicate = (id: string) => {
    startTransition(async () => {
      try {
        const duplicate = await duplicateWhatsAppTemplateAction(id);
        setTemplates((prev) => [duplicate, ...prev]);
        toast({
          title: 'Succes',
          description: 'Template-ul a fost duplicat',
        });
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut duplica template-ul',
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
            <MessageSquare className="h-6 w-6 text-green-600" />
            Template-uri WhatsApp
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestionează template-urile pre-aprobate pentru WhatsApp Business
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Template nou
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Editează template WhatsApp' : 'Creează template WhatsApp'}
              </DialogTitle>
              <DialogDescription>
                Template-urile trebuie aprobate de Meta înainte de utilizare
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nume template *</Label>
                  <Input
                    placeholder="ex: confirmare_programare"
                    value={formName}
                    onChange={(e) =>
                      setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Doar litere mici, numere și underscore
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Categorie *</Label>
                  <Select
                    value={formCategory}
                    onValueChange={(v) => setFormCategory(v as TemplateCategory)}
                  >
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
                <Label>Conținut mesaj *</Label>
                <Textarea
                  placeholder="Bună ziua {{1}}! Programarea dvs. la {{2}} a fost confirmată..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
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
                <Button onClick={handleCreateOrUpdate} disabled={isPending}>
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingTemplate ? 'Salvează modificările' : 'Trimite spre aprobare'}
                </Button>
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
              <p className="text-xl font-bold">{stats.approvedCount}</p>
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
              <p className="text-xl font-bold">{stats.pendingCount}</p>
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
              <p className="text-xl font-bold">{stats.totalUsage.toLocaleString()}</p>
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
          {templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nu ai niciun template WhatsApp</p>
              <p className="text-sm">Creează un template pentru a trimite mesaje</p>
            </div>
          ) : (
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
                        {template.rejectionReason && (
                          <p className="text-sm text-red-600 mt-1">
                            Motiv respingere: {template.rejectionReason}
                          </p>
                        )}
                        <div className="mt-3 p-3 bg-muted/50 rounded text-sm">
                          {template.content}
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span>
                            Variabile:{' '}
                            {template.variables.map((v) => `{{${v}}}`).join(', ') || 'Niciuna'}
                          </span>
                          <span>{template.usageCount.toLocaleString()} utilizări</span>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-4">
                        <Button variant="ghost" size="icon" title="Previzualizare">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Duplică"
                          onClick={() => handleDuplicate(template.id)}
                          disabled={isPending}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {template.status !== 'approved' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editează"
                            onClick={() => openEditDialog(template)}
                            disabled={isPending}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Șterge"
                          onClick={() => handleDelete(template.id)}
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4" />
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
