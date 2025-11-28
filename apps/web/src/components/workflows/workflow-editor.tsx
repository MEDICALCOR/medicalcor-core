'use client';

import { useState, useCallback } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  Clock,
  MessageSquare,
  Mail,
  Tag,
  CheckCircle2,
  Users,
  Zap,
  AlertCircle,
  Calendar,
  Save,
  Loader2,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  type Workflow,
  type WorkflowStep,
  type TriggerType,
  type ActionType,
  triggerLabels,
  triggerDescriptions,
  actionLabels,
} from '@/lib/workflows';

interface WorkflowEditorProps {
  workflow: Workflow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (workflow: Partial<Workflow> & { id?: string }) => Promise<void>;
  isNew?: boolean;
}

const triggerIcons: Record<TriggerType, React.ElementType> = {
  new_lead: Users,
  appointment_scheduled: Calendar,
  appointment_completed: CheckCircle2,
  no_response: AlertCircle,
  message_received: MessageSquare,
  tag_added: Tag,
  status_changed: Zap,
};

const actionIcons: Record<ActionType, React.ElementType> = {
  send_whatsapp: MessageSquare,
  send_sms: MessageSquare,
  send_email: Mail,
  add_tag: Tag,
  remove_tag: Tag,
  change_status: Zap,
  assign_to: Users,
  create_task: CheckCircle2,
  wait: Clock,
};

const TRIGGER_TYPES: TriggerType[] = [
  'new_lead',
  'appointment_scheduled',
  'appointment_completed',
  'no_response',
  'message_received',
  'tag_added',
  'status_changed',
];

const ACTION_TYPES: ActionType[] = [
  'send_whatsapp',
  'send_sms',
  'send_email',
  'add_tag',
  'remove_tag',
  'change_status',
  'assign_to',
  'create_task',
];

function generateId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Safely get a string value from config object
 */
