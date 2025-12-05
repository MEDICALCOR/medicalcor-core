'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  AlertCircle,
  Zap,
  ArrowDown,
  Loader2,
  Calendar,
} from 'lucide-react';
import type { Workflow, WorkflowStep, TriggerType, ActionType } from '@/lib/workflows/types';

// =============================================================================
// Utilities
// =============================================================================

/** Simple ID generator for step IDs */
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// =============================================================================
// Constants
// =============================================================================

const triggerOptions: { value: TriggerType; label: string; icon: React.ElementType }[] = [
  { value: 'new_lead', label: 'Lead Nou', icon: Users },
  { value: 'appointment_scheduled', label: 'Programare Creată', icon: Calendar },
  { value: 'appointment_completed', label: 'Programare Finalizată', icon: CheckCircle2 },
  { value: 'no_response', label: 'Fără Răspuns', icon: AlertCircle },
  { value: 'message_received', label: 'Mesaj Primit', icon: MessageSquare },
  { value: 'tag_added', label: 'Tag Adăugat', icon: Tag },
  { value: 'status_changed', label: 'Status Schimbat', icon: Zap },
];

const actionOptions: { value: ActionType; label: string; icon: React.ElementType }[] = [
  { value: 'send_whatsapp', label: 'Trimite WhatsApp', icon: MessageSquare },
  { value: 'send_sms', label: 'Trimite SMS', icon: MessageSquare },
  { value: 'send_email', label: 'Trimite Email', icon: Mail },
  { value: 'add_tag', label: 'Adaugă Tag', icon: Tag },
  { value: 'remove_tag', label: 'Elimină Tag', icon: Tag },
  { value: 'change_status', label: 'Schimbă Status', icon: Zap },
  { value: 'assign_to', label: 'Atribuie Agentului', icon: Users },
  { value: 'create_task', label: 'Creează Task', icon: CheckCircle2 },
];

const delayUnits = [
  { value: 'minutes', label: 'Minute' },
  { value: 'hours', label: 'Ore' },
  { value: 'days', label: 'Zile' },
] as const;

// =============================================================================
// Types
// =============================================================================

export interface WorkflowEditorProps {
  workflow: Workflow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (workflow: WorkflowFormData) => void | Promise<void>;
  isCreating?: boolean;
}

export interface WorkflowFormData {
  id?: string;
  name: string;
  description?: string;
  triggerType: TriggerType;
  triggerConfig?: Record<string, unknown>;
  steps: WorkflowStep[];
  isActive: boolean;
}

// =============================================================================
// Step Editor Components
// =============================================================================

interface StepEditorProps {
  step: WorkflowStep;
  index: number;
  onUpdate: (step: WorkflowStep) => void;
  onDelete: () => void;
}

