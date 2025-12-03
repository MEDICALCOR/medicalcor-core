'use client';

import { memo, useCallback } from 'react';
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
  Pencil,
  Trash2,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { type Workflow, triggerLabels, type TriggerType, type WorkflowStep } from '@/lib/workflows';

interface WorkflowListProps {
  workflows: Workflow[];
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: (workflow: Workflow) => void;
  onDelete: (id: string) => void;
  onDuplicate: (workflow: Workflow) => void;
}

interface WorkflowItemProps {
  workflow: Workflow;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: (workflow: Workflow) => void;
  onDelete: (id: string) => void;
  onDuplicate: (workflow: Workflow) => void;
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

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `acum ${diffMins} min`;
  if (diffHours < 24) return `acum ${diffHours} ore`;
  if (diffDays < 7) return `acum ${diffDays} zile`;
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Get action icon and label for a step */
function getActionDisplay(actionType: string | undefined): {
  icon: React.ElementType;
  label: string;
} {
  switch (actionType) {
    case 'send_whatsapp':
      return { icon: MessageSquare, label: 'WhatsApp' };
    case 'send_sms':
      return { icon: MessageSquare, label: 'SMS' };
    case 'send_email':
      return { icon: Mail, label: 'Email' };
    case 'add_tag':
      return { icon: Tag, label: 'Tag' };
    case 'create_task':
      return { icon: CheckCircle2, label: 'Task' };
    case undefined:
    default:
      return { icon: Zap, label: 'Action' };
  }
}

/** Get delay unit label */
function getDelayLabel(unit: string | undefined): string {
  switch (unit) {
    case 'minutes':
      return 'm';
    case 'hours':
      return 'h';
    case 'days':
      return 'z';
    case undefined:
    default:
      return '';
  }
}

/** Workflow step preview badge */
function StepBadge({ step }: { step: WorkflowStep }) {
  if (step.type === 'delay') {
    return (
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {step.delay?.value}
        {getDelayLabel(step.delay?.unit)}
      </span>
    );
  }
  if (step.type === 'condition') {
    return (
      <span className="flex items-center gap-1">
        <AlertCircle className="h-3 w-3" /> Condiție
      </span>
    );
  }
  const { icon: ActionIcon, label } = getActionDisplay(step.action?.type);
  return (
    <span className="flex items-center gap-1">
      <ActionIcon className="h-3 w-3" /> {label}
    </span>
  );
}

/** Workflow steps preview component */
function WorkflowStepsPreview({
  workflow,
  TriggerIcon,
}: {
  workflow: Workflow;
  TriggerIcon: React.ElementType;
}) {
  return (
    <div className="mt-4 flex items-center gap-2 overflow-x-auto py-2">
      <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded text-xs font-medium text-primary shrink-0">
        <TriggerIcon className="h-3 w-3" />
        {triggerLabels[workflow.trigger.type]}
      </div>
      {workflow.steps.slice(0, 4).map((step) => (
        <div key={step.id} className="flex items-center gap-2 shrink-0">
          <div className="w-6 border-t border-dashed border-muted-foreground/30" />
          <div className="px-2 py-1 bg-muted rounded text-xs">
            <StepBadge step={step} />
          </div>
        </div>
      ))}
      {workflow.steps.length > 4 && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 border-t border-dashed border-muted-foreground/30" />
          <span className="text-xs text-muted-foreground">+{workflow.steps.length - 4} pași</span>
        </div>
      )}
    </div>
  );
}

/** Memoized WorkflowItem component - prevents re-render when siblings change */
const WorkflowItem = memo(function WorkflowItem({
  workflow,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
}: WorkflowItemProps) {
  const TriggerIcon = triggerIcons[workflow.trigger.type];
  const handleToggle = useCallback(
    (checked: boolean) => onToggle(workflow.id, checked),
    [onToggle, workflow.id]
  );
  const handleEdit = useCallback(() => onEdit(workflow), [onEdit, workflow]);
  const handleDuplicate = useCallback(() => onDuplicate(workflow), [onDuplicate, workflow]);
  const handleDelete = useCallback(() => onDelete(workflow.id), [onDelete, workflow.id]);

  return (
    <Card className={cn('transition-all', !workflow.isActive && 'opacity-60')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                workflow.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}
            >
              <TriggerIcon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {workflow.name}
                <Badge
                  variant="secondary"
                  className={cn('text-[10px]', workflow.isActive && 'bg-green-100 text-green-700')}
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
            <Switch checked={workflow.isActive} onCheckedChange={handleToggle} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editează
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplică
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Șterge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        <WorkflowStepsPreview workflow={workflow} TriggerIcon={TriggerIcon} />
      </CardContent>
    </Card>
  );
});

export function WorkflowList({
  workflows,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
}: WorkflowListProps) {
  return (
    <div className="space-y-4">
      {workflows.map((workflow) => (
        <WorkflowItem
          key={workflow.id}
          workflow={workflow}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      ))}

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