function getConfigString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function StepEditor({
  step,
  index,
  onUpdate,
  onDelete,
}: {
  step: WorkflowStep;
  index: number;
  onUpdate: (step: WorkflowStep) => void;
  onDelete: () => void;
}) {
  const handleTypeChange = (type: 'action' | 'delay') => {
    if (type === 'delay') {
      onUpdate({
        ...step,
        type: 'delay',
        delay: step.delay ?? { value: 1, unit: 'hours' },
        action: undefined,
        condition: undefined,
      });
    } else {
      onUpdate({
        ...step,
        type: 'action',
        action: step.action ?? {
          id: generateId(),
          type: 'send_whatsapp',
          config: {},
        },
        delay: undefined,
        condition: undefined,
      });
    }
  };

  const handleActionTypeChange = (actionType: ActionType) => {
    if (!step.action) return;
    onUpdate({
      ...step,
      action: {
        ...step.action,
        type: actionType,
        config: {},
      },
    });
  };

  const handleDelayValueChange = (value: number) => {
    if (!step.delay) return;
    onUpdate({
      ...step,
      delay: {
        ...step.delay,
        value,
      },
    });
  };

  const handleDelayUnitChange = (unit: 'minutes' | 'hours' | 'days') => {
    if (!step.delay) return;
    onUpdate({
      ...step,
      delay: {
        ...step.delay,
        unit,
      },
    });
  };

  const handleConfigChange = (key: string, value: string) => {
    if (!step.action) return;
    onUpdate({
      ...step,
      action: {
        ...step.action,
        config: {
          ...step.action.config,
          [key]: value,
        },
      },
    });
  };

  const ActionIcon = step.action ? actionIcons[step.action.type] : Clock;

  return (
    <Card className="relative">
      <div className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </div>
      <CardContent className="p-4 pl-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-4">
            {/* Step Type Selection */}
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="shrink-0">
                Pas {index + 1}
              </Badge>
              <Select
                value={step.type === 'condition' ? 'action' : step.type}
                onValueChange={(v) => handleTypeChange(v as 'action' | 'delay')}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="action">Acțiune</SelectItem>
                  <SelectItem value="delay">Așteptare</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Configuration */}
            {step.type === 'action' && step.action && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ActionIcon className="h-4 w-4 text-muted-foreground" />
                  <Select value={step.action.type} onValueChange={handleActionTypeChange}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {actionLabels[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action-specific config */}
                {(step.action.type === 'send_whatsapp' ||
                  step.action.type === 'send_sms' ||
                  step.action.type === 'send_email') && (
                  <div className="space-y-2">
                    <Label className="text-xs">Template</Label>
                    <Input
                      placeholder="Nume template..."
                      value={getConfigString(step.action.config, 'template')}
                      onChange={(e) => handleConfigChange('template', e.target.value)}
                    />
                    <Label className="text-xs">Mesaj (opțional)</Label>
                    <Textarea
                      placeholder="Mesaj personalizat..."
                      rows={2}
                      value={getConfigString(step.action.config, 'message')}
                      onChange={(e) => handleConfigChange('message', e.target.value)}
                    />
                  </div>
                )}

                {(step.action.type === 'add_tag' || step.action.type === 'remove_tag') && (
                  <div className="space-y-2">
                    <Label className="text-xs">Tag</Label>
                    <Input
                      placeholder="Nume tag..."
                      value={getConfigString(step.action.config, 'tag')}
                      onChange={(e) => handleConfigChange('tag', e.target.value)}
                    />
                  </div>
                )}

                {step.action.type === 'change_status' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Status Nou</Label>
                    <Select
                      value={getConfigString(step.action.config, 'status')}
                      onValueChange={(v) => handleConfigChange('status', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selectează status..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Nou</SelectItem>
                        <SelectItem value="contacted">Contactat</SelectItem>
                        <SelectItem value="qualified">Calificat</SelectItem>
                        <SelectItem value="scheduled">Programat</SelectItem>
                        <SelectItem value="completed">Finalizat</SelectItem>
                        <SelectItem value="lost">Pierdut</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {step.action.type === 'assign_to' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Atribuie către</Label>
                    <Input
                      placeholder="ID utilizator sau echipă..."
                      value={getConfigString(step.action.config, 'assignee')}
                      onChange={(e) => handleConfigChange('assignee', e.target.value)}
                    />
                  </div>
                )}

                {step.action.type === 'create_task' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Titlu Task</Label>
                    <Input
                      placeholder="Titlu task..."
                      value={getConfigString(step.action.config, 'title')}
                      onChange={(e) => handleConfigChange('title', e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Delay Configuration */}
            {step.type === 'delay' && step.delay && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Așteaptă</span>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={step.delay.value}
                  onChange={(e) => handleDelayValueChange(parseInt(e.target.value, 10) || 1)}
                />
                <Select value={step.delay.unit} onValueChange={handleDelayUnitChange}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">minute</SelectItem>
                    <SelectItem value="hours">ore</SelectItem>
                    <SelectItem value="days">zile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Button variant="ghost" size="icon" className="shrink-0 text-red-500" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function WorkflowEditor({
  workflow,
  open,
  onOpenChange,
  onSave,
  isNew = false,
}: WorkflowEditorProps) {
  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [triggerType, setTriggerType] = useState<TriggerType>(workflow?.trigger.type ?? 'new_lead');
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow?.steps ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when workflow changes
  const resetForm = useCallback(() => {
    setName(workflow?.name ?? '');
    setDescription(workflow?.description ?? '');
    setTriggerType(workflow?.trigger.type ?? 'new_lead');
    setSteps(workflow?.steps ?? []);
    setError(null);
  }, [workflow]);

  // Reset when dialog opens with new workflow
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const handleAddStep = () => {
    const newStep: WorkflowStep = {
      id: generateId(),
      type: 'action',
      action: {
        id: generateId(),
        type: 'send_whatsapp',
        config: {},
      },
    };
    setSteps([...steps, newStep]);
  };

  const handleUpdateStep = (index: number, updatedStep: WorkflowStep) => {
    setSteps(steps.map((s, i) => (i === index ? updatedStep : s)));
  };

  const handleDeleteStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError('Numele workflow-ului este obligatoriu');
      return;
    }

    if (steps.length === 0) {
      setError('Adaugă cel puțin un pas în workflow');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        id: workflow?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        trigger: {
          id: workflow?.trigger.id ?? `t-${Date.now()}`,
          type: triggerType,
        },
        steps,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A apărut o eroare la salvare');
    } finally {
      setIsSaving(false);
    }
  };

  const TriggerIcon = triggerIcons[triggerType];

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isNew ? 'Workflow Nou' : 'Editează Workflow'}</SheetTitle>
          <SheetDescription>
            {isNew
              ? 'Creează un workflow pentru automatizări'
              : 'Modifică configurația workflow-ului'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nume</Label>
              <Input
                id="name"
                placeholder="ex: Bun venit Lead Nou"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descriere (opțional)</Label>
              <Textarea
                id="description"
                placeholder="Descrie ce face acest workflow..."
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Trigger Selection */}
          <div className="space-y-4">
            <Label>Trigger (Când se activează)</Label>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((type) => {
                  const Icon = triggerIcons[type];
                  return (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {triggerLabels[type]}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
              <TriggerIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-sm">{triggerLabels[triggerType]}</div>
                <div className="text-xs text-muted-foreground">
                  {triggerDescriptions[triggerType]}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Pași Workflow</Label>
              <Badge variant="secondary">{steps.length} pași</Badge>
            </div>

            {steps.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed rounded-lg">
                <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nu există pași adăugați</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={handleAddStep}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adaugă Primul Pas
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    index={index}
                    onUpdate={(s) => handleUpdateStep(index, s)}
                    onDelete={() => handleDeleteStep(index)}
                  />
                ))}
                <Button variant="outline" className="w-full" onClick={handleAddStep}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adaugă Pas
                </Button>
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Anulează
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Se salvează...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isNew ? 'Creează' : 'Salvează'}
                </>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
