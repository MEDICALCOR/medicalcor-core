/**
 * HubSpot Context Provider for RAG
 *
 * Fetches real patient data from HubSpot CRM and formats it
 * for injection into the RAG pipeline. This enables AI to
 * have accurate, up-to-date patient context for:
 * - Lead scoring
 * - Reply generation
 * - Patient summary
 * - Procedure recommendations
 */

import { z } from 'zod';

/**
 * HubSpot Contact interface for RAG context
 */
export interface HubSpotContactForRAG {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    lifecyclestage?: string;
    lead_status?: string;
    lead_score?: string;
    lead_source?: string;
    hs_language?: string;
    procedure_interest?: string;
    budget_range?: string;
    urgency_level?: string;
    consent_marketing?: string;
    consent_medical_data?: string;
    // Retention & Loyalty
    retention_score?: string;
    churn_risk?: string;
    nps_score?: string;
    nps_category?: string;
    nps_feedback?: string;
    loyalty_segment?: string;
    lifetime_value?: string;
    days_inactive?: string;
    canceled_appointments?: string;
    follow_up_priority?: string;
    last_appointment_date?: string;
    last_treatment_date?: string;
    total_treatments?: string;
    active_discounts?: string;
    // UTM tracking
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * HubSpot client interface for dependency injection
 */
export interface IHubSpotClient {
  getContact(contactId: string): Promise<HubSpotContactForRAG>;
  searchContactsByPhone(phone: string): Promise<HubSpotContactForRAG[]>;
}

/**
 * Patient context formatted for RAG injection
 */
export interface PatientContext {
  /** Patient identification */
  patientId: string;
  name: string;
  phone: string;
  email?: string | undefined;

  /** Lead information */
  leadStatus: string;
  leadScore: number;
  leadSource?: string | undefined;
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' | 'UNKNOWN';

  /** Medical interest */
  procedureInterest?: string | undefined;
  budgetRange?: string | undefined;
  urgencyLevel?: string | undefined;

  /** Retention metrics */
  retentionScore?: number | undefined;
  churnRisk?: 'SCAZUT' | 'MEDIU' | 'RIDICAT' | 'FOARTE_RIDICAT' | undefined;
  npsScore?: number | undefined;
  npsCategory?: 'PROMOTOR' | 'PASIV' | 'DETRACTOR' | undefined;
  loyaltySegment?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | undefined;
  lifetimeValue?: number | undefined;

  /** Activity */
  daysInactive?: number | undefined;
  canceledAppointments?: number | undefined;
  totalTreatments?: number | undefined;
  lastAppointmentDate?: string | undefined;
  lastTreatmentDate?: string | undefined;

  /** Consent */
  hasMarketingConsent: boolean;
  hasMedicalDataConsent: boolean;

  /** Language */
  language: 'ro' | 'en' | 'de';

  /** Active offers */
  activeDiscounts?: string[] | undefined;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/**
 * RAG-formatted patient context string
 */
export interface RAGPatientContext {
  /** Formatted context string for prompt injection */
  contextString: string;
  /** Structured patient data */
  patient: PatientContext;
  /** Source metadata */
  source: 'hubspot';
  /** Fetch timestamp */
  fetchedAt: Date;
  /** Cache TTL hint in seconds */
  cacheTTL: number;
}

/**
 * Configuration for HubSpot context provider
 */
export const HubSpotContextConfigSchema = z.object({
  /** Enable context fetching */
  enabled: z.boolean().default(true),
  /** Cache TTL in seconds */
  cacheTTLSeconds: z.number().int().min(0).default(300),
  /** Include retention metrics in context */
  includeRetentionMetrics: z.boolean().default(true),
  /** Include NPS data in context */
  includeNPSData: z.boolean().default(true),
  /** Include loyalty segment in context */
  includeLoyaltySegment: z.boolean().default(true),
  /** Include active discounts in context */
  includeActiveDiscounts: z.boolean().default(true),
  /** Maximum context length in characters */
  maxContextLength: z.number().int().min(100).max(10000).default(2000),
});

export type HubSpotContextConfig = z.infer<typeof HubSpotContextConfigSchema>;

/**
 * HubSpot Context Provider
 *
 * Fetches and formats patient data from HubSpot for RAG injection
 */
export class HubSpotContextProvider {
  private hubspotClient: IHubSpotClient;
  private config: HubSpotContextConfig;

