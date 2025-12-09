/**
 * Types for LTV orchestration workflow
 */

/**
 * Raw LTV data from database
 */
export interface LTVDataRow {
  total_cases: string;
  completed_cases: string;
  total_case_value: string;
  total_paid: string;
  total_outstanding: string;
  avg_case_value: string;
  first_case_date: Date | null;
  last_case_date: Date | null;
}

/**
 * Payment behavior data from database
 */
export interface PaymentBehaviorRow {
  on_time_rate: string;
  plans_used: string;
  avg_days: string | null;
  missed: string;
}

/**
 * Procedure interest data from database
 */
export interface ProcedureInterestRow {
  all_on_x: boolean;
  implant: boolean;
  full_mouth: boolean;
  cosmetic: boolean;
  high_value_completed: string;
}

/**
 * Lead email/phone data
 */
export interface LeadContactData {
  email: string | null;
  phone: string | null;
}

/**
 * HubSpot contact properties
 */
export interface HubSpotContactProperties {
  total_appointments?: string;
  kept_appointments?: string;
  canceled_appointments?: string;
  no_shows?: string;
  last_contact_date?: string;
  referrals_made?: string;
  nps_score?: string;
  retention_score?: string;
  [key: string]: string | undefined;
}

/**
 * pLTV calculation context
 */
export interface PLTVContext {
  leadId: string;
  clinicId: string;
  correlationId: string;
  reason?: string;
}
