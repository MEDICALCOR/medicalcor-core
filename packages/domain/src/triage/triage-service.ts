import type { LeadScore, LeadChannel } from '@medicalcor/types';

/**
 * Medical Triage Service
 * Routes leads and determines urgency based on medical indicators
 */

export interface TriageResult {
  urgencyLevel: 'critical' | 'high' | 'normal' | 'low';
  routingRecommendation: 'immediate_callback' | 'same_day' | 'next_business_day' | 'nurture_sequence';
  medicalFlags: string[];
  suggestedOwner?: string;
  escalationRequired: boolean;
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
  criticalKeywords: string[];
  medicalEmergencyKeywords: string[];
  vipPhones?: string[];
  defaultOwners: Record<string, string>;
}

const DEFAULT_CONFIG: TriageConfig = {
  criticalKeywords: [
    'durere puternica',
    'umflatura',
    'sangerare',
    'infectie',
    'abces',
    'febra',
    'nu pot manca',
    'nu pot dormi',
  ],
  medicalEmergencyKeywords: [
    'accident',
    'cazut',
    'spart',
    'urgenta medicala',
    'nu respir bine',
  ],
  defaultOwners: {
    implants: 'dr-implant-team',
    general: 'reception-team',
    emergency: 'on-call-doctor',
  },
};

export class TriageService {
  private config: TriageConfig;

  constructor(config?: Partial<TriageConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Perform triage assessment on a lead
   */
  assess(input: TriageInput): TriageResult {
    const { leadScore, channel, messageContent, procedureInterest, hasExistingRelationship, previousAppointments, lastContactDays } = input;

    const lowerContent = messageContent.toLowerCase();
    const medicalFlags: string[] = [];
    let urgencyLevel: TriageResult['urgencyLevel'] = 'normal';
    let escalationRequired = false;

    // Check for medical emergency keywords
    const hasEmergency = this.config.medicalEmergencyKeywords.some(k => lowerContent.includes(k));
    if (hasEmergency) {
      urgencyLevel = 'critical';
      escalationRequired = true;
      medicalFlags.push('medical_emergency_detected');
    }

    // Check for critical symptoms
    const criticalSymptoms = this.config.criticalKeywords.filter(k => lowerContent.includes(k));
    if (criticalSymptoms.length > 0) {
      if (urgencyLevel !== 'critical') {
        urgencyLevel = 'high';
      }
      medicalFlags.push(...criticalSymptoms.map(s => `symptom:${s.replace(/\s+/g, '_')}`));
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

    // Build notes
    const notes = this.buildTriageNotes(input, medicalFlags, urgencyLevel);

    return {
      urgencyLevel,
      routingRecommendation,
      medicalFlags,
      suggestedOwner,
      escalationRequired,
      notes,
    };
  }

  /**
   * Determine routing based on urgency and score
   */
  private determineRouting(
    urgencyLevel: TriageResult['urgencyLevel'],
    leadScore: LeadScore,
    channel: LeadChannel
  ): TriageResult['routingRecommendation'] {
    if (urgencyLevel === 'critical') {
      return 'immediate_callback';
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
    if (urgencyLevel === 'critical') {
      return this.config.defaultOwners['emergency'] ?? 'on-call-doctor';
    }

    if (procedureInterest?.some(p => ['implant', 'all-on-x', 'All-on-X'].includes(p))) {
      return this.config.defaultOwners['implants'] ?? 'dr-implant-team';
    }

    return this.config.defaultOwners['general'] ?? 'reception-team';
  }

  /**
   * Build triage notes for CRM
   */
  private buildTriageNotes(
    input: TriageInput,
    medicalFlags: string[],
    urgencyLevel: TriageResult['urgencyLevel']
  ): string {
    const parts: string[] = [];

    parts.push(`Urgency: ${urgencyLevel.toUpperCase()}`);
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

    return parts.join(' | ');
  }

  /**
   * Check if a phone is VIP
   */
  isVIP(phone: string): boolean {
    return this.config.vipPhones?.includes(phone) ?? false;
  }

  /**
   * Get escalation contacts for urgent cases
   */
  getEscalationContacts(urgencyLevel: TriageResult['urgencyLevel']): string[] {
    if (urgencyLevel === 'critical') {
      return ['on-call-doctor', 'clinic-manager'];
    }
    if (urgencyLevel === 'high') {
      return ['shift-supervisor'];
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
