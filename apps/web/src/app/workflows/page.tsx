'use client';

import { useState, useCallback } from 'react';
import { Plus, Zap, LayoutTemplate, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowList, WorkflowTemplates } from '@/components/workflows';
import {
  mockWorkflows,
  workflowTemplates,
  type Workflow,
  type WorkflowTemplate,
} from '@/lib/workflows';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>(mockWorkflows);
  const [activeTab, setActiveTab] = useState('workflows');
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);

  const handleToggle = useCallback((id: string, isActive: boolean) => {
    setWorkflows((prev) => prev.map((wf) => (wf.id === id ? { ...wf, isActive } : wf)));
  }, []);

  const handleEdit = useCallback((_workflow: Workflow) => {
    // In a real app, this would open an editor
    // For now, this is a placeholder
  }, []);

  const handleDelete = useCallback((id: string) => {
    setWorkflows((prev) => prev.filter((wf) => wf.id !== id));
  }, []);

  const handleDuplicate = useCallback((workflow: Workflow) => {
    const duplicated: Workflow = {
      ...workflow,
      id: `wf-${Date.now()}`,
      name: `${workflow.name} (Copie)`,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      executionCount: 0,
      lastExecutedAt: undefined,
    };
    setWorkflows((prev) => [duplicated, ...prev]);
  }, []);

  const handleUseTemplate = useCallback((template: WorkflowTemplate) => {
    setSelectedTemplate(template);
  }, []);

  const handleCreateFromTemplate = useCallback(() => {
    if (!selectedTemplate) return;

    const newWorkflow: Workflow = {
      id: `wf-${Date.now()}`,
      name: selectedTemplate.name,
      description: selectedTemplate.description,
      trigger: { ...selectedTemplate.trigger },
      steps: [...selectedTemplate.steps],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      executionCount: 0,
    };

    setWorkflows((prev) => [newWorkflow, ...prev]);
    setSelectedTemplate(null);
    setActiveTab('workflows');
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
          <WorkflowList
            workflows={workflows}
            onToggle={handleToggle}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
          />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <WorkflowTemplates templates={workflowTemplates} onUseTemplate={handleUseTemplate} />
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
                <Button onClick={handleCreateFromTemplate}>
                  <Plus className="h-4 w-4 mr-2" />
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
