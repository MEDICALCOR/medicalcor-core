'use client';

export type TriggerType =
  | 'new_lead'
  | 'appointment_scheduled'
  | 'appointment_completed'
  | 'no_response'
  | 'message_received'
  | 'tag_added'
  | 'status_changed';

export type ActionType =
  | 'send_whatsapp'
  | 'send_sms'
  | 'send_email'
  | 'add_tag'
  | 'remove_tag'
  | 'change_status'
  | 'assign_to'
  | 'create_task'
  | 'wait';

export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';

export interface WorkflowTrigger {
  id: string;
  type: TriggerType;
  config?: Record<string, unknown>;
}

export interface WorkflowCondition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: string | number | boolean;
}

export interface WorkflowAction {
  id: string;
  type: ActionType;
  config: Record<string, unknown>;
  delay?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
}

export interface WorkflowStep {
  id: string;
  type: 'action' | 'condition' | 'delay';
  action?: WorkflowAction;
  condition?: {
    conditions: WorkflowCondition[];
    logic: 'and' | 'or';
    trueBranch?: WorkflowStep[];
    falseBranch?: WorkflowStep[];
  };
  delay?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days';
  };
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  executionCount: number;
  lastExecutedAt?: Date;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}