  constructor(hubspotClient: IHubSpotClient, config: Partial<HubSpotContextConfig> = {}) {
    this.hubspotClient = hubspotClient;
    this.config = HubSpotContextConfigSchema.parse(config);
  }

  /**
   * Get patient context by HubSpot contact ID
   */
  async getContextByContactId(contactId: string): Promise<RAGPatientContext | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const contact = await this.hubspotClient.getContact(contactId);
      return this.formatPatientContext(contact);
    } catch {
      // Failed to fetch contact - return null for graceful degradation
      return null;
    }
  }

  /**
   * Get patient context by phone number
   */
  async getContextByPhone(phone: string): Promise<RAGPatientContext | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const contacts = await this.hubspotClient.searchContactsByPhone(phone);
      if (contacts.length === 0) {
        return null;
      }

      // Use the first (oldest) contact if multiple found
      const contact = contacts.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )[0];

      if (!contact) {
        return null;
      }

      return this.formatPatientContext(contact);
    } catch {
      // Failed to search contacts - return null for graceful degradation
      return null;
    }
  }

  /**
   * Format HubSpot contact into RAG-ready patient context
   */
  private formatPatientContext(contact: HubSpotContactForRAG): RAGPatientContext {
    const props = contact.properties;

    // Parse patient context
    const patient: PatientContext = {
      patientId: contact.id,
      name: [props.firstname, props.lastname].filter(Boolean).join(' ') || 'Unknown',
      phone: props.phone ?? '',
      email: props.email,

      // Lead information
      leadStatus: props.lead_status ?? 'new',
      leadScore: parseInt(props.lead_score ?? '0', 10),
      leadSource: props.lead_source,
      classification: this.mapLeadScoreToClassification(parseInt(props.lead_score ?? '0', 10)),

      // Medical interest
      procedureInterest: props.procedure_interest,
      budgetRange: props.budget_range,
      urgencyLevel: props.urgency_level,

      // Retention metrics
      ...(this.config.includeRetentionMetrics && {
        retentionScore: props.retention_score ? parseInt(props.retention_score, 10) : undefined,
        churnRisk: props.churn_risk as PatientContext['churnRisk'],
        daysInactive: props.days_inactive ? parseInt(props.days_inactive, 10) : undefined,
        canceledAppointments: props.canceled_appointments
          ? parseInt(props.canceled_appointments, 10)
          : undefined,
        totalTreatments: props.total_treatments ? parseInt(props.total_treatments, 10) : undefined,
        lastAppointmentDate: props.last_appointment_date,
        lastTreatmentDate: props.last_treatment_date,
      }),

      // NPS data
      ...(this.config.includeNPSData && {
        npsScore: props.nps_score ? parseInt(props.nps_score, 10) : undefined,
        npsCategory: props.nps_category as PatientContext['npsCategory'],
      }),

      // Loyalty segment
      ...(this.config.includeLoyaltySegment && {
        loyaltySegment: props.loyalty_segment as PatientContext['loyaltySegment'],
        lifetimeValue: props.lifetime_value ? parseInt(props.lifetime_value, 10) : undefined,
      }),

      // Consent
      hasMarketingConsent: props.consent_marketing === 'true',
      hasMedicalDataConsent: props.consent_medical_data === 'true',

      // Language
      language: props.hs_language ? (props.hs_language as PatientContext['language']) : 'ro',

      // Active discounts
      ...(this.config.includeActiveDiscounts &&
        props.active_discounts && {
          activeDiscounts: props.active_discounts.split(';').filter(Boolean),
        }),

      // Timestamps
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };

    // Build context string
    const contextString = this.buildContextString(patient);

    return {
      contextString,
      patient,
      source: 'hubspot',
      fetchedAt: new Date(),
      cacheTTL: this.config.cacheTTLSeconds,
    };
  }

  /**
   * Map lead score (1-5) to classification
   */
  private mapLeadScoreToClassification(
    score: number
  ): 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' | 'UNKNOWN' {
    if (score >= 4) return 'HOT';
    if (score === 3) return 'WARM';
    if (score === 2) return 'COLD';
    if (score === 1) return 'UNQUALIFIED';
    return 'UNKNOWN';
  }

  /**
   * Build formatted context string for RAG injection
   */
  private buildContextString(patient: PatientContext): string {
    const sections: string[] = [];

    // Patient identification
    sections.push(`## Patient Profile: ${patient.name}`);
    sections.push(`- ID: ${patient.patientId}`);
    sections.push(`- Phone: ${patient.phone}`);
    if (patient.email) sections.push(`- Email: ${patient.email}`);
    sections.push(`- Language: ${patient.language.toUpperCase()}`);

    // Lead status
    sections.push('');
    sections.push('## Lead Status');
    sections.push(`- Classification: ${patient.classification}`);
    sections.push(`- Score: ${patient.leadScore}/5`);
    sections.push(`- Status: ${patient.leadStatus}`);
    if (patient.leadSource) sections.push(`- Source: ${patient.leadSource}`);

    // Medical interest
    if (patient.procedureInterest || patient.budgetRange || patient.urgencyLevel) {
      sections.push('');
      sections.push('## Medical Interest');
      if (patient.procedureInterest) sections.push(`- Procedure: ${patient.procedureInterest}`);
      if (patient.budgetRange) sections.push(`- Budget: ${patient.budgetRange}`);
      if (patient.urgencyLevel) sections.push(`- Urgency: ${patient.urgencyLevel}`);
    }

    // Retention & loyalty (if enabled and data exists)
    if (
      this.config.includeRetentionMetrics &&
      (patient.retentionScore !== undefined || patient.churnRisk)
    ) {
      sections.push('');
      sections.push('## Retention Metrics');
      if (patient.retentionScore !== undefined)
        sections.push(`- Retention Score: ${patient.retentionScore}/100`);
      if (patient.churnRisk) sections.push(`- Churn Risk: ${patient.churnRisk}`);
      if (patient.daysInactive !== undefined)
        sections.push(`- Days Inactive: ${patient.daysInactive}`);
      if (patient.canceledAppointments !== undefined)
        sections.push(`- Canceled Appointments: ${patient.canceledAppointments}`);
    }

    // NPS (if enabled and data exists)
    if (this.config.includeNPSData && patient.npsScore !== undefined) {
      sections.push('');
      sections.push('## NPS Score');
      sections.push(`- Score: ${patient.npsScore}/10`);
      if (patient.npsCategory) sections.push(`- Category: ${patient.npsCategory}`);
    }

    // Loyalty (if enabled and data exists)
    if (this.config.includeLoyaltySegment && patient.loyaltySegment) {
      sections.push('');
      sections.push('## Loyalty');
      sections.push(`- Segment: ${patient.loyaltySegment}`);
      if (patient.lifetimeValue !== undefined)
        sections.push(`- Lifetime Value: ${patient.lifetimeValue} RON`);
      if (patient.totalTreatments !== undefined)
        sections.push(`- Total Treatments: ${patient.totalTreatments}`);
    }

    // Active discounts (if enabled and data exists)
    if (
      this.config.includeActiveDiscounts &&
      patient.activeDiscounts &&
      patient.activeDiscounts.length > 0
    ) {
      sections.push('');
      sections.push('## Active Offers');
      patient.activeDiscounts.forEach((discount) => {
        sections.push(`- ${discount}`);
      });
    }

    // Consent status
    sections.push('');
    sections.push('## Consent');
    sections.push(`- Marketing: ${patient.hasMarketingConsent ? 'Yes' : 'No'}`);
    sections.push(`- Medical Data: ${patient.hasMedicalDataConsent ? 'Yes' : 'No'}`);

    // Activity history
    if (patient.lastAppointmentDate || patient.lastTreatmentDate) {
      sections.push('');
      sections.push('## Recent Activity');
      if (patient.lastAppointmentDate)
        sections.push(`- Last Appointment: ${patient.lastAppointmentDate}`);
      if (patient.lastTreatmentDate)
        sections.push(`- Last Treatment: ${patient.lastTreatmentDate}`);
    }

    // Build and truncate if needed
    let contextString = sections.join('\n');
    if (contextString.length > this.config.maxContextLength) {
      contextString = contextString.substring(0, this.config.maxContextLength - 3) + '...';
    }

    return contextString;
  }

  /**
   * Get configuration
   */
  getConfig(): HubSpotContextConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<HubSpotContextConfig>): void {
    this.config = HubSpotContextConfigSchema.parse({ ...this.config, ...updates });
  }
}

/**
 * Factory function to create HubSpot context provider
 */
export function createHubSpotContextProvider(
  hubspotClient: IHubSpotClient,
  config?: Partial<HubSpotContextConfig>
): HubSpotContextProvider {
  return new HubSpotContextProvider(hubspotClient, config);
}
