import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { useState } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  ArrowDown,
  Calendar,
} from 'lucide-react';

type TriggerType =
  | 'new_lead'
  | 'appointment_scheduled'
  | 'appointment_completed'
  | 'no_response'
  | 'message_received'
  | 'tag_added'
  | 'status_changed';

type ActionType =
  | 'send_whatsapp'
  | 'send_sms'
  | 'send_email'
  | 'add_tag'
  | 'remove_tag'
  | 'change_status'
  | 'assign_to'
  | 'create_task';

interface WorkflowStep {
  id: string;
  type: 'action' | 'delay' | 'condition';
  action?: {
    type: ActionType;
  };
  delay?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
}

const triggerOptions: { value: TriggerType; label: string; icon: React.ElementType }[] = [
  { value: 'new_lead', label: 'Lead Nou', icon: Users },
  { value: 'appointment_scheduled', label: 'Programare Creată', icon: Calendar },
  { value: 'appointment_completed', label: 'Programare Finalizată', icon: CheckCircle2 },
  { value: 'message_received', label: 'Mesaj Primit', icon: MessageSquare },
  { value: 'tag_added', label: 'Tag Adăugat', icon: Tag },
];

const actionOptions: { value: ActionType; label: string; icon: React.ElementType }[] = [
  { value: 'send_whatsapp', label: 'Trimite WhatsApp', icon: MessageSquare },
  { value: 'send_sms', label: 'Trimite SMS', icon: MessageSquare },
  { value: 'send_email', label: 'Trimite Email', icon: Mail },
  { value: 'add_tag', label: 'Adaugă Tag', icon: Tag },
  { value: 'create_task', label: 'Creează Task', icon: CheckCircle2 },
];

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

interface WorkflowEditorDemoProps {
  isOpen?: boolean;
  isNew?: boolean;
  workflowName?: string;
  triggerType?: TriggerType;
  steps?: WorkflowStep[];
}

function WorkflowEditorDemo({
  isOpen = true,
  isNew = true,
  workflowName = '',
  triggerType = 'new_lead',
  steps: initialSteps = [],
}: WorkflowEditorDemoProps) {
  const [open, setOpen] = useState(isOpen);
  const [name, setName] = useState(workflowName);
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState<TriggerType>(triggerType);
  const [steps, setSteps] = useState<WorkflowStep[]>(initialSteps);

  const selectedTrigger = triggerOptions.find((t) => t.value === trigger);
  const TriggerIcon = selectedTrigger?.icon ?? Zap;

  const handleAddStep = () => {
    const newStep: WorkflowStep = {
      id: generateId(),
      type: 'action',
      action: { type: 'send_whatsapp' },
    };
    setSteps([...steps, newStep]);
  };

  const handleDeleteStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
                      <Select value={trigger} onValueChange={(v) => setTrigger(v as TriggerType)}>
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
                      <Card>
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center">
                              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-xs font-medium">
                                {index + 1}
                              </div>
                              <GripVertical className="h-4 w-4 text-muted-foreground mt-1 cursor-grab" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <Select
                                  value={step.type}
                                  onValueChange={(type) => {
                                    const newSteps = [...steps];
                                    newSteps[index] = {
                                      ...step,
                                      type: type as 'action' | 'delay',
                                    };
                                    setSteps(newSteps);
                                  }}
                                >
                                  <SelectTrigger className="w-[150px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="action">Acțiune</SelectItem>
                                    <SelectItem value="delay">Așteptare</SelectItem>
                                  </SelectContent>
                                </Select>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteStep(index)}
                                  className="h-8 w-8 text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              {step.type === 'action' && (
                                <div className="mt-3 space-y-2">
                                  <Label>Tip Acțiune</Label>
                                  <Select defaultValue={step.action?.type ?? 'send_whatsapp'}>
                                    <SelectTrigger>
                                      <SelectValue />
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
                              )}

                              {step.type === 'delay' && (
                                <div className="mt-3 flex gap-2">
                                  <div className="flex-1 space-y-2">
                                    <Label>Durată</Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      defaultValue={step.delay?.value ?? 1}
                                    />
                                  </div>
                                  <div className="flex-1 space-y-2">
                                    <Label>Unitate</Label>
                                    <Select defaultValue={step.delay?.unit ?? 'hours'}>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="minutes">Minute</SelectItem>
                                        <SelectItem value="hours">Ore</SelectItem>
                                        <SelectItem value="days">Zile</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Anulează
          </Button>
          <Button disabled={!name.trim()}>
            {isNew ? 'Creează Workflow' : 'Salvează Modificările'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  title: 'Workflows/WorkflowEditor',
  component: WorkflowEditorDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof WorkflowEditorDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewWorkflow: Story = {
  args: {
    isOpen: true,
    isNew: true,
  },
};

export const EditWorkflow: Story = {
  args: {
    isOpen: true,
    isNew: false,
    workflowName: 'Follow-up Lead Nou',
    triggerType: 'new_lead',
    steps: [
      { id: '1', type: 'delay', delay: { value: 5, unit: 'minutes' } },
      { id: '2', type: 'action', action: { type: 'send_whatsapp' } },
    ],
  },
};

export const WithManySteps: Story = {
  args: {
    isOpen: true,
    isNew: false,
    workflowName: 'Nurturing Campaign',
    triggerType: 'message_received',
    steps: [
      { id: '1', type: 'action', action: { type: 'add_tag' } },
      { id: '2', type: 'delay', delay: { value: 1, unit: 'hours' } },
      { id: '3', type: 'action', action: { type: 'send_whatsapp' } },
      { id: '4', type: 'delay', delay: { value: 24, unit: 'hours' } },
      { id: '5', type: 'action', action: { type: 'send_email' } },
    ],
  },
};

export const EmptySteps: Story = {
  args: {
    isOpen: true,
    isNew: true,
    workflowName: 'New Workflow',
    triggerType: 'appointment_scheduled',
    steps: [],
  },
};