function ActionStepEditor({
  step,
  onUpdate,
}: {
  step: WorkflowStep;
  onUpdate: (step: WorkflowStep) => void;
}) {
  const action = step.action;
  if (!action) return null;

  const selectedAction = actionOptions.find((a) => a.value === action.type);
  const ActionIcon = selectedAction?.icon ?? Zap;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <ActionIcon className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">{selectedAction?.label ?? 'Acțiune'}</span>
      </div>

      <div className="space-y-2">
        <Label>Tip Acțiune</Label>
        <Select
          value={action.type}
          onValueChange={(value: ActionType) => {
            onUpdate({
              ...step,
              action: { ...action, type: value, config: {} },
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selectează acțiunea" />
          </SelectTrigger>
          <SelectContent>
            {actionOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  <opt.icon className="h-4 w-4" />
                  {opt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Action-specific config */}
      {(action.type === 'send_whatsapp' ||
        action.type === 'send_sms' ||
        action.type === 'send_email') && (
        <div className="space-y-2">
          <Label>Mesaj / Template</Label>
          <Textarea
            placeholder="Introdu mesajul sau ID-ul template-ului..."
            value={typeof action.config.message === 'string' ? action.config.message : ''}
            onChange={(e) => {
              onUpdate({
                ...step,
                action: { ...action, config: { ...action.config, message: e.target.value } },
              });
            }}
            className="min-h-[80px]"
          />
        </div>
      )}

      {(action.type === 'add_tag' || action.type === 'remove_tag') && (
        <div className="space-y-2">
          <Label>Nume Tag</Label>
          <Input
            placeholder="Ex: follow-up, interesat, programat"
            value={typeof action.config.tagName === 'string' ? action.config.tagName : ''}
            onChange={(e) => {
              onUpdate({
                ...step,
                action: { ...action, config: { ...action.config, tagName: e.target.value } },
              });
            }}
          />
        </div>
      )}

      {action.type === 'change_status' && (
        <div className="space-y-2">
          <Label>Status Nou</Label>
          <Select
            value={typeof action.config.status === 'string' ? action.config.status : ''}
            onValueChange={(value) => {
              onUpdate({
                ...step,
                action: { ...action, config: { ...action.config, status: value } },
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selectează status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Nou</SelectItem>
              <SelectItem value="contacted">Contactat</SelectItem>
              <SelectItem value="qualified">Calificat</SelectItem>
              <SelectItem value="scheduled">Programat</SelectItem>
              <SelectItem value="converted">Convertit</SelectItem>
              <SelectItem value="lost">Pierdut</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {action.type === 'create_task' && (
        <div className="space-y-2">
          <Label>Descriere Task</Label>
          <Input
            placeholder="Ex: Sună clientul pentru confirmare"
            value={
              typeof action.config.taskDescription === 'string' ? action.config.taskDescription : ''
            }
            onChange={(e) => {
              onUpdate({
                ...step,
                action: {
                  ...action,
                  config: { ...action.config, taskDescription: e.target.value },
                },
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

function DelayStepEditor({
  step,
  onUpdate,
}: {
  step: WorkflowStep;
  onUpdate: (step: WorkflowStep) => void;
}) {
  const delay = step.delay ?? { value: 1, unit: 'hours' as const };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-amber-500" />
        <span className="font-medium text-sm">Așteptare</span>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-2">
          <Label>Durată</Label>
          <Input
            type="number"
            min={1}
            value={delay.value}
            onChange={(e) => {
              onUpdate({
                ...step,
                delay: { ...delay, value: Math.max(1, parseInt(e.target.value) || 1) },
              });
            }}
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label>Unitate</Label>
          <Select
            value={delay.unit}
            onValueChange={(value: 'minutes' | 'hours' | 'days') => {
              onUpdate({
                ...step,
                delay: { ...delay, unit: value },
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {delayUnits.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function StepEditor({ step, index, onUpdate, onDelete }: StepEditorProps) {
  return (
    <Card className="relative">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-xs font-medium">
              {index + 1}
            </div>
            <GripVertical className="h-4 w-4 text-muted-foreground mt-1 cursor-grab" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <Select
                value={step.type}
                onValueChange={(type: 'action' | 'delay' | 'condition') => {
                  const newStep: WorkflowStep = { ...step, type };
                  if (type === 'action' && !step.action) {
                    newStep.action = {
                      id: generateId(),
                      type: 'send_whatsapp',
                      config: {},
                    };
                    delete newStep.delay;
                    delete newStep.condition;
                  } else if (type === 'delay' && !step.delay) {
                    newStep.delay = { value: 1, unit: 'hours' };
                    delete newStep.action;
                    delete newStep.condition;
                  } else if (type === 'condition' && !step.condition) {
                    newStep.condition = {
                      conditions: [{ id: generateId(), field: '', operator: 'equals', value: '' }],
                      logic: 'and',
                    };
                    delete newStep.action;
                    delete newStep.delay;
                  }
                  onUpdate(newStep);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="action">Acțiune</SelectItem>
                  <SelectItem value="delay">Așteptare</SelectItem>
                  <SelectItem value="condition">Condiție</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="h-8 w-8 text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {step.type === 'action' && <ActionStepEditor step={step} onUpdate={onUpdate} />}
            {step.type === 'delay' && <DelayStepEditor step={step} onUpdate={onUpdate} />}
            {step.type === 'condition' && (
              <div className="text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Editor de condiții va fi adăugat în curând
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function WorkflowEditor({
  workflow,
  open,
  onOpenChange,
  onSave,
  isCreating = false,
}: WorkflowEditorProps) {
  const isNew = !workflow;

  // Form state
  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [triggerType, setTriggerType] = useState<TriggerType>(workflow?.trigger.type ?? 'new_lead');
  const [steps, setSteps] = useState<WorkflowStep[]>(workflow?.steps ?? []);
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when workflow changes
  useMemo(() => {
    if (open) {
      setName(workflow?.name ?? '');
      setDescription(workflow?.description ?? '');
      setTriggerType(workflow?.trigger.type ?? 'new_lead');
      setSteps(workflow?.steps ?? []);
    }
  }, [workflow, open]);

  const handleAddStep = useCallback(() => {
    const newStep: WorkflowStep = {
      id: generateId(),
      type: 'action',
      action: {
        id: generateId(),
        type: 'send_whatsapp',
        config: {},
      },
    };
    setSteps((prev) => [...prev, newStep]);
  }, []);

  const handleUpdateStep = useCallback((index: number, updatedStep: WorkflowStep) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? updatedStep : s)));
  }, []);

  const handleDeleteStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const formData: WorkflowFormData = {
        id: workflow?.id,
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        steps,
        isActive: workflow?.isActive ?? false,
      };
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      // Error handled by parent
      console.error('[workflow-editor] Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [workflow, name, description, triggerType, steps, onSave, onOpenChange]);

  const selectedTrigger = triggerOptions.find((t) => t.value === triggerType);
  const TriggerIcon = selectedTrigger?.icon ?? Zap;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Creează Workflow Nou' : 'Editează Workflow'}</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'Configurează un nou workflow pentru automatizare.'
              : 'Modifică setările și pașii workflow-ului.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 -mx-6 px-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-6 pb-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nume Workflow *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Follow-up Lead Nou"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descriere</Label>
                <Textarea
                  id="description"
                  placeholder="Descrie scopul acestui workflow..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
            </div>

            {/* Trigger */}
            <div className="space-y-3">
              <Label>Trigger (Declanșator)</Label>
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <TriggerIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <Select
                        value={triggerType}
                        onValueChange={(value: TriggerType) => setTriggerType(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selectează triggerul" />
                        </SelectTrigger>
                        <SelectContent>
                          {triggerOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <opt.icon className="h-4 w-4" />
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Pași Workflow ({steps.length})</Label>
                <Button variant="outline" size="sm" onClick={handleAddStep}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adaugă Pas
                </Button>
              </div>

              {steps.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center">
                    <Zap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Nu există pași definiți</p>
                    <Button variant="ghost" size="sm" onClick={handleAddStep} className="mt-2">
                      <Plus className="h-4 w-4 mr-1" />
                      Adaugă primul pas
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {steps.map((step, index) => (
                    <div key={step.id}>
                      {index > 0 && (
                        <div className="flex justify-center py-1">
                          <ArrowDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <StepEditor
                        step={step}
                        index={index}
                        onUpdate={(s) => handleUpdateStep(index, s)}
                        onDelete={() => handleDeleteStep(index)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Anulează
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving || isCreating}>
            {isSaving || isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Se salvează...
              </>
            ) : isNew ? (
              'Creează Workflow'
            ) : (
              'Salvează Modificările'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
