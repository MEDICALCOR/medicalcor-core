import type { LeadClassification, LeadSource } from '@medicalcor/types';

/**
 * Detailed patient data for patient profile views
 */
export interface PatientDetailData {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  lifecycleStage?: string;
  leadScore?: number;
  classification: LeadClassification;
  source: LeadSource;
  procedureInterest?: string[];
  language?: string;
  createdAt: string;
  updatedAt: string;
  hubspotContactId: string;
}

/**
 * Timeline event for patient activity history
 */
export interface PatientTimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}
