'use client';

import { useState, useCallback, useEffect, useTransition } from 'react';
import { Plus, Zap, LayoutTemplate, List, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowList, WorkflowTemplates } from '@/components/workflows';
import {
  getWorkflowsAction,
  getWorkflowTemplatesAction,
  toggleWorkflowAction,
  deleteWorkflowAction,
  duplicateWorkflowAction,
  createWorkflowFromTemplateAction,
  type Workflow,
  type WorkflowTemplate,
} from '@/app/actions/workflows';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

function WorkflowsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [activeTab, setActiveTab] = useState('workflows');
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [isLoadingWorkflows, startWorkflowsTransition] = useTransition();
  const [isLoadingTemplates, startTemplatesTransition] = useTransition();
  const [isCreating, startCreatingTransition] = useTransition();

  // Fetch workflows on mount
  useEffect(() => {
    startWorkflowsTransition(async () => {
      try {
        const fetchedWorkflows = await getWorkflowsAction();
        setWorkflows(fetchedWorkflows);
      } catch (error) {
        console.error('[Workflows] Failed to fetch workflows:', error);
      }
    });
  }, []);

  // Fetch templates when templates tab is activated
  useEffect(() => {
    if (activeTab === 'templates' && templates.length === 0) {
      startTemplatesTransition(async () => {
        try {
          const fetchedTemplates = await getWorkflowTemplatesAction();
          setTemplates(fetchedTemplates);
        } catch (error) {
          console.error('[Workflows] Failed to fetch templates:', error);
        }
      });
    }
  }, [activeTab, templates.length]);

  const handleToggle = useCallback((id: string, isActive: boolean) => {
    // Optimistic update
    setWorkflows((prev) => prev.map((wf) => (wf.id === id ? { ...wf, isActive } : wf)));

    // Server update
    toggleWorkflowAction(id, isActive).catch((error) => {
      console.error('[Workflows] Failed to toggle workflow:', error);
      // Revert on error
      setWorkflows((prev) => prev.map((wf) => (wf.id === id ? { ...wf, isActive: !isActive } : wf)));
    });
  }, []);

  const handleEdit = useCallback((_workflow: Workflow) => {
    // TODO: Implement workflow editor
    // For now, this is a placeholder
  }, []);

  const handleDelete = useCallback((id: string) => {
    // Optimistic update
    setWorkflows((prev) => prev.filter((wf) => wf.id !== id));

    // Server delete
    deleteWorkflowAction(id).catch((error) => {
      console.error('[Workflows] Failed to delete workflow:', error);
      // Refetch on error
      getWorkflowsAction().then(setWorkflows);
    });
  }, []);

  const handleDuplicate = useCallback((workflow: Workflow) => {
    duplicateWorkflowAction(workflow.id)
      .then((duplicated) => {
        setWorkflows((prev) => [duplicated, ...prev]);
      })
      .catch((error) => {
        console.error('[Workflows] Failed to duplicate workflow:', error);
      });
  }, []);

  const handleUseTemplate = useCallback((template: WorkflowTemplate) => {
    setSelectedTemplate(template);
  }, []);

  const handleCreateFromTemplate = useCallback(() => {
    if (!selectedTemplate) return;

    startCreatingTransition(async () => {
      try {
        const newWorkflow = await createWorkflowFromTemplateAction(selectedTemplate.id);
        setWorkflows((prev) => [newWorkflow, ...prev]);
        setSelectedTemplate(null);
        setActiveTab('workflows');
      } catch (error) {
        console.error('[Workflows] Failed to create from template:', error);
      }
    });
  }, [selectedTemplate]);

  const activeCount = workflows.filter((w) => w.isActive).length;
  const totalExecutions = workflows.reduce((sum, w) => sum + w.executionCount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Workflow Automation
          </h1>
          <p className="text-muted-foreground mt-1">Automatizează procesele și follow-up-urile</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Workflow Nou
        </Button>
      </div>

      {/* Stats */}
      {isLoadingWorkflows && workflows.length === 0 ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Total Workflow-uri</div>
            <div className="text-2xl font-bold mt-1">{workflows.length}</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold mt-1 text-green-600">{activeCount}</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Total Execuții</div>
            <div className="text-2xl font-bold mt-1">{totalExecutions.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="workflows" className="gap-2">
            <List className="h-4 w-4" />
            Workflow-uri ({workflows.length})
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <LayoutTemplate className="h-4 w-4" />
            Template-uri
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="mt-6">
          {isLoadingWorkflows && workflows.length === 0 ? (
            <WorkflowsSkeleton />
          ) : workflows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Nu există workflow-uri</p>
              <p className="text-sm mt-1">Creează primul workflow sau folosește un template</p>
              <Button className="mt-4" onClick={() => setActiveTab('templates')}>
                <LayoutTemplate className="h-4 w-4 mr-2" />
                Vezi Template-uri
              </Button>
            </div>
          ) : (
            <WorkflowList
              workflows={workflows}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          )}
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          {isLoadingTemplates && templates.length === 0 ? (
            <WorkflowsSkeleton />
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <LayoutTemplate className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Nu există template-uri</p>
              <p className="text-sm mt-1">Template-urile vor apărea aici după inițializarea bazei de date</p>
            </div>
          ) : (
            <WorkflowTemplates templates={templates} onUseTemplate={handleUseTemplate} />
          )}
        </TabsContent>
      </Tabs>

      {/* Template Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Creează Workflow din Template</DialogTitle>
            <DialogDescription>
              Vei crea un nou workflow bazat pe template-ul selectat.
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="font-medium">{selectedTemplate.name}</div>
                <p className="text-sm text-muted-foreground mt-1">{selectedTemplate.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="secondary">{selectedTemplate.category}</Badge>
                  <Badge variant="outline">{selectedTemplate.steps.length} pași</Badge>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                  Anulează
                </Button>
                <Button onClick={handleCreateFromTemplate} disabled={isCreating}>
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Creează Workflow
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
