import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import {
  Play,
  Pause,
  MoreVertical,
  Zap,
  Clock,
  CheckCircle2,
  Calendar,
  MessageSquare,
  Mail,
  Tag,
  Users,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type TriggerType =
  | 'new_lead'
  | 'appointment_scheduled'
  | 'appointment_completed'
  | 'no_response'
  | 'message_received'
  | 'tag_added'
  | 'status_changed';

interface WorkflowStep {
  id: string;
  type: 'action' | 'delay' | 'condition';
  action?: {
    type: string;
  };
  delay?: {
    value: number;
    unit: string;
  };
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger: {
    type: TriggerType;
  };
  steps: WorkflowStep[];
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: Date;
}

const triggerLabels: Record<TriggerType, string> = {
  new_lead: 'Lead Nou',
  appointment_scheduled: 'Programare Creată',
  appointment_completed: 'Programare Finalizată',
  no_response: 'Fără Răspuns',
  message_received: 'Mesaj Primit',
  tag_added: 'Tag Adăugat',
  status_changed: 'Status Schimbat',
};

const triggerIcons: Record<TriggerType, React.ElementType> = {
  new_lead: Users,
  appointment_scheduled: Calendar,
  appointment_completed: CheckCircle2,
  no_response: AlertCircle,
  message_received: MessageSquare,
  tag_added: Tag,
  status_changed: Zap,
};

const sampleWorkflows: Workflow[] = [
  {
    id: '1',
    name: 'Follow-up Lead Nou',
    description: 'Trimite mesaj automat când un lead nou este adăugat',
    trigger: { type: 'new_lead' },
    steps: [
      { id: 's1', type: 'delay', delay: { value: 5, unit: 'minutes' } },
      { id: 's2', type: 'action', action: { type: 'send_whatsapp' } },
      { id: 's3', type: 'delay', delay: { value: 24, unit: 'hours' } },
      { id: 's4', type: 'action', action: { type: 'send_whatsapp' } },
    ],
    isActive: true,
    executionCount: 156,
    lastExecutedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '2',
    name: 'Reminder Programare',
    description: 'Trimite reminder cu o zi înainte de programare',
    trigger: { type: 'appointment_scheduled' },
    steps: [
      { id: 's1', type: 'delay', delay: { value: 1, unit: 'days' } },
      { id: 's2', type: 'action', action: { type: 'send_sms' } },
    ],
    isActive: true,
    executionCount: 89,
    lastExecutedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
  {
    id: '3',
    name: 'Re-engagement Lead Rece',
    description: 'Contactează lead-urile care nu au răspuns',
    trigger: { type: 'no_response' },
    steps: [
      { id: 's1', type: 'action', action: { type: 'add_tag' } },
      { id: 's2', type: 'delay', delay: { value: 3, unit: 'days' } },
      { id: 's3', type: 'action', action: { type: 'send_email' } },
    ],
    isActive: false,
    executionCount: 23,
  },
];

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 24) return `acum ${diffHours} ore`;
  if (diffDays < 7) return `acum ${diffDays} zile`;
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

function getActionIcon(actionType: string | undefined): React.ElementType {
  switch (actionType) {
    case 'send_whatsapp':
    case 'send_sms':
      return MessageSquare;
    case 'send_email':
      return Mail;
    case 'add_tag':
      return Tag;
    default:
      return Zap;
  }
}

interface WorkflowListDemoProps {
  workflows?: Workflow[];
  onToggle?: (id: string, isActive: boolean) => void;
  onEdit?: (workflow: Workflow) => void;
  onDelete?: (id: string) => void;
}

function WorkflowListDemo({
  workflows = sampleWorkflows,
  onToggle,
  onEdit,
  onDelete,
}: WorkflowListDemoProps) {
  return (
    <div className="space-y-4 w-full max-w-3xl">
      {workflows.map((workflow) => {
        const TriggerIcon = triggerIcons[workflow.trigger.type];

        return (
          <Card
            key={workflow.id}
            className={cn('transition-all', !workflow.isActive && 'opacity-60')}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      workflow.isActive
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <TriggerIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {workflow.name}
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px]',
                          workflow.isActive && 'bg-green-100 text-green-700'
                        )}
                      >
                        {workflow.isActive ? (
                          <>
                            <Play className="h-2.5 w-2.5 mr-0.5" />
                            Activ
                          </>
                        ) : (
                          <>
                            <Pause className="h-2.5 w-2.5 mr-0.5" />
                            Inactiv
                          </>
                        )}
                      </Badge>
                    </CardTitle>
                    {workflow.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{workflow.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={workflow.isActive}
                    onCheckedChange={(checked) => onToggle?.(workflow.id, checked)}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Zap className="h-4 w-4" />
                    <span>Trigger: {triggerLabels[workflow.trigger.type]}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{workflow.steps.length} pași</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Play className="h-3 w-3" />
                    <span>{workflow.executionCount} execuții</span>
                  </div>
                  {workflow.lastExecutedAt && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Ultima: {formatRelativeTime(workflow.lastExecutedAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Steps preview */}
              <div className="mt-4 flex items-center gap-2 overflow-x-auto py-2">
                <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded text-xs font-medium text-primary shrink-0">
                  <TriggerIcon className="h-3 w-3" />
                  {triggerLabels[workflow.trigger.type]}
                </div>
                {workflow.steps.slice(0, 4).map((step) => {
                  const ActionIcon =
                    step.type === 'delay' ? Clock : getActionIcon(step.action?.type);
                  return (
                    <div key={step.id} className="flex items-center gap-2 shrink-0">
                      <div className="w-6 border-t border-dashed border-muted-foreground/30" />
                      <div className="px-2 py-1 bg-muted rounded text-xs flex items-center gap-1">
                        <ActionIcon className="h-3 w-3" />
                        {step.type === 'delay' && `${step.delay?.value}${step.delay?.unit?.[0]}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {workflows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-medium mb-1">Nu există workflow-uri</h3>
            <p className="text-sm text-muted-foreground">
              Creează primul workflow pentru a automatiza procesele
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const meta = {
  title: 'Workflows/WorkflowList',
  component: WorkflowListDemo,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onToggle: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof WorkflowListDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    workflows: sampleWorkflows,
  },
};

export const Empty: Story = {
  args: {
    workflows: [],
  },
};

export const AllActive: Story = {
  args: {
    workflows: sampleWorkflows.map((w) => ({ ...w, isActive: true })),
  },
};

export const AllInactive: Story = {
  args: {
    workflows: sampleWorkflows.map((w) => ({ ...w, isActive: false })),
  },
};

export const SingleWorkflow: Story = {
  args: {
    workflows: [sampleWorkflows[0]],
  },
};
