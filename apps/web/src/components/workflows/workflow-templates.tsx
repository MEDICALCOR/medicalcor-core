'use client';

import {
  Users,
  Calendar,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Tag,
  Zap,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type WorkflowTemplate, triggerLabels, type TriggerType } from '@/lib/workflows';

interface WorkflowTemplatesProps {
  templates: WorkflowTemplate[];
  onUseTemplate: (template: WorkflowTemplate) => void;
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

const categoryColors: Record<string, string> = {
  'Lead Management': 'bg-blue-100 text-blue-700',
  'Patient Care': 'bg-green-100 text-green-700',
  Appointments: 'bg-purple-100 text-purple-700',
};

export function WorkflowTemplates({ templates, onUseTemplate }: WorkflowTemplatesProps) {
  // Group templates by category
  const groupedTemplates = templates.reduce<Record<string, WorkflowTemplate[]>>((acc, template) => {
    const category = template.category;
    if (Object.hasOwn(acc, category)) {
      acc[category].push(template);
    } else {
      acc[category] = [template];
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Badge variant="secondary" className={cn('text-[10px]', categoryColors[category])}>
              {category}
            </Badge>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categoryTemplates.map((template) => {
              const TriggerIcon = triggerIcons[template.trigger.type];

              return (
                <Card key={template.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <TriggerIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {template.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Zap className="h-3 w-3" />
                        <span>{triggerLabels[template.trigger.type]}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>{template.steps.length} pași</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUseTemplate(template)}
                        className="h-7"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Folosește
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
