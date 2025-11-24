import type { LeadScore, LeadChannel } from '@medicalcor/types';

/**
 * Dental Triage Service
 * Routes leads and determines priority scheduling based on patient needs
 * NOTE: This is NOT an emergency clinic. For life-threatening emergencies, patients should call 112.
 */

export interface TriageResult {
  urgencyLevel: 'high_priority' | 'high' | 'normal' | 'low';
  routingRecommendation: 'next_available_slot' | 'same_day' | 'next_business_day' | 'nurture_sequence';
  medicalFlags: string[];
  suggestedOwner?: string;
  prioritySchedulingRequested: boolean;
  notes: string;
}

export interface TriageInput {
  leadScore: LeadScore;
  channel: LeadChannel;
  messageContent: string;
  procedureInterest?: string[];
  hasExistingRelationship: boolean;
  previousAppointments?: number;
  lastContactDays?: number;
}

export interface TriageConfig {
  priorityKeywords: string[];
  vipPhones?: string[];
  defaultOwners: Record<string, string>;
}

const DEFAULT_CONFIG: TriageConfig = {
  // Keywords indicating patient discomfort requiring priority scheduling
  // NOTE: These are NOT medical emergencies - they indicate high purchase intent
  priorityKeywords: [
    'durere',
    'durere puternica',
    'umflatura',
    'urgent',
    'infectie',
    'abces',
    'febra',
    'nu pot manca',
    'nu pot dormi',
  ],
  defaultOwners: {
    implants: 'dr-implant-team',
    general: 'reception-team',
    priority: 'scheduling-team',
  },
};

export class TriageService {
  private config: TriageConfig;

  constructor(config?: Partial<TriageConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Perform triage assessment on a lead
   * Determines priority scheduling based on patient needs and purchase intent
   */
  assess(input: TriageInput): TriageResult {
    const { leadScore, channel, messageContent, procedureInterest, hasExistingRelationship, previousAppointments, lastContactDays } = input;

    const lowerContent = messageContent.toLowerCase();
    const medicalFlags: string[] = [];
    let urgencyLevel: TriageResult['urgencyLevel'] = 'normal';
    let prioritySchedulingRequested = false;

    // Check for priority keywords (pain/discomfort indicating high purchase intent)
    const prioritySymptoms = this.config.priorityKeywords.filter(k => lowerContent.includes(k));
    if (prioritySymptoms.length > 0) {
      urgencyLevel = 'high_priority';
      prioritySchedulingRequested = true;
      medicalFlags.push('priority_scheduling_requested');
      medicalFlags.push(...prioritySymptoms.map(s => `symptom:${s.replace(/\s+/g, '_')}`));
    }

    // Score-based urgency adjustment
    if (leadScore === 'HOT' && urgencyLevel === 'normal') {
      urgencyLevel = 'high';
    }

    // Existing patient priority
    if (hasExistingRelationship && previousAppointments && previousAppointments > 0) {
      medicalFlags.push('existing_patient');
      if (urgencyLevel === 'normal') {
        urgencyLevel = 'high';
      }
    }

    // Re-engagement priority
    if (lastContactDays && lastContactDays > 180) {
      medicalFlags.push('re_engagement_opportunity');
    }

    // Determine routing
    const routingRecommendation = this.determineRouting(urgencyLevel, leadScore, channel);

    // Determine owner
    const suggestedOwner = this.determineSuggestedOwner(procedureInterest, urgencyLevel);

    // Build notes (includes safety disclaimer)
    const notes = this.buildTriageNotes(input, medicalFlags, urgencyLevel);

    return {
      urgencyLevel,
      routingRecommendation,
      medicalFlags,
      suggestedOwner,
      prioritySchedulingRequested,
      notes,
    };
  }

  /**
   * Determine routing based on urgency and score
   * Priority scheduling routes to next available slot during business hours
   */
  private determineRouting(
    urgencyLevel: TriageResult['urgencyLevel'],
    leadScore: LeadScore,
    channel: LeadChannel
  ): TriageResult['routingRecommendation'] {
    // High priority (pain/discomfort) gets next available slot during business hours
    if (urgencyLevel === 'high_priority') {
      return 'next_available_slot';
    }

    if (urgencyLevel === 'high' || leadScore === 'HOT') {
      return 'same_day';
    }

    if (leadScore === 'WARM' || channel === 'voice') {
      return 'next_business_day';
    }

    return 'nurture_sequence';
  }

  /**
   * Determine suggested owner based on procedure interest
   */
  private determineSuggestedOwner(
    procedureInterest?: string[],
    urgencyLevel?: TriageResult['urgencyLevel']
  ): string {
    // Priority scheduling goes to scheduling team for fast appointment booking
    if (urgencyLevel === 'high_priority') {
      return this.config.defaultOwners['priority'] ?? 'scheduling-team';
    }

    if (procedureInterest?.some(p => ['implant', 'all-on-x', 'All-on-X'].includes(p))) {
      return this.config.defaultOwners['implants'] ?? 'dr-implant-team';
    }

    return this.config.defaultOwners['general'] ?? 'reception-team';
  }

  /**
   * Build triage notes for CRM
   * Includes safety disclaimer for priority cases
   */
  private buildTriageNotes(
    input: TriageInput,
    medicalFlags: string[],
    urgencyLevel: TriageResult['urgencyLevel']
  ): string {
    const parts: string[] = [];

    parts.push(`Priority: ${urgencyLevel.toUpperCase()}`);
    parts.push(`Lead Score: ${input.leadScore}`);
    parts.push(`Channel: ${input.channel}`);

    if (input.procedureInterest?.length) {
      parts.push(`Procedures: ${input.procedureInterest.join(', ')}`);
    }

    if (medicalFlags.length > 0) {
      parts.push(`Flags: ${medicalFlags.join(', ')}`);
    }

    if (input.hasExistingRelationship) {
      parts.push(`Existing patient with ${input.previousAppointments ?? 0} previous appointments`);
    }

    // Add safety disclaimer for priority cases
    if (urgencyLevel === 'high_priority') {
      parts.push(`Note: Patient reported discomfort. Schedule priority appointment during business hours. Reminder: For life-threatening emergencies, advise calling 112.`);
    }

    return parts.join(' | ');
  }

  /**
   * Check if a phone is VIP
   */
  isVIP(phone: string): boolean {
    return this.config.vipPhones?.includes(phone) ?? false;
  }

  /**
   * Get notification contacts for priority cases
   * NOTE: These are for scheduling coordination, not medical escalation
   */
  getNotificationContacts(urgencyLevel: TriageResult['urgencyLevel']): string[] {
    if (urgencyLevel === 'high_priority') {
      return ['scheduling-team', 'reception-lead'];
    }
    if (urgencyLevel === 'high') {
      return ['reception-team'];
    }
    return [];
  }
}

/**
 * Create a configured triage service
 */
export function createTriageService(config?: Partial<TriageConfig>): TriageService {
  return new TriageService(config);
}
