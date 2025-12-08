'use client';

import { useState } from 'react';
import {
  Plus,
  Flag,
  MoreVertical,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Users,
  Clock,
  Tag,
  Activity,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Percent,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  environment: 'development' | 'staging' | 'production';
  owner?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

const initialFlags: FeatureFlag[] = [
  {
    id: 'ff1',
    key: 'ai_copilot',
    name: 'AI Copilot',
    description: 'Activează asistentul AI pentru agenți în conversațiile cu pacienții',
    enabled: true,
    rolloutPercentage: 100,
    environment: 'production',
    owner: 'tech-lead@medicalcor.ro',
    tags: ['ai', 'agents'],
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-02-20'),
  },
  {
    id: 'ff2',
    key: 'new_scheduler_v2',
    name: 'Scheduler v2',
    description: 'Noul sistem de programări cu optimizare automată și sugestii inteligente',
    enabled: true,
    rolloutPercentage: 25,
    environment: 'production',
    owner: 'product@medicalcor.ro',
    tags: ['scheduling', 'beta'],
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-03-10'),
  },
  {
    id: 'ff3',
    key: 'whatsapp_templates_v2',
    name: 'WhatsApp Templates v2',
    description: 'Template-uri WhatsApp cu variabile dinamice și preview în timp real',
    enabled: false,
    rolloutPercentage: 0,
    environment: 'staging',
    owner: 'integrations@medicalcor.ro',
    tags: ['whatsapp', 'templates'],
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-05'),
  },
  {
    id: 'ff4',
    key: 'dark_mode',
    name: 'Mod Întunecat',
    description: 'Permite utilizatorilor să activeze tema întunecată în aplicație',
    enabled: true,
    rolloutPercentage: 50,
    environment: 'production',
    owner: 'design@medicalcor.ro',
    tags: ['ui', 'theme'],
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-02-28'),
  },
  {
    id: 'ff5',
    key: 'analytics_v3',
    name: 'Analytics v3',
    description: 'Dashboard de analiză îmbunătățit cu metrici în timp real și predicții',
    enabled: false,
    rolloutPercentage: 10,
    environment: 'development',
    owner: 'data@medicalcor.ro',
    tags: ['analytics', 'experimental'],
    createdAt: new Date('2024-03-10'),
    updatedAt: new Date('2024-03-15'),
    expiresAt: new Date('2024-06-30'),
  },
];

const environmentColors = {
  development: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  staging: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  production: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const environmentLabels = {
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
};

type FormData = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  environment: 'development' | 'staging' | 'production';
  owner: string;
  tags: string;
};

const defaultFormData: FormData = {
  key: '',
  name: '',
  description: '',
  enabled: false,
  rolloutPercentage: 0,
  environment: 'development',
  owner: '',
  tags: '',
};

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState(initialFlags);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [flagToDelete, setFlagToDelete] = useState<FeatureFlag | null>(null);
  const [activeEnvironment, setActiveEnvironment] = useState<'all' | FeatureFlag['environment']>(
    'all'
  );
  const [expandedFlags, setExpandedFlags] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<FormData>(defaultFormData);

  const filteredFlags =
    activeEnvironment === 'all' ? flags : flags.filter((f) => f.environment === activeEnvironment);

  const stats = {
    total: flags.length,
    enabled: flags.filter((f) => f.enabled).length,
    rolling: flags.filter((f) => f.enabled && f.rolloutPercentage > 0 && f.rolloutPercentage < 100)
      .length,
  };

  const handleCreate = () => {
    setSelectedFlag(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleEdit = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setFormData({
      key: flag.key,
      name: flag.name,
      description: flag.description,
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage,
      environment: flag.environment,
      owner: flag.owner || '',
      tags: flag.tags.join(', '),
    });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    const now = new Date();
    const tags = formData.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (selectedFlag) {
      // Update existing flag
      setFlags((prev) =>
        prev.map((f) =>
          f.id === selectedFlag.id
            ? {
                ...f,
                ...formData,
                tags,
                updatedAt: now,
              }
            : f
        )
      );
    } else {
      // Create new flag
      const newFlag: FeatureFlag = {
        id: `ff-${Date.now()}`,
        key: formData.key,
        name: formData.name,
        description: formData.description,
        enabled: formData.enabled,
        rolloutPercentage: formData.rolloutPercentage,
        environment: formData.environment,
        owner: formData.owner || undefined,
        tags,
        createdAt: now,
        updatedAt: now,
      };
      setFlags((prev) => [...prev, newFlag]);
    }
    setIsDialogOpen(false);
  };

  const handleToggle = (flag: FeatureFlag) => {
    setFlags((prev) =>
      prev.map((f) =>
        f.id === flag.id
          ? {
              ...f,
              enabled: !f.enabled,
              updatedAt: new Date(),
            }
          : f
      )
    );
  };

  const handleRolloutChange = (flag: FeatureFlag, percentage: number) => {
    setFlags((prev) =>
      prev.map((f) =>
        f.id === flag.id
          ? {
              ...f,
              rolloutPercentage: percentage,
              updatedAt: new Date(),
            }
          : f
      )
    );
  };

  const handleDeleteClick = (flag: FeatureFlag) => {
    setFlagToDelete(flag);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (flagToDelete) {
      setFlags((prev) => prev.filter((f) => f.id !== flagToDelete.id));
      setIsDeleteDialogOpen(false);
      setFlagToDelete(null);
    }
  };

  const toggleExpanded = (flagId: string) => {
    setExpandedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flagId)) {
        next.delete(flagId);
      } else {
        next.add(flagId);
      }
      return next;
    });
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ro-RO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Flag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Flag-uri</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.enabled}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.rolling}</p>
                <p className="text-sm text-muted-foreground">Rollout Progresiv</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5" />
                Feature Flags
              </CardTitle>
              <CardDescription>
                Gestionează feature flags pentru rollout progresiv și A/B testing
              </CardDescription>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Flag nou
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Environment Filter */}
          <Tabs
            value={activeEnvironment}
            onValueChange={(v) => setActiveEnvironment(v as typeof activeEnvironment)}
            className="mb-6"
          >
            <TabsList>
              <TabsTrigger value="all">Toate ({flags.length})</TabsTrigger>
              <TabsTrigger value="production">
                Production ({flags.filter((f) => f.environment === 'production').length})
              </TabsTrigger>
              <TabsTrigger value="staging">
                Staging ({flags.filter((f) => f.environment === 'staging').length})
              </TabsTrigger>
              <TabsTrigger value="development">
                Development ({flags.filter((f) => f.environment === 'development').length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Flags List */}
          <div className="space-y-3">
            {filteredFlags.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Flag className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nu există feature flags pentru acest mediu</p>
                <Button variant="outline" className="mt-4" onClick={handleCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  Creează primul flag
                </Button>
              </div>
            ) : (
              filteredFlags.map((flag) => (
                <Collapsible
                  key={flag.id}
                  open={expandedFlags.has(flag.id)}
                  onOpenChange={() => toggleExpanded(flag.id)}
                >
                  <div
                    className={cn(
                      'border rounded-lg transition-colors',
                      !flag.enabled && 'opacity-60',
                      expandedFlags.has(flag.id) && 'border-primary/50'
                    )}
                  >
                    {/* Main Row */}
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4 flex-1">
                        <Switch
                          checked={flag.enabled}
                          onCheckedChange={() => handleToggle(flag)}
                          aria-label={`Toggle ${flag.name}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">{flag.name}</h3>
                            <Badge variant="outline" className="font-mono text-xs">
                              {flag.key}
                            </Badge>
                            <Badge className={cn('text-xs', environmentColors[flag.environment])}>
                              {environmentLabels[flag.environment]}
                            </Badge>
                            {flag.enabled && flag.rolloutPercentage < 100 && (
                              <Badge
                                variant="secondary"
                                className="text-xs flex items-center gap-1"
                              >
                                <Percent className="h-3 w-3" />
                                {flag.rolloutPercentage}%
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                            {flag.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {expandedFlags.has(flag.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(flag)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editează
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggle(flag)}>
                              {flag.enabled ? (
                                <>
                                  <ToggleLeft className="h-4 w-4 mr-2" />
                                  Dezactivează
                                </>
                              ) : (
                                <>
                                  <ToggleRight className="h-4 w-4 mr-2" />
                                  Activează
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(flag)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Șterge
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    <CollapsibleContent>
                      <div className="border-t px-4 py-4 space-y-4 bg-muted/30">
                        {/* Rollout Slider */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Rollout Progresiv
                            </Label>
                            <span className="text-sm font-medium">
                              {flag.rolloutPercentage}% din utilizatori
                            </span>
                          </div>
                          <Slider
                            value={flag.rolloutPercentage}
                            onValueChange={(value) => handleRolloutChange(flag, value)}
                            min={0}
                            max={100}
                            step={5}
                            disabled={!flag.enabled}
                            showValue
                            formatValue={(v) => `${v}%`}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>0%</span>
                            <span>25%</span>
                            <span>50%</span>
                            <span>75%</span>
                            <span>100%</span>
                          </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                          {flag.owner && (
                            <div>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Owner
                              </p>
                              <p className="text-sm font-medium truncate">{flag.owner}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Creat
                            </p>
                            <p className="text-sm font-medium">{formatDate(flag.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Actualizat
                            </p>
                            <p className="text-sm font-medium">{formatDate(flag.updatedAt)}</p>
                          </div>
                          {flag.expiresAt && (
                            <div>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Expiră
                              </p>
                              <p className="text-sm font-medium text-orange-600">
                                {formatDate(flag.expiresAt)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Tags */}
                        {flag.tags.length > 0 && (
                          <div className="flex items-center gap-2 pt-2">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            <div className="flex flex-wrap gap-1">
                              {flag.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedFlag ? 'Editează Feature Flag' : 'Feature Flag Nou'}</DialogTitle>
            <DialogDescription>
              {selectedFlag
                ? 'Modifică setările feature flag-ului'
                : 'Creează un nou feature flag pentru rollout progresiv'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="key">Cheie (slug)</Label>
                <Input
                  id="key"
                  placeholder="ex: new_feature_v2"
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  disabled={!!selectedFlag}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="environment">Mediu</Label>
                <Select
                  value={formData.environment}
                  onValueChange={(v: FormData['environment']) =>
                    setFormData({ ...formData, environment: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nume</Label>
              <Input
                id="name"
                placeholder="ex: Funcționalitate Nouă v2"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descriere</Label>
              <Textarea
                id="description"
                placeholder="Descrie ce face acest feature flag..."
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <Label htmlFor="enabled">Activat</Label>
                <p className="text-sm text-muted-foreground">
                  Flag-ul va fi evaluat pentru utilizatori
                </p>
              </div>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Rollout Progresiv</Label>
                <span className="text-sm font-medium">{formData.rolloutPercentage}%</span>
              </div>
              <Slider
                value={formData.rolloutPercentage}
                onValueChange={(value) => setFormData({ ...formData, rolloutPercentage: value })}
                min={0}
                max={100}
                step={5}
                showValue
                formatValue={(v) => `${v}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="owner">Owner (opțional)</Label>
                <Input
                  id="owner"
                  placeholder="email@exemplu.com"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tag-uri (separate prin virgulă)</Label>
                <Input
                  id="tags"
                  placeholder="beta, ui, experimental"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Anulează
            </Button>
            <Button onClick={handleSave} disabled={!formData.key || !formData.name}>
              {selectedFlag ? 'Salvează modificările' : 'Creează flag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Confirmare Ștergere
            </DialogTitle>
            <DialogDescription>
              Ești sigur că vrei să ștergi feature flag-ul{' '}
              <span className="font-medium">&quot;{flagToDelete?.name}&quot;</span>? Această acțiune
              nu poate fi anulată.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Anulează
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Șterge flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
