'use client';

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
import { type Workflow, triggerLabels, type TriggerType } from '@/lib/workflows';

interface WorkflowListProps {
  workflows: Workflow[];
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

function formatDate(date: Date): string {
  return date.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `acum ${diffMins} min`;
  if (diffHours < 24) return `acum ${diffHours} ore`;
  if (diffDays < 7) return `acum ${diffDays} zile`;
  return formatDate(date);
}

export function WorkflowList({
  workflows,
  onToggle,
  onEdit,
  onDelete,
  onDuplicate,
}: WorkflowListProps) {
  return (
    <div className="space-y-4">
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
                      {workflow.isActive ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-700 text-[10px]"
                        >
                          <Play className="h-2.5 w-2.5 mr-0.5" />
                          Activ
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          <Pause className="h-2.5 w-2.5 mr-0.5" />
                          Inactiv
                        </Badge>
                      )}
                    </CardTitle>
                    {workflow.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{workflow.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={workflow.isActive}
                    onCheckedChange={(checked: boolean) => onToggle(workflow.id, checked)}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(workflow)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editează
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(workflow)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplică
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(workflow.id)}
                        className="text-red-600"
                      >
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

              {/* Visual workflow steps preview */}
              <div className="mt-4 flex items-center gap-2 overflow-x-auto py-2">
                <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded text-xs font-medium text-primary shrink-0">
                  <TriggerIcon className="h-3 w-3" />
                  {triggerLabels[workflow.trigger.type]}
                </div>
                {workflow.steps.slice(0, 4).map((step) => (
                  <div key={step.id} className="flex items-center gap-2 shrink-0">
                    <div className="w-6 border-t border-dashed border-muted-foreground/30" />
                    <div className="px-2 py-1 bg-muted rounded text-xs">
                      {step.type === 'delay' && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {step.delay?.value}
                          {step.delay?.unit === 'minutes' && 'm'}
                          {step.delay?.unit === 'hours' && 'h'}
                          {step.delay?.unit === 'days' && 'z'}
                        </span>
                      )}
                      {step.type === 'action' && (
                        <span className="flex items-center gap-1">
                          {step.action?.type === 'send_whatsapp' && (
                            <>
                              <MessageSquare className="h-3 w-3" /> WhatsApp
                            </>
                          )}
                          {step.action?.type === 'send_sms' && (
                            <>
                              <MessageSquare className="h-3 w-3" /> SMS
                            </>
                          )}
                          {step.action?.type === 'send_email' && (
                            <>
                              <Mail className="h-3 w-3" /> Email
                            </>
                          )}
                          {step.action?.type === 'add_tag' && (
                            <>
                              <Tag className="h-3 w-3" /> Tag
                            </>
                          )}
                          {step.action?.type === 'create_task' && (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> Task
                            </>
                          )}
                        </span>
                      )}
                      {step.type === 'condition' && (
                        <span className="flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> Condiție
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {workflow.steps.length > 4 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-6 border-t border-dashed border-muted-foreground/30" />
                    <span className="text-xs text-muted-foreground">
                      +{workflow.steps.length - 4} pași
                    </span>
                  </div>
                )}
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
