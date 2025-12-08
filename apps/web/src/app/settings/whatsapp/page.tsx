'use client';

/**
 * @fileoverview WhatsApp Template Management UI
 *
 * M9: Self-service WhatsApp template management with preview, testing, and analytics.
 */

import { useState, useEffect, useTransition, useMemo } from 'react';
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
  Send,
  BarChart3,
  Play,
  Phone,
  TrendingUp,
  Users,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getWhatsAppTemplatesAction,
  getWhatsAppTemplateStatsAction,
  createWhatsAppTemplateAction,
  updateWhatsAppTemplateAction,
  deleteWhatsAppTemplateAction,
  duplicateWhatsAppTemplateAction,
  previewWhatsAppTemplateAction,
  sendTestMessageAction,
  getAllTemplateAnalyticsAction,
  type WhatsAppTemplate,
  type TemplateCategory,
  type TemplateStats,
  type TemplateAnalytics,
  type TemplatePreview,
} from '@/app/actions';

// ============================================================================
// CONSTANTS
// ============================================================================

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

// ============================================================================
// COMPONENTS
// ============================================================================

interface PreviewDialogProps {
  template: WhatsAppTemplate;
  onClose: () => void;
}

function PreviewDialog({ template, onClose }: PreviewDialogProps) {
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [testPhone, setTestPhone] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function loadPreview() {
      const result = await previewWhatsAppTemplateAction(template.id);
      if (result) {
        setPreview(result);
        setVariables(result.sampleVariables);
      }
      setIsLoading(false);
    }
    void loadPreview();
  }, [template.id]);

  const handleVariableChange = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  const renderedContent = useMemo(() => {
    let content = template.content;
    Object.entries(variables).forEach(([key, value]) => {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`);
    });
    return content;
  }, [template.content, variables]);

  const handleSendTest = async () => {
    if (!testPhone) {
      toast({
        title: 'Eroare',
        description: 'Introdu un număr de telefon',
        variant: 'destructive',
      });
      return;
    }
    setIsSending(true);
    try {
      const result = await sendTestMessageAction(template.id, testPhone, variables);
      if (result.success) {
        toast({
          title: 'Mesaj trimis',
          description: `Mesaj test trimis cu succes! ID: ${result.messageId}`,
        });
      } else {
        toast({ title: 'Eroare', description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({
        title: 'Eroare',
        description: 'Nu s-a putut trimite mesajul',
        variant: 'destructive',
      });
    }
    setIsSending(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Template Info */}
      <div className="flex items-center gap-2">
        <Badge className={cn('text-xs', categoryColors[template.category])}>
          {categoryLabels[template.category]}
        </Badge>
        <Badge className={cn('text-xs', statusConfig[template.status].color)}>
          {statusConfig[template.status].label}
        </Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Variables Editor */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Edit className="h-4 w-4" />
            Variabile
          </h4>
          <div className="space-y-3">
            {template.variables.map((variable) => (
              <div key={variable} className="space-y-1">
                <Label className="text-xs">
                  {'{{'}
                  {variable}
                  {'}}'}
                </Label>
                <Input
                  value={variables[variable] ?? ''}
                  onChange={(e) => handleVariableChange(variable, e.target.value)}
                  placeholder={`Valoare pentru {{${variable}}}`}
                />
              </div>
            ))}
          </div>

          {/* Test Send */}
          {template.status === 'approved' && (
            <div className="space-y-3 pt-4 border-t">
              <h4 className="font-medium flex items-center gap-2">
                <Send className="h-4 w-4" />
                Trimite mesaj test
              </h4>
              <div className="flex gap-2">
                <Input
                  placeholder="+40 7XX XXX XXX"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <Button onClick={handleSendTest} disabled={isSending}>
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Mesajul va fi trimis prin WhatsApp Business API
              </p>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Previzualizare
          </h4>
          <div className="bg-[#E5DDD5] p-4 rounded-lg min-h-[200px]">
            <div className="max-w-xs ml-auto">
              <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">
                <p className="text-sm whitespace-pre-wrap">{renderedContent}</p>
                {template.footer && (
                  <p className="text-xs text-muted-foreground mt-2">{template.footer}</p>
                )}
                <p className="text-[10px] text-right text-muted-foreground mt-1">
                  {new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Închide
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [stats, setStats] = useState<TemplateStats>({
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    totalUsage: 0,
  });
  const [analytics, setAnalytics] = useState<TemplateAnalytics[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [activeTab, setActiveTab] = useState('templates');

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
      const [templatesData, statsData, analyticsData] = await Promise.all([
        getWhatsAppTemplatesAction(),
        getWhatsAppTemplateStatsAction(),
        getAllTemplateAnalyticsAction(),
      ]);
      setTemplates(templatesData);
      setStats(statsData);
      setAnalytics(analyticsData);
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
        toast({ title: 'Succes', description: 'Template-ul a fost șters' });
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
        toast({ title: 'Succes', description: 'Template-ul a fost duplicat' });
      } catch {
        toast({
          title: 'Eroare',
          description: 'Nu s-a putut duplica template-ul',
          variant: 'destructive',
        });
      }
    });
  };

  // Calculate aggregate analytics
  const totalAnalytics = useMemo(() => {
    const agg = analytics.reduce(
      (acc, a) => ({
        sent: acc.sent + a.totalSent,
        delivered: acc.delivered + a.delivered,
        read: acc.read + a.read,
        replied: acc.replied + a.replied,
      }),
      { sent: 0, delivered: 0, read: 0, replied: 0 }
    );
    return {
      ...agg,
      deliveryRate: agg.sent > 0 ? Math.round((agg.delivered / agg.sent) * 100) : 0,
      readRate: agg.delivered > 0 ? Math.round((agg.read / agg.delivered) * 100) : 0,
      replyRate: agg.read > 0 ? Math.round((agg.replied / agg.read) * 100) : 0,
    };
  }, [analytics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizează
          </Button>
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
                        <SelectItem value="authentication">Autentificare</SelectItem>
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
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <p className="text-sm text-muted-foreground">Total trimise</p>
              <p className="text-xl font-bold">{stats.totalUsage.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Rată livrare</p>
              <p className="text-xl font-bold">{totalAnalytics.deliveryRate}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates">
            <MessageSquare className="h-4 w-4 mr-1" />
            Template-uri ({templates.length})
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-1" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Template-urile mele</CardTitle>
              <CardDescription>
                Template-uri pentru comunicare prin WhatsApp Business
              </CardDescription>
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
                              {template.successCount > 0 && (
                                <span className="text-green-600">
                                  {Math.round((template.successCount / template.usageCount) * 100)}%
                                  succes
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 ml-4">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Previzualizare & Test"
                              onClick={() => setPreviewTemplate(template)}
                            >
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
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="space-y-4">
            {/* Aggregate Stats */}
            <div className="grid sm:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Send className="h-4 w-4" />
                    Livrate
                  </div>
                  <p className="text-2xl font-bold mt-1">
                    {totalAnalytics.delivered.toLocaleString()}
                  </p>
                  <Progress value={totalAnalytics.deliveryRate} className="h-1 mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalAnalytics.deliveryRate}% din trimise
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Eye className="h-4 w-4" />
                    Citite
                  </div>
                  <p className="text-2xl font-bold mt-1">{totalAnalytics.read.toLocaleString()}</p>
                  <Progress value={totalAnalytics.readRate} className="h-1 mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalAnalytics.readRate}% din livrate
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    Răspunsuri
                  </div>
                  <p className="text-2xl font-bold mt-1">
                    {totalAnalytics.replied.toLocaleString()}
                  </p>
                  <Progress value={totalAnalytics.replyRate} className="h-1 mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {totalAnalytics.replyRate}% din citite
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    Active
                  </div>
                  <p className="text-2xl font-bold mt-1">{analytics.length}</p>
                  <p className="text-xs text-muted-foreground mt-3">Template-uri cu activitate</p>
                </CardContent>
              </Card>
            </div>

            {/* Per-Template Analytics */}
            <Card>
              <CardHeader>
                <CardTitle>Performanță per template</CardTitle>
                <CardDescription>
                  Statistici detaliate pentru fiecare template aprobat
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analytics.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nu există date de analiză</p>
                    <p className="text-sm">Trimite mesaje pentru a vedea statistici</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {analytics.map((a) => (
                      <div key={a.templateId} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">{a.templateName}</h4>
                          <Badge variant="outline">{a.totalSent.toLocaleString()} trimise</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Livrare</span>
                              <span className="font-medium">{a.deliveryRate}%</span>
                            </div>
                            <Progress value={a.deliveryRate} className="h-2" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Citire</span>
                              <span className="font-medium">{a.readRate}%</span>
                            </div>
                            <Progress value={a.readRate} className="h-2" />
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Răspuns</span>
                              <span className="font-medium">{a.replyRate}%</span>
                            </div>
                            <Progress value={a.replyRate} className="h-2" />
                          </div>
                        </div>
                        {a.lastSentAt && (
                          <p className="text-xs text-muted-foreground mt-3">
                            Ultima utilizare:{' '}
                            {new Date(a.lastSentAt).toLocaleDateString('ro-RO', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Previzualizare: {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription>Editează variabilele și testează template-ul</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <PreviewDialog template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
