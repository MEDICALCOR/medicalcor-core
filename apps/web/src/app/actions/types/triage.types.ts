import type { LeadSource } from '@medicalcor/types';

/**
 * Triage Lead representation for the Kanban board
 */
export interface TriageLead {
  id: string;
  phone: string;
  source: LeadSource;
  time: string;
  message?: string;
  score?: number;
  confidence?: number;
  reasoning?: string;
  procedureInterest?: string[];
  appointment?: string;
}

/**
 * Triage Column for Kanban board organization
 */
export interface TriageColumn {
  id: 'new' | 'hot' | 'warm' | 'cold' | 'scheduled';
  title: string;
  leads: TriageLead[];
}
