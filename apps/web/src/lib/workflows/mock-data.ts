'use client';

import type { Workflow, WorkflowTemplate, TriggerType, ActionType } from './types';

export const triggerLabels: Record<TriggerType, string> = {
  new_lead: 'Lead Nou',
  appointment_scheduled: 'Programare Creată',
  appointment_completed: 'Programare Finalizată',
  no_response: 'Fără Răspuns',
  message_received: 'Mesaj Primit',
  tag_added: 'Tag Adăugat',
  status_changed: 'Status Schimbat',
};

export const triggerDescriptions: Record<TriggerType, string> = {
  new_lead: 'Când un lead nou este creat în sistem',
  appointment_scheduled: 'Când o programare nouă este confirmată',
  appointment_completed: 'Când o consultație este finalizată',
  no_response: 'Când pacientul nu răspunde într-un interval de timp',
  message_received: 'Când se primește un mesaj de la pacient',
  tag_added: 'Când un tag specific este adăugat',
  status_changed: 'Când statusul pacientului se schimbă',
};

export const actionLabels: Record<ActionType, string> = {
  send_whatsapp: 'Trimite WhatsApp',
  send_sms: 'Trimite SMS',
  send_email: 'Trimite Email',
  add_tag: 'Adaugă Tag',
  remove_tag: 'Șterge Tag',
  change_status: 'Schimbă Status',
  assign_to: 'Atribuie către',
  create_task: 'Creează Task',
  wait: 'Așteaptă',
};

export const mockWorkflows: Workflow[] = [
  {
    id: 'wf-1',
    name: 'Bun venit Lead Nou',
    description: 'Trimite mesaj de bun venit automat la lead-uri noi',
    trigger: { id: 't1', type: 'new_lead' },
    steps: [
      {
        id: 's1',
        type: 'action',
        action: {
          id: 'a1',
          type: 'send_whatsapp',
          config: {
            template: 'welcome',
            message: 'Bună ziua! Mulțumim pentru interes...',
          },
        },
      },
      {
        id: 's2',
        type: 'delay',
        delay: { value: 1, unit: 'hours' },
      },
      {
        id: 's3',
        type: 'action',
        action: {
          id: 'a2',
          type: 'add_tag',
          config: { tag: 'contacted' },
        },
      },
    ],
    isActive: true,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-02-01'),
    executionCount: 234,
    lastExecutedAt: new Date('2024-02-20'),
  },
  {
    id: 'wf-2',
    name: 'Follow-up Post Consultație',
    description: 'Trimite mesaj de follow-up după consultație',
    trigger: { id: 't2', type: 'appointment_completed' },
    steps: [
      {
        id: 's1',
        type: 'delay',
        delay: { value: 24, unit: 'hours' },
      },
      {
        id: 's2',
        type: 'action',
        action: {
          id: 'a1',
          type: 'send_whatsapp',
          config: {
            template: 'followup',
            message: 'Cum vă simțiți după consultație?',
          },
        },
      },
      {
        id: 's3',
        type: 'action',
        action: {
          id: 'a2',
          type: 'create_task',
          config: {
            title: 'Verificare satisfacție pacient',
            dueIn: { value: 2, unit: 'days' },
          },
        },
      },
    ],
    isActive: true,
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-25'),
    executionCount: 89,
    lastExecutedAt: new Date('2024-02-19'),
  },
  {
    id: 'wf-3',
    name: 'Reactivare Lead Inactiv',
    description: 'Recontactează lead-uri care nu au răspuns',
    trigger: { id: 't3', type: 'no_response', config: { afterDays: 3 } },
    steps: [
      {
        id: 's1',
        type: 'action',
        action: {
          id: 'a1',
          type: 'send_sms',
          config: { message: 'Încă vă putem ajuta?' },
        },
      },
      {
        id: 's2',
        type: 'delay',
        delay: { value: 2, unit: 'days' },
      },
      {
        id: 's3',
        type: 'condition',
        condition: {
          conditions: [{ id: 'c1', field: 'hasReplied', operator: 'equals', value: false }],
          logic: 'and',
          trueBranch: [
            {
              id: 's4',
              type: 'action',
              action: {
                id: 'a2',
                type: 'add_tag',
                config: { tag: 'unresponsive' },
              },
            },
          ],
        },
      },
    ],
    isActive: false,
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-10'),
    executionCount: 45,
  },
  {
    id: 'wf-4',
    name: 'Reminder Programare',
    description: 'Trimite reminder înainte de programare',
    trigger: { id: 't4', type: 'appointment_scheduled' },
    steps: [
      {
        id: 's1',
        type: 'action',
        action: {
          id: 'a1',
          type: 'send_whatsapp',
          config: {
            template: 'appointment_confirmation',
            message: 'Programarea dvs. a fost confirmată.',
          },
          delay: { value: 0, unit: 'minutes' },
        },
      },
      {
        id: 's2',
        type: 'action',
        action: {
          id: 'a2',
          type: 'send_whatsapp',
          config: {
            template: 'reminder_24h',
            message: 'Reminder: Mâine aveți programare.',
          },
          delay: { value: 24, unit: 'hours' },
        },
      },
    ],
    isActive: true,
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-02-15'),
    executionCount: 567,
    lastExecutedAt: new Date('2024-02-21'),
  },
];

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Bun venit Lead Nou',
    description: 'Mesaj automat de bun venit pentru lead-uri noi',
    category: 'Lead Management',
    trigger: { id: 't1', type: 'new_lead' },
    steps: [
      {
        id: 's1',
        type: 'action',
        action: {
          id: 'a1',
          type: 'send_whatsapp',
          config: { template: 'welcome' },
        },
      },
    ],
  },
  {
    id: 'tpl-2',
    name: 'Follow-up Consultație',
    description: 'Verificare satisfacție după consultație',
    category: 'Patient Care',
    trigger: { id: 't2', type: 'appointment_completed' },
    steps: [
      {
        id: 's1',
        type: 'delay',
        delay: { value: 24, unit: 'hours' },
      },
      {
        id: 's2',
        type: 'action',
        action: {
          id: 'a1',
          type: 'send_whatsapp',
          config: { template: 'followup' },
        },
      },
    ],
  },
  {
    id: 'tpl-3',
    name: 'Reactivare Lead',
    description: 'Recontactare lead-uri inactive',
    category: 'Lead Management',
    trigger: { id: 't3', type: 'no_response' },
    steps: [
      {
        id: 's1',
        type: 'action',
        action: {
          id: 'a1',
          type: 'send_sms',
          config: { template: 'reactivation' },
        },
      },
    ],
  },
  {
    id: 'tpl-4',
    name: 'Reminder Programare',
    description: 'Reminder automat înainte de programare',
    category: 'Appointments',
    trigger: { id: 't4', type: 'appointment_scheduled' },
    steps: [
      {
        id: 's1',
        type: 'action',
        action: {
          id: 'a1',
          type: 'send_whatsapp',
          config: { template: 'reminder' },
          delay: { value: 24, unit: 'hours' },
        },
      },
    ],
  },
];
