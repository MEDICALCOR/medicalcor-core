'use client';

import type { CommandGroup } from './types';

export const navigationCommands: CommandGroup = {
  id: 'navigation',
  label: 'Navigare',
  commands: [
    {
      id: 'nav-dashboard',
      type: 'navigation',
      label: 'Dashboard',
      description: 'Vezi tabloul de bord principal',
      icon: 'LayoutDashboard',
      href: '/',
      keywords: ['home', 'principal', 'acasă'],
    },
    {
      id: 'nav-triage',
      type: 'navigation',
      label: 'Triage',
      description: 'Gestionează cazurile de triage',
      icon: 'Activity',
      href: '/triage',
      keywords: ['urgente', 'prioritate', 'evaluare'],
    },
    {
      id: 'nav-patients',
      type: 'navigation',
      label: 'Pacienți',
      description: 'Lista pacienților',
      icon: 'Users',
      href: '/patients',
      keywords: ['pacienti', 'clienti', 'persoane'],
    },
    {
      id: 'nav-calendar',
      type: 'navigation',
      label: 'Calendar',
      description: 'Programări și evenimente',
      icon: 'Calendar',
      href: '/calendar',
      keywords: ['programari', 'evenimente', 'agenda'],
    },
    {
      id: 'nav-messages',
      type: 'navigation',
      label: 'Mesaje',
      description: 'Conversații WhatsApp/SMS',
      icon: 'MessageSquare',
      href: '/messages',
      keywords: ['chat', 'conversatii', 'whatsapp', 'sms'],
    },
    {
      id: 'nav-analytics',
      type: 'navigation',
      label: 'Analytics',
      description: 'Rapoarte și statistici',
      icon: 'BarChart3',
      href: '/analytics',
      keywords: ['rapoarte', 'statistici', 'grafice'],
    },
    {
      id: 'nav-settings',
      type: 'navigation',
      label: 'Setări',
      description: 'Configurări aplicație',
      icon: 'Settings',
      href: '/settings',
      keywords: ['configurari', 'optiuni', 'preferinte'],
    },
  ],
};

export const actionCommands: CommandGroup = {
  id: 'actions',
  label: 'Acțiuni',
  commands: [
    {
      id: 'action-new-patient',
      type: 'action',
      label: 'Pacient Nou',
      description: 'Adaugă un pacient nou',
      icon: 'UserPlus',
      keywords: ['adauga', 'creaza', 'nou'],
    },
    {
      id: 'action-new-appointment',
      type: 'action',
      label: 'Programare Nouă',
      description: 'Creează o programare nouă',
      icon: 'CalendarPlus',
      keywords: ['adauga', 'programare', 'consultatie'],
    },
    {
      id: 'action-new-message',
      type: 'action',
      label: 'Mesaj Nou',
      description: 'Trimite un mesaj nou',
      icon: 'Send',
      keywords: ['trimite', 'scrie', 'mesaj'],
    },
    {
      id: 'action-export',
      type: 'action',
      label: 'Exportă Date',
      description: 'Exportă raport în CSV/Excel',
      icon: 'Download',
      keywords: ['descarca', 'export', 'csv', 'excel'],
    },
  ],
};

// Mock patients for search
export const mockPatients = [
  { id: 'p1', name: 'Elena Popescu', phone: '+40 721 123 456' },
  { id: 'p2', name: 'Ion Marinescu', phone: '+40 722 234 567' },
  { id: 'p3', name: 'Maria Dumitrescu', phone: '+40 723 345 678' },
  { id: 'p4', name: 'Alexandru Ionescu', phone: '+40 724 456 789' },
  { id: 'p5', name: 'Ana Gheorghiu', phone: '+40 725 567 890' },
];

export const allCommandGroups: CommandGroup[] = [navigationCommands, actionCommands];
